"""
PDF label generation using reportlab.
Labels: 10cm × 5cm, multiple per A4 page.
"""
import io
import logging
from typing import Optional

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
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
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
    from urllib.parse import quote
    qr_url   = f"{base_url}/api/products/ficha/{quote(str(qr_code), safe='')}"
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


# ══ Etiquetas de balda (nov. 2026) ═════════════════════════════════════════════════════════════
# Folio A4 de 12 pegatinas de 97 × 42,3 mm (2 columnas × 6 filas, pegadas entre sí): las que usa la
# tienda (Printation 1367564, la misma plantilla que Avery 3659 / Herma 4669). 2 × 97 = 194 mm → quedan
# 8 mm a cada lado; 6 × 42,3 = 253,8 mm → 21,6 mm arriba y abajo.
BALDA = {"ancho": 97.0, "alto": 42.3, "cols": 2, "filas": 6, "izq": 8.0, "arriba": 21.6}
BALDA_POR_HOJA = BALDA["cols"] * BALDA["filas"]
# Diseño «diagonal verde» (Andrés, 24/11/2026; elegido entre varias propuestas, lienzo «Etiquetas de balda» de
# claude.ai): bloque verde oscuro cortado en diagonal con el precio en blanco y cómo se vende; a la derecha la
# descripción grande y el tejado del logotipo, pequeño y apagado, en la esquina; abajo el código de barras, el código
# del artículo y el coste en clave con el mes. Letra Barlow (assets/fonts, licencia OFL).
_FUENTES_BALDA = {   # papel → (nombre en el PDF, archivo, la de reserva si el archivo falta)
    "precio": ("CFBalda-Precio", "BarlowCondensed-ExtraBold.ttf", "Helvetica-Bold"),
    "nombre": ("CFBalda-Nombre", "BarlowSemiCondensed-Bold.ttf", "Helvetica-Bold"),
    "negra": ("CFBalda-Negra", "Barlow-Bold.ttf", "Helvetica-Bold"),
    "media": ("CFBalda-Media", "Barlow-SemiBold.ttf", "Helvetica-Bold"),
    "fina": ("CFBalda-Fina", "Barlow-Medium.ttf", "Helvetica"),
}
_fuentes_balda_cache: dict = {}
# El tejado del logotipo, en vector (medido sobre el logotipo: caja de 208 × 160): vertiente larga y vertiente corta
_TEJADO = (((103, 0), (132, 28), (0, 160), (0, 103)), ((136, 33), (208, 104), (208, 159), (109, 60)))
# Lo que no tiene una letra se cambia por algo que sí (en las tarifas hay medidas como «⅜″»)
_CAMBIOS = {"″": '"', "′": "'", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅓": "1/3", "⅔": "2/3",
            "≈": "~", "–": "-", "—": "-", "…": "...", "\u00a0": " "}
_VENTAS = {"ud": "UNIDAD", "u": "UNIDAD", "uds": "UNIDAD", "und": "UNIDAD", "unidad": "UNIDAD", "pieza": "UNIDAD",
           "m": "METRO", "ml": "METRO", "mt": "METRO", "metro": "METRO", "m2": "M²", "m²": "M²", "m3": "M³", "m³": "M³",
           "kg": "KILO", "kilo": "KILO", "l": "LITRO", "lt": "LITRO", "litro": "LITRO"}


def _fuentes_balda() -> dict:
    """La letra de cada papel de la etiqueta. Si falta un archivo, Helvetica: sale igual, con otra letra."""
    if not _fuentes_balda_cache:
        import pathlib
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        carpeta = pathlib.Path(__file__).resolve().parent.parent / "assets" / "fonts"
        for papel, (nombre, archivo, reserva) in _FUENTES_BALDA.items():
            try:
                pdfmetrics.registerFont(TTFont(nombre, str(carpeta / archivo)))
                _fuentes_balda_cache[papel] = nombre
            except Exception as e:
                logger.warning("Etiquetas de balda sin la letra %s: %s", archivo, e)
                _fuentes_balda_cache[papel] = reserva
    return _fuentes_balda_cache


def _apto(txt: str, fuente: str) -> str:
    """El texto sin lo que esa letra no sabe dibujar (saldría un cuadrado)."""
    from reportlab.pdfbase import pdfmetrics
    glifos = getattr(getattr(pdfmetrics.getFont(fuente), "face", None), "charToGlyph", None)
    out = []
    for ch in txt:
        if glifos is not None:
            vale = ord(ch) in glifos
        else:
            try:
                ch.encode("cp1252")
                vale = True
            except UnicodeEncodeError:
                vale = False
        out.append(ch if vale else _CAMBIOS.get(ch, ""))
    return "".join(out)


def _venta(v) -> Optional[str]:
    """«POR UNIDAD», «POR KILO»… según la unidad en que se vende. None si no se sabe: no se inventa."""
    s = " ".join(str(v or "").lower().replace(".", " ").split())
    if not s:
        return None
    if s in _VENTAS:
        return "POR " + _VENTAS[s]
    return "POR " + s.upper() if len(s) <= 10 and s.isalpha() else None


def _renglones(txt: str, fuente: str, tam: float, ancho_de) -> list:
    """Parte el texto en renglones; `ancho_de(n)` dice cuánto cabe en el renglón n (el tejado quita sitio a los de
    arriba). Una medida («20 × 100») no se parte, y una palabra que no cabe entera se corta."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    import re
    txt = re.sub(r"(?<=[\d″\"½¼¾⅛⅜⅝⅞])\s+([×xX])\s+(?=[\dØ½¼¾⅛⅜⅝⅞])", "\u00a0\\1\u00a0", txt)
    lineas, actual = [], ""
    for palabra in txt.split(" "):
        while palabra:
            tope = ancho_de(len(lineas))
            prueba = f"{actual} {palabra}" if actual else palabra
            if stringWidth(prueba, fuente, tam) <= tope:
                actual, palabra = prueba, ""
            elif actual:
                lineas.append(actual)
                actual = ""
            else:   # una sola palabra más ancha que el renglón
                n = len(palabra)
                while n > 1 and stringWidth(palabra[:n], fuente, tam) > tope:
                    n -= 1
                lineas.append(palabra[:n])
                palabra = palabra[n:]
    if actual:
        lineas.append(actual)
    return lineas


def _eur(v: float) -> str:
    entero, dec = f"{v:,.2f}".split(".")
    return f"{entero.replace(',', '.')},{dec} €"


def _ean_ok(s: str) -> bool:
    if not s.isdigit() or len(s) not in (8, 13):
        return False
    suma = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(s[:-1])))
    return (10 - suma % 10) % 10 == int(s[-1])


def _barras(codigo: str, ancho_max: float, alto: float):
    """Dibujo vectorial del código de barras (sale nítido en cualquier impresora), o None si no cabe legible."""
    from reportlab.graphics.barcode import createBarcodeDrawing
    codigo = (codigo or "").strip()
    if not codigo:
        return None
    try:
        solo = "".join(ch for ch in codigo if ch.isdigit())
        if solo == codigo.replace(" ", "") and _ean_ok(solo):
            d = createBarcodeDrawing("EAN13" if len(solo) == 13 else "EAN8", value=solo, barHeight=alto,
                                     humanReadable=True, fontSize=6.5)
        else:
            limpio = "".join(ch for ch in codigo if 32 <= ord(ch) <= 126)[:24]
            if not limpio:
                return None
            # sin los números debajo: se montaban con las barras; el código va escrito en el pie
            d = createBarcodeDrawing("Code128", value=limpio, barHeight=alto, barWidth=0.72,
                                     humanReadable=False, quiet=False)
        if d.width > ancho_max:
            escala = ancho_max / d.width
            if escala < 0.62:      # barras demasiado finas: no las leería el lector
                return None
            d.scale(escala, 1)
            d.width *= escala
        return d
    except Exception as e:
        logger.warning("No se pudo dibujar el código de barras «%s»: %s", codigo, e)
        return None


_EAN_L = ("0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011")
_EAN_G = ("0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111")
_EAN_R = ("1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100")
_EAN_P = ("LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL")


def _ean_modulos(s: str) -> str:
    """Las barras de un EAN-13 o EAN-8 ya comprobado, módulo a módulo («1» = barra)."""
    if len(s) == 13:
        izq = "".join((_EAN_L if _EAN_P[int(s[0])][i] == "L" else _EAN_G)[int(s[i + 1])] for i in range(6))
        der = "".join(_EAN_R[int(ch)] for ch in s[7:])
    else:
        izq = "".join(_EAN_L[int(ch)] for ch in s[:4])
        der = "".join(_EAN_R[int(ch)] for ch in s[4:])
    return "101" + izq + "01010" + der + "101"


def _etiqueta_balda(c, it: dict, x: float, y: float, w: float, h: float, marca: str = "esquina") -> None:
    """Una etiqueta de balda con el diseño «diagonal verde». Las medidas del dibujo van en «px» de un lienzo de
    734 × 320 (el doble de la pegatina), contadas desde arriba a la izquierda. El texto queda a 5 mm del borde de
    la izquierda y a 3 del de la derecha: si la impresora se va un poco, lo que se recorta es verde, no letras.
    `it["venta"]` (ud, kg, m, saco…) pone «POR UNIDAD», «POR KILO»…; sin ella no sale la pastilla. `marca` ya no se usa."""
    from reportlab.lib import colors
    from reportlab.graphics import renderPDF

    F = _fuentes_balda()
    k = w / 734.0
    verde, claro = colors.HexColor("#114E2C"), colors.HexColor("#2BAD70")
    tinta, gris = colors.HexColor("#16201B"), colors.HexColor("#555B54")

    def X(px: float) -> float:
        return x + px * k

    def Y(px: float) -> float:
        return y + h - px * k

    def ancho(txt: str, fuente: str, tam: float, esp: float = 0.0) -> float:   # en px del dibujo
        return c.stringWidth(txt, fuente, tam * k) / k + esp * max(0, len(txt) - 1)

    def texto(px: float, base: float, txt: str, fuente: str, tam: float, color, esp: float = 0.0, derecha: bool = False):
        c.setFillColor(color)
        c.setFont(fuente, tam * k)
        if derecha:
            px -= ancho(txt, fuente, tam, esp)
        c.drawString(X(px), Y(base), txt, charSpace=esp * k)

    def poligono(puntos, color):
        p = c.beginPath()
        p.moveTo(*puntos[0])
        for q in puntos[1:]:
            p.lineTo(*q)
        p.close()
        c.setFillColor(color)
        c.drawPath(p, stroke=0, fill=1)

    # ── Bloque verde del precio, cortado en diagonal ──
    poligono([(X(14), Y(14)), (X(318), Y(14)), (X(257.2), Y(306)), (X(14), Y(306))], verde)
    pvp = float(it.get("pvp_con_iva") or 0)
    entero, dec = f"{pvp:,.2f}".split(".")
    entero, cents = entero.replace(",", "."), "," + dec
    venta = _venta(it.get("venta"))
    baja = 0 if venta else 14          # sin pastilla, el precio baja un poco para quedar centrado en el bloque

    def ancho_precio(e: float) -> float:
        return ancho(entero, F["precio"], 152 * e) + 6 * e + max(ancho(cents, F["precio"], 62 * e), ancho("€", F["precio"], 42 * e))

    e = 1.0
    while e > 0.4 and ancho_precio(e) > 226:      # precios de tres cifras o más: todo el precio encoge a la vez
        e -= 0.02
    base = 124.6 + 53.2 * e + baja                 # los euros, centrados donde van con el tamaño entero
    arriba_e = base - 106.4 * e
    x_cents = 38 + ancho(entero, F["precio"], 152 * e) + 6 * e
    blanco = colors.white
    texto(38, base, entero, F["precio"], 152 * e, blanco)
    texto(x_cents, arriba_e + 41.4 * e, cents, F["precio"], 62 * e, blanco)
    texto(x_cents, arriba_e + 83.4 * e, "€", F["precio"], 42 * e, blanco)
    if venta:
        venta = _apto(venta, F["negra"])
        tam_v = 18.0
        while tam_v > 12 and ancho(venta, F["negra"], tam_v, 1.5) > 190:
            tam_v -= 0.5
        c.setFillColor(claro)
        c.roundRect(X(38), Y(232), (ancho(venta, F["negra"], tam_v, 1.5) + 32) * k, 34 * k, 17 * k, stroke=0, fill=1)
        texto(54, 215.2 + tam_v * 0.39, venta, F["negra"], tam_v, colors.HexColor("#0B2B19"), 1.5)
    texto(38, 254 if venta else 240, "IVA incluido", F["media"], 15, colors.HexColor("#CFE3D6"))

    # ── Tejado de Casa Fonso, pequeño y apagado, arriba a la derecha ──
    s = 44 * k / 208.0
    for puntos, color in zip(_TEJADO, ("#9FD8BA", "#6E9A82")):
        poligono([(X(668) + px * s, Y(36) - py * s) for px, py in puntos], colors.HexColor(color))

    # ── Descripción: hasta tres renglones, con la letra más grande que quepa (el primero deja sitio al tejado) ──
    izq, der = 342.0, 712.0
    desc = _apto(" ".join(str(it.get("descripcion") or "").split()), F["nombre"])
    lineas, tam = [desc], 24.0

    def cabe(n: int) -> float:      # px que caben en el renglón n: los que empiezan a la altura del tejado, menos
        return der - izq - (56 if 32 + n * tam * 46 / 42 < 72 else 0)

    for tam in (42.0, 38.0, 34.0, 30.0, 27.0, 24.0):
        lineas = _renglones(desc, F["nombre"], tam * k, lambda n: cabe(n) * k)
        if len(lineas) <= 3:
            break
    if len(lineas) > 3:
        lineas = lineas[:3]
        while lineas[2] and ancho(lineas[2] + "…", F["nombre"], tam) > cabe(2):
            lineas[2] = lineas[2][:-1]
        lineas[2] = lineas[2].rstrip() + "…"
    for n, ln in enumerate(lineas):
        texto(izq, 32 + tam * 0.9476 + n * tam * 46 / 42, ln, F["nombre"], tam, tinta)

    # ── Abajo a la derecha: código del artículo y, debajo, el coste en clave con el mes ──
    ean = "".join(str(it.get("ean") or "").split())
    ean = ean if _ean_ok(ean) else ""
    codigo = str(it.get("codigo") or "").strip()
    visto = _apto((str(it.get("ref") or "").strip() or ("" if ean else codigo))[:24], F["negra"])
    tam_c = 22.0
    while visto and tam_c > 15 and ancho(visto, F["negra"], tam_c) > 176:
        tam_c -= 0.5
    while visto and ancho(visto, F["negra"], tam_c) > 176:
        visto = visto[:-1]
    clave = encode_calzetynus(float(it["coste"])) if it.get("coste") else ""
    mes = _apto(str(it.get("fecha") or ""), F["fina"])
    col = 0.0
    if visto:
        texto(der, 246.6, "CÓDIGO", F["media"], 14, gris, 1.5, derecha=True)
        texto(der, 273.8, visto, F["negra"], tam_c, tinta, derecha=True)
        col = max(ancho("CÓDIGO", F["media"], 14, 1.5), ancho(visto, F["negra"], tam_c))
    if mes:
        texto(der, 296.8, mes, F["fina"], 15, gris, derecha=True)
    if clave:
        texto(der - (ancho(mes, F["fina"], 15) + 8 if mes else 0), 296.8, clave, F["negra"], 17, gris, 2, derecha=True)
    col = max(col, ancho(clave, F["negra"], 17, 2) + (ancho(mes, F["fina"], 15) + 8 if mes and clave else ancho(mes, F["fina"], 15)))

    # ── Abajo a la izquierda: código de barras (el del producto; si no tiene, su código, para «Consultar precio») ──
    hueco = der - izq - (col + 16 if col else 0)
    if ean:
        mods = _ean_modulos(ean)
        m = min(209.0 / 95, hueco / len(mods))
        if m * k >= 0.62:          # más fino no lo lee el lector
            c.setFillColor(colors.black)
            i = 0
            while i < len(mods):
                if mods[i] == "1":
                    j = i
                    while j < len(mods) and mods[j] == "1":
                        j += 1
                    c.rect(X(izq + i * m), Y(279), (j - i) * m * k, 44 * k, stroke=0, fill=1)
                    i = j
                else:
                    i += 1
            texto(izq, 297, ean, F["fina"], 15, tinta, 3)
    elif codigo:
        d = _barras(codigo, hueco * k, 44 * k)
        if d is not None:
            renderPDF.draw(d, c, X(izq), Y(300))
    c.setFillColor(colors.black)


def _balda_pos(i: int, dx: float, dy: float) -> tuple:
    """Esquina inferior izquierda (puntos) de la pegatina i (0–11) del folio. dx a la derecha, dy hacia abajo."""
    col, fila = i % BALDA["cols"], i // BALDA["cols"]
    x = BALDA["izq"] + col * BALDA["ancho"] + dx
    y_arriba = BALDA["arriba"] + fila * BALDA["alto"] + dy
    return mm_to_points(x), mm_to_points(A4_H_MM - y_arriba - BALDA["alto"])


def generate_shelf_labels_pdf(items: list, inicio: int = 1, dx: float = 0.0, dy: float = 0.0,
                              marco: bool = False, marca: str = "esquina") -> bytes:
    """PDF A4 con las etiquetas de balda. `inicio` (1–12): por qué pegatina empezar, para aprovechar un
    folio a medio usar. dx/dy: ajuste de la impresora en mm. `marco`: dibuja el borde de cada pegatina."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle("Etiquetas de balda · Casa Fonso")
    w, h = mm_to_points(BALDA["ancho"]), mm_to_points(BALDA["alto"])
    pos = max(0, min(BALDA_POR_HOJA - 1, int(inicio or 1) - 1))
    for n, it in enumerate(items):
        if n and pos == 0:
            c.showPage()
        x, y = _balda_pos(pos, dx, dy)
        if marco:
            c.setStrokeColor(colors.HexColor("#BBBBBB"))
            c.setLineWidth(0.4)
            c.rect(x, y, w, h)
        _etiqueta_balda(c, it, x, y, w, h, marca)
        pos = (pos + 1) % BALDA_POR_HOJA
    if not items:
        c.setFont("Helvetica", 12)
        c.drawString(mm_to_points(20), mm_to_points(270), "No hay etiquetas que imprimir.")
    c.save()
    return buf.getvalue()


def generate_shelf_test_pdf(dx: float = 0.0, dy: float = 0.0) -> bytes:
    """Hoja de prueba: el contorno de las 12 pegatinas. Se imprime en un folio normal y se pone encima de
    un folio de pegatinas al trasluz; si no coincide, se corrige con el ajuste."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle("Prueba de etiquetas · Casa Fonso")
    w, h = mm_to_points(BALDA["ancho"]), mm_to_points(BALDA["alto"])
    for i in range(BALDA_POR_HOJA):
        x, y = _balda_pos(i, dx, dy)
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.5)
        c.rect(x, y, w, h)
        cx, cy = x + w / 2, y + h / 2
        c.line(cx - 8, cy, cx + 8, cy)
        c.line(cx, cy - 8, cx, cy + 8)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(x + 10, y + h - 18, f"Pegatina {i + 1}")
        c.setFont("Helvetica", 7.5)
        if i == 0:
            c.drawString(x + 10, y + 24, "Imprime a TAMAÑO REAL (100 %), sin «ajustar a la página».")
            c.drawString(x + 10, y + 14, "Pon esta hoja sobre un folio de pegatinas, al trasluz.")
        elif i == 1:
            c.drawString(x + 10, y + 24, "Si el recuadro no coincide con la pegatina, mide cuánto")
            c.drawString(x + 10, y + 14, "se va (mm) y ponlo en «Ajustar impresora».")
    c.setFont("Helvetica", 7)
    c.drawString(mm_to_points(8), mm_to_points(8), f"Casa Fonso · prueba de etiquetas 97 × 42,3 mm · ajuste: {dx:+.1f} mm a la derecha, {dy:+.1f} mm hacia abajo")
    c.save()
    return buf.getvalue()
