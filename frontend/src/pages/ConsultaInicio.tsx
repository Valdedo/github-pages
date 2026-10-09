import { Link } from 'react-router-dom';
import { useState } from 'react';
import { BookMarked, CalendarClock, ChevronRight } from 'lucide-react';
import { VencimientosCard } from '../components/VencimientosCard';
import { MiCodigoModal } from '../components/MiCodigoModal';
import { cerrarSesion } from '../auth';
import './consulta.css';

const saludo = () => {
  const h = new Date().getHours();
  return h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
};

/** Inicio de Manolo: solo mirar tarifas y vencimientos. Letra grande, dos botones y nada más. */
export function ConsultaInicio() {
  const [mio, setMio] = useState(false);
  const hoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="page consulta-inicio">
      <header className="consulta-hola">
        <span>{hoy}</span>
        <h1>{saludo()}, Manolo</h1>
      </header>

      <nav className="consulta-botones" aria-label="Apartados">
        <Link to="/tarifas" className="consulta-boton">
          <span className="consulta-boton-ico"><BookMarked size={30} /></span>
          <span className="consulta-boton-txt">
            <b>Tarifas</b>
            <small>Precios de los proveedores</small>
          </span>
          <ChevronRight size={26} className="consulta-boton-flecha" />
        </Link>
        <Link to="/vencimientos" className="consulta-boton">
          <span className="consulta-boton-ico"><CalendarClock size={30} /></span>
          <span className="consulta-boton-txt">
            <b>Vencimientos</b>
            <small>Lo que se paga a los proveedores</small>
          </span>
          <ChevronRight size={26} className="consulta-boton-flecha" />
        </Link>
      </nav>

      <VencimientosCard />

      <footer className="consulta-pie">
        <button onClick={() => setMio(true)}>Cambiar mi código</button>
        <button onClick={() => { if (window.confirm('¿Salir de la app en este aparato? Luego habrá que volver a poner el código.')) { cerrarSesion(); window.location.href = '/'; } }}>Salir</button>
      </footer>
      {mio && <MiCodigoModal onClose={() => setMio(false)} />}
    </div>
  );
}
