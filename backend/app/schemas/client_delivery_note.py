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
    created_at: datetime

    model_config = {"from_attributes": True}


class ContactoCliente(BaseModel):
    email: Optional[str] = None
    telefono: Optional[str] = None


class EnviarEmail(BaseModel):
    to: str


class ClientDeliveryNoteUpdate(BaseModel):
    numero: Optional[str] = None
    fecha: Optional[str] = None
    codigo_cliente: Optional[str] = None
    cliente: Optional[str] = None
    obra: Optional[str] = None
