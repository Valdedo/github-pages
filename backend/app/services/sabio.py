"""Mallas y alambres de El Sabio (13/11/2026): las hojas plastificadas de la tienda, con su precio de venta con IVA.

Hoja «TARIFA_MALLAS_ALAMBRES» (Mi unidad de Andrés, compartida con casafonsomc), pestaña TARIFA, leída con el lector común
de las hojas de la tienda (services/hoja_tienda.py). Todo se compra a El Sabio (cliente 2510); los códigos son los suyos y
el coste es el neto de su extranet (tarifa − dto. − 3 %), sin IVA. Lo principal es el precio por metro (mallas, cable) o por
kilo (alambre de 25 y 40 kg), y el rollo entero va aparte («Rollo entero (con IVA)» + «Rollo de»). Márgenes sobre coste
(Andrés, 13/11/2026): por metro/kilo 40 %, rollo entero 30 %, lo que solo se vende en rollo 35 %. La misma pieza en varias
medidas («Medida») sale en una sola línea de la familia que se abre en sus medidas, no en la cuadrícula.

Fotos: las de la extranet de El Sabio (ws02.internaco.com, «preview» de 550 px), una por tipo de malla, en
frontend/public/catalogo/sab. El rollo de 16 mm de triple torsión lleva en la extranet la foto de la malla soldada: aquí va
con la de triple torsión.

Alambre: la tabla de equivalencias de la hoja de la tienda (MRT: n.º de París, diámetro, metros por kilo y peso de 100 m)
va en «Para qué sirve» de cada alambre, con los metros que trae su rollo.
"""
import re
from typing import Optional

from app.services import hoja_tienda

IVA = 21

# (palabras del nombre o del grupo, foto); la primera que encaja
FOTOS = [
    (("torsion",), "triple-torsion"), (("conejera",), "triple-torsion"), (("gallinero",), "triple-torsion"),
    (("soldada", "galv"), "soldada-galvanizada"), (("soldada",), "soldada-plastificada"),
    (("barrera",), "barrera"), (("mosquitera",), "mosquitera"), (("ocultacion",), "ocultacion"),
    (("antihierba",), "antihierba"), (("plastica",), "malla-plastica"),
    (("plastificado",), "alambre-plastificado"), (("alambre",), "alambre-galvanizado"), (("cable",), "cable-acero"),
]

# Equivalencias del alambre (hoja MRT de la tienda): n.º de París → (diámetro mm, metros en 1 kg, kg de 100 m)
EQUIV = {
    1: (0.60, 454.54, 0.220), 2: (0.70, 333.33, 0.300), 3: (0.80, 255.1, 0.392), 4: (0.90, 201.61, 0.496),
    5: (1.00, 163.4, 0.612), 6: (1.10, 134.95, 0.741), 7: (1.20, 113.51, 0.881), 8: (1.30, 96.62, 1.035),
    9: (1.40, 83.33, 1.200), 10: (1.50, 72.55, 1.378), 11: (1.60, 63.77, 1.568), 12: (1.80, 50.4, 1.984),
    13: (2.00, 40.85, 2.448), 14: (2.20, 33.74, 2.964), 15: (2.40, 28.34, 3.528), 16: (2.70, 22.4, 4.463),
    17: (3.00, 18.14, 5.513), 18: (3.40, 14.12, 7.082), 19: (3.90, 10.73, 9.317), 20: (4.40, 8.43, 11.859),
    21: (4.90, 6.8, 14.708), 22: (5.40, 5.59, 17.863), 23: (5.90, 4.69, 21.324),
}


def _es(x: float, dec: int = 2) -> str:
    return f"{x:.{dec}f}".rstrip("0").rstrip(".").replace(".", ",")


def foto(fam: str, gru: str, art: str, formato: str) -> Optional[str]:
    t = hoja_tienda.n(f"{art} {gru} {fam}")
    for palabras, nombre in FOTOS:
        if all(p in t for p in palabras):
            return f"/catalogo/sab/{nombre}.webp"
    return None


def equivalencia(art: str, formato: str, grupo: str = "") -> Optional[dict]:
    """Datos del alambre por su n.º de París («n.º 12», «N.º 12», «nº12»): diámetro, metros por kilo y los del rollo.
    «art» es la descripción entera («Rollo de 40 kg · N.º 12 · 1,8 mm · Por kilo»); el grupo dice si es alambre."""
    t = hoja_tienda.n(art)
    if "alambre" not in t and "alambre" not in hoja_tienda.n(grupo):
        return None
    m = re.search(r"\bn\W{0,2}o?\W{0,2}\s*(\d{1,2})\b", t)
    if not m or int(m.group(1)) not in EQUIV:
        return None
    nro = int(m.group(1))
    d, m_kg, kg100 = EQUIV[nro]
    datos = [["N.º de París", str(nro)], ["Diámetro", f"{_es(d)} mm"], ["Metros por kilo", f"{_es(m_kg)} m"],
             ["Peso de 100 m", f"{_es(kg100, 3)} kg"]]
    kg = re.search(r"(\d+(?:[.,]\d+)?)\s*kg", hoja_tienda.n(f"{formato} {art}"))
    if kg:
        k = float(kg.group(1).replace(",", "."))
        datos.append([f"Metros del rollo de {_es(k)} kg", f"unos {round(k * m_kg):,} m".replace(",", ".")])
    return {"uso": "Alambre para cerramientos, agricultura y construcción. Cuanto más alto el número, más grueso.",
            "datos": datos, "consejo": None, "fuente": None}


def leer(hojas: dict) -> dict:
    out = hoja_tienda.leer(hojas, "sab", foto, iva=IVA)
    for a in out["articulos"]:
        eq = equivalencia(a["descripcion"], a.get("formato") or "", a.get("subcategoria") or "")
        if eq and not a.get("producto"):
            a["producto"] = eq
    return out
