import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Camera, Image as ImageIcon, X, Plus, Minus, ShoppingBasket, Trash2, FileText, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { decodeBarcodeImage, describeApiError } from '../api/client';
import { buscarCatalogo, cargarCatalogo } from '../lib/catalogo';
import { fechaES } from '../lib/texto';
import { getRol } from '../auth';
import { useCfToast } from '../components/CfToast';
import { nombreProveedor } from '../lib/proveedor';
import type { CatalogArticle } from '../types';

/**
 * Consultar precio (+ la antigua «Venta»).
 * - Lector PDA o teclado: se busca al leer el código y el campo queda listo para el siguiente.
 * - Cámara del móvil: en directo o con una foto del código.
 * - «Añadir a la cuenta»: suma varios artículos para decir el total al cliente.
 */
interface Linea { id: number; descripcion: string; pvp_con_iva: number; iva_pct: number; codigo: string; qty: number }

const eur = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

function leerCuenta(): Linea[] {
  try { return JSON.parse(localStorage.getItem('sale_cart') ?? '[]'); } catch { return []; }
}

export function PriceLookupPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuenta, setCuentaRaw] = useState<Linea[]>(leerCuenta);
  const [verTotal, setVerTotal] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const [costeVisible, setCosteVisible] = useState<number | null>(null);
  const puedeVerCoste = getRol() === 'admin' || getRol() === 'tienda';
  const { toast, show } = useCfToast();

  // Cámara
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef = useRef<any>(null);
  const ultimoCodigo = useRef('');
  const fotoRef = useRef<HTMLInputElement>(null);
  const [camara, setCamara] = useState(false);
  const [camaraError, setCamaraError] = useState<string | null>(null);
  const [leyendoFoto, setLeyendoFoto] = useState(false);

  const setCuenta = (fn: (prev: Linea[]) => Linea[]) => setCuentaRaw(prev => {
    const next = fn(prev);
    try { localStorage.setItem('sale_cart', JSON.stringify(next)); } catch { /* nada */ }
    return next;
  });

  useEffect(() => { inputRef.current?.focus(); cargarCatalogo().catch(() => { /* se reintenta al buscar */ }); }, []);

  const search = useCallback(async (q: string, desdeLector = false) => {
    const clean = q.trim();
    clearTimeout(timer.current);
    if (!clean) { setResults([]); setSearched(false); setError(null); return; }
    setLoading(true); setSearched(true); setError(null);
    try {
      setResults(await buscarCatalogo(clean, 20));
      setCosteVisible(null);
    } catch (e) {
      setResults([]); setError(describeApiError(e));
    } finally {
      setLoading(false);
      // Tras leer un código, el texto queda seleccionado: el siguiente código lo sustituye
      if (desdeLector) requestAnimationFrame(() => inputRef.current?.select());
    }
  }, []);

  const onChange = (v: string) => {
    setQuery(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 350); // escribiendo a mano
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); search(query, true); }
  };
  const limpiar = () => { setQuery(''); setResults([]); setSearched(false); setError(null); inputRef.current?.focus(); };

  const codigoLeido = useCallback((code: string) => {
    if (navigator.vibrate) navigator.vibrate(60);
    setQuery(code);
    search(code, true);
  }, [search]);

  const pararCamara = useCallback(() => {
    if (readerRef.current) { try { readerRef.current.reset(); } catch { /* nada */ } readerRef.current = null; }
    setCamara(false);
  }, []);
  useEffect(() => () => pararCamara(), [pararCamara]);

  const abrirCamara = async () => {
    setCamaraError(null);
    try {
      const ZXing = await import('@zxing/browser');
      const reader = new ZXing.BrowserMultiFormatReader();
      readerRef.current = reader;
      const devices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
      const trasera = devices.find(d => /back|rear|environment|trasera/i.test(d.label)) || devices[devices.length - 1];
      setCamara(true);
      await reader.decodeFromVideoDevice(trasera?.deviceId, videoRef.current!, result => {
        const code = result?.getText();
        if (code && code !== ultimoCodigo.current) {
          ultimoCodigo.current = code;
          codigoLeido(code);
          setTimeout(() => { ultimoCodigo.current = ''; }, 2500);
        }
      });
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      setCamara(false);
      setCamaraError(/Permission|NotAllowed/i.test(msg)
        ? 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador.'
        : 'No se pudo abrir la cámara. Prueba con «Foto del código».');
    }
  };

  const fotoCodigo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLeyendoFoto(true); setCamaraError(null);
    try {
      const { data } = await decodeBarcodeImage(file);
      if (data.code) codigoLeido(data.code);
    } catch {
      setCamaraError('No se ve ningún código en la foto. Prueba más cerca y con buena luz.');
    } finally {
      setLeyendoFoto(false);
      if (fotoRef.current) fotoRef.current.value = '';
    }
  };

  const añadir = (a: CatalogArticle) => {
    setCuenta(prev => {
      const ya = prev.find(l => l.id === a.id);
      if (ya) return prev.map(l => l.id === a.id ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { id: a.id, descripcion: a.descripcion, pvp_con_iva: a.pvp_con_iva, iva_pct: a.iva_pct, codigo: a.codigo_principal || a.ean || '', qty: 1 }];
    });
    show(`Añadido a la cuenta: ${a.descripcion}`);
    inputRef.current?.select();
  };
  const cambiarQty = (id: number, d: number) => setCuenta(prev => prev.map(l => l.id === id ? { ...l, qty: l.qty + d } : l).filter(l => l.qty > 0));
  const vaciar = () => {
    const antes = cuenta;
    setCuenta(() => []);
    setVerTotal(false);
    setCuentaAbierta(false);
    show('Cuenta vaciada', { undo: () => { try { setCuenta(() => antes); } catch { /* nada */ } } });
  };

  const total = cuenta.reduce((s, l) => s + l.pvp_con_iva * l.qty, 0);
  const unidades = cuenta.reduce((s, l) => s + l.qty, 0);

  // Pantalla grande con el total, para enseñársela al cliente
  if (verTotal && cuenta.length) {
    return (
      <div className="cuenta-total-pantalla">
        <span>Total</span>
        <b>{eur(total)}</b>
        <small>IVA incluido · {unidades} artículo{unidades !== 1 ? 's' : ''}</small>
        <ul>{cuenta.map(l => <li key={l.id}><span>{l.qty > 1 ? `${l.qty} × ` : ''}{l.descripcion}</span><span>{eur(l.pvp_con_iva * l.qty)}</span></li>)}</ul>
        <div className="cuenta-total-botones">
          <button className="btn btn-lg" onClick={() => setVerTotal(false)}>Volver</button>
          <button className="btn btn-lg cuenta-nueva" onClick={vaciar}>Terminar y empezar otra</button>
        </div>
        {toast}
      </div>
    );
  }

  return (
    <div className={`page consulta${cuenta.length ? ' con-cuenta' : ''}`}>
      <div className="inicio-head consulta-head">
        <div>
          <h1>Consultar precio</h1>
          <p>Pasa el lector por el código, usa la cámara o escribe la referencia o el nombre.</p>
        </div>
      </div>

      <div className="consulta-buscador">
        <Search size={22} className="consulta-lupa" />
        <input ref={inputRef} type="text" enterKeyHint="search" value={query} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
          onFocus={e => e.target.select()} placeholder="Código de barras, referencia o nombre…" autoComplete="off"
          aria-label="Buscar artículo" />
        {query && <button className="consulta-borrar" onClick={limpiar} aria-label="Borrar búsqueda"><X size={20} /></button>}
      </div>

      <div className="consulta-camara">
        {!camara ? (
          <>
            <button className="btn btn-ghost" onClick={abrirCamara}><Camera size={18} /> Escanear con la cámara</button>
            <label className="btn btn-ghost">
              <ImageIcon size={18} /> {leyendoFoto ? 'Leyendo…' : 'Foto del código'}
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden onChange={fotoCodigo} disabled={leyendoFoto} />
            </label>
          </>
        ) : null}
      </div>
      <div className="consulta-video" style={{ display: camara ? 'block' : 'none' }}>
        <video ref={videoRef} playsInline muted />
        <span className="consulta-linea" />
        <button className="btn btn-sm consulta-parar" onClick={pararCamara}><X size={16} /> Cerrar cámara</button>
      </div>
      {camaraError && <p className="consulta-aviso">{camaraError}</p>}

      {loading && <p className="consulta-vacio">Buscando…</p>}
      {!loading && error && <p className="consulta-aviso">No se pudo buscar: {error}</p>}
      {!loading && !error && searched && results.length === 0 && (
        <div className="consulta-noesta">
          <b>No está en el catálogo</b>
          <span>No hay ningún artículo con ese código o nombre. Solo aparecen los que han llegado en albaranes de proveedor.</span>
        </div>
      )}

      {!loading && results.length > 0 && (
        <ul className="consulta-lista cf-enter">
          {results.map(a => (
            <li key={a.id} className="card consulta-art">
              <div className="consulta-art-info">
                <b>{a.descripcion}</b>
                <div className="consulta-chips">
                  {a.codigo_principal && <span className="mono">{a.codigo_principal}</span>}
                  {a.ean && a.ean !== a.codigo_principal && <span className="mono">{a.ean}</span>}
                  {a.supplier_name && <span>{nombreProveedor(a.supplier_name)}</span>}
                </div>
                {/* El coste y el margen no se enseñan al cliente: solo tras tocar «Ver coste» */}
                {puedeVerCoste && (costeVisible === a.id ? (
                  <small className="consulta-coste">
                    Coste {eur(a.coste_neto_unitario)} · sin IVA {eur(a.pvp_sin_iva)} · margen {a.margen_pct.toFixed(0)} %
                    {a.doc_date && <> · <button className="turnos-link" onClick={() => navigate(`/documento/${a.document_id}`)}><FileText size={12} /> albarán del {fechaES(a.doc_date)}</button></>}
                    <button className="consulta-ver-coste" onClick={() => setCosteVisible(null)}><EyeOff size={13} /> Ocultar</button>
                  </small>
                ) : (
                  <button className="consulta-ver-coste" onClick={() => setCosteVisible(a.id)}><Eye size={13} /> Ver coste</button>
                ))}
              </div>
              <div className="consulta-art-precio">
                <span className="consulta-pvp">{eur(a.pvp_con_iva)}</span>
                <small>con IVA</small>
                <button className="btn btn-primary btn-sm" onClick={() => añadir(a)}><Plus size={15} /> A la cuenta</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && !searched && !camara && (
        <p className="consulta-vacio">Lista para leer códigos. También puedes sumar varios artículos con «A la cuenta» para decir el total al cliente.</p>
      )}

      {/* Cuenta: barra pequeña abajo; se despliega al tocar «Ver cuenta» */}
      {cuenta.length > 0 && !cuentaAbierta && (
        <section className="card consulta-cuenta mini" aria-label="Cuenta">
          <ShoppingBasket size={20} />
          <span className="consulta-mini-txt"><b>{eur(total)}</b><small>{unidades} artículo{unidades !== 1 ? 's' : ''} en la cuenta</small></span>
          <button className="btn btn-primary btn-sm" onClick={() => setCuentaAbierta(true)}><ChevronUp size={16} /> Ver cuenta</button>
        </section>
      )}
      {cuenta.length > 0 && cuentaAbierta && (
        <div className="consulta-cuenta-fondo" onClick={e => { if (e.target === e.currentTarget) setCuentaAbierta(false); }}>
          <section className="card consulta-cuenta abierta" aria-label="Cuenta" role="dialog">
            <div className="consulta-cuenta-cab">
              <ShoppingBasket size={20} />
              <b>Cuenta · {unidades} artículo{unidades !== 1 ? 's' : ''}</b>
              <button className="btn btn-ghost btn-sm" onClick={vaciar} aria-label="Vaciar la cuenta"><Trash2 size={15} /> Vaciar</button>
              <button className="modal-close" onClick={() => setCuentaAbierta(false)} aria-label="Cerrar la cuenta"><X size={20} /></button>
            </div>
            <ul>
              {cuenta.map(l => (
                <li key={l.id}>
                  <span className="consulta-cuenta-desc">{l.descripcion}<small>{eur(l.pvp_con_iva)} c/u</small></span>
                  <span className="consulta-qty">
                    <button onClick={() => cambiarQty(l.id, -1)} aria-label="Uno menos"><Minus size={18} /></button>
                    <b>{l.qty}</b>
                    <button onClick={() => cambiarQty(l.id, 1)} aria-label="Uno más"><Plus size={18} /></button>
                  </span>
                  <span className="consulta-cuenta-imp">{eur(l.pvp_con_iva * l.qty)}</span>
                </li>
              ))}
            </ul>
            <button className="btn btn-primary btn-lg consulta-total" onClick={() => setVerTotal(true)}>
              Total {eur(total)} <small>· enseñar al cliente</small>
            </button>
          </section>
        </div>
      )}
      {toast}
    </div>
  );
}
