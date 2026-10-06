import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

interface ToastState { id: number; text: string; error?: boolean; undo?: () => void | Promise<void> }

/**
 * Aviso flotante de confirmación («✓ Hecho · Deshacer»).
 * Sustituye a las preguntas de «¿Está seguro?»: se hace la acción y se puede deshacer.
 */
export function useCfToast() {
  const [t, setT] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((text: string, opts: { undo?: ToastState['undo']; error?: boolean } = {}) => {
    clearTimeout(timer.current);
    const id = Date.now();
    setT({ id, text, ...opts });
    timer.current = setTimeout(() => setT(cur => (cur?.id === id ? null : cur)), opts.undo ? 7000 : 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const el = t ? (
    <div key={t.id} className={`cf-toast${t.error ? ' error' : ''}`} role="status" aria-live="polite">
      <span className="ok">{t.error ? <X size={16} strokeWidth={3} /> : <Check size={16} strokeWidth={3.2} />}</span>
      <span>{t.text}</span>
      {t.undo && (
        <button onClick={async () => { const u = t.undo; setT(null); await u?.(); }}>Deshacer</button>
      )}
    </div>
  ) : null;

  return { toast: el, show };
}
