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
from app.models.vencimiento import Vencimiento, VencAjustes, VencAviso
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


def puede_ver(request: Request):
    """Ver los vencimientos: Andrés y Manolo (consulta). Cambiar los ajustes, solo Andrés."""
    if acc.config() and getattr(request.state, "rol", None) not in ("admin", "consulta"):
        raise HTTPException(403, "Esto solo lo ven Andrés y Manolo")


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


def _sumas(db: Session) -> dict:
    """Suma de los plazos de cada factura (para ver si cuadran con el total)."""
    return {fid: tot for fid, tot in db.query(Vencimiento.file_id, func.sum(Vencimiento.importe)).group_by(Vencimiento.file_id).all()}


def revisar(v: Vencimiento, sumas: dict) -> List[str]:
    """Lecturas raras que conviene mirar en el PDF."""
    r = []
    if v.fecha and v.fecha_factura:
        d = (v.fecha - v.fecha_factura).days
        if d < -1:
            r.append("vence antes de la fecha de la factura")
        elif d > 180:
            r.append("vence a más de 6 meses")
    if v.fecha and v.importe is None:
        r.append("no se ha leído el importe")
    if v.plazos > 1 and v.importe_factura and sumas.get(v.file_id) is not None \
            and abs((sumas[v.file_id] or 0) - v.importe_factura) > 1:
        r.append("los plazos no suman el total de la factura")
    return r


def _unicas(filas: list) -> list:
    """La misma factura guardada dos veces (con otro nombre de archivo) cuenta una sola vez."""
    vistos, out = set(), []
    for f in filas:
        k = ("".join(ch for ch in (f.numero or "") if ch.isalnum()).upper(), f.fecha, round(f.importe or 0, 2))
        if k[0] and k in vistos:
            continue
        vistos.add(k)
        out.append(f)
    return out


def ajustes(db: Session) -> VencAjustes:
    a = db.get(VencAjustes, 1)
    if not a:
        a = VencAjustes(id=1, umbral=2000, dias_antes=5)
        db.add(a)
        db.commit()
    return a


def _semanas(futuras: list, h: date, n: int = 5) -> list:
    """Lo que se carga cada semana (de lunes a domingo), empezando por esta."""
    lunes = h - timedelta(days=h.weekday())
    out = []
    for i in range(n):
        ini, fin = lunes + timedelta(days=7 * i), lunes + timedelta(days=7 * i + 6)
        del_tramo = [f for f in futuras if max(ini, h) <= f.fecha <= fin]
        if i == 0:
            et = "Esta semana"
        elif i == 1:
            et = "La que viene"
        else:
            et = f"{ini.day} {MESES[ini.month - 1][:3]}"
        out.append({"desde": max(ini, h).isoformat(), "hasta": fin.isoformat(), "etiqueta": et,
                    "rango": f"{ini.day} {MESES[ini.month - 1][:3]} – {fin.day} {MESES[fin.month - 1][:3]}",
                    "total": round(sum(f.importe or 0 for f in del_tramo), 2), "facturas": len(del_tramo)})
    return out


def _condiciones(filas: list) -> dict:
    """Forma de pago más habitual y a cuántos días suele vencer (con todo el historial del proveedor)."""
    formas: dict = {}
    dias = []
    for f in filas:
        if f.forma_pago:
            formas[f.forma_pago] = formas.get(f.forma_pago, 0) + 1
        if f.fecha and f.fecha_factura and f.plazo == f.plazos:
            d = (f.fecha - f.fecha_factura).days
            if 0 <= d <= 365:
                dias.append(d)
    forma = max(formas, key=formas.get) if formas else None
    tipico = None
    if dias:
        dias.sort()
        tipico = dias[len(dias) // 2]
    return {"forma_pago": forma, "dias": tipico}


def _proveedores(db: Session, futuras: list) -> list:
    from app.services.drive_proveedor import clave
    grupos: dict = {}
    for f in futuras:
        k = clave(f.proveedor) or f.proveedor.upper()
        g = grupos.setdefault(k, {"nombres": {}, "filas": []})
        g["nombres"][f.proveedor] = g["nombres"].get(f.proveedor, 0) + 1
        g["filas"].append(f)
    if not grupos:
        return []
    historial: dict = {}
    for f in db.query(Vencimiento).filter(Vencimiento.fecha.isnot(None)).all():
        historial.setdefault(clave(f.proveedor) or f.proveedor.upper(), []).append(f)
    out = []
    for k, g in grupos.items():
        filas = sorted(g["filas"], key=lambda f: f.fecha)
        out.append({
            "proveedor": max(g["nombres"], key=g["nombres"].get),
            "pendiente": round(sum(f.importe or 0 for f in filas), 2),
            "facturas": len(filas),
            "proxima": filas[0].fecha.isoformat(),
            "proxima_importe": filas[0].importe,
            **_condiciones(historial.get(k, filas)),
        })
    return sorted(out, key=lambda p: -p["pendiente"])


def resumen(db: Session, h: Optional[date] = None) -> dict:
    h = h or hoy()
    aj = ajustes(db)
    dias = dias_a_mirar(h)
    hasta = h + timedelta(days=30)
    futuras = _unicas(db.query(Vencimiento).filter(Vencimiento.fecha >= h)
                      .order_by(Vencimiento.fecha, Vencimiento.proveedor).all())
    filas = [f for f in futuras if f.fecha <= hasta]

    sumas = _sumas(db)

    def fila(v: Vencimiento) -> dict:
        d = _fila(v)
        d["grande"] = bool(v.importe and v.importe >= aj.umbral)
        d["revisar"] = revisar(v, sumas)
        return d

    grupos = []
    for d in dias:
        del_dia = [f for f in filas if f.fecha == d]
        grupos.append({"fecha": d.isoformat(), "etiqueta": _etiqueta(d, h),
                       "dia": f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month - 1]}",
                       "finde": d.weekday() >= 5,
                       "total": round(sum(f.importe or 0 for f in del_dia), 2),
                       "facturas": [fila(f) for f in del_dia]})
    despues = [f for f in filas if f.fecha > dias[-1]]
    limite_grandes = h + timedelta(days=aj.dias_antes)
    grandes = [dict(fila(f), faltan=(f.fecha - h).days) for f in futuras
               if dias[-1] < f.fecha <= limite_grandes and (f.importe or 0) >= aj.umbral]
    reciente = h - timedelta(days=45)
    sin_fecha = (db.query(Vencimiento).filter(Vencimiento.fecha.is_(None),
                                              (Vencimiento.fecha_factura >= reciente) | Vencimiento.fecha_factura.is_(None))
                 .order_by(Vencimiento.fecha_factura.desc()).limit(20).all())
    ultima = db.query(func.max(Vencimiento.recibido_at)).scalar()
    return {
        "configurado": bool(settings.vencimientos_clave),
        "conectado": ultima is not None,
        "ultima": ultima.isoformat() + "Z" if ultima else None,
        # Días sin noticias del script (el script manda al menos una vez al día)
        "atrasado": max(0, (datetime.utcnow() - ultima).days) if ultima and datetime.utcnow() - ultima > timedelta(hours=50) else 0,
        "facturas": db.query(func.count(func.distinct(Vencimiento.file_id))).scalar() or 0,
        "dias": grupos,
        "proximos": [fila(f) for f in despues],
        "proximos_total": round(sum(f.importe or 0 for f in despues), 2),
        "sin_fecha": [_fila(f) for f in sin_fecha],
        "grandes": grandes,
        "semanas": _semanas(futuras, h),
        "proveedores": _proveedores(db, futuras),
        "pendiente_total": round(sum(f.importe or 0 for f in futuras), 2),
        "ajustes": {"umbral": aj.umbral, "dias_antes": aj.dias_antes},
    }


def detalle(db: Session, h: Optional[date] = None) -> dict:
    """Todo para la página de Vencimientos: agenda, semanas, meses, proveedores, recientes."""
    h = h or hoy()
    aj = ajustes(db)
    base = resumen(db, h)

    sumas = _sumas(db)

    def fila(v: Vencimiento) -> dict:
        d = _fila(v)
        d["grande"] = bool(v.importe and v.importe >= aj.umbral)
        d["revisar"] = revisar(v, sumas)
        return d

    desde = h - timedelta(days=14)
    todas = _unicas(db.query(Vencimiento).filter(Vencimiento.fecha >= desde)
                    .order_by(Vencimiento.fecha, Vencimiento.proveedor).all())
    agenda = []
    for f in todas:
        if not agenda or agenda[-1]["fecha"] != f.fecha.isoformat():
            dif = (f.fecha - h).days
            agenda.append({"fecha": f.fecha.isoformat(),
                           "etiqueta": "Hoy" if dif == 0 else "Mañana" if dif == 1 else "Ayer" if dif == -1 else DIAS[f.fecha.weekday()].capitalize(),
                           "dia": f"{f.fecha.day} de {MESES[f.fecha.month - 1]}",
                           "pasado": dif < 0, "faltan": dif, "finde": f.fecha.weekday() >= 5,
                           "total": 0.0, "facturas": []})
        agenda[-1]["facturas"].append(fila(f))
        agenda[-1]["total"] = round(agenda[-1]["total"] + (f.importe or 0), 2)

    futuras = [f for f in todas if f.fecha >= h]
    meses = []
    for i in range(3):
        y, m = h.year + (h.month - 1 + i) // 12, (h.month - 1 + i) % 12 + 1
        del_mes = [f for f in futuras if f.fecha.year == y and f.fecha.month == m]
        meses.append({"mes": f"{MESES[m - 1].capitalize()}{'' if y == h.year else f' {y}'}",
                      "total": round(sum(f.importe or 0 for f in del_mes), 2), "facturas": len(del_mes)})

    provs = _proveedores(db, futuras)
    from app.services.drive_proveedor import clave
    por_clave: dict = {}
    for f in futuras:
        por_clave.setdefault(clave(f.proveedor) or f.proveedor.upper(), []).append(fila(f))
    for p in provs:
        p["lista"] = por_clave.get(clave(p["proveedor"]) or p["proveedor"].upper(), [])

    recientes = (db.query(Vencimiento).filter(Vencimiento.plazo == 1)
                 .order_by(Vencimiento.fecha_factura.desc().nullslast(), Vencimiento.recibido_at.desc()).limit(40).all())
    vistos, rec = set(), []
    for v in recientes:
        k = (v.proveedor, v.numero, v.importe_factura)
        if k in vistos:
            continue
        vistos.add(k)
        r = fila(v)
        r["vencimientos"] = [{"fecha": x.fecha.isoformat() if x.fecha else None, "importe": x.importe}
                             for x in db.query(Vencimiento).filter(Vencimiento.file_id == v.file_id).order_by(Vencimiento.plazo).all()]
        rec.append(r)
        if len(rec) >= 15:
            break

    # Lecturas raras de los últimos 4 meses (y lo que queda por vencer)
    raras, vistas = [], set()
    for v in (db.query(Vencimiento).filter((Vencimiento.fecha >= h - timedelta(days=120)) | (Vencimiento.fecha_factura >= h - timedelta(days=120)))
              .order_by(Vencimiento.fecha_factura.desc().nullslast()).all()):
        motivos = revisar(v, sumas)
        if motivos and v.file_id not in vistas:
            vistas.add(v.file_id)
            raras.append(dict(fila(v), revisar=motivos))

    semana = [f for f in futuras if f.fecha <= h + timedelta(days=6 - h.weekday())]
    mes30 = [f for f in futuras if f.fecha <= h + timedelta(days=30)]
    return {
        **base,
        "agenda": agenda,
        "semanas": _semanas(futuras, h, 8),
        "meses": meses,
        "proveedores": provs,
        "recientes": rec,
        "para_revisar": raras[:30],
        "totales": {
            "semana": round(sum(f.importe or 0 for f in semana), 2), "semana_n": len(semana),
            "mes": round(sum(f.importe or 0 for f in mes30), 2), "mes_n": len(mes30),
            "pendiente": round(sum(f.importe or 0 for f in futuras), 2), "pendiente_n": len(futuras),
        },
    }


@router.get("/detalle", dependencies=[Depends(puede_ver)])
def ver_detalle(db: Session = Depends(get_db)):
    return detalle(db)


class Ajustes(BaseModel):
    umbral: float
    dias_antes: int


@router.put("/ajustes", dependencies=[Depends(solo_encargado)])
def put_ajustes(data: Ajustes, db: Session = Depends(get_db)):
    if data.umbral < 0 or not 1 <= data.dias_antes <= 30:
        raise HTTPException(400, "Pon un importe y entre 1 y 30 días")
    a = ajustes(db)
    a.umbral, a.dias_antes = round(data.umbral, 2), data.dias_antes
    db.commit()
    return resumen(db)


@router.get("", dependencies=[Depends(puede_ver)])
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
    _avisar_grandes(h, r)
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


def _avisar_grandes(h: date, r: dict) -> None:
    """Una sola vez por factura grande: «dentro de 5 días vence…»."""
    from app.services import push_service
    if not r["grandes"]:
        return
    db = SessionLocal()
    try:
        nuevas = []
        for g in r["grandes"]:
            k = f"{g['numero'] or ''}|{g['proveedor']}|{g['fecha']}|{g['importe']}"[:200]
            if not db.get(VencAviso, k):
                db.add(VencAviso(clave=k))
                nuevas.append(g)
        db.commit()
    finally:
        db.close()
    for g in nuevas:
        d = date.fromisoformat(g["fecha"])
        cuando = f"el {DIAS[d.weekday()]} {d.day}" + (f" (en {g['faltan']} días)" if g["faltan"] > 1 else "")
        push_service.avisar(lambda s: s.rol == "admin", "Se acerca una factura grande",
                            f"{g['proveedor']} · {_euros(g['importe'] or 0)} · vence {cuando}", "/",
                            f"grande-{g['id']}")


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
