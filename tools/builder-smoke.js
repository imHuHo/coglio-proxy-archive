/* Smoke test della schermata Proxy Builder con jsdom e Scryfall simulato: node builder-smoke.js <percorso-jsdom> */
const path = require('path'), fs = require('fs'), assert = require('assert');
const { JSDOM } = require(process.argv[2] || 'jsdom');
const W = path.join(__dirname, '..', 'web'), F = path.join(__dirname, 'fixtures');
const read = p => fs.readFileSync(p, 'utf8');
const TINY = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAgABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDiqKKK8A/WwooooAKKKKACiiigD//Z', 'base64');

const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="toast" hidden></div></body>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window, d = w.document;
const errors = []; w.addEventListener('error', e => errors.push(e.message));
w.scrollTo = () => {}; w.CPA_API_GAP = 0; w.CPA_TOAST_SCALE = 1;
const blobs = [];
w.URL.createObjectURL = b => { blobs.push(b); return 'blob:test/' + blobs.length; }; w.URL.revokeObjectURL = () => {};
HTMLAnchorElement = w.HTMLAnchorElement; w.HTMLAnchorElement.prototype.click = function () {};

const mk = (name, set, cn, extra) => Object.assign({ id: set + cn + name, name, set, collector_number: cn, border_color: 'black', layout: 'normal',
  image_uris: { small: 'https://cards.scryfall.io/small/' + set + cn + '.jpg', large: 'https://cards.scryfall.io/large/' + set + cn + '.jpg' } }, extra || {});
const DB = [mk('Sol Ring', 'c21', '263'), mk('Sol Ring', 'cmm', '400'), mk('Sol Ring', 'lea', '270'),
  mk('Delver of Secrets // Insectile Aberration', 'isd', '51', { image_uris: undefined, card_faces: [
    { name: 'Delver of Secrets', image_uris: { small: 'https://cards.scryfall.io/small/d1.jpg', large: 'https://cards.scryfall.io/large/d1.jpg' } },
    { name: 'Insectile Aberration', image_uris: { small: 'https://cards.scryfall.io/small/d2.jpg', large: 'https://cards.scryfall.io/large/d2.jpg' } }] })];
const K = s => s.toLowerCase();
const has = (c, nm) => K(c.name) === K(nm) || (c.card_faces || []).some(f => K(f.name) === K(nm));
const find = i => i.collector_number ? DB.find(c => c.set === i.set && c.collector_number === i.collector_number) :
  (i.set ? DB.find(c => c.set === i.set && has(c, i.name)) : (DB.find(c => has(c, i.name)) || (/unknown/i.test(i.name) ? null : mk(i.name, 'gen', String(i.name.length)))));
const resp = (j, s) => ({ ok: !s || s < 300, status: s || 200, json: async () => j, arrayBuffer: async () => TINY.buffer.slice(TINY.byteOffset, TINY.byteOffset + TINY.length) });
w.fetch = async (u, init) => {
  if (u.startsWith('https://cards.scryfall.io/')) return resp({});
  const url = new URL(u);
  if (url.pathname === '/cards/collection') {
    const ids = JSON.parse(init.body).identifiers, data = ids.map(find).filter(Boolean); return resp({ data });
  }
  if (url.pathname === '/cards/search') return resp({ data: DB.filter(c => c.name === 'Sol Ring') });
  if (url.pathname === '/cards/named') { const c = find({ name: url.searchParams.get('exact') || url.searchParams.get('fuzzy') }); return c ? resp(c) : resp({}, 404); }
  return resp({}, 404);
};
for (const f of ['core.js', 'pdf.js', 'proxy.js', 'app.js', 'builder.js']) w.eval(read(W + '/' + f));

let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const click = el => { assert(el, 'elemento mancante'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const clickA = (a, extra) => click($$('[data-a="' + a + '"]' + (extra || ''))[0]);
const type = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const change = (sel, v) => { const el = $(sel); if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const text = () => d.body.textContent.replace(/\s+/g, ' ');
const opt = (k, v) => change('[data-c="bd-opt"][data-k="' + k + '"]', v);
const waitFor = async (f, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(20); } return false; };
const blobBytes = b => new Promise(r => { const fr = new w.FileReader(); fr.onload = () => r(Buffer.from(fr.result)); fr.readAsArrayBuffer(b); });

(async () => {
  await sleep(50);
  // --- lista incollata ---
  clickA('nav', '[data-v="builder"]');
  ok(text().includes('Coglio Proxy Builder') && $('[data-c="bd-text"]'), 'pagina Stampa con campo lista');
  ok($$('[data-a="bd-go"]')[0].disabled, 'Genera disabilitato senza carte');
  type('[data-c="bd-text"]', '1 Sol Ring\n1 Command Tower (C21) 263\n4 Lightning Bolt\n2 Delver of Secrets\n1 Unknown Thing\n3 Forest');
  clickA('bd-read');
  ok($$('.bd-row').length === 6, 'sei righe: ' + $$('.bd-row').length);
  ok(await waitFor(() => !$('#bd-prog').textContent && $$('.bd-st.err').length === 1), 'ricerca finita, una carta non trovata');
  ok($$('.bd-row')[4].textContent.includes('non trovata'), 'Unknown Thing non trovata');
  ok(text().includes('doppia faccia'), 'doppia faccia riconosciuta');
  ok(text().includes('12 carte'), 'totale carte: ' + (text().match(/(\d+) cart[ae] ·/) || [])[0]);
  ok($$('.bd-row img').length >= 5, 'miniature');
  ok(text().includes('3 × 3') && text().includes('2 pagine'), 'griglia 3 x 3; i retro delle doppie sono carte a parte: 14 carte = 2 pagine');

  // --- opzioni ---
  change('[data-c="bd-top"][data-k="nobasic"]', true);
  ok(text().includes('9 carte') && $$('.bd-row.off').length === 1, 'terre base escluse');
  opt('paper', 'letter'); ok(text().includes('215.9 × 279.4 mm'), 'foglio Letter');
  opt('orientation', 'landscape'); ok(text().includes('4 × 2') || text().includes('4 × 2'.replace('×', '×')), 'orizzontale cambia la griglia: ' + (text().match(/Griglia: (\d+ × \d+)/) || [])[1]);
  opt('paper', 'custom'); ok($('[data-k="pageW"]') && $('[data-k="pageH"]'), 'campi foglio personalizzato');
  opt('paper', 'a4'); opt('orientation', 'portrait');
  opt('cols', '5'); ok($('.bd-warn'), 'avviso quando non entra'); opt('cols', '0');
  opt('duplex', 'long'); ok($('[data-k="backOffsetX"]') && text().includes('con 1 pagina di retro'), 'retro: campi e conteggio pagine');
  ok($$('.pv-nav button')[1] && !$$('.pv-nav button')[1].disabled, 'navigazione pagine in anteprima');
  clickA('bd-page', '[data-v="1"]'); ok(text().includes('Pagina 2 di 2') && text().includes('retro'), 'pagina retro');
  opt('duplex', 'none'); opt('bleed', '1,5'); ok($('.pv-cell.bl'), 'abbondanza visibile in anteprima');
  opt('bleed', '0'); opt('decklist', true); ok(text().includes('3 pagine'), 'lista carte aggiunge una pagina');
  opt('decklist', false);

  // --- stampa alternativa ---
  clickA('bd-prints'); ok(await waitFor(() => $$('.bd-p').length === 3), 'stampe alternative caricate');
  click($$('.bd-p')[2]); ok($$('.bd-row')[0].textContent.includes('LEA 270'), 'stampa scelta');

  // --- genera il PDF ---
  blobs.length = 0;
  clickA('bd-go');
  ok(await waitFor(() => blobs.length > 0 && !!$('.bd-report')), 'PDF generato');
  const pdf = await blobBytes(blobs[blobs.length - 1]);
  ok(pdf.slice(0, 5).toString() === '%PDF-' && pdf.toString('latin1').includes('%%EOF'), 'file PDF valido');
  ok(/PDF creato: 2 pagine/.test(text()), 'messaggio di esito: ' + ($('.bd-report b') || {}).textContent);
  ok(text().includes('1 carta senza immagine') && text().includes('Unknown Thing'), 'carta mancante segnalata nel report');
  fs.writeFileSync('/tmp/cpa-builder-smoke.pdf', pdf);
  // pagina di prova e zip
  blobs.length = 0; clickA('bd-test'); ok(blobs.length === 1, 'pagina di prova scaricata');
  blobs.length = 0; clickA('bd-zip'); ok(await waitFor(() => blobs.length === 1 && /Immagini salvate/.test(text())), 'zip delle immagini');
  const zb = await blobBytes(blobs[0]); ok(zb.slice(0, 2).toString() === 'PK', 'file zip');

  // --- impostazioni salvate ---
  opt('gapX', '2');
  type('[data-c="bd-pname"]', 'Con spazi'); clickA('bd-psave');
  ok($$('.bd-pn').length === 1, 'impostazione salvata');
  opt('gapX', '0'); clickA('bd-pload'); ok($('[data-k="gapX"]').value === '2', 'impostazione ripristinata');
  clickA('bd-pdel'); ok($$('.bd-pn').length === 0, 'impostazione eliminata');
  clickA('bd-reset'); ok($('[data-k="gapX"]').value === '0', 'ripristino iniziale');
  const saved = JSON.parse(w.localStorage.getItem('cpa:bd:v1')); ok(saved && saved.opts.gapX === 0, 'preferenze in localStorage');

  // --- dal mazzo ---
  clickA('nav', '[data-v="import"]');
  type('[data-c="draft-text"]', '1 Sol Ring\n1 Kaalia of the Vast\n3 Forest\n2 Delver of Secrets'); type('[data-c="draft-name"]', 'Mazzo prova');
  clickA('draft-next'); clickA('draft-create');
  ok(await waitFor(() => /Mazzo prova/.test(text())), 'mazzo creato');
  clickA('make-pdf');
  ok(text().includes('Crea PDF · Mazzo prova') && !$('[data-c="bd-text"]'), 'dal mazzo: niente campo di testo');
  ok($$('.bd-row').length === 4, 'carte del mazzo: ' + $$('.bd-row').length);
  ok($('[data-a="open-deck"]'), 'torna al mazzo');
  blobs.length = 0; ok(await waitFor(() => !$('#bd-prog').textContent), 'ricerca del mazzo finita'); clickA('bd-go');
  ok(await waitFor(() => blobs.length > 0), 'PDF dal mazzo');
  ok(errors.length === 0, 'nessun errore JS: ' + errors.join(' | '));
  console.log('BUILDER OK, ' + n + ' controlli passati');
})().catch(e => { console.error(e); process.exit(1); });
