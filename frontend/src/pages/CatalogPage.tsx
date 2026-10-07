import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Download, FileText, BookOpen } from 'lucide-react';
import {
  getCatalog, getCatalogFamilies,
  downloadCatalogTreyFact, downloadCatalogPriceList, describeApiError,
} from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { ES_MANUAL, nombreProveedor } from '../lib/proveedor';
import type { CatalogArticle } from '../types';

type SortKey = 'descripcion' | 'pvp_con_iva' | 'margen_pct' | 'supplier_name' | 'doc_date';

const eur = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fecha = (d?: string | null) => {
  if (!d) return '';
  const [y, m, dd] = d.split('T')[0].split('-');
  return dd ? `${dd}/${m}/${y}` : d;
};

export function CatalogPage() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<CatalogArticle[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncado, setTruncado] = useState<string | null>(null);
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
      setTruncado(catRes.headers?.['x-truncated-count'] ?? null);
      setError(null);
    } catch (err) {
      setError(describeApiError(err));
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
    else { setSortKey(key); setSortDir(key === 'doc_date' ? 'desc' : 'asc'); }
  };

  const sorted = [...articles].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'es');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const Th = ({ col, children, num }: { col?: SortKey; children: React.ReactNode; num?: boolean }) => (
    <th className={`${num ? 'num' : ''}${col ? ' ordenable' : ''}${col && sortKey === col ? ' on' : ''}`}
      onClick={col ? () => handleSort(col) : undefined}
      aria-sort={col && sortKey === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {children}{col && <span className="orden">{sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}</span>}
    </th>
  );

  const codigo = (a: CatalogArticle) => a.codigo_principal || a.codigo_fabricante || a.codigo_proveedor || '';

  return (
    <div className="page-wide">
      {error && <ConnectionError message={error} onRetry={load} />}

      <div className="inicio-head" style={{ marginBottom: 14 }}>
        <div>
          <h1>Catálogo</h1>
          <p>Todos los artículos de los albaranes de proveedor, con su precio más reciente.</p>
        </div>
        <div className="cab-botones">
          <button className="btn btn-ghost" disabled={dlPL}
            onClick={() => handleDl(setDlPL, () => downloadCatalogPriceList({ familia: familia || undefined, q: q || undefined }))}>
            {dlPL ? <span className="spinner spinner-sm" /> : <FileText size={17} />} Listín de precios
          </button>
          <button className="btn btn-ghost" disabled={dlTF}
            onClick={() => handleDl(setDlTF, () => downloadCatalogTreyFact({ familia: familia || undefined, q: q || undefined }))}>
            {dlTF ? <span className="spinner spinner-sm" /> : <Download size={17} />} Para TreyFACT
          </button>
        </div>
      </div>

      <div className="cat-filtros">
        <div className="search-bar" style={{ flex: '1 1 260px', minWidth: 0 }}>
          <Search size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input type="text" enterKeyHint="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, código o EAN…" aria-label="Buscar en el catálogo" />
          {q && <button className="search-bar-clear" onClick={() => setQ('')} aria-label="Borrar búsqueda"><X size={16} /></button>}
        </div>
        {families.length > 0 && (
          <select className="form-input cat-familia" value={familia} onChange={e => setFamilia(e.target.value)} aria-label="Familia">
            <option value="">Todas las familias</option>
            {families.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
        <span className="cat-cuenta">{loading ? 'Buscando…' : `${articles.length} artículo${articles.length !== 1 ? 's' : ''}`}</span>
      </div>

      {truncado && !loading && (
        <div className="doc-aviso subidas">Solo se muestran {articles.length} de {truncado}. Afina la búsqueda para ver el resto.</div>
      )}

      {!loading && sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><BookOpen size={38} style={{ color: 'var(--text-3)' }} /></div>
          <div className="empty-state-text">
            {q || familia ? 'No hay nada con esa búsqueda.' : 'El catálogo se llena solo al leer albaranes de proveedor.'}
          </div>
        </div>
      ) : (
        <>
          {/* PC: tabla */}
          <div className="card catalog-table cf-tabla-caja">
            <table className="cf-tabla">
              <thead>
                <tr>
                  <Th col="descripcion">Artículo</Th>
                  <Th>Código</Th>
                  <Th col="supplier_name">Proveedor</Th>
                  <Th col="doc_date">Último albarán</Th>
                  <Th num>Coste</Th>
                  <Th num>PVP sin IVA</Th>
                  <Th col="pvp_con_iva" num>PVP con IVA</Th>
                  <Th col="margen_pct" num>Margen</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                    <td key={j}><span className="skeleton skeleton-line" style={{ width: j === 0 ? '80%' : '60%' }} /></td>
                  ))}</tr>
                )) : sorted.map(art => (
                  <tr key={art.id} onClick={() => !ES_MANUAL(art.supplier_name) && navigate(`/documento/${art.document_id}`)} title={ES_MANUAL(art.supplier_name) ? undefined : 'Abrir el albarán'}>
                    <td className="cat-nombre">
                      <b title={art.descripcion}>{art.descripcion}</b>
                      {art.familia && <span className="cat-chip">{art.familia}</span>}
                    </td>
                    <td className="cat-codigo">
                      {codigo(art) || '—'}
                      {art.ean && art.ean !== codigo(art) && <small>{art.ean}</small>}
                    </td>
                    <td className="cat-prov"><span title={nombreProveedor(art.supplier_name)}>{nombreProveedor(art.supplier_name) || '—'}</span></td>
                    <td className="cat-fecha">{fecha(art.doc_date) || '—'}{art.doc_number && <small>N.º {art.doc_number}</small>}</td>
                    <td className="num suave">{eur(art.coste_neto_unitario)}</td>
                    <td className="num">{eur(art.pvp_sin_iva)}</td>
                    <td className="num fuerte">{eur(art.pvp_con_iva)}</td>
                    <td className="num suave">{art.margen_pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <div className="catalog-cards">
            {loading ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton-card">
                <span className="skeleton skeleton-line-lg" style={{ width: '75%' }} />
                <span className="skeleton skeleton-line" style={{ height: 40 }} />
              </div>
            )) : sorted.map(art => (
              <button key={art.id} className="card cat-tarjeta" onClick={() => !ES_MANUAL(art.supplier_name) && navigate(`/documento/${art.document_id}`)}>
                <b>{art.descripcion}</b>
                <span className="cat-tarjeta-meta">
                  {codigo(art) && <span className="cat-chip gris">{codigo(art)}</span>}
                  {art.familia && <span className="cat-chip">{art.familia}</span>}
                  {art.supplier_name && <span>{nombreProveedor(art.supplier_name)}</span>}
                </span>
                <span className="cat-precios">
                  <span><small>Sin IVA</small>{eur(art.pvp_sin_iva)}</span>
                  <span className="fuerte"><small>Con IVA</small>{eur(art.pvp_con_iva)}</span>
                </span>
                {art.doc_date && <small className="cat-tarjeta-pie">Último albarán: {fecha(art.doc_date)}{art.doc_number ? ` · N.º ${art.doc_number}` : ''}</small>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
