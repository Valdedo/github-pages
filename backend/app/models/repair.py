from datetime import datetime
from sqlalchemy import Integer, String, Text, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import mapped_column, Mapped, relationship
from typing import Optional

from app.database import Base


class Repair(Base):
    __tablename__ = "repairs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Client info
    client_name: Mapped[str] = mapped_column(String(200))
    client_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Tool info
    tool_brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tool_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tool_description: Mapped[str] = mapped_column(Text)  # e.g. "Taladro percutor"

    # Problem
    problem_description: Mapped[str] = mapped_column(Text)

    # Status: recibida | en_taller | reparada | entregada
    status: Mapped[str] = mapped_column(String(20), default="recibida", index=True)

    # Pricing
    estimated_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    final_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Dates
    date_received: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    date_estimated_return: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    date_returned: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Internal notes
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
