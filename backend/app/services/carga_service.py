"""Lee una hoja de la libreta (foto o texto dictado) y la convierte en entregas con sus materiales.
También hace la hoja de entrega en PDF (sin precios) con la firma del cliente."""
import io
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

from app.config import settings

logger = logging.getLogger(__name__)
MADRID = ZoneInfo("Europe/Madrid")
LOGO = Path(__file__).resolve().parent.parent / "assets" / "logo-horizontal.png"

PROMPT = """Eres quien pasa a limpio las hojas de la libreta de pedidos de Casa Fonso, \
un almacén de materiales de construcción de Boal y Villayón (Asturias). En la libreta se apunta \
a mano lo que hay que cargar en el camión para llevar a cada cliente.

Cómo se escribe en esta libreta (respétalo):
- Primera línea de cada pedido: el cliente, a veces con un guion y el pueblo o la obra \
(«Mari Carmen - Arbón»), y el teléfono entre paréntesis.
- «Ser.» o «Serv.» al margen = SERVIR: hay que llevarlo a la obra (servir = true). \
Si pone «recoge» o similar, servir = false.
- «s/» = sacos («10 s/ cemento» = 10 sacos de cemento).
- «B» detrás de un material = en BOLSA (big bag): «2 m³ trito en B» = 2 m³ de trito en bolsa.
- «trito» es un árido triturado: escríbelo «trito».
- «Ø12» = diámetro 12 mm; «varillas T Ø12» = varillas corrugadas de Ø12.
- «PAGADO» = ya está pagado (pagado = true).
- Los números que van detrás del material, a veces en otro color (rojo), son PRECIOS o importes \
apuntados después: NO son cantidades, ignóralos y no los pongas en ningún sitio.
- Frases como «esta semana», «el martes», «por la mañana» van en «cuando».
- Una raya horizontal separa un pedido del siguiente. Si hay varios clientes, haz una entrega por cliente.

Escribe los materiales claros y completos, en minúsculas salvo la primera letra \
(«Sacos de cemento», «Trito en bolsa», «Varillas corrugadas Ø12»). La unidad va aparte \
(«sacos», «m³», «ud», «kg», «m», «palés»…); si la unidad ya está en la descripción, no la repitas.
En «original» copia la línea tal como está escrita (sin el precio).
Si algo no se lee bien o no estás seguro, pon tu mejor lectura y explica la duda en «duda» (corto). \
Si estás seguro, deja «duda» en null.
{pistas}
Devuelve SOLO este JSON, sin texto antes ni después:
{{"entregas": [{{"cliente": str, "lugar": str|null, "telefono": str|null, "cuando": str|null, \
"servir": bool, "pagado": bool, "notas": str|null, "dudas": str|null, \
"lineas": [{{"cantidad": number|null, "unidad": str|null, "descripcion": str, "original": str|null, "duda": str|null}}]}}]}}"""


def _pistas(db) -> str:
    """Lo aprendido de hojas anteriores: clientes y cómo se corrigieron los materiales."""
    from app.models.carga import EntregaCarga, LineaCarga
    partes = []
    try:
        clientes = [c for (c,) in db.query(EntregaCarga.cliente).filter(EntregaCarga.cliente != "")
                    .order_by(EntregaCarga.id.desc()).limit(200).all()]
        vistos = list(dict.fromkeys(clientes))[:60]
        if vistos:
            partes.append("Clientes que ya han salido antes (si el nombre se parece, usa este): " + "; ".join(vistos))
        pares = (db.query(LineaCarga.original, LineaCarga.descripcion, LineaCarga.unidad)
                 .filter(LineaCarga.original.isnot(None)).order_by(LineaCarga.id.desc()).limit(300).all())
        ejemplos, vistos_o = [], set()
        for o, d, u in pares:
            k = (o or "").strip().lower()
            if k and k not in vistos_o and d:
                vistos_o.add(k)
                ejemplos.append(f"«{o}» → {d}{f' ({u})' if u else ''}")
            if len(ejemplos) >= 50:
                break
        if ejemplos:
            partes.append("Así se han pasado a limpio otras líneas (úsalo para entender abreviaturas):\n- " + "\n- ".join(ejemplos))
    except Exception as e:  # sin historial no pasa nada
        logger.warning("Sin pistas de cargas: %s", e)
    return ("\n" + "\n\n".join(partes) + "\n") if partes else ""


def _json(texto: str) -> dict:
    t = texto.strip()
    if t.startswith("```"):
        t = re.sub(r"```[a-z]*\n?", "", t).strip().rstrip("`").strip()
    i, j = t.find("{"), t.rfind("}")
    return json.loads(t[i:j + 1] if i >= 0 and j > i else t)


async def leer(db, fotos: List[str], texto: Optional[str] = None) -> dict:
    """Lee las fotos (rutas) y/o el texto dictado. Devuelve {"entregas": [...]}."""
    if not settings.anthropic_api_key:
        raise ValueError("Falta la clave de la IA en el servidor (ANTHROPIC_API_KEY).")
    import anthropic
    from app.services.extraction_service import _image_to_base64_block

    contenido: list = []
    for f in fotos[:10]:
        try:
            contenido.append(_image_to_base64_block(f))
        except Exception as e:
            logger.warning("No se pudo abrir la foto %s: %s", f, e)
    if fotos and not contenido:
        raise ValueError("No se pudo abrir la foto. Prueba a sacarla otra vez.")
    pedir = "Pasa a limpio " + ("esta hoja de la libreta" if len(contenido) == 1 else "estas hojas de la libreta" if contenido else "este pedido")
    if texto and texto.strip():
        pedir += (". Además, esto es lo que se ha dictado o escrito" if contenido else ", que se ha dictado o escrito así") + f":\n«{texto.strip()}»"
    contenido.append({"type": "text", "text": pedir + "."})

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    sistema = PROMPT.format(pistas=_pistas(db))
    ultimo = ""
    for intento in range(2):
        msg = await client.messages.create(
            model=settings.claude_model, max_tokens=4096, system=sistema,
            messages=[{"role": "user", "content": contenido}],
        )
        ultimo = msg.content[0].text
        try:
            datos = _json(ultimo)
            if isinstance(datos.get("entregas"), list):
                return datos
        except Exception:
            pass
        contenido = contenido[:-1] + [{"type": "text", "text": pedir + ". Responde SOLO con el JSON pedido."}]
    raise ValueError(f"La IA no devolvió una lista válida: {ultimo[:200]}")


# ── Hoja de entrega en PDF ───────────────────────────────────────────────
def _num(n: Optional[float]) -> str:
    if n is None:
        return ""
    return (f"{n:.2f}".rstrip("0").rstrip(".")).replace(".", ",")


def hoja_pdf(e, firma_png: Optional[bytes]) -> bytes:
    """Hoja de entrega de una entrega: cliente, materiales y cantidades, firma. Sin precios."""
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfgen import canvas

    verde, bosque, gris, linea = HexColor("#2FAE66"), HexColor("#1F5A3A"), HexColor("#6B7468"), HexColor("#E3E8E0")
    W, H = A4
    M = 46
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Hoja de entrega {e.numero or e.id}")

    def cabecera():
        y = H - M
        if LOGO.exists():
            c.drawImage(ImageReader(str(LOGO)), M, y - 40, width=185, height=40, mask="auto")
        c.setFillColor(gris); c.setFont("Helvetica", 8.5)
        for i, t in enumerate(["Manuel Fernández Fernández · CIF 10770071E",
                               "Boal y Villayón (Asturias) · Tel. 985 62 04 81",
                               "casafonsomc@gmail.com"]):
            c.drawRightString(W - M, y - 10 - i * 11, t)
        c.setFillColor(bosque); c.setFont("Helvetica-Bold", 20)
        c.drawString(M, y - 82, "HOJA DE ENTREGA")
        c.setFont("Helvetica", 10); c.setFillColor(gris)
        c.drawRightString(W - M, y - 82, f"N.º {e.numero or e.id}")
        c.setStrokeColor(verde); c.setLineWidth(2.5); c.line(M, y - 92, W - M, y - 92)
        return y - 116

    y = cabecera()
    fecha = (e.firmado_at.replace(tzinfo=ZoneInfo("UTC")).astimezone(MADRID) if e.firmado_at
             else datetime.now(MADRID))

    # Datos del cliente
    c.setFillColor(gris); c.setFont("Helvetica", 8.5)
    c.drawString(M, y, "CLIENTE"); c.drawString(W / 2 + 10, y, "FECHA DE ENTREGA")
    c.setFillColor(HexColor("#1A1A1A")); c.setFont("Helvetica-Bold", 13)
    c.drawString(M, y - 16, (e.cliente or "—")[:48])
    c.setFont("Helvetica", 11)
    c.drawString(W / 2 + 10, y - 16, fecha.strftime("%d/%m/%Y · %H:%M"))
    yy = y - 32
    c.setFont("Helvetica", 10.5); c.setFillColor(HexColor("#4A5249"))
    if e.lugar:
        c.drawString(M, yy, f"Lugar: {e.lugar}"[:70]); yy -= 14
    if e.telefono:
        c.drawString(M, yy, f"Teléfono: {e.telefono}"); yy -= 14
    y = min(yy, y - 46) - 14

    # Tabla de materiales
    col_c, col_u = M + 70, M + 140
    def cab_tabla(y):
        c.setFillColor(HexColor("#F2F4F0")); c.rect(M, y - 6, W - 2 * M, 22, stroke=0, fill=1)
        c.setFillColor(gris); c.setFont("Helvetica-Bold", 9)
        c.drawRightString(col_c - 10, y + 1, "CANTIDAD"); c.drawString(col_c, y + 1, "UNIDAD")
        c.drawString(col_u, y + 1, "MATERIAL")
        return y - 24

    y = cab_tabla(y)
    pendientes = []
    for ln in e.lineas:
        llevado = ln.cantidad if ln.cargado_ok else ln.cargado
        if ln.cantidad is not None and (llevado or 0) < ln.cantidad:
            pendientes.append(ln)
        if not ln.cargado_ok and not ln.cargado:
            continue  # lo que no se ha cargado no sale como entregado
        partes = simpleSplit(ln.descripcion or "", "Helvetica", 11, W - M - col_u)
        alto = 16 * max(1, len(partes)) + 6
        if y - alto < 210:
            c.showPage(); y = cab_tabla(cabecera())
        c.setFillColor(HexColor("#1A1A1A")); c.setFont("Helvetica-Bold", 11.5)
        c.drawRightString(col_c - 10, y, _num(llevado))
        c.setFont("Helvetica", 11); c.drawString(col_c, y, (ln.unidad or "")[:10])
        for i, p in enumerate(partes or [""]):
            c.drawString(col_u, y - i * 16, p)
        y -= alto
        c.setStrokeColor(linea); c.setLineWidth(.6); c.line(M, y + 8, W - M, y + 8)

    if pendientes:
        y -= 6
        c.setFillColor(gris); c.setFont("Helvetica-Oblique", 9.5)
        txt = "Queda pendiente de entregar: " + "; ".join(
            f"{_num((p.cantidad or 0) - ((p.cantidad if p.cargado_ok else p.cargado) or 0))} {p.unidad or ''} {p.descripcion}".replace("  ", " ")
            for p in pendientes)
        for i, p in enumerate(simpleSplit(txt, "Helvetica-Oblique", 9.5, W - 2 * M)[:4]):
            c.drawString(M, y - i * 12, p)
        y -= 12 * min(4, len(simpleSplit(txt, "Helvetica-Oblique", 9.5, W - 2 * M))) + 4

    # Firma
    if y < 200:
        c.showPage(); cabecera()
    caja_y = M + 40
    c.setStrokeColor(linea); c.setLineWidth(1)
    c.roundRect(M, caja_y, W - 2 * M, 120, 10, stroke=1, fill=0)
    c.setFillColor(gris); c.setFont("Helvetica", 8.5)
    c.drawString(M + 14, caja_y + 104, "RECIBÍ CONFORME — FIRMA DEL CLIENTE")
    if firma_png:
        try:
            img = ImageReader(io.BytesIO(firma_png))
            iw, ih = img.getSize()
            esc = min(230 / iw, 78 / ih)
            c.drawImage(img, M + 14, caja_y + 16, width=iw * esc, height=ih * esc, mask="auto")
        except Exception as ex:
            logger.warning("No se pudo poner la firma en la hoja %s: %s", e.id, ex)
    c.setFillColor(HexColor("#1A1A1A")); c.setFont("Helvetica", 10.5)
    xd = W / 2 + 30
    if e.firmado_por:
        c.drawString(xd, caja_y + 78, f"Nombre: {e.firmado_por}"[:44])
    if e.firmado_dni:
        c.drawString(xd, caja_y + 60, f"DNI: {e.firmado_dni}")
    if e.firmado_at:
        c.drawString(xd, caja_y + 42, f"Firmado: {fecha.strftime('%d/%m/%Y %H:%M')}")
    c.setFillColor(gris); c.setFont("Helvetica", 8)
    c.drawCentredString(W / 2, M + 16, "Documento de entrega de material. No es factura ni albarán de venta.")
    c.save()
    return buf.getvalue()
