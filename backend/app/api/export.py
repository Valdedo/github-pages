"""
Export endpoints: Excel and PDF labels.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document
from app.models.article import Article
from app.models.app_settings import AppSettings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/export", tags=["export"])


def get_settings(db: Session) -> AppSettings:
    s = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not s:
        s = AppSettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("/excel/{document_id}")
def export_excel(document_id: int, db: Session = Depends(get_db)):
    """Export document articles to Excel (.xlsx)."""
    from app.services.excel_service import generate_excel

    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    articles = (
        db.query(Article)
        .filter(Article.document_id == document_id)
        .order_by(Article.line_number)
        .all()
    )

    if not articles:
        raise HTTPException(404, "No articles found for this document")

    excel_bytes = generate_excel(doc, articles)

    safe_name = doc.original_filename.rsplit(".", 1)[0]
    filename = f"albaran_{safe_name}_{doc.id}.xlsx"

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/labels/{document_id}")
def export_labels(
    document_id: int,
    ids: Optional[str] = Query(None, description="Comma-separated article IDs"),
    db: Session = Depends(get_db),
):
    """Export article labels to PDF.

    If 'ids' is provided, only export those articles.
    """
    from app.services.label_service import generate_labels_pdf

    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    query = db.query(Article).filter(Article.document_id == document_id)

    if ids:
        try:
            id_list = [int(i.strip()) for i in ids.split(",") if i.strip()]
            query = query.filter(Article.id.in_(id_list))
        except ValueError:
            raise HTTPException(400, "Invalid article IDs format")

    articles = query.order_by(Article.line_number).all()

    if not articles:
        raise HTTPException(404, "No articles found")

    settings = get_settings(db)

    pdf_bytes = generate_labels_pdf(
        articles=articles,
        base_url=settings.base_url,
        cols=settings.label_columns,
        rows_per_page=settings.label_rows_per_page,
    )

    safe_name = doc.original_filename.rsplit(".", 1)[0]
    filename = f"etiquetas_{safe_name}_{doc.id}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
