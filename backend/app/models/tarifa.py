"""Catálogo de tarifas de proveedor (en pruebas): copia de las hojas de Google Sheets
y registro de los precios de compra que se van viendo, para la evolución de cada artículo."""
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TarifaCopia(Base):
    """Última lectura de la hoja de un proveedor (los valores tal como se ven en cada pestaña)."""
    __tablename__ = "tarifa_copias"

    proveedor: Mapped[str] = mapped_column(String(40), primary_key=True)
    hojas: Mapped[str] = mapped_column(Text, default="{}")                 # JSON {pestaña: [[celdas]]}
    nombre: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    modificado: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # última edición en Drive (ISO)
    leido_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # UTC
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class TarifaPrecio(Base):
    """Un precio de compra visto en la tarifa (artículo + precio + mes). Se acumulan con el tiempo."""
    __tablename__ = "tarifa_precios"
    __table_args__ = (UniqueConstraint("proveedor", "articulo", "precio", "fecha", name="uq_tarifa_precio"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    proveedor: Mapped[str] = mapped_column(String(40), index=True)
    articulo: Mapped[str] = mapped_column(String(300), index=True)   # descripción tal cual en la tarifa
    precio: Mapped[float] = mapped_column(Float)
    unidad: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    fecha: Mapped[str] = mapped_column(String(20))                   # «sep-26», como en la tarifa
    visto_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
