"""
Firma de albaranes de venta.

Flujo: se suben los PDF exportados de treyFACT → se leen nº, fecha y cliente →
quedan "pendientes" → se firman desde cualquier móvil/tablet → el PDF firmado
queda guardado y se puede imprimir, compartir o descargar en ZIP por cliente y mes.
"""
import io
import logging
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.client_delivery_note import ClientDeliveryNote
from app.schemas.client_delivery_note import ClientDeliveryNoteResponse, ClientDeliveryNoteUpdate
from app.services.firma_service import AlbaranMeta, parse_albaran, stamp_signature

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/firmas", tags=["firmas"])

TZ = ZoneInfo("Europe/Madrid")


def _dir() -> Path:
    d = Path(settings.upload_dir) / "albaranes_venta"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _get(db: Session, note_id: int) -> ClientDeliveryNote:
    n = db.query(ClientDeliveryNote).filter(ClientDeliveryNote.id == note_id).first()
    if not n:
        raise HTTPException(404, "Albarán no encontrado")
    return n


def _current_path(n: ClientDeliveryNote) -> Path:
    p = Path(n.signed_path or n.original_path)
    if not p.exists():
        raise HTTPException(404, "No se encuentra el PDF en el servidor")
    return p


@router.get("", response_model=List[ClientDeliveryNoteResponse])
def list_notes(
    status: Optional[str] = None,
    codigo_cliente: Optional[str] = None,
    mes: Optional[str] = Query(default=None, description="AAAA-MM"),
    q: Optional[str] = None,
    limit: int = Query(default=1000, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    query = db.query(ClientDeliveryNote)
    if status:
        query = query.filter(ClientDeliveryNote.status == status)
    if codigo_cliente:
        query = query.filter(ClientDeliveryNote.codigo_cliente == codigo_cliente)
    if mes:
        query = query.filter(ClientDeliveryNote.fecha.like(f"{mes}%"))
    if q:
        like = f"%{q}%"
        query = query.filter(
            ClientDeliveryNote.numero.ilike(like) | ClientDeliveryNote.cliente.ilike(like)
            | ClientDeliveryNote.codigo_cliente.ilike(like) | ClientDeliveryNote.obra.ilike(like)
        )
    return (query.order_by(ClientDeliveryNote.fecha.desc(), ClientDeliveryNote.numero.desc())
            .limit(limit).all())


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    pend = db.query(ClientDeliveryNote).filter(ClientDeliveryNote.status == "pendiente").count()
    total = db.query(ClientDeliveryNote).count()
    return {"pendiente": pend, "firmado": total - pend, "total": total}


@router.post("/upload", response_model=List[ClientDeliveryNoteResponse])
async def upload(files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    out = []
    for f in files:
        data = await f.read()
        if data[:5] != b"%PDF-":
            raise HTTPException(400, f"{f.filename}: no es un PDF")
        if len(data) > settings.max_upload_size_bytes:
            raise HTTPException(400, f"{f.filename}: supera {settings.max_upload_size_mb} MB")
        try:
            meta = parse_albaran(data, f.filename or "")
        except Exception as e:  # PDF raro o escaneado: se guarda igual para revisarlo a mano
            logger.warning("No se pudo leer %s: %s", f.filename, e)
            meta = AlbaranMeta(numero=(f.filename or "albaran").rsplit(".", 1)[0])

        path = _dir() / f"{uuid.uuid4().hex}.pdf"
        path.write_bytes(data)

        existentes = db.query(ClientDeliveryNote).filter(ClientDeliveryNote.numero == meta.numero).all()
        pendiente = next((e for e in existentes if e.status == "pendiente"), None)
        ya_firmado = any(e.status == "firmado" for e in existentes)
        nota = None
        if not meta.codigo_cliente:
            nota = "No se encontró el código de cliente"
        elif ya_firmado:
            nota = "Versión nueva: ya había uno firmado con este número"

        if pendiente:  # la misma versión sin firmar → se sustituye el PDF
            Path(pendiente.original_path).unlink(missing_ok=True)
            note = pendiente
            note.nota = nota or "Reemplazado por una versión nueva"
        else:
            note = ClientDeliveryNote(numero=meta.numero, nota=nota)
            db.add(note)
        note.fecha = meta.fecha or None
        note.codigo_cliente = meta.codigo_cliente or None
        note.cliente = meta.cliente or None
        note.obra = meta.obra or None
        note.page_count = meta.page_count
        note.original_path = str(path)
        db.commit()
        db.refresh(note)
        out.append(note)
    return out


@router.get("/export.zip")
def export_zip(codigo_cliente: Optional[str] = None, mes: Optional[str] = None,
               db: Session = Depends(get_db)):
    query = db.query(ClientDeliveryNote).filter(ClientDeliveryNote.status == "firmado")
    if codigo_cliente:
        query = query.filter(ClientDeliveryNote.codigo_cliente == codigo_cliente)
    if mes:
        query = query.filter(ClientDeliveryNote.fecha.like(f"{mes}%"))
    notes = query.order_by(ClientDeliveryNote.fecha, ClientDeliveryNote.numero).all()
    if not notes:
        raise HTTPException(404, "No hay albaranes firmados con ese filtro")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n in notes:
            p = Path(n.signed_path or "")
            if p.exists():
                z.write(p, f"{n.numero} firmado.pdf")
    buf.seek(0)
    nombre = "Albaranes firmados" + (f" {codigo_cliente}" if codigo_cliente else "") + (f" {mes}" if mes else "")
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{nombre}.zip"'})


@router.get("/{note_id}", response_model=ClientDeliveryNoteResponse)
def get_note(note_id: int, db: Session = Depends(get_db)):
    return _get(db, note_id)


@router.put("/{note_id}", response_model=ClientDeliveryNoteResponse)
def update_note(note_id: int, update: ClientDeliveryNoteUpdate, db: Session = Depends(get_db)):
    n = _get(db, note_id)
    for k, v in update.model_dump(exclude_unset=True).items():
        if k == "numero":
            if v:
                n.numero = v
        else:
            setattr(n, k, v or None)
    db.commit()
    db.refresh(n)
    return n


@router.get("/{note_id}/pdf")
def get_pdf(note_id: int, download: bool = False, db: Session = Depends(get_db)):
    n = _get(db, note_id)
    p = _current_path(n)
    nombre = f"{n.numero}{' firmado' if n.signed_path else ''}.pdf"
    return FileResponse(p, media_type="application/pdf", filename=nombre,
                        content_disposition_type="attachment" if download else "inline")


@router.get("/{note_id}/page/{page}.png")
def page_png(note_id: int, page: int, dpi: int = Query(default=110, ge=50, le=220),
             db: Session = Depends(get_db)):
    """Página renderizada como imagen: se ve igual en cualquier móvil y sirve para imprimir."""
    from pdf2image import convert_from_path
    n = _get(db, note_id)
    p = _current_path(n)
    imgs = convert_from_path(str(p), dpi=dpi, first_page=page, last_page=page)
    if not imgs:
        raise HTTPException(404, "Página no encontrada")
    buf = io.BytesIO()
    imgs[0].save(buf, "PNG", optimize=True)
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})


@router.post("/{note_id}/sign", response_model=ClientDeliveryNoteResponse)
async def sign(
    note_id: int,
    firma: UploadFile = File(...),
    nombre: str = Form(...),
    dni: str = Form(default=""),
    db: Session = Depends(get_db),
):
    n = _get(db, note_id)
    if n.status == "firmado":
        raise HTTPException(409, f"El albarán {n.numero} ya está firmado")
    nombre = nombre.strip()
    if not nombre:
        raise HTTPException(400, "Falta el nombre de quien recibe")
    png = await firma.read()
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise HTTPException(400, "La firma no es válida")

    ahora = datetime.now(TZ)
    firmado_el = ahora.strftime("%d/%m/%Y a las %H:%M")
    original = Path(n.original_path).read_bytes()
    signed = stamp_signature(original, png, n.numero, n.cliente or "", nombre, dni.strip(), firmado_el)

    path = _dir() / f"{uuid.uuid4().hex}_firmado.pdf"
    path.write_bytes(signed)
    n.signed_path = str(path)
    n.status = "firmado"
    n.signed_at = ahora.replace(tzinfo=None)
    n.signed_by = nombre
    n.signer_dni = dni.strip() or None
    n.page_count = len(PdfReader(io.BytesIO(signed)).pages)
    db.commit()
    db.refresh(n)
    logger.info("Albarán %s firmado por %s", n.numero, nombre)
    return n


@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    n = _get(db, note_id)
    for p in (n.original_path, n.signed_path):
        if p:
            Path(p).unlink(missing_ok=True)
    db.delete(n)
    db.commit()
    return {"ok": True}
