import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Search, X, ChevronRight, FileText } from 'lucide-react';
import { FileUpload } from '../components/FileUpload';
import { listDocuments, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import type { Document, DocumentListItem } from '../types';

export function HomePage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vista, setVista] = useState<'pendientes' | 'todos'>('pendientes');

  const loadDocuments = async () => {
    try {
      const { data } = await listDocuments();
      setDocuments(data);
      setLoadError(null);
    } catch (e) {
      console.error('Error loading documents', e);
      setLoadError(describeApiError(e));
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

  const handleUploaded = (doc: Document) => {
    setShowUpload(false);
    navigate(`/documento/${doc.id}`);
  };

  const completed  = documents.filter(d => d.status === 'completed').length;
  const processing = documents.filter(d => d.status === 'processing' || d.status === 'uploaded').length;

  // Client-side search across filename, supplier, doc_number
  // Pendientes: los que aún no se han terminado (revisados y pasados a TreyFACT)
  const esPendiente = (d: DocumentListItem) => !d.terminado_at;
  const nPendientes = documents.filter(esPendiente).length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = vista === 'pendientes' && !q ? documents.filter(d => !d.terminado_at) : documents;
    if (!q) return base;
    return base.filter(d =>
      d.original_filename.toLowerCase().includes(q) ||
      (d.supplier_name && d.supplier_name.toLowerCase().includes(q)) ||
      (d.doc_number && d.doc_number.toLowerCase().includes(q))
    );
  }, [documents, search, vista]);

  return (
    <div className="page">

      {loadError && (
        <ConnectionError message={loadError} onRetry={loadDocuments} />
      )}

      {/* ── Page header ── */}
      <div className="inicio-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>Albaranes de proveedor</h1>
          <p>
            {loading ? 'Cargando…'
              : loadError ? '—'
              : documents.length === 0 ? 'Sin albaranes todavía'
              : processing > 0
                ? `${completed} completados · ${processing} procesando`
                : `${documents.length} albaranes · ${completed} leídos`
            }. Sube el albarán del proveedor y la app saca los artículos y precios.
          </p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setShowUpload(true)}>
          <Upload size={19} /> Subir albarán
        </button>
      </div>

      {/* ── Document list ── */}
      {loading ? (
        // Skeleton loading — table rows
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <span className="skeleton" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
              <span className="skeleton skeleton-line" style={{ flex: 1 }} />
              <span className="skeleton skeleton-line-sm" style={{ width: 60 }} />
              <span className="skeleton skeleton-line-sm" style={{ width: 80 }} />
            </div>
          ))}
        </div>
      ) : documents.length === 0 && !loadError ? (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <div className="empty-state-icon"><FileText size={40} style={{ opacity: 0.35 }} /></div>
          <div className="empty-state-text">Aún no hay albaranes de proveedor</div>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowUpload(true)}>
            <Upload size={17} /> Subir el primero
          </button>
        </div>
      ) : documents.length === 0 ? null : (
        <>
          <div className="firma-vistas doc-vistas" role="tablist" aria-label="Qué albaranes ver">
            <button role="tab" aria-selected={vista === 'pendientes'} className={`firma-vista${vista === 'pendientes' ? ' on' : ''}`} onClick={() => setVista('pendientes')}>
              Por terminar <span className="firma-vista-n">{nPendientes}</span>
            </button>
            <button role="tab" aria-selected={vista === 'todos'} className={`firma-vista${vista === 'todos' ? ' on' : ''}`} onClick={() => setVista('todos')}>
              Todos <span className="firma-vista-n">{documents.length}</span>
            </button>
          </div>

          {/* Search bar + count */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ flex: '1 1 220px', minWidth: 0 }}>
              <span className="search-bar-icon"><Search size={17} /></span>
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, proveedor, nº albarán…"
                autoComplete="off"
              />
              {search && (
                <button className="search-bar-clear" onClick={() => setSearch('')} aria-label="Borrar búsqueda"><X size={16} /></button>
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
              <div className="empty-state-icon"><Search size={36} style={{ opacity: 0.35 }} /></div>
              <div className="empty-state-text">{search ? 'Sin resultados' : 'Todo terminado'}</div>
              <p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>
                {search ? `No hay albaranes que coincidan con «${search}».` : 'No queda ningún albarán por revisar y pasar a TreyFACT.'}
              </p>
              {search && <button className="btn btn-ghost btn-sm" style={{ marginTop: '12px' }} onClick={() => setSearch('')}>
                Limpiar búsqueda
              </button>}
            </div>
          ) : (
            <div className="firma-lista cf-enter">
              {filtered.map(doc => (
                <DocCard key={doc.id} doc={doc} onOpen={() => navigate(`/documento/${doc.id}`)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Subir: ventana (abajo en el móvil, centrada en el PC) ── */}
      {showUpload && (
        <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget) setShowUpload(false); }}>
          <div className="upload-sheet">
            <div className="upload-sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 22, margin: 0 }}>Subir albarán de proveedor</h3>
              <button className="modal-close" style={{ marginLeft: 'auto' }} onClick={() => setShowUpload(false)} aria-label="Cerrar"><X size={20} /></button>
            </div>
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
  processing: { label: 'Leyendo…',    cls: 'badge badge-warning' },
  completed:  { label: 'Leído',       cls: 'badge badge-success' },
  error:      { label: 'Error',       cls: 'badge badge-danger'  },
};

const DOT_COLOR: Record<string, string> = {
  completed:  'var(--brand)',
  processing: 'var(--warning)',
  uploaded:   'var(--text-3)',
  error:      'var(--danger)',
};

function DocCard({ doc, onOpen }: { doc: DocumentListItem; onOpen: () => void }) {
  const st = doc.status === 'completed' && doc.terminado_at ? { label: 'Terminado', cls: 'badge badge-grey' }
    : doc.status === 'completed' ? { label: 'Por terminar', cls: 'badge badge-success' }
    : statusConfig[doc.status] || statusConfig.uploaded;
  const isProcessing = doc.status === 'processing' || doc.status === 'uploaded';
  const dateStr = new Date(doc.doc_date || doc.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <button className="card firma-card doc-fila" onClick={onOpen}>
      <span className="doc-fila-dot" style={{ background: DOT_COLOR[doc.status] ?? 'var(--text-3)' }} />
      <span className="doc-fila-main">
        <span className="doc-fila-tit">{doc.supplier_name || doc.original_filename}</span>
        <span className="doc-fila-sub">
          {[doc.doc_number && `Nº ${doc.doc_number}`, dateStr, `${doc.article_count} artículo${doc.article_count !== 1 ? 's' : ''}`, doc.drive_pendiente && 'Falta elegir carpeta de Drive'].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className={st.cls} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {isProcessing && <span className="spinner spinner-sm" />}
        {st.label}
      </span>
      <ChevronRight size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </button>
  );
}
