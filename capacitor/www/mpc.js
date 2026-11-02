/* MPC Fill: stampe della comunita' (mpcfill.com) per le carte dei mazzi.
 *
 * Il sito e' un indice di immagini ad alta risoluzione (fino a 1200 dpi) caricate da artisti e stampatori su Google Drive.
 * Qui: ricerca per nome, dpi, riconoscimento delle stampe NON ufficiali dai tag della comunita', indirizzi delle immagini.
 *
 * Le richieste all'API partono dall'app (Windows/Android), non dalla pagina: mpcfill.com accetta solo certe origini (CORS).
 * Le immagini invece arrivano da Google (lh4.googleusercontent.com) e si possono leggere ovunque.
 * Nessun accesso a siti diversi da questi due, e nessuna dipendenza dal DOM: si prova con Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPAMpc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASE = 'https://mpcfill.com';
  var IMG = 'https://lh4.googleusercontent.com/d/';
  var PAGE = 75;                       // il server accetta al massimo 75 carte per richiesta
  var CARD_H = 1110;                   // altezza in pixel di una carta MPC (con abbondanza) a 300 dpi
  var BLEED_MM = 3;                    // l'immagine MPC e' 69 x 94 mm: 3 mm di abbondanza per lato

  /* Qualita' di stampa proposte: dpi -> altezza richiesta a Google. */
  var QUALITY = [300, 600, 1200];
  function pxForDpi(dpi) { return Math.round(Math.max(72, dpi) * CARD_H / 300); }
  function imageUrl(id, px) { return IMG + encodeURIComponent(String(id)) + '=h' + Math.max(64, Math.min(5000, parseInt(px, 10) || 800)); }
  function thumbUrl(id) { return imageUrl(id, 400); }
  function viewUrl(id) { return 'https://drive.google.com/file/d/' + encodeURIComponent(String(id)) + '/view'; }

  /* ----- tag della comunita' -----
   * "custom": la carta non e' un'immagine ufficiale Wizards (arte cambiata, IA, cornice inventata, scansione ingrandita).
   * "official-variant": trattamento che esiste davvero in stampa (bordo pieno, arte estesa, showcase, promo...).
   * Un'immagine senza tag NON e' garantita ufficiale: chi la carica puo' non aver messo nulla. */
  var CUSTOM_RE = /(altered|custom|\bai\b|ai[ -]?(art|remaster|frame)|artist art|switched art|pixel|pop-?out|sketch|upscal|fan[ -]?made|homebrew|reimagin|redesign|re-?frame)/i;
  var VARIANT_RE = /(borderless|extended|showcase|full[ -]?art|fnm|promo|foil[ -]?etched|retro|old[ -]?frame|textless|serialized|galaxy|etched|surge|confetti|ripple|step-and-compleat|alternate|japanese|anime|secret lair|judge)/i;

  function classify(tags) {
    var list = Array.isArray(tags) ? tags.map(String) : [];
    var custom = list.filter(function (t) { return CUSTOM_RE.test(t); });
    var variant = list.filter(function (t) { return !CUSTOM_RE.test(t) && VARIANT_RE.test(t); });
    return { unofficial: custom.length > 0, custom: custom, variant: variant, tagged: list.length > 0 };
  }

  /* Nome del file/carta come lo mettono gli autori: "Sol Ring (2XM0354)", "Sol Ring [Full Art Extended E]"... */
  function setHint(name) {
    var t = String(name || ''), m;
    if ((m = /[(\[]\s*([A-Z0-9]{3,5})[\s-]+(\d{1,4}[a-z]?)\s*[)\]]/.exec(t))) return m[1] + ' ' + m[2];      // (CMD 263)
    if ((m = /[(\[]\s*([A-Z0-9]{3,4}?)(\d{2,4}[a-z]?)\s*[)\]]/.exec(t))) return m[1] + ' ' + m[2];        // (2XM0354)
    return '';
  }

  function parseCard(c) {
    if (!c || typeof c !== 'object' || !c.identifier) return null;
    var tags = Array.isArray(c.tags) ? c.tags.map(String) : [];
    var k = classify(tags), dpi = Math.round(Number(c.dpi) || 0);
    return {
      id: String(c.identifier), name: String(c.name || ''), dpi: dpi, size: Number(c.size) || 0, ext: String(c.extension || '').toLowerCase(),
      src: String(c.sourceName || c.source || ''), srcType: String(c.sourceType || ''), lang: String(c.language || '').toLowerCase(),
      tags: tags, unofficial: k.unofficial, custom: k.custom, variant: k.variant, tagged: k.tagged,
      hint: setHint(c.name), date: String(c.dateCreated || '').slice(0, 10)
    };
  }

  function mb(bytes) { return bytes ? (bytes / 1048576 >= 10 ? Math.round(bytes / 1048576) : Math.round(bytes / 104857.6) / 10) + ' MB' : ''; }

  /* Un nome di carta a due facce si cerca con la prima faccia. */
  function queryName(name) { return String(name || '').split(/\s*\/\/\s*/)[0].trim().toLowerCase(); }

  function create(opt) {
    opt = opt || {};
    var http = opt.http, cache = opt.cache || null, now = opt.now || Date.now, gap = opt.gap != null ? opt.gap : 150;
    var sources = null, sourcesAt = 0, gate = Promise.resolve();
    var TTL = 24 * 3600e3;

    function available() { return typeof http === 'function'; }
    function pause() { return new Promise(function (r) { setTimeout(r, gap); }); }
    function call(req) {
      if (!available()) return Promise.reject(err('app', 'Le stampe MPC Fill si cercano solo nell’app Windows o Android.'));
      var p = gate.then(function () {
        return Promise.resolve(http(req)).then(function (r) {
          if (!r || !r.status) throw err('net', 'Non riesco a contattare MPC Fill.');
          var text = r.text || '';
          if (r.status === 403 || r.status === 503 || /^\s*</.test(text)) throw err('guard', 'MPC Fill ha bloccato la richiesta (protezione anti-bot). Riprova tra poco.');
          if (r.status === 429) throw err('rate', 'MPC Fill chiede di rallentare: riprova tra un minuto.');
          if (r.status < 200 || r.status >= 300) throw err('http', 'MPC Fill ha risposto con errore ' + r.status + '.');
          try { return JSON.parse(text); } catch (e) { throw err('json', 'Risposta di MPC Fill non leggibile.'); }
        });
      });
      gate = p.then(pause, pause);
      return p;
    }
    function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
    function post(path, body) { return call({ url: BASE + path, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }); }

    /* Elenco degli archivi (ogni autore e' una "source"): si cerca in tutti. */
    function getSources() {
      if (sources && now() - sourcesAt < TTL) return Promise.resolve(sources);
      var hit = cache && cache.get('sources');
      if (hit && hit.t && now() - hit.t < 7 * TTL && Array.isArray(hit.v) && hit.v.length) { sources = hit.v; sourcesAt = hit.t; return Promise.resolve(sources); }
      return call({ url: BASE + '/2/sources/', method: 'GET', headers: { Accept: 'application/json' } }).then(function (r) {
        var res = (r && r.results) || {}, list = Object.keys(res).map(function (k) { return parseInt(res[k] && res[k].pk != null ? res[k].pk : k, 10); }).filter(function (n) { return n === n; });
        if (!list.length) throw err('json', 'MPC Fill non ha restituito gli archivi.');
        sources = list; sourcesAt = now();
        if (cache) cache.set('sources', { t: sourcesAt, v: list });
        return list;
      });
    }

    /* opts: { minDpi } -> sessione { name, q, ids, total, cards, next } da riempire con more(). */
    function search(name, opts) {
      opts = opts || {};
      var q = queryName(name), minDpi = Math.max(0, parseInt(opts.minDpi, 10) || 0);
      if (!q) return Promise.reject(err('empty', 'Nessun nome da cercare.'));
      var ck = 'q:' + q + '|' + minDpi, hit = cache && cache.get(ck);
      if (hit && hit.t && now() - hit.t < TTL && Array.isArray(hit.ids)) return Promise.resolve({ name: name, q: q, minDpi: minDpi, ids: hit.ids, cards: [], next: 0 });
      return getSources().then(function (src) {
        return post('/2/editorSearch/', {
          queries: [{ query: q, cardType: 'CARD' }],
          searchSettings: {
            searchTypeSettings: { fuzzySearch: false, filterCardbacks: false },
            sourceSettings: { sources: src.map(function (pk) { return [pk, true]; }) },
            filterSettings: { minimumDPI: minDpi, maximumDPI: 1500, maximumSize: 30, languages: [], includesTags: [], excludesTags: [] }
          }
        });
      }).then(function (r) {
        var by = (r && r.results) || {}, row = by[q] || by[Object.keys(by)[0]] || {}, ids = Array.isArray(row.CARD) ? row.CARD.map(String) : [];
        if (cache) cache.set(ck, { t: now(), ids: ids.slice(0, 600) });
        return { name: name, q: q, minDpi: minDpi, ids: ids, cards: [], next: 0 };
      }).then(function (s) { s.total = s.ids.length; return s; });
    }

    /* Carica altre `n` carte della sessione (75 alla volta). */
    function more(s, n) {
      var take = s.ids.slice(s.next, s.next + Math.max(1, Math.min(n || PAGE, PAGE))), have = {};
      if (!take.length) return Promise.resolve(s);
      var need = [];
      take.forEach(function (id) { var c = cache && cache.get('c:' + id); if (c && c.v) have[id] = c.v; else need.push(id); });
      var step = need.length ? post('/2/cards/', { cardIdentifiers: need }).then(function (r) {
        var res = (r && r.results) || {};
        need.forEach(function (id) { var c = parseCard(res[id]); if (c) { have[id] = c; if (cache) cache.set('c:' + id, { t: now(), v: c }); } });
      }) : Promise.resolve();
      return step.then(function () {
        take.forEach(function (id) { if (have[id]) s.cards.push(have[id]); });
        s.next += take.length;
        return s;
      });
    }

    return { available: available, search: search, more: more, sources: getSources, PAGE: PAGE };
  }

  return {
    create: create, parseCard: parseCard, classify: classify, setHint: setHint, queryName: queryName,
    imageUrl: imageUrl, thumbUrl: thumbUrl, viewUrl: viewUrl, pxForDpi: pxForDpi, mb: mb, QUALITY: QUALITY, BLEED_MM: BLEED_MM, BASE: BASE
  };
});
