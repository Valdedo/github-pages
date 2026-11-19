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


def drive_crear_carpeta(folder_id: str, nombre: str) -> dict:
    """Crea la carpeta `nombre` dentro de `folder_id` (si ya existe, devuelve esa). {id, name}.
    Necesita la versión del Apps Script de nov. 2026 (acción `crear_carpeta`)."""
    r = _post({"action": "crear_carpeta", "folderId": folder_id, "nombre": nombre})
    return {"id": r["id"], "name": r.get("name") or nombre}


_puede: dict = {"at": 0.0, "crear": False}


def drive_puede_crear() -> bool:
    """¿El Apps Script instalado sabe crear carpetas? (el de antes contesta con error a lo que no conoce).
    El sí se recuerda; el no se vuelve a preguntar a los 5 minutos, por si se acaba de actualizar."""
    import time
    if _puede["crear"] or time.time() - _puede["at"] < 300:
        return _puede["crear"]
    _puede["at"] = time.time()
    try:
        _puede["crear"] = bool(_post({"action": "puede"}).get("crear_carpeta"))
    except Exception:
        _puede["crear"] = False
    return _puede["crear"]


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
