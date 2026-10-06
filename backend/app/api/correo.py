"""Resumen del correo de casafonsomc@gmail.com para la pantalla de Inicio."""
import json
import logging
import time

from fastapi import APIRouter

from app.config import settings
from app.services import mail_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/correo", tags=["correo"])

_cache: dict = {"at": 0.0, "data": None}
_resumenes: dict = {}   # id+fecha → {resumen, tipo}
CADA = 300  # segundos entre consultas al Gmail

PROMPT = """Eres la recepcionista de Casa Fonso, una tienda de materiales de construcción en Asturias.
Para cada correo, escribe un resumen de una sola línea (máximo 14 palabras, en español, sin saludos)
que diga qué quiere quien escribe, y clasifícalo:
- "cliente": un cliente pide algo, pregunta precio, presupuesto, pedido, queja…
- "proveedor": un proveedor informa de pedidos, envíos, tarifas, ofertas comerciales directas
- "factura": facturas, recibos, extractos o avisos de pago
- "publicidad": boletines, promociones masivas, notificaciones automáticas, redes sociales
- "otro": cualquier otra cosa
Responde SOLO con JSON: [{"id": "...", "resumen": "...", "tipo": "..."}]

Correos:
"""


def _resumir(items: list) -> None:
    pendientes = [i for i in items if f"{i['id']}|{i.get('fecha')}" not in _resumenes]
    if not pendientes:
        return
    if not settings.anthropic_api_key:
        for i in pendientes:
            _resumenes[f"{i['id']}|{i.get('fecha')}"] = {"resumen": (i.get("asunto") or "")[:90], "tipo": "otro"}
        return
    import anthropic
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    texto = "\n\n".join(
        f"id: {i['id']}\nde: {i.get('de')}\nasunto: {i.get('asunto')}\ntexto: {(i.get('texto') or '')[:700]}"
        for i in pendientes[:25]
    )
    try:
        msg = client.messages.create(model=settings.claude_model, max_tokens=2000,
                                     messages=[{"role": "user", "content": PROMPT + texto}])
        raw = msg.content[0].text.strip()
        raw = raw[raw.find("["): raw.rfind("]") + 1]
        out = {r["id"]: r for r in json.loads(raw)}
    except Exception as e:
        logger.warning("No se pudieron resumir los correos: %s", e)
        out = {}
    for i in pendientes:
        r = out.get(i["id"], {})
        _resumenes[f"{i['id']}|{i.get('fecha')}"] = {
            "resumen": r.get("resumen") or (i.get("asunto") or "")[:90],
            "tipo": r.get("tipo") or "otro",
        }


@router.get("/resumen")
def resumen(refrescar: bool = False):
    if not mail_service.configured():
        return {"configurado": False, "sin_leer": [], "sin_contestar": []}
    if not refrescar and _cache["data"] and time.time() - _cache["at"] < CADA:
        return _cache["data"]
    try:
        data = mail_service.bandeja()
    except Exception as e:
        logger.warning("No se pudo leer el correo: %s", e)
        return {"configurado": True, "error": "No se ha podido leer el correo ahora mismo", "sin_leer": [], "sin_contestar": []}
    sin_leer, sin_contestar = data.get("sin_leer", []), data.get("sin_contestar", [])
    _resumir(sin_leer + sin_contestar)

    def limpiar(lst):
        res = []
        for i in lst:
            r = _resumenes.get(f"{i['id']}|{i.get('fecha')}", {})
            if r.get("tipo") in ("publicidad", "factura"):
                continue
            res.append({"id": i["id"], "de": i.get("de"), "asunto": i.get("asunto"), "fecha": i.get("fecha"),
                        "enlace": i.get("enlace"), "resumen": r.get("resumen"), "tipo": r.get("tipo")})
        return res

    out = {"configurado": True, "sin_leer": limpiar(sin_leer), "sin_contestar": limpiar(sin_contestar),
           "actualizado": time.strftime("%H:%M")}
    _cache.update(at=time.time(), data=out)
    return out
