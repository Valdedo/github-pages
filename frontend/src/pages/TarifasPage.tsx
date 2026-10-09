import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, Search, X, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { getTarifas, getTarifa, actualizarTarifa, getFichaTarifa, describeApiError } from '../api/client';
import { coincide, fechaES } from '../lib/texto';
import { esConsulta } from '../auth';
import { useIsMobile } from '../hooks';
import { ConnectionError } from '../components/ConnectionError';
import { useCfToast } from '../components/CfToast';
import {
  PROXIMAMENTE, PEGATINA_PROVEEDOR, pegatina, claveFamilia, fotoArticulo, eur, pct, precioModo, mesLargo, esReciente,
  type Tarifa, type TarifaResumen, type TarifaMedida, type FichaTarifa, type ModoPrecio, type TarifaFamilia, type TarifaGrupo,
} from '../lib/tarifas';
import './tarifas.css';

// Lo leído se guarda mientras la app está abierta, para ir y volver entre pantallas sin esperar
const cache: Record<string, Tarifa> = {};
const fichas: Record<string, FichaTarifa> = {};
const leyendo: Record<string, Promise<Tarifa>> = {};
const leerTarifa = (prov: string) =>
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
function Foto({ src, alt, respaldo, className }: { src: string; alt: string; respaldo: string; className?: string }) {
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

const enlaceFicha = (prov: string, fam: string, ref: string) => `/tarifas/${prov}/${fam}/ficha?ref=${encodeURIComponent(ref)}`;
const etiquetaMedida = (m: TarifaMedida) => [m.valor, m.ud_medida].filter(Boolean).join(' ');
/** «50X50X4» → «50×50×4» para leerlo mejor */
const conPor = (s: string) => s.replace(/(\d)\s*X\s*(?=\d)/g, '$1×');
const udLarga = (u: string) => u === 'm' ? 'metro' : u === 'ud' ? 'unidad' : u;
/** «7,50 €/m»; si no hay precio, solo «—» */
const eurUd = (v: number | null | undefined, ud: string) => v == null ? '—' : `${eur(v)}/${ud}`;

type Resultado = { t: Tarifa; f: TarifaFamilia; m: TarifaMedida };
function buscar(ts: Tarifa[], q: string): Resultado[] {
  // «50x50x4» y «50 x 50 x 4» deben encontrar «50X50X4»
  const limpio = q.replace(/(\d)\s*[x×*]\s*(?=\d)/gi, '$1x');
  const out: Resultado[] = [];
  for (const t of ts) for (const f of t.familias) for (const g of f.grupos) for (const m of g.medidas)
    if (coincide(limpio, m.descripcion, f.nombre, g.titulo, g.seccion, m.codigo, m.original)) out.push({ t, f, m });
  return out;
}

/** Resultados de búsqueda: en el ordenador, tabla con todos los precios; en el móvil, lista. */
function Resultados({ res, q, donde }: { res: Resultado[]; q: string; donde: string }) {
  const navigate = useNavigate();
  const movil = useIsMobile();
  const MAX = 100;
  if (!res.length) return <div className="tf-vacio">No hay nada con «{q}» en {donde}. Prueba con menos palabras o solo la medida (p. ej. 50x50).</div>;
  const vistos = res.slice(0, MAX);
  const pie = <p className="tf-nota tf-res-cuenta">{res.length} {res.length === 1 ? 'artículo' : 'artículos'}{res.length > MAX ? ` (se enseñan los ${MAX} primeros; afina la búsqueda)` : ''}{movil ? '' : ' · Intro abre el primero'}</p>;
  if (movil) {
    return (
      <>
        {pie}
        <div className="tf-lista">
          {vistos.map(({ t, f, m }) => (
            <Link key={t.id + m.ref} to={enlaceFicha(t.id, f.id, m.ref)} className="tf-fila">
              <img src={pegatina(claveFamilia(f.nombre))} alt="" className="tf-fila-peg" />
              <span className="tf-fila-txt"><strong>{conPor(m.descripcion)}</strong><small>{f.nombre}</small></span>
              <span className="tf-fila-precio">{eur(m.pvp)}<small>/{m.ud_venta} sin IVA</small></span>
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
        <table className="tf-tabla">
          <thead>
            <tr>
              <th>Artículo</th><th>Familia</th>
              <th className="num">Coste</th><th className="num">Venta sin IVA</th><th className="num">Con IVA</th>
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
                <td className="tf-tabla-fam">{f.nombre}</td>
                <td className="num tf-gris">{eur(m.coste)}<small>/{m.ud_venta}</small></td>
                <td className="num tf-fuerte">{eur(m.pvp)}<small>/{m.ud_venta}</small></td>
                <td className="num">{eur(m.pvp_iva)}<small>/{m.ud_venta}</small></td>
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
      <Cabecera pruebas={!esConsulta()} titulo="Tarifas" sub="Las tarifas de proveedor, por familias y medidas." />
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

  return (
    <div className="page-wide tf">
      {toast}
      <Cabecera migas={[{ to: '/tarifas', t: 'Tarifas' }]} titulo={t?.nombre ?? 'Tarifa'}
        sub={t ? `${t.sub}${t.actualizada ? ` · actualizada el ${fechaES(t.actualizada)}` : ''}` : undefined}
        pegatinaSrc={pegatina(PEGATINA_PROVEEDOR[prov] ?? 'prov-hierros')}
        acciones={
          <button className="btn btn-ghost tf-refrescar" onClick={refrescar} disabled={refrescando || cargando}
            title="La app la vuelve a leer sola cada 3 horas">
            {refrescando ? <span className="spinner spinner-sm" /> : <RefreshCw size={16} />} Volver a leer de Drive
          </button>
        } />
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {t?.aviso && <div className="doc-aviso subidas">{t.aviso}</div>}
      <div className="tf-fila-busca">
        <Buscador q={q} setQ={setQ} placeholder={prov === 'zabaleta' ? 'Buscar: codo 110, SN8 315, referencia…' : 'Buscar: 50x50x4, IPN 120, pletina…'} onEnter={abrirPrimero} />
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
      {t && (q.trim() ? <Resultados res={res} q={q} donde={t.nombre} /> : (
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
  { v: 'venta', t: 'Sin IVA', largo: 'Venta sin IVA', frase: 'venta sin IVA' },
  { v: 'iva', t: 'Con IVA', largo: 'Venta con IVA', frase: 'venta con IVA' },
  { v: 'coste', t: 'Coste', largo: 'Coste de compra', frase: 'coste de compra' },
];

function Leyenda() {
  return (
    <span className="tf-leyenda">
      <span><i className="sube" /> subió hace poco</span>
      <span><i className="baja" /> bajó hace poco</span>
    </span>
  );
}

/** Panel de la derecha (ordenador): la medida elegida con todos sus precios y su factura, sin salir de la lista. */
function PanelMedida({ prov, fam, f, sel, total }: { prov: string; fam: string; f: TarifaFamilia; sel: TarifaMedida | null; total: number }) {
  const { d, error } = useFicha(prov, sel?.ref ?? null);
  return (
    <aside className="tf-panel" aria-live="polite">
      <div className="tf-panel-foto">
        <Foto src={fotoArticulo(f.nombre, sel?.descripcion, sel?.foto)} alt={sel ? conPor(sel.descripcion) : f.nombre} respaldo={pegatina(claveFamilia(f.nombre))} />
      </div>
      {!sel ? (
        <div className="tf-panel-vacio">
          <strong>{total} {total === 1 ? 'artículo' : 'artículos'}</strong>
          <p>Elige una medida de la lista para ver aquí su precio, el coste y la última factura.</p>
          <Leyenda />
        </div>
      ) : (
        <div className="tf-panel-datos">
          <h2>{conPor(sel.descripcion)}</h2>
          <div className="tf-panel-precio">
            <small>Venta sin IVA</small>
            <strong>{eur(sel.pvp)}<span>/{sel.ud_venta}</span></strong>
          </div>
          <dl className="tf-panel-lista">
            <dt>Con IVA</dt><dd>{eurUd(sel.pvp_iva, sel.ud_venta)}</dd>
            <dt>Coste</dt><dd>{eurUd(sel.coste, sel.ud_venta)}</dd>
            <dt>Precio de</dt><dd>{mesLargo(sel.fecha) || '—'}{sel.evol ? <span className={`tf-mini-evol ${sel.evol > 0 ? 'sube' : 'baja'}`}>{pct(sel.evol)}</span> : null}</dd>
            <dt>Última factura</dt>
            <dd>{error ? '—' : !d ? <span className="skeleton tf-panel-cargando" /> : d.factura
              ? <a href={d.factura.enlace} target="_blank" rel="noopener noreferrer" className="tf-panel-fac"><FileText size={14} /> {d.factura.numero}</a>
              : 'sin enlazar'}</dd>
          </dl>
          <Link className="btn tf-panel-btn" to={enlaceFicha(prov, fam, sel.ref)}>Ver ficha completa <ChevronRight size={17} /></Link>
          <p className="tf-nota">Doble clic en una medida abre su ficha. Esc quita la selección.</p>
        </div>
      )}
    </aside>
  );
}

export function TarifaFamiliaPage() {
  const { prov = '', fam = '' } = useParams();
  const navigate = useNavigate();
  const { t, error, cargando, cargar } = useTarifa(prov);
  const ancho = !useIsMobile(1099); // con panel a la derecha
  const [modo, setModo] = useState<ModoPrecio>(() => { try { return (sessionStorage.getItem('cfTarifaModo') as ModoPrecio) || 'venta'; } catch { return 'venta'; } });
  const [sel, setSel] = useState<TarifaMedida | null>(null);
  useEffect(() => { try { sessionStorage.setItem('cfTarifaModo', modo); } catch { /* nada */ } }, [modo]);
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const f = t?.familias.find(x => x.id === fam);
  const total = f?.grupos.reduce((s, g) => s + g.medidas.length, 0) ?? 0;
  const elegir = (m: TarifaMedida) => setSel(s => s?.ref === m.ref && !ancho ? null : m);
  const abrir = (m: TarifaMedida) => navigate(enlaceFicha(prov, fam, m.ref));
  const modoActual = MODOS.find(m => m.v === modo)!;

  const chips = (g: TarifaGrupo, i: number) => (
    <section key={i} className="tf-grupo">
      <h3>{conPor(g.titulo!)}</h3>
      <div className={`tf-chips${g.medidas.some(m => etiquetaMedida(m).length > 7) ? ' tf-chips-largos' : ''}`}>
        {g.medidas.map(m => (
          <button key={m.ref} type="button" className="tf-chip" aria-pressed={sel?.ref === m.ref}
            onClick={() => elegir(m)} onDoubleClick={() => abrir(m)} title={conPor(m.descripcion)}>
            <span>{etiquetaMedida(m)}</span>
            <strong>{eur(precioModo(m, modo))}</strong>
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
            {MODOS.map(m => <button key={m.v} type="button" aria-pressed={modo === m.v} onClick={() => setModo(m.v)} title={m.largo}>{m.t}</button>)}
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
          <PanelMedida prov={prov} fam={fam} f={f} sel={sel} total={total} />
        </div>
      )}
      {f && !ancho && (
        <>
          <div className="tf-intro">
            <Foto className="tf-intro-foto" src={fotoArticulo(f.nombre)} alt={f.nombre} respaldo={pegatina(claveFamilia(f.nombre))} />
            <div>
              <strong>{total} {total === 1 ? 'artículo' : 'artículos'}</strong>
              <span>Toca una medida para ver su precio. Precios de {modoActual.frase}.</span>
              <Leyenda />
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
                <strong>{eur(sel.pvp)}<small>/{sel.ud_venta}</small></strong>
                <small>{eur(sel.pvp_iva)} con IVA · coste {eur(sel.coste)}</small>
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
function Evolucion({ puntos, ud }: { puntos: { fecha: string; precio: number }[]; ud: string }) {
  if (puntos.length < 2) {
    return <p className="tf-nota">Solo hay un precio de compra apuntado ({puntos[0] ? `${eur(puntos[0].precio)} en ${mesLargo(puntos[0].fecha)}` : '—'}).
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
        {puntos.slice(-6).map((p, i) => <span key={i}><strong>{eur(p.precio)}</strong> {mesLargo(p.fecha)}</span>)}
      </div>
      <p className="tf-nota">Precio de compra por {ud}. Cada precio nuevo que entre se irá añadiendo aquí.</p>
    </>
  );
}

/** Las otras medidas del mismo grupo, para saltar de una a otra sin volver atrás. */
function OtrasMedidas({ prov, fam, refActual }: { prov: string; fam: string; refActual: string }) {
  const { t } = useTarifa(prov);
  const g = t?.familias.find(f => f.id === fam)?.grupos.find(x => x.titulo && x.medidas.some(m => m.ref === refActual));
  if (!g || g.medidas.length < 2) return null;
  return (
    <section className="tf-caja">
      <h2>Otras medidas · {conPor(g.titulo!)}</h2>
      <div className={`tf-chips${g.medidas.some(m => etiquetaMedida(m).length > 7) ? ' tf-chips-largos' : ''}`}>
        {g.medidas.map(m => m.ref === refActual ? (
          <span key={m.ref} className="tf-chip" aria-current="true" data-actual="1">
            <span>{etiquetaMedida(m)}</span><strong>{eur(m.pvp)}</strong>
          </span>
        ) : (
          <Link key={m.ref} className="tf-chip" to={enlaceFicha(prov, fam, m.ref)} replace title={conPor(m.descripcion)}>
            <span>{etiquetaMedida(m)}</span><strong>{eur(m.pvp)}</strong>
          </Link>
        ))}
      </div>
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
  const familiaNombre = d?.familia.nombre ?? t?.familias.find(f => f.id === fam)?.nombre ?? 'Familia';
  const evol = d?.historial && d.historial.length > 1
    ? ((d.historial[d.historial.length - 1].precio - d.historial[d.historial.length - 2].precio) / d.historial[d.historial.length - 2].precio) * 100
    : d?.evol ?? null;

  const foto = d && (
    <div className="tf-ficha-foto">
      <Foto src={fotoArticulo(d.familia.nombre, d.descripcion, d.foto)} alt={conPor(d.descripcion)} respaldo={pegatina(claveFamilia(d.familia.nombre))} />
      {fotoArticulo(d.familia.nombre, d.descripcion, d.foto) && <span className="tf-foto-nota">Foto de referencia</span>}
    </div>
  );
  const precios = d && (
    <div className="tf-precios">
      <div className="tf-precio-venta">
        <small>Venta sin IVA</small>
        <strong>{eur(d.pvp)}<span>/{d.ud_venta}</span></strong>
        <em>{eurUd(d.pvp_iva, d.ud_venta)} con IVA</em>
        {d.nota && <span className={`tf-etiqueta${/revisar/i.test(d.nota) ? ' aviso' : ''}`}
          title={/revisar/i.test(d.nota) ? 'El precio ha cambiado mucho: conviene mirarlo' : 'Primera vez que se compra'}>
          {/revisar/i.test(d.nota) ? 'Revisar precio' : d.nota.charAt(0) + d.nota.slice(1).toLowerCase()}</span>}
      </div>
      <div className="tf-caja tf-dato"><small>Coste actual</small><strong>{eurUd(d.coste, d.ud_venta)}</strong>
        <span>{eur(d.precio)} / {d.ud_compra}</span></div>
      <div className="tf-caja tf-dato"><small>Margen</small><strong>{d.margen != null ? `+${String(d.margen).replace('.', ',')} %` : '—'}</strong>
        <span>{d.redondeo ?? 'redondeado a 0,10 €'}</span></div>
    </div>
  );
  const evolucion = d && (
    <section className="tf-caja">
      <div className="tf-caja-cab">
        <h2>Evolución del coste</h2>
        {evol != null && evol !== 0 && <span className={`tf-evol ${evol > 0 ? 'sube' : 'baja'}`}>
          {evol > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />} {pct(evol)}</span>}
      </div>
      <Evolucion puntos={d.historial} ud={d.ud_compra} />
    </section>
  );
  const compra = d && (
    <section className="tf-caja">
      <h2>Última compra</h2>
      {d.factura ? (
        <>
          <div className="tf-factura">
            <span>Factura <strong>{d.factura.numero}</strong>{d.factura.seguro === false ? ' (la del mismo mes)' : ''}</span>
            <span>{fechaES(d.factura.fecha)}</span>
          </div>
          {d.factura.cantidad != null && (
            <p className="tf-nota tf-linea-fac">
              {d.factura.cantidad.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {d.ud_compra} a {eur(d.factura.bruto)}
              {d.factura.dto1 ? ` − ${String(d.factura.dto1).replace('.', ',')} %` : ''}
              {d.factura.dto2 ? ` − ${String(d.factura.dto2).replace('.', ',')} %` : ''} → <strong>{eur(d.precio)}/{d.ud_compra}</strong> neto
            </p>
          )}
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
  );
  const carac = d && (
    <section className="tf-caja">
      <h2>Características</h2>
      {d.apunte && <p className="tf-nota tf-apunte">{d.apunte}</p>}
      <dl className="tf-carac">
        {d.codigo && <><dt>Referencia</dt><dd className="tf-cod">{d.codigo}</dd></>}
        {d.medida && <><dt>Medida</dt><dd>{conPor(d.medida)}</dd></>}
        <dt>Familia</dt><dd>{d.familia.nombre}{d.subcategoria ? ` · ${d.subcategoria}` : ''}</dd>
        {d.original && <><dt>En la factura</dt><dd className="tf-cod">{d.original}</dd></>}
        <dt>Se compra por</dt><dd>{d.ud_compra}</dd>
        <dt>Se vende por</dt><dd>{udLarga(d.ud_venta)}</dd>
        {d.kg_m != null && <><dt>Peso</dt><dd>{d.kg_m.toLocaleString('es-ES', { maximumFractionDigits: 3 })} kg/m</dd></>}
        {d.compras != null && <><dt>Veces comprado</dt><dd>{d.compras}</dd></>}
        {d.minimo != null && d.precio != null && d.minimo < d.precio - 0.0005 && <><dt>Más barato (12 meses)</dt><dd>{eur(d.minimo)}/{d.ud_compra}</dd></>}
        <dt>Proveedor</dt><dd>{d.proveedor_nombre}</dd>
      </dl>
    </section>
  );
  const otras = <OtrasMedidas prov={prov} fam={fam} refActual={ref} />;

  return (
    <div className="page-wide tf">
      <Cabecera migas={[{ to: '/tarifas', t: 'Tarifas' }, { to: `/tarifas/${prov}`, t: t?.nombre ?? 'Tarifa' }, { to: `/tarifas/${prov}/${fam}`, t: familiaNombre }]}
        titulo={conPor(d?.descripcion ?? ref)} sub={d?.proveedor_nombre} />
      {error && <ConnectionError message={error} onRetry={cargar} />}
      {d?.aviso && <div className="doc-aviso subidas">{d.aviso}</div>}
      {!d && !error && <div className="tf-ficha"><div className="tf-ficha-foto skeleton" /><div className="tf-caja skeleton" style={{ height: 260 }} /></div>}
      {d && (ancho ? (
        <div className="tf-ficha tf-ficha-esc">
          <div className="tf-col">{precios}{foto}{carac}</div>
          <div className="tf-col">{compra}{evolucion}{otras}</div>
        </div>
      ) : (
        <div className="tf-ficha">
          <div className="tf-col">{foto}{precios}{otras}{evolucion}{compra}{carac}</div>
        </div>
      ))}
    </div>
  );
}
