import axios from 'axios';
import type { Article, AppSettings, DocumentListItem, Document, Supplier, ProductInfo, PriceHistoryEntry, SupplierComparisonEntry, TopProduct } from '../types';

const BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: BASE,
  timeout: 60000,
});

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

export const getDocumentFileUrl = (id: number) => `${BASE}/api/documents/${id}/file`;

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
export const getExcelUrl = (documentId: number) => `${BASE}/api/export/excel/${documentId}`;
export const getLabelsUrl = (documentId: number, articleIds?: number[], copies = 1) => {
  const params = new URLSearchParams();
  if (articleIds && articleIds.length > 0) params.set('ids', articleIds.join(','));
  if (copies > 1) params.set('copies', String(copies));
  const qs = params.toString();
  return `${BASE}/api/export/labels/${documentId}${qs ? '?' + qs : ''}`;
};

export const downloadExcel = (documentId: number) => {
  window.open(getExcelUrl(documentId), '_blank');
};

export const downloadLabels = (documentId: number, articleIds?: number[], copies = 1) => {
  window.open(getLabelsUrl(documentId, articleIds, copies), '_blank');
};

export const getPdfReportUrl = (documentId: number) => `${BASE}/api/export/pdf/${documentId}`;
export const downloadPdfReport = (documentId: number) => {
  window.open(getPdfReportUrl(documentId), '_blank');
};

export const downloadWooCommerceCSV = (documentId: number) => {
  window.open(`${BASE}/api/export/woocommerce/${documentId}`, '_blank');
};

export const cloneDocument = (id: number) =>
  api.post<{ id: number; original_filename: string }>(`/api/documents/${id}/clone`);

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
