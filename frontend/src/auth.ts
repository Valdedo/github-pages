/** Sesión de la app (código de acceso). Se guarda en este dispositivo. */
const KEY = 'cfToken';
const ROL = 'cfRol';

export type Rol = 'tienda' | 'reparto';

export const getToken = (): string => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const getRol = (): Rol | null => { try { return (localStorage.getItem(ROL) as Rol) || null; } catch { return null; } };
export const setSesion = (token: string, rol: Rol) => {
  try { localStorage.setItem(KEY, token); localStorage.setItem(ROL, rol); } catch { /* nada */ }
};
export const cerrarSesion = () => {
  try { localStorage.removeItem(KEY); localStorage.removeItem(ROL); } catch { /* nada */ }
};

/** Añade el código de sesión a un enlace directo (imágenes, PDF, descargas). */
export const withToken = (url: string) => {
  const t = getToken();
  return t ? `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(t)}` : url;
};
