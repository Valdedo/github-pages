import { useEffect, useState } from 'react';
import { getSettings } from '../api/client';
import { MarginSettings } from '../components/MarginSettings';
import { ConnectionError } from '../components/ConnectionError';
import { useToast } from '../components/Toast';
import type { AppSettings } from '../types/index';

/** Márgenes y redondeo de precios de toda la tienda (antes estaba dentro de cada albarán). */
export function AjustesPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast, ToastContainer } = useToast();
  const cargar = () => getSettings().then(r => { setSettings(r.data); setError(null); }).catch(e => setError(String(e?.message || e)));
  useEffect(() => { cargar(); }, []);
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <ToastContainer />
      <div className="inicio-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>Márgenes y precios</h1>
          <p>El margen que se aplica según el coste y cómo se redondea el precio. Vale para los albaranes nuevos; en uno ya subido, usa «Más» → «Recalcular».</p>
        </div>
      </div>
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {settings && <MarginSettings settings={settings} abierto onUpdated={setSettings} onToast={showToast} />}
    </div>
  );
}
