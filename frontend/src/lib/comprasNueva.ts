import { esEncargado } from '../auth';

/**
 * Albaranes de compra, versión «Recibir mercancía» (17/11/2026): primero solo para Andrés («En pruebas»).
 * Cuando la apruebe, poner esto a `true` y la ve toda la tienda. La tabla de siempre sigue en
 * `/documento/:id/tabla` («Tabla completa»).
 */
export const COMPRAS_NUEVA_PARA_TODOS = false;
export const comprasNueva = () => COMPRAS_NUEVA_PARA_TODOS || esEncargado();

/** «4,30», «4.30», «4,30 €» → 4.3 (null si no es un número). */
export const leerPrecio = (raw: string): number | null => {
  const t = raw.replace(/[€\s]/g, '').trim();
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};

/** Código de barras de producto bien formado (EAN-8, UPC-A, EAN-13 o GTIN-14, con su dígito de control). */
export const eanValido = (s?: string | null): boolean => {
  const d = String(s ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(d.length)) return false;
  const cuerpo = d.slice(0, -1).split('').reverse();
  const suma = cuerpo.reduce((t, c, i) => t + Number(c) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === Number(d[d.length - 1]);
};

/** Última pegatina usada del folio (para seguir en el mismo): se recuerda en este aparato. */
const CLAVE = 'cfEtiquetaSiguiente';
export const siguientePegatina = (): number => {
  try { const n = Number(localStorage.getItem(CLAVE)); return n >= 1 && n <= 12 ? n : 1; } catch { return 1; }
};
export const guardarSiguientePegatina = (inicio: number, cuantas: number) => {
  try { localStorage.setItem(CLAVE, String(((inicio - 1 + cuantas) % 12) + 1)); } catch { /* nada */ }
};
