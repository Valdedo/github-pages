/** Tornillería (20/11/2026): cambiar el precio de venta desde la app e imprimir etiquetas de balda desde las tarifas. */
import { useEffect, useRef, useState } from 'react';
import { Check, Printer, Tag, Trash2, X } from 'lucide-react';
import { etiquetasPruebaUrl, etiquetasTarifaUrl, putPvpTarifa, describeApiError } from '../api/client';
import { guardarSiguientePegatina, leerPrecio, siguientePegatina } from '../lib/comprasNueva';
import { quitarEtiqueta, useEtiquetasTarifa, vaciarEtiquetas } from '../lib/etiquetasTarifa';
import { eur, type FichaTarifa } from '../lib/tarifas';
import { numES } from '../lib/texto';
import '../pages/recibir.css';

const plural = (n: number, uno: string) => `${n} ${n === 1 ? uno : `${uno}s`}`;

/** «0,35» en la caja, con coma. */
const enCaja = (v?: number | null) => (v == null ? '' : numES(v, 2, 2));

/** Cambiar el precio de venta (con IVA) de un artículo: el de la etiqueta de la balda. Manda sobre el de la hoja. */
export function HojaPrecio({ prov, articulo, nombre, pvpIva, ud, calculado, puesto, pvpHoja, onCerrar, onGuardado }: {
  prov: string; articulo: string; nombre: string; pvpIva: number | null; ud: string;
  /** El precio de ahora es el calculado de la hoja / está puesto a mano en la app (y el que traía la hoja) */
  calculado?: boolean; puesto?: boolean; pvpHoja?: number | null;
  onCerrar: () => void; onGuardado: (f: FichaTarifa) => void;
}) {
  const [txt, setTxt] = useState(enCaja(pvpIva));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const caja = useRef<HTMLInputElement>(null);
  useEffect(() => { caja.current?.focus(); caja.current?.select(); }, []);
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCerrar]);
  const valor = leerPrecio(txt);
  const guardar = async (v: number | null) => {
    if (guardando) return;
    if (v != null && !(v > 0)) { setError('Escribe el precio con IVA, por ejemplo 0,35.'); return; }
    setGuardando(true); setError(null);
    try { onGuardado((await putPvpTarifa(prov, articulo, v)).data); }
    catch (e) { setError(describeApiError(e)); setGuardando(false); }
  };
  return (
    <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <form className="upload-sheet rc-hoja tfx-precio" role="dialog" aria-modal="true" aria-label="Cambiar el precio de venta"
        onSubmit={e => { e.preventDefault(); guardar(valor); }}>
        <div className="upload-sheet-handle" />
        <div className="rc-hoja-cab"><h3>Precio de venta</h3><button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={20} /></button></div>
        <p className="rc-hoja-txt"><strong>{nombre}</strong></p>
        <p className="rc-hoja-txt">{calculado ? <>Ahora lleva un precio calculado ({eur(pvpIva)}). Escribe el de la etiqueta de la balda.</>
          : <>Escribe el precio con IVA, el de la etiqueta de la balda.</>}</p>
        <label className="tfx-caja">
          <input ref={caja} inputMode="decimal" autoComplete="off" value={txt} onChange={e => { setTxt(e.target.value); setError(null); }} aria-label="Precio con IVA" />
          <span>€ con IVA{ud ? ` / ${ud}` : ''}</span>
        </label>
        {error && <p className="tfx-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg rc-hoja-btn" disabled={guardando || valor == null}><Check size={20} /> Guardar</button>
        {puesto && (
          <button type="button" className="rc-enlace tfx-volver" disabled={guardando} onClick={() => guardar(null)}>
            Quitar este precio y volver al de la hoja{pvpHoja != null ? ` (${eur(pvpHoja)})` : ''}
          </button>
        )}
        <p className="rc-hoja-nota">El precio queda guardado en la app y manda sobre el de la hoja de Drive.</p>
      </form>
    </div>
  );
}

/** Imprimir las etiquetas elegidas en las tarifas: la lista, por qué pegatina del folio empezar y abrir el PDF. */
export function HojaEtiquetasTarifa({ onCerrar }: { onCerrar: () => void }) {
  const lista = useEtiquetasTarifa();
  const [inicio, setInicio] = useState(siguientePegatina());
  const [abierto, setAbierto] = useState(false);
  const n = lista.length;
  const folios = Math.ceil((inicio - 1 + n) / 12);
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCerrar]);
  const abrir = () => {
    window.open(etiquetasTarifaUrl(lista, inicio), '_blank');
    guardarSiguientePegatina(inicio, n);
    setAbierto(true);
  };
  return (
    <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="upload-sheet rc-hoja tfx-etq" role="dialog" aria-modal="true" aria-label="Imprimir etiquetas de balda">
        <div className="upload-sheet-handle" />
        <div className="rc-hoja-cab"><h3>{plural(n, 'etiqueta')} de balda</h3><button className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={20} /></button></div>
        {n === 0 ? (
          <p className="rc-hoja-txt">No hay nada elegido. Pulsa «Etiquetas» en una familia y toca las medidas que quieras imprimir.</p>
        ) : abierto ? (
          <>
            <p className="rc-hoja-txt">Se han abierto en otra pestaña para imprimirlas. Si han salido bien, vacía la lista para empezar de cero la próxima vez.</p>
            <button className="btn btn-primary btn-lg rc-hoja-btn" onClick={() => { vaciarEtiquetas(); onCerrar(); }}><Check size={20} /> Ya están: vaciar la lista</button>
            <button className="btn btn-ghost rc-hoja-btn tfx-segundo" onClick={onCerrar}>Dejarlas en la lista</button>
          </>
        ) : (
          <>
            <ul className="tfx-lista">
              {lista.map(x => (
                <li key={`${x.prov}|${x.ref}`}><span>{x.nombre}</span>
                  <button onClick={() => quitarEtiqueta(x.prov, x.ref)} aria-label={`Quitar ${x.nombre}`}><X size={16} /></button></li>
              ))}
            </ul>
            <p className="rc-hoja-txt">¿Por qué pegatina del folio empiezo? Toca la primera que esté libre.</p>
            <div className="rc-folio" role="radiogroup" aria-label="Primera pegatina libre del folio">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(p => (
                <button key={p} role="radio" aria-checked={p === inicio} className={p < inicio ? 'usada' : p < inicio + n ? 'va' : ''} onClick={() => setInicio(p)}>{p}</button>
              ))}
            </div>
            <p className="rc-hoja-nota">{folios === 1 ? 'Cabe todo en este folio.' : `Hacen falta ${folios} folios.`} En la impresora elige <b>tamaño real (100&nbsp;%)</b>, sin «ajustar a la página».</p>
            <button className="btn btn-primary btn-lg rc-hoja-btn" onClick={abrir}><Printer size={20} /> Abrir para imprimir</button>
            <div className="rc-hoja-pie">
              <a href={etiquetasPruebaUrl()} target="_blank" rel="noreferrer">Imprimir hoja de prueba</a>
              <button className="rc-enlace" onClick={vaciarEtiquetas}><Trash2 size={14} /> Vaciar la lista</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Barra de abajo mientras se eligen medidas para etiqueta. */
export function BarraEtiquetas({ onImprimir, onSalir }: { onImprimir: () => void; onSalir: () => void }) {
  const n = useEtiquetasTarifa().length;
  return (
    <div className="tfx-barra" role="region" aria-label="Etiquetas elegidas">
      <span className="tfx-barra-txt"><Tag size={18} aria-hidden="true" />
        <span><strong>{n === 0 ? 'Toca lo que quieras etiquetar' : `${plural(n, 'etiqueta')} ${n === 1 ? 'elegida' : 'elegidas'}`}</strong>
          <small>{n === 0 ? 'Abre una línea y marca sus medidas.' : 'Puedes ir a otra familia y seguir marcando.'}</small></span></span>
      <button className="btn btn-ghost" onClick={onSalir}>Salir</button>
      <button className="btn btn-primary" disabled={n === 0} onClick={onImprimir}><Printer size={18} /> Imprimir</button>
    </div>
  );
}
