import datetime
import json
from typing import Optional, Any
from pydantic import BaseModel, field_validator


class ArticleBase(BaseModel):
    descripcion: str
    cantidad: float = 1.0
    precio_unitario_bruto: float = 0.0
    descuento_1: Optional[float] = None
    descuento_2: Optional[float] = None
    descuento_3: Optional[float] = None
    descuento_4: Optional[float] = None
    iva_pct: float = 21.0
    recargo_pct: Optional[float] = None
    margen_pct: Optional[float] = None
    margen_override: bool = False
    codigo_proveedor: Optional[str] = None
    codigo_fabricante: Optional[str] = None
    ean: Optional[str] = None
    codigo_principal: Optional[str] = None
    otros_codigos: Optional[Any] = None


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
    created_at: datetime.datetime
    updated_at: datetime.datetime

    @field_validator('otros_codigos', mode='before')
    @classmethod
    def parse_otros_codigos(cls, v):
        """otros_codigos is stored as a JSON string in SQLite; parse it to dict."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {}
        return v

    class Config:
        from_attributes = True


class BulkUpdateRequest(BaseModel):
    document_id: int
    recalculate_margins: bool = True
