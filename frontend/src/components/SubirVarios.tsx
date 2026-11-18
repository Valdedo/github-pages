import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, Copy, FileText, Images, UploadCloud } from 'lucide-react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { uploadDocument, uploadMultiImages } from '../api/client';
import type { Document } from '../types';
import { compressImage, errorSubida } from './FileUpload';

const MAX = 40;            // albaranes de una vez
const MAX_HOJAS = 10;      // fotos de un mismo albarán
const ACCEPTED = { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] };
const esFoto = (f: File) => f.type.startsWith('image/');

type Estado = 'cola' | 'subiendo' | 'ok' | 'repe' | 'mal';
interface Tarea { nombre: string; archivos: File[]; estado: Estado; detalle?: string }

interface Props {
  /** Se subió uno solo: se abre directamente. */
  onUno: (doc: Document) => void;
  /** Se subieron varios: se quedan en la lista leyéndose. */
  onVarios: (docs: Document[]) => void;
  /** Mientras sube no se debe cerrar la ventana. */
  onOcupado?: (ocupado: boolean) => void;
}

/**
 * Subir albaranes de proveedor, uno o un montón a la vez (nov. 2026).
 * Cada PDF es un albarán. Con varias fotos se pregunta si son hojas del mismo o albaranes distintos.
 */
export function SubirVarios({ onUno, onVarios, onOcupado }: Props) {
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [dudaFotos, setDudaFotos] = useState<{ fotos: File[]; pdfs: File[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const subidos = useRef<Document[]>([]);

  const subir = useCallback(async (lista: Tarea[]) => {
    setError(null);
    setTareas(lista);
    setSubiendo(true);
    onOcupado?.(true);
    const pon = (i: number, c: Partial<Tarea>) => setTareas(t => t && t.map((x, j) => (j === i ? { ...x, ...c } : x)));
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].estado === 'ok' || lista[i].estado === 'repe') continue;
      pon(i, { estado: 'subiendo', detalle: undefined });
      try {
        const comp = await Promise.all(lista[i].archivos.map(f => compressImage(f)));
        const { data } = comp.length > 1 ? await uploadMultiImages(comp) : await uploadDocument(comp[0]);
        subidos.current.push(data);
        lista[i] = { ...lista[i], estado: data.repetido ? 'repe' : 'ok' };
        pon(i, { estado: lista[i].estado });
      } catch (e) {
        lista[i] = { ...lista[i], estado: 'mal', detalle: errorSubida(e, 'No se pudo subir. Comprueba la conexión.') };
        pon(i, { estado: 'mal', detalle: lista[i].detalle });
      }
    }
    setSubiendo(false);
    onOcupado?.(false);
    if (lista.some(t => t.estado === 'mal')) return;   // se queda a la vista para reintentar
    const docs = subidos.current;
    if (lista.length === 1 && docs.length === 1) onUno(docs[0]);
    else if (docs.length) onVarios(docs);
  }, [onUno, onVarios, onOcupado]);

  const tareasDe = (pdfs: File[], fotos: File[], juntas: boolean): Tarea[] => [
    ...pdfs.map(f => ({ nombre: f.name, archivos: [f], estado: 'cola' as Estado })),
    ...(juntas && fotos.length
      ? [{ nombre: `Albarán de ${fotos.length} hojas (fotos)`, archivos: fotos, estado: 'cola' as Estado }]
      : fotos.map((f, i) => ({ nombre: fotos.length > 1 ? `Foto ${i + 1} · ${f.name}` : f.name, archivos: [f], estado: 'cola' as Estado }))),
  ];

  const elegidos = useCallback((files: File[]) => {
    if (!files.length) return;
    if (files.length > MAX) { setError(`Son ${files.length} archivos. Mete como mucho ${MAX} de una vez y luego el resto.`); return; }
    subidos.current = [];
    const fotos = files.filter(esFoto), pdfs = files.filter(f => !esFoto(f));
    if (fotos.length > 1) { setError(null); setDudaFotos({ fotos, pdfs }); return; }
    subir(tareasDe(pdfs, fotos, false));
  }, [subir]);

  const rechazados = useCallback((r: FileRejection[]) => {
    const codes = r.flatMap(x => x.errors.map(e => e.code));
    setError(codes.includes('too-many-files') ? `Demasiados archivos. Mete como mucho ${MAX} de una vez y luego el resto.`
      : codes.includes('file-too-large') ? 'Alguno de los archivos pesa más de 20 MB. Escanéalo con menos calidad o en varias partes.'
      : codes.includes('file-invalid-type') ? 'Solo valen PDF o fotos (JPG o PNG).'
      : 'No se pudieron coger esos archivos. Vuelve a elegirlos.');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: elegidos, onDropRejected: rechazados, accept: ACCEPTED, maxFiles: MAX, maxSize: 20 * 1024 * 1024, disabled: subiendo,
  });

  // ── ¿Las fotos son hojas del mismo albarán o albaranes distintos? ──
  if (dudaFotos) {
    const n = dudaFotos.fotos.length;
    return (
      <div className="sv">
        <p className="sv-pregunta">Has elegido <b>{n} fotos</b>. ¿Qué son?</p>
        <button className="sv-opcion" onClick={() => { const d = dudaFotos; setDudaFotos(null); subir(tareasDe(d.pdfs, d.fotos, false)); }}>
          <Copy size={22} />
          <span><b>{n} albaranes distintos</b><small>Una foto de cada albarán</small></span>
        </button>
        <button className="sv-opcion" disabled={n > MAX_HOJAS} onClick={() => { const d = dudaFotos; setDudaFotos(null); subir(tareasDe(d.pdfs, d.fotos, true)); }}>
          <FileText size={22} />
          <span><b>Un solo albarán de {n} hojas</b><small>{n > MAX_HOJAS ? `Un albarán admite como mucho ${MAX_HOJAS} fotos` : 'Las fotos son las hojas del mismo albarán'}</small></span>
        </button>
        {dudaFotos.pdfs.length > 0 && <p className="sv-nota">Además hay {dudaFotos.pdfs.length} PDF: cada uno es un albarán.</p>}
        <button className="btn btn-ghost sv-atras" onClick={() => setDudaFotos(null)}>Volver a elegir</button>
      </div>
    );
  }

  // ── Subiendo (o con alguno que falló) ──
  if (tareas) {
    const hechos = tareas.filter(t => t.estado === 'ok' || t.estado === 'repe').length;
    const mal = tareas.filter(t => t.estado === 'mal').length;
    return (
      <div className="sv">
        <p className="sv-pregunta" role="status">
          {subiendo ? <>Subiendo <b>{Math.min(hechos + 1, tareas.length)} de {tareas.length}</b>… no cierres esta ventana</>
            : mal ? <><b>{mal === 1 ? '1 no se pudo subir' : `${mal} no se pudieron subir`}</b>{hechos > 0 && <> · {hechos === 1 ? '1 subido' : `${hechos} subidos`}</>}</>
            : <>Subidos los {tareas.length}</>}
        </p>
        <div className="sv-barra" aria-hidden="true"><span style={{ width: `${Math.round(100 * hechos / tareas.length)}%` }} /></div>
        <ul className="sv-lista">
          {tareas.map((t, i) => (
            <li key={i} className={`sv-${t.estado}`}>
              <span className="sv-ico">
                {t.estado === 'subiendo' ? <span className="spinner spinner-sm" />
                  : t.estado === 'ok' || t.estado === 'repe' ? <Check size={16} strokeWidth={3} />
                  : t.estado === 'mal' ? <AlertTriangle size={16} /> : null}
              </span>
              <span className="sv-nombre">{t.nombre}</span>
              <span className="sv-estado">
                {t.estado === 'cola' ? 'En cola' : t.estado === 'subiendo' ? 'Subiendo…' : t.estado === 'ok' ? 'Subido'
                  : t.estado === 'repe' ? 'Ya estaba subido' : t.detalle}
              </span>
            </li>
          ))}
        </ul>
        {!subiendo && mal > 0 && (
          <div className="sv-botones">
            <button className="btn btn-primary" onClick={() => subir(tareas.map(t => ({ ...t })))}>Reintentar {mal === 1 ? 'el que falló' : `los ${mal} que fallaron`}</button>
            {subidos.current.length > 0 && <button className="btn btn-ghost" onClick={() => onVarios(subidos.current)}>Seguir con los subidos</button>}
          </div>
        )}
      </div>
    );
  }

  // ── Elegir ──
  return (
    <div className="sv">
      <div className="camera-capture-btn" style={{ display: 'flex', gap: 8 }}>
        <button className="btn-camera" type="button" style={{ flex: 1 }} onClick={() => camara.current?.click()}><Camera size={19} /> Hacer foto</button>
        <button className="btn-camera" type="button" style={{ flex: 1 }} onClick={() => galeria.current?.click()}><Images size={19} /> Elegir fotos</button>
        <input ref={camara} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; elegidos(f); }} />
        <input ref={galeria} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; elegidos(f); }} />
      </div>
      <div {...getRootProps()} className={`upload-zone${isDragActive ? ' active' : ''}`}>
        <input {...getInputProps()} />
        <div style={{ marginBottom: 12, color: 'var(--cf-bosque)', display: 'flex', justifyContent: 'center' }}><UploadCloud size={40} strokeWidth={1.6} /></div>
        {isDragActive
          ? <p className="sv-zona-tit">Suéltalos aquí</p>
          : <>
            <p className="sv-zona-tit">Arrastra aquí los albaranes o pulsa para elegirlos</p>
            <p className="sv-zona-sub">Uno o un montón a la vez (hasta {MAX}). Cada PDF es un albarán: la app mira de qué proveedor es y lo guarda sola en su carpeta de Drive.</p>
          </>}
      </div>
      {error && <div className="doc-aviso error" style={{ marginBottom: 0 }}>{error}</div>}
    </div>
  );
}
