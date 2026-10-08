"""
PDF price list generator using reportlab.
Produces a clean, professional A4 price list grouped by familia.
"""
import io
import logging
from typing import Optional
from datetime import date

logger = logging.getLogger(__name__)

# Page layout constants (points, 1pt = 1/72 inch)
A4_W, A4_H = 595.27, 841.89
MARGIN = 36  # 0.5 inch

def _hex(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


# Colores de Casa Fonso
HEADER_BG   = _hex("#1F5A3A")   # verde oscuro de la marca
ACCENT      = _hex("#2FAE66")   # verde claro de la marca
ROW_EVEN    = _hex("#EEF7F1")   # verde muy claro
ROW_ODD     = (1.0,  1.0,  1.0)
SECTION_BG  = _hex("#DCEFE3")   # barra de familia: fondo claro con texto verde oscuro
SECTION_TXT = _hex("#1F5A3A")
PVP_COLOR   = _hex("#1F5A3A")
TEXT_GREY   = (0.40, 0.40, 0.40)
SECTION_H   = 14


def _euros(v) -> str:
    """2,84 € / 1.234,50 €"""
    return f"{(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " €"


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
    except ImportError:
        logger.error("reportlab not installed")
        return b""

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    content_w = A4_W - 2 * MARGIN
    from datetime import datetime
    from zoneinfo import ZoneInfo
    today_str = datetime.now(ZoneInfo("Europe/Madrid")).strftime("%d/%m/%Y")
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
        # Lo siguiente (barra de familia o fila) se dibuja de «y» hacia arriba:
        # se deja hueco para que no tape los títulos de las columnas
        return y_start - 2 - SECTION_H

    def draw_section_divider(y: float, section_name: str):
        """Draw a section header for a familia group."""
        c.setFillColorRGB(*SECTION_BG)
        c.rect(MARGIN, y, content_w, SECTION_H, fill=1, stroke=0)
        c.setFillColorRGB(*ACCENT)
        c.rect(MARGIN, y, 3, SECTION_H, fill=1, stroke=0)
        c.setFillColorRGB(*SECTION_TXT)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(MARGIN + 8, y + 4, section_name.upper())

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
        c.setStrokeColorRGB(*ACCENT)
        c.setLineWidth(0.8)
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

        # Barra de familia (con al menos una fila debajo en la misma página)
        if y - ROW_H - 2 < BOTTOM_MARGIN:
            new_page()
        draw_section_divider(y, section)
        y -= ROW_H + 2

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
            iva = art.iva_pct if art.iva_pct is not None else 21
            draw_cell(2, f"{iva:g}%".replace(".", ","), align="center")
            draw_cell(3, _euros(art.pvp_sin_iva), align="right")
            draw_cell(4, _euros(art.pvp_con_iva), bold=True, color=PVP_COLOR, align="right")

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
