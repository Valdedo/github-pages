import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Upload, Search, PenLine, ChevronRight, FileDown, Mail, MessageCircle, HandHelping, Receipt, Check, X, Truck,
} from 'lucide-react';
import { listFirmas, uploadFirmas, firmasCombinadoUrl, marcarFirmas, repartoFirmas, describeApiError } from '../api/client';
import { FirmasAvisos } from '../components/FirmasAvisos';
import { useCfToast } from '../components/CfToast';
import { ConnectionError } from '../components/ConnectionError';
import { Vacio } from '../components/Pegatinas';
import type { ClientDeliveryNote } from '../types';

type Vista = 'firmar' | 'facturar' | 'facturados' | 'todos';
type Envio = '' | 'sin' | 'correo' | 'whatsapp' | 'copia';

const VISTAS: { value: Vista; label: string }[] = [
  { value: 'firmar', label: 'Por firmar' },
  { value: 'facturar', label: 'Por facturar' },
  { value: 'facturados', label: 'Facturados' },
  { value: 'todos', label: 'Todos' },
];

export function fmtFecha(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

export function fmtFirmado(iso?: string | null): string {
  if (!iso) return '';
  const [date, time] = iso.split('T');
  return `${fmtFecha(date)} a las ${(time || '').slice(0, 5)}`;
}

export const fmtEuros = (v?: number | null) =>
  v == null ? '' : v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

const enviado = (n: ClientDeliveryNote) => !!(n.emailed_at || n.whatsapp_at || n.copia_at);

/** Las cinco marcas de seguimiento: en color si está hecho, en gris si no.
 *  Sin firmar solo se enseña lo que ya está hecho (lo demás aún no aplica).
 *  `sinEstado`: sin la marca «Firmado / Sin firmar» (cuando la pantalla ya lo dice). */
export function Marcas({ n, sinEstado }: { n: ClientDeliveryNote; sinEstado?: boolean }) {
  const firmado = n.status === 'firmado';
  const todas = [
    { on: n.status === 'firmado', label: n.status === 'firmado' ? 'Firmado' : 'Sin firmar', icon: PenLine, cls: 'firmado' },
    { on: !!n.emailed_at, label: 'Correo', icon: Mail, cls: 'correo' },
    { on: !!n.whatsapp_at, label: 'WhatsApp', icon: MessageCircle, cls: 'whatsapp' },
    { on: !!n.copia_at, label: 'Copia', icon: HandHelping, cls: 'copia' },
    { on: !!n.facturado_at, label: n.factura_ref ? `Facturado ${n.factura_ref}` : 'Facturado', icon: Receipt, cls: 'facturado' },
  ];
  const items = todas.filter(m => (m.cls === 'firmado' ? !sinEstado : firmado || m.on));
  if (!items.length) return null;
  return (
    <div className="marcas">
      {items.map(({ on, label, icon: Icon, cls }) => (
        <span key={cls} className={`marca ${on ? `on ${cls}` : ''}`} title={on ? label : `${label}: no`}>
          {on ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />} {label}
        </span>
      ))}
    </div>
  );
}

function NoteRow({ n, selectable, selected, onToggle, onOpen, onCamion, camionOcupado }: {
  n: ClientDeliveryNote; selectable: boolean; selected: boolean;
  onToggle: () => void; onOpen: () => void; onCamion?: () => void; camionOcupado?: boolean;
}) {
  return (
    <div className={`card firma-card${selected ? ' selected' : ''}`} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      {selectable && (
        <input type="checkbox" className="firma-check" checked={selected} aria-label={`Seleccionar ${n.numero}`}
          onClick={e => e.stopPropagation()} onChange={onToggle} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{n.numero}</span>
          <span style={{ fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 160px', minWidth: 0 }}>
            {n.cliente || 'Cliente sin identificar'}
            {n.obra && <span style={{ color: 'var(--text-3)' }}> · {n.obra}</span>}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtFecha(n.fecha)}</span>
          {n.importe != null && <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtEuros(n.importe)}</span>}
        </div>
        <Marcas n={n} />
        {n.nota && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--warning)' }}>{n.nota}</div>}
      </div>
      {onCamion && (
        <button className={`camion-btn${n.reparto_at ? ' on' : ''}`} disabled={camionOcupado} aria-busy={camionOcupado}
          onClick={e => { e.stopPropagation(); if (!camionOcupado) onCamion(); }}
          title={n.reparto_at ? 'Sacar del camión de reparto' : 'Mandar al camión de reparto'}
          aria-label={n.reparto_at ? `Sacar ${n.numero} del camión` : `Mandar ${n.numero} al camión`}>
          <Truck size={17} /> <span>{n.reparto_at ? 'En el camión' : 'Al camión'}</span>
        </button>
      )}
      <ChevronRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </div>
  );
}

/** En el ordenador se puede arrastrar; en el móvil, no. */
const conRaton = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

export function FirmasPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<ClientDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [vista, setVista] = useState<Vista>(() => {
    const v = params.get('vista') as Vista | null;
    if (v && VISTAS.some(x => x.value === v)) return v;
    try { return (sessionStorage.getItem('firmasVista') as Vista) || 'firmar'; } catch { return 'firmar'; }
  });
  const [envio, setEnvio] = useState<Envio>('');
  const [search, setSearch] = useState('');
  const [cliente, setCliente] = useState(() => params.get('cliente') || '');
  const [mes, setMes] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [camionOcupado, setCamionOcupado] = useState<Set<number>>(new Set());
  const { toast, show } = useCfToast();
  const raton = conRaton();

  const cambiarVista = (v: Vista) => {
    setVista(v); setSel(new Set());
    try { sessionStorage.setItem('firmasVista', v); } catch { /* nada */ }
  };
  const quitarFiltros = () => { setSearch(''); setCliente(''); setMes(''); setEnvio(''); setSel(new Set()); };

  // Los avisos enlazan a /firmas?vista=…&cliente=…: se aplica aunque ya se esté en Firmas
  useEffect(() => {
    const v = params.get('vista') as Vista | null;
    const cl = params.get('cliente');
    if (!v && !cl) return;
    if (v && VISTAS.some(x => x.value === v)) cambiarVista(v);
    setCliente(cl || ''); setSearch(''); setMes(''); setEnvio(''); setSel(new Set());
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    setLoadError(null);
    listFirmas()
      .then(({ data }) => setNotes(data))
      .catch(err => { if (!quiet) setLoadError(describeApiError(err)); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  // Refresco cada 30 s: lo que se firma en otro dispositivo aparece solo
  useEffect(() => {
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [load]);

  const clientes = useMemo(() => {
    const seen = new Map<string, string>();
    notes.forEach(n => { if (n.codigo_cliente && !seen.has(n.codigo_cliente)) seen.set(n.codigo_cliente, n.cliente || n.codigo_cliente); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [notes]);

  const enLaVista = (v: Vista, n: ClientDeliveryNote) =>
    v === 'firmar' ? n.status === 'pendiente'
    : v === 'facturar' ? n.status === 'firmado' && !n.facturado_at
    : v === 'facturados' ? !!n.facturado_at
    : true;
  const count: Record<Vista, number> = {
    firmar: notes.filter(n => enLaVista('firmar', n)).length,
    facturar: notes.filter(n => enLaVista('facturar', n)).length,
    facturados: notes.filter(n => enLaVista('facturados', n)).length,
    todos: notes.length,
  };
  const hayFiltros = !!(search.trim() || cliente || mes || envio);

  const q = search.trim().toLowerCase();
  const filtered = notes.filter(n => {
    if (!enLaVista(vista, n)) return false;
    if (envio === 'sin' && enviado(n)) return false;
    if (envio === 'correo' && !n.emailed_at) return false;
    if (envio === 'whatsapp' && !n.whatsapp_at) return false;
    if (envio === 'copia' && !n.copia_at) return false;
    if (cliente && n.codigo_cliente !== cliente) return false;
    if (mes && !(n.fecha || '').startsWith(mes)) return false;
    if (q && !`${n.numero} ${n.cliente ?? ''} ${n.codigo_cliente ?? ''} ${n.obra ?? ''} ${n.factura_ref ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // En «Por facturar» se agrupa por empresa
  const grupos = useMemo(() => {
    if (vista !== 'facturar') return [];
    const m = new Map<string, ClientDeliveryNote[]>();
    filtered.forEach(n => {
      const k = n.codigo_cliente || '—';
      m.set(k, [...(m.get(k) || []), n]);
    });
    return [...m.entries()]
      .map(([cod, list]) => ({ cod, nombre: list[0].cliente || 'Cliente sin identificar', list }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [vista, filtered]);

  const selectable = vista !== 'firmar';
  const firmadosFiltro = filtered.filter(n => n.status === 'firmado');
  const toggle = (id: number) => setSel(s => { const c = new Set(s); if (c.has(id)) c.delete(id); else c.add(id); return c; });
  const selNotes = notes.filter(n => sel.has(n.id));
  const selTotal = selNotes.reduce((s, n) => s + (n.importe ?? 0), 0);

  const applyUpdated = (updated: ClientDeliveryNote[]) => {
    const byId = new Map(updated.map(u => [u.id, u]));
    setNotes(prev => prev.map(n => byId.get(n.id) ?? n));
    setSel(new Set());
  };

  const quien = (list: ClientDeliveryNote[]) => {
    const cl = [...new Set(list.map(n => n.cliente || n.codigo_cliente || ''))].filter(Boolean);
    return cl.length === 1 ? ` de ${cl[0]}` : '';
  };

  // Se marca al momento y se ofrece «Deshacer» (sin preguntar «¿seguro?»)
  const marcarFacturados = async (list: ClientDeliveryNote[], facturado: boolean) => {
    // Solo se factura lo firmado y aún sin facturar; solo se quita lo que está facturado
    const validos = list.filter(n => facturado ? n.status === 'firmado' && !n.facturado_at : !!n.facturado_at);
    const sinFirmar = facturado ? list.filter(n => n.status !== 'firmado').length : 0;
    const ids = validos.map(n => n.id);
    if (!ids.length) {
      show(sinFirmar ? `${sinFirmar === 1 ? 'El albarán seleccionado está' : 'Los seleccionados están'} sin firmar: no se puede${sinFirmar !== 1 ? 'n' : ''} marcar como facturado${sinFirmar !== 1 ? 's' : ''}` : 'No hay nada que cambiar en lo seleccionado', { error: true });
      return;
    }
    try {
      const { data } = await marcarFirmas(ids, { facturado });
      applyUpdated(data);
      const n = ids.length;
      const aviso = sinFirmar ? `. ${sinFirmar} sin firmar no se ${sinFirmar !== 1 ? 'han' : 'ha'} marcado` : '';
      show(`${n} ${n !== 1 ? 'albaranes' : 'albarán'}${quien(validos)} ${facturado ? `marcado${n !== 1 ? 's' : ''} como facturado${n !== 1 ? 's' : ''}` : `vuelve${n !== 1 ? 'n' : ''} a «Por facturar»`}${aviso}`, {
        undo: async () => {
          const { data: back } = await marcarFirmas(ids, { facturado: !facturado });
          applyUpdated(back);
        },
      });
    } catch (err) {
      show(`No se pudo guardar: ${describeApiError(err)}`, { error: true });
    }
  };
  const quitarFacturado = () => marcarFacturados(selNotes, false);

  const onFiles = async (list: FileList | null) => {
    const todos = Array.from(list || []);
    const esPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    const files = todos.filter(esPdf);
    const noPdf = todos.filter(f => !esPdf(f)).map(f => `${f.name} (no es un PDF)`);
    if (!files.length) {
      if (todos.length) setUploadMsg({ text: `Solo se pueden subir archivos PDF. No se pudo: ${noPdf.join(', ')}`, error: true });
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    try {
      const { data, rechazados } = await uploadFirmas(files);
      const pend = data.filter(d => d.status === 'pendiente');
      const yaFirmados = data.filter(d => d.status === 'firmado');
      const partes: string[] = [];
      if (pend.length) partes.push(pend.length === 1 ? `Albarán ${pend[0].numero} listo para firmar` : `Subidos ${pend.length}: listos para firmar`);
      if (yaFirmados.length) partes.push(yaFirmados.length === 1
        ? `El ${yaFirmados[0].numero} ya estaba subido y firmado`
        : `${yaFirmados.length} ya estaban subidos y firmados`);
      const fallos = [...rechazados.map(r => `${r.nombre} (${(r.motivo || 'no vale').replace(/^./, ch => ch.toLowerCase())})`), ...noPdf];
      if (fallos.length) partes.push(`No se pudo: ${fallos.join(', ')}`);
      setUploadMsg({ text: partes.join('. '), error: !data.length });
      if (data.length) {
        cambiarVista(pend.length ? 'firmar' : 'todos');
        if (pend.length) quitarFiltros();
      }
      load(true);
    } catch (err) {
      setUploadMsg({ text: `No se pudo subir: ${describeApiError(err)}`, error: true });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Meter o sacar del camión (bloqueado mientras se guarda, para que un doble toque no lo deshaga)
  const camion = async (n: ClientDeliveryNote) => {
    if (camionOcupado.has(n.id)) return;
    const en = !n.reparto_at;
    const ocupar = (on: boolean) => setCamionOcupado(s => { const c = new Set(s); if (on) c.add(n.id); else c.delete(n.id); return c; });
    ocupar(true);
    try {
      const { data } = await repartoFirmas([n.id], en);
      applyUpdated(data);
      show(en ? `${n.numero} va en el camión. Al repartidor le llegará un aviso` : `${n.numero} sale del camión`, {
        undo: async () => { const { data: d } = await repartoFirmas([n.id], !en); applyUpdated(d); },
      });
    } catch (err) { show(describeApiError(err), { error: true }); }
    finally { ocupar(false); }
  };
  const enCamion = notes.filter(n => n.status === 'pendiente' && n.reparto_at).length;

  const row = (n: ClientDeliveryNote) => (
    <NoteRow key={n.id} n={n} selectable={selectable} selected={sel.has(n.id)}
      onToggle={() => toggle(n.id)} onOpen={() => navigate(`/firmas/${n.id}`)}
      onCamion={n.status === 'pendiente' ? () => camion(n) : undefined} camionOcupado={camionOcupado.has(n.id)} />
  );

  return (
    <div className="page firmas-page"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
      {loadError && <ConnectionError message={loadError} onRetry={() => load()} />}

      <div className="inicio-head firmas-head">
        <div>
          <h1>Firmar albaranes</h1>
          <p>{raton ? 'Arrastra aquí los PDF de treyFACT o pulsa el botón.' : 'Sube aquí los PDF de treyFACT.'}</p>
        </div>
        <button className="btn btn-primary btn-lg" disabled={uploading}
          onClick={() => { if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); } }}>
          <Upload size={19} /> {uploading ? 'Subiendo…' : 'Subir albaranes'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" multiple hidden
          onChange={e => onFiles(e.target.files)} />
      </div>

      <div className="firmas-avisos"><FirmasAvisos /></div>

      {uploadMsg && (
        <div className={`firmas-msg${uploadMsg.error ? ' error' : ''}`} role={uploadMsg.error ? 'alert' : 'status'}>
          <span>{uploadMsg.text}</span>
          <button className="firmas-msg-x" onClick={() => setUploadMsg(null)} aria-label="Cerrar el aviso"><X size={16} /></button>
        </div>
      )}

      <div className="firma-vistas" role="tablist" aria-label="Qué albaranes ver">
        {VISTAS.map(v => (
          <button key={v.value} role="tab" aria-selected={vista === v.value} onClick={() => cambiarVista(v.value)}
            className={`firma-vista${vista === v.value ? ' on' : ''}`}>
            {v.label}
            <span className="firma-vista-n">{count[v.value]}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0 16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="form-input" placeholder="Buscar nº, cliente, obra o factura…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 42, margin: 0, borderRadius: 999 }} />
        </div>
        <select className="form-input" value={cliente} onChange={e => { setCliente(e.target.value); setSel(new Set()); }}
          style={{ margin: 0, flex: '1 1 180px', maxWidth: 260 }} aria-label="Cliente">
          <option value="">Todos los clientes</option>
          {clientes.map(([cod, nom]) => <option key={cod} value={cod}>{nom} ({cod})</option>)}
        </select>
        <select className="form-input" value={envio} onChange={e => setEnvio(e.target.value as Envio)}
          style={{ margin: 0, flex: '0 1 190px' }} aria-label="Envío">
          <option value="">Cualquier envío</option>
          <option value="sin">Sin enviar ni entregar</option>
          <option value="correo">Enviados por correo</option>
          <option value="whatsapp">Enviados por WhatsApp</option>
          <option value="copia">Copia entregada</option>
        </select>
        <label className="firmas-mes">
          <span>Mes</span>
          <input className="form-input" type="month" value={mes} onChange={e => setMes(e.target.value)} />
        </label>
        {hayFiltros && (
          <button className="btn btn-ghost btn-sm" onClick={quitarFiltros}><X size={14} /> Quitar filtros</button>
        )}
      </div>

      {selectable && filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 13 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set(filtered.map(n => n.id)))}>
            Seleccionar todos ({filtered.length})
          </button>
          {sel.size > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>Quitar selección</button>}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : loadError ? null : filtered.length === 0 && notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><PenLine size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">
            {raton
              ? 'Exporta el albarán en PDF desde treyFACT y súbelo aquí (o arrástralo a esta pantalla).'
              : 'Exporta el albarán en PDF desde treyFACT y súbelo con el botón «Subir albaranes».'}
          </div>
        </div>
      ) : filtered.length === 0 && count[vista] > 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Search size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">Ningún albarán coincide con la búsqueda o los filtros.</div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={quitarFiltros}><X size={15} /> Quitar filtros</button>
        </div>
      ) : filtered.length === 0 && vista === 'firmar' ? (
        <Vacio dibujo="albaranOk" titulo="Todo firmado" texto="No queda ningún albarán pendiente de firmar." />
      ) : filtered.length === 0 && vista === 'facturar' ? (
        <Vacio dibujo="facturaOk" titulo="Nada por facturar" texto="Todos los albaranes firmados están ya facturados." />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Receipt size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">Todavía no hay albaranes facturados.</div>
        </div>
      ) : vista === 'facturar' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grupos.map(g => {
            const total = g.list.reduce((s, n) => s + (n.importe ?? 0), 0);
            return (
              <section key={g.cod} className="card firma-empresa">
                <div className="firma-grupo">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{g.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {g.cod !== '—' && <>Cód. {g.cod} · </>}{g.list.length} {g.list.length !== 1 ? 'albaranes' : 'albarán'}
                      {total > 0 && <> · <strong style={{ color: 'var(--text-1)' }}>{fmtEuros(total)}</strong></>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <a className="btn btn-ghost btn-sm" href={firmasCombinadoUrl(g.list.map(n => n.id))}
                      title="Un solo PDF con todos estos albaranes, para adjuntar a la factura">
                      <FileDown size={14} /> PDF
                    </a>
                    <button className="btn btn-primary" onClick={() => marcarFacturados(g.list, true)}>
                      <Receipt size={16} /> Marcar {g.list.length === 1 ? 'como facturado' : `los ${g.list.length} como facturados`}
                    </button>
                  </div>
                </div>
                <div className="firma-lista cf-enter">{g.list.map(row)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          {vista === 'firmar' && filtered.length > 0 && (
            <p className="camion-resumen"><Truck size={16} /> {enCamion
              ? <>En el camión de reparto: <b>{enCamion}</b>. Se ven en el móvil de reparto y se pueden firmar en la obra.</>
              : <>Pulsa «Al camión» en los que salen a reparto: al repartidor le llega un aviso y solo verá esos.</>}</p>
          )}
          <div className="firma-lista cf-enter">{filtered.map(row)}</div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
        {vista !== 'firmar' && firmadosFiltro.length > 0 && (
          <a className="btn btn-ghost btn-largo" href={firmasCombinadoUrl(firmadosFiltro.map(n => n.id))}>
            <FileDown size={15} /> Descargar en un PDF los {firmadosFiltro.length} firmados de esta lista
          </a>
        )}
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--text-3)' }}
          onClick={() => { if (window.confirm('¿Activar el modo reparto en este dispositivo? Es la vista sencilla para el camionero.')) navigate('/reparto'); }}>
          <Truck size={14} /> Modo reparto en este dispositivo
        </button>
      </div>

      {sel.size > 0 && (
        <div className="firma-selbar">
          <span><strong>{sel.size}</strong> seleccionado{sel.size !== 1 ? 's' : ''}{selTotal > 0 && <> · {fmtEuros(selTotal)}</>}</span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {selNotes.some(n => !n.facturado_at) && (
              <button className="btn btn-primary btn-sm" onClick={() => marcarFacturados(selNotes.filter(n => !n.facturado_at), true)}>
                <Receipt size={14} /> Marcar facturados
              </button>
            )}
            {selNotes.some(n => n.status === 'firmado') && (
              <a className="btn btn-ghost btn-sm" href={firmasCombinadoUrl(selNotes.filter(n => n.status === 'firmado').map(n => n.id))}>
                <FileDown size={14} /> PDF
              </a>
            )}
            {selNotes.some(n => n.facturado_at) && (
              <button className="btn btn-ghost btn-sm" onClick={quitarFacturado}>
                Quitar facturado{selNotes.filter(n => n.facturado_at).length !== sel.size ? ` (${selNotes.filter(n => n.facturado_at).length})` : ''}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())} aria-label="Cancelar"><X size={14} /></button>
          </div>
        </div>
      )}

      {toast}
    </div>
  );
}
