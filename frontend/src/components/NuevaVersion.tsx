import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/** El archivo principal de la app que está cargado ahora (cambia de nombre con cada versión). */
const actual = () => (document.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null)?.getAttribute('src') || '';

/**
 * Los ordenadores de la tienda tienen la app abierta todo el día: si se publica algo nuevo,
 * no lo verían hasta recargar. Cada pocos minutos (y al volver a la pestaña) se mira si hay
 * versión nueva y, si la hay, sale una barra para actualizar. Recarga sola si la app está en Inicio sin nada a medias.
 */
export function NuevaVersion() {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const mia = actual();
    if (!mia) return;
    let parar = false;
    const mirar = async () => {
      if (parar || document.visibilityState !== 'visible' || !navigator.onLine) return;
      try {
        const r = await fetch('/', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (!r.ok) return;
        const html = await r.text();
        const nueva = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/)?.[1]
          || html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
        if (nueva && nueva !== mia) setHay(true);
      } catch { /* sin red: ya se mirará */ }
    };
    const t = setInterval(mirar, 5 * 60000);
    const alVolver = () => { if (document.visibilityState === 'visible') mirar(); };
    document.addEventListener('visibilitychange', alVolver);
    const primera = setTimeout(mirar, 20000);
    return () => { parar = true; clearInterval(t); clearTimeout(primera); document.removeEventListener('visibilitychange', alVolver); };
  }, []);
  if (!hay) return null;
  return (
    <div className="nueva-version" role="status">
      <RefreshCw size={18} />
      <span><b>Hay una versión nueva de la app</b><small>Actualiza para ver lo último. No se pierde nada.</small></span>
      <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Actualizar</button>
    </div>
  );
}
