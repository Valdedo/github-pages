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
  const zab = claveFamilia(familia);
  if (zab.startsWith('zab-')) return fotoZabaleta(zab, d);
  const varios = claveFamilia(familia) === 'malla' && !/malla|valla|hercules/.test(normaliza(familia));
  if (/^panel/.test(d)) return FOTOS['panel-sandwich'];
  if (/^malla|^poste|^base poste|^abrazadera/.test(d)) return FOTOS['malla'];
  if (/^chapa/.test(d) && /onduladas?|trapezoidal|lacada|colaborante/.test(d)) return FOTOS['chapa-ondulada'];
  if (/^chapa/.test(d)) return FOTOS['chapa'];
  if (/^tubo rectangular galv/.test(d)) return FOTOS['tubo-galv'];
  if (varios) return descripcion ? '' : FOTOS['malla'];
  return FOTOS[claveFamilia(familia)] ?? '';
}

// Zabaleta: una foto de referencia por tipo de pieza (Obramat / Leroy Merlin), elegida por la descripción.
// Lo que no se reconoce va sin foto (se enseña la pegatina de la familia).
const FOTOS_ZAB: Record<string, string> = {
  'sn8': ADEO('4412835'), 'teja': ADEO('1828844'), 'canal-reja': ADEO('4408617'),
  'rejilla': ADEO('4403190'), 'tapa-fundicion': ADEO('4406540'), 'drenaje': ADEO('4399672'),
  'corrugado': ADEO('4439510'), 'geotextil': 'https://media.adeo.com/mkp/5af38bf3155efc5755b1f51d886ae18a/media.jpg?width=640', 'arqueta': ADEO('4395583'),
  'bote-sifonico': ADEO('4405445'), 'tubo-pvc': ADEO('4402708'), 'codo-pvc': ADEO('5766834'),
  'codo45-pvc': ADEO('4409123'), 'manguito-pvc': ADEO('4399771'), 'derivacion-pvc': ADEO('4415043'),
  'tapon-pvc': ADEO('4417073'), 'pvc-presion': ADEO('2009550'), 'hidrotubo': ADEO('4420525'),
  'polietileno': 'https://media.adeo.com/mkp/45a971b728e32a909759dff533b8a7c5/media.jpg?width=640', 'racor-laton-pe': 'https://media.adeo.com/mkp/513b667e3bf01fa91c1c4900bba3e8e9/media.jpg?width=640', 'tubo-cobre': ADEO('4420198'),
  'laton': ADEO('4414001', 'png'), 'latiguillo': ADEO('4418430'), 'llave-paso': ADEO('4418085'),
  'reductora': ADEO('4881252'), 'accesorio-cobre': ADEO('4403114'), 'multicapa': ADEO('4406959'),
  'acumulador': ADEO('4590190'), 'termo': ADEO('5496523'), 'calentador': ADEO('5438390', 'png'),
  'circulador': ADEO('4408818'), 'radiador': ADEO('4410857'), 'vaso-expansion': ADEO('4402341'),
  'estufa-pellet': ADEO('6021048', 'png'), 'estufa-lena': ADEO('4398998'), 'tubo-dp': ADEO('5357911'),
  'tubo-sw': ADEO('5355509'), 'sombrerete': ADEO('5357900'), 'abrazadera-chimenea': ADEO('5766137'),
  'canalon': ADEO('4411185'), 'canalon-accesorio': ADEO('4406284'), 'grupo-presion': ADEO('4400069'),
  'bomba': ADEO('4564446'), 'mecanismo-cisterna': ADEO('4419271'), 'flotador': ADEO('4417933'),
  'sifon': ADEO('4408087'), 'telefono-ducha': ADEO('4403290'), 'teflon': ADEO('4395890'),
  'desincrustante': ADEO('4400694'), 'masilla': ADEO('4407228'), 'gas-mapp': ADEO('4414643'),
  'manguera-gas': ADEO('4420112'), 'espuma': ADEO('4417503'), 'abrazadera': ADEO('4412512'),
  'soporte-perforado': ADEO('4399934'), 'broca-sds': ADEO('4418442'), 'cortatubos': ADEO('4412247'),
  'sierra': ADEO('5514530'),
};
/** Foto de la familia cuando no hay artículo elegido. */
const ZAB_FAMILIA: Record<string, string> = {
  'zab-saneamiento': 'sn8', 'zab-evacuacion': 'codo-pvc', 'zab-abastecimiento': 'polietileno', 'zab-fontaneria': 'laton',
  'zab-calefaccion': 'termo', 'zab-chimenea': 'tubo-dp', 'zab-canalon': 'canalon', 'zab-bombeo': 'grupo-presion',
  'zab-sanitario': 'mecanismo-cisterna', 'zab-quimicos': 'espuma', 'zab-ferreteria': 'abrazadera',
};
type Regla = [RegExp, string];
const REGLAS_ZAB: Record<string, Regla[]> = {
  'zab-saneamiento': [[/sn8/, 'sn8'], [/teja/, 'teja'], [/canal/, 'canal-reja'], [/rejilla|imbornal|sumidero/, 'rejilla'],
    [/tapa|marco|cerco/, 'tapa-fundicion'], [/drenaje/, 'drenaje'], [/co?arrug/, 'corrugado'], [/geotextil/, 'geotextil'],
    [/arqueta/, 'arqueta'], [/sifonico/, 'bote-sifonico'], [/.*/, 'teja']],
  'zab-evacuacion': [[/hidrotubo/, 'hidrotubo'], [/presion/, 'pvc-presion'], [/tuberia|tubo/, 'tubo-pvc'], [/codo.* 45/, 'codo45-pvc'],
    [/codo|curva/, 'codo-pvc'], [/manguito|reduccion/, 'manguito-pvc'], [/derivacion|injerto|^te /, 'derivacion-pvc'], [/tapon/, 'tapon-pvc']],
  'zab-abastecimiento': [[/poliet|p\.?bd|pe-?40|pe100/, 'polietileno'], [/.*/, 'racor-laton-pe']],
  'zab-fontaneria': [[/^metro (barra|rollo)/, 'tubo-cobre'], [/anclaje|taco|tornillo/, ''], [/latiguillo/, 'latiguillo'], [/reductora/, 'reductora'],
    [/multicapa|jucar|s7359/, 'multicapa'], [/filpress|inox/, ''], [/llave|valv|esfera|grifo|filt/, 'llave-paso'],
    [/ cu\b|cobre|tapaporos/, 'accesorio-cobre'], [/.*/, 'laton']],
  'zab-calefaccion': [[/interacum|acumulador|^dep/, 'acumulador'], [/termo/, 'termo'], [/calentador/, 'calentador'],
    [/radiador|aluminio/, 'radiador'], [/vaso|flexcon|airflix|aquasystem/, 'vaso-expansion'], [/bomba|circulador/, 'circulador']],
  'zab-chimenea': [[/pellet/, 'estufa-pellet'], [/estufa/, 'estufa-lena'], [/sombrerete/, 'sombrerete'],
    [/abrazadera/, 'abrazadera-chimenea'], [/ swj? /, 'tubo-sw'], [/\bdp/, 'tubo-dp']],
  'zab-canalon': [[/^mt\.? canalon|tramo/, 'canalon'], [/.*/, 'canalon-accesorio']],
  'zab-bombeo': [[/grupo/, 'grupo-presion'], [/.*/, 'bomba']],
  'zab-sanitario': [[/flotador/, 'flotador'], [/cisterna|descarga/, 'mecanismo-cisterna'], [/sifon/, 'sifon'], [/telefono|ducha/, 'telefono-ducha']],
  'zab-quimicos': [[/teflon|loctite|hilo sellador/, 'teflon'], [/griffon|decaliq|decagel/, 'desincrustante'], [/masilla|silicon/, 'masilla'],
    [/mapp/, 'gas-mapp'], [/manguera|butano|glp/, 'manguera-gas'], [/espuma/, 'espuma']],
  'zab-ferreteria': [[/broca/, 'broca-sds'], [/cortatubo/, 'cortatubos'], [/sierra/, 'sierra'], [/abrazadera|abarcon/, 'abrazadera'],
    [/perforado/, 'soporte-perforado'], [/co?arrug/, 'corrugado'], [/latiguillo/, 'latiguillo'], [/p\/tubo pe/, 'racor-laton-pe'],
    [/laton|mamelon|machon/, 'laton'], [/^(curva|codo|manguito|te) /, 'accesorio-cobre']],
};
function fotoZabaleta(fam: string, d: string): string {
  if (!d) return FOTOS_ZAB[ZAB_FAMILIA[fam]] ?? '';
  const r = (REGLAS_ZAB[fam] ?? []).find(([rx]) => rx.test(d));
  return r && r[1] ? FOTOS_ZAB[r[1]] ?? '' : '';
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
