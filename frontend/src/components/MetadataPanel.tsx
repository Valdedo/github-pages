import { useState } from 'react';
import { updateDocument } from '../api/client';
import type { Document, Supplier } from '../types';

interface Props {
  document: Document;
  suppliers: Supplier[];
  onUpdated: (doc: Document) => void;
}

export function MetadataPanel({ document, suppliers, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({
    supplier_name: document.supplier_name || '',
    supplier_id: document.supplier_id || '',
    doc_number: document.doc_number || '',
    doc_date: document.doc_date || '',
    pronto_pago_pct: document.pronto_pago_pct || '',
  });

  const handleSave = async () => {
    const { data } = await updateDocument(document.id, {
      supplier_name: values.supplier_name || undefined,
      supplier_id: values.supplier_id ? Number(values.supplier_id) : undefined,
      doc_number: values.doc_number || undefined,
      doc_date: values.doc_date || undefined,
      pronto_pago_pct: values.pronto_pago_pct ? Number(values.pronto_pago_pct) : undefined,
    });
    onUpdated(data);
    setEditing(false);
  };

  const statusColor = {
    uploaded: '#888',
    processing: '#e67e22',
    completed: '#27ae60',
    error: '#e74c3c',
  }[document.status] || '#888';

  const statusLabel = {
    uploaded: 'Subido',
    processing: '⏳ Procesando...',
    completed: '✅ Completado',
    error: '❌ Error',
  }[document.status] || document.status;

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', color: '#1F4E79' }}>ℹ️ Datos del albarán</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{
            background: statusColor,
            color: '#fff',
            padding: '3px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 600,
          }}>
            {statusLabel}
          </span>
          <button
            onClick={() => setEditing(!editing)}
            style={{ ...btnStyle, background: editing ? '#888' : '#1F4E79' }}
          >
            {editing ? 'Cancelar' : '✏️ Editar'}
          </button>
        </div>
      </div>

      {document.error_message && (
        <div style={{
          background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '6px',
          padding: '8px 12px', marginBottom: '12px', color: '#cc0000', fontSize: '13px',
        }}>
          Error: {document.error_message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
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
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <button onClick={handleSave} style={{ ...btnStyle, background: '#27ae60' }}>
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
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
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
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '3px', textTransform: 'uppercase' }}>{label}</div>
      {editing ? (
        <input
          type={type}
          value={String(value)}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', padding: '5px 8px', border: '1px solid #1F4E79',
            borderRadius: '5px', fontSize: '13px',
          }}
        />
      ) : (
        <div style={{ fontSize: '14px', fontWeight: 500 }}>{display}</div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '5px 12px',
  border: 'none',
  borderRadius: '6px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
};
