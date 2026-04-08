import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  reprocessDocument, downloadExcel, downloadLabels,
  downloadPdfReport, downloadWooCommerceCSV, cloneDocument,
} from '../api/client';
import { useConfirm } from './ConfirmModal';
import type { Supplier } from '../types/index';

interface Props {
  documentId: number;
  suppliers: Supplier[];
  selectedArticleIds: number[];
  onReprocessed: () => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function ExportPanel({ documentId, suppliers, selectedArticleIds, onReprocessed, onToast }: Props) {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const [supplierId, setSupplierId] = useState<string>('');
  const [reprocessing, setReprocessing] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [dlExcel, setDlExcel] = useState(false);
  const [dlPdf, setDlPdf] = useState(false);
  const [dlWoo, setDlWoo] = useState(false);
  const [dlLabels, setDlLabels] = useState(false);
  const [copies, setCopies] = useState(1);

  const handleReprocess = async () => {
    const ok = await confirm({
      title: 'Reprocesar extracción',
      message: '¡Atención! Si has editado los artículos manualmente (descripciones, precios, códigos, márgenes), estos cambios se perderán y se reemplazarán con los datos extraídos de nuevo. ¿Continuar?',
      confirmLabel: 'Reprocesar y perder cambios',
      danger: true,
    });
    if (!ok) return;
    setReprocessing(true);
    try {
      await reprocessDocument(documentId, supplierId ? Number(supplierId) : undefined);
      onReprocessed();
      onToast?.('Reprocesando extracción…', 'info');
    } finally {
      setReprocessing(false);
    }
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      const { data } = await cloneDocument(documentId);
      onToast?.(`Albarán clonado: ${data.original_filename}`, 'success');
      setTimeout(() => navigate(`/documento/${data.id}`), 1200);
    } catch {
      onToast?.('Error al clonar el albarán', 'error');
    } finally {
      setCloning(false);
    }
  };

  const handleDownload = async (
    setter: (v: boolean) => void,
    fn: () => void,
    msg: string,
  ) => {
    setter(true);
    fn();
    onToast?.(msg, 'info');
    // Reset after 2s (download is triggered via window.open)
    setTimeout(() => setter(false), 2000);
  };

  const hasSelection = selectedArticleIds.length > 0;

  return (
    <div className="card">
      {ConfirmDialog}
      <div className="card-header">
        <span>📤</span> Acciones y exportación
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Row 1: Reprocess + Clone */}
        <div className="export-group">
          {suppliers.length > 0 && (
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
              style={{ padding: '7px 10px', border: '1.5px solid var(--grey-300)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: '#fff' }}>
              <option value="">Auto-detectar proveedor</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button className="btn btn-warning" onClick={handleReprocess} disabled={reprocessing}>
            {reprocessing ? '⏳ Procesando…' : '🔄 Reprocesar extracción'}
          </button>
          <div className="export-divider" />
          <button className="btn btn-ghost" onClick={handleClone} disabled={cloning}>
            {cloning ? '⏳ Clonando…' : '📋 Clonar albarán'}
          </button>
        </div>

        {/* Row 2: Downloads */}
        <div className="export-group">
          <button className="btn btn-success" disabled={dlExcel}
            onClick={() => handleDownload(setDlExcel, () => downloadExcel(documentId), 'Descargando Excel…')}>
            {dlExcel ? '⏳ Generando…' : '📊 Excel'}
          </button>
          <button className="btn btn-danger" disabled={dlPdf}
            onClick={() => handleDownload(setDlPdf, () => downloadPdfReport(documentId), 'Descargando informe PDF…')}>
            {dlPdf ? '⏳ Generando…' : '🖨️ Informe PDF'}
          </button>
          <button className="btn btn-ghost" disabled={dlWoo}
            title="Exportar para WooCommerce / PrestaShop"
            onClick={() => handleDownload(setDlWoo, () => downloadWooCommerceCSV(documentId), 'Descargando CSV…')}>
            {dlWoo ? '⏳ Generando…' : '🛒 WooCommerce CSV'}
          </button>
        </div>

        {/* Row 3: Labels */}
        <div className="export-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1.5px solid var(--grey-300)', borderRadius: '8px', padding: '5px 8px', background: '#fff', flexShrink: 0 }}>
            <label style={{ fontSize: '12px', color: 'var(--grey-500)', fontWeight: 600 }}>Copias:</label>
            <input
              type="number" min={1} max={20} value={copies}
              onChange={e => setCopies(Math.max(1, Math.min(20, Number(e.target.value))))}
              style={{ width: '44px', border: 'none', fontSize: '13px', fontFamily: 'inherit', textAlign: 'center', outline: 'none' }}
            />
          </div>
          <button className="btn btn-primary" disabled={dlLabels}
            onClick={() => handleDownload(setDlLabels, () => downloadLabels(documentId, undefined, copies), 'Generando etiquetas…')}>
            {dlLabels ? '⏳ Generando…' : '🏷️ Todas las etiquetas'}
          </button>
          {hasSelection && (
            <button className="btn btn-primary" disabled={dlLabels}
              onClick={() => handleDownload(setDlLabels, () => downloadLabels(documentId, selectedArticleIds, copies), `Generando ${selectedArticleIds.length} etiquetas…`)}>
              {dlLabels ? '⏳ Generando…' : `🏷️ Etiquetas sel. (${selectedArticleIds.length})`}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

