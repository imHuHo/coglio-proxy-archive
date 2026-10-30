/* Smoke test dell'interfaccia con jsdom: node ui-smoke.js <percorso-jsdom>  */
const path = require('path'), fs = require('fs'), assert = require('assert');
const { JSDOM } = require(process.argv[2] || 'jsdom');
const W = path.join(__dirname, '..', 'web'), F = path.join(__dirname, 'fixtures');
const read = p => fs.readFileSync(p, 'utf8');

const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="toast" hidden></div></body>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window, d = w.document;
const errors = [];
w.addEventListener('error', e => errors.push(e.message));
w.scrollTo = () => {};
const opened = []; let clip = null;
w.open = u => { opened.push(u); return {}; };
Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async t => { clip = t; } }, configurable: true });
w.eval(read(W + '/core.js')); w.eval(read(W + '/app.js'));

let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const click = el => { assert(el, 'elemento mancante'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const clickA = (a, extra) => click($$('[data-a="' + a + '"]' + (extra || ''))[0]);
const type = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const change = (sel, v) => { const el = $(sel); if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const text = () => d.body.textContent.replace(/\s+/g, ' ');

(async () => {
  await sleep(50);
  ok(text().includes('Archivio vuoto'), 'schermata iniziale');

  // --- importa il mazzo Kaalia (txt vero) ---
  clickA('nav', '[data-v="import"]');
  ok($('[data-c="draft-text"]'), 'form importazione');
  type('[data-c="draft-text"]', read(F + '/kaalia_old.txt'));
  type('[data-c="draft-name"]', 'Kaalia');
  clickA('draft-next');
  ok(text().includes('Scegli il commander'), 'passo commander');
  ok($('input[name="cmd"]:checked').value === 'Kaalia of the Vast', 'commander suggerito preselezionato');
  type('[data-c="cmd-q"]', 'sheoldred');
  ok($$('input[name="cmd"]').length === 0, 'ricerca commander senza risultati');
  type('[data-c="cmd-q"]', 'kaalia');
  ok($$('input[name="cmd"]').length === 1, 'ricerca commander');
  clickA('draft-create');
  ok(text().includes('Commander') && $('h1').textContent === 'Kaalia', 'mazzo creato e aperto');
  ok($$('#dlist .crow').length === 91 + 0 || $$('#dlist .crow').length > 60, 'righe carte del mazzo: ' + $$('#dlist .crow').length);
  clickA('bracket'); await sleep(50);
  ok(opened[0] === 'https://commanderbracket.app/bracket', 'Verifica bracket apre il checker');
  ok(clip.startsWith('Commander\n1 Kaalia of the Vast\n\nDeck\n') && clip.split('\n').slice(4).reduce((t, l) => t + parseInt(l, 10), 1) === 100, 'lista copiata: commander + 99 carte');
  ok(text().includes('Check my bracket'), 'avviso con le istruzioni');

  // --- bracket nell'app: risposta simulata di Commander Spellbook ---
  const reqs = [];
  const cardR = (name, o) => Object.assign({ card: { id: 1, name }, quantity: 1, banned: false, gameChanger: false, massLandDenial: false, extraTurn: false }, o || {});
  w.fetch = async (u, o) => {
    reqs.push({ u, body: JSON.parse(o.body), method: o.method });
    return { ok: true, status: 200, json: async () => ({ bracketTag: 'P', cards: [cardR('Sol Ring', { gameChanger: false }), cardR('Rhystic Study', { gameChanger: true })], combos: [] }) };
  };
  opened.length = 0; clip = null;
  clickA('bracket'); ok($('#bk'), 'pannello bracket aperto subito'); await sleep(50);
  ok(reqs.length === 1 && reqs[0].u === 'https://backend.commanderspellbook.com/estimate-bracket/' && reqs[0].method === 'POST', 'chiamata a estimate-bracket');
  ok(reqs[0].body.commanders[0].card === 'Kaalia of the Vast' && reqs[0].body.commanders.length === 1 && reqs[0].body.main.reduce((t, x) => t + x.quantity, 1) === 100, 'richiesta: commander + 99 carte');
  ok($('#bk .bk-num b').textContent === '3' && text().includes('Rhystic Study') && text().includes('Game Changer'), 'risultato mostrato: bracket 3 e Game Changer');
  ok(opened.length === 0 && clip === null, 'nessuna apertura del sito se il calcolo riesce');
  clickA('bk-web'); await sleep(50);
  ok(opened[0] === 'https://commanderbracket.app/bracket' && clip.startsWith('Commander\n1 Kaalia'), 'pulsante verso commanderbracket.app: apre e copia');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(!$('#bk'), 'Esc chiude il pannello');
  w.fetch = async () => { throw new w.TypeError('Failed to fetch'); };
  clickA('bracket'); await sleep(50);
  ok($('#bk .lb-warn') && $('#bk [data-a="bk-web"]'), 'se il calcolo non riesce: avviso e via di scampo verso il sito');
  clickA('bk-close'); ok(!$('#bk'), 'chiusura del pannello');
  w.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  clickA('bracket'); await sleep(50);
  ok(text().includes('errore'), 'errore del servizio segnalato'); clickA('bk-close');
  w.fetch = async () => { await sleep(80); return { ok: true, json: async () => ({ bracketTag: 'E', cards: [], combos: [] }) }; };
  clickA('bracket'); clickA('bk-close'); await sleep(150);
  ok(!$('#bk'), 'risposta tardiva dopo la chiusura: il pannello non riappare');
  delete w.fetch;

  // --- raccolta libera ---
  clickA('nav', '[data-v="import"]');
  clickA('draft-mode', '[data-v="binder"]');
  type('[data-c="draft-text"]', '1 Blood Crypt (RNA) 245\n1 Badlands\n1 Sol Ring (C21) 263\n1 Serra\'s Emissary');
  clickA('draft-next');
  ok(text().includes('Carte aggiunte'), 'raccolta creata');

  // --- archivio ---
  clickA('nav', '[data-v="archive"]');
  ok($('#acount').textContent.includes('carte'), 'conteggio archivio: ' + $('#acount').textContent);
  type('#q', 'sol ring');
  ok($$('#alist .item').length === 1, 'ricerca: una sola carta');
  const row = $('#alist .item');
  ok(row.classList.contains('s-part'), 'Sol Ring parziale (1 in uso + 1 libera)');
  click(row.querySelector('.item-main'));
  ok(text().includes('Mazzo attivo') || text().includes('In uso'), 'dettaglio: dove sono le copie');
  ok(text().includes('Sciolta · libera'), 'dettaglio: copia tra le sciolte');
  type('#q', '');
  clickA('st', '[data-v="avail"]');
  const availCount = $$('#alist .item').length;
  ok(availCount === 4, 'con copie libere: ' + availCount);
  clickA('st', '[data-v="all"]');
  change('[data-c="fset"]', 'C21');
  ok($$('#alist .item').length === 1, 'filtro collezione C21');
  change('[data-c="fset"]', '');
  change('[data-c="nobasic"]', true);
  type('#q', 'mountain');
  ok($$('#alist .item').length === 0, 'nascondi terre base');
  change('[data-c="nobasic"]', false);
  type('#q', 'mountain');
  ok($('#alist .item').classList.contains('s-busy'), 'Mountain occupate');

  // --- attiva/disattiva ---
  clickA('nav', '[data-v="decks"]');
  ok($$('.deckcard').length === 2, 'due schede mazzo (mazzo + raccolta)');
  ok($$('.deckcard .bracket').length === 1, 'tasto Verifica bracket solo sul mazzo, non sulle sciolte');
  change('[data-c="active"]', false);
  ok(text().includes('Non attivo'), 'mazzo disattivato');
  clickA('nav', '[data-v="archive"]'); type('#q', 'mountain');
  ok($('#alist .item').classList.contains('s-free'), 'Mountain libere con mazzo non attivo');
  clickA('nav', '[data-v="decks"]'); change('[data-c="active"]', true);

  // --- upgrade ---
  clickA('open-deck');
  clickA('deck-tab', '[data-v="ups"]');
  clickA('new-up');
  type('[data-c="draft-text"]', read(F + '/kaalia_new.txt'));
  type('[data-c="draft-name"]', 'Nuova versione');
  clickA('draft-next');
  ok($('h1').textContent === 'Nuova versione', 'upgrade creato');
  const sums = $$('.sum b').map(b => b.textContent);
  ok(sums.join() === '73,3,70', 'riepilogo upgrade: ' + sums.join() + ' (73 cambi; già in archivio: Blood Crypt, Badlands, Serra\'s Emissary)');
  ok($$('.col.out .up-row').length > 50 && $$('.col.in .up-row').length > 50, 'colonne esce/entra');
  ok(text().includes('Quando applichi') && text().includes('vanno nelle carte sciolte') || text().includes('finiscono nelle carte sciolte'), 'riepilogo spostamenti');
  type('[data-c="upq"]', 'baneslayer');
  ok($$('.col.in .up-row').length === 1 && $$('.col.out .up-row').length === 0, 'ricerca nell\'upgrade');
  type('[data-c="upq"]', 'mortify');
  ok($$('.col.out .up-row').length === 1 && $$('.col.in .up-row').length === 0, 'ricerca tra le carte che escono');
  type('[data-c="upq"]', '');
  clickA('up-st', '[data-v="have"]');
  ok($$('.col.in .up-row').length === 3, 'filtro già in archivio: ' + $$('.col.in .up-row').length);
  clickA('up-st', '[data-v="need"]');
  ok($$('.col.in .up-row').length === 70, 'filtro da procurare: ' + $$('.col.in .up-row').length);
  clickA('up-st', '[data-v="all"]');
  clickA('copy-up');
  clickA('apply-up'); ok(text().includes('Conferma: applica'), 'serve conferma');
  clickA('apply-up');
  ok($('h1').textContent === 'Kaalia' && text().includes('Upgrade applicato'), 'upgrade applicato');
  ok($$('#dlist .crow').some(r => r.textContent.includes('Baneslayer Angel')), 'carta nuova nel mazzo');
  // le carte tolte sono finite nelle sciolte, quelle entrate sono uscite dalle sciolte
  clickA('nav', '[data-v="decks"]');
  const sciolte = $$('.deckcard').filter(c => c.textContent.includes('Sciolte') || c.textContent.includes('Carte sciolte'));
  ok(sciolte.length === 1, 'lista sciolte presente');
  click(sciolte[0].querySelector('[data-a="open-deck"]'));
  ok($$('#dlist .crow').some(r => r.textContent.includes('Mortify')), 'Mortify ora tra le sciolte');
  ok(!$$('#dlist .crow').some(r => r.textContent.includes('Blood Crypt')) , 'Blood Crypt non è più sciolta (è entrata nel mazzo)');
  clickA('nav', '[data-v="decks"]'); clickA('open-deck');
  clickA('undo');
  ok(!$$('#dlist .crow').some(r => r.textContent.includes('Baneslayer Angel')), 'annulla ripristina il mazzo');

  // --- nuovo mazzo con carte già sciolte: avviso CODIGHEL ---
  clickA('nav', '[data-v="import"]');
  type('[data-c="draft-text"]', '1 Blood Crypt\n1 Badlands\n1 Carta Mai Vista\n\n1 Mortify');
  clickA('draft-next');
  ok(text().includes('CODIGHEL') && $('.reuse').textContent.includes('Blood Crypt') && $('.reuse').textContent.includes('Badlands'), 'avviso carte già stampate');
  ok(!$('.reuse').textContent.includes('Carta Mai Vista') && !$('.reuse').textContent.includes('Mortify'), 'solo le carte già presenti');

  // --- dati / backup ---
  clickA('nav', '[data-v="data"]');
  ok(text().includes('Salvati su questo dispositivo'), 'info salvataggio');
  clickA('copy-json'); await sleep(700);
  const json = JSON.parse(w.localStorage.getItem('cpa:state:v1'));
  ok(json.decks.length === 2 && json.decks.some(x => x.cards.length > 50), 'dati salvati in localStorage');
  change('[data-c="theme"]', 'dark');
  ok(d.documentElement.getAttribute('data-theme') === 'dark', 'tema scuro');
  type('[data-c="restore-text"]', '{"decks": "no"}'); clickA('restore-json');
  ok(text().includes('Errore'), 'backup non valido rifiutato');

  clickA('nav', '[data-v="decks"]'); clickA('open-deck');
  clickA('del-deck'); clickA('del-deck');
  ok($$('.deckcard').length === 1, 'mazzo eliminato');
  clickA('undo');
  ok($$('.deckcard').length === 2, 'eliminazione annullata');

  await sleep(500);
  ok(errors.length === 0, 'nessun errore JS: ' + errors.join(' | '));
  console.log('UI OK, ' + n + ' controlli passati');
})().catch(e => { console.error('FALLITO:', e.message); console.error(e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); });
