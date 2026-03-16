from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, func
from sqlalchemy.orm import mapped_column, Mapped

from app.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    detection_keywords: Mapped[str] = mapped_column(Text, default="[]")   # JSON list of strings
    template_config: Mapped[str] = mapped_column(Text, default="{}")      # JSON object
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
