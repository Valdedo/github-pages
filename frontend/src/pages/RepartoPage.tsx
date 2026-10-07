import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenLine, ChevronRight, CheckCircle, RefreshCw } from 'lucide-react';
import { listFirmas, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { setReparto } from '../reparto';
import { getRol, cerrarSesion } from '../auth';
import { fmtFecha, fmtEuros } from './FirmasPage';
import { TurnoHoy } from '../components/TurnoHoy';
import { getYo } from '../auth';
import type { ClientDeliveryNote } from '../types';

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Vista sencilla para el camionero: albaranes por firmar y los firmados hoy. */
export function RepartoPage() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<ClientDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setReparto(true); }, []);
  const nombre = (() => { try { return localStorage.getItem('repartoNombre') || 'Melchor'; } catch { return 'Melchor'; } })();

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    listFirmas()
      .then(({ data }) => { setNotes(data); setError(null); })
      .catch(err => { if (!quiet) setError(describeApiError(err)); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [load]);

  const pendientes = notes.filter(n => n.status === 'pendiente');
  const firmadosHoy = notes.filter(n => n.status === 'firmado' && (n.signed_at || '').startsWith(hoy()));

  return (
    <div className="page reparto">
      {error && <ConnectionError message={error} onRetry={() => load()} />}

      <div className="reparto-hero">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div>
            <span>Hola, {nombre}</span>
            <h1>{pendientes.length ? `${pendientes.length} por firmar` : 'Nada por firmar'}</h1>
          </div>
          <button className="btn btn-sm" style={{ marginLeft: 'auto', background: 'rgb(255 255 255 / .14)', color: '#fff' }} onClick={() => load()} aria-label="Actualizar">
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : pendientes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><CheckCircle size={40} style={{ color: 'var(--success)' }} /></div>
          <div className="empty-state-text">Todos los albaranes están firmados.</div>
        </div>
      ) : (
        <div className="cf-enter" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pendientes.map(n => (
            <button key={n.id} className="card reparto-card" onClick={() => navigate(`/firmas/${n.id}`)}>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>{n.cliente || 'Cliente sin identificar'}</div>
                <div style={{ fontSize: 16, color: 'var(--text-2)', marginTop: 4 }}>
                  {n.numero}{n.obra ? ` · ${n.obra}` : ''}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
                  {fmtFecha(n.fecha)}{n.importe != null ? ` · ${fmtEuros(n.importe)}` : ''}
                </div>
              </div>
              <span className="reparto-firmar"><PenLine size={20} /> Firmar</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}><TurnoHoy fijo={getYo() || 'melchor'} /></div>

      {firmadosHoy.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>
            Firmados hoy ({firmadosHoy.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {firmadosHoy.map(n => (
              <button key={n.id} className="card reparto-card hecho" onClick={() => navigate(`/firmas/${n.id}`)}>
                <CheckCircle size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 14 }}>
                  <strong>{n.cliente}</strong> · {n.numero}
                </div>
                <ChevronRight size={16} style={{ color: 'var(--text-3)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 40, textAlign: 'center' }}>
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-3)' }}
          onClick={() => {
            if (getRol() === 'reparto') {
              if (!window.confirm('¿Cerrar la sesión en este móvil? Habrá que volver a escribir el código.')) return;
              cerrarSesion(); setReparto(false); window.location.href = '/';
              return;
            }
            if (!window.confirm('¿Salir del modo reparto en este móvil? Se verá la aplicación completa.')) return;
            setReparto(false);
            navigate('/');
          }}>
          {getRol() === 'reparto' ? 'Cerrar sesión' : 'Salir del modo reparto'}
        </button>
      </div>
    </div>
  );
}
