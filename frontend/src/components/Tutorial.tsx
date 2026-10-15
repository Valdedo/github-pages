import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Tutorial guiado («toca aquí, haz esto»): va resaltando cada botón con un hueco de luz
 * y un cartel al lado. Se abre desde las Novedades o desde «Tutorial» en el menú
 * (evento `cf-tutorial`). No hace nada por la persona: solo enseña dónde está cada cosa.
 */
interface Paso {
  ruta?: string;
  /** Lo que se resalta: el primero que se vea en pantalla. Sin nada, el cartel sale en el centro. */
  sel?: string[];
  titulo: string;
  texto: string;
  /** Texto si lo que se encuentra es el segundo de `sel` (p. ej. en el móvil está dentro de «Más»). */
  textoOtro?: string;
}

const PASOS: Paso[] = [
  { titulo: 'Te enseño lo nuevo en un minuto',
    texto: 'Vamos paso a paso. Pulsa «Siguiente» para avanzar o «Saltar» si ya lo sabes. Puedes volver a verlo cuando quieras: toca tu círculo de arriba y «Ver el tutorial».' },
  { ruta: '/', sel: ['[data-tour="cuenta"]', '.cuenta-fila'], titulo: 'Tu círculo',
    texto: 'Toca tu inicial y ves tu turno de hoy y de mañana. Desde ahí entras a tus turnos de la semana, tu código, los avisos y cerrar sesión.',
    textoOtro: 'Aquí abajo está tu nombre: tócalo y ves tu turno de hoy y de mañana, tus turnos, tu código, los avisos y cerrar sesión.' },
  { ruta: '/firmas', sel: ['[data-tour="nav-firmas"]'], titulo: 'Albaranes de venta',
    texto: 'Aquí van los albaranes de TreyFACT a clientes. Los de proveedor están en «Albaranes de compra».' },
  { ruta: '/firmas', sel: ['[data-tour="subir-albaranes"]'], titulo: 'Sube el albarán',
    texto: 'Haz el albarán en TreyFACT, guárdalo en PDF y súbelo con este botón. En el ordenador también puedes arrastrarlo a la pantalla.' },
  { ruta: '/firmas', sel: ['.firma-card'], titulo: 'Si lo firma en la tienda',
    texto: 'Toca el albarán para abrirlo y que el cliente firme ahí mismo, en la pantalla o en la tableta de firma.' },
  { ruta: '/firmas', sel: ['.camion-btn:not(.on)', '.camion-btn'], titulo: 'Si va a obra: «Al camión»',
    texto: 'Pulsa «Al camión» y elige si va en un viaje nuevo o en uno que ya se está preparando. La app saca sola los materiales del albarán, sin precios.' },
  { ruta: '/cargas', sel: ['.carga-card', '[data-tour="nueva-carga"]'], titulo: 'La orden de carga',
    texto: 'Aquí están los viajes. Ábrelo para ir marcando lo que se carga y, al acabar, pulsa «Listo para llevar».',
    textoOtro: 'Aquí salen los viajes que se preparan. Con «Nueva carga» también puedes elegir varios albaranes a la vez.' },
  { ruta: '/cargas', titulo: 'Mandar a Melchor y firmar',
    texto: 'Dentro de la orden, «Enviar a Melchor» se la pone en su móvil. Si la lleva otro, se carga y se firma desde la propia orden. Cuando el cliente firma la hoja de entrega, el albarán queda firmado también.' },
  { ruta: '/firmas', sel: ['[data-tour="filtro-cliente"]', '[data-tour="filtrar"]'], titulo: 'Obras de cada cliente',
    texto: 'Elige un cliente aquí (en el móvil, dentro de «Filtrar») y salen sus obras como botones. En «Por facturar» puedes facturar obra por obra.' },
  { ruta: '/firmas', sel: ['[data-tour="nav-tarifas"]', '[data-tour="nav-mas"]'], titulo: 'Tarifas de proveedor',
    texto: 'Las tarifas están aquí. Busca por medidas, por ejemplo «50x50x4», y ves el precio y la factura.',
    textoOtro: 'Las tarifas están dentro de «Más», en el apartado «Mostrador». Busca por medidas, por ejemplo «50x50x4».' },
  { titulo: '¡Listo!',
    texto: 'Eso es todo. Si algo no sale como esperas, díselo a Andrés.' },
];

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

export function Tutorial({ onCerrar }: { onCerrar: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [i, setI] = useState(0);
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const [otro, setOtro] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const paso = PASOS[i];

  // Ir a la pantalla del paso
  useEffect(() => {
    if (paso.ruta && location.pathname !== paso.ruta) navigate(paso.ruta);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // Buscar lo que hay que resaltar (las pantallas tardan un poco en cargar)
  const buscar = useCallback(() => {
    if (!paso.sel) return null;
    for (let k = 0; k < paso.sel.length; k++) {
      const el = [...document.querySelectorAll(paso.sel[k])].find(visible);
      if (el) return { el, k };
    }
    return null;
  }, [paso]);

  useLayoutEffect(() => {
    setCaja(null); setOtro(false);
    if (!paso.sel) return;
    setBuscando(true);
    let vivo = true, intentos = 0;
    const probar = () => {
      if (!vivo) return;
      const f = buscar();
      if (f) {
        f.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setOtro(f.k > 0);
        setTimeout(() => { if (vivo) { setCaja(f.el.getBoundingClientRect()); setBuscando(false); } }, 350);
      } else if (++intentos < 25) setTimeout(probar, 120);
      else setBuscando(false); // no está (p. ej. no hay albaranes): el cartel sale en el centro
    };
    probar();
    return () => { vivo = false; };
  }, [i, location.pathname, buscar, paso.sel]);

  // Seguir el hueco si se mueve la pantalla
  useEffect(() => {
    if (!paso.sel) return;
    const mover = () => { const f = buscar(); if (f) setCaja(f.el.getBoundingClientRect()); };
    window.addEventListener('resize', mover);
    window.addEventListener('scroll', mover, true);
    return () => { window.removeEventListener('resize', mover); window.removeEventListener('scroll', mover, true); };
  }, [buscar, paso.sel]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI(v => Math.min(v + 1, PASOS.length - 1));
      if (e.key === 'ArrowLeft') setI(v => Math.max(v - 1, 0));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const ultimo = i === PASOS.length - 1;
  const M = 8; // aire alrededor del botón resaltado
  const vw = window.innerWidth, vh = window.innerHeight;
  const ancho = Math.min(360, vw - 24);
  // El cartel va debajo del hueco si cabe; si no, encima; si no hay hueco, en el centro
  let estilo: React.CSSProperties = { width: ancho, left: (vw - ancho) / 2, top: '50%', transform: 'translateY(-50%)' };
  if (caja) {
    const left = Math.min(Math.max(12, caja.left + caja.width / 2 - ancho / 2), vw - ancho - 12);
    const abajo = vh - caja.bottom - M;
    estilo = abajo > 230 ? { width: ancho, left, top: caja.bottom + M + 12 }
      : caja.top - M > 230 ? { width: ancho, left, bottom: vh - caja.top + M + 12 }
      : { width: ancho, left: (vw - ancho) / 2, bottom: 16 };
  }

  return (
    <div className="tuto" role="dialog" aria-modal="true" aria-labelledby="tuto-titulo">
      {caja
        ? <div className="tuto-hueco" style={{ left: caja.left - M, top: caja.top - M, width: caja.width + M * 2, height: caja.height + M * 2 }} />
        : <div className="tuto-velo" />}
      {!buscando && (
        <div className="tuto-cartel" style={estilo} key={i}>
          <div className="tuto-cab">
            <span className="tuto-paso">{i === 0 || ultimo ? 'Tutorial' : `Paso ${i} de ${PASOS.length - 2}`}</span>
            <button className="tuto-x" onClick={onCerrar} aria-label="Cerrar el tutorial"><X size={18} /></button>
          </div>
          <b id="tuto-titulo">{paso.titulo}</b>
          <p>{otro && paso.textoOtro ? paso.textoOtro : paso.texto}</p>
          <div className="tuto-puntos" aria-hidden="true">
            {PASOS.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}
          </div>
          <div className="tuto-botones">
            {i > 0 && !ultimo && <button className="btn btn-ghost btn-sm" onClick={() => setI(i - 1)}><ChevronLeft size={16} /> Atrás</button>}
            {!ultimo && <button className="btn btn-ghost btn-sm tuto-saltar" onClick={onCerrar}>Saltar</button>}
            <button className="btn btn-primary" onClick={() => (ultimo ? onCerrar() : setI(i + 1))} autoFocus>
              {ultimo ? 'Terminar' : i === 0 ? 'Empezar' : <>Siguiente <ChevronRight size={16} /></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Abre el tutorial desde cualquier sitio. */
export const abrirTutorial = () => window.dispatchEvent(new Event('cf-tutorial'));
