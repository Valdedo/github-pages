import axios, { AxiosError } from 'axios';
import { getToken, withToken, cerrarSesion, type Rol } from '../auth';
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
api.interceptors.response.use(r => r, (err: AxiosError) => {
  if (err.response?.status === 401 && !String(err.config?.url || '').includes('/api/acceso')) {
    cerrarSesion();
    window.dispatchEvent(new Event('cf-sin-sesion'));
  }
  return Promise.reject(err);
});

// Turn an axios/fetch error into a short user-facing message that
// distinguishes "no puedo hablar con el servidor" from other errors.
export function describeApiError(err: unknown): string {
  const ax = err as AxiosError | undefined;
  if (!ax) return 'Error desconocido';
  if (ax.code === 'ECONNABORTED') return 'El servidor tardó demasiado en responder';
  if (ax.code === 'ERR_NETWORK' || ax.message === 'Network Error') {
    return 'No se puede conectar con el servidor';
  }
  const status = ax.response?.status;
  if (status === 404) return 'La API no responde en esta URL (404). Comprueba que el backend está desplegado.';
  if (status === 401 || status === 403) return 'Sin permiso para acceder a los datos';
  if (status && status >= 500) return `Error en el servidor (${status})`;
  if (status) return `Error ${status} al pedir los datos`;
  return ax.message || 'Error al pedir los datos';
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
export const updateRepair = (id: number, data: Partial<Repair>) =>
  api.put<Repair>(`/api/repairs/${id}`, data);
export const deleteRepair = (id: number) => api.delete(`/api/repairs/${id}`);
export const getRepairStats = () => api.get<{ recibida: number; en_taller: number; reparada: number; entregada: number; pending: number; total: number }>('/api/repairs/stats');

// Supplier Orders
export const listOrders = (status?: string) =>
  api.get<SupplierOrderListItem[]>(`/api/orders${status ? `?status=${status}` : ''}`);
export const getOrder = (id: number) => api.get<SupplierOrder>(`/api/orders/${id}`);
export const createOrder = (data: Omit<SupplierOrder, 'id' | 'created_at' | 'updated_at' | 'lines'> & { lines?: Partial<SupplierOrderLine>[] }) =>
  api.post<SupplierOrder>('/api/orders', data);
export const updateOrder = (id: number, data: Partial<SupplierOrder>) =>
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
export const uploadFirmas = (files: File[]) => {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  return api.post<ClientDeliveryNote[]>('/api/firmas/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
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
export const accesoEstado = () => api.get<{ configurado: boolean; rol: Rol | null; reparto: boolean; encargado: boolean }>('/api/acceso/estado');
export const accesoEntrar = (codigo: string) => api.post<{ token: string; rol: Rol }>('/api/acceso/entrar', { codigo });
export const accesoConfigurar = (tienda: string, reparto: string) =>
  api.post<{ token: string; rol: Rol }>('/api/acceso/configurar', { tienda, reparto: reparto || null });
export const accesoEncargado = (codigo: string) => api.post<{ token: string; rol: Rol }>('/api/acceso/encargado', { codigo });

// Turnos
export interface TurnoTipo { id: string; nombre: string; horario: string; horas: number }
export interface TurnoEmpleado { id: string; nombre: string; color: string }
export interface TurnoDia {
  fecha: string; semana: string; cambio: boolean; nota?: string | null;
  tipo?: string; clase: 'trabajo' | 'libre' | 'festivo' | 'vacaciones'; nombre: string; horario: string; horas: number;
}
export interface Cuadrante { desde: string; hasta: string; festivos: Record<string, string>; empleados: (TurnoEmpleado & { dias: TurnoDia[] })[] }
export interface TurnosAjustes {
  empleados: TurnoEmpleado[]; tipos: TurnoTipo[]; semanas: string[][]; ancla: string; inicio: Record<string, number>;
  esta_semana: Record<string, number>;
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
