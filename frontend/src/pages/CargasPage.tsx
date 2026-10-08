import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, Images, PenLine, ClipboardCheck, Check, Pencil, Plus, Trash2, Phone, FileText,
  AlertTriangle, ArrowLeft, Truck, Eraser, ChevronRight, X, Mic, ChevronUp, ChevronDown, MapPin, CloudOff, Cloud, Search,
} from 'lucide-react';
import {
  listarCargas, verCarga, borrarCarga, leerCarga, fotoCargaUrl, editarEntregaCarga, fotoEntregaCarga, ordenarEntregasCarga,
  borrarEntregaCarga, firmarEntregaCarga, anularFirmaCarga, treyfactEntregaCarga,
  nuevaLineaCarga, editarLineaCarga, borrarLineaCarga, describeApiError,
  type OrdenCarga, type EntregaCarga, type LineaCarga,
} from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { useConfirm } from '../components/ConfirmModal';
import { useCfToast } from '../components/CfToast';
import { leerImporte } from '../components/AvisoCliente';
import { coincide, fechaES, plural } from '../lib/texto';
import { mensajeError } from '../lib/descargas';
import { SignaturePad } from './FirmaDetailPage';
import { HojaVisor } from '../components/HojaVisor';
import { CamionPegatina, SelloHecho, Vacio } from '../components/Pegatinas';
import { sinRed } from '../lib/offline';
import { firmaSinRed, firmaEnCola, marcaEnCola, marcarSinRed, enviarColaCargas, descartarFirma, reducirFoto } from '../lib/offlineCargas';

const cant = (n: number | null | undefined) => (n == null ? '' : String(+n.toFixed(2)).replace('.', ','));
const fechaHora = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
  return fechaES(d) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};
const ESTADO: Record<OrdenCarga['estado'], string> = { preparando: 'Por cargar', cargado: 'Cargado', entregado: 'Entregado' };
const lineasDe = (o: OrdenCarga) => o.entregas.flatMap(e => e.lineas);

/** Unidad en singular o plural según la cantidad («1 palé», «3 palés»). */
const UNIDADES: [string, string][] = [['palé', 'palés'], ['saco', 'sacos'], ['bolsa', 'bolsas'], ['barra', 'barras'], ['rollo', 'rollos'],
  ['metro', 'metros'], ['caja', 'cajas'], ['bidón', 'bidones'], ['unidad', 'unidades'], ['varilla', 'varillas'], ['tubo', 'tubos'],
  ['placa', 'placas'], ['plancha', 'planchas'], ['viaje', 'viajes'], ['big bag', 'big bags'], ['cubo', 'cubos']];
function unidad(n: number | null | undefined, u?: string | null): string {
  const t = (u || '').trim();
  if (!t || n == null) return t;
  const low = t.toLowerCase();
  for (const [uno, varios] of UNIDADES) {
    if (n === 1 && low === varios) return uno;
    if (n !== 1 && low === uno) return varios;
  }
  return t;
}
const cantUd = (n: number | null | undefined, u?: string | null) => `${cant(n)} ${unidad(n, u)}`.trim();
const materiales = (n: number) => plural(n, 'material', 'materiales');

/** Señal de «cargado solo una parte» (medio círculo relleno, visible en cualquier móvil). */
const Medio = () => <span className="carga-medio" aria-hidden="true" />;

// ─── Nueva orden: foto o texto ───────────────────────────────────────────────

function NuevaOrden({ ordenId, onHecho, compacto }: { ordenId?: number; onHecho: (o: OrdenCarga) => void; compacto?: boolean }) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [escribir, setEscribir] = useState(false);
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repetida, setRepetida] = useState<{ id: number; mensaje: string; fotos: File[] } | null>(null);
  const navigate = useNavigate();

  const enviar = async (fotos: File[], t: string, forzar = false) => {
    if (!fotos.length && !t.trim()) return;
    setLeyendo(true); setError(null); setRepetida(null);
    try {
      const { data } = await leerCarga(fotos, t, ordenId, forzar);
      setEscribir(false); setTexto('');
      onHecho(data);
    } catch (err) {
      const r = err as { response?: { status?: number; data?: { detail?: { repetida?: number; mensaje?: string } } } };
      const det = r.response?.data?.detail;
      if (r.response?.status === 409 && det?.repetida) setRepetida({ id: det.repetida, mensaje: det.mensaje || 'Esta foto ya se subió.', fotos });
      else setError(mensajeError(err, describeApiError(err)));
    } finally {
      setLeyendo(false);
      if (camara.current) camara.current.value = '';
      if (galeria.current) galeria.current.value = '';
    }
  };
  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => enviar(Array.from(e.target.files || []), '');

  return (
    <>
      <div className={`carga-nueva${compacto ? ' compacto' : ''}`}>
        <button className="btn btn-primary btn-lg" onClick={() => camara.current?.click()} disabled={leyendo}>
          <Camera size={20} /> {compacto ? 'Foto de otro pedido' : 'Foto de la libreta'}
        </button>
        <button className="btn btn-ghost btn-lg" onClick={() => galeria.current?.click()} disabled={leyendo}>
          <Images size={20} /> Elegir fotos
        </button>
        <button className="btn btn-ghost btn-lg" onClick={() => setEscribir(true)} disabled={leyendo}>
          <PenLine size={20} /> Escribir o dictar
        </button>
        <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={elegir} />
        <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={elegir} />
      </div>
      {error && <div className="doc-aviso error" style={{ marginTop: 12 }}>{error}</div>}
      {repetida && (
        <div className="doc-aviso subidas carga-repetida" style={{ marginTop: 12 }}>
          <AlertTriangle size={18} />
          <div>
            <b>Foto repetida</b>
            <span>{repetida.mensaje}</span>
            <span className="carga-repetida-botones">
              {repetida.id !== ordenId && <button className="btn btn-primary btn-sm" onClick={() => navigate(`/cargas/${repetida.id}`)}>Abrir esa orden</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => enviar(repetida.fotos, '', true)}>Leerla igualmente</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setRepetida(null)}>Cancelar</button>
            </span>
          </div>
        </div>
      )}

      {escribir && (
        <div className="modal-overlay" onClick={() => !leyendo && setEscribir(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 17 }}>Escribir o dictar el pedido</span>
              <button className="modal-close" onClick={() => setEscribir(false)} aria-label="Cerrar">✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea className="form-input" rows={6} autoFocus value={texto} onChange={e => setTexto(e.target.value)}
                placeholder={'Mari Carmen, Arbón, 685 53 99 69. Servir esta semana: 2 metros de trito en bolsa, 10 sacos de cemento y 8 varillas del 12.'} />
              <small style={{ color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <Mic size={14} /> En el móvil, pulsa el micrófono del teclado para dictarlo.
              </small>
              {error && <div className="doc-aviso error">{error}</div>}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setEscribir(false)} disabled={leyendo}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => enviar([], texto)} disabled={leyendo || !texto.trim()}>
                {leyendo ? 'Leyendo…' : 'Preparar la carga'}
              </button>
            </div>
          </div>
        </div>
      )}

      {leyendo && (
        <div className="carga-leyendo" role="status">
          <div className="card">
            <CamionPegatina modo="rodando" ancho={230} />
            <b>Leyendo la hoja…</b>
            <small>Un momento, estoy pasando el cuaderno a limpio.</small>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Lista ───────────────────────────────────────────────────────────────────

export function CargasPage() {
  const navigate = useNavigate();
  const [ordenes, setOrdenes] = useState<OrdenCarga[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<'curso' | 'treyfact' | 'todas'>('curso');
  const [hoja, setHoja] = useState<number | null>(null);
  const cerrarHoja = useCallback(() => setHoja(null), []);
  const { toast, show } = useCfToast();
  const [buscar, setBuscar] = useState('');

  const load = useCallback(() => {
    listarCargas().then(r => {
      setOrdenes(r.data); setError(null);
      // Deja guardadas en el móvil las órdenes en curso, para abrirlas y firmar sin cobertura
      if (navigator.onLine) r.data.filter(o => o.estado !== 'entregado').slice(0, 10).forEach(o => { verCarga(o.id).catch(() => {}); });
    }).catch(err => setError(describeApiError(err)));
  }, []);
  useEffect(load, [load]);

  const enCurso = (ordenes || []).filter(o => o.estado !== 'entregado');
  // Los que se marcan como pasados se quedan a la vista (en verde) hasta salir de la pantalla
  const [recien, setRecien] = useState<Set<number>>(new Set());
  const porPasarTodas = (ordenes || []).flatMap(o => o.entregas.filter(e => e.estado === 'entregada' && (!e.treyfact_at || recien.has(e.id))));
  const quedan = porPasarTodas.filter(e => !e.treyfact_at).length;
  // Buscador: cliente, pueblo, número de albarán, teléfono o material
  const coincideEntrega = (e: EntregaCarga) => coincide(buscar, e.cliente, e.lugar, e.numero, e.telefono, ...e.lineas.map(l => l.descripcion));
  const porPasar = buscar.trim() ? porPasarTodas.filter(coincideEntrega) : porPasarTodas;
  const lista = (vista === 'curso' ? enCurso : ordenes || []).filter(o => !buscar.trim() || String(o.id) === buscar.trim() || o.entregas.some(coincideEntrega));

  const marcarPasado = async (e: EntregaCarga) => {
    try {
      await treyfactEntregaCarga(e.id, true);
      setRecien(r => new Set(r).add(e.id));
      load();
    } catch (err) { show(`No se pudo guardar: ${mensajeError(err, describeApiError(err))}`, { error: true }); }
  };
  const desmarcar = async (e: EntregaCarga) => {
    try { await treyfactEntregaCarga(e.id, false); load(); }
    catch (err) { show(`No se pudo guardar: ${describeApiError(err)}`, { error: true }); }
  };

  return (
    <div className="page">
      {error && <ConnectionError message={error} onRetry={load} />}
      {toast}
      {hoja != null && <HojaVisor entregaId={hoja} onClose={cerrarHoja} />}
      <div className="inicio-head" style={{ marginBottom: 14 }}>
        <div>
          <h1>Órdenes de carga <span className="aviso-chip" style={{ verticalAlign: 'middle' }}>En pruebas</span></h1>
          <p>Saca una foto a la hoja de la libreta y la app prepara la carga y la hoja de entrega para firmar.</p>
        </div>
      </div>

      <NuevaOrden onHecho={o => navigate(`/cargas/${o.id}`)} />

      <div className="firma-vistas" role="tablist" style={{ margin: '18px 0 12px' }}>
        {([['curso', 'En curso', enCurso.length], ['treyfact', 'Por pasar a TreyFACT', quedan], ['todas', 'Todas', (ordenes || []).length]] as const).map(([k, t, n]) => (
          <button key={k} role="tab" aria-selected={vista === k} className={`firma-vista${vista === k ? ' on' : ''}`} onClick={() => setVista(k)}>
            {t}<span className="firma-vista-n">{n}</span>
          </button>
        ))}
      </div>

      <div className="carga-buscar search-bar">
        <Search size={17} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        <input type="search" value={buscar} onChange={ev => setBuscar(ev.target.value)} placeholder="Buscar cliente, pueblo o número…" aria-label="Buscar órdenes de carga" />
        {buscar && <button className="search-bar-clear" onClick={() => setBuscar('')} aria-label="Borrar búsqueda"><X size={16} /></button>}
      </div>

      {ordenes == null ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : vista === 'treyfact' ? (
        porPasar.length === 0 ? (
          buscar.trim()
            ? <div className="empty-state"><div className="empty-state-text">Nada por pasar con «{buscar.trim()}».</div></div>
            : <Vacio dibujo="facturaOk" titulo="Todo pasado a TreyFACT" texto="No queda ninguna entrega firmada por pasar." />
        ) : (
          <div className="card ana-lista">
            {porPasar.map(e => (
              <div key={e.id} className="ana-fila estatica treyfact-fila">
                <span className="ana-txt">
                  <b>{e.cliente || 'Sin nombre'}</b>
                  <small>{[e.numero, `firmado ${fechaHora(e.firmado_at)}`, materiales(e.lineas.filter(l => l.cargado_ok || l.cargado).length)].filter(Boolean).join(' · ')}</small>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setHoja(e.id)}><FileText size={15} /> Hoja</button>
                {e.treyfact_at ? (
                  <span className="treyfact-hecho">
                    <span className="cat-chip ok"><Check size={14} /> Pasado a TreyFACT</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => desmarcar(e)}>Deshacer</button>
                  </span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => marcarPasado(e)}>Marcar como pasado</button>
                )}
              </div>
            ))}
          </div>
        )
      ) : lista.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><ClipboardCheck size={40} style={{ color: 'var(--text-3)' }} /></div>
          <div className="empty-state-text">{buscar.trim() ? `Ninguna orden con «${buscar.trim()}».` : vista === 'curso' ? 'No hay nada por cargar ni por entregar.' : 'Todavía no hay órdenes de carga.'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista.map(o => {
            const ls = lineasDe(o), hechas = ls.filter(l => l.cargado_ok).length;
            const dudas = ls.filter(l => l.duda).length + o.entregas.filter(e => e.dudas).length;
            return (
              <button key={o.id} className="card carga-card" onClick={() => navigate(`/cargas/${o.id}`)}>
                <span className="carga-card-txt">
                  <b>{o.entregas.map(e => e.cliente || 'Sin nombre').join(' · ') || 'Sin pedidos'}</b>
                  <small>
                    {[...new Set(o.entregas.map(e => e.lugar).filter(Boolean))].join(', ')}
                    {o.entregas.some(e => e.lugar) ? ' · ' : ''}{materiales(ls.length)} · {fechaHora(o.created_at)}
                  </small>
                  <span className="carga-card-chips">
                    <span className={`status-chip carga-${o.estado}`}>{ESTADO[o.estado]}</span>
                    {o.estado === 'preparando' && ls.length > 0 && <span className="cat-chip gris">Cargado {hechas}/{ls.length}</span>}
                    {dudas > 0 && o.estado === 'preparando' && <span className="aviso-chip">{dudas} por revisar</span>}
                  </span>
                </span>
                <ChevronRight size={20} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Editar datos / material ─────────────────────────────────────────────────

function DatosModal({ e, onClose, onSaved }: { e: EntregaCarga; onClose: () => void; onSaved: (e: EntregaCarga) => void }) {
  const [f, setF] = useState({ cliente: e.cliente, lugar: e.lugar || '', telefono: e.telefono || '', notas: [e.cuando, e.notas].filter(Boolean).join('; '), servir: e.servir, pagado: e.pagado });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: 'cliente' | 'lugar' | 'telefono' | 'notas') => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: ev.target.value }));
  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!f.cliente.trim()) { setError('Falta el nombre del cliente'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await editarEntregaCarga(e.id, {
        cliente: f.cliente.trim(), lugar: f.lugar.trim() || null, telefono: f.telefono.trim() || null,
        cuando: null, notas: f.notas.trim() || null, servir: f.servir, pagado: f.pagado, dudas: null,
      });
      onSaved(data);
    } catch (err) { setError(mensajeError(err, describeApiError(err))); } finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rep-modal" style={{ maxWidth: 500 }} onClick={ev => ev.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>Datos del cliente</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={guardar}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div className="doc-aviso error" role="alert">{error}</div>}
            <div className="campos-2">
              <div><label className="form-label">Cliente *</label><input className="form-input" value={f.cliente} onChange={set('cliente')} /></div>
              <div><label className="form-label">Pueblo u obra</label><input className="form-input" value={f.lugar} onChange={set('lugar')} /></div>
              <div><label className="form-label">Teléfono</label><input className="form-input" type="tel" value={f.telefono} onChange={set('telefono')} /></div>
            </div>
            <div className="carga-opciones">
              <label><input type="checkbox" checked={f.servir} onChange={ev => setF(v => ({ ...v, servir: ev.target.checked }))} /> Servir (llevar a la obra)</label>
              <label><input type="checkbox" checked={f.pagado} onChange={ev => setF(v => ({ ...v, pagado: ev.target.checked }))} /> Ya está pagado</label>
            </div>
            <div><label className="form-label">Notas (cuándo, cómo llegar…)</label><textarea className="form-input" rows={2} value={f.notas} onChange={set('notas')} placeholder="Esta semana, por la mañana…" /></div>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LineaModal({ entregaId, ln, onClose, onSaved, onDelete }: {
  entregaId: number; ln: LineaCarga | null; onClose: () => void; onSaved: () => void; onDelete?: () => void;
}) {
  const [c, setC] = useState(cant(ln?.cantidad));
  const [u, setU] = useState(ln?.unidad || '');
  const [d, setD] = useState(ln?.descripcion || '');
  const [parte, setParte] = useState(ln?.cargado != null && !ln.cargado_ok ? cant(ln.cargado) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!d.trim()) { setError('Falta qué material es'); return; }
    const lc = leerImporte(c), lp = leerImporte(parte);
    if (!lc.ok) { setError(`Cantidad: ${lc.error.replace('El importe', 'la cantidad')}`); return; }
    if (!lp.ok) { setError(`Lo cargado: ${lp.error.replace('El importe', 'lo cargado')}`); return; }
    const cn = lc.n, pn = lp.n;
    if (cn != null && cn <= 0) { setError('La cantidad tiene que ser mayor que 0 (si no va, quita el material)'); return; }
    if (pn != null && pn <= 0) { setError('Lo cargado tiene que ser mayor que 0. Si no se carga nada, deja la casilla vacía y no marques el material.'); return; }
    setSaving(true); setError('');
    try {
      const datos = { cantidad: cn, unidad: u.trim() || null, descripcion: d.trim() };
      if (ln) {
        const completo = pn != null && cn != null && pn >= cn;
        // Vacío = va todo: se quita lo de «cargado solo una parte»
        const parcial = pn != null ? { cargado: completo ? null : pn, cargado_ok: completo }
          : ln.cargado != null && !ln.cargado_ok ? { cargado: null } : {};
        await editarLineaCarga(ln.id, { ...datos, duda: null, ...parcial });
      } else await nuevaLineaCarga(entregaId, datos);
      onSaved();
    } catch (err) { setError(mensajeError(err, describeApiError(err))); } finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rep-modal" style={{ maxWidth: 460 }} onClick={ev => ev.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>{ln ? 'Material' : 'Añadir material'}</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={guardar}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div className="doc-aviso error" role="alert">{error}</div>}
            {ln?.duda && <div className="doc-aviso subidas"><AlertTriangle size={18} /><div><b>Revisar</b>{ln.duda}</div></div>}
            {ln?.original && <small style={{ color: 'var(--text-3)' }}>En la libreta pone: «{ln.original}»</small>}
            <div className="campos-2">
              <div><label className="form-label">Cantidad</label><input className="form-input" type="text" inputMode="decimal" value={c} onChange={ev => setC(ev.target.value)} autoFocus={!ln} /></div>
              <div><label className="form-label">Unidad</label><input className="form-input" value={u} onChange={ev => setU(ev.target.value)} placeholder="sacos, m³, ud…" list="unidades-carga" /></div>
            </div>
            <datalist id="unidades-carga">{['sacos', 'm³', 'ud', 'kg', 'm', 'm²', 'palés', 'bolsas', 'barras', 'rollos'].map(x => <option key={x} value={x} />)}</datalist>
            <div><label className="form-label">Material</label><input className="form-input" value={d} onChange={ev => setD(ev.target.value)} /></div>
            {ln && (
              <div>
                <label className="form-label">¿Solo se carga una parte? ¿Cuánto?</label>
                <input className="form-input" type="text" inputMode="decimal" value={parte} onChange={ev => setParte(ev.target.value)} placeholder="Déjalo vacío si va todo" style={{ maxWidth: 200 }} />
                <small style={{ color: 'var(--text-3)', display: 'block', marginTop: 4 }}>{parte.trim() ? 'Se cargará solo esa cantidad; el resto queda pendiente.' : 'Vacío: va todo.'}</small>
              </div>
            )}
          </div>
          <div className="modal-pie">
            {ln && onDelete && <button type="button" className="btn btn-ghost btn-sm modal-pie-quitar" onClick={onDelete}><Trash2 size={14} /> Quitar</button>}
            <span className="modal-pie-botones">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : ln ? 'Guardar' : 'Añadir'}</button>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Firma del cliente ───────────────────────────────────────────────────────

function FirmaModal({ e, ordenId, onClose, onFirmado }: {
  e: EntregaCarga; ordenId: number; onClose: () => void; onFirmado: (sinRed: boolean) => void;
}) {
  const pad = useRef<{ clear: () => void; toBlob: () => Promise<Blob | null>; isEmpty: () => boolean } | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const [tinta, setTinta] = useState(false);
  const [nombre, setNombre] = useState(e.cliente);
  const [dni, setDni] = useState('');
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const llevados = e.lineas.filter(l => l.cargado_ok || l.cargado);
  const faltan = e.lineas.filter(l => !l.cargado_ok);
  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url); }, [foto]);

  const elegirFoto = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    const blob = await reducirFoto(f);
    setFoto({ blob, url: URL.createObjectURL(blob) });
    ev.target.value = '';
  };

  const firmar = async () => {
    if (!pad.current || pad.current.isEmpty()) { setError('Falta la firma'); return; }
    if (!nombre.trim()) { setError('Falta el nombre de quien firma'); return; }
    setSaving(true); setError('');
    const blob = await pad.current.toBlob();
    if (!blob) { setError('No se pudo leer la firma'); setSaving(false); return; }
    const cargadas = Object.fromEntries(e.lineas.map(l => [String(l.id), { ok: l.cargado_ok, cargado: l.cargado }]));
    try {
      await firmarEntregaCarga(e.id, blob, nombre, dni, { foto: foto?.blob, cargadas });
      onFirmado(false);
    } catch (err) {
      if (sinRed(err)) {
        // Sin cobertura: se guarda en el móvil y se envía sola
        try {
          await firmaSinRed({ entregaId: e.id, ordenId, cliente: e.cliente, nombre, dni, cargadas }, blob, foto?.blob || null);
          onFirmado(true);
        } catch (e2) { setError((e2 as Error).message); }
      } else setError(mensajeError(err, describeApiError(err)));
    } finally { setSaving(false); }
  };

  return (
    <div className="carga-firma" role="dialog" aria-label="Firma del cliente">
      <div className="carga-firma-head">
        <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /> Cancelar</button>
        <b>Entrega a {e.cliente}</b>
      </div>
      <div className="carga-firma-cuerpo">
        <div className="card seccion">
          <div className="seccion-titulo">Se entrega</div>
          <ul className="carga-firma-lista">
            {llevados.map(l => (
              <li key={l.id}><b>{cantUd(l.cargado_ok ? l.cantidad : l.cargado, l.unidad)}</b> {l.descripcion}</li>
            ))}
          </ul>
          {faltan.length > 0 && <small style={{ color: 'var(--warning)' }}>Sin cargar o a medias: {faltan.map(l => l.descripcion).join(', ')}. Saldrá como pendiente en la hoja.</small>}
        </div>

        <div className="carga-foto-entrega">
          {foto ? (
            <>
              <img src={foto.url} alt="Foto de la entrega" />
              <button className="btn btn-ghost btn-sm" onClick={() => setFoto(null)}><X size={14} /> Quitar foto</button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={() => camara.current?.click()}>
              <Camera size={18} /> Foto del material descargado (si quieres)
            </button>
          )}
          <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={elegirFoto} />
        </div>

        <div className="campos-2" style={{ marginTop: 12 }}>
          <div><label className="form-label">Nombre de quien firma</label><input className="form-input" value={nombre} onChange={ev => setNombre(ev.target.value)} /></div>
          <div><label className="form-label">DNI (si quiere)</label><input className="form-input" value={dni} onChange={ev => setDni(ev.target.value)} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <SignaturePad padRef={pad} onChange={setTinta} />
        </div>
        {error && <div className="doc-aviso error" style={{ marginTop: 10 }}>{error}</div>}
        <div className="carga-firma-botones">
          <button className="btn btn-ghost btn-lg" onClick={() => pad.current?.clear()} disabled={!tinta}><Eraser size={18} /> Borrar</button>
          <button className="btn btn-primary btn-lg" onClick={firmar} disabled={saving || !tinta}>
            {saving ? 'Guardando…' : <><Check size={20} /> Firmar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Resumen del viaje: cada material sumado ─────────────────────────────────

function ResumenViaje({ o }: { o: OrdenCarga }) {
  const clave = (l: LineaCarga) => `${l.descripcion.trim().toLowerCase()}|${(l.unidad || '').trim().toLowerCase()}`;
  const grupos = new Map<string, { desc: string; unidad: string; total: number; sinCant: boolean; cargadas: number; n: number; por: { cliente: string; c: number | null }[] }>();
  for (const e of o.entregas) for (const l of e.lineas) {
    const g = grupos.get(clave(l)) || { desc: l.descripcion, unidad: l.unidad || '', total: 0, sinCant: false, cargadas: 0, n: 0, por: [] };
    g.total += l.cantidad || 0; if (l.cantidad == null) g.sinCant = true;
    g.n++; if (l.cargado_ok) g.cargadas++;
    g.por.push({ cliente: e.cliente || 'Sin nombre', c: l.cantidad });
    grupos.set(clave(l), g);
  }
  const lista = [...grupos.values()].sort((a, b) => a.desc.localeCompare(b.desc, 'es'));
  return (
    <details className="card carga-resumen" open>
      <summary><Truck size={17} /> Resumen del viaje <small>{materiales(lista.length)} · {plural(o.entregas.length, 'cliente')}</small></summary>
      <div>
        {lista.map(g => (
          <div key={g.desc + g.unidad} className={`carga-resumen-fila${g.cargadas === g.n ? ' hecho' : ''}`}>
            <span className="carga-cant">{g.sinCant && !g.total ? g.unidad : cantUd(g.total, g.unidad)}</span>
            <span className="carga-resumen-txt">
              <b>{g.desc}</b>
              {g.por.length > 1 && <small>{g.por.map(p => `${cant(p.c)} ${p.cliente}`).join(' + ')}</small>}
              {g.por.length === 1 && <small>{g.por[0].cliente}</small>}
            </span>
            {g.cargadas === g.n && <Check size={18} style={{ color: 'var(--cf-verde)', flexShrink: 0 }} />}
          </div>
        ))}
      </div>
    </details>
  );
}

const mapa = (lugar: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lugar}, Asturias`)}`;

// ─── Una orden ───────────────────────────────────────────────────────────────

export function OrdenCargaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const { toast, show } = useCfToast();
  const [o, setO] = useState<OrdenCarga | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [datos, setDatos] = useState<EntregaCarga | null>(null);
  const [linea, setLinea] = useState<{ entregaId: number; ln: LineaCarga | null } | null>(null);
  const [firmando, setFirmando] = useState<EntregaCarga | null>(null);
  const [entregado, setEntregado] = useState(false);
  const [hoja, setHoja] = useState<number | null>(null);
  const cerrarHoja = useCallback(() => setHoja(null), []);
  const [mas, setMas] = useState(false);
  const [, setCola] = useState(0);  // para repintar cuando cambia lo guardado sin cobertura
  const [online, setOnline] = useState(navigator.onLine);
  const fotoEntrega = useRef<HTMLInputElement>(null);
  const [fotoPara, setFotoPara] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    return verCarga(Number(id)).then(r => { setO(r.data); setError(null); }).catch(err => setError(describeApiError(err)));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const c = () => setCola(n => n + 1);
    const enviada = () => { load(); show('Lo guardado sin cobertura ya se ha enviado'); };
    const on = () => { setOnline(true); enviarColaCargas(); };
    const off = () => setOnline(false);
    window.addEventListener('cf-cola-cargas', c);
    window.addEventListener('cf-cola-cargas-enviada', enviada);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('cf-cola-cargas', c); window.removeEventListener('cf-cola-cargas-enviada', enviada);
      window.removeEventListener('online', on); window.removeEventListener('offline', off);
    };
  }, [load, show]);

  // Lo marcado sin cobertura se ve ya marcado
  const conCola = (l: LineaCarga, entregaId: number): LineaCarga => {
    const f = firmaEnCola(entregaId)?.cargadas[String(l.id)];
    if (f) return { ...l, cargado_ok: f.ok, cargado: f.cargado };
    const m = marcaEnCola(l.id);
    return m ? { ...l, cargado_ok: m.ok, cargado: null } : l;
  };

  const tocar = async (ln: LineaCarga) => {
    const nuevo = !ln.cargado_ok;
    setO(v => v && ({ ...v, entregas: v.entregas.map(e => ({ ...e, lineas: e.lineas.map(l => l.id === ln.id ? { ...l, cargado_ok: nuevo, cargado: null } : l) })) }));
    try { await editarLineaCarga(ln.id, { cargado_ok: nuevo, cargado: null }); load(); }
    catch (err) {
      if (sinRed(err)) { try { marcarSinRed(ln.id, nuevo); } catch (e2) { show((e2 as Error).message, { error: true }); } }
      else { show(`No se pudo guardar: ${describeApiError(err)}`, { error: true }); load(); }
    }
  };

  const quitarLinea = async (ln: LineaCarga) => {
    if (!await confirm({ title: 'Quitar material', message: `¿Quitar «${ln.descripcion}»?`, confirmLabel: 'Quitar', danger: true })) return;
    try { await borrarLineaCarga(ln.id); setLinea(null); load(); }
    catch (err) { show(`No se pudo quitar: ${describeApiError(err)}`, { error: true }); }
  };

  const quitarEntrega = async (e: EntregaCarga) => {
    if (!await confirm({ title: 'Quitar pedido', message: `¿Quitar el pedido de ${e.cliente || 'este cliente'} de la orden?`, confirmLabel: 'Quitar', danger: true })) return;
    try { await borrarEntregaCarga(e.id); load(); }
    catch (err) { show(`No se pudo quitar: ${describeApiError(err)}`, { error: true }); }
  };

  const sinCobertura = () => { show('Esto necesita cobertura. Prueba cuando vuelva la señal.', { error: true }); };

  const mover = async (e: EntregaCarga, dir: -1 | 1) => {
    if (!o) return;
    if (!online) { sinCobertura(); return; }
    const ids = o.entregas.map(x => x.id), i = ids.indexOf(e.id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { setO((await ordenarEntregasCarga(o.id, ids)).data); }
    catch (err) { show(sinRed(err) ? 'Esto necesita cobertura. Prueba cuando vuelva la señal.' : `No se pudo cambiar el orden: ${mensajeError(err, describeApiError(err))}`, { error: true }); }
  };

  const borrarOrden = async () => {
    if (!o || !await confirm({ title: 'Borrar orden de carga', message: 'Se borra la orden con sus fotos y firmas. No se puede deshacer.', confirmLabel: 'Borrar', danger: true })) return;
    try { await borrarCarga(o.id); navigate('/cargas'); }
    catch (err) { show(`No se pudo borrar: ${describeApiError(err)}`, { error: true }); }
  };

  const repetirFirma = async (e: EntregaCarga) => {
    if (!await confirm({ title: 'Repetir la firma', message: 'Se borra la firma de esta entrega para volver a firmarla.', confirmLabel: 'Borrar firma', danger: true })) return;
    try { await anularFirmaCarga(e.id); load(); }
    catch (err) { show(`No se pudo: ${describeApiError(err)}`, { error: true }); }
  };

  const subirFotoEntrega = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f || fotoPara == null) return;
    try { await fotoEntregaCarga(fotoPara, await reducirFoto(f)); load(); show('Foto guardada'); }
    catch (err) { show(`No se pudo guardar la foto: ${describeApiError(err)}`, { error: true }); }
  };

  if (!o) return <div className="page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>{error || 'Cargando…'}</div>;

  const entregas = o.entregas.map(e => ({ ...e, lineas: e.lineas.map(l => conCola(l, e.id)) }));
  const ls = entregas.flatMap(e => e.lineas), hechas = ls.filter(l => l.cargado_ok).length;

  return (
    <div className="page carga-detalle">
      {ConfirmDialog}
      {toast}
      {hoja != null && <HojaVisor entregaId={hoja} onClose={cerrarHoja} />}
      <div className="pedido-head">
        <div style={{ flex: '1 1 100%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="doc-volver" onClick={() => navigate('/cargas')}><ArrowLeft size={16} /> Órdenes</button>
            <h1>{o.entregas.map(e => e.cliente || 'Sin nombre').join(' · ') || 'Orden de carga'}</h1>
            <span className={`status-chip carga-${o.estado}`}>{ESTADO[o.estado]}</span>
          </div>
          <div className="pedido-sub">
            {[...new Set(o.entregas.map(e => e.lugar).filter(Boolean))].length > 0 && (
              <span><MapPin size={15} /> {[...new Set(o.entregas.map(e => e.lugar).filter(Boolean))].join(', ')}</span>
            )}
            <span><Truck size={15} /> Orden de carga · {plural(o.entregas.length, 'pedido')}</span>
            <span>Cargado {hechas} de {ls.length}</span>
            <span>{fechaHora(o.created_at)}</span>
          </div>
          {ls.length > 0 && <div className="carga-barra"><span style={{ width: `${(hechas / ls.length) * 100}%` }} /></div>}
        </div>
      </div>

      {!online && (
        <div className="reparto-sinred" style={{ marginTop: 12 }}><CloudOff size={20} /> Sin cobertura. Puedes marcar lo cargado y firmar: se enviará solo al volver la señal.</div>
      )}

      {o.parecidas.length > 0 && (
        <div className="doc-aviso subidas" style={{ marginTop: 12 }}>
          <AlertTriangle size={18} />
          <div>
            {(() => {
              const otras = [...new Map(o.parecidas.map(p => [p.orden_id, p])).values()];
              const nombres = [...new Set(o.parecidas.map(x => x.cliente))];
              return (
                <span>
                  <b>¿Pedido repetido?</b> {nombres.slice(0, 2).join(' y ')}{nombres.length > 2 ? ` y ${nombres.length - 2} más` : ''} {nombres.length > 1 ? 'tienen' : 'tiene'} {otras.length > 1 ? `otras ${otras.length} órdenes` : 'otra orden'} sin entregar.{' '}
                  {otras.slice(0, 2).map((p, i) => (
                    <span key={p.orden_id}>{i > 0 && ' · '}
                      <button className="turnos-link" onClick={() => navigate(`/cargas/${p.orden_id}`)}>Ver la del {fechaHora(p.creada)}</button>
                    </span>
                  ))}
                </span>
              );
            })()}
          </div>
        </div>
      )}

      {o.fotos.length > 0 && (
        <div className="carga-fotos-caja">
          <small>Toca la foto para compararla con la lista</small>
          <div className="carga-fotos">
            {o.fotos.map(f => (
              <button key={f} onClick={() => setFoto(f)} aria-label="Ver la hoja de la libreta">
                <img src={fotoCargaUrl(f)} alt="Hoja de la libreta" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      {o.entregas.length > 1 && <ResumenViaje o={{ ...o, entregas }} />}

      {entregas.map((e, idx) => {
        const guardada = firmaEnCola(e.id);
        const firmada = e.estado === 'entregada' || !!guardada;
        const faltan = e.lineas.filter(l => !l.cargado_ok).length;
        const nada = !e.lineas.some(l => l.cargado_ok || l.cargado);
        const dudas = e.lineas.filter(l => l.duda);
        return (
          <section key={e.id} className={`card carga-entrega${firmada ? ' firmada' : ''}`}>
            <div className="carga-entrega-head">
              {o.entregas.length > 1 && (
                <div className="carga-mover">
                  <span>{idx + 1}</span>
                  <button onClick={() => mover(e, -1)} disabled={idx === 0} aria-label="Subir en el reparto"><ChevronUp size={18} /></button>
                  <button onClick={() => mover(e, 1)} disabled={idx === o.entregas.length - 1} aria-label="Bajar en el reparto"><ChevronDown size={18} /></button>
                </div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2>{e.cliente || 'Sin nombre'}</h2>
                <div className="pedido-sub" style={{ marginTop: 4 }}>
                  {e.lugar && <span>{e.lugar}</span>}
                  {e.telefono && <a href={`tel:${e.telefono.replace(/\s/g, '')}`}><Phone size={14} /> {e.telefono}</a>}
                </div>
                <div className="carga-card-chips" style={{ marginTop: 8 }}>
                  <span className="cat-chip">{e.servir ? 'Servir' : 'Recoge en tienda'}</span>
                  {e.pagado && <span className="cat-chip">Pagado</span>}
                  {e.numero && <span className="cat-chip gris">{e.numero}</span>}
                  {e.treyfact_at && <span className="cat-chip ok"><Check size={13} /> Pasado a TreyFACT</span>}
                </div>
              </div>
              <div className="carga-entrega-acc">
                {e.lugar && e.servir && <a className="btn btn-ghost btn-sm" href={mapa(e.lugar)} target="_blank" rel="noopener noreferrer"><MapPin size={14} /> Cómo llegar</a>}
                {!firmada && <button className="btn btn-ghost btn-sm" onClick={() => (online ? setDatos(e) : sinCobertura())}><Pencil size={14} /> Datos</button>}
              </div>
            </div>

            {e.dudas && !firmada && <div className="doc-aviso subidas" style={{ margin: '0 16px 10px' }}><AlertTriangle size={18} /><div><b>Revisa</b>{e.dudas}</div></div>}
            {dudas.length > 0 && !firmada && (
              <div className="carga-revisar">Hay {dudas.length} material{dudas.length !== 1 ? 'es' : ''} marcado{dudas.length !== 1 ? 's' : ''} para revisar. Tócalo para corregirlo.</div>
            )}
            {(e.cuando || e.notas) && <div className="carga-notas">{[e.cuando, e.notas].filter(Boolean).join('; ')}</div>}

            {e.lineas.map(l => {
              const medio = !l.cargado_ok && l.cargado != null && l.cargado > 0;
              return (
                <div key={l.id} className={`pedido-linea${l.cargado_ok ? ' llego' : ''}${medio ? ' medio' : ''}${l.duda ? ' duda' : ''}`}>
                  <button className="pedido-check" onClick={() => tocar(l)} disabled={firmada}
                    aria-pressed={l.cargado_ok} aria-label={l.cargado_ok ? `${l.descripcion}: cargado. Toca para desmarcar` : `Marcar ${l.descripcion} como cargado`}>
                    {l.cargado_ok ? <Check size={22} strokeWidth={3} /> : medio ? <Medio /> : null}
                  </button>
                  <button className="pedido-linea-txt" onClick={() => !firmada && setLinea({ entregaId: e.id, ln: l })} disabled={firmada}>
                    <b><span className="carga-cant">{cantUd(l.cantidad, l.unidad)}</span> {l.descripcion}</b>
                    {medio && <small className="carga-parcial"><Medio /> Cargado solo {cantUd(l.cargado, l.unidad)}</small>}
                    {l.duda && <small className="carga-duda"><AlertTriangle size={13} /> {l.duda}</small>}
                  </button>
                </div>
              );
            })}
            {!firmada && (
              <button className="carga-anadir" onClick={() => setLinea({ entregaId: e.id, ln: null })}><Plus size={16} /> Añadir material</button>
            )}

            <div className="carga-entrega-pie">
              {guardada ? (
                guardada.error ? (
                  <div className="doc-aviso error" style={{ margin: 0, width: '100%' }}>
                    <AlertTriangle size={18} />
                    <div>
                      <b>La firma guardada sin cobertura no se pudo enviar</b>
                      <span>{guardada.error}</span>
                      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
                        onClick={async () => { if (await confirm({ title: 'Quitar la firma guardada', message: 'Se borra del móvil para volver a firmar.', confirmLabel: 'Quitar', danger: true })) descartarFirma(e.id); }}>
                        Quitar y volver a firmar
                      </button>
                    </div>
                  </div>
                ) : (
                  <span className="carga-en-cola"><CloudOff size={18} /> Firmada por {guardada.nombre} sin cobertura. Se enviará sola al volver la señal.</span>
                )
              ) : e.estado === 'entregada' ? (
                <>
                  <span className="rep-hecha">✓ Firmado por {e.firmado_por} · {fechaHora(e.firmado_at)}</span>
                  <button className="btn btn-primary" onClick={() => setHoja(e.id)}><FileText size={17} /> Hoja de entrega</button>
                  {e.foto_entrega
                    ? <button className="carga-foto-mini" onClick={() => setFoto(e.foto_entrega!)} aria-label="Ver la foto de la entrega"><img src={fotoCargaUrl(e.foto_entrega)} alt="" /></button>
                    : <button className="btn btn-ghost btn-sm" onClick={() => { setFotoPara(e.id); fotoEntrega.current?.click(); }}><Camera size={15} /> Añadir foto</button>}
                  <span className="carga-drive">{e.drive_at ? <><Cloud size={14} /> Guardada en Drive</> : 'Guardándose en Drive…'}</span>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-3)' }} onClick={() => repetirFirma(e)}>Repetir la firma</button>
                </>
              ) : (
                <>
                  {nada && e.lineas.length > 0 && <span className="pedido-pista">Marca lo que se carga para poder firmar.</span>}
                  {!nada && faltan > 0 && <span className="pedido-pista">{faltan === 1 ? 'Falta 1 por cargar.' : `Faltan ${faltan} por cargar.`}</span>}
                  <button className={`btn btn-lg ${faltan === 0 && e.lineas.length > 0 ? 'btn-primary' : 'btn-ghost'}`} disabled={nada} onClick={() => setFirmando(e)}>
                    <PenLine size={18} /> Firma del cliente
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setHoja(e.id)} disabled={!online}><FileText size={15} /> Ver la hoja</button>
                  {o.entregas.length > 1 && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => quitarEntrega(e)}><Trash2 size={14} /> Quitar pedido</button>}
                </>
              )}
            </div>
          </section>
        );
      })}
      <input ref={fotoEntrega} type="file" accept="image/*" capture="environment" hidden onChange={subirFotoEntrega} />

      <div className="card seccion" style={{ marginTop: 14 }}>
        <div className="seccion-titulo">¿Va algo más en este viaje?</div>
        <NuevaOrden compacto ordenId={o.id} onHecho={d => { setO(d); show('Pedido añadido al viaje'); }} />
      </div>

      <details className="mas-opciones pedido-mas" style={{ marginTop: 16 }} open={mas} onToggle={ev => setMas((ev.target as HTMLDetailsElement).open)}>
        <summary>Más opciones</summary>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={borrarOrden}><Trash2 size={15} /> Borrar la orden de carga</button>
        </div>
      </details>

      {foto && (
        <div className="carga-foto-grande" onClick={() => setFoto(null)} role="dialog" aria-label="Foto">
          <button className="modal-close" aria-label="Cerrar">✕</button>
          <img src={fotoCargaUrl(foto)} alt="Foto" onClick={ev => ev.stopPropagation()} />
        </div>
      )}
      {datos && <DatosModal e={datos} onClose={() => setDatos(null)} onSaved={() => { setDatos(null); load(); }} />}
      {linea && <LineaModal entregaId={linea.entregaId} ln={linea.ln} onClose={() => setLinea(null)}
        onSaved={() => { setLinea(null); load(); }} onDelete={linea.ln ? () => quitarLinea(linea.ln!) : undefined} />}
      {firmando && <FirmaModal e={firmando} ordenId={o.id} onClose={() => setFirmando(null)}
        onFirmado={sr => { setFirmando(null); load(); setEntregado(true); setTimeout(() => setEntregado(false), 1500); if (sr) show('Firma guardada. Se enviará sola'); }} />}
      {entregado && <SelloHecho texto="ENTREGADO" titulo="Entrega firmada" />}
    </div>
  );
}
