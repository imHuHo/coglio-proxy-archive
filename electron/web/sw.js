/* Service worker: l'app funziona offline dopo il primo caricamento. Cambia CACHE a ogni rilascio. */
const CACHE = 'cpa-v14';
const ASSETS = ['./', 'index.html', 'style.css', 'version.js', 'changelog.js', 'core.js', 'pdf.js', 'proxy.js', 'app.js', 'builder.js', 'cardrender.js', 'designer.js', 'manifest.webmanifest', 'icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (/(^|\.)scryfall\.(com|io)$/.test(new URL(r.url).hostname)) return; // le immagini le gestisce la cache del browser
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r);
    const net = fetch(r).then(res => {
      if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
