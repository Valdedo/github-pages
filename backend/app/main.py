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
from app.api import documents, articles, export, settings, product_info

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
