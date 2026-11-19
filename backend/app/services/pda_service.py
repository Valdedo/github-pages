"""PDA del almacén (nov. 2026): lo justo para un lector de mano con poca máquina.

- Consultar un precio leyendo el código de barras (o tecleando el código o parte del nombre): se mira en los
  albaranes de compra ya leídos y en las tarifas de proveedor (la copia guardada; aquí nunca se va a Drive).
- Poner el código de barras a los artículos de un albarán que está por colocar.

Las respuestas son pequeñas a propósito: la PDA tiene poca memoria y un wifi regular.
"""
import json
import logging
import re
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.article import Article
from app.models.document import Document
from app.models.tarifa import TarifaCopia
from app.services import compras_service as cs
from app.services import tarifas_service as ts

logger = logging.getLogger(__name__)

MAX_RESULTADOS = 20
_idx: dict = {"clave": None, "ean": {}, "cod": {}, "todos": []}


def _digitos(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _formas_ean(s: str) -> list:
    """El mismo código con y sin el cero de delante (UPC de 12 cifras = EAN-13 con un 0)."""
    d = _digitos(s)
    return list(dict.fromkeys(x for x in (d, d.lstrip("0"), "0" + d) if x))


def _cod(s) -> str:
    return re.sub(r"\s+", "", str(s or "")).upper()


def _indice(db: Session) -> dict:
    """Artículos de todas las tarifas por EAN y por código. Se rehace solo cuando alguna tarifa se ha vuelto a leer."""
    copias = {c.proveedor: c for c in db.query(TarifaCopia).all()}
    clave = tuple(sorted((p, str(c.leido_at)) for p, c in copias.items()))
    if _idx["clave"] == clave:
        return _idx
    ean: dict = {}
    cod: dict = {}
    todos: list = []
    for prov, cfg in ts.TARIFAS.items():
        c = copias.get(prov)
        if not c or not c.hojas or cfg.get("en_pruebas"):
            continue
        try:
            datos = ts.LECTORES[prov](json.loads(c.hojas))
        except Exception as e:  # una tarifa rota no deja a la PDA sin las demás
            logger.warning("PDA: no se pudo leer la tarifa %s: %s", prov, e)
            continue
        for a in datos.get("articulos") or []:
            pvp = a.get("pvp")
            pvp_iva = a.get("pvp_iva")
            if pvp_iva is None and pvp is not None:
                pvp_iva = round(pvp * (1 + (a.get("iva") if a.get("iva") is not None else 21) / 100), 2)
            if pvp_iva is None:
                continue
            codigo = a.get("codigo") or (None if a.get("comodin") else a.get("ref"))
            nombre = a.get("nombre") or a.get("descripcion") or ""
            medida = a.get("medida_c")
            if medida and str(medida) not in nombre:
                nombre = f"{nombre} {medida}"
            it = {"nombre": nombre, "codigo": codigo, "ean": a.get("ean") or None, "pvp_iva": pvp_iva, "pvp": pvp,
                  "coste": None if a.get("solo_pvp") else a.get("coste"), "unidad": a.get("ud_venta") or a.get("unidad"),
                  "formato": a.get("formato"), "origen": "tarifa", "proveedor": cfg["nombre"], "fecha": a.get("fecha"),
                  "_n": ts.normaliza(f"{nombre} {a.get('descripcion') or ''} {codigo or ''}")}
            todos.append(it)
            if it["ean"]:
                for f in _formas_ean(it["ean"]):
                    ean.setdefault(f, []).append(it)
            for k in [codigo, a.get("ref"), *(a.get("alias") or [])]:
                if k and not (a.get("comodin") and k == a.get("ref")):
                    cod.setdefault(_cod(k), []).append(it)
    _idx.update(clave=clave, ean=ean, cod=cod, todos=todos)
    return _idx


def _limpio(it: dict) -> dict:
    return {k: v for k, v in it.items() if not k.startswith("_") and v not in (None, "")}


def _codigo_de(a: Article) -> Optional[str]:
    c = a.codigo_proveedor or a.codigo_principal or a.codigo_fabricante
    return None if not c or str(c).upper().startswith("ART-") else c


def _de_albaranes(filas: list) -> list:
    """De todas las líneas que casan, una por artículo: la de la compra más reciente, con cuántas compras hay."""
    filas = sorted(filas, key=lambda f: (cs._fecha(f[1]), f[0].id), reverse=True)
    vistos: dict = {}
    for a, d in filas:
        k = (a.ean and _digitos(a.ean)) or _cod(_codigo_de(a)) or ts.normaliza(a.descripcion or "")
        if k in vistos:
            vistos[k]["compras"] += 1
            continue
        vistos[k] = {"nombre": a.descripcion, "codigo": _codigo_de(a), "ean": a.ean, "pvp_iva": a.pvp_con_iva,
                     "pvp": round(a.pvp_sin_iva or 0, 2), "coste": round(a.coste_neto_unitario or 0, 4),
                     "origen": "albaran", "proveedor": d.supplier_name, "fecha": cs._fecha(d).isoformat(),
                     "doc": d.doc_number, "compras": 1}
    return [_limpio(v) for v in vistos.values()]


def _leidos(db: Session):
    return db.query(Article, Document).join(Document, Article.document_id == Document.id).filter(Document.status == "completed")


def buscar(db: Session, q: str) -> dict:
    q = (q or "").strip()
    if len(q) < 2:
        return {"q": q, "items": []}
    idx = _indice(db)
    d = _digitos(q)
    es_numero = bool(d) and len(d) == len(re.sub(r"\s", "", q))
    items: list = []

    # 1. Código de barras
    if es_numero and len(d) >= 8:
        formas = _formas_ean(d)
        items += _de_albaranes(_leidos(db).filter(Article.ean.in_(formas)).all())
        for f in formas:
            items += [_limpio(i) for i in idx["ean"].get(f, [])]
            if idx["ean"].get(f):
                break
    # 2. Código del proveedor, tal cual
    if not items:
        c = _cod(q)
        cols = (Article.codigo_proveedor, Article.codigo_principal, Article.codigo_fabricante)
        filas = _leidos(db).filter(or_(*[func.upper(func.replace(col, " ", "")) == c for col in cols])).all()
        items += _de_albaranes([f for f in filas if _codigo_de(f[0])])
        items += [_limpio(i) for i in idx["cod"].get(c, [])]
    # 3. Parte del nombre (o del código): todas las palabras
    if not items and not (es_numero and len(d) >= 8):
        palabras = [p for p in ts.normaliza(q).split() if p]
        if palabras and max(len(p) for p in palabras) >= 3:
            cons = _leidos(db)
            for p in palabras:
                cons = cons.filter(or_(Article.descripcion.ilike(f"%{p}%"), Article.codigo_proveedor.ilike(f"%{p}%")))
            items += _de_albaranes(cons.order_by(Article.id.desc()).limit(300).all())[:MAX_RESULTADOS]
            de_tarifa = [i for i in idx["todos"] if all(p in i["_n"] for p in palabras)]
            items += [_limpio(i) for i in de_tarifa[:MAX_RESULTADOS]]
    return {"q": q, "items": items[: MAX_RESULTADOS * 2]}


def _sin_codigo(a: Article) -> bool:
    return not cs.ean_valido(a.ean)


def albaranes(db: Session) -> list:
    """Los que están por colocar (leídos y sin terminar), con cuántos artículos siguen sin código de barras."""
    docs = (db.query(Document).filter(Document.status == "completed", Document.terminado_at.is_(None))
            .order_by(Document.created_at.desc(), Document.id.desc()).limit(60).all())
    out = []
    for d in docs:
        arts = db.query(Article).filter(Article.document_id == d.id).all()
        if not arts:
            continue
        out.append({"id": d.id, "proveedor": d.supplier_name or "Proveedor sin poner", "numero": d.doc_number,
                    "fecha": cs._fecha(d).isoformat(), "n": len(arts), "sin": sum(1 for a in arts if _sin_codigo(a))})
    return out


def _linea(a: Article) -> dict:
    return _limpio({"id": a.id, "nombre": a.descripcion, "codigo": _codigo_de(a), "cantidad": a.cantidad,
                    "ean": a.ean if cs.ean_valido(a.ean) else None, "pvp_iva": a.pvp_con_iva})


def albaran(db: Session, doc_id: int) -> Optional[dict]:
    d = db.get(Document, doc_id)
    if not d or d.status != "completed":
        return None
    arts = db.query(Article).filter(Article.document_id == d.id).order_by(Article.line_number, Article.id).all()
    return {"id": d.id, "proveedor": d.supplier_name or "Proveedor sin poner", "numero": d.doc_number,
            "fecha": cs._fecha(d).isoformat(), "articulos": [_linea(a) for a in arts]}


def poner_ean(db: Session, art_id: int, ean: str, forzar: bool = False) -> Optional[dict]:
    """Guarda el código de barras de un artículo. Devuelve None si el artículo no existe;
    `{"ok": False, "motivo": …}` si no se guarda (código que no es de producto, o ya lo tiene otra línea)."""
    a = db.get(Article, art_id)
    if not a:
        return None
    s = _digitos(ean)
    if not (ean or "").strip():
        a.ean = None
        db.commit()
        return {"ok": True, "articulo": _linea(a)}
    if not cs.ean_valido(s) or len(s) != len(re.sub(r"\s", "", ean)):
        return {"ok": False, "motivo": "no_ean",
                "texto": "Ese no es el código de barras del producto. Lee el de las rayas con números debajo."}
    otro = (db.query(Article).filter(Article.document_id == a.document_id, Article.id != a.id, Article.ean.in_(_formas_ean(s)))
            .first())
    if otro and not forzar:
        return {"ok": False, "motivo": "repetido", "otro": otro.descripcion,
                "texto": "Ese código ya lo tiene otro artículo de este albarán."}
    a.ean = s
    db.commit()
    return {"ok": True, "articulo": _linea(a)}
