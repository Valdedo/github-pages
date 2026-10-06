"""Envío de correo con adjunto a través del Apps Script de casafonsomc@gmail.com."""
import base64

import httpx

from app.config import settings


class MailNotConfigured(Exception):
    pass


def send_pdf(to: str, subject: str, body: str, filename: str, pdf: bytes) -> None:
    if not settings.mail_relay_url or not settings.mail_relay_key:
        raise MailNotConfigured("Falta configurar el envío de correo (MAIL_RELAY_URL y MAIL_RELAY_KEY en Railway)")
    payload = {
        "key": settings.mail_relay_key,
        "to": to,
        "subject": subject,
        "body": body,
        "filename": filename,
        "pdf": base64.b64encode(pdf).decode(),
    }
    # Apps Script responde con una redirección; httpx la sigue para leer el resultado
    r = httpx.post(settings.mail_relay_url, json=payload, follow_redirects=True, timeout=60)
    try:
        data = r.json()
    except Exception:
        raise RuntimeError(f"El servicio de correo respondió de forma inesperada ({r.status_code})")
    if not data.get("ok"):
        raise RuntimeError(data.get("error") or "No se pudo enviar el correo")
