import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Search, PenLine, ChevronRight, Download } from 'lucide-react';
import { listFirmas, uploadFirmas, firmasZipUrl, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import type { ClientDeliveryNote, FirmaStatus } from '../types';

const FILTERS: { value: FirmaStatus | ''; label: string }[] = [
  { value: 'pendiente', label: 'Por firmar' },
  { value: 'firmado', label: 'Firmados' },
  { value: '', label: 'Todos' },
];

export function fmtFecha(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

export function fmtFirmado(iso?: string | null): string {
  if (!iso) return '';
  const [date, time] = iso.split('T');
  return `${fmtFecha(date)} a las ${(time || '').slice(0, 5)}`;
}

function NoteCard({ n, onOpen }: { n: ClientDeliveryNote; onOpen: () => void }) {
  return (
    <div className="card firma-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{n.numero}</span>
          <span className={`status-chip ${n.status === 'firmado' ? 'firmado' : 'pendiente'}`}>
            {n.status === 'firmado' ? 'Firmado' : 'Por firmar'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>{fmtFecha(n.fecha)}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <strong>{n.cliente || 'Cliente sin identificar'}</strong>
          {n.codigo_cliente && <span style={{ color: 'var(--text-3)' }}> · {n.codigo_cliente}</span>}
          {n.obra && <span style={{ color: 'var(--text-3)' }}> · {n.obra}</span>}
        </div>
        {(n.signed_by || n.nota) && (
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-3)' }}>
            {n.signed_by && <>Firmó {n.signed_by} el {fmtFirmado(n.signed_at)}</>}
            {n.nota && <span style={{ color: 'var(--warning)' }}>{n.signed_by ? ' · ' : ''}{n.nota}</span>}
          </div>
        )}
      </div>
      <ChevronRight size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </div>
  );
}

export function FirmasPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState<ClientDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<FirmaStatus | ''>('pendiente');
  const [search, setSearch] = useState('');
  const [cliente, setCliente] = useState('');
  const [mes, setMes] = useState('');

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    setLoadError(null);
    listFirmas()
      .then(({ data }) => setNotes(data))
      .catch(err => { if (!quiet) setLoadError(describeApiError(err)); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  // Refresco cada 30 s: lo que se firma en otro móvil aparece solo
  useEffect(() => {
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [load]);

  const clientes = useMemo(() => {
    const seen = new Map<string, string>();
    notes.forEach(n => { if (n.codigo_cliente && !seen.has(n.codigo_cliente)) seen.set(n.codigo_cliente, n.cliente || n.codigo_cliente); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [notes]);

  const pendientes = notes.filter(n => n.status === 'pendiente').length;
  const q = search.trim().toLowerCase();
  const filtered = notes.filter(n =>
    (!filter || n.status === filter) &&
    (!cliente || n.codigo_cliente === cliente) &&
    (!mes || (n.fecha || '').startsWith(mes)) &&
    (!q || `${n.numero} ${n.cliente ?? ''} ${n.codigo_cliente ?? ''} ${n.obra ?? ''}`.toLowerCase().includes(q))
  );

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list || []).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!files.length) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const { data } = await uploadFirmas(files);
      setUploadMsg(data.length === 1
        ? `Albarán ${data[0].numero} listo para firmar`
        : `${data.length} albaranes listos para firmar`);
      setFilter('pendiente');
      load(true);
    } catch (err) {
      setUploadMsg(`No se pudo subir: ${describeApiError(err)}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
      {loadError && <ConnectionError message={loadError} onRetry={() => load()} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>Firmas de albaranes</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {pendientes ? `${pendientes} por firmar` : 'Todo firmado'}
          </p>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={uploading}
          onClick={() => fileRef.current?.click()}>
          <Upload size={15} /> {uploading ? 'Subiendo…' : 'Subir albaranes'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" multiple hidden
          onChange={e => onFiles(e.target.files)} />
      </div>

      {uploadMsg && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>{uploadMsg}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`btn btn-sm ${filter === f.value ? 'btn-primary' : 'btn-ghost'}`}>
              {f.label}
              {f.value === 'pendiente' && pendientes > 0 && <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>{pendientes}</span>}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="form-input" placeholder="Buscar nº, cliente u obra…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32, margin: 0 }} />
        </div>
        <select className="form-input" value={cliente} onChange={e => setCliente(e.target.value)}
          style={{ margin: 0, flex: '1 1 180px', maxWidth: 260 }} aria-label="Cliente">
          <option value="">Todos los clientes</option>
          {clientes.map(([cod, nom]) => <option key={cod} value={cod}>{nom} ({cod})</option>)}
        </select>
        <input className="form-input" type="month" value={mes} onChange={e => setMes(e.target.value)}
          style={{ margin: 0, width: 160 }} aria-label="Mes" />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Cargando…</div>
      ) : loadError ? null : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><PenLine size={36} style={{ opacity: 0.3 }} /></div>
          <div className="empty-state-text">
            {notes.length === 0
              ? 'Exporta el albarán en PDF desde treyFACT y súbelo aquí (o arrástralo a esta pantalla).'
              : filter === 'pendiente' && !q && !cliente && !mes
                ? 'No hay albaranes por firmar.'
                : 'Ningún albarán coincide con el filtro.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(n => <NoteCard key={n.id} n={n} onOpen={() => navigate(`/firmas/${n.id}`)} />)}
        </div>
      )}

      {filter !== 'pendiente' && notes.some(n => n.status === 'firmado') && (
        <div style={{ marginTop: 20 }}>
          <a className="btn btn-ghost" href={firmasZipUrl(cliente, mes)}>
            <Download size={15} /> Descargar firmados {cliente ? 'de este cliente' : ''}{mes ? ' de este mes' : ''} (ZIP)
          </a>
        </div>
      )}
    </div>
  );
}
