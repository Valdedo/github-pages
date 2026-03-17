import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.schemas.article import ArticleResponse


class DocumentBase(BaseModel):
    supplier_name: Optional[str] = None
    supplier_id: Optional[int] = None
    doc_number: Optional[str] = None
    doc_date: Optional[datetime.date] = None
    pronto_pago_pct: Optional[float] = None


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(DocumentBase):
    pass


class DocumentResponse(DocumentBase):
    id: int
    filename: str
    original_filename: str
    doc_type: str
    status: str
    error_message: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True


class DocumentWithArticles(DocumentResponse):
    articles: List[ArticleResponse] = []

    class Config:
        from_attributes = True


class DocumentListItem(BaseModel):
    id: int
    original_filename: str
    status: str
    supplier_name: Optional[str] = None
    doc_number: Optional[str] = None
    doc_date: Optional[datetime.date] = None
    article_count: int = 0
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ReprocessRequest(BaseModel):
    supplier_id: Optional[int] = None
