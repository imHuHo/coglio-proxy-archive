/* Test dello scarico degli aggiornamenti (electron/updater.js) con un fetch simulato. */
const U = require('../electron/updater.js');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const good = 'https://github.com/imHuHo/coglio-proxy-archive/releases/download/v2.1.0/Coglio-Proxy-Archive-Windows.zip';
ok(U.validUrl(good), 'url della release accettato');
for (const bad of ['https://github.com/altro/repo/releases/download/v1/a.zip', 'http://github.com/imHuHo/coglio-proxy-archive/releases/download/v1/a.zip',
  'https://github.com.evil.com/imHuHo/coglio-proxy-archive/releases/download/v1/a.zip', good + '?x=1', good.replace('.zip', '.exe'), 'https://github.com/imHuHo/coglio-proxy-archive/releases/download/../../a.zip', '', null, 5])
  ok(!U.validUrl(bad), 'url rifiutato: ' + bad);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpa-upd-'));
const body = (chunks, fail) => ({ getReader() { let i = 0; return { async read() { if (fail && i === 2) throw new Error('rete'); return i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }; } }; } });
const resp = (chunks, hdr, o) => Object.assign({ ok: true, status: 200, headers: { get: k => (hdr || {})[k.toLowerCase()] || null }, body: body(chunks, o && o.fail) }, o || {});
(async () => {
  const data = [Buffer.alloc(1000, 1), Buffer.alloc(1000, 2), Buffer.alloc(500, 3)], prog = [];
  let r = await U.download(async () => resp(data, { 'content-length': '2500' }), good, dir, p => prog.push(p));
  ok(r.ok && r.bytes === 2500 && fs.statSync(r.path).size === 2500 && path.basename(r.path) === 'Coglio-Proxy-Archive-Windows.zip', 'file scritto con il nome giusto');
  ok(!fs.existsSync(r.path + '.part'), 'nessun .part rimasto');
  ok(prog.length >= 1 && prog[prog.length - 1].received === 2500 && prog[prog.length - 1].total === 2500, 'avanzamento finale 100%');
  const r2 = await U.download(async () => resp(data, { 'content-length': '2500' }), good, dir);
  ok(r2.ok && path.basename(r2.path) === 'Coglio-Proxy-Archive-Windows (2).zip', 'non sovrascrive: secondo file con (2)');
  const r3 = await U.download(async () => resp(data, { 'content-length': '9999' }), good, dir);
  ok(!r3.ok && r3.error === 'incomplete' && fs.readdirSync(dir).every(f => !f.endsWith('.part')), 'scarico incompleto scartato');
  const r4 = await U.download(async () => resp(data, {}, { fail: true }), good, dir);
  ok(!r4.ok && r4.error === 'network' && fs.readdirSync(dir).every(f => !f.endsWith('.part')), 'errore di rete: pulizia');
  const r5 = await U.download(async () => ({ ok: false, status: 404 }), good, dir);
  ok(!r5.ok && r5.error === 'http' && r5.status === 404, 'errore http');
  const r6 = await U.download(async () => { throw new Error('non si deve chiamare'); }, 'https://evil.example/a.zip', dir);
  ok(!r6.ok && r6.error === 'bad-url', 'url non valido: nessuna richiesta');
  console.log('update-test: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
