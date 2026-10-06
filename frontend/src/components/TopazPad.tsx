/**
 * Tableta de firma Topaz (SignatureGem, etc.) a través del servicio SigWeb.
 * SigWeb es un programa gratuito de Topaz que se instala en el PC y deja a la web
 * hablar con la tableta: https://www.topazsystems.com/software/sigweb.exe
 */
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = window as any;

let loader: Promise<void> | null = null;
function loadSigWeb(): Promise<void> {
  if (w.SetTabletState) return Promise.resolve();
  if (!loader) {
    loader = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '/sigweb/SigWebTablet.js';
      s.onload = () => res();
      s.onerror = () => { loader = null; rej(new Error('No se pudo cargar SigWeb')); };
      document.head.appendChild(s);
    });
  }
  return loader;
}

export const SIGWEB_URL = 'https://www.topazsystems.com/software/sigweb.exe';

export interface TopazHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
}

/** Recorta la firma a su contenido y deja el fondo blanco transparente. */
function trimToBlob(b64: string): Promise<Blob | null> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const dark = d.data[i + 3] > 0 && (d.data[i] + d.data[i + 1] + d.data[i + 2]) < 600;
          if (dark) {
            // tinta en azul oscuro, igual que la firma con el dedo
            d.data[i] = 20; d.data[i + 1] = 32; d.data[i + 2] = 74; d.data[i + 3] = 255;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          } else {
            d.data[i + 3] = 0;
          }
        }
      }
      if (maxX < 0) { res(null); return; }
      ctx.putImageData(d, 0, 0);
      const m = 6;
      const x0 = Math.max(0, minX - m), y0 = Math.max(0, minY - m);
      const cw = Math.min(c.width - x0, maxX - minX + 2 * m), ch = Math.min(c.height - y0, maxY - minY + 2 * m);
      const out = document.createElement('canvas');
      out.width = cw; out.height = ch;
      out.getContext('2d')!.drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
      out.toBlob(b => res(b), 'image/png');
    };
    img.onerror = () => res(null);
    img.src = `data:image/png;base64,${b64}`;
  });
}

type Estado = 'cargando' | 'listo' | 'sin-sigweb';

export const TopazPad = forwardRef<TopazHandle, { onChange: (hasInk: boolean) => void }>(
  function TopazPad({ onChange }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const tmr = useRef<any>(null);
    const [estado, setEstado] = useState<Estado>('cargando');
    const [reintento, setReintento] = useState(0);
    const [tinta, setTinta] = useState(false);

    useEffect(() => {
      let cancel = false;
      let poll: ReturnType<typeof setInterval> | null = null;
      setEstado('cargando');
      loadSigWeb()
        .then(() => {
          if (cancel) return;
          if (!w.IsSigWebInstalled()) { setEstado('sin-sigweb'); return; }
          const ctx = canvas.current!.getContext('2d');
          w.SetDisplayXSize(canvas.current!.width);
          w.SetDisplayYSize(canvas.current!.height);
          w.SetJustifyMode(0);
          w.ClearTablet();
          tmr.current = w.SetTabletState(1, ctx, 50);
          setEstado('listo');
          // avisa al formulario cuando empiezan a firmar
          poll = setInterval(() => {
            try { const t = w.NumberOfTabletPoints() > 0; setTinta(t); onChange(t); } catch { /* sin conexión */ }
          }, 400);
        })
        .catch(() => { if (!cancel) setEstado('sin-sigweb'); });
      return () => {
        cancel = true;
        if (poll) clearInterval(poll);
        try {
          if (w.SetTabletState) { w.SetTabletState(0, tmr.current); w.Reset(); }
        } catch { /* nada */ }
      };
    }, [onChange, reintento]);

    useImperativeHandle(ref, () => ({
      clear: () => { try { w.ClearTablet(); } catch { /* nada */ } setTinta(false); onChange(false); },
      isEmpty: () => { try { return w.NumberOfTabletPoints() === 0; } catch { return true; } },
      toBlob: () => new Promise(res => {
        try {
          w.SetImageXSize(1000);
          w.SetImageYSize(200);
          w.SetImagePenWidth(5);
          w.SetJustifyMode(5);
          w.GetSigImageB64((b64: string) => { w.SetJustifyMode(0); trimToBlob(b64).then(res); });
        } catch { res(null); }
      }),
    }), [onChange]);

    return (
      <div>
        <div className="firma-topaz">
          <canvas ref={canvas} width={500} height={100} />
          {estado === 'listo' && !tinta && <div className="firma-pad-hint">Firme en la tableta con el lápiz</div>}
        </div>
        {estado === 'cargando' && <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>Conectando con la tableta…</div>}
        {estado === 'sin-sigweb' && (
          <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 6 }}>
            No se encuentra la tableta. En este ordenador hay que instalar una vez{' '}
            <a href={SIGWEB_URL} target="_blank" rel="noreferrer">SigWeb de Topaz</a>
            {' '}con la tableta enchufada.{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => setReintento(n => n + 1)}>Reintentar</button>
          </div>
        )}
      </div>
    );
  },
);
