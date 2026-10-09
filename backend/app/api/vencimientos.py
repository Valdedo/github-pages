"""Vencimientos de facturas de proveedor — solo para el encargado (Andrés).

El script de facturas (Apps Script de la cuenta de Andrés) lee cada factura que guarda en
«FACTURAS PARA GESTORIA», saca cuándo vence cada plazo y lo manda a /api/vencimientos/importar
con la clave VENCIMIENTOS_CLAVE. La app lo enseña en Inicio: hoy, mañana y pasado; los viernes,
hasta el lunes para que el fin de semana no pille por sorpresa.
"""
import hmac
import logging
import threading
import time
from datetime import date, datetime, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.models.vencimiento import Vencimiento
from app.services import access_service as acc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vencimientos", tags=["vencimientos"])
TZ = ZoneInfo("Europe/Madrid")
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
         "octubre", "noviembre", "diciembre"]


def hoy() -> date:
    return datetime.now(TZ).date()


def solo_encargado(request: Request):
    if acc.config() and getattr(request.state, "rol", None) != "admin":
        raise HTTPException(403, "Esto solo lo ve Andrés")


# ── Lo que manda el script ─────────────────────────────────────
class Plazo(BaseModel):
    fecha: Optional[str] = None
    importe: Optional[float] = None


class Factura(BaseModel):
    file_id: str
    proveedor: str = ""
    numero: Optional[str] = None
    fecha_factura: Optional[str] = None
    importe: Optional[float] = None
    forma_pago: Optional[str] = None
    url: Optional[str] = None
    vencimientos: List[Plazo] = []


class Lote(BaseModel):
    facturas: List[Factura]


def _fecha(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s).strip()[:10])
    except ValueError:
        return None


@router.post("/importar")
def importar(lote: Lote, x_clave: str = Header(default=""), db: Session = Depends(get_db)):
    clave = settings.vencimientos_clave
    if not clave:
        raise HTTPException(503, "Falta VENCIMIENTOS_CLAVE en Railway")
    if not hmac.compare_digest(x_clave.encode(), clave.encode()):
        raise HTTPException(401, "Clave incorrecta")
    n = 0
    for f in lote.facturas:
        if not f.file_id.strip():
            continue
        db.query(Vencimiento).filter(Vencimiento.file_id == f.file_id).delete()
        plazos = [p for p in f.vencimientos if _fecha(p.fecha)] or [Plazo()]
        plazos.sort(key=lambda p: p.fecha or "")
        for i, p in enumerate(plazos, 1):
            importe = p.importe
            if importe is None and len(plazos) == 1:
                importe = f.importe
            db.add(Vencimiento(
                file_id=f.file_id.strip(), proveedor=(f.proveedor or "").strip()[:200], numero=(f.numero or None),
                fecha_factura=_fecha(f.fecha_factura), importe_factura=f.importe, fecha=_fecha(p.fecha),
                importe=importe, plazo=i, plazos=len(plazos), forma_pago=(f.forma_pago or None),
                url=(f.url or None), recibido_at=datetime.utcnow(),
            ))
        n += 1
    db.commit()
    return {"ok": True, "facturas": n}


# ── Lo que ve Andrés ───────────────────────────────────────────
def dias_a_mirar(h: date) -> List[date]:
    """Hoy, mañana y pasado; el viernes también el lunes (el fin de semana entero)."""
    n = 4 if h.weekday() == 4 else 3
    return [h + timedelta(days=i) for i in range(n)]


def _etiqueta(d: date, h: date) -> str:
    dif = (d - h).days
    if dif == 0:
        return "Hoy"
    if dif == 1:
        return "Mañana"
    if dif == 2 and h.weekday() != 4:
        return "Pasado mañana"
    return DIAS[d.weekday()].capitalize()


def _fila(v: Vencimiento) -> dict:
    return {"id": v.id, "proveedor": v.proveedor, "numero": v.numero, "importe": v.importe,
            "importe_factura": v.importe_factura, "plazo": v.plazo, "plazos": v.plazos,
            "forma_pago": v.forma_pago, "url": v.url,
            "fecha": v.fecha.isoformat() if v.fecha else None,
            "fecha_factura": v.fecha_factura.isoformat() if v.fecha_factura else None}


def resumen(db: Session, h: Optional[date] = None) -> dict:
    h = h or hoy()
    dias = dias_a_mirar(h)
    hasta = h + timedelta(days=30)
    filas = (db.query(Vencimiento).filter(Vencimiento.fecha >= h, Vencimiento.fecha <= hasta)
             .order_by(Vencimiento.fecha, Vencimiento.proveedor).all())
    # La misma factura guardada dos veces (con otro nombre de archivo) sale una sola vez
    vistos, unicas = set(), []
    for f in filas:
        k = ("".join(ch for ch in (f.numero or "") if ch.isalnum()).upper(), f.fecha, round(f.importe or 0, 2))
        if k[0] and k in vistos:
            continue
        vistos.add(k)
        unicas.append(f)
    filas = unicas
    grupos = []
    for d in dias:
        del_dia = [f for f in filas if f.fecha == d]
        grupos.append({"fecha": d.isoformat(), "etiqueta": _etiqueta(d, h),
                       "dia": f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month - 1]}",
                       "finde": d.weekday() >= 5,
                       "total": round(sum(f.importe or 0 for f in del_dia), 2),
                       "facturas": [_fila(f) for f in del_dia]})
    despues = [f for f in filas if f.fecha > dias[-1]]
    reciente = h - timedelta(days=45)
    sin_fecha = (db.query(Vencimiento).filter(Vencimiento.fecha.is_(None),
                                              (Vencimiento.fecha_factura >= reciente) | Vencimiento.fecha_factura.is_(None))
                 .order_by(Vencimiento.fecha_factura.desc()).limit(20).all())
    ultima = db.query(func.max(Vencimiento.recibido_at)).scalar()
    return {
        "configurado": bool(settings.vencimientos_clave),
        "conectado": ultima is not None,
        "ultima": ultima.isoformat() + "Z" if ultima else None,
        "facturas": db.query(func.count(func.distinct(Vencimiento.file_id))).scalar() or 0,
        "dias": grupos,
        "proximos": [_fila(f) for f in despues],
        "proximos_total": round(sum(f.importe or 0 for f in despues), 2),
        "sin_fecha": [_fila(f) for f in sin_fecha],
    }


@router.get("", dependencies=[Depends(solo_encargado)])
def ver(db: Session = Depends(get_db)):
    return resumen(db)


# ── Aviso en el móvil de Andrés por la mañana ──────────────────
def _euros(v: float) -> str:
    return f"{v:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _avisar_hoy(h: date) -> None:
    from app.services import push_service
    db = SessionLocal()
    try:
        r = resumen(db, h)
    finally:
        db.close()
    hoy_g = r["dias"][0]
    finde = [g for g in r["dias"][1:] if h.weekday() == 4]
    n_hoy, n_finde = len(hoy_g["facturas"]), sum(len(g["facturas"]) for g in finde)
    if not n_hoy and not n_finde:
        return
    partes = []
    if n_hoy:
        partes.append(f"Hoy {n_hoy} factura{'s' if n_hoy != 1 else ''} · {_euros(hoy_g['total'])}")
    if n_finde:
        partes.append(f"hasta el lunes {n_finde} más · {_euros(sum(g['total'] for g in finde))}")
    titulo = "Vencimientos de hoy" if not n_finde else "Vencimientos hasta el lunes"
    push_service.avisar(lambda s: s.rol == "admin", titulo, " · ".join(partes), "/", "vencimientos")


def arrancar_aviso() -> None:
    """De lunes a sábado, a las 9 de la mañana, aviso a Andrés si algo vence (los viernes, hasta el lunes)."""
    def bucle():
        avisado = None
        time.sleep(90)
        while True:
            try:
                ahora = datetime.now(TZ)
                h = ahora.date()
                if ahora.weekday() < 6 and ahora.hour == 9 and avisado != h:
                    avisado = h
                    _avisar_hoy(h)
            except Exception as e:
                logger.warning("Error avisando de vencimientos: %s", e)
            time.sleep(300)
    threading.Thread(target=bucle, daemon=True, name="vencimientos").start()
