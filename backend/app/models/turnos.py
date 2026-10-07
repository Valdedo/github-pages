"""Turnos del personal: ajustes de rotación, cambios sueltos, vacaciones y festivos."""
from typing import Optional

from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TurnoAjustes(Base):
    """Una sola fila con la configuración en JSON (empleados, tipos de turno, semanas tipo, rotación)."""
    __tablename__ = "turnos_ajustes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    datos: Mapped[str] = mapped_column(Text)


class TurnoCambio(Base):
    """Un día concreto distinto de lo normal para un empleado."""
    __tablename__ = "turnos_cambios"
    __table_args__ = (UniqueConstraint("empleado", "fecha"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    empleado: Mapped[str] = mapped_column(String(40), index=True)
    fecha: Mapped[str] = mapped_column(String(10), index=True)  # AAAA-MM-DD
    tipo: Mapped[str] = mapped_column(String(40))
    nota: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class Vacacion(Base):
    __tablename__ = "turnos_vacaciones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    empleado: Mapped[str] = mapped_column(String(40), index=True)
    inicio: Mapped[str] = mapped_column(String(10))
    fin: Mapped[str] = mapped_column(String(10))
    nota: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class Festivo(Base):
    __tablename__ = "turnos_festivos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fecha: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120))
