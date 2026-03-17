"""
Document upload and management endpoints.
"""
import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.article import Article
from app.models.supplier import Supplier
from app.models.app_settings import AppSettings
from app.schemas.document import (
    DocumentResponse, DocumentWithArticles, DocumentListItem,
    DocumentUpdate, ReprocessRequest
)
from app.schemas.article import ArticleResponse
from app.services import margin_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])


def get_or_create_settings(db: Session) -> AppSettings:
    s = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not s:
        s = AppSettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    supplier_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Upload a PDF or image file and start extraction."""
    # Validate extension
    suffix = Path(file.filename).suffix.lower().lstrip(".")
    if suffix not in settings.allowed_ext_list:
        raise HTTPException(
            400, f"File type '{suffix}' not allowed. Allowed: {settings.allowed_ext_list}"
        )

    # Validate size
    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(413, f"File too large. Max: {settings.max_upload_size_mb}MB")

    # Save file
    stored_name = f"{uuid.uuid4().hex}.{suffix}"
    file_path = Path(settings.upload_dir) / stored_name
    with open(file_path, "wb") as f:
        f.write(content)

    doc_type = "pdf" if suffix == "pdf" else "image"

    # Create DB record
    doc = Document(
        filename=stored_name,
        original_filename=file.filename,
        file_path=str(file_path),
        doc_type=doc_type,
        status="uploaded",
        supplier_id=supplier_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Trigger extraction in background
    background_tasks.add_task(_process_document, doc.id, supplier_id)

    return doc


@router.get("", response_model=List[DocumentListItem])
def list_documents(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List all documents."""
    docs = db.query(Document).order_by(Document.created_at.desc()).offset(skip).limit(limit).all()
    result = []
    for doc in docs:
        article_count = db.query(Article).filter(Article.document_id == doc.id).count()
        item = DocumentListItem(
            id=doc.id,
            original_filename=doc.original_filename,
            status=doc.status,
            supplier_name=doc.supplier_name,
            doc_number=doc.doc_number,
            doc_date=doc.doc_date,
            article_count=article_count,
            created_at=doc.created_at,
        )
        result.append(item)
    return result


@router.get("/{doc_id}", response_model=DocumentWithArticles)
def get_document(doc_id: int, db: Session = Depends(get_db)):
    """Get document with all articles."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(
    doc_id: int,
    update: DocumentUpdate,
    db: Session = Depends(get_db),
):
    """Update document metadata."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    """Delete document and all articles."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    # Delete file from disk
    try:
        Path(doc.file_path).unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"Could not delete file {doc.file_path}: {e}")

    db.delete(doc)
    db.commit()
    return {"ok": True}


@router.post("/{doc_id}/reprocess")
async def reprocess_document(
    doc_id: int,
    request: ReprocessRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Reprocess document extraction (delete articles and re-extract)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    # Delete existing articles
    db.query(Article).filter(Article.document_id == doc_id).delete()
    doc.status = "uploaded"
    doc.error_message = None
    if request.supplier_id:
        doc.supplier_id = request.supplier_id
    db.commit()

    background_tasks.add_task(_process_document, doc_id, request.supplier_id or doc.supplier_id)

    return {"ok": True, "message": "Reprocessing started"}


@router.get("/{doc_id}/file")
def get_document_file(doc_id: int, db: Session = Depends(get_db)):
    """Stream the original document file."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(404, "File not found on disk")

    media_type = "application/pdf" if doc.doc_type == "pdf" else "image/jpeg"
    if doc.original_filename.lower().endswith(".png"):
        media_type = "image/png"

    return FileResponse(
        str(file_path),
        media_type=media_type,
        headers={"Content-Disposition": "inline"},
    )


async def _process_document(doc_id: int, supplier_id: Optional[int] = None):
    """Background task: extract document content and save articles."""
    from app.database import SessionLocal
    from app.services.extraction_service import extract_document
    from app.services.margin_service import compute_article_pricing

    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        doc.status = "processing"
        db.commit()

        # Load suppliers for detection
        suppliers = db.query(Supplier).all()
        suppliers_data = [
            {
                "id": s.id,
                "name": s.name,
                "detection_keywords": json.loads(s.detection_keywords) if isinstance(s.detection_keywords, str) else s.detection_keywords,
                "template_config": json.loads(s.template_config) if isinstance(s.template_config, str) else s.template_config,
            }
            for s in suppliers
        ]

        # Load settings for margin calculation
        app_settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
        if not app_settings:
            app_settings = AppSettings(id=1)
            db.add(app_settings)
            db.commit()

        tiers = json.loads(app_settings.margin_tiers) if isinstance(app_settings.margin_tiers, str) else []

        # Run extraction
        result = await extract_document(
            file_path=doc.file_path,
            doc_type=doc.doc_type,
            supplier_id=supplier_id,
            suppliers=suppliers_data,
        )

        # Update document metadata
        documento = result.get("documento", {})
        doc.supplier_name = documento.get("proveedor") or doc.supplier_name
        doc.doc_number = documento.get("num_albaran")
        doc.pronto_pago_pct = documento.get("pronto_pago_pct")
        doc.raw_extraction = json.dumps(result.get("raw_text", "")[:5000])

        # Handle detected supplier
        if result.get("supplier_detected") and not supplier_id:
            supplier_det = result["supplier_detected"]
            doc.supplier_id = supplier_det.get("id")
            if not doc.supplier_name:
                doc.supplier_name = supplier_det.get("name")

        # Parse date
        fecha_str = documento.get("fecha")
        if fecha_str:
            try:
                from datetime import date
                doc.doc_date = date.fromisoformat(fecha_str)
            except Exception:
                pass

        # Save articles
        for art_data in result.get("articulos", []):
            pricing = compute_article_pricing(
                precio_bruto=art_data.get("precio_unitario_bruto", 0),
                cantidad=art_data.get("cantidad", 1),
                descuento_1=art_data.get("descuento_1"),
                descuento_2=art_data.get("descuento_2"),
                descuento_3=art_data.get("descuento_3"),
                descuento_4=art_data.get("descuento_4"),
                iva_pct=art_data.get("iva_pct", 21.0),
                margen_pct_override=None,
                tiers=tiers,
                rounding_mode=app_settings.rounding_mode,
                decimals=app_settings.rounding_decimals,
            )

            # Use provided coste_neto if available and no discounts give us a better one
            if art_data.get("coste_neto_unitario") and not any([
                art_data.get("descuento_1"), art_data.get("descuento_2"),
                art_data.get("descuento_3"), art_data.get("descuento_4")
            ]):
                pricing["coste_neto_unitario"] = art_data["coste_neto_unitario"]
                pricing["coste_neto_total"] = art_data["coste_neto_unitario"] * art_data.get("cantidad", 1)
                # Recalculate PVP from net cost
                from app.services.margin_service import calculate_pricing, get_margin_for_cost
                pricing["margen_pct"] = get_margin_for_cost(pricing["coste_neto_unitario"], tiers)
                pvp = calculate_pricing(
                    pricing["coste_neto_unitario"],
                    pricing["margen_pct"],
                    art_data.get("iva_pct", 21.0),
                    app_settings.rounding_mode,
                    app_settings.rounding_decimals,
                )
                pricing["pvp_sin_iva"] = pvp["pvp_sin_iva"]
                pricing["pvp_con_iva"] = pvp["pvp_con_iva"]

            otros = art_data.get("otros_codigos", {})

            article = Article(
                document_id=doc_id,
                line_number=art_data.get("line_number", 0),
                descripcion=art_data.get("descripcion", ""),
                cantidad=art_data.get("cantidad", 1),
                precio_unitario_bruto=art_data.get("precio_unitario_bruto", 0),
                descuento_1=art_data.get("descuento_1"),
                descuento_2=art_data.get("descuento_2"),
                descuento_3=art_data.get("descuento_3"),
                descuento_4=art_data.get("descuento_4"),
                coste_neto_unitario=pricing["coste_neto_unitario"],
                coste_neto_total=pricing["coste_neto_total"],
                iva_pct=art_data.get("iva_pct", 21.0),
                recargo_pct=art_data.get("recargo_pct"),
                margen_pct=pricing["margen_pct"],
                margen_override=pricing["margen_override"],
                pvp_sin_iva=pricing["pvp_sin_iva"],
                pvp_con_iva=pricing["pvp_con_iva"],
                codigo_proveedor=art_data.get("codigo_proveedor"),
                codigo_fabricante=art_data.get("codigo_fabricante"),
                ean=art_data.get("ean"),
                codigo_principal=art_data.get("codigo_principal"),
                otros_codigos=json.dumps(otros) if otros else None,
            )
            db.add(article)

        doc.status = "completed"
        db.commit()

    except Exception as e:
        logger.error(f"Error processing document {doc_id}: {e}", exc_info=True)
        try:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status = "error"
                doc.error_message = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
