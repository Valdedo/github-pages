import math, io, os, sys
import cairosvg
from PIL import Image, ImageFilter, ImageChops

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
INK = '#2B2F2C'
SW = 2.6

def pts(p):
    return ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)

def poly(p, fill, sw=SW):
    return f'<polygon points="{pts(p)}" fill="{fill}" stroke="{INK}" stroke-width="{sw}" stroke-linejoin="round"/>'

def shift(p, d):
    return [(x + d[0], y + d[1]) for x, y in p]

def extrude(p, d, front, side, back):
    out = [poly(shift(p, d), back)]
    n = len(p)
    for i in range(n):
        a, b = p[i], p[(i + 1) % n]
        out.append(poly([a, b, (b[0] + d[0], b[1] + d[1]), (a[0] + d[0], a[1] + d[1])], side))
    out.append(poly(p, front))
    return out

_cid = [0]
def hole(inner, d, wall, dark):
    _cid[0] += 1
    cid = f'c{_cid[0]}'
    return [f'<clipPath id="{cid}"><polygon points="{pts(inner)}"/></clipPath>',
            f'<g clip-path="url(#{cid})"><polygon points="{pts(inner)}" fill="{wall}"/>',
            f'<polygon points="{pts(shift(inner, (d[0]*0.35, d[1]*0.35)))}" fill="{dark}"/></g>',
            f'<polygon points="{pts(inner)}" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>']

def circle(c, r, fill, sw=SW):
    return f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{r:.1f}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>'

def cyl(c, r, d, front, side, back, wall=None, dark=None, rin=None):
    L = math.hypot(*d); n = (-d[1] / L, d[0] / L)
    a = (c[0] + r * n[0], c[1] + r * n[1]); b = (c[0] - r * n[0], c[1] - r * n[1])
    a2 = (a[0] + d[0], a[1] + d[1]); b2 = (b[0] + d[0], b[1] + d[1])
    o = [circle((c[0] + d[0], c[1] + d[1]), r, back),
         f'<polygon points="{pts([a, a2, b2, b])}" fill="{side}" stroke="none"/>',
         f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{a2[0]:.1f}" y2="{a2[1]:.1f}" stroke="{INK}" stroke-width="{SW}"/>',
         f'<line x1="{b[0]:.1f}" y1="{b[1]:.1f}" x2="{b2[0]:.1f}" y2="{b2[1]:.1f}" stroke="{INK}" stroke-width="{SW}"/>',
         circle(c, r, front)]
    if rin:
        _cid[0] += 1; cid = f'c{_cid[0]}'
        o += [f'<clipPath id="{cid}"><circle cx="{c[0]}" cy="{c[1]}" r="{rin}"/></clipPath>',
              f'<g clip-path="url(#{cid})"><circle cx="{c[0]}" cy="{c[1]}" r="{rin}" fill="{wall}"/>',
              f'<circle cx="{c[0]+d[0]*0.35}" cy="{c[1]+d[1]*0.35}" r="{rin}" fill="{dark}"/></g>',
              f'<circle cx="{c[0]}" cy="{c[1]}" r="{rin}" fill="none" stroke="{INK}" stroke-width="{SW}"/>']
    return o

# palettes
STEEL = ('#9AA3AD', '#6F7883', '#4B525A')
BLACK = ('#5D6166', '#3E4246', '#2B2F2C')
GALV = ('#D5DCE3', '#AEB8C2', '#8893A0')
D = (52, -34)

def I_shape(x, y, w, h, tw, tf, taper):
    cx = x + w / 2
    return [(x, y), (x + w, y), (x + w, y + tf), (cx + tw / 2, y + tf + taper), (cx + tw / 2, y + h - tf - taper),
            (x + w, y + h - tf), (x + w, y + h), (x, y + h), (x, y + h - tf), (cx - tw / 2, y + h - tf - taper),
            (cx - tw / 2, y + tf + taper), (x, y + tf)]

def sq(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]

def wave_sheet(colors):
    light, mid, dark = colors
    d2 = (62, -52)
    xs = [22 + i * 3 for i in range(40)]
    front = [(x, 150 + (x - 22) * 0.22 + 8 * math.sin((x - 22) / 117 * 4 * math.pi)) for x in xs]
    o = []
    seg = 10
    for i in range(0, len(front) - 1, seg // 2):
        s = front[i:i + seg // 2 + 1]
        if len(s) < 2: continue
        slope = s[-1][1] - s[0][1] - (s[-1][0] - s[0][0]) * 0.22
        col = light if slope < 0 else mid
        o.append(f'<polygon points="{pts(s + shift(s[::-1], d2))}" fill="{col}" stroke="none"/>')
    outline = front + shift(front[::-1], d2)
    o.append(f'<polygon points="{pts(outline)}" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>')
    o.append(f'<polyline points="{pts(front)}" fill="none" stroke="{INK}" stroke-width="{SW}"/>')
    return o

def art(name):
    if name == 'viga-ipn':
        return extrude(I_shape(40, 70, 56, 104, 9, 12, 7), D, *STEEL)
    if name == 'viga-ipe':
        return extrude(I_shape(42, 72, 52, 100, 7, 10, 0), D, *STEEL)
    if name == 'viga-heb':
        return extrude(I_shape(28, 74, 92, 92, 11, 14, 0), D, *STEEL)
    if name == 'upn':
        x, y, w, h, tw, tf = 46, 70, 50, 104, 12, 13
        return extrude([(x, y), (x + w, y), (x + w, y + tf), (x + tw, y + tf), (x + tw, y + h - tf), (x + w, y + h - tf), (x + w, y + h), (x, y + h)], D, *STEEL)
    if name == 'angulo':
        x, y, w, h, t = 40, 80, 84, 84, 13
        return extrude([(x, y), (x + t, y), (x + t, y + h - t), (x + w, y + h - t), (x + w, y + h), (x, y + h)], D, *BLACK)
    if name == 'pletina':
        return extrude(sq(22, 128, 104, 16), (66, -48), *BLACK)
    if name == 'tubo-cuadrado':
        return extrude(sq(34, 82, 86, 86), D, *BLACK) + hole(sq(45, 93, 64, 64), D, '#4A4F55', '#141617')
    if name == 'tubo-rectangular':
        return extrude(sq(22, 100, 108, 64), D, *BLACK) + hole(sq(32, 110, 88, 44), D, '#4A4F55', '#141617')
    if name == 'tubo-galv':
        return extrude(sq(34, 82, 86, 86), D, *GALV) + hole(sq(44, 92, 66, 66), D, '#9AA5B1', '#3E454C')
    if name == 'tubo-redondo-galv':
        return cyl((76, 128), 44, D, *GALV, wall='#9AA5B1', dark='#4B525A', rin=36)
    if name == 'tubo-iso':
        o = cyl((70, 134), 40, (62, -40), *GALV, wall='#9AA5B1', dark='#4B525A', rin=31)
        n = (40 / 73.8, 62 / 73.8)
        for t in [0.34, 0.42, 0.50, 0.58]:
            cx, cy = 70 + 62 * t, 134 - 40 * t
            o.insert(3, f'<line x1="{cx+40*n[0]:.1f}" y1="{cy+40*n[1]:.1f}" x2="{cx-40*n[0]:.1f}" y2="{cy-40*n[1]:.1f}" stroke="{INK}" stroke-width="2.2"/>')
        return o
    if name == 'chapa':
        top = [(20, 128), (110, 158), (182, 98), (92, 72)]
        return [poly([(20, 128), (110, 158), (110, 168), (20, 138)], '#6F7883'),
                poly([(110, 158), (182, 98), (182, 108), (110, 168)], '#4B525A'),
                poly(top, '#B9C1CA'),
                f'<line x1="44" y1="122" x2="150" y2="96" stroke="#E6EAEE" stroke-width="5" stroke-linecap="round"/>']
    if name == 'chapa-ondulada':
        return wave_sheet(GALV)
    if name == 'redondo':
        return cyl((60, 140), 26, (84, -56), *STEEL) + [circle((60, 140), 14, '#B4BCC5', 0)]
    if name == 'malla':
        o = [poly(sq(28, 70, 14, 112), '#2E7A49'), poly(sq(158, 70, 14, 112), '#2E7A49')]
        o.append(f'<rect x="42" y="80" width="116" height="84" fill="#E3EEE6" stroke="{INK}" stroke-width="{SW}"/>')
        for i in range(1, 6):
            x = 42 + i * 116 / 6
            o.append(f'<line x1="{x:.1f}" y1="80" x2="{x:.1f}" y2="164" stroke="#1E5A36" stroke-width="3.2"/>')
        for j in range(1, 4):
            y = 80 + j * 84 / 4
            o.append(f'<line x1="42" y1="{y:.1f}" x2="158" y2="{y:.1f}" stroke="#1E5A36" stroke-width="3.2"/>')
        o.append(f'<rect x="42" y="80" width="116" height="84" fill="none" stroke="#1E5A36" stroke-width="5"/>')
        o.append(f'<rect x="42" y="80" width="116" height="84" fill="none" stroke="{INK}" stroke-width="{SW}"/>')
        o += [poly(sq(26, 62, 18, 10), '#1E5A36'), poly(sq(156, 62, 18, 10), '#1E5A36')]
        return o
    # proveedores
    if name == 'prov-hierros':
        dd = (34, -24); o_back = []; o_front = []
        for (x, y, cols) in [(64, 66, STEEL), (26, 120, BLACK), (98, 120, BLACK)]:
            e = extrude(sq(x, y, 56, 56), dd, *cols)
            o_back += e[:-1]; o_front.append(e[-1])
            o_front += hole(sq(x + 8, y + 8, 40, 40), dd, '#4A4F55', '#141617')
        return o_back + o_front
    if name == 'prov-pladur':
        o = []
        for k, top in enumerate([150, 132, 114]):
            o += extrude([(18, top), (112, top + 26), (112, top + 38), (18, top + 12)], (66, -50), '#E9E2D2', '#CFC6B2', '#B8AE98')
        return o
    if name == 'prov-dinak':
        o = [f'<rect x="72" y="60" width="56" height="120" fill="#C9D1D9" stroke="{INK}" stroke-width="{SW}"/>',
             f'<rect x="84" y="60" width="10" height="120" fill="#EEF2F5"/>',
             f'<ellipse cx="100" cy="180" rx="28" ry="9" fill="#AEB8C2" stroke="{INK}" stroke-width="{SW}"/>',
             f'<rect x="72" y="118" width="56" height="8" fill="#8893A0" stroke="{INK}" stroke-width="2"/>',
             poly([(54, 62), (146, 62), (100, 30)], '#AEB8C2'),
             f'<rect x="92" y="62" width="16" height="10" fill="#4B525A" stroke="{INK}" stroke-width="2"/>']
        return o
    if name == 'prov-zabaleta':
        return cyl((70, 132), 40, (70, -46), '#E8783E', '#C95A24', '#A3461A', wall='#B9501F', dark='#5A2A12', rin=33)
    if name == 'prov-isoltubex':
        o = cyl((100, 112), 14, (60, -40), '#E0975A', '#B86A31', '#8E4F22')
        o += cyl((70, 132), 44, (60, -40), '#3B3F44', '#2A2D31', '#1F2124', wall='#24272A', dark='#151618', rin=17)
        o += cyl((44, 149), 14, (26, -17), '#E0975A', '#B86A31', '#8E4F22')
        o.append(circle((44, 149), 8, '#8E4F22', 0))
        return o
    raise KeyError(name)

NAMES = ['viga-ipn', 'viga-ipe', 'viga-heb', 'upn', 'angulo', 'pletina', 'tubo-cuadrado', 'tubo-rectangular', 'tubo-galv',
         'tubo-redondo-galv', 'tubo-iso', 'chapa', 'chapa-ondulada', 'redondo', 'malla',
         'prov-hierros', 'prov-pladur', 'prov-dinak', 'prov-zabaleta', 'prov-isoltubex']

S = 512
for nm in NAMES:
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="{S}" height="{S}">' + ''.join(art(nm)) + '</svg>'
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=S, output_height=S)
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    a = im.split()[3]
    border = a.point(lambda v: 255 if v > 10 else 0).filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.GaussianBlur(1.2))
    shadow = border.filter(ImageFilter.GaussianBlur(7)).point(lambda v: int(v * 0.28))
    canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sh = Image.new('RGBA', (S, S), (20, 35, 26, 255)); sh.putalpha(ImageChops.offset(shadow, 0, 8))
    canvas = Image.alpha_composite(canvas, sh)
    wh = Image.new('RGBA', (S, S), (255, 255, 255, 255)); wh.putalpha(border)
    canvas = Image.alpha_composite(canvas, wh)
    canvas = Image.alpha_composite(canvas, im)
    canvas = canvas.resize((256, 256), Image.LANCZOS)
    canvas.save(os.path.join(OUT, f'st-{nm}.png'))
    open(os.path.join(OUT, f'st-{nm}.svg'), 'w').write(svg)

# contact sheet
tiles = [Image.open(os.path.join(OUT, f'st-{n}.png')) for n in NAMES]
cols = 5
sheet = Image.new('RGBA', (cols * 256, ((len(tiles) + cols - 1) // cols) * 256), (243, 241, 234, 255))
for i, t in enumerate(tiles):
    sheet.alpha_composite(t, ((i % cols) * 256, (i // cols) * 256))
sheet.save(os.path.join(OUT, '..', 'stickers_sheet.png'))
print('ok')
