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

EXTRACTION_SYSTEM_PROMPT = """Eres un experto en procesar albaranes y facturas españolas de ferretería y materiales de construcción.

Tu tarea es extraer la información estructurada de un albarán o factura en formato JSON estricto.

REGLAS IMPORTANTES:
1. Los números en formato español usan coma como separador decimal (1.234,56 = 1234.56). Conviértelos a float estándar.
2. Los descuentos pueden venir como "30+10+5" o en columnas separadas. Extráelos individualmente. Ignora sufijos como "(i)" o "(n)" en los porcentajes de descuento.
3. Si hay un precio neto ya calculado (columna PRECIO o COSTE NETO), úsalo como coste_neto_unitario; si no, déjalo nulo (se calculará).
4. Los códigos pueden aparecer como REF, COD, ART, EAN, código proveedor, código fabricante. Las líneas "Cod. Barra: XXXX" contienen el EAN del artículo anterior.
5. El IVA en España es generalmente 21%, 10%, 4% o 0% (exento). Si el albarán indica expresamente 0%, exento, o no menciona IVA para un artículo específico, usa 0.0. El recargo de equivalencia es 5.2%, 1.4% o 0.5%. NUNCA asumas 21% si el documento indica otro valor o 0%.
6. En facturas con columnas TARIFA/PRECIO: TARIFA = precio_unitario_bruto (precio de lista), PRECIO = coste_neto_unitario (precio neto ya aplicado descuento).
7. Ignora filas que no sean artículos: cabeceras de tabla, referencias a pedidos/albaranes internos (PEDIDO:, ALBARÁN:), totales, subtotales, portes, IVA, etc.
8. Extrae TODOS los artículos del documento, incluyendo los de páginas múltiples. No te detengas antes de procesar todas las líneas.
9. Si no encuentras un campo, ponlo como null.
10. Devuelve ÚNICAMENTE el JSON, sin texto adicional, sin markdown, sin bloques de código.

FORMATO DE RESPUESTA:
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
  ]
}"""


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
    """
    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set, using fallback extraction")
        return {"documento": {}, "articulos": []}

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        prompt = build_extraction_prompt(raw_data, supplier_template)

        for attempt in range(2):  # retry once on JSON parse error
            if attempt > 0:
                prompt = prompt + (
                    "\n\nIMPORTANTE: Tu respuesta anterior no era JSON válido. "
                    "Devuelve ÚNICAMENTE el objeto JSON, sin texto previo ni posterior, "
                    "sin bloques de código markdown, sin comillas extra."
                )
            message = client.messages.create(
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
                logger.error(f"Claude returned invalid JSON after retry: {e}")
                return {"documento": {}, "articulos": []}

    except Exception as e:
        logger.error(f"Claude extraction failed: {e}")
        return {"documento": {}, "articulos": []}


async def extract_multi_images(
    file_paths: list,
    supplier_id: Optional[int] = None,
    suppliers: list = None,
    lang: str = "spa+eng",
) -> dict:
    """Extract from multiple image files combined as a single multi-page document."""
    from app.services import ocr_service

    all_text_parts = []
    all_tables = []

    for i, path in enumerate(file_paths):
        raw = ocr_service.extract(path, lang)
        if raw.get("full_text"):
            all_text_parts.append(f"=== PÁGINA {i + 1} ===\n{raw['full_text']}")
        if raw.get("tables"):
            all_tables.extend(raw["tables"])

    combined_raw = {
        "full_text": "\n\n".join(all_text_parts),
        "tables": all_tables,
    }

    # Detect supplier
    supplier_detected = None
    supplier_template = None
    if suppliers:
        supplier_detected = detect_supplier(combined_raw.get("full_text", ""), suppliers)
        if supplier_detected and isinstance(supplier_detected.get("template_config"), str):
            supplier_template = json.loads(supplier_detected["template_config"])
        elif supplier_detected:
            supplier_template = supplier_detected.get("template_config", {})

    claude_result = await extract_with_claude(combined_raw, supplier_template)
    raw_articles = claude_result.get("articulos", [])
    normalized_articles = normalize_extracted_articles(raw_articles)

    return {
        "documento": claude_result.get("documento", {}),
        "articulos": normalized_articles,
        "supplier_detected": supplier_detected,
        "raw_text": combined_raw.get("full_text", ""),
        "raw_tables": combined_raw.get("tables", []),
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

    # Step 1: Extract raw content
    if doc_type == "pdf":
        from app.services.pdf_service import is_scanned_pdf
        if is_scanned_pdf(file_path):
            logger.info(f"Detected scanned PDF, using OCR for {file_path}")
            raw_data = ocr_service.extract(file_path, lang)
        else:
            logger.info(f"Detected digital PDF, using pdfplumber for {file_path}")
            raw_data = pdf_service.extract_text_and_tables(file_path)
            # Fallback: if little text was extracted, try OCR
            if len(raw_data.get("full_text", "")) < 100:
                logger.info("Low text yield, falling back to OCR")
                raw_data = ocr_service.extract(file_path, lang)
    else:
        # image file
        raw_data = ocr_service.extract(file_path, lang)

    # Step 2: Detect supplier
    supplier_detected = None
    supplier_template = None
    if suppliers:
        supplier_detected = detect_supplier(raw_data.get("full_text", ""), suppliers)
        if supplier_detected and isinstance(supplier_detected.get("template_config"), str):
            supplier_template = json.loads(supplier_detected["template_config"])
        elif supplier_detected:
            supplier_template = supplier_detected.get("template_config", {})

    # Step 3: Claude AI extraction
    claude_result = await extract_with_claude(raw_data, supplier_template)

    # Step 4: Normalize articles
    raw_articles = claude_result.get("articulos", [])
    normalized_articles = normalize_extracted_articles(raw_articles)

    documento = claude_result.get("documento", {})

    return {
        "documento": documento,
        "articulos": normalized_articles,
        "supplier_detected": supplier_detected,
        "raw_text": raw_data.get("full_text", ""),
        "raw_tables": raw_data.get("tables", []),
    }
