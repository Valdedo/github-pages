"""Tarifa de Inyectometal (racorería de latón; oct. 2026).

La hoja «TARIFA_INYECTOMETAL_2026» (Mi unidad de Andrés, compartida con casafonsomc) sale de la tarifa M26 que manda
Inyectometal en CSV (en vigor desde el 03/08/2026; une el catálogo y el «librito» de netos). Una sola pestaña: arriba
la tabla de márgenes por familia (la cambia Andrés) y debajo una fila por referencia con su grupo (código corto LR1,
CU2…; la familia y el grupo salen de una tabla al lado), código, EAN, descripción, precio de tarifa, descuento, coste,
margen, PVP con IVA (al alza a 0,05 €; 0,10 € desde 5 €), PVP sin IVA (= con IVA ÷ 1,21), última compra y lo pagado.
Coste, margen y PVP son fórmulas de la hoja; aquí solo se leen.

Los descuentos de Casa Fonso van en la hoja (columna «Dto. %» y el segundo descuento arriba), no aquí: el repo es público.
Lo del catálogo (tarifa 0, descuento grande) trae un PVP de tarifa; lo de netos, no.
Las columnas se buscan por su título y el tipo de pieza y la medida se sacan de la descripción («CODO LATON H-H 1/2» →
«Codo latón H-H» · «½″»), así una referencia nueva cae sola en su sitio.
"""
import re
import unicodedata
from typing import Optional

HOJA = "1i4IytTO95mEHzdcE8-ShNQ7oSPIL8ZXDnlEeZCNdAdo"
VIGOR = "2026-08-03"  # la tarifa M26 entra en vigor el 03/08/2026

# Orden de las familias y de sus grupos (el de la hoja)
FAMILIAS = ["Latón roscado", "Cobre a soldar", "Racores para polietileno", "Válvulas y llaves", "Flotadores y boyas",
            "Riego y manguera", "Conexiones flexibles", "Grifería y baño", "Juntas y pequeño material"]


def _clave(s) -> str:
    """«Precio tarifa M26» → «preciotarifam26»: las columnas se buscan por su nombre."""
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def _num(v) -> Optional[float]:
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v or "").strip().replace("€", "").replace("%", "").replace(" ", "")
    if not re.search(r"\d", s):
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _dia(s) -> Optional[str]:
    """«02/10/2025 · fra. …» → «2025-10-02»."""
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(s or ""))
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None


# ── Nombre y medida a partir de la descripción ────────────────────────────
FRAC = {"1/2": "½", "1/4": "¼", "3/4": "¾", "3/8": "⅜", "1/8": "⅛", "7/8": "⅞"}
# Variantes que van al final de la descripción y forman parte del tipo de pieza, no de la medida
VARIANTES = [
    (r"\bJ(?:UNTA)?\.?\s*PLANA\b", "junta plana"), (r"\bCROM(?:O|ADO)?\b|\bCRO\b|\bCR\b", "cromado"),
    (r"\bEVO\b", "EVO"), (r"\bECO\b", "ECO"), (r"\bRED\b", "paso reducido"), (r"\bREFORZADO\b", "reforzado"),
    (r"\bCIEGO\b", "ciego"), (r"\bBLOQUEABLE\b", "bloqueable"), (r"\bENCH\.? R[AÁ]PIDO\b", "enchufe rápido"),
    (r"\bGRANEL\b", "a granel"), (r"\bEN BOLSA\b", ""), (r"\bEN CAJA\b", ""), (r"\(?SIN MANDO\)?", "sin mando"),
    (r"(?<=\s)R$", "R"),
]
# Palabras que se escriben bien (el resto, en minúscula)
BIEN = {"LATON": "latón", "LATÓN": "latón", "UNION": "unión", "TAPON": "tapón", "COLLARIN": "collarín", "CONEXION": "conexión",
        "VALVULA": "válvula", "VÁLVULA": "válvula", "VÁVULA": "válvula", "RETENCION": "retención", "SIFON": "sifón",
        "GRIFERIA": "grifería", "BOMBAS": "bombas", "ELECTROLITICO": "electrolítico", "CANAMO": "cáñamo", "ROTULA": "rótula",
        "REGULACION": "regulación", "REGULACIÓN": "regulación", "FLORON": "florón", "EXCENTRICA": "excéntrica",
        "CONICA": "cónica", "SEMICONICA": "semicónica", "PUBLICA": "pública", "ARTICULADA": "articulada",
        "ANTICALCAREA": "anticalcárea", "PLASTICO": "plástico", "HIDROMASAJE": "hidromasaje", "DIAMETRO": "diámetro",
        "MACHON": "machón", "REDUCCION": "reducción", "VIAS": "vías", "GUIAS": "guías", "GUIA": "guía", "SUJECCION": "sujeción",
        "PAJARO": "pájaro", "BATERIA": "batería", "MILENIUM": "Milenium", "IRIS": "Iris", "VIENA": "Viena", "SABRINA": "Sabrina",
        "FORMENTERA": "Formentera", "NOVA": "Nova", "PUSH": "Push", "MEDICAL": "Medical", "CONICO": "cónico",
        "ECONOMICO": "económico", "DISEÑO": "diseño", "POLIVALENTE": "polivalente"}
SIGLAS = {"H-H", "M-H", "M-M", "H-H-H", "M-M-M", "PE", "ABS", "WC", "PN", "EVO", "ECO", "BCN", "R", "CU", "PTFE", "H", "M"}
ARREGLOS = [  # abreviaturas de Inyectometal → nombre claro
    (r"^REDUC\.?\s*H?EXAG\.?\s*C/VALONA|^RED\.\s*EXAG\.?\s*C/VALONA|^REDUCCION EXAG\.?", "REDUCCION HEXAGONAL CON VALONA"),
    (r"^REDUC\.?\s*LISA", "REDUCCION LISA"), (r"^CONTRA-ROSCA REDUCIDA", "MACHON REDUCIDO"), (r"^MANGUITO REDUC(?:IDO|\.)?\s*", "MANGUITO REDUCIDO "),
    (r"^TE LATON RED(?:\.|-)\s*(H-H-H)?", r"TE LATON REDUCIDA \1"), (r"ESF\.\s*MARIPOSA", "ESFERA MARIPOSA"),
    (r"C/CORREDE(?:RA|\.)", "CON CORREDERA"), (r"C/PRECINTO", "CON PRECINTO"), (r"C/ROTULA", "CON ROTULA"),
    (r"C/ TUERCA", "CON TUERCA"), (r"R/MANGUERA", "ROSCA MANGUERA"), (r"RACOR BARNA", "RACOR BARCELONA"),
    (r"RACOR BCN", "RACOR BARCELONA"), (r"MANG-MACH(?:O)?", "MANGUERA-MACHO"), (r"MANG-MANG", "MANGUERA-MANGUERA"),
    (r"MACHO-M\.", "MACHO-MACHO"), (r"CONTRA-ROSCA", "MACHON"), (r"INOX\.", "INOX"), (r"EXTENS\.", "EXTENSIBLE"),
    (r"V\. REDONDA", "VARILLA REDONDA"), (r"V\. PLANA", "VARILLA PLANA"), (r"PNA\.", "PLANA"),
    (r"\b(\d)\s*P\.", r"\1 PIEZAS"), (r"CLAPET(?:A|\.)\s*", "CLAPETA "), (r"EXT\.\s*C/RACOR", "EXTENSIBLE CON RACOR"),
    (r"PLAST\.\s*", "PLASTICO "), (r"EXTENSIBLE(?=[A-Z])", "EXTENSIBLE "), (r'1/4"?\s*VUELTA', "CUARTO DE VUELTA"),
    (r"\(SALIDA [^)]*\)", ""), (r"VENTIL\.\s*", "VENTILACION "), (r"MARSELLA\+TUERCA\+J(?:UNT|\.FIBRA)", "MARSELLA + TUERCA + JUNTA"),
    (r"MACHON\+TUERCA\+JUNTA", "MACHON + TUERCA + JUNTA"), (r"\bC/", "CON "),
]


def _bonito(s: str) -> str:
    out = []
    for i, w in enumerate(s.split()):
        if w in SIGLAS or re.fullmatch(r"[A-Z]-[A-Z](-[A-Z])?|PN\d+", w):
            out.append(w)
        else:
            w2 = BIEN.get(w, w.lower())
            out.append(w2[:1].upper() + w2[1:] if i == 0 else w2)
    return " ".join(out)


def _pulg(t: str) -> str:
    """«1 1/4» → «1¼″», «11/4» → «1¼″», «1/2» → «½″», «2''» → «2″»."""
    t = t.replace("''", "").replace('"', "").strip()
    m = re.fullmatch(r"(\d)[ _](\d/\d)", t) or (re.fullmatch(r"([1-4])(\d/\d)", t) if len(t) == 4 else None)
    if m:
        return f"{m.group(1)}{FRAC.get(m.group(2), '-' + m.group(2))}″"
    if t in FRAC:
        return f"{FRAC[t]}″"
    return f"{t}″" if re.fullmatch(r"\d", t) else t


def _medida(m: str, pulgadas_sueltas: bool) -> str:
    """Medida bonita: «1/2*3/4» → «½″ × ¾″», «20 x 1/2» → «20 × ½″», «H3/8-H3/8 100 CM» → «⅜″ × ⅜″ · 100 cm»."""
    s = re.sub(r"(?<!')'$|\*+$", "", m.strip())            # «3/4'» y «1/2*3/4*» (descripciones cortadas)
    s = re.sub(r"(\d+(?:[.,]\d+)?)\s*(CM|MM|M)\.?(?=\s|$|\))", lambda x: f"{x.group(1)}§{x.group(2).lower()}", s)
    s = re.sub(r"(\d) (\d/\d)", r"\1_\2", s)                # «1 1/4» es una sola medida
    s = re.sub(r"\b[MH](?=\d)", "", s)                     # M1/2-H3/4 → 1/2-3/4 (la M/H va en el tipo)
    s = re.sub(r"(?<=\d|'|\")\s*[*xX]\s*(?=\d)", " × ", s)  # 1/2*3/4, 20 x 1/2
    s = re.sub(r"(?<=[\d/'\"])\s*-\s*(?=\d)", " × ", s)     # 3/8-3/8
    partes = []
    for p in re.split(r"( × |\s+)", s):
        if not p or p.isspace() or p == " × ":
            partes.append(p)
            continue
        q = p.replace("''", "").replace('"', "")
        if "§" in p:
            partes.append(p)
        elif re.fullmatch(r"\d_\d/\d|\d/\d|\d{2}/\d", q) or re.fullmatch(r"\d+(''|\")", p) or (pulgadas_sueltas and re.fullmatch(r"[1-4]", q)):
            partes.append(_pulg(p))
        else:
            partes.append(p.lower() if re.fullmatch(r"[A-ZÁÉÍÓÚ]+\.?", p) else p)
    s = "".join(partes).replace("§", " ")
    # «1 ½″» (entero y fracción separados) → «1½″»
    s = re.sub(r"\b([1-4]) ([½¼¾⅜⅛⅞]″)", r"\1\2", s)
    s = re.sub(r"\s+", " ", s).strip()
    # La longitud de los latiguillos, detrás de un punto: «⅜″ × ⅜″ · 100 cm»
    s = re.sub(r"(″) (\d+ (?:cm|mm|m))$", r"\1 · \2", s)
    return s


_TIPO_CON_NUMERO = re.compile(r"^(\d+\s*P\.|\d+\s+(?:BOCAS|VIAS|POS\.|EFECTOS|SALIDAS|PIEZAS))")


def nombre(desc: str, familia: str, grupo: str = "") -> dict:
    """Tipo de pieza (t), medida bonita (m), orden de la medida (o) y nombre claro (n)."""
    d = re.sub(r"\s+", " ", str(desc or "").upper()).strip()
    d = re.sub(r"(\d)(CROMO|CRO|CR)\b", r"\1 \2", d)         # «3/8*1/8CROMO»
    d = re.sub(r"(?<=\d-)([MH]) (\d)", r"\1\2", d)            # «M3/8-H 3/8»
    d = re.sub(r"(?<=[A-Z])\.(?=\d)", ". ", d)                 # «PLAST.32»
    d = re.sub(r"(?<=[A-Z]{3})(?=\d/\d)", " ", d)              # «METAL1/2*12CM.»
    serie = ""
    m = re.match(r"^(\d+)\s*(A?G\s*CU|GCU|CU)\s+", d)          # cobre: «270 G CU ENLACE HEMBRA …»
    if m:
        serie, d = m.group(1), d[m.end():]
    variantes = []
    cambio = True
    while cambio:
        cambio = False
        for rx, txt in VARIANTES:
            mm = re.search(rf"\s*(?:{rx})\s*$", d)
            if mm:
                d = d[:mm.start()].strip()
                if txt and txt not in variantes:
                    variantes.insert(0, txt)
                cambio = True
    for rx, txt in ARREGLOS:
        d = re.sub(rx, txt, d)
    toks = d.split(" ")
    ini = None
    i = 0
    while i < len(toks):
        resto = " ".join(toks[i:])
        if _TIPO_CON_NUMERO.match(resto):  # «3 BOCAS», «2P.»: es parte del nombre
            i += 2 if re.match(r"^\d+\s+\S", resto) and not re.match(r"^\d+P\.", resto) else 1
            continue
        if re.match(r"^[MH]?\d|^Ø", toks[i]):
            ini = i
            break
        i += 1
    base = " ".join(toks[:ini] if ini is not None else toks).strip(" -")
    med_txt = " ".join(toks[ini:]) if ini is not None else ""
    # «RACOR MARSELLA M1/2-H3/4»: macho-hembra va en el tipo
    if re.search(r"\bM\d[^ ]*[-*]H\d", med_txt):
        base += " M-H"
    elif re.search(r"\bH\d[^ ]*[-*]H\d", med_txt):
        base += " H-H"
    # lo que va detrás de la medida y no es medida («ROSCA 6/100», «SIN MANDO», «LARGA», «LATON») va al tipo
    tras = re.search(r"\s((?:SIN MANDO|LARGA|LATON|LATÓN|HUSILLO ABS|EN CAJA|SALIDAS|VUELTA|PN\d+|EFECTOS)\b.*)$", med_txt)
    if tras and not re.search(r"ROSCA", tras.group(1)):
        med_txt = med_txt[:tras.start()]
        variantes.append(_bonito(tras.group(1)).lower())
    tipo = _bonito(base)
    if serie:
        tipo = f"{tipo} (serie {serie})"
    if variantes:
        tipo = f"{tipo} {' '.join(v for v in variantes if v)}"
    sueltas = familia in ("Latón roscado", "Válvulas y llaves", "Riego y manguera", "Flotadores y boyas") \
        or grupo in ("Juntas", "Arandelas", "Tuercas y conos", "Racores uralita")
    medida = _medida(med_txt, sueltas) if med_txt else ""
    o = _orden(medida)
    return {"t": tipo if medida else None, "m": medida or None, "o": o, "n": f"{tipo} {medida}".strip()}


def _orden(m: str) -> float:
    """Orden de una medida: las pulgadas y los milímetros por su valor, en ese orden de aparición."""
    v = 0.0
    for t in re.findall(r"(\d+(?:[.,]\d+)?)([½¼¾⅜⅛⅞])?(″)?", m or "")[:3]:
        n = float(t[0].replace(",", ".")) if t[0] else 0
        n += {"½": .5, "¼": .25, "¾": .75, "⅜": .375, "⅛": .125, "⅞": .875}.get(t[1], 0)
        v = v * 1000 + n
    if not v:
        fr = re.match(r"([½¼¾⅜⅛⅞])", m or "")
        if fr:
            v = {"½": .5, "¼": .25, "¾": .75, "⅜": .375, "⅛": .125, "⅞": .875}[fr.group(1)]
    return v


PULGADA = {"½": .5, "¼": .25, "¾": .75, "⅜": .375, "⅛": .125, "⅞": .875}


def _principal(m: Optional[str], familia: str) -> dict:
    """Medida por la que se filtra la familia («todo lo de ½″»). En el latón, las válvulas, el riego… manda la rosca
    (la primera medida: «½″ × 30» es un alargo de ½″, no de 30); en los racores para polietileno y el cobre, el tubo
    (lo decide tarifas_service.medida_principal, que es lo de siempre)."""
    if not m or familia in ("Racores para polietileno", "Cobre a soldar", "Conexiones flexibles"):
        return {}
    pm = re.match(r"(\d?)([½¼¾⅜⅛⅞]?)″", m)
    if not pm or not (pm.group(1) or pm.group(2)):
        return {}
    return {"mp": pm.group(0), "op": 1000 + float(pm.group(1) or 0) + PULGADA.get(pm.group(2), 0)}


# ── Lector ─────────────────────────────────────────────────────────────────
def leer(hojas: dict) -> dict:
    filas = next((f for f in hojas.values() if any(f and _clave(x[0] if x else "") == "grupocod" for x in f)), None)
    if filas is None:
        filas = next(iter(hojas.values()), [])
    ini = next((i for i, f in enumerate(filas) if f and _clave(f[0]) == "grupocod"), None)
    if ini is None:
        return {"articulos": [], "log": [], "margen": None, "lineas": {}}
    col = {}
    for j, t in enumerate(filas[ini]):
        k = _clave(t)
        if k and k not in col:  # la segunda «Grupo (cód.)» es la tabla de grupos de al lado
            col[k] = j

    def v(f: list, nombre_col: str) -> str:
        j = col.get(nombre_col)
        return str(f[j]).strip() if j is not None and j < len(f) else ""

    # El segundo descuento (el mismo para todo) va arriba en la hoja: «Dto. 2 % (todas)»
    d2 = next((_num(f[1]) for f in filas[:ini] if f and len(f) > 1 and _clave(f[0]).startswith("dto2")), None) or 0.0
    arts, lineas = [], {}
    grupos: dict[str, list] = {}
    for f in filas[ini + 1:]:
        cod, fam, grupo, desc = v(f, "codigo").lstrip("'"), v(f, "familia"), v(f, "grupo"), v(f, "descripcion")
        if not cod or not fam or not desc:
            continue
        precio_tar, dto = _num(v(f, "preciotarifam26")), _num(v(f, "dto"))
        coste, margen = _num(v(f, "costeneto")), _num(v(f, "margen"))
        pvp_iva, pvp = _num(v(f, "pvpconiva")), _num(v(f, "pvpsiniva"))
        compra, pagado, aviso = v(f, "ultimacompra"), _num(v(f, "pagadoentoncesud")), v(f, "aviso")
        fecha_compra = _dia(compra)
        c = nombre(desc, fam, grupo)
        if grupo not in grupos.setdefault(fam, []):
            grupos[fam].append(grupo)
        evol = round((coste / pagado - 1) * 100, 1) if coste and pagado else None
        ud = "kg" if re.match(r"^KG\b", desc.upper()) else "ud"
        es = lambda x: f"{x:.4f}".rstrip("0").rstrip(".").replace(".", ",") if x is not None else ""
        apunte = (f"Tarifa M26: {es(precio_tar)} € − {dto:g} % − {d2:g} % = {es(coste)} € de coste."
                  if precio_tar and dto is not None and coste else None)
        arts.append({
            "ref": cod, "codigo": cod, "ean": v(f, "ean").lstrip("'") or None, "categoria": fam, "subcategoria": grupo,
            "descripcion": desc, "nombre": c["n"], "tipo": c["t"], "medida_c": c["m"], "orden": c["o"],
            "foto": None, "unidad": ud, "ud_venta": ud, "ud_compra": ud, **_principal(c["m"], fam),
            "precio": coste, "fecha": VIGOR if coste else None,
            "precio_ant": pagado, "fecha_ant": fecha_compra if pagado else None, "evol": evol,
            "coste": coste, "pvp": pvp, "pvp_iva": pvp_iva, "margen": margen,
            # El precio de tarifa solo es un PVP en lo del catálogo (descuento grande); lo de netos ya es casi el coste
            "pvp_fab": precio_tar if dto and dto >= 30 else None,
            "nota": "Revisar precio" if aviso else None, "apunte": apunte, "minimo": None,
            "compras": None, "kg_m": None, "metros": None,
            "origen": f"Coste de la tarifa M26 de Inyectometal (en vigor desde el 03/08/2026) con tus descuentos: "
                      f"{dto:g} % + {d2:g} % ({'catálogo' if dto >= 30 else 'netos'}). Sin portes ni IVA." if dto is not None
                      else "Coste de la tarifa M26 de Inyectometal con tus descuentos. Sin portes ni IVA.",
            # La evolución: lo pagado en la última compra y el precio de la tarifa nueva
            "hist_extra": [{"fecha": VIGOR, "precio": coste}] if coste and pagado else None,
        })
        if fecha_compra:
            num = re.search(r"(?:fra|alb)\.\s*(\S+)", compra)
            tipo = "Albarán" if "alb." in compra else None
            lineas[cod] = [{"fecha": fecha_compra, "factura": num.group(1) if num else "", "precio": pagado,
                            "cantidad": None, "bruto": None, "dto1": None, "dto2": None,
                            **({"tipo": tipo} if tipo else {})}] if pagado else []
    orden_fam = [x for x in FAMILIAS if x in grupos] + [x for x in grupos if x not in FAMILIAS]
    return {"articulos": arts, "log": [], "margen": None, "lineas": lineas,
            "orden_familias": orden_fam, "orden_grupos": grupos,
            "origen": "Coste de la tarifa M26 de Inyectometal con tus descuentos."}
