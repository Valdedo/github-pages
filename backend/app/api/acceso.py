"""Códigos de acceso a la app."""
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services import access_service as acc

router = APIRouter(prefix="/api/acceso", tags=["acceso"])


class Codigo(BaseModel):
    codigo: str


class Configurar(BaseModel):
    tienda: str
    reparto: Optional[str] = None


def _valido(c: Optional[str]) -> bool:
    return bool(c) and bool(re.fullmatch(r"\S{4,32}", c))


def _rol(request: Request):
    tok = request.headers.get("authorization", "").removeprefix("Bearer ").strip() or request.query_params.get("t")
    return acc.verificar(tok)


@router.get("/estado")
def estado(request: Request):
    cfg = acc.config()
    return {"configurado": bool(cfg), "rol": _rol(request) if cfg else None,
            "reparto": bool(cfg and cfg.get("reparto")), "encargado": bool(cfg and cfg.get("admin"))}


@router.post("/configurar")
def configurar(data: Configurar, request: Request):
    """Primera vez: crea los códigos. Después solo se pueden cambiar con sesión de tienda."""
    cfg = acc.config(fresh=True)
    if cfg:
        rol = _rol(request)
        if cfg.get("admin") and rol != "admin":
            raise HTTPException(403, "Solo Andrés puede cambiar los códigos")
        if rol not in ("tienda", "admin"):
            raise HTTPException(403, "Solo se pueden cambiar los códigos desde una sesión de la tienda")
    if not _valido(data.tienda):
        raise HTTPException(400, "El código de la tienda debe tener al menos 4 caracteres, sin espacios")
    if data.reparto and not _valido(data.reparto):
        raise HTTPException(400, "El código de reparto debe tener al menos 4 caracteres, sin espacios")
    if data.reparto and data.reparto == data.tienda:
        raise HTTPException(400, "Los dos códigos tienen que ser distintos")
    if cfg and cfg.get("admin") and acc.rol_para(data.tienda) == "admin":
        raise HTTPException(400, "El código de la tienda no puede ser el mismo que el tuyo")
    acc.guardar(data.tienda, data.reparto or None)
    rol = "admin" if cfg and cfg.get("admin") else "tienda"
    return {"token": acc.emitir(rol), "rol": rol}


class Encargado(BaseModel):
    codigo: str


@router.post("/encargado")
def encargado(data: Encargado, request: Request):
    """Crea o cambia el código del encargado. La primera vez basta la sesión de la tienda."""
    cfg = acc.config(fresh=True)
    if not cfg:
        raise HTTPException(400, "Primero hay que crear los códigos de la tienda")
    rol = _rol(request)
    if cfg.get("admin") and rol != "admin":
        raise HTTPException(403, "Solo Andrés puede cambiar su código")
    if rol not in ("tienda", "admin"):
        raise HTTPException(403, "Hace falta la sesión de la tienda")
    codigo = data.codigo.strip()
    if not _valido(codigo):
        raise HTTPException(400, "El código debe tener al menos 4 caracteres, sin espacios")
    otro = acc.rol_para(codigo)
    if otro in ("tienda", "reparto"):
        raise HTTPException(400, "Ese código ya lo usa la tienda o el reparto; elige otro")
    acc.guardar_admin(codigo)
    return {"token": acc.emitir("admin"), "rol": "admin"}


@router.post("/entrar")
def entrar(data: Codigo, request: Request):
    ip = request.client.host if request.client else "?"
    if acc.demasiados_intentos(ip):
        raise HTTPException(429, "Demasiados intentos. Espera 10 minutos y vuelve a probar.")
    rol = acc.rol_para(data.codigo.strip())
    if not rol:
        acc.fallo(ip)
        raise HTTPException(401, "Código incorrecto")
    return {"token": acc.emitir(rol), "rol": rol}
