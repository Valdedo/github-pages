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
    # Abrazaderas (20/11/2026, tarde)
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


# Lo que no es de Cofan (20/11/2026): la foto del fabricante. Index (indexfix.com, las abrazaderas de plástico y ligeras, el
# gancho en S…; su web a veces contesta «One moment, please»: se reintenta), Fischer (media.fischer.group) y dos de Cofan
# que van por otra sección de su web. El grampillón no tiene foto en ninguna: va dibujado (`grampillon`).
_IX = "https://www.indexfix.com/wp-content/uploads/CMP6735/"
_FI = "https://media.fischer.group/v7/_pim-media-prod_/Product%20Pictures/Product%20Pictures%20Big%20fischer/"
OTRAS = {
    "abrazadera-plastico-abierta": _IX + "CT1314BI9436_3_05_12_AB_PR_AB_PR_SZ8-768x768.jpg",
    "abrazadera-plastico-cerrada": _IX + "CT1312BI9411_3_05_10_AB_GU_AB_GU_SZ8-768x768.jpg",
    "abrazadera-ligera": _IX + "CT1279BI9437_3_02_10_AB_PU_AB_PU_SZ8-768x768.jpg",
    "gancho-s": _IX + "CT1116BI12110_1_08_12_GS_GS_SZ8-768x768.jpg",
    "sujetacables": _IX + "CT1105BI10139_1_08_01_SJ_SJ_SZ8-768x768.jpg",
    "tornillo-uralita": _IX + "CT1182BI9736_2_01_08_FIBR_FIBR_SZ8-768x768.jpg",
    "autotaladrante-alomado": _IX + "CT1189BI9650_2_02_01_DIN_7504_N_DIN_7504_N_SZ8-768x768.jpg",
    "tirafondo-pozidriv": _IX + "CT1205BI10305_2_03_02_TP_TP_SZ8-768x768.jpg",
    "taco-rastrel": _IX + "CT1048BI10309_1_01_25_TRA_TRA_SZ8-768x768.jpg",
    "fischer-duopower": _FI + "W1_P_G_DUOPOWER001_F_SALL_AQQ_V4.jpg?w=1000",
    "fischer-sx": _FI + "W1_P_G_SX-PLUS-CGI_V1.jpg?w=1000",
    "fischer-duoblade": _FI + "W1_P_G_DUOBLADE-CGI_F_SALL_AQQ_V1.jpg?w=1000",
    "abarcon": "https://www.cofan.es/images/content/1024x682/abarcon-cincado.jpg",
    "anclaje-argolla": "https://www.cofan.es/images/content/1024x682/web1_07650845_01.jpg",
}
_NAV = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def _es_imagen(ruta: str) -> bool:
    try:
        Image.open(ruta).verify()
        return True
    except Exception:
        return False


def bajar(url: str, ruta: str) -> bool:
    import time
    for _ in range(6):
        if os.path.exists(ruta) and _es_imagen(ruta):
            return True
        subprocess.run(["curl", "-sS", "-L", "-m", "40", "-A", _NAV, "-e", url.split("/wp-content")[0] + "/", "-o", ruta, url], check=False)
        if _es_imagen(ruta):
            return True
        time.sleep(8)
    return False


def grampillon(destino: str, dentado: bool = False) -> None:
    """Dibujo de un grampillón (grapa en U de dos puntas, galvanizada); el dentado lleva las muescas en las patas."""
    from PIL import ImageDraw, ImageFilter
    S = 4
    L = LADO * S
    im = Image.new("RGB", (L, L), (255, 255, 255))
    d = ImageDraw.Draw(im)
    g = 46 * S                                   # grueso del alambre
    x0, x1, arriba, abajo = 150 * S, 330 * S, 70 * S, 330 * S
    r = (x1 - x0) // 2
    def u(color, dx=0, ancho=g):
        d.arc((x0 + dx, arriba, x1 + dx, arriba + 2 * r), 180, 360, fill=color, width=ancho)
        for x in (x0 + dx, x1 + dx - ancho):
            d.rectangle((x, arriba + r - 2, x + ancho, abajo), fill=color)
    u((122, 128, 134))
    u((176, 182, 188), dx=0, ancho=int(g * 0.72))
    u((226, 230, 233), dx=int(g * 0.10), ancho=int(g * 0.26))
    for x in (x0, x1 - g):                        # puntas cortadas en bisel
        d.polygon([(x, abajo), (x + g, abajo), (x + g // 2, abajo + 80 * S)], fill=(150, 156, 162))
        d.polygon([(x + int(g * 0.1), abajo), (x + int(g * 0.36), abajo), (x + g // 2, abajo + 80 * S)], fill=(214, 218, 222))
    if dentado:
        for x, lado in ((x0, -1), (x1 - g, 1)):
            for k in range(4):
                y = arriba + r + 30 * S + k * 42 * S
                xe = x if lado < 0 else x + g
                d.polygon([(xe, y), (xe + lado * 16 * S, y + 26 * S), (xe, y + 30 * S)], fill=(122, 128, 134))
    im = im.filter(ImageFilter.GaussianBlur(S * 0.6)).resize((LADO, LADO), Image.LANCZOS)
    im.save(destino, "WEBP", quality=88, method=6)


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
    for nombre, url in OTRAS.items():
        jpg = os.path.join(orig, nombre + ".jpg")
        if not bajar(url, jpg):
            print(f"{nombre}: no se pudo bajar {url}")
            continue
        cuadrada(jpg, os.path.join(DESTINO, nombre + ".webp"))
        print(nombre, "ok")
    grampillon(os.path.join(DESTINO, "grampillon.webp"))
    grampillon(os.path.join(DESTINO, "grampillon-dentado.webp"), dentado=True)


if __name__ == "__main__":
    main()
