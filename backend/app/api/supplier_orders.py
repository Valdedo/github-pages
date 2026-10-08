"""
Supplier order management endpoints.
Track purchase orders to suppliers.
"""
import logging
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.supplier_order import SupplierOrder, SupplierOrderLine
from app.schemas.supplier_order import (
    SupplierOrderCreate, SupplierOrderUpdate, SupplierOrderResponse,
    SupplierOrderListItem, SupplierOrderLineCreate, SupplierOrderLineUpdate,
    SupplierOrderLineResponse, VALID_STATUSES
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orders", tags=["orders"])


def _hoy() -> date:
    """Fecha de hoy en Madrid (el servidor va en UTC)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Europe/Madrid")).date()


def _sin_recibir(order: SupplierOrder) -> str:
    """Estado cuando no ha llegado nada: «pedido» si alguna vez se marcó como pedido;
    si no, «pendiente» (por pedir). Los pedidos antiguos (sin ese dato) quedan en «pedido»."""
    return "pendiente" if order.marcado_pedido is False else "pedido"


def _recalculate_status(order: SupplierOrder) -> str:
    """Estado del pedido según lo recibido en las líneas.
    Entregado y cancelado no se tocan. Si no ha llegado nada, se queda en «por pedir» o «pedido»."""
    if order.status in ("entregado", "cancelado"):
        return order.status
    if not order.lines:
        return order.status if order.status in ("pendiente", "pedido") else _sin_recibir(order)
    total = sum(ln.cantidad or 0 for ln in order.lines)
    received = sum(min(ln.cantidad_recibida or 0, ln.cantidad or 0) for ln in order.lines)
    if received <= 0:
        return order.status if order.status in ("pendiente", "pedido") else _sin_recibir(order)
    if received >= total:
        return "recibido"
    return "parcial"


def _validar_linea(data: dict) -> None:
    if "cantidad" in data and (data["cantidad"] is None or data["cantidad"] <= 0):
        raise HTTPException(422, "La cantidad tiene que ser mayor que 0")
    if data.get("cantidad_recibida") is not None and data["cantidad_recibida"] < 0:
        raise HTTPException(422, "La cantidad recibida no puede ser negativa")
    if data.get("precio_unitario") is not None and data["precio_unitario"] < 0:
        raise HTTPException(422, "El precio no puede ser negativo")


def _aplicar_estado(order: SupplierOrder) -> None:
    """Recalcula el estado tras cambiar líneas y ajusta la fecha de recepción y el aviso."""
    if order.status == "cancelado":
        return
    antes = order.status
    order.status = _recalculate_status(order)
    if order.status == "recibido" and not order.received_date:
        order.received_date = _hoy()
    if order.status != "recibido" and antes == "recibido":
        order.received_date = None
    if order.status == "recibido" and antes != "recibido":
        _avisar_llegada(order)


def _avisar_llegada(order: SupplierOrder) -> None:
    """Aviso a la tienda cuando llega todo un pedido de cliente."""
    try:
        from app.services import push_service
        push_service.avisar(
            push_service.a_tienda,
            f"Ha llegado el pedido de {order.client_name or 'un cliente'}",
            "Ya está todo. Avisa al cliente para que pase a recogerlo.",
            f"/pedidos/{order.id}", f"pedido-{order.id}",
        )
    except Exception as e:  # el aviso nunca debe romper la recepción
        logger.warning("No se pudo avisar de la llegada del pedido %s: %s", order.id, e)


@router.get("", response_model=List[SupplierOrderListItem])
def list_orders(
    status: Optional[str] = None,
    supplier_id: Optional[int] = None,
    skip: int = 0,
    limit: int = Query(default=1000, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    q = db.query(SupplierOrder).options(selectinload(SupplierOrder.lines)).order_by(SupplierOrder.order_date.desc(), SupplierOrder.created_at.desc())
    if status:
        q = q.filter(SupplierOrder.status == status)
    if supplier_id:
        q = q.filter(SupplierOrder.supplier_id == supplier_id)
    orders = q.offset(skip).limit(limit).all()

    result = []
    for o in orders:
        lines_received = sum(1 for ln in o.lines if ln.cantidad_recibida >= ln.cantidad)
        result.append(SupplierOrderListItem(
            id=o.id,
            client_name=o.client_name or "",
            client_phone=o.client_phone,
            supplier_name=o.supplier_name,
            order_date=o.order_date,
            expected_date=o.expected_date,
            status=o.status,
            reference=o.reference,
            line_count=len(o.lines),
            lines_received=lines_received,
            aviso_at=o.aviso_at,
            created_at=o.created_at,
        ))
    return result


@router.get("/stats")
def order_stats(db: Session = Depends(get_db)):
    """Return counts per status for dashboard badges."""
    from sqlalchemy import func
    rows = db.query(SupplierOrder.status, func.count(SupplierOrder.id)).group_by(SupplierOrder.status).all()
    stats = {r[0]: r[1] for r in rows}
    return {
        "pendiente": stats.get("pendiente", 0),
        "parcial": stats.get("parcial", 0),
        "recibido": stats.get("recibido", 0),
        "cancelado": stats.get("cancelado", 0),
        "total": sum(stats.values()),
        "pending": stats.get("pendiente", 0) + stats.get("parcial", 0),
    }


@router.post("", response_model=SupplierOrderResponse)
def create_order(order_in: SupplierOrderCreate, db: Session = Depends(get_db)):
    if order_in.status not in VALID_STATUSES:
        raise HTTPException(400, f"Estado inválido: {VALID_STATUSES}")

    lines_data = order_in.lines
    for ln in lines_data:
        _validar_linea(ln.model_dump())
    order_data = order_in.model_dump(exclude={"lines"})
    order = SupplierOrder(**order_data)
    order.marcado_pedido = order.status not in ("pendiente",)
    db.add(order)
    db.flush()

    for ln in lines_data:
        line = SupplierOrderLine(order_id=order.id, **ln.model_dump())
        db.add(line)
    db.flush()
    db.refresh(order)
    order.status = _recalculate_status(order)  # sin aviso: se acaba de crear

    db.commit()
    db.refresh(order)
    return order


@router.get("/{order_id}", response_model=SupplierOrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(SupplierOrder).filter(SupplierOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "Pedido no encontrado")
    return order


@router.put("/{order_id}", response_model=SupplierOrderResponse)
def update_order(order_id: int, update: SupplierOrderUpdate, db: Session = Depends(get_db)):
    order = db.query(SupplierOrder).filter(SupplierOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "Pedido no encontrado")

    data = update.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in VALID_STATUSES:
        raise HTTPException(400, f"Estado inválido: {VALID_STATUSES}")

    if data.get("client_name", "") is None:
        data["client_name"] = ""

    antes = order.status
    for field, value in data.items():
        setattr(order, field, value)

    nuevo = data.get("status")
    if nuevo and nuevo != "pendiente" and nuevo != "cancelado":
        order.marcado_pedido = True   # pedido (o ya llegado/entregado): se pidió
    elif nuevo == "pendiente":
        order.marcado_pedido = False  # vuelto a «por pedir» a mano
    if nuevo == "recibido" and antes != "recibido":
        # «Marcar recibido» a mano: todo lo pedido ha llegado
        for ln in order.lines:
            ln.cantidad_recibida = ln.cantidad
        if not order.received_date:
            order.received_date = _hoy()
    elif nuevo in ("pendiente", "pedido") and antes in ("parcial", "recibido"):
        # Deshacer la recepción
        for ln in order.lines:
            ln.cantidad_recibida = 0
        order.received_date = None

    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(SupplierOrder).filter(SupplierOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "Pedido no encontrado")
    db.delete(order)
    db.commit()
    return {"ok": True}


# ── Order lines ──────────────────────────────────────────────────────────────

@router.post("/{order_id}/lines", response_model=SupplierOrderLineResponse)
def add_line(order_id: int, line_in: SupplierOrderLineCreate, db: Session = Depends(get_db)):
    order = db.query(SupplierOrder).filter(SupplierOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "Pedido no encontrado")
    _validar_linea(line_in.model_dump())
    line = SupplierOrderLine(order_id=order_id, **line_in.model_dump())
    db.add(line)
    db.flush()
    db.refresh(order)
    _aplicar_estado(order)  # p. ej. un pedido «recibido» con una línea nueva pasa a «parcial»
    db.commit()
    db.refresh(line)
    return line


@router.put("/{order_id}/lines/{line_id}", response_model=SupplierOrderLineResponse)
def update_line(
    order_id: int,
    line_id: int,
    update: SupplierOrderLineUpdate,
    db: Session = Depends(get_db),
):
    line = db.query(SupplierOrderLine).filter(
        SupplierOrderLine.id == line_id,
        SupplierOrderLine.order_id == order_id,
    ).first()
    if not line:
        raise HTTPException(404, "Línea no encontrada")

    data = update.model_dump(exclude_unset=True)
    _validar_linea(data)
    for field, value in data.items():
        setattr(line, field, value)

    db.flush()  # ensure updated line is visible to _recalculate_status

    # Recompute order status from lines
    order = db.query(SupplierOrder).filter(SupplierOrder.id == order_id).first()
    if order:
        db.refresh(order)
        _aplicar_estado(order)

    db.commit()
    db.refresh(line)
    return line


@router.delete("/{order_id}/lines/{line_id}")
def delete_line(order_id: int, line_id: int, db: Session = Depends(get_db)):
    line = db.query(SupplierOrderLine).filter(
        SupplierOrderLine.id == line_id,
        SupplierOrderLine.order_id == order_id,
    ).first()
    if not line:
        raise HTTPException(404, "Línea no encontrada")
    db.delete(line)

    # Recompute order status
    order = db.query(SupplierOrder).filter(SupplierOrder.id == order_id).first()
    if order:
        db.flush()
        db.refresh(order)
        _aplicar_estado(order)

    db.commit()
    return {"ok": True}
