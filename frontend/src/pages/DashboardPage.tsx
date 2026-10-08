import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Upload, PenLine, Check, Mail, Receipt, MessageCircle, FileText } from 'lucide-react';
import { getDashboardStats, listFirmas, listDocuments, uploadFirmas, describeApiError } from '../api/client';
import { ES_MANUAL } from '../lib/proveedor';
import { ConnectionError } from '../components/ConnectionError';
import { FirmasAvisos } from '../components/FirmasAvisos';
import { CorreoCard } from '../components/CorreoCard';
import { TurnoHoy } from '../components/TurnoHoy';
import { AvisosCard } from '../components/AvisosCard';
import { CabeceraPegatina } from '../components/CabeceraPegatina';
import { Ilustracion, AccesoPegatina } from '../components/Pegatinas';
import { useIsMobile } from '../hooks';
import type { ClientDeliveryNote, DashboardStats, DocumentListItem } from '../types';

const EMPTY_STATS: DashboardStats = {
  documents: { total: 0, processing: 0 },
  repairs: { recibida: 0, en_taller: 0, reparada: 0, entregada: 0, pending: 0 },
  orders: { pendiente: 0, parcial: 0, recibido: 0, pending: 0 },
  recent_documents: [],
};

const euros = (v: number) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

function saludo() {
  const h = new Date().getHours();
  return h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}
function hoyTexto() {
  const t = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hora = (iso?: string | null) => (iso ? iso.split('T')[1]?.slice(0, 5) ?? '' : '');
/** Las horas de subida (created_at) vienen en UTC sin zona: se pasan a la hora de Madrid,
 *  como «2026-10-09T00:12». Así un albarán subido a las 00:10 cuenta como de hoy, no de ayer. */
const utcAMadrid = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
/** Días de calendario desde una fecha (0 = hoy, 1 = ayer…). */
const diasDesde = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00` : iso); const h = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), b = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
};

interface Actividad { key: string; at: string; titulo: string; detalle: string; tipo: 'firma' | 'correo' | 'whatsapp' | 'factura' | 'proveedor'; to: string }

function Tile({ to, titulo, valor, detalle, destacado }: { to: string; titulo: string; valor: number; detalle: string; destacado?: boolean }) {
  return (
    <Link to={to} className={`inicio-tile${destacado ? ' destacado' : ''}`}>
      <span className="inicio-tile-top">
        {titulo}
        <span className="inicio-tile-go"><ArrowUpRight size={18} strokeWidth={2.6} /></span>
      </span>
      <span className="inicio-tile-num">{valor}</span>
      <span className="inicio-tile-sub">{detalle}</span>
    </Link>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const esMovil = useIsMobile();
  const pegatina = esMovil;
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [notes, setNotes] = useState<ClientDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [docs, setDocs] = useState<DocumentListItem[]>([]);

  const load = useCallback(async () => {
    setLoadError(null);
    const [st, fi, dc] = await Promise.allSettled([getDashboardStats(), listFirmas(), listDocuments()]);
    if (st.status === 'fulfilled') setStats(st.value.data);
    if (fi.status === 'fulfilled') setNotes(fi.value.data);
    if (dc.status === 'fulfilled') setDocs(dc.value.data);
    if (st.status === 'rejected' && fi.status === 'rejected') setLoadError(describeApiError(st.reason));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const s = stats ?? EMPTY_STATS;
  const porFirmar = notes.filter(n => n.status === 'pendiente');
  const porFacturar = notes.filter(n => n.status === 'firmado' && !n.facturado_at);
  const importeFacturar = porFacturar.reduce((t, n) => t + (n.importe ?? 0), 0);
  const empresasFacturar = new Set(porFacturar.map(n => n.codigo_cliente || n.cliente || '—')).size;
  // Antigüedad por la fecha del albarán (la de treyFACT); si no se leyó, por cuándo se subió
  const viejo = porFirmar.reduce((m, n) => Math.max(m, diasDesde(n.fecha || utcAMadrid(n.created_at))), 0);
  const detalleFirmar = porFirmar.length === 0 ? 'Todo firmado'
    : viejo === 0 ? 'Albaranes de hoy'
    : viejo === 1 ? 'Desde ayer'
    : porFirmar.length === 1 ? `Hace ${viejo} días` : `El más antiguo, hace ${viejo} días`;
  // Albaranes de proveedor leídos que falta revisar y pasar a TreyFACT
  const porTerminar = docs.filter(d => !d.terminado_at && (d.status === 'completed' || d.status === 'error'));

  // Lo que se ha hecho hoy, lo más reciente arriba
  const actividad = useMemo<Actividad[]>(() => {
    const hoy = hoyISO();
    const a: Actividad[] = [];
    notes.forEach(n => {
      const cli = n.cliente || 'Cliente sin identificar';
      if (n.signed_at?.startsWith(hoy)) a.push({ key: `f${n.id}`, at: n.signed_at, titulo: `Firmado ${n.numero}`, detalle: `${cli}${n.signed_by ? ` · firmó ${n.signed_by}` : ''}`, tipo: 'firma', to: `/firmas/${n.id}` });
      if (n.emailed_at?.startsWith(hoy)) a.push({ key: `e${n.id}`, at: n.emailed_at, titulo: `Enviado por correo ${n.numero}`, detalle: n.emailed_to || cli, tipo: 'correo', to: `/firmas/${n.id}` });
      if (n.whatsapp_at?.startsWith(hoy)) a.push({ key: `w${n.id}`, at: n.whatsapp_at, titulo: `Enviado por WhatsApp ${n.numero}`, detalle: cli, tipo: 'whatsapp', to: `/firmas/${n.id}` });
      if (n.facturado_at?.startsWith(hoy)) a.push({ key: `b${n.id}`, at: n.facturado_at, titulo: `Facturado ${n.numero}`, detalle: cli, tipo: 'factura', to: `/firmas/${n.id}` });
    });
    s.recent_documents.forEach(d => {
      const subido = utcAMadrid(d.created_at);
      if (subido.startsWith(hoy) && !ES_MANUAL(d.supplier_name)) a.push({ key: `d${d.id}`, at: subido, titulo: 'Albarán de proveedor procesado', detalle: d.supplier_name || d.original_filename, tipo: 'proveedor', to: `/documento/${d.id}` });
    });
    return a.sort((x, y) => (y.at > x.at ? 1 : -1)).slice(0, 7);
  }, [notes, s.recent_documents]);

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    if (!files.length) { if (list?.length) setLoadError('Solo se pueden subir archivos PDF'); return; }
    setSubiendo(true);
    try {
      const { data } = await uploadFirmas(files);
      navigate(data.some(d => d.status === 'pendiente') ? '/firmas?vista=firmar' : '/firmas?vista=todos');
    } catch (err) {
      setLoadError(`No se pudieron subir: ${describeApiError(err)}`);
      setSubiendo(false);
    }
  };

  const iconos = { firma: PenLine, correo: Mail, whatsapp: MessageCircle, factura: Receipt, proveedor: FileText };

  return (
    <div className="page inicio">
      {pegatina && <CabeceraPegatina />}
      {loadError && <ConnectionError message={loadError} onRetry={load} />}

      <header className="inicio-head">
        <div>
          <h1>{saludo()}</h1>
          <p>{hoyTexto()}. Esto es lo que tenéis pendiente.</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => { if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); } }} disabled={subiendo}>
          <Upload size={19} /> {subiendo ? 'Subiendo…' : 'Subir albaranes para firmar'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={e => onFiles(e.target.files)} />
      </header>

      <CorreoCard />
      <TurnoHoy />
      <AvisosCard />

      {(s.orders.recibido > 0 || s.repairs.reparada > 0) && (
        <section className="inicio-buenas" aria-label="Buenas noticias">
          {s.orders.recibido > 0 && (
            <Link to="/pedidos" className="buena-noticia">
              <Ilustracion dibujo="cajaOk" tam={64} />
              <div>
                <b>{s.orders.recibido === 1 ? 'Ha llegado un pedido' : `Han llegado ${s.orders.recibido} pedidos`}</b>
                <small>Ya está en la tienda: falta avisar o entregar al cliente.</small>
                <span className="enl">Ver pedidos ›</span>
              </div>
            </Link>
          )}
          {s.repairs.reparada > 0 && (
            <Link to="/reparaciones" className="buena-noticia">
              <Ilustracion dibujo="llave" tam={64} />
              <div>
                <b>{s.repairs.reparada === 1 ? 'Hay una reparación lista' : `Hay ${s.repairs.reparada} reparaciones listas`}</b>
                <small>Avisa al cliente para que pase a recogerla.</small>
                <span className="enl">Ver reparaciones ›</span>
              </div>
            </Link>
          )}
        </section>
      )}

      <section className="inicio-tiles" aria-label="Pendiente">
        <Tile to="/firmas?vista=firmar" destacado titulo="Por firmar" valor={loading ? 0 : porFirmar.length}
          detalle={detalleFirmar} />
        <Tile to="/firmas?vista=facturar" titulo="Por facturar" valor={loading ? 0 : porFacturar.length}
          detalle={porFacturar.length === 0 ? 'Nada pendiente' : `De ${empresasFacturar} empresa${empresasFacturar !== 1 ? 's' : ''}${importeFacturar > 0 ? ` · ${euros(importeFacturar)}` : ''}`} />
        <Tile to="/reparaciones" titulo="Reparaciones listas" valor={s.repairs.reparada}
          detalle={s.repairs.reparada ? 'Para avisar al cliente' : `${s.repairs.pending} en curso`} />
        <Tile to="/pedidos" titulo="Pedidos sin completar" valor={s.orders.pending}
          detalle={s.orders.pending ? 'Esperando al proveedor' : 'Todo recibido'} />
      </section>

      <div className="inicio-cols">
        <section className="card inicio-bloque" aria-label="Para no olvidar">
          <h2>Para no olvidar</h2>
          {porTerminar.length > 0 && (
            <Link to="/albaranes" className="inicio-aviso">
              <span className="inicio-aviso-ico"><FileText size={20} /></span>
              <span className="inicio-aviso-txt">
                <b>{porTerminar.length === 1 ? 'Un albarán de proveedor por terminar' : `${porTerminar.length} albaranes de proveedor por terminar`}</b>
                <small>Revisar precios y pasar a TreyFACT{porTerminar.some(d => d.status === 'error') ? ' · alguno no se pudo leer' : ''}</small>
              </span>
              <span className="btn btn-primary btn-sm">Ver</span>
            </Link>
          )}
          <div className="firmas-avisos inicio-avisos"><FirmasAvisos /></div>
          {porTerminar.length === 0 && <p className="inicio-aldia">Todo al día. Aquí saldrá lo que se esté quedando atrás.</p>}
        </section>


        <section className="card inicio-bloque inicio-hoy-bloque" aria-label="Hoy">
          <h2>Hoy</h2>
          {actividad.length === 0 ? (
            <p style={{ color: 'var(--text-2)', fontSize: 15 }}>Todavía no se ha firmado ni enviado nada hoy.</p>
          ) : (
            <ul className="inicio-hoy cf-enter">
              {actividad.map(a => {
                const Icon = iconos[a.tipo];
                return (
                  <li key={a.key}>
                    <Link to={a.to}>
                      <span className={`inicio-hoy-ico ${a.tipo}`}>{a.tipo === 'firma' ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}</span>
                      <span className="inicio-hoy-txt"><b>{a.titulo}</b><small>{a.detalle} · {hora(a.at)}</small></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="inicio-rapidos accesos-peg" aria-label="Accesos rápidos">
        <AccesoPegatina to="/firmas" dibujo="albaranBoli" escala={1.05} lineas={['Firmar', 'un albarán']} giro={-3} />
        <AccesoPegatina to="/consulta" dibujo="precio" escala={1.15} lineas={['Consultar', 'un precio']} giro={3} color="#1F5A3A" />
        <AccesoPegatina to="/reparaciones?new=1" dibujo="llaveSola" escala={1.4} lineas={['Nueva', 'reparación']} giro={3} color="#1F5A3A" />
        <AccesoPegatina to="/pedidos?new=1" dibujo="cajaMas" escala={1.5} lineas={['Nuevo', 'pedido']} giro={-3} />
      </section>
    </div>
  );
}
