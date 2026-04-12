import { useState } from 'react';
import {
  reprocessDocument, downloadExcel, downloadLabels,
  downloadPdfReport, downloadTreyFact, downloadPriceList,
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
  const { confirm, ConfirmDialog } = useConfirm();
  const [supplierId, setSupplierId] = useState<string>('');
  const [reprocessing, setReprocessing] = useState(false);
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

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

  const dl = (key: string, fn: () => void, msg: string) => {
    if (busy) return;
    setBusy(key);
    fn();
    onToast?.(msg, 'info');
    setTimeout(() => setBusy(null), 2500);
  };

  const hasSelection = selectedArticleIds.length > 0;
  const isLoading = (key: string) => busy === key;

  return (
    <div className="card">
      {ConfirmDialog}
      <div className="card-header">
        <span>📤</span> Exportar y acciones
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Section: Reprocesar */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            Extracción
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {suppliers.length > 0 && (
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                style={{ padding: '8px 10px', border: '1.5px solid var(--grey-300)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: '#fff', flex: '1 1 160px', minWidth: 0 }}
              >
                <option value="">Auto-detectar proveedor</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button
              className="btn btn-warning"
              onClick={handleReprocess}
              disabled={reprocessing}
              style={{ flex: '0 0 auto' }}
            >
              {reprocessing ? <><span className="spinner spinner-sm spinner-white" /> Procesando…</> : '🔄 Reprocesar'}
            </button>
          </div>
        </div>

        {/* Section: Descargas */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            Descargar
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
            <button
              className="btn btn-success"
              disabled={!!busy}
              onClick={() => dl('excel', () => downloadExcel(documentId), 'Descargando Excel…')}
            >
              {isLoading('excel') ? <><span className="spinner spinner-sm spinner-white" /> Generando…</> : '📊 Excel'}
            </button>

            <button
              className="btn btn-success"
              disabled={!!busy}
              title="Exportar para importar en TreyFact"
              onClick={() => dl('treyfact', () => downloadTreyFact(documentId), 'Generando TreyFact…')}
            >
              {isLoading('treyfact') ? <><span className="spinner spinner-sm spinner-white" /> Generando…</> : '📥 TreyFact'}
            </button>

            <button
              className="btn btn-danger"
              disabled={!!busy}
              onClick={() => dl('pdf', () => downloadPdfReport(documentId), 'Descargando informe…')}
            >
              {isLoading('pdf') ? <><span className="spinner spinner-sm spinner-white" /> Generando…</> : '🖨️ Informe PDF'}
            </button>

            <button
              className="btn btn-primary"
              disabled={!!busy}
              title="Listín de precios para clientes"
              onClick={() => dl('pricelist', () => downloadPriceList(documentId), 'Generando listín…')}
            >
              {isLoading('pricelist') ? <><span className="spinner spinner-sm spinner-white" /> Generando…</> : '💶 Listín precios'}
            </button>
          </div>
        </div>

        {/* Section: Etiquetas */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            Etiquetas
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              border: '1.5px solid var(--grey-300)', borderRadius: '8px',
              padding: '6px 10px', background: '#fff', flexShrink: 0,
            }}>
              <label style={{ fontSize: '12px', color: 'var(--grey-500)', fontWeight: 600 }}>Copias:</label>
              <input
                type="number" min={1} max={20} value={copies}
                onChange={e => setCopies(Math.max(1, Math.min(20, Number(e.target.value))))}
                style={{ width: '40px', border: 'none', fontSize: '13px', fontFamily: 'inherit', textAlign: 'center', outline: 'none' }}
              />
            </div>
            <button
              className="btn btn-ghost"
              disabled={!!busy}
              onClick={() => dl('labels-all', () => downloadLabels(documentId, undefined, copies), 'Generando etiquetas…')}
            >
              {isLoading('labels-all') ? <><span className="spinner spinner-sm" /> Generando…</> : '🏷️ Todas'}
            </button>
            {hasSelection && (
              <button
                className="btn btn-ghost"
                disabled={!!busy}
                onClick={() => dl('labels-sel', () => downloadLabels(documentId, selectedArticleIds, copies), `Etiquetas seleccionadas…`)}
              >
                {isLoading('labels-sel') ? <><span className="spinner spinner-sm" /> Generando…</> : `🏷️ Sel. (${selectedArticleIds.length})`}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
