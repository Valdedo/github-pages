import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Wrench, Phone, Trash2, ChevronRight, RotateCcw, Save, ArrowLeft, HandCoins } from 'lucide-react';
import { getRepair, updateRepair, deleteRepair, describeApiError } from '../api/client';
import { useConfirm } from '../components/ConfirmModal';
import { useCfToast } from '../components/CfToast';
import { BotonWhatsApp, ImporteModal, textoReparacion, numES, leerImporte, fmtEur } from '../components/AvisoCliente';
import { REPARACION_ESTADO, REPARACION_SIGUIENTE } from '../lib/estados';
import { mensajeError } from '../lib/descargas';
import type { Repair, RepairStatus } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STEPS: RepairStatus[] = ['recibida', 'en_taller', 'reparada', 'entregada'];

const STATUS_LABELS = REPARACION_ESTADO;

const STATUS_NEXT: Record<RepairStatus, { status: RepairStatus; label: string } | null> = {
  recibida:  { status: 'en_taller', label: REPARACION_SIGUIENTE.recibida },
  en_taller: { status: 'reparada',  label: REPARACION_SIGUIENTE.en_taller },
  reparada:  { status: 'entregada', label: REPARACION_SIGUIENTE.reparada },
  entregada: null,
};

const STATUS_PREV: Record<RepairStatus, { status: RepairStatus; label: string } | null> = {
  recibida:  null,
  en_taller: { status: 'recibida',  label: 'Deshacer envío al taller' },
  reparada:  { status: 'en_taller', label: 'Volver a «En el taller»' },
  entregada: { status: 'reparada',  label: 'Deshacer entrega' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateInput(dt?: string | null): string {
  if (!dt) return '';
  return dt.split('T')[0];
}

function fromDateInput(s: string): string | null {
  if (!s) return null;
  return s + 'T12:00:00';
}

const precioTxt = (n?: number | null) => (n != null ? String(n).replace('.', ',') : '');

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBar({ status }: { status: RepairStatus }) {
  const idx = status === 'entregada' ? STATUS_STEPS.length : STATUS_STEPS.indexOf(status);
  return (
    <div className="pasos" aria-label={`Estado: ${STATUS_LABELS[status]}`}>
      {STATUS_STEPS.map((s, i) => (
        <div key={s} className={`paso${i < idx ? ' hecho' : ''}${i === idx || (idx === STATUS_STEPS.length && i === idx - 1) ? ' actual' : ''}`}>
          <span className="paso-bola">{i < idx ? '✓' : i + 1}</span>
          <span className="paso-txt">{STATUS_LABELS[s]}</span>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card seccion">
      <div className="seccion-titulo">{title}</div>
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
    estimated_price: precioTxt(r.estimated_price),
    final_price: precioTxt(r.final_price),
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

  const { confirm, ConfirmDialog } = useConfirm();
  const { toast, show } = useCfToast();
  const [repair, setRepair] = useState<Repair | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setErrorRaw] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  // Los errores se llevan a la vista: si no, con la página bajada no se ven
  const setError = (m: string) => { setErrorRaw(m); if (m) requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })); };
  const [entregando, setEntregando] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await getRepair(Number(id));
      setRepair(data);
      setForm(repairToForm(data));
      setDirty(false);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Avisa antes de cerrar o recargar la página con cambios sin guardar
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => f ? { ...f, [k]: e.target.value } : f);
    setDirty(true);
  };

  /** Lo que hay escrito en el formulario, listo para guardar (vacío = borrar). */
  const datosFormulario = (): Parameters<typeof updateRepair>[1] | null => {
    if (!form) return null;
    if (!form.client_name.trim()) { setError('Falta el nombre del cliente'); return null; }
    if (!form.tool_description.trim()) { setError('Falta qué herramienta es'); return null; }
    if (!form.problem_description.trim()) { setError('Falta qué le pasa'); return null; }
    const le = leerImporte(form.estimated_price), lf = leerImporte(form.final_price);
    if (!le.ok) { setError(`Presupuesto: ${le.error}`); return null; }
    if (!lf.ok) { setError(`Cobrado: ${lf.error}`); return null; }
    const est = le.n, fin = lf.n;
    if (form.date_estimated_return && form.date_received && form.date_estimated_return < form.date_received) {
      setError('La fecha prevista no puede ser anterior a cuando se recibió'); return null;
    }
    setError('');
    return {
      client_name: form.client_name.trim(),
      client_phone: form.client_phone.trim() || null,
      tool_brand: form.tool_brand.trim() || null,
      tool_model: form.tool_model.trim() || null,
      tool_description: form.tool_description.trim(),
      problem_description: form.problem_description.trim(),
      estimated_price: est,
      final_price: fin,
      notes: form.notes.trim() || null,
      date_received: fromDateInput(form.date_received) ?? undefined,
      date_sent_to_repair: fromDateInput(form.date_sent_to_repair),
      date_repaired: fromDateInput(form.date_repaired),
      date_estimated_return: fromDateInput(form.date_estimated_return),
      date_returned: fromDateInput(form.date_returned),
    };
  };

  const guardarRespuesta = (data: Repair) => {
    setRepair(data);
    setForm(repairToForm(data));
    setDirty(false);
  };

  const handleSave = async () => {
    if (!repair) return;
    const datos = datosFormulario();
    if (!datos) return;
    setSaving(true);
    try {
      guardarRespuesta((await updateRepair(repair.id, datos)).data);
      show('Cambios guardados');
    } catch (err) {
      const m = `No se pudo guardar: ${mensajeError(err, describeApiError(err))}`;
      setError(m);
      show(m, { error: true });
    } finally {
      setSaving(false);
    }
  };

  /** Cambia el estado guardando a la vez lo que se haya escrito (no se pierde nada). */
  const cambiarEstado = async (status: RepairStatus, extra: Parameters<typeof updateRepair>[1] = {}) => {
    if (!repair) return;
    let datos: Parameters<typeof updateRepair>[1] = {};
    if (dirty) {
      const d = datosFormulario();
      if (!d) return;
      datos = d;
      // Las fechas de seguimiento las pone el servidor al cambiar de estado
      if (status === 'en_taller' && !form?.date_sent_to_repair) delete datos.date_sent_to_repair;
      if (status === 'reparada' && !form?.date_repaired) delete datos.date_repaired;
      if (status === 'entregada' && !form?.date_returned) delete datos.date_returned;
    }
    const antes = repair.status;
    try {
      guardarRespuesta((await updateRepair(repair.id, { ...datos, ...extra, status })).data);
      show(`${repair.tool_description}: ${STATUS_LABELS[status].toLowerCase()}`, {
        undo: async () => {
          try {
            guardarRespuesta((await updateRepair(repair.id, {
              status: antes,
              ...(status === 'en_taller' ? { date_sent_to_repair: null } : {}),
              ...(status === 'reparada' ? { date_repaired: null } : {}),
              ...(status === 'entregada' ? { date_returned: null } : {}),
            })).data);
          } catch (err) { show(`No se pudo deshacer: ${mensajeError(err, 'error')}`, { error: true }); }
        },
      });
    } catch (err) {
      show(`No se pudo cambiar: ${describeApiError(err)}`, { error: true });
    }
  };

  const handleRevert = async () => {
    if (!repair) return;
    const prev = STATUS_PREV[repair.status];
    if (!prev) return;
    const ok = await confirm({ title: 'Cambiar estado', message: `¿${prev.label}?`, confirmLabel: 'Sí, cambiar' });
    if (!ok) return;
    const borrar = repair.status === 'en_taller' ? { date_sent_to_repair: null }
      : repair.status === 'reparada' ? { date_repaired: null }
      : repair.status === 'entregada' ? { date_returned: null } : {};
    try { guardarRespuesta((await updateRepair(repair.id, { status: prev.status, ...borrar })).data); }
    catch (err) { show(`No se pudo cambiar: ${describeApiError(err)}`, { error: true }); }
  };

  const avisado = async () => {
    if (!repair) return;
    try { const { data } = await updateRepair(repair.id, { aviso_at: new Date().toISOString() }); setRepair(r => r ? { ...r, aviso_at: data.aviso_at } : r); }
    catch { /* el aviso ya se abrió; apuntarlo no es imprescindible */ }
  };

  const handleDelete = async () => {
    if (!repair) return;
    const ok = await confirm({
      title: 'Borrar reparación',
      message: `¿Borrar la reparación de ${repair.client_name}? No se puede deshacer.`,
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRepair(repair.id);
      navigate('/reparaciones');
    } catch (err) {
      show(`No se pudo borrar: ${describeApiError(err)}`, { error: true });
    }
  };

  if (loading) {
    return <div className="page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Cargando…</div>;
  }

  if (!repair || !form) {
    return <div className="page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>{error || 'Reparación no encontrada.'}</div>;
  }

  const nextStep = STATUS_NEXT[repair.status];
  const prevStep = STATUS_PREV[repair.status];
  const importeAviso = numES(form.final_price) ?? null;

  return (
    <div className={`page rep-detalle${dirty ? ' con-barra' : ''}`}>
      {ConfirmDialog}
      {toast}

      <div className="pedido-head">
        <div style={{ flex: '1 1 100%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="doc-volver" onClick={() => navigate('/reparaciones')}><ArrowLeft size={16} /> Reparaciones</button>
            <h1>{repair.client_name}</h1>
            <span className={`status-chip ${repair.status}`}>{STATUS_LABELS[repair.status]}</span>
          </div>
          <div className="pedido-sub">
            <span><Wrench size={15} /> {repair.tool_description}{(repair.tool_brand || repair.tool_model) && ` · ${[repair.tool_brand, repair.tool_model].filter(Boolean).join(' ')}`}</span>
            {repair.client_phone && <a href={`tel:${repair.client_phone}`}><Phone size={15} /> {repair.client_phone}</a>}
          </div>
        </div>
      </div>

      {error && <div className="doc-aviso error" style={{ marginTop: 12 }} ref={errorRef} role="alert">{error}</div>}

      {/* ── Estado y siguiente paso ── */}
      <div className="card seccion" style={{ marginTop: 12 }}>
        <StatusBar status={repair.status} />

        {repair.status === 'reparada' && (
          <div className="rep-lista">
            <BotonWhatsApp
              telefono={repair.client_phone}
              texto={textoReparacion(repair.client_name, repair.tool_description, importeAviso)}
              avisadoEl={repair.aviso_at}
              onAvisado={avisado}
            />
          </div>
        )}

        <div className="rep-acciones">
          {nextStep && (
            <button className={`btn ${repair.status === 'reparada' ? 'btn-ghost' : 'btn-primary'} btn-lg`}
              onClick={() => nextStep.status === 'entregada' ? setEntregando(true) : cambiarEstado(nextStep.status)}>
              {nextStep.status === 'entregada' ? <HandCoins size={18} /> : null}
              {nextStep.label} {nextStep.status !== 'entregada' && <ChevronRight size={18} />}
            </button>
          )}
          {repair.status === 'entregada' && (
            <span className="rep-hecha">
              ✓ Entregada{repair.final_price != null ? ` · cobrado ${fmtEur(repair.final_price)}` : ''}
            </span>
          )}
          {prevStep && (
            <button className="btn btn-ghost btn-sm" onClick={handleRevert} style={{ color: 'var(--text-3)' }}>
              <RotateCcw size={14} /> {prevStep.label}
            </button>
          )}
        </div>
      </div>

      {/* ── Datos ── */}
      <div className="rep-rejilla">
        <SectionCard title="Cliente">
          <div className="campos">
            <Field label="Nombre *">
              <input className="form-input" value={form.client_name} onChange={set('client_name')} placeholder="Nombre del cliente" />
            </Field>
            <Field label="Teléfono (para avisarle)">
              <input className="form-input" value={form.client_phone} onChange={set('client_phone')} placeholder="666 123 456" type="tel" />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Herramienta">
          <div className="campos">
            <Field label="Qué es *">
              <input className="form-input" value={form.tool_description} onChange={set('tool_description')} placeholder="Ej: Taladro percutor" />
            </Field>
            <div className="campos-2">
              <Field label="Marca">
                <input className="form-input" value={form.tool_brand} onChange={set('tool_brand')} placeholder="Bosch…" />
              </Field>
              <Field label="Modelo">
                <input className="form-input" value={form.tool_model} onChange={set('tool_model')} placeholder="GSB 13…" />
              </Field>
            </div>
            <Field label="Qué le pasa *">
              <textarea className="form-input" value={form.problem_description} onChange={set('problem_description')}
                placeholder="Describe el problema…" rows={3} style={{ resize: 'vertical', margin: 0 }} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Precio">
          <div className="campos-2">
            <Field label="Presupuesto (€)">
              <input className="form-input" type="text" inputMode="decimal" value={form.estimated_price} onChange={set('estimated_price')} placeholder="0,00" />
            </Field>
            <Field label="Cobrado (€)">
              <input className="form-input" type="text" inputMode="decimal" value={form.final_price} onChange={set('final_price')} placeholder="0,00" />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Fechas">
          <div className="campos-2">
            <Field label="Recibida">
              <input className="form-input" type="date" value={form.date_received} onChange={set('date_received')} />
            </Field>
            <Field label="Fecha prevista">
              <input className="form-input" type="date" value={form.date_estimated_return} onChange={set('date_estimated_return')} />
            </Field>
            <Field label="Al taller">
              <input className="form-input" type="date" value={form.date_sent_to_repair} onChange={set('date_sent_to_repair')} />
            </Field>
            <Field label="Volvió reparada">
              <input className="form-input" type="date" value={form.date_repaired} onChange={set('date_repaired')} />
            </Field>
            <Field label="Entregada">
              <input className="form-input" type="date" value={form.date_returned} onChange={set('date_returned')} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Notas">
          <textarea className="form-input" value={form.notes} onChange={set('notes')}
            placeholder="Notas internas…" rows={3} style={{ resize: 'vertical', margin: 0 }} />
        </SectionCard>
      </div>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={handleDelete}>
          <Trash2 size={14} /> Borrar esta reparación
        </button>
      </div>

      {/* ── Barra de guardar (solo con cambios) ── */}
      {dirty && (
        <div className="guardar-barra">
          <span>Cambios sin guardar</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setForm(repairToForm(repair)); setDirty(false); setError(''); }}>
              Descartar
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={15} /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {entregando && (
        <ImporteModal
          titulo="Entregar al cliente"
          texto={`¿Cuánto se le cobra a ${repair.client_name}?`}
          inicial={numES(form.final_price) ?? repair.final_price ?? repair.estimated_price}
          boton="Entregada"
          onCancel={() => setEntregando(false)}
          onOk={importe => { setEntregando(false); cambiarEstado('entregada', { final_price: importe }); }}
        />
      )}
    </div>
  );
}
