"""Fotos del catálogo de Isoltubex para el catálogo de tarifas de la app (oct. 2026).

Uso:  python3 tools/isoltubex-fotos.py <catalogo.pdf> <hojas.json> <carpeta_salida_fotos> <salida_json>

- <catalogo.pdf>: el catálogo oficial (https://www.isoltubex.net/catalogos/catalogoIsoltubex2025.pdf).
- <hojas.json>: la tarifa tal como la devuelve la acción «hoja» del Apps Script ({pestaña: filas}).
- Fotos → frontend/public/catalogo/iso/<nombre>.webp ; JSON → backend/app/data/isoltubex_fotos.json

Cada producto del catálogo es un bloque: la foto a la izquierda y, a su derecha, la tabla con las referencias.
Se buscan las referencias de la tarifa en el texto de cada página (el catálogo las escribe sin «X» ni «/»:
CH16X1/2 → CH1612) y se coge la foto más cercana a su izquierda (la más colorida: al lado suele estar el
dibujo técnico, en gris). Cada tipo de pieza se queda con la foto que más se repite entre sus referencias,
y las referencias que no salen en el catálogo cogen la de su tipo. Lo dudoso se revisa a mano con la hoja de
contactos que se genera al lado del JSON.
"""
import collections
import io
import json
import os
import re
import sys

import pymupdf
from PIL import Image, ImageChops, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.services import isoltubex as I  # noqa: E402

PDF, HOJAS, OUT_FOTOS, OUT_JSON = sys.argv[1:5]
os.makedirs(OUT_FOTOS, exist_ok=True)

# A mano, cuando la regla automática no acierta (revisado con la hoja de contactos):
# referencia de la tarifa o «familia|grupo|tipo» → referencia tal como la escribe el catálogo
FORZAR: dict[str, str] = {
    "Colectores y cajas|Colectores|Colector 1″ con euroconos Ø16": "CO1212-16",
    "Colectores y cajas|Colectores|Colector 1″ con euroconos Ø20": "CO1212-16",  # la del Ø20 es un dibujo
    "Colectores y cajas|Colectores|Colector ¾″ con euroconos Ø16": "CO34212",
    "Colectores y cajas|Colectores|Colector 1″ con euroconos Ø16 y válvulas de regulación": "CO1212-16",
    "Colectores y cajas|Colectores|Colector ¾″ con euroconos Ø16 y válvulas de regulación": "CO34212",
}
# Imagen exacta del catálogo (p. 97: máquinas y cuñas, cada una al lado de su tabla)
XREF_REF = {"MMCR": 1231, "MMCF": 1235, "CUNA-MMCR": 1232, "CUNA-MMCF": 1236}
# Grupos que en el catálogo solo tienen foto (sin tabla de referencias): «familia|grupo|» → xref de la imagen
XREF_GRUPO = {
    f"{I.F_PEX}|PE-RT EVOH (suelo radiante)|": 526,   # p. 13, rollo rojo PE-RT EVOH
    f"{I.F_PEX}|PEX-a EVOH (suelo radiante)|": 526,
    f"{I.F_MC}|Multicapa para suelo radiante|": 540,  # p. 15, rollo multicapa PERT-AL-PERT
}
TUBOS = (I.F_MC, I.F_PEX)


def canon(s: str) -> str:
    s = re.sub(r"AIS\d+", "AIS", s.upper())
    s = re.sub(r"(\d)-(\d)/(\d)", r"\1\2\3", s)
    s = s.replace("/", "")
    return re.sub(r"[^A-Z0-9]", "", s.replace("X", "") if re.search(r"\dX\d", s) else s)


def claves(cod: str) -> list[str]:
    k = canon(cod)
    out = [k]
    m = re.match(r"^([A-Z]+)(\d{2})(.*?)(\d{2})$", k)
    if m and m.group(2) == m.group(4):  # TH16X1/2X16 → TH1612
        out.append(m.group(1) + m.group(2) + m.group(3))
    out.append(re.sub(r"[^A-Z0-9]", "", cod.upper()))
    # tubos: el catálogo escribe PEXA16-B4 (tarifa PEX16-B4 / PEX-A16B4) y MC16AIS-R (tarifa MC16AIS10-R)
    for a in list(out):
        out.append(re.sub(r"AIS\d+", "AIS", a))
        if re.match(r"^PEX\d", a):
            out.append("PEXA" + a[3:])
    return list(dict.fromkeys(out))


doc = pymupdf.open(PDF)
arts = I.leer(json.load(open(HOJAS, encoding="utf-8")))

# 1) dónde sale cada referencia del catálogo
palabras = collections.defaultdict(list)  # clave → [(página, x, y)]
for i, p in enumerate(doc):
    for w in p.get_text("words"):
        k = canon(w[4])
        if len(k) >= 2:
            palabras[k].append((i, w[0], (w[1] + w[3]) / 2))

# 2) imágenes de cada página y lo coloridas que son
_info = {}
_color = {}


def imagenes(i):
    if i not in _info:
        out = []
        for im in doc[i].get_image_info(xrefs=True):
            x0, y0, x1, y1 = im["bbox"]
            if im["xref"] <= 0 or x1 - x0 < 40 or y1 - y0 < 30 or y0 < 60 or x1 - x0 > 420:
                continue
            out.append((im["xref"], (x0, y0, x1, y1)))
        _info[i] = out
    return _info[i]


def colorido(xref):
    if xref not in _color:
        try:
            pm = pymupdf.Pixmap(doc, xref)
            if pm.n - pm.alpha >= 3:
                im = Image.frombytes("RGBA" if pm.alpha else "RGB", (pm.width, pm.height), pm.samples).convert("RGB")
            else:
                im = Image.frombytes("L", (pm.width, pm.height), pm.samples[: pm.width * pm.height]).convert("RGB")
            # foto ≠ dibujo técnico: la foto tiene color o superficie rellena; el dibujo, líneas finas sobre blanco
            hsv = im.resize((64, 64)).convert("HSV")
            px = [(s, v) for _, s, v in (hsv.get_flattened_data() if hasattr(hsv, "get_flattened_data") else hsv.getdata()) if v < 238]
            relleno = len(px) / 4096
            sat = sum(s for s, _ in px) / max(1, len(px))
            _color[xref] = sat + 120 * relleno if relleno > 0.06 else 0
        except Exception:
            _color[xref] = 0
    return _color[xref]


def foto_de(hit):
    i, x, y = hit
    mitad = 0 if x < 595 else 1
    cands = []
    for xref, (x0, y0, x1, y1) in imagenes(i):
        if (0 if x0 < 595 else 1) != mitad or x1 > x + 8:
            continue
        d = 0 if y0 - 12 <= y <= y1 + 12 else min(abs(y - y0), abs(y - y1))
        if d <= 140:
            cands.append((d, xref))
    if not cands:
        return None
    dmin = min(d for d, _ in cands)
    cerca = [xref for d, xref in cands if d <= dmin + 45]
    mejor = max(cerca, key=colorido)
    return mejor if colorido(mejor) > 30 else None


por_ref = {}
for a in arts:
    for k in claves(a["codigo"]):
        hits = palabras.get(k)
        if hits:
            votos = collections.Counter(f for f in (foto_de(h) for h in hits) if f)
            if votos:
                por_ref[a["codigo"].upper()] = votos.most_common(1)[0][0]
            break

# 2b) tuberías: la foto depende de la línea y del formato (rollo / barra, y el color del aislamiento),
#     no del diámetro: se vota por eso y se pone a todas las referencias
def clave_tubo(a):
    cod = a["codigo"].upper()
    if cod.startswith(("MCGAS", "MCNGAS")):  # gas: la foto de las barras (la del rollo es un dibujo de la caja)
        return f"{a['categoria']}|{a['subcategoria']}|{'negro' if cod.startswith('MCNGAS') else 'amarillo'}"
    color = {"-N": "negro"}.get(cod[-2:], "") if "AIS" in cod else ""
    return f"{a['categoria']}|{a['subcategoria']}|{a['unidad']}{color}"


votos_tubo = collections.defaultdict(collections.Counter)
for a in arts:
    if a["categoria"] in TUBOS and a["codigo"].upper() in por_ref and not (
            a["codigo"].upper().startswith(("MCGAS", "MCNGAS")) and a["unidad"] != "barra"):
        votos_tubo[clave_tubo(a)][por_ref[a["codigo"].upper()]] += 1
for a in arts:
    if a["categoria"] not in TUBOS:
        continue
    c = votos_tubo.get(clave_tubo(a))
    grupo = f"{a['categoria']}|{a['subcategoria']}|"
    if not c:  # el otro formato de la misma línea, o la foto puesta a mano
        c = collections.Counter()
        for k, v in votos_tubo.items():
            if k.startswith(grupo):
                c.update(v)
    if c:
        por_ref[a["codigo"].upper()] = c.most_common(1)[0][0]
    elif grupo in XREF_GRUPO:
        por_ref[a["codigo"].upper()] = XREF_GRUPO[grupo]
# PP-R anti UV: la misma barra verde que el Faser CT
for a in arts:
    if a["subcategoria"] == "PP-R Faser CT anti UV" and a["codigo"].upper() not in por_ref:
        otro = next((por_ref.get(b["codigo"].upper()) for b in arts if b["subcategoria"] == "PP-R Faser CT"
                     and por_ref.get(b["codigo"].upper())), None)
        if otro:
            por_ref[a["codigo"].upper()] = otro

por_ref.update(XREF_REF)

# 3) cada tipo de pieza (o grupo, si va suelta) con la foto que más se repite
clave_tipo = lambda a: f"{a['categoria']}|{a['subcategoria']}|{a['tipo'] or ''}"
por_tipo = collections.defaultdict(collections.Counter)
for a in arts:
    f = por_ref.get(a["codigo"].upper())
    if f:
        por_tipo[clave_tipo(a)][f] += 1
        por_tipo[f"{a['categoria']}|{a['subcategoria']}|"][f] += 1
tipo_foto = {k: c.most_common(1)[0][0] for k, c in por_tipo.items()}
def foto_catalogo(ref):
    votos = collections.Counter(f for f in (foto_de(h) for h in palabras.get(canon(ref), [])) if f)
    return votos.most_common(1)[0][0] if votos else None


for k, ref in FORZAR.items():
    xr = foto_catalogo(ref)
    print("a mano:", k, "→", ref, xr)
    if xr:
        if "|" in k:
            tipo_foto[k] = xr
        else:
            por_ref[k.upper()] = xr

# 4) guardar las fotos usadas: recortadas, sobre blanco, cuadradas y ligeras
usados = set(por_ref.values()) | set(tipo_foto.values())
nombre = {}
for xref in sorted(usados):
    pm = pymupdf.Pixmap(doc, xref)
    if pm.colorspace and pm.colorspace.n > 3:
        pm = pymupdf.Pixmap(pymupdf.csRGB, pm)
    im = Image.open(io.BytesIO(pm.tobytes("png"))).convert("RGBA")
    fondo = Image.new("RGBA", im.size, (255, 255, 255, 255))
    im = Image.alpha_composite(fondo, im).convert("RGB")
    diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L").point(lambda v: 255 if v > 18 else 0)
    bb = diff.getbbox() or (0, 0, im.width, im.height)
    im = im.crop(bb)
    lado = int(max(im.size) * 1.12) + 8
    lienzo = Image.new("RGB", (lado, lado), (255, 255, 255))
    lienzo.paste(im, ((lado - im.width) // 2, (lado - im.height) // 2))
    if lado > 360:
        lienzo = lienzo.resize((360, 360), Image.LANCZOS)
    n = f"i{xref}.webp"
    lienzo.save(os.path.join(OUT_FOTOS, n), "WEBP", quality=84, method=6)
    nombre[xref] = n

# Anillos de expansión: el catálogo solo trae la foto del rojo; el azul y el blanco se tiñen a partir de ella
def tenir(n, color):
    im = Image.open(os.path.join(OUT_FOTOS, n)).convert("HSV")
    h, sat, v = im.split()
    roja = sat.point(lambda x: 255 if x > 60 else 0)
    if color == "azul":
        h2 = h.point(lambda x: 150)
        sat2 = sat
    else:
        h2, sat2 = h, sat.point(lambda x: int(x * 0.06))
        v = Image.composite(v.point(lambda x: min(255, int(x * 0.35 + 170))), v, roja)
    nueva = Image.merge("HSV", (Image.composite(h2, h, roja), Image.composite(sat2, sat, roja), v)).convert("RGB")
    out = n.replace(".webp", f"-{color}.webp")
    nueva.save(os.path.join(OUT_FOTOS, out), "WEBP", quality=84, method=6)
    return out


tenidas = {}
for a in arts:
    if a["tipo"] and a["tipo"].startswith("Anillo de expansión ") and not a["tipo"].startswith("Anillo de expansión rojo"):
        color = "azul" if "azul" in a["tipo"] else "blanco"
        xr = por_ref.get(a["codigo"].upper()) or tipo_foto.get(clave_tipo(a))
        if xr:
            k = (xr, color)
            if k not in tenidas:
                tenidas[k] = tenir(nombre[xr], color)
            a["_foto"] = tenidas[k]

# Foto de cada familia (cuando aún no se ha elegido nada): la del primer tipo con foto
familias = {}
for a in arts:
    f = tipo_foto.get(clave_tipo(a))
    if f and a["categoria"] not in familias:
        familias[a["categoria"]] = nombre[f]

refs_out = {k: nombre[v] for k, v in sorted(por_ref.items())}
tipos_out = {k: nombre[v] for k, v in sorted(tipo_foto.items())}
for a in arts:
    if a.get("_foto"):
        refs_out[a["codigo"].upper()] = a["_foto"]
        tipos_out[clave_tipo(a)] = a["_foto"]
out = {"fuente": "https://www.isoltubex.net/catalogos/catalogoIsoltubex2025.pdf",
       "refs": refs_out,
       "tipos": tipos_out,
       "familias": familias}
json.dump(out, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

sin = [a for a in arts if not I.foto(a["codigo"], {"f": a["categoria"], "g": a["subcategoria"], "t": a["tipo"]})
       and a["codigo"].upper() not in por_ref and clave_tipo(a) not in tipo_foto]
print(f"{len(arts)} referencias · {len(por_ref)} encontradas en el catálogo · {len(tipo_foto)} tipos con foto · "
      f"{len(nombre)} fotos · {len(sin)} sin foto")

# 5) hoja de contactos para revisar: una fila por tipo con su foto
filas = []
vistos = set()
for a in arts:
    k = clave_tipo(a)
    if k in vistos:
        continue
    vistos.add(k)
    filas.append((k, tipo_foto.get(k) or tipo_foto.get(f"{a['categoria']}|{a['subcategoria']}|")))
cols, w, h = 6, 220, 250
hoja = Image.new("RGB", (cols * w, ((len(filas) + cols - 1) // cols) * h), (240, 240, 236))
dr = ImageDraw.Draw(hoja)
try:
    fnt = ImageFont.truetype("DejaVuSans.ttf", 11)
except OSError:
    fnt = ImageFont.load_default()
for i, (k, xr) in enumerate(filas):
    x, y = (i % cols) * w, (i // cols) * h
    if xr:
        t = Image.open(os.path.join(OUT_FOTOS, nombre[xr])).resize((190, 190))
        hoja.paste(t, (x + 15, y + 6))
    else:
        dr.rectangle((x + 15, y + 6, x + 205, y + 196), outline=(200, 60, 60), width=3)
    _, g, t = k.split("|")
    dr.text((x + 6, y + 200), f"{i}. {g[:30]}", fill=(0, 0, 0), font=fnt)
    dr.text((x + 6, y + 215), (t or "(sueltos)")[:34], fill=(40, 40, 40), font=fnt)
    dr.text((x + 6, y + 230), k.split("|")[0][:34], fill=(110, 110, 110), font=fnt)
hoja.save(os.path.splitext(OUT_JSON)[0] + "_contactos.png")
