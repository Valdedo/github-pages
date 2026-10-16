"""Fotos de la tarifa de Pladur para el catálogo de la app (oct. 2026).

Uso:  python3 tools/pladur-fotos.py frontend/public/catalogo/pladur

Baja la primera foto de cada producto de la tienda oficial de Pladur (www.pladur.com/p/<producto>) y la de la
lana mineral Isover Drywall de su ficha técnica (isover.es), y las guarda como <clave>.webp (480×480, fondo
blanco). Las claves son las de `construdeco.clasifica_pladur` (campo «foto»). Las de Placo (PPM, PPF, Proyal,
Mecafino) no están aquí: se enlazan desde Obramat como el resto de fotos de referencia (FOTOS_PLACO en
backend/app/services/construdeco.py).
"""
import io
import os
import re
import subprocess
import sys

from PIL import Image

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

PRODUCTOS = {
    "placa-n": "placa-pladur-n-13x1200", "placa-h1": "placa-pladur-h1-13x1200", "placa-f": "placa-pladur-f-15",
    "canal": "canal-pladur-c48-47-xl-z5", "montante": "montante-m48-45-xl-z5-pladur",
    "perfil-techo": "primario-pladur-tr-24-blanco", "perfil-secundario": "secundario-pladur-tr-24-blanco",
    "perfil-t45": "perfil-pladur-t-45", "horquilla": "accesorio-horquilla-pladur-t-45",
    "angular": "angular-pladur-l-24", "angular-tr": "angular-pladur-tr-blanco",
    "cuelgue": "accesorio-pieza-de-cuelgue-pladur-tr", "cinta": "cinta-refuerzo-pladur",
    "tornillo": "tornillo-pladur-pm-39-35-placa-metal", "tornillo-mm": "tornillo-pladur-mm-35-25-metal-metal",
    "pasta-uso": "pasta-juntas-pladur-lista-al-uso", "pasta-st1": "pasta-juntas-pladur-st1",
    "pasta-st2": "pasta-juntas-pladur-st2",
}
ISOVER = "https://www.isover.es/documents/fichas-tecnicas/ft-drywall-37-es.pdf"  # foto de los paquetes, pág. 1


def bajar(url: str) -> bytes:
    return subprocess.run(["curl", "-sSL", "-m", "60", url], capture_output=True, check=True).stdout


def guardar(im: Image.Image, clave: str) -> None:
    im = im.convert("RGBA")
    fondo = Image.new("RGBA", im.size, (255, 255, 255, 255))
    im = Image.alpha_composite(fondo, im).convert("RGB")
    im.thumbnail((440, 440), Image.LANCZOS)
    lienzo = Image.new("RGB", (480, 480), "white")
    lienzo.paste(im, ((480 - im.width) // 2, (480 - im.height) // 2))
    lienzo.save(os.path.join(OUT, f"{clave}.webp"), "WEBP", quality=82, method=6)
    print("ok", clave)


for clave, slug in PRODUCTOS.items():
    html = bajar(f"https://www.pladur.com/p/{slug}").decode("utf-8", "ignore")
    fotos = re.findall(r"https://cdn11\.bigcommerce\.com/s-xjjxpgzuod/images/stencil/1280w/products/\d+/\d+/[^\"'\s?]+", html)
    if not fotos:
        print("SIN FOTO", clave, slug)
        continue
    guardar(Image.open(io.BytesIO(bajar(fotos[0].replace("/1280w/", "/640w/")))), clave)

import pymupdf  # noqa: E402

doc = pymupdf.open(stream=bajar(ISOVER), filetype="pdf")
pagina = doc[0]
# La foto de los paquetes es la más ancha que alta de la página (la otra es la del rollo y la grande, una obra)
cajas = [i for i in pagina.get_image_info(xrefs=True) if i["width"] > i["height"] * 1.2 and i["width"] > 400]
if cajas:
    pix = pagina.get_pixmap(clip=pymupdf.Rect(cajas[0]["bbox"]), dpi=220)
    guardar(Image.open(io.BytesIO(pix.tobytes("png"))), "lana")
else:
    print("SIN FOTO lana")
