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


@router.get("", response_model=List[RepairResponse])
def list_repairs(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(default=100, ge=1, le=500),
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

    if "status" in data and data["status"] not in VALID_STATUSES:
        raise HTTPException(400, f"Estado inválido. Valores: {VALID_STATUSES}")

    # Auto-set tracking dates when status advances
    from datetime import datetime as _dt
    new_status = data.get("status")
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
