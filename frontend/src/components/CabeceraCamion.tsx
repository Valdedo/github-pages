import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Cabecera de Inicio en el móvil.
 * Arriba del todo: el logo grande (tejado + CASA FONSO). Al deslizar hacia arriba
 * entra el camión, el tejado se sube a la caja y el camión se va por la derecha;
 * queda una franja fina con el logo pequeño. Va unido al dedo: al volver arriba, se rebobina.
 */

const ALTO_MAX = 176;   // cabecera abierta
const ALTO_MIN = 60;    // cabecera recogida
const ENTRA = 80;       // px de desplazamiento en los que entra el camión y sube el tejado
const SALE_DESDE = 92;  // a partir de aquí arranca
const SALE = 130;       // px que tarda en salir de la pantalla

const c01 = (x: number) => Math.max(0, Math.min(1, x));
const suave = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Camión tipo MAN TGM de perfil: cabina plana, grúa plegada tras la cabina y caja abierta. */
function Camion({ ruedas }: { ruedas: React.RefObject<SVGGElement[]> }) {
  const rueda = (cx: number, i: number) => (
    <g key={cx} ref={el => { if (el && ruedas.current) ruedas.current[i] = el; }} style={{ transformOrigin: `${cx}px 49px`, transformBox: 'view-box' }}>
      <circle cx={cx} cy={49} r={8.6} fill="#1A1A1A" />
      <circle cx={cx} cy={49} r={4.4} fill="#C9D1C5" />
      <circle cx={cx} cy={49} r={1.4} fill="#4A5249" />
      {[0, 90, 180, 270].map(a => (
        <rect key={a} x={cx - 0.7} y={44.8} width={1.4} height={2.2} rx={0.5} fill="#4A5249" transform={`rotate(${a} ${cx} 49)`} />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 164 62" width="132" height="50" aria-hidden="true" style={{ overflow: 'visible' }}>
      {/* sombra en el suelo */}
      <ellipse cx="82" cy="58.5" rx="76" ry="2.2" fill="rgb(18 58 38 / .16)" />
      {/* chasis */}
      <rect x="6" y="41" width="146" height="5" rx="1.5" fill="#3A3F3A" />
      {/* caja abierta (aquí va el tejado) */}
      <rect x="6" y="31" width="92" height="11" rx="1.5" fill="#1F5A3A" />
      <rect x="6" y="31" width="92" height="2.4" rx="1" fill="#2FAE66" />
      {[29, 52, 75].map(x => <rect key={x} x={x} y="33.4" width="1.2" height="8.6" fill="#123A26" />)}
      {/* grúa plegada detrás de la cabina */}
      <rect x="100" y="16" width="8" height="26" rx="1.5" fill="#2FAE66" />
      <rect x="100.5" y="9" width="5" height="16" rx="1.5" fill="#1F7A47" transform="rotate(-8 103 17)" />
      <rect x="97" y="38" width="14" height="5" rx="1" fill="#1F5A3A" />
      {/* cabina plana (blanca, con la franja de la marca) */}
      <path d="M111 44 V12 Q111 7 116 7 H148 Q152 7 152.6 11 L154.4 34 Q154.6 38 154.6 42 V44 Z" fill="#FFFFFF" stroke="#C9D1C5" strokeWidth="1" />
      <path d="M127 11 H149 Q150.6 11 150.8 12.8 L151.9 25 H127 Z" fill="#BFD7DE" />
      <path d="M115 11 H124 V25 H115 Z" fill="#BFD7DE" opacity=".85" />
      <rect x="111.5" y="31" width="43" height="3.4" fill="#2FAE66" />
      <rect x="111.5" y="34.4" width="43" height="1.4" fill="#1F5A3A" />
      <line x1="125.5" y1="11" x2="125.5" y2="43" stroke="#C9D1C5" strokeWidth="1" />
      {/* parrilla, faro, parachoques, retrovisor */}
      {[37, 39.5].map(y => <rect key={y} x="150.5" y={y} width="4" height="1.2" rx=".5" fill="#4A5249" />)}
      <rect x="151.2" y="27.5" width="3.4" height="2.6" rx="1" fill="#F5C542" />
      <rect x="146" y="42" width="10" height="3.6" rx="1.2" fill="#3A3F3A" />
      <rect x="155" y="12" width="1.4" height="11" rx=".7" fill="#3A3F3A" />
      {/* paso de rueda */}
      <path d="M128 44 a11 11 0 0 1 22 0" fill="#3A3F3A" />
      <path d="M21 44 a11 11 0 0 1 22 0" fill="#3A3F3A" />
      {rueda(139, 0)}
      {rueda(32, 1)}
    </svg>
  );
}

export function CabeceraCamion() {
  const caja = useRef<HTMLElement>(null);
  const tejado = useRef<HTMLImageElement>(null);
  const letras = useRef<HTMLDivElement>(null);
  const camion = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLAnchorElement>(null);
  const ruedas = useRef<SVGGElement[]>([]);
  const [quieto] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (quieto) return;
    const main = document.getElementById('app-main');
    if (!main) return;
    let raf = 0;

    const pintar = () => {
      raf = 0;
      const el = caja.current, tj = tejado.current, lt = letras.current, cm = camion.current, mn = mini.current;
      if (!el || !tj || !lt || !cm || !mn) return;
      const y = Math.max(0, main.scrollTop);
      const W = el.clientWidth;
      const a = suave(c01(y / ENTRA));                 // entrada del camión y subida del tejado
      const b = suave(c01((y - SALE_DESDE) / SALE));   // salida
      const alto = Math.round(lerp(ALTO_MAX, ALTO_MIN, c01(y / ENTRA)));
      el.style.height = `calc(${alto}px + env(safe-area-inset-top, 0px))`;

      // Camión: entra por la izquierda hasta el centro y luego se va por la derecha
      const anchoCam = 132, esc = 132 / 164;
      const xCentro = (W - anchoCam) / 2;
      const x = lerp(-anchoCam - 20, xCentro, a) + b * (W - xCentro + 30);
      const baseY = alto - 53;
      cm.style.transform = `translate3d(${x}px, ${baseY}px, 0)`;
      cm.style.opacity = a > 0.01 ? '1' : '0';
      // Ruedas girando según lo recorrido (radio ~8.6)
      const giro = (x / (8.6 * esc)) * (180 / Math.PI);
      ruedas.current.forEach(r => { if (r) r.style.transform = `rotate(${giro}deg)`; });

      // Tejado: de arriba en el centro a la caja del camión
      const tjAnchoIni = 56, tjAnchoFin = 32;
      const tjAncho = lerp(tjAnchoIni, tjAnchoFin, a);
      const tjAlto = tjAncho * 256 / 335;
      const tjX0 = (W - tjAnchoIni) / 2, tjY0 = 12;
      const enCajaX = x + 52 * esc - tjAncho / 2;  // centro de la caja
      const enCajaY = baseY + 31 * esc - tjAlto + 1;  // apoyado en la caja
      const tx = lerp(tjX0, enCajaX, a), ty = lerp(tjY0, enCajaY, a);
      tj.style.width = `${tjAncho}px`;
      tj.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;

      // Letras: se achican y desaparecen
      const ltAncho = 190;
      lt.style.transform = `translate3d(${(W - ltAncho) / 2}px, ${tjY0 + tjAnchoIni * 256 / 335 + 6 - a * 18}px, 0) scale(${1 - a * 0.25})`;
      lt.style.opacity = String(c01(1 - a * 2.6));

      // Logo pequeño cuando el camión ya se ha ido
      const m = c01((b - 0.55) / 0.45);
      mn.style.opacity = String(m);
      mn.style.transform = `translate3d(-50%, ${(1 - m) * 8}px, 0)`;
      mn.style.pointerEvents = m > 0.5 ? 'auto' : 'none';
      el.classList.toggle('recogida', alto <= ALTO_MIN + 1);
    };

    const alMover = () => { if (!raf) raf = requestAnimationFrame(pintar); };
    pintar();
    main.addEventListener('scroll', alMover, { passive: true });
    window.addEventListener('resize', alMover);
    return () => { main.removeEventListener('scroll', alMover); window.removeEventListener('resize', alMover); cancelAnimationFrame(raf); };
  }, [quieto]);

  if (quieto) {
    return (
      <header className="cabecera-camion recogida" style={{ height: `calc(${ALTO_MIN}px + env(safe-area-inset-top, 0px))` }}>
        <Link to="/" className="cabecera-mini" style={{ opacity: 1, transform: 'translateX(-50%)' }} aria-label="Casa Fonso">
          <img src="/brand/logo-horizontal.png" alt="Casa Fonso · Materiales de construcción" />
        </Link>
      </header>
    );
  }

  return (
    <header ref={caja} className="cabecera-camion" aria-label="Casa Fonso">
      <div className="cabecera-escena">
        <div ref={letras} className="cabecera-letras">
          <img src="/brand/logo-apilado-letras.png" alt="Casa Fonso" />
          <span>Materiales de construcción</span>
        </div>
        <div ref={camion} className="cabecera-cam"><Camion ruedas={ruedas} /></div>
        <img ref={tejado} className="cabecera-tejado" src="/brand/logo-tejado.png" alt="" aria-hidden="true" />
        <Link ref={mini} to="/" className="cabecera-mini" aria-label="Casa Fonso">
          <img src="/brand/logo-horizontal.png" alt="" />
        </Link>
      </div>
    </header>
  );
}
