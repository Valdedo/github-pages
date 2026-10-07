import { useState } from 'react';
import { MessageCircle, CheckCheck } from 'lucide-react';

/** Número para wa.me: solo cifras y con el 34 delante si es un número español. */
export function telWhatsApp(tel?: string | null): string | null {
  if (!tel) return null;
  let n = tel.replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  n = n.replace(/\D/g, '');
  if (n.length === 9 && /^[6789]/.test(n)) n = '34' + n;
  return n.length >= 11 ? n : null;
}

/** «Hola, Pepe.» si parece una persona; «Hola.» si es una empresa. */
export function saludo(nombre?: string | null): string {
  const n = (nombre || '').trim();
  if (!n || /\b(s\.?l\.?u?|s\.?a\.?u?|c\.?b\.?|construcciones|reformas|hermanos|hnos|excavaciones|ayuntamiento)\b/i.test(n)) return 'Hola.';
  const primero = n.split(/\s+/)[0];
  return `Hola, ${primero.charAt(0).toUpperCase()}${primero.slice(1).toLowerCase()}.`;
}

const minus = (s: string) => (/^[A-ZÁÉÍÓÚÑ]{2,}\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

export const textoReparacion = (cliente: string, herramienta: string, importe?: number | null) =>
  `${saludo(cliente)} Le escribimos de Casa Fonso para avisarle de que ya tenemos aquí la reparación de su ${minus(herramienta.trim())}. ` +
  `Puede pasar a recogerla cuando quiera.${importe != null ? ` El importe es de ${fmtEur(importe)}.` : ''} Un saludo.`;

export const textoPedido = (cliente: string, articulos: string[]) => {
  const que = articulos.length === 0 ? '' : articulos.length <= 3
    ? ` (${articulos.map(a => minus(a.trim())).join(', ')})`
    : ` (${articulos.length} artículos)`;
  return `${saludo(cliente)} Le escribimos de Casa Fonso para avisarle de que ya ha llegado su pedido${que}. ` +
    'Puede pasar a recogerlo cuando quiera. Un saludo.';
};

export const fmtEur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** Lee «12,50» o «12.50». Devuelve null si está vacío o no es un número. */
export function numES(s: string): number | null {
  const t = s.trim().replace(/\s|€/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const fmtAviso = (iso: string) => {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return mismoDia ? `hoy a las ${hora}` : `el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' })} a las ${hora}`;
};

/**
 * Botón grande «Avisar por WhatsApp»: abre WhatsApp con el mensaje escrito
 * (se puede cambiar antes de enviarlo) y apunta que ya se avisó.
 */
export function BotonWhatsApp({ telefono, texto, avisadoEl, onAvisado }: {
  telefono?: string | null;
  texto: string;
  avisadoEl?: string | null;
  onAvisado: () => void;
}) {
  const n = telWhatsApp(telefono);
  if (!n) {
    return (
      <div className="wa-sin">
        <MessageCircle size={18} />
        <span>{telefono ? 'El teléfono no parece un móvil válido.' : 'Sin teléfono.'} Añádelo abajo para avisar por WhatsApp.</span>
      </div>
    );
  }
  return (
    <div className="wa-bloque">
      <a className={`btn btn-lg wa-btn${avisadoEl ? ' hecho' : ''}`}
        href={`https://wa.me/${n}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"
        onClick={onAvisado}>
        <MessageCircle size={20} /> {avisadoEl ? 'Volver a avisar' : 'Avisar por WhatsApp'}
      </a>
      {avisadoEl && <span className="wa-avisado"><CheckCheck size={16} /> Avisado {fmtAviso(avisadoEl)}</span>}
    </div>
  );
}

/** Ventana para poner el importe al entregar. */
export function ImporteModal({ titulo, texto, inicial, boton, onCancel, onOk }: {
  titulo: string;
  texto: string;
  inicial?: number | null;
  boton: string;
  onCancel: () => void;
  onOk: (importe: number | null) => void;
}) {
  const [v, setV] = useState(inicial != null ? String(inicial).replace('.', ',') : '');
  const n = numES(v);
  const mal = v.trim() !== '' && n == null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 17 }}>{titulo}</span>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (!mal) onOk(n); }}>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="form-label" htmlFor="importe-final">{texto}</label>
            <div className="importe-campo">
              <input id="importe-final" className="form-input" type="text" inputMode="decimal" autoFocus
                value={v} onChange={e => setV(e.target.value)} placeholder="0,00" />
              <span>€</span>
            </div>
            {mal && <small style={{ color: 'var(--danger)' }}>Escribe solo el número, por ejemplo 35,50</small>}
            <small style={{ color: 'var(--text-3)' }}>Si no se cobra nada, déjalo vacío.</small>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={mal}>{boton}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
