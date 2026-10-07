import { useEffect, useState } from 'react';
import { FolderCheck, FolderInput, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { api, getDocument, describeApiError } from '../api/client';
import type { Document } from '../types/index';

type Drive = Pick<Document, 'drive_url' | 'drive_carpeta' | 'drive_pendiente' | 'drive_error' | 'drive_at' | 'drive_file_id'>;
const errorDe = (err: unknown) => (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || describeApiError(err);

/** Estado de la copia del albarán en Drive (ALBARANES/<proveedor>). */
export function DriveEstado({ doc }: { doc: Document }) {
  const [d, setD] = useState<Drive>(doc);
  const [carpetas, setCarpetas] = useState<{ id: string; name: string }[] | null>(null);
  const [elegida, setElegida] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setD(doc); }, [doc]);

  // Recién leído: la copia tarda unos segundos; se mira hasta que aparezca
  const reciente = Date.now() - new Date(doc.created_at.replace(' ', 'T')).getTime() < 15 * 60000;
  useEffect(() => {
    if (doc.status !== 'completed' || d.drive_at || d.drive_error || !reciente) return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      try { const { data } = await getDocument(doc.id); if (data.drive_at || data.drive_error || n > 15) { setD(data); clearInterval(t); } }
      catch { if (n > 15) clearInterval(t); }
    }, 4000);
    return () => clearInterval(t);
  }, [doc.id, doc.status, d.drive_at, d.drive_error, reciente]);

  useEffect(() => {
    if (!d.drive_pendiente || carpetas) return;
    api.get<{ id: string; name: string }[]>('/api/drive/carpetas').then(r => setCarpetas(r.data)).catch(e => setError(errorDe(e)));
  }, [d.drive_pendiente, carpetas]);

  const mover = async () => {
    setOcupado(true); setError(null);
    try {
      const { data } = await api.post(`/api/drive/documento/${doc.id}/carpeta`, { folder_id: elegida });
      setD(x => ({ ...x, ...data }));
    } catch (e) { setError(errorDe(e)); } finally { setOcupado(false); }
  };
  const reintentar = async () => {
    setOcupado(true); setError(null);
    try { const { data } = await api.post(`/api/drive/documento/${doc.id}/guardar`); setD(x => ({ ...x, ...data, drive_at: data.drive_error ? x.drive_at : new Date().toISOString() })); }
    catch (e) { setError(errorDe(e)); } finally { setOcupado(false); }
  };

  if (!d.drive_at && !d.drive_error) {
    if (doc.status === 'completed' && reciente) return <div className="drive-estado"><RefreshCw size={16} className="girando" /> Guardando en Drive…</div>;
    return null;
  }

  if (d.drive_error && !d.drive_file_id) {
    return (
      <div className="drive-estado error">
        <AlertTriangle size={17} />
        <span>No se pudo guardar en Drive: {d.drive_error}</span>
        <button className="btn btn-ghost btn-sm" onClick={reintentar} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Reintentar'}</button>
      </div>
    );
  }

  if (d.drive_pendiente) {
    return (
      <div className="drive-estado pendiente">
        <FolderInput size={18} />
        <span><b>Guardado en «_Pendientes de clasificar».</b> ¿En qué carpeta va {doc.supplier_name || 'este proveedor'}? Se recordará para los siguientes.</span>
        <div className="drive-elegir">
          <select className="form-input" value={elegida} onChange={e => setElegida(e.target.value)} aria-label="Carpeta del proveedor">
            <option value="">{carpetas ? 'Elige la carpeta…' : 'Cargando carpetas…'}</option>
            {(carpetas || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" disabled={!elegida || ocupado} onClick={mover}>{ocupado ? 'Moviendo…' : 'Mover'}</button>
        </div>
        {error && <small className="acceso-error">{error}</small>}
      </div>
    );
  }

  return (
    <div className="drive-estado ok">
      <FolderCheck size={17} />
      <span>Guardado en Drive · <b>{d.drive_carpeta}</b></span>
      {d.drive_url && <a href={d.drive_url} target="_blank" rel="noopener" className="drive-abrir">Abrir <ExternalLink size={13} /></a>}
    </div>
  );
}
