import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Wrench, ShoppingCart, CheckCircle, AlertCircle } from 'lucide-react';
import { getDashboardStats, listDocuments, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import type { DashboardStats, DocumentListItem } from '../types';

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Subido', processing: 'Analizando', completed: 'Completado', error: 'Error',
};

const EMPTY_STATS: DashboardStats = {
  documents: { total: 0, processing: 0 },
  repairs: { recibida: 0, en_taller: 0, reparada: 0, entregada: 0, pending: 0 },
  orders: { pendiente: 0, parcial: 0, recibido: 0, pending: 0 },
  recent_documents: [],
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function relativeDate(dt?: string | null): string {
  if (!dt) return '';
  const date = new Date(dt.replace('T', ' ').split(' ')[0]); // parse date part only
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff < 7)  return `hace ${diff} días`;
  if (diff < 30) return `hace ${Math.floor(diff / 7)} sem.`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function fmtToday(): string {
  return new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setFallbackDocs] = useState<DocumentListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await getDashboardStats();
      setStats(data);
    } catch (primaryErr) {
      // Fallback: try /api/documents. If that also fails, surface the error.
      try {
        const { data: docs } = await listDocuments();
        setFallbackDocs(docs);
        setStats({
          ...EMPTY_STATS,
          documents: {
            total: docs.length,
            processing: docs.filter(d => d.status === 'processing').length,
          },
          recent_documents: docs.slice(0, 5).map(d => ({
            id: d.id,
            original_filename: d.original_filename,
            status: d.status,
            supplier_name: d.supplier_name ?? null,
            created_at: d.created_at,
          })),
        });
        // Partial fallback worked but the main endpoint failed — flag it lightly.
        setLoadError(describeApiError(primaryErr) + ' — mostrando solo albaranes');
      } catch (fallbackErr) {
        setStats(null);
        setLoadError(describeApiError(fallbackErr));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="page">
        <div className="dashboard-hero-skeleton" />
        <div className="stat-grid" style={{ marginTop: 16 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="stat-card" style={{ minHeight: 110 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--border)', marginBottom: 8 }} />
              <div style={{ width: 60, height: 28, borderRadius: 6, background: 'var(--border)' }} />
              <div style={{ width: 100, height: 14, borderRadius: 4, background: 'var(--border)' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const s = stats ?? EMPTY_STATS;
  const hasData = stats !== null;

  return (
    <div className="page">

      {loadError && (
        <ConnectionError message={loadError} onRetry={load} />
      )}

      {/* ── Mobile header (greeting + date, no gradient) ── */}
      <div className="dashboard-hero">
        <span className="dashboard-hero-greeting">{greeting()}</span>
        <div className="dashboard-hero-brand">Casa Fonso</div>
        <span className="dashboard-hero-date" style={{ marginTop: 2 }}>{fmtToday()}</span>
        {s.repairs.reparada > 0 && (
          <button className="dashboard-hero-alert" onClick={() => navigate('/reparaciones?status=reparada')}>
            ✓ {s.repairs.reparada} listas para entregar →
          </button>
        )}
      </div>

      {/* ── Desktop header (hidden on mobile) ── */}
      <div className="dashboard-desktop-header">
        <h1 className="dashboard-desktop-greeting">{greeting()}</h1>
        <p className="dashboard-desktop-date">{fmtToday()}</p>
      </div>

      {/* ── Stat cards ── */}
      {!hasData ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>
          <div className="empty-state-icon">⚠️</div>
          <div className="empty-state-text">No hay datos disponibles</div>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
            No se pudo cargar la información. Comprueba la conexión con el servidor y pulsa Reintentar.
          </p>
        </div>
      ) : (<>
      <div className="stat-grid">
        <div className="stat-card stat-card--clickable" onClick={() => navigate('/albaranes')}>
          <div className="stat-card-icon blue"><FileText size={20} /></div>
          <div className="stat-card-value">{s.documents.total}</div>
          <div className="stat-card-label">Albaranes totales</div>
          {s.documents.processing > 0 && (
            <div className="stat-card-sub" style={{ color: 'var(--warning)' }}>⏳ {s.documents.processing} procesando…</div>
          )}
        </div>

        <div className="stat-card stat-card--clickable" onClick={() => navigate('/reparaciones')}>
          <div className="stat-card-icon orange"><Wrench size={20} /></div>
          <div className="stat-card-value">{s.repairs.pending}</div>
          <div className="stat-card-label">Reparaciones activas</div>
          {s.repairs.reparada > 0 && (
            <div className="stat-card-sub" style={{ color: 'var(--success)', fontWeight: 600 }}>✓ {s.repairs.reparada} lista{s.repairs.reparada > 1 ? 's' : ''} para entregar</div>
          )}
        </div>

        <div className="stat-card stat-card--clickable" onClick={() => navigate('/pedidos')}>
          <div className="stat-card-icon green"><ShoppingCart size={20} /></div>
          <div className="stat-card-value">{s.orders.pending}</div>
          <div className="stat-card-label">Pedidos pendientes</div>
          {s.orders.parcial > 0 && (
            <div className="stat-card-sub" style={{ color: 'var(--accent)', fontWeight: 600 }}>{s.orders.parcial} con recepción parcial</div>
          )}
        </div>

        <div className="stat-card stat-card--clickable" onClick={() => navigate('/reparaciones')}>
          <div className="stat-card-icon purple"><CheckCircle size={20} /></div>
          <div className="stat-card-value">{s.repairs.entregada}</div>
          <div className="stat-card-label">Reparaciones entregadas</div>
        </div>
      </div>

      {/* ── Alerts (desktop) ── */}
      <div className="dashboard-alerts">
        {s.repairs.reparada > 0 && (
          <div className="dashboard-alert dashboard-alert--green" onClick={() => navigate('/reparaciones?status=reparada')}>
            <CheckCircle size={15} />
            <span>{s.repairs.reparada} reparación{s.repairs.reparada > 1 ? 'es' : ''} lista{s.repairs.reparada > 1 ? 's' : ''} para entregar</span>
            <span className="dashboard-alert-link">Ver →</span>
          </div>
        )}
        {s.orders.pending > 0 && (
          <div className="dashboard-alert dashboard-alert--amber" onClick={() => navigate('/pedidos')}>
            <AlertCircle size={15} />
            <span>{s.orders.pending} pedido{s.orders.pending > 1 ? 's' : ''} sin completar</span>
            <span className="dashboard-alert-link">Ver →</span>
          </div>
        )}
      </div>

      {/* ── Content grid ── */}
      <div className="dashboard-grid">

        {/* Recent documents */}
        <div className="card">
          <div className="card-header"><FileText size={15} />Últimos albaranes</div>
          <div style={{ padding: '8px 0' }}>
            {s.recent_documents.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                No hay albaranes todavía
              </div>
            ) : s.recent_documents.map(doc => (
              <div
                key={doc.id}
                onClick={() => navigate(`/documento/${doc.id}`)}
                style={{
                  padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: doc.status === 'completed' ? 'var(--success)'
                    : doc.status === 'processing' ? 'var(--warning)'
                    : doc.status === 'error' ? 'var(--danger)' : 'var(--text-3)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.supplier_name || doc.original_filename}
                  </div>
                  {doc.supplier_name && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.original_filename}</div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0, textAlign: 'right' }}>
                  <div>{STATUS_LABEL[doc.status] ?? doc.status}</div>
                  <div>{relativeDate(doc.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/albaranes')}>
              Ver todos los albaranes →
            </button>
          </div>
        </div>

        {/* Activity cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Reparaciones activity card */}
          <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/reparaciones')}>
            <div className="card-header">
              <Wrench size={15} />
              Reparaciones
              <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{s.repairs.pending}</span>
            </div>
            {s.repairs.pending === 0 ? (
              <div style={{ padding: '16px 20px', color: 'var(--text-3)', fontSize: 13 }}>
                Sin reparaciones activas
              </div>
            ) : (
              <div style={{ padding: '8px 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {s.repairs.recibida > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-2)' }}>Recibidas</span>
                    <span className="status-chip recibida">{s.repairs.recibida}</span>
                  </div>
                )}
                {s.repairs.en_taller > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-2)' }}>En taller</span>
                    <span className="status-chip en_taller">{s.repairs.en_taller}</span>
                  </div>
                )}
                {s.repairs.reparada > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Listas para entregar</span>
                    <span className="status-chip reparada">{s.repairs.reparada}</span>
                  </div>
                )}
              </div>
            )}
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                Ver reparaciones →
              </button>
            </div>
          </div>

          {/* Pedidos activity card */}
          <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/pedidos')}>
            <div className="card-header">
              <ShoppingCart size={15} />
              Pedidos pendientes
              <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{s.orders.pending}</span>
            </div>
            {s.orders.pending === 0 ? (
              <div style={{ padding: '16px 20px', color: 'var(--text-3)', fontSize: 13 }}>
                Sin pedidos pendientes
              </div>
            ) : (
              <div style={{ padding: '8px 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {s.orders.pendiente > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-2)' }}>Por pedir</span>
                    <span className="status-chip pendiente">{s.orders.pendiente}</span>
                  </div>
                )}
                {s.orders.parcial > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-2)' }}>Recepción parcial</span>
                    <span className="status-chip parcial">{s.orders.parcial}</span>
                  </div>
                )}
              </div>
            )}
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                Ver pedidos →
              </button>
            </div>
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
}
