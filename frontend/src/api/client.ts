import axios, { AxiosError } from 'axios';
import { getToken, withToken, cerrarSesion, type Rol } from '../auth';
import type { Tarifa, TarifaResumen, FichaTarifa } from '../lib/tarifas';
import type { Article, AppSettings, DocumentListItem, Document, Supplier, ProductInfo, PriceHistoryEntry, SupplierComparisonEntry, TopProduct, Repair, SupplierOrder, SupplierOrderListItem, SupplierOrderLine, DashboardStats, CatalogArticle, PriceAlert, ClientDeliveryNote } from '../types';

const BASE = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: BASE,
  timeout: 60000,
});

// Código de acceso en todas las peticiones; si caduca, se vuelve a pedir
api.interceptors.request.use(cfg => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
// Aviso discreto cuando el móvil enseña datos guardados porque no hay cobertura
// (el service worker añade la cabecera X-Desde-Cache). Como mucho, uno cada 5 minutos.
let ultimoAvisoCache = 0;
api.interceptors.response.use(r => {
  if (r.headers?.['x-desde-cache'] === '1' && Date.now() - ultimoAvisoCache > 5 * 60000) {
    ultimoAvisoCache = Date.now();
    window.dispatchEvent(new Event('cf-desde-cache'));
  }
  return r;
}, (err: AxiosError) => {
  if (err.response?.status === 401 && !String(err.config?.url || '').includes('/api/acceso')) {
    cerrarSesion();
    window.dispatchEvent(new Event('cf-sin-sesion'));
  }
  return Promise.reject(err);
});

// Textos por defecto de FastAPI en inglés: no se enseñan
const DETALLE_INGLES = /^(not found|method not allowed|internal server error|not authenticated|unauthorized|forbidden|bad request)$/i;

/** Convierte un error en un mensaje corto en español sencillo. Primero, lo que dice el servidor. */
export function describeApiError(err: unknown): string {
  const ax = err as AxiosError<{ detail?: unknown }> | undefined;
  if (!ax) return 'Algo ha fallado. Vuelve a probar.';
  const detail = ax.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim() && !DETALLE_INGLES.test(detail.trim())) return detail.trim();
  if (Array.isArray(detail)) return 'Falta algún dato o no es válido.';
  if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT') return 'Sin cobertura: el servidor no contesta. Vuelve a probar.';
  if (!ax.response) return 'Sin cobertura. Comprueba la conexión y vuelve a probar.';
  const status = ax.response.status;
  if (status === 404) return 'Esto ya no existe (puede que lo hayan borrado).';
  if (status === 401) return 'Tienes que volver a entrar con tu código.';
  if (status === 403) return 'No tienes permiso para hacer esto.';
  if (status === 409) return 'Alguien lo ha cambiado a la vez. Recarga y vuelve a probar.';
  if (status === 413) return 'El archivo es demasiado grande.';
  if (status === 429) return 'Demasiados intentos. Espera un poco y vuelve a probar.';
  if (status >= 500) return 'El servidor ha fallado. Vuelve a probar en un momento.';
  return 'No se pudo hacer. Vuelve a probar.';
}

// Documents
export const uploadDocument = (file: File, supplierId?: number) => {
  const form = new FormData();
  form.append('file', file);
  if (supplierId) form.append('supplier_id', String(supplierId));
  return api.post<Document>('/api/documents/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadMultiImages = (files: File[], supplierId?: number) => {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  if (supplierId) form.append('supplier_id', String(supplierId));
  return api.post<Document>('/api/documents/upload-multi', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const listDocuments = () => api.get<DocumentListItem[]>('/api/documents');

export const getDocument = (id: number) => api.get<Document>(`/api/documents/${id}`);

export const updateDocument = (id: number, data: Partial<Document>) =>
  api.put<Document>(`/api/documents/${id}`, data);

export const deleteDocument = (id: number) => api.delete(`/api/documents/${id}`);
export const marcarTerminado = (id: number, terminado: boolean) => api.put<Document>(`/api/documents/${id}/terminado`, { terminado });

export const reprocessDocument = (id: number, supplierId?: number) =>
  api.post(`/api/documents/${id}/reprocess`, { supplier_id: supplierId });

export const getDocumentFileUrl = (id: number) => withToken(`${BASE}/api/documents/${id}/file`);

// Articles
export const listArticles = (documentId: number) =>
  api.get<Article[]>(`/api/articles?document_id=${documentId}`);

export const createArticle = (data: Partial<Article> & { document_id: number }) =>
  api.post<Article>('/api/articles', data);

export const updateArticle = (id: number, data: Partial<Article>) =>
  api.put<Article>(`/api/articles/${id}`, data);

export const deleteArticle = (id: number) => api.delete(`/api/articles/${id}`);

export const recalculateArticles = (documentId: number) =>
  api.post(`/api/articles/recalculate?document_id=${documentId}`);

export const bulkDeleteArticles = (ids: number[]) =>
  api.delete('/api/articles/bulk', { data: ids });

export const bulkUpdateMargin = (ids: number[], margen_pct: number) =>
  api.put(`/api/articles/bulk-margin?margen_pct=${margen_pct}`, ids);

// Export
export const getExcelUrl = (documentId: number) => withToken(`${BASE}/api/export/excel/${documentId}`);
export const getLabelsUrl = (documentId: number, articleIds?: number[], copies = 1) => {
  const params = new URLSearchParams();
  if (articleIds && articleIds.length > 0) params.set('ids', articleIds.join(','));
  if (copies > 1) params.set('copies', String(copies));
  const qs = params.toString();
  return withToken(`${BASE}/api/export/labels/${documentId}${qs ? '?' + qs : ''}`);
};

export const downloadExcel = (documentId: number) => {
  window.open(getExcelUrl(documentId), '_blank');
};

export const downloadLabels = (documentId: number, articleIds?: number[], copies = 1) => {
  window.open(getLabelsUrl(documentId, articleIds, copies), '_blank');
};

export const getPdfReportUrl = (documentId: number) => withToken(`${BASE}/api/export/pdf/${documentId}`);
export const downloadPdfReport = (documentId: number) => {
  window.open(getPdfReportUrl(documentId), '_blank');
};


export const downloadTreyFact = (documentId: number) => {
  window.open(withToken(`${BASE}/api/export/treyfact/${documentId}`), '_blank');
};

export const downloadPriceList = (documentId: number) => {
  window.open(withToken(`${BASE}/api/export/pricelist/${documentId}`), '_blank');
};

// Catalog
export const getCatalog = (params?: { q?: string; familia?: string; limit?: number }) =>
  api.get<CatalogArticle[]>('/api/catalog', { params });

export const getCatalogFamilies = () => api.get<string[]>('/api/catalog/families');

export const getPriceAlerts = (documentId: number, thresholdPct = 5) =>
  api.get<PriceAlert[]>(`/api/catalog/price-alerts/${documentId}?threshold_pct=${thresholdPct}`);

export const downloadCatalogTreyFact = (params?: { familia?: string; q?: string }) => {
  const qs = new URLSearchParams();
  if (params?.familia) qs.set('familia', params.familia);
  if (params?.q) qs.set('q', params.q);
  const query = qs.toString();
  window.open(withToken(`${BASE}/api/catalog/export-treyfact${query ? '?' + query : ''}`), '_blank');
};

export const downloadCatalogPriceList = (params?: { familia?: string; q?: string }) => {
  const qs = new URLSearchParams();
  if (params?.familia) qs.set('familia', params.familia);
  if (params?.q) qs.set('q', params.q);
  const query = qs.toString();
  window.open(withToken(`${BASE}/api/catalog/export-pricelist${query ? '?' + query : ''}`), '_blank');
};


// Custom labels (manual input, no document)
export interface CustomLabelItem {
  descripcion: string;
  pvp_con_iva: number;
  codigo_principal?: string;
  ean?: string;
  coste_neto_unitario?: number;
  copies: number;
}

export const downloadCustomLabels = async (items: CustomLabelItem[]): Promise<void> => {
  const response = await api.post('/api/export/labels/custom', { items }, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'etiquetas_custom.pdf';
  a.click();
  URL.revokeObjectURL(url);
};

// Settings
export const getSettings = () => api.get<AppSettings>('/api/settings');
export const updateSettings = (data: Partial<AppSettings>) => api.put<AppSettings>('/api/settings', data);

export const listSuppliers = () => api.get<Supplier[]>('/api/settings/suppliers');
export const createSupplier = (data: Partial<Supplier>) =>
  api.post<Supplier>('/api/settings/suppliers', data);
export const updateSupplier = (id: number, data: Partial<Supplier>) =>
  api.put<Supplier>(`/api/settings/suppliers/${id}`, data);
export const deleteSupplier = (id: number) =>
  api.delete(`/api/settings/suppliers/${id}`);

// Analytics
export const getPriceHistory = (codigo: string) =>
  api.get<PriceHistoryEntry[]>(`/api/analytics/price-history?codigo=${encodeURIComponent(codigo)}`);

export const getSupplierComparison = (codigo: string) =>
  api.get<SupplierComparisonEntry[]>(`/api/analytics/supplier-comparison?codigo=${encodeURIComponent(codigo)}`);

export const getTopProducts = (limit = 50) =>
  api.get<TopProduct[]>(`/api/analytics/top-products?limit=${limit}`);

// Product info
export const getProductInfo = (id: number) => api.get<ProductInfo>(`/api/products/${id}`);
export const updateProductInfo = (id: number, data: Partial<ProductInfo>) =>
  api.put<ProductInfo>(`/api/products/${id}`, data);
export const ensureProductInfo = (articleId: number) =>
  api.post<ProductInfo>(`/api/products/ensure/${articleId}`);
export const triggerProductSearch = (productId: number) =>
  api.post(`/api/products/${productId}/search`);

export const scanProduct = (code: string) =>
  api.get<{ id: number; descripcion: string; pvp_con_iva: number; pvp_sin_iva: number; iva_pct: number; codigo_principal: string; ean: string }>(`/api/products/scan/${encodeURIComponent(code)}`);

export const decodeBarcodeImage = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post<{ code: string; all_codes: string[] }>('/api/products/decode-image', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 15000,
  });
};

// Dashboard
export const getDashboardStats = () => api.get<DashboardStats>('/api/dashboard/stats');

// Repairs
export const listRepairs = (status?: string) =>
  api.get<Repair[]>(`/api/repairs${status ? `?status=${status}` : ''}`);
export const getRepair = (id: number) => api.get<Repair>(`/api/repairs/${id}`);
export const createRepair = (data: Omit<Repair, 'id' | 'created_at' | 'updated_at' | 'date_received'>) =>
  api.post<Repair>('/api/repairs', data);
export const updateRepair = (id: number, data: { [K in keyof Repair]?: Repair[K] | null }) =>
  api.put<Repair>(`/api/repairs/${id}`, data);
export const deleteRepair = (id: number) => api.delete(`/api/repairs/${id}`);
export const getRepairStats = () => api.get<{ recibida: number; en_taller: number; reparada: number; entregada: number; pending: number; total: number }>('/api/repairs/stats');

// Supplier Orders
export const listOrders = (status?: string) =>
  api.get<SupplierOrderListItem[]>(`/api/orders${status ? `?status=${status}` : ''}`);
export const getOrder = (id: number) => api.get<SupplierOrder>(`/api/orders/${id}`);
export const createOrder = (data: Omit<SupplierOrder, 'id' | 'created_at' | 'updated_at' | 'lines'> & { lines?: Partial<SupplierOrderLine>[] }) =>
  api.post<SupplierOrder>('/api/orders', data);
export const updateOrder = (id: number, data: { [K in keyof SupplierOrder]?: SupplierOrder[K] | null }) =>
  api.put<SupplierOrder>(`/api/orders/${id}`, data);
export const deleteOrder = (id: number) => api.delete(`/api/orders/${id}`);
export const getOrderStats = () => api.get<{ pendiente: number; parcial: number; recibido: number; pending: number; total: number }>('/api/orders/stats');

export const addOrderLine = (orderId: number, data: Partial<SupplierOrderLine>) =>
  api.post<SupplierOrderLine>(`/api/orders/${orderId}/lines`, data);
export const updateOrderLine = (orderId: number, lineId: number, data: Partial<SupplierOrderLine>) =>
  api.put<SupplierOrderLine>(`/api/orders/${orderId}/lines/${lineId}`, data);
export const deleteOrderLine = (orderId: number, lineId: number) =>
  api.delete(`/api/orders/${orderId}/lines/${lineId}`);

// Firma de albaranes de venta
export const listFirmas = () => api.get<ClientDeliveryNote[]>('/api/firmas');
export const getFirma = (id: number) => api.get<ClientDeliveryNote>(`/api/firmas/${id}`);
export const getFirmasStats = () => api.get<{ pendiente: number; firmado: number; total: number }>('/api/firmas/stats');
export interface SubidaFirmas { data: ClientDeliveryNote[]; rechazados: { nombre: string; motivo: string }[] }
/** Sube PDF de albaranes. El servidor puede devolver la lista de albaranes (antes) o un objeto
 *  con los albaranes y los archivos rechazados (`rechazados: [{nombre, motivo}]`).
 *  Se devuelve siempre `{ data: albaranes, rechazados }` (compatible con `const { data } = …`). */
export const uploadFirmas = async (files: File[]): Promise<SubidaFirmas> => {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  const { data } = await api.post<unknown>('/api/firmas/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  if (Array.isArray(data)) return { data: data as ClientDeliveryNote[], rechazados: [] };
  const o = (data || {}) as Record<string, unknown>;
  const rechazados = Array.isArray(o.rechazados) ? o.rechazados as SubidaFirmas['rechazados'] : [];
  const lista = ['albaranes', 'subidos', 'notas', 'items', 'ok'].map(k => o[k]).find(Array.isArray)
    ?? Object.entries(o).find(([k, v]) => k !== 'rechazados' && Array.isArray(v))?.[1];
  return { data: (lista as ClientDeliveryNote[]) || [], rechazados };
};
export const updateFirma = (id: number, data: Partial<ClientDeliveryNote>) =>
  api.put<ClientDeliveryNote>(`/api/firmas/${id}`, data);
export const deleteFirma = (id: number) => api.delete(`/api/firmas/${id}`);
/** Meter o sacar albaranes del camión de Melchor. */
export const repartoFirmas = (ids: number[], enCamion: boolean) =>
  api.post<ClientDeliveryNote[]>('/api/firmas/reparto', { ids, en_camion: enCamion });
export const signFirma = (id: number, firma: Blob, nombre: string, dni: string, firmadoEl?: string) => {
  const form = new FormData();
  form.append('firma', firma, 'firma.png');
  form.append('nombre', nombre);
  form.append('dni', dni);
  if (firmadoEl) form.append('firmado_el', firmadoEl);
  return api.post<ClientDeliveryNote>(`/api/firmas/${id}/sign`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 25000, // con poca cobertura no se espera más: la firma se guarda en el móvil
  });
};
export const firmaPageUrl = (id: number, page: number, dpi = 110, v = '') =>
  withToken(`${BASE}/api/firmas/${id}/page/${page}.png?dpi=${dpi}${v ? `&v=${v}` : ''}`);
export const firmaPdfUrl = (id: number, download = false) =>
  withToken(`${BASE}/api/firmas/${id}/pdf${download ? '?download=true' : ''}`);
export const firmasZipUrl = (codigo?: string, mes?: string) => {
  const p = new URLSearchParams();
  if (codigo) p.set('codigo_cliente', codigo);
  if (mes) p.set('mes', mes);
  const qs = p.toString();
  return withToken(`${BASE}/api/firmas/export.zip${qs ? `?${qs}` : ''}`);
};

export type ContactoFirma = { email?: string | null; telefono?: string | null; auto_email?: boolean | null };
export const getFirmaContacto = (id: number) => api.get<ContactoFirma>(`/api/firmas/${id}/contacto`);
export const putFirmaContacto = (id: number, data: { email?: string; telefono?: string; auto_email?: boolean }) =>
  api.put<ContactoFirma>(`/api/firmas/${id}/contacto`, data);
export const emailFirma = (id: number, to: string) =>
  api.post<ClientDeliveryNote>(`/api/firmas/${id}/email`, { to });
export const enlaceFirma = (id: number) => api.post<{ path: string }>(`/api/firmas/${id}/enlace`);

export type MarcasFirma = { copia?: boolean; whatsapp?: boolean; facturado?: boolean; factura_ref?: string };
export const marcarFirma = (id: number, m: MarcasFirma) =>
  api.put<ClientDeliveryNote>(`/api/firmas/${id}/marcas`, m);
export const marcarFirmas = (ids: number[], m: MarcasFirma) =>
  api.post<ClientDeliveryNote[]>('/api/firmas/marcas', { ids, ...m });

export const firmasCombinadoUrl = (ids: number[]) => withToken(`${BASE}/api/firmas/combinado.pdf?ids=${ids.join(',')}`);
export interface FirmasAvisos {
  sin_firmar: { id: number; numero: string; cliente?: string | null; dias: number }[];
  sin_facturar: { codigo_cliente?: string | null; cliente?: string | null; albaranes: number; importe: number }[];
}
export const getFirmasAvisos = () => api.get<FirmasAvisos>('/api/firmas/avisos');

// Acceso
export interface PersonaAcceso { id: string; nombre: string; rol: Rol; tiene_codigo: boolean }
export interface EstadoAcceso { configurado: boolean; rol: Rol | null; persona: string | null; codigo_propio?: boolean; reparto: boolean; encargado: boolean; personas?: PersonaAcceso[] }
export interface SesionAcceso { token: string; rol: Rol; persona: string; codigo_propio?: boolean }
export const accesoEstado = () => api.get<EstadoAcceso>('/api/acceso/estado');
export const accesoEntrar = (codigo: string) => api.post<SesionAcceso>('/api/acceso/entrar', { codigo });
export const accesoConfigurar = (tienda: string, reparto: string) =>
  api.post<SesionAcceso>('/api/acceso/configurar', { tienda, reparto: reparto || null });
export const accesoCodigo = (persona: string, codigo: string) =>
  api.post<{ ok: boolean } & Partial<SesionAcceso>>('/api/acceso/codigo', { persona, codigo });
export const accesoEncargado = (codigo: string) => accesoCodigo('andres', codigo);
export const accesoMiCodigo = (actual: string, nuevo: string) => api.post<SesionAcceso>('/api/acceso/mi-codigo', { actual, nuevo });
export const accesoCerrarTodas = () => api.post<SesionAcceso>('/api/acceso/cerrar-todas');

// Turnos
export interface TurnoTipo { id: string; nombre: string; horario: string; horas: number }
export interface TurnoEmpleado { id: string; nombre: string; color: string }
export interface TurnoDia {
  fecha: string; semana: string; cambio: boolean; nota?: string | null;
  tipo?: string; clase: 'trabajo' | 'libre' | 'festivo' | 'vacaciones'; nombre: string; horario: string; horas: number;
}
export interface Cuadrante { desde: string; hasta: string; festivos: Record<string, string>; empleados: (TurnoEmpleado & { dias: TurnoDia[] })[]; sin_festivos?: boolean | number | string }
export interface TurnosAjustes {
  empleados: TurnoEmpleado[]; tipos: TurnoTipo[]; semanas: string[][]; ancla: string; inicio: Record<string, number>;
  esta_semana: Record<string, number>;
  sin_festivos?: boolean | number | string;
  vac_previas?: Record<string, Record<string, number>>;
  festivos: { id: number; fecha: string; nombre: string }[];
  vacaciones: { id: number; empleado: string; inicio: string; fin: string; nota?: string | null; dias: number }[];
}
export const getCuadrante = (desde: string, dias = 7) => api.get<Cuadrante>('/api/turnos/cuadrante', { params: { desde, dias } });
export const getTurnosHoy = () => api.get<Cuadrante>('/api/turnos/hoy');
export const getTurnosAjustes = () => api.get<TurnosAjustes>('/api/turnos/ajustes');
export const putTurnosAjustes = (a: Pick<TurnosAjustes, 'empleados' | 'tipos' | 'semanas' | 'ancla' | 'inicio'>) => api.put('/api/turnos/ajustes', a);
export const putEstaSemana = (empleado: string, semana: number) => api.put('/api/turnos/esta-semana', { empleado, semana });
export const putTurnoCambio = (empleado: string, fecha: string, tipo: string | null, nota?: string) =>
  api.put('/api/turnos/cambio', { empleado, fecha, tipo, nota });
export const postVacaciones = (empleado: string, inicio: string, fin: string, nota?: string) =>
  api.post('/api/turnos/vacaciones', { empleado, inicio, fin, nota });
export const deleteVacaciones = (id: number) => api.delete(`/api/turnos/vacaciones/${id}`);
export const postFestivo = (fecha: string, nombre: string) => api.post('/api/turnos/festivos', { fecha, nombre });
export const deleteFestivo = (id: number) => api.delete(`/api/turnos/festivos/${id}`);

// Correo de casafonsomc@gmail.com (resumen para Inicio)
export interface CorreoItem { id: string; de?: string; asunto?: string; fecha?: string; enlace?: string; resumen?: string; tipo?: string }
export interface CorreoResumen { configurado: boolean; error?: string; sin_leer: CorreoItem[]; sin_contestar: CorreoItem[]; actualizado?: string }
export const getCorreo = (refrescar = false) => api.get<CorreoResumen>(`/api/correo/resumen${refrescar ? '?refrescar=true' : ''}`, { timeout: 90000 });

// ── Órdenes de carga (en pruebas) ──────────────────────────────
export interface LineaCarga {
  id: number; cantidad: number | null; unidad: string | null; descripcion: string;
  original: string | null; duda: string | null; cargado: number | null; cargado_ok: boolean;
}
export interface EntregaCarga {
  id: number; orden_id: number; numero: string | null; cliente: string; lugar: string | null;
  telefono: string | null; cuando: string | null; servir: boolean; pagado: boolean;
  notas: string | null; dudas: string | null; estado: 'pendiente' | 'entregada';
  firmado_por: string | null; firmado_at: string | null; treyfact_at: string | null; lineas: LineaCarga[];
  foto_entrega: string | null; drive_at: string | null;
}
export interface OrdenCarga {
  id: number; estado: 'preparando' | 'cargado' | 'entregado'; fotos: string[]; texto: string | null;
  notas: string | null; creado_por: string | null; created_at: string; entregas: EntregaCarga[];
  enviada_at?: string | null;  // mandada al móvil de Melchor
  parecidas: { orden_id: number; entrega_id: number; cliente: string; creada: string; materiales: number }[];
}
export const listarCargas = () => api.get<OrdenCarga[]>('/api/cargas');
export const verCarga = (id: number) => api.get<OrdenCarga>(`/api/cargas/${id}`);
/** Lo que se le ha mandado a Melchor (lo único que ve su móvil). */
export const paraCargar = () => api.get<OrdenCarga[]>('/api/cargas/para-cargar');
export const enviarCarga = (id: number, enviar: boolean) => api.post<OrdenCarga>(`/api/cargas/${id}/enviar`, { enviar });
export const borrarCarga = (id: number) => api.delete(`/api/cargas/${id}`);
export const leerCarga = (fotos: File[], texto: string, ordenId?: number, forzar = false) => {
  const form = new FormData();
  if (forzar) form.append('forzar', 'true');
  fotos.forEach(f => form.append('fotos', f, f.name || 'foto.jpg'));
  form.append('texto', texto);
  if (ordenId) form.append('orden_id', String(ordenId));
  return api.post<OrdenCarga>('/api/cargas/leer', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
};
/** Dirección completa del servidor con la sesión, para <img> y descargas. */
export const withTokenUrl = (path: string) => withToken(`${BASE}${path}`);
export const fotoCargaUrl = (nombre: string) => withToken(`${BASE}/api/cargas/foto/${encodeURIComponent(nombre)}`);
export const nuevaEntregaCarga = (ordenId: number) => api.post<OrdenCarga>(`/api/cargas/${ordenId}/entregas`, {});
export const editarEntregaCarga = (id: number, d: Partial<Omit<EntregaCarga, 'id' | 'lineas'>>) => api.put<EntregaCarga>(`/api/cargas/entregas/${id}`, d);
export const borrarEntregaCarga = (id: number) => api.delete(`/api/cargas/entregas/${id}`);
export const firmarEntregaCarga = (id: number, firma: Blob, nombre: string, dni: string,
  extra: { firmadoEl?: string; foto?: Blob | null; cargadas?: Record<string, { ok: boolean; cargado: number | null }> } = {}) => {
  const form = new FormData();
  form.append('firma', firma, 'firma.png');
  form.append('nombre', nombre);
  form.append('dni', dni);
  if (extra.firmadoEl) form.append('firmado_el', extra.firmadoEl);
  if (extra.foto) form.append('foto', extra.foto, 'entrega.jpg');
  if (extra.cargadas) form.append('cargadas', JSON.stringify(extra.cargadas));
  return api.post<EntregaCarga>(`/api/cargas/entregas/${id}/firmar`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000 });
};
export const fotoEntregaCarga = (id: number, foto: Blob) => {
  const form = new FormData();
  form.append('foto', foto, 'entrega.jpg');
  return api.post<EntregaCarga>(`/api/cargas/entregas/${id}/foto`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
};
export const ordenarEntregasCarga = (ordenId: number, ids: number[]) => api.put<OrdenCarga>(`/api/cargas/${ordenId}/orden-entregas`, { ids });
export const anularFirmaCarga = (id: number) => api.post<EntregaCarga>(`/api/cargas/entregas/${id}/anular-firma`);
export const hojaEntregaUrl = (id: number) => withToken(`${BASE}/api/cargas/entregas/${id}/pdf`);
export const treyfactEntregaCarga = (id: number, pasado: boolean) => api.put<EntregaCarga>(`/api/cargas/entregas/${id}/treyfact`, { pasado });
export const nuevaLineaCarga = (entregaId: number, d: Partial<LineaCarga>) => api.post<LineaCarga>(`/api/cargas/entregas/${entregaId}/lineas`, d);
export const editarLineaCarga = (id: number, d: Partial<LineaCarga>) => api.put<LineaCarga>(`/api/cargas/lineas/${id}`, d);
export const borrarLineaCarga = (id: number) => api.delete(`/api/cargas/lineas/${id}`);

// Vencimientos de facturas de proveedor (solo el encargado)
export interface VencFila { id: number; proveedor: string; numero?: string | null; importe?: number | null; importe_factura?: number | null; plazo: number; plazos: number; forma_pago?: string | null; url?: string | null; fecha?: string | null; fecha_factura?: string | null }
export interface VencDia { fecha: string; etiqueta: string; dia: string; finde: boolean; total: number; facturas: VencFila[] }
export interface VencResumen { configurado: boolean; conectado: boolean; ultima?: string | null; facturas: number; dias: VencDia[]; proximos: VencFila[]; proximos_total: number; sin_fecha: VencFila[] }
export const getVencimientos = () => api.get<VencResumen>('/api/vencimientos');

// Catálogo de tarifas de proveedor (en pruebas: solo el encargado)
export const getTarifas = () => api.get<TarifaResumen[]>('/api/tarifas');
export const getTarifa = (prov: string) => api.get<Tarifa>(`/api/tarifas/${encodeURIComponent(prov)}`, { timeout: 120000 });
export const actualizarTarifa = (prov: string) =>
  api.post<Tarifa>(`/api/tarifas/${encodeURIComponent(prov)}/actualizar`, null, { timeout: 120000 });
export const getFichaTarifa = (prov: string, ref: string) =>
  api.get<FichaTarifa>(`/api/tarifas/${encodeURIComponent(prov)}/articulo`, { params: { ref }, timeout: 120000 });
