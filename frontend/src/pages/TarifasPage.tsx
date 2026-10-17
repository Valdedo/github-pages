import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode, type KeyboardEvent, Fragment } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Search, X, FileText, TrendingUp, TrendingDown, List, LayoutGrid } from 'lucide-react';
import { getTarifas, getTarifa, actualizarTarifa, getFichaTarifa, describeApiError } from '../api/client';
import { fechaES, normaliza } from '../lib/texto';
import { esConsulta, esEncargado } from '../auth';
import { useIsMobile } from '../hooks';
import { ConnectionError } from '../components/ConnectionError';
import { useCfToast } from '../components/CfToast';
import {
  PROXIMAMENTE, PEGATINA_PROVEEDOR, pegatina, claveFamilia, fotoArticulo, eur, pct, precioModo, mesLargo, esReciente,
  conIva, modoGuardado, guardarModo, totalEscala, datosPieza, soloPvp,
  type Tarifa, type Escala, type TarifaResumen, type TarifaMedida, type FichaTarifa, type ModoPrecio, type TarifaFamilia, type TarifaGrupo,
} from '../lib/tarifas';
import { CuadriculaTarifa, ListaTarifa } from '../components/CuadriculaTarifa';
import { ParaQueSirve } from '../components/ParaQueSirve';
import './tarifas.css';

// Lo leído se guarda mientras la app está abierta, para ir y volver entre pantallas sin esperar
export const cache: Record<string, Tarifa> = {};
const fichas: Record<string, FichaTarifa> = {};
const leyendo: Record<string, Promise<Tarifa>> = {};
export const leerTarifa = (prov: string) =>
  leyendo[prov] ??= getTarifa(prov).then(r => (cache[prov] = r.data)).finally(() => { delete leyendo[prov]; });

function useTarifa(prov: string) {
  const [t, setT] = useState<Tarifa | null>(cache[prov] ?? null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(!cache[prov]);
  const cargar = useCallback(async () => {
    setCargando(true);
    try { setT(await leerTarifa(prov)); setError(null); }
    catch (e) { setError(describeApiError(e)); }
    finally { setCargando(false); }
  }, [prov]);
  useEffect(() => { if (!cache[prov]) cargar(); }, [prov, cargar]);
  return { t, setT, error, cargando, cargar };
}

/** Ficha de un artículo (con su factura), guardada para no pedirla dos veces. */
function useFicha(prov: string, ref: string | null) {
  const clave = `${prov}|${ref}`;
  const [d, setD] = useState<FichaTarifa | null>(ref ? fichas[clave] ?? null : null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(() => {
    if (!ref) { setD(null); return; }
    setError(null);
    if (fichas[clave]) { setD(fichas[clave]); return; }
    setD(null);
    getFichaTarifa(prov, ref).then(r => { fichas[clave] = r.data; setD(r.data); }).catch(e => setError(describeApiError(e)));
  }, [prov, ref, clave]);
  useEffect(cargar, [cargar]);
  return { d, error, cargar };
}

/** Foto de referencia; si no carga, se queda la pegatina de la familia. */
export function Foto({ src, alt, respaldo, className }: { src: string; alt: string; respaldo: string; className?: string }) {
  const [mal, setMal] = useState(false);
  useEffect(() => setMal(false), [src]);
  return mal || !src
    ? <img className={`${className ?? ''} tf-foto-respaldo`} src={respaldo} alt={alt} />
    : <img className={className} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setMal(true)} />;
}

type Miga = { to: string; t: string };
/** Cabecera verde: migas (en el móvil solo «‹ anterior»), título y, a la derecha en el ordenador, los botones. */
function Cabecera({ migas = [], titulo, sub, pegatinaSrc, acciones, pruebas }: {
  migas?: Miga[]; titulo: string; sub?: string; pegatinaSrc?: string; acciones?: ReactNode; pruebas?: boolean;
}) {
  return (
    <div className="tf-cab">
      {migas.length > 0 && (
        <nav className="tf-migas" aria-label="Estás en">
          {migas.map((m, i) => (
            <span key={m.to} className={i === migas.length - 1 ? 'tf-miga-ult' : 'tf-miga'}>
              <Link to={m.to}>{i === migas.length - 1 && <ChevronLeft size={17} className="tf-miga-flecha" />}{m.t}</Link>
              {i < migas.length - 1 && <ChevronRight size={14} className="tf-miga-sep" aria-hidden="true" />}
            </span>
          ))}
        </nav>
      )}
      <div className="tf-cab-fila">
        {pegatinaSrc && <img className="tf-cab-peg" src={pegatinaSrc} alt="" />}
        <div className="tf-cab-txt">
          <h1>{titulo}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {pruebas && <span className="tf-pruebas">En pruebas</span>}
        {acciones && <div className="tf-cab-acciones">{acciones}</div>}
      </div>
    </div>
  );
}

function Buscador({ q, setQ, placeholder, onEnter, autoFocus }: {
  q: string; setQ: (v: string) => void; placeholder: string; onEnter?: () => void; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // En el ordenador: la tecla «/» lleva al buscador (como en tantas webs)
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => {
      const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
      if (e.key === '/' && !enCampo && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); ref.current?.focus(); ref.current?.select();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); }
    if (e.key === 'Escape') setQ('');
  };
  return (
    <div className="search-bar tf-buscar">
      <Search size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <input ref={ref} type="text" enterKeyHint="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={tecla}
        placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus} />
      {q ? <button className="search-bar-clear" onClick={() => { setQ(''); ref.current?.focus(); }} aria-label="Borrar búsqueda"><X size={16} /></button>
        : <kbd className="tf-tecla" aria-hidden="true">/</kbd>}
    </div>
  );
}

export const enlaceFicha = (prov: string, fam: string, ref: string) => `/tarifas/${prov}/${fam}/ficha?ref=${encodeURIComponent(ref)}`;
export const etiquetaMedida = (m: TarifaMedida) => [m.valor, m.ud_medida].filter(Boolean).join(' ');
/** Botones anchos si la medida es larga o el precio pasa de 100 € (en el móvil «120,88 €» no cabe y el € bajaba solo) */
const chipsLargos = (ms: TarifaMedida[]) => ms.some(m => etiquetaMedida(m).length > 7 || (conIva(m) ?? 0) >= 100);
/** «50X50X4» → «50×50×4» para leerlo mejor */
export const conPor = (s: string) => s.replace(/(\d)\s*X\s*(?=\d)/g, '$1×');
const udLarga = (u: string) => u === 'm' ? 'metro' : u === 'ud' ? 'unidad' : u;
/** En los botones de medida solo va el precio: si todo el grupo se vende igual (y no por unidad), se dice una vez
 *  en el título («· precio por metro»); si se mezclan, cada botón lleva la suya. */
const udGrupo = (ms: TarifaMedida[]) => {
  const uds = [...new Set(ms.map(m => m.ud_venta))];
  return uds.length === 1 && uds[0] !== 'ud' ? <small className="tf-grupo-ud"> · precio por {udLarga(uds[0])}</small> : null;
};
const udMezcla = (ms: TarifaMedida[]) => new Set(ms.map(m => m.ud_venta)).size > 1;
/** «7,50 €/m»; si no hay precio, solo «—» */
const eurUd = (v: number | null | undefined, ud: string) => v == null ? '—' : `${eur(v)}/${ud}`;
/** El código del proveedor tal como se enseña; el comodín de Zabaleta («INC») no identifica a nadie. */
export const codigoVisible = (m: { codigo?: string | null; comodin?: boolean }) =>
  m.comodin ? `sin código (${m.codigo})` : (m.codigo ?? '');
/** Precio por metro de un rollo o una barra, en el precio que se está enseñando. */
export const porMetro = (m: TarifaMedida, modo: ModoPrecio) => {
  const p = precioModo(m, modo);
  return m.metros && m.metros > 1 && p != null ? p / m.metros : null;
};

/** Una escala en pocas palabras: «palé 106,48 €» (palé entero) o «5+ rollos 15,15 €» (precio por unidad). */
export const escalaCorta = (e: Escala, iva: boolean) => {
  const n = e.nombre.replace(/^Desde 5 rollos/, '5+ rollos').replace(/ \(.*\)$/, '').replace('Palé completo', 'palé');
  const tot = totalEscala(e, iva);
  return `${n} ${tot != null ? eur(tot) : eur(iva ? conIva(e) : e.pvp)}`;
};

export type Resultado = { t: Tarifa; f: TarifaFamilia; m: TarifaMedida };
export function buscar(ts: Tarifa[], q: string): Resultado[] {
  // «50x50x4» y «50 x 50 x 4» deben encontrar «50X50X4»
  const limpio = q.replace(/(\d)\s*[x×*]\s*(?=\d)/gi, '$1x');
  const palabras = normaliza(limpio).split(/\s+/).filter(Boolean);
  const out: Resultado[] = [];
  if (!palabras.length) return out;
  // Una cifra corta («110», «40») es una medida: cuenta como número entero en el nombre («Ø110», «75-110»)
  // o como principio de un código, pero no como trozo de un código (PE110040 es de Ø40, no de 110).
  const cortas = palabras.map(p => (/^\d{1,3}$/.test(p) ? new RegExp(`(^|[^\\d])${p}([^\\d]|$)`) : null));
  for (const t of ts) for (const f of t.familias) for (const g of f.grupos) for (const m of g.medidas) {
    const texto = [m.descripcion, f.nombre, g.titulo, g.seccion, m.original, ...(m.alias ?? [])].map(normaliza).join(' \u0001 ');
    const codigos = [m.codigo, ...(m.alias ?? [])].filter(Boolean).map(c => normaliza(c));
    const vale = palabras.every((p, i) => {
      const rx = cortas[i];
      if (rx) return rx.test(texto) || codigos.some(c => c.startsWith(p));
      return texto.includes(p) || codigos.some(c => c.includes(p));
    });
    if (vale) out.push({ t, f, m });
  }
  return out;
}

/** Resultados de búsqueda: en el ordenador, tabla con todos los precios; en el móvil, lista. */
function Resultados({ res, q, donde }: { res: Resultado[]; q: string; donde: string }) {
  const navigate = useNavigate();
  const movil = useIsMobile();
  const nueva = esEncargado(); // vista nueva (en pruebas): el código a la vista
  const MAX = 100;
  if (!res.length) return <div className="tf-vacio">No hay nada con «{q}» en {donde}. Prueba con menos palabras o solo la medida (p. ej. 50x50).</div>;
  const vistos = res.slice(0, MAX);
  const iva = modoGuardado() !== 'venta';
  const pie = <p className="tf-nota tf-res-cuenta">{res.length} {res.length === 1 ? 'artículo' : 'artículos'}{res.length > MAX ? ` (se enseñan los ${MAX} primeros; afina la búsqueda)` : ''}{movil ? '' : ' · Intro abre el primero'}</p>;
  if (movil) {
    return (
      <>
        {pie}
        <div className="tf-lista">
          {vistos.map(({ t, f, m }) => (
            <Link key={t.id + m.ref} to={enlaceFicha(t.id, f.id, m.ref)} className="tf-fila">
              <img src={pegatina(claveFamilia(f.nombre))} alt="" className="tf-fila-peg" />
              <span className="tf-fila-txt"><strong>{conPor(m.descripcion)}</strong><small>{nueva && m.codigo ? <><span className="tfn-cod">{codigoVisible(m)}</span> · </> : null}{f.nombre}</small></span>
              <span className="tf-fila-precio">{eur(iva ? conIva(m) : m.pvp)}<small>/{m.ud_venta} {iva ? 'con' : 'sin'} IVA</small></span>
              <ChevronRight size={18} className="tf-fila-flecha" />
            </Link>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      {pie}
      <div className="tf-tabla-caja">
        <table className={`tf-tabla${nueva ? ' tfn-tabla' : ''}`}>
          <thead>
            <tr>
              <th>Artículo</th>{nueva && <th>Código</th>}<th>Familia</th>
              <th className="num">Con IVA</th><th className="num">Sin IVA</th><th className="num">Coste</th>
              <th className="num">Precio de compra</th>
            </tr>
          </thead>
          <tbody>
            {vistos.map(({ t, f, m }) => (
              <tr key={t.id + m.ref} onClick={() => navigate(enlaceFicha(t.id, f.id, m.ref))}>
                <td>
                  <Link to={enlaceFicha(t.id, f.id, m.ref)} className="tf-tabla-art" onClick={e => e.stopPropagation()}>
                    <img src={pegatina(claveFamilia(f.nombre))} alt="" />{conPor(m.descripcion)}
                  </Link>
                </td>
                {nueva && <td className="tfn-cod tfn-cod-td">{codigoVisible(m)}</td>}
                <td className="tf-tabla-fam">{f.nombre}</td>
                <td className="num tf-fuerte">{eur(conIva(m))}<small>/{m.ud_venta}</small></td>
                <td className="num">{eur(m.pvp)}<small>/{m.ud_venta}</small></td>
                <td className="num tf-gris">{eur(m.coste)}<small>/{m.ud_venta}</small></td>
                <td className="num tf-gris">{mesLargo(m.fecha)}{m.evol ? <span className={`tf-mini-evol ${m.evol > 0 ? 'sube' : 'baja'}`}>{pct(m.evol)}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── 1 · Proveedores ──────────────────────────────────────────────────────
export function TarifasPage() {
  const navigate = useNavigate();
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
    Promise.all(lista.map(p => cache[p.id] ? Promise.resolve(cache[p.id]) : leerTarifa(p.id)))
      .then(setTodas).catch(e => setError(describeApiError(e)));
  }, [q, lista, todas.length]);
  const res = useMemo(() => q.trim() ? buscar(todas, q) : [], [todas, q]);
  const abrirPrimero = () => { const r = res[0]; if (r) navigate(enlaceFicha(r.t.id, r.f.id, r.m.ref)); };

  return (
    <div className="page-wide tf">
      <Cabecera titulo="Tarifas" sub="Las tarifas de proveedor, por familias y medidas." />
      {error && <ConnectionError message={error} onRetry={cargar} />}
      <Buscador q={q} setQ={setQ} placeholder="Buscar en todas: 50x50x4, codo 110…" onEnter={abrirPrimero} />
      {q.trim() ? (
        todas.length ? <Resultados res={res} q={q} donde="las tarifas" /> : <div className="tf-vacio"><span className="spinner" /> Buscando…</div>
      ) : (
        <>
          <h2 className="tf-sec">Por proveedor</h2>
          <div className="tf-provs">
            {(lista ?? []).map(p => (
              <Link key={p.id} to={`/tarifas/${p.id}`} className="tf-prov">
                <img src={pegatina(PEGATINA_PROVEEDOR[p.id] ?? 'prov-hierros')} alt="" className="tf-prov-peg" />
                <span className="tf-prov-txt">
                  <strong>{p.nombre}{p.en_pruebas && <span className="tf-etiqueta" title="Solo la ves tú hasta que la apruebes"> En pruebas</span>}</strong>
                  <small>{p.sub}{p.articulos != null ? ` · ${p.articulos} artículos · ${p.familias} familias` : ''}</small>
                  {p.actualizada && <em>Actualizada el {fechaES(p.actualizada)}</em>}
                </span>
                <ChevronRight size={20} />
              </Link>
            ))}
            {!lista && !error && <div className="tf-prov tf-esqueleto skeleton" />}
            {lista && PROXIMAMENTE.filter(p => !lista.some(x => x.id === p.id)).map(p => (
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
const BUSCA_EJEMPLO: Record<string, string> = {
  zabaleta: 'Buscar: codo 110, SN8 315, referencia…', silva: 'Buscar: 120/9/15, nudo fijo, 50 m…',
  pladur: 'Buscar: N 13, montante 70, pasta, código…', dinak: 'Buscar: 150 doble pared, codo, sombrerete…',
  ladrillos: 'Buscar: hueco 4, tabicón, bloque, refractario…',
  gas: 'Buscar: butano, propano, camping…',
  morteros: 'Buscar: cemento, cola, junta, yeso…', piensos: 'Buscar: gallinas, maíz, conejos, sal…',
};
const VISTA_PC = 'cfTarifaVistaPc';
export function TarifaProveedorPage() {
  const { prov = '' } = useParams();
  const navigate = useNavigate();
  const { t, setT, error, cargando, cargar } = useTarifa(prov);
  const [q, setQ] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const { toast, show } = useCfToast();
  const res = useMemo(() => t && q.trim() ? buscar([t], q) : [], [t, q]);
  const abrirPrimero = () => { const r = res[0]; if (r) navigate(enlaceFicha(r.t.id, r.f.id, r.m.ref)); };

  const refrescar = async () => {
    setRefrescando(true);
    try {
      const { data } = await actualizarTarifa(prov);
      cache[prov] = data; setT(data);
      for (const k of Object.keys(fichas)) if (k.startsWith(prov + '|')) delete fichas[k];
      show('Tarifa leída de nuevo de Drive');
    }
    catch (e) { show(describeApiError(e), { error: true }); }
    finally { setRefrescando(false); }
  };
  const uf = t?.ultima_factura;
  // Bombonas de gas: todo de golpe en una cuadrícula con foto y precio (sin pasar por familias)
  const cuadricula = t?.vista === 'cuadricula';
  const [modoElegido, setModo] = useModoPrecio();
  const iva = modoElegido !== 'venta';
  // En el ordenador, «Lista | Fotos» (morteros y piensos empiezan en lista; lo elegido se recuerda en este ordenador)
  const ordenador = !useIsMobile(1099);
  const [vistasPc, setVistasPc] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(VISTA_PC) || '{}'); } catch { return {}; }
  });
  const vistaPc = vistasPc[prov] ?? (t?.vista_ordenador === 'lista' ? 'lista' : 'fotos');
  const elegirVistaPc = (v: string) => {
    const n = { ...vistasPc, [prov]: v };
    setVistasPc(n);
    try { localStorage.setItem(VISTA_PC, JSON.stringify(n)); } catch { /* nada */ }
  };
  const enLista = cuadricula && ordenador && vistaPc === 'lista';
  const refrescarBtn = (
    <button className="btn btn-ghost tf-refrescar" onClick={refrescar} disabled={refrescando || cargando}
      title="La app la vuelve a leer sola cada 3 horas">
      {refrescando ? <span className="spinner spinner-sm" /> : <RefreshCw size={16} />} Volver a leer de Drive
    </button>
  );

  return (
    <div className="page-wide tf">
      {toast}
      <Cabecera migas={[{ to: '/tarifas', t: 'Tarifas' }]} titulo={t?.nombre ?? 'Tarifa'}
        sub={t ? `${t.sub}${t.actualizada ? ` · actualizada el ${fechaES(t.actualizada)}` : ''}` : undefined}
        pegatinaSrc={pegatina(PEGATINA_PROVEEDOR[prov] ?? 'prov-hierros')}
        acciones={cuadricula ? (
          <div className="tf-acciones-gc">
            <div className="tf-modos" role="group" aria-label="Qué precio enseñar">
              {MODOS.filter(m => m.v !== 'coste').map(m => (
                <button key={m.v} type="button" aria-pressed={(m.v === 'venta') !== iva} onClick={() => setModo(m.v)} title={m.largo}>{m.t}</button>
              ))}
            </div>
            {refrescarBtn}
          </div>
        ) : refrescarBtn} />
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {t?.aviso && <div className="doc-aviso subidas">{t.aviso}</div>}
      <div className="tf-fila-busca">
        <Buscador q={q} setQ={setQ} placeholder={BUSCA_EJEMPLO[prov] ?? 'Buscar: 50x50x4, IPN 120, pletina…'} onEnter={abrirPrimero} />
        {cuadricula && ordenador && !q.trim() && (
          <div className="tf-vista-pc" role="group" aria-label="Cómo enseñar los artículos">
            {([['lista', 'Lista', List], ['fotos', 'Fotos', LayoutGrid]] as const).map(([v, txt, Icono]) => (
              <button key={v} type="button" aria-pressed={vistaPc === v} onClick={() => elegirVistaPc(v)}><Icono size={16} /> {txt}</button>
            ))}
          </div>
        )}
        {t && uf && !q.trim() && (
          <a className="tf-ultima" href={uf.enlace} target="_blank" rel="noopener noreferrer"
            title="Abrir la última factura que se apuntó en la tarifa">
            <TrendingUp size={18} />
            <span>Última factura <strong>{uf.numero}</strong> · {fechaES(uf.fecha)}
              {uf.cambios ? <small> · {uf.cambios} precio{uf.cambios === 1 ? '' : 's'} cambiado{uf.cambios === 1 ? '' : 's'}</small> : null}</span>
            <FileText size={16} />
          </a>
        )}
      </div>
      {cargando && !t && (
        <>
          <div className="tf-familias">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="tf-familia skeleton" />)}</div>
          <p className="tf-nota">Leyendo la tarifa de Drive… la primera vez tarda unos segundos.</p>
        </>
      )}
      {t && (q.trim() ? <Resultados res={res} q={q} donde={t.nombre} /> : enLista ? (
        <ListaTarifa t={t} iva={iva} enlace={c => enlaceFicha(prov, c.f.id, c.m.ref)} />
      ) : cuadricula ? (
        <CuadriculaTarifa t={t} iva={iva} enlace={c => enlaceFicha(prov, c.f.id, c.m.ref)} />
      ) : (
        <div className="tf-familias">
          {t.familias.map(f => (
            <Link key={f.id} to={`/tarifas/${prov}/${f.id}`} className="tf-familia">
              <img src={pegatina(claveFamilia(f.nombre))} alt="" />
              <span>
                <strong>{f.nombre}</strong>
                <small>{f.n} {f.n === 1 ? 'artículo' : 'artículos'}</small>
              </span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── 3 · Medidas de una familia ────────────────────────────────────────────
const MODOS: { v: ModoPrecio; t: string; largo: string; frase: string }[] = [
  { v: 'iva', t: 'Con IVA', largo: 'Venta con IVA', frase: 'venta con IVA' },
  { v: 'venta', t: 'Sin IVA', largo: 'Venta sin IVA', frase: 'venta sin IVA' },
  { v: 'coste', t: 'Coste', largo: 'Coste de compra', frase: 'coste de compra' },
];

/** Qué precio se enseña: con IVA por defecto; se recuerda mientras la pestaña siga abierta. */
function useModoPrecio() {
  const [modo, setModo] = useState<ModoPrecio>(modoGuardado);
  useEffect(() => guardarModo(modo), [modo]);
  return [modo, setModo] as const;
}

function Leyenda() {
  return (
    <span className="tf-leyenda">
      <span><i className="sube" /> subió hace poco</span>
      <span><i className="baja" /> bajó hace poco</span>
    </span>
  );
}

/** Panel de la derecha (ordenador): la medida elegida con todos sus precios y su factura, sin salir de la lista. */
function PanelMedida({ prov, fam, f, sel, total, nueva, modo = 'iva' }: {
  prov: string; fam: string; f: TarifaFamilia; sel: TarifaMedida | null; total: number; nueva?: boolean; modo?: ModoPrecio;
}) {
  const { d, error } = useFicha(prov, sel?.ref ?? null);
  const iva = modo !== 'venta'; // el precio grande: con IVA, salvo que se haya elegido «Sin IVA»
  const pm = sel && nueva ? porMetro(sel, modo === 'coste' ? 'coste' : iva ? 'iva' : 'venta') : null;
  return (
    <aside className="tf-panel" aria-live="polite">
      <div className="tf-panel-foto">
        <Foto src={fotoArticulo(f.nombre, sel?.descripcion, sel?.foto)} alt={sel ? conPor(sel.descripcion) : f.nombre} respaldo={pegatina(claveFamilia(f.nombre))} />
      </div>
      {!sel ? (
        <div className="tf-panel-vacio">
          <strong>{total} {total === 1 ? 'artículo' : 'artículos'}</strong>
          <p>{soloPvp(f) ? 'Elige un artículo de la lista para ver aquí su precio con y sin IVA.'
            : <>Elige {nueva ? 'un artículo' : 'una medida'} de la lista para ver aquí su precio, el coste{nueva ? ', el código' : ''} y la última factura.</>}</p>
          {!soloPvp(f) && <Leyenda />}
        </div>
      ) : (
        <div className="tf-panel-datos">
          <h2>{conPor(sel.descripcion)}</h2>
          {nueva && sel.codigo && <p className="tfn-panel-cod">Código <span className="tfn-cod">{codigoVisible(sel)}</span>
            {d?.antes?.length ? <> · antes <span className="tfn-cod">{d.antes.join(', ')}</span></> : null}
            {d?.tambien?.length ? <> · también <span className="tfn-cod">{d.tambien.map(x => x.codigo).join(', ')}</span></> : null}</p>}
          <div className="tf-panel-precio">
            <small>{iva ? 'Venta con IVA' : 'Venta sin IVA'}</small>
            <strong>{eur(iva ? conIva(sel) : sel.pvp)}<span>/{sel.ud_venta}</span></strong>
          </div>
          <dl className="tf-panel-lista">
            <dt>{iva ? 'Sin IVA' : 'Con IVA'}</dt><dd>{eurUd(iva ? sel.pvp : conIva(sel), sel.ud_venta)}</dd>
            {!sel.solo_pvp && <><dt>Coste</dt><dd>{eurUd(sel.coste, sel.ud_venta)}</dd></>}
            {pm != null && <><dt>Sale el metro a</dt><dd>{eur(pm)}/m{modo === 'coste' ? ' de coste' : iva ? ' con IVA' : ' sin IVA'}</dd></>}
            {sel.escalas?.map(e => <Fragment key={e.nombre}><dt>{e.nombre}</dt>
              <dd className="tf-escala-dd">{totalEscala(e, iva) != null
                ? <>{eur(totalEscala(e, iva))} el palé<small>{eurUd(iva ? conIva(e) : e.pvp, sel.ud_venta)} · {iva ? 'con IVA' : 'sin IVA'}</small></>
                : <>{eurUd(iva ? conIva(e) : e.pvp, sel.ud_venta)}<small>{iva ? 'con IVA' : 'sin IVA'}</small></>}</dd></Fragment>)}
            {datosPieza(sel, iva).map(x => <Fragment key={x.t}><dt>{x.t}</dt><dd>{x.v}</dd></Fragment>)}
            {sel.solo_pvp ? <><dt>Precio</dt><dd>el de la hoja de la tienda</dd></> : <>
              <dt>Precio de</dt><dd>{mesLargo(sel.fecha) || '—'}{sel.evol ? <span className={`tf-mini-evol ${sel.evol > 0 ? 'sube' : 'baja'}`}>{pct(sel.evol)}</span> : null}</dd>
              <dt>{d?.factura?.tipo ? `Último ${d.factura.tipo.toLowerCase()}` : 'Última factura'}</dt>
              <dd>{error ? '—' : !d ? <span className="skeleton tf-panel-cargando" /> : d.factura
                ? <a href={d.factura.enlace} target="_blank" rel="noopener noreferrer" className="tf-panel-fac"><FileText size={14} /> {d.factura.numero}</a>
                : nueva && d.origen ? (d.origen_corto ?? 'lista de netos') : 'sin enlazar'}</dd>
            </>}
          </dl>
          <Link className="btn tf-panel-btn" to={enlaceFicha(prov, fam, sel.ref)}>Ver ficha completa <ChevronRight size={17} /></Link>
          <p className="tf-nota">Doble clic en {nueva ? 'un artículo' : 'una medida'} abre su ficha. Esc quita la selección.</p>
        </div>
      )}
    </aside>
  );
}

/** En pruebas (oct. 2026): Andrés ve la vista nueva; la tienda y Manolo, la de siempre. */
export function TarifaFamiliaPage() {
  return esEncargado() ? <FamiliaNueva /> : <FamiliaActual />;
}

function FamiliaActual() {
  const { prov = '', fam = '' } = useParams();
  const navigate = useNavigate();
  const { t, error, cargando, cargar } = useTarifa(prov);
  const ancho = !useIsMobile(1099); // con panel a la derecha
  const [modoElegido, setModo] = useModoPrecio();
  const [sel, setSel] = useState<TarifaMedida | null>(null);
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const f = t?.familias.find(x => x.id === fam);
  const sinCoste = soloPvp(f); // bombonas de gas: solo precio de venta
  const modo: ModoPrecio = sinCoste && modoElegido === 'coste' ? 'iva' : modoElegido;
  const iva = modo !== 'venta';
  const total = f?.grupos.reduce((s, g) => s + g.medidas.length, 0) ?? 0;
  const elegir = (m: TarifaMedida) => setSel(s => s?.ref === m.ref && !ancho ? null : m);
  const abrir = (m: TarifaMedida) => navigate(enlaceFicha(prov, fam, m.ref));
  const modoActual = MODOS.find(m => m.v === modo)!;

  const chips = (g: TarifaGrupo, i: number) => (
    <section key={i} className="tf-grupo">
      <h3>{conPor(g.titulo!)}{udGrupo(g.medidas)}</h3>
      <div className={`tf-chips${chipsLargos(g.medidas) ? ' tf-chips-largos' : ''}`}>
        {g.medidas.map(m => (
          <button key={m.ref} type="button" className="tf-chip" aria-pressed={sel?.ref === m.ref}
            onClick={() => elegir(m)} onDoubleClick={() => abrir(m)} title={conPor(m.descripcion)}>
            <span>{etiquetaMedida(m)}</span>
            <strong>{eur(precioModo(m, modo))}{udMezcla(g.medidas) && <small>/{m.ud_venta}</small>}</strong>
            {esReciente(m.fecha) && m.evol ? <i className={m.evol > 0 ? 'sube' : 'baja'} aria-label={`Cambió hace poco: ${pct(m.evol)}`} /> : null}
          </button>
        ))}
      </div>
    </section>
  );
  const sueltos = (g: TarifaGrupo) => g.medidas.map(m => (
    <button key={m.ref} type="button" className="tf-grupo tf-suelto" aria-pressed={sel?.ref === m.ref}
      onClick={() => elegir(m)} onDoubleClick={() => abrir(m)}>
      <span>{conPor(m.descripcion)}</span>
      <strong>{eur(precioModo(m, modo))}<small>/{m.ud_venta}</small></strong>
    </button>
  ));
  // Tarifas con subcategorías (Zabaleta): una sección por subcategoría, con lo que va por medidas
  // en botones y el resto en una lista con su referencia.
  const secciones = f && f.grupos.some(g => g.seccion)
    ? f.grupos.reduce<{ t: string; gs: TarifaGrupo[] }[]>((acc, g) => {
      const t = g.seccion || 'Otros';
      const u = acc[acc.length - 1];
      if (u && u.t === t) u.gs.push(g); else acc.push({ t, gs: [g] });
      return acc;
    }, [])
    : null;
  const lista = f && (secciones ? (
    <div className="tf-grupos tf-con-subs">
      {secciones.map(sc => (
        <section key={sc.t} className="tf-sub">
          <h2 className="tf-sub-tit">{sc.t} <small>{sc.gs.reduce((n, g) => n + g.medidas.length, 0)}</small></h2>
          {sc.gs.filter(g => g.titulo).map(chips)}
          {sc.gs.filter(g => !g.titulo).map((g, i) => (
            <div key={i} className="tf-filas">
              {g.medidas.map(m => (
                <button key={m.ref} type="button" className="tf-filita" aria-pressed={sel?.ref === m.ref}
                  onClick={() => elegir(m)} onDoubleClick={() => abrir(m)}>
                  <span className="tf-filita-txt">{conPor(m.descripcion)}{m.codigo && <small>{m.codigo}</small>}</span>
                  {esReciente(m.fecha) && m.evol ? <i className={`tf-punto ${m.evol > 0 ? 'sube' : 'baja'}`} aria-label={`Cambió hace poco: ${pct(m.evol)}`} /> : null}
                  <strong>{eur(precioModo(m, modo))}<small>/{m.ud_venta}</small></strong>
                </button>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  ) : (
    <div className="tf-grupos">
      {f.grupos.map((g, i) => g.titulo ? chips(g, i) : sueltos(g))}
    </div>
  ));

  return (
    <div className={`page-wide tf tf-con-barra${sel && !ancho ? ' tf-hay-sel' : ''}`}>
      <Cabecera migas={[{ to: '/tarifas', t: 'Tarifas' }, { to: `/tarifas/${prov}`, t: t?.nombre ?? 'Tarifa' }]}
        titulo={f?.nombre ?? 'Familia'} sub={f ? `${total} ${total === 1 ? 'artículo' : 'artículos'} · precios por unidad de venta` : undefined}
        pegatinaSrc={f ? pegatina(claveFamilia(f.nombre)) : undefined}
        acciones={
          <div className="tf-modos" role="group" aria-label="Qué precio enseñar">
            {(sinCoste ? MODOS.filter(m => m.v !== 'coste') : MODOS).map(m => <button key={m.v} type="button" aria-pressed={modo === m.v} onClick={() => setModo(m.v)} title={m.largo}>{m.t}</button>)}
          </div>
        } />
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {cargando && !t && <div className="tf-grupos">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="tf-grupo skeleton" style={{ height: 96 }} />)}</div>}
      {t && !f && <div className="tf-vacio">Esta familia ya no está en la tarifa. <Link to={`/tarifas/${prov}`}>Ver las familias</Link></div>}
      {f && ancho && (
        <div className="tf-fam-esc">
          <div className="tf-fam-lista">
            <p className="tf-nota tf-fam-ayuda">Precios de <strong>{modoActual.frase}</strong>. Haz clic en una medida para ver sus datos a la derecha.</p>
            {lista}
          </div>
          <PanelMedida prov={prov} fam={fam} f={f} sel={sel} total={total} modo={modo} />
        </div>
      )}
      {f && !ancho && (
        <>
          <div className="tf-intro">
            <Foto className="tf-intro-foto" src={fotoArticulo(f.nombre)} alt={f.nombre} respaldo={pegatina(claveFamilia(f.nombre))} />
            <div>
              <strong>{total} {total === 1 ? 'artículo' : 'artículos'}</strong>
              <span>Toca una medida para ver su precio. Precios de {modoActual.frase}.</span>
              {!soloPvp(f) && <Leyenda />}
            </div>
          </div>
          {lista}
          {sel && (
            <div className="tf-barra" role="region" aria-label="Medida elegida">
              <div className="tf-barra-txt">
                <small>Elegido</small>
                <strong>{conPor(sel.descripcion)}</strong>
              </div>
              <div className="tf-barra-precio">
                <strong>{eur(iva ? conIva(sel) : sel.pvp)}<small>/{sel.ud_venta}</small></strong>
                <small>{eur(iva ? sel.pvp : conIva(sel))} {iva ? 'sin' : 'con'} IVA{!sel.solo_pvp && <> · coste {eur(sel.coste)}</>}</small>
                {sel.escalas?.length ? <small className="tf-barra-escalas">{sel.escalas.map(e => escalaCorta(e, iva)).join(' · ')}</small> : null}
              </div>
              <button className="btn tf-barra-btn" onClick={() => abrir(sel)}>
                Ver ficha <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── 3b · Familia, vista nueva (en pruebas: solo el encargado, oct. 2026) ──
// - Arriba, las medidas de la familia: al elegir una salen juntas todas las piezas de esa medida.
// - Si un grupo tiene varias piezas de la misma medida (formatos de un tubo, colores, la misma pieza con dos
//   códigos), va en filas con su código, el precio y lo que sale el metro; si hay una por medida, en botones.
// - El código del proveedor, a la vista en las filas, en el panel, en la barra del móvil y en la ficha.
export type Bloque = { g: TarifaGrupo; items: TarifaMedida[]; filas: boolean } | { sueltos: TarifaMedida[] };
export type Seccion = { t: string | null; bloques: Bloque[] };

/** La familia ordenada para enseñarla: por subcategoría, con cada grupo y sus sueltos en el orden de la tarifa.
 *  Las piezas que repetían medida y venían sueltas («repes») vuelven a su grupo, al lado de su pareja. */
export function seccionesDe(f: TarifaFamilia): Seccion[] {
  const porRef = new Map<string, TarifaMedida>();
  for (const g of f.grupos) if (!g.titulo) for (const m of g.medidas) porRef.set(m.ref, m);
  const usados = new Set<string>();
  const out: Seccion[] = [];
  for (const g of f.grupos) {
    const t = g.seccion ?? null;
    let sc = out[out.length - 1];
    if (!sc || sc.t !== t) { sc = { t, bloques: [] }; out.push(sc); }
    if (g.titulo) {
      const items = [...g.medidas];
      for (const r of g.repes ?? []) {
        const m = porRef.get(r);
        if (!m) continue;
        usados.add(r);
        const i = items.map(x => x.valor).lastIndexOf(m.valor);
        items.splice(i < 0 ? items.length : i + 1, 0, m);
      }
      const filas = items.some(m => (m.metros ?? 0) > 1) || (g.repes?.length ?? 0) > 0
        || new Set(items.map(m => m.valor)).size < items.length;
      sc.bloques.push({ g, items, filas });
    } else {
      const u = sc.bloques[sc.bloques.length - 1];
      if (u && 'sueltos' in u) u.sueltos.push(...g.medidas); else sc.bloques.push({ sueltos: [...g.medidas] });
    }
  }
  for (const sc of out) for (const b of sc.bloques) if ('sueltos' in b) b.sueltos = b.sueltos.filter(m => !usados.has(m.ref));
  return out.map(sc => ({ ...sc, bloques: sc.bloques.filter(b => !('sueltos' in b) || b.sueltos.length) }));
}

/** Medidas de la familia para filtrar. Solo si hay varias y alguna junta piezas de grupos distintos (si cada
 *  medida es de un solo grupo, el filtro no aporta nada: ya están juntas). */
export function medidasDe(secciones: Seccion[]): { mp: string; op: number | null }[] {
  const m = new Map<string, { mp: string; op: number | null; grupos: Set<string> }>();
  for (const sc of secciones) for (const b of sc.bloques) {
    const items = 'sueltos' in b ? b.sueltos : b.items;
    for (const x of items) {
      if (!x.mp) continue;
      const e = m.get(x.mp) ?? { mp: x.mp, op: x.op ?? null, grupos: new Set<string>() };
      e.grupos.add('sueltos' in b ? `s:${x.ref}` : `${sc.t}|${b.g.titulo}`);
      m.set(x.mp, e);
    }
  }
  const lista = [...m.values()].sort((a, b) => (a.op ?? 1e9) - (b.op ?? 1e9) || a.mp.localeCompare(b.mp, 'es', { numeric: true }));
  return lista.length >= 4 && lista.some(x => x.grupos.size >= 2) ? lista.map(({ mp, op }) => ({ mp, op })) : [];
}

/** Una pieza de la familia: un tipo con varias medidas o un artículo solo. Se enseñan igual y, si la tarifa va por
 *  nombre, mezcladas por orden alfabético (la llave de bola suelta, al lado de las llaves de bola por medidas). */
export type Pieza = { g: TarifaGrupo; items: TarifaMedida[]; filas: boolean } | { m: TarifaMedida };
export function piezasDe(sc: Seccion, porNombre: boolean): Pieza[] {
  const ps = sc.bloques.flatMap<Pieza>(b => ('sueltos' in b ? b.sueltos.map(m => ({ m })) : [b]));
  if (!porNombre) return ps;
  const nom = (p: Pieza) => normaliza('m' in p ? p.m.descripcion : p.g.titulo ?? '');
  return [...ps].sort((a, b) => nom(a).localeCompare(nom(b), 'es', { numeric: true }));
}

/** Una pieza en una fila: nombre (o formato), código, precio y, si es rollo o barra, lo que sale el metro. */
function FilaPieza({ m, etiqueta, modo, sel, onSel, onOpen }: {
  m: TarifaMedida; etiqueta: string; modo: ModoPrecio; sel: boolean; onSel: () => void; onOpen: () => void;
}) {
  const p = precioModo(m, modo);
  const pm = porMetro(m, modo);
  return (
    <button type="button" className={`tfn-fila${p == null ? ' tfn-sin' : ''}`} aria-pressed={sel} onClick={onSel} onDoubleClick={onOpen}
      title={etiqueta !== m.descripcion ? conPor(m.descripcion) : undefined}>
      <span className="tfn-fila-txt">
        <span className="tfn-fila-nom">{conPor(etiqueta)}</span>
        {m.codigo && <span className="tfn-cod">{codigoVisible(m)}</span>}
      </span>
      <span className="tfn-fila-precio">
        {p != null
          ? <strong>{esReciente(m.fecha) && m.evol ? <i className={`tf-punto ${m.evol > 0 ? 'sube' : 'baja'}`} aria-label={`Cambió hace poco: ${pct(m.evol)}`} /> : null}
            {eur(p)}<small>/{m.ud_venta}</small></strong>
          : <em>Sin precio</em>}
        {pm != null && <small>{eur(pm)}/m</small>}
        {m.escalas?.some(e => e.total != null) && <small>{m.escalas.filter(e => e.total != null).map(e => escalaCorta(e, modo !== 'venta')).join(' · ')}</small>}
      </span>
    </button>
  );
}

function FamiliaNueva() {
  const { prov = '', fam = '' } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { t, error, cargando, cargar } = useTarifa(prov);
  const ancho = !useIsMobile(1099); // con panel a la derecha
  const [modoElegido, setModo] = useModoPrecio();
  const [sel, setSel] = useState<TarifaMedida | null>(null);
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const f = t?.familias.find(x => x.id === fam);
  const sinCoste = soloPvp(f); // bombonas de gas: solo precio de venta
  const modo: ModoPrecio = sinCoste && modoElegido === 'coste' ? 'iva' : modoElegido;
  const iva = modo !== 'venta';
  const total = f?.grupos.reduce((s, g) => s + g.medidas.length, 0) ?? 0;
  const secciones = useMemo(() => f ? seccionesDe(f) : [], [f]);
  const medidas = useMemo(() => medidasDe(secciones), [secciones]);
  const pedida = sp.get('medida');
  const medida = pedida && medidas.some(x => x.mp === pedida) ? pedida : null;
  const ponMedida = (m: string | null) => {
    const n = new URLSearchParams(sp);
    if (m) n.set('medida', m); else n.delete('medida');
    setSp(n, { replace: true });
    setSel(null);
  };
  const elegir = (m: TarifaMedida) => setSel(s => s?.ref === m.ref && !ancho ? null : m);
  const abrir = (m: TarifaMedida) => navigate(enlaceFicha(prov, fam, m.ref));
  const modoActual = MODOS.find(m => m.v === modo)!;
  // Lo que tiene medidas va en una línea que se abre. En el móvil empiezan cerradas; en el ordenador, abiertas si la
  // familia no es muy larga. «Abrir todas / Cerrar todas» lo cambia todo (`todas`) y «a» guarda las que se tocaron
  // a mano: las dos van en la dirección, para que al volver de la ficha siga todo igual.
  const nGrupos = secciones.reduce((n, sc) => n + sc.bloques.filter(b => !('sueltos' in b) && b.items.length > 1).length, 0);
  const todas = sp.get('todas');
  const base = todas ? todas === '1' : ancho && total <= 40;
  const tocados = useMemo(() => new Set((sp.get('a') ?? '').split('~').filter(Boolean)), [sp]);
  const cambia = (k: string) => {
    const t = new Set(tocados);
    if (t.has(k)) t.delete(k); else t.add(k);
    const n = new URLSearchParams(sp);
    if (t.size) n.set('a', [...t].join('~')); else n.delete('a');
    setSp(n, { replace: true });
  };
  const cambiaTodas = () => {
    const n = new URLSearchParams(sp);
    n.set('todas', base ? '0' : '1');
    n.delete('a');
    setSp(n, { replace: true });
  };
  // Hierros: «TUBO CUADRADO 50×50» con espesor «3» → la línea dice «50×50×3», que se entiende sola
  const etiquetaFila = (g: TarifaGrupo, m: TarifaMedida) => {
    const e = etiquetaMedida(m);
    const fin = prov === 'hierros' ? conPor(g.titulo ?? '').match(/(\d[\d,.×]*)$/) : null;
    return fin && /^\d+([.,]\d+)?$/.test(e) ? `${fin[1]}×${e}` : e;
  };
  const fila = (m: TarifaMedida, etiqueta: string) => (
    <FilaPieza key={m.ref} m={m} etiqueta={etiqueta} modo={modo} sel={sel?.ref === m.ref} onSel={() => elegir(m)} onOpen={() => abrir(m)} />
  );

  const desde = (items: TarifaMedida[]) => {
    const ps = items.map(m => precioModo(m, modo)).filter((x): x is number => x != null);
    return ps.length ? Math.min(...ps) : null;
  };
  /** Cada pieza en una línea, como los artículos sueltos; la que tiene medidas lleva «desde» y, al abrirla,
   *  una línea por medida con su código y su precio. */
  const pieza = (p: Pieza) => {
    if ('m' in p) return fila(p.m, p.m.descripcion);
    const { g, items } = p;
    if (items.length === 1) return fila(items[0], items[0].descripcion);  // una sola medida: como un suelto
    const k = `${g.seccion ?? ''}|${g.titulo}`;
    const abierto = base !== tocados.has(k);
    const d = desde(items);
    const conSel = items.some(m => m.ref === sel?.ref);
    const repetidas = new Set(items.filter((m, j) => items.findIndex(x => x.valor === m.valor) !== j).map(m => m.valor));
    const nombre = (m: TarifaMedida) => (!m.valor || repetidas.has(m.valor) ? m.descripcion : etiquetaFila(g, m));
    const cambio = items.find(m => esReciente(m.fecha) && m.evol);
    const uds = [...new Set(items.map(m => m.ud_venta))];
    const ud1 = uds.length === 1 ? uds[0] : null;
    const meds = items.map(m => etiquetaMedida(m)).filter(Boolean);
    const resumen = abierto || meds.length !== items.length ? `${items.length} ${p.filas ? 'formatos' : 'medidas'}`
      : items.length <= 4 ? meds.join(' · ') : `${items.length} medidas · de ${meds[0]} a ${meds[meds.length - 1]}`;
    return (
      <div key={k} className={`tfl-grupo${abierto ? ' tfl-abierto' : ''}`}>
        <button type="button" className={`tfn-fila tfl-cab${conSel && !abierto ? ' tfl-con-sel' : ''}`} aria-expanded={abierto} onClick={() => cambia(k)}>
          <span className="tfn-fila-txt">
            <span className="tfn-fila-nom">{conPor(g.titulo!)}</span>
            <span className="tfn-cod tfl-meds">{conPor(resumen)}</span>
          </span>
          <span className="tfn-fila-precio">
            {d != null ? <strong>{cambio && !abierto ? <i className={`tf-punto ${cambio.evol! > 0 ? 'sube' : 'baja'}`} aria-label="Alguna medida cambió hace poco" /> : null}
              <small className="tfl-desde">desde</small>{eur(d)}{ud1 && <small>/{ud1}</small>}</strong> : <em>Sin precio</em>}
          </span>
          <ChevronDown size={18} className="tfl-flecha" aria-hidden="true" />
        </button>
        {abierto && <div className="tfl-medidas">{items.map(m => fila(m, nombre(m)))}</div>}
      </div>
    );
  };
  // Con una medida elegida: todo lo de esa medida, en filas con el nombre entero, por subcategoría
  const filtradas = medida ? secciones.map(sc => ({
    t: sc.t,
    items: sc.bloques.flatMap(b => ('sueltos' in b ? b.sueltos : b.items)).filter(m => (m.ms ?? [m.mp]).includes(medida)),
  })).filter(sc => sc.items.length) : [];
  const nFiltradas = filtradas.reduce((n, sc) => n + sc.items.length, 0);

  const lista = f && (
    <>
      {medidas.length > 0 && (
        <div className="tfn-medidas" role="group" aria-label="Medida">
          <span className="tfn-medidas-tit">Medida</span>
          <button type="button" className="tfn-med" aria-pressed={!medida} onClick={() => ponMedida(null)}>Todas</button>
          {medidas.map(x => (
            <button key={x.mp} type="button" className="tfn-med" aria-pressed={medida === x.mp} onClick={() => ponMedida(medida === x.mp ? null : x.mp)}>{conPor(x.mp)}</button>
          ))}
        </div>
      )}
      {!medida && nGrupos >= 2 && (
        <div className="tfl-todas">
          <button type="button" className="tfn-quitar" onClick={cambiaTodas} aria-expanded={base}>
            <ChevronDown size={15} className={base ? 'tfl-girada' : undefined} /> {base ? 'Cerrar todas las medidas' : 'Abrir todas las medidas'}
          </button>
        </div>
      )}
      {medida ? (
        <div className="tf-grupos tf-con-subs">
          <p className="tfn-filtro"><span>Todo lo de <strong>{conPor(medida)}</strong> en {f.nombre.toLowerCase()} · {nFiltradas} {nFiltradas === 1 ? 'artículo' : 'artículos'}</span>
            <button type="button" className="tfn-quitar" onClick={() => ponMedida(null)}><X size={15} /> Ver todo</button></p>
          {filtradas.map(sc => (
            <section key={sc.t ?? '-'} className="tf-sub">
              {sc.t && <h2 className="tf-sub-tit">{sc.t} <small>{sc.items.length}</small></h2>}
              <div className="tfn-filas">{sc.items.map(m => fila(m, m.descripcion))}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="tf-grupos tf-con-subs">
          {secciones.map((sc, i) => (
            <section key={sc.t ?? i} className="tf-sub">
              {sc.t && <h2 className="tf-sub-tit">{sc.t} <small>{sc.bloques.reduce((n, b) => n + ('sueltos' in b ? b.sueltos.length : b.items.length), 0)}</small></h2>}
              <div className="tfn-filas tfl">{piezasDe(sc, !!f.mezclar).map(pieza)}</div>
            </section>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className={`page-wide tf tf-con-barra tfn${sel && !ancho ? ' tf-hay-sel' : ''}`}>
      <Cabecera migas={[{ to: '/tarifas', t: 'Tarifas' }, { to: `/tarifas/${prov}`, t: t?.nombre ?? 'Tarifa' }]}
        titulo={f?.nombre ?? 'Familia'} sub={f ? `${total} ${total === 1 ? 'artículo' : 'artículos'} · precios por unidad de venta` : undefined}
        pegatinaSrc={f ? pegatina(claveFamilia(f.nombre)) : undefined}
        acciones={
          <div className="tf-modos" role="group" aria-label="Qué precio enseñar">
            {(sinCoste ? MODOS.filter(m => m.v !== 'coste') : MODOS).map(m => <button key={m.v} type="button" aria-pressed={modo === m.v} onClick={() => setModo(m.v)} title={m.largo}>{m.t}</button>)}
          </div>
        } />
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {cargando && !t && <div className="tf-grupos">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="tf-grupo skeleton" style={{ height: 96 }} />)}</div>}
      {t && !f && <div className="tf-vacio">Esta familia ya no está en la tarifa. <Link to={`/tarifas/${prov}`}>Ver las familias</Link></div>}
      {f && ancho && (
        <div className="tf-fam-esc">
          <div className="tf-fam-lista">
            <p className="tf-nota tf-fam-ayuda">Precios de <strong>{modoActual.frase}</strong>. Haz clic en un artículo para ver sus datos a la derecha.</p>
            {lista}
          </div>
          <PanelMedida prov={prov} fam={fam} f={f} sel={sel} total={total} nueva modo={modo} />
        </div>
      )}
      {f && !ancho && (
        <>
          <div className="tf-intro">
            <Foto className="tf-intro-foto" src={fotoArticulo(f.nombre)} alt={f.nombre} respaldo={pegatina(claveFamilia(f.nombre))} />
            <div>
              <strong>{total} {total === 1 ? 'artículo' : 'artículos'}</strong>
              <span>Toca un artículo para ver su precio. Precios de {modoActual.frase}.</span>
              {!soloPvp(f) && <Leyenda />}
            </div>
          </div>
          {lista}
          {sel && (
            <div className="tf-barra" role="region" aria-label="Artículo elegido">
              <div className="tf-barra-txt">
                <small>{sel.codigo ? <>Código <span className="tfn-cod tfn-cod-barra">{codigoVisible(sel)}</span></> : 'Elegido'}</small>
                <strong>{conPor(sel.descripcion)}</strong>
              </div>
              <div className="tf-barra-precio">
                <strong>{eur(iva ? conIva(sel) : sel.pvp)}<small>/{sel.ud_venta}</small></strong>
                <small>{eur(iva ? sel.pvp : conIva(sel))} {iva ? 'sin' : 'con'} IVA{!sel.solo_pvp && <> · coste {eur(sel.coste)}</>}</small>
                {porMetro(sel, iva ? 'iva' : 'venta') != null && <small className="tfn-barra-m">sale a {eur(porMetro(sel, iva ? 'iva' : 'venta'))}/m</small>}
                {sel.escalas?.length ? <small className="tf-barra-escalas">{sel.escalas.map(e => escalaCorta(e, iva)).join(' · ')}</small> : null}
              </div>
              <button className="btn tf-barra-btn" onClick={() => abrir(sel)}>
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
function Evolucion({ puntos, ud }: { puntos: { fecha: string; precio: number; codigo?: string }[]; ud: string }) {
  if (!puntos.length) return <p className="tf-nota">Aún no hay precio de compra apuntado.</p>;
  if (puntos.length < 2) {
    return <p className="tf-nota">Solo hay un precio de compra apuntado ({puntos[0] ? `${eur(puntos[0].precio)} ${/^\d{4}-/.test(puntos[0].fecha) ? 'del' : 'en'} ${mesLargo(puntos[0].fecha)}` : '—'}).
      Cada precio nuevo que entre se irá añadiendo aquí.</p>;
  }
  const W = 320, H = 100, P = 16;
  const vals = puntos.map(p => p.precio);
  const min = Math.min(...vals), max = Math.max(...vals), rango = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (puntos.length - 1);
  const y = (v: number) => H - P - ((v - min) / rango) * (H - 2 * P);
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.precio).toFixed(1)}`).join(' ');
  return (
    <>
      <svg className="tf-graf" viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="none"
        aria-label={`Precio de compra: ${puntos.map(p => `${eur(p.precio)} en ${mesLargo(p.fecha)}`).join(', ')}`}>
        <line x1={0} x2={W} y1={H - 4} y2={H - 4} className="tf-graf-base" />
        <path d={linea} className="tf-graf-linea" vectorEffect="non-scaling-stroke" />
        {puntos.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.precio)} r={i === puntos.length - 1 ? 6 : 5}
            className={i === puntos.length - 1 ? 'tf-graf-ult' : 'tf-graf-punto'} vectorEffect="non-scaling-stroke">
            <title>{`${eur(p.precio)} · ${mesLargo(p.fecha)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="tf-graf-pie">
        {puntos.slice(-6).map((p, i) => <span key={i}><strong>{eur(p.precio)}</strong> {mesLargo(p.fecha)}{p.codigo ? <small className="tfn-cod"> · {p.codigo}</small> : null}</span>)}
      </div>
      <p className="tf-nota">Precio de compra por {ud}. Cada precio nuevo que entre se irá añadiendo aquí.
        {puntos.some(p => p.codigo) ? ' Los que llevan código al lado se compraron con el código antiguo.' : ''}</p>
    </>
  );
}

/** Las otras medidas del mismo grupo, para saltar de una a otra sin volver atrás. */
function OtrasMedidas({ prov, fam, refActual }: { prov: string; fam: string; refActual: string }) {
  const { t } = useTarifa(prov);
  const precio = (m: TarifaMedida) => eur(modoGuardado() === 'venta' ? m.pvp : conIva(m));
  const g = t?.familias.find(f => f.id === fam)?.grupos.find(x => x.titulo && x.medidas.some(m => m.ref === refActual));
  if (!g || g.medidas.length < 2) return null;
  return (
    <section className="tf-caja">
      <h2>Otras medidas · {conPor(g.titulo!)}{udGrupo(g.medidas)}</h2>
      <div className={`tf-chips${chipsLargos(g.medidas) ? ' tf-chips-largos' : ''}`}>
        {g.medidas.map(m => m.ref === refActual ? (
          <span key={m.ref} className="tf-chip" aria-current="true" data-actual="1">
            <span>{etiquetaMedida(m)}</span><strong>{precio(m)}</strong>
          </span>
        ) : (
          <Link key={m.ref} className="tf-chip" to={enlaceFicha(prov, fam, m.ref)} replace title={conPor(m.descripcion)}>
            <span>{etiquetaMedida(m)}</span><strong>{precio(m)}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Bombonas de gas: lo demás del mismo grupo (las otras de Repsol, las otras cargas…), con su precio. */
function MismoGrupo({ prov, fam, refActual, grupo }: { prov: string; fam: string; refActual: string; grupo?: string | null }) {
  const { t } = useTarifa(prov);
  if (!grupo) return null;
  const items = t?.familias.find(f => f.id === fam)?.grupos.filter(g => g.seccion === grupo).flatMap(g => g.medidas) ?? [];
  if (items.length < 2) return null;
  const iva = modoGuardado() !== 'venta';
  return (
    <section className="tf-caja">
      <h2>{grupo}</h2>
      {items.map(m => m.ref === refActual ? (
        <div key={m.ref} className="tf-factura" aria-current="true"><span><strong>{conPor(m.descripcion)}</strong></span><span><strong>{eur(iva ? conIva(m) : m.pvp)}</strong></span></div>
      ) : (
        <Link key={m.ref} className="tf-factura tf-factura-link" to={enlaceFicha(prov, fam, m.ref)} replace>
          <span>{conPor(m.descripcion)}</span><span>{eur(iva ? conIva(m) : m.pvp)}</span>
        </Link>
      ))}
      <p className="tf-nota">Precios {iva ? 'con' : 'sin'} IVA, por unidad.</p>
    </section>
  );
}

export function TarifaFichaPage() {
  const { prov = '', fam = '' } = useParams();
  const [sp] = useSearchParams();
  const ref = sp.get('ref') ?? '';
  const { d, error, cargar } = useFicha(prov, ref);
  const { t } = useTarifa(prov);
  const ancho = !useIsMobile(999);
  const nueva = esEncargado(); // vista nueva (en pruebas): código a la vista, códigos antiguos y precio por metro
  const iva = modoGuardado() !== 'venta'; // con IVA en grande, salvo que se haya elegido «Sin IVA» en la lista
  const grande = d ? (iva ? conIva(d) : d.pvp) : null;
  const otro = d ? (iva ? d.pvp : conIva(d)) : null;
  const familiaNombre = d?.familia.nombre ?? t?.familias.find(f => f.id === fam)?.nombre ?? 'Familia';
  const evol = d?.historial && d.historial.length > 1
    ? ((d.historial[d.historial.length - 1].precio - d.historial[d.historial.length - 2].precio) / d.historial[d.historial.length - 2].precio) * 100
    : d?.evol ?? null;

  const foto = d && (
    <div className="tf-ficha-foto">
      <Foto src={fotoArticulo(d.familia.nombre, d.descripcion, d.foto)} alt={conPor(d.descripcion)} respaldo={pegatina(claveFamilia(d.familia.nombre))} />
      {fotoArticulo(d.familia.nombre, d.descripcion, d.foto) && <span className="tf-foto-nota">
        {fotoArticulo(d.familia.nombre, d.descripcion, d.foto).startsWith('/catalogo/iso') ? 'Foto del catálogo de Isoltubex'
          : fotoArticulo(d.familia.nombre, d.descripcion, d.foto).startsWith('/catalogo/pladur') ? 'Foto del fabricante' 
          : fotoArticulo(d.familia.nombre, d.descripcion, d.foto).startsWith('/catalogo/lad') ? 'Foto de Cerámica Campo'
          : fotoArticulo(d.familia.nombre, d.descripcion, d.foto).startsWith('/catalogo/pi/fotos/') ? 'Foto del saco'
          : fotoArticulo(d.familia.nombre, d.descripcion, d.foto).startsWith('/catalogo/pi/') ? 'Dibujo (sin foto del saco)' : 'Foto de referencia'}</span>}
    </div>
  );
  const precios = d && (
    <div className="tf-precios">
      <div className="tf-precio-venta">
        <small>{iva ? 'Venta con IVA' : 'Venta sin IVA'}</small>
        {grande != null ? <strong>{eur(grande)}<span>/{d.ud_venta}</span></strong> : <strong>Sin precio</strong>}
        {otro != null && <em>{eurUd(otro, d.ud_venta)} {iva ? 'sin' : 'con'} IVA</em>}
        {nueva && grande != null && (d.metros ?? 0) > 1 && <em>sale a {eur(grande / d.metros!)}/m ({d.metros} m)</em>}
        {d.nota && <span className={`tf-etiqueta${/revisar|neto|confirmar/i.test(d.nota) ? ' aviso' : ''}`}
          title={/neto/i.test(d.nota) ? 'Sale en la tarifa de Isoltubex pero no tenemos su precio neto: hay que pedirlo'
            : /revisar/i.test(d.nota) ? 'El precio ha cambiado mucho: conviene mirarlo'
            : /confirmar/i.test(d.nota) ? (d.apunte ?? 'Lleva un coste de compra antiguo: confírmalo antes de cerrar el precio') : 'Primera vez que se compra'}>
          {/revisar/i.test(d.nota) ? 'Revisar precio' : d.nota.charAt(0) + d.nota.slice(1).toLowerCase()}</span>}
        {d.pvp == null && /neto/i.test(d.nota ?? '') && <span className="tf-nota" style={{ color: 'inherit', opacity: 0.9 }}>Pide el precio neto a Isoltubex antes de venderlo.</span>}
      </div>
      {!d.solo_pvp && <><div className="tf-caja tf-dato"><small>Coste actual</small><strong>{eurUd(d.coste, d.ud_venta)}</strong>
        <span>{eur(d.precio)} / {d.ud_compra}</span></div>
      <div className="tf-caja tf-dato"><small>Margen</small><strong className={d.margen != null && d.margen < 0 ? 'tf-margen-neg' : undefined}>{d.margen != null ? pct(d.margen) : '—'}</strong>
        <span>{d.redondeo ?? 'redondeado a 0,10 €'}</span></div></>}
    </div>
  );
  const escalas = d?.escalas?.length ? (
    <section className="tf-caja tf-escalas">
      <h2>Precio por cantidad</h2>
      <table>
        <thead><tr><th>Cantidad</th><th>Con IVA</th><th>Sin IVA</th><th>Margen</th></tr></thead>
        <tbody>
          <tr><td>Suelto</td><td>{eur(conIva(d))}</td><td>{eur(d.pvp)}</td><td>{d.margen != null ? `${String(d.margen).replace('.', ',')} %` : '—'}</td></tr>
          {d.escalas.map(e => (
            <tr key={e.nombre}><td>{e.nombre}</td>
              {e.total != null
                ? <><td><strong>{eur(totalEscala(e, true))}</strong><small className="tf-escala-ud">{eur(conIva(e))}/{d.ud_venta}</small></td>
                  <td>{eur(e.total)}<small className="tf-escala-ud">{eur(e.pvp)}/{d.ud_venta}</small></td></>
                : <><td><strong>{eur(conIva(e))}</strong></td><td>{eur(e.pvp)}</td></>}
              <td>{e.margen != null ? `${String(e.margen).replace('.', ',')} %` : '—'}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="tf-nota">{d.escalas.some(e => e.total != null)
        ? `Suelto, precio por ${udLarga(d.ud_venta)}; el palé completo, lo que vale el palé (debajo, lo que sale cada ${udLarga(d.ud_venta)}).`
        : `Precio por ${d.ud_venta}. Desde 5 rollos vale mezclando medidas.`}</p>
    </section>
  ) : null;
  const evolucion = d && !d.solo_pvp && (
    <section className="tf-caja">
      <div className="tf-caja-cab">
        <h2>Evolución del coste</h2>
        {evol != null && evol !== 0 && <span className={`tf-evol ${evol > 0 ? 'sube' : 'baja'}`}>
          {evol > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />} {pct(evol)}</span>}
      </div>
      <Evolucion puntos={d.historial} ud={d.ud_compra} />
    </section>
  );
  const compra = d && !d.solo_pvp && (
    <section className="tf-caja">
      <h2>{(d.origen && !d.factura) || d.factura?.tipo === 'Presupuesto' ? 'De dónde sale el coste' : 'Última compra'}</h2>
      {d.origen && !d.factura ? (
        <p className="tf-nota">{d.precio != null ? d.origen : 'Isoltubex aún no nos ha pasado su precio neto.'}</p>
      ) : d.factura ? (
        <>
          <div className="tf-factura">
            <span>{d.factura.tipo ?? 'Factura'} <strong>{d.factura.numero}</strong>{d.factura.seguro === false ? ' (la del mismo mes)' : ''}</span>
            <span>{fechaES(d.factura.fecha)}</span>
          </div>
          {d.factura.cantidad != null && d.factura.bruto == null && (
            <p className="tf-nota tf-linea-fac">
              {d.factura.cantidad.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {d.ud_compra} a <strong>{eur(d.factura.precio ?? d.precio)}/{d.ud_compra}</strong> neto
            </p>
          )}
          {d.factura.cantidad != null && d.factura.bruto != null && (
            <p className="tf-nota tf-linea-fac">
              {d.factura.cantidad.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {d.ud_compra} a {eur(d.factura.bruto)}
              {d.factura.dto1 ? ` − ${String(d.factura.dto1).replace('.', ',')} %` : ''}
              {d.factura.dto2 ? ` − ${String(d.factura.dto2).replace('.', ',')} %` : ''} → <strong>{eur(d.precio)}/{d.ud_compra}</strong> neto
            </p>
          )}
          <a className="btn btn-ghost tf-ver-factura" href={d.factura.enlace} target="_blank" rel="noopener noreferrer">
            <FileText size={18} /> {d.factura.enlace.includes('/file/d/') ? `Abrir ${(d.factura.tipo ?? 'factura').toLowerCase()} (PDF)` : `Buscar ${(d.factura.tipo ?? 'factura').toLowerCase()} en Drive`}
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
  );
  const carac = d && (
    <section className="tf-caja">
      <h2>Características</h2>
      {d.apunte && <p className="tf-nota tf-apunte">{d.apunte}</p>}
      {d.solo_pvp && <p className="tf-nota">{d.origen ?? 'Precio de venta al público, con IVA.'} Si cambia, se cambia en la hoja de Drive.</p>}
      {nueva && d.comodin && <p className="tf-nota tfn-aviso">Zabaleta lo factura sin código propio: «{d.codigo}» lo usa para muchas cosas distintas.</p>}
      {nueva && d.tambien?.some(x => x.precio != null && d.precio != null && x.precio > d.precio) && (
        <p className="tf-nota tfn-aviso">A veces lo facturan como {d.tambien.filter(x => x.precio != null && x.precio > (d.precio ?? 0)).map(x => `${x.codigo} (a ${eur(x.precio)})`).join(', ')}, más caro: pídelo como {d.codigo}.</p>
      )}
      {nueva && d.tambien?.some(x => x.precio == null) && (
        <p className="tf-nota">En la tarifa del fabricante sale también como {d.tambien.filter(x => x.precio == null).map(x => x.codigo).join(', ')}: es la misma pieza.</p>
      )}
      <dl className="tf-carac">
        {d.codigo && <><dt>{nueva ? 'Código' : 'Referencia'}</dt><dd className="tf-cod">{nueva ? codigoVisible(d) : d.codigo}</dd></>}
        {nueva && d.antes?.length ? <><dt>Código antiguo</dt><dd className="tf-cod">{d.antes.join(', ')}</dd></> : null}
        {nueva && d.tambien?.length ? <><dt>También sale como</dt><dd className="tf-cod">{d.tambien.map(x => x.codigo).join(', ')}</dd></> : null}
        {d.medida && <><dt>Medida</dt><dd>{conPor(d.medida)}</dd></>}
        {d.formato && <><dt>Formato</dt><dd>{d.formato}</dd></>}
        <dt>Familia</dt><dd>{d.familia.nombre}{d.subcategoria ? ` · ${d.subcategoria}` : ''}</dd>
        {d.original && <><dt>En la factura</dt><dd className="tf-cod">{d.original}</dd></>}
        {d.pvp_fab != null && <><dt>PVP de tarifa {d.pvp_fab_de ?? 'del fabricante'}</dt><dd>{eurUd(d.pvp_fab, d.ud_compra)}</dd></>}
        {!d.solo_pvp && <><dt>Se compra por</dt><dd>{d.ud_compra}</dd></>}
        <dt>Se vende por</dt><dd>{udLarga(d.ud_venta)}</dd>
        {d.iva != null && d.iva !== 21 && <><dt>IVA</dt><dd>{d.iva} %</dd></>}
        {d.kg_m != null && <><dt>Peso</dt><dd>{d.kg_m.toLocaleString('es-ES', { maximumFractionDigits: 3 })} kg/m</dd></>}
        {datosPieza(d, iva).map(x => <Fragment key={x.t}><dt>{x.t}</dt><dd>{x.v}</dd></Fragment>)}
        {d.compras != null && <><dt>Veces comprado</dt><dd>{d.compras}</dd></>}
        {d.minimo != null && d.precio != null && d.minimo < d.precio - 0.0005 && <><dt>Más barato (12 meses)</dt><dd>{eur(d.minimo)}/{d.ud_compra}</dd></>}
        {!d.solo_pvp && <><dt>Proveedor</dt><dd>{d.proveedor_nombre}</dd></>}
      </dl>
    </section>
  );
  const otras = d?.solo_pvp
    ? <MismoGrupo prov={prov} fam={fam} refActual={ref} grupo={d.subcategoria} />
    : <OtrasMedidas prov={prov} fam={fam} refActual={ref} />;
  // Morteros, piensos: para qué sirve y lo que pregunta el cliente, lo primero después del precio
  const sirve = d?.producto ? <ParaQueSirve p={d.producto} /> : null;

  return (
    <div className="page-wide tf">
      <Cabecera migas={[{ to: '/tarifas', t: 'Tarifas' }, { to: `/tarifas/${prov}`, t: t?.nombre ?? 'Tarifa' }, { to: `/tarifas/${prov}/${fam}`, t: familiaNombre }]}
        titulo={conPor(d?.descripcion ?? ref)}
        sub={d ? `${d.proveedor_nombre}${nueva && d.codigo ? (d.comodin ? ` · sin código propio (${d.codigo})` : ` · código ${d.codigo}`) : ''}` : undefined} />
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {d?.aviso && <div className="doc-aviso subidas">{d.aviso}</div>}
      {!d && !error && <div className="tf-ficha"><div className="tf-ficha-foto skeleton" /><div className="tf-caja skeleton" style={{ height: 260 }} /></div>}
      {d && (ancho ? (
        <div className="tf-ficha tf-ficha-esc">
          <div className="tf-col">{precios}{escalas}{foto}{carac}</div>
          <div className="tf-col">{sirve}{compra}{evolucion}{otras}</div>
        </div>
      ) : (
        <div className="tf-ficha">
          <div className="tf-col">{foto}{precios}{escalas}{sirve}{otras}{evolucion}{compra}{carac}</div>
        </div>
      ))}
    </div>
  );
}
