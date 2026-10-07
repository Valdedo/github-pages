/* Casa Fonso · service worker
 * - Avisos en el móvil (push).
 * - Funcionar sin cobertura en el reparto: guarda la app, la lista de albaranes,
 *   cada albarán y sus páginas para poder abrirlos y firmarlos sin señal.
 * Lo demás va siempre a la red (nada de datos viejos en la tienda).
 */
const VERSION = 'cf-v1';
const APP = `${VERSION}-app`;
const DATOS = `${VERSION}-datos`;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(['/', '/manifest.webmanifest', '/brand/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Qué peticiones de datos se guardan para usarlas sin cobertura
const GUARDAR = [
  /^\/api\/firmas$/,                    // lista
  /^\/api\/firmas\/\d+$/,               // un albarán
  /^\/api\/firmas\/\d+\/page\/\d+\.png$/, // páginas
  /^\/api\/firmas\/\d+\/contacto$/,
  /^\/api\/turnos\/hoy$/,
  /^\/api\/turnos\/cuadrante$/,
  /^\/api\/turnos\/ajustes$/,
  /^\/api\/acceso\/estado$/,
];

// Clave sin el código de sesión (?t=…) para que valga aunque cambie
function clave(url) {
  const u = new URL(url);
  u.searchParams.delete('t');
  return u.toString();
}

async function redPrimero(req, cache) {
  const c = await caches.open(cache);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(clave(req.url), res.clone());
    return res;
  } catch (err) {
    const guardada = await c.match(clave(req.url));
    if (guardada) return guardada;
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Páginas de la app: red primero; sin red, la app guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copia = res.clone();
      caches.open(APP).then(c => c.put('/', copia));
      return res;
    }).catch(() => caches.match('/')));
    return;
  }
  // Archivos de la app con huella en el nombre: no cambian nunca
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(APP).then(c => c.put(req, copia)); }
      return res;
    })));
    return;
  }
  if (url.pathname.startsWith('/brand/') || url.pathname === '/manifest.webmanifest') {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }
  if (GUARDAR.some(rx => rx.test(url.pathname))) {
    e.respondWith(redPrimero(req, DATOS));
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
