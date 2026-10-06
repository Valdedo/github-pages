/**
 * Logo de Casa Fonso: tejado en dos verdes + CASA (ligera) FONSO (fuerte).
 * Provisional, dibujado según el manual de identidad. Cuando esté el archivo
 * original (AF_LOGO_FONSO_3.pdf) se sustituye aquí y cambia en toda la app.
 */
export function Tejado({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="10 18 80 54" aria-hidden="true">
      <polygon points="50,20 20,70 35,70 50,45" fill="#2FAE66" />
      <polygon points="50,20 80,70 65,70 50,45" fill="#1F5A3A" />
    </svg>
  );
}

export function Logo({ compact = false, onDark = false, size = 34 }: { compact?: boolean; onDark?: boolean; size?: number }) {
  return (
    <span className={`cf-logo${onDark ? ' on-dark' : ''}`} aria-label="Casa Fonso">
      <Tejado size={size} />
      {!compact && (
        <span className="cf-logo-text" style={{ fontSize: size * 0.74 }}>
          <span className="casa">CASA</span><span className="fonso">FONSO</span>
        </span>
      )}
    </span>
  );
}
