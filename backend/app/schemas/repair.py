import datetime
from typing import Optional
from pydantic import BaseModel

VALID_STATUSES = {"recibida", "en_taller", "reparada", "entregada"}


class RepairBase(BaseModel):
    client_name: str
    client_phone: Optional[str] = None
    tool_brand: Optional[str] = None
    tool_model: Optional[str] = None
    tool_description: str
    problem_description: str
    status: str = "recibida"
    estimated_price: Optional[float] = None
    final_price: Optional[float] = None
    date_estimated_return: Optional[datetime.datetime] = None
    notes: Optional[str] = None


class RepairCreate(RepairBase):
    date_received: Optional[datetime.datetime] = None  # defaults to now on the server if omitted


class RepairUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    tool_brand: Optional[str] = None
    tool_model: Optional[str] = None
    tool_description: Optional[str] = None
    problem_description: Optional[str] = None
    status: Optional[str] = None
    estimated_price: Optional[float] = None
    final_price: Optional[float] = None
    date_received: Optional[datetime.datetime] = None
    date_sent_to_repair: Optional[datetime.datetime] = None
    date_repaired: Optional[datetime.datetime] = None
    date_estimated_return: Optional[datetime.datetime] = None
    date_returned: Optional[datetime.datetime] = None
    notes: Optional[str] = None


class RepairResponse(RepairBase):
    id: int
    date_received: datetime.datetime
    date_sent_to_repair: Optional[datetime.datetime] = None
    date_repaired: Optional[datetime.datetime] = None
    date_returned: Optional[datetime.datetime] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True
