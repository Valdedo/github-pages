import { useEffect, useState, useRef, useMemo } from 'react';
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
  const [search, setSearch] = useState('');
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

  const documentsRef = useRef<typeof documents>([]);
  useEffect(() => { documentsRef.current = documents; }, [documents]);

  useEffect(() => {
    loadDocuments();
    const timer = setInterval(() => {
      const hasProcessing = documentsRef.current.some(
        d => d.status === 'processing' || d.status === 'uploaded'
      );
      if (hasProcessing) loadDocuments();
    }, 3000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Client-side search across filename, supplier, doc_number
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(d =>
      d.original_filename.toLowerCase().includes(q) ||
      (d.supplier_name && d.supplier_name.toLowerCase().includes(q)) ||
      (d.doc_number && d.doc_number.toLowerCase().includes(q))
    );
  }, [documents, search]);

  return (
    <div className="page">
      {ConfirmDialog}
      <ToastContainer />
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
        // Skeleton loading
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-card">
              <span className="skeleton skeleton-line" style={{ width: '30%' }} />
              <span className="skeleton skeleton-line-lg" style={{ width: '70%' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="skeleton skeleton-line-sm" style={{ width: '80px' }} />
                <span className="skeleton skeleton-line-sm" style={{ width: '60px' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <span className="skeleton skeleton-line-sm" style={{ width: '100px' }} />
                <span className="skeleton skeleton-line" style={{ width: '80px', height: '30px', borderRadius: 'var(--r)' }} />
              </div>
            </div>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">Aún no hay albaranes</div>
          <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>
            Usa el botón verde para subir el primero.
          </p>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowUpload(true)}>
            + Subir albarán
          </button>
        </div>
      ) : (
        <>
          {/* Search bar + count */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ flex: '1 1 220px', minWidth: 0 }}>
              <span className="search-bar-icon">🔍</span>
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, proveedor, nº albarán…"
                autoComplete="off"
              />
              {search && (
                <button className="search-bar-clear" onClick={() => setSearch('')}>✕</button>
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-3)', whiteSpace: 'nowrap', fontWeight: 500 }}>
              {search
                ? `${filtered.length} de ${documents.length}`
                : `${documents.length} albaranes`
              }
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-state-icon">🔎</div>
              <div className="empty-state-text">Sin resultados</div>
              <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>
                No hay albaranes que coincidan con «{search}».
              </p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: '12px' }} onClick={() => setSearch('')}>
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <div className="doc-grid-list">
              {filtered.map(doc => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  onOpen={() => navigate(`/documento/${doc.id}`)}
                  onDelete={() => handleDelete(doc.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── FAB (mobile) ── */}
      <button className="fab" onClick={() => setShowUpload(true)} aria-label="Subir albarán">+</button>

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
const statusConfig: Record<string, { label: string; cls: string }> = {
  uploaded:   { label: 'Subido',      cls: 'badge badge-grey'    },
  processing: { label: 'Procesando…', cls: 'badge badge-warning' },
  completed:  { label: 'Completado',  cls: 'badge badge-success' },
  error:      { label: 'Error',       cls: 'badge badge-danger'  },
};

function DocCard({ doc, onOpen, onDelete }: {
  doc: DocumentListItem;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const st = statusConfig[doc.status] || statusConfig.uploaded;
  const isProcessing = doc.status === 'processing' || doc.status === 'uploaded';

  return (
    <div className="doc-card" onClick={onOpen}>
      <div className="doc-card-status">
        <span className={st.cls} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {isProcessing && <span className="spinner spinner-sm" />}
          {st.label}
        </span>
      </div>
      <div className="doc-card-title">{doc.supplier_name || doc.original_filename}</div>
      {doc.supplier_name && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.original_filename}</div>
      )}
      <div className="doc-card-meta">
        {doc.supplier_name && <span className="doc-card-chip supplier">{doc.supplier_name}</span>}
        {doc.doc_number    && <span className="doc-card-chip">Nº {doc.doc_number}</span>}
        {doc.doc_date      && <span className="doc-card-chip">{doc.doc_date}</span>}
        <span className="doc-card-chip">{doc.article_count} art.</span>
      </div>
      <div className="doc-card-footer">
        <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
          {doc.doc_date
            ? new Date(doc.doc_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
            : new Date(doc.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
          }
        </span>
        <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
          <button
            className="btn btn-danger btn-sm"
            style={{ minWidth: '36px', minHeight: '36px' }}
            onClick={onDelete}
            title="Eliminar albarán"
          >✕</button>
          <button className="btn btn-primary btn-sm" onClick={onOpen}>Abrir →</button>
        </div>
      </div>
    </div>
  );
}
