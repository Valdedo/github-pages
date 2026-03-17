import json
from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, func
from sqlalchemy.orm import mapped_column, Mapped

from app.database import Base

DEFAULT_MARGIN_TIERS = json.dumps([
    {"min_cost": 0,      "max_cost": 1.00,   "margin_pct": 200},
    {"min_cost": 1.01,   "max_cost": 5.00,   "margin_pct": 120},
    {"min_cost": 5.01,   "max_cost": 20.00,  "margin_pct": 70},
    {"min_cost": 20.01,  "max_cost": 80.00,  "margin_pct": 45},
    {"min_cost": 80.01,  "max_cost": 200.00, "margin_pct": 30},
    {"min_cost": 200.01, "max_cost": None,   "margin_pct": 20},
])


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    margin_tiers: Mapped[str] = mapped_column(Text, default=DEFAULT_MARGIN_TIERS)
    rounding_mode: Mapped[str] = mapped_column(String(30), default="standard")
    rounding_decimals: Mapped[int] = mapped_column(Integer, default=2)
    label_columns: Mapped[int] = mapped_column(Integer, default=2)
    label_rows_per_page: Mapped[int] = mapped_column(Integer, default=5)
    base_url: Mapped[str] = mapped_column(String(512), default="http://localhost:3000")
    company_name: Mapped[str] = mapped_column(String(256), default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
