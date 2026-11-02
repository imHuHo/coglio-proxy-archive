/* Coglio Proxy Archive - Codighel ID: il pannello in Dati (crea l'ID, scegli l'immagine, codice di recupero, entra da un altro dispositivo).
 * La logica e il client del server stanno in community.js; qui c'è solo l'interfaccia.
 * Ridisegna solo il proprio contenitore (#cm); i pop-up si attaccano al body come quelli del Pescher. */
(function () {
  'use strict';
  var H = window.CPAHost, C = window.CPACommunity;
  if (!H || !C) return;
  var esc = H.esc, KEY = 'cpa:community:v1';
  var me = null, loaded = false, cli = null, pop = null, refreshed = false, checkT = 0, checkN = 0;
  var ux = { handle: '', avatar: null, st: { k: '', t: '' }, busy: '', err: '', pop: '', arm: '', q: '', list: [], artBusy: false, artMsg: '', artFor: '', perr: '', lh: '', lc: '', first: false };

  /* ---------- profilo sul dispositivo ---------- */
  function load() { if (!loaded) { loaded = true; try { me = C.restoreLocal(localStorage.getItem(KEY)); } catch (e) { me = null; } } return me; }
  function save() { try { if (me) localStorage.setItem(KEY, JSON.stringify(me)); else localStorage.removeItem(KEY); } catch (e) { /* resta in memoria finché la pagina è aperta */ } }
  function cfg() { return window.CPA_COMMUNITY || {}; }
  function client() { if (!cli) cli = C.create(cfg(), function (u, o) { return fetch(u, o); }); return cli; }
  function on() { return C.configured(cfg()); }
  function toast(m) { if (H.toast) H.toast(m); }

  /* ---------- pannello ---------- */
  function face(a, h, big) {
    var cl = 'cm-av' + (big ? ' big' : '');
    return a && a.url ? '<img class="' + cl + '" src="' + esc(a.url) + '" alt="" referrerpolicy="no-referrer" loading="lazy">' : '<span class="' + cl + ' ph" aria-hidden="true">' + esc(String(h || '?').charAt(0).toUpperCase()) + '</span>';
  }
  function joinHtml() {
    var a = ux.avatar, s = ux.st;
    return '<p class="sub">Il tuo nome utente tra amici: unico, senza email né password. L’app ti dà un codice di recupero da conservare, e basta quello per ritrovare il profilo su un altro dispositivo.</p>' +
      '<div class="cm-join"><button type="button" class="cm-pick" data-a="cm-art" aria-haspopup="dialog">' + face(a, ux.handle, true) + '<span><b>' + (a ? esc(a.name) : 'Scegli un’immagine') + '</b><small>' + (a ? 'Cambia artwork' : 'Un artwork di una carta, da Scryfall (se vuoi)') + '</small></span></button>' +
      '<label class="lbl cm-hl">Il tuo ID<input class="input" id="cm-handle" data-c="cm-handle" value="' + esc(ux.handle) + '" maxlength="20" placeholder="es. Kaalia99" autocomplete="off" autocapitalize="off" spellcheck="false"></label></div>' +
      '<p class="hint cm-st ' + esc(s.k) + '" id="cm-st" role="status" aria-live="polite">' + esc(s.t || 'Da 3 a 20 caratteri: lettere (senza accenti), numeri, punto, trattino e trattino basso. Maiuscole e minuscole non contano.') + '</p>' +
      (ux.err ? '<p class="err" role="alert">' + esc(ux.err) + '</p>' : '') +
      '<div class="btns"><button type="button" class="btn primary" data-a="cm-create"' + (ux.busy ? ' disabled' : '') + '>' + (ux.busy === 'create' ? 'Creo…' : 'Crea il mio Codighel ID') + '</button><button type="button" class="btn" data-a="cm-login-open" aria-haspopup="dialog">Ho già un ID</button></div>';
  }
  function meHtml() {
    var a = me.avatar && me.avatar.url ? me.avatar : null;
    return '<div class="cm-me">' + face(a, me.handle, true) + '<div><b class="cm-h">@' + esc(me.handle) + '</b><small>' + (a ? esc(a.name) : 'Nessuna immagine') + '</small></div></div>' +
      (ux.err ? '<p class="err" role="alert">' + esc(ux.err) + '</p>' : '') +
      '<div class="btns"><button type="button" class="btn" data-a="cm-art" aria-haspopup="dialog">Cambia immagine</button><button type="button" class="btn" data-a="cm-code" aria-haspopup="dialog">Codice di recupero</button><button type="button" class="btn" data-a="cm-rename-open" aria-haspopup="dialog">Cambia ID</button></div>' +
      '<p class="hint">Per entrare da un altro dispositivo servono l’ID e il codice di recupero. Il profilo non fa parte del backup: il codice sta solo qui e nel file che hai salvato.</p>' +
      '<div class="btns"><button type="button" class="btn small' + (ux.arm === 'logout' ? ' danger' : '') + '" data-a="cm-logout">' + (ux.arm === 'logout' ? 'Sicuro? Senza il codice non rientri' : 'Esci da questo dispositivo') + '</button>' +
      '<button type="button" class="btn small danger' + (ux.arm === 'del' ? ' armed' : '') + '" data-a="cm-del">' + (ux.arm === 'del' ? 'Sicuro? Sparisce per sempre' : 'Elimina il profilo') + '</button></div>';
  }
  function inner() {
    var head = '<h2 class="sect" style="margin:0">Codighel ID</h2>';
    if (!on()) return head + '<p class="hint">Le funzioni community non sono ancora attive su questa copia dell’app.</p>';
    load(); return head + (me ? meHtml() : joinHtml());
  }
  function html() { return '<section class="panel cm" id="cm">' + inner() + '</section>'; }
  function repaint() { var el = document.getElementById('cm'); if (el) el.innerHTML = inner(); }
  /* aprendo Dati si controlla (una volta) che il profilo esista ancora e si aggiorna l'immagine */
  function after() {
    if (refreshed || !on() || !load()) return; refreshed = true;
    client().login(me.handle, me.secret).then(function (r) {
      me.handle = r.handle; me.avatar = { name: r.avatar_name || '', url: r.avatar_url || '' }; save(); ux.err = ''; repaint();
    }, function (e) { if (e.code === 'bad_login') { ux.err = 'Questo profilo non risulta più sul server (eliminato, o l’ID è stato cambiato da un altro dispositivo). Se hai il codice, esci e usa «Ho già un ID».'; repaint(); } });
  }

  /* ---------- pop-up ---------- */
  function head(small, title) { return '<div class="an-head"><div><small>' + small + '</small><strong>' + title + '</strong></div><button type="button" class="btn small" data-a="cm-close" id="cmx">Chiudi</button></div>'; }
  function closePop() { if (pop) { pop.remove(); pop = null; } ux.pop = ''; ux.perr = ''; ux.lc = ''; }
  function popBody() {
    if (ux.pop === 'art') {
      var cur = ux.artFor === 'me' ? me && me.avatar : ux.avatar, grid = '';
      if (ux.artBusy) grid = '<p class="an-none">Cerco gli artwork…</p>';
      else if (ux.list.length) grid = '<div class="cm-grid">' + ux.list.map(function (a, i) { return '<button type="button" class="cm-art" data-a="cm-pick-art" data-i="' + i + '"><img src="' + esc(a.url) + '" alt="" referrerpolicy="no-referrer" loading="lazy"><span>' + esc(a.name) + '</span><small>' + esc(a.set) + (a.artist ? ' · ' + esc(a.artist) : '') + '</small></button>'; }).join('') + '</div>';
      else grid = '<p class="an-none">' + esc(ux.artMsg || 'Scrivi il nome di una carta: vedrai tutti i suoi artwork, uno per ogni illustrazione diversa.') + '</p>';
      return head('Immagine del profilo', 'Scegli un artwork') +
        '<form class="cm-sf" data-a="cm-keep" onsubmit="return false"><input class="input" id="cm-q" data-c="cm-q" type="search" value="' + esc(ux.q) + '" placeholder="Es. Kaalia, Sol Ring, Atraxa…" aria-label="Nome della carta" autocomplete="off"><button type="button" class="btn primary" data-a="cm-search"' + (ux.artBusy ? ' disabled' : '') + '>Cerca</button></form>' + grid +
        (cur && cur.url ? '<div class="pe-popbar"><button type="button" class="btn small" data-a="cm-noart">Togli l’immagine</button></div>' : '') +
        '<p class="hint">Le immagini arrivano da Scryfall e sono di proprietà dei rispettivi artisti.</p>';
    }
    if (ux.pop === 'code') {
      return head(ux.first ? 'Profilo creato' : 'Da conservare', 'Il tuo codice di recupero') +
        '<p class="cm-warn">Serve a entrare da un altro dispositivo o dopo aver cancellato i dati del browser. <b>Non c’è modo di recuperarlo se lo perdi</b>: copialo o scaricalo adesso e tienilo al sicuro. Non darlo a nessuno: chi lo ha può usare il tuo profilo.</p>' +
        '<output class="cm-code" id="cm-code" aria-label="Codice di recupero">' + esc(C.formatSecret(me.secret)) + '</output>' +
        '<div class="pe-popbar"><button type="button" class="btn primary" data-a="cm-copy">Copia</button><button type="button" class="btn" data-a="cm-dl">Scarica come file</button></div>' +
        '<p class="hint">Il tuo ID è <b>@' + esc(me.handle) + '</b>. Per entrare altrove servono tutti e due.</p>';
    }
    if (ux.pop === 'login') {
      return head('Ho già un ID', 'Entra con il codice') +
        '<form class="cm-lf" data-a="cm-keep" onsubmit="return false"><label class="lbl">ID<input class="input" id="cm-lh" data-c="cm-lh" value="' + esc(ux.lh) + '" maxlength="21" placeholder="Il tuo ID" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
        '<label class="lbl">Codice di recupero<input class="input mono" id="cm-lc" data-c="cm-lc" maxlength="30" value="' + esc(ux.lc) + '" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"></label></form>' +
        (ux.perr ? '<p class="err" role="alert">' + esc(ux.perr) + '</p>' : '') +
        '<div class="pe-popbar"><button type="button" class="btn primary" data-a="cm-login"' + (ux.busy === 'login' ? ' disabled' : '') + '>' + (ux.busy === 'login' ? 'Entro…' : 'Entra') + '</button></div>' +
        '<p class="hint">Va bene scrivere il codice come capita: maiuscole, trattini e spazi non contano.</p>';
    }
    if (ux.pop === 'rename') {
      return head('Il tuo ID', 'Cambia ID') +
        '<form class="cm-lf" data-a="cm-keep" onsubmit="return false"><label class="lbl">Nuovo ID<input class="input" id="cm-nh" data-c="cm-nh" value="' + esc(ux.lh) + '" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false"></label></form>' +
        (ux.perr ? '<p class="err" role="alert">' + esc(ux.perr) + '</p>' : '') +
        '<div class="pe-popbar"><button type="button" class="btn primary" data-a="cm-rename"' + (ux.busy === 'rename' ? ' disabled' : '') + '>' + (ux.busy === 'rename' ? 'Cambio…' : 'Cambia') + '</button></div>' +
        '<p class="hint">Il codice di recupero resta lo stesso. Chi ti ha già come amico ti ritroverà con il nuovo ID.</p>';
    }
    return '';
  }
  function paintPop(focusId) {
    if (!pop) return;
    pop.innerHTML = '<div class="an-box pe-box cm-box" data-a="cm-keep">' + popBody() + '</div>';
    var x = (focusId && pop.querySelector('#' + focusId)) || pop.querySelector('#cmx'); if (x) { x.focus(); if (x.select && focusId) x.select(); }
  }
  function openPop(kind, focusId) {
    ux.pop = kind; ux.perr = '';
    if (!pop) {
      pop = document.createElement('div'); pop.id = 'cm-pop'; pop.className = 'lb bk an pe-pop cm-pop'; pop.setAttribute('data-a', 'cm-close'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); document.body.appendChild(pop);
    }
    pop.setAttribute('aria-label', { art: 'Scegli un artwork', code: 'Codice di recupero', login: 'Entra', rename: 'Cambia ID' }[kind] || 'Codighel ID');
    paintPop(focusId);
  }

  /* ---------- azioni ---------- */
  function setStatus(k, t) { ux.st = { k: k, t: t }; var el = document.getElementById('cm-st'); if (el) { el.className = 'hint cm-st ' + k; el.textContent = t; } }
  function checkHandle() {
    var h = ux.handle, p = h ? C.handleProblem(h) : null, n = ++checkN; clearTimeout(checkT);
    if (!h) { setStatus('', ''); return; }
    if (p) { setStatus('bad', p); return; }
    setStatus('wait', 'Controllo se è libero…');
    checkT = setTimeout(function () {
      client().free(h).then(function (free) { if (n === checkN) setStatus(free ? 'ok' : 'bad', free ? '«' + h + '» è libero.' : '«' + h + '» è già preso.'); }, function (e) { if (n === checkN) setStatus('', C.messageOf(e)); });
    }, 350);
  }
  function grab() {
    if (!pop) return;
    var q = pop.querySelector('#cm-q'); if (q) ux.q = q.value;
    var lh = pop.querySelector('#cm-lh') || pop.querySelector('#cm-nh'); if (lh) ux.lh = lh.value;
    var lc = pop.querySelector('#cm-lc'); if (lc) ux.lc = lc.value;
  }
  function download(name, text) {
    try {
      var b = new Blob([text], { type: 'text/plain;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (e) { toast('Non riesco a scaricare il file: copia il codice.'); }
  }
  function copy(text) {
    function fallback() { var r = document.createRange(), el = document.getElementById('cm-code'); if (!el) return false; r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); try { return document.execCommand('copy'); } catch (e) { return false; } }
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); }); } catch (e) { /* si prova l'altra strada */ }
    return Promise.resolve(fallback());
  }

  function click(a, el) {
    var i = parseInt(el.dataset.i, 10);
    if (a !== 'cm-logout' && a !== 'cm-del' && ux.arm) { ux.arm = ''; repaint(); }
    switch (a) {
      case 'cm-art': ux.artFor = me ? 'me' : 'new'; ux.list = []; ux.artMsg = ''; openPop('art', 'cm-q'); break;
      case 'cm-search': {
        grab(); var q = ux.q.trim(); if (q.length < 2) { ux.artMsg = 'Scrivi almeno due lettere.'; ux.list = []; paintPop('cm-q'); break; }
        ux.artBusy = true; ux.list = []; paintPop('cm-q');
        C.artSearch(q, function (u) { return fetch(u); }).then(function (l) { ux.list = l; ux.artMsg = l.length ? '' : 'Nessun artwork per «' + q + '». Prova con il nome in inglese.'; }, function (e) { ux.artMsg = C.messageOf(e); })
          .then(function () { ux.artBusy = false; if (ux.pop === 'art') paintPop('cm-q'); });
        break;
      }
      case 'cm-pick-art': case 'cm-noart': {
        var pick = a === 'cm-pick-art' ? ux.list[i] : null; if (a === 'cm-pick-art' && !pick) break;
        var av = pick ? { name: pick.name, url: pick.url } : { name: '', url: '' };
        if (ux.artFor !== 'me') { ux.avatar = pick ? av : null; closePop(); repaint(); break; }
        client().setAvatar(me.handle, me.secret, av).then(function (r) { me.avatar = { name: r.avatar_name || '', url: r.avatar_url || '' }; save(); ux.err = ''; closePop(); repaint(); toast(pick ? 'Immagine cambiata.' : 'Immagine tolta.'); },
          function (e) { ux.artMsg = C.messageOf(e); if (ux.pop === 'art') paintPop(); });
        break;
      }
      case 'cm-create': {
        if (ux.busy) break; var h = C.cleanHandle(ux.handle), p = C.handleProblem(h); ux.err = '';
        if (p) { setStatus('bad', p); var inp = document.getElementById('cm-handle'); if (inp) inp.focus(); break; }
        var secret = C.newSecret(); ux.busy = 'create'; repaint();
        client().register(h, secret, ux.avatar).then(function (r) {
          me = { handle: r.handle, secret: secret, avatar: { name: r.avatar_name || '', url: r.avatar_url || '' } }; save(); ux.busy = ''; ux.handle = ''; ux.avatar = null; ux.st = { k: '', t: '' }; ux.first = true; refreshed = true; repaint(); openPop('code'); toast('Codighel ID creato: salva il codice di recupero.');
        }, function (e) { ux.busy = ''; if (e.code === 'handle_taken') { ux.st = { k: 'bad', t: '«' + h + '» è già preso.' }; } else ux.err = C.messageOf(e); repaint(); });
        break;
      }
      case 'cm-code': ux.first = false; openPop('code', 'cmx'); break;
      case 'cm-copy': copy(C.formatSecret(me.secret)).then(function (okc) { toast(okc ? 'Codice copiato.' : 'Non riesco a copiare: selezionalo e copialo a mano.'); }); break;
      case 'cm-dl': download('codighel-id-' + me.handle + '.txt', 'Codighel ID (Coglio Proxy Archive)\r\nID: ' + me.handle + '\r\nCodice di recupero: ' + C.formatSecret(me.secret) + '\r\n\r\nPer entrare da un altro dispositivo: Dati > Codighel ID > «Ho già un ID». Non darlo a nessuno.\r\n'); break;
      case 'cm-login-open': ux.lh = ''; ux.lc = ''; openPop('login', 'cm-lh'); break;
      case 'cm-login': {
        if (ux.busy) break; grab(); var lh = C.cleanHandle(ux.lh), lc = C.normSecret(ux.lc);
        if (!C.validHandle(lh) || !C.validSecret(lc)) { ux.perr = C.validHandle(lh) ? 'Il codice è di 20 caratteri (cifre e lettere, senza I, L, O, U).' : 'Scrivi il tuo ID.'; paintPop(C.validHandle(lh) ? 'cm-lc' : 'cm-lh'); break; }
        ux.busy = 'login'; ux.perr = ''; paintPop();
        client().login(lh, lc).then(function (r) {
          me = { handle: r.handle, secret: lc, avatar: { name: r.avatar_name || '', url: r.avatar_url || '' } }; save(); ux.busy = ''; ux.err = ''; ux.lc = ''; refreshed = true; closePop(); repaint(); toast('Bentornato, @' + r.handle + '.');
        }, function (e) { ux.busy = ''; ux.perr = C.messageOf(e); paintPop('cm-lc'); });
        break;
      }
      case 'cm-rename-open': ux.lh = me ? me.handle : ''; openPop('rename', 'cm-nh'); break;
      case 'cm-rename': {
        if (ux.busy) break; grab(); var nh = C.cleanHandle(ux.lh), pr = C.handleProblem(nh);
        if (pr) { ux.perr = pr; paintPop('cm-nh'); break; }
        ux.busy = 'rename'; ux.perr = ''; paintPop();
        client().rename(me.handle, me.secret, nh).then(function (r) { me.handle = r.handle; save(); ux.busy = ''; closePop(); repaint(); toast('Ora sei @' + r.handle + '.'); },
          function (e) { ux.busy = ''; ux.perr = C.messageOf(e); paintPop('cm-nh'); });
        break;
      }
      case 'cm-logout':
        if (ux.arm !== 'logout') { ux.arm = 'logout'; repaint(); break; }
        ux.arm = ''; me = null; save(); ux.err = ''; repaint(); toast('Uscito da questo dispositivo. Il profilo resta sul server.'); break;
      case 'cm-del':
        if (ux.arm !== 'del') { ux.arm = 'del'; repaint(); break; }
        ux.arm = ''; client().remove(me.handle, me.secret).then(function () { me = null; save(); ux.err = ''; repaint(); toast('Profilo eliminato.'); }, function (e) { ux.err = C.messageOf(e); repaint(); });
        break;
      case 'cm-close': closePop(); break;
      case 'cm-keep': break;
    }
  }
  function input(c, t) {
    if (c === 'cm-handle') { ux.handle = t.value; checkHandle(); }
    else if (c === 'cm-q') ux.q = t.value;
    else if (c === 'cm-lh' || c === 'cm-nh') ux.lh = t.value;
    else if (c === 'cm-lc') ux.lc = t.value;
  }
  function change() { /* niente caselle: tutto passa dai pulsanti */ }
  /* Invio nei campi dei pop-up e nel campo dell'ID */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target || !e.target.id) return;
    var map = { 'cm-q': 'cm-search', 'cm-lh': 'cm-login', 'cm-lc': 'cm-login', 'cm-nh': 'cm-rename', 'cm-handle': 'cm-create' };
    var a = map[e.target.id]; if (!a) return; e.preventDefault();
    var b = document.querySelector('[data-a="' + a + '"]'); if (b && !b.disabled) click(a, b);
  });
  function escape() { if (pop) { closePop(); return true; } return false; }
  function isOpen() { return !!pop; }

  window.CPACommunityUI = { html: html, after: after, click: click, input: input, change: change, escape: escape, isOpen: isOpen, state: function () { return load(); } };
})();
