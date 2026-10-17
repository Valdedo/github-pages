"""«Para qué sirve» y los datos que suele preguntar el cliente (oct. 2026), para las tarifas de las hojas de la tienda.

Andrés (17/10/2026): en la ficha de morteros, piensos y demás tienen que salir las características que le pueden preguntar
del producto y para qué sirve. Salen de la ficha técnica o la página del fabricante (cada producto lleva su «fuente»), y
están en backend/app/data/fichas_<tarifa>.json:

    {"productos": [{"clave": "...", "palabras": [["pegoland", "especial", "blanco"]], "uso": "...",
                    "datos": [["Tipo", "C1TE"], ...], "consejo": "...", "fuente": "https://..."}]}

«palabras»: alternativas; en cada una tienen que estar todas las palabras en el nombre del artículo (sin tildes ni
mayúsculas; una palabra de 4 letras o más vale también como principio de otra: «blanc» casa con «blanca»). Gana el primer
producto que casa, así que van de más concreto a menos. Si la hoja de Drive trae una columna «Para qué sirve», su texto
manda sobre el «uso» del archivo (así Andrés lo puede cambiar sin tocar la app).
"""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Optional

DATOS = Path(__file__).resolve().parent.parent / "data"


def _n(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


@lru_cache(maxsize=None)
def _productos(tarifa: str) -> tuple:
    f = DATOS / f"fichas_{tarifa}.json"
    if not f.exists():
        return ()
    try:
        return tuple(json.loads(f.read_text(encoding="utf-8")).get("productos") or [])
    except (ValueError, OSError):
        return ()


def _casa(palabras: list, nombre: list) -> bool:
    for p in palabras:
        p = _n(p)
        if not p:
            continue
        if not any(w == p or (len(p) >= 4 and w.startswith(p)) for w in nombre):
            return False
    return True


def buscar(tarifa: str, nombre: str) -> Optional[dict]:
    """La ficha de producto del artículo «nombre» (p. ej. «Pegoland Especial blanco · Saco 25 kg»), o None."""
    palabras = re.findall(r"[a-z0-9]+", _n(nombre))
    for p in _productos(tarifa):
        alternativas = p.get("palabras") or []
        if any(alt and _casa(alt, palabras) for alt in alternativas):
            datos = [[str(t), str(v)] for t, v in (p.get("datos") or []) if str(t).strip() and str(v).strip()]
            out = {"uso": (p.get("uso") or "").strip() or None, "datos": datos,
                   "consejo": (p.get("consejo") or "").strip() or None, "fuente": (p.get("fuente") or "").strip() or None,
                   # De quién es la ficha cuando la web no es la del fabricante (su declaración, alojada en una tienda)
                   **({"fuente_nombre": p["fuente_nombre"]} if p.get("fuente_nombre") else {})}
            return out if out["uso"] or datos else None
    return None
