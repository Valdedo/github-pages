"""Bombonas de gas (oct. 2026): Repsol, Cepsa y camping, con los precios de las hojas plastificadas de la tienda.

No es una tarifa de compra: solo hay precio de venta al público con IVA, que Andrés cambia a mano en la hoja
«TARIFA_GAS_BOMBONAS» (Mi unidad, compartida con casafonsomc). Pestaña «TARIFA», fila de títulos
«Familia | Grupo | Artículo | PVP con IVA | Sin IVA»; las filas van en el orden de las hojas de la tienda y la app
las enseña en ese mismo orden. El sin IVA se saca del con IVA (÷ 1,21, con 4 decimales), así TreyFACT da lo mismo.
"""
import re
import unicodedata
from typing import Optional

from app.services import hoja_tienda

IVA = 1.21


def _n(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def foto(grupo: str, articulo: str) -> Optional[str]:
    """Foto de la cuadrícula (frontend/public/catalogo/gas, de tools/gas-fotos.py) por lo que dice la fila."""
    t = _n(f"{grupo} {articulo}")
    if "casco" in t:
        return "/catalogo/gas/repsol-butano.webp"  # el casco que se vende es la bombona naranja de siempre
    for marca in ("repsol", "cepsa"):
        if marca in t:
            tipo = "ligera" if "ligera" in t else "propano" if "propano" in t else "butano"
            return f"/catalogo/gas/{marca}-{tipo}.webp"
    grande = "grande" in t or "2,8" in t or "2.8" in t
    pequena = "pequena" in t or "0,5" in t or "0.5" in t
    if "azul" in t and (grande or pequena):
        return f"/catalogo/gas/campingaz-{'grande' if grande else 'pequena'}.webp"
    if grande or pequena:  # las rojas y sus envases (2,8 y 0,5 kg): dibujadas, no se sabe la marca
        return f"/catalogo/gas/roja-{'grande' if grande else 'pequena'}.webp"
    return None


def leer(hojas: dict) -> dict:
    # El lector es el común de las hojas de la tienda (services/hoja_tienda.py), con la foto de cada bombona
    return hoja_tienda.leer(hojas, "gas", lambda fam, gru, art, formato: foto(gru, art))
