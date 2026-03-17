import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument, getSettings, listSuppliers } from '../api/client';
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
      ]);
      setLoading(false);
    };
    init();
  }, [docId]);

  useEffect(() => {
    if (!document) return;
    if (document.status === 'processing' || document.status === 'uploaded') {
      setPolling(true);
      const timer = setInterval(async () => {
        const status = await loadDocument();
        if (status !== 'processing' && status !== 'uploaded') {
          clearInterval(timer);
          setPolling(false);
          showToast('Extracción completada', 'success');
        }
      }, 2000);
      return () => clearInterval(timer);
    }
  }, [document?.status]);

  if (loading) {
    return <div className="empty-state" style={{ paddingTop: '80px' }}><div className="empty-state-text">Cargando…</div></div>;
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

  return (
    <div className="page-wide">
      <ToastContainer />

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Inicio</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, color: 'var(--primary)', fontSize: '16px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {document.original_filename}
          </h2>
        </div>
        {polling && (
          <span style={{ color: 'var(--warning)', fontSize: '13px', fontWeight: 600 }}>
            ⏳ Extrayendo artículos…
          </span>
        )}
      </div>

      {/* Main 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '370px 1fr', gap: '18px', alignItems: 'start' }}>
        {/* Left: sticky preview */}
        <div style={{ position: 'sticky', top: '74px', height: 'calc(100vh - 110px)' }}>
          <DocumentPreview document={document} />
        </div>

        {/* Right: stacked panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <MetadataPanel
            document={document}
            suppliers={suppliers}
            onUpdated={doc => setDocument(doc)}
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
