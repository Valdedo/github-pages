/** Pedidos de clientes, versión nueva (nov. 2026, «En pruebas»). Ver `lib/encargosNuevo.ts`. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, Phone } from 'lucide-react';
import { listOrders, listSuppliers, createOrder, updateOrder, getOrder, updateOrderLine, describeApiError } from '../api/client';
import { useCfToast } from '../components/CfToast';
import { ConnectionError } from '../components/ConnectionError';
import { telWhatsApp, textoPedido } from '../components/AvisoCliente';
import { CampoCliente, EncBloque, EncElegir, EncNota, EncCabecera, EncFila, EncGrupo, EncHechos, EncModal, EncSeccion, clientesConocidos, sugerir } from '../components/Encargos';
import { coincide } from '../lib/texto';
import { mensajeError } from '../lib/descargas';
import { cuando, diasDesde, hoyISO, leerLinea } from '../lib/encargosNuevo';
import type { SupplierOrderListItem as Ped, Supplier } from '../types';

const sinProv = (p?: string | null) => !p || !p.trim() || p === '__manual__';
const articulos = (o: Ped) => o.resumen || `${o.line_count} artículo${o.line_count !== 1 ? 's' : ''}`;
const retraso = (o: Ped) => (o.expected_date ? diasDesde(o.expected_date) : 0);

export function PedidosNueva() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { toast, show } = useCfToast();
  const [pedidos, setPedidos] = useState<Ped[]>([]);
  const [proveedores, setProveedores] = useState<Supplier[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [nuevo, setNuevo] = useState(sp.get('new') === '1');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback((quieto = false) => {
    if (!quieto) setCargando(true);
    setErrorCarga(null);
    return Promise.all([listOrders(), listSuppliers()])
      .then(([o, s]) => { setPedidos(o.data); setProveedores(s.data); })
      .catch(e => setErrorCarga(describeApiError(e)))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const q = busca.trim();
  const ver = (o: Ped) => !q || coincide(q, o.client_name, o.client_phone, o.supplier_name, o.reference, o.resumen, o.notes);
  const lista = pedidos.filter(ver);

  const avisar = lista.filter(o => o.status === 'recibido' && !o.aviso_at);
  const porPedir = lista.filter(o => o.status === 'pendiente');
  const esperando = lista.filter(o => o.status === 'pedido' || o.status === 'parcial')
    .sort((a, b) => retraso(b) - retraso(a) || (a.expected_date || '9').localeCompare(b.expected_date || '9'));
  const recoger = lista.filter(o => o.status === 'recibido' && !!o.aviso_at);
  const hechos = lista.filter(o => o.status === 'entregado' || o.status === 'cancelado');

  // Por pedir, juntos por proveedor: se piden de una vez
  const grupos = useMemo(() => {
    const m = new Map<string, Ped[]>();
    for (const o of porPedir) {
      const k = sinProv(o.supplier_name) ? '' : o.supplier_name!.trim();
      m.set(k, [...(m.get(k) || []), o]);
    }
    return [...m.entries()].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'es'));
  }, [porPedir]);

  const nombresProv = useMemo(() => sugerir([...pedidos.map(o => o.supplier_name), ...proveedores.map(p => p.name)]), [pedidos, proveedores]);
  const conocidos = useMemo(() => clientesConocidos(pedidos), [pedidos]);
  const abrir = (o: Ped) => navigate(`/pedidos/${o.id}`);

  /** Cambia el estado de uno o varios, con «Deshacer». */
  const cambiar = async (clave: string, items: Ped[], status: Ped['status'], texto: string) => {
    if (ocupado) return;
    setOcupado(clave);
    // Para deshacer «Llegó» hay que saber qué había llegado de cada artículo
    const antes = await Promise.all(items.map(async o => ({
      o, lineas: status === 'recibido' ? (await getOrder(o.id).catch(() => null))?.data.lines ?? [] : [],
    })));
    try {
      await Promise.all(items.map(o => updateOrder(o.id, { status, ...(status === 'pedido' && o.status === 'pendiente' ? { order_date: hoyISO() } : {}) })));
      await cargar(true);
      show(texto, {
        undo: async () => {
          try {
            for (const { o, lineas } of antes) {
              await updateOrder(o.id, { status: o.status, ...(status === 'pedido' ? { order_date: o.order_date } : {}) });
              await Promise.all(lineas.map(l => updateOrderLine(o.id, l.id, { cantidad_recibida: l.cantidad_recibida })));
              if (lineas.length) await updateOrder(o.id, { status: o.status });
            }
          } catch (e) { show(`No se pudo deshacer del todo: ${mensajeError(e, 'error')}`, { error: true }); }
          cargar(true);
        },
      });
    } catch (e) {
      show(`No se pudo guardar: ${mensajeError(e, describeApiError(e))}`, { error: true });
      cargar(true);
    } finally { setOcupado(null); }
  };

  const avisado = async (o: Ped) => {
    try { await updateOrder(o.id, { aviso_at: new Date().toISOString() }); } catch { /* WhatsApp ya se abrió */ }
    cargar(true);
    show(`${o.client_name}: avisado. Pasa a «Para recoger».`);
  };

  const botonAvisar = (o: Ped) => {
    const wa = telWhatsApp(o.client_phone);
    if (!wa) return <button className="btn btn-ghost btn-sm" onClick={() => abrir(o)}><Phone size={15} /> Falta el teléfono</button>;
    return (
      <a className="btn wa-btn btn-sm" target="_blank" rel="noopener noreferrer"
        href={`https://wa.me/${wa}?text=${encodeURIComponent(textoPedido(o.client_name, o.resumen ? o.resumen.split(' · ') : []))}`}
        onClick={() => avisado(o)}>
        <MessageCircle size={15} /> Avisar
      </a>
    );
  };

  const filaHecho = (o: Ped) => (
    <EncFila key={o.id} titulo={o.client_name || '—'} detalle={articulos(o)} onAbrir={() => abrir(o)}
      estado={o.status === 'cancelado' ? 'Cancelado' : `Entregado${o.received_date ? ` · llegó ${cuando(o.received_date)}` : ''}`} />
  );

  const nada = !cargando && !errorCarga && pedidos.length === 0;

  return (
    <div className="page enc-page">
      {toast}
      {errorCarga && <ConnectionError message={errorCarga} onRetry={() => cargar()} />}
      <EncCabecera titulo="Pedidos de clientes" nuevo="Nuevo pedido" onNuevo={() => setNuevo(true)}
        busca={busca} setBusca={setBusca} placeholder="Cliente o artículo" />

      {cargando ? <div className="enc-cargando">Cargando…</div> : nada ? (
        <div className="enc-vacio">
          <b>Aquí se apuntan los pedidos especiales</b>
          <span>Lo que se pide al proveedor para un cliente. Avisa de que ha llegado por WhatsApp.</span>
          <button className="btn btn-primary" onClick={() => setNuevo(true)}>Nuevo pedido</button>
        </div>
      ) : (
        <>
          {q && !avisar.length && !porPedir.length && !esperando.length && !recoger.length && !hechos.length && (
            <div className="enc-vacio"><span>Nada con «{q}»</span></div>
          )}
          <div className="enc-tablero">
            <EncSeccion titulo="Avisar al cliente" n={avisar.length} aviso ayuda="Ha llegado: avísale por WhatsApp.">
              {avisar.map(o => (
                <EncFila key={o.id} titulo={o.client_name || '—'} detalle={articulos(o)} onAbrir={() => abrir(o)}
                  estado={`Llegó ${cuando(o.received_date) || ''}${o.supplier_name && !sinProv(o.supplier_name) ? ` · ${o.supplier_name}` : ''}`}
                  accion={botonAvisar(o)} />
              ))}
            </EncSeccion>

            <EncSeccion titulo="Por pedir" n={porPedir.length}>
              {grupos.map(([prov, items]) => (
                <EncGrupo key={prov || '-'} titulo={prov || 'Sin proveedor'}
                  accion={prov ? (
                    <button className="btn btn-ghost btn-sm" disabled={ocupado === `g${prov}`}
                      onClick={() => cambiar(`g${prov}`, items, 'pedido', items.length > 1 ? `${items.length} pedidos a ${prov}: pedidos` : `Pedido a ${prov}`)}>
                      {items.length > 1 ? `Pedidos los ${items.length}` : 'Ya pedido'}
                    </button>
                  ) : undefined}>
                  {items.map(o => (
                    <EncFila key={o.id} titulo={o.client_name || '—'} detalle={articulos(o)} onAbrir={() => abrir(o)}
                      estado={`Apuntado ${cuando(o.created_at)}`}
                      accion={!prov ? <button className="btn btn-ghost btn-sm" onClick={() => abrir(o)}>Poner proveedor</button> : undefined} />
                  ))}
                </EncGrupo>
              ))}
            </EncSeccion>

            <EncSeccion titulo="Esperando al proveedor" n={esperando.length}>
              {esperando.map(o => {
                const r = retraso(o);
                const prov = sinProv(o.supplier_name) ? '' : `${o.supplier_name} · `;
                const parcial = o.status === 'parcial' || (o.lines_received > 0 && o.lines_received < o.line_count);
                return (
                  <EncFila key={o.id} titulo={o.client_name || '—'} detalle={articulos(o)} onAbrir={() => abrir(o)}
                    tono={r > 0 ? 'mal' : undefined}
                    estado={r > 0 ? `${prov}Retrasado ${r} día${r !== 1 ? 's' : ''}`
                      : parcial ? `${prov}Llegaron ${o.lines_received} de ${o.line_count}`
                      : o.expected_date ? `${prov}Llega ${cuando(o.expected_date)}`
                      : `${prov}Pedido ${cuando(o.order_date)}`}
                    accion={<button className="btn btn-ghost btn-sm" disabled={ocupado === `l${o.id}`}
                      onClick={() => cambiar(`l${o.id}`, [o], 'recibido', `Pedido de ${o.client_name}: ha llegado`)}>
                      {parcial ? 'Llegó el resto' : 'Ha llegado'}</button>} />
                );
              })}
            </EncSeccion>

            <EncSeccion titulo="Para recoger" n={recoger.length} vacio="Nadie tiene nada por recoger">
              {recoger.map(o => (
                <EncFila key={o.id} titulo={o.client_name || '—'} detalle={articulos(o)} onAbrir={() => abrir(o)}
                  estado={`Avisado ${cuando(o.aviso_at)}${diasDesde(o.aviso_at) >= 7 ? ' · lleva una semana' : ''}`}
                  tono={diasDesde(o.aviso_at) >= 7 ? 'pend' : undefined}
                  accion={<button className="btn btn-ghost btn-sm" disabled={ocupado === `e${o.id}`}
                    onClick={() => cambiar(`e${o.id}`, [o], 'entregado', `${o.client_name} se lo llevó`)}>Se lo llevó</button>} />
              ))}
            </EncSeccion>
          </div>

          <EncHechos titulo="Entregados y cancelados" items={hechos} abierto={!!q} fila={filaHecho} />
        </>
      )}

      {nuevo && (
        <NuevoPedido conocidos={conocidos} proveedores={nombresProv} suppliers={proveedores}
          onCerrar={() => setNuevo(false)}
          onGuardado={(cli, yaPedido) => { setNuevo(false); cargar(true); show(`Pedido de ${cli} apuntado${yaPedido ? ' (ya pedido)' : ''}`); }} />
      )}
    </div>
  );
}

function NuevoPedido({ conocidos, proveedores, suppliers, onCerrar, onGuardado }: {
  conocidos: Map<string, string>; proveedores: string[]; suppliers: Supplier[];
  onCerrar: () => void; onGuardado: (cliente: string, yaPedido: boolean) => void;
}) {
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [que, setQue] = useState('');
  const [prov, setProv] = useState('');
  const [yaPedido, setYaPedido] = useState(false);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const lineas = que.split('\n').map(leerLinea).filter(Boolean) as { cantidad: number; descripcion: string }[];
  const escrito = !!(cliente.trim() || telefono.trim() || que.trim() || prov.trim() || notas.trim());

  const guardar = async () => {
    if (!cliente.trim()) { setError('Falta el cliente'); return; }
    if (!lineas.length) { setError('Falta qué hay que pedir'); return; }
    const p = prov.trim();
    const sup = suppliers.find(s => s.name.trim().toLowerCase() === p.toLowerCase());
    setGuardando(true); setError('');
    try {
      await createOrder({
        client_name: cliente.trim(),
        client_phone: telefono.trim() || undefined,
        supplier_name: (sup?.name ?? p) || undefined,
        supplier_id: sup?.id,
        order_date: hoyISO(),
        notes: notas.trim() || undefined,
        status: yaPedido ? 'pedido' : 'pendiente',
        lines: lineas,
      });
      onGuardado(cliente.trim(), yaPedido);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar el pedido. Comprueba la conexión.'));
    } finally { setGuardando(false); }
  };

  return (
    <EncModal titulo="Nuevo pedido" escrito={escrito} error={error} guardando={guardando} boton="Apuntar pedido"
      onCerrar={onCerrar} onGuardar={guardar}>
      <EncBloque n={1} titulo="Cliente">
        <CampoCliente cliente={cliente} telefono={telefono} setCliente={setCliente} setTelefono={setTelefono} conocidos={conocidos} />
      </EncBloque>
      <EncBloque n={2} titulo="Qué hay que pedir">
        <textarea id="enc-que" className="form-input" rows={3} value={que} onChange={e => setQue(e.target.value)} aria-label="Qué hay que pedir"
          placeholder={'Uno por línea, con la cantidad delante:\n3 llave bola 1"\n2 racor latón 32'} />
        <EncNota id="enc-notas" valor={notas} onChange={setNotas} placeholder="Color, medida, si deja algo a cuenta…" />
      </EncBloque>
      <EncBloque n={3} titulo="A qué proveedor" nota="si ya se sabe">
        <EncElegir id="enc-prov" valor={prov} onChange={setProv} opciones={proveedores} placeholder="Nombre del proveedor" />
        <label className="enc-check">
          <input type="checkbox" checked={yaPedido} onChange={e => setYaPedido(e.target.checked)} />
          Ya lo he pedido
        </label>
      </EncBloque>
      <p className="enc-pie-nota">La fecha se pone sola. Cuándo llega y el n.º de pedido se apuntan en la ficha, cuando lo sepas.</p>
    </EncModal>
  );
}
