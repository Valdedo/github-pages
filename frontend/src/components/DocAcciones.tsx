import { useState } from 'react';
import { FileSpreadsheet, Tag, FileText, MoreHorizontal, Minus, Plus, Check, RefreshCw, Trash2, Calculator } from 'lucide-react';
import {
  downloadTreyFact, downloadLabels, downloadPriceList, downloadExcel, downloadPdfReport,
  reprocessDocument, recalculateArticles, marcarTerminado,
} from '../api/client';
import type { Document, Supplier } from '../types/index';

interface Props {
  document: Document;
  suppliers: Supplier[];
  selectedArticleIds: number[];
  onChanged: (d: Partial<Document>) => void;
  onReload: () => void;
  onReprocessed: () => void;
  onDelete: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/** Una sola barra con lo que se hace con un albarán: TreyFACT, etiquetas, listín y «Más». */
export function DocAcciones({ document: doc, suppliers, selectedArticleIds, onChanged, onReload, onReprocessed, onDelete, onToast }: Props) {
  const [copias, setCopias] = useState(1);
  const [mas, setMas] = useState(false);
  const [proveedor, setProveedor] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const terminado = !!doc.terminado_at;
  const hay = selectedArticleIds.length;

  const hacer = (key: string, fn: () => void, msg: string) => {
    if (ocupado) return;
    setOcupado(key); fn(); onToast(msg, 'info');
    setTimeout(() => setOcupado(null), 2000);
  };

  const treyfact = () => {
    hacer('tf', () => downloadTreyFact(doc.id), 'Descargando el archivo para TreyFACT…');
    if (!terminado) setTimeout(onReload, 2500); // el servidor lo marca como terminado
  };
  const cambiarTerminado = async () => {
    try {
      const { data } = await marcarTerminado(doc.id, !terminado);
      onChanged({ terminado_at: data.terminado_at });
      onToast(data.terminado_at ? 'Albarán marcado como terminado' : 'El albarán vuelve a pendientes', 'success');
    } catch { onToast('No se pudo guardar', 'error'); }
  };
  const releer = async () => {
    if (!window.confirm('¿Volver a leer el albarán? Se pierden los cambios hechos a mano en los artículos (precios, márgenes, códigos…).')) return;
    setOcupado('rp');
    try {
      await reprocessDocument(doc.id, proveedor ? Number(proveedor) : undefined);
      onReprocessed(); onToast('Leyendo el albarán otra vez…', 'info'); setMas(false);
    } catch { onToast('No se pudo volver a leer', 'error'); } finally { setOcupado(null); }
  };
  const recalcular = async () => {
    setOcupado('rc');
    try { await recalculateArticles(doc.id); onReload(); onToast('Precios recalculados con los márgenes de Ajustes', 'success'); }
    catch { onToast('No se pudieron recalcular', 'error'); } finally { setOcupado(null); }
  };

  return (
    <section className="card doc-acciones" aria-label="Qué hacer con este albarán">
      <div className="doc-acciones-fila">
        <button className="btn btn-primary" onClick={treyfact} disabled={!!ocupado}>
          <FileSpreadsheet size={18} /> {ocupado === 'tf' ? 'Descargando…' : 'Pasar a TreyFACT'}
        </button>
        <div className="doc-etiquetas">
          <button className="btn btn-ghost" disabled={!!ocupado}
            onClick={() => hacer('lb', () => downloadLabels(doc.id, hay ? selectedArticleIds : undefined, copias), 'Preparando las etiquetas…')}>
            <Tag size={17} /> {hay ? `Etiquetas de ${hay}` : 'Etiquetas'}
          </button>
          <span className="doc-copias" aria-label="Copias de cada etiqueta">
            <button onClick={() => setCopias(c => Math.max(1, c - 1))} aria-label="Una copia menos"><Minus size={15} /></button>
            <b>{copias}</b><small>{copias === 1 ? 'copia' : 'copias'}</small>
            <button onClick={() => setCopias(c => Math.min(20, c + 1))} aria-label="Una copia más"><Plus size={15} /></button>
          </span>
        </div>
        <button className="btn btn-ghost" disabled={!!ocupado} onClick={() => hacer('pl', () => downloadPriceList(doc.id), 'Preparando el listín…')}>
          <FileText size={17} /> Listín
        </button>
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
            <button className="btn btn-ghost btn-sm" onClick={() => hacer('xl', () => downloadExcel(doc.id), 'Descargando Excel…')}><FileSpreadsheet size={15} /> Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={() => hacer('pdf', () => downloadPdfReport(doc.id), 'Descargando el informe…')}><FileText size={15} /> Informe PDF</button>
            <button className="btn btn-ghost btn-sm" onClick={recalcular} disabled={!!ocupado}><Calculator size={15} /> Recalcular con los márgenes de Ajustes</button>
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
