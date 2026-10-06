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


@router.get("/estado")
def estado(request: Request):
    cfg = acc.config()
    tok = request.headers.get("authorization", "").removeprefix("Bearer ").strip() or request.query_params.get("t")
    return {"configurado": bool(cfg), "rol": acc.verificar(tok) if cfg else None,
            "reparto": bool(cfg and cfg.get("reparto"))}


@router.post("/configurar")
def configurar(data: Configurar, request: Request):
    """Primera vez: crea los códigos. Después solo se pueden cambiar con sesión de tienda."""
    cfg = acc.config(fresh=True)
    if cfg:
        tok = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        if acc.verificar(tok) != "tienda":
            raise HTTPException(403, "Solo se pueden cambiar los códigos desde una sesión de la tienda")
    if not _valido(data.tienda):
        raise HTTPException(400, "El código de la tienda debe tener al menos 4 caracteres, sin espacios")
    if data.reparto and not _valido(data.reparto):
        raise HTTPException(400, "El código de reparto debe tener al menos 4 caracteres, sin espacios")
    if data.reparto and data.reparto == data.tienda:
        raise HTTPException(400, "Los dos códigos tienen que ser distintos")
    acc.guardar(data.tienda, data.reparto or None)
    return {"token": acc.emitir("tienda"), "rol": "tienda"}


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
