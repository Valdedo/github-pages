import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Check, Pencil, Trash2, Package, FileText, Link, RotateCcw, Phone, ShoppingCart, HandCoins, Unlink } from 'lucide-react';
import { getOrder, updateOrder, addOrderLine, updateOrderLine, deleteOrderLine, deleteOrder, listDocuments, describeApiError } from '../api/client';
import { useConfirm } from '../components/ConfirmModal';
import { useCfToast } from '../components/CfToast';
import { BotonWhatsApp, textoPedido, leerImporte, leerCantidad, fmtEur } from '../components/AvisoCliente';
import { PEDIDO_ESTADO } from '../lib/estados';
import { fechaES } from '../lib/texto';
import { mensajeError } from '../lib/descargas';
import { ES_MANUAL } from '../lib/proveedor';
import type { SupplierOrder, SupplierOrderLine, DocumentListItem, OrderStatus } from '../types';

const STATUS_LABELS: Record<string, string> = PEDIDO_ESTADO;
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const STATUS_PREV: Record<string, { status: OrderStatus; label: string } | null> = {
  pendiente: null,
  pedido:    { status: 'pendiente', label: 'Volver a «Por pedir»' },
  parcial:   { status: 'pedido',    label: 'Deshacer lo recibido' },
  recibido:  { status: 'pedido',    label: 'Deshacer lo recibido' },
  entregado: { status: 'recibido',  label: 'Deshacer entrega' },
  cancelado: { status: 'pendiente', label: 'Recuperar el pedido' },
};

const fmtFecha = (d?: string | null) => fechaES(d ? d.split('T')[0] : d);
const cant = (n: number) => String(n).replace('.', ',');

// ─── Pasos ────────────────────────────────────────────────────────────────────

const PASOS = [
  { key: 'pendiente', label: PEDIDO_ESTADO.pendiente },
  { key: 'pedido',    label: PEDIDO_ESTADO.pedido },
  { key: 'recibido',  label: PEDIDO_ESTADO.recibido },
  { key: 'entregado', label: PEDIDO_ESTADO.entregado },
];

function Pasos({ status, recibidas, total }: { status: string; recibidas: number; total: number }) {
  if (status === 'cancelado') return <div className="doc-aviso error">Este pedido está cancelado.</div>;
  const idx = ({ pendiente: 0, pedido: 1, parcial: 2, recibido: 2, entregado: 4 } as Record<string, number>)[status] ?? 0;
  const parcial = status === 'parcial';
  return (
    <div className="pasos">
      {PASOS.map((p, i) => (
        <div key={p.key} className={`paso${i < idx ? ' hecho' : ''}${i === idx || (idx === 4 && i === 3) ? ' actual' : ''}${parcial && i === 2 ? ' medio' : ''}`}>
          <span className="paso-bola">{i < idx ? '✓' : i + 1}</span>
          <span className="paso-txt">{parcial && i === 2 ? `${PEDIDO_ESTADO.parcial} ${recibidas}/${total}` : p.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Editar datos del pedido ─────────────────────────────────────────────────

function EditarPedidoModal({ order, onClose, onSaved }: { order: SupplierOrder; onClose: () => void; onSaved: (o: SupplierOrder) => void }) {
  const [f, setF] = useState({
    client_name: order.client_name ?? '',
    client_phone: order.client_phone ?? '',
    supplier_name: order.supplier_name ?? '',
    reference: order.reference ?? '',
    order_date: (order.order_date || '').split('T')[0],
    expected_date: (order.expected_date || '').split('T')[0],
    notes: order.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.client_name.trim()) { setError('Falta el nombre del cliente'); return; }
    if (f.expected_date && f.order_date && f.expected_date < f.order_date) { setError('La llegada prevista no puede ser antes de la fecha del pedido'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await updateOrder(order.id, {
        client_name: f.client_name.trim(),
        client_phone: f.client_phone.trim() || null,
        supplier_name: f.supplier_name.trim() || null,
        reference: f.reference.trim() || null,
        order_date: f.order_date || undefined,
        expected_date: f.expected_date || null,
        notes: f.notes.trim() || null,
      });
      onSaved(data);
    } catch (err) {
      setError(`No se pudo guardar: ${mensajeError(err, describeApiError(err))}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="modal rep-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>Datos del pedido</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={guardar}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
            {error && <div className="doc-aviso error" role="alert">{error}</div>}
            <div className="campos-2">
              <div>
                <label className="form-label">Cliente *</label>
                <input className="form-input" value={f.client_name} onChange={set('client_name')} autoFocus />
              </div>
              <div>
                <label className="form-label">Teléfono (para avisarle)</label>
                <input className="form-input" type="tel" value={f.client_phone} onChange={set('client_phone')} placeholder="666 123 456" />
              </div>
              <div>
                <label className="form-label">Proveedor</label>
                <input className="form-input" value={f.supplier_name} onChange={set('supplier_name')} />
              </div>
              <div>
                <label className="form-label">Referencia / n.º de pedido</label>
                <input className="form-input" value={f.reference} onChange={set('reference')} />
              </div>
              <div>
                <label className="form-label">Fecha del pedido</label>
                <input className="form-input" type="date" value={f.order_date} onChange={set('order_date')} />
              </div>
              <div>
                <label className="form-label">Llegada prevista</label>
                <input className="form-input" type="date" value={f.expected_date} min={f.order_date || undefined} onChange={set('expected_date')} />
              </div>
            </div>
            <div>
              <label className="form-label">Notas</label>
              <textarea className="form-input" rows={2} value={f.notes} onChange={set('notes')} style={{ resize: 'vertical' }} />
            </div>
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

// ─── Editar / añadir artículo ────────────────────────────────────────────────

function LineaModal({ orderId, line, orderSupplierName, onClose, onSaved, onDelete }: {
  orderId: number;
  line: SupplierOrderLine | null;
  orderSupplierName?: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [desc, setDesc]         = useState(line?.descripcion ?? '');
  const [qty, setQty]           = useState(line ? cant(line.cantidad) : '1');
  const [price, setPrice]       = useState(line?.precio_unitario != null ? cant(line.precio_unitario) : '');
  const [received, setReceived] = useState(line ? cant(line.cantidad_recibida) : '0');
  const [supplier, setSupplier] = useState(line?.supplier_name ?? '');
  const [notes, setNotes]       = useState(line?.notes ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const lq = leerCantidad(qty), lp = leerImporte(price), lr = leerImporte(received);
  const qtyNum = lq.ok ? lq.n : null, priceNum = lp.ok ? lp.n : null, recNum = lr.ok ? lr.n ?? 0 : 0;

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) { setError('Falta qué artículo es'); return; }
    if (!lq.ok) { setError(`Cantidad: ${lq.error}`); return; }
    if (!lp.ok) { setError(`Precio: ${lp.error}`); return; }
    if (line && !lr.ok) { setError(`Han llegado: ${lr.error}`); return; }
    if (line && qtyNum != null && recNum > qtyNum) { setError(`No pueden haber llegado más (${received}) de las pedidas (${qty})`); return; }
    setSaving(true); setError('');
    try {
      const datos = {
        descripcion: desc.trim(),
        precio_unitario: priceNum ?? undefined,
        supplier_name: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (line) await updateOrderLine(orderId, line.id, { ...datos, cantidad: qtyNum as number, cantidad_recibida: Math.max(0, Math.min(recNum, qtyNum as number)) });
      else await addOrderLine(orderId, { ...datos, cantidad: qtyNum as number });
      onSaved();
    } catch (err) {
      setError(`No se pudo guardar: ${mensajeError(err, describeApiError(err))}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="modal rep-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>{line ? 'Artículo del pedido' : 'Añadir artículo'}</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handle}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div className="doc-aviso error" role="alert">{error}</div>}
            <div>
              <label className="form-label">Artículo *</label>
              <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Nombre del artículo" autoFocus={!line} />
            </div>
            <div className="campos-2">
              <div>
                <label className="form-label">Cantidad pedida</label>
                <input className="form-input" type="text" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Precio unidad (€)</label>
                <input className="form-input" type="text" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            {line && (
              <div>
                <label className="form-label">¿Cuántas han llegado?</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="form-input" type="text" inputMode="decimal" value={received} onChange={e => setReceived(e.target.value)} style={{ maxWidth: 110, margin: 0 }} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReceived('0')}>Ninguna</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReceived(qty)}>Todas</button>
                </div>
                {recNum > 0 && qtyNum != null && recNum < qtyNum && (
                  <small style={{ color: 'var(--text-3)' }}>Faltan {cant(+(qtyNum - recNum).toFixed(2))}</small>
                )}
              </div>
            )}
            <div>
              <label className="form-label">Proveedor (si es otro)</label>
              <input className="form-input" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder={orderSupplierName || 'A quién se pide'} />
            </div>
            <div>
              <label className="form-label">Notas</label>
              <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Color, medida…" />
            </div>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            {line && onDelete && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={onDelete}>
                <Trash2 size={14} /> Quitar
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : line ? 'Guardar' : 'Añadir'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const { toast, show } = useCfToast();
  const [order, setOrder]           = useState<SupplierOrder | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [editingLine, setEditingLine] = useState<SupplierOrderLine | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [editando, setEditando]     = useState(false);
  const [linkingDoc, setLinkingDoc] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [documents, setDocuments]   = useState<DocumentListItem[]>([]);
  const [tocando, setTocando]       = useState<number | null>(null);

  const load = useCallback((quiet = false) => {
    if (!id) return Promise.resolve();
    if (!quiet) setLoading(true);
    return getOrder(parseInt(id))
      .then(({ data }) => { setOrder(data); setError(''); })
      .catch(err => setError(describeApiError(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /** Un toque: llegó todo lo de esta línea ↔ no ha llegado. */
  const toggleLinea = async (line: SupplierOrderLine) => {
    if (!order || tocando) return;
    const llego = line.cantidad_recibida >= line.cantidad;
    const nuevo = llego ? 0 : line.cantidad;
    setTocando(line.id);
    setOrder(o => o ? { ...o, lines: o.lines.map(l => l.id === line.id ? { ...l, cantidad_recibida: nuevo } : l) } : o);
    try {
      await updateOrderLine(order.id, line.id, { cantidad_recibida: nuevo });
      await load(true);
      show(llego ? `${line.descripcion}: sin recibir` : `${line.descripcion}: recibido`, {
        undo: async () => {
          try { await updateOrderLine(order.id, line.id, { cantidad_recibida: line.cantidad_recibida }); }
          catch (err) { show(`No se pudo deshacer: ${mensajeError(err, 'error')}`, { error: true }); }
          await load(true);
        },
      });
    } catch (err) {
      show(`No se pudo guardar: ${describeApiError(err)}`, { error: true });
      load(true);
    } finally { setTocando(null); }
  };

  const cambiarEstado = async (status: OrderStatus, texto: string) => {
    if (!order) return;
    const antes = order.status;
    const fechaAntes = order.order_date;
    const recibidasAntes = order.lines.map(l => [l.id, l.cantidad_recibida] as const);
    // Al marcarlo como pedido, la fecha del pedido pasa a ser hoy
    const extra = status === 'pedido' && antes === 'pendiente' ? { order_date: hoyISO() } : {};
    try {
      setOrder((await updateOrder(order.id, { status, ...extra })).data);
      show(texto, {
        undo: async () => {
          try {
            await updateOrder(order.id, { status: antes, ...(extra.order_date ? { order_date: fechaAntes } : {}) });
            // Devuelve las cantidades recibidas tal como estaban
            await Promise.all(recibidasAntes.map(([lid, c]) => updateOrderLine(order.id, lid, { cantidad_recibida: c })));
            if (antes === 'pedido' || antes === 'pendiente' || antes === 'entregado') await updateOrder(order.id, { status: antes });
          } catch (err) {
            show(`No se pudo deshacer del todo: ${mensajeError(err, 'error')}`, { error: true });
          }
          await load(true);
        },
      });
    } catch (err) {
      show(`No se pudo cambiar: ${describeApiError(err)}`, { error: true });
    }
  };

  const handleRevert = async () => {
    if (!order) return;
    const prev = STATUS_PREV[order.status];
    if (!prev) return;
    const ok = await confirm({ title: 'Cambiar estado', message: `¿${prev.label}?`, confirmLabel: 'Sí, cambiar' });
    if (!ok) return;
    try { setOrder((await updateOrder(order.id, { status: prev.status })).data); }
    catch (err) { show(`No se pudo cambiar: ${describeApiError(err)}`, { error: true }); }
  };

  const quitarLinea = async (line: SupplierOrderLine) => {
    if (!order) return;
    const ok = await confirm({ title: 'Quitar artículo', message: `¿Quitar «${line.descripcion}» del pedido?`, confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    try {
      await deleteOrderLine(order.id, line.id);
      setEditingLine(null);
      load(true);
    } catch (err) {
      show(`No se pudo quitar: ${describeApiError(err)}`, { error: true });
    }
  };

  const avisado = async () => {
    if (!order) return;
    try { const { data } = await updateOrder(order.id, { aviso_at: new Date().toISOString() }); setOrder(o => o ? { ...o, aviso_at: data.aviso_at } : o); }
    catch { /* WhatsApp ya se abrió */ }
  };

  const handleLinkDoc = async (docId: number) => {
    if (!order) return;
    try {
      await updateOrder(order.id, { document_id: docId });
      setLinkingDoc(false);
      show('Albarán vinculado al pedido');
      load(true);
    } catch (err) {
      show(`No se pudo vincular: ${mensajeError(err, describeApiError(err))}`, { error: true });
    }
  };

  const desvincular = async () => {
    if (!order?.document_id) return;
    const docAntes = order.document_id;
    try {
      setOrder((await updateOrder(order.id, { document_id: null })).data);
      show('Albarán desvinculado', {
        undo: async () => {
          try { setOrder((await updateOrder(order.id, { document_id: docAntes })).data); }
          catch (err) { show(`No se pudo deshacer: ${mensajeError(err, 'error')}`, { error: true }); }
        },
      });
    } catch (err) {
      show(`No se pudo desvincular: ${mensajeError(err, describeApiError(err))}`, { error: true });
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    const ok = await confirm({
      title: '¿Cancelar el pedido?',
      message: 'Se queda en el historial como «Cancelado» (por ejemplo, si el cliente ya no lo quiere) y se puede recuperar. «Borrar» en cambio lo quita del todo.',
      confirmLabel: 'Sí, cancelar el pedido', cancelLabel: 'No', danger: true,
    });
    if (!ok) return;
    cambiarEstado('cancelado', 'Pedido cancelado');
  };

  const handleDeleteOrder = async () => {
    if (!order) return;
    const ok = await confirm({
      title: '¿Borrar el pedido?',
      message: 'Se borra del todo y no se puede recuperar. Si solo es que el cliente ya no lo quiere, mejor «Cancelar el pedido» (queda en el historial).',
      confirmLabel: 'Sí, borrarlo', cancelLabel: 'No', danger: true,
    });
    if (!ok) return;
    try {
      await deleteOrder(order.id);
      navigate('/pedidos');
    } catch (err) {
      show(`No se pudo borrar: ${describeApiError(err)}`, { error: true });
    }
  };

  const [docsError, setDocsError] = useState('');
  const openLinkModal = async () => {
    setLinkingDoc(true);
    setLoadingDocs(true);
    setDocsError('');
    try {
      const { data } = await listDocuments();
      setDocuments(data.filter(d => d.status === 'completed' && !ES_MANUAL(d.supplier_name)));
    } catch (err) {
      setDocuments([]);
      setDocsError(`No se pudieron cargar los albaranes: ${mensajeError(err, describeApiError(err))}`);
    } finally {
      setLoadingDocs(false);
    }
  };

  if (loading) return <div className="page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Cargando…</div>;
  if (!order)  return <div className="page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>{error || 'Pedido no encontrado'}</div>;

  const totalLines    = order.lines.length;
  const totalReceived = order.lines.filter(l => l.cantidad_recibida >= l.cantidad).length;
  const totalPending  = totalLines - totalReceived;
  const canEdit = order.status !== 'cancelado';
  const puedeRecibir = canEdit && order.status !== 'entregado';
  const prev = STATUS_PREV[order.status];
  const totalImporte = order.lines.reduce((s, l) => s + (l.precio_unitario ?? 0) * l.cantidad, 0);

  return (
    <div className="page pedido-detalle">
      {ConfirmDialog}
      {toast}

      <div className="pedido-head">
        <div style={{ flex: '1 1 100%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="doc-volver" onClick={() => navigate('/pedidos')}><ArrowLeft size={16} /> Pedidos</button>
            <h1>{order.client_name || '—'}</h1>
            <span className={`status-chip ${order.status}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
            {canEdit && (
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEditando(true)}>
                <Pencil size={14} /> Editar datos
              </button>
            )}
          </div>
          <div className="pedido-sub">
            {order.client_phone && <a href={`tel:${order.client_phone}`}><Phone size={15} /> {order.client_phone}</a>}
            {order.supplier_name && <span><ShoppingCart size={15} /> {order.supplier_name}</span>}
            {order.reference && <span className="pedido-ref">{order.reference}</span>}
            {order.status !== 'pendiente' && <span>Pedido el {fmtFecha(order.order_date)}</span>}
            {order.expected_date && !order.received_date && <span>Llegada prevista {fmtFecha(order.expected_date)}</span>}
            {order.received_date && <span>Llegó el {fmtFecha(order.received_date)}</span>}
          </div>
        </div>
      </div>

      {/* ── Estado y siguiente paso ── */}
      <div className="card seccion" style={{ marginTop: 12 }}>
        <Pasos status={order.status} recibidas={totalReceived} total={totalLines} />

        {order.status === 'recibido' && (
          <div className="rep-lista">
            <BotonWhatsApp
              telefono={order.client_phone}
              texto={textoPedido(order.client_name, order.lines.map(l => l.descripcion))}
              avisadoEl={order.aviso_at}
              onAvisado={avisado}
            />
          </div>
        )}

        <div className="rep-acciones">
          {order.status === 'pendiente' && (
            <button className="btn btn-primary btn-lg" onClick={() => cambiarEstado('pedido', 'Marcado como pedido')}>
              <Check size={18} /> Ya lo he pedido al proveedor
            </button>
          )}
          {(order.status === 'pedido' || order.status === 'parcial') && totalPending > 0 && (
            <>
              <span className="pedido-pista">Cuando llegue, toca cada artículo abajo.</span>
              <button className="btn btn-primary btn-lg" onClick={() => cambiarEstado('recibido', 'Todo recibido')}>
                <Package size={18} /> Ha llegado todo
              </button>
            </>
          )}
          {order.status === 'recibido' && (
            <button className="btn btn-ghost btn-lg" onClick={() => cambiarEstado('entregado', 'Pedido entregado al cliente')}>
              <HandCoins size={18} /> Se lo ha llevado el cliente
            </button>
          )}
          {order.status === 'entregado' && <span className="rep-hecha">✓ Entregado al cliente</span>}
          {prev && (
            <button className="btn btn-ghost btn-sm" onClick={handleRevert} style={{ color: 'var(--text-3)' }}>
              <RotateCcw size={14} /> {prev.label}
            </button>
          )}
        </div>
      </div>

      {/* ── Artículos ── */}
      <div className="card pedido-lineas">
        <div className="pedido-lineas-head">
          <span><Package size={16} /> Artículos <small>{totalReceived}/{totalLines} recibidos</small></span>
          {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setAddingLine(true)}><Plus size={14} /> Añadir</button>}
        </div>

        {order.lines.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>Este pedido no tiene artículos</div>
        ) : order.lines.map(line => {
          const done    = line.cantidad_recibida >= line.cantidad;
          const partial = line.cantidad_recibida > 0 && !done;
          return (
            <div key={line.id} className={`pedido-linea${done ? ' llego' : ''}${partial ? ' medio' : ''}`}>
              <button className="pedido-check" disabled={!puedeRecibir || tocando === line.id}
                onClick={() => toggleLinea(line)}
                aria-pressed={done}
                aria-label={done ? `${line.descripcion}: recibido. Toca para desmarcar` : `Marcar ${line.descripcion} como recibido`}>
                {done ? <Check size={22} strokeWidth={3} /> : partial ? <span className="carga-medio" aria-hidden="true" /> : null}
              </button>
              <button className="pedido-linea-txt" onClick={() => canEdit && setEditingLine(line)} disabled={!canEdit}>
                <b>{line.descripcion}</b>
                <small>
                  {cant(line.cantidad)} ud
                  {partial && ` · han llegado ${cant(line.cantidad_recibida)}`}
                  {line.precio_unitario != null && ` · ${fmtEur(line.precio_unitario)}/ud`}
                  {line.supplier_name && ` · ${line.supplier_name}`}
                  {line.notes && ` · ${line.notes}`}
                </small>
              </button>
              {canEdit && (
                <button className="btn btn-ghost btn-sm pedido-lapiz" onClick={() => setEditingLine(line)} aria-label={`Editar ${line.descripcion}`}>
                  <Pencil size={15} />
                </button>
              )}
            </div>
          );
        })}
        {totalImporte > 0 && (
          <div className="pedido-total">Total aproximado: <b>{fmtEur(totalImporte)}</b></div>
        )}
      </div>

      {order.notes && (
        <div className="card seccion" style={{ marginTop: 12 }}>
          <div className="seccion-titulo">Notas</div>
          <div style={{ fontSize: 15, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{order.notes}</div>
        </div>
      )}

      {order.document_id && (
        <div className="pedido-albaran">
          <FileText size={16} /> Albarán del proveedor vinculado
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/documento/${order.document_id}`)}>Ver albarán</button>
          <button className="btn btn-ghost btn-sm" onClick={desvincular} style={{ color: 'var(--text-3)' }}><Unlink size={14} /> Desvincular</button>
        </div>
      )}

      <details className="mas-opciones pedido-mas" style={{ marginTop: 16 }}>
        <summary>Más opciones</summary>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button className="btn btn-ghost" onClick={openLinkModal}><Link size={16} /> {order.document_id ? 'Cambiar el albarán vinculado' : 'Vincular albarán del proveedor'}</button>
          {order.status !== 'cancelado' && order.status !== 'entregado' && (
            <button className="btn btn-ghost" onClick={handleCancelOrder}>Cancelar el pedido</button>
          )}
          <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={handleDeleteOrder}>
            <Trash2 size={15} /> Borrar pedido
          </button>
        </div>
        <p className="pedido-mas-nota"><b>Cancelar</b>: el pedido queda en el historial y se puede recuperar. <b>Borrar</b>: desaparece del todo.</p>
      </details>

      {editando && (
        <EditarPedidoModal order={order} onClose={() => setEditando(false)}
          onSaved={o => { setOrder(o); setEditando(false); show('Datos guardados'); }} />
      )}
      {editingLine && (
        <LineaModal orderId={order.id} line={editingLine} orderSupplierName={order.supplier_name}
          onClose={() => setEditingLine(null)}
          onSaved={() => { setEditingLine(null); load(true); }}
          onDelete={() => quitarLinea(editingLine)} />
      )}
      {addingLine && (
        <LineaModal orderId={order.id} line={null} orderSupplierName={order.supplier_name}
          onClose={() => setAddingLine(false)}
          onSaved={() => { setAddingLine(false); load(true); }} />
      )}
      {linkingDoc && (
        <div className="modal-overlay" onClick={() => setLinkingDoc(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>Vincular albarán del proveedor</span>
              <button className="modal-close" onClick={() => setLinkingDoc(false)} aria-label="Cerrar">✕</button>
            </div>
            <div style={{ padding: '12px 0', maxHeight: 360, overflowY: 'auto' }}>
              {loadingDocs ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Cargando albaranes…</div>
              ) : docsError ? (
                <div className="doc-aviso error" style={{ margin: 16 }}>{docsError}</div>
              ) : documents.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>No hay albaranes leídos</div>
                : documents.map(doc => (
                  <button key={doc.id} className="vincular-doc" onClick={() => handleLinkDoc(doc.id)}>
                    <b>{doc.supplier_name || doc.original_filename}</b>
                    <small>{[doc.doc_number && `N.º ${doc.doc_number}`, fechaES(doc.doc_date || doc.created_at)].filter(Boolean).join(' · ')}</small>
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
