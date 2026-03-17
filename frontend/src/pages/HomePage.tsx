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

  const completed = documents.filter(d => d.status === 'completed').length;
  const processing = documents.filter(d => d.status === 'processing' || d.status === 'uploaded').length;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: '32px', padding: '8px 0' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Procesador de Albaranes
        </h1>
        <p style={{ color: 'var(--grey-500)', fontSize: '14px', maxWidth: '480px', margin: '0 auto' }}>
          Sube un albarán en PDF o foto y la IA extraerá todos los artículos automáticamente
        </p>
      </div>

      {/* Stats row */}
      {documents.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', justifyContent: 'center' }}>
          <StatChip label="Total" value={documents.length} color="var(--primary)" />
          <StatChip label="Completados" value={completed} color="var(--success)" />
          {processing > 0 && <StatChip label="Procesando" value={processing} color="var(--warning)" />}
        </div>
      )}

      {/* Upload zone */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span>⬆️</span> Subir nuevo albarán
        </div>
        <div className="card-body" style={{ padding: '20px' }}>
          <FileUpload onUploaded={handleUploaded} />
        </div>
      </div>

      {/* Document list */}
      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📁</span> Albaranes procesados
          </span>
          <button className="btn btn-ghost btn-sm" onClick={loadDocuments}>
            ↻ Actualizar
          </button>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="empty-state">
              <div className="empty-state-text">Cargando...</div>
            </div>
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

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--grey-200)',
      borderRadius: '10px',
      padding: '10px 20px',
      textAlign: 'center',
      boxShadow: 'var(--card-shadow)',
      minWidth: '90px',
    }}>
      <div style={{ fontSize: '22px', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--grey-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}
