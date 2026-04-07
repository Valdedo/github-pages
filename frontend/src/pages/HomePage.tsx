import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '../components/FileUpload';
import { useConfirm } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { listDocuments, deleteDocument } from '../api/client';
import type { Document, DocumentListItem } from '../types';

export function HomePage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  const { showToast, ToastContainer } = useToast();
  const uploadRef = useRef<HTMLDivElement>(null);

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

  // Allow bottom nav "Subir" button to trigger upload sheet
  useEffect(() => {
    const el = document.getElementById('upload-trigger');
    if (el) el.onclick = () => setShowUpload(true);
  }, []);

  const handleUploaded = (doc: Document) => {
    setShowUpload(false);
    navigate(`/documento/${doc.id}`);
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: 'Eliminar albarán',
      message: '¿Eliminar este albarán y todos sus artículos? No se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      showToast('Albarán eliminado', 'info');
    } catch {
      showToast('Error al eliminar', 'error');
    }
  };

  const completed  = documents.filter(d => d.status === 'completed').length;
  const processing = documents.filter(d => d.status === 'processing' || d.status === 'uploaded').length;

  return (
    <div className="page">
      {ConfirmDialog}
      <ToastContainer />

      {/* Hidden trigger for bottom nav */}
      <button id="upload-trigger" style={{ display: 'none' }} />

      {/* ── Hero card ── */}
      <div className="hero-card">
        <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
          Albaranes procesados
        </p>
        <div style={{ fontSize: '52px', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '8px', position: 'relative', zIndex: 1 }}>
          {loading ? '—' : completed}
        </div>
        <p style={{ fontSize: '13px', opacity: 0.75, position: 'relative', zIndex: 1 }}>
          {loading ? 'Cargando…'
            : documents.length === 0 ? 'Sube tu primer albarán'
            : processing > 0
              ? `${documents.length} en total · ${processing} procesando…`
              : `${documents.length} en total · todos al día`
          }
        </p>

        {/* Quick upload button — desktop */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowUpload(true)}
          style={{
            marginTop: '18px',
            background: 'rgba(255,255,255,0.18)',
            color: '#fff',
            border: '1.5px solid rgba(255,255,255,0.3)',
            backdropFilter: 'blur(4px)',
          }}
        >
          + Subir albarán
        </button>
      </div>

      {/* ── Upload panel — desktop only ── */}
      <div ref={uploadRef} className="upload-desktop">
        {showUpload && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <span>Subir nuevo albarán</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowUpload(false)}>✕</button>
            </div>
            <div className="card-body">
              <FileUpload onUploaded={handleUploaded} />
            </div>
          </div>
        )}
      </div>

      {/* ── Document list ── */}
      {loading ? (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>Cargando…</div>
        </div>
      ) : documents.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">Aún no hay albaranes</div>
          <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>
            Usa el botón verde para subir el primero.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: '16px' }}
            onClick={() => setShowUpload(true)}
          >
            + Subir albarán
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>
              Recientes
            </p>
            <button className="btn btn-ghost btn-sm" onClick={loadDocuments}>
              Actualizar
            </button>
          </div>
          <div className="doc-grid-list">
            {documents.map(doc => (
              <DocCard
                key={doc.id}
                doc={doc}
                onOpen={() => navigate(`/documento/${doc.id}`)}
                onDelete={() => handleDelete(doc.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── FAB (mobile) ── */}
      <button className="fab" onClick={() => setShowUpload(true)} aria-label="Subir albarán">
        +
      </button>

      {/* ── Upload bottom sheet (mobile) ── */}
      {showUpload && (
        <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget) setShowUpload(false); }}>
          <div className="upload-sheet">
            <div className="upload-sheet-handle" />
            <h3 style={{ fontWeight: 700, fontSize: '16px', marginBottom: '16px', color: 'var(--text-1)' }}>
              Subir albarán
            </h3>
            <FileUpload onUploaded={handleUploaded} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Document card ── */
const statusConfig: Record<string, { label: string; cls: string; dot: string }> = {
  uploaded:   { label: 'Subido',      cls: 'badge badge-grey',    dot: 'var(--border-strong)' },
  processing: { label: 'Procesando…', cls: 'badge badge-warning', dot: 'var(--warning)' },
  completed:  { label: 'Completado',  cls: 'badge badge-success', dot: 'var(--brand)' },
  error:      { label: 'Error',       cls: 'badge badge-danger',  dot: 'var(--danger)' },
};

function DocCard({ doc, onOpen, onDelete }: {
  doc: DocumentListItem;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const st = statusConfig[doc.status] || statusConfig.uploaded;

  return (
    <div className="doc-card" onClick={onOpen}>

      {/* Status badge */}
      <div className="doc-card-status">
        <span className={st.cls}>{st.label}</span>
      </div>

      {/* Title */}
      <div className="doc-card-title">{doc.original_filename}</div>

      {/* Chips */}
      <div className="doc-card-meta">
        {doc.supplier_name && (
          <span className="doc-card-chip supplier">{doc.supplier_name}</span>
        )}
        {doc.doc_number && (
          <span className="doc-card-chip">Nº {doc.doc_number}</span>
        )}
        {doc.doc_date && (
          <span className="doc-card-chip">{doc.doc_date}</span>
        )}
        <span className="doc-card-chip">
          {doc.article_count} art.
        </span>
      </div>

      {/* Footer */}
      <div className="doc-card-footer">
        <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
          {new Date(doc.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
        <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-danger btn-sm" style={{ padding: '3px 8px' }} onClick={onDelete}>
            ✕
          </button>
          <button className="btn btn-primary btn-sm" onClick={onOpen}>
            Abrir →
          </button>
        </div>
      </div>
    </div>
  );
}
