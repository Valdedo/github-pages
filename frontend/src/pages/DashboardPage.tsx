import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Upload, PenLine, Search, Wrench, Plus, Check, Mail, Receipt, MessageCircle, FileText,
} from 'lucide-react';
import { getDashboardStats, listFirmas, uploadFirmas, describeApiError } from '../api/client';
import { ConnectionError } from '../components/ConnectionError';
import { FirmasAvisos } from '../components/FirmasAvisos';
import type { ClientDeliveryNote, DashboardStats } from '../types';

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [notes, setNotes] = useState<ClientDeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const [st, fi] = await Promise.allSettled([getDashboardStats(), listFirmas()]);
    if (st.status === 'fulfilled') setStats(st.value.data);
    if (fi.status === 'fulfilled') setNotes(fi.value.data);
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
  const viejo = porFirmar.reduce((m, n) => Math.max(m, Math.floor((Date.now() - new Date(n.created_at).getTime()) / 86400000)), 0);

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
      if (d.created_at?.startsWith(hoy)) a.push({ key: `d${d.id}`, at: d.created_at, titulo: 'Albarán de proveedor procesado', detalle: d.supplier_name || d.original_filename, tipo: 'proveedor', to: `/documento/${d.id}` });
    });
    return a.sort((x, y) => (y.at > x.at ? 1 : -1)).slice(0, 7);
  }, [notes, s.recent_documents]);

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list || []).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    if (!files.length) return;
    setSubiendo(true);
    try {
      await uploadFirmas(files);
      navigate('/firmas?vista=firmar');
    } catch (err) {
      setLoadError(`No se pudieron subir: ${describeApiError(err)}`);
      setSubiendo(false);
    }
  };

  const iconos = { firma: PenLine, correo: Mail, whatsapp: MessageCircle, factura: Receipt, proveedor: FileText };

  return (
    <div className="page inicio">
      {loadError && <ConnectionError message={loadError} onRetry={load} />}

      <header className="inicio-head">
        <div>
          <h1>{saludo()}</h1>
          <p>{hoyTexto()}. Esto es lo que tenéis pendiente.</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => fileRef.current?.click()} disabled={subiendo}>
          <Upload size={19} /> {subiendo ? 'Subiendo…' : 'Subir albaranes para firmar'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={e => onFiles(e.target.files)} />
      </header>

      <section className="inicio-tiles" aria-label="Pendiente">
        <Tile to="/firmas?vista=firmar" destacado titulo="Por firmar" valor={loading ? 0 : porFirmar.length}
          detalle={porFirmar.length === 0 ? 'Todo firmado' : viejo >= 2 ? `Uno lleva ${viejo} días esperando` : 'Albaranes de hoy'} />
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
          <div className="firmas-avisos inicio-avisos"><FirmasAvisos /></div>
          {s.repairs.reparada === 0 && <p className="inicio-aldia">Todo al día. Aquí saldrá lo que se esté quedando atrás.</p>}
          {s.repairs.reparada > 0 && (
            <Link to="/reparaciones" className="inicio-aviso">
              <span className="inicio-aviso-ico"><Wrench size={20} /></span>
              <span className="inicio-aviso-txt">
                <b>{s.repairs.reparada} reparación{s.repairs.reparada > 1 ? 'es' : ''} lista{s.repairs.reparada > 1 ? 's' : ''} para entregar</b>
                <small>Llama al cliente para que pase a recogerla</small>
              </span>
              <span className="btn btn-primary btn-sm">Ver</span>
            </Link>
          )}
        </section>

        <section className="card inicio-bloque" aria-label="Hoy">
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

      <section className="inicio-rapidos" aria-label="Accesos rápidos">
        <Link to="/firmas" className="inicio-rapido"><span><PenLine size={22} /></span>Firmar un albarán</Link>
        <Link to="/consulta" className="inicio-rapido"><span><Search size={22} /></span>Consultar un precio</Link>
        <Link to="/reparaciones?new=1" className="inicio-rapido"><span><Wrench size={22} /></span>Nueva reparación</Link>
        <Link to="/pedidos?new=1" className="inicio-rapido"><span><Plus size={22} /></span>Nuevo pedido</Link>
      </section>
    </div>
  );
}
