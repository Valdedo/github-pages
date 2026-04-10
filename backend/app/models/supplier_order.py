from datetime import datetime, date
from sqlalchemy import Integer, String, Text, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import mapped_column, Mapped, relationship
from typing import Optional, List

from app.database import Base


class SupplierOrder(Base):
    __tablename__ = "supplier_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    supplier_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    supplier_name: Mapped[str] = mapped_column(String(200))

    order_date: Mapped[date] = mapped_column(Date)
    expected_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    received_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="pendiente", index=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    document_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )

    # Python-side defaults so values are available immediately after INSERT
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    lines: Mapped[List["SupplierOrderLine"]] = relationship(
        "SupplierOrderLine", back_populates="order", cascade="all, delete-orphan", order_by="SupplierOrderLine.id"
    )
    supplier: Mapped[Optional["Supplier"]] = relationship("Supplier")  # noqa: F821
    document: Mapped[Optional["Document"]] = relationship("Document")  # noqa: F821


class SupplierOrderLine(Base):
    __tablename__ = "supplier_order_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("supplier_orders.id", ondelete="CASCADE"), index=True
    )

    descripcion: Mapped[str] = mapped_column(Text)
    cantidad: Mapped[float] = mapped_column(Float, default=1.0)
    cantidad_recibida: Mapped[float] = mapped_column(Float, default=0.0)
    precio_unitario: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Python-side defaults
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    order: Mapped["SupplierOrder"] = relationship("SupplierOrder", back_populates="lines")
