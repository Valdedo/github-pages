import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '../components/FileUpload';
import { DocumentList } from '../components/DocumentList';
import { listDocuments, deleteDocument } from '../api/client';
import type { Document, DocumentListItem } from '../types';

export function HomePage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocuments = async () => {
    try {
      const { data } = await listDocuments();
      setDocuments(data);
    } catch (e) {
      console.error('Error loading documents', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // Poll for status updates while any doc is processing
    const timer = setInterval(() => {
      const hasProcessing = documents.some(d => d.status === 'processing' || d.status === 'uploaded');
      if (hasProcessing) loadDocuments();
    }, 3000);
    return () => clearInterval(timer);
  }, [documents.length]);

  const handleUploaded = (doc: Document) => {
    navigate(`/documento/${doc.id}`);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este albarán y sus artículos?')) return;
    await deleteDocument(id);
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 8px', color: '#1F4E79', fontSize: '28px' }}>
          📦 Procesador de Albaranes
        </h1>
        <p style={{ color: '#666', margin: 0, fontSize: '15px' }}>
          Sube un albarán en PDF o foto y la IA extraerá todos los artículos automáticamente
        </p>
      </div>

      {/* Upload zone */}
      <div style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: '12px',
        marginBottom: '24px',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 20px', background: '#1F4E79', color: '#fff', fontWeight: 600 }}>
          ⬆️ Subir nuevo albarán
        </div>
        <FileUpload onUploaded={handleUploaded} />
      </div>

      {/* Document list */}
      <div style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 20px',
          background: '#f0f4f8',
          fontWeight: 600,
          color: '#1F4E79',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>📁 Albaranes procesados</span>
          <button
            onClick={loadDocuments}
            style={{
              padding: '4px 12px',
              background: '#1F4E79',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            🔄 Actualizar
          </button>
        </div>
        <div style={{ padding: '16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#888', padding: '24px' }}>Cargando...</div>
          ) : (
            <DocumentList
              documents={documents}
              onSelect={id => navigate(`/documento/${id}`)}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
