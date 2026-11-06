/** Ficha de una reparación, versión nueva (nov. 2026, «En pruebas»). Misma forma que la de pedidos. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, MessageCircle, RotateCcw, Trash2 } from 'lucide-react';
import { getRepair, listRepairs, updateRepair, deleteRepair, describeApiError } from '../api/client';
import { useConfirm } from '../components/ConfirmModal';
import { useCfToast } from '../components/CfToast';
import { ImporteModal, fmtEur, leerImporte, telWhatsApp, textoReparacion } from '../components/AvisoCliente';
import { EncAhora, EncBloque, EncCuando, EncDatos, EncFichaCab, EncLinea, EncModal, EncPregunta, sugerir, type Hito } from '../components/Encargos';
import { cuando, diasDesde } from '../lib/encargosNuevo';
import { fechaES } from '../lib/texto';
import { mensajeError } from '../lib/descargas';
import type { Repair as Rep, RepairStatus } from '../types';

const NOMBRE: Record<RepairStatus, string> = { recibida: 'sin llevar al taller', en_taller: 'en el taller', reparada: 'lista', entregada: 'entregada' };
const ATRAS: Partial<Record<RepairStatus, [RepairStatus, string]>> = {
  en_taller: ['recibida', 'No, aún no fue al taller'],
  reparada: ['en_taller', 'No, aún está en el taller'],
  entregada: ['reparada', 'No, aún no se la llevó'],
};
const BORRA_FECHA: Record<RepairStatus, Partial<Rep>> = {
  recibida: {}, en_taller: { date_sent_to_repair: undefined }, reparada: { date_repaired: undefined }, entregada: { date_returned: undefined },
};
const dia = (s?: string | null) => (s ? s.split('T')[0] : '');

export function ReparacionFicha() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const { toast, show } = useCfToast();
  const [r, setR] = useState<Rep | null>(null);
  const [todas, setTodas] = useState<Rep[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [preguntaTaller, setPreguntaTaller] = useState(false);
  const [cobrar, setCobrar] = useState(false);
  const [preguntaFecha, setPreguntaFecha] = useState(false);
  const [preguntaPresup, setPreguntaPresup] = useState(false);

  const cargar = useCallback(() => {
    if (!id) return Promise.resolve();
    return getRepair(Number(id)).then(({ data }) => { setR(data); setError(''); })
      .catch(e => setError(describeApiError(e))).finally(() => setCargando(false));
  }, [id]);
  useEffect(() => { cargar(); listRepairs().then(({ data }) => setTodas(data)).catch(() => null); }, [cargar]);
  const talleres = useMemo(() => sugerir(todas.map(x => x.taller)), [todas]);

  if (cargando) return <div className="page enc-cargando">Cargando…</div>;
  if (!r) return <div className="page enc-cargando">{error || 'Reparación no encontrada'}</div>;

  const maquina = [r.tool_description, r.tool_brand, r.tool_model].filter(Boolean).join(' ');
  const retraso = r.date_estimated_return && (r.status === 'recibida' || r.status === 'en_taller') ? diasDesde(r.date_estimated_return) : 0;
  const [estado, tono] = r.status === 'reparada' && !r.aviso_at ? ['Avisar al cliente', 'naranja' as const]
    : r.status === 'reparada' ? ['Para recoger', 'verde' as const]
    : retraso > 0 ? [`Retrasada ${retraso} día${retraso !== 1 ? 's' : ''}`, 'mal' as const]
    : r.status === 'recibida' ? ['Por llevar al taller', 'azul' as const]
    : r.status === 'en_taller' ? ['En el taller', 'morado' as const] : ['Entregada ✓', 'gris' as const];

  const avanzar = async (status: RepairStatus, extra: Partial<Rep> = {}) => {
    if (ocupado) return;
    setOcupado(true);
    const antes = r;
    try {
      setR((await updateRepair(r.id, { status, ...extra })).data);
      show(`${r.tool_description}: ${NOMBRE[status]}`, {
        undo: async () => {
          try {
            const vuelta: Parameters<typeof updateRepair>[1] = { status: antes.status, taller: antes.taller ?? null, final_price: antes.final_price ?? null };
            if (status === 'en_taller') vuelta.date_sent_to_repair = null;
            if (status === 'reparada') vuelta.date_repaired = null;
            if (status === 'entregada') vuelta.date_returned = null;
            setR((await updateRepair(r.id, vuelta)).data);
          } catch (e) { show(`No se pudo deshacer: ${mensajeError(e, 'error')}`, { error: true }); }
        },
      });
    } catch (e) {
      show(`No se pudo guardar: ${mensajeError(e, describeApiError(e))}`, { error: true });
    } finally { setTimeout(() => setOcupado(false), 600); }
  };

  const atras = ATRAS[r.status];
  const volverAtras = async () => {
    if (!atras) return;
    if (!(await confirm({ title: 'Volver un paso atrás', message: `¿${atras[1]}?`, confirmLabel: 'Sí' }))) return;
    const borrar: Parameters<typeof updateRepair>[1] = {};
    for (const k of Object.keys(BORRA_FECHA[r.status]) as (keyof Rep)[]) (borrar as Record<string, null>)[k] = null;
    try { setR((await updateRepair(r.id, { status: atras[0], ...borrar })).data); show('Vuelto un paso atrás'); }
    catch (e) { show(`No se pudo cambiar: ${describeApiError(e)}`, { error: true }); }
  };

  const avisado = async (abrioWhatsApp: boolean) => {
    try {
      const { data } = await updateRepair(r.id, { aviso_at: new Date().toISOString() });
      setR(data);
      if (!abrioWhatsApp) show('Apuntado como avisado', {
        undo: async () => { const x = await updateRepair(r.id, { aviso_at: null }).catch(() => null); if (x) setR(x.data); },
      });
    } catch { /* WhatsApp ya se abrió */ }
  };

  const wa = telWhatsApp(r.client_phone);
  const textoWa = textoReparacion(r.client_name, r.tool_description, r.final_price ?? r.estimated_price);
  const botonAtras = atras && <button className="btn btn-ghost btn-sm" onClick={volverAtras}><RotateCcw size={14} /> {atras[1]}</button>;

  let ahora: React.ReactNode;
  if (r.status === 'recibida') {
    ahora = (
      <EncAhora texto={r.taller ? `Llevarla a ${r.taller}.` : 'Llevarla al taller.'}>
        <button className="btn btn-primary btn-lg" disabled={ocupado} onClick={() => (r.taller ? avanzar('en_taller') : setPreguntaTaller(true))}>
          <Check size={18} /> Ya está en el taller
        </button>
      </EncAhora>
    );
  } else if (r.status === 'en_taller') {
    ahora = (
      <EncAhora texto={`En ${r.taller || 'el taller'} ${cuando(r.date_sent_to_repair) ? `desde ${cuando(r.date_sent_to_repair)}` : ''}. Cuando vuelva arreglada:`} atras={botonAtras}
        mas={<>
          <button className="enc-link" onClick={() => setPreguntaPresup(true)}>
            {r.estimated_price != null ? `Presupuesto ${fmtEur(r.estimated_price)} · cambiar` : '¿Te dieron presupuesto? Apúntalo'}</button>
          <button className="enc-link" onClick={() => setPreguntaFecha(true)}>
            {r.date_estimated_return ? `${retraso > 0 ? 'Tenía que estar' : 'Estará'} ${cuando(r.date_estimated_return)} · cambiar` : '¿Cuándo estará? Apúntalo'}</button>
        </>}>
        <button className="btn btn-primary btn-lg" disabled={ocupado} onClick={() => avanzar('reparada')}><Check size={18} /> Ya está lista</button>
      </EncAhora>
    );
  } else if (r.status === 'reparada' && !r.aviso_at) {
    ahora = (
      <EncAhora texto={wa ? 'Está lista. Avisa al cliente.' : 'Está lista. Falta el teléfono del cliente para avisarle.'} atras={botonAtras}>
        {wa ? (
          <a className="btn wa-btn btn-lg" target="_blank" rel="noopener noreferrer" onClick={() => avisado(true)}
            href={`https://wa.me/${wa}?text=${encodeURIComponent(textoWa)}`}>
            <MessageCircle size={18} /> Avisar por WhatsApp
          </a>
        ) : <button className="btn btn-primary btn-lg" onClick={() => setEditando(true)}>Poner el teléfono</button>}
        <button className="enc-link" onClick={() => avisado(false)}>Ya le avisé de otra forma</button>
      </EncAhora>
    );
  } else if (r.status === 'reparada') {
    ahora = (
      <EncAhora texto={`Avisado ${cuando(r.aviso_at)}. Cuando pase a recogerla:`} atras={botonAtras}>
        <button className="btn btn-primary btn-lg" disabled={ocupado} onClick={() => setCobrar(true)}><Check size={18} /> Se la llevó</button>
        {wa && <a className="enc-link" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}?text=${encodeURIComponent(textoWa)}`}>Volver a avisar</a>}
      </EncAhora>
    );
  } else {
    ahora = <EncAhora texto={`✓ Entregada${r.final_price != null ? ` · cobrado ${fmtEur(r.final_price)}` : ''}.`} atras={botonAtras} />;
  }

  const ord = ['recibida', 'en_taller', 'reparada', 'entregada'].indexOf(r.status);
  const hitos: Hito[] = [
    { texto: 'Entró en la tienda', cuando: cuando(r.date_received), hecho: true },
    { color: 'azul', texto: `${ord >= 1 ? 'Al taller' : 'Llevar al taller'}${r.taller ? ` (${r.taller})` : ''}`, cuando: ord >= 1 ? cuando(r.date_sent_to_repair) : '', hecho: ord >= 1, ahora: ord === 0 },
    { color: 'morado', texto: ord >= 2 ? 'Lista' : 'Que esté lista', cuando: ord >= 2 ? cuando(r.date_repaired) : r.date_estimated_return ? `${retraso > 0 ? 'tenía que estar' : 'prevista'} ${cuando(r.date_estimated_return)}` : '', hecho: ord >= 2, ahora: ord === 1 },
    { color: 'naranja', texto: r.aviso_at || ord === 3 ? 'Avisado el cliente' : 'Avisar al cliente', cuando: r.aviso_at ? cuando(r.aviso_at) : '', hecho: !!r.aviso_at || ord === 3, ahora: ord === 2 && !r.aviso_at },
    { color: 'verde', texto: ord === 3 ? 'Se la llevó' : 'Que la recoja', cuando: ord === 3 ? [cuando(r.date_returned), r.final_price != null && `cobrado ${fmtEur(r.final_price)}`].filter(Boolean).join(' · ') : '', hecho: ord === 3, ahora: ord === 2 && !!r.aviso_at },
  ];

  const borrar = async () => {
    if (!(await confirm({ title: 'Borrar reparación', message: `¿Borrar la reparación de ${r.client_name}? No se puede deshacer.`, confirmLabel: 'Borrar', danger: true }))) return;
    try { await deleteRepair(r.id); navigate('/reparaciones'); } catch (e) { show(`No se pudo borrar: ${describeApiError(e)}`, { error: true }); }
  };

  return (
    <div className="page enc-ficha">
      {ConfirmDialog}
      {toast}
      <EncFichaCab volver="Reparaciones" onVolver={() => navigate('/reparaciones')} cliente={r.client_name} telefono={r.client_phone}
        estado={estado} tono={tono} onEditar={() => setEditando(true)} />
      {ahora}

      <div className="enc-ficha-cuerpo">
        <EncLinea hitos={hitos} />
        <div>
          <div className="enc-bloque">
            <h2>La máquina</h2>
            <EncDatos filas={[
              ['Qué es', maquina],
              ['Qué le pasa', r.problem_description],
              ['Taller', r.taller || 'Sin decir'],
              ['Presupuesto', r.estimated_price != null ? fmtEur(r.estimated_price) : ''],
              ['Cobrado', r.final_price != null ? fmtEur(r.final_price) : ''],
              ['Fecha prevista', r.date_estimated_return && ord < 2 ? fechaES(dia(r.date_estimated_return)) : ''],
              ['Notas', r.notes],
            ]} />
          </div>
          <details className="enc-mas-op">
            <summary>Más opciones</summary>
            <div className="enc-mas-op-btns">
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={borrar}><Trash2 size={15} /> Borrar esta reparación</button>
            </div>
          </details>
        </div>
      </div>

      {preguntaTaller && (
        <EncPregunta titulo="Al taller" texto={`${r.tool_description} de ${r.client_name}: ¿a qué taller va?`} sugerencias={talleres} boton="Enviar"
          onCancel={() => setPreguntaTaller(false)}
          onOk={t => { setPreguntaTaller(false); avanzar('en_taller', t ? { taller: t } : {}); }} />
      )}
      {preguntaFecha && (
        <EncCuando titulo="¿Cuándo estará?" actual={r.date_estimated_return} onCancel={() => setPreguntaFecha(false)}
          onOk={async f => {
            setPreguntaFecha(false);
            try { setR((await updateRepair(r.id, { date_estimated_return: f ? `${f}T12:00:00` : null })).data); show(f ? `Estará ${cuando(f)}` : 'Fecha quitada'); }
            catch (e) { show(`No se pudo guardar: ${describeApiError(e)}`, { error: true }); }
          }} />
      )}
      {preguntaPresup && (
        <ImporteModal titulo="Presupuesto" texto={`¿Cuánto dijo ${r.taller || 'el taller'} que cuesta arreglarla?`} inicial={r.estimated_price} boton="Apuntar"
          onCancel={() => setPreguntaPresup(false)}
          onOk={async importe => {
            setPreguntaPresup(false);
            try { setR((await updateRepair(r.id, { estimated_price: importe })).data); show(importe != null ? `Presupuesto: ${fmtEur(importe)}` : 'Presupuesto quitado'); }
            catch (e) { show(`No se pudo guardar: ${describeApiError(e)}`, { error: true }); }
          }} />
      )}
      {cobrar && (
        <ImporteModal titulo="Se la llevó" texto={`¿Cuánto se le cobra a ${r.client_name}?`} inicial={r.final_price ?? r.estimated_price} boton="Entregada"
          onCancel={() => setCobrar(false)}
          onOk={importe => { setCobrar(false); avanzar('entregada', { final_price: importe ?? undefined }); }} />
      )}
      {editando && (
        <EditarReparacion r={r} talleres={talleres} onCerrar={() => setEditando(false)}
          onGuardada={x => { setR(x); setEditando(false); show('Cambios guardados'); }} />
      )}
    </div>
  );
}

function EditarReparacion({ r, talleres, onCerrar, onGuardada }: { r: Rep; talleres: string[]; onCerrar: () => void; onGuardada: (r: Rep) => void }) {
  const num = (n?: number | null) => (n != null ? String(n).replace('.', ',') : '');
  const inicial = {
    cliente: r.client_name, telefono: r.client_phone ?? '', maq: r.tool_description,
    marca: [r.tool_brand, r.tool_model].filter(Boolean).join(' '), problema: r.problem_description, taller: r.taller ?? '',
    presup: num(r.estimated_price), cobrado: num(r.final_price), notas: r.notes ?? '',
    recibida: dia(r.date_received), prevista: dia(r.date_estimated_return), alTaller: dia(r.date_sent_to_repair),
    lista: dia(r.date_repaired), entregada: dia(r.date_returned),
  };
  const [f, setF] = useState(inicial);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }));
  const fecha = (s: string) => (s ? `${s}T12:00:00` : null);

  const guardar = async () => {
    if (!f.cliente.trim()) { setError('Falta el cliente'); return; }
    if (!f.maq.trim()) { setError('Falta qué máquina es'); return; }
    const p = leerImporte(f.presup), c = leerImporte(f.cobrado);
    if (!p.ok) { setError(`Presupuesto: ${p.error}`); return; }
    if (!c.ok) { setError(`Cobrado: ${c.error}`); return; }
    if (f.prevista && f.recibida && f.prevista < f.recibida) { setError('La fecha prevista no puede ser antes de que entrara'); return; }
    setGuardando(true); setError('');
    try {
      const { data } = await updateRepair(r.id, {
        client_name: f.cliente.trim(), client_phone: f.telefono.trim() || null,
        tool_description: f.maq.trim(), tool_brand: f.marca.trim() || null, tool_model: null,
        problem_description: f.problema.trim(), taller: f.taller.trim() || null,
        estimated_price: p.n, final_price: c.n, notes: f.notas.trim() || null,
        date_received: fecha(f.recibida) ?? undefined, date_estimated_return: fecha(f.prevista),
        date_sent_to_repair: fecha(f.alTaller), date_repaired: fecha(f.lista), date_returned: fecha(f.entregada),
      });
      onGuardada(data);
    } catch (e) {
      setError(`No se pudo guardar: ${mensajeError(e, describeApiError(e))}`);
    } finally { setGuardando(false); }
  };

  return (
    <EncModal titulo="Editar reparación" escrito={JSON.stringify(f) !== JSON.stringify(inicial)} error={error} guardando={guardando}
      boton="Guardar" onCerrar={onCerrar} onGuardar={guardar}>
      <EncBloque titulo="Cliente">
        <div className="enc-2">
          <div><label className="form-label" htmlFor="er-cli">Nombre *</label><input id="er-cli" className="form-input" value={f.cliente} onChange={set('cliente')} /></div>
          <div><label className="form-label" htmlFor="er-tel">Teléfono</label><input id="er-tel" className="form-input" type="tel" value={f.telefono} onChange={set('telefono')} placeholder="666 123 456" /></div>
        </div>
      </EncBloque>
      <EncBloque titulo="La máquina">
        <div className="enc-2">
          <div><label className="form-label" htmlFor="er-maq">Qué es *</label><input id="er-maq" className="form-input" value={f.maq} onChange={set('maq')} /></div>
          <div><label className="form-label" htmlFor="er-marca">Marca y modelo</label><input id="er-marca" className="form-input" value={f.marca} onChange={set('marca')} /></div>
        </div>
        <div><label className="form-label" htmlFor="er-prob">Qué le pasa</label><input id="er-prob" className="form-input" value={f.problema} onChange={set('problema')} /></div>
        <div><label className="form-label" htmlFor="er-notas">Nota</label><textarea id="er-notas" className="form-input" rows={2} value={f.notas} onChange={set('notas')} /></div>
      </EncBloque>
      <EncBloque titulo="Taller y dinero">
        <div>
          <label className="form-label" htmlFor="er-taller">Taller</label>
          <input id="er-taller" className="form-input" list="er-taller-lista" value={f.taller} onChange={set('taller')} autoComplete="off" />
          <datalist id="er-taller-lista">{talleres.map(t => <option key={t} value={t} />)}</datalist>
        </div>
        <div className="enc-2">
          <div><label className="form-label" htmlFor="er-presup">Presupuesto (€)</label><input id="er-presup" className="form-input" inputMode="decimal" value={f.presup} onChange={set('presup')} placeholder="0,00" /></div>
          <div><label className="form-label" htmlFor="er-cobrado">Cobrado (€)</label><input id="er-cobrado" className="form-input" inputMode="decimal" value={f.cobrado} onChange={set('cobrado')} placeholder="0,00" /></div>
        </div>
      </EncBloque>
      <details className="enc-fb enc-fb-plegado">
        <summary>Fechas</summary>
        <div className="enc-2">
          <div><label className="form-label" htmlFor="er-f1">Entró</label><input id="er-f1" className="form-input" type="date" value={f.recibida} onChange={set('recibida')} /></div>
          <div><label className="form-label" htmlFor="er-f2">Estará (prevista)</label><input id="er-f2" className="form-input" type="date" value={f.prevista} onChange={set('prevista')} /></div>
          <div><label className="form-label" htmlFor="er-f3">Al taller</label><input id="er-f3" className="form-input" type="date" value={f.alTaller} onChange={set('alTaller')} /></div>
          <div><label className="form-label" htmlFor="er-f4">Lista</label><input id="er-f4" className="form-input" type="date" value={f.lista} onChange={set('lista')} /></div>
          <div><label className="form-label" htmlFor="er-f5">Se la llevó</label><input id="er-f5" className="form-input" type="date" value={f.entregada} onChange={set('entregada')} /></div>
        </div>
      </details>
    </EncModal>
  );
}
