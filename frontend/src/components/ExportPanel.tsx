import { useState, useRef, useEffect } from 'react';
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

const DOWNLOAD_ITEMS = (documentId: number) => [
  { key: 'excel',     icon: '📊', label: 'Excel',         desc: 'Hoja de cálculo',       fn: () => downloadExcel(documentId),       msg: 'Descargando Excel…' },
  { key: 'treyfact',  icon: '📥', label: 'TreyFact',      desc: 'Importar en TreyFact',  fn: () => downloadTreyFact(documentId),    msg: 'Generando TreyFact…' },
  { key: 'pdf',       icon: '🖨️', label: 'Informe PDF',   desc: 'Informe completo',      fn: () => downloadPdfReport(documentId),   msg: 'Descargando informe…' },
  { key: 'pricelist', icon: '💶', label: 'Listín precios', desc: 'Para clientes',        fn: () => downloadPriceList(documentId),   msg: 'Generando listín…' },
];

export function ExportPanel({ documentId, suppliers, selectedArticleIds, onReprocessed, onToast }: Props) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [supplierId, setSupplierId] = useState<string>('');
  const [reprocessing, setReprocessing] = useState(false);
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dlOpen) return;
    const handler = (e: MouseEvent) => {
      if (dlRef.current && !dlRef.current.contains(e.target as Node)) setDlOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dlOpen]);

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
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Fila principal: descarga + etiquetas */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Dropdown de descargas */}
          <div ref={dlRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-primary"
              disabled={!!busy}
              onClick={() => setDlOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {busy && ['excel','treyfact','pdf','pricelist'].includes(busy)
                ? <><span className="spinner spinner-sm spinner-white" /> Generando…</>
                : <>📥 Descargar <span style={{ fontSize: '10px', marginLeft: '2px' }}>{dlOpen ? '▲' : '▼'}</span></>
              }
            </button>

            {dlOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
                background: '#fff', border: '1.5px solid var(--grey-300)',
                borderRadius: '10px', boxShadow: '0 8px 28px rgba(0,0,0,0.13)',
                minWidth: '210px', overflow: 'hidden',
              }}>
                {DOWNLOAD_ITEMS(documentId).map((item, idx, arr) => (
                  <button
                    key={item.key}
                    disabled={!!busy}
                    onClick={() => { dl(item.key, item.fn, item.msg); setDlOpen(false); }}
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
                      textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px',
                      borderBottom: idx < arr.length - 1 ? '1px solid var(--grey-100)' : 'none',
                      opacity: busy ? 0.5 : 1,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--grey-100)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                  >
                    <span style={{ fontSize: '22px', lineHeight: 1 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>{item.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>{item.desc}</div>
                    </div>
                    {isLoading(item.key) && <span className="spinner spinner-sm" style={{ marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Etiquetas */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              border: '1.5px solid var(--grey-300)', borderRadius: '8px',
              padding: '5px 9px', background: '#fff',
            }}>
              <label style={{ fontSize: '12px', color: 'var(--grey-500)', fontWeight: 600 }}>Copias:</label>
              <input
                type="number" min={1} max={20} value={copies}
                onChange={e => setCopies(Math.max(1, Math.min(20, Number(e.target.value))))}
                style={{ width: '36px', border: 'none', fontSize: '13px', fontFamily: 'inherit', textAlign: 'center', outline: 'none' }}
              />
            </div>
            <button
              className="btn btn-ghost"
              disabled={!!busy}
              onClick={() => dl('labels-all', () => downloadLabels(documentId, undefined, copies), 'Generando etiquetas…')}
            >
              {isLoading('labels-all') ? <><span className="spinner spinner-sm" /> Generando…</> : '🏷️ Etiquetas'}
            </button>
            {hasSelection && (
              <button
                className="btn btn-ghost"
                disabled={!!busy}
                onClick={() => dl('labels-sel', () => downloadLabels(documentId, selectedArticleIds, copies), 'Etiquetas seleccionadas…')}
              >
                {isLoading('labels-sel') ? <><span className="spinner spinner-sm" /> Generando…</> : `🏷️ Sel. (${selectedArticleIds.length})`}
              </button>
            )}
          </div>
        </div>

        {/* Zona de peligro: reprocesar */}
        <div style={{
          borderTop: '1.5px dashed var(--grey-300)',
          paddingTop: '12px',
        }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, color: 'var(--danger)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
            display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            ⚠️ Zona de peligro
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {suppliers.length > 0 && (
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                style={{ padding: '7px 10px', border: '1.5px solid var(--grey-300)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: '#fff', flex: '1 1 160px', minWidth: 0 }}
              >
                <option value="">Auto-detectar proveedor</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button
              className="btn btn-warning"
              onClick={handleReprocess}
              disabled={reprocessing}
            >
              {reprocessing ? <><span className="spinner spinner-sm spinner-white" /> Procesando…</> : '🔄 Reprocesar extracción'}
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '6px 0 0' }}>
            Sobreescribe los cambios manuales en artículos.
          </p>
        </div>

      </div>
    </div>
  );
}
