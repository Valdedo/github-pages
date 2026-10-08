"""Copias de seguridad en Google Drive (casafonsomc@gmail.com): albaranes firmados y,
una vez al día, la base de datos entera.

Cada PDF firmado se sube una vez a «Albaranes firmados/<código> - <cliente>/<AAAA-MM>/».
Se intenta justo después de firmar y, por si falla, se repasa cada 30 minutos.
"""
import logging
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.services import mail_service

logger = logging.getLogger(__name__)
_lock = threading.Lock()
_Session = None


def _session():
    """Sesión con conexión propia para el hilo en segundo plano."""
    global _Session
    if _Session is None:
        from sqlalchemy import create_engine, event
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import NullPool
        from app.config import settings
        args = {"check_same_thread": False, "timeout": 15} if settings.database_url.startswith("sqlite") else {}
        eng = create_engine(settings.database_url, connect_args=args, poolclass=NullPool)
        if settings.database_url.startswith("sqlite"):
            @event.listens_for(eng, "connect")
            def _pragmas(conn, _):
                conn.execute("PRAGMA busy_timeout=15000")
        _Session = sessionmaker(bind=eng, autoflush=False)
    return _Session()
TZ = ZoneInfo("Europe/Madrid")


def _clean(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "-", s).strip() or "Sin nombre"


def carpeta(n) -> str:
    cli = f"{n.codigo_cliente} - {n.cliente}" if n.codigo_cliente else (n.cliente or "Sin cliente")
    mes = (n.fecha or "")[:7] or "Sin fecha"
    return f"Albaranes firmados/{_clean(cli)}/{mes}"


def backup_pendientes() -> int:
    """Sube los firmados que aún no tienen copia. Devuelve cuántos se han subido."""
    if not mail_service.configured() or not _lock.acquire(blocking=False):
        return 0
    from app.models.client_delivery_note import ClientDeliveryNote
    hechos = 0
    db = _session()
    try:
        notes = (db.query(ClientDeliveryNote)
                 .filter(ClientDeliveryNote.status == "firmado", ClientDeliveryNote.backup_at.is_(None))
                 .all())
        for n in notes:
            p = Path(n.signed_path or "")
            if not p.exists():
                continue
            try:
                mail_service.backup_pdf(carpeta(n), f"{_clean(n.numero)} firmado.pdf", p.read_bytes())
                n.backup_at = datetime.now(TZ).replace(tzinfo=None)
                db.commit()
                hechos += 1
            except Exception as e:
                logger.warning("Copia en Drive fallida para %s: %s", n.numero, e)
                db.rollback()
                break  # si falla uno (sin red, cuota…), se reintenta en el próximo repaso
        hechos += _hojas_de_entrega(db)
    finally:
        db.close()
        _lock.release()
    if hechos:
        logger.info("Copia en Drive: %d documento(s) subidos", hechos)
    return hechos


def _hojas_de_entrega(db) -> int:
    """Hojas de entrega firmadas (órdenes de carga) en «Hojas de entrega/<cliente>/<AAAA-MM>/»."""
    from app.config import settings
    from app.models.carga import EntregaCarga
    from app.services import carga_service
    d = Path(settings.upload_dir) / "cargas"
    hechos = 0
    for e in (db.query(EntregaCarga)
              .filter(EntregaCarga.estado == "entregada", EntregaCarga.drive_at.is_(None)).all()):
        try:
            leer = lambda n: (d / n).read_bytes() if n and (d / n).exists() else None
            pdf = carga_service.hoja_pdf(e, leer(e.firma_archivo), leer(e.foto_entrega))
            mes = (e.firmado_at or datetime.utcnow()).strftime("%Y-%m")
            mail_service.backup_pdf(f"Hojas de entrega/{_clean(e.cliente or 'Sin cliente')}/{mes}",
                                    f"{_clean(e.numero or str(e.id))} - {_clean(e.cliente or 'cliente')}.pdf", pdf)
            e.drive_at = datetime.now(TZ).replace(tzinfo=None)
            db.commit()
            hechos += 1
        except Exception as ex:
            logger.warning("Copia en Drive de la hoja %s fallida: %s", e.numero, ex)
            db.rollback()
            break
    return hechos


_ultima_copia_db = {"dia": None}


def backup_base_de_datos() -> bool:
    """Una copia al día de la base de datos (clientes, pedidos, turnos…) en Drive.
    Carpeta «Copias de seguridad app», un archivo por día comprimido."""
    from app.config import settings
    hoy = datetime.now(TZ).date().isoformat()
    if _ultima_copia_db["dia"] == hoy or not mail_service.configured():
        return False
    if not settings.database_url.startswith("sqlite:///"):
        return False
    import gzip
    import sqlite3
    import tempfile
    origen = settings.database_url.removeprefix("sqlite:///")
    with tempfile.TemporaryDirectory() as tmp:
        copia = Path(tmp) / "app.db"
        src = sqlite3.connect(origen, timeout=30)
        dst = sqlite3.connect(copia)
        try:
            src.backup(dst)  # copia consistente aunque la app esté escribiendo
        finally:
            dst.close()
            src.close()
        datos = gzip.compress(copia.read_bytes())
    mail_service.backup_pdf("Copias de seguridad app", f"casafonso-{hoy}.db.gz", datos)
    _ultima_copia_db["dia"] = hoy
    logger.info("Copia diaria de la base de datos en Drive (%d KB)", len(datos) // 1024)
    return True


def backup_en_segundo_plano():
    threading.Thread(target=backup_pendientes, daemon=True).start()


def arrancar_repaso(intervalo_s: int = 1800):
    def bucle():
        time.sleep(30)
        while True:
            try:
                backup_pendientes()
            except Exception as e:
                logger.warning("Error en el repaso de copias: %s", e)
            try:
                backup_base_de_datos()
            except Exception as e:
                logger.warning("Error en la copia diaria de la base de datos: %s", e)
            time.sleep(intervalo_s)
    threading.Thread(target=bucle, daemon=True, name="backup-drive").start()
