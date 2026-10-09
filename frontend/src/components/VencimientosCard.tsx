import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { getVencimientos, type VencResumen } from '../api/client';
import { esEncargado } from '../auth';
import { AvisoAtrasado, euros, Factura, Grandes } from './VencComun';
import './VencimientosCard.css';

const RELATIVOS = ['Hoy', 'Mañana', 'Pasado mañana'];
/** «viernes 9 oct» bajo Hoy/Mañana; «11 oct» bajo un día de la semana (ya lleva el nombre). */
const subDia = (iso: string, etiqueta: string) => {
  const d = new Date(`${iso}T12:00`);
  const mes = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return RELATIVOS.includes(etiqueta) ? `${d.toLocaleDateString('es-ES', { weekday: 'long' })} ${d.getDate()} ${mes}` : `${d.getDate()} ${mes}`;
};

/** Inicio: lo que vence hoy, mañana y pasado (el viernes, hasta el lunes). Solo Andrés. El detalle, en /vencimientos. */
export function VencimientosCard() {
  const [d, setD] = useState<VencResumen | null>(null);
  const [error, setError] = useState(false);
  const cargar = useCallback(() => {
    getVencimientos().then(({ data }) => { setD(data); setError(false); }).catch(() => setError(true));
  }, []);
  useEffect(() => {
    if (!esEncargado()) return;
    cargar();
    const t = setInterval(cargar, 15 * 60000);
    return () => clearInterval(t);
  }, [cargar]);

  if (!esEncargado()) return null;
  if (!d) {
    return error ? (
      <section className="card venc-card venc-tranquila" aria-label="Vencimientos">
        <span className="venc-ico"><CalendarClock size={20} /></span>
        <span>No se han podido mirar los vencimientos ahora mismo.</span>
      </section>
    ) : null;
  }
  if (!d.conectado) {
    return (
      <section className="card venc-card venc-tranquila" aria-label="Vencimientos">
        <span className="venc-ico"><CalendarClock size={20} /></span>
        <span>Vencimientos de facturas: esperando a que el script de facturas mande los primeros datos.</span>
      </section>
    );
  }

  const total = d.dias.reduce((t, g) => t + g.total, 0);
  const nada = d.dias.every(g => g.facturas.length === 0);
  const viernes = d.dias.length > 3;

  return (
    <section className="card venc-card" aria-label="Vencimientos de facturas">
      <Link to="/vencimientos" className="venc-cab venc-cab-link">
        <span className="venc-ico"><CalendarClock size={19} /></span>
        <h2>Vencimientos</h2>
        <span className="venc-sub">
          {nada ? (viernes ? 'Nada hasta el lunes' : 'Nada en estos días') : `${euros(total)} ${viernes ? 'hasta el lunes' : 'en tres días'}`}
        </span>
        <span className="venc-ver">Ver todo <ChevronRight size={16} /></span>
      </Link>

      <AvisoAtrasado dias={d.atrasado} />
      <Grandes lista={d.grandes} />

      <div className={`venc-dias${viernes ? ' cuatro' : ''}`}>
        {d.dias.map((g, i) => (
          <div key={g.fecha} className={`venc-dia${i === 0 ? ' hoy' : ''}${g.finde ? ' finde' : ''}${g.facturas.length ? '' : ' vacio'}`}>
            <div className="venc-dia-cab">
              <span className="venc-dia-et">{g.etiqueta}</span>
              <span className="venc-dia-fecha">{subDia(g.fecha, g.etiqueta)}</span>
              <span className="venc-dia-total">{g.facturas.length ? euros(g.total) : 'Nada'}</span>
            </div>
            {g.facturas.length > 0 && <ul className="venc-lista">{g.facturas.map(f => <Factura key={f.id} f={f} />)}</ul>}
          </div>
        ))}
      </div>

      <Link to="/vencimientos" className="venc-mas venc-mas-link">
        {d.proximos.length > 0
          ? <>Después: {d.proximos.length} factura{d.proximos.length !== 1 ? 's' : ''} este mes · {euros(d.proximos_total)}</>
          : <>Ver semanas, proveedores y avisos</>}
        {d.sin_fecha.length > 0 && <span className="venc-mas-aviso">{d.sin_fecha.length} sin fecha</span>}
        <ChevronRight size={16} />
      </Link>
    </section>
  );
}
