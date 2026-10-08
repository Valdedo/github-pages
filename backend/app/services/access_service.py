"""Acceso por código, uno por persona.

- andres   → encargado (todo, y el único que cambia turnos y códigos)
- patricia, oscar → tienda (todo menos lo anterior)
- melchor  → reparto (firmas del camión y ver turnos)
- tienda   → ordenador y teléfono compartidos de la tienda (como Patricia y Oscar)

Las sesiones van firmadas con HMAC e incluyen la huella del código de esa persona:
si se le cambia el código, sus sesiones antiguas dejan de valer. «Cerrar todas»
sube la versión y cierra las de todo el mundo.
"""
import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Optional

from app.database import SessionLocal
from app.models.access import AccessCodigo, AccessConfig

logger = logging.getLogger(__name__)

PERSONAS = {
    "andres": ("admin", "Andrés"),
    "patricia": ("tienda", "Patricia"),
    "oscar": ("tienda", "Oscar"),
    "melchor": ("reparto", "Melchor"),
    "tienda": ("tienda", "Ordenador y teléfono de la tienda"),
}

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


def _huella(h: str) -> str:
    return hashlib.sha256((h or "").encode()).hexdigest()[:12]


def _base(db) -> AccessConfig:
    c = db.query(AccessConfig).first()
    if not c:
        c = AccessConfig(id=1, secret=secrets.token_urlsafe(32), version=1, tienda_hash="")
        db.add(c)
        db.flush()
    return c


def config(fresh: bool = False) -> Optional[dict]:
    if not fresh and _cache["cfg"] is not None and time.time() - _cache["at"] < 30:
        return _cache["cfg"] or None
    db = SessionLocal()
    try:
        c = db.query(AccessConfig).first()
        codigos = {x.persona: {"rol": x.rol, "hash": x.hash, "propio": bool(x.propio)}
                   for x in db.query(AccessCodigo).all()}
        cfg = {"secret": c.secret, "version": c.version, "codigos": codigos} if c and codigos else {}
    finally:
        db.close()
    _cache.update(cfg=cfg, at=time.time())
    return cfg or None


def hay_encargado() -> bool:
    cfg = config()
    return bool(cfg and any(v["rol"] == "admin" for v in cfg["codigos"].values()))


# ── Arranque ─────────────────────────────────────────────────────
def preparar() -> None:
    """Pasa los códigos antiguos (tienda/reparto/encargado) al sistema por persona
    y aplica la variable CODIGOS de Railway si ha cambiado (cerrando todas las sesiones)."""
    from app.config import settings
    db = SessionLocal()
    try:
        c = db.query(AccessConfig).first()
        if c and not db.query(AccessCodigo).first():
            for persona, h in (("tienda", c.tienda_hash), ("melchor", c.reparto_hash), ("andres", c.admin_hash)):
                if h:
                    db.add(AccessCodigo(persona=persona, rol=PERSONAS[persona][0], hash=h))
            db.commit()

        texto = (settings.codigos or "").strip()
        if texto:
            huella = hashlib.sha256(texto.encode()).hexdigest()[:40]
            c = _base(db)
            if c.codigos_env != huella:
                pares = {}
                for parte in texto.split(","):
                    if ":" in parte:
                        p, cod = parte.split(":", 1)
                        p, cod = p.strip().lower(), cod.strip()
                        if p in PERSONAS and len(cod) >= 4:
                            pares[p] = cod
                if len(set(pares.values())) != len(pares):
                    logger.error("CODIGOS tiene códigos repetidos: no se aplica")
                elif pares:
                    db.query(AccessCodigo).delete()
                    for p, cod in pares.items():
                        db.add(AccessCodigo(persona=p, rol=PERSONAS[p][0], hash=_hash(cod)))
                    c.version = (c.version or 1) + 1  # se cierran todas las sesiones
                    c.codigos_env = huella
                    db.commit()
                    logger.info("Códigos por persona aplicados (%s); sesiones cerradas", ", ".join(pares))
    finally:
        db.close()
    config(fresh=True)


# ── Cambios ──────────────────────────────────────────────────────
def en_uso(codigo: str, excepto: Optional[str] = None) -> Optional[str]:
    cfg = config(fresh=True)
    for p, v in (cfg or {}).get("codigos", {}).items():
        if p != excepto and _check(codigo, v["hash"]):
            return p
    return None


def poner_codigo(persona: str, codigo: str, propio: bool = False) -> None:
    """Cambia el código de una persona; solo se cierran las sesiones de esa persona."""
    db = SessionLocal()
    try:
        _base(db)
        x = db.get(AccessCodigo, persona) or AccessCodigo(persona=persona, rol=PERSONAS[persona][0])
        x.hash = _hash(codigo)
        x.propio = propio
        db.merge(x)
        db.commit()
    finally:
        db.close()
    config(fresh=True)


def crear_inicial(tienda: str, reparto: Optional[str]) -> None:
    """Primera vez (app sin códigos): código de la tienda y de reparto."""
    poner_codigo("tienda", tienda)
    if reparto:
        poner_codigo("melchor", reparto)


def cerrar_todas() -> None:
    db = SessionLocal()
    try:
        c = _base(db)
        c.version = (c.version or 1) + 1
        db.commit()
    finally:
        db.close()
    config(fresh=True)


# ── Entrar ───────────────────────────────────────────────────────
def ip_real(request) -> str:
    """IP de quien llama. En Railway todo llega por su proxy: se usa la IP que pone el proxy
    (X-Real-IP o el primer valor de X-Forwarded-For); si no, la de la conexión (que con
    uvicorn --proxy-headers ya es la del cliente)."""
    h = request.headers
    ip = (h.get("x-real-ip") or "").strip() or (h.get("x-forwarded-for") or "").split(",")[0].strip()
    if not ip:
        ip = request.client.host if request.client else "?"
    return ip[:64]


def es_su_codigo(persona: str, codigo: str) -> bool:
    cfg = config(fresh=True)
    v = (cfg or {}).get("codigos", {}).get(persona)
    return bool(v and codigo and _check(codigo, v["hash"]))


def demasiados_intentos(ip: str) -> bool:
    ahora = time.time()
    lst = [t for t in _fails.get(ip, []) if ahora - t < 600]
    _fails[ip] = lst
    return len(lst) >= 10


def fallo(ip: str) -> None:
    _fails.setdefault(ip, []).append(time.time())


def persona_para(code: str) -> Optional[str]:
    return en_uso(code)


def emitir(persona: str) -> str:
    cfg = config(fresh=True)
    v = cfg["codigos"][persona]
    datos = {"p": persona, "r": v["rol"], "v": cfg["version"], "h": _huella(v["hash"])}
    body = base64.urlsafe_b64encode(json.dumps(datos).encode()).decode().rstrip("=")
    sig = hmac.new(cfg["secret"].encode(), body.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{body}.{sig}"


def sesion(token: Optional[str]) -> Optional[dict]:
    """{'rol': …, 'persona': …} si la sesión es válida."""
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
    actual = cfg["codigos"].get(data.get("p") or "")
    if not actual or data.get("h") != _huella(actual["hash"]):
        return None
    return {"rol": actual["rol"], "persona": data["p"]}


def verificar(token: Optional[str]) -> Optional[str]:
    s = sesion(token)
    return s["rol"] if s else None
