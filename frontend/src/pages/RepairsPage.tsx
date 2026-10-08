import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Search, Phone, ChevronRight, MessageCircle, CheckCheck, X } from 'lucide-react';
import { listRepairs, createRepair, updateRepair, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { Vacio } from '../components/Pegatinas';
import { useCfToast } from '../components/CfToast';
import { ImporteModal, leerImporte, fmtEur, telWhatsApp, textoReparacion } from '../components/AvisoCliente';
import { coincide, fechaES } from '../lib/texto';
import { mensajeError } from '../lib/descargas';
import { REPARACION_ESTADO, REPARACION_SIGUIENTE } from '../lib/estados';
import type { Repair, RepairStatus } from '../types';

const STATUSES: { value: RepairStatus | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'recibida', label: REPARACION_ESTADO.recibida },
  { value: 'en_taller', label: REPARACION_ESTADO.en_taller },
  { value: 'reparada', label: REPARACION_ESTADO.reparada },
];

const STATUS_NEXT: Record<RepairStatus, RepairStatus | null> = {
  recibida: 'en_taller',
  en_taller: 'reparada',
  reparada: 'entregada',
  entregada: null,
};

function StatusChip({ status }: { status: RepairStatus }) {
  return <span className={`status-chip ${status}`}>{REPARACION_ESTADO[status]}</span>;
}

/** Busca en todo lo de la reparación: cliente, teléfono, herramienta, marca, modelo, problema y notas. */
const coincideReparacion = (r: Repair, q: string) =>
  coincide(q, r.client_name, r.client_phone, r.tool_description, r.tool_brand, r.tool_model, r.problem_description, r.notes);

// Fecha guardada → «11/04/2026»
const fmtDate = (dt?: string | null) => fechaES(dt ? dt.split('T')[0] : dt);

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
  const [error, setErrorRaw] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  // Al salir un error, se lleva a la vista para que se vea (el formulario tiene scroll)
  const setError = (m: string) => { setErrorRaw(m); if (m) requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };

  const set = (k: keyof RepairFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Escape cierra; en el ordenador, tocar fuera también
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const presupuesto = leerImporte(form.estimated_price);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name.trim()) { setError('Falta el nombre del cliente'); return; }
    if (!form.tool_description.trim()) { setError('Falta qué herramienta es'); return; }
    if (!form.problem_description.trim()) { setError('Falta qué le pasa a la herramienta'); return; }
    if (!presupuesto.ok) { setError(`Presupuesto: ${presupuesto.error}`); return; }
    if (form.date_estimated_return && form.date_received && form.date_estimated_return < form.date_received) {
      setError('La fecha prevista no puede ser anterior a cuando se recibió'); return;
    }
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
        estimated_price: presupuesto.ok ? presupuesto.n ?? undefined : undefined,
        notes: form.notes.trim() || undefined,
        status: repair?.status ?? 'recibida' as RepairStatus,
        date_received: fromDateInput(form.date_received),
        date_estimated_return: fromDateInput(form.date_estimated_return),
      };
      const { data } = repair
        ? await updateRepair(repair.id, payload)
        : await createRepair(payload as any);
      onSaved(data);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo guardar la reparación'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && window.innerWidth > 768) onClose(); }}>
      <div className="modal rep-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            {repair ? 'Editar reparación' : 'Nueva reparación'}
          </span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
            {error && (
              <div className="doc-aviso error" ref={errorRef} role="alert">{error}</div>
            )}

            <div className="rep-modal-2">
              <div>
                <label className="form-label">Cliente *</label>
                <input className="form-input" value={form.client_name} onChange={set('client_name')} placeholder="Nombre del cliente" required />
              </div>
              <div>
                <label className="form-label">Teléfono (para avisarle)</label>
                <input className="form-input" value={form.client_phone} onChange={set('client_phone')} placeholder="666 123 456" type="tel" />
              </div>
            </div>

            <div className="rep-modal-2">
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

            <div className="rep-modal-fechas">
              <div>
                <label className="form-label">Recibida el</label>
                <input className="form-input" type="date" value={form.date_received} onChange={set('date_received')} />
              </div>
              <div>
                <label className="form-label">Fecha prevista</label>
                <input className="form-input" type="date" value={form.date_estimated_return} onChange={set('date_estimated_return')} />
              </div>
              <div>
                <label className="form-label">Presupuesto (€)</label>
                <input className="form-input" value={form.estimated_price} onChange={set('estimated_price')} placeholder="0,00" type="text" inputMode="decimal" aria-invalid={!presupuesto.ok} />
                {!presupuesto.ok && <small className="campo-error">{presupuesto.error}</small>}
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
  repair, onNavigate, onAdvance, onAvisado, muted = false,
}: {
  repair: Repair;
  onNavigate: () => void;
  onAdvance: (r: Repair) => void;
  onAvisado: (r: Repair) => void;
  muted?: boolean;
}) {
  return (
    <div
      className="card firma-card rep-card"
      style={{ cursor: 'pointer', opacity: muted ? 0.7 : 1, display: 'block' }}
      onClick={onNavigate}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{repair.client_name}</span>
            {repair.client_phone ? (
              <a href={`tel:${repair.client_phone}`} style={{ color: 'var(--text-3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}
                onClick={e => e.stopPropagation()}>
                <Phone size={12} /> {repair.client_phone}
              </a>
            ) : repair.status !== 'entregada' && (
              <span className="aviso-chip">Falta el teléfono para avisar</span>
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
            {repair.final_price != null ? (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· cobrado {fmtEur(repair.final_price)}</span>
            ) : repair.estimated_price != null && (
              <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>· presupuesto {fmtEur(repair.estimated_price)}</span>
            )}
            {repair.status === 'reparada' && (repair.aviso_at
              ? <span className="aviso-chip hecho"><CheckCheck size={13} /> Cliente avisado</span>
              : <span className="aviso-chip">Sin avisar al cliente</span>)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}
          onClick={e => e.stopPropagation()}>
          {repair.status === 'reparada' && !repair.aviso_at && telWhatsApp(repair.client_phone) && (
            <a className="btn wa-btn" target="_blank" rel="noopener noreferrer"
              href={`https://wa.me/${telWhatsApp(repair.client_phone)}?text=${encodeURIComponent(textoReparacion(repair.client_name, repair.tool_description, repair.final_price))}`}
              onClick={() => onAvisado(repair)}>
              <MessageCircle size={16} /> Avisar
            </a>
          )}
          {STATUS_NEXT[repair.status] && (
            <button
              className={`btn ${repair.status === 'reparada' && !repair.aviso_at ? 'btn-ghost' : 'btn-primary'}`}
              onClick={() => onAdvance(repair)}
              title={REPARACION_SIGUIENTE[repair.status]}
            >
              {REPARACION_SIGUIENTE[repair.status]} <ChevronRight size={13} />
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
  const { toast, show } = useCfToast();

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

  // El filtro de estado es para las que están en curso; la búsqueda mira también en el historial
  const filtered = active.filter(r => (!filter || r.status === filter) && (!search.trim() || coincideReparacion(r, search)));
  const historyFiltered = search.trim() ? history.filter(r => coincideReparacion(r, search)) : history;
  const verHistorial = showHistory || (!!search.trim() && historyFiltered.length > 0);

  const handleSaved = (r: Repair) => {
    setRepairs(prev => {
      const idx = prev.findIndex(x => x.id === r.id);
      if (idx >= 0) { const a = [...prev]; a[idx] = r; return a; }
      return [r, ...prev];
    });
    setShowModal(false);
    show(`Reparación de ${r.client_name} apuntada`);
  };

  const NOMBRE: Record<RepairStatus, string> = { recibida: 'recibida', en_taller: 'en el taller', reparada: 'lista', entregada: 'entregada' };
  const [entregar, setEntregar] = useState<Repair | null>(null);
  const pedirAvance = (repair: Repair) => {
    if (STATUS_NEXT[repair.status] === 'entregada') setEntregar(repair);
    else advanceStatus(repair);
  };
  const avisado = async (repair: Repair) => {
    try {
      const { data } = await updateRepair(repair.id, { aviso_at: new Date().toISOString() });
      setRepairs(prev => prev.map(r => r.id === data.id ? data : r));
    } catch { /* WhatsApp ya se abrió */ }
  };
  const advanceStatus = async (repair: Repair, importe?: number | null) => {
    const next = STATUS_NEXT[repair.status];
    if (!next) return;
    try {
      const { data } = await updateRepair(repair.id, next === 'entregada' ? { status: next, final_price: importe ?? null } : { status: next });
      setRepairs(prev => prev.map(r => r.id === data.id ? data : r));
      show(`${repair.tool_description} de ${repair.client_name}: ${NOMBRE[next]}`, {
        undo: async () => {
          try {
            const { data: back } = await updateRepair(repair.id, {
              status: repair.status,
              ...(next === 'en_taller' ? { date_sent_to_repair: null } : next === 'reparada' ? { date_repaired: null } : { date_returned: null, final_price: repair.final_price ?? null }),
            });
            setRepairs(prev => prev.map(r => r.id === back.id ? back : r));
          } catch (err) {
            show(`No se pudo deshacer: ${mensajeError(err, 'error')}`, { error: true });
          }
        },
      });
    } catch (err) {
      show(`No se pudo guardar: ${mensajeError(err, describeApiError(err))}`, { error: true });
    }
  };

  return (
    <div className="page">
      {loadError && (
        <ConnectionError message={loadError} onRetry={load} />
      )}
      {/* Header */}
      <div className="inicio-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>Reparaciones</h1>
          <p>Herramientas de clientes que están en el servicio técnico.</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setShowModal(true)}>
          <Plus size={19} /> Nueva reparación
        </button>
      </div>

      {/* Filters */}
      <div className="firma-vistas" role="tablist" aria-label="Estado" style={{ marginBottom: 12 }}>
        {STATUSES.map(st => (
          <button key={st.value} role="tab" aria-selected={filter === st.value}
            onClick={() => setFilter(st.value as RepairStatus | '')}
            className={`firma-vista${filter === st.value ? ' on' : ''}`}>
            {st.value === '' ? 'Todas' : st.label}
            <span className="firma-vista-n">{st.value ? active.filter(r => r.status === st.value).length : active.length}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            className="form-input"
            type="search"
            placeholder="Buscar cliente, teléfono, herramienta, modelo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 42, margin: 0, borderRadius: 999 }}
          />
        </div>
      </div>

      {/* Active list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : loadError ? null : filtered.length === 0 && active.length === 0 ? (
        <Vacio dibujo="llaveSola" titulo="Sin reparaciones en curso" texto="Cuando entre una máquina a reparar, apúntala aquí.">
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowModal(true)}><Plus size={14} /> Nueva reparación</button>
        </Vacio>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: '28px 0' }}>
          <div className="empty-state-text">
            {search.trim()
              ? historyFiltered.length ? `Nada en curso con «${search.trim()}»; mira en el historial de abajo.` : `Nada con «${search.trim()}»`
              : 'Sin resultados para este filtro'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(repair => (
            <RepairCard key={repair.id} repair={repair} onNavigate={() => navigate(`/reparaciones/${repair.id}`)} onAdvance={pedirAvance} onAvisado={avisado} />
          ))}
        </div>
      )}

      {/* Historial — entregadas */}
      {!loading && historyFiltered.length > 0 && (
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
            <ChevronRight size={14} style={{ transform: verHistorial ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
            Historial — {historyFiltered.length} entregada{historyFiltered.length !== 1 ? 's' : ''}{search.trim() ? ` con «${search.trim()}»` : ''}
          </button>
          {verHistorial && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {historyFiltered.map(repair => (
                <RepairCard key={repair.id} repair={repair} onNavigate={() => navigate(`/reparaciones/${repair.id}`)} onAdvance={pedirAvance} onAvisado={avisado} muted />
              ))}
            </div>
          )}
        </div>
      )}

      {toast}
      {entregar && (
        <ImporteModal
          titulo="Entregar al cliente"
          texto={`¿Cuánto se le cobra a ${entregar.client_name}?`}
          inicial={entregar.final_price ?? entregar.estimated_price}
          boton="Marcar como entregada"
          onCancel={() => setEntregar(null)}
          onOk={importe => { const r = entregar; setEntregar(null); advanceStatus(r, importe); }}
        />
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
