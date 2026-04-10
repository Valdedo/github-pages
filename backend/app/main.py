"""
Albarán Processor API - FastAPI application.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.database import create_tables
from app.api import documents, articles, export, settings, product_info, analytics, repairs, supplier_orders

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    logger.info("Starting Albarán Processor API...")

    # Ensure data directories exist (important when volume is freshly mounted)
    from app.config import settings as app_settings
    Path(app_settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Path(app_settings.export_dir).mkdir(parents=True, exist_ok=True)
    logger.info(f"Upload dir: {app_settings.upload_dir}")
    logger.info(f"Export dir: {app_settings.export_dir}")
    logger.info(f"Database URL: {app_settings.database_url}")

    create_tables()
    logger.info("Database tables created/verified.")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Albarán Processor API",
    description="API para procesar albaranes con OCR/IA y gestionar artículos",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in production, restrict to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(documents.router)
app.include_router(articles.router)
app.include_router(export.router)
app.include_router(settings.router)
app.include_router(product_info.router)
app.include_router(analytics.router)
app.include_router(repairs.router)
app.include_router(supplier_orders.router)


@app.get("/api/dashboard/stats")
def dashboard_stats():
    """Aggregate stats for the home dashboard."""
    from app.database import SessionLocal
    from app.models.document import Document
    from app.models.repair import Repair
    from app.models.supplier_order import SupplierOrder
    from sqlalchemy import func

    db = SessionLocal()
    try:
        # Documents
        doc_total = db.query(func.count(Document.id)).scalar() or 0
        doc_processing = db.query(func.count(Document.id)).filter(Document.status == "processing").scalar() or 0

        # Repairs
        repair_rows = db.query(Repair.status, func.count(Repair.id)).group_by(Repair.status).all()
        repair_stats = {r[0]: r[1] for r in repair_rows}

        # Orders
        order_rows = db.query(SupplierOrder.status, func.count(SupplierOrder.id)).group_by(SupplierOrder.status).all()
        order_stats = {r[0]: r[1] for r in order_rows}

        # Recent documents (last 5)
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
                "pending": repair_stats.get("recibida", 0) + repair_stats.get("en_taller", 0) + repair_stats.get("reparada", 0),
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


@app.get("/health")
def health():
    from app.config import settings as app_settings
    import os
    upload_ok = os.path.isdir(app_settings.upload_dir)
    export_ok = os.path.isdir(app_settings.export_dir)
    data_writable = os.access("/data", os.W_OK) if os.path.exists("/data") else False
    return {
        "status": "ok",
        "service": "Albarán Processor API",
        "upload_dir_exists": upload_ok,
        "export_dir_exists": export_ok,
        "data_writable": data_writable,
    }
