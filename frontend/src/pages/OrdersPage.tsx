import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ShoppingCart, Search, Pencil, Trash2, ChevronRight, Package } from 'lucide-react';
import { listOrders, createOrder, deleteOrder, listSuppliers } from '../api/client';
import type { SupplierOrderListItem, Supplier, OrderStatus } from '../types';

const STATUSES: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'recibido', label: 'Recibido' },
  { value: 'cancelado', label: 'Cancelado' },
];

function StatusChip({ status }: { status: OrderStatus }) {
  const labels: Record<OrderStatus, string> = {
    pendiente: 'Pendiente', parcial: 'Parcial', recibido: 'Recibido', cancelado: 'Cancelado',
  };
  return <span className={`status-chip ${status}`}>{labels[status]}</span>;
}

interface NewOrderForm {
  supplier_name: string;
  supplier_id: string;
  order_date: string;
  expected_date: string;
  reference: string;
  notes: string;
  lines: { descripcion: string; cantidad: string; precio_unitario: string }[];
}

function NewOrderModal({ suppliers, onClose, onSaved }: {
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState<NewOrderForm>({
    supplier_name: '', supplier_id: '', order_date: today,
    expected_date: '', reference: '', notes: '',
    lines: [{ descripcion: '', cantidad: '1', precio_unitario: '' }],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (k: keyof NewOrderForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const setLine = (i: number, k: keyof typeof form.lines[0]) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => { const lines = [...f.lines]; lines[i] = { ...lines[i], [k]: e.target.value }; return { ...f, lines }; });
  };

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { descripcion: '', cantidad: '1', precio_unitario: '' }] }));
  const removeLine = (i: number) => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }));

  const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const sup = suppliers.find(s => String(s.id) === id);
    setForm(f => ({ ...f, supplier_id: id, supplier_name: sup?.name ?? f.supplier_name }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.supplier_name.trim() || suppliers.find(s => String(s.id) === form.supplier_id)?.name;
    if (!name) { setError('Selecciona o escribe el nombre del proveedor'); return; }
    const validLines = form.lines.filter(l => l.descripcion.trim());
    if (validLines.length === 0) { setError('Añade al menos una línea'); return; }
    setSaving(true);
    setError('');
    try {
      await createOrder({
        supplier_name: name,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : undefined,
        order_date: form.order_date,
        expected_date: form.expected_date || undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        status: 'pendiente',
        lines: validLines.map(l => ({
          descripcion: l.descripcion.trim(),
          cantidad: parseFloat(l.cantidad) || 1,
          precio_unitario: l.precio_unitario ? parseFloat(l.precio_unitario) : undefined,
        })),
      } as any);
      onSaved();
    } catch {
      setError('Error al crear el pedido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 16 }}>Nuevo pedido</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
            {error && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{error}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Proveedor *</label>
                {suppliers.length > 0 ? (
                  <select className="form-input" value={form.supplier_id} onChange={handleSupplierChange} style={{ marginBottom: 6 }}>
                    <option value="">— Seleccionar proveedor —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value="">Otro (escribir abajo)</option>
                  </select>
                ) : null}
                <input
                  className="form-input"
                  value={form.supplier_name}
                  onChange={setField('supplier_name')}
                  placeholder={suppliers.length > 0 ? 'O escribe nombre del proveedor' : 'Nombre del proveedor'}
                  style={{ margin: 0 }}
                />
              </div>
              <div>
                <label className="form-label">Referencia / N.º pedido</label>
                <input className="form-input" value={form.reference} onChange={setField('reference')} placeholder="PED-2024-001" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Fecha del pedido *</label>
                <input className="form-input" type="date" value={form.order_date} onChange={setField('order_date')} required />
              </div>
              <div>
                <label className="form-label">Fecha estimada de llegada</label>
                <input className="form-input" type="date" value={form.expected_date} onChange={setField('expected_date')} />
              </div>
            </div>

            {/* Lines */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>Artículos del pedido *</label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}><Plus size={13} /> Añadir línea</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 32px', gap: 8, padding: '0 4px' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>ARTÍCULO</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>CANT.</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>PRECIO U.</span>
                  <span />
                </div>
                {form.lines.map((line, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 32px', gap: 8, alignItems: 'center' }}>
                    <input
                      className="form-input"
                      placeholder={`Artículo ${i + 1}`}
                      value={line.descripcion}
                      onChange={setLine(i, 'descripcion')}
                      style={{ margin: 0 }}
                    />
                    <input
                      className="form-input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.cantidad}
                      onChange={setLine(i, 'cantidad')}
                      style={{ margin: 0, textAlign: 'right' }}
                    />
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="€"
                      value={line.precio_unitario}
                      onChange={setLine(i, 'precio_unitario')}
                      style={{ margin: 0, textAlign: 'right' }}
                    />
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4, borderRadius: 4 }}
                      onClick={() => removeLine(i)}
                      disabled={form.lines.length === 1}
                    >
                      ✕
                    </button>
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

export function OrdersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<SupplierOrderListItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(searchParams.get('new') === '1');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listOrders(filter || undefined), listSuppliers()])
      .then(([ordRes, supRes]) => { setOrders(ordRes.data); setSuppliers(supRes.data); })
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? orders.filter(o =>
        o.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
        (o.reference ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este pedido?')) return;
    await deleteOrder(id);
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  const isOverdue = (o: SupplierOrderListItem) =>
    o.expected_date && o.status !== 'recibido' && o.status !== 'cancelado' &&
    new Date(o.expected_date) < new Date();

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>Pedidos a proveedores</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Gestión y seguimiento de pedidos</p>
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
            placeholder="Buscar proveedor o referencia…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32, margin: 0 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value as OrderStatus | '')}
              className={`btn btn-sm ${filter === s.value ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s.label}
              {s.value && (
                <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>
                  {orders.filter(o => o.status === s.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">No hay pedidos</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
            <Plus size={14} /> Crear primer pedido
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(order => (
            <div
              key={order.id}
              className="card"
              style={{
                padding: '16px 20px',
                cursor: 'pointer',
                borderColor: isOverdue(order) ? '#fca5a5' : undefined,
                background: isOverdue(order) ? '#fff5f5' : undefined,
              }}
              onClick={() => navigate(`/pedidos/${order.id}`)}
            >
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{order.supplier_name}</span>
                    {order.reference && (
                      <span style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                        {order.reference}
                      </span>
                    )}
                    <StatusChip status={order.status} />
                    {isOverdue(order) && (
                      <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600 }}>⚠ Retrasado</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-3)', flexWrap: 'wrap' }}>
                    <span>Pedido: {new Date(order.order_date).toLocaleDateString('es-ES')}</span>
                    {order.expected_date && (
                      <span style={{ color: isOverdue(order) ? '#b91c1c' : undefined }}>
                        Estimado: {new Date(order.expected_date).toLocaleDateString('es-ES')}
                      </span>
                    )}
                    <span>{order.line_count} artículo{order.line_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Receipt progress */}
                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 120 }}>
                  {order.line_count > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                        {order.lines_received}/{order.line_count} recibidos
                      </div>
                      <div className="progress-bar" style={{ width: 100 }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${(order.lines_received / order.line_count) * 100}%`,
                            background: order.status === 'recibido' ? 'var(--success)' : 'var(--brand)',
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={e => { e.stopPropagation(); handleDelete(order.id); }}
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                  <ChevronRight size={16} style={{ color: 'var(--text-3)', alignSelf: 'center' }} />
                </div>
              </div>
            </div>
          ))}
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
