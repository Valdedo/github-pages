from sqlalchemy import create_engine
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
    from app.models import document, article, supplier, product_info, app_settings  # noqa
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations():
    """Apply incremental SQLite column additions for existing databases."""
    migrations = [
        ("app_settings", "company_name",        "TEXT DEFAULT ''"),
        ("app_settings", "rounding_mode",        "TEXT DEFAULT 'standard'"),
        ("app_settings", "rounding_decimals",    "INTEGER DEFAULT 2"),
        ("app_settings", "label_columns",        "INTEGER DEFAULT 2"),
        ("app_settings", "label_rows_per_page",  "INTEGER DEFAULT 5"),
        ("app_settings", "base_url",             "TEXT DEFAULT 'http://localhost:3000'"),
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
            ("app_settings", "rounding_mode",       "'standard'"),
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
