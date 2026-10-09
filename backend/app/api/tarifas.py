"""Catálogo de tarifas de proveedor (en pruebas: Andrés; Manolo lo ve en su vista de consulta)."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.services import access_service as acc
from app.database import get_db
from app.services import tarifas_service as ts



def puede_ver(request: Request):
    if acc.config() and getattr(request.state, "rol", None) not in ("admin", "consulta"):
        raise HTTPException(403, "Las tarifas solo las ven Andrés y Manolo por ahora")


router = APIRouter(prefix="/api/tarifas", tags=["tarifas"], dependencies=[Depends(puede_ver)])


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
