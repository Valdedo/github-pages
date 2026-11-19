"""
PDA del almacén: consultar precios y poner códigos de barras con el lector de mano.
La pantalla es `frontend/public/pda/index.html` (una sola página, sin React). El código de acceso «pda»
solo puede usar estas rutas (lista en `main.py`); el encargado y la tienda también pueden.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import pda_service

router = APIRouter(prefix="/api/pda", tags=["pda"])


@router.get("/precio")
def precio(q: str = Query("", max_length=80), db: Session = Depends(get_db)):
    return pda_service.buscar(db, q)


@router.get("/albaranes")
def albaranes(db: Session = Depends(get_db)):
    return pda_service.albaranes(db)


@router.get("/albaranes/{doc_id}")
def albaran(doc_id: int, db: Session = Depends(get_db)):
    r = pda_service.albaran(db, doc_id)
    if not r:
        raise HTTPException(404, "Ese albarán ya no está")
    return r


class Ean(BaseModel):
    ean: str = ""
    forzar: bool = False


@router.put("/articulos/{art_id}/ean")
def poner_ean(art_id: int, data: Ean, db: Session = Depends(get_db)):
    r = pda_service.poner_ean(db, art_id, data.ean, data.forzar)
    if r is None:
        raise HTTPException(404, "Ese artículo ya no está en el albarán")
    return r
