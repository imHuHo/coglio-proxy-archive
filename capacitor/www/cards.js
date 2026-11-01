/* Coglio Proxy Archive - dati delle carte (tipo, colori, costo, rarita', testo, prezzi) presi da Scryfall e ricordati sul dispositivo.
 * Servono alla ricerca avanzata e ai prezzi. Per ogni carta si tiene un piccolo riassunto, non la risposta intera di Scryfall.
 * La rete e il magazzino sono iniettabili, quindi si prova in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPACards = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 864e5, PRICE_TTL = DAY, NEG_TTL = 7 * DAY;
  var ORDER = 'WUBRG';

  function sortColors(arr) {
    var s = (arr || []).join('').toUpperCase();
    return ORDER.split('').filter(function (c) { return s.indexOf(c) >= 0; }).join('');
  }
  function num(x) { var v = x == null || x === '' ? NaN : parseFloat(x); return isNaN(v) ? null : v; }

  /* Riassunto di una carta di Scryfall. */
  function compact(card) {
    var fs = card.card_faces || [], f0 = fs[0] || {};
    var pr = card.prices || {};
    var r = {
      n: card.name, t: card.type_line || fs.map(function (f) { return f.type_line || ''; }).join(' // '),
      mc: card.mana_cost || f0.mana_cost || '', v: card.cmc || 0,
      c: sortColors(card.colors || f0.colors), ci: sortColors(card.color_identity),
      r: card.rarity || '',
      o: card.oracle_text != null ? card.oracle_text : fs.map(function (f) { return f.oracle_text || ''; }).join('\n//\n'),
      s: card.set || '', cn: String(card.collector_number || ''),
      p: num(pr.eur), pf: num(pr.eur_foil), ts: 0,
      gc: card.game_changer ? 1 : 0, bn: card.legalities && card.legalities.commander === 'banned' ? 1 : 0
    };
    var pw = card.power != null ? card.power : f0.power, tg = card.toughness != null ? card.toughness : f0.toughness;
    if (pw != null) r.pw = String(pw);
    if (tg != null) r.tg = String(tg);
    if (card.keywords && card.keywords.length) r.kw = card.keywords.slice();
    if (card.produced_mana && card.produced_mana.length) r.pm = card.produced_mana.join('').toUpperCase();
    if (fs.length > 1 && !card.image_uris) r.dfc = 1;
    return r;
  }

  /* Prezzo di una copia: prima quello normale, in mancanza quello foil. */
  function unitPrice(rec) { return rec ? (rec.p != null ? rec.p : rec.pf != null ? rec.pf : null) : null; }

  /* ----- magazzini ----- */
  function memoryStorage() {
    var m = {};
    return {
      kind: 'memory',
      all: function () { return Promise.resolve(Object.keys(m).map(function (k) { return [k, m[k]]; })); },
      put: function (k, v) { m[k] = v; return Promise.resolve(); },
      putMany: function (pairs) { pairs.forEach(function (p) { m[p[0]] = p[1]; }); return Promise.resolve(); },
      clear: function () { m = {}; return Promise.resolve(); }
    };
  }
  function idbStorage(dbName) {
    if (typeof indexedDB === 'undefined' || !indexedDB) return null;
    var dbp = null;
    function open() {
      return dbp || (dbp = new Promise(function (res, rej) {
        var r = indexedDB.open(dbName || 'coglio-cards', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('c'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
        r.onblocked = function () { rej(new Error('blocked')); };
      }));
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction('c', mode), out = fn(t.objectStore('c'));
          t.oncomplete = function () { res(out && out.result); };
          t.onerror = t.onabort = function () { rej(t.error); };
        });
      });
    }
    return {
      kind: 'idb',
      all: function () {
        return open().then(function (db) {
          return new Promise(function (res, rej) {
            var out = [], t = db.transaction('c', 'readonly'), req = t.objectStore('c').openCursor();
            req.onsuccess = function () { var c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } };
            t.oncomplete = function () { res(out); };
            t.onerror = t.onabort = function () { rej(t.error); };
          });
        });
      },
      put: function (k, v) { return tx('readwrite', function (s) { return s.put(v, k); }); },
      putMany: function (pairs) { return tx('readwrite', function (s) { pairs.forEach(function (p) { s.put(p[1], p[0]); }); }); },
      clear: function () { return tx('readwrite', function (s) { return s.clear(); }); }
    };
  }

  function create(env) {
    env = env || {};
    var proxy = env.proxy, keyOf = env.keyOf || function (s) { return String(s).toLowerCase(); };
    var storage = env.storage || memoryStorage();
    var now = env.now || function () { return Date.now(); };
    var recs = {}, byName = {}, cheap = {}, loaded = null, self = {}, chain = Promise.resolve(), listeners = [];

    function nameOfKey(k) { return k.split('|')[0]; }
    function index(k, r) {
      recs[k] = r;
      if (r && !r.x) { var nm = nameOfKey(k), cur = byName[nm]; if (!cur || (k.slice(-2) === '||')) byName[nm] = r; }
    }
    function emit() { listeners.forEach(function (f) { try { f(); } catch (e) { /* un ascoltatore che si rompe non ferma gli altri */ } }); }
    self.onChange = function (f) { listeners.push(f); };

    self.load = function () {
      if (loaded) return loaded;
      loaded = storage.all().then(function (pairs) {
        pairs.forEach(function (p) {
          if (p[0].indexOf('~|') === 0) cheap[p[0].slice(2)] = p[1]; else index(p[0], p[1]);
        });
      }).catch(function () { /* senza magazzino si riparte da zero */ });
      return loaded;
    };

    function key(name, set, cn) { return proxy.keyFor({ name: name, set: set || '', cn: cn || '' }); }
    function fresh(r, ttl) { return r && now() - (r.ts || r.x || 0) <= ttl; }

    /* ----- lettura ----- */
    self.rec = function (name, set, cn) {
      var r = recs[key(name, set, cn)];
      return r && !r.x ? r : null;
    };
    /* un riassunto qualsiasi della carta (per la ricerca): vale qualunque stampa */
    self.any = function (name) { return byName[keyOf(name)] || null; };
    self.known = function (name, set, cn) { return !!recs[key(name, set, cn)]; };
    self.cheapest = function (name) { var c = cheap[keyOf(name)]; return c && !c.x ? c : null; };
    self.hasCheapest = function (name) { return !!cheap[keyOf(name)]; };
    self.count = function () { return Object.keys(recs).filter(function (k) { return !recs[k].x; }).length; };
    self.newest = function () { var t = 0; Object.keys(recs).forEach(function (k) { if (recs[k].ts > t) t = recs[k].ts; }); return t; };

    /* ----- scarico ----- */
    function serial(fn) { var p = chain.then(fn); chain = p.then(function () {}, function () {}); return p; }

    /* entries: [{name,set,cn}]. Chiede a Scryfall solo quelle che mancano; con opt.fresh anche quelle con il prezzo vecchio (piu' di un giorno), con opt.force tutte. */
    self.ensure = function (entries, opt, progress) {
      opt = opt || {};
      return self.load().then(function () {
        return serial(function () {
          var seen = {}, need = [];
          entries.forEach(function (e) {
            var k = key(e.name, e.set, e.cn);
            if (seen[k]) return; seen[k] = 1;
            var r = recs[k];
            if (r && r.x) { if (fresh(r, NEG_TTL)) return; }
            else if (r && !opt.force && (!opt.fresh || fresh(r, PRICE_TTL))) return;
            need.push({ name: e.name, set: e.set || '', cn: e.cn || '', k: k });
          });
          var done = 0, total = need.length, chunks = [], i;
          for (i = 0; i < need.length; i += 75) chunks.push(need.slice(i, i + 75));
          if (progress) progress({ done: 0, total: total });
          return chunks.reduce(function (p, ch) {
            return p.then(function () {
              return proxy.resolve(ch).then(function (found) {
                var pairs = [];
                ch.forEach(function (e) {
                  var card = found[e.k], r = card ? compact(card) : { x: now() };
                  if (card) r.ts = now();
                  index(e.k, r); pairs.push([e.k, r]);
                });
                done += ch.length;
                return storage.putMany(pairs).catch(function () {}).then(function () {
                  emit(); if (progress) progress({ done: done, total: total });
                });
              });
            });
          }, Promise.resolve()).then(function () { return total; });
        });
      });
    };

    /* La stampa piu' economica di ogni nome: una richiesta a carta, ricordata per un giorno. */
    self.ensureCheapest = function (names, opt, progress) {
      opt = opt || {};
      return self.load().then(function () {
        return serial(function () {
          var seen = {}, need = [];
          names.forEach(function (nm) {
            var k = keyOf(nm);
            if (seen[k]) return; seen[k] = 1;
            var c = cheap[k];
            if (c && !opt.force && (!opt.fresh || fresh(c, PRICE_TTL))) return;
            need.push({ name: nm, k: k });
          });
          var done = 0, total = need.length;
          if (progress) progress({ done: 0, total: total });
          return need.reduce(function (p, e) {
            return p.then(function () {
              return proxy.cheapest(e.name).then(function (card) {
                var r;
                if (card) { r = compact(card); r.ts = now(); } else r = { x: now() };
                cheap[e.k] = r;
                return storage.put('~|' + e.k, r).catch(function () {});
              }).then(function () { done++; if (progress) progress({ done: done, total: total }); if (done % 5 === 0 || done === total) emit(); });
            });
          }, Promise.resolve()).then(function () { return total; });
        });
      });
    };

    self.clear = function () { recs = {}; byName = {}; cheap = {}; return storage.clear().catch(function () {}).then(emit); };

    /* ----- prezzi di un mazzo ----- */
    /* Le carte da conoscere per valutare un mazzo: niente terre base e niente carte inventate nel Designer. */
    self.pricedCards = function (deck, isBasic) {
      return (deck.cards || []).filter(function (c) { return !(isBasic && isBasic(c.name)) && !c.design; });
    };
    self.valueDeck = function (deck, isBasic) {
      var cards = self.pricedCards(deck, isBasic), out = [], total = 0, cheapTotal = 0, qty = 0, priced = 0, missing = [], cheapComplete = true, pending = 0;
      var skipped = { basic: 0, design: 0 };
      (deck.cards || []).forEach(function (c) { if (isBasic && isBasic(c.name)) skipped.basic += c.qty; else if (c.design) skipped.design += c.qty; });
      cards.forEach(function (c) {
        var rec = c.set ? self.rec(c.name, c.set, c.cn) : self.rec(c.name, '', '') || self.any(c.name);
        var unit = unitPrice(rec), ch = self.cheapest(c.name), cu = ch ? unitPrice(ch) : null;
        var cheapUnit = cu != null && (unit == null || cu < unit) ? cu : unit;
        var neg = recs[key(c.name, c.set, c.cn)], gone = neg && neg.x;
        qty += c.qty;
        if (!rec && !gone) pending += c.qty;
        if (unit != null) { priced += c.qty; total += unit * c.qty; } else if (rec || gone) missing.push(c.name);
        if (cheapUnit != null) cheapTotal += cheapUnit * c.qty;
        if (!self.hasCheapest(c.name) && unit != null) cheapComplete = false;
        out.push({
          name: c.name, qty: c.qty, set: c.set || '', cn: c.cn || '', unit: unit, line: unit != null ? unit * c.qty : null,
          cheapUnit: cheapUnit, cheapSet: ch && cu != null && (unit == null || cu < unit) ? ch.s : '', cheapCn: ch && cu != null && (unit == null || cu < unit) ? ch.cn : '',
          save: unit != null && cheapUnit != null ? Math.max(0, (unit - cheapUnit) * c.qty) : 0
        });
      });
      return { total: total, cheapTotal: cheapTotal, cards: out, qty: qty, priced: priced, missing: missing, pending: pending, skipped: skipped,
        cheapComplete: cheapComplete && cards.length > 0 && pending === 0, ready: pending === 0 };
    };

    return self;
  }

  /* 1234.5 -> «1.234,50 €» */
  function eur(x) {
    if (x == null || isNaN(x)) return '—';
    try { return Number(x).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }
    catch (e) { return Number(x).toFixed(2).replace('.', ',') + ' €'; }
  }

  return { create: create, compact: compact, unitPrice: unitPrice, eur: eur, memoryStorage: memoryStorage, idbStorage: idbStorage, PRICE_TTL: PRICE_TTL };
});
