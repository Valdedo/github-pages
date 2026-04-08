import { useState, useEffect, useRef, useCallback } from 'react';
import { scanProduct } from '../api/client';

interface CartItem {
  id: number;
  descripcion: string;
  pvp_con_iva: number;
  iva_pct: number;
  codigo: string;
  qty: number;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => {
      detect(source: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
    };
  }
}

const fmt2 = (n: number) => n.toFixed(2).replace('.', ',');

export function SalePage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [lastScanned, setLastScanned] = useState('');
  const [error, setError] = useState('');
  const [scannerSupported, setScannerSupported] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [checkout, setCheckout] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastCodeRef = useRef('');
  const cooldownRef = useRef(false);

  useEffect(() => {
    setScannerSupported(!!window.BarcodeDetector);
  }, []);

  const addToCart = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setError('');
    try {
      const { data } = await scanProduct(code.trim());
      setCart(prev => {
        const existing = prev.find(i => i.id === data.id);
        if (existing) {
          return prev.map(i => i.id === data.id ? { ...i, qty: i.qty + 1 } : i);
        }
        return [...prev, {
          id: data.id,
          descripcion: data.descripcion,
          pvp_con_iva: data.pvp_con_iva,
          iva_pct: data.iva_pct,
          codigo: data.codigo_principal || data.ean || code,
          qty: 1,
        }];
      });
      setLastScanned(data.descripcion);
      setManualCode('');
      setTimeout(() => setLastScanned(''), 3000);
    } catch {
      setError(`Producto no encontrado: ${code}`);
      setTimeout(() => setError(''), 3000);
    }
  }, []);

  const startScanner = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      detectorRef.current = new window.BarcodeDetector!({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'],
      });

      const scanFrame = async () => {
        if (!videoRef.current || !detectorRef.current || !scanning) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes.length > 0 && !cooldownRef.current) {
            const val = codes[0].rawValue;
            if (val !== lastCodeRef.current) {
              lastCodeRef.current = val;
              cooldownRef.current = true;
              addToCart(val);
              setTimeout(() => { cooldownRef.current = false; lastCodeRef.current = ''; }, 2000);
            }
          }
        } catch { /* ignore frame errors */ }
        rafRef.current = requestAnimationFrame(scanFrame);
      };
      rafRef.current = requestAnimationFrame(scanFrame);
      setScanning(true);
    } catch (e: any) {
      setCameraError('No se pudo acceder a la cámara. Usa el campo manual.');
    }
  }, [scanning, addToCart]);

  const stopScanner = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => stopScanner(), []);

  const updateQty = (id: number, delta: number) => {
    setCart(prev => prev
      .map(i => i.id === id ? { ...i, qty: i.qty + delta } : i)
      .filter(i => i.qty > 0)
    );
  };

  const totalConIva = cart.reduce((s, i) => s + i.pvp_con_iva * i.qty, 0);
  const totalSinIva = cart.reduce((s, i) => s + (i.pvp_con_iva / (1 + i.iva_pct / 100)) * i.qty, 0);
  const totalIva = totalConIva - totalSinIva;

  if (checkout) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--brand)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', color: '#fff' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>💳</div>
        <div style={{ fontSize: '14px', opacity: 0.75, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total a cobrar</div>
        <div style={{ fontSize: '72px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{fmt2(totalConIva)} €</div>
        <div style={{ fontSize: '14px', opacity: 0.6, marginTop: '8px' }}>IVA incluido ({fmt2(totalIva)} € IVA)</div>
        <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '320px' }}>
          {cart.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', opacity: 0.85 }}>
              <span>{i.qty > 1 ? `${i.qty}× ` : ''}{i.descripcion}</span>
              <span style={{ fontWeight: 600 }}>{fmt2(i.pvp_con_iva * i.qty)} €</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '40px' }}>
          <button
            className="btn"
            style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: '15px', padding: '12px 24px' }}
            onClick={() => setCheckout(false)}
          >← Volver</button>
          <button
            className="btn"
            style={{ background: '#fff', color: 'var(--brand)', fontWeight: 700, fontSize: '15px', padding: '12px 24px' }}
            onClick={() => { setCart([]); setCheckout(false); }}
          >✓ Cobrado — Nueva venta</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: '640px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>🛒 Punto de venta</h2>
        {cart.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={() => setCart([])}>Vaciar cesta</button>
        )}
      </div>

      {/* Scanner area */}
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-header">Escáner de códigos de barras</div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scannerSupported ? (
            <>
              {scanning ? (
                <div style={{ position: 'relative' }}>
                  <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: '8px', background: '#000', maxHeight: '240px', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ width: '60%', height: '2px', background: 'rgba(22,163,74,0.8)', boxShadow: '0 0 8px #16a34a' }} />
                  </div>
                  <button className="btn btn-danger btn-sm" style={{ position: 'absolute', top: '8px', right: '8px' }} onClick={stopScanner}>✕ Parar</button>
                </div>
              ) : (
                <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '15px' }} onClick={startScanner}>
                  📷 Iniciar cámara y escanear
                </button>
              )}
              {cameraError && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{cameraError}</p>}
            </>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>Tu navegador no soporta el escáner automático. Usa el campo manual.</p>
          )}

          {/* Manual input */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Código EAN / referencia manual…"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addToCart(manualCode); }}
              style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--border-strong)', borderRadius: 'var(--r)', fontSize: '14px', fontFamily: 'inherit' }}
            />
            <button className="btn btn-primary" onClick={() => addToCart(manualCode)}>Añadir</button>
          </div>

          {/* Feedback */}
          {lastScanned && (
            <div style={{ background: 'var(--brand-pale)', border: '1px solid var(--brand-light)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: '13px', color: 'var(--brand-dark)', fontWeight: 600 }}>
              ✓ Añadido: {lastScanned}
            </div>
          )}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: '13px', color: '#b91c1c' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      {cart.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛒</div>
          <div className="empty-state-text">La cesta está vacía</div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header">Cesta ({cart.reduce((s, i) => s + i.qty, 0)} artículos)</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {cart.map((item, idx) => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 16px', borderBottom: idx < cart.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', lineHeight: 1.3 }}>{item.descripcion}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>{item.codigo} · {fmt2(item.pvp_con_iva)} € c/u</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button onClick={() => updateQty(item.id, -1)} style={{ width: '28px', height: '28px', border: '1px solid var(--border-strong)', borderRadius: '6px', background: 'var(--surface)', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 700, fontSize: '15px' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} style={{ width: '28px', height: '28px', border: '1px solid var(--border-strong)', borderRadius: '6px', background: 'var(--surface)', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--brand)', minWidth: '64px', textAlign: 'right', flexShrink: 0 }}>
                    {fmt2(item.pvp_con_iva * item.qty)} €
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total + checkout */}
          <div className="card" style={{ background: 'var(--brand-pale)', border: '1px solid var(--brand-light)' }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-2)' }}>
                <span>Base imponible</span><span>{fmt2(totalSinIva)} €</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-2)' }}>
                <span>IVA</span><span>{fmt2(totalIva)} €</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '22px', fontWeight: 800, color: 'var(--brand)', borderTop: '1px solid var(--brand-light)', paddingTop: '10px', marginTop: '4px', letterSpacing: '-0.02em' }}>
                <span>Total</span><span>{fmt2(totalConIva)} €</span>
              </div>
              <button className="btn btn-primary" style={{ marginTop: '10px', width: '100%', padding: '14px', fontSize: '16px', fontWeight: 700 }} onClick={() => setCheckout(true)}>
                💳 Cobrar {fmt2(totalConIva)} €
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
