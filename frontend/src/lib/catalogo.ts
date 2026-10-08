/**
 * Búsqueda en el catálogo sin distinguir tildes ni mayúsculas.
 * Se carga el catálogo una vez (se guarda 5 minutos) y se filtra en el móvil;
 * así «griferia» encuentra «Grifería» y «%» o «_» no devuelven todo.
 */
import { getCatalog } from '../api/client';
import type { CatalogArticle } from '../types';
import { coincide, normaliza, sinComodines } from './texto';

const MAX = 2000; // lo más que devuelve el servidor de una vez
let cache: { cuando: number; datos: Promise<CatalogArticle[]> } | null = null;

export function cargarCatalogo(forzar = false): Promise<CatalogArticle[]> {
  if (!forzar && cache && Date.now() - cache.cuando < 5 * 60 * 1000) return cache.datos;
  const datos = getCatalog({ limit: MAX }).then(r => r.data);
  cache = { cuando: Date.now(), datos };
  datos.catch(() => { cache = null; });
  return datos;
}

const puntos = (a: CatalogArticle, q: string) => {
  const n = normaliza(q);
  const codigos = [a.codigo_principal, a.ean, a.codigo_proveedor, a.codigo_fabricante].map(normaliza);
  if (codigos.includes(n)) return 0;                       // código exacto
  if (codigos.some(c => c && c.startsWith(n))) return 1;
  if (normaliza(a.descripcion).startsWith(n)) return 2;
  return 3;
};

/** Busca en todo el catálogo. Si el catálogo es enorme, añade lo que encuentre el servidor. */
export async function buscarCatalogo(q: string, limite = 20): Promise<CatalogArticle[]> {
  const filtrar = (lista: CatalogArticle[]) =>
    lista.filter(a => coincide(q, a.descripcion, a.codigo_principal, a.ean, a.codigo_proveedor, a.codigo_fabricante, a.familia));
  let todo = await cargarCatalogo();
  let res = filtrar(todo);
  // Si no aparece y lo cargado tiene un rato, puede ser de un albarán recién leído: se recarga
  if (!res.length && cache && Date.now() - cache.cuando > 15000) { todo = await cargarCatalogo(true); res = filtrar(todo); }
  if (todo.length >= MAX) {
    const limpio = sinComodines(q);
    if (limpio) {
      const ids = new Set(res.map(a => a.id));
      const { data } = await getCatalog({ q: limpio, limit: limite });
      res = res.concat(data.filter(a => !ids.has(a.id)));
    }
  }
  return res
    .map(a => ({ a, p: puntos(a, q) }))
    .sort((x, y) => x.p - y.p || x.a.descripcion.localeCompare(y.a.descripcion, 'es'))
    .slice(0, limite)
    .map(x => x.a);
}
