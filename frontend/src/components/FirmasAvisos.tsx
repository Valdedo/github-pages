import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenLine, Receipt } from 'lucide-react';
import { getFirmasAvisos, type FirmasAvisos as Avisos } from '../api/client';

const euros = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/** Avisos de albaranes que se están quedando atrás (en Inicio y en Firmas). */
export function FirmasAvisos() {
  const navigate = useNavigate();
  const [a, setA] = useState<Avisos | null>(null);
  useEffect(() => { getFirmasAvisos().then(({ data }) => setA(data)).catch(() => {}); }, []);
  if (!a || (!a.sin_firmar.length && !a.sin_facturar.length)) return null;

  const n = a.sin_firmar.length;
  return (
    <>
      {n > 0 && (
        <div className="dashboard-alert dashboard-alert--amber" onClick={() => navigate('/firmas?vista=firmar')}>
          <PenLine size={15} />
          <span>
            {n === 1
              ? `El albarán ${a.sin_firmar[0].numero} lleva ${a.sin_firmar[0].dias} días sin firmar`
              : `${n} albaranes llevan más de 2 días sin firmar`}
          </span>
          <span className="dashboard-alert-link">Ver →</span>
        </div>
      )}
      {a.sin_facturar.map(g => (
        <div key={g.codigo_cliente ?? '—'} className="dashboard-alert dashboard-alert--amber"
          onClick={() => navigate(`/firmas?vista=facturar${g.codigo_cliente ? `&cliente=${g.codigo_cliente}` : ''}`)}>
          <Receipt size={15} />
          <span>
            {g.cliente || 'Sin cliente'} tiene {g.albaranes} albarán{g.albaranes !== 1 ? 'es' : ''} de meses anteriores sin facturar
            {g.importe > 0 && ` (${euros(g.importe)})`}
          </span>
          <span className="dashboard-alert-link">Facturar →</span>
        </div>
      ))}
    </>
  );
}
