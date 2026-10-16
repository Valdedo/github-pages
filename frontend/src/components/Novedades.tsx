import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookMarked, Play, Search, Signature } from 'lucide-react';
import { Ilustracion } from './Pegatinas';
import { abrirTutorial } from './Tutorial';

/**
 * Aviso de novedades: sale una sola vez en cada dispositivo al abrir la app.
 * Para avisar de otras novedades, cambiar VERSION y la lista.
 */
const VERSION = '2026-10-16';
const CLAVE = 'cfNovedadesVistas';

const COSAS = [
  { icono: BookMarked, titulo: 'Tarifas nuevas: Isoltubex y mallas',
    texto: 'En «Tarifas de proveedor» ya están Isoltubex (multicapa, PEX y latón) y las mallas ganaderas, con foto y precio por rollo. Desde 5 rollos sale más barato.', ir: '/tarifas' },
  { icono: BookMarked, titulo: 'Tarifas con IVA',
    texto: 'Ahora sale primero el precio con IVA. El sin IVA sigue al lado, y arriba puedes cambiar a «Sin IVA».', ir: '/tarifas' },
  { icono: ArrowLeft, titulo: '«Volver» en el móvil',
    texto: 'Arriba a la izquierda en cada pantalla. Al volver a «Albaranes de venta» sigue la misma búsqueda y el mismo sitio de la lista.' },
  { icono: Signature, titulo: 'Firmar más rápido',
    texto: 'Salen los nombres de quien suele firmar por ese cliente: tócalo y listo. Si se firmó por error: «Más opciones» → «Anular la firma».' },
  { icono: Search, titulo: 'Buscar sin tildes',
    texto: '«pardinas» encuentra «PARDIÑAS», y cada palabra se busca por separado.' },
];

export const hayNovedades = () => { try { return localStorage.getItem(CLAVE) !== VERSION; } catch { return false; } };

export function Novedades({ onCerrar }: { onCerrar: () => void }) {
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);
  const cerrar = (ir?: string) => {
    try { localStorage.setItem(CLAVE, VERSION); } catch { /* nada */ }
    setSaliendo(true);
    if (ir) navigate(ir);
    setTimeout(onCerrar, 180);
  };
  return (
    <div className={`modal-overlay novedades-fondo${saliendo ? ' fuera' : ''}`} onClick={() => cerrar()}>
      <div className="modal novedades" role="dialog" aria-labelledby="novedades-titulo" onClick={e => e.stopPropagation()}>
        <div className="novedades-cab">
          <Ilustracion dibujo="albaranBoli" tam={84} />
          <div>
            <h2 id="novedades-titulo">Novedades en la app</h2>
            <p>Un resumen rápido de lo que ha cambiado. Luego, si quieres, te lo enseño paso a paso.</p>
          </div>
        </div>
        <ul className="novedades-lista">
          {COSAS.map(({ icono: Icono, titulo, texto, ir }) => (
            <li key={titulo}>
              <span className="novedades-icono"><Icono size={20} /></span>
              <span>
                <b>{titulo}</b>
                <span>{texto}</span>
                {ir && <button className="turnos-link" onClick={() => cerrar(ir)}>Ver las tarifas</button>}
              </span>
            </li>
          ))}
        </ul>
        <div className="novedades-pie">
          <button className="btn btn-ghost" onClick={() => cerrar()}>Ahora no</button>
          <button className="btn btn-primary btn-lg" onClick={() => { try { localStorage.setItem(CLAVE, VERSION); } catch { /* nada */ } abrirTutorial(); }} autoFocus>
            <Play size={17} /> Enséñame cómo se hace
          </button>
        </div>
      </div>
    </div>
  );
}
