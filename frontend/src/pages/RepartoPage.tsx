import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Vacio } from '../components/Pegatinas';
import { PenLine, ChevronRight, CheckCircle, RefreshCw, CloudOff } from 'lucide-react';
import { listFirmas, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { AvisosCard } from '../components/AvisosCard';
import { setReparto } from '../reparto';
import { getRol, cerrarSesion, getYo, sesionPersonal } from '../auth';
import { MiCodigoModal } from '../components/MiCodigoModal';
import { fmtFecha, fmtEuros } from './FirmasPage';
import { TurnoHoy } from '../components/TurnoHoy';
import { cola, enviarCola, prepararSinCobertura, type FirmaEnCola } from '../lib/offline';
import type { ClientDeliveryNote } from '../types';

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Pantalla sencilla del camionero: lo que lleva en el camión, para firmar en la obra. */
export function RepartoPage() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<ClientDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [guardadas, setGuardadas] = useState<FirmaEnCola[]>(cola);
  const [online, setOnline] = useState(navigator.onLine);
  const [mio, setMio] = useState(false);

  useEffect(() => { setReparto(true); }, []);
  const nombre = (() => { try { return localStorage.getItem('repartoNombre') || 'Melchor'; } catch { return 'Melchor'; } })();

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    enviarCola().finally(() => listFirmas()
      .then(({ data }) => { setNotes(data); setError(null); })
      .catch(err => { if (!quiet) setError(describeApiError(err)); })
      .finally(() => setLoading(false)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(true), 30000);
    const c = () => setGuardadas(cola());
    const on = () => { setOnline(true); load(true); };
    const off = () => setOnline(false);
    window.addEventListener('cf-cola', c);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { clearInterval(t); window.removeEventListener('cf-cola', c); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [load]);

  const enCola = new Set(guardadas.map(g => g.id));
  const pendientes = notes.filter(n => n.status === 'pendiente' && !enCola.has(n.id));
  const camion = pendientes.filter(n => n.reparto_at)
    .sort((a, b) => (a.reparto_orden ?? 0) - (b.reparto_orden ?? 0));
  const lista = verTodos ? pendientes : camion;
  const firmadosHoy = notes.filter(n => n.status === 'firmado' && (n.signed_at || '').startsWith(hoy()));

  // Deja los del camión guardados en el móvil para abrirlos sin cobertura
  const idsCamion = camion.map(n => n.id).join(',');
  useEffect(() => { if (navigator.onLine && camion.length) prepararSinCobertura(camion); }, [idsCamion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page reparto">
      {error && <ConnectionError message={error} onRetry={() => load()} />}

      <div className="reparto-hero">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div>
            <span>Hola, {nombre}</span>
            <h1>{camion.length ? `${camion.length} en el camión` : 'Camión vacío'}</h1>
          </div>
          <button className="btn btn-sm" style={{ marginLeft: 'auto', background: 'rgb(255 255 255 / .14)', color: '#fff' }} onClick={() => load()} aria-label="Actualizar">
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </div>

      {!online && (
        <div className="reparto-sinred"><CloudOff size={20} /> Sin cobertura. Puedes abrir y firmar los albaranes del camión igualmente.</div>
      )}
      {guardadas.length > 0 && (
        <div className="reparto-cola">
          <CloudOff size={20} />
          <div>
            <b>{guardadas.length} firma{guardadas.length !== 1 ? 's' : ''} esperando cobertura</b>
            <small>{guardadas.map(g => g.cliente || g.numero).join(', ')}. Se enviarán solas.</small>
          </div>
        </div>
      )}

      {verTodos && (
        <div className="reparto-todos">
          Todos los pendientes de la tienda ({pendientes.length})
          <button className="btn btn-ghost btn-sm" onClick={() => setVerTodos(false)}>Ver solo el camión</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <Vacio camion="aparcado" titulo={pendientes.length === 0 ? 'Hoy no hay entregas' : 'Camión vacío'}
          texto={pendientes.length === 0 ? 'Todo firmado. Cuando haya carga para ti, te aviso.' : 'No te han puesto albaranes en el camión.'}>
          {!verTodos && pendientes.length > 0 && (
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setVerTodos(true)}>
              Ver los {pendientes.length} pendientes de la tienda
            </button>
          )}
        </Vacio>
      ) : (
        <div className="cf-enter" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lista.map((n, i) => (
            <button key={n.id} className="card reparto-card" onClick={() => navigate(`/firmas/${n.id}`)}>
              {!verTodos && <span className="reparto-n">{i + 1}</span>}
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>{n.cliente || 'Cliente sin identificar'}</div>
                <div style={{ fontSize: 16, color: 'var(--text-2)', marginTop: 4 }}>
                  {n.obra || n.numero}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
                  {n.obra ? `${n.numero} · ` : ''}{fmtFecha(n.fecha)}{n.importe != null ? ` · ${fmtEuros(n.importe)}` : ''}
                </div>
              </div>
              <span className="reparto-firmar"><PenLine size={20} /> Firmar</span>
            </button>
          ))}
          {!verTodos && pendientes.length > camion.length && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'center', color: 'var(--text-3)' }} onClick={() => setVerTodos(true)}>
              Ver también los otros pendientes de la tienda
            </button>
          )}
        </div>
      )}

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

      <div style={{ marginTop: 24 }}><AvisosCard grande /></div>
      <div style={{ marginTop: 16 }}><TurnoHoy fijo={getYo() || 'melchor'} /></div>

      <div style={{ marginTop: 40, textAlign: 'center', display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {sesionPersonal() && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-3)' }} onClick={() => setMio(true)}>Mi código</button>}
        {mio && <MiCodigoModal onClose={() => setMio(false)} />}
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
