"""Avisos al cliente por el WhatsApp de Casa Fonso (API de WhatsApp de Meta).

El número de la oficina se conecta a la API por «coexistencia»: sigue funcionando en la app WhatsApp Business
y lo que se manda desde aquí aparece allí, igual que las respuestas del cliente.

Fuera de una conversación abierta por el cliente, Meta solo deja mandar plantillas aprobadas. La de la entrega
sin firma (nombre en WHATSAPP_PLANTILLA, categoría «Utilidad», idioma español) lleva:
- Encabezado: imagen (la foto de la entrega).
- Cuerpo, con tres huecos:
  «Hola. Hoy a las {{1}} le hemos llevado el material del albarán {{2}}. Como no estaba, lo dejamos {{3}}.
  Le enviamos una foto de cómo quedó. Si tiene cualquier duda, conteste a este mensaje.
  Casa Fonso · Materiales de construcción»
Sin WHATSAPP_TOKEN y WHATSAPP_PHONE_ID no hace nada (la app funciona igual, solo sin aviso).
"""
import logging
import re
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)
API = "https://graph.facebook.com/v21.0"


def activo() -> bool:
    return bool(settings.whatsapp_token.strip() and settings.whatsapp_phone_id.strip())


def movil(telefono: Optional[str]) -> Optional[str]:
    """Número en el formato de WhatsApp (34612345678) si es un móvil español; si no (fijo, vacío…), None."""
    if not telefono:
        return None
    # Puede venir «985 62 04 81 / 666 11 22 33»: se prueba cada número escrito
    for trozo in re.split(r"[/,;]| y |\n", telefono):
        d = re.sub(r"\D", "", trozo)
        if d.startswith("0034"):
            d = d[4:]
        elif d.startswith("34") and len(d) == 11:
            d = d[2:]
        if len(d) == 9 and d[0] in "67":
            return "34" + d
    return None


class ErrorWhatsApp(Exception):
    pass


def _detalle(r: httpx.Response) -> str:
    try:
        err = r.json().get("error", {})
        return err.get("error_user_msg") or err.get("message") or f"error {r.status_code}"
    except Exception:
        return f"error {r.status_code}"


def entrega_sin_firma(telefono: str, hora: str, albaran: str, donde: str, foto: Optional[bytes]) -> str:
    """Manda la plantilla con la foto. Devuelve el id del mensaje; si falla, ErrorWhatsApp con el motivo."""
    if not activo():
        raise ErrorWhatsApp("El WhatsApp de la empresa no está conectado")
    cab = {"Authorization": f"Bearer {settings.whatsapp_token.strip()}"}
    pid = settings.whatsapp_phone_id.strip()
    with httpx.Client(timeout=30) as cli:
        componentes = []
        if foto:
            r = cli.post(f"{API}/{pid}/media", headers=cab,
                         data={"messaging_product": "whatsapp", "type": "image/jpeg"},
                         files={"file": ("entrega.jpg", foto, "image/jpeg")})
            if r.status_code >= 400:
                raise ErrorWhatsApp(f"No se pudo subir la foto: {_detalle(r)}")
            componentes.append({"type": "header", "parameters": [{"type": "image", "image": {"id": r.json()["id"]}}]})
        componentes.append({"type": "body", "parameters": [
            {"type": "text", "text": hora}, {"type": "text", "text": albaran}, {"type": "text", "text": donde}]})
        r = cli.post(f"{API}/{pid}/messages", headers=cab, json={
            "messaging_product": "whatsapp", "to": telefono, "type": "template",
            "template": {"name": settings.whatsapp_plantilla, "language": {"code": settings.whatsapp_idioma},
                         "components": componentes},
        })
        if r.status_code >= 400:
            raise ErrorWhatsApp(_detalle(r))
        return (r.json().get("messages") or [{}])[0].get("id", "")
