import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardCheck, MapPin } from 'lucide-react';
import type { OrdenCarga } from '../api/client';
import { firmaEnCola, marcaEnCola, estaLista } from '../lib/offlineCargas';

/** Lo marcado sin cobertura cuenta ya como marcado. */
function cuentas(o: OrdenCarga) {
  let total = 0, hechas = 0, firmadas = 0, listas = 0;
  for (const e of o.entregas) {
    const f = firmaEnCola(e.id);
    const fOk = f && !f.error;  // una firma que el servidor no aceptó no cuenta como entregada
    if (e.estado === 'entregada' || fOk) firmadas++;
    if (e.estado === 'entregada' || fOk || estaLista(e)) listas++;
    for (const l of e.lineas) {
      total++;
      const ok = f?.cargadas[String(l.id)]?.ok ?? marcaEnCola(l.id)?.ok ?? l.cargado_ok;
      if (ok) hechas++;
    }
  }
  return { total, hechas, firmadas, lista: listas === o.entregas.length && o.entregas.length > 0, entregada: firmadas === o.entregas.length && o.entregas.length > 0 };
}

/** «Para cargar»: las órdenes que la tienda le ha mandado a Melchor. Las ya entregadas y firmadas desaparecen
 *  (Andrés, 15/10/2026: antes se quedaban 18 horas como «carga entregada» y parecía que seguían pendientes). */
export function CargasReparto({ ordenes }: { ordenes: OrdenCarga[] }) {
  const navigate = useNavigate();
  const pendientes = ordenes.filter(o => !cuentas(o).entregada);
  if (!pendientes.length) return null;
  return (
    <section className="cargas-reparto">
      {pendientes.length > 0 && (
        <>
          <div className="cargas-reparto-titulo"><ClipboardCheck size={18} /> Para cargar <span>{pendientes.length}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pendientes.map(o => {
              const c = cuentas(o);
              const lugares = [...new Set(o.entregas.map(e => e.lugar).filter(Boolean))].join(', ');
              const accion = c.lista ? 'Entregar' : c.hechas === 0 ? 'Empezar a cargar' : 'Seguir cargando';
              return (
                <button key={o.id} className="card reparto-card carga-reparto-card" onClick={() => navigate(`/reparto/cargas/${o.id}`)}>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>
                      {o.entregas.map(e => e.cliente || 'Sin nombre').join(' · ')}
                    </div>
                    {lugares && <div className="carga-reparto-lugar"><MapPin size={15} /> {lugares}</div>}
                    <div className="carga-reparto-progreso">
                      <span>{c.lista ? 'Listo para llevar · falta la firma' : c.hechas === c.total ? 'Todo cargado · falta confirmarlo' : `Cargado ${c.hechas} de ${c.total}`}</span>
                      {o.entregas.length > 1 && <span>· {o.entregas.length} entregas</span>}
                    </div>
                    <div className="carga-barra"><span style={{ width: `${c.total ? (c.hechas / c.total) * 100 : 0}%` }} /></div>
                  </div>
                  <span className="reparto-firmar">{accion}<ChevronRight size={20} /></span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export const cargasPendientes = (ordenes: OrdenCarga[]) => ordenes.filter(o => !cuentas(o).entregada).length;
/** Las entregadas en las últimas horas (no se enseñan, pero el Inicio dice «Todo entregado»). */
export const cargasEntregadas = (ordenes: OrdenCarga[]) => ordenes.filter(o => cuentas(o).entregada).length;
