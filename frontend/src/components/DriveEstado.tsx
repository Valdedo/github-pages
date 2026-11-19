import { useEffect, useState } from 'react';
import { FolderCheck, FolderInput, FolderPlus, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
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
  // created_at viene en UTC sin zona: sin la «Z» se leía como hora de Madrid y en las dos primeras horas no parecía reciente
  const iso = (doc.created_at || '').replace(' ', 'T');
  const reciente = Date.now() - new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime() < 15 * 60000;
  // Los que no se pudieron leer también se guardan (sin leer), para que ninguno se quede sin copia
  const leido = doc.status === 'completed' || doc.status === 'error';
  useEffect(() => {
    if (!leido || d.drive_at || d.drive_error || !reciente) return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      try { const { data } = await getDocument(doc.id); if (data.drive_at || data.drive_error || n > 15) { setD(data); clearInterval(t); } }
      catch { if (n > 15) clearInterval(t); }
    }, 4000);
    return () => clearInterval(t);
  }, [doc.id, leido, d.drive_at, d.drive_error, reciente]);

  // Sin carpeta: se pide la lista recién leída de Drive (antes iba guardada 10 min y una carpeta recién creada no salía).
  // Si mientras tanto el proveedor ya tiene carpeta (se acaba de crear en Drive con su nombre), el servidor lo mueve solo.
  const [puedeCrear, setPuedeCrear] = useState(false);
  const [nombre, setNombre] = useState('');
  const [mirando, setMirando] = useState(false);
  const mirar = async () => {
    setMirando(true); setError(null);
    try {
      const { data } = await api.get<{ carpetas: { id: string; name: string }[]; puede_crear: boolean; sugerido: string; drive_carpeta: string | null; drive_pendiente: boolean }>(`/api/drive/documento/${doc.id}/pendiente`);
      setCarpetas(data.carpetas); setPuedeCrear(data.puede_crear);
      setNombre(n => n || data.sugerido);
      if (!data.drive_pendiente) setD(x => ({ ...x, drive_pendiente: false, drive_carpeta: data.drive_carpeta }));
    } catch (e) { setError(errorDe(e)); } finally { setMirando(false); }
  };
  const sinCarpeta = !!d.drive_pendiente && doc.status !== 'error';
  useEffect(() => { if (sinCarpeta) mirar(); }, [sinCarpeta, doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const crear = async () => {
    setOcupado(true); setError(null);
    try {
      const { data } = await api.post(`/api/drive/documento/${doc.id}/carpeta-nueva`, { nombre });
      setD(x => ({ ...x, ...data }));
    } catch (e) { setError(errorDe(e)); } finally { setOcupado(false); }
  };

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
    if (leido && reciente) return <div className="drive-estado"><RefreshCw size={16} className="girando" /> Guardando en Drive…</div>;
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

  if (d.drive_pendiente && doc.status === 'error') {
    return (
      <div className="drive-estado pendiente">
        <FolderInput size={18} />
        <span><b>Guardado en Drive sin leer</b> (carpeta «_Pendientes de clasificar»). Cuando se lea, pasa solo a la carpeta de su proveedor.</span>
        {d.drive_url && <a href={d.drive_url} target="_blank" rel="noopener" className="drive-abrir">Abrir <ExternalLink size={13} /></a>}
      </div>
    );
  }

  if (d.drive_pendiente) {
    const quien = doc.supplier_name;
    return (
      <div className="drive-estado pendiente">
        <FolderInput size={18} />
        <span>
          <b>Está guardado en Drive, pero sin carpeta de proveedor.</b>{' '}
          {quien ? <>¿Dónde van los de {quien}? Se recordará para los siguientes.</> : <>Este albarán no tiene proveedor puesto: ponlo con «Cambiar» y se guarda solo en su carpeta.</>}
        </span>
        {quien && puedeCrear && (
          <div className="drive-elegir drive-nueva">
            <input className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} aria-label="Nombre de la carpeta nueva" placeholder="Nombre de la carpeta" />
            <button className="btn btn-primary btn-sm" disabled={!nombre.trim() || ocupado} onClick={crear}><FolderPlus size={16} /> {ocupado ? 'Creando…' : 'Crear esta carpeta'}</button>
          </div>
        )}
        <div className="drive-elegir">
          <select className="form-input" value={elegida} onChange={e => setElegida(e.target.value)} aria-label="Carpeta del proveedor">
            <option value="">{carpetas ? (puedeCrear && quien ? 'O elige una que ya existe…' : 'Elige la carpeta…') : 'Cargando carpetas…'}</option>
            {(carpetas || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className={`btn btn-sm ${puedeCrear && quien ? 'btn-ghost' : 'btn-primary'}`} disabled={!elegida || ocupado} onClick={mover}>{ocupado ? 'Moviendo…' : 'Mover'}</button>
          <button className="btn btn-ghost btn-sm drive-refrescar" onClick={mirar} disabled={mirando} title="Volver a leer las carpetas de Drive">
            <RefreshCw size={15} className={mirando ? 'girando' : undefined} /> <span>Actualizar la lista</span>
          </button>
        </div>
        {!puedeCrear && carpetas && quien && <small className="drive-pista">¿Es un proveedor nuevo? Crea su carpeta en Drive, dentro de ALBARANES, y pulsa «Actualizar la lista».</small>}
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
