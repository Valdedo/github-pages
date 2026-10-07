import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ArrowUpRight } from 'lucide-react';
import { getTurnosHoy, type Cuadrante, type TurnoDia } from '../api/client';
import { getYo, setYo, sesionPersonal } from '../auth';
import { actualizarPersona } from '../lib/avisos';

function Linea({ titulo, t }: { titulo: string; t?: TurnoDia }) {
  if (!t) return null;
  const libre = t.clase !== 'trabajo';
  return (
    <div className={`turnohoy-dia${libre ? ' libre' : ''}`}>
      <span className="turnohoy-cuando">{titulo}</span>
      <b>{t.clase === 'trabajo'
        ? t.horario.split(' · ').map((h, i) => <span key={i} className="turnohoy-tramo">{h}</span>)
        : t.clase === 'festivo' ? `Festivo · ${t.horario}` : t.clase === 'vacaciones' ? 'Vacaciones' : 'Libras'}</b>
      {t.clase === 'trabajo' && t.tipo !== 'jornada' && <small>{t.nombre}</small>}
      {t.nota && <small>{t.nota}</small>}
    </div>
  );
}

/** Tarjeta «Tu turno» de Inicio y de la pantalla de reparto. */
export function TurnoHoy({ fijo, enlace = '/turnos' }: { fijo?: string; enlace?: string }) {
  const [c, setC] = useState<Cuadrante | null>(null);
  const [yo, setYoState] = useState(() => fijo || getYo());

  useEffect(() => {
    const cargar = () => getTurnosHoy().then(r => setC(r.data)).catch(() => { /* sin turnos: no se enseña */ });
    cargar();
    const t = setInterval(cargar, 10 * 60000);
    return () => clearInterval(t);
  }, []);

  if (!c?.empleados.length) return null;
  const elegir = (id: string) => { setYo(id); setYoState(id); actualizarPersona(); };
  const mio = c.empleados.find(e => e.id === yo);
  const hoyTrabajan = c.empleados.filter(e => e.dias[0]?.clase === 'trabajo');

  if (!mio) {
    return (
      <section className="card turnohoy" aria-label="Tu turno">
        <div className="turnohoy-quien">
          <span className="turnohoy-ico"><CalendarDays size={20} /></span>
          <div>
            <b>¿Quién eres?</b>
            <small>Elígelo una vez y aquí verás tu turno de hoy y de mañana.</small>
          </div>
        </div>
        <div className="turnohoy-chips">
          {c.empleados.map(e => (
            <button key={e.id} className="turno-chip" onClick={() => elegir(e.id)}>
              <span className="turno-dot" style={{ background: e.color }} />{e.nombre}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="card turnohoy" aria-label="Tu turno" style={{ ['--emp' as string]: mio.color }}>
      <div className="turnohoy-yo">
        <span className="turnohoy-avatar">{mio.nombre.charAt(0)}</span>
        <div>
          <span className="turnohoy-label">Tu turno, {mio.nombre}</span>
          {!fijo && !sesionPersonal() && <button className="turnohoy-cambiar" onClick={() => elegir('')}>No soy {mio.nombre}</button>}
        </div>
      </div>
      <Linea titulo="Hoy" t={mio.dias[0]} />
      <Linea titulo="Mañana" t={mio.dias[1]} />
      <div className="turnohoy-equipo">
        <span className="turnohoy-cuando">Hoy en la tienda</span>
        <span className="turnohoy-caras">
          {hoyTrabajan.length === 0 ? <small>Nadie: cerrado</small> : hoyTrabajan.map(e => (
            <span key={e.id} className="turnohoy-cara" title={e.nombre} style={{ background: e.color }}>{e.nombre.charAt(0)}</span>
          ))}
        </span>
        {hoyTrabajan.length > 0 && <small>{hoyTrabajan.map(e => e.nombre).join(', ')}</small>}
      </div>
      <Link to={enlace} className="turnohoy-ver" aria-label="Ver todos los turnos">
        Ver turnos <ArrowUpRight size={16} strokeWidth={2.6} />
      </Link>
    </section>
  );
}
