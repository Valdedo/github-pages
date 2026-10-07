import { useState } from 'react';
import { X } from 'lucide-react';
import { accesoMiCodigo, describeApiError } from '../api/client';
import { setSesion } from '../auth';
import { CodigoInput } from './CodigoInput';

/** Cada persona cambia su propio código (4 a 8 números). */
export function MiCodigoModal({ onClose }: { onClose: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); setGuardando(true); setError(null);
    try {
      const { data } = await accesoMiCodigo(codigo);
      setSesion(data.token, data.rol, data.persona);
      setOk(true);
    } catch (err) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax.response?.data?.detail || describeApiError(err));
    } finally { setGuardando(false); }
  };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal codigos-modal" onSubmit={guardar} role="dialog" aria-label="Mi código">
        <div className="turno-modal-head">
          <div><h3>Mi código</h3></div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        {ok ? (
          <>
            <p style={{ fontSize: 15 }}>Listo. A partir de ahora entra con tu código nuevo.</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>Hecho</button>
          </>
        ) : (
          <>
            <p className="turnos-ayuda">Escribe el código nuevo: de 4 a 8 números, fácil de recordar para ti.</p>
            <CodigoInput value={codigo} onChange={v => setCodigo(v.replace(/\D/g, '').slice(0, 8))} autoFocus nuevo label="Código nuevo" />
            {error && <p className="acceso-error" role="alert">{error}</p>}
            <button className="btn btn-primary" disabled={guardando || codigo.length < 4}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </>
        )}
      </form>
    </div>
  );
}
