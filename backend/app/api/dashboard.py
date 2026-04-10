"""Dashboard stats endpoint."""
from fastapi import APIRouter
from sqlalchemy import func

from app.database import SessionLocal
from app.models.document import Document
from app.models.repair import Repair
from app.models.supplier_order import SupplierOrder

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def dashboard_stats():
    """Aggregate stats for the home dashboard."""
    db = SessionLocal()
    try:
        doc_total = db.query(func.count(Document.id)).scalar() or 0
        doc_processing = db.query(func.count(Document.id)).filter(Document.status == "processing").scalar() or 0

        repair_rows = db.query(Repair.status, func.count(Repair.id)).group_by(Repair.status).all()
        repair_stats = {r[0]: r[1] for r in repair_rows}

        order_rows = db.query(SupplierOrder.status, func.count(SupplierOrder.id)).group_by(SupplierOrder.status).all()
        order_stats = {r[0]: r[1] for r in order_rows}

        recent_docs = (
            db.query(Document)
            .order_by(Document.created_at.desc())
            .limit(5)
            .all()
        )

        return {
            "documents": {
                "total": doc_total,
                "processing": doc_processing,
            },
            "repairs": {
                "recibida": repair_stats.get("recibida", 0),
                "en_taller": repair_stats.get("en_taller", 0),
                "reparada": repair_stats.get("reparada", 0),
                "entregada": repair_stats.get("entregada", 0),
                "pending": (
                    repair_stats.get("recibida", 0)
                    + repair_stats.get("en_taller", 0)
                    + repair_stats.get("reparada", 0)
                ),
            },
            "orders": {
                "pendiente": order_stats.get("pendiente", 0),
                "parcial": order_stats.get("parcial", 0),
                "recibido": order_stats.get("recibido", 0),
                "pending": order_stats.get("pendiente", 0) + order_stats.get("parcial", 0),
            },
            "recent_documents": [
                {
                    "id": d.id,
                    "original_filename": d.original_filename,
                    "status": d.status,
                    "supplier_name": d.supplier_name,
                    "created_at": d.created_at.isoformat(),
                }
                for d in recent_docs
            ],
        }
    finally:
        db.close()
