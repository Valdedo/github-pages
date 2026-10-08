/** Sesión de la app (código de acceso). Se guarda en este dispositivo. */
const KEY = 'cfToken';
const ROL = 'cfRol';

export type Rol = 'tienda' | 'reparto' | 'admin';

export const getToken = (): string => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const getRol = (): Rol | null => { try { return (localStorage.getItem(ROL) as Rol) || null; } catch { return null; } };
const PERSONA = 'cfPersona';
/** Guarda la sesión. Con un código personal, el dispositivo queda como de esa persona. */
export const setSesion = (token: string, rol: Rol, persona?: string | null) => {
  try {
    localStorage.setItem(KEY, token); localStorage.setItem(ROL, rol);
    if (persona) localStorage.setItem(PERSONA, persona); else localStorage.removeItem(PERSONA);
    if (persona && persona !== 'tienda') localStorage.setItem('cfYo', persona);
    else localStorage.removeItem('cfYo'); // equipo compartido: no es de nadie en concreto
  } catch { /* nada */ }
};
export const cerrarSesion = () => {
  try { localStorage.removeItem(KEY); localStorage.removeItem(ROL); localStorage.removeItem(PERSONA); } catch { /* nada */ }
  // Los datos guardados para usar sin cobertura (service worker) no se quedan en el dispositivo
  try {
    if ('caches' in window) caches.keys().then(ks => ks.filter(k => k.endsWith('-datos')).forEach(k => caches.delete(k))).catch(() => { /* nada */ });
  } catch { /* nada */ }
};
/** Persona del código con el que se entró ('tienda' si es el dispositivo compartido). */
export const getPersona = (): string => { try { return localStorage.getItem(PERSONA) || ''; } catch { return ''; } };
export const sesionPersonal = () => { const p = getPersona(); return !!p && p !== 'tienda'; };

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
