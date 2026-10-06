import { useState } from 'react';
import { accesoConfigurar, describeApiError } from '../api/client';
import { setSesion } from '../auth';

/** Cambiar los códigos de acceso (solo desde una sesión de la tienda). */
export function CodigosModal({ onClose }: { onClose: () => void }) {
  const [tienda, setTienda] = useState('');
  const [reparto, setReparto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const { data } = await accesoConfigurar(tienda.trim(), reparto.trim());
      setSesion(data.token, 'tienda');
      setOk(true);
    } catch (err) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || describeApiError(err));
    } finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" style={{ maxWidth: 440, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={guardar}>
        <h3 style={{ fontSize: 22 }}>Cambiar códigos de acceso</h3>
        {ok ? (
          <>
            <p style={{ fontSize: 15 }}>Códigos cambiados. Los demás ordenadores y móviles tendrán que escribir el código nuevo la próxima vez.</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>Hecho</button>
          </>
        ) : (
          <>
            <label className="form-label">Código nuevo de la tienda
              <input className="form-input" value={tienda} onChange={e => setTienda(e.target.value)} autoFocus autoComplete="off" />
            </label>
            <label className="form-label">Código nuevo de reparto
              <input className="form-input" value={reparto} onChange={e => setReparto(e.target.value)} autoComplete="off" />
            </label>
            {error && <p className="acceso-error">{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving || tienda.trim().length < 4}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
