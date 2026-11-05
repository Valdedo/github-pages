"""Fotos del catálogo de Inyectometal para su tarifa en la app (nov. 2026).

Uso:  python3 tools/inyectometal-fotos.py <catalogo.pdf> <carpeta_salida_fotos> <salida_json> [hoja_contactos.jpg]

- <catalogo.pdf>: el catálogo general de la web de Inyectometal
  (https://www.inyectometal.com/wp-content/uploads/2023/06/CATALOGO-GENERAL-MAYO-2023.pdf).
- Fotos → frontend/public/catalogo/iny/i<xref>.webp ; JSON → backend/app/data/inyectometal_fotos.json

Cada producto del catálogo es un bloque: el título, la foto a la izquierda y la tabla (Ref. · Cód. EAN · Cantidad ·
Medida · P.V.P.). Cada fila de la tabla coge la foto que tiene encima o a su altura (la más baja que empieza por encima
de la fila). Se guarda por referencia («3001C» se escribe «3001 C» en el catálogo) y por EAN, así la tarifa la encuentra
por cualquiera de los dos; las referencias que no salen en el catálogo cogen en la app la de su tipo de pieza
(inyectometal.py).
"""
import json
import os
import re
import sys

import pymupdf
from PIL import Image, ImageDraw

PDF, OUT_FOTOS, OUT_JSON = sys.argv[1:4]
HOJA = sys.argv[4] if len(sys.argv) > 4 else None
os.makedirs(OUT_FOTOS, exist_ok=True)
LADO = 480  # px del lado mayor (el catálogo las trae de ~200-400 px: no se agrandan)


def es_foto(i: dict) -> bool:
    x0, y0, x1, y1 = i["bbox"]
    return bool(i["xref"]) and x1 - x0 > 40 and y1 - y0 > 30 and y0 > 90  # ni iconos ni la cabecera de la página


def guarda(doc, xref: int) -> str:
    nombre = f"i{xref}.webp"
    ruta = os.path.join(OUT_FOTOS, nombre)
    if os.path.exists(ruta):
        return nombre
    pix = pymupdf.Pixmap(doc, xref)
    smask = doc.xref_get_key(xref, "SMask")
    if smask[0] == "xref":
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, int(smask[1].split()[0])))
    if pix.colorspace and pix.colorspace.n not in (1, 3):
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    img = Image.open(__import__("io").BytesIO(pix.tobytes("png"))).convert("RGBA")
    # recortar el borde vacío (transparente o blanco)
    fondo = Image.new("RGBA", img.size, (255, 255, 255, 255))
    plano = Image.alpha_composite(fondo, img).convert("L").point(lambda v: 255 if v < 245 else 0)
    caja = plano.getbbox()
    if caja:
        img = img.crop((max(caja[0] - 4, 0), max(caja[1] - 4, 0), min(caja[2] + 4, img.width), min(caja[3] + 4, img.height)))
    img.thumbnail((LADO, LADO))
    img.save(ruta, "WEBP", quality=82, method=6)
    return nombre


def titulo(page, foto_bbox) -> str:
    """El título del producto: la línea en mayúsculas más cercana por encima de la foto (o a su altura)."""
    mejor, dist = "", 1e9
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = "".join(s["text"] for s in l["spans"]).strip()
            if not t or l["spans"][0]["size"] < 12 or not re.search(r"[A-ZÁÉÍÓÚÑ]{3}", t):
                continue
            d = foto_bbox[1] - l["bbox"][3]
            if -5 <= d < dist:
                mejor, dist = t, d
    return mejor


def main():
    doc = pymupdf.open(PDF)
    refs, eans, titulos, paginas = {}, {}, {}, {}
    for pn, page in enumerate(doc):
        fotos = [i for i in page.get_image_info(xrefs=True) if es_foto(i)]
        words = page.get_text("words")
        for w in words:
            if not re.fullmatch(r"84\d{11}", w[4]):
                continue
            y = (w[1] + w[3]) / 2
            izq = [v[4] for v in sorted(words, key=lambda v: v[0]) if abs((v[1] + v[3]) / 2 - y) < 3 and v[2] <= w[0] + 1]
            if not izq:
                continue
            ref = izq[0] + (izq[1] if len(izq) > 1 and re.fullmatch(r"[A-Z]{1,2}", izq[1]) else "")
            cand = [i for i in fotos if i["bbox"][1] <= y + 8 and i["bbox"][0] < w[0]]
            if not cand:
                continue
            f = max(cand, key=lambda i: (i["bbox"][1], -abs(i["bbox"][1] - y)))
            nombre = guarda(doc, f["xref"])
            refs.setdefault(ref.upper(), nombre)
            eans.setdefault(w[4], nombre)
            if nombre not in titulos:
                titulos[nombre] = titulo(page, f["bbox"])
                paginas[nombre] = pn + 1
    json.dump({"fuente": "https://www.inyectometal.com/wp-content/uploads/2023/06/CATALOGO-GENERAL-MAYO-2023.pdf",
               "refs": refs, "eans": eans, "titulos": titulos, "paginas": paginas},
              open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=0, sort_keys=True)
    print(f"{len(refs)} referencias, {len(eans)} EAN, {len(titulos)} fotos")
    if HOJA:  # hoja de contactos para revisar a ojo: foto + título + página + nº de refs
        cuenta = {}
        for n in refs.values():
            cuenta[n] = cuenta.get(n, 0) + 1
        orden = sorted(titulos, key=lambda n: paginas[n])
        cel, cols = 170, 10
        hoja = Image.new("RGB", (cel * cols, (len(orden) // cols + 1) * (cel + 30)), "white")
        d = ImageDraw.Draw(hoja)
        for k, n in enumerate(orden):
            im = Image.open(os.path.join(OUT_FOTOS, n)).convert("RGBA")
            im.thumbnail((cel - 10, cel - 10))
            x, y = (k % cols) * cel, (k // cols) * (cel + 30)
            hoja.paste(im, (x + 5, y + 5), im)
            d.text((x + 4, y + cel - 4), f"p{paginas[n]} ·{cuenta.get(n, 0)}· {titulos[n][:24]}", fill="black")
        hoja.save(HOJA, quality=80)


main()
