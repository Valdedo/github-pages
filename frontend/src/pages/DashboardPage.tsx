import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Wrench, ShoppingCart, CheckCircle, AlertCircle, Plus, Search, Tag, BookOpen } from 'lucide-react';
import { getDashboardStats, listDocuments } from '../api/client';
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
  const [fallbackDocs, setFallbackDocs] = useState<DocumentListItem[]>([]);

  useEffect(() => {
    getDashboardStats()
      .then(({ data }) => setStats(data))
      .catch(() => {
        listDocuments()
          .then(({ data: docs }) => {
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
          })
          .catch(() => setStats(EMPTY_STATS));
      })
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="page">

      {/* ── Hero (mobile-only gradient header) ── */}
      <div className="dashboard-hero">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="dashboard-hero-greeting">{greeting()}</span>
          <span className="dashboard-hero-date">{fmtToday()}</span>
        </div>
        <div className="dashboard-hero-brand">Casa Fonso</div>
        {s.repairs.reparada > 0 && (
          <button className="dashboard-hero-alert" onClick={() => navigate('/reparaciones?status=reparada')}>
            ✓ {s.repairs.reparada} reparación{s.repairs.reparada > 1 ? 'es' : ''} lista{s.repairs.reparada > 1 ? 's' : ''} para entregar →
          </button>
        )}
      </div>

      {/* ── Desktop header (hidden on mobile) ── */}
      <div className="dashboard-desktop-header">
        <div>
          <h1 className="dashboard-desktop-greeting">{greeting()}</h1>
          <p className="dashboard-desktop-date">{fmtToday()}</p>
        </div>
        {(s.repairs.reparada > 0 || s.orders.pending > 0) && (
          <div className="dashboard-desktop-summary">
            {s.repairs.reparada > 0 && (
              <button className="dashboard-summary-chip dashboard-summary-chip--green"
                onClick={() => navigate('/reparaciones?status=reparada')}>
                ✓ {s.repairs.reparada} reparación{s.repairs.reparada > 1 ? 'es' : ''} lista{s.repairs.reparada > 1 ? 's' : ''} para entregar
              </button>
            )}
            {s.orders.pending > 0 && (
              <button className="dashboard-summary-chip dashboard-summary-chip--amber"
                onClick={() => navigate('/pedidos')}>
                {s.orders.pending} pedido{s.orders.pending > 1 ? 's' : ''} pendiente{s.orders.pending > 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div className="stat-grid">
        <div className="stat-card stat-card--clickable" onClick={() => navigate('/albaranes')}>
          <div className="stat-card-icon blue"><FileText size={20} /></div>
          <div className="stat-card-value">{s.documents.total}</div>
          <div className="stat-card-label">Albaranes totales</div>
          {s.documents.processing > 0 ? (
            <div className="stat-card-sub" style={{ color: 'var(--warning)' }}>⏳ {s.documents.processing} procesando…</div>
          ) : (
            <div className="stat-card-sub">Ver historial →</div>
          )}
        </div>

        <div className="stat-card stat-card--clickable" onClick={() => navigate('/reparaciones')}>
          <div className="stat-card-icon orange"><Wrench size={20} /></div>
          <div className="stat-card-value">{s.repairs.pending}</div>
          <div className="stat-card-label">Reparaciones activas</div>
          <div className="stat-card-sub">
            {s.repairs.reparada > 0
              ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ {s.repairs.reparada} listas</span>
              : <span>{s.repairs.recibida} recib. · {s.repairs.en_taller} en taller</span>}
          </div>
        </div>

        <div className="stat-card stat-card--clickable" onClick={() => navigate('/pedidos')}>
          <div className="stat-card-icon green"><ShoppingCart size={20} /></div>
          <div className="stat-card-value">{s.orders.pending}</div>
          <div className="stat-card-label">Pedidos pendientes</div>
          <div className="stat-card-sub">
            {s.orders.parcial > 0
              ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{s.orders.parcial} parciales</span>
              : <span>{s.orders.pendiente} sin recibir</span>}
          </div>
        </div>

        <div className="stat-card stat-card--clickable" onClick={() => navigate('/reparaciones')}>
          <div className="stat-card-icon purple"><CheckCircle size={20} /></div>
          <div className="stat-card-value">{s.repairs.entregada}</div>
          <div className="stat-card-label">Reparaciones entregadas</div>
          <div className="stat-card-sub">{s.orders.recibido} pedidos completados</div>
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

        {/* Quick actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Quick action grid 3×2 */}
          <div className="card">
            <div className="card-header"><Plus size={15} />Acciones rápidas</div>
            <div className="quick-action-grid">
              <button className="quick-action-tile quick-action-tile--primary" onClick={() => navigate('/albaranes')}>
                <FileText size={20} />
                <span>Subir albarán</span>
              </button>
              <button className="quick-action-tile" onClick={() => navigate('/reparaciones?new=1')}>
                <Wrench size={20} />
                <span>Nueva reparación</span>
              </button>
              <button className="quick-action-tile" onClick={() => navigate('/pedidos?new=1')}>
                <ShoppingCart size={20} />
                <span>Nuevo pedido</span>
              </button>
              <button className="quick-action-tile" onClick={() => navigate('/consulta')}>
                <Search size={20} />
                <span>Buscar artículo</span>
              </button>
              <button className="quick-action-tile" onClick={() => navigate('/etiquetas')}>
                <Tag size={20} />
                <span>Etiquetas</span>
              </button>
              <button className="quick-action-tile" onClick={() => navigate('/catalogo')}>
                <BookOpen size={20} />
                <span>Catálogo</span>
              </button>
            </div>
          </div>

          {/* Desktop-only alert cards */}
          {s.repairs.reparada > 0 && (
            <div className="card dashboard-alert-card dashboard-alert-card--success">
              <div className="card-header" style={{ color: 'var(--success)' }}>
                <CheckCircle size={15} />
                {s.repairs.reparada} reparación{s.repairs.reparada > 1 ? 'es' : ''} lista{s.repairs.reparada > 1 ? 's' : ''} para entregar
              </div>
              <div style={{ padding: '12px 20px' }}>
                <button className="btn btn-sm btn-success" onClick={() => navigate('/reparaciones?status=reparada')}>
                  Ver reparaciones listas →
                </button>
              </div>
            </div>
          )}

          {s.orders.pending > 0 && (
            <div className="card dashboard-alert-card dashboard-alert-card--warning">
              <div className="card-header" style={{ color: 'var(--warning)' }}>
                <AlertCircle size={15} />
                {s.orders.pending} pedido{s.orders.pending > 1 ? 's' : ''} sin completar
              </div>
              <div style={{ padding: '12px 20px' }}>
                <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff', border: 'none' }} onClick={() => navigate('/pedidos')}>
                  Ver pedidos →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
