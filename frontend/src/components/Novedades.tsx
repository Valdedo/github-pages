import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookMarked, CalendarDays, FileText, MapPin, Play, Truck } from 'lucide-react';
import { Ilustracion } from './Pegatinas';
import { abrirTutorial } from './Tutorial';

/**
 * Aviso de novedades: sale una sola vez en cada dispositivo al abrir la app.
 * Para avisar de otras novedades, cambiar VERSION y la lista.
 */
const VERSION = '2026-10-13b';
const CLAVE = 'cfNovedadesVistas';

const COSAS = [
  { icono: CalendarDays, titulo: 'Tu círculo y tus turnos',
    texto: 'Arriba a la derecha está tu inicial: tócala y ves tu turno de hoy y de mañana, tus turnos de la semana y lo tuyo (código, avisos, cerrar sesión).' },
  { icono: FileText, titulo: 'Nombres más claros',
    texto: '«Albaranes de compra» son los de proveedor. «Albaranes de venta» son los de TreyFACT a clientes.' },
  { icono: Truck, titulo: '«Al camión» prepara la carga',
    texto: 'En un albarán de venta que va a obra, pulsa «Al camión»: salen solos los materiales para cargar y la hoja de entrega sin precios. Cuando firma el cliente, el albarán queda firmado también.' },
  { icono: MapPin, titulo: 'Obras de cada cliente',
    texto: 'Al elegir un cliente salen sus obras. En «Por facturar» se puede facturar obra por obra.' },
  { icono: BookMarked, titulo: 'Tarifas de proveedor',
    texto: 'Ya las tienes en el menú, en «Mostrador». Busca por medidas, por ejemplo «50x50x4».', ir: '/tarifas' },
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
