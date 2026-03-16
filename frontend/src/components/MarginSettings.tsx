import { useState } from 'react';
import { updateSettings, recalculateArticles } from '../api/client';
import type { AppSettings, MarginTier } from '../types';

interface Props {
  settings: AppSettings;
  documentId?: number;
  onUpdated: (s: AppSettings) => void;
}

export function MarginSettings({ settings, documentId, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<MarginTier[]>(settings.margin_tiers);
  const [roundingMode, setRoundingMode] = useState(settings.rounding_mode);
  const [decimals, setDecimals] = useState(settings.rounding_decimals);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await updateSettings({
        margin_tiers: tiers,
        rounding_mode: roundingMode,
        rounding_decimals: decimals,
      });
      onUpdated(data);
      if (documentId) {
        await recalculateArticles(documentId);
      }
    } finally {
      setSaving(false);
    }
  };

  const updateTier = (idx: number, field: keyof MarginTier, value: string) => {
    setTiers(prev => prev.map((t, i) =>
      i === idx ? { ...t, [field]: value === '' ? null : Number(value) } : t
    ));
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    setTiers(prev => [...prev, {
      min_cost: last ? (last.max_cost ?? 0) + 0.01 : 0,
      max_cost: null,
      margin_pct: 20,
    }]);
  };

  const removeTier = (idx: number) => {
    setTiers(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      marginBottom: '12px',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '12px 16px', background: '#f0f4f8',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          fontSize: '14px', fontWeight: 600, color: '#1F4E79',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span>⚙️ Configuración de márgenes y precios</span>
        <span style={{ fontSize: '18px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '16px' }}>
          {/* Rounding */}
          <div style={{ marginBottom: '16px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={labelStyle}>Modo de redondeo</label>
              <select
                value={roundingMode}
                onChange={e => setRoundingMode(e.target.value as 'standard' | 'psychological')}
                style={selectStyle}
              >
                <option value="standard">Estándar (2 decimales)</option>
                <option value="psychological">Psicológico (x.99)</option>
              </select>
            </div>
            {roundingMode === 'standard' && (
              <div>
                <label style={labelStyle}>Decimales</label>
                <select
                  value={decimals}
                  onChange={e => setDecimals(Number(e.target.value))}
                  style={selectStyle}
                >
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Margin tiers table */}
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ fontSize: '13px', color: '#555' }}>Tramos de margen por coste:</strong>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#1F4E79', color: '#fff' }}>
                  <th style={th}>Coste mín. (€)</th>
                  <th style={th}>Coste máx. (€)</th>
                  <th style={th}>Margen (%)</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? '#f9f9f9' : '#fff' }}>
                    <td style={td}>
                      <input
                        type="number" step="0.01" min="0"
                        value={tier.min_cost}
                        onChange={e => updateTier(idx, 'min_cost', e.target.value)}
                        style={inputStyle}
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="number" step="0.01" min="0"
                        value={tier.max_cost ?? ''}
                        placeholder="∞"
                        onChange={e => updateTier(idx, 'max_cost', e.target.value)}
                        style={inputStyle}
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="number" step="1" min="0" max="10000"
                        value={tier.margin_pct}
                        onChange={e => updateTier(idx, 'margin_pct', e.target.value)}
                        style={{ ...inputStyle, color: '#1F4E79', fontWeight: 600 }}
                      />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button
                        onClick={() => removeTier(idx)}
                        style={{ background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addTier} style={{ ...btnStyle, background: '#3498db' }}>
              + Añadir tramo
            </button>
            <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, background: '#27ae60' }}>
              {saving ? 'Guardando...' : '💾 Guardar y recalcular'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: '#888',
  textTransform: 'uppercase', marginBottom: '4px',
};
const selectStyle: React.CSSProperties = {
  padding: '5px 10px', border: '1px solid #ccc',
  borderRadius: '6px', fontSize: '13px',
};
const th: React.CSSProperties = {
  padding: '6px 8px', textAlign: 'left',
};
const td: React.CSSProperties = {
  padding: '4px 6px',
};
const inputStyle: React.CSSProperties = {
  width: '90px', padding: '4px 6px',
  border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px',
};
const btnStyle: React.CSSProperties = {
  padding: '7px 14px', border: 'none', borderRadius: '6px',
  color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
};
