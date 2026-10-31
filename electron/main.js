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
