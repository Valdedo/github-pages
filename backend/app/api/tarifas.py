"""Catálogo de tarifas de proveedor (en pruebas: solo el encargado)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.turnos import solo_encargado
from app.database import get_db
from app.services import tarifas_service as ts

router = APIRouter(prefix="/api/tarifas", tags=["tarifas"], dependencies=[Depends(solo_encargado)])


def _prov(prov: str) -> str:
    if prov not in ts.TARIFAS:
        raise HTTPException(404, "Esa tarifa no está en el catálogo")
    return prov


@router.get("")
def proveedores(db: Session = Depends(get_db)):
    return ts.resumen(db)


@router.get("/{prov}")
def tarifa(prov: str, db: Session = Depends(get_db)):
    try:
        return ts.tarifa(db, _prov(prov))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.post("/{prov}/actualizar")
def actualizar(prov: str, db: Session = Depends(get_db)):
    try:
        return ts.tarifa(db, _prov(prov), forzar=True)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.get("/{prov}/articulo")
def articulo(prov: str, ref: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    try:
        f = ts.ficha(db, _prov(prov), ref)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    if not f:
        raise HTTPException(404, "Ese artículo ya no está en la tarifa (puede que le hayan cambiado el nombre)")
    return f
