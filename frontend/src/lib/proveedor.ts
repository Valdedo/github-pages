/** Los artículos de «Etiquetas» se guardan en un albarán oculto con este proveedor. */
export const ES_MANUAL = (s?: string | null) => s === '__manual__';
export const nombreProveedor = (s?: string | null) => (ES_MANUAL(s) ? 'Etiqueta hecha a mano' : s || '');
