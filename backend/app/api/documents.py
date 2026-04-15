"""
Document upload and management endpoints.
"""
import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, BackgroundTasks
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


def _build_article(art_data: dict, doc_id: int, tiers: list, rounding_mode: str, rounding_decimals: int) -> Article:
    """Build an Article ORM object from extraction data. Does NOT add to session."""
    from app.services.margin_service import compute_article_pricing, calculate_pricing, get_margin_for_cost
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
        rounding_mode=rounding_mode,
        decimals=rounding_decimals,
    )
    if art_data.get("coste_neto_unitario") and not any([
        art_data.get("descuento_1"), art_data.get("descuento_2"),
        art_data.get("descuento_3"), art_data.get("descuento_4"),
    ]):
        pricing["coste_neto_unitario"] = art_data["coste_neto_unitario"]
        pricing["coste_neto_total"] = art_data["coste_neto_unitario"] * art_data.get("cantidad", 1)
        pricing["margen_pct"] = get_margin_for_cost(pricing["coste_neto_unitario"], tiers)
        pvp = calculate_pricing(
            pricing["coste_neto_unitario"], pricing["margen_pct"],
            art_data.get("iva_pct", 21.0), rounding_mode, rounding_decimals,
        )
        pricing["pvp_sin_iva"] = pvp["pvp_sin_iva"]
        pricing["pvp_con_iva"] = pvp["pvp_con_iva"]

    otros = art_data.get("otros_codigos", {})
    return Article(
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
        otros_codigos=otros if otros else None,
    )


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


@router.post("/upload-multi", response_model=DocumentResponse)
async def upload_multi_images(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    supplier_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Upload multiple image files as a single multi-page document."""
    IMAGE_EXTS = {"jpg", "jpeg", "png"}
    if len(files) < 2:
        raise HTTPException(400, "Para un único archivo usa el endpoint /upload")
    if len(files) > 10:
        raise HTTPException(400, "Máximo 10 páginas por documento")

    saved_paths = []
    first_filename = files[0].filename
    try:
        for file in files:
            suffix = Path(file.filename).suffix.lower().lstrip(".")
            if suffix not in IMAGE_EXTS:
                raise HTTPException(400, f"Solo imágenes (JPG/PNG) en subida múltiple. Archivo: {file.filename}")
            content = await file.read()
            if len(content) > settings.max_upload_size_bytes:
                raise HTTPException(413, f"Archivo demasiado grande: {file.filename}")
            stored_name = f"{uuid.uuid4().hex}.{suffix}"
            file_path = Path(settings.upload_dir) / stored_name
            with open(file_path, "wb") as f:
                f.write(content)
            saved_paths.append(str(file_path))
    except HTTPException:
        # Clean up any files already saved before the error
        for p in saved_paths:
            Path(p).unlink(missing_ok=True)
        raise

    display_name = f"{len(files)} páginas - {first_filename}"
    doc = Document(
        filename=Path(saved_paths[0]).name,
        original_filename=display_name,
        file_path=saved_paths[0],
        doc_type="image",
        status="uploaded",
        supplier_id=supplier_id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(_process_multi_document, doc.id, saved_paths, supplier_id)
    return doc


@router.get("", response_model=List[DocumentListItem])
def list_documents(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all documents with article counts (single query, no N+1)."""
    from sqlalchemy import func, outerjoin, or_
    rows = (
        db.query(Document, func.count(Article.id).label("article_count"))
        .outerjoin(Article, Article.document_id == Document.id)
        .filter(or_(Document.supplier_name != "__manual__", Document.supplier_name.is_(None)))
        .group_by(Document.id)
        .order_by(Document.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [
        DocumentListItem(
            id=doc.id,
            original_filename=doc.original_filename,
            status=doc.status,
            supplier_name=doc.supplier_name,
            doc_number=doc.doc_number,
            doc_date=doc.doc_date,
            article_count=count,
            created_at=doc.created_at,
        )
        for doc, count in rows
    ]


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

    # Prevent double-processing
    if doc.status == "processing":
        raise HTTPException(409, "El documento ya está siendo procesado. Espera a que termine.")

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


def _apply_validation(doc: Document, result: dict) -> None:
    """Store extracted totals and validation result on the Document object (does NOT commit)."""
    totales = result.get("totales_documento") or {}
    validacion = result.get("validacion") or {}
    articulos = result.get("articulos") or []

    # Totals stated in the document
    def _f(v):
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    doc.base_imponible_doc = _f(totales.get("base_imponible"))
    doc.total_iva_doc      = _f(totales.get("total_iva"))
    doc.total_recargo_doc  = _f(totales.get("total_recargo"))
    doc.total_doc          = _f(totales.get("total_documento"))

    # Our own computed base (sum coste_neto_unitario × cantidad)
    base_calculada = _f(validacion.get("base_calculada"))
    if base_calculada is None:
        base_calculada = round(
            sum(
                (a.get("coste_neto_unitario") or 0) * (a.get("cantidad") or 1)
                for a in articulos
            ), 2
        )
    doc.total_calculado = base_calculada

    # Validation result from Claude
    cuadra = validacion.get("cuadra")
    if cuadra is None and doc.base_imponible_doc is not None:
        cuadra = abs(base_calculada - doc.base_imponible_doc) <= 0.50

    doc.validacion_ok = bool(cuadra) if cuadra is not None else None

    discrepancias = validacion.get("discrepancias") or []
    notas = validacion.get("notas") or ""
    doc.validacion_notas = json.dumps({
        "notas": notas,
        "discrepancias": discrepancias,
        "base_calculada": base_calculada,
        "base_imponible_doc": doc.base_imponible_doc,
        "diferencia": round(base_calculada - (doc.base_imponible_doc or 0), 2) if doc.base_imponible_doc is not None else None,
    }, ensure_ascii=False)


async def _process_multi_document(doc_id: int, file_paths: list, supplier_id: Optional[int] = None):
    """Background task: extract multiple image pages as a single document."""
    from app.database import SessionLocal
    from app.services.extraction_service import extract_multi_images

    # Phase 1: quick reads + mark processing, then release DB
    db = SessionLocal()
    suppliers_data: list = []
    tiers: list = []
    rounding_mode = "ceil_5cents"
    rounding_decimals = 2
    supplier_name_fallback = None
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return
        supplier_name_fallback = doc.supplier_name
        doc.status = "processing"
        db.commit()

        suppliers = db.query(Supplier).all()
        for s in suppliers:
            try:
                keywords = json.loads(s.detection_keywords) if isinstance(s.detection_keywords, str) else (s.detection_keywords or [])
            except (json.JSONDecodeError, TypeError):
                keywords = []
                logger.warning(f"Supplier {s.id}: invalid detection_keywords JSON, skipping")
            try:
                tmpl = json.loads(s.template_config) if isinstance(s.template_config, str) else (s.template_config or {})
            except (json.JSONDecodeError, TypeError):
                tmpl = {}
                logger.warning(f"Supplier {s.id}: invalid template_config JSON, skipping")
            suppliers_data.append({
                "id": s.id,
                "name": s.name,
                "detection_keywords": keywords,
                "template_config": tmpl,
            })
        app_settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
        if not app_settings:
            app_settings = AppSettings(id=1)
            db.add(app_settings)
            db.commit()
        tiers = json.loads(app_settings.margin_tiers) if isinstance(app_settings.margin_tiers, str) else []
        rounding_mode = app_settings.rounding_mode or "ceil_5cents"
        rounding_decimals = app_settings.rounding_decimals or 2
    finally:
        db.close()

    # Phase 2: extraction — no DB held
    try:
        result = await extract_multi_images(
            file_paths=file_paths,
            supplier_id=supplier_id,
            suppliers=suppliers_data,
        )
    except Exception as e:
        logger.error(f"Multi extraction failed for document {doc_id}: {e}", exc_info=True)
        db2 = SessionLocal()
        try:
            doc2 = db2.query(Document).filter(Document.id == doc_id).first()
            if doc2:
                doc2.status = "error"
                doc2.error_message = str(e)[:500]
                db2.commit()
        finally:
            db2.close()
        return

    # Phase 3: quick write of results
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        documento = result.get("documento", {})
        doc.supplier_name = documento.get("proveedor") or supplier_name_fallback
        doc.doc_number = documento.get("num_albaran")
        _raw_ppp = documento.get("pronto_pago_pct")
        try:
            _ppp = float(_raw_ppp) if _raw_ppp is not None else None
            doc.pronto_pago_pct = _ppp if _ppp is not None and 0 <= _ppp <= 50 else None
        except (TypeError, ValueError):
            doc.pronto_pago_pct = None
        doc.raw_extraction = json.dumps(result.get("raw_text", "")[:5000])

        if result.get("supplier_detected") and not supplier_id:
            supplier_det = result["supplier_detected"]
            doc.supplier_id = supplier_det.get("id")
            if not doc.supplier_name:
                doc.supplier_name = supplier_det.get("name")

        fecha_str = str(documento.get("fecha") or "").strip()
        if fecha_str:
            try:
                from datetime import datetime as _dt
                _clean = fecha_str.split(".")[0].replace("Z", "").strip()
                for _fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
                              "%d/%m/%Y", "%d-%m-%Y"]:
                    try:
                        doc.doc_date = _dt.strptime(_clean, _fmt).date()
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        for art_data in result.get("articulos", []):
            db.add(_build_article(art_data, doc_id, tiers, rounding_mode, rounding_decimals))

        _apply_validation(doc, result)
        doc.status = "completed"
        db.commit()

    except Exception as e:
        logger.error(f"Error saving multi-doc results for {doc_id}: {e}", exc_info=True)
        try:
            db.rollback()
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status = "error"
                doc.error_message = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


async def _process_document(doc_id: int, supplier_id: Optional[int] = None):
    """Background task: extract document content and save articles.

    Split into three short DB phases so SQLite is never locked during the
    long OCR / Claude API extraction phase.
    """
    from app.database import SessionLocal
    from app.services.extraction_service import extract_document

    # ── Phase 1: quick reads + mark as processing ────────────────────────
    db = SessionLocal()
    file_path = doc_type = supplier_name_fallback = None
    suppliers_data: list = []
    tiers: list = []
    rounding_mode = "ceil_5cents"
    rounding_decimals = 2
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return
        file_path = doc.file_path
        doc_type = doc.doc_type
        supplier_name_fallback = doc.supplier_name

        doc.status = "processing"
        db.commit()

        suppliers = db.query(Supplier).all()
        for s in suppliers:
            try:
                keywords = json.loads(s.detection_keywords) if isinstance(s.detection_keywords, str) else (s.detection_keywords or [])
            except (json.JSONDecodeError, TypeError):
                keywords = []
                logger.warning(f"Supplier {s.id}: invalid detection_keywords JSON, skipping")
            try:
                tmpl = json.loads(s.template_config) if isinstance(s.template_config, str) else (s.template_config or {})
            except (json.JSONDecodeError, TypeError):
                tmpl = {}
                logger.warning(f"Supplier {s.id}: invalid template_config JSON, skipping")
            suppliers_data.append({
                "id": s.id,
                "name": s.name,
                "detection_keywords": keywords,
                "template_config": tmpl,
            })

        app_settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
        if not app_settings:
            app_settings = AppSettings(id=1)
            db.add(app_settings)
            db.commit()
        tiers = json.loads(app_settings.margin_tiers) if isinstance(app_settings.margin_tiers, str) else []
        rounding_mode = app_settings.rounding_mode or "ceil_5cents"
        rounding_decimals = app_settings.rounding_decimals or 2
    finally:
        db.close()  # release DB lock before long extraction

    # ── Phase 2: extraction (OCR + Claude) — no DB held ─────────────────
    try:
        result = await extract_document(
            file_path=file_path,
            doc_type=doc_type,
            supplier_id=supplier_id,
            suppliers=suppliers_data,
        )
    except Exception as e:
        logger.error(f"Extraction failed for document {doc_id}: {e}", exc_info=True)
        db2 = SessionLocal()
        try:
            doc2 = db2.query(Document).filter(Document.id == doc_id).first()
            if doc2:
                doc2.status = "error"
                doc2.error_message = str(e)[:500]
                db2.commit()
        finally:
            db2.close()
        return

    # ── Phase 3: quick write of results ─────────────────────────────────
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        # Update document metadata
        documento = result.get("documento", {})
        doc.supplier_name = documento.get("proveedor") or supplier_name_fallback
        doc.doc_number = documento.get("num_albaran")
        _raw_ppp = documento.get("pronto_pago_pct")
        try:
            _ppp = float(_raw_ppp) if _raw_ppp is not None else None
            doc.pronto_pago_pct = _ppp if _ppp is not None and 0 <= _ppp <= 50 else None
        except (TypeError, ValueError):
            doc.pronto_pago_pct = None
        doc.raw_extraction = json.dumps(result.get("raw_text", "")[:5000])

        # Handle detected supplier
        if result.get("supplier_detected") and not supplier_id:
            supplier_det = result["supplier_detected"]
            doc.supplier_id = supplier_det.get("id")
            if not doc.supplier_name:
                doc.supplier_name = supplier_det.get("name")

        # Parse date
        fecha_str = str(documento.get("fecha") or "").strip()
        if fecha_str:
            try:
                from datetime import datetime as _dt
                _clean = fecha_str.split(".")[0].replace("Z", "").strip()
                for _fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
                              "%d/%m/%Y", "%d-%m-%Y"]:
                    try:
                        doc.doc_date = _dt.strptime(_clean, _fmt).date()
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        # Save articles
        for art_data in result.get("articulos", []):
            db.add(_build_article(art_data, doc_id, tiers, rounding_mode, rounding_decimals))

        # Validation: store totals and check if they match
        _apply_validation(doc, result)

        doc.status = "completed"
        db.commit()

    except Exception as e:
        logger.error(f"Error saving results for document {doc_id}: {e}", exc_info=True)
        try:
            db.rollback()
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status = "error"
                doc.error_message = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
