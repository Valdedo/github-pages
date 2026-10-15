import { Component, type ReactNode } from 'react';
import { CamionPegatina } from './Pegatinas';

/** ¿No se pudo descargar una parte de la app (sin cobertura o recién publicada una versión nueva)? */
const esDeCarga = (e: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Failed to fetch/i
  .test(String((e as Error)?.message || e));

interface Props { children: ReactNode; inicio?: string; ruta?: string }
interface State { error: unknown }

/**
 * Si una pantalla falla al abrirse (sin cobertura y aún sin guardar en el móvil, o un error de la app),
 * en vez de quedarse en blanco sale qué ha pasado y qué hacer. Con `ruta`, al ir a otra pantalla se
 * vuelve a intentar sola.
 */
export class ErrorPantalla extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State { return { error }; }

  componentDidCatch(error: unknown) { console.error('Pantalla con error:', error); }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.ruta !== this.props.ruta) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
    const carga = esDeCarga(error);
    return (
      <div className="error-pantalla" role="alert">
        <CamionPegatina modo="pinchado" ancho={170} />
        <h2>{sinRed || carga ? 'No se pudo abrir esta pantalla' : 'Algo ha fallado en esta pantalla'}</h2>
        <p>
          {sinRed
            ? 'No hay cobertura y esta pantalla todavía no se ha guardado aquí. Vuelve a probar cuando tengas señal; lo que ya tenías abierto sigue funcionando.'
            : carga
              ? 'Puede que se acabe de publicar una versión nueva de la app. Vuelve a cargar y listo.'
              : 'No se ha perdido nada de lo guardado. Vuelve a cargar; si vuelve a pasar, avisa a Andrés.'}
        </p>
        <div className="error-pantalla-botones">
          <button className="btn btn-primary btn-lg" onClick={() => (navigator.onLine ? window.location.reload() : this.setState({ error: null }))}>
            {sinRed ? 'Volver a probar' : 'Volver a cargar'}
          </button>
          <a className="btn btn-ghost btn-lg" href={this.props.inicio || '/'}>Ir al inicio</a>
        </div>
      </div>
    );
  }
}
