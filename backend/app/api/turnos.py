"""Turnos del personal. Todos pueden verlos; solo el encargado (código de Andrés) los cambia."""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.turnos import Festivo, TurnoCambio, Vacacion
from app.services import access_service as acc
from app.services import turnos_service as ts
from app.services import push_service

router = APIRouter(prefix="/api/turnos", tags=["turnos"])

def _fecha(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except Exception:
        raise HTTPException(400, "Fecha no válida")


_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
          "octubre", "noviembre", "diciembre"]


def _cuando(f: str) -> str:
    d = date.fromisoformat(f)
    return f"{_DIAS[d.weekday()]} {d.day} de {_MESES[d.month - 1]}"


def solo_encargado(request: Request):
    """Con códigos creados, cambiar turnos exige la sesión del encargado."""
    if acc.config() and getattr(request.state, "rol", None) != "admin":
        raise HTTPException(403, "Solo Andrés puede cambiar esto")


class Cambio(BaseModel):
    empleado: str
    fecha: str
    tipo: Optional[str] = None  # None → vuelve a lo normal
    nota: Optional[str] = None


class NuevaVacacion(BaseModel):
    empleado: str
    inicio: str
    fin: str
    nota: Optional[str] = None


class NuevoFestivo(BaseModel):
    fecha: str
    nombre: str


class Tipo(BaseModel):
    id: str
    nombre: str
    horario: str
    horas: float = 0


class Empleado(BaseModel):
    id: str
    nombre: str
    color: str


class Ajustes(BaseModel):
    empleados: List[Empleado]
    tipos: List[Tipo]
    semanas: List[List[str]]
    ancla: str
    inicio: dict


@router.get("/ajustes")
def get_ajustes(db: Session = Depends(get_db)):
    cfg = ts.ajustes(db)
    fest = {f.fecha for f in db.query(Festivo)}
    vacs = db.query(Vacacion).order_by(Vacacion.inicio.desc()).all()
    return {
        **cfg,
        "esta_semana": {e["id"]: ts.semana_tipo(cfg, e["id"], ts.hoy()) for e in cfg["empleados"]},
        "festivos": [{"id": f.id, "fecha": f.fecha, "nombre": f.nombre}
                     for f in db.query(Festivo).order_by(Festivo.fecha)],
        "anios_sin_festivos": ts.anios_sin_festivos(db, ts.hoy(), ts.hoy().replace(month=12, day=31) + timedelta(days=1)),
        "vacaciones": [{"id": v.id, "empleado": v.empleado, "inicio": v.inicio, "fin": v.fin, "nota": v.nota,
                        "dias": ts.dias_laborables(v.inicio, v.fin, fest)} for v in vacs],
    }


@router.put("/ajustes", dependencies=[Depends(solo_encargado)])
def put_ajustes(data: Ajustes, db: Session = Depends(get_db)):
    ids = {t.id for t in data.tipos} | {ts.LIBRE}
    if not data.semanas or any(len(s) != 7 or any(x not in ids for x in s) for s in data.semanas):
        raise HTTPException(400, "Cada semana tipo necesita los 7 días con un turno válido")
    if not data.empleados:
        raise HTTPException(400, "Hace falta al menos un empleado")
    _fecha(data.ancla)
    n = len(data.semanas)
    datos = data.model_dump()
    datos["v"] = 2
    datos["vac_previas"] = ts.ajustes(db).get("vac_previas", {})
    datos["inicio"] = {e.id: int(data.inicio.get(e.id, 0)) % n for e in data.empleados}
    return ts.guardar_ajustes(db, datos)


class EstaSemana(BaseModel):
    empleado: str
    semana: int


@router.put("/esta-semana", dependencies=[Depends(solo_encargado)])
def put_esta_semana(data: EstaSemana, db: Session = Depends(get_db)):
    """Cambia qué semana tipo le toca a alguien esta semana (y con ello toda su rotación)."""
    cfg = ts.ajustes(db)
    n = len(cfg["semanas"])
    if not ts.nombre_empleado(cfg, data.empleado):
        raise HTTPException(404, "Empleado no encontrado")
    if not 0 <= data.semana < n:
        raise HTTPException(400, "Semana no válida")
    actual = ts.semana_tipo(cfg, data.empleado, ts.hoy())
    cfg["inicio"][data.empleado] = (cfg["inicio"].get(data.empleado, 0) + data.semana - actual) % n
    return ts.guardar_ajustes(db, cfg)


@router.get("/cuadrante")
def get_cuadrante(desde: str, dias: int = Query(default=7, ge=1, le=62), db: Session = Depends(get_db)):
    return ts.cuadrante(db, _fecha(desde), dias)


@router.get("/hoy")
def get_hoy(db: Session = Depends(get_db)):
    """Hoy y mañana de todos (para Inicio y la pantalla de reparto)."""
    return ts.cuadrante(db, ts.hoy(), 2)


@router.put("/cambio", dependencies=[Depends(solo_encargado)])
def put_cambio(data: Cambio, db: Session = Depends(get_db)):
    data.fecha = _fecha(data.fecha).isoformat()
    cfg = ts.ajustes(db)
    if not ts.nombre_empleado(cfg, data.empleado):
        raise HTTPException(404, "Empleado no encontrado")
    if data.tipo and data.tipo != ts.LIBRE and data.tipo not in {t["id"] for t in cfg["tipos"]}:
        raise HTTPException(400, "Turno no válido")
    c = db.query(TurnoCambio).filter_by(empleado=data.empleado, fecha=data.fecha).first()
    if not data.tipo:
        if c:
            db.delete(c)
    else:
        if not c:
            c = TurnoCambio(empleado=data.empleado, fecha=data.fecha)
            db.add(c)
        c.tipo = data.tipo
        c.nota = (data.nota or "").strip()[:200] or None
    db.commit()
    res = ts.cuadrante(db, _fecha(data.fecha), 1)["empleados"]
    if _fecha(data.fecha) >= ts.hoy():
        t = next(e for e in res if e["id"] == data.empleado)["dias"][0]
        que = f"{t['nombre']} · {t['horario']}" if t["clase"] == "trabajo" else t["nombre"]
        push_service.avisar(push_service.a_persona(data.empleado), "Cambio en tu turno",
                            f"{_cuando(data.fecha).capitalize()}: {que}{f' ({data.nota})' if data.nota else ''}",
                            "/turnos", f"turno-{data.fecha}")
    return res


@router.post("/vacaciones", dependencies=[Depends(solo_encargado)])
def post_vacaciones(data: NuevaVacacion, db: Session = Depends(get_db)):
    a, b = _fecha(data.inicio), _fecha(data.fin)
    data.inicio, data.fin = a.isoformat(), b.isoformat()
    if b < a:
        raise HTTPException(400, "La fecha de fin es anterior a la de inicio")
    if (b - a).days > 62:
        raise HTTPException(400, "Como mucho 2 meses seguidos")
    if not ts.nombre_empleado(ts.ajustes(db), data.empleado):
        raise HTTPException(404, "Empleado no encontrado")
    solape = db.query(Vacacion).filter(Vacacion.empleado == data.empleado,
                                       Vacacion.inicio <= data.fin, Vacacion.fin >= data.inicio).first()
    if solape:
        raise HTTPException(400, f"Ya tiene vacaciones del {solape.inicio} al {solape.fin} que se solapan")
    v = Vacacion(empleado=data.empleado, inicio=data.inicio, fin=data.fin,
                 nota=(data.nota or "").strip()[:200] or None)
    db.add(v)
    db.commit()
    push_service.avisar(push_service.a_persona(data.empleado), "Vacaciones apuntadas",
                        f"Del {_cuando(data.inicio)} al {_cuando(data.fin)}", "/turnos", f"vac-{v.id}")
    return {"id": v.id}


@router.delete("/vacaciones/{vid}", dependencies=[Depends(solo_encargado)])
def delete_vacaciones(vid: int, db: Session = Depends(get_db)):
    v = db.get(Vacacion, vid)
    if not v:
        raise HTTPException(404, "No encontrado")
    db.delete(v)
    db.commit()
    return {"ok": True}


@router.post("/festivos", dependencies=[Depends(solo_encargado)])
def post_festivo(data: NuevoFestivo, db: Session = Depends(get_db)):
    data.fecha = _fecha(data.fecha).isoformat()
    nombre = data.nombre.strip()[:120] or "Festivo"
    f = db.query(Festivo).filter_by(fecha=data.fecha).first()
    if f:
        f.nombre = nombre
    else:
        db.add(Festivo(fecha=data.fecha, nombre=nombre))
    db.commit()
    return {"ok": True}


@router.delete("/festivos/{fid}", dependencies=[Depends(solo_encargado)])
def delete_festivo(fid: int, db: Session = Depends(get_db)):
    f = db.get(Festivo, fid)
    if not f:
        raise HTTPException(404, "No encontrado")
    db.delete(f)
    db.commit()
    return {"ok": True}
