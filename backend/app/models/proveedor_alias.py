from datetime import datetime
from sqlalchemy import Integer, String, DateTime, func
from sqlalchemy.orm import mapped_column, Mapped
from app.database import Base


class ProveedorAlias(Base):
    """Nombre de proveedor que la lectura saca mal y cómo lo corrigió la tienda (nov. 2026):
    la próxima vez que se lea igual, se guarda ya con el nombre bueno."""
    __tablename__ = "proveedor_alias"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    clave: Mapped[str] = mapped_column(String(255), unique=True, index=True)  # drive_proveedor.clave(leido)
    leido: Mapped[str] = mapped_column(String(255))
    nombre: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
