import type { DocumentListItem } from '../types';

interface Props {
  documents: DocumentListItem[];
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  uploaded:   { label: 'Subido',       cls: 'badge badge-grey' },
  processing: { label: 'Procesando…',  cls: 'badge badge-warning' },
  completed:  { label: 'Completado',   cls: 'badge badge-success' },
  error:      { label: 'Error',        cls: 'badge badge-danger' },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {documents.map(doc => {
        const st = statusConfig[doc.status] || { label: doc.status, cls: 'badge badge-grey' };
        return (
          <div key={doc.id} className="doc-item" onClick={() => onSelect(doc.id)}>

            {/* Status dot */}
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 2,
              background: doc.status === 'completed' ? 'var(--brand)'
                        : doc.status === 'processing' ? 'var(--warning)'
                        : doc.status === 'error'      ? 'var(--danger)'
                        : 'var(--border-strong)',
            }} />

            {/* Main info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 600,
                fontSize: '14px',
                color: 'var(--text-1)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: '3px',
              }}>
                {doc.original_filename}
              </div>
              <div style={{
                fontSize: '12px',
                color: 'var(--text-3)',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}>
                {doc.supplier_name && (
                  <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>
                    {doc.supplier_name}
                  </span>
                )}
                {doc.doc_number && <span>Nº {doc.doc_number}</span>}
                {doc.doc_date && <span>{doc.doc_date}</span>}
                <span>{doc.article_count} art.</span>
                <span>{new Date(doc.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
              <span className={st.cls}>{st.label}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={e => { e.stopPropagation(); onSelect(doc.id); }}
              >
                Abrir
              </button>
              <button
                className="btn btn-danger btn-sm"
                style={{ padding: '4px 8px' }}
                onClick={e => { e.stopPropagation(); onDelete(doc.id); }}
                title="Eliminar albarán"
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
