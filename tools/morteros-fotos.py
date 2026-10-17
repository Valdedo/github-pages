"""Fotos de la tarifa de morteros, cementos y yesos (oct. 2026), cuadradas y con fondo blanco, para la cuadrícula de la app.

Uso:  python3 tools/morteros-fotos.py frontend/public/catalogo/mor [nombre …]   (con nombres, solo esas fotos)

- Grupo Puma (Paviland H25 —en su web «HS25», el hormigón seco—, Paviland solera autonivelante y Niveland 10R): la foto
  grande de cada producto en grupopuma.com.
- Tudela Veguín, de Obramat: el cemento que compra la tienda, CEM V/A (S-V) 32,5 N de 35 kg (saco morado, 10417631),
  Prefasec revoque hidrófugo (10471125) y los dos encintados, oscuro (10471076) y claro (10471062, que Obramat llama
  «rústico»).
- Prefasec enlucido: nadie grande lo vende; la foto es de Ferretería Cornellana (Salas), que pone la misma para el gris
  y el blanco hidrófugo (el saco es igual; la variante va en un rótulo pequeño), así que las dos comparten foto.
- Prompt de Vicat, Pegoland Especial gris y Pegoland Junta negro: Leroy Merlin. Iberfino e Iberplast (Placo): Obramat.
  (Placo no tiene «Iberplus»: su yeso rápido de construcción de 17 kg es el Iberplast.)
- Pegoland Especial blanco: Brico Depôt. Pegoland Profesional Flex blanco: Bricofácil; gris: Amazon. Morfex: Para mi
  Reforma (en la web de Puma salen el saco grande y el pequeño juntos).
- Pegoland Profesional Junta: blanca, de BigMat Enerfuer; negra, de Leroy Merlin; la multicolor es la bolsa sin color en
  la etiqueta (BigMat Córdoba).
Cada foto se recorta al saco y se guarda como <nombre>.webp de 480×480 (los nombres los pone services/morteros.py).
"""
import io
import os
import subprocess
import sys
import time

from PIL import Image

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
ADEO = "https://media.adeo.com/media/{}/media.{}"  # fotos de Obramat y Leroy Merlin
PUMA = "https://www.grupopuma.com/uploads/productos/media/{}.png"
CORNELLANA = "https://www.ferreteriacornellana.com/udecontrol_datos/objetos/{}.jpg"

FOTOS = {  # nombre: (url, giro en grados)
    "cemento-tudela-veguin": (ADEO.format(4395830, "jpg"), 0),
    "cemento-prompt": (ADEO.format(1827572, "png"), 0),
    "paviland-h25": (PUMA.format("17c03d9d6f5a9d2886bbcf63c06651cc"), 0),
    "prefasec-enlucido-gris": (CORNELLANA.format(280), -90),  # la foto está tumbada
    "prefasec-enlucido-blanco": (CORNELLANA.format(281), -90),
    "prefasec-revoque-gris": (ADEO.format(4411131, "jpg"), 0),
    "encintado-oscuro": (ADEO.format(5456338, "png"), 0),
    "encintado-claro": (ADEO.format(5456337, "png"), 0),
    "morfex": ("https://paramireforma.com/6963-thickbox_default/morfex-mortero-refractario-25kg.jpg", 0),
    "pegoland-especial-blanco": ("https://www.bricodepot.es/media/catalog/product/8/4/8429340120025_21c_bi.jpeg", 0),
    "pegoland-especial-gris": (ADEO.format(1827685, "jpg"), 0),
    "pegoland-flex-blanco": ("https://www.bricofacil.net/uploads/media/images/A15952_A15952.jpg", 0),
    "pegoland-flex-gris": ("https://m.media-amazon.com/images/I/71DEaxlRqOL._AC_SL1500_.jpg", 0),
    "paviland-solera": (PUMA.format("502ab5f4a33ae02a342977253a996ecb"), 0),
    "niveland-10r": (PUMA.format("1_2_a725b318e716dfdabc26feccb2784c31"), 0),
    "yeso-iberfino": (ADEO.format(4406588, "jpg"), 0),
    "yeso-iberplast": (ADEO.format(4407264, "jpg"), 0),
    "junta-multicolor": ("https://tienda.bigmatcordoba.es/web/image/product.template/59734/image", 0),
    "junta-blanca": ("https://bigmatenerfuer.com/132525-large_default/rejunte-puma-pegoland-profesional-junta-cg2-fwa-blanco-3kg.jpg", 0),
    "junta-negra": (ADEO.format(4508969, "png"), 0),
}


def baja(url: str) -> Image.Image:
    for intento in range(4):  # la web de Puma corta la conexión a veces
        r = subprocess.run(["curl", "-sSL", "-m", "60", "-A", "Mozilla/5.0", url], capture_output=True)
        if r.returncode == 0 and r.stdout:
            break
        time.sleep(2)
    im = Image.open(io.BytesIO(r.stdout))
    im.thumbnail((2000, 2000), Image.LANCZOS)  # las de 5000 px no hacen falta para 480
    if im.mode in ("RGBA", "LA", "P"):  # lo transparente, a blanco
        im = im.convert("RGBA")
        fondo = Image.new("RGB", im.size, (255, 255, 255))
        fondo.paste(im, (0, 0), im)
        return fondo
    return im.convert("RGB")


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


SOLO = set(sys.argv[2:])
for nombre, (url, giro) in FOTOS.items():
    if SOLO and nombre not in SOLO:
        continue
    im = baja(url)
    if giro:
        im = im.rotate(giro, expand=True, fillcolor=(255, 255, 255))
    guarda(nombre, im.crop(caja(im)))
