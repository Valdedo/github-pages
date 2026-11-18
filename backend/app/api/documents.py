"""
Document upload and management endpoints.
"""
import asyncio
import hashlib
import time
import json
import logging
import re
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

from app.services.extraction_service import mensaje_para_persona  # noqa: E402
from app.services import compras_service, extraction_service  # noqa: E402

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
        codigo_principal=codigo_unico(art_data.get("codigo_principal"), doc_id),
        otros_codigos=otros if otros else None,
    )


def codigo_unico(codigo: Optional[str], doc_id: int) -> Optional[str]:
    """Las líneas sin código salen de la lectura como ART-0001, ART-0002… y se repetían en cada albarán
    (al escanear la etiqueta salía otro artículo, y a TreyFACT le llegaba el mismo código para cosas
    distintas). Se les pone el albarán delante: ART-<albarán>-<línea>."""
    m = re.fullmatch(r"ART-(\d{4})", codigo or "")
    return f"ART-{doc_id}-{int(m.group(1))}" if m else codigo


def _ya_subido(db: Session, huella: str) -> Optional[Document]:
    """El albarán de compra que ya se subió con este mismo archivo (si no falló al leerse)."""
    doc = (db.query(Document)
           .filter(Document.huella == huella, Document.status.in_(("uploaded", "processing", "completed")))
           .order_by(Document.id.desc()).first())
    if doc:
        doc.repetido = True
    return doc


# Al subir un montón de albaranes a la vez se leen de tres en tres (los demás esperan «en cola»):
# todos de golpe chocaban con el límite de la IA y se quedaban sin leer.
_LECTURAS_A_LA_VEZ = 3
_turno: Optional[asyncio.Semaphore] = None


def _cola() -> asyncio.Semaphore:
    global _turno
    if _turno is None:
        _turno = asyncio.Semaphore(_LECTURAS_A_LA_VEZ)
    return _turno


def _apuntar_paso(doc_id: int):
    """Devuelve la función que apunta en el albarán por qué paso va su lectura (lo enseña la pantalla de espera)."""
    def apuntar(paso: str) -> None:
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            db.query(Document).filter(Document.id == doc_id).update({"lectura_paso": paso})
            db.commit()
        finally:
            db.close()
    return apuntar


def _lectura_media(db: Session) -> Optional[float]:
    """Lo que han tardado de media las últimas lecturas, para estimar cuánto falta en la que está en marcha."""
    ult = [s for (s,) in db.query(Document.leido_segundos).filter(Document.leido_segundos.isnot(None))
           .order_by(Document.id.desc()).limit(12).all() if s]
    return round(sum(ult) / len(ult), 1) if len(ult) >= 3 else None


TOPE_LECTURA_S = 480   # una lectura normal va de 20 s a 2-3 min; con este tope ninguna se queda «leyendo» sin fin


async def _con_tope(lectura):
    """La lectura, con un tope de tiempo: una llamada colgada a la IA dejaba el albarán «leyendo» (y un sitio de la
    cola ocupado) hasta 50 minutos."""
    try:
        return await asyncio.wait_for(lectura, TOPE_LECTURA_S)
    except asyncio.TimeoutError:
        raise extraction_service.LecturaError(
            "La IA ha tardado demasiado con este albarán y se ha parado. Vuelve a leerlo («Más» → «Volver a leer»).")


def _rutas(doc: Document) -> List[str]:
    """Todas las rutas del albarán (varias si se subió en varias fotos; los antiguos solo tienen una)."""
    try:
        lista = json.loads(doc.file_paths) if doc.file_paths else []
    except (TypeError, ValueError):
        lista = []
    lista = [p for p in lista if p]
    return lista or ([doc.file_path] if doc.file_path else [])


def marcar_interrumpidos() -> List[int]:
    """Al arrancar: los albaranes que se estaban leyendo (o esperaban en la cola) cuando se paró el servidor.
    Se retoman solos **una vez** (devuelve sus ids para `reanudar`); antes quedaban en error y había que volver a
    leerlos a mano, y cada vez que se publicaba se cortaban los que estuvieran a medias. Si uno se corta por
    segunda vez, queda en error: no se insiste con un archivo que tumba el servidor."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        retomar: List[int] = []
        for d in db.query(Document).filter(Document.status.in_(("processing", "uploaded"))).all():
            if d.reanudado:
                d.status = "error"
                d.error_message = "Se cortó dos veces mientras se leía. Vuelve a leerlo desde «Más» → «Volver a leer»."
            else:
                d.reanudado, d.status, d.lectura_desde = True, "uploaded", datetime.utcnow()
                retomar.append(d.id)
        db.commit()
        if retomar:
            logger.info("%s albarán(es) a medias: se retoma su lectura", len(retomar))
        return retomar
    finally:
        db.close()


_retomando: set = set()


def reanudar(ids: List[int]) -> None:
    """Lanza en segundo plano la lectura de esos albaranes (hay que llamarlo con el servidor ya en marcha)."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        datos = [(d.id, _rutas(d), d.supplier_id) for d in db.query(Document).filter(Document.id.in_(ids or [-1])).all()]
    finally:
        db.close()
    for doc_id, rutas, prov in datos:
        t = asyncio.create_task(_process_multi_document(doc_id, rutas, prov) if len(rutas) > 1 else _process_document(doc_id, prov))
        _retomando.add(t)
        t.add_done_callback(_retomando.discard)


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
        raise HTTPException(400, f"Ese archivo no vale ({suffix or 'sin tipo'}). Sube el PDF o una foto (JPG o PNG).")

    # Validate size (sin leer más de la cuenta)
    content = await file.read(settings.max_upload_size_bytes + 1)
    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(413, f"El archivo es demasiado grande (como mucho {settings.max_upload_size_mb} MB).")

    # El mismo archivo otra vez (p. ej. se volvió a pulsar «Subir»): se devuelve el que ya hay, sin leerlo de nuevo
    huella = hashlib.sha256(content).hexdigest()
    ya = _ya_subido(db, huella)
    if ya:
        return ya

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
        lectura_desde=datetime.utcnow(),
        supplier_id=supplier_id,
        huella=huella,
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
    resumen = hashlib.sha256()
    try:
        for file in files:
            suffix = Path(file.filename).suffix.lower().lstrip(".")
            if suffix not in IMAGE_EXTS:
                raise HTTPException(400, f"Con varias páginas, todas tienen que ser fotos (JPG o PNG). Esta no: {file.filename}")
            content = await file.read(settings.max_upload_size_bytes + 1)
            if len(content) > settings.max_upload_size_bytes:
                raise HTTPException(413, f"Esta foto es demasiado grande: {file.filename}")
            resumen.update(hashlib.sha256(content).digest())
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

    huella = resumen.hexdigest()
    ya = _ya_subido(db, huella)
    if ya:
        for p in saved_paths:
            Path(p).unlink(missing_ok=True)
        return ya

    display_name = f"{len(files)} páginas - {first_filename}"
    doc = Document(
        filename=Path(saved_paths[0]).name,
        original_filename=display_name,
        file_path=saved_paths[0],
        file_paths=json.dumps(saved_paths),
        doc_type="image",
        status="uploaded",
        lectura_desde=datetime.utcnow(),
        supplier_id=supplier_id,
        huella=huella,
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
    gemelos = _gemelos([doc for doc, _ in rows])
    from app.services import drive_proveedor, mail_service
    desde = drive_proveedor._desde(db) if mail_service.configured() else None
    ahora = datetime.utcnow()
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
            drive_estado=_drive_estado(doc, desde, ahora),
            drive_carpeta=doc.drive_carpeta,
            gemelo_id=gemelos.get(doc.id),
            created_at=doc.created_at,
        )
        for doc, count in rows
    ]


def _drive_estado(doc: Document, desde: Optional[int], ahora: datetime) -> Optional[str]:
    """Cómo va la copia en Drive, para verlo en la lista sin abrir cada albarán:
    «ok», «sin_carpeta» (guardado, falta elegir carpeta), «sin_leer» (guardado sin leer), «guardando» o «falta».
    None = no aplica (albaranes de antes de que existiera la copia, o Drive sin configurar)."""
    if doc.drive_file_id:
        if doc.status == "error":
            return "sin_leer"
        return "sin_carpeta" if doc.drive_pendiente else "ok"
    if desde is None or doc.id <= desde:
        return None
    if doc.status in ("uploaded", "processing"):
        return "guardando"
    if doc.drive_error:
        return "falta"
    reciente = doc.updated_at and (ahora - doc.updated_at).total_seconds() < 600
    return "guardando" if reciente else "falta"


def _clave_numero(doc: Document) -> Optional[tuple]:
    """Proveedor y número sin puntos, espacios ni ceros delante («0.489278» = «0489278»)."""
    num = re.sub(r"[^A-Z0-9]", "", (doc.doc_number or "").upper()).lstrip("0")
    prov = re.sub(r"[^A-Z0-9]", "", (doc.supplier_name or "").upper())
    return (prov, num) if prov and len(num) >= 3 else None


def _gemelos(docs: List[Document]) -> dict:
    """Albaranes del mismo proveedor con el mismo número: el escáner saca un PDF por hoja, así que la hoja 2
    llega como otro albarán (o es el mismo escaneado dos veces). {id: id del primero que se subió}.
    No cuentan los que la tienda ya dijo que son distintos, ni los que no se leyeron."""
    grupos: dict = {}
    for d in docs:
        k = _clave_numero(d) if d.status == "completed" and not d.distinto_ok else None
        if k:
            grupos.setdefault(k, []).append(d)
    out: dict = {}
    for g in grupos.values():
        # mismo número en fechas distintas no es el mismo albarán (los proveedores repiten numeración con los años)
        por_fecha: dict = {}
        for d in g:
            por_fecha.setdefault(d.doc_date, []).append(d)
        for mismos in por_fecha.values():
            if len(mismos) < 2:
                continue
            mismos.sort(key=lambda d: d.id)
            for d in mismos[1:]:
                out[d.id] = mismos[0].id
            out[mismos[0].id] = mismos[1].id
    return out


class Juntar(BaseModel):
    con: int


def _a_pdf(ruta: str):
    """Las páginas de un archivo del albarán (PDF o foto) como páginas de PDF."""
    import io
    from pypdf import PdfReader
    if ruta.lower().endswith(".pdf"):
        return list(PdfReader(ruta).pages)
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(ruta)).convert("RGB")
    im.thumbnail((2600, 2600))
    buf = io.BytesIO()
    im.save(buf, "PDF", resolution=200)
    return list(PdfReader(io.BytesIO(buf.getvalue())).pages)


@router.post("/{doc_id}/juntar", response_model=DocumentResponse)
async def juntar(doc_id: int, data: Juntar, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Dos albaranes que son hojas del mismo (el escáner saca un PDF por hoja): quedan en uno solo, con todas las
    hojas en un PDF, y se vuelve a leer entero para que las cuentas cuadren con el total de la última hoja."""
    from pypdf import PdfWriter
    a = db.query(Document).filter(Document.id == doc_id).first()
    b = db.query(Document).filter(Document.id == data.con).first()
    if not a or not b or a.id == b.id:
        raise HTTPException(404, "No encuentro esos dos albaranes.")
    if "processing" in (a.status, b.status) or "uploaded" in (a.status, b.status):
        raise HTTPException(409, "Uno de los dos se está leyendo todavía. Espera a que termine.")
    # Se queda el que se subió primero; las hojas, en el orden en que salieron del escáner
    a, b = sorted((a, b), key=lambda d: d.id)
    orden = sorted((a, b), key=lambda d: (d.original_filename or "", d.id))
    w = PdfWriter()
    try:
        for d in orden:
            for ruta in _rutas(d):
                for pg in _a_pdf(ruta):
                    w.add_page(pg)
    except Exception as e:
        logger.warning("No se pudieron juntar %s y %s: %s", a.id, b.id, e)
        raise HTTPException(422, "No se pudieron juntar las hojas (alguno de los archivos está dañado). Sube el albarán entero otra vez.")
    stored = f"{uuid.uuid4().hex}.pdf"
    destino = Path(settings.upload_dir) / stored
    with open(destino, "wb") as f:
        w.write(f)
    viejas = _rutas(a) + _rutas(b)
    drive_b = b.drive_file_id
    nombres = " + ".join(x for x in ((orden[0].original_filename or ""), (orden[1].original_filename or "")) if x)
    a.filename, a.file_path, a.file_paths, a.doc_type = stored, str(destino), None, "pdf"
    a.original_filename = nombres[:250] or a.original_filename
    a.huella = hashlib.sha256(destino.read_bytes()).hexdigest()
    a.status, a.error_message, a.terminado_at, a.lectura_desde = "uploaded", None, None, datetime.utcnow()
    db.query(Article).filter(Article.document_id == a.id).delete()
    db.delete(b)
    db.commit()
    db.refresh(a)
    for p in viejas:
        try:
            Path(p).unlink(missing_ok=True)
        except Exception:
            pass
    if drive_b:  # la copia suelta de la otra hoja sobra: el albarán entero se guarda al terminar de leerse
        _borrar_de_drive(drive_b)
    background_tasks.add_task(_process_document, a.id, a.supplier_id)
    return a


class Distintos(BaseModel):
    con: int


@router.put("/{doc_id}/distintos", response_model=DocumentResponse)
def son_distintos(doc_id: int, data: Distintos, db: Session = Depends(get_db)):
    """La tienda confirma que dos albaranes con el mismo número son distintos: ya no se pregunta más."""
    docs = db.query(Document).filter(Document.id.in_((doc_id, data.con))).all()
    if len(docs) < 2:
        raise HTTPException(404, "No encuentro esos dos albaranes.")
    for d in docs:
        d.distinto_ok = True
    db.commit()
    return next(d for d in docs if d.id == doc_id)


def _borrar_de_drive(file_id: str) -> None:
    import threading
    from app.services import mail_service

    def _fuera():
        try:
            mail_service.drive_borrar(file_id)
        except Exception as e:
            logger.warning("No se pudo quitar de Drive %s: %s", file_id, e)
    if mail_service.configured():
        threading.Thread(target=_fuera, daemon=True).start()


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
    if doc.status in ("uploaded", "processing"):
        doc.lectura_media_s = _lectura_media(db)   # solo para la pantalla de espera; no se guarda
        if doc.lectura_desde:
            doc.lectura_lleva_s = max(0.0, round((datetime.utcnow() - doc.lectura_desde).total_seconds(), 1))
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

    datos = update.model_dump(exclude_unset=True)
    nuevo = (datos.get("supplier_name") or "").strip()
    if nuevo and nuevo != (doc.supplier_name or ""):
        if compras_service.es_propio(nuevo):
            raise HTTPException(422, "Casa Fonso es quien compra. Pon el nombre del proveedor que manda el albarán.")
        # La próxima vez que la lectura saque el mismo nombre, se guarda ya con el corregido
        compras_service.aprender(db, doc.supplier_leido or doc.supplier_name, nuevo)
        datos["supplier_name"] = nuevo
    antes = (doc.supplier_name, doc.doc_number, doc.doc_date)
    for field, value in datos.items():
        setattr(doc, field, value)
    db.commit()
    db.refresh(doc)
    if antes != (doc.supplier_name, doc.doc_number, doc.doc_date):
        # La copia de Drive lleva proveedor, fecha y número en el nombre y va en la carpeta del proveedor:
        # si se corrigen a mano, se vuelve a guardar en su sitio (antes se quedaba donde la puso la lectura)
        rutas = _rutas(doc)
        _guardar_en_drive(doc.id, rutas if len(rutas) > 1 else None)
    return doc


@router.delete("/{doc_id}")
def delete_document(doc_id: int, drive: bool = False, db: Session = Depends(get_db)):
    """Delete document and all articles. Con `drive`, también su copia de Drive (un albarán subido dos veces)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if drive and doc.drive_file_id:
        _borrar_de_drive(doc.drive_file_id)

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
    if doc.status in ("processing", "uploaded"):
        raise HTTPException(409, "Este albarán ya se está leyendo (o está en cola). Espera a que termine.")

    # Delete existing articles
    db.query(Article).filter(Article.document_id == doc_id).delete()
    doc.status = "uploaded"
    doc.error_message = None
    doc.reanudado = None
    doc.lectura_desde = datetime.utcnow()
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


def _heredar(db: Session, doc: Document) -> None:
    """Código de barras ya escaneado y precio de venta puesto a mano, de la compra anterior (nunca rompe la lectura)."""
    try:
        db.flush()
        ajustes = db.query(AppSettings).filter(AppSettings.id == 1).first()
        if ajustes:
            compras_service.heredar(db, doc, ajustes)
    except Exception as e:
        logger.warning("No se pudo heredar de la compra anterior en el albarán %s: %s", doc.id, e)


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
    async with _cola():
        await _leer_multi(doc_id, file_paths, supplier_id)


async def _leer_multi(doc_id: int, file_paths: list, supplier_id: Optional[int] = None):
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
        doc.lectura_paso = "preparando"
        db.commit()

        extraction_service.poner_conocidos(compras_service.conocidos(db))
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
    empezo = time.monotonic()
    extraction_service.al_cambiar_de_paso(_apuntar_paso(doc_id))
    try:
        result = await _con_tope(extract_multi_images(
            file_paths=file_paths,
            supplier_id=supplier_id,
            suppliers=suppliers_data,
        ))
    except Exception as e:
        logger.error(f"Multi extraction failed for document {doc_id}: {e}", exc_info=True)
        db2 = SessionLocal()
        try:
            doc2 = db2.query(Document).filter(Document.id == doc_id).first()
            if doc2:
                doc2.status = "error"
                doc2.lectura_paso = None
                doc2.error_message = mensaje_para_persona(e)
                db2.commit()
        finally:
            db2.close()
        _guardar_en_drive(doc_id, file_paths)  # sin leer, pero guardado (en «_Pendientes de clasificar»)
        return

    # Phase 3: quick write of results
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        documento = result.get("documento", {})
        # Proveedor: nunca Casa Fonso (es el cliente), siempre escrito igual y con lo que la tienda corrigió otras veces
        doc.supplier_leido = (str(documento.get("proveedor") or "").strip() or None)
        doc.supplier_name = compras_service.resolver_proveedor(
            db, doc.supplier_leido, (result.get("supplier_detected") or {}).get("name"), supplier_name_fallback)
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
        _heredar(db, doc)
        doc.leido_con = extraction_service.modelo_usado()
        doc.leido_nota, doc.reanudado = extraction_service.motivo_fallo(), None
        doc.leido_segundos = round(time.monotonic() - empezo, 1)
        doc.lectura_paso = None
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
                doc.error_message = mensaje_para_persona(e)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


async def _process_document(doc_id: int, supplier_id: Optional[int] = None):
    async with _cola():
        await _leer_uno(doc_id, supplier_id)


async def _leer_uno(doc_id: int, supplier_id: Optional[int] = None):
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
        doc.lectura_paso = "preparando"
        db.commit()

        extraction_service.poner_conocidos(compras_service.conocidos(db))
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
    empezo = time.monotonic()
    extraction_service.al_cambiar_de_paso(_apuntar_paso(doc_id))
    try:
        result = await _con_tope(extract_document(
            file_path=file_path,
            doc_type=doc_type,
            supplier_id=supplier_id,
            suppliers=suppliers_data,
        ))
    except Exception as e:
        logger.error(f"Extraction failed for document {doc_id}: {e}", exc_info=True)
        db2 = SessionLocal()
        try:
            doc2 = db2.query(Document).filter(Document.id == doc_id).first()
            if doc2:
                doc2.status = "error"
                doc2.lectura_paso = None
                doc2.error_message = mensaje_para_persona(e)
                db2.commit()
        finally:
            db2.close()
        _guardar_en_drive(doc_id, None)  # sin leer, pero guardado (en «_Pendientes de clasificar»)
        return

    # ── Phase 3: quick write of results ─────────────────────────────────
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        # Update document metadata
        documento = result.get("documento", {})
        # Proveedor: nunca Casa Fonso (es el cliente), siempre escrito igual y con lo que la tienda corrigió otras veces
        doc.supplier_leido = (str(documento.get("proveedor") or "").strip() or None)
        doc.supplier_name = compras_service.resolver_proveedor(
            db, doc.supplier_leido, (result.get("supplier_detected") or {}).get("name"), supplier_name_fallback)
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

        _heredar(db, doc)
        doc.leido_con = extraction_service.modelo_usado()
        doc.leido_nota, doc.reanudado = extraction_service.motivo_fallo(), None
        doc.leido_segundos = round(time.monotonic() - empezo, 1)
        doc.lectura_paso = None
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
                doc.error_message = mensaje_para_persona(e)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
