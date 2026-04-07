import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { updateArticle, deleteArticle, createArticle, bulkDeleteArticles, bulkUpdateMargin, listArticles } from '../api/client';
import { useConfirm } from './ConfirmModal';
import type { Article } from '../types/index';

// Validate numeric fields before sending to API
function validateField(field: string, value: number | null): string | null {
  if (value === null) return null;
  if (field === 'cantidad' && value <= 0) return 'La cantidad debe ser mayor que 0';
  if (field === 'precio_unitario_bruto' && value < 0) return 'El precio no puede ser negativo';
  if (['descuento_1','descuento_2','descuento_3','descuento_4'].includes(field) && (value < 0 || value > 100))
    return 'El descuento debe estar entre 0 y 100';
  if (field === 'iva_pct' && ![0,4,5,10,21].includes(value)) return 'IVA debe ser 0, 4, 5, 10 o 21';
  if (field === 'margen_pct' && (value < 0 || value > 500)) return 'Margen entre 0% y 500%';
  return null;
}

interface Props {
  documentId: number;
  articles: Article[];
  onArticlesChanged: (articles: Article[]) => void;
  onSelectedIdsChange?: (ids: number[]) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
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
        style={{ cursor: 'pointer', display: 'block', padding: '2px 4px', borderRadius: '3px', minWidth: width ? `${width}px` : undefined }}
        title="Clic para editar"
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

export function ArticleTable({ documentId, articles, onArticlesChanged, onSelectedIdsChange, onToast }: Props) {
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [bulkMarginModal, setBulkMarginModal] = useState(false);
  const [bulkMarginValue, setBulkMarginValue] = useState('');
  const [bulkWorking, setBulkWorking] = useState(false);
  const [undoQueue, setUndoQueue] = useState<{ id: number; article: Article; timer: ReturnType<typeof setTimeout> } | null>(null);
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

  const filtered = searchDebounced.trim()
    ? articles.filter(a =>
        (a.descripcion || '').toLowerCase().includes(searchDebounced.toLowerCase()) ||
        (a.codigo_principal || '').toLowerCase().includes(searchDebounced.toLowerCase()) ||
        (a.ean || '').includes(searchDebounced)
      )
    : articles;

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

  const handleUpdate = useCallback(async (id: number, field: string, rawValue: string) => {
    const numericFields = ['cantidad', 'precio_unitario_bruto', 'descuento_1', 'descuento_2', 'descuento_3', 'descuento_4', 'iva_pct', 'recargo_pct', 'margen_pct'];
    let value: string | number | null = rawValue;
    if (numericFields.includes(field)) {
      const n = parseFloat(rawValue.replace(',', '.'));
      value = isNaN(n) ? null : n;
      const err = validateField(field, value as number | null);
      if (err) { onToast?.(err, 'error'); return; }
    }
    setSaving(id);
    try {
      if (field === 'margen_pct' && value !== null) {
        const { data } = await updateArticle(id, { margen_pct: value as number, margen_override: true });
        onArticlesChanged(articles.map(a => a.id === id ? data : a));
        onToast?.('Margen actualizado');
        return;
      }
      const { data } = await updateArticle(id, { [field]: value });
      onArticlesChanged(articles.map(a => a.id === id ? data : a));
      onToast?.('Guardado');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Error al guardar';
      onToast?.(msg, 'error');
    } finally {
      setSaving(null);
    }
  }, [articles, onArticlesChanged]);

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
      onArticlesChanged(articles.filter(a => !ids.includes(a.id)));
      onToast?.(`${ids.length} artículo${ids.length > 1 ? 's' : ''} eliminado${ids.length > 1 ? 's' : ''}`, 'info');
    } catch {
      onToast?.('Error al eliminar', 'error');
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkMargin = async () => {
    const pct = parseFloat(bulkMarginValue.replace(',', '.'));
    if (isNaN(pct) || pct < 0 || pct > 500) { onToast?.('Margen inválido (0-500%)', 'error'); return; }
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
    } catch {
      onToast?.('Error al actualizar márgenes', 'error');
    } finally {
      setBulkWorking(false);
    }
  };

  const handleResetMargin = async (article: Article) => {
    setSaving(article.id);
    try {
      const { data } = await updateArticle(article.id, { margen_override: false });
      onArticlesChanged(articles.map(a => a.id === article.id ? data : a));
      onToast?.('Margen restablecido');
    } finally {
      setSaving(null);
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

    const article = articles.find(a => a.id === id)!;
    // Optimistic remove
    onArticlesChanged(articles.filter(a => a.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });

    // Cancel previous undo if pending
    if (undoQueue) { clearTimeout(undoQueue.timer); await deleteArticle(undoQueue.id); }

    const timer = setTimeout(async () => {
      try { await deleteArticle(id); } catch { /* already deleted */ }
      setUndoQueue(null);
    }, 5000);
    setUndoQueue({ id, article, timer });
    onToast?.('Artículo eliminado — Deshacer', 'info');
  };

  const handleUndo = () => {
    if (!undoQueue) return;
    clearTimeout(undoQueue.timer);
    onArticlesChanged([...articles, undoQueue.article].sort((a, b) => a.line_number - b.line_number));
    setUndoQueue(null);
    onToast?.('Eliminación deshecha', 'success');
  };

  const handleAddRow = async () => {
    setAddingRow(true);
    try {
      const { data } = await createArticle({
        document_id: documentId,
        descripcion: 'Nuevo artículo',
        cantidad: 1,
        precio_unitario_bruto: 0,
        line_number: articles.length + 1,
      });
      onArticlesChanged([...articles, data]);
      onToast?.('Artículo añadido');
    } finally {
      setAddingRow(false);
    }
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
      header: 'Descripción', size: 220,
      cell: info => <EditableCell value={info.getValue()} onSave={v => handleUpdate(info.row.original.id, 'descripcion', v)} width={210} />,
    }),
    ch.accessor('cantidad', {
      header: 'Cant.', size: 60,
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
      header: 'Coste neto', size: 90,
      cell: info => <span style={{ fontWeight: 600, color: 'var(--grey-700)' }}>{fmtEur(info.getValue())}</span>,
    }),
    ch.accessor('iva_pct', {
      header: 'IVA%', size: 60,
      cell: info => <EditableCell value={info.getValue()} onSave={v => handleUpdate(info.row.original.id, 'iva_pct', v)} type="number" width={50} />,
    }),
    ch.accessor('margen_pct', {
      header: 'Margen%', size: 90,
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
      header: 'PVP s/IVA', size: 90,
      cell: info => <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmtEur(info.getValue())}</span>,
    }),
    ch.accessor('pvp_con_iva', {
      header: 'PVP c/IVA', size: 95,
      cell: info => (
        <span style={{ color: '#fff', background: 'var(--primary)', padding: '2px 7px', borderRadius: '5px', fontWeight: 700, fontSize: '13px' }}>
          {fmtEur(info.getValue())}
        </span>
      ),
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
          <button onClick={() => handleDelete(id)} disabled={deleting === id}
            className="btn btn-danger btn-sm" title="Eliminar artículo">
            {deleting === id ? '…' : '✕'}
          </button>
        );
      },
    }),
  ];

  const table = useReactTable({ data: filtered, columns, getCoreRowModel: getCoreRowModel() });

  // Mobile card view for small screens
  const MobileCards = () => (
    <div className="article-cards">
      {filtered.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--grey-500)' }}>
          {searchDebounced ? 'No hay artículos que coincidan.' : 'Sin artículos. Reprocesa o añade manualmente.'}
        </div>
      ) : filtered.map(a => (
        <div key={a.id} className={`article-card${selectedIds.has(a.id) ? ' selected' : ''}`}
          onClick={() => toggleSelect(a.id)}>
          <div className="article-card-header">
            <input type="checkbox" checked={selectedIds.has(a.id)}
              onChange={() => toggleSelect(a.id)}
              onClick={e => e.stopPropagation()}
              style={{ accentColor: 'var(--primary)' }}
            />
            <span className="article-card-desc">{a.descripcion || '—'}</span>
            <span style={{
              background: 'var(--primary)', color: '#fff',
              padding: '3px 10px', borderRadius: '20px', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap',
            }}>{a.pvp_con_iva != null ? `${a.pvp_con_iva.toFixed(2)} €` : '—'}</span>
          </div>
          <div className="article-card-meta">
            <span title="Cantidad">📦 {a.cantidad ?? '—'}</span>
            <span title="Coste neto">💰 {a.coste_neto_unitario != null ? `${a.coste_neto_unitario.toFixed(2)} €` : '—'}</span>
            <span title="Margen" style={{ color: a.margen_override ? 'var(--accent)' : 'var(--success)', fontWeight: 600 }}>
              {a.margen_override ? '●' : '◉'} {a.margen_pct != null ? `${a.margen_pct.toFixed(1)}%` : '—'}
            </span>
            {a.codigo_principal && <span title="Referencia">REF: {a.codigo_principal}</span>}
            {a.ean && <span title="EAN">EAN: {a.ean}</span>}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {ConfirmDialog}
      {/* Undo banner */}
      {undoQueue && (
        <div style={{
          position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', padding: '12px 20px',
          borderRadius: '10px', display: 'flex', gap: '14px', alignItems: 'center',
          zIndex: 1500, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', fontSize: '14px',
          animation: 'slideUp 0.2s ease',
        }}>
          <span>Artículo eliminado</span>
          <button onClick={handleUndo}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
            Deshacer
          </button>
        </div>
      )}
    <div className="card">
      <div className="card-header" style={{ justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📋</span>
          Artículos ({filtered.length}{filtered.length !== articles.length ? ` / ${articles.length}` : ''})
          {selectedIds.size > 0 && (
            <span className="badge badge-grey">{selectedIds.size} sel.</span>
          )}
          {saving && <span style={{ fontSize: '11px', color: 'var(--grey-500)', fontWeight: 400 }}>Guardando…</span>}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Buscar descripción, código, EAN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '5px 10px',
              border: '1.5px solid var(--grey-300)',
              borderRadius: '7px',
              fontSize: '13px',
              width: '240px',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button className="btn btn-success btn-sm" onClick={handleAddRow} disabled={addingRow}>
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
          <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '320px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: 'var(--primary)' }}>
              Cambiar margen a {selectedIds.size} artículo{selectedIds.size > 1 ? 's' : ''}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--grey-500)', margin: '0 0 16px' }}>
              Introduce el margen en % a aplicar. Se marcará como margen manual.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number" min="0" max="500" step="1"
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
                {hg.headers.map(header => (
                  <th key={header.id} style={{
                    padding: '8px 6px', background: 'var(--primary)', color: '#fff',
                    textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600,
                    fontSize: '12px', minWidth: header.column.getSize(),
                  }}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
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
              table.getRowModel().rows.map((row, i) => {
                const isSelected = selectedIds.has(row.original.id);
                return (
                  <tr key={row.id} style={{
                    background: isSelected ? 'var(--primary-pale)' : (i % 2 === 0 ? '#f9fbff' : '#fff'),
                    transition: 'background 0.1s',
                  }}>
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} style={{ padding: '5px 6px', borderBottom: '1px solid var(--grey-200)', verticalAlign: 'middle' }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="article-table-mobile">
        <MobileCards />
      </div>

      <div style={{ padding: '8px 16px', fontSize: '11px', color: 'var(--grey-500)', background: 'var(--grey-100)', borderTop: '1px solid var(--grey-200)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', marginRight: '4px' }} />Margen automático</span>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', marginRight: '4px' }} />Margen manual (↺ para restablecer)</span>
        <span className="article-table-desktop">Clic en celda para editar · Enter para confirmar · Esc para cancelar</span>
        <span className="article-table-mobile" style={{ display: 'none' }}>Toca una tarjeta para seleccionar</span>
      </div>
    </div>
    </>
  );
}
