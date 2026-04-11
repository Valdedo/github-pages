"""
Supplier order management endpoints.
Track purchase orders to suppliers.
"""
import logging
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.supplier_order import SupplierOrder, SupplierOrderLine
from app.schemas.supplier_order import (
    SupplierOrderCreate, SupplierOrderUpdate, SupplierOrderResponse,
    SupplierOrderListItem, SupplierOrderLineCreate, SupplierOrderLineUpdate,
    SupplierOrderLineResponse, VALID_STATUSES, MANUAL_STATUSES
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/orders", tags=["orders"])


def _recalculate_status(order: SupplierOrder) -> str:
    """Recompute order status from line receipts.
    Manual statuses (pedido, entregado, cancelado) are never overridden."""
    if order.status in MANUAL_STATUSES:
        return order.status
    if not order.lines:
        return order.status
    total = sum(ln.cantidad for ln in order.lines)
    received = sum(ln.cantidad_recibida for ln in order.lines)
    if received == 0:
        return "pendiente"
    if received >= total:
        return "recibido"
    return "parcial"


@router.get("", response_model=List[SupplierOrderListItem])
def list_orders(
    status: Optional[str] = None,
    supplier_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(SupplierOrder).order_by(SupplierOrder.order_date.desc(), SupplierOrder.created_at.desc())
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
    order_data = order_in.model_dump(exclude={"lines"})
    order = SupplierOrder(**order_data)
    db.add(order)
    db.flush()

    for ln in lines_data:
        line = SupplierOrderLine(order_id=order.id, **ln.model_dump())
        db.add(line)

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

    for field, value in data.items():
        setattr(order, field, value)

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
    line = SupplierOrderLine(order_id=order_id, **line_in.model_dump())
    db.add(line)
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
    for field, value in data.items():
        setattr(line, field, value)

    # Recompute order status from lines
    order = db.query(SupplierOrder).filter(SupplierOrder.id == order_id).first()
    if order and order.status != "cancelado":
        order.status = _recalculate_status(order)
        # Auto-set received_date when fully received
        if order.status == "recibido" and not order.received_date:
            order.received_date = date.today()

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
    if order and order.status != "cancelado":
        db.flush()
        db.refresh(order)
        order.status = _recalculate_status(order)

    db.commit()
    return {"ok": True}
