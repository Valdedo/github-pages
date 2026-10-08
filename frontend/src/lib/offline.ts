/**
 * Firmas sin cobertura (reparto).
 * Si al firmar no hay señal, la firma se guarda en el móvil y se envía sola
 * en cuanto vuelve la cobertura (al abrir la app, al recuperar señal o cada 30 s).
 * Si el servidor la rechaza, no se tira: se marca con `error` y se avisa en Reparto
 * y en el albarán, con «Reintentar» y «Descartar».
 */
import { getFirma, firmaPageUrl, signFirma, describeApiError } from '../api/client';
import type { ClientDeliveryNote } from '../types';

const KEY = 'cfColaFirmas';
export interface FirmaEnCola {
  id: number; numero: string; cliente?: string | null; nombre: string; dni: string; png: string; at: string;
  error?: string;      // el servidor no la aceptó: se guarda y se avisa, nunca se tira
  intentos?: number;   // errores seguidos del servidor (5xx) antes de marcarla con error
}

export const cola = (): FirmaEnCola[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
/** Guarda la cola. Si el móvil no tiene sitio, lanza un error (nunca se pierde una firma en silencio). */
const guardar = (c: FirmaEnCola[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(c)); }
  catch { throw new Error('El móvil no tiene sitio para guardar la firma'); }
  finally { window.dispatchEvent(new Event('cf-cola')); }
};
const enCola = (id: number) => cola().some(f => f.id === id);
export const firmaGuardada = (id: number) => cola().find(f => f.id === id);

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

const cambiar = (id: number, cambio: Partial<FirmaEnCola>) => guardar(cola().map(x => x.id === id ? { ...x, ...cambio } : x));
const quitar = (id: number) => guardar(cola().filter(x => x.id !== id));

/** Avisos para la pantalla (p. ej. «ya estaba firmado»). */
const avisar = (texto: string) => window.dispatchEvent(new CustomEvent('cf-cola-aviso', { detail: texto }));

let enviando = false;
/** Intenta mandar las firmas guardadas. Devuelve cuántas se enviaron. */
export async function enviarCola(): Promise<number> {
  if (enviando || !cola().length) return 0;
  enviando = true;
  let ok = 0;
  try {
    for (const f of cola()) {
      if (f.error) continue; // esperan a que alguien pulse «Reintentar» o «Descartar»
      try {
        const blob = await (await fetch(f.png)).blob();
        await signFirma(f.id, blob, f.nombre, f.dni, f.at);
        quitar(f.id); ok++;
      } catch (err) {
        if (sinRed(err)) break; // sigue sin cobertura: se reintenta luego
        const st = (err as { response?: { status?: number } }).response?.status ?? 0;
        if (st === 409) {
          // ¿Ya estaba firmado? Entonces sobra la copia del móvil
          try {
            const { data } = await getFirma(f.id);
            if (data.status === 'firmado') {
              quitar(f.id);
              avisar(`El albarán ${f.numero} ya estaba firmado${data.signed_by ? ` por ${data.signed_by}` : ''}. Se ha quitado la firma guardada en el móvil.`);
              continue;
            }
          } catch (e2) { if (sinRed(e2)) break; }
          cambiar(f.id, { error: describeApiError(err) });
        } else if (st >= 500 && (f.intentos ?? 0) < 3) {
          cambiar(f.id, { intentos: (f.intentos ?? 0) + 1 }); // fallo pasajero del servidor: se reintenta
        } else {
          cambiar(f.id, { error: describeApiError(err) });
        }
      }
    }
  } finally { enviando = false; }
  if (ok) window.dispatchEvent(new CustomEvent('cf-cola-enviada', { detail: ok }));
  return ok;
}

/** Volver a intentar una firma que el servidor rechazó. */
export function reintentarFirma(id: number) {
  cambiar(id, { error: undefined, intentos: 0 });
  return enviarCola();
}

/** Quitar del móvil una firma que el servidor no aceptó (después de verla). */
export const descartarFirma = (id: number) => quitar(id);

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
