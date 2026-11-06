/** Reparaciones, versión nueva (nov. 2026, «En pruebas»). Misma forma que Pedidos; ver `lib/encargosNuevo.ts`. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox, MessageCircle, PackageCheck, Phone, Wrench } from 'lucide-react';
import { listRepairs, createRepair, updateRepair, describeApiError } from '../api/client';
import { useCfToast } from '../components/CfToast';
import { ConnectionError } from '../components/ConnectionError';
import { ImporteModal, fmtEur, telWhatsApp, textoReparacion } from '../components/AvisoCliente';
import { CampoCliente, EncBloque, EncElegir, EncNota, EncCabecera, EncFila, EncGrupo, EncHechos, EncModal, EncPregunta, EncResumen, EncSeccion, clientesConocidos, recortarGrupos, sugerir, type EncInfo } from '../components/Encargos';
import { coincide } from '../lib/texto';
import { mensajeError } from '../lib/descargas';
import { cuando, desde, diasDesde, hoyISO } from '../lib/encargosNuevo';
import type { Repair as Rep, RepairStatus } from '../types';

const maquina = (r: Rep) => [r.tool_description, r.tool_brand, r.tool_model].filter(Boolean).join(' ');
const retraso = (r: Rep) => (r.date_estimated_return && !r.date_returned ? diasDesde(r.date_estimated_return) : 0);
const precio = (r: Rep) => (r.final_price != null ? fmtEur(r.final_price) : r.estimated_price != null ? `presup. ${fmtEur(r.estimated_price)}` : '');
const NOMBRE: Record<RepairStatus, string> = { recibida: 'sin llevar al taller', en_taller: 'en el taller', reparada: 'lista', entregada: 'entregada' };

export function ReparacionesNueva() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { toast, show } = useCfToast();
  const [reps, setReps] = useState<Rep[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [nueva, setNueva] = useState(sp.get('new') === '1');
  const [alTaller, setAlTaller] = useState<Rep | null>(null);
  const [entregar, setEntregar] = useState<Rep | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);

  const cargar = useCallback((quieto = false) => {
    if (!quieto) setCargando(true);
    setErrorCarga(null);
    return listRepairs().then(({ data }) => setReps(data))
      .catch(e => setErrorCarga(describeApiError(e)))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const q = busca.trim();
  const lista = reps.filter(r => !q || coincide(q, r.client_name, r.client_phone, r.tool_description, r.tool_brand, r.tool_model, r.problem_description, r.notes, r.taller));
  const avisar = lista.filter(r => r.status === 'reparada' && !r.aviso_at);
  const porLlevar = lista.filter(r => r.status === 'recibida').sort((a, b) => a.date_received.localeCompare(b.date_received));
  const enTaller = lista.filter(r => r.status === 'en_taller')
    .sort((a, b) => retraso(b) - retraso(a) || (a.date_sent_to_repair || '').localeCompare(b.date_sent_to_repair || ''));
  const recoger = lista.filter(r => r.status === 'reparada' && !!r.aviso_at);
  const hechas = lista.filter(r => r.status === 'entregada');

  // En el taller, juntas por taller (para llamar y preguntar por todas a la vez)
  const grupos = useMemo(() => {
    const m = new Map<string, Rep[]>();
    for (const r of enTaller) { const k = (r.taller || '').trim(); m.set(k, [...(m.get(k) || []), r]); }
    return [...m.entries()].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b, 'es'));
  }, [enTaller]);
  const secs: EncInfo[] = [
    { id: 'avisar', titulo: 'Avisar al cliente', corto: 'Avisar', n: avisar.length, tono: 'accion', icono: MessageCircle },
    { id: 'llevar', titulo: 'Por llevar al taller', corto: 'Por llevar', n: porLlevar.length, tono: 'accion', icono: Inbox },
    { id: 'taller', titulo: 'En el taller', corto: 'En el taller', n: enTaller.length, tono: 'espera', icono: Wrench },
    { id: 'recoger', titulo: 'Para recoger', corto: 'Para recoger', n: recoger.length, tono: 'listo', icono: PackageCheck },
  ];
  const talleres = useMemo(() => sugerir(reps.map(r => r.taller)), [reps]);
  const conocidos = useMemo(() => clientesConocidos(reps), [reps]);
  const abrir = (r: Rep) => navigate(`/reparaciones/${r.id}`);

  const avanzar = async (r: Rep, status: RepairStatus, extra: Partial<Rep> = {}) => {
    if (ocupado) return;
    setOcupado(r.id);
    try {
      const { data } = await updateRepair(r.id, { status, ...extra });
      setReps(prev => prev.map(x => (x.id === data.id ? data : x)));
      show(`${r.tool_description} de ${r.client_name}: ${NOMBRE[status]}`, {
        undo: async () => {
          try {
            const { data: back } = await updateRepair(r.id, {
              status: r.status, taller: r.taller ?? null, final_price: r.final_price ?? null,
              ...(status === 'en_taller' ? { date_sent_to_repair: null } : status === 'reparada' ? { date_repaired: null } : { date_returned: null }),
            });
            setReps(prev => prev.map(x => (x.id === back.id ? back : x)));
          } catch (e) { show(`No se pudo deshacer: ${mensajeError(e, 'error')}`, { error: true }); }
        },
      });
    } catch (e) {
      show(`No se pudo guardar: ${mensajeError(e, describeApiError(e))}`, { error: true });
    } finally { setOcupado(null); }
  };

  const avisado = async (r: Rep) => {
    try {
      const { data } = await updateRepair(r.id, { aviso_at: new Date().toISOString() });
      setReps(prev => prev.map(x => (x.id === data.id ? data : x)));
    } catch { /* WhatsApp ya se abrió */ }
    show(`${r.client_name}: avisado. Pasa a «Para recoger».`);
  };

  const botonAvisar = (r: Rep) => {
    const wa = telWhatsApp(r.client_phone);
    if (!wa) return <button className="btn btn-ghost btn-sm" onClick={() => abrir(r)}><Phone size={15} /> Poner teléfono</button>;
    return (
      <a className="btn wa-btn btn-sm" target="_blank" rel="noopener noreferrer"
        href={`https://wa.me/${wa}?text=${encodeURIComponent(textoReparacion(r.client_name, r.tool_description, r.final_price ?? r.estimated_price))}`}
        onClick={() => avisado(r)}>
        <MessageCircle size={15} /> Avisar
      </a>
    );
  };

  const filaEnTaller = (r: Rep, conTaller: boolean) => {
    const t = retraso(r);
    return (
      <EncFila key={r.id} titulo={r.client_name} detalle={maquina(r)} onAbrir={() => abrir(r)} tono={t > 0 ? 'mal' : undefined}
        estado={[conTaller && r.taller, t > 0 ? `Retrasada ${t} día${t !== 1 ? 's' : ''}` : desde(r.date_sent_to_repair || r.date_received)].filter(Boolean).join(' · ')}
        accion={<button className="btn btn-ghost btn-sm" disabled={ocupado === r.id} onClick={() => avanzar(r, 'reparada')}>Ya está lista</button>} />
    );
  };

  const nada = !cargando && !errorCarga && reps.length === 0;

  return (
    <div className="page enc-page">
      {toast}
      {errorCarga && <ConnectionError message={errorCarga} onRetry={() => cargar()} />}
      <EncCabecera titulo="Reparaciones" nuevo="Nueva reparación" onNuevo={() => setNueva(true)}
        busca={busca} setBusca={setBusca} placeholder="Cliente o máquina" />

      {cargando ? <div className="enc-cargando">Cargando…</div> : nada ? (
        <div className="enc-vacio">
          <b>Aquí se apuntan las máquinas a reparar</b>
          <span>Cuando un cliente deje una herramienta para el servicio técnico.</span>
          <button className="btn btn-primary" onClick={() => setNueva(true)}>Nueva reparación</button>
        </div>
      ) : (
        <>
          {q && !lista.length && <div className="enc-vacio"><span>Nada con «{q}»</span></div>}
          <EncResumen secciones={secs} />
          <div className="enc-tablero">
            <EncSeccion info={secs[0]} todo={!!q}>
              {lim => avisar.slice(0, lim).map(r => (
                <EncFila key={r.id} titulo={r.client_name} detalle={maquina(r)} onAbrir={() => abrir(r)}
                  estado={[`Lista ${cuando(r.date_repaired)}`, precio(r)].filter(Boolean).join(' · ')}
                  accion={botonAvisar(r)} />
              ))}
            </EncSeccion>

            <EncSeccion info={secs[1]} todo={!!q}>
              {lim => porLlevar.slice(0, lim).map(r => (
                <EncFila key={r.id} titulo={r.client_name} detalle={maquina(r)} onAbrir={() => abrir(r)}
                  estado={[`Entró ${cuando(r.date_received)}`, r.problem_description].filter(Boolean).join(' · ')}
                  tono={diasDesde(r.date_received) >= 3 ? 'pend' : undefined}
                  accion={<button className="btn btn-ghost btn-sm" disabled={ocupado === r.id}
                    onClick={() => (r.taller ? avanzar(r, 'en_taller') : setAlTaller(r))}>Al taller</button>} />
              ))}
            </EncSeccion>

            <EncSeccion info={secs[2]} todo={!!q}>
              {lim => grupos.length === 1 && !grupos[0][0]
                ? grupos[0][1].slice(0, lim).map(r => filaEnTaller(r, false))
                : recortarGrupos(grupos, lim).map(([taller, , vistos]) => (
                  <EncGrupo key={taller || '-'} titulo={taller || 'Sin decir el taller'}>
                    {vistos.map(r => filaEnTaller(r, false))}
                  </EncGrupo>
                ))}
            </EncSeccion>

            <EncSeccion info={secs[3]} todo={!!q} vacio="Nadie tiene nada por recoger">
              {lim => recoger.slice(0, lim).map(r => (
                <EncFila key={r.id} titulo={r.client_name} detalle={maquina(r)} onAbrir={() => abrir(r)}
                  estado={[`Avisado ${cuando(r.aviso_at)}`, precio(r)].filter(Boolean).join(' · ')}
                  tono={diasDesde(r.aviso_at) >= 7 ? 'pend' : undefined}
                  accion={<button className="btn btn-ghost btn-sm" disabled={ocupado === r.id} onClick={() => setEntregar(r)}>Se la llevó</button>} />
              ))}
            </EncSeccion>
          </div>

          <EncHechos titulo="Entregadas" items={hechas} abierto={!!q} fila={r => (
            <EncFila key={r.id} titulo={r.client_name} detalle={maquina(r)} onAbrir={() => abrir(r)}
              estado={[`Entregada ${cuando(r.date_returned)}`, r.final_price != null && `cobrado ${fmtEur(r.final_price)}`].filter(Boolean).join(' · ')} />
          )} />
        </>
      )}

      {alTaller && (
        <EncPregunta titulo="Al taller" texto={`${alTaller.tool_description} de ${alTaller.client_name}: ¿a qué taller va?`}
          sugerencias={talleres} boton="Enviar"
          onCancel={() => setAlTaller(null)}
          onOk={t => { const r = alTaller; setAlTaller(null); avanzar(r, 'en_taller', t ? { taller: t } : {}); }} />
      )}
      {entregar && (
        <ImporteModal titulo="Se la llevó" texto={`¿Cuánto se le cobra a ${entregar.client_name}?`}
          inicial={entregar.final_price ?? entregar.estimated_price} boton="Entregada"
          onCancel={() => setEntregar(null)}
          onOk={importe => { const r = entregar; setEntregar(null); avanzar(r, 'entregada', { final_price: importe ?? undefined }); }} />
      )}
      {nueva && (
        <NuevaReparacion conocidos={conocidos} talleres={talleres}
          onCerrar={() => setNueva(false)}
          onGuardada={r => { setNueva(false); setReps(prev => [r, ...prev]); show(`Reparación de ${r.client_name} apuntada`); }} />
      )}
    </div>
  );
}

function NuevaReparacion({ conocidos, talleres, onCerrar, onGuardada }: {
  conocidos: Map<string, string>; talleres: string[];
  onCerrar: () => void; onGuardada: (r: Rep) => void;
}) {
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [maq, setMaq] = useState('');
  const [marca, setMarca] = useState('');
  const [problema, setProblema] = useState('');
  const [taller, setTaller] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const escrito = !!(cliente.trim() || telefono.trim() || maq.trim() || marca.trim() || problema.trim() || taller.trim() || notas.trim());

  const guardar = async () => {
    if (!cliente.trim()) { setError('Falta el cliente'); return; }
    if (!maq.trim()) { setError('Falta qué máquina es'); return; }
    setGuardando(true); setError('');
    try {
      const { data } = await createRepair({
        client_name: cliente.trim(),
        client_phone: telefono.trim() || undefined,
        tool_description: maq.trim(),
        tool_brand: marca.trim() || undefined,
        problem_description: problema.trim(),
        taller: taller.trim() || undefined,
        notes: notas.trim() || undefined,
        status: 'recibida',
      });
      onGuardada(data);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar la reparación. Comprueba la conexión.'));
    } finally { setGuardando(false); }
  };

  return (
    <EncModal titulo="Nueva reparación" escrito={escrito} error={error} guardando={guardando} boton="Apuntar reparación"
      onCerrar={onCerrar} onGuardar={guardar}>
      <EncBloque n={1} titulo="Cliente">
        <CampoCliente cliente={cliente} telefono={telefono} setCliente={setCliente} setTelefono={setTelefono} conocidos={conocidos} />
      </EncBloque>
      <EncBloque n={2} titulo="La máquina">
        <div className="enc-2">
          <div>
            <label className="form-label" htmlFor="enc-maq">Qué es *</label>
            <input id="enc-maq" className="form-input" value={maq} onChange={e => setMaq(e.target.value)} placeholder="Taladro, motosierra…" />
          </div>
          <div>
            <label className="form-label" htmlFor="enc-marca">Marca y modelo</label>
            <input id="enc-marca" className="form-input" value={marca} onChange={e => setMarca(e.target.value)} placeholder="Bosch GSB 13" />
          </div>
        </div>
        <div>
          <label className="form-label" htmlFor="enc-prob">Qué le pasa</label>
          <input id="enc-prob" className="form-input" value={problema} onChange={e => setProblema(e.target.value)} placeholder="No arranca, pierde aceite…" />
        </div>
        <EncNota id="enc-notas" valor={notas} onChange={setNotas} placeholder="Trae la batería, viene sin cargador…" />
      </EncBloque>
      <EncBloque n={3} titulo="A qué taller" nota="si ya se sabe">
        <EncElegir id="enc-taller" valor={taller} onChange={setTaller} opciones={talleres} placeholder="Nombre del taller" />
      </EncBloque>
      <p className="enc-pie-nota">La fecha de entrada se pone sola. El presupuesto y cuándo estará se apuntan en la ficha, cuando te lo diga el taller.</p>
    </EncModal>
  );
}
