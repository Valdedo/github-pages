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


def _post(payload: dict) -> dict:
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
    return data


def send_pdf(to: str, subject: str, body: str, filename: str, pdf: bytes) -> None:
    _post({"action": "email", "to": to, "subject": subject, "body": body,
           "filename": filename, "pdf": base64.b64encode(pdf).decode()})


def backup_pdf(folder: str, filename: str, pdf: bytes) -> None:
    """Guarda el PDF en Drive dentro de 'folder' (ruta con /), sustituyendo si ya existe."""
    _post({"action": "backup", "folder": folder, "filename": filename,
           "pdf": base64.b64encode(pdf).decode()})


def bandeja() -> dict:
    """Correos sin leer y sin contestar de casafonsomc@gmail.com (lo devuelve el Apps Script)."""
    return _post({"action": "inbox"})


# ── Carpetas de Drive (albaranes de proveedor) ──────────────────
def drive_carpetas(folder_id: str) -> list:
    return _post({"action": "carpetas", "folderId": folder_id}).get("carpetas", [])


def drive_guardar(folder_id: str, filename: str, pdf: bytes) -> dict:
    """Guarda el PDF en la carpeta (sustituye si ya hay uno con ese nombre). Devuelve {id, url}."""
    return _post({"action": "backup", "folderId": folder_id, "filename": filename,
                  "pdf": base64.b64encode(pdf).decode()})


def drive_mover(file_id: str, folder_id: str) -> None:
    _post({"action": "mover", "fileId": file_id, "folderId": folder_id})


def drive_borrar(file_id: str) -> None:
    _post({"action": "borrar", "fileId": file_id})


# ── Tarifas de proveedor (Google Sheets compartidas con casafonsomc@gmail.com) ──
def drive_hoja(file_id: str, pestanas: list | None = None) -> dict:
    """Valores de las pestañas de una hoja de cálculo, tal como se ven. {nombre, modificado, hojas}."""
    payload = {"action": "hoja", "fileId": file_id}
    if pestanas:
        payload["pestanas"] = pestanas
    return _post(payload)


def drive_archivos(folder_id: str) -> list:
    """Archivos (nombre e id) de una carpeta de Drive y sus subcarpetas."""
    return _post({"action": "archivos", "folderId": folder_id}).get("archivos", [])
