import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Printer, Share2, Download, Eraser, Trash2, CheckCircle } from 'lucide-react';
import {
  getFirma, signFirma, deleteFirma, firmaPageUrl, firmaPdfUrl, describeApiError,
} from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { fmtFecha, fmtFirmado } from './FirmasPage';
import type { ClientDeliveryNote } from '../types';

type Pt = { x: number; y: number; p: number };

/** Lienzo de firma: dedo, lápiz o ratón. */
function SignaturePad({ padRef, onChange }: {
  padRef: React.MutableRefObject<{ clear: () => void; toBlob: () => Promise<Blob | null>; isEmpty: () => boolean } | null>;
  onChange: (hasInk: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const current = useRef<Pt[] | null>(null);
  const bounds = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  const redraw = useCallback(() => {
    const c = canvas.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14204a';
    for (const t of strokes.current) {
      for (let i = 1; i < t.length; i++) {
        const a = t[i - 1], b = t[i];
        ctx.lineWidth = 1.6 + 2.2 * b.p;
        ctx.beginPath();
        if (i > 1) {
          const z = t[i - 2];
          ctx.moveTo((z.x + a.x) / 2, (z.y + a.y) / 2);
          ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        } else { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        ctx.stroke();
      }
    }
  }, []);

  const resize = useCallback(() => {
    const c = canvas.current; if (!c) return;
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }, [redraw]);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  useEffect(() => {
    padRef.current = {
      clear: () => {
        strokes.current = [];
        bounds.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        redraw(); onChange(false);
      },
      isEmpty: () => bounds.current.maxX - bounds.current.minX < 15 && bounds.current.maxY - bounds.current.minY < 15,
      toBlob: () => new Promise(res => {
        const c = canvas.current!, dpr = window.devicePixelRatio || 1, m = 8, b = bounds.current;
        const x = Math.max(0, (b.minX - m) * dpr), y = Math.max(0, (b.minY - m) * dpr);
        const w = Math.min(c.width - x, (b.maxX - b.minX + 2 * m) * dpr);
        const h = Math.min(c.height - y, (b.maxY - b.minY + 2 * m) * dpr);
        const out = document.createElement('canvas'); out.width = w; out.height = h;
        out.getContext('2d')!.drawImage(c, x, y, w, h, 0, 0, w, h);
        out.toBlob(blob => res(blob), 'image/png');
      }),
    };
  }, [padRef, redraw, onChange]);

  const point = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5 };
  };
  const grow = (q: Pt) => {
    const b = bounds.current;
    b.minX = Math.min(b.minX, q.x); b.minY = Math.min(b.minY, q.y);
    b.maxX = Math.max(b.maxX, q.x); b.maxY = Math.max(b.maxY, q.y);
  };

  return (
    <div className="firma-pad">
      <canvas
        ref={canvas}
        onPointerDown={e => {
          e.preventDefault();
          canvas.current!.setPointerCapture(e.pointerId);
          const q = point(e); grow(q);
          current.current = [q]; strokes.current.push(current.current);
          onChange(true);
        }}
        onPointerMove={e => {
          if (!current.current) return;
          const q = point(e); grow(q); current.current.push(q); redraw();
        }}
        onPointerUp={() => { current.current = null; }}
        onPointerCancel={() => { current.current = null; }}
      />
      <div className="firma-pad-line" />
      <div className="firma-pad-hint">Firme aquí con el dedo o el lápiz</div>
    </div>
  );
}

export function FirmaDetailPage() {
  const { id } = useParams();
  const noteId = Number(id);
  const navigate = useNavigate();
  const padRef = useRef<{ clear: () => void; toBlob: () => Promise<Blob | null>; isEmpty: () => boolean } | null>(null);

  const [note, setNote] = useState<ClientDeliveryNote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printPages, setPrintPages] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoadError(null);
    getFirma(noteId).then(({ data }) => setNote(data)).catch(err => setLoadError(describeApiError(err)));
  }, [noteId]);
  useEffect(() => { load(); }, [load]);

  const version = note ? `${note.status}-${note.signed_at ?? ''}` : '';
  const pages = note ? Array.from({ length: Math.min(note.page_count || 1, 6) }, (_, i) => i + 1) : [];
  const firmado = note?.status === 'firmado';

  const onSign = async () => {
    if (!note) return;
    setError(null);
    if (!padRef.current || padRef.current.isEmpty()) { setError('Falta la firma.'); return; }
    if (!nombre.trim()) { setError('Escribe el nombre de quien recibe.'); return; }
    setSaving(true);
    try {
      const blob = await padRef.current.toBlob();
      if (!blob) throw new Error('No se pudo leer la firma');
      const { data } = await signFirma(note.id, blob, nombre.trim(), dni.trim());
      setNote(data);
      window.scrollTo?.(0, 0);
      document.getElementById('app-main')?.scrollTo?.(0, 0);
    } catch (err) {
      setError(`No se pudo firmar: ${describeApiError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // Imprimir: se cargan las páginas firmadas en alta resolución y se manda a la impresora
  const onPrint = () => {
    if (!note) return;
    setPrinting(true);
    setPrintPages(Array.from({ length: note.page_count || 1 }, (_, i) => firmaPageUrl(note.id, i + 1, 200, version)));
  };
  useEffect(() => {
    if (!printing || !printPages.length) return;
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#firma-print img'));
    Promise.all(imgs.map(im => im.complete ? Promise.resolve() : new Promise(r => { im.onload = im.onerror = () => r(null); })))
      .then(() => { window.print(); setPrinting(false); });
  }, [printing, printPages]);

  const onShare = async () => {
    if (!note) return;
    try {
      const res = await fetch(firmaPdfUrl(note.id));
      const file = new File([await res.blob()], `${note.numero} firmado.pdf`, { type: 'application/pdf' });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: `Albarán ${note.numero}` });
      } else {
        window.location.href = firmaPdfUrl(note.id, true);
      }
    } catch { /* el usuario canceló */ }
  };

  const onDelete = async () => {
    if (!note || !window.confirm(`¿Borrar el albarán ${note.numero}${firmado ? ' FIRMADO' : ''}? No se puede deshacer.`)) return;
    await deleteFirma(note.id);
    navigate('/firmas');
  };

  if (loadError) return <div className="page"><ConnectionError message={loadError} onRetry={load} /></div>;
  if (!note) return <div className="page" style={{ textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>;

  return (
    <div className="page-wide">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>Albarán {note.numero}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {[note.cliente, note.obra, fmtFecha(note.fecha)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={`status-chip ${firmado ? 'firmado' : 'pendiente'}`} style={{ marginLeft: 'auto' }}>
          {firmado ? 'Firmado' : 'Por firmar'}
        </span>
      </div>

      <div className="firma-layout">
        <div className="firma-preview">
          {pages.map(p => (
            <img key={`${p}-${version}`} src={firmaPageUrl(note.id, p, 110, version)} alt={`Página ${p}`} />
          ))}
        </div>

        <div className="card firma-panel">
          {firmado ? (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <CheckCircle size={22} style={{ color: 'var(--success)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600 }}>Firmado por {note.signed_by}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    {fmtFirmado(note.signed_at)}{note.signer_dni ? ` · DNI ${note.signer_dni}` : ''}
                  </div>
                </div>
              </div>
              <button className="btn btn-primary firma-big" onClick={onPrint} disabled={printing}>
                <Printer size={18} /> {printing ? 'Preparando…' : 'Imprimir copia firmada'}
              </button>
              <button className="btn btn-ghost firma-big" onClick={onShare}>
                <Share2 size={18} /> Enviar por WhatsApp o email
              </button>
              <a className="btn btn-ghost firma-big" href={firmaPdfUrl(note.id, true)}>
                <Download size={18} /> Descargar PDF
              </a>
              <button className="btn btn-ghost firma-big" onClick={() => navigate('/firmas')}>Volver a la lista</button>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600 }}>Recibí conforme</div>
              <SignaturePad padRef={padRef} onChange={setHasInk} />
              <label className="form-label">Nombre de quien recibe
                <input className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="off" />
              </label>
              <label className="form-label">DNI (opcional)
                <input className="form-input" value={dni} onChange={e => setDni(e.target.value)} autoComplete="off" />
              </label>
              {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => padRef.current?.clear()} disabled={!hasInk}>
                  <Eraser size={15} /> Borrar firma
                </button>
                <button className="btn btn-primary firma-big" style={{ flex: 1 }} onClick={onSign} disabled={saving}>
                  {saving ? 'Guardando…' : 'Firmar albarán'}
                </button>
              </div>
            </>
          )}
          {note.nota && <div style={{ fontSize: 12, color: 'var(--warning)' }}>{note.nota}</div>}
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', color: 'var(--text-3)' }} onClick={onDelete}>
            <Trash2 size={13} /> Borrar albarán
          </button>
        </div>
      </div>

      {printing && createPortal(
        <div id="firma-print">{printPages.map(src => <img key={src} src={src} alt="" />)}</div>,
        document.body,
      )}
    </div>
  );
}
