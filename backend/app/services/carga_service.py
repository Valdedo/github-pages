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
LOGO = Path(__file__).resolve().parent.parent / "assets" / "logo-albaran.png"

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


LOPD = ("De conformidad con la Ley Orgánica 15/1999, de 13 de diciembre, de Protección de Datos de Carácter Personal, "
        "se informa que los datos personales facilitados por usted están incorporados a un fichero titularidad de "
        "MANUEL FERNANDEZ FERNANDEZ cuya finalidad es el mantenimiento, gestión y prestación de los servicios solicitados, "
        "así como el mantenimiento de comunicaciones de carácter informativo. Por último, se le informa de que le asisten "
        "los derechos de acceso, modificación, oposición y cancelación, que podrá ejercitar mediante petición escrita gratuita "
        "dirigida a MANUEL FERNANDEZ FERNANDEZ LLAVIADA S/N 33720 BOAL (ASTURIAS), a la atención del Responsable del Tratamiento")


def hoja_pdf(e, firma_png: Optional[bytes]) -> bytes:
    """Hoja de entrega con el mismo aspecto que los albaranes de TreyFACT de Casa Fonso,
    pero sin precios y con la firma del cliente donde van los totales."""
    from reportlab.lib.colors import HexColor, black, white
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfgen import canvas

    W, H = A4
    gris_caja, gris_cab, gris_txt = HexColor("#EFEFEF"), HexColor("#DCDCDC"), HexColor("#7A7A7A")
    X0, X1 = 30, W - 30
    T = lambda top: H - top  # coordenadas medidas desde arriba, como en el albarán original

    fecha = (e.firmado_at.replace(tzinfo=ZoneInfo("UTC")).astimezone(MADRID) if e.firmado_at
             else datetime.now(MADRID))

    # Filas de la tabla: lo cargado; lo que no, va como pendiente
    filas, pendientes = [], []
    for ln in e.lineas:
        llevado = ln.cantidad if ln.cargado_ok else ln.cargado
        if ln.cantidad is not None and (llevado or 0) < ln.cantidad:
            falta = ln.cantidad - (llevado or 0)
            pendientes.append(f"{_num(falta)} {ln.unidad or ''} {ln.descripcion}".replace("  ", " ").strip())
        if ln.cargado_ok or ln.cargado:
            filas.append((ln, llevado))

    # Reparto en páginas: unas 17 filas por página; la firma va en la última
    lineas_txt = []
    for ln, llevado in filas:
        partes = simpleSplit((ln.descripcion or "").upper(), "Helvetica", 7.6, 230) or [""]
        lineas_txt.append((partes, llevado, ln.unidad or ""))
    paginas, actual, alto = [], [], 0
    LIMITE = 340  # alto útil de la tabla (pt)
    for item in lineas_txt:
        h = 20 + 9 * (len(item[0]) - 1)
        if actual and alto + h > LIMITE:
            paginas.append(actual); actual, alto = [], 0
        actual.append(item); alto += h
    paginas.append(actual)
    total_pag = len(paginas)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Hoja de entrega {e.numero or e.id}")

    def cabecera():
        if LOGO.exists():
            c.drawImage(ImageReader(str(LOGO)), 32, T(70), width=236, height=236 * 370 / 1285, mask="auto")
        # Datos de la empresa (izquierda)
        y = 98
        def t(txt, bold=False, size=8.2, gap=10.5):
            nonlocal y
            c.setFont("Helvetica-Bold" if bold else "Helvetica", size); c.setFillColor(black)
            c.drawString(X0 + 2, T(y), txt); y += gap
        t("Manuel Fernandez Fernandez", True, 8.4, 12); t("CIF: 10770071E", gap=17)
        t("ALMACÉN VILLAYÓN:", True, 7.4, 12); t("Valdedo, Villayon", gap=9.5); t("33719 (Asturias)", gap=9.5); t("Telf: 985 924 032", gap=17)
        t("ALMACÉN BOAL:", True, 7.4, 12); t("Llaviada, Boal", gap=9.5); t("33720 (Asturias)", gap=9.5); t("Telf: 985 620 481", gap=13)
        t("WhatsApp: 985 62 04 81", True, 8.4, 10.5); t("casafonsomc@gmail.com")

        # Caja gris con el número (derecha)
        bx = 297
        c.setFillColor(gris_caja); c.rect(bx, T(163), X1 - bx + 2, 91, stroke=0, fill=1)
        c.setFillColor(black); c.setFont("Helvetica-Bold", 12.5)
        c.drawRightString(X1 - 30, T(88), f"HOJA DE ENTREGA  {e.numero or e.id}")
        c.setFont("Helvetica-Bold", 8.2)
        c.drawString(bx + 10, T(106), "OBRA /"); c.drawString(bx + 10, T(116), "REFERENCIA")
        c.drawString(bx + 10, T(136), "Fecha"); c.drawString(bx + 10, T(151), "Hora")
        c.setFont("Helvetica", 8.2)
        if e.lugar:
            c.drawString(bx + 90, T(111), e.lugar.upper()[:38])
        c.drawString(bx + 90, T(136), fecha.strftime("%d/%m/%Y"))
        c.drawString(bx + 90, T(151), fecha.strftime("%H:%M"))

        # Datos del cliente
        c.setFillColor(gris_txt); c.setFont("Helvetica", 8.2); c.drawString(bx + 4, T(184), "DATOS CLIENTE")
        c.setFillColor(black); c.setFont("Helvetica-Bold", 9.6); c.drawString(bx + 4, T(196), (e.cliente or "—").upper()[:44])
        c.setFont("Helvetica", 8.2)
        y2 = 208
        for txt in [e.lugar and e.lugar.upper(), e.telefono, "SERVIR EN OBRA" if e.servir else "RECOGE EN ALMACÉN"]:
            if txt:
                c.drawString(bx + 4, T(y2), txt[:56]); y2 += 11

        # Cabecera de la tabla
        c.setStrokeColor(black); c.setLineWidth(.6)
        c.line(X0, T(258), X1, T(258)); c.line(X0, T(272), X1, T(272))
        c.setFont("Helvetica-Bold", 8.2)
        c.drawString(X0 + 2, T(268), "CODIGO"); c.drawString(110, T(268), "DESCRIPCION")
        c.drawRightString(388, T(268), "CANT."); c.drawString(410, T(268), "UNIDAD")

    def pie(n):
        c.setFillColor(black); c.setFont("Helvetica", 5.6)
        for i, ln in enumerate(simpleSplit(LOPD, "Helvetica", 5.6, X1 - X0)):
            c.drawString(X0, T(788 + i * 6.6), ln)
        c.setFont("Helvetica", 8); c.drawRightString(X1, T(822), f"Página {n} de {total_pag}")
        c.setFillColor(gris_txt); c.setFont("Helvetica", 7)
        c.drawString(X0, T(822), "Documento de entrega de material. No es factura ni albarán valorado.")

    for n, filas_pag in enumerate(paginas, 1):
        cabecera()
        y = 290
        c.setFillColor(black)
        for partes, llevado, unidad in filas_pag:
            c.setFont("Helvetica", 7.6)
            for i, p in enumerate(partes):
                c.drawString(110, T(y + i * 9), p)
            c.drawRightString(388, T(y), f"{llevado:.2f}".replace(".", ",") if llevado is not None else "")
            c.drawString(410, T(y), unidad)
            y += 20 + 9 * (len(partes) - 1)
        if n == total_pag and pendientes:
            c.setFont("Helvetica-Oblique", 7.6); c.setFillColor(gris_txt)
            txt = "QUEDA PENDIENTE DE ENTREGAR: " + "; ".join(pendientes).upper()
            for i, p in enumerate(simpleSplit(txt, "Helvetica-Oblique", 7.6, 440)[:4]):
                c.drawString(110, T(y + 4 + i * 9.5), p)

        if n < total_pag:
            c.setFillColor(gris_txt); c.setFont("Helvetica", 8); c.drawRightString(X1, T(650), "Sigue en la página siguiente")
        else:
            # Zona de firma, donde el albarán lleva los totales
            top = 643
            c.setFillColor(gris_cab); c.rect(X0 + 2, T(top + 13), 325, 13, stroke=0, fill=1)
            c.setFillColor(black); c.setFont("Helvetica", 7.8)
            c.drawString(X0 + 12, T(top + 9.5), "Recibí conforme — firma del cliente")
            c.setStrokeColor(HexColor("#BBBBBB")); c.setLineWidth(.6)
            c.rect(X0 + 2, T(top + 112), 325, 99, stroke=1, fill=0)
            if firma_png:
                try:
                    img = ImageReader(io.BytesIO(firma_png))
                    iw, ih = img.getSize()
                    esc = min(290 / iw, 84 / ih)
                    c.drawImage(img, X0 + 2 + (325 - iw * esc) / 2, T(top + 106), width=iw * esc, height=ih * esc, mask="auto")
                except Exception as ex:
                    logger.warning("No se pudo poner la firma en la hoja %s: %s", e.id, ex)

            # Columna de datos de la firma (como Bruto / Neto…)
            lx, vx = 412, X1
            c.setFillColor(gris_caja); c.rect(lx, T(top + 92), 80, 92, stroke=0, fill=1)
            filas_f = [("Firmado por", (e.firmado_por or "")[:22]), ("DNI", e.firmado_dni or ""),
                       ("Fecha", fecha.strftime("%d/%m/%Y") if e.firmado_at else ""),
                       ("Hora", fecha.strftime("%H:%M") if e.firmado_at else ""),
                       ("Pendiente", "Sí" if pendientes else "No")]
            for i, (k, v) in enumerate(filas_f):
                yy = top + 12 + i * 17
                c.setFillColor(black); c.setFont("Helvetica", 7.8); c.drawRightString(lx + 74, T(yy), k)
                c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 7.8); c.drawRightString(vx, T(yy), v)
            c.setFillColor(HexColor("#3C3C3C")); c.rect(lx, T(top + 114), 80, 20, stroke=0, fill=1)
            c.setFillColor(white); c.setFont("Helvetica-Bold", 10.5); c.drawCentredString(lx + 40, T(top + 108), "ENTREGADO" if e.firmado_at else "SIN FIRMAR")
            c.setFillColor(black); c.setFont("Helvetica-Bold", 9.5)
            c.drawRightString(vx, T(top + 108), f"{len(filas)} línea{'s' if len(filas) != 1 else ''}")
        pie(n)
        c.showPage()
    c.save()
    return buf.getvalue()
