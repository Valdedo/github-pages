/**
 * Piezas comunes de Pedidos y Reparaciones (versión nueva, nov. 2026; ver `lib/encargosNuevo.ts`).
 * Las dos pantallas tienen la misma forma: cabecera + buscador, y secciones por lo que toca hacer.
 * Cada fila: quién · qué, una línea de estado y como mucho UN botón (el siguiente paso).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Plus, Search, X } from 'lucide-react';
import '../pages/encargos.css';

export function EncCabecera({ titulo, nuevo, onNuevo, busca, setBusca, placeholder }: {
  titulo: string; nuevo: string; onNuevo: () => void;
  busca: string; setBusca: (s: string) => void; placeholder: string;
}) {
  return (
    <>
      <div className="enc-cab">
        <h1>{titulo}</h1>
        <button className="btn btn-primary" onClick={onNuevo} aria-label={nuevo}>
          <Plus size={18} /> <span className="enc-largo">{nuevo}</span><span className="enc-corto">{nuevo.split(' ')[0]}</span>
        </button>
      </div>
      <div className="enc-busca">
        <Search size={17} aria-hidden="true" />
        <input type="search" className="form-input" placeholder={placeholder} value={busca}
          onChange={e => setBusca(e.target.value)} aria-label={placeholder} />
        {busca && <button className="enc-busca-x" onClick={() => setBusca('')} aria-label="Borrar la búsqueda"><X size={16} /></button>}
      </div>
    </>
  );
}

/** Una sección («Avisar al cliente», «Por pedir»…). Vacía: en el móvil no sale; en el ordenador queda la columna con «Nada». */
export function EncSeccion({ titulo, n, aviso, ayuda, vacio = 'Nada', children }: {
  titulo: string; n: number; aviso?: boolean; ayuda?: string; vacio?: string; children?: ReactNode;
}) {
  return (
    <section className={`enc-sec${n === 0 ? ' vacia' : ''}${aviso && n > 0 ? ' aviso' : ''}`} aria-label={titulo}>
      <h2><span>{titulo}</span><span className="enc-n">{n}</span></h2>
      {ayuda && n > 0 && <p className="enc-ayuda">{ayuda}</p>}
      {n === 0 ? <p className="enc-nada">{vacio}</p> : <div className="enc-filas">{children}</div>}
    </section>
  );
}

export function EncFila({ titulo, detalle, estado, tono, accion, onAbrir }: {
  titulo: ReactNode;
  /** Qué es: artículos, herramienta… (una línea, se corta) */
  detalle?: ReactNode;
  /** Cómo va: «Llegó ayer», «Retrasado 3 días»… */
  estado?: ReactNode;
  tono?: 'mal' | 'bien' | 'pend';
  accion?: ReactNode;
  onAbrir: () => void;
}) {
  return (
    <div className="enc-fila" onClick={onAbrir} role="link" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onAbrir(); }}>
      <div className="enc-fila-txt">
        <b>{titulo}</b>
        {detalle && <span className="enc-det">{detalle}</span>}
        {estado && <span className={`enc-est${tono ? ' ' + tono : ''}`}>{estado}</span>}
      </div>
      {accion
        ? <div className="enc-acc" onClick={e => e.stopPropagation()}>{accion}</div>
        : <ChevronRight size={18} className="enc-flecha" aria-hidden="true" />}
    </div>
  );
}

/** Grupo dentro de una sección (p. ej. los pedidos por pedir de un mismo proveedor). */
export function EncGrupo({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <div className="enc-grupo">
      <div className="enc-grupo-cab"><span>{titulo}</span>{accion}</div>
      {children}
    </div>
  );
}

/** Lo ya terminado: plegado; al abrirlo, 5 y «Ver más». Con búsqueda se abre solo. */
export function EncHechos<T>({ titulo, items, abierto: forzado, fila }: {
  titulo: string; items: T[]; abierto?: boolean; fila: (x: T) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [n, setN] = useState(5);
  if (!items.length) return null;
  const ver = abierto || !!forzado;
  return (
    <div className="enc-hechos">
      <button className="enc-hechos-btn" onClick={() => setAbierto(v => !v)} aria-expanded={ver}>
        <ChevronRight size={16} style={{ transform: ver ? 'rotate(90deg)' : 'none' }} aria-hidden="true" />
        {titulo} ({items.length})
      </button>
      {ver && (
        <div className="enc-filas hechos">
          {items.slice(0, n).map(fila)}
          {items.length > n && <button className="btn btn-ghost btn-sm enc-mas" onClick={() => setN(v => v + 5)}>Ver más</button>}
        </div>
      )}
    </div>
  );
}

/** Ventana de alta. Pregunta antes de cerrar si hay algo escrito. */
export function EncModal({ titulo, escrito, error, guardando, boton, onCerrar, onGuardar, children }: {
  titulo: string; escrito: boolean; error: string; guardando: boolean; boton: string;
  onCerrar: () => void; onGuardar: () => void; children: ReactNode;
}) {
  const cerrar = () => { if (!escrito || window.confirm('¿Cerrar sin guardar? Se perderá lo que has escrito.')) onCerrar(); };
  const ref = useRef(cerrar); ref.current = cerrar;
  const errRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  useEffect(() => { if (error) errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);
  return (
    <div className="modal-overlay">
      <div className="modal rep-modal enc-modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>{titulo}</span>
          <button className="modal-close" onClick={cerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onGuardar(); }}>
          <div className="enc-modal-cuerpo">
            {error && <div className="doc-aviso error" ref={errRef} role="alert">{error}</div>}
            {children}
          </div>
          <div className="enc-modal-pie">
            <button type="button" className="btn btn-ghost" onClick={cerrar}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : boton}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Pregunta de un dato (con sugerencias), p. ej. «¿A qué taller va?». Se puede dejar vacío. */
export function EncPregunta({ titulo, texto, sugerencias, boton, onCancel, onOk }: {
  titulo: string; texto: string; sugerencias: string[]; boton: string;
  onCancel: () => void; onOk: (v: string) => void;
}) {
  const [v, setV] = useState('');
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>{titulo}</span>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onOk(v.trim()); }}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="form-label" htmlFor="enc-preg">{texto}</label>
            <input id="enc-preg" className="form-input" list="enc-preg-lista" value={v} autoFocus autoComplete="off"
              onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onCancel(); }} />
            <datalist id="enc-preg-lista">{sugerencias.map(s => <option key={s} value={s} />)}</datalist>
            {sugerencias.length > 0 && (
              <div className="enc-chips">
                {sugerencias.slice(0, 6).map(s => <button type="button" key={s} className="enc-chip" onClick={() => onOk(s)}>{s}</button>)}
              </div>
            )}
          </div>
          <div className="enc-modal-pie">
            <button type="button" className="btn btn-ghost" onClick={() => onOk('')}>Sin decir</button>
            <button type="submit" className="btn btn-primary">{boton}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Nombres distintos (sin repetir mayúsculas/tildes), los más usados primero. */
export function sugerir(nombres: (string | null | undefined)[]): string[] {
  const m = new Map<string, { t: string; n: number }>();
  for (const x of nombres) {
    const t = (x || '').trim();
    if (!t || t === '__manual__') continue;
    const k = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const e = m.get(k);
    if (e) e.n++; else m.set(k, { t, n: 1 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.t.localeCompare(b.t, 'es')).map(e => e.t);
}

/** Cliente con autocompletado; al elegir uno conocido rellena su teléfono si estaba vacío. */
export function CampoCliente({ cliente, telefono, setCliente, setTelefono, conocidos }: {
  cliente: string; telefono: string;
  setCliente: (s: string) => void; setTelefono: (s: string) => void;
  /** nombre → teléfono (el último que se usó) */
  conocidos: Map<string, string>;
}) {
  const nombres = [...conocidos.keys()];
  const elegir = (v: string) => {
    setCliente(v);
    const tel = conocidos.get(v);
    if (tel && !telefono.trim()) setTelefono(tel);
  };
  return (
    <div className="enc-2">
      <div>
        <label className="form-label" htmlFor="enc-cli">Nombre *</label>
        <input id="enc-cli" className="form-input" list="enc-cli-lista" value={cliente} autoComplete="off" autoFocus
          onChange={e => elegir(e.target.value)} placeholder="Nombre del cliente" />
        <datalist id="enc-cli-lista">{nombres.map(n => <option key={n} value={n} />)}</datalist>
      </div>
      <div>
        <label className="form-label" htmlFor="enc-tel">Teléfono <small>(para avisarle)</small></label>
        <input id="enc-tel" className="form-input" type="tel" inputMode="tel" value={telefono}
          onChange={e => setTelefono(e.target.value)} placeholder="666 123 456" />
      </div>
    </div>
  );
}

/** nombre de cliente → último teléfono, de una lista de pedidos o reparaciones. */
export function clientesConocidos(items: { client_name?: string | null; client_phone?: string | null }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of sugerir(items.map(i => i.client_name))) m.set(n, '');
  for (const i of items) {
    const n = (i.client_name || '').trim();
    if (n && i.client_phone && m.has(n) && !m.get(n)) m.set(n, i.client_phone);
  }
  return m;
}

// ─── Fichas (nov. 2026) ──────────────────────────────────────────────────────

export interface Hito {
  /** «Apuntado», «Pedido a Zabaleta», «Llegó»… */
  texto: string;
  /** Fecha o detalle cuando ya pasó («hoy», «el 28/10»); vacío si no hay fecha guardada */
  cuando?: string;
  hecho: boolean;
  /** Es el paso en el que está ahora (lo siguiente por hacer) */
  ahora?: boolean;
}

/** Línea de tiempo: lo hecho con su fecha, lo que toca resaltado, lo que falta en gris. */
export function EncLinea({ hitos }: { hitos: Hito[] }) {
  return (
    <ol className="enc-linea">
      {hitos.map((h, i) => (
        <li key={i} className={h.hecho ? 'hecho' : h.ahora ? 'ahora' : ''}>
          <span className="enc-linea-bola" aria-hidden="true">{h.hecho ? '✓' : ''}</span>
          <span className="enc-linea-txt">{h.texto}{h.cuando && <small>{h.cuando}</small>}</span>
        </li>
      ))}
    </ol>
  );
}

/** Cabecera de ficha: volver, cliente, teléfono y estado. */
export function EncFichaCab({ volver, onVolver, cliente, telefono, estado, tono, onEditar }: {
  volver: string; onVolver: () => void; cliente: string; telefono?: string | null;
  estado: string; tono?: 'bien' | 'pend' | 'mal' | 'gris'; onEditar?: () => void;
}) {
  return (
    <div className="enc-ficha-cab">
      <button className="doc-volver" onClick={onVolver}>‹ {volver}</button>
      <div className="enc-ficha-tit">
        <h1>{cliente || '—'}</h1>
        <span className={`enc-estado ${tono || 'gris'}`}>{estado}</span>
      </div>
      <div className="enc-ficha-sub">
        {telefono ? <a href={`tel:${telefono}`} className="enc-tel">{telefono}</a> : <span className="enc-sin-tel">Sin teléfono</span>}
        {onEditar && <button className="btn btn-ghost btn-sm" onClick={onEditar}>Editar</button>}
      </div>
    </div>
  );
}

/** Tarjeta «Lo que toca ahora»: un texto corto y el botón grande del siguiente paso. */
export function EncAhora({ texto, children, mas, atras }: { texto: ReactNode; children?: ReactNode; mas?: ReactNode; atras?: ReactNode }) {
  return (
    <div className="card enc-ahora">
      <p>{texto}</p>
      {children && <div className="enc-ahora-btns">{children}</div>}
      {mas && <div className="enc-ahora-mas">{mas}</div>}
      {atras && <div className="enc-ahora-atras">{atras}</div>}
    </div>
  );
}

/** Datos para leer: etiqueta a la izquierda (arriba en el móvil), valor a la derecha. */
export function EncDatos({ filas }: { filas: [string, ReactNode][] }) {
  const con = filas.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false);
  if (!con.length) return null;
  return (
    <dl className="enc-datos">
      {con.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

// ─── Formularios por bloques (6/11/2026) ─────────────────────────────────────
// Al apuntar solo se pide quién, qué y a dónde. Las fechas se ponen solas y el presupuesto
// o cuándo llega se apuntan en la ficha cuando se saben (EncCuando, ImporteModal).

/** Bloque numerado de un formulario: «1 Cliente», «2 Qué hay que pedir»… */
export function EncBloque({ n, titulo, nota, children }: { n?: number; titulo: string; nota?: string; children: ReactNode }) {
  return (
    <fieldset className="enc-fb">
      <legend>{n != null && <span className="enc-fb-n" aria-hidden="true">{n}</span>}{titulo}{nota && <small>{nota}</small>}</legend>
      <div className="enc-fb-campos">{children}</div>
    </fieldset>
  );
}

/** Elegir de los más usados con un toque, o escribir otro. */
export function EncElegir({ id, valor, onChange, opciones, placeholder }: {
  id: string; valor: string; onChange: (v: string) => void; opciones: string[]; placeholder: string;
}) {
  const top = opciones.slice(0, 5);
  const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const enTop = top.some(o => igual(o, valor));   // elegido con un botón: el campo de «otro» queda vacío
  return (
    <>
      {top.length > 0 && (
        <div className="enc-chips" role="group">
          {top.map(o => (
            <button type="button" key={o} className={`enc-chip${igual(o, valor) ? ' si' : ''}`} aria-pressed={igual(o, valor)}
              onClick={() => onChange(igual(o, valor) ? '' : o)}>{o}</button>
          ))}
        </div>
      )}
      <input id={id} className="form-input" list={`${id}-lista`} value={enTop ? '' : valor} autoComplete="off"
        onChange={e => onChange(e.target.value)} placeholder={top.length ? 'U otro: escríbelo aquí' : placeholder} />
      <datalist id={`${id}-lista`}>{opciones.map(o => <option key={o} value={o} />)}</datalist>
    </>
  );
}

/** «+ Añadir una nota»: el campo solo aparece si hace falta. */
export function EncNota({ id, valor, onChange, placeholder }: { id: string; valor: string; onChange: (v: string) => void; placeholder: string }) {
  const [abierta, setAbierta] = useState(!!valor);
  if (!abierta) return <button type="button" className="enc-link enc-nota-btn" onClick={() => setAbierta(true)}><Plus size={15} /> Añadir una nota</button>;
  return (
    <div>
      <label className="form-label" htmlFor={id}>Nota</label>
      <textarea id={id} className="form-input" rows={2} value={valor} autoFocus onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

const isoMas = (dias: number) => {
  const d = new Date(); d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** «¿Cuándo llega?» con un toque: mañana, en 2-3 días, en una semana… o una fecha. */
export function EncCuando({ titulo, actual, onCancel, onOk }: {
  titulo: string; actual?: string | null; onCancel: () => void; onOk: (iso: string | null) => void;
}) {
  const [otra, setOtra] = useState('');
  const ops: [string, number][] = [['Mañana', 1], ['En 2 o 3 días', 3], ['En una semana', 7], ['En dos semanas', 14]];
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>{titulo}</span>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="enc-cuando">
            {ops.map(([t, n]) => <button key={t} type="button" className="enc-chip grande" onClick={() => onOk(isoMas(n))}>{t}</button>)}
          </div>
          <form className="enc-cuando-otra" onSubmit={e => { e.preventDefault(); if (otra) onOk(otra); }}>
            <label className="form-label" htmlFor="enc-cuando-f">U otro día</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="enc-cuando-f" className="form-input" type="date" min={isoMas(0)} value={otra} onChange={e => setOtra(e.target.value)} style={{ margin: 0 }} />
              <button type="submit" className="btn btn-primary" disabled={!otra}>Poner</button>
            </div>
          </form>
          {actual && <button type="button" className="enc-link" style={{ alignSelf: 'flex-start' }} onClick={() => onOk(null)}>Quitar la fecha</button>}
        </div>
      </div>
    </div>
  );
}
