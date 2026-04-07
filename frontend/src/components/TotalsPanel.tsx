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
        Resumen del albarán
      </div>
      <div className="card-body" style={{ padding: '12px 16px' }}>
        <div className="totals-grid">
          <Stat label="Artículos"      value={String(articles.length)}     unit=""  />
          <Stat label="Unidades"       value={totalUnits.toFixed(0)}        unit=""  />
          <Stat label="Coste total"    value={totalCost.toFixed(2)}         unit="€" muted />
          <Stat label="Beneficio est." value={totalBenefit.toFixed(2)}      unit="€" highlight={totalBenefit >= 0 ? 'positive' : 'negative'} />
          <Stat label="PVP total c/IVA" value={totalPvpConIva.toFixed(2)}  unit="€" highlight="brand" />
          <Stat label="Margen medio"   value={avgMargen.toFixed(1)}         unit="%" highlight="accent" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, highlight, muted }: {
  label: string;
  value: string;
  unit: string;
  highlight?: 'brand' | 'positive' | 'negative' | 'accent';
  muted?: boolean;
}) {
  const color = highlight === 'brand'    ? 'var(--brand)'
              : highlight === 'positive' ? 'var(--brand)'
              : highlight === 'negative' ? 'var(--danger)'
              : highlight === 'accent'   ? '#0284c7'
              : muted                    ? 'var(--text-2)'
              : 'var(--text-1)';

  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      padding: '10px 12px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '17px', fontWeight: 700, color, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
        {value}<span style={{ fontSize: '12px', fontWeight: 500, marginLeft: '1px' }}>{unit}</span>
      </div>
    </div>
  );
}
