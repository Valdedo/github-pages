import { useEffect, useRef, useState } from 'react';
import { X, Camera, SkipForward, Keyboard } from 'lucide-react';
import { decodeBarcodeImage } from '../api/client';

interface Props {
  /** Qué se está escaneando (el nombre del artículo). */
  titulo: string;
  sub?: string;
  /** Mensaje del último código leído («Guardado», «Ese código ya es de…»). */
  aviso?: { texto: string; mal?: boolean } | null;
  onCodigo: (codigo: string) => void;
  onSaltar?: () => void;
  onCerrar: () => void;
}

/**
 * Lector de códigos de barras con la cámara del móvil, como una PDA (nov. 2026). Se queda abierto para
 * leer uno detrás de otro. En el ordenador vale el lector de mano o escribirlo: el cuadro de abajo.
 */
export function EscanerCodigo({ titulo, sub, aviso, onCodigo, onSaltar, onCerrar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const ultimo = useRef({ codigo: '', t: 0 });
  const alLeer = useRef(onCodigo);
  alLeer.current = onCodigo;
  const [error, setError] = useState<string | null>(null);
  const [encendida, setEncendida] = useState(false);
  const [aMano, setAMano] = useState('');
  const [leyendoFoto, setLeyendoFoto] = useState(false);

  const leido = (codigo: string) => {
    const c = codigo.trim();
    const ahora = Date.now();
    // la cámara lee el mismo código muchas veces seguidas: una sola cuenta
    if (!c || (c === ultimo.current.codigo && ahora - ultimo.current.t < 2500)) return;
    ultimo.current = { codigo: c, t: ahora };
    if (navigator.vibrate) navigator.vibrate(60);
    alLeer.current(c);
  };

  useEffect(() => {
    let parar: (() => void) | null = null;
    let vivo = true;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'), import('@zxing/library'),
        ]);
        const pistas = new Map();
        pistas.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.CODE_128, BarcodeFormat.ITF,
        ]);
        const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 120 });
        const controles = await lector.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } },
          videoRef.current!,
          res => { const c = res?.getText(); if (c) leido(c); },
        );
        if (!vivo) { controles.stop(); return; }
        parar = () => controles.stop();
        setEncendida(true);
      } catch (e) {
        if (!vivo) return;
        const msg = (e as Error)?.message || String(e);
        setError(/Permission|NotAllowed/i.test(msg)
          ? 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador, o escribe el código abajo.'
          : 'No se pudo abrir la cámara en este aparato. Pasa el lector de mano o escribe el código abajo.');
      }
    })();
    return () => { vivo = false; parar?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const foto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLeyendoFoto(true);
    try {
      const { data } = await decodeBarcodeImage(file);
      if (data.code) leido(data.code); else setError('No se ve ningún código en la foto. Prueba más cerca y con buena luz.');
    } catch {
      setError('No se ve ningún código en la foto. Prueba más cerca y con buena luz.');
    } finally {
      setLeyendoFoto(false);
      if (fotoRef.current) fotoRef.current.value = '';
    }
  };

  return (
    <div className="esc-fondo" role="dialog" aria-modal="true" aria-label="Leer código de barras">
      <div className="esc-caja">
        <div className="esc-cab">
          <div className="esc-cab-txt">
            <span className="esc-cab-sup">Apunta al código de barras de</span>
            <b>{titulo}</b>
            {sub && <span className="esc-cab-sub">{sub}</span>}
          </div>
          <button className="esc-cerrar" onClick={onCerrar} aria-label="Cerrar"><X size={22} /></button>
        </div>

        <div className={`esc-visor${encendida ? ' on' : ''}`}>
          <video ref={videoRef} muted playsInline />
          {encendida && <span className="esc-linea" aria-hidden="true" />}
          {!encendida && !error && <span className="esc-espera"><span className="spinner" /> Abriendo la cámara…</span>}
          {error && <span className="esc-espera esc-error">{error}</span>}
          {aviso && <span className={`esc-aviso${aviso.mal ? ' mal' : ''}`} role="status">{aviso.texto}</span>}
        </div>

        <form className="esc-mano" onSubmit={e => { e.preventDefault(); if (aMano.trim()) { leido(aMano); setAMano(''); } }}>
          <Keyboard size={18} aria-hidden="true" />
          <input
            value={aMano} onChange={e => setAMano(e.target.value)} inputMode="numeric" autoComplete="off"
            placeholder="O pásalo con el lector / escríbelo" aria-label="Código de barras a mano"
          />
          <button className="btn btn-ghost btn-sm" type="submit" disabled={!aMano.trim()}>Vale</button>
        </form>

        <div className="esc-pie">
          <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden onChange={foto} />
          <button className="btn btn-ghost" onClick={() => fotoRef.current?.click()} disabled={leyendoFoto}>
            <Camera size={18} /> {leyendoFoto ? 'Leyendo…' : 'Foto del código'}
          </button>
          {onSaltar && <button className="btn btn-ghost" onClick={onSaltar}><SkipForward size={18} /> Saltar este</button>}
          <button className="btn btn-primary" onClick={onCerrar}>Terminar</button>
        </div>
      </div>
    </div>
  );
}
