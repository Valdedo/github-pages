"""
PDF price list generator using reportlab.
Produces a clean, professional A4 price list grouped by familia.
"""
import io
import logging
from typing import List, Optional
from datetime import date

logger = logging.getLogger(__name__)

# Page layout constants (points, 1pt = 1/72 inch)
A4_W, A4_H = 595.27, 841.89
MARGIN = 36  # 0.5 inch

# Colors
HEADER_BG   = (0.18, 0.42, 0.62)   # dark blue   #2D6A9F
ROW_EVEN    = (0.93, 0.96, 0.98)   # light blue
ROW_ODD     = (1.0,  1.0,  1.0)    # white
SECTION_BG  = (0.22, 0.22, 0.22)   # dark grey for section dividers
PVP_COLOR   = (0.07, 0.40, 0.07)   # dark green for PVP
TEXT_GREY   = (0.40, 0.40, 0.40)


def generate_price_list_pdf(
    articles,
    company_name: str = "",
    supplier_name: str = "",
    doc_number: str = "",
    doc_date: Optional[date] = None,
    title: str = "Listín de Precios",
) -> bytes:
    """Generate a PDF price list for a set of articles.

    Articles are grouped by `familia` (if set), sorted alphabetically within groups.
    Each row shows: Código | Descripción | IVA | PVP sin IVA | PVP con IVA

    Returns PDF bytes.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except ImportError:
        logger.error("reportlab not installed")
        return b""

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    content_w = A4_W - 2 * MARGIN
    today_str = date.today().strftime("%d/%m/%Y")
    doc_date_str = doc_date.strftime("%d/%m/%Y") if doc_date else today_str

    # Column layout: Code | Description | IVA | PVP sin IVA | PVP con IVA
    col_widths = [90, content_w - 90 - 40 - 75 - 75, 40, 75, 75]
    col_x = [MARGIN]
    for w in col_widths[:-1]:
        col_x.append(col_x[-1] + w)
    headers = ["Código", "Descripción", "IVA", "PVP sin IVA", "PVP con IVA"]
    header_aligns = ["left", "left", "center", "right", "right"]

    ROW_H = 16
    HEADER_H = 22

    def draw_header(y_start: float):
        """Draw column header bar."""
        c.setFillColorRGB(*HEADER_BG)
        c.rect(MARGIN, y_start, content_w, HEADER_H, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 9)
        for i, (hdr, align) in enumerate(zip(headers, header_aligns)):
            x = col_x[i]
            w = col_widths[i]
            if align == "right":
                c.drawRightString(x + w - 3, y_start + 7, hdr)
            elif align == "center":
                c.drawCentredString(x + w / 2, y_start + 7, hdr)
            else:
                c.drawString(x + 3, y_start + 7, hdr)
        return y_start - 2

    def draw_section_divider(y: float, section_name: str):
        """Draw a section header for a familia group."""
        c.setFillColorRGB(*SECTION_BG)
        c.rect(MARGIN, y, content_w, 14, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(MARGIN + 5, y + 4, f"  {section_name.upper()}")

    def draw_page_header(page_num: int):
        """Draw page title / company header."""
        y = A4_H - MARGIN
        c.setFont("Helvetica-Bold", 14)
        c.setFillColorRGB(*HEADER_BG)
        c.drawString(MARGIN, y, title)
        if company_name:
            c.setFont("Helvetica", 10)
            c.setFillColorRGB(*TEXT_GREY)
            c.drawRightString(A4_W - MARGIN, y, company_name)
        y -= 16

        info_parts = []
        if supplier_name:
            info_parts.append(f"Proveedor: {supplier_name}")
        if doc_number:
            info_parts.append(f"Albarán: {doc_number}")
        info_parts.append(f"Fecha: {doc_date_str}")
        info_parts.append(f"Pág. {page_num}")

        c.setFont("Helvetica", 8)
        c.setFillColorRGB(*TEXT_GREY)
        c.drawString(MARGIN, y, "  ·  ".join(info_parts))
        y -= 6

        # Thin separator line
        c.setStrokeColorRGB(*TEXT_GREY)
        c.setLineWidth(0.5)
        c.line(MARGIN, y, A4_W - MARGIN, y)
        return y - 4

    def truncate(text: str, font: str, size: int, max_w: float) -> str:
        from reportlab.pdfbase.pdfmetrics import stringWidth
        if stringWidth(text, font, size) <= max_w:
            return text
        while text and stringWidth(text + "…", font, size) > max_w:
            text = text[:-1]
        return text + "…"

    # ── Group articles by familia ────────────────────────────────────────
    from collections import defaultdict
    groups: dict[str, list] = defaultdict(list)
    for art in articles:
        key = (art.familia or "").strip() or "Sin categoría"
        groups[key].append(art)

    # Sort: named families first (alphabetical), then "Sin categoría"
    sorted_keys = sorted(
        groups.keys(),
        key=lambda k: ("ZZZ" if k == "Sin categoría" else k.upper())
    )

    # ── Render ───────────────────────────────────────────────────────────
    page_num = 1
    y = draw_page_header(page_num)
    y = draw_header(y - HEADER_H)
    row_count = 0

    def new_page():
        nonlocal y, page_num
        c.showPage()
        page_num += 1
        y = draw_page_header(page_num)
        y = draw_header(y - HEADER_H)

    BOTTOM_MARGIN = MARGIN + 20

    for section in sorted_keys:
        arts = sorted(groups[section], key=lambda a: (a.descripcion or "").upper())

        # Section divider
        if y - 14 < BOTTOM_MARGIN:
            new_page()
        draw_section_divider(y, section)
        y -= 16

        for art in arts:
            if y - ROW_H < BOTTOM_MARGIN:
                new_page()

            is_even = row_count % 2 == 0
            bg = ROW_EVEN if is_even else ROW_ODD
            c.setFillColorRGB(*bg)
            c.rect(MARGIN, y, content_w, ROW_H, fill=1, stroke=0)

            # Light separator line
            c.setStrokeColorRGB(0.85, 0.85, 0.85)
            c.setLineWidth(0.3)
            c.line(MARGIN, y, A4_W - MARGIN, y)

            codigo = (
                art.codigo_principal or
                art.codigo_fabricante or
                art.codigo_proveedor or
                art.ean or
                "—"
            )

            def draw_cell(col_i: int, text: str, bold: bool = False, color=None, align: str = "left"):
                x = col_x[col_i]
                w = col_widths[col_i]
                font = "Helvetica-Bold" if bold else "Helvetica"
                font_size = 8
                c.setFont(font, font_size)
                if color:
                    c.setFillColorRGB(*color)
                else:
                    c.setFillColorRGB(0.1, 0.1, 0.1)

                padding = 3
                max_text_w = w - padding * 2
                display = truncate(text, font, font_size, max_text_w)

                baseline = y + 5
                if align == "right":
                    c.drawRightString(x + w - padding, baseline, display)
                elif align == "center":
                    c.drawCentredString(x + w / 2, baseline, display)
                else:
                    c.drawString(x + padding, baseline, display)

            draw_cell(0, codigo)
            draw_cell(1, art.descripcion or "")
            draw_cell(2, f"{int(art.iva_pct or 21)}%", align="center")
            draw_cell(3, f"{art.pvp_sin_iva:.2f} €", align="right")
            draw_cell(4, f"{art.pvp_con_iva:.2f} €", bold=True, color=PVP_COLOR, align="right")

            y -= ROW_H
            row_count += 1

    # Footer on last page
    c.setFont("Helvetica", 7)
    c.setFillColorRGB(*TEXT_GREY)
    footer_text = f"Generado el {today_str} — {len(articles)} artículos"
    c.drawCentredString(A4_W / 2, MARGIN - 10, footer_text)

    c.save()
    buf.seek(0)
    return buf.read()
