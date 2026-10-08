import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Printer, Mail, MessageCircle, Download, Eraser, Trash2, CheckCircle, Check, Truck, CloudOff, ChevronLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  getFirma, signFirma, deleteFirma, firmaPageUrl, firmaPdfUrl, describeApiError,
  getFirmaContacto, putFirmaContacto, emailFirma, enlaceFirma, marcarFirma, repartoFirmas, type MarcasFirma,
} from '../api/client';
import { firmaGuardada, ponerEnCola, sinRed, reintentarFirma, descartarFirma } from '../lib/offline';
import { ConnectionError } from '../components/ConnectionError';
import { useCfToast } from '../components/CfToast';
import { SelloHecho } from '../components/Pegatinas';
import { TopazPad, type TopazHandle } from '../components/TopazPad';
import { isReparto } from '../reparto';
import { getRol } from '../auth';
import { fmtFecha, fmtFirmado, fmtEuros, Marcas } from './FirmasPage';
import type { ClientDeliveryNote } from '../types';

type Pt = { x: number; y: number; p: number };

/** Lienzo de firma: dedo, lápiz o ratón. */
export function SignaturePad({ padRef, onChange }: {
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
      <div className="firma-pad-hint">{typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches ? 'Firme aquí con el ratón' : 'Firme aquí con el dedo o el lápiz'}</div>
    </div>
  );
}

const MAX_NOMBRE = 80;
const MAX_DNI = 20;
const hayAtras = () => { try { return ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0; } catch { return false; } };

export function FirmaDetailPage() {
  const { id } = useParams();
  const noteId = Number(id);
  const navigate = useNavigate();
  const reparto = isReparto() || getRol() === 'reparto';
  const volver = reparto ? '/reparto' : '/firmas';
  const irALista = () => (!reparto && hayAtras() ? navigate(-1) : navigate(volver));
  const padRef = useRef<{ clear: () => void; toBlob: () => Promise<Blob | null>; isEmpty: () => boolean } | null>(null);
  const { toast, show } = useCfToast();

  const [note, setNote] = useState<ClientDeliveryNote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [impreso, setImpreso] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [guardada, setGuardada] = useState(() => firmaGuardada(noteId));
  useEffect(() => { setGuardada(firmaGuardada(noteId)); }, [noteId]);
  const [factRef, setFactRef] = useState<string | null>(null); // null: sin tocar
  const [printPages, setPrintPages] = useState<string[]>([]);
  const [camionGuardando, setCamionGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  // En el ordenador se puede firmar con la tableta Topaz; se recuerda la elección
  // En el reparto siempre se firma en la pantalla del móvil
  const esPC = !reparto && typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;
  const eleccionGuardada = (() => { try { return localStorage.getItem('modoFirma'); } catch { return null; } })();
  const [modo, setModo] = useState<'pantalla' | 'tableta'>(() => {
    // En el PC, la tableta Topaz por defecto (salvo que se haya elegido Pantalla)
    if (!esPC) return 'pantalla';
    return eleccionGuardada === 'pantalla' ? 'pantalla' : 'tableta';
  });
  // Si nadie ha elegido y en este ordenador no hay tableta, se pasa solo a firmar con el ratón
  const [sinTableta, setSinTableta] = useState(false);
  const cambiarModo = (m: 'pantalla' | 'tableta') => {
    setModo(m); setHasInk(false); setSinTableta(false);
    try { localStorage.setItem('modoFirma', m); } catch { /* nada */ }
  };
  const alNoHaberTableta = useCallback(() => {
    if (eleccionGuardada === 'tableta') return; // la eligieron a propósito: se avisa y se deja reintentar
    setModo('pantalla'); setHasInk(false); setSinTableta(true);
  }, [eleccionGuardada]);

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
  // Cuando se envía (o se rechaza) la firma guardada sin cobertura, se actualiza
  useEffect(() => {
    const f = () => {
      const g = firmaGuardada(noteId);
      setGuardada(g);
      if (!g) load();
    };
    window.addEventListener('cf-cola', f);
    return () => window.removeEventListener('cf-cola', f);
  }, [noteId, load]);

  const camion = async () => {
    if (!note || camionGuardando) return;
    setCamionGuardando(true); setError(null);
    try { const { data } = await repartoFirmas([note.id], !note.reparto_at); setNote(data[0] ?? note); }
    catch (err) { setError(describeApiError(err)); }
    finally { setCamionGuardando(false); }
  };

  const version = note ? `${note.status}-${note.signed_at ?? ''}` : '';
  const pages = note ? Array.from({ length: Math.min(note.page_count || 1, 6) }, (_, i) => i + 1) : [];
  const firmado = note?.status === 'firmado';

  const onSign = async () => {
    if (!note || saving) return;
    setError(null);
    if (!padRef.current || padRef.current.isEmpty()) { setError('Falta la firma.'); return; }
    if (!nombre.trim()) { setError('Escribe el nombre de quien recibe.'); return; }
    setSaving(true);
    try {
      const blob = await padRef.current.toBlob();
      if (!blob) throw new Error('No se pudo leer la firma');
      const { data } = await signFirma(note.id, blob, nombre.trim(), dni.trim());
      setNote(data);
      if (auto.on) { setTimeout(load, 8000); setTimeout(load, 25000); } // el correo sale en segundo plano
      setHecho(true);
      setTimeout(() => setHecho(false), 1500);
      window.scrollTo?.(0, 0);
      document.getElementById('app-main')?.scrollTo?.(0, 0);
    } catch (err) {
      if (sinRed(err) && padRef.current) {
        // Sin cobertura: se guarda en el móvil y se envía sola al volver la señal
        const blob = await padRef.current.toBlob();
        if (blob) {
          try { await ponerEnCola(note, blob, nombre.trim(), dni.trim()); }
          catch (e) { setError(`${(e as Error).message}. No hay cobertura: vuelve a intentarlo cuando haya señal.`); return; }
          setGuardada(firmaGuardada(note.id));
          setHecho(true);
          setTimeout(() => setHecho(false), 1500);
          return;
        }
      }
      setError(`No se pudo firmar: ${describeApiError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const marcar = async (m: MarcasFirma) => {
    if (!note) return;
    try { const { data } = await marcarFirma(note.id, m); setNote(data); }
    catch (err) { setEnvioMsg({ ok: false, text: describeApiError(err) }); }
  };

  // Imprimir: se cargan las páginas firmadas en alta resolución y se manda a la impresora.
  // No se marca «Copia entregada» sola (no se sabe si se imprimió o se canceló): se marca a mano.
  const onPrint = () => {
    if (!note) return;
    setPrinting(true);
    setPrintPages(Array.from({ length: note.page_count || 1 }, (_, i) => firmaPageUrl(note.id, i + 1, 200, version)));
  };
  useEffect(() => {
    if (!printing || !printPages.length) return;
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#firma-print img'));
    const despues = () => { setImpreso(true); window.removeEventListener('afterprint', despues); };
    Promise.all(imgs.map(im => im.complete ? Promise.resolve() : new Promise(r => { im.onload = im.onerror = () => r(null); })))
      .then(() => { window.addEventListener('afterprint', despues); window.print(); setPrinting(false); });
    return () => window.removeEventListener('afterprint', despues);
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
      setEnvioMsg({ ok: false, text: describeApiError(err) });
    } finally {
      setEnviando(false);
    }
  };

  // WhatsApp: abre el chat del cliente con el mensaje y el enlace al PDF firmado.
  // Se marca «Enviado por WhatsApp», pero con «Deshacer» por si al final no se mandó.
  const onWhatsApp = async () => {
    if (!note) return;
    let tel = telefono.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
    if (tel.length === 9) tel = `34${tel}`;
    if (tel.length < 11) { setEnvioMsg({ ok: false, text: 'Escribe el móvil del cliente.' }); return; }
    const yaMarcado = !!note.whatsapp_at;
    const win = window.open('', '_blank'); // se abre ya para que el navegador no lo bloquee
    try {
      await putFirmaContacto(note.id, { telefono });
      const { data } = await enlaceFirma(note.id);
      setNote(n => n ? { ...n, whatsapp_at: n.whatsapp_at || new Date().toISOString() } : n);
      const url = `${window.location.origin}${data.path}`;
      const text = `Buenas, le enviamos el albarán ${note.numero} firmado:\n${url}\n\nCasa Fonso · Materiales de construcción`;
      const wa = `https://wa.me/${tel}?text=${encodeURIComponent(text)}`;
      if (win) win.location.href = wa; else window.location.href = wa;
      setEnvioMsg(null);
      if (!yaMarcado) show('Marcado como enviado por WhatsApp', { undo: () => marcar({ whatsapp: false }) });
    } catch (err) {
      win?.close();
      setEnvioMsg({ ok: false, text: describeApiError(err) });
    }
  };

  const onDelete = async () => {
    if (!note || borrando || !window.confirm(`¿Borrar el albarán ${note.numero}${firmado ? ' FIRMADO' : ''}? No se puede deshacer.`)) return;
    setBorrando(true); setError(null); setEnvioMsg(null);
    try {
      await deleteFirma(note.id);
      navigate(volver, { replace: true });
    } catch (err) {
      const text = sinRed(err) ? 'Sin cobertura: no se ha borrado. Vuelve a probar cuando haya señal.' : `No se pudo borrar: ${describeApiError(err)}`;
      if (firmado) setEnvioMsg({ ok: false, text }); else setError(text);
      show(text, { error: true });
    } finally { setBorrando(false); }
  };

  const guardarFactRef = () => {
    if (!note || factRef === null) return;
    const v = factRef.trim();
    if (v !== (note.factura_ref || '')) marcar({ factura_ref: v }); // vacío = quitar el nº
    setFactRef(null);
  };

  if (loadError) return <div className="page"><ConnectionError message={loadError} onRetry={load} /></div>;
  if (!note) return <div className="page" style={{ textAlign: 'center', color: 'var(--text-3)' }}>Cargando…</div>;

  const movil = !esPC;
  const imprimir = !reparto && (
    <button className={`btn ${movil ? 'btn-ghost' : 'btn-primary'} firma-big`} onClick={onPrint} disabled={printing}>
      <Printer size={18} /> {printing ? 'Preparando…' : impreso ? 'Impreso · imprimir otra vez' : 'Imprimir copia firmada'}
    </button>
  );
  const envio = (
    <>
      {movil && <div className="firma-envio-tit">Mandar al cliente</div>}
      <div className="firma-envio">
        <input className="form-input" type="tel" placeholder="Móvil del cliente" value={telefono} autoComplete="off"
          onChange={e => setTelefono(e.target.value)} aria-label="Móvil del cliente" />
        <button className={`btn ${movil ? 'btn-primary' : 'btn-ghost'}`} onClick={onWhatsApp}>
          <MessageCircle size={16} /> WhatsApp
        </button>
      </div>
      <div className="firma-envio">
        <input className="form-input" type="email" placeholder="Correo del cliente" value={email} autoComplete="off"
          onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onEmail(); }} aria-label="Correo del cliente" />
        <button className={`btn ${movil ? 'btn-primary' : 'btn-ghost'}`} onClick={onEmail} disabled={enviando}>
          <Mail size={16} /> {enviando ? 'Enviando…' : 'Correo'}
        </button>
      </div>
      {envioMsg && <div role={envioMsg.ok ? 'status' : 'alert'} style={{ fontSize: 13, color: envioMsg.ok ? 'var(--success)' : 'var(--danger)' }}>{envioMsg.text}</div>}
    </>
  );

  return (
    <div className="page-wide">
      <button className="btn btn-ghost btn-sm firma-volver-pc" onClick={irALista}>
        <ChevronLeft size={16} /> Volver a la lista
      </button>
      <div className="firma-cabecera">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>Albarán {note.numero}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {[note.cliente, note.obra, fmtFecha(note.fecha), fmtEuros(note.importe)].filter(Boolean).join(' · ')}
          </p>
          <Marcas n={note} sinEstado />
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
          {!firmado && guardada?.error ? (
            <div className="firma-cola error" role="alert">
              <AlertTriangle size={26} />
              <div>
                <b>No se pudo enviar la firma: {guardada.error}</b>
                <small>Firmó {guardada.nombre}. La firma sigue guardada en este móvil.</small>
              </div>
              <div className="firma-cola-botones">
                <button className="btn btn-primary" onClick={() => reintentarFirma(note.id)}><RefreshCw size={16} /> Reintentar</button>
                <button className="btn btn-ghost" onClick={() => {
                  if (window.confirm('¿Descartar la firma guardada en el móvil? Habrá que volver a firmar.')) descartarFirma(note.id);
                }}>Descartar</button>
              </div>
            </div>
          ) : !firmado && guardada ? (
            <div className="firma-cola">
              <CloudOff size={26} />
              <div>
                <b>Firmado. Se enviará al recuperar cobertura</b>
                <small>La firma está guardada en este móvil. No hace falta hacer nada más.</small>
              </div>
              <button className="btn btn-primary firma-big" onClick={() => navigate(volver)}>{reparto ? 'Siguiente entrega' : 'Volver a la lista'}</button>
            </div>
          ) : firmado ? (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <CheckCircle size={22} style={{ color: 'var(--success)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>Recibió {note.signed_by}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    {fmtFirmado(note.signed_at)}{note.signer_dni ? ` · DNI ${note.signer_dni}` : ''}
                  </div>
                </div>
              </div>
              {movil ? <>{envio}{imprimir}</> : <>{imprimir}{envio}</>}
              {impreso && !note.copia_at && !reparto && (
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => marcar({ copia: true })}>
                  <Check size={14} /> Se la he dado al cliente: marcar «Copia entregada»
                </button>
              )}

              <a className="btn btn-ghost firma-big" href={firmaPdfUrl(note.id, true)}>
                <Download size={18} /> Descargar PDF
              </a>
              {note.codigo_cliente && !reparto && (
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
                  <button key={t.key} className={`firma-toggle${t.at ? ' on' : ''}`} aria-pressed={!!t.at}
                    onClick={() => marcar({ [t.key]: !t.at })}>
                    <span className="box">{t.at && <Check size={14} />}</span>
                    {t.label}
                    {t.at && <small>{fmtFirmado(t.at).replace(' a las', ',')}</small>}
                  </button>
                ))}
                {note.facturado_at && (
                  <label className="form-label" style={{ margin: '2px 0 0' }}>Nº de factura (opcional)
                    <input className="form-input" value={factRef ?? note.factura_ref ?? ''} placeholder="Por ejemplo, F-2026/0145" maxLength={50}
                      onChange={e => setFactRef(e.target.value)} onBlur={guardarFactRef}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                  </label>
                )}
                <div className={`firma-toggle${note.emailed_at ? ' on' : ''}`} style={{ cursor: 'default' }}>
                  <span className="box">{note.emailed_at && <Check size={14} />}</span>
                  {note.emailed_at ? `Enviado por correo a ${note.emailed_to}` : 'Enviado por correo'}
                  {note.emailed_at && <small>{fmtFirmado(note.emailed_at).replace(' a las', ',')}</small>}
                </div>
              </div>}
              <button className="btn btn-ghost firma-big" onClick={() => navigate(volver)}>{reparto ? 'Siguiente entrega' : 'Volver a la lista'}</button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 600 }}>Recibí conforme</div>
                {esPC && (
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <button className={`btn btn-sm ${modo === 'tableta' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => cambiarModo('tableta')}>Con tableta</button>
                    <button className={`btn btn-sm ${modo === 'pantalla' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => cambiarModo('pantalla')}>Con ratón</button>
                  </div>
                )}
              </div>
              {modo === 'tableta'
                ? <TopazPad ref={padRef as React.MutableRefObject<TopazHandle | null>} onChange={setHasInk}
                    onSinTableta={alNoHaberTableta} onUsarRaton={() => cambiarModo('pantalla')} />
                : <SignaturePad padRef={padRef} onChange={setHasInk} />}
              {modo === 'pantalla' && sinTableta && (
                <div className="firma-nota">No hay tableta de firma en este ordenador: firma con el ratón en el recuadro.</div>
              )}
              <label className="form-label">Nombre de quien recibe
                <input className="form-input" value={nombre} maxLength={MAX_NOMBRE} onChange={e => setNombre(e.target.value)} autoComplete="off" />
                {nombre.length > MAX_NOMBRE - 15 && <small className="firma-limite">{nombre.length}/{MAX_NOMBRE}</small>}
              </label>
              <label className="form-label">DNI (opcional)
                <input className="form-input" value={dni} maxLength={MAX_DNI} onChange={e => setDni(e.target.value)} autoComplete="off" autoCapitalize="characters" />
              </label>
              {auto.on && auto.email && (
                <div style={{ fontSize: 13, color: 'var(--text-2)', overflowWrap: 'anywhere' }}>
                  <Mail size={13} style={{ verticalAlign: -2 }} /> Al firmar se enviará solo a {auto.email}
                </div>
              )}
              {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
              {!reparto && (
                <button className={`firma-toggle${note.reparto_at ? ' on' : ''}`} onClick={camion} disabled={camionGuardando} aria-busy={camionGuardando} aria-pressed={!!note.reparto_at}>
                  <span className="box">{note.reparto_at && <Check size={14} />}</span>
                  <Truck size={16} /> {camionGuardando ? 'Guardando…' : note.reparto_at ? 'En el camión de reparto' : 'Mandar al camión de reparto'}
                </button>
              )}
              <div className="firma-acciones">
                <button className="btn btn-ghost" onClick={() => padRef.current?.clear()} disabled={!hasInk}>
                  <Eraser size={15} /> Borrar firma
                </button>
                <button className="btn btn-primary firma-big" onClick={onSign} disabled={saving}>
                  {saving ? 'Guardando…' : 'Firmar albarán'}
                </button>
              </div>
            </>
          )}
          {note.nota && <div style={{ fontSize: 12, color: 'var(--warning)' }}>{note.nota}</div>}
          {!reparto && <button className="firma-borrar" onClick={onDelete} disabled={borrando}>
            <Trash2 size={13} /> {borrando ? 'Borrando…' : 'Borrar este albarán'}
          </button>}
        </div>
      </div>

      {hecho && <SelloHecho texto="FIRMADO" titulo="Albarán firmado" />}
      {printing && createPortal(
        <div id="firma-print">{printPages.map(src => <img key={src} src={src} alt="" />)}</div>,
        document.body,
      )}
      {toast}
    </div>
  );
}
