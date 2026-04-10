import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Wrench, ShoppingCart, Clock, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { getDashboardStats } from '../api/client';
import type { DashboardStats } from '../types';

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Subido', processing: 'Analizando', completed: 'Completado', error: 'Error',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(({ data }) => setStats(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="stat-grid">
          {[1,2,3,4].map(i => (
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

  if (!stats) {
    return (
      <div className="page">
        <div style={{ textAlign: 'center', padding: 60 }}>
          <AlertCircle size={40} style={{ color: 'var(--danger)', marginBottom: 16 }} />
          <p style={{ color: 'var(--text-2)', marginBottom: 16 }}>No se pudo conectar con el servidor.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const s = stats;

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-1)', marginBottom: 4 }}>
          Panel de control
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Resumen de actividad de Casa Fonso</p>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/albaranes')}>
          <div className="stat-card-icon blue"><FileText size={20} /></div>
          <div className="stat-card-value">{s.documents.total}</div>
          <div className="stat-card-label">Albaranes totales</div>
          {s.documents.processing > 0 && (
            <div className="stat-card-sub" style={{ color: 'var(--warning)' }}>
              ⏳ {s.documents.processing} procesando…
            </div>
          )}
        </div>

        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/reparaciones')}>
          <div className="stat-card-icon orange"><Wrench size={20} /></div>
          <div className="stat-card-value">{s.repairs.pending}</div>
          <div className="stat-card-label">Reparaciones activas</div>
          <div className="stat-card-sub">
            {s.repairs.reparada > 0
              ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ {s.repairs.reparada} listas para entregar</span>
              : <span>{s.repairs.recibida} recibidas · {s.repairs.en_taller} en taller</span>
            }
          </div>
        </div>

        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/pedidos')}>
          <div className="stat-card-icon green"><ShoppingCart size={20} /></div>
          <div className="stat-card-value">{s.orders.pending}</div>
          <div className="stat-card-label">Pedidos pendientes</div>
          <div className="stat-card-sub">
            {s.orders.parcial > 0
              ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{s.orders.parcial} llegados parcialmente</span>
              : <span>{s.orders.pendiente} sin recibir</span>
            }
          </div>
        </div>

        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/albaranes')}>
          <div className="stat-card-icon purple">
            <CheckCircle size={20} />
          </div>
          <div className="stat-card-value">{s.repairs.entregada}</div>
          <div className="stat-card-label">Reparaciones entregadas</div>
          <div className="stat-card-sub">{s.orders.recibido} pedidos completados</div>
        </div>
      </div>

      {/* Content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Recent documents */}
        <div className="card">
          <div className="card-header">
            <FileText size={15} />
            Últimos albaranes
          </div>
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
                  padding: '10px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                  borderBottom: '1px solid var(--border)',
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
                  <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.original_filename}
                  </div>
                  {doc.supplier_name && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{doc.supplier_name}</div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                  {STATUS_LABEL[doc.status] ?? doc.status}
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
          <div className="card">
            <div className="card-header"><Plus size={15} />Acciones rápidas</div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ justifyContent: 'flex-start', gap: 10 }}
                onClick={() => navigate('/albaranes')}
              >
                <FileText size={15} />
                Subir nuevo albarán
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', gap: 10 }}
                onClick={() => navigate('/reparaciones?new=1')}
              >
                <Wrench size={15} />
                Nueva reparación
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', gap: 10 }}
                onClick={() => navigate('/pedidos?new=1')}
              >
                <ShoppingCart size={15} />
                Nuevo pedido
              </button>
            </div>
          </div>

          {/* Repairs needing attention */}
          {s.repairs.reparada > 0 && (
            <div className="card" style={{ borderColor: '#d1fae5', background: '#f0fdf4' }}>
              <div className="card-header" style={{ color: 'var(--success)' }}>
                <CheckCircle size={15} />
                {s.repairs.reparada} reparación{s.repairs.reparada > 1 ? 'es' : ''} lista{s.repairs.reparada > 1 ? 's' : ''} para entregar
              </div>
              <div style={{ padding: '12px 20px' }}>
                <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff', border: 'none' }} onClick={() => navigate('/reparaciones?status=reparada')}>
                  Ver reparaciones listas →
                </button>
              </div>
            </div>
          )}

          {/* Overdue orders */}
          {s.orders.pending > 0 && (
            <div className="card" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
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
