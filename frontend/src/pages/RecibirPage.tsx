import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowUp, ArrowDown, Sparkles, Check, ScanBarcode, Tag, Pencil, FileText, RotateCw,
  Trash2, ChevronDown, AlertTriangle, X, Printer, History, MoreHorizontal, Plus,
} from 'lucide-react';
import {
  getDocument, getRecepcion, updateArticle, deleteArticle, createArticle, recalculateArticles, updateDocument, marcarTerminado, reprocessDocument, deleteDocument,
  getProveedoresConocidos, etiquetasBaldaUrl, etiquetasPruebaUrl, getAjusteEtiquetas, putAjusteEtiquetas,
  downloadExcel, downloadPriceList, describeApiError,
} from '../api/client';
import type { Article, Document, EstadoCompra, LineaRecepcion, Recepcion } from '../types';
import { useCfToast } from '../components/CfToast';
import { ConfirmModal } from '../components/ConfirmModal';
import { DocumentPreview } from '../components/DocumentPreview';
import { DriveEstado } from '../components/DriveEstado';
import { LeyendoAlbaran } from '../components/LeyendoAlbaran';
import { EscanerCodigo } from '../components/EscanerCodigo';
import { esEncargado } from '../auth';
import { euros, fechaES, numES, plural } from '../lib/texto';
import { eanValido, guardarSiguientePegatina, leerPrecio, siguientePegatina } from '../lib/comprasNueva';
import './recibir.css';

type Filtro = 'todos' | 'nuevo' | 'sube' | 'baja' | 'igual';

const ESTADO: Record<EstadoCompra, { txt: string; icono: JSX.Element | null }> = {
  nuevo: { txt: 'Nuevo', icono: <Sparkles size={14} /> },
  sube: { txt: 'Sube', icono: <ArrowUp size={14} strokeWidth={3} /> },
  baja: { txt: 'Baja', icono: <ArrowDown size={14} strokeWidth={3} /> },
  igual: { txt: 'Igual', icono: <Check size={14} strokeWidth={3} /> },
  sin_coste: { txt: 'Sin precio', icono: <AlertTriangle size={14} /> },
};
const pctES = (p: number | null) => (p == null ? '' : `${numES(Math.abs(p), 0, 1)} %`);
const cant = (n: number) => numES(n, 0, 2);

/** ¿La pantalla mide al menos `px` de ancho? (cambia al girar o al estrechar la ventana) */
function useAncho(px: number): boolean {
  const consulta = `(min-width: ${px}px)`;
  const [vale, setVale] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const cambia = () => setVale(m.matches);
    cambia();
    m.addEventListener('change', cambia);
    return () => m.removeEventListener('change', cambia);
  }, [consulta]);
  return vale;
}

/** Albarán de compra visto como «Recibir mercancía»: qué ha cambiado, a qué precio se vende y qué etiquetar. */
export function RecibirPage() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const navigate = useNavigate();
  const { toast, show } = useCfToast();

  const [doc, setDoc] = useState<Document | null>(null);
  const [rec, setRec] = useState<Recepcion | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [historial, setHistorial] = useState<Set<number>>(new Set());
  const [etiquetar, setEtiquetar] = useState<Set<number>>(new Set());
  const [pvp, setPvp] = useState<{ id: number; valor: string } | null>(null);
  const [guardando, setGuardando] = useState<number | null>(null);
  const [escId, setEscId] = useState<number | null>(null);
  const [avisoEsc, setAvisoEsc] = useState<{ texto: string; mal?: boolean; accion?: { texto: string; alPulsar: () => void } } | null>(null);
  const recienGuardado = useRef<{ codigo: string; en: string } | null>(null);
  const [verOriginal, setVerOriginal] = useState(false);
  const [hoja, setHoja] = useState<'etiquetas' | 'datos' | 'mas' | null>(null);
  const originalRef = useRef<HTMLDivElement>(null);
  const [corregir, setCorregir] = useState<number | 'nueva' | null>(null);
  const pc = useAncho(1000);   // en el ordenador, lista en columnas; en el móvil, fichas
  const [borrar, setBorrar] = useState(false);
  const etiquetasPuestas = useRef(false);

  const articulos: Article[] = useMemo(
    () => [...(doc?.articles || [])].sort((a, b) => (a.line_number - b.line_number) || (a.id - b.id)), [doc]);
  const linea = useMemo(() => new Map((rec?.lineas || []).map(l => [l.id, l])), [rec]);

  const cargar = useCallback(async (): Promise<string> => {
    try {
      const { data } = await getDocument(docId);
      setDoc(data);
      setFallo(null);
      if (data.status === 'completed') {
        const r = await getRecepcion(docId);
        setRec(r.data);
        if (!etiquetasPuestas.current) { etiquetasPuestas.current = true; setEtiquetar(new Set(r.data.etiquetar)); }
      }
      return data.status;
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 404) { setNoExiste(true); return 'error'; }
      setFallo(describeApiError(e));
      return 'processing';
    }
  }, [docId]);

  useEffect(() => {
    etiquetasPuestas.current = false;
    setDoc(null); setRec(null); setNoExiste(false);
    cargar();
  }, [cargar]);

  // Mientras el albarán se esté leyendo (o en cola), la pantalla lo vuelve a mirar cada 3 s. Va por el estado que se
  // ve, no solo al entrar: tras «Volver a leer» se quedaba en «Leyendo el albarán…» para siempre aunque el servidor
  // ya hubiera terminado, y había que salir y volver a entrar (Andrés, 18/11/2026).
  const enLectura = doc?.status === 'uploaded' || doc?.status === 'processing';
  useEffect(() => {
    if (!enLectura) return;
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout>;
    const ciclo = async () => { await cargar(); if (vivo) reloj = setTimeout(ciclo, 2000); };
    reloj = setTimeout(ciclo, 2000);
    return () => { vivo = false; clearTimeout(reloj); };
  }, [enLectura, cargar]);

  /** Guarda un cambio de un artículo y vuelve a mirar qué cambia respecto a la compra anterior. */
  const guardar = async (art: Article, cambio: Partial<Article>, hecho?: string, deshacer?: Partial<Article>) => {
    setGuardando(art.id);
    try {
      await updateArticle(art.id, cambio);
      const { data } = await getRecepcion(docId);
      const d = await getDocument(docId);
      setDoc(d.data); setRec(data);
      // la etiqueta hace falta si es nuevo o si el precio ya no es el que había en la balda
      const l = data.lineas.find(x => x.id === art.id);
      if (l && ('pvp_fijo' in cambio || 'precio_unitario_bruto' in cambio || 'descuento_1' in cambio)) {
        setEtiquetar(prev => { const s = new Set(prev); if (l.estado === 'nuevo' || l.pvp_cambia) s.add(art.id); else s.delete(art.id); return s; });
      }
      if (hecho) show(hecho, deshacer ? { undo: () => { guardar(art, deshacer); } } : {});
      return true;
    } catch (e) {
      show(describeApiError(e), { error: true });
      return false;
    } finally {
      setGuardando(null);
    }
  };

  const ponerPvp = async (art: Article, raw: string) => {
    const v = leerPrecio(raw);
    if (v == null || v <= 0) { show('Escribe el precio de venta con IVA, por ejemplo 4,30', { error: true }); return; }
    const sinIva = v / (1 + (art.iva_pct ?? 21) / 100);
    if (art.coste_neto_unitario > 0 && sinIva < art.coste_neto_unitario) {
      show(`Ese precio queda por debajo del coste (${euros(art.coste_neto_unitario)} sin IVA)`, { error: true });
      return;
    }
    const antes = art.pvp_fijo ?? null;
    if (await guardar(art, { pvp_fijo: Math.round(v * 100) / 100 }, `Precio de venta: ${euros(v)}`, { pvp_fijo: antes })) setPvp(null);
  };

  // ── Escáner: va pasando por los artículos que no tienen código de barras ──
  const sinCodigo = useMemo(() => articulos.filter(a => !eanValido(a.ean)), [articulos]);
  const siguienteSinCodigo = (desde: number): number | null => {
    const i = articulos.findIndex(a => a.id === desde);
    const resto = [...articulos.slice(i + 1), ...articulos.slice(0, Math.max(i, 0))];
    return resto.find(a => !eanValido(a.ean) && a.id !== desde)?.id ?? null;
  };
  const corto = (t: string) => (t.length > 38 ? `${t.slice(0, 36).trimEnd()}…` : t);
  /** Pone el código al artículo que toca y pasa al siguiente sin código. */
  const ponerCodigo = async (art: Article, limpio: string) => {
    if (!(await guardar(art, { ean: limpio }))) return;
    recienGuardado.current = { codigo: limpio, en: art.descripcion };
    const sig = siguienteSinCodigo(art.id);
    if (sig == null) { setEscId(null); setAvisoEsc(null); show('Todos los artículos tienen ya su código de barras'); return; }
    setAvisoEsc({ texto: `Guardado en «${corto(art.descripcion)}». Ahora toca el siguiente: su nombre está arriba.` });
    setEscId(sig);
  };
  const codigoLeido = async (codigo: string) => {
    const art = articulos.find(a => a.id === escId);
    if (!art) return;
    const limpio = codigo.replace(/\s/g, '');
    if (!eanValido(limpio)) {
      setAvisoEsc({ texto: `«${limpio.slice(0, 22)}» no es el código de barras del producto. Prueba con el otro código del envase.`, mal: true });
      return;
    }
    const otro = articulos.find(a => a.id !== art.id && (a.ean || '').replace(/\D/g, '') === limpio);
    if (otro) {
      // Sigue delante el producto que se acaba de guardar: no es un fallo, falta apuntar al siguiente
      const elDeAntes = recienGuardado.current?.codigo === limpio;
      setAvisoEsc({
        texto: elDeAntes
          ? `Ese es el que acabas de guardar («${corto(otro.descripcion)}»). Ahora toca el producto que pone arriba.`
          : `Ese código ya está puesto en otra línea de este albarán: «${corto(otro.descripcion)}».`,
        mal: !elDeAntes,
        accion: { texto: 'Es el mismo producto: ponérselo también', alPulsar: () => { ponerCodigo(art, limpio); } },
      });
      return;
    }
    await ponerCodigo(art, limpio);
  };

  if (noExiste) return (
    <div className="page"><div className="empty-state" style={{ paddingTop: 80 }}>
      <div className="empty-state-text">Este albarán ya no existe (puede que lo hayan borrado).</div>
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/albaranes')}><ArrowLeft size={17} /> Volver a albaranes de compra</button>
    </div></div>
  );
  if (!doc) return (
    <div className="page"><div className="empty-state" style={{ paddingTop: 80 }}>
      <span className="spinner spinner-lg" style={{ marginBottom: 16 }} />
      <div className="empty-state-text">{fallo || 'Cargando albarán…'}</div>
    </div></div>
  );

  const leyendo = doc.status === 'uploaded' || doc.status === 'processing';
  const r = rec?.resumen;
  const visibles = articulos.filter(a => filtro === 'todos' || linea.get(a.id)?.estado === filtro);
  const paraEtiqueta = articulos.filter(a => etiquetar.has(a.id));
  // Cuadre en vivo: al corregir una línea mal leída, el aviso se va solo cuando ya suma lo del albarán
  const sumaLeida = Math.round(articulos.reduce((t, a) => t + (a.coste_neto_total || 0), 0) * 100) / 100;
  const base = doc.base_imponible_doc ?? null;
  const descuadre = base != null && base > 0 ? Math.round((sumaLeida - base) * 100) / 100 : null;
  const noCuadra = doc.validacion_ok === false && descuadre != null && Math.abs(descuadre) > Math.max(0.5, (base as number) * 0.005);
  const escArt = articulos.find(a => a.id === escId);

  const chip = (f: Filtro, n: number, txt: string) => (
    <button key={f} className={`rc-chip ${f}${filtro === f ? ' on' : ''}`} aria-pressed={filtro === f} disabled={n === 0 && f !== 'todos'} onClick={() => setFiltro(filtro === f ? 'todos' : f)}>
      <b>{n}</b><span>{txt}</span>
    </button>
  );

  const acciones = (
    <>
            <button className="btn btn-ghost" disabled={sinCodigo.length === 0} onClick={() => { recienGuardado.current = null; setAvisoEsc(null); setEscId(sinCodigo[0].id); }}>
              <ScanBarcode size={19} /> {sinCodigo.length ? <><span className="rc-largo">Leer códigos</span><span className="rc-corto">Códigos</span> <span className="rc-n">{sinCodigo.length}</span></> : 'Códigos al día'}
            </button>
            <button className="btn btn-primary" disabled={paraEtiqueta.length === 0} onClick={() => setHoja('etiquetas')}>
              <Printer size={19} /> Etiquetas <span className="rc-n">{paraEtiqueta.length}</span>
            </button>
            <button className="btn btn-ghost rc-mas-btn" onClick={() => setHoja('mas')} aria-label="Más opciones"><MoreHorizontal size={20} /><span className="rc-mas-txt">Más</span></button>
    </>
  );
  const marcaEtiqueta = (a: Article) => (
    <input type="checkbox" checked={etiquetar.has(a.id)} aria-label={`Etiqueta de ${a.descripcion}`}
      onChange={ev => setEtiquetar(s => { const n = new Set(s); if (ev.target.checked) n.add(a.id); else n.delete(a.id); return n; })} />
  );
  /** Ordenador: una línea por artículo, en columnas (Andrés, 17/11/2026: con fichas solo cabían 4 o 5 en pantalla). */
  const filaPc = (a: Article) => {
    const l = linea.get(a.id);
    if (!l) return null;
    const e = ESTADO[l.estado];
    const tieneCodigo = eanValido(a.ean);
    const ref = a.codigo_proveedor || a.codigo_fabricante;
    return [
      <tr key={a.id} className={`rc-tr ${l.estado}`}>
        <td><span className={`rc-estado ${l.estado}`}>{e.icono}{e.txt}{(l.estado === 'sube' || l.estado === 'baja') && ` ${pctES(l.pct)}`}</span></td>
        <td className="rc-td-art">
          <b title={a.descripcion}>{a.descripcion}</b>
          <small>
            {l.compras > 0 && <><button className="rc-enlace" aria-expanded={historial.has(a.id)} onClick={() => setHistorial(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>{plural(l.compras, 'compra anterior', 'compras anteriores')}</button> · </>}
            {ref ? `Ref. ${ref}` : 'Sin referencia'}
          </small>
        </td>
        <td className="rc-td-num">{cant(a.cantidad)}</td>
        <td>
          <button className="rc-celda-btn" onClick={() => setCorregir(a.id)} title="Corregir lo que se leyó del albarán">{euros(a.coste_neto_unitario)} <Pencil size={13} /></button>
          <small>{l.coste_anterior != null
            ? (l.estado === 'igual' ? 'igual que antes' : <span title={`El ${fechaES(l.fecha_anterior)}`}>antes <s>{euros(l.coste_anterior)}</s></span>)
            : l.estado === 'nuevo' ? 'primera compra' : 'sin precio'}</small>
        </td>
        <td>
          {pvp?.id === a.id ? (
            <form className="rc-pvp-form" onSubmit={ev => { ev.preventDefault(); ponerPvp(a, pvp.valor); }}>
              <input autoFocus inputMode="decimal" value={pvp.valor} onChange={ev => setPvp({ id: a.id, valor: ev.target.value })} onFocus={ev => ev.target.select()} onKeyDown={ev => { if (ev.key === 'Escape') setPvp(null); }} aria-label="Precio de venta con IVA" />
              <button className="btn btn-primary btn-sm" type="submit" disabled={guardando === a.id}>Guardar</button>
            </form>
          ) : (
            <button className="rc-celda-btn pvp" onClick={() => setPvp({ id: a.id, valor: numES(a.pvp_con_iva) })} title="Cambiar el precio de venta">{euros(a.pvp_con_iva)} <Pencil size={13} /></button>
          )}
          <small>
            {l.pvp_cambia && l.pvp_anterior != null
              ? <>antes {euros(l.pvp_anterior)} · <button className="rc-enlace" disabled={guardando === a.id} onClick={() => guardar(a, { pvp_fijo: l.pvp_anterior }, `Se mantiene a ${euros(l.pvp_anterior)}`, { pvp_fijo: a.pvp_fijo ?? null })}>mantenerlo</button></>
              : a.pvp_fijo
                ? <>a mano ({numES(a.margen_pct, 0, 0)}&nbsp;%) · <button className="rc-enlace" onClick={() => guardar(a, { pvp_fijo: null }, 'Precio calculado otra vez', { pvp_fijo: a.pvp_fijo })}>calcularlo</button></>
                : <>margen {numES(a.margen_pct, 0, 1)}&nbsp;%</>}
          </small>
        </td>
        <td className="rc-td-cod">
          {tieneCodigo
            ? <span className="rc-codigo">{a.ean}</span>
            : <button className="btn btn-ghost btn-sm" onClick={() => { recienGuardado.current = null; setAvisoEsc(null); setEscId(a.id); }}><ScanBarcode size={15} /> Leer</button>}
        </td>
        <td className="rc-td-etq">{marcaEtiqueta(a)}</td>
      </tr>,
      historial.has(a.id) && <tr key={`${a.id}-h`} className="rc-tr-hist"><td /><td colSpan={6}><Historial l={l} /></td></tr>,
    ];
  };

  return (
    <div className="page rc">
      {toast}

      <button className="rc-volver" onClick={() => navigate('/albaranes')}><ArrowLeft size={16} /> Albaranes de compra</button>

      <header className="rc-cab">
        <div className="rc-cab-txt">
          <h1>{doc.supplier_name || 'Proveedor sin poner'}</h1>
          <p>
            {[doc.doc_number && `Nº ${doc.doc_number}`, fechaES(doc.doc_date || doc.created_at), !leyendo && plural(articulos.length, 'artículo')].filter(Boolean).join(' · ')}
            {doc.terminado_at && <span className="rc-hecho"><Check size={13} strokeWidth={3} /> Terminado</span>}
          </p>
        </div>
        {pc && doc.status === 'completed' && r
          ? <div className="rc-cab-acc"><button className="btn btn-ghost" onClick={() => setHoja('datos')}><Pencil size={16} /> Cambiar</button>{acciones}</div>
          : <button className="btn btn-ghost btn-sm" onClick={() => setHoja('datos')}><Pencil size={15} /> Cambiar</button>}
      </header>

      {leyendo && (
        <LeyendoAlbaran key={doc.id} estado={doc.status} paso={doc.lectura_paso} media={doc.lectura_media_s} lleva={doc.lectura_lleva_s} />
      )}
      {doc.status === 'error' && (
        <div className="rc-aviso mal"><AlertTriangle size={20} /><div><b>No se pudo leer este albarán</b><span>{doc.error_message || 'Vuelve a intentarlo.'}</span></div>
          <button className="btn btn-primary btn-sm" onClick={async () => { await reprocessDocument(docId); cargar(); }}><RotateCw size={15} /> Volver a leer</button></div>
      )}
      {doc.status !== 'processing' && doc.status !== 'uploaded' && <DriveEstado doc={doc} />}
      {doc.status === 'completed' && !doc.supplier_name && (
        <div className="rc-aviso"><AlertTriangle size={20} /><div><b>No se ve de qué proveedor es</b><span>Ponlo tú: así la próxima vez se comparan los precios con sus compras anteriores.</span></div>
          <button className="btn btn-primary btn-sm" onClick={() => setHoja('datos')}>Poner proveedor</button></div>
      )}
      {doc.status === 'completed' && noCuadra && descuadre != null && (
        <div className="rc-aviso"><AlertTriangle size={20} /><div><b>Las cuentas no cuadran: repásalo con el papel</b>
          <span>Lo leído suma {euros(sumaLeida)} y el albarán dice {euros(base)} ({descuadre > 0 ? 'sobran' : 'faltan'} {euros(Math.abs(descuadre))}). Mira si falta una línea o si alguna cantidad o precio está mal: se corrige tocando el lápiz del coste.</span></div>
          <button className="btn btn-ghost btn-sm" onClick={() => setVerOriginal(true)}><FileText size={15} /> Ver el original</button></div>
      )}

      {doc.status === 'completed' && r && (
        <>
          <div className="rc-chips" role="group" aria-label="Qué artículos ver">
            {chip('todos', r.total, r.total === 1 ? 'artículo' : 'artículos')}
            {chip('nuevo', r.nuevo, r.nuevo === 1 ? 'nuevo' : 'nuevos')}
            {chip('sube', r.sube, r.sube === 1 ? 'sube' : 'suben')}
            {chip('baja', r.baja, r.baja === 1 ? 'baja' : 'bajan')}
            {chip('igual', r.igual, 'igual')}
          </div>

          {pc ? (
            <div className="rc-tabla-caja">
              <table className="rc-tabla">
                <thead><tr><th>Precio</th><th>Artículo</th><th className="rc-td-num">Cant.</th><th>Coste</th><th>Precio de venta</th><th>Código de barras</th><th className="rc-td-etq" title="Sacar etiqueta de balda"><Tag size={15} aria-label="Etiqueta" /></th></tr></thead>
                <tbody>{visibles.map(filaPc)}</tbody>
              </table>
              {visibles.length === 0 && <p className="rc-vacio">No hay artículos {filtro === 'todos' ? 'en este albarán' : 'de ese tipo'}.</p>}
            </div>
          ) : (
          <div className="rc-lista">
            {visibles.map(a => {
              const l = linea.get(a.id);
              if (!l) return null;
              const tranquilo = l.estado === 'igual' && !l.pvp_cambia;
              const plegado = tranquilo && !abiertos.has(a.id) && filtro === 'todos';
              const e = ESTADO[l.estado];
              const tieneCodigo = eanValido(a.ean);
              const pill = <span className={`rc-estado ${l.estado}`}>{e.icono}{e.txt}{(l.estado === 'sube' || l.estado === 'baja') && ` ${pctES(l.pct)}`}</span>;
              if (plegado) return (
                <button key={a.id} className="rc-art plegado" onClick={() => setAbiertos(s => new Set(s).add(a.id))} aria-expanded="false">
                  {pill}
                  <span className="rc-pl-desc">{a.descripcion}</span>
                  <span className="rc-pl-pvp">{euros(a.pvp_con_iva)}</span>
                  {!tieneCodigo && <ScanBarcode size={16} className="rc-pl-falta" aria-label="Sin código de barras" />}
                  <ChevronDown size={18} className="rc-pl-flecha" />
                </button>
              );
              return (
                <article key={a.id} className={`rc-art ${l.estado}`}>
                  <div className="rc-art-cab">
                    {pill}
                    <span className="rc-cant">{cant(a.cantidad)} ud</span>
                    <label className="rc-etq"><input type="checkbox" checked={etiquetar.has(a.id)} onChange={ev => setEtiquetar(s => { const n = new Set(s); if (ev.target.checked) n.add(a.id); else n.delete(a.id); return n; })} /> <Tag size={14} /> Etiqueta</label>
                  </div>
                  <h3>{a.descripcion}</h3>

                  <div className="rc-precios">
                    <div className="rc-dato">
                      <span>Coste</span>
                      <button className="rc-coste" onClick={() => setCorregir(a.id)} title="Corregir lo que se leyó del albarán">
                        {euros(a.coste_neto_unitario)} <Pencil size={14} />
                      </button>
                      <small>{l.coste_anterior != null
                        ? <>{l.estado === 'igual' ? 'igual que' : 'antes'} {l.estado !== 'igual' && <s>{euros(l.coste_anterior)}</s>} el {fechaES(l.fecha_anterior)}{l.proveedor_anterior ? ` · ${l.proveedor_anterior}` : ''}</>
                        : l.estado === 'nuevo' ? 'primera vez que se compra' : 'sin precio en el albarán'}</small>
                    </div>
                    <div className="rc-dato">
                      <span>Precio de venta</span>
                      {pvp?.id === a.id ? (
                        <form className="rc-pvp-form" onSubmit={ev => { ev.preventDefault(); ponerPvp(a, pvp.valor); }}>
                          <input autoFocus inputMode="decimal" value={pvp.valor} onChange={ev => setPvp({ id: a.id, valor: ev.target.value })} onFocus={ev => ev.target.select()} aria-label="Precio de venta con IVA" />
                          <span>€</span>
                          <button className="btn btn-primary btn-sm" type="submit" disabled={guardando === a.id}>Guardar</button>
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPvp(null)} aria-label="Cancelar"><X size={16} /></button>
                        </form>
                      ) : (
                        <button className="rc-pvp" onClick={() => setPvp({ id: a.id, valor: numES(a.pvp_con_iva) })} title="Cambiar el precio de venta">
                          {euros(a.pvp_con_iva)} <Pencil size={15} />
                        </button>
                      )}
                      <small>IVA incluido · margen {numES(a.margen_pct, 0, 1)}&nbsp;%{a.pvp_fijo ? <> · puesto a mano · <button className="rc-enlace" onClick={() => guardar(a, { pvp_fijo: null }, 'Precio calculado otra vez', { pvp_fijo: a.pvp_fijo })}>volver al calculado</button></> : ''}</small>
                    </div>
                  </div>

                  {l.pvp_cambia && l.pvp_anterior != null && (
                    <div className="rc-tienda">
                      <span>La última vez se vendía a <b>{euros(l.pvp_anterior)}</b></span>
                      <button className="btn btn-ghost btn-sm" disabled={guardando === a.id} onClick={() => guardar(a, { pvp_fijo: l.pvp_anterior }, `Se mantiene a ${euros(l.pvp_anterior)}`, { pvp_fijo: a.pvp_fijo ?? null })}>
                        Mantener {euros(l.pvp_anterior)}
                      </button>
                    </div>
                  )}

                  <div className="rc-pie">
                    {tieneCodigo
                      ? <span className="rc-codigo"><ScanBarcode size={16} /> {a.ean}</span>
                      : <button className="btn btn-ghost btn-sm" onClick={() => { recienGuardado.current = null; setAvisoEsc(null); setEscId(a.id); }}><ScanBarcode size={16} /> Leer código de barras</button>}
                    {(a.codigo_proveedor || a.codigo_fabricante) && <span className="rc-ref">Ref. {a.codigo_proveedor || a.codigo_fabricante}</span>}
                    {l.compras > 0 && (
                      <button className="rc-enlace rc-hist-btn" aria-expanded={historial.has(a.id)} onClick={() => setHistorial(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>
                        <History size={14} /> {plural(l.compras, 'compra anterior', 'compras anteriores')}
                      </button>
                    )}
                    {tranquilo && filtro === 'todos' && <button className="rc-enlace" onClick={() => setAbiertos(s => { const n = new Set(s); n.delete(a.id); return n; })}>Plegar</button>}
                  </div>
                  {historial.has(a.id) && <Historial l={l} />}
                </article>
              );
            })}
            {visibles.length === 0 && <p className="rc-vacio">No hay artículos {filtro === 'todos' ? 'en este albarán' : 'de ese tipo'}.</p>}
          </div>
          )}

          <button className="rc-anadir" onClick={() => setCorregir('nueva')}><Plus size={17} /> Añadir una línea que falta</button>

          <div className="rc-fin">
            {doc.terminado_at
              ? <button className="btn btn-ghost" onClick={async () => { await marcarTerminado(docId, false); cargar(); }}>Volver a dejarlo por terminar</button>
              : <button className="btn btn-ghost btn-lg" onClick={async () => { await marcarTerminado(docId, true); await cargar(); show('Albarán terminado', { undo: async () => { await marcarTerminado(docId, false); cargar(); } }); }}><Check size={19} /> Ya está colocado: terminar</button>}
          </div>

          {verOriginal && (
            <div className="card rc-original" ref={originalRef}>
              <div className="card-header"><span>Albarán original</span><button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setVerOriginal(false)}>Ocultar</button></div>
              <DocumentPreview document={doc} />
            </div>
          )}

          {!pc && <div className="rc-barra">{acciones}</div>}
        </>
      )}

      {escArt && (
        <EscanerCodigo
          titulo={escArt.descripcion}
          sub={`${sinCodigo.length} sin código · ${euros(escArt.pvp_con_iva)}`}
          aviso={avisoEsc}
          onCodigo={codigoLeido}
          onSaltar={sinCodigo.length > 1 ? () => { const s = siguienteSinCodigo(escArt.id); if (s != null) { setAvisoEsc(null); setEscId(s); } } : undefined}
          onCerrar={() => { setEscId(null); setAvisoEsc(null); }}
        />
      )}
      {corregir != null && (corregir === 'nueva' || articulos.some(a => a.id === corregir)) && (
        <HojaLinea
          art={corregir === 'nueva' ? null : articulos.find(a => a.id === corregir) as Article}
          prontoPago={doc.pronto_pago_pct || 0}
          onCerrar={() => setCorregir(null)}
          onGuardar={async cambio => {
            if (corregir === 'nueva') {
              try {
                const { data } = await createArticle({ ...cambio, document_id: docId, line_number: Math.max(0, ...articulos.map(a => a.line_number || 0)) + 1 });
                setCorregir(null); setEtiquetar(s => new Set(s).add(data.id)); await cargar(); show('Línea añadida');
              } catch (e) { show(describeApiError(e), { error: true }); }
              return;
            }
            const a = articulos.find(x => x.id === corregir) as Article;
            if (await guardar(a, cambio, 'Línea corregida')) setCorregir(null);
          }}
          onQuitar={async () => {
            if (corregir === 'nueva') return;
            try { await deleteArticle(corregir as number); setCorregir(null); await cargar(); show('Línea quitada del albarán'); } catch (e) { show(describeApiError(e), { error: true }); }
          }}
        />
      )}
      {hoja === 'etiquetas' && <HojaEtiquetas articulos={paraEtiqueta} onCerrar={() => setHoja(null)} />}
      {hoja === 'mas' && (
        <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget) setHoja(null); }}>
          <div className="upload-sheet rc-hoja" role="dialog" aria-modal="true" aria-label="Más opciones">
            <div className="upload-sheet-handle" />
            <div className="rc-hoja-cab"><h3>Más opciones</h3><button className="modal-close" onClick={() => setHoja(null)} aria-label="Cerrar"><X size={20} /></button></div>
            <div className="rc-mas-lista">
              <button onClick={() => { setHoja(null); setVerOriginal(true); setTimeout(() => originalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); }}><FileText size={17} /> Ver el albarán original</button>
              <button onClick={async () => { setHoja(null); await reprocessDocument(docId); setRec(null); etiquetasPuestas.current = false; cargar(); show('Leyéndolo otra vez…'); }}><RotateCw size={17} /> Volver a leer el albarán</button>
              <button onClick={() => { setHoja(null); downloadExcel(docId); }}>Excel</button>
              <button onClick={() => { setHoja(null); downloadPriceList(docId); }}>Listín de precios</button>
              <button className="peligro" onClick={() => { setHoja(null); setBorrar(true); }}><Trash2 size={17} /> Borrar este albarán</button>
            </div>
            {doc.leido_con && <p className="rc-hoja-nota">Leído con {nombreIA(doc.leido_con)}{doc.leido_segundos ? ` en ${Math.round(doc.leido_segundos)} s` : ''}.{doc.leido_nota && ` La IA nueva no pudo (${doc.leido_nota}) y lo leyó la de antes.`}</p>}
          </div>
        </div>
      )}
      {hoja === 'datos' && <HojaDatos doc={doc} onCerrar={() => setHoja(null)} onGuardado={async () => { setHoja(null); await cargar(); show('Datos del albarán guardados'); }} />}
      {borrar && (
        <ConfirmModal
          title="¿Borrar este albarán?" danger confirmLabel="Borrar" cancelLabel="No, dejarlo"
          message="Se quitan el albarán y sus artículos de la app. La copia guardada en Drive no se toca."
          onCancel={() => setBorrar(false)}
          onConfirm={async () => { await deleteDocument(docId); navigate('/albaranes'); }}
        />
      )}
    </div>
  );
}

function Historial({ l }: { l: LineaRecepcion }) {
  return (
    <table className="rc-hist">
      <thead><tr><th>Fecha</th><th className="rc-hist-col">Proveedor</th><th>Coste</th><th>Se vendía a</th><th>Cant.</th></tr></thead>
      <tbody>
        {l.historial.map((h, i) => {
          const quien = <span className={h.otro_proveedor ? 'rc-hist-otro' : undefined}>{h.proveedor || 'Proveedor sin poner'}{h.otro_proveedor && ' · otro proveedor'}</span>;
          return [
            <tr key={i}><td>{fechaES(h.fecha)}</td><td className="rc-hist-col">{quien}</td><td>{euros(h.coste)}</td><td>{euros(h.pvp)}</td><td>{cant(h.cantidad)}</td></tr>,
            <tr key={`${i}-p`} className="rc-hist-fila"><td colSpan={4}>{quien}</td></tr>,
          ];
        })}
      </tbody>
    </table>
  );
}

/** «claude-sonnet-5-5» → «Claude Sonnet 5.5» */
const nombreIA = (id: string) => {
  const [marca, familia, ...version] = id.split('-');
  const may = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return [may(marca || ''), may(familia || ''), version.filter(v => /^\d{1,2}$/.test(v)).join('.')].filter(Boolean).join(' ');
};

/** «30+10» → [30, 10]; «25» → [25]; vacío → []. null si no se entiende. */
const leerDescuentos = (raw: string): number[] | null => {
  const partes = raw.replace(/%/g, '').split('+').map(t => t.trim()).filter(Boolean);
  const nums = partes.map(t => leerPrecio(t));
  if (nums.some(n => n == null || n < 0 || n > 100) || nums.length > 4) return null;
  return nums as number[];
};

/** Corregir una línea que se leyó mal: los mismos datos que trae el papel (cantidad, precio, descuento). */
function HojaLinea({ art, prontoPago, onCerrar, onGuardar, onQuitar }: {
  art: Article | null; prontoPago: number; onCerrar: () => void; onGuardar: (c: Partial<Article>) => void; onQuitar: () => void;
}) {
  const [nombre, setNombre] = useState(art?.descripcion ?? '');
  const [cantidad, setCantidad] = useState(art ? numES(art.cantidad, 0, 3) : '1');
  const [precio, setPrecio] = useState(art ? numES(art.precio_unitario_bruto, 2, 4) : '');
  const [dto, setDto] = useState(art ? [art.descuento_1, art.descuento_2, art.descuento_3, art.descuento_4].filter(d => d != null && d > 0).map(d => numES(d as number, 0, 2)).join('+') : '');
  const [iva, setIva] = useState(art?.iva_pct ?? 21);
  const [quitar, setQuitar] = useState(false);
  const q = leerPrecio(cantidad), pr = leerPrecio(precio), ds = leerDescuentos(dto);
  const vale = !!nombre.trim() && q != null && q > 0 && pr != null && pr >= 0 && ds != null;
  const neto = vale ? (ds as number[]).reduce((v, d) => v * (1 - d / 100), pr as number) : null;
  const coste = neto != null ? neto * (1 - prontoPago / 100) : null;

  const guardar = () => {
    if (!vale) return;
    const d = ds as number[];
    onGuardar({
      descripcion: nombre.trim(), cantidad: q as number, precio_unitario_bruto: pr as number,
      descuento_1: d[0] ?? null, descuento_2: d[1] ?? null, descuento_3: d[2] ?? null, descuento_4: d[3] ?? null, iva_pct: iva,
    } as Partial<Article>);
  };

  return (
    <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <form className="upload-sheet rc-hoja" role="dialog" aria-modal="true" aria-label={art ? 'Corregir la línea' : 'Añadir una línea'} onSubmit={e => { e.preventDefault(); guardar(); }}>
        <div className="upload-sheet-handle" />
        <div className="rc-hoja-cab"><h3>{art ? 'Corregir la línea' : 'Añadir una línea'}</h3><button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={20} /></button></div>
        <p className="rc-hoja-txt">Pon lo que dice el papel del proveedor (el precio, sin IVA).</p>
        <label className="rc-campo">Artículo<input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus={!art} /></label>
        <div className="rc-campos-3">
          <label className="rc-campo">Cantidad<input inputMode="decimal" value={cantidad} onChange={e => setCantidad(e.target.value)} onFocus={e => e.target.select()} /></label>
          <label className="rc-campo">Precio<input inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)} onFocus={e => e.target.select()} /></label>
          <label className="rc-campo">Dto. %<input inputMode="text" value={dto} onChange={e => setDto(e.target.value)} placeholder="0" onFocus={e => e.target.select()} /></label>
        </div>
        <p className="rc-hoja-nota">Si lleva varios descuentos, sepáralos con «+»: 30+10.</p>
        <div className="rc-iva" role="radiogroup" aria-label="IVA del artículo">
          <span>IVA</span>
          {[21, 10, 4, 0].map(v => <button key={v} type="button" role="radio" aria-checked={iva === v} className={iva === v ? 'on' : ''} onClick={() => setIva(v)}>{v}&nbsp;%</button>)}
        </div>
        <div className={`rc-cuenta${vale ? '' : ' mal'}`}>
          {vale && neto != null && coste != null ? (
            <>
              <span>Importe de la línea <b>{euros(neto * (q as number))}</b></span>
              <span>Coste por unidad <b>{euros(coste)}</b>{prontoPago > 0 ? ` (con el ${numES(prontoPago, 0, 2)} % de pronto pago)` : ''}</span>
            </>
          ) : <span>Revisa los números: cantidad mayor que 0, precio y descuento entre 0 y 100.</span>}
        </div>
        <button className="btn btn-primary btn-lg rc-hoja-btn" type="submit" disabled={!vale}>Guardar</button>
        {art && <div className="rc-hoja-pie">
          {quitar
            ? <><span>¿Quitar esta línea del albarán?</span><span><button type="button" className="rc-enlace peligro" onClick={onQuitar}>Sí, quitarla</button>{' · '}<button type="button" className="rc-enlace" onClick={() => setQuitar(false)}>No</button></span></>
            : <button type="button" className="rc-enlace peligro" onClick={() => setQuitar(true)}><Trash2 size={14} /> Esta línea no es del albarán: quitarla</button>}
        </div>}
      </form>
    </div>
  );
}

/** Imprimir las etiquetas de balda: cuántas, por qué pegatina del folio empezar y el ajuste de la impresora. */
function HojaEtiquetas({ articulos, onCerrar }: { articulos: Article[]; onCerrar: () => void }) {
  const [inicio, setInicio] = useState(siguientePegatina());
  const [ajuste, setAjuste] = useState<{ dx: string; dy: string } | null>(null);
  const [verAjuste, setVerAjuste] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const n = articulos.length;
  const folios = Math.ceil((inicio - 1 + n) / 12);
  useEffect(() => { getAjusteEtiquetas().then(r => setAjuste({ dx: numES(r.data.dx, 0, 1), dy: numES(r.data.dy, 0, 1) })).catch(() => {}); }, []);

  const abrir = () => {
    window.open(etiquetasBaldaUrl(articulos.map(a => a.id), inicio), '_blank');
    guardarSiguientePegatina(inicio, n);
    onCerrar();
  };
  const guardarAjuste = async () => {
    if (!ajuste) return;
    try { await putAjusteEtiquetas(leerPrecio(ajuste.dx) ?? 0, leerPrecio(ajuste.dy) ?? 0); setGuardado(true); } catch { setGuardado(false); }
  };

  return (
    <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="upload-sheet rc-hoja" role="dialog" aria-modal="true" aria-label="Imprimir etiquetas de balda">
        <div className="upload-sheet-handle" />
        <div className="rc-hoja-cab"><h3>{plural(n, 'etiqueta')} de balda</h3><button className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={20} /></button></div>

        <p className="rc-hoja-txt">¿Por qué pegatina del folio empiezo? Toca la primera que esté libre.</p>
        <div className="rc-folio" role="radiogroup" aria-label="Primera pegatina libre del folio">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(p => (
            <button key={p} role="radio" aria-checked={p === inicio} className={p < inicio ? 'usada' : p < inicio + n ? 'va' : ''} onClick={() => setInicio(p)}>{p}</button>
          ))}
        </div>
        <p className="rc-hoja-nota">{folios === 1 ? 'Cabe todo en este folio.' : `Hacen falta ${folios} folios.`} En la impresora elige <b>tamaño real (100&nbsp;%)</b>, sin «ajustar a la página».</p>

        <button className="btn btn-primary btn-lg rc-hoja-btn" onClick={abrir}><Printer size={20} /> Abrir para imprimir</button>

        <div className="rc-hoja-pie">
          <a href={etiquetasPruebaUrl()} target="_blank" rel="noreferrer">Imprimir hoja de prueba</a>
          {esEncargado() && <button className="rc-enlace" onClick={() => setVerAjuste(v => !v)}>Ajustar la impresora</button>}
        </div>
        {verAjuste && ajuste && (
          <div className="rc-ajuste">
            <p>Si la impresión no cae centrada en la pegatina, dime cuántos milímetros hay que moverla (con la hoja de prueba se ve bien).</p>
            <label>A la derecha <input inputMode="decimal" value={ajuste.dx} onChange={e => { setGuardado(false); setAjuste({ ...ajuste, dx: e.target.value }); }} /> mm</label>
            <label>Hacia abajo <input inputMode="decimal" value={ajuste.dy} onChange={e => { setGuardado(false); setAjuste({ ...ajuste, dy: e.target.value }); }} /> mm</label>
            <small>En negativo, a la izquierda o hacia arriba.</small>
            <button className="btn btn-ghost btn-sm" onClick={guardarAjuste}>{guardado ? <><Check size={15} /> Guardado</> : 'Guardar ajuste'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Proveedor (eligiendo de los conocidos), número y fecha del albarán. */
function HojaDatos({ doc, onCerrar, onGuardado }: { doc: Document; onCerrar: () => void; onGuardado: () => void }) {
  const [proveedor, setProveedor] = useState(doc.supplier_name || '');
  const [numero, setNumero] = useState(doc.doc_number || '');
  const [fecha, setFecha] = useState(doc.doc_date || '');
  const [pp, setPp] = useState(doc.pronto_pago_pct ? numES(doc.pronto_pago_pct, 0, 2) : '');
  const [conocidos, setConocidos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { getProveedoresConocidos().then(r => setConocidos(r.data)).catch(() => {}); }, []);

  const guardar = async () => {
    setGuardando(true); setError(null);
    try {
      const nuevoPp = pp.trim() ? leerPrecio(pp) : null;
      if (pp.trim() && (nuevoPp == null || nuevoPp < 0 || nuevoPp > 50)) { setError('El pronto pago tiene que ser un porcentaje entre 0 y 50.'); return; }
      const cambiaPp = (nuevoPp || 0) !== (doc.pronto_pago_pct || 0);
      await updateDocument(doc.id, {
        supplier_name: proveedor.trim() || undefined, doc_number: numero.trim() || undefined, doc_date: fecha || undefined,
        ...(cambiaPp ? { pronto_pago_pct: (nuevoPp || null) as unknown as number } : {}),
      });
      if (cambiaPp) await recalculateArticles(doc.id);   // el pronto pago baja el coste de todas las líneas
      onGuardado();
    } catch (e) { setError(describeApiError(e)); } finally { setGuardando(false); }
  };

  return (
    <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <form className="upload-sheet rc-hoja" role="dialog" aria-modal="true" aria-label="Datos del albarán" onSubmit={e => { e.preventDefault(); guardar(); }}>
        <div className="upload-sheet-handle" />
        <div className="rc-hoja-cab"><h3>Datos del albarán</h3><button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={20} /></button></div>
        <label className="rc-campo">Proveedor
          <input list="rc-proveedores" value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Empieza a escribir y elige" autoComplete="off" />
          <datalist id="rc-proveedores">{conocidos.map(c => <option key={c} value={c} />)}</datalist>
        </label>
        <p className="rc-hoja-nota">Si lo cambias, la próxima vez que llegue un albarán con ese nombre saldrá ya como lo pongas aquí.</p>
        <div className="rc-campos-2">
          <label className="rc-campo">Nº de albarán<input value={numero} onChange={e => setNumero(e.target.value)} /></label>
          <label className="rc-campo">Fecha<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        </div>
        <label className="rc-campo rc-campo-corto">Descuento por pronto pago (%), si lo lleva<input inputMode="decimal" value={pp} onChange={e => setPp(e.target.value)} placeholder="0" /></label>
        {error && <p className="rc-error">{error}</p>}
        <button className="btn btn-primary btn-lg rc-hoja-btn" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </div>
  );
}
