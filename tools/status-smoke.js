/* Smoke test dell'interfaccia: stati dei mazzi, riuso nell'avviso CODIGHEL, novità. node status-smoke.js <percorso-jsdom> */
const path = require('path'), fs = require('fs'), assert = require('assert');
const { JSDOM } = require(process.argv[2] || 'jsdom');
const W = path.join(__dirname, '..', 'web');
const read = p => fs.readFileSync(p, 'utf8');
const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="toast" hidden></div></body>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window, d = w.document;
const errors = []; w.addEventListener('error', e => errors.push(e.message));
w.scrollTo = () => {};
w.eval(read(W + '/version.js')); w.eval(read(W + '/changelog.js')); w.eval(read(W + '/core.js')); w.eval(read(W + '/app.js'));
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const click = el => { assert(el, 'elemento mancante'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const clickA = (a, extra) => click($$('[data-a="' + a + '"]' + (extra || ''))[0]);
const type = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const change = (sel, v) => { const el = $(sel); if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const text = () => d.body.textContent.replace(/\s+/g, ' ');
const toastText = () => $('#toast').textContent.replace(/\s+/g, ' ');

(async () => {
  await sleep(50);
  ok(!$('.news-banner'), 'nessun avviso novità senza dati');

  // --- carte sciolte ---
  clickA('nav', '[data-v="import"]');
  clickA('draft-mode', '[data-v="binder"]');
  type('[data-c="draft-name"]', 'Sciolte');
  type('[data-c="draft-text"]', '1 Counterspell (MH2) 267\n2 Lightning Bolt (M10) 146');
  clickA('draft-next');

  // --- un mazzo nuovo che le contiene ---
  clickA('nav', '[data-v="import"]');
  type('[data-c="draft-name"]', 'Nuovo');
  type('[data-c="draft-text"]', '1 Counterspell (MH2) 267\n1 Lightning Bolt (M10) 146\n1 Sol Ring (C21) 263');
  clickA('draft-next');
  ok($('.reuse') && text().includes('CODIGHEL!'), 'avviso CODIGHEL');
  const boxes = $$('[data-c="reuse"]');
  ok(boxes.length === 2 && boxes.every(b => !b.checked), 'una spunta per carta, di base nessuna');
  ok(text().includes('Nessuna carta presa'), 'riepilogo iniziale');
  ok($('[data-c="draft-status"]') && $$('[data-c="draft-status"] option').map(o => o.value).join() === 'active,unprinted,inactive', 'scelta dello stato nel nuovo mazzo');
  const cs = boxes.find(b => b.dataset.k === 'counterspell');
  cs.checked = true; cs.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok($('#reuse-sum').textContent.includes('Prenderò 1 copia'), 'riepilogo aggiornato');
  change('[data-c="draft-status"]', 'unprinted');
  ok($$('[data-c="reuse"]').find(b => b.dataset.k === 'counterspell').checked, 'la spunta resta dopo aver cambiato stato');
  ok(text().includes('Non ancora stampato: le sue carte non entrano'), 'spiegazione dello stato');
  clickA('draft-create');
  ok(toastText().includes('1 copia presa'), 'avviso: copia presa → ' + toastText());

  // --- archivio: il mazzo non stampato non conta, la carta presa dalle sciolte sparisce dall'archivio finché non lo stampi ---
  clickA('nav', '[data-v="archive"]');
  type('#q', 'counterspell');
  ok(!$('#alist .item'), 'Counterspell fuori dall\'archivio (mazzo non stampato)');
  type('#q', 'lightning');
  ok($('#alist .item') && $('#alist .item .cnt').textContent.includes('2'), 'Lightning Bolt: 2 libere (non prese)');
  type('#q', 'sol ring');
  ok(!$('#alist .item'), 'Sol Ring non c\'è: è solo nel mazzo non stampato');

  // --- lista mazzi ---
  clickA('nav', '[data-v="decks"]');
  ok(text().includes('1 da stampare') || text().includes('da stampare'), 'conteggio da stampare');
  ok($('.deckcard.is-np'), 'scheda mazzo evidenziata');
  const sel = $$('select[data-c="status"]').find(s => s.value === 'unprinted');
  ok(sel, 'select dello stato');
  sel.value = 'active'; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(toastText().includes('attivo'), 'passa ad attivo');
  clickA('nav', '[data-v="archive"]'); type('#q', 'counterspell');
  ok($('#alist .item') && $('#alist .item').classList.contains('s-busy'), 'ora Counterspell è in archivio e in uso');

  // --- novità ---
  w.localStorage.removeItem('cpa-news-seen');
  clickA('nav', '[data-v="decks"]');
  ok($('.news-banner') && $('.news-banner').textContent.includes(w.CPA_VERSION), 'avviso novità alla prima apertura della versione');
  clickA('news-open');
  ok($('#news') && text().includes('Codighel! che novità!') && text().includes('Tre stati per i mazzi'), 'sezione novità in Dati');
  ok($$('#news details').length >= 3 && text().includes('Coglio Proxy Builder'), 'versioni precedenti elencate');
  ok(!$('.news-banner') && w.localStorage.getItem('cpa-news-seen') === w.CPA_VERSION, 'avviso sparito e ricordato');
  clickA('nav', '[data-v="decks"]');
  ok(!$('.news-banner'), 'non ricompare');
  ok(!errors.length, 'nessun errore JS: ' + errors.join('; '));
  console.log('STATUS OK, ' + n + ' controlli passati');
})().catch(e => { console.error(e); process.exit(1); });
