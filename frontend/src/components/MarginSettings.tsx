import { useState } from 'react';
import { updateSettings } from '../api/client';
import { mensajeError } from '../lib/descargas';
import type { AppSettings, MarginTier } from '../types/index';

interface Props {
  settings: AppSettings;
  onUpdated: (s: AppSettings) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type Redondeo = 'standard' | 'psychological' | 'ceil_5cents' | 'ceil_10cents';
/** Un tramo tal y como se escribe (texto), para poder dejar casillas vacías mientras se escribe. */
interface TramoTxt { min: string; max: string; margen: string }

const aTexto = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const num = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  return /^-?\d*\.?\d+$/.test(t) ? parseFloat(t) : NaN;
};
const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** Comprueba los tramos. Devuelve los tramos listos para guardar o la lista de problemas. */
function revisar(tramos: TramoTxt[]): { ok: MarginTier[] } | { errores: string[] } {
  const errores: string[] = [];
  if (!tramos.length) return { errores: ['Tiene que haber al menos un tramo.'] };
  const leidos = tramos.map((t, i) => {
    const n = `Tramo ${i + 1}`;
    const min = num(t.min), max = num(t.max), margen = num(t.margen);
    if (min === null) errores.push(`${n}: falta el coste desde`);
    else if (isNaN(min)) errores.push(`${n}: el coste desde tiene que ser un número`);
    else if (min < 0) errores.push(`${n}: el coste desde no puede ser negativo`);
    if (max !== null && isNaN(max)) errores.push(`${n}: el coste hasta tiene que ser un número`);
    else if (max !== null && max < 0) errores.push(`${n}: el coste hasta no puede ser negativo`);
    else if (max !== null && min !== null && !isNaN(min) && max <= min) errores.push(`${n}: el coste hasta tiene que ser mayor que el coste desde`);
    if (margen === null) errores.push(`${n}: falta el margen`);
    else if (isNaN(margen)) errores.push(`${n}: el margen tiene que ser un número`);
    else if (margen < 0) errores.push(`${n}: el margen no puede ser negativo`);
    return { min_cost: min ?? 0, max_cost: max, margin_pct: margen ?? 0, i };
  });
  if (errores.length) return { errores };
  const orden = [...leidos].sort((a, b) => a.min_cost - b.min_cost);
  orden.forEach((t, k) => {
    const sig = orden[k + 1];
    if (!sig) return;
    if (t.max_cost === null) errores.push(`Tramo ${t.i + 1}: solo el último tramo (el de los costes más altos) puede quedar sin «hasta»`);
    else if (sig.min_cost <= t.max_cost) errores.push(`Los tramos ${t.i + 1} y ${sig.i + 1} se pisan: el ${sig.i + 1} empieza en ${eur(sig.min_cost)} y el ${t.i + 1} llega hasta ${eur(t.max_cost)}`);
  });
  if (errores.length) return { errores };
  return { ok: orden.map(({ min_cost, max_cost, margin_pct }) => ({ min_cost, max_cost, margin_pct })) };
}

/** Márgenes por tramos de coste y redondeo del precio de venta (página Ajustes). */
export function MarginSettings({ settings, onUpdated, onToast }: Props) {
  const [tramos, setTramos] = useState<TramoTxt[]>(() =>
    settings.margin_tiers.map(t => ({ min: aTexto(t.min_cost), max: aTexto(t.max_cost), margen: aTexto(t.margin_pct) })));
  const [roundingMode, setRoundingMode] = useState<Redondeo>(settings.rounding_mode as Redondeo);
  const [decimals, setDecimals] = useState(settings.rounding_decimals);
  const [saving, setSaving] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);

  const handleSave = async () => {
    const r = revisar(tramos);
    if ('errores' in r) { setErrores(r.errores); onToast?.('Revisa los tramos: hay datos que no cuadran', 'error'); return; }
    setErrores([]);
    setSaving(true);
    try {
      const { data } = await updateSettings({ margin_tiers: r.ok, rounding_mode: roundingMode, rounding_decimals: decimals });
      onUpdated(data);
      setTramos(data.margin_tiers.map(t => ({ min: aTexto(t.min_cost), max: aTexto(t.max_cost), margen: aTexto(t.margin_pct) })));
      // No se recalcula nada ya subido: se avisa de cómo hacerlo
      onToast?.('Márgenes guardados. Se aplican a los albaranes nuevos; en uno ya subido, «Más» → «Recalcular».', 'success');
    } catch (e) {
      const m = mensajeError(e, 'No se pudieron guardar los márgenes');
      setErrores([m]);
      onToast?.(m, 'error');
    } finally {
      setSaving(false);
    }
  };

  const cambiar = (idx: number, campo: keyof TramoTxt, v: string) => {
    setTramos(prev => prev.map((t, i) => (i === idx ? { ...t, [campo]: v } : t)));
    setErrores([]);
  };

  const addTier = () => {
    setTramos(prev => {
      const ult = prev[prev.length - 1];
      const maxUlt = ult ? num(ult.max) : 0;
      // Si el último no tenía «hasta», se le pone uno para que el nuevo vaya detrás
      if (ult && (maxUlt === null || isNaN(maxUlt as number))) {
        const minUlt = num(ult.min) ?? 0;
        const tope = (isNaN(minUlt) ? 0 : minUlt) + 100;
        return [...prev.slice(0, -1), { ...ult, max: aTexto(tope) }, { min: aTexto(Math.round((tope + 0.01) * 100) / 100), max: '', margen: '20' }];
      }
      return [...prev, { min: aTexto(Math.round(((maxUlt as number) + 0.01) * 100) / 100), max: '', margen: '20' }];
    });
  };
  const removeTier = (idx: number) => { setTramos(prev => prev.filter((_, i) => i !== idx)); setErrores([]); };

  return (
    <div className="card">
      <div className="card-body mrg">
        <div className="mrg-explica">
          <b>Margen = recargo sobre el coste.</b> Con un coste de 10 € y un margen del 50 %, el precio sin IVA es 15 €
          (10 € + 50 % de 10 €). Después se suma el IVA y se redondea.
        </div>

        {/* Redondeo */}
        <div className="mrg-redondeo">
          <label className="mrg-campo">
            <span>Redondeo del precio</span>
            <select className="form-input" value={roundingMode} onChange={e => setRoundingMode(e.target.value as Redondeo)}>
              <option value="standard">Normal</option>
              <option value="psychological">Acabado en ,99</option>
              <option value="ceil_5cents">Hacia arriba, a 5 céntimos</option>
              <option value="ceil_10cents">Hacia arriba, a 10 céntimos</option>
            </select>
          </label>
          {roundingMode === 'standard' && (
            <label className="mrg-campo">
              <span>Decimales</span>
              <select className="form-input" value={decimals} onChange={e => setDecimals(Number(e.target.value))}>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </div>

        {/* Tramos */}
        <h3 className="mrg-tit">Margen según el coste del artículo</h3>
        <div className="mrg-tramos">
          <div className="mrg-tramo mrg-cab" aria-hidden="true">
            <span>Coste desde</span><span>Coste hasta</span><span>Margen</span><span />
          </div>
          {tramos.map((t, idx) => (
            <div key={idx} className="mrg-tramo">
              <span className="mrg-n">Tramo {idx + 1}</span>
              <label><span className="mrg-et">Coste desde</span>
                <span className="mrg-in"><input inputMode="decimal" value={t.min} onChange={e => cambiar(idx, 'min', e.target.value)} aria-label={`Tramo ${idx + 1}: coste desde`} /><i>€</i></span></label>
              <label><span className="mrg-et">Coste hasta</span>
                <span className="mrg-in"><input inputMode="decimal" value={t.max} placeholder="sin límite" onChange={e => cambiar(idx, 'max', e.target.value)} aria-label={`Tramo ${idx + 1}: coste hasta`} /><i>€</i></span></label>
              <label><span className="mrg-et">Margen</span>
                <span className="mrg-in fuerte"><input inputMode="decimal" value={t.margen} onChange={e => cambiar(idx, 'margen', e.target.value)} aria-label={`Tramo ${idx + 1}: margen`} /><i>%</i></span></label>
              <button onClick={() => removeTier(idx)} className="btn btn-ghost btn-sm mrg-quitar" disabled={tramos.length <= 1}
                aria-label={`Quitar el tramo ${idx + 1}`}>Quitar</button>
            </div>
          ))}
        </div>
        <p className="mrg-nota">El último tramo puede quedar sin «hasta»: vale para todo lo que cueste más.</p>

        {errores.length > 0 && (
          <div className="form-error" role="alert">
            {errores.length === 1 ? errores[0] : <ul>{errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </div>
        )}

        <div className="mrg-botones">
          <button onClick={addTier} className="btn btn-ghost">+ Añadir tramo</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? <><span className="spinner spinner-sm spinner-white" /> Guardando…</> : 'Guardar márgenes'}
          </button>
        </div>
      </div>
    </div>
  );
}
