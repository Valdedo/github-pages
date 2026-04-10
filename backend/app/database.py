from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool

from app.config import settings


# SQLite needs special config for multi-thread access
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine = create_engine(
        settings.database_url,
        connect_args=connect_args,
        poolclass=StaticPool,
    )

    # WAL mode: allows reads to proceed while a write transaction is open.
    # busy_timeout: wait up to 5 s instead of failing immediately on a locked DB.
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA busy_timeout=5000")
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
    from app.models import document, article, supplier, product_info, app_settings, repair, supplier_order  # noqa
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
    ]
    sa = __import__("sqlalchemy")
    with engine.connect() as conn:
        for table, column, col_def in migrations:
            try:
                conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))
                conn.commit()
            except Exception:
                pass  # column already exists

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
