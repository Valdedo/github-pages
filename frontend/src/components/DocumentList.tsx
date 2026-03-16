import type { DocumentListItem } from '../types';

interface Props {
  documents: DocumentListItem[];
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

const statusLabel: Record<string, string> = {
  uploaded: '⬆️ Subido',
  processing: '⏳ Procesando',
  completed: '✅ Completado',
  error: '❌ Error',
};

const statusColor: Record<string, string> = {
  uploaded: '#888',
  processing: '#e67e22',
  completed: '#27ae60',
  error: '#e74c3c',
};

export function DocumentList({ documents, onSelect, onDelete }: Props) {
  if (documents.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        No hay albaranes procesados aún.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {documents.map(doc => (
        <div
          key={doc.id}
          style={{
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'box-shadow 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(31,78,121,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
        >
          <div onClick={() => onSelect(doc.id)} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📄 {doc.original_filename}
            </div>
            <div style={{ fontSize: '12px', color: '#666', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {doc.supplier_name && <span>🏭 {doc.supplier_name}</span>}
              {doc.doc_number && <span>📑 {doc.doc_number}</span>}
              {doc.doc_date && <span>📅 {doc.doc_date}</span>}
              <span>📦 {doc.article_count} artículos</span>
              <span style={{ color: '#999' }}>{new Date(doc.created_at).toLocaleDateString('es-ES')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '12px' }}>
            <span style={{
              background: statusColor[doc.status] || '#888',
              color: '#fff',
              padding: '3px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>
              {statusLabel[doc.status] || doc.status}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onSelect(doc.id); }}
              style={{ ...btnStyle, background: '#1F4E79' }}
            >
              Abrir
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(doc.id); }}
              style={{ ...btnStyle, background: '#e74c3c' }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: 'none',
  borderRadius: '5px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
};
