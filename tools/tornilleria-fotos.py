"""Fotos de la tarifa de tornillería (20/11/2026): una foto real por tipo de pieza, no por medida.

Salen de la web de Cofan (cofan.es): cada ficha `/es/detalle-producto/<id>/…` tiene su foto en
`/images/content/1024x682/<archivo>`. Aquí se baja la primera de cada ficha, se recorta en cuadrado alrededor de la
pieza (fondo blanco) y se guarda a 480 px en frontend/public/catalogo/tor/<nombre>.webp. El nombre es el que usa
`tornilleria.FOTOS` (backend/app/services/tornilleria.py).

Lo que no es de Cofan (Power-Cut, CHT y taco rastrel son de Index; se compran a Caminoval) lleva la foto de la pieza
de Cofan del mismo tipo. Sin foto: tacos Fischer, tornillo de uralita y grampillones.

Uso: python3 tools/tornilleria-fotos.py [carpeta donde guardar los originales]   (necesita Pillow y curl)
"""
import os
import subprocess
import sys
import urllib.parse

from PIL import Image, ImageChops

DESTINO = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "catalogo", "tor")
LADO = 480

# nombre de la foto: (ficha de Cofan, archivo de su primera foto)
FOTOS = {
    # Métrica
    "hexagonal": (1374, "tornillo-hexagonal-rosca-parcial-zincado(4).jpg"),  # la del 933 (ficha 1390) es muy larga y fina
    "cuello-cuadrado": (1537, "tornillo-cuello-cuadrado-con-cabeza-redonda-tuerca-de-acero-zincado.jpg"),
    "allen": (1460, "tornillo-allen-cabeza-cilindrica-negro.jpg"),
    "allen-avellanada": (1531, "tornillo-de-cabeza-avellanada-con-hueco-hexagonal-negro.jpg"),
    "allen-boton": (3276, "73800410z.jpg"),
    # Abrazaderas (21/11/2026)
    "tirafondo-abrazadera": (2724, "web1_18006401_03.jpg"),
    "abrazadera-un-pie": (2725, "grapa-un-pie-forma-f.jpg"),
    "avellanada": (1672, "tornillo-cabeza-avellanada-pozidrive-zincado.jpg"),
    # Tuercas y arandelas
    "tuerca": (1580, "tuerca-hexagonal-zincado.jpg"),
    "tuerca-autoblocante": (1612, "tuerca-hexagonal-autoblocante-nylon-zincado.jpg"),
    "tuerca-mariposa": (1632, "tuerca-de-mariposa.jpg"),
    "tuerca-union": (1635, "manguito-hexagonal-union-varillas-roscadas.jpg"),
    "arandela-plana": (1638, "arandelas-planas.jpg"),
    "arandela-ancha": (1644, "arandela-plana-ala-ancha.jpg"),
    "arandela-grower": (1641, "arandelas-grower-zincado.jpg"),
    # Inox A2
    "hexagonal-inox": (1813, "tornillo-din-933-rosca-total-inox-a-2.jpg"),
    "tuerca-inox": (1799, "tuerca-hexagonal-inox-a-2.jpg"),
    "tuerca-autoblocante-inox": (1795, "tuerca-hexagonales-de-seguridad-con-arandela-nylon.jpg"),
    "arandela-ancha-inox": (1783, "arandela-plana-ala-ancha-inox-a-2.jpg"),
    "allen-avellanada-inox": (3600, "web1_7991z_01.jpg"),
    "cuello-cuadrado-inox": (5862, "web_0087_01.jpg"),
    "barraquero-inox": (3602, "web_0126_01.jpg"),
    "rosca-chapa-inox": (3595, "web_0111_01.jpg"),
    # Madera y chapa
    "barraquero": (1693, "tirafondos-zincado.jpg"),
    "rosca-chapa-avellanada": (1686, "tornillo-roscachapa-cabeza-avellanada-phillips-zincado.jpg"),
    "rosca-chapa-alomada": (1680, "tornillo-roscachapa-cabeza-cilindrica-abombada-phillips-zincado.jpg"),
    "tirafondo-torx": (6113, "web1_02510313_01.jpg"),  # de referencia: el Power-Cut es de Index
    # Cubierta
    "autotaladrante-hexagonal": (1660, "tornillo-autotaladrante-cabeza-hexagonal-con-collarin-zincado.jpg"),
    "autotaladrante-arandela": (1658, "tornillos-de-cubierta-con-arandela-aceroepdm.jpg"),
    "autotaladrante-sandwich": (1735, "tornillos-de-cubierta-con-arandela-aceroepdm-panel-sandwich.jpg"),
    "autotaladrante-vigueta": (1734, "tornillos-de-cubierta-con-arandela-aceroepdm-para-vigueta-zincado.jpg"),
    "autotaladrante-avellanado": (1662, "tornillo-autotaladrante-cabeza-avellanada-phillips-zincado.jpg"),
    "rosca-chapa-hexagonal": (1654, "tornillo-roscachapa-cabeza-hexagonal-con-arandela-estampada-zincado.jpg"),
    # Anclajes
    "anclaje-cuna": (471, "anclaje-macho-para-cargas-altas-mtc.jpg"),
    "anclaje-camisa": (457, "web1_07620845_03.jpg"),
    "tornillo-hormigon": (1743, "tornillo-cabeza-plana-torx-anclaje-especial-hormigon-zincado-blanco-sin-cromo-6.jpg"),  # de referencia: el CHT es de Index y lleva cabeza hexagonal
    # Tacos
    "taco-nylon": (2986, "tacos-nylon-alado.jpg"),
    "taco-clavable": (417, "web1_07700530_1.jpg"),
    "taco-rastrel": (447, "taco-largo-con-tornillo-torx.jpg"),  # de referencia: taco largo con tornillo
    "fijacion-aislamiento": (451, "web1_07761011_01.jpg"),
    # Remaches
    "remache": (497, "web1_07013208_01.jpg"),
    "remache-ala-ancha": (502, "web1_07044014_01.jpg"),
    # Abrazaderas
    "abrazadera-sin-fin": (593, "abrazaderas-metalicas-banda-9mm.jpg"),
    "abrazadera-reforzada": (606, "abrazaderas-metalicas-super-gran-presion.jpg"),
    "abrazadera-tubo": (2721, "abrazadera-metalica-m-6-para-tubo.jpg"),
    "abrazadera-isofonica": (2723, "abrazadera-isofonica.jpg"),
    # Varilla y cáncamos
    "varilla": (1565, "varilla-roscada-1-metro-zincado-rosca-metrica.jpg"),
    "cancamo-tuerca": (2111, "cancamo-con-tuerca.jpg"),
    "hembrilla": (1772, "web1_01071425_01.jpg"),
    "cinta-perforada": (7740, "web1_18006601_01.jpg"),
    # Clavos y puntas
    "punta-hierro": (3579, "web_01202760.jpg"),
    "punta-acero": (3582, "web_01232530.jpg"),
    "punta-acero-conica": (3581, "web_01221520.jpg"),
}


def _marca(im: Image.Image):
    """Caja de la marca azul de la web (abajo a la derecha), o None."""
    w, h = im.size
    x0, y0 = int(w * 0.78), int(h * 0.84)
    zona = im.crop((x0, y0, w, h))
    azul = Image.new("L", zona.size, 0)
    azul.putdata([255 if (b > r + 35 and b > g + 12 and b > 90) else 0 for r, g, b in zona.getdata()])
    caja = azul.getbbox()
    return (x0 + caja[0] - 2, y0 + caja[1] - 2, x0 + caja[2] + 2, y0 + caja[3] + 2) if caja else None


def cuadrada(origen: str, destino: str) -> None:
    """Recorte cuadrado centrado en la pieza, con aire alrededor, sobre fondo blanco. La marca de la web no cuenta para
    centrar; si el recorte la deja entera, se queda, y si la partiría por la mitad, ese trozo va en blanco."""
    im = Image.open(origen).convert("RGB")
    w, h = im.size
    marca = _marca(im)
    sin_marca = im.copy()
    if marca:
        sin_marca.paste((255, 255, 255), marca)
    dif = ImageChops.difference(sin_marca, Image.new("RGB", im.size, (255, 255, 255))).convert("L").point(lambda v: 255 if v > 18 else 0)
    caja = dif.getbbox() or (0, 0, w, h)
    lado = int(max(caja[2] - caja[0], caja[3] - caja[1]) * 1.10)
    cx, cy = (caja[0] + caja[2]) // 2, (caja[1] + caja[3]) // 2
    x0, y0 = cx - lado // 2, cy - lado // 2
    entera = marca and x0 <= marca[0] and y0 <= marca[1] and marca[2] <= x0 + lado and marca[3] <= y0 + lado
    lienzo = Image.new("RGB", (lado, lado), (255, 255, 255))
    lienzo.paste((im if entera else sin_marca).crop((max(0, x0), max(0, y0), min(w, x0 + lado), min(h, y0 + lado))), (max(0, -x0), max(0, -y0)))
    lienzo.resize((LADO, LADO), Image.LANCZOS).save(destino, "WEBP", quality=82, method=6)


def main() -> None:
    orig = sys.argv[1] if len(sys.argv) > 1 else "/tmp/tornilleria-fotos"
    os.makedirs(orig, exist_ok=True)
    os.makedirs(DESTINO, exist_ok=True)
    for nombre, (ficha, archivo) in FOTOS.items():
        jpg = os.path.join(orig, nombre + ".jpg")
        if not os.path.exists(jpg) or os.path.getsize(jpg) < 3000:
            if not archivo:
                print(f"{nombre}: falta el nombre del archivo (mirar la ficha {ficha} de cofan.es)")
                continue
            url = "https://www.cofan.es/images/content/1024x682/" + urllib.parse.quote(archivo)
            subprocess.run(["curl", "-sS", "-L", "-m", "60", "-A", "Mozilla/5.0", "-o", jpg, url], check=False)
        cuadrada(jpg, os.path.join(DESTINO, nombre + ".webp"))
        print(nombre, "ok")


if __name__ == "__main__":
    main()
