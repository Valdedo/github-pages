/** «Para qué sirve» (oct. 2026, Andrés): lo que suele preguntar el cliente de un producto de las hojas de la tienda
 *  (morteros, piensos): para qué se usa, los datos de su ficha técnica y un consejo, con la web de donde sale
 *  (la del fabricante; si no la tiene, la tienda que copia su etiqueta).
 *  En la ficha va en su caja; en la tableta, más grande para leerlo de pie (`tableta`). */
import { Fragment } from 'react';
import { ExternalLink, Lightbulb } from 'lucide-react';
import { webDe, type Producto } from '../lib/tarifas';
import './paraquesirve.css';

export function ParaQueSirve({ p, tableta = false }: { p: Producto; tableta?: boolean }) {
  const web = p.fuente_nombre ?? webDe(p.fuente);
  return (
    <section className={`${tableta ? 'pq pq-tableta' : 'tf-caja pq'}`} aria-label="Para qué sirve">
      <h2>Para qué sirve</h2>
      {p.uso && <p className="pq-uso">{p.uso}</p>}
      {p.datos.length > 0 && (
        <dl className="pq-datos">
          {p.datos.map(([t, v]) => <Fragment key={t}><dt>{t}</dt><dd>{v}</dd></Fragment>)}
        </dl>
      )}
      {p.consejo && <p className="pq-consejo"><Lightbulb size={tableta ? 20 : 17} aria-hidden="true" /><span>{p.consejo}</span></p>}
      {p.fuente && web && (
        <a className="pq-fuente" href={p.fuente} target="_blank" rel="noopener noreferrer">
          Sacado de {web} <ExternalLink size={13} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
