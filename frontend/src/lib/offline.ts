/**
 * Firmas sin cobertura (reparto).
 * Si al firmar no hay señal, la firma se guarda en el móvil y se envía sola
 * en cuanto vuelve la cobertura (al abrir la app, al recuperar señal o cada 30 s).
 */
import { getFirma, firmaPageUrl, signFirma } from '../api/client';
import type { ClientDeliveryNote } from '../types';

const KEY = 'cfColaFirmas';
export interface FirmaEnCola { id: number; numero: string; cliente?: string | null; nombre: string; dni: string; png: string; at: string }

export const cola = (): FirmaEnCola[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
/** Guarda la cola. Si el móvil no tiene sitio, lanza un error (nunca se pierde una firma en silencio). */
const guardar = (c: FirmaEnCola[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(c)); }
  catch { throw new Error('El móvil no tiene sitio para guardar la firma'); }
  finally { window.dispatchEvent(new Event('cf-cola')); }
};
export const enCola = (id: number) => cola().some(f => f.id === id);

/** ¿El error es por falta de red (y no un error del servidor)? */
export const sinRed = (err: unknown) => !(err as { response?: unknown })?.response;

const aDataUrl = (b: Blob) => new Promise<string>((ok, ko) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(b);
});

export async function ponerEnCola(n: ClientDeliveryNote, png: Blob, nombre: string, dni: string) {
  const f: FirmaEnCola = { id: n.id, numero: n.numero, cliente: n.cliente, nombre, dni, png: await aDataUrl(png), at: new Date().toISOString() };
  guardar([...cola().filter(x => x.id !== n.id), f]);
  if (!enCola(n.id)) throw new Error('No se pudo guardar la firma en el móvil');
}

let enviando = false;
/** Intenta mandar las firmas guardadas. Devuelve cuántas se enviaron. */
export async function enviarCola(): Promise<number> {
  if (enviando || !cola().length) return 0;
  enviando = true;
  let ok = 0;
  try {
    for (const f of cola()) {
      try {
        const blob = await (await fetch(f.png)).blob();
        await signFirma(f.id, blob, f.nombre, f.dni, f.at);
        guardar(cola().filter(x => x.id !== f.id)); ok++;
      } catch (err) {
        if (sinRed(err)) break; // sigue sin cobertura: se reintenta luego
        const st = (err as { response?: { status?: number } }).response?.status;
        if (st === 409 || st === 404) guardar(cola().filter(x => x.id !== f.id)); // ya firmado o borrado
      }
    }
  } finally { enviando = false; }
  if (ok) window.dispatchEvent(new CustomEvent('cf-cola-enviada', { detail: ok }));
  return ok;
}

let arrancado = false;
export function arrancarCola() {
  if (arrancado) return;
  arrancado = true;
  window.addEventListener('online', () => { enviarCola(); });
  setInterval(() => { if (navigator.onLine) enviarCola(); }, 30000);
  enviarCola();
}

/** Deja guardados en el móvil los albaranes del camión (datos y páginas) para abrirlos sin señal. */
export async function prepararSinCobertura(notes: ClientDeliveryNote[]) {
  for (const n of notes) {
    try {
      await getFirma(n.id);
      const paginas = Math.min(n.page_count || 1, 6);
      for (let p = 1; p <= paginas; p++) await fetch(firmaPageUrl(n.id, p, 110, 'pendiente-'));
    } catch { /* sin red: ya se hará */ }
  }
}
