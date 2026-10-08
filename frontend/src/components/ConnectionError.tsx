import { RefreshCw } from 'lucide-react';
import { CamionPegatina } from './Pegatinas';

interface Props {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}

/** Aviso cuando no se pueden cargar los datos: el camión con la rueda pinchada. */
export function ConnectionError({ message, onRetry, compact = false }: Props) {
  const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <div role="alert" className={`conexion-error${compact ? ' compacto' : ''}`}>
      {!compact && <CamionPegatina modo="pinchado" ancho={84} />}
      <div className="conexion-error-txt">
        <b>{sinRed ? 'Sin cobertura' : message}</b>
        {!compact && <small>{sinRed ? 'Lo que hagas se guarda y se envía al volver la conexión.' : 'No se pudieron cargar los datos. Los números de aquí pueden no estar al día.'}</small>}
        {onRetry && (
          <button className="btn btn-ghost btn-sm" onClick={onRetry}><RefreshCw size={14} /> Reintentar</button>
        )}
      </div>
    </div>
  );
}
