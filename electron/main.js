const { app, BrowserWindow, shell, ipcMain, net, clipboard } = require('electron');
const path = require('path');
const updater = require('./updater');

const BRACKET_URL = 'https://backend.commanderspellbook.com/estimate-bracket/';

/* Calcolo del bracket tramite l'API pubblica di Commander Spellbook.
   Si accettano solo liste ben formate e di dimensione ragionevole. */
function validPayload(p) {
  const ok = (a) => Array.isArray(a) && a.length <= 400 && a.every((x) =>
    x && typeof x.card === 'string' && x.card.length > 0 && x.card.length <= 200 && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 500);
  return !!p && typeof p === 'object' && ok(p.commanders) && ok(p.main);
}
ipcMain.handle('cpa:bracket', async (_event, payload) => {
  if (!validPayload(payload)) return { ok: false, error: 'bad-request' };
  try {
    const res = await net.fetch(BRACKET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ commanders: payload.commanders, main: payload.main }),
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) return { ok: false, status: res.status, error: 'http' };
    return { ok: true, json: await res.json() };
  } catch (e) {
    return { ok: false, error: e && e.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
});

/* Immagine da un link (cambia immagine nel Designer): la scarica Electron, quindi non vale il blocco CORS della pagina.
   Solo http(s) verso indirizzi pubblici, al massimo 25 MB e solo se il contenuto è un'immagine. */
const IMG_MAX = 25 * 1024 * 1024;
function publicHost(h) {
  h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return false;
  return true;
}
ipcMain.handle('cpa:image', async (_event, url) => {
  let u; try { u = new URL(String(url)); } catch (e) { return { ok: false, error: 'link non valido' }; }
  if (!/^https?:$/.test(u.protocol) || !publicHost(u.hostname)) return { ok: false, error: 'link non consentito' };
  try {
    const res = await net.fetch(u.href, { headers: { Accept: 'image/*,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!res.ok) return { ok: false, error: 'http ' + res.status };
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type && !/^image\//.test(type) && type !== 'application/octet-stream') return { ok: false, error: 'non è un\u2019immagine' };
    if (Number(res.headers.get('content-length')) > IMG_MAX) return { ok: false, error: 'troppo grande' };
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > IMG_MAX) return { ok: false, error: buf.length ? 'troppo grande' : 'vuota' };
    return { ok: true, type: type.startsWith('image/') ? type : '', data: new Uint8Array(buf) };
  } catch (e) { return { ok: false, error: e && e.name === 'TimeoutError' ? 'tempo scaduto' : 'rete' }; }
});

/* Sincronizzazione: le richieste a Dropbox e Google Drive partono da Electron (niente CORS, la pagina e' un file://).
   Solo questi indirizzi, solo https, intestazioni e dimensioni limitate. */
const SYNC_HOSTS = new Set(['api.dropboxapi.com', 'content.dropboxapi.com', 'oauth2.googleapis.com', 'www.googleapis.com']);
const SYNC_HEADERS = new Set(['authorization', 'content-type', 'dropbox-api-arg', 'accept']);
const SYNC_MAX = 25 * 1024 * 1024;
ipcMain.handle('cpa:http', async (_event, req) => {
  try {
    if (!req || typeof req !== 'object') return { status: 0, error: 'richiesta non valida' };
    const u = new URL(String(req.url));
    if (u.protocol !== 'https:' || !SYNC_HOSTS.has(u.hostname)) return { status: 0, error: 'indirizzo non consentito' };
    const method = ['GET', 'POST', 'PATCH', 'PUT'].includes(req.method) ? req.method : 'GET';
    const headers = {};
    Object.keys(req.headers || {}).forEach((k) => { if (SYNC_HEADERS.has(k.toLowerCase())) headers[k] = String(req.headers[k]); });
    let body;
    if (req.form && typeof req.form === 'object') { body = new URLSearchParams(req.form).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    else if (typeof req.body === 'string') body = req.body;
    if (body && Buffer.byteLength(body) > SYNC_MAX) return { status: 0, error: 'troppo grande' };
    const res = await net.fetch(u.href, { method, headers, body: method === 'GET' ? undefined : body, redirect: 'error', signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > SYNC_MAX) return { status: 0, error: 'risposta troppo grande' };
    const h = {}; res.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
    return { status: res.status, text: buf.toString('utf8'), headers: h };
  } catch (e) { return { status: 0, error: e && e.name === 'TimeoutError' ? 'tempo scaduto' : 'rete' }; }
});

/* MPC Fill (mpcfill.com): ricerca delle stampe della comunita'. Solo i quattro indirizzi dell'API, corpo limitato.
   La richiesta parte da Electron: il sito accetta dal browser solo certe origini (CORS). */
const MPC_GET = new Set(['/2/sources/', '/2/tags/']);
const MPC_POST = new Set(['/2/editorSearch/', '/2/cards/']);
ipcMain.handle('cpa:mpc', async (_event, req) => {
  try {
    if (!req || typeof req !== 'object') return { status: 0, error: 'richiesta non valida' };
    const u = new URL(String(req.url));
    const method = req.method === 'POST' ? 'POST' : 'GET';
    if (u.protocol !== 'https:' || u.hostname !== 'mpcfill.com' || u.search || !(method === 'POST' ? MPC_POST : MPC_GET).has(u.pathname)) return { status: 0, error: 'indirizzo non consentito' };
    let body;
    if (method === 'POST') {
      if (typeof req.body !== 'string' || req.body.length > 200000) return { status: 0, error: 'richiesta non valida' };
      body = req.body;
    }
    const res = await net.fetch(u.href, {
      method, body, redirect: 'error', signal: AbortSignal.timeout(40000),
      headers: Object.assign({ Accept: 'application/json' }, method === 'POST' ? { 'Content-Type': 'application/json' } : {})
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return { status: 0, error: 'risposta troppo grande' };
    return { status: res.status, text: buf.toString('utf8') };
  } catch (e) { return { status: 0, error: e && e.name === 'TimeoutError' ? 'tempo scaduto' : 'rete' }; }
});

/* Appunti scritti dal programma: funziona anche quando la finestra ha perso il focus (ad esempio dopo aver aperto il browser). */
ipcMain.handle('cpa:copy', (_event, text) => {
  if (typeof text !== 'string' || text.length > 1000000) return false;
  try { clipboard.writeText(text); return true; } catch (e) { return false; }
});

/* Aggiornamento: scarica lo zip della nuova versione nella cartella Download e la mostra; poi si chiude l'app, si estrae e si avvia la nuova. */
let updating = false;
ipcMain.handle('cpa:update', async (event, url) => {
  if (updating) return { ok: false, error: 'busy' };
  if (!updater.validUrl(url)) return { ok: false, error: 'bad-url' };
  updating = true;
  try {
    const r = await updater.download((u, i) => net.fetch(u, i), url, app.getPath('downloads'),
      (p) => { try { event.sender.send('cpa:update-progress', p); } catch (e) { /* finestra chiusa */ } }, AbortSignal.timeout(15 * 60 * 1000));
    if (r.ok) shell.showItemInFolder(r.path);
    return r;
  } catch (e) { return { ok: false, error: 'network' }; } finally { updating = false; }
});

ipcMain.handle('cpa:quit', () => { app.quit(); return true; });

/* Risorse incluse nell'app (risorse.json): la pagina è aperta da file:// e lì fetch() non funziona, quindi le legge Electron.
   Solo nomi semplici dentro la cartella web. */
ipcMain.handle('cpa:resource', async (_event, name) => {
  if (typeof name !== 'string' || !/^[a-z0-9_-]+\.json$/i.test(name)) return null;
  try { return await require('fs').promises.readFile(path.join(__dirname, 'web', name), 'utf8'); } catch (e) { return null; }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 780, minWidth: 380, minHeight: 560,
    title: 'Coglio Proxy Archive',
    icon: path.join(__dirname, 'web', 'icons', 'icon-512.png'),
    backgroundColor: '#eceef5',
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'web', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
