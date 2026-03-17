import type { DocumentListItem } from '../types';

interface Props {
  documents: DocumentListItem[];
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  uploaded:   { label: 'Subido',      cls: 'badge badge-grey' },
  processing: { label: '⏳ Procesando', cls: 'badge badge-warning' },
  completed:  { label: '✓ Completado', cls: 'badge badge-success' },
  error:      { label: '✕ Error',      cls: 'badge badge-danger' },
};

export function DocumentList({ documents, onSelect, onDelete }: Props) {
  if (documents.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📂</div>
        <div className="empty-state-text">No hay albaranes procesados aún.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {documents.map(doc => {
        const st = statusConfig[doc.status] || { label: doc.status, cls: 'badge badge-grey' };
        return (
          <div
            key={doc.id}
            className="doc-item"
            onClick={() => onSelect(doc.id)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--grey-900)' }}>
                {doc.original_filename}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--grey-500)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {doc.supplier_name && <span>🏭 {doc.supplier_name}</span>}
                {doc.doc_number && <span>#{doc.doc_number}</span>}
                {doc.doc_date && <span>📅 {doc.doc_date}</span>}
                <span>📦 {doc.article_count} artículos</span>
                <span>{new Date(doc.created_at).toLocaleDateString('es-ES')}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '16px' }}>
              <span className={st.cls}>{st.label}</span>
              <button
                className="btn btn-primary btn-sm"
                onClick={e => { e.stopPropagation(); onSelect(doc.id); }}
              >
                Abrir
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={e => { e.stopPropagation(); onDelete(doc.id); }}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
