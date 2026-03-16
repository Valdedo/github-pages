import { useState } from 'react';
import { reprocessDocument, downloadExcel, downloadLabels } from '../api/client';
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
    <div style={{
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
    }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: '#1F4E79' }}>📤 Acciones</h3>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Reprocess */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {suppliers.length > 0 && (
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              style={{
                padding: '7px 10px', border: '1px solid #ccc',
                borderRadius: '6px', fontSize: '13px',
              }}
            >
              <option value="">Auto-detectar proveedor</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleReprocess}
            disabled={reprocessing}
            style={{ ...btn, background: '#e67e22' }}
          >
            {reprocessing ? '⏳ Procesando...' : '🔄 Reprocesar extracción'}
          </button>
        </div>

        <div style={{ width: '1px', height: '36px', background: '#ddd' }} />

        {/* Excel export */}
        <button
          onClick={() => downloadExcel(documentId)}
          style={{ ...btn, background: '#27ae60' }}
        >
          📊 Exportar Excel
        </button>

        {/* Labels export */}
        <button
          onClick={() => downloadLabels(documentId)}
          style={{ ...btn, background: '#1F4E79' }}
        >
          🏷️ Generar etiquetas PDF
        </button>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: '7px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
