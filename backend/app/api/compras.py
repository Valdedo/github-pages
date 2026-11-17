"""
«Recibir mercancía»: la vista nueva de los albaranes de compra (nov. 2026).
Lo que cambia en cada artículo respecto a la compra anterior, los proveedores conocidos y las
etiquetas de balda a la medida de los folios de la tienda (97 × 42,3 mm, 12 por A4).
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.app_settings import AppSettings
from app.models.article import Article
from app.models.document import Document
from app.services import compras_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/compras", tags=["compras"])


def _ajuste(db: Session) -> tuple:
    s = db.query(AppSettings).filter(AppSettings.id == 1).first()
    return (float(s.etq_dx or 0), float(s.etq_dy or 0)) if s else (0.0, 0.0)


class Ajuste(BaseModel):
    dx: float = 0.0   # mm a la derecha
    dy: float = 0.0   # mm hacia abajo


@router.get("/proveedores")
def proveedores(db: Session = Depends(get_db)):
    """Nombres de proveedor ya usados (para elegir en vez de escribir)."""
    return compras_service.conocidos(db)


@router.get("/ajuste-etiquetas", response_model=Ajuste)
def ver_ajuste(db: Session = Depends(get_db)):
    dx, dy = _ajuste(db)
    return Ajuste(dx=dx, dy=dy)


@router.put("/ajuste-etiquetas", response_model=Ajuste)
def poner_ajuste(a: Ajuste, request: Request, db: Session = Depends(get_db)):
    from app.api.turnos import solo_encargado
    solo_encargado(request)
    if abs(a.dx) > 15 or abs(a.dy) > 15:
        raise HTTPException(422, "El ajuste no puede pasar de 15 mm. Si se va más, revisa que imprimes a tamaño real (100 %).")
    s = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not s:
        s = AppSettings(id=1)
        db.add(s)
    s.etq_dx, s.etq_dy = round(a.dx, 1), round(a.dy, 1)
    db.commit()
    return a


def _pdf(datos: bytes, nombre: str) -> Response:
    return Response(datos, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{nombre}"', "Cache-Control": "no-store"})


@router.get("/etiquetas/prueba")
def etiquetas_prueba(db: Session = Depends(get_db)):
    from app.services.label_service import generate_shelf_test_pdf
    dx, dy = _ajuste(db)
    return _pdf(generate_shelf_test_pdf(dx, dy), "prueba_etiquetas.pdf")


@router.get("/etiquetas")
def etiquetas(
    ids: str = Query(..., description="Artículos, separados por comas, en el orden en que salen"),
    inicio: int = Query(1, ge=1, le=12, description="Por qué pegatina del folio empezar"),
    marco: bool = False,
    db: Session = Depends(get_db),
):
    """PDF con las etiquetas de balda de esos artículos."""
    from app.services.label_service import generate_shelf_labels_pdf
    try:
        lista = [int(x) for x in ids.split(",") if x.strip()][:600]
    except ValueError:
        raise HTTPException(422, "Lista de artículos no válida")
    if not lista:
        raise HTTPException(422, "Elige al menos un artículo")
    filas = (db.query(Article, Document).join(Document, Document.id == Article.document_id)
             .filter(Article.id.in_(set(lista))).all())
    por_id = {a.id: (a, d) for a, d in filas}
    items = []
    for i in lista:
        if i not in por_id:
            continue
        a, d = por_id[i]
        f = d.doc_date or (d.created_at.date() if d.created_at else None)
        principal = a.codigo_principal or ""
        items.append({
            "descripcion": a.descripcion,
            "pvp_con_iva": a.pvp_con_iva,
            "ean": a.ean if compras_service.ean_valido(a.ean) else None,
            "codigo": a.codigo_proveedor or a.codigo_fabricante or principal,
            "ref": a.codigo_proveedor or a.codigo_fabricante or (principal if not principal.startswith("ART-") else None),
            "coste": a.coste_neto_unitario,
            "fecha": f.strftime("%m/%y") if f else None,
        })
    dx, dy = _ajuste(db)
    return _pdf(generate_shelf_labels_pdf(items, inicio, dx, dy, marco), "etiquetas_balda.pdf")


@router.get("/{doc_id}")
def recepcion(doc_id: int, db: Session = Depends(get_db)):
    """Cada artículo del albarán con su compra anterior: nuevo, igual, sube o baja."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Ese albarán ya no existe")
    return compras_service.recepcion(db, doc)
