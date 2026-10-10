"""Genera frontend/src/components/sorpresasEscena.ts: piezas SVG estáticas de las sorpresas del arranque (ids cfp-)."""
import json, re

import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend', 'src', 'components', 'sorpresasEscena.ts')
INK, BG = '#1E2621', '#F2F4F0'
AM, AM2, GRAF = '#F2B92E', '#D99A1E', '#2A3330'
ARENA, ARENA2 = '#E2C27D', '#C9A45E'
VERDE, VERDE2, PIEL = '#2FAE66', '#1F5A3A', '#F2C9A0'


def filtro(fid, r=6, dy=4, sd=3.5):
    return (f'<filter id="{fid}" x="-30%" y="-40%" width="160%" height="190%">'
            f'<feMorphology in="SourceAlpha" operator="dilate" radius="{r}" result="d"/>'
            '<feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="b"/>'
            f'<feDropShadow in="b" dx="0" dy="{dy}" stdDeviation="{sd}" flood-color="#123A26" flood-opacity=".22" result="bs"/>'
            '<feMerge><feMergeNode in="bs"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')


FILTROS = filtro('cfp-pegaS') + filtro('cfp-pegaS4', 4, 3, 3)


def texto(tid, t, s=15, c='#D93A30'):
    return (f'<text id="cfp-{tid}" opacity="0" font-family="Inter, Montserrat, sans-serif" font-weight="900" font-size="{s}" fill="{c}" '
            f'text-anchor="middle" stroke="#fff" stroke-width="5" paint-order="stroke">{t}</text>')


def granos(pts):
    return ''.join(f'<circle cx="{x}" cy="{y}" r="1.4" fill="{ARENA2}"/>' for x, y in pts)


def humo(i, s=1):
    return (f'<g id="cfp-{i}" opacity="0"><g transform="scale({s})">'
            '<circle cx="0" cy="0" r="7" fill="#fff"/><circle cx="9" cy="-3" r="9" fill="#fff"/><circle cx="19" cy="1" r="6" fill="#fff"/></g></g>')


def rueda(cx, cy, r=23, rid=None):
    k = r / 23
    h = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#1A1A1A"/><g transform="translate({cx} {cy})"><g{f" id=\"cfp-{rid}\"" if rid else ""}>'
    h += f'<circle r="{12.5*k:.1f}" fill="#C9CEC9"/><circle r="{5*k:.1f}" fill="#8D948F"/>'
    for a in range(0, 360, 45):
        h += f'<circle cx="0" cy="{-8.5*k:.1f}" r="{1.6*k:.1f}" fill="#8D948F" transform="rotate({a})"/>'
    return h + '</g></g>'


def rueda_p(cx, cy, r, rid):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#1A1A1A"/><g transform="translate({cx} {cy})"><g id="cfp-{rid}">'
            f'<circle r="{r*.55:.1f}" fill="{AM}"/><circle r="{r*.22:.1f}" fill="{AM2}"/>'
            + ''.join(f'<circle cx="0" cy="{-r*.38:.1f}" r="{r*.07:.1f}" fill="{AM2}" transform="rotate({a})"/>' for a in range(0, 360, 60))
            + '</g></g>')


# ------------------------------------------------------------------ pala
PALA = ('<g id="cfp-pala" transform="translate(-600 0)"><g filter="url(#cfp-pegaS)">'
        f'<rect x="-2" y="-58" width="12" height="50" rx="4" fill="{GRAF}"/><rect x="-9" y="-10" width="24" height="7" rx="3" fill="{GRAF}"/>'
        f'<path d="M14 -60 L-6 -132" stroke="{AM}" stroke-width="16" stroke-linecap="round"/>'
        f'<path d="M-6 -132 L-24 -78" stroke="{AM2}" stroke-width="11" stroke-linecap="round"/>'
        f'<path d="M-34 -80 l15 -7 l7 15 q-11 9 -22 0 z" fill="{GRAF}"/>'
        + rueda_p(46, -30, 30, 'pr1') +
        f'<rect x="12" y="-62" width="166" height="28" rx="9" fill="{AM}"/><rect x="12" y="-44" width="166" height="10" rx="5" fill="{AM2}"/>'
        f'<path d="M100 -60 V-84 Q100 -90 106 -90 H158 Q168 -90 171 -80 L178 -60 Z" fill="{AM}"/>'
        f'<rect x="146" y="-106" width="6" height="18" rx="2" fill="{GRAF}"/>'
        f'<path d="M166 -80 h7 M168 -72 h7 M170 -64 h7" stroke="{AM2}" stroke-width="3" stroke-linecap="round"/>'
        f'<rect x="26" y="-140" width="76" height="82" rx="6" fill="{GRAF}"/>'
        f'<rect x="20" y="-148" width="88" height="10" rx="4" fill="{GRAF}"/>'
        '<rect x="33" y="-132" width="28" height="48" rx="3" fill="#BFE3EE"/><rect x="67" y="-132" width="28" height="48" rx="3" fill="#BFE3EE"/>'
        '<path d="M72 -128 h8 l-8 22 z" fill="#fff" opacity=".6"/>'
        f'<rect x="26" y="-82" width="76" height="24" rx="4" fill="{AM}"/>'
        '<path id="cfp-palaFaro" d="M55 -148 q7 -13 14 0 z" fill="#F29A2E"/>'
        f'<path d="M8 -34 A38 38 0 0 1 84 -34" stroke="{GRAF}" stroke-width="6" fill="none"/>'
        + rueda_p(150, -21, 21, 'pr2') +
        '<g id="cfp-palaBrazo"></g></g></g>')
MONTON = ('<g id="cfp-monton" opacity="0"><g filter="url(#cfp-pegaS)">'
          f'<path d="M186 244 Q200 192 262 186 Q320 182 352 204 Q378 222 392 244 Z" fill="{ARENA}"/>'
          f'<path d="M226 232 Q262 214 300 212" stroke="{ARENA2}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".6"/></g>'
          + granos([(232, 222), (258, 200), (286, 196), (318, 222), (348, 232), (270, 228)]) + '</g>')
CAPA_PALA = (f'<path id="cfp-chorro" opacity="0" fill="{ARENA}"/>' + MONTON + PALA
             + humo('pp1', 1.1) + humo('pp2', .9) + texto('tBrum', '¡BRRRUM!', 15) + texto('tPlof', '¡PLOF!', 17))

# ------------------------------------------------------------------ carretilla (descuelga)
CARR2 = ('<g id="cfp-carr2" transform="translate(-600 0)"><g filter="url(#cfp-pegaS)">'
         '<rect x="-4" y="-48" width="20" height="36" rx="8" fill="#2A3330"/>'
         f'<path d="M20 -30 V-74 H54 L62 -30" fill="none" stroke="{INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>'
         f'<rect x="16" y="-78" width="44" height="6" rx="3" fill="{INK}"/>'
         '<rect id="cfp-faro2" x="31" y="-86" width="10" height="8" rx="4" fill="#F29A2E" opacity=".35"/>'
         '<rect x="29" y="-44" width="14" height="15" rx="5" fill="#2FAE66"/>'
         '<circle cx="36" cy="-52" r="7.5" fill="#F2C9A0"/>'
         '<path d="M27.5 -53 Q36 -66 44.5 -53 Z" fill="#FFD25A"/><rect x="26" y="-55" width="20" height="3.5" rx="1.75" fill="#F2B92E"/>'
         '<rect x="2" y="-32" width="66" height="22" rx="9" fill="#D93A30"/>'
         '<rect x="2" y="-32" width="66" height="7" rx="3.5" fill="#E85A50"/>'
         '<rect id="cfp-m3" x="70" y="-86" width="8" height="76" rx="4" fill="#6B7470"/>'
         '<rect id="cfp-m2" x="70" y="-86" width="8" height="76" rx="4" fill="#5A635F"/>'
         '<rect x="70" y="-86" width="8" height="76" rx="4" fill="#4A524E"/>'
         '<g id="cfp-horq2"><rect x="74" y="-28" width="8" height="24" rx="2.5" fill="#6B7470"/>'
         '<rect x="76" y="-6" width="40" height="5" rx="2.5" fill="#4A524E"/></g>'
         + rueda(22, -11, 12, 'c2r1') + rueda(58, -11, 12, 'c2r2') + '</g></g>')
CAPA_CARR = CARR2 + texto('tDuda', '¿?', 18, VERDE2) + texto('tClac', '¡CLAC!', 16) + texto('tUy', '¡uy!', 15)

# ------------------------------------------------------------------ pintor
PIERNAS = ('<g id="cfp-piI"><rect x="-11" y="-30" width="9" height="26" rx="4" fill="#25915A"/><rect x="-13" y="-7" width="12" height="7" rx="3" fill="#2A3330"/></g>'
           '<g id="cfp-piD"><rect x="2" y="-30" width="9" height="26" rx="4" fill="#25915A"/><rect x="1" y="-7" width="12" height="7" rx="3" fill="#2A3330"/></g>')


def brazos(gid, manos, op):
    s = f'<g id="cfp-{gid}" opacity="{op}">'
    for (hx, hy), (sx, sy) in zip(manos, ((-8, -51), (8, -51))):
        s += f'<path d="M{sx} {sy} L{hx} {hy}" stroke="{VERDE}" stroke-width="7" stroke-linecap="round"/><circle cx="{hx}" cy="{hy}" r="3.6" fill="{PIEL}"/>'
    return s + '</g>'


PINTOR = ('<g id="cfp-pintor" transform="translate(-600 0)"><g filter="url(#cfp-pegaS)">' + PIERNAS +
          '<rect x="-13" y="-57" width="26" height="31" rx="9" fill="#2FAE66"/>'
          '<rect x="-6" y="-53" width="12" height="11" rx="3" fill="#43C27A"/>'
          '<circle cx="-6" cy="-36" r="2.2" fill="#fff"/><circle cx="5" cy="-31" r="1.6" fill="#fff"/><circle cx="7" cy="-46" r="1.4" fill="#fff"/>'
          '<g id="cfp-cubo"><path d="M-26 -30 h14 l-2 16 h-10 z" fill="#C9CEC9"/><rect x="-27" y="-32" width="16" height="4" rx="2" fill="#8D948F"/>'
          '<path d="M-25 -32 q6 -9 12 0" stroke="#8D948F" stroke-width="1.6" fill="none"/></g>'
          + brazos('brA', ((14, -58), (-14, -40)), 1) + brazos('brB', ((6, -44), (12, -62)), 0) +
          f'<circle cx="0" cy="-67" r="9" fill="{PIEL}"/>'
          f'<path d="M-9.5 -68 Q0 -83 9.5 -68 Z" fill="{VERDE2}"/><rect x="5" y="-70.5" width="10" height="3.5" rx="1.75" fill="{VERDE2}"/>'
          '<circle id="cfp-mancha" cx="-2" cy="-75" r="2.6" fill="#fff" opacity="0"/>'
          '</g></g>')
CENTROS = [108, 134, 160, 186, 212, 238, 264, 290]


def franja(i, cx, w=30):
    gotas = ''
    for f, l in ((0.25, 6 + (i * 5) % 11), (0.72, 9 + (i * 7) % 9)):
        x = cx - w / 2 + 4 + f * (w - 8)
        gotas += f'<rect x="{x-2.5:.1f}" y="104" width="5" height="{l+8}" rx="2.5" fill="{BG}" stroke="#E3E7E0" stroke-width="1"/>'
    return (f'<g id="cfp-frG{i}" opacity="0">{gotas}</g>'
            f'<rect id="cfp-frR{i}" x="{cx-w/2:.1f}" y="4" width="{w}" height="0" rx="7" fill="{BG}" stroke="#E3E7E0" stroke-width="1"/>')


CARTEL = ('<g id="cfp-cartel" transform="translate(-600 0)"><g filter="url(#cfp-pegaS)">'
          '<path d="M-24 0 L-14 -40 M24 0 L14 -40" stroke="#8D948F" stroke-width="4" stroke-linecap="round"/>'
          '<rect x="-40" y="-62" width="80" height="34" rx="5" fill="#FFD25A"/>'
          f'<text x="0" y="-48" font-family="Inter, Montserrat, sans-serif" font-weight="900" font-size="10.5" fill="{INK}" text-anchor="middle">RECIÉN</text>'
          f'<text x="0" y="-34" font-family="Inter, Montserrat, sans-serif" font-weight="900" font-size="10.5" fill="{INK}" text-anchor="middle">PINTADO</text>'
          '</g></g>')
NOTAS = (f'<g id="cfp-notas" opacity="0"><text x="0" y="0" font-family="DejaVu Sans, sans-serif" font-size="16" fill="{VERDE2}">♪</text>'
         f'<text x="12" y="-10" font-family="DejaVu Sans, sans-serif" font-size="13" fill="{VERDE2}">♫</text></g>')
GOTA = '<path id="cfp-gotaP" opacity="0" d="M0 -6 Q4 0 3 3 A3 3 0 0 1 -3 3 Q-4 0 0 -6 Z" fill="#FFFFFF" stroke="#D5DAD3"/>'
CAPA_PINTOR = (''.join(franja(i, c) for i, c in enumerate(CENTROS)) + CARTEL + PINTOR
               + '<g filter="url(#cfp-pegaS4)"><g id="cfp-pertiga"></g></g>' + GOTA + NOTAS)

# ------------------------------------------------------------------ orbayu
NUBE = ('<g id="cfp-nube" transform="translate(-600 0)"><g filter="url(#cfp-pegaS)">'
        '<circle cx="0" cy="0" r="20" fill="#BFC6C1"/><circle cx="24" cy="-12" r="25" fill="#BFC6C1"/>'
        '<circle cx="50" cy="0" r="19" fill="#BFC6C1"/><rect x="-18" y="0" width="86" height="18" rx="9" fill="#BFC6C1"/>'
        '<circle cx="18" cy="-20" r="10" fill="#D3D8D4"/><rect x="-14" y="10" width="78" height="8" rx="4" fill="#A9B1AC"/></g></g>')
LLUVIA = ''.join(f'<path id="cfp-ll{i}" d="M0 0 l-2 8" opacity="0" stroke="#6FB0D2" stroke-width="2.4" stroke-linecap="round"/>' for i in range(12))
GOTAS = ''.join(f'<path id="cfp-gs{i}" opacity="0" d="M0 -6 Q4 0 3 3 A3 3 0 0 1 -3 3 Q-4 0 0 -6 Z" fill="#6FB0D2"/>' for i in range(4))
VIENTO = ('<g id="cfp-viento" opacity="0" stroke="#9AA9A2" stroke-width="3" fill="none" stroke-linecap="round">'
          '<path d="M0 0 h-90 q-14 0 -14 -10 q0 -9 9 -9 q7 0 7 7"/><path d="M30 46 h-110 q-14 0 -14 -10 q0 -9 9 -9 q7 0 7 7"/>'
          '<path d="M-10 112 h-90"/></g>')


def hoja(hid, c):
    return (f'<g id="cfp-{hid}" transform="translate(-600 0)"><g filter="url(#cfp-pegaS4)">'
            f'<path d="M0 -9 Q8 0 0 9 Q-8 0 0 -9 Z" fill="{c}"/><path d="M0 -8 V8" stroke="#A65F1C" stroke-width="1.2"/></g></g>')


SOL = ('<g id="cfp-sol" transform="translate(-600 0)"><g filter="url(#cfp-pegaS)"><g id="cfp-rayos">'
       + ''.join(f'<rect x="-3" y="-34" width="6" height="11" rx="3" fill="#F2B92E" transform="rotate({a})"/>' for a in range(0, 360, 45))
       + '</g><circle r="19" fill="#FFD25A"/><circle cx="-6" cy="-6" r="6" fill="#FFE48F"/></g></g>')
CAPA_ORBAYU = (LLUVIA + NUBE + GOTAS + VIENTO + hoja('hj1', '#D9822B') + hoja('hj2', '#C4A030') + SOL
               + texto('tPlic', 'plic plic', 13, '#3E86AD') + texto('tFiu', '¡FIUUU!', 16))

# ------------------------------------------------------------------ grúa
CAPA_GRUA = texto('tClacG', '¡CLAC!', 16)

J = lambda s: json.dumps(re.sub(r'\s*\n\s*', ' ', s), ensure_ascii=False)
ts = f'''/* Piezas de dibujo (estáticas) de las sorpresas del arranque. Generado con tools/sorpresas-escena.py; ids con prefijo cfp-. */
export const FILTROS_S = {J(FILTROS)};
export const CAPA_GRUA = {J(CAPA_GRUA)};
export const CAPA_PALA = {J(CAPA_PALA)};
export const CAPA_CARR = {J(CAPA_CARR)};
export const CAPA_PINTOR = {J(CAPA_PINTOR)};
export const CAPA_ORBAYU = {J(CAPA_ORBAYU)};
export const CENTROS_FRANJAS = {json.dumps(CENTROS)};
'''
open(OUT, 'w').write(ts)
print(len(ts))
