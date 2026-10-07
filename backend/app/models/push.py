"""Avisos en el móvil (Web Push)."""
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PushConfig(Base):
    """Claves VAPID del servidor (una sola fila, se crean solas)."""
    __tablename__ = "push_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    private_pem: Mapped[str] = mapped_column(Text)
    public_key: Mapped[str] = mapped_column(String(120))  # base64url, punto sin comprimir


class PushSub(Base):
    """Un móvil u ordenador que ha activado los avisos."""
    __tablename__ = "push_subs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    endpoint: Mapped[str] = mapped_column(String(600), unique=True, index=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(80))
    rol: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)      # tienda | admin | reparto
    persona: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # melchor, patricia…
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
