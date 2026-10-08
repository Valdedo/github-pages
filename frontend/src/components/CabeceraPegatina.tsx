import { useEffect, useRef } from 'react';
import { ESCENA_PEGATINA } from './pegatinaEscena';

/**
 * Cabecera de Inicio en el móvil, estilo «pegatina».
 * El logo está pegado arriba. Al empezar a bajar: se despega, entra el camión,
 * el logo vuela y se pega en la puerta de la cabina, y el camión se va. Arriba queda limpio.
 * Al volver arriba del todo, el logo se vuelve a pegar.
 * La animación completa sale una vez al día; el resto de veces el logo solo se desvanece.
 */

const VB_W = 393, VB_H = 320, ALTO_LOGO = 128;   // alto (en coords de la escena) que ocupa el logo en reposo
const DURA = 2.75;                                // segundos de la animación completa
const CLAVE_DIA = 'cfPegatinaDia';

// ---------------------------------------------------------------- utilidades
const c01 = (x: number) => Math.max(0, Math.min(1, x));
const seg = (t: number, a: number, b: number) => c01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeIn = (x: number) => x * x * x;
const easeInOut = (x: number) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x: number, c = 1.4) => 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
const muelle = (dt: number, A: number, w = 30, k = 8) => (dt < 0 ? 0 : A * Math.exp(-k * dt) * Math.sin(w * dt));

const hoy = () => new Date().toISOString().slice(0, 10);
function yaSalioHoy(): boolean { try { return localStorage.getItem(CLAVE_DIA) === hoy(); } catch { return false; } }
function marcarHoy() { try { localStorage.setItem(CLAVE_DIA, hoy()); } catch { /* sin almacenamiento: no pasa nada */ } }

// ---------------------------------------------------------------- tiempos y geometría (coords de la escena 393×320)
const T_PEEL0 = 0.2, T_PEEL1 = 0.83;
const T_VUELA = 0.83, T_PEGA = 1.47;
const T_ENTRA0 = 0.0, T_ENTRA1 = 0.83;
const T_SALE = 1.87;
const LOGO = { x: 196.5, y: 62 };
const N = (() => { const x = -0.83, y = -0.56, l = Math.hypot(x, y); return { x: x / l, y: y / l }; })();
const F0 = N.x * 104 + N.y * 50;
const F1 = lerp(F0, N.x * -104 + N.y * -58, 0.4);
const ESC = 0.84, SUELO = 244, X_PARA = 196;
const CALCO = { x: 268, y: 68, esc: 0.24 };   // puerta de la cabina (coords del camión)

function semiplano(f: number, lado: number) {
  const p0 = { x: f * N.x, y: f * N.y }, u = { x: -N.y, y: N.x }, L = 5000;
  const P = [[p0.x + u.x * L, p0.y + u.y * L], [p0.x - u.x * L, p0.y - u.y * L]];
  P.push([P[1][0] + lado * N.x * L, P[1][1] + lado * N.y * L], [P[0][0] + lado * N.x * L, P[0][1] + lado * N.y * L]);
  return P.map(p => p.join(',')).join(' ');
}
const reflejo = (f: number) => `matrix(${1 - 2 * N.x * N.x} ${-2 * N.x * N.y} ${-2 * N.x * N.y} ${1 - 2 * N.y * N.y} ${2 * f * N.x} ${2 * f * N.y})`;

function xCam(t: number) {
  if (t < T_ENTRA0) return -260;
  if (t < T_ENTRA1) return lerp(-260, X_PARA, easeOutBack(seg(t, T_ENTRA0, T_ENTRA1), 0.6));
  if (t < T_SALE) return X_PARA;
  const dt = t - T_SALE;
  return X_PARA - (dt < .18 ? 10 * Math.sin(dt / .18 * Math.PI) : 0) + (dt > .12 ? 1300 * Math.pow(dt - .12, 2.2) : 0);
}
function camTrans(t: number) {
  const h = 1 / 120, x = xCam(t);
  const a = (xCam(t + h) - 2 * x + xCam(t - h)) / (h * h);
  const v = (xCam(t + h) - xCam(t - h)) / (2 * h);
  return { x, incl: Math.max(-7, Math.min(7, -a * 0.0011)), estira: 1 + Math.min(0.06, Math.abs(v) * 0.00006) };
}

/** Prepara la escena dentro del <svg> y devuelve las funciones para pintar cada momento. */
function montar(svg: SVGSVGElement) {
  const q = (id: string) => svg.querySelector('#cfp-' + id) as SVGElement;
  const at = (id: string, k: string, v: string | number) => q(id).setAttribute(k, String(v));
  // ruedas
  for (const id of ['r1', 'r2']) {
    let h = '<circle r="23" fill="#1A1A1A"/><circle r="12.5" fill="#C9CEC9"/><circle r="5" fill="#8D948F"/>';
    for (let a = 0; a < 360; a += 45) h += `<circle cx="0" cy="-8.5" r="1.6" fill="#8D948F" transform="rotate(${a})"/>`;
    q(id).innerHTML = `<g>${h}</g>`;
  }
  const golpe = q('golpe');
  for (let i = 0; i < 6; i++) golpe.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'));

  const logoQuieto = (esc = 1, rot = 0, op = 1, dy = 0) => {
    at('pFrente', 'points', semiplano(-999, 1));
    at('logoFrente', 'opacity', 1); at('logoDorso', 'opacity', 0); at('pliegue', 'opacity', 0);
    at('sombraLogo', 'dy', 3); at('sombraLogo', 'stdDeviation', 3);
    at('logo', 'transform', `translate(${LOGO.x} ${LOGO.y + dy}) rotate(${rot}) scale(${esc})`);
    at('logo', 'opacity', op);
  };
  const sinCamion = () => at('camion', 'transform', 'translate(-600 0)');

  /** La animación completa en el instante t (segundos). */
  const completa = (t: number) => {
    const c = camTrans(t);
    const pega = muelle(t - T_PEGA, 0.05, 34, 9);
    const fr = muelle(t - T_ENTRA1 + .25, 0.04, 26, 8);
    at('camion', 'transform', `translate(${c.x} ${SUELO})`);
    at('camCuerpo', 'transform', `rotate(${c.incl} 0 0) scale(${ESC * (c.estira + pega * .6)} ${ESC * (1 - pega + fr * .5)}) translate(-172 -151)`);
    const giro = c.x / (23 * ESC) * 180 / Math.PI;
    ([['r1', 98], ['r2', 258]] as const).forEach(([id, cx]) => {
      at(id, 'transform', `translate(${cx} 128)`);
      (q(id).firstChild as SVGElement).setAttribute('transform', `rotate(${giro})`);
    });

    const pegado = t >= T_PEGA;
    const slap = muelle(t - T_PEGA, 0.22, 30, 9);
    at('calco', 'opacity', pegado ? 1 : 0);
    at('calco', 'transform', `translate(${CALCO.x} ${CALCO.y}) scale(${CALCO.esc * (1 + slap)} ${CALCO.esc * (1 - slap)})`);

    if (t < T_VUELA) {
      const u1 = seg(t, T_PEEL0, T_PEEL0 + .14), u2 = seg(t, T_PEEL0 + .24, T_PEEL1);
      const k = 0.12 * easeOut(u1) + 0.88 * (easeIn(u2) * 0.7 + u2 * 0.3);
      const f = lerp(F0, F1, k);
      at('pFrente', 'points', semiplano(f, 1));
      at('pDetras', 'points', semiplano(f, -1));
      at('logoDorso', 'transform', reflejo(f));
      at('logoDorso', 'opacity', k > 0 ? 1 : 0);
      at('logoFrente', 'opacity', 1);
      at('gDorso', 'x1', f * N.x); at('gDorso', 'y1', f * N.y); at('gDorso', 'x2', (f - 70) * N.x); at('gDorso', 'y2', (f - 70) * N.y);
      const g2 = f + 16 + 30 * k;
      at('gPliegue', 'x1', f * N.x); at('gPliegue', 'y1', f * N.y); at('gPliegue', 'x2', g2 * N.x); at('gPliegue', 'y2', g2 * N.y);
      at('pliegue', 'opacity', k > 0 ? 1 : 0);
      at('sombraLogo', 'dy', 3); at('sombraLogo', 'stdDeviation', 3);
      at('logo', 'transform', `translate(${LOGO.x} ${LOGO.y})`);
      at('logo', 'opacity', 1);
    } else if (!pegado) {
      const k = seg(t, T_VUELA + .08, T_PEGA), ke = easeInOut(k);
      const pop = seg(t, T_VUELA, T_VUELA + .08);
      const cc = camTrans(T_PEGA);
      const dx = cc.x + (CALCO.x - 172) * ESC, dy = SUELO + (CALCO.y - 151) * ESC;
      const x = lerp(LOGO.x, dx, ke), y = lerp(LOGO.y - 10 * pop, dy, ke) - Math.sin(Math.PI * k) * 45;
      const rot = -8 * pop + lerp(0, 360, ke) + muelle(t - T_VUELA - .1, 6, 14, 3);
      const esc = lerp(1 + .1 * pop, CALCO.esc * ESC, Math.pow(k, .8));
      const sq = 1 + muelle(t - T_VUELA, .12, 40, 10);
      at('pFrente', 'points', semiplano(-999, 1));
      at('logoFrente', 'opacity', 1); at('logoDorso', 'opacity', 0); at('pliegue', 'opacity', 0);
      const alto = Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k * .5) + pop * .3;
      at('sombraLogo', 'dy', 3 + 16 * alto); at('sombraLogo', 'stdDeviation', 3 + 7 * alto);
      at('logo', 'transform', `translate(${x} ${y}) rotate(${rot}) scale(${esc * sq} ${esc * (2 - sq)})`);
      at('logo', 'opacity', 1);
    } else {
      at('logo', 'opacity', 0);
    }

    const kk = seg(t, T_PEGA, T_PEGA + .25);
    const cx = c.x + (CALCO.x - 172) * ESC, cy = SUELO + (CALCO.y - 151) * ESC;
    Array.from(golpe.children).forEach((l, i) => {
      const a = [-2.6, -2.1, -1.6, -1.05, -0.55, 0.5][i], r0 = 30 + kk * 18, r1 = r0 + 10 * (1 - kk);
      l.setAttribute('d', `M${cx + Math.cos(a) * r0 * 1.2} ${cy + Math.sin(a) * r0 * .8} L${cx + Math.cos(a) * r1 * 1.2} ${cy + Math.sin(a) * r1 * .8}`);
      l.setAttribute('opacity', t >= T_PEGA && kk < 1 ? '1' : '0');
    });
  };

  /** Versión corta (ya salió hoy): el logo se levanta un poco y se desvanece. k de 0 a 1. */
  const corta = (k: number) => { sinCamion(); logoQuieto(1 + .06 * easeOut(k), 0, 1 - easeIn(k), -10 * easeOut(k)); };
  /** El logo se vuelve a pegar arriba (al volver al principio). k de 0 a 1. */
  const vuelve = (k: number) => {
    sinCamion();
    const e = easeOutBack(c01(k), 2.2);
    logoQuieto(lerp(0.55, 1, e), lerp(-10, 0, easeOut(k)), c01(k * 4));
    at('sombraLogo', 'dy', lerp(14, 3, easeOut(k))); at('sombraLogo', 'stdDeviation', lerp(8, 3, easeOut(k)));
  };
  return { completa, corta, vuelve, reposo: () => { sinCamion(); logoQuieto(); }, oculto: () => { sinCamion(); logoQuieto(1, 0, 0); } };
}

type Estado = 'reposo' | 'animando' | 'oculto' | 'volviendo';

export function CabeceraPegatina() {
  const caja = useRef<HTMLDivElement>(null);
  const lienzo = useRef<SVGSVGElement>(null);
  const fondo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svg = lienzo.current, box = caja.current, fd = fondo.current;
    const main = document.getElementById('app-main');
    if (!svg || !box || !fd || !main) return;
    const quieto = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const esc = montar(svg);
    esc.reposo();
    if (quieto) return;

    let estado: Estado = 'reposo';
    let raf = 0;

    const fijar = (si: boolean) => {
      if (si) {
        const r = box.getBoundingClientRect();
        Object.assign(svg.style, { position: 'fixed', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, zIndex: '40' });
        // velo esmerilado detrás de la escena: separa las pegatinas del texto de debajo
        Object.assign(fd.style, { display: 'block', height: `${Math.max(0, r.top) + r.width * VB_H / VB_W + 24}px`, opacity: '0' });
      } else {
        Object.assign(svg.style, { position: '', top: '', left: '', width: '', zIndex: '' });
        Object.assign(fd.style, { display: 'none', opacity: '0' });
      }
    };
    const correr = (dur: number, pinta: (k: number, t: number) => void, fin: () => void) => {
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const paso = (ahora: number) => {
        const t = (ahora - t0) / 1000;
        pinta(c01(t / dur), Math.min(t, dur));
        if (t < dur) raf = requestAnimationFrame(paso); else fin();
      };
      raf = requestAnimationFrame(paso);
    };
    const arriba = () => main.scrollTop <= 2;

    const volver = () => {
      estado = 'volviendo';
      correr(0.5, k => esc.vuelve(k), () => { esc.reposo(); estado = 'reposo'; if (!arriba()) despegar(); });
    };
    const despegar = () => {
      estado = 'animando';
      if (!yaSalioHoy()) {
        marcarHoy();
        fijar(true);
        correr(DURA, (_k, t) => { esc.completa(t); fd.style.opacity = String(easeOut(seg(t, 0, .25)) * (1 - easeIn(seg(t, DURA - .5, DURA)))); }, () => {
          fijar(false); esc.oculto(); estado = 'oculto';
          if (arriba()) volver();
        });
      } else {
        correr(0.3, k => esc.corta(k), () => { esc.oculto(); estado = 'oculto'; if (arriba()) volver(); });
      }
    };
    const alMover = () => {
      if (estado === 'reposo' && main.scrollTop > 6) despegar();
      else if (estado === 'oculto' && arriba()) volver();
    };
    main.addEventListener('scroll', alMover, { passive: true });
    return () => { main.removeEventListener('scroll', alMover); cancelAnimationFrame(raf); fijar(false); };
  }, []);

  return (
    <div className="cab-pegatina-zona">
      <div ref={caja} className="cab-pegatina" role="img" aria-label="Casa Fonso · Materiales de construcción"
        style={{ aspectRatio: `${VB_W} / ${ALTO_LOGO}` }}>
        <svg ref={lienzo} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: ESCENA_PEGATINA }} />
      </div>
      <div className="cab-pegatina-velo" aria-hidden="true" />
      <div ref={fondo} className="cab-pegatina-fondo" aria-hidden="true" />
    </div>
  );
}
