"""Copia de seguridad de los albaranes firmados en Google Drive (casafonsomc@gmail.com).

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
    """Sesión con conexión propia: la app usa una única conexión compartida (StaticPool)
    y un hilo en segundo plano no debe tocarla, o deshace las operaciones en curso."""
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
    finally:
        db.close()
        _lock.release()
    if hechos:
        logger.info("Copia en Drive: %d albarán(es) subidos", hechos)
    return hechos


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
            time.sleep(intervalo_s)
    threading.Thread(target=bucle, daemon=True, name="backup-drive").start()
