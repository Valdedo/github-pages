"""Cálculo de turnos.

Cada empleado rota por las «semanas tipo» (A, B, C, D…) una semana cada vez.
La rotación se cuenta en semanas desde una fecha fija (no por nº de semana del año),
así no se descuadra al cambiar de año.

Prioridad de un día: cambio puesto a mano > vacaciones > festivo > domingo > semana tipo.
"""
import json
from datetime import date, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.turnos import Festivo, TurnoAjustes, TurnoCambio, Vacacion

LIBRE = "libre"


def hoy() -> date:
    from datetime import datetime
    return datetime.now(ZoneInfo("Europe/Madrid")).date()

DEFAULT = {
    "empleados": [
        {"id": "melchor", "nombre": "Melchor", "color": "#2F7DD1"},
        {"id": "patricia", "nombre": "Patricia", "color": "#C2477E"},
        {"id": "oscar", "nombre": "Oscar", "color": "#E08A1E"},
        {"id": "andres", "nombre": "Andrés", "color": "#2FAE66"},
    ],
    "tipos": [
        {"id": "jornada", "nombre": "Jornada", "horario": "8:30–13:30 · 14:30–18:30", "horas": 9},
        {"id": "entrada", "nombre": "Entra 9:30", "horario": "9:30–13:30 · 14:30–18:30", "horas": 8},
        {"id": "salida", "nombre": "Sale 17:30", "horario": "8:30–13:30 · 14:30–17:30", "horas": 8},
        {"id": "sabado", "nombre": "Sábado", "horario": "9:30–13:30", "horas": 4},
        {"id": "manana", "nombre": "Mañana", "horario": "8:30–13:30", "horas": 5},
        {"id": "tarde", "nombre": "Tarde", "horario": "14:30–18:30", "horas": 4},
    ],
    # Lunes … domingo. Cada lunes cada uno pasa a la siguiente (A → B → C → D → A)
    "semanas": [
        ["salida", "salida", "salida", "salida", "salida", "sabado", LIBRE],     # A: L–S, sale 17:30
        [LIBRE, "jornada", "jornada", "jornada", "jornada", "sabado", LIBRE],   # B: libra el lunes, M–S
        ["entrada", "entrada", "entrada", "entrada", "entrada", LIBRE, LIBRE],  # C: L–V, entra 9:30
        ["jornada", "jornada", "jornada", "jornada", LIBRE, LIBRE, LIBRE],      # D: L–J
    ],
    "v": 2,
    # Días de vacaciones gastados antes de usar la app (se suman a los apuntados)
    "vac_previas": {"2026": {"melchor": 15, "patricia": 15, "oscar": 15, "andres": 15}},
    # Lunes de referencia y qué semana tipo (índice) le toca a cada uno esa semana.
    # Sigue la rotación de la app anterior: semana 41 de 2026 → (posición + 41) % 4
    "ancla": "2026-10-05",
    "inicio": {"melchor": 1, "patricia": 2, "oscar": 3, "andres": 0},
}

_SEMANAS_V1 = [
    ["jornada", "jornada", "jornada", "jornada", "jornada", "sabado", LIBRE],
    [LIBRE, "jornada", "jornada", "jornada", "jornada", "sabado", LIBRE],
    ["jornada", "jornada", "jornada", "jornada", "jornada", LIBRE, LIBRE],
    ["jornada", "jornada", "jornada", "jornada", LIBRE, LIBRE, LIBRE],
]

# Festivos que se cargan solos, por año. Para añadir un año nuevo basta con otra entrada:
# nacionales + Asturias (BOE/BOPA) y los locales de Boal y Villayón (BOPA, fiestas locales).
# Cada año se carga una sola vez (luego se pueden quitar o añadir a mano en Turnos).
FESTIVOS = {
    2026: [
        ("2026-01-01", "Año Nuevo"), ("2026-01-06", "Reyes"),
        ("2026-04-02", "Jueves Santo"), ("2026-04-03", "Viernes Santo"),
        ("2026-05-01", "Fiesta del Trabajo"), ("2026-05-29", "San Fernando (local Boal)"),
        ("2026-06-29", "San Pedro (local Villayón)"), ("2026-07-24", "Santiago (local Boal)"),
        ("2026-08-15", "La Asunción"), ("2026-09-08", "Día de Asturias"),
        ("2026-09-09", "Santa María de Oneta (local Villayón)"),
        ("2026-10-12", "Fiesta Nacional"), ("2026-11-02", "Todos los Santos (trasladado)"),
        ("2026-12-07", "Constitución (trasladado)"), ("2026-12-08", "Inmaculada"),
        ("2026-12-25", "Navidad"),
    ],
    # 2027: locales según la resolución del BOPA de 10/06/2026; Día de Asturias según el
    # Decreto 7/2026. El resto, fechas fijas y Semana Santa (Pascua: 28/03/2027). El BOE de
    # 2027 aún no había salido: la Asunción cae en domingo y se pone el lunes 16 (por confirmar).
    2027: [
        ("2027-01-01", "Año Nuevo"), ("2027-01-06", "Reyes"),
        ("2027-02-09", "Martes de Carnaval (local Boal)"),
        ("2027-03-25", "Jueves Santo"), ("2027-03-26", "Viernes Santo"),
        ("2027-05-01", "Fiesta del Trabajo"),
        ("2027-07-26", "Santiago (local Boal) · Santa Ana (local Villayón)"),
        ("2027-08-16", "La Asunción (trasladado, por confirmar)"), ("2027-09-08", "Día de Asturias"),
        ("2027-09-09", "Santa María de Oneta (local Villayón)"),
        ("2027-10-12", "Fiesta Nacional"), ("2027-11-01", "Todos los Santos"),
        ("2027-12-06", "Constitución"), ("2027-12-08", "Inmaculada"),
        ("2027-12-25", "Navidad"),
    ],
}
FESTIVOS_2026 = FESTIVOS[2026]  # compatibilidad


def _cargar_festivos(db: Session, datos: dict) -> bool:
    """Carga (una vez por año) los festivos de FESTIVOS que aún no estén. Devuelve si cambió algo."""
    cargados = set(datos.get("festivos_cargados") or [])
    cambio = False
    for anio, lista in FESTIVOS.items():
        if anio in cargados:
            continue
        if not db.query(Festivo).filter(Festivo.fecha.like(f"{anio}-%")).first():
            for f, n in lista:
                db.add(Festivo(fecha=f, nombre=n))
        cargados.add(anio)
        cambio = True
    if cambio:
        datos["festivos_cargados"] = sorted(cargados)
    return cambio


def anios_sin_festivos(db: Session, desde: date, hasta: date) -> list:
    """Años del intervalo sin ningún festivo apuntado (para avisar en la pantalla de turnos)."""
    return [a for a in range(desde.year, hasta.year + 1)
            if not db.query(Festivo).filter(Festivo.fecha.like(f"{a}-%")).first()]


def ajustes(db: Session) -> dict:
    row = db.get(TurnoAjustes, 1)
    if not row:
        try:
            row = TurnoAjustes(id=1, datos=json.dumps(DEFAULT, ensure_ascii=False))
            db.add(row)
            db.commit()
        except IntegrityError:  # otra petición lo creó a la vez
            db.rollback()
            row = db.get(TurnoAjustes, 1)
    datos = json.loads(row.datos)
    if _cargar_festivos(db, datos):
        try:
            row.datos = json.dumps(datos, ensure_ascii=False)
            db.commit()
        except IntegrityError:
            db.rollback()
    if datos.get("v", 1) < 2 and datos.get("semanas") == _SEMANAS_V1:
        # Rotación real (7/10/2026): sustituye a la provisional si nadie la había tocado
        datos.update(tipos=DEFAULT["tipos"], semanas=DEFAULT["semanas"], v=2)
        row.datos = json.dumps(datos, ensure_ascii=False)
        db.commit()
    for k, v in DEFAULT.items():
        datos.setdefault(k, v)
    return datos


def guardar_ajustes(db: Session, datos: dict) -> dict:
    row = db.get(TurnoAjustes, 1) or TurnoAjustes(id=1)
    if row.datos and "festivos_cargados" not in datos:
        try:
            datos["festivos_cargados"] = json.loads(row.datos).get("festivos_cargados", [])
        except ValueError:
            pass
    row.datos = json.dumps(datos, ensure_ascii=False)
    db.merge(row)
    db.commit()
    return ajustes(db)


def _lunes(d: date) -> date:
    return d - timedelta(days=d.weekday())


def semana_tipo(cfg: dict, empleado: str, d: date) -> int:
    n = max(len(cfg["semanas"]), 1)
    semanas = (_lunes(d) - _lunes(date.fromisoformat(cfg["ancla"]))).days // 7
    return (cfg["inicio"].get(empleado, 0) + semanas) % n


def cuadrante(db: Session, desde: date, dias: int) -> dict:
    cfg = ajustes(db)
    hasta = desde + timedelta(days=dias - 1)
    d0, d1 = desde.isoformat(), hasta.isoformat()
    tipos = {t["id"]: t for t in cfg["tipos"]}
    festivos = {f.fecha: f.nombre for f in db.query(Festivo).filter(Festivo.fecha >= d0, Festivo.fecha <= d1)}
    cambios = {(c.empleado, c.fecha): c for c in
               db.query(TurnoCambio).filter(TurnoCambio.fecha >= d0, TurnoCambio.fecha <= d1)}
    vacs = db.query(Vacacion).filter(Vacacion.inicio <= d1, Vacacion.fin >= d0).all()
    fechas = [desde + timedelta(days=i) for i in range(dias)]

    def dia(emp: str, d: date) -> dict:
        f = d.isoformat()
        c = cambios.get((emp, f))
        base_id = cfg["semanas"][semana_tipo(cfg, emp, d)][d.weekday()] if cfg["semanas"] else LIBRE
        out = {"fecha": f, "semana": "ABCDEFGH"[semana_tipo(cfg, emp, d) % 8], "cambio": bool(c),
               "nota": c.nota if c else None}
        vac = next((v for v in vacs if v.empleado == emp and v.inicio <= f <= v.fin), None)
        if c:
            tid = c.tipo
        elif vac:
            return {**out, "clase": "vacaciones", "nombre": "Vacaciones", "horario": "", "horas": 0,
                    "nota": vac.nota}
        elif f in festivos:
            return {**out, "clase": "festivo", "nombre": "Festivo", "horario": festivos[f], "horas": 0}
        elif d.weekday() == 6:
            tid = LIBRE
        else:
            tid = base_id
        t = tipos.get(tid)
        if not t:
            return {**out, "tipo": LIBRE, "clase": "libre", "nombre": "Libre", "horario": "", "horas": 0}
        return {**out, "tipo": tid, "clase": "trabajo", "nombre": t["nombre"], "horario": t["horario"],
                "horas": t.get("horas") or 0}

    sin = anios_sin_festivos(db, desde, hasta)
    return {
        "desde": d0, "hasta": d1,
        "festivos": festivos,
        # Algún año del cuadrante no tiene festivos apuntados: la pantalla debe avisar
        "sin_festivos": bool(sin), "anios_sin_festivos": sin,
        "empleados": [
            {**e, "dias": [dia(e["id"], d) for d in fechas]} for e in cfg["empleados"]
        ],
    }


def dias_laborables(inicio: str, fin: str, festivos: set) -> int:
    a, b = date.fromisoformat(inicio), date.fromisoformat(fin)
    n = 0
    while a <= b:
        if a.weekday() < 6 and a.isoformat() not in festivos:
            n += 1
        a += timedelta(days=1)
    return n


def nombre_empleado(cfg: dict, emp: str) -> Optional[str]:
    return next((e["nombre"] for e in cfg["empleados"] if e["id"] == emp), None)
