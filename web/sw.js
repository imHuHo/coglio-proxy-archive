/* Service worker: l'app funziona offline dopo il primo caricamento. Cambia CACHE a ogni rilascio. */
const CACHE = 'cpa-v46';
const ASSETS = ['./', 'index.html', 'style.css', 'version.js', 'changelog.js', 'core.js', 'pdf.js', 'proxy.js', 'search.js', 'cards.js', 'bracket.js', 'mpc.js', 'analysis.js', 'pescher.js', 'community.js', 'community-config.js', 'sync-config.js', 'sync.js', 'app.js', 'builder.js', 'cardrender.js', 'designer.js', 'pescher-ui.js', 'community-ui.js', 'manifest.webmanifest', 'icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'mana/w.svg', 'mana/u.svg', 'mana/b.svg', 'mana/r.svg', 'mana/g.svg', 'mana/c.svg', 'mana/botto.svg',
  'fonts/cinzel-latin-600-normal.woff2', 'fonts/cinzel-latin-700-normal.woff2', 'fonts/syne-latin-700-normal.woff2', 'fonts/syne-latin-800-normal.woff2', 'fonts/manrope-latin-wght-normal.woff2',
  'fonts/jetbrains-mono-latin-400-normal.woff2', 'fonts/jetbrains-mono-latin-500-normal.woff2', 'fonts/jetbrains-mono-latin-600-normal.woff2'];
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
  const u = new URL(r.url);
  if (/(^|\.)scryfall\.(com|io)$/.test(u.hostname)) return; // le immagini le gestisce la cache del browser
  if (/\/packs\/|risorse\.json$/.test(u.pathname)) return; // cornici e risorse finiscono nel database del Designer: niente doppioni in cache
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r);
    const net = fetch(r).then(res => {
      if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
