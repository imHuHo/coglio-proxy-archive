/* Coglio Proxy Archive - le funzioni community (nessun accesso al DOM).
 * Codighel ID: un nome utente unico tra amici, senza email né password. Il «codice di recupero» (100 bit) si genera
 * sul dispositivo; al server arriva solo per dimostrare chi sei, e lì ne resta solo l'impronta (vedi supabase/schema.sql).
 * Qui: controlli sugli ID, generazione e normalizzazione del codice, ricerca degli artwork su Scryfall e il client
 * delle funzioni del server (fetch iniettabile per poterlo provare). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPACommunity = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HANDLE_RE = /^[A-Za-z0-9_.-]{3,20}$/, ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', SECRET_LEN = 20;
  var ART_HOST = 'https://cards.scryfall.io/', ART_RE = /^https:\/\/cards\.scryfall\.io\/[A-Za-z0-9\/._-]+(\?[A-Za-z0-9=&._-]*)?$/;

  /* ----- ID ----- */
  function cleanHandle(h) { return String(h == null ? '' : h).trim().replace(/^@/, ''); }
  function validHandle(h) { return HANDLE_RE.test(String(h == null ? '' : h)); }
  /* Cosa dire a chi scrive un ID che non va (null se va bene). */
  function handleProblem(h) {
    h = String(h == null ? '' : h);
    if (h.length < 3) return 'Almeno 3 caratteri.';
    if (h.length > 20) return 'Al massimo 20 caratteri.';
    if (!HANDLE_RE.test(h)) return 'Solo lettere senza accento, numeri, punto, trattino e trattino basso.';
    return null;
  }

  /* ----- codice di recupero: 20 caratteri di un alfabeto senza I, L, O, U (si legge e si detta bene) ----- */
  function defaultBytes(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function newSecret(bytes) {
    var b = (bytes || defaultBytes)(SECRET_LEN), s = '';
    for (var i = 0; i < SECRET_LEN; i++) s += ALPHA.charAt(b[i] & 31);   /* 256 è multiplo di 32: nessuna distorsione */
    return s;
  }
  function formatSecret(s) { return String(s || '').replace(/(.{5})(?=.)/g, '$1-'); }
  /* Quel che si scrive a mano: maiuscole, niente trattini o spazi, O→0 e I/L→1 come nell'alfabeto Crockford. */
  function normSecret(t) { return String(t == null ? '' : t).toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, ''); }
  function validSecret(s) { return typeof s === 'string' && s.length === SECRET_LEN && s.split('').every(function (c) { return ALPHA.indexOf(c) >= 0; }); }

  /* ----- artwork da Scryfall ----- */
  /* Dall'oggetto carta di Scryfall all'artwork (art_crop, anche per le carte a due facce). */
  function artFromCard(c) {
    if (!c) return null;
    var im = c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) || null, url = im && im.art_crop;
    if (!url || !ART_RE.test(url)) return null;
    var face = c.card_faces && c.card_faces[0];
    return { name: String(c.name || (face && face.name) || '').slice(0, 160), artist: String((face && face.artist) || c.artist || ''), set: String(c.set || '').toUpperCase(), url: url };
  }
  /* Ogni artwork diverso della carta cercata (unique=art), dal più recente. */
  function artSearch(query, fetchFn) {
    var q = String(query || '').trim(); if (q.length < 2) return Promise.resolve([]);
    var url = 'https://api.scryfall.com/cards/search?unique=art&order=released&dir=desc&q=' + encodeURIComponent(q);
    return fetchFn(url).then(function (r) {
      if (r.status === 404) return { data: [] };
      if (!r.ok) throw fail('scryfall', 'Scryfall non risponde.');
      return r.json();
    }, function () { throw fail('offline', 'Niente rete.'); }).then(function (j) {
      return ((j && j.data) || []).map(artFromCard).filter(Boolean).slice(0, 24);
    });
  }

  /* ----- client delle funzioni del server ----- */
  var KNOWN = { bad_handle: 1, bad_secret: 1, bad_avatar: 1, bad_login: 1, handle_taken: 1, no_such_user: 1, self: 1, no_request: 1, too_many: 1, not_friend: 1, bad_data: 1, no_table: 1, not_owner: 1, is_owner: 1 };
  function fail(code, message) { var e = new Error(message || code); e.code = code; return e; }
  /* Messaggi per le persone, per codice d'errore. */
  var TEXT = {
    bad_handle: 'Questo ID non va: usa 3-20 caratteri tra lettere (senza accenti), numeri, punto, trattino e trattino basso.',
    bad_secret: 'Il codice di recupero non è valido.',
    bad_avatar: 'Questa immagine non si può usare.',
    bad_login: 'ID o codice di recupero sbagliati.',
    handle_taken: 'Questo ID è già preso.',
    no_such_user: 'Non esiste nessun Codighel ID così: controlla come è scritto.',
    self: 'Questo è il tuo ID!',
    no_request: 'Questa richiesta non c’è più.',
    too_many: 'Troppe richieste in attesa o troppi amici: sistema quelle che hai già.',
    not_friend: 'Al tavolo si siedono solo i tuoi amici: aggiungili prima dalla pagina Dati.',
    bad_data: 'Il tavolo o la partita non sono validi: controlla nomi, posti (da 2 a 6) e vita iniziale.',
    no_table: 'Questo tavolo non c’è più, o non ne fai più parte.',
    not_owner: 'Solo chi ha creato il tavolo può modificarlo o eliminarlo.',
    is_owner: 'Il tavolo è tuo: per toglierlo dalla lista eliminalo.',
    offline: 'Non riesco a raggiungere il server: controlla la connessione e riprova.',
    unconfigured: 'Le funzioni community non sono ancora attive.',
    server: 'Il server ha risposto in modo strano: riprova tra poco.',
    scryfall: 'Scryfall non risponde: riprova tra poco.'
  };
  function messageOf(e) { return TEXT[e && e.code] || TEXT.server; }

  function configured(cfg) { return !!(cfg && /^https:\/\/[^\s/]+/.test(String(cfg.url || '')) && String(cfg.key || '').length > 10); }
  function create(cfg, fetchFn) {
    var base = String((cfg && cfg.url) || '').replace(/\/+$/, ''), key = String((cfg && cfg.key) || '');
    /* Le chiavi nuove (sb_publishable_…) vanno solo in «apikey»: non sono JWT e come «Bearer» verrebbero rifiutate.
       La chiave «anon» storica, invece, e' un JWT (inizia per eyJ) e si manda anche come «Bearer». */
    function headers() { var h = { apikey: key, 'Content-Type': 'application/json' }; if (/^eyJ/.test(key)) h.Authorization = 'Bearer ' + key; return h; }
    function call(fn, body) {
      if (!configured(cfg)) return Promise.reject(fail('unconfigured'));
      return fetchFn(base + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
          if (r.ok) return j;
          var m = j && typeof j.message === 'string' ? j.message : '';
          throw fail(KNOWN[m] ? m : 'server', m);
        });
      }, function () { throw fail('offline'); });
    }
    function av(a) { return { p_name: a && a.name ? String(a.name) : '', p_url: a && a.url ? String(a.url) : '' }; }
    return {
      free: function (h) { return call('cpa_handle_free', { p_handle: h }); },
      profile: function (h) { return call('cpa_profile', { p_handle: h }); },
      register: function (h, secret, a) { var b = av(a); return call('cpa_register', { p_handle: h, p_secret: secret, p_name: b.p_name, p_url: b.p_url }); },
      login: function (h, secret) { return call('cpa_login', { p_handle: h, p_secret: secret }); },
      setAvatar: function (h, secret, a) { var b = av(a); return call('cpa_set_avatar', { p_handle: h, p_secret: secret, p_name: b.p_name, p_url: b.p_url }); },
      rename: function (h, secret, nh) { return call('cpa_rename', { p_handle: h, p_secret: secret, p_new: nh }); },
      remove: function (h, secret) { return call('cpa_delete', { p_handle: h, p_secret: secret }); },
      friends: function (h, secret) { return call('cpa_friend_list', { p_handle: h, p_secret: secret }).then(cleanFriends); },
      friendRequest: function (h, secret, to) { return call('cpa_friend_request', { p_handle: h, p_secret: secret, p_to: to }); },
      friendRespond: function (h, secret, from, accept) { return call('cpa_friend_respond', { p_handle: h, p_secret: secret, p_from: from, p_accept: !!accept }); },
      friendRemove: function (h, secret, other) { return call('cpa_friend_remove', { p_handle: h, p_secret: secret, p_other: other }); },
      /* tavoli condivisi e le loro partite */
      tables: function (h, secret) { return call('cpa_table_list', { p_handle: h, p_secret: secret }).then(function (a) { return Array.isArray(a) ? a.map(cleanTable).filter(Boolean) : []; }); },
      tableSave: function (h, secret, t) {
        return call('cpa_table_save', { p_handle: h, p_secret: secret, p_id: t.id || null, p_name: t.name, p_players: (t.players || []).map(seatOut), p_start: t.start, p_cmd_life: t.cmdLife !== false }).then(function (r) { var c = cleanTable(r); if (!c) throw fail('server'); return c; });
      },
      tableGames: function (h, secret, id) { return call('cpa_table_games', { p_handle: h, p_secret: secret, p_id: id }).then(function (a) { return Array.isArray(a) ? a.map(cleanGame).filter(Boolean) : []; }); },
      gameAdd: function (h, secret, table, rec) { return call('cpa_game_add', { p_handle: h, p_secret: secret, p_table: table, p_rec: rec }); },
      gameDelete: function (h, secret, table, gid) { return call('cpa_game_delete', { p_handle: h, p_secret: secret, p_table: table, p_game: gid }); },
      tableDelete: function (h, secret, id) { return call('cpa_table_delete', { p_handle: h, p_secret: secret, p_id: id }); },
      tableLeave: function (h, secret, id) { return call('cpa_table_leave', { p_handle: h, p_secret: secret, p_id: id }); },
      /* annunci dei mazzi agli amici */
      feedPost: function (h, secret, e) { return call('cpa_feed_post', { p_handle: h, p_secret: secret, p_deck: String(e.deck || ''), p_name: String(e.name || ''), p_cmd: String(e.cmd || ''), p_img: ART_RE.test(String(e.img || '')) ? String(e.img) : '', p_from: e.from, p_to: e.to }); },
      feedList: function (h, secret) { return call('cpa_feed_list', { p_handle: h, p_secret: secret }).then(cleanFeed); },
      feedDelete: function (h, secret, id) { return call('cpa_feed_delete', { p_handle: h, p_secret: secret, p_id: id }); }
    };
  }

  /* ----- amici ----- */
  var UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  function uid(v) { v = String(v == null ? '' : v).toLowerCase(); return UID_RE.test(v) ? v : ''; }
  function cleanPerson(p) {
    if (!p || !validHandle(p.handle)) return null;
    return { id: uid(p.id), handle: p.handle, avatar_name: String(p.avatar_name || '').slice(0, 160), avatar_url: ART_RE.test(String(p.avatar_url || '')) ? String(p.avatar_url) : '' };
  }
  function cleanFriends(r) {
    function list(a) { return Array.isArray(a) ? a.map(cleanPerson).filter(Boolean) : []; }
    r = r || {}; return { friends: list(r.friends), incoming: list(r.incoming), outgoing: list(r.outgoing) };
  }
  /* ----- tavoli condivisi ----- */
  function str(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
  function num(v, lo, hi, d) { v = parseInt(v, 10); return v === v ? Math.max(lo, Math.min(hi, v)) : d; }
  /* un posto verso il server: ospite (solo nome) o amico (solo id) */
  function seatOut(p) { var u = uid(p && p.u); return u ? { u: u } : { name: str(p && p.name, 24) }; }
  /* tavolo come arriva dal server -> forma usata dal Pescher */
  function cleanTable(t) {
    if (!t || !uid(t.id) || !Array.isArray(t.players) || t.players.length < 2) return null;
    return { id: uid(t.id), name: str(t.name, 30) || 'Tavolo', owner: str(t.owner, 20), mine: !!t.mine, start: num(t.start, 1, 999, 40), cmdLife: t.cmd_life !== false && t.cmdLife !== false,
      players: t.players.slice(0, 6).map(function (p) { p = p || {}; return { name: str(p.name, 24) || '?', u: uid(p.u), avatar: ART_RE.test(String(p.avatar_url || p.avatar || '')) ? String(p.avatar_url || p.avatar) : '' }; }) };
  }
  /* partita come arriva dal server -> record del Pescher (id = id della partita sul server) */
  function cleanGame(r) {
    if (!r || !uid(r.gid || r.id) || !Array.isArray(r.players) || r.players.length < 2) return null;
    return { id: uid(r.gid || r.id), t: Number(r.t) || 0, ms: Math.max(0, Number(r.ms) || 0), rounds: num(r.rounds, 1, 9999, 1), start: num(r.start, 1, 999, 40),
      players: r.players.slice(0, 6).map(function (p) { p = p || {}; return { name: str(p.name, 24) || '?', u: uid(p.u), life: num(p.life, -999, 9999, 0), out: !!p.out }; }),
      winner: str(r.winner, 24), wu: uid(r.wu), deck: str(r.deck, 60), table: '' };
  }
  /* i nomi di chi ha cambiato ID si aggiornano: nelle partite vecchie si usa il nome attuale del tavolo */
  function namesNow(game, table) {
    var by = {}; ((table && table.players) || []).forEach(function (p) { if (p.u) by[p.u] = p.name; });
    var g = JSON.parse(JSON.stringify(game)); g.table = table ? table.id : g.table;
    g.players.forEach(function (p) { if (p.u && by[p.u]) p.name = by[p.u]; });
    if (g.wu && by[g.wu]) g.winner = by[g.wu];
    return g;
  }
  /* copia locale (sul dispositivo) dei tavoli condivisi e delle loro partite, per vederli anche senza rete */
  function restoreShared(raw) {
    var o; try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!o || !validHandle(o.handle)) return null;
    var games = {}, gt = {};
    Object.keys(o.games && typeof o.games === 'object' ? o.games : {}).forEach(function (k) { if (uid(k) && Array.isArray(o.games[k])) { games[k] = o.games[k].slice(0, 200).map(cleanGame).filter(Boolean); gt[k] = Number(o.gt && o.gt[k]) || 0; } });
    return { acct: String(o.acct || '').slice(0, 40), handle: o.handle, t: Number(o.t) || 0, tables: (Array.isArray(o.tables) ? o.tables : []).slice(0, 40).map(cleanTable).filter(Boolean), games: games, gt: gt };
  }

  /* ----- Chat? Ma questa cosa è reale? (annunci dei mazzi) ----- */
  var STATES = { active: 'Attivo', unprinted: 'Da stampare', printed: 'Stampato ma non pronto', inactive: 'Smontato' };
  function cleanEvent(e) {
    if (!e || !uid(e.id) || !e.author || !validHandle(e.author.handle) || !STATES[e.from] || !STATES[e.to] || e.from === e.to) return null;
    return { id: uid(e.id), mine: !!e.mine, author: { id: uid(e.author.id), handle: e.author.handle, avatar_url: ART_RE.test(String(e.author.avatar_url || '')) ? String(e.author.avatar_url) : '' },
      deck: str(e.deck, 60), commander: str(e.commander, 80), image: ART_RE.test(String(e.image || '')) ? String(e.image) : '', from: e.from, to: e.to, t: Math.max(0, Number(e.t) || 0) };
  }
  function cleanFeed(a) { return (Array.isArray(a) ? a : []).slice(0, 60).map(cleanEvent).filter(Boolean); }
  /* Come si annuncia un cambio di stato: titolo urlato, frase, colore Magic della destinazione. */
  var TONE = { printed: 'u', active: 'g', inactive: 'b', unprinted: 'r' };
  function feedMessage(ev) {
    var who = ev.mine ? 'Hai' : '@' + ev.author.handle;
    var what = ev.commander ? 'il deck di ' + ev.commander : 'il mazzo «' + (ev.deck || 'senza nome') + '»';
    var k = ev.from + '>' + ev.to, shout, text;
    if (k === 'unprinted>printed') { shout = 'QUESTO È FREAKIN CRAAZY!'; text = ev.mine ? 'Hai stampato ' + what + '.' : who + ' ha stampato ' + what + '.'; }
    else if (k === 'unprinted>active') { shout = 'STAMPATO E GIÀ IN CAMPO!'; text = (ev.mine ? 'Hai stampato e montato subito ' : who + ' ha stampato e montato subito ') + what + '.'; }
    else if (k === 'printed>active') { shout = 'PRONTO AL COMBATTIMENTO!'; text = (ev.mine ? 'Hai messo in campo ' : who + ' ha messo in campo ') + what + ': è pronto, ora è attivo.'; }
    else if (k === 'inactive>active') { shout = 'RIMONTATO!'; text = (ev.mine ? 'Hai rimontato ' : who + ' ha rimontato ') + what + ': di nuovo in campo.'; }
    else if (ev.to === 'inactive') { shout = 'SMONTATO!'; text = (ev.mine ? 'Hai smontato ' : who + ' ha smontato ') + what + ': le carte tornano libere.'; }
    else if (ev.to === 'unprinted') { shout = 'TORNA IN FUCINA!'; text = (ev.mine ? 'Hai rimandato ' : who + ' ha rimandato ') + what + ' da stampare.'; }
    else if (k === 'active>printed') { shout = 'UN PASSO INDIETRO…'; text = (ev.mine ? 'Hai rimesso ' : who + ' ha rimesso ') + what + ' in attesa: stampato ma non pronto.'; }
    else { shout = 'DI NUOVO SUL TAVOLO!'; text = (ev.mine ? 'Hai rimesso insieme ' : who + ' ha rimesso insieme ') + what + ': stampato ma non pronto.'; }
    return { shout: shout, text: text, tone: TONE[ev.to] || 'w', big: k === 'unprinted>printed', label: STATES[ev.from] + ' → ' + STATES[ev.to] };
  }
  /* «5 min fa», «ieri»… */
  function ago(t, now) {
    var s = Math.max(0, Math.floor(((now == null ? Date.now() : now) - t) / 1000));
    if (s < 60) return 'adesso'; var m = Math.floor(s / 60); if (m < 60) return m + ' min fa';
    var h = Math.floor(m / 60); if (h < 24) return h + (h === 1 ? ' ora fa' : ' ore fa'); var d = Math.floor(h / 24);
    return d === 1 ? 'ieri' : d + ' giorni fa';
  }

  /* Il link che si manda agli amici: apre la versione web e lo riconosce dal #amico=ID. */
  var WEB_URL = 'https://imHuHo.github.io/coglio-proxy-archive/';
  function friendLink(handle, base) { return String(base || WEB_URL).replace(/#.*$/, '') + '#amico=' + encodeURIComponent(cleanHandle(handle)); }
  function parseFriendHash(hash) {
    var m = /^#?amico=([^&]*)/.exec(String(hash || '')); if (!m) return '';
    var h; try { h = decodeURIComponent(m[1]); } catch (e) { return ''; }
    h = cleanHandle(h); return validHandle(h) ? h : '';
  }

  /* ----- profilo salvato sul dispositivo ----- */
  function restoreLocal(raw) {
    var o; try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!o || !validHandle(o.handle) || !validSecret(o.secret)) return null;
    var a = o.avatar && typeof o.avatar === 'object' ? o.avatar : {};
    return { id: uid(o.id), handle: o.handle, secret: o.secret, avatar: { name: String(a.name || '').slice(0, 160), url: ART_RE.test(String(a.url || '')) ? String(a.url) : '' } };
  }

  return {
    HANDLE_RE: HANDLE_RE, SECRET_LEN: SECRET_LEN, ART_HOST: ART_HOST,
    cleanHandle: cleanHandle, validHandle: validHandle, handleProblem: handleProblem,
    newSecret: newSecret, formatSecret: formatSecret, normSecret: normSecret, validSecret: validSecret,
    cleanFriends: cleanFriends, cleanFeed: cleanFeed, cleanEvent: cleanEvent, feedMessage: feedMessage, ago: ago, STATES: STATES, cleanTable: cleanTable, cleanGame: cleanGame, namesNow: namesNow, restoreShared: restoreShared, uid: uid, friendLink: friendLink, parseFriendHash: parseFriendHash, WEB_URL: WEB_URL,
    artFromCard: artFromCard, artSearch: artSearch, configured: configured, create: create, messageOf: messageOf, TEXT: TEXT, restoreLocal: restoreLocal
  };
});
