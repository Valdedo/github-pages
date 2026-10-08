"""Órdenes de carga (en pruebas: solo el encargado).
Foto de la libreta → entregas con materiales → cargar marcando → firma del cliente → hoja de entrega PDF."""
import json
import logging
import uuid
from urllib.parse import quote
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
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
    foto_entrega: Optional[str] = None
    drive_at: Optional[datetime] = None
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
    # Otras órdenes sin entregar del mismo cliente (posible pedido repetido)
    parecidas: List[dict] = []


def _norm(t: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFD", (t or "").lower())
    return " ".join("".join(ch for ch in t if unicodedata.category(ch) != "Mn" and (ch.isalnum() or ch == " ")).split())


def _parecidas(db: Session, o: OrdenCarga) -> List[dict]:
    """Entregas sin firmar de los mismos clientes en otras órdenes."""
    nombres = {_norm(e.cliente) for e in o.entregas if e.estado != "entregada" and _norm(e.cliente)}
    if not nombres:
        return []
    otras = (db.query(EntregaCarga).filter(EntregaCarga.orden_id != o.id, EntregaCarga.estado != "entregada")
             .order_by(EntregaCarga.id.desc()).limit(300).all())
    return [{"orden_id": x.orden_id, "entrega_id": x.id, "cliente": x.cliente,
             "creada": x.created_at.isoformat(), "materiales": len(x.lineas)}
            for x in otras if _norm(x.cliente) in nombres][:5]


def _out(o: OrdenCarga, db: Optional[Session] = None) -> OrdenOut:
    return OrdenOut(
        id=o.id, estado=o.estado, fotos=json.loads(o.fotos or "[]"), texto=o.texto, notas=o.notas,
        creado_por=o.creado_por, created_at=o.created_at,
        entregas=[EntregaOut.model_validate(e) for e in o.entregas],
        parecidas=_parecidas(db, o) if db is not None else [],
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
            servir=bool(ent.get("servir", True)), pagado=bool(ent.get("pagado", False)),
            notas="; ".join(x for x in [ent.get("cuando"), ent.get("notas")] if x) or None,
            dudas=ent.get("dudas") or None,
        )
        e.cliente_leido = None  # solo se rellena si alguien corrige el nombre
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
                duda=ln.get("duda") or None, leido=(ln.get("descripcion") or "").strip() or None,
            ))
        db.flush()


async def _guardar_fotos(fotos: List[UploadFile]) -> tuple:
    import hashlib
    nombres, huellas = [], []
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
        huellas.append(hashlib.sha256(datos).hexdigest()[:32])
    return nombres, huellas


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
    forzar: bool = Form(default=False),
    db: Session = Depends(get_db),
):
    """Lee fotos de la libreta (o lo dictado) y crea la orden. Con orden_id, añade a esa orden."""
    if not fotos and not texto.strip():
        raise HTTPException(400, "Saca una foto de la hoja o escribe el pedido")
    nombres, huellas = await _guardar_fotos(fotos)
    if huellas and not forzar:
        # ¿Esta foto ya se subió? Se avisa antes de gastar una lectura y crear otra orden igual
        for previa in db.query(OrdenCarga).filter(OrdenCarga.huellas.isnot(None)).all():
            if set(huellas) & set((previa.huellas or "").split(",")):
                for n in nombres:
                    (_dir() / n).unlink(missing_ok=True)
                clientes = ", ".join(e.cliente for e in previa.entregas if e.cliente) or "sin nombre"
                raise HTTPException(409, {"repetida": previa.id, "mensaje":
                    f"Esta foto ya se subió el {previa.created_at:%d/%m} ({clientes})."})
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
    if huellas:
        o.huellas = ",".join([h for h in (o.huellas or "").split(",") if h] + huellas)
    if texto.strip():
        o.texto = ((o.texto + "\n") if o.texto else "") + texto.strip()
    _anadir_entregas(db, o, datos)
    db.flush()
    db.refresh(o)
    _estado(o)
    db.commit()
    db.refresh(o)
    return _out(o, db)


@router.get("/foto/{nombre}")
def foto(nombre: str):
    p = _dir() / Path(nombre).name
    if not p.exists():
        raise HTTPException(404, "Foto no encontrada")
    return FileResponse(p)


@router.get("/{oid}", response_model=OrdenOut)
def ver(oid: int, db: Session = Depends(get_db)):
    return _out(_orden(db, oid), db)


class Orden(BaseModel):
    ids: List[int]


@router.put("/{oid}/orden-entregas", response_model=OrdenOut)
def ordenar(oid: int, data: Orden, db: Session = Depends(get_db)):
    """Cambia el orden de reparto de las entregas del viaje."""
    o = _orden(db, oid)
    pos = {eid: i for i, eid in enumerate(data.ids)}
    for e in o.entregas:
        e.orden_n = pos.get(e.id, len(pos) + e.orden_n)
    db.commit()
    db.expire(o)
    return _out(_orden(db, oid), db)


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
        for f in (e.firma_archivo, e.foto_entrega):
            if f:
                (_dir() / f).unlink(missing_ok=True)
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
            if v != e.cliente and e.cliente_leido is None:
                e.cliente_leido = e.cliente or ""  # para aprender cómo se lee
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
    firmado_el: Optional[str] = Form(default=None),
    foto: Optional[UploadFile] = File(default=None),
    cargadas: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
):
    e = _entrega(db, eid)
    if e.estado == "entregada":
        raise HTTPException(409, "Esta entrega ya está firmada")
    if not nombre.strip():
        raise HTTPException(400, "Falta el nombre de quien firma")
    if cargadas:
        # Firmada sin cobertura: lo que se marcó como cargado en el móvil
        try:
            marcas = json.loads(cargadas)
            for ln in e.lineas:
                if str(ln.id) in marcas:
                    m = marcas[str(ln.id)]
                    ln.cargado_ok = bool(m.get("ok"))
                    ln.cargado = m.get("cargado")
        except Exception:
            pass
    if not any(ln.cargado_ok or ln.cargado for ln in e.lineas):
        raise HTTPException(400, "No hay nada marcado como cargado. Marca lo que se entrega antes de firmar.")
    png = await firma.read()
    if not png or len(png) > 3 * 1024 * 1024:
        raise HTTPException(400, "La firma no es válida")
    archivo = f"firma_{e.id}_{uuid.uuid4().hex[:8]}.png"
    (_dir() / archivo).write_bytes(png)
    e.firma_archivo = archivo
    e.firmado_por = nombre.strip()[:200]
    e.firmado_dni = dni.strip()[:30] or None
    e.firmado_at = datetime.utcnow()
    if firmado_el:
        try:  # hora real de la firma (hecha sin cobertura), en UTC sin zona
            from datetime import timezone
            f = datetime.fromisoformat(firmado_el.replace("Z", "+00:00"))
            if f.tzinfo:
                f = f.astimezone(timezone.utc).replace(tzinfo=None)
            if f <= e.firmado_at:
                e.firmado_at = f
        except ValueError:
            pass
    if foto is not None and foto.filename:
        datos = await foto.read()
        if datos and len(datos) <= 25 * 1024 * 1024:
            e.foto_entrega = f"entrega_{e.id}_{uuid.uuid4().hex[:8]}{Path(foto.filename).suffix.lower() or '.jpg'}"
            (_dir() / e.foto_entrega).write_bytes(datos)
    e.entregado_por = getattr(request.state, "persona", None)
    e.estado = "entregada"
    e.drive_at = None
    for ln in e.lineas:
        ln.confirmada = True  # entregado y firmado: ya se puede aprender de ello
    if not e.numero:
        e.numero = _numero(db)
    db.flush(); db.refresh(e.orden); _estado(e.orden)
    db.commit()
    db.refresh(e)
    from app.services.backup_service import backup_en_segundo_plano
    backup_en_segundo_plano()
    return e


@router.post("/entregas/{eid}/foto", response_model=EntregaOut)
async def subir_foto_entrega(eid: int, foto: UploadFile = File(...), db: Session = Depends(get_db)):
    """Añadir o cambiar la foto del material descargado (también después de firmar)."""
    e = _entrega(db, eid)
    datos = await foto.read()
    if not datos or len(datos) > 25 * 1024 * 1024:
        raise HTTPException(400, "La foto no es válida")
    if e.foto_entrega:
        (_dir() / e.foto_entrega).unlink(missing_ok=True)
    e.foto_entrega = f"entrega_{e.id}_{uuid.uuid4().hex[:8]}{Path(foto.filename or '').suffix.lower() or '.jpg'}"
    (_dir() / e.foto_entrega).write_bytes(datos)
    e.drive_at = None  # se vuelve a subir la hoja con la foto
    db.commit()
    db.refresh(e)
    if e.estado == "entregada":
        from app.services.backup_service import backup_en_segundo_plano
        backup_en_segundo_plano()
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
    e.drive_at = None
    db.flush(); db.refresh(e.orden); _estado(e.orden)
    db.commit()
    db.refresh(e)
    return e


def _hoja(db: Session, eid: int):
    e = _entrega(db, eid)
    png = None
    if e.firma_archivo and (_dir() / e.firma_archivo).exists():
        png = (_dir() / e.firma_archivo).read_bytes()
    foto = None
    if e.foto_entrega and (_dir() / e.foto_entrega).exists():
        foto = (_dir() / e.foto_entrega).read_bytes()
    nombre = f"Hoja de entrega {e.numero or e.id} - {e.cliente or 'cliente'}.pdf".replace("/", "-")
    return carga_service.hoja_pdf(e, png, foto), nombre


@router.get("/entregas/{eid}/pdf")
def pdf(eid: int, download: bool = False, db: Session = Depends(get_db)):
    datos, nombre = _hoja(db, eid)
    modo = "attachment" if download else "inline"
    return Response(datos, media_type="application/pdf",
                    headers={"Content-Disposition": f"{modo}; filename*=UTF-8''{quote(nombre)}"})


@router.get("/entregas/{eid}/hoja")
def hoja_info(eid: int, db: Session = Depends(get_db)):
    """Cuántas páginas tiene la hoja y cómo se llama (para verla dentro de la app)."""
    from pdf2image import pdfinfo_from_bytes
    datos, nombre = _hoja(db, eid)
    try:
        paginas = int(pdfinfo_from_bytes(datos).get("Pages", 1))
    except Exception:
        paginas = 1
    return {"paginas": paginas, "nombre": nombre}


@router.get("/entregas/{eid}/pagina/{n}.png")
def hoja_pagina(eid: int, n: int, dpi: int = Query(default=110, ge=50, le=220), db: Session = Depends(get_db)):
    """Una página de la hoja como imagen: se ve igual en cualquier móvil y sirve para imprimir."""
    import io
    from pdf2image import convert_from_bytes
    datos, _ = _hoja(db, eid)
    imgs = convert_from_bytes(datos, dpi=dpi, first_page=n, last_page=n)
    if not imgs:
        raise HTTPException(404, "Página no encontrada")
    buf = io.BytesIO()
    imgs[0].save(buf, "PNG", optimize=True)
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})


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
        ln.confirmada = True           # revisada por una persona: se aprende de ella
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
