import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ArrowUpRight } from 'lucide-react';
import { getTurnosHoy, type Cuadrante, type TurnoDia } from '../api/client';
import { getYo, sesionPersonal } from '../auth';

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
  // Turno propio solo en el móvil de cada uno (código personal); en los equipos de la tienda, el de todos
  const yo = fijo || (sesionPersonal() ? getYo() : '');

  useEffect(() => {
    const cargar = () => getTurnosHoy().then(r => setC(r.data)).catch(() => { /* sin turnos: no se enseña */ });
    cargar();
    const t = setInterval(cargar, 10 * 60000);
    return () => clearInterval(t);
  }, []);

  if (!c?.empleados.length) return null;
  const mio = c.empleados.find(e => e.id === yo);
  const hoyTrabajan = c.empleados.filter(e => e.dias[0]?.clase === 'trabajo');

  if (!mio) {
    const corto = (t?: TurnoDia) => !t ? '' : t.clase === 'trabajo'
      ? t.horario.replace(' · ', ' y ') : t.clase === 'festivo' ? 'Festivo' : t.clase === 'vacaciones' ? 'Vacaciones' : 'Libra';
    return (
      <section className="card turnohoy turnohoy-equipo-hoy" aria-label="Turnos de hoy">
        <div className="turnohoy-yo">
          <span className="turnohoy-ico"><CalendarDays size={20} /></span>
          <span className="turnohoy-label">Turnos de hoy</span>
        </div>
        <ul className="turnohoy-lista">
          {c.empleados.map(e => (
            <li key={e.id} className={e.dias[0]?.clase !== 'trabajo' ? 'libre' : ''}>
              <span className="turnohoy-cara" style={{ background: e.color }}>{e.nombre.charAt(0)}</span>
              <span><b>{e.nombre}</b><small>{corto(e.dias[0])}</small></span>
            </li>
          ))}
        </ul>
        <Link to={enlace} className="turnohoy-ver" aria-label="Ver todos los turnos">
          Ver turnos <ArrowUpRight size={16} strokeWidth={2.6} />
        </Link>
      </section>
    );
  }

  return (
    <section className="card turnohoy" aria-label="Tu turno" style={{ ['--emp' as string]: mio.color }}>
      <div className="turnohoy-yo">
        <span className="turnohoy-avatar">{mio.nombre.charAt(0)}</span>
        <div>
          <span className="turnohoy-label">Tu turno, {mio.nombre}</span>
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
