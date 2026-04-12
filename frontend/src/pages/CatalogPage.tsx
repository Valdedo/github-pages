import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getCatalog, getCatalogFamilies,
  downloadCatalogTreyFact, downloadCatalogPriceList,
} from '../api/client';
import type { CatalogArticle } from '../types';

export function CatalogPage() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<CatalogArticle[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [familia, setFamilia] = useState('');
  const [dlTF, setDlTF] = useState(false);
  const [dlPL, setDlPL] = useState(false);

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

  const fmt = (v: number) => v.toFixed(2).replace('.', ',') + ' €';

  return (
    <div className="page-wide">
      {/* Header */}
      <div className="doc-page-hero" style={{ marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 800, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            📚 Catálogo de artículos
          </h1>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
            Vista unificada de todos los artículos procesados — siempre el precio más reciente
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            className="doc-hero-nav-btn"
            disabled={dlTF}
            onClick={() => handleDl(setDlTF, () => downloadCatalogTreyFact({ familia: familia || undefined, q: q || undefined }))}
            style={{ fontSize: '12px', padding: '5px 10px' }}
            title="Exportar catálogo completo para TreyFact"
          >
            {dlTF ? '⏳' : '📥 TreyFact'}
          </button>
          <button
            className="doc-hero-nav-btn"
            disabled={dlPL}
            onClick={() => handleDl(setDlPL, () => downloadCatalogPriceList({ familia: familia || undefined, q: q || undefined }))}
            style={{ fontSize: '12px', padding: '5px 10px' }}
            title="Exportar listín de precios PDF"
          >
            {dlPL ? '⏳' : '💶 Listín PDF'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-body" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="🔍 Buscar por descripción, código, EAN…"
            style={{
              flex: '1 1 240px', padding: '9px 12px', border: '1.5px solid var(--grey-300)',
              borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit',
            }}
          />
          <select
            value={familia}
            onChange={e => setFamilia(e.target.value)}
            style={{
              flex: '0 1 180px', padding: '9px 10px', border: '1.5px solid var(--grey-300)',
              borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', background: '#fff',
            }}
          >
            <option value="">Todas las familias</option>
            {families.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <span style={{ fontSize: '12px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {loading ? 'Buscando…' : `${articles.length} artículos`}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#1F4E79' }}>
                {['Descripción', 'Familia', 'Código', 'EAN', 'Proveedor', 'Último albarán', 'Coste', 'PVP s/IVA', 'PVP c/IVA', 'Margen', ''].map(h => (
                  <th key={h} style={{
                    padding: '9px 10px', textAlign: 'left', color: '#fff',
                    fontWeight: 700, fontSize: '11px', textTransform: 'uppercase',
                    letterSpacing: '0.05em', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>Cargando…</td></tr>
              ) : articles.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>
                  {q || familia ? 'No hay resultados para esta búsqueda.' : 'El catálogo está vacío. Procesa albaranes para poblar el catálogo.'}
                </td></tr>
              ) : articles.map((art, i) => (
                <tr key={art.id} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff', cursor: 'pointer' }}
                  onClick={() => navigate(`/documento/${art.document_id}`)}>
                  <td style={{ padding: '8px 10px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span title={art.descripcion}>{art.descripcion}</span>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-3)' }}>
                    {art.familia ? (
                      <span style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: '99px', padding: '1px 8px', fontSize: '11px', fontWeight: 600 }}>
                        {art.familia}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-2)' }}>
                    {art.codigo_principal || art.codigo_fabricante || art.codigo_proveedor || '—'}
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-3)' }}>
                    {art.ean || '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-2)', fontSize: '12px' }}>
                    {art.supplier_name || '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-3)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {art.doc_date || '—'}
                    {art.doc_number && <span style={{ marginLeft: '4px', color: 'var(--text-3)' }}>#{art.doc_number}</span>}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-2)', fontSize: '12px' }}>
                    {fmt(art.coste_neto_unitario)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontSize: '12px' }}>
                    {fmt(art.pvp_sin_iva)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>
                    {fmt(art.pvp_con_iva)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-2)', fontSize: '12px' }}>
                    {art.margen_pct.toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px', fontSize: '11px' }}
                      onClick={e => { e.stopPropagation(); navigate(`/documento/${art.document_id}`); }}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
