import { useState } from 'react';
import { putVencAjustes, describeApiError, type VencAjustes, type VencFila, type VencResumen, type VencSemana } from '../api/client';

const fmtEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);
export const euros = (v?: number | null) => fmtEur.format(v ?? 0);
export const euroCorto = (v: number) => v >= 1000 ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} mil €` : euros(v).replace(/,00\s/, ' ');
const mesCorto = (d: Date) => d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
export const fechaCorta = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00`);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
};
export const diaLargo = (iso: string) => {
  const d = new Date(`${iso}T12:00`);
  return `${d.toLocaleDateString('es-ES', { weekday: 'long' })} ${d.getDate()} ${mesCorto(d)}`;
};
/** «hace 3 h», «ayer»… */
export const hace = (iso?: string | null) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};

/** Una factura (abre el PDF si lo hay). */
export function Factura({ f, conFecha }: { f: VencFila; conFecha?: boolean }) {
  const detalle = [
    conFecha ? fechaCorta(f.fecha) : '',
    f.plazos > 1 ? `plazo ${f.plazo} de ${f.plazos}` : '',
    f.numero ? `n.º ${f.numero}` : '',
    f.forma_pago || '',
  ].filter(Boolean).join(' · ');
  const dentro = (
    <>
      <span className="venc-fac-txt">
        <b>{f.proveedor || 'Proveedor sin leer'}{f.revisar && f.revisar.length > 0 && <span className="venc-revisar-chip" title={f.revisar.join(' · ')}>Revisar</span>}</b>
        {detalle && <small>{detalle}</small>}
        {f.revisar && f.revisar.length > 0 && <small className="venc-revisar-txt">{f.revisar.join(' · ')}: mira el PDF</small>}
      </span>
      <span className={`venc-fac-imp${f.grande ? ' grande' : ''}`}>{f.importe != null ? euros(f.importe) : '—'}</span>
    </>
  );
  return (
    <li>
      {f.url ? <a href={f.url} target="_blank" rel="noreferrer" title="Abrir la factura">{dentro}</a> : <div>{dentro}</div>}
    </li>
  );
}

/** El script de facturas lleva días sin mandar nada: los datos pueden estar viejos. */
export function AvisoAtrasado({ dias }: { dias: number }) {
  if (!dias) return null;
  return (
    <div className="venc-atrasado" role="alert">
      <span className="venc-grandes-ico" aria-hidden>!</span>
      <span className="venc-fac-txt">
        <b>El script de facturas no manda datos desde hace {dias} días</b>
        <small>Lo de aquí puede estar viejo. Abre el script en script.google.com y mira «Ejecuciones» por si da error.</small>
      </span>
    </div>
  );
}

/** Facturas grandes que se acercan. */
export function Grandes({ lista }: { lista: VencFila[] }) {
  if (!lista.length) return null;
  return (
    <ul className="venc-grandes">
      {lista.map(g => (
        <li key={g.id}>
          <a href={g.url || undefined} target="_blank" rel="noreferrer">
            <span className="venc-grandes-ico" aria-hidden>!</span>
            <span className="venc-fac-txt">
              <b>{g.proveedor} · {euros(g.importe)}</b>
              <small>Vence el {diaLargo(g.fecha!)}{g.faltan ? ` · dentro de ${g.faltan} días` : ''}{g.forma_pago ? ` · ${g.forma_pago}` : ''}</small>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Lo que se carga cada semana, en barras. */
export function Semanas({ semanas, elegida, onElegir }: { semanas: VencSemana[]; elegida?: string | null; onElegir?: (s: VencSemana) => void }) {
  const max = Math.max(...semanas.map(s => s.total), 1);
  const Tag = onElegir ? 'button' : 'div';
  return (
    <div className="venc-semanas" style={{ gridTemplateColumns: `repeat(${semanas.length}, minmax(0, 1fr))` }} aria-label="Lo que se carga cada semana">
      {semanas.map((s, i) => (
        <Tag key={s.desde} className={`venc-sem${i === 0 ? ' actual' : ''}${onElegir ? ' elegible' : ''}${elegida === s.desde ? ' elegida' : ''}`}
          title={`${s.rango}: ${s.facturas} factura${s.facturas !== 1 ? 's' : ''}${onElegir && s.facturas ? ' · toca para verlas' : ''}`}
          {...(onElegir ? { type: 'button' as const, onClick: () => onElegir(s), disabled: !s.facturas, 'aria-pressed': elegida === s.desde } : {})}>
          <span className="venc-sem-imp">{s.total ? euroCorto(s.total) : '—'}</span>
          <span className="venc-sem-barra"><span style={{ height: `${Math.max(s.total ? 6 : 0, (s.total / max) * 100)}%` }} /></span>
          <span className="venc-sem-et">{s.etiqueta}</span>
          <span className="venc-sem-rango">{s.rango}</span>
        </Tag>
      ))}
    </div>
  );
}

/** Importe y días del aviso de facturas grandes. */
export function AjustesForm({ ajustes, onGuardado }: { ajustes: VencAjustes; onGuardado: (r: VencResumen) => void }) {
  const [umbral, setUmbral] = useState(String(ajustes.umbral));
  const [dias, setDias] = useState(String(ajustes.dias_antes));
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [hecho, setHecho] = useState(false);
  const guardar = async () => {
    const u = Number(umbral.replace(/\./g, '').replace(',', '.')), n = parseInt(dias, 10);
    if (!(u >= 0) || !(n >= 1 && n <= 30)) { setAviso('Pon un importe y entre 1 y 30 días.'); return; }
    setGuardando(true); setAviso('');
    try { const { data } = await putVencAjustes({ umbral: u, dias_antes: n }); onGuardado(data); setHecho(true); setTimeout(() => setHecho(false), 2500); }
    catch (e) { setAviso(describeApiError(e)); }
    finally { setGuardando(false); }
  };
  return (
    <div className="venc-ajustes">
      <label>Avisarme de las facturas de más de
        <span className="venc-input"><input inputMode="decimal" value={umbral} onChange={e => setUmbral(e.target.value)} aria-label="Importe" /> €</span>
      </label>
      <label>con
        <span className="venc-input dias"><input inputMode="numeric" value={dias} onChange={e => setDias(e.target.value)} aria-label="Días antes" /> días</span>
        de antelación
      </label>
      <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : hecho ? 'Guardado' : 'Guardar'}</button>
      {aviso && <p className="venc-nota error">{aviso}</p>}
    </div>
  );
}
