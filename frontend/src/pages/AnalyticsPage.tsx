import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, ArrowLeft, BarChart3, Trophy, ChevronRight } from 'lucide-react';
import { getPriceHistory, getSupplierComparison, getTopProducts, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { nombreProveedor } from '../lib/proveedor';
import { buscarCatalogo } from '../lib/catalogo';
import { fechaES, normaliza } from '../lib/texto';
import type { CatalogArticle, PriceHistoryEntry, SupplierComparisonEntry, TopProduct } from '../types';

const eur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const pct = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '%');
const fecha = fechaES;
const codigoDe = (a: CatalogArticle) => a.codigo_principal || a.ean || a.codigo_fabricante || a.codigo_proveedor || '';

export function AnalyticsPage() {
  const navigate = useNavigate();
  // El artículo abierto va en la dirección (?codigo=…) para que «Atrás» vuelva a la lista
  const [params, setParams] = useSearchParams();
  const buscado = params.get('codigo');
  const [code, setCode] = useState('');
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [comparison, setComparison] = useState<SupplierComparisonEntry[]>([]);
  const [top, setTop] = useState<TopProduct[] | null>(null);
  const [candidatos, setCandidatos] = useState<CatalogArticle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarTop = () => {
    setError(null);
    getTopProducts(50).then(r => setTop(r.data)).catch(err => setError(describeApiError(err)));
  };
  useEffect(cargarTop, []);

  const abrir = (codigo: string) => {
    setCandidatos(null);
    setParams({ codigo });
  };

  const cargarArticulo = async (codigo: string) => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: hist }, { data: comp }] = await Promise.all([getPriceHistory(codigo), getSupplierComparison(codigo)]);
      setHistory(hist);
      setComparison(comp);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (buscado) cargarArticulo(buscado); else { setHistory([]); setComparison([]); } }, [buscado]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Busca por texto (nombre, código, EAN…) sin distinguir mayúsculas ni tildes. */
  const buscar = async (c: string) => {
    const q = c.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const res = await buscarCatalogo(q, 30);
      const n = normaliza(q);
      const exacto = res.find(a => [a.codigo_principal, a.ean, a.codigo_fabricante, a.codigo_proveedor].some(x => normaliza(x) === n));
      if (exacto) abrir(codigoDe(exacto));
      else if (res.length === 1 && codigoDe(res[0])) abrir(codigoDe(res[0]));
      else if (res.length === 0 && !/\s/.test(q)) abrir(q); // por si es un código que ya no está en el catálogo
      else {
        setCandidatos(res.filter(a => codigoDe(a)));
        if (buscado) setParams({});
      }
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const volver = () => { setCode(''); if (window.history.state?.idx > 0) navigate(-1); else setParams({}); };
  const nombre = history[0]?.descripcion ?? comparison[0]?.descripcion ?? '';
  const hayMasBarato = comparison.length > 1 && (comparison[0].coste_avg ?? 0) < (comparison[1].coste_avg ?? 0) - 0.005;
  const nAlb = new Set(history.map(h => h.document_id)).size;

  return (
    <div className="page">
      {error && <ConnectionError message={error} onRetry={buscado ? () => cargarArticulo(buscado) : cargarTop} />}

      <div className="inicio-head" style={{ marginBottom: 14 }}>
        <div>
          <h1>Análisis de compras</h1>
          <p>Lo que más compramos, cuánto nos ha costado cada vez y qué proveedor lo deja más barato.</p>
        </div>
      </div>

      <form className="cat-filtros" onSubmit={e => { e.preventDefault(); buscar(code); }}>
        <div className="search-bar" style={{ flex: '1 1 260px', minWidth: 0 }}>
          <Search size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input type="text" enterKeyHint="search" value={code} onChange={e => setCode(e.target.value)}
            placeholder="Nombre, código, EAN o referencia…" aria-label="Buscar artículo" />
          {code && <button type="button" className="search-bar-clear" onClick={() => { setCode(''); setCandidatos(null); }} aria-label="Borrar"><X size={16} /></button>}
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading || !code.trim()}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {buscado == null && candidatos != null ? (
        /* ── Varios artículos coinciden con la búsqueda ── */
        <div className="card ana-lista">
          <div className="pedido-lineas-head"><span><Search size={16} /> {candidatos.length ? `${candidatos.length} artículo${candidatos.length !== 1 ? 's' : ''} con «${code.trim()}»` : `Nada con «${code.trim()}»`}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setCandidatos(null)}>Cerrar</button></div>
          {candidatos.length === 0 && <div className="ana-vacio">No hay ningún artículo con ese nombre o código.</div>}
          {candidatos.map(a => (
            <button key={a.id} className="ana-fila" onClick={() => abrir(codigoDe(a))}>
              <span className="ana-txt">
                <b>{a.descripcion}</b>
                <small><span className="cat-chip gris">{codigoDe(a)}</span> {nombreProveedor(a.supplier_name)}</small>
              </span>
              <ChevronRight size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      ) : buscado == null ? (
        /* ── Lo que más compramos ── */
        <div className="card ana-lista">
          <div className="pedido-lineas-head"><span><Trophy size={16} /> Lo que más compramos</span></div>
          <p className="ana-explica">Ordenado por el número de albaranes en los que aparece cada artículo (no por lo que se ha gastado).</p>
          {top == null ? (
            <div className="ana-vacio">Cargando…</div>
          ) : top.length === 0 ? (
            <div className="ana-vacio">
              <BarChart3 size={34} />
              Aparecerán aquí los artículos que salgan en varios albaranes de proveedor.
            </div>
          ) : top.map((p, i) => (
            <button key={p.codigo_principal} className="ana-fila" onClick={() => abrir(p.codigo_principal)}>
              <span className="ana-pos">{i + 1}</span>
              <span className="ana-txt">
                <b>{p.descripcion}</b>
                <small>
                  <span className="cat-chip gris">{p.codigo_principal}</span>
                  en {p.num_documentos} {p.num_documentos !== 1 ? 'albaranes' : 'albarán'}
                  {p.num_proveedores > 1 && ` · ${p.num_proveedores} proveedores`}
                </small>
              </span>
              <span className="ana-precio"><small>Coste medio</small>{eur(p.coste_avg)}</span>
              <ChevronRight size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      ) : (
        /* ── Un artículo ── */
        <>
          <button className="btn btn-ghost btn-sm" onClick={volver} style={{ marginBottom: 12 }}>
            <ArrowLeft size={15} /> Lo que más compramos
          </button>

          {loading ? (
            <div className="ana-vacio">Cargando…</div>
          ) : history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-text">No hay ningún artículo con el código «{buscado}».</div>
            </div>
          ) : (
            <>
              <div className="ana-titulo">
                <h2>{nombre}</h2>
                <span>Código {buscado} · comprado {history.length} {history.length !== 1 ? 'veces' : 'vez'} en {nAlb} {nAlb !== 1 ? 'albaranes' : 'albarán'}</span>
              </div>

              {comparison.length > 1 && (
                <div className="card ana-lista" style={{ marginBottom: 12 }}>
                  <div className="pedido-lineas-head"><span>Comparativa de proveedores</span></div>
                  {comparison.map((c, i) => (
                    <div key={c.supplier_name} className={`ana-fila estatica${i === 0 && hayMasBarato ? ' mejor' : ''}`}>
                      <span className="ana-txt">
                        <b>{nombreProveedor(c.supplier_name) || '—'} {i === 0 && hayMasBarato && <span className="aviso-chip hecho">El más barato</span>}</b>
                        <small>{c.num_compras} compra{c.num_compras !== 1 ? 's' : ''}{c.ultima_compra ? ` · última el ${fecha(c.ultima_compra)}` : ''} · entre {eur(c.coste_min)} y {eur(c.coste_max)}</small>
                      </span>
                      <span className="ana-precio"><small>Coste medio</small>{eur(c.coste_avg)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="card ana-lista">
                <div className="pedido-lineas-head"><span>Cada compra</span></div>
                {history.map(h => (
                  <button key={h.article_id} className="ana-fila" onClick={() => navigate(`/documento/${h.document_id}`)} title="Abrir el albarán">
                    <span className="ana-txt">
                      <b>{fecha(h.doc_date || h.created_at)} · {nombreProveedor(h.supplier_name) || '—'}</b>
                      <small>
                        {h.doc_number ? `Albarán ${h.doc_number} · ` : ''}{h.cantidad} ud
                        {h.precio_unitario_bruto != null && h.precio_unitario_bruto !== h.coste_neto_unitario && ` · bruto ${eur(h.precio_unitario_bruto)}`}
                        {h.margen_pct != null && ` · margen ${pct(h.margen_pct)}`}
                        {h.pvp_con_iva != null && ` · PVP ${eur(h.pvp_con_iva)}`}
                      </small>
                    </span>
                    <span className="ana-precio"><small>Coste neto</small>{eur(h.coste_neto_unitario)}</span>
                    <ChevronRight size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
