"""Morteros, cementos y yesos (oct. 2026): la hoja plastificada de la tienda, con su precio de venta con IVA.

Hoja «TARIFA_MORTEROS_CEMENTOS» (Mi unidad de Andrés, compartida con casafonsomc), pestaña TARIFA, leída con el lector
común de las hojas de la tienda (services/hoja_tienda.py). Fotos de los sacos en frontend/public/catalogo/mor
(tools/morteros-fotos.py); el árido a granel va dibujado (tools/pegatinas-piensos.py).
"""
from typing import Optional

from app.services import hoja_tienda

# (palabras que tiene que llevar el nombre, foto); la primera que encaja
FOTOS = [
    (("prompt",), "cemento-prompt"),
    (("tudela",), "cemento-tudela-veguin"),
    (("veguin",), "cemento-tudela-veguin"),
    (("hormigon",), "paviland-h25"),
    (("enlucido", "blanco"), "prefasec-enlucido-blanco"),
    (("enlucido",), "prefasec-enlucido-gris"),
    (("revoque",), "prefasec-revoque-gris"),
    (("encintado", "claro"), "encintado-claro"),
    (("encintado",), "encintado-oscuro"),
    (("refractario",), "morfex"),
    (("morfex",), "morfex"),
    (("junta", "multicolor"), "junta-multicolor"),
    (("junta", "blanc"), "junta-blanca"),
    (("junta", "negr"), "junta-negra"),
    (("junta",), "junta-multicolor"),
    (("flex", "blanco"), "pegoland-flex-blanco"),
    (("flex",), "pegoland-flex-gris"),
    (("especial", "blanco"), "pegoland-especial-blanco"),
    (("especial",), "pegoland-especial-gris"),
    (("solera",), "paviland-solera"),
    (("autonivelante",), "paviland-solera"),
    (("niveland",), "niveland-10r"),
    (("iberfino",), "yeso-iberfino"),
    (("fino",), "yeso-iberfino"),
    (("iberplast",), "yeso-iberplast"),
    (("iberplus",), "yeso-iberplast"),  # en la hoja de la tienda pone «Iberplus»: el de Placo es el Iberplast
    (("yeso",), "yeso-iberplast"),
]


def foto(fam: str, gru: str, art: str, formato: str) -> Optional[str]:
    t = hoja_tienda.n(art)
    if "arido" in t:
        return "/catalogo/pi/arido.webp"  # dibujado, con los de los piensos
    for palabras, nombre in FOTOS:
        if all(p in t for p in palabras):
            return f"/catalogo/mor/{nombre}.webp"
    g = hoja_tienda.n(gru)  # uno nuevo en la hoja: la foto de su grupo
    for clave, nombre in (("cola", "pegoland-especial-gris"), ("junta", "junta-multicolor"), ("yeso", "yeso-iberplast"),
                          ("nivel", "paviland-solera"), ("mortero", "prefasec-revoque-gris"), ("cemento", "cemento-tudela-veguin")):
        if clave in g:
            return f"/catalogo/mor/{nombre}.webp"
    return None


def leer(hojas: dict) -> dict:
    return hoja_tienda.leer(hojas, "mor", foto)
