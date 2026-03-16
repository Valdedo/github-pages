import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument, getSettings, listSuppliers } from '../api/client';
import { DocumentPreview } from '../components/DocumentPreview';
import { MetadataPanel } from '../components/MetadataPanel';
import { MarginSettings } from '../components/MarginSettings';
import { ArticleTable } from '../components/ArticleTable';
import { ExportPanel } from '../components/ExportPanel';
import type { Document, Article, AppSettings, Supplier } from '../types';

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

  const loadDocument = useCallback(async () => {
    try {
      const { data } = await getDocument(docId);
      setDocument(data);
      setArticles(data.articles || []);
      return data.status;
    } catch (e) {
      console.error('Error loading document', e);
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

  // Poll while processing
  useEffect(() => {
    if (!document) return;
    if (document.status === 'processing' || document.status === 'uploaded') {
      setPolling(true);
      const timer = setInterval(async () => {
        const status = await loadDocument();
        if (status !== 'processing' && status !== 'uploaded') {
          clearInterval(timer);
          setPolling(false);
        }
      }, 2000);
      return () => clearInterval(timer);
    }
  }, [document?.status]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
        Cargando...
      </div>
    );
  }

  if (!document) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#e74c3c' }}>
        Documento no encontrado.
        <br />
        <button onClick={() => navigate('/')} style={{ marginTop: '12px', ...backBtn }}>
          ← Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '16px' }}>
      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button onClick={() => navigate('/')} style={backBtn}>
          ← Inicio
        </button>
        <h2 style={{ margin: 0, color: '#1F4E79', fontSize: '18px', flex: 1 }}>
          📄 {document.original_filename}
        </h2>
        {polling && (
          <span style={{ color: '#e67e22', fontSize: '13px', fontWeight: 600 }}>
            ⏳ Extrayendo artículos...
          </span>
        )}
      </div>

      {/* Main layout: preview on left, content on right */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Left: document preview */}
        <div style={{ position: 'sticky', top: '16px', height: 'calc(100vh - 100px)' }}>
          <DocumentPreview document={document} />
        </div>

        {/* Right: metadata + settings + table + export */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <MetadataPanel
            document={document}
            suppliers={suppliers}
            onUpdated={doc => setDocument(doc)}
          />

          {settings && (
            <MarginSettings
              settings={settings}
              documentId={docId}
              onUpdated={s => {
                setSettings(s);
                loadDocument(); // reload articles with new pricing
              }}
            />
          )}

          <ExportPanel
            documentId={docId}
            suppliers={suppliers}
            onReprocessed={() => {
              setArticles([]);
              loadDocument();
            }}
          />

          <ArticleTable
            documentId={docId}
            articles={articles}
            onArticlesChanged={setArticles}
          />
        </div>
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: '#1F4E79',
  color: '#fff',
  border: 'none',
  borderRadius: '7px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
};
