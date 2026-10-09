import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, FileText } from 'lucide-react';
import { getVencimientos, type VencFila, type VencResumen } from '../api/client';
import { esEncargado } from '../auth';
import './VencimientosCard.css';

const fmtEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);
const euros = (v?: number | null) => fmtEur.format(v ?? 0);
const RELATIVOS = ['Hoy', 'Mañana', 'Pasado mañana'];
/** «viernes 9 oct» bajo Hoy/Mañana; «11 oct» bajo un día de la semana (ya lleva el nombre). */
const subDia = (iso: string, etiqueta: string) => {
  const d = new Date(`${iso}T12:00`);
  const mes = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return RELATIVOS.includes(etiqueta) ? `${d.toLocaleDateString('es-ES', { weekday: 'long' })} ${d.getDate()} ${mes}` : `${d.getDate()} ${mes}`;
};
const fechaCorta = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00`);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
};

function Factura({ f, conFecha }: { f: VencFila; conFecha?: boolean }) {
  const detalle = [
    conFecha ? fechaCorta(f.fecha) : '',
    f.plazos > 1 ? `plazo ${f.plazo} de ${f.plazos}` : '',
    f.numero ? `n.º ${f.numero}` : '',
    f.forma_pago || '',
  ].filter(Boolean).join(' · ');
  const dentro = (
    <>
      <span className="venc-fac-txt"><b>{f.proveedor || 'Proveedor sin leer'}</b>{detalle && <small>{detalle}</small>}</span>
      <span className="venc-fac-imp">{f.importe != null ? euros(f.importe) : '—'}</span>
    </>
  );
  return (
    <li>
      {f.url ? <a href={f.url} target="_blank" rel="noreferrer" title="Abrir la factura">{dentro}</a> : <div>{dentro}</div>}
    </li>
  );
}

/** Facturas de proveedor que vencen hoy, mañana y pasado (el viernes, hasta el lunes). Solo Andrés. */
export function VencimientosCard() {
  const [d, setD] = useState<VencResumen | null>(null);
  const [error, setError] = useState(false);
  const [ver, setVer] = useState<'' | 'proximos' | 'sin'>('');
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
      <div className="venc-cab">
        <span className="venc-ico"><CalendarClock size={19} /></span>
        <h2>Vencimientos</h2>
        <span className="venc-sub">
          {nada ? (viernes ? 'Nada hasta el lunes' : 'Nada en estos días') : `${euros(total)} ${viernes ? 'hasta el lunes' : 'en tres días'}`}
        </span>
      </div>

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

      <div className="venc-pie">
        {d.proximos.length > 0 && (
          <button className={`venc-mas${ver === 'proximos' ? ' abierto' : ''}`} onClick={() => setVer(v => (v === 'proximos' ? '' : 'proximos'))}>
            Próximo mes: {d.proximos.length} factura{d.proximos.length !== 1 ? 's' : ''} · {euros(d.proximos_total)} <ChevronDown size={16} />
          </button>
        )}
        {d.sin_fecha.length > 0 && (
          <button className={`venc-mas aviso${ver === 'sin' ? ' abierto' : ''}`} onClick={() => setVer(v => (v === 'sin' ? '' : 'sin'))}>
            <FileText size={15} /> {d.sin_fecha.length} sin fecha de vencimiento <ChevronDown size={16} />
          </button>
        )}
      </div>
      {ver === 'proximos' && <ul className="venc-lista venc-extra">{d.proximos.map(f => <Factura key={f.id} f={f} conFecha />)}</ul>}
      {ver === 'sin' && (
        <>
          <p className="venc-nota">Estas facturas no dicen cuándo vencen.</p>
          <ul className="venc-lista venc-extra">{d.sin_fecha.map(f => <Factura key={f.id} f={{ ...f, importe: f.importe ?? f.importe_factura }} />)}</ul>
        </>
      )}
    </section>
  );
}
