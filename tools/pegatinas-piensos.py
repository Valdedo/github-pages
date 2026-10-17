"""Dibujos de la tarifa de piensos y agrícola (oct. 2026), con el acabado de las pegatinas de la app
(tools/pegatinas-gas.py y tools/pegatinas-catalogo.py): vector plano a dos tonos (color, sombra más oscura abajo a la
derecha y brillo claro), trazo grafito, esquinas redondeadas, borde blanco recortado y sombra suave. Sin texto ni logos.

Los piensos son de marca de la fábrica y no tienen foto, así que cada tarjeta de la cuadrícula lleva el animal al que van
destinados o el producto (y el árido a granel, que va en la misma hoja).

Uso:
    python3 tools/pegatinas-piensos.py frontend/public/catalogo/pi
    python3 tools/pegatinas-piensos.py frontend/public/catalogo/pi gallina vaca      (solo esos)
    python3 tools/pegatinas-piensos.py frontend/public/catalogo/pi --hoja=/ruta/contacto.png

- En la carpeta dada: <nombre>.webp de 480×480, fondo blanco, el dibujo centrado (≈80 % del lado) con su borde blanco y
  sombra. Todos se escalan al mismo tamaño aparente y el trazo se corrige para que salga igual de grueso en todos.
- En la carpeta de arriba (frontend/public/catalogo): las pegatinas de proveedor st-prov-piensos.png y
  st-prov-morteros.png, PNG de 256×256 con fondo transparente, igual que st-prov-gas.png.
- Con --hoja=<ruta>: hoja de contacto con todos en rejilla de 6 columnas y el nombre debajo, para revisarlos.
"""
import io
import math
import os
import random
import sys

import cairosvg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

INK = '#2B2F2C'
SW0 = 2.6
SW = SW0          # grosor del trazo; se corrige al escalar cada dibujo (ver tarjeta())
_n = [0]


# ───────────────────────── piezas de dibujo ─────────────────────────
def nid():
    _n[0] += 1
    return f'k{_n[0]}'


def suave(p, cerrado=True, t=0.18):
    """Curva suave que pasa por los puntos (Catmull-Rom). Un punto (x, y, 'c') hace esquina."""
    q = [(a[0], a[1]) for a in p]
    esq = [len(a) > 2 for a in p]
    n = len(q)

    def tg(i):
        if esq[i]:
            return 0, 0
        if not cerrado and i == 0:
            return (q[1][0] - q[0][0]) * t * 2, (q[1][1] - q[0][1]) * t * 2
        if not cerrado and i == n - 1:
            return (q[i][0] - q[i - 1][0]) * t * 2, (q[i][1] - q[i - 1][1]) * t * 2
        a, b = q[(i - 1) % n], q[(i + 1) % n]
        return (b[0] - a[0]) * t, (b[1] - a[1]) * t

    d = f'M{q[0][0]:.1f} {q[0][1]:.1f}'
    for i in range(n if cerrado else n - 1):
        j = (i + 1) % n
        ti, tj = tg(i), tg(j)
        d += (f' C{q[i][0] + ti[0]:.1f} {q[i][1] + ti[1]:.1f} {q[j][0] - tj[0]:.1f} {q[j][1] - tj[1]:.1f}'
              f' {q[j][0]:.1f} {q[j][1]:.1f}')
    return d + (' Z' if cerrado else '')


def elipse(cx, cy, rx, ry, rot=0):
    a = math.radians(rot)
    x1, y1 = cx - rx * math.cos(a), cy - rx * math.sin(a)
    x2, y2 = cx + rx * math.cos(a), cy + rx * math.sin(a)
    return (f'M{x1:.1f} {y1:.1f} A{rx} {ry} {rot} 1 0 {x2:.1f} {y2:.1f} '
            f'A{rx} {ry} {rot} 1 0 {x1:.1f} {y1:.1f} Z')


def rr(x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    return (f'M{x + r:.1f} {y:.1f} H{x + w - r:.1f} A{r:.1f} {r:.1f} 0 0 1 {x + w:.1f} {y + r:.1f} V{y + h - r:.1f} '
            f'A{r:.1f} {r:.1f} 0 0 1 {x + w - r:.1f} {y + h:.1f} H{x + r:.1f} A{r:.1f} {r:.1f} 0 0 1 {x:.1f} {y + h - r:.1f} '
            f'V{y + r:.1f} A{r:.1f} {r:.1f} 0 0 1 {x + r:.1f} {y:.1f} Z')


def nube(cx, cy, rx, ry, n, abulta=0.62, fase=0.0):
    """Contorno de lana / nube: arcos hacia fuera entre puntos de una elipse."""
    p = [(cx + rx * math.cos(fase + 2 * math.pi * k / n), cy + ry * math.sin(fase + 2 * math.pi * k / n)) for k in range(n)]
    d = f'M{p[0][0]:.1f} {p[0][1]:.1f}'
    for k in range(n):
        a, b = p[k], p[(k + 1) % n]
        r = math.hypot(b[0] - a[0], b[1] - a[1]) * abulta
        d += f' A{r:.1f} {r:.1f} 0 0 1 {b[0]:.1f} {b[1]:.1f}'
    return d + ' Z'


def tinta(d, sw=None, color=INK, cap='round'):
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{(sw or SW):.2f}" '
            f'stroke-linecap="{cap}" stroke-linejoin="round"/>')


def color_linea(d, color, w, op=1.0):
    """Línea de color sin contorno (brillos, vetas, barbas)."""
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" '
            f'stroke-linejoin="round" opacity="{op}"/>')


def lleno(d, fill, sw=None, op=1.0):
    return (f'<path d="{d}" fill="{fill}" opacity="{op}" stroke="{INK}" stroke-width="{(sw or SW):.2f}" '
            f'stroke-linejoin="round" stroke-linecap="round"/>')


def plano(d, fill, op=1.0):
    return f'<path d="{d}" fill="{fill}" opacity="{op}"/>'


def forma(d, base, osc=None, sh=(5, 4), dentro=(), contorno=True, sw=None):
    """Forma a dos tonos: el color base desplazado arriba a la izquierda deja ver la sombra abajo a la derecha.
    «dentro» se dibuja recortado por la forma (manchas, brillos, vetas)."""
    i = nid()
    o = [f'<clipPath id="{i}"><path d="{d}"/></clipPath>', f'<g clip-path="url(#{i})">']
    if osc:
        o += [f'<path d="{d}" fill="{osc}"/>', f'<path d="{d}" fill="{base}" transform="translate({-sh[0]} {-sh[1]})"/>']
    else:
        o.append(f'<path d="{d}" fill="{base}"/>')
    o += list(dentro)
    o.append('</g>')
    if contorno:
        o.append(tinta(d, sw))
    return o


def trazos(ds, color, w):
    """Líneas gruesas de color con contorno (patas de ave, tallos, rabos): primero toda la tinta, luego el color."""
    o = [f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{w + 2 * SW:.2f}" stroke-linecap="round" '
         f'stroke-linejoin="round"/>' for d in ds]
    o += [f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" '
          f'stroke-linejoin="round"/>' for d in ds]
    return o


def ojo(x, y, r=4.2):
    return [f'<circle cx="{x}" cy="{y}" r="{r}" fill="{INK}"/>',
            f'<circle cx="{x - r * 0.35:.1f}" cy="{y - r * 0.38:.1f}" r="{r * 0.36:.1f}" fill="#FFFFFF"/>']


def pata(x, y0, y1, w, col, osc, casco=None, hc=9):
    """Pata de cuadrúpedo: barra redondeada con la pezuña o la mano abajo."""
    dentro = []
    if casco:
        dentro = [f'<rect x="{x - 3}" y="{y1 - hc}" width="{w + 6}" height="{hc + 3}" fill="{casco}"/>',
                  f'<line x1="{x - 3}" y1="{y1 - hc}" x2="{x + w + 3}" y2="{y1 - hc}" stroke="{INK}" stroke-width="{SW * 0.85:.2f}"/>']
    return forma(rr(x, y0, w, y1 - y0, w * 0.45), col, osc, sh=(3, 1), dentro=dentro)


def en(tx, ty, s, items_fn, rot=0):
    """Dibuja items_fn() trasladado/escalado/girado con el trazo corregido para que no cambie de grosor."""
    global SW
    viejo = SW
    SW = viejo / s
    try:
        cuerpo = items_fn()
    finally:
        SW = viejo
    return [f'<g transform="translate({tx} {ty}) rotate({rot}) scale({s})">'] + cuerpo + ['</g>']


# ───────────────────────── animales ─────────────────────────
def gallina():
    CU = ('#C8662F', '#96461C')
    ALA = ('#A8502A', '#7A3616')
    COLA = ('#5E3420', '#3E2112')
    ROJO = ('#E23B3B', '#AE2427')
    PICO = ('#F4B740', '#C98A1C')
    o = []
    pats = []
    for x, y in ((90, 152), (112, 150)):
        pats += [f'M{x} {y} L{x} {y + 22}', f'M{x} {y + 22} L{x - 12} {y + 27}', f'M{x} {y + 22} L{x - 2} {y + 30}',
                 f'M{x} {y + 22} L{x + 8} {y + 27}']
    o += trazos(pats, '#EDB13F', 3.6)
    cola = suave([(120, 104), (126, 66), (140, 30, 'c'), (154, 54), (172, 36, 'c'), (180, 70), (174, 108), (146, 130)])
    o += forma(cola, *COLA, sh=(4, 3), dentro=[color_linea('M134 62 Q150 80 156 112', '#7A4A30', 3.5),
                                               color_linea('M160 62 Q170 84 168 108', '#7A4A30', 3.5)])
    o += forma('M42 52 C34 38 46 28 54 38 C52 22 68 20 70 34 C74 24 90 28 82 46 Z', *ROJO, sh=(3, 2))
    cuerpo = suave([(56, 40), (74, 40), (86, 56), (92, 80), (112, 94), (142, 98), (164, 108), (164, 128), (150, 148),
                    (122, 160), (92, 158), (66, 144), (52, 122), (50, 100), (44, 84), (36, 64), (42, 48)])
    o += forma(cuerpo, *CU, sh=(8, 7), dentro=[color_linea('M58 102 Q60 124 74 138', '#E6956A', 5)])
    ala = suave([(94, 110), (122, 100), (152, 108), (144, 130), (118, 140), (98, 130)])
    o += forma(ala, *ALA, sh=(4, 3), dentro=[color_linea('M106 124 Q124 128 140 118', '#6A2C10', 3),
                                             color_linea('M110 134 Q126 136 138 128', '#6A2C10', 3)])
    o += forma('M40 56 Q26 58 20 66 Q30 72 41 72 Z', *PICO, sh=(2, 2))
    o += forma(suave([(40, 72), (50, 74), (50, 88), (44, 96, 'c'), (38, 88)]), *ROJO, sh=(2, 2))
    o += ojo(56, 58, 4.4)
    return o


def pollito():
    AM = ('#F7D046', '#E0A522')
    o = []
    pats = []
    for x in (98, 122):
        pats += [f'M{x} 160 L{x} 176', f'M{x} 176 L{x - 10} 180', f'M{x} 176 L{x} 183', f'M{x} 176 L{x + 9} 180']
    o += trazos(pats, '#F08A2A', 3.6)
    o += forma(elipse(112, 118, 54, 50), *AM, sh=(8, 7), dentro=[color_linea('M74 128 Q78 148 96 160', '#FCE79A', 5)])
    o += forma(suave([(112, 112), (138, 104), (160, 112), (150, 132), (128, 138)]), '#F3C23A', '#D99A1C', sh=(3, 3))
    o += forma('M80 34 Q74 20 86 18 Q84 26 92 30 Q96 18 106 24 Q96 30 96 40 Z', *AM, sh=(2, 2))
    o += forma(elipse(84, 72, 36, 34), *AM, sh=(6, 5), dentro=[color_linea('M60 64 Q62 50 74 44', '#FCE79A', 5)])
    o += forma('M52 70 Q38 76 34 80 Q42 86 54 84 Z', '#F59A2E', '#C96E14', sh=(2, 2))
    o.append(f'<circle cx="70" cy="86" r="6" fill="#F49C7A" opacity="0.75"/>')
    o += ojo(72, 66, 4.8)
    return o


def vaca():
    BL = ('#F8F6F1', '#D6D1C6')
    NE = ('#36363A', '#1E1E21')
    ROSA = ('#F2A9A6', '#D7807D')
    o = []
    o += pata(80, 106, 162, 13, '#DCD7CC', '#B9B3A6', casco='#3E3A38')
    o += pata(132, 104, 162, 13, '#DCD7CC', '#B9B3A6', casco='#3E3A38')
    o += trazos(['M163 76 C172 86 172 104 171 120'], '#F8F6F1', 3.4)
    o += forma(suave([(164, 116), (178, 118), (180, 136, 'c'), (172, 132), (164, 138, 'c'), (162, 126)]), *NE, sh=(2, 2))
    o += forma(suave([(120, 116), (150, 116), (152, 132), (142, 142), (126, 142), (118, 130)]), *ROSA, sh=(3, 3))
    o += trazos(['M128 142 L128 150', 'M142 142 L142 150'], '#F2A9A6', 4)
    o += pata(64, 104, 168, 14, *BL, casco='#3E3A38')
    o += pata(146, 104, 168, 14, *BL, casco='#3E3A38')
    cuerpo = suave([(64, 66), (100, 66), (134, 60), (160, 64), (168, 82), (166, 108), (156, 124), (128, 126), (96, 128),
                    (70, 126), (58, 108), (56, 82)])
    manchas = [suave([(98, 64), (132, 60), (142, 78), (130, 98), (106, 98), (94, 82)]),
               suave([(60, 70), (80, 66), (90, 84), (78, 104), (62, 100)]),
               suave([(146, 64), (170, 70), (170, 98), (154, 104), (144, 86)])]
    dentro = []
    for m in manchas:
        dentro += forma(m, *NE, sh=(4, 4), contorno=False)
    o += forma(cuerpo, *BL, sh=(8, 7), dentro=dentro)
    # cabeza
    o += forma('M62 58 L86 52 Q88 58 66 72 Z', *NE, sh=(2, 2))
    o += forma('M24 60 L4 54 Q4 62 22 72 Z', *NE, sh=(2, 2))
    o += forma(suave([(30, 52), (26, 38), (32, 28, 'c'), (40, 40), (42, 52)]), '#EFE5C8', '#C8BC98', sh=(2, 2))
    o += forma(suave([(52, 50), (56, 38), (64, 28, 'c'), (64, 42), (62, 52)]), '#EFE5C8', '#C8BC98', sh=(2, 2))
    cabeza = suave([(36, 46), (58, 46), (70, 58), (70, 80), (60, 100), (46, 114), (26, 116), (14, 106), (16, 88), (22, 68),
                    (26, 54)])
    o += forma(cabeza, *BL, sh=(6, 5), dentro=forma(suave([(46, 44), (72, 52), (72, 80), (60, 88), (48, 76), (44, 60)]),
                                                     *NE, sh=(3, 3), contorno=False))
    o += forma(elipse(30, 106, 19, 13, -12), *ROSA, sh=(3, 3))
    o += [f'<ellipse cx="22" cy="106" rx="3" ry="4" fill="{INK}"/>', f'<ellipse cx="36" cy="103" rx="3" ry="4" fill="{INK}"/>']
    o += ojo(36, 74, 4.4)
    return o


def oveja():
    LANA = ('#F6F3EC', '#D5CEBF')
    NEG = ('#3E3936', '#25211F')
    o = []
    for x, y0, y1, c in ((88, 120, 160, 1), (140, 120, 160, 1), (72, 122, 166, 0), (154, 120, 166, 0)):
        o += pata(x, y0, y1, 10, *(('#4A4542', '#2F2B29') if c else NEG), casco='#1E1B1A', hc=7)
    o += forma(nube(110, 98, 58, 38, 13, 0.62, 0.2), *LANA, sh=(7, 6),
               dentro=[color_linea('M76 84 Q82 72 96 70', '#FFFFFF', 5)])
    o += forma(suave([(162, 86), (174, 82), (176, 96), (166, 100)]), *LANA, sh=(2, 2))
    # cabeza oscura con orejas de lado y copete de lana
    o += forma('M40 74 L16 70 Q16 80 38 84 Z', *NEG, sh=(2, 2))
    o += forma('M62 72 L82 62 Q86 72 64 82 Z', *NEG, sh=(2, 2))
    o += forma(suave([(48, 58), (64, 64), (66, 88), (56, 108), (42, 118), (30, 112), (28, 90), (34, 68)]), *NEG, sh=(5, 4),
               dentro=[color_linea('M36 84 Q38 72 46 66', '#5C5652', 4)])
    o += forma(nube(50, 62, 18, 11, 7, 0.62, 0.4), *LANA, sh=(3, 3))
    o += [f'<circle cx="42" cy="86" r="4.2" fill="#F2EEE6"/>', f'<circle cx="41" cy="87" r="2.4" fill="{INK}"/>',
          f'<ellipse cx="34" cy="112" rx="2.4" ry="3" fill="#1A1817"/>']
    return o


def cabra():
    PE = ('#D2A472', '#A87A49')
    PEO = ('#B88C5C', '#8F683E')
    o = []
    o += pata(84, 106, 162, 10, *PEO, casco='#3E3A38', hc=7)
    o += pata(128, 104, 162, 10, *PEO, casco='#3E3A38', hc=7)
    o += forma(suave([(146, 84), (156, 64), (164, 58, 'c'), (162, 74), (154, 92)]), *PE, sh=(2, 2))
    o += pata(68, 106, 168, 11, *PE, casco='#3E3A38', hc=8)
    o += pata(142, 104, 168, 11, *PE, casco='#3E3A38', hc=8)
    cuerpo = suave([(70, 78), (104, 82), (138, 76), (156, 82), (160, 100), (150, 116), (124, 120), (94, 122), (72, 118),
                    (62, 102), (62, 86)])
    o += forma(cuerpo, *PE, sh=(7, 6), dentro=[color_linea('M80 92 Q104 90 134 86', '#E8C79E', 5)])
    # cuernos (detrás de la cabeza)
    for dx in (0, 9):
        o += forma(suave([(36 + dx, 34), (40 + dx, 16), (54 + dx, 4), (68 + dx, 8, 'c'), (56 + dx, 14), (50 + dx, 26),
                          (48 + dx, 38)]), '#BDB096', '#8E8268', sh=(2, 2))
    cuello = suave([(64, 108), (50, 92), (42, 72), (28, 66), (14, 60), (10, 50), (18, 38), (34, 30), (50, 34), (60, 52),
                    (72, 72), (80, 88)])
    o += forma(cuello, *PE, sh=(6, 5), dentro=[color_linea('M24 40 Q32 34 40 34', '#E8C79E', 4)])
    o += forma('M50 42 L76 42 Q74 52 52 52 Z', *PEO, sh=(2, 2))
    o += forma(suave([(17, 60), (27, 64), (25, 78), (20, 86, 'c'), (17, 72)]), '#8C7258', '#6A5340', sh=(2, 2))
    o += ojo(32, 44, 3.8)
    o.append(f'<ellipse cx="13" cy="52" rx="2.2" ry="2.8" fill="{INK}"/>')
    return o


def cerdo():
    RO = ('#F5A9B3', '#DE7F8D')
    RO2 = ('#E9919E', '#C96E7C')
    o = []
    o += pata(92, 128, 156, 13, *RO2, casco='#B85E6C', hc=6)
    o += pata(128, 128, 156, 13, *RO2, casco='#B85E6C', hc=6)
    o += trazos(['M164 98 C178 94 182 80 172 78 C162 76 164 90 176 92'], '#F5A9B3', 3.6)
    o += pata(72, 128, 162, 14, *RO, casco='#C96E7C', hc=7)
    o += pata(146, 128, 162, 14, *RO, casco='#C96E7C', hc=7)
    o += forma(elipse(112, 104, 58, 40), *RO, sh=(8, 7), dentro=[color_linea('M84 76 Q104 68 126 68', '#FBD3D8', 5)])
    o += forma('M70 66 L84 40 Q94 56 88 74 Z', *RO2, sh=(2, 2))
    o += forma(elipse(58, 96, 33, 31), *RO, sh=(6, 5), dentro=[color_linea('M36 92 Q38 76 50 70', '#FBD3D8', 4.5)])
    o += forma('M44 70 L50 42 Q66 52 66 70 Z', *RO, sh=(3, 3))
    o += forma(elipse(28, 104, 11, 15), '#F09AA6', '#CF7584', sh=(2, 2))
    o += [f'<ellipse cx="25" cy="99" rx="2.2" ry="3.4" fill="#A9505E"/>',
          f'<ellipse cx="25" cy="110" rx="2.2" ry="3.4" fill="#A9505E"/>']
    o.append(f'<circle cx="54" cy="110" r="6" fill="#F07F90" opacity="0.6"/>')
    o += ojo(50, 88, 4.2)
    return o


def conejo():
    PE = ('#B39276', '#8B6C53')
    PEO = ('#9E7E63', '#7A5D45')
    o = []
    o += forma(suave([(70, 70), (78, 30), (90, 10, 'c'), (98, 32), (84, 74)]), *PEO, sh=(3, 3))
    o += forma(suave([(144, 128), (160, 120), (172, 132), (166, 148), (150, 148)]), '#F6F3EC', '#D5CEBF', sh=(3, 3))
    cuerpo = suave([(76, 92), (110, 84), (142, 98), (160, 128), (158, 158), (136, 174), (96, 176), (72, 166), (64, 136),
                    (64, 108)])
    o += forma(cuerpo, *PE, sh=(8, 7), dentro=[color_linea('M76 120 Q80 100 98 92', '#D2B79C', 5),
                                               tinta('M112 174 C106 146 128 124 152 138', SW * 0.8)])
    o += forma(elipse(124, 172, 30, 8), *PE, sh=(3, 2))
    o += forma(elipse(78, 170, 12, 7), *PE, sh=(2, 2))
    o += forma(elipse(58, 92, 30, 26, -8), *PE, sh=(5, 4), dentro=[color_linea('M36 86 Q40 74 52 70', '#D2B79C', 4)])
    o += forma(suave([(52, 72), (54, 28), (62, 8, 'c'), (74, 28), (68, 74)]), *PE, sh=(3, 3),
               dentro=[plano(suave([(58, 64), (60, 32), (63, 20, 'c'), (68, 34), (65, 64)]), '#EBA6A9')])
    o += ojo(54, 88, 4.4)
    o += [f'<ellipse cx="31" cy="96" rx="3.4" ry="2.6" fill="#E58E95"/>',
          color_linea('M30 102 L14 100', INK, 1.6), color_linea('M30 104 L16 108', INK, 1.6)]
    return o


def caballo():
    PE = ('#A6643A', '#7A4424')
    PEO = ('#8E5430', '#6A3A1E')
    CRIN = ('#3E2A1E', '#24170F')
    o = []
    o += pata(84, 108, 164, 11, *PEO, casco='#2E2A28', hc=8)
    o += pata(132, 108, 164, 11, *PEO, casco='#2E2A28', hc=8)
    o += forma(suave([(158, 82), (174, 90), (182, 122), (178, 150, 'c'), (168, 128), (160, 106)]), *CRIN, sh=(3, 3))
    o += pata(70, 108, 170, 12, *PE, casco='#2E2A28', hc=9)
    o += pata(146, 108, 170, 12, *PE, casco='#2E2A28', hc=9)
    cuerpo = suave([(74, 76), (106, 80), (138, 76), (160, 82), (166, 98), (158, 116), (136, 122), (102, 124), (76, 120),
                    (64, 104), (64, 88)])
    o += forma(cuerpo, *PE, sh=(7, 6), dentro=[color_linea('M80 90 Q110 88 140 86', '#C68559', 5)])
    o += forma(suave([(36, 22), (34, 8, 'c'), (44, 18)]), *PEO, sh=(2, 2))
    o += forma(suave([(44, 16), (46, 2, 'c'), (54, 14)]), *PE, sh=(2, 2))
    cuello = suave([(70, 112), (56, 94), (46, 74), (36, 72), (22, 78), (12, 72), (10, 60), (18, 46), (30, 30), (40, 18),
                    (52, 22), (62, 42), (78, 68), (82, 84)])
    o += forma(cuello, *PE, sh=(6, 5), dentro=[color_linea('M20 54 Q28 40 38 30', '#C68559', 4),
                                               plano(elipse(14, 68, 12, 10, 30), '#7A4424')])
    o += forma(suave([(42, 16), (54, 16), (68, 36), (82, 62), (86, 82, 'c'), (74, 70), (60, 48), (46, 28)]), *CRIN,
               sh=(3, 3))
    o += forma(suave([(40, 20), (48, 22), (40, 34, 'c'), (36, 26)]), *CRIN, sh=(1, 1))
    o += ojo(32, 42, 3.8)
    o.append(f'<ellipse cx="15" cy="64" rx="2.4" ry="3.2" fill="{INK}"/>')
    return o


def perro():
    PE = ('#D49A5A', '#AA7336')
    PEO = ('#BC8549', '#93622D')
    OREJA = ('#8E5A2E', '#6A3F1C')
    CREMA = ('#F3DDB8', '#D9BC8E')
    o = []
    o += pata(86, 114, 160, 12, *PEO)
    o += pata(128, 112, 160, 12, *PEO)
    o += forma(suave([(150, 96), (166, 78), (172, 56, 'c'), (180, 76), (162, 104)]), *PE, sh=(3, 3))
    o += pata(70, 114, 166, 13, *PE)
    o += pata(142, 112, 166, 13, *PE)
    o += forma(elipse(76, 164, 10, 6), *PE, sh=(2, 2))
    o += forma(elipse(148, 164, 10, 6), *PE, sh=(2, 2))
    cuerpo = suave([(74, 86), (110, 90), (142, 86), (160, 96), (162, 112), (148, 124), (110, 126), (82, 124), (66, 112),
                    (64, 96)])
    o += forma(cuerpo, *PE, sh=(7, 6), dentro=[plano(suave([(64, 100), (80, 104), (86, 122), (70, 124)]), CREMA[0]),
                                               color_linea('M84 98 Q110 98 138 94', '#ECC18C', 5)])
    o += forma('M58 78 L82 88 L76 102 L52 92 Z', '#D8443A', '#A9302A', sh=(2, 2))
    o.append(f'<circle cx="66" cy="98" r="4.4" fill="#F2C94C" stroke="{INK}" stroke-width="{SW * 0.8:.2f}"/>')
    cabeza = suave([(40, 44), (62, 46), (74, 62), (70, 84), (52, 94), (34, 94), (18, 88), (10, 76), (16, 64), (28, 58)])
    o += forma(cabeza, *PE, sh=(6, 5), dentro=[plano(elipse(24, 82, 16, 12), CREMA[0]),
                                               color_linea('M34 52 Q42 46 52 46', '#ECC18C', 4)])
    o += forma('M28 90 Q30 106 38 106 Q46 104 42 90 Z', '#EC7B86', '#C95B66', sh=(1, 1))
    o += [tinta('M18 86 Q28 92 40 88', SW * 0.85)]
    o += forma(elipse(13, 72, 6, 5), '#3A3533', '#1F1C1B', sh=(1, 1))
    o += forma(suave([(48, 46), (66, 44), (72, 62), (66, 88, 'c'), (54, 74)]), *OREJA, sh=(3, 3))
    o += ojo(38, 64, 4.2)
    return o


def gato():
    GR = ('#A3A099', '#7C7972')
    RAYA = '#5A5852'
    o = []
    cola = suave([(140, 166), (166, 156), (178, 128), (172, 104), (180, 98, 'c'), (188, 126), (178, 162), (148, 178)])
    o += forma(cola, *GR, sh=(3, 3), dentro=[color_linea('M176 112 L186 110', RAYA, 4), color_linea('M178 132 L188 134', RAYA, 4),
                                             color_linea('M170 154 L180 162', RAYA, 4)])
    cuerpo = suave([(70, 96), (100, 92), (128, 106), (150, 138), (154, 166), (136, 180), (96, 182), (74, 176), (66, 148),
                    (64, 118)])
    o += forma(cuerpo, *GR, sh=(8, 7), dentro=[color_linea('M118 104 Q128 118 124 132', RAYA, 5),
                                               color_linea('M134 122 Q144 138 138 152', RAYA, 5),
                                               color_linea('M102 98 Q110 110 106 120', RAYA, 5),
                                               color_linea('M78 120 Q84 106 96 102', '#C9C6BF', 5)])
    o += forma(elipse(132, 176, 22, 7), *GR, sh=(2, 2))
    for x in (74, 94):
        o += forma(rr(x, 126, 14, 56, 7), *GR, sh=(3, 1), dentro=[color_linea(f'M{x} 146 L{x + 14} 146', RAYA, 3),
                                                                 color_linea(f'M{x} 158 L{x + 14} 158', RAYA, 3)])
    o += forma('M50 58 L46 22 L76 42 Z', *GR, sh=(2, 2), dentro=[plano('M53 52 L51 32 L68 44 Z', '#EBA6A9')])
    o += forma('M92 42 L120 22 L118 58 Z', *GR, sh=(2, 2), dentro=[plano('M99 44 L115 32 L114 52 Z', '#EBA6A9')])
    cabeza = elipse(84, 70, 38, 32)
    o += forma(cabeza, *GR, sh=(6, 5), dentro=[color_linea('M76 40 L78 52', RAYA, 3.5), color_linea('M84 39 L84 52', RAYA, 3.5),
                                               color_linea('M92 40 L90 52', RAYA, 3.5),
                                               color_linea('M48 72 L58 74', RAYA, 3.5), color_linea('M110 74 L120 72', RAYA, 3.5),
                                               plano(elipse(84, 86, 16, 11), '#E9E6DF')])
    for x in (70, 98):
        o += [f'<ellipse cx="{x}" cy="68" rx="7" ry="7.5" fill="#B8D46A" stroke="{INK}" stroke-width="{SW * 0.8:.2f}"/>',
              f'<ellipse cx="{x}" cy="68" rx="2.2" ry="6" fill="{INK}"/>',
              f'<circle cx="{x - 2.5}" cy="65" r="1.5" fill="#FFFFFF"/>']
    o += [plano('M78 80 L90 80 L84 87 Z', '#E58E95'), tinta('M84 87 Q84 92 78 93', SW * 0.7), tinta('M84 87 Q84 92 90 93', SW * 0.7)]
    for s in (-1, 1):
        for dy in (-3, 3):
            o.append(color_linea(f'M{84 + s * 16} {88 + dy} L{84 + s * 40} {86 + dy * 2.4}', INK, 1.5))
    return o


# ───────────────────────── productos ─────────────────────────
def maiz():
    def mazorca():
        o = []
        o += forma(suave([(-10, 50), (-6, 20), (-18, -10), (-16, -2), (-12, 24), (-2, 54)]), '#8BBF55', '#5E9134', sh=(2, 2))
        cob = suave([(0, -76), (14, -64), (20, -26), (18, 20), (12, 48), (-12, 48), (-18, 20), (-20, -26), (-14, -64)])
        granos = []
        for fila in range(14):
            y = -72 + fila * 9
            for col in range(-2, 3):
                x = col * 9 + (4.5 if fila % 2 else 0)
                granos.append(f'<rect x="{x - 3.9:.1f}" y="{y:.1f}" width="7.8" height="7.6" rx="2.6" fill="#F9D24B"/>')
        sombra = '<rect x="9" y="-80" width="20" height="140" fill="#A86400" opacity="0.28"/>'
        brillo = '<rect x="-14" y="-60" width="5" height="96" rx="2.5" fill="#FFF3B8" opacity="0.7"/>'
        o += forma(cob, '#DFA022', dentro=granos + [sombra, brillo])
        o += forma(suave([(-4, 58), (-26, 30), (-34, -16, 'c'), (-14, 18), (4, 46)]), '#7DB547', '#548A2E', sh=(3, 2),
                   dentro=[color_linea('M-6 50 Q-20 26 -26 0', '#A6D774', 3)])
        o += forma(suave([(4, 58), (26, 28), (34, -22, 'c'), (14, 22), (-4, 48)]), '#6FA83D', '#4A7F27', sh=(3, 2))
        o += forma(rr(-6, 54, 12, 18, 4), '#B7C46A', '#8E9A44', sh=(2, 1))
        return o
    o = en(96, 98, 1.0, mazorca, rot=-32)
    for x, y, r in ((138, 166, 20), (156, 158, -15), (150, 176, 40)):
        o.append(f'<g transform="translate({x} {y}) rotate({r})">')
        o += forma('M-5 -5 Q0 -7 5 -5 Q6 1 0 6 Q-6 1 -5 -5 Z', '#F9D24B', '#D99A1C', sh=(1.5, 1.5))
        o.append('</g>')
    return o


def _espiga(cx, cy, ang, tallo, n, col, osc, barbas=0, ancho=5.2, alto=9.5, curva=0, gpaso=0.82, color_tallo='#C9A24A'):
    def piezas():
        o = []
        y0 = -tallo
        paso = alto * gpaso
        granos, barb = [], []
        for i in range(n):
            for lado in (-1, 1):
                gx = lado * ancho * 0.78 + curva * (i / n) ** 2
                gy = y0 - i * paso - (paso * 0.5 if lado > 0 else 0) - alto * 0.45
                granos.append((gx, gy, lado * 24))
                if barbas:
                    a = math.radians(lado * 13)
                    tx, ty = gx + lado * 2, gy - alto * 0.8
                    barb.append(f'M{tx:.1f} {ty:.1f} L{tx + math.sin(a) * barbas:.1f} {ty - math.cos(a) * barbas:.1f}')
        tope = (curva, y0 - n * paso - alto * 0.55, 0)
        if barbas:
            barb.append(f'M{tope[0]:.1f} {tope[1] - alto * 0.8:.1f} L{tope[0] + curva * 0.3:.1f} {tope[1] - alto * 0.8 - barbas:.1f}')
            o += [color_linea(b, '#9C8344', 1.9) for b in barb]
        o += trazos([f'M0 0 Q{curva * 0.3:.1f} {-tallo / 2:.1f} 0 {-tallo - 2:.1f}'], color_tallo, 3)
        for gx, gy, r in [tope] + granos[::-1]:
            o += forma(elipse(gx, gy, ancho, alto / 2 + 1.2, 90 + r), col, osc, sh=(1.6, 1.4))
        return o
    return en(cx, cy, 1.0, piezas, rot=ang)


def trigo():
    o = []
    o += forma(suave([(98, 176), (78, 150), (70, 126, 'c'), (90, 148), (104, 172)]), '#9DB24E', '#748A2E', sh=(2, 2))
    for ang in (-24, 24, 0):
        o += _espiga(100, 178, ang, 66, 8, '#E7B24A', '#B98428', barbas=7)
    o += forma(rr(86, 156, 28, 10, 4), '#C9463B', '#9A2F27', sh=(2, 2))
    return o


def cebada():
    o = []
    o += forma(suave([(98, 176), (120, 152), (130, 128, 'c'), (110, 150), (104, 172)]), '#B9C27A', '#8E9A52', sh=(2, 2))
    for ang, cur in ((-20, -6), (20, 6), (0, 3)):
        o += _espiga(100, 178, ang, 58, 7, '#EDDDA6', '#C9B377', barbas=38, ancho=4.4, alto=10, curva=cur,
                     color_tallo='#D9C98E')
    return o


def mezcla():
    rnd = random.Random(7)
    monte = 'M18 168 C34 128 66 92 100 90 C134 92 166 128 182 168 Q100 180 18 168 Z'
    granos = []

    def grano(x, y, tipo, rot):
        if tipo == 'maiz':
            d = 'M-6 -6 Q0 -8 6 -6 Q8 2 0 7 Q-8 2 -6 -6 Z'
            return [f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot})">'] + forma(d, '#F6C232', '#CF8E12', sh=(1.5, 1.5), sw=SW * 0.6) + ['</g>']
        if tipo == 'trigo':
            return forma(elipse(x, y, 4.2, 7, rot), '#C98F3C', '#9C6A24', sh=(1.2, 1.2), sw=SW * 0.6) + \
                [color_linea(f'M{x - 2.4 * math.sin(math.radians(rot)):.1f} {y + 2.4 * math.cos(math.radians(rot)) - 2.4:.1f} L{x:.1f} {y + 3:.1f}', '#8E5E1E', 1)]
        return forma(elipse(x, y, 3.4, 8, rot), '#EBDCA4', '#C4AE6E', sh=(1.2, 1.2), sw=SW * 0.6)

    puestos = []
    for fila in range(9):
        y = 98 + fila * 9.2
        mitad = 10 + (y - 90) * 1.0
        x = 100 - mitad
        while x < 100 + mitad:
            puestos.append((x + rnd.uniform(-2, 2), y + rnd.uniform(-2, 2)))
            x += 11 + rnd.uniform(-1, 1.5)
    tipos = ['maiz', 'trigo', 'cebada']
    for i, (x, y) in enumerate(puestos):
        granos += grano(x, y, tipos[(i * 7 + int(y)) % 3], rnd.randint(-70, 70))
    o = forma(monte, '#D8B064', '#B08840', sh=(6, 5), dentro=granos)
    for x, y, t, r in ((26, 176, 'maiz', 20), (172, 178, 'trigo', 70), (184, 170, 'cebada', 30), (14, 168, 'trigo', -40),
                       (160, 182, 'maiz', -30)):
        o += grano(x, y, t, r)
    return o


def remolacha():
    HO = ('#5FA845', '#3F7E2E')
    o = []
    for (tx, ty, rot, s) in ((-30, 0, -38, 1.0), (30, 0, 36, 1.0), (0, 0, 0, 1.12)):
        def hoja(rot=rot, s=s):
            return (trazos(['M0 0 L0 -26'], '#9CC46A', 3.6) +
                    forma(suave([(0, -22), (18, -40), (20, -66), (0, -92, 'c'), (-20, -66), (-18, -40)]), *HO, sh=(3, 3),
                          dentro=[color_linea('M0 -24 L0 -84', '#9BD06F', 2.6), color_linea('M0 -44 L10 -54', '#9BD06F', 2),
                                  color_linea('M0 -58 L-10 -68', '#9BD06F', 2)]))
        o += en(100 + tx * 0.2, 80, s, hoja, rot=rot)
    o += trazos(['M100 176 Q98 186 104 190'], '#E2D6BA', 2.4)
    raiz = suave([(66, 88), (100, 78), (136, 88), (142, 110), (128, 140), (110, 166), (101, 182, 'c'), (92, 166), (74, 140),
                  (60, 110)])
    o += forma(raiz, '#F0E6CF', '#CDBA94', sh=(7, 6), dentro=[
        plano('M50 70 Q100 90 150 70 L150 96 Q100 104 50 96 Z', '#D9D49A'),
        color_linea('M76 120 Q86 124 96 122', '#C2AE88', 2.4), color_linea('M108 140 Q114 142 120 138', '#C2AE88', 2.4),
        color_linea('M88 150 Q94 152 100 150', '#C2AE88', 2.4), color_linea('M72 104 Q74 120 82 132', '#FFFFFF', 5, 0.8)])
    return o


def patata():
    PA = ('#D7AB6C', '#A97C42')

    def pat(cx, cy, rx, ry, rot, sem):
        rnd = random.Random(sem)
        p = []
        for k in range(9):
            a = 2 * math.pi * k / 9
            f = 1 + rnd.uniform(-0.07, 0.07)
            x, y = rx * math.cos(a) * f, ry * math.sin(a) * f
            r = math.radians(rot)
            p.append((cx + x * math.cos(r) - y * math.sin(r), cy + x * math.sin(r) + y * math.cos(r)))
        ojos = []
        for _ in range(4):
            a = rnd.uniform(0, 2 * math.pi)
            ex, ey = cx + rx * 0.55 * math.cos(a), cy + ry * 0.5 * math.sin(a)
            ojos.append(color_linea(f'M{ex - 3:.1f} {ey:.1f} Q{ex:.1f} {ey + 2.4:.1f} {ex + 3:.1f} {ey:.1f}', '#7E5626', 2))
        ojos.append(color_linea(f'M{cx - rx * 0.6:.1f} {cy - ry * 0.2:.1f} Q{cx - rx * 0.45:.1f} {cy - ry * 0.65:.1f} {cx - rx * 0.05:.1f} {cy - ry * 0.7:.1f}',
                                '#F0D29E', 5, 0.9))
        return forma(suave(p), *PA, sh=(6, 5), dentro=ojos)
    return pat(70, 92, 44, 30, -18, 1) + pat(134, 98, 40, 29, 22, 2) + pat(102, 138, 50, 33, -4, 3)


def _cubo(x, y, s, rot=0):
    """Cristal de sal gorda: cubito visto desde arriba (tres caras)."""
    def p():
        top = 'M0 -7 L8 -3 L0 1 L-8 -3 Z'
        izq = 'M-8 -3 L0 1 L0 10 L-8 6 Z'
        der = 'M8 -3 L0 1 L0 10 L8 6 Z'
        return [lleno(izq, '#DCE5EC', SW * 0.6), lleno(der, '#B8C6D2', SW * 0.6), lleno(top, '#FFFFFF', SW * 0.6)]
    return en(x, y, s, p, rot=rot)


def sal():
    TELA = ('#E4D3B0', '#BCA67C')
    o = []
    saco = suave([(48, 104), (152, 104), (166, 140), (158, 176), (100, 186), (42, 176), (34, 140)])
    o += forma(saco, *TELA, sh=(7, 6), dentro=[color_linea('M50 126 Q44 150 54 170', '#F4E8CF', 5),
                                               color_linea('M78 120 Q74 150 80 178', '#CDB78C', 2.2),
                                               color_linea('M124 120 Q130 150 124 180', '#CDB78C', 2.2)])
    o += forma('M100 44 C124 44 148 72 154 104 Q100 114 46 104 C52 72 76 44 100 44 Z', '#F6F8FA', '#C9D3DC', sh=(5, 4),
               dentro=[color_linea('M66 92 Q72 70 88 58', '#FFFFFF', 5)])
    rnd = random.Random(4)
    for (x, y) in ((92, 56), (108, 58), (80, 70), (98, 70), (116, 72), (130, 84), (68, 86), (86, 84), (104, 86), (122, 98),
                   (56, 100), (74, 100), (92, 100), (140, 102), (110, 102)):
        o += _cubo(x + rnd.uniform(-2, 2), y + rnd.uniform(-2, 2), 0.85, rnd.randint(-20, 20))
    o += forma(suave([(40, 100), (100, 108), (160, 100), (165, 116), (100, 126), (35, 116)]), '#D9C49C', '#B39D70', sh=(3, 3),
               dentro=[color_linea('M44 108 Q100 116 156 108', '#EEDFC0', 3)])
    for (x, y, r) in ((30, 178, 12), (172, 172, -10), (184, 184, 20), (20, 188, -6)):
        o += _cubo(x, y, 0.85, r)
    return o


def abono():
    KR = ('#CB9A62', '#A27540')
    TI = ('#5B4130', '#3B2A1E')
    HO = ('#6DBE45', '#4A9A2E')
    o = []
    o += forma('M50 92 C66 70 134 70 150 92 Q100 104 50 92 Z', *TI, sh=(3, 3))
    for (x, y, r) in ((68, 86, 3), (84, 80, 2.4), (116, 80, 2.6), (132, 86, 3), (100, 84, 2.2)):
        o.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#7A5A44"/>')
    o += trazos(['M100 86 Q98 62 102 40'], '#5DAA3A', 3.6)
    o += forma(suave([(100, 58), (82, 44), (64, 44, 'c'), (76, 58), (98, 64)]), *HO, sh=(2, 2),
               dentro=[color_linea('M98 60 Q84 52 70 47', '#9BDA72', 2)])
    o += forma(suave([(102, 46), (118, 28), (140, 24, 'c'), (130, 42), (104, 52)]), *HO, sh=(2, 2),
               dentro=[color_linea('M104 48 Q120 34 134 28', '#9BDA72', 2)])
    saco = suave([(46, 96), (100, 102), (154, 96), (164, 136), (156, 178), (100, 186), (44, 178), (36, 136)])
    o += forma(saco, *KR, sh=(7, 6), dentro=[color_linea('M52 116 Q46 146 54 170', '#E2BC8A', 5),
                                             plano(elipse(100, 144, 30, 24), '#F4E9D2')])
    o += forma(suave([(100, 160), (86, 150), (82, 132, 'c'), (100, 136), (112, 148)]), *HO, sh=(2, 2))
    o += forma(suave([(100, 160), (114, 146), (122, 126, 'c'), (106, 132), (96, 148)]), '#8FD068', '#5FAF3E', sh=(2, 2))
    o += forma(suave([(40, 92), (100, 100), (160, 92), (164, 108), (100, 118), (36, 108)]), '#D8AE78', '#B08650', sh=(3, 3),
               dentro=[color_linea('M44 100 Q100 108 156 100', '#E8C898', 3)])
    return o


def hierba():
    rnd = random.Random(3)
    o = []
    o += forma('M52 176 C58 156 80 148 100 148 C122 148 144 156 150 176 Q100 186 52 176 Z', '#8A6142', '#664430', sh=(3, 3))

    def hoja(ang, largo, ancho, col, osc, curva):
        a = math.radians(ang)
        bx, by = 100 + math.sin(a) * 18, 166
        tx, ty = bx + math.sin(a) * largo + curva, by - math.cos(a) * largo
        mx, my = (bx + tx) / 2 + curva * 0.6, (by + ty) / 2
        nx, ny = math.cos(a), math.sin(a)
        d = (f'M{bx - nx * ancho:.1f} {by - ny * ancho:.1f} Q{mx - nx * ancho:.1f} {my - ny * ancho:.1f} {tx:.1f} {ty:.1f} '
             f'Q{mx + nx * ancho:.1f} {my + ny * ancho:.1f} {bx + nx * ancho:.1f} {by + ny * ancho:.1f} Z')
        return forma(d, col, osc, sh=(2, 1.5))
    # espigas de ray grass (detrás)
    for ang, largo, cur in ((-16, 132, -10), (14, 140, 8)):
        def espiga(largo=largo, cur=cur):
            o = trazos([f'M0 0 Q{cur:.1f} {-largo / 2:.1f} {cur * 1.2:.1f} {-largo:.1f}'], '#A9BC5A', 2.4)
            for i in range(6):
                t = 0.55 + i * 0.075
                x = cur * 1.2 * t * t
                y = -largo * t
                lado = 1 if i % 2 else -1
                o += forma(elipse(x + lado * 4.5, y, 6.5, 3, lado * 40), '#C9CC6E', '#9EA246', sh=(1, 1), sw=SW * 0.75)
            return o
        o += en(100, 168, 1.0, espiga, rot=ang)
    for k in range(9):
        ang = -62 + k * 15.5 + rnd.uniform(-4, 4)
        o += hoja(ang, rnd.uniform(70, 102) * (1 - abs(ang) / 260), 5.2, '#4E9A38', '#3A7A28', rnd.uniform(-14, 14))
    for k in range(8):
        ang = -54 + k * 15.5 + rnd.uniform(-4, 4)
        o += hoja(ang, rnd.uniform(54, 84) * (1 - abs(ang) / 300), 5.6, '#72BC4C', '#4F9A36', rnd.uniform(-12, 12))
    for (x, y, r) in ((40, 180, 30), (160, 182, -20), (172, 174, 50)):
        o += forma(elipse(x, y, 5.5, 2.8, r), '#C9CC6E', '#9EA246', sh=(1, 1), sw=SW * 0.75)
    return o


def diatomeas():
    PO = ('#F3EEE2', '#D6CCB4')
    o = []
    o += forma('M24 166 C40 128 72 98 100 98 C128 98 160 128 176 166 Q100 178 24 166 Z', *PO, sh=(7, 6),
               dentro=[color_linea('M48 148 Q62 122 84 110', '#FFFFFF', 6, 0.9)])
    # cacillo de medir de acero clavado en el montón
    o += trazos(['M150 112 L184 66'], '#AEB8C2', 7)
    o += forma(suave([(118, 116), (150, 104), (160, 134), (144, 150), (124, 148)]), '#C9D1D9', '#8893A0', sh=(4, 3),
               dentro=[color_linea('M126 124 L130 142', '#EEF2F5', 4)])
    o += forma(elipse(134, 110, 17, 7, -20), '#F3EEE2', '#D6CCB4', sh=(1, 1))
    o += forma('M120 112 C126 96 140 94 150 104 Z', *PO, sh=(2, 2))
    return o


def _abanico(cx, cy, r, col, osc, rot=0):
    """Concha entera de abanico (vieira) con sus costillas y las dos orejitas de la charnela."""
    def p():
        o = []
        o += forma('M-12 -2 L-22 4 L-20 12 L-6 10 Z', col, osc, sh=(1.5, 1.5))
        o += forma('M12 -2 L22 4 L20 12 L6 10 Z', col, osc, sh=(1.5, 1.5))
        borde = []
        n = 7
        for k in range(n + 1):
            a = math.radians(-160 + 140 * k / n)
            borde.append((r * math.cos(a), 6 + r * math.sin(a)))
        d = 'M0 12'
        for k in range(n + 1):
            x, y = borde[k]
            if k == 0:
                d += f' L{x:.1f} {y:.1f}'
            else:
                px, py = borde[k - 1]
                d += f' A{r * 0.33:.1f} {r * 0.33:.1f} 0 0 1 {x:.1f} {y:.1f}'
        d += ' Z'
        costillas = [color_linea(f'M0 10 L{x * 0.9:.1f} {6 + (y - 6) * 0.9:.1f}', osc, 2.4) for x, y in borde[1:-1]]
        o += forma(d, col, osc, sh=(4, 3), dentro=costillas + [color_linea(f'M{-r * 0.5:.1f} {6 - r * 0.62:.1f} '
                                                                          f'Q{-r * 0.1:.1f} {6 - r * 0.86:.1f} {r * 0.3:.1f} {6 - r * 0.78:.1f}',
                                                                          '#FFFFFF', 3.5)])
        return o
    return en(cx, cy, 1.0, p, rot=rot)


def concha():
    """Puñado de cascarilla de ostra: trocitos curvos de concha blanca y gris amontonados, y una concha entera delante."""
    rnd = random.Random(21)
    COLS = [('#F6F4EE', '#CFCBC0'), ('#C3C8CD', '#8E959C'), ('#ECE6D8', '#C4B89E'), ('#A9AFB5', '#7C848C'),
            ('#FAF8F4', '#D6D2C8'), ('#DADDE0', '#A9AFB4')]
    puestos = []
    for fila, (y, n) in enumerate(((66, 1), (82, 3), (100, 4), (118, 5), (138, 6), (158, 6))):
        ancho = 26 * (n - 1)
        for i in range(n):
            puestos.append((100 - ancho / 2 + i * 26 + rnd.uniform(-4, 4) + (6 if fila % 2 else 0), y + rnd.uniform(-3, 3)))
    o = []
    for k, (cx, cy) in enumerate(puestos):
        r0 = rnd.uniform(14, 17)
        rot = rnd.uniform(-40, 40)
        col = COLS[(k * 5 + int(cy) // 9) % len(COLS)]
        def trozo(r0=r0, col=col):
            # astilla curva: borde de arriba en arco, de abajo quebrado
            d = (f'M{-r0:.1f} 2 Q{-r0 * 0.4:.1f} {-r0 * 0.95:.1f} {r0 * 0.7:.1f} {-r0 * 0.45:.1f} L{r0:.1f} {r0 * 0.25:.1f} '
                 f'L{r0 * 0.35:.1f} {r0 * 0.5:.1f} L{-r0 * 0.2:.1f} {r0 * 0.3:.1f} L{-r0 * 0.6:.1f} {r0 * 0.55:.1f} Z')
            vetas = [color_linea(f'M{-r0 * 0.7:.1f} {2 - j * 5:.1f} Q{-r0 * 0.1:.1f} {-r0 * 0.5 - j * 4:.1f} {r0 * 0.7:.1f} {-j * 4:.1f}',
                                 col[1], 2.2) for j in range(2)]
            return forma(d, *col, sh=(2.5, 2.5), dentro=vetas)
        o += en(cx, cy, 1.0, trozo, rot=rot)
    o += _abanico(142, 150, 32, '#F4F0E8', '#C9C1B0', rot=10)
    return o


def fila_de(y):
    return int(y // 12)


def arido():
    AR = ('#DDB97C', '#B28C54')
    o = []
    o += trazos(['M126 66 L152 12'], '#C8925A', 7)
    o += forma(rr(142, 4, 24, 9, 4.5), '#C8925A', '#9A6A38', sh=(2, 2))
    o += forma(suave([(100, 70), (142, 80), (144, 88), (134, 120), (118, 134, 'c'), (100, 112), (98, 80)]), '#A7B0BA',
               '#717B86', sh=(5, 4), dentro=[color_linea('M108 82 L106 108', '#E4E9EE', 4.5)])
    o += forma(rr(114, 58, 20, 16, 4), '#8893A0', '#5D6670', sh=(2, 2))
    monte = 'M14 170 C30 126 62 92 96 92 C132 92 168 128 186 170 Q100 182 14 170 Z'
    piedras = []
    rnd = random.Random(5)
    for _ in range(26):
        y = rnd.uniform(104, 172)
        mitad = (y - 92) * 1.05 + 6
        x = rnd.uniform(96 - mitad, 96 + mitad)
        c = rnd.choice(('#9AA3AD', '#B9A68A', '#8C8278', '#C9B89C'))
        piedras.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{rnd.uniform(3, 5.5):.1f}" ry="{rnd.uniform(2.2, 3.6):.1f}" '
                       f'fill="{c}" stroke="{INK}" stroke-width="{SW * 0.5:.2f}"/>')
    o += forma(monte, *AR, sh=(7, 6), dentro=piedras + [color_linea('M40 150 Q60 118 84 102', '#F0D6A8', 6, 0.9)])
    return o


# ───────────────────────── pegatinas de proveedor ─────────────────────────
def _saco_d(x, y, w, h):
    return (f'M{x + 4} {y} Q{x + w / 2} {y + 7} {x + w - 4} {y} L{x + w + 2} {y + 10} '
            f'C{x + w + 9} {y + h * 0.35} {x + w + 9} {y + h * 0.7} {x + w + 2} {y + h - 8} L{x + w - 4} {y + h} '
            f'Q{x + w / 2} {y + h - 6} {x + 4} {y + h} L{x - 2} {y + h - 8} C{x - 9} {y + h * 0.7} {x - 9} {y + h * 0.35} '
            f'{x - 2} {y + 10} Z')


def _saco(x, y, w, h, base, osc, franja, papel_brillo):
    """Saco de papel de pie, con costura arriba y una franja de color; la sombra de la derecha pasa también por la franja."""
    d = _saco_d(x, y, w, h)
    fy = y + h * 0.55
    dentro = [f'<path d="M{x - 12} {fy} Q{x + w / 2} {fy + 6} {x + w + 12} {fy} L{x + w + 12} {fy + 26} '
              f'Q{x + w / 2} {fy + 32} {x - 12} {fy + 26} Z" fill="{franja}"/>',
              f'<path d="{d} {_saco_d(x - 9, y - 6, w, h)}" fill="#1E2A22" fill-rule="evenodd" opacity="0.16"/>',
              color_linea(f'M{x + 10} {y + 24} Q{x + 4} {y + h * 0.5} {x + 10} {y + h - 20}', papel_brillo, 6, 0.9),
              f'<path d="M{x + 2} {y + 14} Q{x + w / 2} {y + 21} {x + w - 2} {y + 14}" fill="none" stroke="{INK}" '
              f'stroke-width="{SW * 0.7:.2f}" stroke-dasharray="4 4"/>']
    return forma(d, base, osc, sh=(9, 6), dentro=dentro)


def prov_piensos():
    o = _saco(40, 20, 104, 158, '#EADBB6', '#C7AF82', '#2FAE66', '#F7EED8')
    o += en(92, 98, 0.62, gallina)
    return o


def prov_morteros():
    o = _saco(36, 20, 108, 158, '#C3C6C8', '#93989C', '#D8443A', '#E2E5E7')
    # paleta de albañil apoyada delante: hoja de acero en punta, cuello y mango de madera
    o += forma(suave([(112, 178, 'c'), (124, 140), (152, 116), (172, 116, 'c'), (170, 136), (150, 162)]), '#C9D1D9', '#8893A0',
               sh=(4, 3), dentro=[color_linea('M124 160 Q140 134 160 124', '#EEF2F5', 4)])
    o += trazos(['M162 122 L170 108 L178 102'], '#6F7883', 3.4)
    o += forma(suave([(172, 104), (184, 80), (192, 70), (196, 76), (186, 98), (178, 108)]), '#C8925A', '#9A6A38', sh=(2, 2))
    return o


DIBUJOS = {
    'gallina': gallina, 'pollito': pollito, 'vaca': vaca, 'oveja': oveja, 'cabra': cabra, 'cerdo': cerdo,
    'conejo': conejo, 'caballo': caballo, 'perro': perro, 'gato': gato,
    'maiz': maiz, 'trigo': trigo, 'cebada': cebada, 'mezcla': mezcla, 'remolacha': remolacha, 'patata': patata,
    'sal': sal, 'abono': abono, 'hierba': hierba, 'diatomeas': diatomeas, 'concha': concha, 'arido': arido,
}
PROVEEDORES = {'st-prov-piensos': prov_piensos, 'st-prov-morteros': prov_morteros}


# ───────────────────────── salida ─────────────────────────
def baja(im, dy):
    """La sombra, dy píxeles más abajo (sin que lo que sale por abajo reaparezca arriba)."""
    out = Image.new(im.mode, im.size, 0)
    out.paste(im.crop((0, 0, im.width, im.height - dy)), (0, dy))
    return out


def ajusta(fn, caja, centro):
    """Escala y centra el dibujo para que su contorno ocupe «caja» unidades (de 200) en su lado mayor."""
    global SW
    SW = SW0
    a = np.array(svg_png(''.join(fn()), 800).split()[3])
    ys, xs = np.nonzero(a > 8)
    x0, x1, y0, y1 = xs.min() / 4, (xs.max() + 1) / 4, ys.min() / 4, (ys.max() + 1) / 4
    w, h = x1 - x0, y1 - y0
    s = min(caja / max(w, h), caja * 0.94 / math.sqrt(w * h))  # lo muy cuadrado, algo más pequeño
    SW = SW0 / s
    cuerpo = (f'<g transform="translate({centro[0]} {centro[1]}) scale({s:.4f}) '
              f'translate({-(x0 + x1) / 2:.2f} {-(y0 + y1) / 2:.2f})">' + ''.join(fn()) + '</g>')
    SW = SW0
    return cuerpo


def svg_png(cuerpo, px):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{px}" height="{px}">{cuerpo}</svg>'
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=px, output_height=px))).convert('RGBA')


def tarjeta(fn, lado=480, ocupa=0.80):
    """Dibujo centrado en un cuadrado blanco, todos al mismo tamaño aparente y con el mismo grosor de trazo."""
    cuerpo = ajusta(fn, 200 * ocupa, (100, 98.5))
    k = 2  # se dibuja al doble y se reduce: bordes más finos
    px = lado * k
    im = svg_png(cuerpo, px)
    dentro = np.array(im.split()[3]) > 10
    R, C = 11.5 * k, 10 * k  # borde blanco (como el de 25 px a 512 de las otras pegatinas) y suavizado de entrantes
    lejos = ndimage.distance_transform_edt(~dentro)
    hinchado = lejos <= R + C
    borde = np.clip(ndimage.distance_transform_edt(hinchado) - C, 0, 1)
    borde = np.maximum(borde, dentro.astype(float))
    borde = Image.fromarray((borde * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0 * k))
    sombra = borde.filter(ImageFilter.GaussianBlur(6.5 * k)).point(lambda v: int(v * 0.28))
    lienzo = Image.new('RGBA', (px, px), (255, 255, 255, 255))
    sh = Image.new('RGBA', (px, px), (20, 35, 26, 255))
    sh.putalpha(baja(sombra, int(7.5 * k)))
    lienzo = Image.alpha_composite(lienzo, sh)
    bl = Image.new('RGBA', (px, px), (255, 255, 255, 255))
    bl.putalpha(borde)
    lienzo = Image.alpha_composite(Image.alpha_composite(lienzo, bl), im)
    return lienzo.convert('RGB').resize((lado, lado), Image.LANCZOS)


def pegatina_proveedor(fn):
    """Igual que tools/pegatinas-gas.py: 512 → borde de 25 px y sombra, reducida a 256, fondo transparente."""
    S = 512
    im = svg_png(ajusta(fn, 154, (100, 95)), S)
    a = im.split()[3]
    borde = a.point(lambda v: 255 if v > 10 else 0).filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.GaussianBlur(1.2))
    sombra = borde.filter(ImageFilter.GaussianBlur(7)).point(lambda v: int(v * 0.28))
    lienzo = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sh = Image.new('RGBA', (S, S), (20, 35, 26, 255))
    sh.putalpha(baja(sombra, 8))
    lienzo = Image.alpha_composite(lienzo, sh)
    bl = Image.new('RGBA', (S, S), (255, 255, 255, 255))
    bl.putalpha(borde)
    lienzo = Image.alpha_composite(Image.alpha_composite(lienzo, bl), im)
    return lienzo.resize((256, 256), Image.LANCZOS)


def hoja_contacto(fotos, ruta, cols=6, celda=200):
    filas = (len(fotos) + cols - 1) // cols
    hoja = Image.new('RGB', (cols * celda, filas * (celda + 30)), (242, 244, 240))
    try:
        letra = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
    except OSError:
        letra = ImageFont.load_default()
    dib = ImageDraw.Draw(hoja)
    for i, (nombre, im) in enumerate(fotos):
        x, y = (i % cols) * celda, (i // cols) * (celda + 30)
        t = im.convert('RGBA').resize((celda - 12, celda - 12), Image.LANCZOS)
        fondo = Image.new('RGBA', t.size, (242, 244, 240, 255))
        hoja.paste(Image.alpha_composite(fondo, t).convert('RGB'), (x + 6, y + 6))
        ancho = dib.textlength(nombre, font=letra)
        dib.text((x + (celda - ancho) / 2, y + celda + 4), nombre, fill=(43, 47, 44), font=letra)
    hoja.save(ruta)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    hoja = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--hoja=')), None)
    out = args[0]
    solo = set(args[1:])
    os.makedirs(out, exist_ok=True)
    arriba = os.path.dirname(os.path.normpath(out)) or '.'
    fotos = []
    for nombre, fn in DIBUJOS.items():
        ruta = os.path.join(out, f'{nombre}.webp')
        if not solo or nombre in solo:
            tarjeta(fn).save(ruta, quality=88, method=6)
            print(nombre)
        if hoja and os.path.exists(ruta):
            fotos.append((nombre, Image.open(ruta)))
    for nombre, fn in PROVEEDORES.items():
        ruta = os.path.join(arriba, f'{nombre}.png')
        if not solo or nombre in solo:
            pegatina_proveedor(fn).save(ruta)
            print(nombre)
        if hoja and os.path.exists(ruta):
            fotos.append((nombre, Image.open(ruta)))
    if hoja:
        hoja_contacto(fotos, hoja)
        print('hoja:', hoja)


if __name__ == '__main__':
    main()
