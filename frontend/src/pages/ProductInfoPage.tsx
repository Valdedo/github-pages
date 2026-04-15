import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getProductInfo, updateProductInfo, triggerProductSearch } from '../api/client';
import type { ProductInfo } from '../types';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // 60 seconds max

export function ProductInfoPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);

  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (currentAttempt = 0) => {
    stopPolling();
    let attempts = currentAttempt;
    pollRef.current = setInterval(async () => {
      attempts++;
      setPollCount(attempts);
      try {
        const { data } = await getProductInfo(productId);
        setProduct(data);
        if (data.search_attempted) {
          setSearching(false);
          stopPolling();
        }
      } catch {
        stopPolling();
        setSearching(false);
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setSearching(false);
      }
    }, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const load = async () => {
      try {
        const { data } = await getProductInfo(productId);
        if (!mounted) return;
        setProduct(data);
        setManualUrl(data.manual_url || '');

        // Auto-trigger AI search if not done yet
        if (!data.search_attempted) {
          setSearching(true);
          try {
            await triggerProductSearch(data.id);
          } catch {
            // Search might already be running — still poll
          }
          if (mounted) startPolling(0);
        }
      } catch {
        if (!mounted) return;
        setError('Producto no encontrado');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
      controller.abort();
      stopPolling();
    };
  }, [productId]);

  const handleManualSearch = async () => {
    if (!product || searching) return;
    setSearching(true);
    setPollCount(0);
    try {
      await triggerProductSearch(product.id);
    } catch { /* already running */ }
    startPolling(0);
  };

  const handleSaveUrl = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const { data } = await updateProductInfo(product.id, { manual_url: manualUrl });
      setProduct(data);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ background: '#1F4E79', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ width: 80, height: 12, background: 'rgba(255,255,255,0.25)', borderRadius: 6, marginBottom: 10 }} />
          <div style={{ width: '70%', height: 20, background: 'rgba(255,255,255,0.35)', borderRadius: 6 }} />
        </div>
        <AISearchingBanner progress={0} />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
        <h2 style={{ color: '#1F4E79' }}>Producto no encontrado</h2>
        <p style={{ color: '#666' }}>No se encontró información para este código.</p>
      </div>
    );
  }

  const specs = product.specs || {};
  const hasSpecs = Object.keys(specs).length > 0;
  const progressPct = searching
    ? Math.min(90, (pollCount / POLL_MAX_ATTEMPTS) * 100)
    : 100;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1F4E79 0%, #2980b9 100%)',
        color: '#fff',
        borderRadius: 14,
        padding: '20px 24px',
        marginBottom: 20,
        boxShadow: '0 4px 16px rgba(31,78,121,0.25)',
      }}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {product.codigo_principal}
        </div>
        <h1 style={{ margin: 0, fontSize: 18, lineHeight: 1.35, fontWeight: 700 }}>
          {product.descripcion}
        </h1>
      </div>

      {/* AI searching banner — shown while search is in progress */}
      {searching && <AISearchingBanner progress={progressPct} />}

      {/* Specs */}
      {!searching && hasSpecs ? (
        <div style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: '20px',
          marginBottom: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, color: '#1F4E79', display: 'flex', alignItems: 'center', gap: 8 }}>
            🔧 Especificaciones técnicas
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              {Object.entries(specs).map(([key, value]) => (
                <tr key={key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 10px', color: '#6b7280', fontWeight: 500, width: '42%', verticalAlign: 'top' }}>
                    {key}
                  </td>
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: '#111827' }}>
                    {String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !searching && product.search_attempted && !hasSpecs ? (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 14,
          color: '#92400e',
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          No se encontraron especificaciones automáticamente.
        </div>
      ) : null}

      {/* Ficha IA (AI description) */}
      {product.ficha_ia && !searching && (
        <div style={{
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 16,
          fontSize: 14,
          color: '#0c4a6e',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 }}>
            Descripción IA
          </div>
          {product.ficha_ia}
        </div>
      )}

      {/* Source link */}
      {product.source_url && (
        <div style={{ marginBottom: 12 }}>
          <a href={product.source_url} target="_blank" rel="noopener noreferrer"
            style={{ color: '#2563eb', fontSize: 13, textDecoration: 'none' }}>
            🔗 Ver ficha técnica →
          </a>
        </div>
      )}

      {/* Manual URL section */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '16px',
        marginBottom: 12,
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
          Enlace a ficha técnica (manual)
        </h3>
        {product.manual_url && (
          <div style={{ marginBottom: 8 }}>
            <a href={product.manual_url} target="_blank" rel="noopener noreferrer"
              style={{ color: '#2563eb', fontSize: 13, wordBreak: 'break-all' }}>
              {product.manual_url}
            </a>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            value={manualUrl}
            onChange={e => setManualUrl(e.target.value)}
            placeholder="https://..."
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
              minWidth: 0,
            }}
          />
          <button
            onClick={handleSaveUrl}
            disabled={saving}
            style={{
              padding: '8px 14px',
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {saving ? '...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Re-search button */}
      {product.search_attempted && (
        <button
          onClick={handleManualSearch}
          disabled={searching}
          style={{
            width: '100%',
            padding: '10px',
            background: searching ? '#93c5fd' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: searching ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {searching ? '🔍 Buscando...' : '🔍 Volver a buscar información técnica'}
        </button>
      )}
    </div>
  );
}

// ── Animated AI searching banner ──────────────────────────────────
function AISearchingBanner({ progress }: { progress: number }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      border: '1px solid #bfdbfe',
      borderRadius: 12,
      padding: '20px 20px 16px',
      marginBottom: 16,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
      <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 4, fontSize: 15 }}>
        Buscando información técnica…
      </div>
      <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>
        La IA está analizando el producto. Esto tarda unos segundos.
      </div>
      {/* Progress bar */}
      <div style={{
        height: 6,
        background: '#dbeafe',
        borderRadius: 99,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {progress === 0 ? (
          // Indeterminate animation when just started
          <div style={{
            position: 'absolute',
            height: '100%',
            width: '40%',
            background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)',
            borderRadius: 99,
            animation: 'progress-slide 1.4s ease-in-out infinite',
          }} />
        ) : (
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #3b82f6, #10b981)',
            borderRadius: 99,
            transition: 'width 0.6s ease',
          }} />
        )}
      </div>
    </div>
  );
}
