"""Catálogo de tarifas de proveedor (en pruebas: Andrés; Manolo lo ve en su vista de consulta)."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.services import access_service as acc
from app.database import get_db
from app.services import tarifas_service as ts



def puede_ver(request: Request):
    if acc.config() and getattr(request.state, "rol", None) not in ("admin", "tienda", "consulta"):
        raise HTTPException(403, "Con este código no se pueden ver las tarifas")


router = APIRouter(prefix="/api/tarifas", tags=["tarifas"], dependencies=[Depends(puede_ver)])


def _admin(request: Request) -> bool:
    return not acc.config() or getattr(request.state, "rol", None) == "admin"


def _prov(prov: str, request: Request) -> str:
    # Las tarifas «en pruebas» (Isoltubex, oct. 2026) solo las ve Andrés hasta que dé el visto bueno
    if prov not in ts.TARIFAS or (ts.TARIFAS[prov].get("en_pruebas") and not _admin(request)):
        raise HTTPException(404, "Esa tarifa no está en el catálogo")
    return prov


@router.get("")
def proveedores(request: Request, db: Session = Depends(get_db)):
    return ts.resumen(db, en_pruebas=_admin(request))


@router.get("/{prov}")
def tarifa(prov: str, request: Request, db: Session = Depends(get_db)):
    try:
        return ts.tarifa(db, _prov(prov, request))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.post("/{prov}/actualizar")
def actualizar(prov: str, request: Request, db: Session = Depends(get_db)):
    try:
        return ts.tarifa(db, _prov(prov, request), forzar=True)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.get("/{prov}/articulo")
def articulo(prov: str, request: Request, ref: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    try:
        f = ts.ficha(db, _prov(prov, request), ref)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    if not f:
        raise HTTPException(404, "Ese artículo ya no está en la tarifa (puede que le hayan cambiado el nombre)")
    return f
