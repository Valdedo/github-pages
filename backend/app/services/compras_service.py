"""
Albaranes de compra, «Recibir mercancía» (nov. 2026).

Tres cosas que antes no había:
- El nombre del proveedor sale siempre igual (lista de proveedores conocidos, lo que la tienda corrige
  se recuerda) y nunca es Casa Fonso, que es el cliente.
- Cada artículo se empareja con su compra anterior (código de barras, código del proveedor o descripción)
  para decir si es nuevo, igual, sube o baja, y qué precio de venta tenía puesto.
- El código de barras que se escanea una vez y el precio de venta que la tienda fija a mano se heredan
  en la siguiente compra.
"""
import re
import unicodedata
from collections import defaultdict
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models.article import Article
from app.models.document import Document
from app.models.proveedor_alias import ProveedorAlias
from app.models.supplier import Supplier
from app.services.drive_proveedor import _tokens, adivinar, clave

MANUAL = "__manual__"
NIF_PROPIO = "10770071E"


def es_propio(nombre: Optional[str]) -> bool:
    """El nombre leído es el de Casa Fonso (el cliente), no el de un proveedor."""
    if not nombre:
        return False
    plano = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().upper()
    if NIF_PROPIO in re.sub(r"[^A-Z0-9]", "", plano):
        return True
    t = _tokens(nombre)
    if "FONSO" in t or "CASAFONSO" in t:
        return True
    # «Manuel Fernández Fernández», «Fernández Fernández, Manuel», «Manuel Fernández Fdez.»
    return "MANUEL" in t and ("FERNANDEZ" in t or "FDEZ" in t) and len(t - {"MANUEL", "FERNANDEZ", "FDEZ", "BOAL", "VALDEDO"}) == 0


def conocidos(db: Session) -> list:
    """Nombres de proveedor ya usados, cada proveedor una sola vez y con su forma más repetida."""
    veces: dict = defaultdict(lambda: defaultdict(int))
    for (n,) in db.query(Supplier.name).all():
        if n and not es_propio(n):
            veces[clave(n)][n.strip()] += 1000  # los dados de alta a mano mandan
    filas = (db.query(Document.supplier_name)
             .filter(Document.status == "completed", Document.supplier_name.isnot(None)).all())
    for (n,) in filas:
        n = (n or "").strip()
        if n and n != MANUAL and not es_propio(n) and clave(n):
            veces[clave(n)][n] += 1
    # Las formas distintas de un mismo proveedor cuentan como una: gana la más usada
    grupos: list = []
    for formas in veces.values():
        nombre, n = max(formas.items(), key=lambda x: (x[1], -len(x[0])))
        total = sum(formas.values())
        for g in grupos:
            if mismo(g["nombre"], nombre):
                if n > g["n"]:
                    g["nombre"], g["n"] = nombre, n
                g["total"] += total
                break
        else:
            grupos.append({"nombre": nombre, "n": n, "total": total})
    return sorted((g["nombre"] for g in grupos), key=lambda s: s.upper())


# Palabras que llevan muchos proveedores: solas no bastan para decir que dos nombres son el mismo
_GENERICAS = {"EFECTOS", "INDUSTRIALES", "INDUS", "SUMINISTROS", "FERRETERIA", "MATERIALES", "CONSTRUCCION",
              "RECAMBIOS", "REPRESENTACIONES", "ALMACENES", "BRICOLAJE", "HOGAR", "CAMPO", "CERAMICA", "CERAMICAS",
              "HIERROS", "ACEROS", "MADERAS", "PINTURAS", "TRANSPORTES", "TALLERES", "ELECTRICIDAD", "FONTANERIA",
              "IBERICO", "EUROPE", "INTERNATIONAL", "NORTE", "ASTURIAS", "GALICIA"}


def _igual_palabra(a: str, b: str) -> bool:
    """«INDUS» = «INDUSTRIALES»: una es el principio de la otra (abreviaturas)."""
    return a == b or (min(len(a), len(b)) >= 4 and (a.startswith(b) or b.startswith(a)))


def _comunes(ta: set, tb: set) -> int:
    return sum(1 for x in ta if any(_igual_palabra(x, y) for y in tb))


def mismo(a: Optional[str], b: Optional[str]) -> bool:
    """Dos formas de escribir el mismo proveedor: «CAMINOVAL, S.L.», «EFECTOS INDUS. CAMINOVAL S.L.» y
    «EFECTOS INDUSTRIALES CAMINOVAL». Todas las palabras propias del nombre más corto están en el otro."""
    ta, tb = _tokens(a or ""), _tokens(b or "")
    if not ta or not tb:
        return False
    if ta == tb:
        return True
    pa, pb = (ta - _GENERICAS) or ta, (tb - _GENERICAS) or tb
    corto, largo = (pa, pb) if len(pa) <= len(pb) else (pb, pa)
    return _comunes(corto, largo) == len(corto)


def unificar(nombre: Optional[str], lista: list) -> Optional[str]:
    """El nombre conocido que encaja claramente con el leído; si ninguno (o dudoso entre varios), el leído."""
    nombre = (nombre or "").strip()
    if not nombre:
        return None
    c = clave(nombre)
    for n in lista:
        if clave(n) == c:
            return n
    hallado = adivinar(nombre, [{"name": n} for n in lista])
    if hallado:
        return hallado["name"]
    candidatos = [n for n in lista if mismo(nombre, n)]
    return candidatos[0] if len(candidatos) == 1 else nombre


def resolver_proveedor(db: Session, leido: Optional[str], detectado: Optional[str] = None,
                       anterior: Optional[str] = None) -> Optional[str]:
    """Nombre de proveedor que se guarda en el albarán.

    1) Lo que la tienda corrigió otra vez para ese mismo nombre leído. 2) Nunca Casa Fonso: si la lectura
    lo trae, vale el proveedor detectado por sus palabras clave o el que ya tenía el albarán. 3) Unificado
    con los nombres conocidos."""
    leido = (leido or "").strip() or None
    if leido:
        alias = db.query(ProveedorAlias).filter(ProveedorAlias.clave == clave(leido)).first()
        if alias and alias.nombre:
            return alias.nombre
    if es_propio(leido):
        leido = None
    candidato = leido or (detectado if not es_propio(detectado) else None) or (anterior if not es_propio(anterior) else None)
    return unificar(candidato, conocidos(db)) if candidato else None


def aprender(db: Session, leido: Optional[str], corregido: Optional[str]) -> None:
    """La tienda cambió el proveedor de un albarán: la próxima vez que se lea ese nombre, sale el corregido."""
    leido, corregido = (leido or "").strip(), (corregido or "").strip()
    if not leido or not corregido or es_propio(corregido) or not clave(leido):
        return
    if clave(leido) == clave(corregido) and leido == corregido:
        return
    fila = db.query(ProveedorAlias).filter(ProveedorAlias.clave == clave(leido)).first()
    if fila:
        fila.nombre = corregido
    else:
        db.add(ProveedorAlias(clave=clave(leido), leido=leido[:255], nombre=corregido[:255]))


# ── Emparejar con la compra anterior ─────────────────────────────────────────

def _desc(s: Optional[str]) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()
    return " ".join(re.split(r"[^A-Z0-9]+", s)).strip()


def _cod(s: Optional[str]) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def _codigos(a: Article) -> set:
    """Códigos que identifican el artículo dentro de su proveedor (los ART-… inventados no valen)."""
    out = set()
    for c in (a.codigo_proveedor, a.codigo_fabricante, a.codigo_principal):
        c = _cod(c)
        if len(c) >= 3 and not c.startswith("ART"):
            out.add(c)
    return out


def ean_valido(s: Optional[str]) -> bool:
    s = re.sub(r"\D", "", s or "")
    if len(s) not in (8, 12, 13, 14):
        return False
    cuerpo, control = s[:-1], int(s[-1])
    suma = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(cuerpo)))
    return (10 - suma % 10) % 10 == control


def _fecha(doc: Document) -> date:
    if doc.doc_date:
        return doc.doc_date
    return doc.created_at.date() if doc.created_at else date.min


class _Historial:
    """Todas las compras leídas, indexadas para encontrar las anteriores de un artículo."""

    def __init__(self, db: Session, menos_doc: int):
        filas = (db.query(Article, Document)
                 .join(Document, Document.id == Article.document_id)
                 .filter(Document.id != menos_doc, Document.status == "completed",
                         Article.coste_neto_unitario > 0)
                 .all())
        self.nombres: dict = {}          # clave del proveedor → nombre, para juntar sus distintas formas
        self.por_ean: dict = defaultdict(list)
        self.por_codigo: dict = defaultdict(list)
        self.por_desc: dict = defaultdict(list)
        for a, d in filas:
            if d.supplier_name == MANUAL:
                continue
            prov = clave(d.supplier_name or "")
            self.nombres.setdefault(prov, d.supplier_name or "")
            fila = (a, d)
            e = re.sub(r"\D", "", a.ean or "")
            if len(e) >= 8:
                self.por_ean[e].append(fila)
            for c in _codigos(a):
                self.por_codigo[(prov, c)].append(fila)
            ds = _desc(a.descripcion)
            if len(ds) >= 6:
                self.por_desc[(prov, ds)].append(fila)

    def formas(self, proveedor: Optional[str]) -> list:
        """Las claves con las que está guardado ese mismo proveedor (cada forma de escribirlo)."""
        propia = clave(proveedor or "")
        return [propia] + [c for c, n in self.nombres.items() if c != propia and mismo(proveedor, n)]

    def de(self, a: Article, provs: list) -> list:
        """Compras del mismo artículo, de la más reciente a la más antigua."""
        vistos, out = set(), []
        e = re.sub(r"\D", "", a.ean or "")
        grupos = [self.por_ean.get(e, []) if len(e) >= 8 else []]
        ds = _desc(a.descripcion)
        for prov in provs:
            grupos += [self.por_codigo.get((prov, c), []) for c in _codigos(a)]
            # La descripción sola solo vale si el artículo no trae código (dos medidas distintas se llaman parecido)
            if not _codigos(a) and len(ds) >= 6:
                grupos.append(self.por_desc.get((prov, ds), []))
        for g in grupos:
            for art, doc in g:
                if art.id not in vistos:
                    vistos.add(art.id)
                    out.append((art, doc))
        out.sort(key=lambda x: (_fecha(x[1]), x[1].id), reverse=True)
        return out


IGUAL_PCT = 0.5  # por debajo de esto el coste se da por igual (redondeos del proveedor)


def _estado(coste: float, anterior: Optional[float]) -> tuple:
    if not anterior or anterior <= 0:
        return "nuevo", None
    pct = (coste - anterior) / anterior * 100
    if abs(pct) < IGUAL_PCT or abs(coste - anterior) < 0.005:
        return "igual", 0.0
    return ("sube" if pct > 0 else "baja"), round(pct, 1)


def recepcion(db: Session, doc: Document) -> dict:
    """Lo que enseña «Recibir mercancía»: cada línea con su compra anterior y el resumen de arriba."""
    hist = _Historial(db, doc.id)
    prov = hist.formas(doc.supplier_name)
    hoy = (_fecha(doc), doc.id)
    lineas = []
    n = {"nuevo": 0, "igual": 0, "sube": 0, "baja": 0}
    for a in sorted(doc.articles, key=lambda x: (x.line_number or 0, x.id)):
        compras = hist.de(a, prov)
        antes = [(art, d) for art, d in compras if (_fecha(d), d.id) <= hoy]
        prev = antes[0] if antes else None
        estado, pct = _estado(a.coste_neto_unitario or 0, prev[0].coste_neto_unitario if prev else None)
        if (a.coste_neto_unitario or 0) <= 0:
            estado, pct = "sin_coste", None
        else:
            n[estado] += 1
        pvp_antes = prev[0].pvp_con_iva if prev else None
        lineas.append({
            "id": a.id,
            "estado": estado,
            "pct": pct,
            "coste_anterior": prev[0].coste_neto_unitario if prev else None,
            "pvp_anterior": pvp_antes,
            "pvp_cambia": bool(prev) and pvp_antes is not None and abs((a.pvp_con_iva or 0) - pvp_antes) >= 0.005,
            "fecha_anterior": str(_fecha(prev[1])) if prev else None,
            "proveedor_anterior": prev[1].supplier_name if prev and clave(prev[1].supplier_name or "") not in prov else None,
            "compras": len(antes),
            "historial": [{
                "fecha": str(_fecha(d)), "coste": art.coste_neto_unitario, "pvp": art.pvp_con_iva,
                "cantidad": art.cantidad, "doc_id": d.id, "doc_number": d.doc_number, "proveedor": d.supplier_name,
                "otro_proveedor": bool(d.supplier_name) and clave(d.supplier_name) not in prov,
            } for art, d in antes[:6]],
        })
    etiquetar = [l["id"] for l in lineas if l["estado"] == "nuevo" or l["pvp_cambia"]]
    sin_codigo = sum(1 for a in doc.articles if not ean_valido(a.ean))
    return {
        "resumen": {"total": len(lineas), **n, "sin_codigo_barras": sin_codigo, "para_etiquetar": len(etiquetar)},
        "etiquetar": etiquetar,
        "lineas": lineas,
    }


def heredar(db: Session, doc: Document, settings) -> int:
    """Al terminar de leer un albarán: cada artículo coge de su compra anterior el código de barras que
    se escaneó y, si el coste no ha cambiado, el precio de venta que la tienda fijó a mano. Devuelve
    cuántos artículos tocó. No hace commit."""
    from app.api.articles import recalc_article

    hist = _Historial(db, doc.id)
    prov = hist.formas(doc.supplier_name)
    hoy = (_fecha(doc), doc.id)
    tocados = 0
    for a in doc.articles:
        antes = [(art, d) for art, d in hist.de(a, prov) if (_fecha(d), d.id) <= hoy]
        if not antes:
            continue
        cambio = False
        if not ean_valido(a.ean):
            con_ean = next((art for art, _ in antes if ean_valido(art.ean)), None)
            if con_ean:
                a.ean = re.sub(r"\D", "", con_ean.ean)
                cambio = True
        prev = antes[0][0]
        estado, _ = _estado(a.coste_neto_unitario or 0, prev.coste_neto_unitario)
        if estado == "igual" and prev.pvp_fijo and not a.pvp_fijo and abs((a.pvp_con_iva or 0) - prev.pvp_fijo) >= 0.005:
            a.pvp_fijo = prev.pvp_fijo
            recalc_article(a, settings, doc.pronto_pago_pct)
            cambio = True
        tocados += cambio
    return tocados
