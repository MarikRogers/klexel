// CACHE und BUILD_ASSETS setzt der Build je Bereichs-Auswahl ein (vite.config.ts, Plugin suite-area-branding):
// eigener Cache-Name je Auswahl, BUILD_ASSETS = alle gebauten Dateien inkl. nachgeladener Bereichs-Chunks.
const CACHE = 'pixelart-v6';
const BUILD_ASSETS = [];
// Alle Caches dieser App beginnen mit diesem Präfix. Beim Aktivieren werden alle anderen davon gelöscht (ältere
// Fassungen und andere Bereichs-Auswahlen); Caches mit anderem Präfix bleiben unangetastet.
const FAMILY = 'pixelart-';
const STATIC = ['./', 'impressum.html', 'datenschutz.html', 'manifest.webmanifest', 'favicon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

// Nachschlagen nur im eigenen Cache: ein liegengebliebener alter Cache (z. B. mit veraltetem index) darf nie antworten.
const ownCache = () => caches.open(CACHE);

// Beim Installieren alles Nötige vorab laden, inkl. der gehashten JS/CSS-Dateien aus index.html,
// damit die App schon nach dem ersten Besuch offline startet.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await ownCache();
    const html = await (await fetch('./', { cache: 'reload' })).text();
    const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(m => m[1]);
    await cache.addAll([...new Set([...STATIC, ...assets, ...BUILD_ASSETS])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(FAMILY) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
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
        if (res.ok && isApp) { const copy = res.clone(); ownCache().then(c => c.put('./', copy)); }
        return res;
      }).catch(async () => {
        const cache = await ownCache();
        return (await cache.match(e.request)) || cache.match('./');
      })
    );
    return;
  }
  e.respondWith((async () => {
    const cache = await ownCache();
    const hit = await cache.match(e.request);
    if (hit) return hit;
    return fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        cache.put(e.request, copy);
      }
      return res;
    }).catch(() => cache.match('./'));
  })());
});
