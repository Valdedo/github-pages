import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '../components/FileUpload';
import { DocumentList } from '../components/DocumentList';
import { useConfirm } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { listDocuments, deleteDocument } from '../api/client';
import type { Document, DocumentListItem } from '../types';

export function HomePage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm, ConfirmDialog } = useConfirm();
  const { showToast, ToastContainer } = useToast();

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
    const ok = await confirm({
      title: 'Eliminar albarán',
      message: '¿Eliminar este albarán y todos sus artículos? Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      showToast('Albarán eliminado', 'info');
    } catch {
      showToast('Error al eliminar el albarán', 'error');
    }
  };

  const completed  = documents.filter(d => d.status === 'completed').length;
  const processing = documents.filter(d => d.status === 'processing' || d.status === 'uploaded').length;

  return (
    <div className="page">
      {ConfirmDialog}
      <ToastContainer />

      {/* Hero */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{
          fontSize: '22px',
          fontWeight: 800,
          color: 'var(--text-1)',
          letterSpacing: '-0.03em',
          marginBottom: '6px',
        }}>
          Procesador de albaranes
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>
          Sube un albarán en PDF o foto — la IA extrae los artículos automáticamente.
        </p>
      </div>

      {/* Stats row */}
      {documents.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <StatChip label="Total" value={documents.length} />
          <StatChip label="Completados" value={completed} positive />
          {processing > 0 && <StatChip label="Procesando" value={processing} warning />}
        </div>
      )}

      {/* Upload */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">Subir nuevo albarán</div>
        <div className="card-body">
          <FileUpload onUploaded={handleUploaded} />
        </div>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between' }}>
          <span>Albaranes procesados</span>
          <button className="btn btn-ghost btn-sm" onClick={loadDocuments}>
            Actualizar
          </button>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="empty-state" style={{ padding: '32px' }}>
              <div className="empty-state-text" style={{ color: 'var(--text-3)' }}>Cargando…</div>
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 24px' }}>
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-text">Aún no hay albaranes.</div>
              <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '4px' }}>
                Sube tu primer albarán arriba para empezar.
              </p>
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

function StatChip({ label, value, positive, warning }: {
  label: string; value: number; positive?: boolean; warning?: boolean;
}) {
  const color = positive ? 'var(--brand)' : warning ? 'var(--warning)' : 'var(--text-2)';
  const bg    = positive ? 'var(--brand-pale)' : warning ? '#fffbeb' : 'var(--surface)';
  const border = positive ? 'var(--brand-light)' : warning ? '#fde68a' : 'var(--border)';

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 'var(--r-lg)',
      padding: '8px 16px',
      textAlign: 'center',
      minWidth: '80px',
    }}>
      <div style={{ fontSize: '20px', fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '1px' }}>
        {label}
      </div>
    </div>
  );
}
