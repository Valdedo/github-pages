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
    if not s or s in ("—", "-", "–"):
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
    if not m:
        return (0, 0)
    return (2000 + int(m[4:]), MESES.index(m[:3]) + 1)


UD_VENTA = {"TN": "m", "HM": "m", "MT": "m", "M2": "m²", "UN": "ud", "KG": "kg"}
UD_COMPRA = {"TN": "t", "HM": "100 m", "MT": "m", "M2": "m²", "UN": "ud", "KG": "kg"}

# Siglas que se quedan en mayúsculas al poner bonitos los nombres
SIGLAS = {"ipn", "ipe", "heb", "upn", "iso", "din", "ral", "pl-33", "st-52", "df", "aisi-304", "inox.304"}


def bonito(s: str) -> str:
    """«TUBOS CUADRADOS NEGROS» → «Tubos cuadrados negros» (respetando IPN, UPN, ISO…)."""
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
            "categoria": cat,
            "descripcion": desc,
            "unidad": ud,
            "precio_ant": numero(f[3]), "fecha_ant": mes(f[4]),
            "precio": numero(f[5]), "fecha": mes(f[6]),
            "evol": porcentaje(f[7]),
            "kg_m": numero(f[8]) if "kg" in str(f[8]).lower() else None,
            "coste": numero(f[9]), "pvp": numero(f[10]), "pvp_iva": numero(f[11]),
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


LECTORES = {"hierros": leer_hierros}


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
    copia.nombre = r.get("nombre")
    copia.modificado = r.get("modificado")
    copia.leido_at, copia.error, copia.error_at = datetime.utcnow(), None, None
    db.merge(copia)
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
    return {"ref": a["descripcion"], "descripcion": a["descripcion"], "valor": bonita_medida(valor) if valor else "",
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
                  "nuevos": u["nuevos"], "enlace": enlace_factura(u["numero"])}
    return {
        "id": prov, "nombre": cfg["nombre"], "sub": cfg["sub"], "margen": datos["margen"],
        "actualizada": _actualizada(c), "leida": c.leido_at.isoformat() + "Z" if c.leido_at else None,
        "aviso": aviso, "ultima_factura": ultima,
        "familias": [{"id": slug(cat), "nombre": bonito(cat), "clave": cat, "n": len(arts),
                      "grupos": _grupos(arts)} for cat, arts in familias.items()],
    }


def enlace_factura(numero: str) -> str:
    """Búsqueda en Drive del nº de factura (los PDF los guarda la gestoría en la cuenta de Andrés)."""
    return "https://drive.google.com/drive/search?q=" + quote(numero)


def _compacto(s: str) -> str:
    return re.sub(r"[^a-z0-9/]", "", normaliza(s).replace(",", "/"))


def _factura(a: dict, log: list) -> tuple[Optional[dict], list]:
    """Factura de la que salió el precio actual: la del mismo mes que lo menciona.
    Devuelve (la elegida, otras posibles del mismo mes)."""
    if not a["fecha"]:
        return None, []
    año, m = clave_mes(a["fecha"])
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
    fmt = lambda r: {"numero": r["numero"], "fecha": r["fecha"], "enlace": enlace_factura(r["numero"])}
    if puntos(mejor) > 0:
        return {**fmt(mejor), "seguro": True}, []
    if len(candidatas) == 1:
        return {**fmt(mejor), "seguro": False}, []
    return None, [fmt(r) for r in sorted(candidatas, key=lambda r: r["fecha"], reverse=True)[:3]]


def ficha(db: Session, prov: str, ref: str) -> Optional[dict]:
    c, aviso = copia(db, prov)
    datos = LECTORES[prov](json.loads(c.hojas))
    a = next((x for x in datos["articulos"] if x["descripcion"] == ref), None)
    if not a:
        a = next((x for x in datos["articulos"] if normaliza(x["descripcion"]) == normaliza(ref)), None)
    if not a:
        return None
    hist = (db.query(TarifaPrecio)
            .filter(TarifaPrecio.proveedor == prov, TarifaPrecio.articulo == a["descripcion"]).all())
    puntos = {}
    for h in hist:
        puntos[h.fecha] = h.precio  # si en un mismo mes hubo dos, se queda el último visto
    if a["fecha"] and a["precio"] is not None:
        puntos[a["fecha"]] = a["precio"]
    historial = [{"fecha": f, "precio": p} for f, p in sorted(puntos.items(), key=lambda x: clave_mes(x[0]))]
    factura, posibles = _factura(a, datos["log"])
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
