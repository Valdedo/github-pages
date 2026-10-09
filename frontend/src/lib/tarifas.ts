/** Catálogo de tarifas (en pruebas): pegatinas y fotos por familia, y formato de precios. */
import { normaliza } from './texto';

export interface TarifaResumen {
  id: string; nombre: string; sub: string;
  articulos: number | null; familias: number | null; actualizada: string | null;
}
export interface TarifaMedida {
  ref: string; codigo?: string | null; descripcion: string; valor: string; ud_medida: string; unidad: string; ud_venta: string;
  coste: number | null; pvp: number | null; pvp_iva: number | null; evol: number | null; fecha: string | null;
}
export interface TarifaGrupo { titulo: string | null; seccion?: string; medidas: TarifaMedida[] }
export interface TarifaFamilia { id: string; nombre: string; clave: string; n: number; grupos: TarifaGrupo[] }
export interface TarifaFactura {
  numero: string; fecha: string; enlace: string; seguro?: boolean;
  cantidad?: number | null; bruto?: number | null; dto1?: number | null; dto2?: number | null;
}
export interface Tarifa {
  id: string; nombre: string; sub: string; margen: number | null; actualizada: string | null; leida: string | null;
  aviso: string | null; ultima_factura: (TarifaFactura & { cambios: number | null; nuevos: number | null }) | null;
  familias: TarifaFamilia[];
}
export interface FichaTarifa {
  proveedor: string; proveedor_nombre: string; aviso: string | null;
  familia: { id: string; nombre: string; clave: string };
  descripcion: string; unidad: string; ud_venta: string; ud_compra: string;
  precio: number | null; fecha: string | null; precio_ant: number | null; fecha_ant: string | null;
  evol: number | null; kg_m: number | null; coste: number | null; pvp: number | null; pvp_iva: number | null;
  margen: number | null; historial: { fecha: string; precio: number }[];
  factura: TarifaFactura | null; posibles: TarifaFactura[]; medida: string | null;
  // Solo en las tarifas que traen cada factura (Zabaleta)
  codigo?: string | null; subcategoria?: string | null; redondeo?: string | null;
  compras?: number | null; minimo?: number | null; nota?: string | null; apunte?: string | null;
}

/** Proveedores que llegarán más adelante (se ven apagados). */
export const PROXIMAMENTE = [
  { id: 'pladur', nombre: 'Pladur', sub: 'Construdeco · placas, perfilería y pastas', pegatina: 'prov-pladur' },
  { id: 'dinak', nombre: 'Dinak', sub: 'Construdeco · chimeneas', pegatina: 'prov-dinak' },
  { id: 'isoltubex', nombre: 'Isoltubex', sub: 'Tubería y aislamiento', pegatina: 'prov-isoltubex' },
];
export const PEGATINA_PROVEEDOR: Record<string, string> = { hierros: 'prov-hierros', zabaleta: 'prov-zabaleta' };

export const pegatina = (nombre: string) => `/catalogo/st-${nombre}.png`;

// Familia de la tarifa → dibujo (pegatina, para navegar) y foto (en la ficha y las medidas).
// Las fotos son de referencia, de tiendas (Obramat / Leroy Merlin): se enlazan, no se copian.
const ADEO = (id: string, ext = 'jpg') => `https://media.adeo.com/media/${id}/media.${ext}?width=640`;
const FOTOS: Record<string, string> = {
  'viga-ipn': ADEO('4440005'),
  'viga-ipe': 'https://comprahierro.com/wp-content/uploads/2021/09/viga-ipe-hierro-producto-comprahierro.jpg',
  'viga-heb': ADEO('4421729'),
  'upn': ADEO('4397039'),
  'angulo': ADEO('4414504'),
  'pletina': ADEO('4402048'),
  'tubo-cuadrado': ADEO('4398705'),
  'tubo-rectangular': ADEO('4409421'),
  'tubo-galv': ADEO('3921809', 'png'),
  'tubo-redondo-galv': ADEO('4417164'),
  'tubo-iso': ADEO('848488'),
  'chapa': ADEO('4428311'),
  'chapa-ondulada': ADEO('4409904'),
  'panel-sandwich': ADEO('4409182'),
  'redondo': ADEO('2101536', 'png'),
  'malla': ADEO('4419427'),
};
// Familias de Zabaleta (van antes: «Canalón y cubierta» no es la chapa de cubierta de Hierros)
const ZABALETA: [RegExp, string][] = [
  [/^saneamiento/, 'zab-saneamiento'], [/^evacuacion/, 'zab-evacuacion'], [/^abastecimiento/, 'zab-abastecimiento'],
  [/^fontaneria/, 'zab-fontaneria'], [/^calefaccion/, 'zab-calefaccion'], [/^chimenea/, 'zab-chimenea'],
  [/^canalon/, 'zab-canalon'], [/^bombeo/, 'zab-bombeo'], [/^sanitario/, 'zab-sanitario'],
  [/^quimicos/, 'zab-quimicos'], [/^ferreteria/, 'zab-ferreteria'],
];
const FAMILIAS: [RegExp, string][] = [
  [/ipn/, 'viga-ipn'], [/ipe/, 'viga-ipe'], [/heb/, 'viga-heb'], [/upn/, 'upn'], [/angulo/, 'angulo'],
  [/pletina|llanta/, 'pletina'], [/rectangular/, 'tubo-rectangular'], [/cuadrados negros|tubo cuadrado/, 'tubo-cuadrado'],
  [/redondos galv/, 'tubo-redondo-galv'], [/galvaniz/, 'tubo-galv'], [/iso/, 'tubo-iso'],
  [/cubierta|panel/, 'chapa-ondulada'], [/chapa/, 'chapa'], [/redondo/, 'redondo'],
];
/** Clave del dibujo de una familia («Tubos cuadrados negros» → «tubo-cuadrado»). */
export function claveFamilia(nombre: string): string {
  const n = normaliza(nombre);
  const z = ZABALETA.find(([rx]) => rx.test(n));
  if (z) return z[1];
  return FAMILIAS.find(([rx]) => rx.test(n))?.[1] ?? 'malla';
}
/** Foto de un artículo: la de su familia, salvo casos claros (paneles, chapas sueltas…).
 *  En «Varios» solo hay foto si se sabe qué es; si no, vacío (se enseña la pegatina). */
export function fotoArticulo(familia: string, descripcion?: string): string {
  const d = normaliza(descripcion || '');
  if (claveFamilia(familia).startsWith('zab-')) return ''; // cientos de piezas distintas: su pegatina
  const varios = claveFamilia(familia) === 'malla' && !/malla|valla|hercules/.test(normaliza(familia));
  if (/^panel/.test(d)) return FOTOS['panel-sandwich'];
  if (/^malla|^poste|^base poste|^abrazadera/.test(d)) return FOTOS['malla'];
  if (/^chapa/.test(d) && /onduladas?|trapezoidal|lacada|colaborante/.test(d)) return FOTOS['chapa-ondulada'];
  if (/^chapa/.test(d)) return FOTOS['chapa'];
  if (/^tubo rectangular galv/.test(d)) return FOTOS['tubo-galv'];
  if (varios) return descripcion ? '' : FOTOS['malla'];
  return FOTOS[claveFamilia(familia)] ?? '';
}

const fmt = (v: number, dec = 2) => v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
/** «7,50 €» */
export const eur = (v: number | null | undefined) => v == null ? '—' : `${fmt(v)} €`;
/** «+5,6 %» */
export const pct = (v: number | null | undefined) =>
  v == null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 1)} %`;

export type ModoPrecio = 'venta' | 'iva' | 'coste';
export const precioModo = (m: TarifaMedida, modo: ModoPrecio) =>
  modo === 'venta' ? m.pvp : modo === 'iva' ? m.pvp_iva : m.coste;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** «sep-26» → «sep 2026»; «2026-09-30» → «30 sep 2026» */
export function mesLargo(m?: string | null): string {
  if (!m) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m);
  if (iso) return `${Number(iso[3])} ${MESES[Number(iso[2]) - 1]} ${iso[1]}`;
  const [mm, aa] = m.split('-');
  return `${mm} ${aa ? 2000 + Number(aa) : ''}`.trim();
}

/** Mes de la tarifa reciente (últimos 45 días aprox.): para marcar precios que acaban de cambiar. */
export function esReciente(m?: string | null, hoy = new Date()): boolean {
  if (!m) return false;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m);
  const i = iso ? Number(iso[2]) - 1 : MESES.indexOf(m.slice(0, 3));
  if (i < 0) return false;
  const f = iso ? new Date(Number(iso[1]), i, Number(iso[3])) : new Date(2000 + Number(m.slice(4)), i, 15);
  return (hoy.getTime() - f.getTime()) / 86400000 < 45;
}
