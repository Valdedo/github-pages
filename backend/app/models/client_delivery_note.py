from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ClientDeliveryNote(Base):
    """Albarán de venta (treyFACT) pendiente de firma o ya firmado por el cliente."""
    __tablename__ = "client_delivery_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    numero: Mapped[str] = mapped_column(String(50), index=True)
    fecha: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, index=True)  # YYYY-MM-DD
    codigo_cliente: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    cliente: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    obra: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # pendiente | firmado
    status: Mapped[str] = mapped_column(String(20), default="pendiente", index=True)

    original_path: Mapped[str] = mapped_column(String(500))
    signed_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, default=1)

    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # hora local de Madrid
    signed_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    signer_dni: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    nota: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Importe total del albarán (leído del PDF)
    importe: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Seguimiento: copia entregada, WhatsApp, facturado
    copia_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    whatsapp_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    facturado_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    factura_ref: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Copia de seguridad en Google Drive
    backup_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Envío al cliente
    share_token: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    emailed_to: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    emailed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ClientContact(Base):
    """Email y teléfono de cada cliente (por código de treyFACT), para no escribirlos cada vez."""
    __tablename__ = "client_contacts"

    codigo_cliente: Mapped[str] = mapped_column(String(30), primary_key=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    telefono: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Enviar el albarán por correo automáticamente al firmarlo
    auto_email: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
