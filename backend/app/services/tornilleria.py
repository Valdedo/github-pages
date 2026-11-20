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

Fotos: una foto real por tipo de pieza (no por medida) en frontend/public/catalogo/tor/<nombre>.webp. Mientras un tipo no
tenga su foto en FOTOS, sale sin ella.
"""
from typing import Optional

from app.services import hoja_tienda

HOJA = "1I-DdsPNGWIGFrVACuN2O9gPSpVSglim0eAxRiaA2p4o"  # TARIFA_TORNILLERIA_2026 (Mi unidad de Andrés)
IVA = 21
ORIGEN = "Precio de venta de la etiqueta de la balda, con IVA."
CALCULADO = "Precio calculado (coste + margen + IVA): puede no coincidir con la etiqueta de la balda."

# (palabras del grupo, sin tildes; archivo de frontend/public/catalogo/tor sin la extensión); gana la primera que encaja.
# Solo los tipos cuya foto ya está en el repo.
FOTOS: list = []


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
        if eans.get(a["ref"]):
            a["ean"] = eans[a["ref"]]
        if a["ref"] in calculados and a.get("pvp_iva"):
            a["pvp_calculado"] = True
            a["origen"] = a["origen"].replace(ORIGEN, CALCULADO)
    return out
