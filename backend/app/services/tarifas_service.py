"""Catálogo de tarifas de proveedor (en pruebas, solo el encargado).

Las tarifas siguen viviendo en Google Sheets (las actualiza la tarea programada de cada proveedor).
La app las lee a través del Apps Script de casafonsomc@gmail.com (acción «hoja»), guarda una copia
y las ordena para navegar: proveedor → familia → medidas → ficha.

Por ahora solo Hierros y Aceros de Santander. Cada proveedor nuevo necesita su lector, porque
cada hoja tiene sus columnas.
"""
import json
import logging
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Optional
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.models.tarifa import TarifaCopia, TarifaPrecio
from app.services import mail_service

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
            "ref": cod, "codigo": cod, "categoria": cat, "subcategoria": sub, "descripcion": desc,
            "unidad": ud, "compras": numero(f[5]),
            "precio_ant": numero(f[6]), "fecha_ant": dia(f[7]),
            "precio": precio, "fecha": dia(f[9]), "evol": porcentaje(f[10]),
            "minimo": numero(f[11]), "nota": str(f[12]).replace("▲", "").strip() or None,
            "apunte": apunte.strip() or None,
            "margen": porcentaje(f[13]), "kg_m": None,
            "coste": precio, "pvp": numero(f[14]), "pvp_iva": numero(f[15]),
            "ud_venta": ud, "ud_compra": ud,
        })
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
        })
    # «Log» de facturas: cuántos precios cambiaron en cada una
    log = []
    for num, fecha in facturas.items():
        cambios = sum(1 for a in arts if a["fecha"] == fecha and a["evol"])
        nuevos = sum(1 for a in arts if a["fecha"] == fecha and a["nota"] and normaliza(a["nota"]) == "nuevo")
        log.append({"numero": num, "fecha": fecha, "cambios": cambios, "nuevos": nuevos, "notas": ""})
    return {"articulos": arts, "log": log, "margen": None, "lineas": lineas}


LECTORES = {"hierros": leer_hierros, "zabaleta": leer_zabaleta}


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


def _item(a: dict, valor: str = "", ud: str = "") -> dict:
    return {"ref": a["ref"], "codigo": a.get("codigo"), "descripcion": a["descripcion"], "valor": bonita_medida(valor) if valor else "",
            "ud_medida": ud, "unidad": a["unidad"], "ud_venta": a["ud_venta"], "coste": a["coste"], "pvp": a["pvp"],
            "pvp_iva": a["pvp_iva"], "evol": a["evol"], "fecha": a["fecha"]}


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


def _grupos_sub(arts: list) -> list:
    """Familias con subcategorías (Zabaleta): cada subcategoría es una sección; dentro, lo que va
    por medidas (p. ej. «TUBO SN8 PE» 160, 200… 630) en botones y el resto en lista."""
    subs: dict[str, list] = {}
    for a in arts:
        subs.setdefault(a.get("subcategoria") or "", []).append(a)
    out = []
    for sub, items in subs.items():
        por_base: dict[str, list] = {}
        for a in items:
            p = _medida_final(a["descripcion"])
            if p:
                por_base.setdefault(p[0], []).append((a, p[1], p[2]))
            else:
                por_base.setdefault("\0" + a["ref"], []).append((a, "", ""))
        chips, sueltos = [], []
        for base, xs in por_base.items():
            if len(xs) >= 3 and not base.startswith("\0"):
                xs.sort(key=lambda t: _clave_orden(t[1]))
                chips.append({"titulo": base, "seccion": sub, "medidas": [_item(a, v, u) for a, v, u in xs]})
            else:
                sueltos += [a for a, _, _ in xs]
        sueltos.sort(key=lambda a: normaliza(a["descripcion"]))
        out += chips
        if sueltos:
            out.append({"titulo": None, "seccion": sub, "medidas": [_item(a) for a in sueltos]})
    return out


def resumen(db: Session) -> list:
    out = []
    for prov, cfg in TARIFAS.items():
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
        })
    return out


def tarifa(db: Session, prov: str, forzar: bool = False) -> dict:
    c, aviso = copia(db, prov, forzar)
    cfg = TARIFAS[prov]
    datos = LECTORES[prov](json.loads(c.hojas))
    familias: dict[str, list] = {}
    for a in datos["articulos"]:
        familias.setdefault(a["categoria"], []).append(a)
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
                      "grupos": _grupos_sub(arts) if "lineas" in datos else _grupos(arts)}
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
            historial.append({"fecha": l["fecha"], "precio": l["precio"]})
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
    return {
        "proveedor": prov, "proveedor_nombre": TARIFAS[prov]["proveedor"], "aviso": aviso,
        "familia": {"id": slug(a["categoria"]), "nombre": bonito(a["categoria"]), "clave": a["categoria"]},
        "subcategoria": a.get("subcategoria"), "codigo": a.get("codigo"),
        "descripcion": a["descripcion"], "unidad": a["unidad"], "ud_venta": a["ud_venta"], "ud_compra": a["ud_compra"],
        "precio": a["precio"], "fecha": a["fecha"], "precio_ant": a["precio_ant"], "fecha_ant": a["fecha_ant"],
        "evol": a["evol"], "kg_m": None, "coste": a["coste"], "pvp": a["pvp"], "pvp_iva": a["pvp_iva"],
        "margen": a.get("margen"), "redondeo": TARIFAS[prov].get("redondeo"),
        "historial": historial, "factura": factura, "posibles": [],
        "compras": len(lineas) or a.get("compras"), "minimo": a.get("minimo"), "nota": a.get("nota"),
        "apunte": a.get("apunte"),
        "medida": f"{bonita_medida(p[1])} {p[2]}".strip() if p else None,
    }
