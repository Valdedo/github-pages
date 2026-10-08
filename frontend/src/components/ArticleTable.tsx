import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { updateArticle, deleteArticle, createArticle, bulkDeleteArticles, bulkUpdateMargin, listArticles } from '../api/client';
import { useConfirm } from './ConfirmModal';
import { borrarArticuloYa, mensajeError } from '../lib/descargas';
import type { Article } from '../types/index';

const NUMERICOS = ['cantidad', 'precio_unitario_bruto', 'descuento_1', 'descuento_2', 'descuento_3', 'descuento_4', 'iva_pct', 'recargo_pct', 'margen_pct'];
const OPCIONALES = ['descuento_1', 'descuento_2', 'descuento_3', 'descuento_4', 'recargo_pct'];

/** «12,50» o «12.50» → 12.5; vacío → null; texto → NaN */
const leerNumero = (raw: string): number | null => {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  const limpio = /,\d+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  return /^-?\d*\.?\d+$/.test(limpio) ? parseFloat(limpio) : NaN;
};

/** Comprueba un dato antes de mandarlo. Devuelve el mensaje de error o null si está bien. */
function validateField(field: string, value: number | null): string | null {
  if (value !== null && isNaN(value)) return 'Escribe solo un número (por ejemplo 12,50)';
  if (value === null) {
    if (OPCIONALES.includes(field)) return null;
    if (field === 'cantidad') return 'Escribe la cantidad (tiene que ser mayor que 0)';
    if (field === 'precio_unitario_bruto') return 'Escribe el precio de compra';
    if (field === 'margen_pct') return 'Escribe el margen en %';
    return 'Este dato no puede quedar vacío';
  }
  if (field === 'cantidad' && value <= 0) return 'La cantidad tiene que ser mayor que 0';
  if (field === 'precio_unitario_bruto' && value < 0) return 'El precio de compra no puede ser negativo';
  if (['descuento_1','descuento_2','descuento_3','descuento_4'].includes(field) && (value < 0 || value > 100))
    return 'El descuento tiene que estar entre 0 y 100 %';
  if (field === 'iva_pct' && ![0,4,5,10,21].includes(value)) return 'El IVA tiene que ser 0, 4, 5, 10 o 21 %';
  if (field === 'margen_pct' && (value < 0 || value > 500)) return 'El margen tiene que estar entre 0 y 500 %';
  return null;
}

/** Comprueba un PVP con IVA para un artículo; devuelve el error o el margen resultante. */
function revisarPvp(art: Article, pvp: number | null): { error: string } | { margen: number } {
  if (pvp === null || isNaN(pvp)) return { error: 'Escribe el precio de venta con IVA (por ejemplo 24,90)' };
  if (pvp <= 0) return { error: 'El precio de venta tiene que ser mayor que 0' };
  if (!art.coste_neto_unitario || art.coste_neto_unitario <= 0)
    return { error: 'Este artículo no tiene coste (precio de compra 0). Pon primero el precio de compra para poder fijar el precio de venta.' };
  const sin = pvp / (1 + (art.iva_pct ?? 21) / 100);
  const margen = (sin / art.coste_neto_unitario - 1) * 100;
  if (margen < 0) return { error: `Ese precio está por debajo del coste (${art.coste_neto_unitario.toFixed(2)} € sin IVA): perderías dinero` };
  return { margen };
}

interface Props {
  documentId: number;
  articles: Article[];
  onArticlesChanged: (articles: Article[]) => void;
  onSelectedIdsChange?: (ids: number[]) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  verifiedIds?: Set<number>;
  onVerify?: (id: number) => void;
}

const fmt = (n: number | undefined | null, digits = 2) =>
  n == null ? '—' : n.toFixed(digits);

const fmtEur = (n: number | undefined | null) =>
  n == null ? '—' : `${n.toFixed(2)} €`;

function EditableCell({
  value: initialValue,
  onSave,
  type = 'text',
  width,
}: {
  value: string | number | null | undefined;
  onSave: (v: string) => void;
  type?: string;
  width?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(initialValue ?? ''));

  useEffect(() => { setVal(String(initialValue ?? '')); }, [initialValue]);

  const commit = () => {
    setEditing(false);
    if (val !== String(initialValue ?? '')) onSave(val);
  };

  if (!editing) {
    return (
      <span
        onClick={() => { setVal(String(initialValue ?? '')); setEditing(true); }}
        className="celda-editable"
        style={{ minWidth: width ? `${width}px` : undefined }}
        title="Pulsa para cambiar"
      >
        {initialValue == null || initialValue === '' ? <em style={{ color: '#bbb' }}>—</em> : initialValue}
      </span>
    );
  }

  return (
    <input
      autoFocus type={type} value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      style={{ width: width ? `${width}px` : '90px', padding: '2px 4px', border: '1px solid var(--primary)', borderRadius: '3px', fontSize: '13px' }}
    />
  );
}

const ch = createColumnHelper<Article>();

export function ArticleTable({ documentId, articles, onArticlesChanged, onSelectedIdsChange, onToast, verifiedIds, onVerify }: Props) {
  const [saving, setSaving] = useState<number | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [bulkMarginModal, setBulkMarginModal] = useState(false);
  const [bulkMarginValue, setBulkMarginValue] = useState('');
  const [bulkWorking, setBulkWorking] = useState(false);
  // Borrado pendiente (5 s para deshacer). Si se sale antes, se borra igualmente.
  const [undoQueue, setUndoQueue] = useState<{ id: number; article: Article } | null>(null);
  const pendienteRef = useRef<{ id: number; article: Article; timer: ReturnType<typeof setTimeout> } | null>(null);
  const articlesRef = useRef(articles);
  articlesRef.current = articles;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pvpEditId, setPvpEditId] = useState<number | null>(null);
  const [pvpEditValue, setPvpEditValue] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // Debounced search — wait 250ms after user stops typing
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(search), 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Warn before closing if a save is in progress
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saving) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saving]);

  // Si se sale de la página (o se cierra la app) con un borrado pendiente, se hace ya.
  useEffect(() => {
    const hacerYa = () => {
      const p = pendienteRef.current;
      if (!p) return;
      clearTimeout(p.timer);
      pendienteRef.current = null;
      borrarArticuloYa(p.id);
    };
    window.addEventListener('pagehide', hacerYa);
    return () => { window.removeEventListener('pagehide', hacerYa); hacerYa(); };
  }, []);

  const filtered = useMemo(() => {
    if (!searchDebounced.trim()) return articles;
    const q = searchDebounced.toLowerCase();
    return articles.filter(a =>
      (a.descripcion || '').toLowerCase().includes(q) ||
      (a.codigo_principal || '').toLowerCase().includes(q) ||
      (a.ean || '').includes(searchDebounced)
    );
  }, [articles, searchDebounced]);

  // Notify parent when selection changes
  useEffect(() => {
    onSelectedIdsChange?.([...selectedIds]);
  }, [selectedIds]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(a => a.id)));
    }
  };

  /** Guarda un dato de un artículo. Devuelve true si se guardó. */
  const handleUpdate = useCallback(async (id: number, field: string, rawValue: string): Promise<boolean> => {
    let value: string | number | null = rawValue;
    if (NUMERICOS.includes(field)) {
      value = leerNumero(rawValue);
      const err = validateField(field, value);
      if (err) { onToast?.(err, 'error'); return false; }
    } else if (field === 'descripcion' && !rawValue.trim()) {
      onToast?.('La descripción no puede quedar vacía', 'error'); return false;
    }
    if (field === 'margen_pct' && value === 0) {
      onToast?.('Atención: margen 0% significa vender al precio de coste, sin beneficio.', 'info');
    }
    setSaving(id);
    try {
      if (field === 'margen_pct' && value !== null) {
        const { data } = await updateArticle(id, { margen_pct: value as number, margen_override: true });
        onArticlesChanged(articlesRef.current.map(a => a.id === id ? data : a));
        onToast?.('Margen actualizado');
        return true;
      }
      const { data } = await updateArticle(id, { [field]: typeof value === 'string' ? value.trim() : value });
      onArticlesChanged(articlesRef.current.map(a => a.id === id ? data : a));
      onToast?.('Guardado');
      return true;
    } catch (err) {
      onToast?.(mensajeError(err), 'error');
      return false;
    } finally {
      setSaving(null);
    }
  }, [onArticlesChanged, onToast]);

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    const ok = await confirm({
      title: `Eliminar ${ids.length} artículo${ids.length > 1 ? 's' : ''}`,
      message: 'Esta acción no se puede deshacer. ¿Continuar?',
      confirmLabel: 'Eliminar todos',
      danger: true,
    });
    if (!ok) return;
    setBulkWorking(true);
    try {
      await bulkDeleteArticles(ids);
      setSelectedIds(new Set());
      onArticlesChanged(articlesRef.current.filter(a => !ids.includes(a.id)));
      onToast?.(`${ids.length} artículo${ids.length > 1 ? 's' : ''} eliminado${ids.length > 1 ? 's' : ''}`, 'info');
    } catch (e) {
      onToast?.(mensajeError(e, 'No se pudieron eliminar'), 'error');
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkMargin = async () => {
    const pct = leerNumero(bulkMarginValue);
    if (pct === null || isNaN(pct) || pct < 0 || pct > 500) { onToast?.('Escribe un margen entre 0 y 500 %', 'error'); return; }
    const ids = [...selectedIds];
    setBulkWorking(true);
    try {
      await bulkUpdateMargin(ids, pct);
      // Reload all articles so pvp_sin_iva / pvp_con_iva reflect recalculated values
      const { data: refreshed } = await listArticles(documentId);
      onArticlesChanged(refreshed);
      setBulkMarginModal(false);
      setBulkMarginValue('');
      onToast?.(`Margen ${pct}% aplicado a ${ids.length} artículo${ids.length > 1 ? 's' : ''}`, 'success');
    } catch (e) {
      onToast?.(mensajeError(e, 'No se pudieron cambiar los márgenes'), 'error');
    } finally {
      setBulkWorking(false);
    }
  };

  const handlePvpOverride = async (article: Article, raw: string): Promise<boolean> => {
    const r = revisarPvp(article, leerNumero(raw));
    if ('error' in r) { onToast?.(r.error, 'error'); return false; }
    setSaving(article.id);
    try {
      const { data } = await updateArticle(article.id, { margen_pct: Math.round(r.margen * 100) / 100, margen_override: true });
      onArticlesChanged(articlesRef.current.map(a => a.id === article.id ? data : a));
      setPvpEditId(null);
      onToast?.(`Precio fijado — margen resultante: ${r.margen.toFixed(1)}%`);
      return true;
    } catch (e) {
      onToast?.(mensajeError(e), 'error');
      return false;
    } finally {
      setSaving(null);
    }
  };

  const handleResetMargin = async (article: Article) => {
    setSaving(article.id);
    try {
      const { data } = await updateArticle(article.id, { margen_override: false });
      onArticlesChanged(articlesRef.current.map(a => a.id === article.id ? data : a));
      onToast?.('Margen restablecido');
    } catch (e) {
      onToast?.(mensajeError(e), 'error');
    } finally {
      setSaving(null);
    }
  };

  /** Hace ya el borrado que estaba esperando por si se deshacía. */
  const confirmarPendiente = async () => {
    const p = pendienteRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendienteRef.current = null;
    setUndoQueue(null);
    try { await deleteArticle(p.id); }
    catch (e) {
      const st = (e as { response?: { status?: number } })?.response?.status;
      if (st === 404) return; // ya estaba borrado
      onArticlesChanged([...articlesRef.current, p.article].sort((a, b) => a.line_number - b.line_number));
      onToast?.(`No se pudo borrar «${p.article.descripcion}»: ${mensajeError(e, 'error')}`, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: 'Eliminar artículo',
      message: '¿Eliminar este artículo? Puedes deshacer durante 5 segundos.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;

    const article = articlesRef.current.find(a => a.id === id);
    if (!article) return;
    // Si había otro borrado esperando, se hace ya (solo un «Deshacer» a la vez)
    await confirmarPendiente();
    onArticlesChanged(articlesRef.current.filter(a => a.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setExpandedCardId(null);

    const timer = setTimeout(() => { confirmarPendiente(); }, 5000);
    pendienteRef.current = { id, article, timer };
    setUndoQueue({ id, article });
  };

  const handleUndo = () => {
    const p = pendienteRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendienteRef.current = null;
    onArticlesChanged([...articlesRef.current, p.article].sort((a, b) => a.line_number - b.line_number));
    setUndoQueue(null);
    onToast?.('Eliminación deshecha', 'success');
  };

  const crearArticulo = async (datos: Partial<Article>) => {
    const { data } = await createArticle({
      document_id: documentId,
      line_number: Math.max(0, ...articlesRef.current.map(a => a.line_number || 0)) + 1,
      ...datos,
    });
    onArticlesChanged([...articlesRef.current, data]);
    setNuevo(false);
    onToast?.('Artículo añadido', 'success');
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filtered.length;

  const columns = [
    ch.display({
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected; }}
          onChange={toggleAll}
          style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
        />
      ),
      size: 36,
      cell: info => (
        <input
          type="checkbox"
          checked={selectedIds.has(info.row.original.id)}
          onChange={() => toggleSelect(info.row.original.id)}
          style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
        />
      ),
    }),
    ch.accessor('line_number', {
      header: '#', size: 36,
      cell: info => <span style={{ color: 'var(--grey-500)', fontSize: '12px' }}>{info.getValue()}</span>,
    }),
    ch.accessor('descripcion', {
      header: 'Descripción', size: 220, enableSorting: true,
      cell: info => <EditableCell value={info.getValue()} onSave={v => handleUpdate(info.row.original.id, 'descripcion', v)} width={210} />,
    }),
    ch.accessor('cantidad', {
      header: 'Cant.', size: 60, enableSorting: true,
      cell: info => <EditableCell value={info.getValue()} onSave={v => handleUpdate(info.row.original.id, 'cantidad', v)} type="number" width={52} />,
    }),
    ch.accessor('precio_unitario_bruto', {
      header: 'P. Bruto', size: 80,
      cell: info => <EditableCell value={fmt(info.getValue(), 4)} onSave={v => handleUpdate(info.row.original.id, 'precio_unitario_bruto', v)} type="number" width={70} />,
    }),
    ch.accessor('descuento_1', {
      header: 'Dto1%', size: 60,
      cell: info => <EditableCell value={info.getValue() ?? ''} onSave={v => handleUpdate(info.row.original.id, 'descuento_1', v)} type="number" width={50} />,
    }),
    ch.accessor('descuento_2', {
      header: 'Dto2%', size: 60,
      cell: info => <EditableCell value={info.getValue() ?? ''} onSave={v => handleUpdate(info.row.original.id, 'descuento_2', v)} type="number" width={50} />,
    }),
    ch.accessor('descuento_3', {
      header: 'Dto3%', size: 60,
      cell: info => <EditableCell value={info.getValue() ?? ''} onSave={v => handleUpdate(info.row.original.id, 'descuento_3', v)} type="number" width={50} />,
    }),
    ch.accessor('descuento_4', {
      header: 'Dto4%', size: 60,
      cell: info => <EditableCell value={info.getValue() ?? ''} onSave={v => handleUpdate(info.row.original.id, 'descuento_4', v)} type="number" width={50} />,
    }),
    ch.accessor('coste_neto_unitario', {
      header: 'Coste neto', size: 90, enableSorting: true,
      cell: info => <span style={{ fontWeight: 600, color: 'var(--grey-700)' }}>{fmtEur(info.getValue())}</span>,
    }),
    ch.accessor('iva_pct', {
      header: 'IVA%', size: 60,
      cell: info => <EditableCell value={info.getValue()} onSave={v => handleUpdate(info.row.original.id, 'iva_pct', v)} type="number" width={50} />,
    }),
    ch.accessor('margen_pct', {
      header: 'Margen%', size: 90, enableSorting: true,
      cell: info => {
        const art = info.row.original;
        return (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <EditableCell value={fmt(info.getValue(), 1)} onSave={v => handleUpdate(art.id, 'margen_pct', v)} type="number" width={46} />
            {art.margen_override && (
              <button onClick={() => handleResetMargin(art)} title="Restablecer margen automático"
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '3px', padding: '1px 5px', cursor: 'pointer', fontSize: '10px' }}>↺</button>
            )}
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: art.margen_override ? 'var(--accent)' : 'var(--success)', display: 'inline-block' }}
              title={art.margen_override ? 'Margen manual' : 'Margen automático'} />
          </div>
        );
      },
    }),
    ch.accessor('pvp_sin_iva', {
      header: 'PVP s/IVA', size: 90, enableSorting: true,
      cell: info => <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmtEur(info.getValue())}</span>,
    }),
    ch.accessor('pvp_con_iva', {
      header: 'PVP c/IVA ✎', size: 100, enableSorting: true,
      cell: info => {
        const art = info.row.original;
        const isOpen = pvpEditId === art.id;
        return (
          <button
            onClick={() => {
              if (isOpen) { setPvpEditId(null); return; }
              setPvpEditId(art.id);
              setPvpEditValue(art.pvp_con_iva != null ? art.pvp_con_iva.toFixed(2) : '');
            }}
            title="Clic para fijar precio de venta manualmente"
            style={{
              color: '#fff', background: isOpen ? 'var(--brand-dark)' : 'var(--brand)',
              padding: '2px 7px', borderRadius: '5px', fontWeight: 700, fontSize: '13px',
              border: 'none', cursor: 'pointer',
            }}
          >
            {fmtEur(info.getValue())} {isOpen ? '▲' : '▼'}
          </button>
        );
      },
    }),
    ch.accessor('codigo_principal', {
      header: 'Código', size: 100,
      cell: info => <EditableCell value={info.getValue() ?? ''} onSave={v => handleUpdate(info.row.original.id, 'codigo_principal', v)} width={88} />,
    }),
    ch.accessor('ean', {
      header: 'EAN', size: 110,
      cell: info => <EditableCell value={info.getValue() ?? ''} onSave={v => handleUpdate(info.row.original.id, 'ean', v)} width={100} />,
    }),
    ch.display({
      id: 'actions', header: '', size: 50,
      cell: info => {
        const id = info.row.original.id;
        return (
          <button onClick={() => handleDelete(id)}
            className="btn btn-danger btn-sm" title="Eliminar artículo" aria-label="Eliminar artículo">
            ✕
          </button>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: filtered,
    columns,
    state: {
      sorting,
      // Los descuentos 2, 3 y 4 casi nunca vienen: la columna solo sale si algún artículo los tiene
      columnVisibility: {
        descuento_2: articles.some(a => a.descuento_2),
        descuento_3: articles.some(a => a.descuento_3),
        descuento_4: articles.some(a => a.descuento_4),
      },
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Móvil: tarjetas; al tocar una se abre su ficha para cambiar cualquier dato
  const MobileCards = () => (
    <div className="article-cards">
      {filtered.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--grey-500)' }}>
          {searchDebounced ? 'No hay artículos que coincidan.' : 'Sin artículos. Vuelve a leer el albarán o añádelos con «+ Añadir artículo».'}
        </div>
      ) : filtered.map(a => {
        const isExpanded = expandedCardId === a.id;
        const isVerified = verifiedIds?.has(a.id) ?? false;
        return (
          <div key={a.id} className="art-tarjeta" style={{
            borderLeft: isVerified ? '4px solid #22c55e' : verifiedIds ? '4px solid transparent' : undefined,
            background: isVerified ? '#f0fdf4' : isExpanded ? 'var(--brand-pale)' : selectedIds.has(a.id) ? '#fff8e1' : 'var(--surface)',
          }}>
            {/* Cabecera — tocar abre la ficha */}
            <div className="art-tarjeta-cab" onClick={verifiedIds ? () => onVerify?.(a.id) : () => setExpandedCardId(isExpanded ? null : a.id)}
              role="button" aria-expanded={isExpanded}>
              {verifiedIds ? (
                <span className={`art-verif${isVerified ? ' on' : ''}`}>{isVerified ? '✓' : ''}</span>
              ) : (
                <input type="checkbox" checked={selectedIds.has(a.id)}
                  onChange={() => toggleSelect(a.id)}
                  onClick={e => e.stopPropagation()}
                  aria-label="Seleccionar"
                  style={{ accentColor: 'var(--primary)', flexShrink: 0 }}
                />
              )}
              <span className="art-tarjeta-desc">{a.descripcion || '—'}</span>
              <span className="art-tarjeta-pvp" style={{ background: a.margen_override ? 'var(--accent)' : 'var(--brand)' }}>
                {a.pvp_con_iva != null ? `${a.pvp_con_iva.toFixed(2)} €` : '—'}
              </span>
              {!verifiedIds && <span className="art-tarjeta-flecha">{isExpanded ? '▲' : '▼'}</span>}
            </div>

            {/* Datos */}
            <div className="art-tarjeta-meta">
              <span>Cant. <b>{a.cantidad ?? '—'}</b></span>
              <span>Coste <b className={!a.coste_neto_unitario ? 'art-sin-coste' : ''}>{a.coste_neto_unitario ? `${a.coste_neto_unitario.toFixed(2)} €` : 'sin coste'}</b></span>
              <span style={{ color: a.margen_override ? 'var(--accent)' : 'var(--success)' }}>
                Margen <b>{a.margen_pct != null ? `${a.margen_pct.toFixed(1)}%` : '—'}</b>{a.margen_override ? ' (a mano)' : ''}
              </span>
              {a.codigo_principal && <span>Ref. {a.codigo_principal}</span>}
              {a.ean && <span>EAN {a.ean}</span>}
            </div>

            {isExpanded && (
              <FichaArticulo
                key={a.id}
                art={a}
                guardando={saving === a.id}
                onUpdate={(campo, v) => handleUpdate(a.id, campo, v)}
                onPvp={v => handlePvpOverride(a, v)}
                onResetMargin={() => handleResetMargin(a)}
                onDelete={() => handleDelete(a.id)}
                onClose={() => setExpandedCardId(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {ConfirmDialog}
      {/* Undo banner */}
      {nuevo && <NuevoArticulo onCrear={crearArticulo} onCancelar={() => setNuevo(false)} onError={m => onToast?.(m, 'error')} />}
      {undoQueue && (
        <div className="art-deshacer" role="status">
          <span>Artículo eliminado</span>
          <button onClick={handleUndo}>Deshacer</button>
        </div>
      )}
    <div className="card">
      <div className="card-header art-cabecera">
        <span className="art-cabecera-tit">
          Artículos ({filtered.length}{filtered.length !== articles.length ? ` / ${articles.length}` : ''})
          {selectedIds.size > 0 && (
            <span className="badge badge-grey">{selectedIds.size} sel.</span>
          )}
          {saving && <span style={{ fontSize: '11px', color: 'var(--grey-500)', fontWeight: 400 }}>Guardando…</span>}
        </span>
        <div className="art-cabecera-acc">
          <input
            type="search"
            placeholder="Buscar descripción, código, EAN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="art-buscar"
            aria-label="Buscar artículos"
          />
          <button className="btn btn-success btn-sm" onClick={() => setNuevo(true)}>
            + Añadir artículo
          </button>
        </div>
      </div>

      {/* Bulk action bar — only visible when articles are selected */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
          padding: '8px 16px', background: '#fff8e1',
          borderBottom: '1px solid #ffe082',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#b45309' }}>
            {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}:
          </span>
          <button className="btn btn-accent btn-sm" onClick={() => setBulkMarginModal(true)} disabled={bulkWorking}>
            % Cambiar margen
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} disabled={bulkWorking}>
            {bulkWorking ? '…' : '✕ Eliminar seleccionados'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>
            Cancelar selección
          </button>
        </div>
      )}

      {/* Bulk margin modal */}
      {bulkMarginModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '320px', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: 'var(--primary)' }}>
              Cambiar margen a {selectedIds.size} artículo{selectedIds.size > 1 ? 's' : ''}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--grey-500)', margin: '0 0 16px' }}>
              Introduce el margen en % a aplicar. Se marcará como margen manual.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text" inputMode="decimal"
                placeholder="ej: 35"
                value={bulkMarginValue}
                onChange={e => setBulkMarginValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleBulkMargin(); if (e.key === 'Escape') setBulkMarginModal(false); }}
                autoFocus
                style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--grey-300)', borderRadius: '8px', fontSize: '15px', fontFamily: 'inherit' }}
              />
              <span style={{ fontSize: '16px', color: 'var(--grey-500)' }}>%</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setBulkMarginModal(false); setBulkMarginValue(''); }}>
                Cancelar
              </button>
              <button className="btn btn-success" onClick={handleBulkMargin} disabled={bulkWorking}>
                {bulkWorking ? 'Aplicando…' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="article-table-desktop" style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                  <th key={header.id}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    style={{
                      padding: '9px 8px',
                      background: 'var(--surface-2)',
                      color: 'var(--text-2)',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      fontSize: '12.5px',
                      minWidth: header.column.getSize(),
                      borderBottom: '1px solid var(--border)',
                      cursor: canSort ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && (
                        <span style={{ fontSize: '9px', opacity: sorted ? 1 : 0.3 }}>
                          {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '⇅'}
                        </span>
                      )}
                    </span>
                  </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: 'var(--grey-500)' }}>
                  {search ? 'No hay artículos que coincidan con la búsqueda.' : 'No se han detectado artículos. Usa "Reprocesar extracción" o añade artículos manualmente.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.flatMap((row, i) => {
                const isSelected = selectedIds.has(row.original.id);
                const isVerified = verifiedIds?.has(row.original.id) ?? false;
                const art = row.original;
                const rows = [(
                  <tr key={row.id} style={{
                    background: isVerified ? '#f0fdf4' : isSelected ? 'var(--brand-pale)' : (i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'),
                    borderLeft: isVerified ? '3px solid #22c55e' : verifiedIds ? '3px solid transparent' : undefined,
                    transition: 'background 0.2s',
                  }}>
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} style={{ padding: '5px 6px', borderBottom: pvpEditId === art.id ? 'none' : '1px solid var(--grey-200)', verticalAlign: 'middle' }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )];
                // PVP edit expansion row
                if (pvpEditId === art.id) {
                  rows.push(
                    <tr key={`pvp-edit-${art.id}`} style={{ background: 'var(--brand-pale)' }}>
                      <td colSpan={columns.length} style={{ padding: '10px 16px', borderBottom: '2px solid var(--brand-light)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand-dark)' }}>
                            Fijar PVP con IVA para: <em>{art.descripcion}</em>
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="text" inputMode="decimal"
                              value={pvpEditValue}
                              onChange={e => setPvpEditValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handlePvpOverride(art, pvpEditValue);
                                if (e.key === 'Escape') setPvpEditId(null);
                              }}
                              autoFocus
                              style={{ width: '90px', padding: '5px 8px', border: '2px solid var(--brand)', borderRadius: '6px', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit' }}
                            />
                            <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>€</span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                            Coste neto: {fmtEur(art.coste_neto_unitario)} · IVA {art.iva_pct ?? 21}%
                            {pvpEditValue.trim() && (() => {
                              const r = revisarPvp(art, leerNumero(pvpEditValue));
                              return 'error' in r ? <b style={{ color: 'var(--danger)' }}> — {r.error}</b> : ` → margen ${r.margen.toFixed(1)}%`;
                            })()}
                          </span>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={saving === art.id}
                            onClick={() => handlePvpOverride(art, pvpEditValue)}
                          >{saving === art.id ? '…' : 'Guardar'}</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setPvpEditId(null)}>Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return rows;
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="article-table-mobile">
        {MobileCards()}
      </div>

      <div style={{ padding: '8px 16px', fontSize: '11px', color: 'var(--grey-500)', background: 'var(--grey-100)', borderTop: '1px solid var(--grey-200)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', marginRight: '4px' }} />Margen automático</span>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', marginRight: '4px' }} />Margen manual (↺ para restablecer)</span>
        <span className="article-table-desktop">Pulsa un dato para cambiarlo · Enter para guardar · Esc para dejarlo como estaba</span>
        <span className="article-table-mobile" style={{ display: 'none' }}>Toca un artículo para cambiar su descripción, coste, precio o margen</span>
      </div>
    </div>
    </>
  );
}

const txt = (n: number | null | undefined, d?: number) => (n == null ? '' : d != null ? n.toFixed(d) : String(n));

/** Campo de la ficha que se guarda al salir de él (si cambió). Si no se puede guardar, vuelve a lo que había. */
function CampoFicha({ etiqueta, valor, onGuardar, tipo = 'decimal', sufijo, ayuda, multilinea }: {
  etiqueta: string; valor: string; onGuardar: (v: string) => Promise<boolean>;
  tipo?: 'decimal' | 'texto' | 'numerico'; sufijo?: string; ayuda?: React.ReactNode; multilinea?: boolean;
}) {
  const [v, setV] = useState(valor);
  useEffect(() => { setV(valor); }, [valor]);
  const guardar = async () => {
    if (v.trim() === valor.trim()) return;
    const ok = await onGuardar(v);
    if (!ok) setV(valor);
  };
  const props = {
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: guardar,
    className: 'art-ficha-input',
  };
  return (
    <label className="art-ficha-campo">
      <span className="art-ficha-et">{etiqueta}</span>
      <span className="art-ficha-fila">
        {multilinea
          ? <textarea rows={2} {...props} />
          : <input type={tipo === 'texto' ? 'text' : 'text'} inputMode={tipo === 'texto' ? 'text' : tipo === 'numerico' ? 'numeric' : 'decimal'}
              {...props} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}
        {sufijo && <span className="art-ficha-suf">{sufijo}</span>}
      </span>
      {ayuda && <span className="art-ficha-ayuda">{ayuda}</span>}
    </label>
  );
}

/** Ficha de un artículo en el móvil: todos sus datos se pueden cambiar aquí. */
function FichaArticulo({ art, guardando, onUpdate, onPvp, onResetMargin, onDelete, onClose }: {
  art: Article; guardando: boolean;
  onUpdate: (campo: string, v: string) => Promise<boolean>;
  onPvp: (v: string) => Promise<boolean>;
  onResetMargin: () => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [pvp, setPvp] = useState(txt(art.pvp_con_iva, 2));
  const [margen, setMargen] = useState(txt(art.margen_pct, 1));
  useEffect(() => { setPvp(txt(art.pvp_con_iva, 2)); setMargen(txt(art.margen_pct, 1)); }, [art.pvp_con_iva, art.margen_pct]);
  const r = pvp.trim() && pvp !== txt(art.pvp_con_iva, 2) ? revisarPvp(art, leerNumero(pvp)) : null;
  const sinCoste = !art.coste_neto_unitario || art.coste_neto_unitario <= 0;

  return (
    <div className="art-ficha">
      <CampoFicha etiqueta="Descripción" tipo="texto" multilinea valor={art.descripcion || ''} onGuardar={v => onUpdate('descripcion', v)} />

      <div className="art-ficha-2">
        <CampoFicha etiqueta="Precio de compra" sufijo="€" valor={txt(art.precio_unitario_bruto)} onGuardar={v => onUpdate('precio_unitario_bruto', v)} />
        <CampoFicha etiqueta="Descuento" sufijo="%" valor={txt(art.descuento_1)} onGuardar={v => onUpdate('descuento_1', v)} />
      </div>
      <div className={`art-ficha-coste${sinCoste ? ' mal' : ''}`}>
        {sinCoste
          ? 'Sin coste: pon el precio de compra para poder calcular el precio de venta.'
          : <>Coste por unidad (con descuentos, sin IVA): <b>{art.coste_neto_unitario.toFixed(2)} €</b></>}
      </div>

      <div className="art-ficha-2">
        <CampoFicha etiqueta="Cantidad" valor={txt(art.cantidad)} onGuardar={v => onUpdate('cantidad', v)} />
        <label className="art-ficha-campo">
          <span className="art-ficha-et">IVA</span>
          <select className="art-ficha-input" value={art.iva_pct ?? 21} onChange={e => onUpdate('iva_pct', e.target.value)}>
            {[0, 4, 5, 10, 21].map(v => <option key={v} value={v}>{v} %</option>)}
          </select>
        </label>
      </div>

      <div className="art-ficha-campo">
        <span className="art-ficha-et">Precio de venta (con IVA)</span>
        <span className="art-ficha-fila">
          <input className="art-ficha-input fuerte" type="text" inputMode="decimal" value={pvp} onChange={e => setPvp(e.target.value)} aria-label="Precio de venta con IVA" />
          <span className="art-ficha-suf">€</span>
          <button className="btn btn-primary btn-sm" disabled={guardando || !pvp.trim() || pvp === txt(art.pvp_con_iva, 2)}
            onClick={async () => { if (await onPvp(pvp)) onClose(); }}>{guardando ? '…' : 'Fijar'}</button>
        </span>
        {r && <span className={`art-ficha-ayuda ${'error' in r ? 'mal' : 'bien'}`}>{'error' in r ? r.error : `Margen resultante: ${r.margen.toFixed(1)} %`}</span>}
      </div>

      <div className="art-ficha-campo">
        <span className="art-ficha-et">Margen (recargo sobre el coste)</span>
        <span className="art-ficha-fila">
          <input className="art-ficha-input" type="text" inputMode="decimal" value={margen} onChange={e => setMargen(e.target.value)} aria-label="Margen en %" />
          <span className="art-ficha-suf">%</span>
          <button className="btn btn-accent btn-sm" disabled={guardando || !margen.trim() || margen === txt(art.margen_pct, 1)}
            onClick={async () => { if (await onUpdate('margen_pct', margen)) onClose(); }}>{guardando ? '…' : 'Aplicar'}</button>
          {art.margen_override && (
            <button className="btn btn-ghost btn-sm" disabled={guardando} onClick={async () => { await onResetMargin(); }}
              title="Volver al margen automático de Ajustes">Automático</button>
          )}
        </span>
      </div>

      <div className="art-ficha-2">
        <CampoFicha etiqueta="Referencia" tipo="texto" valor={art.codigo_principal || ''} onGuardar={v => onUpdate('codigo_principal', v)} />
        <CampoFicha etiqueta="EAN (código de barras)" tipo="numerico" valor={art.ean || ''} onGuardar={v => onUpdate('ean', v)} />
      </div>

      <div className="art-ficha-pie">
        <button className="btn btn-danger btn-sm" onClick={onDelete}>Eliminar artículo</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

/** Ventana para añadir un artículo a mano: no se crea nada hasta pulsar «Añadir». */
function NuevoArticulo({ onCrear, onCancelar, onError }: {
  onCrear: (d: Partial<Article>) => Promise<void>; onCancelar: () => void; onError: (m: string) => void;
}) {
  const [d, setD] = useState({ descripcion: '', cantidad: '1', precio: '', dto: '', iva: '21', codigo: '', ean: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setD(p => ({ ...p, [k]: e.target.value })); setError(''); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancelar]);

  const enviar = async () => {
    const cant = leerNumero(d.cantidad), precio = leerNumero(d.precio), dto = leerNumero(d.dto);
    const err = !d.descripcion.trim() ? 'Escribe la descripción del artículo'
      : validateField('cantidad', cant)
      || (precio === null ? 'Escribe el precio de compra (sin él no se puede calcular el precio de venta)' : validateField('precio_unitario_bruto', precio))
      || (precio === 0 ? 'El precio de compra tiene que ser mayor que 0' : null)
      || validateField('descuento_1', dto);
    if (err) { setError(err); return; }
    setEnviando(true);
    try {
      await onCrear({
        descripcion: d.descripcion.trim(), cantidad: cant as number, precio_unitario_bruto: precio as number,
        ...(dto ? { descuento_1: dto } : {}), iva_pct: Number(d.iva),
        ...(d.codigo.trim() ? { codigo_principal: d.codigo.trim() } : {}), ...(d.ean.trim() ? { ean: d.ean.trim() } : {}),
      });
    } catch (e) {
      const m = mensajeError(e, 'No se pudo añadir el artículo');
      setError(m); onError(m);
    } finally { setEnviando(false); }
  };

  return (
    <div className="modal-overlay art-nuevo-fondo" onClick={e => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div className="modal art-nuevo" role="dialog" aria-modal="true" aria-label="Añadir artículo">
        <h3>Añadir artículo</h3>
        <label className="art-ficha-campo"><span className="art-ficha-et">Descripción</span>
          <input className="art-ficha-input" value={d.descripcion} onChange={set('descripcion')} autoFocus placeholder="Ej.: Tornillo SPAX 4x40 caja 200" /></label>
        <div className="art-ficha-2">
          <label className="art-ficha-campo"><span className="art-ficha-et">Cantidad</span>
            <input className="art-ficha-input" inputMode="decimal" value={d.cantidad} onChange={set('cantidad')} /></label>
          <label className="art-ficha-campo"><span className="art-ficha-et">IVA</span>
            <select className="art-ficha-input" value={d.iva} onChange={set('iva')}>{[0, 4, 5, 10, 21].map(v => <option key={v} value={v}>{v} %</option>)}</select></label>
        </div>
        <div className="art-ficha-2">
          <label className="art-ficha-campo"><span className="art-ficha-et">Precio de compra (€)</span>
            <input className="art-ficha-input" inputMode="decimal" value={d.precio} onChange={set('precio')} placeholder="0,00" /></label>
          <label className="art-ficha-campo"><span className="art-ficha-et">Descuento (%)</span>
            <input className="art-ficha-input" inputMode="decimal" value={d.dto} onChange={set('dto')} placeholder="0" /></label>
        </div>
        <div className="art-ficha-2">
          <label className="art-ficha-campo"><span className="art-ficha-et">Referencia</span>
            <input className="art-ficha-input" value={d.codigo} onChange={set('codigo')} /></label>
          <label className="art-ficha-campo"><span className="art-ficha-et">EAN</span>
            <input className="art-ficha-input" inputMode="numeric" value={d.ean} onChange={set('ean')} /></label>
        </div>
        <p className="art-ficha-ayuda">El precio de venta se calcula con los márgenes de Ajustes; luego puedes cambiarlo.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="art-ficha-pie">
          <button className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" onClick={enviar} disabled={enviando}>{enviando ? 'Añadiendo…' : 'Añadir'}</button>
        </div>
      </div>
    </div>
  );
}
