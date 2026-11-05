import { esEncargado } from '../auth';

/**
 * Pedidos y Reparaciones rehechos (5/11/2026, opción B elegida por Andrés): misma forma en las dos,
 * ordenadas por lo que toca hacer (avisar, pedir/llevar, esperando, para recoger) en vez de pestañas por estado.
 * Primero solo para Andrés («En pruebas»). Cuando las apruebe: `ENCARGOS_NUEVO_PARA_TODOS = true`.
 * Componentes en `components/Encargos.tsx`, estilos en `pages/encargos.css` (clases `enc-*`).
 */
export const ENCARGOS_NUEVO_PARA_TODOS = false;
export const encargosNuevo = () => ENCARGOS_NUEVO_PARA_TODOS || esEncargado();

const dia = (s?: string | null) => (s ? s.split('T')[0] : '');
export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Días entre una fecha guardada y hoy (positivo = ya pasó). */
export const diasDesde = (s?: string | null): number => {
  const d = dia(s);
  if (!d) return 0;
  return Math.round((Date.parse(hoyISO()) - Date.parse(d)) / 86400000);
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «hoy», «ayer», «el lunes», «el 28/10». */
export const cuando = (s?: string | null): string => {
  const d = dia(s);
  if (!d) return '';
  const n = diasDesde(d);
  if (n === 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n === -1) return 'mañana';
  if (n > 1 && n < 7) return `el ${DIAS[new Date(d + 'T12:00:00').getDay()]}`;
  const [, m, dd] = d.split('-');
  return `el ${dd}/${m}`;
};

/** «desde hoy», «desde ayer», «desde hace 5 días», «desde el 28/10». */
export const desde = (s?: string | null): string => {
  const n = diasDesde(s);
  if (!dia(s)) return '';
  if (n <= 1) return `desde ${cuando(s)}`;
  if (n < 15) return `desde hace ${n} días`;
  return `desde ${cuando(s)}`;
};

/**
 * «3 llave bola 1"» → { cantidad: 3, descripcion: 'llave bola 1"' }. También «3x», «3 x», «3 ud», «2,5 m de…».
 * Si no empieza por número, cantidad 1.
 */
export function leerLinea(txt: string): { cantidad: number; descripcion: string } | null {
  const t = txt.trim().replace(/^[-•*·]\s*/, '');
  if (!t) return null;
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|×|ud\.?|uds\.?|unidades?)?\s+(.+)$/i);
  if (m) {
    const n = Number(m[1].replace(',', '.'));
    if (n > 0 && n < 100000) return { cantidad: n, descripcion: m[2].trim() };
  }
  return { cantidad: 1, descripcion: t };
}
