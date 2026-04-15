import { useState, useEffect } from 'react';
import { Plus, Trash2, Tag, Download, Copy } from 'lucide-react';
import { downloadCustomLabels } from '../api/client';
import { useConfirm } from '../components/ConfirmModal';
import type { CustomLabelItem } from '../api/client';

// Row stores prices as RAW STRINGS so mid-typing ("0,0", "0.0") is never lost
interface Row {
  _id: string;
  descripcion: string;
  pvp_con_iva: string;        // raw string, parsed on generate
  codigo_principal: string;
  ean: string;
  coste_neto_unitario: string; // raw string, parsed on generate
  copies: number;
}

const newRow = (): Row => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '',
  pvp_con_iva: '',
  codigo_principal: '',
  ean: '',
  coste_neto_unitario: '',
  copies: 1,
});

function parseNum(s: string, fallback: number): number {
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? fallback : n;
}

// ─── Desktop table ────────────────────────────────────────────────────────────

interface TableProps {
  rows: Row[];
  setField: (id: string, key: keyof Row, value: string) => void;
  addRow: () => void;
  duplicateRow: (id: string) => void;
  removeRow: (id: string) => void;
}

function DesktopTable({ rows, setField, addRow, duplicateRow, removeRow }: TableProps) {
  const thStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const inputStyle = (invalid?: boolean): React.CSSProperties => ({
    padding: '7px 8px',
    border: `1.5px solid ${invalid ? '#fca5a5' : 'var(--grey-300)'}`,
    borderRadius: 7, fontSize: 13, fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box',
    background: invalid ? '#fff5f5' : undefined,
  });

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 90px 110px 130px 90px 70px 68px',
        gap: 8, padding: '10px 16px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg)', minWidth: 680,
      }}>
        {['Descripción *', 'PVP (€) *', 'Referencia', 'EAN / Código', 'Coste (€)', 'Copias', ''].map(h => (
          <span key={h} style={thStyle}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ minWidth: 680 }}>
        {rows.map((row, idx) => {
          const noDesc = !row.descripcion.trim();
          return (
            <div key={row._id} style={{
              display: 'grid',
              gridTemplateColumns: '2fr 90px 110px 130px 90px 70px 68px',
              gap: 8, padding: '8px 16px',
              borderBottom: '1px solid var(--border)',
              background: idx % 2 === 0 ? undefined : 'var(--bg)',
              alignItems: 'center',
            }}>
              <input style={inputStyle(noDesc)} placeholder="Nombre del artículo"
                value={row.descripcion} onChange={e => setField(row._id, 'descripcion', e.target.value)} />
              <input style={{ ...inputStyle(), textAlign: 'right' }} type="text" inputMode="decimal"
                placeholder="0,00" value={row.pvp_con_iva}
                onChange={e => setField(row._id, 'pvp_con_iva', e.target.value)} />
              <input style={inputStyle()} placeholder="REF-001"
                value={row.codigo_principal} onChange={e => setField(row._id, 'codigo_principal', e.target.value)} />
              <input style={inputStyle()} placeholder="8412345678901"
                value={row.ean} onChange={e => setField(row._id, 'ean', e.target.value)} />
              <input style={{ ...inputStyle(), textAlign: 'right' }} type="text" inputMode="decimal"
                placeholder="—" value={row.coste_neto_unitario}
                onChange={e => setField(row._id, 'coste_neto_unitario', e.target.value)} />
              <input style={{ ...inputStyle(), textAlign: 'center' }} type="number" min={1} max={50} step={1}
                value={row.copies || 1} onChange={e => setField(row._id, 'copies', e.target.value)} />
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" title="Duplicar" style={{ color: 'var(--text-3)' }}
                  onClick={() => duplicateRow(row._id)}><Copy size={12} /></button>
                <button className="btn btn-ghost btn-sm" title="Eliminar"
                  style={{ color: rows.length === 1 ? 'var(--grey-300)' : 'var(--danger)' }}
                  disabled={rows.length === 1} onClick={() => removeRow(row._id)}><Trash2 size={12} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
        <button className="btn btn-ghost btn-sm" onClick={addRow}><Plus size={13} /> Añadir artículo</button>
      </div>
    </div>
  );
}

// ─── Mobile cards ─────────────────────────────────────────────────────────────

function MobileCards({ rows, setField, addRow, duplicateRow, removeRow }: TableProps) {
  const inputCls = (invalid?: boolean) => ({
    padding: '10px 12px',
    border: `1.5px solid ${invalid ? '#fca5a5' : 'var(--grey-300)'}`,
    borderRadius: 9, fontSize: 15, fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box' as const,
    background: invalid ? '#fff5f5' : '#fff',
    WebkitAppearance: 'none' as const,
  });
  const label = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
      {text}
    </div>
  );

  return (
    <div>
      {rows.map((row, idx) => {
        const noDesc = !row.descripcion.trim();
        return (
          <div key={row._id} className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--bg)', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>
                Artículo {idx + 1}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => duplicateRow(row._id)}
                  style={{ color: 'var(--text-3)' }}><Copy size={14} /></button>
                <button className="btn btn-ghost btn-sm"
                  style={{ color: rows.length === 1 ? 'var(--grey-300)' : 'var(--danger)' }}
                  disabled={rows.length === 1} onClick={() => removeRow(row._id)}><Trash2 size={14} /></button>
              </div>
            </div>

            {/* Fields */}
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Descripción */}
              <div>
                {label('Descripción *')}
                <input style={inputCls(noDesc)} placeholder="Nombre del artículo"
                  value={row.descripcion} onChange={e => setField(row._id, 'descripcion', e.target.value)} />
              </div>

              {/* PVP + Copias */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  {label('PVP (€) *')}
                  <input style={{ ...inputCls(), textAlign: 'right' }} type="text" inputMode="decimal"
                    placeholder="0,00" value={row.pvp_con_iva}
                    onChange={e => setField(row._id, 'pvp_con_iva', e.target.value)} />
                </div>
                <div>
                  {label('Copias')}
                  <input style={{ ...inputCls(), textAlign: 'center' }} type="number" min={1} max={50} step={1}
                    inputMode="numeric" value={row.copies || 1}
                    onChange={e => setField(row._id, 'copies', e.target.value)} />
                </div>
              </div>

              {/* Referencia + EAN */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  {label('Referencia')}
                  <input style={inputCls()} placeholder="REF-001"
                    value={row.codigo_principal} onChange={e => setField(row._id, 'codigo_principal', e.target.value)} />
                </div>
                <div>
                  {label('EAN / Código')}
                  <input style={inputCls()} placeholder="8412345…" inputMode="numeric"
                    value={row.ean} onChange={e => setField(row._id, 'ean', e.target.value)} />
                </div>
              </div>

              {/* Coste */}
              <div style={{ maxWidth: '50%' }}>
                {label('Coste neto (€)')}
                <input style={{ ...inputCls(), textAlign: 'right' }} type="text" inputMode="decimal"
                  placeholder="—" value={row.coste_neto_unitario}
                  onChange={e => setField(row._id, 'coste_neto_unitario', e.target.value)} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Add button */}
      <button className="btn btn-ghost" onClick={addRow}
        style={{ width: '100%', padding: '14px', marginTop: 4, borderRadius: 12, border: '2px dashed var(--border)', color: 'var(--text-3)' }}>
        <Plus size={16} /> Añadir artículo
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export function CustomLabelsPage() {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const isMobile = useIsMobile();
  const { confirm, ConfirmDialog } = useConfirm();

  const totalLabels = rows.reduce((s, r) => s + Math.max(1, r.copies || 1), 0);
  const validRows = rows.filter(r => r.descripcion.trim());

  const setField = (id: string, key: keyof Row, value: string) => {
    setRows(prev => prev.map(r => {
      if (r._id !== id) return r;
      if (key === 'copies') return { ...r, copies: Math.max(1, Math.min(50, parseInt(value) || 1)) };
      return { ...r, [key]: value };  // prices stored as raw strings
    }));
  };

  const addRow = () => setRows(prev => [...prev, newRow()]);

  const duplicateRow = (id: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r._id === id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], _id: Math.random().toString(36).slice(2) };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.length > 1 ? prev.filter(r => r._id !== id) : prev);
  };

  const handleGenerate = async () => {
    setError('');
    if (validRows.length === 0) { setError('Añade al menos un artículo con descripción.'); return; }
    setGenerating(true);
    try {
      const items: CustomLabelItem[] = validRows.map(r => ({
        descripcion:         r.descripcion.trim(),
        pvp_con_iva:         parseNum(r.pvp_con_iva, 0),
        codigo_principal:    r.codigo_principal.trim() || undefined,
        ean:                 r.ean.trim() || undefined,
        coste_neto_unitario: r.coste_neto_unitario.trim() ? parseNum(r.coste_neto_unitario, 0) : undefined,
        copies:              Math.max(1, r.copies || 1),
      }));
      await downloadCustomLabels(items);
    } catch {
      setError('Error al generar el PDF. Comprueba la conexión con el servidor.');
    } finally {
      setGenerating(false);
    }
  };

  const sharedProps = { rows, setField, addRow, duplicateRow, removeRow };

  return (
    <div className="page">
      {ConfirmDialog}
      {/* Header — stacks vertically on mobile */}
      {isMobile ? (
        /* ── Mobile header ── */
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <Tag size={18} /> Etiquetas personalizadas
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg)', padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
              {validRows.length} art. · {totalLabels} etiq.
            </span>
            <button className="btn btn-ghost btn-sm"
              onClick={async () => { const ok = await confirm({ title: 'Limpiar artículos', message: '¿Limpiar todos los artículos?', confirmLabel: 'Limpiar', danger: true }); if (ok) setRows([newRow()]); }}
              style={{ color: 'var(--danger)' }}>
              Limpiar
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleGenerate}
              disabled={generating || validRows.length === 0}
              style={{ marginLeft: 'auto', flexShrink: 0 }}>
              {generating
                ? <><span className="spinner spinner-sm spinner-white" /> Generando…</>
                : <><Download size={14} /> Generar PDF</>}
            </button>
          </div>
        </div>
      ) : (
        /* ── Desktop header ── */
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag size={20} /> Etiquetas personalizadas
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
              Rellena los artículos a mano y genera un PDF listo para imprimir.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg)', padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
              {validRows.length} art. · {totalLabels} etiq.
            </span>
            <button className="btn btn-ghost btn-sm"
              onClick={async () => { const ok = await confirm({ title: 'Limpiar artículos', message: '¿Limpiar todos los artículos?', confirmLabel: 'Limpiar', danger: true }); if (ok) setRows([newRow()]); }}
              style={{ color: 'var(--danger)' }}>
              Limpiar
            </button>
            <button className="btn btn-primary" onClick={handleGenerate}
              disabled={generating || validRows.length === 0}>
              {generating
                ? <><span className="spinner spinner-sm spinner-white" /> Generando…</>
                : <><Download size={15} /> Generar PDF</>}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Desktop table / Mobile cards — only one is mounted at a time */}
      {isMobile
        ? <MobileCards  {...sharedProps} />
        : <DesktopTable {...sharedProps} />
      }

      {/* Help note — hidden on mobile to save space */}
      {!isMobile && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-2)' }}>Descripción</strong> y <strong style={{ color: 'var(--text-2)' }}>PVP</strong> son obligatorios.{' '}
          Los artículos se guardan en la base de datos al generar, por lo que el QR del móvil y el código de barras funcionan igual que en cualquier albarán.
          El <strong style={{ color: 'var(--text-2)' }}>Coste</strong> se muestra cifrado en la etiqueta (solo uso interno).
        </div>
      )}
    </div>
  );
}
