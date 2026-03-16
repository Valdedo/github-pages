import datetime
from typing import Optional, List, Any
from pydantic import BaseModel


class MarginTier(BaseModel):
    min_cost: float
    max_cost: Optional[float] = None
    margin_pct: float


class AppSettingsBase(BaseModel):
    margin_tiers: Optional[List[MarginTier]] = None
    rounding_mode: Optional[str] = None   # "standard" | "psychological"
    rounding_decimals: Optional[int] = None
    label_columns: Optional[int] = None
    label_rows_per_page: Optional[int] = None
    base_url: Optional[str] = None


class AppSettingsUpdate(AppSettingsBase):
    pass


class AppSettingsResponse(BaseModel):
    id: int
    margin_tiers: List[MarginTier]
    rounding_mode: str
    rounding_decimals: int
    label_columns: int
    label_rows_per_page: int
    base_url: str
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class SupplierBase(BaseModel):
    name: str
    detection_keywords: List[str] = []
    template_config: dict = {}


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    detection_keywords: Optional[List[str]] = None
    template_config: Optional[dict] = None


class SupplierResponse(BaseModel):
    id: int
    name: str
    detection_keywords: List[str]
    template_config: dict
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ProductInfoUpdate(BaseModel):
    specs: Optional[dict] = None
    manual_url: Optional[str] = None


class ProductInfoResponse(BaseModel):
    id: int
    codigo_principal: str
    descripcion: str
    specs: Optional[dict] = None
    source_url: Optional[str] = None
    manual_url: Optional[str] = None
    search_attempted: bool
    cached_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True
