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
  const nLeer = d?.sin_leer.length ?? 0, nResp = d?.sin_contestar.length ?? 0;
  const nada = d && !d.error && nLeer === 0 && nResp === 0;

  // Sin nada pendiente: una línea discreta
  if (!d || d.error || nada) {
    return (
      <section className="card correo-card correo-tranquilo" aria-label="Correo">
        <span className="correo-ico"><Mail size={20} /></span>
        <span className="correo-estado">{!d ? 'Mirando el correo…' : d.error ? `${d.error}.` : 'Correo al día: nada sin leer ni por contestar.'}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => cargar(true)} disabled={cargando} aria-label="Actualizar el correo">
          <RefreshCw size={15} className={cargando ? 'girando' : ''} />
        </button>
      </section>
    );
  }

  return (
    <section className="card correo-card correo-pendiente" aria-label="Correo pendiente">
      <div className="correo-cab">
        <span className="correo-ico grande"><Mail size={24} /></span>
        <div className="correo-titulos">
          <h2>Correo pendiente</h2>
          <div className="correo-cuentas">
            {nLeer > 0 && <span className="correo-cuenta leer"><b>{nLeer}</b> sin leer</span>}
            {nResp > 0 && <span className="correo-cuenta resp"><b>{nResp}</b> esperan respuesta</span>}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => cargar(true)} disabled={cargando}>
          <RefreshCw size={15} className={cargando ? 'girando' : ''} /> <span className="correo-act-txt">{cargando ? 'Mirando…' : 'Actualizar'}</span>
        </button>
      </div>
      {nLeer > 0 && (
        <div>
          <div className="correo-grupo">Sin leer</div>
          <ul className="correo-lista">{d.sin_leer.map(c => <Fila key={c.id} c={c} />)}</ul>
        </div>
      )}
      {nResp > 0 && (
        <div>
          <div className="correo-grupo">Esperan respuesta</div>
          <ul className="correo-lista">{d.sin_contestar.map(c => <Fila key={c.id} c={c} />)}</ul>
        </div>
      )}
    </section>
  );
}
