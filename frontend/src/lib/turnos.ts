import type { Cuadrante, TurnoDia } from '../api/client';

/** Fechas en hora local (sin líos de zona horaria). */
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const deIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const sumar = (d: Date, dias: number) => { const x = new Date(d); x.setDate(x.getDate() + dias); return x; };
export const lunes = (d: Date) => sumar(d, -((d.getDay() + 6) % 7));
export const hoyIso = () => iso(new Date());

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const diaCorto = (s: string) => DIAS[deIso(s).getDay()].slice(0, 3);
export const diaLargo = (s: string) => DIAS[deIso(s).getDay()];
export const mesNombre = (m: number) => MESES[m];
export const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const fechaLarga = (s: string) => { const d = deIso(s); return `${diaLargo(s)} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
export const fechaCorta = (s: string) => { const d = deIso(s); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };

export function rangoSemana(desde: string) {
  const a = deIso(desde), b = sumar(a, 6);
  return a.getMonth() === b.getMonth()
    ? `del ${a.getDate()} al ${b.getDate()} de ${MESES[b.getMonth()]}`
    : `del ${a.getDate()} de ${MESES[a.getMonth()]} al ${b.getDate()} de ${MESES[b.getMonth()]}`;
}

/** «Jornada · 8:30–13:30 · 14:30–18:30», «Libre», «Vacaciones»… */
export const textoTurno = (t?: TurnoDia) => {
  if (!t) return '—';
  if (t.clase === 'trabajo') return `${t.nombre} · ${t.horario}`;
  if (t.clase === 'festivo') return `Festivo · ${t.horario}`;
  return t.nombre;
};

export const trabaja = (t?: TurnoDia) => t?.clase === 'trabajo';

/** Texto de la semana listo para mandar por WhatsApp. */
export function textoWhatsApp(c: Cuadrante, tipos: { id: string; nombre: string; horario: string }[]): string {
  const lineas = [`*Turnos Casa Fonso* · semana ${rangoSemana(c.desde)}`, ''];
  const dias = c.empleados[0]?.dias.map(d => d.fecha) ?? [];
  dias.forEach((f, i) => {
    const d = deIso(f);
    const cab = `*${cap(diaCorto(f))} ${d.getDate()}*`;
    if (c.festivos[f]) { lineas.push(`${cab} · Festivo (${c.festivos[f]})`); return; }
    const t = c.empleados.map(e => ({ e, t: e.dias[i] }));
    const trab = t.filter(x => x.t.clase === 'trabajo');
    const vac = t.filter(x => x.t.clase === 'vacaciones');
    if (!trab.length && d.getDay() === 0) return; // domingo cerrado: no se pone
    if (!trab.length) { lineas.push(`${cab} · Cerrado`); return; }
    const quien = trab.map(x => x.t.tipo === 'jornada' || x.t.tipo === 'sabado' ? x.e.nombre : `${x.e.nombre} (${x.t.horario})`);
    let l = `${cab} · ${quien.join(', ')}`;
    if (vac.length) l += ` · Vacaciones: ${vac.map(x => x.e.nombre).join(', ')}`;
    lineas.push(l);
  });
  const leyenda = tipos.filter(t => t.id === 'jornada' || t.id === 'sabado').map(t => `${t.nombre}: ${t.horario}`);
  if (leyenda.length) lineas.push('', leyenda.join(' · '));
  return lineas.join('\n');
}
