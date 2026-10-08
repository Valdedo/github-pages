/** Utilidades de texto y fechas para buscar y enseñar datos igual en toda la app. */

/** Minúsculas y sin tildes («Grifería» → «griferia»). */
export const normaliza = (s?: string | number | null): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Solo cifras (para comparar teléfonos escritos con espacios o puntos). */
export const soloCifras = (s?: string | null) => String(s ?? '').replace(/\D/g, '');

/**
 * ¿Coinciden todas las palabras de la búsqueda con alguno de los campos?
 * Sin distinguir tildes ni mayúsculas. «%» y «_» se tratan como letras normales.
 * Si la búsqueda tiene 3 o más cifras, también busca en los teléfonos sin espacios.
 */
export function coincide(q: string, ...campos: (string | number | null | undefined)[]): boolean {
  const palabras = normaliza(q).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const texto = campos.map(normaliza).join(' \u0001 ');
  const cifras = campos.map(c => soloCifras(String(c ?? ''))).filter(c => c.length >= 3).join(' ');
  return palabras.every(p => texto.includes(p) || (/^\d[\d\s.]*$/.test(p) && soloCifras(p).length >= 3 && cifras.includes(soloCifras(p))));
}

/** Para mandar una búsqueda al servidor (que busca con LIKE): sin comodines «%» ni «_». */
export const sinComodines = (q: string) => q.replace(/[%_]/g, ' ').replace(/\s+/g, ' ').trim();

const dosCifras = (n: number) => String(n).padStart(2, '0');

/** Fecha en formato dd/mm/aaaa. Acepta «2026-10-05», «2026-10-05T12:00:00» o un Date. */
export function fechaES(d?: string | Date | null): string {
  if (!d) return '';
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (m && d.length <= 10) return `${m[3]}/${m[2]}/${m[1]}`;
    const f = new Date(d);
    if (isNaN(f.getTime())) return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
    d = f;
  }
  return `${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** «1 palé», «3 palés». */
export const plural = (n: number, uno: string, varios?: string) => `${n} ${n === 1 ? uno : (varios ?? uno + 's')}`;

/** Orden de la lista de albaranes que se está viendo, para que ‹ › del albarán vayan en el mismo orden. */
export const ORDEN_ALBARANES = 'cfOrdenAlbaranes';
