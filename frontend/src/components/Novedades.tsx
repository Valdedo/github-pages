import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, HandHelping, Play, Users } from 'lucide-react';
import { Ilustracion } from './Pegatinas';
import { abrirTutorial } from './Tutorial';

/**
 * Aviso de novedades: sale una sola vez en cada dispositivo al abrir la app.
 * Para avisar de otras novedades, cambiar VERSION y la lista.
 */
const VERSION = '2026-11-04';
const CLAVE = 'cfNovedadesVistas';

const COSAS = [
  { icono: Camera, titulo: 'Entregar sin firma',
    texto: 'Si al llevar un pedido no está el cliente, en «Firma del cliente» pulsa «No está el cliente»: elige dónde lo dejaste y haz una foto. El albarán queda como «Entregado sin firma» con la foto. Si luego pasa por la tienda, puede firmarlo desde su albarán.' },
  { icono: Users, titulo: 'Albaranes de venta por cliente',
    texto: 'En Ventas, la pestaña «Por cliente» enseña cada cliente en una línea con lo que le falta: sin firmar, sin copia y por facturar. Toca el cliente para ver sus albaranes.',
    ir: '/firmas?vista=todos', boton: 'Ver los clientes' },
  { icono: HandHelping, titulo: 'La copia se apunta sola',
    texto: 'Al sacar en PDF varios albaranes firmados (por ejemplo, «Dar copia» de un cliente), quedan marcados como «Copia entregada». Si no se la diste, pulsa «Deshacer».' },
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
          {COSAS.map(({ icono: Icono, titulo, texto, ir, boton }) => (
            <li key={titulo}>
              <span className="novedades-icono"><Icono size={20} /></span>
              <span>
                <b>{titulo}</b>
                <span>{texto}</span>
                {ir && <button className="turnos-link" onClick={() => cerrar(ir)}>{boton}</button>}
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
