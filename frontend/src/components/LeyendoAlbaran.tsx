import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

type Paso = 'cola' | 'preparando' | 'leyendo' | 'comprobando';
const PASOS: { id: Paso; texto: string }[] = [
  { id: 'preparando', texto: 'Preparando las hojas' },
  { id: 'leyendo', texto: 'Leyendo las líneas y los precios' },
  { id: 'comprobando', texto: 'Comprobando que las cuentas cuadran' },
];
// Tramo del círculo que ocupa cada paso (de dónde a dónde, en %)
const TRAMO: Record<Paso, [number, number]> = { cola: [0, 4], preparando: [4, 14], leyendo: [14, 88], comprobando: [88, 98] };

/**
 * Lo que se ve mientras se lee un albarán: un círculo que se va llenando, el paso por el que va (ese sí es el de
 * verdad: lo dice el servidor) y el tiempo que lleva. El tanto por ciento es una estimación con lo que suelen tardar
 * las lecturas: avanza rápido al principio y cada vez más despacio, y no llega a 100 hasta que termina.
 */
export function LeyendoAlbaran({ estado, paso, media, lleva: llevaServidor }: { estado: string; paso?: string | null; media?: number | null; lleva?: number | null }) {
  const actual: Paso = estado === 'uploaded' ? 'cola' : (['preparando', 'leyendo', 'comprobando'].includes(paso || '') ? (paso as Paso) : 'preparando');
  // El tiempo lo cuenta el servidor: si se entra a mitad de la lectura (o se sale y se vuelve), no empieza de cero
  const inicio = useRef(Date.now() - (llevaServidor || 0) * 1000);
  const inicioPaso = useRef(inicio.current);
  const primero = useRef(true);
  const tope = useRef(0);            // el círculo nunca retrocede
  const [, pintar] = useState(0);
  useEffect(() => {
    if (primero.current) { primero.current = false; return; }
    inicioPaso.current = Date.now();
  }, [actual]);
  useEffect(() => { const t = setInterval(() => pintar(n => n + 1), 250); return () => clearInterval(t); }, []);

  const lleva = Math.round((Date.now() - inicio.current) / 1000);
  const enPaso = (Date.now() - inicioPaso.current) / 1000;
  const tipico = Math.min(Math.max(media || 40, 15), 180);
  // Cuánto dura normalmente cada paso: preparar, un momento; leer, lo que suelen tardar; comprobar (otra lectura), parecido
  const dura = actual === 'preparando' ? 5 : actual === 'cola' ? 20 : tipico;
  const [a, b] = TRAMO[actual];
  const hecho = 1 - Math.exp(-(enPaso / dura) * 1.7);        // a su duración normal va por el 82 % del tramo
  tope.current = Math.max(tope.current, a + (b - a) * hecho);
  const pct = Math.min(99, Math.floor(tope.current));
  const R = 52, C = 2 * Math.PI * R;
  const tarda = lleva > Math.max(240, tipico * 4);
  const tiempo = lleva < 60 ? `${lleva} s` : `${Math.floor(lleva / 60)} min ${String(lleva % 60).padStart(2, '0')} s`;

  return (
    <div className={`ley${tarda ? ' tarda' : ''}`} role="status" aria-live="polite">
      <div className="ley-circulo">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="ley-fondo" cx="60" cy="60" r={R} />
          <circle className="ley-arco" cx="60" cy="60" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - tope.current / 100)} />
        </svg>
        <b>{pct}<small>%</small></b>
      </div>
      <div className="ley-txt">
        <h3>{actual === 'cola' ? 'En cola para leerse' : 'Leyendo el albarán'}</h3>
        <ol>
          {actual === 'cola' && <li className="ahora"><i /> Esperando su turno: se leen de tres en tres</li>}
          {PASOS.filter(p => p.id !== 'comprobando' || actual === 'comprobando').map(p => {
            const orden = PASOS.findIndex(x => x.id === p.id), voy = PASOS.findIndex(x => x.id === actual);
            const cls = actual !== 'cola' && orden < voy ? 'hecho' : p.id === actual ? 'ahora' : '';
            return <li key={p.id} className={cls}><i>{cls === 'hecho' && <Check size={12} strokeWidth={3.5} />}</i> {p.texto}</li>;
          })}
        </ol>
        <p>
          <span className="ley-lleva">Lleva {tiempo}.</span>{' '}
          {tarda
            ? 'Está tardando más de lo normal. No hace falta que esperes aquí: sigue solo y no se pierde nada.'
            : `Suele tardar ${tipico < 50 ? 'menos de un minuto' : tipico < 100 ? 'un par de minutos' : 'unos minutos'}. Puedes salir de esta pantalla o cerrar la app: sigue solo y no se pierde nada.`}
        </p>
      </div>
    </div>
  );
}
