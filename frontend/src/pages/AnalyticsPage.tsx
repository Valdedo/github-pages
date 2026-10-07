import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ArrowLeft, BarChart3, Trophy, ChevronRight } from 'lucide-react';
import { getPriceHistory, getSupplierComparison, getTopProducts, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { nombreProveedor } from '../lib/proveedor';
import type { PriceHistoryEntry, SupplierComparisonEntry, TopProduct } from '../types';

const eur = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const pct = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '%');
const fecha = (d?: string | null) => {
  if (!d) return '';
  const [y, m, dd] = d.split('T')[0].split('-');
  return dd ? `${dd}/${m}/${y}` : d;
};

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [buscado, setBuscado] = useState<string | null>(null);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [comparison, setComparison] = useState<SupplierComparisonEntry[]>([]);
  const [top, setTop] = useState<TopProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarTop = () => {
    setError(null);
    getTopProducts(50).then(r => setTop(r.data)).catch(err => setError(describeApiError(err)));
  };
  useEffect(cargarTop, []);

  const buscar = async (c: string) => {
    const codigo = c.trim();
    if (!codigo) return;
    setCode(codigo);
    setLoading(true);
    setError(null);
    try {
      const [{ data: hist }, { data: comp }] = await Promise.all([getPriceHistory(codigo), getSupplierComparison(codigo)]);
      setHistory(hist);
      setComparison(comp);
      setBuscado(codigo);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const volver = () => { setBuscado(null); setCode(''); };
  const nombre = history[0]?.descripcion ?? comparison[0]?.descripcion ?? '';
  const hayMasBarato = comparison.length > 1 && (comparison[0].coste_avg ?? 0) < (comparison[1].coste_avg ?? 0) - 0.005;
  const nAlb = new Set(history.map(h => h.document_id)).size;

  return (
    <div className="page">
      {error && <ConnectionError message={error} onRetry={buscado ? () => buscar(buscado) : cargarTop} />}

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
            placeholder="Código del artículo, EAN o referencia…" aria-label="Código del artículo" />
          {code && <button type="button" className="search-bar-clear" onClick={() => setCode('')} aria-label="Borrar"><X size={16} /></button>}
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading || !code.trim()}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {buscado == null ? (
        /* ── Lo que más compramos ── */
        <div className="card ana-lista">
          <div className="pedido-lineas-head"><span><Trophy size={16} /> Lo que más compramos</span></div>
          {top == null ? (
            <div className="ana-vacio">Cargando…</div>
          ) : top.length === 0 ? (
            <div className="ana-vacio">
              <BarChart3 size={34} />
              Aparecerán aquí los artículos que salgan en varios albaranes de proveedor.
            </div>
          ) : top.map((p, i) => (
            <button key={p.codigo_principal} className="ana-fila" onClick={() => buscar(p.codigo_principal)}>
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

          {history.length === 0 ? (
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
                      <b>{fecha(h.doc_date) || new Date(h.created_at).toLocaleDateString('es-ES')} · {nombreProveedor(h.supplier_name) || '—'}</b>
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
