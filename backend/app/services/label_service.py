"""
PDF label generation using reportlab.
Labels: 10cm × 5cm, multiple per A4 page.
"""
import io
import json
import logging
import tempfile
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

# A4 dimensions in mm
A4_W_MM = 210
A4_H_MM = 297

# Label dimensions in mm
LABEL_W_MM = 100
LABEL_H_MM = 50

# Page margins in mm
PAGE_MARGIN_MM = 5
COL_GAP_MM = 2
ROW_GAP_MM = 2


def mm_to_points(mm: float) -> float:
    """Convert millimeters to PDF points (1 pt = 1/72 inch = 0.353 mm)."""
    return mm * 2.8346


def generate_barcode_image(code: str, is_ean: bool = False) -> Optional[bytes]:
    """Generate barcode as PNG bytes."""
    try:
        import barcode
        from barcode.writer import ImageWriter

        buf = io.BytesIO()
        if is_ean and len(code) == 13 and code.isdigit():
            bc = barcode.get("ean13", code, writer=ImageWriter())
        else:
            # Sanitize for Code128 (printable ASCII only)
            code_clean = "".join(c for c in code if 32 <= ord(c) <= 126)
            if not code_clean:
                code_clean = "NO-CODE"
            bc = barcode.get("code128", code_clean, writer=ImageWriter())

        options = {
            "module_width": 0.4,
            "module_height": 8,
            "font_size": 7,
            "text_distance": 2,
            "quiet_zone": 2,
            "dpi": 150,
        }
        bc.write(buf, options=options)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.error(f"Barcode generation failed for '{code}': {e}")
        return None


def generate_qr_image(url: str, size: int = 150) -> Optional[bytes]:
    """Generate QR code as PNG bytes."""
    try:
        import qrcode
        from PIL import Image as PILImage

        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=4,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.error(f"QR generation failed: {e}")
        return None


def truncate_text(text: str, max_chars: int = 50) -> str:
    """Truncate text to max_chars, adding ellipsis."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars - 3] + "..."


def generate_labels_pdf(
    articles: list,
    base_url: str = "http://localhost:3000",
    cols: int = 2,
    rows_per_page: int = 5,
) -> bytes:
    """Generate PDF with labels for all articles.

    Args:
        articles: List of Article ORM objects
        base_url: Base URL for QR codes (e.g. http://localhost:3000)
        cols: Number of label columns per page
        rows_per_page: Number of label rows per page

    Returns:
        PDF as bytes
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
        from reportlab.lib.utils import ImageReader
    except ImportError:
        logger.error("reportlab not installed")
        return b""

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    page_w, page_h = A4  # points
    margin = mm_to_points(PAGE_MARGIN_MM)
    col_gap = mm_to_points(COL_GAP_MM)
    row_gap = mm_to_points(ROW_GAP_MM)

    label_w = mm_to_points(LABEL_W_MM)
    label_h = mm_to_points(LABEL_H_MM)

    labels_per_page = cols * rows_per_page

    for page_start in range(0, len(articles), labels_per_page):
        page_articles = articles[page_start: page_start + labels_per_page]

        for idx, article in enumerate(page_articles):
            col = idx % cols
            row = idx // cols

            # Calculate label top-left corner (PDF coords from bottom-left)
            x = margin + col * (label_w + col_gap)
            y = page_h - margin - (row + 1) * label_h - row * row_gap

            _draw_label(c, article, x, y, label_w, label_h, base_url)

        c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()


def _wrap_words(text: str, font_name: str, font_size: float, max_width: float) -> list:
    """Word-wrap text to fit max_width using real glyph metrics."""
    from reportlab.pdfbase import pdfmetrics
    words = text.split()
    lines: list = []
    current = ""
    for word in words:
        candidate = (current + " " + word).strip()
        if pdfmetrics.stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            # If a single word is already too wide, just add it (truncated)
            if pdfmetrics.stringWidth(word, font_name, font_size) > max_width:
                word = truncate_text(word, int(max_width / (font_size * 0.55)))
            current = word
    if current:
        lines.append(current)
    return lines


def _draw_label(c, article, x: float, y: float, w: float, h: float, base_url: str):
    """Draw a single label on the canvas at position (x, y)."""
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader

    pad = 5  # internal padding (points)

    # ── Layout proportions ─────────────────────────────────────────────
    # Top (description):  46% of height → ~65 pt
    # Middle (PVP + QR):  30%           → ~43 pt
    # Bottom (ref+barcode):24%          → ~34 pt
    desc_h = h * 0.46
    bot_h  = h * 0.24

    mid_top = y + h - desc_h   # divider description / middle  (~y+76)
    bot_top = y + bot_h        # divider middle / bottom        (~y+34)

    # ── Outer border ──────────────────────────────────────────────────
    c.setStrokeColor(colors.HexColor("#BFCFE0"))
    c.setLineWidth(0.6)
    c.rect(x, y, w, h)

    # ── Description background ────────────────────────────────────────
    c.setFillColor(colors.HexColor("#EBF3FB"))
    c.rect(x, mid_top, w, desc_h, fill=1, stroke=0)

    # Left accent bar
    c.setFillColor(colors.HexColor("#1F4E79"))
    c.rect(x, mid_top, 4, desc_h, fill=1, stroke=0)

    # Description text — word-wrapped, max 2 lines, 14pt Bold
    FONT     = "Helvetica-Bold"
    FSIZE    = 14
    LEADING  = 17
    text_x   = x + pad + 5           # after accent bar + small gap
    text_w   = w - pad - 5 - pad     # usable width (remove accent bar + both paddings)

    desc  = article.descripcion or "Sin descripción"
    lines = _wrap_words(desc, FONT, FSIZE, text_w)[:2]

    c.setFont(FONT, FSIZE)
    c.setFillColor(colors.HexColor("#0D2A47"))
    top_baseline = y + h - pad - FSIZE
    for i, line in enumerate(lines):
        c.drawString(text_x, top_baseline - i * LEADING, line)

    # Divider after description
    c.setStrokeColor(colors.HexColor("#BDD5EA"))
    c.setLineWidth(0.4)
    c.line(x, mid_top, x + w, mid_top)

    # ── Middle: PVP (left) + QR (right) ──────────────────────────────
    c.setFont("Helvetica", 6)
    c.setFillColor(colors.HexColor("#7F95A8"))
    c.drawString(x + pad, mid_top - 8, "PVP CON IVA")

    pvp = article.pvp_con_iva
    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(colors.HexColor("#1F4E79"))
    c.drawString(x + pad, mid_top - 24, f"{pvp:.2f} \u20ac")

    c.setFont("Helvetica", 6)
    c.setFillColor(colors.HexColor("#7F95A8"))
    pvp_sin = article.pvp_sin_iva
    c.drawString(x + pad, mid_top - 33, f"Sin IVA: {pvp_sin:.2f} \u20ac  |  IVA: {article.iva_pct:.0f}%")

    # QR code
    qr_size = 54
    product_info_id = getattr(article, "product_info_id", None) or article.id
    qr_url  = f"{base_url}/producto/{product_info_id}"
    qr_bytes = generate_qr_image(qr_url)
    if qr_bytes:
        qr_reader = ImageReader(io.BytesIO(qr_bytes))
        c.drawImage(qr_reader,
                    x + w - qr_size - pad,
                    mid_top - qr_size - 1,
                    width=qr_size, height=qr_size,
                    preserveAspectRatio=True)

    # Divider before bottom
    c.setStrokeColor(colors.HexColor("#D8E4EE"))
    c.setLineWidth(0.4)
    c.line(x, bot_top, x + w, bot_top)

    # ── Bottom: ref text (top) then barcode below ─────────────────────
    # Draw layout bottom-up so nothing overlaps:
    #   y+2  ... y+21  → barcode  (height 19 pt)
    #   y+24 baseline  → "Ref: …" text
    # bot_top is at y+34, so ref text is 10pt below divider line → fine
    code = article.codigo_principal or "N/A"
    c.setFont("Helvetica", 7)
    c.setFillColor(colors.HexColor("#4A5568"))
    c.drawString(x + pad, y + 24, f"Ref: {code}")

    is_ean = bool(article.ean and len(article.ean) == 13 and article.ean.isdigit())
    barcode_code = article.ean if is_ean else (article.codigo_principal or "N/A")
    bc_bytes = generate_barcode_image(barcode_code, is_ean=is_ean)
    if bc_bytes:
        bc_reader = ImageReader(io.BytesIO(bc_bytes))
        bc_w = w * 0.70
        bc_h = 19  # fixed height — safely below ref text baseline
        c.drawImage(bc_reader, x + pad, y + 2,
                    width=bc_w, height=bc_h,
                    preserveAspectRatio=True)
    else:
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.black)
        c.drawString(x + pad, y + 5, barcode_code)
