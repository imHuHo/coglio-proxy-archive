/* Coglio Proxy Builder - risoluzione delle carte e caricamento delle immagini (Scryfall).
 * Nessun accesso al DOM salvo le funzioni per i file caricati (solo nel browser). `fetch` e le pause sono iniettabili: cosi' si prova in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPAProxy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var API = 'https://api.scryfall.com';
  var BORDERS = { black: '#000000', white: '#ffffff', borderless: '#000000', silver: '#c9ccd1', gold: '#c8a951' };

  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }

  /* Facce stampabili di una carta di Scryfall: una sola, oppure fronte e retro per le carte a doppia faccia. */
  function faces(card, quality) {
    var q = quality || 'large', u = card && card.image_uris, fs = (card && card.card_faces) || [], out = [];
    if (!card || card.image_status === 'missing') return out;
    if (u && u[q]) return [{ name: card.name, url: u[q] }];
    fs.forEach(function (f) { if (f.image_uris && f.image_uris[q]) out.push({ name: f.name || card.name, url: f.image_uris[q] }); });
    return out.slice(0, 2);
  }
  function tokenParts(card) {
    return ((card && card.all_parts) || []).filter(function (p) { return p.component === 'token' && p.uri; });
  }
  function borderOf(card) { return BORDERS[card && card.border_color] || '#000000'; }

  function create(env) {
    env = env || {};
    var doFetch = env.fetch || (typeof fetch === 'function' ? function (u, i) { return fetch(u, i); } : null);
    var imgFetch = env.imageFetch || doFetch;
    var keyOf = env.keyOf || lc;
    var wait = env.wait || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var gap = env.gap != null ? env.gap : 110;
    var gate = Promise.resolve(), coolUntil = 0, noCollection = false, imgCache = {};
    var self = {};

    function gated(fn) { var p = gate.then(fn); gate = p.then(function () { return wait(gap); }, function () { return wait(gap); }); return p; }
    function check(r) {
      if (r.status === 429) { coolUntil = Date.now() + 60000; var e429 = new Error('Scryfall chiede una pausa (429)'); e429.status = 429; throw e429; }
      if (r.status === 404) return null;
      if (!r.ok) { var e = new Error('http ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }
    function waitCool() { var w = coolUntil - Date.now(); return w > 0 ? wait(w + 50) : Promise.resolve(); }
    function post(ids) {
      return waitCool().then(function () {
        return gated(function () { return doFetch(API + '/cards/collection', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiers: ids }) }); });
      }).then(check);
    }
    function getJson(urlOrPath) {
      var u = urlOrPath.indexOf('http') === 0 ? urlOrPath : API + urlOrPath;
      return waitCool().then(function () { return gated(function () { return doFetch(u, { headers: { Accept: 'application/json' } }); }); }).then(check);
    }

    function nameIs(card, name) {
      var k = keyOf(name);
      if (keyOf(card.name || '') === k) return true;
      return (card.card_faces || []).some(function (f) { return keyOf(f.name || '') === k; });
    }
    function matches(card, r) {
      if (r.set && r.cn) return card.set === lc(r.set) && lc(card.collector_number) === lc(r.cn) && nameIs(card, r.name);
      if (r.set) return card.set === lc(r.set) && nameIs(card, r.name);
      return nameIs(card, r.name);
    }
    function ident(r) {
      if (r.set && r.cn) return { set: lc(r.set), collector_number: String(r.cn) };
      if (r.set) return { name: r.name, set: lc(r.set) };
      return { name: r.name };
    }
    function variants(r) {
      var v = [];
      if (r.set && r.cn) v.push({ k: r.k, name: r.name, set: r.set, cn: r.cn });
      if (r.set) v.push({ k: r.k, name: r.name, set: r.set, cn: '' });
      v.push({ k: r.k, name: r.name, set: '', cn: '' });
      return v;
    }
    function collect(recs, found) {
      var chunks = [];
      for (var i = 0; i < recs.length; i += 75) chunks.push(recs.slice(i, i + 75));
      return chunks.reduce(function (p, chunk) {
        return p.then(function () {
          return post(chunk.map(ident)).then(function (res) {
            ((res && res.data) || []).forEach(function (card) {
              chunk.forEach(function (r) { if (!found[r.k] && matches(card, r)) found[r.k] = card; });
            });
          });
        });
      }, Promise.resolve());
    }
    function stages(recs, found, i) {
      if (i > 2) return Promise.resolve();
      var vs = recs.filter(function (r) { return !found[r.k]; }).map(function (r) { return variants(r)[i]; }).filter(Boolean);
      return (vs.length ? collect(vs, found) : Promise.resolve()).then(function () { return stages(recs, found, i + 1); });
    }
    function single(r) {
      var enc = encodeURIComponent, seq = [];
      if (r.set && r.cn) seq.push('/cards/' + enc(lc(r.set)) + '/' + enc(r.cn));
      if (r.set) seq.push('/cards/named?exact=' + enc(r.name) + '&set=' + enc(lc(r.set)));
      seq.push('/cards/named?exact=' + enc(r.name));
      seq.push('/cards/named?fuzzy=' + enc(r.name));
      return seq.reduce(function (p, path, i) {
        return p.then(function (card) {
          if (card) return card;
          return getJson(path).then(function (c) { return c && (i === seq.length - 1 || nameIs(c, r.name)) ? c : null; });
        });
      }, Promise.resolve(null));
    }
    function singles(recs, found) {
      return recs.reduce(function (p, r) {
        return p.then(function () { return single(r).then(function (c) { if (c) found[r.k] = c; }); });
      }, Promise.resolve());
    }

    /* entries: [{name,set,cn}] -> {key: carta Scryfall}. Le non trovate non compaiono. */
    self.keyFor = function (e) {
      var set = lc(e.set);
      return keyOf(e.name) + '|' + set + '|' + (set ? lc(e.cn) : '');
    };
    self.resolve = function (entries, progress) {
      var recs = [], seen = {}, found = {};
      entries.forEach(function (e) {
        var k = self.keyFor(e);
        if (!seen[k]) { seen[k] = 1; recs.push({ k: k, name: e.name, set: e.set || '', cn: e.set ? (e.cn || '') : '' }); }
      });
      var p = noCollection ? singles(recs, found) : stages(recs, found, 0).catch(function (err) {
        if (err && err.status) throw err;
        noCollection = true; return singles(recs.filter(function (r) { return !found[r.k]; }), found);
      });
      return p.then(function () {
        var rest = recs.filter(function (r) { return !found[r.k]; });
        if (progress) progress({ phase: 'cards', found: Object.keys(found).length, total: recs.length });
        return singles(rest.slice(0, 40), found);
      }).then(function () { if (progress) progress({ phase: 'cards', found: Object.keys(found).length, total: recs.length }); return found; });
    };
    self.fetchCard = function (uri) { return getJson(uri); };

    /* Stampe disponibili di una carta (per scegliere un'altra illustrazione). */
    self.printings = function (name) {
      return getJson('/cards/search?q=' + encodeURIComponent('!"' + String(name).replace(/"/g, '') + '"') + '&unique=prints&order=released&dir=desc').then(function (res) {
        return ((res && res.data) || []).filter(function (c) { return faces(c).length; }).map(function (c) {
          return { set: c.set, setName: c.set_name, cn: c.collector_number, released: c.released_at, card: c };
        });
      });
    };

    /* ----- immagini ----- */
    self.loadImage = function (url, parse) {
      if (imgCache[url]) return imgCache[url];
      var p = imgFetch(url).then(function (r) {
        if (!r.ok) throw new Error('immagine http ' + r.status);
        return r.arrayBuffer();
      }).then(function (buf) { return parse(new Uint8Array(buf)); });
      imgCache[url] = p;
      p.catch(function () { delete imgCache[url]; });
      return p;
    };
    self.clearImages = function () { imgCache = {}; };

    function pool(tasks, n, step) {
      var i = 0, active = 0, done = 0;
      return new Promise(function (resolve) {
        if (!tasks.length) return resolve();
        function next() {
          while (active < n && i < tasks.length) {
            active++;
            tasks[i++]().then(function () {}, function () {}).then(function () {
              active--; done++; if (step) step(done, tasks.length);
              if (done === tasks.length) resolve(); else next();
            });
          }
        }
        next();
      });
    }

    /* entries: [{name,qty,set,cn, card?, front?, back?, token?}] -> {items (per il motore PDF), report}.
       "front"/"back" gia' pronti (file propri) hanno la precedenza; "card" gia' risolta evita la ricerca. */
    self.prepare = function (entries, opt, progress) {
      opt = opt || {};
      var parse = opt.parse, quality = opt.quality || 'large', report = { missing: [], substituted: [], tokens: 0, failed: [] };
      var need = entries.filter(function (e) { return !e.card && !e.front && !e.nf; });
      return self.resolve(need, progress).then(function (found) {
        entries.forEach(function (e) { if (!e.card && !e.front && !e.nf) e.card = found[self.keyFor(e)] || null; });
        if (!opt.tokens) return [];
        var wanted = {}, list = [];
        entries.forEach(function (e) { tokenParts(e.card).forEach(function (t) { if (!wanted[t.id]) { wanted[t.id] = 1; list.push(t); } }); });
        var out = [];
        return list.reduce(function (p, t) {
          return p.then(function () {
            if (entries.some(function (e) { return e.card && e.card.id === t.id; })) return;
            return self.fetchCard(t.uri).then(function (c) { if (c && faces(c, quality).length) out.push({ name: c.name, qty: 1, set: c.set, cn: c.collector_number, card: c, token: true }); }).catch(function () {});
          });
        }, Promise.resolve()).then(function () { return out; });
      }).then(function (tokens) {
        report.tokens = tokens.length;
        var all = entries.concat(tokens), urls = {}, tasks = [];
        all.forEach(function (e) { if (!e.front) faces(e.card, quality).forEach(function (f) { urls[f.url] = 1; }); });
        var keys = Object.keys(urls), loaded = {};
        keys.forEach(function (u) {
          tasks.push(function () {
            return self.loadImage(u, parse).then(function (img) { loaded[u] = img; }, function () { report.failed.push(u); });
          });
        });
        return pool(tasks, opt.concurrency || 4, function (d, t) { if (progress) progress({ phase: 'images', done: d, total: t }); }).then(function () {
          var items = all.map(function (e) {
            if (e.front) return { name: e.name, qty: e.qty, set: e.set, cn: e.cn, front: e.front, back: e.back || null, backName: e.backName };
            var fs = e.card ? faces(e.card, quality) : [], f0 = fs[0] && loaded[fs[0].url], f1 = fs[1] && loaded[fs[1].url];
            if (!e.card) report.missing.push(e.name);
            else if (!f0) report.missing.push(e.name);
            else if (e.set && (e.card.set !== lc(e.set) || (e.cn && lc(e.card.collector_number) !== lc(e.cn)))) report.substituted.push({ name: e.name, asked: e.set.toUpperCase() + (e.cn ? ' ' + e.cn : ''), got: e.card.set.toUpperCase() + ' ' + e.card.collector_number });
            if (f0) f0.border = borderOf(e.card);
            if (f1) f1.border = borderOf(e.card);
            return {
              name: e.name, qty: e.qty, set: e.card ? e.card.set : e.set, cn: e.card ? e.card.collector_number : e.cn,
              front: f0 || null, back: f1 || null, backName: fs[1] ? fs[1].name : ''
            };
          });
          return { items: items, report: report };
        });
      });
    };
    return self;
  }

  /* ----- file propri (solo nel browser) ----- */
  function sampleBorder(canvasCtx, w, h) {
    var ins = Math.max(2, Math.round(Math.min(w, h) * 0.01)), r = 0, g = 0, b = 0, n = 0, i;
    function px(x, y) { var d = canvasCtx.getImageData(Math.max(0, Math.min(w - 1, x)), Math.max(0, Math.min(h - 1, y)), 1, 1).data; r += d[0]; g += d[1]; b += d[2]; n++; }
    for (i = 1; i < 12; i++) {
      var fx = Math.round(w * i / 12), fy = Math.round(h * i / 12);
      px(fx, ins); px(fx, h - 1 - ins); px(ins, fy); px(w - 1 - ins, fy);
    }
    function hx(v) { return ('0' + Math.round(v / n).toString(16)).slice(-2); }
    return '#' + hx(r) + hx(g) + hx(b);
  }
  /* File scelto dall'utente -> immagine pronta per il motore PDF (JPEG diretto, altrimenti ricodificato ad alta qualita'). */
  function fromFile(file, parseJpeg) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
          var ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0);
          var border = sampleBorder(ctx, c.width, c.height);
          var done = function (bytes) {
            URL.revokeObjectURL(url);
            try { var img = parseJpeg(bytes); img.border = border; img.cornerPatch = false; img.custom = true; resolve(img); } catch (e) { reject(e); }
          };
          var isJpeg = /jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name || '');
          if (isJpeg) { file.arrayBuffer().then(function (b) { var u8 = new Uint8Array(b); try { parseJpeg(u8); done(u8); } catch (e) { c.toBlob(function (bl) { bl.arrayBuffer().then(function (bb) { done(new Uint8Array(bb)); }); }, 'image/jpeg', 0.95); } }); }
          else c.toBlob(function (bl) { if (!bl) { URL.revokeObjectURL(url); reject(new Error('conversione non riuscita')); return; } bl.arrayBuffer().then(function (bb) { done(new Uint8Array(bb)); }); }, 'image/jpeg', 0.95);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('file non leggibile come immagine')); };
      im.src = url;
    });
  }


  /* ----- ZIP senza compressione (le immagini sono gia' JPEG) ----- */
  var CRC = null;
  function crc32(u8) {
    if (!CRC) { CRC = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) crc = CRC[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s);
    var e = unescape(encodeURIComponent(s)), u = new Uint8Array(e.length);
    for (var i = 0; i < e.length; i++) u[i] = e.charCodeAt(i);
    return u;
  }
  function zip(files) {
    var parts = [], central = [], off = 0, d = new Date();
    var dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    var dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    function w16(a, v) { a.push(v & 255, (v >> 8) & 255); }
    function w32(a, v) { a.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); }
    files.forEach(function (f) {
      var name = utf8(f.name), crc = crc32(f.bytes), h = [], c = [];
      w32(h, 0x04034b50); w16(h, 20); w16(h, 0x0800); w16(h, 0); w16(h, dt); w16(h, dd); w32(h, crc); w32(h, f.bytes.length); w32(h, f.bytes.length); w16(h, name.length); w16(h, 0);
      parts.push(new Uint8Array(h), name, f.bytes);
      w32(c, 0x02014b50); w16(c, 20); w16(c, 20); w16(c, 0x0800); w16(c, 0); w16(c, dt); w16(c, dd); w32(c, crc); w32(c, f.bytes.length); w32(c, f.bytes.length);
      w16(c, name.length); w16(c, 0); w16(c, 0); w16(c, 0); w16(c, 0); w32(c, 0); w32(c, off);
      central.push(new Uint8Array(c), name);
      off += h.length + name.length + f.bytes.length;
    });
    var csize = 0; central.forEach(function (x) { csize += x.length; });
    var e = []; w32(e, 0x06054b50); w16(e, 0); w16(e, 0); w16(e, files.length); w16(e, files.length); w32(e, csize); w32(e, off); w16(e, 0);
    var all = parts.concat(central, [new Uint8Array(e)]), len = 0, p = 0;
    all.forEach(function (x) { len += x.length; });
    var out = new Uint8Array(len);
    all.forEach(function (x) { out.set(x, p); p += x.length; });
    return out;
  }

  return { create: create, zip: zip, crc32: crc32, faces: faces, tokenParts: tokenParts, borderOf: borderOf, fromFile: fromFile, sampleBorder: sampleBorder, API: API };
});
