"""Bombonas de gas (oct. 2026): Repsol, Cepsa y camping, con los precios de las hojas plastificadas de la tienda.

No es una tarifa de compra: solo hay precio de venta al público con IVA, que Andrés cambia a mano en la hoja
«TARIFA_GAS_BOMBONAS» (Mi unidad, compartida con casafonsomc). Pestaña «TARIFA», fila de títulos
«Familia | Grupo | Artículo | PVP con IVA | Sin IVA»; las filas van en el orden de las hojas de la tienda y la app
las enseña en ese mismo orden. El sin IVA se saca del con IVA (÷ 1,21, con 4 decimales), así TreyFACT da lo mismo.
"""
import re
import unicodedata
from typing import Optional

IVA = 1.21


def _n(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def _slug(s) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _n(s)).strip("-")


def _num(v) -> Optional[float]:
    """«18,90 €», «18,9», «1.234,56» → número; vacío o sin cifras → None."""
    s = str(v or "").strip()
    if not re.search(r"\d", s):
        return None
    s = re.sub(r"[^\d,.\-]", "", s)
    if "," in s and "." in s and s.rfind(".") > s.rfind(","):
        s = s.replace(",", "")
    elif "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


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
    vacio = {"articulos": [], "log": [], "margen": None, "lineas": {}}
    filas, ini = None, None
    for nombre in ["TARIFA", *hojas]:  # la pestaña «TARIFA»; si le cambian el nombre, la que tenga los títulos
        fs = hojas.get(nombre) or []
        i = next((k for k, f in enumerate(fs) if f and _n(f[0]) == "familia"), None)
        if i is not None:
            filas, ini = fs, i
            break
    if filas is None:
        return vacio
    cab = [_n(x) for x in filas[ini]]
    col = lambda *ts: next((k for k, c in enumerate(cab) if any(c.startswith(t) for t in ts)), None)
    c_fam, c_gru, c_art, c_pvp = col("familia"), col("grupo"), col("articulo"), col("pvp", "precio")
    if None in (c_fam, c_gru, c_art, c_pvp):
        return vacio
    arts, familias, grupos, vistos = [], [], {}, set()
    for f in filas[ini + 1:]:
        f = [str(x).strip() for x in f] + [""] * 8
        fam, gru, art = f[c_fam], f[c_gru], f[c_art]
        pvp_iva = _num(f[c_pvp])
        if not fam or not art:
            continue
        ref = "gas-" + _slug(f"{gru} {art}")
        if ref in vistos:  # la misma fila dos veces: vale la primera
            continue
        vistos.add(ref)
        if fam not in familias:
            familias.append(fam)
            grupos[fam] = []
        if gru and gru not in grupos[fam]:
            grupos[fam].append(gru)
        arts.append({
            "ref": ref, "codigo": None, "categoria": fam, "subcategoria": gru or None, "descripcion": art,
            "nombre": None, "tipo": None, "medida_c": None, "foto": foto(gru, art),
            "unidad": "ud", "ud_venta": "ud", "ud_compra": "ud",
            "precio": None, "fecha": None, "precio_ant": None, "fecha_ant": None, "evol": None,
            "coste": None, "pvp": round(pvp_iva / IVA, 4) if pvp_iva else None, "pvp_iva": pvp_iva, "margen": None,
            "metros": None, "kg_m": None, "minimo": None, "compras": None, "nota": None, "apunte": None,
            "escalas": None, "solo_pvp": True, "orden": len(arts) + 1,
            "origen": "Precio de venta al público de la hoja de la tienda, con IVA.",
        })
    return {"articulos": arts, "log": [], "margen": None, "lineas": {}, "orden_hoja": True,
            "orden_familias": familias, "orden_grupos": grupos}
