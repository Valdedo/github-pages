/* Casa Fonso · service worker
 * - Avisos en el móvil (push).
 * - Funcionar sin cobertura en el reparto: guarda la app, la lista de albaranes,
 *   cada albarán y sus páginas para poder abrirlos y firmarlos sin señal.
 * Lo demás va siempre a la red (nada de datos viejos en la tienda).
 */
const VERSION = 'cf-v3';
const APP = `${VERSION}-app`;
const DATOS = `${VERSION}-datos`;

self.addEventListener('install', e => {
  e.waitUntil(guardarApp().catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const esHTML = res => res.ok && (res.headers.get('content-type') || '').includes('text/html');

// Los archivos «legacy» solo los usan navegadores muy viejos (que no tienen service worker)
const esLegacy = p => /-legacy[-.]/.test(p);

/** Guarda la portada y los archivos que usa (y borra los de versiones anteriores).
 *  Las partes que se cargan al abrir cada apartado (carga por partes) no se descargan aquí:
 *  se guardan la primera vez que se usan. */
async function guardarApp(res) {
  const c = await caches.open(APP);
  const r = res || await fetch('/', { cache: 'no-store' });
  if (!esHTML(r)) return;
  const html = await r.clone().text();
  const assets = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) || [])].filter(p => !esLegacy(p));
  await c.put('/', r.clone());
  const vigentes = new Set(assets);
  for (const a of assets) {
    let x = await c.match(a);
    if (!x) {
      try { const y = await fetch(a); if (y.ok && !esHTML(y)) { await c.put(a, y.clone()); x = y; } } catch { /* sin red */ }
    }
    // Las partes de esta versión que nombra el archivo principal se conservan (si ya estaban guardadas)
    if (x && a.endsWith('.js')) {
      try {
        const js = await x.clone().text();
        for (const m of js.match(/[\w.-]+-[\w-]{8}\.(?:js|css)/g) || []) vigentes.add(`/assets/${m}`);
      } catch { /* nada */ }
    }
  }
  for (const k of await c.keys()) {
    const p = new URL(k.url).pathname;
    if (p.startsWith('/assets/') && (!vigentes.has(p) || esLegacy(p))) await c.delete(k);
  }
  for (const extra of ['/manifest.webmanifest', '/brand/icon-192.png']) {
    if (!(await c.match(extra))) { try { await c.add(extra); } catch { /* nada */ } }
  }
}

// Qué peticiones de datos se guardan para usarlas sin cobertura
const GUARDAR = [
  /^\/api\/firmas$/,                      // lista
  /^\/api\/firmas\/\d+$/,                 // un albarán
  /^\/api\/firmas\/\d+\/page\/\d+\.png$/, // páginas
  /^\/api\/firmas\/\d+\/contacto$/,
  /^\/api\/turnos\/hoy$/,
  /^\/api\/turnos\/cuadrante$/,
  /^\/api\/turnos\/ajustes$/,
  /^\/api\/cargas$/,                      // órdenes de carga (en pruebas)
  /^\/api\/cargas\/\d+$/,
  /^\/api\/cargas\/foto\/[\w.-]+$/,
];

// Clave sin el código de sesión (?t=…) para que valga aunque cambie
function clave(url) {
  const u = new URL(url);
  u.searchParams.delete('t');
  return u.toString();
}

// Poda: como mucho MAX entradas y nada de más de 14 días
const MAX = 200;
const DIAS = 14 * 86400000;
let podando = false;
async function podar(c) {
  if (podando) return;
  podando = true;
  try {
    const ks = await c.keys(); // en el orden en que se guardaron
    const viejas = [];
    for (const k of ks) {
      const r = await c.match(k);
      const t = Number(r && r.headers.get('x-guardado')) || 0;
      if (!t || Date.now() - t > DIAS) viejas.push(k);
    }
    for (const k of viejas) await c.delete(k);
    const resto = ks.filter(k => !viejas.includes(k));
    for (const k of resto.slice(0, Math.max(0, resto.length - MAX))) await c.delete(k);
  } finally { podando = false; }
}

/** Copia de la respuesta con la hora a la que se guardó. */
async function conHora(res) {
  const h = new Headers(res.headers);
  h.set('x-guardado', String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}

/** La copia guardada, marcada para que la app avise de que son datos de hace un rato. */
async function desdeCache(res) {
  const h = new Headers(res.headers);
  h.set('X-Desde-Cache', '1');
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}

/** Red primero; si no hay red o tarda más de 5 s y hay copia guardada, la copia. */
async function redPrimero(req, e) {
  const c = await caches.open(DATOS);
  const red = fetch(req).then(res => {
    if (res.ok) {
      const guardar = conHora(res.clone()).then(r => c.put(clave(req.url), r)).then(() => podar(c)).catch(() => {});
      try { e.waitUntil(guardar); } catch { /* la respuesta ya se dio: se guarda igual */ }
    }
    return res;
  });
  const guardada = await c.match(clave(req.url));
  if (!guardada) return red;
  const espera = new Promise(ok => setTimeout(() => ok(null), 5000));
  try {
    const res = await Promise.race([red, espera]);
    return res || desdeCache(guardada);
  } catch {
    return desdeCache(guardada);
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Abrir la app: red primero; sin red, la app guardada. (Los PDF y descargas no se tocan.)
  if (req.mode === 'navigate') {
    if (url.pathname.startsWith('/api/')) return;
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (esHTML(res)) e.waitUntil(guardarApp(res.clone()).catch(() => {}));
        return res;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }
  // Archivos de la app con huella en el nombre: no cambian nunca
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok && !esHTML(res)) { const copia = res.clone(); caches.open(APP).then(c => c.put(req, copia)); }
      return res;
    })));
    return;
  }
  if (url.pathname.startsWith('/brand/') || url.pathname === '/manifest.webmanifest') {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }
  if (GUARDAR.some(rx => rx.test(url.pathname))) {
    e.respondWith(redPrimero(req, e));
  }
});

// ── Avisos ───────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Casa Fonso', {
    body: d.body || '',
    icon: '/brand/icon-192.png',
    badge: '/brand/badge-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
    lang: 'es',
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abiertas) {
      if ('focus' in c) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(destino); } catch { /* nada */ } }
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});
