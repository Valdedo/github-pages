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
        ("entregas_carga", "lista_at",     "DATETIME"),  # «Listo para llevar»: carga confirmada y bloqueada
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
        # Órdenes de carga desde el albarán de TreyFACT (oct. 2026)
        ("entregas_carga", "albaran_id",  "INTEGER REFERENCES client_delivery_notes(id) ON DELETE SET NULL"),
        ("lineas_carga", "codigo",        "VARCHAR(40)"),
        # Repaso del 15/10/2026: el albarán cambió después de leer sus materiales (no se le pasa la firma solo)
        ("entregas_carga", "albaran_cambiado", "BOOLEAN DEFAULT 0"),
        # Huella del archivo de un albarán de compra, para no leer dos veces el mismo
        ("documents", "huella",           "VARCHAR(64)"),
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

        # Arreglo puntual (13/10/2026): la obra / referencia se leía mal (solo el renglón de «REFERENCIA»).
        # Se vuelve a leer de cada PDF original con la lectura nueva; solo cambia si ahora sale algo.
        try:
            conn.execute(sa.text("ALTER TABLE client_delivery_notes ADD COLUMN obra_v2 INTEGER"))
            conn.commit()
            primera_vez = True
        except Exception:
            conn.rollback()
            primera_vez = False
        if primera_vez:
            try:
                from pathlib import Path
                from app.services.firma_service import parse_albaran
                filas = conn.execute(sa.text("SELECT id, original_path, obra FROM client_delivery_notes")).fetchall()
                cambiadas = 0
                for nid, ruta, vieja in filas:
                    try:
                        p = Path(ruta or "")
                        if not p.exists():
                            continue
                        nueva = parse_albaran(p.read_bytes(), p.name).obra or None
                        if nueva and nueva != vieja:
                            conn.execute(sa.text("UPDATE client_delivery_notes SET obra = :o WHERE id = :i"), {"o": nueva, "i": nid})
                            cambiadas += 1
                    except Exception:
                        continue
                conn.commit()
                import logging
                logging.getLogger(__name__).info("Obra/referencia releída en %s albaranes de venta", cambiadas)
            except Exception:
                conn.rollback()

        def una_vez(tabla: str, marca: str) -> bool:
            """Arreglo puntual: la columna marca que ya se hizo. Si se crea ahora, es la primera vez."""
            try:
                conn.execute(sa.text(f"ALTER TABLE {tabla} ADD COLUMN {marca} INTEGER"))
                conn.commit()
                return True
            except Exception:
                conn.rollback()
                return False

        # Arreglo puntual (15/10/2026): el precio sin IVA (el que va a TreyFACT) se saca del de la etiqueta,
        # con 4 decimales, para que TreyFACT cobre lo mismo que la etiqueta. El de la etiqueta no cambia.
        if una_vez("articles", "precio_v2"):
            try:
                conn.execute(sa.text(
                    "UPDATE articles SET pvp_sin_iva = ROUND(pvp_con_iva / (1 + COALESCE(iva_pct, 21) / 100.0), 4) "
                    "WHERE pvp_con_iva > 0"))
                conn.commit()
            except Exception:
                conn.rollback()

        # Arreglo puntual (15/10/2026): las líneas sin código eran ART-0001, ART-0002… en cada albarán y se
        # repetían entre albaranes. Pasan a ART-<albarán>-<línea> (únicos).
        if una_vez("articles", "codigo_v2"):
            try:
                conn.execute(sa.text(
                    "UPDATE articles SET codigo_principal = 'ART-' || document_id || '-' || "
                    "CAST(SUBSTR(codigo_principal, 5) AS INTEGER) "
                    "WHERE codigo_principal GLOB 'ART-[0-9][0-9][0-9][0-9]'"))
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
