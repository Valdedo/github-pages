export interface Document {
  id: number;
  filename: string;
  original_filename: string;
  doc_type: 'pdf' | 'image';
  status: 'uploaded' | 'processing' | 'completed' | 'error';
  error_message?: string;
  supplier_name?: string;
  supplier_id?: number;
  doc_number?: string;
  doc_date?: string;
  pronto_pago_pct?: number;
  // Document stated totals
  base_imponible_doc?: number;
  total_iva_doc?: number;
  total_recargo_doc?: number;
  total_doc?: number;
  // Validation
  total_calculado?: number;
  validacion_ok?: boolean | null;
  validacion_notas?: string; // JSON string with {notas, discrepancias[], diferencia}
  created_at: string;
  updated_at: string;
  articles?: Article[];
}

export interface DocumentListItem {
  id: number;
  original_filename: string;
  status: string;
  supplier_name?: string;
  doc_number?: string;
  doc_date?: string;
  article_count: number;
  created_at: string;
}

export interface Article {
  id: number;
  document_id: number;
  line_number: number;
  descripcion: string;
  cantidad: number;
  precio_unitario_bruto: number;
  descuento_1?: number;
  descuento_2?: number;
  descuento_3?: number;
  descuento_4?: number;
  coste_neto_unitario: number;
  coste_neto_total: number;
  iva_pct: number;
  recargo_pct?: number;
  margen_pct: number;
  margen_override: boolean;
  pvp_sin_iva: number;
  pvp_con_iva: number;
  codigo_proveedor?: string;
  codigo_fabricante?: string;
  ean?: string;
  codigo_principal?: string;
  otros_codigos?: Record<string, string>;
  product_info_id?: number;
  created_at: string;
  updated_at: string;
}

export interface MarginTier {
  min_cost: number;
  max_cost: number | null;
  margin_pct: number;
}

export interface AppSettings {
  id: number;
  margin_tiers: MarginTier[];
  rounding_mode: 'standard' | 'psychological' | 'ceil_5cents' | 'ceil_10cents';
  rounding_decimals: number;
  label_columns: number;
  label_rows_per_page: number;
  base_url: string;
  company_name: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  detection_keywords: string[];
  template_config: Record<string, unknown>;
  created_at: string;
}

export interface ProductInfo {
  id: number;
  codigo_principal: string;
  descripcion: string;
  specs?: Record<string, string>;
  source_url?: string;
  manual_url?: string;
  search_attempted: boolean;
  cached_at?: string;
}

export interface PriceHistoryEntry {
  article_id: number;
  descripcion: string;
  codigo_principal: string;
  precio_unitario_bruto: number;
  coste_neto_unitario: number;
  pvp_con_iva: number;
  pvp_sin_iva: number;
  margen_pct: number;
  cantidad: number;
  document_id: number;
  supplier_name: string;
  doc_date: string | null;
  doc_number: string | null;
  created_at: string;
}

export interface SupplierComparisonEntry {
  supplier_name: string;
  num_compras: number;
  coste_min: number;
  coste_max: number;
  coste_avg: number;
  pvp_min: number;
  pvp_max: number;
  pvp_avg: number;
  ultima_compra: string | null;
  descripcion: string;
}

export interface TopProduct {
  codigo_principal: string;
  descripcion: string;
  num_documentos: number;
  num_lineas: number;
  coste_avg: number;
  pvp_avg: number;
  num_proveedores: number;
}
