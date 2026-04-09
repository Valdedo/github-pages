import { useState, useEffect, useRef, useCallback } from 'react';
import { scanProduct, decodeBarcodeImage } from '../api/client';

interface CartItem {
  id: number;
  descripcion: string;
  pvp_con_iva: number;
  iva_pct: number;
  codigo: string;
  qty: number;
}

const fmt2 = (n: number) => n.toFixed(2).replace('.', ',');

export function SalePage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [lastScanned, setLastScanned] = useState('');
  const [scanError, setScanError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [zxingAvailable, setZxingAvailable] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef = useRef<any>(null);
  const cooldownRef = useRef(false);
  const lastCodeRef = useRef('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Check if ZXing is available (dynamic import)
  useEffect(() => {
    import('@zxing/browser')
      .then(() => setZxingAvailable(true))
      .catch(() => setZxingAvailable(false));
  }, []);

  // Clean up scanner on unmount
  useEffect(() => () => { stopScanner(); }, []);

  const addToCart = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setLookupError('');
    try {
      const { data } = await scanProduct(code.trim());
      setCart(prev => {
        const existing = prev.find(i => i.id === data.id);
        if (existing) return prev.map(i => i.id === data.id ? { ...i, qty: i.qty + 1 } : i);
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
      setLookupError(`Producto no encontrado: ${code}`);
      setTimeout(() => setLookupError(''), 4000);
    }
  }, []);

  const startScanner = useCallback(async () => {
    setCameraError('');
    setScanError('');
    try {
      const { BrowserMultiFormatReader, NotFoundException } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      // Get available cameras, prefer back camera on mobile
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const backCamera = devices.find(d =>
        /back|rear|environment/i.test(d.label)
      ) || devices[devices.length - 1];

      const deviceId = backCamera?.deviceId;

      await reader.decodeFromVideoDevice(
        deviceId || undefined,
        videoRef.current!,
        (result, err) => {
          if (result) {
            const code = result.getText();
            if (code && code !== lastCodeRef.current && !cooldownRef.current) {
              lastCodeRef.current = code;
              cooldownRef.current = true;
              addToCart(code);
              if (navigator.vibrate) navigator.vibrate(80);
              setTimeout(() => {
                cooldownRef.current = false;
                lastCodeRef.current = '';
              }, 2500);
            }
          }
          if (err && !(err instanceof NotFoundException)) {
            console.debug('Scanner:', err);
          }
        }
      );
      setScanning(true);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e);
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setCameraError('Permiso de cámara denegado. Actívalo en la configuración del navegador.');
      } else if (msg.includes('NotFound') || msg.includes('device')) {
        setCameraError('No se encontró ninguna cámara en este dispositivo.');
      } else {
        setCameraError(`No se pudo iniciar la cámara: ${msg}`);
      }
    }
  }, [addToCart]);

  const stopScanner = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
      readerRef.current = null;
    }
    setScanning(false);
  }, []);

  // Photo capture fallback: send image to backend for decoding
  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setScanError('');
    try {
      const { data } = await decodeBarcodeImage(file);
      if (data.code) {
        if (navigator.vibrate) navigator.vibrate(80);
        await addToCart(data.code);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setScanError('No se detectó código de barras en la foto. Intenta de nuevo más cerca.');
      } else {
        setScanError('Error al procesar la imagen.');
      }
      setTimeout(() => setScanError(''), 5000);
    } finally {
      setPhotoLoading(false);
      // Reset input so same file can be selected again
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }, [addToCart]);

  const updateQty = (id: number, delta: number) => {
    setCart(prev => prev
      .map(i => i.id === id ? { ...i, qty: i.qty + delta } : i)
      .filter(i => i.qty > 0)
    );
  };

  const totalConIva = cart.reduce((s, i) => s + i.pvp_con_iva * i.qty, 0);
  const totalSinIva = cart.reduce((s, i) => s + (i.pvp_con_iva / (1 + i.iva_pct / 100)) * i.qty, 0);
  const totalIva = totalConIva - totalSinIva;

  // ── Checkout screen ──────────────────────────────────────────
  if (checkout) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--brand)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '24px', color: '#fff',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>💳</div>
        <div style={{ fontSize: '13px', opacity: 0.75, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total a cobrar</div>
        <div style={{ fontSize: '72px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{fmt2(totalConIva)} €</div>
        <div style={{ fontSize: '14px', opacity: 0.6, marginTop: '8px' }}>IVA incluido ({fmt2(totalIva)} € IVA)</div>
        <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', maxWidth: '320px' }}>
          {cart.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', opacity: 0.85 }}>
              <span>{i.qty > 1 ? `${i.qty}× ` : ''}{i.descripcion}</span>
              <span style={{ fontWeight: 600 }}>{fmt2(i.pvp_con_iva * i.qty)} €</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
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

  // ── Main POS screen ──────────────────────────────────────────
  return (
    <div className="page" style={{ maxWidth: '640px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>🛒 Punto de venta</h2>
        {cart.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={() => setCart([])}>Vaciar cesta</button>
        )}
      </div>

      {/* Scanner */}
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-header">Escáner de códigos de barras</div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Live camera scanner (ZXing — works on iOS Safari, Android, Firefox) */}
          {scanning ? (
            <div style={{ position: 'relative' }}>
              <video
                ref={videoRef}
                playsInline muted
                style={{ width: '100%', borderRadius: '8px', background: '#000', maxHeight: '260px', objectFit: 'cover', display: 'block' }}
              />
              {/* Scan line overlay */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ width: '70%', height: '2px', background: 'rgba(22,163,74,0.9)', boxShadow: '0 0 10px #16a34a' }} />
              </div>
              <button
                className="btn btn-danger btn-sm"
                style={{ position: 'absolute', top: '8px', right: '8px' }}
                onClick={stopScanner}
              >✕ Parar cámara</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {/* Live scanning button — show when ZXing loaded or still checking */}
              {zxingAvailable !== false && (
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, minWidth: '160px', padding: '14px', fontSize: '15px' }}
                  onClick={startScanner}
                  disabled={zxingAvailable === null}
                >
                  📷 {zxingAvailable === null ? 'Cargando…' : 'Escanear en directo'}
                </button>
              )}

              {/* Photo capture — always visible, universal fallback for all devices */}
              <label
                style={{
                  flex: 1, minWidth: '140px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '14px', fontSize: '15px', cursor: 'pointer',
                  background: photoLoading ? 'var(--surface)' : 'var(--brand-pale)',
                  border: '1.5px solid var(--brand-light)',
                  borderRadius: 'var(--r)',
                  color: 'var(--brand-dark)',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                {photoLoading ? '⏳ Procesando…' : '📸 Foto de código'}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handlePhotoCapture}
                  disabled={photoLoading}
                />
              </label>
            </div>
          )}

          {cameraError && (
            <p style={{ color: 'var(--danger)', fontSize: '13px', margin: 0 }}>{cameraError}</p>
          )}
          {scanError && (
            <p style={{ color: 'var(--warning)', fontSize: '12px', margin: 0 }}>{scanError}</p>
          )}

          {/* Manual input always visible */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Código EAN / referencia manual…"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addToCart(manualCode); }}
              style={{
                flex: 1, padding: '8px 12px',
                border: '1.5px solid var(--border-strong)', borderRadius: 'var(--r)',
                fontSize: '14px', fontFamily: 'inherit',
              }}
            />
            <button className="btn btn-primary" onClick={() => addToCart(manualCode)}>Añadir</button>
          </div>

          {lastScanned && (
            <div style={{ background: 'var(--brand-pale)', border: '1px solid var(--brand-light)', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: '13px', color: 'var(--brand-dark)', fontWeight: 600 }}>
              ✓ Añadido: {lastScanned}
            </div>
          )}
          {lookupError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r)', padding: '8px 12px', fontSize: '13px', color: '#b91c1c' }}>
              {lookupError}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      {cart.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛒</div>
          <div className="empty-state-text">La cesta está vacía — escanea o introduce un código</div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header">
              Cesta ({cart.reduce((s, i) => s + i.qty, 0)} artículos)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {cart.map((item, idx) => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 16px',
                  borderBottom: idx < cart.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', lineHeight: 1.3 }}>{item.descripcion}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                      {item.codigo} · {fmt2(item.pvp_con_iva)} € c/u
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button onClick={() => updateQty(item.id, -1)} style={{ width: '30px', height: '30px', border: '1px solid var(--border-strong)', borderRadius: '6px', background: 'var(--surface)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>−</button>
                    <span style={{ minWidth: '28px', textAlign: 'center', fontWeight: 700, fontSize: '16px' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} style={{ width: '30px', height: '30px', border: '1px solid var(--border-strong)', borderRadius: '6px', background: 'var(--surface)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>+</button>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--brand)', minWidth: '68px', textAlign: 'right', flexShrink: 0 }}>
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
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: '22px', fontWeight: 800, color: 'var(--brand)',
                borderTop: '1px solid var(--brand-light)', paddingTop: '10px', marginTop: '4px',
                letterSpacing: '-0.02em',
              }}>
                <span>Total</span><span>{fmt2(totalConIva)} €</span>
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: '10px', width: '100%', padding: '14px', fontSize: '16px', fontWeight: 700 }}
                onClick={() => setCheckout(true)}
              >
                💳 Cobrar {fmt2(totalConIva)} €
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
