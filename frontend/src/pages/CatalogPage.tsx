import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Download, FileText, BookOpen } from 'lucide-react';
import { getCatalog, getCatalogFamilies, describeApiError } from '../api/client';
import { descargar, rutaCatalogo } from '../lib/descargas';
import { coincide, fechaES, sinComodines } from '../lib/texto';
import { useCfToast } from '../components/CfToast';
import { ConnectionError } from '../components/ConnectionError';
import { ES_MANUAL, nombreProveedor } from '../lib/proveedor';
import type { CatalogArticle } from '../types';

type SortKey = 'descripcion' | 'pvp_con_iva' | 'margen_pct' | 'supplier_name' | 'doc_date';

const eur = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fecha = fechaES;

const ORDENES: { v: string; t: string; key: SortKey; dir: 'asc' | 'desc' }[] = [
  { v: 'descripcion-asc', t: 'Nombre (A-Z)', key: 'descripcion', dir: 'asc' },
  { v: 'pvp_con_iva-asc', t: 'Precio: de menor a mayor', key: 'pvp_con_iva', dir: 'asc' },
  { v: 'pvp_con_iva-desc', t: 'Precio: de mayor a menor', key: 'pvp_con_iva', dir: 'desc' },
  { v: 'margen_pct-desc', t: 'Margen: de mayor a menor', key: 'margen_pct', dir: 'desc' },
  { v: 'margen_pct-asc', t: 'Margen: de menor a mayor', key: 'margen_pct', dir: 'asc' },
  { v: 'supplier_name-asc', t: 'Proveedor', key: 'supplier_name', dir: 'asc' },
  { v: 'doc_date-desc', t: 'Último albarán: más reciente', key: 'doc_date', dir: 'desc' },
  { v: 'doc_date-asc', t: 'Último albarán: más antiguo', key: 'doc_date', dir: 'asc' },
];

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
  const [delServidor, setDelServidor] = useState<CatalogArticle[]>([]);
  const { toast, show } = useCfToast();

  // Se carga el catálogo (de la familia elegida) y la búsqueda se hace aquí,
  // sin distinguir tildes ni mayúsculas
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, famRes] = await Promise.all([
        getCatalog({ familia: familia || undefined, limit: 2000 }),
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
  }, [familia]);

  useEffect(() => { load(); }, [load]);

  // Si el catálogo no cabe entero, se pregunta también al servidor por la búsqueda
  useEffect(() => {
    const limpio = sinComodines(q);
    if (!truncado || !limpio) { setDelServidor([]); return; }
    const t = setTimeout(() => {
      getCatalog({ q: limpio, familia: familia || undefined, limit: 500 }).then(r => setDelServidor(r.data)).catch(() => setDelServidor([]));
    }, 350);
    return () => clearTimeout(t);
  }, [q, familia, truncado]);

  const visibles = useMemo(() => {
    if (!q.trim()) return articles;
    const res = articles.filter(a => coincide(q, a.descripcion, a.codigo_principal, a.ean, a.codigo_proveedor, a.codigo_fabricante, a.familia, nombreProveedor(a.supplier_name)));
    const ids = new Set(res.map(a => a.id));
    return res.concat(delServidor.filter(a => !ids.has(a.id)));
  }, [articles, q, delServidor]);

  const handleDl = async (setter: (v: boolean) => void, tipo: 'treyfact' | 'pricelist') => {
    setter(true);
    const p = descargar(rutaCatalogo(tipo, { familia: familia || undefined, q: sinComodines(q) || undefined }),
      tipo === 'treyfact' ? 'catalogo_treyfact.xlsx' : 'listin_catalogo.pdf');
    try { await p; }
    catch (e) { show(e instanceof Error ? e.message : 'No se pudo descargar', { error: true }); }
    finally { setter(false); }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'doc_date' ? 'desc' : 'asc'); }
  };

  const sorted = [...visibles].sort((a, b) => {
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
      {toast}
      {error && <ConnectionError message={error} onRetry={load} />}

      <div className="inicio-head" style={{ marginBottom: 14 }}>
        <div>
          <h1>Catálogo</h1>
          <p>Todos los artículos de los albaranes de proveedor, con su precio más reciente.</p>
        </div>
        <div className="cab-botones">
          <button className="btn btn-ghost" disabled={dlPL}
            onClick={() => handleDl(setDlPL, 'pricelist')}>
            {dlPL ? <span className="spinner spinner-sm" /> : <FileText size={17} />} Listín de precios
          </button>
          <button className="btn btn-ghost" disabled={dlTF}
            onClick={() => handleDl(setDlTF, 'treyfact')}>
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
        <select className="form-input cat-orden-movil" value={`${sortKey}-${sortDir}`} aria-label="Ordenar"
          onChange={e => { const o = ORDENES.find(x => x.v === e.target.value); if (o) { setSortKey(o.key); setSortDir(o.dir); } }}>
          {!ORDENES.some(o => o.v === `${sortKey}-${sortDir}`) && <option value={`${sortKey}-${sortDir}`}>Ordenar…</option>}
          {ORDENES.map(o => <option key={o.v} value={o.v}>Ordenar: {o.t}</option>)}
        </select>
        <span className="cat-cuenta">{loading ? 'Cargando…' : `${sorted.length} artículo${sorted.length !== 1 ? 's' : ''}`}</span>
      </div>

      {truncado && !loading && !q.trim() && (
        <div className="doc-aviso subidas">Solo se muestran {articles.length} de {truncado}. Busca por nombre o código para encontrar el resto.</div>
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
