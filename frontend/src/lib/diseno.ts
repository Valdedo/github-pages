import { esEncargado } from '../auth';

/**
 * Diseño nuevo «En pruebas» (4/11/2026): ideas de Roberto Jirón (jiron.design) y sus 10 heurísticas.
 * Solo para Andrés hasta que lo apruebe; se apaga y enciende desde su círculo (clave `cfDiseno`).
 * Cuando lo apruebe: `DISENO_NUEVO_PARA_TODOS = true` (y se puede quitar el interruptor).
 * Estilos en `diseno.css`, todos bajo `html.dz`.
 */
export const DISENO_NUEVO_PARA_TODOS = false;
const CLAVE = 'cfDiseno';

const preferencia = (): boolean => { try { return localStorage.getItem(CLAVE) !== 'no'; } catch { return true; } };
export const disenoNuevo = (): boolean => DISENO_NUEVO_PARA_TODOS || (esEncargado() && preferencia());
export const puedeCambiarDiseno = (): boolean => !DISENO_NUEVO_PARA_TODOS && esEncargado();

export const aplicarDiseno = () => {
  try { document.documentElement.classList.toggle('dz', disenoNuevo()); } catch { /* nada */ }
};
export const cambiarDiseno = (si: boolean) => {
  try { localStorage.setItem(CLAVE, si ? 'si' : 'no'); } catch { /* nada */ }
  aplicarDiseno();
  window.location.reload();   // los textos que cambian en los componentes se leen al pintar
};
