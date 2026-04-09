from datetime import datetime
from sqlalchemy import Integer, String, Text, Float, Boolean, DateTime, ForeignKey, func, JSON
from sqlalchemy.orm import mapped_column, Mapped, relationship
from typing import Optional

from app.database import Base


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    line_number: Mapped[int] = mapped_column(Integer, default=0)
    descripcion: Mapped[str] = mapped_column(Text)
    cantidad: Mapped[float] = mapped_column(Float, default=1.0)
    precio_unitario_bruto: Mapped[float] = mapped_column(Float, default=0.0)

    # Cascading discounts (as percentages 0–100)
    descuento_1: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    descuento_2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    descuento_3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    descuento_4: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    coste_neto_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    coste_neto_total: Mapped[float] = mapped_column(Float, default=0.0)

    iva_pct: Mapped[float] = mapped_column(Float, default=21.0)
    recargo_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Margin & pricing
    margen_pct: Mapped[float] = mapped_column(Float, default=0.0)
    margen_override: Mapped[bool] = mapped_column(Boolean, default=False)
    pvp_sin_iva: Mapped[float] = mapped_column(Float, default=0.0)
    pvp_con_iva: Mapped[float] = mapped_column(Float, default=0.0)

    # Codes
    codigo_proveedor: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    codigo_fabricante: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ean: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    codigo_principal: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    otros_codigos: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    product_info_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("product_info.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="articles")  # noqa: F821
    product_info: Mapped[Optional["ProductInfo"]] = relationship("ProductInfo")  # noqa: F821
