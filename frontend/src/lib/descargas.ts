/**
 * Descargas de archivos (TreyFACT, etiquetas, listín, Excel, PDF…) con fetch,
 * para poder enseñar los errores en español en vez de abrir una pestaña con JSON.
 *
 * - Ordenador y Android: se descarga el archivo (o se abre el PDF en otra pestaña).
 * - iPhone/iPad (también la app instalada): se abre una ventana en el mismo toque y,
 *   cuando el servidor confirma que el archivo está bien, se carga en ella el enlace
 *   directo (lo que ya funcionaba). Si algo falla, se cierra y se enseña el motivo.
 */
import { getToken, withToken } from '../auth';
import { api } from '../api/client';

const BASE = import.meta.env.VITE_API_URL || '';

const esIOS = () => {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const TRADUCCIONES: [RegExp, string][] = [
  [/document not found/i, 'No se encontró el albarán. Puede que lo hayan borrado.'],
  [/no articles/i, 'Este albarán no tiene artículos todavía.'],
  [/invalid article ids/i, 'Los artículos elegidos no son válidos. Vuelve a seleccionarlos.'],
  [/no items/i, 'No hay ninguna etiqueta en la lista.'],
];

/** Convierte el «detail» del servidor (texto, lista de errores de validación…) en un mensaje claro. */
export function detalleServidor(detail: unknown): string | null {
  if (!detail) return null;
  if (typeof detail === 'string') {
    for (const [re, txt] of TRADUCCIONES) if (re.test(detail)) return txt;
    return detail;
  }
  if (Array.isArray(detail)) {
    const msgs = detail.map(d => {
      const m = (d as { msg?: string; loc?: unknown[] })?.msg || '';
      const campo = ((d as { loc?: unknown[] })?.loc || []).slice(-1)[0];
      return campo && typeof campo === 'string' ? `${campo}: ${m}` : m;
    }).filter(Boolean);
    return msgs.length ? `Datos no válidos — ${msgs.join('; ')}` : null;
  }
  return null;
}

/** Mensaje en español para cualquier error de axios (incluye el detail del servidor en 400/403/422). */
export function mensajeError(err: unknown, porDefecto = 'No se pudo guardar'): string {
  const e = err as { code?: string; message?: string; response?: { status?: number; data?: { detail?: unknown } } };
  if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error') return 'Sin conexión con el servidor. Esto necesita cobertura.';
  if (e?.code === 'ECONNABORTED') return 'El servidor tardó demasiado en responder. Prueba otra vez.';
  const st = e?.response?.status;
  const det = detalleServidor(e?.response?.data?.detail);
  if (st === 403) return det ? `Sin permiso: ${det}` : 'No tienes permiso para hacer esto.';
  if (det) return det;
  if (st && st >= 500) return `${porDefecto}: error en el servidor (${st}).`;
  return porDefecto;
}

async function errorDeRespuesta(r: Response): Promise<Error> {
  let det: string | null = null;
  try {
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) det = detalleServidor((await r.json())?.detail);
  } catch { /* nada */ }
  if (r.status === 401) return new Error('La sesión ha caducado. Vuelve a entrar con tu código.');
  if (r.status === 403) return new Error(det ? `Sin permiso: ${det}` : 'No tienes permiso para descargar esto.');
  if (det) return new Error(det);
  if (r.status === 404) return new Error('No se encontró el archivo. Puede que el albarán ya no exista o no tenga artículos.');
  if (r.status >= 500) return new Error(`El servidor no pudo preparar el archivo (error ${r.status}). Prueba otra vez en un momento.`);
  return new Error(`No se pudo descargar (error ${r.status}).`);
}

function nombreDe(r: Response, porDefecto: string) {
  const cd = r.headers.get('content-disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : porDefecto;
}

function guardarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const esPdf = blob.type.includes('pdf') || nombre.toLowerCase().endsWith('.pdf');
  let abierto: Window | null = null;
  if (esPdf) { try { abierto = window.open(url, '_blank'); } catch { abierto = null; } }
  if (!abierto) {
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Descarga un archivo del servidor (ruta que empieza por /api/...).
 * Lanza un Error con el motivo en español si no se puede.
 * Llamar directamente desde el toque del botón (sin await antes) para que iPhone permita abrir la ventana.
 */
export async function descargar(ruta: string, nombrePorDefecto = 'archivo'): Promise<void> {
  const ios = esIOS();
  // En iPhone la ventana se abre ya, en el mismo toque; si no, Safari la bloquea.
  let ventana: Window | null = null;
  if (ios) { try { ventana = window.open('', '_blank'); } catch { ventana = null; } }
  let r: Response;
  try {
    r = await fetch(`${BASE}${ruta}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  } catch {
    ventana?.close();
    throw new Error('Sin conexión con el servidor. Esto necesita cobertura.');
  }
  if (!r.ok) { ventana?.close(); throw await errorDeRespuesta(r); }
  if (ios) {
    const directo = withToken(`${BASE}${ruta}`);
    if (ventana && !ventana.closed) { ventana.location.href = directo; return; }
    // Si no se pudo abrir la ventana antes, se intenta ahora con el enlace directo
    if (!window.open(directo, '_blank')) window.location.assign(directo);
    return;
  }
  guardarBlob(await r.blob(), nombreDe(r, nombrePorDefecto));
}

/** Para las descargas que se piden con POST (etiquetas a mano). */
export async function descargarPost(ruta: string, cuerpo: unknown, nombre: string): Promise<void> {
  try {
    const r = await api.post(ruta, cuerpo, { responseType: 'blob' });
    const blob = new Blob([r.data], { type: 'application/pdf' });
    if (esIOS()) {
      // Igual que antes en iPhone: enlace de descarga (Safari enseña el PDF)
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    guardarBlob(blob, nombre);
  } catch (e) {
    const err = e as { response?: { data?: Blob; status?: number } };
    // Con responseType blob el detail viene dentro del blob
    if (err?.response?.data instanceof Blob) {
      try {
        const txt = await err.response.data.text();
        const det = detalleServidor(JSON.parse(txt)?.detail);
        if (det) throw new Error(det);
      } catch (e2) { if (e2 instanceof Error && !(e2 instanceof SyntaxError)) throw e2; }
    }
    throw new Error(mensajeError(e, 'No se pudieron generar las etiquetas'));
  }
}

// ── Rutas de las descargas de un albarán ──────────────────────────
export const rutaTreyFact = (id: number) => `/api/export/treyfact/${id}`;
export const rutaListin = (id: number) => `/api/export/pricelist/${id}`;
export const rutaExcel = (id: number) => `/api/export/excel/${id}`;
export const rutaInforme = (id: number) => `/api/export/pdf/${id}`;
export const rutaEtiquetas = (id: number, ids?: number[], copias = 1) => {
  const p = new URLSearchParams();
  if (ids && ids.length) p.set('ids', ids.join(','));
  if (copias > 1) p.set('copies', String(copias));
  const qs = p.toString();
  return `/api/export/labels/${id}${qs ? '?' + qs : ''}`;
};
export const rutaCatalogo = (tipo: 'treyfact' | 'pricelist', params?: { familia?: string; q?: string }) => {
  const p = new URLSearchParams();
  if (params?.familia) p.set('familia', params.familia);
  if (params?.q) p.set('q', params.q);
  const qs = p.toString();
  return `/api/catalog/export-${tipo}${qs ? '?' + qs : ''}`;
};

/**
 * Borra un artículo aunque se esté cerrando la página (keepalive).
 * Se usa para que un borrado con «Deshacer» pendiente se haga igualmente al salir.
 */
export function borrarArticuloYa(id: number) {
  try {
    fetch(`${BASE}/api/articles/${id}`, { method: 'DELETE', keepalive: true, headers: { Authorization: `Bearer ${getToken()}` } }).catch(() => { /* nada */ });
  } catch { /* nada */ }
}
