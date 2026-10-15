from datetime import datetime
from typing import List, Optional

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
    # Orden de carga en la que va (si va en alguna) y cómo está esa entrega
    carga_id: Optional[int] = None
    carga_estado: Optional[str] = None
    # La hoja de entrega ya está firmada pero el albarán cambió después de cargar: la firma no se le pasó sola
    firma_entrega: Optional[str] = None
    # Quién firmó otras veces por este cliente (sugerencias al firmar; solo en la ficha)
    firmantes: List[str] = []
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
