"""Activar y desactivar los avisos en el móvil."""
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.push import PushSub
from app.services import push_service as ps

router = APIRouter(prefix="/api/push", tags=["avisos"])

# Servicios de avisos de los navegadores (Chrome/Android, Firefox, Safari/iPhone, Edge)
_SERVICIOS = ("fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com",
              "push.apple.com", "notify.windows.com")


class Claves(BaseModel):
    p256dh: str
    auth: str


class Suscripcion(BaseModel):
    endpoint: str
    keys: Claves
    persona: Optional[str] = None


class Baja(BaseModel):
    endpoint: str


@router.get("/clave")
def clave():
    return {"clave": ps.claves()[1]}


@router.post("/suscribir")
def suscribir(data: Suscripcion, request: Request, db: Session = Depends(get_db)):
    host = urlparse(data.endpoint).hostname or ""
    if not data.endpoint.startswith("https://") or not host.endswith(_SERVICIOS):
        raise HTTPException(400, "Suscripción no válida")
    rol = getattr(request.state, "rol", None)
    persona = getattr(request.state, "persona", None)
    if persona and persona != "tienda":  # código personal: los avisos son de esa persona
        data.persona = persona
    s = db.query(PushSub).filter_by(endpoint=data.endpoint).first() or PushSub(endpoint=data.endpoint)
    s.p256dh, s.auth = data.keys.p256dh, data.keys.auth
    s.rol = rol
    s.persona = (data.persona or ("melchor" if rol == "reparto" else None) or None)
    db.add(s)
    db.commit()
    return {"ok": True}


@router.post("/baja")
def baja(data: Baja, db: Session = Depends(get_db)):
    db.query(PushSub).filter_by(endpoint=data.endpoint).delete()
    db.commit()
    return {"ok": True}


@router.post("/prueba")
def prueba(data: Baja, db: Session = Depends(get_db)):
    s = db.query(PushSub).filter_by(endpoint=data.endpoint).first()
    if not s:
        raise HTTPException(404, "Este dispositivo no tiene los avisos activados")
    ps.avisar(lambda x: x.endpoint == data.endpoint, "Avisos activados",
              "Así te llegarán los avisos de Casa Fonso.", "/", "prueba")
    return {"ok": True}
