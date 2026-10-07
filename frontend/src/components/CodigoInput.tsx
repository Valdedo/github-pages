import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Campo para el código con el botón del ojo para verlo mientras se escribe. */
export function CodigoInput({ value, onChange, autoFocus, nuevo, label = 'Código' }: {
  value: string; onChange: (v: string) => void; autoFocus?: boolean; nuevo?: boolean; label?: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="codigo-input">
      <input className="form-input acceso-codigo" type={ver ? 'text' : 'password'} inputMode="numeric"
        autoComplete={nuevo ? 'new-password' : 'current-password'} autoFocus={autoFocus}
        value={value} onChange={e => onChange(e.target.value)} aria-label={label} />
      <button type="button" className="codigo-ojo" onClick={() => setVer(v => !v)}
        aria-label={ver ? 'Ocultar el código' : 'Ver el código'} title={ver ? 'Ocultar' : 'Ver'}>
        {ver ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  );
}
