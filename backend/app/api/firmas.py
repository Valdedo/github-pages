"""
Firma de albaranes de venta.

Flujo: se suben los PDF exportados de treyFACT → se leen nº, fecha y cliente →
quedan "pendientes" → se firman desde cualquier móvil/tablet → el PDF firmado
queda guardado y se puede imprimir, compartir o descargar en ZIP por cliente y mes.
"""
import io
import logging
import re
import secrets
import uuid
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from pypdf import PdfReader, PdfWriter
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.client_delivery_note import ClientContact, ClientDeliveryNote
from app.schemas.client_delivery_note import (
    ClientDeliveryNoteResponse, ClientDeliveryNoteUpdate, ContactoCliente, EnviarEmail, Marcas, MarcasLote, Reparto,
)
from app.services.backup_service import backup_en_segundo_plano
from app.services import push_service
from app.services.mail_service import MailNotConfigured, send_pdf
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
    q = db.query(ClientDeliveryNote)
    pend = q.filter(ClientDeliveryNote.status == "pendiente").count()
    total = q.count()
    sin_facturar = q.filter(ClientDeliveryNote.status == "firmado", ClientDeliveryNote.facturado_at.is_(None)).count()
    return {"pendiente": pend, "firmado": total - pend, "sin_facturar": sin_facturar, "total": total}


def _mismo_pdf(path: Optional[str], data: bytes) -> bool:
    try:
        p = Path(path or "")
        return p.exists() and p.stat().st_size == len(data) and p.read_bytes() == data
    except Exception:
        return False


@router.post("/upload", response_model=List[ClientDeliveryNoteResponse])
def upload(files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    # Síncrono a propósito: FastAPI lo ejecuta aparte y no bloquea al resto de la app
    out = []
    for f in files:
        data = f.file.read()
        if data[:5] != b"%PDF-":
            raise HTTPException(400, f"{f.filename}: no es un PDF")
        if len(data) > settings.max_upload_size_bytes:
            raise HTTPException(400, f"{f.filename}: supera {settings.max_upload_size_mb} MB")
        try:
            meta = parse_albaran(data, f.filename or "")
        except Exception as e:  # PDF raro o escaneado: se guarda igual para revisarlo a mano
            logger.warning("No se pudo leer %s: %s", f.filename, e)
            meta = AlbaranMeta(numero=(f.filename or "albaran").rsplit(".", 1)[0])

        existentes = db.query(ClientDeliveryNote).filter(ClientDeliveryNote.numero == meta.numero).all()
        identico = next((e for e in existentes if _mismo_pdf(e.original_path, data)), None)
        if identico:  # el mismo PDF otra vez: no se duplica ni se avisa
            out.append(identico)
            continue

        path = _dir() / f"{uuid.uuid4().hex}.pdf"
        path.write_bytes(data)

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
        note.importe = meta.importe
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


@router.post("/reparto", response_model=List[ClientDeliveryNoteResponse])
def reparto(data: Reparto, db: Session = Depends(get_db)):
    """Meter o sacar albaranes del camión de Melchor (le llega un aviso al móvil)."""
    notes = db.query(ClientDeliveryNote).filter(ClientDeliveryNote.id.in_(data.ids)).all()
    nuevos = 0
    if data.en_camion:
        ultimo = db.query(ClientDeliveryNote.reparto_orden).filter(
            ClientDeliveryNote.reparto_at.isnot(None)).order_by(ClientDeliveryNote.reparto_orden.desc()).first()
        orden = (ultimo[0] or 0) if ultimo else 0
        for n in sorted(notes, key=lambda x: data.ids.index(x.id)):
            if n.status == "pendiente" and not n.reparto_at:
                orden += 1
                n.reparto_at = datetime.now(TZ).replace(tzinfo=None)
                n.reparto_orden = orden
                nuevos += 1
    else:
        for n in notes:
            n.reparto_at = None
            n.reparto_orden = None
    db.commit()
    for n in notes:
        db.refresh(n)
    if nuevos:
        push_service.nuevos_en_reparto(nuevos)
    return notes


@router.post("/marcas", response_model=List[ClientDeliveryNoteResponse])
def marcas_lote(data: MarcasLote, db: Session = Depends(get_db)):
    """Marcar varios a la vez (p. ej. todos los de una empresa como facturados)."""
    notes = db.query(ClientDeliveryNote).filter(ClientDeliveryNote.id.in_(data.ids)).all()
    for n in notes:
        _aplicar_marcas(n, data)
    db.commit()
    for n in notes:
        db.refresh(n)
    return notes


@router.get("/combinado.pdf")
def combinado(ids: str = Query(..., description="ids separados por comas"), db: Session = Depends(get_db)):
    """Un único PDF con los albaranes firmados indicados (para adjuntar a la factura)."""
    try:
        lista = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "Lista de albaranes no válida")
    notes = (db.query(ClientDeliveryNote)
             .filter(ClientDeliveryNote.id.in_(lista), ClientDeliveryNote.status == "firmado")
             .order_by(ClientDeliveryNote.fecha, ClientDeliveryNote.numero).all())
    notes = [n for n in notes if n.signed_path and Path(n.signed_path).exists()]
    if not notes:
        raise HTTPException(404, "No hay albaranes firmados en la selección")
    writer = PdfWriter()
    for n in notes:
        writer.append(PdfReader(n.signed_path))
    buf = io.BytesIO()
    writer.write(buf)
    clientes = {n.cliente or n.codigo_cliente or "" for n in notes}
    meses = sorted({(n.fecha or "")[:7] for n in notes if n.fecha})
    nombre = "Albaranes " + (clientes.pop() if len(clientes) == 1 else "varios clientes")
    if meses:
        nombre += f" {meses[0]}" + (f" a {meses[-1]}" if len(meses) > 1 else "")
    nombre = re.sub(r'[\\/:*?"<>|]+', "-", nombre).strip()
    from urllib.parse import quote
    return Response(buf.getvalue(), media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename*=utf-8''{quote(nombre + '.pdf')}"})


@router.get("/avisos")
def avisos(db: Session = Depends(get_db)):
    """Lo que se está quedando atrás: sin firmar más de 2 días y meses anteriores sin facturar."""
    ahora = datetime.now(TZ).replace(tzinfo=None)
    sin_firmar = []
    for n in db.query(ClientDeliveryNote).filter(ClientDeliveryNote.status == "pendiente").all():
        dias = (ahora - n.created_at).days if n.created_at else 0
        if dias >= 2:
            sin_firmar.append({"id": n.id, "numero": n.numero, "cliente": n.cliente, "dias": dias})
    sin_firmar.sort(key=lambda x: -x["dias"])

    inicio_mes = ahora.strftime("%Y-%m-01")
    grupos: dict = {}
    for n in (db.query(ClientDeliveryNote)
              .filter(ClientDeliveryNote.status == "firmado", ClientDeliveryNote.facturado_at.is_(None),
                      ClientDeliveryNote.fecha < inicio_mes).all()):
        k = n.codigo_cliente or "—"
        g = grupos.setdefault(k, {"codigo_cliente": n.codigo_cliente, "cliente": n.cliente, "albaranes": 0, "importe": 0.0})
        g["albaranes"] += 1
        g["importe"] = round(g["importe"] + (n.importe or 0), 2)
    return {
        "sin_firmar": sin_firmar,
        "sin_facturar": sorted(grupos.values(), key=lambda g: -g["albaranes"]),
    }


@router.get("/compartir/{token}/{filename}")
def shared_pdf(token: str, filename: str, db: Session = Depends(get_db)):
    """Enlace para el cliente (WhatsApp): solo funciona con el código secreto del albarán."""
    n = db.query(ClientDeliveryNote).filter(ClientDeliveryNote.share_token == token).first()
    if not n or not n.signed_path or not Path(n.signed_path).exists():
        raise HTTPException(404, "Enlace no válido")
    return FileResponse(n.signed_path, media_type="application/pdf", filename=f"{n.numero} firmado.pdf",
                        content_disposition_type="inline")


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
def sign(
    note_id: int,
    request: Request,
    firma: UploadFile = File(...),
    nombre: str = Form(...),
    dni: str = Form(default=""),
    firmado_el: Optional[str] = Form(default=None),  # firmado sin cobertura: hora real de la firma
    db: Session = Depends(get_db),
):
    n = _get(db, note_id)
    if n.status == "firmado":
        raise HTTPException(409, f"El albarán {n.numero} ya está firmado")
    nombre = nombre.strip()
    if not nombre:
        raise HTTPException(400, "Falta el nombre de quien recibe")
    png = firma.file.read()
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise HTTPException(400, "La firma no es válida")

    ahora = datetime.now(TZ)
    if firmado_el:
        try:
            cuando = datetime.fromisoformat(firmado_el.replace("Z", "+00:00")).astimezone(TZ)
            if (ahora - cuando).total_seconds() < 7 * 86400 and cuando <= ahora + timedelta(minutes=5):
                ahora = cuando
        except Exception:
            pass
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

    c = _contacto(db, n)
    if c and c.auto_email and c.email:
        try:
            _enviar_email(db, n, c.email)
        except Exception as e:  # la firma ya está guardada; solo se avisa
            n.nota = f"No se pudo enviar el correo automático: {e}"
            db.commit()
            db.refresh(n)
    backup_en_segundo_plano()
    if getattr(request.state, "rol", None) == "reparto":
        push_service.avisar(push_service.a_tienda, f"Firmado en el reparto: {n.numero}",
                            f"{n.cliente or 'Cliente'} · firmó {nombre}", f"/firmas/{n.id}", f"firma-{n.id}")
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


# ---------- Envío al cliente ----------

def _contacto(db: Session, n: ClientDeliveryNote) -> Optional[ClientContact]:
    if not n.codigo_cliente:
        return None
    return db.query(ClientContact).filter(ClientContact.codigo_cliente == n.codigo_cliente).first()


def _guardar_contacto(db: Session, n: ClientDeliveryNote, email: Optional[str] = None,
                      telefono: Optional[str] = None, auto_email: Optional[bool] = None):
    if not n.codigo_cliente:
        return
    c = _contacto(db, n)
    if not c:
        c = ClientContact(codigo_cliente=n.codigo_cliente)
        db.add(c)
    if email is not None:
        c.email = email or None
    if telefono is not None:
        c.telefono = telefono or None
    if auto_email is not None:
        c.auto_email = auto_email


@router.get("/{note_id}/contacto", response_model=ContactoCliente)
def get_contacto(note_id: int, db: Session = Depends(get_db)):
    c = _contacto(db, _get(db, note_id))
    return ContactoCliente(email=c.email if c else None, telefono=c.telefono if c else None,
                           auto_email=bool(c.auto_email) if c else False)


@router.put("/{note_id}/contacto", response_model=ContactoCliente)
def put_contacto(note_id: int, data: ContactoCliente, db: Session = Depends(get_db)):
    n = _get(db, note_id)
    tel = re.sub(r"[^\d+]", "", data.telefono) if data.telefono is not None else None
    _guardar_contacto(db, n, data.email.strip() if data.email is not None else None, tel, data.auto_email)
    db.commit()
    return get_contacto(note_id, db)


def _enviar_email(db: Session, n: ClientDeliveryNote, to: str) -> None:
    body = (
        "Buenas,\n\n"
        f"Le adjuntamos el albarán {n.numero} firmado"
        + (f" por {n.signed_by}" if n.signed_by else "")
        + (f" el {n.signed_at.strftime('%d/%m/%Y a las %H:%M')}" if n.signed_at else "")
        + ".\n\nUn saludo,\n\nCasa Fonso · Materiales de construcción\nTel./WhatsApp 985 62 04 81\ncasafonsomc@gmail.com"
    )
    send_pdf(to, f"Albarán {n.numero} firmado · Casa Fonso", body,
             f"{n.numero} firmado.pdf", Path(n.signed_path).read_bytes())
    n.emailed_to = to
    n.emailed_at = datetime.now(TZ).replace(tzinfo=None)
    _guardar_contacto(db, n, email=to)
    db.commit()
    db.refresh(n)


@router.post("/{note_id}/email", response_model=ClientDeliveryNoteResponse)
def email_note(note_id: int, data: EnviarEmail, db: Session = Depends(get_db)):
    n = _get(db, note_id)
    if n.status != "firmado" or not n.signed_path:
        raise HTTPException(400, "El albarán todavía no está firmado")
    to = data.to.strip()
    if not re.fullmatch(r"[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+", to):
        raise HTTPException(400, "El correo no es válido")
    try:
        _enviar_email(db, n, to)
    except MailNotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        logger.exception("Error enviando %s a %s", n.numero, to)
        raise HTTPException(502, f"No se pudo enviar el correo: {e}")
    return n


@router.post("/{note_id}/enlace")
def share_link(note_id: int, db: Session = Depends(get_db)):
    """Crea (una vez) el enlace secreto al PDF firmado para mandarlo por WhatsApp."""
    n = _get(db, note_id)
    if n.status != "firmado":
        raise HTTPException(400, "El albarán todavía no está firmado")
    if not n.share_token:
        n.share_token = secrets.token_urlsafe(16)
    n.whatsapp_at = datetime.now(TZ).replace(tzinfo=None)
    db.commit()
    return {"path": f"/api/firmas/compartir/{n.share_token}/{n.numero}.pdf"}


def _aplicar_marcas(n: ClientDeliveryNote, m: Marcas):
    ahora = datetime.now(TZ).replace(tzinfo=None)
    if m.copia is not None:
        n.copia_at = (n.copia_at or ahora) if m.copia else None
    if m.whatsapp is not None:
        n.whatsapp_at = (n.whatsapp_at or ahora) if m.whatsapp else None
    if m.facturado is not None:
        n.facturado_at = (n.facturado_at or ahora) if m.facturado else None
        if not m.facturado:
            n.factura_ref = None
    if m.factura_ref is not None:
        n.factura_ref = m.factura_ref.strip() or None


@router.put("/{note_id}/marcas", response_model=ClientDeliveryNoteResponse)
def marcas(note_id: int, data: Marcas, db: Session = Depends(get_db)):
    n = _get(db, note_id)
    _aplicar_marcas(n, data)
    db.commit()
    db.refresh(n)
    return n


def rellenar_importes():
    """Lee el importe de los albaranes subidos antes de que existiera este dato."""
    from app.database import SessionLocal
    from app.services.firma_service import parse_importe
    import pdfplumber
    db = SessionLocal()
    try:
        for n in db.query(ClientDeliveryNote).filter(ClientDeliveryNote.importe.is_(None)).all():
            try:
                with pdfplumber.open(n.original_path) as pdf:
                    n.importe = parse_importe(pdf.pages[-1].extract_text() or "")
            except Exception:
                continue
        db.commit()
    finally:
        db.close()
