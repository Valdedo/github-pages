import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, Play, ScanBarcode, Upload } from 'lucide-react';
import { Ilustracion } from './Pegatinas';
import { abrirTutorial } from './Tutorial';

/**
 * Aviso de novedades: sale una sola vez en cada dispositivo al abrir la app.
 * Para avisar de otras novedades, cambiar VERSION y la lista.
 */
const VERSION = '2026-11-19';
const CLAVE = 'cfNovedadesVistas';

const COSAS = [
  { icono: Upload, titulo: 'Albaranes de compra: súbelos todos',
    texto: 'De uno en uno o un montón a la vez (hasta 40). Cada uno se lee y se guarda solo en la carpeta de su proveedor en Drive, y la lista dice si ya está guardado. Si el proveedor es nuevo, la carpeta se crea desde el propio albarán.',
    ir: '/albaranes', boton: 'Ver los albaranes de compra' },
  { icono: ScanBarcode, titulo: 'Recibir mercancía',
    texto: 'Al abrir un albarán ves qué artículos son nuevos y cuáles suben o bajan. Toca el precio de venta para cambiarlo o mantener el que ya hay, lee el código de barras con la cámara del móvil y saca las etiquetas de la balda.' },
  { icono: ListChecks, titulo: 'Archivar o borrar varios',
    texto: 'En la lista, «Seleccionar» deja marcar los que quieras: «Archivar» los que no hay que colocar ni etiquetar (gasóleo, portes…) o «Borrar» los que se subieron mal.' },
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
