import { useState, useEffect } from 'react';

export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

/** Ancho de la ventana (se actualiza al cambiar el tamaño). */
export function useAnchoVentana(): number {
  const [ancho, setAncho] = useState(() => window.innerWidth);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const h = () => { clearTimeout(t); t = setTimeout(() => setAncho(window.innerWidth), 120); };
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('resize', h); clearTimeout(t); };
  }, []);
  return ancho;
}
