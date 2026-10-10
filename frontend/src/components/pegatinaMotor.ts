/* Motor de la animación «pegatina» del arranque: tiempos, geometría y montaje de la escena (logo + camión). */

export const VB_W = 393, VB_H = 320, ALTO_LOGO = 128;   // alto (en coords de la escena) que ocupa el logo en reposo
export const DURA = 2.75;                                // segundos de la animación completa

// ---------------------------------------------------------------- utilidades
export const c01 = (x: number) => Math.max(0, Math.min(1, x));
export const seg = (t: number, a: number, b: number) => c01((t - a) / (b - a));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;
export const easeInOut = (x: number) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutBack = (x: number, c = 1.4) => 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
export const muelle = (dt: number, A: number, w = 30, k = 8) => (dt < 0 ? 0 : A * Math.exp(-k * dt) * Math.sin(w * dt));


// ---------------------------------------------------------------- tiempos y geometría (coords de la escena 393×320)
const T_PEEL0 = 0.2, T_PEEL1 = 0.83;
const T_VUELA = 0.83, T_PEGA = 1.47;
const T_ENTRA0 = 0.0, T_ENTRA1 = 0.83;
export const T_SALE = 1.87;
export const LOGO = { x: 196.5, y: 62 };
const N = (() => { const x = -0.83, y = -0.56, l = Math.hypot(x, y); return { x: x / l, y: y / l }; })();
const F0 = N.x * 104 + N.y * 50;
const F1 = lerp(F0, N.x * -104 + N.y * -58, 0.4);
export const ESC = 0.84, SUELO = 244, X_PARA = 196;
const CALCO = { x: 268, y: 68, esc: 0.24 };   // puerta de la cabina (coords del camión)

function semiplano(f: number, lado: number) {
  const p0 = { x: f * N.x, y: f * N.y }, u = { x: -N.y, y: N.x }, L = 5000;
  const P = [[p0.x + u.x * L, p0.y + u.y * L], [p0.x - u.x * L, p0.y - u.y * L]];
  P.push([P[1][0] + lado * N.x * L, P[1][1] + lado * N.y * L], [P[0][0] + lado * N.x * L, P[0][1] + lado * N.y * L]);
  return P.map(p => p.join(',')).join(' ');
}
const reflejo = (f: number) => `matrix(${1 - 2 * N.x * N.x} ${-2 * N.x * N.y} ${-2 * N.x * N.y} ${1 - 2 * N.y * N.y} ${2 * f * N.x} ${2 * f * N.y})`;

export function xCam(t: number) {
  if (t < T_ENTRA0) return -260;
  if (t < T_ENTRA1) return lerp(-260, X_PARA, easeOutBack(seg(t, T_ENTRA0, T_ENTRA1), 0.6));
  if (t < T_SALE) return X_PARA;
  const dt = t - T_SALE;
  return X_PARA - (dt < .18 ? 10 * Math.sin(dt / .18 * Math.PI) : 0) + (dt > .12 ? 1300 * Math.pow(dt - .12, 2.2) : 0);
}
export function camTrans(t: number) {
  const h = 1 / 120, x = xCam(t);
  const a = (xCam(t + h) - 2 * x + xCam(t - h)) / (h * h);
  const v = (xCam(t + h) - xCam(t - h)) / (2 * h);
  return { x, incl: Math.max(-7, Math.min(7, -a * 0.0011)), estira: 1 + Math.min(0.06, Math.abs(v) * 0.00006) };
}

/** Prepara la escena dentro del <svg> y devuelve las funciones para pintar cada momento. */
export function montar(svg: SVGSVGElement, pre: string) {
  const q = (id: string) => svg.querySelector('#' + pre + id) as SVGElement;
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

  /** Logo plano en cualquier sitio (centro, giro, escala). */
  const ponLogo = (x: number, y: number, rot = 0, esc = 1, op = 1) => {
    logoQuieto(); at('logo', 'transform', `translate(${x} ${y}) rotate(${rot}) scale(${esc})`); at('logo', 'opacity', op);
  };
  /** Logo en su sitio, despegándose por la esquina (k de 0 a 1). */
  const pelar = (k: number) => {
    const f = lerp(F0, F1, k);
    at('pFrente', 'points', semiplano(f, 1)); at('pDetras', 'points', semiplano(f, -1));
    at('logoDorso', 'transform', reflejo(f)); at('logoDorso', 'opacity', k > 0 ? 1 : 0); at('logoFrente', 'opacity', 1);
    at('gDorso', 'x1', f * N.x); at('gDorso', 'y1', f * N.y); at('gDorso', 'x2', (f - 70) * N.x); at('gDorso', 'y2', (f - 70) * N.y);
    const g2 = f + 16 + 30 * k;
    at('gPliegue', 'x1', f * N.x); at('gPliegue', 'y1', f * N.y); at('gPliegue', 'x2', g2 * N.x); at('gPliegue', 'y2', g2 * N.y);
    at('pliegue', 'opacity', k > 0 ? 1 : 0);
    at('sombraLogo', 'dy', 3); at('sombraLogo', 'stdDeviation', 3);
    at('logo', 'transform', `translate(${LOGO.x} ${LOGO.y})`); at('logo', 'opacity', 1);
  };
  /** Camión en x (suelo), con inclinación; sin pegatina en la puerta. */
  const ponCamion = (x: number, incl = 0) => {
    at('camion', 'transform', `translate(${x} ${SUELO})`);
    at('camCuerpo', 'transform', `rotate(${incl} 0 0) scale(${ESC}) translate(-172 -151)`);
    const giro = x / (23 * ESC) * 180 / Math.PI;
    ([['r1', 98], ['r2', 258]] as const).forEach(([id, cx]) => {
      at(id, 'transform', `translate(${cx} 128)`);
      (q(id).firstChild as SVGElement).setAttribute('transform', `rotate(${giro})`);
    });
    at('calco', 'opacity', 0);
  };

  /** La animación completa en el instante t (segundos). */
  const completa = (t: number, parado = false) => {
    // parado: el camión ya llegó antes (fiestas) y espera quieto hasta arrancar
    const c = parado && t < T_SALE ? { x: X_PARA, incl: 0, estira: 1 } : camTrans(t);
    const pega = muelle(t - T_PEGA, 0.05, 34, 9);
    const fr = parado ? 0 : muelle(t - T_ENTRA1 + .25, 0.04, 26, 8);
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
  return { completa, corta, vuelve, ponLogo, pelar, ponCamion, q, at, reposo: () => { sinCamion(); logoQuieto(); }, oculto: () => { sinCamion(); logoQuieto(1, 0, 0); } };
}

// ---------------------------------------------------------------- easter egg: se cae la carga
// Se añade encima de la animación normal (montar): mismos tiempos para el logo y el camión.

const P_ANCHO = 58;                       // ancho del palé (coords propias)
const P_REPOSO = 70, P_TOPE = 116;        // x del palé en la caja: al salir y tras el frenazo (contra la grúa)
const T_DESL0 = 0.45, T_DESL1 = 0.8;      // se desliza hacia la cabina al frenar
const G = 2000;                           // gravedad (px/s², escena)

/** Posición del borde trasero de la caja (mundo) en t. */
const bordeCaja = (t: number) => xCam(t) + (40 - 172) * ESC;

export function montarHuevo(svg: SVGSVGElement, pre: string) {
  const base = montar(svg, pre);
  const q = (id: string) => svg.querySelector('#' + pre + id) as SVGElement;
  const at = (id: string, k: string, v: string | number) => q(id).setAttribute(k, String(v));

  // Palé en el mundo justo al empezar el acelerón (para que se quede atrás por inercia)
  const pxMundo = X_PARA + (P_TOPE - 172) * ESC;          // esquina inferior izquierda
  const pyMundo = SUELO + (76 - 151) * ESC;
  const deriva = (t: number) => 14 * easeOut(seg(t, T_SALE + .15, T_SALE + .6));
  // cuándo se queda sin caja debajo (el borde trasero pasa el centro del palé)
  let tVuelca = T_SALE + .2;
  for (let t = T_SALE; t < T_SALE + 2; t += 1 / 600) {
    if (bordeCaja(t) > pxMundo + deriva(t) + P_ANCHO * ESC * .55) { tVuelca = t; break; }
  }
  const caida = (h: number) => Math.sqrt(2 * h / G);
  const tCae = caida(SUELO - pyMundo);
  const tGolpe = tVuelca + .06 + tCae;
  const PX_SUELO = pxMundo + 20;                             // donde queda en el suelo

  // Carretilla
  const ESC_C = ESC;
  const FX_PARA = PX_SUELO - 78 * ESC_C;                     // las horquillas debajo del palé
  const T_C0 = tGolpe + .45, T_C1 = T_C0 + .75;              // entra
  const T_L0 = T_C1 + .12, T_L1 = T_L0 + .3;                 // sube las horquillas
  const T_S0 = T_L0 + .2, T_S1 = T_S0 + .38;                 // el saco salta encima del palé
  const T_R0 = T_S1 + .25, T_R1 = T_R0 + 1.15;               // se va hacia la derecha
  const DURA_H = T_R1 + .15;

  const xCarr = (t: number) => {
    if (t < T_C0) return -220;
    if (t < T_R0) return lerp(-220, FX_PARA, easeOutBack(seg(t, T_C0, T_C1), 0.8));
    return FX_PARA + 560 * Math.pow(seg(t, T_R0, T_R1), 1.8);
  };

  // saco suelto: sale del palé al golpe y luego vuelve encima
  const sacoSuelo = { x: PX_SUELO + 70, y: SUELO - 11 * ESC };

  const completa = (t: number) => {
    base.completa(Math.min(t, DURA + 1));

    // ---- palé
    if (t < T_SALE) {
      // va en la caja: baches al entrar, se desliza al frenar y choca con la grúa
      const k = easeIn(seg(t, T_DESL0, T_DESL1));
      const x = lerp(P_REPOSO, P_TOPE, k);
      const bache = t < T_ENTRA1 ? -Math.abs(Math.sin(t * 26)) * 3.2 * (1 - seg(t, .35, .7)) : 0;
      const choque = muelle(t - T_DESL1, 7, 30, 7);
      const ladeo = t < T_DESL0 ? -3 * Math.sin(t * 13) * (1 - seg(t, .3, T_DESL0)) : 0;
      at('paleCam', 'opacity', 1); at('paleMundo', 'opacity', 0);
      at('paleCam', 'transform', `translate(${x} ${76 + bache}) rotate(${choque + ladeo} ${P_ANCHO} 0)`);
      const kk = seg(t, T_DESL1, T_DESL1 + .22);
      at('choque', 'opacity', t >= T_DESL1 && kk < 1 ? 1 - kk : 0);
      at('choque', 'transform', `translate(176 44) scale(${.8 + kk * .5})`);
    } else {
      at('choque', 'opacity', 0);
      at('paleCam', 'opacity', 0); at('paleMundo', 'opacity', 1);
      let x = pxMundo + deriva(t), y = pyMundo, rot = 0;
      if (t >= tVuelca) {
        const dt = t - tVuelca;
        const caer = Math.max(0, dt - .06);
        rot = -38 * easeOut(c01(dt / .3));
        x += 8 * c01(dt / .35);
        y = Math.min(SUELO, pyMundo + .5 * G * caer * caer);
      }
      if (t >= tGolpe) {
        const dt = t - tGolpe;
        x = PX_SUELO; y = SUELO - Math.abs(muelle(dt, 10, 18, 9));
        rot = lerp(-38, -7, easeOut(c01(dt / .12))) + muelle(dt, 6, 26, 7);
      }
      // la carretilla lo pincha
      const xc = xCarr(t);
      const h = 16 * easeInOut(seg(t, T_L0, T_L1));
      if (t >= T_L0) {
        x = xc + 78 * ESC_C; y = SUELO + (-1 - h) * ESC_C;
        rot = lerp(-7, 0, easeOut(seg(t, T_L0, T_L0 + .18)));
      }
      at('paleMundo', 'transform', `translate(${x} ${y}) scale(${ESC}) rotate(${rot} 29 0)`);

      // saco
      let sx = 0, sy = 0, sr = 0, so = 0;
      if (t >= tGolpe && t < T_S0) {
        const dt = t - tGolpe, k = c01(dt / .38);
        sx = lerp(PX_SUELO + 30, sacoSuelo.x, easeOut(k));
        sy = lerp(SUELO - 44 * ESC, sacoSuelo.y, k) - Math.sin(Math.PI * k) * 26;
        sr = lerp(-20, 14, k) + muelle(dt - .38, 8, 24, 8); so = 1;
      } else if (t >= T_S0) {
        const k = easeInOut(seg(t, T_S0, T_S1));
        const encimaX = x + 20 * ESC, encimaY = y - 44 * ESC - 11 * ESC;
        sx = lerp(sacoSuelo.x, encimaX, k); sy = lerp(sacoSuelo.y, encimaY, k) - Math.sin(Math.PI * k) * 34;
        sr = lerp(14, 360, k); so = 1;
      }
      at('saco', 'opacity', so);
      at('saco', 'transform', `translate(${sx} ${sy}) scale(${ESC}) rotate(${sr % 360} 9 5)`);

      // polvo del golpe
      const kp = seg(t, tGolpe, tGolpe + .55);
      at('polvo', 'opacity', t >= tGolpe && kp < 1 ? (1 - kp) * .95 : 0);
      at('polvo', 'transform', `translate(${PX_SUELO + 24} ${SUELO - 4}) scale(${.6 + kp * .7})`);
      // ¡UY!
      const ku = seg(t, tVuelca, tVuelca + .18), ko = seg(t, tGolpe + .35, tGolpe + .6);
      at('uy', 'opacity', t >= tVuelca ? (1 - ko) : 0);
      at('uy', 'transform', `translate(${pxMundo - 14} ${pyMundo - 60}) rotate(-8) scale(${easeOutBack(ku, 2.4)})`);

      // carretilla
      const acel = (xCarr(t + 1 / 60) - 2 * xCarr(t) + xCarr(t - 1 / 60)) * 3600;
      at('carr', 'transform', `translate(${xc} ${SUELO}) scale(${ESC_C}) rotate(${Math.max(-5, Math.min(5, -acel * .0012))} 40 0)`);
      at('horq', 'transform', `translate(0 ${-h})`);
      const giro = xc / 12 * 180 / Math.PI;
      for (const id of ['cr1', 'cr2']) q(id).setAttribute('transform', `rotate(${giro})`);
      const sale = t >= T_R0 - .1 && t < T_R1;
      at('girofaro', 'opacity', sale && Math.floor((t - T_R0) * 6) % 2 === 0 ? 1 : .25);
    }
  };
  return { ...base, completa, dura: DURA_H };
}

