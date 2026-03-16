"""
Sample document 3: Distribuciones Ibérica S.A.
Simulates a slightly degraded/scanned look with 6 articles and 1 discount column.
"""


def generate(output_path: str = "albaran_materiales.pdf"):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    import random

    doc = SimpleDocTemplate(output_path, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()

    story = []

    story.append(Paragraph(
        "DISTRIBUCIONES IBÉRICA, S.A.",
        ParagraphStyle('h', parent=styles['Normal'], fontSize=14, fontName='Helvetica-Bold', spaceAfter=4)
    ))
    story.append(Paragraph("C/ Industria 23, Pol. Sur | 46001 Valencia | CIF: A-46789012", styles['Normal']))
    story.append(Paragraph("Tel: 963 456 789 | Fax: 963 456 790", styles['Normal']))
    story.append(Spacer(1, 5*mm))

    # Document info in simple table
    info = [
        ['ALBARÁN Nº:', 'DI-2024-1547    ', 'FECHA:', '20/03/2024'],
        ['PEDIDO REF:', 'PED-44892', 'AGENTE:', 'García López, M.'],
        ['CLIENTE:', 'El Bricolaje S.L.', 'CIF:', 'B-12398765'],
    ]
    info_tbl = Table(info, colWidths=[30*mm, 60*mm, 25*mm, 55*mm])
    info_tbl.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 5*mm))

    # Articles (simpler format, 1 discount column)
    headers = ['CÓDIGO', 'REFERENCIA FAB.', 'DESCRIPCIÓN', 'CANT', 'P.UNIT.', 'DTO%', 'IMPORTE', 'IVA']

    articles = [
        ['DIB-441', 'ADH-PU45', 'Adhesivo poliuretano estructura 600ml', '30', '8,75', '25', '196,88', '21%'],
        ['DIB-523', 'PRF-300R', 'Perfil aluminio anodizado U-30 barra 3m', '50', '12,30', '20', '492,00', '21%'],
        ['DIB-612', 'GRP-EPOXI', 'Resina epoxi bi-componente kit 1kg', '20', '18,50', '30', '259,00', '21%'],
        ['DIB-734', 'FILM-PE12', 'Film polietileno 200µm rollo 4x50m', '10', '34,90', '15', '296,65', '21%'],
        ['DIB-819', 'ESP-PUR3', 'Espuma de poliuretano 750ml pro', '40', '5,20', '20', '166,40', '21%'],
        ['DIB-921', 'ANT-GRIP', 'Pintura antideslizante exterior gris 5L', '12', '28,60', '25', '257,40', '21%'],
    ]

    table_data = [headers] + articles
    col_widths = [20*mm, 28*mm, 60*mm, 12*mm, 18*mm, 12*mm, 18*mm, 12*mm]

    art_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    art_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#404040')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(art_table)
    story.append(Spacer(1, 6*mm))

    # Simple totals
    story.append(Paragraph("<b>BASE IMPONIBLE: 1.668,33 €</b>", styles['Normal']))
    story.append(Paragraph("<b>IVA (21%): 350,35 €</b>", styles['Normal']))
    story.append(Paragraph("<b>TOTAL ALBARÁN: 2.018,68 €</b>", styles['Normal']))
    story.append(Spacer(1, 5*mm))
    story.append(Paragraph(
        "Nota: Los precios indicados no incluyen el Recargo de Equivalencia. "
        "Transporte incluido para pedidos superiores a 500€. "
        "Condiciones de pago: 30-60 días fecha factura.",
        styles['Normal']
    ))

    doc.build(story)
    print(f"Generated: {output_path}")


if __name__ == "__main__":
    generate()
