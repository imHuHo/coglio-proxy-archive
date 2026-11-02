/* Coglio Proxy Archive - interfaccia e salvataggio */
(function () {
  'use strict';
  var C = window.Core;
  var APP = document.getElementById('app');
  var TOAST = document.getElementById('toast');

  /* ---------- Utilità ---------- */
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var $ = function (s) { return document.querySelector(s); };
  var sum = function (cards) { return cards.reduce(function (t, c) { return t + c.qty; }, 0); };
  var byName = function (a, b) { return a.name.localeCompare(b.name, 'en'); };

  var IC = {
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.2C10 4.6 7 4.1 3.5 4.7v13.6c3.500-.6 6.500-.1 8.500 1.500 2-1.600 5-2.100 8.500-1.500V4.700C17 4.100 14 4.600 12 6.200zM12 6.200v13.600"/></svg>',
    decks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7.500" y="3.500" width="12" height="17" rx="2" transform="rotate(9 13.500 12)"/><path d="M4.800 7.500v10.500a2 2 0 0 0 2 2h6.700"/></svg>',
    import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.500v11M7.500 10.500l4.500 4.500 4.500-4.500"/><path d="M4 16.500v1.500a2.500 2.500 0 0 0 2.500 2.500h11a2.500 2.500 0 0 0 2.500-2.500v-1.500"/></svg>',
    builder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="7" y="13" width="10" height="8" rx="1"/></svg>',
    designer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="13" height="18" rx="2"/><path d="M7 15l3-4 2 2 2-3M18 9l3 3-6 6-3.5.5.5-3.5z"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.500 4h11l3.500 5-9 11L3 9z"/><path d="M3 9h18M9.500 4 8 9l4 11 4-11-1.500-5"/></svg>',
    pescher: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.100C15.200 6.900 20.800 9.700 20.800 14.100A8.800 8.800 0 0 1 3.200 14.100C3.200 9.700 8.800 6.900 12 2.100Z"/><circle cx="9.400" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="14.600" cy="13" r="1" fill="currentColor" stroke="none"/><path d="M7.200 9.900l3.800 1.200M16.800 9.900l-3.800 1.200"/><path d="M10.200 17.500q1.800-1 3.600 0"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    filter: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/></svg>'
  };
  var LOGO = '<svg width="40" height="40" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#1f4a92"/>' +
    '<rect x="84" y="86" width="196" height="272" rx="26" transform="rotate(-16 182 222)" fill="#86a9e6"/><rect x="128" y="70" width="196" height="272" rx="26" fill="#d6e3fa"/>' +
    '<g transform="rotate(12 270 224)"><rect x="172" y="86" width="196" height="272" rx="26" fill="#fff"/><rect x="188" y="102" width="164" height="30" rx="10" fill="#dce7f8"/><rect x="188" y="142" width="164" height="108" rx="8" fill="#2d5fae"/><path d="M270 146C286 170 314 184 314 206A44 44 0 0 1 226 206C226 184 254 170 270 146Z" fill="#ffd23a" stroke="#0e1c40" stroke-width="5.5" stroke-linejoin="round"/><ellipse cx="257" cy="201" rx="8" ry="10" fill="#fff" stroke="#0e1c40" stroke-width="3.2"/><ellipse cx="283" cy="201" rx="8" ry="10" fill="#fff" stroke="#0e1c40" stroke-width="3.2"/><circle cx="259" cy="199" r="3.8" fill="#0e1c40"/><circle cx="285" cy="199" r="3.8" fill="#0e1c40"/><path d="M246 185l19 6M294 185l-19 6" stroke="#0e1c40" stroke-width="5.5" stroke-linecap="round"/><path d="M258 219q12 -6 24 0 2 14 -12 16 -14 -2 -12 -16z" fill="#0e1c40"/><path d="M263 228q7 4 14 0 -2 4 -7 4 -5 0 -7 -4z" fill="#ff7a6b"/><rect x="188" y="260" width="164" height="84" rx="8" fill="#eef3fc"/></g>' +
    '<polygon points="370,248 385,279 416,262 416,297 451,295 436,326 469,339 442,362 465,387 431,396 442,429 407,422 402,456 374,435 354,464 339,433 308,450 308,415 273,417 288,386 255,373 282,350 259,325 293,316 282,283 317,290 322,256 350,277" fill="#ffd23a" stroke="#0e1c40" stroke-width="14" stroke-linejoin="round"/><g transform="rotate(-9 362 356)"><rect x="347" y="296" width="30" height="76" rx="15" fill="#0e1c40"/><circle cx="362" cy="408" r="17" fill="#0e1c40"/></g></svg>';


  /* i cinque colori del mana (file in web/mana): decorazione e identità delle sezioni */
  function pip(k) { return '<img class="pip" src="mana/' + k.toLowerCase() + '.svg" alt="" width="20" height="20" draggable="false">'; }
  function pips() { return 'WUBRG'.split('').map(pip).join(''); }

  /* ---------- Stato ---------- */
  var state = { decks: [], settings: C.sanitizeSettings() };
  var ui = {
    view: 'archive', deckId: null, upId: null, deckTab: 'cards', deckQ: '',
    q: '', st: 'all', fdeck: '', fset: '', sort: 'name', nobasic: false, open: {}, limit: 150,
    adv: false, help: false, f: { colors: '', cmode: 'any', types: [], cost: [], rar: [], text: '' }, dtab: 'cards',
    dSort: 'name', dMan: false, dprev: null, dflip: false, crazy: false, dmenu: '', dAdd: false, dAddMsg: '', dAddBusy: false, dAddPend: null, dAddSide: false, dSug: [],
    upQ: '', upSt: 'all', draft: null, confirm: null, backupOut: '', restoreText: '', dataMsg: ''
  };
  var upd = { st: 'idle', info: null, err: '', prog: null, saved: '' };
  var archCache = null;
  function getArchive() { return archCache || (archCache = C.buildArchive(state.decks)); }
  function getDeck(id) { return state.decks.filter(function (d) { return d.id === (id || ui.deckId); })[0] || null; }

  /* ---------- Salvataggio ---------- */
  var store = null;
  var dirty = {}, gone = {}, settingsDirty = false, flushing = false, timer = null;

  function idbOpen() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      var r = indexedDB.open('coglio-proxy-archive', 1);
      r.onupgradeneeded = function () {
        r.result.createObjectStore('decks', { keyPath: 'id' });
        r.result.createObjectStore('meta');
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('blocked')); };
    });
  }
  function tx(db, name, mode, fn) {
    return new Promise(function (res, rej) {
      var t = db.transaction(name, mode), r = fn(t.objectStore(name));
      t.oncomplete = function () { res(r && r.result); };
      t.onerror = t.onabort = function () { rej(t.error); };
    });
  }
  function makeIdbStore() {
    return idbOpen().then(function (db) {
      return {
        kind: 'idb',
        load: function () {
          return tx(db, 'decks', 'readonly', function (s) { return s.getAll(); }).then(function (decks) {
            return tx(db, 'meta', 'readonly', function (s) { return s.get('settings'); })
              .then(function (settings) { return { decks: decks || [], settings: settings || null }; });
          });
        },
        saveDeck: function (d) { return tx(db, 'decks', 'readwrite', function (s) { return s.put(clone(d)); }); },
        deleteDeck: function (id) { return tx(db, 'decks', 'readwrite', function (s) { return s.delete(id); }); },
        saveSettings: function (s) { return tx(db, 'meta', 'readwrite', function (m) { return m.put(clone(s), 'settings'); }); }
      };
    });
  }
  function makeLocalStore() {
    var K = 'cpa:state:v1';
    var read = function () {
      try { return JSON.parse(localStorage.getItem(K)) || { decks: [], settings: null }; }
      catch (e) { return { decks: [], settings: null }; }
    };
    var write = function (o) { localStorage.setItem(K, JSON.stringify(o)); };
    localStorage.setItem(K + ':probe', '1'); localStorage.removeItem(K + ':probe');
    return {
      kind: 'local',
      load: function () { return Promise.resolve(read()); },
      saveDeck: function (d) {
        var o = read(); o.decks = o.decks.filter(function (x) { return x.id !== d.id; }); o.decks.push(clone(d));
        write(o); return Promise.resolve();
      },
      deleteDeck: function (id) {
        var o = read(); o.decks = o.decks.filter(function (x) { return x.id !== id; }); write(o); return Promise.resolve();
      },
      saveSettings: function (s) { var o = read(); o.settings = s; write(o); return Promise.resolve(); }
    };
  }
  function makeMemoryStore() {
    return { kind: 'memory', load: function () { return Promise.resolve({ decks: [], settings: null }); },
      saveDeck: function () { return Promise.resolve(); }, deleteDeck: function () { return Promise.resolve(); },
      saveSettings: function () { return Promise.resolve(); } };
  }
  /* Quando la pagina gira dentro Claude, i dati stanno nel tuo spazio privato (sincronizzati fra i tuoi dispositivi). */
  function makeClaudeStore() {
    if (!window.claude || typeof window.claude.use !== 'function') return Promise.resolve(null);
    return Promise.all([window.claude.use('db'), window.claude.use('user')]).then(function (r) {
      var db = r[0], user = r[1];
      if (!db || !user) return null;
      return user.id().then(function (id) {
        if (!id) return null;
        var base = db.doc('data/users/' + id + '/profile'), col = base.collection('decks');
        return {
          kind: 'claude',
          load: function () {
            return col.get().then(function (snap) {
              return base.get().then(function (s) {
                return {
                  decks: snap.docs.map(function (d) { return clone(d.data()); }),
                  settings: s.exists && s.data() ? clone(s.data().settings || null) : null
                };
              });
            });
          },
          saveDeck: function (d) { return col.doc(d.id).set(clone(d)); },
          deleteDeck: function (id2) { return col.doc(id2).delete(); },
          saveSettings: function (s) { return base.set({ settings: clone(s) }); }
        };
      });
    }).catch(function () { return null; });
  }
  function initStore() {
    return makeClaudeStore().then(function (s) {
      if (s) return s;
      return makeIdbStore().catch(function () {
        try { return makeLocalStore(); } catch (e) { return makeMemoryStore(); }
      });
    });
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 350); if (SYNC && SYNC.queue) SYNC.queue(); }
  /* Ogni mazzo ricorda com'era l'ultima volta: se il contenuto cambia, `updatedAt` si aggiorna da solo.
     La sincronizzazione si basa su quella data, quindi nessuna modifica puo' sfuggire, qualunque strada l'abbia fatta. */
  var sigs = {};
  function sigOf(d) { var c = {}; Object.keys(d).forEach(function (k) { if (k !== 'updatedAt') c[k] = d[k]; }); return JSON.stringify(c); }
  function bump(d) {
    var sg = sigOf(d);
    if (sigs[d.id] !== undefined && sigs[d.id] !== sg) d.updatedAt = Math.max(Date.now(), (d.updatedAt || 0) + 1);
    sigs[d.id] = sg;
  }
  function touch(id) { archCache = null; delete gone[id]; var d = getDeck(id); if (d) bump(d); dirty[id] = true; schedule(); }
  function touchSettings() { archCache = null; settingsDirty = true; schedule(); }
  function removed(id) { archCache = null; delete dirty[id]; gone[id] = true; schedule(); }
  function persistAll(prevIds) {
    archCache = null;
    state.decks.forEach(bump);
    var now = {}; state.decks.forEach(function (d) { now[d.id] = true; });
    prevIds.forEach(function (id) { if (!now[id]) { gone[id] = true; delete dirty[id]; } });
    state.decks.forEach(function (d) { delete gone[d.id]; dirty[d.id] = true; });
    settingsDirty = true; schedule();
  }
  function flush() {
    if (flushing) { schedule(); return Promise.resolve(); }
    flushing = true;
    var chain = Promise.resolve();
    Object.keys(gone).forEach(function (id) {
      chain = chain.then(function () { delete gone[id]; return store.deleteDeck(id); });
    });
    Object.keys(dirty).forEach(function (id) {
      chain = chain.then(function () {
        delete dirty[id]; var d = getDeck(id);
        return d ? store.saveDeck(d) : null;
      });
    });
    chain = chain.then(function () {
      if (settingsDirty) { settingsDirty = false; return store.saveSettings(state.settings); }
    });
    return chain.catch(function () {
      state.decks.forEach(function (d) { dirty[d.id] = true; }); settingsDirty = true;
      toast('Salvataggio non riuscito. Esporta un backup dalla scheda Dati per non perdere nulla.', null, true);
    }).then(function () { flushing = false; });
  }

  /* ---------- Avvisi e annulla ---------- */
  var toastTimer;
  /* Ogni avviso sparisce da solo: 6 secondi, 8 se c'è «Annulla», 14 per i messaggi lunghi (sticky). C'è sempre anche la × per chiuderlo. */
  function hideToast() { clearTimeout(toastTimer); TOAST.hidden = true; TOAST._undo = null; }
  function toast(msg, undo, sticky) {
    TOAST.innerHTML = '<span>' + esc(msg) + '</span><span class="tbtns">' + (undo ? '<button data-a="undo">Annulla</button>' : '') +
      '<button data-a="toast-close" class="tx" aria-label="Chiudi avviso">×</button></span>';
    TOAST._undo = undo || null; TOAST.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, (undo ? 8000 : sticky ? 14000 : 6000) * (window.CPA_TOAST_SCALE || 1));
  }
  function mutate(msg, fn) {
    var prev = JSON.stringify(state), prevIds = state.decks.map(function (d) { return d.id; });
    fn();
    persistAll(prevIds);
    toast(typeof msg === 'function' ? msg() : msg, function () {
      var cur = state.decks.map(function (d) { return d.id; });
      state = JSON.parse(prev); applyTheme(); persistAll(cur); ui.confirm = null; render();
    });
  }
  function confirmThen(key, fn) {
    if (ui.confirm === key) { ui.confirm = null; fn(); } else { ui.confirm = key; render(); }
  }
  var armed = function (key) { return ui.confirm === key; };

  function copyText(text) {
    var fallback = function () {
      try {
        var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return ok;
      } catch (e) { return false; }
    };
    var web = function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
      }
      return Promise.resolve(fallback());
    };
    /* nell'app Windows gli appunti li scrive il programma: funziona anche se la finestra non ha il focus */
    if (window.cpaNet && typeof window.cpaNet.copy === 'function') {
      return window.cpaNet.copy(text).then(function (ok) { return ok === true ? true : web(); }, function () { return web(); });
    }
    return web();
  }
  /* Dentro Claude il download passa dalla capability "downloads"; altrove è un normale download del browser. */
  function download(name, text, type) {
    var viaAnchor = function () {
      try {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
        a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
        return true;
      } catch (e) { return false; }
    };
    if (window.claude && typeof window.claude.use === 'function') {
      return window.claude.use('downloads').then(function (dl) {
        if (!dl) return viaAnchor();
        return dl.save({ filename: name, data: text }).then(function () { return true; }, function (err) {
          return err && err.code === 'declined' ? 'declined' : false;
        });
      }, function () { return viaAnchor(); });
    }
    return Promise.resolve(viaAnchor());
  }
  function openExternal(href) {
    var w = null;
    try { w = window.open(href, '_blank', 'noopener'); } catch (e) { w = null; }
    if (!w) {
      try { var a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); } catch (e2) { /* ignorato */ }
    }
  }

  /* ---------- Novità («Codighel! che novità!») ---------- */
  var NEWS = (function () {
    var KEY = 'cpa-news-seen', hidden = false, showAll = false;
    function log() { return Array.isArray(window.CPA_CHANGELOG) ? window.CPA_CHANGELOG : []; }
    function seen() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
    function mark() { try { localStorage.setItem(KEY, String(window.CPA_VERSION || '')); } catch (e) { /* ignorato */ } }
    function entry() { var v = window.CPA_VERSION; return log().filter(function (x) { return x.v === v; })[0] || null; }
    function list(e) {
      return '<ul class="news-list">' + e.items.map(function (i) { return '<li><b>' + esc(i.t) + '</b> ' + esc(i.d) + '</li>'; }).join('') + '</ul>';
    }
    function banner() {
      var e = entry(), cur = String(window.CPA_VERSION || '');
      if (!e || hidden || seen() === cur || ui.view === 'builder') return '';
      if (!state.decks.length && !seen()) { mark(); return ''; }
      var mj = /^\d+\.0\.0$/.test(cur);
      return '<div class="news-banner' + (mj ? ' major' : '') + '" role="status"><span><b>Codighel!</b> È arrivata la versione ' + esc(cur) + ': ' + esc(e.title) + '.</span>' +
        '<span class="btns"><button class="btn small primary" data-a="news-open">Che novità!</button><button class="btn small" data-a="news-close">Chiudi</button></span></div>';
    }
    function panel() {
      var l = log(); if (!l.length) return '';
      var cur = String(window.CPA_VERSION || ''), first = entry() || l[0];
      /* aggiornamenti major (x.0.0): titolo bello evidente, giallo acceso */
      var major = function (e) { return /^\d+\.0\.0$/.test(String(e.v || '')); };
      var head = function (e) {
        if (major(e)) return '<span class="news-major"><span class="news-major-tag">Major update</span><span class="news-major-t">' + esc(e.title) + '</span></span><span class="news-major-v">' + esc(e.v) + (e.date ? ' · ' + esc(e.date) : '') + '</span>';
        return esc(e.v) + (e.date ? ' · ' + esc(e.date) : '') + ' — ' + esc(e.title);
      };
      /* in mostra: dall'ultima versione fino all'inizio del secondo major update più recente; il resto sta dietro il tasto della cronologia */
      var rest = l.filter(function (e) { return e !== first; }), cut = rest.length, majors = major(first) ? 1 : 0;
      for (var i = 0; i < rest.length; i++) { if (major(rest[i])) { majors++; if (majors >= 2) { cut = i + 1; break; } } }
      var recent = rest.slice(0, cut), older = rest.slice(cut), row = function (e) { return '<details class="news-old"><summary>' + head(e) + '</summary>' + list(e) + '</details>'; };
      return '<section class="panel" id="news"><h2 class="sect" style="margin:0">Codighel! che novità!</h2>' +
        '<div class="news-cur"><h3>' + head(first) + '</h3>' + list(first) + '</div>' + recent.map(row).join('') +
        (older.length ? (showAll ? older.map(row).join('') : '') + '<div class="btns news-all"><button type="button" class="btn small" data-a="news-all" aria-expanded="' + showAll + '">' + (showAll ? 'Nascondi la cronologia' : 'Visualizza la cronologia degli aggiornamenti (' + older.length + ' più vecchi)') + '</button></div>' : '') +
        '</section>';
    }
    function close() { hidden = true; mark(); render(); }
    function open() {
      hidden = true; mark(); ui.view = 'data'; ui.confirm = null; render();
      setTimeout(function () { var el = document.getElementById('news'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
    }
    function toggle() { showAll = !showAll; render(); }
    return { banner: banner, panel: panel, close: close, open: open, toggle: toggle };
  })();

  /* ---------- Aggiornamenti (GitHub Releases) ---------- */
  var UPD = (function () {
    var REPO = 'imHuHo/coglio-proxy-archive';
    function platform() {
      if (window.cpaNet && typeof window.cpaNet.update === 'function') return 'windows';
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return 'android';
      return 'web';
    }
    function available() { return !!store && store.kind !== 'claude' && typeof fetch === 'function'; }
    function current() { return typeof window.CPA_VERSION === 'string' ? window.CPA_VERSION : ''; }
    function parse(v) {
      var m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim());
      return m ? [+m[1], +m[2], +m[3]] : null;
    }
    /* >0 se a è più recente di b; null se una delle due non è una versione */
    function cmp(a, b) {
      var x = parse(a), y = parse(b);
      if (!x || !y) return null;
      for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
      return 0;
    }
    function pick(rel, plat) {
      var assets = (rel && rel.assets) || [], re = plat === 'windows' ? /-Windows\.zip$/i : plat === 'android' ? /\.apk$/i : null;
      if (!re) return null;
      for (var i = 0; i < assets.length; i++) {
        var a = assets[i];
        if (a && typeof a.name === 'string' && re.test(a.name) && typeof a.browser_download_url === 'string' && a.browser_download_url.indexOf('https://github.com/' + REPO + '/') === 0) {
          return { name: a.name, url: a.browser_download_url, size: a.size || 0 };
        }
      }
      return null;
    }
    function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
    function check() {
      if (upd.st === 'checking' || upd.st === 'downloading') return;
      upd.st = 'checking'; upd.err = ''; upd.saved = ''; render();
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
      fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' }, signal: ctl ? ctl.signal : undefined })
        .then(function (r) {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error('http' + r.status);
          return r.json();
        })
        .then(function (rel) {
          clearTimeout(t);
          if (!rel) { upd.st = 'none'; upd.info = null; return; }
          var plat = platform(), c = cmp(rel.tag_name, current());
          upd.info = { tag: String(rel.tag_name || ''), page: typeof rel.html_url === 'string' ? rel.html_url : '', body: String(rel.body || '').slice(0, 1200), asset: pick(rel, plat) };
          /* versione installata sconosciuta: si propone comunque l'ultima, ma senza dire che è "nuova" */
          upd.st = c === 0 || c === -1 ? 'latest' : 'available';
        })
        .catch(function (e) {
          clearTimeout(t); upd.st = 'error'; upd.info = null;
          upd.err = e && e.name === 'AbortError' ? 'GitHub non risponde: riprova tra poco.' : 'Non riesco a contattare GitHub. Controlla la connessione e riprova.';
        })
        .then(function () { render(); });
    }
    function start() {
      var a = upd.info && upd.info.asset, plat = platform();
      if (!a) { if (upd.info && upd.info.page) openExternal(upd.info.page); return; }
      if (plat === 'windows') {
        upd.st = 'downloading'; upd.prog = { received: 0, total: a.size || 0 }; upd.err = ''; render();
        if (typeof window.cpaNet.onUpdateProgress === 'function') {
          window.cpaNet.onUpdateProgress(function (p) { upd.prog = p; paintProgress(); });
        }
        window.cpaNet.update(a.url).then(function (r) {
          if (r && r.ok) { upd.st = 'downloaded'; upd.saved = r.path || ''; }
          else { upd.st = 'error'; upd.err = r && r.error === 'busy' ? 'Scarico già in corso.' : r && (r.error === 'incomplete' || r.error === 'network' || r.error === 'timeout') ? 'Scarico interrotto: riprova.' : 'Scarico non riuscito (' + ((r && (r.error || r.status)) || 'errore') + ').'; }
          render();
        }, function () { upd.st = 'error'; upd.err = 'Scarico non riuscito: riprova.'; render(); });
      } else {
        openExternal(a.url);
        upd.st = 'opened'; render();
      }
    }
    /* Versione web: dimentica la copia in cache (service worker) e ricarica. IndexedDB, cioè i dati, non si tocca. */
    function reload() {
      var jobs = [];
      try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })); } catch (e) { /* ignorato */ }
      try { if (window.caches && caches.keys) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })); } catch (e2) { /* ignorato */ }
      toast('Aggiorno… i tuoi dati restano dove sono.');
      Promise.all(jobs).then(function () { location.reload(); }, function () { location.reload(); });
    }
    function paintProgress() {
      var p = upd.prog, el = document.getElementById('upd-prog'), tx = document.getElementById('upd-prog-t');
      if (!el || !p) return;
      var pct = p.total ? Math.min(100, Math.round(p.received * 100 / p.total)) : 0;
      el.value = pct; if (tx) tx.textContent = mb(p.received) + (p.total ? ' di ' + mb(p.total) + ' · ' + pct + '%' : '');
    }
    function panel() {
      var plat = platform(), cur = current(), i = upd.info, h = '<section class="panel" id="upd"><h2 class="sect" style="margin:0">Aggiornamenti</h2>';
      h += '<p class="hint">Versione installata: <strong>' + (cur ? esc(cur) : 'non nota') + '</strong>' + (plat === 'web' ? ' · versione web' : '') + '</p>';
      if (!available()) {
        return h + '<p class="hint">Qui dentro non posso controllare GitHub. Nell\'app per Windows, nell\'APK e nella versione web il pulsante funziona.</p></section>';
      }
      var busy = upd.st === 'checking' || upd.st === 'downloading';
      h += '<div class="btns"><button class="btn" data-a="upd-check"' + (busy ? ' disabled' : '') + '>' + (upd.st === 'checking' ? 'Controllo…' : 'Verifica aggiornamenti') + '</button></div>';
      if (upd.st === 'none') h += '<p class="hint" role="status">Non ci sono ancora versioni pubblicate su GitHub.</p>';
      if (upd.st === 'error') h += '<p class="err" role="status">' + esc(upd.err) + '</p>';
      if (i && (upd.st === 'latest')) h += '<p class="hint" role="status">Hai già l\'ultima versione (' + esc(i.tag) + ').</p>';
      if (i && (upd.st === 'available' || upd.st === 'downloading' || upd.st === 'downloaded' || upd.st === 'opened' || (upd.st === 'error' && i.asset))) {
        var known = !!parse(cur);
        h += '<div class="upd-new"><p role="status"><strong>' + (known ? 'Nuova versione disponibile: ' : 'Ultima versione: ') + esc(i.tag) + '</strong>' + (i.asset && i.asset.size ? ' · ' + mb(i.asset.size) : '') + '</p>';
        if (i.body) h += '<details class="upd-notes"><summary>Novità</summary><pre class="hint">' + esc(i.body) + '</pre></details>';
        if (upd.st === 'downloading') {
          h += '<progress id="upd-prog" max="100" value="0" aria-label="Avanzamento scarico"></progress><p class="hint" id="upd-prog-t" role="status"></p>';
        } else if (upd.st === 'downloaded') {
          h += '<p class="hint" role="status">Scaricato in <strong>Download</strong>' + (upd.saved ? ' (' + esc(upd.saved.split(/[\\/]/).pop()) + ')' : '') + '. Per installarlo: chiudi questa app, estrai lo zip (anche sopra la vecchia cartella) e avvia di nuovo Coglio Proxy Archive. I tuoi dati restano al loro posto.</p>';
          h += '<div class="btns"><button class="btn" data-a="upd-quit">Chiudi l\'app</button></div>';
        } else if (upd.st === 'opened') {
          h += '<p class="hint" role="status">' + (plat === 'android' ? 'Ho aperto il download: quando finisce, tocca il file .apk per installarlo sopra la versione attuale (i dati restano).' : 'Ho aperto il download.') + '</p>';
        } else if (i.asset) {
          h += '<div class="btns"><button class="btn primary" data-a="upd-go">' + (plat === 'android' ? 'Scarica l\'APK' : 'Scarica e prepara l\'aggiornamento') + '</button></div>';
        } else {
          h += '<p class="hint">' + (plat === 'web' ? 'I programmi per Windows e Android si scaricano dalla pagina della versione.' : 'Per questo dispositivo non c\'è un file pronto in questa versione.') + '</p>' + (i.page ? '<div class="btns"><button class="btn" data-a="upd-go">Apri la pagina della versione</button></div>' : '');
        }
        h += '</div>';
      }
      if (plat === 'web' && location.protocol.indexOf('http') === 0) h += '<p class="hint">Questa è la versione web: si aggiorna da sola ad ogni pubblicazione, ma la nuova versione si vede alla seconda apertura. Per averla subito:</p><div class="btns"><button class="btn" data-a="upd-reload">Ricarica l\'app con l\'ultima versione</button></div>';
      return h + '</section>';
    }
    return { check: check, start: start, reload: reload, panel: panel, cmp: cmp, pick: pick, platform: platform };
  })();
  function saveBracket(deck, b) { deck.bracket = b; deck.updatedAt = Date.now(); touch(deck.id); render(); }

  /* ---------- Bracket (Commander Spellbook) ---------- */
  /* Il calcolo usa l'API pubblica di Commander Spellbook. Nell'app Windows la richiesta parte dal programma (cpaNet),
     su Android da una chiamata nativa; nel browser può essere bloccata (CORS) e allora resta «copia e apri il sito». */
  var BK = (function () {
    var box = null, run = 0, last = null;
    var URL_API = 'https://backend.commanderspellbook.com/estimate-bracket/', WEB = 'https://commanderbracket.app/bracket';
    function available() { return !!store && store.kind !== 'claude' && (typeof fetch === 'function' || !!window.cpaNet); }
    function call(payload) {
      if (window.cpaNet && typeof window.cpaNet.bracket === 'function') {
        return window.cpaNet.bracket(payload).then(function (r) {
          if (r && r.ok) return r.json;
          throw new Error(r && r.error ? r.error : 'network');
        });
      }
      var ctl = typeof AbortController === 'function' ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 25000);
      return fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined })
        .then(function (res) { if (!res.ok) throw new Error('http'); return res.json(); })
        .then(function (j) { if (t) clearTimeout(t); return j; }, function (e) { if (t) clearTimeout(t); throw e; });
    }
    function close() { if (box) { box.remove(); box = null; run++; } }
    function isOpen() { return !!box; }
    function shell(deck, inner) {
      if (!box) {
        box = document.createElement('div'); box.id = 'bk'; box.className = 'lb bk'; box.setAttribute('data-a', 'bk-close');
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Bracket di ' + deck.name);
        document.body.appendChild(box);
      }
      box.innerHTML = '<div class="bk-box" data-a="bk-keep"><div class="bk-head"><strong>Bracket · ' + esc(deck.name) + '</strong>' +
        '<button class="btn small" data-a="bk-close" id="bkx">Chiudi</button></div>' + inner + '</div>';
      var x = box.querySelector('#bkx'); if (x) x.focus();
    }
    function list(title, arr) {
      return arr.length ? '<div class="bk-sec"><h4>' + esc(title) + ' <span>' + arr.length + '</span></h4><p>' + arr.map(esc).join(' · ') + '</p></div>' : '';
    }
    function webBtn() { return '<button class="btn small bracket" data-a="bk-web" data-id="' + esc(last ? last.id : '') + '">Controlla anche su commanderbracket.app</button>'; }
    function pc(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
    function thumbsOf(deck, names) {
      return names.slice(0, 8).map(function (nm) {
        var c = deck.cards.filter(function (x) { return x.name === nm; })[0];
        return c ? IMG.thumb(c.name, c.set, c.cn) : '';
      }).join('');
    }
    function tile(deck, title, names, tag, tone, note) {
      var n = names.length;
      return '<div class="bkr-tile' + (n ? ' has' : '') + '"><div class="bkr-th"><h4>' + esc(title) + ' <span>' + n + '</span></h4>' + (tag ? '<em class="bkr-tag ' + (tone || '') + '">' + esc(tag) + '</em>' : '') + '</div>' +
        (n ? '<div class="bkr-thumbs">' + thumbsOf(deck, names) + '</div><p>' + names.slice(0, 14).map(esc).join(' · ') + (n > 14 ? ' · … e altre ' + (n - 14) : '') + '</p>' : '<p class="bkr-none">' + esc(note || 'Nessuna.') + '</p>') + '</div>';
    }
    function meter(label, val, ref, hint) {
      var tgt = ref.length ? ref[1] : ref, lo = ref.length ? ref[0] : ref, w = Math.max(3, Math.min(100, Math.round(val / tgt * 100)));
      return '<div class="bkr-m"><span>' + label + '</span><b>' + val + '</b><i><u class="' + (val >= lo ? 'ok' : 'low') + '" style="width:' + w + '%"></u></i><small>' + hint + '</small></div>';
    }
    function show(deck, v) {
      var an = v.an, sum = v.sum, b = v.b, spell = v.spell, dr = v.dr, H = (window.CPABracket || {}).HEALTH_REF;
      var cmd = deck.commander ? deck.cards.filter(function (x) { return C.keyOf(x.name) === C.keyOf(deck.commander); })[0] : null;
      var seed = cmd ? IMG.thumb(cmd.name, cmd.set, cmd.cn).replace('class="th', 'class="th seed') : '';
      var art = cmd ? IMG.pic(cmd.name, cmd.set, cmd.cn, 'art_crop') : '';
      var near = an ? window.CPABracket.verdict(b.n, an) : [];
      var combos = sum.combos.map(function (c) {
        return '<li><b>' + c.cards.map(esc).join(' + ') + '</b>' + (c.result.length ? ' → ' + esc(c.result.join(', ')) : '') + (c.twoCard ? ' <em class="bk-tag">due carte</em>' : '') + '</li>';
      }).join('');
      var warn = sum.banned.length ? '<p class="lb-warn">Carte bandite in Commander: ' + sum.banned.map(esc).join(', ') + '.</p>' : '';
      var unk = sum.unknown.length ? '<div class="bk-sec"><h4>Carte non riconosciute da Spellbook <span>' + sum.unknown.length + '</span></h4><p>' + sum.unknown.slice(0, 12).map(esc).join(' · ') + (sum.unknown.length > 12 ? ' · … e altre ' + (sum.unknown.length - 12) : '') + '</p></div>' : '';
      var gc = sum.gameChangers.length, floor = gc >= 4 ? 'Mettono il minimo a 4' : gc ? 'Mettono il minimo a 3' : '';
      var cl = an ? an.lists : { tutors: [], fast: [] }, cn = an ? an.counts : {};
      var spellNote = spell ? '' : (v.spellWhy === 'cors' ? 'Da questo browser Commander Spellbook non è raggiungibile: i combo li controlla l\'app per Windows.' : 'Non ho potuto interrogare Commander Spellbook: i combo non sono stati cercati.');
      var comboTile = '<div class="bkr-tile wide' + (sum.combos.length ? ' has' : '') + '"><div class="bkr-th"><h4>Combo <span>' + (spell ? sum.combos.length : '—') + '</span></h4>' +
        (spell ? '<em class="bkr-tag">da Commander Spellbook</em>' : '') + '</div>' +
        (combos ? '<ul>' + combos + '</ul>' : '<p class="bkr-none">' + esc(spell ? 'Nessun combo trovato.' : spellNote) + '</p>') + '</div>';
      var draw = dr ? '<section class="bkr-sec"><h3>Costanza di pescata</h3><div class="bkr-draw">' +
        '<div><b>' + pc(dr.keepable) + '</b><span>Mano di 7 da tenere</span><small>da 2 a 5 terre e una giocata a costo basso</small></div>' +
        '<div><b>' + dr.avgLands.toFixed(1) + '</b><span>Terre nella mano iniziale</span><small>in media, su ' + an.counts.lands + ' terre</small></div>' +
        '<div><b>' + pc(dr.lands3) + '</b><span>3 terre al turno 3</span><small>pescando a ogni turno</small></div>' +
        '<div><b>' + pc(dr.ramp3) + '</b><span>2 accelerazioni al turno 3</span><small>su ' + an.counts.ramp + ' carte che accelerano</small></div>' +
        '<div><b>' + pc(dr.onCurve) + '</b><span>Commander in curva</span><small>' + (dr.cmc ? 'costo ' + dr.cmc + ', al turno ' + dr.cmc : 'senza costo') + '</small></div>' +
        '<div><b>' + pc(dr.colors) + '</b><span>Colori del commander in mano</span><small>' + (dr.colorCount ? 'una fonte per ciascuno dei ' + dr.colorCount + ' colori' : 'commander incolore') + '</small></div>' +
        '</div><p class="bk-foot">Simulazione di ' + dr.trials.toLocaleString('it-IT') + ' mani del tuo mazzo (senza il commander, pescando anche al primo turno). Le carte senza dati contano come giocate generiche.</p></section>' : '';
      var health = an ? '<section class="bkr-sec"><h3>Salute del mazzo</h3><div class="bkr-health">' +
        meter('Terre', cn.lands, H.lands, 'riferimento ' + H.lands[0] + '–' + H.lands[1]) + meter('Accelerazione', cn.ramp, H.ramp, 'riferimento ~' + H.ramp) +
        meter('Rimozioni e contromagie', cn.removal, H.removal, 'riferimento ~' + H.removal) + meter('Pescata di carte', cn.draw, H.draw, 'riferimento ~' + H.draw) +
        '</div><p class="bk-foot">Conteggi dal testo delle carte, confrontati con la regola comune «36–38 terre e circa 10 carte per ciascun ruolo»: sono un punto di partenza, non un voto.</p></section>' : '';
      var miss = an && an.missing.length ? '<p class="lb-warn">Per ' + plural(an.missing.length, 'carta', 'carte') + ' non ho i dati (' + an.missing.slice(0, 4).map(esc).join(', ') + (an.missing.length > 4 ? '…' : '') + '): non contano nel calcolo.</p>' : '';
      shell(deck,
        '<div class="bkr-head' + (art ? ' has-art' : '') + '"' + (cmd ? ' data-n="' + esc(cmd.name) + '" data-s="' + esc(cmd.set || '') + '" data-c="' + esc(cmd.cn || '') + '"' : '') + (art ? ' style="--art:url(' + esc(art) + ')"' : '') + '>' + seed +
        '<div class="bk-num b' + b.n + '"><small>Bracket stimato</small><b>' + (b.n || '✕') + '</b></div>' +
        '<div class="bkr-vt"><h3>' + esc(deck.name) + '</h3><p>' + (b.n ? 'Perché: ' + b.reasons.map(esc).join('; ') + '.' : b.reasons.map(esc).join('; ') + '.') + '</p>' +
        (near.length ? '<p class="bkr-near">Vicino al bracket successivo: ' + near.map(esc).join(', ') + '.</p>' : '') +
        (spell ? '<span class="bk-chip t-' + esc(sum.tag.toLowerCase()) + '">Spellbook: ' + esc(sum.name) + '</span>' : '') + '</div></div>' + warn + miss +
        '<section class="bkr-sec"><h3>Cosa decide il bracket</h3><div class="bkr-tiles">' +
        tile(deck, 'Game Changer', sum.gameChangers, floor, 'warn', 'Nessuno: non alza il bracket.') +
        tile(deck, 'Turni extra', sum.extraTurns, sum.extraTurns.length >= 3 ? 'Da 3 in su: minimo 4' : '', 'warn', 'Nessuno.') +
        tile(deck, 'Distruzione di terre di massa', sum.massLandDenial, sum.massLandDenial.length ? 'Mette il minimo a 4' : '', 'warn', 'Nessuna.') +
        tile(deck, 'Tutor', cl.tutors, cl.tutors.length >= 6 ? 'Molti' : cl.tutors.length ? 'Nella norma' : '', '', 'Nessuno.') +
        tile(deck, 'Mana veloce', cl.fast, cl.fast.length ? 'Da cEDH' : '', '', 'Nessuna carta da cEDH.') +
        comboTile + '</div></section>' + draw + health + unk +
        '<p class="bk-foot">Stima secondo le regole pubbliche di Wizards: vale l\'elemento più forte (Game Changer, distruzione di terre di massa, turni extra, combo). Non misura la velocità né l\'intento, quindi 1 e 5 (cEDH) non si calcolano: se al tavolo il mazzo è un\'altra cosa, imposta il numero a mano.' + (spell ? ' La lista è stata inviata a Commander Spellbook per i combo.' : '') + '</p>' +
        '<div class="bk-set"><span>Se il tuo riferimento dice altro, imposta a mano:</span>' + [1, 2, 3, 4, 5].map(function (k) {
          return '<button class="bk-badge b' + k + '" data-a="bk-set" data-n="' + k + '" aria-label="Imposta bracket ' + k + '">' + k + '</button>';
        }).join('') + '</div><div class="bk-bar">' + webBtn() + '</div>');
      IMG.hydrate();
    }
    function fail(deck, why) {
      shell(deck, '<p class="lb-warn">' + (why === 'cors' ? 'Da questo browser il calcolo non è disponibile: il sito di Commander Spellbook non permette richieste da altre pagine.' :
        'Non sono riuscito a calcolare il bracket (' + (why === 'timeout' ? 'tempo scaduto' : why === 'http' ? 'il servizio ha risposto con un errore' : 'nessuna connessione') + ').') + '</p>' +
        '<p>Puoi farlo sul sito: copio la lista e lo apro, poi incolli e premi «Check my bracket».</p><div class="bk-bar">' + webBtn() + '</div>');
    }
    /* Dati delle carte che servono al calcolo: mancanti, oppure salvati prima che esistessero Game Changer e carte bandite. */
    function dataNeeds(deck) {
      var cc = CARDS.get(); if (!cc) return [];
      return cc.pricedCards(deck, C.isBasic).filter(function (c) { var r = dkRec(cc, c); return !r || r.gc === undefined; })
        .map(function (c) { return { name: c.name, set: c.set, cn: c.cn }; });
    }
    function uni(a, b) { var seen = {}, out = []; a.concat(b).forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out.sort(function (p, q) { return p.localeCompare(q, 'en'); }); }
    function start(deck) {
      last = deck; var my = ++run, payload = C.bracketPayload(deck), cc = window.CPABracket ? CARDS.get() : null;
      var local = cc && CARDS.enabled(), native = !!window.cpaNet, spell = null, spellWhy = '', spellDone = !available();
      function finish() {
        if (my !== run || !box) return;
        var an = null, dr = null;
        if (window.CPABracket && cc) {
          var ctx = { rec: function (c) { return dkRec(cc, c); }, isBasic: C.isBasic, keyOf: C.keyOf };
          an = window.CPABracket.analyze(deck, ctx);
          if (!an.hasData) an = null;
        }
        if (!an && !spell) return fail(deck, spellWhy || 'network');
        var sum = an ? JSON.parse(JSON.stringify(an.sum)) : { tag: '', range: '', name: '', note: '', gameChangers: [], massLandDenial: [], extraTurns: [], banned: [], combos: [], unknown: [] };
        if (spell) {
          sum.gameChangers = uni(sum.gameChangers, spell.gameChangers); sum.massLandDenial = uni(sum.massLandDenial, spell.massLandDenial);
          sum.extraTurns = uni(sum.extraTurns, spell.extraTurns); sum.banned = uni(sum.banned, spell.banned);
          sum.combos = spell.combos; sum.tag = spell.tag; sum.name = spell.name; sum.unknown = spell.unknown;
        }
        var b = C.bracketNumber(sum);
        if (an) { var cmd = an.commander, rc = deck.commander ? dkRec(cc, deck.cards.filter(function (x) { return C.keyOf(x.name) === C.keyOf(deck.commander); })[0] || {}) : null; dr = window.CPABracket.draws(an, rc ? rc.ci : ''); }
        saveBracket(deck, { n: b.n, sig: C.deckSig(deck), at: Date.now(), manual: false });
        show(deck, { an: an, sum: sum, b: b, spell: spell, spellWhy: spellWhy, dr: dr });
      }
      shell(deck, '<p class="lb-wait bk-wait" id="bkw">Calcolo il bracket di «' + esc(deck.name) + '»…</p>');
      var pending = 0, step = function () { pending--; if (pending === 0) finish(); };
      if (available()) {
        pending++;
        call(payload).then(function (j) { if (my !== run) return; spell = C.bracketSummary(j, payload); step(); }, function (e) {
          if (my !== run) return;
          var m = e && e.message;
          spellWhy = m === 'timeout' || m === 'http' ? m : (!native && e instanceof TypeError && location.protocol.indexOf('http') === 0 && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) ? 'cors' : 'network';
          step();
        });
      }
      if (local) {
        var need = dataNeeds(deck);
        if (need.length) {
          pending++;
          cc.ensure(need, { force: true }, function (p) {
            var w = box && box.querySelector('#bkw'); if (w && p.total) w.textContent = 'Scarico i dati delle carte da Scryfall: ' + p.done + ' su ' + p.total + '…';
          }).then(step, function () { if (my === run) step(); });
        }
      }
      if (!pending) { pending = 1; step(); }
    }
    function web(deck) {
      /* prima si avvia la copia (la finestra ha ancora il focus), poi si apre il sito: tutto dentro lo stesso clic */
      var copied = copyText(C.bracketText(deck));
      openExternal(WEB);
      copied.then(function (ok) {
        toast(ok ? 'Lista di «' + deck.name + '» copiata. Nella pagina del bracket incollala e premi «Check my bracket».'
          : 'Copia automatica non riuscita: usa «Copia lista .txt» nel mazzo e incollala su commanderbracket.app/bracket.', null, true);
      });
    }
    function set(n) {
      if (!last) return;
      saveBracket(last, { n: n, sig: C.deckSig(last), at: Date.now(), manual: true });
      toast('Bracket di «' + last.name + '» impostato a ' + n + '.');
    }
    return { available: available, start: start, web: web, close: close, isOpen: isOpen, set: set };
  })();

  /* ---------- Analisi del piscio: il mazzo sotto la lente (dati di Scryfall già sul dispositivo) ---------- */
  var AN = (function () {
    var box = null, run = 0, last = null, MANA = { W: 'Bianco', U: 'Blu', B: 'Nero', R: 'Rosso', G: 'Verde', C: 'Incolore' };
    function close() { if (box) { box.remove(); box = null; run++; } }
    function isOpen() { return !!box; }
    function nf(x, d) { return Number(x).toFixed(d == null ? 1 : d).replace('.', ','); }
    function shell(deck, inner) {
      if (!box) {
        box = document.createElement('div'); box.id = 'an'; box.className = 'lb bk an'; box.setAttribute('data-a', 'an-close');
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Analisi del piscio di ' + deck.name);
        document.body.appendChild(box);
      }
      box.innerHTML = '<div class="an-box" data-a="an-keep"><div class="an-head"><div><small>Analisi del piscio</small><strong>' + esc(deck.name) + '</strong></div>' +
        '<button class="btn small" data-a="an-close" id="anx">Chiudi</button></div>' + inner + '</div>';
      var x = box.querySelector('#anx'); if (x) x.focus();
    }
    function card(title, sub, inner, cls) {
      return '<section class="an-card' + (cls ? ' ' + cls : '') + '"><h3>' + title + (sub ? '<small>' + sub + '</small>' : '') + '</h3>' + inner + '</section>';
    }

    /* curva: istogramma in SVG, il picco in banana, la media come linea tratteggiata */
    function curveSvg(a) {
      var W = 340, H = 168, base = 134, top = 22, bw = 30, gap = 9, x0 = 12, max = Math.max.apply(null, a.curve) || 1;
      var out = '<svg class="an-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Curva di mana: ' + a.curve.map(function (n, i) { return n + ' carte a costo ' + (i === 7 ? '7 o più' : i); }).join(', ') + '">';
      out += '<line x1="6" y1="' + base + '" x2="' + (W - 6) + '" y2="' + base + '" class="an-axis"/>';
      a.curve.forEach(function (n, i) {
        var h = n ? Math.max(4, Math.round((base - top) * n / max)) : 0, x = x0 + i * (bw + gap), peak = i === a.peak && n > 0;
        out += '<g class="an-bar' + (peak ? ' peak' : '') + '"><title>' + n + (n === 1 ? ' carta' : ' carte') + ' a costo ' + (i === 7 ? '7 o più' : i) + '</title>' +
          '<rect x="' + (x - 3) + '" y="' + top + '" width="' + (bw + 6) + '" height="' + (base - top) + '" class="hit"/>' +
          (h ? '<path d="M' + x + ' ' + base + 'V' + (base - h + 4) + 'a4 4 0 0 1 4 -4h' + (bw - 8) + 'a4 4 0 0 1 4 4V' + base + 'Z" class="b"/>' : '') +
          (peak ? '<text x="' + (x + bw / 2) + '" y="' + (base - h - 5) + '" class="an-val">' + n + '</text>' : '') +
          '<text x="' + (x + bw / 2) + '" y="' + (base + 16) + '" class="an-tick">' + (i === 7 ? '7+' : i) + '</text></g>';
      });
      if (a.spells) {
        var mx = Math.max(10, Math.min(W - 10, x0 + a.avgCmc * (bw + gap) + bw / 2));
        out += '<line x1="' + mx + '" y1="' + (top - 8) + '" x2="' + mx + '" y2="' + base + '" class="an-avg"><title>Costo medio ' + nf(a.avgCmc, 2) + '</title></line>';
      }
      if (a.cmdCmc != null) {
        var cx = x0 + Math.min(7, a.cmdCmc) * (bw + gap) + bw / 2;
        out += '<path d="M' + cx + ' ' + (base + 24) + 'l5 5 -5 5 -5 -5z" class="an-cmd"><title>Commander: costo ' + a.cmdCmc + '</title></path>';
      }
      return out + '</svg>';
    }
    /* torta (ciambella) dei simboli di mana per colore: spicchi nei colori del mana, nome e conteggio sempre scritti accanto */
    function donut(a) {
      var tot = a.pipTotal; if (!tot) return '<p class="an-none">Nessun simbolo di mana colorato nei costi.</p>';
      var R = 58, Cc = 2 * Math.PI * R, acc = 0, segs = '';
      var list = ['W', 'U', 'B', 'R', 'G'].filter(function (k) { return a.pips[k] > 0; });
      list.forEach(function (k) {
        var frac = a.pips[k] / tot, len = Math.max(0, Cc * frac - (list.length > 1 ? 3 : 0));
        segs += '<circle class="an-seg m' + k + '" cx="80" cy="80" r="' + R + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (Cc - len).toFixed(2) + '" stroke-dashoffset="' + (-acc * Cc + 0).toFixed(2) + '"><title>' + MANA[k] + ': ' + a.pips[k] + ' simboli (' + Math.round(frac * 100) + '%)</title></circle>';
        acc += frac;
      });
      var legend = list.map(function (k) {
        return '<li>' + pip(k) + '<span>' + MANA[k] + '</span><b>' + a.pips[k] + '</b><i>' + Math.round(a.pips[k] / tot * 100) + '%</i></li>';
      }).join('');
      var bc = a.byColor, cards = [];
      if (bc.multi) cards.push(bc.multi + ' multicolore'); if (bc.C) cards.push(bc.C + ' incolori');
      return '<div class="an-pie"><svg class="an-svg don" viewBox="0 0 160 160" role="img" aria-label="Simboli di mana per colore: ' + list.map(function (k) { return MANA[k] + ' ' + a.pips[k]; }).join(', ') + '">' +
        '<g transform="rotate(-90 80 80)">' + segs + '</g><text x="80" y="78" class="an-big">' + tot + '</text><text x="80" y="96" class="an-small">simboli</text></svg><ul class="an-leg">' + legend + '</ul></div>' +
        (cards.length ? '<p class="an-foot">Carte: ' + cards.join(' · ') + '.</p>' : '');
    }
    function typesBars(a) {
      var max = Math.max.apply(null, a.types.map(function (t) { return t.n; })) || 1;
      return '<ul class="an-bars">' + a.types.map(function (t) {
        return '<li><span>' + esc(t.label) + '</span><i><u class="' + (t.k === 'land' ? 'land' : '') + '" style="width:' + Math.max(2, Math.round(t.n / max * 100)) + '%"></u></i><b>' + t.n + '</b></li>';
      }).join('') + '</ul>' + (a.commander ? '<p class="an-foot">Più il commander: ' + esc(a.commander) + '.</p>' : '');
    }
    function sourcesRows(a) {
      var max = Math.max.apply(null, a.sources.map(function (s) { return s.n; })) || 1;
      var rows = a.sources.filter(function (s) { return s.k === 'C' ? s.n > 0 : (s.n > 0 || s.pips > 0); }).map(function (s) {
        var lw = Math.round(s.land / max * 100), ow = Math.round(s.other / max * 100);
        return '<li class="' + (s.flag ? 'low' : '') + '">' + pip(s.k) + '<span class="n">' + MANA[s.k] + '</span><i><u class="l" style="width:' + lw + '%"></u><u class="o" style="width:' + ow + '%"></u></i><b>' + s.n + '</b>' +
          '<small>' + (s.k === 'C' ? 'senza colore' : s.pips + ' simboli · ' + Math.round(s.share * 100) + '%') + '</small>' + (s.flag ? '<em class="an-flag" title="Regola pratica: servono circa 12 fonti per il colore principale, 8 per gli altri">poche fonti</em>' : '') + '</li>';
      }).join('');
      return '<ul class="an-src">' + rows + '</ul><p class="an-key"><span class="l"></span> terre <span class="o"></span> altre carte' + (a.searchers ? ' · <span>+ ' + a.searchers + ' ' + (a.searchers === 1 ? 'terra che cerca' : 'terre che cercano') + ' una terra base</span>' : '') + '</p>' +
        '<p class="an-foot">Contano le carte che producono quel colore (una terra doppia vale per due). Regola pratica, non un verdetto.</p>';
    }
    function thumbsFor(deck, names) {
      return '<div class="bkr-thumbs">' + names.slice(0, 8).map(function (nm) { var c = deck.cards.filter(function (x) { return x.name === nm; })[0]; return c ? IMG.thumb(c.name, c.set, c.cn) : ''; }).join('') + '</div>';
    }
    function identity(deck, a) {
      var id = a.identity;
      if (!id.applies) return '<p class="an-none">' + (deck.commander ? 'Non ho ancora i dati del commander.' : 'Scegli un commander per controllare l’identità di colore.') + '</p>';
      var chips = id.colors.length ? id.colors.map(pip).join('') : '<span class="an-colorless">Incolore</span>';
      var head = '<div class="an-id"><div class="an-idp">' + chips + '</div><div><b>' + esc(a.commander) + '</b><span>identità ' + (id.colors.join('') || 'incolore') + '</span></div></div>';
      if (!id.bad.length) return head + '<p class="an-ok"><span aria-hidden="true">✓</span> Tutte le carte rientrano nell’identità di colore.</p>';
      var names = id.bad.map(function (b) { return b.name; });
      return head + '<p class="an-bad"><span aria-hidden="true">✕</span> ' + plural(id.bad.length, 'carta fuori identità', 'carte fuori identità') + '</p>' + thumbsFor(deck, names) +
        '<ul class="an-list">' + id.bad.map(function (b) { return '<li>' + esc(b.name) + (b.qty > 1 ? ' ×' + b.qty : '') + ' <em>' + b.extra.map(function (k) { return MANA[k]; }).join(', ') + '</em></li>'; }).join('') + '</ul>';
    }
    function legality(a) {
      var L = a.legality;
      if (L.clean) return '<p class="an-ok big"><span aria-hidden="true">✓</span> Legale in Commander: cento carte, tutte singole, nessuna bandita, tutte nell’identità.</p>';
      return '<ul class="an-issues">' + L.issues.map(function (i) {
        return '<li class="' + i.sev + '"><span class="ic" aria-hidden="true">' + (i.sev === 'error' ? '✕' : '!') + '</span><div><b>' + esc(i.text) + '</b>' + (i.names.length ? '<p>' + i.names.slice(0, 12).map(esc).join(' · ') + (i.names.length > 12 ? ' · …' : '') + '</p>' : '') + '</div></li>';
      }).join('') + '</ul>' + (L.ok ? '<p class="an-foot">Nessun errore: restano solo gli avvisi qui sopra.</p>' : '');
    }
    function show(deck, a) {
      var L = a.legality, errs = L.issues.filter(function (i) { return i.sev === 'error'; }).length, warns = L.issues.length - errs;
      var verdict = L.clean ? '<span class="an-v ok"><i aria-hidden="true">✓</i>Legale</span>' : !L.ok ? '<span class="an-v bad"><i aria-hidden="true">✕</i>' + plural(errs, 'problema', 'problemi') + '</span>' : '<span class="an-v warn"><i aria-hidden="true">!</i>' + plural(warns, 'avviso', 'avvisi') + '</span>';
      var top = '<div class="an-top">' + verdict +
        '<div class="an-stat"><b>' + a.total + '</b><span>carte</span></div><div class="an-stat"><b>' + (a.spells ? nf(a.avgCmc, 2) : '—') + '</b><span>costo medio</span></div>' +
        '<div class="an-stat"><b>' + a.lands + '</b><span>terre</span></div><div class="an-stat"><b>' + a.rocks + '</b><span>acceleratori</span></div></div>';
      var miss = a.missing.length ? '<p class="lb-warn">Per ' + plural(a.missing.length, 'carta', 'carte') + ' non ho i dati (' + a.missing.slice(0, 4).map(esc).join(', ') + (a.missing.length > 4 ? '…' : '') + '): sono fuori dai conteggi.</p>' : '';
      shell(deck, top + miss + '<div class="an-grid">' +
        card('Curva di mana', 'non terre, commander escluso', curveSvg(a) + '<p class="an-foot">' + (a.spells ? '<span class="an-avgk"></span> costo medio ' + nf(a.avgCmc, 2) + '. ' : '') + (a.cmdCmc != null ? '<span class="an-cmdk">◆</span> commander a costo ' + a.cmdCmc + '. ' : '') + 'Il picco è a costo ' + (a.peak === 7 ? '7 o più' : a.peak) + '.</p>', 'wide') +
        card('Colori', 'simboli di mana nei costi', donut(a)) +
        card('Tipi', 'conteggio per tipo', typesBars(a)) +
        card('Fonti di mana', 'per colore', sourcesRows(a), 'wide') +
        card('Identità di colore', 'controllo sul commander', identity(deck, a)) +
        card('Legalità', 'Commander, secondo Scryfall', legality(a)) + '</div>' +
        '<p class="bk-foot">Dati delle carte da Scryfall, già sul dispositivo. Il sideboard non conta. La legalità segue le regole Commander (cento carte, carte singole, identità di colore, banlist) e non tiene conto di regole di casa.</p>');
      IMG.hydrate();
    }
    function need(deck) {
      var cc = CARDS.get(); if (!cc) return [];
      return cc.pricedCards(deck, C.isBasic).filter(function (c) { var r = dkRec(cc, c); return !r || r.nl === undefined; }).map(function (c) { return { name: c.name, set: c.set, cn: c.cn }; });
    }
    function open(deck) {
      last = deck; var my = ++run, cc = CARDS.get();
      if (!window.CPAAnalysis || !cc || !CARDS.enabled()) { shell(deck, '<p class="lb-warn">Per l’analisi servono i dati delle carte di Scryfall, che da qui non sono raggiungibili.</p>'); return; }
      function finish() {
        if (my !== run || !box) return;
        var a = window.CPAAnalysis.analyze(deck, { rec: function (c) { return dkRec(cc, c); }, isBasic: C.isBasic, keyOf: C.keyOf });
        if (!a.hasData) { shell(deck, '<p class="lb-warn">Non ho ancora i dati di nessuna carta: controlla la connessione e riprova.</p>'); return; }
        show(deck, a);
      }
      shell(deck, '<p class="lb-wait bk-wait" id="anw">Analizzo «' + esc(deck.name) + '»…</p>');
      var n = need(deck);
      if (!n.length) { finish(); return; }
      cc.ensure(n, { force: true }, function (p) { var w = box && box.querySelector('#anw'); if (w && p.total) w.textContent = 'Scarico i dati delle carte da Scryfall: ' + p.done + ' su ' + p.total + '…'; })
        .then(finish, function () { if (my === run && box) { var a2 = window.CPAAnalysis.analyze(deck, { rec: function (c) { return dkRec(cc, c); }, isBasic: C.isBasic, keyOf: C.keyOf }); if (a2.hasData) show(deck, a2); else shell(deck, '<p class="lb-warn">Non riesco a scaricare i dati delle carte: controlla la connessione e riprova.</p>'); } });
    }
    return { open: open, close: close, isOpen: isOpen };
  })();

  function applyTheme() {
    var t = state.settings.theme, r = document.documentElement;
    if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t); else r.removeAttribute('data-theme');
  }

  /* ---------- Immagini delle carte (Scryfall) ---------- */
  /* Dato nome e collezione, l'immagine si ricava da api.scryfall.com. Le richieste partono a lotti (fino a 75
     carte) solo per le righe che si vedono, con una pausa fra una chiamata e l'altra come chiede Scryfall.
     L'indirizzo trovato resta salvato sul dispositivo, quindi ogni carta si cerca una volta sola. */
  /* ---------- MPC Fill: stampe della comunità (fino a 1200 dpi), solo nelle app Windows e Android ---------- */
  var MPCM = window.CPAMpc || null, MPCI = null;
  function mpcHttp() {
    var cap = window.Capacitor, nat = cap && cap.Plugins && cap.Plugins.CapacitorHttp;
    if (window.cpaNet && typeof window.cpaNet.mpc === 'function') {
      return function (req) { return window.cpaNet.mpc(req).then(function (r) { return { status: (r && r.status) || 0, text: (r && r.text) || '' }; }); };
    }
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && nat) {
      return function (req) {
        var data; try { data = req.body ? JSON.parse(req.body) : undefined; } catch (e) { data = req.body; }
        return nat.request({ url: req.url, method: req.method || 'GET', headers: req.headers || {}, data: data, responseType: 'text' }).then(function (r) {
          return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) };
        });
      };
    }
    return null;
  }
  function mpcCache() {
    var LS = 'cpa:mpc:v1', mem = null;
    function load() { if (!mem) { try { mem = JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { mem = {}; } } return mem; }
    var t = null;
    function save() {
      clearTimeout(t);
      t = setTimeout(function () {
        var m = load(), ks = Object.keys(m);
        if (ks.length > 900) { ks.sort(function (a, b) { return (m[a].t || 0) - (m[b].t || 0); }).slice(0, ks.length - 700).forEach(function (k) { delete m[k]; }); }
        try { localStorage.setItem(LS, JSON.stringify(m)); } catch (e) { /* spazio finito: pazienza */ }
      }, 800);
    }
    return { get: function (k) { return load()[k] || null; }, set: function (k, v) { load()[k] = v; if (v && !v.t) v.t = Date.now(); save(); }, clear: function () { mem = {}; try { localStorage.removeItem(LS); } catch (e) { /* ignorato */ } } };
  }
  function mpcInst() {
    if (!MPCM) return null;
    if (!MPCI) MPCI = MPCM.create({ http: mpcHttp(), cache: mpcCache(), gap: window.CPA_API_GAP != null ? window.CPA_API_GAP : 150 });
    return MPCI;
  }
  function mpcOn() { var m = mpcInst(); return !!(m && m.available()); }
  /* etichetta e colori dei dpi: più sono alti, più la stampa regge l'ingrandimento */
  function dpiClass(n) { return n >= 1000 ? 'hi' : n >= 600 ? 'mid' : n >= 300 ? 'ok' : 'lo'; }
  function mpcTags(c) {
    return (c.mdpi ? '<span class="tag mpt ' + dpiClass(c.mdpi) + '" title="Stampa MPC Fill' + (c.msrc ? ' · ' + esc(c.msrc) : '') + '">' + c.mdpi + ' dpi</span>' : '<span class="tag mpt">MPC</span>') +
      (c.muo ? '<span class="tag uot" title="Immagine della comunità: arte o cornice non ufficiale">non ufficiale</span>' : '');
  }

  var IMG = (function () {
    var API = 'https://api.scryfall.com', HOST = 'https://cards.scryfall.io/', LS = 'cpa:img:v1';
    var cache = null, queue = {}, drainT = null, running = false, saveT = null;
    var coolUntil = 0, noCollection = false, gate = Promise.resolve(), io = null, lb = null, hv = null;
    var NEG_MS = 7 * 864e5;

    function gap() { return window.CPA_API_GAP != null ? window.CPA_API_GAP : 110; }
    function pause() { return new Promise(function (r) { setTimeout(r, gap()); }); }
    function enabled() {
      return state.settings.images !== false && !!store && store.kind !== 'claude' && typeof fetch === 'function';
    }
    function load() {
      if (cache) return cache;
      cache = {};
      try { cache = JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { cache = {}; }
      return cache;
    }
    function persist() {
      clearTimeout(saveT);
      saveT = setTimeout(function () { try { localStorage.setItem(LS, JSON.stringify(cache)); } catch (e) { /* spazio finito: pazienza */ } }, 1000);
    }
    function key(name, set, cn) {
      set = String(set || '').toLowerCase();
      return C.keyOf(name) + '|' + set + '|' + (set ? String(cn || '').toLowerCase() : '');
    }
    function get(k) {
      var h = load()[k];
      if (h && h.x && Date.now() - h.x > NEG_MS) { delete cache[k]; return null; }
      return h || null;
    }
    function count() { return Object.keys(load()).filter(function (k) { return cache[k].u; }).length; }
    function clear() { cache = {}; queue = {}; try { localStorage.removeItem(LS); } catch (e) { /* ignorato */ } }
    function tail(u) { return u && u.indexOf(HOST + 'small/') === 0 ? u.slice((HOST + 'small/').length) : (u || 0); }
    function url(t, ver) {
      if (!t) return '';
      return t.indexOf('http') === 0 ? t.replace('/small/', '/' + ver + '/') : HOST + ver + '/' + t;
    }

    /* ----- parlare con Scryfall ----- */
    function gated(fn) { var p = gate.then(fn); gate = p.then(pause, pause); return p; }
    function check(r) {
      if (r.status === 429) coolUntil = Date.now() + 60000;
      if (r.status === 404) return null;
      if (!r.ok) { var e = new Error('http ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }
    function post(ids) {
      return gated(function () {
        return fetch(API + '/cards/collection', { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiers: ids }) });
      }).then(check);
    }
    function getJson(path) {
      return gated(function () { return fetch(API + path, { headers: { 'Accept': 'application/json' } }); }).then(check);
    }
    function nameIs(card, name) {
      var k = C.keyOf(name);
      if (C.keyOf(card.name || '') === k) return true;
      return (card.card_faces || []).some(function (f) { return C.keyOf(f.name || '') === k; });
    }
    function matches(card, r) {
      if (r.set && r.cn) return card.set === r.set.toLowerCase() && String(card.collector_number).toLowerCase() === String(r.cn).toLowerCase() && nameIs(card, r.name);
      if (r.set) return card.set === r.set.toLowerCase() && nameIs(card, r.name);
      return nameIs(card, r.name);
    }
    function ident(r) {
      if (r.set && r.cn) return { set: r.set.toLowerCase(), collector_number: r.cn };
      if (r.set) return { name: r.name, set: r.set.toLowerCase() };
      return { name: r.name };
    }
    function collect(recs, found) {
      return post(recs.map(ident)).then(function (res) {
        ((res && res.data) || []).forEach(function (card) {
          recs.forEach(function (r) { if (!found[r.k] && matches(card, r)) found[r.k] = card; });
        });
      });
    }
    /* Una carta per volta, dal tentativo più preciso al più largo. */
    function single(r) {
      var enc = encodeURIComponent, seq = [];
      if (r.set && r.cn) seq.push('/cards/' + enc(r.set.toLowerCase()) + '/' + enc(r.cn));
      if (r.set) seq.push('/cards/named?exact=' + enc(r.name) + '&set=' + enc(r.set.toLowerCase()));
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
    function faces(card) {
      var u = card.image_uris, f = card.card_faces || [], front = u ? u.small : (f[0] && f[0].image_uris && f[0].image_uris.small);
      var back = !u && f[1] && f[1].image_uris ? f[1].image_uris.small : '';
      return front ? { u: tail(front), b: tail(back) } : null;
    }
    /* Dal tentativo più preciso al più largo: collezione+numero, collezione, solo nome. */
    function variants(r) {
      var v = [];
      if (r.set && r.cn) v.push({ k: r.k, name: r.name, set: r.set, cn: r.cn });
      if (r.set) v.push({ k: r.k, name: r.name, set: r.set, cn: '' });
      v.push({ k: r.k, name: r.name, set: '', cn: '' });
      return v;
    }
    function stages(recs, found, i) {
      if (i > 2) return Promise.resolve();
      var vs = recs.filter(function (r) { return !found[r.k]; }).map(function (r) { return variants(r)[i]; }).filter(Boolean);
      var next = function () { return stages(recs, found, i + 1); };
      return (vs.length ? collect(vs, found) : Promise.resolve()).then(next);
    }
    function resolveBatch(keys) {
      var recs = keys.map(function (k) { return queue[k]; }), found = {};
      var p;
      if (noCollection) p = singles(recs, found);
      else {
        p = stages(recs, found, 0).catch(function (err) {
          if (err && err.status) throw err;           /* risposta del server: non è un problema di rete o di CORS */
          noCollection = true; return singles(recs.filter(function (r) { return !found[r.k]; }), found);
        });
      }
      return p.then(function () {
        var rest = recs.filter(function (r) { return !found[r.k]; }).slice(0, 25);
        return singles(rest, found);
      }).then(function () {
        recs.forEach(function (r) {
          var card = found[r.k], f = card && faces(card);
          if (!f) cache[r.k] = { x: Date.now() };
          else {
            cache[r.k] = { u: f.u, b: f.b, t: Date.now() };
            /* se la stampa chiesta non esiste su Scryfall si ricorda quale viene mostrata al suo posto */
            if (r.set && (card.set !== r.set.toLowerCase() || (r.cn && String(card.collector_number).toLowerCase() !== String(r.cn).toLowerCase()))) {
              cache[r.k].m = card.set + ' ' + card.collector_number;
            }
          }
          delete queue[r.k];
        });
        persist();
      });
    }

    /* ----- coda e aggiornamento dello schermo ----- */
    function liveKeys() {
      var live = {};
      [].forEach.call(document.querySelectorAll('.th[data-thk]'), function (el) { live[el.getAttribute('data-thk')] = 1; });
      return live;
    }
    function fill(el) {
      var h = get(el.getAttribute('data-thk'));
      if (!h) return;
      if (el.classList.contains('seed')) { el.classList.add(h.u ? 'on' : 'nf'); return; }   /* serve solo a ricordare l'immagine */
      if (h.u) {
        el.classList.remove('nf'); el.classList.add('on');
        if (h.m) el.classList.add('fb');
        if (!el.querySelector('img')) {
          var im = document.createElement('img');
          im.alt = ''; im.decoding = 'async'; im.src = url(h.u, 'small'); el.appendChild(im);
        }
      } else el.classList.add('nf');
    }
    var fillFns = [];
    function paint() { [].forEach.call(document.querySelectorAll('.th[data-thk]'), fill); fillFns.forEach(function (f) { try { f(); } catch (e) { /* ignorato */ } }); }
    function drain() {
      drainT = null;
      if (running || !enabled()) return;
      var wait = coolUntil - Date.now();
      if (wait > 0) { drainT = setTimeout(drain, wait + 50); return; }
      var live = liveKeys(), batch = [];
      Object.keys(queue).forEach(function (k) {
        if (!live[k]) delete queue[k]; else if (get(k)) delete queue[k]; else if (batch.length < 75) batch.push(k);
      });
      if (!batch.length) return;
      running = true;
      resolveBatch(batch).catch(function () {
        noCollection = false; coolUntil = Date.now() + 20000;
      }).then(function () {
        running = false; paint();
        if (Object.keys(queue).length) drainT = setTimeout(drain, 0);
      });
    }
    function request(el) {
      var k = el.getAttribute('data-thk');
      if (get(k)) { fill(el); return; }
      if (!queue[k]) queue[k] = { k: k, name: el.getAttribute('data-thn'), set: el.getAttribute('data-ths') || '', cn: el.getAttribute('data-thc') || '' };
      if (!drainT && !running) drainT = setTimeout(drain, window.CPA_IMG_DELAY != null ? window.CPA_IMG_DELAY : 250);
    }
    function hydrate() {
      if (!enabled()) return;
      var els = document.querySelectorAll('.th:not(.on):not(.nf)');
      if (!els.length) return;
      if (typeof IntersectionObserver === 'function') {
        if (!io) io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); request(en.target); } });
        }, { rootMargin: '300px 0px' });
        [].forEach.call(els, function (el) { io.observe(el); });
      } else [].slice.call(els, 0, 80).forEach(request);
    }
    function thumb(name, set, cn, deckId) {
      if (!enabled()) return '';
      var k = key(name, set, cn), h = get(k);
      var im = h && h.u ? '<img src="' + esc(url(h.u, 'small')) + '" alt="" decoding="async">' : '';
      return '<span class="th' + (h && h.u ? ' on' : h && h.x ? ' nf' : '') + (h && h.m ? ' fb' : '') + '" aria-hidden="true" data-thk="' + esc(k) + '" data-thn="' + esc(name) + '" data-ths="' + esc(set || '') + '" data-thc="' + esc(cn || '') + '"' + (deckId ? ' data-thd="' + esc(deckId) + '"' : '') + '>' + im + '</span>';
    }

    /* Indirizzo dell'immagine di una stampa gia' conosciuta ('' se non ancora arrivata); ver: small, normal, large, art_crop. */
    function pic(name, set, cn, ver, back) {
      var h = get(key(name, set, cn)); if (!h || !h.u) return '';
      return url(back ? h.b : h.u, ver || 'normal');
    }
    function hasBack(name, set, cn) { var h = get(key(name, set, cn)); return !!(h && h.b); }

    /* ----- anteprima grande ----- */
    function closeLb() { if (lb) { lb.remove(); lb = null; } }
    function showLb(el, side) {
      var h = get(el.getAttribute('data-thk')); if (!h || !h.u) return;
      closeLb();
      var name = el.getAttribute('data-thn'), set = el.getAttribute('data-ths'), cn = el.getAttribute('data-thc');
      var t = side && h.b ? h.b : h.u, mpid = el.getAttribute('data-thm') || '';
      lb = document.createElement('div'); lb.id = 'lb'; lb.className = 'lb'; lb.setAttribute('data-a', 'lb-close');
      lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Anteprima di ' + name);
      lb._el = el; lb._side = side ? 1 : 0;
      lb.innerHTML = '<div class="lb-box" data-a="lb-keep"><img src="' + esc(mpid && MPCM ? MPCM.imageUrl(mpid, 1000) : url(t, 'normal')) + '" alt="' + esc(name) + '"' + (mpid ? ' referrerpolicy="no-referrer"' : '') + '>' +
        '<div class="lb-bar"><span class="lb-name">' + esc(name) + (set ? ' · ' + esc(set.toUpperCase()) + (cn ? ' ' + esc(cn) : '') : ' · stampa predefinita') + '</span>' +
        (el.getAttribute('data-thd') ? '<button class="btn small" data-a="lb-prints">Cambia stampa</button>' : '') +
        (h.b ? '<button class="btn small" data-a="lb-flip">Gira</button>' : '') + '<button class="btn small" data-a="lb-close" id="lbx">Chiudi</button></div></div>';
      if (h.m && set) {
        var w = document.createElement('p'); w.className = 'lb-warn';
        w.textContent = 'La stampa ' + set.toUpperCase() + (cn ? ' ' + cn : '') + ' non risulta su Scryfall: vedi ' + h.m.toUpperCase() + '. Usa «Cambia stampa» per scegliere quella giusta.';
        lb.firstChild.insertBefore(w, lb.firstChild.querySelector('.lb-bar'));
      }
      document.body.appendChild(lb);
      var x = lb.querySelector('#lbx'); if (x) x.focus();
    }
    function printsLb() {
      if (!lb || !lb._el) return;
      var el = lb._el, name = el.getAttribute('data-thn'), set0 = (el.getAttribute('data-ths') || '').toLowerCase(), cn0 = (el.getAttribute('data-thc') || '').toLowerCase();
      var hasDeck = !!el.getAttribute('data-thd') && !!MPCM;
      mp.tab = 'sf'; if (mp.name !== name) { mp.s = null; mp.err = ''; mp.busy = false; mp.name = name; }
      lb.innerHTML = '<div class="lb-box wide" data-a="lb-keep"><div class="lb-bar"><span class="lb-name">Scegli la stampa che hai: ' + esc(name) + '</span>' +
        '<button class="btn small" data-a="lb-back">Indietro</button><button class="btn small" data-a="lb-close" id="lbx">Chiudi</button></div>' +
        (hasDeck ? '<div class="lb-tabs" role="tablist"><button class="btn small on" role="tab" data-a="lb-tab" data-t="sf" aria-selected="true">Scryfall · stampe ufficiali</button><button class="btn small" role="tab" data-a="lb-tab" data-t="mpc" aria-selected="false">MPC Fill · comunità, fino a 1200 dpi</button></div>' : '') +
        '<div class="pr-grid" id="prgrid"><p class="lb-wait">Cerco le stampe su Scryfall…</p></div><div class="mpcbox" id="mpcbox" hidden></div></div>';
      var q = '!"' + String(name).replace(/"/g, '') + '"';
      var mine = lb;
      getJson('/cards/search?q=' + encodeURIComponent(q) + '&unique=prints&order=released&dir=desc').then(function (res) {
        if (lb !== mine) return;
        var list = ((res && res.data) || []).filter(function (c) { return !c.digital && nameIs(c, name); });
        var grid = lb.querySelector('#prgrid');
        if (!list.length) { grid.innerHTML = '<p class="lb-wait">Nessuna stampa trovata.</p>'; return; }
        var unitOf = function (c) { var q = c.prices || {}, v = q.eur != null ? parseFloat(q.eur) : q.eur_foil != null ? parseFloat(q.eur_foil) : NaN; return isNaN(v) ? null : v; };
        var min = null; list.forEach(function (c) { var v = unitOf(c); if (v != null && (min == null || v < min)) min = v; });
        grid.innerHTML = list.map(function (c) {
          var f = faces(c); if (!f) return '';
          var pv = unitOf(c);
          cache[key(name, c.set, c.collector_number)] = { u: f.u, b: f.b, t: Date.now() };
          var cur = c.set === set0 && String(c.collector_number).toLowerCase() === cn0;
          return '<button class="pr' + (cur ? ' cur' : '') + (pv != null && pv === min ? ' low' : '') + '" data-a="lb-pick" data-s="' + esc(c.set) + '" data-n="' + esc(c.collector_number) + '" title="' + esc(c.set_name || '') + '">' +
            '<img src="' + esc(url(f.u, 'normal')) + '" alt="' + esc(c.set_name || c.set) + '" loading="lazy"><span>' + esc(c.set.toUpperCase()) + ' ' + esc(c.collector_number) + ' · ' + esc((c.released_at || '').slice(0, 4)) + '</span><span class="pp">' + (pv != null ? eurF(pv) : 'senza prezzo') + (pv != null && pv === min ? ' · la più economica' : '') + '</span>' + (c.set_name ? '<span class="pn">' + esc(c.set_name) + '</span>' : '') + '</button>';
        }).join('');
        persist();
      }).catch(function () {
        if (lb !== mine) return;
        lb.querySelector('#prgrid').innerHTML = '<p class="lb-wait">Non riesco a contattare Scryfall. Riprova tra poco.</p>';
      });
    }
    /* ----- MPC Fill nel dialogo "Cambia stampa" ----- */
    var mp = { tab: 'sf', name: '', s: null, minDpi: 0, hide: false, sort: 'dpi', one: false, busy: false, err: '', view: [] };
    function mpcRow() {
      if (!lb || !lb._el) return null;
      var el = lb._el, d = getDeck(el.getAttribute('data-thd')); if (!d) return null;
      var k = C.keyOf(el.getAttribute('data-thn')), st = (el.getAttribute('data-ths') || '').toLowerCase(), cn = (el.getAttribute('data-thc') || '').toLowerCase(), m = el.getAttribute('data-thm') || '';
      var same = function (x) { return !x.design && C.keyOf(x.name) === k && (x.set || '').toLowerCase() === st && (x.cn || '').toLowerCase() === cn && (x.mpc || '') === m; };
      var row = d.cards.filter(same)[0], side = false;
      if (!row) { row = (d.side || []).filter(same)[0]; side = !!row; }
      return row ? { d: d, row: row, side: side } : null;
    }
    function mpcPaint() {
      var box = lb && lb.querySelector('#mpcbox'); if (!box) return;
      var cur = mpcRow(), h = '';
      if (!mpcOn()) {
        box.innerHTML = '<p class="lb-wait">Le stampe di MPC Fill (fino a 1200 dpi) si cercano solo nell’app per Windows o Android: da una pagina web il sito le blocca.</p>'; return;
      }
      h += '<div class="mpc-intro"><b>Stampe della comunità</b> (mpcfill.com): immagini fatte da artisti e stampatori. Il numero in alto è la risoluzione; il bollino rosso segna arte o cornici <b>non ufficiali</b>. Le immagini senza etichette non sono garantite ufficiali.</div>';
      if (cur && cur.row.mpc) h += '<div class="mpc-cur">Ora usi una stampa MPC' + (cur.row.mdpi ? ' da ' + cur.row.mdpi + ' dpi' : '') + (cur.row.muo ? ' (non ufficiale)' : '') + '. <button class="btn small" data-a="mpc-clear">Torna alla stampa Scryfall</button></div>';
      if (!mp.s && !mp.busy) {
        h += '<div class="btns"><button class="btn primary" data-a="mpc-go">Cerca «' + esc(mp.name) + '» su MPC Fill</button></div>' + (mp.err ? '<p class="err">' + esc(mp.err) + '</p>' : '');
        box.innerHTML = h; return;
      }
      h += '<div class="mpc-ctl"><label class="lbl">Risoluzione minima<select class="select" data-c="mpc-min">' + [[0, 'Tutte'], [300, '300 dpi o più'], [600, '600 dpi o più'], [1200, '1200 dpi o più']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === mp.minDpi ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="lbl">Ordina<select class="select" data-c="mpc-sort"><option value="dpi"' + (mp.sort === 'dpi' ? '' : ' selected') + '>Più dpi prima</option><option value="off"' + (mp.sort === 'off' ? ' selected' : '') + '>Ufficiali prima</option></select></label>' +
        '<label class="chk"><input type="checkbox" data-c="mpc-hide"' + (mp.hide ? ' checked' : '') + '> Nascondi le non ufficiali</label>' +
        (cur && cur.row.qty > 1 ? '<label class="chk"><input type="checkbox" data-c="mpc-one"' + (mp.one ? ' checked' : '') + '> Solo per una copia (ne hai ' + cur.row.qty + ')</label>' : '') + '</div>';
      if (mp.busy && !(mp.s && mp.s.cards.length)) { box.innerHTML = h + '<p class="lb-wait"><span class="spin" aria-hidden="true"></span> Cerco su MPC Fill…</p>'; return; }
      var all = mp.s ? mp.s.cards : [], list = all.filter(function (c) { return !(mp.hide && c.unofficial); });
      list.sort(function (a, b) { return mp.sort === 'off' ? ((a.unofficial ? 1 : 0) - (b.unofficial ? 1 : 0)) || (b.dpi - a.dpi) : (b.dpi - a.dpi) || ((a.unofficial ? 1 : 0) - (b.unofficial ? 1 : 0)); });
      mp.view = list;
      var left = mp.s ? mp.s.total - mp.s.next : 0;
      h += '<p class="mpc-count">' + (mp.s ? mp.s.total + ' ' + (mp.s.total === 1 ? 'stampa trovata' : 'stampe trovate') + (all.length < mp.s.total ? ' · ne mostro ' + all.length : '') : '') + '</p>';
      if (!list.length) h += '<p class="lb-wait">' + (mp.s && mp.s.total ? 'Nessuna tra quelle caricate corrisponde ai filtri.' : 'Nessuna stampa trovata su MPC Fill.') + '</p>';
      else h += '<div class="pr-grid mpc-grid">' + list.map(function (c, i) {
        var use = cur && cur.row.mpc === c.id;
        return '<button class="pr mp' + (use ? ' cur' : '') + (c.unofficial ? ' uo' : '') + '" data-a="mpc-pick" data-i="' + i + '" title="' + esc(c.name + (c.tags.length ? ' · ' + c.tags.join(', ') : '')) + '">' +
          '<span class="mp-img"><img src="' + esc(MPCM.thumbUrl(c.id)) + '" alt="' + esc(c.name) + '" loading="lazy" referrerpolicy="no-referrer"><b class="dpi ' + dpiClass(c.dpi) + '">' + (c.dpi || '?') + ' dpi</b>' + (c.unofficial ? '<i class="uob">non ufficiale</i>' : '') + '</span>' +
          '<span class="pn">' + esc(c.name) + '</span><span class="ms">' + esc(c.src) + (c.hint ? ' · ' + esc(c.hint) : '') + (c.size ? ' · ' + MPCM.mb(c.size) : '') + '</span>' +
          (c.tags.length ? '<span class="mtg">' + c.tags.slice(0, 3).map(esc).join(' · ') + '</span>' : '<span class="mtg none">nessuna etichetta</span>') + '</button>';
      }).join('') + '</div>';
      if (left > 0) h += '<div class="btns"><button class="btn" data-a="mpc-more"' + (mp.busy ? ' disabled' : '') + '>' + (mp.busy ? 'Carico…' : 'Carica altre (' + Math.min(left, 75) + ' di ' + left + ')') + '</button></div>';
      if (mp.err) h += '<p class="err">' + esc(mp.err) + '</p>';
      var keep = box.querySelector('.mpc-grid'), top = keep ? keep.scrollTop : 0;
      box.innerHTML = h;
      var g2 = box.querySelector('.mpc-grid'); if (g2 && top) g2.scrollTop = top;
    }
    function mpcFail(e) { mp.busy = false; mp.err = (e && e.message) || 'Non riesco a contattare MPC Fill.'; mpcPaint(); }
    function mpcGo() {
      var m = mpcInst(), mine = lb; if (!m || !m.available() || !mine) return;
      mp.busy = true; mp.err = ''; mp.s = null; mpcPaint();
      m.search(mp.name, { minDpi: mp.minDpi }).then(function (s) { if (lb !== mine) throw null; mp.s = s; return m.more(s, 75); }).then(function () {
        if (lb !== mine) return; mp.busy = false; mpcPaint();
      }).catch(function (e) { if (lb !== mine || !e) return; mpcFail(e); });
    }
    function mpcMore() {
      var m = mpcInst(), mine = lb; if (!m || !mp.s || mp.busy) return;
      mp.busy = true; mp.err = ''; mpcPaint();
      m.more(mp.s, 75).then(function () { if (lb !== mine) return; mp.busy = false; mpcPaint(); }).catch(function (e) { if (lb === mine) mpcFail(e); });
    }
    function tabLb(t) {
      if (!lb) return;
      mp.tab = t === 'mpc' ? 'mpc' : 'sf';
      var g = lb.querySelector('#prgrid'), b = lb.querySelector('#mpcbox');
      if (g) g.hidden = mp.tab === 'mpc'; if (b) b.hidden = mp.tab !== 'mpc';
      [].forEach.call(lb.querySelectorAll('.lb-tabs [data-t]'), function (x) { var on = x.getAttribute('data-t') === mp.tab; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
      if (mp.tab === 'mpc') { mpcPaint(); }
    }
    function mpcPick(i) {
      var c = mp.view[i], cur = mpcRow(); if (!c || !cur) return;
      var label = cur.row.name + ' · MPC ' + (c.dpi ? c.dpi + ' dpi' : 'Fill') + (c.unofficial ? ' (non ufficiale)' : '');
      var deckId = cur.d.id, one = mp.one && cur.row.qty > 1, side = cur.side, row = { name: cur.row.name, set: cur.row.set, cn: cur.row.cn, mpc: cur.row.mpc };
      closeLb();
      mutate('Stampa scelta: ' + label, function () {
        var d = getDeck(deckId); if (!d) return;
        C.setMpc(d, row, { mpc: c.id, mdpi: c.dpi, muo: c.unofficial ? 1 : 0, msrc: c.src, mnm: c.name }, side, one);
        d.updatedAt = Date.now();
      });
      render();
    }
    function mpcClear() {
      var cur = mpcRow(); if (!cur || !cur.row.mpc) return;
      var deckId = cur.d.id, side = cur.side, row = { name: cur.row.name, set: cur.row.set, cn: cur.row.cn, mpc: cur.row.mpc }, one = mp.one && cur.row.qty > 1;
      closeLb();
      mutate('Stampa Scryfall ripristinata: ' + row.name, function () { var d = getDeck(deckId); if (!d) return; C.setMpc(d, row, null, side, one); d.updatedAt = Date.now(); });
      render();
    }
    function mpcClick(a, el) {
      switch (a) {
        case 'mpc-go': mpcGo(); break;
        case 'mpc-more': mpcMore(); break;
        case 'mpc-pick': mpcPick(parseInt(el.dataset.i, 10)); break;
        case 'mpc-clear': mpcClear(); break;
      }
    }
    function mpcChange(c, t) {
      if (c === 'mpc-min') { mp.minDpi = parseInt(t.value, 10) || 0; mp.s = null; mpcGo(); }
      else if (c === 'mpc-sort') { mp.sort = t.value; mpcPaint(); }
      else if (c === 'mpc-hide') { mp.hide = t.checked; mpcPaint(); }
      else if (c === 'mpc-one') { mp.one = t.checked; }
    }
    function backLb() { if (!lb || !lb._el) return; var h = get(lb._el.getAttribute('data-thk')); if (h && h.u) showLb(lb._el, false); else closeLb(); }
    /* Apre direttamente la scelta della stampa (senza passare dall'anteprima grande). */
    function openPrints(name, set, cn, deckId, mpcId) {
      closeLb();
      var at = { 'data-thn': name, 'data-ths': set || '', 'data-thc': cn || '', 'data-thd': deckId || '', 'data-thm': mpcId || '', 'data-thk': key(name, set, cn) };
      lb = document.createElement('div'); lb.id = 'lb'; lb.className = 'lb'; lb.setAttribute('data-a', 'lb-close');
      lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Stampe di ' + name);
      lb._el = { getAttribute: function (a) { return at[a] == null ? null : at[a]; } }; lb._side = 0;
      document.body.appendChild(lb);
      printsLb();
      var x = lb.querySelector('#lbx'); if (x) x.focus();
    }
    function pickLb(set, cn) {
      if (!lb || !lb._el) return;
      var el = lb._el, deckId = el.getAttribute('data-thd'), nm = el.getAttribute('data-thn');
      var s0 = el.getAttribute('data-ths') || '', c0 = el.getAttribute('data-thc') || '';
      var label = nm + ' ' + set.toUpperCase() + ' ' + cn;
      closeLb();
      mutate('Stampa scelta: ' + label, function () {
        var d = getDeck(deckId); if (!d) return;
        var m0 = el.getAttribute('data-thm') || '';
        var card = d.cards.filter(function (c) { return C.keyOf(c.name) === C.keyOf(nm) && (c.set || '') === s0 && (c.cn || '') === c0 && (c.mpc || '') === m0; })[0] || (d.side || []).filter(function (c) { return C.keyOf(c.name) === C.keyOf(nm) && (c.set || '') === s0 && (c.cn || '') === c0 && (c.mpc || '') === m0; })[0];
        if (card) { card.set = set.toUpperCase(); card.cn = String(cn); d.updatedAt = Date.now(); }
      });
      render();
    }
    function flipLb() { if (lb && lb._el) showLb(lb._el, !lb._side); }
    function hover(on, el, ev) {
      if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      if (!on || !el) { if (hv) hv.hidden = true; return; }
      var h = get(el.getAttribute('data-thk')); if (!h || !h.u) return;
      if (!hv) { hv = document.createElement('div'); hv.id = 'hv'; hv.innerHTML = '<img alt="">'; document.body.appendChild(hv); }
      var im = hv.firstChild, src = url(h.u, 'normal');
      if (im.getAttribute('src') !== src) im.setAttribute('src', src);
      hv.hidden = false;
      var w = 252, hgt = 352, x = ev.clientX + 18, y = ev.clientY - hgt / 2;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - 18;
      y = Math.max(8, Math.min(y, window.innerHeight - hgt - 8));
      hv.style.left = Math.max(8, x) + 'px'; hv.style.top = y + 'px';
    }

    return { enabled: enabled, thumb: thumb, hydrate: hydrate, get: get, key: key, count: count, clear: clear,
      open: function (el) { showLb(el, false); }, flip: flipLb, prints: printsLb, openPrints: openPrints, pic: pic, hasBack: hasBack, onFill: function (f) { fillFns.push(f); }, back: backLb, pick: pickLb, close: closeLb, hover: hover, tab: tabLb, mpcClick: mpcClick, mpcChange: mpcChange, isOpen: function () { return !!lb; } };
  })();

  /* ---------- Struttura generale ---------- */
  var NAV = [['archive', 'Archivio'], ['decks', 'Mazzi'], ['import', 'Importa'], ['designer', 'Designer'], ['builder', 'Stampa'], ['pescher', 'Pescher'], ['data', 'Dati']];
  function navBtn(v, label) {
    var cur = ui.view === v || (v === 'decks' && (ui.view === 'deck' || ui.view === 'upgrade'));
    return '<button class="nav" data-a="nav" data-v="' + v + '"' + (cur ? ' aria-current="page"' : '') + '>' + IC[v] + '<span>' + label + '</span></button>';
  }
  function render() {
    var navHtml = NAV.map(function (n) { return navBtn(n[0], n[1]); }).join('');
    APP.innerHTML =
      '<div class="shell" data-view="' + esc(ui.view) + '"><aside class="side"><div class="brand">' + LOGO + '<span><b>Coglio</b><small>Proxy Archive</small></span></div>' + navHtml +
      '<div class="side-foot"><span class="pips">' + pips() + '</span><small>Versione <b>' + esc(String(window.CPA_VERSION || '')) + '</b><br>Applicazione approvata dal Pisciatore in persona</small></div></aside>' +
      '<main class="main"><div class="mobile-brand">' + LOGO + '<span><b>Coglio</b><small>Proxy Archive</small></span></div>' + NEWS.banner() + viewHtml() + '</main></div>' +
      '<nav class="tabs" aria-label="Sezioni">' + navHtml + '</nav>';
    if (ui.view === 'archive' && state.decks.length) updateArchiveList();
    if (ui.view === 'deck') { dkBarPaint(); if (ui.deckTab === 'prices' && CARDS.ready()) renderPrices(); else updateDeckList(); }
    document.body.classList.toggle('on-deck', ui.view === 'deck');
    paintCrazy();
    if (ui.view === 'upgrade') updateUpgradeCols();
    if (ui.view === 'builder' && window.CPABuilder) window.CPABuilder.after();
    if (ui.view === 'designer' && window.CPADesigner) window.CPADesigner.after();
    if (window.CPAPescherUI) { if (ui.view === 'pescher') window.CPAPescherUI.after(); else window.CPAPescherUI.idle(); }
    if (window.CPACommunityUI && ui.view === 'data') window.CPACommunityUI.after();
  }
  function viewHtml() {
    switch (ui.view) {
      case 'decks': return decksView();
      case 'deck': return deckView();
      case 'upgrade': return upgradeView();
      case 'import': return importView();
      case 'builder': return window.CPABuilder ? window.CPABuilder.html() : decksView();
      case 'designer': return window.CPADesigner ? window.CPADesigner.html() : archiveView();
      case 'pescher': return window.CPAPescherUI ? window.CPAPescherUI.html() : archiveView();
      case 'data': return dataView();
      default: return archiveView();
    }
  }
  function go(v) {
    if (v === 'builder' && window.CPABuilder) { ui.confirm = null; window.CPABuilder.open(null); return; }
    if (v === 'designer' && window.CPADesigner) { ui.confirm = null; document.body.classList.remove('bd-lock'); window.CPADesigner.open(); return; }
    document.body.classList.remove('bd-lock');
    CARDS.st.err = '';
    ui.view = v; ui.confirm = null;
    if (v === 'import' && !(ui.draft && ui.draft.step === 1 && ui.draft.mode !== 'upgrade')) ui.draft = newDraft('deck');
    window.scrollTo(0, 0); render();
  }
  function welcome() {
    return '<div class="empty">' + '<svg class="empty-art" viewBox="0 0 240 130" aria-hidden="true"><g transform="translate(120 118)">' + [-18, 0, 18].map(function (a, i) { return '<g transform="rotate(' + a + ')"><rect x="-37" y="-104" width="74" height="104" rx="9" fill="' + ['#2a5aa6', '#1f4a92', '#173a78'][i] + '" stroke="#0e1c40" stroke-width="3"/><rect x="-29" y="-96" width="58" height="88" rx="5" fill="none" stroke="#86a9e6" stroke-width="1.500"/><path d="M0 -76l14 24-14 24-14-24z" fill="#f7c52b" stroke="#0e1c40" stroke-width="2" stroke-linejoin="round"/></g>'; }).join('') + '</g></svg>' + '<span class="empty-mana" aria-hidden="true">' + pips() + '</span><h2>Archivio vuoto</h2><p>Importa le liste dei tuoi mazzi e l\'archivio ti dirà quali carte hai, quante sono libere e dove sono impegnate.</p>' +
      '<ol class="steps"><li><b>Importa</b> una lista .txt (quantità, nome, e se vuoi collezione).</li><li><b>Scegli il commander</b> dalla lista.</li><li><b>Attiva</b> i mazzi che hai montati: le loro carte risulteranno in uso.</li></ol>' +
      '<button class="btn primary" data-a="nav" data-v="import">Importa il primo mazzo</button></div>';
  }

  /* ---------- Dati delle carte: ricerca avanzata e prezzi ---------- */
  /* Tipo, colori, costo, rarità, testo e prezzi arrivano da Scryfall e restano sul dispositivo (cards.js).
     Si scaricano solo quando servono: la prima volta che usi un filtro o guardi i prezzi. */
  var CARDS = (function () {
    var inst = null, loadedOk = false, repaintFn = null, st = { busy: false, what: '', done: 0, total: 0, err: '' };
    function ready() { return !!(window.CPACards && window.CPAProxy && window.CPASearch); }
    function enabled() { return ready() && !!store && store.kind !== 'claude' && typeof fetch === 'function'; }
    function changed() { if (repaintFn) repaintFn(); }
    function get() {
      if (inst || !ready()) return inst;
      var proxy = window.CPAProxy.create({ fetch: function (u, i) { return fetch(u, i); }, keyOf: C.keyOf, gap: window.CPA_API_GAP });
      inst = window.CPACards.create({ proxy: proxy, keyOf: C.keyOf, storage: window.CPACards.idbStorage('coglio-cards') || window.CPACards.memoryStorage() });
      inst.onChange(changed);
      inst.load().then(function () { loadedOk = true; changed(); });
      return inst;
    }
    function fail(e) {
      st.err = e && e.status === 429 ? 'Scryfall chiede una pausa: riprova tra un minuto.' : 'Non riesco a raggiungere Scryfall. Controlla la connessione e riprova.';
    }
    /* Un lavoro alla volta: fn(progress) restituisce una promessa. */
    function run(what, fn) {
      if (st.busy || !enabled() || !get()) return false;
      st.busy = true; st.what = what; st.err = ''; st.done = 0; st.total = 0; changed();
      fn(function (p) { st.done = p.done; st.total = p.total; changed(); }).then(function () { st.busy = false; changed(); }, function (e) { st.busy = false; fail(e); changed(); });
      return true;
    }
    return { ready: ready, enabled: enabled, loaded: function () { return loadedOk; }, get: get, run: run, st: st, onRepaint: function (f) { repaintFn = f; } };
  })();
  function cardRec(name) { var c = CARDS.get(); return c ? c.any(name) : null; }

  /* costo di mana come simboli: i cinque colori usano i simboli veri, il resto un tondino */
  function manaHtml(mc) {
    var m = String(mc || '').match(/\{[^}]+\}/g);
    if (!m) return '';
    return '<span class="mc" role="img" aria-label="Costo ' + esc(mc.replace(/[{}]/g, '')) + '">' + m.map(function (x) {
      var k = x.slice(1, -1).toUpperCase();
      return 'WUBRGC'.indexOf(k) >= 0 && k.length === 1 ? '<img class="ms" src="mana/' + k.toLowerCase() + '.svg" alt="" width="14" height="14" draggable="false">' : '<span class="ms n">' + esc(k.replace('/', '')) + '</span>';
    }).join('') + '</span>';
  }

  var F_TYPES = [['creature', 'Creatura'], ['instant', 'Istantaneo'], ['sorcery', 'Stregoneria'], ['artifact', 'Artefatto'], ['enchantment', 'Incantesimo'], ['planeswalker', 'Planeswalker'], ['land', 'Terra'], ['legendary', 'Leggendaria']];
  var F_COSTS = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  var F_RARS = [['c', 'Comune'], ['u', 'Non comune'], ['r', 'Rara'], ['m', 'Mitica']];
  var F_COLORS = [['W', 'Bianco'], ['U', 'Blu'], ['B', 'Nero'], ['R', 'Rosso'], ['G', 'Verde'], ['C', 'Incolore']];
  function fullQuery() { return (ui.q + ' ' + (window.CPASearch ? window.CPASearch.filtersQuery(ui.f) : '')).trim(); }
  function filterCount() {
    var f = ui.f;
    return (f.colors ? 1 : 0) + (f.types.length ? 1 : 0) + (f.cost.length ? 1 : 0) + (f.rar.length ? 1 : 0) + (f.text.trim() ? 1 : 0) +
      (ui.fdeck ? 1 : 0) + (ui.fset ? 1 : 0) + (ui.nobasic ? 1 : 0);
  }
  var qMemo = { s: null, c: null };
  function compiledQuery() {
    var s = fullQuery();
    if (qMemo.s !== s) { qMemo.s = s; qMemo.c = window.CPASearch ? window.CPASearch.compile(s) : null; }
    return qMemo.c;
  }
  function toggleIn(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function fchip(a, v, label, on) { return '<button class="chip" data-a="' + a + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + label + '</button>'; }
  function advHtml() {
    var f = ui.f, A = getArchive();
    var sets = {}; A.list.forEach(function (e) { e.sets.forEach(function (x) { sets[x] = 1; }); });
    var opt = function (v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    var seg = function (v, label) { return '<button class="seg-b" data-a="f-cm" data-v="' + v + '" aria-pressed="' + (f.cmode === v) + '">' + label + '</button>'; };
    var ex = (window.CPASearch ? window.CPASearch.EXAMPLES : []).map(function (x) {
      return '<li><button class="link" data-a="f-ex" data-v="' + esc(x[0]) + '"><code>' + esc(x[0]) + '</code></button><span>' + esc(x[1]) + '</span></li>';
    }).join('');
    return '<section class="panel advf" id="advf"' + (ui.adv ? '' : ' hidden') + ' aria-label="Filtri">' +
      '<div class="fgrp"><span class="lbl-t">Colore</span><div class="fcol"><span class="cpick" role="group" aria-label="Colori">' + F_COLORS.map(function (c) {
        return '<button class="cp" data-a="f-col" data-v="' + c[0] + '" aria-pressed="' + (f.colors.indexOf(c[0]) >= 0) + '" aria-label="' + c[1] + '" title="' + c[1] + '"><img src="mana/' + c[0].toLowerCase() + '.svg" alt="" width="26" height="26" draggable="false"></button>';
      }).join('') + '</span><span class="seg" role="group" aria-label="Come contare i colori">' + seg('any', 'Include') + seg('exact', 'Esattamente') + seg('max', 'Al massimo') + '</span></div></div>' +
      '<div class="fgrp"><span class="lbl-t">Tipo</span><div class="chips">' + F_TYPES.map(function (t) { return fchip('f-type', t[0], t[1], f.types.indexOf(t[0]) >= 0); }).join('') + '</div></div>' +
      '<div class="fgrp"><span class="lbl-t">Costo di mana</span><div class="chips">' + F_COSTS.map(function (c) { return fchip('f-cost', c, c, f.cost.indexOf(c) >= 0); }).join('') + '</div></div>' +
      '<div class="fgrp"><span class="lbl-t">Rarità</span><div class="chips">' + F_RARS.map(function (r) { return fchip('f-rar', r[0], r[1], f.rar.indexOf(r[0]) >= 0); }).join('') + '</div></div>' +
      '<label class="lbl">Testo della carta<input class="input" data-c="f-text" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ad esempio: draw a card" value="' + esc(f.text) + '"></label>' +
      '<div class="row-sel"><label class="lbl">Mazzo<select class="select" data-c="fdeck">' + opt('', 'Tutti i mazzi', ui.fdeck) + state.decks.map(function (d) { return opt(d.id, d.name, ui.fdeck); }).join('') + '</select></label>' +
      '<label class="lbl">Collezione<select class="select" data-c="fset">' + opt('', 'Tutte', ui.fset) + Object.keys(sets).sort().map(function (x) { return opt(x, x, ui.fset); }).join('') + '</select></label>' +
      '<label class="lbl">Ordina per<select class="select" data-c="sort">' + opt('name', 'Nome', ui.sort) + opt('owned', 'Più copie', ui.sort) + opt('free', 'Più libere', ui.sort) + opt('cmc', 'Costo di mana', ui.sort) + opt('price', 'Prezzo (più alto)', ui.sort) + '</select></label></div>' +
      '<label class="check"><input type="checkbox" data-c="nobasic"' + (ui.nobasic ? ' checked' : '') + '> Nascondi terre base</label>' +
      '<div class="advf-foot"><button class="btn small" data-a="f-clear">Azzera i filtri</button><button class="btn small ghost" data-a="f-help" aria-expanded="' + ui.help + '">Sintassi Scryfall</button></div>' +
      (ui.help ? '<div class="syn"><p>Nella barra di ricerca puoi scrivere come su Scryfall: più condizioni insieme valgono tutte, <code>or</code> ne accetta una qualsiasi, <code>-</code> esclude, le parentesi raggruppano. Chiavi utili: <code>t:</code> tipo, <code>o:</code> testo, <code>c:</code> colori, <code>id:</code> identità, <code>mv</code> costo, <code>r:</code> rarità, <code>pow</code> <code>tou</code>, <code>kw:</code> abilità, <code>m:</code> simboli di mana, <code>produces:</code>, <code>eur</code> prezzo, <code>set:</code>. Tocca un esempio per provarlo:</p><ul>' + ex + '</ul></div>' : '') +
      '</section>';
  }
  /* Le carte che i filtri attuali non possono ancora valutare perché mancano i loro dati. */
  function needsCardData() {
    var cq = compiledQuery();
    return (cq && cq.needsData) || ui.sort === 'cmc' || ui.sort === 'price';
  }
  function missingData(A) {
    var c = CARDS.get(); if (!c) return [];
    return A.list.filter(function (e) { return !c.known(e.name, e.pset, e.pcn) && !c.known(e.name, '', ''); });
  }
  function entryPrints(e) {
    var c = CARDS.get(), seen = {}, out = [];
    e.rows.forEach(function (r) {
      var k = r.set + '|' + r.cn; if (seen[k]) return; seen[k] = 1;
      var rec = r.set && c ? c.rec(e.name, r.set, r.cn) : null;
      out.push({ set: r.set, cn: r.cn, p: rec ? window.CPACards.unitPrice(rec) : undefined });
    });
    return out.length ? out : [null];
  }
  function entryPrice(e) {
    var c = CARDS.get(); if (!c) return null;
    var rec = (e.pset && c.rec(e.name, e.pset, e.pcn)) || c.any(e.name);
    return rec ? window.CPACards.unitPrice(rec) : null;
  }

  /* ---------- Archivio ---------- */
  function archiveFiltered(A, stat) {
    var cq = compiledQuery(), q = C.searchNorm(ui.q), pend = 0;
    var useAdv = !!(cq && cq.ok && !cq.empty);
    var l = A.list.filter(function (e) {
      if (useAdv) {
        var rec = cardRec(e.name), pr = entryPrints(e), v = false, unk = false;
        for (var i = 0; i < pr.length; i++) { var x = cq.test(e.name, rec, pr[i]); if (x === true) { v = true; break; } if (x === null) unk = true; }
        if (!v) { if (unk) pend++; return false; }
      } else if ((!cq || !cq.ok) && q && C.searchNorm(e.name).indexOf(q) < 0) return false;
      if (ui.st === 'avail' && !(e.free > 0)) return false;
      if (ui.st === 'busy' && e.free !== 0) return false;
      if (ui.st === 'part' && e.status !== 'part') return false;
      if (ui.fdeck && !e.rows.some(function (r) { return r.deckId === ui.fdeck; })) return false;
      if (ui.fset && e.sets.indexOf(ui.fset) < 0) return false;
      if (ui.nobasic && e.basic) return false;
      return true;
    });
    if (stat) stat.pending = pend;
    if (ui.sort === 'owned') l.sort(function (a, b) { return b.owned - a.owned || byName(a, b); });
    if (ui.sort === 'free') l.sort(function (a, b) { return b.free - a.free || byName(a, b); });
    if (ui.sort === 'cmc') l.sort(function (a, b) { var ra = cardRec(a.name), rb = cardRec(b.name); return (ra ? ra.v : 99) - (rb ? rb.v : 99) || byName(a, b); });
    if (ui.sort === 'price') l.sort(function (a, b) { var pa = entryPrice(a), pb = entryPrice(b); return (pb == null ? -1 : pb) - (pa == null ? -1 : pa) || byName(a, b); });
    return l;
  }
  function meter(e) {
    var label = e.occupied + ' in uso, ' + e.free + ' libere';
    if (e.owned <= 12) {
      var s = ''; for (var i = 0; i < e.owned; i++) s += '<i' + (i < e.occupied ? ' class="u"' : '') + '></i>';
      return '<span class="meter" role="img" aria-label="' + label + '">' + s + '</span>';
    }
    return '<span class="meter bar" role="img" aria-label="' + label + '">' +
      (e.occupied ? '<i class="u" style="flex:' + e.occupied + '"></i>' : '') + (e.free ? '<i style="flex:' + e.free + '"></i>' : '') + '</span>';
  }
  function typeLine(e) {
    var r = cardRec(e.name);
    return r && r.t ? '<span class="ty"><span class="tl">' + esc(r.t.split(' // ')[0]) + '</span>' + manaHtml(r.mc) + '</span>' : '';
  }
  function itemHtml(e) {
    var open = !!ui.open[e.key];
    var isCmd = state.decks.some(function (d) { return d.commander && C.keyOf(d.commander) === e.key; });
    var tags = (isCmd ? '<span class="tag cmd">commander</span>' : '') + (e.basic ? '<span class="tag">terra base</span>' : '') +
      e.sets.map(function (s) { return '<span class="tag">' + esc(s) + '</span>'; }).join('');
    return '<li class="item s-' + e.status + '"><button class="item-main" data-a="toggle-card" data-k="' + esc(e.key) + '" aria-expanded="' + open + '">' +
      '<span class="ttl">' + IMG.thumb(e.name, e.pset, e.pcn) + '<span class="ttx"><span class="nm">' + esc(e.name) + '</span>' + typeLine(e) + (tags ? '<span class="tags">' + tags + '</span>' : '') + '</span></span>' +
      '<span class="cnt"><b>' + e.free + '</b><small>libere su ' + e.owned + '</small></span>' + meter(e) + '</button>' +
      (open ? cardDetail(e) : '') + '</li>';
  }
  function cardDetail(e) {
    var rows = e.rows.slice().sort(function (a, b) { return (b.active - a.active) || a.deckName.localeCompare(b.deckName); });
    return '<div class="detail"><h3>Dove sono le copie</h3><ul class="where">' + rows.map(function (r) {
      var pill = r.kind === 'binder' ? '<span class="pill free">Sciolta · libera</span>'
        : r.active ? '<span class="pill use">In uso · mazzo attivo</span>' : '<span class="pill free">Libera · mazzo non attivo</span>';
      return '<li>' + IMG.thumb(e.name, r.set, r.cn, r.deckId) + '<span class="qty">' + r.qty + '×</span><button class="link" data-a="open-deck" data-id="' + esc(r.deckId) + '">' + esc(r.deckName) + '</button>' + pill +
        (r.set ? '<span class="tag">' + esc(r.set) + (r.cn ? ' ' + esc(r.cn) : '') + '</span>' : '') + '</li>';
    }).join('') + '</ul><p class="hint">' + plural(e.occupied, 'copia in uso', 'copie in uso') + ' · ' + plural(e.free, 'libera', 'libere') + '</p></div>';
  }
  function archiveView() {
    if (!state.decks.length) return '<header class="vh"><h1>Archivio</h1></header>' + welcome();
    var A = getArchive(), s = A.stats;
    var sets = {}; A.list.forEach(function (e) { e.sets.forEach(function (x) { sets[x] = 1; }); });
    var chip = function (v, label, n) { return '<button class="chip" data-a="st" data-v="' + v + '" aria-pressed="' + (ui.st === v) + '">' + label + '<i>' + n + '</i></button>'; };
    var opt = function (v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    return '<header class="vh"><h1>Archivio</h1><p class="sub"><b>' + s.unique + '</b> carte diverse · <b>' + s.owned + '</b> copie · <b>' + s.occupied + '</b> in uso · <b>' + s.free + '</b> libere · <b>' + s.activeDecks + '</b> su ' + s.decks + ' mazzi attivi</p></header>' +
      '<div class="sticky"><div class="srow"><div class="search">' + IC.search + '<input class="input" id="q" data-c="q" type="search" inputmode="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cerca per nome o con la sintassi Scryfall" aria-label="Cerca una carta" value="' + esc(ui.q) + '"></div>' +
      '<button class="btn fbtn" data-a="adv" aria-expanded="' + ui.adv + '" aria-controls="advf">' + IC.filter + '<span>Filtri</span><i id="fcount"' + (filterCount() ? '' : ' hidden') + '>' + filterCount() + '</i></button></div>' +
      '<p class="qmsg" id="qmsg" role="status" hidden></p>' +
      '<div class="chips" role="group" aria-label="Disponibilità">' + chip('all', 'Tutte', s.unique) + chip('avail', 'Con copie libere', s.avail) + chip('busy', 'Tutte occupate', s.busy) + chip('part', 'Parziali', s.part) + '</div></div>' +
      advHtml() +
      '<div class="adata" id="adata" hidden></div>' +
      '<p class="count" id="acount" aria-live="polite"></p><ul class="list" id="alist"></ul><div class="more" id="amore"></div>' +
      '<details class="how"><summary>Come conto le carte</summary><p><b>Possedute</b>: tutte le copie presenti nelle liste che hai inserito (mazzi e carte sciolte). <b>In uso</b>: le copie nei mazzi segnati come attivi. <b>Libere</b>: possedute meno in uso, cioè le carte dei mazzi smontati e delle carte sciolte. Se la stessa carta compare in due mazzi, sono due copie. Le terre base possono essere considerate sempre disponibili nelle impostazioni.</p></details>';
  }
  function updateArchiveList() {
    var list = $('#alist'); if (!list) return;
    var A = getArchive(), stat = {}, f = archiveFiltered(A, stat), shown = f.slice(0, ui.limit);
    var cq = compiledQuery();
    var msg = $('#qmsg');
    if (msg) { msg.hidden = !(cq && !cq.ok && ui.q.trim()); msg.textContent = cq && !cq.ok ? cq.error + ' Controllo il nome finché non è corretta.' : ''; }
    var fc = $('#fcount'); if (fc) { var n = filterCount(); fc.hidden = !n; fc.textContent = n; }
    $('#acount').textContent = f.length === A.list.length ? plural(f.length, 'carta', 'carte') : plural(f.length, 'carta trovata', 'carte trovate') + ' su ' + A.list.length;
    list.innerHTML = shown.length ? shown.map(itemHtml).join('') :
      '<li class="empty"><p>Nessuna carta corrisponde ai filtri. Se non è in nessuna lista che hai importato, non è nel tuo archivio.</p></li>';
    $('#amore').innerHTML = f.length > shown.length ? '<button class="btn" data-a="more">Mostra altre ' + Math.min(150, f.length - shown.length) + '</button>' : '';
    IMG.hydrate();
    updateArchiveData(A, stat);
  }
  /* Riga di stato sotto la ricerca: dati in arrivo, errore, o carte ancora senza dati. */
  function updateArchiveData(A, stat) {
    var el = $('#adata'); if (!el) return;
    var need = needsCardData();
    var miss = need ? missingData(A) : [], st = CARDS.st, html = '';
    if (need && !CARDS.enabled()) html = '<p class="hint">I filtri su tipo, colore, costo e prezzo usano i dati di Scryfall, che qui non sono raggiungibili: restano attivi solo nome e collezione.</p>';
    else if (st.busy && st.what === 'archive') html = '<p class="hint"><span class="spin" aria-hidden="true"></span> Scarico i dati delle carte da Scryfall: <b>' + st.done + '</b> su ' + st.total + '. La prima volta ci vuole un momento, poi restano sul dispositivo.</p>';
    else if (st.err && need) html = '<p class="err">' + esc(st.err) + ' <button class="link" data-a="f-load">Riprova</button></p>';
    else if (need && miss.length) html = '<p class="hint">Per questo filtro mi servono i dati di ' + plural(miss.length, 'carta', 'carte') + '. <button class="link" data-a="f-load">Scaricali ora</button></p>';
    else if (need && stat && stat.pending) html = '<p class="hint">' + plural(stat.pending, 'carta non ha', 'carte non hanno') + ' dati su Scryfall e non può comparire in questa ricerca.</p>';
    el.hidden = !html; el.innerHTML = html;
    if (need && miss.length && !st.busy && !st.err && CARDS.enabled()) loadArchiveData(A);
  }
  function loadArchiveData(A) {
    var c = CARDS.get(); if (!c) return;
    var entries = missingData(A).map(function (e) { return { name: e.name, set: e.pset, cn: e.pcn }; });
    if (!entries.length) return;
    CARDS.run('archive', function (prog) { return c.ensure(entries, {}, prog); });
  }

  /* ---------- Prezzi (euro, Cardmarket via Scryfall) ---------- */
  function eurF(x) { return window.CPACards ? window.CPACards.eur(x) : String(x); }
  /* force: l'utente ha chiesto di aggiornare. Se le stampe economiche erano già calcolate si rinnovano anche quelle (se vecchie). */
  function loadPrices(decks, force) {
    var c = CARDS.get(); if (!c) return;
    var entries = []; decks.forEach(function (d) { entries = entries.concat(c.pricedCards(d, C.isBasic)); });
    var names = entries.map(function (x) { return x.name; });
    CARDS.run('prices', function (prog) {
      return c.ensure(entries, { force: !!force }, prog).then(function () {
        return force && names.length && names.every(function (nm) { return c.hasCheapest(nm); }) ? c.ensureCheapest(names, { fresh: true }, prog) : null;
      });
    });
  }
  function loadCheap(decks, fresh) {
    var c = CARDS.get(); if (!c) return; var names = [];
    decks.forEach(function (d) { c.pricedCards(d, C.isBasic).forEach(function (x) { names.push(x.name); }); });
    CARDS.run('cheap', function (prog) { return c.ensureCheapest(names, { fresh: !!fresh }, prog); });
  }
  function progLine(what) {
    var st = CARDS.st, label = what === 'cheap' ? 'Cerco la stampa più economica di ogni carta' : 'Scarico i prezzi da Scryfall';
    return '<span class="spin" aria-hidden="true"></span> ' + label + (st.total ? ': <b>' + st.done + '</b> su ' + st.total : '…');
  }
  function errLine() { return '<p class="err">' + esc(CARDS.st.err) + '</p>'; }
  function priceRow(x, d) {
    return '<div class="prow">' + IMG.thumb(x.name, x.set, x.cn, d.id) + '<span class="nm">' + esc(x.name) + (x.set ? ' <span class="tag">' + esc(x.set) + (x.cn ? ' ' + esc(x.cn) : '') + '</span>' : '') + '</span>' +
      '<span class="pu">' + (x.unit != null ? (x.qty > 1 ? x.qty + ' × ' + eurF(x.unit) : eurF(x.unit)) : '<em>senza prezzo</em>') + '</span><b class="pl">' + (x.line != null ? eurF(x.line) : '—') + '</b>' +
      (x.save > 0.004 ? '<span class="pa">Più economica: <b>' + esc(x.cheapSet.toUpperCase()) + ' ' + esc(x.cheapCn) + '</b> · ' + eurF(x.cheapUnit) + ' <i>−' + eurF(x.save) + '</i></span>' : '') + '</div>';
  }
  function pricesHtml(d) {
    var c = CARDS.get(), st = CARDS.st;
    if (!c || !CARDS.enabled()) return '<p class="hint">I prezzi arrivano da Scryfall, che qui non è raggiungibile. Li trovi nell\'app per Windows, nell\'APK e nella versione web installata.</p>';
    var v = c.valueDeck(d, C.isBasic);
    if (!v.cards.length) return '<p class="hint">In questo mazzo ci sono solo terre base o carte tue del Designer: non c\'è nulla da valutare.</p>';
    if (!v.ready) return st.err ? errLine() + '<div class="btns"><button class="btn" data-a="p-fresh">Riprova</button></div>' : '<p class="hint">' + progLine('prices') + '</p>';
    var diff = v.total - v.cheapTotal, pct = v.total > 0 ? Math.round(diff / v.total * 100) : 0;
    var cheapBusy = st.busy && st.what === 'cheap';
    var tile2 = v.cheapComplete
      ? '<b>' + eurF(v.cheapTotal) + '</b><span>' + (diff > 0.004 ? 'meno ' + eurF(diff) + ' (−' + pct + '%)' : 'hai già le stampe più economiche') + '</span>'
      : cheapBusy ? '<b>…</b><span>' + progLine('cheap') + '</span>'
        : '<b>—</b><span><button class="link" data-a="p-cheap">Calcola</button> la stampa più economica di ogni carta</span>';
    var printed = C.isPrinted(d);
    var rows = v.cards.slice().sort(function (a, b) { return (b.line || 0) - (a.line || 0) || byName(a, b); });
    var shownRows = ui.pAll ? rows : rows.slice(0, 12);
    var notes = [];
    if (v.skipped.basic) notes.push(plural(v.skipped.basic, 'terra base esclusa', 'terre base escluse'));
    if (v.skipped.design) notes.push(plural(v.skipped.design, 'carta del Designer esclusa', 'carte del Designer escluse'));
    if (v.missing.length) notes.push(plural(v.missing.length, 'carta senza prezzo', 'carte senza prezzo') + ' non conteggiata');
    var when = c.newest() ? new Date(c.newest()).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : '';
    return '<div class="ptiles"><div class="ptile real"><small>Costo se fosse reale</small><b>' + eurF(v.total) + '</b><span>con le stampe del mazzo · ' + plural(v.qty, 'carta', 'carte') + '</span></div>' +
      '<div class="ptile cheap"><small>Con le stampe più economiche</small>' + tile2 + '</div></div>' +
      '<p class="psave"><b class="bang">Codighel!</b> ' + (printed ? 'Stampando questo mazzo invece di comprarlo hai risparmiato' : 'Quando lo stampi, invece di comprarlo, risparmi') + ' <b>' + eurF(v.total) + '</b>.</p>' +
      '<div class="plist">' + shownRows.map(function (x) { return priceRow(x, d); }).join('') + '</div>' +
      (rows.length > 12 ? '<div class="btns"><button class="btn small" data-a="p-all">' + (ui.pAll ? 'Mostra solo le più care' : 'Mostra tutte le ' + rows.length + ' carte') + '</button></div>' : '') +
      '<p class="hint pnote">Prezzi in euro di Cardmarket, tramite Scryfall' + (when ? ', aggiornati al ' + when : '') + '. Contano le stampe senza foil.' + (notes.length ? ' ' + notes.join(' · ') + '.' : '') + '</p>' +
      (st.err ? errLine() : '') +
      '<div class="btns"><button class="btn small" data-a="p-fresh"' + (st.busy ? ' disabled' : '') + '>Aggiorna i prezzi</button></div>';
  }
  function renderPrices() {
    var el = $('#prices'), d = getDeck(); if (!el || !d) return;
    el.innerHTML = pricesHtml(d);
    var c = CARDS.get();
    if (c && CARDS.enabled() && !CARDS.st.busy && !CARDS.st.err) {
      var v = c.valueDeck(d, C.isBasic);
      if (!v.ready && v.cards.length) loadPrices([d]);
    }
    IMG.hydrate();
  }
  function repaintPrices() {
    if (ui.view === 'deck') {
      if (ui.deckTab === 'prices') renderPrices(); else if (ui.deckTab === 'cards') updateDeckList();
      paintCrazy();
    } else if (ui.view === 'decks') {
      var dl = $('#declist'); if (dl) dl.innerHTML = state.decks.filter(function (d) { return d.kind === 'deck'; }).map(deckCard).join('');
    }
  }

  /* ---------- Sincronizzazione (Dropbox, Google Drive) ---------- */
  /* La logica sta in sync.js. Qui: rete (Electron, Android o browser), stato salvato sul dispositivo,
     avvio automatico, e il pannello nella scheda Dati. I token restano in questo dispositivo e non finiscono nei backup. */
  function httpReq(req) {
    var cap = window.Capacitor, nat = cap && cap.Plugins && cap.Plugins.CapacitorHttp;
    function lower(h) { var o = {}; Object.keys(h || {}).forEach(function (k) { o[k.toLowerCase()] = h[k]; }); return o; }
    if (window.cpaNet && window.cpaNet.http) {
      return window.cpaNet.http(req).then(function (r) { if (!r || !r.status) throw new Error((r && r.error) || 'rete'); return { status: r.status, text: r.text || '', headers: lower(r.headers) }; });
    }
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && nat) {
      var h = Object.assign({}, req.headers || {});
      if (req.form) h['Content-Type'] = 'application/x-www-form-urlencoded';
      return nat.request({ url: req.url, method: req.method || 'GET', headers: h, data: req.form || req.body, responseType: 'text' }).then(function (r) {
        return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data), headers: lower(r.headers) };
      });
    }
    var headers = Object.assign({}, req.headers || {}), body = req.body;
    if (req.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = Object.keys(req.form).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(req.form[k]); }).join('&'); }
    return fetch(req.url, { method: req.method || 'GET', headers: headers, body: body }).then(function (r) {
      return r.text().then(function (t) { var hh = {}; r.headers.forEach(function (v, k) { hh[k.toLowerCase()] = v; }); return { status: r.status, text: t, headers: hh }; });
    });
  }
  var SYNC = (function () {
    var LS = 'cpa:sync:v1', inst = null, mem = null, timer = null, pollT = null, running = false, quiet = false, lastTry = 0;
    var view = { busy: false, msg: '', err: '', step: '', url: '', code: '', until: 0 };
    function ready() { return !!window.CPASync && !!store && store.kind !== 'claude'; }
    function lsGet() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }
    function lsSet(v) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) { /* ignorato */ } }
    function device() { var cap = window.Capacitor; return window.cpaNet ? 'Windows' : cap && cap.isNativePlatform && cap.isNativePlatform() ? 'Android' : 'Web'; }
    function get() {
      if (!inst && ready()) {
        inst = window.CPASync.create({ http: httpReq, store: { get: function () { return mem || (mem = lsGet()); }, set: function (v) { mem = v; lsSet(v); } }, config: window.CPA_SYNC || {}, device: device() });
      }
      return inst;
    }
    function sigNow() { return JSON.stringify([state.decks.map(function (d) { return d.id + ':' + d.updatedAt; }), state.settings.basicsUnlimited, state.settings.images]); }
    var ctx = {
      local: function () { return { decks: state.decks, settings: state.settings }; },
      signature: sigNow,
      apply: function (m) {
        var prevIds = state.decks.map(function (d) { return d.id; });
        state.decks = m.decks.map(C.sanitizeDeck);
        state.settings.basicsUnlimited = m.settings.basicsUnlimited; state.settings.images = m.settings.images;
        state.decks.forEach(function (d) { sigs[d.id] = sigOf(d); });
        quiet = true; persistAll(prevIds); quiet = false;
      }
    };
    function repaint() { var el = $('#syncp'); if (el) el.outerHTML = syncHtml(); }
    function who(p) { return p === 'dropbox' ? 'Dropbox' : 'Google Drive'; }
    function errText(e) {
      var p = who(get() && get().linked() || (view.step.indexOf('google') === 0 ? 'google' : 'dropbox'));
      if (!e) return '';
      if (e.code === 'net') return 'Non riesco a raggiungere ' + p + '. Controlla la connessione' + (p === 'Google Drive' && !window.cpaNet && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? ' (il collegamento a Google Drive funziona solo nelle app per Windows e Android)' : '') + '.';
      if (e.code === 'auth') return 'Il collegamento con ' + p + ' è scaduto: scollega e ricollega l\'account.';
      return e.message || 'Errore di sincronizzazione.';
    }
    function summary(r) {
      var parts = [];
      if (r.added.length) parts.push(plural(r.added.length, 'mazzo nuovo', 'mazzi nuovi'));
      if (r.updated.length) parts.push(plural(r.updated.length, 'mazzo aggiornato', 'mazzi aggiornati'));
      if (r.removed.length) parts.push(plural(r.removed.length, 'mazzo eliminato', 'mazzi eliminati'));
      if (r.settings) parts.push('impostazioni aggiornate');
      return parts.length ? 'Sincronizzato: ' + parts.join(', ') + '.' : 'Tutto già sincronizzato.';
    }
    function run(manual) {
      var s = get(); if (!s || !s.linked() || running) return;
      running = true; view.busy = true; view.err = ''; lastTry = Date.now(); repaint();
      s.sync(ctx).then(function (r) {
        running = false; view.busy = false;
        if (r.again) { queue(2500); repaint(); return; }
        view.msg = summary(r);
        if (r.added.length || r.updated.length || r.removed.length || r.settings) { archCache = null; render(); toast(view.msg); }
        else if (manual) toast(view.msg);
        repaint();
      }, function (e) {
        running = false; view.busy = false; view.err = errText(e);
        if (manual || (e && e.code === 'auth')) toast(view.err, null, true);
        repaint();
      });
    }
    function autoOn() { var s = get(); return !!s && s.linked() && s.state().auto !== false; }
    function queue(ms) {
      if (quiet || !autoOn()) return;
      clearTimeout(timer); timer = setTimeout(function () { run(false); }, ms || window.CPA_SYNC_DELAY || 12000);
    }
    function start() {
      if (!autoOn()) return;
      setTimeout(function () { run(false); }, 1500);
      document.addEventListener('visibilitychange', function () { if (!document.hidden && autoOn() && Date.now() - lastTry > 90000) run(false); });
      window.addEventListener('online', function () { if (autoOn()) run(false); });
    }
    function pollStep() {
      clearTimeout(pollT);
      if (view.step !== 'google-code') return;
      pollT = setTimeout(function () {
        get().googlePoll().then(function (r) {
          if (r === 'done') { view.step = ''; view.err = ''; toast('Google Drive collegato.'); repaint(); run(true); }
          else pollStep();
        }, function (e) { view.step = ''; view.err = errText(e); repaint(); });
      }, Math.max(3, view.interval || 5) * 1000 * (window.CPA_POLL_SCALE || 1));
    }
    return {
      view: view, get: get, ready: ready, run: run, queue: queue, start: start, who: who,
      dropboxStart: function () {
        try { view.url = get().dropboxStart().url; view.step = 'dropbox-code'; view.err = ''; } catch (e) { view.err = errText(e); }
        repaint();
      },
      dropboxFinish: function (code) {
        view.busy = true; view.err = ''; repaint();
        get().dropboxFinish(code).then(function () { view.busy = false; view.step = ''; toast('Dropbox collegato.'); repaint(); run(true); }, function (e) { view.busy = false; view.err = errText(e); repaint(); });
      },
      googleStart: function () {
        view.busy = true; view.err = ''; repaint();
        get().googleStart().then(function (r) {
          view.busy = false; view.step = 'google-code'; view.code = r.userCode; view.url = r.url; view.interval = r.interval; repaint(); pollStep();
        }, function (e) { view.busy = false; view.err = errText(e); repaint(); });
      },
      cancel: function () { clearTimeout(pollT); view.step = ''; view.err = ''; repaint(); },
      unlink: function () { clearTimeout(pollT); clearTimeout(timer); if (get()) get().unlink(); view.step = ''; view.msg = ''; view.err = ''; toast('Sincronizzazione scollegata. I dati su questo dispositivo restano.'); repaint(); },
      setAuto: function (on) { var st = get().state(); st.auto = on; lsSet(st); if (on) queue(500); }
    };
  })();
  function whenText(ts) {
    if (!ts) return 'mai';
    var d = new Date(ts), t = new Date(), same = d.toDateString() === t.toDateString();
    return (same ? 'oggi' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })) + ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  function syncHtml() {
    var S = SYNC.get(), v = SYNC.view;
    if (!S) return '<span id="syncp" hidden></span>';
    var linked = S.linked(), st = S.state();
    var head = '<h2 class="sect" style="margin:0">Sincronizzazione</h2>';
    var msg = (v.err ? '<p class="err" role="alert">' + esc(v.err) + '</p>' : v.msg && linked ? '<p class="hint" role="status">' + esc(v.msg) + '</p>' : '');
    if (linked) {
      return '<section class="panel" id="syncp">' + head +
        '<p class="sub"><b>Collegato a ' + esc(SYNC.who(linked)) + '</b> · ultima sincronizzazione: ' + esc(whenText(st.lastSync)) + '</p>' +
        '<label class="switch"><input type="checkbox" data-c="sync-auto"' + (st.auto !== false ? ' checked' : '') + '><span class="tr"></span><span>Sincronizza in automatico</span></label>' +
        '<p class="hint">Mazzi, upgrade, stati, bracket, stampe scelte e impostazioni (tranne il tema) viaggiano tra i tuoi dispositivi. I design del Designer restano su ciascun dispositivo. Un mazzo cancellato qui sparisce anche altrove.</p>' + msg +
        '<div class="btns"><button class="btn primary" data-a="sync-now"' + (v.busy ? ' disabled' : '') + '>' + (v.busy ? 'Sincronizzo…' : 'Sincronizza ora') + '</button><button class="btn small danger' + (armed('sync-unlink') ? ' armed' : '') + '" data-a="sync-unlink" data-cf="1">' + (armed('sync-unlink') ? 'Conferma: scollega' : 'Scollega') + '</button></div></section>';
    }
    var cfgD = S.configured('dropbox'), cfgG = S.configured('google');
    var body;
    if (v.step === 'dropbox-code') {
      body = '<ol class="steps"><li><b>Apri Dropbox</b> e consenti l\'accesso: <a class="btn small" href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer">Apri Dropbox</a></li>' +
        '<li><b>Copia il codice</b> che ti mostra e incollalo qui.</li></ol>' +
        '<div class="srow"><input class="input" data-c="sync-code" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Codice di Dropbox" aria-label="Codice di Dropbox"><button class="btn primary" data-a="sync-dbx-ok"' + (v.busy ? ' disabled' : '') + '>Conferma</button></div>' +
        '<div class="btns"><button class="btn small ghost" data-a="sync-cancel">Annulla</button></div>';
    } else if (v.step === 'google-code') {
      body = '<ol class="steps"><li><b>Apri</b> <a href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer">' + esc(String(v.url).replace(/^https?:\/\//, '')) + '</a> su qualunque dispositivo.</li><li><b>Digita questo codice</b> e consenti l\'accesso:</li></ol>' +
        '<p class="usercode" aria-label="Codice">' + esc(v.code) + '</p><p class="hint"><span class="spin" aria-hidden="true"></span> Aspetto la tua conferma…</p>' +
        '<div class="btns"><button class="btn small ghost" data-a="sync-cancel">Annulla</button></div>';
    } else {
      body = '<div class="prov"><div class="pcard"><h3>Dropbox</h3><p class="hint">Funziona ovunque, anche nella versione web.</p>' +
        '<button class="btn primary" data-a="sync-dbx"' + (cfgD ? '' : ' disabled') + '>Collega Dropbox</button></div>' +
        '<div class="pcard"><h3>Google Drive</h3><p class="hint">Solo nelle app per Windows e Android.</p>' +
        '<button class="btn primary" data-a="sync-ggl"' + (cfgG && !v.busy ? '' : ' disabled') + '>Collega Google Drive</button></div></div>';
    }
    var keys = S.keys();
    var cfg = (!cfgD || !cfgG) && !v.step ? '<details class="how"' + (!cfgD && !cfgG ? ' open' : '') + '><summary>Prima configurazione</summary><p>Per collegare un servizio serve una chiave dell\'app, che si crea gratis una volta sola (la guida passo passo è nel README). Incollala qui: resta solo su questo dispositivo.</p>' +
      (cfgD ? '' : '<label class="lbl">Chiave dell\'app Dropbox<input class="input" data-c="sync-key" data-k="dropbox" autocomplete="off" spellcheck="false" value="' + esc(keys.dropbox) + '"></label>') +
      (cfgG ? '' : '<label class="lbl">ID client Google<input class="input" data-c="sync-key" data-k="googleId" autocomplete="off" spellcheck="false" value="' + esc(keys.googleId) + '"></label><label class="lbl">Segreto client Google<input class="input" data-c="sync-key" data-k="googleSecret" autocomplete="off" spellcheck="false" value="' + esc(keys.googleSecret) + '"></label>') +
      '</details>' : '';
    return '<section class="panel" id="syncp">' + head +
      '<p class="hint">Tieni archivio, mazzi e impostazioni uguali sul PC e sul telefono con il tuo Dropbox o il tuo Google Drive. L\'app salva un solo piccolo file nella sua cartella riservata e non tocca nient\'altro.</p>' + body + msg + cfg + '</section>';
  }

  /* ---------- Mazzi ---------- */
  var STATUS = [['active', 'Attivo'], ['unprinted', 'Non ancora stampato'], ['inactive', 'Non attivo']];
  function statusSelect(d, id, cls) {
    var cur = C.statusOf(d);
    return '<select class="select ' + (cls || '') + '" data-c="' + (id || 'status') + '" data-id="' + esc(d.id || '') + '" aria-label="Stato del mazzo">' + STATUS.map(function (o) {
      return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select>';
  }
  function switchHtml(d) { return statusSelect(d, 'status', 'stsel'); }
  function statusHint(d) {
    var st = C.statusOf(d);
    return st === 'active' ? 'Mazzo montato: le sue carte risultano in uso.' :
      st === 'unprinted' ? 'Non ancora stampato: le sue carte non entrano nell\'archivio finché non lo stampi. Quando è pronto, passalo ad Attivo.' :
        'Mazzo smontato: le sue carte risultano libere e le ritrovi anche tra le carte disponibili per altri mazzi.';
  }
  function deckCard(d) {
    var on = d.kind === 'deck' && d.active, np = d.kind === 'deck' && C.statusOf(d) === 'unprinted';
    var meta = d.kind === 'deck' ? (d.commander ? 'Commander: ' + esc(d.commander) : 'Nessun commander scelto') : 'Carte sciolte, sempre disponibili';
    var cc = CARDS.get(), dv = cc && CARDS.enabled() ? cc.valueDeck(d, C.isBasic) : null;
    var worth = dv && dv.ready && dv.cards.length ? ' · <span class="worth" title="Costo se fosse reale, con le stampe del mazzo">' + eurF(dv.total) + '</span>' : '';
    return '<article class="deckcard' + (on ? ' is-on' : np ? ' is-np' : '') + '"><div class="top"><div><h2>' + esc(d.name) + (d.kind === 'deck' ? bracketBadge(d) : '') + '</h2><div class="meta">' + meta + ' · ' + plural(sum(d.cards), 'carta', 'carte') + (C.countOf(d.side) ? ' + ' + C.countOf(d.side) + ' in sideboard' : '') + worth + '</div></div>' +
      (d.kind === 'deck' ? switchHtml(d) : '') + '</div><div class="foot"><span>' +
      (d.upgrades.length ? '<span class="pill info">' + plural(d.upgrades.length, 'upgrade', 'upgrade') + '</span>' : '<span class="hint">Nessun upgrade</span>') +
      '</span><span class="btns">' + (d.kind === 'deck' ? bracketBtn(d) : '') + '<button class="btn small" data-a="open-deck" data-id="' + esc(d.id) + '">Apri</button></span></div></article>';
  }
  function bracketBadge(d) {
    var b = d.bracket; if (!b) return '';
    var stale = !b.manual && b.sig !== C.deckSig(d);
    var txt = b.n ? b.n : '✕';
    return '<span class="bk-badge b' + b.n + (stale ? ' stale' : '') + '" title="' + esc(b.n ? 'Bracket ' + b.n : 'Contiene carte bandite') +
      (b.manual ? ' (impostato a mano)' : stale ? ' (calcolato prima delle ultime modifiche al mazzo: ricalcola)' : '') + '" aria-label="' + esc(b.n ? 'Bracket ' + b.n : 'Carte bandite') + '">' + txt + '</span>';
  }
  function analysisBtn(d) {
    return '<button class="btn small" data-a="analysis" data-id="' + esc(d.id) + '" title="Curva di mana, colori, tipi, fonti, identità e legalità">Analisi del piscio</button>';
  }
  function bracketBtn(d) {
    return '<button class="btn small bracket" data-a="bracket" data-id="' + esc(d.id) + '" title="Calcola il bracket del mazzo">Verifica bracket</button>';
  }
  function decksView() {
    var ds = state.decks.filter(function (d) { return d.kind === 'deck'; }), bs = state.decks.filter(function (d) { return d.kind === 'binder'; });
    if (!state.decks.length) return '<header class="vh"><h1>Mazzi</h1></header>' + welcome();
    var act = ds.filter(function (d) { return d.active; }).length, np = ds.filter(function (d) { return C.statusOf(d) === 'unprinted'; }).length;
    return '<header class="vh"><h1>Mazzi</h1><p class="sub"><b>' + act + '</b> attivi su <b>' + ds.length + '</b>' + (np ? ' · <b>' + np + '</b> da stampare' : '') + '. Un mazzo attivo è montato: le sue carte risultano in uso nell\'archivio.</p></header>' +
      '<div class="btns" style="margin-bottom:12px"><button class="btn primary" data-a="nav" data-v="import">Importa un mazzo</button></div>' +
      '<div class="list" id="declist">' + ds.map(deckCard).join('') + '</div>' +
      (bs.length ? '<h2 class="sect">Carte sciolte</h2><div class="list">' + bs.map(deckCard).join('') + '</div>' : '');
  }
  /* ---------- Pagina del mazzo (stile Moxfield) ---------- */
  /* Banner con l'artwork del commander, lista a tutta pagina divisa per tipo, anteprima a lato (passando il mouse),
     cambio stampa con il prezzo accanto al nome e, in basso, la barra banana con i conteggi e «Calcola valore mazzo». */
  var DK_TYPES = [
    ['creature', 'Creature'], ['planeswalker', 'Planeswalker'], ['battle', 'Battaglie'], ['sorcery', 'Stregonerie'], ['enchantment', 'Incantesimi'],
    ['instant', 'Istantanei'], ['artifact', 'Artefatti'], ['land', 'Terre'], ['other', 'Altre carte']
  ];
  var DK_SVG = {
    creature: '<circle cx="8" cy="10.5" r="3"/><circle cx="3.5" cy="7" r="1.3"/><circle cx="6" cy="3.8" r="1.3"/><circle cx="10" cy="3.8" r="1.3"/><circle cx="12.5" cy="7" r="1.3"/>',
    planeswalker: '<path d="M8 1.500l5.500 6.500L8 14.500 2.500 8z"/>',
    battle: '<path d="M3 3l10 10M13 3L3 13"/>',
    sorcery: '<path d="M8 1.500c.5 2.500 3.800 4 3.800 7.200a3.800 3.800 0 0 1-7.600 0c0-1.600.8-2.400 1.600-3.300.1 1 .7 1.700 1.400 1.900C7.300 5.700 7.500 3.500 8 1.500z"/>',
    enchantment: '<path d="M8 1.500l1.800 4 4.200.5-3.200 2.800.9 4.200L8 10.800 4.300 13l.9-4.200L2 6l4.200-.5z"/>',
    instant: '<path d="M9 1.500L3.500 9H8l-1 5.500L12.500 7H8z"/>',
    artifact: '<path d="M8 1.500l5.200 3v6L8 14.500l-5.200-4v-6z"/><circle cx="8" cy="8" r="2"/>',
    land: '<path d="M1.500 13.500L6 5l3 5 1.500-2.500 4 6z"/>',
    other: '<circle cx="8" cy="8" r="5.500"/><path d="M8 5v3.500M8 11v.1"/>',
    cmd: '<path d="M2 12.500l1.500-7 3 3L8 3.500l1.500 5 3-3 1.500 7z"/>',
    side: '<rect x="2" y="6" width="12" height="7.500" rx="1.500"/><path d="M4.500 3.500h7M3.200 4.800h9.600"/>'
  };
  function dkIcon(k) { return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (DK_SVG[k] || DK_SVG.other) + '</svg>'; }
  var IC_SWAP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.500 5.500h9L9.500 3.500M13.500 10.500h-9l2 2"/></svg>';

  function dkType(c, rec) {
    if (C.isBasic(c.name)) return 'land';
    if (!rec) return 'other';
    var t = String(rec.t || '').split('//')[0].toLowerCase();
    return /creature/.test(t) ? 'creature' : /land/.test(t) ? 'land' : /planeswalker/.test(t) ? 'planeswalker' : /battle/.test(t) ? 'battle' :
      /artifact/.test(t) ? 'artifact' : /enchantment/.test(t) ? 'enchantment' : /sorcery/.test(t) ? 'sorcery' : /instant/.test(t) ? 'instant' : 'other';
  }
  /* il riassunto per il tipo vale per qualunque stampa; quello per il prezzo deve essere della stampa del mazzo */
  function dkRec(cc, c) { return cc ? ((c.set ? cc.rec(c.name, c.set, c.cn) : cc.rec(c.name, '', '')) || cc.any(c.name)) : null; }
  function dkPriceRec(cc, c) { return cc ? (c.set ? cc.rec(c.name, c.set, c.cn) : (cc.rec(c.name, '', '') || cc.any(c.name))) : null; }
  function dkIsCmd(d, c) { return d.kind === 'deck' && !!d.commander && C.keyOf(d.commander) === C.keyOf(c.name); }
  function dkSame(c, p) { return p && C.keyOf(c.name) === C.keyOf(p.n) && (c.set || '') === (p.s || '') && (c.cn || '') === (p.c || '') && (c.mpc || '') === (p.m || ''); }
  function dkAside() { return !!(window.matchMedia && window.matchMedia('(min-width: 1100px)').matches); }
  function dkAgo(ts) {
    if (!ts) return '';
    var n = Math.floor((Date.now() - ts) / 864e5);
    return n <= 0 ? 'oggi' : n === 1 ? 'ieri' : n + ' giorni fa';
  }
  function dkAttrs(c) { return ' data-n="' + esc(c.name) + '" data-s="' + esc(c.set || '') + '" data-c="' + esc(c.cn || '') + '"' + (c.mpc ? ' data-mp="' + esc(c.mpc) + '"' : ''); }

  /* Scarica una volta sola i dati delle carte che mancano (tipo e prezzo della stampa del mazzo). */
  function dkAuto(d) {
    var cc = CARDS.get(); if (!cc || !CARDS.loaded() || !CARDS.enabled() || CARDS.st.busy || CARDS.st.err) return;
    var need = cc.pricedCards(d, C.isBasic).filter(function (c) { return !dkPriceRec(cc, c) && !cc.known(c.name, c.set, c.cn); });
    if (!need.length) return;
    var ents = need.map(function (c) { return { name: c.name, set: c.set, cn: c.cn }; });
    CARDS.run('deck', function (prog) { return cc.ensure(ents, {}, prog); });
  }

  function dkRows(d, side) {
    var cc = CARDS.get(), A = getArchive(), q = C.searchNorm(ui.deckQ), out = [];
    (side ? (d.side || []) : d.cards).forEach(function (c) {
      var rec = dkRec(cc, c), pr = dkPriceRec(cc, c), e = A.map[C.keyOf(c.name)];
      out.push({
        c: c, side: !!side, rec: rec, type: side ? 'side' : dkIsCmd(d, c) ? 'cmd' : dkType(c, rec), realType: dkType(c, rec), pr: pr, unit: pr ? window.CPACards.unitPrice(pr) : null,
        others: e ? e.rows.filter(function (r) { return r.deckId !== d.id; }) : [], hit: !q || C.searchNorm(c.name).indexOf(q) >= 0
      });
    });
    return out;
  }
  /* una riga si riconosce da nome, stampa, design e lista (mazzo o sideboard) */
  function dkKey(c, side) { return (side ? 'S' : 'M') + '|' + C.keyOf(c.name) + '|' + (c.set || '') + '|' + (c.cn || '') + '|' + (c.design || '') + '|' + (c.mpc || ''); }
  function dkTarget(el) { return { name: el.dataset.n, set: el.dataset.s || '', cn: el.dataset.c || '', design: el.dataset.dz || '', mpc: el.dataset.mp || '' }; }
  function dkFind(d, p) {
    if (!p) return null;
    return d.cards.filter(function (x) { return dkSame(x, p); })[0] || (d.side || []).filter(function (x) { return dkSame(x, p); })[0] || null;
  }
  function dkMenu(d, r) {
    var c = r.c, side = r.side, at = dkAttrs(c) + ' data-dz="' + esc(c.design || '') + '" data-side="' + (side ? 1 : '') + '"', cmd = !side && dkIsCmd(d, c);
    var b = function (a, k, label, cls) { return '<button class="btn small' + (cls ? ' ' + cls : '') + '" data-a="' + a + '"' + (k != null ? ' data-k="' + k + '"' : '') + at + '>' + label + '</button>'; };
    return '<div class="drm" role="group" aria-label="Azioni su ' + esc(c.name) + '">' + b('dr-qty', '1', '+ una copia') + b('dr-qty', '-1', c.qty > 1 ? '− una copia' : '− togli') +
      (d.kind === 'deck' && !cmd ? b('dr-move', '1', side ? '↑ Rimetti nel mazzo' : '↓ Sposta in sideboard') : '') +
      (d.kind === 'deck' && !cmd && c.qty > 1 ? b('dr-move', '', side ? '↑ Rimetti tutte' : '↓ Sposta tutte') : '') +
      b('dr-del', null, 'Rimuovi' + (c.qty > 1 ? ' tutte' : ''), 'danger') + '</div>';
  }
  function dkSort(rows) {
    var by = ui.dSort;
    return rows.slice().sort(function (a, b) {
      if (by === 'cmc') return ((a.rec ? a.rec.v : 99) - (b.rec ? b.rec.v : 99)) || byName(a.c, b.c);
      if (by === 'price') return ((b.unit == null ? -1 : b.unit) - (a.unit == null ? -1 : a.unit)) || byName(a.c, b.c);
      return byName(a.c, b.c);
    });
  }
  function dkRow(d, r) {
    var c = r.c, cc = CARDS.get(), basic = C.isBasic(c.name), st = CARDS.st;
    var seed = IMG.thumb(c.name, c.set, c.cn, d.id).replace('class="th', 'class="th seed');
    if (c.mpc) seed = seed.replace('<span class="th', '<span data-thm="' + esc(c.mpc) + '" class="th');
    var pv = '';
    if (!c.design && !basic) pv = r.pr ? (r.unit != null ? '(' + eurF(r.unit) + ')' : '(n.d.)') : (CARDS.enabled() && !st.err ? '(…)' : '');
    var tip = 'Cambia stampa' + (c.set ? ' · ora ' + String(c.set).toUpperCase() + (c.cn ? ' ' + c.cn : '') : ' · stampa non indicata');
    var oth = r.others.length ? '<span class="oth ' + (r.others.some(function (x) { return x.active; }) ? 'use' : 'free') + '" title="' + esc('Anche in ' + r.others.map(function (x) { return x.deckName + ' ×' + x.qty + (x.active ? ' (in uso)' : ' (libera)'); }).join(', ')) + '">+' + r.others.length + '</span>' : '';
    var sel = dkSame(c, ui.dprev), open = ui.dmenu === dkKey(c, r.side);
    return '<div class="dr' + (sel ? ' sel' : '') + (open ? ' mn' : '') + (c.mpc ? ' mpr' : '') + '" data-a="dr-open" tabindex="0"' + dkAttrs(c) + '>' + seed + '<span class="q">' + c.qty + '</span><span class="n">' + esc(c.name) + '</span>' +
      (c.design ? '<span class="tag dzt">Design</span>' : '') + (c.mpc ? '<span class="mpl">' + mpcTags(c) + '</span>' : '') + oth +
      (window.CPADesigner ? (c.design ? '<button class="btn small dzb" data-a="dz-unbind" data-deck="' + esc(d.id) + '" data-name="' + esc(c.name) + '">Togli design</button>' : '<button class="btn small dzb" data-a="dz-bind" data-deck="' + esc(d.id) + '" data-name="' + esc(c.name) + '">Design</button>') : '') +
      (c.design ? '' : '<button class="pb" data-a="dr-prints"' + dkAttrs(c) + ' title="' + esc(tip) + '" aria-label="' + esc('Cambia stampa di ' + c.name) + '">' + IC_SWAP + (pv ? '<span class="pv">' + pv + '</span>' : '') + '</button>') +
      '<button class="dmb" data-a="dr-menu"' + dkAttrs(c) + ' data-dz="' + esc(c.design || '') + '" data-side="' + (r.side ? 1 : '') + '" aria-expanded="' + open + '" title="Aggiungi, togli o sposta" aria-label="' + esc('Azioni su ' + c.name) + '">⋯</button></div>' +
      (open ? dkMenu(d, r) : '');
  }
  function dkGroup(d, key, label, rows) {
    var n = rows.reduce(function (t, r) { return t + r.c.qty; }, 0);
    return '<section class="dg" data-g="' + key + '"><h3>' + dkIcon(key) + '<span>' + label + '</span><i>' + n + '</i></h3>' + rows.map(function (r) { return dkRow(d, r); }).join('') + '</section>';
  }
  function updateDeckList() {
    var el = $('#dlist'), d = getDeck(); if (!d) return;
    dkBarPaint();
    if (!el) return;
    var rows = dkRows(d), shown = rows.filter(function (r) { return r.hit; }), html = '';
    var by = {}; shown.forEach(function (r) { (by[r.type] = by[r.type] || []).push(r); });
    var onlyOther = Object.keys(by).every(function (k) { return k === 'other' || k === 'cmd'; });
    if (by.cmd) html += dkGroup(d, 'cmd', 'Commander', dkSort(by.cmd));
    DK_TYPES.forEach(function (t) { if (by[t[0]]) html += dkGroup(d, t[0], t[0] === 'other' && onlyOther ? 'Carte' : t[1], dkSort(by[t[0]])); });
    var srows = dkRows(d, true).filter(function (r) { return r.hit; });
    if (srows.length) html += dkGroup(d, 'side', 'Sideboard', dkSort(srows));
    el.innerHTML = html || '<p class="hint">Nessuna carta trovata.</p>';
    var st = CARDS.st, line = '';
    if (CARDS.ready() && !CARDS.enabled()) line = '<p class="hint">Senza Scryfall (qui non è raggiungibile) non posso dividere le carte per tipo né mostrare i prezzi.</p>';
    else if (st.busy && (st.what === 'deck' || st.what === 'prices')) line = '<p class="hint"><span class="spin" aria-hidden="true"></span> Scarico i dati delle carte da Scryfall: <b>' + st.done + '</b> su ' + st.total + '. La prima volta ci vuole un momento.</p>';
    else if (st.err) line = '<p class="err">' + esc(st.err) + ' <button class="link" data-a="dr-retry">Riprova</button></p>';
    var se = $('#dstat'); if (se) { se.innerHTML = line; se.hidden = !line; }
    IMG.hydrate();
    dkAuto(d);
  }
  function dkBarPaint() {
    var el = $('#dbar'), d = getDeck(); if (!el || !d) return;
    var cc = CARDS.get(), cnt = {}, total = 0, keys = 0;
    d.cards.forEach(function (c) { var t = dkType(c, dkRec(cc, c)); cnt[t] = (cnt[t] || 0) + c.qty; total += c.qty; });
    Object.keys(cnt).forEach(function () { keys++; });
    var tys = keys === 1 && cnt.other ? '' : DK_TYPES.filter(function (t) { return cnt[t[0]]; }).map(function (t) {
      return '<span class="ty" title="' + esc(t[1] + ': ' + cnt[t[0]]) + '">' + dkIcon(t[0]) + '<b>' + cnt[t[0]] + '</b><span class="sr">' + esc(t[1]) + '</span></span>';
    }).join('');
    var ns = C.countOf(d.side), sb = ns ? '<span class="ty sb" title="' + esc('Sideboard: ' + ns) + '">' + dkIcon('side') + '<b>' + ns + '</b><span class="sr">Sideboard</span></span>' : '';
    el.innerHTML = '<span class="tot"><b>' + total + '</b> ' + (total === 1 ? 'carta' : 'carte') + '</span>' + (tys || sb ? '<span class="tys">' + tys + sb + '</span>' : '<span class="tys"></span>') +
      (CARDS.ready() ? '<button class="calc" data-a="crazy-open">Calcola valore mazzo</button>' : '');
  }

  /* anteprima a lato: l'ultima carta su cui si è passati resta lì, così si può usare anche il bottone */
  function dkPrevHtml(d) {
    var p = ui.dprev, c = dkFind(d, p);
    if (!c) return '<div class="pv-empty"><p>Passa il mouse su una carta per vederla qui.</p></div>';
    var cc = CARDS.get(), pr = dkPriceRec(cc, c), unit = pr ? window.CPACards.unitPrice(pr) : null, rec = dkRec(cc, c);
    var back = ui.dflip && IMG.hasBack(c.name, c.set, c.cn);
    var big = c.mpc && MPCM ? MPCM.imageUrl(c.mpc, 900) : IMG.pic(c.name, c.set, c.cn, 'normal', back);
    var A = getArchive(), e = A.map[C.keyOf(c.name)], others = e ? e.rows.filter(function (r) { return r.deckId !== d.id; }) : [];
    return '<div class="pv-img">' + (big ? '<img src="' + esc(big) + '" alt="' + esc(c.name) + '"' + (c.mpc ? ' referrerpolicy="no-referrer"' : '') + (IMG.hasBack(c.name, c.set, c.cn) ? ' data-a="dr-flip" title="Gira la carta"' : '') + '>' : '<div class="pv-ph"><span>' + esc(c.name) + '</span></div>') + '</div>' +
      '<div class="pv-name">' + esc(c.name) + '</div>' +
      (c.mpc ? '<div class="pv-mpc">' + mpcTags(c) + (c.msrc ? '<span class="pv-by">di ' + esc(c.msrc) + '</span>' : '') + '</div>' : '') + '<div class="pv-meta">' + (c.set ? esc(String(c.set).toUpperCase()) + (c.cn ? ' ' + esc(c.cn) : '') : 'stampa non indicata') + (!c.design && !C.isBasic(c.name) && unit != null ? ' · ' + eurF(unit) : '') + '</div>' +
      (rec && rec.t ? '<div class="pv-type">' + esc(rec.t) + '</div>' : '') +
      (others.length ? '<div class="pv-oth">' + others.map(function (r) {
        return '<span class="pill ' + (r.active ? 'use' : 'free') + '">anche in ' + esc(r.deckName) + ' ×' + r.qty + (r.active ? ' · in uso' : ' · libera') + '</span>';
      }).join('') + '</div>' : '') +
      '<div class="pv-act">' + (c.design ? '' : '<button class="btn small" data-a="dr-prints"' + dkAttrs(c) + '>Cambia stampa</button>') +
      (window.CPADesigner ? (c.design ? '<button class="btn small" data-a="dz-unbind" data-deck="' + esc(d.id) + '" data-name="' + esc(c.name) + '">Togli design</button>' : '<button class="btn small" data-a="dz-bind" data-deck="' + esc(d.id) + '" data-name="' + esc(c.name) + '">Design</button>') : '') + '</div>';
  }
  function dprevPaint() { var el = $('#dprev'), d = getDeck(); if (el && d) el.innerHTML = dkPrevHtml(d); }
  function dkSelect(row) {
    var p = { n: row.dataset.n, s: row.dataset.s, c: row.dataset.c, m: row.dataset.mp || '' };
    if (ui.dprev && ui.dprev.n === p.n && ui.dprev.s === p.s && ui.dprev.c === p.c && (ui.dprev.m || '') === p.m) return;
    ui.dprev = p; ui.dflip = false;
    [].forEach.call(document.querySelectorAll('.dr.sel'), function (x) { x.classList.remove('sel'); });
    row.classList.add('sel');
    dprevPaint();
  }
  function dkHeroArt() {
    var h = $('.dk-hero'), d = getDeck(); if (!h || !d || !d.commander) return;
    var c = d.cards.filter(function (x) { return dkIsCmd(d, x); })[0]; if (!c) return;
    var u = IMG.pic(c.name, c.set, c.cn, 'art_crop');
    if (u) { h.style.setProperty('--art', 'url(' + u + ')'); h.classList.add('has-art'); }
  }
  IMG.onFill(function () {
    if (ui.view === 'deck') { dprevPaint(); dkHeroArt(); }
    var bh = document.querySelector('.bkr-head[data-n]');
    if (bh && !bh.classList.contains('has-art')) {
      var u = IMG.pic(bh.dataset.n, bh.dataset.s, bh.dataset.c, 'art_crop');
      if (u) { bh.style.setProperty('--art', 'url(' + u + ')'); bh.classList.add('has-art'); }
    }
  });

  function dkHero(d) {
    var cmdCard = d.kind === 'deck' && d.commander ? d.cards.filter(function (x) { return dkIsCmd(d, x); })[0] : null;
    var seed = cmdCard ? IMG.thumb(cmdCard.name, cmdCard.set, cmdCard.cn).replace('class="th', 'class="th seed') : '';
    var art = cmdCard ? IMG.pic(cmdCard.name, cmdCard.set, cmdCard.cn, 'art_crop') : '';
    var ago = dkAgo(d.updatedAt);
    return '<header class="dk-hero' + (art ? ' has-art' : '') + '"' + (art ? ' style="--art:url(' + esc(art) + ')"' : '') + '>' + seed +
      '<button class="back" data-a="nav" data-v="decks">← Mazzi</button>' +
      '<h1>' + esc(d.name) + (d.kind === 'deck' ? bracketBadge(d) : '') + '</h1>' +
      '<div class="dk-meta"><span class="hc fmt">' + (d.kind === 'deck' ? 'Commander' : 'Carte sciolte') + '</span>' +
      (d.kind === 'deck' ? (d.commander ? '<span class="hc">' + esc(d.commander) + '</span>' : '<span class="hc">Nessun commander</span>') + switchHtml(d) : '') +
      (ago ? '<span class="hc dim">aggiornato ' + ago + '</span>' : '') + '</div>' +
      '<div class="dk-hact">' + (d.kind === 'deck' ? bracketBtn(d) + analysisBtn(d) : '') + '<button class="btn small" data-a="make-pdf" data-id="' + esc(d.id) + '">Crea PDF</button>' +
      '<button class="btn small" data-a="deck-man" aria-expanded="' + !!ui.dMan + '" aria-controls="dman">Gestisci</button></div></header>';
  }
  function deckView() {
    var d = getDeck(); if (!d) { ui.view = 'decks'; return decksView(); }
    var armedDel = armed('del-deck:' + d.id);
    var cmdOpts = '<option value="">Nessuno</option>' + d.cards.slice().sort(byName).map(function (c) {
      return '<option value="' + esc(c.name) + '"' + (c.name === d.commander ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    var cardsTab = ui.deckTab !== 'prices' && ui.deckTab !== 'ups' || (ui.deckTab === 'ups' && d.kind !== 'deck') || (ui.deckTab === 'prices' && !CARDS.ready());
    var tabs = '<div class="subtabs"><button class="chip" data-a="deck-tab" data-v="cards" aria-pressed="' + cardsTab + '">Lista</button>' +
      (d.kind === 'deck' ? '<button class="chip" data-a="deck-tab" data-v="ups" aria-pressed="' + (ui.deckTab === 'ups') + '">Upgrade (' + d.upgrades.length + ')</button>' : '') +
      (CARDS.ready() ? '<button class="chip" data-a="deck-tab" data-v="prices" aria-pressed="' + (ui.deckTab === 'prices') + '">Prezzi</button>' : '') + '</div>';
    var opt = function (v, l) { return '<option value="' + v + '"' + (ui.dSort === v ? ' selected' : '') + '>' + l + '</option>'; };
    var tools = '<div class="dk-tools">' + tabs + (cardsTab ? '<button class="btn small dk-addb" data-a="dadd-toggle" aria-expanded="' + !!ui.dAdd + '" aria-controls="dadd">+ Aggiungi carta</button><div class="search dk-q">' + IC.search + '<input class="input" data-c="deckq" type="search" placeholder="Cerca nelle carte del mazzo" autocomplete="off" aria-label="Cerca nel mazzo" value="' + esc(ui.deckQ) + '"></div>' +
      '<label class="dk-sort">Ordina<select class="select" data-c="dsort" aria-label="Ordina le carte">' + opt('name', 'Nome') + opt('cmc', 'Costo di mana') + opt('price', 'Prezzo') + '</select></label>' : '') + '</div>';
    var man = '<section class="panel dk-man" id="dman"' + (ui.dMan ? '' : ' hidden') + '><label class="lbl">Nome<input class="input" data-c="deck-name" value="' + esc(d.name) + '"></label>' +
      (d.kind === 'deck' ? '<label class="lbl">Commander<select class="select" data-c="deck-cmd">' + cmdOpts + '</select></label><p class="hint">' + statusHint(d) + '</p>' : '<p class="hint">Carte sciolte: sempre disponibili per i tuoi prossimi mazzi.</p>') +
      '<div class="btns"><button class="btn small" data-a="export-deck">Scarica lista .txt</button><button class="btn small" data-a="copy-deck">Copia lista</button><button class="btn small danger' + (armedDel ? ' armed' : '') + '" data-a="del-deck" data-cf="1" data-id="' + esc(d.id) + '">' + (armedDel ? 'Conferma eliminazione' : 'Elimina il mazzo') + '</button></div></section>';
    var body;
    if (ui.deckTab === 'prices' && CARDS.ready()) {
      body = '<div id="prices" class="prices dk-narrow"></div>';
    } else if (ui.deckTab === 'ups' && d.kind === 'deck') {
      body = '<div class="dk-narrow"><div class="btns" style="margin-bottom:12px"><button class="btn primary" data-a="new-up">Nuovo upgrade</button></div>' +
        (d.upgrades.length ? '<div class="list">' + d.upgrades.map(function (u) { return upgradeCard(d, u); }).join('') + '</div>' :
          '<div class="empty"><p>Incolla la lista aggiornata di questo mazzo: vedrai cosa esce, cosa entra e quali carte hai già nell\'archivio, così non ristampi doppioni.</p></div>') + '</div>';
    } else {
      body = '<div class="dk-main"><aside class="dk-prev" id="dprev" aria-label="Anteprima della carta">' + dkPrevHtml(d) + '</aside><div class="dk-list"><div id="dstat" hidden></div><div class="dk-cols" id="dlist"></div></div></div>';
    }
    return '<div class="dk">' + dkHero(d) + man + tools + (cardsTab ? daddHtml(d) : '') + body + '<div class="dk-bar" id="dbar" role="region" aria-label="Riepilogo del mazzo"></div></div>';
  }

  /* ---------- aggiungere, togliere e spostare carte a mano ---------- */
  var dsugTimer = null;
  function daddHtml(d) {
    var side = d.kind === 'deck';
    return '<section class="panel dk-add" id="dadd"' + (ui.dAdd ? '' : ' hidden') + '><div class="dadd-row">' +
      '<label class="lbl dadd-name">Carta<textarea class="input" rows="1" data-c="dadd-q" id="dadd-q" placeholder="Es. Sol Ring, oppure 2 Sol Ring (C21) 263" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></label>' +
      '<label class="lbl dadd-qty">Copie<input class="input" type="number" min="1" max="99" value="1" data-c="dadd-n" id="dadd-n" inputmode="numeric"></label>' +
      (side ? '<label class="lbl dadd-to">Dove<select class="select" data-c="dadd-to"><option value="main"' + (ui.dAddSide ? '' : ' selected') + '>Mazzo</option><option value="side"' + (ui.dAddSide ? ' selected' : '') + '>Sideboard</option></select></label>' : '') +
      '<button class="btn primary dadd-go" id="dadd-go" data-a="dadd-go">Aggiungi</button></div><div id="dadd-sug"></div>' +
      '<div id="dadd-msg" class="dadd-msg" role="status" aria-live="polite"></div></section>';
  }
  function daddPaint() {
    var sg = $('#dadd-sug'), mg = $('#dadd-msg'), go = $('#dadd-go');
    if (sg) sg.innerHTML = ui.dSug.length ? '<ul class="dadd-sug" aria-label="Suggerimenti">' + ui.dSug.map(function (n) {
      return '<li><button class="link" data-a="dadd-pick" data-v="' + esc(n) + '">' + esc(n) + '</button></li>';
    }).join('') + '</ul>' : '';
    if (mg) mg.innerHTML = ui.dAddBusy ? '<span class="spin" aria-hidden="true"></span> Cerco su Scryfall…' :
      (ui.dAddMsg ? esc(ui.dAddMsg) + (ui.dAddPend ? ' <button class="link" data-a="dadd-force">Aggiungi comunque</button>' : '') : '');
    if (go) go.disabled = !!ui.dAddBusy;
  }
  function daddSuggest(v) {
    clearTimeout(dsugTimer);
    var line = String(v || '').split('\n')[0], name = line.replace(/^\d+\s*[xX]?\s+/, '').replace(/\s+[(\[].*$/, '').trim(), cc = CARDS.get();
    ui.dAddMsg = ''; ui.dAddPend = null;
    if (name.length < 2 || /\n/.test(v) || !cc || !CARDS.enabled() || typeof cc.autocomplete !== 'function') { ui.dSug = []; daddPaint(); return; }
    dsugTimer = setTimeout(function () {
      cc.autocomplete(name).then(function (list) {
        var ta = $('#dadd-q'); if (!ta || ta.value.split('\n')[0] !== line) return;
        ui.dSug = (list || []).filter(function (n) { return C.keyOf(n) !== C.keyOf(name) || n !== name; }).slice(0, 8); daddPaint();
      }, function () { /* senza suggerimenti si scrive a mano */ });
    }, 250);
  }
  function daddRead(d) {
    var ta = $('#dadd-q'), ne = $('#dadd-n'), txt = ta ? ta.value.trim() : '';
    if (!txt) return { err: 'Scrivi il nome della carta.' };
    var qty = Math.max(1, Math.min(99, parseInt(ne && ne.value, 10) || 1)), lines = txt.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var text = lines.length === 1 ? (/^\d+\s*[xX]?\s+\S/.test(lines[0]) ? lines[0] : qty + ' ' + lines[0]) : lines.join('\n');
    var p = C.parseList(text), out = [];
    p.cards.forEach(function (c) { out.push({ c: c, side: d.kind === 'deck' && ui.dAddSide }); });
    (p.side || []).forEach(function (c) { out.push({ c: c, side: d.kind === 'deck' }); });
    return out.length ? { entries: out } : { err: 'Non riesco a leggere la carta: scrivi il nome, ad esempio «Sol Ring».' };
  }
  function daddApply(d, entries) {
    var cc = CARDS.get(), done = [];
    entries.forEach(function (e) {
      var rec = cc ? (e.c.set ? cc.rec(e.c.name, e.c.set, e.c.cn) : (cc.rec(e.c.name, '', '') || cc.any(e.c.name))) : null;
      if (rec && rec.n && C.keyOf(rec.n) === C.keyOf(e.c.name)) e.c.name = rec.n;
    });
    mutate(function () {
      return 'Aggiunta' + (entries.length > 1 ? 'e ' + entries.length + ' carte' : ': ' + entries[0].c.qty + '× ' + entries[0].c.name) + (entries.every(function (e) { return e.side; }) ? ' al sideboard' : '') + '.';
    }, function () {
      entries.forEach(function (e) { C.addCard(d, { name: e.c.name, set: e.c.set, cn: e.c.cn }, e.c.qty, e.side); done.push(e); });
      d.updatedAt = Date.now();
    });
    ui.dAddMsg = ''; ui.dAddPend = null; ui.dSug = []; ui.dmenu = '';
    var sy = window.scrollY; render(); window.scrollTo(0, sy);
    var ta = $('#dadd-q'); if (ta) ta.focus();
  }
  function daddGo(force) {
    var d = getDeck(); if (!d || ui.dAddBusy) return;
    var r = force && ui.dAddPend ? { entries: ui.dAddPend } : daddRead(d);
    if (r.err) { ui.dAddMsg = r.err; ui.dAddPend = null; daddPaint(); return; }
    var cc = CARDS.get();
    if (force || !cc || !CARDS.enabled()) { daddApply(d, r.entries); return; }
    ui.dAddBusy = true; ui.dAddMsg = ''; ui.dAddPend = null; ui.dSug = []; daddPaint();
    cc.ensure(r.entries.map(function (e) { return { name: e.c.name, set: e.c.set, cn: e.c.cn }; }), {}).then(function () {
      ui.dAddBusy = false;
      var bad = r.entries.filter(function (e) { return !(e.c.set ? cc.rec(e.c.name, e.c.set, e.c.cn) : (cc.rec(e.c.name, '', '') || cc.any(e.c.name))); });
      if (bad.length) {
        ui.dAddPend = r.entries;
        ui.dAddMsg = 'Non trovo ' + bad.slice(0, 3).map(function (e) { return '«' + e.c.name + (e.c.set ? ' (' + e.c.set + ')' : '') + '»'; }).join(', ') + (bad.length > 3 ? '…' : '') + ' su Scryfall: controlla il nome.';
        daddPaint(); return;
      }
      daddApply(d, r.entries);
    }, function () {
      ui.dAddBusy = false; ui.dAddPend = r.entries; ui.dAddMsg = 'Non riesco a raggiungere Scryfall per controllare il nome.'; daddPaint();
    });
  }
  /* Dopo ogni modifica: se il commander non c'è più nel mazzo, il mazzo resta senza commander. */
  function dkAfterEdit(d) {
    d.updatedAt = Date.now();
    if (d.commander && !d.cards.some(function (c) { return C.keyOf(c.name) === C.keyOf(d.commander); })) d.commander = null;
  }
  var GONE = 'Codighel! Ma è sparita…';
  function dkEdit(el, kind) {
    var d = getDeck(); if (!d) return;
    var t = dkTarget(el), side = !!el.dataset.side, k = el.dataset.k, label = t.name, before = d.commander, base, fn;
    if (kind === 'qty') {
      var up = parseInt(k, 10) > 0;
      var row = (side ? d.side || [] : d.cards).filter(function (c) { return dkKey(c, side) === dkKey(t, side); })[0];
      base = up ? 'Aggiunta una copia: ' + label + '.' : row && row.qty <= 1 ? GONE : 'Tolta una copia: ' + label + '.';
      fn = function () { if (up) C.addCard(d, t, 1, side); else C.removeCard(d, t, 1, side); };
    } else if (kind === 'del') {
      base = GONE;
      fn = function () { C.removeCard(d, t, null, side); };
    } else if (kind === 'move') {
      if (d.kind !== 'deck' || (!side && dkIsCmd(d, t))) return;
      base = (side ? 'Rimessa nel mazzo: ' : 'Spostata in sideboard: ') + label + '.';
      fn = function () { C.moveCard(d, t, k ? 1 : null, !side); };
    } else return;
    mutate(function () { return base + (before && !d.commander ? ' Era il commander: il mazzo ora non ne ha uno, scegline un altro in Gestisci.' : ''); }, function () { fn(); dkAfterEdit(d); });
    var still = (side ? d.side || [] : d.cards).some(function (c) { return dkKey(c, side) === dkKey(t, side); });
    if (!still) ui.dmenu = '';
    var sy = window.scrollY; render(); window.scrollTo(0, sy);
    if (kind === 'qty') { var b = document.querySelector('.drm [data-a="dr-qty"][data-k="' + k + '"]'); if (b) b.focus(); }
  }

  /* ---------- «Ma questo risparmio è crazy!» ---------- */
  var crazyEl = null;
  function closeCrazy() { ui.crazy = false; paintCrazy(); }
  function crazyHtml(d) {
    var cc = CARDS.get(), st = CARDS.st;
    var head = '<button class="cz-x" data-a="crazy-close" aria-label="Chiudi">×</button><p class="cz-k"><b class="bang">Codighel!</b></p><h2 id="czt">Ma questo risparmio è crazy!</h2><p class="cz-deck">' + esc(d.name) + '</p>';
    var foot = '<div class="btns"><button class="btn small" data-a="crazy-close">Chiudi</button></div>';
    if (!cc || !CARDS.enabled()) return head + '<p class="hint">I prezzi arrivano da Scryfall, che qui non è raggiungibile. Li trovi nell\'app per Windows, nell\'APK e nella versione web installata.</p>' + foot;
    var v = cc.valueDeck(d, C.isBasic);
    if (!v.cards.length) return head + '<p class="hint">In questo mazzo ci sono solo terre base o carte tue del Designer: non c\'è nulla da valutare.</p>' + foot;
    if (st.err && !st.busy) return head + errLine() + '<div class="btns"><button class="btn primary" data-a="crazy-retry">Riprova</button><button class="btn small" data-a="crazy-close">Chiudi</button></div>';
    var busy = st.busy ? '<p class="hint">' + progLine(st.what === 'cheap' ? 'cheap' : 'prices') + '</p>' : '';
    var diff = v.total - v.cheapTotal, pct = v.total > 0 ? Math.round(diff / v.total * 100) : 0;
    var t1 = v.ready ? '<b>' + eurF(v.total) + '</b><span>con le stampe del mazzo · ' + plural(v.qty, 'carta', 'carte') + '</span>' : '<b>…</b><span>sto leggendo i prezzi</span>';
    var t2 = v.ready && v.cheapComplete ? '<b>' + eurF(v.cheapTotal) + '</b><span>' + (diff > 0.004 ? 'meno ' + eurF(diff) + ' (−' + pct + '%)' : 'hai già le stampe più economiche') + '</span>' : '<b>…</b><span>cerco la stampa più economica di ogni carta</span>';
    var done = v.ready && v.cheapComplete;
    var notes = [];
    if (v.skipped.basic) notes.push(plural(v.skipped.basic, 'terra base esclusa', 'terre base escluse'));
    if (v.skipped.design) notes.push(plural(v.skipped.design, 'carta del Designer esclusa', 'carte del Designer escluse'));
    if (v.missing.length) notes.push(plural(v.missing.length, 'carta senza prezzo', 'carte senza prezzo') + ' non conteggiata');
    return head + '<div class="ptiles"><div class="ptile real"><small>Costo se fosse reale</small>' + t1 + '</div><div class="ptile cheap"><small>Con le stampe più economiche</small>' + t2 + '</div></div>' +
      (v.ready ? '<p class="psave"><b class="bang">Codighel!</b> ' + (C.isPrinted(d) ? 'Stampando questo mazzo invece di comprarlo hai risparmiato' : 'Quando lo stampi, invece di comprarlo, risparmi') + ' <b>' + eurF(v.total) + '</b>.</p>' : '') +
      busy + (done ? '<p class="hint pnote">Prezzi in euro di Cardmarket, tramite Scryfall. Contano le stampe senza foil.' + (notes.length ? ' ' + notes.join(' · ') + '.' : '') + '</p>' : '') +
      '<div class="btns"><button class="btn small" data-a="crazy-fresh"' + (st.busy ? ' disabled' : '') + '>Aggiorna i prezzi</button><button class="btn small" data-a="crazy-detail">Prezzi carta per carta</button><button class="btn small" data-a="crazy-close">Chiudi</button></div>';
  }
  /* Calcola da solo i passi che mancano: prima i prezzi, poi la stampa più economica di ogni carta. */
  function crazyDrive(d) {
    var cc = CARDS.get(), st = CARDS.st; if (!cc || !CARDS.enabled() || !CARDS.loaded() || st.busy || st.err) return;
    var v = cc.valueDeck(d, C.isBasic); if (!v.cards.length) return;
    if (!v.ready) loadPrices([d]); else if (!v.cheapComplete) loadCheap([d]);
  }
  function paintCrazy() {
    var d = getDeck();
    if (!ui.crazy || ui.view !== 'deck' || !d) {
      ui.crazy = false;
      if (crazyEl) { crazyEl.remove(); crazyEl = null; }
      return;
    }
    if (!crazyEl) {
      crazyEl = document.createElement('div'); crazyEl.id = 'crazy'; crazyEl.className = 'lb cz'; crazyEl.setAttribute('data-a', 'crazy-close');
      crazyEl.setAttribute('role', 'dialog'); crazyEl.setAttribute('aria-modal', 'true'); crazyEl.setAttribute('aria-labelledby', 'czt');
      document.body.appendChild(crazyEl);
    }
    crazyEl.innerHTML = '<div class="cz-box" data-a="crazy-keep">' + crazyHtml(d) + '</div>';
    if (!crazyEl._focused) { crazyEl._focused = 1; var x = crazyEl.querySelector('.cz-x'); if (x) x.focus(); }
    crazyDrive(d);
  }

  /* ---------- Upgrade ---------- */
  function upgradeCard(d, u) {
    var df = C.diffUpgrade(d, u, state.decks, state.settings);
    return '<article class="deckcard"><div class="top"><div><h2>' + esc(u.name) + '</h2><div class="meta">' + plural(df.inQty, 'carta cambia', 'carte cambiano') + (df.reprintQty ? ' (' + df.reprintQty + ' solo stampa)' : '') + ' · ' + df.covered + ' già in archivio · ' + df.missing + ' da procurare</div></div></div>' +
      '<div class="foot"><span></span><button class="btn small" data-a="open-up" data-id="' + esc(u.id) + '">Apri</button></div></article>';
  }
  function planHtml(plan) {
    var n = function (a) { return a.reduce(function (t, x) { return t + x.qty; }, 0); };
    var toL = n(plan.toLoose), fromL = n(plan.fromLoose), fromD = n(plan.fromDecks), li = [];
    var rp = n(plan.reprints || []);
    if (toL) li.push('<li><b>' + plural(toL, 'carta esce', 'carte escono') + '</b>' + (rp ? ' (' + plural(rp, 'è la vecchia stampa di una carta che resta', 'sono vecchie stampe di carte che restano') + ')' : '') + ' dal mazzo e finisc' + (toL === 1 ? 'e' : 'ono') + ' nelle carte sciolte' + (plan.createdBinder ? ' (creo la lista «' + esc(plan.binderName) + '»)' : '') + '.</li>');
    if (fromL) li.push('<li><b>' + plural(fromL, 'carta entra', 'carte entrano') + '</b> dalle carte sciolte: ' + (fromL === 1 ? 'smette' : 'smettono') + ' di essere sciolt' + (fromL === 1 ? 'a' : 'e') + '.</li>');
    if (fromD) {
      var by = {}; plan.fromDecks.forEach(function (x) { by[x.deckName] = (by[x.deckName] || 0) + x.qty; });
      li.push('<li><b>' + plural(fromD, 'carta viene presa', 'carte vengono prese') + '</b> da mazzi non attivi: ' + Object.keys(by).map(function (k) { return esc(k) + ' (' + by[k] + ')'; }).join(', ') + '.</li>');
    }
    return '<div class="plan"><h3>Quando applichi</h3><ul>' + (li.join('') || '<li>Nessuno spostamento.</li>') + '</ul></div>';
  }
  function upChip(v, label, n) {
    return '<button class="chip" data-a="up-st" data-v="' + v + '" aria-pressed="' + (ui.upSt === v) + '">' + label + '<i>' + n + '</i></button>';
  }
  function upgradeView() {
    var d = getDeck(), u = d && d.upgrades.filter(function (x) { return x.id === ui.upId; })[0];
    if (!d || !u) { ui.view = d ? 'deck' : 'decks'; return d ? deckView() : decksView(); }
    var df = C.diffUpgrade(d, u, state.decks, state.settings);
    var plan = C.applyUpgradeMoves(clone(state.decks), d.id, u.id, state.settings);
    var aApply = armed('apply-up:' + u.id), aDel = armed('del-up:' + u.id);
    var allIn = df.inn.concat(df.reprints);
    var have = allIn.filter(function (x) { return !x.missing; }).length, need = allIn.length - have;
    return '<header class="vh"><button class="back" data-a="back-deck">← ' + esc(d.name) + '</button><h1>' + esc(u.name) + '</h1></header>' +
      '<section class="panel"><label class="lbl">Nome upgrade<input class="input" data-c="up-name" value="' + esc(u.name) + '"></label>' +
      '<div class="sum"><div><b>' + df.inQty + '</b><span>carte cambiano</span></div><div class="g"><b>' + df.covered + '</b><span>già nel tuo archivio</span></div><div class="r"><b>' + df.missing + '</b><span>da procurare</span></div></div>' +
      (df.reprintQty || df.altCover ? '<p class="hint">Di queste <b>' + df.newQty + '</b> sono carte nuove e <b>' + df.reprintQty + '</b> cambiano solo la stampa.' + (df.altCover ? ' Per <b>' + df.altCover + '</b> hai già la stessa carta in un\'altra stampa.' : '') + '</p>' : '') +
      (df.commanderChange ? '<p class="warn">Il commander dell\'upgrade è diverso da quello del mazzo.</p>' : '') +
      (df.outQty !== df.inQty ? '<p class="warn">Il nuovo mazzo ha ' + sum(u.cards) + ' carte contro le ' + sum(d.cards) + ' attuali.</p>' : '') +
      planHtml(plan) +
      '<div class="btns"><button class="btn primary" data-a="apply-up" data-cf="1" data-id="' + esc(u.id) + '">' + (aApply ? 'Conferma: applica al mazzo' : 'Applica al mazzo') + '</button>' +
      '<button class="btn small" data-a="copy-up" data-id="' + esc(u.id) + '">Copia lista cambi</button>' +
      '<button class="btn small danger' + (aDel ? ' armed' : '') + '" data-a="del-up" data-cf="1" data-id="' + esc(u.id) + '">' + (aDel ? 'Conferma eliminazione' : 'Elimina upgrade') + '</button></div>' +
      '<p class="hint">Applica quando hai fatto lo scambio fisico: le carte tolte passano alle sciolte e la lista del mazzo diventa quella dell\'upgrade.</p></section>' +
      '<div class="sticky"><div class="search">' + IC.search + '<input class="input" data-c="upq" type="search" inputmode="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cerca una carta tra quelle che cambiano" aria-label="Cerca nell\'upgrade" value="' + esc(ui.upQ) + '"></div>' +
      '<div class="chips" role="group" aria-label="Carte che entrano">' + upChip('all', 'Tutte', allIn.length) + upChip('have', 'Già in archivio', have) + upChip('need', 'Da procurare', need) + '</div>' +
      '<p class="hint">I filtri riguardano le carte che entrano.</p></div><div class="cols" id="upcols"></div>';
  }
  function prLabel(x) { return x && x.set ? String(x.set).toUpperCase() + (x.cn ? ' ' + x.cn : '') : 'stampa non indicata'; }
  function ptag(x) { return x && x.set ? ' <span class="ptag">' + esc(prLabel(x)) + '</span>' : ''; }
  function where(rows) {
    return rows.map(function (r) { return esc(r.deckName) + (r.kind === 'binder' && !/sciolt/i.test(r.deckName) ? ' (sciolte)' : '') + ' ×' + r.qty + ' · ' + esc(prLabel(r)); }).join('; ');
  }
  function upOutRow(x) {
    return '<div class="up-row">' + IMG.thumb(x.name, x.set, x.cn) + '<span class="nm">' + esc(x.name) + ptag(x) + '</span><span class="qty">' + x.qty + '×</span><span class="sm">Finisce nelle carte sciolte.</span></div>';
  }
  /* stato di una carta che entra: copie libere con la stessa stampa, copie libere in altra stampa, copie in uso */
  function upStatus(x, newWord) {
    var st;
    if (x.basic) return '<span class="pill info">terra base</span><span class="sm">Considerata sempre disponibile.</span>';
    if (!x.missing) {
      return '<span class="pill free">Hai già ' + (x.set ? (x.qty > 1 ? 'tutte' : 'questa stampa') : (x.qty > 1 ? 'tutte' : 'questa carta')) + '</span><span class="sm">Libera in: ' +
        x.sources.map(function (s) { return esc(s.deckName) + (s.kind === 'binder' ? ' (sciolte)' : ''); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + '</span>';
    }
    st = '<span class="pill use">' + newWord + (x.qty > 1 ? ' ×' + x.missing : '') + '</span>';
    var note = [];
    if (x.covered) note.push('ne hai ' + x.covered + ' libere in questa stampa (' + x.sources.map(function (s) { return esc(s.deckName); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ')');
    if (x.altCover) st += '<span class="sm alt">Hai già la stessa carta in un\'altra stampa: ' + where(x.altSources) + '. Se non ti serve quell\'immagine puoi riusarla; per l\'archivio è una carta diversa.</span>';
    if (x.busyIn.length) note.push('in uso in ' + x.busyIn.map(function (s) { return esc(s.deckName); }).join(', '));
    if (note.length) st += '<span class="sm">' + note.join(' · ') + '</span>';
    return st;
  }
  function upInRow(x) {
    return '<div class="up-row">' + IMG.thumb(x.name, x.set, x.cn) + '<span class="nm">' + esc(x.name) + ptag(x) + '</span><span class="qty">' + x.qty + '×</span>' + upStatus(x, 'Da procurare') + '</div>';
  }
  function upReprintRow(x) {
    return '<div class="up-row rp">' + IMG.thumb(x.name, x.from.set, x.from.cn) + '<span class="arr" aria-hidden="true">→</span>' + IMG.thumb(x.name, x.to.set, x.to.cn) +
      '<span class="nm">' + esc(x.name) + ' <span class="ptag">' + esc(prLabel(x.from)) + ' → ' + esc(prLabel(x.to)) + '</span></span><span class="qty">' + x.qty + '×</span>' + upStatus(x, 'Da stampare') + '</div>';
  }
  function updateUpgradeCols() {
    var el = $('#upcols'); if (!el) return;
    var d = getDeck(), u = d && d.upgrades.filter(function (x) { return x.id === ui.upId; })[0]; if (!u) return;
    var df = C.diffUpgrade(d, u, state.decks, state.settings), q = C.searchNorm(ui.upQ);
    var match = function (x) { return !q || C.searchNorm(x.name).indexOf(q) >= 0; };
    var outs = df.out.filter(match).sort(byName);
    var stf = function (x) { return ui.upSt === 'have' ? !x.missing : ui.upSt === 'need' ? x.missing > 0 : true; };
    var inns = df.inn.filter(match).filter(stf).sort(byName);
    var reps = df.reprints.filter(match).filter(stf).sort(byName);
    var qsum = function (a) { return a.reduce(function (t, x) { return t + x.qty; }, 0); };
    var none = function (all, whenEmpty) { return '<p class="hint">' + (all ? 'Nessuna corrispondenza.' : whenEmpty) + '</p>'; };
    el.innerHTML = '<section class="col out"><h2>Esce dal mazzo <span class="qty">' + qsum(outs) + '</span></h2><div class="list">' + (outs.map(upOutRow).join('') || none(df.out.length, 'Nessuna carta esce.')) + '</div></section>' +
      '<section class="col in"><h2>Entra nel mazzo <span class="qty">' + qsum(inns) + '</span></h2><div class="list">' + (inns.map(upInRow).join('') || none(df.inn.length, 'Nessuna carta entra.')) + '</div></section>' +
      (df.reprints.length ? '<section class="col rp"><h2>Cambia solo la stampa <span class="qty">' + qsum(reps) + '</span></h2><p class="hint">Stessa carta, collezione o numero diversi: per l\'archivio è un\'altra carta. La vecchia stampa passa alle sciolte, la nuova va stampata (a meno che tu non l\'abbia già libera).</p><div class="list">' + (reps.map(upReprintRow).join('') || none(df.reprints.length, '')) + '</div></section>' : '');
    IMG.hydrate();
  }

  /* ---------- Importazione ---------- */
  function newDraft(mode, deckId) {
    return { mode: mode, deckId: deckId || null, step: 1, name: '', text: '', parsed: null, commander: null, cq: '', status: 'active', reuse: {}, error: '' };
  }
  function importView() {
    var d = ui.draft || (ui.draft = newDraft('deck'));
    if (d.step === 2) return importStep2(d);
    var isUp = d.mode === 'upgrade', target = isUp ? getDeck(d.deckId) : null;
    var title = isUp ? 'Nuovo upgrade' : 'Importa';
    var seg = isUp ? '' : '<div class="seg" role="group" aria-label="Tipo"><button data-a="draft-mode" data-v="deck" aria-pressed="' + (d.mode === 'deck') + '">Mazzo Commander</button><button data-a="draft-mode" data-v="binder" aria-pressed="' + (d.mode === 'binder') + '">Carte sciolte</button></div>';
    var help = isUp ? 'Incolla la lista completa aggiornata di «' + esc(target ? target.name : '') + '». Vedrai la differenza con il mazzo attuale.' :
      d.mode === 'binder' ? 'Carte che non sono in nessun mazzo (classificatore, avanzi, carte tolte da un mazzo). Risultano sempre libere e ti avviso quando un nuovo mazzo le contiene.' :
        'Una carta per riga, come «1 Sol Ring» oppure «1 Sol Ring (C21) 263» per indicare anche la collezione.';
    return '<header class="vh">' + (isUp ? '<button class="back" data-a="back-deck">← ' + esc(target ? target.name : 'Mazzo') + '</button>' : '') + '<h1>' + title + '</h1><p class="sub">' + help + '</p></header>' +
      '<section class="panel">' + seg +
      '<label class="lbl">' + (isUp ? 'Nome upgrade' : 'Nome') + '<input class="input" data-c="draft-name" placeholder="' + (isUp ? 'es. Upgrade autunno' : d.mode === 'binder' ? 'es. Carte sciolte' : 'es. Kaalia') + '" value="' + esc(d.name) + '"></label>' +
      '<label class="lbl">Lista .txt<textarea class="textarea" data-c="draft-text" spellcheck="false" placeholder="1 Sol Ring\n1 Command Tower\n8 Mountain\n...">' + esc(d.text) + '</textarea></label>' +
      '<label class="lbl">Oppure scegli un file<input class="input" type="file" data-c="draft-file" accept=".txt,text/plain"></label>' +
      (d.error ? '<p class="err" role="alert">' + esc(d.error) + '</p>' : '') +
      '<div class="btns"><button class="btn primary" data-a="draft-next">' + (d.mode === 'deck' ? 'Avanti: scegli il commander' : isUp ? 'Crea upgrade' : 'Importa carte') + '</button></div></section>';
  }
  function cmdListHtml(d) {
    var q = C.searchNorm(d.cq), hints = d.parsed.hints.map(C.keyOf);
    var cards = d.parsed.cards.slice().sort(function (a, b) {
      var ha = hints.indexOf(C.keyOf(a.name)) >= 0 ? 0 : 1, hb = hints.indexOf(C.keyOf(b.name)) >= 0 ? 0 : 1;
      return ha - hb || byName(a, b);
    }).filter(function (c) { return !q || C.searchNorm(c.name).indexOf(q) >= 0; });
    var row = function (val, label, checked, tag) {
      return '<label class="opt"><input type="radio" name="cmd" data-c="cmd" value="' + esc(val) + '"' + (checked ? ' checked' : '') + '><span class="nm">' + esc(label) + '</span>' + (tag ? '<span class="pill info">' + tag + '</span>' : '') + '</label>';
    };
    return (q ? '' : row('', 'Nessun commander', !d.commander)) + cards.map(function (c) {
      return row(c.name, c.name, d.commander === c.name, hints.indexOf(C.keyOf(c.name)) >= 0 ? 'suggerito' : '');
    }).join('');
  }
  function reuseBanner(cards) {
    var r = C.findReusable(cards, state.decks, state.settings), pk = (ui.draft && ui.draft.reuse) || {};
    var ex = r.filter(function (x) { return x.exact > 0; }), ot = r.filter(function (x) { return x.other > 0; });
    var want = function (x) { return x.wanted.length === 1 ? ptag(x.wanted[0]) : ''; };
    var ck = function (x, kind, label) {
      return '<label class="ru-ck"><input type="checkbox" data-c="reuse" data-k="' + esc(x.key) + '" data-t="' + kind + '"' + (pk[x.key + '|' + kind] ? ' checked' : '') + '><span>' + label + '</span></label>';
    };
    var h = '';
    if (ex.length) {
      h += '<div class="reuse"><p><b>CODIGHEL!</b> Queste carte le hai già stampate, <b>esattamente in questa stampa</b>: verifica prima di stampare di nuovo.</p>' +
        '<p class="sm">Spunta quelle che vuoi usare: le tolgo da dove sono (carte sciolte o mazzo non attivo) e le metto già nel nuovo mazzo.</p><ul>' + ex.map(function (x) {
          return '<li>' + ck(x, 'exact', 'Usa') + '<span class="qty">' + x.exact + '×</span> ' + esc(x.name) + want(x) + '<span class="sm"> in ' + where(x.exactRows) + (x.exact < x.need ? ' · ne servono ' + x.need : '') + '</span></li>';
        }).join('') + '</ul><div class="btns"><button class="btn small" data-a="reuse-all">Usa tutte</button><button class="btn small" data-a="reuse-none">Nessuna</button></div></div>';
    }
    if (ot.length) {
      h += '<div class="reuse alt"><p><b>Stessa carta, stampa diversa.</b> Hai già queste carte ma in un\'altra stampa. Se ti basta puoi riusarle (nel mazzo resta la stampa che hai davvero); se vuoi proprio quella della lista vanno stampate (per l\'archivio sono carte diverse).</p><ul>' + ot.map(function (x) {
        return '<li>' + ck(x, 'other', 'Usa questa stampa') + '<span class="qty">' + x.other + '×</span> ' + esc(x.name) + (x.wanted.length === 1 ? '<span class="sm"> nella lista: ' + esc(prLabel(x.wanted[0])) + '</span>' : '') + '<span class="sm"> hai: ' + where(x.otherRows) + '</span></li>';
      }).join('') + '</ul></div>';
    }
    return h + (h ? '<p class="hint" id="reuse-sum" role="status">' + reuseSumText() + '</p>' : '');
  }
  function reuseSumText() {
    var d = ui.draft; if (!d || !d.parsed) return '';
    var n = 0, pk = d.reuse || {};
    C.findReusable(d.parsed.cards, state.decks, state.settings).forEach(function (x) { n += (pk[x.key + '|exact'] ? x.exact : 0) + (pk[x.key + '|other'] ? x.other : 0); });
    return n ? 'Prenderò ' + plural(n, 'copia', 'copie') + ' da quelle che hai già: non le devi stampare.' : 'Nessuna carta presa: le stamperai tutte.';
  }
  function reuseSummary() { var el = $('#reuse-sum'); if (el) el.textContent = reuseSumText(); }
  function importStep2(d) {
    var p = d.parsed;
    return '<header class="vh"><button class="back" data-a="draft-back">← Lista</button><h1>Scegli il commander</h1><p class="sub"><b>' + p.total + '</b> carte (' + p.unique + ' diverse)' + (p.excluded ? (d.mode === 'deck' ? ' · ' + p.excluded + ' in sideboard' : ' · ' + p.excluded + ' escluse (sideboard)') : '') + '</p></header>' +
      '<section class="panel">' +
      (p.total !== 100 ? '<p class="warn">La lista ha ' + p.total + ' carte: un mazzo Commander di solito ne ha 100. Puoi importarla lo stesso.</p>' : '') +
      (p.warnings.length ? '<p class="warn">' + plural(p.warnings.length, 'riga non letta', 'righe non lette') + ': ' + esc(p.warnings.slice(0, 3).join(' | ')) + (p.warnings.length > 3 ? '…' : '') + '</p>' : '') +
      reuseBanner(p.cards) +
      '<div class="search">' + IC.search + '<input class="input" data-c="cmd-q" type="search" placeholder="Cerca il commander nella lista" autocomplete="off" aria-label="Cerca il commander" value="' + esc(d.cq) + '"></div>' +
      '<div class="pick" id="cmdlist" role="radiogroup" aria-label="Commander">' + cmdListHtml(d) + '</div>' +
      '<label class="lbl">Stato del mazzo' + statusSelect({ kind: 'deck', status: d.status, active: d.status === 'active' }, 'draft-status') + '</label>' +
      '<p class="hint" style="margin-top:-4px">' + esc(statusHint({ kind: 'deck', status: d.status, active: d.status === 'active' })) + '</p>' +
      '<div class="btns"><button class="btn primary" data-a="draft-create">Crea mazzo</button></div></section>';
  }
  function draftNext() {
    var d = ui.draft, p = C.parseList(d.text);
    if (!p.cards.length) { d.error = 'Non ho trovato nessuna carta. Incolla una lista con righe tipo «1 Sol Ring».'; render(); return; }
    d.error = ''; d.parsed = p;
    if (d.mode === 'deck') { d.commander = p.hints[0] || null; d.step = 2; d.cq = ''; window.scrollTo(0, 0); render(); }
    else draftCreate();
  }
  function draftCreate() {
    var d = ui.draft, p = d.parsed, now = Date.now();
    if (d.mode === 'upgrade') {
      var deck = getDeck(d.deckId); if (!deck) return;
      var up = { id: C.uid('u'), name: d.name.trim() || 'Upgrade ' + (deck.upgrades.length + 1), cards: p.cards, commander: null, createdAt: now };
      deck.upgrades.push(up); deck.updatedAt = now; touch(deck.id);
      ui.view = 'upgrade'; ui.deckId = deck.id; ui.upId = up.id; ui.upQ = ''; ui.upSt = 'all'; ui.draft = null;
      toast('Upgrade creato: ' + plural(sum(p.cards), 'carta', 'carte')); window.scrollTo(0, 0); render(); return;
    }
    var kind = d.mode === 'binder' ? 'binder' : 'deck';
    var nd = {
      id: C.uid('d'), name: d.name.trim() || (kind === 'binder' ? 'Carte sciolte' : d.commander || 'Nuovo mazzo'), kind: kind,
      status: kind === 'deck' ? d.status : 'inactive', active: kind === 'deck' && d.status === 'active', commander: kind === 'deck' ? (d.commander || null) : null,
      cards: C.clone(p.cards), side: kind === 'deck' ? C.clone(p.side || []) : [], upgrades: [], createdAt: now, updatedAt: now
    };
    var taken = kind === 'deck' ? C.applyReuse(state.decks, nd, d.reuse, state.settings) : [];
    taken.forEach(function (x) { touch(x.deckId); });
    state.decks.push(nd); touch(nd.id);
    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) { /* ignorato */ } }
    ui.view = kind === 'deck' ? 'deck' : 'archive'; ui.deckId = nd.id; ui.deckTab = 'cards'; ui.deckQ = ''; ui.draft = null;
    var nTaken = taken.reduce(function (t, x) { return t + x.qty; }, 0);
    toast((kind === 'deck' ? 'Mazzo creato' : 'Carte aggiunte') + ': ' + plural(sum(p.cards), 'carta', 'carte') +
      (nTaken ? ' · ' + plural(nTaken, 'copia presa', 'copie prese') + ' da carte sciolte e mazzi non attivi, non da stampare' : ''), null, !!nTaken); window.scrollTo(0, 0); render();
  }

  /* ---------- Dati ---------- */
  function exportJson() { return JSON.stringify({ app: 'coglio-proxy-archive', version: 1, exportedAt: new Date().toISOString(), decks: state.decks, settings: state.settings }, null, 1); }
  function storageLabel() {
    return { claude: 'Salvati nel tuo spazio privato di Claude, sincronizzati sui tuoi dispositivi.', idb: 'Salvati su questo dispositivo (archivio del browser). Fai backup ogni tanto.', local: 'Salvati su questo dispositivo (archivio del browser). Fai backup ogni tanto.', memory: 'Salvataggio non disponibile: i dati si perdono alla chiusura. Esporta un backup.' }[store ? store.kind : 'memory'];
  }
  function imagesHint() {
    if (store && store.kind === 'claude') return 'Dentro la pagina di Claude le immagini esterne sono bloccate. Appaiono nell\'app per Windows, nell\'APK e nella versione web installata.';
    if (state.settings.images === false) return 'Immagini spente: nelle liste vedi solo i nomi.';
    return 'Le miniature arrivano da Scryfall, servono internet la prima volta e restano ricordate sul dispositivo' + (IMG.count() ? ' (' + plural(IMG.count(), 'carta', 'carte') + (IMG.count() === 1 ? ' già salvata)' : ' già salvate)') + '.' : '.') + ' Tocca una miniatura per ingrandirla.';
  }
  function cardsDataHtml() {
    var c = CARDS.get(); if (!c || !CARDS.enabled()) return '';
    var n = c.count();
    return '<p class="hint">' + (n ? 'Per la ricerca avanzata e i prezzi tengo sul dispositivo i dati di ' + plural(n, 'carta', 'carte') + ' presi da Scryfall (tipo, colori, costo, rarità, testo e prezzo in euro).' : 'Quando usi i filtri o guardi i prezzi, scarico da Scryfall i dati delle carte (tipo, colori, costo, rarità, testo e prezzo in euro) e li tengo sul dispositivo.') + '</p>' +
      (n ? '<div class="btns"><button class="btn small" data-a="cards-clear">Cancella i dati delle carte</button></div>' : '');
  }
  function dataView() {
    var armedReset = armed('reset');
    return '<header class="vh"><h1>Dati</h1><p class="sub">' + esc(storageLabel()) + '</p></header>' +
      NEWS.panel() +
      (window.CPACommunityUI ? window.CPACommunityUI.html() : '') +
      '<section class="panel"><h2 class="sect" style="margin:0">Impostazioni</h2>' +
      '<label class="lbl">Tema<select class="select" data-c="theme"><option value="auto"' + (state.settings.theme === 'auto' ? ' selected' : '') + '>Automatico</option><option value="light"' + (state.settings.theme === 'light' ? ' selected' : '') + '>Chiaro</option><option value="dark"' + (state.settings.theme === 'dark' ? ' selected' : '') + '>Scuro</option></select></label>' +
      '<label class="switch"><input type="checkbox" data-c="basics"' + (state.settings.basicsUnlimited ? ' checked' : '') + '><span class="tr"></span><span>Terre base sempre disponibili negli upgrade</span></label>' +
      '<label class="switch"><input type="checkbox" data-c="images"' + (state.settings.images !== false ? ' checked' : '') + '><span class="tr"></span><span>Mostra le immagini delle carte</span></label>' +
      '<p class="hint">' + imagesHint() + '</p>' +
      (IMG.enabled() && IMG.count() ? '<div class="btns"><button class="btn small" data-a="img-clear">Cancella le immagini salvate</button></div>' : '') +
      cardsDataHtml() + '</section>' +
      syncHtml() +
      '<section class="panel"><h2 class="sect" style="margin:0">Backup</h2><p class="hint">Un file JSON con tutti i mazzi, gli upgrade e le impostazioni.</p>' +
      '<div class="btns"><button class="btn" data-a="dl-json">Scarica backup</button><button class="btn" data-a="copy-json">Copia backup</button></div>' +
      (ui.backupOut ? '<textarea class="textarea out-ta mono" readonly aria-label="Backup">' + esc(ui.backupOut) + '</textarea>' : '') +
      '<label class="lbl">Ripristina da backup<textarea class="textarea out-ta mono" data-c="restore-text" placeholder="Incolla qui il JSON del backup">' + esc(ui.restoreText) + '</textarea></label>' +
      '<label class="lbl">Oppure scegli il file<input class="input" type="file" data-c="restore-file" accept=".json,application/json"></label>' +
      (ui.dataMsg ? '<p class="' + (ui.dataMsg.indexOf('Errore') === 0 ? 'err' : 'hint') + '" role="status">' + esc(ui.dataMsg) + '</p>' : '') +
      '<div class="btns"><button class="btn" data-a="restore-json">Ripristina (sostituisce tutto)</button></div></section>' +
      UPD.panel() +
      '<section class="panel"><h2 class="sect" style="margin:0">Zona rischiosa</h2><div class="btns"><button class="btn danger' + (armedReset ? ' armed' : '') + '" data-a="reset-all" data-cf="1">' + (armedReset ? 'Conferma: cancella tutto' : 'Cancella tutti i dati') + '</button></div></section>' +
      '<p class="hint" style="margin-top:18px">Coglio Proxy Archive · le carte vengono riconosciute per nome: collezione e numero servono solo a ritrovare la stampa. Immagini e dati delle carte: Scryfall. Le carte Magic sono © Wizards of the Coast.</p>';
  }
  function readFile(file, cb) {
    var r = new FileReader(); r.onload = function () { cb(String(r.result || '')); };
    r.onerror = function () { toast('Non riesco a leggere il file.'); }; r.readAsText(file);
  }

  /* ---------- Eventi ---------- */
  document.addEventListener('click', function (e) {
    var th = e.target.closest('.th.on');
    if (th) { IMG.open(th); return; }
    var el = e.target.closest('[data-a]'); if (!el) return;
    var a = el.dataset.a, id = el.dataset.id;
    if (!el.dataset.cf) ui.confirm = null;
    if (a.indexOf('bd-') === 0 && window.CPABuilder) { window.CPABuilder.click(a, el); return; }
    if (a.indexOf('dz-') === 0 && window.CPADesigner) { if (el.dataset.cf) ui.confirm = null; window.CPADesigner.click(a, el); return; }
    if (a.indexOf('pe-') === 0 && window.CPAPescherUI) { window.CPAPescherUI.click(a, el); return; }
    if (a.indexOf('cm-') === 0 && window.CPACommunityUI) { window.CPACommunityUI.click(a, el); return; }
    var deck;
    switch (a) {
      case 'nav': go(el.dataset.v); break;
      case 'undo': if (TOAST._undo) { var uf = TOAST._undo; hideToast(); uf(); } break;
      case 'toast-close': hideToast(); break;
      case 'st': ui.st = el.dataset.v; ui.limit = 150; render(); break;
      case 'more': ui.limit += 150; updateArchiveList(); break;
      case 'adv': ui.adv = !ui.adv; { var pn = $('#advf'); if (pn) pn.hidden = !ui.adv; el.setAttribute('aria-expanded', ui.adv); } break;
      case 'f-col': {
        var v = el.dataset.v, cs = ui.f.colors;
        if (v === 'C') cs = cs.indexOf('C') >= 0 ? '' : 'C';
        else { cs = cs.replace('C', ''); cs = cs.indexOf(v) >= 0 ? cs.replace(v, '') : cs + v; }
        ui.f.colors = cs; ui.limit = 150; render(); break;
      }
      case 'f-cm': ui.f.cmode = el.dataset.v; ui.limit = 150; render(); break;
      case 'f-type': toggleIn(ui.f.types, el.dataset.v); ui.limit = 150; render(); break;
      case 'f-cost': toggleIn(ui.f.cost, el.dataset.v); ui.limit = 150; render(); break;
      case 'f-rar': toggleIn(ui.f.rar, el.dataset.v); ui.limit = 150; render(); break;
      case 'f-clear': ui.f = { colors: '', cmode: 'any', types: [], cost: [], rar: [], text: '' }; ui.fdeck = ''; ui.fset = ''; ui.nobasic = false; ui.q = ''; ui.limit = 150; render(); break;
      case 'f-help': ui.help = !ui.help; render(); break;
      case 'f-ex': ui.q = el.dataset.v; ui.limit = 150; render(); { var qi = $('#q'); if (qi) qi.focus(); } break;
      case 'p-all': ui.pAll = !ui.pAll; renderPrices(); break;
      case 'p-fresh': CARDS.st.err = ''; deck = getDeck(); if (deck) { loadPrices([deck], true); renderPrices(); } break;
      case 'p-cheap': CARDS.st.err = ''; deck = getDeck(); if (deck) { loadCheap([deck]); renderPrices(); } break;
      case 'dr-open': dkSelect(el); if (!dkAside()) { var sd = el.querySelector('.th.seed.on'); if (sd) IMG.open(sd); } break;
      case 'dr-menu': { var mk = dkKey(dkTarget(el), !!el.dataset.side); ui.dmenu = ui.dmenu === mk ? '' : mk; updateDeckList(); var mb = document.querySelector('.dr.mn .dmb'); if (mb) mb.focus(); } break;
      case 'dr-qty': dkEdit(el, 'qty'); break;
      case 'dr-del': dkEdit(el, 'del'); break;
      case 'dr-move': dkEdit(el, 'move'); break;
      case 'dadd-toggle': ui.dAdd = !ui.dAdd; { var dp = $('#dadd'); if (dp) dp.hidden = !ui.dAdd; el.setAttribute('aria-expanded', ui.dAdd); if (ui.dAdd) { var dq = $('#dadd-q'); if (dq) dq.focus(); } } break;
      case 'dadd-go': daddGo(false); break;
      case 'dadd-force': daddGo(true); break;
      case 'dadd-pick': { var dq2 = $('#dadd-q'); if (dq2) { dq2.value = el.dataset.v; dq2.focus(); } ui.dSug = []; daddPaint(); } break;
      case 'export-deck': deck = getDeck(); if (deck) { var fn = C.exportFileName(deck); download(fn, C.exportDeck(deck), 'text/plain').then(function (r) { toast(r === 'declined' ? 'Download annullato.' : r ? 'Lista scaricata: ' + fn : 'Download non riuscito: usa «Copia lista» e incolla in un file di testo.'); }); } break;
      case 'dr-prints': IMG.openPrints(el.dataset.n, el.dataset.s, el.dataset.c, ui.deckId, el.dataset.mp || ''); break;
      case 'lb-tab': IMG.tab(el.dataset.t); break;
      case 'mpc-go': case 'mpc-more': case 'mpc-pick': case 'mpc-clear': IMG.mpcClick(a, el); break;
      case 'dr-flip': ui.dflip = !ui.dflip; dprevPaint(); break;
      case 'dr-retry': CARDS.st.err = ''; updateDeckList(); break;
      case 'deck-man': ui.dMan = !ui.dMan; { var mp = $('#dman'); if (mp) mp.hidden = !ui.dMan; el.setAttribute('aria-expanded', ui.dMan); } break;
      case 'crazy-open': ui.crazy = true; if (crazyEl) { crazyEl.remove(); crazyEl = null; } CARDS.st.err = ''; paintCrazy(); break;
      case 'crazy-close': closeCrazy(); break;
      case 'crazy-keep': break;
      case 'crazy-retry': CARDS.st.err = ''; paintCrazy(); break;
      case 'crazy-fresh': deck = getDeck(); if (deck) { CARDS.st.err = ''; loadPrices([deck], true); paintCrazy(); } break;
      case 'crazy-detail': ui.crazy = false; paintCrazy(); ui.deckTab = 'prices'; render(); break;
      case 'sync-now': SYNC.run(true); break;
      case 'sync-dbx': SYNC.dropboxStart(); break;
      case 'sync-dbx-ok': { var sc = $('[data-c="sync-code"]'); if (sc && sc.value.trim()) SYNC.dropboxFinish(sc.value); } break;
      case 'sync-ggl': SYNC.googleStart(); break;
      case 'sync-cancel': SYNC.cancel(); break;
      case 'sync-unlink': confirmThen('sync-unlink', function () { SYNC.unlink(); }); break;
      case 'f-load': CARDS.st.err = ''; if (ui.view === 'archive') { loadArchiveData(getArchive()); updateArchiveList(); } break;
      case 'toggle-card': ui.open[el.dataset.k] = !ui.open[el.dataset.k]; updateArchiveList(); break;
      case 'open-deck': CARDS.st.err = ''; ui.view = 'deck'; ui.deckId = id; ui.deckTab = 'cards'; ui.deckQ = ''; ui.dprev = null; ui.dMan = false; window.scrollTo(0, 0); render(); break;
      case 'deck-tab': ui.deckTab = el.dataset.v; CARDS.st.err = ''; render(); break;
      case 'back-deck': ui.view = 'deck'; ui.deckTab = 'ups'; window.scrollTo(0, 0); render(); break;
      case 'del-deck':
        confirmThen('del-deck:' + id, function () {
          var d = getDeck(id); mutate('Mazzo eliminato: ' + (d ? d.name : ''), function () { state.decks = state.decks.filter(function (x) { return x.id !== id; }); });
          ui.view = 'decks'; render();
        }); break;
      case 'make-pdf': if (window.CPABuilder) window.CPABuilder.open(id); break;
      case 'copy-deck': deck = getDeck(); if (deck) copyText(C.exportDeck(deck)).then(function (ok) { toast(ok ? 'Lista copiata negli appunti.' : 'Copia non riuscita.'); }); break;
      case 'new-up': ui.draft = newDraft('upgrade', ui.deckId); ui.view = 'import'; window.scrollTo(0, 0); render(); break;
      case 'up-st': ui.upSt = el.dataset.v; render(); break;
      case 'open-up': ui.upId = id; ui.upQ = ''; ui.upSt = 'all'; ui.view = 'upgrade'; window.scrollTo(0, 0); render(); break;
      case 'apply-up':
        confirmThen('apply-up:' + id, function () {
          var rep;
          mutate(function () {
            var n = rep ? rep.toLoose.reduce(function (t, x) { return t + x.qty; }, 0) : 0;
            return 'Upgrade applicato: ' + plural(n, 'carta tolta è finita', 'carte tolte sono finite') + ' nelle sciolte.';
          }, function () { rep = C.applyUpgradeMoves(state.decks, ui.deckId, id, state.settings); });
          ui.view = 'deck'; ui.deckTab = 'cards'; window.scrollTo(0, 0); render();
        }); break;
      case 'del-up':
        confirmThen('del-up:' + id, function () {
          mutate('Upgrade eliminato.', function () { var d = getDeck(); d.upgrades = d.upgrades.filter(function (x) { return x.id !== id; }); });
          ui.view = 'deck'; ui.deckTab = 'ups'; render();
        }); break;
      case 'copy-up':
        deck = getDeck();
        var up = deck && deck.upgrades.filter(function (x) { return x.id === id; })[0];
        if (up) copyText(C.diffText(deck, up, C.diffUpgrade(deck, up, state.decks, state.settings))).then(function (ok) { toast(ok ? 'Lista dei cambi copiata.' : 'Copia non riuscita.'); });
        break;
      case 'draft-mode': ui.draft.mode = el.dataset.v; render(); break;
      case 'draft-next': draftNext(); break;
      case 'reuse-all':
        C.findReusable(ui.draft.parsed.cards, state.decks, state.settings).forEach(function (x) { if (x.exact > 0) ui.draft.reuse[x.key + '|exact'] = true; });
        render(); break;
      case 'reuse-none': ui.draft.reuse = {}; render(); break;
      case 'draft-back': ui.draft.step = 1; render(); break;
      case 'draft-create': draftCreate(); break;
      case 'dl-json':
        ui.backupOut = '';
        download('coglio-proxy-archive-backup.json', exportJson(), 'application/json').then(function (r) {
          if (r === 'declined') return;
          toast(r ? 'Backup pronto.' : 'Download non disponibile qui: usa «Copia backup».');
        }); break;
      case 'copy-json':
        copyText(exportJson()).then(function (ok) {
          if (ok) toast('Backup copiato negli appunti.'); else { ui.backupOut = exportJson(); toast('Copia automatica non riuscita: seleziona il testo qui sotto.'); render(); }
        }); break;
      case 'restore-json': restore(ui.restoreText); break;
      case 'bracket':
        deck = getDeck(id);
        if (deck) { if (BK.available() || (window.CPABracket && CARDS.enabled())) BK.start(deck); else BK.web(deck); }
        break;
      case 'bk-web':
        deck = getDeck(id) || getDeck();
        if (deck) BK.web(deck);
        break;
      case 'bk-set': BK.set(parseInt(el.dataset.n, 10)); break;
      case 'analysis': deck = getDeck(id); if (deck) AN.open(deck); break;
      case 'an-close': AN.close(); break;
      case 'an-keep': break;
      case 'bk-close': BK.close(); break;
      case 'bk-keep': break;
      case 'lb-close': IMG.close(); break;
      case 'lb-flip': IMG.flip(); break;
      case 'lb-prints': IMG.prints(); break;
      case 'lb-back': IMG.back(); break;
      case 'lb-pick': { var sy = window.scrollY; IMG.pick(el.dataset.s, el.dataset.n); window.scrollTo(0, sy); } break;
      case 'lb-keep': break;
      case 'news-open': NEWS.open(); break;
      case 'news-close': NEWS.close(); break;
      case 'news-all': NEWS.toggle(); break;
      case 'upd-check': UPD.check(); break;
      case 'upd-go': UPD.start(); break;
      case 'upd-reload': UPD.reload(); break;
      case 'upd-quit': if (window.cpaNet && window.cpaNet.quit) window.cpaNet.quit(); else toast('Chiudi la finestra per uscire.'); break;
      case 'cards-clear': if (CARDS.get()) CARDS.get().clear().then(function () { toast('Dati delle carte cancellati: li riscarico quando servono.'); render(); }); break;
      case 'img-clear': IMG.clear(); toast('Immagini salvate cancellate: le riscarico quando servono.'); render(); break;
      case 'reset-all':
        confirmThen('reset', function () { mutate('Tutti i dati cancellati.', function () { state.decks = []; }); render(); }); break;
    }
  });

  function restore(text) {
    var o;
    try { o = JSON.parse(text); } catch (err) { ui.dataMsg = 'Errore: il testo non è un JSON valido.'; render(); return; }
    var decks = o && (Array.isArray(o.decks) ? o.decks : o.state && o.state.decks);
    if (!Array.isArray(decks)) { ui.dataMsg = 'Errore: non sembra un backup di Coglio Proxy Archive.'; render(); return; }
    mutate('Backup ripristinato: ' + plural(decks.length, 'mazzo', 'mazzi') + '.', function () {
      state.decks = decks.map(C.sanitizeDeck); state.settings = C.sanitizeSettings(o.settings || (o.state && o.state.settings)); applyTheme();
    });
    ui.dataMsg = ''; ui.restoreText = ''; render();
  }

  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (ev.key === 'Enter' && !ev.shiftKey && t && t.getAttribute && t.getAttribute('data-c') === 'dadd-q') { ev.preventDefault(); daddGo(false); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { if (ui.crazy) { closeCrazy(); return; } if (window.CPACommunityUI && window.CPACommunityUI.escape()) return; if (window.CPADesigner && ui.view === 'designer' && window.CPADesigner.escape()) return; if (window.CPABuilder && ui.view === 'builder' && window.CPABuilder.escape()) return; if (window.CPAPescherUI && ui.view === 'pescher' && window.CPAPescherUI.escape()) return; if (AN.isOpen()) AN.close(); else if (BK.isOpen()) BK.close(); else if (IMG.isOpen()) IMG.close(); } });
  document.addEventListener('mousemove', function (ev) {
    var t = ev.target.closest && ev.target.closest('.th.on');
    if (!t && ev.target.closest && ui.view === 'deck') { var dr = ev.target.closest('.dr'); if (dr && !dkAside()) t = dr.querySelector('.th.seed.on'); }
    IMG.hover(!!t, t, ev);
  });
  window.addEventListener('scroll', function () { IMG.hover(false); }, true);
  document.addEventListener('mouseover', function (ev) {
    if (ui.view !== 'deck' || !ev.target.closest) return;
    var r = ev.target.closest('.dr'); if (r) dkSelect(r);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var r = ev.target.classList && ev.target.classList.contains('dr') ? ev.target : null;
    if (r) { ev.preventDefault(); r.click(); }
  });
  document.addEventListener('focusin', function (ev) {
    if (ui.view !== 'deck' || !ev.target.closest) return;
    var r = ev.target.closest('.dr'); if (r) dkSelect(r);
  });

  document.addEventListener('input', function (e) {
    var c = e.target.dataset && e.target.dataset.c; if (!c) return;
    if (c.indexOf('bd-') === 0 && window.CPABuilder) { window.CPABuilder.input(c, e.target); return; }
    if (c.indexOf('dz-') === 0 && window.CPADesigner) { window.CPADesigner.input(c, e.target); return; }
    if (c.indexOf('pe-') === 0 && window.CPAPescherUI) { window.CPAPescherUI.input(c, e.target); return; }
    if (c.indexOf('cm-') === 0 && window.CPACommunityUI) { window.CPACommunityUI.input(c, e.target); return; }
    if (c === 'q') { ui.q = e.target.value; ui.limit = 150; updateArchiveList(); }
    else if (c === 'f-text') { ui.f.text = e.target.value; ui.limit = 150; updateArchiveList(); }
    else if (c === 'upq') { ui.upQ = e.target.value; updateUpgradeCols(); }
    else if (c === 'deckq') { ui.deckQ = e.target.value; updateDeckList(); }
    else if (c === 'dadd-q') daddSuggest(e.target.value);
    else if (c === 'draft-text') ui.draft.text = e.target.value;
    else if (c === 'draft-name') ui.draft.name = e.target.value;
    else if (c === 'restore-text') ui.restoreText = e.target.value;
    else if (c === 'cmd-q') { ui.draft.cq = e.target.value; $('#cmdlist').innerHTML = cmdListHtml(ui.draft); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target, c = t.dataset && t.dataset.c; if (!c) return;
    if (c.indexOf('bd-') === 0 && window.CPABuilder) { window.CPABuilder.change(c, t); return; }
    if (c.indexOf('dz-') === 0 && window.CPADesigner) { window.CPADesigner.change(c, t); return; }
    if (c.indexOf('pe-') === 0 && window.CPAPescherUI) { window.CPAPescherUI.change(c, t); return; }
    if (c.indexOf('cm-') === 0 && window.CPACommunityUI) { window.CPACommunityUI.change(c, t); return; }
    var d;
    switch (c) {
      case 'fdeck': ui.fdeck = t.value; ui.limit = 150; render(); break;
      case 'fset': ui.fset = t.value; ui.limit = 150; render(); break;
      case 'sort': ui.sort = t.value; render(); break;
      case 'dsort': ui.dSort = t.value; updateDeckList(); break;
      case 'nobasic': ui.nobasic = t.checked; ui.limit = 150; render(); break;
      case 'status':
        d = getDeck(t.dataset.id);
        if (d) {
          var st = t.value; d.status = st; d.active = st === 'active'; d.updatedAt = Date.now(); touch(d.id);
          toast(st === 'active' ? d.name + ' attivo: le sue ' + sum(d.cards) + ' carte risultano in uso.' :
            st === 'unprinted' ? d.name + ' non ancora stampato: le sue carte non entrano nell\'archivio finché non lo stampi.' :
              d.name + ' non attivo: le sue carte tornano libere.');
          render();
        } break;
      case 'dadd-to': ui.dAddSide = t.value === 'side'; break;
      case 'mpc-min': case 'mpc-sort': case 'mpc-hide': case 'mpc-one': IMG.mpcChange(c, t); break;
      case 'deck-name': d = getDeck(); if (d && t.value.trim()) { d.name = t.value.trim(); d.updatedAt = Date.now(); touch(d.id); render(); } break;
      case 'deck-cmd': d = getDeck(); if (d) { d.commander = t.value || null; d.updatedAt = Date.now(); touch(d.id); render(); } break;
      case 'up-name':
        d = getDeck();
        var u = d && d.upgrades.filter(function (x) { return x.id === ui.upId; })[0];
        if (u && t.value.trim()) { u.name = t.value.trim(); touch(d.id); render(); } break;
      case 'cmd': ui.draft.commander = t.value || null; break;
      case 'draft-status': ui.draft.status = t.value; render(); break;
      case 'reuse': ui.draft.reuse[t.dataset.k + '|' + t.dataset.t] = t.checked; reuseSummary(); break;
      case 'draft-file':
        if (t.files && t.files[0]) {
          var f = t.files[0];
          readFile(f, function (txt) { ui.draft.text = txt; if (!ui.draft.name) ui.draft.name = f.name.replace(/\.[^.]+$/, ''); render(); });
        } break;
      case 'restore-file':
        if (t.files && t.files[0]) readFile(t.files[0], function (txt) { ui.restoreText = txt; render(); }); break;
      case 'theme': state.settings.theme = t.value; applyTheme(); touchSettings(); break;
      case 'basics': state.settings.basicsUnlimited = t.checked; touchSettings(); break;
      case 'sync-auto': SYNC.setAuto(t.checked); break;
      case 'sync-key': { var kk = {}; kk[t.dataset.k] = t.value; SYNC.get().setKeys(kk); render(); } break;
      case 'images': state.settings.images = t.checked; touchSettings(); render(); break;
    }
  });

  /* Funzioni che la schermata di stampa (builder.js) può usare. */
  window.CPAHost = {
    cmpVersion: UPD.cmp,
    esc: esc, toast: toast, download: download, getDeck: getDeck, ui: ui, render: render, mutate: mutate,
    decks: function () { return state.decks; },
    available: function () { return !!store && store.kind !== 'claude' && typeof fetch === 'function'; }
  };

  /* ---------- Avvio ---------- */
  function boot() {
    APP.innerHTML = '<p class="sub" style="padding:40px 16px">Carico l\'archivio…</p>';
    initStore().then(function (s) {
      store = s;
      return s.load().catch(function () {
        return makeIdbStore().catch(function () { try { return makeLocalStore(); } catch (e) { return makeMemoryStore(); } })
          .then(function (s2) { store = s2; return s2.load(); });
      });
    }).then(function (data) {
      state.decks = (data.decks || []).map(C.sanitizeDeck);
      state.settings = C.sanitizeSettings(data.settings);
      state.decks.forEach(function (d) { sigs[d.id] = sigOf(d); });
      archCache = null; applyTheme(); render(); SYNC.start();
    }).catch(function () { store = makeMemoryStore(); render(); });
  }
  CARDS.onRepaint(function () {
    if (ui.view === 'archive') updateArchiveList();
    else if (typeof repaintPrices === 'function') repaintPrices();
  });
  boot();
})();
