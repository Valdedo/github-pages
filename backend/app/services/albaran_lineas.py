"""Materiales de un albarán de venta de TreyFACT (valorado o sin valorar), para la orden de carga.

Se saca el texto del PDF (TreyFACT lo da con texto, no es una foto) y la IA devuelve solo
código, cantidad, unidad y descripción. Los precios, descuentos e importes no se guardan:
la hoja de entrega va siempre sin precios.
"""
import io
import json
import logging
import re
from typing import List

import pdfplumber

from app.config import settings

logger = logging.getLogger(__name__)

PROMPT = """Te paso el texto de un albarán de venta de Casa Fonso (almacén de materiales de construcción), \
sacado de un PDF de TreyFACT. Puede estar valorado (con precios) o sin valorar.

Saca SOLO las líneas de material: código del artículo, cantidad, unidad y descripción.
- No pongas precios, descuentos, importes, bases, IVA ni totales.
- Si una descripción ocupa dos renglones, júntala en una sola línea.
- Las líneas de texto sin cantidad que solo son comentarios («PORTES», «ENTREGAR EN…», notas) van en «notas», \
salvo que sean un material o un servicio con cantidad.
- La cantidad es un número (usa punto para los decimales). Si de verdad no tiene, null.
- Unidad: la que ponga el albarán (ud, sacos, m², m³, kg, m, palés…); si no pone ninguna, null.
- Copia la descripción tal cual, en mayúsculas como venga; no la inventes ni la traduzcas.

Devuelve SOLO este JSON, sin nada antes ni después:
{"lineas": [{"codigo": str|null, "cantidad": number|null, "unidad": str|null, "descripcion": str}], "notas": str|null}"""


def texto_pdf(pdf_bytes: bytes) -> str:
    """Texto de todas las páginas, respetando las columnas."""
    partes = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for i, p in enumerate(pdf.pages[:8]):
            t = p.extract_text(layout=True) or p.extract_text() or ""
            partes.append(f"--- Página {i + 1} ---\n{t}")
    # Quita los espacios de sobra a la derecha y las líneas vacías seguidas
    txt = "\n".join(re.sub(r"[ \t]+$", "", ln) for ln in "\n".join(partes).splitlines())
    return re.sub(r"\n{3,}", "\n\n", txt)


def _json(t: str) -> dict:
    t = t.strip()
    if t.startswith("```"):
        t = re.sub(r"```[a-z]*\n?", "", t).strip().rstrip("`").strip()
    i, j = t.find("{"), t.rfind("}")
    return json.loads(t[i:j + 1] if i >= 0 and j > i else t)


def _limpiar(datos: dict) -> List[dict]:
    out = []
    for ln in datos.get("lineas") or []:
        desc = " ".join(str(ln.get("descripcion") or "").split())
        if not desc:
            continue
        cant = ln.get("cantidad")
        try:
            cant = float(str(cant).replace(",", ".")) if cant not in (None, "") else None
        except ValueError:
            cant = None
        out.append({
            "codigo": (str(ln.get("codigo")).strip()[:40] or None) if ln.get("codigo") else None,
            "cantidad": cant if cant is None or cant > 0 else None,
            "unidad": (str(ln.get("unidad")).strip()[:30] or None) if ln.get("unidad") else None,
            "descripcion": desc[:400],
            # Cantidad cero o negativa (devoluciones) o sin cantidad: que lo mire una persona
            "duda": None if cant and cant > 0 else ("Sin cantidad en el albarán" if cant is None else "Cantidad 0 o negativa en el albarán"),
        })
    return out


async def leer(pdf_bytes: bytes) -> dict:
    """{"lineas": [...], "notas": str|None}. Lanza ValueError con un mensaje para la persona."""
    texto = texto_pdf(pdf_bytes)
    if len(texto.replace("-", "").split()) < 10:
        raise ValueError("El PDF no tiene texto (parece escaneado). Expórtalo otra vez desde TreyFACT.")
    if not settings.anthropic_api_key:
        raise ValueError("Falta la clave de la IA en el servidor (ANTHROPIC_API_KEY).")
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    pedir = f"Este es el texto del albarán:\n\n{texto[:30000]}"
    ultimo = ""
    for _ in range(2):
        msg = await client.messages.create(
            model=settings.claude_model, max_tokens=4096, system=PROMPT,
            messages=[{"role": "user", "content": pedir}],
        )
        ultimo = msg.content[0].text
        try:
            datos = _json(ultimo)
            if isinstance(datos.get("lineas"), list):
                return {"lineas": _limpiar(datos), "notas": (datos.get("notas") or None)}
        except Exception:
            pass
        pedir += "\n\nResponde SOLO con el JSON pedido."
    logger.warning("La IA no devolvió las líneas del albarán: %s", ultimo[:300])
    raise ValueError("No se pudieron leer los materiales del albarán. Prueba otra vez.")
