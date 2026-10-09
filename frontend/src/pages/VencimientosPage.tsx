import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, Search, X } from 'lucide-react';
import { getVencDetalle, describeApiError, type VencDetalle } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { Vacio } from '../components/Pegatinas';
import { AjustesForm, euros, Factura, fechaCorta, Grandes, hace, Semanas } from '../components/VencComun';
import { coincide } from '../lib/texto';
import '../components/VencimientosCard.css';
import './vencimientos.css';

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;

function Kpi({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle: string; tono?: 'aviso' | 'fuerte' }) {
  return (
    <div className={`venc-kpi${tono ? ` ${tono}` : ''}`}>
      <span className="venc-kpi-t">{titulo}</span>
      <span className="venc-kpi-v">{valor}</span>
      <span className="venc-kpi-d">{detalle}</span>
    </div>
  );
}

/** Página de Vencimientos (solo Andrés): agenda, semanas, meses, proveedores y últimas facturas. */
export function VencimientosPage() {
  const [d, setD] = useState<VencDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<'proximos' | 'pasados'>('proximos');
  const [buscar, setBuscar] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [verTodosRec, setVerTodosRec] = useState(false);

  const cargar = useCallback(() => {
    setError(null);
    getVencDetalle().then(({ data }) => setD(data)).catch(e => setError(describeApiError(e)));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const agenda = useMemo(() => {
    if (!d) return [];
    const q = buscar.trim();
    return d.agenda
      .filter(g => (vista === 'pasados' ? g.pasado : !g.pasado))
      .map(g => (q ? { ...g, facturas: g.facturas.filter(f => coincide(q, f.proveedor, f.numero)) } : g))
      .filter(g => g.facturas.length > 0)
      .map(g => (q ? { ...g, total: g.facturas.reduce((t, f) => t + (f.importe || 0), 0) } : g))
      .sort((a, b) => (vista === 'pasados' ? (a.fecha < b.fecha ? 1 : -1) : 0));
  }, [d, vista, buscar]);

  if (error && !d) return <div className="page"><ConnectionError message={error} onRetry={cargar} /></div>;
  if (!d) return <div className="page" style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Cargando…</div>;

  const maxMes = Math.max(...d.meses.map(m => m.total), 1);
  const recientes = verTodosRec ? d.recientes : d.recientes.slice(0, 6);

  return (
    <div className="page venc-pagina">
      <div className="inicio-head" style={{ marginBottom: 14 }}>
        <div>
          <h1>Vencimientos <span className="aviso-chip" style={{ verticalAlign: 'middle' }}>En pruebas</span></h1>
          <p>
            Facturas de proveedor que se cargan en la cuenta.
            {d.conectado ? ` Actualizado ${hace(d.ultima)} · ${plural(d.facturas, 'factura leída', 'facturas leídas')}.` : ' Esperando los primeros datos del script de facturas.'}
          </p>
        </div>
      </div>

      <section className="venc-kpis" aria-label="Resumen">
        <Kpi titulo="Esta semana" valor={euros(d.totales.semana)} detalle={plural(d.totales.semana_n, 'factura', 'facturas')} tono="fuerte" />
        <Kpi titulo="Próximos 30 días" valor={euros(d.totales.mes)} detalle={plural(d.totales.mes_n, 'factura', 'facturas')} />
        <Kpi titulo="Todo lo pendiente" valor={euros(d.totales.pendiente)} detalle={`${plural(d.proveedores.length, 'proveedor', 'proveedores')}`} />
        <Kpi titulo="Facturas grandes" valor={String(d.grandes.length)} tono={d.grandes.length ? 'aviso' : undefined}
          detalle={`de más de ${euros(d.ajustes.umbral).replace(',00', '')} en ${d.ajustes.dias_antes} días`} />
      </section>

      <Grandes lista={d.grandes} />

      <section className="card venc-bloque venc-semanas-bloque" aria-label="Cada semana">
        <h2>Lo que se carga cada semana</h2>
        <Semanas semanas={d.semanas} />
      </section>

      <div className="venc-cols">
        <section className="card venc-bloque venc-agenda" aria-label="Agenda de vencimientos">
          <div className="venc-bloque-cab">
            <h2>Día a día</h2>
            <div className="venc-seg" role="tablist">
              {([['proximos', 'Próximos'], ['pasados', 'Ya cargados']] as const).map(([k, t]) => (
                <button key={k} role="tab" aria-selected={vista === k} className={vista === k ? 'on' : ''} onClick={() => setVista(k)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="carga-buscar search-bar venc-buscar">
            <Search size={17} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar proveedor o n.º de factura…" aria-label="Buscar vencimientos" />
            {buscar && <button className="search-bar-clear" onClick={() => setBuscar('')} aria-label="Borrar búsqueda"><X size={16} /></button>}
          </div>
          {agenda.length === 0 ? (
            buscar.trim()
              ? <p className="venc-nota venc-vacio">Nada con «{buscar.trim()}».</p>
              : vista === 'pasados'
                ? <p className="venc-nota venc-vacio">No se ha cargado nada en las dos últimas semanas.</p>
                : <Vacio dibujo="facturaOk" titulo="Nada por vencer" texto="Cuando llegue una factura con vencimiento, saldrá aquí." />
          ) : (
            <div className="venc-agenda-lista">
              {agenda.map(g => (
                <div key={g.fecha} className={`venc-agenda-dia${g.faltan === 0 ? ' hoy' : ''}${g.pasado ? ' pasado' : ''}`}>
                  <div className="venc-agenda-cab">
                    <span className="venc-agenda-fecha">
                      <b>{g.etiqueta}</b> {g.dia}
                      {g.faltan > 1 && <small> · en {g.faltan} días</small>}
                      {g.faltan < -1 && <small> · hace {-g.faltan} días</small>}
                    </span>
                    <span className="venc-agenda-total">{euros(g.total)}</span>
                  </div>
                  <ul className="venc-lista">{g.facturas.map(f => <Factura key={f.id} f={f} />)}</ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="venc-lado">
          <section className="card venc-bloque" aria-label="Por meses">
            <h2>Por meses</h2>
            <ul className="venc-meses">
              {d.meses.map(m => (
                <li key={m.mes}>
                  <span className="venc-mes-n">{m.mes}</span>
                  <span className="venc-mes-barra"><span style={{ width: `${(m.total / maxMes) * 100}%` }} /></span>
                  <span className="venc-mes-t"><b>{m.total ? euros(m.total) : '—'}</b><small>{m.facturas ? plural(m.facturas, 'factura', 'facturas') : 'nada aún'}</small></span>
                </li>
              ))}
            </ul>
            <p className="venc-nota">Los meses siguientes se irán llenando según lleguen facturas.</p>
          </section>

          <section className="card venc-bloque" aria-label="Aviso de facturas grandes">
            <h2>Aviso de facturas grandes</h2>
            <p className="venc-nota">Salen arriba en rojo y te llega un aviso al móvil una sola vez.</p>
            <AjustesForm ajustes={d.ajustes} onGuardado={() => cargar()} />
          </section>
        </div>
      </div>

      <section className="card venc-bloque" aria-label="Pendiente por proveedor">
        <div className="venc-bloque-cab">
          <h2>Pendiente por proveedor</h2>
          <span className="venc-sub">{euros(d.totales.pendiente)} en total</span>
        </div>
        {d.proveedores.length === 0 ? <p className="venc-nota">Nada pendiente.</p> : (
          <ul className="venc-provs">
            {d.proveedores.map(p => {
              const on = abierto === p.proveedor;
              const peso = d.totales.pendiente ? (p.pendiente / d.totales.pendiente) * 100 : 0;
              return (
                <li key={p.proveedor} className={on ? 'abierto' : ''}>
                  <button className="venc-prov-fila" onClick={() => setAbierto(on ? null : p.proveedor)} aria-expanded={on}>
                    <span className="venc-fac-txt">
                      <b>{p.proveedor}</b>
                      <small>{[
                        plural(p.facturas, 'vencimiento', 'vencimientos'),
                        p.forma_pago || '',
                        p.dias != null ? `suele vencer a ${p.dias} días` : '',
                        `el próximo ${fechaCorta(p.proxima)}`,
                      ].filter(Boolean).join(' · ')}</small>
                      <span className="venc-prov-peso"><span style={{ width: `${Math.max(peso, 2)}%` }} /></span>
                    </span>
                    <span className="venc-fac-imp">{euros(p.pendiente)}</span>
                    <ChevronDown size={18} className="venc-prov-flecha" />
                  </button>
                  {on && <ul className="venc-lista venc-extra">{p.lista.map(f => <Factura key={f.id} f={f} conFecha />)}</ul>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="venc-cols iguales">
        <section className="card venc-bloque" aria-label="Últimas facturas recibidas">
          <h2>Últimas facturas recibidas</h2>
          {d.recientes.length === 0 ? <p className="venc-nota">Todavía no ha llegado ninguna.</p> : (
            <>
              <ul className="venc-recientes">
                {recientes.map(r => (
                  <li key={r.id}>
                    <a href={r.url || undefined} target="_blank" rel="noreferrer">
                      <span className="venc-fac-txt">
                        <b>{r.proveedor}</b>
                        <small>{[r.fecha_factura ? `factura del ${fechaCorta(r.fecha_factura)}` : '', r.numero ? `n.º ${r.numero}` : '', r.forma_pago || ''].filter(Boolean).join(' · ')}</small>
                        <span className="venc-plazos">
                          {r.vencimientos.some(v => v.fecha)
                            ? r.vencimientos.filter(v => v.fecha).map((v, i) => <span key={i}>vence {fechaCorta(v.fecha)}{r.vencimientos.length > 1 && v.importe != null ? ` · ${euros(v.importe)}` : ''}</span>)
                            : <span className="sin">sin fecha de vencimiento</span>}
                        </span>
                      </span>
                      <span className="venc-fac-imp">{euros(r.importe_factura ?? r.importe)}</span>
                    </a>
                  </li>
                ))}
              </ul>
              {d.recientes.length > 6 && (
                <button className="turnos-link" onClick={() => setVerTodosRec(v => !v)}>{verTodosRec ? 'Ver menos' : `Ver las ${d.recientes.length}`}</button>
              )}
            </>
          )}
        </section>

        <section className="card venc-bloque" aria-label="Sin fecha de vencimiento">
          <h2>Sin fecha de vencimiento</h2>
          {d.sin_fecha.length === 0 ? (
            <p className="venc-nota"><CalendarClock size={15} style={{ verticalAlign: -2 }} /> Todas las facturas recientes dicen cuándo vencen.</p>
          ) : (
            <>
              <p className="venc-nota">La factura no dice cuándo se carga. Ábrela si quieres comprobarlo.</p>
              <ul className="venc-lista venc-extra">{d.sin_fecha.map(f => <Factura key={f.id} f={{ ...f, importe: f.importe ?? f.importe_factura }} />)}</ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
