import type { Article } from '../types/index';

interface Props {
  articles: Article[];
}

export function TotalsPanel({ articles }: Props) {
  if (articles.length === 0) return null;

  const totalUnits     = articles.reduce((s, a) => s + (a.cantidad || 0), 0);
  const totalCost      = articles.reduce((s, a) => s + (a.coste_neto_total || 0), 0);
  const totalPvpSinIva = articles.reduce((s, a) => s + (a.pvp_sin_iva || 0) * (a.cantidad || 1), 0);
  const totalPvpConIva = articles.reduce((s, a) => s + (a.pvp_con_iva || 0) * (a.cantidad || 1), 0);
  const avgMargen      = articles.reduce((s, a) => s + (a.margen_pct || 0), 0) / articles.length;
  const totalBenefit   = totalPvpSinIva - totalCost;

  return (
    <div className="card">
      <div className="card-header">
        <span>📊</span> Resumen del albarán
      </div>
      <div className="card-body" style={{ padding: '12px 18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
          <Stat label="Artículos"     value={String(articles.length)}      unit="" color="var(--primary)" />
          <Stat label="Unidades"      value={totalUnits.toFixed(0)}         unit="" color="var(--primary)" />
          <Stat label="Coste total"   value={totalCost.toFixed(2)}          unit="€" color="var(--grey-700)" />
          <Stat label="Beneficio est." value={totalBenefit.toFixed(2)}      unit="€" color={totalBenefit >= 0 ? 'var(--success)' : 'var(--danger)'} />
          <Stat label="PVP total c/IVA" value={totalPvpConIva.toFixed(2)}  unit="€" color="var(--primary)" />
          <Stat label="Margen medio"  value={avgMargen.toFixed(1)}          unit="%" color="var(--accent)" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div style={{
      background: 'var(--grey-100)',
      borderRadius: '8px',
      padding: '10px 12px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color, lineHeight: 1.2 }}>
        {value}<span style={{ fontSize: '13px', fontWeight: 600 }}>{unit}</span>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--grey-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '3px' }}>
        {label}
      </div>
    </div>
  );
}
