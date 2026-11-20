"""Tornillería y fijaciones (20/11/2026): el pasillo de ferretería de la tienda, para mirar el precio desde el mostrador.

Hoja «TARIFA_TORNILLERIA_2026» (Mi unidad de Andrés, compartida con casafonsomc), pestaña TARIFA, leída con el lector común
de las hojas de la tienda (services/hoja_tienda.py): Familia | Grupo | Artículo | Medida | Formato | PVP con IVA | … | Código |
Coste | Fecha coste | Factura | Proveedor | Nota, y detrás columnas solo para la tienda (Sugerido con IVA, Diámetro, Largo,
Acabado, Se compra a, EAN, Envase, Tarifa del proveedor, Dto., Origen del coste, Comprado).

Se busca por imagen y medida: familia → grupo (el tipo de pieza con su norma: «Hexagonal DIN 933/931») → línea («Hexagonal
M8») que se abre en sus medidas («M8x50»). Una medida es una fila: cincado, pavonado o media rosca no abren fila nueva
(Andrés, 19/11/2026); el inox va en su familia.

El precio de venta es la columna «PVP con IVA»: el de la etiqueta de la balda donde se pudo leer en las fotos del 20/11/2026
(112 medidas: etiquetas verdes) y, en las demás, un precio calculado en la propia hoja (coste + margen + IVA, al alza a 0,05 €;
Andrés: «pon los que consideres, luego los cambio»). La columna «Origen del PVP» dice cuál es cuál y la ficha lo avisa
(`pvp_calculado`). Para poner el de la etiqueta basta escribirlo encima en la hoja. El coste
es el del último albarán de Cofan o Caminoval y, si no hay, el de la web de Cofan del 20/11/2026 (tarifa − 60 %); en lo que
se compra a Caminoval y no tiene albarán, ese coste de Cofan es solo de referencia (lo dice la «Nota»). El margen del precio
calculado está en la pestaña Notas de la hoja (70 %: es con el que mejor salen las 112 etiquetas leídas; con el 45 % de
ferretería, 65 de 112 quedaban por debajo de su etiqueta).

Fotos: una foto real por tipo de pieza (no por medida) en frontend/public/catalogo/tor/<nombre>.webp, de la ficha de
cada producto en cofan.es (tools/tornilleria-fotos.py). Lo que es de Index y no de Cofan (tirafondo Power-Cut, tornillo
de anclaje CHT, taco rastrel) lleva la de la pieza de Cofan del mismo tipo. Sin foto todavía: tacos Fischer, tornillo
de uralita y grampillones.

El precio de venta se puede cambiar desde la app (`"pvp_editable"` en TARIFAS → tabla `tarifa_pvp`, que manda sobre la
hoja): así Andrés va poniendo el de la etiqueta de la balda sin abrir la hoja.
"""
import re
from typing import Optional

from app.services import hoja_tienda

HOJA = "1I-DdsPNGWIGFrVACuN2O9gPSpVSglim0eAxRiaA2p4o"  # TARIFA_TORNILLERIA_2026 (Mi unidad de Andrés)
IVA = 21
ORIGEN = "Precio de venta de la etiqueta de la balda, con IVA."
CALCULADO = "Precio calculado (coste + margen + IVA): puede no coincidir con la etiqueta de la balda."

# (palabras del grupo y del artículo, sin tildes; archivo de frontend/public/catalogo/tor sin la extensión); gana la
# primera que encaja, así que lo más concreto va delante. Solo los tipos cuya foto ya está en el repo.
FOTOS: list = [
    # Inox A2 (antes que sus parejas de acero)
    (("inox", "tuerca", "autoblocante"), "tuerca-autoblocante-inox"), (("inox", "tuerca"), "tuerca-inox"),
    (("inox", "arandela"), "arandela-ancha-inox"), (("inox", "7991"), "allen-avellanada-inox"),
    (("inox", "cuello cuadrado"), "cuello-cuadrado-inox"), (("inox", "barraquero"), "barraquero-inox"),
    (("inox", "rosca chapa"), "rosca-chapa-inox"), (("inox", "hexagonal"), "hexagonal-inox"),
    # Cubierta
    (("autotaladrante", "sandwich"), "autotaladrante-sandwich"), (("autotaladrante", "vigueta"), "autotaladrante-vigueta"),
    (("autotaladrante", "avellanado"), "autotaladrante-avellanado"), (("autotaladrante", "arandela"), "autotaladrante-arandela"),
    (("autotaladrante",), "autotaladrante-hexagonal"), (("rosca chapa", "hexagonal"), "rosca-chapa-hexagonal"),
    # Madera y chapa
    (("barraquero",), "barraquero"), (("rosca chapa", "avellanada"), "rosca-chapa-avellanada"),
    (("rosca chapa",), "rosca-chapa-alomada"), (("tirafondo",), "tirafondo-torx"),
    # Anclajes y tacos
    (("anclaje", "cuna"), "anclaje-cuna"), (("anclaje", "camisa"), "anclaje-camisa"), (("anclaje", "hormigon"), "tornillo-hormigon"),
    (("taco", "clavable"), "taco-clavable"), (("rastrel",), "taco-rastrel"), (("aislamiento",), "fijacion-aislamiento"),
    (("taco", "nylon"), "taco-nylon"),
    # Remaches y abrazaderas
    (("remache", "ancha"), "remache-ala-ancha"), (("remache",), "remache"),
    (("abrazadera", "isofonica"), "abrazadera-isofonica"), (("abrazadera", "sin fin"), "abrazadera-sin-fin"),
    (("abrazadera", "reforzada"), "abrazadera-reforzada"), (("abrazadera", "tubo"), "abrazadera-tubo"),
    # Varilla, cáncamos, clavos y puntas
    (("varilla",), "varilla"), (("cancamo", "tuerca"), "cancamo-tuerca"), (("hembrilla",), "hembrilla"),
    (("cinta perforada",), "cinta-perforada"),
    (("punta", "acero", "conica"), "punta-acero-conica"), (("punta", "acero"), "punta-acero"), (("punta", "hierro"), "punta-hierro"),
    # Métrica
    (("hexagonal", "933"), "hexagonal"), (("cuello cuadrado",), "cuello-cuadrado"), (("allen", "7991"), "allen-avellanada"),
    (("allen", "7380"), "allen-boton"), (("allen",), "allen"), (("avellanada", "965"), "avellanada"),
    # Tuercas y arandelas
    (("tuerca", "autoblocante"), "tuerca-autoblocante"), (("mariposa",), "tuerca-mariposa"), (("tuerca", "union"), "tuerca-union"),
    (("tuerca", "hexagonal"), "tuerca"), (("arandela", "grower"), "arandela-grower"), (("arandela", "ancha"), "arandela-ancha"),
    (("arandela", "plana"), "arandela-plana"),
]


# Familias donde filtrar por medida no ayuda: cada medida es de un solo tipo (rangos de abrazadera, largos de punta…)
SIN_FILTRO = ("abrazaderas", "clavos y puntas", "varilla y cancamos")


def foto(fam: str, gru: str, art: str, formato: str) -> Optional[str]:
    t = hoja_tienda.n(f"{gru} {art}")
    for palabras, nombre in FOTOS:
        if all(p in t for p in palabras):
            return f"/catalogo/tor/{nombre}.webp"
    return None


def _extras(hojas: dict) -> tuple:
    """(ref → código de barras, refs con el precio calculado): columnas «EAN» y «Origen del PVP» de la hoja, que el lector
    común no lee. Con el EAN, la PDA y el lector de mano encuentran la pieza por el código de la caja de Cofan."""
    for fs in hojas.values():
        i = next((k for k, f in enumerate(fs or []) if f and hoja_tienda.n(f[0]) == "familia"), None)
        if i is None:
            continue
        cab = [hoja_tienda.n(x) for x in fs[i]]
        col = lambda t: next((k for k, c in enumerate(cab) if c.startswith(t)), None)
        c_ean, c_gru, c_art, c_med, c_for = col("ean"), col("grupo"), col("articulo"), col("medida"), col("formato")
        c_ori = col("origen del pvp")
        if c_art is None:
            return {}, set()
        out, calc = {}, set()
        for f in fs[i + 1:]:
            f = [str(x).strip() for x in f] + [""] * (len(cab) + 2)
            v = lambda c: f[c] if c is not None else ""
            ref = "tor-" + hoja_tienda.slug(f"{v(c_gru)} {v(c_art)} {v(c_med)} {v(c_for)}")
            ean = v(c_ean).lstrip("'")
            if ean.isdigit() and len(ean) in (8, 12, 13):
                out.setdefault(ref, ean)
            if hoja_tienda.n(v(c_ori)).startswith("calculado"):
                calc.add(ref)
        return out, calc
    return {}, set()


def leer(hojas: dict) -> dict:
    out = hoja_tienda.leer(hojas, "tor", foto, iva=IVA, origen=ORIGEN)
    eans, calculados = _extras(hojas)
    for a in out["articulos"]:
        # Medida por la que se filtra la familia («todo lo de M8»): la métrica, sin el largo ni lo que va entre paréntesis
        # («M8x50», «M8 (Ø ext. 24)», «M8x60 (taladro 10)» → «M8»). Donde la medida no junta nada, sin filtro.
        m = re.match(r"M(\d+(?:[.,]\d+)?)", a.get("medida_c") or "")
        if m:
            a["mp"], a["op"] = "M" + m.group(1), float(m.group(1).replace(",", "."))
        elif hoja_tienda.n(a["categoria"]) in SIN_FILTRO:
            a["mp"] = ""
        if eans.get(a["ref"]):
            a["ean"] = eans[a["ref"]]
        if a["ref"] in calculados and a.get("pvp_iva"):
            a["pvp_calculado"] = True
            a["origen"] = a["origen"].replace(ORIGEN, CALCULADO)
    return out
