"""Catálogo de tarifas de proveedor (en pruebas: Andrés; Manolo lo ve en su vista de consulta)."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
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


def _rol(request: Request):
    return getattr(request.state, "rol", None) if acc.config() else None


def _prov(prov: str, request: Request) -> str:
    # Las tarifas «en pruebas» (Isoltubex, oct. 2026) solo las ve Andrés hasta que dé el visto bueno;
    # «ocultar_a»: las que no ve un rol (Manolo no ve los piensos, 20/10/2026)
    if (prov not in ts.TARIFAS or (ts.TARIFAS[prov].get("en_pruebas") and not _admin(request))
            or ts.oculta(prov, _rol(request))):
        raise HTTPException(404, "Esa tarifa no está en el catálogo")
    return prov


@router.get("")
def proveedores(request: Request, db: Session = Depends(get_db)):
    return ts.resumen(db, en_pruebas=_admin(request), rol=_rol(request))


@router.get("/etiquetas")
def etiquetas(
    request: Request,
    items: str = Query(..., description="tarifa|ref de cada artículo, separados por ~, en el orden en que salen"),
    inicio: int = Query(1, ge=1, le=12, description="Por qué pegatina del folio empezar"),
    marco: bool = False,
    db: Session = Depends(get_db),
):
    """PDF con las etiquetas de balda (97 × 42,3 mm, las mismas de «Recibir mercancía») de artículos de las tarifas."""
    from app.api.compras import _ajuste, _pdf
    from app.services.label_service import generate_shelf_labels_pdf
    if acc.config() and getattr(request.state, "rol", None) not in ("admin", "tienda"):
        raise HTTPException(403, "Con este código no se pueden imprimir etiquetas")
    pares = []
    for x in items.split("~")[:600]:
        prov, _, ref = x.partition("|")
        if prov and ref:
            try:
                pares.append((_prov(prov, request), ref))
            except HTTPException:
                continue
    lista = ts.etiquetas(db, pares)
    if not lista:
        raise HTTPException(422, "Elige al menos un artículo con precio")
    dx, dy = _ajuste(db)
    return _pdf(generate_shelf_labels_pdf(lista, inicio, dx, dy, marco), "etiquetas_tarifa.pdf")


class PonerPvp(BaseModel):
    ref: str
    pvp_iva: Optional[float] = None  # con IVA; None = volver al precio de la hoja


@router.put("/{prov}/pvp")
def poner_pvp(prov: str, datos: PonerPvp, request: Request, db: Session = Depends(get_db)):
    """Cambia el precio de venta de un artículo desde la app (solo el encargado, y solo en las tarifas que lo permiten)."""
    if not _admin(request):
        raise HTTPException(403, "El precio solo lo cambia el encargado")
    prov = _prov(prov, request)
    try:
        ts.poner_pvp(db, prov, datos.ref, datos.pvp_iva, getattr(request.state, "persona", None))
        f = ts.ficha(db, prov, datos.ref)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    if not f:
        raise HTTPException(404, "Ese artículo ya no está en la tarifa")
    return f


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
