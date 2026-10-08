import type { ReactNode } from 'react';
import { CAMION_CUERPO } from './camionCuerpo';

/**
 * Dibujos estilo «pegatina» de Casa Fonso: planos, dos tonos, borde blanco recortado y sombra.
 * Se usan en momentos concretos (firmar, pantallas vacías, avisos buenos, sin cobertura, reparto),
 * nunca en botones ni menús.
 */

/** Filtros compartidos (borde blanco + sombra). Se montan una vez en la app. */
export function PegatinaDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="cfs-pega" x="-30%" y="-30%" width="160%" height="170%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="d" />
          <feFlood floodColor="#fff" /><feComposite in2="d" operator="in" result="b" />
          <feDropShadow in="b" dx="0" dy="3" stdDeviation="3" floodColor="#123A26" floodOpacity=".25" result="bs" />
          <feMerge><feMergeNode in="bs" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="cfs-pegaCam" x="-10%" y="-20%" width="120%" height="150%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d" />
          <feFlood floodColor="#fff" /><feComposite in2="d" operator="in" result="b" />
          <feDropShadow in="b" dx="0" dy="4" stdDeviation="3.5" floodColor="#123A26" floodOpacity=".22" result="bs" />
          <feMerge><feMergeNode in="bs" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
    </svg>
  );
}

const CHECK = (x: number, y: number, r: number) =>
  `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#2FAE66"/><path d="M${-r} 0 A${r} ${r} 0 0 0 ${r} 0 Z" fill="#1F7A47"/>` +
  `<path d="M${-r * .42} 0 l${r * .3} ${r * .3} l${r * .6} ${-r * .66}" fill="none" stroke="#fff" stroke-width="${r * .27}" stroke-linecap="round" stroke-linejoin="round"/></g>`;

const DIBUJOS = {
  /** sello redondo con check y cinta con texto */
  sello: (texto: string) => `<g filter="url(#cfs-pega)">
    <circle r="46" fill="#2FAE66"/><path d="M-46 0 A46 46 0 0 0 46 0 Z" fill="#1F7A47"/>
    <circle r="37" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="4 4" opacity=".7"/>
    <path d="M-16 -2 l11 11 l22 -24" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(0 30)"><rect x="-50" y="-11" width="100" height="22" rx="5" fill="#123A26"/>
    <text y="6" text-anchor="middle" font-family="Oswald, sans-serif" font-weight="600" font-size="16" fill="#fff" letter-spacing="1.5">${texto}</text></g></g>`,
  albaranOk: `<g filter="url(#cfs-pega)">
    <path d="M-34 -44 H18 L34 -28 V44 H-34 Z" fill="#FFFFFF"/><path d="M18 -44 V-28 H34 Z" fill="#E3E8E0"/>
    <rect x="-24" y="-30" width="30" height="5" rx="2.5" fill="#1F5A3A"/>
    <rect x="-24" y="-16" width="46" height="3.5" rx="1.75" fill="#C9D1C5"/><rect x="-24" y="-7" width="40" height="3.5" rx="1.75" fill="#C9D1C5"/>
    <rect x="-24" y="2" width="46" height="3.5" rx="1.75" fill="#C9D1C5"/><rect x="-24" y="11" width="30" height="3.5" rx="1.75" fill="#C9D1C5"/>
    <path d="M-22 30 q6 -10 12 0 t12 -2" fill="none" stroke="#1A1A1A" stroke-width="2.2" stroke-linecap="round"/>
    ${CHECK(30, 32, 17)}</g>`,
  facturaOk: `<g filter="url(#cfs-pega)">
    <path d="M-30 -44 H30 V44 l-7.5 -6 l-7.5 6 l-7.5 -6 l-7.5 6 l-7.5 -6 l-7.5 6 l-7.5 -6 l-7.5 6 Z" fill="#FFFFFF"/>
    <rect x="-20" y="-32" width="26" height="5" rx="2.5" fill="#1F5A3A"/>
    <rect x="-20" y="-18" width="40" height="3.5" rx="1.75" fill="#C9D1C5"/><rect x="-20" y="-9" width="34" height="3.5" rx="1.75" fill="#C9D1C5"/>
    <rect x="-20" y="0" width="40" height="3.5" rx="1.75" fill="#C9D1C5"/>
    <rect x="-20" y="14" width="40" height="7" rx="2" fill="#DDF1E5"/><rect x="2" y="15.5" width="16" height="4" rx="2" fill="#1F7A47"/>
    ${CHECK(28, 30, 17)}</g>`,
  cajaVacia: `<g filter="url(#cfs-pega)">
    <path d="M-30 -8 L-46 -26 L-14 -26 L2 -8 Z" fill="#E6CDA4"/><path d="M30 -8 L46 -26 L18 -26 L2 -8 Z" fill="#E6CDA4"/>
    <path d="M-30 -8 H30 V30 H-30 Z" fill="#D9B98A"/><path d="M-30 -8 H30 L24 -2 H-24 Z" fill="#8F6E45"/>
    <path d="M30 -8 L42 -16 V22 L30 30 Z" fill="#B8956A"/><path d="M-30 -8 L-18 -16 H42 L30 -8 Z" fill="#6E5333" opacity=".55"/></g>`,
  cajaOk: `<g filter="url(#cfs-pega)">
    <path d="M14 -10 L26 -18 V18 L14 26 Z" fill="#B8956A"/><rect x="-24" y="-10" width="38" height="36" rx="2" fill="#D9B98A"/><path d="M-24 -10 L-12 -18 H26 L14 -10 Z" fill="#E6CDA4"/>
    <rect x="-10" y="-10" width="9" height="36" fill="#2FAE66"/><path d="M-10 -10 L2 -18 H11 L-1 -10 Z" fill="#45C27A"/>
    ${CHECK(24, -16, 12)}</g>`,
  llave: `<g filter="url(#cfs-pega)"><g transform="rotate(-40)">
    <rect x="-5" y="-6" width="10" height="40" rx="5" fill="#C9CEC9"/><rect x="0" y="-6" width="5" height="40" rx="2.5" fill="#8D948F"/>
    <path d="M-13 -22 a14 14 0 1 0 26 0 l-6 6 h-14 z" fill="#C9CEC9"/><path d="M0 -8 a14 14 0 0 0 13 -14 l-6 6 h-7 z" fill="#8D948F"/>
    <rect x="-5" y="22" width="10" height="16" rx="5" fill="#E2453C"/><rect x="0" y="22" width="5" height="16" rx="2.5" fill="#B82E26"/></g>
    ${CHECK(20, -18, 12)}</g>`,
  llaveSola: `<g filter="url(#cfs-pega)"><g transform="rotate(-40)">
    <rect x="-5" y="-6" width="10" height="40" rx="5" fill="#C9CEC9"/><rect x="0" y="-6" width="5" height="40" rx="2.5" fill="#8D948F"/>
    <path d="M-13 -22 a14 14 0 1 0 26 0 l-6 6 h-14 z" fill="#C9CEC9"/><path d="M0 -8 a14 14 0 0 0 13 -14 l-6 6 h-7 z" fill="#8D948F"/>
    <rect x="-5" y="22" width="10" height="16" rx="5" fill="#E2453C"/><rect x="0" y="22" width="5" height="16" rx="2.5" fill="#B82E26"/></g></g>`,
  cono: `<g filter="url(#cfs-pega)"><path d="M-14 22 L-4 -22 H4 L14 22 Z" fill="#F28C28"/><path d="M-9 0 H9 L11 9 H-11 Z" fill="#fff"/><path d="M-6.5 -12 H6.5 L7.5 -6 H-7.5 Z" fill="#fff"/>
    <rect x="-20" y="20" width="40" height="7" rx="2" fill="#D96F14"/></g>`,
};

type Dibujo = Exclude<keyof typeof DIBUJOS, 'sello'>;

/** Un dibujo suelto, centrado en un lienzo de 120×110. */
export function Ilustracion({ dibujo, tam = 96, className }: { dibujo: Dibujo; tam?: number; className?: string }) {
  return (
    <svg viewBox="-60 -55 120 110" width={tam} height={tam * 110 / 120} className={`peg-ilus ${className ?? ''}`} aria-hidden="true"
      style={{ overflow: 'visible' }} dangerouslySetInnerHTML={{ __html: DIBUJOS[dibujo] as string }} />
  );
}

/** Sello «FIRMADO» / «ENTREGADO» que cae con un golpe. */
export function Sello({ texto = 'FIRMADO', tam = 150 }: { texto?: string; tam?: number }) {
  const lineas = [-2.6, -2.1, -1.6, -1.05, -0.55, 0].map(a =>
    `<path class="peg-golpe-linea" d="M${(Math.cos(a) * 62).toFixed(1)} ${(Math.sin(a) * 50).toFixed(1)} L${(Math.cos(a) * 76).toFixed(1)} ${(Math.sin(a) * 61).toFixed(1)}" stroke="#123A26" stroke-width="3" stroke-linecap="round"/>`).join('');
  return (
    <svg viewBox="-80 -70 160 140" width={tam} height={tam * 140 / 160} className="peg-sello" aria-hidden="true" style={{ overflow: 'visible' }}
      dangerouslySetInnerHTML={{ __html: `<g class="peg-golpe">${lineas}</g><g class="peg-sello-cae"><g transform="rotate(-12)">${DIBUJOS.sello(texto)}</g></g>` }} />
  );
}

/** Pantalla tapada con el sello al terminar de firmar. */
export function SelloHecho({ texto, titulo }: { texto: string; titulo: string }) {
  return (
    <div className="cf-done" role="status" aria-live="polite">
      <div className="cf-done-box">
        <Sello texto={texto} tam={190} />
        <div className="cf-done-text">{titulo}</div>
      </div>
    </div>
  );
}

function rueda(cx: number, pinchada: boolean) {
  if (pinchada) return `<ellipse cx="${cx}" cy="138" rx="30" ry="13" fill="#1A1A1A"/><ellipse cx="${cx}" cy="136" rx="13" ry="7" fill="#C9CEC9"/><circle cx="${cx}" cy="136" r="3.5" fill="#8D948F"/>`;
  let h = `<circle cx="${cx}" cy="128" r="23" fill="#1A1A1A"/><circle cx="${cx}" cy="128" r="12.5" fill="#C9CEC9"/><circle cx="${cx}" cy="128" r="5" fill="#8D948F"/>`;
  for (let a = 0; a < 360; a += 45) h += `<circle cx="${cx}" cy="119.5" r="1.6" fill="#8D948F" transform="rotate(${a} ${cx} 128)"/>`;
  return `<g class="peg-rueda">${h}</g>`;
}

const CALCO = '<g transform="translate(268 68) scale(.24)" filter="url(#cfs-pega)">'
  + '<image href="/brand/logo-tejado.png" x="-28" y="-46" width="56" height="42.8"/><image href="/brand/logo-palabra.png" x="-95" y="2" width="190" height="39.6"/></g>';

/** El camión de Casa Fonso como pegatina. modo: rodando (se mueve), aparcado (con cono) o pinchado. */
export function CamionPegatina({ modo, ancho = 260 }: { modo: 'rodando' | 'aparcado' | 'pinchado'; ancho?: number }) {
  const pinchada = modo === 'pinchado';
  const camion = (x: number, y: number, esc: number, rot = 0) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${esc}) translate(-172 -151)"><g class="peg-bote"><g filter="url(#cfs-pegaCam)">`
    + CAMION_CUERPO + rueda(98, pinchada) + rueda(258, false) + CALCO + '</g></g></g>';
  let s = '';
  if (modo === 'rodando') {
    s += '<path class="peg-carretera" d="M0 104 H260" stroke="#C9D1C5" stroke-width="2" stroke-dasharray="10 9" stroke-linecap="round"/>';
    s += [[46, 56, 22], [36, 72, 30], [50, 88, 18]].map(([x, y, l], i) =>
      `<path class="peg-viento" style="animation-delay:${i * .18}s" d="M${x} ${y} h${-l}" stroke="#123A26" stroke-width="2.6" stroke-linecap="round"/>`).join('');
    s += camion(150, 106, .5, -2);
  } else if (modo === 'aparcado') {
    s += '<path d="M8 104 H252" stroke="#C9D1C5" stroke-width="2" stroke-linecap="round"/>' + camion(118, 106, .5);
    s += `<g transform="translate(222 82) scale(.75)">${DIBUJOS.cono}</g>`;
    s += '<text class="peg-zzz" x="92" y="24" font-family="Oswald, sans-serif" font-size="16" fill="#6B7468">z z z</text>';
  } else {
    s += '<path d="M10 126 H250" stroke="#C9D1C5" stroke-width="2" stroke-linecap="round"/>' + camion(130, 128, .58, -6);
    s += '<text x="64" y="40" font-family="Oswald, sans-serif" font-weight="600" font-size="22" fill="#123A26" transform="rotate(-8 64 40)">¡pfff!</text>';
  }
  const alto = modo === 'pinchado' ? 150 : 120;
  return (
    <svg viewBox={`0 0 260 ${alto}`} width={ancho} height={ancho * alto / 260} className={`peg-camion peg-${modo}`} aria-hidden="true"
      style={{ overflow: 'visible', maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: s }} />
  );
}

/** Estado vacío con dibujo, título y texto. */
export function Vacio({ dibujo, camion, titulo, texto, children }: {
  dibujo?: Dibujo; camion?: 'rodando' | 'aparcado' | 'pinchado'; titulo: string; texto?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="peg-vacio">
      {camion ? <CamionPegatina modo={camion} ancho={240} /> : dibujo && <Ilustracion dibujo={dibujo} tam={120} />}
      <div className="peg-vacio-titulo">{titulo}</div>
      {texto && <div className="peg-vacio-texto">{texto}</div>}
      {children}
    </div>
  );
}
