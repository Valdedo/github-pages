import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument, getSettings, listSuppliers, listDocuments, recalculateArticles } from '../api/client';
import { DocumentPreview } from '../components/DocumentPreview';
import { MetadataPanel } from '../components/MetadataPanel';
import { MarginSettings } from '../components/MarginSettings';
import { ArticleTable } from '../components/ArticleTable';
import { ExportPanel } from '../components/ExportPanel';
import { TotalsPanel } from '../components/TotalsPanel';
import { useToast } from '../components/Toast';
import type { Document, Article, AppSettings, Supplier } from '../types/index';

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  uploaded:   { label: 'Subido',       dot: 'rgba(255,255,255,0.5)' },
  processing: { label: '⏳ Procesando', dot: '#fde68a' },
  completed:  { label: '✓ Completado', dot: '#bbf7d0' },
  error:      { label: '✕ Error',      dot: '#fca5a5' },
};

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const docId = Number(id);

  const [document, setDocument] = useState<Document | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [docIds, setDocIds] = useState<number[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const { showToast, ToastContainer } = useToast();

  const loadDocument = useCallback(async () => {
    try {
      const { data } = await getDocument(docId);
      setDocument(data);
      setArticles(data.articles || []);
      return data.status;
    } catch {
      return 'error';
    }
  }, [docId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        loadDocument(),
        getSettings().then(r => setSettings(r.data)),
        listSuppliers().then(r => setSuppliers(r.data)),
        listDocuments().then(r => setDocIds(r.data.map((d: { id: number }) => d.id).reverse())),
      ]);
      setLoading(false);
    };
    init();
  }, [docId]);

  useEffect(() => {
    if (!document) return;
    if (document.status === 'processing' || document.status === 'uploaded') {
      setPolling(true);
      let delay = 2000;
      let timerId: ReturnType<typeof setTimeout>;

      const poll = async () => {
        const status = await loadDocument();
        if (status === 'processing' || status === 'uploaded') {
          delay = Math.min(delay * 1.4, 10000);
          timerId = setTimeout(poll, delay);
        } else {
          setPolling(false);
          showToast('Extracción completada', 'success');
        }
      };

      timerId = setTimeout(poll, delay);
      return () => clearTimeout(timerId);
    }
  }, [document?.status]);

  if (loading) {
    return (
      <div className="empty-state" style={{ paddingTop: '80px' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</div>
        <div className="empty-state-text">Cargando albarán…</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="empty-state" style={{ paddingTop: '80px' }}>
        <div className="empty-state-icon">❌</div>
        <div className="empty-state-text">Documento no encontrado.</div>
        <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => navigate('/')}>← Volver al inicio</button>
      </div>
    );
  }

  const currentIdx = docIds.indexOf(docId);
  const prevId = currentIdx > 0 ? docIds[currentIdx - 1] : null;
  const nextId = currentIdx >= 0 && currentIdx < docIds.length - 1 ? docIds[currentIdx + 1] : null;
  const st = STATUS_CONFIG[document.status] || STATUS_CONFIG.uploaded;

  return (
    <div className="page-wide">
      <ToastContainer />

      {/* ── Document hero strip ───────────────────────────────────── */}
      <div className="doc-page-hero">
        {/* Left: navigation + title + chips */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
          {/* Prev / Next + counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <button
              className="doc-hero-nav-btn"
              onClick={() => prevId && navigate(`/documento/${prevId}`)}
              disabled={!prevId}
              title="Albarán anterior"
            >‹</button>
            <button
              className="doc-hero-nav-btn"
              onClick={() => nextId && navigate(`/documento/${nextId}`)}
              disabled={!nextId}
              title="Albarán siguiente"
            >›</button>
            {docIds.length > 0 && currentIdx >= 0 && (
              <span style={{ fontSize: '11px', opacity: 0.6, fontWeight: 500, marginLeft: '2px' }}>
                {currentIdx + 1} de {docIds.length}
              </span>
            )}
          </div>

          {/* Filename */}
          <h1 style={{
            fontSize: 'clamp(15px, 2vw, 20px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#fff',
            margin: '0 0 10px',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {document.original_filename}
          </h1>

          {/* Chips row */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {document.supplier_name && (
              <span className="doc-hero-chip doc-hero-chip-brand">{document.supplier_name}</span>
            )}
            {document.doc_number && (
              <span className="doc-hero-chip">Nº {document.doc_number}</span>
            )}
            {document.doc_date && (
              <span className="doc-hero-chip">{document.doc_date}</span>
            )}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: 'rgba(255,255,255,0.18)', borderRadius: '99px',
              padding: '2px 10px', fontSize: '11px', fontWeight: 700,
              color: '#fff', letterSpacing: '0.02em',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot, display: 'inline-block', flexShrink: 0 }} />
              {st.label}
            </span>
            {polling && (
              <span style={{ fontSize: '12px', opacity: 0.75, fontStyle: 'italic', color: '#fff' }}>
                Extrayendo artículos…
              </span>
            )}
          </div>
        </div>

        {/* Right: article count + preview toggle */}
        <div style={{ textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
          <div>
            <div style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#fff' }}>
              {articles.length}
            </div>
            <div style={{ fontSize: '10px', opacity: 0.65, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px' }}>
              artículos
            </div>
          </div>
          <button
            className="doc-hero-nav-btn"
            onClick={() => setShowPreview(p => !p)}
            title={showPreview ? 'Ocultar imagen original' : 'Ver imagen original'}
            style={{ fontSize: '14px', width: 'auto', padding: '4px 10px', gap: '4px', display: 'flex', alignItems: 'center' }}
          >
            📄 {showPreview ? 'Ocultar' : 'Ver doc'}
          </button>
        </div>
      </div>

      {/* ── Collapsible preview ───────────────────────────────────── */}
      {showPreview && (
        <div className="card" style={{ marginBottom: '14px', overflow: 'hidden' }}>
          <div
            className="card-header"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setShowPreview(false)}
          >
            <span>📄 {document.original_filename}</span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-3)', fontWeight: 400 }}>▲ Ocultar</span>
          </div>
          <div style={{ height: '500px' }}>
            <DocumentPreview document={document} />
          </div>
        </div>
      )}

      {/* ── Panels: single-column, full width ────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* 1. Totals overview */}
        <TotalsPanel articles={articles} />

        {/* 2. Article table — MAIN work area, gets full width */}
        <ArticleTable
          documentId={docId}
          articles={articles}
          onArticlesChanged={setArticles}
          onSelectedIdsChange={setSelectedIds}
          onToast={showToast}
        />

        {/* 3. Actions row: Export + Margin side by side on desktop */}
        <div className="doc-actions-row">
          <ExportPanel
            documentId={docId}
            suppliers={suppliers}
            selectedArticleIds={selectedIds}
            onReprocessed={() => { setArticles([]); loadDocument(); }}
            onToast={showToast}
          />
          {settings && (
            <MarginSettings
              settings={settings}
              documentId={docId}
              onUpdated={s => { setSettings(s); loadDocument(); }}
              onToast={showToast}
            />
          )}
        </div>

        {/* 4. Metadata — edit secondary info */}
        <MetadataPanel
          document={document}
          suppliers={suppliers}
          onUpdated={doc => setDocument(doc)}
          onToast={showToast}
          onProntoPagoChanged={async () => {
            await recalculateArticles(docId);
            const { data } = await getDocument(docId);
            setArticles(data.articles || []);
          }}
        />

      </div>
    </div>
  );
}
