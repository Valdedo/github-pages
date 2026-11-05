/** Ficha de un pedido, versión nueva (nov. 2026, «En pruebas»). Ver `lib/encargosNuevo.ts`. */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, MessageCircle, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { getOrder, updateOrder, updateOrderLine, deleteOrderLine, deleteOrder, listDocuments, describeApiError } from '../api/client';
import { useConfirm } from '../components/ConfirmModal';
import { useCfToast } from '../components/CfToast';
import { fmtEur, telWhatsApp, textoPedido } from '../components/AvisoCliente';
import { EncAhora, EncDatos, EncFichaCab, EncLinea, type Hito } from '../components/Encargos';
import { EditarPedidoModal, LineaModal } from './OrderDetailPage';
import { cuando, diasDesde, hoyISO } from '../lib/encargosNuevo';
import { fechaES } from '../lib/texto';
import { mensajeError } from '../lib/descargas';
import { ES_MANUAL } from '../lib/proveedor';
import type { DocumentListItem, OrderStatus, SupplierOrder, SupplierOrderLine } from '../types';

const cant = (n: number) => String(n).replace('.', ',');
const ESTADO: Record<OrderStatus, [string, 'bien' | 'pend' | 'mal' | 'gris']> = {
  pendiente: ['Por pedir', 'pend'], pedido: ['Esperando al proveedor', 'gris'], parcial: ['Llegando', 'gris'],
  recibido: ['Ha llegado', 'bien'], entregado: ['Entregado', 'bien'], cancelado: ['Cancelado', 'mal'],
};
const ATRAS: Partial<Record<OrderStatus, [OrderStatus, string]>> = {
  pedido: ['pendiente', 'No, aún no está pedido'],
  parcial: ['pedido', 'Deshacer lo que llegó'],
  recibido: ['pedido', 'No, aún no ha llegado'],
  entregado: ['recibido', 'No, aún no se lo llevó'],
};

export function PedidoFicha() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const { toast, show } = useCfToast();
  const [o, setO] = useState<SupplierOrder | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [linea, setLinea] = useState<SupplierOrderLine | 'nueva' | null>(null);
  const [docs, setDocs] = useState<DocumentListItem[] | null>(null);

  const cargar = useCallback(() => {
    if (!id) return Promise.resolve();
    return getOrder(Number(id)).then(({ data }) => { setO(data); setError(''); })
      .catch(e => setError(describeApiError(e))).finally(() => setCargando(false));
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <div className="page enc-cargando">Cargando…</div>;
  if (!o) return <div className="page enc-cargando">{error || 'Pedido no encontrado'}</div>;

  const total = o.lines.length;
  const llegadas = o.lines.filter(l => l.cantidad_recibida >= l.cantidad).length;
  const prov = o.supplier_name && !ES_MANUAL(o.supplier_name) ? o.supplier_name : '';
  const retraso = o.expected_date && (o.status === 'pedido' || o.status === 'parcial') ? diasDesde(o.expected_date) : 0;
  const editable = o.status !== 'cancelado';
  const puedeRecibir = editable && o.status !== 'entregado' && o.status !== 'pendiente';
  const importe = o.lines.reduce((s, l) => s + (l.precio_unitario ?? 0) * l.cantidad, 0);
  const [estado, tono] = o.status === 'recibido' && !o.aviso_at ? ['Avisar al cliente', 'pend' as const]
    : o.status === 'recibido' ? ['Para recoger', 'bien' as const]
    : retraso > 0 ? [`Retrasado ${retraso} día${retraso !== 1 ? 's' : ''}`, 'mal' as const] : ESTADO[o.status];

  /** Cambia el estado con «Deshacer» (devuelve también lo recibido de cada artículo). */
  const cambiar = async (status: OrderStatus, texto: string) => {
    if (ocupado) return;
    setOcupado(true);
    const antes = o;
    try {
      setO((await updateOrder(o.id, { status, ...(status === 'pedido' && o.status === 'pendiente' ? { order_date: hoyISO() } : {}) })).data);
      show(texto, {
        undo: async () => {
          try {
            await updateOrder(o.id, { status: antes.status, order_date: antes.order_date });
            await Promise.all(antes.lines.map(l => updateOrderLine(o.id, l.id, { cantidad_recibida: l.cantidad_recibida })));
            await updateOrder(o.id, { status: antes.status });
          } catch (e) { show(`No se pudo deshacer del todo: ${mensajeError(e, 'error')}`, { error: true }); }
          cargar();
        },
      });
    } catch (e) {
      show(`No se pudo guardar: ${mensajeError(e, describeApiError(e))}`, { error: true });
    } finally { setTimeout(() => setOcupado(false), 600); }
  };

  const avisado = async (abrioWhatsApp: boolean) => {
    try {
      const { data } = await updateOrder(o.id, { aviso_at: new Date().toISOString() });
      setO(x => (x ? { ...x, aviso_at: data.aviso_at } : x));
      if (!abrioWhatsApp) show('Apuntado como avisado', {
        undo: async () => { await updateOrder(o.id, { aviso_at: null }).catch(() => null); cargar(); },
      });
    } catch { /* WhatsApp ya se abrió */ }
  };

  const tocarLinea = async (l: SupplierOrderLine) => {
    const llego = l.cantidad_recibida >= l.cantidad;
    setO(x => (x ? { ...x, lines: x.lines.map(y => (y.id === l.id ? { ...y, cantidad_recibida: llego ? 0 : l.cantidad } : y)) } : x));
    try {
      await updateOrderLine(o.id, l.id, { cantidad_recibida: llego ? 0 : l.cantidad });
      await cargar();
      show(`${l.descripcion}: ${llego ? 'sin llegar' : 'llegó'}`, {
        undo: async () => { await updateOrderLine(o.id, l.id, { cantidad_recibida: l.cantidad_recibida }).catch(() => null); cargar(); },
      });
    } catch (e) { show(`No se pudo guardar: ${describeApiError(e)}`, { error: true }); cargar(); }
  };

  const atras = ATRAS[o.status];
  const volverAtras = async () => {
    if (!atras) return;
    if (!(await confirm({ title: 'Volver un paso atrás', message: `¿${atras[1]}?`, confirmLabel: 'Sí' }))) return;
    cambiar(atras[0], 'Vuelto un paso atrás');
  };

  const wa = telWhatsApp(o.client_phone);
  const textoWa = textoPedido(o.client_name, o.lines.map(l => l.descripcion));

  // ── Lo que toca ahora ──
  let ahora: React.ReactNode;
  if (o.status === 'pendiente') {
    ahora = (
      <EncAhora texto={prov ? `Pedírselo a ${prov}.` : 'Pedirlo al proveedor (aún no tiene proveedor puesto).'}>
        <button className="btn btn-primary btn-lg" disabled={ocupado} onClick={() => cambiar('pedido', 'Marcado como pedido')}>
          <Check size={18} /> Ya lo he pedido
        </button>
        {!prov && <button className="btn btn-ghost" onClick={() => setEditando(true)}>Poner proveedor</button>}
      </EncAhora>
    );
  } else if (o.status === 'pedido' || o.status === 'parcial') {
    ahora = (
      <EncAhora texto={o.status === 'parcial' ? `Han llegado ${llegadas} de ${total}. Marca abajo lo que llegue.` : 'Esperando a que llegue. Si llega por partes, marca abajo cada artículo.'}
        atras={<button className="btn btn-ghost btn-sm" onClick={volverAtras}><RotateCcw size={14} /> {atras?.[1]}</button>}>
        <button className="btn btn-primary btn-lg" disabled={ocupado} onClick={() => cambiar('recibido', 'Ha llegado todo')}>
          {o.status === 'parcial' ? 'Ha llegado el resto' : 'Ha llegado todo'}
        </button>
      </EncAhora>
    );
  } else if (o.status === 'recibido' && !o.aviso_at) {
    ahora = (
      <EncAhora texto={wa ? 'Ha llegado. Avisa al cliente.' : 'Ha llegado. Falta el teléfono del cliente para avisarle.'}
        atras={<button className="btn btn-ghost btn-sm" onClick={volverAtras}><RotateCcw size={14} /> {atras?.[1]}</button>}>
        {wa ? (
          <a className="btn wa-btn btn-lg" target="_blank" rel="noopener noreferrer" onClick={() => avisado(true)}
            href={`https://wa.me/${wa}?text=${encodeURIComponent(textoWa)}`}>
            <MessageCircle size={18} /> Avisar por WhatsApp
          </a>
        ) : <button className="btn btn-primary btn-lg" onClick={() => setEditando(true)}>Poner el teléfono</button>}
        <button className="enc-link" onClick={() => avisado(false)}>Ya le avisé de otra forma</button>
      </EncAhora>
    );
  } else if (o.status === 'recibido') {
    ahora = (
      <EncAhora texto={`Avisado ${cuando(o.aviso_at)}. Cuando pase a recogerlo:`}
        atras={<button className="btn btn-ghost btn-sm" onClick={volverAtras}><RotateCcw size={14} /> {atras?.[1]}</button>}>
        <button className="btn btn-primary btn-lg" disabled={ocupado} onClick={() => cambiar('entregado', 'Entregado al cliente')}>
          <Check size={18} /> Se lo llevó
        </button>
        {wa && <a className="enc-link" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}?text=${encodeURIComponent(textoWa)}`}>Volver a avisar</a>}
      </EncAhora>
    );
  } else if (o.status === 'entregado') {
    ahora = <EncAhora texto="✓ Entregado al cliente." atras={<button className="btn btn-ghost btn-sm" onClick={volverAtras}><RotateCcw size={14} /> {atras?.[1]}</button>} />;
  } else {
    ahora = (
      <EncAhora texto="Este pedido está cancelado.">
        <button className="btn btn-ghost" onClick={() => cambiar('pendiente', 'Pedido recuperado')}>Recuperar el pedido</button>
      </EncAhora>
    );
  }

  const pasado = (s: OrderStatus) => ['pedido', 'parcial', 'recibido', 'entregado'].indexOf(o.status) >= ['pedido', 'parcial', 'recibido', 'entregado'].indexOf(s);
  const hitos: Hito[] = o.status === 'cancelado' ? [{ texto: 'Apuntado', cuando: cuando(o.created_at), hecho: true }, { texto: 'Cancelado', hecho: true }] : [
    { texto: 'Apuntado', cuando: cuando(o.created_at), hecho: true },
    { texto: o.status !== 'pendiente' ? (prov ? `Pedido a ${prov}` : 'Pedido al proveedor') : (prov ? `Pedir a ${prov}` : 'Pedir al proveedor'), cuando: o.status !== 'pendiente' ? cuando(o.order_date) : '', hecho: o.status !== 'pendiente', ahora: o.status === 'pendiente' },
    { texto: o.status === 'parcial' ? `Llegando (${llegadas} de ${total})` : pasado('recibido') ? 'Llegó' : 'Que llegue',
      cuando: o.received_date ? cuando(o.received_date) : o.expected_date && !pasado('recibido') ? `previsto ${cuando(o.expected_date)}` : '',
      hecho: pasado('recibido'), ahora: o.status === 'pedido' || o.status === 'parcial' },
    { texto: o.aviso_at || o.status === 'entregado' ? 'Avisado el cliente' : 'Avisar al cliente', cuando: o.aviso_at ? cuando(o.aviso_at) : '', hecho: !!o.aviso_at || o.status === 'entregado', ahora: o.status === 'recibido' && !o.aviso_at },
    { texto: o.status === 'entregado' ? 'Se lo llevó' : 'Que lo recoja', hecho: o.status === 'entregado', ahora: o.status === 'recibido' && !!o.aviso_at },
  ];

  const abrirDocs = async () => {
    setDocs([]);
    try { const { data } = await listDocuments(); setDocs(data.filter(d => d.status === 'completed' && !ES_MANUAL(d.supplier_name))); }
    catch (e) { setDocs(null); show(`No se pudieron cargar los albaranes: ${mensajeError(e, describeApiError(e))}`, { error: true }); }
  };
  const vincular = async (docId: number | null) => {
    try { setO((await updateOrder(o.id, { document_id: docId })).data); setDocs(null); show(docId ? 'Albarán vinculado' : 'Albarán desvinculado'); }
    catch (e) { show(`No se pudo guardar: ${mensajeError(e, describeApiError(e))}`, { error: true }); }
  };
  const cancelar = async () => {
    if (await confirm({ title: '¿Cancelar el pedido?', message: 'Queda en «Entregados y cancelados» y se puede recuperar.', confirmLabel: 'Sí, cancelar', cancelLabel: 'No', danger: true })) cambiar('cancelado', 'Pedido cancelado');
  };
  const borrar = async () => {
    if (!(await confirm({ title: '¿Borrar el pedido?', message: 'Desaparece del todo y no se puede recuperar. Si el cliente ya no lo quiere, mejor «Cancelar».', confirmLabel: 'Sí, borrar', cancelLabel: 'No', danger: true }))) return;
    try { await deleteOrder(o.id); navigate('/pedidos'); } catch (e) { show(`No se pudo borrar: ${describeApiError(e)}`, { error: true }); }
  };

  return (
    <div className="page enc-ficha">
      {ConfirmDialog}
      {toast}
      <EncFichaCab volver="Pedidos" onVolver={() => navigate('/pedidos')} cliente={o.client_name} telefono={o.client_phone}
        estado={estado} tono={tono} onEditar={editable ? () => setEditando(true) : undefined} />
      {ahora}

      <div className="enc-ficha-cuerpo">
        <EncLinea hitos={hitos} />
        <div>
          <div className="enc-bloque">
            <h2>
              <span>Artículos {puedeRecibir && total > 1 && <small style={{ fontWeight: 500, color: 'var(--text-3)' }}>· han llegado {llegadas} de {total}</small>}</span>
              {editable && <button className="btn btn-ghost btn-sm" onClick={() => setLinea('nueva')}><Plus size={14} /> Añadir</button>}
            </h2>
            <div className="enc-filas">
              {o.lines.length === 0 && <div className="enc-art"><span className="enc-est">Sin artículos</span></div>}
              {o.lines.map(l => {
                const si = l.cantidad_recibida >= l.cantidad;
                const medio = l.cantidad_recibida > 0 && !si;
                return (
                  <div key={l.id} className={`enc-art${si && puedeRecibir ? ' llego' : ''}`}>
                    {puedeRecibir && (
                      <button className={`enc-art-check${si ? ' si' : medio ? ' medio' : ''}`} onClick={() => tocarLinea(l)}
                        aria-pressed={si} aria-label={si ? `${l.descripcion}: llegó. Toca para desmarcar` : `Marcar que llegó ${l.descripcion}`}>
                        {si ? <Check size={20} strokeWidth={3} /> : medio ? '½' : null}
                      </button>
                    )}
                    <button className="enc-art-txt" onClick={() => editable && setLinea(l)} disabled={!editable}>
                      <b>{cant(l.cantidad) !== '1' && `${cant(l.cantidad)} × `}{l.descripcion}</b>
                      {(medio || l.precio_unitario != null || l.supplier_name || l.notes) && (
                        <small>{[medio && `han llegado ${cant(l.cantidad_recibida)}`, l.precio_unitario != null && `${fmtEur(l.precio_unitario)}/ud`, l.supplier_name, l.notes].filter(Boolean).join(' · ')}</small>
                      )}
                    </button>
                  </div>
                );
              })}
              {importe > 0 && <div className="enc-total">Total aproximado: <b>{fmtEur(importe)}</b></div>}
            </div>
          </div>

          <div className="enc-bloque">
            <h2>Datos</h2>
            <EncDatos filas={[
              ['Proveedor', prov || 'Sin poner'],
              ['N.º de pedido', o.reference],
              ['Llegada prevista', o.expected_date && !o.received_date ? fechaES(o.expected_date.split('T')[0]) : ''],
              ['Notas', o.notes],
              ['Albarán', o.document_id ? <button className="enc-link" style={{ padding: 0 }} onClick={() => navigate(`/documento/${o.document_id}`)}>Ver el albarán del proveedor</button> : ''],
            ]} />
          </div>

          <details className="enc-mas-op">
            <summary>Más opciones</summary>
            <div className="enc-mas-op-btns">
              <button className="btn btn-ghost" onClick={abrirDocs}>{o.document_id ? 'Cambiar el albarán vinculado' : 'Vincular el albarán del proveedor'}</button>
              {o.document_id && <button className="btn btn-ghost" onClick={() => vincular(null)}>Desvincular el albarán</button>}
              {o.status !== 'cancelado' && o.status !== 'entregado' && <button className="btn btn-ghost" onClick={cancelar}>Cancelar el pedido</button>}
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={borrar}><Trash2 size={15} /> Borrar</button>
            </div>
          </details>
        </div>
      </div>

      {editando && <EditarPedidoModal order={o} onClose={() => setEditando(false)} onSaved={x => { setO(x); setEditando(false); show('Datos guardados'); }} />}
      {linea && (
        <LineaModal orderId={o.id} line={linea === 'nueva' ? null : linea} orderSupplierName={o.supplier_name}
          onClose={() => setLinea(null)} onSaved={() => { setLinea(null); cargar(); }}
          onDelete={linea !== 'nueva' ? async () => {
            const l = linea;
            if (!(await confirm({ title: 'Quitar artículo', message: `¿Quitar «${l.descripcion}» del pedido?`, confirmLabel: 'Quitar', danger: true }))) return;
            try { await deleteOrderLine(o.id, l.id); setLinea(null); cargar(); } catch (e) { show(`No se pudo quitar: ${describeApiError(e)}`, { error: true }); }
          } : undefined} />
      )}
      {docs && (
        <div className="modal-overlay" onClick={() => setDocs(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>Vincular el albarán del proveedor</span>
              <button className="modal-close" onClick={() => setDocs(null)} aria-label="Cerrar">✕</button>
            </div>
            <div style={{ padding: '8px 0', maxHeight: 380, overflowY: 'auto' }}>
              {docs.length === 0 ? <div className="enc-cargando">Cargando albaranes…</div> : docs.slice(0, 60).map(d => (
                <button key={d.id} className="vincular-doc" onClick={() => vincular(d.id)}>
                  <b>{d.supplier_name || d.original_filename}</b>
                  <small>{[d.doc_number && `N.º ${d.doc_number}`, fechaES(d.doc_date || d.created_at)].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
