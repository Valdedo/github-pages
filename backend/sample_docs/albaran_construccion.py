"""
Sample document 2: Materiales Construcción Norte S.L.
Digital PDF with 8 articles, 2 discount columns, recargo de equivalencia 5.2%.
"""


def generate(output_path: str = "albaran_construccion.pdf"):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT

    doc = SimpleDocTemplate(output_path, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()

    story = []

    # Header
    story.append(Paragraph(
        "<b>MATERIALES CONSTRUCCIÓN NORTE S.L.</b>",
        ParagraphStyle('h', parent=styles['Normal'], fontSize=15, spaceAfter=4)
    ))
    story.append(Paragraph(
        "Polígono Industrial El Pino, Nave 12 | 33010 Oviedo (Asturias)",
        styles['Normal']
    ))
    story.append(Paragraph("CIF: B-33456789 | Tel: 985 123 456 | Email: ventas@matconstnorte.es", styles['Normal']))
    story.append(Spacer(1, 6*mm))

    # Document header table
    hdr = [
        ['ALBARÁN / DELIVERY NOTE', 'Nº: MCN-2024-00892'],
        ['Fecha / Date:', '18/03/2024'],
        ['Forma de pago:', 'Transferencia 60 días'],
        ['Recargo de Equivalencia:', 'SÍ (5,2% sobre IVA 21%)'],
    ]
    hdr_table = Table(hdr, colWidths=[80*mm, 90*mm])
    hdr_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2E86C1')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(hdr_table)
    story.append(Spacer(1, 6*mm))

    # Articles
    headers = ['REF', 'ART.FABRIC', 'DESCRIPCIÓN DEL MATERIAL', 'UDS', 'PRECIO', 'DTO1%', 'DTO2%', 'NETO', 'IVA', 'RE%', 'IMPORTE']

    articles = [
        ['MCN-001', 'CEM-III/A', 'Cemento Portland III/A 42,5N saco 25kg', '100', '9,85', '15', '5', '7,934', '21', '5,2', '793,35'],
        ['MCN-002', 'LAD-CARA', 'Ladrillo caravista rojo 24x12x7 cm (palé 504ud)', '5', '285,00', '20', '8', '209,040', '21', '5,2', '1045,20'],
        ['MCN-003', 'ARD-J85', 'Arena lavada de río 0/4 mm saco 25kg', '200', '2,40', '10', '', '2,160', '21', '5,2', '432,00'],
        ['MCN-004', 'PLA-YESO', 'Placa de yeso laminado 13mm 120x300cm', '80', '12,50', '25', '5', '8,906', '21', '5,2', '712,50'],
        ['MCN-005', 'TUB-PVC-90', 'Tubo PVC presión 90mm x 6m PN10', '20', '18,90', '20', '10', '13,608', '21', '5,2', '272,16'],
        ['MCN-006', 'AIR-INT3', 'Aislante térmico lana mineral 5cm rollo 10m²', '30', '24,50', '15', '5', '19,746', '21', '5,2', '592,38'],
        ['MCN-007', 'PUR-GRIS', 'Pintura exterior antihumedad gris 15L', '15', '45,80', '20', '8', '33,626', '21', '5,2', '504,38'],
        ['MCN-008', 'GRA-4-8', 'Grava 4/8 mm saco 25kg', '150', '3,20', '10', '5', '2,736', '21', '5,2', '410,40'],
    ]

    table_data = [headers] + articles
    col_widths = [18*mm, 22*mm, 60*mm, 10*mm, 15*mm, 12*mm, 12*mm, 15*mm, 10*mm, 9*mm, 17*mm]

    art_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    art_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2E86C1')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 7),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#EBF5FB')]),
        ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.3, colors.grey),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(art_table)
    story.append(Spacer(1, 6*mm))

    # Totals
    totals = [
        ['BASE IMPONIBLE:', '4.762,37 €'],
        ['IVA (21%):', '999,10 €'],
        ['RECARGO EQUIV. (5,2%):', '247,64 €'],
        ['TOTAL FACTURA:', '6.009,11 €'],
    ]
    tot_table = Table(totals, colWidths=[100*mm, 40*mm])
    tot_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BACKGROUND', (0, 3), (-1, 3), colors.HexColor('#2E86C1')),
        ('TEXTCOLOR', (0, 3), (-1, 3), colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(tot_table)

    doc.build(story)
    print(f"Generated: {output_path}")


if __name__ == "__main__":
    generate()
