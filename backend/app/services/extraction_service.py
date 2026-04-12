"""
Main extraction orchestrator.
Combines PDF/OCR raw extraction with Claude AI intelligent parsing.
"""
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


def build_extraction_prompt(raw_data: dict, supplier_template: Optional[dict] = None) -> str:
    """Build the user prompt for Claude extraction."""
    parts = ["Extrae todos los artículos del siguiente albarán:\n"]

    if supplier_template and supplier_template.get("hints"):
        parts.append(f"HINTS DEL PROVEEDOR: {supplier_template['hints']}\n")

    if raw_data.get("tables"):
        parts.append("=== TABLAS DETECTADAS ===")
        for i, table in enumerate(raw_data["tables"]):
            parts.append(f"\nTabla {i + 1}:")
            for row in table:
                parts.append(" | ".join(str(cell) for cell in row))

    if raw_data.get("full_text"):
        parts.append("\n=== TEXTO COMPLETO ===")
        parts.append(raw_data["full_text"][:16000])  # limit to avoid token overflow

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


async def extract_with_claude(raw_data: dict, supplier_template: Optional[dict] = None) -> dict:
    """Use Claude API to intelligently extract structured data from raw text/tables.

    Returns:
        {"documento": {...}, "articulos": [...]}
    Raises:
        Exception if the API call fails (so callers can set error status).
    """
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY no está configurada. Ve a los ajustes del servidor.")

    import anthropic
    # Use AsyncAnthropic so we don't block the event loop during the API call
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    prompt = build_extraction_prompt(raw_data, supplier_template)

    for attempt in range(2):  # retry once on JSON parse error
        if attempt > 0:
            prompt = prompt + (
                "\n\nIMPORTANTE: Tu respuesta anterior no era JSON válido. "
                "Devuelve ÚNICAMENTE el objeto JSON, sin texto previo ni posterior, "
                "sin bloques de código markdown, sin comillas extra."
            )
        message = await client.messages.create(
            model=settings.claude_model,
            max_tokens=8192,
            system=EXTRACTION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text.strip()

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
            raise ValueError(f"Claude devolvió JSON inválido tras reintento: {e}\nRespuesta: {response_text[:300]}")


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
        raise ValueError("ANTHROPIC_API_KEY no está configurada. Ve a los ajustes del servidor.")

    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    # Build image content blocks (Claude allows up to 20 images per request)
    content: list = []
    for src in image_sources[:20]:
        try:
            content.append(_image_to_base64_block(src))
        except Exception as e:
            logger.warning(f"Could not encode image {src}: {e}")

    if not content:
        raise ValueError("No se pudo cargar ninguna imagen para el análisis.")

    # Text prompt appended after the images
    hint = ""
    if supplier_template and supplier_template.get("hints"):
        hint = f"\nHINTS DEL PROVEEDOR: {supplier_template['hints']}\n"
    content.append({"type": "text", "text": f"Extrae todos los artículos del albarán que aparece en {'esta imagen' if len(content) == 1 else 'estas imágenes'}:{hint}"})

    retry_content = None
    for attempt in range(2):
        msg_content = retry_content if retry_content else content
        message = await client.messages.create(
            model=settings.claude_model,
            max_tokens=8192,
            system=EXTRACTION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": msg_content}],
        )

        response_text = message.content[0].text.strip()
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
            raise ValueError(f"Claude Vision devolvió JSON inválido tras reintento: {e}\nRespuesta: {response_text[:300]}")


async def extract_multi_images(
    file_paths: list,
    supplier_id: Optional[int] = None,
    suppliers: list = None,
    lang: str = "spa+eng",
) -> dict:
    """Extract from multiple image files using Claude Vision (bypasses pytesseract)."""
    # Detect supplier by reading a quick OCR pass on first image (for keyword matching)
    supplier_detected = None
    supplier_template = None
    if suppliers:
        try:
            from app.services import ocr_service
            quick_raw = ocr_service.extract(file_paths[0], lang)
            supplier_detected = detect_supplier(quick_raw.get("full_text", ""), suppliers)
            if supplier_detected and isinstance(supplier_detected.get("template_config"), str):
                supplier_template = json.loads(supplier_detected["template_config"])
            elif supplier_detected:
                supplier_template = supplier_detected.get("template_config", {})
        except Exception as e:
            logger.warning(f"Quick OCR for supplier detection failed: {e}")

    claude_result = await extract_with_claude_vision(file_paths, supplier_template)
    raw_articles = claude_result.get("articulos", [])
    normalized_articles = normalize_extracted_articles(raw_articles)

    return {
        "documento": claude_result.get("documento", {}),
        "articulos": normalized_articles,
        "totales_documento": claude_result.get("totales_documento") or {},
        "validacion": claude_result.get("validacion") or {},
        "supplier_detected": supplier_detected,
        "raw_text": "",
        "raw_tables": [],
    }


async def extract_document(
    file_path: str,
    doc_type: str,
    supplier_id: Optional[int] = None,
    suppliers: list = None,
    lang: str = "spa+eng",
) -> dict:
    """Main document extraction pipeline.

    1. Extract raw content (text + tables)
    2. Detect supplier (optional)
    3. Use Claude AI to extract structured data
    4. Normalize and validate

    Returns:
        {
            "documento": {supplier, num_albaran, fecha, pronto_pago_pct},
            "articulos": [...normalized articles...],
            "supplier_detected": {...} or None,
            "raw_text": "...",
        }
    """
    from app.services import pdf_service, ocr_service

    # Step 1: Determine extraction strategy
    if doc_type == "pdf":
        from app.services.pdf_service import is_scanned_pdf, pdf_to_images
        if is_scanned_pdf(file_path):
            # Scanned PDF → convert pages to images → Claude Vision
            logger.info(f"Detected scanned PDF, using Claude Vision for {file_path}")
            images = pdf_to_images(file_path)
            if not images:
                raise ValueError("No se pudieron extraer páginas del PDF escaneado.")

            # Detect supplier via quick OCR on first page
            supplier_detected = None
            supplier_template = None
            if suppliers:
                try:
                    quick_text = ocr_service.extract_text_from_pil_image(images[0], lang)
                    supplier_detected = detect_supplier(quick_text, suppliers)
                    if supplier_detected and isinstance(supplier_detected.get("template_config"), str):
                        supplier_template = json.loads(supplier_detected["template_config"])
                    elif supplier_detected:
                        supplier_template = supplier_detected.get("template_config", {})
                except Exception as e:
                    logger.warning(f"Quick OCR for supplier detection failed: {e}")

            claude_result = await extract_with_claude_vision(images, supplier_template)
            raw_articles = claude_result.get("articulos", [])
            normalized_articles = normalize_extracted_articles(raw_articles)
            return {
                "documento": claude_result.get("documento", {}),
                "articulos": normalized_articles,
                "totales_documento": claude_result.get("totales_documento") or {},
                "validacion": claude_result.get("validacion") or {},
                "supplier_detected": supplier_detected,
                "raw_text": "",
                "raw_tables": [],
            }
        else:
            # Digital PDF → pdfplumber text extraction → Claude text
            logger.info(f"Detected digital PDF, using pdfplumber for {file_path}")
            raw_data = pdf_service.extract_text_and_tables(file_path)
            # Fallback: if little text was extracted, try Vision
            if len(raw_data.get("full_text", "")) < 100:
                logger.info("Low text yield from pdfplumber, falling back to Claude Vision")
                images = pdf_to_images(file_path)
                if images:
                    supplier_detected = None
                    supplier_template = None
                    claude_result = await extract_with_claude_vision(images, None)
                    raw_articles = claude_result.get("articulos", [])
                    return {
                        "documento": claude_result.get("documento", {}),
                        "articulos": normalize_extracted_articles(raw_articles),
                        "totales_documento": claude_result.get("totales_documento") or {},
                        "validacion": claude_result.get("validacion") or {},
                        "supplier_detected": None,
                        "raw_text": "",
                        "raw_tables": [],
                    }

            # Detect supplier from extracted text
            supplier_detected = None
            supplier_template = None
            if suppliers:
                supplier_detected = detect_supplier(raw_data.get("full_text", ""), suppliers)
                if supplier_detected and isinstance(supplier_detected.get("template_config"), str):
                    supplier_template = json.loads(supplier_detected["template_config"])
                elif supplier_detected:
                    supplier_template = supplier_detected.get("template_config", {})

            claude_result = await extract_with_claude(raw_data, supplier_template)
            raw_articles = claude_result.get("articulos", [])
            normalized_articles = normalize_extracted_articles(raw_articles)
            return {
                "documento": claude_result.get("documento", {}),
                "articulos": normalized_articles,
                "totales_documento": claude_result.get("totales_documento") or {},
                "validacion": claude_result.get("validacion") or {},
                "supplier_detected": supplier_detected,
                "raw_text": raw_data.get("full_text", ""),
                "raw_tables": raw_data.get("tables", []),
            }
    else:
        # Image file → Claude Vision directly (no pytesseract)
        logger.info(f"Image file, using Claude Vision for {file_path}")

        # Detect supplier via quick OCR (lightweight, for keyword matching only)
        supplier_detected = None
        supplier_template = None
        if suppliers:
            try:
                quick_raw = ocr_service.extract(file_path, lang)
                supplier_detected = detect_supplier(quick_raw.get("full_text", ""), suppliers)
                if supplier_detected and isinstance(supplier_detected.get("template_config"), str):
                    supplier_template = json.loads(supplier_detected["template_config"])
                elif supplier_detected:
                    supplier_template = supplier_detected.get("template_config", {})
            except Exception as e:
                logger.warning(f"Quick OCR for supplier detection failed: {e}")

        claude_result = await extract_with_claude_vision([file_path], supplier_template)
        raw_articles = claude_result.get("articulos", [])
        normalized_articles = normalize_extracted_articles(raw_articles)
        return {
            "documento": claude_result.get("documento", {}),
            "articulos": normalized_articles,
            "totales_documento": claude_result.get("totales_documento") or {},
            "validacion": claude_result.get("validacion") or {},
            "supplier_detected": supplier_detected,
            "raw_text": "",
            "raw_tables": [],
        }
