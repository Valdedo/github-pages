import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { accesoEstado, accesoEntrar, accesoConfigurar, describeApiError } from '../api/client';
import { getToken, setSesion, cerrarSesion, type Rol } from '../auth';
import { setReparto } from '../reparto';
import { Logo } from './Logo';

type Fase = 'cargando' | 'crear' | 'entrar' | 'dentro' | 'sin-conexion';

function errorDe(err: unknown): string {
  const ax = err as { response?: { data?: { detail?: string } } };
  return ax.response?.data?.detail || describeApiError(err);
}

/**
 * Pide el código de acceso antes de mostrar la app.
 * - Sin códigos creados: la primera persona que entra los crea (tienda y reparto).
 * - Con el código de reparto, el dispositivo queda en la vista de Melchor.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Fase>('cargando');
  const [codigo, setCodigo] = useState('');
  const [tienda, setTienda] = useState('');
  const [reparto, setRepartoCod] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const comprobar = () => {
    setFase('cargando');
    accesoEstado()
      .then(({ data }) => {
        if (!data.configurado) setFase('crear');
        else if (data.rol && getToken()) {
          setSesion(getToken(), data.rol, data.persona);
          if (data.rol === 'reparto') setReparto(true);
          setFase('dentro');
        } else { cerrarSesion(); setFase('entrar'); }
      })
      .catch(() => setFase('sin-conexion'));
  };

  useEffect(() => {
    comprobar();
    const salir = () => { setCodigo(''); setFase('entrar'); };
    window.addEventListener('cf-sin-sesion', salir);
    return () => window.removeEventListener('cf-sin-sesion', salir);
  }, []);

  const entrarCon = (token: string, rol: Rol, persona?: string | null) => {
    setSesion(token, rol, persona);
    setReparto(rol === 'reparto');
    if (rol === 'reparto') window.history.replaceState(null, '', '/reparto');
    setFase('dentro');
  };

  const onEntrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim()) return;
    setEnviando(true); setError(null);
    try {
      const { data } = await accesoEntrar(codigo.trim());
      entrarCon(data.token, data.rol, data.persona);
    } catch (err) {
      setError(errorDe(err)); setCodigo('');
    } finally { setEnviando(false); }
  };

  const onCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true); setError(null);
    try {
      const { data } = await accesoConfigurar(tienda.trim(), reparto.trim());
      entrarCon(data.token, data.rol, data.persona);
    } catch (err) {
      setError(errorDe(err));
    } finally { setEnviando(false); }
  };

  if (fase === 'dentro') return <>{children}</>;

  return (
    <div className="acceso">
      <div className="acceso-caja">
        <Logo size={44} />
        {fase === 'cargando' && <p className="acceso-txt">Cargando…</p>}

        {fase === 'sin-conexion' && (
          <>
            <h1>No hay conexión</h1>
            <p className="acceso-txt">No se puede hablar con el servidor. Comprueba internet y vuelve a probar.</p>
            <button className="btn btn-primary btn-lg" onClick={comprobar}>Volver a probar</button>
          </>
        )}

        {fase === 'entrar' && (
          <form onSubmit={onEntrar} className="acceso-form">
            <h1><Lock size={26} style={{ verticalAlign: -3 }} /> Código de acceso</h1>
            <p className="acceso-txt">Escribe tu código. Este dispositivo lo recordará.</p>
            <input className="form-input acceso-codigo" type="password" inputMode="numeric" autoComplete="current-password"
              autoFocus value={codigo} onChange={e => setCodigo(e.target.value)} aria-label="Código de acceso" />
            {error && <p className="acceso-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-lg" disabled={enviando || !codigo.trim()}>
              {enviando ? 'Comprobando…' : 'Entrar'}
            </button>
          </form>
        )}

        {fase === 'crear' && (
          <form onSubmit={onCrear} className="acceso-form">
            <h1>Crea los códigos de acceso</h1>
            <p className="acceso-txt">Solo se hace una vez. Después, cada ordenador o móvil pedirá su código la primera vez que se abra la app.</p>
            <label className="form-label">Código de la tienda <small>(Patricia, Oscar, Andrés)</small>
              <input className="form-input acceso-codigo" type="text" inputMode="numeric" autoComplete="off" autoFocus
                value={tienda} onChange={e => setTienda(e.target.value)} />
            </label>
            <label className="form-label">Código de reparto <small>(Melchor: solo ve los albaranes para firmar)</small>
              <input className="form-input acceso-codigo" type="text" inputMode="numeric" autoComplete="off"
                value={reparto} onChange={e => setRepartoCod(e.target.value)} />
            </label>
            <p className="acceso-txt" style={{ fontSize: 14 }}>Mínimo 4 números o letras. Apúntalos en un sitio seguro.</p>
            {error && <p className="acceso-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-lg" disabled={enviando || tienda.trim().length < 4}>
              {enviando ? 'Guardando…' : 'Guardar códigos y entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
