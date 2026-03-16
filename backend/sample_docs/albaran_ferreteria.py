"""
Sample document 1: Ferretería Pérez S.L.
Digital PDF with 12 articles, 3 discount columns, mixed IVA, EAN codes.
"""


def generate(output_path: str = "albaran_ferreteria_digital.pdf"):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT

    doc = SimpleDocTemplate(output_path, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('title', parent=styles['Heading1'], fontSize=16, alignment=TA_CENTER)
    subtitle_style = ParagraphStyle('subtitle', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER)
    right_style = ParagraphStyle('right', parent=styles['Normal'], fontSize=9, alignment=TA_RIGHT)

    story = []

    # Header
    story.append(Paragraph("FERRETERÍA PÉREZ S.L.", title_style))
    story.append(Paragraph("C/ Mayor, 45 - 28001 Madrid | Tel: 91 234 56 78 | CIF: B-12345678", subtitle_style))
    story.append(Spacer(1, 8*mm))

    # Document info
    info_data = [
        ['ALBARÁN Nº:', 'ALB-2024-03456', 'FECHA:', '15/03/2024'],
        ['CLIENTE:', 'Materiales Norte S.A.', 'CIF:', 'A-87654321'],
        ['DIRECCIÓN:', 'Pol. Ind. Norte, Nave 7', 'TELÉFONO:', '91 987 65 43'],
    ]
    info_table = Table(info_data, colWidths=[35*mm, 65*mm, 25*mm, 45*mm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 8*mm))

    # Articles table
    headers = ['LIN', 'COD.PROV', 'COD.FABRIC', 'EAN', 'DESCRIPCIÓN', 'UD', 'P.BRUTO', 'DTO1%', 'DTO2%', 'DTO3%', 'P.NETO', 'IVA%', 'TOTAL']

    articles = [
        ['1', 'FER-001', 'STL-4520', '8414702123456', 'Tornillo M6x25 DIN 933 Zinc (caja 100ud)', '5', '12,50', '30', '10', '', '7,875', '21', '39,38'],
        ['2', 'FER-002', 'STL-4521', '8414702123457', 'Tuerca M6 DIN 934 Zinc (caja 200ud)', '3', '8,20', '30', '10', '', '5,166', '21', '15,50'],
        ['3', 'FER-015', 'TAL-220X', '8421256789012', 'Taladro percutor 750W 13mm BOSCH GSB 13', '2', '89,90', '20', '5', '', '68,324', '21', '136,65'],
        ['4', 'FER-023', 'MAK-DF347', '4012345678901', 'Atornillador inalámbrico 18V MAKITA', '1', '145,00', '25', '10', '5', '98,438', '21', '98,44'],
        ['5', 'FER-034', 'SIK-PRO2', '8433373234567', 'Silicona neutra transparente 280ml', '20', '3,45', '30', '10', '', '2,173', '21', '43,45'],
        ['6', 'FER-041', 'PAN-P400', '3256540012345', 'Papel de lija P400 hoja 230x280mm', '50', '0,85', '20', '', '', '0,680', '21', '34,00'],
        ['7', 'FER-055', 'HIL-3002', '6930803219876', 'Nivel de burbuja profesional 60cm', '4', '18,75', '25', '10', '', '12,656', '21', '50,63'],
        ['8', 'FER-067', 'ORT-CAB12', '8470001234567', 'Cabezal de ducha cromado 200mm', '6', '24,90', '30', '5', '', '16,532', '10', '99,19'],
        ['9', 'FER-078', 'PLA-T150', '8421987654321', 'Plástico protector suelo 4x5m 100µm', '10', '7,60', '20', '10', '', '5,472', '21', '54,72'],
        ['10', 'FER-089', 'AGU-PR20', '8412345678901', 'Aguarrás sintético 1L', '15', '4,20', '30', '10', '5', '2,551', '21', '38,26'],
        ['11', 'FER-095', 'GLP-120W', '8409876543210', 'Glp lámpara LED 120W E27 fría', '25', '6,80', '40', '10', '', '3,672', '21', '91,80'],
        ['12', 'FER-103', 'FIL-NL3', '5012345678901', 'Filtro agua rosca 3/4" + cartucho', '8', '15,30', '25', '10', '', '10,328', '21', '82,62'],
    ]

    table_data = [headers] + articles
    col_widths = [8*mm, 18*mm, 18*mm, 28*mm, 50*mm, 8*mm, 14*mm, 12*mm, 12*mm, 12*mm, 13*mm, 9*mm, 13*mm]

    art_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    art_table.setStyle(TableStyle([
        # Header
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        # Data rows
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f4f8')]),
        ('ALIGN', (5, 1), (-1, -1), 'RIGHT'),
        ('ALIGN', (0, 1), (4, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -1), 0.3, colors.grey),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(art_table)
    story.append(Spacer(1, 8*mm))

    # Totals
    totals_data = [
        ['', '', 'SUBTOTAL:', '684,64 €'],
        ['', '', 'IVA (21%):', '137,47 €'],
        ['', '', 'IVA (10%):', '9,92 €'],
        ['', '', 'TOTAL:', '831,03 €'],
    ]
    totals_table = Table(totals_data, colWidths=[80*mm, 40*mm, 35*mm, 25*mm])
    totals_table.setStyle(TableStyle([
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 3), (3, 3), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('BACKGROUND', (2, 3), (3, 3), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (2, 3), (3, 3), colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(totals_table)

    # Notes
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph(
        "Mercancía viajará a portes debidos. Reclamaciones en 24h de la recepción. "
        "Pronto pago 2% a 10 días. Condiciones de pago: 30 días.",
        styles['Normal']
    ))

    doc.build(story)
    print(f"Generated: {output_path}")


if __name__ == "__main__":
    generate()
