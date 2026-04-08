import { useState } from 'react';
import { updateSettings, recalculateArticles } from '../api/client';
import type { AppSettings, MarginTier } from '../types/index';

interface Props {
  settings: AppSettings;
  documentId?: number;
  onUpdated: (s: AppSettings) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function MarginSettings({ settings, documentId, onUpdated, onToast }: Props) {
  const [open, setOpen] = useState(true);
  const [tiers, setTiers] = useState<MarginTier[]>(settings.margin_tiers);
  const [roundingMode, setRoundingMode] = useState<'standard' | 'psychological' | 'ceil_5cents'>(settings.rounding_mode as 'standard' | 'psychological' | 'ceil_5cents');
  const [decimals, setDecimals] = useState(settings.rounding_decimals);
  const [companyName, setCompanyName] = useState(settings.company_name || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Warn if there's an open document with articles that will be recalculated
    if (documentId) {
      const ok = confirm(
        '⚠️ Al guardar se recalcularán los precios de todos los artículos de este albarán.\n\n' +
        'Los artículos con margen manual (punto naranja) se mantendrán igual.\n' +
        'Los artículos con margen automático cambiarán según los nuevos tramos.\n\n' +
        '¿Continuar?'
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const { data } = await updateSettings({
        margin_tiers: tiers,
        rounding_mode: roundingMode,
        rounding_decimals: decimals,
        company_name: companyName,
      });
      onUpdated(data);
      if (documentId) await recalculateArticles(documentId);
      onToast?.('Configuración guardada y precios recalculados', 'success');
    } catch {
      onToast?.('Error al guardar la configuración', 'error');
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
    setTiers(prev => [...prev, { min_cost: last ? (last.max_cost ?? 0) + 0.01 : 0, max_cost: null, margin_pct: 20 }]);
  };

  const removeTier = (idx: number) => setTiers(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="card">
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '12px 18px',
          background: 'var(--grey-100)', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontSize: '13px', fontWeight: 600,
          color: 'var(--primary)', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          borderRadius: open ? 'var(--card-radius) var(--card-radius) 0 0' : 'var(--card-radius)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚙️</span> Configuración de márgenes y precios
        </span>
        <span style={{ fontSize: '16px', color: 'var(--grey-500)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="card-body">
          {/* Company name */}
          <div style={{ marginBottom: '18px' }}>
            <label style={labelSt}>Nombre de empresa (aparece en etiquetas)</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Tu Ferretería S.L."
              style={{ ...inputSt, width: '320px' }}
            />
          </div>

          {/* Rounding */}
          <div style={{ marginBottom: '18px', display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={labelSt}>Modo de redondeo</label>
              <select value={roundingMode} onChange={e => setRoundingMode(e.target.value as 'standard' | 'psychological' | 'ceil_5cents')} style={selectSt}>
                <option value="standard">Estándar (2 decimales)</option>
                <option value="psychological">Psicológico (x.99)</option>
                <option value="ceil_5cents">Al alza al 0,05 más próximo</option>
              </select>
            </div>
            {roundingMode === 'standard' && (
              <div>
                <label style={labelSt}>Decimales</label>
                <select value={decimals} onChange={e => setDecimals(Number(e.target.value))} style={selectSt}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Margin tiers */}
          <div style={{ marginBottom: '14px' }}>
            <strong style={{ fontSize: '13px', color: 'var(--grey-700)', display: 'block', marginBottom: '8px' }}>
              Tramos de margen por coste:
            </strong>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--primary)', color: '#fff' }}>
                  <th style={thSt}>Coste mín. (€)</th>
                  <th style={thSt}>Coste máx. (€)</th>
                  <th style={thSt}>Margen (%)</th>
                  <th style={thSt}></th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? 'var(--grey-100)' : '#fff' }}>
                    <td style={tdSt}>
                      <input type="number" step="0.01" min="0" value={tier.min_cost} onChange={e => updateTier(idx, 'min_cost', e.target.value)} style={inputSt} />
                    </td>
                    <td style={tdSt}>
                      <input type="number" step="0.01" min="0" value={tier.max_cost ?? ''} placeholder="∞" onChange={e => updateTier(idx, 'max_cost', e.target.value)} style={inputSt} />
                    </td>
                    <td style={tdSt}>
                      <input type="number" step="1" min="0" max="10000" value={tier.margin_pct} onChange={e => updateTier(idx, 'margin_pct', e.target.value)} style={{ ...inputSt, color: 'var(--primary)', fontWeight: 600 }} />
                    </td>
                    <td style={{ ...tdSt, textAlign: 'center' }}>
                      <button onClick={() => removeTier(idx)} className="btn btn-danger btn-sm">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addTier} className="btn btn-accent btn-sm">+ Añadir tramo</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-success">
              {saving ? 'Guardando…' : '💾 Guardar y recalcular'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const labelSt: React.CSSProperties = { display: 'block', fontSize: '11px', color: 'var(--grey-500)', textTransform: 'uppercase', marginBottom: '5px', fontWeight: 600, letterSpacing: '0.04em' };
const selectSt: React.CSSProperties = { padding: '6px 10px', border: '1.5px solid var(--grey-300)', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit' };
const inputSt: React.CSSProperties = { width: '90px', padding: '5px 7px', border: '1.5px solid var(--grey-300)', borderRadius: '7px', fontSize: '13px', fontFamily: 'inherit' };
const thSt: React.CSSProperties = { padding: '7px 10px', textAlign: 'left', fontWeight: 600 };
const tdSt: React.CSSProperties = { padding: '4px 8px' };
