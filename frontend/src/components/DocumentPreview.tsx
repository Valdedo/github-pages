import { getDocumentFileUrl } from '../api/client';
import type { Document } from '../types';

interface Props {
  document: Document;
}

export function DocumentPreview({ document }: Props) {
  const url = getDocumentFileUrl(document.id);

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '10px 16px',
        background: '#1F4E79',
        color: '#fff',
        fontSize: '13px',
        fontWeight: 600,
      }}>
        📄 Vista previa: {document.original_filename}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {document.doc_type === 'pdf' ? (
          <iframe
            src={url}
            style={{ width: '100%', height: '100%', border: 'none', minHeight: '500px' }}
            title="Previsualización del albarán"
          />
        ) : (
          <img
            src={url}
            alt="Albarán"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              padding: '8px',
            }}
          />
        )}
      </div>
    </div>
  );
}
