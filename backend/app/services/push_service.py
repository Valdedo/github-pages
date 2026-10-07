"""Avisos en el móvil (Web Push, RFC 8291 + VAPID RFC 8292) sin dependencias extra.

Quién recibe qué:
- Melchor (reparto): cuando le mandan albaranes al camión.
- Tienda y encargado: cuando se firma un albarán en el reparto.
- Cada persona: cuando le cambian el turno o le ponen vacaciones.
"""
import base64
import json
import logging
import os
import struct
import threading
import time
from typing import Callable, Optional
from urllib.parse import urlparse

import httpx
from cryptography.hazmat.primitives import hashes, hmac, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)
CONTACTO = "mailto:casafonsomc@gmail.com"


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def deb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _hmac(key: bytes, data: bytes) -> bytes:
    h = hmac.HMAC(key, hashes.SHA256())
    h.update(data)
    return h.finalize()


def _punto(pub: ec.EllipticCurvePublicKey) -> bytes:
    return pub.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


# ── Claves del servidor ─────────────────────────────────────────
_claves: dict = {}


def claves() -> tuple:
    """(clave privada, clave pública base64url). Se crean la primera vez y se guardan."""
    if _claves:
        return _claves["priv"], _claves["pub"]
    from app.database import SessionLocal
    from app.models.push import PushConfig
    db = SessionLocal()
    try:
        c = db.get(PushConfig, 1)
        if not c:
            priv = ec.generate_private_key(ec.SECP256R1())
            pem = priv.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                     serialization.NoEncryption()).decode()
            c = PushConfig(id=1, private_pem=pem, public_key=b64u(_punto(priv.public_key())))
            db.add(c)
            db.commit()
        priv = serialization.load_pem_private_key(c.private_pem.encode(), password=None)
        _claves.update(priv=priv, pub=c.public_key)
    finally:
        db.close()
    return _claves["priv"], _claves["pub"]


def _vapid(endpoint: str) -> str:
    priv, pub = claves()
    u = urlparse(endpoint)
    head = b64u(json.dumps({"typ": "JWT", "alg": "ES256"}).encode())
    body = b64u(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600,
                            "sub": CONTACTO}).encode())
    firma = priv.sign(f"{head}.{body}".encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(firma)
    jwt = f"{head}.{body}.{b64u(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"
    return f"vapid t={jwt}, k={pub}"


def cifrar(payload: bytes, p256dh: str, auth: str, salt: Optional[bytes] = None,
           local: Optional[ec.EllipticCurvePrivateKey] = None) -> bytes:
    """Cifrado aes128gcm (RFC 8291)."""
    ua_pub_bytes = deb64u(p256dh)
    ua_pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub_bytes)
    local = local or ec.generate_private_key(ec.SECP256R1())
    as_pub = _punto(local.public_key())
    secreto = local.exchange(ec.ECDH(), ua_pub)
    prk_key = _hmac(deb64u(auth), secreto)
    ikm = _hmac(prk_key, b"WebPush: info\x00" + ua_pub_bytes + as_pub + b"\x01")
    salt = salt or os.urandom(16)
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    cifrado = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    return salt + struct.pack("!IB", 4096, len(as_pub)) + as_pub + cifrado


def _enviar_uno(sub, datos: dict) -> bool:
    """True si hay que borrar la suscripción (ya no existe)."""
    try:
        r = httpx.post(sub.endpoint, content=cifrar(json.dumps(datos).encode(), sub.p256dh, sub.auth),
                       headers={"Authorization": _vapid(sub.endpoint), "Content-Encoding": "aes128gcm",
                                "Content-Type": "application/octet-stream", "TTL": "86400", "Urgency": "high"},
                       timeout=15)
        if r.status_code in (404, 410):
            return True
        if r.status_code >= 400:
            logger.warning("Aviso rechazado (%s): %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.warning("No se pudo mandar un aviso: %s", e)
    return False


def avisar(filtro: Callable, titulo: str, texto: str, url: str = "/", etiqueta: Optional[str] = None,
           excluir: Optional[str] = None) -> None:
    """Manda el aviso en segundo plano a las suscripciones que cumplan filtro(sub)."""
    def tarea():
        from app.database import SessionLocal
        from app.models.push import PushSub
        db = SessionLocal()
        try:
            subs = [s for s in db.query(PushSub).all() if filtro(s) and s.endpoint != excluir]
            datos = {"title": titulo, "body": texto, "url": url, "tag": etiqueta or url}
            for s in subs:
                if _enviar_uno(s, datos):
                    db.delete(s)
            db.commit()
        except Exception as e:
            logger.warning("Error mandando avisos: %s", e)
        finally:
            db.close()
    threading.Thread(target=tarea, daemon=True).start()


# Filtros habituales
def a_reparto(s) -> bool:
    return s.rol == "reparto" or s.persona == "melchor"


def a_tienda(s) -> bool:
    return s.rol in ("tienda", "admin", None) and s.persona != "melchor"


def a_persona(persona: str) -> Callable:
    return lambda s: s.persona == persona


# ── Aviso agrupado a Melchor ────────────────────────────────────
# Si le mandan varios albaranes seguidos al camión, recibe un solo aviso.
_reparto = {"n": 0, "timer": None}
_lock = threading.Lock()


def nuevos_en_reparto(n: int, espera: float = 45) -> None:
    with _lock:
        _reparto["n"] += n
        if _reparto["timer"]:
            _reparto["timer"].cancel()
        t = threading.Timer(espera, _mandar_reparto)
        t.daemon = True
        _reparto["timer"] = t
        t.start()


def _mandar_reparto():
    with _lock:
        n, _reparto["n"], _reparto["timer"] = _reparto["n"], 0, None
    if n > 0:
        avisar(a_reparto, "Albaranes para repartir",
               f"Te han puesto {n} albarán{'es' if n != 1 else ''} nuevo{'s' if n != 1 else ''} en el camión",
               "/reparto", "reparto")
