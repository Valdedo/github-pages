import { useState } from 'react';
import { FileSpreadsheet, Tag, FileText, MoreHorizontal, Minus, Plus, Check, RefreshCw, Trash2, Calculator } from 'lucide-react';
import { reprocessDocument, recalculateArticles, marcarTerminado } from '../api/client';
import { descargar, mensajeError, rutaTreyFact, rutaEtiquetas, rutaListin, rutaExcel, rutaInforme } from '../lib/descargas';
import type { Document, Supplier } from '../types/index';

interface Props {
  document: Document;
  suppliers: Supplier[];
  selectedArticleIds: number[];
  /** Artículos del albarán: sin artículos (o con error) no hay nada que descargar. */
  articleCount: number;
  onChanged: (d: Partial<Document>) => void;
  onReload: () => void;
  onReprocessed: () => void;
  onDelete: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/** Una sola barra con lo que se hace con un albarán: TreyFACT, etiquetas, listín y «Más». */
export function DocAcciones({ document: doc, suppliers, selectedArticleIds, articleCount, onChanged, onReload, onReprocessed, onDelete, onToast }: Props) {
  const [copias, setCopias] = useState(1);
  const [mas, setMas] = useState(false);
  const [proveedor, setProveedor] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const terminado = !!doc.terminado_at;
  const hay = selectedArticleIds.length;
  // Con error o sin artículos no se puede sacar nada: el servidor contestaría con un error
  const descargable = doc.status === 'completed' && articleCount > 0;

  const hacer = async (key: string, ruta: string, nombre: string, msg: string) => {
    if (ocupado) return;
    setOcupado(key);
    const p = descargar(ruta, nombre); // sin await antes: en iPhone la ventana se abre en el mismo toque
    onToast(msg, 'info');
    try { await p; return true; }
    catch (e) { onToast(e instanceof Error ? e.message : 'No se pudo descargar', 'error'); return false; }
    finally { setOcupado(null); }
  };

  const treyfact = async () => {
    const ok = await hacer('tf', rutaTreyFact(doc.id), `treyfact_${doc.id}.xlsx`, 'Preparando el archivo para TreyFACT…');
    if (ok && !terminado) {
      // Bajar el archivo de TreyFACT da el albarán por terminado (el servidor ya no lo hace solo en la descarga)
      try { const { data } = await marcarTerminado(doc.id, true); onChanged({ terminado_at: data.terminado_at }); }
      catch { onReload(); }
    }
  };
  const cambiarTerminado = async () => {
    try {
      const { data } = await marcarTerminado(doc.id, !terminado);
      onChanged({ terminado_at: data.terminado_at });
      onToast(data.terminado_at ? 'Albarán marcado como terminado' : 'El albarán vuelve a pendientes', 'success');
    } catch (e) { onToast(mensajeError(e), 'error'); }
  };
  const releer = async () => {
    if (!window.confirm('¿Volver a leer el albarán? Se pierden los cambios hechos a mano en los artículos (precios, márgenes, códigos…).')) return;
    setOcupado('rp');
    try {
      await reprocessDocument(doc.id, proveedor ? Number(proveedor) : undefined);
      onReprocessed(); onToast('Leyendo el albarán otra vez…', 'info'); setMas(false);
    } catch (e) { onToast(mensajeError(e, 'No se pudo volver a leer'), 'error'); } finally { setOcupado(null); }
  };
  const recalcular = async () => {
    setOcupado('rc');
    try { await recalculateArticles(doc.id); onReload(); onToast('Precios recalculados con los márgenes de Ajustes', 'success'); }
    catch (e) { onToast(mensajeError(e, 'No se pudieron recalcular'), 'error'); } finally { setOcupado(null); }
  };

  return (
    <section className="card doc-acciones" aria-label="Qué hacer con este albarán">
      <div className="doc-acciones-fila">
        {descargable ? (<>
        <button className="btn btn-primary" onClick={treyfact} disabled={!!ocupado}>
          <FileSpreadsheet size={18} /> {ocupado === 'tf' ? 'Preparando…' : 'Pasar a TreyFACT'}
        </button>
        <div className="doc-etiquetas">
          <button className="btn btn-ghost" disabled={!!ocupado}
            onClick={() => hacer('lb', rutaEtiquetas(doc.id, hay ? selectedArticleIds : undefined, copias), `etiquetas_${doc.id}.pdf`, 'Preparando las etiquetas…')}>
            <Tag size={17} /> {ocupado === 'lb' ? 'Preparando…' : hay ? `Etiquetas de ${hay}` : 'Etiquetas'}
          </button>
          <span className="doc-copias" aria-label="Copias de cada etiqueta">
            <button onClick={() => setCopias(c => Math.max(1, c - 1))} aria-label="Una copia menos"><Minus size={15} /></button>
            <b>{copias}</b><small>{copias === 1 ? 'copia' : 'copias'}</small>
            <button onClick={() => setCopias(c => Math.min(20, c + 1))} aria-label="Una copia más"><Plus size={15} /></button>
          </span>
        </div>
        <button className="btn btn-ghost" disabled={!!ocupado} onClick={() => hacer('pl', rutaListin(doc.id), `listin_${doc.id}.pdf`, 'Preparando el listín…')}>
          <FileText size={17} /> {ocupado === 'pl' ? 'Preparando…' : 'Listín'}
        </button>
        </>) : (
          <span className="doc-sin-acciones">
            {doc.status === 'error'
              ? 'Este albarán no se pudo leer: hasta que tenga artículos no se puede pasar a TreyFACT ni sacar etiquetas.'
              : 'Este albarán no tiene artículos: añádelos abajo o vuelve a leerlo desde «Más» para poder pasarlo a TreyFACT y sacar etiquetas.'}
          </span>
        )}
        <button className={`doc-terminado${terminado ? ' on' : ''}`} onClick={cambiarTerminado}
          title={terminado ? 'Quitar la marca de terminado' : 'Marcar como revisado y pasado a TreyFACT'}>
          <span className="box">{terminado && <Check size={14} strokeWidth={3} />}</span>
          {terminado ? 'Terminado' : 'Marcar terminado'}
        </button>
        <button className="btn btn-ghost doc-mas-btn" onClick={() => setMas(v => !v)} aria-expanded={mas}>
          <MoreHorizontal size={18} /> Más
        </button>
      </div>

      {mas && (
        <div className="doc-mas cf-enter">
          <div className="doc-mas-grupo">
            {descargable && <>
              <button className="btn btn-ghost btn-sm" disabled={!!ocupado} onClick={() => hacer('xl', rutaExcel(doc.id), `albaran_${doc.id}.xlsx`, 'Preparando el Excel…')}><FileSpreadsheet size={15} /> Excel</button>
              <button className="btn btn-ghost btn-sm" disabled={!!ocupado} onClick={() => hacer('pdf', rutaInforme(doc.id), `albaran_${doc.id}.pdf`, 'Preparando el informe…')}><FileText size={15} /> Informe PDF</button>
            </>}
            {articleCount > 0 && <button className="btn btn-ghost btn-sm" onClick={recalcular} disabled={!!ocupado}><Calculator size={15} /> Recalcular con los márgenes de Ajustes</button>}
          </div>
          <div className="doc-mas-grupo">
            <span className="doc-mas-txt">¿Ha leído mal el albarán? Vuelve a leerlo (se pierden los cambios a mano).</span>
            {suppliers.length > 0 && (
              <select className="form-input" value={proveedor} onChange={e => setProveedor(e.target.value)} aria-label="Proveedor">
                <option value="">Proveedor: que lo detecte solo</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button className="btn btn-ghost btn-sm" onClick={releer} disabled={!!ocupado}><RefreshCw size={15} /> Volver a leer</button>
          </div>
          <div className="doc-mas-grupo">
            <button className="btn btn-danger btn-sm" onClick={onDelete}><Trash2 size={15} /> Borrar albarán</button>
          </div>
        </div>
      )}
    </section>
  );
}
