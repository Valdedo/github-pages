"""Tarifas sacadas de las hojas plastificadas de la tienda (oct. 2026): bombonas de gas, morteros y cementos, piensos.

No son tarifas de compra: lo que manda es el precio de venta al público con IVA que pone la hoja de la tienda, y Andrés
lo cambia a mano en su hoja de Google (Mi unidad, compartida con casafonsomc). La app las enseña todas de golpe en una
cuadrícula con foto, nombre y precio (`"vista": "cuadricula"` en TARIFAS), en el orden de la hoja.

Fila de títulos (se buscan por su nombre, da igual el orden; solo las cuatro primeras son obligatorias):
    Familia | Grupo | Artículo | PVP con IVA | Formato | IVA | Sin IVA | Código | Coste | Fecha coste | Factura | PDF | Nota
- «Sin IVA» es una fórmula solo para mirar: la app lo saca del con IVA (÷ 1,21, o el IVA de la fila), con 4 decimales,
  así TreyFACT da lo mismo.
- «IVA»: 21, 10 o 4 (piensos al 10 %, la patata al 4 %). Vacío = el de la tarifa.
- «IVA aparte» = Sí: el precio de la fila va SIN IVA (los ** de la hoja de la tienda de morteros: Prefasec, piedra país,
  árido). Entonces el sin IVA es ese precio tal cual (lo que va a TreyFACT) y el con IVA, ese × 1,21 a céntimos.
- «Coste» (sin IVA), «Fecha coste», «Factura» y «PDF» (el ID del PDF en Drive): si hay coste, la ficha enseña coste,
  margen y la factura; si no, solo el precio de venta (`solo_pvp`, como las bombonas).
"""
import re
import unicodedata
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Callable, Optional

from app.services import fichas_producto

MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def n(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def slug(s) -> str:
    return re.sub(r"[^a-z0-9]+", "-", n(s)).strip("-")


def num(v) -> Optional[float]:
    """«18,90 €», «18,9», «1.234,56», «10 %» → número; vacío o sin cifras → None."""
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


def _iso(v) -> Optional[str]:
    """«25/08/2026» o «2026-08-25» → «2026-08-25» (como ladrillos); otra cosa → None."""
    s = str(v or "").strip()
    m = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))).strftime("%Y-%m-%d")
        except ValueError:
            return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    return m.group(0) if m else None


def _dia(v) -> Optional[str]:
    s = str(v or "").strip()
    m = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))).strftime("%d/%m/%Y")
        except ValueError:
            return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    return f"{m.group(3)}/{m.group(2)}/{m.group(1)}" if m else None


UDS = {"saco": "saco", "sacos": "saco", "bolsa": "bolsa", "bote": "bote", "cubo": "cubo", "caja": "caja", "paquete": "paquete"}


def leer(hojas: dict, prefijo: str, foto: Optional[Callable[[str, str, str, str], Optional[str]]] = None,
         iva: float = 21, origen: str = "Precio de venta al público de la hoja de la tienda, con IVA.",
         fichas: Optional[str] = None) -> dict:
    """«fichas»: la tarifa de backend/app/data/fichas_<tarifa>.json con para qué sirve cada producto y sus datos
    (services/fichas_producto.py). Una columna «Para qué sirve» en la hoja manda sobre ese texto."""
    vacio = {"articulos": [], "log": [], "margen": None, "lineas": {}}
    filas, ini = None, None
    for nombre in ["TARIFA", *hojas]:  # la pestaña «TARIFA»; si le cambian el nombre, la que tenga los títulos
        fs = hojas.get(nombre) or []
        i = next((k for k, f in enumerate(fs) if f and n(f[0]) == "familia"), None)
        if i is not None:
            filas, ini = fs, i
            break
    if filas is None:
        return vacio
    cab = [n(x) for x in filas[ini]]

    def col(*ts):
        return next((k for k, c in enumerate(cab) if any(c.startswith(t) for t in ts)), None)

    c_fam, c_gru, c_art = col("familia"), col("grupo"), col("articulo", "producto")
    c_pvp = col("pvp") if col("pvp") is not None else col("precio")
    if None in (c_fam, c_art, c_pvp):
        return vacio
    c_for, c_cod, c_cos = col("formato"), col("codigo"), col("coste")
    # «IVA» exacto (no «IVA aparte» ni «Sin IVA»)
    c_iva = next((k for k, c in enumerate(cab) if c in ("iva", "iva %", "% iva", "tipo iva", "tipo de iva")), None)
    c_apa = col("iva aparte", "mas iva", "+ iva", "+iva")
    c_fec, c_fac, c_pdf, c_nota, c_prov = col("fecha"), col("factura", "albaran"), col("pdf", "id pdf"), col("nota"), col("proveedor")
    c_uso = col("para que sirve", "uso")
    ancho = len(cab) + 2
    arts, familias, grupos, vistos, lineas = [], [], {}, set(), {}
    for f in filas[ini + 1:]:
        f = [str(x).strip() for x in f] + [""] * ancho
        v = lambda c: f[c] if c is not None else ""
        fam, gru, art, formato = v(c_fam), v(c_gru), v(c_art), v(c_for)
        pvp_iva = num(v(c_pvp))
        if not fam or not art:
            continue
        ref = f"{prefijo}-" + slug(f"{gru} {art} {formato}")
        if ref in vistos:  # la misma fila dos veces: vale la primera
            continue
        vistos.add(ref)
        if fam not in familias:
            familias.append(fam)
            grupos[fam] = []
        if gru and gru not in grupos[fam]:
            grupos[fam].append(gru)
        tipo_iva = num(v(c_iva))
        if tipo_iva is not None and 0 < tipo_iva < 1:  # «0,1» = 10 %
            tipo_iva *= 100
        tipo_iva = tipo_iva if tipo_iva in (0, 4, 5, 10, 21) else iva
        coste = num(v(c_cos))
        aparte = n(v(c_apa)) in ("si", "x", "1", "true", "*", "**")
        if aparte and pvp_iva:  # el precio de la fila es sin IVA
            pvp = round(pvp_iva, 4)
            pvp_iva = float((Decimal(str(pvp)) * (1 + Decimal(str(tipo_iva)) / 100)).quantize(Decimal("0.01"), ROUND_HALF_UP))
        else:
            pvp = round(pvp_iva / (1 + tipo_iva / 100), 4) if pvp_iva else None
        primera = n(formato).split(" ")[0] if formato else ""
        ud = UDS.get(primera, "ud")
        cod = v(c_cod).lstrip("'") or None
        fecha, factura = _iso(v(c_fec)), v(c_fac)
        # «Pedido 358», «Albarán B2538»: tipo y número (la ficha dice «Último pedido», «Abrir albarán»); «Tarifa …» no es
        # una compra: solo se dice de dónde sale el coste
        f0 = n(factura).split(" ")[0] if factura else ""
        tipo = {"pedido": "Pedido", "albaran": "Albarán"}.get(f0)
        numero = factura.split(" ", 1)[1] if tipo and " " in factura else factura
        texto = origen if tipo_iva == iva == 21 else origen.replace("con IVA.", f"con IVA del {tipo_iva:g} %.")
        if aparte:
            texto = f"En la hoja de la tienda: {str(f'{pvp:.2f}').replace('.', ',')} € + IVA (IVA aparte)."
        if coste:
            de = ("la última compra" if not factura else f"l {factura[0].lower()}{factura[1:]}" if f0 in ("pedido", "albaran")
                  else f" la {factura[0].lower()}{factura[1:]}" if f0 == "tarifa" else f" la factura {factura}")
            texto += f" Coste de{de if factura else ' ' + de}{' del ' + _dia(v(c_fec)) if _dia(v(c_fec)) else ''}, sin IVA."
        a = {
            # El formato va también en el nombre: en la búsqueda, la ficha y lo apuntado de la tableta se distinguen
            # los dos sacos del mismo pienso (la cuadrícula lo quita del nombre y lo pone debajo)
            "ref": ref, "codigo": cod, "categoria": fam, "subcategoria": gru or None,
            "descripcion": f"{art} · {formato}" if formato else art,
            "nombre": None, "tipo": None, "medida_c": None, "formato": formato or None,
            "foto": foto(fam, gru, art, formato) if foto else None,
            "unidad": ud, "ud_venta": ud, "ud_compra": ud,
            "precio": coste, "fecha": fecha, "precio_ant": None, "fecha_ant": None, "evol": None,
            "coste": coste, "pvp": pvp, "pvp_iva": pvp_iva, "iva": tipo_iva,
            "margen": round((pvp / coste - 1) * 100, 1) if pvp and coste else None,
            "metros": None, "kg_m": None, "minimo": None, "compras": None, "nota": None, "apunte": v(c_nota) or None,
            "escalas": None, "solo_pvp": not coste, "orden": len(arts) + 1, "origen": texto,
            **({"iva_aparte": True} if aparte else {}),
        }
        if c_prov is not None and v(c_prov):
            a["proveedor"] = v(c_prov)
        prod = fichas_producto.buscar(fichas, f"{art} {formato}") if fichas else None
        if v(c_uso):
            prod = {**(prod or {"datos": [], "consejo": None, "fuente": None}), "uso": v(c_uso)}
        if prod:
            a["producto"] = prod
        arts.append(a)
        lineas[ref] = ([{"fecha": fecha, "factura": "" if f0 == "tarifa" else numero, "precio": coste, "cantidad": None,
                         "bruto": None, "dto1": None, "dto2": None, **({"tipo": tipo} if tipo else {}),
                         **({"pdf": v(c_pdf)} if v(c_pdf) and f0 != "tarifa" else {})}]
                       if coste and fecha else [])
    # «sin_compras»: como mucho la última compra, no cada una (no se cuentan las veces)
    return {"articulos": arts, "log": [], "margen": None, "lineas": lineas, "orden_hoja": True, "sin_compras": True,
            "orden_familias": familias, "orden_grupos": grupos}
