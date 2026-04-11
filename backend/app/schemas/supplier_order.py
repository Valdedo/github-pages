import datetime
from typing import Optional, List
from pydantic import BaseModel

# pedido = ordered to supplier; entregado = given to client
VALID_STATUSES = {"pendiente", "pedido", "parcial", "recibido", "entregado", "cancelado"}

# Statuses where auto-recalculation from lines should NOT override the manual state
MANUAL_STATUSES = {"pedido", "entregado", "cancelado"}


class SupplierOrderLineBase(BaseModel):
    descripcion: str
    cantidad: float = 1.0
    cantidad_recibida: float = 0.0
    precio_unitario: Optional[float] = None
    notes: Optional[str] = None


class SupplierOrderLineCreate(SupplierOrderLineBase):
    pass


class SupplierOrderLineUpdate(BaseModel):
    descripcion: Optional[str] = None
    cantidad: Optional[float] = None
    cantidad_recibida: Optional[float] = None
    precio_unitario: Optional[float] = None
    notes: Optional[str] = None


class SupplierOrderLineResponse(SupplierOrderLineBase):
    id: int
    order_id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class SupplierOrderBase(BaseModel):
    # Who the order is FOR (primary)
    client_name: str = ""
    client_phone: Optional[str] = None
    # Who we ordered FROM (secondary)
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    order_date: datetime.date
    expected_date: Optional[datetime.date] = None
    status: str = "pendiente"
    notes: Optional[str] = None
    reference: Optional[str] = None
    document_id: Optional[int] = None


class SupplierOrderCreate(SupplierOrderBase):
    lines: List[SupplierOrderLineCreate] = []


class SupplierOrderUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_id: Optional[int] = None
    order_date: Optional[datetime.date] = None
    expected_date: Optional[datetime.date] = None
    received_date: Optional[datetime.date] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    reference: Optional[str] = None
    document_id: Optional[int] = None


class SupplierOrderResponse(SupplierOrderBase):
    id: int
    received_date: Optional[datetime.date] = None
    lines: List[SupplierOrderLineResponse] = []
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class SupplierOrderListItem(BaseModel):
    id: int
    client_name: str = ""
    client_phone: Optional[str] = None
    supplier_name: Optional[str] = None
    order_date: datetime.date
    expected_date: Optional[datetime.date] = None
    status: str
    reference: Optional[str] = None
    line_count: int = 0
    lines_received: int = 0
    created_at: datetime.datetime

    class Config:
        from_attributes = True
