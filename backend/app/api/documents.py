"""
Document upload and management endpoints.
"""
import json
import logging
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.article import Article
from app.models.supplier import Supplier
from app.models.app_settings import AppSettings, decimales
from app.schemas.document import (
    DocumentResponse, DocumentWithArticles, DocumentListItem,
    DocumentUpdate, ReprocessRequest
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])


def _build_article(art_data: dict, doc_id: int, tiers: list, rounding_mode: str, rounding_decimals: int,
                   pronto_pago_pct: Optional[float] = None) -> Article:
    """Build an Article ORM object from extraction data. Does NOT add to session.

    Precios: siempre se aplica el pronto pago del albarán (como en /recalculate). Si la IA leyó
    un coste neto distinto del bruto sin descuentos, ese neto se guarda como un descuento
    equivalente en descuento_1: así cualquier recálculo posterior da el mismo coste."""
    from app.services.margin_service import compute_article_pricing

    def _num(v):
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    art_data = dict(art_data)
    bruto = _num(art_data.get("precio_unitario_bruto")) or 0.0
    neto_ia = _num(art_data.get("coste_neto_unitario"))
    cantidad = _num(art_data.get("cantidad"))
    if not cantidad or cantidad <= 0:
        cantidad = 1.0
    art_data["cantidad"] = cantidad
    sin_dtos = not any(_num(art_data.get(f"descuento_{i}")) for i in range(1, 5))
    if neto_ia and neto_ia > 0 and sin_dtos and abs(neto_ia - bruto) > 0.00005:
        if bruto > neto_ia:
            art_data["descuento_1"] = round((1 - neto_ia / bruto) * 100, 4)
        else:  # sin bruto (o neto mayor que el bruto): el neto pasa a ser el precio
            bruto = neto_ia
    art_data["precio_unitario_bruto"] = bruto

    pricing = compute_article_pricing(
        precio_bruto=bruto,
        cantidad=cantidad,
        descuento_1=art_data.get("descuento_1"),
        descuento_2=art_data.get("descuento_2"),
        descuento_3=art_data.get("descuento_3"),
        descuento_4=art_data.get("descuento_4"),
        iva_pct=art_data.get("iva_pct", 21.0),
        margen_pct_override=None,
        tiers=tiers,
        rounding_mode=rounding_mode,
        decimals=rounding_decimals,
        pronto_pago_pct=pronto_pago_pct,
    )

    otros = art_data.get("otros_codigos", {})
    return Article(
        document_id=doc_id,
        line_number=art_data.get("line_number", 0),
        descripcion=art_data.get("descripcion", ""),
        cantidad=cantidad,
        precio_unitario_bruto=bruto,
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


def _rutas(doc: Document) -> List[str]:
    """Todas las rutas del albarán (varias si se subió en varias fotos; los antiguos solo tienen una)."""
    try:
        lista = json.loads(doc.file_paths) if doc.file_paths else []
    except (TypeError, ValueError):
        lista = []
    lista = [p for p in lista if p]
    return lista or ([doc.file_path] if doc.file_path else [])


def marcar_interrumpidos() -> None:
    """Al arrancar: los albaranes que se estaban leyendo cuando se paró el servidor quedan en error."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        n = (db.query(Document).filter(Document.status.in_(("processing", "uploaded")))
             .update({Document.status: "error", Document.error_message: "Se interrumpió, vuelve a procesar"},
                     synchronize_session=False))
        db.commit()
        if n:
            logger.info("%s albarán(es) a medias pasados a error", n)
    finally:
        db.close()


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

    # Validate size (sin leer más de la cuenta)
    content = await file.read(settings.max_upload_size_bytes + 1)
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
            content = await file.read(settings.max_upload_size_bytes + 1)
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
        file_paths=json.dumps(saved_paths),
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
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    """List all documents with article counts (single query, no N+1)."""
    from sqlalchemy import func, or_
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
            terminado_at=doc.terminado_at,
            drive_pendiente=doc.drive_pendiente,
            created_at=doc.created_at,
        )
        for doc, count in rows
    ]


class Terminado(BaseModel):
    terminado: bool


@router.put("/{doc_id}/terminado", response_model=DocumentResponse)
def marcar_terminado(doc_id: int, data: Terminado, db: Session = Depends(get_db)):
    """Albarán revisado y pasado a TreyFACT (o al revés, si se quita la marca)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Albarán no encontrado")
    doc.terminado_at = datetime.utcnow() if data.terminado else None  # UTC, como created_at
    db.commit()
    db.refresh(doc)
    return doc


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

    # Borrar del disco todas las fotos/páginas del albarán
    for p in _rutas(doc):
        try:
            Path(p).unlink(missing_ok=True)
        except Exception as e:
            logger.warning(f"Could not delete file {p}: {e}")

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

    rutas = _rutas(doc)
    if len(rutas) > 1:  # albarán de varias fotos: se vuelven a leer todas
        background_tasks.add_task(_process_multi_document, doc_id, rutas, request.supplier_id or doc.supplier_id)
    else:
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


def _guardar_en_drive(doc_id: int, paginas):
    """Copia del albarán en ALBARANES/<proveedor> de Drive (nunca rompe el proceso)."""
    try:
        from app.services.drive_proveedor import guardar_en_segundo_plano
        guardar_en_segundo_plano(doc_id, paginas)
    except Exception as e:
        logger.warning(f"No se pudo lanzar la copia en Drive de {doc_id}: {e}")


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
        rounding_decimals = decimales(app_settings)
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
            db.add(_build_article(art_data, doc_id, tiers, rounding_mode, rounding_decimals, doc.pronto_pago_pct))

        _apply_validation(doc, result)
        doc.status = "completed"
        db.commit()
        _guardar_en_drive(doc_id, file_paths)

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
        rounding_decimals = decimales(app_settings)
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
            db.add(_build_article(art_data, doc_id, tiers, rounding_mode, rounding_decimals, doc.pronto_pago_pct))

        # Validation: store totals and check if they match
        _apply_validation(doc, result)

        doc.status = "completed"
        db.commit()
        _guardar_en_drive(doc_id, None)

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
