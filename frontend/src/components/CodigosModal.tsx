import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { accesoConfigurar, accesoEncargado, accesoEstado, describeApiError } from '../api/client';
import { setSesion, getRol } from '../auth';

const errorDe = (err: unknown) => {
  const ax = err as { response?: { data?: { detail?: string } } };
  return ax.response?.data?.detail || describeApiError(err);
};

/** Códigos de acceso: el del encargado (Andrés) y los de tienda y reparto. */
export function CodigosModal({ onClose }: { onClose: () => void }) {
  const [hayEncargado, setHayEncargado] = useState<boolean | null>(null);
  const [mio, setMio] = useState('');
  const [tienda, setTienda] = useState('');
  const [reparto, setReparto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const soyEncargado = getRol() === 'admin';

  useEffect(() => { accesoEstado().then(r => setHayEncargado(r.data.encargado)).catch(() => setHayEncargado(false)); }, []);
  const puedeTienda = !hayEncargado || soyEncargado;

  const guardarMio = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const { data } = await accesoEncargado(mio.trim());
      setSesion(data.token, data.rol);
      setOk('Tu código de encargado está guardado. Con él puedes cambiar turnos y códigos.');
    } catch (err) { setError(errorDe(err)); } finally { setSaving(false); }
  };
  const guardarTienda = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const { data } = await accesoConfigurar(tienda.trim(), reparto.trim());
      setSesion(data.token, data.rol);
      setOk('Códigos cambiados. Los demás ordenadores y móviles tendrán que escribir el código nuevo la próxima vez.');
    } catch (err) { setError(errorDe(err)); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal codigos-modal" role="dialog" aria-label="Códigos de acceso">
        <div className="turno-modal-head">
          <div><h3>Códigos de acceso</h3></div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        {ok ? (
          <>
            <p style={{ fontSize: 15 }}>{ok}</p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Hecho</button>
          </>
        ) : hayEncargado === null ? <p>Cargando…</p> : (
          <>
            {(soyEncargado || !hayEncargado) && (
              <form className="codigos-bloque" onSubmit={guardarMio}>
                <b>{hayEncargado ? 'Cambiar tu código (Andrés)' : 'Tu código de encargado (Andrés)'}</b>
                <small>Es el único que puede cambiar turnos, vacaciones, festivos y estos códigos. Úsalo solo en tus dispositivos.</small>
                <div className="codigos-fila">
                  <input className="form-input" type="password" autoComplete="new-password" placeholder="Mínimo 4" value={mio} onChange={e => setMio(e.target.value)} aria-label="Tu código" />
                  <button className="btn btn-primary" disabled={saving || mio.trim().length < 4}>Guardar</button>
                </div>
              </form>
            )}
            {puedeTienda ? (
              <form className="codigos-bloque" onSubmit={guardarTienda}>
                <b>Códigos de la tienda y de reparto</b>
                <small>Al cambiarlos, todos los dispositivos tendrán que escribir el código nuevo.</small>
                <label className="form-label">Código de la tienda (Patricia, Oscar)
                  <input className="form-input" value={tienda} onChange={e => setTienda(e.target.value)} autoComplete="off" />
                </label>
                <label className="form-label">Código de reparto (Melchor)
                  <input className="form-input" value={reparto} onChange={e => setReparto(e.target.value)} autoComplete="off" />
                </label>
                <button className="btn btn-ghost" disabled={saving || tienda.trim().length < 4}>{saving ? 'Guardando…' : 'Cambiar códigos'}</button>
              </form>
            ) : (
              <p className="turnos-ayuda">Solo Andrés puede cambiar los códigos.</p>
            )}
            {error && <p className="acceso-error" role="alert">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
