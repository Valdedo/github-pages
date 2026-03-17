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


def _draw_label(c, article, x: float, y: float, w: float, h: float, base_url: str):
    """Draw a single label on the canvas at position (x, y)."""
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as rl_canvas

    # Border
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.5)
    c.rect(x, y, w, h)

    # Internal padding
    pad = 5  # points

    # === Description (top section, 36% height) ===
    desc_h = h * 0.36
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(colors.black)

    desc = article.descripcion or "Sin descripción"
    # Draw up to 2 lines of ~45 chars each at font size 9
    max_line_chars = 45
    if len(desc) > max_line_chars:
        line1 = desc[:max_line_chars]
        line2 = truncate_text(desc[max_line_chars:], max_line_chars)
        c.drawString(x + pad, y + h - pad - 10, line1)
        c.drawString(x + pad, y + h - pad - 22, line2)
    else:
        c.drawString(x + pad, y + h - pad - 10, desc)

    # Separator line
    c.setStrokeColor(colors.lightgrey)
    c.setLineWidth(0.3)
    c.line(x + pad, y + h - desc_h, x + w - pad, y + h - desc_h)

    # === PVP (middle-left, large font) ===
    pvp_section_top = y + h - desc_h
    pvp_h = h * 0.34

    pvp = article.pvp_con_iva
    pvp_str = f"{pvp:.2f} €"

    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(colors.HexColor("#1F4E79"))
    c.drawString(x + pad, pvp_section_top - 22, pvp_str)

    # PVP label
    c.setFont("Helvetica", 6)
    c.setFillColor(colors.grey)
    c.drawString(x + pad, pvp_section_top - 30, "PVP con IVA")

    # IVA info
    c.setFont("Helvetica", 6)
    c.setFillColor(colors.grey)
    pvp_sin = article.pvp_sin_iva
    c.drawString(x + pad, pvp_section_top - 39, f"Sin IVA: {pvp_sin:.2f} € | IVA: {article.iva_pct:.0f}%")

    # === QR code (middle-right) ===
    qr_size = 50  # points
    product_info_id = getattr(article, "product_info_id", None) or article.id
    qr_url = f"{base_url}/producto/{product_info_id}"

    qr_bytes = generate_qr_image(qr_url)
    if qr_bytes:
        qr_reader = ImageReader(io.BytesIO(qr_bytes))
        c.drawImage(
            qr_reader,
            x + w - qr_size - pad,
            pvp_section_top - qr_size - 2,
            width=qr_size,
            height=qr_size,
            preserveAspectRatio=True,
        )

    # Separator line
    c.setStrokeColor(colors.lightgrey)
    c.setLineWidth(0.3)
    c.line(x + pad, y + h * 0.26, x + w - pad, y + h * 0.26)

    # === Bottom section: code + barcode ===
    bottom_top = y + h * 0.26

    # Code text
    code = article.codigo_principal or "N/A"
    c.setFont("Helvetica", 6)
    c.setFillColor(colors.black)
    c.drawString(x + pad, bottom_top - 10, f"Ref: {code}")

    # Barcode
    is_ean = bool(article.ean and len(article.ean) == 13 and article.ean.isdigit())
    barcode_code = article.ean if is_ean else (article.codigo_principal or "N/A")

    bc_bytes = generate_barcode_image(barcode_code, is_ean=is_ean)
    if bc_bytes:
        bc_reader = ImageReader(io.BytesIO(bc_bytes))
        bc_w = w * 0.65
        bc_h = h * 0.22
        c.drawImage(
            bc_reader,
            x + pad,
            y + pad,
            width=bc_w,
            height=bc_h,
            preserveAspectRatio=True,
        )
    else:
        # Fallback: draw code text if barcode fails
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.black)
        c.drawString(x + pad, y + pad + 5, barcode_code)
