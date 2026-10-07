import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle, Copy, Lock, Plus, Trash2, AlertTriangle, Pencil, X } from 'lucide-react';
import {
  getCuadrante, getTurnosAjustes, putTurnoCambio, postVacaciones, deleteVacaciones, postFestivo, deleteFestivo,
  putTurnosAjustes, putEstaSemana, accesoEstado, accesoEncargado, describeApiError,
  type Cuadrante, type TurnoDia, type TurnosAjustes, type TurnoEmpleado,
} from '../api/client';
import { getYo, setYo, esEncargado, getRol, setSesion } from '../auth';
import { useCfToast } from '../components/CfToast';
import { ConnectionError } from '../components/ConnectionError';
import {
  iso, deIso, sumar, lunes, hoyIso, diaCorto, cap, fechaLarga, fechaCorta, rangoSemana, mesNombre, textoWhatsApp,
} from '../lib/turnos';

const errorDe = (err: unknown) => {
  const ax = err as { response?: { data?: { detail?: string } } };
  return ax.response?.data?.detail || describeApiError(err);
};

/* ── Celda de un día ─────────────────────────────────────────── */
function Celda({ t, onClick, compacta }: { t: TurnoDia; onClick?: () => void; compacta?: boolean }) {
  const corto = t.clase === 'trabajo' ? t.horario.replace(' · ', ' / ') : t.clase === 'festivo' ? t.horario : '';
  const contenido = (
    <>
      <span className="tc-nombre">{t.clase === 'libre' ? 'Libre' : t.nombre}</span>
      {!compacta && corto && <span className="tc-horario">{corto}</span>}
      {t.cambio && <span className="tc-cambio" title={t.nota || 'Cambiado a mano'} aria-label="Cambiado" />}
      {onClick && <Pencil className="tc-lapiz" size={13} />}
    </>
  );
  const cls = `tc tc-${t.clase}${t.tipo && t.clase === 'trabajo' && t.tipo !== 'jornada' ? ` tc-${t.tipo}` : ''}`;
  return onClick
    ? <button className={cls} onClick={onClick} title={t.nota || undefined}>{contenido}</button>
    : <div className={cls} title={t.nota || undefined}>{contenido}</div>;
}

/* ── Cambiar un día (solo encargado) ─────────────────────────── */
function EditarDia({ emp, t, aj, onClose, onSaved }: {
  emp: TurnoEmpleado; t: TurnoDia; aj: TurnosAjustes; onClose: () => void;
  onSaved: (msg: string, undo: () => Promise<void>) => void;
}) {
  const [nota, setNota] = useState(t.cambio ? t.nota || '' : '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const anterior = t.cambio ? (t.tipo ?? null) : null;
  const antNota = t.nota || undefined;

  const poner = async (tipo: string | null) => {
    setGuardando(true); setError(null);
    try {
      await putTurnoCambio(emp.id, t.fecha, tipo, nota);
      const tp = aj.tipos.find(x => x.id === tipo);
      const qué = tipo === null ? 'vuelve a su turno normal' : tipo === 'libre' ? 'libra' : `hace ${tp?.nombre.toLowerCase()} (${tp?.horario})`;
      onSaved(`${emp.nombre} ${qué} el ${fechaLarga(t.fecha)}`, async () => { await putTurnoCambio(emp.id, t.fecha, anterior, antNota); });
    } catch (e) { setError(errorDe(e)); setGuardando(false); }
  };

  const actual = t.cambio ? t.tipo : null;
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal turno-modal" role="dialog" aria-label={`Cambiar turno de ${emp.nombre}`}>
        <div className="turno-modal-head">
          <span className="turnohoy-avatar" style={{ background: emp.color }}>{emp.nombre.charAt(0)}</span>
          <div>
            <h3>{emp.nombre}</h3>
            <p>{cap(fechaLarga(t.fecha))}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <p className="turno-modal-ahora">
          Ahora: <b>{t.clase === 'trabajo' ? `${t.nombre} · ${t.horario}` : t.clase === 'festivo' ? `Festivo (${t.horario})` : t.nombre}</b>
          {t.cambio && <span className="turno-modal-tag">cambiado a mano</span>}
        </p>
        <label className="form-label">Motivo <small style={{ fontWeight: 400, color: 'var(--text-3)' }}>(opcional, lo verá {emp.nombre})</small>
          <input className="form-input" value={nota} maxLength={200} onChange={e => setNota(e.target.value)} placeholder="Ej.: cambio con Oscar, médico…" />
        </label>
        <div className="turno-opciones">
          {aj.tipos.map(tp => (
            <button key={tp.id} disabled={guardando} className={`turno-opcion${actual === tp.id ? ' on' : ''}`} onClick={() => poner(tp.id)}>
              <b>{tp.nombre}</b><small>{tp.horario}</small>
            </button>
          ))}
          <button disabled={guardando} className={`turno-opcion libre${actual === 'libre' ? ' on' : ''}`} onClick={() => poner('libre')}>
            <b>Libre</b><small>No trabaja</small>
          </button>
        </div>
        {error && <p className="acceso-error" role="alert">{error}</p>}
        <div className="turno-modal-pie">
          {t.cambio
            ? <button className="btn btn-ghost" disabled={guardando} onClick={() => poner(null)}>Volver a su turno normal</button>
            : <span className="turno-modal-ayuda">Para vacaciones de varios días usa «Vacaciones», más abajo.</span>}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Crear el código del encargado (la primera vez) ──────────── */
function CrearEncargado({ onHecho }: { onHecho: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); setEnviando(true); setError(null);
    try {
      const { data } = await accesoEncargado(codigo.trim());
      setSesion(data.token, data.rol);
      onHecho();
    } catch (err) { setError(errorDe(err)); } finally { setEnviando(false); }
  };
  return (
    <form className="card turnos-encargado" onSubmit={guardar}>
      <span className="turnohoy-ico"><Lock size={20} /></span>
      <div className="turnos-encargado-txt">
        <b>Andrés: crea tu código de encargado</b>
        <small>Solo con ese código se pueden cambiar turnos, vacaciones y festivos. El resto solo los ve. Este dispositivo quedará con tu sesión.</small>
      </div>
      <input className="form-input" type="password" inputMode="numeric" autoComplete="new-password" placeholder="Tu código (mín. 4)"
        value={codigo} onChange={e => setCodigo(e.target.value)} aria-label="Tu código de encargado" />
      <button className="btn btn-primary" disabled={enviando || codigo.trim().length < 4}>{enviando ? 'Guardando…' : 'Crear código'}</button>
      {error && <p className="acceso-error" role="alert" style={{ flexBasis: '100%' }}>{error}</p>}
    </form>
  );
}

/* ── Vacaciones ──────────────────────────────────────────────── */
function Vacaciones({ aj, editable, recargar, show }: {
  aj: TurnosAjustes; editable: boolean; recargar: () => void; show: ReturnType<typeof useCfToast>['show'];
}) {
  const [emp, setEmp] = useState('');
  const [ini, setIni] = useState('');
  const [fin, setFin] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hoy = hoyIso();
  const año = String(new Date().getFullYear());
  const lista = aj.vacaciones.filter(v => v.fin >= hoy).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const nombre = (id: string) => aj.empleados.find(e => e.id === id);
  const usados = (id: string) => aj.vacaciones.filter(v => v.empleado === id && v.inicio.startsWith(año)).reduce((s, v) => s + v.dias, 0);

  const añadir = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      await postVacaciones(emp, ini, fin || ini, nota);
      show(`Vacaciones de ${nombre(emp)?.nombre} guardadas`);
      setIni(''); setFin(''); setNota('');
      recargar();
    } catch (err) { setError(errorDe(err)); }
  };
  const borrar = async (v: TurnosAjustes['vacaciones'][number]) => {
    try {
      await deleteVacaciones(v.id);
      recargar();
      show(`Vacaciones de ${nombre(v.empleado)?.nombre} quitadas`, {
        undo: async () => { await postVacaciones(v.empleado, v.inicio, v.fin, v.nota || undefined); recargar(); },
      });
    } catch (err) { show(errorDe(err), { error: true }); }
  };

  return (
    <section className="card turnos-bloque" aria-label="Vacaciones">
      <h2>Vacaciones</h2>
      <div className="turnos-vac-resumen">
        {aj.empleados.map(e => (
          <span key={e.id}><span className="turno-dot" style={{ background: e.color }} />{e.nombre}: <b>{usados(e.id)}</b> días en {año}</span>
        ))}
      </div>
      {lista.length === 0
        ? <p className="turnos-vacio">No hay vacaciones apuntadas próximamente.</p>
        : (
          <ul className="turnos-lista">
            {lista.map(v => {
              const e = nombre(v.empleado);
              const ahora = v.inicio <= hoy && hoy <= v.fin;
              return (
                <li key={v.id}>
                  <span className="turno-dot" style={{ background: e?.color }} />
                  <span className="turnos-lista-txt">
                    <b>{e?.nombre ?? v.empleado}{ahora && <span className="turnos-ahora">De vacaciones</span>}</b>
                    <small>{v.inicio === v.fin ? cap(fechaLarga(v.inicio)) : `Del ${fechaCorta(v.inicio)} al ${fechaCorta(v.fin)}`} · {v.dias} día{v.dias !== 1 ? 's' : ''} de trabajo{v.nota ? ` · ${v.nota}` : ''}</small>
                  </span>
                  {editable && <button className="btn btn-ghost btn-sm turnos-quitar" onClick={() => borrar(v)} aria-label="Quitar"><Trash2 size={15} /></button>}
                </li>
              );
            })}
          </ul>
        )}
      {editable && (
        <form className="turnos-form turnos-form-vac" onSubmit={añadir}>
          <select className="form-input" value={emp} onChange={e => setEmp(e.target.value)} required aria-label="Empleado">
            <option value="">¿Quién?</option>
            {aj.empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <label className="turnos-fecha">Desde<input className="form-input" type="date" value={ini} required onChange={e => { setIni(e.target.value); if (!fin || fin < e.target.value) setFin(e.target.value); }} /></label>
          <label className="turnos-fecha">Hasta<input className="form-input" type="date" value={fin} min={ini} required onChange={e => setFin(e.target.value)} /></label>
          <input className="form-input" placeholder="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} />
          <button className="btn btn-primary" disabled={!emp || !ini}><Plus size={17} /> Añadir</button>
          {error && <p className="acceso-error" role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}

/* ── Festivos ────────────────────────────────────────────────── */
function Festivos({ aj, editable, recargar, show }: {
  aj: TurnosAjustes; editable: boolean; recargar: () => void; show: ReturnType<typeof useCfToast>['show'];
}) {
  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');
  const [todos, setTodos] = useState(false);
  const hoy = hoyIso();
  const prox = aj.festivos.filter(f => todos || f.fecha >= hoy);
  const añadir = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await postFestivo(fecha, nombre || 'Festivo'); setFecha(''); setNombre(''); recargar(); show('Festivo añadido'); }
    catch (err) { show(errorDe(err), { error: true }); }
  };
  const borrar = async (f: TurnosAjustes['festivos'][number]) => {
    try {
      await deleteFestivo(f.id); recargar();
      show(`Quitado el festivo del ${fechaCorta(f.fecha)}`, { undo: async () => { await postFestivo(f.fecha, f.nombre); recargar(); } });
    } catch (err) { show(errorDe(err), { error: true }); }
  };
  const ultimo = aj.festivos[aj.festivos.length - 1]?.fecha.slice(0, 4);
  const faltaAño = !ultimo || Number(ultimo) <= new Date().getFullYear() && new Date().getMonth() >= 10;
  return (
    <section className="card turnos-bloque" aria-label="Festivos">
      <h2>Festivos</h2>
      {editable && faltaAño && (
        <p className="turnos-aviso"><AlertTriangle size={16} /> Faltan los festivos de {new Date().getFullYear() + 1}. Añádelos cuando salga el calendario laboral.</p>
      )}
      {prox.length === 0 ? <p className="turnos-vacio">No quedan festivos este año.</p> : (
        <ul className="turnos-lista">
          {prox.map(f => (
            <li key={f.id} className={f.fecha < hoy ? 'pasado' : ''}>
              <span className="turnos-fest-fecha"><b>{deIso(f.fecha).getDate()}</b><small>{mesNombre(deIso(f.fecha).getMonth()).slice(0, 3)}</small></span>
              <span className="turnos-lista-txt"><b>{f.nombre}</b><small>{cap(diaCorto(f.fecha))} · {f.fecha.slice(0, 4)}</small></span>
              {editable && <button className="btn btn-ghost btn-sm turnos-quitar" onClick={() => borrar(f)} aria-label="Quitar"><Trash2 size={15} /></button>}
            </li>
          ))}
        </ul>
      )}
      <button className="turnos-link" onClick={() => setTodos(v => !v)}>{todos ? 'Ver solo los próximos' : 'Ver también los pasados'}</button>
      {editable && (
        <form className="turnos-form" onSubmit={añadir}>
          <input className="form-input" type="date" value={fecha} required onChange={e => setFecha(e.target.value)} aria-label="Fecha" />
          <input className="form-input" placeholder="Nombre (ej.: San Pedro)" value={nombre} onChange={e => setNombre(e.target.value)} />
          <button className="btn btn-primary" disabled={!fecha}><Plus size={17} /> Añadir</button>
        </form>
      )}
    </section>
  );
}

/* ── Rotación: semanas tipo (solo encargado) ─────────────────── */
function Rotacion({ aj, recargar, show }: { aj: TurnosAjustes; recargar: () => void; show: ReturnType<typeof useCfToast>['show'] }) {
  const [semanas, setSemanas] = useState(aj.semanas);
  const [tipos, setTipos] = useState(aj.tipos);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setSemanas(aj.semanas); setTipos(aj.tipos); }, [aj]);
  const cambiado = JSON.stringify(semanas) !== JSON.stringify(aj.semanas) || JSON.stringify(tipos) !== JSON.stringify(aj.tipos);
  const letras = 'ABCDEFGH';
  const horas = (s: string[]) => s.reduce((t, id) => t + (tipos.find(x => x.id === id)?.horas ?? 0), 0);

  const guardar = async () => {
    setGuardando(true);
    try {
      await putTurnosAjustes({ empleados: aj.empleados, tipos, semanas, ancla: aj.ancla, inicio: aj.inicio });
      show('Rotación guardada'); recargar();
    } catch (err) { show(errorDe(err), { error: true }); } finally { setGuardando(false); }
  };
  const moverEmp = async (emp: string, semana: number) => {
    const antes = aj.esta_semana[emp];
    try {
      await putEstaSemana(emp, semana); recargar();
      show(`Desde esta semana a ${aj.empleados.find(e => e.id === emp)?.nombre} le toca la ${letras[semana]}`, {
        undo: async () => { await putEstaSemana(emp, antes); recargar(); },
      });
    } catch (err) { show(errorDe(err), { error: true }); }
  };

  return (
    <section className="card turnos-bloque turnos-rotacion" aria-label="Rotación">
      <h2>Rotación</h2>
      <p className="turnos-ayuda">Cada uno pasa de una semana tipo a la siguiente cada lunes (A → B → C → D → A…). Los cambios de un día suelto se hacen tocando el día en el cuadrante.</p>

      <h3>Esta semana le toca a…</h3>
      <div className="turnos-esta">
        {aj.empleados.map(e => (
          <label key={e.id}>
            <span><span className="turno-dot" style={{ background: e.color }} />{e.nombre}</span>
            <select className="form-input" value={aj.esta_semana[e.id] ?? 0} onChange={ev => moverEmp(e.id, Number(ev.target.value))}>
              {aj.semanas.map((_, i) => <option key={i} value={i}>Semana {letras[i]}</option>)}
            </select>
          </label>
        ))}
      </div>

      <h3>Semanas tipo</h3>
      <div className="turnos-semtipo-wrap">
        <table className="turnos-semtipo">
          <thead><tr><th />{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => <th key={d}>{d}</th>)}<th>Horas</th></tr></thead>
          <tbody>
            {semanas.map((s, i) => (
              <tr key={i}>
                <th>{letras[i]}</th>
                {s.slice(0, 6).map((id, d) => (
                  <td key={d}>
                    <select className={`form-input sel-${id}`} value={id} aria-label={`Semana ${letras[i]}, día ${d + 1}`}
                      onChange={ev => setSemanas(ss => ss.map((w, wi) => wi === i ? w.map((x, xi) => xi === d ? ev.target.value : x) : w))}>
                      {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      <option value="libre">Libre</option>
                    </select>
                  </td>
                ))}
                <td className="turnos-horas">{horas(s)} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Horarios</h3>
      <div className="turnos-tipos">
        {tipos.map((t, i) => (
          <div key={t.id}>
            <b>{t.nombre}</b>
            <input className="form-input" value={t.horario} aria-label={`Horario de ${t.nombre}`}
              onChange={e => setTipos(ts => ts.map((x, xi) => xi === i ? { ...x, horario: e.target.value } : x))} />
            <label className="turnos-h"><input className="form-input" type="number" min={0} max={14} step={0.5} value={t.horas}
              onChange={e => setTipos(ts => ts.map((x, xi) => xi === i ? { ...x, horas: Number(e.target.value) } : x))} /> h</label>
          </div>
        ))}
      </div>
      <div className="turnos-guardar">
        {cambiado && <button className="btn btn-ghost" onClick={() => { setSemanas(aj.semanas); setTipos(aj.tipos); }}>Descartar</button>}
        <button className="btn btn-primary" disabled={!cambiado || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar rotación'}</button>
      </div>
    </section>
  );
}

/* ── Página ──────────────────────────────────────────────────── */
export function TurnosPage() {
  const [quien, setQuien] = useState<string>(() => getYo() || (getRol() === 'reparto' ? 'melchor' : 'todos'));
  const [semana, setSemana] = useState(() => iso(lunes(new Date())));
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [c, setC] = useState<Cuadrante | null>(null);
  const [cm, setCm] = useState<Cuadrante | null>(null);
  const [aj, setAj] = useState<TurnosAjustes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editar, setEditar] = useState<{ emp: TurnoEmpleado; t: TurnoDia } | null>(null);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [verPasados, setVerPasados] = useState(false);
  const [hayEncargado, setHayEncargado] = useState(true);
  const [admin, setAdmin] = useState(esEncargado());
  const { toast, show } = useCfToast();
  const hoy = hoyIso();
  const [yo, setYoS] = useState(getYo);

  // Rejilla del mes: de lunes a domingo, semanas completas
  const mesDesde = useMemo(() => lunes(mes), [mes]);
  const mesDias = useMemo(() => {
    const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    return Math.round((sumar(lunes(fin), 7).getTime() - mesDesde.getTime()) / 86400000);
  }, [mes, mesDesde]);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [a, b, m] = await Promise.all([getTurnosAjustes(), getCuadrante(semana, 7), getCuadrante(iso(mesDesde), mesDias)]);
      setAj(a.data); setC(b.data); setCm(m.data);
    } catch (e) { setError(describeApiError(e)); }
  }, [semana, mesDesde, mesDias]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (getRol() === 'reparto') return;
    accesoEstado().then(r => { setHayEncargado(!r.data.configurado || r.data.encargado); setAdmin(!r.data.configurado || r.data.rol === 'admin'); }).catch(() => { /* nada */ });
  }, []);

  const guardado = (msg: string, undo: () => Promise<void>) => {
    setEditar(null); cargar();
    show(msg, { undo: async () => { await undo(); cargar(); } });
  };

  const persona = c?.empleados.find(e => e.id === quien);
  const pasados = (c?.empleados[0]?.dias ?? []).filter(d => d.fecha < hoy).length;
  const personaMes = cm?.empleados.find(e => e.id === quien);
  const elegir = (id: string) => { setQuien(id); setDiaSel(null); };

  // Aviso de pocos en la tienda (de lunes a sábado)
  const cobertura = (c?.empleados[0]?.dias ?? []).map((d, i) => ({
    fecha: d.fecha, n: c!.empleados.filter(e => e.dias[i].clase === 'trabajo').length,
    cerrado: !!c!.festivos[d.fecha] || deIso(d.fecha).getDay() === 0,
  }));
  const avisos = cobertura.filter(x => !x.cerrado && x.n <= 1 && x.fecha >= hoy);

  const enviarWhatsApp = () => {
    if (!c || !aj) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(textoWhatsApp(c, aj.tipos))}`, '_blank', 'noopener');
  };
  const copiar = async () => {
    if (!c || !aj) return;
    try { await navigator.clipboard.writeText(textoWhatsApp(c, aj.tipos)); show('Turnos de la semana copiados'); }
    catch { show('No se pudo copiar', { error: true }); }
  };

  const horasMes = personaMes?.dias.filter(d => deIso(d.fecha).getMonth() === mes.getMonth()) ?? [];
  const resumenMes = {
    dias: horasMes.filter(d => d.clase === 'trabajo').length,
    horas: horasMes.reduce((t, d) => t + (d.clase === 'trabajo' ? d.horas : 0), 0),
    vac: horasMes.filter(d => d.clase === 'vacaciones' && deIso(d.fecha).getDay() !== 0).length,
  };
  const selT = personaMes?.dias.find(d => d.fecha === diaSel);

  return (
    <div className="page turnos">
      {error && <ConnectionError message={error} onRetry={cargar} />}

      <header className="inicio-head turnos-head">
        <div>
          <h1>Turnos</h1>
          <p>{quien === 'todos' ? `Semana ${rangoSemana(semana)}` : `${cap(mesNombre(mes.getMonth()))} de ${mes.getFullYear()}`}{!admin && ' · Solo Andrés puede cambiarlos'}</p>
        </div>
        <div className="turnos-nav" role="group" aria-label="Cambiar de fecha">
          <button className="btn btn-ghost turnos-flecha" aria-label="Anterior"
            onClick={() => quien === 'todos' ? (setVerPasados(true), setSemana(s => iso(sumar(deIso(s), -7)))) : setMes(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
            <ChevronLeft size={20} />
          </button>
          <button className="btn btn-ghost" onClick={() => { setSemana(iso(lunes(new Date()))); const d = new Date(); setMes(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hoy</button>
          <button className="btn btn-ghost turnos-flecha" aria-label="Siguiente"
            onClick={() => quien === 'todos' ? setSemana(s => iso(sumar(deIso(s), 7))) : setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
            <ChevronRight size={20} />
          </button>
        </div>
        {quien === 'todos' && admin && (
          <div className="turnos-compartir">
            <button className="btn btn-primary" onClick={enviarWhatsApp}><MessageCircle size={18} /> Enviar por WhatsApp</button>
            <button className="btn btn-ghost turnos-flecha" onClick={copiar} aria-label="Copiar la semana" title="Copiar la semana"><Copy size={18} /></button>
          </div>
        )}
      </header>

      {!hayEncargado && getRol() !== 'reparto' && <CrearEncargado onHecho={() => { setHayEncargado(true); setAdmin(true); show('Código de encargado creado. Ya puedes cambiar los turnos.'); }} />}

      <div className="turnos-chips" role="tablist" aria-label="De quién">
        <button role="tab" aria-selected={quien === 'todos'} className={`turno-chip${quien === 'todos' ? ' on' : ''}`} onClick={() => elegir('todos')}>Todos · semana</button>
        {(aj?.empleados ?? []).map(e => (
          <button key={e.id} role="tab" aria-selected={quien === e.id} className={`turno-chip${quien === e.id ? ' on' : ''}`}
            style={{ ['--emp' as string]: e.color }} onClick={() => elegir(e.id)}>
            <span className="turno-dot" style={{ background: e.color }} />{e.nombre}{e.id === yo && <small> (tú)</small>}
          </button>
        ))}
      </div>

      {quien === 'todos' && c && (
        <>
          {avisos.length > 0 && (
            <div className="turnos-aviso">
              <AlertTriangle size={17} />
              {avisos.map(a => `${cap(diaCorto(a.fecha))} ${deIso(a.fecha).getDate()}: ${a.n === 0 ? 'no hay nadie' : 'solo hay una persona'}`).join(' · ')}
            </div>
          )}

          {/* PC: cuadrante */}
          <section className="card turnos-cuadro" aria-label="Cuadrante de la semana">
            <table>
              <thead>
                <tr>
                  <th className="turnos-cuadro-emp" />
                  {c.empleados[0].dias.map(d => (
                    <th key={d.fecha} className={`${d.fecha === hoy ? 'hoy' : ''}${c.festivos[d.fecha] ? ' fest' : ''}`}>
                      <span>{cap(diaCorto(d.fecha))}</span> <b>{deIso(d.fecha).getDate()}</b>
                      {d.fecha === hoy && <em>Hoy</em>}
                    </th>
                  ))}
                  <th className="turnos-cuadro-h">Horas</th>
                </tr>
              </thead>
              <tbody>
                {c.empleados.map(e => (
                  <tr key={e.id} className={e.id === yo ? 'yo' : ''}>
                    <th className="turnos-cuadro-emp">
                      <button className="turnos-emp" onClick={() => elegir(e.id)} title={`Ver el mes de ${e.nombre}`}>
                        <span className="turnohoy-avatar sm" style={{ background: e.color }}>{e.nombre.charAt(0)}</span>
                        <span><b>{e.nombre}</b><small>Semana {e.dias[0]?.semana}</small></span>
                      </button>
                    </th>
                    {e.dias.map(d => (
                      <td key={d.fecha} className={d.fecha === hoy ? 'hoy' : ''}>
                        <Celda t={d} onClick={admin ? () => setEditar({ emp: e, t: d }) : undefined} />
                      </td>
                    ))}
                    <td className="turnos-horas">{e.dias.reduce((t, d) => t + (d.clase === 'trabajo' ? d.horas : 0), 0)} h</td>
                  </tr>
                ))}
                <tr className="turnos-cobertura">
                  <th className="turnos-cuadro-emp"><small>En la tienda</small></th>
                  {cobertura.map(x => (
                    <td key={x.fecha} className={x.fecha === hoy ? 'hoy' : ''}>
                      {x.cerrado && x.n === 0 ? <small>Cerrado</small> : <span className={`turnos-n${x.n <= 1 ? ' poco' : ''}`}>{x.n}</span>}
                    </td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </section>

          {/* Móvil: un día debajo de otro (los pasados, plegados) */}
          <div className="turnos-dias">
            {pasados > 0 && !verPasados && (
              <button className="btn btn-ghost turnos-pasados" onClick={() => setVerPasados(true)}>
                Ver {pasados === 1 ? 'el día anterior' : `los ${pasados} días anteriores`}
              </button>
            )}
            {c.empleados[0].dias.map((d, i) => {
              const fest = c.festivos[d.fecha];
              if (d.fecha < hoy && !verPasados) return null;
              return (
                <section key={d.fecha} className={`card turnos-dia${d.fecha === hoy ? ' hoy' : ''}${d.fecha < hoy ? ' pasado' : ''}`}>
                  <h3>{d.fecha === hoy ? 'Hoy · ' : ''}{cap(fechaLarga(d.fecha))}{fest && <small> · {fest}</small>}</h3>
                  <ul>
                    {c.empleados.map(e => (
                      <li key={e.id} className={e.id === yo ? 'yo' : ''}>
                        <span className="turnohoy-avatar sm" style={{ background: e.color }}>{e.nombre.charAt(0)}</span>
                        <span className="turnos-dia-nombre">{e.nombre}</span>
                        <Celda t={e.dias[i]} onClick={admin ? () => setEditar({ emp: e, t: e.dias[i] }) : undefined} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="turnos-leyenda">
            <span><i className="tc-trabajo" />Trabaja</span><span><i className="tc-libre" />Libre</span>
            <span><i className="tc-vacaciones" />Vacaciones</span><span><i className="tc-festivo" />Festivo</span>
            <span><i className="tc-cambio-l" />Cambiado a mano</span>
            {admin && <span className="turnos-leyenda-tip"><Pencil size={13} /> Toca un día para cambiarlo</span>}
          </div>
        </>
      )}

      {quien !== 'todos' && persona && personaMes && (
        <section className="card turnos-mes" style={{ ['--emp' as string]: persona.color }} aria-label={`Mes de ${persona.nombre}`}>
          <div className="turnos-mes-head">
            <span className="turnohoy-avatar" style={{ background: persona.color }}>{persona.nombre.charAt(0)}</span>
            <div>
              <h2>{persona.nombre}</h2>
              <p>{resumenMes.dias} días de trabajo · {resumenMes.horas} h{resumenMes.vac ? ` · ${resumenMes.vac} de vacaciones` : ''}</p>
            </div>
            {quien !== yo && getRol() !== 'reparto' && (
              <button className="turnos-link" onClick={() => { setYo(quien); setYoS(quien); show(`Este dispositivo es de ${persona.nombre}`); }}>Soy {persona.nombre}</button>
            )}
          </div>
          <div className="turnos-cal" role="grid">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => <span key={d} className="turnos-cal-cab">{d}</span>)}
            {personaMes.dias.map(d => {
              const fuera = deIso(d.fecha).getMonth() !== mes.getMonth();
              return (
                <button key={d.fecha}
                  className={`turnos-cal-dia tc-${d.clase}${d.fecha === hoy ? ' hoy' : ''}${fuera ? ' fuera' : ''}${diaSel === d.fecha ? ' sel' : ''}`}
                  onClick={() => setDiaSel(d.fecha === diaSel ? null : d.fecha)}
                  aria-label={`${fechaLarga(d.fecha)}: ${d.nombre}`}>
                  <b>{deIso(d.fecha).getDate()}</b>
                  <span>{d.clase === 'trabajo' ? d.nombre : d.clase === 'libre' ? 'Libre' : d.clase === 'festivo' ? 'Festivo' : 'Vacac.'}</span>
                  {d.cambio && <i className="tc-cambio" />}
                </button>
              );
            })}
          </div>
          {selT ? (
            <div className="turnos-mes-sel cf-enter">
              <div>
                <b>{cap(fechaLarga(selT.fecha))}</b>
                <span>{selT.clase === 'trabajo' ? `${selT.nombre} · ${selT.horario}` : selT.clase === 'festivo' ? `Festivo · ${selT.horario}` : selT.nombre}</span>
                {selT.nota && <small>{selT.nota}</small>}
              </div>
              {admin && <button className="btn btn-primary btn-sm" onClick={() => setEditar({ emp: persona, t: selT })}><Pencil size={14} /> Cambiar</button>}
            </div>
          ) : <p className="turnos-ayuda">Toca un día para ver el horario{admin ? ' o cambiarlo' : ''}.</p>}
        </section>
      )}

      {aj && (
        <div className="turnos-gestion">
          <Vacaciones aj={aj} editable={admin} recargar={cargar} show={show} />
          <Festivos aj={aj} editable={admin} recargar={cargar} show={show} />
        </div>
      )}
      {aj && admin && <Rotacion aj={aj} recargar={cargar} show={show} />}

      {editar && aj && <EditarDia emp={editar.emp} t={editar.t} aj={aj} onClose={() => setEditar(null)} onSaved={guardado} />}
      {toast}
    </div>
  );
}
