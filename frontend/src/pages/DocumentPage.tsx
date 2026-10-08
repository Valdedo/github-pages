import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument, listSuppliers, listDocuments, recalculateArticles, updateArticle, getPriceAlerts, deleteDocument, describeApiError } from '../api/client';
import { ArrowLeft, AlertTriangle, X } from 'lucide-react';
import { DocAcciones } from '../components/DocAcciones';
import { DocumentPreview } from '../components/DocumentPreview';
import { MetadataPanel } from '../components/MetadataPanel';
import { ArticleTable } from '../components/ArticleTable';
import { DriveEstado } from '../components/DriveEstado';
import { TotalsPanel } from '../components/TotalsPanel';
import { useToast } from '../components/Toast';
import type { Document, Article, Supplier, PriceAlert } from '../types/index';
import { fechaES, ORDEN_ALBARANES } from '../lib/texto';

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  uploaded:   { label: 'Subido',       dot: 'var(--text-3)' },
  processing: { label: 'Procesando',   dot: 'var(--warning)' },
  completed:  { label: 'Completado',   dot: 'var(--brand)' },
  error:      { label: 'Error',        dot: 'var(--danger)' },
};

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const docId = Number(id);

  const [document, setDocument] = useState<Document | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [polling, setPolling] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [docIds, setDocIds] = useState<number[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [verificationMode, setVerificationMode] = useState(false);
  const [verifiedIds, setVerifiedIds] = useState<Set<number>>(new Set());
  const [scanInput, setScanInput] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [assigningBarcode, setAssigningBarcode] = useState<string | null>(null); // barcode pending assignment
  const [assignSearch, setAssignSearch] = useState('');
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(true);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const assignSearchRef = useRef<HTMLInputElement>(null);

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

  const handleScan = useCallback((barcode: string) => {
    const clean = barcode.trim();
    if (!clean) return;
    setScanInput('');

    const match = articles.find(a =>
      (a.ean && a.ean === clean) ||
      (a.codigo_principal && a.codigo_principal === clean) ||
      (a.codigo_proveedor && a.codigo_proveedor === clean) ||
      (a.codigo_fabricante && a.codigo_fabricante === clean)
    );

    if (match) {
      setVerifiedIds(prev => new Set([...prev, match.id]));
      setScanFeedback({ msg: `✓ ${match.descripcion.slice(0, 50)}`, ok: true });
      setTimeout(() => { setScanFeedback(null); scanInputRef.current?.focus(); }, 1500);
    } else {
      // Unknown barcode → open assignment picker
      setAssigningBarcode(clean);
      setAssignSearch('');
      setTimeout(() => assignSearchRef.current?.focus(), 80);
    }
  }, [articles]);

  const handleAssign = useCallback(async (articleId: number) => {
    if (!assigningBarcode) return;
    try {
      const { data } = await updateArticle(articleId, { ean: assigningBarcode });
      setArticles(prev => prev.map(a => a.id === articleId ? data : a));
      setVerifiedIds(prev => new Set([...prev, articleId]));
      setScanFeedback({ msg: `✓ EAN guardado y artículo verificado`, ok: true });
    } catch {
      setScanFeedback({ msg: 'Error al guardar el EAN', ok: false });
    }
    setAssigningBarcode(null);
    setAssignSearch('');
    setTimeout(() => { setScanFeedback(null); scanInputRef.current?.focus(); }, 1800);
  }, [assigningBarcode]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const [docStatus] = await Promise.all([
        loadDocument(),
        listSuppliers().then(r => setSuppliers(r.data)).catch(() => {}),
        listDocuments().then(r => {
          // Mismo orden que la lista de albaranes que se estaba viendo (pestaña y búsqueda)
          let orden: number[] = [];
          try { orden = JSON.parse(sessionStorage.getItem(ORDEN_ALBARANES) || '[]'); } catch { orden = []; }
          setDocIds(Array.isArray(orden) && orden.includes(docId) ? orden : r.data.map((d: { id: number }) => d.id));
        }).catch(() => {}),
      ]);
      setLoading(false);
      // Load price alerts if document is already completed
      if (docStatus === 'completed') {
        getPriceAlerts(docId).then(({ data }) => {
          if (data.length > 0) setPriceAlerts(data);
        }).catch(() => {});
      }
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
          if (status === 'completed') {
            showToast('Extracción completada', 'success');
            // Load price alerts for this document
            getPriceAlerts(docId).then(({ data }) => {
              if (data.length > 0) setPriceAlerts(data);
            }).catch(() => {});
          } else if (status === 'error') {
            showToast('Error en la extracción — ver detalle abajo', 'error');
          }
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
        <span className="spinner spinner-lg" style={{ marginBottom: '16px' }} />
        <div className="empty-state-text">Cargando albarán…</div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="empty-state" style={{ paddingTop: '80px' }}>
        {loadFailed ? (
          <>
            
            <div className="empty-state-text">Documento no encontrado.</div>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => navigate('/albaranes')}>← Volver a albaranes</button>
          </>
        ) : (
          <>
            <span className="spinner spinner-lg" style={{ marginBottom: '16px' }} />
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
    document.validacion_ok === true  ? { label: 'Los totales cuadran', color: 'var(--brand-light)', text: 'var(--cf-bosque)' } :
    document.validacion_ok === false ? { label: 'Revisar totales', color: '#FDE9C2', text: '#6B4100' } :
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
            <button className="doc-volver" onClick={() => navigate('/albaranes')}><ArrowLeft size={16} /> Albaranes</button>
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
            margin: '0 0 8px',
            lineHeight: 1.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {document.supplier_name || document.original_filename}
          </h1>

          {/* Chips row */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {document.supplier_name && (
              <span className="doc-hero-chip" title={document.original_filename}>{document.original_filename}</span>
            )}
            {document.doc_number && (
              <span className="doc-hero-chip">Nº {document.doc_number}</span>
            )}
            {document.doc_date && (
              <span className="doc-hero-chip">{fechaES(document.doc_date)}</span>
            )}
            {document.status !== 'completed' && <span className="doc-hero-chip">{st.label}</span>}
            {polling && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-3)' }}>
                <span className="spinner spinner-sm" />
                Extrayendo artículos…
              </span>
            )}
            {validBadge && (
              <button
                onClick={() => setShowValidation(v => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: validBadge.color, borderRadius: '4px',
                  padding: '2px 10px', fontSize: '11px', fontWeight: 600,
                  color: validBadge.text, letterSpacing: '0',
                  border: 'none', cursor: 'pointer',
                }}
                title="Ver detalle de validación"
              >
                {validBadge.label}
              </button>
            )}
          </div>
        </div>

        {/* Right: article count + actions */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--text-1)' }}>
              {articles.length}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>
              artículos
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="doc-hero-nav-btn"
              onClick={() => setShowPreview(p => !p)}
              title={showPreview ? 'Ocultar imagen original' : 'Ver imagen original'}
              style={{ fontSize: '13px', width: 'auto', padding: '4px 10px' }}
            >
              {showPreview ? 'Ocultar' : 'Ver doc'}
            </button>
            {document.status === 'completed' && articles.length > 0 && (
              <button
                className="doc-hero-nav-btn"
                onClick={() => { setVerificationMode(v => !v); setVerifiedIds(new Set()); setScanInput(''); setScanFeedback(null); }}
                title="Verificar artículos escaneando códigos de barras"
                style={{ fontSize: '13px', width: 'auto', padding: '4px 10px', background: verificationMode ? 'var(--brand-pale)' : undefined, borderColor: verificationMode ? 'var(--brand-light)' : undefined, color: verificationMode ? 'var(--brand-dark)' : undefined }}
              >
                {verificationMode ? 'Salir' : 'Verificar'}
              </button>
            )}
          </div>
        </div>
      </div>

      <DriveEstado doc={document} />

      {(document.status === 'completed' || document.status === 'error') && (
        <DocAcciones
          document={document}
          suppliers={suppliers}
          selectedArticleIds={selectedIds}
          articleCount={articles.length}
          onChanged={d => setDocument(prev => prev ? { ...prev, ...d } : prev)}
          onReload={loadDocument}
          onReprocessed={() => { setArticles([]); loadDocument(); }}
          onDelete={async () => {
            if (!window.confirm('¿Borrar este albarán y todos sus artículos? No se puede deshacer.')) return;
            try { await deleteDocument(docId); navigate('/albaranes'); }
            catch (e) { showToast(`No se pudo borrar: ${describeApiError(e)}`, 'error'); }
          }}
          onToast={showToast}
        />
      )}

      {/* ── No se pudo leer ─────────────────────────────────────── */}
      {document.status === 'error' && (
        <div className="doc-aviso error">
          <AlertTriangle size={20} />
          <div>
            <b>No se pudo leer este albarán</b>
            <span>Prueba a volverlo a leer desde «Más» → «Volver a leer». Si sigue fallando, sube una foto más clara o el PDF original.</span>
            {document.error_message && <details><summary>Detalle del error</summary><code>{document.error_message}</code></details>}
          </div>
        </div>
      )}

      {/* ── Subidas de coste ─────────────────────────────────────── */}
      {priceAlerts.length > 0 && showAlerts && (
        <div className="doc-aviso subidas">
          <AlertTriangle size={20} />
          <div>
            <b>Ha subido el coste de {priceAlerts.length} artículo{priceAlerts.length !== 1 ? 's' : ''}</b>
            <span>Revisa su precio de venta antes de pasarlo a TreyFACT.</span>
            <ul>
              {priceAlerts.map(a => (
                <li key={a.article_id}>
                  <span>{a.descripcion}</span>
                  <span className="doc-subida"><s>{a.coste_anterior.toFixed(2)} €</s> → <b>{a.coste_actual.toFixed(2)} €</b> (+{a.pct_cambio.toFixed(0)} %)</span>
                </li>
              ))}
            </ul>
          </div>
          <button className="doc-aviso-cerrar" onClick={() => setShowAlerts(false)} aria-label="Cerrar"><X size={18} /></button>
        </div>
      )}

      {/* ── Validation detail panel ──────────────────────────────── */}
      {showValidation && validacion && (
        <div className="card" style={{ marginBottom: '14px', borderColor: document.validacion_ok ? 'var(--brand-light)' : '#fde68a' }}>
          <div
            className="card-header"
            style={{ cursor: 'pointer', background: document.validacion_ok ? 'var(--brand-pale)' : '#FFF4E5' }}
            onClick={() => setShowValidation(false)}
          >
            <span style={{ fontWeight: 700, color: document.validacion_ok ? 'var(--cf-bosque)' : '#6B4100' }}>
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
                    <li key={i} style={{ fontSize: '13px', color: '#6B4100' }}>{d}</li>
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
            <span>{document.original_filename}</span>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-3)', fontWeight: 400 }}>▲ Ocultar</span>
          </div>
          <div style={{ height: '500px' }}>
            <DocumentPreview document={document} />
          </div>
        </div>
      )}

      {/* ── Verification mode panel ──────────────────────────────── */}
      {verificationMode && (
        <div style={{
          background: 'var(--brand-pale)', border: '2px solid var(--cf-verde)', borderRadius: 'var(--r)',
          padding: '16px', marginBottom: '14px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--cf-bosque)' }}>
              Verificando recepción
            </span>
            <span style={{
              background: verifiedIds.size === articles.length && articles.length > 0 ? 'var(--cf-verde)' : 'var(--brand-light)',
              color: 'var(--cf-bosque-2)', borderRadius: '99px', padding: '2px 10px',
              fontSize: '13px', fontWeight: 700,
            }}>
              {verifiedIds.size} / {articles.length}
            </span>
            {verifiedIds.size > 0 && (
              <button
                style={{ marginLeft: 'auto', fontSize: '12px', background: 'none', border: '1px solid var(--brand-light)', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', color: 'var(--cf-bosque)' }}
                onClick={() => setVerifiedIds(new Set())}
              >↺ Reiniciar</button>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ background: 'var(--brand-pale)', borderRadius: '99px', height: '8px', marginBottom: '12px', overflow: 'hidden' }}>
            <div style={{
              background: 'var(--cf-verde)', height: '8px', borderRadius: '99px',
              width: `${articles.length ? (verifiedIds.size / articles.length * 100) : 0}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>

          {/* Assignment picker — shown when a scanned barcode is unknown */}
          {assigningBarcode ? (
            <div style={{ background: '#FFF4E5', border: '2px solid #f59e0b', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#92400e', marginBottom: '4px' }}>
                Código desconocido: <span style={{ fontFamily: 'monospace' }}>{assigningBarcode}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#6B4100', marginBottom: '10px' }}>
                Toca el artículo al que corresponde este código — quedará guardado para la próxima vez.
              </div>
              <input
                ref={assignSearchRef}
                type="text"
                value={assignSearch}
                placeholder="Filtrar artículos…"
                onChange={e => setAssignSearch(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #fcd34d', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '8px' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto' }}>
                {articles
                  .filter(a => !verifiedIds.has(a.id))
                  .filter(a => !assignSearch || a.descripcion.toLowerCase().includes(assignSearch.toLowerCase()))
                  .map(a => (
                    <button
                      key={a.id}
                      onClick={() => handleAssign(a.id)}
                      style={{
                        textAlign: 'left', padding: '10px 12px', borderRadius: '8px',
                        border: '1.5px solid #fcd34d', background: '#fff',
                        cursor: 'pointer', fontSize: '13px', lineHeight: 1.3,
                      }}
                    >
                      <strong>{a.descripcion}</strong>
                      {a.codigo_principal && <span style={{ color: '#9ca3af', marginLeft: '8px', fontSize: '11px' }}>{a.codigo_principal}</span>}
                    </button>
                  ))}
                {articles.filter(a => !verifiedIds.has(a.id)).length === 0 && (
                  <div style={{ fontSize: '13px', color: '#6b7280', padding: '8px' }}>Todos los artículos ya están verificados.</div>
                )}
              </div>
              <button
                onClick={() => { setAssigningBarcode(null); setAssignSearch(''); setTimeout(() => scanInputRef.current?.focus(), 80); }}
                style={{ marginTop: '10px', fontSize: '12px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >Cancelar — saltar este código</button>
            </div>
          ) : (
            <>
              {/* Normal scan input */}
              <input
                ref={scanInputRef}
                type="text"
                inputMode="numeric"
                value={scanInput}
                placeholder="Lee el código de barras de cada artículo…"
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(scanInput); }}
                autoFocus
                style={{
                  width: '100%', padding: '13px 16px', fontSize: '18px',
                  border: '2px solid var(--cf-verde)', borderRadius: '10px',
                  fontFamily: 'monospace', boxSizing: 'border-box',
                  background: '#fff', marginBottom: '8px',
                }}
              />
              {/* Feedback / status */}
              {scanFeedback ? (
                <div style={{
                  padding: '9px 14px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                  background: scanFeedback.ok ? 'var(--brand-pale)' : '#fee2e2',
                  color: scanFeedback.ok ? 'var(--cf-bosque)' : '#dc2626',
                }}>
                  {scanFeedback.msg}
                </div>
              ) : verifiedIds.size === articles.length && articles.length > 0 ? (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--brand-pale)', fontWeight: 700, color: 'var(--cf-bosque)', fontSize: '15px', textAlign: 'center' }}>
                  ✓ ¡Todos los artículos verificados!
                </div>
              ) : verifiedIds.size > 0 ? (
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  <strong style={{ color: '#374151' }}>Pendientes ({articles.filter(a => !verifiedIds.has(a.id)).length}):</strong>{' '}
                  {articles.filter(a => !verifiedIds.has(a.id)).map(a => a.descripcion).join(' · ').slice(0, 150)}…
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Escanea cada artículo. Si el código no está registrado, podrás asignarlo al artículo correcto y se guardará para siempre.
                </div>
              )}
            </>
          )}
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
          verifiedIds={verificationMode ? verifiedIds : undefined}
          onVerify={verificationMode ? (id) => setVerifiedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          }) : undefined}
        />

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
