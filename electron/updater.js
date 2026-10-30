/* Scarico dell'aggiornamento da GitHub Releases (senza dipendenze da Electron: si prova in Node con un fetch simulato). */
const fs = require('fs');
const path = require('path');

const REPO = 'imHuHo/coglio-proxy-archive';
const URL_RE = new RegExp('^https://github\\.com/' + REPO.replace('/', '\\/').replace('.', '\\.') + '/releases/download/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\\.zip$');

/* Si scarica solo lo zip di una release di questo repository. */
function validUrl(u) { return typeof u === 'string' && u.length < 300 && URL_RE.test(u); }

function uniquePath(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext);
  let p = path.join(dir, base + ext), i = 2;
  while (fs.existsSync(p)) p = path.join(dir, base + ' (' + (i++) + ')' + ext);
  return p;
}

/* fetchFn(url) -> risposta fetch; onProgress({received,total}). Scrive prima un .part e lo rinomina a scarico finito. */
async function download(fetchFn, url, dir, onProgress, signal) {
  if (!validUrl(url)) return { ok: false, error: 'bad-url' };
  const res = await fetchFn(url, { redirect: 'follow', signal });
  if (!res.ok || !res.body) return { ok: false, error: 'http', status: res.status };
  const total = parseInt(res.headers.get('content-length'), 10) || 0;
  const final = uniquePath(dir, path.basename(new URL(url).pathname)), tmp = final + '.part';
  const out = fs.createWriteStream(tmp);
  let got = 0, last = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      if (onProgress && Date.now() - last > 150) { last = Date.now(); onProgress({ received: got, total }); }
    }
    await new Promise((r, j) => { out.on('error', j); out.end(r); });
  } catch (e) {
    try { out.destroy(); fs.unlinkSync(tmp); } catch (e2) { /* ignorato */ }
    return { ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network' };
  }
  if (total && got !== total) { try { fs.unlinkSync(tmp); } catch (e) { /* ignorato */ } return { ok: false, error: 'incomplete' }; }
  fs.renameSync(tmp, final);
  if (onProgress) onProgress({ received: got, total: total || got });
  return { ok: true, path: final, bytes: got };
}

module.exports = { validUrl, download, uniquePath, REPO };
