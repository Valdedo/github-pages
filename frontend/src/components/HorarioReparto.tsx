import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { getCuadrante, type Cuadrante, type TurnoDia } from '../api/client';
import { cap, deIso, diaLargo, hoyIso, iso, lunes, mesNombre } from '../lib/turnos';
import '../horario.css';

/**
 * El horario de Melchor en su pantalla de reparto (Andrés, 20/10/2026, opción C de tres: «es nulo para la tecnología»).
 * El turno de hoy va en la cabecera verde (HoyCabecera); debajo de lo de cargar, lo que queda de semana y la semana
 * que viene, un día por renglón (HorarioReparto), y «Ver más turnos» para la página de turnos.
 */

/** «8:30» y «18:30»: a qué hora entra y a qué hora sale (la comida es siempre de 13:30 a 14:30). */
export function entraSale(t?: TurnoDia): { entra: string; sale: string } | null {
  if (!t || t.clase !== 'trabajo') return null;
  const horas = t.horario.match(/\d{1,2}:\d{2}/g) || [];
  return horas.length >= 2 ? { entra: horas[0]!, sale: horas[horas.length - 1]! } : null;
}
const partido = (t?: TurnoDia) => (t?.horario.match(/\d{1,2}:\d{2}/g) || []).length >= 4;

/** Lo que se pone si ese día no trabaja (en la cabecera ya pone «Hoy, martes 20»). */
function sinTrabajo(t?: TurnoDia, hoy = false): string {
  if (!t) return '';
  if (t.clase === 'vacaciones') return hoy ? 'Estás de vacaciones' : 'Vacaciones';
  if (t.clase === 'festivo') return 'Festivo';
  return 'Libras';
}

/** Esta semana y la que viene (de lunes a domingo), del cuadrante. */
function useSemanas(yo: string) {
  const [c, setC] = useState<Cuadrante | null>(null);
  const desde = iso(lunes(new Date()));
  useEffect(() => {
    const cargar = () => getCuadrante(desde, 14).then(r => setC(r.data)).catch(() => { /* sin turnos: no se enseña */ });
    cargar();
    const t = setInterval(cargar, 10 * 60000);
    return () => clearInterval(t);
  }, [desde]);
  const emp = c?.empleados.find(e => e.id === yo);
  if (!c || !emp) return null;
  // El domingo solo si se trabaja (la tienda cierra)
  const dias = (de: number) => emp.dias.slice(de, de + 7).filter(d => deIso(d.fecha).getDay() !== 0 || d.clase === 'trabajo');
  return { hoy: emp.dias.find(d => d.fecha === hoyIso()), esta: dias(0), viene: dias(7), festivos: c.festivos };
}

const deA = (dias: TurnoDia[]) => {
  if (!dias.length) return '';
  const a = deIso(dias[0]!.fecha), b = deIso(dias[dias.length - 1]!.fecha);
  return a.getMonth() === b.getMonth()
    ? `del ${a.getDate()} al ${b.getDate()} de ${mesNombre(b.getMonth())}`
    : `del ${a.getDate()} de ${mesNombre(a.getMonth())} al ${b.getDate()} de ${mesNombre(b.getMonth())}`;
};

/** El turno de hoy, grande, dentro de la cabecera verde: «Entras 8:30 → Sales 18:30». */
export function HoyCabecera({ yo }: { yo: string }) {
  const s = useSemanas(yo);
  const t = s?.hoy;
  if (!s || !t) return null;
  const es = entraSale(t);
  const festivo = t.clase === 'festivo' ? s.festivos[t.fecha] : '';
  return (
    <div className={`hr-hoy${es ? '' : ' libre'}`}>
      <span className="hr-hoy-fecha">Hoy, {diaLargo(t.fecha)} {deIso(t.fecha).getDate()}</span>
      {es ? (
        <>
          <span className="hr-hoy-horas">
            <span><small>Entras</small><b>{es.entra}</b></span>
            <span className="hr-hoy-flecha" aria-hidden>→</span>
            <span><small>Sales</small><b>{es.sale}</b></span>
          </span>
          {partido(t) && <span className="hr-hoy-nota">Comida de 13:30 a 14:30</span>}
        </>
      ) : (
        <b className="hr-hoy-libre">{sinTrabajo(t, true)}{festivo ? ` · ${festivo}` : ''}</b>
      )}
      {t.nota && <span className="hr-hoy-nota">{t.nota}</span>}
    </div>
  );
}

function Semana({ titulo, dias, desde }: { titulo: string; dias: TurnoDia[]; desde: string }) {
  const ver = dias.filter(d => d.fecha > desde);
  if (!ver.length) return null;
  return (
    <div className="hr-semana">
      <div className="hr-semana-tit">{titulo} <small>{deA(dias)}</small></div>
      <ul className="hr-lista">
        {ver.map(d => {
          const es = entraSale(d);
          return (
            <li key={d.fecha} className={es ? '' : 'libre'}>
              <span className="hr-lista-fila">
                <span className="hr-lista-dia">{cap(diaLargo(d.fecha))} <b>{deIso(d.fecha).getDate()}</b></span>
                {es ? <span className="hr-lista-horas">de <b>{es.entra}</b> a <b>{es.sale}</b></span>
                  : <span className="hr-lista-libre">{sinTrabajo(d)}</span>}
              </span>
              {d.nota && <small className="hr-lista-nota">{d.nota}</small>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** «Tu horario»: lo que queda de esta semana (desde mañana) y la semana que viene, y «Ver más turnos». */
export function HorarioReparto({ yo }: { yo: string }) {
  const s = useSemanas(yo);
  if (!s) return null;
  const hoy = hoyIso();
  return (
    <section className="card hr" aria-label="Tu horario">
      <div className="hr-cab"><CalendarDays size={20} /> Tu horario</div>
      <Semana titulo="Esta semana" dias={s.esta} desde={hoy} />
      <Semana titulo="La semana que viene" dias={s.viene} desde={hoy} />
      <Link to="/turnos" className="hr-vermas">Ver más turnos <ChevronRight size={20} strokeWidth={2.6} /></Link>
    </section>
  );
}
