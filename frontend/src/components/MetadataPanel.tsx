import { useState } from 'react';
import { updateDocument } from '../api/client';
import type { Document, Supplier } from '../types';

interface Props {
  document: Document;
  suppliers: Supplier[];
  onUpdated: (doc: Document) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onProntoPagoChanged?: () => void;
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  uploaded:   { label: 'Subido',        cls: 'badge badge-grey' },
  processing: { label: '⏳ Procesando', cls: 'badge badge-warning' },
  completed:  { label: '✓ Completado',  cls: 'badge badge-success' },
  error:      { label: '✕ Error',       cls: 'badge badge-danger' },
};

export function MetadataPanel({ document, suppliers, onUpdated, onToast, onProntoPagoChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({
    supplier_name: document.supplier_name || '',
    supplier_id: document.supplier_id || '',
    doc_number: document.doc_number || '',
    doc_date: document.doc_date || '',
    pronto_pago_pct: document.pronto_pago_pct ?? '',
  });

  const handleSave = async () => {
    const prevProntoPago = document.pronto_pago_pct;
    const newProntoPago = values.pronto_pago_pct ? Number(values.pronto_pago_pct) : undefined;
    const { data } = await updateDocument(document.id, {
      supplier_name: values.supplier_name || undefined,
      supplier_id: values.supplier_id ? Number(values.supplier_id) : undefined,
      doc_number: values.doc_number || undefined,
      doc_date: values.doc_date || undefined,
      pronto_pago_pct: newProntoPago,
    });
    onUpdated(data);
    setEditing(false);
    // Trigger recalculation if pronto_pago_pct changed
    if (newProntoPago !== prevProntoPago) {
      onProntoPagoChanged?.();
      onToast?.('Datos guardados — recalculando precios con descuento por pronto pago…', 'info');
    } else {
      onToast?.('Datos del albarán guardados', 'success');
    }
  };

  const st = statusConfig[document.status] || { label: document.status, cls: 'badge badge-grey' };

  return (
    <div className="card">
      <div className="card-header" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>ℹ️</span> Datos del albarán
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className={st.cls}>{st.label}</span>
          <button
            className={`btn btn-sm ${editing ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Cancelar' : '✏️ Editar'}
          </button>
        </div>
      </div>

      <div className="card-body">
        {document.error_message && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '14px',
            color: 'var(--danger)',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            Error: {document.error_message}
          </div>
        )}

        <div className="metadata-grid">
          <Field label="Proveedor" editing={editing}
            value={values.supplier_name}
            onChange={v => setValues(p => ({ ...p, supplier_name: v }))}
            display={document.supplier_name || '—'}
          />
          <Field label="Nº Albarán" editing={editing}
            value={values.doc_number}
            onChange={v => setValues(p => ({ ...p, doc_number: v }))}
            display={document.doc_number || '—'}
          />
          <Field label="Fecha" editing={editing}
            value={values.doc_date}
            onChange={v => setValues(p => ({ ...p, doc_date: v }))}
            display={document.doc_date || '—'}
            type="date"
          />
        </div>

        {editing && (
          <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-success btn-sm" onClick={handleSave}>
              💾 Guardar cambios
            </button>
            {suppliers.length > 0 && (
              <select
                value={values.supplier_id}
                onChange={e => {
                  const s = suppliers.find(x => String(x.id) === e.target.value);
                  setValues(p => ({
                    ...p,
                    supplier_id: e.target.value,
                    supplier_name: s?.name || p.supplier_name,
                  }));
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--grey-300)',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  background: '#fff',
                }}
              >
                <option value="">Seleccionar proveedor...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, editing, value, onChange, display, type = 'text' }: {
  label: string;
  editing: boolean;
  value: string | number;
  onChange: (v: string) => void;
  display: string;
  type?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--grey-500)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
        {label}
      </div>
      {editing ? (
        <input
          type={type}
          value={String(value)}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1.5px solid var(--primary)',
            borderRadius: '7px',
            fontSize: '13px',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      ) : (
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--grey-900)' }}>{display}</div>
      )}
    </div>
  );
}
