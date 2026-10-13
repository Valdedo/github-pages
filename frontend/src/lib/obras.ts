/**
 * Obras / referencias de los albaranes de venta, agrupadas aunque se escribieran distinto
 * («C/ Mayor 5», «CALLE MAYOR, 5», «Mayor 5 - reforma» → la misma obra).
 */
import { normaliza } from './texto';

export interface GrupoObra {
  clave: string;          // identificador estable del grupo
  nombre: string;         // cómo se enseña (la forma más usada)
  variantes: string[];    // otras formas en que se escribió
  n: number;
}

export const SIN_OBRA = '__sin_obra__';

// Palabras que no distinguen una obra de otra
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'al', 'obra', 'obras', 'ref', 'referencia',
  'c', 'cl', 'calle', 'avda', 'av', 'avenida', 'n', 'no', 'num', 'numero', 'nº', 'pza', 'plaza', 'ctra', 'carretera',
  'bajo', 'sn', 's', 'para']);

/** Palabras que cuentan: sin tildes, sin signos, sin las vacías. */
function palabras(t: string): string[] {
  return normaliza(t).replace(/s\/n/g, ' ').replace(/[^a-z0-9ñ]+/g, ' ').split(' ')
    .filter(p => p && !VACIAS.has(p));
}

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const v = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = v[0]; v[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = v[j];
      v[j] = Math.min(v[j] + 1, v[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return v[b.length];
}

/** ¿Dos palabras son la misma con alguna letra cambiada? (no vale para números) */
const casi = (a: string, b: string) => {
  if (a === b) return true;
  if (/\d/.test(a + b)) return false;
  const [c, l] = a.length <= b.length ? [a, b] : [b, a];
  if (c.length >= 3 && l.length >= 6 && l.startsWith(c)) return true;  // abreviatura: «urb» = «urbanizacion»
  return c.length >= 5 && distancia(a, b) <= (l.length >= 8 ? 2 : 1);
};

/** ¿Son la misma obra escrita de otra forma? */
export function mismaObra(a: string, b: string): boolean {
  const pa = palabras(a), pb = palabras(b);
  if (!pa.length || !pb.length) return false;
  const ja = pa.join(' '), jb = pb.join(' ');
  if (ja === jb || ja.replace(/ /g, '') === jb.replace(/ /g, '')) return true;
  // Los números (portal, kilómetro, nave…) tienen que coincidir si los dos los tienen
  const na = pa.filter(p => /\d/.test(p)), nb = pb.filter(p => /\d/.test(p));
  if (na.length && nb.length && !na.some(x => nb.includes(x))) return false;
  // Mismo número y misma calle o sitio («Mayor 5, Boal» y «Mayor 5 reforma baño»)
  const antes = (ps: string[], num: string) => { const i = ps.indexOf(num); return i > 0 ? ps[i - 1] : ''; };
  if (na.some(x => nb.includes(x) && antes(pa, x).length >= 4 && casi(antes(pa, x), antes(pb, x)))) return true;
  const [corta, larga] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const comunes = corta.filter(p => larga.some(q => casi(p, q))).length;
  // Una contenida en la otra («Mayor 5» y «Mayor 5 reforma baño»), si la corta dice algo
  if (comunes === corta.length && (corta.length >= 2 || corta[0].length >= 5)) return true;
  // O casi todas las palabras iguales
  const union = pa.length + pb.length - comunes;
  return union > 0 && comunes / union >= 0.6;
}

/** Agrupa las obras de una lista (normalmente, las de un cliente). */
export function agruparObras(obras: (string | null | undefined)[]): { grupos: GrupoObra[]; grupoDe: (obra?: string | null) => string } {
  const cuenta = new Map<string, number>();
  let sin = 0;
  for (const o of obras) {
    const t = (o || '').trim();
    if (!t || !palabras(t).length) { sin++; continue; }
    cuenta.set(t, (cuenta.get(t) || 0) + 1);
  }
  const textos = [...cuenta.keys()].sort((a, b) => (cuenta.get(b)! - cuenta.get(a)!) || a.length - b.length);
  // Unión de las que son la misma
  const padre = textos.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < textos.length; i++)
    for (let j = i + 1; j < textos.length; j++)
      if (raiz(i) !== raiz(j) && mismaObra(textos[i], textos[j])) padre[raiz(j)] = raiz(i);
  const porRaiz = new Map<number, string[]>();
  textos.forEach((t, i) => porRaiz.set(raiz(i), [...(porRaiz.get(raiz(i)) || []), t]));
  const de = new Map<string, string>();
  const grupos: GrupoObra[] = [...porRaiz.values()].map(lista => {
    let ts = lista;
    // Nombre: la más usada; a igualdad, la que más se parece a las demás (sin lo que sobra) y luego la más completa
    const comun = (t: string) => {
      const ps = palabras(t);
      return ps.reduce((s, p) => s + ts.filter(o => palabras(o).some(q => casi(p, q))).length, 0) / ps.length;
    };
    const nombre = [...ts].sort((x, y) => (cuenta.get(y)! - cuenta.get(x)!) || comun(y) - comun(x) || y.length - x.length)[0];
    ts = [nombre, ...ts.filter(t => t !== nombre)];
    const clave = palabras(nombre).join(' ') || nombre;
    ts.forEach(t => de.set(t, clave));
    return { clave, nombre, variantes: ts.slice(1), n: ts.reduce((s, t) => s + cuenta.get(t)!, 0) };
  }).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
  if (sin) grupos.push({ clave: SIN_OBRA, nombre: 'Sin obra ni referencia', variantes: [], n: sin });
  return { grupos, grupoDe: o => de.get((o || '').trim()) ?? SIN_OBRA };
}
