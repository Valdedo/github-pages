import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ShoppingCart, Search, Trash2, ChevronRight, Package, Phone } from 'lucide-react';
import { listOrders, createOrder, deleteOrder, listSuppliers, describeApiError } from '../api/client';
import { useConfirm } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { ConnectionError } from '../components/ConnectionError';
import type { SupplierOrderListItem, Supplier, OrderStatus } from '../types';

// Status flow: pendiente → pedido → recibido → entregado
// entregado + cancelado are "done" → go to history
const ACTIVE_STATUSES: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Por pedir' },
  { value: 'pedido', label: 'Pedido' },
  { value: 'recibido', label: 'Recibido' },
];

const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Por pedir',
  pedido: 'Pedido',
  parcial: 'Parcial',
  recibido: 'Recibido',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

function StatusChip({ status }: { status: string }) {
  return <span className={`status-chip ${status}`}>{STATUS_LABEL[status] ?? status}</span>;
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
  lines: { descripcion: string; cantidad: string; precio_unitario: string; supplier_name: string }[];
}

function NewOrderModal({ suppliers, onClose, onSaved }: {
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<NewOrderForm>({
    client_name: '', client_phone: '',
    supplier_name: '', supplier_id: '',
    order_date: today(), expected_date: '',
    reference: '', notes: '',
    lines: [{ descripcion: '', cantidad: '1', precio_unitario: '', supplier_name: '' }],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (k: keyof NewOrderForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const setLine = (i: number, k: keyof typeof form.lines[0]) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => { const lines = [...f.lines]; lines[i] = { ...lines[i], [k]: e.target.value }; return { ...f, lines }; });
  };

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { descripcion: '', cantidad: '1', precio_unitario: '', supplier_name: '' }] }));
  const removeLine = (i: number) => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }));

  const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const sup = suppliers.find(s => String(s.id) === id);
    setForm(f => ({ ...f, supplier_id: id, supplier_name: sup?.name ?? f.supplier_name }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name.trim()) { setError('El nombre del cliente es obligatorio'); return; }
    const validLines = form.lines.filter(l => l.descripcion.trim());
    if (validLines.length === 0) { setError('Añade al menos un artículo'); return; }
    setSaving(true);
    setError('');
    try {
      await createOrder({
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim() || undefined,
        supplier_name: form.supplier_name.trim() || undefined,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : undefined,
        order_date: form.order_date,
        expected_date: form.expected_date || undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        status: 'pendiente',
        lines: validLines.map(l => ({
          descripcion:   l.descripcion.trim(),
          cantidad:      parseFloat(l.cantidad) || 1,
          precio_unitario: l.precio_unitario ? parseFloat(l.precio_unitario) : undefined,
          supplier_name: l.supplier_name.trim() || undefined,
        })),
      } as any);
      onSaved();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(detail ? `Error: ${detail}` : 'Error al crear el pedido. Comprueba la conexión con el servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 16 }}>Nuevo pedido especial</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
            {error && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{error}</div>
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
                  <label className="form-label">Teléfono</label>
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
                  <label className="form-label">Proveedor</label>
                  {suppliers.length > 0 && (
                    <select className="form-input" value={form.supplier_id} onChange={handleSupplierChange} style={{ marginBottom: 6 }}>
                      <option value="">— Seleccionar —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  <input
                    className="form-input"
                    value={form.supplier_name}
                    onChange={setField('supplier_name')}
                    placeholder={suppliers.length > 0 ? 'O escribir nombre' : 'Nombre del proveedor'}
                    style={{ margin: 0 }}
                  />
                </div>
                <div>
                  <label className="form-label">Referencia / N.º pedido</label>
                  <input className="form-input" value={form.reference} onChange={setField('reference')} placeholder="PED-001" />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div>
                <label className="form-label">Fecha del pedido</label>
                <input className="form-input" type="date" value={form.order_date} onChange={setField('order_date')} />
              </div>
              <div>
                <label className="form-label">Fecha estimada de llegada</label>
                <input className="form-input" type="date" value={form.expected_date} onChange={setField('expected_date')} />
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
                        onClick={() => removeLine(i)} disabled={form.lines.length === 1}>✕</button>
                    </div>
                    {/* Row 2: cant / precio / proveedor */}
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 90px 1fr', gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>CANT.</div>
                        <input className="form-input" type="number" min="0.01" step="0.01" value={line.cantidad}
                          onChange={setLine(i, 'cantidad')} style={{ margin: 0, textAlign: 'right' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>PRECIO</div>
                        <input className="form-input" type="number" min="0" step="0.01" placeholder="€" value={line.precio_unitario}
                          onChange={setLine(i, 'precio_unitario')} style={{ margin: 0, textAlign: 'right' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>PROVEEDOR</div>
                        <input className="form-input" placeholder={form.supplier_name || '—'} value={line.supplier_name}
                          onChange={setLine(i, 'supplier_name')} style={{ margin: 0 }} />
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

function OrderCard({ order, overdue, onNavigate, onDelete, muted = false }: {
  order: SupplierOrderListItem;
  overdue: boolean;
  onNavigate: () => void;
  onDelete: () => void;
  muted?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: '16px 20px',
        cursor: 'pointer',
        opacity: muted ? 0.6 : 1,
        borderColor: overdue ? '#fca5a5' : undefined,
        background: overdue ? '#fff5f5' : undefined,
      }}
      onClick={onNavigate}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{order.client_name || '—'}</span>
            {order.client_phone && (
              <a
                href={`tel:${order.client_phone}`}
                style={{ color: 'var(--text-3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}
                onClick={e => e.stopPropagation()}
              >
                <Phone size={12} /> {order.client_phone}
              </a>
            )}
            <StatusChip status={order.status} />
            {overdue && <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600 }}>⚠ Retrasado</span>}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            {order.supplier_name && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShoppingCart size={11} /> {order.supplier_name}
              </span>
            )}
            {order.reference && (
              <span style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                {order.reference}
              </span>
            )}
            <span>Pedido: {fmtDate(order.order_date)}</span>
            {order.expected_date && (
              <span style={{ color: overdue ? '#b91c1c' : undefined }}>
                Est. llegada: {fmtDate(order.expected_date)}
              </span>
            )}
            <span>{order.line_count} artículo{order.line_count !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {order.line_count > 0 && (
          <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 110 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
              {order.lines_received}/{order.line_count} recibidos
            </div>
            <div className="progress-bar" style={{ width: 90 }}>
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
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{ color: 'var(--danger)' }}
          >
            <Trash2 size={14} />
          </button>
          <ChevronRight size={16} style={{ color: 'var(--text-3)', alignSelf: 'center' }} />
        </div>
      </div>
    </div>
  );
}

export function OrdersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { confirm, ConfirmDialog } = useConfirm();
  const { showToast, ToastContainer } = useToast();
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

  const filtered = active.filter(o => {
    const matchStatus = !filter || o.status === filter;
    const matchSearch = !search ||
      o.client_name.toLowerCase().includes(search.toLowerCase()) ||
      (o.supplier_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.reference ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Eliminar pedido', message: '¿Eliminar este pedido?', confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    try {
      await deleteOrder(id);
      setOrders(prev => prev.filter(o => o.id !== id));
      showToast('Eliminado correctamente', 'success');
    } catch {
      showToast('Error al eliminar el pedido', 'error');
      load();
    }
  };

  const isOverdue = (o: SupplierOrderListItem) =>
    o.expected_date && o.status !== 'recibido' && o.status !== 'entregado' && o.status !== 'cancelado' &&
    new Date(o.expected_date) < new Date();

  return (
    <div className="page">
      {ConfirmDialog}
      <ToastContainer />
      {loadError && (
        <ConnectionError message={loadError} onRetry={load} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>Pedidos especiales</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Artículos pedidos para clientes concretos</p>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowModal(true)}>
          <Plus size={15} /> Nuevo pedido
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            className="form-input"
            placeholder="Buscar cliente o proveedor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32, margin: 0 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ACTIVE_STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value as OrderStatus | '')}
              className={`btn btn-sm ${filter === s.value ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s.label}
              {s.value && (
                <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>
                  {active.filter(o => o.status === s.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : loadError ? null : active.length === 0 && !filter && !search ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">No hay pedidos activos</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
            <Plus size={14} /> Crear primer pedido
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">Sin resultados para este filtro</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              overdue={!!isOverdue(order)}
              onNavigate={() => navigate(`/pedidos/${order.id}`)}
              onDelete={() => handleDelete(order.id)}
            />
          ))}
        </div>
      )}

      {/* History — collapsible */}
      {!loading && history.length > 0 && (
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
            <ChevronRight size={15} style={{ transform: showHistory ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
            Historial — {history.length} pedido{history.length !== 1 ? 's' : ''} completado{history.length !== 1 ? 's' : ''}
          </button>
          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {history.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  overdue={false}
                  onNavigate={() => navigate(`/pedidos/${order.id}`)}
                  onDelete={() => handleDelete(order.id)}
                  muted
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <NewOrderModal
          suppliers={suppliers}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function fmtDate(dt?: string | null): string {
  if (!dt) return '';
  const [y, m, d] = dt.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}
