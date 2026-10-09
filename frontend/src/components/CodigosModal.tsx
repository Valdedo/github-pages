import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, LogOut } from 'lucide-react';
import { accesoCodigo, accesoCerrarTodas, accesoEstado, describeApiError, type PersonaAcceso } from '../api/client';
import { setSesion, getRol } from '../auth';
import { useCfToast } from './CfToast';

/** Códigos de acceso: uno por persona. Solo el encargado (Andrés) los cambia. */
export function CodigosModal({ onClose }: { onClose: () => void }) {
  const [personas, setPersonas] = useState<PersonaAcceso[] | null>(null);
  const [nuevo, setNuevo] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast, show } = useCfToast();
  const admin = getRol() === 'admin';

  useEffect(() => {
    if (!admin) return;
    accesoEstado().then(r => setPersonas(r.data.personas ?? [])).catch(e => setError(describeApiError(e)));
  }, [admin]);

  const guardar = async (p: PersonaAcceso) => {
    const codigo = (nuevo[p.id] || '').trim();
    setGuardando(p.id); setError(null);
    try {
      const { data } = await accesoCodigo(p.id, codigo);
      if (data.token && data.rol) setSesion(data.token, data.rol, data.persona);
      setNuevo(n => ({ ...n, [p.id]: '' }));
      setPersonas(ps => ps?.map(x => x.id === p.id ? { ...x, tiene_codigo: true } : x) ?? null);
      show(`Código de ${p.nombre} cambiado. Tendrá que escribir el nuevo la próxima vez.`);
    } catch (err) { setError(describeApiError(err)); } finally { setGuardando(null); }
  };

  const cerrarTodas = async () => {
    if (!window.confirm('¿Cerrar la sesión en todos los móviles y ordenadores? Cada uno tendrá que volver a escribir su código. Tú sigues dentro en este.')) return;
    try {
      const { data } = await accesoCerrarTodas();
      setSesion(data.token, data.rol, data.persona);
      show('Sesiones cerradas en todos los demás dispositivos');
    } catch (err) { setError(describeApiError(err)); }
  };

  // Fuera del cajón «Más» (en el móvil, si no, queda atrapado dentro y con los estilos del menú)
  return createPortal(
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal codigos-modal" role="dialog" aria-label="Códigos de acceso">
        <div className="turno-modal-head">
          <div><h3>Códigos de acceso</h3></div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        {error && <p className="acceso-error" role="alert">{error}</p>}
        {!admin ? (
          <p className="turnos-ayuda">Solo Andrés puede cambiar los códigos. Si has olvidado el tuyo, pídeselo a él.</p>
        ) : personas === null ? <p>Cargando…</p> : (
          <>
            <p className="turnos-ayuda">Cada persona tiene su código (mínimo 4 números o letras, sin espacios). Al cambiar uno, solo esa persona tendrá que volver a escribirlo.</p>
            <div className="codigos-lista">
              {personas.map(p => (
                <div key={p.id} className="codigos-persona">
                  <div className="codigos-quien">
                    <b>{p.nombre}</b>
                    <small>{p.rol === 'admin' ? 'Encargado' : p.rol === 'reparto' ? 'Reparto' : p.rol === 'consulta' ? 'Solo ver tarifas y vencimientos' : p.id === 'tienda' ? 'Para los dispositivos compartidos' : 'Tienda'}{!p.tiene_codigo && ' · sin código'}</small>
                  </div>
                  <input className="form-input" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="Código nuevo" maxLength={32}
                    value={nuevo[p.id] || ''} onChange={e => setNuevo(n => ({ ...n, [p.id]: e.target.value.replace(/\s/g, '') }))}
                    onKeyDown={e => { if (e.key === 'Enter' && (nuevo[p.id] || '').trim().length >= 4) guardar(p); }} aria-label={`Código nuevo de ${p.nombre}`} />
                  <button className="btn btn-primary codigos-cambiar" disabled={guardando === p.id || (nuevo[p.id] || '').trim().length < 4} onClick={() => guardar(p)}>
                    {guardando === p.id ? 'Guardando…' : 'Cambiar'}
                  </button>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={cerrarTodas}><LogOut size={16} /> Cerrar sesión en todos los dispositivos</button>
          </>
        )}
      </div>
      {toast}
    </div>,
    document.body,
  );
}
