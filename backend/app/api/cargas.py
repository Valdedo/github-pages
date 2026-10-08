"""Órdenes de carga (en pruebas: solo el encargado).
Foto de la libreta → entregas con materiales → cargar marcando → firma del cliente → hoja de entrega PDF."""
import json
import logging
import uuid
from urllib.parse import quote
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.turnos import solo_encargado
from app.config import settings
from app.database import get_db
from app.models.carga import EntregaCarga, LineaCarga, OrdenCarga
from app.services import carga_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cargas", tags=["cargas"], dependencies=[Depends(solo_encargado)])

TIPOS_FOTO = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}


def _dir() -> Path:
    d = Path(settings.upload_dir) / "cargas"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Respuestas ───────────────────────────────────────────────────────────
class LineaOut(BaseModel):
    id: int
    cantidad: Optional[float] = None
    unidad: Optional[str] = None
    descripcion: str
    original: Optional[str] = None
    duda: Optional[str] = None
    cargado: Optional[float] = None
    cargado_ok: bool = False

    class Config:
        from_attributes = True


class EntregaOut(BaseModel):
    id: int
    orden_id: int
    numero: Optional[str] = None
    cliente: str
    lugar: Optional[str] = None
    telefono: Optional[str] = None
    cuando: Optional[str] = None
    servir: bool = True
    pagado: bool = False
    notas: Optional[str] = None
    dudas: Optional[str] = None
    estado: str
    firmado_por: Optional[str] = None
    firmado_at: Optional[datetime] = None
    treyfact_at: Optional[datetime] = None
    lineas: List[LineaOut] = []

    class Config:
        from_attributes = True


class OrdenOut(BaseModel):
    id: int
    estado: str
    fotos: List[str] = []
    texto: Optional[str] = None
    notas: Optional[str] = None
    creado_por: Optional[str] = None
    created_at: datetime
    entregas: List[EntregaOut] = []


def _out(o: OrdenCarga) -> OrdenOut:
    return OrdenOut(
        id=o.id, estado=o.estado, fotos=json.loads(o.fotos or "[]"), texto=o.texto, notas=o.notas,
        creado_por=o.creado_por, created_at=o.created_at,
        entregas=[EntregaOut.model_validate(e) for e in o.entregas],
    )


def _orden(db: Session, oid: int) -> OrdenCarga:
    o = db.get(OrdenCarga, oid)
    if not o:
        raise HTTPException(404, "Orden de carga no encontrada")
    return o


def _entrega(db: Session, eid: int) -> EntregaCarga:
    e = db.get(EntregaCarga, eid)
    if not e:
        raise HTTPException(404, "Entrega no encontrada")
    return e


def _numero(db: Session) -> str:
    """HE-26-0001: número correlativo de hoja de entrega por año."""
    pref = f"HE-{datetime.now():%y}-"
    ult = (db.query(EntregaCarga.numero).filter(EntregaCarga.numero.like(pref + "%"))
           .order_by(EntregaCarga.numero.desc()).first())
    n = int(ult[0].split("-")[-1]) + 1 if ult and ult[0] else 1
    return f"{pref}{n:04d}"


def _estado(o: OrdenCarga) -> None:
    """preparando → cargado (todo marcado) → entregado (todas firmadas)."""
    if o.entregas and all(e.estado == "entregada" for e in o.entregas):
        o.estado = "entregado"
    elif o.entregas and all(ln.cargado_ok for e in o.entregas for ln in e.lineas) and any(e.lineas for e in o.entregas):
        o.estado = "cargado"
    else:
        o.estado = "preparando"


def _anadir_entregas(db: Session, o: OrdenCarga, datos: dict) -> None:
    base = len(o.entregas)
    for i, ent in enumerate(datos.get("entregas") or []):
        e = EntregaCarga(
            orden_id=o.id, orden_n=base + i, numero=_numero(db),
            cliente=(ent.get("cliente") or "").strip()[:200],
            lugar=(ent.get("lugar") or None), telefono=(ent.get("telefono") or None),
            cuando=(ent.get("cuando") or None), servir=bool(ent.get("servir", True)),
            pagado=bool(ent.get("pagado", False)), notas=ent.get("notas") or None, dudas=ent.get("dudas") or None,
        )
        db.add(e)
        db.flush()
        for j, ln in enumerate(ent.get("lineas") or []):
            try:
                cant = float(ln["cantidad"]) if ln.get("cantidad") not in (None, "") else None
            except (TypeError, ValueError):
                cant = None
            db.add(LineaCarga(
                entrega_id=e.id, orden_n=j, cantidad=cant, unidad=(ln.get("unidad") or None),
                descripcion=(ln.get("descripcion") or "").strip(), original=ln.get("original") or None,
                duda=ln.get("duda") or None,
            ))
        db.flush()


async def _guardar_fotos(fotos: List[UploadFile]) -> List[str]:
    nombres = []
    for f in fotos or []:
        ext = Path(f.filename or "").suffix.lower() or ".jpg"
        if ext not in TIPOS_FOTO:
            raise HTTPException(400, "Solo fotos (JPG o PNG)")
        datos = await f.read()
        if len(datos) > 25 * 1024 * 1024:
            raise HTTPException(400, "La foto es demasiado grande")
        nombre = f"{uuid.uuid4().hex}{ext}"
        (_dir() / nombre).write_bytes(datos)
        nombres.append(nombre)
    return nombres


# ── Órdenes ──────────────────────────────────────────────────────────────
@router.get("", response_model=List[OrdenOut])
def listar(db: Session = Depends(get_db)):
    return [_out(o) for o in db.query(OrdenCarga).order_by(OrdenCarga.created_at.desc()).limit(200).all()]


@router.post("/leer", response_model=OrdenOut)
async def leer(
    request: Request,
    fotos: List[UploadFile] = File(default=[]),
    texto: str = Form(default=""),
    orden_id: Optional[int] = Form(default=None),
    db: Session = Depends(get_db),
):
    """Lee fotos de la libreta (o lo dictado) y crea la orden. Con orden_id, añade a esa orden."""
    if not fotos and not texto.strip():
        raise HTTPException(400, "Saca una foto de la hoja o escribe el pedido")
    nombres = await _guardar_fotos(fotos)
    try:
        datos = await carga_service.leer(db, [str(_dir() / n) for n in nombres], texto)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        logger.exception("Error leyendo la orden de carga")
        raise HTTPException(502, f"No se pudo leer: {e}")
    if not datos.get("entregas"):
        raise HTTPException(422, "No se encontró ningún pedido en la hoja. Prueba con otra foto más cerca.")

    o = _orden(db, orden_id) if orden_id else OrdenCarga(creado_por=getattr(request.state, "persona", None))
    if not orden_id:
        db.add(o)
        db.flush()
    o.fotos = json.dumps(json.loads(o.fotos or "[]") + nombres)
    if texto.strip():
        o.texto = ((o.texto + "\n") if o.texto else "") + texto.strip()
    _anadir_entregas(db, o, datos)
    db.flush()
    db.refresh(o)
    _estado(o)
    db.commit()
    db.refresh(o)
    return _out(o)


@router.get("/foto/{nombre}")
def foto(nombre: str):
    p = _dir() / Path(nombre).name
    if not p.exists():
        raise HTTPException(404, "Foto no encontrada")
    return FileResponse(p)


@router.get("/{oid}", response_model=OrdenOut)
def ver(oid: int, db: Session = Depends(get_db)):
    return _out(_orden(db, oid))


class OrdenIn(BaseModel):
    notas: Optional[str] = None


@router.put("/{oid}", response_model=OrdenOut)
def editar(oid: int, data: OrdenIn, db: Session = Depends(get_db)):
    o = _orden(db, oid)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(o, k, v)
    db.commit()
    db.refresh(o)
    return _out(o)


@router.delete("/{oid}")
def borrar(oid: int, db: Session = Depends(get_db)):
    o = _orden(db, oid)
    for n in json.loads(o.fotos or "[]"):
        (_dir() / n).unlink(missing_ok=True)
    for e in o.entregas:
        if e.firma_archivo:
            (_dir() / e.firma_archivo).unlink(missing_ok=True)
    db.delete(o)
    db.commit()
    return {"ok": True}


# ── Entregas ─────────────────────────────────────────────────────────────
class EntregaIn(BaseModel):
    cliente: Optional[str] = None
    lugar: Optional[str] = None
    telefono: Optional[str] = None
    cuando: Optional[str] = None
    servir: Optional[bool] = None
    pagado: Optional[bool] = None
    notas: Optional[str] = None
    dudas: Optional[str] = None


@router.post("/{oid}/entregas", response_model=OrdenOut)
def nueva_entrega(oid: int, data: EntregaIn, db: Session = Depends(get_db)):
    """Entrega vacía para rellenar a mano."""
    o = _orden(db, oid)
    _anadir_entregas(db, o, {"entregas": [{**data.model_dump(exclude_none=True), "lineas": []}]})
    db.flush(); db.refresh(o); _estado(o)
    db.commit(); db.refresh(o)
    return _out(o)


@router.put("/entregas/{eid}", response_model=EntregaOut)
def editar_entrega(eid: int, data: EntregaIn, db: Session = Depends(get_db)):
    e = _entrega(db, eid)
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == "cliente":
            v = (v or "").strip()
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return e


@router.delete("/entregas/{eid}")
def borrar_entrega(eid: int, db: Session = Depends(get_db)):
    e = _entrega(db, eid)
    if e.estado == "entregada":
        raise HTTPException(409, "Esta entrega ya está firmada")
    o = e.orden
    db.delete(e)
    db.flush(); db.refresh(o); _estado(o)
    db.commit()
    return {"ok": True}


@router.post("/entregas/{eid}/firmar", response_model=EntregaOut)
async def firmar(
    eid: int, request: Request,
    firma: UploadFile = File(...), nombre: str = Form(...), dni: str = Form(default=""),
    db: Session = Depends(get_db),
):
    e = _entrega(db, eid)
    if e.estado == "entregada":
        raise HTTPException(409, "Esta entrega ya está firmada")
    if not nombre.strip():
        raise HTTPException(400, "Falta el nombre de quien firma")
    png = await firma.read()
    if not png or len(png) > 3 * 1024 * 1024:
        raise HTTPException(400, "La firma no es válida")
    archivo = f"firma_{e.id}_{uuid.uuid4().hex[:8]}.png"
    (_dir() / archivo).write_bytes(png)
    e.firma_archivo = archivo
    e.firmado_por = nombre.strip()[:200]
    e.firmado_dni = dni.strip()[:30] or None
    e.firmado_at = datetime.utcnow()
    e.entregado_por = getattr(request.state, "persona", None)
    e.estado = "entregada"
    if not e.numero:
        e.numero = _numero(db)
    db.flush(); db.refresh(e.orden); _estado(e.orden)
    db.commit()
    db.refresh(e)
    return e


@router.post("/entregas/{eid}/anular-firma", response_model=EntregaOut)
def anular_firma(eid: int, db: Session = Depends(get_db)):
    """Para repetir una firma mal hecha."""
    e = _entrega(db, eid)
    if e.firma_archivo:
        (_dir() / e.firma_archivo).unlink(missing_ok=True)
    e.firma_archivo = e.firmado_por = e.firmado_dni = None
    e.firmado_at = None
    e.estado = "pendiente"
    db.flush(); db.refresh(e.orden); _estado(e.orden)
    db.commit()
    db.refresh(e)
    return e


@router.get("/entregas/{eid}/pdf")
def pdf(eid: int, db: Session = Depends(get_db)):
    e = _entrega(db, eid)
    png = None
    if e.firma_archivo and (_dir() / e.firma_archivo).exists():
        png = (_dir() / e.firma_archivo).read_bytes()
    datos = carga_service.hoja_pdf(e, png)
    nombre = f"Hoja de entrega {e.numero or e.id} - {e.cliente or 'cliente'}.pdf".replace("/", "-")
    return Response(datos, media_type="application/pdf",
                    headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(nombre)}"})


class Treyfact(BaseModel):
    pasado: bool


@router.put("/entregas/{eid}/treyfact", response_model=EntregaOut)
def treyfact(eid: int, data: Treyfact, db: Session = Depends(get_db)):
    e = _entrega(db, eid)
    e.treyfact_at = datetime.utcnow() if data.pasado else None
    db.commit()
    db.refresh(e)
    return e


# ── Líneas ───────────────────────────────────────────────────────────────
class LineaIn(BaseModel):
    cantidad: Optional[float] = None
    unidad: Optional[str] = None
    descripcion: Optional[str] = None
    duda: Optional[str] = None
    cargado: Optional[float] = None
    cargado_ok: Optional[bool] = None


@router.post("/entregas/{eid}/lineas", response_model=LineaOut)
def nueva_linea(eid: int, data: LineaIn, db: Session = Depends(get_db)):
    e = _entrega(db, eid)
    if e.estado == "entregada":
        raise HTTPException(409, "Esta entrega ya está firmada")
    ln = LineaCarga(entrega_id=e.id, orden_n=len(e.lineas), cantidad=data.cantidad, unidad=data.unidad,
                    descripcion=(data.descripcion or "").strip())
    db.add(ln)
    db.flush(); db.refresh(e.orden); _estado(e.orden)
    db.commit()
    db.refresh(ln)
    return ln


@router.put("/lineas/{lid}", response_model=LineaOut)
def editar_linea(lid: int, data: LineaIn, db: Session = Depends(get_db)):
    ln = db.get(LineaCarga, lid)
    if not ln:
        raise HTTPException(404, "Línea no encontrada")
    if ln.entrega.estado == "entregada":
        raise HTTPException(409, "Esta entrega ya está firmada")
    cambios = data.model_dump(exclude_unset=True)
    for k, v in cambios.items():
        setattr(ln, k, v)
    if "descripcion" in cambios or "cantidad" in cambios or "unidad" in cambios:
        ln.duda = cambios.get("duda")  # al corregirla, deja de estar en duda
    if cambios.get("cargado_ok"):
        ln.cargado = None
    o = ln.entrega.orden
    db.flush(); db.refresh(o); _estado(o)
    db.commit()
    db.refresh(ln)
    return ln


@router.delete("/lineas/{lid}")
def borrar_linea(lid: int, db: Session = Depends(get_db)):
    ln = db.get(LineaCarga, lid)
    if not ln:
        raise HTTPException(404, "Línea no encontrada")
    if ln.entrega.estado == "entregada":
        raise HTTPException(409, "Esta entrega ya está firmada")
    o = ln.entrega.orden
    db.delete(ln)
    db.flush(); db.refresh(o); _estado(o)
    db.commit()
    return {"ok": True}
