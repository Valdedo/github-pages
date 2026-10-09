from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool

from app.config import settings


# SQLite needs special config for multi-thread access
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False, "timeout": 15}
    # Una conexión por petición (no una compartida): con varias personas a la vez,
    # una conexión compartida mezclaba las operaciones de unas y otras.
    _pool = {"poolclass": StaticPool} if ":memory:" in settings.database_url else {}
    engine = create_engine(settings.database_url, connect_args=connect_args, **_pool)

    # WAL mode: allows reads to proceed while a write transaction is open.
    # busy_timeout: wait up to 5 s instead of failing immediately on a locked DB.
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA busy_timeout=15000")
else:
    engine = create_engine(settings.database_url)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from app.models import document, article, supplier, product_info, app_settings, repair, supplier_order, client_delivery_note, access, turnos, push, drive, carga, vencimiento, tarifa  # noqa
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations():
    """Apply incremental SQLite column additions for existing databases."""
    migrations = [
        ("app_settings", "company_name",        "TEXT DEFAULT ''"),
        ("app_settings", "rounding_mode",        "TEXT DEFAULT 'ceil_5cents'"),
        ("app_settings", "rounding_decimals",    "INTEGER DEFAULT 2"),
        ("app_settings", "label_columns",        "INTEGER DEFAULT 2"),
        ("app_settings", "label_rows_per_page",  "INTEGER DEFAULT 5"),
        ("app_settings", "base_url",             "TEXT DEFAULT 'http://localhost:3000'"),
        # Document validation columns (added for total verification feature)
        ("documents", "base_imponible_doc",      "REAL"),
        ("documents", "total_iva_doc",           "REAL"),
        ("documents", "total_recargo_doc",       "REAL"),
        ("documents", "total_doc",               "REAL"),
        ("documents", "total_calculado",         "REAL"),
        ("documents", "validacion_ok",           "INTEGER"),
        ("documents", "validacion_notas",        "TEXT"),
        ("product_info", "ficha_ia",             "TEXT"),
        # Repair tracking dates (v2.2.0)
        ("repairs", "date_sent_to_repair",       "TEXT"),
        ("repairs", "date_repaired",             "TEXT"),
        # Client-centric order fields (v2.2.0)
        ("supplier_orders", "client_name",       "TEXT DEFAULT ''"),
        ("supplier_orders", "client_phone",      "TEXT"),
        # Article category (v2.3.0)
        ("articles", "familia",                  "TEXT"),
        # Per-line supplier (v2.4.0)
        ("supplier_order_lines", "supplier_name", "TEXT"),
        # Envío de albaranes firmados (v2.6.0)
        ("client_delivery_notes", "share_token", "TEXT"),
        ("client_delivery_notes", "emailed_to",  "TEXT"),
        ("client_delivery_notes", "emailed_at",  "DATETIME"),
        # Seguimiento de albaranes (v2.7.0)
        ("client_delivery_notes", "importe",      "REAL"),
        ("client_delivery_notes", "copia_at",     "DATETIME"),
        ("client_delivery_notes", "whatsapp_at",  "DATETIME"),
        ("client_delivery_notes", "facturado_at", "DATETIME"),
        ("client_delivery_notes", "factura_ref",  "TEXT"),
        # Copia en Drive y envío automático (v2.8.0)
        ("client_delivery_notes", "backup_at",    "DATETIME"),
        ("client_contacts",       "auto_email",   "INTEGER DEFAULT 0"),
        # Código del encargado (v3.0.0)
        ("access_config",         "admin_hash",   "TEXT"),
        ("access_config",         "codigos_env",  "TEXT"),
        ("access_codigos",        "propio",       "INTEGER DEFAULT 0"),
        # Albaranes de proveedor en Drive (v3.2.0)
        ("documents", "terminado_at",     "DATETIME"),
        ("repairs", "aviso_at",           "DATETIME"),
        ("supplier_orders", "aviso_at",   "DATETIME"),
        ("ordenes_carga", "huellas",      "TEXT"),
        ("entregas_carga", "cliente_leido", "VARCHAR(200)"),
        ("entregas_carga", "foto_entrega", "VARCHAR(200)"),
        ("entregas_carga", "drive_at",     "DATETIME"),
        ("lineas_carga", "leido",          "TEXT"),
        # Órdenes de carga enviadas al móvil de Melchor
        ("ordenes_carga", "enviada_at",    "DATETIME"),
        ("lineas_carga", "confirmada",     "BOOLEAN DEFAULT 0"),
        ("documents", "drive_file_id",    "TEXT"),
        ("documents", "drive_url",        "TEXT"),
        ("documents", "drive_carpeta_id", "TEXT"),
        ("documents", "drive_carpeta",    "TEXT"),
        ("documents", "drive_pendiente",  "INTEGER"),
        ("documents", "drive_error",      "TEXT"),
        ("documents", "drive_at",         "DATETIME"),
        # Reparto en el camión (v3.1.0)
        ("client_delivery_notes", "reparto_at",   "DATETIME"),
        ("client_delivery_notes", "reparto_orden", "INTEGER"),
        # Albaranes de proveedor en varias fotos: todas las rutas (v3.3.0)
        ("documents", "file_paths",       "TEXT"),
        ("supplier_orders", "marcado_pedido", "BOOLEAN"),
        # Catálogo de tarifas: PDF de facturas del proveedor para abrirlas directamente
        ("tarifa_copias", "archivos",     "TEXT"),
    ]
    sa = __import__("sqlalchemy")
    with engine.connect() as conn:
        for table, column, col_def in migrations:
            try:
                conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
                conn.commit()
            except Exception:
                pass  # column already exists

        # Arreglo puntual (una sola vez): las hojas de entrega con foto se subieron a Drive sin la
        # firma. La columna marca que ya se hizo; si se crea ahora, es la primera vez → se vuelven a subir.
        try:
            conn.execute(sa.text("ALTER TABLE entregas_carga ADD COLUMN hoja_foto_ok INTEGER"))
            conn.commit()
            primera_vez = True
        except Exception:
            conn.rollback()
            primera_vez = False
        if primera_vez:
            try:
                conn.execute(sa.text("UPDATE entregas_carga SET drive_at = NULL WHERE foto_entrega IS NOT NULL"))
                conn.commit()
            except Exception:
                conn.rollback()

        # Fix existing rows that still have NULL after ALTER TABLE ADD COLUMN
        # (SQLite only sets DEFAULT for new rows, not existing ones)
        null_fixes = [
            ("app_settings", "rounding_mode",       "'ceil_5cents'"),
            ("app_settings", "rounding_decimals",   "2"),
            ("app_settings", "label_columns",       "2"),
            ("app_settings", "label_rows_per_page", "5"),
            ("app_settings", "company_name",        "''"),
            ("app_settings", "base_url",            "'http://localhost:3000'"),
        ]
        for table, column, default_val in null_fixes:
            try:
                conn.execute(sa.text(
                    f"UPDATE {table} SET {column} = {default_val} WHERE {column} IS NULL"
                ))
                conn.commit()
            except Exception:
                pass
