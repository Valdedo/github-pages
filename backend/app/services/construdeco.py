"""Tarifas de Construdeco para el catálogo (oct. 2026): Pladur (placas, perfilería, accesorios y pastas) y Dinak
(chimeneas de acero inoxidable).

Las dos hojas las mantienen las tareas programadas de los miércoles (Pladur) y los jueves (Dinak) con los pedidos de
Construdeco. Aquí solo se leen: las columnas se buscan por su título (las tareas pueden añadir columnas de meses en
Dinak) y cada artículo se ordena con reglas por su descripción, así que lo que se añada a la hoja cae solo en su
familia, grupo y tipo de pieza.

- «tarifa_pladur_construdeco»: una fila por artículo (código, descripción, unidad, compra, venta, margen, fecha del
  último albarán y una nota «Anterior: X € (mes año) → ±Y %»), con filas «▌ PLACAS», «▌ PERFILERÍA»… por sección.
  Las notas que no cuadran con el precio (había varias copiadas de otra fila) no se usan.
- «TARIFA_DINAK_2024_2026»: una fila por pieza (ref. Construdeco, descripción, diámetro, código Dinak, una columna
  por mes con el precio de compra, último precio, tarifa oficial de Dinak y precio de venta = compra / 0,75), con
  filas de sección por sistema y diámetro. El histórico de compra sale de las columnas de meses.
"""
import re
import unicodedata
from typing import Optional

MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
_MES_EN = {"jan": "ene", "apr": "abr", "aug": "ago", "dec": "dic"}


def _n(s) -> str:
    """Sin tildes, en minúsculas y con los espacios juntos («×» → «x», «→» → «->»)."""
    s = str(s or "").replace("×", "x").replace("→", "->").replace("−", "-")
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


def _num(v) -> Optional[float]:
    """«9,4100 €», «1.234,56 €», «15%», «—» → número o None."""
    s = str(v or "").strip()
    if not s or s in ("—", "-", "–") or not re.search(r"\d", s):
        return None
    s = re.sub(r"[^\d,.\-]", "", s.replace("−", "-"))
    if "," in s and "." in s and s.rfind(".") > s.rfind(","):
        s = s.replace(",", "")
    elif "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(".") > 1 or re.search(r"\.\d{3}$", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def _dia(v) -> Optional[str]:
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(v or "").strip())
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None


def _mes(v) -> Optional[str]:
    """«May-24», «sep-26», «Aug-26» → «may-24»."""
    m = re.fullmatch(r"([a-z]{3})[a-z]*\.?[-/ ](\d{2}|\d{4})", _n(v))
    if not m:
        return None
    mm = _MES_EN.get(m.group(1), m.group(1))
    return f"{mm}-{m.group(2)[-2:]}" if mm in MESES else None


def _orden_mes(m: str) -> tuple:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", m):
        return (int(m[:4]), int(m[5:7]), int(m[8:]))
    return (2000 + int(m[4:]), MESES.index(m[:3]) + 1, 0)


def _iva(pvp: Optional[float]) -> Optional[float]:
    return round(pvp * 1.21 + 1e-9, 2) if pvp is not None else None


def _evol(nuevo: Optional[float], antes: Optional[float]) -> Optional[float]:
    if nuevo is None or not antes:
        return None
    e = round((nuevo - antes) / antes * 100, 1)
    return e or None


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _n(s)).strip("-")


def _columnas(filas: list, primera: str) -> tuple[Optional[int], dict]:
    """Fila de títulos (la que empieza por «primera») y la posición de cada título."""
    for i, f in enumerate(filas):
        if f and _n(f[0]).startswith(primera):
            return i, {_n(t).replace("\n", " "): j for j, t in enumerate(f) if str(t).strip()}
    return None, {}


def _col(cols: dict, *empieza: str) -> Optional[int]:
    for e in empieza:
        for t, j in cols.items():
            if t.startswith(e):
                return j
    return None


def _hoja_con(hojas: dict, primera: str) -> list:
    """La pestaña que tiene la fila de títulos (por si se le cambia el nombre)."""
    for filas in hojas.values():
        if _columnas(filas, primera)[0] is not None:
            return filas
    return []


def _metros(mm: float) -> str:
    """1000 → «1 m», 460 → «0,46 m», 3600 → «3,6 m»."""
    return f"{mm / 1000:g}".replace(".", ",") + " m"


# ── Fotos ─────────────────────────────────────────────────────────────────
# Pladur: fotos de la tienda oficial (tools/pladur-fotos.py → frontend/public/catalogo/pladur/<clave>.webp).
FOTOS_PLADUR = {"placa-n", "placa-h1", "placa-f", "canal", "montante", "perfil-techo", "perfil-secundario", "perfil-t45",
                "horquilla", "angular", "angular-tr", "cuelgue", "cinta", "tornillo", "tornillo-mm", "pasta-uso",
                "pasta-st1", "pasta-st2", "lana"}
# Placo y Dinak: fotos de referencia de Obramat (se enlazan, no se copian, como las de Hierros y Zabaleta).
# Lo que no tiene una foto que se le parezca va sin foto (se enseña la pegatina de la familia).
FOTOS_ADEO = {
    "placo-ppm": 4414326, "placo-ppf": 4418301, "placo-mecafino": 4402255, "placo-proyal": 4406911,
    "dp-tubo": 5357911, "dp-codo45": 4403402, "dp-codo90": 5357895, "dp-sombrerete": 5766167, "dp-antiviento": 4407786,
    "dp-abrazadera": 5766137, "dp-anclaje": 5355517, "dp-adaptador": 4395709,
    "sw-tubo": 5355509, "sw-codo45": 5355478, "sw-antiviento": 4407786, "sw-abrazadera": 5766137, "sw-te": 5766211,
    "pel-tubo": 4413872, "pel-te": 4739597, "pel-sombrerete": 4405383, "pel-abrazadera": 4739590,
}


def url_foto(clave: Optional[str]) -> Optional[str]:
    if clave in FOTOS_PLADUR:
        return f"/catalogo/pladur/{clave}.webp"
    if clave in FOTOS_ADEO:
        return f"https://media.adeo.com/media/{FOTOS_ADEO[clave]}/media.jpg?width=640"
    return None


# ── Pladur ────────────────────────────────────────────────────────────────
PLADUR_FAMILIAS = ["Placas", "Perfilería", "Accesorios", "Pastas y yesos"]
PLADUR_GRUPOS = {
    "Placas": ["Estándar", "Hidrófuga (WA)", "Cortafuego (FOC)", "Otras placas"],
    "Perfilería": ["Tabiques y trasdosados", "Techos", "Otros perfiles"],
    "Accesorios": ["Tornillos", "Cinta y aislamiento", "Otros accesorios"],
    "Pastas y yesos": ["Pasta de juntas", "Yesos", "Otras pastas"],
}
_SECCION_PLADUR = {"placas": "Placas", "perfileria": "Perfilería", "accesorios": "Accesorios", "pastas": "Pastas y yesos"}
UD_PLADUR = {"UD": "ud", "UN": "ud", "M2": "m²", "CT": "caja", "CJ": "caja", "KG": "kg", "ML": "m", "MT": "m"}
_NOTA = re.compile(r"anterior:\s*([\d.,]+)\s*(?:€|eur)?\s*\(\s*([a-z]{3})[a-z]*\.?\s+(\d{4})\s*\)\s*->\s*([+\-]?\s*\d+(?:[.,]\d+)?)\s*%")


def _limpia_pladur(desc: str) -> str:
    """«PD-PLADUR N 13X1200X2500 BA» → «PLADUR N 13X1200X2500 BA» (sin el prefijo de Construdeco)."""
    return re.sub(r"^(PD|IY)-\s*", "", desc.strip())


def _bonito(s: str) -> str:
    s = s.strip()
    return s[:1].upper() + s[1:].lower() if s.isupper() else s


def clasifica_pladur(desc: str, seccion: str) -> dict:
    """Familia, grupo, tipo de pieza, medida y nombre claro de un artículo de la tarifa de Pladur."""
    d = _n(desc)
    fam = seccion if seccion in PLADUR_FAMILIAS else "Accesorios"
    out = {"f": fam, "g": PLADUR_GRUPOS[fam][-1], "t": None, "m": None, "mp": None, "op": None, "o": None,
           "n": _bonito(_limpia_pladur(desc)), "foto": None}
    marca = "Placo" if desc.strip().upper().startswith("IY-") or "placo" in d else "Pladur"
    dims = [float(x.replace(",", ".")) for x in re.findall(r"(\d+(?:,\d+)?)\s*x", d + "x")]
    if fam == "Placas":
        nums = sorted(int(x) for x in re.findall(r"\d+", re.sub(r"\(.*?\)", "", d)) if int(x) >= 9)
        if len(nums) >= 3:
            e, ancho, largo = nums[0], nums[-2], nums[-1]
            if "ppm" in d or "h1" in d or "(wa)" in d:
                g, letra, foto = "Hidrófuga (WA)", "PPM" if "ppm" in d else "H1", "placa-h1"
            elif "ppf" in d or "(foc)" in d or re.search(r"\bf\b", d):
                g, letra, foto = "Cortafuego (FOC)", "PPF" if "ppf" in d else "F", "placa-f"
            elif re.search(r"\bn\b", d) or "ppn" in d or "ba" in d.split():
                g, letra, foto = "Estándar", "N", "placa-n"
            else:
                g, letra, foto = "Otras placas", "", "placa-n"
            if marca == "Placo":  # la foto de la Pladur llevaría otra marca impresa
                foto = {"PPM": "placo-ppm", "PPF": "placo-ppf"}.get(letra)
            tipo = f"{marca} {letra} {e} mm".replace("  ", " ")
            out.update(g=g, t=tipo, m=f"{ancho}×{largo}", mp=f"{e} mm", op=e, foto=foto, o=largo,
                       n=f"Placa {tipo} · {ancho}×{largo}")
        return out
    if fam == "Perfilería":
        m = re.search(r"\b(canal|montante)\b(?:\s+m)?\s+(\d+)/(\d+)", d)
        if m:
            pieza, a, b = m.group(1), m.group(2), m.group(3)
            largo = re.search(r"l\s*=\s*(\d{4})", d)
            lg = f" · {_metros(float(largo.group(1)))}" if largo else ""
            out.update(g="Tabiques y trasdosados", t=f"{pieza.capitalize()}{lg}", m=f"{a}/{b}", mp=a, op=int(a), o=int(a),
                       foto=pieza, n=f"{pieza.capitalize()} {a}/{b}{lg}")
            return out
        out["g"] = "Techos" if re.search(r"t-?45|techo|primario|secundario|angular|cuelgue|horquilla", d) else "Otros perfiles"
        largo = max([x for x in dims if x >= 500] or [0])
        lg = f" · {_metros(largo)}" if largo else ""
        if "secundario" in d:
            out.update(t="Perfil secundario gancho 24×38", m=_metros(largo) if largo else None, foto="perfil-secundario", o=largo,
                       n=f"Perfil secundario gancho 24×38{lg}")
        elif "primario" in d:
            out.update(n=f"Perfil primario universal 24×38{lg}", foto="perfil-techo")
        elif "t-45" in d and "perfil" in d:
            out.update(n=f"Perfil T-45{lg}", foto="perfil-t45")
        elif "horquilla" in d:
            out.update(n="Horquilla T-45", foto="horquilla")
        elif "angular" in d:
            lado = "24×24 blanco" if "bl" in d.split() else ("L A24-TC" if "a24" in d else "")
            out.update(n=f"Angular {lado}{lg}".replace("  ", " "), foto="angular-tr" if "bl" in d.split() else "angular")
        elif "cuelgue" in d:
            caja = re.search(r"caja\s*(\d+)", d)
            out.update(n=f"Pieza de cuelgue TR{f' · caja de {caja.group(1)}' if caja else ''}", foto="cuelgue")
        return out
    if fam == "Accesorios":
        m = re.search(r"torn\w*\s+(pm|mm)\s+(\d+(?:,\d+)?)\s*x\s*(\d+(?:,\d+)?)", d)
        if m:
            pm = m.group(1) == "pm"
            tipo = f"Tornillo {'PM' if pm else 'MM'} {m.group(2)} ({'placa a metal' if pm else 'metal a metal'})"
            uds = re.search(r"(\d+)\s*ud", d)
            n_uds = uds.group(1) if uds else ""
            envase = "blíster" if "blister" in d else "caja"
            largo = m.group(3)
            out.update(g="Tornillos", t=tipo, m=f"{largo} mm · {envase} {n_uds}".strip(), foto="tornillo" if pm else "tornillo-mm",
                       o=_num(largo) * 10000 + (_num(n_uds) or 0),
                       n=f"Tornillo {'PM' if pm else 'MM'} {m.group(2)}×{largo}{f' · {envase} de {n_uds} ud' if n_uds else ''}")
            return out
        if "isover" in d or "lana" in d or "drywall" in d:
            nums = re.findall(r"\d+", d)
            e, med = (nums[0], f"{nums[1]}×{nums[2]}") if len(nums) >= 3 else (None, None)
            tipo = f"Lana mineral Isover Drywall {e} mm" if e else "Lana mineral Isover Drywall"
            out.update(g="Cinta y aislamiento", t=tipo, m=med, foto="lana", o=_num(nums[2]) if len(nums) >= 3 else None,
                       n=f"{tipo}{f' · {med}' if med else ''}")
            return out
        if "cinta" in d:
            largo = re.search(r"(\d+)\s*m\b", d)
            out.update(g="Cinta y aislamiento", foto="cinta",
                       n=f"Cinta de refuerzo autoadhesiva{f' · rollo de {largo.group(1)} m' if largo else ''}"
                       if "autoadh" in d else _bonito(_limpia_pladur(desc)))
        return out
    # Pastas y yesos
    kg = re.search(r"(\d+(?:,\d+)?)\s*k(?:g|\b)", d)
    sk = f"{kg.group(1)} kg" if kg else None
    if "pasta" in d or "st1" in d or "st2" in d or "fraguado" in d:
        out["g"] = "Pasta de juntas"
        if "al uso" in d:
            out.update(t="Pasta de juntas lista al uso", m=sk, foto="pasta-uso", o=_num(kg.group(1)) if kg else None,
                       n=f"Pasta de juntas lista al uso{f' · cubo de {sk}' if sk else ''}")
        elif "fraguado" in d:
            h = re.search(r"(\d)\s*h", d)
            st = re.search(r"\b(st\d)\b", d)
            out.update(foto="pasta-st2" if "st2" in d or "2h" in d.replace(" ", "") else "pasta-st1", n=f"Pasta de juntas de fraguado{f' {h.group(1)} h' if h else ''}"
                       f"{f' ({st.group(1).upper()})' if st else ''}{f' · saco de {sk}' if sk else ''}")
    elif "proyal" in d or "mecafino" in d or "yeso" in d or "enlucido" in d:
        nombre = "Yeso proyectable Proyal XXI VA" if "proyal" in d else "Enlucido fino Mecafino Plus" if "mecafino" in d else _bonito(_limpia_pladur(desc))
        out.update(g="Yesos", foto="placo-proyal" if "proyal" in d else "placo-mecafino" if "mecafino" in d else None,
                   n=f"{nombre}{f' · saco de {sk}' if sk else ''}")
    return out


def leer_pladur(hojas: dict) -> dict:
    filas = _hoja_con(hojas, "categor")
    ini, cols = _columnas(filas, "categor")
    vacio = {"articulos": [], "log": [], "margen": None, "lineas": {}}
    if ini is None:
        return vacio
    c_cod, c_desc, c_ud = _col(cols, "codigo"), _col(cols, "descripcion"), _col(cols, "unidad")
    c_compra, c_venta = _col(cols, "p. compra", "compra"), _col(cols, "p. venta", "venta")
    c_marg, c_fecha, c_nota = _col(cols, "margen"), _col(cols, "ultimo albaran", "ultimo", "fecha"), _col(cols, "notas")
    if c_desc is None or c_compra is None:
        return vacio
    ancho = max(cols.values()) + 1
    seccion, arts, vistos, mal = "Accesorios", [], set(), 0
    for f in filas[ini + 1:]:
        f = [str(x).strip() for x in f] + [""] * (ancho - len(f))
        primero = f[0]
        if primero.startswith("▌") or (primero and not f[c_desc] and _n(primero.lstrip("▌ ")) in _SECCION_PLADUR):
            seccion = _SECCION_PLADUR.get(_n(primero.lstrip("▌ ")), _bonito(primero.lstrip("▌ ")))
            continue
        desc = f[c_desc]
        coste = _num(f[c_compra])
        if not desc or coste is None or _n(primero).startswith(("leyenda", "para actualizar")):
            continue
        cod = f[c_cod] if c_cod is not None and re.search(r"[A-Za-z0-9]{3,}", f[c_cod]) else ""  # «—»: sin código
        ref = cod or "PD~" + _slug(desc)
        if ref in vistos:  # el mismo código dos veces: la segunda con su descripción
            ref = f"{ref}~{_slug(desc)}"
        vistos.add(ref)
        c = clasifica_pladur(desc, seccion)
        ud_h = (f[c_ud] if c_ud is not None else "UD").upper()
        ud = UD_PLADUR.get(ud_h, ud_h.lower() or "ud")
        pvp = _num(f[c_venta]) if c_venta is not None else None
        fecha = _dia(f[c_fecha]) if c_fecha is not None else None
        # «Anterior: 8,635€ (nov 2025) → +9%»: solo si el % cuadra con el precio (había notas copiadas de otra fila)
        ant = fecha_ant = None
        m = _NOTA.search(_n(f[c_nota])) if c_nota is not None else None
        if m:
            p_ant, dicho = _num(m.group(1)), _num(m.group(4).replace(" ", ""))
            real = _evol(coste, p_ant)
            if p_ant and dicho is not None and real is not None and abs(real - dicho) <= 1.5 and m.group(2) in MESES:
                ant, fecha_ant = p_ant, f"{m.group(2)}-{m.group(3)[-2:]}"
            else:
                mal += 1
        hist = ([{"fecha": fecha_ant, "precio": ant}] if ant else []) + ([{"fecha": fecha, "precio": coste}] if fecha else [])
        arts.append({
            "ref": ref, "codigo": cod or None, "categoria": c["f"], "subcategoria": c["g"], "descripcion": desc,
            "nombre": c["n"], "tipo": c["t"], "medida_c": c["m"], "orden": c["o"], "mp": c["mp"], "op": c["op"],
            "foto": url_foto(c["foto"]),
            "unidad": ud, "ud_venta": ud, "ud_compra": ud,
            "precio": coste, "fecha": fecha, "precio_ant": ant, "fecha_ant": fecha_ant, "evol": _evol(coste, ant),
            "coste": coste, "pvp": pvp, "pvp_iva": _iva(pvp), "margen": _num(f[c_marg]) if c_marg is not None else None,
            "nota": None, "apunte": None, "minimo": None, "compras": None, "kg_m": None, "metros": None,
            "hist": hist,
            "origen": f"Coste del último albarán de Construdeco{f' ({fecha[8:]}/{fecha[5:7]}/{fecha[:4]})' if fecha else ''}, sin IVA.",
        })
    return {"articulos": arts, "log": [], "margen": None, "lineas": {}, "notas_mal": mal,
            "orden_familias": PLADUR_FAMILIAS, "orden_grupos": PLADUR_GRUPOS}


# ── Dinak ─────────────────────────────────────────────────────────────────
DINAK_FAMILIAS = ["Chimenea doble pared", "Chimenea simple pared", "Pellets Deko", "Reducciones y accesorios"]
DINAK_GRUPOS = ["Tubos", "Codos y tes", "Sombreretes y adaptadores", "Abrazaderas y otros"]
_SISTEMA = {"Chimenea doble pared": "doble pared", "Chimenea simple pared": "simple pared", "Pellets Deko": "pellets negro"}


def _familia_dinak(seccion: str) -> str:
    s = _n(seccion)
    if "doble pared" in s or "(dp)" in s:
        return "Chimenea doble pared"
    if "simple pared" in s or "(sw)" in s:
        return "Chimenea simple pared"
    if "pellet" in s:
        return "Pellets Deko"
    return "Reducciones y accesorios"


def clasifica_dinak(desc: str, familia: str, diam: Optional[int]) -> dict:
    """Grupo, tipo de pieza (su diámetro va en botones), nombre claro y foto de una pieza de Dinak."""
    d = _n(desc)
    ang = re.search(r"(\d{2,3})\s*[°º]", desc)
    a = f" {ang.group(1)}°" if ang else ""
    largo = re.search(r"\d{2,3}\s*[×x]\s*(\d{3,4})", desc)
    if "compuerta" in d:
        g, t, foto = "Tubos", "Módulo con compuerta de regulación", "compuerta"
    elif re.search(r"\b(tubo|modulo)\b", d) and ("recto" in d or "tubo" in d):
        if largo:
            t = f"Tubo recto {_metros(float(largo.group(1)))}"
        else:
            t = "Tubo recto medio" if "medio" in d else "Tubo recto corto" if "corto" in d else "Tubo recto"
        g, foto = "Tubos", "tubo"
    elif "codo" in d:
        g, t, foto = "Codos y tes", f"Codo{a}", "codo90" if ang and int(ang.group(1)) >= 80 else "codo45"
    elif re.match(r"te\b", d) or " te " in f" {d} ":
        g, t, foto = "Codos y tes", f"Te{a}" + (" con entronque hembra" if "entronque" in d else ""), "te"
    elif "sombrerete" in d and "adaptador" not in d:
        cual = next((x for x in ("antiviento", "antilluvia", "eolico") if x in d), None)
        t = {"antiviento": "Sombrerete antiviento", "antilluvia": "Sombrerete antilluvia", "eolico": "Sombrerete eólico"}.get(cual, "Sombrerete")
        g, foto = "Sombreretes y adaptadores", {"antiviento": "antiviento", "eolico": "eolico"}.get(cual, "sombrerete")
    elif "adaptador" in d:
        t = "Adaptador a sombrerete eólico" if "sombrerete" in d else "Adaptador de simple a doble pared" if re.search(r"sp\s*(→|->|a)\s*dp", d) else "Adaptador"
        g, foto = "Sombreretes y adaptadores", "adaptador" if t.startswith("Adaptador de simple") else "adaptador-otro"
    elif "abrazadera" in d:
        g, t, foto = "Abrazaderas y otros", "Abrazadera de unión", "abrazadera"
    elif "anclaje" in d:
        g, t, foto = "Abrazaderas y otros", "Anclaje separador regulable" + (" corto" if "corto" in d else ""), "anclaje"
    elif "colector" in d or "hollin" in d:
        g, t, foto = "Abrazaderas y otros", "Colector de hollín" + (" corto" if "corto" in d else ""), "colector"
    else:
        g, t, foto = "Abrazaderas y otros", _bonito(desc), None
    sistema = "" if "pared" in t else _SISTEMA.get(familia, "")
    med = f"Ø{diam}" if diam else None
    nombre = " ".join(x for x in (t, med, sistema) if x)
    return {"g": g, "t": t, "m": med, "mp": med, "op": diam, "n": nombre,
            "foto": f"{'pel' if familia == 'Pellets Deko' else 'sw' if familia == 'Chimenea simple pared' else 'dp'}-{foto}" if foto else None}


def leer_dinak(hojas: dict) -> dict:
    filas = _hoja_con(hojas, "referencia")
    ini, cols = _columnas(filas, "referencia")
    vacio = {"articulos": [], "log": [], "margen": None, "lineas": {}}
    if ini is None:
        return vacio
    titulos = filas[ini]
    c_desc, c_diam, c_cod = _col(cols, "descripcion"), _col(cols, "diam"), _col(cols, "codigo")
    c_ult, c_tarifa, c_venta = _col(cols, "ultimo p", "ultimo"), _col(cols, "tarifa"), _col(cols, "p.venta", "p. venta", "venta")
    meses = [(j, _mes(t)) for j, t in enumerate(titulos) if _mes(t)]
    if c_desc is None or not meses:
        return vacio
    ancho = max(len(titulos), max(cols.values()) + 1)
    seccion, diam_sec, arts, incompletas = "", None, [], []
    for f in filas[ini + 1:]:
        f = [str(x).strip() for x in f] + [""] * (ancho - len(f))
        ref, desc = f[0], f[c_desc]
        if ref and not desc and not any(f[1:]):
            if re.search(r"[a-z]{4,}", _n(ref)) and " " in ref.strip():  # fila de sección («CHIMENEA DOBLE PARED (DP) — DIÁMETRO 150 mm…»)
                seccion = ref
                m = re.search(r"diametro\s*(\d+)", _n(ref))
                diam_sec = int(m.group(1)) if m else None
            else:
                incompletas.append(ref)  # código sin descripción ni precio (fila a medias)
            continue
        if not ref or not desc or _n(ref).endswith(":") or _n(ref).startswith("notas"):
            continue
        hist = []
        for j, mes in meses:
            p = _num(f[j])
            if p is not None and p > 0:
                hist.append({"fecha": mes, "precio": p})
        hist.sort(key=lambda h: _orden_mes(h["fecha"]))
        coste = _num(f[c_ult]) if c_ult is not None else None
        if coste is None and hist:
            coste = hist[-1]["precio"]
        if coste is None:
            incompletas.append(ref)
            continue
        cambios = [h for i, h in enumerate(hist) if i == 0 or abs(h["precio"] - hist[i - 1]["precio"]) > 0.0005]
        ant = cambios[-2] if len(cambios) > 1 else None
        familia = _familia_dinak(seccion or desc)
        diam = int(_num(f[c_diam])) if c_diam is not None and _num(f[c_diam]) else diam_sec
        c = clasifica_dinak(desc, familia, diam)
        pvp = _num(f[c_venta]) if c_venta is not None else None
        if pvp is None:
            pvp = round(coste / 0.75, 2)
        cod = f[c_cod] if c_cod is not None and f[c_cod] else ref
        arts.append({
            "ref": ref, "codigo": cod, "alias": [ref] if cod != ref else None,
            "categoria": familia, "subcategoria": c["g"], "descripcion": desc, "nombre": c["n"],
            "tipo": c["t"], "medida_c": c["m"], "orden": diam, "mp": c["mp"], "op": c["op"],
            "foto": url_foto(c["foto"]),
            "unidad": "ud", "ud_venta": "ud", "ud_compra": "ud",
            "precio": coste, "fecha": hist[-1]["fecha"] if hist else None,
            "precio_ant": ant["precio"] if ant else None, "fecha_ant": ant["fecha"] if ant else None,
            "evol": _evol(coste, ant["precio"]) if ant else None,
            "coste": coste, "pvp": pvp, "pvp_iva": _iva(pvp),
            # El 25 % sobre la venta es un 33,3 % sobre el coste (con los precios redondeados de la hoja sale 33,1–33,4)
            "margen": 33.3 if pvp and coste and abs(pvp - coste / 0.75) < 0.02 else round((pvp / coste - 1) * 100, 1) if pvp and coste else None,
            "pvp_fab": _num(f[c_tarifa]) if c_tarifa is not None else None,
            "nota": None, "apunte": None, "minimo": None, "compras": None, "kg_m": None, "metros": None,
            "hist": cambios,
            "origen": f"Coste del último pedido a Construdeco{' (' + _mes_largo(hist[-1]['fecha']) + ')' if hist else ''}, sin IVA. "
                      "Precio de venta: el coste entre 0,75 (un 25 % del precio de venta es margen).",
        })
    # El mismo código Dinak en dos filas (030120020a / 030120020b): se queda la del precio más reciente
    por_cod: dict[str, list] = {}
    for a in arts:
        por_cod.setdefault(a["codigo"], []).append(a)
    quitar = set()
    for cod, xs in por_cod.items():
        if len(xs) < 2:
            continue
        xs.sort(key=lambda a: _orden_mes(a["fecha"]) if a["fecha"] else (0, 0, 0))
        buena = xs[-1]
        for otra in xs[:-1]:
            quitar.add(id(otra))
            buena["alias"] = list(dict.fromkeys((buena.get("alias") or []) + [otra["ref"]] + (otra.get("alias") or [])))
    arts = [a for a in arts if id(a) not in quitar]
    return {"articulos": arts, "log": [], "margen": None, "lineas": {}, "incompletas": incompletas,
            "orden_familias": DINAK_FAMILIAS, "orden_grupos": {f: DINAK_GRUPOS for f in DINAK_FAMILIAS}}


def _mes_largo(m: str) -> str:
    """«sep-26» → «sep 2026»."""
    return f"{m[:3]} 20{m[4:]}"
