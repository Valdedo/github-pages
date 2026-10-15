/**
 * Órdenes de carga sin cobertura.
 * Las firmas (con su foto y lo marcado como cargado) y los «cargado» que se tocan sin señal
 * se guardan en el móvil y se envían solos al volver la cobertura.
 */
import { editarLineaCarga, firmarEntregaCarga, listaEntregaCarga, type EntregaCarga } from '../api/client';
import { getToken } from '../auth';
import { sinRed } from './offline';

/** Aviso abajo (lo enseña AvisosGlobales en App.tsx). */
const avisar = (txt: string) => window.dispatchEvent(new CustomEvent('cf-cola-aviso', { detail: txt }));

const KEY = 'cfColaCargas';
export interface MarcaEnCola { tipo: 'marca'; lineaId: number; ok: boolean; at: string }
export interface FirmaCargaEnCola {
  tipo: 'firma'; entregaId: number; ordenId: number; cliente: string; nombre: string; dni: string;
  png: string; foto?: string | null; cargadas: Record<string, { ok: boolean; cargado: number | null }>; at: string;
  error?: string;  // el servidor la rechazó: se guarda y se avisa, nunca se tira
}
export interface ListaEnCola { tipo: 'lista'; entregaId: number; lista: boolean; at: string }
type Item = MarcaEnCola | FirmaCargaEnCola | ListaEnCola;

export const colaCargas = (): Item[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const guardar = (c: Item[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(c)); }
  catch { throw new Error('El móvil no tiene sitio para guardarlo'); }
  finally { window.dispatchEvent(new Event('cf-cola-cargas')); }
};

export const firmaEnCola = (entregaId: number) =>
  colaCargas().find((x): x is FirmaCargaEnCola => x.tipo === 'firma' && x.entregaId === entregaId);
export const marcaEnCola = (lineaId: number) =>
  colaCargas().filter((x): x is MarcaEnCola => x.tipo === 'marca' && x.lineaId === lineaId).pop();

/** «Listo para llevar» tocado sin cobertura (lo último que se tocó). */
export const listaEnCola = (entregaId: number) =>
  colaCargas().filter((x): x is ListaEnCola => x.tipo === 'lista' && x.entregaId === entregaId).pop();
/** ¿Carga confirmada como «Listo para llevar»? (también si se tocó sin cobertura) */
export const estaLista = (e: EntregaCarga) => { const c = listaEnCola(e.id); return c ? c.lista : !!e.lista_at; };
export function listaSinRed(entregaId: number, lista: boolean) {
  // Se guarda en orden: «Desbloquear» → cambios → «Listo» tiene que llegar así al servidor (si se borraba el
  // «Desbloquear», los cambios llegaban con la carga aún bloqueada y se perdían). Solo se sustituye el último
  // si no hay nada en medio.
  const c = colaCargas();
  const ult = c[c.length - 1];
  const base = ult && ult.tipo === 'lista' && ult.entregaId === entregaId ? c.slice(0, -1) : c;
  guardar([...base, { tipo: 'lista', entregaId, lista, at: new Date().toISOString() }]);
}

export const aDataUrl = (b: Blob) => new Promise<string>((ok, ko) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(b);
});

/** Foto reducida para que quepa en el móvil (las de la cámara pesan varios MB). */
export async function reducirFoto(f: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const esc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * esc); cv.height = Math.round(bmp.height * esc);
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((ok) => cv.toBlob(b => ok(b || f), 'image/jpeg', 0.82));
  } catch { return f; }
}

export function marcarSinRed(lineaId: number, ok: boolean) {
  guardar([...colaCargas().filter(x => !(x.tipo === 'marca' && x.lineaId === lineaId)), { tipo: 'marca', lineaId, ok, at: new Date().toISOString() }]);
}

export async function firmaSinRed(f: Omit<FirmaCargaEnCola, 'tipo' | 'png' | 'foto' | 'at'>, png: Blob, foto: Blob | null) {
  const item: FirmaCargaEnCola = { ...f, tipo: 'firma', png: await aDataUrl(png), foto: foto ? await aDataUrl(foto) : null, at: new Date().toISOString() };
  // Las marcas de esa entrega ya van dentro de la firma
  const ids = new Set(Object.keys(f.cargadas).map(Number));
  guardar([...colaCargas().filter(x => !(x.tipo === 'firma' && x.entregaId === f.entregaId) && !(x.tipo === 'lista' && x.entregaId === f.entregaId) && !(x.tipo === 'marca' && ids.has(x.lineaId))), item]);
  if (!firmaEnCola(f.entregaId)) throw new Error('No se pudo guardar la firma en el móvil');
}

let enviando = false;
export async function enviarColaCargas(): Promise<number> {
  // Sin sesión (p. ej. le cambiaron el código) no se manda nada: todo espera a que vuelva a entrar
  if (enviando || !colaCargas().length || !getToken()) return 0;
  enviando = true;
  let ok = 0;
  try {
    for (const it of colaCargas()) {
      if (it.tipo === 'firma' && it.error) continue;
      try {
        if (it.tipo === 'marca') {
          await editarLineaCarga(it.lineaId, { cargado_ok: it.ok, cargado: null });
        } else if (it.tipo === 'lista') {
          await listaEntregaCarga(it.entregaId, it.lista);
        } else {
          const png = await (await fetch(it.png)).blob();
          const foto = it.foto ? await (await fetch(it.foto)).blob() : null;
          await firmarEntregaCarga(it.entregaId, png, it.nombre, it.dni, { firmadoEl: it.at, foto, cargadas: it.cargadas });
        }
        guardar(colaCargas().filter(x => x !== it && JSON.stringify(x) !== JSON.stringify(it))); ok++;
      } catch (err) {
        if (sinRed(err)) break; // sigue sin cobertura
        const st = (err as { response?: { status?: number } }).response?.status ?? 0;
        // Sin sesión o el servidor reiniciándose (pasa al publicar): se queda todo guardado y se reintenta luego
        if (st === 401 || st === 403 || st >= 500) break;
        const igual = (x: Item) => JSON.stringify(x) === JSON.stringify(it);
        if (it.tipo === 'firma') {
          if (st === 409) { guardar(colaCargas().filter(x => !igual(x))); continue; }  // ya estaba firmada
          // Nunca se tira una firma: se queda en el móvil, se avisa y se puede reintentar
          const det = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
          const error = st === 404
            ? 'Esta orden ya no está en tu móvil (la han retirado o borrado en la tienda). La firma sigue guardada: avisa en la tienda.'
            : typeof det === 'string' ? det : 'El servidor no la aceptó';
          guardar(colaCargas().map(x => igual(x) ? { ...it, error } : x));
          avisar(`La firma de ${it.cliente} no se pudo enviar. Ábrela para verla.`);
        } else {
          // Un «cargado» o «listo» que ya no vale (carga firmada o bloqueada, material quitado): se quita y se avisa
          guardar(colaCargas().filter(x => !igual(x)));
          if (st === 409) avisar('Un cambio hecho sin cobertura no se guardó: esa carga ya estaba confirmada o firmada.');
        }
      }
    }
  } finally { enviando = false; }
  if (ok) window.dispatchEvent(new CustomEvent('cf-cola-cargas-enviada', { detail: ok }));
  return ok;
}

let arrancado = false;
export function arrancarColaCargas() {
  if (arrancado) return;
  arrancado = true;
  window.addEventListener('online', () => { enviarColaCargas(); });
  setInterval(() => { if (navigator.onLine) enviarColaCargas(); }, 30000);
  enviarColaCargas();
}

/** Volver a mandar una firma que el servidor no aceptó (p. ej. después de arreglarlo en la tienda). */
export function reintentarFirmaCarga(entregaId: number) {
  guardar(colaCargas().map(x => x.tipo === 'firma' && x.entregaId === entregaId ? { ...x, error: undefined } : x));
  return enviarColaCargas();
}

/** Quitar del móvil una firma que el servidor no aceptó (después de verla). */
export const descartarFirma = (entregaId: number) =>
  guardar(colaCargas().filter(x => !(x.tipo === 'firma' && x.entregaId === entregaId)));
