"""
PDF report generation using reportlab.
Generates a clean, printable A4 report with all article data.
"""
import io
import logging
from datetime import date
from typing import List

logger = logging.getLogger(__name__)

# Column definitions: (field, header, relative_width, align)
# align: 'L' left, 'R' right, 'C' center
COLUMNS = [
    ("descripcion",           "Descripción",        28, "L"),
    ("cantidad",              "Cant.",                5, "R"),
    ("precio_unitario_bruto", "P. Bruto",             8, "R"),
    ("descuento_1",           "Dto.1",                5, "R"),
    ("descuento_2",           "Dto.2",                5, "R"),
    ("coste_neto_unitario",   "C. Neto U.",           8, "R"),
    ("coste_neto_total",      "C. Neto T.",           8, "R"),
    ("margen_pct",            "Margen",               6, "R"),
    ("pvp_sin_iva",           "PVP s/IVA",            8, "R"),
    ("pvp_con_iva",           "PVP c/IVA",            8, "R"),
    ("codigo_principal",      "Código",               9, "C"),
]


def _fmt_num(value, decimals=2, suffix="") -> str:
    if value is None:
        return "-"
    try:
        f = float(value)
        return f"{f:,.{decimals}f}{suffix}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return str(value)


def _fmt_pct(value) -> str:
    return _fmt_num(value, 1, "%") if value else "-"


def _fmt_eur(value) -> str:
    return _fmt_num(value, 2, " €") if value else "-"


def generate_pdf_report(document, articles) -> bytes:
    """Generate a printable A4 PDF report with article data.

    Args:
        document: Document ORM object
        articles: List of Article ORM objects

    Returns:
        PDF file as bytes
    """
    try:
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph,
            Spacer, HRFlowable,
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
    except ImportError:
        logger.error("reportlab not installed")
        return b""

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )

    styles = getSampleStyleSheet()
    PAGE_W = landscape(A4)[0] - 24 * mm  # usable width

    # ── Colour palette ────────────────────────────────────────────────────────
    BLUE_DARK  = colors.HexColor("#1F4E79")
    BLUE_MED   = colors.HexColor("#2E75B6")
    BLUE_LIGHT = colors.HexColor("#D6E4F0")
    GREEN_LIGHT = colors.HexColor("#E2EFDA")
    GREY_TEXT  = colors.HexColor("#444444")

    # ── Header block ─────────────────────────────────────────────────────────
    title_style = ParagraphStyle(
        "Title", fontSize=16, textColor=BLUE_DARK,
        fontName="Helvetica-Bold", spaceAfter=2,
    )
    sub_style = ParagraphStyle(
        "Sub", fontSize=9, textColor=GREY_TEXT,
        fontName="Helvetica", spaceAfter=0,
    )
    right_style = ParagraphStyle(
        "Right", fontSize=9, textColor=GREY_TEXT,
        fontName="Helvetica", alignment=TA_RIGHT,
    )

    supplier = document.supplier_name or "—"
    doc_number = document.doc_number or "—"
    doc_date = document.doc_date.isoformat() if document.doc_date else "—"
    generated = date.today().isoformat()

    header_data = [[
        Paragraph(f"Albarán de proveedor — {supplier}", title_style),
        Paragraph(
            f"Nº doc.: <b>{doc_number}</b> &nbsp;&nbsp; Fecha: <b>{doc_date}</b><br/>"
            f"Generado: {generated} &nbsp;&nbsp; Artículos: {len(articles)}",
            right_style,
        ),
    ]]
    header_table = Table(header_data, colWidths=[PAGE_W * 0.6, PAGE_W * 0.4])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    # ── Article table ─────────────────────────────────────────────────────────
    total_parts = sum(w for _, _, w, _ in COLUMNS)
    col_widths = [PAGE_W * (w / total_parts) for _, _, w, _ in COLUMNS]

    desc_style = ParagraphStyle(
        "Desc", fontSize=7.5, fontName="Helvetica",
        leading=9, textColor=GREY_TEXT,
    )

    def build_row(article, row_idx: int) -> list:
        row = []
        for field, _, _, align in COLUMNS:
            if field == "descripcion":
                val = Paragraph(article.descripcion or "", desc_style)
            elif field == "cantidad":
                val = _fmt_num(article.cantidad, 3).rstrip("0").rstrip(",")
            elif field == "precio_unitario_bruto":
                val = _fmt_eur(article.precio_unitario_bruto)
            elif field == "descuento_1":
                val = _fmt_pct(article.descuento_1)
            elif field == "descuento_2":
                val = _fmt_pct(article.descuento_2)
            elif field == "coste_neto_unitario":
                val = _fmt_eur(article.coste_neto_unitario)
            elif field == "coste_neto_total":
                val = _fmt_eur(article.coste_neto_total)
            elif field == "margen_pct":
                val = _fmt_pct(article.margen_pct)
            elif field == "pvp_sin_iva":
                val = _fmt_eur(article.pvp_sin_iva)
            elif field == "pvp_con_iva":
                val = _fmt_eur(article.pvp_con_iva)
            elif field == "codigo_principal":
                val = article.codigo_principal or ""
            else:
                val = ""
            row.append(val)
        return row

    # Header row
    table_data = [[Paragraph(f"<b>{h}</b>", ParagraphStyle(
        f"h{i}", fontSize=7.5, fontName="Helvetica-Bold",
        textColor=colors.white, alignment=TA_CENTER, leading=9,
    )) for i, (_, h, _, _) in enumerate(COLUMNS)]]

    for idx, article in enumerate(articles):
        table_data.append(build_row(article, idx))

    # Totals row
    total_coste = sum((a.coste_neto_total or 0) for a in articles)
    total_pvp_iva = sum((a.pvp_con_iva or 0) * (a.cantidad or 1) for a in articles)
    totals_row = [""] * len(COLUMNS)
    totals_row[0] = Paragraph("<b>TOTALES</b>", ParagraphStyle(
        "tot", fontSize=7.5, fontName="Helvetica-Bold", textColor=BLUE_DARK,
    ))
    coste_idx = next(i for i, (f, *_) in enumerate(COLUMNS) if f == "coste_neto_total")
    pvp_idx   = next(i for i, (f, *_) in enumerate(COLUMNS) if f == "pvp_con_iva")
    totals_row[coste_idx] = Paragraph(
        f"<b>{_fmt_eur(total_coste)}</b>",
        ParagraphStyle("totval", fontSize=7.5, fontName="Helvetica-Bold",
                       textColor=BLUE_DARK, alignment=TA_RIGHT),
    )
    totals_row[pvp_idx] = Paragraph(
        f"<b>{_fmt_eur(total_pvp_iva)}</b>",
        ParagraphStyle("totval2", fontSize=7.5, fontName="Helvetica-Bold",
                       textColor=BLUE_DARK, alignment=TA_RIGHT),
    )
    table_data.append(totals_row)

    article_table = Table(table_data, colWidths=col_widths, repeatRows=1)

    # Alignment commands per column
    align_cmds = []
    for i, (_, _, _, align) in enumerate(COLUMNS):
        rlab = {"L": "LEFT", "R": "RIGHT", "C": "CENTER"}[align]
        align_cmds.append(("ALIGN", (i, 1), (i, -1), rlab))

    # Row background alternating
    row_bg_cmds = []
    for r in range(2, len(table_data)):  # skip header (0) and totals handled separately
        if r == len(table_data) - 1:  # totals row
            row_bg_cmds.append(("BACKGROUND", (0, r), (-1, r), BLUE_LIGHT))
        elif r % 2 == 0:
            row_bg_cmds.append(("BACKGROUND", (0, r), (-1, r), colors.white))
        else:
            row_bg_cmds.append(("BACKGROUND", (0, r), (-1, r), BLUE_LIGHT))

    # Price columns green tint (coste & pvp columns)
    price_fields = {"coste_neto_unitario", "coste_neto_total", "pvp_sin_iva", "pvp_con_iva"}
    price_col_indices = [i for i, (f, *_) in enumerate(COLUMNS) if f in price_fields]

    price_bg_cmds = []
    for r in range(1, len(table_data) - 1):  # data rows only
        for ci in price_col_indices:
            price_bg_cmds.append(("BACKGROUND", (ci, r), (ci, r), GREEN_LIGHT))

    article_table.setStyle(TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), BLUE_DARK),
        ("ROWBACKGROUND", (0, 0), (-1, 0), [BLUE_DARK]),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        # Grid
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#BBBBBB")),
        ("LINEABOVE", (0, 0), (-1, 0), 1, BLUE_DARK),
        ("LINEBELOW", (0, 0), (-1, 0), 1, BLUE_MED),
        # Padding
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        # Font sizes for data rows
        ("FONTSIZE", (0, 1), (-1, -1), 7.5),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        # Totals row bottom border
        ("LINEABOVE", (0, -1), (-1, -1), 1, BLUE_MED),
        ("LINEBELOW", (0, -1), (-1, -1), 1.5, BLUE_DARK),
        *align_cmds,
        *row_bg_cmds,
        *price_bg_cmds,
    ]))

    # ── Assemble document ─────────────────────────────────────────────────────
    story = [
        header_table,
        Spacer(1, 4 * mm),
        HRFlowable(width="100%", thickness=1.5, color=BLUE_DARK),
        Spacer(1, 3 * mm),
        article_table,
    ]

    def footer(canvas, doc_obj):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(GREY_TEXT)
        w, h = landscape(A4)
        canvas.drawString(12 * mm, 8 * mm, f"Albarán {doc_number} — {supplier}")
        canvas.drawRightString(w - 12 * mm, 8 * mm,
                               f"Pág. {doc_obj.page} — Generado el {generated}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    buf.seek(0)
    return buf.read()
