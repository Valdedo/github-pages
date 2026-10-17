"""Piensos y agrícola (oct. 2026): la hoja plastificada de la tienda, con su precio de venta con IVA.

Hoja «TARIFA_PIENSOS» (Mi unidad de Andrés, compartida con casafonsomc), pestaña TARIFA, leída con el lector común de
las hojas de la tienda (services/hoja_tienda.py). Los piensos son de marca de la fábrica y no tienen foto: cada uno lleva
el dibujo del animal o del producto (frontend/public/catalogo/pi, de tools/pegatinas-piensos.py). IVA de la columna
«IVA» de cada fila; si está vacía, el 10 % (alimentación animal, semillas y abonos).
"""
import re
from typing import Optional

from app.services import hoja_tienda

IVA = 10

# Por lo que dice el nombre: el producto primero, luego el animal
POR_NOMBRE = [
    (r"\bmaiz", "maiz"), (r"\btrigo|\bsalvado", "trigo"), (r"\bcebada", "cebada"), (r"\bpulpa|\bremolacha", "remolacha"),
    (r"\bpatata", "patata"), (r"\bsal\b", "sal"), (r"\babono|\bregenera|\bfertigrana|\bestiercol", "abono"),
    (r"ray ?grass|\bhierba|\bcesped|\bsemilla", "hierba"), (r"diatome", "diatomeas"), (r"\bmezcla", "mezcla"),
    (r"conchavit|cascarilla|\bconcha", "concha"),
    (r"\bgat[oa]s?\b|friskies", "gato"), (r"\bperr[oa]s?\b|kilate", "perro"), (r"avipuesta|\bgallina|\bponedora", "gallina"),
    (r"creceba|\bpoll[oi]", "pollito"), (r"bovitac|\bvaca|\bternero|\bvacuno", "vaca"), (r"nutricun|\bconejo", "conejo"),
    (r"equifeed|\bcaballo|\bequino", "caballo"), (r"\bcerdo|\bporcino|\blechon", "cerdo"), (r"melkum|\bcabra", "cabra"),
    (r"\boveja|\bcordero|\bovino", "oveja"),
]
# Si el nombre no lo dice (Kovital, Ceregal, Arranque…): el animal de su grupo
POR_GRUPO = [
    (r"gallina|ponedora", "gallina"), (r"poll", "pollito"), (r"vaca|vacuno|ternero", "vaca"), (r"oveja|ovino|cordero", "oveja"),
    (r"cabra", "cabra"), (r"cerdo|porcino", "cerdo"), (r"conejo", "conejo"), (r"caballo|equino", "caballo"),
    (r"perro", "perro"), (r"gato", "gato"), (r"maiz", "maiz"), (r"trigo|salvado", "trigo"), (r"cebada", "cebada"),
    (r"grano|harina|cereal", "mezcla"), (r"huerta|jardin|abono", "abono"),
]


def foto(fam: str, gru: str, art: str, formato: str) -> Optional[str]:
    t = hoja_tienda.n(art)
    for rx, nombre in POR_NOMBRE:
        if re.search(rx, t):
            return f"/catalogo/pi/{nombre}.webp"
    g = hoja_tienda.n(f"{gru} {fam}")
    for rx, nombre in POR_GRUPO:
        if re.search(rx, g):
            return f"/catalogo/pi/{nombre}.webp"
    return None


def leer(hojas: dict) -> dict:
    return hoja_tienda.leer(hojas, "pi", foto, iva=IVA)
