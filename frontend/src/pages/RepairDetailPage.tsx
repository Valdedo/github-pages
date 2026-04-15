import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Wrench, Phone, Trash2, ChevronRight, RotateCcw, Save } from 'lucide-react';
import { getRepair, updateRepair, deleteRepair } from '../api/client';
import { useConfirm } from '../components/ConfirmModal';
import { useIsMobile } from '../hooks';
import type { Repair, RepairStatus } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STEPS: RepairStatus[] = ['recibida', 'en_taller', 'reparada', 'entregada'];

const STATUS_LABELS: Record<RepairStatus, string> = {
  recibida: 'Recibida', en_taller: 'En taller', reparada: 'Reparada', entregada: 'Entregada',
};

const STATUS_NEXT: Record<RepairStatus, { status: RepairStatus; label: string } | null> = {
  recibida:  { status: 'en_taller', label: 'Enviar a taller' },
  en_taller: { status: 'reparada',  label: 'Marcar reparada' },
  reparada:  { status: 'entregada', label: 'Marcar entregada' },
  entregada: null,
};

const STATUS_PREV: Record<RepairStatus, { status: RepairStatus; label: string } | null> = {
  recibida:  null,
  en_taller: { status: 'recibida',  label: 'Deshacer envío a taller' },
  reparada:  { status: 'en_taller', label: 'Volver a "En taller"' },
  entregada: { status: 'reparada',  label: 'Deshacer entrega' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dt?: string | null): string {
  if (!dt) return '';
  const [y, m, d] = dt.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function toDateInput(dt?: string | null): string {
  if (!dt) return '';
  return dt.split('T')[0];
}

function fromDateInput(s: string): string | undefined {
  if (!s) return undefined;
  return s + 'T12:00:00';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusChip({ status }: { status: RepairStatus }) {
  return <span className={`status-chip ${status}`}>{STATUS_LABELS[status]}</span>;
}

function StatusBar({ status }: { status: RepairStatus }) {
  const idx = STATUS_STEPS.indexOf(status);
  return (
    <div style={{ overflowX: 'auto', marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 260 }}>
        {STATUS_STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STATUS_STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i <= idx ? 'var(--brand)' : 'var(--border)',
                color: i <= idx ? '#fff' : 'var(--text-3)',
                fontSize: 12, fontWeight: 700, transition: 'background 0.2s',
                flexShrink: 0,
              }}>
                {i < idx ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: i === idx ? 700 : 400, color: i === idx ? 'var(--brand)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                {STATUS_LABELS[s]}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < idx ? 'var(--brand)' : 'var(--border)', margin: '0 4px', marginBottom: 14 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  client_name: string;
  client_phone: string;
  tool_brand: string;
  tool_model: string;
  tool_description: string;
  problem_description: string;
  estimated_price: string;
  final_price: string;
  notes: string;
  date_received: string;
  date_sent_to_repair: string;
  date_repaired: string;
  date_estimated_return: string;
  date_returned: string;
}

function repairToForm(r: Repair): FormState {
  return {
    client_name: r.client_name,
    client_phone: r.client_phone ?? '',
    tool_brand: r.tool_brand ?? '',
    tool_model: r.tool_model ?? '',
    tool_description: r.tool_description,
    problem_description: r.problem_description,
    estimated_price: r.estimated_price != null ? String(r.estimated_price) : '',
    final_price: r.final_price != null ? String(r.final_price) : '',
    notes: r.notes ?? '',
    date_received: toDateInput(r.date_received),
    date_sent_to_repair: toDateInput(r.date_sent_to_repair),
    date_repaired: toDateInput(r.date_repaired),
    date_estimated_return: toDateInput(r.date_estimated_return),
    date_returned: toDateInput(r.date_returned),
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function RepairDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const { confirm, ConfirmDialog } = useConfirm();
  const [repair, setRepair] = useState<Repair | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await getRepair(Number(id));
      setRepair(data);
      setForm(repairToForm(data));
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => f ? { ...f, [k]: e.target.value } : f);
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!repair || !form) return;
    if (!form.client_name.trim()) { setError('El nombre del cliente es obligatorio'); return; }
    if (!form.tool_description.trim()) { setError('La descripción de la herramienta es obligatoria'); return; }
    if (!form.problem_description.trim()) { setError('La descripción del problema es obligatoria'); return; }
    setSaving(true);
    setError('');
    try {
      const { data } = await updateRepair(repair.id, {
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim() || undefined,
        tool_brand: form.tool_brand.trim() || undefined,
        tool_model: form.tool_model.trim() || undefined,
        tool_description: form.tool_description.trim(),
        problem_description: form.problem_description.trim(),
        estimated_price: form.estimated_price ? parseFloat(form.estimated_price) : undefined,
        final_price: form.final_price ? parseFloat(form.final_price) : undefined,
        notes: form.notes.trim() || undefined,
        date_received: fromDateInput(form.date_received),
        date_sent_to_repair: fromDateInput(form.date_sent_to_repair),
        date_repaired: fromDateInput(form.date_repaired),
        date_estimated_return: fromDateInput(form.date_estimated_return),
        date_returned: fromDateInput(form.date_returned),
      });
      setRepair(data);
      setForm(repairToForm(data));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(detail ? `Error: ${detail}` : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: RepairStatus) => {
    if (!repair) return;
    const { data } = await updateRepair(repair.id, { status: newStatus });
    setRepair(data);
    setForm(repairToForm(data));
    setDirty(false);
  };

  const handleDelete = async () => {
    if (!repair) return;
    const ok = await confirm({
      title: 'Eliminar reparación',
      message: `¿Eliminar la reparación de ${repair.client_name}? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await deleteRepair(repair.id);
    navigate('/reparaciones');
  };

  if (loading) {
    return <div className="page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Cargando…</div>;
  }

  if (!repair || !form) {
    return <div className="page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Reparación no encontrada.</div>;
  }

  const nextStep = STATUS_NEXT[repair.status];
  const prevStep = STATUS_PREV[repair.status];

  // Bottom save bar clears the mobile nav (64px) + margin
  const saveBarBottom = isMobile ? 76 : 16;

  return (
    <div className="page">
      {ConfirmDialog}

      {/* ── Top header (desktop only back button — mobile header handles navigation) ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              <Wrench size={16} style={{ verticalAlign: 'middle', marginRight: 6, opacity: 0.6 }} />
              {repair.client_name}
            </h1>
            <StatusChip status={repair.status} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            {repair.client_phone && (
              <a href={`tel:${repair.client_phone}`} style={{ fontSize: 13, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                <Phone size={13} /> {repair.client_phone}
              </a>
            )}
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {repair.tool_description}
              {(repair.tool_brand || repair.tool_model) && ` · ${[repair.tool_brand, repair.tool_model].filter(Boolean).join(' ')}`}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {!isMobile && dirty && (
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ gap: 5 }}>
              <Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
          {!isMobile && saved && !dirty && (
            <span style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 600 }}>✓ Guardado</span>
          )}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={handleDelete} title="Eliminar reparación">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* ── Status flow ── */}
      <SectionCard title="Estado de la reparación">
        <StatusBar status={repair.status} />
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {prevStep && (
            <button className="btn btn-ghost btn-sm" onClick={() => handleStatusChange(prevStep.status)} style={{ gap: 5 }}>
              <RotateCcw size={13} /> {prevStep.label}
            </button>
          )}
          {nextStep && (
            <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(nextStep.status)} style={{ gap: 5 }}>
              {nextStep.label} <ChevronRight size={13} />
            </button>
          )}
          {!nextStep && repair.status === 'entregada' && (
            <span style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 600 }}>✓ Reparación completada</span>
          )}
        </div>
      </SectionCard>

      {/* ── Fields grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>

        {/* Cliente */}
        <SectionCard title="👤 Datos del cliente">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Nombre del cliente *">
              <input className="form-input" value={form.client_name} onChange={set('client_name')} placeholder="Nombre completo" />
            </Field>
            <Field label="Teléfono">
              <input className="form-input" value={form.client_phone} onChange={set('client_phone')} placeholder="666 123 456" type="tel" />
            </Field>
          </div>
        </SectionCard>

        {/* Herramienta */}
        <SectionCard title="🔧 Herramienta">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Descripción *">
              <input className="form-input" value={form.tool_description} onChange={set('tool_description')} placeholder="Ej: Taladro percutor" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Marca">
                <input className="form-input" value={form.tool_brand} onChange={set('tool_brand')} placeholder="Bosch…" />
              </Field>
              <Field label="Modelo">
                <input className="form-input" value={form.tool_model} onChange={set('tool_model')} placeholder="GSB 13…" />
              </Field>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Problema */}
      <div style={{ marginTop: 12 }}>
        <SectionCard title="📝 Problema">
          <textarea
            className="form-input"
            value={form.problem_description}
            onChange={set('problem_description')}
            placeholder="Describe el problema…"
            rows={3}
            style={{ resize: 'vertical', margin: 0 }}
          />
        </SectionCard>
      </div>

      {/* Fechas + Precios */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>

        {/* Fechas */}
        <SectionCard title="📅 Fechas">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="📥 Recibida">
              <input className="form-input" type="date" value={form.date_received} onChange={set('date_received')} />
            </Field>
            <Field label="🔧 Al taller">
              <input className="form-input" type="date" value={form.date_sent_to_repair} onChange={set('date_sent_to_repair')} />
            </Field>
            <Field label="✅ Reparada">
              <input className="form-input" type="date" value={form.date_repaired} onChange={set('date_repaired')} />
            </Field>
            <Field label="🏠 Entregada">
              <input className="form-input" type="date" value={form.date_returned} onChange={set('date_returned')} />
            </Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="📆 Entrega estimada">
              <input className="form-input" type="date" value={form.date_estimated_return} onChange={set('date_estimated_return')} />
            </Field>
          </div>
        </SectionCard>

        {/* Precios + Notas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionCard title="💰 Precios">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Estimado (€)">
                <input className="form-input" type="number" step="0.01" min="0"
                  value={form.estimated_price} onChange={set('estimated_price')} placeholder="0,00" />
              </Field>
              <Field label="Final (€)">
                <input className="form-input" type="number" step="0.01" min="0"
                  value={form.final_price} onChange={set('final_price')} placeholder="0,00" />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="📌 Notas">
            <textarea
              className="form-input"
              value={form.notes}
              onChange={set('notes')}
              placeholder="Notas adicionales…"
              rows={3}
              style={{ resize: 'vertical', margin: 0 }}
            />
          </SectionCard>
        </div>
      </div>

      {/* ── Bottom save bar (visible when dirty) ── */}
      {dirty && (
        <div style={{
          position: 'sticky', bottom: saveBarBottom, marginTop: 16,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgb(0 0 0 / .10)',
          zIndex: 10,
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {isMobile ? 'Sin guardar' : 'Tienes cambios sin guardar'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setForm(repairToForm(repair)); setDirty(false); setError(''); }}>
              Descartar
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
