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
  var dz = { tab: 'testo', printsOpen: false, root: null, face: 'front', costOpen: false, loaded: false, loading: null, designs: [], frames: [], res: [], folders: [], folder: '*', fEdit: null, fText: '', fConfirm: false, itemConfirm: '', prints: { list: [], busy: false, msg: '' }, view: 'list', cur: null, artImg: null, frameImgs: {}, search: { q: '', busy: false, msg: '' }, focus: 'name',
    bind: null, picker: null, confirm: '', msg: '' };
  var artCache = {}, thumbTimer = null, drawTimer = null, saveTimer = null;

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /* cartelle: il nome sta nel design; l'elenco serve solo per le cartelle ancora vuote */
  var FKEY = 'cpa-dz-folders';
  function loadFolders() { try { var a = JSON.parse(localStorage.getItem(FKEY) || '[]'); return Array.isArray(a) ? a.map(String).filter(Boolean) : []; } catch (e) { return []; } }
  function saveFolders() { try { localStorage.setItem(FKEY, JSON.stringify(dz.folders)); } catch (e) { /* senza memoria locale restano solo le cartelle con dentro dei design */ } }
  function folderNames() {
    var set = {}; dz.folders.forEach(function (n) { set[n] = 1; }); dz.designs.forEach(function (d) { if (d.folder) set[d.folder] = 1; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }
  function folderCount(n) { return dz.designs.filter(function (d) { return n === '*' ? true : d.folder === n; }).length; }
  function load() {
    if (dz.loaded) return Promise.resolve();
    if (dz.loading) return dz.loading;
    dz.folders = loadFolders();
    dz.loading = Promise.all([DB.all('designs'), DB.all('frames')]).then(function (r) {
      dz.designs = (r[0] || []).map(norm).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      var all = (r[1] || []).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
      dz.frames = all.filter(function (f) { return !f.kind || f.kind === 'frame'; });
      dz.res = all.filter(function (f) { return f.kind === 'font' || f.kind === 'symbols' || f.kind === 'watermarks' || f.kind === 'overlays' || f.kind === 'walker'; });
      var marker = all.filter(function (f) { return f.id === 'bundle-marker'; })[0];
      return initResources().then(function () { return syncBundle(marker); }).then(function () { dz.loaded = true; dz.loading = null; });
    }, function () { dz.loaded = true; dz.loading = null; });
    return dz.loading;
  }
  /* risorse incluse nell'app (risorse.json: cornici, simboli, font): si caricano una volta per versione, in silenzio */
  var BUNDLE_VER = 'mse-6';
  function bundleBlob() {
    if (typeof window.CPA_BUNDLE === 'string') return Promise.resolve(new Blob([window.CPA_BUNDLE], { type: 'application/json' }));
    if (window.cpaNet && window.cpaNet.resource) return window.cpaNet.resource('risorse.json').then(function (t) { return t ? new Blob([t], { type: 'application/json' }) : null; }).catch(function () { return null; });
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
    Object.keys(sUrl).forEach(function (k) { if (sUrl[k]) { try { URL.revokeObjectURL(sUrl[k]); } catch (e) { /* già liberato */ } } }); sUrl = {};
    var fonts = {}, syms = {}, wms = {}, ovs = {}, wk = {}, jobs = [];
    dz.res.forEach(function (rec) {
      if (rec.kind === 'font' && rec.blob && window.FontFace && document.fonts) {
        jobs.push(rec.blob.arrayBuffer().then(function (buf) {
          var ff = new FontFace(rec.family, buf, { style: rec.style === 'italic' ? 'italic' : 'normal', weight: '100 900' });
          return ff.load().then(function () { document.fonts.add(ff); if (rec.role === 'title') fonts.title = true; if (rec.role === 'info') fonts.info = true; if (rec.role === 'body' || rec.role === 'bodyItalic') fonts.body = true; });
        }).catch(function () { return null; }));
      } else if (rec.kind === 'walker' && rec.map) {
        Object.keys(rec.map).forEach(function (k) {
          jobs.push(blobImage(rec.map[k]).then(function (r) { wk[k] = r.img; }).catch(function () { return null; }));
        });
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
    return Promise.all(jobs).then(function () { R.setResources({ fonts: fonts, symbols: syms, watermarks: wms, overlays: ovs, walker: wk }); });
  }
  function norm(d, isFace) {
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
    o.folder = String(d && d.folder || '').slice(0, 40);
    o.frameImg = String(o.frameImg || ''); o.watermark = String(o.watermark || ''); o.setImg = String(o.setImg || ''); o.setTint = o.setTint === 'rarity' ? 'rarity' : '';
    ['crown', 'inner', 'holo', 'darkpt', 'pips', 'list'].forEach(function (k) { o[k] = String(o[k] || ''); });
    o.mix = R.mixOf(o.mix) || ''; o.cmix = R.mixOf(o.cmix) || '';
    o.back = !isFace && d && d.back && typeof d.back === 'object' ? norm(d.back, true) : null;
    if (o.back) o.back.id = o.id;
    if (isFace) delete o.back;
    return o;
  }
  function byId(id) { return dz.designs.filter(function (d) { return d.id === id; })[0] || null; }
  function saveNow() {
    if (!dz.cur) return Promise.resolve();
    var d = dz.root && (dz.cur === dz.root || dz.cur === dz.root.back) ? dz.root : dz.cur; d.updatedAt = Date.now();
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
  function fid(d, key) {
    var v = d && d.frameImg; if (!v) return '';
    var m = /^auto:(.+)$/.exec(v); if (!m) return v;
    var pk = key || R.paletteKey(d), list = dz.frames.filter(function (f) { return f.group === m[1]; });
    var f = list.filter(function (x) { return x.key === pk; })[0] || list.filter(function (x) { return x.key === 'C'; })[0] || list[0];
    return f ? f.id : '';
  }
  function frameAssets(id) {
    if (!id) return Promise.resolve(null);
    if (!dz.frameImgs[id]) dz.frameImgs[id] = DB.get('frames', id).then(function (f) {
      if (!f || !f.blob) return null;
      return Promise.all([blobImage(f.blob), f.ptBlob ? blobImage(f.ptBlob) : null, f.crownBlob ? blobImage(f.crownBlob) : null]).then(function (r) { return { frameImg: r[0].img, ptImg: r[1] ? r[1].img : null, crownImg: r[2] ? r[2].img : null, frameGeo: f.geo || null }; });
    }).catch(function () { return null; });
    return dz.frameImgs[id];
  }
  /* cornice (e, se la carta è bicolore, anche la seconda) pronta per il disegno */
  function assetsFor(d) {
    var mx = R.mixOf(d.mix), auto = /^auto:/.test(d.frameImg || ''), cm = d.crown === 'legend' && auto ? (R.mixOf(d.cmix) || [R.paletteKey(d)]) : null;
    /* le cornici bifronte portano la propria corona leggendaria: si prende quella del colore (o dei due colori) scelto per la corona */
    return Promise.all([frameAssets(fid(d)), mx && auto ? frameAssets(fid(d, mx[1])) : null, d.setImg ? artImage(d.setImg) : null, cm ? frameAssets(fid(d, cm[0])) : null, cm && cm[1] ? frameAssets(fid(d, cm[1])) : null]).then(function (r) {
      var base = r[0] ? (r[1] ? { frameImg: r[0].frameImg, ptImg: r[0].ptImg, crownImg: r[0].crownImg, frameGeo: r[0].frameGeo, frameImg2: r[1].frameImg, ptImg2: r[1].ptImg } : r[0]) : null;
      if (!r[2] && !r[3]) return base;
      var o = {}; if (base) Object.keys(base).forEach(function (k) { o[k] = base[k]; });
      if (r[2]) o.setImg = r[2];
      if (r[3]) { o.crownImg = r[3].crownImg; o.crownImg2 = r[4] ? r[4].crownImg : null; }
      return o;
    });
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
  /* simbolo del set: PNG piccolo (max 256 px) che conserva la trasparenza */
  function smallPng(file, max) {
    return blobImage(file).then(function (r) {
      var im = r.img, w0 = im.naturalWidth || 256, h0 = im.naturalHeight || 256, s = Math.min(1, max / Math.max(w0, h0)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w0 * s)); c.height = Math.max(1, Math.round(h0 * s));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(r.url);
      return new Promise(function (res, rej) { c.toBlob(function (b) { if (b) res(b); else rej(new Error('conversione non riuscita')); }, 'image/png'); });
    });
  }
  function dropSetImg(d) { if (d && d.setImg) { DB.del('art', d.setImg); delete artCache[d.setImg]; d.setImg = ''; } }
  function setSymFile(file) {
    var d = dz.cur; if (!d) return;
    smallPng(file, 256).then(function (pb) {
      var id = uid('a'); return DB.put('art', pb, id).then(function () { dropSetImg(d); d.setImg = id; saveNow(); H.render(); });
    }).catch(function (e) { H.toast('Simbolo non caricato: ' + (e && e.message ? e.message : 'file non valido') + '.'); });
  }
  function setArt(blob, target) {
    var d = target || dz.cur; if (!d) return Promise.resolve();
    return shrink(blob, 1800).then(function (jb) {
      var old = d.art.id, id = uid('a');
      return DB.put('art', jb, id).then(function () {
        d.art = { id: id, x: 0, y: 0, s: 1 }; artCache[id] = DB.get('art', id).then(function (b) { return b ? blobImage(b).then(function (r) { return r.img; }) : null; });
        if (old) { delete artCache[old]; DB.del('art', old); }
        return artCache[id].then(function (im) { if (d === dz.cur) dz.artImg = im; saveNow(); H.render(); });
      });
    }).catch(function (e) { H.toast('Immagine non caricata: ' + (e && e.message ? e.message : 'file non valido') + '.'); });
  }

  /* ---------- disegno ---------- */
  var fontsP = null;
  function fonts() {
    if (!fontsP) {
      var f = document.fonts;
      fontsP = !f || !f.load ? Promise.resolve() : Promise.race([
        Promise.all(['700 24px Cinzel', '600 24px Cinzel', '700 24px \'CPA Title\'', '400 24px \'CPA Body\'', 'italic 400 24px \'CPA Body\'', '400 24px \'CPA Info\'', '400 24px "EB Garamond"', 'italic 400 24px "EB Garamond"', '700 24px "EB Garamond"', '600 24px Manrope'].map(function (x) { return f.load(x).catch(function () { return null; }); })),
        new Promise(function (r) { setTimeout(r, 4000); })]);
    }
    return fontsP;
  }
  function drawInto(ctx, d, art, fa, opt) { R.render(ctx, d, { art: art, frameImg: fa ? fa.frameImg : null, ptImg: fa ? fa.ptImg : null, frameGeo: fa ? fa.frameGeo : null, frameImg2: fa ? fa.frameImg2 : null, ptImg2: fa ? fa.ptImg2 : null, crownImg: fa ? fa.crownImg : null, crownImg2: fa ? fa.crownImg2 : null, setImg: fa ? fa.setImg : null }, opt); }
  function renderBlob(designId, opt) {
    opt = opt || {};
    return load().then(function () {
      var d = byId(designId); if (d && opt.face === 'back') d = d.back; if (!d) throw new Error('design non trovato');
      return Promise.all([artImage(d.art.id), assetsFor(d), fonts()]).then(function (a) {
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
    assetsFor(d).then(function (fa) { if (dz.cur !== d) return; try { drawInto(cv.getContext('2d'), d, dz.artImg, fa, {}); } catch (e) { /* ignorato */ } });
  }
  function schedulePreview() { if (drawTimer) return; drawTimer = setTimeout(function () { drawTimer = null; drawPreview(); }, 24); }
  function drawThumbs() {
    [].slice.call(document.querySelectorAll('canvas.dz-th')).forEach(function (cv) {
      var d = byId(cv.getAttribute('data-id')); if (!d) return;
      Promise.all([artImage(d.art.id), assetsFor(d), fonts()]).then(function (a) {
        if (!cv.isConnected) return;
        var ctx = cv.getContext('2d'); ctx.save(); ctx.scale(cv.width / W, cv.height / HH);
        try { drawInto(ctx, d, a[0], a[1], {}); } catch (e) { /* ignorato */ }
        ctx.restore();
      });
    });
  }

  /* ---------- schermata ---------- */
  function open() { H.ui.view = 'designer'; dz.view = 'list'; dz.cur = null; dz.root = null; dz.picker = null; dz.dlg = null; window.scrollTo(0, 0); load().then(function () { H.render(); }); H.render(); }
  function editDesign(d) {
    dz.cur = d; dz.root = d; dz.face = 'front'; dz.view = 'edit'; dz.artImg = null; dz.confirm = ''; dz.search = { q: d.alterOf || '', busy: false, msg: '' }; dz.prints = { list: [], busy: false, msg: '' }; dz.dlg = null; dz.printsOpen = false;
    artImage(d.art.id).then(function (a) { if (dz.cur === d) { dz.artImg = a; schedulePreview(); } });
    window.scrollTo(0, 0); H.render();
  }
  function create(kind) {
    var d = norm(R.defaults(kind === 'token' ? 'token' : 'card')); d.id = uid('z'); d.kind = kind || 'card'; d.createdAt = Date.now(); d.updatedAt = d.createdAt; if (dz.folder && dz.folder !== '*') d.folder = dz.folder;
    if (kind === 'alter') { d.name = 'Alter'; d.rules = ''; d.cost = ''; d.type = ''; d.pt = ''; }
    dz.designs.unshift(d); saveNow(); editDesign(d);
  }
  /* ---------- carte bifronte: ogni design può avere un retro, che si modifica come una carta a sé ---------- */
  function makeBack(r) {
    var b = norm({ frame: r.frame, border: r.border, corners: r.corners, ink: r.ink, frameImg: r.frameImg, colors: r.colors, rarity: r.rarity, set: r.set, num: r.num,
      name: 'Retro', cost: '', type: '', rules: '', flavor: '', pt: '', artist: '' }, true);
    b.id = r.id; return b;
  }
  function dropBackArt(r) { if (r && r.back) { if (r.back.art.id) { DB.del('art', r.back.art.id); delete artCache[r.back.art.id]; } dropSetImg(r.back); } }
  function showFace(face) {
    var r = dz.root; if (!r) return;
    var t = face === 'back' && r.back ? r.back : r; dz.face = t === r ? 'front' : 'back'; dz.cur = t; dz.artImg = null; dz.confirm = '';
    artImage(t.art.id).then(function (a) { if (dz.cur === t) { dz.artImg = a; schedulePreview(); } });
    window.scrollTo(0, 0); H.render();
  }
  function flip() {
    var r = dz.root; if (!r) return;
    if (!r.back) { r.back = makeBack(r); saveNow(); }
    showFace(dz.face === 'front' ? 'back' : 'front');
  }
  function removeBack() {
    var r = dz.root; if (!r || !r.back) return;
    dropBackArt(r); r.back = null; showFace('front'); saveNow();
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
  /* ---------- scelta della cornice: griglia di anteprime nel colore attuale della carta ---------- */
  var fUrl = {};
  function frameUrl(f) { if (!f || !f.blob) return ''; if (!fUrl[f.id]) { try { fUrl[f.id] = URL.createObjectURL(f.blob); } catch (e) { return ''; } } return fUrl[f.id]; }
  function forgetUrl(id) { if (fUrl[id]) { try { URL.revokeObjectURL(fUrl[id]); } catch (e) { /* già liberato */ } delete fUrl[id]; } }
  function frameTiles(d) {
    var pk = R.paletteKey(d), seen = {}, tiles = [];
    dz.frames.forEach(function (f) {
      if (f.group) {
        if (seen[f.group]) return; seen[f.group] = 1;
        var list = dz.frames.filter(function (x) { return x.group === f.group; });
        var pick = list.filter(function (x) { return x.key === pk; })[0] || list.filter(function (x) { return x.key === 'C'; })[0] || list[0];
        tiles.push({ id: 'auto:' + f.group, name: f.groupName || f.group, f: pick });
      } else tiles.push({ id: f.id, name: f.name, f: f });
    });
    function tile(id, name, f) {
      var url = f ? frameUrl(f) : '';
      return '<button class="dz-ftile" data-a="dz-frame-pick" data-v="' + esc(id) + '" aria-pressed="' + ((d.frameImg || '') === id) + '" title="' + esc(name) + '">' +
        '<span class="dz-ftimg">' + (url ? '<img src="' + url + '" alt="" loading="lazy">' : '<span class="dz-fdraw">Disegnata</span>') + '</span><span class="dz-ftname">' + esc(name) + '</span></button>';
    }
    return '<div class="dz-ftiles" role="group" aria-label="Cornici">' + tile('', 'Cornice disegnata', null) + tiles.map(function (t) { return tile(t.id, t.name, t.f); }).join('') + '</div>';
  }
  function pickFrame(d, v) {
    d.frameImg = v || '';
    var fsel = dz.frames.filter(function (f) { return f.id === fid(d); })[0];
    if (fsel) {
      d.ink = fsel.ink === 'light' ? 'light' : 'dark';
      var lay = fsel.geo && fsel.geo.layout;
      if (lay && R.LAYOUT[lay]) d.frame = lay; else if (d.frame === 'planeswalker' || d.frame === 'saga') d.frame = 'classic';
    }
    saveSoon(); H.render();
  }

  /* ---------- costo di mana a pulsanti ---------- */
  var MANA = [['W', 'Bianco'], ['U', 'Blu'], ['B', 'Nero'], ['R', 'Rosso'], ['G', 'Verde'], ['N', 'Incolore']];
  function parseCost(str) {
    var o = { N: 0, X: 0, W: 0, U: 0, B: 0, R: 0, G: 0, pre: [], post: [] };
    (String(str || '').match(/\{[^}]+\}/g) || []).forEach(function (t) {
      var v = t.slice(1, -1).toUpperCase();
      if (/^\d+$/.test(v)) o.N += parseInt(v, 10);
      else if (v === 'X') o.X++;
      else if (/^[WUBRG]$/.test(v)) o[v]++;
      else if (v === 'C' || v === 'S') o.pre.push('{' + v + '}');
      else o.post.push(t);
    });
    return o;
  }
  function buildCost(o) {
    var s = ''; for (var i = 0; i < o.X; i++) s += '{X}';
    if (o.N) s += '{' + o.N + '}';
    s += o.pre.join('') + o.post.join('');
    'WUBRG'.split('').forEach(function (k) { for (var j = 0; j < o[k]; j++) s += '{' + k + '}'; });
    return s;
  }
  var sUrl = {};
  function symUrl(k) {
    if (sUrl[k] !== undefined) return sUrl[k];
    var rec = dz.res.filter(function (x) { return x.kind === 'symbols'; })[0], b = rec && rec.map && rec.map[k];
    try { sUrl[k] = b ? URL.createObjectURL(b) : ''; } catch (e) { sUrl[k] = ''; }
    return sUrl[k];
  }
  function manaInner(d) {
    var o = parseCost(d.cost);
    return MANA.map(function (m) {
      var k = m[0], n = o[k], url = k === 'N' ? '' : symUrl(k);
      var sym = url ? '<img class="dz-msym" src="' + url + '" alt="">' : '<span class="dz-msym dz-m' + k + '">' + (k === 'N' ? (n || '1') : k) + '</span>';
      return '<span class="dz-mana' + (n ? ' on' : '') + '">' +
        '<button class="dz-mbtn" data-a="dz-mana" data-v="' + k + '" data-k="+" aria-pressed="' + !!n + '" title="Aggiungi ' + m[1].toLowerCase() + '">' + sym + '<span>' + m[1] + '</span></button>' +
        (n ? '<button class="dz-mstep" data-a="dz-mana" data-v="' + k + '" data-k="-" aria-label="Togli ' + m[1].toLowerCase() + '">\u2212</button><b>' + n + '</b><button class="dz-mstep" data-a="dz-mana" data-v="' + k + '" data-k="+" aria-label="Aggiungi ' + m[1].toLowerCase() + '">+</button>' : '') + '</span>';
    }).join('');
  }
  function costHtml(d) {
    var o = parseCost(d.cost), special = o.X || o.pre.length || o.post.length;
    return '<div class="lbl"><span class="lbl-t">Costo di mana</span><div class="dz-manas" id="dz-mana">' + manaInner(d) + '</div>' +
      ((dz.costOpen || special) ? inp('cost', d.cost, '{X}{2}{W/U}{G/P}') + '<p class="hint">Scrivi qui X, ibridi ({W/U}), phyrexiani ({G/P}) e {C}: i pulsanti tengono il resto.</p>' :
        '<button class="linkbtn" data-a="dz-costopen">Scrivi il costo a mano (X, ibridi, phyrexiani\u2026)</button>') + '</div>';
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
        importData(data, silent, file.name).then(res);
      };
      r.readAsText(file);
    });
  }
  function importData(data, silent, fname) {
    return new Promise(function (res) {
        if (data && data.app === 'coglio-frames' && !Array.isArray(data.frames)) data.frames = [];
        if (!data || data.app !== 'coglio-frames') { if (!silent) H.toast('«' + fname + '»: non è un pacchetto di cornici di Coglio.'); return res(null); }
        var names = {}; (data.groups || []).forEach(function (g) { names[g.id] = g.name; });
        var chain = Promise.resolve(), n = 0, first = '';
        data.frames.forEach(function (f) {
          var blob = dataUrlToBlob(f.png); if (!blob) return;
          chain = chain.then(function () {
            var grp = String(f.group || 'pack'), key = String(f.key || '');
            var old = dz.frames.filter(function (x) { return x.group === grp && x.key === key; })[0];
            var rec = { id: old ? old.id : uid('f'), name: String(f.name || 'Cornice'), group: grp, groupName: names[grp] || grp, key: key, ink: f.ink === 'light' ? 'light' : 'dark', geo: f.geo || null, blob: blob, ptBlob: dataUrlToBlob(f.pt) || null, crownBlob: dataUrlToBlob(f.crown) || null, rev: Number(data.rev) || 1, createdAt: Date.now() };
            if (old) { dz.frames = dz.frames.filter(function (x) { return x !== old; }); delete dz.frameImgs[old.id]; forgetUrl(old.id); }
            dz.frames.push(rec); n++; if (!first) first = grp;
            return DB.put('frames', rec);
          });
        });
        var nsym = 0, nfont = 0, nwm = 0, nov = 0, nwk = 0;
        if (data.walker && typeof data.walker === 'object') {
          chain = chain.then(function () {
            var map = {}, nw = 0; Object.keys(data.walker).forEach(function (k) { var b = dataUrlToBlob(data.walker[k]); if (b) { map[k] = b; nw++; } });
            if (!nw) return null; nov += 0; nsym += 0;
            var rec = { id: 'res-walker', kind: 'walker', map: map, createdAt: Date.now() };
            dz.res = dz.res.filter(function (x) { return x.id !== rec.id; }); dz.res.push(rec); nwk = nw; return DB.put('frames', rec);
          });
        }
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
        chain.then(function () { return nsym || nfont || nwm || nov || nwk ? initResources() : null; }).then(function () {
          var parts = [];
          if (n) parts.push(n + (n === 1 ? ' cornice' : ' cornici'));
          if (nsym) parts.push(nsym + ' simboli di mana');
          if (nfont) parts.push(nfont + ' font');
          if (nwm) parts.push(nwm + ' filigrane');
          if (nov) parts.push(nov + ' extra (corone, stampi, pips…)');
          if (!silent) H.toast(parts.length ? 'Importati: ' + parts.join(', ') + '.' : 'Il pacchetto non contiene niente di utilizzabile.');
          res(n ? first : (nsym || nfont || nwm || nov || nwk ? '*' : null));
        }, function () { if (!silent) H.toast('Non riesco a salvare le risorse su questo dispositivo.'); res(null); });
    });
  }

  /* ---------- catalogo cornici: pacchetti estratti da Card Conjurer, scaricati da GitHub Pages solo quando servono ---------- */
  var PAGES = 'https://imhuho.github.io/coglio-proxy-archive/';
  var cat = { list: null, base: '', busy: false, msg: '', c: '', q: '', inst: {} };
  function wfetch(u) { return (window.CapacitorWebFetch || window.fetch).call(window, u); } /* su Android il fetch nativo non gestisce bene i file binari */
  function fetchFrom(path) {
    var bases = /^https?:$/.test(location.protocol) ? ['', PAGES] : [PAGES], i = 0;
    function next() {
      if (i >= bases.length) return Promise.reject(new Error('net'));
      var b = bases[i++];
      return wfetch(b + path).then(function (r) { if (!r.ok) throw new Error('http'); return { r: r, base: b }; }).catch(next);
    }
    return next();
  }
  function loadCatalog() {
    if (cat.list) return Promise.resolve();
    if (cat.busy) return cat.p || Promise.resolve();
    cat.busy = true; cat.msg = '';
    return cat.p = fetchFrom('packs/index.json').then(function (x) { return x.r.json().then(function (j) { cat.list = Array.isArray(j && j.packs) ? j.packs : []; cat.base = x.base; }); })
      .catch(function () { cat.msg = 'Non riesco a scaricare il catalogo: serve internet (lo scarica dalla versione web su GitHub Pages).'; })
      .then(function () { cat.busy = false; if (dz.view === 'catalog') H.render(); });
  }
  function packRev(id) { var f = dz.frames.filter(function (x) { return x.group === 'cc-' + id; })[0]; return f ? f.rev || 1 : 0; }
  function installed(id) { return dz.frames.some(function (f) { return f.group === 'cc-' + id; }); }
  function installPack(e) {
    if (!e || cat.inst[e.id]) return Promise.resolve(false);
    var base = cat.base + 'packs/' + e.id + '/', pk = null, done = 0, total = 0;
    cat.inst[e.id] = '\u2026'; H.render();
    return wfetch(base + 'pack.json').then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }).then(function (j) {
      pk = j; var jobs = [];
      (pk.frames || []).forEach(function (f) { ['png', 'pt', 'crown'].forEach(function (k) { if (f[k] && typeof f[k] === 'string' && !/^data:/.test(f[k])) jobs.push([f, k]); }); });
      total = jobs.length;
      var chain = Promise.resolve();
      jobs.forEach(function (jb) {
        chain = chain.then(function () {
          return wfetch(base + jb[0][jb[1]]).then(function (r) { if (!r.ok) throw new Error('http'); return r.blob(); }).then(function (b) {
            jb[0][jb[1]] = b; done++; cat.inst[e.id] = done + '/' + total;
            var el = document.querySelector('[data-a="dz-cat-add"][data-id="' + e.id + '"]'); if (el) el.textContent = 'Scarico ' + done + '/' + total + '\u2026';
          });
        });
      });
      return chain;
    }).then(function () { return importData(pk, true, e.name); }).then(function (g) {
      delete cat.inst[e.id]; dz.frameImgs = {};
      H.toast(g ? 'Aggiunto «' + e.name + '»: lo trovi nel menu «Cornice importata».' : 'Il pacchetto «' + e.name + '» non contiene cornici utilizzabili.'); H.render(); return !!g;
    }).catch(function () { delete cat.inst[e.id]; H.toast('Non riesco a scaricare «' + e.name + '»: controlla la connessione e riprova.'); H.render(); return false; });
  }
  function dropGroup(g) {
    var gone = dz.frames.filter(function (f) { return f.group === g; }).map(function (f) { return f.id; });
    dz.designs.forEach(function (x) { if (x.frameImg === 'auto:' + g || gone.indexOf(x.frameImg) >= 0) { x.frameImg = ''; DB.put('designs', clone(x)); } });
    dz.frames = dz.frames.filter(function (f) { return gone.indexOf(f.id) < 0; });
    gone.forEach(function (id) { delete dz.frameImgs[id]; forgetUrl(id); DB.del('frames', id); });
  }
  function catalogHtml() {
    var h = '<header class="vh"><button class="back" data-a="dz-back">\u2190 I miei design</button><h1>Catalogo cornici</h1><p class="sub">Cornici estratte da Card Conjurer: aggiungi quelle che ti servono e le trovi nel menu \u00abCornice importata\u00bb dell\u2019editor, con scelta automatica sui colori.</p></header>';
    if (!H.available()) return h + '<div class="empty"><p>Il catalogo si scarica da internet: qui dentro non \u00e8 disponibile. Usa l\u2019app per Windows, l\u2019APK o la versione web.</p></div>';
    loadCatalog();
    if (!cat.list) return h + '<p class="hint" role="status">' + esc(cat.msg || 'Carico il catalogo\u2026') + '</p>' + (cat.msg ? '<div class="btns"><button class="btn" data-a="dz-cat-retry">Riprova</button></div>' : '');
    var cats = []; cat.list.forEach(function (e) { if (cats.indexOf(e.category) < 0) cats.push(e.category); });
    var nInst = cat.list.filter(function (e) { return installed(e.id); }).length;
    h += '<section class="panel"><div class="chips" aria-label="Categorie">' + chip('dz-cat-c', 'c', '', 'Tutte (' + cat.list.length + ')', !cat.c) +
      (nInst ? chip('dz-cat-c', 'c', '*', 'Aggiunte (' + nInst + ')', cat.c === '*') : '') +
      cats.map(function (c) { return chip('dz-cat-c', 'c', c, esc(c) + ' (' + cat.list.filter(function (e) { return e.category === c; }).length + ')', cat.c === c); }).join('') + '</div>' +
      '<input class="input" data-c="dz-catq" placeholder="Cerca (es. borderless, extended, universes beyond)" value="' + esc(cat.q) + '" autocomplete="off"></section>';
    var q = cat.q.toLowerCase();
    var shown = cat.list.filter(function (e) { return (!cat.c || (cat.c === '*' ? installed(e.id) : e.category === cat.c)); });
    h += '<div class="dz-grid">' + shown.map(function (e) {
      var inst = installed(e.id), busy = cat.inst[e.id], old = inst && (e.rev || 1) > (packRev(e.id) || 1), s = (e.name + ' ' + e.category + ' ' + e.id).toLowerCase();
      return '<article class="dz-item dz-catitem" data-s="' + esc(s) + '"' + (q && s.indexOf(q) < 0 ? ' hidden' : '') + '><div class="dz-thb"><img class="dz-catth" loading="lazy" alt="" src="' + esc(cat.base + 'packs/' + e.id + '/thumb.webp') + '"></div>' +
        '<div class="dz-meta"><b>' + esc(e.name) + '</b><span>' + esc(e.category) + ' \u00b7 ' + e.n + (e.n === 1 ? ' cornice' : ' cornici') + ' \u00b7 ' + (Math.max(0.1, (e.bytes || 0) / 1048576)).toFixed(1) + ' MB</span>' + (e.layout ? '<span class="pill info">' + (e.layout === 'planeswalker' ? 'planeswalker' : 'saga') + '</span>' : '') + '</div>' +
        '<div class="btns">' + (inst ? (old ? '<button class="btn small primary" data-a="dz-cat-add" data-id="' + esc(e.id) + '"' + (busy ? ' disabled' : '') + ' title="Versione nuova: corone dedicate">' + (busy ? 'Scarico ' + busy + '\u2026' : 'Aggiorna') + '</button>' : '<span class="pill ok">Aggiunta</span>') + '<button class="btn small danger" data-a="dz-cat-del" data-id="' + esc(e.id) + '">Rimuovi</button>' :
          '<button class="btn small primary" data-a="dz-cat-add" data-id="' + esc(e.id) + '"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Scarico ' + busy + '\u2026' : 'Aggiungi') + '</button>') + '</div></article>';
    }).join('') + '</div>';
    return h;
  }

  /* ---------- cornice «esatta» della carta di partenza (e della stampa scelta) ---------- */
  var OLDSETS = ['lea', 'leb', '2ed', '3ed', 'arn', 'atq', 'leg', 'drk', 'fem', 'ice'];
  var UBSETS = ['ltr', 'ltc', 'who', 'whc', '40k', 'pip', 'acr', 'acc', 'fin', 'fic', 'tla', 'tle', 'spm', 'spe'];
  var SHOWSET = { sta: ['MysticalArchive', 'Mystical Archive'], wot: ['EnchantingTales', 'Enchanting Tales'], khm: ['Kaldheim-2', 'Kaldheim'], dmu: ['DMUStainedGlass', 'Stained Glass'], otp: ['BreakingNews', 'Breaking News'], pip: ['Pipboy', 'Pip-Boy'], who: ['TARDIS', 'TARDIS'], big: ['Vault', 'Vault'], cmr: ['CommanderLegends', 'Commander Legends'], dbl: ['DoubleFeature', 'Double Feature'] };
  function cand(b, id, name) { return { b: b, id: id, name: name }; }
  /* che cornice ha la carta di Scryfall? Restituisce { c: cornice, crown, holo, list } oppure null se non serve (token...) */
  function wantFrame(c, fi) {
    var bk = fi === 1, f0 = c.card_faces && !c.image_uris ? c.card_faces[bk && c.card_faces[1] ? 1 : 0] : c, fx = c.frame_effects || [], pt = c.promo_types || [];
    function has(e) { return fx.indexOf(e) >= 0; }
    var tl = String(f0.type_line || c.type_line || ''), fr = String(c.frame || '2015'), lay = String(c.layout || ''), set = String(c.set || '').toLowerCase();
    var bord = c.border_color === 'borderless', ext = has('extendedart'), full = !!c.full_art;
    if (lay === 'token' || lay === 'double_faced_token' || lay === 'emblem' || /\btoken\b/i.test(tl) && !/creature|artifact/i.test(tl)) return null;
    var out, isPW = /planeswalker/i.test(tl), isSaga = /\bsaga\b/i.test(tl), isLand = /\bland\b/i.test(tl), snow = /\bsnow\b/i.test(tl);
    var tf = lay === 'transform' || lay === 'double_faced_token', mdfc = lay === 'modal_dfc';
    if (fr === '1993') out = OLDSETS.indexOf(set) >= 0 ? cand('', 'ABU', 'Alpha/Beta/Unlimited') : cand('', 'Fourth', 'Fourth Edition');
    else if (fr === '1997') out = cand('', 'SeventhButFifth', 'Fifth Edition');
    else if (fr === 'future') out = cand('', 'FutureRegular', 'Future Shifted');
    else if (fr === '2003' && has('colorshifted')) out = cand('', 'Colorshifted', 'Colorshifted (Planar Chaos)');
    else if (fr === '2003') out = cand('m8', '8th', '8th Edition');
    else if (isPW) out = has('compleated') ? cand('', 'PlaneswalkerCompleated', 'Compleated') : bord ? cand('', 'PlaneswalkerBorderless', 'Borderless — Planeswalker') : ext ? cand('', 'PlaneswalkerBoxTopper', 'Extended Art — Planeswalker') : mdfc ? cand('', 'PlaneswalkerMDFC', 'MDFC') : tf ? (bk ? cand('', 'PlaneswalkerTransformBack', 'Transform (Back) — Planeswalker') : cand('', 'PlaneswalkerTransformFront', 'Transform (Front) — Planeswalker')) : cand('pw', 'PlaneswalkerRegular', 'Planeswalker');
    else if (isSaga) out = has('nyxtouched') ? cand('', 'SagaNyx', 'Saghe (Nyx)') : tf && !bk ? cand('', 'SagaDFC', 'Sagas (Front)') : cand('', 'SagaRegular', 'Saghe');
    else if (lay === 'adventure') out = cand('', 'Adventure', 'Adventures (Eldraine)');
    else if (lay === 'split') out = /\bfuse\b/i.test(String(c.oracle_text || '')) ? cand('', 'Fuse', 'Fuse Cards') : cand('', 'Split', 'Split Cards');
    else if (lay === 'flip') out = cand('', 'Flip', 'Flip (Kamigawa)');
    else if (lay === 'aftermath') out = cand('', 'Aftermath', 'Aftermath (Amonkhet)');
    else if (lay === 'prototype') out = ext ? cand('', 'PrototypeExtended', 'Prototype (Extended Art)') : cand('', 'Prototype', 'Prototype (Brothers’ War)');
    else if (has('etched')) out = has('nyxtouched') ? cand('', 'EtchedNyx', 'Etched (Nyx)') : snow ? cand('', 'EtchedSnow', 'Etched (Snow)') : cand('', 'Etched', 'Etched');
    else if (UBSETS.indexOf(set) >= 0 && !isLand) out = full || bord ? cand('', 'UBFull', 'Universes Beyond (Full art)') : ext ? cand('', 'UBExtendedArt', 'Universes Beyond (Extended art)') : cand('', 'UB', 'Universes Beyond');
    else if (mdfc) out = bord ? cand('', 'ModalBorderless', 'Borderless — Modali') : ext ? cand('', 'ModalExtended', 'Extended Art — Modali') : cand('', 'ModalRegular', 'Regular — Modali');
    else if (tf) out = bk ? (bord ? cand('', 'TransformBorderlessBack', 'Borderless (Back)') : ext ? cand('', 'TransformExtendedBack', 'Extended Art (Back)') : cand('', 'M15TransformBack', 'Transform (Back)')) :
      bord ? cand('', 'TransformBorderlessFront', 'Borderless (Front)') : ext ? cand('', 'TransformExtendedFront', 'Extended Art (Front)') : cand('', 'M15TransformFront', 'Transform (Front)');
    else if (isLand && (full || bord)) out = snow ? cand('', 'FullartBasicRoundBottom', 'Fullart Snow Basics') : cand('', 'TextlessBasics', 'Fullart Basics (THB)');
    else if (isLand && !/\b(?:legendary|artifact|creature)\b/i.test(tl) && /basic/i.test(tl)) out = cand('lands', 'M15Lands', 'Terre M15');
    else if (has('showcase') && SHOWSET[set]) out = cand('', SHOWSET[set][0], SHOWSET[set][1]);
    else if (has('showcase')) out = cand('', 'GenericShowcase', 'Borderless — Showcase');
    else if (bord && full) out = cand('', 'M15ClearTextboxes', 'Fullart');
    else if (bord) out = cand('', 'Borderless', 'Borderless (Alt)');
    else if (has('inverted')) out = cand('', 'FNM', 'FNM Promo (Inverted)');
    else if (ext) out = cand('bt', 'M15BoxTopper', 'Extended Art');
    else if (has('nyxtouched')) out = cand('nyx', 'M15Nyx', 'Nyx (Theros)');
    else if (has('miracle')) out = cand('miracle', '', 'Miracle');
    else if (has('devoid')) out = cand('devoid', '', 'Devoid');
    else if (snow) out = cand('snow', 'M15Snow', 'Neve (Kaldheim)');
    else out = cand('m15', 'M15RegularNew', 'M15 moderna');
    var stamp = String(c.security_stamp || '');
    /* costo ibrido con due soli colori (es. {W/U}): la cornice vera è metà e metà */
    var hy = [], mc = String(f0.mana_cost || c.mana_cost || ''), re = /\{([WUBRG])\/([WUBRG])\}/g, mm;
    while ((mm = re.exec(mc))) [mm[1], mm[2]].forEach(function (x) { if (hy.indexOf(x) < 0) hy.push(x); });
    var cols = (f0.colors || c.colors || []).join(''), mix = hy.length === 2 && cols.length === 2 && hy.every(function (x) { return cols.indexOf(x) >= 0; }) && !isPW && !isSaga ? hy.join('') : '';
    return { c: out, mix: mix, crown: has('legendary') && /\blegendary\b/i.test(tl) && !isPW && !isSaga ? 'legend' : '', holo: stamp === 'oval' ? 'color' : stamp === 'acorn' ? 'acorn' : '',
      list: pt.indexOf('thelist') >= 0 ? (fr === '2015' ? 'regular' : 'old') : '' };
  }
  function candGroup(x) {
    if (x.b && dz.frames.some(function (f) { return f.group === x.b; })) return x.b;
    if (x.id && installed(x.id)) return 'cc-' + x.id;
    return '';
  }
  /* imposta la cornice e gli extra della carta presa a modello; se il pacchetto manca chiede se scaricarlo */
  function applyFrameFor(c, target, fi) {
    var d = target || dz.cur; if (!d || !c) return;
    var w = wantFrame(c, fi); if (!w) return;
    d.crown = w.crown; d.holo = w.holo; d.list = w.list; d.mix = w.mix; d.cmix = w.mix;
    var g = candGroup(w.c);
    if (g) { pickFrame(d, 'auto:' + g); return; }
    if (w.c.id) {
      var q = dz.dlg || (dz.dlg = { items: [], busy: false, msg: '' });
      q.items = q.items.filter(function (it) { return it.d !== d; }); q.items.push({ d: d, x: w.c });
    }
    saveSoon(); H.render();
  }
  function dlgNames() {
    var seen = [], out = [];
    dz.dlg.items.forEach(function (it) { if (seen.indexOf(it.x.id) < 0) { seen.push(it.x.id); out.push('\u00ab' + esc(it.x.name) + '\u00bb'); } });
    return out;
  }
  function dlgHtml() {
    var q = dz.dlg, nm = dlgNames(), pl = nm.length > 1;
    return '<div class="bd-modal" data-a="dz-dlg-no"><div class="bd-mbox" data-a="dz-keep" role="dialog" aria-label="Cornice mancante"><div class="bd-mhead"><strong>' + (pl ? 'Cornici mancanti' : 'Cornice mancante') + '</strong></div>' +
      '<p>Per essere identica alla carta di riferimento ' + (pl ? 'servono le cornici ' : 'serve la cornice ') + nm.join(' e ') + ', che non ' + (pl ? 'sono ancora scaricate' : '\u00e8 ancora scaricata') + '. Vuoi ' + (pl ? 'scaricarle' : 'scaricarla') + ' ora?</p>' +
      (q.msg ? '<p class="hint" role="status">' + esc(q.msg) + '</p>' : '') +
      '<div class="btns"><button class="btn primary" data-a="dz-dlg-yes"' + (q.busy ? ' disabled' : '') + '>' + (q.busy ? 'Scarico\u2026' : 'Scarica e usa') + '</button><button class="btn" data-a="dz-dlg-no"' + (q.busy ? ' disabled' : '') + '>Tieni la cornice attuale</button></div></div></div>';
  }
  function dlgYes() {
    var q = dz.dlg; if (!q || q.busy) return;
    q.busy = true; q.msg = ''; H.render();
    var ids = []; q.items.forEach(function (it) { if (ids.indexOf(it.x.id) < 0 && !candGroup(it.x)) ids.push(it.x.id); });
    loadCatalog().then(function () {
      return ids.reduce(function (p, id) {
        return p.then(function () {
          var e = (cat.list || []).filter(function (x) { return x.id === id; })[0];
          if (!e) throw new Error('nocat');
          return installPack(e).then(function (ok) { if (!ok) throw new Error('fail'); });
        });
      }, Promise.resolve());
    }).then(function () {
      if (dz.dlg !== q) return;
      dz.dlg = null;
      q.items.forEach(function (it) { var g = candGroup(it.x); if (g) pickFrame(it.d, 'auto:' + g); });
      H.render();
    }).catch(function () { if (dz.dlg === q) { q.busy = false; q.msg = 'Non riesco a scaricarla: controlla la connessione e riprova.'; H.render(); } });
  }
  function printLabel(c) { return String(c.set_name || c.set || '').replace(/</g, '') + ' (' + String(c.set || '').toUpperCase() + ') \u00b7 #' + (c.collector_number || '?') + (c.released_at ? ' \u00b7 ' + String(c.released_at).slice(0, 4) : ''); }
  function printsHtml(d, net) {
    var P = dz.prints;
    if (P.list.length) {
      var cur = -1; P.list.forEach(function (c, i) { if (cur < 0 && String(c.set || '').toUpperCase() === d.set && String(c.collector_number || '') === d.num) cur = i; });
      var head = '<div class="dz-prhead"><span>Stampa: <b>' + (cur >= 0 ? esc(String(P.list[cur].set || '').toUpperCase() + ' #' + (P.list[cur].collector_number || '?')) : 'altra') + '</b> \u00b7 ' + P.list.length + ' disponibili</span>' +
        '<button class="btn small" data-a="dz-prints-toggle" aria-expanded="' + !!dz.printsOpen + '">' + (dz.printsOpen ? 'Chiudi' : 'Cambia stampa') + '</button></div>';
      if (!dz.printsOpen) return head;
      return head + '<div class="dz-ftiles dz-prgrid" role="group" aria-label="Stampe">' +
        P.list.map(function (c, i) {
          var f = c.card_faces && !c.image_uris ? c.card_faces[0] : c, im = f.image_uris || c.image_uris || {}, u = im.small || im.normal || '';
          return '<button class="dz-ftile" data-a="dz-print-pick" data-id="' + i + '" aria-pressed="' + (i === cur) + '" title="' + esc(printLabel(c)) + '">' +
            '<span class="dz-ftimg">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : '') + '</span>' +
            '<span class="dz-ftname">' + esc(String(c.set || '').toUpperCase() + ' #' + (c.collector_number || '?') + (c.released_at ? ' \u00b7 ' + String(c.released_at).slice(0, 4) : '')) + '</span></button>';
        }).join('') + '</div><p class="hint">Cambia arte, cornice, collezione, numero, rarit\u00e0, artista e testo di flavour con quelli della stampa scelta.</p>';
    }
    if (d.alterOf && net) return '<div class="btns"><button class="btn small" data-a="dz-prints"' + (P.busy ? ' disabled' : '') + '>' + (P.busy ? 'Cerco le stampe\u2026' : 'Scegli la stampa') + '</button></div>' + (P.msg ? '<p class="hint" role="status">' + esc(P.msg) + '</p>' : '');
    return '';
  }
  function listHtml() {
    var h = '<header class="vh"><h1>Designer</h1><p class="sub">Crea proxy personalizzate: carte tue, token, alter di carte esistenti. Poi le leghi a un mazzo e le stampi nel PDF.</p></header>';
    if (!DB.persistent() && dz.loaded) h += '<p class="warn">Qui dentro i design non si salvano sul dispositivo: restano finché la pagina è aperta. Usa l’app per Windows, l’APK o la versione web.</p>';
    h += '<section class="panel"><div class="btns"><button class="btn primary" data-a="dz-new" data-k="card">Nuova carta</button><button class="btn shop" data-a="dz-catalog">' + '<svg class="shop-ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.5 5 4.5h14l1.5 5"/><path d="M3.5 9.5a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 1.4-.6"/><path d="M5 12.5V20h14v-7.5"/><path d="M10 20v-4.5h4V20"/></svg>' + '<span>Catalogo cornici</span></button></div>' +
      '<div class="btns"><label class="btn small filebtn">Importa design<input type="file" accept=".json,application/json" data-c="dz-import" hidden></label>' +
      (dz.designs.length ? '<button class="btn small" data-a="dz-export-all">Esporta tutti</button>' : '') + '</div>' +
      (dz.msg ? '<p class="hint" role="status">' + esc(dz.msg) + '</p>' : '') + '</section>';
    if (!dz.loaded) return h + '<p class="hint">Carico i design…</p>';
    var names = folderNames();
    if (dz.folder !== '*' && dz.folder !== '' && names.indexOf(dz.folder) < 0) dz.folder = '*';
    /* cartelle */
    h += '<section class="panel dz-folders"><div class="chips" aria-label="Cartelle">' +
      chip('dz-f-pick', 'f', '*', 'Tutte (' + folderCount('*') + ')', dz.folder === '*') +
      (names.length ? chip('dz-f-pick', 'f', '', 'Senza cartella (' + dz.designs.filter(function (d) { return !d.folder; }).length + ')', dz.folder === '') : '') +
      names.map(function (n) { return chip('dz-f-pick', 'f', n, '\uD83D\uDCC1 ' + esc(n) + ' (' + folderCount(n) + ')', dz.folder === n); }).join('') +
      '<button class="chip" data-a="dz-f-new">+ Nuova cartella</button></div>';
    if (dz.fEdit) {
      h += '<div class="dz-srch"><input class="input" data-c="dz-ftext" maxlength="40" placeholder="Nome della cartella" value="' + esc(dz.fText) + '" autocomplete="off"><button class="btn" data-a="dz-f-save">' + (dz.fEdit === 'new' ? 'Crea' : 'Salva') + '</button><button class="btn" data-a="dz-f-cancel">Annulla</button></div>';
    } else if (dz.folder && dz.folder !== '*') {
      h += '<div class="btns"><button class="btn small" data-a="dz-f-rename">Rinomina cartella</button><button class="btn small danger' + (dz.fConfirm ? ' armed' : '') + '" data-a="dz-f-del">' + (dz.fConfirm ? 'Conferma: i design restano, senza cartella' : 'Elimina cartella') + '</button></div>';
    }
    h += '</section>';
    var shown = dz.designs.filter(function (d) { return dz.folder === '*' ? true : (d.folder || '') === dz.folder; });
    if (!dz.designs.length) return h + '<div class="empty"><p>Nessun design ancora. Parti da una carta nuova: puoi scriverla da zero oppure partire da una carta che esiste su Scryfall' + (H.available() ? '' : ' (serve internet: qui non disponibile)') + '.</p></div>';
    if (!shown.length) return h + '<div class="empty"><p>' + (dz.folder === '' ? 'Tutti i design sono in una cartella.' : 'Questa cartella è vuota: crea una carta qui, oppure spostaci un design dal menu «Cartella» di ogni carta.') + '</p></div>';
    h += '<div class="dz-grid">' + shown.map(function (d) {
      var fr = R.FRAMES.filter(function (f) { return f.id === d.frame; })[0];
      var used = deckUse(d.id), armed = dz.itemConfirm === d.id;
      return '<article class="dz-item"><button class="dz-thb" data-a="dz-open" data-id="' + esc(d.id) + '" aria-label="Apri ' + esc(d.name) + '"><canvas class="dz-th" data-id="' + esc(d.id) + '" width="186" height="260"></canvas></button>' +
        '<div class="dz-meta"><b>' + esc(d.name || 'Senza nome') + '</b><span>' + esc(fr ? fr.name : '') + (d.kind === 'alter' ? ' · alter' : d.kind === 'token' ? ' · token' : '') + (d.back ? ' · bifronte' : '') + '</span>' +
        (used ? '<span class="pill info">in ' + used + (used === 1 ? ' mazzo' : ' mazzi') + '</span>' : '') + '</div>' +
        (names.length ? '<select class="select dz-move" data-c="dz-move" data-id="' + esc(d.id) + '" aria-label="Cartella di ' + esc(d.name) + '"><option value="">Senza cartella</option>' + names.map(function (n) { return '<option value="' + esc(n) + '"' + (d.folder === n ? ' selected' : '') + '>\uD83D\uDCC1 ' + esc(n) + '</option>'; }).join('') + '</select>' : '') +
        '<div class="btns"><button class="btn small" data-a="dz-open" data-id="' + esc(d.id) + '">Modifica</button><button class="btn small" data-a="dz-dup" data-id="' + esc(d.id) + '">Duplica</button>' +
        '<button class="btn small danger' + (armed ? ' armed' : '') + '" data-a="dz-item-del" data-id="' + esc(d.id) + '">' + (armed ? 'Conferma' : 'Elimina') + '</button></div></article>';
    }).join('') + '</div>';
    return h;
  }
  function deckUse(id) {
    var n = 0; (H.decks() || []).forEach(function (dk) { if (dk.cards.some(function (c) { return c.design === id; })) n++; }); return n;
  }

  /* i due colori di una carta bicolore, nell'ordine in cui compaiono nel costo (altrimenti l'ordine WUBRG) */
  function pairOf(d) {
    var cs = String(d.colors || '').toUpperCase().replace(/[^WUBRG]/g, '').split('').filter(function (c, i, a) { return a.indexOf(c) === i; });
    if (cs.length !== 2) return '';
    var seen = [], re = /\{([^}]*)\}/g, m;
    while ((m = re.exec(String(d.cost || '').toUpperCase()))) m[1].split('/').forEach(function (x) { if (cs.indexOf(x) >= 0 && seen.indexOf(x) < 0) seen.push(x); });
    cs.forEach(function (c) { if (seen.indexOf(c) < 0) seen.push(c); });
    return seen.slice(0, 2).join('');
  }
  function biHtml(d) {
    var pr = pairOf(d), mode = d.mix ? 'both' : d.cmix ? 'crown' : 'none', nm = { W: 'bianco', U: 'blu', B: 'nero', R: 'rosso', G: 'verde' };
    var h = '';
    if (pr) {
      h += '<div class="lbl"><span class="lbl-t">Carta a due colori (' + nm[pr[0]] + ' e ' + nm[pr[1]] + ')</span><div class="chips" aria-label="Cornice a due colori">' +
        chip('dz-bi', 'k', 'none', 'Normale (dorata)', mode === 'none') + chip('dz-bi', 'k', 'crown', 'Solo la corona a due colori', mode === 'crown') + chip('dz-bi', 'k', 'both', 'Cornice e corona a due colori', mode === 'both') + '</div>' +
        '<p class="hint">La parte a due colori sfuma da sinistra a destra' + (R.hasOverlays() ? '; la corona si attiva in \u00abExtra della cornice\u00bb' : '') + '.</p></div>';
    }
    return h + '<details class="dz-adv"' + (!pr && (d.mix || d.cmix) ? ' open' : '') + '><summary>' + (pr ? 'Scegli i colori a mano' : 'Cornice a due colori a mano') + '</summary>' + mixRow('Cornice a due colori (sfumata)', 'mix', d.mix) + '</details>';
  }
  var MIXC = [['', '\u2014'], ['W', 'Bianco'], ['U', 'Blu'], ['B', 'Nero'], ['R', 'Rosso'], ['G', 'Verde']];
  function mixRow(title, k, v) {
    var m = R.mixOf(v) || '', a = m[0] || '', b = m[1] || '';
    function one(side, cur) { return '<select class="select" data-c="dz-mix" data-k="' + k + '" data-side="' + side + '" aria-label="' + esc(title) + (side ? ': destra' : ': sinistra') + '">' + MIXC.map(function (o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; }
    return '<div class="lbl"><span class="lbl-t">' + esc(title) + '</span><div class="dz-row">' + lbl('Sinistra', one(0, a)) + lbl('Destra', one(1, b)) + '</div>' + (m ? '' : '<p class="hint">Scegli due colori diversi: il secondo compare da destra con una sfumatura (come i bicolori e gli ibridi).</p>') + '</div>';
  }
  var TABS = [['testo', 'Testo'], ['aspetto', 'Aspetto'], ['arte', 'Arte'], ['altro', 'Mazzo']];
  function tabPanel(id, inner) { return '<div class="dz-tp" data-tab="' + id + '" role="tabpanel"' + (dz.tab === id ? '' : ' hidden') + '>' + inner + '</div>'; }
  function editHtml() {
    var d = dz.cur; if (!d) return listHtml();
    var net = H.available(), L = R.LAYOUT[d.frame], pk = R.paletteKey(d), cs = String(d.colors || '').toUpperCase();
    var root = dz.root || d, isBack = d !== root && d === root.back;
    var h = '<header class="vh"><button class="back" data-a="dz-back">← I miei design</button><h1>' + esc(d.name || 'Senza nome') + (isBack ? ' <span class="pill info">retro</span>' : root.back ? ' <span class="pill info">fronte</span>' : '') + '</h1></header>';
    /* anteprima */
    h += '<div class="dz-edit"><div class="dz-prev"><canvas id="dz-cv" width="' + W + '" height="' + HH + '" aria-label="Anteprima della carta"></canvas>' +
      '<div class="dz-acts"><button class="btn small primary" data-a="dz-flip" aria-label="Trasforma la carta">⟲ ' + (!root.back ? 'Aggiungi il retro' : isBack ? 'Mostra il fronte' : 'Mostra il retro') + '</button>' +
      '<button class="btn small" data-a="dz-png" title="Scarica PNG' + (isBack ? ' del retro' : '') + '">PNG</button><button class="btn small" data-a="dz-jpg" title="Scarica JPG per stampa' + (isBack ? ' del retro' : '') + '">JPG</button></div>' +
      '<p class="hint dz-tip">Sull’arte: trascina per spostare, rotella per ingrandire.</p></div>';
    h += '<div class="dz-form">';
    /* parti da una carta esistente (compatto) */
    if (!isBack) {
      var P = dz.prints, curP = -1;
      P.list.forEach(function (c, i) { if (curP < 0 && String(c.set || '').toUpperCase() === d.set && String(c.collector_number || '') === d.num) curP = i; });
      h += '<section class="panel dz-import"><div class="dz-srch"><input class="input" data-c="dz-q" aria-label="Parti da una carta esistente" placeholder="' + (d.kind === 'alter' ? 'Carta di partenza' : 'Parti da una carta esistente (es. Lightning Bolt)') + '" value="' + esc(dz.search.q) + '" autocomplete="off"><button class="btn" data-a="dz-alter"' + (dz.search.busy || !net ? ' disabled' : '') + '>' + (dz.search.busy ? 'Cerco…' : 'Importa') + '</button></div>' +
        (net ? '' : '<p class="hint">Serve internet: non disponibile dentro Claude.</p>') +
        (dz.search.msg ? '<p class="hint" role="status">' + esc(dz.search.msg) + '</p>' : '') +
        printsHtml(d, net) + '</section>';
    }
    /* schede */
    h += '<div class="dz-tabs" role="tablist" aria-label="Sezioni dell’editor">' + TABS.map(function (t) { return '<button class="dz-tab" role="tab" data-a="dz-tab" data-v="' + t[0] + '" aria-selected="' + (dz.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';

    /* --- Testo --- */
    var cm = R.paletteKey(d);
    var tText = '<section class="panel">' +
      lbl('Nome', inp('name', d.name, 'Nome della carta')) +
      (L && L.noCost ? '' : costHtml(d)) +
      lbl('Tipo', inp('type', d.type, 'Creature — Wizard')) +
      '<label class="lbl">' + (L && L.walker ? 'Abilità (una per riga: «+1: testo», «−2: testo»)' : L && L.saga ? 'Capitoli (una riga per capitolo: «I — testo»)' : 'Testo delle regole') + '<textarea class="textarea dz-ta" data-c="dz-f" data-k="rules" rows="5">' + esc(d.rules) + '</textarea></label>' +
      '<div class="dz-syms" aria-label="Inserisci simbolo">' + SYMS.map(function (x) { return '<button class="chip small" data-a="dz-sym" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
      (L && (L.walker || L.saga) ? '' : '<label class="lbl">Testo di flavour (corsivo)<textarea class="textarea dz-ta" data-c="dz-f" data-k="flavor" rows="2">' + esc(d.flavor) + '</textarea></label>') +
      '<div class="dz-row">' + (usesPT(d) ? lbl(L.walker ? 'Lealtà' : 'Forza/Costituzione', inp('pt', d.pt, L.walker ? '4' : '2/3')) : '') + lbl('Rarità', sel('rarity', d.rarity, [['common', 'Comune'], ['uncommon', 'Non comune'], ['rare', 'Rara'], ['mythic', 'Mitica']])) + '</div>' +
      '<div><span class="lbl-t">Colori della carta</span><div class="chips">' + 'WUBRG'.split('').map(function (c) { return chip('dz-col', 'colors', c, {W: 'Bianco', U: 'Blu', B: 'Nero', R: 'Rosso', G: 'Verde'}[c], cs.indexOf(c) >= 0); }).join('') + '</div><p class="hint">Decidono il colore della cornice quando è su «Auto» (ora: ' + esc(R.PAL[cm].name) + ').</p></div></section>';
    tText += '<section class="panel"><h3 class="dz-h">Stampa e simbolo del set</h3>' +
      '<div class="dz-row">' + lbl('Collezione', inp('set', d.set, 'CST')) + lbl('Numero', inp('num', d.num, '001')) + lbl('Artista', inp('artist', d.artist, 'Nome')) + '</div>' +
      '<div class="dz-field"><span class="lbl-t">Simbolo del set (accanto al tipo)</span><div class="btns"><label class="btn small filebtn">' + (d.setImg ? 'Cambia simbolo' : 'Carica il tuo simbolo') + '<input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" data-c="dz-setsym" hidden></label>' +
      (d.setImg ? '<button class="btn small" data-a="dz-setsym-del">Torna alla gemma</button>' : '') + '</div>' +
      (d.setImg ? lbl('Colore', sel('setTint', d.setTint, [['', 'Com’è nell’immagine'], ['rarity', 'Colore della rarità']])) : '<p class="hint">Un logo o un simbolo tuo (meglio PNG o SVG con sfondo trasparente) al posto della gemma di rarità.</p>') + '</div>' +
      (wmOptions() ? lbl('Filigrana nella casella di testo', sel('watermark', d.watermark, wmOptions())) : '') + '</section>';
    h += tabPanel('testo', tText);

    /* --- Aspetto --- */
    var tLook = '<section class="panel"><div class="dz-row two">' +
      lbl('Stile', sel('frame', d.frame, R.FRAMES.map(function (f) { return [f.id, f.name]; }))) +
      lbl('Colore', sel('palette', d.palette, [['auto', 'Auto (dai colori)']].concat(R.PAL_ORDER.map(function (k) { return [k, R.PAL[k].name]; })))) +
      lbl('Bordo', sel('border', d.border, [['black', 'Nero'], ['white', 'Bianco'], ['silver', 'Argento'], ['gold', 'Oro']])) +
      lbl('Angoli', sel('corners', d.corners, [['round', 'Arrotondati'], ['square', 'Quadrati']])) + '</div>' +
      biHtml(d) + '</section>';
    tLook += '<section class="panel"><h3 class="dz-h">Cornice a immagine</h3><div class="lbl"><span class="lbl-t">Segue i colori della carta</span>' + frameTiles(d) + '</div>' +
      (d.frameImg ? '<div class="dz-row">' + lbl('Colore del testo', sel('ink', d.ink, [['dark', 'Scuro'], ['light', 'Chiaro']])) + '</div>' : '') +
      '<div class="btns"><label class="btn small filebtn">Importa cornici…<input type="file" accept="image/png,image/webp,.json,application/json" data-c="dz-framefile" multiple hidden></label>' +
      '<button class="btn small shop" data-a="dz-catalog">' + '<svg class="shop-ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.5 5 4.5h14l1.5 5"/><path d="M3.5 9.5a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 1.4-.6"/><path d="M5 12.5V20h14v-7.5"/><path d="M10 20v-4.5h4V20"/></svg>' + '<span>Catalogo cornici</span></button>' +
      (d.frameImg ? '<button class="btn small danger" data-a="dz-frame-del">' + (/^auto:/.test(d.frameImg) ? 'Elimina il pacchetto' : 'Elimina questa cornice') + '</button>' : '') + '</div>' +
      (dz.res.length ? '<p class="hint">Risorse caricate: simboli di mana, font, filigrane e grafiche. <button class="linkbtn" data-a="dz-res-del">Rimuovile</button></p>' : '') + '</section>';
    if (R.hasOverlays() && d.frameImg) {
      var yn = [['', 'No'], ['1', 'Sì']];
      tLook += '<section class="panel"><h3 class="dz-h">Extra della cornice</h3>' +
        '<div class="dz-row">' + lbl('Corona leggendaria', sel('crown', d.crown, [['', 'Nessuna'], ['legend', 'Corona'], ['floating', 'Corona fluttuante']])) +
        lbl('Corona interna', sel('inner', d.inner, [['', 'Nessuna'], ['nyx', 'Nyx'], ['comp', 'Compagno']])) + '</div>' +
        (d.crown ? mixRow('Corona a due colori (sfumata)', 'cmix', d.cmix) : '') +
        '<div class="dz-row">' + lbl('Stampo olografico', sel('holo', d.holo, [['', 'Nessuno'], ['color', 'A colori'], ['plain', 'Semplice'], ['gray', 'Grigio'], ['acorn', 'Ghianda'], ['alchemy', 'Alchemy']])) +
        lbl('«The List»', sel('list', d.list, [['', 'Nessuno'], ['regular', 'Post-M15'], ['old', 'Pre-M15']])) + '</div>' +
        '<div class="dz-row">' + lbl('Forza/Costituzione scura', sel('darkpt', d.darkpt, yn)) + lbl('Pips dell’identità di colore', sel('pips', d.pips, yn)) + '</div>' +
        '<p class="hint">Le corone e gli stampi seguono il colore della carta; i pips usano i colori della carta.</p></section>';
    }
    h += tabPanel('aspetto', tLook);

    /* --- Arte --- */
    h += tabPanel('arte', '<section class="panel"><div class="btns"><label class="btn small primary filebtn">' + (d.art.id ? 'Cambia immagine' : 'Carica immagine') + '<input type="file" accept="image/*" data-c="dz-artfile" hidden></label>' +
      (d.art.id ? '<button class="btn small" data-a="dz-art-del">Togli</button><button class="btn small" data-a="dz-art-reset">Ricentra</button>' : '') + '</div>' +
      (d.art.id ? '<label class="lbl">Zoom' + rng('s', d.art.s, 0.4, 4, 0.01) + '</label><label class="lbl">Sposta in orizzontale' + rng('x', d.art.x, -500, 500, 1) + '</label><label class="lbl">Sposta in verticale' + rng('y', d.art.y, -500, 500, 1) + '</label>' : '<p class="hint">Qualsiasi immagine: viene ridotta e salvata solo su questo dispositivo.</p>') + '</section>');

    /* --- Mazzo e file --- */
    var tMore = '';
    if (isBack) tMore = '<section class="panel"><p class="hint">Stai modificando il retro della carta. Cartella, mazzo, duplica ed elimina sono sul fronte.</p><div class="btns"><button class="btn small danger" data-a="dz-back-del">Togli il retro</button></div></section>';
    else {
      var fnames = folderNames();
      if (fnames.length) tMore += '<section class="panel">' + lbl('Cartella', sel('folder', d.folder, [['', 'Senza cartella']].concat(fnames.map(function (n) { return [n, '📁 ' + n]; })))) + '</section>';
      tMore += deckPanel(d);
      tMore += '<section class="panel"><div class="btns"><button class="btn small" data-a="dz-dup" data-id="' + esc(d.id) + '">Duplica</button><button class="btn small" data-a="dz-export-one">Esporta design (.json)</button>' +
        (d.back ? '<button class="btn small danger" data-a="dz-back-del">Togli il retro</button>' : '') +
        '<button class="btn small danger' + (dz.confirm === 'del' ? ' armed' : '') + '" data-a="dz-del" data-cf="1">' + (dz.confirm === 'del' ? 'Conferma eliminazione' : 'Elimina design') + '</button></div></section>';
    }
    h += tabPanel('altro', tMore);
    return h + '</div></div>';
  }
  function deckPanel(d) {
    var decks = (H.decks() || []).filter(function (x) { return x.kind === 'deck'; });
    var bound = (H.decks() || []).filter(function (x) { return x.cards.some(function (c) { return c.design === d.id; }); });
    var cur = dz.bind || (dz.bind = { deckId: decks[0] ? decks[0].id : '', card: '', qty: 1 });
    var dk = decks.filter(function (x) { return x.id === cur.deckId; })[0] || decks[0];
    if (dk && cur.deckId !== dk.id) cur.deckId = dk.id;
    var h = '<section class="panel"><h3 class="dz-h">Nel mazzo</h3>';
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
    var body = dz.view === 'edit' && dz.cur ? editHtml() : dz.view === 'catalog' ? catalogHtml() : listHtml();
    return body + (dz.picker ? pickerHtml() : '') + (dz.dlg ? dlgHtml() : '');
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
  function loadPrints(uri) {
    var d = dz.cur, P = dz.prints; if (!d || !uri) return;
    P.busy = true; P.msg = ''; H.render();
    fetchJson(uri).then(function (r) {
      var list = (r && r.data || []).filter(function (c) { var f = c.card_faces && !c.image_uris ? c.card_faces[0] : c; return f && f.image_uris && f.image_uris.art_crop; });
      if (dz.cur === d) { dz.prints = { list: list, busy: false, msg: list.length ? '' : 'Nessuna stampa trovata.' }; H.render(); }
    }).catch(function () { if (dz.cur === d) { dz.prints = { list: [], busy: false, msg: 'Non riesco a caricare le stampe: controlla la connessione e riprova.' }; H.render(); } });
  }
  function applyPrint(c) {
    var d = dz.cur; if (!d || !c) return;
    var f = c.card_faces && !c.image_uris ? c.card_faces[0] : c;
    d.set = String(c.set || '').toUpperCase(); d.num = String(c.collector_number || ''); d.rarity = R.RARITY[c.rarity] ? c.rarity : d.rarity;
    d.artist = f.artist || c.artist || ''; d.flavor = f.flavor_text || '';
    dz.search.msg = 'Stampa scelta: ' + printLabel(c) + '.';
    applyFrameFor(c);
    var bf = d.back && c.card_faces && !c.image_uris && c.card_faces[1];
    if (bf) { d.back.set = d.set; d.back.num = d.num; d.back.rarity = d.rarity; d.back.artist = bf.artist || c.artist || ''; d.back.flavor = bf.flavor_text || ''; applyFrameFor(c, d.back, 1); }
    var art = (f.image_uris || c.image_uris || {}).art_crop, bart = bf && (bf.image_uris || {}).art_crop;
    function backArt() { return bart ? fetchBlob(bart).then(function (b) { return setArt(b, d.back); }, function () { return null; }) : null; }
    if (!art) { saveNow(); H.render(); backArt(); return; }
    dz.search.busy = true; H.render();
    fetchBlob(art).then(function (b) { dz.search.busy = false; return setArt(b, d); }, function () { dz.search.busy = false; dz.search.msg += ' L\u2019arte non si \u00e8 scaricata: resta quella di prima.'; saveNow(); H.render(); }).then(backArt);
  }
  /* i campi di una faccia di Scryfall, pronti per un design */
  function faceFields(c, f, cur) {
    var cols = (f.colors || c.colors || []).join(''), tl = String(f.type_line || c.type_line || ''), pt = f.power != null ? f.power + '/' + f.toughness : (f.loyalty || '');
    var frame = /planeswalker/i.test(tl) ? 'planeswalker' : /saga/i.test(tl) ? 'saga' : c.layout === 'token' ? 'token' : (cur === 'planeswalker' || cur === 'saga' || cur === 'token' ? 'classic' : cur);
    return { name: f.name || c.name, cost: f.mana_cost || '', type: tl, rules: String(f.oracle_text || ''), flavor: f.flavor_text || '', pt: String(pt || ''), colors: cols, artist: f.artist || c.artist || '', frame: frame, palette: 'auto' };
  }
  function alterFrom(name) {
    var d = dz.cur; if (!d || !name.trim()) return;
    dz.search.busy = true; dz.search.msg = ''; H.render();
    fetchJson('https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(name.trim())).then(function (c) {
      var f = c.card_faces && !c.image_uris ? c.card_faces[0] : c;
      var ff = faceFields(c, f, d.frame); Object.keys(ff).forEach(function (k) { d[k] = ff[k]; });
      d.rarity = R.RARITY[c.rarity] ? c.rarity : 'common'; d.set = String(c.set || '').toUpperCase(); d.num = String(c.collector_number || '');
      d.alterOf = c.name; d.kind = d.kind === 'card' ? 'alter' : d.kind;
      applyFrameFor(c);
      /* carta bifronte: il retro è la seconda faccia */
      var bf = c.card_faces && !c.image_uris && c.card_faces.length > 1 && /^(transform|modal_dfc)$/.test(c.layout || '') ? c.card_faces[1] : null, bart = null;
      if (bf) {
        if (!d.back) d.back = makeBack(d);
        var bb = faceFields(c, bf, d.back.frame); Object.keys(bb).forEach(function (k) { d.back[k] = bb[k]; });
        d.back.rarity = d.rarity; d.back.set = d.set; d.back.num = d.num; d.back.border = d.border; d.back.corners = d.corners;
        applyFrameFor(c, d.back, 1);
        bart = (bf.image_uris || {}).art_crop;
      } else if (d.back) { dropBackArt(d); d.back = null; }
      var art = (f.image_uris || c.image_uris || {}).art_crop;
      dz.search.msg = 'Importata: ' + (c.name || name) + (bf ? ' (carta bifronte: usa «Trasforma» per vedere il retro)' : '') + '.';
      dz.prints = { list: [], busy: false, msg: '' }; if (c.prints_search_uri) setTimeout(function () { loadPrints(c.prints_search_uri); }, 0);
      function backArt() { return bart ? fetchBlob(bart).then(function (b) { return setArt(b, d.back); }, function () { return null; }) : null; }
      if (!art) { dz.search.busy = false; saveNow(); H.render(); return backArt(); }
      return fetchBlob(art).then(function (b) { dz.search.busy = false; return setArt(b, d); }, function () { dz.search.busy = false; dz.search.msg += ' Il testo è dentro, ma l’arte non si è scaricata: caricane una tua.'; saveNow(); H.render(); }).then(backArt);
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
    DB.del('designs', id); if (d && d.art.id) { DB.del('art', d.art.id); delete artCache[d.art.id]; } if (d) dropSetImg(d); dropBackArt(d);
  }

  /* ---------- esporta / importa ---------- */
  function blobToDataUrl(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.onerror = function () { res(''); }; r.readAsDataURL(b); }); }
  function dataUrlToBlob(u) {
    if (u && typeof Blob !== 'undefined' && u instanceof Blob) return u;
    var m = /^data:([^;,]+);base64,(.*)$/.exec(u || ''); if (!m) return null;
    var bin = atob(m[2]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  }
  function packArt(face) { return face && face.art.id ? DB.get('art', face.art.id).then(function (b) { return b ? blobToDataUrl(b) : ''; }) : Promise.resolve(''); }
  function packSym(face) { return face && face.setImg ? DB.get('art', face.setImg).then(function (b) { return b ? blobToDataUrl(b) : ''; }) : Promise.resolve(''); }
  function packOne(d) { return Promise.all([packArt(d), packArt(d.back), packSym(d), packSym(d.back)]).then(function (u) { return { design: d, art: u[0], backArt: u[1], setSym: u[2], backSetSym: u[3] }; }); }
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
          var sb = dataUrlToBlob(it.setSym), sid = sb ? uid('a') : ''; d.setImg = sid; if (sb) p = p.then(function () { return DB.put('art', sb, sid); });
          var bb = dataUrlToBlob(it.backArt);
          if (d.back) {
            var bid = bb ? uid('a') : '', bsrc = it.design && it.design.back && it.design.back.art || {};
            d.back.art = { id: bid, x: +bsrc.x || 0, y: +bsrc.y || 0, s: +bsrc.s || 1 }; d.back.id = d.id; d.back.frameImg = /^auto:/.test(d.back.frameImg) ? d.back.frameImg : '';
            if (bb) p = p.then(function () { return DB.put('art', bb, bid); });
            var bsb = dataUrlToBlob(it.backSetSym), bsid = bsb ? uid('a') : ''; d.back.setImg = bsid; if (bsb) p = p.then(function () { return DB.put('art', bsb, bsid); });
          }
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
      case 'dz-frame-pick': if (d) pickFrame(d, v); break;
      case 'dz-costopen': dz.costOpen = true; H.render(); setTimeout(function () { var el2 = document.querySelector('[data-c="dz-f"][data-k="cost"]'); if (el2) el2.focus(); }, 0); break;
      case 'dz-mana':
        if (d) {
          var mo = parseCost(d.cost); mo[v] = Math.max(0, Math.min(v === 'N' ? 20 : 9, (mo[v] || 0) + (k === '-' ? -1 : 1)));
          d.cost = buildCost(mo);
          var cc = 'WUBRG'.split('').filter(function (x) { return new RegExp('\\{[^}]*' + x + '[^}]*\\}').test(d.cost.toUpperCase()); }).join('');
          d.colors = cc; saveSoon(); H.render();
        } break;
      case 'dz-catalog': dz.view = 'catalog'; dz.cur = null; window.scrollTo(0, 0); H.render(); break;
      case 'dz-cat-retry': cat.msg = ''; cat.list = null; H.render(); break;
      case 'dz-cat-c': cat.c = String(v == null ? '' : v); H.render(); break;
      case 'dz-cat-add': installPack((cat.list || []).filter(function (e) { return e.id === id; })[0]); break;
      case 'dz-cat-del': dropGroup('cc-' + id); H.toast('Pacchetto rimosso.'); H.render(); break;
      case 'dz-open': var t = byId(id); if (t) editDesign(t); break;
      case 'dz-back': saveNow(); dz.view = 'list'; dz.cur = null; dz.root = null; dz.confirm = ''; window.scrollTo(0, 0); H.render(); break;
      case 'dz-dup':
        var src = byId(id) || dz.root || d; if (!src) break;
        saveNow();
        var c = clone(src); c.id = uid('z'); c.name = src.name + ' (copia)'; c.createdAt = c.updatedAt = Date.now(); if (c.back) c.back.id = c.id;
        function copyArt(srcFace, dstFace) {
          if (!srcFace) return Promise.resolve();
          function one(oldId, set) { if (!oldId) return Promise.resolve(); return DB.get('art', oldId).then(function (bl) { if (!bl) { set(''); return; } var nid = uid('a'); return DB.put('art', bl, nid).then(function () { set(nid); }); }); }
          return one(srcFace.art.id, function (n) { dstFace.art.id = n; }).then(function () { return one(srcFace.setImg, function (n) { dstFace.setImg = n; }); });
        }
        copyArt(src, c).then(function () { return copyArt(src.back, c.back); }).then(function () {
          dz.designs.unshift(c); return DB.put('designs', clone(c));
        }).then(function () { if (dz.view === 'edit') editDesign(c); else H.render(); });
        break;
      case 'dz-set': if (d) { d[k] = v; if (k === 'frame') { var L = R.LAYOUT[v]; if (L && !L.pt) d.pt = d.pt; } saveSoon(); H.render(); } break;
      case 'dz-col': if (d) { var cs = String(d.colors || '').toUpperCase(); d.colors = cs.indexOf(v) >= 0 ? cs.replace(v, '') : 'WUBRG'.split('').filter(function (x) { return cs.indexOf(x) >= 0 || x === v; }).join(''); saveSoon(); H.render(); } break;
      case 'dz-sym': insertSym(v); break;
      case 'dz-png': if (d) { saveNow(); renderBlob(d.id, { type: 'image/png', face: dz.cur === dz.root ? 'front' : 'back' }).then(function (b) { return download(b, fname(d, '.png')); }).then(function (ok) { if (ok === false) H.toast('Download non disponibile qui.'); }, function () { H.toast('Non riesco a creare l’immagine.'); }); } break;
      case 'dz-jpg': if (d) { saveNow(); renderBlob(d.id, { type: 'image/jpeg', square: true, face: dz.cur === dz.root ? 'front' : 'back' }).then(function (b) { return download(b, fname(d, '.jpg')); }).then(function (ok) { if (ok === false) H.toast('Download non disponibile qui.'); }, function () { H.toast('Non riesco a creare l’immagine.'); }); } break;
      case 'dz-art-del': if (d && d.art.id) { var oid = d.art.id; d.art = { id: '', x: 0, y: 0, s: 1 }; dz.artImg = null; DB.del('art', oid); delete artCache[oid]; saveNow(); H.render(); } break;
      case 'dz-art-reset': if (d) { d.art.x = 0; d.art.y = 0; d.art.s = 1; saveSoon(); H.render(); } break;
      case 'dz-alter': if (d) alterFrom(dz.search.q || d.name); break;
      case 'dz-prints': if (d && d.alterOf) loadPrints('https://api.scryfall.com/cards/search?order=released&unique=prints&q=' + encodeURIComponent('!"' + d.alterOf + '"')); break;
      case 'dz-item-del':
        if (dz.itemConfirm === id) { dropDesign(id); dz.itemConfirm = ''; } else dz.itemConfirm = id;
        H.render(); break;
      case 'dz-f-pick': dz.folder = k === 'f' ? String(v == null ? '' : v) : '*'; dz.fEdit = null; dz.fConfirm = false; dz.itemConfirm = ''; H.render(); break;
      case 'dz-f-new': dz.fEdit = 'new'; dz.fText = ''; dz.fConfirm = false; H.render(); break;
      case 'dz-f-rename': dz.fEdit = 'rename'; dz.fText = dz.folder; dz.fConfirm = false; H.render(); break;
      case 'dz-f-cancel': dz.fEdit = null; H.render(); break;
      case 'dz-f-save': saveFolder(); break;
      case 'dz-f-del':
        if (dz.fConfirm) {
          var gone = dz.folder; dz.folders = dz.folders.filter(function (n) { return n !== gone; }); saveFolders();
          dz.designs.forEach(function (x) { if (x.folder === gone) { x.folder = ''; DB.put('designs', clone(x)); } });
          dz.folder = '*'; dz.fConfirm = false;
        } else dz.fConfirm = true;
        H.render(); break;
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
          gone.forEach(function (g) { delete dz.frameImgs[g]; forgetUrl(g); DB.del('frames', g); });
          saveNow(); H.render();
        } break;
      case 'dz-export-one': if (d) { saveNow(); exportDesigns([d], fname(d, '.coglio-design.json')); } break;
      case 'dz-export-all': exportDesigns(dz.designs, 'coglio-design.json'); break;
      case 'dz-bind': openPicker(el.getAttribute('data-deck'), el.getAttribute('data-name')); break;
      case 'dz-unbind': unbind(el.getAttribute('data-deck'), el.getAttribute('data-name')); H.render(); break;
      case 'dz-pick-close': dz.picker = null; H.render(); break;
      case 'dz-flip': flip(); break;
      case 'dz-tab':
        dz.tab = v;
        [].slice.call(document.querySelectorAll('.dz-tab')).forEach(function (b2) { b2.setAttribute('aria-selected', String(b2.getAttribute('data-v') === v)); });
        [].slice.call(document.querySelectorAll('.dz-tp')).forEach(function (p2) { p2.hidden = p2.getAttribute('data-tab') !== v; });
        break;
      case 'dz-prints-toggle': dz.printsOpen = !dz.printsOpen; H.render(); break;
      case 'dz-setsym-del': if (d) { dropSetImg(d); saveNow(); H.render(); } break;
      case 'dz-bi':
        if (d) {
          var pr2 = pairOf(d); if (!pr2 && v !== 'none') break;
          d.mix = v === 'both' ? pr2 : ''; d.cmix = v === 'both' || v === 'crown' ? pr2 : '';
          if (v !== 'none' && !d.crown && /\blegendary\b/i.test(d.type || '') && R.hasOverlays()) d.crown = 'legend';
          saveSoon(); H.render();
        } break;
      case 'dz-back-del': removeBack(); break;
      case 'dz-dlg-yes': dlgYes(); break;
      case 'dz-dlg-no': if (dz.dlg && !dz.dlg.busy) { dz.dlg = null; H.render(); } break;
      case 'dz-print-pick': { var pc = dz.prints.list[parseInt(id, 10)]; dz.printsOpen = false; if (pc && d) applyPrint(pc); break; }
      case 'dz-keep': break;
      case 'dz-pick': if (dz.picker) { var pd = byId(id); if (pd && bindCard(pd, dz.picker.deckId, dz.picker.cardName)) { dz.picker = null; H.render(); } } break;
      case 'dz-pick-new':
        if (dz.picker) {
          var pk = dz.picker, nd = norm(R.defaults('card')); nd.id = uid('z'); nd.name = pk.cardName; nd.createdAt = nd.updatedAt = Date.now(); dz.picker = null;
          dz.designs.unshift(nd); dz.bind = { deckId: pk.deckId, card: pk.cardName, qty: 1 }; saveNow(); H.ui.view = 'designer'; editDesign(nd);
        } break;
    }
  }
  function saveFolder() {
    var name = String(dz.fText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) { dz.msg = 'Scrivi un nome per la cartella.'; H.render(); return; }
    var names = folderNames(), old = dz.fEdit === 'rename' ? dz.folder : null;
    if (name !== old && names.indexOf(name) >= 0) { dz.msg = 'Esiste gi\u00e0 una cartella con questo nome.'; H.render(); return; }
    dz.msg = '';
    if (old != null) {
      dz.folders = dz.folders.filter(function (n) { return n !== old; });
      dz.designs.forEach(function (x) { if (x.folder === old) { x.folder = name; DB.put('designs', clone(x)); } });
    }
    if (dz.folders.indexOf(name) < 0) dz.folders.push(name);
    saveFolders(); dz.folder = name; dz.fEdit = null; H.render();
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
    if (c === 'dz-f' && d) { d[el.getAttribute('data-k')] = el.value; schedulePreview(); saveSoon(); if (el.getAttribute('data-k') === 'cost') { var mm = document.getElementById('dz-mana'); if (mm) mm.innerHTML = manaInner(d); } if (el.getAttribute('data-k') === 'name') { var h1 = document.querySelector('.vh h1'); if (h1) h1.textContent = el.value || 'Senza nome'; } }
    else if (c === 'dz-art' && d) { d.art[el.getAttribute('data-k')] = parseFloat(el.value) || 0; schedulePreview(); saveSoon(); }
    else if (c === 'dz-q') dz.search.q = el.value;
    else if (c === 'dz-ftext') dz.fText = el.value;
    else if (c === 'dz-catq') { cat.q = el.value; var q = cat.q.toLowerCase(); [].forEach.call(document.querySelectorAll('.dz-catitem'), function (it) { it.hidden = !!q && it.getAttribute('data-s').indexOf(q) < 0; }); }
    else if (c === 'dz-bqty' && dz.bind) dz.bind.qty = el.value;
  }
  function change(c, el) {
    var d = dz.cur;
    if (c === 'dz-f' && d) { d[el.getAttribute('data-k')] = el.value; saveSoon(); if (el.tagName === 'SELECT') H.render(); else schedulePreview(); }
    else if (c === 'dz-mix' && d) {
      var kk = el.getAttribute('data-k'), side = parseInt(el.getAttribute('data-side'), 10), cur = R.mixOf(d[kk]) || '', ca = cur[0] || '', cb = cur[1] || '';
      if (side) cb = el.value; else ca = el.value;
      d[kk] = ca && cb && ca !== cb ? ca + cb : ''; saveSoon(); H.render();
      if (!d[kk] && ca && cb && ca === cb) H.toast('Scegli due colori diversi.');
    }
    else if (c === 'dz-setsym') { if (el.files && el.files[0]) setSymFile(el.files[0]); el.value = ''; }
    else if (c === 'dz-artfile') { if (el.files && el.files[0]) setArt(el.files[0]); }
    else if (c === 'dz-move') { var md = byId(el.getAttribute('data-id')); if (md) { md.folder = el.value; md.updatedAt = Date.now(); DB.put('designs', clone(md)); H.render(); } }
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
    else if (c === 'dz-frameimg' && d) {
      d.frameImg = el.value;
      var fsel = dz.frames.filter(function (f) { return f.id === fid(d); })[0];
      if (fsel) {
        d.ink = fsel.ink === 'light' ? 'light' : 'dark';
        var lay = fsel.geo && fsel.geo.layout;
        if (lay && R.LAYOUT[lay]) d.frame = lay; else if (d.frame === 'planeswalker' || d.frame === 'saga') d.frame = 'classic';
      }
      saveSoon(); H.render();
    }
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
    ready: load, get: byId, list: function () { return dz.designs.slice(); }, openPicker: openPicker, state: dz, assetsFor: assetsFor, wantFrame: wantFrame, applyFrameFor: applyFrameFor, flip: flip, hasBack: function (id) { var d = byId(id); return !!(d && d.back); }
  };
})();
