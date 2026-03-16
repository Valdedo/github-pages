"""
PDF text and table extraction using pdfplumber.
Handles digital PDFs only. For scanned PDFs, use ocr_service.
"""
import io
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def is_scanned_pdf(file_path: str) -> bool:
    """Check if a PDF is scanned (image-based) rather than digital."""
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages[:3]:  # check first 3 pages
                text = page.extract_text() or ""
                if len(text.strip()) > 50:
                    return False
        return True
    except Exception:
        return True


def extract_text_and_tables(file_path: str) -> dict:
    """Extract text and tables from a digital PDF.

    Returns:
        {
            "full_text": "...",
            "pages": [{"text": "...", "tables": [[...], ...]}],
            "tables": [[[...], ...]],   # all tables from all pages
        }
    """
    try:
        import pdfplumber
    except ImportError:
        logger.error("pdfplumber not installed")
        return {"full_text": "", "pages": [], "tables": []}

    result = {
        "full_text": "",
        "pages": [],
        "tables": [],
    }

    try:
        with pdfplumber.open(file_path) as pdf:
            all_text_parts = []
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text() or ""
                all_text_parts.append(page_text)

                # Extract tables from this page
                tables = page.extract_tables() or []
                cleaned_tables = []
                for table in tables:
                    # Remove None cells, normalize to strings
                    cleaned = [
                        [str(cell).strip() if cell is not None else "" for cell in row]
                        for row in table
                        if any(cell for cell in row)
                    ]
                    if cleaned:
                        cleaned_tables.append(cleaned)

                result["pages"].append({
                    "page_number": i + 1,
                    "text": page_text,
                    "tables": cleaned_tables,
                })
                result["tables"].extend(cleaned_tables)

            result["full_text"] = "\n\n--- PÁGINA {} ---\n\n".join(
                str(i + 1) for i in range(len(all_text_parts))
            )
            result["full_text"] = "\n\n".join(all_text_parts)

    except Exception as e:
        logger.error(f"Error extracting PDF {file_path}: {e}")
        result["error"] = str(e)

    return result


def pdf_to_images(file_path: str, dpi: int = 200) -> list:
    """Convert PDF pages to PIL images for OCR fallback."""
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(file_path, dpi=dpi)
        return images
    except Exception as e:
        logger.error(f"Error converting PDF to images: {e}")
        return []
