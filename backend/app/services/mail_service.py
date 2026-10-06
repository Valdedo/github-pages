"""Envío de correo y copia en Drive a través del Apps Script de casafonsomc@gmail.com.

Railway (plan Hobby) bloquea SMTP, así que todo va por HTTPS al Apps Script.
"""
import base64

import httpx

from app.config import settings


class MailNotConfigured(Exception):
    pass


def configured() -> bool:
    return bool(settings.mail_relay_url and settings.mail_relay_key)


def _post(payload: dict) -> None:
    if not configured():
        raise MailNotConfigured("Falta configurar el envío de correo (MAIL_RELAY_URL y MAIL_RELAY_KEY en Railway)")
    payload = {"key": settings.mail_relay_key, **payload}
    # Apps Script responde con una redirección; httpx la sigue para leer el resultado
    r = httpx.post(settings.mail_relay_url, json=payload, follow_redirects=True, timeout=90)
    try:
        data = r.json()
    except Exception:
        raise RuntimeError(f"El servicio de correo respondió de forma inesperada ({r.status_code})")
    if not data.get("ok"):
        raise RuntimeError(data.get("error") or "No se pudo completar la operación")


def send_pdf(to: str, subject: str, body: str, filename: str, pdf: bytes) -> None:
    _post({"action": "email", "to": to, "subject": subject, "body": body,
           "filename": filename, "pdf": base64.b64encode(pdf).decode()})


def backup_pdf(folder: str, filename: str, pdf: bytes) -> None:
    """Guarda el PDF en Drive dentro de 'folder' (ruta con /), sustituyendo si ya existe."""
    _post({"action": "backup", "folder": folder, "filename": filename,
           "pdf": base64.b64encode(pdf).decode()})
