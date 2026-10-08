import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ShoppingCart, Search, ChevronRight, Package, Phone, CheckCheck, X } from 'lucide-react';
import { leerImporte, leerCantidad } from '../components/AvisoCliente';
import { listOrders, createOrder, getOrder, listSuppliers, describeApiError } from '../api/client';
import { useCfToast } from '../components/CfToast';
import { ConnectionError } from '../components/ConnectionError';
import { Vacio } from '../components/Pegatinas';
import { PEDIDO_ESTADO } from '../lib/estados';
import { coincide, fechaES } from '../lib/texto';
import { mensajeError } from '../lib/descargas';
import type { SupplierOrderListItem, Supplier, OrderStatus } from '../types';

// Status flow: pendiente → pedido → recibido → entregado
// entregado + cancelado are "done" → go to history
const ACTIVE_STATUSES: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: PEDIDO_ESTADO.pendiente },
  { value: 'pedido', label: PEDIDO_ESTADO.pedido },
  { value: 'recibido', label: PEDIDO_ESTADO.recibido },
];

function StatusChip({ status }: { status: OrderStatus }) {
  return <span className={`status-chip ${status}`}>{PEDIDO_ESTADO[status] ?? status}</span>;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface NewOrderForm {
  client_name: string;
  client_phone: string;
  supplier_name: string;
  supplier_id: string;
  order_date: string;
  expected_date: string;
  reference: string;
  notes: string;
  lines: { descripcion: string; cantidad: string; precio_unitario: string }[];
}

function NewOrderModal({ proveedores, suppliers, onClose, onSaved }: {
  proveedores: string[];
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: (client: string) => void;
}) {
  const [form, setForm] = useState<NewOrderForm>({
    client_name: '', client_phone: '',
    supplier_name: '', supplier_id: '',
    order_date: today(), expected_date: '',
    reference: '', notes: '',
    lines: [{ descripcion: '', cantidad: '1', precio_unitario: '' }],
  });
  const [saving, setSaving] = useState(false);
  const [error, setErrorRaw] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const setError = (m: string) => { setErrorRaw(m); if (m) requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };

  // Escape cierra; en el ordenador, tocar fuera también
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const setField = (k: keyof NewOrderForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const setLine = (i: number, k: keyof typeof form.lines[0]) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => { const lines = [...f.lines]; lines[i] = { ...lines[i], [k]: e.target.value }; return { ...f, lines }; });
  };

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { descripcion: '', cantidad: '1', precio_unitario: '' }] }));
  const removeLine = (i: number) => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name.trim()) { setError('Falta el nombre del cliente'); return; }
    const validLines = form.lines.filter(l => l.descripcion.trim());
    if (validLines.length === 0) { setError('Añade al menos un artículo'); return; }
    // Cada línea: cantidad > 0 y precio (si se pone) de 0 o más. Nada se cambia sin avisar.
    const fallos: string[] = [];
    const lineas = validLines.map((l, i) => {
      const c = leerCantidad(l.cantidad);
      const p = leerImporte(l.precio_unitario);
      const nombre = `«${l.descripcion.trim().slice(0, 30)}»`;
      if (!c.ok) fallos.push(`${nombre}: ${c.error}`);
      if (!p.ok) fallos.push(`${nombre}: precio — ${p.error.charAt(0).toLowerCase()}${p.error.slice(1)}`);
      return { descripcion: l.descripcion.trim(), cantidad: c.ok ? c.n : 0, precio_unitario: p.ok ? p.n ?? undefined : undefined, i };
    });
    if (fallos.length) { setError(fallos.join(' · ')); return; }
    if (form.expected_date && form.order_date && form.expected_date < form.order_date) {
      setError('La llegada prevista no puede ser antes de la fecha del pedido'); return;
    }
    const prov = form.supplier_name.trim();
    const sup = suppliers.find(x => x.name.trim().toLowerCase() === prov.toLowerCase());
    setSaving(true);
    setError('');
    try {
      await createOrder({
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim() || undefined,
        supplier_name: (sup?.name ?? prov) || undefined,
        supplier_id: sup?.id,
        order_date: form.order_date || today(),
        expected_date: form.expected_date || undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        status: 'pendiente',
        lines: lineas.map(({ i: _i, ...l }) => l),
      });
      onSaved(form.client_name.trim());
    } catch (err) {
      setError(mensajeError(err, 'No se pudo crear el pedido. Comprueba la conexión con el servidor.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && window.innerWidth > 768) onClose(); }}>
      <div className="modal rep-modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 16 }}>Nuevo pedido especial</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
            {error && (
              <div className="doc-aviso error" ref={errorRef} role="alert">{error}</div>
            )}

            {/* CLIENT — primary */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Para quién es el pedido
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label className="form-label">Cliente *</label>
                  <input className="form-input" value={form.client_name} onChange={setField('client_name')} placeholder="Nombre del cliente" required />
                </div>
                <div>
                  <label className="form-label">Teléfono (para avisarle)</label>
                  <input className="form-input" type="tel" value={form.client_phone} onChange={setField('client_phone')} placeholder="666 123 456" />
                </div>
              </div>
            </div>

            {/* SUPPLIER — secondary */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                A quién se pide
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div>
                  <label className="form-label" htmlFor="ped-proveedor">Proveedor</label>
                  <input
                    id="ped-proveedor"
                    className="form-input"
                    list="ped-proveedores"
                    value={form.supplier_name}
                    onChange={setField('supplier_name')}
                    placeholder="Escribe o elige el proveedor"
                    autoComplete="off"
                    style={{ margin: 0 }}
                  />
                  <datalist id="ped-proveedores">
                    {proveedores.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div>
                  <label className="form-label">Referencia / N.º pedido</label>
                  <input className="form-input" value={form.reference} onChange={setField('reference')} placeholder="PED-001" />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="rep-modal-2">
              <div>
                <label className="form-label">Fecha del pedido</label>
                <input className="form-input" type="date" value={form.order_date} onChange={setField('order_date')} />
              </div>
              <div>
                <label className="form-label">Llegada prevista</label>
                <input className="form-input" type="date" value={form.expected_date} min={form.order_date || undefined} onChange={setField('expected_date')} />
              </div>
            </div>

            {/* Lines */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>Artículos pedidos *</label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}><Plus size={13} /> Añadir línea</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.lines.map((line, i) => (
                  <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 10px 8px', border: '1px solid var(--border)' }}>
                    {/* Row 1: description + delete */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input className="form-input" placeholder={`Artículo ${i + 1}`} value={line.descripcion}
                        onChange={setLine(i, 'descripcion')} style={{ margin: 0, flex: 1 }} />
                      <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '4px 6px', flexShrink: 0 }}
                        onClick={() => removeLine(i)} disabled={form.lines.length === 1} aria-label="Quitar esta línea"><X size={16} /></button>
                    </div>
                    {/* Row 2: cantidad / precio */}
                    <div className="rep-modal-2" style={{ gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>CANTIDAD</div>
                        <input className="form-input" type="text" inputMode="decimal" value={line.cantidad}
                          onChange={setLine(i, 'cantidad')} style={{ margin: 0, textAlign: 'right' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>PRECIO UNIDAD (€, OPCIONAL)</div>
                        <input className="form-input" type="text" inputMode="decimal" placeholder="0,00" value={line.precio_unitario}
                          onChange={setLine(i, 'precio_unitario')} style={{ margin: 0, textAlign: 'right' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="form-label">Notas</label>
              <textarea className="form-input" value={form.notes} onChange={setField('notes')} placeholder="Notas del pedido…" rows={2} style={{ resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creando…' : 'Crear pedido'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrderCard({ order, overdue, onNavigate, muted = false }: {
  order: SupplierOrderListItem;
  overdue: boolean;
  onNavigate: () => void;
  muted?: boolean;
}) {
  const porPedir = order.status === 'pendiente';
  return (
    <div
      className={`card firma-card ped-card${overdue ? ' retrasado' : ''}`}
      style={{ opacity: muted ? 0.7 : 1 }}
      onClick={onNavigate}
      role="link"
    >
      <div className="ped-card-main">
        <div className="ped-card-cab">
          <span className="ped-card-cliente">{order.client_name || '—'}</span>
          <StatusChip status={order.status} />
          {overdue && <span className="aviso-chip">Retrasado</span>}
          {order.status === 'recibido' && (order.aviso_at
            ? <span className="aviso-chip hecho"><CheckCheck size={13} /> Cliente avisado</span>
            : <span className="aviso-chip">Sin avisar al cliente</span>)}
        </div>
        <div className="ped-card-datos">
          {order.client_phone && (
            <a href={`tel:${order.client_phone}`} onClick={e => e.stopPropagation()}><Phone size={12} /> {order.client_phone}</a>
          )}
          {order.supplier_name && <span><ShoppingCart size={11} /> {order.supplier_name}</span>}
          {order.reference && <span className="ped-card-ref">{order.reference}</span>}
          {/* Hasta que no se marca como pedido, no tiene fecha de pedido */}
          {!porPedir && <span>Pedido el {fmtDate(order.order_date)}</span>}
          {order.expected_date && !porPedir && (
            <span style={{ color: overdue ? 'var(--danger)' : undefined, fontWeight: overdue ? 600 : undefined }}>
              Llegada prevista {fmtDate(order.expected_date)}
            </span>
          )}
          <span>{order.line_count} artículo{order.line_count !== 1 ? 's' : ''}</span>
        </div>
      </div>
      {order.line_count > 0 && !porPedir && order.status !== 'cancelado' && (
        <div className="ped-card-prog">
          <span>{order.lines_received}/{order.line_count} recibidos</span>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${(order.lines_received / order.line_count) * 100}%`,
                background: order.status === 'recibido' || order.status === 'entregado' ? 'var(--success)' : 'var(--brand)',
              }}
            />
          </div>
        </div>
      )}
      <ChevronRight size={18} className="ped-card-flecha" />
    </div>
  );
}

export function OrdersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast, show } = useCfToast();
  const [orders, setOrders] = useState<SupplierOrderListItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(searchParams.get('new') === '1');
  const [showHistory, setShowHistory] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([listOrders(), listSuppliers()])  // load all — split active/history client-side
      .then(([ordRes, supRes]) => { setOrders(ordRes.data); setSuppliers(supRes.data); })
      .catch(err => setLoadError(describeApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const isDone = (o: SupplierOrderListItem) => o.status === 'entregado' || o.status === 'cancelado';
  const active  = orders.filter(o => !isDone(o));
  const history = orders.filter(o => isDone(o));

  // Para buscar por artículo hacen falta las líneas: la lista no las trae, se piden al buscar
  const [textoLineas, setTextoLineas] = useState<Record<number, string>>({});
  const pidiendoLineas = useRef(false);
  useEffect(() => {
    if (!search.trim() || pidiendoLineas.current) return;
    const faltan = orders.filter(o => textoLineas[o.id] === undefined).slice(0, 150);
    if (!faltan.length) return;
    pidiendoLineas.current = true;
    Promise.allSettled(faltan.map(o => getOrder(o.id))).then(rs => {
      const nuevo: Record<number, string> = {};
      rs.forEach((r, i) => {
        nuevo[faltan[i].id] = r.status === 'fulfilled'
          ? [r.value.data.notes, ...r.value.data.lines.flatMap(l => [l.descripcion, l.notes, l.supplier_name])].filter(Boolean).join(' ')
          : '';
      });
      setTextoLineas(prev => ({ ...prev, ...nuevo }));
    }).finally(() => { pidiendoLineas.current = false; });
  }, [search, orders, textoLineas]);

  const coincidePedido = (o: SupplierOrderListItem) => !search.trim() ||
    coincide(search, o.client_name, o.client_phone, o.supplier_name, o.reference, textoLineas[o.id]);
  const filtered = active.filter(o =>
    (!filter || o.status === filter || (filter === 'pedido' && o.status === 'parcial')) && coincidePedido(o));
  const historyFiltered = history.filter(coincidePedido);
  const verHistorial = showHistory || (!!search.trim() && historyFiltered.length > 0);

  // Sugerencias de proveedor: los de Ajustes y los que ya se han usado en pedidos
  const proveedores = useMemo(() => {
    const m = new Map<string, string>();
    [...suppliers.map(x => x.name), ...orders.map(o => o.supplier_name || '')].forEach(n => {
      const t = n.trim(); if (t && t !== '__manual__' && !m.has(t.toLowerCase())) m.set(t.toLowerCase(), t);
    });
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [suppliers, orders]);

  // Retrasado solo a partir del día siguiente al previsto, y solo si ya se pidió
  const isOverdue = (o: SupplierOrderListItem) =>
    !!o.expected_date && (o.status === 'pedido' || o.status === 'parcial') &&
    o.expected_date.split('T')[0] < today();

  return (
    <div className="page">
      {toast}
      {loadError && (
        <ConnectionError message={loadError} onRetry={load} />
      )}
      <div className="inicio-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>Pedidos de clientes</h1>
          <p>Lo que hemos pedido al proveedor para un cliente concreto.</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setShowModal(true)}>
          <Plus size={19} /> Nuevo pedido
        </button>
      </div>

      <div className="firma-vistas" role="tablist" aria-label="Estado" style={{ marginBottom: 12 }}>
        {ACTIVE_STATUSES.map(st => (
          <button key={st.value} role="tab" aria-selected={filter === st.value}
            onClick={() => setFilter(st.value as OrderStatus | '')}
            className={`firma-vista${filter === st.value ? ' on' : ''}`}>
            {st.label}
            <span className="firma-vista-n">{st.value ? active.filter(o => o.status === st.value || (st.value === 'pedido' && o.status === 'parcial')).length : active.length}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            className="form-input"
            type="search"
            placeholder="Buscar cliente, teléfono, artículo, proveedor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 42, margin: 0, borderRadius: 999 }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : loadError ? null : active.length === 0 && !filter && !search ? (
        <Vacio dibujo="cajaVacia" titulo="Sin pedidos pendientes" texto="Cuando hagas un pedido a un proveedor, aparecerá aquí.">
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowModal(true)}><Plus size={14} /> Nuevo pedido</button>
        </Vacio>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">
            {search.trim()
              ? historyFiltered.length ? `Nada en curso con «${search.trim()}»; mira en el historial de abajo.` : `Nada con «${search.trim()}»`
              : 'Sin resultados para este filtro'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              overdue={!!isOverdue(order)}
              onNavigate={() => navigate(`/pedidos/${order.id}`)}
            />
          ))}
        </div>
      )}

      {/* History — collapsible */}
      {!loading && historyFiltered.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <button
            onClick={() => setShowHistory(v => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 0',
              background: 'none',
              border: 'none',
              borderTop: '1px solid var(--border)',
              cursor: 'pointer',
              color: 'var(--text-3)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <ChevronRight size={15} style={{ transform: verHistorial ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
            Historial — {historyFiltered.length} pedido{historyFiltered.length !== 1 ? 's' : ''} entregado{historyFiltered.length !== 1 ? 's' : ''} o cancelado{historyFiltered.length !== 1 ? 's' : ''}{search.trim() ? ` con «${search.trim()}»` : ''}
          </button>
          {verHistorial && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {historyFiltered.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  overdue={false}
                  onNavigate={() => navigate(`/pedidos/${order.id}`)}
                  muted
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <NewOrderModal
          proveedores={proveedores}
          suppliers={suppliers}
          onClose={() => setShowModal(false)}
          onSaved={cliente => { setShowModal(false); load(); show(`Pedido de ${cliente} apuntado (por pedir)`); }}
        />
      )}
    </div>
  );
}

function fmtDate(dt?: string | null): string {
  return fechaES(dt ? dt.split('T')[0] : dt);
}
