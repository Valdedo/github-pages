"""Organización de la tarifa de Isoltubex para el catálogo (oct. 2026).

La hoja «TARIFA_ISOLTUBEX_2026» tiene una pestaña por tipo de accesorio (TUBOS, ACCES MULTICAPA, ACCES PPSU,
ACCES COMPRESION, ACCES EXPANSION, ACCES PEX, ACCES LATON, MAQUINAS) y una de avisos (SIN_NETO_AVISO) con lo que
sale en la tarifa del fabricante pero aún no tiene precio neto. Las descripciones de Isoltubex son muy regulares
(«CODO ROSCA HEMBRA M.C. (16 X 2) X 1/2»), así que aquí se ordenan con reglas y no con una tabla a mano:
cualquier referencia nueva cae sola en su familia, grupo y tipo de pieza.

Cada artículo queda con: familia, grupo, tipo de pieza (las medidas de un mismo tipo salen en botones),
medida bonita («16 × ½″»), orden de la medida y un nombre claro («Codo rosca hembra multicapa 16 × ½″»).
Las fotos salen del catálogo oficial de Isoltubex (tools/isoltubex-fotos.py) y se guardan por referencia y por
tipo de pieza en app/data/isoltubex_fotos.json: una referencia nueva coge la foto de su tipo.
"""
import json
import os
import re
import unicodedata
from typing import Optional

# Orden de las familias en la app y nombre corto del sistema para el nombre de cada pieza
FAMILIAS = [
    ("Tubería multicapa", ""),
    ("Tubería PEX, PE-RT y PP‑R", ""),
    ("Accesorios multicapa (prensar)", "multicapa"),
    ("Accesorios PE-RT y PEX (prensar)", "PE-RT/PEX"),
    ("Accesorios de expansión F&R", "F&R"),
    ("Accesorios de compresión", "compresión"),
    ("Colectores y cajas", ""),
    ("Accesorios de latón para roscar", ""),
    ("Herramientas y varios", ""),
]
SISTEMA = dict(FAMILIAS)
FAM_POS = {f: i for i, (f, _) in enumerate(FAMILIAS)}
F_MC, F_PEX, F_AMC, F_APEX, F_FR, F_COMP, F_COL, F_LAT, F_HER = (f for f, _ in FAMILIAS)

PESTANAS = ["INICIO", "TUBOS", "ACCES MULTICAPA", "ACCES PPSU", "ACCES COMPRESION", "ACCES EXPANSION",
            "ACCES PEX", "ACCES LATON", "MAQUINAS", "SIN_NETO_AVISO"]

_FOTOS = os.path.join(os.path.dirname(__file__), "..", "data", "isoltubex_fotos.json")
try:
    with open(_FOTOS, encoding="utf-8") as _f:
        FOTOS = json.load(_f)
except (OSError, ValueError):
    FOTOS = {"refs": {}, "tipos": {}, "familias": {}}


def _n(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


def _num(v) -> Optional[float]:
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v or "").strip().replace("€", "").replace("%", "").replace(" ", "").replace(" ", "")
    if not re.search(r"\d", s) or "falta" in s.lower():
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


# ── Medidas ───────────────────────────────────────────────────────────────
FRAC = {"1/2": "½", "1/4": "¼", "3/4": "¾", "3/8": "⅜", "1/8": "⅛"}


def pulgadas(tok: str) -> tuple[str, float]:
    """«1_1/4», «11/4», «1/2», «2» → («1¼″», 1.25)."""
    t = tok.replace("''", "").replace('"', "").replace("”", "").strip()
    m = re.fullmatch(r"(\d)_(\d/\d)", t) or (re.fullmatch(r"([1-9])(\d/\d)", t) if len(t) == 4 else None)
    if m:
        a, fr = m.group(1), m.group(2)
        n, d = fr.split("/")
        return f"{a}{FRAC.get(fr, '-' + fr)}″", int(a) + int(n) / int(d)
    if t in FRAC:
        n, d = t.split("/")
        return f"{FRAC[t]}″", int(n) / int(d)
    try:
        return f"{t}″", float(t)
    except ValueError:
        return t, 0.0


# Espesores de pared de los tubos de Isoltubex (multicapa, PE-RT/PEX): «16 X 2» es el tubo de 16, no 16 × 2″
ESPESORES = {16: {"2", "1,8", "1.8"}, 18: {"2"}, 20: {"2", "1,9", "1.9"}, 25: {"2,5", "2.5", "2,3", "2.3"},
             32: {"3", "2,9", "2.9"}, 40: {"4"}, 50: {"4,5", "4.5"}, 63: {"6", "3"}}


def _sin_espesor(s: str) -> str:
    """«(16 X 2)», «16 X 1,8», «50X4,5» → «16», «50»: el espesor del tubo no sirve para elegir la pieza.
    «32 X 1» (rosca de 1″) o «40 X 1 1/4» se quedan como están."""
    def f(m):
        return m.group(1) if m.group(2) in ESPESORES.get(int(m.group(1)), ()) else m.group(0)
    return re.sub(r"(\d{2})\s*X\s*(\d(?:[.,]\d+)?)\b(?!\s*\d*/)", f, s)


def _tokens(s: str) -> list[str]:
    s = re.sub(r"(\d)\s*-\s*(\d/\d)", r"\1_\2", s)       # «1-1/4» (pulgadas) en los accesorios
    s = re.sub(r"(\d) (\d/\d)", r"\1_\2", s)              # «1 1/4»
    return re.findall(r"\d+_\d/\d|\d+/\d+|\d+(?:[.,]\d+)?", s)


def medida_accesorio(desc: str, rosca: bool) -> tuple[str, float]:
    """Medida de una pieza de tubo: los diámetros en mm y la rosca (lo último, si la hay) en pulgadas."""
    s = re.sub(r"\(\s*BOLSA[^)]*\)?|M/M|-\s*45\S*|ø|Ø", " ", _n(desc))
    s = _sin_espesor(s)
    # distribuidores y cruces: «25-20161616» → 25, 20, 16, 16, 16
    s = re.sub(r"\b(\d{2})(\d{2})(\d{2})(\d{2})\b", r"\1 \2 \3 \4", s)
    toks = _tokens(s)
    if not toks:
        return "", 0.0
    partes, orden = [], 0.0
    for i, t in enumerate(toks):
        if (rosca and i == len(toks) - 1 and i > 0) or "/" in t:
            txt, v = pulgadas(t)
        else:
            txt, v = t.replace(".", ","), _num(t) or 0
        partes.append(txt)
        orden = orden * 1000 + v
    return " × ".join(partes), orden


def medida_laton(desc: str) -> tuple[str, float]:
    """Latón para roscar: todo en pulgadas, «1 1/2» es 1½ y «1-1/2» es 1 × ½."""
    s = _n(desc)
    s = re.sub(r"\(\s*BOLSA[^)]*\)?|\bCROM\w*|\bM-H\b|\bH-H\b|''|3 PIEZAS", " ", s)
    s = re.sub(r"(\d) (\d/\d)", r"\1_\2", s)
    s = re.sub(r"\b[MH]\b", " ", s)
    toks = re.findall(r"\d+_\d/\d|\d+/\d+|\d+", s)
    partes, orden = [], 0.0
    for t in toks:
        txt, v = pulgadas(t)
        partes.append(txt)
        orden = orden * 100 + v
    return " × ".join(partes), orden


# ── Tuberías: la referencia dice el diámetro y el formato ─────────────────
_TUBO = re.compile(r"^(?P<lin>MCNGAS|MCGAS|MCFIJA|MCN|MC|PERTFIJA|PERT|PEXAFIJAEVOH|PEXAEVOH|PEX-A|PEX|PPRFCT-UV|PPRFCT)"
                   r"(?P<d>\d{2,3})(?P<resto>.*)$")


def _tubo(cod: str, desc: str) -> Optional[dict]:
    m = _TUBO.match(cod.upper())
    if not m:
        return None
    lin, d, resto = m.group("lin"), int(m.group("d")), m.group("resto")
    nd = _n(desc)
    evoh = "EVOH" in resto or "EVOH" in lin
    ais = re.search(r"AIS(\d+)-([ANR])", resto)
    color = {"A": "Azul", "N": "Negro", "R": "Rojo"}.get(ais.group(2)) if ais else None
    fb = re.search(r"-?B(\d+)$", resto)
    fr = re.search(r"R(\d+)(C?)$", resto)
    if fb:
        fmt, orden, ud = f"Barra {fb.group(1)} m", int(fb.group(1)), "barra"
        metros = int(fb.group(1))
    elif fr:
        fmt = f"Rollo {fr.group(1)} m" + (" (caja)" if fr.group(2) else "")
        orden, ud, metros = 1000 + int(fr.group(1)), "rollo", int(fr.group(1))
    else:
        r50 = re.search(r"ROLLO (\d+)", nd)
        metros = int(r50.group(1)) if r50 else None
        fmt = f"Rollo {metros} m" if metros else "Barra 4 m" if "BARRA 4" in nd else ""
        orden, ud = (1000 + (metros or 0)), "rollo" if metros else "ud"
    if "PPRF" in lin:
        if "BARRA 4" in nd or "UV" in lin:
            fmt, orden, ud, metros = "Barra 4 m", 4, "barra", 4
        else:
            fmt, orden, ud, metros = "Barra 4 m", 4, "barra", 4
    esp = {"MC": {16: "2", 18: "2", 20: "2", 25: "2,5", 32: "3", 40: "4", 50: "4,5", 63: "6"},
           "PE": {16: "1,8", 20: "1,9", 25: "2,3", 32: "2,9"}}
    e_mc, e_pe = esp["MC"].get(d), esp["PE"].get(d)
    if lin in ("MCGAS", "MCNGAS"):
        f, g = F_MC, "Multicapa para gas"
        t = f"{'Negro' if lin == 'MCNGAS' else 'Amarillo'} Ø{d}"
    elif lin == "MCFIJA":
        f, g, t = F_MC, "Multicapa para suelo radiante", f"Ø{d} × 1,8 con cinta autofijación"
    elif ais and lin == "MC":
        f, g, t = F_MC, "Multicapa con aislamiento 10 mm", f"Ø{d} × {e_mc} · {fmt.lower()}"
    elif lin == "MCN":
        f, g, t = F_MC, "Multicapa negro (exterior, anti UV)", f"Ø{d} × {e_mc}"
    elif lin == "MC":
        f, g, t = F_MC, "Multicapa", f"Ø{d} × {e_mc}"
    elif lin in ("PEXAEVOH", "PEXAFIJAEVOH"):
        f, g = F_PEX, "PEX-a EVOH (suelo radiante)"
        t = f"Ø{d} × {e_pe}" + (" con autofijación" if "FIJA" in lin else "")
    elif lin == "PERTFIJA" or (lin == "PERT" and evoh):
        f, g = F_PEX, "PE-RT EVOH (suelo radiante)"
        t = f"Ø{d} × {e_pe}" + (" con autofijación" if "FIJA" in (lin + resto) else "")
    elif ais and lin == "PEX":
        f, g, t = F_PEX, "PEX-a con aislamiento 10 mm", f"Ø{d} × {e_pe} · {fmt.lower()}"
    elif ais and lin == "PERT":
        f, g, t = F_PEX, "PE-RT con aislamiento 10 mm", f"Ø{d} × {e_pe} · {fmt.lower()}"
    elif lin in ("PEX", "PEX-A"):
        f, g, t = F_PEX, "PEX-a", f"Ø{d} × {e_pe}"
    elif lin == "PERT":
        f, g, t = F_PEX, "PE-RT", f"Ø{d} × {e_pe}"
    elif lin in ("PPRFCT-UV", "PPRFCT"):  # solo barras de 4 m: se elige el diámetro
        g = "PP-R Faser CT anti UV" if lin == "PPRFCT-UV" else "PP-R Faser CT"
        return {"f": F_PEX, "g": g, "t": "Barra 4 m", "m": f"Ø{d}", "o": float(d), "rank": 0,
                "n": f"{g} Ø{d}, barra 4 m", "ud": "barra", "metros": 4}
    medida = color or fmt
    if ais:
        orden = "ANR".index(ais.group(2))
    nombre = f"{g} {t.replace('·', '—')} — {medida.lower()}" if color else f"{g} {t}, {fmt.lower()}"
    if g == "Multicapa para gas":
        nombre = f"Multicapa para gas {t.lower().replace('ø', 'Ø')}, {fmt.lower()}"
    nombre = re.sub(r"\s+", " ", nombre).replace(" — rollo", ", rollo")
    return {"f": f, "g": g, "t": t, "m": medida, "o": float(orden), "n": nombre, "ud": ud, "metros": metros,
            "rank": d * 10 + (5 if "FIJA" in lin else 0)}


# ── Accesorios: tipo de pieza por la descripción ──────────────────────────
# (regla, tipo, grupo, lleva rosca)  — tipo None: va suelto en la lista, con su nombre
_R_ACC = [
    (r"ANILLO EXPANSION.*AZUL", "Anillo de expansión azul (bolsa 25)", "Anillos de expansión", False),
    (r"ANILLO EXPANSION.*BLANCO", "Anillo de expansión blanco (bolsa 25)", "Anillos de expansión", False),
    (r"ANILLO EXPANSION.*ROJO", "Anillo de expansión rojo (bolsa 25)", "Anillos de expansión", False),
    (r"^CODO .*PLADUR", "Codo con soporte para pladur", "Codos", True),
    (r"^CODO .*SOPORTE LARGO", "Codo con soporte largo", "Codos", True),
    (r"^CODO .*SOPORTE", "Codo con soporte", "Codos", True),
    (r"^CODO T\.? ?MOVIL", "Codo tuerca móvil", "Codos", True),
    (r"^CODO (ROSCA |R\. ?)?HEMBRA", "Codo rosca hembra", "Codos", True),
    (r"^CODO (ROSCA |R\. ?)?MACHO", "Codo rosca macho", "Codos", True),
    (r"^CODO RADIADOR", "Codo de radiador", "Codos", False),
    (r"^CODO EXTRAIBLE", "Codo extraíble", "Codos", True),
    (r"^CODO ADAPT", "Codo adaptador a cobre", "Adaptadores a cobre", False),
    (r"^CODO .*45", "Codo 45°", "Codos", False),
    (r"^CODO", "Codo", "Codos", False),
    (r"^TE (ROSCA |R\. ?)?HEMBRA", "Te rosca hembra", "Tes", True),
    (r"^TE REDUCIDA", "Te reducida", "Tes", False),
    (r"^TE\b", "Te", "Tes", False),
    (r"^UNION", "Unión", "Uniones y reducciones", False),
    (r"^REDUCCION", "Reducción", "Uniones y reducciones", False),
    (r"^ENLACE (ROSCA |R\. ?)?HEMBRA", "Enlace rosca hembra", "Enlaces y racores", True),
    (r"^ENLACE (ROSCA |R\. ?)?MACHO", "Enlace rosca macho", "Enlaces y racores", True),
    (r"^RACORD? MOVIL", "Racor tuerca móvil", "Enlaces y racores", True),
    (r"^ADAPTADOR", "Adaptador a tubo de cobre", "Adaptadores a cobre", False),
    (r"^VALVULA ESFERA (EN )?U .*PLADUR", "Válvula de esfera en U para pladur", "Válvulas", False),
    (r"^VALVULA ESFERA (EN )?U\b", "Válvula de esfera en U", "Válvulas", False),
    (r"^VALVULA ESFERA .*PLADUR", "Válvula de esfera para pladur", "Válvulas", False),
    (r"^VALVULA ESFERA", "Válvula de esfera", "Válvulas", False),
    (r"^VALVULA LINEA .*\d X \d/\d|^VALVULA LINEA .*\d X 1$", "Válvula de línea con rosca macho", "Válvulas", True),
    (r"^VALVULA LINEA", "Válvula de línea", "Válvulas", False),
    (r"^VALVULA REGULACION U", "Válvula de regulación en U", "Válvulas", False),
    (r"^VALVULA REGULACION", "Válvula de regulación", "Válvulas", False),
    (r"^VALVULA MINI", "Válvula mini", "Válvulas", True),
    (r"^GRIFO LAVADORA", None, "Válvulas", False),
    (r"^DISTRIBUIDOR CRUZ|^CRUZ", "Cruz distribuidora", "Distribuidores y cruces", False),
    (r"^DISTRIBUIDOR", "Distribuidor", "Distribuidores y cruces", False),
    (r"^TAPON RECUPERABLE", "Tapón recuperable (para pruebas)", "Tapones", False),
    (r"^TAPON", "Tapón", "Tapones", False),
    (r"^EUROCONO", None, "Enlaces y racores", False),
    (r".", None, "Mandos, placas y varios", False),
]
# Orden en que se enseñan los tipos dentro de su grupo
ORDEN_TIPOS = ["Codo", "Codo 45°", "Codo rosca hembra", "Codo rosca macho", "Codo tuerca móvil", "Codo con soporte",
               "Codo con soporte largo", "Codo con soporte para pladur", "Codo de radiador", "Codo extraíble",
               "Te", "Te reducida", "Te rosca hembra", "Unión", "Reducción", "Enlace rosca hembra", "Enlace rosca macho",
               "Racor tuerca móvil", "Adaptador a tubo de cobre", "Codo adaptador a cobre", "Válvula de esfera",
               "Válvula de esfera para pladur", "Válvula de esfera en U", "Válvula de esfera en U para pladur",
               "Válvula de línea", "Válvula de línea con rosca macho", "Válvula de regulación", "Válvula de regulación en U",
               "Válvula mini", "Distribuidor", "Cruz distribuidora", "Tapón", "Tapón recuperable (para pruebas)",
               # latón
               "Codo hembra", "Codo hembra cromado", "Codo macho-hembra", "Codo macho-hembra cromado", "Codo reducido hembra",
               "Codo hembra con soporte", "Codo tres vías hembra", "Curva hembra", "Curva macho-hembra", "Te cromada",
               "Manguito hembra", "Manguito reducido hembra", "Machón", "Machón cromado", "Machón reducido",
               "Machón reducido cromado", "Reducción macho-hembra", "Racor marsella", "Racor marsella cromado",
               "Racor marsella reducido", "Racor marsella reducido cromado", "Racor marsella ½″ para roscar",
               "Enlace 3 piezas hembra-hembra", "Enlace 3 piezas macho-hembra", "Tapón hembra", "Tapón macho",
               "Alargadera M-H 5 cm", "Alargadera M-H 5 cm cromada", "Alargadera M-H 10 cm", "Alargadera M-H 10 cm cromada",
               "Collarín de toma"]


def rango(tipo: Optional[str]) -> float:
    if not tipo:
        return 999
    base = tipo.replace(" PPSU", "")
    i = ORDEN_TIPOS.index(base) if base in ORDEN_TIPOS else 500
    if tipo.startswith("Anillo"):
        i = 600 + ["azul", "blanco", "rojo"].index(tipo.split()[3])
    return i + (0.5 if "PPSU" in tipo else 0)


GRUPOS_ACC = ["Codos", "Tes", "Uniones y reducciones", "Enlaces y racores", "Adaptadores a cobre", "Válvulas",
              "Distribuidores y cruces", "Tapones", "Anillos de expansión", "Mandos, placas y varios"]

_R_LAT = [
    (r"ALARGADERA CROMADA.*10 CM", "Alargadera M-H 10 cm cromada", "Alargaderas y collarines"),
    (r"ALARGADERA CROMADA", "Alargadera M-H 5 cm cromada", "Alargaderas y collarines"),
    (r"ALARGADERA.*10 CM", "Alargadera M-H 10 cm", "Alargaderas y collarines"),
    (r"ALARGADERA", "Alargadera M-H 5 cm", "Alargaderas y collarines"),
    (r"COLLARIN", "Collarín de toma", "Alargaderas y collarines"),
    (r"CODO 3 VIAS", "Codo tres vías hembra", "Codos y curvas"),
    (r"CODO MURAL", "Codo hembra con soporte", "Codos y curvas"),
    (r"CODO H-H \S+ X ", "Codo reducido hembra", "Codos y curvas"),
    (r"CODO H-H .*CROM", "Codo hembra cromado", "Codos y curvas"),
    (r"CODO H-H", "Codo hembra", "Codos y curvas"),
    (r"CODO M-H .*CROM", "Codo macho-hembra cromado", "Codos y curvas"),
    (r"CODO M-H", "Codo macho-hembra", "Codos y curvas"),
    (r"CURVA H-H", "Curva hembra", "Codos y curvas"),
    (r"CURVA M-H", "Curva macho-hembra", "Codos y curvas"),
    (r"^TE REDUCIDA", "Te reducida", "Tes"),
    (r"^TE .*CROM", "Te cromada", "Tes"),
    (r"^TE\b", "Te", "Tes"),
    (r"MACHON REDUCIDO.*CROM", "Machón reducido cromado", "Machones"),
    (r"MACHON REDUCIDO", "Machón reducido", "Machones"),
    (r"MACHON.*CROM", "Machón cromado", "Machones"),
    (r"MACHON", "Machón", "Machones"),
    (r"MANGUITO REDUCIDO|UNION REDUCIDA", "Manguito reducido hembra", "Manguitos"),
    (r"MANGUITO UNION|UNION HEMBRA", "Manguito hembra", "Manguitos"),
    (r"TUERCA REDUCIDA", "Reducción macho-hembra", "Reducciones"),
    (r"MARSELLA REDUCIDO.*CROM", "Racor marsella reducido cromado", "Racores marsella"),
    (r"MARSELLA REDUCIDO", "Racor marsella reducido", "Racores marsella"),
    (r"MARSELLA ROSCAR", "Racor marsella ½″ para roscar", "Racores marsella"),
    (r"MARSELLA.*CROM", "Racor marsella cromado", "Racores marsella"),
    (r"MARSELLA", "Racor marsella", "Racores marsella"),
    (r"TUERCA UNION 3 PIEZAS H-H", "Enlace 3 piezas hembra-hembra", "Enlaces 3 piezas"),
    (r"TUERCA UNION 3 PIEZAS M-H", "Enlace 3 piezas macho-hembra", "Enlaces 3 piezas"),
    (r"TAPON (H|HEMBRA)\b", "Tapón hembra", "Tapones"),
    (r"TAPON (M|MACHO)\b", "Tapón macho", "Tapones"),
    (r".", None, "Varios"),
]
GRUPOS_LAT = ["Codos y curvas", "Tes", "Manguitos", "Machones", "Reducciones", "Racores marsella", "Enlaces 3 piezas",
              "Tapones", "Alargaderas y collarines", "Varios"]
GRUPOS = {
    F_MC: ["Multicapa", "Multicapa negro (exterior, anti UV)", "Multicapa con aislamiento 10 mm",
           "Multicapa para suelo radiante", "Multicapa para gas"],
    F_PEX: ["PEX-a", "PE-RT", "PEX-a con aislamiento 10 mm", "PE-RT con aislamiento 10 mm",
            "PEX-a EVOH (suelo radiante)", "PE-RT EVOH (suelo radiante)", "PP-R Faser CT", "PP-R Faser CT anti UV"],
    F_AMC: GRUPOS_ACC, F_APEX: GRUPOS_ACC, F_FR: GRUPOS_ACC, F_COMP: GRUPOS_ACC,
    F_COL: ["Colectores", "Kits de colector para calefacción", "Cajas de colector", "Varios"],
    F_LAT: GRUPOS_LAT,
    F_HER: ["Herramientas", "Varios"],
}


def _bonita(d: str) -> str:
    s = re.sub(r"\s+", " ", re.sub(r"\s*--\s*$", "", str(d).strip())).lower()
    s = re.sub(r"\bm\.?c\.?\b", "multicapa", s).replace("valvula", "válvula").replace("plastico", "plástico")
    return s[:1].upper() + s[1:]


def _colector(cod: str, nd: str) -> Optional[dict]:
    m = re.match(r"^(COVC|CO)(1|3/4)X(\d+)-(\d+)$", cod)
    if m:
        cuerpo, n, d = pulgadas(m.group(2))[0], int(m.group(3)), m.group(4)
        t = f"Colector {cuerpo} con euroconos Ø{d}" + (" y válvulas de regulación" if m.group(1) == "COVC" else "")
        return {"g": "Colectores", "t": t, "m": f"{n} salidas", "o": float(n), "n": f"{t} — {n} salidas"}
    m = re.match(r"^KRAD(1|34)-(\d+)$", cod)
    if m:
        cuerpo = "1″" if m.group(1) == "1" else "¾″"
        n = int(m.group(2))
        t = f"Kit colector calefacción {cuerpo}"
        return {"g": "Kits de colector para calefacción", "t": t, "m": f"{n} salidas", "o": float(n),
                "n": f"{t} — {n} salidas (con caja)"}
    dims = re.search(r"(\d{3}) ?X ?(\d{3}) ?X ?(\d{2,3})", nd)
    if dims and ("CAJA" in nd):
        t = "Caja de colector plegable (plástico)" if "PLAST" in nd else "Caja de colector calefacción"
        md = "×".join(dims.groups())
        return {"g": "Cajas de colector", "t": t, "m": md, "o": float(dims.group(1)), "n": f"{t} {md} mm"}
    return None


def clasifica(pestana: str, cod: str, desc: str, subfam: str) -> dict:
    """Familia (f), grupo (g), tipo (t), medida (m), orden (o), nombre claro (n) y unidad de venta (ud)."""
    nd, ns = _n(desc), _n(subfam)
    cod = cod.strip().upper()
    if pestana == "TUBOS" or (pestana == "SIN_NETO_AVISO" and "TUBERIA" in ns):
        t = _tubo(cod, desc)
        if t:
            return t
    if pestana == "MAQUINAS" or re.match(r"^(ABOCARDADOR|LUBRIFICANTE|ROLLO TEFLON|MAQUINA|JUEGO CUNAS)", nd):
        if nd.startswith("ABOCARDADOR"):
            m = re.search(r"(\d+-\d+-\d+)", nd)
            return {"f": F_HER, "g": "Herramientas", "t": "Calibrador abocardador escariador", "m": m.group(1) if m else "",
                    "o": float(m.group(1).split("-")[0]) if m else 0, "n": f"Calibrador abocardador escariador {m.group(1) if m else ''}".strip()}
        g = "Herramientas" if re.match(r"^(MAQUINA|JUEGO CUNAS)", nd) else "Varios"
        nombre = _bonita(desc).replace("Maquina manual, con maletin", "Prensadora manual con maletín").replace("cunas", "cuñas")
        nombre = nombre.replace("Juego cunas", "Juego de cuñas").replace("Lubrificante accesorios", "Lubricante para accesorios")
        return {"f": F_HER, "g": g, "t": None, "m": None, "o": None, "n": nombre}
    if pestana == "ACCES LATON":
        for rx, tipo, grupo in _R_LAT:
            if re.search(rx, nd):
                if tipo is None:
                    return {"f": F_LAT, "g": grupo, "t": None, "m": None, "o": None, "n": _bonita(desc)}
                if tipo == "Collarín de toma":
                    md, o = medida_accesorio(desc, rosca=True)
                elif tipo.startswith("Racor marsella ½″"):
                    cm = re.search(r"(\d) CM", nd)
                    md, o = (f"{cm.group(1)} cm", float(cm.group(1))) if cm else ("", 0.0)
                elif tipo.startswith("Alargadera"):
                    md, o = medida_laton(re.sub(r"- \d+ CM", "", nd))
                else:
                    md, o = medida_laton(nd)
                return {"f": F_LAT, "g": grupo, "t": tipo, "m": md, "o": o, "n": f"{tipo} {md}".strip()}
    if pestana == "ACCES MULTICAPA":
        c = _colector(cod, nd)
        if c:
            return {"f": F_COL, **c}
        if re.search(r"ABRAZADERAS CAJA COLECTOR", nd):
            return {"f": F_COL, "g": "Varios", "t": None, "m": None, "o": None, "n": "Kit de 6 abrazaderas para caja de colector 1″"}
        fam = F_AMC
    elif pestana == "ACCES PPSU":
        fam = F_AMC
    elif pestana == "ACCES COMPRESION":
        fam = F_COMP
    elif pestana == "ACCES EXPANSION":
        fam = F_FR
    elif pestana == "ACCES PEX":
        fam = F_APEX
    else:
        fam = F_AMC
    ppsu = "PPSU" in nd
    limpio = re.sub(r"\b(M\.C\.|MC|PPSU|PEX|PERT|COMPRESION|FR|LATON)\b", " ", nd)
    limpio = re.sub(r"\s+", " ", limpio).strip(" -")
    for rx, tipo, grupo, rosca in _R_ACC:
        if re.search(rx, limpio):
            break
    if tipo is None:
        return {"f": fam, "g": grupo, "t": None, "m": None, "o": None, "n": _bonita(desc)}
    if ppsu and not tipo.startswith("Anillo"):
        tipo = f"{tipo} PPSU"
    md, o = medida_accesorio(limpio, rosca)
    if tipo.startswith("Adaptador a tubo de cobre") and md:  # «CU-15/MC-(16X2)» → cobre 15 × tubo 16
        cu = re.search(r"CU-?\s*(\d+)", nd)
        tu = re.search(r"(?:MC|CO|PEX)\D*?(\d{2})", nd.split("CU")[0] if pestana == "ACCES PEX" else nd.split("/")[-1])
        if pestana == "ACCES PEX":
            p = re.search(r"PEX (\d+)-CU (\d+)", nd)
            if p:  # «ADAPTADOR TUBO PEX 15-CU 16»: cobre 15, tubo 16
                md, o = f"Cu {p.group(1)} → {p.group(2)}", float(p.group(2)) * 1000 + float(p.group(1))
        elif cu and tu:
            md, o = f"Cu {cu.group(1)} → {tu.group(1)}", float(tu.group(1)) * 1000 + float(cu.group(1))
    if tipo.startswith("Codo adaptador"):
        p = re.search(r"(\d{2}) -?CU ?(\d+)", nd)
        if p:
            md, o = f"Cu {p.group(2)} → {p.group(1)}", float(p.group(1))
    if fam == F_FR and tipo.startswith("Adaptador"):
        p = re.search(r"COBRE (\d+)- ?PEX (\d+)", nd)
        if p:
            md, o = f"Cu {p.group(1)} → {p.group(2)}", float(p.group(2)) * 1000 + float(p.group(1))
    if tipo.startswith("Codo de radiador"):
        p = re.search(r"(\d{2})\D+(\d{2})$", _sin_espesor(nd))
        if p:
            md, o = f"{p.group(1)} → Cu {p.group(2)}", float(p.group(1))
    sistema = SISTEMA[fam]
    nombre = f"{tipo} {sistema} {md}".replace("  ", " ").strip() if sistema and not tipo.startswith("Anillo") else f"{tipo} {md}".strip()
    return {"f": fam, "g": grupo, "t": tipo, "m": md, "o": o, "n": nombre}


def foto(cod: str, c: dict) -> Optional[str]:
    """Foto del catálogo de Isoltubex: la de la referencia o, si es nueva, la de su tipo de pieza."""
    f = FOTOS["refs"].get(cod.upper())
    if not f and c.get("t"):
        f = FOTOS["tipos"].get(f"{c['f']}|{c['g']}|{c['t']}")
    if not f and c.get("t") and c.get("g"):  # tipo nuevo: la del grupo (las piezas sueltas, solo la suya)
        f = FOTOS["tipos"].get(f"{c['f']}|{c['g']}|")
    return f"/catalogo/iso/{f}" if f else None


def foto_familia(fam: str) -> Optional[str]:
    f = FOTOS.get("familias", {}).get(fam)
    return f"/catalogo/iso/{f}" if f else None


def fechas(hojas: dict) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """De las notas de INICIO: mes de los netos de tubos y de accesorios («abr-26», «mar-26») y el texto."""
    meses = {"enero": "ene", "febrero": "feb", "marzo": "mar", "abril": "abr", "mayo": "may", "junio": "jun",
             "julio": "jul", "agosto": "ago", "septiembre": "sep", "octubre": "oct", "noviembre": "nov", "diciembre": "dic"}
    txt = " ".join(str(c) for f in (hojas.get("INICIO") or []) for c in f)
    tub = re.search(r"NETOS tubos (\w+) (\d{4})", txt, re.I)
    acc = re.search(r"NETOS accesorios (\w+) (\d{4})", txt, re.I)
    f = lambda m: f"{meses.get(m.group(1).lower(), m.group(1)[:3].lower())}-{m.group(2)[2:]}" if m else None
    origen = None
    if tub or acc:
        partes = []
        if tub:
            partes.append(f"tubos de {tub.group(1).lower()} {tub.group(2)}")
        if acc:
            partes.append(f"accesorios de {acc.group(1).lower()} {acc.group(2)}")
        origen = "Coste de las listas de precios netos de Isoltubex (" + " y ".join(partes) + "), por rollo o barra suelta."
    return f(tub), f(acc), origen


def margenes(hojas: dict) -> dict:
    """Margen por defecto de cada pestaña («30,0%» en la fila 3)."""
    out = {}
    for p in PESTANAS[1:-1]:
        for f in (hojas.get(p) or [])[:5]:
            for c in f:
                v = pct(c)
                if v is not None:
                    out[p] = v
    return out


def pct(c) -> Optional[float]:
    """«30,0%» → 30.0; 0.3 (valor sin formato) → 30.0."""
    if isinstance(c, (int, float)):
        return round(c * 100, 2) if 0 < c < 1 else None
    if "%" not in str(c or ""):
        return None
    return _num(c)


def leer(hojas: dict) -> list[dict]:
    """Todas las referencias de la hoja, ya ordenadas. Costes en €, margen en %, sin neto → coste None."""
    mes_tubos, mes_acc, _ = fechas(hojas)
    largo = lambda m: f"{ {'ene': 'enero', 'feb': 'febrero', 'mar': 'marzo', 'abr': 'abril', 'may': 'mayo', 'jun': 'junio', 'jul': 'julio', 'ago': 'agosto', 'sep': 'septiembre', 'oct': 'octubre', 'nov': 'noviembre', 'dic': 'diciembre'}.get(m[:3], m[:3])} 20{m[4:]}" if m else "fecha sin indicar"
    origen_tubos = f"Coste de la lista de precios netos de tubos de Isoltubex ({largo(mes_tubos)}), por rollo o barra suelta: comprando palé completo sale más barato."
    origen_acc = f"Coste de la lista de precios netos de accesorios de Isoltubex ({largo(mes_acc)})."
    def_margen = margenes(hojas)
    arts, vistos = [], set()
    for p in PESTANAS[1:]:
        filas = hojas.get(p) or []
        ini = next((i for i, f in enumerate(filas) if f and _n(f[0]) == "CODIGO"), None)
        if ini is None:
            continue
        for f in filas[ini + 1:]:
            f = list(f) + [""] * (10 - len(f))
            cod, desc, sub, ud = (str(x).strip() for x in f[:4])
            if not cod or not desc or cod.upper() in vistos:
                continue
            vistos.add(cod.upper())
            sin_neto = p == "SIN_NETO_AVISO"
            if p == "TUBOS":
                coste, pvp_fab, margen, pvp, pvp_iva = _num(f[4]), _num(f[5]), pct(f[6]), _num(f[7]), _num(f[8])
            elif sin_neto:
                coste, pvp_fab, margen, pvp, pvp_iva = None, _num(f[4]), None, None, None
            else:
                coste, pvp_fab, margen, pvp, pvp_iva = _num(f[4]), None, pct(f[5]), _num(f[6]), _num(f[7])
            if not coste:  # 0,00 € en la hoja: tampoco hay precio
                coste = pvp = pvp_iva = margen = None
                sin_neto = True
            c = clasifica(p, cod, desc, sub)
            ud_v = c.get("ud") or {"rollo": "rollo", "barra": "barra"}.get(ud.lower(), "ud")
            tubo = c["f"] in (F_MC, F_PEX)
            fecha = mes_tubos if tubo else mes_acc
            apunte = None
            if c.get("metros") and coste and c["metros"] > 1:
                m = c["metros"]
                apunte = (f"Sale a {coste / m:.2f} €/m de coste".replace(".", ",")
                          + (f" y {pvp / m:.2f} €/m de venta sin IVA".replace(".", ",") if pvp else "") + f" ({m} m).")
            arts.append({
                "ref": cod, "codigo": cod, "categoria": c["f"], "subcategoria": c["g"], "descripcion": desc,
                "tipo": c.get("t"), "medida_c": c.get("m") or None, "orden": c.get("o"), "nombre": c["n"],
                "foto": foto(cod, c), "unidad": ud_v, "ud_venta": ud_v, "ud_compra": ud_v,
                "precio": coste, "fecha": fecha if coste else None, "precio_ant": None, "fecha_ant": None, "evol": None,
                "coste": coste, "pvp": pvp, "pvp_iva": pvp_iva, "pvp_fab": pvp_fab,
                "margen": margen if margen is not None else (def_margen.get(p) if not sin_neto else None),
                "nota": "Sin precio neto" if sin_neto else None, "apunte": apunte, "minimo": None, "compras": None,
                "kg_m": None, "pestana": p, "origen": origen_tubos if tubo else origen_acc,
                "_k": (FAM_POS.get(c["f"], 99), (GRUPOS.get(c["f"]) or []).index(c["g"]) if c["g"] in (GRUPOS.get(c["f"]) or []) else 99,
                       c.get("rank", rango(c.get("t"))), c.get("t") or "", c.get("o") or 0, sin_neto),
            })
    arts.sort(key=lambda a: a.pop("_k"))
    return arts

