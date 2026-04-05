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


# CALZETYNUS cipher: C=1, A=2, L=3, Z=4, E=5, T=6, Y=7, N=8, U=9, S=0
_CALZETYNUS = {
    '1': 'C', '2': 'A', '3': 'L', '4': 'Z', '5': 'E',
    '6': 'T', '7': 'Y', '8': 'N', '9': 'U', '0': 'S',
}


def encode_calzetynus(cost: float) -> str:
    """Encode a price using the CALZETYNUS internal cipher.

    Example: 12.50 → 'CA.ES'
    The decimal point is preserved as-is.
    """
    formatted = f"{cost:.2f}"
    return "".join(_CALZETYNUS.get(c, c) for c in formatted)


def generate_labels_pdf(
    articles: list,
    base_url: str = "http://localhost:3000",
    cols: int = 2,
    rows_per_page: int = 5,
    copies: int = 1,
    company_name: str = "",
) -> bytes:
    """Generate PDF with labels for all articles.

    Args:
        articles: List of Article ORM objects
        base_url: Base URL for QR codes
        cols: Number of label columns per page
        rows_per_page: Number of label rows per page
        copies: Number of copies per article label
        company_name: Company name printed on each label

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

    # Expand list respecting copies
    expanded = []
    for article in articles:
        for _ in range(max(1, copies)):
            expanded.append(article)

    for page_start in range(0, len(expanded), labels_per_page):
        page_articles = expanded[page_start: page_start + labels_per_page]

        for idx, article in enumerate(page_articles):
            col = idx % cols
            row = idx // cols

            x = margin + col * (label_w + col_gap)
            y = page_h - margin - (row + 1) * label_h - row * row_gap

            _draw_label(c, article, x, y, label_w, label_h, base_url, company_name)

        c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()


def _draw_logo_badge(c, lx: float, ly: float, lw: float, lh: float,
                     company_name: str = "", watermark: bool = False):
    """Draw a professional company badge (rounded rectangle with initials).

    Args:
        lx, ly      : bottom-left corner of the bounding box (PDF coords, y upward)
        lw, lh      : width and height of the bounding box
        company_name: used to derive initials (up to 2 chars)
        watermark   : if True draw as a very light background watermark
    """
    from reportlab.lib import colors

    r = min(lw, lh) * 0.22  # corner radius

    if watermark:
        bg_color   = colors.HexColor("#ECECEC")
        text_color = colors.HexColor("#CCCCCC")
    else:
        bg_color   = colors.HexColor("#1A5276")  # deep navy blue
        text_color = colors.white

    # Derive initials: first letter of first two words
    words = [w for w in company_name.upper().split() if w]
    if len(words) >= 2:
        initials = words[0][0] + words[1][0]
    elif len(words) == 1:
        initials = words[0][:2]
    else:
        initials = "CO"

    c.saveState()

    # Rounded rectangle background
    c.setFillColor(bg_color)
    c.roundRect(lx, ly, lw, lh, r, fill=1, stroke=0)

    # Initials text centred in the badge
    font_size = lh * 0.52
    c.setFont("Helvetica-Bold", font_size)
    c.setFillColor(text_color)
    from reportlab.pdfbase import pdfmetrics
    text_w = pdfmetrics.stringWidth(initials, "Helvetica-Bold", font_size)
    c.drawString(lx + (lw - text_w) / 2, ly + (lh - font_size) / 2 + font_size * 0.12,
                 initials)

    c.restoreState()


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


def _draw_label(c, article, x: float, y: float, w: float, h: float, base_url: str, company_name: str = ""):
    """Draw a single label on the canvas at position (x, y).

    Layout (inspired by reference design):
      ┌────────────────────────────────────────────────────────────┐
      │  [LOGO]   NOMBRE DEL PRODUCTO EN NEGRITA               │
      │           (segunda línea si es largo)   [watermark bg]    │
      ├────────────────────────────────────────────────────────────│
      │  98,40 €              [QR]         [  CÓDIGO DE BARRAS ]  │
      │  REF: 82325778                     [  CÓDIGO DE BARRAS ]  │
      │  calzetynus                        [  CÓDIGO DE BARRAS ]  │
      └────────────────────────────────────────────────────────────┘
    """
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader

    pad = 6   # internal padding in points

    # ── White background ──────────────────────────────────────────
    c.setFillColor(colors.white)
    c.rect(x, y, w, h, fill=1, stroke=0)

    # ── Watermark badge (large, centered, very light gray) ───────
    wm_sz = h * 0.72
    wm_x  = x + w * 0.50 - wm_sz * 0.50
    wm_y  = y + (h - wm_sz) * 0.50
    _draw_logo_badge(c, wm_x, wm_y, wm_sz, wm_sz, company_name=company_name, watermark=True)

    # ── Outer border ──────────────────────────────────────────────
    c.setStrokeColor(colors.HexColor("#888888"))
    c.setLineWidth(0.8)
    c.rect(x, y, w, h, fill=0, stroke=1)

    # ── Horizontal divider (46 % from bottom) ────────────────────
    divider_y = y + h * 0.46
    c.setStrokeColor(colors.HexColor("#BBBBBB"))
    c.setLineWidth(0.5)
    c.line(x, divider_y, x + w, divider_y)

    # ═══════════════ TOP SECTION ═════════════════════════════════
    top_h = (y + h) - divider_y        # height of the top section

    # Logo badge – square, vertically centred inside top section
    logo_sz = top_h * 0.74
    logo_x  = x + pad
    logo_y  = divider_y + (top_h - logo_sz) / 2
    _draw_logo_badge(c, logo_x, logo_y, logo_sz, logo_sz, company_name=company_name)

    # Product description – uppercase bold, right of logo
    desc_x  = logo_x + logo_sz + pad * 1.5
    desc_w  = w - (desc_x - x) - pad
    desc    = (article.descripcion or "Sin descripción").upper()
    FONT    = "Helvetica-Bold"
    FSIZE   = 13
    LEAD    = 15

    lines = _wrap_words(desc, FONT, FSIZE, desc_w)[:2]
    c.setFont(FONT, FSIZE)
    c.setFillColor(colors.HexColor("#111111"))
    top_baseline = y + h - pad - FSIZE
    for i, line in enumerate(lines):
        c.drawString(desc_x, top_baseline - i * LEAD, line)

    # ═══════════════ BOTTOM SECTION ══════════════════════════════
    bot_h = divider_y - y   # ≈ 65 pt

    # Price (large, prominent)
    pvp     = article.pvp_con_iva
    pvp_str = f"{pvp:.2f}".replace(".", ",") + " \u20ac"
    FSIZE_PVP = 20
    price_y   = divider_y - FSIZE_PVP - pad
    c.setFont("Helvetica-Bold", FSIZE_PVP)
    c.setFillColor(colors.black)
    c.drawString(x + pad, price_y, pvp_str)

    # Reference
    code      = article.codigo_principal or "N/A"
    FSIZE_REF = 11
    ref_y     = price_y - FSIZE_REF - 4
    c.setFont("Helvetica-Bold", FSIZE_REF)
    c.setFillColor(colors.HexColor("#111111"))
    c.drawString(x + pad, ref_y, f"REF: {code}")

    # CALZETYNUS cost code – more visible (medium gray, readable)
    coste = getattr(article, "coste_neto_unitario", None)
    if coste is not None and coste > 0:
        encoded  = encode_calzetynus(coste)
        calz_y   = ref_y - 7 - 3
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#777777"))
        c.drawString(x + pad, calz_y, encoded)

    # ── Barcode – right side of bottom section ────────────────────
    bc_area_w = w * 0.44
    bc_x      = x + w - bc_area_w - pad * 0.5
    bc_h_draw = bot_h - pad

    is_ean       = bool(article.ean and len(article.ean) == 13 and article.ean.isdigit())
    barcode_code = article.ean if is_ean else (article.codigo_principal or "N/A")
    bc_bytes     = generate_barcode_image(barcode_code, is_ean=is_ean)

    if bc_bytes:
        bc_reader = ImageReader(io.BytesIO(bc_bytes))
        c.drawImage(bc_reader, bc_x, y + pad * 0.5,
                    width=bc_area_w, height=bc_h_draw,
                    preserveAspectRatio=True)
    else:
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.black)
        c.drawString(bc_x, y + pad, barcode_code)

    # ── QR code – links to product sheet page ────────────────────
    qr_size = bot_h - pad * 2.5
    code    = article.ean if (article.ean and len(article.ean) >= 8) else (article.codigo_principal or "N/A")
    qr_url  = f"{base_url}/api/products/ficha/{code}"
    qr_bytes = generate_qr_image(qr_url)
    qr_x     = bc_x - qr_size - pad

    if qr_bytes:
        qr_reader = ImageReader(io.BytesIO(qr_bytes))
        c.drawImage(qr_reader, qr_x, y + (bot_h - qr_size) / 2,
                    width=qr_size, height=qr_size,
                    preserveAspectRatio=True)
