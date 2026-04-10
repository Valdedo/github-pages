import { useEffect, useState, useCallback, useMemo } from 'react';
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [polling, setPolling] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [docIds, setDocIds] = useState<number[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const { showToast, ToastContainer } = useToast();

  // Parse validation data — must be before any early returns (Rules of Hooks)
  const validacion = useMemo(() => {
    if (!document?.validacion_notas) return null;
    try { return JSON.parse(document.validacion_notas); } catch { return null; }
  }, [document?.validacion_notas]);

  const loadDocument = useCallback(async () => {
    try {
      const { data } = await getDocument(docId);
      setDocument(data);
      setArticles(data.articles || []);
      setLoadFailed(false);
      return data.status;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setLoadFailed(true);  // real 404 — document doesn't exist
      }
      // On 500/network error during processing, keep polling — SQLite may have been busy
      return 'processing';
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

  // When document is null (initial load failed due to server busy/error) keep retrying
  useEffect(() => {
    if (loading || document || loadFailed) return;
    const timer = setTimeout(loadDocument, 3000);
    return () => clearTimeout(timer);
  }, [loading, document, loadFailed, loadDocument]);

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
          if (status === 'completed') showToast('Extracción completada', 'success');
        }
      };

      timerId = setTimeout(poll, delay);
      return () => clearTimeout(timerId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.status, loadDocument]);

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
        {loadFailed ? (
          <>
            <div className="empty-state-icon">❌</div>
            <div className="empty-state-text">Documento no encontrado.</div>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => navigate('/albaranes')}>← Volver a albaranes</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '36px', marginBottom: '12px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</div>
            <div className="empty-state-text">Analizando documento…</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '8px' }}>Esto puede tardar hasta 30 segundos</div>
          </>
        )}
      </div>
    );
  }

  const currentIdx = docIds.indexOf(docId);
  const prevId = currentIdx > 0 ? docIds[currentIdx - 1] : null;
  const nextId = currentIdx >= 0 && currentIdx < docIds.length - 1 ? docIds[currentIdx + 1] : null;
  const st = STATUS_CONFIG[document.status] || STATUS_CONFIG.uploaded;

  const validBadge = document.status === 'completed' ? (
    document.validacion_ok === true  ? { label: '✓ Totales cuadran', color: '#bbf7d0', text: '#166534' } :
    document.validacion_ok === false ? { label: '⚠ Revisar totales', color: '#fde68a', text: '#78350f' } :
    null
  ) : null;

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
            {validBadge && (
              <button
                onClick={() => setShowValidation(v => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: validBadge.color, borderRadius: '99px',
                  padding: '2px 10px', fontSize: '11px', fontWeight: 700,
                  color: validBadge.text, letterSpacing: '0.01em',
                  border: 'none', cursor: 'pointer',
                }}
                title="Ver detalle de validación"
              >
                {validBadge.label}
              </button>
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

      {/* ── Validation detail panel ──────────────────────────────── */}
      {showValidation && validacion && (
        <div className="card" style={{ marginBottom: '14px', borderColor: document.validacion_ok ? '#bbf7d0' : '#fde68a' }}>
          <div
            className="card-header"
            style={{ cursor: 'pointer', background: document.validacion_ok ? '#f0fdf4' : '#fffbeb' }}
            onClick={() => setShowValidation(false)}
          >
            <span style={{ fontWeight: 700, color: document.validacion_ok ? '#166534' : '#78350f' }}>
              {document.validacion_ok ? '✓ Validación de totales — cuadran' : '⚠ Validación de totales — revisar'}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-3)', fontWeight: 400 }}>▲ Cerrar</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Numbers row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {[
                { label: 'Base calculada', value: validacion.base_calculada != null ? `${validacion.base_calculada.toFixed(2)} €` : '—' },
                { label: 'Base documento', value: validacion.base_imponible_doc != null ? `${validacion.base_imponible_doc.toFixed(2)} €` : '—' },
                { label: 'IVA documento', value: document.total_iva_doc != null ? `${document.total_iva_doc.toFixed(2)} €` : '—' },
                { label: 'Recargo equiv.', value: document.total_recargo_doc != null ? `${document.total_recargo_doc.toFixed(2)} €` : '—' },
                { label: 'Total documento', value: document.total_doc != null ? `${document.total_doc.toFixed(2)} €` : '—' },
                { label: 'Diferencia base', value: validacion.diferencia != null ? `${validacion.diferencia > 0 ? '+' : ''}${validacion.diferencia.toFixed(2)} €` : '—', highlight: validacion.diferencia != null && Math.abs(validacion.diferencia) > 0.5 },
              ].map(({ label, value, highlight }) => (
                <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: '10px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: highlight ? '#dc2626' : 'var(--text-1)' }}>{value}</div>
                </div>
              ))}
            </div>
            {/* Notes */}
            {validacion.notas && (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-2)' }}>{validacion.notas}</p>
            )}
            {/* Discrepancies */}
            {validacion.discrepancias && validacion.discrepancias.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Discrepancias detectadas</div>
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {validacion.discrepancias.map((d: string, i: number) => (
                    <li key={i} style={{ fontSize: '13px', color: '#78350f' }}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

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
