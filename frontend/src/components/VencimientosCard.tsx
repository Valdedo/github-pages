import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronDown, FileText, Settings2 } from 'lucide-react';
import { getVencimientos, putVencAjustes, describeApiError, type VencFila, type VencResumen, type VencSemana, type VencProveedor } from '../api/client';
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
      <span className={`venc-fac-imp${f.grande ? ' grande' : ''}`}>{f.importe != null ? euros(f.importe) : '—'}</span>
    </>
  );
  return (
    <li>
      {f.url ? <a href={f.url} target="_blank" rel="noreferrer" title="Abrir la factura">{dentro}</a> : <div>{dentro}</div>}
    </li>
  );
}

const euroCorto = (v: number) => v >= 1000 ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} mil €` : euros(v).replace(/,00\s/, ' ');
const diaLargo = (iso: string) => {
  const d = new Date(`${iso}T12:00`);
  return `${d.toLocaleDateString('es-ES', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}`;
};

/** Lo que se carga cada semana, en barras. */
function Semanas({ semanas }: { semanas: VencSemana[] }) {
  const max = Math.max(...semanas.map(s => s.total), 1);
  return (
    <div className="venc-semanas" aria-label="Lo que se carga cada semana">
      {semanas.map((s, i) => (
        <div key={s.desde} className={`venc-sem${i === 0 ? ' actual' : ''}`} title={`${s.rango}: ${s.facturas} factura${s.facturas !== 1 ? 's' : ''}`}>
          <span className="venc-sem-imp">{s.total ? euroCorto(s.total) : '—'}</span>
          <span className="venc-sem-barra"><span style={{ height: `${Math.max(s.total ? 6 : 0, (s.total / max) * 100)}%` }} /></span>
          <span className="venc-sem-et">{s.etiqueta}</span>
          <span className="venc-sem-rango">{s.rango}</span>
        </div>
      ))}
    </div>
  );
}

function Proveedores({ lista }: { lista: VencProveedor[] }) {
  return (
    <ul className="venc-prov">
      {lista.map(p => (
        <li key={p.proveedor}>
          <span className="venc-fac-txt">
            <b>{p.proveedor}</b>
            <small>{[
              `${p.facturas} factura${p.facturas !== 1 ? 's' : ''}`,
              p.forma_pago || '',
              p.dias != null ? `suele vencer a ${p.dias} días` : '',
              `la próxima ${fechaCorta(p.proxima)}`,
            ].filter(Boolean).join(' · ')}</small>
          </span>
          <span className="venc-fac-imp">{euros(p.pendiente)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Facturas de proveedor que vencen hoy, mañana y pasado (el viernes, hasta el lunes). Solo Andrés. */
export function VencimientosCard() {
  const [d, setD] = useState<VencResumen | null>(null);
  const [error, setError] = useState(false);
  const [ver, setVer] = useState<'' | 'proximos' | 'sin' | 'prov'>('');
  const [ajustando, setAjustando] = useState(false);
  const [umbral, setUmbral] = useState('');
  const [diasAntes, setDiasAntes] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
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

  const abrirAjustes = () => {
    setUmbral(String(d.ajustes.umbral)); setDiasAntes(String(d.ajustes.dias_antes)); setAviso(''); setAjustando(a => !a);
  };
  const guardarAjustes = async () => {
    const u = Number(umbral.replace(/\./g, '').replace(',', '.')), n = parseInt(diasAntes, 10);
    if (!(u >= 0) || !(n >= 1 && n <= 30)) { setAviso('Pon un importe y entre 1 y 30 días.'); return; }
    setGuardando(true);
    try { const { data } = await putVencAjustes({ umbral: u, dias_antes: n }); setD(data); setAjustando(false); }
    catch (e) { setAviso(describeApiError(e)); }
    finally { setGuardando(false); }
  };
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
        <button className={`btn btn-ghost btn-sm venc-ajustes-btn${ajustando ? ' activo' : ''}`} onClick={abrirAjustes} aria-label="Aviso de facturas grandes" title="Aviso de facturas grandes">
          <Settings2 size={17} />
        </button>
      </div>

      {ajustando && (
        <div className="venc-ajustes">
          <label>Avisarme de las facturas de más de
            <span className="venc-input"><input inputMode="decimal" value={umbral} onChange={e => setUmbral(e.target.value)} aria-label="Importe" /> €</span>
          </label>
          <label>con
            <span className="venc-input"><input inputMode="numeric" value={diasAntes} onChange={e => setDiasAntes(e.target.value)} aria-label="Días antes" /> días</span>
            de antelación
          </label>
          <button className="btn btn-primary btn-sm" onClick={guardarAjustes} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          {aviso && <p className="venc-nota error">{aviso}</p>}
        </div>
      )}

      {d.grandes.length > 0 && (
        <ul className="venc-grandes">
          {d.grandes.map(g => (
            <li key={g.id}>
              <a href={g.url || undefined} target="_blank" rel="noreferrer">
                <AlertTriangle size={18} />
                <span className="venc-fac-txt">
                  <b>{g.proveedor} · {euros(g.importe)}</b>
                  <small>Vence el {diaLargo(g.fecha!)}{g.faltan ? ` · dentro de ${g.faltan} días` : ''}{g.forma_pago ? ` · ${g.forma_pago}` : ''}</small>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

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

      {d.semanas.some(x => x.total > 0) && <Semanas semanas={d.semanas} />}

      <div className="venc-pie">
        {d.proximos.length > 0 && (
          <button className={`venc-mas${ver === 'proximos' ? ' abierto' : ''}`} onClick={() => setVer(v => (v === 'proximos' ? '' : 'proximos'))}>
            Próximo mes: {d.proximos.length} factura{d.proximos.length !== 1 ? 's' : ''} · {euros(d.proximos_total)} <ChevronDown size={16} />
          </button>
        )}
        {d.proveedores.length > 0 && (
          <button className={`venc-mas${ver === 'prov' ? ' abierto' : ''}`} onClick={() => setVer(v => (v === 'prov' ? '' : 'prov'))}>
            Pendiente por proveedor · {euros(d.pendiente_total)} <ChevronDown size={16} />
          </button>
        )}
        {d.sin_fecha.length > 0 && (
          <button className={`venc-mas aviso${ver === 'sin' ? ' abierto' : ''}`} onClick={() => setVer(v => (v === 'sin' ? '' : 'sin'))}>
            <FileText size={15} /> {d.sin_fecha.length} sin fecha de vencimiento <ChevronDown size={16} />
          </button>
        )}
      </div>
      {ver === 'proximos' && <ul className="venc-lista venc-extra">{d.proximos.map(f => <Factura key={f.id} f={f} conFecha />)}</ul>}
      {ver === 'prov' && <Proveedores lista={d.proveedores} />}
      {ver === 'sin' && (
        <>
          <p className="venc-nota">Estas facturas no dicen cuándo vencen.</p>
          <ul className="venc-lista venc-extra">{d.sin_fecha.map(f => <Factura key={f.id} f={{ ...f, importe: f.importe ?? f.importe_factura }} />)}</ul>
        </>
      )}
    </section>
  );
}
