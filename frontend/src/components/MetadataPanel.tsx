import { useEffect, useState } from 'react';
import { updateDocument } from '../api/client';
import type { Document, Supplier } from '../types';

interface Props {
  document: Document;
  suppliers: Supplier[];
  onUpdated: (doc: Document) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onProntoPagoChanged?: () => void;
}

export function MetadataPanel({ document, suppliers, onUpdated, onToast, onProntoPagoChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({
    supplier_name: document.supplier_name || '',
    supplier_id: document.supplier_id || '',
    doc_number: document.doc_number || '',
    doc_date: document.doc_date || '',
    pronto_pago_pct: document.pronto_pago_pct ?? '',
  });
  // Si el albarán se vuelve a leer, los datos se ponen al día
  useEffect(() => {
    if (editing) return;
    setValues({
      supplier_name: document.supplier_name || '', supplier_id: document.supplier_id || '',
      doc_number: document.doc_number || '', doc_date: document.doc_date || '',
      pronto_pago_pct: document.pronto_pago_pct ?? '',
    });
  }, [document, editing]);

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

  return (
    <div className="card">
      <div className="card-header" style={{ justifyContent: 'space-between' }}>
        <span>Datos del albarán</span>
        <button className={`btn btn-sm ${editing ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setEditing(!editing)}>
          {editing ? 'Cancelar' : 'Cambiar'}
        </button>
      </div>

      <div className="card-body">
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
          <Field label="Pronto pago (%)" editing={editing}
            value={values.pronto_pago_pct}
            onChange={v => setValues(p => ({ ...p, pronto_pago_pct: v }))}
            display={document.pronto_pago_pct ? `${document.pronto_pago_pct} %` : 'No'}
            type="number"
          />
        </div>

        {editing && (
          <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              Guardar cambios
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
                <option value="">Elegir de la lista de proveedores…</option>
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
      <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '4px', fontWeight: 600 }}>
        {label}
      </div>
      {editing ? (
        <input
          type={type}
          value={String(value)}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1.5px solid var(--border-strong)',
            borderRadius: '10px',
            fontSize: '15px',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      ) : (
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-1)' }}>{display}</div>
      )}
    </div>
  );
}
