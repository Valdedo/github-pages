import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PenLine, Receipt } from 'lucide-react';
import { getFirmasAvisos, type FirmasAvisos as Avisos } from '../api/client';
import { euros } from '../lib/texto';


/** Avisos de albaranes que se están quedando atrás (en Inicio y en Firmas). */
export function FirmasAvisos() {
  const [a, setA] = useState<Avisos | null>(null);
  useEffect(() => { getFirmasAvisos().then(({ data }) => setA(data)).catch(() => {}); }, []);
  if (!a || (!a.sin_firmar.length && !a.sin_facturar.length)) return null;

  const n = a.sin_firmar.length;
  // Un solo aviso para todo lo de meses anteriores (antes salía uno por cliente y a principio de mes eran muchos).
  // Los primeros 10 días del mes es lo normal facturar lo del anterior: en ámbar; después, en rojo.
  const facturar = a.sin_facturar.reduce((t, g) => ({ albaranes: t.albaranes + g.albaranes, importe: t.importe + g.importe }), { albaranes: 0, importe: 0 });
  const atrasado = new Date().getDate() > 10;
  return (
    <>
      {n > 0 && (
        <Link to="/firmas?vista=firmar" className="inicio-aviso">
          <span className="inicio-aviso-ico verde"><PenLine size={20} /></span>
          <span className="inicio-aviso-txt">
            <b>{n === 1
              ? `El albarán ${a.sin_firmar[0].numero} lleva ${a.sin_firmar[0].dias} días sin firmar`
              : `${n} albaranes sin firmar desde hace 2 días o más`}</b>
            <small>{n === 1 ? (a.sin_firmar[0].cliente || '') : [...new Set(a.sin_firmar.map(x => x.cliente).filter(Boolean))].slice(0, 3).join(', ')}</small>
          </span>
          <span className="btn btn-primary btn-sm">Firmar</span>
        </Link>
      )}
      {facturar.albaranes > 0 && (
        <Link className={`inicio-aviso ${atrasado ? 'rojo' : 'ambar'}`}
          to={`/firmas?vista=facturar${a.sin_facturar.length === 1 && a.sin_facturar[0].codigo_cliente ? `&cliente=${encodeURIComponent(a.sin_facturar[0].codigo_cliente)}` : ''}`}>
          <span className="inicio-aviso-ico"><Receipt size={20} /></span>
          <span className="inicio-aviso-txt">
            <b>{facturar.albaranes} {facturar.albaranes !== 1 ? 'albaranes' : 'albarán'} del mes pasado o antes sin facturar</b>
            <small>
              {a.sin_facturar.length === 1 ? (a.sin_facturar[0].cliente || 'Sin cliente') : `${a.sin_facturar.length} clientes`}
              {facturar.importe > 0 && <> · {euros(facturar.importe)}</>}
              {a.sin_facturar.length > 1 && <> · {a.sin_facturar.slice(0, 2).map(g => g.cliente).filter(Boolean).join(', ')}{a.sin_facturar.length > 2 ? '…' : ''}</>}
            </small>
          </span>
          <span className="btn btn-sm btn-negro">Facturar</span>
        </Link>
      )}
    </>
  );
}
