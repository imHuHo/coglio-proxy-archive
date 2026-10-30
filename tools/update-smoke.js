/* Smoke test del pannello «Aggiornamenti» in Dati: node update-smoke.js <percorso-jsdom> (GitHub simulato) */
const path = require('path'), fs = require('fs'), assert = require('assert');
const { JSDOM } = require(process.argv[2] || 'jsdom');
const W = path.join(__dirname, '..', 'web');
const read = p => fs.readFileSync(p, 'utf8');
const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="toast" hidden></div></body>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window, d = w.document;
const errors = []; w.addEventListener('error', e => errors.push(e.message));
w.scrollTo = () => {};
const opened = []; w.open = u => { opened.push(u); return {}; };
w.eval(read(W + '/version.js')); w.CPA_VERSION = '2.0.1'; /* versione fissa per il test */ w.eval(read(W + '/core.js')); w.eval(read(W + '/app.js'));
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const click = el => { assert(el, 'elemento mancante'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const text = () => d.body.textContent.replace(/\s+/g, ' ');
const R = 'https://github.com/imHuHo/coglio-proxy-archive/releases/download/';
const release = (tag, extra) => Object.assign({ tag_name: tag, html_url: 'https://github.com/imHuHo/coglio-proxy-archive/releases/tag/' + tag, body: 'Novità di prova', assets: [
  { name: 'Coglio-Proxy-Archive.apk', size: 4e6, browser_download_url: R + tag + '/Coglio-Proxy-Archive.apk' },
  { name: 'Coglio-Proxy-Archive-Windows.zip', size: 113e6, browser_download_url: R + tag + '/Coglio-Proxy-Archive-Windows.zip' }] }, extra || {});
let reply = () => ({ status: 200, ok: true, json: async () => release('v2.0.1') }), calls = [];
w.fetch = async (u, o) => { calls.push(u); const r = reply(); if (r instanceof Error) throw r; return r; };
const check = async () => { click($('[data-a="upd-check"]')); await sleep(30); };

(async () => {
  await sleep(50);
  ok(w.CPA_VERSION === '2.0.1', 'versione installata');
  click($$('[data-a="nav"][data-v="data"]')[0] || $$('[data-a="nav"]').filter(b => /Dati/.test(b.textContent))[0]);
  ok($('#upd') && text().includes('Versione installata: 2.0.1') && text().includes('versione web'), 'pannello visibile in Dati');
  ok($('[data-a="upd-check"]'), 'pulsante Verifica aggiornamenti');
  ok(calls.length === 0, 'nessuna richiesta finché non si preme');

  // stessa versione
  await check();
  ok(calls[0] === 'https://api.github.com/repos/imHuHo/coglio-proxy-archive/releases/latest', 'chiama l\'ultima release del repository');
  ok(text().includes('Hai già l\'ultima versione (v2.0.1)') && !$('[data-a="upd-go"]'), 'nessun aggiornamento se uguale');

  // più vecchia su GitHub (es. versione di sviluppo più avanti): non propone nulla
  reply = () => ({ status: 200, ok: true, json: async () => release('v1.9.0') }); await check();
  ok(text().includes('Hai già l\'ultima versione') && !$('[data-a="upd-go"]'), 'versione GitHub più vecchia: niente');

  // nuova versione, web: solo pagina della release
  reply = () => ({ status: 200, ok: true, json: async () => release('v2.1.0') }); await check();
  ok(text().includes('Nuova versione disponibile: v2.1.0') && text().includes('Novità'), 'nuova versione annunciata');
  ok(text().includes('si aggiorna da sola') && $('[data-a="upd-go"]').textContent.includes('pagina della versione'), 'web: pagina della versione');
  click($('[data-a="upd-go"]'));
  ok(opened.pop() === 'https://github.com/imHuHo/coglio-proxy-archive/releases/tag/v2.1.0', 'apre la pagina della release');

  // versione web: ricarica con cache e service worker azzerati (i dati non si toccano)
  const deleted = [], unreg = []; let idbTouched = false;
  w.caches = { keys: async () => ['cpa-v10', 'cpa-v11'], delete: async k => { deleted.push(k); return true; } };
  Object.defineProperty(w.navigator, 'serviceWorker', { value: { getRegistrations: async () => [{ unregister: async () => { unreg.push(1); return true; } }] }, configurable: true });
  w.indexedDB = new Proxy({}, { get() { idbTouched = true; return () => {}; } });
  ok($('[data-a="upd-reload"]'), 'web: pulsante di ricarica');
  click($('[data-a="upd-reload"]')); await sleep(30);
  ok(deleted.join() === 'cpa-v10,cpa-v11' && unreg.length === 1, 'web: cache e service worker azzerati');
  ok(!idbTouched, 'web: i dati (IndexedDB) non vengono toccati');

  // Android
  w.Capacitor = { isNativePlatform: () => true }; await check();
  ok($('[data-a="upd-go"]').textContent.includes('APK') && text().includes('3.8 MB'), 'android: pulsante APK con dimensione');
  click($('[data-a="upd-go"]'));
  ok(opened.pop() === R + 'v2.1.0/Coglio-Proxy-Archive.apk', 'android: apre l\'APK');
  ok(text().includes('tocca il file .apk'), 'android: istruzioni di installazione');
  delete w.Capacitor;

  // Windows
  let progCb = null, updated = null, quitted = 0, finish;
  w.cpaNet = { update: url => { updated = url; return new Promise(r => { finish = r; }); }, onUpdateProgress: cb => { progCb = cb; }, quit: async () => { quitted++; } };
  await check();
  ok($('[data-a="upd-go"]').textContent.includes('Scarica e prepara'), 'windows: pulsante scarica');
  click($('[data-a="upd-go"]'));
  ok(updated === R + 'v2.1.0/Coglio-Proxy-Archive-Windows.zip', 'windows: chiede lo zip giusto');
  ok($('#upd-prog') && $('[data-a="upd-check"]').disabled, 'barra di avanzamento, verifica disattivata');
  progCb({ received: 56.5e6, total: 113e6 });
  ok($('#upd-prog').value === 50 && text().includes('50%'), 'avanzamento al 50% senza ridisegnare la pagina');
  finish({ ok: true, path: 'C:\\Users\\x\\Downloads\\Coglio-Proxy-Archive-Windows.zip', bytes: 113e6 }); await sleep(10);
  ok(text().includes('Scaricato in Download') && text().includes('Coglio-Proxy-Archive-Windows.zip'), 'windows: scaricato');
  click($('[data-a="upd-quit"]')); await sleep(5);
  ok(quitted === 1, 'windows: chiude l\'app');
  await check();
  click($('[data-a="upd-go"]')); finish({ ok: false, error: 'incomplete' }); await sleep(10);
  ok(text().includes('Scarico interrotto') && $('[data-a="upd-go"]'), 'windows: errore e si può riprovare');
  delete w.cpaNet;

  // errori
  reply = () => new TypeError('Failed to fetch'); await check();
  ok(text().includes('Non riesco a contattare GitHub') && !$('[data-a="upd-go"]'), 'errore di rete');
  reply = () => ({ status: 403, ok: false, json: async () => ({}) }); await check();
  ok(text().includes('Non riesco a contattare GitHub'), 'errore http');
  reply = () => ({ status: 404, ok: false, json: async () => ({}) }); await check();
  ok(text().includes('Non ci sono ancora versioni pubblicate'), 'nessuna release');
  // asset con URL fuori dal repository: ignorato
  reply = () => ({ status: 200, ok: true, json: async () => release('v2.2.0', { assets: [{ name: 'x-Windows.zip', size: 1, browser_download_url: 'https://evil.example/x-Windows.zip' }] }) });
  w.cpaNet = { update: () => { throw new Error('mai'); } }; await check();
  ok(!$('[data-a="upd-go"]') || $('[data-a="upd-go"]').textContent.includes('pagina'), 'asset esterno al repository ignorato');
  delete w.cpaNet;

  // confronto versioni
  const cases = [['v2.10.0', '2.9.9', 1], ['2.0.1', 'v2.0.1', 0], ['1.0.0', '2.0.0', -1], ['bho', '1.0.0', null], ['2.0', '2.0.0', null]];
  for (const [a, b, r] of cases) ok(w.CPAHost.cmpVersion(a, b) === r, 'confronto ' + a + ' / ' + b);
  ok(!errors.length, 'nessun errore JS: ' + errors.join('; '));
  console.log('UPDATE OK, ' + n + ' controlli passati');
})().catch(e => { console.error(e); process.exit(1); });
