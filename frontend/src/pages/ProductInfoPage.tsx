import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getProductInfo, updateProductInfo, triggerProductSearch } from '../api/client';
import type { ProductInfo } from '../types';

export function ProductInfoPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);

  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await getProductInfo(productId);
        setProduct(data);
        setManualUrl(data.manual_url || '');
      } catch {
        setError('Producto no encontrado');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [productId]);

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

  const handleSearch = async () => {
    if (!product) return;
    setSearching(true);
    try {
      await triggerProductSearch(product.id);
      setTimeout(async () => {
        const { data } = await getProductInfo(product.id);
        setProduct(data);
        setSearching(false);
      }, 3000);
    } catch {
      setSearching(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Cargando...</div>;
  }

  if (error || !product) {
    return (
      <div style={{ maxWidth: '600px', margin: '60px auto', textAlign: 'center', padding: '24px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
        <h2 style={{ color: '#1F4E79' }}>Información técnica pendiente</h2>
        <p style={{ color: '#666' }}>
          No se ha encontrado información técnica para este producto.
        </p>
        <p style={{ color: '#888', fontSize: '13px' }}>
          Puedes pegar un enlace manualmente o esperar a que el sistema la busque automáticamente.
        </p>
      </div>
    );
  }

  const specs = product.specs || {};
  const hasSpecs = Object.keys(specs).length > 0;

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{
        background: '#1F4E79',
        color: '#fff',
        borderRadius: '12px',
        padding: '20px 24px',
        marginBottom: '20px',
      }}>
        <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '6px', textTransform: 'uppercase' }}>
          Código: {product.codigo_principal}
        </div>
        <h1 style={{ margin: 0, fontSize: '20px', lineHeight: 1.3 }}>
          {product.descripcion}
        </h1>
      </div>

      {/* Specs */}
      {hasSpecs ? (
        <div style={{
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '16px', color: '#1F4E79' }}>
            🔧 Especificaciones técnicas
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <tbody>
              {Object.entries(specs).map(([key, value]) => (
                <tr key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', color: '#666', fontWeight: 500, width: '40%' }}>
                    {key}
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                    {String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          background: '#fff8f0',
          border: '1px solid #ffe0b2',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
          textAlign: 'center',
          color: '#e67e22',
        }}>
          {product.search_attempted
            ? 'No se encontraron especificaciones técnicas automáticamente.'
            : 'La búsqueda de especificaciones está pendiente.'}
        </div>
      )}

      {/* Source link */}
      {product.source_url && (
        <div style={{ marginBottom: '16px' }}>
          <a href={product.source_url} target="_blank" rel="noopener noreferrer"
            style={{ color: '#1F4E79', fontSize: '13px' }}>
            🔗 Ver fuente: {product.source_url.substring(0, 60)}...
          </a>
        </div>
      )}

      {/* Manual URL */}
      <div style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '14px', color: '#555' }}>
          🔗 Enlace a ficha técnica (manual)
        </h3>
        {product.manual_url && (
          <div style={{ marginBottom: '8px' }}>
            <a href={product.manual_url} target="_blank" rel="noopener noreferrer"
              style={{ color: '#1F4E79', fontSize: '13px' }}>
              {product.manual_url}
            </a>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="url"
            value={manualUrl}
            onChange={e => setManualUrl(e.target.value)}
            placeholder="https://..."
            style={{
              flex: 1,
              padding: '7px 10px',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '13px',
            }}
          />
          <button
            onClick={handleSaveUrl}
            disabled={saving}
            style={{
              padding: '7px 14px',
              background: '#27ae60',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Re-search button */}
      <button
        onClick={handleSearch}
        disabled={searching}
        style={{
          padding: '8px 16px',
          background: '#3498db',
          color: '#fff',
          border: 'none',
          borderRadius: '7px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 600,
        }}
      >
        {searching ? '🔍 Buscando...' : '🔍 Buscar info técnica en internet'}
      </button>
    </div>
  );
}
