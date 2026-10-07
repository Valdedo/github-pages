from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AccessConfig(Base):
    """Códigos de acceso a la app (tienda y reparto). Una sola fila."""
    __tablename__ = "access_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tienda_hash: Mapped[str] = mapped_column(String(200))
    reparto_hash: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Código del encargado (Andrés): todo lo de la tienda + cambiar turnos y códigos
    admin_hash: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Huella de la variable CODIGOS ya aplicada (para no cerrar sesiones en cada arranque)
    codigos_env: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    secret: Mapped[str] = mapped_column(String(100))
    # Se incrementa al cambiar los códigos: invalida las sesiones antiguas
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AccessCodigo(Base):
    """Un código por persona (o por dispositivo compartido de la tienda)."""
    __tablename__ = "access_codigos"

    persona: Mapped[str] = mapped_column(String(40), primary_key=True)  # andres, patricia, oscar, melchor, tienda
    rol: Mapped[str] = mapped_column(String(20))                         # admin | tienda | reparto
    hash: Mapped[str] = mapped_column(String(200))
