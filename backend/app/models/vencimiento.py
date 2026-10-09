"""Vencimientos de las facturas de proveedor (los lee el script de facturas y los manda aquí)."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Vencimiento(Base):
    """Un plazo de una factura. Una factura sin fecha de vencimiento tiene una fila con fecha None."""
    __tablename__ = "vencimientos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_id: Mapped[str] = mapped_column(String(120), index=True)  # PDF en Drive (identifica la factura)
    proveedor: Mapped[str] = mapped_column(String(200), default="")
    numero: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    fecha_factura: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    importe_factura: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fecha: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)  # vencimiento
    importe: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    plazo: Mapped[int] = mapped_column(Integer, default=1)
    plazos: Mapped[int] = mapped_column(Integer, default=1)
    forma_pago: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    recibido_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
