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
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/></svg>',
    decks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h9"/></svg>',
    import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    builder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="7" y="13" width="10" height="8" rx="1"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
  };
  var LOGO = '<svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true">' +
    '<rect x="5" y="7" width="19" height="26" rx="3.5" transform="rotate(-14 14 20)" style="fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.6"/>' +
    '<rect x="9" y="5" width="19" height="26" rx="3.5" style="fill:var(--surface);stroke:var(--accent);stroke-width:1.6"/>' +
    '<rect x="13" y="7" width="19" height="26" rx="3.5" transform="rotate(12 22 20)" style="fill:var(--accent)"/>' +
    '<circle cx="29" cy="29" r="8" style="fill:var(--stamp)"/>' +
    '<path d="M25.4 29.2l2.6 2.6 4.6-5.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- Stato ---------- */
  var state = { decks: [], settings: C.sanitizeSettings() };
  var ui = {
    view: 'archive', deckId: null, upId: null, deckTab: 'cards', deckQ: '',
    q: '', st: 'all', fdeck: '', fset: '', sort: 'name', nobasic: false, open: {}, limit: 150,
    upQ: '', upSt: 'all', draft: null, confirm: null, backupOut: '', restoreText: '', dataMsg: ''
  };
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

  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 350); }
  function touch(id) { archCache = null; delete gone[id]; dirty[id] = true; schedule(); }
  function touchSettings() { archCache = null; settingsDirty = true; schedule(); }
  function removed(id) { archCache = null; delete dirty[id]; gone[id] = true; schedule(); }
  function persistAll(prevIds) {
    archCache = null;
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
    function show(deck, sum) {
      var combos = sum.combos.map(function (c) {
        return '<li><b>' + c.cards.map(esc).join(' + ') + '</b>' + (c.result.length ? ' → ' + esc(c.result.join(', ')) : '') +
          (c.twoCard ? ' <em class="bk-tag">due carte</em>' : '') + '</li>';
      }).join('');
      var warn = sum.banned.length ? '<p class="lb-warn">Carte bandite in Commander: ' + sum.banned.map(esc).join(', ') + '.</p>' : '';
      var unk = sum.unknown.length ? '<div class="bk-sec"><h4>Carte non riconosciute <span>' + sum.unknown.length + '</span></h4><p>' + sum.unknown.slice(0, 12).map(esc).join(' · ') + (sum.unknown.length > 12 ? ' · … e altre ' + (sum.unknown.length - 12) : '') +
        '<br><small>Non contano nella stima: controlla il nome.</small></p></div>' : '';
      shell(deck,
        '<div class="bk-score"><div class="bk-num b' + sum.n + '"><small>Bracket stimato</small><b>' + (sum.n || '✕') + '</b></div>' +
        '<div><span class="bk-chip t-' + esc(sum.tag.toLowerCase()) + '">Spellbook: ' + esc(sum.name) + '</span><p>Perché: ' + sum.reasons.map(esc).join('; ') + '.</p></div></div>' + warn +
        list('Game Changer', sum.gameChangers) + list('Distruzione di terre di massa', sum.massLandDenial) + list('Turni extra', sum.extraTurns) +
        (combos ? '<div class="bk-sec"><h4>Combo trovate <span>' + sum.combos.length + '</span></h4><ul>' + combos + '</ul></div>' : '') + unk +
        (!sum.gameChangers.length && !sum.massLandDenial.length && !sum.extraTurns.length && !sum.combos.length && !sum.banned.length ? '<p class="bk-none">Nessun Game Changer, turno extra, distruzione di terre o combo trovati.</p>' : '') +
        '<p class="bk-foot">Calcolo basato sulle regole di Wizards e sui dati di Commander Spellbook. Non misura la velocità di gioco (che può alzare il bracket), e 1 e 5 (cEDH) non si calcolano: se commanderbracket.app dice altro, imposta il suo numero a mano. La lista del mazzo viene inviata a Commander Spellbook per il calcolo.</p>' +
        '<div class="bk-set"><span>Se il tuo riferimento dice altro, imposta a mano:</span>' + [1, 2, 3, 4, 5].map(function (k) {
          return '<button class="bk-badge b' + k + '" data-a="bk-set" data-n="' + k + '" aria-label="Imposta bracket ' + k + '">' + k + '</button>';
        }).join('') + '</div><div class="bk-bar">' + webBtn() + '</div>');
    }
    function fail(deck, why) {
      shell(deck, '<p class="lb-warn">' + (why === 'cors' ? 'Da questo browser il calcolo non è disponibile: il sito di Commander Spellbook non permette richieste da altre pagine.' :
        'Non sono riuscito a calcolare il bracket (' + (why === 'timeout' ? 'tempo scaduto' : why === 'http' ? 'il servizio ha risposto con un errore' : 'nessuna connessione') + ').') + '</p>' +
        '<p>Puoi farlo sul sito: copio la lista e lo apro, poi incolli e premi «Check my bracket».</p><div class="bk-bar">' + webBtn() + '</div>');
    }
    function start(deck) {
      last = deck; var my = ++run, payload = C.bracketPayload(deck);
      shell(deck, '<p class="lb-wait bk-wait">Calcolo il bracket di «' + esc(deck.name) + '»…</p>');
      var native = !!window.cpaNet;
      call(payload).then(function (j) {
        if (my !== run || !box) return;
        var sum = C.bracketSummary(j, payload);
        saveBracket(deck, { n: sum.n, sig: C.deckSig(deck), at: Date.now(), manual: false });
        show(deck, sum);
      }, function (e) {
        if (my !== run || !box) return;
        var m = e && e.message;
        fail(deck, m === 'timeout' || m === 'http' ? m : (!native && e instanceof TypeError && location.protocol.indexOf('http') === 0 && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) ? 'cors' : 'network');
      });
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

  function applyTheme() {
    var t = state.settings.theme, r = document.documentElement;
    if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t); else r.removeAttribute('data-theme');
  }

  /* ---------- Immagini delle carte (Scryfall) ---------- */
  /* Dato nome e collezione, l'immagine si ricava da api.scryfall.com. Le richieste partono a lotti (fino a 75
     carte) solo per le righe che si vedono, con una pausa fra una chiamata e l'altra come chiede Scryfall.
     L'indirizzo trovato resta salvato sul dispositivo, quindi ogni carta si cerca una volta sola. */
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
      if (h.u) {
        el.classList.remove('nf'); el.classList.add('on');
        if (h.m) el.classList.add('fb');
        if (!el.querySelector('img')) {
          var im = document.createElement('img');
          im.alt = ''; im.decoding = 'async'; im.src = url(h.u, 'small'); el.appendChild(im);
        }
      } else el.classList.add('nf');
    }
    function paint() { [].forEach.call(document.querySelectorAll('.th[data-thk]'), fill); }
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

    /* ----- anteprima grande ----- */
    function closeLb() { if (lb) { lb.remove(); lb = null; } }
    function showLb(el, side) {
      var h = get(el.getAttribute('data-thk')); if (!h || !h.u) return;
      closeLb();
      var name = el.getAttribute('data-thn'), set = el.getAttribute('data-ths'), cn = el.getAttribute('data-thc');
      var t = side && h.b ? h.b : h.u;
      lb = document.createElement('div'); lb.id = 'lb'; lb.className = 'lb'; lb.setAttribute('data-a', 'lb-close');
      lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Anteprima di ' + name);
      lb._el = el; lb._side = side ? 1 : 0;
      lb.innerHTML = '<div class="lb-box" data-a="lb-keep"><img src="' + esc(url(t, 'normal')) + '" alt="' + esc(name) + '">' +
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
      lb.innerHTML = '<div class="lb-box wide" data-a="lb-keep"><div class="lb-bar"><span class="lb-name">Scegli la stampa che hai: ' + esc(name) + '</span>' +
        '<button class="btn small" data-a="lb-back">Indietro</button><button class="btn small" data-a="lb-close" id="lbx">Chiudi</button></div>' +
        '<div class="pr-grid" id="prgrid"><p class="lb-wait">Cerco le stampe su Scryfall…</p></div></div>';
      var q = '!"' + String(name).replace(/"/g, '') + '"';
      var mine = lb;
      getJson('/cards/search?q=' + encodeURIComponent(q) + '&unique=prints&order=released&dir=desc').then(function (res) {
        if (lb !== mine) return;
        var list = ((res && res.data) || []).filter(function (c) { return !c.digital && nameIs(c, name); });
        var grid = lb.querySelector('#prgrid');
        if (!list.length) { grid.innerHTML = '<p class="lb-wait">Nessuna stampa trovata.</p>'; return; }
        grid.innerHTML = list.map(function (c) {
          var f = faces(c); if (!f) return '';
          cache[key(name, c.set, c.collector_number)] = { u: f.u, b: f.b, t: Date.now() };
          var cur = c.set === set0 && String(c.collector_number).toLowerCase() === cn0;
          return '<button class="pr' + (cur ? ' cur' : '') + '" data-a="lb-pick" data-s="' + esc(c.set) + '" data-n="' + esc(c.collector_number) + '" title="' + esc(c.set_name || '') + '">' +
            '<img src="' + esc(url(f.u, 'small')) + '" alt="' + esc(c.set_name || c.set) + '" loading="lazy"><span>' + esc(c.set.toUpperCase()) + ' ' + esc(c.collector_number) + ' · ' + esc((c.released_at || '').slice(0, 4)) + '</span></button>';
        }).join('');
        persist();
      }).catch(function () {
        if (lb !== mine) return;
        lb.querySelector('#prgrid').innerHTML = '<p class="lb-wait">Non riesco a contattare Scryfall. Riprova tra poco.</p>';
      });
    }
    function backLb() { if (lb && lb._el) showLb(lb._el, false); }
    function pickLb(set, cn) {
      if (!lb || !lb._el) return;
      var el = lb._el, deckId = el.getAttribute('data-thd'), nm = el.getAttribute('data-thn');
      var s0 = el.getAttribute('data-ths') || '', c0 = el.getAttribute('data-thc') || '';
      var label = nm + ' ' + set.toUpperCase() + ' ' + cn;
      closeLb();
      mutate('Stampa scelta: ' + label, function () {
        var d = getDeck(deckId); if (!d) return;
        var card = d.cards.filter(function (c) { return C.keyOf(c.name) === C.keyOf(nm) && (c.set || '') === s0 && (c.cn || '') === c0; })[0];
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
      open: function (el) { showLb(el, false); }, flip: flipLb, prints: printsLb, back: backLb, pick: pickLb, close: closeLb, hover: hover, isOpen: function () { return !!lb; } };
  })();

  /* ---------- Struttura generale ---------- */
  var NAV = [['archive', 'Archivio'], ['decks', 'Mazzi'], ['import', 'Importa'], ['builder', 'Stampa'], ['data', 'Dati']];
  function navBtn(v, label) {
    var cur = ui.view === v || (v === 'decks' && (ui.view === 'deck' || ui.view === 'upgrade'));
    return '<button class="nav" data-a="nav" data-v="' + v + '"' + (cur ? ' aria-current="page"' : '') + '>' + IC[v] + '<span>' + label + '</span></button>';
  }
  function render() {
    var navHtml = NAV.map(function (n) { return navBtn(n[0], n[1]); }).join('');
    APP.innerHTML =
      '<div class="shell"><aside class="side"><div class="brand">' + LOGO + '<span><b>Coglio</b><small>Proxy Archive</small></span></div>' + navHtml + '</aside>' +
      '<main class="main"><div class="mobile-brand">' + LOGO + '<span><b>Coglio</b><small>Proxy Archive</small></span></div>' + viewHtml() + '</main></div>' +
      '<nav class="tabs" aria-label="Sezioni">' + navHtml + '</nav>';
    if (ui.view === 'archive' && state.decks.length) updateArchiveList();
    if (ui.view === 'deck') updateDeckList();
    if (ui.view === 'upgrade') updateUpgradeCols();
  }
  function viewHtml() {
    switch (ui.view) {
      case 'decks': return decksView();
      case 'deck': return deckView();
      case 'upgrade': return upgradeView();
      case 'import': return importView();
      case 'builder': return window.CPABuilder ? window.CPABuilder.html() : decksView();
      case 'data': return dataView();
      default: return archiveView();
    }
  }
  function go(v) {
    if (v === 'builder' && window.CPABuilder) { ui.confirm = null; window.CPABuilder.open(null); return; }
    ui.view = v; ui.confirm = null;
    if (v === 'import' && !(ui.draft && ui.draft.step === 1 && ui.draft.mode !== 'upgrade')) ui.draft = newDraft('deck');
    window.scrollTo(0, 0); render();
  }
  function welcome() {
    return '<div class="empty"><h2>Archivio vuoto</h2><p>Importa le liste dei tuoi mazzi e l\'archivio ti dirà quali carte hai, quante sono libere e dove sono impegnate.</p>' +
      '<ol class="steps"><li><b>Importa</b> una lista .txt (quantità, nome, e se vuoi collezione).</li><li><b>Scegli il commander</b> dalla lista.</li><li><b>Attiva</b> i mazzi che hai montati: le loro carte risulteranno in uso.</li></ol>' +
      '<button class="btn primary" data-a="nav" data-v="import">Importa il primo mazzo</button></div>';
  }

  /* ---------- Archivio ---------- */
  function archiveFiltered(A) {
    var q = C.searchNorm(ui.q);
    var l = A.list.filter(function (e) {
      if (q && C.searchNorm(e.name).indexOf(q) < 0) return false;
      if (ui.st === 'avail' && !(e.free > 0)) return false;
      if (ui.st === 'busy' && e.free !== 0) return false;
      if (ui.st === 'part' && e.status !== 'part') return false;
      if (ui.fdeck && !e.rows.some(function (r) { return r.deckId === ui.fdeck; })) return false;
      if (ui.fset && e.sets.indexOf(ui.fset) < 0) return false;
      if (ui.nobasic && e.basic) return false;
      return true;
    });
    if (ui.sort === 'owned') l.sort(function (a, b) { return b.owned - a.owned || byName(a, b); });
    if (ui.sort === 'free') l.sort(function (a, b) { return b.free - a.free || byName(a, b); });
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
  function itemHtml(e) {
    var open = !!ui.open[e.key];
    var isCmd = state.decks.some(function (d) { return d.commander && C.keyOf(d.commander) === e.key; });
    var tags = (isCmd ? '<span class="tag cmd">commander</span>' : '') + (e.basic ? '<span class="tag">terra base</span>' : '') +
      e.sets.map(function (s) { return '<span class="tag">' + esc(s) + '</span>'; }).join('');
    return '<li class="item s-' + e.status + '"><button class="item-main" data-a="toggle-card" data-k="' + esc(e.key) + '" aria-expanded="' + open + '">' +
      '<span class="ttl">' + IMG.thumb(e.name, e.pset, e.pcn) + '<span class="ttx"><span class="nm">' + esc(e.name) + '</span>' + (tags ? '<span class="tags">' + tags + '</span>' : '') + '</span></span>' +
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
      '<div class="sticky"><div class="search">' + IC.search + '<input class="input" id="q" data-c="q" type="search" inputmode="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cerca una carta nel tuo archivio" aria-label="Cerca una carta" value="' + esc(ui.q) + '"></div>' +
      '<div class="chips" role="group" aria-label="Disponibilità">' + chip('all', 'Tutte', s.unique) + chip('avail', 'Con copie libere', s.avail) + chip('busy', 'Tutte occupate', s.busy) + chip('part', 'Parziali', s.part) + '</div>' +
      '<div class="row-sel"><label class="lbl">Mazzo<select class="select" data-c="fdeck">' + opt('', 'Tutti i mazzi', ui.fdeck) + state.decks.map(function (d) { return opt(d.id, d.name, ui.fdeck); }).join('') + '</select></label>' +
      '<label class="lbl">Collezione<select class="select" data-c="fset">' + opt('', 'Tutte', ui.fset) + Object.keys(sets).sort().map(function (x) { return opt(x, x, ui.fset); }).join('') + '</select></label>' +
      '<label class="lbl">Ordina<select class="select" data-c="sort">' + opt('name', 'Nome', ui.sort) + opt('owned', 'Più copie', ui.sort) + opt('free', 'Più libere', ui.sort) + '</select></label></div>' +
      '<label class="check"><input type="checkbox" data-c="nobasic"' + (ui.nobasic ? ' checked' : '') + '> Nascondi terre base</label></div>' +
      '<p class="count" id="acount" aria-live="polite"></p><ul class="list" id="alist"></ul><div class="more" id="amore"></div>' +
      '<details class="how"><summary>Come conto le carte</summary><p><b>Possedute</b>: tutte le copie presenti nelle liste che hai inserito (mazzi e carte sciolte). <b>In uso</b>: le copie nei mazzi segnati come attivi. <b>Libere</b>: possedute meno in uso, cioè le carte dei mazzi smontati e delle carte sciolte. Se la stessa carta compare in due mazzi, sono due copie. Le terre base possono essere considerate sempre disponibili nelle impostazioni.</p></details>';
  }
  function updateArchiveList() {
    var list = $('#alist'); if (!list) return;
    var A = getArchive(), f = archiveFiltered(A), shown = f.slice(0, ui.limit);
    $('#acount').textContent = f.length === A.list.length ? plural(f.length, 'carta', 'carte') : plural(f.length, 'carta trovata', 'carte trovate') + ' su ' + A.list.length;
    list.innerHTML = shown.length ? shown.map(itemHtml).join('') :
      '<li class="empty"><p>Nessuna carta corrisponde ai filtri. Se non è in nessuna lista che hai importato, non è nel tuo archivio.</p></li>';
    $('#amore').innerHTML = f.length > shown.length ? '<button class="btn" data-a="more">Mostra altre ' + Math.min(150, f.length - shown.length) + '</button>' : '';
    IMG.hydrate();
  }

  /* ---------- Mazzi ---------- */
  function switchHtml(d) {
    return '<label class="switch"><input type="checkbox" data-c="active" data-id="' + esc(d.id) + '"' + (d.active ? ' checked' : '') + '><span class="tr"></span><span>' + (d.active ? 'Attivo' : 'Non attivo') + '</span></label>';
  }
  function deckCard(d) {
    var on = d.kind === 'deck' && d.active;
    var meta = d.kind === 'deck' ? (d.commander ? 'Commander: ' + esc(d.commander) : 'Nessun commander scelto') : 'Carte sciolte, sempre disponibili';
    return '<article class="deckcard' + (on ? ' is-on' : '') + '"><div class="top"><div><h2>' + esc(d.name) + (d.kind === 'deck' ? bracketBadge(d) : '') + '</h2><div class="meta">' + meta + ' · ' + plural(sum(d.cards), 'carta', 'carte') + '</div></div>' +
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
  function bracketBtn(d) {
    return '<button class="btn small bracket" data-a="bracket" data-id="' + esc(d.id) + '" title="Calcola il bracket del mazzo">Verifica bracket</button>';
  }
  function decksView() {
    var ds = state.decks.filter(function (d) { return d.kind === 'deck'; }), bs = state.decks.filter(function (d) { return d.kind === 'binder'; });
    if (!state.decks.length) return '<header class="vh"><h1>Mazzi</h1></header>' + welcome();
    var act = ds.filter(function (d) { return d.active; }).length;
    return '<header class="vh"><h1>Mazzi</h1><p class="sub"><b>' + act + '</b> attivi su <b>' + ds.length + '</b>. Un mazzo attivo è montato: le sue carte risultano in uso nell\'archivio.</p></header>' +
      '<div class="btns" style="margin-bottom:12px"><button class="btn primary" data-a="nav" data-v="import">Importa un mazzo</button></div>' +
      '<div class="list">' + ds.map(deckCard).join('') + '</div>' +
      (bs.length ? '<h2 class="sect">Carte sciolte</h2><div class="list">' + bs.map(deckCard).join('') + '</div>' : '');
  }
  function deckView() {
    var d = getDeck(); if (!d) { ui.view = 'decks'; return decksView(); }
    var armedDel = armed('del-deck:' + d.id);
    var cmdOpts = '<option value="">Nessuno</option>' + d.cards.slice().sort(byName).map(function (c) {
      return '<option value="' + esc(c.name) + '"' + (c.name === d.commander ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    var tabs = '<div class="subtabs"><button class="chip" data-a="deck-tab" data-v="cards" aria-pressed="' + (ui.deckTab === 'cards') + '">Carte (' + sum(d.cards) + ')</button>' +
      (d.kind === 'deck' ? '<button class="chip" data-a="deck-tab" data-v="ups" aria-pressed="' + (ui.deckTab === 'ups') + '">Upgrade (' + d.upgrades.length + ')</button>' : '') + '</div>';
    var body;
    if (ui.deckTab === 'ups' && d.kind === 'deck') {
      body = '<div class="btns" style="margin-bottom:12px"><button class="btn primary" data-a="new-up">Nuovo upgrade</button></div>' +
        (d.upgrades.length ? '<div class="list">' + d.upgrades.map(function (u) { return upgradeCard(d, u); }).join('') + '</div>' :
          '<div class="empty"><p>Incolla la lista aggiornata di questo mazzo: vedrai cosa esce, cosa entra e quali carte hai già nell\'archivio, così non ristampi doppioni.</p></div>');
    } else {
      body = '<div class="search" style="margin-bottom:10px">' + IC.search + '<input class="input" data-c="deckq" type="search" placeholder="Cerca nelle carte del mazzo" autocomplete="off" aria-label="Cerca nel mazzo" value="' + esc(ui.deckQ) + '"></div><div class="list" id="dlist"></div>';
    }
    return '<header class="vh"><button class="back" data-a="nav" data-v="decks">← Mazzi</button><h1>' + esc(d.name) + (d.kind === 'deck' ? bracketBadge(d) : '') + '</h1></header>' +
      '<section class="panel"><label class="lbl">Nome<input class="input" data-c="deck-name" value="' + esc(d.name) + '"></label>' +
      (d.kind === 'deck' ? '<label class="lbl">Commander<select class="select" data-c="deck-cmd">' + cmdOpts + '</select></label><div>' + switchHtml(d) +
        '<p class="hint" style="margin-top:6px">' + (d.active ? 'Le carte di questo mazzo risultano in uso.' : 'Mazzo smontato: le sue carte risultano libere.') + '</p></div>' : '<p class="hint">Carte sciolte: sempre disponibili per i tuoi prossimi mazzi.</p>') +
      '<div class="btns">' + (d.kind === 'deck' ? bracketBtn(d) : '') + '<button class="btn small" data-a="make-pdf" data-id="' + esc(d.id) + '">Crea PDF</button><button class="btn small" data-a="copy-deck">Copia lista .txt</button><button class="btn small danger' + (armedDel ? ' armed' : '') + '" data-a="del-deck" data-cf="1" data-id="' + esc(d.id) + '">' + (armedDel ? 'Conferma eliminazione' : 'Elimina') + '</button></div></section>' + tabs + body;
  }
  function updateDeckList() {
    var el = $('#dlist'); var d = getDeck(); if (!el || !d) return;
    var A = getArchive(), q = C.searchNorm(ui.deckQ);
    var cards = d.cards.slice().sort(byName).filter(function (c) { return !q || C.searchNorm(c.name).indexOf(q) >= 0; });
    el.innerHTML = cards.map(function (c) {
      var e = A.map[C.keyOf(c.name)], others = e ? e.rows.filter(function (r) { return r.deckId !== d.id; }) : [];
      var isCmd = d.commander && C.keyOf(d.commander) === C.keyOf(c.name);
      return '<div class="crow">' + IMG.thumb(c.name, c.set, c.cn, d.id) + '<span class="qty">' + c.qty + '×</span><span class="nm">' + esc(c.name) + '</span>' +
        (isCmd ? '<span class="tag cmd">commander</span>' : '') + (c.set ? '<span class="tag">' + esc(c.set) + (c.cn ? ' ' + esc(c.cn) : '') + '</span>' : '') +
        (others.length ? '<span class="other">' + others.map(function (r) {
          return '<span class="pill ' + (r.active ? 'use' : 'free') + '">anche in ' + esc(r.deckName) + ' ×' + r.qty + (r.active ? ' · in uso' : ' · libera') + '</span>';
        }).join('') + '</span>' : '') + '</div>';
    }).join('') || '<p class="hint">Nessuna carta trovata.</p>';
    IMG.hydrate();
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
    return { mode: mode, deckId: deckId || null, step: 1, name: '', text: '', parsed: null, commander: null, cq: '', active: true, error: '' };
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
    var r = C.findReusable(cards, state.decks, state.settings);
    var ex = r.filter(function (x) { return x.exact > 0; }), ot = r.filter(function (x) { return x.other > 0; });
    var want = function (x) { return x.wanted.length === 1 ? ptag(x.wanted[0]) : ''; };
    var h = '';
    if (ex.length) {
      h += '<div class="reuse"><p><b>CODIGHEL!</b> Queste carte le hai già stampate, <b>esattamente in questa stampa</b>: verifica prima di stampare di nuovo.</p><ul>' + ex.map(function (x) {
        return '<li><span class="qty">' + x.exact + '×</span> ' + esc(x.name) + want(x) + '<span class="sm"> in ' + where(x.exactRows) + (x.exact < x.need ? ' · ne servono ' + x.need : '') + '</span></li>';
      }).join('') + '</ul></div>';
    }
    if (ot.length) {
      h += '<div class="reuse alt"><p><b>Stessa carta, stampa diversa.</b> Hai già queste carte ma in un\'altra stampa. Se ti basta puoi riusarle; se vuoi proprio quella della lista vanno stampate (per l\'archivio sono carte diverse).</p><ul>' + ot.map(function (x) {
        return '<li><span class="qty">' + x.other + '×</span> ' + esc(x.name) + (x.wanted.length === 1 ? '<span class="sm"> nella lista: ' + esc(prLabel(x.wanted[0])) + '</span>' : '') + '<span class="sm"> hai: ' + where(x.otherRows) + '</span></li>';
      }).join('') + '</ul></div>';
    }
    return h;
  }
  function importStep2(d) {
    var p = d.parsed;
    return '<header class="vh"><button class="back" data-a="draft-back">← Lista</button><h1>Scegli il commander</h1><p class="sub"><b>' + p.total + '</b> carte (' + p.unique + ' diverse)' + (p.excluded ? ' · ' + p.excluded + ' escluse (sideboard)' : '') + '</p></header>' +
      '<section class="panel">' +
      (p.total !== 100 ? '<p class="warn">La lista ha ' + p.total + ' carte: un mazzo Commander di solito ne ha 100. Puoi importarla lo stesso.</p>' : '') +
      (p.warnings.length ? '<p class="warn">' + plural(p.warnings.length, 'riga non letta', 'righe non lette') + ': ' + esc(p.warnings.slice(0, 3).join(' | ')) + (p.warnings.length > 3 ? '…' : '') + '</p>' : '') +
      reuseBanner(p.cards) +
      '<div class="search">' + IC.search + '<input class="input" data-c="cmd-q" type="search" placeholder="Cerca il commander nella lista" autocomplete="off" aria-label="Cerca il commander" value="' + esc(d.cq) + '"></div>' +
      '<div class="pick" id="cmdlist" role="radiogroup" aria-label="Commander">' + cmdListHtml(d) + '</div>' +
      '<label class="switch"><input type="checkbox" data-c="draft-active"' + (d.active ? ' checked' : '') + '><span class="tr"></span><span>Mazzo attivo (montato adesso)</span></label>' +
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
      active: kind === 'deck' && d.active, commander: kind === 'deck' ? (d.commander || null) : null,
      cards: p.cards, upgrades: [], createdAt: now, updatedAt: now
    };
    state.decks.push(nd); touch(nd.id);
    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) { /* ignorato */ } }
    ui.view = kind === 'deck' ? 'deck' : 'archive'; ui.deckId = nd.id; ui.deckTab = 'cards'; ui.deckQ = ''; ui.draft = null;
    toast((kind === 'deck' ? 'Mazzo creato' : 'Carte aggiunte') + ': ' + plural(sum(p.cards), 'carta', 'carte')); window.scrollTo(0, 0); render();
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
  function dataView() {
    var armedReset = armed('reset');
    return '<header class="vh"><h1>Dati</h1><p class="sub">' + esc(storageLabel()) + '</p></header>' +
      '<section class="panel"><h2 class="sect" style="margin:0">Impostazioni</h2>' +
      '<label class="lbl">Tema<select class="select" data-c="theme"><option value="auto"' + (state.settings.theme === 'auto' ? ' selected' : '') + '>Automatico</option><option value="light"' + (state.settings.theme === 'light' ? ' selected' : '') + '>Chiaro</option><option value="dark"' + (state.settings.theme === 'dark' ? ' selected' : '') + '>Scuro</option></select></label>' +
      '<label class="switch"><input type="checkbox" data-c="basics"' + (state.settings.basicsUnlimited ? ' checked' : '') + '><span class="tr"></span><span>Terre base sempre disponibili negli upgrade</span></label>' +
      '<label class="switch"><input type="checkbox" data-c="images"' + (state.settings.images !== false ? ' checked' : '') + '><span class="tr"></span><span>Mostra le immagini delle carte</span></label>' +
      '<p class="hint">' + imagesHint() + '</p>' +
      (IMG.enabled() && IMG.count() ? '<div class="btns"><button class="btn small" data-a="img-clear">Cancella le immagini salvate</button></div>' : '') + '</section>' +
      '<section class="panel"><h2 class="sect" style="margin:0">Backup</h2><p class="hint">Un file JSON con tutti i mazzi, gli upgrade e le impostazioni.</p>' +
      '<div class="btns"><button class="btn" data-a="dl-json">Scarica backup</button><button class="btn" data-a="copy-json">Copia backup</button></div>' +
      (ui.backupOut ? '<textarea class="textarea out-ta mono" readonly aria-label="Backup">' + esc(ui.backupOut) + '</textarea>' : '') +
      '<label class="lbl">Ripristina da backup<textarea class="textarea out-ta mono" data-c="restore-text" placeholder="Incolla qui il JSON del backup">' + esc(ui.restoreText) + '</textarea></label>' +
      '<label class="lbl">Oppure scegli il file<input class="input" type="file" data-c="restore-file" accept=".json,application/json"></label>' +
      (ui.dataMsg ? '<p class="' + (ui.dataMsg.indexOf('Errore') === 0 ? 'err' : 'hint') + '" role="status">' + esc(ui.dataMsg) + '</p>' : '') +
      '<div class="btns"><button class="btn" data-a="restore-json">Ripristina (sostituisce tutto)</button></div></section>' +
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
    var deck;
    switch (a) {
      case 'nav': go(el.dataset.v); break;
      case 'undo': if (TOAST._undo) { var uf = TOAST._undo; hideToast(); uf(); } break;
      case 'toast-close': hideToast(); break;
      case 'st': ui.st = el.dataset.v; ui.limit = 150; render(); break;
      case 'more': ui.limit += 150; updateArchiveList(); break;
      case 'toggle-card': ui.open[el.dataset.k] = !ui.open[el.dataset.k]; updateArchiveList(); break;
      case 'open-deck': ui.view = 'deck'; ui.deckId = id; ui.deckTab = 'cards'; ui.deckQ = ''; window.scrollTo(0, 0); render(); break;
      case 'deck-tab': ui.deckTab = el.dataset.v; render(); break;
      case 'back-deck': ui.view = 'deck'; ui.deckTab = 'ups'; window.scrollTo(0, 0); render(); break;
      case 'del-deck':
        confirmThen('del-deck:' + id, function () {
          var d = getDeck(id); mutate('Mazzo eliminato: ' + (d ? d.name : ''), function () { state.decks = state.decks.filter(function (x) { return x.id !== id; }); });
          ui.view = 'decks'; render();
        }); break;
      case 'make-pdf': if (window.CPABuilder) window.CPABuilder.open(id); break;
      case 'copy-deck': deck = getDeck(); if (deck) copyText(C.exportText(deck)).then(function (ok) { toast(ok ? 'Lista copiata negli appunti.' : 'Copia non riuscita.'); }); break;
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
        if (deck) { if (BK.available()) BK.start(deck); else BK.web(deck); }
        break;
      case 'bk-web':
        deck = getDeck(id) || getDeck();
        if (deck) BK.web(deck);
        break;
      case 'bk-set': BK.set(parseInt(el.dataset.n, 10)); break;
      case 'bk-close': BK.close(); break;
      case 'bk-keep': break;
      case 'lb-close': IMG.close(); break;
      case 'lb-flip': IMG.flip(); break;
      case 'lb-prints': IMG.prints(); break;
      case 'lb-back': IMG.back(); break;
      case 'lb-pick': IMG.pick(el.dataset.s, el.dataset.n); break;
      case 'lb-keep': break;
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

  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { if (BK.isOpen()) BK.close(); else if (IMG.isOpen()) IMG.close(); } });
  document.addEventListener('mousemove', function (ev) {
    var t = ev.target.closest && ev.target.closest('.th.on');
    IMG.hover(!!t, t, ev);
  });
  window.addEventListener('scroll', function () { IMG.hover(false); }, true);

  document.addEventListener('input', function (e) {
    var c = e.target.dataset && e.target.dataset.c; if (!c) return;
    if (c.indexOf('bd-') === 0 && window.CPABuilder) { window.CPABuilder.input(c, e.target); return; }
    if (c === 'q') { ui.q = e.target.value; ui.limit = 150; updateArchiveList(); }
    else if (c === 'upq') { ui.upQ = e.target.value; updateUpgradeCols(); }
    else if (c === 'deckq') { ui.deckQ = e.target.value; updateDeckList(); }
    else if (c === 'draft-text') ui.draft.text = e.target.value;
    else if (c === 'draft-name') ui.draft.name = e.target.value;
    else if (c === 'restore-text') ui.restoreText = e.target.value;
    else if (c === 'cmd-q') { ui.draft.cq = e.target.value; $('#cmdlist').innerHTML = cmdListHtml(ui.draft); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target, c = t.dataset && t.dataset.c; if (!c) return;
    if (c.indexOf('bd-') === 0 && window.CPABuilder) { window.CPABuilder.change(c, t); return; }
    var d;
    switch (c) {
      case 'fdeck': ui.fdeck = t.value; ui.limit = 150; render(); break;
      case 'fset': ui.fset = t.value; ui.limit = 150; render(); break;
      case 'sort': ui.sort = t.value; render(); break;
      case 'nobasic': ui.nobasic = t.checked; ui.limit = 150; render(); break;
      case 'active':
        d = getDeck(t.dataset.id);
        if (d) {
          d.active = t.checked; d.updatedAt = Date.now(); touch(d.id);
          toast(t.checked ? d.name + ' attivo: le sue ' + sum(d.cards) + ' carte risultano in uso.' : d.name + ' non attivo: le sue carte tornano libere.');
          render();
        } break;
      case 'deck-name': d = getDeck(); if (d && t.value.trim()) { d.name = t.value.trim(); d.updatedAt = Date.now(); touch(d.id); render(); } break;
      case 'deck-cmd': d = getDeck(); if (d) { d.commander = t.value || null; d.updatedAt = Date.now(); touch(d.id); render(); } break;
      case 'up-name':
        d = getDeck();
        var u = d && d.upgrades.filter(function (x) { return x.id === ui.upId; })[0];
        if (u && t.value.trim()) { u.name = t.value.trim(); touch(d.id); render(); } break;
      case 'cmd': ui.draft.commander = t.value || null; break;
      case 'draft-active': ui.draft.active = t.checked; break;
      case 'draft-file':
        if (t.files && t.files[0]) {
          var f = t.files[0];
          readFile(f, function (txt) { ui.draft.text = txt; if (!ui.draft.name) ui.draft.name = f.name.replace(/\.[^.]+$/, ''); render(); });
        } break;
      case 'restore-file':
        if (t.files && t.files[0]) readFile(t.files[0], function (txt) { ui.restoreText = txt; render(); }); break;
      case 'theme': state.settings.theme = t.value; applyTheme(); touchSettings(); break;
      case 'basics': state.settings.basicsUnlimited = t.checked; touchSettings(); break;
      case 'images': state.settings.images = t.checked; touchSettings(); render(); break;
    }
  });

  /* Funzioni che la schermata di stampa (builder.js) può usare. */
  window.CPAHost = {
    esc: esc, toast: toast, download: download, getDeck: getDeck, ui: ui, render: render,
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
      archCache = null; applyTheme(); render();
    }).catch(function () { store = makeMemoryStore(); render(); });
  }
  boot();
})();
