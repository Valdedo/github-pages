"""Fotos de los sacos de la tarifa de piensos (oct. 2026), cuadradas y con fondo blanco, para la cuadrícula de la app.

Uso:  python3 tools/piensos-fotos.py frontend/public/catalogo/pi/fotos [nombre …]   (con nombres, solo esas fotos)

Los piensos que vende la tienda (Almacenes Blanco, Navia, es el distribuidor) son de De Heus Nutrición Animal, marca
Biona (Línea Oro y Vitalfeed), con Equifeed, Kovital y Melkum, que son marcas de De Heus; Kilate es el pienso de perro que
distribuye Biona. Los dibujos de catalogo/pi/*.webp se quedan para lo que no tiene foto.

- Línea Oro de Biona (diseño actual, un color por animal): Avipuesta Oro Plus (gallina y cesta de huevos), Crecimiento
  Pollos Oro (= Creceba, pollitos) y Nutricun Oro (conejo): las fotos grandes de Agrotendas (agrotendas.com). El saco de
  10 kg es igual que el de 25 kg (Solloso enseña los dos), así que cada uno lleva una sola foto.
- Conchavit: va en el saco común «Vitalfeed aves» de 5 kg (el mismo que el Granufos; el nombre va en la etiqueta); foto de
  la web de De Heus, que es la que pone en la página del Conchavit Gra.
- Ceregal, Kovital, Equifeed y Melkum: fotos de deheus.es. Kovital es un solo saco para arranque, cebo y acabado
  (terneros); Equifeed Essence va en el saco verde común de la gama «basic» de Equifeed; Melkum, en el saco azul genérico
  de De Heus para pequeños rumiantes. En los tres el nombre exacto va en la etiqueta.
- Arranque Tradición (pollitos) y Nutricun Único (conejos, 25 kg) no salen así en el catálogo actual: van en el saco de
  Línea Oro de su animal («Calidad y Tradición»), el mismo que Crecimiento Pollos Oro y Nutricun Oro (Solloso vende
  arranque y crecimiento en el mismo saco), así que comparten foto con creceba-pollos y nutricun.
- Bovitac Especial (tacos para vacas): De Heus lo sustituyó por Kamperina Plus Tac; Piensos Lago vendía «Tacos Campero
  Bovitac Especial Tac 25 kg» y en la misma ficha (enlago.com, cod=200) ahora vende el Kamperina Plus: foto de ese saco.
- Cerdos crecimiento: el saco azul genérico de Biona (el nombre va en la etiqueta); foto de Piensos Lago
  (enlago.com, «Engorde de Cerdos Biona»). El de la foto es de 40 kg; el de 25 kg es igual.
- Kilate Mantenimiento 20 kg: Agrotendas. Kilate Basic 20 kg (saco azul): Agro Giménez Vélez (agrogimenezvelez.es).
- Friskies Adult buey, pollo y verduras 4 kg (Purina): la foto de bitiba.es (zooplus).
- Regenera 25 kg: Agrojardín Solloso (solloso.es). Tierra de diatomeas Massó 2 kg: Agralia Jardín (agraliajardin.com).
- Ray grass inglés Nui: Xardinagro lo sirve de Rocalba («RAYGRASS INGLES NUI ROCALBA», albarán B1759 de 01/10/2026);
  foto del saco de Rocalba de Piensos Lago (enlago.com).
Sin foto (se quedan con el dibujo): V. Energía, Kilate Gatos Mix, Mezcla 50 %, pulpa ACOR y los cereales sueltos.
Cada foto se recorta al saco y se guarda como <nombre>.webp de 480×480.
"""
import io
import os
import subprocess
import sys
import time

from PIL import Image

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
AT = "https://agrotendas.com/{}.jpg"  # sin «-large_default»: la foto original
DH = "https://www.deheus.es/siteassets/animals/{}.jpg"
SOLLOSO = "https://solloso.es/wp-content/uploads/{}.jpg"

FOTOS = {  # nombre: (url, giro en grados, zona en fracciones (x0, y0, x1, y1) o None)
    "avipuesta-oro-plus": (AT.format("1893/avipuesta-oro-plus"), 0, None),
    "creceba-pollos": (AT.format("1891/pollos-oro-crecimiento"), 0, None),
    "nutricun": (AT.format("1894/nutricun"), 0, None),
    "conchavit": (DH.format("poultry/vitalfeed-aves"), 0, None),
    "ceregal": (DH.format("poultry/ceregal"), 0, None),
    "kovital": (DH.format("ruminants/kovital"), 0, None),
    "equifeed": (DH.format("more-animals/equifeed-basic1"), 0, None),
    "melkum": (DH.format("ruminants/saco-pequenos-rumiantes-generico"), 0, None),
    "arranque-tradicion": (AT.format("1891/pollos-oro-crecimiento"), 0, None),  # mismo saco que creceba-pollos
    "nutricun-unico": (AT.format("1894/nutricun"), 0, None),  # mismo saco que nutricun
    "bovitac": ("https://enlago.com//media/web/fichero/articulos/683ec778239928e3822366d2/fotos/"
                "0-tacos-campero-kamperina-plus-tac-25-kg.jpg", 0, None),
    "cerdos-crecimiento": ("https://enlago.com//media/web/fichero/articulos/637217432399286917512c70/fotos/"
                           "0-Terneros%20Bion.jpg", 0, (0.0, 0.31, 0.335, 0.87)),
    "kilate-mantenimiento": (AT.format("1890/kilate-mantenimiento-20-kg"), 0, None),
    "kilate-basic": ("https://agrogimenezvelez.es/wp-content/uploads/2023/01/Pienso-para-perros-Kilate-basic-20Kg.png",
                     0, None),
    "friskies-gatos": ("https://media.zooplus.com/bilder/2/800/375498_pla_purina_friskies_katze_rind_huhn_gemuese_"
                       "4kg_hs_01_2.jpg", 0, None),
    "regenera": (SOLLOSO.format("2026/05/7119-5"), 0, None),
    "diatomeas-masso": ("https://agraliajardin.com/wp-content/uploads/2026/05/20260415_094243.png", 0, None),
    "ray-grass-nui": ("https://enlago.com//media/web/fichero/articulos/5e2fff3623bef26326b45a91/fotos/"
                      "0-Sinttulo_editada_enlago.jpg", 0, None),
}


def baja(url: str) -> Image.Image:
    for intento in range(4):  # algunas tiendas cortan la conexión a veces
        r = subprocess.run(["curl", "-sSL", "-m", "60", "-A", "Mozilla/5.0", url], capture_output=True)
        if r.returncode == 0 and r.stdout:
            break
        time.sleep(2)
    im = Image.open(io.BytesIO(r.stdout))
    im.thumbnail((2000, 2000), Image.LANCZOS)  # las de 4000 px no hacen falta para 480
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
for nombre, (url, giro, zona) in FOTOS.items():
    if SOLO and nombre not in SOLO:
        continue
    im = baja(url)
    if giro:
        im = im.rotate(giro, expand=True, fillcolor=(255, 255, 255))
    if zona:  # la foto trae otros sacos al lado: primero se corta al que interesa
        w, h = im.size
        im = im.crop((int(zona[0] * w), int(zona[1] * h), int(zona[2] * w), int(zona[3] * h)))
    guarda(nombre, im.crop(caja(im)))
