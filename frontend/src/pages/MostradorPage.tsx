import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Search, X, Home, Eye, EyeOff, Maximize, Minimize, Plus, Minus, ClipboardList,
  Check, Trash2, LogOut, Clock, Hand, Keyboard, Info,
} from 'lucide-react';
import { getTarifas, describeApiError } from '../api/client';
import { normaliza, numES } from '../lib/texto';
import { ConnectionError } from '../components/ConnectionError';
import { useCfToast } from '../components/CfToast';
import { useAnchoVentana } from '../hooks/useIsMobile';
import {
  PEGATINA_PROVEEDOR, pegatina, claveFamilia, fotoArticulo, eur, eurC, pct, mesLargo, esReciente, conIva, totalEscala, datosPieza,
  type Tarifa, type TarifaResumen, type TarifaMedida, type TarifaFamilia, type Escala,
} from '../lib/tarifas';
import {
  cache, leerTarifa, Foto, buscar, conPor, codigoVisible, etiquetaMedida, porMetro, seccionesDe, medidasDe,
  enlaceFicha, type Bloque,
} from './TarifasPage';
import { CuadriculaTarifa } from '../components/CuadriculaTarifa';
import { ParaQueSirve } from '../components/ParaQueSirve';
import './mostrador.css';

// ════════════════════════════════════════════════════════════════════════
// Mostrador (tableta junto al ordenador de ventas). En pruebas, oct. 2026.
// Buscar con el dedo un artículo de las tarifas y ver su precio en grande para
// pasarlo a TreyFACT. Todo en una pantalla: a la izquierda se navega
// (proveedor → familia → medida) o se busca; a la derecha, el precio elegido
// y la lista de lo apuntado para el cliente que está delante.
// El coste va tapado (el cliente ve la tableta): el ojo de arriba lo enseña.
// ════════════════════════════════════════════════════════════════════════

type Elegido = { t: Tarifa; f: TarifaFamilia; m: TarifaMedida };
type Apunte = { prov: string; fam: string; ref: string; codigo: string; descripcion: string; ud: string; pvp: number | null; pvp_iva: number | null; cant: number; hecho: boolean };
type Linea = Omit<Apunte, 'cant' | 'hecho'>;
/** Lo que se apunta de un artículo, o de su palé completo (ref «…#pale», precio del palé entero). */
const lineaDe = (e: Elegido): Linea => ({ prov: e.t.id, fam: e.f.id, ref: e.m.ref, codigo: e.m.codigo ?? '', descripcion: e.m.descripcion, ud: e.m.ud_venta, pvp: e.m.pvp, pvp_iva: e.m.pvp_iva });
const lineaEscala = (e: Elegido, es: Escala): Linea => ({
  ...lineaDe(e), ref: `${e.m.ref}#pale`, descripcion: `${e.m.descripcion} — ${es.nombre.toLowerCase()}`, ud: 'palé',
  pvp: es.total ?? null, pvp_iva: totalEscala(es, true),
});
/** Un toquecito en la tableta al sumar (donde el navegador lo permite). */
const vibrar = () => { try { navigator.vibrate?.(12); } catch { /* nada */ } };
type Reciente = { prov: string; fam: string; ref: string };

const LISTA = 'cfMostradorLista';
const RECIENTES = 'cfMostradorRecientes';
const COSTE = 'cfMostradorCoste';
const leer = <T,>(k: string, def: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : def; } catch { return def; } };
const guardar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* nada */ } };
const num = (v: number) => numES(v, 0, 2);
const margen = (m: TarifaMedida) => m.pvp != null && m.coste ? (m.pvp / m.coste - 1) * 100 : null;

function buscarArticulo(ts: Tarifa[], prov: string, ref: string): Elegido | null {
  const t = ts.find(x => x.id === prov);
  if (!t) return null;
  for (const f of t.familias) for (const g of f.grupos) for (const m of g.medidas) if (m.ref === ref) return { t, f, m };
  return null;
}

/** La búsqueda de siempre, con lo más parecido arriba: el código exacto, luego lo que empieza igual. */
function buscarOrdenado(ts: Tarifa[], q: string) {
  const nq = normaliza(q).replace(/\s+/g, '');
  const nqd = normaliza(q).replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1x');
  const nota = (m: TarifaMedida) => {
    const cod = normaliza(m.codigo ?? '').replace(/\s+/g, '');
    if (cod && cod === nq) return 0;
    if ((m.alias ?? []).some(a => normaliza(a).replace(/\s+/g, '') === nq)) return 0;
    if (cod && cod.startsWith(nq)) return 1;
    if (normaliza(conPor(m.descripcion)).replace(/×/g, 'x').startsWith(nqd)) return 2;
    return 3;
  };
  return buscar(ts, q).map((r, i) => ({ r, n: nota(r.m), i })).sort((a, b) => a.n - b.n || a.i - b.i).map(x => x.r);
}

/** Pantalla siempre encendida mientras se usa (donde el navegador lo permite). */
function usePantallaEncendida() {
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock;
    if (!wl) return;
    let lock: Lock | null = null;
    const pedir = () => { if (document.visibilityState === 'visible') wl.request('screen').then(l => { lock = l; }).catch(() => { /* nada */ }); };
    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => { document.removeEventListener('visibilitychange', pedir); lock?.release().catch(() => { /* nada */ }); };
  }, []);
}

function usePantallaCompleta() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const h = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const puede = typeof document.documentElement.requestFullscreen === 'function';
  const cambiar = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* nada */ });
    else document.documentElement.requestFullscreen().catch(() => { /* nada */ });
  };
  return { on, puede, cambiar };
}

export function MostradorPage() {
  usePantallaEncendida();
  const pantalla = usePantallaCompleta();
  const ancho = useAnchoVentana();
  const horizontal = ancho >= 900;
  const [sp, setSp] = useSearchParams();
  const { toast, show } = useCfToast();

  // ── Datos: todas las tarifas a la vez (para buscar al instante) ──
  const [lista, setLista] = useState<TarifaResumen[] | null>(null);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Tarifas que no se pudieron leer (p. ej. una hoja sin compartir): las demás se siguen viendo
  const [fallidas, setFallidas] = useState<Record<string, string>>({});
  const cargar = useCallback(() => {
    setError(null);
    getTarifas().then(async r => {
      setLista(r.data);
      const rs = await Promise.allSettled(r.data.map(p => cache[p.id] ? Promise.resolve(cache[p.id]) : leerTarifa(p.id)));
      const mal: Record<string, string> = {};
      rs.forEach((x, i) => { if (x.status === 'rejected') mal[r.data[i].id] = describeApiError(x.reason); });
      setTarifas(rs.flatMap(x => x.status === 'fulfilled' ? [x.value] : []));
      setFallidas(mal);
      const nombres = r.data.filter(p => mal[p.id]).map(p => p.nombre);
      if (nombres.length === r.data.length && nombres.length) setError(Object.values(mal)[0]);
      else if (nombres.length) {
        const cuales = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
        setError(nombres.length === 1 ? `No se pudo leer la tarifa de ${cuales}; las demás funcionan.`
          : `No se pudieron leer las tarifas de ${cuales}; las demás funcionan.`);
      }
    }).catch(e => setError(describeApiError(e)));
  }, []);
  useEffect(cargar, [cargar]);

  // ── Dónde estamos (en la dirección, para que «atrás» funcione) ──
  const prov = sp.get('p') ?? '';
  const fam = sp.get('f') ?? '';
  const medida = sp.get('m');
  const q = sp.get('q') ?? '';
  const sel = sp.get('r') ?? ''; // «prov|ref»
  const ir = (cambios: Record<string, string | null>, reemplazar = false) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(cambios)) if (v) n.set(k, v); else n.delete(k);
    setSp(n, { replace: reemplazar });
  };
  const t = tarifas.find(x => x.id === prov) ?? null;
  const f = t?.familias.find(x => x.id === fam) ?? null;
  // Bombonas de gas: todo de golpe en una cuadrícula grande, a lo ancho de la pantalla; cada toque suma uno
  const rejilla = !!t && t.vista === 'cuadricula' && !f && !q.trim();
  const [selProv, selRef] = sel.split('|');
  const elegido = sel ? buscarArticulo(tarifas, selProv, selRef ?? '') : null;
  // «Para qué sirve» abierto desde el botón «i» de la cuadrícula (morteros, piensos); en la dirección, para que atrás lo cierre
  const info = sp.get('i') ?? '';
  const [infoProv, infoRef] = info.split('|');
  const infoE = info ? buscarArticulo(tarifas, infoProv, infoRef ?? '') : null;
  const infoAqui = useRef(false); // abierto con el botón (no al cargar la dirección): cerrar = atrás
  const cerrarInfo = useCallback(() => {
    if (infoAqui.current) { infoAqui.current = false; window.history.back(); } else ir({ i: null }, true);
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Coste tapado por defecto ──
  const [verCoste, setVerCoste] = useState(() => { try { return sessionStorage.getItem(COSTE) === '1'; } catch { return false; } });
  useEffect(() => { try { sessionStorage.setItem(COSTE, verCoste ? '1' : '0'); } catch { /* nada */ } }, [verCoste]);

  // ── Lo último mirado y lo apuntado (se queda en la tableta) ──
  const [recientes, setRecientes] = useState<Reciente[]>(() => leer(RECIENTES, []));
  const [apuntes, setApuntes] = useState<Apunte[]>(() => leer(LISTA, []));
  useEffect(() => guardar(LISTA, apuntes), [apuntes]);
  const elegir = (e: Elegido) => {
    ir({ r: `${e.t.id}|${e.m.ref}` }, true);
    setVerLista(false);
    setRecientes(rs => {
      const n = [{ prov: e.t.id, fam: e.f.id, ref: e.m.ref }, ...rs.filter(x => !(x.prov === e.t.id && x.ref === e.m.ref))].slice(0, 12);
      guardar(RECIENTES, n);
      return n;
    });
  };
  const [verLista, setVerLista] = useState(false);
  /** Suma a la línea abierta (sin tachar) de ese artículo o la crea. */
  const sumar = (l: Linea, cant: number) => setApuntes(as => {
    const i = as.findIndex(a => a.prov === l.prov && a.ref === l.ref && !a.hecho);
    if (i >= 0) return as.map((a, j) => j === i ? { ...a, cant: Math.round((a.cant + cant) * 1000) / 1000 } : a);
    return [...as, { ...l, cant, hecho: false }];
  });
  const apuntar = (e: Elegido, cant: number) => {
    sumar(lineaDe(e), cant);
    show(`Apuntado: ${num(cant)} ${e.m.ud_venta} · ${conPor(e.m.descripcion)}`);
  };
  // Tocar la foto (o el palé) suma uno cada vez: dos toques, dos; tres, tres. Sin aviso: el número grande ya lo dice.
  const tocar = (l: Linea) => { sumar(l, 1); vibrar(); };
  const quitarUno = (prov: string, ref: string) => setApuntes(as => {
    let i = -1;
    as.forEach((a, j) => { if (a.prov === prov && a.ref === ref && !a.hecho) i = j; });
    if (i < 0) return as;
    return as[i].cant > 1 ? as.map((a, j) => j === i ? { ...a, cant: Math.round((a.cant - 1) * 1000) / 1000 } : a) : as.filter((_, j) => j !== i);
  });
  const cuentaDe = (prov: string, ref: string) => apuntes.reduce((n, a) => n + (a.prov === prov && a.ref === ref && !a.hecho ? a.cant : 0), 0);
  const borrarLista = () => {
    const antes = apuntes;
    setApuntes([]);
    show('Lista borrada', { undo: () => setApuntes(antes) });
  };

  // ── Búsqueda ──
  const resultados = useMemo(() => q.trim() && tarifas.length ? buscarOrdenado(tarifas, q) : [], [tarifas, q]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState(q);
  useEffect(() => setTexto(q), [q]);
  // Se busca al escribir, sin llenar el «atrás» de letras
  useEffect(() => {
    if (texto === q) return;
    const h = setTimeout(() => ir({ q: texto.trim() ? texto : null }, !!q), 180);
    return () => clearTimeout(h);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps
  const alInicio = () => { setTexto(''); setSp(new URLSearchParams(sel ? { r: sel } : {})); };

  // ── Contenido de la izquierda ──
  let migas: { t: string; on: () => void }[] = [];
  if (!q && t) migas = [{ t: 'Proveedores', on: () => ir({ p: null, f: null, m: null }) }, ...(f ? [{ t: t.nombre, on: () => ir({ f: null, m: null }) }] : [])];
  const volver = q ? () => { setTexto(''); ir({ q: null }); } : migas.length ? migas[migas.length - 1].on : null;

  let cuerpo: ReactNode;
  if (error && !tarifas.length) cuerpo = <ConnectionError message={error} onRetry={cargar} />;
  else if (q.trim()) cuerpo = !tarifas.length
    ? <div className="mo-vacio"><span className="spinner" /> Leyendo las tarifas…</div>
    : <Resultados res={resultados} q={q} sel={sel} onElegir={elegir} />;
  else if (prov && f && t) cuerpo = <Familia t={t} f={f} medida={medida} sel={sel} onMedida={m => ir({ m }, true)} onElegir={elegir} />;
  else if (prov && t && rejilla) cuerpo = (
    <CuadriculaTarifa t={t} grande onTocar={c => tocar(lineaDe({ t, f: c.f, m: c.m }))}
      cuentaDe={c => cuentaDe(t.id, c.m.ref)} onQuitar={c => quitarUno(t.id, c.m.ref)}
      onInfo={c => { infoAqui.current = true; ir({ i: `${t.id}|${c.m.ref}` }); }} />
  );
  else if (prov && t) cuerpo = <Familias t={t} onFamilia={id => ir({ f: id, m: null })} />;
  else if (prov && !t) cuerpo = fallidas[prov]
    ? <ConnectionError message={fallidas[prov]} onRetry={cargar} />
    : <div className="mo-vacio"><span className="spinner" /> Leyendo la tarifa…</div>;
  else cuerpo = (
    <Portada lista={lista} tarifas={tarifas} recientes={recientes} sel={sel}
      onProveedor={id => ir({ p: id, f: null, m: null })} onElegir={elegir} />
  );

  const titulo = q.trim() ? `Buscando «${q.trim()}»` : f ? f.nombre : t ? t.nombre : 'Tarifas';
  const pendientes = apuntes.filter(a => !a.hecho).length;
  const abiertos = apuntes.filter(a => !a.hecho);
  const totalAbierto = abiertos.reduce((s, a) => s + (conIva(a) ?? 0) * a.cant, 0);

  const panel = verLista
    ? <ListaApuntes apuntes={apuntes} setApuntes={setApuntes} onBorrar={borrarLista} onCerrar={() => setVerLista(false)} horizontal={horizontal}
      onAbrir={a => { const e = buscarArticulo(tarifas, a.prov, a.ref.split('#')[0]); if (e) elegir(e); }} />
    : <PanelPrecio e={elegido} verCoste={verCoste} horizontal={horizontal} onApuntar={apuntar}
      cuenta={elegido ? cuentaDe(elegido.t.id, elegido.m.ref) : 0}
      cuentaPale={elegido ? cuentaDe(elegido.t.id, `${elegido.m.ref}#pale`) : 0}
      onTocar={e => tocar(lineaDe(e))} onTocarEscala={(e, es) => tocar(lineaEscala(e, es))} onQuitar={quitarUno}
      onCerrar={() => ir({ r: null }, true)} />;

  return (
    <div className={`mo${horizontal ? ' mo-h' : ' mo-v'}${(elegido || verLista) && !horizontal ? ' mo-con-hoja' : ''}`}>
      {toast}
      <header className="mo-cab">
        <button type="button" className="mo-cab-btn mo-inicio" onClick={alInicio} aria-label="Inicio de las tarifas">
          <Home size={26} />
        </button>
        <div className="mo-buscar">
          <Search size={26} aria-hidden="true" />
          <input ref={inputRef} type="search" enterKeyHint="search" value={texto} onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); if (resultados[0] && resultados.length === 1) elegir(resultados[0]); } }}
            placeholder="Buscar: tubo 110, codo, 50x50, código…" aria-label="Buscar en las tarifas" autoComplete="off" autoCorrect="off" spellCheck={false} />
          {texto && <button type="button" className="mo-buscar-x" onClick={() => { setTexto(''); ir({ q: null }); inputRef.current?.focus(); }} aria-label="Borrar búsqueda"><X size={26} /></button>}
        </div>
        <button type="button" className={`mo-cab-btn mo-lista-btn${verLista ? ' on' : ''}`} onClick={() => setVerLista(v => !v)} aria-pressed={verLista}>
          <ClipboardList size={26} /><span>Apuntado</span>{pendientes > 0 && <b>{pendientes}</b>}
        </button>
        <button type="button" className={`mo-cab-btn${verCoste ? ' on' : ''}`} onClick={() => setVerCoste(v => !v)} aria-pressed={verCoste}
          aria-label={verCoste ? 'Tapar el coste' : 'Enseñar el coste'} title={verCoste ? 'Tapar el coste' : 'Enseñar el coste'}>
          {verCoste ? <Eye size={26} /> : <EyeOff size={26} />}<span>Coste</span>
        </button>
        {pantalla.puede && (
          <button type="button" className="mo-cab-btn" onClick={pantalla.cambiar} aria-label={pantalla.on ? 'Salir de pantalla completa' : 'Pantalla completa'}>
            {pantalla.on ? <Minimize size={26} /> : <Maximize size={26} />}
          </button>
        )}
        <Link to="/" className="mo-cab-btn mo-salir" aria-label="Salir del mostrador"><LogOut size={24} /></Link>
      </header>

      <div className="mo-cuerpo">
        <main className="mo-izq">
          <div className="mo-titulo">
            {volver && <button type="button" className="mo-volver" onClick={volver} aria-label="Volver"><ChevronLeft size={34} /></button>}
            {f && !q.trim() && <img src={pegatina(claveFamilia(f.nombre))} alt="" className="mo-titulo-peg" />}
            {!f && t && !q.trim() && <img src={pegatina(PEGATINA_PROVEEDOR[t.id] ?? 'prov-hierros')} alt="" className="mo-titulo-peg" />}
            <div className="mo-titulo-txt">
              {migas.length > 1 && <nav className="mo-migas" aria-label="Estás en">{migas.map((m, i) => (
                <span key={i}><button type="button" onClick={m.on}>{m.t}</button>{i < migas.length - 1 && <ChevronRight size={16} />}</span>
              ))}</nav>}
              <h1>{titulo}</h1>
            </div>
            <span className="mo-pruebas">En pruebas</span>
          </div>
          {/* Aviso de las que no se pudieron leer: en la portada y al buscar (dentro de otra tarifa, no molesta) */}
          {error && tarifas.length > 0 && (!prov || q.trim()) && <ConnectionError message={error} onRetry={cargar} />}
          {cuerpo}
          {rejilla && !verLista && (
            <div className="mo-gc-pie" role="status">
              {pendientes ? (
                <>
                  <span className="mo-gc-pie-txt">{abiertos.map(a => `${num(a.cant)} × ${conPor(a.descripcion)}`).join(' · ')}</span>
                  <b>{eurC(totalAbierto)}</b>
                  <button type="button" className="mo-gc-pie-btn" onClick={() => setVerLista(true)}>Ver lista</button>
                </>
              ) : <span className="mo-gc-pie-txt">{t?.id === 'gas' ? 'Toca una bombona para apuntarla · cada toque suma una'
                : t?.familias.some(f => f.grupos.some(g => g.medidas.some(m => m.producto)))
                  ? <>Toca un artículo para apuntarlo · cada toque suma uno · <Info size={17} className="mo-gc-pie-i" /> para qué sirve</>
                  : 'Toca un artículo para apuntarlo · cada toque suma uno'}</span>}
            </div>
          )}
        </main>
        {horizontal ? (!rejilla || verLista) && <aside className="mo-der">{panel}</aside>
          : (elegido || verLista) && <div className="mo-hoja">{panel}</div>}
      </div>
      {infoE && <PanelInfo e={infoE} onCerrar={cerrarInfo} />}
    </div>
  );
}

// ── Portada: proveedores grandes y lo último que se miró ──────────────────
function Portada({ lista, tarifas, recientes, sel, onProveedor, onElegir }: {
  lista: TarifaResumen[] | null; tarifas: Tarifa[]; recientes: Reciente[]; sel: string;
  onProveedor: (id: string) => void; onElegir: (e: Elegido) => void;
}) {
  const ultimos = recientes.map(r => buscarArticulo(tarifas, r.prov, r.ref)).filter((x): x is Elegido => !!x).slice(0, 8);
  return (
    <>
      <div className="mo-provs">
        {(lista ?? []).map(p => (
          <button key={p.id} type="button" className="mo-prov" onClick={() => onProveedor(p.id)}>
            <img src={pegatina(PEGATINA_PROVEEDOR[p.id] ?? 'prov-hierros')} alt="" />
            <strong>{p.nombre}</strong>
            <small>{p.articulos != null ? `${p.articulos} artículos` : p.sub}</small>
          </button>
        ))}
        {!lista && [0, 1, 2].map(i => <div key={i} className="mo-prov skeleton" />)}
      </div>
      {ultimos.length > 0 && (
        <>
          <h2 className="mo-sec"><Clock size={18} /> Lo último que miraste</h2>
          <div className="mo-filas">
            {ultimos.map(e => <FilaArticulo key={e.t.id + e.m.ref} e={e} nombre={e.m.descripcion} sel={sel} onElegir={onElegir} conFamilia />)}
          </div>
        </>
      )}
      {lista && !tarifas.length && <p className="mo-nota"><span className="spinner spinner-sm" /> Preparando la búsqueda…</p>}
    </>
  );
}

// ── Familias de un proveedor ───────────────────────────────────────────────
function Familias({ t, onFamilia }: { t: Tarifa; onFamilia: (id: string) => void }) {
  return (
    <div className="mo-familias">
      {t.familias.map(f => (
        <button key={f.id} type="button" className="mo-familia" onClick={() => onFamilia(f.id)}>
          <img src={pegatina(claveFamilia(f.nombre))} alt="" />
          <strong>{f.nombre}</strong>
          <small>{f.n} {f.n === 1 ? 'artículo' : 'artículos'}</small>
        </button>
      ))}
    </div>
  );
}

// ── Una familia: medidas arriba y piezas en botones o filas grandes ────────
function Familia({ t, f, medida, sel, onMedida, onElegir }: {
  t: Tarifa; f: TarifaFamilia; medida: string | null; sel: string; onMedida: (m: string | null) => void; onElegir: (e: Elegido) => void;
}) {
  const secciones = useMemo(() => seccionesDe(f), [f]);
  const medidas = useMemo(() => medidasDe(secciones), [secciones]);
  const med = medida && medidas.some(x => x.mp === medida) ? medida : null;
  const fila = (m: TarifaMedida, nombre: string) => <FilaArticulo key={m.ref} e={{ t, f, m }} nombre={nombre} sel={sel} onElegir={onElegir} />;
  const bloque = (b: Bloque, i: number) => {
    if ('sueltos' in b) return <div key={i} className="mo-filas">{b.sueltos.map(m => fila(m, m.descripcion))}</div>;
    const repetidas = new Set(b.items.filter((m, j) => b.items.findIndex(x => x.valor === m.valor) !== j).map(m => m.valor));
    return (
      <section key={i} className="mo-grupo">
        <h3>{conPor(b.g.titulo!)}</h3>
        {b.filas
          ? <div className="mo-filas">{b.items.map(m => fila(m, !m.valor || repetidas.has(m.valor) ? m.descripcion : etiquetaMedida(m)))}</div>
          : (
            <div className="mo-botones">
              {b.items.map(m => (
                <button key={m.ref} type="button" className="mo-boton" aria-pressed={sel === `${t.id}|${m.ref}`} onClick={() => onElegir({ t, f, m })}>
                  <span>{conPor(etiquetaMedida(m)) || conPor(m.descripcion)}</span>
                  <strong>{eur(conIva(m))}</strong>
                  {esReciente(m.fecha) && m.evol ? <i className={m.evol > 0 ? 'sube' : 'baja'} aria-label={`Cambió hace poco: ${pct(m.evol)}`} /> : null}
                </button>
              ))}
            </div>
          )}
      </section>
    );
  };
  const filtradas = med ? secciones.map(sc => ({
    t: sc.t, items: sc.bloques.flatMap(b => ('sueltos' in b ? b.sueltos : b.items)).filter(m => (m.ms ?? [m.mp]).includes(med)),
  })).filter(sc => sc.items.length) : [];

  return (
    <>
      {medidas.length > 0 && (
        <div className="mo-medidas" role="group" aria-label="Medida">
          <button type="button" aria-pressed={!med} onClick={() => onMedida(null)}>Todas</button>
          {medidas.map(x => <button key={x.mp} type="button" aria-pressed={med === x.mp} onClick={() => onMedida(med === x.mp ? null : x.mp)}>{conPor(x.mp)}</button>)}
        </div>
      )}
      {med ? filtradas.map(sc => (
        <section key={sc.t ?? '-'} className="mo-sub">
          {sc.t && <h2 className="mo-sub-tit">{sc.t}</h2>}
          <div className="mo-filas">{sc.items.map(m => fila(m, m.descripcion))}</div>
        </section>
      )) : secciones.map((sc, i) => (
        <section key={sc.t ?? i} className="mo-sub">
          {sc.t && <h2 className="mo-sub-tit">{sc.t}</h2>}
          {sc.bloques.map(bloque)}
        </section>
      ))}
    </>
  );
}

/** Fila grande: nombre, código y precio de venta sin IVA. */
function FilaArticulo({ e, nombre, sel, onElegir, conFamilia }: {
  e: Elegido; nombre: string; sel: string; onElegir: (e: Elegido) => void; conFamilia?: boolean;
}) {
  const { t, f, m } = e;
  return (
    <button type="button" className={`mo-fila${conIva(m) == null ? ' mo-sin' : ''}`} aria-pressed={sel === `${t.id}|${m.ref}`} onClick={() => onElegir(e)}>
      {conFamilia && <img src={pegatina(claveFamilia(f.nombre))} alt="" className="mo-fila-peg" />}
      <span className="mo-fila-txt">
        <strong>{conPor(nombre)}</strong>
        <small>
          {m.codigo && <span className="mo-cod">{codigoVisible(m)}</span>}
          {m.escalas?.filter(es => es.total != null).map(es => <span key={es.nombre} className="mo-fila-pale">palé {eur(totalEscala(es, true))}</span>)}
          {conFamilia && <span>{t.nombre} · {f.nombre}</span>}
        </small>
      </span>
      <span className="mo-fila-precio">
        {conIva(m) != null ? <>{esReciente(m.fecha) && m.evol ? <i className={`mo-punto ${m.evol > 0 ? 'sube' : 'baja'}`} /> : null}{eur(conIva(m))}<small>/{m.ud_venta}</small></> : <em>Sin precio</em>}
      </span>
    </button>
  );
}

function Resultados({ res, q, sel, onElegir }: { res: Elegido[]; q: string; sel: string; onElegir: (e: Elegido) => void }) {
  const MAX = 60;
  if (!res.length) return <div className="mo-vacio">No hay nada con «{q}». Prueba con menos palabras o solo la medida (p. ej. 110).</div>;
  return (
    <>
      <p className="mo-nota">{res.length} {res.length === 1 ? 'artículo' : 'artículos'}{res.length > MAX ? ` · se enseñan los ${MAX} primeros, añade una palabra más` : ''}</p>
      <div className="mo-filas">
        {res.slice(0, MAX).map(e => <FilaArticulo key={e.t.id + e.m.ref} e={e} nombre={e.m.descripcion} sel={sel} onElegir={onElegir} conFamilia />)}
      </div>
    </>
  );
}

// ── Panel del precio (derecha en horizontal, hoja de abajo en vertical) ──
// La cantidad se pone tocando la foto: cada toque suma uno a lo apuntado (dos toques, dos; tres, tres) y el número
// sale grande encima. «Quitar uno» corrige un toque de más. Para muchas piezas o decimales (300 ladrillos, 2,5 m),
// «Escribir otra cantidad».
function PanelPrecio({ e, verCoste, horizontal, onApuntar, cuenta, cuentaPale, onTocar, onTocarEscala, onQuitar, onCerrar }: {
  e: Elegido | null; verCoste: boolean; horizontal: boolean; onApuntar: (e: Elegido, cant: number) => void;
  cuenta: number; cuentaPale: number; onTocar: (e: Elegido) => void; onTocarEscala: (e: Elegido, es: Escala) => void;
  onQuitar: (prov: string, ref: string) => void; onCerrar: () => void;
}) {
  const [cant, setCant] = useState(1);
  // Lo que se está escribiendo, tal cual: si se repintaba desde el número, «1,» perdía la coma y 1,5 acababa en 15
  const [cantTxt, setCantTxt] = useState('1');
  const [otra, setOtra] = useState(false);
  const ponCant = (v: number) => { setCant(v); setCantTxt(String(Math.round(v * 1000) / 1000).replace('.', ',')); };
  useEffect(() => { ponCant(1); setOtra(false); }, [e?.m.ref]);
  if (!e) {
    return (
      <div className="mo-panel mo-panel-vacio">
        <span className="mo-panel-vacio-ico"><Search size={44} /></span>
        <strong>Toca un artículo</strong>
        <p>Aquí sale su precio en grande para pasarlo al albarán. Para apuntarlo, toca su foto una vez por cada pieza.</p>
      </div>
    );
  }
  const { t, f, m } = e;
  const pm = porMetro(m, 'iva');
  const iva = conIva(m);
  const mg = margen(m);
  const paso = 1;
  const foto = fotoArticulo(f.nombre, m.descripcion, m.foto);
  const pales = (m.escalas ?? []).filter(es => es.total != null);
  const otrasEscalas = (m.escalas ?? []).filter(es => es.total == null);
  const datos = datosPieza(m, true);
  return (
    <div className="mo-panel">
      {!horizontal && <button type="button" className="mo-hoja-x" onClick={onCerrar} aria-label="Cerrar"><X size={28} /></button>}
      <div className="mo-panel-cab">
        <h2>{conPor(m.descripcion)}</h2>
        <p>{t.nombre} · {f.nombre}</p>
      </div>
      {iva != null ? (
        <button type="button" className={`mo-panel-foto mo-toca${cuenta > 0 ? ' con-cuenta' : ''}`} onClick={() => onTocar(e)}
          aria-label={`Apuntar 1 ${m.ud_venta}${cuenta > 0 ? `. Llevas ${num(cuenta)}` : ''}`}>
          <Foto src={foto} alt="" respaldo={pegatina(claveFamilia(f.nombre))} />
          {cuenta > 0 && <span key={cuenta} className="mo-cuenta" aria-hidden="true">{num(cuenta)}</span>}
          <span className="mo-toca-ayuda" aria-hidden="true"><Hand size={18} />
            {cuenta > 0 ? 'Toca otra vez para sumar uno' : `Toca la foto para apuntar · 1 toque = 1 ${m.ud_venta}`}</span>
        </button>
      ) : (
        <div className="mo-panel-foto"><Foto src={foto} alt={conPor(m.descripcion)} respaldo={pegatina(claveFamilia(f.nombre))} /></div>
      )}
      {cuenta > 0 && iva != null && (
        <div className="mo-llevas" aria-live="polite">
          <span><b>{num(cuenta)} {m.ud_venta}</b> apuntado{cuenta === 1 ? '' : 's'} · {eurC(cuenta * iva)}</span>
          <button type="button" onClick={() => onQuitar(t.id, m.ref)}><Minus size={22} /> Quitar uno</button>
        </div>
      )}
      {m.codigo && (
        <div className="mo-panel-cod"><small>Código</small><span className="mo-cod mo-cod-g">{codigoVisible(m)}</span></div>
      )}
      <div className="mo-precio">
        <small>Precio con IVA</small>
        {iva != null ? <strong>{eur(iva).replace(' €', '')}<span> €/{m.ud_venta}</span></strong> : <strong className="mo-precio-no">Sin precio</strong>}
        <div className="mo-precio-otros">
          {m.pvp != null && <span>Sin IVA <b>{eur(m.pvp)}/{m.ud_venta}</b></span>}
          {pm != null && <span>Sale el metro a <b>{eur(pm)}</b> ({m.metros} m)</span>}
          {otrasEscalas.map(es => <span key={es.nombre}>{es.nombre} <b>{eur(conIva(es))}/{m.ud_venta}</b></span>)}
        </div>
      </div>
      {pales.map(es => (
        <div key={es.nombre} className="mo-escala">
          <button type="button" className="mo-escala-btn" onClick={() => onTocarEscala(e, es)} aria-label={`Apuntar 1 ${es.nombre.toLowerCase()}`}>
            <span className="mo-escala-txt">
              <strong>{es.nombre}</strong>
              <small>Sin IVA {eur(es.total)} · sale a {eur(conIva(es))}/{m.ud_venta}</small>
            </span>
            <span className="mo-escala-precio">{eur(totalEscala(es, true))}</span>
            {cuentaPale > 0 ? <span key={cuentaPale} className="mo-cuenta mo-cuenta-p" aria-hidden="true">{num(cuentaPale)}</span>
              : <span className="mo-escala-mas" aria-hidden="true"><Plus size={26} /></span>}
          </button>
          {cuentaPale > 0 && <button type="button" className="mo-escala-menos" onClick={() => onQuitar(t.id, `${m.ref}#pale`)} aria-label="Quitar un palé"><Minus size={24} /></button>}
        </div>
      ))}
      {datos.length > 0 && (
        <dl className="mo-datos">{datos.map(x => <div key={x.t}><dt>{x.t}</dt><dd>{x.v}</dd></div>)}</dl>
      )}
      {verCoste && !m.solo_pvp && (
        <div className="mo-coste">
          <span>Coste <b>{eur(m.coste)}/{m.ud_venta}</b></span>
          {mg != null && <span>Margen <b>+{num(Math.round(mg))} %</b></span>}
          <span>{m.fecha ? `Precio de ${mesLargo(m.fecha)}` : ''}{m.evol ? <em className={m.evol > 0 ? 'sube' : 'baja'}> {pct(m.evol)}</em> : null}</span>
        </div>
      )}
      {iva != null && (otra ? (
        <div className="mo-apuntar">
          <div className="mo-cant" role="group" aria-label="Cantidad">
            <button type="button" onClick={() => ponCant(Math.max(paso, cant - paso))} aria-label="Uno menos" disabled={cant <= paso}><Minus size={28} /></button>
            <input inputMode="decimal" value={cantTxt} aria-label="Cantidad" autoFocus
              onChange={ev => {
                const t = ev.target.value.replace(/[^\d.,]/g, '').replace('.', ',');
                setCantTxt(t);
                const v = parseFloat(t.replace(',', '.'));
                setCant(!isNaN(v) && v > 0 ? v : 0);
              }}
              onBlur={() => ponCant(cant > 0 ? cant : 1)} />
            <button type="button" onClick={() => ponCant(cant + paso)} aria-label="Uno más"><Plus size={28} /></button>
          </div>
          <button type="button" className="mo-apuntar-btn" onClick={() => { if (cant > 0) { onApuntar(e, cant); setOtra(false); ponCant(1); } }} disabled={!cant}>
            <ClipboardList size={24} /> Apuntar {num(cant)} {m.ud_venta}{cant > 0 && iva != null ? <small>{eurC(cant * iva)}</small> : null}
          </button>
        </div>
      ) : (
        <button type="button" className="mo-otra" onClick={() => setOtra(true)}><Keyboard size={20} /> Escribir otra cantidad (muchas piezas o decimales)</button>
      ))}
      {m.producto && <ParaQueSirve p={m.producto} tableta />}
      <Link className="mo-ficha" to={enlaceFicha(t.id, f.id, m.ref)}>{m.solo_pvp ? 'Ver ficha completa' : 'Ver ficha completa (factura, evolución)'} <ChevronRight size={18} /></Link>
    </div>
  );
}

// ── «Para qué sirve» desde la cuadrícula: cajón a la derecha, encima de todo ──
function PanelInfo({ e, onCerrar }: { e: Elegido; onCerrar: () => void }) {
  const { t, f, m } = e;
  const iva = conIva(m);
  useEffect(() => {
    const tecla = (ev: globalThis.KeyboardEvent) => { if (ev.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);
  const nombre = m.formato && m.descripcion.endsWith(` · ${m.formato}`) ? m.descripcion.slice(0, -(m.formato.length + 3)) : m.descripcion;
  return (
    <div className="mo-cajon" onClick={onCerrar}>
      <div className="mo-cajon-in" role="dialog" aria-modal="true" aria-label={`Para qué sirve · ${m.descripcion}`} onClick={ev => ev.stopPropagation()}>
        <button type="button" className="mo-hoja-x" onClick={onCerrar} aria-label="Cerrar"><X size={28} /></button>
        <div className="mo-cajon-cab">
          <span className="mo-cajon-foto"><Foto src={fotoArticulo(f.nombre, m.descripcion, m.foto)} alt="" respaldo={pegatina(claveFamilia(f.nombre))} /></span>
          <div>
            <h2>{conPor(nombre)}</h2>
            <p>{[m.formato, t.nombre].filter(Boolean).join(' · ')}</p>
            {iva != null && <strong>{eur(iva)}<small> con IVA</small></strong>}
          </div>
        </div>
        {m.producto ? <ParaQueSirve p={m.producto} tableta /> : <p className="mo-nota">No hay datos de este producto.</p>}
      </div>
    </div>
  );
}

// ── Lo apuntado para el cliente de delante ─────────────────────────────────
function ListaApuntes({ apuntes, setApuntes, onBorrar, onCerrar, onAbrir, horizontal }: {
  apuntes: Apunte[]; setApuntes: (f: (a: Apunte[]) => Apunte[]) => void; onBorrar: () => void; onCerrar: () => void;
  onAbrir: (a: Apunte) => void; horizontal: boolean;
}) {
  const total = apuntes.reduce((s, a) => s + (a.pvp ?? 0) * a.cant, 0);
  const totalIva = apuntes.reduce((s, a) => s + (conIva(a) ?? 0) * a.cant, 0);
  const cambia = (i: number, c: Partial<Apunte>) => setApuntes(as => as.map((a, j) => j === i ? { ...a, ...c } : a));
  return (
    <div className="mo-panel mo-apuntes">
      <div className="mo-apuntes-cab">
        <h2>Apuntado</h2>
        <button type="button" className="mo-txt-btn" onClick={onCerrar}>{horizontal ? 'Volver al precio' : <X size={28} />}</button>
      </div>
      {!apuntes.length ? (
        <p className="mo-nota">Aún no hay nada. Elige un artículo y pulsa «Apuntar». Al pasarlo a TreyFACT, toca la casilla para tacharlo.</p>
      ) : (
        <>
          <ul className="mo-apuntes-lista">
            {apuntes.map((a, i) => (
              <li key={i} className={a.hecho ? 'hecho' : ''}>
                <button type="button" className="mo-check" aria-pressed={a.hecho} onClick={() => cambia(i, { hecho: !a.hecho })}
                  aria-label={a.hecho ? 'Marcar como no pasado' : 'Marcar como pasado a TreyFACT'}>{a.hecho && <Check size={24} strokeWidth={3} />}</button>
                <button type="button" className="mo-apunte-txt" onClick={() => onAbrir(a)}>
                  <strong>{num(a.cant)} {a.ud} · {conPor(a.descripcion)}</strong>
                  <small>{a.codigo && <span className="mo-cod">{a.codigo}</span>} {eur(conIva(a))}/{a.ud} con IVA</small>
                </button>
                <span className="mo-apunte-imp">{eurC((conIva(a) ?? 0) * a.cant)}</span>
                <button type="button" className="mo-apunte-x" onClick={() => setApuntes(as => as.filter((_, j) => j !== i))} aria-label="Quitar"><X size={22} /></button>
              </li>
            ))}
          </ul>
          <div className="mo-total">
            <span>Total con IVA <b>{eurC(totalIva)}</b></span>
            <span>Sin IVA <b>{eurC(total)}</b></span>
          </div>
          <button type="button" className="mo-borrar" onClick={onBorrar}><Trash2 size={22} /> Borrar lista (siguiente cliente)</button>
        </>
      )}
    </div>
  );
}
