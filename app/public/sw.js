// NORMA · service worker : l'app s'ouvre même sans réseau (fichiers gardés sur l'appareil) et reçoit les notifications iPhone.
const CACHE = 'norma-app';

async function precache() {
  const c = await caches.open(CACHE);
  const res = await fetch('/', { cache: 'no-store' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await c.put('/', res);
  const assets = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])];
  await Promise.all([...assets, '/manifest.webmanifest', '/apple-touch-icon.png', '/icon-192.png']
    .map(async (u) => { if (!(await c.match(u))) await c.add(u).catch(() => undefined); }));
}
self.addEventListener('install', (e) => { e.waitUntil(precache().catch(() => undefined)); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // données NORMA (Supabase) : jamais en cache ici
  if (req.mode === 'navigate') {
    // page : réseau d'abord (version à jour), sinon la dernière version gardée
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { signal: AbortSignal.timeout(6000) });
        if (res.ok) { const c = await caches.open(CACHE); c.put('/', res.clone()); precache().catch(() => undefined); }
        return res;
      } catch { return (await caches.match('/')) ?? Response.error(); }
    })());
    return;
  }
  // fichiers de l'app (noms uniques par version) : copie locale d'abord
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && (url.pathname.startsWith('/assets/') || /\.(png|webmanifest|svg|woff2?)$/.test(url.pathname))) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});

self.addEventListener('push', (e) => {
  let d = { title: 'NORMA', body: '' };
  try { d = { ...d, ...e.data.json() }; } catch { if (e.data) d.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, icon: '/icon-192.png', badge: '/icon-192.png' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('/');
  }));
});
