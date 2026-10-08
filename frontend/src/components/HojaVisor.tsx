import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Printer, Share2, Download } from 'lucide-react';
import { api, describeApiError, withTokenUrl } from '../api/client';

/**
 * Hoja de entrega a pantalla completa, dentro de la app: se ve igual en cualquier móvil
 * y siempre hay botón para volver, imprimir y compartir (WhatsApp, correo, guardar…).
 */
export function HojaVisor({ entregaId, onClose }: { entregaId: number; onClose: () => void }) {
  const [info, setInfo] = useState<{ paginas: number; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const v = useState(() => Date.now())[0];

  useEffect(() => {
    api.get<{ paginas: number; nombre: string }>(`/api/cargas/entregas/${entregaId}/hoja`)
      .then(r => setInfo(r.data)).catch(err => setError(describeApiError(err)));
  }, [entregaId]);

  // Atrás del móvil (o deslizar) cierra el visor en vez de salir de la orden
  useEffect(() => {
    history.pushState({ hoja: entregaId }, '');
    const atras = () => onClose();
    window.addEventListener('popstate', atras);
    return () => window.removeEventListener('popstate', atras);
  }, [entregaId, onClose]);
  const volver = () => { if (history.state?.hoja === entregaId) history.back(); else onClose(); };

  const pagina = (n: number, dpi: number) => withTokenUrl(`/api/cargas/entregas/${entregaId}/pagina/${n}.png?dpi=${dpi}&v=${v}`);
  const pdfUrl = (descargar = false) => withTokenUrl(`/api/cargas/entregas/${entregaId}/pdf${descargar ? '?download=true' : ''}`);

  useEffect(() => {
    if (!imprimiendo) return;
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#firma-print img'));
    Promise.all(imgs.map(im => im.complete ? Promise.resolve() : new Promise(r => { im.onload = im.onerror = () => r(null); })))
      .then(() => { window.print(); setImprimiendo(false); });
  }, [imprimiendo]);

  const compartir = async () => {
    if (!info) return;
    setCompartiendo(true);
    try {
      const blob = await (await fetch(pdfUrl())).blob();
      const archivo = new File([blob], info.nombre, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: info.nombre });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = info.nombre; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setError('No se pudo enviar. Prueba otra vez.');
    } finally { setCompartiendo(false); }
  };

  const puedeCompartir = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="hoja-visor" role="dialog" aria-label="Hoja de entrega">
      <div className="hoja-visor-barra">
        <button className="btn btn-ghost" onClick={volver}><ArrowLeft size={18} /> Volver</button>
        <span className="hoja-visor-esp" />
        <button className="btn btn-ghost" onClick={() => setImprimiendo(true)} disabled={!info || imprimiendo}>
          <Printer size={18} /> <span className="hoja-visor-txt">{imprimiendo ? 'Preparando…' : 'Imprimir'}</span>
        </button>
        {puedeCompartir ? (
          <button className="btn btn-primary" onClick={compartir} disabled={!info || compartiendo}>
            <Share2 size={18} /> <span className="hoja-visor-txt">{compartiendo ? 'Un momento…' : 'Enviar'}</span>
          </button>
        ) : (
          <a className="btn btn-primary" href={pdfUrl(true)}><Download size={18} /> <span className="hoja-visor-txt">Guardar</span></a>
        )}
      </div>
      <div className="hoja-visor-paginas" onClick={e => { if (e.target === e.currentTarget) volver(); }}>
        {error && <div className="doc-aviso error">{error}</div>}
        {!info && !error && <div style={{ color: '#fff', padding: 40, textAlign: 'center' }}>Preparando la hoja…</div>}
        {info && Array.from({ length: info.paginas }, (_, i) => (
          <img key={i} src={pagina(i + 1, 130)} alt={`Página ${i + 1} de ${info.paginas}`} />
        ))}
      </div>
      {imprimiendo && info && createPortal(
        <div id="firma-print">{Array.from({ length: info.paginas }, (_, i) => <img key={i} src={pagina(i + 1, 200)} alt="" />)}</div>,
        document.body,
      )}
    </div>
  );
}
