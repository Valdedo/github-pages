import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PenLine, Receipt } from 'lucide-react';
import { getFirmasAvisos, type FirmasAvisos as Avisos } from '../api/client';

const euros = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/** Avisos de albaranes que se están quedando atrás (en Inicio y en Firmas). */
export function FirmasAvisos() {
  const [a, setA] = useState<Avisos | null>(null);
  useEffect(() => { getFirmasAvisos().then(({ data }) => setA(data)).catch(() => {}); }, []);
  if (!a || (!a.sin_firmar.length && !a.sin_facturar.length)) return null;

  const n = a.sin_firmar.length;
  return (
    <>
      {n > 0 && (
        <Link to="/firmas?vista=firmar" className="inicio-aviso">
          <span className="inicio-aviso-ico verde"><PenLine size={20} /></span>
          <span className="inicio-aviso-txt">
            <b>{n === 1
              ? `El albarán ${a.sin_firmar[0].numero} lleva ${a.sin_firmar[0].dias} días sin firmar`
              : `${n} albaranes sin firmar desde hace 2 días o más`}</b>
            <small>{n === 1 ? (a.sin_firmar[0].cliente || '') : a.sin_firmar.slice(0, 3).map(x => x.cliente).filter(Boolean).join(', ')}</small>
          </span>
          <span className="btn btn-primary btn-sm">Firmar</span>
        </Link>
      )}
      {a.sin_facturar.map(g => (
        <Link key={g.codigo_cliente ?? '—'} className="inicio-aviso ambar"
          to={`/firmas?vista=facturar${g.codigo_cliente ? `&cliente=${encodeURIComponent(g.codigo_cliente)}` : ''}`}>
          <span className="inicio-aviso-ico"><Receipt size={20} /></span>
          <span className="inicio-aviso-txt">
            <b>{g.cliente || 'Sin cliente'} tiene {g.albaranes} {g.albaranes !== 1 ? 'albaranes' : 'albarán'} sin facturar de meses anteriores</b>
            {g.importe > 0 && <small>{euros(g.importe)}</small>}
          </span>
          <span className="btn btn-sm btn-negro">Facturar</span>
        </Link>
      ))}
    </>
  );
}
