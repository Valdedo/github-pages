import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, Search, PenLine, ChevronRight, Download, Mail, MessageCircle, HandHelping, Receipt, Check, X,
} from 'lucide-react';
import { listFirmas, uploadFirmas, firmasZipUrl, marcarFirmas, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
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

/** Las cinco marcas de seguimiento: en color si está hecho, en gris si no. */
export function Marcas({ n }: { n: ClientDeliveryNote }) {
  const items = [
    { on: n.status === 'firmado', label: n.status === 'firmado' ? 'Firmado' : 'Sin firmar', icon: PenLine, cls: 'firmado' },
    { on: !!n.emailed_at, label: 'Correo', icon: Mail, cls: 'correo' },
    { on: !!n.whatsapp_at, label: 'WhatsApp', icon: MessageCircle, cls: 'whatsapp' },
    { on: !!n.copia_at, label: 'Copia', icon: HandHelping, cls: 'copia' },
    { on: !!n.facturado_at, label: n.factura_ref ? `Facturado ${n.factura_ref}` : 'Facturado', icon: Receipt, cls: 'facturado' },
  ];
  return (
    <div className="marcas">
      {items.map(({ on, label, icon: Icon, cls }) => (
        <span key={cls} className={`marca ${on ? `on ${cls}` : ''}`} title={on ? label : `${label}: no`}>
          <Icon size={12} /> {label}
        </span>
      ))}
    </div>
  );
}

function NoteRow({ n, selectable, selected, onToggle, onOpen }: {
  n: ClientDeliveryNote; selectable: boolean; selected: boolean;
  onToggle: () => void; onOpen: () => void;
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
      <ChevronRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </div>
  );
}

/** Ventana para marcar como facturados, con nº de factura opcional. */
function FacturarModal({ notes, onClose, onDone }: {
  notes: ClientDeliveryNote[]; onClose: () => void; onDone: (n: ClientDeliveryNote[]) => void;
}) {
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = notes.reduce((s, n) => s + (n.importe ?? 0), 0);
  const clientes = [...new Set(notes.map(n => n.cliente || n.codigo_cliente || 'Sin cliente'))];
  const ok = async () => {
    setSaving(true); setError(null);
    try {
      const { data } = await marcarFirmas(notes.map(n => n.id), { facturado: true, factura_ref: ref });
      onDone(data);
    } catch (err) { setError(describeApiError(err)); setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 420, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700 }}>Marcar como facturados</h3>
        <p style={{ fontSize: 14, color: 'var(--text-2)' }}>
          {notes.length} albarán{notes.length !== 1 ? 'es' : ''} de {clientes.join(', ')}
          {total > 0 && <> · <strong>{fmtEuros(total)}</strong></>}
        </p>
        <label className="form-label">Nº de factura (opcional)
          <input className="form-input" value={ref} onChange={e => setRef(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') ok(); }} />
        </label>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={ok} disabled={saving}>
            <Check size={15} /> {saving ? 'Guardando…' : 'Marcar facturados'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FirmasPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<ClientDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [vista, setVista] = useState<Vista>(() => {
    try { return (sessionStorage.getItem('firmasVista') as Vista) || 'firmar'; } catch { return 'firmar'; }
  });
  const [envio, setEnvio] = useState<Envio>('');
  const [search, setSearch] = useState('');
  const [cliente, setCliente] = useState('');
  const [mes, setMes] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [facturar, setFacturar] = useState<ClientDeliveryNote[] | null>(null);

  const cambiarVista = (v: Vista) => {
    setVista(v); setSel(new Set());
    try { sessionStorage.setItem('firmasVista', v); } catch { /* nada */ }
  };

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

  const count = {
    firmar: notes.filter(n => n.status === 'pendiente').length,
    facturar: notes.filter(n => n.status === 'firmado' && !n.facturado_at).length,
  };

  const q = search.trim().toLowerCase();
  const filtered = notes.filter(n => {
    if (vista === 'firmar' && n.status !== 'pendiente') return false;
    if (vista === 'facturar' && (n.status !== 'firmado' || n.facturado_at)) return false;
    if (vista === 'facturados' && !n.facturado_at) return false;
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
  const toggle = (id: number) => setSel(s => { const c = new Set(s); if (c.has(id)) c.delete(id); else c.add(id); return c; });
  const selNotes = notes.filter(n => sel.has(n.id));
  const selTotal = selNotes.reduce((s, n) => s + (n.importe ?? 0), 0);

  const applyUpdated = (updated: ClientDeliveryNote[]) => {
    const byId = new Map(updated.map(u => [u.id, u]));
    setNotes(prev => prev.map(n => byId.get(n.id) ?? n));
    setSel(new Set());
  };

  const quitarFacturado = async () => {
    if (!window.confirm(`¿Quitar la marca de facturado a ${selNotes.length} albarán(es)?`)) return;
    const { data } = await marcarFirmas([...sel], { facturado: false });
    applyUpdated(data);
  };

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list || []).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!files.length) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const { data } = await uploadFirmas(files);
      setUploadMsg(data.length === 1
        ? `Albarán ${data[0].numero} listo para firmar`
        : `${data.length} albaranes listos para firmar`);
      cambiarVista('firmar');
      load(true);
    } catch (err) {
      setUploadMsg(`No se pudo subir: ${describeApiError(err)}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const row = (n: ClientDeliveryNote) => (
    <NoteRow key={n.id} n={n} selectable={selectable} selected={sel.has(n.id)}
      onToggle={() => toggle(n.id)} onOpen={() => navigate(`/firmas/${n.id}`)} />
  );

  return (
    <div className="page"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
      {loadError && <ConnectionError message={loadError} onRetry={() => load()} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>Firmas de albaranes</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {count.firmar} por firmar · {count.facturar} por facturar
          </p>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={uploading}
          onClick={() => fileRef.current?.click()}>
          <Upload size={15} /> {uploading ? 'Subiendo…' : 'Subir albaranes'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" multiple hidden
          onChange={e => onFiles(e.target.files)} />
      </div>

      {uploadMsg && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>{uploadMsg}</div>
      )}

      <div className="firma-vistas">
        {VISTAS.map(v => (
          <button key={v.value} onClick={() => cambiarVista(v.value)}
            className={`btn ${vista === v.value ? 'btn-primary' : 'btn-ghost'}`}>
            {v.label}
            {(v.value === 'firmar' || v.value === 'facturar') && count[v.value] > 0 && (
              <span className="firma-vista-n">{count[v.value]}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0 16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="form-input" placeholder="Buscar nº, cliente, obra o factura…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, margin: 0 }} />
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
        <input className="form-input" type="month" value={mes} onChange={e => setMes(e.target.value)}
          style={{ margin: 0, width: 160 }} aria-label="Mes" />
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
      ) : loadError ? null : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><PenLine size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">
            {notes.length === 0
              ? 'Exporta el albarán en PDF desde treyFACT y súbelo aquí (o arrástralo a esta pantalla).'
              : vista === 'firmar' ? 'No hay albaranes por firmar.'
              : vista === 'facturar' ? 'No hay albaranes pendientes de facturar.'
              : 'Ningún albarán coincide con el filtro.'}
          </div>
        </div>
      ) : vista === 'facturar' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grupos.map(g => {
            const total = g.list.reduce((s, n) => s + (n.importe ?? 0), 0);
            return (
              <section key={g.cod}>
                <div className="firma-grupo">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{g.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {g.cod !== '—' && <>Cód. {g.cod} · </>}{g.list.length} albarán{g.list.length !== 1 ? 'es' : ''}
                      {total > 0 && <> · <strong style={{ color: 'var(--text-1)' }}>{fmtEuros(total)}</strong></>}
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => setFacturar(g.list)}>
                    <Receipt size={14} /> Facturar los {g.list.length}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{g.list.map(row)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{filtered.map(row)}</div>
      )}

      {vista !== 'firmar' && notes.some(n => n.status === 'firmado') && (
        <div style={{ marginTop: 20 }}>
          <a className="btn btn-ghost" href={firmasZipUrl(cliente, mes)}>
            <Download size={15} /> Descargar firmados {cliente ? 'de este cliente' : ''}{mes ? ' de este mes' : ''} (ZIP)
          </a>
        </div>
      )}

      {sel.size > 0 && (
        <div className="firma-selbar">
          <span><strong>{sel.size}</strong> seleccionado{sel.size !== 1 ? 's' : ''}{selTotal > 0 && <> · {fmtEuros(selTotal)}</>}</span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {selNotes.some(n => !n.facturado_at) && (
              <button className="btn btn-primary btn-sm" onClick={() => setFacturar(selNotes.filter(n => !n.facturado_at && n.status === 'firmado'))}>
                <Receipt size={14} /> Marcar facturados
              </button>
            )}
            {selNotes.some(n => n.facturado_at) && (
              <button className="btn btn-ghost btn-sm" onClick={quitarFacturado}>Quitar facturado</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())} aria-label="Cancelar"><X size={14} /></button>
          </div>
        </div>
      )}

      {facturar && facturar.length > 0 && (
        <FacturarModal notes={facturar} onClose={() => setFacturar(null)}
          onDone={d => { applyUpdated(d); setFacturar(null); }} />
      )}
    </div>
  );
}
