/* Coglio Proxy Builder - schermata per creare il PDF stampabile.
 * Usa il motore (pdf.js), la ricerca carte/immagini (proxy.js) e le funzioni che app.js mette in window.CPAHost. */
(function () {
  'use strict';
  var H = window.CPAHost, P = window.CPAPdf, X = window.CPAProxy, C = window.Core;
  if (!H || !P || !X) return;
  var LS = 'cpa:bd:v1';
  var esc = H.esc;
  var bd = null, resolver = null, seq = 0, runId = 0;

  /* ---------- stato e preferenze ---------- */
  function fresh() {
    return { source: 'paste', deckId: null, deckName: '', text: '', entries: [], opts: JSON.parse(JSON.stringify(P.DEFAULTS)), upBleed: '0',
      tokens: false, nobasic: false, busy: '', progress: '', page: 1, report: null, picker: null, pickList: null, presets: {}, presetName: '', msg: '' };
  }
  function prefs() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }
  function savePrefs() {
    try { localStorage.setItem(LS, JSON.stringify({ opts: bd.opts, upBleed: bd.upBleed, tokens: bd.tokens, nobasic: bd.nobasic, presets: bd.presets })); } catch (e) { /* ignorato */ }
  }
  function init() {
    if (bd) return;
    bd = fresh();
    var p = prefs();
    if (p.opts && typeof p.opts === 'object') for (var k in bd.opts) if (p.opts[k] !== undefined) bd.opts[k] = p.opts[k];
    if (p.upBleed != null) bd.upBleed = String(p.upBleed);
    bd.tokens = !!p.tokens; bd.nobasic = !!p.nobasic;
    if (p.presets && typeof p.presets === 'object') bd.presets = p.presets;
  }
  function getResolver() {
    if (!resolver) resolver = X.create({
      fetch: function (u, i) { return fetch(u, i); }, keyOf: C.keyOf,
      /* le immagini sono binarie: su Android si usa il fetch originale della pagina, non quello nativo che le passerebbe come testo */
      imageFetch: function (u) { return (window.CapacitorWebFetch || window.fetch).call(window, u); },
      gap: window.CPA_API_GAP != null ? window.CPA_API_GAP : 110
    });
    return resolver;
  }
  function available() { return H.available(); }

  /* ---------- carte ---------- */
  function mkEntry(c) { return { id: ++seq, name: c.name, qty: c.qty == null ? 1 : c.qty, set: c.set || '', cn: c.cn || '', card: null, nf: false }; }
  function inc(e) { return e.qty > 0 && !(bd.nobasic && C.isBasic(e.name)); }
  function entryById(id) { return bd.entries.filter(function (e) { return String(e.id) === String(id); })[0]; }
  function total() { return bd.entries.filter(inc).reduce(function (t, e) { return t + e.qty; }, 0); }

  function open(deckId) {
    init();
    var d = deckId && H.getDeck(deckId);
    if (d) {
      bd.source = 'deck'; bd.deckId = d.id; bd.deckName = d.name;
      bd.entries = d.cards.map(mkEntry);
      bd.page = 1; bd.report = null; bd.picker = null; bd.msg = '';
    } else {
      bd.source = 'paste'; bd.deckId = null; bd.deckName = '';
      if (bd.report) bd.report = null;
    }
    H.ui.view = 'builder'; window.scrollTo(0, 0); H.render();
    if (available()) resolveAll();
  }

  function resolveAll() {
    var todo = bd.entries.filter(function (e) { return !e.card && !e.nf && !e.custom; });
    if (!todo.length || bd.busy) return;
    var my = ++runId;
    bd.busy = 'resolve'; bd.progress = 'Cerco le carte su Scryfall…';
    softRender();
    getResolver().resolve(todo, function (p) {
      if (my === runId) bd.progress = 'Cerco le carte: ' + p.found + ' / ' + p.total;
      var el = document.getElementById('bd-prog'); if (el) el.textContent = bd.progress;
    }).then(function (found) {
      todo.forEach(function (e) { var c = found[getResolver().keyFor(e)]; if (c) e.card = c; else e.nf = true; });
      bd.busy = ''; bd.progress = '';
      var nf = todo.filter(function (e) { return e.nf; }).length;
      if (nf) H.toast(nf === 1 ? 'Una carta non è stata trovata su Scryfall.' : nf + ' carte non sono state trovate su Scryfall.');
      softRender();
    }, function (err) {
      bd.busy = ''; bd.progress = '';
      H.toast('Non riesco a contattare Scryfall' + (err && err.status ? ' (errore ' + err.status + ')' : '') + ': controlla la connessione e riprova.', null, true);
      softRender();
    });
  }
  function softRender() { if (H.ui.view === 'builder') H.render(); }

  function readList() {
    var r = C.parseList(bd.text || '');
    if (!r.cards.length) { H.toast('Non trovo carte nel testo: incolla una lista con quantità e nome (es. «1 Sol Ring»).'); return; }
    var keep = bd.entries.filter(function (e) { return e.custom; });
    bd.entries = r.cards.map(mkEntry).concat(keep);
    bd.page = 1; bd.report = null; bd.picker = null;
    H.toast('Lista letta: ' + r.total + (r.total === 1 ? ' carta' : ' carte') + (r.excluded ? ' (' + r.excluded + ' del sideboard escluse)' : '') + '.');
    H.render(); resolveAll();
  }

  /* ---------- stampe alternative ---------- */
  function openPicker(e) {
    if (bd.picker === e.id) { bd.picker = null; bd.pickList = null; H.render(); return; }
    bd.picker = e.id; bd.pickList = 'load'; H.render();
    var my = e.id;
    getResolver().printings(e.card && e.card.name ? e.card.name.split(' // ')[0] : e.name).then(function (list) {
      if (bd.picker !== my) return;
      bd.pickList = list; H.render();
    }, function () { if (bd.picker === my) { bd.pickList = []; H.toast('Non riesco a caricare le stampe di questa carta.'); H.render(); } });
  }
  function pickPrint(e, i) {
    var it = Array.isArray(bd.pickList) && bd.pickList[i]; if (!it) return;
    e.card = it.card; e.set = it.set; e.cn = it.cn; e.nf = false;
    bd.picker = null; bd.pickList = null; H.render();
  }

  /* ---------- file propri ---------- */
  function ownFile(e, file, side) {
    X.fromFile(file, P.parseJpeg).then(function (img) {
      var thumb = null; try { thumb = URL.createObjectURL(file); } catch (er) { thumb = null; }
      if (side === 'back') { e.customBack = img; e.thumbBack = thumb; } else { e.custom = img; e.thumb = thumb; e.nf = false; }
      H.render();
    }, function (err) { H.toast('«' + file.name + '»: ' + (err && err.message ? err.message : 'immagine non leggibile') + '.'); });
  }
  function addOwn(files) {
    var list = [].slice.call(files || []), pending = list.length;
    if (!pending) return;
    list.forEach(function (f) {
      X.fromFile(f, P.parseJpeg).then(function (img) {
        var e = mkEntry({ name: f.name.replace(/\.[^.]+$/, ''), qty: 1 });
        e.custom = img; try { e.thumb = URL.createObjectURL(f); } catch (er) { e.thumb = null; }
        bd.entries.push(e);
      }, function (err) { H.toast('«' + f.name + '»: ' + (err && err.message ? err.message : 'immagine non leggibile') + '.'); })
        .then(function () { if (--pending === 0) H.render(); });
    });
  }

  /* ---------- generazione ---------- */
  function jobEntries() {
    var up = parseFloat(String(bd.upBleed).replace(',', '.')) || 0;
    return bd.entries.filter(inc).map(function (e) {
      var o = { name: e.name, qty: e.qty, set: e.set, cn: e.cn, card: e.card, nf: e.nf };
      if (e.custom) { e.custom.bleed = up; o.front = e.custom; }
      if (e.customBack) { e.customBack.bleed = up; o.back = e.customBack; o.backName = e.name + ' (retro)'; }
      return o;
    });
  }
  function prepareJob(label) {
    if (!available()) { H.toast('Il builder ha bisogno di internet per scaricare le immagini: non funziona dentro Claude.'); return Promise.reject(new Error('na')); }
    var ents = jobEntries();
    if (!ents.length) { H.toast('Non ci sono carte da stampare.'); return Promise.reject(new Error('empty')); }
    bd.busy = 'gen'; bd.report = null; bd.progress = label; softRender();
    return getResolver().prepare(ents, { parse: P.parseJpeg, tokens: bd.tokens }, function (p) {
      bd.progress = p.phase === 'cards' ? 'Cerco le carte: ' + p.found + ' / ' + p.total : 'Scarico le immagini: ' + p.done + ' / ' + p.total;
      var el = document.getElementById('bd-prog'); if (el) el.textContent = bd.progress;
    }).then(function (res) {
      ents.forEach(function (o, i) { /* ricorda le carte trovate per non cercarle di nuovo */
        var e = bd.entries.filter(inc)[i]; if (e && !e.card && o.card) e.card = o.card; else if (e && !e.card && !o.front && !e.custom) e.nf = true;
      });
      return res;
    });
  }
  function fileName(ext) {
    var base = (bd.source === 'deck' && bd.deckName ? bd.deckName : 'proxy').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'proxy';
    return base + ext;
  }
  function describe(res, extra) {
    var rp = res.report, out = [];
    if (rp.missing.length) out.push({ k: 'err', t: plural(rp.missing.length, 'carta senza immagine', 'carte senza immagine') + ' (nel PDF c’è un riquadro vuoto): ' + rp.missing.join(', ') + '.' });
    if (rp.substituted.length) out.push({ k: 'warn', t: plural(rp.substituted.length, 'stampa non disponibile, ne ho usata un’altra', 'stampe non disponibili, ne ho usate altre') + ': ' + rp.substituted.map(function (s) { return s.name + ' (' + s.asked + ' → ' + s.got + ')'; }).join(', ') + '.' });
    if (rp.tokens) out.push({ k: 'ok', t: plural(rp.tokens, 'token aggiunto', 'token aggiunti') + '.' });
    if (rp.failed.length) out.push({ k: 'err', t: plural(rp.failed.length, 'immagine non scaricata', 'immagini non scaricate') + '.' });
    return out.concat(extra || []);
  }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function finish(msg, items) { bd.busy = ''; bd.progress = ''; bd.report = { msg: msg, items: items || [] }; softRender(); }
  function fail(err) {
    if (err && (err.message === 'na' || err.message === 'empty')) { bd.busy = ''; bd.progress = ''; softRender(); return; }
    bd.busy = ''; bd.progress = '';
    H.toast('Qualcosa non ha funzionato' + (err && err.status ? ' (errore ' + err.status + ')' : '') + ': controlla la connessione e riprova.' + (err && err.message && !err.status ? ' (' + err.message + ')' : ''), null, true);
    softRender();
  }

  function generate() {
    if (bd.busy) return;
    prepareJob('Preparo il PDF…').then(function (res) {
      bd.progress = 'Impagino…'; var out;
      try { out = P.build(bd.opts, res.items); } catch (e) { return fail(e); }
      return H.download(fileName('.pdf'), out.bytes, 'application/pdf').then(function (ok) {
        var mb = (out.bytes.length / 1048576).toFixed(1).replace('.', ',');
        finish(ok === false ? 'Non sono riuscito a salvare il file.' : 'PDF creato: ' + plural(out.pages, 'pagina', 'pagine') + (out.pages !== out.totalPages ? ' (su ' + out.totalPages + ')' : '') + ', ' + mb + ' MB' + (ok === 'declined' ? ' (download annullato)' : '') + '.', describe(res));
      });
    }).catch(fail);
  }
  function zipImages() {
    if (bd.busy) return;
    prepareJob('Scarico le immagini…').then(function (res) {
      var files = [], used = {};
      function nm(base, ext) { var n = base.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'carta', k = n, i = 2; while (used[k.toLowerCase()]) k = n + ' (' + (i++) + ')'; used[k.toLowerCase()] = 1; return k + ext; }
      res.items.forEach(function (it, i) {
        var pre = ('00' + (i + 1)).slice(-3) + ' ';
        if (it.front) files.push({ name: nm(pre + it.name + (it.qty > 1 ? ' x' + it.qty : ''), '.jpg'), bytes: it.front.bytes });
        if (it.back) files.push({ name: nm(pre + (it.backName || it.name + ' retro'), '.jpg'), bytes: it.back.bytes });
      });
      if (!files.length) { finish('Nessuna immagine da salvare.', describe(res)); return; }
      return H.download(fileName(' - immagini.zip'), X.zip(files), 'application/zip').then(function (ok) {
        finish(ok === false ? 'Non sono riuscito a salvare il file.' : 'Immagini salvate: ' + plural(files.length, 'file', 'file') + ' (.zip).', describe(res));
      });
    }).catch(fail);
  }
  function testPage() {
    var out;
    try { out = P.buildTest(bd.opts); } catch (e) { H.toast('Impossibile creare la pagina di prova.'); return; }
    H.download('pagina di prova.pdf', out.bytes, 'application/pdf').then(function (ok) { if (ok !== false) H.toast('Pagina di prova creata: stampala al 100% e controlla la barra da 100 mm.'); });
  }

  /* ---------- anteprima ---------- */
  /* L'anteprima esegue su un canvas le stesse operazioni di disegno che finiscono nel PDF (guide, abbondanza, angoli, intestazione),
     quindi mostra quello che uscirà davvero; le immagini sono versioni ridotte, il PDF usa quelle grandi. */
  var thumbs = {}, pvTimer = null, zoomed = false;
  function upMm() { return parseFloat(String(bd.upBleed).replace(',', '.')) || 0; }
  function planNow() {
    var up = upMm();
    var items = bd.entries.filter(inc).map(function (e) {
      var fs = e.card ? X.faces(e.card, 'normal') : [], bord = e.card ? X.borderOf(e.card) : '#000000';
      var front, back = null;
      if (e.custom) front = { thumb: e.thumb || '', width: e.custom.width, height: e.custom.height, border: e.custom.border, cornerPatch: false, bleed: up };
      else if (e.nf) front = null;
      else front = { thumb: fs[0] ? fs[0].url : '', width: 488, height: 680, border: bord };
      if (e.customBack) back = { thumb: e.thumbBack || '', width: e.customBack.width, height: e.customBack.height, border: e.customBack.border, cornerPatch: false, bleed: up };
      else if (fs[1]) back = { thumb: fs[1].url, width: 488, height: 680, border: bord };
      return { name: e.name, qty: e.qty, set: e.set, cn: e.cn, front: front, back: back, backName: fs[1] ? fs[1].name : '' };
    });
    return P.makePlan(bd.opts, items);
  }
  function previewInner(plan) {
    if (!plan.pages.length) return '<p class="hint">Aggiungi delle carte per vedere l’anteprima.</p>';
    if (bd.page > plan.pages.length) bd.page = plan.pages.length;
    if (bd.page < 1) bd.page = 1;
    var pg = plan.pages[bd.page - 1];
    var nav = '<div class="pv-nav"><button class="btn small" data-a="bd-page" data-v="-1"' + (bd.page <= 1 ? ' disabled' : '') + '>←</button><span>Pagina ' + bd.page + ' di ' + plan.pages.length + ' · ' +
      (pg.kind === 'back' ? 'retro' : pg.kind === 'list' ? 'lista carte' : 'fronte') + '</span><button class="btn small" data-a="bd-page" data-v="1"' + (bd.page >= plan.pages.length ? ' disabled' : '') + '>→</button></div>';
    return nav + '<div class="pv-wrap' + (zoomed ? ' zoom' : '') + '" id="bd-pvbox"><canvas class="pv-canvas" id="bd-canvas" data-a="bd-zoom" role="img" aria-label="Anteprima della pagina ' + bd.page + '"></canvas></div>' +
      '<p class="hint">Anteprima con le impostazioni attuali: si aggiorna da sola. Tocca la pagina per ingrandirla.</p>';
  }
  function thumbImage(img) {
    var url = img && img.thumb; if (!url) return null;
    var t = thumbs[url];
    if (!t) {
      var im = new Image(); t = thumbs[url] = { im: im };
      im.onload = function () { schedulePreview(30); };
      im.src = url;
    }
    return t.im.complete && t.im.naturalWidth ? t.im : null;
  }
  function drawPreview() {
    var cv = document.getElementById('bd-canvas'); if (!cv || H.ui.view !== 'builder') return;
    var plan = planNow(); if (!plan.pages.length) return;
    var pg = plan.pages[Math.min(Math.max(bd.page, 1), plan.pages.length) - 1], page = P.pageOps(plan, pg);
    var box = document.getElementById('bd-pvbox'), avail = box ? box.clientWidth : 0;
    var cssW = zoomed ? Math.max(avail, 1000) : Math.min(avail || 380, 440);
    var dpr = Math.min(window.devicePixelRatio || 1, 3), wPx = Math.round(cssW * dpr);
    cv.width = wPx; cv.height = Math.round(wPx * page.heightPt / page.widthPt);
    cv.style.width = cssW + 'px'; cv.style.height = Math.round(cssW * page.heightPt / page.widthPt) + 'px';
    var ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    P.paint(ctx, page, thumbImage, wPx);
  }
  function schedulePreview(ms) { clearTimeout(pvTimer); pvTimer = setTimeout(drawPreview, ms == null ? 120 : ms); }
  /* Solo il riquadro dell'anteprima (mentre si scrive in un campo non si ridisegna tutta la schermata). */
  function refreshPreview() {
    var box = document.getElementById('bd-pv'); if (!box) return;
    box.innerHTML = previewInner(planNow()); drawPreview();
  }
  function after() { init(); drawPreview(); }

  /* ---------- campi del modulo ---------- */
  function val(k) { var v = bd.opts[k]; return v == null ? '' : v; }
  function num(k, label, step, hint, up) {
    return '<label class="lbl">' + label + '<input class="input" type="text" inputmode="decimal" data-c="' + (up ? 'bd-up' : 'bd-opt') + '" data-k="' + k + '" value="' + esc(up ? bd.upBleed : val(k)) + '"' + (step ? ' placeholder="' + step + '"' : '') + '>' + (hint ? '<span class="sub2">' + hint + '</span>' : '') + '</label>';
  }
  function sel(k, label, opts) {
    return '<label class="lbl">' + label + '<select class="select" data-c="bd-opt" data-k="' + k + '">' + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(val(k)) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select></label>';
  }
  function chk(k, label, on, c) {
    return '<label class="chk"><input type="checkbox" data-c="' + (c || 'bd-opt') + '" data-k="' + k + '"' + (on ? ' checked' : '') + '><span>' + label + '</span></label>';
  }
  function papers() { return Object.keys(P.PAPERS).map(function (k) { return [k, P.PAPERS[k].label + (k !== 'custom' ? ' (' + P.PAPERS[k].w + ' × ' + P.PAPERS[k].h + ' mm)' : '')]; }); }
  function cardSizes() { return Object.keys(P.CARD_SIZES).map(function (k) { return [k, P.CARD_SIZES[k].label]; }); }

  function rowHtml(e) {
    var fs = e.card ? X.faces(e.card, 'small') : [], th = e.custom ? e.thumb : (fs[0] && fs[0].url), st = '', cls = '';
    if (e.custom) { st = 'immagine tua'; cls = 'own'; }
    else if (e.nf) { st = 'non trovata'; cls = 'err'; }
    else if (e.card) {
      var diff = e.set && (e.card.set !== String(e.set).toLowerCase() || (e.cn && String(e.card.collector_number).toLowerCase() !== String(e.cn).toLowerCase()));
      if (diff) { st = 'stampa diversa: ' + e.card.set.toUpperCase() + ' ' + e.card.collector_number; cls = 'warn'; }
      else if (fs.length === 2) { st = 'doppia faccia'; cls = 'info'; }
      else if (e.card.image_status === 'missing') { st = 'senza immagine'; cls = 'err'; }
    }
    var tag = e.card ? e.card.set.toUpperCase() + ' ' + e.card.collector_number : (e.set ? e.set + (e.cn ? ' ' + e.cn : '') : '');
    var h = '<div class="bd-row' + (inc(e) ? '' : ' off') + '"><span class="bd-th">' + (th ? '<img src="' + esc(th) + '" alt="" loading="lazy">' : '') + '</span>' +
      '<input class="input bd-q" type="number" min="0" max="99" inputmode="numeric" data-c="bd-qty" data-id="' + e.id + '" value="' + e.qty + '" aria-label="Quantità di ' + esc(e.name) + '">' +
      '<span class="bd-nm"><b>' + esc(e.name) + '</b><small>' + (tag ? '<span class="tag">' + esc(tag) + '</span>' : '') + (st ? '<span class="bd-st ' + cls + '">' + esc(st) + '</span>' : '') + '</small></span>' +
      '<span class="bd-acts">' +
      (e.card && !e.custom ? '<button class="btn small" data-a="bd-prints" data-id="' + e.id + '" aria-label="Scegli un’altra stampa di ' + esc(e.name) + '">Stampa…</button>' : '') +
      '<label class="btn small">' + (e.custom ? 'Cambia' : 'Tua immagine') + '<input type="file" accept="image/*" hidden data-c="bd-file" data-id="' + e.id + '" data-side="front"></label>' +
      (e.custom ? '<label class="btn small">' + (e.customBack ? 'Cambia retro' : 'Retro') + '<input type="file" accept="image/*" hidden data-c="bd-file" data-id="' + e.id + '" data-side="back"></label>' : '') +
      '<button class="btn small danger" data-a="bd-del" data-id="' + e.id + '" aria-label="Togli ' + esc(e.name) + '">×</button></span></div>';
    if (bd.picker === e.id) {
      h += '<div class="bd-pick">' + (bd.pickList === 'load' ? '<span class="hint">Carico le stampe…</span>' :
        (Array.isArray(bd.pickList) && bd.pickList.length ? bd.pickList.slice(0, 80).map(function (it, i) {
          var f = X.faces(it.card, 'small')[0];
          return '<button class="bd-p' + (e.card && e.card.id === it.card.id ? ' on' : '') + '" data-a="bd-pick" data-id="' + e.id + '" data-n="' + i + '" title="' + esc(it.setName + ' · ' + it.released) + '"><img src="' + esc(f ? f.url : '') + '" alt="" loading="lazy"><span>' + esc(it.set.toUpperCase() + ' ' + it.cn) + '</span></button>';
        }).join('') : '<span class="hint">Nessuna altra stampa trovata.</span>')) + '</div>';
    }
    return h;
  }

  function html() {
    init();
    var plan = planNow(), o = plan.opts, g = plan.geom, busy = !!bd.busy;
    var title = bd.source === 'deck' ? 'Crea PDF · ' + esc(bd.deckName) : 'Coglio Proxy Builder';
    var cards = bd.entries.filter(inc), rows = bd.entries.map(rowHtml).join('');
    var sourceBox = bd.source === 'deck' ? '' :
      '<section class="panel"><label class="lbl">Lista di carte<textarea class="input bd-ta" rows="7" data-c="bd-text" placeholder="1 Sol Ring&#10;1 Command Tower (C21) 263&#10;4 Lightning Bolt" spellcheck="false">' + esc(bd.text) + '</textarea></label>' +
      '<div class="btns"><button class="btn primary" data-a="bd-read"' + (busy ? ' disabled' : '') + '>Leggi la lista</button>' +
      '<label class="btn">Apri un file .txt<input type="file" accept=".txt,.dec,text/plain" hidden data-c="bd-listfile"></label>' +
      '<label class="btn">Aggiungi tue immagini<input type="file" accept="image/*" multiple hidden data-c="bd-addfiles"></label></div>' +
      '<p class="hint">Qui non si salva niente nell’archivio: incolla una lista qualsiasi (anche di altri programmi) e ottieni il PDF.</p></section>';
    var list = '<section class="panel"><div class="bd-head"><h2>Carte <span class="cnt">' + total() + '</span></h2><div class="bd-opts">' +
      chk('nobasic', 'Escludi le terre base', bd.nobasic, 'bd-top') + chk('tokens', 'Aggiungi i token', bd.tokens, 'bd-top') + '</div></div>' +
      (bd.source === 'deck' ? '<div class="btns"><label class="btn small">Aggiungi tue immagini<input type="file" accept="image/*" multiple hidden data-c="bd-addfiles"></label></div>' : '') +
      '<div class="bd-list">' + (rows || '<p class="hint">Nessuna carta: incolla una lista e premi «Leggi la lista».</p>') + '</div></section>';

    var page = '<section class="panel"><h2>Foglio e carte</h2><div class="bd-grid">' +
      sel('paper', 'Carta', papers()) + sel('orientation', 'Orientamento', [['portrait', 'Verticale'], ['landscape', 'Orizzontale']]) +
      (o.paper === 'custom' ? num('pageW', 'Larghezza foglio (mm)') + num('pageH', 'Altezza foglio (mm)') : '') +
      sel('card', 'Misura carta', cardSizes()) + (o.card === 'custom' ? num('cardW', 'Larghezza carta (mm)') + num('cardH', 'Altezza carta (mm)') : '') +
      num('cols', 'Colonne', 'auto', '0 = quante ne entrano') + num('rows', 'Righe', 'auto', '0 = quante ne entrano') +
      num('gapX', 'Spazio orizzontale (mm)') + num('gapY', 'Spazio verticale (mm)') + num('margin', 'Margine minimo (mm)', '', 'per il calcolo automatico') +
      '</div>' + chk('rotateCards', 'Ruota le carte di 90°', o.rotateCards) +
      '<p class="hint">Griglia: <b>' + g.cols + ' × ' + g.rows + '</b> (' + g.perPage + ' per foglio) · carta ' + o.cardW + ' × ' + o.cardH + ' mm</p></section>';

    var cut = '<section class="panel"><h2>Taglio</h2><div class="bd-grid">' +
      num('bleed', 'Abbondanza (mm)', '', 'bordo extra attorno alla carta') +
      sel('fill', 'Colore abbondanza', [['auto', 'Come il bordo della carta'], ['#000000', 'Nero'], ['#ffffff', 'Bianco']]) +
      sel('corners', 'Angoli delle carte', [['keep', 'Arrotondati (come l’immagine)'], ['crop', 'Quadrati: ingrandisce ~3% e ritaglia'], ['black', 'Arrotondati, riempi di nero'], ['white', 'Arrotondati, riempi di bianco']]) +
      sel('guides', 'Guide di taglio', [['crop', 'Segni agli angoli'], ['lines', 'Linee tra le carte'], ['none', 'Nessuna']]) +
      (o.guides !== 'none' ? num('guideLength', 'Lunghezza segni (mm)') + num('guideWidth', 'Spessore (mm)') +
        '<label class="lbl">Colore guide<input class="input col" type="color" data-c="bd-opt" data-k="guideColor" value="' + esc(o.guideColor) + '"></label>' : '') +
      sel('reg', 'Segni per plotter', [['none', 'Nessuno'], ['silhouette', 'Silhouette (3 angoli)'], ['four', 'Quattro angoli']]) +
      num('uploadBleed', 'Abbondanza già nei tuoi file (mm)', '', '', true) +
      '</div>' + (o.guides !== 'none' ? chk('guideDash', 'Guide tratteggiate', o.guideDash) : '') + chk('header', 'Logo e nome dell’app in cima al foglio (se c’è spazio)', o.header) +
      '</section>';

    var prn = '<section class="panel"><h2>Stampa</h2><div class="bd-grid">' +
      num('offsetX', 'Sposta a destra (mm)', '', 'per correggere la stampante') + num('offsetY', 'Sposta in basso (mm)') +
      sel('duplex', 'Retro delle carte doppie', [['none', 'Come carta a parte'], ['long', 'Fronte-retro, bordo lungo'], ['short', 'Fronte-retro, bordo corto']]) +
      (o.duplex !== 'none' ? num('backOffsetX', 'Retro: sposta a destra (mm)') + num('backOffsetY', 'Retro: sposta in basso (mm)') : '') +
      num('pageRange', 'Pagine da stampare', 'tutte', 'es. 1-3, 5') +
      '</div>' + (o.duplex !== 'none' ? chk('interleave', 'Alterna fronte e retro (stampa fronte-retro automatica)', o.interleave) : '') +
      chk('decklist', 'Aggiungi una pagina con la lista delle carte', o.decklist) +
      '<div class="btns"><button class="btn small" data-a="bd-test">Scarica la pagina di prova</button></div>' +
      '<p class="hint">Stampa sempre al 100% («dimensioni reali»), mai «adatta alla pagina». La pagina di prova ha un righello e una barra da 100 mm per controllarlo.</p></section>';

    var names = Object.keys(bd.presets).sort();
    var pre = '<section class="panel"><h2>Impostazioni salvate</h2><div class="bd-pre"><input class="input" data-c="bd-pname" placeholder="Nome (es. A4 con taglio a mano)" value="' + esc(bd.presetName) + '"><button class="btn small" data-a="bd-psave">Salva</button></div>' +
      (names.length ? '<div class="bd-names">' + names.map(function (n) { return '<span class="bd-pn"><button class="chip" data-a="bd-pload" data-n="' + esc(n) + '">' + esc(n) + '</button><button class="x" data-a="bd-pdel" data-n="' + esc(n) + '" aria-label="Elimina ' + esc(n) + '">×</button></span>'; }).join('') + '</div>' : '') +
      '<div class="btns"><button class="btn small" data-a="bd-reset">Ripristina le impostazioni iniziali</button></div></section>';

    var warn = plan.warnings.length ? '<div class="bd-warn">' + plan.warnings.map(function (w) { return '<p>' + esc(w) + '</p>'; }).join('') + '</div>' : '';
    var rep = bd.report ? '<div class="bd-report"><b>' + esc(bd.report.msg) + '</b>' + bd.report.items.map(function (i) { return '<p class="' + i.k + '">' + esc(i.t) + '</p>'; }).join('') + '</div>' : '';
    var na = available() ? '' : '<div class="bd-warn"><p>Il builder scarica le immagini da Scryfall e dentro Claude non può farlo: usa l’app per Windows, per Android o la versione web.</p></div>';

    var main = '<section class="panel bd-go"><div><b>' + plural(total(), 'carta', 'carte') + ' · ' + plural(plan.counts.pages, 'pagina', 'pagine') + '</b><span class="hint"> ' +
      (plan.counts.backs ? 'con ' + plural(plan.counts.backs, 'pagina di retro', 'pagine di retro') + ' · ' : '') + o.pageW + ' × ' + o.pageH + ' mm</span></div>' + warn +
      '<div class="btns"><button class="btn primary" data-a="bd-go"' + (busy || !cards.length || !available() ? ' disabled' : '') + '>Genera il PDF</button>' +
      '<button class="btn" data-a="bd-zip"' + (busy || !cards.length || !available() ? ' disabled' : '') + '>Scarica le immagini (.zip)</button></div>' +
      '<p class="hint" id="bd-prog" role="status">' + esc(bd.progress) + '</p>' + rep + '</section>';

    var back = bd.source === 'deck' ? '<button class="back" data-a="open-deck" data-id="' + esc(bd.deckId) + '">← Mazzo</button>' : '';
    return '<header class="vh">' + back + '<h1>' + title + '</h1></header>' + na + sourceBox + list +
      '<div class="bd-cols"><div class="bd-form">' + page + cut + prn + pre + '</div><div class="bd-side"><section class="panel"><h2>Anteprima</h2><div id="bd-pv">' + previewInner(plan) + '</div></section>' + main + '</div></div>' +
      '<p class="hint" style="margin-top:18px">Le immagini sono quelle di Scryfall, senza ritocchi (nome dell’artista e copyright restano visibili) e senza filigrana. Stampa solo per uso personale: le carte Magic sono © Wizards of the Coast.</p>';
  }

  /* ---------- eventi (inoltrati da app.js) ---------- */
  function click(a, el) {
    init();
    var e = el.dataset.id ? entryById(el.dataset.id) : null;
    switch (a) {
      case 'bd-read': readList(); break;
      case 'bd-go': generate(); break;
      case 'bd-zip': zipImages(); break;
      case 'bd-test': testPage(); break;
      case 'bd-page': bd.page += parseInt(el.dataset.v, 10) || 0; refreshPreview(); break;
      case 'bd-zoom': zoomed = !zoomed; refreshPreview(); break;
      case 'bd-del': if (e) { bd.entries.splice(bd.entries.indexOf(e), 1); if (bd.picker === e.id) bd.picker = null; H.render(); } break;
      case 'bd-prints': if (e) openPicker(e); break;
      case 'bd-pick': if (e) pickPrint(e, parseInt(el.dataset.n, 10)); break;
      case 'bd-psave':
        var nm = (bd.presetName || '').trim();
        if (!nm) { H.toast('Dai un nome alle impostazioni per salvarle.'); break; }
        bd.presets[nm] = { opts: JSON.parse(JSON.stringify(bd.opts)), upBleed: bd.upBleed };
        savePrefs(); H.toast('Impostazioni «' + nm + '» salvate.'); H.render(); break;
      case 'bd-pload':
        var pr = bd.presets[el.dataset.n];
        if (pr) { for (var k in P.DEFAULTS) bd.opts[k] = pr.opts && pr.opts[k] !== undefined ? pr.opts[k] : P.DEFAULTS[k]; bd.upBleed = String(pr.upBleed || '0'); bd.presetName = el.dataset.n; savePrefs(); H.render(); }
        break;
      case 'bd-pdel': delete bd.presets[el.dataset.n]; savePrefs(); H.render(); break;
      case 'bd-reset': bd.opts = JSON.parse(JSON.stringify(P.DEFAULTS)); bd.upBleed = '0'; savePrefs(); H.render(); break;
    }
  }
  function input(c, el) {
    init();
    if (c === 'bd-text') bd.text = el.value;
    else if (c === 'bd-pname') bd.presetName = el.value;
    else if (c === 'bd-opt') { bd.opts[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; schedulePreview(); }
    else if (c === 'bd-up') { bd.upBleed = el.value; schedulePreview(); }
  }
  function change(c, el) {
    init();
    var e = el.dataset.id ? entryById(el.dataset.id) : null;
    switch (c) {
      case 'bd-opt': bd.opts[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; savePrefs(); H.render(); break;
      case 'bd-up': bd.upBleed = el.value; savePrefs(); H.render(); break;
      case 'bd-top': bd[el.dataset.k] = el.checked; savePrefs(); H.render(); break;
      case 'bd-qty': if (e) { var q = parseInt(el.value, 10); e.qty = isFinite(q) && q > 0 ? Math.min(q, 99) : 0; H.render(); } break;
      case 'bd-file': if (e && el.files && el.files[0]) ownFile(e, el.files[0], el.dataset.side); break;
      case 'bd-addfiles': addOwn(el.files); break;
      case 'bd-listfile':
        if (el.files && el.files[0]) { var r = new FileReader(); r.onload = function () { bd.text = String(r.result || ''); H.render(); readList(); }; r.readAsText(el.files[0]); }
        break;
    }
  }

  window.CPABuilder = { open: open, html: html, after: after, click: click, input: input, change: change, state: function () { init(); return bd; } };
})();
