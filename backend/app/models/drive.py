"""Albaranes de proveedor en Drive: qué carpeta corresponde a cada proveedor."""
from typing import Optional

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DriveCarpeta(Base):
    """Proveedor (nombre normalizado) → carpeta de Drive. Se aprende al elegirla una vez."""
    __tablename__ = "drive_carpetas"

    clave: Mapped[str] = mapped_column(String(200), primary_key=True)
    folder_id: Mapped[str] = mapped_column(String(100))
    folder_name: Mapped[str] = mapped_column(String(200))


class DriveAjustes(Base):
    """Desde qué albarán se empieza a guardar (los anteriores se dejan como estaban)."""
    __tablename__ = "drive_ajustes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    desde_doc_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
