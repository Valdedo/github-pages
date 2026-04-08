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
          delay = Math.min(delay * 1.4, 10000); // exponential backoff up to 10s
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

  return (
    <div className="page-wide">
      <ToastContainer />

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {/* Prev / Next navigation */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => prevId && navigate(`/documento/${prevId}`)}
            disabled={!prevId}
            title="Albarán anterior"
            style={{ padding: '4px 10px', fontSize: '16px', lineHeight: 1 }}
          >
            ‹
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => nextId && navigate(`/documento/${nextId}`)}
            disabled={!nextId}
            title="Albarán siguiente"
            style={{ padding: '4px 10px', fontSize: '16px', lineHeight: 1 }}
          >
            ›
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            margin: 0,
            color: 'var(--text-1)',
            fontSize: '15px',
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.02em',
          }}>
            {document.original_filename}
          </h2>
          {docIds.length > 0 && currentIdx >= 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 500 }}>
              {currentIdx + 1} de {docIds.length}
            </span>
          )}
        </div>

        {polling && (
          <span style={{
            color: 'var(--warning)',
            fontSize: '12px',
            fontWeight: 600,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '99px',
            padding: '3px 10px',
          }}>
            Extrayendo artículos…
          </span>
        )}
      </div>

      {/* Main 2-column layout — stacks to 1 column on mobile via .doc-grid media query */}
      <div className="doc-grid">
        {/* Left: sticky preview */}
        <div className="doc-grid-preview">
          <DocumentPreview document={document} />
        </div>

        {/* Right: stacked panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

          {settings && (
            <MarginSettings
              settings={settings}
              documentId={docId}
              onUpdated={s => { setSettings(s); loadDocument(); }}
              onToast={showToast}
            />
          )}

          <ExportPanel
            documentId={docId}
            suppliers={suppliers}
            selectedArticleIds={selectedIds}
            onReprocessed={() => { setArticles([]); loadDocument(); }}
            onToast={showToast}
          />

          <TotalsPanel articles={articles} />

          <ArticleTable
            documentId={docId}
            articles={articles}
            onArticlesChanged={setArticles}
            onSelectedIdsChange={setSelectedIds}
            onToast={showToast}
          />
        </div>
      </div>
    </div>
  );
}
