"""Catálogo de tarifas de proveedor (en pruebas, solo el encargado).

Las tarifas siguen viviendo en Google Sheets (las actualiza la tarea programada de cada proveedor).
La app las lee a través del Apps Script de casafonsomc@gmail.com (acción «hoja»), guarda una copia
y las ordena para navegar: proveedor → familia → medidas → ficha.

Por ahora solo Hierros y Aceros de Santander. Cada proveedor nuevo necesita su lector, porque
cada hoja tiene sus columnas.
"""
import json
import logging
import os
import re
import unicodedata
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.models.tarifa import TarifaCopia, TarifaPrecio
from app.services import isoltubex, mail_service

logger = logging.getLogger(__name__)

# Hojas de Google Sheets compartidas (como lector) con casafonsomc@gmail.com.
# El ID de una hoja no da acceso a nadie: sin permiso en Drive no se puede abrir.
TARIFAS = {
    "hierros": {
        "nombre": "Hierros y Aceros",
        "sub": "Santander",
        "proveedor": "Hierros y Aceros de Santander",
        "hoja": "1k8ieuvpdKcrSqJd_mRJtX7RJGTcaD8PzukdWNXy2AVo",
        "pestanas": ["TARIFA", "LOG"],
        # ALBARANES/HIERROS Y ACEROS DE SANTANDER: ahí guarda la gestoría los PDF de las facturas
        "carpeta_facturas": "11LF1VQRje_xHtrI8t_65iBwfVRchfanK",
    },
    "zabaleta": {
        "nombre": "Zabaleta",
        "sub": "Navarro Zabaleta · saneamiento, PVC y fontanería",
        "proveedor": "Navarro Zabaleta Asturias",
        "hoja": "1XK0ZOHSNxr6UwUyKGmRmYOzGkVoUACOvm-CLmMdZaWg",
        "pestanas": ["Tarifa", "Detalle facturas"],
        # NAVARRO ZABALETA (Drive de casafonsomc): PDF de las facturas, «Zabaleta_AAAA-MM-DD_nº.pdf»
        "carpeta_facturas": "1UZhkitUUjj0eAPbhywoQn2qMSvUYXUFu",
        "redondeo": "redondeado a 0,05 € (0,10 € desde 5 €)",
    },
    "isoltubex": {
        "nombre": "Isoltubex",
        "sub": "Multicapa, PEX, suelo radiante y latón",
        "proveedor": "Isoltubex",
        "hoja": "1JGwpDqDF0yHzQfytvrpH00B3p3ohjO-M7AsdZoodPuM",  # TARIFA_ISOLTUBEX_2026 (la buena; hay dos copias viejas de abril)
        "pestanas": isoltubex.PESTANAS,
        "redondeo": "terminación comercial (…,50 / …,95)",
        "en_pruebas": True,  # solo Andrés hasta que dé el visto bueno (api/tarifas.py)
    },
    "silva": {
        "nombre": "Mallas Silva Moreira",
        "sub": "Malla ganadera anudada y nudo fijo",
        "proveedor": "J. Silva Moreira & Irmãos (vía Representaciones Bernardo)",
        "hoja": "1oIoLlZT3tbgNSi-0tMEd21tPZKAgQWGaH3zPYbIdnRI",  # TARIFA_SILVA_MOREIRA_2026 (Mi unidad de Andrés)
        "pestanas": ["INICIO", "TARIFA"],
        "redondeo": "redondeado a 0,10 € (con IVA, a 0,05 €)",
        "en_pruebas": True,  # solo Andrés hasta que dé el visto bueno (api/tarifas.py)
    },
}

REFRESCO = timedelta(hours=3)          # se vuelve a leer si la copia tiene más de esto
REINTENTO_ERROR = timedelta(minutes=10)
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


# ── Utilidades de lectura ─────────────────────────────────────────────────
def normaliza(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normaliza(s)).strip("-")


def numero(v) -> Optional[float]:
    """«1.090,00 €», «5,940 kg/m», «9,5», «1490» → float. «—», «(M2)», vacío → None."""
    s = str(v or "").strip()
    if not s or s in ("—", "-", "–") or re.fullmatch(r"\(.*\)", s):  # «(M2)», «(UN)»: no es un número
        return None
    s = re.sub(r"[^\d,.\-]", "", s.replace("−", "-"))
    if not re.search(r"\d", s):
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(".") > 1 or re.search(r"\.\d{3}$", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def porcentaje(v) -> Optional[float]:
    s = str(v or "").strip().replace("−", "-").replace(",", ".")
    m = re.search(r"([+-]?\d+(?:\.\d+)?)\s*%", s)
    return float(m.group(1)) if m else None


def mes(v) -> Optional[str]:
    """«sep-26» tal cual; un número de serie de Excel (46047) → «ene-26»."""
    s = str(v or "").strip().lower()
    if re.fullmatch(r"[a-z]{3}-\d{2}", s) and s[:3] in MESES:
        return s
    if re.fullmatch(r"\d{5}", s):
        d = date(1899, 12, 30) + timedelta(days=int(s))
        return f"{MESES[d.month - 1]}-{d.year % 100:02d}"
    return None


def clave_mes(m: Optional[str]) -> tuple:
    """Orden de una fecha de la tarifa: «sep-26» o «2026-09-30»."""
    if not m:
        return (0, 0, 0)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", m):
        return (int(m[:4]), int(m[5:7]), int(m[8:]))
    return (2000 + int(m[4:]), MESES.index(m[:3]) + 1, 0)


def dia(v) -> Optional[str]:
    """«2026-09-30» tal cual; «30/09/2026» → «2026-09-30»; otra cosa → None."""
    s = str(v or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None


UD_VENTA = {"TN": "m", "HM": "m", "MT": "m", "M2": "m²", "UN": "ud", "KG": "kg"}
UD_COMPRA = {"TN": "t", "HM": "100 m", "MT": "m", "M2": "m²", "UN": "ud", "KG": "kg"}

# Siglas que se quedan en mayúsculas al poner bonitos los nombres
SIGLAS = {"ipn", "ipe", "heb", "upn", "iso", "din", "ral", "pl-33", "st-52", "df", "aisi-304", "inox.304"}


def bonito(s: str) -> str:
    """«TUBOS CUADRADOS NEGROS» → «Tubos cuadrados negros» (respetando IPN, UPN, ISO…)."""
    if str(s or "") != str(s or "").upper():  # ya viene escrito a mano («Evacuación PVC»): tal cual
        return str(s).strip()
    palabras = str(s or "").strip().lower().split()
    out = []
    for i, p in enumerate(palabras):
        if p in SIGLAS or p.rstrip(".") in SIGLAS:
            out.append(p.upper())
        else:
            out.append(p.capitalize() if i == 0 else p)
    return " ".join(out).replace(" galv.", " galv.").replace("Galv.", "Galv.")


# ── Medidas: cómo se agrupan los artículos de una familia ─────────────────
_DIM = re.compile(r"(?<![A-Za-z\-.\d])\d+(?:[.,/]\d+)*(?:\s*[xX]\s*\d+(?:[.,/]\d+)*)*(?![A-Za-z\d])")


def medida(desc: str) -> tuple[str, str, str]:
    """Separa la última medida de la descripción → (base, valor, unidad).
    «TUBO CUADRADO 50X50X4 MM» → («TUBO CUADRADO 50×50», «4», «mm»)
    «VIGA IPN 80 MM» → («VIGA IPN», «80», «mm»).  Sin medida → (desc, «», «»)."""
    d = re.sub(r"\s+", " ", desc.strip())
    ms = [m for m in _DIM.finditer(d) if re.search(r"\d", m.group())]
    if not ms:
        return d, "", ""
    m = ms[-1]
    antes, despues = d[:m.start()].rstrip(" (-"), d[m.end():].strip(" )")
    partes = re.split(r"\s*[xX]\s*", m.group())
    ud = ""
    if re.fullmatch(r"(?i)mm|m", despues):
        ud, despues = despues.lower(), ""
    antes = re.sub(r"(?i)\s+(de|del)$", "", antes)
    if len(partes) > 1:
        antes = f"{antes} {'×'.join(partes[:-1])}".strip()
    base = antes if not despues else f"{antes} · {despues}"
    return base.strip(), partes[-1], ud


def _orden_valor(v: str) -> float:
    s = v.replace(",", ".")
    if "/" in s:
        a, _, b = s.partition("/")
        try:
            # «11/4» = 1 1/4, «21/2» = 2 1/2 (así se escriben en la tarifa)
            if len(a) == 2 and a[0] != "0":
                return int(a[0]) + int(a[1]) / float(b)
            return int(a) / float(b)
        except (ValueError, ZeroDivisionError):
            return 0
    try:
        return float(s)
    except ValueError:
        return 0


# ── Lector de la tarifa de Hierros y Aceros de Santander ──────────────────
def leer_hierros(hojas: dict) -> dict:
    filas = hojas.get("TARIFA") or []
    margen = None
    for f in filas[:4]:
        m = re.search(r"Margen:\s*\+?\s*(\d+(?:[.,]\d+)?)\s*%", " ".join(map(str, f)))
        if m:
            margen = float(m.group(1).replace(",", "."))
    ini = next((i for i, f in enumerate(filas) if f and normaliza(f[0]) == "categoria"), 2)
    arts = []
    for f in filas[ini + 1:]:
        f = list(f) + [""] * (12 - len(f))
        cat, desc = str(f[0]).strip(), str(f[1]).strip()
        if not desc or not cat:
            continue  # cabeceras de sección y filas vacías
        ud = str(f[2]).strip().upper()
        arts.append({
            "ref": desc,
            "categoria": cat,
            "descripcion": desc,
            "unidad": ud,
            "precio_ant": numero(f[3]), "fecha_ant": mes(f[4]),
            "precio": numero(f[5]), "fecha": mes(f[6]),
            "evol": porcentaje(f[7]),
            "kg_m": numero(f[8]) if "kg" in str(f[8]).lower() else None,
            # Lo que se compra ya por unidad, metro, m² o kg trae «(UN)», «(M2)»… en vez del coste por metro:
            # entonces el coste es el mismo precio de compra
            "coste": numero(f[9]) if numero(f[9]) is not None else (numero(f[5]) if ud in ("UN", "MT", "M2", "KG") else None),
            "pvp": numero(f[10]), "pvp_iva": numero(f[11]),
            "ud_venta": UD_VENTA.get(ud, "ud"), "ud_compra": UD_COMPRA.get(ud, ud.lower()),
        })
    log = []
    for f in (hojas.get("LOG") or [])[1:]:
        f = list(f) + [""] * (6 - len(f))
        if not str(f[0]).strip():
            continue
        log.append({"numero": str(f[0]).strip(), "fecha": str(f[1]).strip()[:10],
                    "cambios": numero(f[3]), "nuevos": numero(f[4]), "notas": str(f[5] or "")})
    return {"articulos": arts, "log": log, "margen": margen}


# ── Lector de la tarifa de Navarro Zabaleta ───────────────────────────────
# Clasificación propia (oct. 2026): Zabaleta llama de muchas maneras a lo mismo, así que cada referencia
# tiene aquí su familia, grupo, tipo de pieza, medida y un nombre claro. Se genera con
# tools/zabaleta-clasifica.py. Las referencias nuevas que no estén se colocan solas por su categoría.
_CATALOGO_ZAB = os.path.join(os.path.dirname(__file__), "..", "data", "zabaleta_catalogo.json")
try:
    with open(_CATALOGO_ZAB, encoding="utf-8") as _f:
        CATALOGO_ZAB = json.load(_f)
except (OSError, ValueError):  # sin el archivo se enseña como viene en la hoja
    CATALOGO_ZAB = {"familias": [], "grupos": {}, "articulos": {}}

# Categoría de la hoja → familia propia, para referencias nuevas que aún no están clasificadas
FAMILIA_NUEVOS = {
    "Saneamiento y drenaje": "Saneamiento exterior", "Evacuación PVC": "Evacuación PVC",
    "Abastecimiento y riego": "Agua y acometidas", "Fontanería interior": "Latón roscado",
    "Calefacción y ACS": "Calefacción", "Chimenea y estufas": "Chimeneas, estufas y ventilación",
    "Canalón y cubierta": "Canalón", "Bombeo y presión": "Agua y acometidas", "Sanitario y baño": "Baño y desagües",
    "Químicos y sellado": "Gas, sellado y soldadura", "Ferretería y varios": "Fijación, aislamiento y herramienta",
}
NUEVOS = "Nuevos (sin ordenar)"

# Arreglos al leer la hoja (oct. 2026): códigos comodín (INC, $4016…) que mezclaban artículos distintos y
# artículos repetidos con dos códigos. Ver data/zabaleta_ajustes.json.
_AJUSTES_ZAB = os.path.join(os.path.dirname(__file__), "..", "data", "zabaleta_ajustes.json")
try:
    with open(_AJUSTES_ZAB, encoding="utf-8") as _f:
        AJUSTES_ZAB = json.load(_f)
except (OSError, ValueError):
    AJUSTES_ZAB = {}
COMODIN = re.compile(AJUSTES_ZAB.get("comodines") or r"^(INC|\$.+)$")


def _clasifica_zab(a: dict, c: Optional[dict] = None) -> None:
    c = c or CATALOGO_ZAB["articulos"].get(a["ref"]) or (AJUSTES_ZAB.get("articulos") or {}).get(a["ref"])
    if c:
        a.update(categoria=c["f"], subcategoria=c["g"], tipo=c.get("t"), medida_c=c.get("m"), orden=c.get("o"),
                 nombre=c["n"], foto=c.get("foto"))
    elif CATALOGO_ZAB["familias"]:
        a.update(categoria=FAMILIA_NUEVOS.get(a["categoria"], a["categoria"]), subcategoria=NUEVOS,
                 tipo=None, medida_c=None, orden=None, nombre=_bonita(a["descripcion"]), foto=None, nuevo=True)


def _bonita(d: str) -> str:
    s = re.sub(r"\s+", " ", d.strip().lower())
    return s[:1].upper() + s[1:]


def _pvp_zab(coste: float, margen: float) -> tuple[float, float]:
    """PVP como en la hoja: coste + margen, redondeado a 0,05 € por debajo de 5 € y a 0,10 € por encima;
    con IVA, a 0,05 €. (Con decimales exactos: así sale igual que la hoja.)"""
    def red(v: Decimal, paso: str) -> Decimal:
        p = Decimal(paso)
        return (v / p).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * p
    v = Decimal(str(coste)) * (1 + Decimal(str(margen)) / 100)
    pvp = red(v, "0.05" if v < 5 else "0.10")
    return float(pvp), float(red(pvp * Decimal("1.21"), "0.05"))


def _min12(ls: list, hoy: str) -> Optional[float]:
    """Coste más bajo de los 12 meses anteriores a la última factura de la hoja."""
    desde = (date.fromisoformat(hoy) - timedelta(days=365)).isoformat() if hoy else ""
    precios = [l["precio"] for l in ls if l["fecha"] >= desde]
    return min(precios) if precios else None


def _comodines_zab(arts: list, lineas: dict) -> None:
    """Zabaleta factura con un código comodín (INC, $4016…) lo que no tiene código propio, y la hoja junta en
    una fila todo lo de ese código con el precio de lo último que entró (el «codo placa» salía al precio de una
    boya). Aquí cada artículo distinto, por su descripción en la factura, va por separado con su precio.
    Si ese artículo ya está en la tarifa con su propio código (misma descripción, o «REF PM720»), se queda solo
    ese. Si el comodín solo tiene un artículo y coincide con su fila, no se toca."""
    por_ref = {a["ref"]: a for a in arts}
    por_desc = {normaliza(a["descripcion"]): a for a in arts if not COMODIN.match(a["ref"])}
    margenes: dict[str, dict] = {}
    for a in arts:
        if a.get("margen") is not None:
            cuenta = margenes.setdefault(a["cat_hoja"], {})
            cuenta[a["margen"]] = cuenta.get(a["margen"], 0) + 1
    hoy = max((l["fecha"] for ls in lineas.values() for l in ls), default="")
    quitar = set()
    for cod in [c for c in lineas if COMODIN.match(c)]:
        grupos: dict[str, list] = {}
        for l in sorted(lineas[cod], key=lambda l: (l["fecha"], l["factura"])):
            grupos.setdefault(normaliza(l["desc"]), []).append(l)
        fila = por_ref.get(cod)
        if len(grupos) == 1 and fila and normaliza(fila["descripcion"]) in grupos:
            continue
        if fila:
            quitar.add(cod)
        for clave, ls in grupos.items():
            ult = ls[-1]
            ref_en = re.search(r"\bREF\.?\s+([A-Z0-9][A-Z0-9\-]{2,})\b", ult["desc"].upper())
            if clave in por_desc or (ref_en and ref_en.group(1) in por_ref and ref_en.group(1) != cod):
                continue  # ya está con su código
            distintos = [l for l in ls if abs(l["precio"] - ult["precio"]) > 0.0005]
            ant = distintos[-1] if distintos else None
            ud = "m" if re.match(r"(?i)^(m\.|mt\.?|mto\.)\s", ult["desc"]) else ((fila or {}).get("unidad") or "ud")
            ref = f"{cod}~{slug(ult['desc'])}"
            a = {
                "ref": ref, "codigo": cod, "comodin": True, "categoria": ult["cat"] or (fila or {}).get("cat_hoja", ""),
                "cat_hoja": ult["cat"], "subcategoria": ult["sub"], "descripcion": ult["desc"],
                "unidad": ud, "compras": len(ls),
                "precio_ant": ant["precio"] if ant else None, "fecha_ant": ant["fecha"] if ant else None,
                "precio": ult["precio"], "fecha": ult["fecha"],
                "evol": round((ult["precio"] - ant["precio"]) / ant["precio"] * 100, 1) if ant and ant["precio"] else None,
                "minimo": _min12(ls, hoy), "nota": None, "apunte": None, "margen": None, "kg_m": None,
                "coste": ult["precio"], "pvp": None, "pvp_iva": None, "ud_venta": ud, "ud_compra": ud,
            }
            # El artículo que da nombre a la fila del comodín conserva su sitio en el catálogo
            heredada = CATALOGO_ZAB["articulos"].get(cod) if fila and normaliza(fila["descripcion"]) == clave else None
            _clasifica_zab(a, (AJUSTES_ZAB.get("articulos") or {}).get(ref) or heredada)
            # Margen: el de lo que hay en su mismo grupo (así se vende como sus vecinos); si no, el de su categoría
            vecinos = [x["margen"] for x in arts if x.get("margen") is not None and x["categoria"] == a["categoria"]
                       and x.get("subcategoria") == a.get("subcategoria")]
            cuenta = ({m: vecinos.count(m) for m in vecinos} or margenes.get(ult["cat"])
                      or margenes.get(fila["cat_hoja"] if fila else "") or {})
            a["margen"] = max(cuenta, key=cuenta.get) if cuenta else (fila or {}).get("margen")
            if a["margen"] is not None:
                a["pvp"], a["pvp_iva"] = _pvp_zab(a["coste"], a["margen"])
            arts.append(a)
            lineas[ref] = ls
        lineas.pop(cod, None)
    arts[:] = [a for a in arts if a["ref"] not in quitar]


def _equivalencias_zab(arts: list, lineas: dict) -> None:
    """Mismo artículo con dos códigos (data/zabaleta_ajustes.json):
    - «antes»: Zabaleta le cambió el código. Se enseña el nuevo, con el precio del nuevo, el histórico de los dos
      y lo que costaba con el código viejo como precio anterior.
    - «también»: a veces lo facturan con otro código más caro. Se enseña solo el bueno, avisando del otro.
    Además, dos artículos de la misma familia con el mismo nombre claro del catálogo son el mismo: se queda el
    de la compra más reciente y el otro va como «antes» (así se cogen solos los próximos cambios de código)."""
    por_ref = {a["ref"]: a for a in arts}
    hoy = max((l["fecha"] for ls in lineas.values() for l in ls), default="")
    quitar = set()

    def unir(a: dict, b: dict) -> None:
        v, ref = b["ref"], a["ref"]
        quitar.add(v)
        a.setdefault("antes", []).append(v)
        ls = sorted(lineas.get(ref, []) + [{**l, "codigo": v} for l in lineas.get(v, [])],
                    key=lambda l: (l["fecha"], l["factura"]))
        lineas[ref] = ls
        lineas.pop(v, None)
        if a.get("precio_ant") is None and b.get("precio") is not None:
            a["precio_ant"], a["fecha_ant"] = b["precio"], b["fecha"]
            if a.get("precio") is not None and b["precio"]:
                a["evol"] = round((a["precio"] - b["precio"]) / b["precio"] * 100, 1)
        a["compras"] = len(ls) or (a.get("compras") or 0) + (b.get("compras") or 0)
        a["minimo"] = _min12(ls, hoy) if ls else a.get("minimo")
        if normaliza(a.get("nota") or "") == "nuevo":  # ya se compraba con el código viejo
            a["nota"] = None

    for ref, viejos in (AJUSTES_ZAB.get("antes") or {}).items():
        for v in viejos:
            if por_ref.get(ref) and por_ref.get(v) and v not in quitar:
                unir(por_ref[ref], por_ref[v])
    mismos: dict[tuple, list] = {}
    for a in arts:
        if a.get("nombre") and not a.get("nuevo") and not a.get("comodin") and a["ref"] not in quitar:
            mismos.setdefault((a["categoria"], normaliza(a["nombre"])), []).append(a)
    for xs in mismos.values():
        if len(xs) > 1:
            xs.sort(key=lambda a: (a.get("fecha") or "", a["ref"]), reverse=True)
            for b in xs[1:]:
                unir(xs[0], b)
    for ref, otros in (AJUSTES_ZAB.get("tambien") or {}).items():
        a = por_ref.get(ref)
        for o in otros:
            b = por_ref.get(o)
            if not a or not b:
                continue
            quitar.add(o)
            a.setdefault("tambien", []).append({"codigo": o, "precio": b.get("precio"), "fecha": b.get("fecha")})
    for a in arts:
        if a.get("antes") or a.get("tambien"):
            a["alias"] = (a.get("antes") or []) + [t["codigo"] for t in a.get("tambien") or []]
    arts[:] = [a for a in arts if a["ref"] not in quitar]


def leer_zabaleta(hojas: dict) -> dict:
    """Pestaña «Tarifa»: una fila por referencia (con categoría y subcategoría).
    «Detalle facturas»: cada línea de cada factura → evolución del coste y la factura exacta."""
    filas = hojas.get("Tarifa") or []
    ini = next((i for i, f in enumerate(filas) if f and normaliza(f[0]) == "categoria"), 3)
    arts = []
    for f in filas[ini + 1:]:
        f = list(f) + [""] * (16 - len(f))
        cat, sub, cod, desc = (str(x).strip() for x in f[:4])
        if not cat or not cod or not desc:
            continue  # títulos de categoría y subcategoría
        ud = str(f[4]).strip().lower() or "ud"
        precio = numero(f[8])
        # «TUBERIA … 75 3 Mts — Oct-25 facturado a 7,00 €…»: lo de detrás de la raya es una nota
        desc, _, apunte = desc.partition(" — ")
        arts.append({
            "ref": cod, "codigo": cod, "categoria": cat, "cat_hoja": cat, "subcategoria": sub, "descripcion": desc,
            "unidad": ud, "compras": numero(f[5]),
            "precio_ant": numero(f[6]), "fecha_ant": dia(f[7]),
            "precio": precio, "fecha": dia(f[9]), "evol": porcentaje(f[10]),
            "minimo": numero(f[11]), "nota": str(f[12]).replace("▲", "").strip() or None,
            "apunte": apunte.strip() or None,
            "margen": porcentaje(f[13]), "kg_m": None,
            "coste": precio, "pvp": numero(f[14]), "pvp_iva": numero(f[15]),
            "ud_venta": ud, "ud_compra": ud,
        })
        _clasifica_zab(arts[-1])
    # Líneas de factura válidas (los cargos anulados por un abono y los abonos no cuentan)
    lineas: dict[str, list] = {}
    facturas: dict[str, str] = {}
    for f in (hojas.get("Detalle facturas") or [])[1:]:
        f = list(f) + [""] * (15 - len(f))
        fecha, num, cod = dia(f[0]), str(f[1]).strip(), str(f[6]).strip()
        if not fecha or not num:
            continue
        facturas[num] = fecha
        if normaliza(f[14]) not in ("valida", "") or not cod:
            continue
        coste = numero(f[13])
        if coste is None or coste <= 0:
            continue
        lineas.setdefault(cod, []).append({
            "fecha": fecha, "factura": num, "precio": coste, "cantidad": numero(f[8]),
            "bruto": numero(f[9]), "dto1": porcentaje(f[10]), "dto2": porcentaje(f[11]),
            "desc": str(f[7]).strip(), "cat": str(f[4]).strip(), "sub": str(f[5]).strip(),
        })
    _comodines_zab(arts, lineas)
    _equivalencias_zab(arts, lineas)
    # «Log» de facturas: cuántos precios cambiaron en cada una
    log = []
    for num, fecha in facturas.items():
        cambios = sum(1 for a in arts if a["fecha"] == fecha and a["evol"])
        nuevos = sum(1 for a in arts if a["fecha"] == fecha and a["nota"] and normaliza(a["nota"]) == "nuevo")
        log.append({"numero": num, "fecha": fecha, "cambios": cambios, "nuevos": nuevos, "notas": ""})
    return {"articulos": arts, "log": log, "margen": None, "lineas": lineas,
            "orden_familias": CATALOGO_ZAB["familias"], "orden_grupos": CATALOGO_ZAB["grupos"]}


# ── Lector de la tarifa de Isoltubex ──────────────────────────────────────
def leer_isoltubex(hojas: dict) -> dict:
    """Una pestaña por tipo de accesorio; la organización (familia, grupo, tipo y medida) sale de
    services/isoltubex.py. No trae facturas: el coste es el de las listas de netos de Isoltubex."""
    arts = isoltubex.leer(hojas)
    _, _, origen = isoltubex.fechas(hojas)
    return {"articulos": arts, "log": [], "margen": None, "lineas": {}, "origen": origen,
            "orden_familias": [f for f, _ in isoltubex.FAMILIAS], "orden_grupos": isoltubex.GRUPOS}


# ── Lector de la tarifa de mallas de J. Silva Moreira ─────────────────────
def leer_silva(hojas: dict) -> dict:
    """Pestaña «TARIFA»: una fila por rollo (código, familia, gama, alto, alambres, separación, metros, descripción
    del proveedor, rollos por palé, coste, fecha, margen, PVP, PVP+IVA, €/m, precio desde 5 rollos y precio de palé,
    cada uno con IVA). El coste sale del pedido de mayo de 2026; cada rollo es su propia «línea»."""
    filas = hojas.get("TARIFA") or []
    ini = next((i for i, f in enumerate(filas) if f and normaliza(f[0]) == "codigo"), None)
    if ini is None:
        return {"articulos": [], "log": [], "margen": None, "lineas": {}}
    pedido = ""
    for f in hojas.get("INICIO") or []:
        m = re.search(r"[Pp]edido\s+([\d.]+)", " ".join(map(str, f)))
        if m:
            pedido = m.group(1)
    arts, lineas, familias = [], {}, []
    for f in filas[ini + 1:]:
        f = [str(x).strip() for x in f] + [""] * (19 - len(f))
        cod, fam, gama = f[0], f[1], f[2]
        if not cod or not fam:
            continue
        alto, alam, sep, metros = (numero(x) for x in f[3:7])
        coste = numero(f[9])
        fecha = dia(f[10]) or mes(f[10])
        med = f"{alto:g}/{alam:g}/{sep:g}" if alto and alam and sep else None
        m = int(metros) if metros else None
        rollos = int(numero(f[8]) or 0) or None
        q, qi, pa, pai = numero(f[15]), numero(f[16]), numero(f[17]), numero(f[18])
        dinero = lambda v: f"{v:.2f}".replace(".", ",") + " €"
        apunte = []
        if q:
            apunte.append(f"Desde 5 rollos: {dinero(q)}" + (f" ({dinero(qi)} con IVA)" if qi else "") + " el rollo.")
        if pa:
            apunte.append(f"Palé completo{f' ({rollos} rollos)' if rollos else ''}: {dinero(pa)}"
                          + (f" ({dinero(pai)} con IVA)" if pai else "") + " el rollo.")
        if fam not in familias:
            familias.append(fam)
        tipo = f"Rollo de {m} m" if m else "Rollo"
        n = normaliza(fam)
        # Fotos oficiales de jsilvamoreira.pt (Ovimor L / Ovimor M / Nodimor), en frontend/public/catalogo/silva
        foto = "/catalogo/silva/" + ("nudo-fijo" if "nudo fijo" in n else "fuerte" if "fuerte" in n else "ligera") + ".webp"
        arts.append({
            "ref": cod, "codigo": cod, "categoria": fam, "subcategoria": gama, "descripcion": f[7] or cod,
            "nombre": f"{fam} {med or ''} · rollo de {m} m ({gama})".replace("  ", " "),
            "tipo": tipo, "medida_c": med, "orden": alto, "mp": f"{alto:g} cm" if alto else None, "op": alto,
            "foto": foto, "unidad": "rollo", "ud_venta": "rollo", "ud_compra": "rollo",
            "precio": coste, "fecha": fecha, "precio_ant": None, "fecha_ant": None, "evol": None,
            "coste": coste, "pvp": numero(f[12]), "pvp_iva": numero(f[13]), "margen": porcentaje(f[11]),
            "metros": m, "kg_m": None, "minimo": None, "compras": 1, "nota": None,
            "apunte": " ".join(apunte) or None,
            "origen": f"Coste del pedido {pedido} a J. Silva Moreira, por rollo, porte incluido y sin IVA (compra intracomunitaria)."
                      if pedido else "Coste del último pedido a J. Silva Moreira, por rollo, porte incluido.",
        })
        if coste and fecha:
            lineas[cod] = [{"fecha": fecha, "factura": pedido or "pedido", "precio": coste, "cantidad": None,
                            "bruto": None, "dto1": None, "dto2": None}]
    log = [{"numero": pedido, "fecha": arts[0]["fecha"], "cambios": 0, "nuevos": len(arts), "notas": ""}] if pedido and arts else []
    grupos = {fa: list(dict.fromkeys(a["subcategoria"] for a in arts if a["categoria"] == fa)) for fa in familias}
    return {"articulos": arts, "log": log, "margen": None, "lineas": lineas,
            "orden_familias": familias, "orden_grupos": grupos}


LECTORES = {"hierros": leer_hierros, "zabaleta": leer_zabaleta, "isoltubex": leer_isoltubex, "silva": leer_silva}


# ── Copia local y lectura desde Drive ─────────────────────────────────────
def _guardar_precios(db: Session, prov: str, arts: list) -> None:
    """Apunta cada precio (artículo + precio + mes) que no estuviera ya: así se forma la evolución."""
    vistos = {(p.articulo, round(p.precio, 4), p.fecha)
              for p in db.query(TarifaPrecio).filter(TarifaPrecio.proveedor == prov)}
    for a in arts:
        for precio, fecha in ((a["precio_ant"], a["fecha_ant"]), (a["precio"], a["fecha"])):
            if precio is None or not fecha:
                continue
            k = (a["descripcion"], round(precio, 4), fecha)
            if k in vistos:
                continue
            vistos.add(k)
            db.add(TarifaPrecio(proveedor=prov, articulo=a["descripcion"], precio=precio,
                                unidad=a["unidad"], fecha=fecha))


def actualizar(db: Session, prov: str) -> TarifaCopia:
    """Lee la hoja de Drive y guarda la copia. Lanza RuntimeError con un mensaje para la persona."""
    cfg = TARIFAS[prov]
    copia = db.get(TarifaCopia, prov) or TarifaCopia(proveedor=prov)
    try:
        r = mail_service.drive_hoja(cfg["hoja"], cfg["pestanas"])
    except mail_service.MailNotConfigured:
        raise RuntimeError("Falta conectar la app con Drive (MAIL_RELAY_URL y MAIL_RELAY_KEY).")
    except Exception as e:
        logger.warning("No se pudo leer la tarifa %s: %s", prov, e)
        copia.error, copia.error_at = str(e)[:500], datetime.utcnow()
        db.merge(copia); db.commit()
        txt = str(e)
        if "falta el pdf" in txt.lower():  # el Apps Script aún no tiene la acción «hoja»
            raise RuntimeError("Falta actualizar el Apps Script de casafonsomc para que pueda leer tarifas.")
        if "permis" in txt.lower() or "permission" in txt.lower():
            raise RuntimeError("casafonsomc no tiene permiso para abrir la tarifa (o falta autorizar el Apps Script).")
        raise RuntimeError("No se pudo leer la tarifa de Drive. Vuelve a probar en un rato.")
    hojas = r.get("hojas") or {}
    datos = LECTORES[prov](hojas)
    if not datos["articulos"]:
        raise RuntimeError("La tarifa de Drive ha llegado vacía o con otro formato.")
    copia.hojas = json.dumps(hojas, ensure_ascii=False)
    if cfg.get("carpeta_facturas"):
        try:
            copia.archivos = json.dumps(mail_service.drive_archivos(cfg["carpeta_facturas"]), ensure_ascii=False)
        except Exception as e:  # si falla, las facturas se abren con la búsqueda de Drive
            logger.warning("No se pudieron listar las facturas de %s: %s", prov, e)
    copia.nombre = r.get("nombre")
    copia.modificado = r.get("modificado")
    copia.leido_at, copia.error, copia.error_at = datetime.utcnow(), None, None
    db.merge(copia)
    if "lineas" not in datos:  # si la hoja ya trae cada compra, no hace falta ir apuntando
        _guardar_precios(db, prov, datos["articulos"])
    db.commit()
    return db.get(TarifaCopia, prov)


def copia(db: Session, prov: str, forzar: bool = False) -> tuple[Optional[TarifaCopia], Optional[str]]:
    """Copia de la tarifa, refrescándola si es vieja. Si Drive falla y hay copia, se usa la copia
    y se devuelve también un aviso."""
    c = db.get(TarifaCopia, prov)
    ahora = datetime.utcnow()
    vieja = not c or not c.leido_at or ahora - c.leido_at > REFRESCO
    reciente_error = c and c.error_at and ahora - c.error_at < REINTENTO_ERROR
    if forzar or (vieja and not reciente_error):
        try:
            return actualizar(db, prov), None
        except RuntimeError as e:
            c = db.get(TarifaCopia, prov)
            if c and c.leido_at:
                return c, f"{e} Se enseña la copia del {c.leido_at:%d/%m/%Y}."
            if forzar or not c or not c.leido_at:
                raise
    return c, None


# ── Lo que ve la app ──────────────────────────────────────────────────────
def _actualizada(c: TarifaCopia) -> Optional[str]:
    """Fecha de la última actualización: la del nombre del archivo (la pone la tarea programada)."""
    m = re.search(r"(\d{4}-\d{2}-\d{2})", c.nombre or "")
    if m:
        return m.group(1)
    return (c.modificado or "")[:10] or None


FRACCIONES = {"1/2": "½", "1/4": "¼", "3/4": "¾", "3/8": "⅜"}


def bonita_medida(v: str) -> str:
    """«11/4» → «1¼», «1/2» → «½» (así se escriben las pulgadas en la tarifa)."""
    m = re.fullmatch(r"(\d?)(\d/\d)", v)
    if m and m.group(2) in FRACCIONES:
        return m.group(1) + FRACCIONES[m.group(2)]
    return v.replace("X", "×").replace("x", "×")


def _partes(desc: str) -> Optional[tuple]:
    """(texto antes de la medida, medida completa, texto después) o None si no hay medida."""
    d = re.sub(r"\s+", " ", desc.strip())
    ms = [m for m in _DIM.finditer(d) if re.search(r"\d", m.group())]
    if not ms:
        return None
    m = ms[-1]
    antes = re.sub(r"(?i)\s+(de|del)$", "", d[:m.start()].rstrip(" (-"))
    despues = d[m.end():].strip(" )")
    ud = ""
    if re.fullmatch(r"(?i)mm|m", despues):
        ud, despues = despues.lower(), ""
    if re.search(r"\d", antes):  # la medida no está sola (p. ej. «ENTRAMADO 2000X1000 30X30…»)
        return None
    return antes, m.group(), despues, ud


_PULG = {"1/8": 0.125, "1/4": 0.25, "3/8": 0.375, "1/2": 0.5, "3/4": 0.75, "⅛": 0.125, "¼": 0.25, "⅜": 0.375, "½": 0.5, "¾": 0.75}


def _valor_pulgadas(t: str) -> Optional[float]:
    """«1 1/4"», «1¼″», «3/4"», «2″» → pulgadas; si no son pulgadas, None."""
    if not re.search(r'["″]', t):
        return None
    t = re.sub(r'["″\s]', "", t)
    m = re.fullmatch(r"(\d*)([⅛¼⅜½¾]|\d/\d)?", t)
    if not m or not (m.group(1) or m.group(2)):
        return None
    return float(m.group(1) or 0) + _PULG.get(m.group(2) or "", 0)


def medida_principal(m: Optional[str]) -> tuple[Optional[str], Optional[float]]:
    """La medida por la que se busca dentro de una familia («todo lo de 20»): la primera de «20 × ½″», «3/4"×1/2"»,
    «DN50×1"», «50-40» o «16 → Cu 15»; una sección cuadrada («50×50») va entera. Devuelve (texto, orden):
    los milímetros por su número y las pulgadas detrás (1000 + pulgadas)."""
    s = re.sub(r"\s+", " ", str(m or "")).strip()
    if not s:
        return None, None
    if "→" in s:  # adaptadores: la medida del tubo de la familia, no la del cobre
        partes = [p.strip() for p in s.split("→")]
        s = next((p for p in partes if not p.lower().startswith("cu")), partes[0])
    s = re.sub(r"^(?:DN|Ø|D\.?\s?|d\.\s?)(?=\d)", "", s)
    if re.search(r"[A-Za-zñ]{3,}", s):  # «2 salidas», «400 mm»: tal cual
        n = re.search(r"\d+(?:[.,]\d+)?", s)
        return s, float(n.group().replace(",", ".")) if n else None
    s = s.split(" ")[0] if re.match(r'^[\d/ ]+["″]\s+\d', s) else s  # «1/2" 18×11» (juntas): la rosca
    toks = [t.strip() for t in re.split(r"\s*[×xX]\s*|(?<=\d)-(?=\d)", s) if t.strip()]
    if not toks:
        return None, None
    num = lambda t: re.fullmatch(r"\d+(?:[.,]\d+)?", t)
    if len(toks) == 2 and toks[0] == toks[1] and _valor_pulgadas(toks[0]) is None:
        return f"{toks[0]}×{toks[1]}", float(re.sub(r"[^\d.]", "", toks[0].replace(",", ".")) or 0)
    if len(toks) == 3 and all(num(t) for t in toks) and min(float(t.replace(",", ".")) for t in toks[:2]) >= 100:
        return None, None  # medidas de una caja o un armario (320×300×95): no es un diámetro
    # Pieza para tubo con rosca («1/2"×16», «25×3/4"»): manda el tubo
    t = next((t for t in toks if num(t)), toks[0]) if any(_valor_pulgadas(t) is not None for t in toks) else toks[0]
    p = _valor_pulgadas(t)
    if p is not None:
        return t, 1000 + p
    if num(t):
        return t, float(t.replace(",", "."))
    u = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*(mm|cm|m)", t)
    if u:  # «400 mm» (largo de un latiguillo)
        return t, float(u.group(1).replace(",", ".")) * {"mm": 1, "cm": 10, "m": 1000}[u.group(2)]
    return t, None


def medidas_de(m: Optional[str]) -> list[str]:
    """Todas las medidas de una pieza del mismo tipo que la principal: una reducción 3/4"×1/2" sale también en
    1/2", y una 125-110 en 110 (para «todo lo de 110»). Una pieza con rosca para tubo solo va por el tubo."""
    principal, _ = medida_principal(m)
    s = re.sub(r"\s+", " ", str(m or "")).strip()
    if not principal or "→" in s or re.search(r"[A-Za-zñ]{3,}", s) or "×" in principal:
        return [principal] if principal else []
    s = re.sub(r"^(?:DN|Ø|D\.?\s?|d\.\s?)(?=\d)", "", s)
    s = s.split(" ")[0] if re.match(r'^[\d/ ]+["″]\s+\d', s) else s
    toks = [t.strip() for t in re.split(r"\s*[×xX]\s*|(?<=\d)-(?=\d)", s) if t.strip()]
    pulgadas = _valor_pulgadas(principal) is not None
    out = []
    for t in toks:
        if (_valor_pulgadas(t) is not None) == pulgadas and (pulgadas or re.fullmatch(r"\d+(?:[.,]\d+)?", t)) and t not in out:
            out.append(t)
    return out or [principal]


def _item(a: dict, valor: str = "", ud: str = "") -> dict:
    mp, op = (a["mp"], a.get("op")) if a.get("mp") else medida_principal(a.get("medida_c"))
    ms = [mp] if a.get("mp") else medidas_de(a.get("medida_c"))
    return {"ref": a["ref"], "codigo": a.get("codigo"), "descripcion": a.get("nombre") or a["descripcion"],
            "original": a["descripcion"] if a.get("nombre") else None, "foto": a.get("foto"), "valor": bonita_medida(valor) if valor else "",
            "ud_medida": ud, "unidad": a["unidad"], "ud_venta": a["ud_venta"], "coste": a["coste"], "pvp": a["pvp"],
            "pvp_iva": a["pvp_iva"], "evol": a["evol"], "fecha": a["fecha"],
            # Para la vista nueva (oct. 2026): otros códigos del mismo artículo, código comodín, metros de un rollo
            # o barra (para el €/m) y la medida por la que se filtra la familia
            "alias": a.get("alias"), "comodin": bool(a.get("comodin")), "metros": a.get("metros"), "mp": mp, "op": op,
            **({"ms": ms} if len(ms) > 1 else {})}


def _clave_orden(v: str) -> tuple:
    return tuple(_orden_valor(x) for x in re.split(r"\s*[xX×]\s*", v))


def _grupos(arts: list) -> list:
    """Agrupa una familia para elegir medida.
    - Por sección («TUBO CUADRADO 50×50» → espesores 3, 4, 5 mm) cuando así se agrupan casi todos.
    - Si no (ángulos, rectangulares…), por tipo («ANGULO» → 20×3, 25×3, 30×3…).
    Lo que no tiene medida clara va suelto, con su nombre."""
    seccion: dict[str, list] = {}
    for a in arts:
        base, valor, ud = medida(a["descripcion"])
        seccion.setdefault(base, []).append((a, valor, ud))
    sueltos = sum(1 for v in seccion.values() if len(v) == 1)
    if sueltos * 2 < len(arts):
        out = []
        for base, items in seccion.items():
            if len(items) == 1 and not re.search(r"\d", base) or not items[0][1]:
                out += [{"titulo": None, "medidas": [_item(a)]} for a, _, _ in items]
                continue
            items.sort(key=lambda t: _orden_valor(t[1]))
            out.append({"titulo": re.sub(r"(\d)X(\d)", r"\1×\2", base), "medidas": [_item(a, v, u) for a, v, u in items]})
        return out
    tipos: dict[str, list] = {}
    orden = []
    for a in arts:
        p = _partes(a["descripcion"])
        if not p:
            k = ("", a["descripcion"])
        else:
            antes, dims, despues, ud = p
            k = (f"{antes} · {despues}" if despues else antes, dims, ud)
        clave = k[0] or k[1]
        if clave not in tipos:
            orden.append(clave)
        tipos.setdefault(clave, []).append((a, k))
    out = []
    for clave in orden:
        items = tipos[clave]
        if len(items) == 1 or not items[0][1][0]:
            out += [{"titulo": None, "medidas": [_item(a)]} for a, _ in items]
            continue
        items.sort(key=lambda t: _clave_orden(t[1][1]))
        out.append({"titulo": clave, "medidas": [_item(a, k[1], k[2]) for a, k in items]})
    return out


def _medida_final(desc: str) -> Optional[tuple]:
    """«CODO M-H 45º 125» → («CODO M-H 45º», «125», «»); «TUBO PE 32 MM» → («TUBO PE», «32», «mm»).
    Solo si la medida va al final; si no, None."""
    d = re.sub(r"\s+", " ", desc.strip())
    ud = ""
    m_ud = re.search(r"(?i)\s(mm|m|mt)$", d)
    if m_ud:
        ud, d = "mm" if m_ud.group(1).lower() == "mm" else "m", d[:m_ud.start()]
    ms = [m for m in _DIM.finditer(d) if re.search(r"\d", m.group())]
    if not ms or ms[-1].end() != len(d):
        return None
    m = ms[-1]
    base = re.sub(r"(?i)\s+(de|del|d\.?)$", "", d[:m.start()].rstrip(" (-"))
    if len(base) < 3:
        return None
    return base, m.group(), ud


def _grupos_sub(arts: list, orden: Optional[list] = None) -> list:
    """Familias con grupos (Zabaleta): cada grupo es una sección; dentro, cada tipo de pieza con varias medidas
    va en botones (Codo 87º M-H: 40, 75, 110…) y el resto en lista, por nombre."""
    subs: dict[str, list] = {}
    for a in arts:
        subs.setdefault(a.get("subcategoria") or "", []).append(a)
    pos = {g: i for i, g in enumerate(orden or [])}
    out = []
    for sub in sorted(subs, key=lambda g: (g == NUEVOS, pos.get(g, 999))):
        items = subs[sub]
        tipos: dict[str, list] = {}
        sueltos = []
        for a in items:
            if a.get("tipo") and a.get("medida_c"):
                tipos.setdefault(a["tipo"], []).append(a)
            elif a.get("nuevo"):
                p = _medida_final(a["descripcion"])  # sin clasificar: se intenta por la medida del final
                if p:
                    tipos.setdefault(p[0], []).append({**a, "medida_c": p[1], "orden": None})
                else:
                    sueltos.append(a)
            else:
                sueltos.append(a)
        for t, xs in tipos.items():
            if len(xs) < 2:
                sueltos += xs
                continue
            xs.sort(key=lambda a: (a["orden"] if a.get("orden") is not None else _clave_orden(a["medida_c"])[0]))
            vistas, chips, repes = set(), [], []
            for a in xs:  # la misma medida dos veces (dos marcas): la segunda va en la lista
                if a["medida_c"] in vistas:
                    sueltos.append(a)
                    repes.append(a["ref"])
                else:
                    vistas.add(a["medida_c"])
                    chips.append(_item(a, a["medida_c"]))
            # «repes»: las que se fueron a la lista por repetir medida (la vista nueva las enseña en su grupo)
            out.append({"titulo": t, "seccion": sub, "medidas": chips, **({"repes": repes} if repes else {})})
        sueltos.sort(key=lambda a: normaliza(a.get("nombre") or a["descripcion"]))
        if sueltos:
            out.append({"titulo": None, "seccion": sub, "medidas": [_item(a) for a in sueltos]})
    return out


def resumen(db: Session, en_pruebas: bool = True) -> list:
    out = []
    for prov, cfg in TARIFAS.items():
        if cfg.get("en_pruebas") and not en_pruebas:
            continue
        try:
            c, _ = copia(db, prov)  # la primera vez se lee de Drive para poder dar los números
        except RuntimeError:
            c = db.get(TarifaCopia, prov)
        datos = LECTORES[prov](json.loads(c.hojas)) if c and c.leido_at else None
        out.append({
            "id": prov, "nombre": cfg["nombre"], "sub": cfg["sub"],
            "articulos": len(datos["articulos"]) if datos else None,
            "familias": len({a["categoria"] for a in datos["articulos"]}) if datos else None,
            "actualizada": _actualizada(c) if c and c.leido_at else None,
            "en_pruebas": bool(cfg.get("en_pruebas")),
        })
    return out


def tarifa(db: Session, prov: str, forzar: bool = False) -> dict:
    c, aviso = copia(db, prov, forzar)
    cfg = TARIFAS[prov]
    datos = LECTORES[prov](json.loads(c.hojas))
    familias: dict[str, list] = {}
    for f in datos.get("orden_familias") or []:
        familias[f] = []
    for a in datos["articulos"]:
        familias.setdefault(a["categoria"], []).append(a)
    familias = {k: v for k, v in familias.items() if v}
    ultima = None
    if datos["log"]:
        u = max(datos["log"], key=lambda r: r["fecha"])
        ultima = {"numero": u["numero"], "fecha": u["fecha"], "cambios": u["cambios"],
                  "nuevos": u["nuevos"], "enlace": enlace_factura(u["numero"], _archivos(c))}
    return {
        "id": prov, "nombre": cfg["nombre"], "sub": cfg["sub"], "margen": datos["margen"],
        "actualizada": _actualizada(c), "leida": c.leido_at.isoformat() + "Z" if c.leido_at else None,
        "aviso": aviso, "ultima_factura": ultima,
        "familias": [{"id": slug(cat), "nombre": bonito(cat), "clave": cat, "n": len(arts),
                      "grupos": _grupos_sub(arts, (datos.get("orden_grupos") or {}).get(cat)) if "lineas" in datos else _grupos(arts)}
                     for cat, arts in familias.items()],
    }


def enlace_factura(numero: str, archivos: Optional[list] = None) -> str:
    """El PDF de la factura si está en la carpeta del proveedor; si no, la búsqueda del nº en Drive."""
    n = (numero or "").strip().upper()
    if n and archivos:
        hechos = [a for a in archivos if n in str(a.get("name", "")).upper() and str(a.get("name", "")).upper().endswith(".PDF")]
        if hechos:
            return f"https://drive.google.com/file/d/{hechos[0]['id']}/view"
    return "https://drive.google.com/drive/search?q=" + quote(numero)


def _archivos(c: TarifaCopia) -> list:
    try:
        return json.loads(c.archivos) if c and c.archivos else []
    except ValueError:
        return []


def _compacto(s: str) -> str:
    return re.sub(r"[^a-z0-9/]", "", normaliza(s).replace(",", "/"))


def _factura(a: dict, log: list, archivos: Optional[list] = None) -> tuple[Optional[dict], list]:
    """Factura de la que salió el precio actual: la del mismo mes que lo menciona.
    Devuelve (la elegida, otras posibles del mismo mes)."""
    if not a["fecha"]:
        return None, []
    año, m, _ = clave_mes(a["fecha"])
    candidatas = [r for r in log if r["fecha"][:7] == f"{año:04d}-{m:02d}"]
    if not candidatas:
        return None, []
    base, valor, _ = medida(a["descripcion"])
    dims = _compacto(re.sub(r".*?(\d)", r"\1", base, count=1) + "x" + valor) if re.search(r"\d", base) else ""
    clave = _compacto(base.split()[-1] + valor) if valor else ""
    precio = f"{a['precio']:.2f}".replace(".", ",").rstrip("0").rstrip(",") if a["precio"] else ""
    precio_n = precio.replace(",", ".")

    def puntos(r):
        n = _compacto(r["notas"])
        p = 0
        if dims and dims in n:
            p += 3
        elif clave and clave in n:
            p += 2
        if precio and (f">{precio}" in r["notas"].replace(" ", "") or f">{precio_n}" in r["notas"].replace(" ", "")
                       or f">{precio.replace(',', '')}" in r["notas"].replace(" ", "").replace(".", "")):
            p += 2
        return p

    ordenadas = sorted(candidatas, key=lambda r: (puntos(r), r["fecha"]), reverse=True)
    mejor = ordenadas[0]
    fmt = lambda r: {"numero": r["numero"], "fecha": r["fecha"], "enlace": enlace_factura(r["numero"], archivos)}
    if puntos(mejor) > 0:
        return {**fmt(mejor), "seguro": True}, []
    if len(candidatas) == 1:
        return {**fmt(mejor), "seguro": False}, []
    return None, [fmt(r) for r in sorted(candidatas, key=lambda r: r["fecha"], reverse=True)[:3]]


def ficha(db: Session, prov: str, ref: str) -> Optional[dict]:
    c, aviso = copia(db, prov)
    datos = LECTORES[prov](json.loads(c.hojas))
    a = next((x for x in datos["articulos"] if x["ref"] == ref), None)
    if not a:
        a = next((x for x in datos["articulos"] if normaliza(x["ref"]) == normaliza(ref)
                  or normaliza(x["descripcion"]) == normaliza(ref)), None)
    if not a:  # un código antiguo del artículo (Zabaleta le cambió el código): su ficha es la del nuevo
        a = next((x for x in datos["articulos"] if ref in (x.get("alias") or [])), None)
    if not a:
        return None
    if "lineas" in datos:
        return _ficha_lineas(c, prov, a, datos, aviso)
    hist = (db.query(TarifaPrecio)
            .filter(TarifaPrecio.proveedor == prov, TarifaPrecio.articulo == a["descripcion"]).all())
    puntos = {}
    for h in hist:
        puntos[h.fecha] = h.precio  # si en un mismo mes hubo dos, se queda el último visto
    if a["fecha"] and a["precio"] is not None:
        puntos[a["fecha"]] = a["precio"]
    historial = [{"fecha": f, "precio": p} for f, p in sorted(puntos.items(), key=lambda x: clave_mes(x[0]))]
    factura, posibles = _factura(a, datos["log"], _archivos(c))
    base, valor, ud = medida(a["descripcion"])
    p = _partes(a["descripcion"])
    if p:  # la medida entera: «50×50×4 mm», no solo el espesor
        valor, ud = p[1], p[3] or ud
    return {
        "proveedor": prov, "proveedor_nombre": TARIFAS[prov]["proveedor"], "aviso": aviso,
        "familia": {"id": slug(a["categoria"]), "nombre": bonito(a["categoria"]), "clave": a["categoria"]},
        "descripcion": a["descripcion"], "unidad": a["unidad"], "ud_venta": a["ud_venta"], "ud_compra": a["ud_compra"],
        "precio": a["precio"], "fecha": a["fecha"], "precio_ant": a["precio_ant"], "fecha_ant": a["fecha_ant"],
        "evol": a["evol"], "kg_m": a["kg_m"], "coste": a["coste"], "pvp": a["pvp"], "pvp_iva": a["pvp_iva"],
        "margen": datos["margen"], "historial": historial, "factura": factura, "posibles": posibles,
        "medida": f"{bonita_medida(valor)} {ud}".strip() if valor else None,
    }


def _ficha_lineas(c: TarifaCopia, prov: str, a: dict, datos: dict, aviso: Optional[str]) -> dict:
    """Ficha de una tarifa que trae cada línea de factura (Zabaleta): la evolución y la factura son exactas."""
    lineas = sorted(datos["lineas"].get(a["ref"], []), key=lambda l: (l["fecha"], l["factura"]))
    # Evolución: el primer precio y cada vez que cambia (comprar diez veces al mismo precio no es evolución)
    historial = []
    for l in lineas:
        if not historial or abs(historial[-1]["precio"] - l["precio"]) > 0.0005:
            # «codigo»: la compra se hizo con el código antiguo del artículo (Zabaleta le cambió el código)
            historial.append({"fecha": l["fecha"], "precio": l["precio"], **({"codigo": l["codigo"]} if l.get("codigo") else {})})
        else:
            historial[-1]["fecha_hasta"] = l["fecha"]
    if not historial and a["precio"] is not None and a["fecha"]:
        historial = [{"fecha": a["fecha"], "precio": a["precio"]}]
    archivos = _archivos(c)
    ult = next((l for l in reversed(lineas) if l["fecha"] == a["fecha"]), lineas[-1] if lineas else None)
    factura = None
    if ult:
        factura = {"numero": ult["factura"], "fecha": ult["fecha"], "seguro": True,
                   "enlace": enlace_factura(ult["factura"], archivos),
                   "cantidad": ult["cantidad"], "bruto": ult["bruto"], "dto1": ult["dto1"], "dto2": ult["dto2"]}
    p = _medida_final(a["descripcion"])
    medida_txt = a.get("medida_c") or (f"{bonita_medida(p[1])} {p[2]}".strip() if p else None)
    return {
        "proveedor": prov, "proveedor_nombre": TARIFAS[prov]["proveedor"], "aviso": aviso,
        "familia": {"id": slug(a["categoria"]), "nombre": bonito(a["categoria"]), "clave": a["categoria"]},
        "subcategoria": a.get("subcategoria"), "codigo": a.get("codigo"),
        "descripcion": a.get("nombre") or a["descripcion"], "original": a["descripcion"] if a.get("nombre") else None,
        "tipo": a.get("tipo"), "foto": a.get("foto"),
        "unidad": a["unidad"], "ud_venta": a["ud_venta"], "ud_compra": a["ud_compra"],
        "precio": a["precio"], "fecha": a["fecha"], "precio_ant": a["precio_ant"], "fecha_ant": a["fecha_ant"],
        "evol": a["evol"], "kg_m": None, "coste": a["coste"], "pvp": a["pvp"], "pvp_iva": a["pvp_iva"],
        "margen": a.get("margen"), "redondeo": TARIFAS[prov].get("redondeo"),
        "historial": historial, "factura": factura, "posibles": [],
        "compras": len(lineas) or a.get("compras"), "minimo": a.get("minimo"), "nota": a.get("nota"),
        "apunte": a.get("apunte"),
        "medida": medida_txt,
        "pvp_fab": a.get("pvp_fab"), "origen": a.get("origen") or datos.get("origen"),
        # Vista nueva (oct. 2026): otros códigos del mismo artículo, código comodín y metros del rollo o barra
        "antes": a.get("antes"), "tambien": a.get("tambien"), "comodin": bool(a.get("comodin")), "metros": a.get("metros"),
    }
