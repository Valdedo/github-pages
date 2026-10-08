import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera, Images, PenLine, ClipboardCheck, Check, Pencil, Plus, Trash2, Phone, FileText,
  AlertTriangle, ArrowLeft, Truck, Eraser, ChevronRight, X, Mic,
} from 'lucide-react';
import {
  listarCargas, verCarga, borrarCarga, leerCarga, fotoCargaUrl, nuevaEntregaCarga, editarEntregaCarga,
  borrarEntregaCarga, firmarEntregaCarga, anularFirmaCarga, hojaEntregaUrl, treyfactEntregaCarga,
  nuevaLineaCarga, editarLineaCarga, borrarLineaCarga, describeApiError,
  type OrdenCarga, type EntregaCarga, type LineaCarga,
} from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { useConfirm } from '../components/ConfirmModal';
import { useCfToast } from '../components/CfToast';
import { numES } from '../components/AvisoCliente';
import { SignaturePad } from './FirmaDetailPage';

const cant = (n: number | null | undefined) => (n == null ? '' : String(+n.toFixed(2)).replace('.', ','));
const fechaHora = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};
const ESTADO: Record<OrdenCarga['estado'], string> = { preparando: 'Por cargar', cargado: 'Cargado', entregado: 'Entregado' };
const lineasDe = (o: OrdenCarga) => o.entregas.flatMap(e => e.lineas);

// ─── Nueva orden: foto o texto ───────────────────────────────────────────────

function NuevaOrden({ ordenId, onHecho, compacto }: { ordenId?: number; onHecho: (o: OrdenCarga) => void; compacto?: boolean }) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [escribir, setEscribir] = useState(false);
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (fotos: File[], t: string) => {
    if (!fotos.length && !t.trim()) return;
    setLeyendo(true); setError(null);
    try {
      const { data } = await leerCarga(fotos, t, ordenId);
      setEscribir(false); setTexto('');
      onHecho(data);
    } catch (err) {
      setError(describeApiError(err));
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
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
            <span className="spinner" />
            <b>Leyendo la hoja…</b>
            <small>Tarda unos segundos.</small>
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
  const { toast, show } = useCfToast();

  const load = useCallback(() => {
    listarCargas().then(r => { setOrdenes(r.data); setError(null); }).catch(err => setError(describeApiError(err)));
  }, []);
  useEffect(load, [load]);

  const enCurso = (ordenes || []).filter(o => o.estado !== 'entregado');
  const porPasar = (ordenes || []).flatMap(o => o.entregas.filter(e => e.estado === 'entregada' && !e.treyfact_at));
  const lista = vista === 'curso' ? enCurso : ordenes || [];

  const marcarPasado = async (e: EntregaCarga) => {
    try {
      await treyfactEntregaCarga(e.id, true);
      load();
      show(`${e.cliente}: pasado a TreyFACT`, { undo: async () => { await treyfactEntregaCarga(e.id, false); load(); } });
    } catch (err) { show(`No se pudo guardar: ${describeApiError(err)}`, { error: true }); }
  };

  return (
    <div className="page">
      {error && <ConnectionError message={error} onRetry={load} />}
      {toast}
      <div className="inicio-head" style={{ marginBottom: 14 }}>
        <div>
          <h1>Órdenes de carga <span className="aviso-chip" style={{ verticalAlign: 'middle' }}>En pruebas</span></h1>
          <p>Saca una foto a la hoja de la libreta y la app prepara la carga y la hoja de entrega para firmar.</p>
        </div>
      </div>

      <NuevaOrden onHecho={o => navigate(`/cargas/${o.id}`)} />

      <div className="firma-vistas" role="tablist" style={{ margin: '18px 0 12px' }}>
        {([['curso', 'En curso', enCurso.length], ['treyfact', 'Por pasar a TreyFACT', porPasar.length], ['todas', 'Todas', (ordenes || []).length]] as const).map(([k, t, n]) => (
          <button key={k} role="tab" aria-selected={vista === k} className={`firma-vista${vista === k ? ' on' : ''}`} onClick={() => setVista(k)}>
            {t}<span className="firma-vista-n">{n}</span>
          </button>
        ))}
      </div>

      {ordenes == null ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : vista === 'treyfact' ? (
        porPasar.length === 0 ? (
          <div className="empty-state"><div className="empty-state-text">No hay entregas firmadas pendientes de pasar.</div></div>
        ) : (
          <div className="card ana-lista">
            {porPasar.map(e => (
              <div key={e.id} className="ana-fila estatica">
                <span className="ana-txt">
                  <b>{e.cliente || 'Sin nombre'}</b>
                  <small>{e.numero} · firmado {fechaHora(e.firmado_at)} · {e.lineas.filter(l => l.cargado_ok || l.cargado).length} materiales</small>
                </span>
                <a className="btn btn-ghost btn-sm" href={hojaEntregaUrl(e.id)} target="_blank" rel="noopener noreferrer"><FileText size={15} /> Hoja</a>
                <button className="btn btn-primary btn-sm" onClick={() => marcarPasado(e)}><Check size={15} /> Ya está pasado</button>
              </div>
            ))}
          </div>
        )
      ) : lista.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><ClipboardCheck size={40} style={{ color: 'var(--text-3)' }} /></div>
          <div className="empty-state-text">{vista === 'curso' ? 'No hay nada por cargar ni por entregar.' : 'Todavía no hay órdenes de carga.'}</div>
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
                    {o.entregas.some(e => e.lugar) ? ' · ' : ''}{ls.length} material{ls.length !== 1 ? 'es' : ''} · {fechaHora(o.created_at)}
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
  const [f, setF] = useState({ cliente: e.cliente, lugar: e.lugar || '', telefono: e.telefono || '', cuando: e.cuando || '', notas: e.notas || '', servir: e.servir, pagado: e.pagado });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: 'cliente' | 'lugar' | 'telefono' | 'cuando' | 'notas') => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: ev.target.value }));
  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    try {
      const { data } = await editarEntregaCarga(e.id, {
        cliente: f.cliente.trim(), lugar: f.lugar.trim() || null, telefono: f.telefono.trim() || null,
        cuando: f.cuando.trim() || null, notas: f.notas.trim() || null, servir: f.servir, pagado: f.pagado, dudas: null,
      });
      onSaved(data);
    } catch (err) { setError(describeApiError(err)); } finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={ev => ev.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>Datos del cliente</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={guardar}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div className="doc-aviso error">{error}</div>}
            <div className="campos-2">
              <div><label className="form-label">Cliente</label><input className="form-input" value={f.cliente} onChange={set('cliente')} /></div>
              <div><label className="form-label">Pueblo u obra</label><input className="form-input" value={f.lugar} onChange={set('lugar')} /></div>
              <div><label className="form-label">Teléfono</label><input className="form-input" type="tel" value={f.telefono} onChange={set('telefono')} /></div>
              <div><label className="form-label">Cuándo</label><input className="form-input" value={f.cuando} onChange={set('cuando')} placeholder="Esta semana, el martes…" /></div>
            </div>
            <div className="carga-opciones">
              <label><input type="checkbox" checked={f.servir} onChange={ev => setF(v => ({ ...v, servir: ev.target.checked }))} /> Servir (llevar a la obra)</label>
              <label><input type="checkbox" checked={f.pagado} onChange={ev => setF(v => ({ ...v, pagado: ev.target.checked }))} /> Ya está pagado</label>
            </div>
            <div><label className="form-label">Notas</label><textarea className="form-input" rows={2} value={f.notas} onChange={set('notas')} /></div>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
    const cn = numES(c), pn = numES(parte);
    if (c.trim() && cn == null) { setError('La cantidad tiene que ser un número'); return; }
    if (parte.trim() && pn == null) { setError('Lo cargado tiene que ser un número'); return; }
    setSaving(true);
    try {
      const datos = { cantidad: cn, unidad: u.trim() || null, descripcion: d.trim() };
      if (ln) {
        const completo = pn != null && cn != null && pn >= cn;
        await editarLineaCarga(ln.id, { ...datos, duda: null, ...(parte.trim() ? { cargado: completo ? null : pn, cargado_ok: completo } : {}) });
      } else await nuevaLineaCarga(entregaId, datos);
      onSaved();
    } catch (err) { setError(describeApiError(err)); } finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={ev => ev.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>{ln ? 'Material' : 'Añadir material'}</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={guardar}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div className="doc-aviso error">{error}</div>}
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
              </div>
            )}
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            {ln && onDelete && <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}><Trash2 size={14} /> Quitar</button>}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : ln ? 'Guardar' : 'Añadir'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Firma del cliente ───────────────────────────────────────────────────────

function FirmaModal({ e, onClose, onFirmado }: { e: EntregaCarga; onClose: () => void; onFirmado: (e: EntregaCarga) => void }) {
  const pad = useRef<{ clear: () => void; toBlob: () => Promise<Blob | null>; isEmpty: () => boolean } | null>(null);
  const [tinta, setTinta] = useState(false);
  const [nombre, setNombre] = useState(e.cliente);
  const [dni, setDni] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const llevados = e.lineas.filter(l => l.cargado_ok || l.cargado);
  const faltan = e.lineas.filter(l => !l.cargado_ok);

  const firmar = async () => {
    if (!pad.current || pad.current.isEmpty()) { setError('Falta la firma'); return; }
    if (!nombre.trim()) { setError('Falta el nombre de quien firma'); return; }
    setSaving(true); setError('');
    try {
      const blob = await pad.current.toBlob();
      if (!blob) throw new Error('No se pudo leer la firma');
      const { data } = await firmarEntregaCarga(e.id, blob, nombre, dni);
      onFirmado(data);
    } catch (err) { setError(describeApiError(err)); } finally { setSaving(false); }
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
              <li key={l.id}><b>{cant(l.cargado_ok ? l.cantidad : l.cargado)} {l.unidad || ''}</b> {l.descripcion}</li>
            ))}
          </ul>
          {faltan.length > 0 && <small style={{ color: 'var(--warning)' }}>Sin cargar o a medias: {faltan.map(l => l.descripcion).join(', ')}. Saldrá como pendiente en la hoja.</small>}
        </div>
        <div className="campos-2" style={{ marginTop: 12 }}>
          <div><label className="form-label">Nombre de quien firma</label><input className="form-input" value={nombre} onChange={ev => setNombre(ev.target.value)} /></div>
          <div><label className="form-label">DNI (si quiere)</label><input className="form-input" value={dni} onChange={ev => setDni(ev.target.value)} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <SignaturePad padRef={pad} onChange={setTinta} />
        </div>
        {error && <div className="doc-aviso error" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn btn-ghost btn-lg" onClick={() => pad.current?.clear()} disabled={!tinta}><Eraser size={18} /> Borrar</button>
          <button className="btn btn-primary btn-lg" style={{ flex: 1, justifyContent: 'center' }} onClick={firmar} disabled={saving || !tinta}>
            {saving ? 'Guardando…' : <><Check size={20} /> Firmar la entrega</>}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [mas, setMas] = useState(false);

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    return verCarga(Number(id)).then(r => { setO(r.data); setError(null); }).catch(err => setError(describeApiError(err)));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const tocar = async (ln: LineaCarga) => {
    const nuevo = !ln.cargado_ok;
    setO(v => v && ({ ...v, entregas: v.entregas.map(e => ({ ...e, lineas: e.lineas.map(l => l.id === ln.id ? { ...l, cargado_ok: nuevo, cargado: null } : l) })) }));
    try { await editarLineaCarga(ln.id, { cargado_ok: nuevo, cargado: null }); load(); }
    catch (err) { show(`No se pudo guardar: ${describeApiError(err)}`, { error: true }); load(); }
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

  const pasado = async (e: EntregaCarga, si: boolean) => {
    try { await treyfactEntregaCarga(e.id, si); load(); }
    catch (err) { show(`No se pudo guardar: ${describeApiError(err)}`, { error: true }); }
  };

  if (!o) return <div className="page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>{error || 'Cargando…'}</div>;

  const ls = lineasDe(o), hechas = ls.filter(l => l.cargado_ok).length;

  return (
    <div className="page carga-detalle">
      {ConfirmDialog}
      {toast}
      <div className="pedido-head">
        <div style={{ flex: '1 1 100%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="doc-volver" onClick={() => navigate('/cargas')}><ArrowLeft size={16} /> Órdenes</button>
            <h1>Orden de carga</h1>
            <span className={`status-chip carga-${o.estado}`}>{ESTADO[o.estado]}</span>
          </div>
          <div className="pedido-sub">
            <span><Truck size={15} /> {o.entregas.length} pedido{o.entregas.length !== 1 ? 's' : ''}</span>
            <span>Cargado {hechas} de {ls.length}</span>
            <span>{fechaHora(o.created_at)}</span>
          </div>
          {ls.length > 0 && <div className="carga-barra"><span style={{ width: `${(hechas / ls.length) * 100}%` }} /></div>}
        </div>
      </div>

      {o.fotos.length > 0 && (
        <div className="carga-fotos">
          {o.fotos.map(f => (
            <button key={f} onClick={() => setFoto(f)} aria-label="Ver la hoja de la libreta">
              <img src={fotoCargaUrl(f)} alt="Hoja de la libreta" loading="lazy" />
            </button>
          ))}
          <span>Toca la foto para compararla</span>
        </div>
      )}

      {o.entregas.map(e => {
        const firmada = e.estado === 'entregada';
        const faltan = e.lineas.filter(l => !l.cargado_ok).length;
        const dudas = e.lineas.filter(l => l.duda);
        return (
          <section key={e.id} className={`card carga-entrega${firmada ? ' firmada' : ''}`}>
            <div className="carga-entrega-head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2>{e.cliente || 'Sin nombre'}</h2>
                <div className="pedido-sub" style={{ marginTop: 4 }}>
                  {e.lugar && <span>{e.lugar}</span>}
                  {e.telefono && <a href={`tel:${e.telefono.replace(/\s/g, '')}`}><Phone size={14} /> {e.telefono}</a>}
                </div>
                <div className="carga-card-chips" style={{ marginTop: 8 }}>
                  <span className="cat-chip">{e.servir ? 'Servir' : 'Recoge en tienda'}</span>
                  {e.cuando && <span className="cat-chip gris">{e.cuando}</span>}
                  {e.pagado && <span className="cat-chip">Pagado</span>}
                  {e.numero && <span className="cat-chip gris">{e.numero}</span>}
                </div>
              </div>
              {!firmada && <button className="btn btn-ghost btn-sm" onClick={() => setDatos(e)}><Pencil size={14} /> Datos</button>}
            </div>

            {e.dudas && !firmada && <div className="doc-aviso subidas" style={{ margin: '0 16px 10px' }}><AlertTriangle size={18} /><div><b>Revisa</b>{e.dudas}</div></div>}
            {dudas.length > 0 && !firmada && (
              <div className="carga-revisar">Hay {dudas.length} material{dudas.length !== 1 ? 'es' : ''} marcado{dudas.length !== 1 ? 's' : ''} para revisar. Tócalo para corregirlo.</div>
            )}
            {e.notas && <div className="carga-notas">{e.notas}</div>}

            {e.lineas.map(l => {
              const medio = !l.cargado_ok && l.cargado != null && l.cargado > 0;
              return (
                <div key={l.id} className={`pedido-linea${l.cargado_ok ? ' llego' : ''}${medio ? ' medio' : ''}${l.duda ? ' duda' : ''}`}>
                  <button className="pedido-check" onClick={() => tocar(l)} disabled={firmada}
                    aria-pressed={l.cargado_ok} aria-label={l.cargado_ok ? `${l.descripcion}: cargado. Toca para desmarcar` : `Marcar ${l.descripcion} como cargado`}>
                    {l.cargado_ok ? <Check size={22} strokeWidth={3} /> : medio ? '◑' : null}
                  </button>
                  <button className="pedido-linea-txt" onClick={() => !firmada && setLinea({ entregaId: e.id, ln: l })} disabled={firmada}>
                    <b><span className="carga-cant">{cant(l.cantidad)} {l.unidad || ''}</span> {l.descripcion}</b>
                    {medio && <small>Cargado solo {cant(l.cargado)}</small>}
                    {l.duda && <small className="carga-duda"><AlertTriangle size={13} /> {l.duda}</small>}
                  </button>
                </div>
              );
            })}
            {!firmada && (
              <button className="carga-anadir" onClick={() => setLinea({ entregaId: e.id, ln: null })}><Plus size={16} /> Añadir material</button>
            )}

            <div className="carga-entrega-pie">
              {firmada ? (
                <>
                  <span className="rep-hecha">✓ Firmado por {e.firmado_por} · {fechaHora(e.firmado_at)}</span>
                  <a className="btn btn-primary" href={hojaEntregaUrl(e.id)} target="_blank" rel="noopener noreferrer"><FileText size={17} /> Hoja de entrega</a>
                  <label className="carga-treyfact">
                    <input type="checkbox" checked={!!e.treyfact_at} onChange={ev => pasado(e, ev.target.checked)} /> Pasado a TreyFACT
                  </label>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-3)' }} onClick={() => repetirFirma(e)}>Repetir la firma</button>
                </>
              ) : (
                <>
                  {faltan > 0 && e.lineas.length > 0 && <span className="pedido-pista">Faltan {faltan} por cargar.</span>}
                  <button className={`btn btn-lg ${faltan === 0 && e.lineas.length > 0 ? 'btn-primary' : 'btn-ghost'}`} disabled={e.lineas.length === 0} onClick={() => setFirmando(e)}>
                    <PenLine size={18} /> Firma del cliente
                  </button>
                  <a className="btn btn-ghost btn-sm" href={hojaEntregaUrl(e.id)} target="_blank" rel="noopener noreferrer"><FileText size={15} /> Ver la hoja</a>
                  {o.entregas.length > 1 && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => quitarEntrega(e)}><Trash2 size={14} /> Quitar pedido</button>}
                </>
              )}
            </div>
          </section>
        );
      })}

      <div className="card seccion" style={{ marginTop: 14 }}>
        <div className="seccion-titulo">¿Va algo más en este viaje?</div>
        <NuevaOrden compacto ordenId={o.id} onHecho={d => { setO(d); show('Pedido añadido al viaje'); }} />
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={async () => { try { setO((await nuevaEntregaCarga(o.id)).data); } catch (err) { show(describeApiError(err), { error: true }); } }}>
          <Plus size={15} /> Pedido en blanco para rellenar a mano
        </button>
      </div>

      <details className="mas-opciones pedido-mas" style={{ marginTop: 16 }} open={mas} onToggle={ev => setMas((ev.target as HTMLDetailsElement).open)}>
        <summary>Más opciones</summary>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={borrarOrden}><Trash2 size={15} /> Borrar la orden de carga</button>
        </div>
      </details>

      {foto && (
        <div className="carga-foto-grande" onClick={() => setFoto(null)} role="dialog" aria-label="Hoja de la libreta">
          <button className="modal-close" aria-label="Cerrar">✕</button>
          <img src={fotoCargaUrl(foto)} alt="Hoja de la libreta" onClick={ev => ev.stopPropagation()} />
        </div>
      )}
      {datos && <DatosModal e={datos} onClose={() => setDatos(null)} onSaved={() => { setDatos(null); load(); }} />}
      {linea && <LineaModal entregaId={linea.entregaId} ln={linea.ln} onClose={() => setLinea(null)}
        onSaved={() => { setLinea(null); load(); }} onDelete={linea.ln ? () => quitarLinea(linea.ln!) : undefined} />}
      {firmando && <FirmaModal e={firmando} onClose={() => setFirmando(null)}
        onFirmado={() => { setFirmando(null); load(); show('Entrega firmada'); }} />}
    </div>
  );
}
