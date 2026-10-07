"""Códigos de acceso a la app (uno por persona)."""
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


class NuevoCodigo(BaseModel):
    persona: str
    codigo: str


def _valido(c: Optional[str]) -> bool:
    return bool(c) and bool(re.fullmatch(r"\S{4,32}", c))


def _sesion(request: Request) -> Optional[dict]:
    tok = request.headers.get("authorization", "").removeprefix("Bearer ").strip() or request.query_params.get("t")
    return acc.sesion(tok)


@router.get("/estado")
def estado(request: Request):
    cfg = acc.config()
    s = _sesion(request) if cfg else None
    out = {"configurado": bool(cfg), "rol": s["rol"] if s else None, "persona": s["persona"] if s else None,
           "codigo_propio": bool(s and cfg["codigos"].get(s["persona"], {}).get("propio")),
           "reparto": bool(cfg and "melchor" in cfg["codigos"]), "encargado": acc.hay_encargado()}
    if s and s["rol"] == "admin":
        out["personas"] = [{"id": p, "nombre": n, "rol": r, "tiene_codigo": p in cfg["codigos"]}
                           for p, (r, n) in acc.PERSONAS.items()]
    return out


@router.post("/configurar")
def configurar(data: Configurar):
    """Solo la primera vez, con la app sin ningún código."""
    if acc.config(fresh=True):
        raise HTTPException(403, "Los códigos ya están creados. Solo Andrés puede cambiarlos.")
    if not _valido(data.tienda):
        raise HTTPException(400, "El código de la tienda debe tener al menos 4 caracteres, sin espacios")
    if data.reparto and not _valido(data.reparto):
        raise HTTPException(400, "El código de reparto debe tener al menos 4 caracteres, sin espacios")
    if data.reparto and data.reparto == data.tienda:
        raise HTTPException(400, "Los dos códigos tienen que ser distintos")
    acc.crear_inicial(data.tienda, data.reparto or None)
    return {"token": acc.emitir("tienda"), "rol": "tienda", "persona": "tienda"}


@router.post("/codigo")
def poner_codigo(data: NuevoCodigo, request: Request):
    """Poner o cambiar el código de una persona. Solo el encargado; la primera vez que
    se crea el código del encargado vale una sesión de la tienda."""
    s = _sesion(request)
    persona = data.persona.strip().lower()
    if persona not in acc.PERSONAS:
        raise HTTPException(404, "Persona no válida")
    primera_vez = persona == "andres" and not acc.hay_encargado() and s and s["rol"] == "tienda"
    if not (s and s["rol"] == "admin") and not primera_vez:
        raise HTTPException(403, "Solo Andrés puede cambiar los códigos")
    codigo = data.codigo.strip()
    if not _valido(codigo):
        raise HTTPException(400, "El código debe tener al menos 4 caracteres, sin espacios")
    if acc.en_uso(codigo, excepto=persona):
        raise HTTPException(400, "Ese código ya lo usa otra persona; elige otro")
    acc.poner_codigo(persona, codigo)
    propio = persona == (s or {}).get("persona") or primera_vez
    return {"ok": True, **({"token": acc.emitir(persona), "rol": acc.PERSONAS[persona][0], "persona": persona} if propio else {})}


@router.post("/cerrar-todas")
def cerrar_todas(request: Request):
    """Cierra la sesión en todos los dispositivos (todos tendrán que volver a escribir su código)."""
    s = _sesion(request)
    if not (s and s["rol"] == "admin"):
        raise HTTPException(403, "Solo Andrés puede hacerlo")
    acc.cerrar_todas()
    return {"token": acc.emitir(s["persona"]), "rol": "admin", "persona": s["persona"]}


@router.post("/entrar")
def entrar(data: Codigo, request: Request):
    ip = request.client.host if request.client else "?"
    if acc.demasiados_intentos(ip):
        raise HTTPException(429, "Demasiados intentos. Espera 10 minutos y vuelve a probar.")
    persona = acc.persona_para(data.codigo.strip())
    if not persona:
        acc.fallo(ip)
        raise HTTPException(401, "Código incorrecto")
    propio = bool(acc.config()["codigos"][persona].get("propio"))
    return {"token": acc.emitir(persona), "rol": acc.PERSONAS[persona][0], "persona": persona,
            "codigo_propio": propio or persona == "tienda"}


class MiCodigo(BaseModel):
    nuevo: str


@router.post("/mi-codigo")
def mi_codigo(data: MiCodigo, request: Request):
    """Cada persona puede poner su propio código (mínimo 4 números)."""
    s = _sesion(request)
    if not s or s["persona"] == "tienda":
        raise HTTPException(403, "El código de la tienda solo lo cambia Andrés")
    nuevo = data.nuevo.strip()
    if not re.fullmatch(r"\d{4,8}", nuevo):
        raise HTTPException(400, "El código tiene que ser de 4 a 8 números")
    if acc.en_uso(nuevo, excepto=s["persona"]):
        raise HTTPException(400, "Ese código no se puede usar. Prueba con otro")
    acc.poner_codigo(s["persona"], nuevo, propio=True)
    return {"token": acc.emitir(s["persona"]), "rol": s["rol"], "persona": s["persona"]}
