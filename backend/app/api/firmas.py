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
import threading
import uuid
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel
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
MAX_FIRMA_PNG = 2 * 1024 * 1024  # una firma dibujada ocupa unas decenas de KB


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
    notes = (query.order_by(ClientDeliveryNote.fecha.desc(), ClientDeliveryNote.numero.desc())
             .limit(limit).all())
    return con_carga(db, notes)


def con_carga(db: Session, notes):
    """Apunta en cada albarán en qué orden de carga va (si va en alguna) y si tiene una hoja de entrega
    firmada cuya firma no se le pasó sola (el albarán cambió después de cargar)."""
    from app.models.carga import EntregaCarga
    ids = [n.id for n in notes]
    mapa, firmas = {}, {}
    for i in range(0, len(ids), 500):
        for aid, oid, est, cambiado, num, quien, cuando in (
                db.query(EntregaCarga.albaran_id, EntregaCarga.orden_id, EntregaCarga.estado,
                         EntregaCarga.albaran_cambiado, EntregaCarga.numero, EntregaCarga.firmado_por,
                         EntregaCarga.firmado_at)
                .filter(EntregaCarga.albaran_id.in_(ids[i:i + 500])).all()):
            mapa[aid] = (oid, est)
            if est == "entregada" and cambiado and cuando:
                hora = cuando.replace(tzinfo=ZoneInfo("UTC")).astimezone(TZ)
                firmas[aid] = f"La hoja de entrega {num or ''} la firmó {quien or 'el cliente'} el {hora:%d/%m} a las {hora:%H:%M}"
    for n in notes:
        n.carga_id, n.carga_estado = mapa.get(n.id, (None, None))
        n.firma_entrega = firmas.get(n.id) if n.status == "pendiente" else None
    return notes


def firmantes(db: Session, n: ClientDeliveryNote, limite: int = 4) -> List[str]:
    """Las últimas personas que firmaron por este cliente (para elegirlas con un toque al firmar)."""
    if not n.codigo_cliente:
        return []
    filas = (db.query(ClientDeliveryNote.signed_by)
             .filter(ClientDeliveryNote.codigo_cliente == n.codigo_cliente, ClientDeliveryNote.signed_by.isnot(None))
             .order_by(ClientDeliveryNote.signed_at.desc()).limit(40).all())
    out, vistos = [], set()
    empresa = re.sub(r"\W+", "", (n.cliente or "").lower())
    for (nombre,) in filas:
        k = re.sub(r"\W+", "", (nombre or "").lower())
        if not k or k in vistos or k == empresa:  # el nombre de la empresa no es una persona
            continue
        vistos.add(k)
        out.append(nombre.strip())
        if len(out) >= limite:
            break
    return out


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    q = db.query(ClientDeliveryNote)
    pend = q.filter(ClientDeliveryNote.status.in_(("pendiente", "firmando"))).count()  # «firmando» aún no está firmado
    firm = q.filter(ClientDeliveryNote.status == "firmado").count()
    total = q.count()
    sin_facturar = q.filter(ClientDeliveryNote.status == "firmado", ClientDeliveryNote.facturado_at.is_(None)).count()
    return {"pendiente": pend, "firmado": firm, "sin_facturar": sin_facturar, "total": total}


def _mismo_pdf(path: Optional[str], data: bytes) -> bool:
    try:
        p = Path(path or "")
        return p.exists() and p.stat().st_size == len(data) and p.read_bytes() == data
    except Exception:
        return False


def _leer_limitado(f: UploadFile, maximo: int) -> Optional[bytes]:
    """Lee el archivo sin pasar de `maximo` bytes; None si es más grande."""
    if f.size is not None and f.size > maximo:
        return None
    data = f.file.read(maximo + 1)
    return None if len(data) > maximo else data


class SubidaFirmas(BaseModel):
    albaranes: List[ClientDeliveryNoteResponse]
    rechazados: List[dict]


@router.post("/upload", response_model=SubidaFirmas)
def upload(files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    """Sube varios PDF. Los buenos se guardan aunque haya alguno malo; los malos vuelven en
    `rechazados: [{nombre, motivo}]`. Si no vale ninguno → 400."""
    # Síncrono a propósito: FastAPI lo ejecuta aparte y no bloquea al resto de la app
    out = []
    rechazados = []
    for f in files:
        nombre_arch = f.filename or "archivo"
        data = _leer_limitado(f, settings.max_upload_size_bytes)
        if data is None:
            rechazados.append({"nombre": nombre_arch, "motivo": f"Supera {settings.max_upload_size_mb} MB"})
            continue
        if data[:5] != b"%PDF-":
            rechazados.append({"nombre": nombre_arch, "motivo": "No es un PDF"})
            continue
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
        if pendiente:
            # Si ya va en una orden de carga, que se vea que el albarán ha cambiado
            from app.models.carga import EntregaCarga
            for e in db.query(EntregaCarga).filter(EntregaCarga.albaran_id == note.id,
                                                   EntregaCarga.estado != "entregada").all():
                e.dudas = "Se ha subido una versión nueva del albarán. Pulsa «Volver a leer el albarán» para poner sus materiales."
                # Hasta que se vuelva a leer, la firma de la hoja no pasa sola a este albarán (podría
                # llevar cosas que no iban en el camión)
                e.albaran_cambiado = True
        db.commit()
        db.refresh(note)
        out.append(note)
    if not out and rechazados:
        raise HTTPException(400, "; ".join(f"{r['nombre']}: {r['motivo']}" for r in rechazados))
    return {"albaranes": out, "rechazados": rechazados}


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
    from urllib.parse import quote
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(nombre + '.zip')}"})


def liberar_firmas_a_medias():
    """Al arrancar: si el servidor se cayó a mitad de firmar, el albarán vuelve a «pendiente»."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        db.query(ClientDeliveryNote).filter(ClientDeliveryNote.status == "firmando") \
            .update({ClientDeliveryNote.status: "pendiente"}, synchronize_session=False)
        db.commit()
    finally:
        db.close()


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
    ahora_utc = datetime.utcnow()  # created_at se guarda en UTC
    sin_firmar = []
    for n in db.query(ClientDeliveryNote).filter(ClientDeliveryNote.status == "pendiente").all():
        dias = (ahora_utc - n.created_at).days if n.created_at else 0
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
    n = con_carga(db, [_get(db, note_id)])[0]
    n.firmantes = firmantes(db, n) if n.status == "pendiente" else []
    return n


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
    if n.status != "pendiente":
        raise HTTPException(409, f"El albarán {n.numero} ya está firmado")
    nombre = nombre.strip()
    dni = (dni or "").strip()
    if not nombre:
        raise HTTPException(400, "Falta el nombre de quien recibe")
    if len(nombre) > 80:
        raise HTTPException(422, "El nombre es demasiado largo (máximo 80 caracteres)")
    if len(dni) > 20:
        raise HTTPException(422, "El DNI es demasiado largo (máximo 20 caracteres)")
    png = _leer_limitado(firma, MAX_FIRMA_PNG)
    if png is None:
        raise HTTPException(413, "La imagen de la firma es demasiado grande")
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise HTTPException(400, "La firma no es válida")

    # Se «reserva» el albarán: si llegan dos firmas a la vez, solo vale la primera
    tomado = (db.query(ClientDeliveryNote)
              .filter(ClientDeliveryNote.id == note_id, ClientDeliveryNote.status == "pendiente")
              .update({ClientDeliveryNote.status: "firmando"}, synchronize_session=False))
    db.commit()
    if tomado != 1:
        raise HTTPException(409, f"El albarán {n.numero} ya está firmado")
    try:
        return _firmar(db, request, n, png, nombre, dni, firmado_el)
    except Exception:
        db.rollback()
        db.query(ClientDeliveryNote).filter(ClientDeliveryNote.id == note_id,
                                            ClientDeliveryNote.status == "firmando") \
            .update({ClientDeliveryNote.status: "pendiente"}, synchronize_session=False)
        db.commit()
        raise


def _firmar(db: Session, request: Request, n: ClientDeliveryNote, png: bytes, nombre: str, dni: str,
            firmado_el: Optional[str]) -> ClientDeliveryNote:
    db.refresh(n)
    ahora = datetime.now(TZ)
    # La hora real de una firma hecha sin cobertura solo se acepta desde el móvil de reparto
    if firmado_el and getattr(request.state, "rol", None) in ("reparto", None):
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
    if getattr(request.state, "rol", None) == "reparto":
        # Firmado por Melchor fuera de la orden de carga: su entrega queda cerrada y la orden no se le queda colgada
        try:
            from app.api.cargas import cerrar_por_albaran
            cerrar_por_albaran(db, n.id, png, nombre, dni, ahora.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
                               getattr(request.state, "persona", None))
        except Exception as e:  # nunca debe impedir que el albarán quede firmado
            logger.warning("No se pudo cerrar la entrega del albarán %s: %s", n.numero, e)
            db.rollback()

    c = _contacto(db, n)
    if c and c.auto_email and c.email:
        # En segundo plano: la firma queda guardada al momento aunque Gmail tarde
        threading.Thread(target=_correo_automatico, args=(n.id, c.email), daemon=True).start()
    backup_en_segundo_plano()
    if getattr(request.state, "rol", None) == "reparto":
        push_service.avisar(push_service.a_tienda, f"Firmado en el reparto: {n.numero}",
                            f"{n.cliente or 'Cliente'} · firmó {nombre}", f"/firmas/{n.id}", f"firma-{n.id}")
    return n


def firmar_desde_entrega(db: Session, note_id: int, png: bytes, nombre: str, dni: str,
                         cuando_utc: datetime) -> bool:
    """La firma de la hoja de entrega (orden de carga) pasa también al albarán de TreyFACT.
    Si el albarán ya estaba firmado (p. ej. en la tienda), no se toca. Devuelve si se firmó."""
    tomado = (db.query(ClientDeliveryNote)
              .filter(ClientDeliveryNote.id == note_id, ClientDeliveryNote.status == "pendiente")
              .update({ClientDeliveryNote.status: "firmando"}, synchronize_session=False))
    db.commit()
    if tomado != 1:
        return False
    n = _get(db, note_id)
    try:
        ahora = cuando_utc.replace(tzinfo=ZoneInfo("UTC")).astimezone(TZ)
        signed = stamp_signature(Path(n.original_path).read_bytes(), png, n.numero, n.cliente or "",
                                 nombre[:80], (dni or "").strip()[:20], ahora.strftime("%d/%m/%Y a las %H:%M"))
        path = _dir() / f"{uuid.uuid4().hex}_firmado.pdf"
        path.write_bytes(signed)
        n.signed_path = str(path)
        n.status = "firmado"
        n.signed_at = ahora.replace(tzinfo=None)
        n.signed_by = nombre[:200]
        n.signer_dni = (dni or "").strip() or None
        n.page_count = len(PdfReader(io.BytesIO(signed)).pages)
        db.commit()
    except Exception:
        logger.exception("No se pudo pasar la firma de la entrega al albarán %s", n.numero)
        db.rollback()
        db.query(ClientDeliveryNote).filter(ClientDeliveryNote.id == note_id,
                                            ClientDeliveryNote.status == "firmando") \
            .update({ClientDeliveryNote.status: "pendiente"}, synchronize_session=False)
        db.commit()
        return False
    c = _contacto(db, n)
    if c and c.auto_email and c.email:
        threading.Thread(target=_correo_automatico, args=(n.id, c.email), daemon=True).start()
    backup_en_segundo_plano()
    return True


@router.post("/{note_id}/firma-de-entrega", response_model=ClientDeliveryNoteResponse)
def firma_de_entrega(note_id: int, db: Session = Depends(get_db)):
    """El albarán cambió después de cargarlo y la firma de la hoja de entrega no se le pasó sola.
    En la tienda, comprobado que lo entregado coincide, se le pasa con un toque."""
    from app.models.carga import EntregaCarga
    n = _get(db, note_id)
    if n.status != "pendiente":
        raise HTTPException(409, f"El albarán {n.numero} ya está firmado")
    e = (db.query(EntregaCarga).filter(EntregaCarga.albaran_id == note_id, EntregaCarga.estado == "entregada")
         .order_by(EntregaCarga.firmado_at.desc()).first())
    png = Path(settings.upload_dir) / "cargas" / (e.firma_archivo or "") if e else None
    if not e or not e.firma_archivo or not png.exists():
        raise HTTPException(404, "No hay ninguna hoja de entrega firmada de este albarán")
    if not firmar_desde_entrega(db, n.id, png.read_bytes(), e.firmado_por or "", e.firmado_dni or "",
                                e.firmado_at or datetime.utcnow()):
        raise HTTPException(409, "No se pudo pasar la firma. Vuelve a probar en un momento.")
    e.albaran_cambiado = False
    n = _get(db, note_id)
    if n.nota and "versión anterior" in n.nota:
        n.nota = None
    db.commit()
    return con_carga(db, [_get(db, note_id)])[0]


@router.post("/{note_id}/anular-firma", response_model=ClientDeliveryNoteResponse)
def anular_firma(note_id: int, db: Session = Depends(get_db)):
    """Firma hecha por error (otro albarán, otra persona…): el albarán vuelve a «Por firmar»."""
    n = _get(db, note_id)
    if n.status != "firmado":
        raise HTTPException(409, f"El albarán {n.numero} no está firmado")
    if n.facturado_at:
        raise HTTPException(409, f"El albarán {n.numero} ya está facturado. Quítale antes la marca de facturado.")
    con_carga(db, [n])
    if n.carga_estado == "entregada":
        raise HTTPException(409, "Esta firma viene de la hoja de entrega. Repítela desde su orden de carga («Repetir la firma»).")
    if n.signed_path:
        Path(n.signed_path).unlink(missing_ok=True)
    quien = n.signed_by
    n.signed_path = None
    n.status = "pendiente"
    n.signed_at = n.signed_by = n.signer_dni = None
    n.backup_at = None
    n.nota = f"Firma anulada el {datetime.now(TZ):%d/%m a las %H:%M}" + (f" (la había firmado {quien})" if quien else "")
    db.commit()
    logger.info("Firma del albarán %s anulada", n.numero)
    return con_carga(db, [_get(db, note_id)])[0]


@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    n = _get(db, note_id)
    con_carga(db, [n])
    if n.carga_id and n.carga_estado != "entregada":
        raise HTTPException(409, "Este albarán va en una orden de carga. Quítalo de la orden antes de borrarlo.")
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


def _correo_automatico(note_id: int, to: str) -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        n = db.get(ClientDeliveryNote, note_id)
        if not n:
            return
        try:
            _enviar_email(db, n, to)
        except Exception as e:  # la firma ya está guardada; solo se avisa
            db.rollback()
            n = db.get(ClientDeliveryNote, note_id)
            n.nota = f"No se pudo enviar el correo automático: {e}"
            db.commit()
    finally:
        db.close()


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
def marcas(note_id: int, data: Marcas, request: Request, db: Session = Depends(get_db)):
    n = _get(db, note_id)
    if getattr(request.state, "rol", None) == "reparto" and (data.facturado is not None or data.factura_ref is not None):
        raise HTTPException(403, "El código de reparto no puede marcar facturas")
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
