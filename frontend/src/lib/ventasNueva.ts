import { esEncargado } from '../auth';

/**
 * Albaranes de venta, versión simplificada (4/11/2026): primero solo para Andrés («En pruebas»).
 * Cuando la apruebe, poner esto a `true` y la ve toda la tienda.
 */
export const VENTAS_NUEVA_PARA_TODOS = false;
export const ventasNueva = () => VENTAS_NUEVA_PARA_TODOS || esEncargado();

/** Orden de la lista que se estaba viendo, para «Siguiente albarán» en la ficha. */
const CLAVE = 'cfVentasOrden';
export const guardarOrden = (ids: number[]) => { try { sessionStorage.setItem(CLAVE, JSON.stringify(ids.slice(0, 500))); } catch { /* nada */ } };
export const siguienteDe = (id: number): number | null => {
  try {
    const ids = JSON.parse(sessionStorage.getItem(CLAVE) || '[]') as number[];
    const i = ids.indexOf(id);
    return i >= 0 && i + 1 < ids.length ? ids[i + 1] : null;
  } catch { return null; }
};

/** Días que lleva subido (created_at va en UTC, a veces sin la «Z»). */
export const diasDesde = (iso?: string | null) => {
  if (!iso) return 0;
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : 0;
};
