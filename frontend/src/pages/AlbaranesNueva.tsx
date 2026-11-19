import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Archive, Check, ChevronRight, Copy, FileText, FolderCheck, FolderInput, ListChecks, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { ACCEPTED, MAX, SubirVarios } from '../components/SubirVarios';
import { albaranesDistintos, deleteDocument, describeApiError, juntarAlbaranes, listDocuments, marcarTerminado } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { useCfToast } from '../components/CfToast';
import type { Document, DocumentListItem } from '../types';
import { coincide, fechaES, ORDEN_ALBARANES, plural } from '../lib/texto';
import './albaranes.css';

const leyendose = (d: DocumentListItem) => d.status === 'processing' || d.status === 'uploaded';

/**
 * Albaranes de compra, versión nueva (nov. 2026, «En pruebas»): se suben uno o un montón a la vez, cada fila dice
 * si ya está guardado en la carpeta de Drive de su proveedor, y los que no hay que colocar se archivan de golpe.
 */
export function AlbaranesNueva() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [search, setSearch] = useState('');
  const [vista, setVista] = useState<'pendientes' | 'todos'>('pendientes');
  const [eligiendo, setEligiendo] = useState(false);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [gemelo, setGemelo] = useState<DocumentListItem | null>(null);
  const [borrando, setBorrando] = useState(false);
  const { toast, show } = useCfToast();

  // Ordenador: se pueden soltar los PDF encima de la lista, sin abrir antes «Subir albaranes»
  const [soltados, setSoltados] = useState<File[] | null>(null);
  const zona = useDropzone({
    noClick: true, noKeyboard: true, accept: ACCEPTED, maxFiles: MAX, maxSize: 20 * 1024 * 1024, disabled: showUpload || !!gemelo || borrando,
    onDrop: files => { if (files.length) { setSoltados(files); setShowUpload(true); } },
    onDropRejected: r => {
      const c = r.flatMap(x => x.errors.map(e => e.code));
      show(c.includes('too-many-files') ? `Demasiados archivos: como mucho ${MAX} de una vez` : c.includes('file-too-large') ? 'Alguno pesa más de 20 MB' : 'Solo valen PDF o fotos (JPG o PNG)', { error: true });
    },
  });
  const cerrarSubir = () => { setShowUpload(false); setSoltados(null); };
  // Esc cierra las ventanas (si no se está subiendo nada)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || ocupado) return;
      if (borrando) setBorrando(false); else if (gemelo) setGemelo(null); else if (showUpload) cerrarSubir(); else if (eligiendo) { setEligiendo(false); setMarcados(new Set()); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ocupado, gemelo, showUpload, eligiendo, borrando]);

  const cargar = async () => {
    try {
      const { data } = await listDocuments();
      setDocuments(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(describeApiError(e));
    } finally {
      setLoading(false);
    }
  };
  const ref = useRef<DocumentListItem[]>([]);
  useEffect(() => { ref.current = documents; }, [documents]);
  useEffect(() => {
    cargar();
    // Mientras haya alguno leyéndose o guardándose en Drive, la lista se pone al día sola
    const t = setInterval(() => {
      if (ref.current.some(d => leyendose(d) || d.drive_estado === 'guardando')) cargar();
    }, 4000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pendiente = (d: DocumentListItem) => !d.terminado_at;
  const nPendientes = documents.filter(pendiente).length;
  const base = useMemo(() => (vista === 'pendientes' ? documents.filter(pendiente) : documents), [documents, vista]);
  const filtrados = useMemo(() => {
    const q = search.trim();
    return q ? base.filter(d => coincide(q, d.original_filename, d.supplier_name, d.doc_number)) : base;
  }, [base, search]);
  useEffect(() => {
    try { sessionStorage.setItem(ORDEN_ALBARANES, JSON.stringify(filtrados.map(d => d.id))); } catch { /* nada */ }
  }, [filtrados]);

  // ── Resumen: ¿está todo leído y guardado? ──
  const leyendo = base.filter(leyendose).length;
  const conDrive = base.filter(d => d.drive_estado);
  const cuenta = (e: DocumentListItem['drive_estado']) => conDrive.filter(d => d.drive_estado === e).length;
  const enDrive = cuenta('ok') + cuenta('sin_carpeta') + cuenta('sin_leer');
  const faltan = cuenta('falta'), guardando = cuenta('guardando'), sinCarpeta = cuenta('sin_carpeta'), sinLeer = cuenta('sin_leer');
  const todos = enDrive === conDrive.length;
  const pegas = [
    guardando && `${guardando} guardándose`,
    faltan && `${faltan} sin guardar todavía (se reintenta solo)`,
    sinCarpeta && `${sinCarpeta} sin carpeta de proveedor (ábrelo y elígela)`,
    sinLeer && `${sinLeer} sin leer`,
  ].filter(Boolean);
  const resumen = conDrive.length === 0 ? null : {
    cls: faltan ? 'mal' : pegas.length ? 'aviso' : 'ok',
    texto: [todos ? (conDrive.length === 1 ? 'Guardado en Drive' : `Los ${conDrive.length} están guardados en Drive`) : `En Drive: ${enDrive} de ${conDrive.length}`, ...pegas].join(' · '),
  };

  const subidoUno = (doc: Document) => {
    cerrarSubir();
    if (doc.repetido) window.dispatchEvent(new CustomEvent('cf-cola-aviso', { detail: 'Ese albarán ya estaba subido: te abro el que hay' }));
    navigate(`/documento/${doc.id}`);
  };
  const subidosVarios = (docs: Document[]) => {
    cerrarSubir();
    setVista('pendientes');
    cargar();
    const repes = docs.filter(d => d.repetido).length, nuevos = docs.length - repes;
    const partes: string[] = [];
    if (nuevos) partes.push(`${plural(nuevos, 'albarán subido', 'albaranes subidos')}: se ${nuevos === 1 ? 'lee y se guarda solo' : 'leen y se guardan solos'}`);
    if (repes) partes.push(repes === 1 ? '1 ya estaba subido' : `${repes} ya estaban subidos`);
    show(partes.join(' · '));
  };

  // Se pueden marcar todos (para borrar); archivar, solo los ya leídos y sin terminar
  const archivables = filtrados.filter(d => !leyendose(d) && !d.terminado_at);
  const paraArchivar = vista === 'pendientes' ? archivables.filter(d => marcados.has(d.id)) : [];
  const paraBorrar = documents.filter(d => marcados.has(d.id));
  const alternar = (id: number) => setMarcados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const dejarDeElegir = () => { setEligiendo(false); setMarcados(new Set()); };
  const archivar = async () => {
    const ids = paraArchivar.map(d => d.id);
    dejarDeElegir();
    try {
      await Promise.all(ids.map(id => marcarTerminado(id, true)));
      await cargar();
      show(`${plural(ids.length, 'albarán archivado', 'albaranes archivados')} sin colocar`, {
        undo: async () => { await Promise.all(ids.map(id => marcarTerminado(id, false))); await cargar(); },
      });
    } catch (e) { show(describeApiError(e), { error: true }); cargar(); }
  };

  const borrar = async (conDrive: boolean) => {
    const ids = paraBorrar.map(d => d.id);
    setOcupado(true);
    const res = await Promise.allSettled(ids.map(id => deleteDocument(id, conDrive)));
    setOcupado(false);
    setBorrando(false);
    dejarDeElegir();
    await cargar();
    const mal = res.filter(r => r.status === 'rejected').length, bien = ids.length - mal;
    if (mal) show(`${bien ? `${plural(bien, 'borrado', 'borrados')} · ` : ''}${mal === 1 ? '1 no se pudo borrar' : `${mal} no se pudieron borrar`}: prueba otra vez`, { error: true });
    else show(`${plural(bien, 'albarán borrado', 'albaranes borrados')}${conDrive ? ', también de Drive' : ''}`);
  };

  const otro = gemelo ? documents.find(d => d.id === gemelo.gemelo_id) ?? null : null;

  return (
    <div {...zona.getRootProps({ className: `page dn${eligiendo ? ' dn-eligiendo' : ''}` })}>
      <input {...zona.getInputProps()} />
      {zona.isDragActive && <div className="dn-soltar"><div><Upload size={34} /><b>Suelta aquí los albaranes</b><span>Cada PDF es un albarán: se leen y se guardan solos en la carpeta de su proveedor</span></div></div>}
      {toast}
      {loadError && <ConnectionError message={loadError} onRetry={cargar} />}

      <div className="inicio-head" style={{ marginBottom: 16 }}>
        <div>
          <h1>Albaranes de compra</h1>
          <p>Súbelos todos, de uno en uno o un montón a la vez: cada uno se guarda solo en la carpeta de su proveedor. El día que coloques la mercancía, lo abres aquí.</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setShowUpload(true)}><Upload size={19} /> Subir albaranes</button>
      </div>

      {loading ? (
        <div className="dn-cargando"><span className="spinner" /> Cargando…</div>
      ) : documents.length === 0 && !loadError ? (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <div className="empty-state-icon"><FileText size={40} style={{ opacity: 0.35 }} /></div>
          <div className="empty-state-text">Aún no hay albaranes de proveedor</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowUpload(true)}><Upload size={17} /> Subir el primero</button>
        </div>
      ) : documents.length === 0 ? null : (
        <>
          <div className="firma-vistas doc-vistas" role="tablist" aria-label="Qué albaranes ver">
            <button role="tab" aria-selected={vista === 'pendientes'} className={`firma-vista${vista === 'pendientes' ? ' on' : ''}`} onClick={() => { setVista('pendientes'); dejarDeElegir(); }}>
              Por colocar <span className="firma-vista-n">{nPendientes}</span>
            </button>
            <button role="tab" aria-selected={vista === 'todos'} className={`firma-vista${vista === 'todos' ? ' on' : ''}`} onClick={() => { setVista('todos'); dejarDeElegir(); }}>
              Todos <span className="firma-vista-n">{documents.length}</span>
            </button>
          </div>

          {(leyendo > 0 || resumen) && (
            <div className="dn-resumen" role="status">
              {leyendo > 0 && <span className="dn-res leyendo"><span className="spinner spinner-sm" /> Leyendo {plural(leyendo, 'albarán', 'albaranes')}{leyendo > 3 && ' (de tres en tres)'}…</span>}
              {resumen && <span className={`dn-res ${resumen.cls}`}>{resumen.cls === 'ok' ? <FolderCheck size={16} /> : resumen.cls === 'mal' ? <AlertTriangle size={16} /> : <FolderInput size={16} />} {resumen.texto}</span>}
            </div>
          )}

          <div className="dn-barra">
            <div className="search-bar">
              <span className="search-bar-icon"><Search size={17} /></span>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor o nº…" autoComplete="off" />
              {search && <button className="search-bar-clear" onClick={() => setSearch('')} aria-label="Borrar búsqueda"><X size={16} /></button>}
            </div>
            {filtrados.length > 0 && !eligiendo && (
              <button className="btn btn-ghost dn-archivar" onClick={() => setEligiendo(true)}><ListChecks size={17} /> Seleccionar</button>
            )}
          </div>

          {eligiendo && (
            <div className="dn-ayuda">
              <p>
                Marca los que quieras y elige abajo.{vista === 'pendientes' && <> <b>Archivar</b>: no hay que colocarlos ni etiquetarlos (gasóleo, portes…); se quedan en Drive.</>} <b>Borrar</b>: están mal o repetidos y los vas a subir otra vez.
              </p>
              <button className="btn btn-ghost btn-sm" onClick={() => setMarcados(new Set(marcados.size === filtrados.length ? [] : filtrados.map(d => d.id)))}>
                {marcados.size === filtrados.length ? 'Quitar todos' : 'Marcar todos'}
              </button>
            </div>
          )}

          {filtrados.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-state-icon">{search ? <Search size={36} style={{ opacity: 0.35 }} /> : <Check size={36} style={{ opacity: 0.35 }} />}</div>
              <div className="empty-state-text">{search ? 'Sin resultados' : 'Todo colocado'}</div>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
                {search ? `No hay albaranes ${vista === 'pendientes' ? 'por colocar ' : ''}que coincidan con «${search}».` : 'No queda ningún albarán por colocar.'}
              </p>
              {search && vista === 'pendientes' && documents.length > base.length && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setVista('todos')}>Buscar en todos</button>
              )}
            </div>
          ) : (
            <div className="dn-lista cf-enter">
              {filtrados.map(doc => (
                <Fila key={doc.id} doc={doc}
                  eligiendo={eligiendo} marcado={marcados.has(doc.id)}
                  onAbrir={() => (eligiendo ? alternar(doc.id) : navigate(`/documento/${doc.id}`))}
                  onGemelo={() => setGemelo(doc)} />
              ))}
            </div>
          )}
        </>
      )}

      {eligiendo && (
        <div className="dn-pie">
          <button className="btn btn-ghost" onClick={dejarDeElegir}>Cancelar</button>
          <span className="dn-cuantos">{marcados.size ? plural(marcados.size, 'marcado', 'marcados') : 'Ninguno marcado'}</span>
          <button className="btn btn-ghost dn-borrar" disabled={paraBorrar.length === 0} onClick={() => setBorrando(true)}>
            <Trash2 size={17} /> {paraBorrar.length ? `Borrar ${paraBorrar.length}` : 'Borrar'}
          </button>
          {vista === 'pendientes' && (
            <button className="btn btn-primary" disabled={paraArchivar.length === 0} onClick={archivar}>
              <Archive size={17} /> {paraArchivar.length ? `Archivar ${paraArchivar.length}` : 'Archivar'}
            </button>
          )}
        </div>
      )}

      {showUpload && (
        <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget && !ocupado) cerrarSubir(); }}>
          <div className="upload-sheet">
            <div className="upload-sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 22, margin: 0 }}>Subir albaranes de proveedor</h3>
              {!ocupado && <button className="modal-close" style={{ marginLeft: 'auto' }} onClick={cerrarSubir} aria-label="Cerrar"><X size={20} /></button>}
            </div>
            <SubirVarios onUno={subidoUno} onVarios={subidosVarios} onOcupado={setOcupado} iniciales={soltados} />
          </div>
        </div>
      )}

      {borrando && paraBorrar.length > 0 && (
        <HojaBorrar docs={paraBorrar} ocupado={ocupado} onCerrar={() => setBorrando(false)} onBorrar={borrar} />
      )}

      {gemelo && otro && (
        <HojaGemelo a={gemelo} b={otro} onCerrar={() => setGemelo(null)}
          onVer={id => navigate(`/documento/${id}`)}
          onHecho={(texto) => { setGemelo(null); cargar(); show(texto); }}
          onError={(texto) => show(texto, { error: true })} />
      )}
    </div>
  );
}

const ETIQUETA: Record<string, { texto: string; cls: string }> = {
  uploaded: { texto: 'En cola', cls: 'badge badge-grey' },
  processing: { texto: 'Leyendo…', cls: 'badge badge-warning' },
  completed: { texto: 'Por colocar', cls: 'badge badge-warning' },
  error: { texto: 'No se leyó', cls: 'badge badge-danger' },
};

function Fila({ doc, eligiendo, marcado, onAbrir, onGemelo }: {
  doc: DocumentListItem; eligiendo: boolean; marcado: boolean; onAbrir: () => void; onGemelo: () => void;
}) {
  const et = doc.terminado_at && doc.status !== 'error' ? { texto: 'Terminado', cls: 'badge badge-grey' } : ETIQUETA[doc.status] || ETIQUETA.uploaded;
  const enCurso = leyendose(doc);
  const titulo = doc.supplier_name || (enCurso ? doc.original_filename : doc.status === 'error' ? `Sin leer · ${doc.original_filename}` : 'Proveedor sin poner');
  const sub = [doc.doc_number && `Nº ${doc.doc_number}`, fechaES(doc.doc_date || doc.created_at), doc.status === 'completed' && plural(doc.article_count, 'artículo')].filter(Boolean).join(' · ');
  const drive = doc.drive_estado === 'ok' ? { cls: 'ok', ico: <FolderCheck size={15} />, texto: <>En Drive · <b>{doc.drive_carpeta}</b></> }
    : doc.drive_estado === 'sin_carpeta' ? { cls: 'aviso', ico: <FolderInput size={15} />, texto: <>En Drive, <b>falta la carpeta</b></> }
    : doc.drive_estado === 'sin_leer' ? { cls: 'aviso', ico: <FolderInput size={15} />, texto: <>En Drive, sin leer</> }
    : doc.drive_estado === 'guardando' ? { cls: 'gris', ico: <RefreshCw size={14} className="girando" />, texto: <>{enCurso ? 'Se guarda en Drive al leerlo' : 'Guardándose en Drive…'}</> }
    : doc.drive_estado === 'falta' ? { cls: 'mal', ico: <AlertTriangle size={15} />, texto: <><b>Sin guardar en Drive</b> todavía</> }
    : null;
  return (
    <div className={`card dn-fila${marcado ? ' on' : ''}`}>
      <button className="dn-abrir" onClick={onAbrir} aria-pressed={eligiendo ? marcado : undefined}>
        {eligiendo && <span className={`dn-casilla${marcado ? ' on' : ''}`} aria-hidden="true">{marcado && <Check size={15} strokeWidth={3.4} />}</span>}
        <span className="dn-tit">{titulo}</span>
        <span className="dn-sub">{sub}</span>
        <span className={`dn-drive ${drive?.cls ?? ''}`}>{drive && <>{drive.ico} <span>{drive.texto}</span></>}</span>
        <span className={`${et.cls} dn-estado`}>{enCurso && <span className="spinner spinner-sm" />}{et.texto}</span>
        {!eligiendo && <ChevronRight size={18} className="dn-flecha" />}
      </button>
      {doc.gemelo_id != null && doc.gemelo_id < doc.id && !eligiendo && (
        <button className="dn-gemelo" onClick={onGemelo}>
          <Copy size={15} /> <span>Hay otro albarán de este proveedor con el mismo número. <b>¿Es otra hoja?</b></span>
        </button>
      )}
    </div>
  );
}

/** Confirmar el borrado de los marcados: no tiene vuelta atrás, así que se enseña cuáles son. */
function HojaBorrar({ docs, ocupado, onCerrar, onBorrar }: {
  docs: DocumentListItem[]; ocupado: boolean; onCerrar: () => void; onBorrar: (conDrive: boolean) => void;
}) {
  const enDrive = docs.filter(d => d.drive_estado && d.drive_estado !== 'falta').length;
  const [conDrive, setConDrive] = useState(true);
  const n = docs.length;
  const nombre = (d: DocumentListItem) => [d.supplier_name || d.original_filename, d.doc_number && `Nº ${d.doc_number}`].filter(Boolean).join(' · ');
  return (
    <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div className="upload-sheet dn-hoja">
        <div className="upload-sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 22, margin: 0 }}>{n === 1 ? '¿Borrar este albarán?' : `¿Borrar estos ${n} albaranes?`}</h3>
          <button className="modal-close" style={{ marginLeft: 'auto' }} onClick={onCerrar} disabled={ocupado} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <ul className="dn-borrar-lista">
          {docs.slice(0, 6).map(d => <li key={d.id}><FileText size={15} /> <span>{nombre(d)}</span></li>)}
          {n > 6 && <li className="mas">y {n - 6} más</li>}
        </ul>
        <p className="dn-hoja-txt">Se quitan de la app con sus artículos y precios. <b>No se puede deshacer</b>, pero puedes volver a subirlos.</p>
        {enDrive > 0 && (
          <label className="dn-borrar-drive">
            <input type="checkbox" checked={conDrive} onChange={e => setConDrive(e.target.checked)} disabled={ocupado} />
            <span><b>Quitar también {enDrive === 1 ? 'su copia' : 'sus copias'} de Drive</b><small>Van a la papelera de Drive. Déjalo marcado si los vas a subir otra vez: si no, quedarían dos veces.</small></span>
          </label>
        )}
        <div className="dn-borrar-pie">
          <button className="btn btn-ghost" onClick={onCerrar} disabled={ocupado}>No, dejarlos</button>
          <button className="btn btn-danger" disabled={ocupado} onClick={() => onBorrar(conDrive && enDrive > 0)}>
            <Trash2 size={17} /> {ocupado ? 'Borrando…' : n === 1 ? 'Sí, borrarlo' : `Sí, borrar los ${n}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Dos albaranes con el mismo proveedor, número y fecha: otra hoja del mismo (el escáner saca un PDF por hoja) o repetido. */
function HojaGemelo({ a, b, onCerrar, onVer, onHecho, onError }: {
  a: DocumentListItem; b: DocumentListItem; onCerrar: () => void; onVer: (id: number) => void;
  onHecho: (texto: string) => void; onError: (texto: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [primero, segundo] = a.id < b.id ? [a, b] : [b, a];
  const hacer = async (f: () => Promise<unknown>, texto: string) => {
    setOcupado(true);
    try { await f(); onHecho(texto); }
    catch (e) { onError((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || describeApiError(e)); setOcupado(false); }
  };
  return (
    <div className="upload-overlay" onClick={e => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div className="upload-sheet dn-hoja">
        <div className="upload-sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 22, margin: 0 }}>Dos albaranes con el mismo número</h3>
          <button className="modal-close" style={{ marginLeft: 'auto' }} onClick={onCerrar} disabled={ocupado} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <p className="dn-hoja-txt"><b>{a.supplier_name}</b> · Nº {a.doc_number} · {fechaES(a.doc_date || a.created_at)}. El escáner saca un archivo por hoja, así que puede ser la hoja 2 del mismo albarán.</p>
        <div className="dn-par">
          {[primero, segundo].map(d => (
            <button key={d.id} className="dn-par-uno" onClick={() => onVer(d.id)} disabled={ocupado}>
              <FileText size={18} />
              <span><b>{d.original_filename}</b><small>{plural(d.article_count, 'artículo')} · Ver</small></span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary dn-hoja-btn" disabled={ocupado}
          onClick={() => hacer(() => juntarAlbaranes(primero.id, segundo.id), 'Juntados en uno: se está leyendo entero')}>
          {ocupado ? 'Un momento…' : 'Son hojas del mismo: juntarlos'}
        </button>
        <p className="dn-hoja-nota">Quedan en un solo albarán con todas las hojas y se vuelve a leer entero (lo que hubieras cambiado a mano en ellos se pierde).</p>
        <div className="dn-hoja-otros">
          <button className="btn btn-ghost" disabled={ocupado} onClick={() => hacer(() => deleteDocument(segundo.id, true), 'Quitado el repetido')}>Es el mismo, subido dos veces: quitar uno</button>
          <button className="btn btn-ghost" disabled={ocupado} onClick={() => hacer(() => albaranesDistintos(a.id, b.id), 'Apuntado: son albaranes distintos')}>Son albaranes distintos</button>
        </div>
      </div>
    </div>
  );
}
