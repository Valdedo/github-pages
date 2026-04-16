import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCatalog } from '../api/client';
import type { CatalogArticle } from '../types';

export function PriceLookupPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Auto-focus on mount (PDA scans directly into this field)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(async (q: string) => {
    const clean = q.trim();
    if (!clean) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await getCatalog({ q: clean, limit: 20 });
      setResults(data);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce for keyboard typing
  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      clearTimeout(0);
      search(query);
    }
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  };

  const fmt = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '16px' }}>

      {/* Page header */}
      <div style={{ marginBottom: '20px', paddingBottom: '18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-1)', marginBottom: 4 }}>
          Consulta de precios
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
          Escanea o escribe código EAN, referencia, o descripción
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={e => e.target.select()}
          placeholder="Código / EAN / descripción…"
          autoComplete="off"
          style={{
            width: '100%',
            padding: '12px 44px 12px 16px',
            fontSize: '16px',
            fontFamily: 'var(--font)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--surface)',
            outline: 'none',
            color: 'var(--text-1)',
          }}
        />
        {query && (
          <button
            onClick={clear}
            style={{
              position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px',
              color: 'var(--text-3)', padding: '4px',
            }}
          >✕</button>
        )}
      </div>

      {/* Results */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>
          Buscando…
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div style={{
          background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px',
          padding: '20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔎</div>
          <div style={{ fontWeight: 700, color: '#c2410c', marginBottom: '4px' }}>Artículo no encontrado</div>
          <div style={{ fontSize: '13px', color: '#9a3412' }}>
            No hay ningún artículo con ese código o descripción en el catálogo.
          </div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {results.map((art, idx) => (
            <div
              key={art.id}
              style={{
                borderBottom: idx < results.length - 1 ? '1px solid var(--border)' : 'none',
                overflow: 'hidden',
              }}
            >
              {/* Description + codes */}
              <div style={{ padding: '12px 16px 8px' }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-1)', marginBottom: '6px', lineHeight: 1.3 }}>
                  {art.descripcion}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {art.codigo_principal && (
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', background: 'var(--bg)', color: 'var(--text-2)', borderRadius: 'var(--r-sm)', padding: '2px 7px', border: '1px solid var(--border)' }}>
                      {art.codigo_principal}
                    </span>
                  )}
                  {art.ean && art.ean !== art.codigo_principal && (
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', background: 'var(--brand-pale)', color: 'var(--brand-dark)', borderRadius: 'var(--r-sm)', padding: '2px 7px', border: '1px solid var(--brand-light)' }}>
                      EAN: {art.ean}
                    </span>
                  )}
                  {art.familia && (
                    <span style={{ fontSize: '11px', background: 'var(--bg)', color: 'var(--text-3)', borderRadius: 'var(--r-sm)', padding: '2px 7px', border: '1px solid var(--border)' }}>
                      {art.familia}
                    </span>
                  )}
                  {art.supplier_name && (
                    <span style={{ fontSize: '11px', background: 'var(--bg)', color: 'var(--text-3)', borderRadius: 'var(--r-sm)', padding: '2px 7px', border: '1px solid var(--border)' }}>
                      {art.supplier_name}
                    </span>
                  )}
                </div>
              </div>

              {/* Price band */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                background: 'var(--bg)', borderTop: '1px solid var(--border)',
                padding: '10px 16px',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Coste</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '14px', color: 'var(--text-2)' }}>
                    {fmt(art.coste_neto_unitario)}
                  </div>
                </div>
                <div style={{ textAlign: 'center', borderLeft: '1px solid var(--grey-200)', borderRight: '1px solid var(--grey-200)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                    PVP s/IVA · {art.margen_pct.toFixed(0)}%
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '14px' }}>
                    {fmt(art.pvp_sin_iva)}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                    PVP c/IVA · {art.iva_pct}%
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '18px', color: '#166534' }}>
                    {fmt(art.pvp_con_iva)}
                  </div>
                </div>
              </div>

              {/* Link to document */}
              {art.doc_date && (
                <div style={{
                  padding: '6px 16px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', borderTop: '1px solid var(--grey-100)',
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    Último albarán: {art.doc_date}{art.doc_number ? ` · #${art.doc_number}` : ''}
                  </span>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                    onClick={() => navigate(`/documento/${art.document_id}`)}
                  >Ver albarán</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && !searched && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-3)' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📦</div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Lista para escanear</div>
          <div style={{ fontSize: '13px' }}>Escanea un código de barras con la PDA o escribe en el campo de arriba.</div>
        </div>
      )}
    </div>
  );
}
