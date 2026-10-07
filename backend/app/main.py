"""
Albarán Processor API - FastAPI application.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from app.database import create_tables
from app.api import documents, articles, export, settings, product_info, analytics, repairs, supplier_orders, dashboard, catalog, firmas, acceso, correo, turnos, push

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Version tag — bump this to confirm new build is running
APP_VERSION = "3.1.0"


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
    try:
        from app.api.firmas import rellenar_importes
        rellenar_importes()
    except Exception as e:  # nunca debe impedir arrancar
        logger.warning(f"No se pudieron rellenar importes de albaranes: {e}")
    from app.services.backup_service import arrancar_repaso
    arrancar_repaso()
    logger.info(f"App version: {APP_VERSION} — routers: dashboard, documents, articles, export, settings, products, analytics, repairs, orders")
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

# ── Acceso por código ────────────────────────────────────────────
# Mientras no se hayan creado los códigos, la app está abierta (como antes).
# Con códigos: /api/* pide sesión; «reparto» solo puede usar /api/firmas y ver los turnos.
from fastapi import Request
from fastapi.responses import JSONResponse
from app.services import access_service as _acc

_LIBRES = ("/api/acceso", "/api/firmas/compartir/")


@app.middleware("http")
async def control_de_acceso(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith("/api/") or path.startswith(_LIBRES):
        return await call_next(request)
    if not _acc.config():
        return await call_next(request)
    tok = request.headers.get("authorization", "").removeprefix("Bearer ").strip() or request.query_params.get("t")
    rol = _acc.verificar(tok)
    if not rol:
        return JSONResponse({"detail": "Hace falta el código de acceso"}, status_code=401)
    request.state.rol = rol
    if rol == "reparto" and not (path.startswith("/api/firmas") or path.startswith("/api/push")
                                 or (path.startswith("/api/turnos") and request.method == "GET")):
        return JSONResponse({"detail": "El código de reparto solo da acceso a las firmas"}, status_code=403)
    return await call_next(request)


# Register API routers
app.include_router(dashboard.router)
app.include_router(documents.router)
app.include_router(articles.router)
app.include_router(export.router)
app.include_router(settings.router)
app.include_router(product_info.router)
app.include_router(analytics.router)
app.include_router(repairs.router)
app.include_router(supplier_orders.router)
app.include_router(catalog.router)
app.include_router(firmas.router)
app.include_router(acceso.router)
app.include_router(correo.router)
app.include_router(turnos.router)
app.include_router(push.router)


@app.get("/health")
def health():
    from app.config import settings as app_settings
    import os
    upload_ok = os.path.isdir(app_settings.upload_dir)
    export_ok = os.path.isdir(app_settings.export_dir)
    data_writable = os.access("/data", os.W_OK) if os.path.exists("/data") else False
    routes = sorted({r.path for r in app.routes})
    return {
        "status": "ok",
        "version": APP_VERSION,
        "service": "Albarán Processor API",
        "upload_dir_exists": upload_ok,
        "export_dir_exists": export_ok,
        "data_writable": data_writable,
        "routes": routes,
    }
