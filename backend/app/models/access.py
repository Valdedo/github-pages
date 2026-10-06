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
    secret: Mapped[str] = mapped_column(String(100))
    # Se incrementa al cambiar los códigos: invalida las sesiones antiguas
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
