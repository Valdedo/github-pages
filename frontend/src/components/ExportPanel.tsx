import { useState } from 'react';
import { reprocessDocument, downloadExcel, downloadLabels, downloadPdfReport } from '../api/client';
import type { Supplier } from '../types';

interface Props {
  documentId: number;
  suppliers: Supplier[];
  onReprocessed: () => void;
}

export function ExportPanel({ documentId, suppliers, onReprocessed }: Props) {
  const [supplierId, setSupplierId] = useState<string>('');
  const [reprocessing, setReprocessing] = useState(false);

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      await reprocessDocument(documentId, supplierId ? Number(supplierId) : undefined);
      onReprocessed();
    } finally {
      setReprocessing(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span>📤</span> Acciones y exportación
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Reprocess */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {suppliers.length > 0 && (
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                style={{
                  padding: '7px 10px',
                  border: '1.5px solid var(--grey-300)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  background: '#fff',
                  color: 'var(--grey-700)',
                  outline: 'none',
                }}
              >
                <option value="">Auto-detectar proveedor</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            <button
              className="btn btn-warning"
              onClick={handleReprocess}
              disabled={reprocessing}
            >
              {reprocessing ? '⏳ Procesando...' : '🔄 Reprocesar extracción'}
            </button>
          </div>

          <div style={{ width: '1px', height: '32px', background: 'var(--grey-200)' }} />

          {/* Excel */}
          <button className="btn btn-success" onClick={() => downloadExcel(documentId)}>
            📊 Exportar Excel
          </button>

          {/* PDF report */}
          <button className="btn btn-danger" onClick={() => downloadPdfReport(documentId)}>
            🖨️ PDF imprimible
          </button>

          {/* Labels */}
          <button className="btn btn-primary" onClick={() => downloadLabels(documentId)}>
            🏷️ Generar etiquetas
          </button>
        </div>
      </div>
    </div>
  );
}
