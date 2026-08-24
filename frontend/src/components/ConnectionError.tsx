import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ConnectionError({ message, onRetry, compact = false }: Props) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: '#fef2f2',
        border: '1px solid #fca5a5',
        color: '#991b1b',
        borderRadius: 'var(--r-lg)',
        padding: compact ? '10px 14px' : '14px 18px',
        marginBottom: 16,
        fontSize: 13,
      }}
    >
      <AlertCircle size={18} style={{ flexShrink: 0, color: '#dc2626' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: compact ? 0 : 2 }}>
          {message}
        </div>
        {!compact && (
          <div style={{ fontSize: 12, color: '#7f1d1d', opacity: 0.85 }}>
            No se pudieron cargar los datos. Los contadores no reflejan la realidad.
          </div>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#fff',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            borderRadius: 'var(--r)',
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <RefreshCw size={13} /> Reintentar
        </button>
      )}
    </div>
  );
}
