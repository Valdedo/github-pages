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

      {/* Search bar */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%)',
        borderRadius: '14px', padding: '20px', marginBottom: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      }}>
        <div style={{ fontWeight: 800, fontSize: '18px', color: '#fff', marginBottom: '12px', letterSpacing: '-0.02em' }}>
          🔍 Consulta rápida de precios
        </div>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={e => e.target.select()}
            placeholder="Escanea o escribe código / descripción…"
            autoComplete="off"
            style={{
              width: '100%',
              padding: '14px 48px 14px 16px',
              fontSize: '18px',
              fontFamily: 'monospace',
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.95)',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {query && (
            <button
              onClick={clear}
              style={{
                position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px',
                color: '#9ca3af', padding: '4px',
              }}
            >✕</button>
          )}
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '8px' }}>
          Busca por código EAN, referencia, o descripción. Pulsa Enter o escanea con la PDA.
        </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {results.map(art => (
            <div
              key={art.id}
              style={{
                background: '#fff', borderRadius: '12px', border: '1.5px solid var(--grey-200)',
                overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}
            >
              {/* Description + codes */}
              <div style={{ padding: '14px 16px 8px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-1)', marginBottom: '6px', lineHeight: 1.3 }}>
                  {art.descripcion}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {art.codigo_principal && (
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', background: '#f1f5f9', color: '#475569', borderRadius: '5px', padding: '2px 7px' }}>
                      {art.codigo_principal}
                    </span>
                  )}
                  {art.ean && art.ean !== art.codigo_principal && (
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', background: '#f0fdf4', color: '#166534', borderRadius: '5px', padding: '2px 7px' }}>
                      EAN: {art.ean}
                    </span>
                  )}
                  {art.familia && (
                    <span style={{ fontSize: '11px', background: '#ede9fe', color: '#5b21b6', borderRadius: '5px', padding: '2px 7px', fontWeight: 600 }}>
                      {art.familia}
                    </span>
                  )}
                  {art.supplier_name && (
                    <span style={{ fontSize: '11px', background: '#f8fafc', color: 'var(--text-3)', borderRadius: '5px', padding: '2px 7px' }}>
                      {art.supplier_name}
                    </span>
                  )}
                </div>
              </div>

              {/* Price band */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                background: '#f8fafc', borderTop: '1px solid var(--grey-100)',
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
