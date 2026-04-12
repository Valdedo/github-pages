import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCatalog, getCatalogFamilies,
  downloadCatalogTreyFact, downloadCatalogPriceList,
} from '../api/client';
import type { CatalogArticle } from '../types';

type SortKey = 'descripcion' | 'pvp_con_iva' | 'margen_pct' | 'supplier_name' | 'doc_date';

export function CatalogPage() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<CatalogArticle[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [familia, setFamilia] = useState('');
  const [dlTF, setDlTF] = useState(false);
  const [dlPL, setDlPL] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('descripcion');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, famRes] = await Promise.all([
        getCatalog({ q: q || undefined, familia: familia || undefined }),
        getCatalogFamilies(),
      ]);
      setArticles(catRes.data);
      setFamilies(famRes.data);
    } finally {
      setLoading(false);
    }
  }, [q, familia]);

  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const handleDl = (setter: (v: boolean) => void, fn: () => void) => {
    setter(true);
    fn();
    setTimeout(() => setter(false), 3000);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...articles].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'es');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const fmt = (v: number) => v.toFixed(2).replace('.', ',') + ' €';

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className={`sort-icon ${sortKey === col ? sortDir : ''}`}>
      {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <div className="page-wide">
      {/* Header */}
      <div className="doc-page-hero" style={{ marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 800, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            📚 Catálogo de artículos
          </h1>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
            Vista unificada · precio más reciente de cada artículo
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            className="doc-hero-nav-btn"
            disabled={dlTF}
            onClick={() => handleDl(setDlTF, () => downloadCatalogTreyFact({ familia: familia || undefined, q: q || undefined }))}
            style={{ fontSize: '12px', padding: '5px 10px', width: 'auto' }}
            title="Exportar catálogo para TreyFact"
          >
            {dlTF ? <span className="spinner spinner-sm spinner-white" /> : '📥 TreyFact'}
          </button>
          <button
            className="doc-hero-nav-btn"
            disabled={dlPL}
            onClick={() => handleDl(setDlPL, () => downloadCatalogPriceList({ familia: familia || undefined, q: q || undefined }))}
            style={{ fontSize: '12px', padding: '5px 10px', width: 'auto' }}
            title="Exportar listín de precios PDF"
          >
            {dlPL ? <span className="spinner spinner-sm spinner-white" /> : '💶 Listín PDF'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-body" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px' }}>
          <div className="search-bar" style={{ flex: '1 1 220px', minWidth: 0 }}>
            <span className="search-bar-icon">🔍</span>
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Descripción, código, EAN…"
            />
            {q && <button className="search-bar-clear" onClick={() => setQ('')}>✕</button>}
          </div>
          <select
            value={familia}
            onChange={e => setFamilia(e.target.value)}
            style={{ flex: '0 1 180px', padding: '9px 10px', border: '1.5px solid var(--grey-300)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: '#fff' }}
          >
            <option value="">Todas las familias</option>
            {families.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <span style={{ fontSize: '12px', color: 'var(--text-3)', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {loading ? <><span className="spinner spinner-sm" /> Buscando…</> : `${articles.length} artículos`}
          </span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="card catalog-table">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#1F4E79' }}>
                {([
                  ['descripcion',  'Descripción',    'left'],
                  [null,           'Familia',         'left'],
                  [null,           'Código',          'left'],
                  [null,           'EAN',             'left'],
                  ['supplier_name','Proveedor',       'left'],
                  ['doc_date',     'Último albarán',  'left'],
                  [null,           'Coste',           'right'],
                  [null,           'PVP s/IVA',       'right'],
                  ['pvp_con_iva',  'PVP c/IVA',       'right'],
                  ['margen_pct',   'Margen',          'right'],
                  [null,           '',                'center'],
                ] as [SortKey | null, string, string][]).map(([col, label, align]) => (
                  <th
                    key={label}
                    onClick={col ? () => handleSort(col) : undefined}
                    className={col ? 'th-sortable' : undefined}
                    style={{
                      padding: '9px 10px', textAlign: align as 'left' | 'right' | 'center',
                      color: '#fff', fontWeight: 700, fontSize: '11px',
                      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}
                  >
                    {label}{col && <SortIcon col={col} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} style={{ padding: '10px' }}>
                        <span className="skeleton skeleton-line" style={{ width: j === 0 ? '80%' : '60%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>
                  {q || familia ? 'No hay resultados para esta búsqueda.' : 'El catálogo está vacío. Procesa albaranes para poblar el catálogo.'}
                </td></tr>
              ) : sorted.map((art, i) => (
                <tr
                  key={art.id}
                  style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff', cursor: 'pointer' }}
                  onClick={() => navigate(`/documento/${art.document_id}`)}
                >
                  <td style={{ padding: '9px 10px', maxWidth: '240px' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={art.descripcion}>
                      {art.descripcion}
                    </span>
                  </td>
                  <td style={{ padding: '9px 10px' }}>
                    {art.familia
                      ? <span style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: '99px', padding: '1px 8px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>{art.familia}</span>
                      : <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 10px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {art.codigo_principal || art.codigo_fabricante || art.codigo_proveedor || '—'}
                  </td>
                  <td style={{ padding: '9px 10px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {art.ean || '—'}
                  </td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-2)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {art.supplier_name || '—'}
                  </td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-3)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {art.doc_date || '—'}
                    {art.doc_number && <span style={{ marginLeft: '4px' }}>#{art.doc_number}</span>}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-2)', fontSize: '12px' }}>
                    {fmt(art.coste_neto_unitario)}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>
                    {fmt(art.pvp_sin_iva)}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>
                    {fmt(art.pvp_con_iva)}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-2)', fontSize: '12px' }}>
                    {art.margen_pct.toFixed(1)}%
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={e => { e.stopPropagation(); navigate(`/documento/${art.document_id}`); }}
                    >Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="catalog-cards">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <span className="skeleton skeleton-line-lg" style={{ width: '75%' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="skeleton skeleton-line-sm" style={{ width: '70px' }} />
                <span className="skeleton skeleton-line-sm" style={{ width: '90px' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="skeleton skeleton-line" style={{ flex: 1, height: '40px' }} />
                <span className="skeleton skeleton-line" style={{ flex: 1, height: '40px' }} />
              </div>
            </div>
          ))
        ) : sorted.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-text">
              {q || familia ? 'Sin resultados' : 'El catálogo está vacío'}
            </div>
          </div>
        ) : sorted.map(art => (
          <div
            key={art.id}
            onClick={() => navigate(`/documento/${art.document_id}`)}
            style={{
              background: '#fff', borderRadius: 'var(--r-xl)', border: '1px solid var(--border)',
              padding: '14px 16px', cursor: 'pointer',
              boxShadow: 'var(--shadow-xs)', display: 'flex', flexDirection: 'column', gap: '10px',
            }}
          >
            {/* Title + chips */}
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', lineHeight: 1.3, marginBottom: '6px' }}>
                {art.descripcion}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {art.familia && (
                  <span style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: '99px', padding: '1px 8px', fontSize: '11px', fontWeight: 600 }}>
                    {art.familia}
                  </span>
                )}
                {(art.codigo_principal || art.codigo_fabricante) && (
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', background: '#f1f5f9', color: '#475569', borderRadius: '5px', padding: '1px 7px' }}>
                    {art.codigo_principal || art.codigo_fabricante}
                  </span>
                )}
                {art.supplier_name && (
                  <span style={{ fontSize: '11px', color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: '5px', padding: '1px 7px' }}>
                    {art.supplier_name}
                  </span>
                )}
              </div>
            </div>

            {/* Price band */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>PVP s/IVA</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '14px' }}>{fmt(art.pvp_sin_iva)}</div>
              </div>
              <div style={{ background: '#f0fdf4', borderRadius: 'var(--r)', padding: '8px 10px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '10px', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>PVP c/IVA · {art.margen_pct.toFixed(0)}%</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '16px', color: '#166534' }}>{fmt(art.pvp_con_iva)}</div>
              </div>
            </div>

            {/* Footer: date */}
            {art.doc_date && (
              <div style={{ fontSize: '11px', color: 'var(--text-3)', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                Último albarán: {art.doc_date}{art.doc_number ? ` · #${art.doc_number}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
