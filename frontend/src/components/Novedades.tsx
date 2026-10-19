import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookMarked, Info, List, Play, Tablet } from 'lucide-react';
import { Ilustracion } from './Pegatinas';
import { abrirTutorial } from './Tutorial';

/**
 * Aviso de novedades: sale una sola vez en cada dispositivo al abrir la app.
 * Para avisar de otras novedades, cambiar VERSION y la lista.
 */
const VERSION = '2026-10-19';
const CLAVE = 'cfNovedadesVistas';

const COSAS = [
  { icono: BookMarked, titulo: 'Más tarifas para todos',
    texto: 'En «Tarifas de proveedor» ya están también Pladur, Dinak, ladrillos, bombonas de gas, morteros y piensos.', ir: '/tarifas' },
  { icono: List, titulo: 'Familias en lista',
    texto: 'Dentro de cada familia todo va en líneas con su código y su precio. Lo que tiene varias medidas se abre tocándolo.' },
  { icono: Info, titulo: 'Para qué sirve',
    texto: 'En morteros y piensos, la ficha dice para qué sirve cada producto y lo que suele preguntar el cliente: rendimiento, agua por saco, para qué animal…' },
  { icono: Tablet, titulo: 'Tarifas en la tableta',
    texto: 'Menú → Mostrador → «Tarifas en la tableta»: el precio en grande, y tocando la foto se apunta lo que se lleva el cliente.' },
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
