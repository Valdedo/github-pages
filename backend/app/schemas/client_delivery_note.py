from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ClientDeliveryNoteResponse(BaseModel):
    id: int
    numero: str
    fecha: Optional[str] = None
    codigo_cliente: Optional[str] = None
    cliente: Optional[str] = None
    obra: Optional[str] = None
    status: str
    page_count: int = 1
    signed_at: Optional[datetime] = None
    signed_by: Optional[str] = None
    signer_dni: Optional[str] = None
    nota: Optional[str] = None
    emailed_to: Optional[str] = None
    emailed_at: Optional[datetime] = None
    importe: Optional[float] = None
    copia_at: Optional[datetime] = None
    whatsapp_at: Optional[datetime] = None
    facturado_at: Optional[datetime] = None
    factura_ref: Optional[str] = None
    backup_at: Optional[datetime] = None
    reparto_at: Optional[datetime] = None
    reparto_orden: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class Marcas(BaseModel):
    """Marcas manuales de seguimiento (True = marcar, False = quitar, ausente = no tocar)."""
    copia: Optional[bool] = None
    whatsapp: Optional[bool] = None
    facturado: Optional[bool] = None
    factura_ref: Optional[str] = None


class MarcasLote(Marcas):
    ids: list[int]


class Reparto(BaseModel):
    ids: list[int]
    en_camion: bool = True


class ContactoCliente(BaseModel):
    email: Optional[str] = None
    telefono: Optional[str] = None
    auto_email: Optional[bool] = None


class EnviarEmail(BaseModel):
    to: str


class ClientDeliveryNoteUpdate(BaseModel):
    numero: Optional[str] = None
    fecha: Optional[str] = None
    codigo_cliente: Optional[str] = None
    cliente: Optional[str] = None
    obra: Optional[str] = None
