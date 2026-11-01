/* Coglio Proxy Archive - sincronizzazione tra dispositivi con Dropbox o Google Drive.
 * Si sincronizzano mazzi, upgrade, stati, bracket, stampe scelte e due impostazioni (terre base, immagini). Non i design del Designer.
 * Un solo file, «coglio-sync.json», nella cartella riservata all'app (Dropbox: Applicazioni/<nome app>; Drive: cartella dati nascosta dell'app).
 *
 * Il file resta leggibile e piccolo. L'unione e' a tre vie: ogni dispositivo ricorda quali mazzi c'erano all'ultima sincronizzazione,
 * cosi' sa distinguere «nuovo qui» da «cancellato altrove». Le cancellazioni viaggiano come lapidi (id -> istante) per 90 giorni.
 * Rete, orologio e magazzino sono iniettabili, quindi si prova in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPASync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FILE = 'coglio-sync.json', DAY = 864e5, TOMB_TTL = 90 * DAY;
  var GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

  /* ----- utilita' ----- */
  function utf8(s) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s);
    var e = unescape(encodeURIComponent(s)), u = new Uint8Array(e.length);
    for (var i = 0; i < e.length; i++) u[i] = e.charCodeAt(i);
    return u;
  }
  /* SHA-256 in JavaScript puro: serve per il PKCE di Dropbox e funziona anche dove crypto.subtle non c'e' (pagine file://). */
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(data) {
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = data.length, total = ((len + 9 + 63) >> 6) << 6, buf = new Uint8Array(total), i, j;
    buf.set(data); buf[len] = 0x80;
    var bits = len * 8, hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
    buf[total - 8] = hi >>> 24; buf[total - 7] = hi >>> 16; buf[total - 6] = hi >>> 8; buf[total - 5] = hi;
    buf[total - 4] = lo >>> 24; buf[total - 3] = lo >>> 16; buf[total - 2] = lo >>> 8; buf[total - 1] = lo;
    var w = new Array(64);
    function rr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (i = 0; i < total; i += 64) {
      for (j = 0; j < 16; j++) w[j] = (buf[i + j * 4] << 24) | (buf[i + j * 4 + 1] << 16) | (buf[i + j * 4 + 2] << 8) | buf[i + j * 4 + 3];
      for (j = 16; j < 64; j++) {
        var s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3), s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (j = 0; j < 64; j++) {
        var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K256[j] + w[j]) | 0;
        var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) { out[i * 4] = h[i] >>> 24; out[i * 4 + 1] = h[i] >>> 16; out[i * 4 + 2] = h[i] >>> 8; out[i * 4 + 3] = h[i]; }
    return out;
  }
  function b64url(u8) {
    var s = '', i, A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (i = 0; i + 2 < u8.length; i += 3) { var n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2]; s += A[n >> 18] + A[(n >> 12) & 63] + A[(n >> 6) & 63] + A[n & 63]; }
    if (u8.length - i === 1) { var n1 = u8[i] << 16; s += A[n1 >> 18] + A[(n1 >> 12) & 63]; }
    else if (u8.length - i === 2) { var n2 = (u8[i] << 16) | (u8[i + 1] << 8); s += A[n2 >> 18] + A[(n2 >> 12) & 63] + A[(n2 >> 6) & 63]; }
    return s;
  }
  function randomString(n, rnd) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~', out = '', bytes = new Uint8Array(n), i;
    if (rnd) rnd(bytes);
    else if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (i = 0; i < n; i++) out += A[bytes[i] % A.length];
    return out;
  }
  function form(o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  /* JSON con le chiavi in ordine: due copie uguali danno lo stesso testo */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function fail(code, msg, extra) { var e = new Error(msg); e.code = code; if (extra) for (var k in extra) e[k] = extra[k]; return e; }

  /* ----- impostazioni e mazzi ----- */
  function settingsPart(s) { s = s || {}; return { basicsUnlimited: s.basicsUnlimited !== false, images: s.images !== false }; }
  function hashSettings(s) { return canon(settingsPart(s)); }
  function deckSig(d) { var c = {}; Object.keys(d).forEach(function (k) { if (k !== 'updatedAt') c[k] = d[k]; }); return canon(c); }

  /* ----- unione a tre vie -----
   * o = { decks, settings, remote: {decks,tombs,settings,settingsAt}|null, state: {lastIds, tombs, setHash, settingsAt}, now } */
  function merge(o) {
    var now = o.now, st = o.state || {}, remote = o.remote || { decks: [], tombs: {}, settings: null, settingsAt: 0 };
    var tombs = {}, id;
    Object.keys(remote.tombs || {}).forEach(function (k) { tombs[k] = remote.tombs[k]; });
    Object.keys(st.tombs || {}).forEach(function (k) { tombs[k] = Math.max(tombs[k] || 0, st.tombs[k]); });
    var L = {}, R = {};
    o.decks.forEach(function (d) { L[d.id] = d; });
    (remote.decks || []).forEach(function (d) { if (d && d.id) R[d.id] = d; });
    /* cancellato qui da quando ci siamo sincronizzati l'ultima volta */
    (st.lastIds || []).forEach(function (k) { if (!L[k] && !tombs[k]) tombs[k] = now; });
    var ids = {}; Object.keys(L).concat(Object.keys(R)).forEach(function (k) { ids[k] = 1; });
    var out = [], rep = { added: [], updated: [], removed: [] };
    Object.keys(ids).forEach(function (k) {
      var l = L[k], r = R[k], t = tombs[k] || 0;
      if (l && r) {
        var win = (r.updatedAt || 0) > (l.updatedAt || 0) ? r : l;
        if (t && t > (win.updatedAt || 0)) { rep.removed.push(k); return; }
        delete tombs[k];
        if (win === r && deckSig(r) !== deckSig(l)) rep.updated.push(k);
        out.push(win); return;
      }
      if (l) {
        if (t && t >= (l.updatedAt || 0) && (st.lastIds || []).indexOf(k) >= 0) { rep.removed.push(k); return; }  /* cancellato altrove */
        delete tombs[k]; out.push(l); return;
      }
      /* solo sull'altro dispositivo */
      if (t && t >= (r.updatedAt || 0)) return;                                                                 /* l'ho cancellato io */
      delete tombs[k]; rep.added.push(k); out.push(r);
    });
    Object.keys(tombs).forEach(function (k) { if (now - tombs[k] > TOMB_TTL) delete tombs[k]; });
    out.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1); });

    /* impostazioni: se le ho cambiate qui dopo l'ultima volta vincono le mie; altrimenti quelle piu' recenti (al primo collegamento, quelle gia' nel file) */
    var mine = settingsPart(o.settings), mineHash = hashSettings(mine), base = st.setHash;
    var localEdited = base != null && mineHash !== base, takeRemote = false;
    var settings = mine, settingsAt;
    if (!o.remote || !remote.settings) settingsAt = base != null && !localEdited && st.settingsAt ? st.settingsAt : now;
    else if (localEdited) settingsAt = now;
    else if (base == null || (remote.settingsAt || 0) > (st.settingsAt || 0)) { takeRemote = true; settings = settingsPart(remote.settings); settingsAt = remote.settingsAt || now; }
    else settingsAt = st.settingsAt || now;
    var settingsFromRemote = takeRemote && hashSettings(settings) !== mineHash;

    var snap = { app: 'coglio-proxy-archive', v: 1, decks: out, tombs: tombs, settings: settings, settingsAt: settingsAt };
    var remoteSame = !!o.remote && canon({ decks: (remote.decks || []).slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1); }), tombs: remote.tombs || {}, settings: settingsPart(remote.settings), settingsAt: remote.settingsAt || 0 }) ===
      canon({ decks: out, tombs: tombs, settings: settings, settingsAt: settingsAt });
    return {
      decks: out, settings: settings, settingsAt: settingsAt, tombs: tombs, snapshot: snap,
      lastIds: out.map(function (d) { return d.id; }), setHash: hashSettings(settings),
      added: rep.added, updated: rep.updated, removed: rep.removed, settingsFromRemote: settingsFromRemote,
      localChanged: rep.added.length + rep.updated.length + rep.removed.length > 0 || settingsFromRemote,
      remoteChanged: !remoteSame
    };
  }

  /* ----- servizi ----- */
  function create(env) {
    env = env || {};
    var http = env.http, now = env.now || function () { return Date.now(); }, cfg = env.config || {};
    var store = env.store || (function () { var s = {}; return { get: function () { return s; }, set: function (v) { s = v; } }; })();
    var self = {};

    function st() { return store.get() || {}; }
    function save(patch) { var s = st(); Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete s[k]; else s[k] = patch[k]; }); store.set(s); return s; }
    function keys() { var s = st().keys || {}; return { dropbox: cfg.dropboxKey || s.dropbox || '', googleId: cfg.googleId || s.googleId || '', googleSecret: cfg.googleSecret || s.googleSecret || '' }; }
    self.state = st;
    self.keys = keys;
    self.setKeys = function (k) { var cur = st().keys || {}; save({ keys: { dropbox: k.dropbox != null ? String(k.dropbox).trim() : cur.dropbox, googleId: k.googleId != null ? String(k.googleId).trim() : cur.googleId, googleSecret: k.googleSecret != null ? String(k.googleSecret).trim() : cur.googleSecret } }); };
    self.configured = function (p) { var k = keys(); return p === 'dropbox' ? !!k.dropbox : p === 'google' ? !!(k.googleId && k.googleSecret) : false; };
    self.linked = function () { return st().provider || ''; };

    function call(req) {
      return Promise.resolve().then(function () { return http(req); }).catch(function (e) { throw fail('net', 'Rete non raggiungibile', { cause: e }); });
    }
    function json(r) { try { return JSON.parse(r.text); } catch (e) { return null; } }
    function tokensFrom(j, prev) {
      return { access: j.access_token, refresh: j.refresh_token || (prev && prev.refresh) || '', exp: now() + Math.max(60, (j.expires_in || 3600)) * 1000 };
    }

    /* ----- Dropbox: PKCE senza indirizzo di ritorno, il codice si incolla ----- */
    self.dropboxStart = function () {
      var k = keys().dropbox; if (!k) throw fail('config', 'Manca la chiave dell\'app Dropbox');
      var verifier = randomString(64, env.random), challenge = b64url(sha256(utf8(verifier)));
      save({ pending: { provider: 'dropbox', verifier: verifier, at: now() } });
      return { url: 'https://www.dropbox.com/oauth2/authorize?' + form({ client_id: k, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline' }) };
    };
    self.dropboxFinish = function (code) {
      var p = st().pending, k = keys().dropbox;
      if (!p || p.provider !== 'dropbox') return Promise.reject(fail('state', 'Prima premi «Collega Dropbox»'));
      return call({ method: 'POST', url: 'https://api.dropboxapi.com/oauth2/token', form: { code: String(code || '').trim(), grant_type: 'authorization_code', code_verifier: p.verifier, client_id: k } }).then(function (r) {
        var j = json(r);
        if (r.status !== 200 || !j || !j.access_token) throw fail('badcode', 'Codice non valido o scaduto: riprova a copiarlo da Dropbox', { status: r.status });
        save({ provider: 'dropbox', tokens: tokensFrom(j), pending: undefined, rev: undefined, lastIds: undefined, tombs: undefined, setHash: undefined, settingsAt: undefined, lastSync: undefined });
        return true;
      });
    };

    /* ----- Google Drive: flusso per dispositivi, si digita un codice sul sito di Google ----- */
    self.googleStart = function () {
      var k = keys(); if (!k.googleId || !k.googleSecret) return Promise.reject(fail('config', 'Mancano le chiavi di Google'));
      return call({ method: 'POST', url: 'https://oauth2.googleapis.com/device/code', form: { client_id: k.googleId, scope: GOOGLE_SCOPE } }).then(function (r) {
        var j = json(r);
        if (r.status !== 200 || !j || !j.device_code) throw fail('http', (j && (j.error_description || j.error)) || 'Google non ha risposto', { status: r.status });
        save({ pending: { provider: 'google', device: j.device_code, interval: Math.max(3, j.interval || 5), until: now() + (j.expires_in || 1800) * 1000 } });
        return { userCode: j.user_code, url: j.verification_url || 'https://www.google.com/device', interval: Math.max(3, j.interval || 5), expiresAt: now() + (j.expires_in || 1800) * 1000 };
      });
    };
    /* 'pending' | 'done' ; errori: lancia */
    self.googlePoll = function () {
      var p = st().pending, k = keys();
      if (!p || p.provider !== 'google') return Promise.reject(fail('state', 'Collegamento non avviato'));
      if (now() > p.until) { save({ pending: undefined }); return Promise.reject(fail('expired', 'Il codice è scaduto: ricomincia')); }
      return call({ method: 'POST', url: 'https://oauth2.googleapis.com/token', form: { client_id: k.googleId, client_secret: k.googleSecret, device_code: p.device, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' } }).then(function (r) {
        var j = json(r) || {};
        if (r.status === 200 && j.access_token) {
          save({ provider: 'google', tokens: tokensFrom(j), pending: undefined, rev: undefined, fileId: undefined, lastIds: undefined, tombs: undefined, setHash: undefined, settingsAt: undefined, lastSync: undefined });
          return 'done';
        }
        if (j.error === 'authorization_pending') return 'pending';
        if (j.error === 'slow_down') { p.interval += 5; save({ pending: p }); return 'pending'; }
        if (j.error === 'access_denied') { save({ pending: undefined }); throw fail('denied', 'Hai negato l\'accesso'); }
        if (j.error === 'expired_token') { save({ pending: undefined }); throw fail('expired', 'Il codice è scaduto: ricomincia'); }
        throw fail('http', j.error_description || j.error || 'Errore di Google', { status: r.status });
      });
    };

    self.unlink = function () { save({ provider: undefined, tokens: undefined, pending: undefined, rev: undefined, fileId: undefined, lastIds: undefined, tombs: undefined, setHash: undefined, settingsAt: undefined, lastSync: undefined }); };

    /* ----- token ----- */
    function ensureToken() {
      var s = st(), t = s.tokens;
      if (!t || !t.access) return Promise.reject(fail('auth', 'Non collegato'));
      if (t.exp - now() > 60000) return Promise.resolve(t.access);
      if (!t.refresh) return Promise.reject(fail('auth', 'Collegamento scaduto'));
      var k = keys(), body = s.provider === 'dropbox'
        ? { grant_type: 'refresh_token', refresh_token: t.refresh, client_id: k.dropbox }
        : { grant_type: 'refresh_token', refresh_token: t.refresh, client_id: k.googleId, client_secret: k.googleSecret };
      return call({ method: 'POST', url: s.provider === 'dropbox' ? 'https://api.dropboxapi.com/oauth2/token' : 'https://oauth2.googleapis.com/token', form: body }).then(function (r) {
        var j = json(r);
        if (r.status === 200 && j && j.access_token) { var nt = tokensFrom(j, t); save({ tokens: nt }); return nt.access; }
        if (r.status === 400 || r.status === 401) { save({ tokens: undefined }); throw fail('auth', 'Collegamento scaduto: ricollega l\'account', { status: r.status }); }
        throw fail('http', 'Impossibile rinnovare l\'accesso (' + r.status + ')', { status: r.status });
      });
    }

    /* ----- lettura e scrittura del file ----- */
    function parseSnap(text) {
      var j; try { j = JSON.parse(text); } catch (e) { throw fail('format', 'Il file di sincronizzazione è rovinato'); }
      if (!j || j.app !== 'coglio-proxy-archive' || !Array.isArray(j.decks)) throw fail('format', 'Il file di sincronizzazione non è di Coglio Proxy Archive');
      return j;
    }
    var drop = {
      read: function (tok) {
        return call({ method: 'POST', url: 'https://content.dropboxapi.com/2/files/download', headers: { Authorization: 'Bearer ' + tok, 'Dropbox-API-Arg': JSON.stringify({ path: '/' + FILE }) } }).then(function (r) {
          if (r.status === 409) return { snap: null, rev: '' };       /* file ancora inesistente */
          if (r.status === 401) throw fail('auth', 'Accesso Dropbox scaduto', { status: 401 });
          if (r.status !== 200) throw fail('http', 'Dropbox ha risposto ' + r.status, { status: r.status });
          var meta = {}; try { meta = JSON.parse((r.headers && (r.headers['dropbox-api-result'] || r.headers['Dropbox-API-Result'])) || '{}'); } catch (e) { /* senza rev si sovrascrive */ }
          return { snap: parseSnap(r.text), rev: meta.rev || '' };
        });
      },
      write: function (tok, text, rev) {
        var mode = rev ? { '.tag': 'update', update: rev } : 'overwrite';
        return call({ method: 'POST', url: 'https://content.dropboxapi.com/2/files/upload', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: '/' + FILE, mode: mode, mute: true }) }, body: text }).then(function (r) {
          if (r.status === 409) throw fail('conflict', 'Il file è cambiato nel frattempo');
          if (r.status === 401) throw fail('auth', 'Accesso Dropbox scaduto', { status: 401 });
          if (r.status !== 200) throw fail('http', 'Dropbox ha risposto ' + r.status, { status: r.status });
          var j = json(r) || {}; return { rev: j.rev || '' };
        });
      }
    };
    var google = {
      find: function (tok) {
        return call({ method: 'GET', url: 'https://www.googleapis.com/drive/v3/files?' + form({ spaces: 'appDataFolder', q: "name='" + FILE + "'", fields: 'files(id,modifiedTime)', pageSize: 10 }), headers: { Authorization: 'Bearer ' + tok } }).then(function (r) {
          if (r.status === 401) throw fail('auth', 'Accesso Google scaduto', { status: 401 });
          if (r.status !== 200) throw fail('http', 'Google Drive ha risposto ' + r.status, { status: r.status });
          var f = ((json(r) || {}).files || []).sort(function (a, b) { return String(b.modifiedTime).localeCompare(String(a.modifiedTime)); })[0];
          return f ? f.id : '';
        });
      },
      read: function (tok) {
        return google.find(tok).then(function (id) {
          if (!id) return { snap: null, rev: '', fileId: '' };
          return call({ method: 'GET', url: 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media', headers: { Authorization: 'Bearer ' + tok } }).then(function (r) {
            if (r.status === 404) return { snap: null, rev: '', fileId: '' };
            if (r.status === 401) throw fail('auth', 'Accesso Google scaduto', { status: 401 });
            if (r.status !== 200) throw fail('http', 'Google Drive ha risposto ' + r.status, { status: r.status });
            return { snap: parseSnap(r.text), rev: '', fileId: id };
          });
        });
      },
      write: function (tok, text, rev, fileId) {
        var h = { Authorization: 'Bearer ' + tok };
        if (fileId) return call({ method: 'PATCH', url: 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media&fields=id', headers: Object.assign({ 'Content-Type': 'application/json; charset=UTF-8' }, h), body: text }).then(function (r) {
          if (r.status === 401) throw fail('auth', 'Accesso Google scaduto', { status: 401 });
          if (r.status !== 200) throw fail('http', 'Google Drive ha risposto ' + r.status, { status: r.status });
          return { rev: '', fileId: fileId };
        });
        var bd = 'coglio' + randomString(16, env.random).replace(/[^A-Za-z0-9]/g, 'x');
        var body = '--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: FILE, parents: ['appDataFolder'] }) + '\r\n--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + text + '\r\n--' + bd + '--';
        return call({ method: 'POST', url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', headers: Object.assign({ 'Content-Type': 'multipart/related; boundary=' + bd }, h), body: body }).then(function (r) {
          if (r.status === 401) throw fail('auth', 'Accesso Google scaduto', { status: 401 });
          if (r.status !== 200) throw fail('http', 'Google Drive ha risposto ' + r.status, { status: r.status });
          return { rev: '', fileId: (json(r) || {}).id || '' };
        });
      }
    };

    /* ----- sincronizzazione -----
     * ctx = { local(): {decks, settings}, signature(): string, apply(merged): void }
     * Restituisce {added, updated, removed, uploaded, again?} */
    self.sync = function (ctx, attempt) {
      attempt = attempt || 0;
      var s0 = st(); if (!s0.provider) return Promise.reject(fail('state', 'Non collegato'));
      var tokP = ensureToken();
      return tokP.then(function (tok) {
        var prov = s0.provider;
        var readP = prov === 'dropbox' ? drop.read(tok) : google.read(tok);
        return readP.then(function (rd) {
          var sigBefore = ctx.signature(), loc = ctx.local(), s = st();
          var m = merge({ decks: loc.decks, settings: loc.settings, remote: rd.snap, state: { lastIds: s.lastIds, tombs: s.tombs, setHash: s.setHash, settingsAt: s.settingsAt }, now: now() });
          if (m.localChanged) {
            if (ctx.signature() !== sigBefore) return { again: true, added: [], updated: [], removed: [], uploaded: false };
            ctx.apply(m);
          }
          var needUp = m.remoteChanged || !rd.snap;
          var done = function (w) {
            save({ lastIds: m.lastIds, tombs: m.tombs, setHash: m.setHash, settingsAt: m.settingsAt, lastSync: now(), rev: w ? w.rev : rd.rev, fileId: w && w.fileId ? w.fileId : rd.fileId });
            return { added: m.added, updated: m.updated, removed: m.removed, settings: m.settingsFromRemote, uploaded: !!w, again: false };
          };
          if (!needUp) return done(null);
          var text = JSON.stringify(Object.assign({ at: new Date(now()).toISOString(), device: env.device || '' }, m.snapshot));
          var wp = prov === 'dropbox' ? drop.write(tok, text, rd.rev) : google.write(tok, text, rd.rev, rd.fileId);
          return wp.then(done, function (e) {
            if (e && e.code === 'conflict' && attempt < 2) { return self.sync(ctx, attempt + 1); }
            throw e;
          });
        });
      });
    };

    return self;
  }

  return { create: create, merge: merge, sha256: sha256, b64url: b64url, canon: canon, deckSig: deckSig, settingsPart: settingsPart, FILE: FILE, TOMB_TTL: TOMB_TTL };
});
