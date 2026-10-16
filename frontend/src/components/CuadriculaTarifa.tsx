import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Minus } from 'lucide-react';
import { normaliza } from '../lib/texto';
import { eur, conIva, fotoArticulo, pegatina, claveFamilia, type Tarifa, type TarifaFamilia, type TarifaMedida } from '../lib/tarifas';
import './cuadricula.css';

// ════════════════════════════════════════════════════════════════════════
// Tarifa en cuadrícula (bombonas de gas, oct. 2026): pocos artículos, todos de golpe con su foto, nombre y precio.
// Cada grupo (Repsol, Cepsa, Cargas…) ocupa tantas columnas como artículos tiene, y el de uno solo, dos (una tarjeta
// ancha), así las filas de 6 quedan completas: 3 + 3 · 2 + 4 · 2 + 4. En pantallas estrechas cada grupo va en su fila.
// Ordenador y móvil: la tarjeta abre la ficha. Tableta: cada toque suma uno a lo apuntado.
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

const sinS = (w: string) => w.replace(/s$/, '');
/** El nombre sin lo que ya dice el título del grupo: «Butano Repsol» en Repsol → «Butano»; «Carga grande azul» en
 *  Cargas → «Grande azul»; «Envase 2,8 kg» en Envases → «2,8 kg». */
export function nombreCorto(desc: string, grupo: string): string {
  const pal = desc.trim().split(/\s+/);
  const n = pal.map(p => sinS(normaliza(p)));
  const g = normaliza(grupo).split(/\s+/).filter(Boolean).map(sinS);
  let a = 0, b = pal.length;
  if (g.length < pal.length && g.every((w, i) => n[i] === w)) a = g.length;
  else if (g.length < pal.length && g.every((w, i) => n[pal.length - g.length + i] === w)) b = pal.length - g.length;
  const r = pal.slice(a, b).join(' ');
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : desc;
}

export function CuadriculaTarifa({ t, iva = true, grande, enlace, onTocar, cuentaDe, onQuitar }: {
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
}) {
  return (
    <div className={`gc${grande ? ' gc-grande' : ''}`}>
      {gruposDe(t).map((g, i) => {
        const ancha = g.items.length === 1;
        return (
          <section key={i} className={`gc-grupo${ancha ? ' gc-ancha' : ''}`} style={{ '--n': ancha ? 2 : g.items.length } as CSSProperties}>
            {/* La familia, encima de su primer grupo; en los demás queda el hueco para que las tarjetas casen */}
            <h3 className="gc-tit"><small className={g.primero ? undefined : 'gc-hueco'}>{g.primero ? g.familia : ' '}</small>{g.titulo}</h3>
            <div className="gc-fila">
              {g.items.map(c => (
                <Tarjeta key={c.m.ref} c={c} nombre={nombreCorto(c.m.descripcion, g.titulo)} iva={iva}
                  enlace={enlace} onTocar={onTocar} cuenta={cuentaDe?.(c) ?? 0} onQuitar={onQuitar} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Tarjeta({ c, nombre, iva, enlace, onTocar, cuenta, onQuitar }: {
  c: Celda; nombre: string; iva: boolean; enlace?: (c: Celda) => string; onTocar?: (c: Celda) => void;
  cuenta: number; onQuitar?: (c: Celda) => void;
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
      </div>
    );
  }
  return <Link className="gc-celda gc-toca" to={enlace ? enlace(c) : '#'} title={c.m.descripcion}>{dentro}</Link>;
}
