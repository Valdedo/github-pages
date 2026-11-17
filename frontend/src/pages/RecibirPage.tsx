import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowUp, ArrowDown, Sparkles, Check, ScanBarcode, Tag, Pencil, FileText, Table2, RotateCw,
  Trash2, ChevronDown, AlertTriangle, X, Printer, History,
} from 'lucide-react';
import {
  getDocument, getRecepcion, updateArticle, updateDocument, marcarTerminado, reprocessDocument, deleteDocument,
  getProveedoresConocidos, etiquetasBaldaUrl, etiquetasPruebaUrl, getAjusteEtiquetas, putAjusteEtiquetas,
  downloadExcel, downloadTreyFact, downloadPriceList, describeApiError,
} from '../api/client';
import type { Article, Document, EstadoCompra, LineaRecepcion, Recepcion } from '../types';
import { useCfToast } from '../components/CfToast';
import { ConfirmModal } from '../components/ConfirmModal';
import { DocumentPreview } from '../components/DocumentPreview';
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
  const [avisoEsc, setAvisoEsc] = useState<{ texto: string; mal?: boolean } | null>(null);
  const [verOriginal, setVerOriginal] = useState(false);
  const [hoja, setHoja] = useState<'etiquetas' | 'datos' | null>(null);
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
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout>;
    const ciclo = async () => {
      const estado = await cargar();
      if (vivo && (estado === 'processing' || estado === 'uploaded')) reloj = setTimeout(ciclo, 3000);
    };
    ciclo();
    return () => { vivo = false; clearTimeout(reloj); };
  }, [cargar]);

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
      if (l && ('pvp_fijo' in cambio)) {
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
  const codigoLeido = async (codigo: string) => {
    const art = articulos.find(a => a.id === escId);
    if (!art) return;
    const limpio = codigo.replace(/\s/g, '');
    if (!eanValido(limpio)) {
      setAvisoEsc({ texto: `«${limpio.slice(0, 22)}» no es el código de barras del producto. Prueba con el otro código del envase.`, mal: true });
      return;
    }
    const otro = articulos.find(a => a.id !== art.id && (a.ean || '').replace(/\D/g, '') === limpio);
    if (otro) { setAvisoEsc({ texto: `Ese código ya lo tiene «${otro.descripcion.slice(0, 40)}»`, mal: true }); return; }
    if (await guardar(art, { ean: limpio })) {
      const sig = siguienteSinCodigo(art.id);
      setAvisoEsc({ texto: `Guardado · ${art.descripcion.slice(0, 34)}` });
      if (sig == null) { setEscId(null); setAvisoEsc(null); show('Todos los artículos tienen ya su código de barras'); } else setEscId(sig);
    }
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
  const validacion = (() => { try { return doc.validacion_notas ? JSON.parse(doc.validacion_notas) : null; } catch { return null; } })();
  const escArt = articulos.find(a => a.id === escId);

  const chip = (f: Filtro, n: number, txt: string) => (
    <button key={f} className={`rc-chip ${f}${filtro === f ? ' on' : ''}`} aria-pressed={filtro === f} disabled={n === 0 && f !== 'todos'} onClick={() => setFiltro(filtro === f ? 'todos' : f)}>
      <b>{n}</b><span>{txt}</span>
    </button>
  );

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
        <button className="btn btn-ghost btn-sm" onClick={() => setHoja('datos')}><Pencil size={15} /> Cambiar</button>
      </header>

      {leyendo && (
        <div className="rc-aviso info"><span className="spinner" /> <div><b>Leyendo el albarán…</b><span>Suele tardar menos de un minuto. Puedes dejar esta pantalla; se queda en la lista.</span></div></div>
      )}
      {doc.status === 'error' && (
        <div className="rc-aviso mal"><AlertTriangle size={20} /><div><b>No se pudo leer este albarán</b><span>{doc.error_message || 'Vuelve a intentarlo.'}</span></div>
          <button className="btn btn-primary btn-sm" onClick={async () => { await reprocessDocument(docId); cargar(); }}><RotateCw size={15} /> Volver a leer</button></div>
      )}
      {doc.status === 'completed' && !doc.supplier_name && (
        <div className="rc-aviso"><AlertTriangle size={20} /><div><b>No se ve de qué proveedor es</b><span>Ponlo tú: así la próxima vez se comparan los precios con sus compras anteriores.</span></div>
          <button className="btn btn-primary btn-sm" onClick={() => setHoja('datos')}>Poner proveedor</button></div>
      )}
      {doc.status === 'completed' && doc.validacion_ok === false && validacion?.diferencia != null && (
        <div className="rc-aviso"><AlertTriangle size={20} /><div><b>Las cuentas no cuadran: repásalo con el papel</b>
          <span>Lo leído suma {euros(validacion.base_calculada)} y el albarán dice {euros(validacion.base_imponible_doc)} ({validacion.diferencia > 0 ? '+' : '−'}{euros(Math.abs(validacion.diferencia))}). Puede faltar una línea o haber una cantidad o un precio mal leídos.</span></div>
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
                      <b>{euros(a.coste_neto_unitario)}</b>
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
                      : <button className="btn btn-ghost btn-sm" onClick={() => { setAvisoEsc(null); setEscId(a.id); }}><ScanBarcode size={16} /> Leer código de barras</button>}
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

          <div className="rc-fin">
            {doc.terminado_at
              ? <button className="btn btn-ghost" onClick={async () => { await marcarTerminado(docId, false); cargar(); }}>Volver a dejarlo por terminar</button>
              : <button className="btn btn-ghost btn-lg" onClick={async () => { await marcarTerminado(docId, true); await cargar(); show('Albarán terminado', { undo: async () => { await marcarTerminado(docId, false); cargar(); } }); }}><Check size={19} /> Ya está colocado: terminar</button>}
          </div>

          <details className="rc-mas">
            <summary>Más opciones</summary>
            <div className="rc-mas-lista">
              <button onClick={() => setVerOriginal(v => !v)}><FileText size={17} /> {verOriginal ? 'Ocultar el albarán original' : 'Ver el albarán original'}</button>
              <button onClick={() => navigate(`/documento/${docId}/tabla`)}><Table2 size={17} /> Tabla completa (descuentos, añadir o quitar líneas)</button>
              <button onClick={async () => { await reprocessDocument(docId); setRec(null); etiquetasPuestas.current = false; cargar(); show('Leyéndolo otra vez…'); }}><RotateCw size={17} /> Volver a leer el albarán</button>
              <button onClick={() => downloadTreyFact(docId)}>Archivo para TreyFACT</button>
              <button onClick={() => downloadExcel(docId)}>Excel</button>
              <button onClick={() => downloadPriceList(docId)}>Listín de precios</button>
              <button className="peligro" onClick={() => setBorrar(true)}><Trash2 size={17} /> Borrar este albarán</button>
            </div>
          </details>

          {verOriginal && (
            <div className="card rc-original">
              <div className="card-header"><span>Albarán original</span><button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setVerOriginal(false)}>Ocultar</button></div>
              <DocumentPreview document={doc} />
            </div>
          )}

          <div className="rc-barra">
            <button className="btn btn-ghost" disabled={sinCodigo.length === 0} onClick={() => { setAvisoEsc(null); setEscId(sinCodigo[0].id); }}>
              <ScanBarcode size={19} /> {sinCodigo.length ? <><span className="rc-largo">Leer códigos</span><span className="rc-corto">Códigos</span> <span className="rc-n">{sinCodigo.length}</span></> : 'Códigos al día'}
            </button>
            <button className="btn btn-primary" disabled={paraEtiqueta.length === 0} onClick={() => setHoja('etiquetas')}>
              <Printer size={19} /> Etiquetas <span className="rc-n">{paraEtiqueta.length}</span>
            </button>
          </div>
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
      {hoja === 'etiquetas' && <HojaEtiquetas articulos={paraEtiqueta} onCerrar={() => setHoja(null)} />}
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
      <thead><tr><th>Fecha</th><th>Coste</th><th>Se vendía a</th><th>Cant.</th></tr></thead>
      <tbody>
        {l.historial.map((h, i) => (
          <tr key={i}><td>{fechaES(h.fecha)}</td><td>{euros(h.coste)}</td><td>{euros(h.pvp)}</td><td>{cant(h.cantidad)}</td></tr>
        ))}
      </tbody>
    </table>
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
  const [conocidos, setConocidos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { getProveedoresConocidos().then(r => setConocidos(r.data)).catch(() => {}); }, []);

  const guardar = async () => {
    setGuardando(true); setError(null);
    try {
      await updateDocument(doc.id, { supplier_name: proveedor.trim() || undefined, doc_number: numero.trim() || undefined, doc_date: fecha || undefined });
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
        {error && <p className="rc-error">{error}</p>}
        <button className="btn btn-primary btn-lg rc-hoja-btn" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </div>
  );
}
