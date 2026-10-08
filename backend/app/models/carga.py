"""Órdenes de carga: lo apuntado en la libreta, leído de una foto, para cargar el camión
y que cada cliente firme su hoja de entrega (sin precios)."""
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OrdenCarga(Base):
    """Un viaje del camión. Puede llevar las entregas de varios clientes."""
    __tablename__ = "ordenes_carga"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # preparando | cargado | entregado
    estado: Mapped[str] = mapped_column(String(20), default="preparando", index=True)
    fotos: Mapped[str] = mapped_column(Text, default="[]")       # JSON: nombres de archivo
    texto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # lo dictado o escrito
    huellas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # sha256 de las fotos, para avisar de repetidas
    notas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    creado_por: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    entregas: Mapped[List["EntregaCarga"]] = relationship(
        "EntregaCarga", back_populates="orden", cascade="all, delete-orphan", order_by="EntregaCarga.orden_n",
    )


class EntregaCarga(Base):
    """Lo de un cliente dentro del viaje. Es lo que firma el cliente."""
    __tablename__ = "entregas_carga"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    orden_id: Mapped[int] = mapped_column(Integer, ForeignKey("ordenes_carga.id", ondelete="CASCADE"), index=True)
    orden_n: Mapped[int] = mapped_column(Integer, default=0)
    numero: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)  # OC-2026-0001

    cliente: Mapped[str] = mapped_column(String(200), default="")
    cliente_leido: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # lo que entendió la IA
    lugar: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    telefono: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    cuando: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)   # «esta semana», «martes»…
    servir: Mapped[bool] = mapped_column(Boolean, default=True)                 # «Ser.»: se lleva a la obra
    pagado: Mapped[bool] = mapped_column(Boolean, default=False)
    notas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dudas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)           # lo que no se leyó claro

    # pendiente | entregada
    estado: Mapped[str] = mapped_column(String(20), default="pendiente", index=True)
    firma_archivo: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    firmado_por: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    firmado_dni: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    firmado_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    entregado_por: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    treyfact_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    foto_entrega: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # foto del material descargado
    drive_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)     # copia de la hoja en Drive

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    orden: Mapped["OrdenCarga"] = relationship("OrdenCarga", back_populates="entregas")
    lineas: Mapped[List["LineaCarga"]] = relationship(
        "LineaCarga", back_populates="entrega", cascade="all, delete-orphan", order_by="LineaCarga.orden_n",
    )


class LineaCarga(Base):
    __tablename__ = "lineas_carga"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entrega_id: Mapped[int] = mapped_column(Integer, ForeignKey("entregas_carga.id", ondelete="CASCADE"), index=True)
    orden_n: Mapped[int] = mapped_column(Integer, default=0)
    cantidad: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unidad: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)   # sacos, m³, ud, kg…
    descripcion: Mapped[str] = mapped_column(Text, default="")
    original: Mapped[Optional[str]] = mapped_column(Text, nullable=True)       # tal como estaba escrito
    duda: Mapped[Optional[str]] = mapped_column(Text, nullable=True)           # por qué hay que revisarla
    leido: Mapped[Optional[str]] = mapped_column(Text, nullable=True)          # lo que entendió la IA al leerla
    # Confirmada: corregida a mano o entregada y firmada. Solo de estas se aprende.
    confirmada: Mapped[bool] = mapped_column(Boolean, default=False)
    # Lo que se ha cargado: None = nada; igual a cantidad = todo
    cargado: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cargado_ok: Mapped[bool] = mapped_column(Boolean, default=False)

    entrega: Mapped["EntregaCarga"] = relationship("EntregaCarga", back_populates="lineas")
