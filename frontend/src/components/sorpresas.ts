/*
 * Sorpresas del arranque (en pruebas, solo el encargado). Cada una se monta encima de la escena normal:
 * usa el mismo logo (y el camión, en la grúa) y añade sus piezas (sorpresasEscena.ts).
 *   carga · grúa · pala · carretilla · pintor · orbayu
 * Salen primero las que todavía no has visto (una por apertura); después, 1 de cada 10 al azar.
 * Para ver una concreta: abrir la app con ?sorpresa=<nombre>.
 */
import { getRol } from '../auth';
import { conHuevoCarga } from './huevoCarga';
import {
  c01, seg, lerp, easeOut, easeIn, easeInOut, easeOutBack, muelle,
  LOGO, ESC, SUELO, montar, montarHuevo,
} from './pegatinaMotor';
import { FILTROS_S, CAPA_GRUA, CAPA_PALA, CAPA_CARR, CAPA_PINTOR, CAPA_ORBAYU, CENTROS_FRANJAS } from './sorpresasEscena';

export type Sorpresa = 'carga' | 'grua' | 'pala' | 'carretilla' | 'pintor' | 'orbayu';
const ORDEN: Sorpresa[] = ['carga', 'grua', 'pala', 'carretilla', 'pintor', 'orbayu'];
const CLAVE = 'cfSorpresasVistas';

export function eligeSorpresa(): Sorpresa | null {
  if (getRol() !== 'admin') return null;
  const pedida = new URLSearchParams(window.location.search).get('sorpresa') as Sorpresa | null;
  if (pedida && ORDEN.includes(pedida)) return pedida;
  try {
    const vistas: string[] = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    if (localStorage.getItem('cfHuevoCarga') && !vistas.includes('carga')) vistas.push('carga');
    const nueva = ORDEN.find(s => !vistas.includes(s));
    if (nueva) { vistas.push(nueva); localStorage.setItem(CLAVE, JSON.stringify(vistas)); return nueva; }
  } catch { /* sin almacenamiento: solo al azar */ }
  return Math.random() < 1 / 10 ? ORDEN[Math.floor(Math.random() * ORDEN.length)] : null;
}

// ---------------------------------------------------------------- montaje de la escena
const ANTES_CAMION = '<g id="cfp-camion"';
const ANTES_GOLPE = '<g id="cfp-golpe"';
const conFiltros = (e: string) => e.replace('<defs>', '<defs>' + FILTROS_S);

function escenaGrua(e: string) {
  const a = e.indexOf('<rect x="186" y="30"');
  const finTxt = '<path d="M179 97 Q182 102 185 97"';
  const b = e.indexOf('/>', e.indexOf(finTxt)) + 2;
  if (a < 0 || b < 2) return e;
  e = e.slice(0, a) + '<g id="cfp-gPleg">' + e.slice(a, b) + '</g>' + e.slice(b);
  return e.replace('<g id="cfp-r1">', '<g id="cfp-gTele" opacity="0"></g>'
    + '<g id="cfp-enCaja" opacity="0" transform="translate(113 57) scale(.45)"><g filter="url(#cfp-pegaS)"><use href="#cfp-arte"/></g></g>'
    + '<g id="cfp-r1">').replace(ANTES_GOLPE, CAPA_GRUA + ANTES_GOLPE);
}

export function escenaSorpresa(s: Sorpresa, escena: string): string {
  if (s === 'carga') return conHuevoCarga(escena);
  const e = conFiltros(escena);
  switch (s) {
    case 'grua': return escenaGrua(e);
    case 'pala': return e.replace(ANTES_GOLPE, CAPA_PALA + ANTES_GOLPE);
    case 'carretilla': return e.replace(ANTES_CAMION, CAPA_CARR + ANTES_CAMION);
    case 'pintor': return e.replace(ANTES_GOLPE, CAPA_PINTOR + ANTES_GOLPE);
    case 'orbayu': return e.replace(ANTES_GOLPE, CAPA_ORBAYU + ANTES_GOLPE);
  }
}

export function montarSorpresa(s: Sorpresa, svg: SVGSVGElement, pre: string) {
  switch (s) {
    case 'carga': return montarHuevo(svg, pre);
    case 'grua': return montarGrua(svg, pre);
    case 'pala': return montarPala(svg, pre);
    case 'carretilla': return montarCarretilla(svg, pre);
    case 'pintor': return montarPintor(svg, pre);
    case 'orbayu': return montarOrbayu(svg, pre);
  }
}

// ---------------------------------------------------------------- utilidades
type P = [number, number];
const rotv = (x: number, y: number, deg: number): P => {
  const r = deg * Math.PI / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};
/** Inclinación por aceleración (como el camión de siempre). */
function incl(f: (t: number) => number, t: number, k = 0.0011) {
  const h = 1 / 120, x = f(t);
  return Math.max(-7, Math.min(7, -(f(t + h) - 2 * x + f(t - h)) / (h * h) * k));
}
/** Sale acelerando hacia la derecha a partir de t0 (con un pequeño amago hacia atrás). */
const arranca = (x0: number, dt: number, amago = 10) =>
  x0 - (dt < .18 ? amago * Math.sin(dt / .18 * Math.PI) : 0) + (dt > .12 ? 1300 * Math.pow(dt - .12, 2.2) : 0);

function texto(at: (id: string, k: string, v: string | number) => void, id: string, t: number, t0: number, t1: number,
  x: number, y: number, rot = 0) {
  const on = t >= t0 && t < t1;
  const k = seg(t, t0, t0 + .18), o = seg(t, t1 - .15, t1);
  at(id, 'opacity', on ? 1 - o : 0);
  at(id, 'transform', `translate(${x} ${y}) rotate(${rot}) scale(${easeOutBack(k, 2.4)})`);
}

// ================================================================ 1 · La grúa se lleva el logo
const XG = 292;
const PLEG: P = [195, 24];                                    // punta de la pluma recogida (coords del camión)

function grua(tip: P, cable: number) {
  const px = 195, py = 64, [tx, ty] = tip;
  const L = Math.max(30, Math.hypot(tx - px, ty - py));
  const ang = Math.atan2(ty - py, tx - px) * 180 / Math.PI;
  const hy = ty + cable;
  return '<rect x="186" y="56" width="18" height="56" rx="8" fill="#D93A30"/><rect x="186" y="56" width="7" height="56" rx="3.5" fill="#B82E26"/>'
    + `<g transform="translate(${px} ${py}) rotate(${ang})">`
    + `<rect x="${L * .45}" y="-5" width="${L * .55 + 5}" height="10" rx="5" fill="#E2453C"/>`
    + `<rect x="${L - 6}" y="-6" width="10" height="12" rx="3" fill="#B82E26"/>`
    + `<rect x="-9" y="-8" width="${L * .55 + 9}" height="16" rx="8" fill="#D93A30"/>`
    + `<rect x="-9" y="-8" width="${L * .55 + 9}" height="5" rx="2.5" fill="#E85A50"/></g>`
    + `<circle cx="${px}" cy="${py}" r="7.5" fill="#B82E26"/><circle cx="${px}" cy="${py}" r="2.8" fill="#F4D9D6"/>`
    + `<path d="M${tx} ${ty} V${hy}" stroke="#3A3F3A" stroke-width="2"/>`
    + `<rect x="${tx - 4}" y="${hy - 2}" width="8" height="7" rx="2" fill="#FFD25A"/>`
    + `<path d="M${tx} ${hy + 5} v5 q0 7 6 7 q5 0 6 -6" stroke="#3A3F3A" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
}

function montarGrua(svg: SVGSVGElement, pre: string) {
  const base = montar(svg, pre), { q, at } = base;
  const T_E1 = .9, T_UP0 = .95, T_UP1 = 1.5, T_TIR = 1.8, T_BAJA = 3.0, T_CAJA = 3.45, T_REC = 3.95, DUR = 5.0;
  const xT = (t: number) => t < T_E1 ? lerp(-260, XG, easeOutBack(seg(t, 0, T_E1), .6)) : t < T_REC ? XG : arranca(XG, t - T_REC);
  const loc = (w: P): P => [(w[0] - XG) / ESC + 172, (w[1] - SUELO) / ESC + 151];
  const ANC: P = [90, 4];                                      // esquina de la «O», donde engancha
  const A0: P = [LOGO.x + ANC[0], LOGO.y + ANC[1]];
  const A3: P = [300, 112];
  const CAJA: P = [XG + (113 - 172) * ESC, SUELO + (57 - 151) * ESC], S_CAJA = .45 * ESC;
  const desdeAncla = (A: P, rot: number, s: number): P => { const v = rotv(ANC[0] * s, ANC[1] * s, rot); return [A[0] - v[0], A[1] - v[1]]; };
  const anclaDe = (c: P, rot: number, s: number): P => { const v = rotv(ANC[0] * s, ANC[1] * s, rot); return [c[0] + v[0], c[1] + v[1]]; };
  const colgado = (t: number) => {                             // T_TIR..T_BAJA
    const k = easeInOut(seg(t, T_TIR, T_BAJA));
    const A: P = [lerp(A0[0], A3[0], k), lerp(A0[1] - 8, A3[1], k)];
    const rot = lerp(-5, -24, k) + muelle(t - T_TIR, 10, 7, 1.6), s = lerp(1, .5, k);
    return { c: desdeAncla(A, rot, s), rot, s };
  };
  const logoEn = (t: number) => {
    if (t < T_UP1) return { c: [LOGO.x, LOGO.y] as P, rot: 0, s: 1 };
    if (t < T_TIR) {
      const k = easeOut(seg(t, T_UP1, T_TIR)), rot = -5 * k;
      return { c: desdeAncla([A0[0], A0[1] - 8 * k], rot, 1), rot, s: 1 };
    }
    if (t < T_BAJA) return colgado(t);
    const k = easeInOut(seg(t, T_BAJA, T_CAJA)), a = colgado(T_BAJA - 1e-4);
    return { c: [lerp(a.c[0], CAJA[0], k), lerp(a.c[1], CAJA[1], k)] as P, rot: lerp(a.rot, 0, k), s: lerp(a.s, S_CAJA, k) };
  };
  const puntaPara = (A: P): P => { const l = loc(A); return [l[0] - 5, l[1] - 16 - 10]; };
  const puntaCaja = () => { const L = logoEn(T_CAJA - 1e-4); return puntaPara(anclaDe(L.c, L.rot, L.s)); };

  const completa = (t: number) => {
    base.ponCamion(xT(t), incl(xT, t));
    // logo
    const L = logoEn(t);
    if (t < T_CAJA) base.ponLogo(L.c[0], L.c[1], L.rot, L.s); else base.ponLogo(0, 0, 0, 1, 0);
    at('enCaja', 'opacity', t >= T_CAJA ? 1 : 0);
    // grúa
    let tip: P | null = null;
    if (t >= T_UP0 && t < T_UP1) { const k = easeInOut(seg(t, T_UP0, T_UP1)), d = puntaPara(A0); tip = [lerp(PLEG[0], d[0], k), lerp(PLEG[1], d[1], k)]; }
    else if (t >= T_UP1 && t < T_CAJA) tip = puntaPara(anclaDe(L.c, L.rot, L.s));
    else if (t >= T_CAJA && t < T_REC - .05) { const k = easeInOut(seg(t, T_CAJA, T_REC - .05)), d = puntaCaja(); tip = [lerp(d[0], PLEG[0], k), lerp(d[1], PLEG[1], k)]; }
    at('gPleg', 'opacity', tip ? 0 : 1);
    at('gTele', 'opacity', tip ? 1 : 0);
    if (tip) q('gTele').innerHTML = grua(tip, 10);
    texto(at, 'tClacG', t, T_UP1, T_UP1 + .55, 90, 150, -8);
  };
  return { ...base, completa, dura: DUR };
}

// ================================================================ 2 · La pala lo tapa de arena
const AM = '#F2B92E', AM2 = '#D99A1E', GRAF = '#2A3330', ARENA = '#E2C27D', ARENA2 = '#C9A45E';
const CAZO = 1.35;                                             // cazo de delante más grande
const S_PALA = 0.9;

function brazoPala(brazo: number, cazo: number, carga: 0 | 1 | 2, asoma: boolean): { svg: string, e: P } {
  const P0: P = [96, -96], LA = 112;
  const ex = P0[0] + LA * Math.cos(brazo * Math.PI / 180), ey = P0[1] + LA * Math.sin(brazo * Math.PI / 180);
  const mx = P0[0] + (ex - P0[0]) * .45, my = P0[1] + (ey - P0[1]) * .45;
  let cz = '';
  if (carga === 1) cz += `<path d="M0 6 Q20 -20 46 10 Q24 16 0 6 Z" fill="${ARENA}"/>`
    + [[14, -2], [24, -6], [30, 2], [20, 4]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${ARENA2}"/>`).join('');
  if (carga === 2) {
    if (asoma) cz += '<g transform="translate(28 -26) rotate(24) scale(.26)"><g filter="url(#cfp-pegaS)"><use href="#cfp-arte"/></g></g>';
    cz += `<path d="M-2 8 Q10 -30 30 -26 Q48 -22 48 10 Q24 16 -2 8 Z" fill="${ARENA}"/>`
      + [[10, -8], [22, -18], [34, -10], [26, 0], [38, 2]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${ARENA2}"/>`).join('');
  }
  cz += `<path d="M0 -8 L-4 16 Q-2 22 4 22 H40 L48 10 L40 12 L8 12 Z" fill="${AM}"/>`
    + `<path d="M40 22 L48 10" stroke="${GRAF}" stroke-width="3" stroke-linecap="round"/>`;
  const svg = `<path d="M124 -62 L${mx} ${my}" stroke="#8D948F" stroke-width="6" stroke-linecap="round"/>`
    + `<path d="M${P0[0]} ${P0[1]} L${ex} ${ey}" stroke="${AM}" stroke-width="14" stroke-linecap="round"/>`
    + `<circle cx="${P0[0]}" cy="${P0[1]}" r="5" fill="${AM2}"/>`
    + `<g transform="translate(${ex} ${ey}) rotate(${cazo}) scale(${CAZO})">${cz}</g><circle cx="${ex}" cy="${ey}" r="4" fill="${AM2}"/>`;
  return { svg, e: [ex, ey] };
}

function montarPala(svg: SVGSVGElement, pre: string) {
  const base = montar(svg, pre), { q, at } = base;
  const DUR = 5.7;
  const LG = { x: 296, y: 206, rot: 8, s: .62 };               // donde queda el logo en el suelo
  const xP = (t: number) => {
    if (t < 1.0) return lerp(-260, 40, easeOut(seg(t, 0, 1.0)));
    if (t < 2.35) return lerp(40, 80, easeInOut(seg(t, 1.75, 2.35)));
    if (t < 3.5) return lerp(80, 20, easeInOut(seg(t, 3.0, 3.4)));
    if (t < 4.6) return lerp(20, 150, easeInOut(seg(t, 3.5, 4.05)));
    return arranca(150, t - 4.6, 6);
  };
  const completa = (t: number) => {
    // --- logo: tiembla, se despega y cae
    if (t < 1.0) {
      const k = seg(t, .3, 1.0);
      base.ponLogo(LOGO.x + Math.sin(t * 61) * 2 * k, LOGO.y + Math.sin(t * 53) * k, Math.sin(t * 47) * 2.2 * k, 1);
    } else if (t < 1.1) {
      const k = easeOut(seg(t, 1.0, 1.1));
      base.ponLogo(LOGO.x, LOGO.y - 6 * k, 0, 1 + .04 * k);
    } else if (t < 4.0) {
      const k = seg(t, 1.1, 1.55), d = t - 1.55;
      const y = t < 1.55 ? lerp(LOGO.y - 6, LG.y, easeIn(k)) : LG.y - Math.abs(muelle(d, 9, 20, 9));
      const rot = t < 1.55 ? lerp(0, LG.rot, k) + Math.sin(k * Math.PI) * 22 : LG.rot + muelle(d, 5, 24, 7);
      base.ponLogo(lerp(LOGO.x, LG.x, t < 1.55 ? easeOut(k) : 1), y, rot, lerp(1.04, LG.s, c01(k)));
    } else base.ponLogo(0, 0, 0, 1, 0);

    // --- pala
    let brazo = 40, cazo = 0, carga: 0 | 1 | 2 = 1;
    if (t >= 1.75 && t < 2.35) brazo = lerp(40, -38, easeInOut(seg(t, 1.75, 2.35)));
    else if (t >= 2.35 && t < 3.0) { brazo = -38; cazo = lerp(0, 80, easeInOut(seg(t, 2.35, 2.7))); carga = cazo < 30 ? 1 : 0; }
    else if (t >= 3.0 && t < 3.4) { const k = easeInOut(seg(t, 3.0, 3.4)); brazo = lerp(-38, 42, k); cazo = lerp(80, 0, k); carga = 0; }
    else if (t >= 3.4 && t < 3.9) { brazo = 42; carga = 0; }
    else if (t >= 3.9) { const k = easeInOut(seg(t, 4.15, 4.5)); brazo = lerp(42, 30, k); cazo = lerp(0, -10, k); carga = 2; }
    const x0 = xP(t);
    const bache = t < 1.0 ? -Math.abs(Math.sin(t * 18)) * 2.2 * (1 - seg(t, .7, 1.0)) : 0;
    const rot = t < 1.0 ? Math.sin(t * 30) * 1.2 * (1 - seg(t, .7, 1.0)) : incl(xP, t, 0.0006);
    at('pala', 'transform', `translate(${x0} ${SUELO + bache}) rotate(${rot}) scale(${S_PALA})`);
    const b = brazoPala(brazo, cazo, carga, t >= 3.9);
    q('palaBrazo').innerHTML = b.svg;
    const giro = x0 / 30 * 180 / Math.PI;
    q('pr1').setAttribute('transform', `rotate(${giro})`); q('pr2').setAttribute('transform', `rotate(${giro * 30 / 21})`);
    at('palaFaro', 'opacity', Math.floor(t * 5) % 2 ? 1 : .55);

    // --- chorro de arena
    const lip = rotv(46 * CAZO, 14 * CAZO, cazo);
    const lx = x0 + (b.e[0] + lip[0]) * S_PALA, ly = SUELO + (b.e[1] + lip[1]) * S_PALA;
    const kc = seg(t, 2.45, 2.62), kf = seg(t, 2.85, 3.05);
    if (t >= 2.45 && t < 3.05) {
      const top = lerp(ly, 186, kf), bx = 268, by = lerp(ly + (200 - ly) * kc, 190, kf);
      at('chorro', 'opacity', 1);
      at('chorro', 'd', `M${lx - 6} ${top} Q${lx + 2} ${(top + by) / 2} ${bx - 20} ${by} L${bx + 22} ${by} Q${lx + 26} ${(top + by) / 2} ${lx + 14} ${top} Z`);
    } else at('chorro', 'opacity', 0);

    // --- montón: crece con el chorro y desaparece al recogerlo
    let sx = 0, sy = 0, cx = 289;
    if (t >= 2.5 && t < 3.75) { const k = easeOut(seg(t, 2.5, 3.05)); sx = lerp(.55, 1, k); sy = k; }
    else if (t >= 3.75 && t < 4.15) { const k = easeIn(seg(t, 3.75, 4.15)); sx = sy = 1 - k; cx = 392; }
    at('monton', 'opacity', sy > 0 ? 1 : 0);
    at('monton', 'transform', `translate(${cx} ${SUELO}) scale(${sx} ${sy}) translate(${-cx} ${-SUELO})`);

    // --- polvo y textos
    const kp = seg(t, 2.95, 3.6);
    for (const [id, x, y] of [['pp1', 178, SUELO - 6], ['pp2', 370, SUELO - 4]] as const) {
      at(id, 'opacity', t >= 2.95 && kp < 1 ? 1 - kp : 0);
      at(id, 'transform', `translate(${x + (id === 'pp1' ? -14 : 10) * kp} ${y}) scale(${.6 + kp * .8})`);
    }
    texto(at, 'tBrum', t, .15, 1.2, 300, 176 + Math.sin(t * 40) * 1.5, 6);
    texto(at, 'tPlof', t, 2.95, 3.6, 300, 140, -6);
  };
  return { ...base, completa, dura: DUR };
}

// ================================================================ 3 · La carretilla lo descuelga
function montarCarretilla(svg: SVGSVGElement, pre: string) {
  const base = montar(svg, pre), { q, at } = base;
  const X3 = LOGO.x - 96 * ESC, DUR = 4.9;
  const xC = (t: number) => t < 3.5 ? lerp(-150, X3, easeOutBack(seg(t, 0, .9), .8)) : arranca(X3, t - 3.5, 6);
  const alto = (t: number) => {                                  // [extensión del mástil, altura de las horquillas]
    if (t < 1.8) { const k = easeInOut(seg(t, 1.0, 1.8)); return [104 * k, 158.3 * k]; }
    if (t < 2.0) return [104, 158.3 + 4 * easeOut(seg(t, 1.8, 2.0))];
    const k = easeInOut(seg(t, 2.0, 3.4)); return [lerp(104, 0, k), lerp(162.3, 12, k)];
  };
  const completa = (t: number) => {
    const x = xC(t), [e, h] = alto(t);
    at('carr2', 'transform', `translate(${x} ${SUELO}) rotate(${incl(xC, t, .0008)} 40 0) scale(${ESC})`);
    at('m3', 'y', -86 - e); at('m2', 'y', -86 - e / 2);
    at('horq2', 'transform', `translate(0 ${-h})`);
    const giro = x / 12 * 180 / Math.PI;
    q('c2r1').setAttribute('transform', `rotate(${giro})`); q('c2r2').setAttribute('transform', `rotate(${giro})`);
    at('faro2', 'opacity', t >= 3.4 ? (Math.floor((t - 3.4) * 6) % 2 ? .35 : 1) : .35);
    // logo: quieto hasta que lo pinchan; luego va en las horquillas y encoge al bajar
    const fx = x + 96 * ESC, fy = SUELO + (-6 - h) * ESC;
    if (t < 1.8) base.ponLogo(LOGO.x, LOGO.y);
    else {
      const k = easeInOut(seg(t, 2.0, 3.4)), s = lerp(1, .55, k);
      const tamb = t < 3.4 ? Math.sin((t - 2.0) * 9) * 9 * Math.sin(Math.PI * c01((t - 2.0) / 1.4)) : 0;
      base.ponLogo(fx + 22 * k, fy - 41.6 * s - 2, tamb + muelle(t - 3.5, 4, 18, 5), s);
    }
    texto(at, 'tDuda', t, .8, 1.5, x + 36 * ESC, SUELO - 112);
    texto(at, 'tClac', t, 1.8, 2.3, 320, 140, 8);
    texto(at, 'tUy', t, 2.3, 3.1, x + 20, SUELO - 140 + 30 * seg(t, 2.3, 3.1), -8);
  };
  return { ...base, completa, dura: DUR };
}

// ================================================================ 4 · El pintor
function montarPintor(svg: SVGSVGElement, pre: string) {
  const base = montar(svg, pre), { q, at } = base;
  const S = 1.2, T0 = 1.25, PASO = .3, BAJA = .22, N = CENTROS_FRANJAS.length;
  const T_FIN = T0 + N * PASO, DUR = 5.1;
  const yRod = (t: number) => {                                  // altura del rodillo y franja en curso
    if (t < T0) return { i: 0, y: 8 };
    const i = Math.min(N - 1, Math.floor((t - T0) / PASO)), u = Math.min(PASO, t - T0 - i * PASO);
    return { i, y: u < BAJA ? lerp(8, 108, easeInOut(u / BAJA)) : lerp(108, 8, (u - BAJA) / (PASO - BAJA)), sube: u >= BAJA };
  };
  const xPint = (t: number) => {
    if (t < T0) return lerp(-40, CENTROS_FRANJAS[0] - 24, easeOut(seg(t, 0, 1.0)));
    if (t < T_FIN) {
      const f = (t - T0) / PASO, i = Math.min(N - 1, Math.floor(f)), j = Math.min(N - 1, i + 1);
      const u = c01((t - T0 - i * PASO - BAJA) / (PASO - BAJA));
      return lerp(CENTROS_FRANJAS[i], CENTROS_FRANJAS[j], easeInOut(u)) - 24;
    }
    return t < 3.9 ? CENTROS_FRANJAS[N - 1] - 24 : lerp(CENTROS_FRANJAS[N - 1] - 24, 470, easeIn(seg(t, 3.9, 5.0)));
  };
  const completa = (t: number) => {
    base.ponLogo(LOGO.x, LOGO.y);
    const px = xPint(t), andando = t < 1.0 || t >= 3.9, arriba = t >= 1.0 && t < T_FIN;
    const paso = andando ? Math.sin(t * 16) * 16 : 0;
    at('pintor', 'transform', `translate(${px} ${SUELO - (andando ? Math.abs(Math.sin(t * 16)) * 1.5 : 0)}) scale(${S})`);
    at('piI', 'transform', `rotate(${paso} -6 -30)`); at('piD', 'transform', `rotate(${-paso} 6 -30)`);
    at('brA', 'opacity', arriba ? 0 : 1); at('brB', 'opacity', arriba ? 1 : 0); at('cubo', 'opacity', arriba ? 0 : 1);
    // pértiga y rodillo
    let html = '';
    if (arriba) {
      const r = yRod(t), rx = (t < T0 ? CENTROS_FRANJAS[0] : CENTROS_FRANJAS[r.i]) + 14;
      const k = easeOut(seg(t, 1.0, T0)), hx = px + 12 * S, hy = SUELO - 62 * S;
      const ry = lerp(SUELO - 80, r.y, k), rxx = lerp(px + 50, rx, k);
      html = `<path d="M${hx} ${hy} L${rxx} ${ry + 12}" stroke="#8D948F" stroke-width="3.5" stroke-linecap="round"/>`
        + `<path d="M${rxx} ${ry + 12} V${ry + 6} H${rxx - 14} V${ry}" stroke="#4A524E" stroke-width="2.5" fill="none" stroke-linejoin="round"/>`
        + `<rect x="${rxx - 31}" y="${ry - 6}" width="34" height="12" rx="5" fill="#E8EBE5"/><rect x="${rxx - 31}" y="${ry - 6}" width="34" height="4" rx="2" fill="#FFFFFF"/>`;
    } else {
      const ax = px + 14 * S, ay = SUELO - 58 * S;
      html = `<path d="M${ax - 58} ${ay + 14} L${ax + 40} ${ay - 12}" stroke="#8D948F" stroke-width="3.5" stroke-linecap="round"/>`
        + `<g transform="translate(${ax + 46} ${ay - 15}) rotate(-15)"><rect x="-6" y="-17" width="12" height="34" rx="5" fill="#E8EBE5"/></g>`;
    }
    q('pertiga').innerHTML = html;
    // franjas
    CENTROS_FRANJAS.forEach((_, i) => {
      const t0 = T0 + i * PASO;
      const k = t < t0 ? 0 : t >= t0 + BAJA ? 1 : easeInOut((t - t0) / BAJA);
      at(`frR${i}`, 'height', 104 * k);
      at(`frG${i}`, 'opacity', k >= 1 ? 1 : 0);
      at(`frG${i}`, 'transform', `translate(0 ${k >= 1 ? -8 * (1 - seg(t, t0 + BAJA, t0 + BAJA + .4)) : 0})`);
    });
    // gota en la gorra
    const tg0 = T0 + 4 * PASO + BAJA, kg = seg(t, tg0, tg0 + .35);
    const gx = CENTROS_FRANJAS[4] + 6, gy = lerp(112, SUELO - 75 * S, easeIn(kg));
    at('gotaP', 'opacity', t >= tg0 && kg < 1 ? 1 : 0);
    at('gotaP', 'transform', `translate(${lerp(gx, px - 2 * S, kg)} ${gy})`);
    at('mancha', 'opacity', kg >= 1 ? 1 : 0);
    // cartel y notas
    const kc = seg(t, 3.75, 4.1);
    at('cartel', 'transform', t >= 3.75 ? `translate(196 ${SUELO}) scale(${easeOutBack(kc, 2)})` : 'translate(-600 0)');
    at('notas', 'opacity', andando ? 1 : 0);
    at('notas', 'transform', `translate(${px + 14} ${SUELO - 98 + Math.sin(t * 6) * 3})`);
  };
  return { ...base, completa, dura: DUR };
}

// ================================================================ 5 · Día de orbayu
function montarOrbayu(svg: SVGSVGElement, pre: string) {
  const base = montar(svg, pre), { at } = base;
  const DUR = 4.9, NX = 166, NY = -14, SN = .8;
  const xN = (t: number) => t < 2.4 ? lerp(-120, NX, easeOut(seg(t, 0, .9))) : lerp(NX, -200, easeIn(seg(t, 2.4, 3.2)));
  const techo = (x: number) => 13 + Math.abs(x - LOGO.x) * 1.5;   // línea del tejado (mundo)
  const LL = Array.from({ length: 12 }, (_, i) => ({ x: 160 + (i * 37) % 72 + (i % 3) * 2, f: (i * 0.37) % 1 }));
  const GS = [{ lado: -1, t0: 1.25 }, { lado: 1, t0: 1.5 }, { lado: -1, t0: 1.85 }, { lado: 1, t0: 2.05 }];
  const completa = (t: number) => {
    // nube
    const xn = xN(t);
    at('nube', 'transform', `translate(${xn} ${NY + Math.sin(t * 3) * 1.5}) scale(${SN * (t > 2.4 ? lerp(1, .8, seg(t, 2.4, 2.8)) : 1)} ${SN})`);
    // orbayu
    const llueve = t >= .75 && t < 2.5;
    LL.forEach((d, i) => {
      const y0 = NY + 16, L = techo(d.x) - y0;
      const y = y0 + ((t * 230 + d.f * L) % L);
      at(`ll${i}`, 'opacity', llueve && xn > NX - 30 ? .9 : 0);
      at(`ll${i}`, 'transform', `translate(${d.x} ${y})`);
    });
    // gotas que resbalan por el tejado y caen por los lados
    GS.forEach((g, i) => {
      const u = t - g.t0;
      if (u < 0 || u > .75 || t > 2.6) { at(`gs${i}`, 'opacity', 0); return; }
      let x: number, y: number;
      if (u < .4) { const k = easeIn(u / .4); x = LOGO.x + g.lado * lerp(6, 30, k); y = techo(x) - 3; }
      else { const k = easeIn((u - .4) / .35); x = LOGO.x + g.lado * 32; y = lerp(techo(x) - 3, 116, k); }
      at(`gs${i}`, 'opacity', 1);
      at(`gs${i}`, 'transform', `translate(${x} ${y}) scale(.9)`);
    });
    texto(at, 'tPlic', t, 1.5, 2.45, 320, 12, 6);
    // viento (de derecha a izquierda), hojas y «¡FIUUU!»
    const kv = seg(t, 2.35, 3.7);
    at('viento', 'opacity', t >= 2.35 && kv < 1 ? Math.sin(Math.PI * kv) : 0);
    at('viento', 'transform', `translate(${lerp(470, -60, kv)} ${30})`);
    ([['hj1', 2.45, 70, 30], ['hj2', 2.6, 150, -20]] as const).forEach(([id, t0, y, r]) => {
      const k = seg(t, t0, t0 + 1.0);
      at(id, 'transform', t >= t0 && k < 1 ? `translate(${lerp(430, -40, k)} ${y + Math.sin(k * 9) * 14}) rotate(${r + k * 540})` : 'translate(-600 0)');
    });
    texto(at, 'tFiu', t, 2.45, 3.3, 300, 140, 6);
    // la pegatina: aletea despegada y sale volando como una hoja
    if (t < 2.6) base.ponLogo(LOGO.x, LOGO.y);
    else if (t < 3.3) base.pelar(.55 * easeOut(seg(t, 2.6, 2.85)) + .08 * Math.sin((t - 2.6) * 34) * seg(t, 2.7, 2.8));
    else if (t < 3.45) base.pelar(lerp(.55, 1, seg(t, 3.3, 3.45)));
    else {
      const u = seg(t, 3.45, 4.6);
      base.ponLogo(lerp(LOGO.x, -110, easeIn(u)), LOGO.y - 150 * u + 34 * Math.sin(u * Math.PI * 2), -420 * u, lerp(1, .45, u));
    }
    // sale el sol
    const ks = seg(t, 3.7, 4.2);
    at('sol', 'transform', t >= 3.7 ? `translate(330 4) scale(${easeOutBack(ks, 2)})` : 'translate(-600 0)');
    at('rayos', 'transform', `rotate(${t * 20})`);
  };
  return { ...base, completa, dura: DUR };
}

