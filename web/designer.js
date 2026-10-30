/* Coglio Proxy Designer - schermata per creare proxy personalizzate.
 * Usa il motore di rendering (cardrender.js) e le funzioni che app.js mette in window.CPAHost.
 * I design stanno in un database a parte (IndexedDB «coglio-designer»): metadati, immagini d'arte e cornici importate. */
(function () {
  'use strict';
  var H = window.CPAHost, R = window.CPACard;
  if (!H || !R) return;
  var esc = H.esc, W = R.W, HH = R.H;

  /* ---------- database ---------- */
  var DB = (function () {
    var mem = { designs: {}, art: {}, frames: {} }, db = null, persistent = false, opening = null;
    function open() {
      if (opening) return opening;
      opening = new Promise(function (res) {
        if (!window.indexedDB || (window.claude && typeof window.claude.use === 'function')) return res(null);
        try {
          var r = indexedDB.open('coglio-designer', 1);
          r.onupgradeneeded = function () { var d = r.result; d.createObjectStore('designs', { keyPath: 'id' }); d.createObjectStore('art'); d.createObjectStore('frames', { keyPath: 'id' }); };
          r.onsuccess = function () { db = r.result; persistent = true; res(db); };
          r.onerror = r.onblocked = function () { res(null); };
        } catch (e) { res(null); }
      });
      return opening;
    }
    function tx(store, mode, fn) {
      return open().then(function (d) {
        if (!d) return null;
        return new Promise(function (res, rej) { var t = d.transaction(store, mode), r = fn(t.objectStore(store)); t.oncomplete = function () { res(r && r.result); }; t.onerror = t.onabort = function () { rej(t.error); }; });
      });
    }
    function all(store) { return tx(store, 'readonly', function (s) { return s.getAll(); }).then(function (a) { return a || Object.keys(mem[store]).map(function (k) { return mem[store][k]; }); }); }
    function put(store, obj, key) {
      mem[store][key || obj.id] = obj;
      return tx(store, 'readwrite', function (s) { return key ? s.put(obj, key) : s.put(obj); });
    }
    function get(store, key) { return tx(store, 'readonly', function (s) { return s.get(key); }).then(function (v) { return v === null ? mem[store][key] : v; }); }
    function del(store, key) { delete mem[store][key]; return tx(store, 'readwrite', function (s) { return s.delete(key); }); }
    return { open: open, all: all, put: put, get: get, del: del, persistent: function () { return persistent; } };
  })();

  /* ---------- stato ---------- */
  var dz = { loaded: false, loading: null, designs: [], frames: [], res: [], view: 'list', cur: null, artImg: null, frameImgs: {}, search: { q: '', busy: false, msg: '' }, focus: 'name',
    bind: null, picker: null, confirm: '', msg: '' };
  var artCache = {}, thumbTimer = null, drawTimer = null, saveTimer = null;

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    if (dz.loaded) return Promise.resolve();
    if (dz.loading) return dz.loading;
    dz.loading = Promise.all([DB.all('designs'), DB.all('frames')]).then(function (r) {
      dz.designs = (r[0] || []).map(norm).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      var all = (r[1] || []).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
      dz.frames = all.filter(function (f) { return !f.kind || f.kind === 'frame'; });
      dz.res = all.filter(function (f) { return f.kind === 'font' || f.kind === 'symbols' || f.kind === 'watermarks' || f.kind === 'overlays'; });
      var marker = all.filter(function (f) { return f.id === 'bundle-marker'; })[0];
      return initResources().then(function () { return syncBundle(marker); }).then(function () { dz.loaded = true; dz.loading = null; });
    }, function () { dz.loaded = true; dz.loading = null; });
    return dz.loading;
  }
  /* risorse incluse nell'app (risorse.json: cornici, simboli, font): si caricano una volta per versione, in silenzio */
  var BUNDLE_VER = 'mse-3';
  function bundleBlob() {
    if (typeof window.CPA_BUNDLE === 'string') return Promise.resolve(new Blob([window.CPA_BUNDLE], { type: 'application/json' }));
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch('risorse.json').then(function (r) { return r.ok ? r.blob() : null; }).catch(function () { return null; });
  }
  function syncBundle(marker) {
    if (marker && marker.ver === BUNDLE_VER) return Promise.resolve();
    return bundleBlob().then(function (b) {
      if (!b || !b.size) return null;
      b.name = 'risorse.json';
      return importPack(b, true).then(function (g) {
        if (!g) return null;
        dz.frameImgs = {};
        return DB.put('frames', { id: 'bundle-marker', kind: 'marker', ver: BUNDLE_VER, createdAt: Date.now() });
      });
    }).catch(function () { return null; });
  }
  /* font e simboli di mana importati dall'utente: si registrano nel browser e nel motore di rendering */
  function initResources() {
    var fonts = {}, syms = {}, wms = {}, ovs = {}, jobs = [];
    dz.res.forEach(function (rec) {
      if (rec.kind === 'font' && rec.blob && window.FontFace && document.fonts) {
        jobs.push(rec.blob.arrayBuffer().then(function (buf) {
          var ff = new FontFace(rec.family, buf, { style: rec.style === 'italic' ? 'italic' : 'normal', weight: '100 900' });
          return ff.load().then(function () { document.fonts.add(ff); if (rec.role === 'title') fonts.title = true; if (rec.role === 'body' || rec.role === 'bodyItalic') fonts.body = true; });
        }).catch(function () { return null; }));
      } else if (rec.kind === 'overlays' && rec.map) {
        Object.keys(rec.map).forEach(function (k) {
          jobs.push(blobImage(rec.map[k]).then(function (r) { var m = rec.meta[k] || {}; ovs[k] = { img: r.img, b: m.b || [0, 0, 745, 1040], erase: m.erase || null }; }).catch(function () { return null; }));
        });
      } else if (rec.kind === 'watermarks' && rec.map) {
        Object.keys(rec.map).forEach(function (k) {
          jobs.push(blobImage(rec.map[k]).then(function (r) { wms[k] = r.img; }).catch(function () { return null; }));
        });
      } else if (rec.kind === 'symbols' && rec.map) {
        Object.keys(rec.map).forEach(function (k) {
          jobs.push(blobImage(rec.map[k]).then(function (r) { syms[k] = r.img; }).catch(function () { return null; }));
        });
      }
    });
    return Promise.all(jobs).then(function () { R.setResources({ fonts: fonts, symbols: syms, watermarks: wms, overlays: ovs }); });
  }
  function norm(d) {
    var b = R.defaults(d && d.kind === 'token' ? 'token' : 'card'), o = {};
    Object.keys(b).forEach(function (k) { o[k] = d && d[k] != null ? d[k] : b[k]; });
    o.art = { id: String(d && d.art && d.art.id || ''), x: +(d && d.art && d.art.x) || 0, y: +(d && d.art && d.art.y) || 0, s: +(d && d.art && d.art.s) || 1 };
    o.id = String(o.id || uid('z'));
    ['name', 'cost', 'type', 'rules', 'flavor', 'pt', 'set', 'num', 'artist', 'colors', 'alterOf'].forEach(function (k) { o[k] = String(o[k] == null ? '' : o[k]); });
    if (!R.LAYOUT[o.frame]) o.frame = 'classic';
    if (['black', 'white', 'silver', 'gold'].indexOf(o.border) < 0) o.border = 'black';
    if (['round', 'square'].indexOf(o.corners) < 0) o.corners = 'round';
    if (!R.RARITY[o.rarity]) o.rarity = 'common';
    o.ink = o.ink === 'light' ? 'light' : 'dark';
    o.frameImg = String(o.frameImg || ''); o.watermark = String(o.watermark || '');
    ['crown', 'inner', 'holo', 'darkpt', 'pips', 'list'].forEach(function (k) { o[k] = String(o[k] || ''); });
    return o;
  }
  function byId(id) { return dz.designs.filter(function (d) { return d.id === id; })[0] || null; }
  function saveNow() {
    if (!dz.cur) return Promise.resolve();
    var d = dz.cur; d.updatedAt = Date.now();
    if (!byId(d.id)) dz.designs.unshift(d);
    return DB.put('designs', clone(d)).catch(function () { H.toast('Non riesco a salvare il design su questo dispositivo.'); });
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350); }

  /* ---------- immagini (arte e cornici) ---------- */
  function blobImage(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { res({ img: im, url: url }); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('immagine non leggibile')); };
      im.src = url;
    });
  }
  function artImage(id) {
    if (!id) return Promise.resolve(null);
    if (!artCache[id]) artCache[id] = DB.get('art', id).then(function (b) { return b ? blobImage(b).then(function (r) { return r.img; }) : null; }).catch(function () { return null; });
    return artCache[id];
  }
  /* d.frameImg può essere l'id di una cornice, oppure «auto:<pacchetto>»: sceglie la cornice del pacchetto in base ai colori della carta */
  function fid(d) {
    var v = d && d.frameImg; if (!v) return '';
    var m = /^auto:(.+)$/.exec(v); if (!m) return v;
    var pk = R.paletteKey(d), list = dz.frames.filter(function (f) { return f.group === m[1]; });
    var f = list.filter(function (x) { return x.key === pk; })[0] || list.filter(function (x) { return x.key === 'C'; })[0] || list[0];
    return f ? f.id : '';
  }
  function frameAssets(id) {
    if (!id) return Promise.resolve(null);
    if (!dz.frameImgs[id]) dz.frameImgs[id] = DB.get('frames', id).then(function (f) {
      if (!f || !f.blob) return null;
      return Promise.all([blobImage(f.blob), f.ptBlob ? blobImage(f.ptBlob) : null]).then(function (r) { return { frameImg: r[0].img, ptImg: r[1] ? r[1].img : null, frameGeo: f.geo || null }; });
    }).catch(function () { return null; });
    return dz.frameImgs[id];
  }
  /* ridimensiona (lato lungo max) e converte in JPEG: l'arte occupa meno spazio e il PDF resta leggero */
  function shrink(fileOrBlob, max) {
    return blobImage(fileOrBlob).then(function (r) {
      var im = r.img, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
      var x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(r.url);
      return new Promise(function (res, rej) { c.toBlob(function (b) { if (b) res(b); else rej(new Error('conversione non riuscita')); }, 'image/jpeg', 0.9); });
    });
  }
  function setArt(blob) {
    var d = dz.cur; if (!d) return Promise.resolve();
    return shrink(blob, 1800).then(function (jb) {
      var old = d.art.id, id = uid('a');
      return DB.put('art', jb, id).then(function () {
        d.art = { id: id, x: 0, y: 0, s: 1 }; artCache[id] = DB.get('art', id).then(function (b) { return b ? blobImage(b).then(function (r) { return r.img; }) : null; });
        if (old) { delete artCache[old]; DB.del('art', old); }
        return artCache[id].then(function (im) { dz.artImg = im; saveNow(); H.render(); });
      });
    }).catch(function (e) { H.toast('Immagine non caricata: ' + (e && e.message ? e.message : 'file non valido') + '.'); });
  }

  /* ---------- disegno ---------- */
  var fontsP = null;
  function fonts() {
    if (!fontsP) {
      var f = document.fonts;
      fontsP = !f || !f.load ? Promise.resolve() : Promise.race([
        Promise.all(['700 24px Cinzel', '600 24px Cinzel', '400 24px "EB Garamond"', 'italic 400 24px "EB Garamond"', '700 24px "EB Garamond"', '600 24px Manrope'].map(function (x) { return f.load(x).catch(function () { return null; }); })),
        new Promise(function (r) { setTimeout(r, 4000); })]);
    }
    return fontsP;
  }
  function drawInto(ctx, d, art, fa, opt) { R.render(ctx, d, { art: art, frameImg: fa ? fa.frameImg : null, ptImg: fa ? fa.ptImg : null, frameGeo: fa ? fa.frameGeo : null }, opt); }
  function renderBlob(designId, opt) {
    opt = opt || {};
    return load().then(function () {
      var d = byId(designId); if (!d) throw new Error('design non trovato');
      return Promise.all([artImage(d.art.id), frameAssets(fid(d)), fonts()]).then(function (a) {
        var c = document.createElement('canvas'), sc = opt.scale || 1; c.width = Math.round(W * sc); c.height = Math.round(HH * sc);
        var ctx = c.getContext('2d'); if (sc !== 1) ctx.scale(sc, sc);
        drawInto(ctx, d, a[0], a[1], { square: !!opt.square });
        return new Promise(function (res, rej) { c.toBlob(function (b) { if (b) res(b); else rej(new Error('render non riuscito')); }, opt.type || 'image/jpeg', opt.quality || 0.95); });
      });
    });
  }
  function drawPreview() {
    var cv = document.getElementById('dz-cv'), d = dz.cur;
    if (!cv || !d) return;
    var ctx = cv.getContext('2d');
    frameAssets(fid(d)).then(function (fa) { if (dz.cur !== d) return; try { drawInto(cv.getContext('2d'), d, dz.artImg, fa, {}); } catch (e) { /* ignorato */ } });
  }
  function schedulePreview() { if (drawTimer) return; drawTimer = setTimeout(function () { drawTimer = null; drawPreview(); }, 24); }
  function drawThumbs() {
    [].slice.call(document.querySelectorAll('canvas.dz-th')).forEach(function (cv) {
      var d = byId(cv.getAttribute('data-id')); if (!d) return;
      Promise.all([artImage(d.art.id), frameAssets(fid(d)), fonts()]).then(function (a) {
        if (!cv.isConnected) return;
        var ctx = cv.getContext('2d'); ctx.save(); ctx.scale(cv.width / W, cv.height / HH);
        try { drawInto(ctx, d, a[0], a[1], {}); } catch (e) { /* ignorato */ }
        ctx.restore();
      });
    });
  }

  /* ---------- schermata ---------- */
  function open() { H.ui.view = 'designer'; dz.view = 'list'; dz.cur = null; dz.picker = null; window.scrollTo(0, 0); load().then(function () { H.render(); }); H.render(); }
  function editDesign(d) {
    dz.cur = d; dz.view = 'edit'; dz.artImg = null; dz.confirm = ''; dz.search = { q: d.alterOf || '', busy: false, msg: '' };
    artImage(d.art.id).then(function (a) { if (dz.cur === d) { dz.artImg = a; schedulePreview(); } });
    window.scrollTo(0, 0); H.render();
  }
  function create(kind) {
    var d = norm(R.defaults(kind === 'token' ? 'token' : 'card')); d.id = uid('z'); d.kind = kind || 'card'; d.createdAt = Date.now(); d.updatedAt = d.createdAt;
    if (kind === 'alter') { d.name = 'Alter'; d.rules = ''; d.cost = ''; d.type = ''; d.pt = ''; }
    dz.designs.unshift(d); saveNow(); editDesign(d);
  }
  function usesPT(d) { var L = R.LAYOUT[d.frame]; return !!(L && L.pt); }

  var SYMS = ['{T}', '{W}', '{U}', '{B}', '{R}', '{G}', '{C}', '{X}', '{1}', '{2}', '{3}', '{W/U}', '{2/W}', '{G/P}'];
  function chip(a, k, v, label, on, extra) { return '<button class="chip" data-a="' + a + '" data-k="' + k + '" data-v="' + esc(v) + '" aria-pressed="' + !!on + '"' + (extra || '') + '>' + label + '</button>'; }
  function lbl(t, inner, cls) { return '<label class="lbl ' + (cls || '') + '">' + t + inner + '</label>'; }
  function inp(k, v, ph, type) { return '<input class="input" data-c="dz-f" data-k="' + k + '" value="' + esc(v) + '" placeholder="' + esc(ph || '') + '" autocomplete="off"' + (type ? ' type="' + type + '"' : '') + '>'; }
  function sel(k, v, opts) { return '<select class="select" data-c="dz-f" data-k="' + k + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function rng(k, v, min, max, step) { return '<input class="dz-range" type="range" data-c="dz-art" data-k="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '">'; }

  function wmOptions() {
    var rec = dz.res.filter(function (x) { return x.kind === 'watermarks'; })[0];
    if (!rec || !rec.names) return null;
    return [['', 'Nessuna']].concat(Object.keys(rec.names).map(function (k) { return [k, rec.names[k]]; }));
  }
  function frameOptions(d) {
    var groups = {}, h = '';
    dz.frames.forEach(function (f) { if (f.group) groups[f.group] = f.groupName || f.group; });
    Object.keys(groups).forEach(function (g) { h += '<option value="auto:' + esc(g) + '"' + (d.frameImg === 'auto:' + g ? ' selected' : '') + '>' + esc(groups[g]) + ' \u2014 automatica (segue i colori)</option>'; });
    return h + dz.frames.map(function (f) { return '<option value="' + esc(f.id) + '"' + (d.frameImg === f.id ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('');
  }
  /* pacchetto di cornici (.json): { app: 'coglio-frames', groups: [{id,name}], frames: [{key,name,group,ink,geo,png,pt}] } */
  function importPack(file, silent) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onerror = function () { res(null); };
      r.onload = function () {
        var data; try { data = JSON.parse(String(r.result)); } catch (e) { data = null; }
        if (data && data.app === 'coglio-frames' && !Array.isArray(data.frames)) data.frames = [];
        if (!data || data.app !== 'coglio-frames') { if (!silent) H.toast('«' + file.name + '»: non è un pacchetto di cornici di Coglio.'); return res(null); }
        var names = {}; (data.groups || []).forEach(function (g) { names[g.id] = g.name; });
        var chain = Promise.resolve(), n = 0, first = '';
        data.frames.forEach(function (f) {
          var blob = dataUrlToBlob(f.png); if (!blob) return;
          chain = chain.then(function () {
            var grp = String(f.group || 'pack'), key = String(f.key || '');
            var old = dz.frames.filter(function (x) { return x.group === grp && x.key === key; })[0];
            var rec = { id: old ? old.id : uid('f'), name: String(f.name || 'Cornice'), group: grp, groupName: names[grp] || grp, key: key, ink: f.ink === 'light' ? 'light' : 'dark', geo: f.geo || null, blob: blob, ptBlob: dataUrlToBlob(f.pt) || null, createdAt: Date.now() };
            if (old) { dz.frames = dz.frames.filter(function (x) { return x !== old; }); delete dz.frameImgs[old.id]; }
            dz.frames.push(rec); n++; if (!first) first = grp;
            return DB.put('frames', rec);
          });
        });
        var nsym = 0, nfont = 0, nwm = 0, nov = 0;
        if (Array.isArray(data.overlays) && data.overlays.length) {
          chain = chain.then(function () {
            var map = {}, meta = {};
            data.overlays.forEach(function (o) { var b = dataUrlToBlob(o && o.png); if (b && o.key && Array.isArray(o.b)) { map[String(o.key)] = b; meta[String(o.key)] = { b: o.b.map(Number), erase: Array.isArray(o.erase) ? o.erase.map(Number) : null }; nov++; } });
            if (!nov) return null;
            var rec = { id: 'res-overlays', kind: 'overlays', map: map, meta: meta, createdAt: Date.now() };
            dz.res = dz.res.filter(function (x) { return x.id !== rec.id; }); dz.res.push(rec); return DB.put('frames', rec);
          });
        }
        if (Array.isArray(data.watermarks) && data.watermarks.length) {
          chain = chain.then(function () {
            var map = {}, nm = {};
            data.watermarks.forEach(function (w) { var b = dataUrlToBlob(w && w.png); if (b && w.key) { map[String(w.key)] = b; nm[String(w.key)] = String(w.name || w.key); nwm++; } });
            if (!nwm) return null;
            var rec = { id: 'res-watermarks', kind: 'watermarks', map: map, names: nm, createdAt: Date.now() };
            dz.res = dz.res.filter(function (x) { return x.id !== rec.id; }); dz.res.push(rec); return DB.put('frames', rec);
          });
        }
        if (data.symbols && typeof data.symbols === 'object') {
          chain = chain.then(function () {
            var map = {}; Object.keys(data.symbols).forEach(function (k) { var b = dataUrlToBlob(data.symbols[k]); if (b) { map[String(k).toUpperCase()] = b; nsym++; } });
            if (!nsym) return null;
            var rec = { id: 'res-symbols', kind: 'symbols', map: map, createdAt: Date.now() };
            dz.res = dz.res.filter(function (x) { return x.id !== rec.id; }); dz.res.push(rec); return DB.put('frames', rec);
          });
        }
        (Array.isArray(data.fonts) ? data.fonts : []).forEach(function (f) {
          var b = dataUrlToBlob(f.ttf); if (!b) return;
          chain = chain.then(function () {
            var rec = { id: 'res-font-' + String(f.role || f.family), kind: 'font', role: String(f.role || ''), family: String(f.family || 'CPA Font'), style: f.style === 'italic' ? 'italic' : 'normal', blob: b, createdAt: Date.now() };
            dz.res = dz.res.filter(function (x) { return x.id !== rec.id; }); dz.res.push(rec); nfont++; return DB.put('frames', rec);
          });
        });
        chain.then(function () { return nsym || nfont || nwm || nov ? initResources() : null; }).then(function () {
          var parts = [];
          if (n) parts.push(n + (n === 1 ? ' cornice' : ' cornici'));
          if (nsym) parts.push(nsym + ' simboli di mana');
          if (nfont) parts.push(nfont + ' font');
          if (nwm) parts.push(nwm + ' filigrane');
          if (nov) parts.push(nov + ' extra (corone, stampi, pips…)');
          if (!silent) H.toast(parts.length ? 'Importati: ' + parts.join(', ') + '.' : 'Il pacchetto non contiene niente di utilizzabile.');
          res(n ? first : (nsym || nfont || nwm || nov ? '*' : null));
        }, function () { if (!silent) H.toast('Non riesco a salvare le risorse su questo dispositivo.'); res(null); });
      };
      r.readAsText(file);
    });
  }

  function listHtml() {
    var net = H.available();
    var h = '<header class="vh"><h1>Designer</h1><p class="sub">Crea proxy personalizzate: carte tue, token, alter di carte esistenti. Poi le leghi a un mazzo e le stampi nel PDF.</p></header>';
    if (!DB.persistent() && dz.loaded) h += '<p class="warn">Qui dentro i design non si salvano sul dispositivo: restano finché la pagina è aperta. Usa l’app per Windows, l’APK o la versione web.</p>';
    h += '<section class="panel"><div class="btns"><button class="btn primary" data-a="dz-new" data-k="card">Nuova carta</button><button class="btn" data-a="dz-new" data-k="token">Nuovo token</button>' +
      '<button class="btn" data-a="dz-new" data-k="alter">Alter di una carta</button></div>' +
      '<div class="btns"><label class="btn small filebtn">Importa design<input type="file" accept=".json,application/json" data-c="dz-import" hidden></label>' +
      (dz.designs.length ? '<button class="btn small" data-a="dz-export-all">Esporta tutti</button>' : '') + '</div>' +
      (dz.msg ? '<p class="hint" role="status">' + esc(dz.msg) + '</p>' : '') + '</section>';
    if (!dz.loaded) return h + '<p class="hint">Carico i design…</p>';
    if (!dz.designs.length) return h + '<div class="empty"><p>Nessun design ancora. Parti da una carta nuova, da un token o da un alter di una carta che esiste su Scryfall' + (net ? '' : ' (serve internet: qui non disponibile)') + '.</p></div>';
    h += '<div class="dz-grid">' + dz.designs.map(function (d) {
      var fr = R.FRAMES.filter(function (f) { return f.id === d.frame; })[0];
      var used = deckUse(d.id);
      return '<article class="dz-item"><button class="dz-thb" data-a="dz-open" data-id="' + esc(d.id) + '" aria-label="Apri ' + esc(d.name) + '"><canvas class="dz-th" data-id="' + esc(d.id) + '" width="186" height="260"></canvas></button>' +
        '<div class="dz-meta"><b>' + esc(d.name || 'Senza nome') + '</b><span>' + esc(fr ? fr.name : '') + (d.kind === 'alter' ? ' · alter' : d.kind === 'token' ? ' · token' : '') + '</span>' +
        (used ? '<span class="pill info">in ' + used + (used === 1 ? ' mazzo' : ' mazzi') + '</span>' : '') + '</div>' +
        '<div class="btns"><button class="btn small" data-a="dz-open" data-id="' + esc(d.id) + '">Modifica</button><button class="btn small" data-a="dz-dup" data-id="' + esc(d.id) + '">Duplica</button></div></article>';
    }).join('') + '</div>';
    return h;
  }
  function deckUse(id) {
    var n = 0; (H.decks() || []).forEach(function (dk) { if (dk.cards.some(function (c) { return c.design === id; })) n++; }); return n;
  }

  function editHtml() {
    var d = dz.cur; if (!d) return listHtml();
    var net = H.available(), L = R.LAYOUT[d.frame], pk = R.paletteKey(d), cs = String(d.colors || '').toUpperCase();
    var h = '<header class="vh"><button class="back" data-a="dz-back">← I miei design</button><h1>' + esc(d.name || 'Senza nome') + '</h1></header>';
    h += '<div class="dz-edit"><div class="dz-prev"><canvas id="dz-cv" width="' + W + '" height="' + HH + '" aria-label="Anteprima della carta"></canvas>' +
      '<p class="hint dz-tip">Sull’arte: trascina per spostare, rotella per ingrandire.</p>' +
      '<div class="btns"><button class="btn small primary" data-a="dz-png">Scarica PNG</button><button class="btn small" data-a="dz-jpg">Scarica JPG per stampa</button></div></div>';
    h += '<div class="dz-form">';
    /* alter */
    h += '<section class="panel"><h2 class="sect" style="margin:0">' + (d.kind === 'alter' ? 'Carta di partenza' : 'Parti da una carta esistente') + '</h2>' +
      '<div class="dz-srch"><input class="input" data-c="dz-q" placeholder="Nome della carta (es. Lightning Bolt)" value="' + esc(dz.search.q) + '" autocomplete="off"><button class="btn" data-a="dz-alter"' + (dz.search.busy || !net ? ' disabled' : '') + '>' + (dz.search.busy ? 'Cerco…' : 'Importa') + '</button></div>' +
      '<p class="hint">' + (net ? 'Prende testo, costo, tipo e arte da Scryfall: poi cambi quello che vuoi.' : 'Serve internet: non disponibile dentro Claude.') + '</p>' +
      (dz.search.msg ? '<p class="hint" role="status">' + esc(dz.search.msg) + '</p>' : '') + '</section>';
    /* cornice */
    h += '<section class="panel"><h2 class="sect" style="margin:0">Cornice</h2><div class="chips">' + R.FRAMES.map(function (f) { return chip('dz-set', 'frame', f.id, f.name, d.frame === f.id); }).join('') + '</div>' +
      '<div class="chips" aria-label="Colore">' + chip('dz-set', 'palette', 'auto', 'Auto (dai colori)', d.palette === 'auto') + R.PAL_ORDER.map(function (k) { return chip('dz-set', 'palette', k, R.PAL[k].name, d.palette === k); }).join('') + '</div>' +
      '<div class="dz-row">' + lbl('Bordo', sel('border', d.border, [['black', 'Nero'], ['white', 'Bianco'], ['silver', 'Argento'], ['gold', 'Oro']])) +
      lbl('Angoli', sel('corners', d.corners, [['round', 'Arrotondati'], ['square', 'Quadrati']])) + '</div>' +
      '<div class="dz-row">' + lbl('Cornice importata', '<select class="select" data-c="dz-frameimg"><option value="">Nessuna (uso la cornice disegnata)</option>' + frameOptions(d) + '</select>') +
      (d.frameImg ? lbl('Colore del testo', sel('ink', d.ink, [['dark', 'Scuro'], ['light', 'Chiaro']])) : '') + '</div>' +
      '<div class="btns"><label class="btn small filebtn">Importa cornici (PNG o pacchetto)<input type="file" accept="image/png,image/webp,.json,application/json" data-c="dz-framefile" multiple hidden></label>' +
      (d.frameImg ? '<button class="btn small danger" data-a="dz-frame-del">' + (/^auto:/.test(d.frameImg) ? 'Elimina il pacchetto di cornici' : 'Elimina questa cornice') + '</button>' : '') + '</div>' +
      (dz.res.length ? '<p class="hint">Simboli di mana e font importati: ' + dz.res.map(function (x) { return x.kind === 'symbols' ? 'simboli' : x.kind === 'watermarks' ? 'filigrane' : x.kind === 'overlays' ? 'extra' : 'font ' + (x.role || ''); }).join(', ') + '. <button class="btn small danger" data-a="dz-res-del">Togli simboli, font e filigrane</button></p>' : '') + '<p class="hint">Le cornici importate (PNG tuoi con la zona dell’arte trasparente, oppure un pacchetto .json) restano solo su questo dispositivo. Con «automatica» la cornice segue i colori della carta.</p></section>';
    /* extra delle cornici importate */
    if (R.hasOverlays() && d.frameImg) {
      var yn = [['', 'No'], ['1', 'Sì']];
      h += '<section class="panel"><h2 class="sect" style="margin:0">Extra della cornice</h2>' +
        '<div class="dz-row">' + lbl('Corona leggendaria', sel('crown', d.crown, [['', 'Nessuna'], ['legend', 'Corona'], ['floating', 'Corona fluttuante']])) +
        lbl('Corona interna', sel('inner', d.inner, [['', 'Nessuna'], ['nyx', 'Nyx'], ['comp', 'Compagno']])) + '</div>' +
        '<div class="dz-row">' + lbl('Stampo olografico', sel('holo', d.holo, [['', 'Nessuno'], ['color', 'A colori'], ['plain', 'Semplice'], ['gray', 'Grigio'], ['acorn', 'Ghianda'], ['alchemy', 'Alchemy']])) +
        lbl('«The List»', sel('list', d.list, [['', 'Nessuno'], ['regular', 'Post-M15'], ['old', 'Pre-M15']])) + '</div>' +
        '<div class="dz-row">' + lbl('Forza/Costituzione scura', sel('darkpt', d.darkpt, yn)) + lbl('Pips dell\u2019identità di colore', sel('pips', d.pips, yn)) + '</div>' +
        '<p class="hint">Le corone e gli stampi seguono il colore della carta; i pips usano i colori della carta (qui sopra).</p></section>';
    }
    /* testo */
    var cm = R.paletteKey(d);
    h += '<section class="panel"><h2 class="sect" style="margin:0">Testo</h2>' +
      lbl('Nome', inp('name', d.name, 'Nome della carta')) +
      (L && L.noCost ? '' : lbl('Costo di mana', inp('cost', d.cost, '{2}{U}{U}'))) +
      lbl('Tipo', inp('type', d.type, 'Creature — Wizard')) +
      '<label class="lbl">' + (L && L.walker ? 'Abilità (una per riga: «+1: testo», «−2: testo»)' : L && L.saga ? 'Capitoli (una riga per capitolo: «I — testo»)' : 'Testo delle regole') + '<textarea class="textarea dz-ta" data-c="dz-f" data-k="rules" rows="6">' + esc(d.rules) + '</textarea></label>' +
      '<div class="dz-syms" aria-label="Inserisci simbolo">' + SYMS.map(function (s) { return '<button class="chip small" data-a="dz-sym" data-v="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>' +
      (wmOptions() ? lbl('Filigrana nella casella di testo', sel('watermark', d.watermark, wmOptions())) : '') +
      (L && (L.walker || L.saga) ? '' : '<label class="lbl">Testo di colore (corsivo)<textarea class="textarea dz-ta" data-c="dz-f" data-k="flavor" rows="2">' + esc(d.flavor) + '</textarea></label>') +
      '<div class="dz-row">' + (usesPT(d) ? lbl(L.walker ? 'Lealtà' : 'Forza/Costituzione', inp('pt', d.pt, L.walker ? '4' : '2/3')) : '') + lbl('Rarità', sel('rarity', d.rarity, [['common', 'Comune'], ['uncommon', 'Non comune'], ['rare', 'Rara'], ['mythic', 'Mitica']])) + '</div>' +
      '<div class="dz-row">' + lbl('Collezione', inp('set', d.set, 'CST')) + lbl('Numero', inp('num', d.num, '001')) + lbl('Artista', inp('artist', d.artist, 'Nome')) + '</div>' +
      '<div><span class="lbl-t">Colori della carta</span><div class="chips">' + 'WUBRG'.split('').map(function (c) { return chip('dz-col', 'colors', c, {W: 'Bianco', U: 'Blu', B: 'Nero', R: 'Rosso', G: 'Verde'}[c], cs.indexOf(c) >= 0); }).join('') + '</div><p class="hint">Decidono il colore della cornice quando è su «Auto» (ora: ' + esc(R.PAL[cm].name) + ').</p></div></section>';
    /* arte */
    h += '<section class="panel"><h2 class="sect" style="margin:0">Arte</h2><div class="btns"><label class="btn small primary filebtn">Carica immagine<input type="file" accept="image/*" data-c="dz-artfile" hidden></label>' +
      (d.art.id ? '<button class="btn small" data-a="dz-art-del">Togli</button><button class="btn small" data-a="dz-art-reset">Ricentra</button>' : '') + '</div>' +
      (d.art.id ? '<label class="lbl">Zoom' + rng('s', d.art.s, 0.4, 4, 0.01) + '</label><label class="lbl">Sposta in orizzontale' + rng('x', d.art.x, -500, 500, 1) + '</label><label class="lbl">Sposta in verticale' + rng('y', d.art.y, -500, 500, 1) + '</label>' : '<p class="hint">Qualsiasi immagine: viene ridotta e salvata solo su questo dispositivo.</p>') + '</section>';
    /* mazzo */
    h += deckPanel(d);
    /* azioni */
    h += '<section class="panel"><div class="btns"><button class="btn small" data-a="dz-dup" data-id="' + esc(d.id) + '">Duplica</button><button class="btn small" data-a="dz-export-one">Esporta design (.json)</button>' +
      '<button class="btn small danger' + (dz.confirm === 'del' ? ' armed' : '') + '" data-a="dz-del" data-cf="1">' + (dz.confirm === 'del' ? 'Conferma eliminazione' : 'Elimina design') + '</button></div></section>';
    return h + '</div></div>';
  }
  function deckPanel(d) {
    var decks = (H.decks() || []).filter(function (x) { return x.kind === 'deck'; });
    var bound = (H.decks() || []).filter(function (x) { return x.cards.some(function (c) { return c.design === d.id; }); });
    var cur = dz.bind || (dz.bind = { deckId: decks[0] ? decks[0].id : '', card: '', qty: 1 });
    var dk = decks.filter(function (x) { return x.id === cur.deckId; })[0] || decks[0];
    if (dk && cur.deckId !== dk.id) cur.deckId = dk.id;
    var h = '<section class="panel"><h2 class="sect" style="margin:0">Nel mazzo</h2>';
    if (!decks.length) return h + '<p class="hint">Importa prima un mazzo: poi potrai aggiungere qui questa carta.</p></section>';
    h += lbl('Mazzo', '<select class="select" data-c="dz-bdeck">' + decks.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === cur.deckId ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>');
    h += '<div class="dz-row">' + lbl('Copie', '<input class="input" type="number" min="1" max="99" value="' + cur.qty + '" data-c="dz-bqty">') +
      '<div class="btns" style="align-self:end"><button class="btn" data-a="dz-add">Aggiungi come carta nuova</button></div></div>';
    h += '<label class="lbl">Oppure sostituisce una carta del mazzo<select class="select" data-c="dz-bcard"><option value="">Scegli la carta…</option>' +
      (dk ? dk.cards.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); }).map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === cur.card ? ' selected' : '') + '>' + esc(c.name) + (c.qty > 1 ? ' ×' + c.qty : '') + (c.design ? ' (ha già un design)' : '') + '</option>'; }).join('') : '') + '</select></label>';
    h += '<div class="btns"><button class="btn" data-a="dz-replace"' + (cur.card ? '' : ' disabled') + '>Usa questo design per quella carta</button></div>';
    h += '<p class="hint">«Sostituisce»: la carta resta nel mazzo con il suo nome, ma nel PDF si stampa questo design. «Nuova»: entra nel mazzo come carta con il nome del design.</p>';
    if (bound.length) h += '<p class="hint">Già in: ' + bound.map(function (x) { return esc(x.name); }).join(', ') + '.</p>';
    return h + '</section>';
  }

  function html() {
    if (!dz.loaded) load().then(function () { if (H.ui.view === 'designer') H.render(); });
    var body = dz.view === 'edit' && dz.cur ? editHtml() : listHtml();
    return body + (dz.picker ? pickerHtml() : '');
  }
  function pickerHtml() {
    var p = dz.picker;
    return '<div class="bd-modal" data-a="dz-pick-close"><div class="bd-mbox" data-a="dz-keep" role="dialog" aria-label="Scegli un design"><div class="bd-mhead"><strong>Design per «' + esc(p.cardName) + '»</strong><button class="btn small" data-a="dz-pick-close">Chiudi</button></div>' +
      (dz.designs.length ? '<div class="dz-grid dz-mgrid">' + dz.designs.map(function (d) { return '<button class="dz-item dz-pickit" data-a="dz-pick" data-id="' + esc(d.id) + '"><canvas class="dz-th" data-id="' + esc(d.id) + '" width="186" height="260"></canvas><b>' + esc(d.name) + '</b></button>'; }).join('') + '</div>' : '<p class="hint">Non hai ancora design.</p>') +
      '<div class="btns"><button class="btn primary" data-a="dz-pick-new">Crea un design per questa carta</button></div></div></div>';
  }
  function after() {
    if (H.ui.view !== 'designer') return;
    if (dz.view === 'edit' && dz.cur) {
      drawPreview(); wireCanvas(); fonts().then(schedulePreview);
    }
    drawThumbs();
  }

  /* trascinamento e rotella sull'arte (solo con il mouse: sul touch si usano i cursori) */
  function wireCanvas() {
    var cv = document.getElementById('dz-cv'), d = dz.cur; if (!cv || !d) return;
    var drag = null;
    function inArt(ev) {
      var r = cv.getBoundingClientRect(), sx = W / r.width, x = (ev.clientX - r.left) * sx, y = (ev.clientY - r.top) * sx, a = (R.LAYOUT[d.frame] || R.LAYOUT.classic).art;
      return x >= a[0] && x <= a[0] + a[2] && y >= a[1] && y <= a[1] + a[3];
    }
    cv.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType !== 'mouse' || !d.art.id || !inArt(ev)) return;
      drag = { x: ev.clientX, y: ev.clientY, ax: d.art.x, ay: d.art.y, k: W / cv.getBoundingClientRect().width };
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignorato */ }
    });
    cv.addEventListener('pointermove', function (ev) {
      if (!drag) { cv.style.cursor = ev.pointerType === 'mouse' && d.art.id && inArt(ev) ? 'move' : 'default'; return; }
      d.art.x = Math.round(drag.ax + (ev.clientX - drag.x) * drag.k); d.art.y = Math.round(drag.ay + (ev.clientY - drag.y) * drag.k); schedulePreview();
    });
    var end = function () { if (drag) { drag = null; saveSoon(); syncRanges(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', function (ev) {
      if (!d.art.id || !inArt(ev)) return;
      ev.preventDefault(); d.art.s = Math.max(0.4, Math.min(4, d.art.s * (ev.deltaY < 0 ? 1.05 : 0.95))); schedulePreview(); saveSoon(); syncRanges();
    }, { passive: false });
  }
  function syncRanges() {
    var d = dz.cur; if (!d) return;
    [].slice.call(document.querySelectorAll('[data-c="dz-art"]')).forEach(function (el) { el.value = d.art[el.getAttribute('data-k')]; });
  }

  /* ---------- alter da Scryfall ---------- */
  function fetchJson(url) { return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { if (!r.ok) { var e = new Error('http'); e.status = r.status; throw e; } return r.json(); }); }
  function fetchBlob(url) { return (window.CapacitorWebFetch || window.fetch).call(window, url).then(function (r) { if (!r.ok) throw new Error('http'); return r.blob(); }); }
  function alterFrom(name) {
    var d = dz.cur; if (!d || !name.trim()) return;
    dz.search.busy = true; dz.search.msg = ''; H.render();
    fetchJson('https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(name.trim())).then(function (c) {
      var f = c.card_faces && !c.image_uris ? c.card_faces[0] : c, cols = (f.colors || c.colors || []).join('');
      var tl = String(f.type_line || c.type_line || ''), rules = String(f.oracle_text || ''), pt = f.power != null ? f.power + '/' + f.toughness : (f.loyalty || '');
      var frame = /planeswalker/i.test(tl) ? 'planeswalker' : /saga/i.test(tl) ? 'saga' : c.layout === 'token' ? 'token' : (d.frame === 'planeswalker' || d.frame === 'saga' || d.frame === 'token' ? 'classic' : d.frame);
      d.name = f.name || c.name; d.cost = f.mana_cost || ''; d.type = tl; d.rules = rules; d.flavor = f.flavor_text || ''; d.pt = String(pt || '');
      d.rarity = R.RARITY[c.rarity] ? c.rarity : 'common'; d.set = String(c.set || '').toUpperCase(); d.num = String(c.collector_number || ''); d.artist = f.artist || c.artist || '';
      d.colors = cols; d.palette = 'auto'; d.frame = frame; d.alterOf = c.name; d.kind = d.kind === 'card' ? 'alter' : d.kind;
      var art = (f.image_uris || c.image_uris || {}).art_crop;
      dz.search.msg = 'Importata: ' + (c.name || name) + '.';
      if (!art) { dz.search.busy = false; saveNow(); H.render(); return; }
      return fetchBlob(art).then(function (b) { dz.search.busy = false; return setArt(b); }, function () { dz.search.busy = false; dz.search.msg += ' Il testo è dentro, ma l’arte non si è scaricata: caricane una tua.'; saveNow(); H.render(); });
    }).catch(function (e) {
      dz.search.busy = false; dz.search.msg = e && e.status === 404 ? 'Non trovo una carta con quel nome su Scryfall.' : 'Non riesco a contattare Scryfall: controlla la connessione e riprova.'; H.render();
    });
  }

  /* ---------- legame con i mazzi ---------- */
  function keyOf(n) { return window.Core ? window.Core.keyOf(n) : String(n).toLowerCase(); }
  function addToDeck(d, deckId, qty) {
    var dk = H.getDeck(deckId); if (!dk) return;
    H.mutate(d.name + ' aggiunta a ' + dk.name + '.', function () {
      var ex = dk.cards.filter(function (c) { return c.design === d.id && keyOf(c.name) === keyOf(d.name); })[0];
      if (ex) ex.qty += qty; else dk.cards.push({ name: d.name, qty: qty, set: '', cn: '', design: d.id });
      dk.updatedAt = Date.now();
    });
  }
  function bindCard(d, deckId, cardName) {
    var dk = H.getDeck(deckId); if (!dk || !cardName) return false;
    var rows = dk.cards.filter(function (c) { return keyOf(c.name) === keyOf(cardName); });
    if (!rows.length) return false;
    H.mutate('Il design «' + d.name + '» sostituisce ' + cardName + ' in ' + dk.name + '.', function () { rows.forEach(function (r) { r.design = d.id; }); dk.updatedAt = Date.now(); });
    return true;
  }
  function unbind(deckId, cardName) {
    var dk = H.getDeck(deckId); if (!dk) return;
    H.mutate('Design tolto da ' + cardName + '.', function () { dk.cards.forEach(function (r) { if (keyOf(r.name) === keyOf(cardName)) delete r.design; }); dk.updatedAt = Date.now(); });
  }
  function dropDesign(id) {
    var ds = H.decks() || [];
    if (ds.some(function (dk) { return dk.cards.some(function (c) { return c.design === id; }); })) {
      H.mutate('Design eliminato: le carte tornano all’immagine di Scryfall.', function () { ds.forEach(function (dk) { dk.cards.forEach(function (c) { if (c.design === id) delete c.design; }); }); });
    }
    var d = byId(id);
    dz.designs = dz.designs.filter(function (x) { return x.id !== id; });
    DB.del('designs', id); if (d && d.art.id) { DB.del('art', d.art.id); delete artCache[d.art.id]; }
  }

  /* ---------- esporta / importa ---------- */
  function blobToDataUrl(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.onerror = function () { res(''); }; r.readAsDataURL(b); }); }
  function dataUrlToBlob(u) {
    var m = /^data:([^;,]+);base64,(.*)$/.exec(u || ''); if (!m) return null;
    var bin = atob(m[2]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  }
  function packOne(d) { return artImage(d.art.id).then(function () { return DB.get('art', d.art.id); }).then(function (b) { return (b ? blobToDataUrl(b) : Promise.resolve('')).then(function (u) { return { design: d, art: u }; }); }); }
  function exportDesigns(list, name) {
    Promise.all(list.map(packOne)).then(function (items) {
      var json = JSON.stringify({ app: 'coglio-designer', version: 1, exportedAt: new Date().toISOString(), items: items });
      return H.download(name, json, 'application/json').then(function (ok) { if (ok !== 'declined') H.toast(ok ? 'File dei design pronto (le cornici importate non sono incluse).' : 'Download non disponibile qui.'); });
    });
  }
  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      var data; try { data = JSON.parse(String(r.result)); } catch (e) { dz.msg = 'Errore: il file non è un JSON valido.'; H.render(); return; }
      var items = data && data.app === 'coglio-designer' && Array.isArray(data.items) ? data.items : null;
      if (!items) { dz.msg = 'Errore: non è un file di design di Coglio.'; H.render(); return; }
      var chain = Promise.resolve(), n = 0;
      items.forEach(function (it) {
        chain = chain.then(function () {
          var d = norm(it.design || {}); var wasThere = byId(d.id); if (wasThere) d.id = uid('z');
          if (!/^auto:/.test(d.frameImg)) d.frameImg = '';
          d.createdAt = Date.now(); d.updatedAt = Date.now();
          var b = dataUrlToBlob(it.art), aid = '';
          var p = Promise.resolve();
          if (b) { aid = uid('a'); p = DB.put('art', b, aid); }
          d.art = { id: aid, x: +(it.design && it.design.art && it.design.art.x) || 0, y: +(it.design && it.design.art && it.design.art.y) || 0, s: +(it.design && it.design.art && it.design.art.s) || 1 };
          return p.then(function () { dz.designs.unshift(d); n++; return DB.put('designs', clone(d)); });
        });
      });
      chain.then(function () { dz.msg = n + (n === 1 ? ' design importato.' : ' design importati.'); H.render(); });
    };
    r.readAsText(file);
  }
  function download(blob, name) { return H.download(name, blob, blob.type); }
  function fname(d, ext) { return (String(d.name || 'carta').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'carta') + ext; }

  /* ---------- eventi ---------- */
  function click(a, el) {
    var d = dz.cur, id = el.getAttribute('data-id'), k = el.getAttribute('data-k'), v = el.getAttribute('data-v');
    switch (a) {
      case 'dz-new': create(k); break;
      case 'dz-open': var t = byId(id); if (t) editDesign(t); break;
      case 'dz-back': saveNow(); dz.view = 'list'; dz.cur = null; dz.confirm = ''; window.scrollTo(0, 0); H.render(); break;
      case 'dz-dup':
        var src = byId(id) || d; if (!src) break;
        var c = clone(src); c.id = uid('z'); c.name = src.name + ' (copia)'; c.createdAt = c.updatedAt = Date.now();
        var done = function () { dz.designs.unshift(c); saveNow().then(function () { if (dz.view === 'edit') editDesign(c); else H.render(); }); dz.cur = dz.view === 'edit' ? c : dz.cur; };
        if (src.art.id) DB.get('art', src.art.id).then(function (b) { if (!b) { c.art.id = ''; done(); return; } var nid = uid('a'); DB.put('art', b, nid).then(function () { c.art.id = nid; done(); }); }); else done();
        break;
      case 'dz-set': if (d) { d[k] = v; if (k === 'frame') { var L = R.LAYOUT[v]; if (L && !L.pt) d.pt = d.pt; } saveSoon(); H.render(); } break;
      case 'dz-col': if (d) { var cs = String(d.colors || '').toUpperCase(); d.colors = cs.indexOf(v) >= 0 ? cs.replace(v, '') : 'WUBRG'.split('').filter(function (x) { return cs.indexOf(x) >= 0 || x === v; }).join(''); saveSoon(); H.render(); } break;
      case 'dz-sym': insertSym(v); break;
      case 'dz-png': if (d) { saveNow(); renderBlob(d.id, { type: 'image/png' }).then(function (b) { return download(b, fname(d, '.png')); }).then(function (ok) { if (ok === false) H.toast('Download non disponibile qui.'); }, function () { H.toast('Non riesco a creare l’immagine.'); }); } break;
      case 'dz-jpg': if (d) { saveNow(); renderBlob(d.id, { type: 'image/jpeg', square: true }).then(function (b) { return download(b, fname(d, '.jpg')); }).then(function (ok) { if (ok === false) H.toast('Download non disponibile qui.'); }, function () { H.toast('Non riesco a creare l’immagine.'); }); } break;
      case 'dz-art-del': if (d && d.art.id) { var oid = d.art.id; d.art = { id: '', x: 0, y: 0, s: 1 }; dz.artImg = null; DB.del('art', oid); delete artCache[oid]; saveNow(); H.render(); } break;
      case 'dz-art-reset': if (d) { d.art.x = 0; d.art.y = 0; d.art.s = 1; saveSoon(); H.render(); } break;
      case 'dz-alter': if (d) alterFrom(dz.search.q || d.name); break;
      case 'dz-add': if (d && dz.bind && dz.bind.deckId) { saveNow(); addToDeck(d, dz.bind.deckId, Math.max(1, Math.min(99, parseInt(dz.bind.qty, 10) || 1))); H.render(); } break;
      case 'dz-replace': if (d && dz.bind && dz.bind.card) { saveNow(); if (bindCard(d, dz.bind.deckId, dz.bind.card)) H.render(); } break;
      case 'dz-del':
        if (!d) break;
        if (dz.confirm === 'del') { dropDesign(d.id); dz.cur = null; dz.view = 'list'; dz.confirm = ''; window.scrollTo(0, 0); H.render(); } else { dz.confirm = 'del'; H.render(); }
        break;
      case 'dz-res-del':
        dz.res.forEach(function (x) { DB.del('frames', x.id); }); dz.res = [];
        R.setResources({}); H.toast('Risorse importate tolte: tornano i simboli e i font disegnati. Riavvia l\u2019app per scaricare i font dalla memoria.'); H.render(); break;
      case 'dz-frame-del':
        if (d && d.frameImg) {
          var cur = d.frameImg, auto = /^auto:(.+)$/.exec(cur), gone = auto ? dz.frames.filter(function (f) { return f.group === auto[1]; }).map(function (f) { return f.id; }) : [cur];
          dz.designs.forEach(function (x) { if (x.frameImg === cur || gone.indexOf(x.frameImg) >= 0) { x.frameImg = ''; if (x !== d) DB.put('designs', clone(x)); } });
          dz.frames = dz.frames.filter(function (f) { return gone.indexOf(f.id) < 0; });
          gone.forEach(function (g) { delete dz.frameImgs[g]; DB.del('frames', g); });
          saveNow(); H.render();
        } break;
      case 'dz-export-one': if (d) { saveNow(); exportDesigns([d], fname(d, '.coglio-design.json')); } break;
      case 'dz-export-all': exportDesigns(dz.designs, 'coglio-design.json'); break;
      case 'dz-bind': openPicker(el.getAttribute('data-deck'), el.getAttribute('data-name')); break;
      case 'dz-unbind': unbind(el.getAttribute('data-deck'), el.getAttribute('data-name')); H.render(); break;
      case 'dz-pick-close': dz.picker = null; H.render(); break;
      case 'dz-keep': break;
      case 'dz-pick': if (dz.picker) { var pd = byId(id); if (pd && bindCard(pd, dz.picker.deckId, dz.picker.cardName)) { dz.picker = null; H.render(); } } break;
      case 'dz-pick-new':
        if (dz.picker) {
          var pk = dz.picker, nd = norm(R.defaults('card')); nd.id = uid('z'); nd.name = pk.cardName; nd.createdAt = nd.updatedAt = Date.now(); dz.picker = null;
          dz.designs.unshift(nd); dz.bind = { deckId: pk.deckId, card: pk.cardName, qty: 1 }; saveNow(); H.ui.view = 'designer'; editDesign(nd);
        } break;
    }
  }
  function insertSym(s) {
    var d = dz.cur; if (!d) return;
    var key = dz.focus === 'cost' ? 'cost' : dz.focus === 'flavor' ? 'flavor' : 'rules';
    var el = document.querySelector('[data-c="dz-f"][data-k="' + key + '"]');
    if (!el) return;
    var pos = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length, end = typeof el.selectionEnd === 'number' ? el.selectionEnd : pos;
    el.value = el.value.slice(0, pos) + s + el.value.slice(end); d[key] = el.value;
    try { el.focus(); el.setSelectionRange(pos + s.length, pos + s.length); } catch (e) { /* ignorato */ }
    schedulePreview(); saveSoon();
  }
  function input(c, el) {
    var d = dz.cur;
    if (c === 'dz-f' && d) { d[el.getAttribute('data-k')] = el.value; schedulePreview(); saveSoon(); if (el.getAttribute('data-k') === 'name') { var h1 = document.querySelector('.vh h1'); if (h1) h1.textContent = el.value || 'Senza nome'; } }
    else if (c === 'dz-art' && d) { d.art[el.getAttribute('data-k')] = parseFloat(el.value) || 0; schedulePreview(); saveSoon(); }
    else if (c === 'dz-q') dz.search.q = el.value;
    else if (c === 'dz-bqty' && dz.bind) dz.bind.qty = el.value;
  }
  function change(c, el) {
    var d = dz.cur;
    if (c === 'dz-f' && d) { d[el.getAttribute('data-k')] = el.value; saveSoon(); if (el.tagName === 'SELECT') H.render(); else schedulePreview(); }
    else if (c === 'dz-artfile') { if (el.files && el.files[0]) setArt(el.files[0]); }
    else if (c === 'dz-framefile') {
      var files = [].slice.call(el.files || []), last = null, p = Promise.resolve();
      files.forEach(function (f) {
        if (/\.json$/i.test(f.name) || f.type === 'application/json') { p = p.then(function () { return importPack(f).then(function (g) { if (g && g !== '*') last = { id: 'auto:' + g }; if (g) { dz.frameImgs = {}; } }); }); return; }
        p = p.then(function () {
          return blobImage(f).then(function (r) { URL.revokeObjectURL(r.url); var fr = { id: uid('f'), name: f.name.replace(/\.[^.]+$/, ''), blob: f, ink: 'dark', createdAt: Date.now() }; dz.frames.push(fr); last = fr; return DB.put('frames', fr); },
            function () { H.toast('«' + f.name + '»: non è un’immagine leggibile.'); });
        });
      });
      el.value = '';
      p.then(function () { if (last && d) { d.frameImg = last.id; saveNow(); } H.render(); });
    }
    else if (c === 'dz-frameimg' && d) { d.frameImg = el.value; saveSoon(); H.render(); }
    else if (c === 'dz-import') { if (el.files && el.files[0]) importFile(el.files[0]); }
    else if (c === 'dz-bdeck' && dz.bind) { dz.bind.deckId = el.value; dz.bind.card = ''; H.render(); }
    else if (c === 'dz-bcard' && dz.bind) { dz.bind.card = el.value; H.render(); }
  }
  function openPicker(deckId, cardName) {
    dz.picker = { deckId: deckId, cardName: cardName }; H.ui.view = 'designer'; if (dz.view !== 'list') { dz.view = 'list'; dz.cur = null; }
    load().then(function () { H.render(); }); H.render();
  }
  function escape() {
    if (dz.picker) { dz.picker = null; H.render(); return true; }
    return false;
  }
  document.addEventListener('focusin', function (e) {
    var t = e.target; if (t && t.getAttribute && t.getAttribute('data-c') === 'dz-f') dz.focus = t.getAttribute('data-k');
  });

  window.CPADesigner = {
    open: open, html: html, after: after, click: click, input: input, change: change, escape: escape, renderBlob: renderBlob,
    ready: load, get: byId, list: function () { return dz.designs.slice(); }, openPicker: openPicker, state: dz
  };
})();
