"""
Repair management endpoints.
Track tools sent for repair / service.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.repair import Repair
from app.schemas.repair import RepairCreate, RepairUpdate, RepairResponse, VALID_STATUSES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/repairs", tags=["repairs"])


_ORDEN = {"recibida": 0, "en_taller": 1, "reparada": 2, "entregada": 3}


def _dia(v):
    return v.date() if hasattr(v, "date") else v


def _validar(data: dict, recibida=None) -> None:
    for campo in ("estimated_price", "final_price"):
        if data.get(campo) is not None and data[campo] < 0:
            raise HTTPException(422, "El importe no puede ser negativo")
    rec = data.get("date_received") or recibida
    if rec:
        for campo in ("date_returned", "date_estimated_return"):
            if data.get(campo) and _dia(data[campo]) < _dia(rec):
                raise HTTPException(422, "La fecha de entrega no puede ser anterior a la de recepción")


@router.get("", response_model=List[RepairResponse])
def list_repairs(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(default=1000, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    q = db.query(Repair).order_by(Repair.created_at.desc())
    if status:
        q = q.filter(Repair.status == status)
    return q.offset(skip).limit(limit).all()


@router.get("/stats")
def repair_stats(db: Session = Depends(get_db)):
    """Return counts per status for dashboard badges."""
    from sqlalchemy import func
    rows = db.query(Repair.status, func.count(Repair.id)).group_by(Repair.status).all()
    stats = {r[0]: r[1] for r in rows}
    return {
        "recibida": stats.get("recibida", 0),
        "en_taller": stats.get("en_taller", 0),
        "reparada": stats.get("reparada", 0),
        "entregada": stats.get("entregada", 0),
        "total": sum(stats.values()),
        "pending": stats.get("recibida", 0) + stats.get("en_taller", 0) + stats.get("reparada", 0),
    }


@router.post("", response_model=RepairResponse)
def create_repair(repair_in: RepairCreate, db: Session = Depends(get_db)):
    if repair_in.status not in VALID_STATUSES:
        raise HTTPException(400, f"Estado inválido. Valores: {VALID_STATUSES}")
    _validar(repair_in.model_dump())
    repair = Repair(**repair_in.model_dump(exclude_none=True))
    db.add(repair)
    db.commit()
    db.refresh(repair)
    return repair


@router.get("/{repair_id}", response_model=RepairResponse)
def get_repair(repair_id: int, db: Session = Depends(get_db)):
    repair = db.query(Repair).filter(Repair.id == repair_id).first()
    if not repair:
        raise HTTPException(404, "Reparación no encontrada")
    return repair


@router.put("/{repair_id}", response_model=RepairResponse)
def update_repair(repair_id: int, update: RepairUpdate, db: Session = Depends(get_db)):
    repair = db.query(Repair).filter(Repair.id == repair_id).first()
    if not repair:
        raise HTTPException(404, "Reparación no encontrada")

    data = update.model_dump(exclude_unset=True)
    # Los obligatorios no se pueden vaciar; el resto sí (null = borrar)
    for campo in ("client_name", "tool_description", "problem_description", "status", "date_received"):
        if campo in data and data[campo] is None:
            data.pop(campo)

    if "status" in data and data["status"] not in VALID_STATUSES:
        raise HTTPException(400, f"Estado inválido. Valores: {VALID_STATUSES}")

    _validar(data, repair.date_received)
    if "date_received" in data:  # al cambiar la recepción, se revisan las fechas ya guardadas
        _validar({"date_returned": repair.date_returned, "date_estimated_return": repair.date_estimated_return,
                  **{k: v for k, v in data.items() if k in ("date_returned", "date_estimated_return")}},
                 data["date_received"])

    # Auto-set tracking dates when status advances
    from datetime import datetime as _dt
    new_status = data.get("status")
    if new_status and new_status in _ORDEN and repair.status in _ORDEN:
        # Vuelve a un estado anterior: se quita lo que ya no es cierto
        if _ORDEN[new_status] < 2 <= _ORDEN[repair.status]:
            data.setdefault("aviso_at", None)
            data.setdefault("date_repaired", None)
        if _ORDEN[new_status] < 3 == _ORDEN[repair.status]:
            data.setdefault("date_returned", None)
    if new_status == "en_taller" and not repair.date_sent_to_repair:
        data.setdefault("date_sent_to_repair", _dt.utcnow())
    if new_status == "reparada" and not repair.date_repaired:
        data.setdefault("date_repaired", _dt.utcnow())
    if new_status == "entregada" and not repair.date_returned:
        data.setdefault("date_returned", _dt.utcnow())

    for field, value in data.items():
        setattr(repair, field, value)

    db.commit()
    db.refresh(repair)
    return repair


@router.delete("/{repair_id}")
def delete_repair(repair_id: int, db: Session = Depends(get_db)):
    repair = db.query(Repair).filter(Repair.id == repair_id).first()
    if not repair:
        raise HTTPException(404, "Reparación no encontrada")
    db.delete(repair)
    db.commit()
    return {"ok": True}
