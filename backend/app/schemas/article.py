import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field


class ArticleBase(BaseModel):
    descripcion: str
    cantidad: float = Field(default=1.0, gt=0)
    precio_unitario_bruto: float = Field(default=0.0, ge=0)
    descuento_1: Optional[float] = Field(default=None, ge=0, le=100)
    descuento_2: Optional[float] = Field(default=None, ge=0, le=100)
    descuento_3: Optional[float] = Field(default=None, ge=0, le=100)
    descuento_4: Optional[float] = Field(default=None, ge=0, le=100)
    iva_pct: float = 21.0
    recargo_pct: Optional[float] = Field(default=None, ge=0, le=100)
    margen_pct: Optional[float] = Field(default=None, ge=0, le=500)
    margen_override: bool = False
    codigo_proveedor: Optional[str] = None
    codigo_fabricante: Optional[str] = None
    ean: Optional[str] = None
    codigo_principal: Optional[str] = None
    otros_codigos: Optional[Any] = None
    familia: Optional[str] = None


class ArticleCreate(ArticleBase):
    document_id: int
    line_number: int = 0


class ArticleUpdate(BaseModel):
    descripcion: Optional[str] = None
    cantidad: Optional[float] = None
    precio_unitario_bruto: Optional[float] = None
    descuento_1: Optional[float] = None
    descuento_2: Optional[float] = None
    descuento_3: Optional[float] = None
    descuento_4: Optional[float] = None
    iva_pct: Optional[float] = None
    recargo_pct: Optional[float] = None
    margen_pct: Optional[float] = None   # if set, marks margen_override=True
    margen_override: Optional[bool] = None
    codigo_proveedor: Optional[str] = None
    codigo_fabricante: Optional[str] = None
    ean: Optional[str] = None
    codigo_principal: Optional[str] = None
    otros_codigos: Optional[Any] = None
    familia: Optional[str] = None


class ArticleResponse(ArticleBase):
    id: int
    document_id: int
    line_number: int
    coste_neto_unitario: float
    coste_neto_total: float
    margen_pct: float
    margen_override: bool
    pvp_sin_iva: float
    pvp_con_iva: float
    product_info_id: Optional[int] = None
    familia: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class BulkUpdateRequest(BaseModel):
    document_id: int
    recalculate_margins: bool = True
