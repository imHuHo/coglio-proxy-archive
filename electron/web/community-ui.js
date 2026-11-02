/* Coglio Proxy Archive - Codighel ID: il pannello in Dati (crea l'ID, scegli l'immagine, codice di recupero, entra da un altro dispositivo).
 * La logica e il client del server stanno in community.js; qui c'è solo l'interfaccia.
 * Ridisegna solo il proprio contenitore (#cm); i pop-up si attaccano al body come quelli del Pescher. */
(function () {
  'use strict';
  var H = window.CPAHost, C = window.CPACommunity;
  if (!H || !C) return;
  var esc = H.esc, KEY = 'cpa:community:v1';
  var me = null, loaded = false, cli = null, pop = null, refreshed = false, checkT = 0, checkN = 0;
  var ux = { handle: '', avatar: null, st: { k: '', t: '' }, busy: '', err: '', pop: '', arm: '', q: '', list: [], artBusy: false, artMsg: '', artFor: '', perr: '', lh: '', lc: '', first: false, add: '', inv: null, openInvite: false, pendingInvite: '' };
  var fr = { data: null, busy: false, err: '', msg: '', loaded: false };

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
      friendsHtml() +
      '<h3 class="cm-sub">Profilo</h3><div class="btns"><button type="button" class="btn small' + (ux.arm === 'logout' ? ' danger' : '') + '" data-a="cm-logout">' + (ux.arm === 'logout' ? 'Sicuro? Senza il codice non rientri' : 'Esci da questo dispositivo') + '</button>' +
      '<button type="button" class="btn small danger' + (ux.arm === 'del' ? ' armed' : '') + '" data-a="cm-del">' + (ux.arm === 'del' ? 'Sicuro? Sparisce per sempre' : 'Elimina il profilo') + '</button></div>';
  }
  function person(p, actions) {
    return '<li class="cm-fr">' + face(p.avatar_url ? { url: p.avatar_url } : null, p.handle) + '<div><b>@' + esc(p.handle) + '</b>' + (p.avatar_name ? '<small>' + esc(p.avatar_name) + '</small>' : '') + '</div><span class="cm-fa">' + actions + '</span></li>';
  }
  function friendsHtml() {
    var d = fr.data, h = function (a, label, cls, handle) { return '<button type="button" class="btn small' + (cls ? ' ' + cls : '') + '" data-a="' + a + '" data-h="' + esc(handle) + '">' + label + '</button>'; };
    var out = '<h3 class="cm-sub">Amici</h3>' +
      '<div class="btns"><button type="button" class="btn primary" data-a="cm-share">Condividi il mio link</button><button type="button" class="btn" data-a="cm-link">Copia il link</button></div>' +
      '<p class="hint">Chi apre il link vede il tuo ID e può chiederti l’amicizia: diventate amici solo se accetti. Oppure scrivi qui l’ID di un amico.</p>' +
      '<form class="cm-sf" data-a="cm-keep" onsubmit="return false"><input class="input" id="cm-add" data-c="cm-add" value="' + esc(ux.add) + '" maxlength="21" placeholder="ID di un amico" aria-label="ID di un amico" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="btn" data-a="cm-fadd">Aggiungi</button></form>' +
      (fr.err ? '<p class="err" role="alert">' + esc(fr.err) + '</p>' : fr.msg ? '<p class="hint cm-st ok" role="status">' + esc(fr.msg) + '</p>' : '');
    if (!d) return out + '<p class="hint">' + (fr.busy ? 'Carico gli amici…' : 'Non riesco a caricare gli amici.') + '</p>' + (fr.busy ? '' : '<div class="btns"><button type="button" class="btn small" data-a="cm-frefresh">Riprova</button></div>');
    if (d.incoming.length) out += '<h4 class="cm-sub2">Richieste ricevute</h4><ul class="cm-frs">' + d.incoming.map(function (p) { return person(p, h('cm-facc', 'Accetta', 'primary', p.handle) + h('cm-frej', 'Rifiuta', '', p.handle)); }).join('') + '</ul>';
    out += '<h4 class="cm-sub2">I tuoi amici' + (d.friends.length ? ' (' + d.friends.length + ')' : '') + '</h4>' +
      (d.friends.length ? '<ul class="cm-frs">' + d.friends.map(function (p) { var armed = ux.arm === 'rm:' + p.handle; return person(p, h('cm-frm', armed ? 'Sicuro?' : 'Togli', armed ? 'danger' : '', p.handle)); }).join('') + '</ul>' : '<p class="hint">Ancora nessun amico: manda il tuo link o aggiungi un ID.</p>');
    if (d.outgoing.length) out += '<h4 class="cm-sub2">Richieste inviate</h4><ul class="cm-frs">' + d.outgoing.map(function (p) { return person(p, '<span class="cm-wait">in attesa</span>' + h('cm-fcancel', 'Annulla', '', p.handle)); }).join('') + '</ul>';
    return out + '<div class="btns"><button type="button" class="btn small" data-a="cm-frefresh"' + (fr.busy ? ' disabled' : '') + '>' + (fr.busy ? 'Aggiorno…' : 'Aggiorna') + '</button></div>';
  }
  function inner() {
    var head = '<h2 class="sect" style="margin:0">Codighel ID</h2>';
    if (!on()) return head + '<p class="hint">Le funzioni community non sono ancora attive su questa copia dell’app.</p>';
    load(); return head + (me ? meHtml() : joinHtml());
  }
  function html() { return '<section class="panel cm" id="cm">' + inner() + '</section>'; }
  function repaint() {
    var el = document.getElementById('cm'); if (!el) return;
    var a = document.activeElement, id = a && a.id && el.contains(a) ? a.id : '', ss = id && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    el.innerHTML = inner();
    if (id) { var n = document.getElementById(id); if (n) { try { n.focus({ preventScroll: true }); if (ss) n.setSelectionRange(ss[0], ss[1]); } catch (e) { /* pazienza */ } } }
  }
  /* aprendo Dati si controlla (una volta) che il profilo esista ancora e si aggiorna l'immagine; si caricano gli amici; si apre l'invito se si arriva da un link */
  function loadFriends() {
    if (!on() || !load() || fr.busy) return; fr.busy = true; fr.loaded = true; repaint();
    client().friends(me.handle, me.secret).then(function (d) { fr.data = d; }, function (e) { if (e.code !== 'bad_login') fr.err = C.messageOf(e); })
      .then(function () { fr.busy = false; repaint(); });
  }
  function after() {
    if (ux.openInvite && on()) { ux.openInvite = false; openInvite(); }
    if (!on() || !load()) return;
    if (!refreshed) {
      refreshed = true;
      client().login(me.handle, me.secret).then(function (r) {
        me.handle = r.handle; me.avatar = { name: r.avatar_name || '', url: r.avatar_url || '' }; save(); ux.err = ''; repaint();
      }, function (e) { if (e.code === 'bad_login') { ux.err = 'Questo profilo non risulta più sul server (eliminato, o l’ID è stato cambiato da un altro dispositivo). Se hai il codice, esci e usa «Ho già un ID».'; repaint(); } });
    }
    if (!fr.loaded) loadFriends();
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
    if (ux.pop === 'invite') {
      var v = ux.inv || {}, hd = head('Invito', 'Amicizia su Codighel'), who = v.profile ? '<div class="cm-me">' + face(v.profile.avatar_url ? { url: v.profile.avatar_url } : null, v.profile.handle, true) + '<div><b class="cm-h">@' + esc(v.profile.handle) + '</b>' + (v.profile.avatar_name ? '<small>' + esc(v.profile.avatar_name) + '</small>' : '') + '</div></div>' : '';
      if (v.state === 'loading') return hd + '<p class="an-none">Cerco @' + esc(v.handle) + '…</p>';
      if (v.state === 'err') return hd + '<p class="err" role="alert">' + esc(v.msg) + '</p><div class="pe-popbar"><button type="button" class="btn" data-a="cm-iretry">Riprova</button></div>';
      if (v.state === 'none') return hd + '<p class="an-none">Non esiste nessun Codighel ID «' + esc(v.handle) + '»: il link è sbagliato o il profilo è stato eliminato.</p>';
      if (v.state === 'self') return hd + who + '<p class="hint">È il tuo stesso link: mandalo a un amico.</p>';
      if (v.state === 'sent') return hd + who + '<p class="cm-st ok" role="status">' + esc(v.msg) + '</p><div class="pe-popbar"><button type="button" class="btn primary" data-a="cm-close">Fatto</button></div>';
      if (!me) return hd + who + '<p>Per aggiungere <b>@' + esc(v.handle) + '</b> ti serve un Codighel ID: è gratis, senza email né password. Appena lo hai, gli mando la richiesta.</p>' +
        '<div class="pe-popbar"><button type="button" class="btn primary" data-a="cm-icreate">Crea il mio ID</button><button type="button" class="btn" data-a="cm-ilogin">Ho già un ID</button></div>';
      return hd + who + '<p>Vuoi aggiungere <b>@' + esc(v.profile.handle) + '</b> ai tuoi amici? Diventate amici quando accetta.</p>' + (v.err ? '<p class="err" role="alert">' + esc(v.err) + '</p>' : '') +
        '<div class="pe-popbar"><button type="button" class="btn primary" data-a="cm-iadd"' + (ux.busy === 'invite' ? ' disabled' : '') + '>' + (ux.busy === 'invite' ? 'Invio…' : 'Aggiungi agli amici') + '</button><button type="button" class="btn" data-a="cm-close">No, grazie</button></div>';
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
    pop.setAttribute('aria-label', { art: 'Scegli un artwork', code: 'Codice di recupero', login: 'Entra', rename: 'Cambia ID', invite: 'Invito di amicizia' }[kind] || 'Codighel ID');
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

  function copyText(text) {
    function fallback() { try { var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(t); t.select(); var okc = document.execCommand('copy'); t.remove(); return okc; } catch (e) { return false; } }
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); }); } catch (e) { /* si prova l'altra strada */ }
    return Promise.resolve(fallback());
  }
  function request(to) { return client().friendRequest(me.handle, me.secret, to); }
  function sentText(r, h) { return r === 'accepted' ? 'Ora tu e @' + h + ' siete amici.' : 'Richiesta inviata a @' + h + ': diventate amici quando accetta.'; }
  /* chi ha aperto un link e poi ha creato l'ID o è entrato: la richiesta parte da sola */
  function sendPending() {
    var h = ux.pendingInvite; ux.pendingInvite = ''; if (!h || !me || h.toLowerCase() === me.handle.toLowerCase()) return;
    request(h).then(function (r) { toast(sentText(r, h)); fr.loaded = false; if (document.getElementById('cm')) { fr.loaded = true; loadFriends(); } }, function (e) { toast(C.messageOf(e)); });
  }
  function openInvite() {
    var h = ux.inv && ux.inv.handle; if (!h) return;
    ux.inv = { handle: h, state: 'loading' }; openPop('invite');
    if (me && me.handle.toLowerCase() === h.toLowerCase()) { ux.inv.state = 'self'; ux.inv.profile = { handle: me.handle, avatar_name: me.avatar.name, avatar_url: me.avatar.url }; paintPop(); return; }
    client().profile(h).then(function (p) {
      if (!ux.inv || ux.inv.handle !== h) return;
      if (!p) ux.inv = { handle: h, state: 'none' }; else ux.inv = { handle: h, state: 'ready', profile: { handle: p.handle, avatar_name: p.avatar_name || '', avatar_url: C.cleanFriends({ friends: [p] }).friends[0] ? C.cleanFriends({ friends: [p] }).friends[0].avatar_url : '' } };
      if (ux.pop === 'invite') paintPop();
    }, function (e) { ux.inv = { handle: h, state: 'err', msg: C.messageOf(e) }; if (ux.pop === 'invite') paintPop(); });
  }
  function friendAct(promise, okMsg) {
    fr.err = ''; fr.msg = ''; ux.arm = '';
    promise.then(function (r) { fr.msg = typeof okMsg === 'function' ? okMsg(r) : okMsg; }, function (e) { fr.err = C.messageOf(e); }).then(function () { fr.busy = false; fr.loaded = false; loadFriends(); });
  }

  function click(a, el) {
    var i = parseInt(el.dataset.i, 10), fh = el.dataset.h;
    if (a !== 'cm-logout' && a !== 'cm-del' && a !== 'cm-frm' && ux.arm) { ux.arm = ''; repaint(); }
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
          me = { handle: r.handle, secret: secret, avatar: { name: r.avatar_name || '', url: r.avatar_url || '' } }; save(); ux.busy = ''; ux.handle = ''; ux.avatar = null; ux.st = { k: '', t: '' }; ux.first = true; refreshed = true; fr = { data: { friends: [], incoming: [], outgoing: [] }, busy: false, err: '', msg: '', loaded: true }; repaint(); openPop('code'); toast('Codighel ID creato: salva il codice di recupero.'); sendPending();
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
          me = { handle: r.handle, secret: lc, avatar: { name: r.avatar_name || '', url: r.avatar_url || '' } }; save(); ux.busy = ''; ux.err = ''; ux.lc = ''; refreshed = true; fr = { data: null, busy: false, err: '', msg: '', loaded: false }; closePop(); repaint(); toast('Bentornato, @' + r.handle + '.'); if (ux.pendingInvite) sendPending(); loadFriends();
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
        ux.arm = ''; me = null; save(); ux.err = ''; fr = { data: null, busy: false, err: '', msg: '', loaded: false }; repaint(); toast('Uscito da questo dispositivo. Il profilo resta sul server.'); break;
      case 'cm-del':
        if (ux.arm !== 'del') { ux.arm = 'del'; repaint(); break; }
        ux.arm = ''; client().remove(me.handle, me.secret).then(function () { me = null; save(); ux.err = ''; fr = { data: null, busy: false, err: '', msg: '', loaded: false }; repaint(); toast('Profilo eliminato.'); }, function (e) { ux.err = C.messageOf(e); repaint(); });
        break;
      case 'cm-share': {
        var link = C.friendLink(me.handle), text = 'Aggiungimi su Coglio Proxy Archive: il mio Codighel ID è @' + me.handle;
        if (navigator.share) { navigator.share({ title: 'Codighel ID', text: text, url: link }).catch(function (e) { if (e && e.name !== 'AbortError') copyText(link).then(function (okc) { toast(okc ? 'Link copiato.' : 'Non riesco a copiare il link.'); }); }); }
        else copyText(link).then(function (okc) { toast(okc ? 'Link copiato: incollalo dove vuoi.' : 'Non riesco a copiare il link.'); });
        break;
      }
      case 'cm-link': copyText(C.friendLink(me.handle)).then(function (okc) { toast(okc ? 'Link copiato.' : 'Non riesco a copiare il link.'); }); break;
      case 'cm-fadd': {
        var to = C.cleanHandle(ux.add), pr = C.handleProblem(to); fr.msg = ''; fr.err = '';
        if (pr) { fr.err = to ? pr : 'Scrivi l’ID di un amico.'; repaint(); break; }
        fr.busy = true; repaint();
        client().friendRequest(me.handle, me.secret, to).then(function (r) { ux.add = ''; fr.msg = sentText(r, to); }, function (e) { fr.err = C.messageOf(e); }).then(function () { fr.busy = false; fr.loaded = false; loadFriends(); });
        break;
      }
      case 'cm-facc': fr.busy = true; friendAct(client().friendRespond(me.handle, me.secret, fh, true), 'Ora tu e @' + fh + ' siete amici.'); break;
      case 'cm-frej': fr.busy = true; friendAct(client().friendRespond(me.handle, me.secret, fh, false), 'Richiesta di @' + fh + ' rifiutata.'); break;
      case 'cm-fcancel': fr.busy = true; friendAct(client().friendRemove(me.handle, me.secret, fh), 'Richiesta a @' + fh + ' annullata.'); break;
      case 'cm-frm':
        if (ux.arm !== 'rm:' + fh) { ux.arm = 'rm:' + fh; repaint(); break; }
        fr.busy = true; friendAct(client().friendRemove(me.handle, me.secret, fh), '@' + fh + ' non è più tra i tuoi amici.'); break;
      case 'cm-frefresh': fr.loaded = false; fr.err = ''; fr.msg = ''; loadFriends(); break;
      case 'cm-iadd': {
        if (ux.busy || !ux.inv || !me) break; var ih = ux.inv.profile.handle; ux.busy = 'invite'; ux.inv.err = ''; paintPop();
        request(ih).then(function (r) { ux.busy = ''; ux.inv.state = 'sent'; ux.inv.msg = sentText(r, ih); if (ux.pop === 'invite') paintPop(); fr.loaded = false; if (document.getElementById('cm')) loadFriends(); },
          function (e) { ux.busy = ''; ux.inv.err = C.messageOf(e); if (ux.pop === 'invite') paintPop(); });
        break;
      }
      case 'cm-iretry': openInvite(); break;
      case 'cm-icreate': ux.pendingInvite = ux.inv ? ux.inv.handle : ''; closePop(); { var hi = document.getElementById('cm-handle'); if (hi) { hi.scrollIntoView({ block: 'center' }); hi.focus(); } } break;
      case 'cm-ilogin': ux.pendingInvite = ux.inv ? ux.inv.handle : ''; ux.lh = ''; ux.lc = ''; openPop('login', 'cm-lh'); break;
      case 'cm-close': closePop(); break;
      case 'cm-keep': break;
    }
  }
  function input(c, t) {
    if (c === 'cm-handle') { ux.handle = t.value; checkHandle(); }
    else if (c === 'cm-q') ux.q = t.value;
    else if (c === 'cm-add') ux.add = t.value;
    else if (c === 'cm-lh' || c === 'cm-nh') ux.lh = t.value;
    else if (c === 'cm-lc') ux.lc = t.value;
  }
  function change() { /* niente caselle: tutto passa dai pulsanti */ }
  /* Invio nei campi dei pop-up e nel campo dell'ID */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target || !e.target.id) return;
    var map = { 'cm-q': 'cm-search', 'cm-lh': 'cm-login', 'cm-lc': 'cm-login', 'cm-nh': 'cm-rename', 'cm-handle': 'cm-create', 'cm-add': 'cm-fadd' };
    var a = map[e.target.id]; if (!a) return; e.preventDefault();
    var b = document.querySelector('[data-a="' + a + '"]'); if (b && !b.disabled) click(a, b);
  });
  function escape() { if (pop) { closePop(); return true; } return false; }
  function isOpen() { return !!pop; }

  /* si arriva da un link di amicizia (#amico=ID): si va in Dati e si apre l'invito */
  (function () {
    var h = ''; try { h = C.parseFriendHash(location.hash); } catch (e) { h = ''; }
    if (!h) return;
    ux.inv = { handle: h, state: 'loading' }; ux.openInvite = true;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* pazienza */ }
    var tries = 0, t = setInterval(function () {
      if (document.querySelector('.shell') || ++tries > 100) { clearInterval(t); if (document.querySelector('.shell')) { H.ui.view = 'data'; H.render(); } }
    }, 100);
  })();

  window.CPACommunityUI = { html: html, after: after, click: click, input: input, change: change, escape: escape, isOpen: isOpen, state: function () { return load(); } };
})();
