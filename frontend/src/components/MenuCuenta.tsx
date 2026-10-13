import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, BellOff, CalendarDays, ChevronRight, KeyRound, LogOut, Play, SlidersHorizontal, Users } from 'lucide-react';
import { getCuadrante, type Cuadrante, type TurnoDia } from '../api/client';
import { cerrarSesion, getPersona, getRol, getYo, sesionPersonal } from '../auth';
import { activarAvisos, desactivarAvisos, estadoAvisos, type EstadoAvisos } from '../lib/avisos';
import { hoyIso } from '../lib/turnos';
import { abrirTutorial } from './Tutorial';
import { MiCodigoModal } from './MiCodigoModal';
import { CodigosModal } from './CodigosModal';

const NOMBRES: Record<string, string> = { andres: 'Andrés', patricia: 'Patricia', oscar: 'Oscar', melchor: 'Melchor', manolo: 'Manolo' };
const ROL: Record<string, string> = { admin: 'Encargado', tienda: 'Tienda', reparto: 'Reparto', consulta: 'Consulta' };

/** «8:30–13:30 y 14:30–18:30», «Libras», «Festivo»… */
export function horarioDe(t?: TurnoDia): string {
  if (!t) return '';
  if (t.clase === 'trabajo') return t.horario.replace(' · ', ' y ');
  if (t.clase === 'festivo') return t.horario ? `Festivo · ${t.horario}` : 'Festivo';
  return t.clase === 'vacaciones' ? 'Vacaciones' : 'Libras';
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const diaDe = (f: string) => { const [y, m, d] = f.split('-').map(Number); return DIAS[new Date(y, m - 1, d).getDay()]; };

/**
 * El círculo con tu inicial (arriba a la derecha) y su tarjeta: tus turnos y lo tuyo
 * (avisos, código, tutorial, cerrar sesión). En los equipos de la tienda, «T» y los turnos de todos.
 */
export function MenuCuenta({ className = '', lateral = false }: { className?: string; lateral?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [abierto, setAbierto] = useState(false);
  const [c, setC] = useState<Cuadrante | null>(null);
  const [avisos, setAvisos] = useState<EstadoAvisos | null>(null);
  const [modal, setModal] = useState<'mio' | 'codigos' | null>(null);
  // En el menú lateral la tarjeta va fuera del menú (que recorta lo que sobresale)
  const [pos, setPos] = useState<React.CSSProperties | undefined>(undefined);
  const caja = useRef<HTMLDivElement>(null);
  const rol = getRol();
  const personal = sesionPersonal();
  const yo = personal ? (getYo() || getPersona()) : '';
  const nombre = personal ? (NOMBRES[yo] || yo) : 'Tienda';
  const emp = c?.empleados.find(e => e.id === yo);
  const color = emp?.color || (personal ? 'var(--cf-bosque)' : 'var(--cf-grafito)');

  // Turnos: hoy y los próximos días (para «el siguiente día que trabajas»)
  useEffect(() => { getCuadrante(hoyIso(), 8).then(r => setC(r.data)).catch(() => { /* sin turnos */ }); }, []);
  useEffect(() => { if (abierto) estadoAvisos().then(setAvisos).catch(() => {}); }, [abierto]);
  useEffect(() => { setAbierto(false); }, [location.pathname]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera);
    window.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); window.removeEventListener('keydown', tecla); };
  }, [abierto]);

  const proximo = emp ? emp.dias.slice(2).find(d => d.clase === 'trabajo') : undefined;
  const ir = (to: string) => { setAbierto(false); navigate(to); };

  return (
    <div className={`cuenta ${lateral ? 'cuenta-lateral ' : ''}${className}`} ref={caja}>
      {lateral ? (
        <button className="cuenta-fila" onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ position: 'fixed', left: r.left, bottom: window.innerHeight - r.top + 8, top: 'auto', right: 'auto' });
          setAbierto(v => !v);
        }} aria-expanded={abierto} aria-label={`${nombre}: tus turnos y opciones`}>
          <span className="cuenta-ava" style={{ background: color }}>{nombre.charAt(0)}</span>
          <span className="cuenta-fila-txt"><b>{nombre}</b><small>{emp?.dias[0] ? `Hoy: ${horarioDe(emp.dias[0])}` : 'Tu cuenta'}</small></span>
        </button>
      ) : (
        <button className="cuenta-ava" style={{ background: color }} onClick={() => setAbierto(v => !v)}
          aria-expanded={abierto} aria-label={`${nombre}: tus turnos y opciones`} data-tour="cuenta">
          {nombre.charAt(0)}
        </button>
      )}
      {abierto && (
        <div className="cuenta-panel" role="dialog" aria-label="Tu cuenta" style={lateral ? pos : undefined}>
          <div className="cuenta-cab">
            <span className="cuenta-ava grande" style={{ background: color }}>{nombre.charAt(0)}</span>
            <span>
              <b>{nombre}</b>
              <small>{personal ? `${ROL[rol || ''] || ''} · este dispositivo es tuyo` : 'Ordenador o teléfono de la tienda'}</small>
            </span>
          </div>

          {c && emp && (
            <button className="cuenta-turnos" onClick={() => ir('/turnos')}>
              <span><em>Hoy</em><b className={emp.dias[0]?.clase !== 'trabajo' ? 'libre' : ''}>{horarioDe(emp.dias[0])}</b></span>
              <span><em>Mañana</em><b className={emp.dias[1]?.clase !== 'trabajo' ? 'libre' : ''}>{horarioDe(emp.dias[1])}</b></span>
              {emp.dias[1]?.clase !== 'trabajo' && proximo && (
                <span><em>{diaDe(proximo.fecha).replace(/^./, x => x.toUpperCase())}</em><b>{horarioDe(proximo)}</b></span>
              )}
            </button>
          )}
          {c && !emp && c.empleados.length > 0 && (
            <button className="cuenta-turnos" onClick={() => ir('/turnos')}>
              <small className="cuenta-turnos-tit">Turnos de hoy</small>
              {c.empleados.map(e => (
                <span key={e.id}><em><i style={{ background: e.color }} />{e.nombre}</em>
                  <b className={e.dias[0]?.clase !== 'trabajo' ? 'libre' : ''}>{horarioDe(e.dias[0])}</b></span>
              ))}
            </button>
          )}

          <div className="cuenta-items">
            <button onClick={() => ir('/turnos')}><CalendarDays size={18} /> {emp ? 'Mis turnos' : 'Turnos'}<small>semana y mes</small><ChevronRight size={16} /></button>
            {avisos === 'activados' && (
              <button onClick={async () => { if (window.confirm('¿Quitar los avisos en este dispositivo?')) { await desactivarAvisos(); setAvisos('desactivados'); } }}>
                <Bell size={18} /> Avisos<small>activados</small>
              </button>
            )}
            {avisos === 'desactivados' && (
              <button onClick={async () => { try { setAvisos(await activarAvisos()); } catch { /* nada */ } }}>
                <BellOff size={18} /> Activar avisos<small>en este dispositivo</small>
              </button>
            )}
            {personal && <button onClick={() => setModal('mio')}><KeyRound size={18} /> Mi código</button>}
            {rol === 'admin' && <button onClick={() => setModal('codigos')}><Users size={18} /> Códigos de acceso</button>}
            {rol === 'admin' && <button onClick={() => ir('/ajustes')}><SlidersHorizontal size={18} /> Márgenes y precios<ChevronRight size={16} /></button>}
            {rol !== 'reparto' && <button onClick={() => { setAbierto(false); abrirTutorial(); }}><Play size={18} /> Ver el tutorial</button>}
            <button className="cuenta-salir" onClick={() => { if (window.confirm('¿Cerrar la sesión en este dispositivo? Habrá que volver a escribir el código.')) { cerrarSesion(); window.location.href = '/'; } }}>
              <LogOut size={18} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
      {modal === 'mio' && <MiCodigoModal onClose={() => setModal(null)} />}
      {modal === 'codigos' && <CodigosModal onClose={() => setModal(null)} />}
    </div>
  );
}
