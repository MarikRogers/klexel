const CACHE = 'pixelart-v6';
const STATIC = ['./', 'impressum.html', 'datenschutz.html', 'manifest.webmanifest', 'favicon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

// Beim Installieren alles Nötige vorab laden, inkl. der gehashten JS/CSS-Dateien aus index.html,
// damit die App schon nach dem ersten Besuch offline startet.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const html = await (await fetch('./', { cache: 'reload' })).text();
    const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(m => m[1]);
    await cache.addAll([...STATIC, ...assets]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Seite: Netzwerk zuerst (Updates kommen an), offline aus dem Cache.
// Alles andere: Cache zuerst, sonst Netzwerk und nachcachen.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    // Nur die App selbst ersetzt den Cache-Eintrag './'; Impressum/Datenschutz dürfen ihn nicht überschreiben.
    const isApp = new URL(e.request.url).pathname === new URL('./', self.registration.scope).pathname;
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok && isApp) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); }
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./')))
  );
});
