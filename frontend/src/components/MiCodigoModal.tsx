import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { accesoMiCodigo, describeApiError } from '../api/client';
import { setSesion } from '../auth';
import { CodigoInput } from './CodigoInput';

const soloNumeros = (v: string) => v.replace(/\D/g, '').slice(0, 8);

/** Cada persona cambia su propio código (4 a 8 números). Pide el actual y repetir el nuevo. */
export function MiCodigoModal({ onClose }: { onClose: () => void }) {
  const [actual, setActual] = useState('');
  const [codigo, setCodigo] = useState('');
  const [repite, setRepite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const distintos = repite.length >= codigo.length && repite !== codigo;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo !== repite) { setError('Los dos códigos nuevos no coinciden.'); return; }
    setGuardando(true); setError(null);
    try {
      const { data } = await accesoMiCodigo(actual.trim(), codigo);
      setSesion(data.token, data.rol, data.persona);
      setOk(true);
    } catch (err) {
      setError(describeApiError(err));
    } finally { setGuardando(false); }
  };

  // Fuera del cajón «Más» (en el móvil, si no, queda atrapado dentro)
  return createPortal(
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal codigos-modal" onSubmit={guardar} role="dialog" aria-label="Mi código">
        <div className="turno-modal-head">
          <div><h3>Mi código</h3></div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        {error && <p className="acceso-error" role="alert">{error}</p>}
        {ok ? (
          <>
            <p style={{ fontSize: 15 }}>Listo. A partir de ahora entra con tu código nuevo.</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>Hecho</button>
          </>
        ) : (
          <>
            <label className="form-label codigos-campo">Tu código de ahora
              <CodigoInput value={actual} onChange={setActual} autoFocus label="Tu código de ahora" />
            </label>
            <label className="form-label codigos-campo">Código nuevo <small>(de 4 a 8 números)</small>
              <CodigoInput value={codigo} onChange={v => setCodigo(soloNumeros(v))} nuevo numerico label="Código nuevo" />
            </label>
            <label className="form-label codigos-campo">Repite el código nuevo
              <CodigoInput value={repite} onChange={v => setRepite(soloNumeros(v))} nuevo numerico label="Repite el código nuevo" />
            </label>
            {distintos && <p className="acceso-error">No coincide con el código nuevo.</p>}
            <button className="btn btn-primary" disabled={guardando || !actual.trim() || codigo.length < 4 || codigo !== repite}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <p className="turnos-ayuda" style={{ margin: 0 }}>Si no recuerdas el de ahora, pídeselo a Andrés.</p>
          </>
        )}
      </form>
    </div>,
    document.body,
  );
}
