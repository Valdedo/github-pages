import { useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { updateArticle, deleteArticle, createArticle } from '../api/client';
import type { Article } from '../types';

interface Props {
  documentId: number;
  articles: Article[];
  onArticlesChanged: (articles: Article[]) => void;
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

  const commit = () => {
    setEditing(false);
    if (val !== String(initialValue ?? '')) {
      onSave(val);
    }
  };

  if (!editing) {
    return (
      <span
        onClick={() => { setVal(String(initialValue ?? '')); setEditing(true); }}
        style={{
          cursor: 'pointer',
          display: 'block',
          padding: '2px 4px',
          borderRadius: '3px',
          minWidth: width ? `${width}px` : undefined,
        }}
        title="Clic para editar"
      >
        {initialValue == null || initialValue === '' ? <em style={{ color: '#bbb' }}>—</em> : initialValue}
      </span>
    );
  }

  return (
    <input
      autoFocus
      type={type}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      style={{
        width: width ? `${width}px` : '90px',
        padding: '2px 4px',
        border: '1px solid #1F4E79',
        borderRadius: '3px',
        fontSize: '13px',
      }}
    />
  );
}

const ch = createColumnHelper<Article>();

export function ArticleTable({ documentId, articles, onArticlesChanged }: Props) {
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [addingRow, setAddingRow] = useState(false);

  const handleUpdate = useCallback(async (id: number, field: string, rawValue: string) => {
    setSaving(id);
    try {
      const numericFields = [
        'cantidad', 'precio_unitario_bruto', 'descuento_1', 'descuento_2',
        'descuento_3', 'descuento_4', 'iva_pct', 'recargo_pct', 'margen_pct',
      ];

      let value: string | number | boolean | null = rawValue;
      if (numericFields.includes(field)) {
        const n = parseFloat(rawValue.replace(',', '.'));
        value = isNaN(n) ? null : n;
      }
      if (field === 'margen_pct' && value !== null) {
        // Explicitly set override
        const { data } = await updateArticle(id, { margen_pct: value as number, margen_override: true });
        onArticlesChanged(articles.map(a => a.id === id ? data : a));
        return;
      }

      const { data } = await updateArticle(id, { [field]: value });
      onArticlesChanged(articles.map(a => a.id === id ? data : a));
    } catch (e) {
      console.error('Update failed', e);
    } finally {
      setSaving(null);
    }
  }, [articles, onArticlesChanged]);

  const handleResetMargin = async (article: Article) => {
    setSaving(article.id);
    try {
      const { data } = await updateArticle(article.id, { margen_override: false });
      onArticlesChanged(articles.map(a => a.id === article.id ? data : a));
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este artículo?')) return;
    setDeleting(id);
    try {
      await deleteArticle(id);
      onArticlesChanged(articles.filter(a => a.id !== id));
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
    } finally {
      setAddingRow(false);
    }
  };

  const columns = [
    ch.accessor('line_number', {
      header: '#',
      size: 40,
      cell: info => <span style={{ color: '#888', fontSize: '12px' }}>{info.getValue()}</span>,
    }),
    ch.accessor('descripcion', {
      header: 'Descripción',
      size: 220,
      cell: info => (
        <EditableCell
          value={info.getValue()}
          onSave={v => handleUpdate(info.row.original.id, 'descripcion', v)}
          width={210}
        />
      ),
    }),
    ch.accessor('cantidad', {
      header: 'Cant.',
      size: 60,
      cell: info => (
        <EditableCell
          value={info.getValue()}
          onSave={v => handleUpdate(info.row.original.id, 'cantidad', v)}
          type="number"
          width={55}
        />
      ),
    }),
    ch.accessor('precio_unitario_bruto', {
      header: 'P. Bruto',
      size: 80,
      cell: info => (
        <EditableCell
          value={fmt(info.getValue(), 4)}
          onSave={v => handleUpdate(info.row.original.id, 'precio_unitario_bruto', v)}
          type="number"
          width={70}
        />
      ),
    }),
    ch.accessor('descuento_1', {
      header: 'Dto1%',
      size: 60,
      cell: info => (
        <EditableCell
          value={info.getValue() ?? ''}
          onSave={v => handleUpdate(info.row.original.id, 'descuento_1', v)}
          type="number"
          width={52}
        />
      ),
    }),
    ch.accessor('descuento_2', {
      header: 'Dto2%',
      size: 60,
      cell: info => (
        <EditableCell
          value={info.getValue() ?? ''}
          onSave={v => handleUpdate(info.row.original.id, 'descuento_2', v)}
          type="number"
          width={52}
        />
      ),
    }),
    ch.accessor('descuento_3', {
      header: 'Dto3%',
      size: 60,
      cell: info => (
        <EditableCell
          value={info.getValue() ?? ''}
          onSave={v => handleUpdate(info.row.original.id, 'descuento_3', v)}
          type="number"
          width={52}
        />
      ),
    }),
    ch.accessor('descuento_4', {
      header: 'Dto4%',
      size: 60,
      cell: info => (
        <EditableCell
          value={info.getValue() ?? ''}
          onSave={v => handleUpdate(info.row.original.id, 'descuento_4', v)}
          type="number"
          width={52}
        />
      ),
    }),
    ch.accessor('coste_neto_unitario', {
      header: 'Coste neto',
      size: 90,
      cell: info => (
        <span style={{ fontWeight: 600, color: '#333' }}>{fmtEur(info.getValue())}</span>
      ),
    }),
    ch.accessor('iva_pct', {
      header: 'IVA%',
      size: 60,
      cell: info => (
        <EditableCell
          value={info.getValue()}
          onSave={v => handleUpdate(info.row.original.id, 'iva_pct', v)}
          type="number"
          width={50}
        />
      ),
    }),
    ch.accessor('margen_pct', {
      header: 'Margen%',
      size: 90,
      cell: info => {
        const art = info.row.original;
        return (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <EditableCell
              value={fmt(info.getValue(), 1)}
              onSave={v => handleUpdate(art.id, 'margen_pct', v)}
              type="number"
              width={50}
            />
            {art.margen_override && (
              <button
                onClick={() => handleResetMargin(art)}
                title="Restablecer margen automático"
                style={{
                  background: '#3498db', color: '#fff', border: 'none',
                  borderRadius: '3px', padding: '1px 5px', cursor: 'pointer', fontSize: '10px',
                }}
              >↺</button>
            )}
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: art.margen_override ? '#3498db' : '#27ae60',
              display: 'inline-block',
            }} title={art.margen_override ? 'Margen manual' : 'Margen automático'} />
          </div>
        );
      },
    }),
    ch.accessor('pvp_sin_iva', {
      header: 'PVP s/IVA',
      size: 90,
      cell: info => (
        <span style={{ color: '#1F4E79', fontWeight: 600 }}>{fmtEur(info.getValue())}</span>
      ),
    }),
    ch.accessor('pvp_con_iva', {
      header: 'PVP c/IVA',
      size: 95,
      cell: info => (
        <span style={{
          color: '#fff', background: '#1F4E79', padding: '2px 7px',
          borderRadius: '4px', fontWeight: 700, fontSize: '13px',
        }}>
          {fmtEur(info.getValue())}
        </span>
      ),
    }),
    ch.accessor('codigo_principal', {
      header: 'Código',
      size: 100,
      cell: info => (
        <EditableCell
          value={info.getValue() ?? ''}
          onSave={v => handleUpdate(info.row.original.id, 'codigo_principal', v)}
          width={88}
        />
      ),
    }),
    ch.accessor('ean', {
      header: 'EAN',
      size: 110,
      cell: info => (
        <EditableCell
          value={info.getValue() ?? ''}
          onSave={v => handleUpdate(info.row.original.id, 'ean', v)}
          width={100}
        />
      ),
    }),
    ch.display({
      id: 'actions',
      header: '',
      size: 50,
      cell: info => {
        const id = info.row.original.id;
        return (
          <button
            onClick={() => handleDelete(id)}
            disabled={deleting === id}
            style={{
              background: '#e74c3c', color: '#fff', border: 'none',
              borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px',
            }}
            title="Eliminar artículo"
          >
            {deleting === id ? '...' : '✕'}
          </button>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: articles,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        background: '#f0f4f8',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', color: '#1F4E79' }}>
          📋 Artículos detectados ({articles.length})
        </h3>
        {saving && <span style={{ fontSize: '12px', color: '#888' }}>Guardando...</span>}
        <button onClick={handleAddRow} disabled={addingRow} style={addBtnStyle}>
          + Añadir artículo
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      padding: '8px 6px',
                      background: '#1F4E79',
                      color: '#fff',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      fontSize: '12px',
                      minWidth: header.column.getSize(),
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
                  No se han detectado artículos. Usa "Reprocesar extracción" o añade artículos manualmente.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  style={{ background: i % 2 === 0 ? '#f9fbff' : '#fff' }}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      style={{ padding: '5px 6px', borderBottom: '1px solid #eee', verticalAlign: 'middle' }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ padding: '8px 16px', fontSize: '11px', color: '#888', background: '#f9f9f9', borderTop: '1px solid #eee' }}>
        <span style={{ marginRight: '16px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#27ae60', marginRight: '4px' }} />
          Margen automático
        </span>
        <span>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#3498db', marginRight: '4px' }} />
          Margen manual (haz clic en ↺ para restablecer)
        </span>
      </div>
    </div>
  );
}

const addBtnStyle: React.CSSProperties = {
  padding: '5px 12px',
  background: '#27ae60',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
};
