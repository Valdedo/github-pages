import { getDocumentFileUrl } from '../api/client';
import type { Document } from '../types';

interface Props {
  document: Document;
}

/** El albarán original (PDF o foto), tal como llegó del proveedor. */
export function DocumentPreview({ document }: Props) {
  const url = getDocumentFileUrl(document.id);

  return (
    <div className="doc-original-visor">
      {document.doc_type === 'pdf' ? (
        <iframe src={url} title="Albarán original del proveedor" />
      ) : (
        <img src={url} alt="Albarán original del proveedor" />
      )}
    </div>
  );
}
