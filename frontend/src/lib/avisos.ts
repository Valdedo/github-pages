import { api } from '../api/client';
import { getRol, getYo } from '../auth';

/** Registro del service worker (avisos + funcionar sin cobertura). */
export function registrarSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* nada */ }); });
}

export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const soportaAvisos = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Estado de los avisos en este dispositivo. */
export type EstadoAvisos = 'activados' | 'desactivados' | 'bloqueados' | 'instalar' | 'no-soportado';

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soportaAvisos()) return esIOS() && !instalada() ? 'instalar' : 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueados';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'activados' : 'desactivados';
  } catch { return 'desactivados'; }
}

const deB64 = (s: string) => {
  const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};

export async function activarAvisos(): Promise<EstadoAvisos> {
  if (!soportaAvisos()) return estadoAvisos();
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return permiso === 'denied' ? 'bloqueados' : 'desactivados';
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const { data } = await api.get<{ clave: string }>('/api/push/clave');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64(data.clave) });
  const persona = getYo() || (getRol() === 'reparto' ? 'melchor' : '');
  await api.post('/api/push/suscribir', { ...sub.toJSON(), persona: persona || null });
  await api.post('/api/push/prueba', { endpoint: sub.endpoint }).catch(() => { /* nada */ });
  return 'activados';
}

export async function desactivarAvisos(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.post('/api/push/baja', { endpoint: sub.endpoint }).catch(() => { /* nada */ });
    await sub.unsubscribe();
  }
}

/** Si cambia quién usa el dispositivo, se actualiza la suscripción (para los avisos de turnos). */
export async function actualizarPersona() {
  try {
    if (!soportaAvisos() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const persona = getYo() || (getRol() === 'reparto' ? 'melchor' : '');
    await api.post('/api/push/suscribir', { ...sub.toJSON(), persona: persona || null });
  } catch { /* nada */ }
}
