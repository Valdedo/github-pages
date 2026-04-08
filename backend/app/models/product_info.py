from datetime import datetime
from sqlalchemy import Integer, String, Text, Boolean, DateTime, func
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional

from app.database import Base


class ProductInfo(Base):
    __tablename__ = "product_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    codigo_principal: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    descripcion: Mapped[str] = mapped_column(Text)
    specs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)       # JSON dict
    ficha_ia: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # AI-generated description paragraph
    source_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    manual_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    search_attempted: Mapped[bool] = mapped_column(Boolean, default=False)
    cached_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
