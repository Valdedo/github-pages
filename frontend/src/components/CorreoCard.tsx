import { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, ExternalLink } from 'lucide-react';
import { getCorreo, type CorreoItem, type CorreoResumen } from '../api/client';

function hace(iso?: string) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

function Fila({ c }: { c: CorreoItem }) {
  return (
    <li>
      <a href={c.enlace} target="_blank" rel="noreferrer">
        <span className={`correo-tipo ${c.tipo || 'otro'}`}>{c.tipo === 'cliente' ? 'Cliente' : c.tipo === 'proveedor' ? 'Proveedor' : 'Correo'}</span>
        <span className="correo-txt">
          <b>{c.resumen || c.asunto}</b>
          <small>{c.de} · {hace(c.fecha)}</small>
        </span>
        <ExternalLink size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </a>
    </li>
  );
}

/** Correos de casafonsomc@gmail.com sin leer y sin contestar, resumidos en una línea. */
export function CorreoCard() {
  const [d, setD] = useState<CorreoResumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const cargar = useCallback((refrescar = false) => {
    setCargando(true);
    getCorreo(refrescar).then(({ data }) => setD(data)).catch(() => setD(v => v ?? { configurado: true, error: 'No se ha podido leer el correo ahora mismo', sin_leer: [], sin_contestar: [] })).finally(() => setCargando(false));
  }, []);
  useEffect(() => {
    cargar();
    const t = setInterval(() => cargar(), 5 * 60000);
    return () => clearInterval(t);
  }, [cargar]);

  if (d && !d.configurado) return null;
  const nada = d && !d.error && d.sin_leer.length === 0 && d.sin_contestar.length === 0;

  return (
    <section className="card inicio-bloque" aria-label="Correo">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ margin: 0 }}><Mail size={22} style={{ verticalAlign: -3 }} /> Correo</h2>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => cargar(true)} disabled={cargando}>
          <RefreshCw size={15} className={cargando ? 'girando' : ''} /> {cargando ? 'Mirando…' : 'Actualizar'}
        </button>
      </div>
      {!d ? <p className="inicio-aldia">Mirando el correo…</p>
        : d.error ? <p className="inicio-aldia">{d.error}.</p>
        : nada ? <p className="inicio-aldia">No hay correos pendientes. Todo contestado.</p>
        : (
          <>
            {d.sin_leer.length > 0 && (
              <div>
                <div className="correo-grupo">Sin leer · {d.sin_leer.length}</div>
                <ul className="correo-lista">{d.sin_leer.map(c => <Fila key={c.id} c={c} />)}</ul>
              </div>
            )}
            {d.sin_contestar.length > 0 && (
              <div>
                <div className="correo-grupo">Esperan respuesta · {d.sin_contestar.length}</div>
                <ul className="correo-lista">{d.sin_contestar.map(c => <Fila key={c.id} c={c} />)}</ul>
              </div>
            )}
          </>
        )}
    </section>
  );
}
