import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Wrench, Search, Phone, ChevronRight } from 'lucide-react';
import { listRepairs, createRepair, updateRepair, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import type { Repair, RepairStatus } from '../types';

const STATUSES: { value: RepairStatus | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'recibida', label: 'Recibida' },
  { value: 'en_taller', label: 'En taller' },
  { value: 'reparada', label: 'Reparada' },
];

const STATUS_STEPS: RepairStatus[] = ['recibida', 'en_taller', 'reparada', 'entregada'];
const STATUS_NEXT: Record<RepairStatus, RepairStatus | null> = {
  recibida: 'en_taller',
  en_taller: 'reparada',
  reparada: 'entregada',
  entregada: null,
};
const STATUS_NEXT_LABEL: Record<RepairStatus, string> = {
  recibida: 'Enviar a taller',
  en_taller: 'Marcar reparada',
  reparada: 'Marcar entregada',
  entregada: '',
};

function StatusChip({ status }: { status: RepairStatus }) {
  const labels: Record<RepairStatus, string> = {
    recibida: 'Recibida', en_taller: 'En taller', reparada: 'Reparada', entregada: 'Entregada',
  };
  return <span className={`status-chip ${status}`}>{labels[status]}</span>;
}

// Format a stored datetime string for display (e.g. "11/04/2026")
function fmtDate(dt?: string | null): string {
  if (!dt) return '';
  const [y, m, d] = dt.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function relativeDate(dt?: string | null): string {
  if (!dt) return '';
  const date = new Date(dt.split('T')[0]);
  const diff = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff < 7)  return `hace ${diff} días`;
  if (diff < 30) return `hace ${Math.floor(diff / 7)} sem.`;
  return fmtDate(dt);
}

// Convert ISO datetime string → YYYY-MM-DD for date inputs
function toDateInput(dt?: string | null): string {
  if (!dt) return '';
  return dt.split('T')[0];
}

// Today's date as YYYY-MM-DD (local date, not UTC)
function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Convert YYYY-MM-DD → naive ISO datetime string for API (no timezone = no drift)
function fromDateInput(s: string): string | undefined {
  if (!s) return undefined;
  return s + 'T12:00:00'; // noon, naive — avoids any UTC date-shift issues
}

interface RepairFormData {
  client_name: string;
  client_phone: string;
  tool_brand: string;
  tool_model: string;
  tool_description: string;
  problem_description: string;
  estimated_price: string;
  notes: string;
  date_received: string;
  date_sent_to_repair: string;
  date_repaired: string;
  date_estimated_return: string;
  date_returned: string;
}

const EMPTY_FORM: RepairFormData = {
  client_name: '', client_phone: '', tool_brand: '', tool_model: '',
  tool_description: '', problem_description: '', estimated_price: '', notes: '',
  date_received: today(),
  date_sent_to_repair: '',
  date_repaired: '',
  date_estimated_return: '',
  date_returned: '',
};

function RepairModal({
  repair,
  onClose,
  onSaved,
}: {
  repair: Repair | null;
  onClose: () => void;
  onSaved: (r: Repair) => void;
}) {
  const [form, setForm] = useState<RepairFormData>(
    repair ? {
      client_name: repair.client_name,
      client_phone: repair.client_phone ?? '',
      tool_brand: repair.tool_brand ?? '',
      tool_model: repair.tool_model ?? '',
      tool_description: repair.tool_description,
      problem_description: repair.problem_description,
      estimated_price: repair.estimated_price != null ? String(repair.estimated_price) : '',
      notes: repair.notes ?? '',
      date_received: toDateInput(repair.date_received),
      date_sent_to_repair: toDateInput(repair.date_sent_to_repair),
      date_repaired: toDateInput(repair.date_repaired),
      date_estimated_return: toDateInput(repair.date_estimated_return),
      date_returned: toDateInput(repair.date_returned),
    } : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof RepairFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name.trim()) { setError('El nombre del cliente es obligatorio'); return; }
    if (!form.tool_description.trim()) { setError('La descripción de la herramienta es obligatoria'); return; }
    if (!form.problem_description.trim()) { setError('La descripción del problema es obligatoria'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim() || undefined,
        tool_brand: form.tool_brand.trim() || undefined,
        tool_model: form.tool_model.trim() || undefined,
        tool_description: form.tool_description.trim(),
        problem_description: form.problem_description.trim(),
        estimated_price: form.estimated_price ? parseFloat(form.estimated_price) : undefined,
        notes: form.notes.trim() || undefined,
        status: repair?.status ?? 'recibida' as RepairStatus,
        date_received: fromDateInput(form.date_received),
        date_sent_to_repair: fromDateInput(form.date_sent_to_repair),
        date_repaired: fromDateInput(form.date_repaired),
        date_estimated_return: fromDateInput(form.date_estimated_return),
        date_returned: fromDateInput(form.date_returned),
      };
      const { data } = repair
        ? await updateRepair(repair.id, payload)
        : await createRepair(payload as any);
      onSaved(data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(detail ? `Error: ${detail}` : 'Error al guardar la reparación');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            {repair ? 'Editar reparación' : 'Nueva reparación'}
          </span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
            {error && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{error}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Cliente *</label>
                <input className="form-input" value={form.client_name} onChange={set('client_name')} placeholder="Nombre del cliente" required />
              </div>
              <div>
                <label className="form-label">Teléfono</label>
                <input className="form-input" value={form.client_phone} onChange={set('client_phone')} placeholder="666 123 456" type="tel" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Marca</label>
                <input className="form-input" value={form.tool_brand} onChange={set('tool_brand')} placeholder="Bosch, DeWalt…" />
              </div>
              <div>
                <label className="form-label">Modelo</label>
                <input className="form-input" value={form.tool_model} onChange={set('tool_model')} placeholder="GSB 13 RE…" />
              </div>
            </div>

            <div>
              <label className="form-label">Herramienta *</label>
              <input className="form-input" value={form.tool_description} onChange={set('tool_description')} placeholder="Ej: Taladro percutor" required />
            </div>

            <div>
              <label className="form-label">Descripción del problema *</label>
              <textarea
                className="form-input"
                value={form.problem_description}
                onChange={set('problem_description')}
                placeholder="Describe el problema…"
                rows={3}
                style={{ resize: 'vertical' }}
                required
              />
            </div>

            {/* Dates — 4 tracking milestones */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Seguimiento de fechas
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">📥 Fecha recibida</label>
                  <input className="form-input" type="date" value={form.date_received} onChange={set('date_received')} />
                </div>
                <div>
                  <label className="form-label">🔧 Enviada al taller</label>
                  <input className="form-input" type="date" value={form.date_sent_to_repair} onChange={set('date_sent_to_repair')} placeholder="Auto al cambiar estado" />
                </div>
                <div>
                  <label className="form-label">✅ Llegó reparada</label>
                  <input className="form-input" type="date" value={form.date_repaired} onChange={set('date_repaired')} placeholder="Auto al cambiar estado" />
                </div>
                <div>
                  <label className="form-label">🏠 Entregada al cliente</label>
                  <input className="form-input" type="date" value={form.date_returned} onChange={set('date_returned')} placeholder="Auto al cambiar estado" />
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <label className="form-label">📅 Entrega estimada</label>
                <input className="form-input" type="date" value={form.date_estimated_return} onChange={set('date_estimated_return')} style={{ maxWidth: 200 }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Precio estimado (€)</label>
                <input className="form-input" value={form.estimated_price} onChange={set('estimated_price')} placeholder="0.00" type="number" step="0.01" min="0" />
              </div>
            </div>

            <div>
              <label className="form-label">Notas internas</label>
              <textarea
                className="form-input"
                value={form.notes}
                onChange={set('notes')}
                placeholder="Notas adicionales…"
                rows={2}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : repair ? 'Guardar cambios' : 'Crear reparación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RepairCard({
  repair, onNavigate, onAdvance, muted = false,
}: {
  repair: Repair;
  onNavigate: () => void;
  onAdvance: (r: Repair) => void;
  muted?: boolean;
}) {
  return (
    <div
      className="card"
      style={{ padding: '14px 18px', cursor: 'pointer', opacity: muted ? 0.6 : 1 }}
      onClick={onNavigate}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{repair.client_name}</span>
            {repair.client_phone && (
              <a href={`tel:${repair.client_phone}`} style={{ color: 'var(--text-3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}
                onClick={e => e.stopPropagation()}>
                <Phone size={12} /> {repair.client_phone}
              </a>
            )}
            <StatusChip status={repair.status} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 3 }}>
            <strong>{repair.tool_description}</strong>
            {(repair.tool_brand || repair.tool_model) && (
              <span style={{ color: 'var(--text-3)' }}> · {[repair.tool_brand, repair.tool_model].filter(Boolean).join(' ')}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repair.problem_description}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Recibida {relativeDate(repair.date_received)}</span>
            {repair.date_estimated_return && !repair.date_returned && (
              <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>· entrega est. {fmtDate(repair.date_estimated_return)}</span>
            )}
            {repair.date_returned && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· entregada {fmtDate(repair.date_returned)}</span>
            )}
            {repair.final_price != null && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {repair.final_price.toFixed(2)} €</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}
          onClick={e => e.stopPropagation()}>
          {STATUS_NEXT[repair.status] && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onAdvance(repair)}
              title={STATUS_NEXT_LABEL[repair.status]}
            >
              {STATUS_NEXT_LABEL[repair.status]} <ChevronRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function RepairsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RepairStatus | ''>('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(searchParams.get('new') === '1');
  const [showHistory, setShowHistory] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listRepairs()  // always load all — split active/history client-side
      .then(({ data }) => setRepairs(data))
      .catch(err => setLoadError(describeApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Active = not yet delivered; history = delivered
  const active  = repairs.filter(r => r.status !== 'entregada');
  const history = repairs.filter(r => r.status === 'entregada');

  // Filter + search apply only to active items
  const filtered = active.filter(r => {
    const matchStatus = !filter || r.status === filter;
    const matchSearch = !search ||
      r.client_name.toLowerCase().includes(search.toLowerCase()) ||
      r.tool_description.toLowerCase().includes(search.toLowerCase()) ||
      (r.tool_brand ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleSaved = (r: Repair) => {
    setRepairs(prev => {
      const idx = prev.findIndex(x => x.id === r.id);
      if (idx >= 0) { const a = [...prev]; a[idx] = r; return a; }
      return [r, ...prev];
    });
    setShowModal(false);
  };

  const advanceStatus = async (repair: Repair) => {
    const next = STATUS_NEXT[repair.status];
    if (!next) return;
    const { data } = await updateRepair(repair.id, { status: next });
    setRepairs(prev => prev.map(r => r.id === data.id ? data : r));
  };

  return (
    <div className="page">
      {loadError && (
        <ConnectionError message={loadError} onRetry={load} />
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>Reparaciones</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Seguimiento de herramientas en servicio técnico</p>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowModal(true)}>
          <Plus size={15} /> Nueva reparación
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            className="form-input"
            placeholder="Buscar cliente o herramienta…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32, margin: 0 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value as RepairStatus | '')}
              className={`btn btn-sm ${filter === s.value ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s.label}
              {s.value && (
                <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>
                  {active.filter(r => r.status === s.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Active list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : loadError ? null : filtered.length === 0 && active.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Wrench size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">No hay reparaciones activas</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
            <Plus size={14} /> Crear primera reparación
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: '28px 0' }}>
          <div className="empty-state-text">Sin resultados para este filtro</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(repair => (
            <RepairCard key={repair.id} repair={repair} onNavigate={() => navigate(`/reparaciones/${repair.id}`)} onAdvance={advanceStatus} />
          ))}
        </div>
      )}

      {/* Historial — entregadas */}
      {!loading && history.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <button
            onClick={() => setShowHistory(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0',
              color: 'var(--text-3)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <ChevronRight size={14} style={{ transform: showHistory ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
            Historial — {history.length} entregada{history.length !== 1 ? 's' : ''}
          </button>
          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {history.map(repair => (
                <RepairCard key={repair.id} repair={repair} onNavigate={() => navigate(`/reparaciones/${repair.id}`)} onAdvance={advanceStatus} muted />
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <RepairModal
          repair={null}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
