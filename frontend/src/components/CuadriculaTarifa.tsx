import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Info, Minus } from 'lucide-react';
import { normaliza } from '../lib/texto';
import { eur, conIva, fotoArticulo, pegatina, claveFamilia, type Tarifa, type TarifaFamilia, type TarifaMedida } from '../lib/tarifas';
import './cuadricula.css';

// ════════════════════════════════════════════════════════════════════════
// Tarifa en cuadrícula (bombonas de gas, oct. 2026; morteros y piensos, 17/10/2026): pocos artículos, todos de golpe
// con su foto, nombre y precio. Cada grupo (Repsol, Cepsa, Cargas…) ocupa tantas columnas como artículos tiene (6 como
// mucho) y el de uno solo, dos (una tarjeta ancha). Si una fila de 6 queda corta, sus grupos que quepan pasan a tarjetas
// anchas hasta llenarla (las 3 juntas solas en su fila ocupan las 6 columnas). En pantallas estrechas cada grupo va en
// su fila. Ordenador y móvil: la tarjeta abre la ficha. Tableta: cada toque suma uno a lo apuntado.
// ════════════════════════════════════════════════════════════════════════

export type Celda = { f: TarifaFamilia; m: TarifaMedida };
type Grupo = { familia: string; primero: boolean; titulo: string; items: Celda[] };

/** Los grupos en el orden de la tarifa (familia → sección). */
export function gruposDe(t: Tarifa): Grupo[] {
  const out: Grupo[] = [];
  for (const f of t.familias) {
    let primero = true;
    for (const g of f.grupos) {
      const titulo = g.seccion ?? g.titulo ?? f.nombre;
      const u = out[out.length - 1];
      if (u && u.familia === f.nombre && u.titulo === titulo) { u.items.push(...g.medidas.map(m => ({ f, m }))); continue; }
      out.push({ familia: f.nombre, primero, titulo, items: g.medidas.map(m => ({ f, m })) });
      primero = false;
    }
  }
  return out;
}

const COLUMNAS = 6;
type Puesto = { g: Grupo; ancha: boolean; n: number };
/** Columnas de cada grupo (en el ordenador) y si va en tarjetas anchas, para que las filas de 6 queden completas. */
export function repartir(gs: Grupo[]): Puesto[] {
  const out: Puesto[] = gs.map(g => {
    const k = g.items.length;
    return { g, ancha: k === 1, n: k === 1 ? 2 : Math.min(k, COLUMNAS) };
  });
  let fila: Puesto[] = [], usado = 0;
  const cerrar = () => {
    let r = COLUMNAS - usado;
    for (let i = fila.length - 1; i >= 0 && r > 0; i--) {
      const x = fila[i], k = x.g.items.length;
      if (!x.ancha && k <= r && k * 2 <= COLUMNAS) { x.ancha = true; x.n = k * 2; r -= k; }
    }
    fila = []; usado = 0;
  };
  for (const x of out) {
    if (usado && x.n > COLUMNAS - usado) cerrar();
    fila.push(x); usado += x.n;
    if (usado >= COLUMNAS) cerrar();
  }
  if (fila.length) cerrar();
  return out;
}

const sinS = (w: string) => w.replace(/s$/, '');
const SUELTAS = new Set(['de', 'del', 'con', 'para', 'y', 'a', 'en']);
/** El nombre sin lo que ya dice el título del grupo: «Butano Repsol» en Repsol → «Butano»; «Carga grande azul» en
 *  Cargas → «Grande azul»; «Envase 2,8 kg» en Envases → «2,8 kg». */
export function nombreCorto(desc: string, grupo: string): string {
  const pal = desc.trim().split(/\s+/);
  const n = pal.map(p => sinS(normaliza(p)));
  const g = normaliza(grupo).split(/\s+/).filter(Boolean).map(sinS);
  let a = 0, b = pal.length;
  if (g.length < pal.length && g.every((w, i) => n[i] === w)) a = g.length;
  else if (g.length < pal.length && g.every((w, i) => n[pal.length - g.length + i] === w)) b = pal.length - g.length;
  const resto = pal.slice(a, b);
  // «Harina de maíz» en Maíz no se queda en «Harina de»
  // ni «Mezcla 50 %» en Mezclas en «50 %» (lo que queda empieza por un número)
  if (!resto.length || SUELTAS.has(normaliza(resto[resto.length - 1])) || SUELTAS.has(normaliza(resto[0])) || /^\d/.test(resto[0])) return desc;
  const r = resto.join(' ');
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/** «Avipuesta Oro Plus · Saco 10 kg» → «Avipuesta Oro Plus» (el formato va en su renglón, debajo). */
const sinFormato = (m: TarifaMedida) =>
  m.formato && m.descripcion.endsWith(` · ${m.formato}`) ? m.descripcion.slice(0, -(m.formato.length + 3)) : m.descripcion;

export function CuadriculaTarifa({ t, iva = true, grande, enlace, onTocar, cuentaDe, onQuitar, onInfo }: {
  t: Tarifa;
  /** Precio grande con IVA (si no, sin IVA) */
  iva?: boolean;
  /** Tableta: tarjetas más grandes */
  grande?: boolean;
  /** Ordenador y móvil: adónde lleva la tarjeta (la ficha) */
  enlace?: (c: Celda) => string;
  /** Tableta: cada toque suma uno */
  onTocar?: (c: Celda) => void;
  cuentaDe?: (c: Celda) => number;
  onQuitar?: (c: Celda) => void;
  /** Tableta: botón «i» de los que tienen «Para qué sirve» (morteros, piensos) */
  onInfo?: (c: Celda) => void;
}) {
  return (
    <div className={`gc${grande ? ' gc-grande' : ''}`}>
      {repartir(gruposDe(t)).map(({ g, ancha, n }, i) => {
        // La familia, encima de su primer grupo (si no se llama igual que él); en los demás queda el hueco para que
        // las tarjetas casen
        const fam = g.primero && normaliza(g.familia) !== normaliza(g.titulo);
        return (
          <section key={i} className={`gc-grupo${ancha ? ' gc-ancha' : ''}`} style={{ '--n': n } as CSSProperties}>
            <h3 className="gc-tit"><small className={fam ? undefined : 'gc-hueco'}>{fam ? g.familia : ' '}</small>{g.titulo}</h3>
            <div className="gc-fila">
              {g.items.map(c => (
                <Tarjeta key={c.m.ref} c={c} nombre={nombreCorto(sinFormato(c.m), g.titulo)} iva={iva}
                  enlace={enlace} onTocar={onTocar} cuenta={cuentaDe?.(c) ?? 0} onQuitar={onQuitar} onInfo={onInfo} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Tarjeta({ c, nombre, iva, enlace, onTocar, cuenta, onQuitar, onInfo }: {
  c: Celda; nombre: string; iva: boolean; enlace?: (c: Celda) => string; onTocar?: (c: Celda) => void;
  cuenta: number; onQuitar?: (c: Celda) => void; onInfo?: (c: Celda) => void;
}) {
  const grande = iva ? conIva(c.m) : c.m.pvp;
  const otro = iva ? c.m.pvp : conIva(c.m);
  const foto = fotoArticulo(c.f.nombre, c.m.descripcion, c.m.foto) || pegatina(claveFamilia(c.f.nombre));
  const dentro: ReactNode = (
    <>
      <span className="gc-foto">
        <img src={foto} alt="" loading="lazy" />
        {cuenta > 0 && <b key={cuenta} className="gc-cuenta" aria-label={`Apuntados: ${cuenta}`}>{cuenta}</b>}
      </span>
      <span className="gc-txt">
        <span className="gc-nom">{nombre}</span>
        {c.m.formato && <span className="gc-formato">{c.m.formato}</span>}
        <strong className="gc-precio">{eur(grande)}</strong>
        {otro != null && <small>{eur(otro)} {iva ? 'sin' : 'con'} IVA</small>}
      </span>
    </>
  );
  if (onTocar) {
    return (
      <div className={`gc-celda${cuenta > 0 ? ' con-cuenta' : ''}`}>
        <button type="button" className="gc-toca" onClick={() => onTocar(c)} aria-label={`Apuntar 1 · ${c.m.descripcion}`}>{dentro}</button>
        {cuenta > 0 && onQuitar && (
          <button type="button" className="gc-menos" onClick={() => onQuitar(c)} aria-label="Quitar uno"><Minus size={24} /></button>
        )}
        {onInfo && c.m.producto && (
          <button type="button" className="gc-info" onClick={() => onInfo(c)} aria-label={`Para qué sirve · ${c.m.descripcion}`}>
            <Info size={26} />
          </button>
        )}
      </div>
    );
  }
  return <Link className="gc-celda gc-toca" to={enlace ? enlace(c) : '#'} title={c.m.descripcion}>{dentro}</Link>;
}

// ════════════════════════════════════════════════════════════════════════
// Lista compacta para el ordenador (17/10/2026, Andrés: la cuadrícula de los piensos quedaba muy grande en el ordenador).
// Cada grupo es una tarjeta con una línea por artículo (foto pequeña, nombre, formato y código, precio); las tarjetas van
// en columnas que se reparten solas por el ancho de la pantalla. La línea abre la ficha.
// ════════════════════════════════════════════════════════════════════════
export function ListaTarifa({ t, iva = true, enlace }: { t: Tarifa; iva?: boolean; enlace: (c: Celda) => string }) {
  return (
    <div className="gl">
      {gruposDe(t).map((g, i) => {
        const fam = g.primero && normaliza(g.familia) !== normaliza(g.titulo);
        return (
          <section key={i} className="gl-grupo">
            <h3 className="gl-tit">{fam && <small>{g.familia}</small>}{g.titulo}</h3>
            <ul>
              {g.items.map(c => {
                const grande = iva ? conIva(c.m) : c.m.pvp;
                const otro = iva ? c.m.pvp : conIva(c.m);
                const foto = fotoArticulo(c.f.nombre, c.m.descripcion, c.m.foto) || pegatina(claveFamilia(c.f.nombre));
                const datos = [c.m.formato, c.m.codigo].filter(Boolean).join(' · ');
                return (
                  <li key={c.m.ref}>
                    <Link className="gl-fila" to={enlace(c)} title={c.m.descripcion}>
                      <img src={foto} alt="" loading="lazy" />
                      <span className="gl-txt">
                        <span className="gl-nom">{nombreCorto(sinFormato(c.m), g.titulo)}</span>
                        {datos && <small>{datos}</small>}
                      </span>
                      <span className="gl-precio">
                        <b>{eur(grande)}</b>
                        {otro != null && <small>{eur(otro)} {iva ? 'sin' : 'con'} IVA</small>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
