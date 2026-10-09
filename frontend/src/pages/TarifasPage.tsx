import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, Search, X, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { getTarifas, getTarifa, actualizarTarifa, getFichaTarifa, describeApiError } from '../api/client';
import { coincide, fechaES } from '../lib/texto';
import { ConnectionError } from '../components/ConnectionError';
import { useCfToast } from '../components/CfToast';
import {
  PROXIMAMENTE, PEGATINA_PROVEEDOR, pegatina, claveFamilia, fotoArticulo, eur, pct, precioModo, mesLargo, esReciente,
  type Tarifa, type TarifaResumen, type TarifaMedida, type FichaTarifa, type ModoPrecio, type TarifaFamilia,
} from '../lib/tarifas';
import './tarifas.css';

// Lo leído se guarda mientras la app está abierta, para ir y volver entre pantallas sin esperar
const cache: Record<string, Tarifa> = {};

function useTarifa(prov: string) {
  const [t, setT] = useState<Tarifa | null>(cache[prov] ?? null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(!cache[prov]);
  const cargar = useCallback(async () => {
    setCargando(true);
    try { const { data } = await getTarifa(prov); cache[prov] = data; setT(data); setError(null); }
    catch (e) { setError(describeApiError(e)); }
    finally { setCargando(false); }
  }, [prov]);
  useEffect(() => { if (!cache[prov]) cargar(); }, [prov, cargar]);
  return { t, setT, error, cargando, cargar };
}

/** Foto de referencia; si no carga, se queda la pegatina de la familia. */
function Foto({ src, alt, respaldo, className }: { src: string; alt: string; respaldo: string; className?: string }) {
  const [mal, setMal] = useState(false);
  return mal
    ? <img className={`${className ?? ''} tf-foto-respaldo`} src={respaldo} alt={alt} />
    : <img className={className} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setMal(true)} />;
}

function Cabecera({ volver, textoVolver, titulo, sub, pegatinaSrc, children, pruebas }: {
  pruebas?: boolean; volver?: string; textoVolver?: string; titulo: string; sub?: string; pegatinaSrc?: string; children?: React.ReactNode;
}) {
  return (
    <div className="tf-cab">
      {volver && <Link to={volver} className="tf-volver"><ChevronLeft size={18} /> {textoVolver}</Link>}
      <div className="tf-cab-fila">
        {pegatinaSrc && <img className="tf-cab-peg" src={pegatinaSrc} alt="" />}
        <div className="tf-cab-txt">
          <h1>{titulo}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {pruebas && <span className="tf-pruebas">En pruebas</span>}
      </div>
      {children}
    </div>
  );
}

function Buscador({ q, setQ, placeholder }: { q: string; setQ: (v: string) => void; placeholder: string }) {
  return (
    <div className="search-bar tf-buscar">
      <Search size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <input type="text" enterKeyHint="search" value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {q && <button className="search-bar-clear" onClick={() => setQ('')} aria-label="Borrar búsqueda"><X size={16} /></button>}
    </div>
  );
}

const enlaceFicha = (prov: string, fam: string, ref: string) => `/tarifas/${prov}/${fam}/ficha?ref=${encodeURIComponent(ref)}`;
const etiquetaMedida = (m: TarifaMedida) => [m.valor, m.ud_medida].filter(Boolean).join(' ');

/** Resultados de búsqueda dentro de una tarifa (descripción, familia, medida). */
function Resultados({ t, q }: { t: Tarifa; q: string }) {
  const res = useMemo(() => {
    const out: { f: TarifaFamilia; m: TarifaMedida }[] = [];
    // «50x50x4» y «50 x 50 x 4» deben encontrar «50X50X4»
    const limpio = q.replace(/(\d)\s*[x×*]\s*(?=\d)/gi, '$1x');
    for (const f of t.familias) for (const g of f.grupos) for (const m of g.medidas)
      if (coincide(limpio, m.descripcion, f.nombre, g.titulo)) out.push({ f, m });
    return out.slice(0, 80);
  }, [t, q]);
  if (!res.length) return <div className="tf-vacio">No hay nada con «{q}» en {t.nombre}. Prueba con menos palabras.</div>;
  return (
    <div className="tf-lista">
      {res.map(({ f, m }) => (
        <Link key={m.ref} to={enlaceFicha(t.id, f.id, m.ref)} className="tf-fila">
          <img src={pegatina(claveFamilia(f.nombre))} alt="" className="tf-fila-peg" />
          <span className="tf-fila-txt"><strong>{conPor(m.descripcion)}</strong><small>{f.nombre}</small></span>
          <span className="tf-fila-precio">{eur(m.pvp)}<small>/{m.ud_venta} sin IVA</small></span>
          <ChevronRight size={18} className="tf-fila-flecha" />
        </Link>
      ))}
    </div>
  );
}

// ── 1 · Proveedores ──────────────────────────────────────────────────────
export function TarifasPage() {
  const [lista, setLista] = useState<TarifaResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [todas, setTodas] = useState<Tarifa[]>([]);
  const cargar = useCallback(() => {
    getTarifas().then(r => { setLista(r.data); setError(null); }).catch(e => setError(describeApiError(e)));
  }, []);
  useEffect(cargar, [cargar]);
  // Al buscar, se leen las tarifas (una vez) para buscar en todas a la vez
  useEffect(() => {
    if (!q.trim() || !lista || todas.length) return;
    Promise.all(lista.map(p => cache[p.id] ? Promise.resolve(cache[p.id]) : getTarifa(p.id).then(r => (cache[p.id] = r.data))))
      .then(setTodas).catch(e => setError(describeApiError(e)));
  }, [q, lista, todas.length]);

  return (
    <div className="page-wide tf">
      <Cabecera pruebas titulo="Tarifas" sub="Las tarifas de proveedor, por familias y medidas. Toca un proveedor." />
      {error && <ConnectionError message={error} onRetry={cargar} />}
      <Buscador q={q} setQ={setQ} placeholder="Buscar en todas las tarifas…" />
      {q.trim() ? (
        todas.length ? todas.map(t => <Resultados key={t.id} t={t} q={q} />) : <div className="tf-vacio"><span className="spinner" /> Buscando…</div>
      ) : (
        <>
          <h2 className="tf-sec">Por proveedor</h2>
          <div className="tf-provs">
            {(lista ?? []).map(p => (
              <Link key={p.id} to={`/tarifas/${p.id}`} className="tf-prov">
                <img src={pegatina(PEGATINA_PROVEEDOR[p.id] ?? 'prov-hierros')} alt="" className="tf-prov-peg" />
                <span className="tf-prov-txt">
                  <strong>{p.nombre}</strong>
                  <small>{p.sub}{p.articulos != null ? ` · ${p.articulos} artículos · ${p.familias} familias` : ''}</small>
                  {p.actualizada && <em>Actualizada el {fechaES(p.actualizada)}</em>}
                </span>
                <ChevronRight size={20} />
              </Link>
            ))}
            {!lista && !error && <div className="tf-prov tf-esqueleto skeleton" />}
            {PROXIMAMENTE.map(p => (
              <div key={p.id} className="tf-prov tf-prov-off" aria-disabled="true">
                <img src={pegatina(p.pegatina)} alt="" className="tf-prov-peg" />
                <span className="tf-prov-txt"><strong>{p.nombre}</strong><small>{p.sub}</small></span>
                <span className="tf-pronto">Próximamente</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── 2 · Familias de un proveedor ──────────────────────────────────────────
export function TarifaProveedorPage() {
  const { prov = '' } = useParams();
  const { t, setT, error, cargando, cargar } = useTarifa(prov);
  const [q, setQ] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const { toast, show } = useCfToast();

  const refrescar = async () => {
    setRefrescando(true);
    try { const { data } = await actualizarTarifa(prov); cache[prov] = data; setT(data); show('Tarifa leída de nuevo de Drive'); }
    catch (e) { show(describeApiError(e), { error: true }); }
    finally { setRefrescando(false); }
  };

  return (
    <div className="page-wide tf">
      {toast}
      <Cabecera volver="/tarifas" textoVolver="Tarifas" titulo={t?.nombre ?? 'Tarifa'}
        sub={t ? `${t.sub}${t.actualizada ? ` · actualizada el ${fechaES(t.actualizada)}` : ''}` : undefined}
        pegatinaSrc={pegatina(PEGATINA_PROVEEDOR[prov] ?? 'prov-hierros')}>
        <button className="btn btn-ghost tf-refrescar" onClick={refrescar} disabled={refrescando || cargando}>
          {refrescando ? <span className="spinner spinner-sm" /> : <RefreshCw size={16} />} Volver a leer de Drive
        </button>
      </Cabecera>
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {t?.aviso && <div className="doc-aviso subidas">{t.aviso}</div>}
      <Buscador q={q} setQ={setQ} placeholder="Ej.: 50x50x4, IPN 120, pletina…" />
      {t && !q.trim() && t.ultima_factura && (
        <a className="tf-ultima" href={t.ultima_factura.enlace} target="_blank" rel="noopener noreferrer">
          <TrendingUp size={18} />
          <span>Última factura aplicada <strong>{t.ultima_factura.numero}</strong> ({fechaES(t.ultima_factura.fecha)})
            {t.ultima_factura.cambios ? ` · ${t.ultima_factura.cambios} precio${t.ultima_factura.cambios === 1 ? '' : 's'} cambiado${t.ultima_factura.cambios === 1 ? '' : 's'}` : ''}</span>
          <FileText size={16} />
        </a>
      )}
      {cargando && !t && (
        <div className="tf-familias">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="tf-familia skeleton" />)}</div>
      )}
      {cargando && !t && <p className="tf-nota">Leyendo la tarifa de Drive… la primera vez tarda unos segundos.</p>}
      {t && (q.trim() ? <Resultados t={t} q={q} /> : (
        <div className="tf-familias">
          {t.familias.map(f => (
            <Link key={f.id} to={`/tarifas/${prov}/${f.id}`} className="tf-familia">
              <img src={pegatina(claveFamilia(f.nombre))} alt="" />
              <strong>{f.nombre}</strong>
              <small>{f.n} {f.n === 1 ? 'artículo' : 'artículos'}</small>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── 3 · Medidas de una familia ────────────────────────────────────────────
const MODOS: { v: ModoPrecio; t: string }[] = [{ v: 'venta', t: 'Sin IVA' }, { v: 'iva', t: 'Con IVA' }, { v: 'coste', t: 'Coste' }];
/** «50X50X4» → «50×50×4» para leerlo mejor */
const conPor = (s: string) => s.replace(/(\d)\s*X\s*(?=\d)/g, '$1×');

export function TarifaFamiliaPage() {
  const { prov = '', fam = '' } = useParams();
  const navigate = useNavigate();
  const { t, error, cargando, cargar } = useTarifa(prov);
  const [modo, setModo] = useState<ModoPrecio>(() => { try { return (sessionStorage.getItem('cfTarifaModo') as ModoPrecio) || 'venta'; } catch { return 'venta'; } });
  const [sel, setSel] = useState<TarifaMedida | null>(null);
  useEffect(() => { try { sessionStorage.setItem('cfTarifaModo', modo); } catch { /* nada */ } }, [modo]);
  const f = t?.familias.find(x => x.id === fam);
  const total = f?.grupos.reduce((s, g) => s + g.medidas.length, 0) ?? 0;

  return (
    <div className="page-wide tf tf-con-barra">
      <Cabecera volver={`/tarifas/${prov}`} textoVolver={t?.nombre ?? 'Tarifa'} titulo={f?.nombre ?? 'Familia'}
        pegatinaSrc={f ? pegatina(claveFamilia(f.nombre)) : undefined}>
        <div className="tf-modos" role="group" aria-label="Qué precio enseñar">
          {MODOS.map(m => <button key={m.v} type="button" aria-pressed={modo === m.v} onClick={() => setModo(m.v)}>{m.t}</button>)}
        </div>
      </Cabecera>
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {cargando && !t && <div className="tf-grupos">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="tf-grupo skeleton" style={{ height: 110 }} />)}</div>}
      {t && !f && <div className="tf-vacio">Esta familia ya no está en la tarifa. <Link to={`/tarifas/${prov}`}>Ver las familias</Link></div>}
      {f && (
        <>
          <div className="tf-intro">
            <Foto className="tf-intro-foto" src={fotoArticulo(f.nombre)} alt={f.nombre} respaldo={pegatina(claveFamilia(f.nombre))} />
            <div>
              <strong>{total} {total === 1 ? 'artículo' : 'artículos'}</strong>
              <span>Toca una medida para ver su precio. Precios {modo === 'coste' ? 'de compra' : modo === 'iva' ? 'de venta con IVA' : 'de venta sin IVA'}, por unidad de venta.</span>
            </div>
          </div>
          <div className="tf-grupos">
            {f.grupos.map((g, i) => g.titulo ? (
              <section key={i} className="tf-grupo">
                <h3>{g.titulo}</h3>
                <div className="tf-chips">
                  {g.medidas.map(m => (
                    <button key={m.ref} type="button" className="tf-chip" aria-pressed={sel?.ref === m.ref}
                      onClick={() => setSel(sel?.ref === m.ref ? null : m)} title={m.descripcion}>
                      <span>{etiquetaMedida(m)}</span>
                      <strong>{eur(precioModo(m, modo))}</strong>
                      {esReciente(m.fecha) && m.evol ? <i className={m.evol > 0 ? 'sube' : 'baja'} aria-label={`Cambió hace poco: ${pct(m.evol)}`} /> : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              g.medidas.map(m => (
                <button key={m.ref} type="button" className="tf-grupo tf-suelto" aria-pressed={sel?.ref === m.ref}
                  onClick={() => setSel(sel?.ref === m.ref ? null : m)}>
                  <span>{conPor(m.descripcion)}</span>
                  <strong>{eur(precioModo(m, modo))}<small>/{m.ud_venta}</small></strong>
                </button>
              ))
            ))}
          </div>
          {sel && (
            <div className="tf-barra" role="region" aria-label="Medida elegida">
              <div className="tf-barra-txt">
                <small>Elegido</small>
                <strong>{conPor(sel.descripcion)}</strong>
              </div>
              <div className="tf-barra-precio">
                <strong>{eur(sel.pvp)}<small>/{sel.ud_venta}</small></strong>
                <small>{eur(sel.pvp_iva)} con IVA · coste {eur(sel.coste)}</small>
              </div>
              <button className="btn tf-barra-btn" onClick={() => navigate(enlaceFicha(prov, fam, sel.ref))}>
                Ver ficha <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── 4 · Ficha de un artículo ──────────────────────────────────────────────
function Evolucion({ puntos, ud }: { puntos: { fecha: string; precio: number }[]; ud: string }) {
  if (puntos.length < 2) {
    return <p className="tf-nota">Solo hay un precio de compra apuntado ({puntos[0] ? `${eur(puntos[0].precio)} en ${mesLargo(puntos[0].fecha)}` : '—'}).
      Cada precio nuevo que entre se irá añadiendo aquí.</p>;
  }
  const W = 320, H = 110, P = 18;
  const vals = puntos.map(p => p.precio);
  const min = Math.min(...vals), max = Math.max(...vals), rango = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (puntos.length - 1);
  const y = (v: number) => H - P - ((v - min) / rango) * (H - 2 * P);
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.precio).toFixed(1)}`).join(' ');
  return (
    <>
      <svg className="tf-graf" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Precio de compra: ${puntos.map(p => `${eur(p.precio)} en ${mesLargo(p.fecha)}`).join(', ')}`}>
        <line x1={0} x2={W} y1={H - 6} y2={H - 6} className="tf-graf-base" />
        <path d={linea} className="tf-graf-linea" />
        {puntos.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.precio)} r={i === puntos.length - 1 ? 6 : 5} className={i === puntos.length - 1 ? 'tf-graf-ult' : 'tf-graf-punto'} />)}
      </svg>
      <div className="tf-graf-pie">
        {puntos.map((p, i) => <span key={i}><strong>{eur(p.precio)}</strong> {mesLargo(p.fecha)}</span>)}
      </div>
      <p className="tf-nota">Precio de compra por {ud}. Cada precio nuevo que entre se irá añadiendo aquí.</p>
    </>
  );
}

export function TarifaFichaPage() {
  const { prov = '', fam = '' } = useParams();
  const [sp] = useSearchParams();
  const ref = sp.get('ref') ?? '';
  const [d, setD] = useState<FichaTarifa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(() => {
    setError(null);
    getFichaTarifa(prov, ref).then(r => setD(r.data)).catch(e => setError(describeApiError(e)));
  }, [prov, ref]);
  useEffect(cargar, [cargar]);
  const familiaNombre = d?.familia.nombre ?? cache[prov]?.familias.find(f => f.id === fam)?.nombre ?? 'Familia';
  const evol = d?.historial && d.historial.length > 1
    ? ((d.historial[d.historial.length - 1].precio - d.historial[d.historial.length - 2].precio) / d.historial[d.historial.length - 2].precio) * 100
    : d?.evol ?? null;

  return (
    <div className="page-wide tf">
      <Cabecera volver={`/tarifas/${prov}/${fam}`} textoVolver={familiaNombre} titulo={conPor(d?.descripcion ?? ref)}
        sub={d?.proveedor_nombre} />
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {d?.aviso && <div className="doc-aviso subidas">{d.aviso}</div>}
      {!d && !error && <div className="tf-ficha"><div className="tf-ficha-foto skeleton" /><div className="tf-caja skeleton" style={{ height: 260 }} /></div>}
      {d && (
        <div className="tf-ficha">
          <div className="tf-col">
            <div className="tf-ficha-foto">
              <Foto src={fotoArticulo(d.familia.nombre, d.descripcion)} alt={d.descripcion} respaldo={pegatina(claveFamilia(d.familia.nombre))} />
              <span className="tf-foto-nota">Foto de referencia</span>
            </div>
            <div className="tf-precios">
              <div className="tf-precio-venta">
                <small>Venta sin IVA</small>
                <strong>{eur(d.pvp)}<span>/{d.ud_venta}</span></strong>
                <em>{eur(d.pvp_iva)}/{d.ud_venta} con IVA</em>
              </div>
              <div className="tf-caja tf-dato"><small>Coste actual</small><strong>{eur(d.coste)}/{d.ud_venta}</strong>
                <span>{eur(d.precio)} / {d.ud_compra}</span></div>
              <div className="tf-caja tf-dato"><small>Margen</small><strong>{d.margen != null ? `+${String(d.margen).replace('.', ',')} %` : '—'}</strong>
                <span>redondeado a 0,10 €</span></div>
            </div>
          </div>
          <div className="tf-col">
            <section className="tf-caja">
              <div className="tf-caja-cab">
                <h2>Evolución del coste</h2>
                {evol != null && evol !== 0 && <span className={`tf-evol ${evol > 0 ? 'sube' : 'baja'}`}>
                  {evol > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />} {pct(evol)}</span>}
              </div>
              <Evolucion puntos={d.historial} ud={d.ud_compra} />
            </section>
            <section className="tf-caja">
              <h2>Última compra</h2>
              {d.factura ? (
                <>
                  <div className="tf-factura">
                    <span>Factura <strong>{d.factura.numero}</strong>{d.factura.seguro === false ? ' (la del mismo mes)' : ''}</span>
                    <span>{fechaES(d.factura.fecha)}</span>
                  </div>
                  <a className="btn btn-ghost tf-ver-factura" href={d.factura.enlace} target="_blank" rel="noopener noreferrer">
                    <FileText size={18} /> {d.factura.enlace.includes('/file/d/') ? 'Abrir factura (PDF)' : 'Buscar factura en Drive'}
                  </a>
                </>
              ) : d.posibles.length ? (
                <>
                  <p className="tf-nota">El precio es de {mesLargo(d.fecha)}. Pudo salir de una de estas facturas:</p>
                  {d.posibles.map(p => (
                    <a key={p.numero} className="tf-factura tf-factura-link" href={p.enlace} target="_blank" rel="noopener noreferrer">
                      <span><strong>{p.numero}</strong></span><span>{fechaES(p.fecha)} <FileText size={15} /></span>
                    </a>
                  ))}
                </>
              ) : (
                <p className="tf-nota">Precio de {mesLargo(d.fecha) || 'fecha desconocida'}. Esa factura es anterior al registro de la tarifa, así que no se puede enlazar.</p>
              )}
            </section>
            <section className="tf-caja">
              <h2>Características</h2>
              <dl className="tf-carac">
                {d.medida && <><dt>Medida</dt><dd>{conPor(d.medida)}</dd></>}
                <dt>Familia</dt><dd>{d.familia.nombre}</dd>
                <dt>Se compra por</dt><dd>{d.ud_compra}</dd>
                <dt>Se vende por</dt><dd>{d.ud_venta === 'm' ? 'metro' : d.ud_venta === 'ud' ? 'unidad' : d.ud_venta}</dd>
                {d.kg_m != null && <><dt>Peso</dt><dd>{d.kg_m.toLocaleString('es-ES', { maximumFractionDigits: 3 })} kg/m</dd></>}
                <dt>Proveedor</dt><dd>{d.proveedor_nombre}</dd>
              </dl>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
