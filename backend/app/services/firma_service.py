"""
Firma de albaranes de venta (treyFACT).

- parse_albaran: lee nº de albarán, fecha, código y nombre de cliente del PDF.
- stamp_signature: incrusta la firma, el nombre y la fecha/hora en la última página
  (en el hueco libre sobre el cuadro de impuestos) o, si no cabe, en una página nueva.
"""
import io
import re
from dataclasses import dataclass, asdict
from typing import Optional

import pdfplumber
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

SLOT_W, SLOT_H, SLOT_MARGIN = 250, 100, 8


@dataclass
class AlbaranMeta:
    numero: str = ""
    fecha: str = ""          # YYYY-MM-DD
    codigo_cliente: str = ""
    cliente: str = ""
    obra: str = ""
    importe: Optional[float] = None
    page_count: int = 1

    def dict(self):
        return asdict(self)


def _row_right_of(words, label_words, max_dx=260):
    """Primera palabra a la derecha de una etiqueta, en la misma línea."""
    last = label_words[-1]
    cands = [w for w in words
             if abs(w["top"] - last["top"]) < 3 and w["x0"] > last["x1"] - 1 and w["x0"] - last["x0"] < max_dx
             and w not in label_words]
    return min(cands, key=lambda w: w["x0"])["text"] if cands else ""


def _find_seq(words, seq):
    """Busca una secuencia de palabras consecutivas en la misma línea (ignora mayúsculas/tildes)."""
    norm = lambda s: s.lower().replace("ó", "o").replace("á", "a")
    for i in range(len(words) - len(seq) + 1):
        grp = words[i:i + len(seq)]
        if all(norm(g["text"]) == norm(s) for g, s in zip(grp, seq)) and \
                all(abs(g["top"] - grp[0]["top"]) < 3 for g in grp):
            return grp
    return None


def parse_importe(text: str) -> Optional[float]:
    """Total del albarán: 'TOTAL 1.234,56 €' en el pie de la última página."""
    found = re.findall(r"\bTOTAL\s+(-?[\d.]+,\d{2})\s*€", text)
    if not found:
        return None
    try:
        return float(found[-1].replace(".", "").replace(",", "."))
    except ValueError:
        return None


def parse_albaran(pdf_bytes: bytes, filename: str = "") -> AlbaranMeta:
    meta = AlbaranMeta()
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        meta.page_count = len(pdf.pages)
        page = pdf.pages[0]
        words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
        text = page.extract_text() or ""
        last_text = pdf.pages[-1].extract_text() or ""
    meta.importe = parse_importe(last_text)

    m = re.search(r"ALBAR[ÁA]N\s+([A-Z]{1,3})\s*-\s*(\d+)", text, re.I)
    if m:
        meta.numero = f"{m.group(1).upper()}-{m.group(2)}"
    else:
        f = re.search(r"([A-Z]{1,3})_(\d{5,})", filename or "")
        meta.numero = f"{f.group(1)}-{f.group(2)}" if f else re.sub(r"\.pdf$", "", filename or "", flags=re.I)

    lbl = _find_seq(words, ["Código", "cliente"])
    cod = _row_right_of(words, lbl) if lbl else ""
    if not cod.isdigit():
        mc = re.search(r"C[óo]digo\s+cliente\s+(\d+)", text, re.I)
        cod = mc.group(1) if mc else ""
    meta.codigo_cliente = cod

    lbl = _find_seq(words, ["Fecha"])
    fe = _row_right_of(words, lbl) if lbl else ""
    if not re.fullmatch(r"\d{2}/\d{2}/\d{4}", fe):
        mf = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", text)
        fe = mf.group(1) if mf else ""
    if fe:
        d, mo, y = fe.split("/")
        meta.fecha = f"{y}-{mo}-{d}"

    lbl = _find_seq(words, ["DATOS", "CLIENTE"])
    if lbl:
        x0, bottom = lbl[0]["x0"], lbl[0]["bottom"]
        cands = [w for w in words if w["x0"] >= x0 - 3 and bottom - 1 < w["top"] < bottom + 20]
        first = min((w["top"] for w in cands), default=None)
        line = [w for w in cands if first is not None and abs(w["top"] - first) < 3]
        meta.cliente = " ".join(w["text"] for w in sorted(line, key=lambda w: w["x0"])).strip()

    lbl = _find_seq(words, ["REFERENCIA"])
    if lbl:
        meta.obra = _row_right_of(words, lbl)
    return meta


def _find_slot(pdf_bytes: bytes) -> Optional[tuple]:
    """Hueco libre en la última página entre las líneas del albarán y el cuadro 'Base / % IVA'.
    Devuelve (x, y, w, h) en coordenadas PDF (origen abajo-izquierda) o None."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page = pdf.pages[-1]
        W, H = page.width, page.height
        words = page.extract_words()
    bases = [w for w in words if w["text"] == "Base" and w["x0"] < 150]
    if not bases:
        return None
    base = min(bases, key=lambda w: w["top"])
    floor_top = base["top"] - 10                      # límite inferior del hueco (desde arriba)
    above = [w["bottom"] for w in words if w["bottom"] < floor_top]
    if not above:
        return None
    ceil_top = max(above)                              # última línea de artículos
    if floor_top - ceil_top < SLOT_H + 2 * SLOT_MARGIN:
        return None
    y = H - floor_top + SLOT_MARGIN
    return (W - 30 - SLOT_W, y, SLOT_W, SLOT_H)


def _draw_box(c, box, sig_png: bytes, nombre: str, dni: str, firmado_el: str):
    x, y, w, h = box
    ink, grey = Color(0.1, 0.1, 0.1), Color(0.45, 0.45, 0.45)
    c.setStrokeColor(Color(0.75, 0.75, 0.75))
    c.setLineWidth(0.6)
    c.rect(x, y, w, h)
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 8, y + h - 13, "Recibí conforme")
    img = ImageReader(io.BytesIO(sig_png))
    iw, ih = img.getSize()
    area_w, area_h = w - 16, h - 46
    sc = min(area_w / iw, area_h / ih)
    dw, dh = iw * sc, ih * sc
    c.drawImage(img, x + 8 + (area_w - dw) / 2, y + 30 + (area_h - dh) / 2, dw, dh, mask="auto")
    c.setStrokeColor(grey)
    c.setLineWidth(0.5)
    c.line(x + 8, y + 28, x + w - 8, y + 28)
    who = nombre + (f"   DNI {dni}" if dni else "")
    c.setFont("Helvetica", 8)
    c.drawString(x + 8, y + 17, who[:60])
    c.setFillColor(grey)
    c.setFont("Helvetica", 7)
    c.drawString(x + 8, y + 7, f"Firmado el {firmado_el}")


def stamp_signature(pdf_bytes: bytes, sig_png: bytes, numero: str, cliente: str,
                    nombre: str, dni: str, firmado_el: str) -> bytes:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    for p in reader.pages:
        writer.add_page(p)
    last = writer.pages[-1]
    W, H = float(last.mediabox.width), float(last.mediabox.height)

    slot = _find_slot(pdf_bytes)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H))
    if slot:
        _draw_box(c, slot, sig_png, nombre, dni, firmado_el)
        c.save()
        last.merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])
    else:
        c.setFont("Helvetica-Bold", 16)
        c.drawString(40, H - 70, "Conformidad de entrega")
        c.setFont("Helvetica", 10)
        c.drawString(40, H - 92, f"Albarán {numero}" + (f"  –  {cliente}" if cliente else ""))
        _draw_box(c, (40, H - 230, SLOT_W, SLOT_H), sig_png, nombre, dni, firmado_el)
        c.save()
        writer.add_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
