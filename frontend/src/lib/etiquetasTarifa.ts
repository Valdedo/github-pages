/** Etiquetas de balda desde las tarifas (20/11/2026, «En pruebas»: solo Andrés). Se eligen artículos en una tarifa y se
 *  imprimen en los mismos folios de «Recibir mercancía» (97 × 42,3 mm). Lo elegido se queda en este aparato hasta que
 *  se vacía la lista, así se puede ir de una familia a otra antes de imprimir. */
import { useSyncExternalStore } from 'react';
import { esEncargado } from '../auth';

/** Poner `true` cuando Andrés lo apruebe para toda la tienda. */
export const ETIQUETAS_TARIFA_PARA_TODOS = false;
export const etiquetasTarifa = () => ETIQUETAS_TARIFA_PARA_TODOS || esEncargado();

export interface EtiquetaTarifa { prov: string; ref: string; nombre: string }

const CLAVE = 'cfEtiquetasTarifa';
const MAX = 240;  // 20 folios: de sobra, y la dirección del PDF no se hace eterna
const oyentes = new Set<() => void>();
let lista: EtiquetaTarifa[] = leer();

function leer(): EtiquetaTarifa[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? '[]');
    return Array.isArray(v) ? v.filter(x => x && typeof x.prov === 'string' && typeof x.ref === 'string').slice(0, MAX) : [];
  } catch { return []; }
}
function poner(nueva: EtiquetaTarifa[]) {
  lista = nueva.slice(0, MAX);
  try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch { /* sin sitio: se queda en memoria */ }
  oyentes.forEach(f => f());
}

export const estaEnEtiquetas = (l: EtiquetaTarifa[], prov: string, ref: string) => l.some(x => x.prov === prov && x.ref === ref);
export const quitarEtiqueta = (prov: string, ref: string) => poner(lista.filter(x => !(x.prov === prov && x.ref === ref)));
export const vaciarEtiquetas = () => poner([]);
/** Añade las que falten (en el orden dado). Devuelve cuántas no caben. */
export function anadirEtiquetas(nuevas: EtiquetaTarifa[]): number {
  const faltan = nuevas.filter(n => !estaEnEtiquetas(lista, n.prov, n.ref));
  const caben = Math.max(0, MAX - lista.length);
  poner([...lista, ...faltan.slice(0, caben)]);
  return faltan.length - Math.min(faltan.length, caben);
}
export function cambiarEtiqueta(e: EtiquetaTarifa) {
  if (estaEnEtiquetas(lista, e.prov, e.ref)) quitarEtiqueta(e.prov, e.ref); else anadirEtiquetas([e]);
}

export function useEtiquetasTarifa(): EtiquetaTarifa[] {
  return useSyncExternalStore(f => { oyentes.add(f); return () => { oyentes.delete(f); }; }, () => lista, () => lista);
}
