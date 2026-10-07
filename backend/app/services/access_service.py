"""Acceso por código: encargado (todo), tienda (todo menos cambiar turnos y códigos) y reparto (firmas y ver turnos). Sesiones firmadas con HMAC."""
import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Optional

from app.database import SessionLocal
from app.models.access import AccessConfig

_cache: dict = {"cfg": None, "at": 0.0}
_fails: dict = {}


def _hash(code: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", code.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${h}"


def _check(code: str, stored: Optional[str]) -> bool:
    if not stored or "$" not in stored:
        return False
    salt = stored.split("$", 1)[0]
    return hmac.compare_digest(_hash(code, salt), stored)


def config(fresh: bool = False) -> Optional[dict]:
    if not fresh and _cache["cfg"] is not None and time.time() - _cache["at"] < 30:
        return _cache["cfg"] or None
    db = SessionLocal()
    try:
        c = db.query(AccessConfig).first()
        cfg = {"tienda": c.tienda_hash, "reparto": c.reparto_hash, "admin": c.admin_hash, "secret": c.secret, "version": c.version} if c else {}
    finally:
        db.close()
    _cache.update(cfg=cfg, at=time.time())
    return cfg or None


def guardar(tienda: str, reparto: Optional[str]) -> None:
    db = SessionLocal()
    try:
        c = db.query(AccessConfig).first()
        if not c:
            c = AccessConfig(id=1, secret=secrets.token_urlsafe(32), version=1, tienda_hash="")
            db.add(c)
        else:
            c.version = (c.version or 1) + 1
        c.tienda_hash = _hash(tienda)
        c.reparto_hash = _hash(reparto) if reparto else None
        db.commit()
    finally:
        db.close()
    config(fresh=True)


def guardar_admin(codigo: Optional[str]) -> None:
    """Pone o cambia el código del encargado sin cerrar las sesiones de los demás."""
    db = SessionLocal()
    try:
        c = db.query(AccessConfig).first()
        c.admin_hash = _hash(codigo) if codigo else None
        db.commit()
    finally:
        db.close()
    config(fresh=True)


def demasiados_intentos(ip: str) -> bool:
    ahora = time.time()
    lst = [t for t in _fails.get(ip, []) if ahora - t < 600]
    _fails[ip] = lst
    return len(lst) >= 10


def fallo(ip: str) -> None:
    _fails.setdefault(ip, []).append(time.time())


def rol_para(code: str) -> Optional[str]:
    cfg = config(fresh=True)
    if not cfg:
        return None
    if _check(code, cfg.get("admin")):
        return "admin"
    if _check(code, cfg["tienda"]):
        return "tienda"
    if _check(code, cfg.get("reparto")):
        return "reparto"
    return None


def emitir(rol: str) -> str:
    cfg = config()
    body = base64.urlsafe_b64encode(json.dumps({"r": rol, "v": cfg["version"]}).encode()).decode().rstrip("=")
    sig = hmac.new(cfg["secret"].encode(), body.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{body}.{sig}"


def verificar(token: Optional[str]) -> Optional[str]:
    """Devuelve el rol del token o None si no es válido."""
    cfg = config()
    if not cfg or not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    esperado = hmac.new(cfg["secret"].encode(), body.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(sig, esperado):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except Exception:
        return None
    if data.get("v") != cfg["version"]:
        return None
    return data.get("r")
