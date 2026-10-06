/** Modo reparto: vista sencilla para el móvil del camionero. Se guarda en ese dispositivo. */
const KEY = 'modoApp';
export const isReparto = () => { try { return localStorage.getItem(KEY) === 'reparto'; } catch { return false; } };
export const setReparto = (on: boolean) => {
  try { if (on) localStorage.setItem(KEY, 'reparto'); else localStorage.removeItem(KEY); } catch { /* nada */ }
};
