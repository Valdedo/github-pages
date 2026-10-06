/**
 * Logo oficial de Casa Fonso (archivos en /public/brand, sacados del original).
 * - completo: CASA FONSO + «Materiales de construcción» + tejado
 * - compact: solo el tejado
 * - onDark: versión con letras blancas para fondos oscuros
 */
export function Tejado({ size = 34 }: { size?: number }) {
  return <img src="/brand/logo-tejado.png" alt="" aria-hidden="true" style={{ height: size * 0.8, width: 'auto', display: 'block' }} />;
}

export function Logo({ compact = false, onDark = false, size = 34 }: { compact?: boolean; onDark?: boolean; size?: number }) {
  if (compact) {
    return <span className="cf-logo" aria-label="Casa Fonso"><Tejado size={size} /></span>;
  }
  return (
    <span className="cf-logo" aria-label="Casa Fonso">
      <img src={onDark ? '/brand/logo-horizontal-blanco.png' : '/brand/logo-horizontal.png'} alt="Casa Fonso · Materiales de construcción"
        style={{ height: size * 1.25, width: 'auto', display: 'block' }} />
    </span>
  );
}
