import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HorarioReparto, HoyCabecera } from '../components/HorarioReparto';
import { Vacio } from '../components/Pegatinas';
import { PenLine, ChevronRight, CheckCircle, RefreshCw, CloudOff, AlertTriangle } from 'lucide-react';
import { listFirmas, describeApiError, paraCargar, verCarga, type OrdenCarga } from '../api/client';
import { CargasReparto, cargasEntregadas, cargasPendientes } from '../components/CargasReparto';
import { ConnectionError } from '../components/ConnectionError';
import { AvisosCard } from '../components/AvisosCard';
import { setReparto } from '../reparto';
import { getRol, getYo } from '../auth';
import { fmtFecha, fmtEuros } from './FirmasPage';
import { cola, enviarCola, prepararSinCobertura, reintentarFirma, descartarFirma, type FirmaEnCola } from '../lib/offline';
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
  const [cargas, setCargas] = useState<OrdenCarga[]>([]);
  const [, setColaCargas] = useState(0);

  useEffect(() => { setReparto(true); }, []);
  // Su horario (20/10/2026): hoy en la cabecera y la semana debajo de lo de cargar
  const yo = getYo() || 'melchor';
  const nombre = (() => { try { return localStorage.getItem('repartoNombre') || 'Melchor'; } catch { return 'Melchor'; } })();

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    // Órdenes de carga que le ha mandado la tienda (si no hay, no se ve nada)
    paraCargar().then(({ data }) => {
      setCargas(data);
      // Se dejan guardadas en el móvil para abrirlas y firmar sin cobertura
      if (navigator.onLine) data.filter(o => o.estado !== 'entregado').forEach(o => { verCarga(o.id).catch(() => {}); });
    }).catch(() => {});
    enviarCola().finally(() => listFirmas()
      .then(({ data }) => { setNotes(data); setError(null); })
      .catch(err => { if (!quiet) setError(describeApiError(err)); })
      .finally(() => setLoading(false)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(true), 30000);
    const c = () => setGuardadas(cola());
    const cc = () => setColaCargas(n => n + 1);
    window.addEventListener('cf-cola-cargas', cc);
    // Al enviarse una firma hecha sin cobertura, se vuelve a pedir la lista (si no, la orden volvía a salir un rato)
    const enviada = () => load(true);
    window.addEventListener('cf-cola-cargas-enviada', enviada);
    const on = () => { setOnline(true); load(true); };
    const off = () => setOnline(false);
    window.addEventListener('cf-cola', c);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { clearInterval(t); window.removeEventListener('cf-cola-cargas', cc); window.removeEventListener('cf-cola-cargas-enviada', enviada); window.removeEventListener('cf-cola', c); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [load]);

  const enCola = new Set(guardadas.map(g => g.id));
  const pendientes = notes.filter(n => n.status === 'pendiente' && !enCola.has(n.id));
  const camion = pendientes.filter(n => n.reparto_at)
    .sort((a, b) => (a.reparto_orden ?? 0) - (b.reparto_orden ?? 0));
  const lista = verTodos ? pendientes : camion;
  // Solo los del reparto (los que iban en el camión), no los que se firman en la tienda
  const firmadosHoy = notes.filter(n => n.status === 'firmado' && n.reparto_at && (n.signed_at || '').startsWith(hoy()));
  const esperando = guardadas.filter(g => !g.error);
  const rechazadas = guardadas.filter(g => g.error);
  const entregadoHoy = firmadosHoy.length + esperando.length;
  const otros = pendientes.length - (verTodos ? 0 : camion.length);
  const porCargar = cargasPendientes(cargas);
  const cargasHechas = cargasEntregadas(cargas);
  // Albaranes de venta sin firmar de la tienda (para firmar uno que no va en ninguna carga, p. ej. si recogen en el almacén)
  const verPendientes = (n: number) => n === 1 ? 'Firmar otro albarán de la tienda (1)' : `Firmar otro albarán de la tienda (${n})`;

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
            <h1>{camion.length ? `${camion.length} en el camión` : porCargar ? (porCargar === 1 ? '1 carga pendiente' : `${porCargar} cargas pendientes`) : entregadoHoy > 0 || cargasHechas > 0 ? 'Todo entregado' : 'Camión vacío'}</h1>
          </div>
          <button className="btn btn-sm" style={{ marginLeft: 'auto', background: 'rgb(255 255 255 / .14)', color: '#fff' }} onClick={() => load()} aria-label="Actualizar">
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
        <HoyCabecera yo={yo} />
      </div>

      {!online && (
        <div className="reparto-sinred"><CloudOff size={20} /> Sin cobertura. Puedes abrir y firmar los albaranes del camión igualmente.</div>
      )}
      <CargasReparto ordenes={cargas} />
      {rechazadas.map(g => (
        <div key={g.id} className="reparto-cola error" role="alert">
          <AlertTriangle size={20} />
          <div>
            <b>No se pudo enviar la firma de {g.cliente || g.numero}: {g.error}</b>
            <small>Albarán {g.numero} · firmó {g.nombre}. Sigue guardada en el móvil.</small>
            <div className="reparto-cola-botones">
              <button className="btn btn-primary btn-sm" onClick={() => reintentarFirma(g.id).then(() => load(true))}>
                <RefreshCw size={14} /> Reintentar
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                if (window.confirm(`¿Descartar la firma de ${g.cliente || g.numero} guardada en el móvil? Habrá que volver a firmar.`)) descartarFirma(g.id);
              }}>Descartar</button>
            </div>
          </div>
        </div>
      ))}
      {esperando.length > 0 && (
        <div className="reparto-cola">
          <CloudOff size={20} />
          <div>
            <b>{esperando.length} firma{esperando.length !== 1 ? 's' : ''} esperando cobertura</b>
            <small>{esperando.map(g => g.cliente || g.numero).join(', ')}. Se enviarán solas.</small>
          </div>
        </div>
      )}

      {verTodos && (
        <div className="reparto-todos">
          Albaranes de la tienda sin firmar ({pendientes.length})
          <button className="btn btn-ghost btn-sm" onClick={() => setVerTodos(false)}>Ver solo el camión</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : lista.length === 0 && porCargar > 0 ? (
        pendientes.length > 0 ? (
          <button className="btn btn-ghost btn-sm" style={{ display: 'block', margin: '14px auto 0', color: 'var(--text-3)' }} onClick={() => setVerTodos(true)}>
            {verPendientes(pendientes.length)}
          </button>
        ) : null
      ) : lista.length === 0 ? (
        <Vacio camion="aparcado"
          titulo={!verTodos && entregadoHoy > 0 ? 'Todo entregado hoy' : pendientes.length === 0 ? 'Hoy no hay entregas' : 'Camión vacío'}
          texto={!verTodos && entregadoHoy > 0
            ? `${entregadoHoy === 1 ? 'Has entregado 1 albarán' : `Has entregado ${entregadoHoy} albaranes`}. Cuando haya más carga para ti, te aviso.`
            : pendientes.length === 0 ? 'Cuando haya carga para ti, te aviso.' : 'No te han puesto albaranes en el camión.'}>
          {!verTodos && pendientes.length > 0 && (
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setVerTodos(true)}>
              {verPendientes(pendientes.length)}
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
          {!verTodos && otros > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'center', color: 'var(--text-3)' }} onClick={() => setVerTodos(true)}>
              {otros === 1 ? 'Ver también el otro albarán sin firmar de la tienda' : `Ver también los otros ${otros} albaranes sin firmar de la tienda`}
            </button>
          )}
        </div>
      )}

      {firmadosHoy.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>
            Entregados hoy ({firmadosHoy.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {firmadosHoy.map(n => (
              <button key={n.id} className="card reparto-card hecho" onClick={() => navigate(`/firmas/${n.id}`)}>
                <CheckCircle size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 14 }}>
                  <strong>{n.cliente || 'Cliente sin identificar'}</strong> · {n.numero}
                </div>
                <ChevronRight size={16} style={{ color: 'var(--text-3)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 28 }}><HorarioReparto yo={yo} /></div>

      <div style={{ marginTop: 24 }}><AvisosCard grande /></div>

      <div style={{ marginTop: 40, textAlign: 'center', display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {/* Con el código de Melchor, lo suyo (turnos, código, cerrar sesión) está en su círculo de arriba */}
        {getRol() !== 'reparto' && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-3)' }}
          onClick={() => {
            if (!window.confirm('¿Salir del modo reparto en este móvil? Se verá la aplicación completa.')) return;
            setReparto(false);
            navigate('/');
          }}>
          Salir del modo reparto
        </button>}
      </div>
    </div>
  );
}
