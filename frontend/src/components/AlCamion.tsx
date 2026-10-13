import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, Search, Truck, X } from 'lucide-react';
import { cargaDesdeAlbaranes, describeApiError, listFirmas, listarCargas, type OrdenCarga } from '../api/client';
import { mensajeError } from '../lib/descargas';
import { coincide, plural } from '../lib/texto';
import { CamionPegatina } from './Pegatinas';
import type { ClientDeliveryNote } from '../types';

const fecha = (iso?: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
};

/** Mientras se leen los materiales del albarán. */
export function LeyendoAlbaran({ n }: { n: number }) {
  return (
    <div className="carga-leyendo" role="status">
      <div className="card">
        <CamionPegatina modo="rodando" ancho={230} />
        <b>{n === 1 ? 'Leyendo el albarán…' : `Leyendo ${n} albaranes…`}</b>
        <small>Saco los materiales para cargar, sin precios.</small>
      </div>
    </div>
  );
}

/** Crea la orden de carga (o la añade a un viaje) y abre la orden. */
function useCrear(onHecho?: (o: OrdenCarga) => void) {
  const navigate = useNavigate();
  const [leyendo, setLeyendo] = useState(0);
  const [error, setError] = useState('');
  const [enOtra, setEnOtra] = useState<number | null>(null);
  const crear = async (ids: number[], ordenId?: number) => {
    setLeyendo(ids.length); setError(''); setEnOtra(null);
    try {
      const { data } = await cargaDesdeAlbaranes(ids, ordenId);
      if (onHecho) onHecho(data); else navigate(`/cargas/${data.id}`);
      return data;
    } catch (err) {
      const det = (err as { response?: { data?: { detail?: { orden?: number; mensaje?: string } } } }).response?.data?.detail;
      if (det && typeof det === 'object' && det.orden) { setEnOtra(det.orden); setError(det.mensaje || 'Ya va en otra orden de carga.'); }
      else setError(mensajeError(err, describeApiError(err)));
      return null;
    } finally { setLeyendo(0); }
  };
  return { crear, leyendo, error, enOtra };
}

/**
 * «Al camión» desde un albarán: elegir si va en un viaje nuevo o en uno que se está preparando.
 * Los materiales salen del albarán; la hoja que firma el cliente va sin precios.
 */
export function AlCamionModal({ albaranes, onClose }: { albaranes: ClientDeliveryNote[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [viajes, setViajes] = useState<OrdenCarga[] | null>(null);
  const [destino, setDestino] = useState<number | 'nuevo'>('nuevo');
  const { crear, leyendo, error, enOtra } = useCrear();

  useEffect(() => {
    listarCargas()
      .then(r => setViajes(r.data.filter(o => o.estado !== 'entregado')))
      .catch(() => setViajes([]));
  }, []);

  const ir = async () => {
    const o = await crear(albaranes.map(a => a.id), destino === 'nuevo' ? undefined : destino);
    if (o) onClose();
  };
  const quien = albaranes.length === 1
    ? `${albaranes[0].numero} · ${albaranes[0].cliente || 'Cliente sin identificar'}`
    : plural(albaranes.length, 'albarán', 'albaranes');

  return (
    <div className="modal-overlay" onClick={() => !leyendo && onClose()}>
      <div className="modal alcamion" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Al camión">
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}><Truck size={18} style={{ verticalAlign: '-3px' }} /> Al camión</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={!!leyendo}>✕</button>
        </div>
        <div className="alcamion-cuerpo">
          <p className="alcamion-que">{quien}</p>
          <p className="alcamion-ayuda">Se prepara la orden de carga con los materiales del albarán. El cliente firma la hoja de entrega sin precios y la firma pasa también al albarán.</p>
          <div className="alcamion-titulo">¿En qué viaje va?</div>
          <div className="alcamion-viajes" role="radiogroup">
            <button role="radio" aria-checked={destino === 'nuevo'} className={`alcamion-viaje${destino === 'nuevo' ? ' on' : ''}`} onClick={() => setDestino('nuevo')}>
              <span className="alcamion-radio">{destino === 'nuevo' && <Check size={14} strokeWidth={3} />}</span>
              <span><b><Plus size={15} style={{ verticalAlign: '-2px' }} /> Viaje nuevo</b></span>
            </button>
            {viajes == null ? <small className="alcamion-cargando">Buscando viajes en preparación…</small> : viajes.map(o => (
              <button key={o.id} role="radio" aria-checked={destino === o.id} className={`alcamion-viaje${destino === o.id ? ' on' : ''}`} onClick={() => setDestino(o.id)}>
                <span className="alcamion-radio">{destino === o.id && <Check size={14} strokeWidth={3} />}</span>
                <span style={{ minWidth: 0 }}>
                  <b>Con {o.entregas.map(e => e.cliente || 'Sin nombre').join(', ') || 'nadie todavía'}</b>
                  <small>{[...new Set(o.entregas.map(e => e.lugar).filter(Boolean))].join(', ') || plural(o.entregas.length, 'entrega')}
                    {o.enviada_at ? ' · ya en el móvil de Melchor' : ''}</small>
                </span>
              </button>
            ))}
          </div>
          {error && (
            <div className="doc-aviso error" role="alert" style={{ marginTop: 12 }}>
              <div>
                {error}
                {enOtra && <> <button className="turnos-link" onClick={() => { onClose(); navigate(`/cargas/${enOtra}`); }}>Abrir esa orden</button></>}
              </div>
            </div>
          )}
        </div>
        <div className="modal-pie">
          <span className="modal-pie-botones">
            <button className="btn btn-ghost" onClick={onClose} disabled={!!leyendo}>Cancelar</button>
            <button className="btn btn-primary" onClick={ir} disabled={!!leyendo}><Truck size={16} /> Preparar la carga</button>
          </span>
        </div>
      </div>
      {leyendo > 0 && <LeyendoAlbaran n={leyendo} />}
    </div>
  );
}

/**
 * Elegir albaranes sin firmar (que no vayan ya en otra carga) para un viaje.
 * Con `ordenId`, se añaden a ese viaje; sin él, se crea uno nuevo.
 */
export function ElegirAlbaranes({ ordenId, onClose, onHecho }: { ordenId?: number; onClose: () => void; onHecho?: (o: OrdenCarga) => void }) {
  const [notes, setNotes] = useState<ClientDeliveryNote[] | null>(null);
  const [err, setErr] = useState('');
  const [buscar, setBuscar] = useState('');
  const [sel, setSel] = useState<number[]>([]);
  const { crear, leyendo, error } = useCrear(onHecho);

  useEffect(() => {
    listFirmas()
      .then(r => setNotes(r.data.filter(n => n.status === 'pendiente' && !n.carga_id)))
      .catch(e => setErr(describeApiError(e)));
  }, []);
  const lista = useMemo(() => (notes || []).filter(n => coincide(buscar, n.numero, n.cliente, n.codigo_cliente, n.obra)), [notes, buscar]);
  const toggle = (id: number) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const ir = async () => { if (await crear(sel, ordenId)) onClose(); };

  return (
    <div className="modal-overlay" onClick={() => !leyendo && onClose()}>
      <div className="modal alcamion" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Elegir albaranes">
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>{ordenId ? 'Añadir albaranes al viaje' : 'Nueva carga'}</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={!!leyendo}>✕</button>
        </div>
        <div className="alcamion-cuerpo">
          <p className="alcamion-ayuda">Elige los albaranes de TreyFACT que van en el camión. Si no está, súbelo antes en «Firmar albaranes».</p>
          <div className="search-bar alcamion-buscar">
            <Search size={17} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar nº, cliente u obra…" aria-label="Buscar albarán" />
            {buscar && <button className="search-bar-clear" onClick={() => setBuscar('')} aria-label="Borrar búsqueda"><X size={16} /></button>}
          </div>
          {err ? <div className="doc-aviso error">{err}</div>
            : notes == null ? <small className="alcamion-cargando">Cargando albaranes…</small>
            : lista.length === 0 ? <div className="alcamion-vacio">{buscar.trim() ? `Ningún albarán sin firmar con «${buscar.trim()}».` : 'No hay albaranes sin firmar fuera de otras cargas. Súbelos en «Firmar albaranes».'}</div>
            : (
              <div className="alcamion-lista">
                {lista.map(n => (
                  <label key={n.id} className={`alcamion-alb${sel.includes(n.id) ? ' on' : ''}`}>
                    <input type="checkbox" checked={sel.includes(n.id)} onChange={() => toggle(n.id)} />
                    <span style={{ minWidth: 0 }}>
                      <b>{n.cliente || 'Cliente sin identificar'}</b>
                      <small>{[n.numero, n.obra, fecha(n.fecha)].filter(Boolean).join(' · ')}</small>
                    </span>
                  </label>
                ))}
              </div>
            )}
          {error && <div className="doc-aviso error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="modal-pie">
          <span className="modal-pie-botones">
            <button className="btn btn-ghost" onClick={onClose} disabled={!!leyendo}>Cancelar</button>
            <button className="btn btn-primary" onClick={ir} disabled={!!leyendo || !sel.length}>
              <Truck size={16} /> {sel.length > 1 ? `Preparar con ${sel.length}` : 'Preparar la carga'}
            </button>
          </span>
        </div>
      </div>
      {leyendo > 0 && <LeyendoAlbaran n={leyendo} />}
    </div>
  );
}
