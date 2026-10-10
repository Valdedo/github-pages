import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ESCENA_PEGATINA } from './pegatinaEscena';
import { VB_W, VB_H, ALTO_LOGO, DURA, c01, easeIn, montar } from './pegatinaMotor';
import { eligeSorpresa, escenaSorpresa, montarSorpresa } from './sorpresas';

/**
 * Estilo «pegatina» (móvil, todos los usuarios).
 * - CabeceraPegatina: el logo pegado arriba de Inicio; al bajar se va con la página, sin más.
 * - ArranquePegatina: al abrir la app, el logo centrado se despega, se pega en la puerta del camión
 *   y el camión se lo lleva; luego aparece la app. Se salta tocando la pantalla.
 */

const escena = (pre: string) => ESCENA_PEGATINA.split('cfp-').join(pre);

/** Logo pegatina quieto en lo alto de Inicio. */
export function CabeceraPegatina() {
  const lienzo = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => { if (lienzo.current) montar(lienzo.current, 'cfi-').reposo(); }, []);
  return (
    <div className="cab-pegatina-zona">
      <div className="cab-pegatina" role="img" aria-label="Casa Fonso · Materiales de construcción"
        style={{ aspectRatio: `${VB_W} / ${ALTO_LOGO}` }}>
        <svg ref={lienzo} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: escena('cfi-') }} />
      </div>
      <div className="cab-pegatina-velo" aria-hidden="true" />
    </div>
  );
}

/** Solo al abrir la app de cero (una vez por carga), en Inicio. */
let yaArranco = false;
export function debeArrancar(ruta: string, inicio: string) {
  if (yaArranco || ruta !== inicio) return false;
  yaArranco = true;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const SALIDA = 0.35;   // segundos que tarda en desvanecerse la pantalla al terminar

/** Pantalla de arranque con la animación del camión. Llama a onFin al acabar (o al tocar). */
export function ArranquePegatina({ onFin }: { onFin: () => void }) {
  const capa = useRef<HTMLDivElement>(null);
  const lienzo = useRef<SVGSVGElement>(null);
  const fijo = useRef<HTMLImageElement>(null);
  const fin = useRef(onFin); fin.current = onFin;
  const [sorpresa] = useState(eligeSorpresa);

  useEffect(() => {
    const svg = lienzo.current, cp = capa.current;
    if (!svg || !cp) return;
    const esc = sorpresa ? montarSorpresa(sorpresa, svg, 'cfp-') : { ...montar(svg, 'cfp-'), dura: DURA };
    const DUR = esc.dura;
    esc.reposo();
    // El reloj avanza como mucho 1/30 s por fotograma: si el móvil va cargado al abrir la app,
    // la animación va más lenta en vez de saltarse entera.
    let raf = 0, antes = 0, t = -0.25, saliendo = -1, acabado = false, cuadros = 0, seguro = 0;
    const terminar = () => { if (!acabado) { acabado = true; cancelAnimationFrame(raf); clearTimeout(seguro); fin.current(); } };
    const paso = (ahora: number) => {
      if (cuadros++ > 1) t += Math.min(1 / 30, Math.max(0, (ahora - antes) / 1000));   // los 2 primeros fotogramas no cuentan
      antes = ahora;
      esc.completa(Math.max(0, Math.min(t, DUR)));
      if (fijo.current) fijo.current.style.visibility = t > 0.1 ? 'hidden' : '';
      if (saliendo < 0 && t >= DUR - 0.25) saliendo = t;
      if (saliendo >= 0) {
        const k = c01((t - saliendo) / SALIDA);
        cp.style.opacity = String(1 - easeIn(k));
        if (k >= 1) return terminar();
      }
      raf = requestAnimationFrame(paso);
    };
    // Espera a que estén listas las imágenes del logo (máx. 1,5 s) antes de arrancar
    const listas = ['/brand/logo-tejado.png', '/brand/logo-palabra.png'].map(src => {
      const im = new Image(); im.src = src; return im.decode ? im.decode().catch(() => undefined) : Promise.resolve();
    });
    let cancelado = false;
    Promise.race([Promise.all(listas), new Promise(r => setTimeout(r, 1500))]).then(() => {
      if (cancelado) return;
      raf = requestAnimationFrame(paso);
      seguro = window.setTimeout(terminar, (DUR + 9) * 1000);   // por si el navegador para la animación del todo
    });
    const saltar = () => { if (saliendo < 0) saliendo = Math.max(t, 0); };
    cp.addEventListener('pointerdown', saltar);
    return () => { cancelado = true; cancelAnimationFrame(raf); cp.removeEventListener('pointerdown', saltar); clearTimeout(seguro); };
  }, [sorpresa]);

  return (
    <div ref={capa} className="arranque-pegatina" role="img" aria-label="Casa Fonso · Materiales de construcción">
      {/* el mismo logo de la pantalla de carga, debajo, hasta que la animación ya está en marcha */}
      <img ref={fijo} className="cf-cargando-logo" src="/brand/logo-pegatina.png" alt="" />
      <svg ref={lienzo} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: sorpresa ? escenaSorpresa(sorpresa, escena('cfp-')) : escena('cfp-') }} />
      <span className="arranque-saltar">Toca para saltar</span>
    </div>
  );
}
