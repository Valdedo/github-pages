"""Guarda cada albarán de proveedor en Drive en cuanto la app lo lee.

Carpeta: ALBARANES/<PROVEEDOR>/ (la misma que usa el script de facturas).
Nombre: «AAAA-MM-DD_<Proveedor>_Albarán <nº>.pdf». Las fotos y los escaneos se convierten
a PDF con el texto reconocido (OCR), para poder buscar cualquier palabra desde Drive.

La carpeta se elige así:
1. La que se eligió a mano para ese proveedor (se recuerda).
2. La que coincide claramente con el nombre del proveedor.
3. Si no está clara: «_Pendientes de clasificar», y en la app se elige una vez.
Los que la app no consigue leer también se guardan (en «_Pendientes de clasificar»): al subir un montón de
albaranes, ninguno se queda sin copia. Al volver a leerlos pasan a su carpeta con su nombre.
Solo se guardan los albaranes subidos desde que existe esta función.
"""
import io
import logging
import re
import threading
import time
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from app.config import settings
from app.services import mail_service

logger = logging.getLogger(__name__)
TZ = ZoneInfo("Europe/Madrid")
PENDIENTES = "_Pendientes de clasificar"
_RUIDO = {"S", "A", "L", "U", "SA", "SL", "SLU", "SAU", "SC", "SCL", "CB", "SOCIEDAD", "LIMITADA", "ANONIMA",
          "DE", "DEL", "Y", "E", "EL", "LA", "LOS", "LAS", "GRUPO", "IBERICA", "IBERICO", "ESPANA", "SPAIN",
          "HIJOS", "HNOS", "HERMANOS", "COMERCIAL", "DISTRIBUCION", "DISTRIBUCIONES", "INDUSTRIAL", "INDUSTRIAS"}
_cache: dict = {"at": 0.0, "lista": None}
_lock = threading.Lock()


def _tokens(s: str) -> set:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()
    return {t for t in re.split(r"[^A-Z0-9]+", s) if t and t not in _RUIDO and len(t) > 1}


def clave(nombre: str) -> str:
    return " ".join(sorted(_tokens(nombre)))


def carpetas(refrescar: bool = False) -> list:
    """Subcarpetas de ALBARANES: [{id, name}] (se guarda 2 min; eran 10 y una carpeta recién creada en Drive no salía)."""
    if refrescar or _cache["lista"] is None or time.time() - _cache["at"] > 120:
        _cache["lista"] = sorted(mail_service.drive_carpetas(settings.drive_albaranes_id), key=lambda c: c["name"].upper())
        _cache["at"] = time.time()
    return _cache["lista"]


def adivinar(proveedor: str, lista: list) -> Optional[dict]:
    """La carpeta cuyo nombre encaja claramente con el proveedor (o None)."""
    tp = _tokens(proveedor)
    if not tp:
        return None
    mejores = []
    for c in lista:
        if c["name"].startswith("_"):
            continue
        tc = _tokens(re.sub(r"\(.*?\)", " ", c["name"])) or _tokens(c["name"])
        if not tc:
            continue
        comunes = tp & tc
        if not comunes:
            continue
        # Todas las palabras de la carpeta están en el proveedor (o al revés)
        puntos = len(comunes) / len(tc) if tc <= tp else len(comunes) / len(tp) if tp <= tc else len(comunes) / len(tp | tc)
        mejores.append((puntos, len(comunes), c))
    if not mejores:
        return None
    mejores.sort(key=lambda x: (x[0], x[1]), reverse=True)
    puntos, _, c = mejores[0]
    empate = len(mejores) > 1 and mejores[1][0] == puntos and mejores[1][1] == mejores[0][1]
    return c if puntos >= 0.99 and not empate else None


def _ocr_pdf(imagenes: list) -> Optional[bytes]:
    """PDF con el texto reconocido por debajo (se puede buscar en Drive). None si no hay OCR."""
    try:
        import pytesseract
        from pypdf import PdfReader, PdfWriter
        langs = pytesseract.get_languages(config="")
        lang = "spa" if "spa" in langs else "eng"
        w = PdfWriter()
        for im in imagenes:
            pag = pytesseract.image_to_pdf_or_hocr(im, extension="pdf", lang=lang)
            for pg in PdfReader(io.BytesIO(pag)).pages:
                w.add_page(pg)
        buf = io.BytesIO()
        w.write(buf)
        return buf.getvalue()
    except Exception as e:
        logger.warning("OCR no disponible, se guarda sin texto: %s", e)
        return None


def _tiene_texto(pdf: bytes) -> bool:
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf)) as p:
            return sum(len((pg.extract_text() or "").strip()) for pg in p.pages[:3]) > 40
    except Exception:
        return True


def _pdf(doc, paginas: list) -> bytes:
    """PDF para Drive, siempre con texto buscable (las fotos y los escaneos pasan por OCR)."""
    if doc.doc_type == "pdf":
        datos = Path(doc.file_path).read_bytes()
        if _tiene_texto(datos):
            return datos
        try:  # PDF escaneado sin texto: se reconoce
            from pdf2image import convert_from_bytes
            ocr = _ocr_pdf(convert_from_bytes(datos, dpi=250, last_page=10))
            return ocr or datos
        except Exception:
            return datos
    from PIL import Image, ImageOps
    imgs = []
    for p in paginas:
        im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        im.thumbnail((2600, 2600))
        imgs.append(im)
    ocr = _ocr_pdf(imgs)
    if ocr:
        return ocr
    buf = io.BytesIO()
    imgs[0].save(buf, "PDF", save_all=True, append_images=imgs[1:], resolution=200)
    return buf.getvalue()


def _limpio(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|\n\r]+', " ", s or "").strip()[:80]


def nombre_archivo(doc) -> str:
    if doc.doc_date:
        fecha = doc.doc_date.isoformat()
    elif doc.created_at:
        fecha = doc.created_at.date().isoformat()
    else:
        fecha = datetime.now(TZ).date().isoformat()
    prov = _limpio(doc.supplier_name)
    if not prov and doc.status == "error":
        # No se pudo leer: se guarda con el nombre con el que salió del escáner, para encontrarlo en Drive
        original = _limpio(Path(doc.original_filename or "").stem) or "albarán"
        return f"{fecha}_Sin leer_{original} ({doc.id}).pdf"
    num = _limpio(doc.doc_number) or f"doc {doc.id}"
    return f"{fecha}_{prov or 'Proveedor'}_Albarán {num}.pdf"


def nombre_sin_pisar(db, doc) -> str:
    """Drive sustituye el archivo si ya hay uno con ese nombre. Dos albaranes distintos con el mismo proveedor,
    número y fecha (la hoja 2 escaneada aparte, o el mismo albarán escaneado dos veces) se pisaban: el primero
    que se subió conserva el nombre y los siguientes llevan «(2)», «(3)»…"""
    from app.models.document import Document
    nombre = nombre_archivo(doc)
    if not doc.doc_number or not doc.supplier_name:
        return nombre  # sin número el nombre ya lleva el id del albarán
    antes = [o for o in db.query(Document).filter(Document.id < doc.id, Document.supplier_name == doc.supplier_name,
                                                  Document.doc_number == doc.doc_number).all()
             if nombre_archivo(o) == nombre]
    return nombre if not antes else f"{nombre[:-4]} ({len(antes) + 1}).pdf"


def _desde(db) -> int:
    """Primer id que se guarda. La primera vez se fija en el último existente."""
    from app.models.document import Document
    from app.models.drive import DriveAjustes
    a = db.get(DriveAjustes, 1)
    if not a:
        ultimo = db.query(Document.id).order_by(Document.id.desc()).first()
        a = DriveAjustes(id=1, desde_doc_id=(ultimo[0] if ultimo else 0))
        db.add(a)
        db.commit()
    return a.desde_doc_id or 0


def preparar() -> None:
    """Al arrancar: fija desde qué albarán se empieza (los ya subidos no se tocan)."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        _desde(db)
    finally:
        db.close()


def guardar(doc_id: int, paginas: Optional[list] = None) -> None:
    from app.database import SessionLocal
    from app.models.document import Document
    from app.models.drive import DriveCarpeta
    if not mail_service.configured():
        return
    with _lock:
        db = SessionLocal()
        try:
            doc = db.get(Document, doc_id)
            if not doc or (doc.id <= _desde(db) and not doc.drive_file_id):
                return
            if paginas is None and doc.drive_file_id and " páginas - " in (doc.original_filename or ""):
                return  # al volver a leer un albarán de varias fotos no se pisa el PDF completo
            lista = carpetas()
            prov = doc.supplier_name or ""
            fijada = db.get(DriveCarpeta, clave(prov)) if prov else None
            if fijada:
                destino, pendiente = {"id": fijada.folder_id, "name": fijada.folder_name}, False
            else:
                destino = adivinar(prov, lista)
                if destino is None and time.time() - _cache["at"] > 20:
                    # Antes de mandarlo a pendientes se vuelve a mirar Drive: puede que la carpeta se acabe de crear
                    lista = carpetas(refrescar=True)
                    destino = adivinar(prov, lista)
                pendiente = destino is None
                if pendiente:
                    destino = next((c for c in lista if c["name"] == PENDIENTES), None)
                    if not destino:
                        raise RuntimeError(f"No encuentro la carpeta «{PENDIENTES}» en ALBARANES")
            nombre = nombre_sin_pisar(db, doc)
            res = mail_service.drive_guardar(destino["id"], nombre, _pdf(doc, paginas or [doc.file_path]))
            anterior = doc.drive_file_id
            ya_avisado = bool(anterior and doc.drive_pendiente)
            doc.drive_file_id, doc.drive_url = res.get("id"), res.get("url")
            doc.drive_carpeta_id, doc.drive_carpeta, doc.drive_pendiente = destino["id"], destino["name"], pendiente
            doc.drive_error, doc.drive_at = None, datetime.now(TZ).replace(tzinfo=None)
            db.commit()
            if anterior and anterior != doc.drive_file_id:
                try:
                    mail_service.drive_borrar(anterior)  # la versión anterior (otro nombre o carpeta)
                except Exception:
                    pass
            logger.info("Albarán %s guardado en Drive: %s/%s", doc_id, destino["name"], nombre)
            if pendiente and not ya_avisado:
                _avisar_pendiente(db, doc)
        except Exception as e:
            logger.warning("No se pudo guardar el albarán %s en Drive: %s", doc_id, e)
            db.rollback()
            doc = db.get(Document, doc_id)
            if doc:
                msg = str(e)
                if "Falta el PDF" in msg:
                    msg = "Hay que actualizar el script de Google (nueva versión) para guardar en Drive"
                doc.drive_error = msg[:300]
                db.commit()
        finally:
            db.close()


def recolocar(db) -> int:
    """Los albaranes que estaban en «_Pendientes de clasificar» y cuyo proveedor ya tiene carpeta (porque alguien la
    acaba de crear en Drive con su nombre, o se eligió para otro albarán suyo) pasan solos a ella. Devuelve cuántos.
    Antes se quedaban en pendientes aunque la carpeta ya existiera, y había que moverlos a mano uno a uno."""
    from app.models.document import Document
    from app.models.drive import DriveCarpeta
    movidos = 0
    lista = carpetas()
    for d in db.query(Document).filter(Document.drive_pendiente.is_(True), Document.drive_file_id.isnot(None),
                                       Document.status == "completed").order_by(Document.id).all():
        db.refresh(d)
        if not d.drive_pendiente or not d.supplier_name:
            continue   # ya lo movió otro de su mismo proveedor en esta vuelta, o no se sabe de quién es
        fijada = db.get(DriveCarpeta, clave(d.supplier_name))
        destino = {"id": fijada.folder_id} if fijada else adivinar(d.supplier_name, lista)
        if not destino or not any(c["id"] == destino["id"] for c in lista):
            continue
        try:
            antes = db.query(Document).filter(Document.drive_pendiente.is_(True)).count()
            elegir_carpeta(db, d, destino["id"])
            movidos += antes - db.query(Document).filter(Document.drive_pendiente.is_(True)).count()
        except Exception as e:
            db.rollback()
            logger.warning("No se pudo recolocar el albarán %s en su carpeta: %s", d.id, e)
    if movidos:
        logger.info("%s albarán(es) pasan de pendientes a la carpeta de su proveedor", movidos)
    return movidos


def recolocar_al_arrancar() -> None:
    """Lo mismo, en segundo plano al arrancar el servidor (no debe retrasar el arranque ni tumbarlo)."""
    def _vuelta():
        from app.database import SessionLocal
        if not mail_service.configured():
            return
        db = SessionLocal()
        try:
            carpetas(refrescar=True)
            recolocar(db)
        except Exception as e:
            logger.warning("No se pudieron recolocar los albaranes pendientes al arrancar: %s", e)
        finally:
            db.close()
    threading.Thread(target=_vuelta, daemon=True).start()


_LEGAL = re.compile(r"[\s,]+(S\.?\s?L\.?\s?U?\.?|S\.?\s?A\.?\s?U?\.?|S\.?\s?C\.?\s?L?\.?|C\.?\s?B\.?)\s*$", re.I)


def nombre_sugerido(proveedor: str) -> str:
    """Nombre para la carpeta de un proveedor nuevo: en mayúsculas y sin «S.L.», «S.A.»… como las que ya hay."""
    n = _LEGAL.sub("", (proveedor or "").strip())
    n = re.sub(r"[\\/:*?\"<>|]+", " ", n)
    return re.sub(r"\s+", " ", n).strip(" .,-").upper()[:80]


def crear_carpeta(db, doc, nombre: str) -> dict:
    """Crea en Drive la carpeta del proveedor (dentro de ALBARANES) y mueve a ella el albarán y los demás suyos."""
    nombre = re.sub(r"\s+", " ", re.sub(r"[\\/:*?\"<>|]+", " ", nombre or "")).strip(" .")[:80]
    if not nombre or nombre.startswith("_"):
        raise ValueError("Pon un nombre para la carpeta.")
    c = mail_service.drive_crear_carpeta(settings.drive_albaranes_id, nombre)
    carpetas(refrescar=True)
    elegir_carpeta(db, doc, c["id"])
    return c


def _avisar_pendiente(db, doc) -> None:
    """Aviso al encargado: un albarán se ha quedado en «_Pendientes de clasificar» (proveedor nuevo sin carpeta, o
    no se pudo leer). Sin esto no se enteraba y el albarán se quedaba ahí (Andrés, 18/11/2026)."""
    try:
        from app.models.document import Document
        from app.services import push_service
        if doc.status == "error":
            titulo = "No se pudo leer un albarán de compra"
            texto = f"{doc.original_filename}: está guardado en Drive sin leer. Ábrelo y vuelve a leerlo."
        else:
            n = db.query(Document).filter(Document.drive_pendiente.is_(True), Document.status == "completed").count()
            titulo = "Albarán de compra sin carpeta en Drive"
            texto = (f"{doc.supplier_name or 'Proveedor sin poner'}: no encuentro su carpeta. Ábrelo y elígela "
                     "(solo la primera vez)." + (f" Hay {n} así." if n > 1 else ""))
        push_service.avisar(lambda s: s.rol == "admin", titulo, texto, f"/documento/{doc.id}", "compras-drive")
    except Exception as e:
        logger.warning("No se pudo mandar el aviso de albarán pendiente: %s", e)


def repasar(max_n: int = 5) -> None:
    """Los albaranes de compra que no llegaron a Drive (fallo de red, servidor reiniciado al publicar…)
    se reintentan solos cada media hora, unos pocos cada vez (antes había que abrirlos y pulsar Reintentar)."""
    import json
    from datetime import timedelta
    from app.database import SessionLocal
    from app.models.document import Document
    if not mail_service.configured():
        return
    db = SessionLocal()
    try:
        desde = _desde(db)
        hace = datetime.utcnow() - timedelta(minutes=10)  # los recién leídos se están subiendo ahora
        pendientes = [(d.id, d.file_paths) for d in db.query(Document)
                      .filter(Document.id > desde, Document.status.in_(("completed", "error")),
                              Document.drive_file_id.is_(None), Document.created_at < hace)
                      .order_by(Document.id.desc()).limit(max_n).all()]
    finally:
        db.close()
    for doc_id, rutas in pendientes:
        try:
            paginas = [p for p in json.loads(rutas or "[]") if p] or None
        except ValueError:
            paginas = None
        guardar(doc_id, paginas)
    db = SessionLocal()
    try:
        carpetas(refrescar=True)
        recolocar(db)
    except Exception as e:
        logger.warning("No se pudieron recolocar los albaranes pendientes: %s", e)
    finally:
        db.close()


def guardar_en_segundo_plano(doc_id: int, paginas: Optional[list] = None) -> None:
    threading.Thread(target=guardar, args=(doc_id, paginas), daemon=True).start()


def elegir_carpeta(db, doc, folder_id: str) -> None:
    """Mueve el albarán a la carpeta elegida y la recuerda para ese proveedor
    (y mueve también los otros de ese proveedor que estuvieran en pendientes)."""
    from app.models.document import Document
    from app.models.drive import DriveCarpeta
    c = next((x for x in carpetas() if x["id"] == folder_id), None)
    if not c:
        raise ValueError("Carpeta no encontrada")
    if doc.supplier_name:
        k = clave(doc.supplier_name)
        db.merge(DriveCarpeta(clave=k, folder_id=c["id"], folder_name=c["name"]))
        otros = [d for d in db.query(Document).filter(Document.drive_pendiente.is_(True)).all()
                 if d.id != doc.id and clave(d.supplier_name or "") == k]
    else:
        otros = []
    for d in [doc, *otros]:
        if d.drive_file_id:
            mail_service.drive_mover(d.drive_file_id, c["id"])
            d.drive_carpeta_id, d.drive_carpeta, d.drive_pendiente = c["id"], c["name"], False
    db.commit()
