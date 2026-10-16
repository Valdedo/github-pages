"""Fotos de la tarifa de bombonas de gas (oct. 2026), cuadradas y con fondo blanco, para la cuadrícula de la app.

Uso:  python3 tools/gas-fotos.py frontend/public/catalogo/gas

- Repsol: las de su tienda online (repsol.es/tienda/producto/…), ya con fondo blanco.
- Cepsa: la de butano de acero y la ligera salen del cartel de sus dos botellas (el borde derecho de la de acero lo tapa
  la otra y se completa con su borde izquierdo); la de propano, de su foto suelta.
- Campingaz azul grande (R 907) y pequeña (R 904): fotos de tiendas de camping.
- Las rojas de camping (y sus envases de 2,8 y 0,5 kg): no se sabe la marca, así que van dibujadas, sin marca.
Cada foto se recorta a la bombona y se guarda como <nombre>.webp de 480×480 (los nombres los pone services/gas.py).
"""
import io
import os
import subprocess
import sys

import cairosvg
from PIL import Image, ImageOps

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
REPSOL = "https://www.repsol.es/content/dam/repsol-ecommerce/tienda/productos/b/{0}/{0}-001.jpg"
MADRID = "https://madridcamper.com/{}.jpg"


def baja(url: str) -> Image.Image:
    datos = subprocess.run(["curl", "-sSL", "-m", "60", "-A", "Mozilla/5.0", url], capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(datos)).convert("RGB")


def caja(im: Image.Image, zona=None, umbral=238):
    """Rectángulo de lo que no es blanco (dentro de «zona», si se da)."""
    x0, y0, x1, y1 = zona or (0, 0, im.width, im.height)
    px = im.load()
    xs, ys = [], []
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            if min(px[x, y]) < umbral:
                xs.append(x); ys.append(y)
    return min(xs), min(ys), max(xs) + 2, max(ys) + 2


def guarda(nombre: str, im: Image.Image, margen=0.08, lado=480):
    w, h = im.size
    s = int(max(w, h) * (1 + 2 * margen))
    lienzo = Image.new("RGB", (s, s), (255, 255, 255))
    lienzo.paste(im, ((s - w) // 2, (s - h) // 2))
    lienzo.resize((lado, lado), Image.LANCZOS).save(os.path.join(OUT, f"{nombre}.webp"), quality=86)
    print(nombre)


for prod, nombre in (("bombona-de-butano-125-kg", "repsol-butano"), ("bombona-de-propano-11-kg", "repsol-propano"),
                     ("bombona-de-butano-ligera-de-12-kg", "repsol-ligera")):
    im = baja(REPSOL.format(prod))
    guarda(nombre, im.crop(caja(im)))

cartel = baja(MADRID.format("10744-thickbox_default/botella-carga-de-gas-butano-cepsa-125-kg"))
acero = cartel.crop((663, 668, 866, 1072))
borde = ImageOps.mirror(cartel.crop((663, 668, 690, 1072)))
entera = Image.new("RGB", (acero.width + borde.width, acero.height), (255, 255, 255))
entera.paste(acero, (0, 0)); entera.paste(borde, (acero.width, 0))
guarda("cepsa-butano", entera)
ligera = cartel.crop((866, 655, 1100, 1085))
guarda("cepsa-ligera", ligera.crop(caja(ligera)))
propano = baja(MADRID.format("10747-thickbox_default/recarga-de-gas-propano-cepsa-11-kg"))
guarda("cepsa-propano", propano.crop(caja(propano, (0, 600, 450, 1100))))

grande = baja(MADRID.format("10741-thickbox_default/recarga-de-gas-28-kg-campingaz"))
guarda("campingaz-grande", grande.crop(caja(grande, (0, 520, 1100, 1422))))
pequena = baja("https://www.norwichcamping.co.uk/wp-content/uploads/2024/07/campingaz-904-cylinder.jpg")
guarda("campingaz-pequena", pequena.crop(caja(pequena)))

# Rojas de camping: dibujo plano (como las pegatinas), sin marca
INK, SW = "#2B2F2C", 2.6


def r(x, y, w, h, fill, rx=0, sw=SW):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>'


def camping(x, y, s):
    w = 74 * s
    cx = x + w / 2
    return [r(x + 8 * s, y + 92 * s, w - 16 * s, 10 * s, "#A9302A", 3 * s), r(cx - 11 * s, y + 8 * s, 22 * s, 22 * s, "#C9D1D9", 3 * s, 2),
            r(cx - 15 * s, y, 30 * s, 11 * s, "#8893A0", 4 * s, 2), r(x, y + 24 * s, w, 74 * s, "#D8443A", 30 * s),
            f'<path d="M{x + w - 16 * s} {y + 34 * s} Q{x + w - 3 * s} {y + 48 * s} {x + w - 3 * s} {y + 62 * s} '
            f'Q{x + w - 4 * s} {y + 84 * s} {x + w - 18 * s} {y + 92 * s} Z" fill="#A9302A" opacity="0.5"/>',
            f'<rect x="{x + 10 * s}" y="{y + 42 * s}" width="{8 * s}" height="{36 * s}" rx="{4 * s}" fill="#EE8A82"/>']


for nombre, s, y in (("roja-grande", 1.38, 30), ("roja-pequena", 1.08, 46)):
    w = 74 * s
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="480" height="480"><rect width="200" height="200" fill="white"/>'
           + "".join(camping(100 - w / 2, y, s)) + "</svg>")
    Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode()))).convert("RGB").save(os.path.join(OUT, f"{nombre}.webp"), quality=86)
    print(nombre)
