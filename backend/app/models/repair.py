from datetime import datetime
from sqlalchemy import Integer, String, Text, Float, DateTime
from sqlalchemy.orm import mapped_column, Mapped
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
    tool_description: Mapped[str] = mapped_column(Text)

    # Problem
    problem_description: Mapped[str] = mapped_column(Text)

    # Status: recibida | en_taller | reparada | entregada
    status: Mapped[str] = mapped_column(String(20), default="recibida", index=True)

    # Pricing
    estimated_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    final_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Dates — Python-side defaults so values are available immediately after INSERT
    date_received: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    date_sent_to_repair: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    date_repaired: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    date_estimated_return: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    date_returned: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Internal notes
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
