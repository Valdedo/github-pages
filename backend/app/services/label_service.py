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
        bg_color   = colors.HexColor("#1B5E20")  # verde oscuro empresa
        text_color = colors.white

    # Derive initials: first letter of first two words
    words = [w for w in company_name.upper().split() if w]
    if len(words) >= 2:
        initials = words[0][0] + words[1][0]
    elif len(words) == 1:
        initials = words[0][:2]
    else:
        initials = "CF"  # default for Casa Fonso

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
    """Draw a single label.

    Layout:
      ┌──────────────────────────────────────────────────────────────┐
      │ [GREEN BG]  [CF]  DESCRIPCIÓN DEL PRODUCTO EN BLANCO        │  top 42%
      ├──────────────────────────────────────────────────────────────┤
      │  98,40 €  │  [QR]  │  ██████████████████  │                 │  bottom 58%
      │  REF: xxx │        │  ██████████████████  │                 │
      │  cipher   │        │     1234567890        │                 │
      └──────────────────────────────────────────────────────────────┘
    """
    from reportlab.lib import colors
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics

    GREEN_DARK  = colors.HexColor("#1B5E20")   # empresa: verde oscuro
    GREEN_MID   = colors.HexColor("#2E7D32")
    GREEN_LIGHT = colors.HexColor("#E8F5E9")   # fondo muy suave zona inferior

    pad = 5   # internal padding in points

    # ── Outer border ──────────────────────────────────────────────
    c.setStrokeColor(GREEN_DARK)
    c.setLineWidth(1.2)
    c.rect(x, y, w, h, fill=0, stroke=1)

    # ── TOP SECTION — green background (42 % of height) ──────────
    top_pct   = 0.42
    top_h     = h * top_pct
    top_y     = y + h - top_h          # top section starts here (PDF y upward)
    divider_y = top_y                   # = y + h*(1-top_pct)

    c.setFillColor(GREEN_MID)
    c.rect(x, divider_y, w, top_h, fill=1, stroke=0)

    # Badge (CF) inside green top section
    badge_sz = top_h * 0.68
    badge_x  = x + pad
    badge_y  = divider_y + (top_h - badge_sz) / 2
    _draw_logo_badge(c, badge_x, badge_y, badge_sz, badge_sz, company_name=company_name)

    # Description — white text, right of badge
    desc_x = badge_x + badge_sz + pad
    desc_w = w - (desc_x - x) - pad
    desc   = (article.descripcion or "Sin descripción").upper()
    FONT   = "Helvetica-Bold"

    # Auto-fit: try 11→9→8→7 pt until ≤3 lines
    for FSIZE in (11, 9, 8, 7):
        LEAD  = FSIZE + 2
        lines = _wrap_words(desc, FONT, FSIZE, desc_w)
        if len(lines) <= 3:
            break
    lines = lines[:3]

    c.setFont(FONT, FSIZE)
    c.setFillColor(colors.white)
    block_h      = len(lines) * LEAD
    top_baseline = divider_y + top_h - (top_h - block_h) / 2 - FSIZE * 0.15
    for i, line in enumerate(lines):
        c.drawString(desc_x, top_baseline - i * LEAD, line)

    # Redraw border on top of green fill
    c.setStrokeColor(GREEN_DARK)
    c.setLineWidth(1.2)
    c.rect(x, y, w, h, fill=0, stroke=1)

    # Divider line between top/bottom
    c.setStrokeColor(GREEN_DARK)
    c.setLineWidth(0.8)
    c.line(x, divider_y, x + w, divider_y)

    # ── BOTTOM SECTION — white background ────────────────────────
    bot_h = divider_y - y

    c.setFillColor(colors.white)
    c.rect(x, y, w, bot_h, fill=1, stroke=0)

    # ── Zone widths (left to right): TEXT | QR | BARCODE ─────────
    # Barcode: rightmost 40 %
    bc_zone_w = w * 0.40
    bc_x      = x + w - bc_zone_w      # barcode zone starts here

    # QR: 22 % in the middle
    qr_zone_w = w * 0.22
    qr_x      = bc_x - qr_zone_w

    # Left text zone: everything up to QR
    left_w = qr_x - x - pad * 2

    # ── Draw barcode ───────────────────────────────────────────────
    is_ean       = bool(article.ean and len(article.ean) == 13 and article.ean.isdigit())
    barcode_code = article.ean if is_ean else (article.codigo_principal or "N/A")
    bc_bytes     = generate_barcode_image(barcode_code, is_ean=is_ean)

    if bc_bytes:
        bc_reader = ImageReader(io.BytesIO(bc_bytes))
        c.drawImage(bc_reader,
                    bc_x + pad * 0.5, y + pad * 0.5,
                    width=bc_zone_w - pad, height=bot_h - pad,
                    preserveAspectRatio=True, anchor='c')
    else:
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.black)
        c.drawString(bc_x + pad, y + pad, barcode_code)

    # ── Draw QR code ───────────────────────────────────────────────
    qr_sz    = min(qr_zone_w, bot_h) - pad * 2
    qr_code  = article.ean if (article.ean and len(article.ean) >= 8) else (article.codigo_principal or "N/A")
    qr_url   = f"{base_url}/api/products/ficha/{qr_code}"
    qr_bytes = generate_qr_image(qr_url)

    if qr_bytes:
        qr_draw_x = qr_x + (qr_zone_w - qr_sz) / 2
        qr_draw_y = y + (bot_h - qr_sz) / 2
        qr_reader = ImageReader(io.BytesIO(qr_bytes))
        c.drawImage(qr_reader, qr_draw_x, qr_draw_y,
                    width=qr_sz, height=qr_sz,
                    preserveAspectRatio=True)

    # Vertical separator before barcode
    c.setStrokeColor(colors.HexColor("#CCCCCC"))
    c.setLineWidth(0.4)
    c.line(bc_x, y, bc_x, divider_y)
    c.line(qr_x, y, qr_x, divider_y)

    # ── Left text: price / ref / calzetynus ───────────────────────
    pvp     = article.pvp_con_iva or 0.0
    pvp_str = f"{pvp:.2f}".replace(".", ",") + " \u20ac"

    for FSIZE_PVP in (20, 17, 14, 11):
        if pdfmetrics.stringWidth(pvp_str, "Helvetica-Bold", FSIZE_PVP) <= left_w:
            break

    price_y = divider_y - FSIZE_PVP - pad
    c.setFont("Helvetica-Bold", FSIZE_PVP)
    c.setFillColor(GREEN_DARK)
    c.drawString(x + pad, price_y, pvp_str)

    ref_code = article.codigo_principal or "N/A"
    FSIZE_REF = 8
    ref_str   = f"REF: {ref_code}"
    while pdfmetrics.stringWidth(ref_str, "Helvetica-Bold", FSIZE_REF) > left_w and len(ref_str) > 8:
        ref_str = ref_str[:-1]
    ref_y = price_y - FSIZE_REF - 3
    c.setFont("Helvetica-Bold", FSIZE_REF)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(x + pad, ref_y, ref_str)

    coste = getattr(article, "coste_neto_unitario", None)
    if coste is not None and coste > 0:
        calz_y = ref_y - 7 - 2
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.HexColor("#999999"))
        c.drawString(x + pad, calz_y, encode_calzetynus(coste))
