/*
 * Fiestas del arranque (todos los usuarios): la animación de siempre, pero vestida para la fecha.
 * Cada fiesta: intro (fondo y efectos sobre el logo) → llega el camión decorado → momento especial →
 * el despegue normal (el logo a la puerta y el camión se va) → pegatina final. Unos 6–7 s.
 * Sale la primera vez que se abre la app cada día (en ese móvil). Para verla otro día: ?fiesta=<nombre>
 * (y &nombre=Patricia para el cumpleaños).
 * Piezas de dibujo en fiestasEscena.ts.
 */
import {
  c01, seg, lerp, easeOut, easeIn, easeInOut, easeOutBack, muelle,
  LOGO, SUELO, ESC, X_PARA, DURA, T_SALE, montar, xCam,
} from './pegatinaMotor';
import { FILTROS_F, PF } from './fiestasEscena';

export type Fiesta = 'otono' | 'halloween' | 'navidad' | 'nochevieja' | 'reyes' | 'antroxu' | 'sanjuan' | 'asturias' | 'cumple' | 'aniversario';
const TODAS: Fiesta[] = ['otono', 'halloween', 'navidad', 'nochevieja', 'reyes', 'antroxu', 'sanjuan', 'asturias', 'cumple', 'aniversario'];
export interface FiestaHoy { f: Fiesta; nombre?: string }

// ---------------------------------------------------------------- fechas
/** Cumpleaños del equipo (mes-día). Pendiente de que Andrés pase las fechas. */
export const CUMPLES: { nombre: string; mmdd: string }[] = [];
/** Día de la fundación de Casa Fonso (mes-día). Pendiente. */
export const ANIVERSARIO: string | null = null;

function pascua(y: number): Date {                      // algoritmo de Meeus/Jones/Butcher
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}

export function fiestaDe(d: Date): FiestaHoy | null {
  const m = d.getMonth() + 1, dia = d.getDate(), md = `${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const cumple = CUMPLES.find(c => c.mmdd === md);
  if (cumple) return { f: 'cumple', nombre: cumple.nombre };
  if (ANIVERSARIO === md) return { f: 'aniversario' };
  if ((m === 12 && dia === 31) || (m === 1 && dia === 1)) return { f: 'nochevieja' };
  if (m === 1 && (dia === 5 || dia === 6)) return { f: 'reyes' };
  if (m === 12 && dia >= 20 && dia <= 30) return { f: 'navidad' };
  const p = pascua(d.getFullYear()), hoy = new Date(d.getFullYear(), m - 1, dia).getTime();
  const dif = Math.round((p.getTime() - hoy) / 86400000);
  if (dif >= 47 && dif <= 49) return { f: 'antroxu' };     // domingo, lunes y martes de Carnaval
  if (m === 6 && (dia === 23 || dia === 24)) return { f: 'sanjuan' };
  if (m === 9 && dia === 8) return { f: 'asturias' };
  if (m === 10 && dia === 31) return { f: 'halloween' };
  if ((m === 9 && dia >= 22) || m === 10 || m === 11 || (m === 12 && dia <= 20)) return { f: 'otono' };
  return null;
}

const CLAVE_DIA = 'cfFiestaDia';
export function eligeFiesta(): FiestaHoy | null {
  const q = new URLSearchParams(window.location.search), pedida = q.get('fiesta') as Fiesta | null;
  if (pedida && TODAS.includes(pedida)) return { f: pedida, nombre: q.get('nombre') || 'Andrés' };
  const d = new Date(), hoy = fiestaDe(d);
  if (!hoy) return null;
  const marca = `${hoy.f}-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  try {
    if (localStorage.getItem(CLAVE_DIA) === marca) return null;   // ya salió hoy en este móvil
    localStorage.setItem(CLAVE_DIA, marca);
  } catch { /* sin almacenamiento: sale siempre */ }
  return hoy;
}

// ---------------------------------------------------------------- utilidades
type P = [number, number];
const rnd = (i: number, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const COLS = ['#2FAE66', '#D93A30', '#FFD25A', '#3E86AD', '#E85A9A', '#F29A2E'];
const g = (id: string, inner: string, tr = 'translate(-900 0)') => `<g id="cfp-${id}" transform="${tr}">${inner}</g>`;
const varios = (pref: string, n: number, pieza: (i: number) => string) => Array.from({ length: n }, (_, i) => g(`${pref}${i}`, pieza(i))).join('');
const confetiPieza = (i: number) => `<rect x="-2.5" y="-4.5" width="5" height="9" rx="1.2" fill="${COLS[i % COLS.length]}"/>`;
const copo = (i: number) => `<circle r="${(1.8 + rnd(i, 3) * 2).toFixed(1)}" fill="#fff" opacity="${(.75 + rnd(i, 4) * .25).toFixed(2)}"/>`;
const estrellasSvg = (n: number, seed: number, col = '#fff', y1 = 180) => Array.from({ length: n }, (_, i) =>
  `<circle cx="${(rnd(i, seed) * 520 - 60).toFixed(0)}" cy="${(rnd(i, seed + 1) * (y1 + 260) - 260).toFixed(0)}" r="${(.6 + rnd(i, seed + 2)).toFixed(1)}" fill="${col}" opacity="${(.4 + rnd(i, seed + 3) * .5).toFixed(2)}"/>`).join('');
const TXT = (id: string, t: string, s: number, c: string) =>
  `<text id="cfp-${id}" opacity="0" font-family="Inter, Montserrat, sans-serif" font-weight="900" font-size="${s}" fill="${c}" text-anchor="middle" stroke="#fff" stroke-width="5" paint-order="stroke">${t}</text>`;

function inclDe(f: (t: number) => number, t: number, k = 0.0011) {
  const h = 1 / 120, x = f(t);
  return Math.max(-7, Math.min(7, -(f(t + h) - 2 * x + f(t - h)) / (h * h) * k));
}

interface Capas { cielo: [number, string][]; fondo?: string; detras?: string; camion?: string; logo?: string; frente?: string; cartel: [string, string, number] }
interface Ctx {
  t: number; T0: number; T1: number; T2: number; TB: number;
  at: (id: string, k: string, v: string | number) => void; q: (id: string) => SVGElement;
  /** Muestra un texto con pop entre t0 y t1. */
  txt: (id: string, t0: number, t1: number, x: number, y: number, rot?: number) => void;
  /** Coloca la pieza id en (x,y) con giro y escala (u oculta). */
  pon: (id: string, x: number, y: number, rot?: number, s?: number, op?: number) => void;
  oculta: (id: string) => void;
  /** Posición x del camión (mundo) en t. */
  xCamion: (t: number) => number;
  /** Mueve el camión (para saltos): desplazamiento hacia arriba y giro extra. */
  levanta: (dy: number, giro: number) => void;
}
interface Def { intro: number; momento: number; capas: (n?: string) => Capas; pinta: (c: Ctx) => void }

// ---------------------------------------------------------------- piezas comunes de movimiento
/** Partículas que caen (nieve, hojas, confeti) por toda la pantalla. */
function cae(c: Ctx, pref: string, n: number, t0: number, v: number, giro = 0, amp = 10, t1 = 99, x0 = -10, x1 = 403) {
  for (let i = 0; i < n; i++) {
    if (c.t < t0 || c.t > t1) { c.oculta(`${pref}${i}`); continue; }
    const H = 340, y = -60 + ((rnd(i, 7) * H + (c.t - t0) * v * (.7 + .6 * rnd(i, 8))) % H);
    const x = x0 + rnd(i, 9) * (x1 - x0) + Math.sin(c.t * (1 + rnd(i, 10) * 2) + i) * amp;
    c.pon(`${pref}${i}`, x, y, giro ? c.t * giro * (rnd(i, 11) - .5) * 2 + i * 40 : 0);
  }
}
/** Partículas lanzadas desde (x0,y0) en abanico (caramelos, confeti, castañas). */
function lanza(c: Ctx, pref: string, n: number, t0: number, x0: number, y0: number, vx: [number, number], vy: [number, number], gr = 900, cada = .04, dur = 2) {
  for (let i = 0; i < n; i++) {
    const u = c.t - t0 - i * cada;
    if (u < 0 || u > dur) { c.oculta(`${pref}${i}`); continue; }
    const ax = lerp(vx[0], vx[1], rnd(i, 21)), ay = lerp(vy[0], vy[1], rnd(i, 22));
    const y = y0 - ay * u + .5 * gr * u * u;
    if (y > SUELO + 20) { c.oculta(`${pref}${i}`); continue; }
    c.pon(`${pref}${i}`, x0 + ax * u, y, u * 400 * (rnd(i, 23) - .5));
  }
}
/** Explosión de un cohete: escala y se apaga. */
function cohete(c: Ctx, id: string, t0: number, x: number, y: number, s = 1) {
  const u = c.t - t0;
  if (u < 0 || u > 1.3) return c.oculta(id);
  c.pon(id, x, y, u * 20, s * (.3 + .9 * easeOut(c01(u / .35))), 1 - easeIn(seg(u, .6, 1.3)));
}
/** Estela de un cohete subiendo de a a b. */
function estela(c: Ctx, id: string, t0: number, t1: number, a: P, b: P) {
  const k = seg(c.t, t0, t1);
  if (c.t < t0 || c.t > t1 + .05) return c.at(id, 'opacity', 0);
  const x = lerp(a[0], b[0], easeOut(k)), y = lerp(a[1], b[1], easeOut(k));
  const xs = lerp(a[0], b[0], easeOut(Math.max(0, k - .25))), ys = lerp(a[1], b[1], easeOut(Math.max(0, k - .25)));
  c.at(id, 'opacity', 1); c.at(id, 'd', `M${xs} ${ys} L${x} ${y}`);
}

const ESTELA = (id: string, col: string) => `<path id="cfp-${id}" opacity="0" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 5" fill="none"/>`;
const camEnMundo = (lx: number, ly: number): P => [X_PARA + (lx - 172) * ESC, SUELO + (ly - 151) * ESC];

// ================================================================ las fiestas
const NOCHE: [number, string][] = [[0, '#0F1A33'], [.75, '#22355E'], [1, '#2E4573']];

const DEFS: Record<Fiesta, Def> = {
  // ------------------------------------------------------------ Navidad
  navidad: {
    intro: 2.3, momento: 1.2,
    capas: () => ({
      cielo: NOCHE, fondo: estrellasSvg(55, 1) + PF.lunaN + PF.sueloNieve,
      detras: g('renos', PF.renos) + varios('rch', 6, () => PF.chispa),
      camion: PF.camNav,
      logo: g('nieveT', PF.nieveTejado, '') + g('gorro', PF.gorroNoel) + g('guir', PF.guirnalda, ''),
      frente: varios('copo', 44, copo) + g('mun', PF.muneco) + g('munS', PF.munecoSaluda) + TXT('plop', '¡plop!', 14, '#D93A30'),
      cartel: ['¡Feliz Navidad!', '#D93A30', 200],
    }),
    pinta: c => {
      cae(c, 'copo', 44, 0, 60, 0, 12);
      c.at('nieveT', 'opacity', easeOut(seg(c.t, .2, 1.0)));
      const kg = seg(c.t, .7, 1.05);
      c.pon('gorro', 0, lerp(-90, 0, easeIn(kg)) - Math.abs(muelle(c.t - 1.05, 6, 22, 8)), 0, 1, c.t < .7 ? 0 : 1);
      c.txt('plop', 1.05, 1.6, -150 + LOGO.x, 130);
      c.at('guir', 'transform', `scale(${easeOutBack(seg(c.t, .95, 1.25), 1.5)} 1)`);
      for (let i = 0; i < 11; i++) c.at(`gg${i}`, 'opacity', c.t < 1.1 + i * .07 ? 0 : (Math.floor(c.t * 4 + i) % 3 ? .55 : .2));
      const kr = seg(c.t, .9, 2.4);
      c.pon('renos', lerp(-140, 470, kr), -12 + Math.sin(kr * 9) * 5, -4, .9, kr > 0 && kr < 1 ? 1 : 0);
      for (let i = 0; i < 6; i++) {
        const x = lerp(-140, 470, kr) - 110 - i * 18;
        c.pon(`rch${i}`, x, -16 + Math.sin(i * 2 + c.t * 6) * 5, c.t * 90, 1, kr > 0 && kr < 1 ? 1 - i / 7 : 0);
      }
      const km = seg(c.t, c.T1 + .2, c.T1 + .5), saluda = c.t > c.TB + T_SALE && Math.floor(c.t * 4) % 2 === 0;
      c.pon('mun', 52, SUELO, 0, easeOutBack(km, 2), c.t > c.T1 + .2 && !saluda ? 1 : 0);
      c.pon('munS', 52, SUELO, 0, 1, c.t > c.T1 + .2 && saluda ? 1 : 0);
    },
  },

  // ------------------------------------------------------------ Nochevieja y Año Nuevo
  nochevieja: {
    intro: 2.5, momento: 1.4,
    capas: () => {
      const d = new Date(), ano = String(d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear());   // el año que empieza
      const arco = Array.from({ length: 12 }, (_, i) => g(`uva${i}`, PF.uva)).join('');
      return {
        cielo: NOCHE, fondo: estrellasSvg(60, 2),
        camion: PF.camNV,
        frente: g('n3', PF.num3) + g('n2', PF.num2) + g('n1', PF.num1) + g('camp', PF.campana) + arco
          + ESTELA('e1', '#E85A9A') + ESTELA('e2', '#FFD25A') + ESTELA('e3', '#3E86AD')
          + g('c1', PF.coheteRosa) + g('c2', PF.coheteOro) + g('c3', PF.coheteAzul) + g('c4', PF.coheteVerde) + g('c5', PF.coheteRojo)
          + g('ano', PF.txt2027.replace('2027', ano)) + varios('conf', 30, confetiPieza)
          + TXT('dong1', '¡DONG!', 18, '#FFD25A') + TXT('dong2', '¡DONG!', 14, '#FFD25A'),
        cartel: [`¡Feliz ${ano}!`, '#8E44AD', 180],
      };
    },
    pinta: c => {
      ([['n3', .25, 70, 150], ['n2', .7, 196, 170], ['n1', 1.15, 320, 150]] as const).forEach(([id, t0, x, y]) => {
        const u = c.t - t0;
        if (u < 0 || u > .55) return c.oculta(id);
        c.pon(id, x, y, (rnd(t0) - .5) * 16, easeOutBack(c01(u / .2), 2.5) * (1 + u * .3), 1 - seg(u, .35, .55));
      });
      const kc = seg(c.t, 1.55, 1.75);
      c.pon('camp', LOGO.x, -28, Math.sin(c.t * 9) * 16 * (c.t < c.T0 ? 1 : 0), easeOutBack(kc, 2), c.t > 1.55 && c.t < c.T0 + .4 ? 1 - seg(c.t, c.T0, c.T0 + .4) : 0);
      c.txt('dong1', 1.7, 2.2, 290, -24, 8); c.txt('dong2', 2.0, 2.5, 100, -18, -8);
      for (let i = 0; i < 12; i++) {
        const a = Math.PI * (.1 + .8 * i / 11), x = 196 - Math.cos(a) * 150, y = 200 - Math.sin(a) * 30;
        const ta = 1.6 + i * .025, tc = 1.75 + i * .06;
        c.pon(`uva${i}`, x, y, 0, c.t < tc ? easeOutBack(seg(c.t, ta, ta + .15), 2) : 1 - easeIn(seg(c.t, tc, tc + .08)), c.t > ta && c.t < tc + .08 ? 1 : 0);
      }
      const bat = camEnMundo(110, 46), T = c.T1;
      estela(c, 'e1', T + .1, T + .5, bat, [60, 10]); estela(c, 'e2', T + .2, T + .6, bat, [196, -40]); estela(c, 'e3', T + .3, T + .7, bat, [330, 10]);
      cohete(c, 'c1', T + .5, 60, 10); cohete(c, 'c2', T + .6, 196, -40, 1.2); cohete(c, 'c3', T + .7, 330, 10);
      cohete(c, 'c4', c.TB + T_SALE - .2, 70, -14, .9); cohete(c, 'c5', c.TB + T_SALE + .2, 320, -20);
      const ka = seg(c.t, T + .8, T + 1.0);
      c.pon('ano', 196, -2, -3, easeOutBack(ka, 2), c.t > T + .8 ? 1 - seg(c.t, c.TB + 1.7, c.TB + 2.0) : 0);
      cae(c, 'conf', 30, T + .8, 90, 300, 14);
    },
  },

  // ------------------------------------------------------------ Reyes
  reyes: {
    intro: 2.2, momento: 1.2,
    capas: () => ({
      cielo: NOCHE, fondo: estrellasSvg(60, 3),
      detras: varios('suelo', 4, i => PF[`caramelo${i}`]),
      camion: PF.carroza,
      logo: g('corona', PF.corona, ''),
      frente: g('estrella', PF.estrella) + varios('car', 18, i => PF[`caramelo${i % 5}`]) + TXT('vienen', '¡que vienen!', 13, '#FFD25A'),
      cartel: ['¡Felices Reyes!', '#1F5A3A', 190],
    }),
    pinta: c => {
      const ke = seg(c.t, .1, 1.3), sale = seg(c.t, c.TB + T_SALE, c.TB + T_SALE + 1.2);
      c.pon('estrella', lerp(470, 330, easeOut(ke)) + 200 * easeIn(sale), lerp(-70, -24, easeOut(ke)) - 30 * sale, 0, 1, c.t > .1 ? 1 : 0);
      // la corona cae de la estrella al pico del tejado
      const kc = seg(c.t, 1.1, 1.6);
      const desde: P = [330 - LOGO.x, -24 - LOGO.y];
      c.at('corona', 'transform', `translate(${lerp(desde[0], 0, easeInOut(kc))} ${lerp(desde[1], 0, easeIn(kc)) - Math.abs(muelle(c.t - 1.6, 5, 20, 8))}) rotate(${lerp(-60, 0, kc)})`);
      c.at('corona', 'opacity', c.t > 1.1 ? 1 : 0);
      c.txt('vienen', c.T0 + .1, c.T1 + .3, 70, 140, -6);
      const caja = camEnMundo(100, 40);
      lanza(c, 'car', 18, c.T1 + .1, caja[0], caja[1], [-220, 260], [320, 520], 900, .05, 1.6);
      ([[60, 10], [110, -20], [160, 30], [210, 0]] as const).forEach(([x, r], i) =>
        c.pon(`suelo${i}`, x, SUELO - 6, r, 1, c.t > c.T1 + .9 ? 1 : 0));
    },
  },

  // ------------------------------------------------------------ Halloween
  halloween: {
    intro: 2.5, momento: 1.1,
    capas: () => ({
      cielo: [[0, '#120A24'], [.6, '#2A1640'], [1, '#3E2257']], fondo: estrellasSvg(30, 4) + PF.fondoHW,
      detras: g('fant', PF.fantasma),
      camion: g('cal', PF.calabaza, '') + g('calG', PF.calabazaGuino, '') + PF.faros,
      frente: varios('mur', 6, () => PF.murci) + '<path id="cfp-hilo" stroke="#C9B8E0" stroke-width="1" opacity="0"/>' + g('arana', PF.arana)
        + TXT('bu', '¡BU!', 22, '#F7A54A'),
      cartel: ['¡Feliz Halloween!', '#E8792B', 200],
    }),
    pinta: c => {
      for (let i = 0; i < 6; i++) {
        const t0 = .2 + i * .12, u = c.t - t0;
        if (u < 0) { c.oculta(`mur${i}`); continue; }
        const a0 = -Math.PI * (.15 + .7 * rnd(i, 30)), sale = c.TB + T_SALE;
        let x: number, y: number;
        if (c.t < c.T1) { const k = easeOut(c01(u / .8)); x = LOGO.x + Math.cos(a0) * 150 * k + Math.sin(c.t * 3 + i) * 10; y = 30 + Math.sin(a0) * 80 * k + Math.cos(c.t * 4 + i) * 8; }
        else { const a = c.t * 2.4 + i * 1.05; x = LOGO.x + Math.cos(a) * 130; y = 70 + Math.sin(a) * 60; }
        if (c.t > sale) { const k = c.t - sale; x += 260 * k * k; y += 40 * k; }
        c.pon(`mur${i}`, x, y, Math.sin(c.t * 8 + i) * 12, .7 + .3 * rnd(i, 31), 1);
        c.at(`mur${i}`, 'transform', `translate(${x} ${y}) scale(${.75 + .25 * rnd(i, 31)} ${(.75 + .25 * rnd(i, 31)) * (.7 + .3 * Math.abs(Math.sin(c.t * 14 + i)))})`);
      }
      const kf = c.t < 1.8 ? easeOut(seg(c.t, .9, 1.3)) : 1 - easeIn(seg(c.t, 2.0, 2.4));
      c.pon('fant', 278, lerp(92, 50, kf), 12 + Math.sin(c.t * 5) * 4, 1.1, kf > 0 ? 1 : 0);
      c.txt('bu', 1.25, 1.95, 322, 36, 8);
      const ka = c.t < 2.1 ? easeOut(seg(c.t, 1.3, 1.8)) : 1 - easeIn(seg(c.t, 2.1, 2.5));
      const ya = lerp(104, 158, ka) + Math.sin(c.t * 6) * 3;
      c.at('hilo', 'd', `M150 104 V${ya}`); c.at('hilo', 'opacity', ka > 0 ? .9 : 0);
      c.pon('arana', 150, ya, Math.sin(c.t * 5) * 8, 1, ka > 0 ? 1 : 0);
      const guino = c.t > c.T1 + .35 && c.t < c.T1 + .8;
      c.at('cal', 'opacity', guino ? 0 : 1); c.at('calG', 'opacity', guino ? 1 : 0);
    },
  },

  // ------------------------------------------------------------ Otoño
  otono: {
    intro: 2.2, momento: 1.1,
    capas: () => ({
      cielo: [[0, '#F2B66B'], [.55, '#F8D9A8'], [1, '#F7E8CF']], fondo: PF.fondoOT + PF.castano,
      camion: PF.asador + g('hojaC', `<g transform="translate(262 42) rotate(20)">${PF.hojaCristal}</g>`, ''),
      frente: varios('hoja', 12, i => PF[`hoja${i % 3}`]) + varios('rem', 14, i => PF[`hoja${i % 3}`]) + varios('cast', 6, () => PF.castana)
        + g('hojaV', PF.hoja0) + TXT('pop', '¡pop, pop!', 14, '#7A4E2A') + TXT('plaf', '¡plaf!', 14, '#B5532A'),
      cartel: ['¡Llegó el otoño!', '#C4632A', 190],
    }),
    pinta: c => {
      cae(c, 'hoja', 12, 0, 45, 160, 26);
      for (let i = 0; i < 14; i++) {
        const k = seg(c.t, .7, 2.1);
        if (k <= 0 || k >= 1) { c.oculta(`rem${i}`); continue; }
        const a = i / 14 * Math.PI * 2 + k * Math.PI * 3, r = 125 + 40 * Math.sin(k * Math.PI + i);
        c.pon(`rem${i}`, LOGO.x + Math.cos(a) * r, 66 + Math.sin(a) * r * .42 - 20 * Math.sin(k * Math.PI), a * 57, 1, Math.sin(k * Math.PI) * 1.4);
      }
      const as = camEnMundo(96, 36);
      for (let i = 0; i < 6; i++) {
        const t0 = c.T1 + .1 + (i % 3) * .25 + Math.floor(i / 3) * .5, u = c.t - t0;
        if (u < 0 || u > .7 || c.t > c.TB + T_SALE) { c.oculta(`cast${i}`); continue; }
        c.pon(`cast${i}`, as[0] + (rnd(i, 40) - .5) * 70 * u * 2, as[1] - 160 * u + 350 * u * u, u * 300, 1);
      }
      c.txt('pop', c.T1 + .15, c.T2, 150, 132, -6);
      c.at('hojaC', 'opacity', c.t > c.T1 + .45 && c.t < c.TB + T_SALE - .1 ? 1 : 0);
      c.txt('plaf', c.T1 + .45, c.T1 + 1.0, 320, 40, 8);
      const kv = seg(c.t, c.TB + T_SALE - .1, c.TB + T_SALE + .9);
      const cab = camEnMundo(262, 42);
      c.pon('hojaV', cab[0] - 120 * kv, cab[1] - 140 * kv + 60 * kv * kv, kv * 540, 1, kv > 0 && kv < 1 ? 1 : 0);
    },
  },

  // ------------------------------------------------------------ Antroxu
  antroxu: {
    intro: 2.1, momento: 1.0,
    capas: () => ({
      cielo: [[0, '#2A1446'], [.6, '#5B2A86'], [1, '#8E44AD']],
      fondo: [60, 196, 330, 130].map((x, i) => g(`foco${i}`, PF[`foco${i}`], `translate(${x} 300)`)).join(''),
      camion: PF.camAN,
      logo: g('antifaz', PF.antifazL) + g('gorroF', PF.gorroF),
      frente: varios('conf', 30, confetiPieza) + varios('serp', 4, i => PF[`serp${i}`]) + varios('cano', 36, confetiPieza)
        + TXT('tachan', '¡tachán!', 15, '#FFD25A') + TXT('pum', '¡PUM!', 20, '#FFD25A'),
      cartel: ['¡Feliz Antroxu!', '#E85A9A', 180],
    }),
    pinta: c => {
      for (let i = 0; i < 4; i++) c.at(`foco${i}`, 'transform', `translate(${[60, 196, 330, 130][i]} 300) rotate(${Math.sin(c.t * (1.3 + i * .4) + i) * 28})`);
      cae(c, 'conf', 30, 0, 80, 300, 14);
      const ka = seg(c.t, .6, .9), kg = seg(c.t, .8, 1.1);
      c.pon('antifaz', 0, lerp(-100, 0, easeIn(ka)), 0, 1, c.t > .6 ? 1 : 0);
      c.pon('gorroF', 0, lerp(-110, 0, easeIn(kg)) - Math.abs(muelle(c.t - 1.1, 5, 22, 8)), 0, 1, c.t > .8 ? 1 : 0);
      c.txt('tachan', 1.0, 1.7, 300, 20, 8);
      for (let i = 0; i < 4; i++) {
        const k = seg(c.t, 1.0 + i * .15, 2.2 + i * .15);
        c.pon(`serp${i}`, lerp(-380, 420, k), 20 + i * 40, (i % 2 ? -1 : 1) * 12, 1, k > 0 && k < 1 ? 1 : 0);
      }
      const caja = camEnMundo(100, 40);
      lanza(c, 'cano', 36, c.T1 + .1, caja[0], caja[1], [-200, 220], [380, 600], 700, .012, 1.8);
      c.txt('pum', c.T1 + .1, c.T1 + .8, 110, 150, -8);
      if (c.t > c.TB + T_SALE) c.levanta(Math.abs(Math.sin((c.t - c.TB - T_SALE) * 14)) * 7, Math.sin((c.t - c.TB - T_SALE) * 14) * 3);
    },
  },

  // ------------------------------------------------------------ San Juan
  sanjuan: {
    intro: 2.0, momento: .9,
    capas: () => ({
      cielo: [[0, '#0E1830'], [.6, '#26305A'], [1, '#7A3B2E']], fondo: PF.fondoSJ + g('brasa', PF.brasa, 'translate(352 0)'),
      detras: g('hog', PF.hoguera, 'translate(352 0)'),
      frente: varios('chis', 26, () => PF.chispa) + TXT('uy', '¡uy, uy!', 15, '#FFD25A') + TXT('hop', '¡HOOOP!', 24, '#FFD25A'),
      cartel: ['¡Feliz San Juan!', '#F29A2E', 190],
    }),
    pinta: c => {
      const fl = 1 + .05 * Math.sin(c.t * 17) + .03 * Math.sin(c.t * 29);
      c.at('hog', 'transform', `translate(352 ${SUELO}) scale(${2 - fl} ${fl}) translate(0 ${-SUELO})`);
      c.at('brasa', 'opacity', .85 + .15 * Math.sin(c.t * 13));
      for (let i = 0; i < 26; i++) {
        const per = 1.6 + rnd(i, 50), u = ((c.t + rnd(i, 51) * per) % per) / per;
        c.pon(`chis${i}`, 352 + (rnd(i, 52) - .5) * 80 + Math.sin(u * 6 + i) * 18, 200 - u * 280, u * 300, .6 + rnd(i, 53) * .6, 1 - u);
      }
      c.txt('uy', c.T1 + .1, c.T2 + .5, 300, 150, 6);
      const b = c.t - c.TB;
      if (b > T_SALE) {
        const x = c.xCamion(c.t), k = c01((x - 215) / 290);
        if (k > 0 && k < 1) c.levanta(Math.sin(Math.PI * k) * 130, -14 * Math.cos(Math.PI * k));
        c.txt('hop', c.TB + T_SALE + .15, c.TB + T_SALE + 1.1, 200, -10, -8);
      }
    },
  },

  // ------------------------------------------------------------ Día de Asturias
  asturias: {
    intro: 2.3, momento: 1.3,
    capas: () => ({
      cielo: [[0, '#7FC3EC'], [.6, '#BFE3F5'], [1, '#E6F4FA']],
      fondo: '<circle id="cfp-sol" cx="320" cy="96" r="30" fill="#FFE48F"/>' + PF.fondoAS + PF.horreo + PF.vaca,
      camion: PF.camAS,
      logo: g('band', PF.banderaL),
      frente: g('nt1', PF.notas) + g('nt2', PF.notas) + g('bot', PF.botella) + g('vaso', PF.vaso)
        + '<path id="cfp-chorro" stroke="#F2C14E" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0"/>'
        + TXT('muu', '¡muuu!', 13, '#7A3E1C') + TXT('puxa', '¡PUXA ASTURIES!', 20, '#1F5FAE'),
      cartel: ['¡Puxa Asturies!', '#1F5FAE', 190],
    }),
    pinta: c => {
      c.at('sol', 'cy', lerp(170, 96, easeOut(seg(c.t, 0, 1.4))));
      const kb = easeOutBack(seg(c.t, .7, 1.3), 1.6);
      c.at('band', 'transform', `translate(0 -46) scale(1 ${Math.max(.001, kb)}) rotate(${Math.sin(c.t * 5) * 2})`);
      c.at('band', 'opacity', c.t > .7 ? 1 : 0);
      c.pon('nt1', 80 + Math.sin(c.t * 2) * 6, 40 - (c.t % 2) * 10, 0, 1, c.t > .4 && c.t < c.T2 ? 1 : 0);
      c.pon('nt2', 300 + Math.sin(c.t * 2.4) * 6, 30 - ((c.t + 1) % 2) * 10, 0, 1, c.t > .8 && c.t < c.T2 ? 1 : 0);
      c.txt('muu', 1.3, 2.1, 100, 192, -6);
      // escanciado: la botella en alto, la sidra cae al vaso
      const T = c.T1, kv = seg(c.t, T + .1, T + .35), on = c.t > T + .1 && c.t < c.T2 + .3;
      c.pon('bot', 70, 90, 150, easeOutBack(kv, 2), on ? 1 : 0);
      c.pon('vaso', 70, 190, 0, easeOutBack(kv, 2), on ? 1 : 0);
      const kc = seg(c.t, T + .35, T + .6), corre = c.t > T + .35 && c.t < c.T2 + .1;
      c.at('chorro', 'd', `M76 108 Q100 ${lerp(110, 140, kc)} 70 ${lerp(110, 176, kc)}`);
      c.at('chorro', 'opacity', corre ? 1 : 0);
      c.at('sidraV', 'transform', `translate(0 6) scale(1 ${c01(seg(c.t, T + .5, c.T2) * 1.4)}) translate(0 -6)`);
      c.txt('puxa', T + .6, c.T2 + .6, 196, -20, -4);
    },
  },

  // ------------------------------------------------------------ Cumpleaños
  cumple: {
    intro: 2.1, momento: 1.5,
    capas: () => ({
      cielo: [[0, '#FFDDE8'], [.6, '#FFEBDD'], [1, '#FFF4E6']],
      camion: PF.camCU + g('llamas', PF.llamas, ''),
      logo: g('gorroC', PF.gorroC) + g('bandC', PF.banderines, ''),
      frente: varios('glo', 9, i => PF[`globo${i % 5}`]) + varios('conf', 34, confetiPieza) + g('fuga', PF.globo2)
        + g('nt1', PF.notas) + g('nt2', PF.notas),
      cartel: ['¡Felicidades!', '#2FAE66', 240],
    }),
    pinta: c => {
      for (let i = 0; i < 9; i++) {
        const t0 = rnd(i, 60) * .8, u = c.t - t0;
        if (u < 0 || c.t > c.T1 + .4) { c.oculta(`glo${i}`); continue; }
        c.pon(`glo${i}`, 20 + rnd(i, 61) * 353 + Math.sin(c.t * 2 + i) * 10, 300 - u * (120 + 60 * rnd(i, 62)), Math.sin(c.t * 2 + i) * 8, 1, 1);
      }
      const kg = seg(c.t, .7, 1.0);
      c.pon('gorroC', 0, lerp(-110, 0, easeIn(kg)) - Math.abs(muelle(c.t - 1.0, 5, 22, 8)), 0, 1, c.t > .7 ? 1 : 0);
      c.at('bandC', 'transform', `scale(${easeOutBack(seg(c.t, 1.1, 1.5), 1.5)} 1)`);
      const T = c.T1;
      c.at('llamas', 'opacity', c.t > T + .25 ? (Math.floor(c.t * 10) % 2 ? 1 : .85) : 0);
      c.pon('nt1', 60, 130 - Math.sin(c.t * 3) * 4, 0, 1, c.t > T + .3 && c.t < c.T2 + .5 ? 1 : 0);
      c.pon('nt2', 330, 120 - Math.cos(c.t * 3) * 4, 0, 1, c.t > T + .3 && c.t < c.T2 + .5 ? 1 : 0);
      const ks = c.t - (T + .7);
      if (ks > 0 && ks < .55) c.levanta(Math.sin(Math.PI * ks / .55) * 22, 0);
      cae(c, 'conf', 34, T + .7, 100, 300, 16);
      const kf = seg(c.t, c.TB + T_SALE, c.TB + T_SALE + 1.4), gl = camEnMundo(192, 6);
      c.pon('fuga', gl[0] + 60 * kf, gl[1] - 260 * kf, Math.sin(c.t * 4) * 10, 1, kf > 0 && kf < 1 ? 1 : 0);
    },
  },

  // ------------------------------------------------------------ Aniversario
  aniversario: {
    intro: 2.4, momento: 1.3,
    capas: () => {
      const anos = String(new Date().getFullYear() - 1950);
      return {
        cielo: [[0, '#0B2116'], [.6, '#123A26'], [1, '#1F5A3A']], fondo: estrellasSvg(40, 5, '#FFE48F', 200),
        detras: g('viejo', PF.cam1950),
        camion: PF.tarta76.replace('>7<', `>${anos[0]}<`).replace('>6<', `>${anos[1] ?? ''}<`) + g('ll76', PF.llamas76, ''),
        logo: g('desde', PF.desde, ''),
        frente: g('medalla', PF.medalla.replace('>76<', `>${anos}<`)) + g('co1', PF.coheteOro) + g('co2', PF.coheteOro) + g('co3', PF.coheteOro)
          + varios('conf', 24, confetiPieza) + TXT('pipi', 'pi, piii', 13, '#FFD25A') + TXT('anos', `¡${anos} años!`, 20, '#FFD25A'),
        cartel: [`¡${anos} años con vosotros!`, '#1F5A3A', 250],
      };
    },
    pinta: c => {
      c.at('desde', 'transform', `scale(${easeOutBack(seg(c.t, .4, .8), 1.6)} 1)`);
      const km = seg(c.t, .8, 1.2);
      c.pon('medalla', 330, 10, lerp(-200, 0, easeOut(km)), easeOutBack(km, 2) * .9, c.t > .8 ? 1 - seg(c.t, c.T2, c.T2 + .3) : 0);
      // camión de 1950: llega antes y se va detrás del de hoy
      const sale = c.TB + T_SALE - .25;
      const xv = c.t < sale ? lerp(-220, 300, easeOutBack(seg(c.t, 1.0, 2.0), .5)) : 300 + 1100 * Math.pow(c.t - sale, 2.1);
      c.pon('viejo', xv, -4, 0, 1, c.t > 1.0 ? 1 : 0);
      c.txt('pipi', 1.9, 2.5, 300, 150, 6);
      const T = c.T1;
      c.at('ll76', 'opacity', c.t > T + .25 ? 1 : 0);
      cohete(c, 'co1', T + .3, 60, -10); cohete(c, 'co2', T + .55, 330, -14, 1.1); cohete(c, 'co3', c.TB + T_SALE, 196, -30, .9);
      cae(c, 'conf', 24, T + .3, 90, 300, 14);
      c.txt('anos', T + .3, c.T2 + .4, 196, -22, -4);
    },
  },
};

// ---------------------------------------------------------------- montaje
export function escenaFiesta(h: FiestaHoy, escena: string): string {
  const d = DEFS[h.f], k = d.capas(h.nombre);
  const cartelTxt = h.f === 'cumple' ? `¡Felicidades, ${h.nombre ?? ''}!` : k.cartel[0];
  const w = h.f === 'cumple' ? Math.max(200, cartelTxt.length * 11.5) : k.cartel[2];
  const stops = k.cielo.map(([o, col]) => `<stop offset="${o}" stop-color="${col}"/>`).join('');
  const defs = FILTROS_F + `<linearGradient id="cfp-fcielo" gradientUnits="userSpaceOnUse" x1="0" y1="-60" x2="0" y2="260">${stops}</linearGradient>`;
  const fondo = `<g id="cfp-fFondo" opacity="0"><rect x="-2000" y="-2000" width="4400" height="4400" fill="url(#cfp-fcielo)"/>${k.fondo ?? ''}</g>`;
  const cartel = `<g id="cfp-fCartel" transform="translate(-900 0)"><g filter="url(#cfp-fpg)"><rect x="${-w / 2}" y="-20" width="${w}" height="38" rx="11" fill="${k.cartel[1]}"/>`
    + `<text x="0" y="7" font-family="Inter, Montserrat, sans-serif" font-weight="900" font-size="19" fill="#fff" text-anchor="middle">${cartelTxt}</text></g></g>`;
  const i = escena.indexOf('</defs>');
  let e = escena.slice(0, i) + defs + '</defs>' + fondo + escena.slice(i + 7);
  e = e.replace('<g id="cfp-camion"', (k.detras ?? '') + '<g id="cfp-camion"');
  e = e.replace('<g id="cfp-r1">', `<g id="cfp-fCam">${k.camion ?? ''}</g><g id="cfp-r1">`);
  e = e.replace('<g id="cfp-golpe"', `<g id="cfp-fLogo" transform="translate(${LOGO.x} ${LOGO.y})">${k.logo ?? ''}</g>` + (k.frente ?? '') + cartel + '<g id="cfp-golpe"');
  return e;
}

export function montarFiesta(h: FiestaHoy, svg: SVGSVGElement, pre: string) {
  const base = montar(svg, pre), { q, at } = base;
  const d = DEFS[h.f];
  const T0 = d.intro, T1 = T0 + .9, T2 = T1 + d.momento, TB = T2 - .2;
  const DUR_F = TB + DURA + .5;
  const xLlega = (t: number) => lerp(-260, X_PARA, easeOutBack(seg(t, T0, T1), .6));
  const xCamion = (t: number) => t < T0 ? -600 : t < T1 ? xLlega(t) : t < TB + T_SALE ? X_PARA : xCam(t - TB);
  const ctx: Ctx = {
    t: 0, T0, T1, T2, TB, at, q, xCamion,
    txt: (id, t0, t1, x, y, rot = 0) => {
      const t = ctx.t, on = t >= t0 && t < t1, k = seg(t, t0, t0 + .18), o = seg(t, t1 - .15, t1);
      at(id, 'opacity', on ? 1 - o : 0);
      at(id, 'transform', `translate(${x} ${y}) rotate(${rot}) scale(${easeOutBack(k, 2.4)})`);
    },
    pon: (id, x, y, rot = 0, s = 1, op = 1) => {
      at(id, 'transform', op > 0 ? `translate(${x} ${y}) rotate(${rot}) scale(${s})` : 'translate(-900 0)');
      at(id, 'opacity', c01(op));
    },
    oculta: id => at(id, 'transform', 'translate(-900 0)'),
    levanta: (dy, giro) => {
      const x = xCamion(ctx.t);
      at('camion', 'transform', `translate(${x} ${SUELO - dy}) rotate(${giro})`);
    },
  };
  const completa = (t: number) => {
    ctx.t = t;
    at('fFondo', 'opacity', easeOut(seg(t, 0, .45)));
    if (t < T0) { base.ponLogo(LOGO.x, LOGO.y); at('camion', 'transform', 'translate(-600 0)'); }
    else if (t < T2) { base.ponLogo(LOGO.x, LOGO.y); base.ponCamion(xCamion(t), t < T1 ? inclDe(xLlega, t) : 0); }
    else base.completa(t - TB, true);
    // los adornos del logo se van con un «pop» cuando el logo empieza a despegarse
    const kp = seg(t, T2, T2 + .15);
    at('fLogo', 'opacity', seg(t, .2, .45) * (1 - kp));
    at('fLogo', 'transform', `translate(${LOGO.x} ${LOGO.y}) scale(${1 + .15 * kp})`);
    // pegatina final (en el cumpleaños sale antes, con el saltito)
    const tc = h.f === 'cumple' ? T1 + .7 : TB + T_SALE + .15, kc = seg(t, tc, tc + .3);
    at('fCartel', 'transform', t >= tc ? `translate(196 -24) rotate(-4) scale(${easeOutBack(kc, 2)})` : 'translate(-900 0)');
    d.pinta(ctx);
  };
  return { ...base, completa, dura: DUR_F };
}
