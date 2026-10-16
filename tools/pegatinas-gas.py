"""Pegatinas de la tarifa de bombonas de gas (oct. 2026), con el mismo acabado que tools/pegatinas-catalogo.py
(vector plano, trazo grafito, borde blanco recortado y sombra suave). Bombonas genéricas, sin marcas ni logos.

    python3 tools/pegatinas-gas.py frontend/public/catalogo
"""
import io
import os
import sys

import cairosvg
from PIL import Image, ImageChops, ImageFilter

OUT = sys.argv[1]
INK = '#2B2F2C'
SW = 2.6
NARANJA = ('#F28C28', '#D9701A', '#F7B266')   # cuerpo, sombra, brillo
AZUL = ('#2F7FD0', '#1F5FA3', '#7DB3E8')
ROJO = ('#D8443A', '#A9302A', '#EE8A82')
METAL = ('#C9D1D9', '#8893A0')


def r(x, y, w, h, fill, rx=0, sw=SW):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>'


def bombona(x, y, s, col):
    """Bombona doméstica (la de 12,5 kg): cuerpo con hombros redondos, asa con dos huecos, válvula y aro de pie.
    (x, y) es la esquina de arriba a la izquierda del asa; s, la escala (1 = 96 de ancho)."""
    c, osc, br = col
    w = 96 * s
    cx = x + w / 2
    top = y + 34 * s
    o = []
    # aro de pie
    o.append(r(x + 6 * s, y + 140 * s, w - 12 * s, 14 * s, osc, 3 * s))
    # cuerpo
    o.append(f'<path d="M{x} {y + 146 * s} L{x} {top + 30 * s} Q{x} {top} {cx} {top - 2 * s} Q{x + w} {top} {x + w} {top + 30 * s} '
             f'L{x + w} {y + 146 * s} Z" fill="{c}" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>')
    # sombra a la derecha y brillo a la izquierda
    o.append(f'<path d="M{x + w - 18 * s} {top + 14 * s} Q{x + w - 4 * s} {top + 22 * s} {x + w - 3 * s} {top + 34 * s} '
             f'L{x + w - 3 * s} {y + 144 * s} L{x + w - 18 * s} {y + 144 * s} Z" fill="{osc}" opacity="0.55"/>')
    o.append(f'<rect x="{x + 12 * s}" y="{top + 30 * s}" width="{9 * s}" height="{70 * s}" rx="{4.5 * s}" fill="{br}"/>')
    # soldadura de en medio
    o.append(f'<line x1="{x}" y1="{y + 96 * s}" x2="{x + w}" y2="{y + 96 * s}" stroke="{INK}" stroke-width="2"/>')
    # válvula (se ve por el hueco del asa)
    o.append(r(cx - 8 * s, y + 10 * s, 16 * s, 26 * s, METAL[0], 3 * s, 2))
    o.append(r(cx - 11 * s, y + 6 * s, 22 * s, 7 * s, METAL[1], 2 * s, 2))
    # asa: aro con dos huecos
    ax, aw, ay, ah = x + 16 * s, w - 32 * s, y, 40 * s
    hueco = lambda hx: (f'M{hx + 4 * s} {ay + 12 * s} h{18 * s} a{4 * s} {4 * s} 0 0 1 {4 * s} {4 * s} v{10 * s} '
                        f'a{4 * s} {4 * s} 0 0 1 -{4 * s} {4 * s} h-{18 * s} a{4 * s} {4 * s} 0 0 1 -{4 * s} -{4 * s} v-{10 * s} '
                        f'a{4 * s} {4 * s} 0 0 1 {4 * s} -{4 * s} Z')
    rx = 12 * s
    exterior = (f'M{ax + rx} {ay} h{aw - 2 * rx} a{rx} {rx} 0 0 1 {rx} {rx} v{ah - rx} h-{aw} v-{ah - rx} '
                f'a{rx} {rx} 0 0 1 {rx} -{rx} Z')
    o.append(f'<path d="{exterior} {hueco(ax + 4 * s)} {hueco(ax + aw - 30 * s)}" fill="{c}" fill-rule="evenodd" '
             f'stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>')
    return o


def camping(x, y, s, col):
    """Bombona de camping: cuerpo bajo y redondo, cuello y válvula arriba."""
    c, osc, br = col
    w = 74 * s
    cx = x + w / 2
    o = [r(x + 8 * s, y + 92 * s, w - 16 * s, 10 * s, osc, 3 * s),
         r(cx - 11 * s, y + 8 * s, 22 * s, 22 * s, METAL[0], 3 * s, 2),
         r(cx - 15 * s, y, 30 * s, 11 * s, METAL[1], 4 * s, 2),
         r(x, y + 24 * s, w, 74 * s, c, 30 * s),
         f'<path d="M{x + w - 16 * s} {y + 34 * s} Q{x + w - 3 * s} {y + 48 * s} {x + w - 3 * s} {y + 62 * s} '
         f'Q{x + w - 4 * s} {y + 84 * s} {x + w - 18 * s} {y + 92 * s} Z" fill="{osc}" opacity="0.55"/>',
         f'<rect x="{x + 10 * s}" y="{y + 42 * s}" width="{8 * s}" height="{36 * s}" rx="{4 * s}" fill="{br}"/>']
    return o


def art(nombre):
    if nombre == 'gas-butano':  # butano y propano: la bombona de casa
        return bombona(52, 24, 1.0, NARANJA)
    if nombre == 'gas-camping':  # camping: grande azul y pequeña roja
        return camping(30, 56, 1.15, AZUL) + camping(116, 92, 0.78, ROJO)
    if nombre == 'prov-gas':  # la tarifa entera: bombona de casa y una de camping delante
        return bombona(34, 18, 0.98, NARANJA) + camping(118, 98, 0.82, AZUL)
    raise KeyError(nombre)


S = 512
for nm in ['prov-gas', 'gas-butano', 'gas-camping']:
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{S}" height="{S}">' + ''.join(art(nm)) + '</svg>'
    im = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=S, output_height=S))).convert('RGBA')
    a = im.split()[3]
    borde = a.point(lambda v: 255 if v > 10 else 0).filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.GaussianBlur(1.2))
    sombra = borde.filter(ImageFilter.GaussianBlur(7)).point(lambda v: int(v * 0.28))
    lienzo = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sh = Image.new('RGBA', (S, S), (20, 35, 26, 255)); sh.putalpha(ImageChops.offset(sombra, 0, 8))
    lienzo = Image.alpha_composite(lienzo, sh)
    bl = Image.new('RGBA', (S, S), (255, 255, 255, 255)); bl.putalpha(borde)
    lienzo = Image.alpha_composite(Image.alpha_composite(lienzo, bl), im)
    lienzo.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, f'st-{nm}.png'))
print('ok')
