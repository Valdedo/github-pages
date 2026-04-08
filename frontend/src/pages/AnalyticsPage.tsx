import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPriceHistory, getSupplierComparison, getTopProducts } from '../api/client';
import type { PriceHistoryEntry, SupplierComparisonEntry, TopProduct } from '../types';

const fmt2 = (n: number | null | undefined) => n == null ? '—' : n.toFixed(2) + ' €';
const fmtPct = (n: number | null | undefined) => n == null ? '—' : n.toFixed(1) + '%';

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'top' | 'search'>('top');
  const [searchCode, setSearchCode] = useState('');
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [comparison, setComparison] = useState<SupplierComparisonEntry[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const loadTop = async () => {
    if (topProducts) return;
    setLoading(true);
    try {
      const { data } = await getTopProducts(50);
      setTopProducts(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    const code = searchCode.trim();
    if (!code) return;
    setLoading(true);
    setSearched(false);
    try {
      const [{ data: hist }, { data: comp }] = await Promise.all([
        getPriceHistory(code),
        getSupplierComparison(code),
      ]);
      setHistory(hist);
      setComparison(comp);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  // Load top products when tab is selected
  const switchTab = (t: typeof tab) => {
    setTab(t);
    if (t === 'top') loadTop();
  };

  const productName = history[0]?.descripcion ?? comparison[0]?.descripcion ?? '';

  return (
    <div className="page">
      {/* Header */}
      <div className="hero-card" style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, opacity: 0.7, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
          Análisis de compras
        </p>
        <div style={{ fontSize: '22px', fontWeight: 800, lineHeight: 1.2, marginBottom: '6px' }}>
          Historial de precios
        </div>
        <p style={{ fontSize: '13px', opacity: 0.75 }}>
          Evolución de costes y comparativa entre proveedores
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        <button
          className={`btn btn-sm ${tab === 'top' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => switchTab('top')}
        >
          Productos frecuentes
        </button>
        <button
          className={`btn btn-sm ${tab === 'search' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => switchTab('search')}
        >
          Buscar por código
        </button>
      </div>

      {/* ── TAB: Top products ── */}
      {tab === 'top' && (
        <div className="card">
          <div className="card-header">Artículos más comprados</div>
          <div className="card-body" style={{ padding: 0 }}>
            {loading && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>}
            {!loading && topProducts && topProducts.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)' }}>
                Aún no hay suficientes datos. Procesa más albaranes.
              </div>
            )}
            {!loading && topProducts && topProducts.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {['Código', 'Descripción', 'Albaranes', 'Proveedores', 'Coste medio', 'PVP medio'].map(h => (
                        <th key={h} style={{
                          padding: '8px 10px', background: 'var(--surface-2)', color: 'var(--text-2)',
                          fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
                          textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={p.codigo_principal}
                        style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', cursor: 'pointer' }}
                        onClick={() => { setTab('search'); setSearchCode(p.codigo_principal); setTimeout(handleSearch, 50); }}
                      >
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-2)' }}>
                          {p.codigo_principal}
                        </td>
                        <td style={{ padding: '7px 10px', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.descripcion}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <span style={{ background: 'var(--brand-light)', color: 'var(--brand-dark)', borderRadius: '99px', padding: '2px 8px', fontWeight: 700, fontSize: '12px' }}>
                            {p.num_documentos}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center', color: 'var(--text-2)' }}>
                          {p.num_proveedores}
                        </td>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--text-2)' }}>
                          {fmt2(p.coste_avg)}
                        </td>
                        <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--brand)' }}>
                          {fmt2(p.pvp_avg)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Search ── */}
      {tab === 'search' && (
        <>
          {/* Search input */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-body">
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={searchCode}
                  onChange={e => setSearchCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="EAN, código de proveedor, código fabricante…"
                  style={{
                    flex: 1, padding: '9px 12px',
                    border: '1.5px solid var(--border)', borderRadius: '8px',
                    fontSize: '14px', fontFamily: 'inherit', outline: 'none',
                  }}
                />
                <button className="btn btn-primary" onClick={handleSearch} disabled={loading || !searchCode.trim()}>
                  {loading ? '⏳' : 'Buscar'}
                </button>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '6px' }}>
                Busca el historial de precios de un artículo por su código.
                También puedes hacer clic en cualquier fila de "Productos frecuentes".
              </p>
            </div>
          </div>

          {searched && history.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)' }}>
              No se encontró ningún artículo con ese código.
            </div>
          )}

          {searched && history.length > 0 && (
            <>
              {/* Product title */}
              <div style={{ marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                  {productName}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                  Código: {searchCode} · {history.length} aparición{history.length !== 1 ? 'es' : ''} en {new Set(history.map(h => h.document_id)).size} albarán{new Set(history.map(h => h.document_id)).size !== 1 ? 'es' : ''}
                </p>
              </div>

              {/* Supplier comparison */}
              {comparison.length > 1 && (
                <div className="card" style={{ marginBottom: '14px' }}>
                  <div className="card-header">
                    Comparativa entre proveedores
                    {comparison.length > 1 && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 500, color: 'var(--brand)', background: 'var(--brand-light)', padding: '2px 8px', borderRadius: '99px' }}>
                        más barato: {comparison[0].supplier_name}
                      </span>
                    )}
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            {['Proveedor', 'Compras', 'Coste mín.', 'Coste med.', 'Coste máx.', 'PVP med.', 'Última compra'].map((h, i) => (
                              <th key={h} style={{
                                padding: '8px 10px', background: 'var(--surface-2)', color: 'var(--text-2)',
                                fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
                                textAlign: i > 0 ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.map((c, i) => (
                            <tr key={c.supplier_name} style={{ background: i === 0 ? 'var(--brand-pale)' : (i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)') }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                                {i === 0 && <span style={{ color: 'var(--brand)', marginRight: '4px' }}>★</span>}
                                {c.supplier_name || '—'}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-2)' }}>{c.num_compras}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--brand-dark)', fontWeight: 600 }}>{fmt2(c.coste_min)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt2(c.coste_avg)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-2)' }}>{fmt2(c.coste_max)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--brand)', fontWeight: 700 }}>{fmt2(c.pvp_avg)}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-3)', fontSize: '12px' }}>
                                {c.ultima_compra ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Price history */}
              <div className="card">
                <div className="card-header">Historial de precios</div>
                <div className="card-body" style={{ padding: 0 }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr>
                          {['Fecha', 'Proveedor', 'Albarán', 'Cant.', 'P.Bruto', 'Coste neto', 'Margen', 'PVP c/IVA'].map((h, i) => (
                            <th key={h} style={{
                              padding: '8px 10px', background: 'var(--surface-2)', color: 'var(--text-2)',
                              fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
                              textAlign: i > 2 ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h, i) => (
                          <tr key={h.article_id}
                            style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', cursor: 'pointer' }}
                            onClick={() => navigate(`/documento/${h.document_id}`)}
                            title="Abrir albarán"
                          >
                            <td style={{ padding: '7px 10px', color: 'var(--text-2)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                              {h.doc_date ?? new Date(h.created_at).toLocaleDateString('es-ES')}
                            </td>
                            <td style={{ padding: '7px 10px', fontWeight: 500 }}>{h.supplier_name || '—'}</td>
                            <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: '12px' }}>{h.doc_number || '—'}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-2)' }}>{h.cantidad}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-2)' }}>{fmt2(h.precio_unitario_bruto)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt2(h.coste_neto_unitario)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-2)' }}>{fmtPct(h.margen_pct)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--brand)' }}>
                              {fmt2(h.pvp_con_iva)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
