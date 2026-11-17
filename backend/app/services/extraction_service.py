"""
Main extraction orchestrator.
Combines PDF/OCR raw extraction with Claude AI intelligent parsing.
"""
import asyncio
import json
import logging
import re
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = """Eres un experto contable y auditor especializado en albaranes y facturas españolas de ferretería y materiales de construcción.

Tu tarea tiene DOS partes: (1) extraer todos los datos del documento y (2) verificar que los totales cuadran.

═══ PARTE 1 — EXTRACCIÓN ═══

REGLAS DE EXTRACCIÓN:
1. Números: el formato español usa coma decimal (1.234,56 → 1234.56). Convierte siempre a float.
2. Descuentos: pueden venir como "30+10+5" (en cascada) o en columnas separadas. Extráelos uno a uno. Ignora sufijos "(i)" o "(n)".
3. Precio neto: si hay columna PRECIO NETO / COSTE NETO ya calculado, úsalo en coste_neto_unitario (no lo recalcules). Si no existe, ponlo null.
4. Columnas TARIFA/PRECIO: TARIFA = precio_unitario_bruto (tarifa de lista). PRECIO = coste_neto_unitario (ya con descuento).
5. Códigos: REF, COD, ART, EAN, código proveedor, código fabricante. Líneas "Cod. Barra: XXXX" → EAN del artículo anterior.
6. IVA: en España es 21%, 10%, 4% o 0%. Recargo de equivalencia: 5.2% (con IVA 21%), 1.4% (10%), 0.5% (4%). Si el documento indica distintos tipos por artículo, respétalos. NUNCA asumas 21% si el documento indica otro valor.
7. Ignora filas que NO sean artículos: cabeceras, referencias internas (PEDIDO:, ALBARÁN:), portes, líneas de IVA, totales.
8. Extrae TODOS los artículos de TODAS las páginas sin excepción.
9. Si un campo no está, ponlo null.
10. PROVEEDOR: es quien EMITE el documento (su nombre suele estar en el logotipo o en la cabecera, junto a su CIF).
    El CLIENTE es siempre Casa Fonso = Manuel Fernández Fernández, NIF 10770071E, de Boal / Villayón (Asturias):
    NUNCA lo pongas como proveedor, aunque sea el primer nombre que aparezca. Si no consigues ver quién emite, pon null.
    Si se te da una lista de PROVEEDORES HABITUALES y el emisor es uno de ellos, escribe el nombre EXACTAMENTE como en la lista.
11. IMAGEN Y TEXTO: si recibes las páginas como imagen y además un texto, MANDA LA IMAGEN. El texto puede venir de un
    escáner y traer cifras cambiadas, comas perdidas («,34» por «8,34»), columnas mezcladas o líneas desordenadas;
    úsalo solo como ayuda. Los códigos de barras (EAN) cópialos dígito a dígito de la imagen.
12. CANTIDAD: las unidades SERVIDAS en este documento (no las pedidas ni las pendientes).
13. PRECIO POR CIEN O POR MIL: si el precio va por 100 o por 1000 unidades (columna «Por», «x100», «%», «‰», «C», «M»),
    da precio_unitario_bruto POR UNIDAD (divídelo) para que cantidad × precio dé el importe de la línea.
14. COMPRUEBA CADA LÍNEA: cantidad × precio neto tiene que dar el IMPORTE impreso en esa línea. Si no da, vuelve a
    mirar cantidad, precio y descuentos de esa línea antes de responder.
15. Líneas que NO son mercancía (portes, embalajes, palés retornables, tasas RAEE o SIGAUS, «contribución financiera»,
    descuentos sueltos): no las pongas como artículos; súmalas en totales_documento.portes.
16. Si el documento es una factura que agrupa varios albaranes, extrae todas sus líneas y usa el número de la factura.

═══ PARTE 2 — TOTALES Y VALIDACIÓN ═══

Después de extraer los artículos, haz lo siguiente:

A) Busca y extrae la sección de totales del documento (suele estar al final):
   - Base imponible total (suma de bases sin IVA ni recargo)
   - Desglose de IVA por tipo: base, porcentaje, cuota
   - Desglose de recargo de equivalencia por tipo (si aplica): base, porcentaje, cuota
   - Portes u otros cargos adicionales (si los hay)
   - Total a pagar del documento

B) Calcula tú mismo la base imponible sumando: coste_neto_unitario × cantidad de cada artículo.

C) Compara tu base calculada con la base imponible del documento.
   - Si cuadran (diferencia ≤ 0.50 €): cuadra = true
   - Si NO cuadran: cuadra = false. Analiza el porqué y enumera las discrepancias concretas:
     * ¿Falta algún artículo? ¿Hay líneas que no has podido leer?
     * ¿Algún descuento mal interpretado? ¿Precio neto diferente al calculado?
     * ¿Hay portes u otros cargos en la base?
     * ¿Diferencias de redondeo acumuladas?

═══ FORMATO DE RESPUESTA (JSON ESTRICTO) ═══

{
  "documento": {
    "proveedor": "nombre del proveedor o null",
    "num_albaran": "número de albarán o null",
    "fecha": "YYYY-MM-DD o null",
    "pronto_pago_pct": null
  },
  "articulos": [
    {
      "linea": 1,
      "descripcion": "descripción del artículo",
      "cantidad": 1.0,
      "precio_unitario_bruto": 10.50,
      "descuento_1": null,
      "descuento_2": null,
      "descuento_3": null,
      "descuento_4": null,
      "coste_neto_unitario": null,
      "iva_pct": 21.0,
      "recargo_pct": null,
      "codigo_proveedor": null,
      "codigo_fabricante": null,
      "ean": null,
      "otros_codigos": {}
    }
  ],
  "totales_documento": {
    "base_imponible": null,
    "iva_desglose": [
      {"pct": 21.0, "base": null, "cuota": null}
    ],
    "recargo_desglose": [],
    "total_iva": null,
    "total_recargo": null,
    "portes": null,
    "total_documento": null
  },
  "validacion": {
    "base_calculada": null,
    "cuadra": null,
    "diferencia": null,
    "discrepancias": [],
    "notas": "Explicación breve del resultado de la validación"
  }
}

Devuelve ÚNICAMENTE el JSON, sin texto adicional, sin markdown, sin bloques de código."""


_conocidos: list = []   # proveedores habituales (los pone documents.py antes de leer)


def poner_conocidos(nombres: list) -> None:
    global _conocidos
    _conocidos = [n for n in (nombres or []) if n][:150]


def _lista_conocidos() -> str:
    return ("PROVEEDORES HABITUALES (si el emisor es uno de estos, escribe su nombre exactamente así): "
            + " · ".join(_conocidos) + "\n") if _conocidos else ""


def build_extraction_prompt(raw_data: dict, supplier_template: Optional[dict] = None) -> str:
    """Build the user prompt for Claude extraction."""
    parts = ["Extrae todos los artículos del siguiente albarán:\n"]

    if supplier_template and supplier_template.get("hints"):
        parts.append(f"HINTS DEL PROVEEDOR: {supplier_template['hints']}\n")
    if _conocidos:
        parts.append(_lista_conocidos())

    if raw_data.get("tables"):
        parts.append("=== TABLAS DETECTADAS ===")
        for i, table in enumerate(raw_data["tables"]):
            parts.append(f"\nTabla {i + 1}:")
            for row in table:
                parts.append(" | ".join(str(cell) for cell in row))

    if raw_data.get("full_text"):
        parts.append("\n=== TEXTO COMPLETO ===")
        parts.append(raw_data["full_text"][:60000])  # antes 16 000: se perdían las últimas páginas y los totales

    return "\n".join(parts)


def detect_supplier(text: str, suppliers: list) -> Optional[dict]:
    """Try to detect supplier from document text by matching keywords."""
    text_lower = text.lower()
    for supplier in suppliers:
        keywords = supplier.get("detection_keywords", [])
        if isinstance(keywords, str):
            keywords = json.loads(keywords)
        if any(kw.lower() in text_lower for kw in keywords if kw):
            return supplier
    return None


def normalize_extracted_articles(raw_articles: list) -> list:
    """Validate and normalize extracted article data."""
    normalized = []
    for i, art in enumerate(raw_articles):
        if not isinstance(art, dict):
            continue
        if not art.get("descripcion"):
            continue

        def to_float(v) -> Optional[float]:
            if v is None:
                return None
            try:
                return float(v)
            except (ValueError, TypeError):
                return None

        normalized.append({
            "line_number": art.get("linea", i + 1),
            "descripcion": str(art.get("descripcion", "")).strip(),
            "cantidad": to_float(art.get("cantidad")) or 1.0,
            "precio_unitario_bruto": to_float(art.get("precio_unitario_bruto")) or 0.0,
            "descuento_1": to_float(art.get("descuento_1")),
            "descuento_2": to_float(art.get("descuento_2")),
            "descuento_3": to_float(art.get("descuento_3")),
            "descuento_4": to_float(art.get("descuento_4")),
            "coste_neto_unitario": to_float(art.get("coste_neto_unitario")),
            "iva_pct": (lambda v: v if v is not None else 21.0)(to_float(art.get("iva_pct"))),
            "recargo_pct": to_float(art.get("recargo_pct")),
            "codigo_proveedor": art.get("codigo_proveedor") or None,
            "codigo_fabricante": art.get("codigo_fabricante") or None,
            "ean": art.get("ean") or None,
            "otros_codigos": art.get("otros_codigos") or {},
        })

        # Determine codigo_principal (priority: EAN > fabricante > proveedor)
        art_norm = normalized[-1]
        art_norm["codigo_principal"] = (
            art_norm["ean"]
            or art_norm["codigo_fabricante"]
            or art_norm["codigo_proveedor"]
            or f"ART-{i + 1:04d}"
        )

    return normalized


# Tope de la respuesta de la IA: unas 100 líneas de albarán. Con 8192 los albaranes largos se cortaban
# y fallaban siempre igual al reintentar.
MAX_SALIDA = 16000


class LecturaError(ValueError):
    """Error para la persona: en español y diciendo qué hacer."""


def mensaje_para_persona(e: Exception) -> str:
    """Lo que se guarda en el albarán cuando no se pudo leer (se enseña en «No se pudo leer este albarán»)."""
    if isinstance(e, LecturaError):
        return str(e)[:500]
    return ("No se pudo leer el albarán. Vuelve a leerlo desde «Más» → «Volver a leer»; si sigue fallando, "
            f"avisa a Andrés. (Detalle: {e})")[:500]


async def _pedir(client, contenido) -> str:
    """Una petición a la IA. Los fallos de la IA salen en español y diciendo qué hacer."""
    import anthropic
    try:
        message = await client.messages.create(
            model=settings.claude_model,
            max_tokens=MAX_SALIDA,
            system=EXTRACTION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": contenido}],
        )
    except anthropic.RateLimitError:
        raise LecturaError("La IA está saturada ahora mismo. Espera un par de minutos y vuelve a leerlo («Más» → «Volver a leer»).")
    except anthropic.APIStatusError as e:
        if e.status_code >= 500:
            raise LecturaError("La IA está saturada o no responde. Vuelve a leerlo en unos minutos («Más» → «Volver a leer»).")
        raise LecturaError(f"La IA no pudo leer el albarán. Vuelve a probar; si sigue, avisa a Andrés. (Detalle: {e.message})")
    except anthropic.APIConnectionError:
        raise LecturaError("No se pudo conectar con la IA. Vuelve a leerlo en unos minutos («Más» → «Volver a leer»).")
    if message.stop_reason == "max_tokens":
        raise LecturaError("El albarán es demasiado largo para leerlo de una vez. Súbelo en dos partes "
                           "(por ejemplo, una foto por cada página).")
    return message.content[0].text.strip()


def _cliente_ia():
    import anthropic
    # Reintenta solo si la IA está saturada un momento (antes, 2 veces)
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, max_retries=4)


async def extract_with_claude(raw_data: dict, supplier_template: Optional[dict] = None) -> dict:
    """Use Claude API to intelligently extract structured data from raw text/tables.

    Returns:
        {"documento": {...}, "articulos": [...]}
    Raises:
        Exception if the API call fails (so callers can set error status).
    """
    if not settings.anthropic_api_key:
        raise LecturaError("Falta la clave de la IA en el servidor. Avisa a Andrés.")

    client = _cliente_ia()

    prompt = build_extraction_prompt(raw_data, supplier_template)

    for attempt in range(2):  # retry once on JSON parse error
        if attempt > 0:
            prompt = prompt + (
                "\n\nIMPORTANTE: Tu respuesta anterior no era JSON válido. "
                "Devuelve ÚNICAMENTE el objeto JSON, sin texto previo ni posterior, "
                "sin bloques de código markdown, sin comillas extra."
            )
        response_text = await _pedir(client, prompt)

        # Strip markdown code blocks if present
        if response_text.startswith("```"):
            response_text = re.sub(r"```[a-z]*\n?", "", response_text).strip().rstrip("`").strip()

        try:
            result = json.loads(response_text)
            return result
        except json.JSONDecodeError as e:
            if attempt == 0:
                logger.warning(f"Claude returned invalid JSON on attempt 1, retrying: {e}")
                continue
            logger.warning("La IA no devolvió JSON válido tras reintentar: %s · %s", e, response_text[:300])
            raise LecturaError("La IA no devolvió bien los datos del albarán. Vuelve a leerlo («Más» → «Volver a leer»).")


def _image_to_base64_block(source) -> dict:
    """Convert a file path or PIL Image to a Claude Vision image content block.

    Resizes to max 2000px (sufficient for OCR quality), encodes as JPEG.
    """
    import base64
    import io
    from PIL import Image, ImageOps

    if isinstance(source, str):
        img = Image.open(source)
    else:
        img = source

    # Apply EXIF orientation (critical for mobile camera photos)
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    img = img.convert("RGB")

    # Resize: max 2000px on longest side — enough detail for printed text
    max_dim = max(img.width, img.height)
    if max_dim > 2000:
        scale = 2000 / max_dim
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    img_bytes = buf.getvalue()

    # Reduce quality if still too large (5MB Claude limit)
    if len(img_bytes) > 4_500_000:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        img_bytes = buf.getvalue()

    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}}


async def extract_with_claude_vision(
    image_sources: list,
    supplier_template: Optional[dict] = None,
    texto_apoyo: str = "",
    aviso: str = "",
) -> dict:
    """Use Claude Vision to extract structured data directly from document images.

    Bypasses pytesseract entirely — Claude reads the images directly.
    Much more accurate for mobile photos, uneven lighting, handwriting, etc.

    Args:
        image_sources: list of file paths (str) or PIL Image objects (max 20)
        supplier_template: optional hints dict

    Returns:
        Same structure as extract_with_claude()
    Raises:
        Exception if API call fails.
    """
    if not settings.anthropic_api_key:
        raise LecturaError("Falta la clave de la IA en el servidor. Avisa a Andrés.")

    client = _cliente_ia()

    # Build image content blocks (Claude allows up to 20 images per request)
    def _bloques() -> list:  # abrir y redimensionar fotos con PIL bloquea: se hace aparte
        out = []
        for src in image_sources[:20]:
            try:
                out.append(_image_to_base64_block(src))
            except Exception as e:
                logger.warning(f"Could not encode image {src}: {e}")
        return out

    content: list = await asyncio.to_thread(_bloques)

    if not content:
        raise ValueError("No se pudo cargar ninguna imagen para el análisis.")

    # Text prompt appended after the images
    hint = ""
    if supplier_template and supplier_template.get("hints"):
        hint = f"\nHINTS DEL PROVEEDOR: {supplier_template['hints']}\n"
    hint += ("\n" + _lista_conocidos()) if _conocidos else ""
    if texto_apoyo.strip():
        hint += ("\n=== TEXTO DEL PDF (solo como ayuda; si no coincide con la imagen, manda la imagen) ===\n"
                 + texto_apoyo[:40000] + "\n")
    if aviso:
        hint += "\n" + aviso + "\n"
    content.append({"type": "text", "text": f"Extrae todos los artículos del albarán que aparece en {'esta imagen' if len(content) == 1 else 'estas imágenes'}:{hint}"})

    retry_content = None
    for attempt in range(2):
        msg_content = retry_content if retry_content else content
        response_text = await _pedir(client, msg_content)
        if response_text.startswith("```"):
            response_text = re.sub(r"```[a-z]*\n?", "", response_text).strip().rstrip("`").strip()

        try:
            result = json.loads(response_text)
            return result
        except json.JSONDecodeError as e:
            if attempt == 0:
                logger.warning(f"Claude Vision returned invalid JSON on attempt 1, retrying: {e}")
                # Second attempt: add only a text block asking for valid JSON
                retry_content = [
                    {"type": "text", "text": (
                        "IMPORTANTE: Tu respuesta anterior no era JSON válido. "
                        "Devuelve ÚNICAMENTE el objeto JSON, sin texto previo ni posterior, "
                        "sin bloques de código markdown.\n\n"
                        f"Extrae todos los artículos del albarán que aparece en {'esta imagen' if len(content) == 1 else 'estas imágenes'}:{hint}"
                    )}
                ] + [b for b in content if b["type"] == "image"]
                continue
            logger.warning("La IA (fotos) no devolvió JSON válido tras reintentar: %s · %s", e, response_text[:300])
            raise LecturaError("La IA no devolvió bien los datos del albarán. Vuelve a leerlo («Más» → «Volver a leer»).")


MAX_PAGINAS_IMAGEN = 12   # páginas que se mandan como imagen (las demás, solo su texto)


def _neto_linea(a: dict) -> float:
    """Coste neto de una línea ya normalizada: el que trae o el bruto con sus descuentos."""
    neto = a.get("coste_neto_unitario")
    if neto is None:
        neto = a.get("precio_unitario_bruto") or 0.0
        for k in ("descuento_1", "descuento_2", "descuento_3", "descuento_4"):
            d = a.get(k)
            if d:
                neto *= 1 - d / 100
    return neto or 0.0


def cuadre(articulos: list, totales: dict) -> Optional[dict]:
    """Suma de las líneas leídas frente a la base imponible impresa. None si el documento no trae base
    (muchos albaranes van sin valorar). Se hace aquí, con números, y no se le pregunta a la IA."""
    def _f(v):
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None
    base = _f((totales or {}).get("base_imponible"))
    if base is None or base <= 0:
        return None
    portes = _f((totales or {}).get("portes")) or 0.0
    suma = round(sum(_neto_linea(a) * (a.get("cantidad") or 1) for a in articulos), 2)
    tolerancia = max(0.5, base * 0.005)
    # la base del documento puede llevar dentro los portes y las tasas
    dif = min((suma - base, suma + portes - base), key=abs)
    return {"suma": suma, "base": base, "dif": round(dif, 2), "ok": abs(dif) <= tolerancia}


def _plantilla(supplier: Optional[dict]) -> Optional[dict]:
    if not supplier:
        return None
    t = supplier.get("template_config")
    if isinstance(t, str):
        try:
            return json.loads(t)
        except (TypeError, ValueError):
            return {}
    return t or {}


async def _leer_imagenes(imagenes: list, plantilla: Optional[dict], texto: str = "") -> dict:
    """Lee las páginas como imagen (con el texto del PDF de apoyo, si lo hay). Si las líneas no suman la
    base del documento, lo vuelve a leer una vez diciéndole a la IA cuánto se descuadra, y se queda con
    la lectura que mejor cuadre."""
    res = await extract_with_claude_vision(imagenes, plantilla, texto)
    arts = normalize_extracted_articles(res.get("articulos", []))
    c = cuadre(arts, res.get("totales_documento") or {})
    releido = False
    if c and not c["ok"]:
        aviso = (f"ATENCIÓN: en una primera lectura las líneas sumaban {c['suma']:.2f} € y la base imponible impresa es "
                 f"{c['base']:.2f} € (diferencia {c['dif']:+.2f} €). Vuelve a leerlo despacio, línea a línea: mira si falta "
                 "o sobra alguna línea, si alguna cantidad o precio está mal copiado, si un precio va por 100 o por 1000 "
                 "unidades y si algún descuento no se aplicó. Cada línea tiene que dar su importe impreso.")
        try:
            res2 = await extract_with_claude_vision(imagenes, plantilla, texto, aviso)
            arts2 = normalize_extracted_articles(res2.get("articulos", []))
            c2 = cuadre(arts2, res2.get("totales_documento") or {})
            releido = True
            if arts2 and c2 and abs(c2["dif"]) < abs(c["dif"]):
                res, arts, c = res2, arts2, c2
        except LecturaError as e:   # la primera lectura vale: se enseña con su aviso de descuadre
            logger.warning("No se pudo releer el albarán que no cuadraba: %s", e)
    validacion = dict(res.get("validacion") or {})
    if c:
        validacion.update({"base_calculada": c["suma"], "cuadra": c["ok"], "diferencia": c["dif"]})
        if c["ok"]:
            validacion["discrepancias"] = []
            if releido:
                validacion["notas"] = "No cuadraba a la primera; se volvió a leer y ya cuadra."
        elif releido:
            validacion["notas"] = ("Se leyó dos veces y las líneas siguen sin sumar la base del documento. "
                                   + str(validacion.get("notas") or "")).strip()
    return {
        "documento": res.get("documento", {}),
        "articulos": arts,
        "totales_documento": res.get("totales_documento") or {},
        "validacion": validacion,
        "releido": releido,
    }


async def extract_multi_images(
    file_paths: list,
    supplier_id: Optional[int] = None,
    suppliers: list = None,
    lang: str = "spa+eng",
) -> dict:
    """Varias fotos de un mismo albarán: la IA las lee directamente."""
    supplier_detected = None
    if suppliers:
        try:
            from app.services import ocr_service
            quick_raw = await asyncio.to_thread(ocr_service.extract, file_paths[0], lang)
            supplier_detected = detect_supplier(quick_raw.get("full_text", ""), suppliers)
        except Exception as e:
            logger.warning(f"Quick OCR for supplier detection failed: {e}")

    out = await _leer_imagenes(file_paths, _plantilla(supplier_detected))
    return {**out, "supplier_detected": supplier_detected, "raw_text": "", "raw_tables": []}


async def extract_document(
    file_path: str,
    doc_type: str,
    supplier_id: Optional[int] = None,
    suppliers: list = None,
    lang: str = "spa+eng",
) -> dict:
    """Lee un albarán de compra.

    Desde nov. 2026 la IA ve SIEMPRE la página como imagen. Antes, un PDF con texto se leía solo por su
    texto; pero los PDF del escáner de la oficina traen un texto reconocido por el propio escáner, con
    cifras cambiadas y columnas mezcladas, y el logotipo del proveedor (a menudo el único sitio donde
    sale su nombre) no está en el texto. El texto se manda igual, como ayuda.

    Returns: {"documento", "articulos", "totales_documento", "validacion", "supplier_detected", "raw_text"}
    """
    from app.services import pdf_service, ocr_service

    if doc_type != "pdf":
        supplier_detected = None
        if suppliers:
            try:
                quick_raw = await asyncio.to_thread(ocr_service.extract, file_path, lang)
                supplier_detected = detect_supplier(quick_raw.get("full_text", ""), suppliers)
            except Exception as e:
                logger.warning(f"Quick OCR for supplier detection failed: {e}")
        out = await _leer_imagenes([file_path], _plantilla(supplier_detected))
        return {**out, "supplier_detected": supplier_detected, "raw_text": "", "raw_tables": []}

    raw_data = await asyncio.to_thread(pdf_service.extract_text_and_tables, file_path)
    texto = raw_data.get("full_text", "") or ""
    n_paginas = len(raw_data.get("pages") or [])
    images = await asyncio.to_thread(pdf_service.pdf_to_images, file_path, 200, MAX_PAGINAS_IMAGEN)

    supplier_detected = None
    if suppliers:
        if len(texto.strip()) > 50:
            supplier_detected = detect_supplier(texto, suppliers)
        elif images:
            try:
                quick_text = await asyncio.to_thread(ocr_service.extract_text_from_pil_image, images[0], lang)
                supplier_detected = detect_supplier(quick_text, suppliers)
            except Exception as e:
                logger.warning(f"Quick OCR for supplier detection failed: {e}")
    plantilla = _plantilla(supplier_detected)

    if images:
        if n_paginas > MAX_PAGINAS_IMAGEN:
            texto = (f"(El documento tiene {n_paginas} páginas; como imagen solo van las {MAX_PAGINAS_IMAGEN} primeras. "
                     "Las demás léelas de este texto.)\n" + texto)
        out = await _leer_imagenes(images[:MAX_PAGINAS_IMAGEN], plantilla, texto)
        return {**out, "supplier_detected": supplier_detected, "raw_text": texto, "raw_tables": raw_data.get("tables", [])}

    # No se pudo pasar a imagen (PDF raro): queda el texto
    if len(texto.strip()) < 100:
        raise LecturaError("No se pudo abrir el PDF para leerlo. Prueba a subir una foto del albarán.")
    logger.warning("PDF sin imágenes (%s): se lee solo por el texto", file_path)
    claude_result = await extract_with_claude(raw_data, plantilla)
    arts = normalize_extracted_articles(claude_result.get("articulos", []))
    validacion = dict(claude_result.get("validacion") or {})
    c = cuadre(arts, claude_result.get("totales_documento") or {})
    if c:
        validacion.update({"base_calculada": c["suma"], "cuadra": c["ok"], "diferencia": c["dif"]})
    return {
        "documento": claude_result.get("documento", {}),
        "articulos": arts,
        "totales_documento": claude_result.get("totales_documento") or {},
        "validacion": validacion,
        "supplier_detected": supplier_detected,
        "raw_text": texto,
        "raw_tables": raw_data.get("tables", []),
    }
