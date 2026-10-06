import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Printer, Mail, MessageCircle, Download, Eraser, Trash2, CheckCircle, Check } from 'lucide-react';
import {
  getFirma, signFirma, deleteFirma, firmaPageUrl, firmaPdfUrl, describeApiError,
  getFirmaContacto, putFirmaContacto, emailFirma, enlaceFirma, marcarFirma, type MarcasFirma,
} from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { TopazPad, type TopazHandle } from '../components/TopazPad';
import { isReparto } from '../reparto';
import { fmtFecha, fmtFirmado, fmtEuros, Marcas } from './FirmasPage';
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
  const reparto = isReparto();
  const volver = reparto ? '/reparto' : '/firmas';
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
  // En el ordenador se puede firmar con la tableta Topaz; se recuerda la elección
  const esPC = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
  const [modo, setModo] = useState<'pantalla' | 'tableta'>(() => {
    // En el PC, la tableta Topaz por defecto (salvo que se haya elegido Pantalla)
    if (!esPC) return 'pantalla';
    try { return localStorage.getItem('modoFirma') === 'pantalla' ? 'pantalla' : 'tableta'; } catch { return 'tableta'; }
  });
  const cambiarModo = (m: 'pantalla' | 'tableta') => {
    setModo(m); setHasInk(false);
    try { localStorage.setItem('modoFirma', m); } catch { /* nada */ }
  };

  // Envío al cliente: email y teléfono recordados por cliente
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [envioMsg, setEnvioMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [auto, setAuto] = useState<{ email: string; on: boolean }>({ email: '', on: false });
  useEffect(() => {
    if (!note) return;
    getFirmaContacto(note.id).then(({ data }) => {
      setEmail(e => e || data.email || '');
      setTelefono(t => t || data.telefono || '');
      setAuto({ email: data.email || '', on: !!data.auto_email });
    }).catch(() => {});
  }, [note?.id, note?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarAuto = async (on: boolean) => {
    if (!note) return;
    const to = email.trim();
    if (on && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { setEnvioMsg({ ok: false, text: 'Escribe primero el correo del cliente.' }); return; }
    try {
      const { data } = await putFirmaContacto(note.id, on ? { email: to, auto_email: true } : { auto_email: false });
      setAuto({ email: data.email || '', on: !!data.auto_email });
      setEnvioMsg(null);
    } catch (err) { setEnvioMsg({ ok: false, text: describeApiError(err) }); }
  };

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
  const marcar = async (m: MarcasFirma) => {
    if (!note) return;
    try { const { data } = await marcarFirma(note.id, m); setNote(data); }
    catch (err) { setEnvioMsg({ ok: false, text: describeApiError(err) }); }
  };

  const onPrint = () => {
    if (!note) return;
    if (!note.copia_at) marcar({ copia: true }); // la copia impresa es para el cliente
    setPrinting(true);
    setPrintPages(Array.from({ length: note.page_count || 1 }, (_, i) => firmaPageUrl(note.id, i + 1, 200, version)));
  };
  useEffect(() => {
    if (!printing || !printPages.length) return;
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#firma-print img'));
    Promise.all(imgs.map(im => im.complete ? Promise.resolve() : new Promise(r => { im.onload = im.onerror = () => r(null); })))
      .then(() => { window.print(); setPrinting(false); });
  }, [printing, printPages]);

  const onEmail = async () => {
    if (!note) return;
    const to = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { setEnvioMsg({ ok: false, text: 'Escribe un correo válido.' }); return; }
    setEnviando(true); setEnvioMsg(null);
    try {
      const { data } = await emailFirma(note.id, to);
      setNote(data);
      setEnvioMsg({ ok: true, text: `Enviado a ${to}` });
    } catch (err) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setEnvioMsg({ ok: false, text: ax.response?.data?.detail || describeApiError(err) });
    } finally {
      setEnviando(false);
    }
  };

  // WhatsApp: abre el chat del cliente con el mensaje y el enlace al PDF firmado
  const onWhatsApp = async () => {
    if (!note) return;
    let tel = telefono.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
    if (tel.length === 9) tel = `34${tel}`;
    if (tel.length < 11) { setEnvioMsg({ ok: false, text: 'Escribe el móvil del cliente.' }); return; }
    const win = window.open('', '_blank'); // se abre ya para que el navegador no lo bloquee
    try {
      await putFirmaContacto(note.id, { telefono });
      const { data } = await enlaceFirma(note.id);
      setNote(n => n ? { ...n, whatsapp_at: n.whatsapp_at || new Date().toISOString() } : n);
      const url = `${window.location.origin}${data.path}`;
      const text = `Buenas, le enviamos el albarán ${note.numero} firmado:\n${url}\n\nCasa Fonso · Materiales de construcción`;
      const wa = `https://wa.me/${tel}?text=${encodeURIComponent(text)}`;
      if (win) win.location.href = wa; else window.location.href = wa;
    } catch (err) {
      win?.close();
      setEnvioMsg({ ok: false, text: describeApiError(err) });
    }
  };

  const onDelete = async () => {
    if (!note || !window.confirm(`¿Borrar el albarán ${note.numero}${firmado ? ' FIRMADO' : ''}? No se puede deshacer.`)) return;
    await deleteFirma(note.id);
    navigate(volver);
  };

  if (loadError) return <div className="page"><ConnectionError message={loadError} onRetry={load} /></div>;
  if (!note) return <div className="page" style={{ textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>;

  return (
    <div className="page-wide">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>Albarán {note.numero}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {[note.cliente, note.obra, fmtFecha(note.fecha), fmtEuros(note.importe)].filter(Boolean).join(' · ')}
          </p>
          <Marcas n={note} />
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
              <div className="firma-envio">
                <input className="form-input" type="email" placeholder="Correo del cliente" value={email}
                  onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onEmail(); }} />
                <button className="btn btn-ghost" onClick={onEmail} disabled={enviando}>
                  <Mail size={16} /> {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
              <div className="firma-envio">
                <input className="form-input" type="tel" placeholder="Móvil del cliente" value={telefono}
                  onChange={e => setTelefono(e.target.value)} />
                <button className="btn btn-ghost" onClick={onWhatsApp}>
                  <MessageCircle size={16} /> WhatsApp
                </button>
              </div>
              {envioMsg && <div style={{ fontSize: 13, color: envioMsg.ok ? 'var(--success)' : 'var(--danger)' }}>{envioMsg.text}</div>}

              <a className="btn btn-ghost firma-big" href={firmaPdfUrl(note.id, true)}>
                <Download size={18} /> Descargar PDF
              </a>
              {note.codigo_cliente && (
                <label className="firma-auto">
                  <input type="checkbox" checked={auto.on} onChange={e => cambiarAuto(e.target.checked)} />
                  Enviar siempre por correo a este cliente al firmar
                </label>
              )}
              {!reparto && <div className="firma-seguimiento">
                <div style={{ fontWeight: 600, fontSize: 14 }}>Seguimiento</div>
                {([
                  { key: 'copia', label: 'Copia entregada al cliente', at: note.copia_at },
                  { key: 'whatsapp', label: 'Enviado por WhatsApp', at: note.whatsapp_at },
                  { key: 'facturado', label: note.factura_ref ? `Facturado (${note.factura_ref})` : 'Facturado', at: note.facturado_at },
                ] as const).map(t => (
                  <button key={t.key} className={`firma-toggle${t.at ? ' on' : ''}`}
                    onClick={() => marcar({ [t.key]: !t.at })}>
                    <span className="box">{t.at && <Check size={14} />}</span>
                    {t.label}
                    {t.at && <small>{fmtFirmado(t.at).replace(' a las', ',')}</small>}
                  </button>
                ))}
                <div className={`firma-toggle${note.emailed_at ? ' on' : ''}`} style={{ cursor: 'default' }}>
                  <span className="box">{note.emailed_at && <Check size={14} />}</span>
                  {note.emailed_at ? `Enviado por correo a ${note.emailed_to}` : 'Enviado por correo'}
                  {note.emailed_at && <small>{fmtFirmado(note.emailed_at).replace(' a las', ',')}</small>}
                </div>
              </div>}
              <button className="btn btn-ghost firma-big" onClick={() => navigate(volver)}>Volver a la lista</button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 600 }}>Recibí conforme</div>
                {esPC && (
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <button className={`btn btn-sm ${modo === 'tableta' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => cambiarModo('tableta')}>Tableta</button>
                    <button className={`btn btn-sm ${modo === 'pantalla' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => cambiarModo('pantalla')}>Pantalla</button>
                  </div>
                )}
              </div>
              {modo === 'tableta'
                ? <TopazPad ref={padRef as React.MutableRefObject<TopazHandle | null>} onChange={setHasInk} />
                : <SignaturePad padRef={padRef} onChange={setHasInk} />}
              <label className="form-label">Nombre de quien recibe
                <input className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="off" />
              </label>
              <label className="form-label">DNI (opcional)
                <input className="form-input" value={dni} onChange={e => setDni(e.target.value)} autoComplete="off" />
              </label>
              {auto.on && auto.email && (
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  <Mail size={13} style={{ verticalAlign: -2 }} /> Al firmar se enviará solo a {auto.email}
                </div>
              )}
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
          {!reparto && <button className="btn btn-danger btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onDelete}>
            <Trash2 size={13} /> Borrar albarán
          </button>}
        </div>
      </div>

      {printing && createPortal(
        <div id="firma-print">{printPages.map(src => <img key={src} src={src} alt="" />)}</div>,
        document.body,
      )}
    </div>
  );
}
