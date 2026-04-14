import { useState } from 'react';
import { Plus, Trash2, Tag, Download, Copy } from 'lucide-react';
import { downloadCustomLabels } from '../api/client';
import type { CustomLabelItem } from '../api/client';

interface Row extends CustomLabelItem {
  _id: string;
}

const newRow = (): Row => ({
  _id: Math.random().toString(36).slice(2),
  descripcion: '',
  pvp_con_iva: 0,
  codigo_principal: '',
  ean: '',
  coste_neto_unitario: undefined,
  copies: 1,
});

// Displayed field config
const COLUMNS = [
  { key: 'descripcion',        label: 'Descripción',   type: 'text',   required: true,  placeholder: 'Nombre del artículo',  flex: '2 1 200px' },
  { key: 'pvp_con_iva',        label: 'PVP (€)',        type: 'number', required: true,  placeholder: '0,00',                  flex: '0 0 90px'  },
  { key: 'codigo_principal',   label: 'Referencia',     type: 'text',   required: false, placeholder: 'REF-001',               flex: '1 1 100px' },
  { key: 'ean',                label: 'EAN/Código',     type: 'text',   required: false, placeholder: '8412345678901',         flex: '1 1 120px' },
  { key: 'coste_neto_unitario',label: 'Coste (€)',      type: 'number', required: false, placeholder: '—',                    flex: '0 0 90px'  },
  { key: 'copies',             label: 'Copias',         type: 'number', required: true,  placeholder: '1',                    flex: '0 0 70px'  },
] as const;

export function CustomLabelsPage() {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const totalLabels = rows.reduce((s, r) => s + Math.max(1, r.copies || 1), 0);
  const validRows = rows.filter(r => r.descripcion.trim());

  const setField = (id: string, key: keyof Row, value: string) => {
    setRows(prev => prev.map(r => {
      if (r._id !== id) return r;
      if (key === 'pvp_con_iva' || key === 'coste_neto_unitario') {
        const num = value === '' ? (key === 'pvp_con_iva' ? 0 : undefined) : parseFloat(value.replace(',', '.'));
        return { ...r, [key]: isNaN(num as number) ? r[key] : num };
      }
      if (key === 'copies') {
        const num = Math.max(1, Math.min(50, parseInt(value) || 1));
        return { ...r, copies: num };
      }
      return { ...r, [key]: value };
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
    if (validRows.length === 0) {
      setError('Añade al menos un artículo con descripción.');
      return;
    }
    setGenerating(true);
    try {
      const items: CustomLabelItem[] = validRows.map(r => ({
        descripcion:         r.descripcion.trim(),
        pvp_con_iva:         r.pvp_con_iva || 0,
        codigo_principal:    r.codigo_principal?.trim() || undefined,
        ean:                 r.ean?.trim() || undefined,
        coste_neto_unitario: r.coste_neto_unitario,
        copies:              Math.max(1, r.copies || 1),
      }));
      await downloadCustomLabels(items);
    } catch {
      setError('Error al generar el PDF. Comprueba la conexión con el servidor.');
    } finally {
      setGenerating(false);
    }
  };

  const handleClearAll = () => {
    if (!confirm('¿Limpiar todos los artículos?')) return;
    setRows([newRow()]);
  };

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag size={20} /> Etiquetas personalizadas
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
            Rellena los artículos a mano y genera un PDF listo para imprimir con el mismo formato de siempre.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg)', padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)' }}>
            {validRows.length} artículo{validRows.length !== 1 ? 's' : ''} · {totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={handleClearAll} style={{ color: 'var(--danger)' }}>
            Limpiar todo
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating || validRows.length === 0}
          >
            {generating
              ? <><span className="spinner spinner-sm spinner-white" /> Generando…</>
              : <><Download size={15} /> Generar PDF</>
            }
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${COLUMNS.map(c => c.flex.split(' ').pop()).join(' ')} 72px`,
          gap: 8, padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          minWidth: 700,
        }}>
          {COLUMNS.map(col => (
            <span key={col.key} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {col.label}{col.required ? ' *' : ''}
            </span>
          ))}
          <span />
        </div>

        {/* Rows */}
        <div style={{ minWidth: 700 }}>
          {rows.map((row, idx) => (
            <div
              key={row._id}
              style={{
                display: 'grid',
                gridTemplateColumns: `${COLUMNS.map(c => c.flex.split(' ').pop()).join(' ')} 72px`,
                gap: 8, padding: '8px 16px',
                borderBottom: '1px solid var(--border)',
                background: idx % 2 === 0 ? undefined : 'var(--bg)',
                alignItems: 'center',
              }}
            >
              {COLUMNS.map(col => {
                const val = row[col.key as keyof Row];
                const strVal = val === undefined || val === null ? '' : String(val);
                const isEmpty = col.required && !strVal && strVal !== '0';
                return (
                  <input
                    key={col.key}
                    type={col.type}
                    min={col.type === 'number' ? 0 : undefined}
                    step={col.key === 'copies' ? 1 : col.type === 'number' ? 0.01 : undefined}
                    placeholder={col.placeholder}
                    value={col.key === 'copies' ? (row.copies || 1) : (col.type === 'number' && (val === 0 || val === undefined) ? '' : strVal)}
                    onChange={e => setField(row._id, col.key as keyof Row, e.target.value)}
                    style={{
                      padding: '6px 8px',
                      border: `1.5px solid ${isEmpty ? '#fca5a5' : 'var(--grey-300)'}`,
                      borderRadius: 7,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      width: '100%',
                      boxSizing: 'border-box',
                      textAlign: col.type === 'number' ? 'right' : 'left',
                      background: isEmpty ? '#fff5f5' : undefined,
                    }}
                  />
                );
              })}

              {/* Row actions */}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => duplicateRow(row._id)}
                  title="Duplicar fila"
                  style={{ color: 'var(--text-3)' }}
                >
                  <Copy size={12} />
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeRow(row._id)}
                  title="Eliminar fila"
                  disabled={rows.length === 1}
                  style={{ color: rows.length === 1 ? 'var(--grey-300)' : 'var(--danger)' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add row footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <button className="btn btn-ghost btn-sm" onClick={addRow}>
            <Plus size={13} /> Añadir artículo
          </button>
        </div>
      </div>

      {/* Help note */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-2)' }}>Campos:</strong>{' '}
        <strong>Descripción</strong> y <strong>PVP</strong> son obligatorios.
        La <strong>Referencia</strong> aparece en la etiqueta y se usa para el código de barras si no hay EAN.
        El <strong>EAN</strong> genera un código de barras EAN-13 si es un número de 13 dígitos.
        El <strong>Coste</strong> se muestra en cifrado interno (CALZETYNUS) solo si se rellena.
        Las <strong>Copias</strong> controlan cuántas etiquetas se generan para ese artículo.
      </div>
    </div>
  );
}
