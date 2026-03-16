from datetime import datetime
from sqlalchemy import Integer, String, Text, Float, Date, DateTime, ForeignKey, func
from sqlalchemy.orm import mapped_column, Mapped, relationship
from typing import Optional
import datetime as dt

from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    filename: Mapped[str] = mapped_column(String(255))           # stored filename (UUID-based)
    original_filename: Mapped[str] = mapped_column(String(255))  # original upload name
    file_path: Mapped[str] = mapped_column(String(512))          # absolute path on disk
    doc_type: Mapped[str] = mapped_column(String(20))            # "pdf" | "image"
    status: Mapped[str] = mapped_column(String(30), default="uploaded")
    # Status: uploaded | processing | completed | error
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True
    )
    doc_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    doc_date: Mapped[Optional[dt.date]] = mapped_column(Date, nullable=True)
    pronto_pago_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    raw_extraction: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    articles: Mapped[list["Article"]] = relationship(  # noqa: F821
        "Article", back_populates="document", cascade="all, delete-orphan",
        order_by="Article.line_number"
    )
    supplier: Mapped[Optional["Supplier"]] = relationship("Supplier")  # noqa: F821
