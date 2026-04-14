import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Check, Pencil, Trash2, Package, FileText, Link, RotateCcw } from 'lucide-react';
import { getOrder, updateOrder, addOrderLine, updateOrderLine, deleteOrderLine, deleteOrder, listDocuments } from '../api/client';
import type { SupplierOrder, SupplierOrderLine, DocumentListItem, OrderStatus } from '../types';

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Por pedir', pedido: 'Pedido', parcial: 'Parcial',
  recibido: 'Recibido', entregado: 'Entregado', cancelado: 'Cancelado',
};

const STATUS_NEXT: Record<string, { status: string; label: string } | null> = {
  pendiente: { status: 'pedido',    label: 'Marcar como pedido' },
  pedido:    { status: 'recibido',  label: 'Marcar recibido' },
  parcial:   { status: 'recibido',  label: 'Marcar recibido' },
  recibido:  { status: 'entregado', label: 'Marcar entregado al cliente' },
  entregado: null,
  cancelado: null,
};

const STATUS_PREV: Record<string, { status: OrderStatus; label: string } | null> = {
  pendiente: null,
  pedido:    { status: 'pendiente', label: 'Volver a "Por pedir"' },
  parcial:   { status: 'pedido',    label: 'Volver a "Pedido"' },
  recibido:  { status: 'pedido',    label: 'Deshacer recepción' },
  entregado: { status: 'recibido',  label: 'Volver a "Recibido"' },
  cancelado: { status: 'pendiente', label: 'Reactivar pedido' },
};

function StatusChip({ status }: { status: string }) {
  return <span className={`status-chip ${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}

// ─── Edit line modal ─────────────────────────────────────────────────────────
// Handles both editing article details AND setting cantidad_recibida (incl. 0 to undo)
function EditLineModal({
  line,
  onClose,
  onSaved,
}: {
  line: SupplierOrderLine;
  onClose: () => void;
  onSaved: (updated: SupplierOrderLine) => void;
}) {
  const [desc, setDesc]       = useState(line.descripcion);
  const [qty, setQty]         = useState(String(line.cantidad));
  const [price, setPrice]     = useState(line.precio_unitario != null ? String(line.precio_unitario) : '');
  const [received, setReceived] = useState(String(line.cantidad_recibida));
  const [notes, setNotes]     = useState(line.notes ?? '');
  const [saving, setSaving]   = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    setSaving(true);
    try {
      const { data } = await updateOrderLine(line.order_id, line.id, {
        descripcion:       desc.trim(),
        cantidad:          parseFloat(qty) || 1,
        precio_unitario:   price ? parseFloat(price) : undefined,
        cantidad_recibida: Math.max(0, parseFloat(received) || 0),
        notes:             notes.trim() || undefined,
      });
      onSaved(data);
    } finally { setSaving(false); }
  };

  const qtyNum      = parseFloat(qty) || 1;
  const receivedNum = parseFloat(received) || 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700 }}>Editar artículo</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handle}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Article details */}
            <div>
              <label className="form-label">Descripción *</label>
              <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} autoFocus required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Cantidad pedida</label>
                <input className="form-input" type="number" min="0.01" step="0.01" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Precio u. (€)</label>
                <input className="form-input" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Recepción
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Cantidad recibida</label>
                  <input
                    className="form-input"
                    type="number" min="0" step="0.01"
                    value={received}
                    onChange={e => setReceived(e.target.value)}
                    style={{ borderColor: receivedNum === 0 ? undefined : receivedNum >= qtyNum ? 'var(--success)' : 'var(--accent)' }}
                  />
                </div>
                {/* Quick shortcuts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 18 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setReceived('0')}
                    title="Deshacer recepción"
                    style={{ fontSize: 11 }}
                  >
                    ✕ Ninguna
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setReceived(qty)}
                    title="Marcar todo recibido"
                    style={{ fontSize: 11 }}
                  >
                    ✓ Todas
                  </button>
                </div>
              </div>
              {receivedNum > 0 && receivedNum < qtyNum && (
                <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>
                  Recepción parcial: quedan {(qtyNum - receivedNum).toFixed(2)} ud
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="form-label">Notas (opcional)</label>
              <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones…" />
            </div>

          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add line modal ───────────────────────────────────────────────────────────
function AddLineModal({ orderId, onClose, onAdded }: { orderId: number; onClose: () => void; onAdded: (l: SupplierOrderLine) => void }) {
  const [desc, setDesc]   = useState('');
  const [qty, setQty]     = useState('1');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    setSaving(true);
    try {
      const { data } = await addOrderLine(orderId, {
        descripcion: desc.trim(),
        cantidad: parseFloat(qty) || 1,
        precio_unitario: price ? parseFloat(price) : undefined,
      });
      onAdded(data);
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700 }}>Añadir artículo</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handle}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="form-label">Descripción *</label>
              <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Nombre del artículo" autoFocus required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Cantidad</label>
                <input className="form-input" type="number" min="0.01" step="0.01" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Precio u. (€)</label>
                <input className="form-input" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
              </div>
            </div>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Añadiendo…' : 'Añadir'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder]           = useState<SupplierOrder | null>(null);
  const [loading, setLoading]       = useState(true);
  const [editingLine, setEditingLine] = useState<SupplierOrderLine | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [linkingDoc, setLinkingDoc] = useState(false);
  const [documents, setDocuments]   = useState<DocumentListItem[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    getOrder(parseInt(id))
      .then(({ data }) => setOrder(data))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleLineSaved = (updated: SupplierOrderLine) => {
    setOrder(o => o ? { ...o, lines: o.lines.map(l => l.id === updated.id ? updated : l) } : o);
    setEditingLine(null);
    load(); // reload to get updated order status
  };

  const handleLineAdded = (_line: SupplierOrderLine) => {
    setAddingLine(false);
    load();
  };

  const handleDeleteLine = async (lineId: number) => {
    if (!order || !confirm('¿Eliminar esta línea?')) return;
    await deleteOrderLine(order.id, lineId);
    load();
  };

  const handleReceiveAll = async () => {
    if (!order) return;
    const pending = order.lines.filter(l => l.cantidad_recibida < l.cantidad);
    if (pending.length === 0) return;
    await Promise.all(pending.map(l => updateOrderLine(order.id, l.id, { cantidad_recibida: l.cantidad })));
    load();
  };

  const handleLinkDoc = async (docId: number) => {
    if (!order) return;
    await updateOrder(order.id, { document_id: docId });
    setLinkingDoc(false);
    load();
  };

  const handleAdvanceStatus = async () => {
    if (!order) return;
    const next = STATUS_NEXT[order.status];
    if (!next) return;
    await updateOrder(order.id, { status: next.status as OrderStatus });
    load();
  };

  const handleRevertStatus = async () => {
    if (!order) return;
    const prev = STATUS_PREV[order.status];
    if (!prev) return;
    if (!confirm(`¿${prev.label}?`)) return;
    await updateOrder(order.id, { status: prev.status });
    load();
  };

  const handleCancelOrder = async () => {
    if (!order || !confirm('¿Cancelar este pedido?')) return;
    await updateOrder(order.id, { status: 'cancelado' });
    load();
  };

  const handleDeleteOrder = async () => {
    if (!order || !confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return;
    await deleteOrder(order.id);
    navigate('/pedidos');
  };

  const openLinkModal = async () => {
    const { data } = await listDocuments();
    setDocuments(data.filter(d => d.status === 'completed'));
    setLinkingDoc(true);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Cargando…</div>;
  if (!order)  return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Pedido no encontrado</div>;

  const totalLines    = order.lines.length;
  const totalReceived = order.lines.filter(l => l.cantidad_recibida >= l.cantidad).length;
  const totalPending  = totalLines - totalReceived;
  const progressPct   = totalLines > 0 ? Math.round((totalReceived / totalLines) * 100) : 0;

  const canEdit = order.status !== 'cancelado';

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      {/* Back + header */}
      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/pedidos')}>
          <ArrowLeft size={14} /> Volver a pedidos
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            {/* CLIENT — primary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>{order.client_name || '—'}</h1>
              {order.client_phone && (
                <a href={`tel:${order.client_phone}`} style={{ fontSize: 13, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                  📞 {order.client_phone}
                </a>
              )}
              {order.reference && (
                <span style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                  {order.reference}
                </span>
              )}
              <StatusChip status={order.status} />
            </div>
            {/* SUPPLIER — secondary */}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-3)', flexWrap: 'wrap' }}>
              {order.supplier_name && <span>Proveedor: <strong style={{ color: 'var(--text-2)' }}>{order.supplier_name}</strong></span>}
              <span>Pedido el {new Date(order.order_date).toLocaleDateString('es-ES')}</span>
              {order.expected_date && <span>Est. llegada: {new Date(order.expected_date).toLocaleDateString('es-ES')}</span>}
              {order.received_date && <span>Recibido: {new Date(order.received_date).toLocaleDateString('es-ES')}</span>}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Advance status */}
            {STATUS_NEXT[order.status] && (
              <button className="btn btn-primary btn-sm" onClick={handleAdvanceStatus}>
                <Check size={14} /> {STATUS_NEXT[order.status]!.label}
              </button>
            )}
            {/* Revert status */}
            {STATUS_PREV[order.status] && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleRevertStatus}
                title={STATUS_PREV[order.status]!.label}
                style={{ color: 'var(--text-3)' }}
              >
                <RotateCcw size={13} /> {STATUS_PREV[order.status]!.label}
              </button>
            )}
            {totalPending > 0 && canEdit && (
              <button className="btn btn-ghost btn-sm" onClick={handleReceiveAll}>
                Recibir todo
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={openLinkModal} title="Vincular albarán">
              <Link size={14} /> Vincular albarán
            </button>
            {order.status !== 'cancelado' && order.status !== 'entregado' && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={handleCancelOrder}>
                Cancelar
              </button>
            )}
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={handleDeleteOrder}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Progress */}
      {totalLines > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Progreso de recepción</span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{totalReceived} / {totalLines} artículos recibidos</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%`, background: progressPct === 100 ? 'var(--success)' : 'var(--brand)' }} />
          </div>
          {order.document_id && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
              <FileText size={13} />
              Albarán vinculado — <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: 12 }} onClick={() => navigate(`/documento/${order.document_id}`)}>Ver albarán →</button>
            </div>
          )}
        </div>
      )}

      {/* Lines */}
      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between' }}>
          <span><Package size={14} /> Artículos del pedido</span>
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => setAddingLine(true)}><Plus size={13} /> Añadir</button>
          )}
        </div>

        {order.lines.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No hay artículos en este pedido
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px 72px', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              {['ARTÍCULO', 'PEDIDO', 'RECIBIDO', 'PRECIO U.', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>{h}</span>
              ))}
            </div>
            {order.lines.map(line => {
              const done    = line.cantidad_recibida >= line.cantidad;
              const partial = line.cantidad_recibida > 0 && !done;
              return (
                <div
                  key={line.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px 72px',
                    gap: 12, padding: '12px 20px',
                    borderBottom: '1px solid var(--border)',
                    background: done ? '#f0fdf4' : undefined,
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 18, opacity: 0.6, flexShrink: 0 }}>{done ? '✓' : partial ? '◑' : '○'}</span>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: done ? 'var(--text-3)' : 'var(--text-1)', textDecoration: done ? 'line-through' : undefined, display: 'block' }}>
                        {line.descripcion}
                      </span>
                      {line.notes && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{line.notes}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>{line.cantidad} ud</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--success)' : partial ? 'var(--accent)' : 'var(--text-3)', textAlign: 'right' }}>
                    {line.cantidad_recibida > 0 ? `${line.cantidad_recibida} ud` : '—'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'right' }}>
                    {line.precio_unitario != null ? `${line.precio_unitario.toFixed(2)} €` : '—'}
                  </span>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {canEdit && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditingLine(line)}
                        title="Editar artículo"
                        style={{ color: done ? 'var(--text-3)' : undefined }}
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => handleDeleteLine(line.id)}
                        title="Eliminar línea"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {order.notes && (
        <div className="card" style={{ padding: '14px 20px', marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>NOTAS</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{order.notes}</div>
        </div>
      )}

      {editingLine && (
        <EditLineModal line={editingLine} onClose={() => setEditingLine(null)} onSaved={handleLineSaved} />
      )}
      {addingLine && (
        <AddLineModal orderId={order.id} onClose={() => setAddingLine(false)} onAdded={handleLineAdded} />
      )}
      {linkingDoc && (
        <div className="modal-overlay" onClick={() => setLinkingDoc(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>Vincular albarán</span>
              <button className="modal-close" onClick={() => setLinkingDoc(false)}>✕</button>
            </div>
            <div style={{ padding: '12px 0', maxHeight: 360, overflowY: 'auto' }}>
              {documents.length === 0
                ? <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No hay albaranes completados</div>
                : documents.map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => handleLinkDoc(doc.id)}
                    style={{ padding: '10px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.original_filename}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{doc.supplier_name} · {new Date(doc.created_at).toLocaleDateString('es-ES')}</div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
