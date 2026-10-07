/** Sesión de la app (código de acceso). Se guarda en este dispositivo. */
const KEY = 'cfToken';
const ROL = 'cfRol';

export type Rol = 'tienda' | 'reparto' | 'admin';

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

/** Encargado (Andrés): el único que puede cambiar turnos y códigos. */
export const esEncargado = () => getRol() === 'admin';

/** Quién usa este dispositivo («Soy Patricia»), para enseñarle su turno. */
const YO = 'cfYo';
export const getYo = (): string => { try { return localStorage.getItem(YO) || ''; } catch { return ''; } };
export const setYo = (id: string) => { try { if (id) localStorage.setItem(YO, id); else localStorage.removeItem(YO); } catch { /* nada */ } };
