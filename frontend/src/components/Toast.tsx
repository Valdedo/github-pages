import { useState, useCallback, useEffect, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const colors: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: '#f0fdf4', border: '#86efac', icon: '✓' },
  error:   { bg: '#fef2f2', border: '#fca5a5', icon: '✕' },
  warning: { bg: '#fffbeb', border: '#fcd34d', icon: '⚠' },
  info:    { bg: '#eff6ff', border: '#93c5fd', icon: 'ℹ' },
};

let _counter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++_counter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const ToastContainer = useCallback(() => (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px',
      display: 'flex', flexDirection: 'column', gap: '8px',
      zIndex: 9999, pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <ToastChip key={t.id} item={t} />
      ))}
    </div>
  ), [toasts]);

  return { showToast, ToastContainer };
}

function ToastChip({ item }: { item: ToastItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const c = colors[item.type];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.25s, transform 0.25s';
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });
  }, []);

  return (
    <div ref={ref} style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '10px',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
      fontSize: '13px',
      fontWeight: 500,
      minWidth: '220px',
      maxWidth: '340px',
      pointerEvents: 'auto',
    }}>
      <span style={{ fontSize: '16px', lineHeight: 1 }}>{c.icon}</span>
      <span style={{ flex: 1 }}>{item.message}</span>
    </div>
  );
}
