import { useEffect, useState } from 'react';
import { Bell, BellOff, Share } from 'lucide-react';
import { activarAvisos, desactivarAvisos, estadoAvisos, type EstadoAvisos } from '../lib/avisos';
import { getRol } from '../auth';

const QUE = {
  reparto: 'Te avisará cuando te pongan albaranes en el camión y si te cambian el turno.',
  tienda: 'Te avisará cuando Melchor firme un albarán en el reparto y si te cambian el turno.',
};

/** Tarjeta para activar los avisos en este móvil u ordenador. Desaparece cuando ya están activados. */
export function AvisosCard({ grande }: { grande?: boolean }) {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oculta, setOculta] = useState(() => { try { return !grande && localStorage.getItem('cfAvisosNo') === '1'; } catch { return false; } });

  useEffect(() => { estadoAvisos().then(setEstado); }, []);
  if (!estado || estado === 'activados' || estado === 'no-soportado' || oculta) return null;
  const texto = getRol() === 'reparto' ? QUE.reparto : QUE.tienda;

  const activar = async () => {
    setCargando(true); setError(null);
    try { setEstado(await activarAvisos()); }
    catch { setError('No se pudieron activar. Prueba otra vez con cobertura.'); }
    finally { setCargando(false); }
  };

  return (
    <section className={`card avisos-card${grande ? ' grande' : ''}`} aria-label="Avisos en el móvil">
      <span className="turnohoy-ico">{estado === 'bloqueados' ? <BellOff size={20} /> : <Bell size={20} />}</span>
      <div className="avisos-txt">
        {estado === 'instalar' ? (
          <>
            <b>Instala la app para recibir avisos</b>
            <small>En el iPhone: pulsa <Share size={13} style={{ verticalAlign: -2 }} /> «Compartir» y luego «Añadir a pantalla de inicio». Después ábrela desde ese icono.</small>
          </>
        ) : estado === 'bloqueados' ? (
          <>
            <b>Los avisos están bloqueados</b>
            <small>Actívalos en los ajustes del navegador para esta página (Notificaciones → Permitir).</small>
          </>
        ) : (
          <>
            <b>Activa los avisos en este {grande ? 'móvil' : 'dispositivo'}</b>
            <small>{texto}</small>
          </>
        )}
        {error && <small className="acceso-error">{error}</small>}
      </div>
      {(estado === 'desactivados' || !grande) && (
        <div className="avisos-botones">
          {estado === 'desactivados' && <button className={`btn btn-primary${grande ? ' btn-lg' : ''}`} onClick={activar} disabled={cargando}>
            {cargando ? 'Activando…' : 'Activar avisos'}
          </button>}
          {!grande && (
            <button className="btn btn-ghost btn-sm" onClick={() => { try { localStorage.setItem('cfAvisosNo', '1'); } catch { /* nada */ } setOculta(true); }}>
              Ahora no
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Enlace pequeño del menú para activar o quitar los avisos. */
export function AvisosLink() {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  useEffect(() => { estadoAvisos().then(setEstado); }, []);
  if (!estado || estado === 'no-soportado' || estado === 'instalar') return null;
  if (estado === 'activados') {
    return <button onClick={async () => { if (window.confirm('¿Quitar los avisos en este dispositivo?')) { await desactivarAvisos(); setEstado('desactivados'); } }}>Quitar avisos</button>;
  }
  if (estado === 'bloqueados') return null;
  return <button onClick={async () => { try { setEstado(await activarAvisos()); } catch { /* nada */ } }}>Activar avisos</button>;
}
