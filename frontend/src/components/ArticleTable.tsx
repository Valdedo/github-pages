import { useState, useCallback, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { updateArticle, deleteArticle, createArticle } from '../api/client';
import type { Article } from '../types/index';

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

  const filtered = search.trim()
    ? articles.filter(a =>
        (a.descripcion || '').toLowerCase().includes(search.toLowerCase()) ||
        (a.codigo_principal || '').toLowerCase().includes(search.toLowerCase()) ||
        (a.ean || '').includes(search)
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
    setSaving(id);
    try {
      const numericFields = ['cantidad', 'precio_unitario_bruto', 'descuento_1', 'descuento_2', 'descuento_3', 'descuento_4', 'iva_pct', 'recargo_pct', 'margen_pct'];
      let value: string | number | null = rawValue;
      if (numericFields.includes(field)) {
        const n = parseFloat(rawValue.replace(',', '.'));
        value = isNaN(n) ? null : n;
      }
      if (field === 'margen_pct' && value !== null) {
        const { data } = await updateArticle(id, { margen_pct: value as number, margen_override: true });
        onArticlesChanged(articles.map(a => a.id === id ? data : a));
        onToast?.('Margen actualizado');
        return;
      }
      const { data } = await updateArticle(id, { [field]: value });
      onArticlesChanged(articles.map(a => a.id === id ? data : a));
      onToast?.('Guardado');
    } catch {
      onToast?.('Error al guardar', 'error');
    } finally {
      setSaving(null);
    }
  }, [articles, onArticlesChanged]);

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
    if (!confirm('¿Eliminar este artículo?')) return;
    setDeleting(id);
    try {
      await deleteArticle(id);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      onArticlesChanged(articles.filter(a => a.id !== id));
      onToast?.('Artículo eliminado', 'info');
    } finally {
      setDeleting(null);
    }
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

  return (
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

      <div style={{ overflowX: 'auto' }}>
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

      <div style={{ padding: '8px 16px', fontSize: '11px', color: 'var(--grey-500)', background: 'var(--grey-100)', borderTop: '1px solid var(--grey-200)', display: 'flex', gap: '16px' }}>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', marginRight: '4px' }} />Margen automático</span>
        <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', marginRight: '4px' }} />Margen manual (↺ para restablecer)</span>
        <span>Clic en celda para editar · Enter para confirmar · Esc para cancelar</span>
      </div>
    </div>
  );
}
