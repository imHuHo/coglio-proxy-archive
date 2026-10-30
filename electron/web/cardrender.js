/* Coglio Proxy Designer - motore di rendering delle carte (canvas 2D).
 * Cornici, simboli e grafica sono disegnati qui da zero (nessuna immagine inclusa). Il formato è 745 x 1040 px (63 x 88 mm a ~300 dpi).
 * Uso: CPACard.render(ctx, design, { art: <immagine|null>, frameImg: <immagine|null> }, { square: false }) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPACard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var W = 745, H = 1040;
  var BASE_TITLE = "Cinzel, 'Palatino Linotype', 'Book Antiqua', Georgia, serif";
  var BASE_BODY = "'EB Garamond', 'Palatino Linotype', 'Book Antiqua', Georgia, serif";
  var F_TITLE = BASE_TITLE, F_BODY = BASE_BODY;
  /* risorse importate dall'utente (font e simboli di mana): senza di esse si usano font e simboli disegnati qui */
  var RES = { symbols: {} };
  function setResources(r) {
    r = r || {}; var f = r.fonts || {};
    RES.symbols = r.symbols || {};
    F_TITLE = f.title ? "'CPA Title', " + BASE_TITLE : BASE_TITLE;
    F_BODY = f.body ? "'CPA Body', " + BASE_BODY : BASE_BODY;
  }
  var F_UI = "Manrope, 'Segoe UI', Arial, sans-serif";

  /* ---------- tavolozze (colori scelti da noi) ---------- */
  var PAL = {
    W: { name: 'Bianco', a: '#f1ead7', b: '#cfc29e', bar: '#f8f3e4', edge: '#8c7c52', box: '#f8f4e8', ink: '#1b1a17', fg: '#2a2418', glow: '#fff6d6' },
    U: { name: 'Blu', a: '#8db5e2', b: '#46739f', bar: '#d3e3f5', edge: '#1d3c63', box: '#e1ebf6', ink: '#14202e', fg: '#ffffff', glow: '#cfe6ff' },
    B: { name: 'Nero', a: '#6a5e68', b: '#2a242d', bar: '#b8adb6', edge: '#120e14', box: '#d3ccd2', ink: '#16121a', fg: '#f0e9f0', glow: '#9f8fa6' },
    R: { name: 'Rosso', a: '#e48c72', b: '#a33f2c', bar: '#f4cdbf', edge: '#5e1f14', box: '#f4e0d6', ink: '#2a1410', fg: '#ffffff', glow: '#ffd2c2' },
    G: { name: 'Verde', a: '#86b980', b: '#3c6c46', bar: '#d2e6c9', edge: '#1d3d24', box: '#e0ebd9', ink: '#14231a', fg: '#ffffff', glow: '#d3f0c8' },
    M: { name: 'Oro (multicolore)', a: '#e6c76d', b: '#a38234', bar: '#f4e6ad', edge: '#5f4a14', box: '#f6eecb', ink: '#241d0c', fg: '#241d0c', glow: '#fff1b0' },
    A: { name: 'Artefatto', a: '#bcc2ca', b: '#79818c', bar: '#dde0e5', edge: '#3c424b', box: '#e7e9ec', ink: '#15181c', fg: '#101317', glow: '#f0f3f7' },
    L: { name: 'Terra', a: '#bba07a', b: '#765a3a', bar: '#e2d3b8', edge: '#463421', box: '#ece2d0', ink: '#241a10', fg: '#ffffff', glow: '#f1e2c4' },
    C: { name: 'Incolore', a: '#cdcac6', b: '#8b8884', bar: '#e2e0dd', edge: '#44413e', box: '#ecebe8', ink: '#1a1917', fg: '#161514', glow: '#f4f2ef' }
  };
  var PAL_ORDER = ['W', 'U', 'B', 'R', 'G', 'M', 'A', 'L', 'C'];
  var MANA = {
    W: ['#f6efd2', '#2b2417'], U: ['#a9cbee', '#102338'], B: ['#6f6270', '#ffffff'], R: ['#ec9577', '#3a130b'], G: ['#8cc08a', '#10281a'],
    C: ['#cdc9c4', '#222'], S: ['#dff1f7', '#1f3e4a'], X: ['#cfc7c4', '#1c1a19'], N: ['#cfc7c4', '#1c1a19'], T: ['#2c2a2e', '#fff'], Q: ['#f3f1ee', '#222']
  };
  var RARITY = { common: ['#15110f', '#6d6660'], uncommon: ['#c4d4de', '#5d7482'], rare: ['#e5c25a', '#8a6c18'], mythic: ['#ee7a36', '#97380c'] };

  /* ---------- cornici ---------- */
  var FRAMES = [
    { id: 'classic', name: 'Classica', sub: 'Creatura, magia, terra…' },
    { id: 'fullart', name: 'Tutta arte', sub: 'L’arte riempie la carta, bordo nero' },
    { id: 'borderless', name: 'Senza bordo', sub: 'Arte fino al taglio' },
    { id: 'token', name: 'Token', sub: 'Pedine e segnalini' },
    { id: 'planeswalker', name: 'Planeswalker', sub: 'Abilità con costo di lealtà' },
    { id: 'saga', name: 'Saga', sub: 'Capitoli e arte a destra' }
  ];
  var LAYOUT = {
    classic: { b: 30, title: [50, 50, 645, 64], art: [62, 124, 621, 456], type: [50, 592, 645, 58], box: [62, 660, 621, 290], pt: [506, 944, 184, 56], info: [58, 984] },
    fullart: { b: 30, title: [50, 50, 645, 64], art: [30, 30, 685, 980], type: [50, 612, 645, 56], box: [50, 678, 645, 292], pt: [506, 944, 184, 56], info: [58, 984], over: true },
    borderless: { b: 0, title: [40, 44, 665, 64], art: [0, 0, 745, 1040], type: [40, 620, 665, 56], box: [40, 686, 665, 290], pt: [506, 958, 184, 56], info: [48, 1002], over: true },
    token: { b: 30, title: [120, 50, 505, 62], art: [62, 122, 621, 520], type: [50, 652, 645, 54], box: [90, 716, 565, 232], pt: [506, 944, 184, 56], info: [58, 984], noCost: true, center: true },
    planeswalker: { b: 30, title: [50, 50, 645, 64], art: [62, 124, 621, 470], type: [50, 602, 645, 54], box: [50, 666, 645, 296], pt: [560, 930, 130, 76], info: [58, 984], walker: true },
    saga: { b: 30, title: [50, 50, 645, 64], art: [404, 124, 281, 790], type: [50, 926, 645, 54], box: [62, 124, 330, 790], pt: null, info: [58, 988], saga: true }
  };
  var DEFAULT_KINDS = { card: 'classic', token: 'token', alter: 'classic' };

  function defaults(kind) {
    var token = kind === 'token';
    return {
      id: '', kind: kind || 'card', name: token ? 'Token' : 'Nuova carta', cost: token ? '' : '{1}{U}', type: token ? 'Token Creature — Spirit' : 'Creature — Wizard',
      rules: token ? 'Flying' : 'Flying\n{T}: Draw a card, then discard a card.', flavor: '', pt: token ? '1/1' : '2/3', rarity: 'common', set: 'CST', num: '001', artist: '',
      frame: DEFAULT_KINDS[kind] || 'classic', colors: token ? 'U' : 'U', palette: 'auto', border: 'black', corners: 'round', alterOf: '',
      art: { id: '', x: 0, y: 0, s: 1 }, frameImg: '', ink: 'dark', createdAt: 0, updatedAt: 0
    };
  }

  function paletteKey(d) {
    if (d.palette && d.palette !== 'auto' && PAL[d.palette]) return d.palette;
    var cs = String(d.colors || '').toUpperCase().replace(/[^WUBRG]/g, '');
    cs = cs.split('').filter(function (c, i, a) { return a.indexOf(c) === i; }).join('');
    if (cs.length > 1) return 'M';
    if (cs.length === 1) return cs;
    var t = String(d.type || '').toLowerCase();
    if (/\bland\b|terra/.test(t)) return 'L';
    if (/artifact|artefatto/.test(t)) return 'A';
    return 'C';
  }

  /* ---------- utilità di disegno ---------- */
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function vgrad(ctx, y, h, a, b) { var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  var noise = null;
  function noisePattern(ctx) {
    if (!noise && typeof document !== 'undefined') {
      var c = document.createElement('canvas'); c.width = c.height = 192; var x = c.getContext('2d'), im = x.createImageData(192, 192), s = 12345;
      for (var i = 0; i < im.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; var v = (s >>> 24) & 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v < 128 ? 0 : 255; im.data[i + 3] = 10 + (v % 14); }
      x.putImageData(im, 0, 0); noise = c;
    }
    return noise ? ctx.createPattern(noise, 'repeat') : null;
  }
  function mix(hex, to, t) {
    var p = function (h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
    var a = p(hex), b = p(to), o = a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); });
    return 'rgb(' + o.join(',') + ')';
  }

  /* ---------- simboli del mana (icone disegnate qui) ---------- */
  function iconPath(ctx, k, r) {
    ctx.beginPath();
    if (k === 'W') { ctx.arc(0, 0, r * 0.28, 0, 6.2832); for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; ctx.moveTo(Math.cos(a - 0.2) * r * 0.42, Math.sin(a - 0.2) * r * 0.42); ctx.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74); ctx.lineTo(Math.cos(a + 0.2) * r * 0.42, Math.sin(a + 0.2) * r * 0.42); } }
    else if (k === 'U') { ctx.moveTo(0, -r * 0.72); ctx.bezierCurveTo(r * 0.7, -r * 0.05, r * 0.62, r * 0.7, 0, r * 0.7); ctx.bezierCurveTo(-r * 0.62, r * 0.7, -r * 0.7, -r * 0.05, 0, -r * 0.72); }
    else if (k === 'B') { ctx.arc(0, -r * 0.1, r * 0.5, 0, 6.2832); ctx.moveTo(-r * 0.3, r * 0.3); ctx.lineTo(-r * 0.3, r * 0.68); ctx.lineTo(r * 0.3, r * 0.68); ctx.lineTo(r * 0.3, r * 0.3); }
    else if (k === 'R') { ctx.moveTo(r * 0.05, -r * 0.78); ctx.bezierCurveTo(r * 0.7, -r * 0.2, r * 0.7, r * 0.7, 0, r * 0.74); ctx.bezierCurveTo(-r * 0.7, r * 0.7, -r * 0.6, 0, -r * 0.25, -r * 0.25); ctx.bezierCurveTo(-r * 0.2, -r * 0.05, -r * 0.05, 0, r * 0.05, -r * 0.78); }
    else if (k === 'G') { ctx.moveTo(-r * 0.6, r * 0.6); ctx.bezierCurveTo(-r * 0.7, -r * 0.4, r * 0.1, -r * 0.8, r * 0.7, -r * 0.7); ctx.bezierCurveTo(r * 0.75, -r * 0.05, r * 0.2, r * 0.7, -r * 0.6, r * 0.6); }
  }
  function drawIcon(ctx, k, r, color) {
    ctx.fillStyle = color; iconPath(ctx, k, r); ctx.fill();
    if (k === 'B') { ctx.fillStyle = MANA.B[0]; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.1, r * 0.12, 0, 6.2832); ctx.arc(r * 0.2, -r * 0.1, r * 0.12, 0, 6.2832); ctx.fill(); }
    if (k === 'G') { ctx.strokeStyle = MANA.G[0]; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.5); ctx.lineTo(r * 0.45, -r * 0.5); ctx.stroke(); }
  }
  function disc(ctx, cx, cy, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill(); }
  function symText(ctx, s, cx, cy, d, color) {
    ctx.fillStyle = color; ctx.font = '700 ' + Math.round(d * (s.length > 1 ? 0.5 : 0.62)) + 'px ' + F_UI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, cx, cy + d * 0.04);
  }
  /* d = diametro. key = contenuto fra graffe, es. "2", "U", "W/U", "2/W", "G/P", "T" */
  function drawSymbol(ctx, key, cx, cy, d) {
    var k = String(key).toUpperCase(), r = d / 2;
    var img = RES.symbols[k];
    if (!img && /^\d+$/.test(k) && RES.symbols.CIRCLE) {
      var cir = RES.symbols.CIRCLE, ch = d * 1.08, cw = ch * cir.width / cir.height;
      ctx.save(); ctx.drawImage(cir, cx - cw / 2, cy - ch / 2, cw, ch);
      ctx.fillStyle = '#14110f'; ctx.font = '700 ' + Math.round(d * (k.length > 1 ? 0.5 : 0.64)) + 'px ' + F_TITLE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k, cx, cy + d * 0.05);
      ctx.restore(); return;
    }
    if (img) { var ih = d * 1.08, iw = ih * img.width / img.height; ctx.save(); ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih); ctx.restore(); return; }
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(cx - r * 0.08, cy + r * 0.1, r, 0, 6.2832); ctx.fill();
    var parts = k.split('/');
    if (parts.length === 2 && parts[1] === 'P') {
      var c0 = MANA[parts[0]] || MANA.C; disc(ctx, cx, cy, r, c0[0]); symText(ctx, 'Φ', cx, cy, d, c0[1]);
    } else if (parts.length === 2) {
      var a = MANA[parts[0]] || MANA.N, b = MANA[parts[1]] || MANA.N, num = /^\d+$/.test(parts[0]);
      disc(ctx, cx, cy, r, num ? MANA.N[0] : a[0]);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.clip();
      ctx.fillStyle = b[0]; ctx.beginPath(); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(cx - r * 0.34, cy - r * 0.34);
      if (num) symText(ctx, parts[0], 0, 0, d * 0.62, '#1c1a19'); else drawIcon(ctx, parts[0], r * 0.5, a[1]);
      ctx.restore(); ctx.save(); ctx.translate(cx + r * 0.36, cy + r * 0.36); drawIcon(ctx, parts[1], r * 0.5, b[1]); ctx.restore();
    } else if ('WUBRG'.indexOf(k) >= 0 && k.length === 1) {
      disc(ctx, cx, cy, r, MANA[k][0]); ctx.save(); ctx.translate(cx, cy); drawIcon(ctx, k, r, MANA[k][1]); ctx.restore();
    } else if (k === 'T' || k === 'Q') {
      disc(ctx, cx, cy, r, MANA[k][0]); ctx.strokeStyle = MANA[k][1]; ctx.fillStyle = MANA[k][1]; ctx.lineWidth = r * 0.18; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, k === 'T' ? -2.4 : -0.8, k === 'T' ? 0.9 : 3.3); ctx.stroke();
      var ax = cx + Math.cos(k === 'T' ? 0.9 : 3.3) * r * 0.5, ay = cy + Math.sin(k === 'T' ? 0.9 : 3.3) * r * 0.5;
      ctx.beginPath(); ctx.arc(ax, ay, r * 0.2, 0, 6.2832); ctx.fill();
    } else if (k === 'C') {
      disc(ctx, cx, cy, r, MANA.C[0]); ctx.fillStyle = MANA.C[1]; ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx + r * 0.36, cy); ctx.lineTo(cx, cy + r * 0.5); ctx.lineTo(cx - r * 0.36, cy); ctx.closePath(); ctx.fill();
    } else if (k === 'S') {
      disc(ctx, cx, cy, r, MANA.S[0]); symText(ctx, '❄', cx, cy, d, MANA.S[1]);
    } else {
      disc(ctx, cx, cy, r, MANA.N[0]); symText(ctx, k, cx, cy, d, MANA.N[1]);
    }
    ctx.lineWidth = Math.max(1, d * 0.03); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  /* ---------- testo ricco: parole, simboli {..}, corsivo fra parentesi ---------- */
  function tokenize(str) {
    var out = [], paras = String(str == null ? '' : str).replace(/\r/g, '').split('\n');
    paras.forEach(function (p, pi) {
      var line = [], it = false, re = /\{([^}]{1,6})\}|\s+|[^\s{]+/g, m;
      while ((m = re.exec(p))) {
        if (m[1] != null) line.push({ t: 'sym', s: m[1], it: it });
        else if (/^\s+$/.test(m[0])) line.push({ t: 'sp', it: it });
        else {
          var w = m[0], pre = w[0] === '(', post = w[w.length - 1] === ')';
          if (pre) it = true;
          line.push({ t: 'w', s: w, it: it });
          if (post) it = false;
        }
      }
      out.push(line);
    });
    return out;
  }
  function wordW(ctx, t, size, face) { ctx.font = (t.it ? 'italic ' : '') + size + 'px ' + face; return ctx.measureText(t.s).width; }
  /* Impagina i paragrafi in larghezza maxW: restituisce {lines:[{items:[{t,x,w}], h}], h} */
  function layout(ctx, paras, maxW, size, face, forceItalic) {
    var lines = [], lh = Math.round(size * 1.16), gap = Math.round(size * 0.34), total = 0;
    paras.forEach(function (p, pi) {
      var cur = { items: [], x: 0 }, sp = size * 0.26, lastSp = null;
      var push = function (extra) { lines.push({ items: cur.items, w: cur.x, lh: lh, para: extra }); cur = { items: [], x: 0 }; };
      p.forEach(function (t) {
        if (forceItalic) t = { t: t.t, s: t.s, it: true };
        if (t.t === 'sp') { if (cur.items.length) { lastSp = { t: t, x: cur.x, w: sp }; cur.x += sp; } return; }
        var w = t.t === 'sym' ? size * 0.92 : wordW(ctx, t, size, face);
        if (cur.items.length && cur.x - (lastSp && lastSp.x + lastSp.w === cur.x ? sp : 0) + w > maxW) {
          cur.x -= (lastSp && lastSp.x + lastSp.w === cur.x ? sp : 0); push(false);
        }
        cur.items.push({ t: t, x: cur.x, w: w }); cur.x += w;
      });
      if (cur.items.length || !p.length) { cur.x -= 0; push(true); }
      else if (lines.length) lines[lines.length - 1].para = true;
      total += 0;
    });
    var h = 0; lines.forEach(function (l, i) { h += l.lh; if (l.para && i < lines.length - 1) h += gap; });
    return { lines: lines, h: h, gap: gap, size: size, face: face };
  }
  function drawLayout(ctx, L, x, y, ink, align, boxW) {
    var cy = y;
    L.lines.forEach(function (l) {
      var ox = align === 'center' ? x + (boxW - l.w) / 2 : x;
      l.items.forEach(function (it) {
        if (it.t.t === 'sym') drawSymbol(ctx, it.t.s, ox + it.x + it.w / 2 - L.size * 0.02, cy + L.size * 0.5, L.size * 0.84);
        else { ctx.font = (it.t.it ? 'italic ' : '') + L.size + 'px ' + L.face; ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(it.t.s, ox + it.x, cy + L.size * 0.82); }
      });
      cy += l.lh + (l.para ? L.gap : 0);
    });
    return cy;
  }
  /* sceglie la dimensione più grande che entra in box (w x h) */
  function fit(ctx, rulesParas, flavorParas, w, h, max, min, face) {
    for (var s = max; s >= min; s -= 1) {
      var a = layout(ctx, rulesParas, w, s, face, false), b = flavorParas && flavorParas.length ? layout(ctx, flavorParas, w, s, face, true) : null;
      var tot = a.h + (b ? b.h + Math.round(s * 0.7) : 0);
      if (tot <= h || s === min) return { a: a, b: b, size: s, h: tot, sep: b ? Math.round(s * 0.7) : 0 };
    }
  }

  /* ---------- elementi della carta ---------- */
  function bar(ctx, r, pal, radius, over) {
    var x = r[0], y = r[1], w = r[2], h = r[3];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    rr(ctx, x, y, w, h, radius);
    if (over) { ctx.fillStyle = 'rgba(14,12,18,0.72)'; } else ctx.fillStyle = vgrad(ctx, y, h, mix(pal.bar, '#ffffff', 0.35), mix(pal.bar, pal.a, 0.28));
    ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, x, y, w, h, radius); ctx.lineWidth = 3; ctx.strokeStyle = over ? 'rgba(255,255,255,0.35)' : pal.edge; ctx.stroke();
    rr(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(2, radius - 3)); ctx.lineWidth = 1.5; ctx.strokeStyle = over ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)'; ctx.stroke();
    ctx.restore();
  }
  function drawArtImage(ctx, img, r, art) {
    var x = r[0], y = r[1], w = r[2], h = r[3];
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var s = Math.max(w / iw, h / ih) * Math.max(0.2, (art && art.s) || 1);
    var dw = iw * s, dh = ih * s;
    var dx = x + (w - dw) / 2 + ((art && art.x) || 0), dy = y + (h - dh) / 2 + ((art && art.y) || 0);
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  function artPlaceholder(ctx, r, pal) {
    var x = r[0], y = r[1], w = r[2], h = r[3];
    ctx.fillStyle = vgrad(ctx, y, h, mix(pal.a, '#ffffff', 0.15), mix(pal.b, '#000000', 0.35)); ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    for (var i = -h; i < w; i += 46) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '700 30px ' + F_UI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ARTE', x + w / 2, y + h / 2 - 16);
    ctx.font = '500 20px ' + F_UI; ctx.fillText('carica un’immagine', x + w / 2, y + h / 2 + 18);
  }
  function setGem(ctx, cx, cy, rarity, light) {
    var c = RARITY[rarity] || RARITY.common; ctx.save(); ctx.translate(cx, cy);
    ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(-8, -15); ctx.lineTo(8, -15); ctx.lineTo(17, 0); ctx.lineTo(8, 15); ctx.lineTo(-8, 15); ctx.closePath();
    ctx.fillStyle = c[0]; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = light ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.7)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, -8); ctx.lineTo(9, 0); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke(); ctx.restore();
  }
  function fitLine(ctx, text, face, weight, maxSize, minSize, maxW) {
    for (var s = maxSize; s >= minSize; s--) { ctx.font = weight + ' ' + s + 'px ' + face; if (ctx.measureText(text).width <= maxW) return s; }
    return minSize;
  }
  function costTokens(cost) { var out = [], re = /\{([^}]{1,6})\}/g, m; while ((m = re.exec(String(cost || '')))) out.push(m[1]); return out; }

  function drawTitle(ctx, d, L, pal, over, user) {
    var r = L.title, ink = over || (user && user.ink === 'light') ? '#ffffff' : pal.ink;
    var costs = L.noCost ? [] : costTokens(d.cost), sd = 34, cw = costs.length * (sd + 2);
    var maxW = r[2] - 34 - (cw ? cw + 14 : 0);
    var name = String(d.name || ''), size = fitLine(ctx, name, F_TITLE, 700, 36, 17, maxW);
    ctx.font = '700 ' + size + 'px ' + F_TITLE; ctx.fillStyle = ink; ctx.textBaseline = 'middle';
    if (L.center) { ctx.textAlign = 'center'; ctx.fillText(name, r[0] + r[2] / 2, r[1] + r[3] / 2 + 2); }
    else { ctx.textAlign = 'left'; ctx.fillText(name, r[0] + 20, r[1] + r[3] / 2 + 2); }
    var x = r[0] + r[2] - 14 - cw + 1;
    costs.forEach(function (c, i) { drawSymbol(ctx, c, x + i * (sd + 2) + sd / 2, r[1] + r[3] / 2, sd); });
  }
  function drawType(ctx, d, L, pal, over, user) {
    var r = L.type, ink = over || (user && user.ink === 'light') ? '#ffffff' : pal.ink;
    var gem = L.walker || L.saga || true;
    var maxW = r[2] - 40 - (gem ? 52 : 0);
    var size = fitLine(ctx, String(d.type || ''), F_TITLE, 700, 30, 15, maxW);
    ctx.font = '700 ' + size + 'px ' + F_TITLE; ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(String(d.type || ''), r[0] + 20, r[1] + r[3] / 2 + 2);
    if (gem) setGem(ctx, r[0] + r[2] - 34, r[1] + r[3] / 2, d.rarity, !over);
  }
  function drawRulesBox(ctx, d, L, pal, over, user) {
    var r = L.box, x = r[0], y = r[1], w = r[2], h = r[3];
    var ink = over || (user && user.ink === 'light') ? '#f4f1f6' : pal.ink;
    if (!user) {
      ctx.save(); rr(ctx, x, y, w, h, 10);
      if (over) { ctx.fillStyle = 'rgba(14,12,18,0.7)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.stroke(); }
      else {
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fillStyle = vgrad(ctx, y, h, mix(pal.box, '#ffffff', 0.25), pal.box); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.lineWidth = 3; ctx.strokeStyle = pal.edge; ctx.stroke();
        rr(ctx, x + 3, y + 3, w - 6, h - 6, 8); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
      }
      ctx.restore();
    }
    var padX = 22, padY = 16, iw = w - padX * 2, ih = h - padY * 2;
    var f = fit(ctx, tokenize(d.rules), String(d.flavor || '').trim() ? tokenize(d.flavor) : null, iw, ih, L.center ? 34 : 33, 15, F_BODY);
    var top = y + padY + Math.max(0, (ih - f.h) / 2);
    var align = L.center ? 'center' : 'left', yy = drawLayout(ctx, f.a, x + padX, top, ink, align, iw);
    if (f.b) {
      yy += f.sep * 0.15;
      ctx.strokeStyle = over ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + w * 0.3, yy + f.sep * 0.3); ctx.lineTo(x + w * 0.7, yy + f.sep * 0.3); ctx.stroke();
      drawLayout(ctx, f.b, x + padX, yy + f.sep * 0.7, ink, align, iw);
    }
  }
  function drawPT(ctx, d, L, pal, over, user) {
    if (!L.pt || !String(d.pt || '').trim()) return;
    var r = L.pt, txt = String(d.pt).trim();
    ctx.save();
    if (L.walker) { /* scudo di lealtà */
      var cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
      ctx.beginPath(); ctx.moveTo(cx - 52, cy - 32); ctx.lineTo(cx + 52, cy - 32); ctx.lineTo(cx + 52, cy + 12); ctx.lineTo(cx, cy + 46); ctx.lineTo(cx - 52, cy + 12); ctx.closePath();
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fillStyle = '#1a1620'; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.lineWidth = 4; ctx.strokeStyle = pal.glow; ctx.stroke();
      var s = fitLine(ctx, txt, F_TITLE, 700, 44, 22, 84); ctx.font = '700 ' + s + 'px ' + F_TITLE; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, cx, cy - 4);
    } else {
      if (!(user && user.pt)) { rr(ctx, r[0], r[1], r[2], r[3], 14); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.fillStyle = over ? 'rgba(14,12,18,0.85)' : vgrad(ctx, r[1], r[3], mix(pal.bar, '#ffffff', 0.35), mix(pal.bar, pal.a, 0.3)); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.lineWidth = 3.5; ctx.strokeStyle = over ? 'rgba(255,255,255,0.45)' : pal.edge; ctx.stroke(); }
      var s2 = fitLine(ctx, txt, F_TITLE, 700, 38, 18, r[2] - 28); ctx.font = '700 ' + s2 + 'px ' + F_TITLE; ctx.fillStyle = over || (user && user.pt && user.ink === 'light') ? '#fff' : (user && user.pt ? '#14110f' : pal.ink); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, r[0] + r[2] / 2, r[1] + r[3] / 2 + 2);
    }
    ctx.restore();
  }
  function drawInfo(ctx, d, L, pal, onDark) {
    var ink = onDark ? 'rgba(255,255,255,0.92)' : pal.fg;
    ctx.fillStyle = ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    var a = [String(d.num || '').trim(), String(d.set || '').trim().toUpperCase()].filter(Boolean).join(' · ');
    if (onDark) { ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; }
    ctx.font = '600 19px ' + F_UI; ctx.fillText(a, L.info[0], L.info[1] + 9);
    var art = String(d.artist || '').trim();
    if (art) { ctx.font = '500 18px ' + F_UI; var x0 = L.info[0] + ctx.measureText(a).width + (a ? 18 : 0); ctx.fillText('Illus. ' + art, x0, L.info[1] + 9); }
    ctx.shadowColor = 'transparent';
  }

  /* abilità del planeswalker: righe "+1: testo", "−3: testo", "0: testo" */
  function parseWalker(text) {
    var lines = String(text || '').split('\n').filter(function (l) { return l.trim(); }), out = [];
    lines.forEach(function (l) {
      var m = /^\s*([+−\-–]?\s*\d+|[+−\-–]\s*X)\s*:\s*(.*)$/i.exec(l);
      if (m) out.push({ cost: m[1].replace(/\s+/g, '').replace(/^-/, '−').replace(/^–/, '−'), text: m[2] });
      else if (out.length && !m && /^\s/.test(l)) out[out.length - 1].text += ' ' + l.trim();
      else out.push({ cost: '', text: l.trim() });
    });
    return out;
  }
  function drawWalkerBox(ctx, d, L, pal, user) {
    var r = L.box, ab = parseWalker(d.rules), n = Math.max(1, ab.length);
    var x = r[0], y = r[1], w = r[2], h = r[3];
    ctx.save(); rr(ctx, x, y, w, h, 10); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = vgrad(ctx, y, h, '#2a2530', '#17131c'); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 3; ctx.strokeStyle = pal.glow; ctx.stroke(); ctx.restore();
    var rowH = (h - 12) / n, size = 33;
    for (; size >= 15; size--) {
      var ok = true;
      for (var i = 0; i < ab.length; i++) { var l = layout(ctx, tokenize(ab[i].text), w - 150, size, F_BODY, false); if (l.h > rowH - 14) { ok = false; break; } }
      if (ok) break;
    }
    ab.forEach(function (a, i) {
      var ry = y + 6 + i * rowH;
      if (i) { ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 14, ry); ctx.lineTo(x + w - 14, ry); ctx.stroke(); }
      if (a.cost) {
        var pos = a.cost[0] === '+', neg = a.cost[0] === '−';
        ctx.save(); ctx.translate(x + 62, ry + rowH / 2); ctx.beginPath();
        if (pos) { ctx.moveTo(-34, 14); ctx.lineTo(0, -30); ctx.lineTo(34, 14); ctx.lineTo(24, 24); ctx.lineTo(-24, 24); }
        else if (neg) { ctx.moveTo(-34, -14); ctx.lineTo(0, 30); ctx.lineTo(34, -14); ctx.lineTo(24, -24); ctx.lineTo(-24, -24); }
        else { rr(ctx, -30, -22, 60, 44, 10); }
        ctx.closePath(); ctx.fillStyle = pal.b; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = pal.glow; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 28px ' + F_TITLE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.cost, 0, pos ? 6 : neg ? -6 : 0); ctx.restore();
      }
      var lay = layout(ctx, tokenize(a.text), w - 150, size, F_BODY, false);
      drawLayout(ctx, lay, x + 112, ry + (rowH - lay.h) / 2, '#f4f1f6', 'left', w - 150);
    });
  }
  function parseSaga(text) {
    var lines = String(text || '').split('\n').filter(function (l) { return l.trim(); }), intro = [], chapters = [];
    lines.forEach(function (l) {
      var m = /^\s*((?:I{1,3}|IV|V|VI{0,3}|\d)(?:\s*[,–—-]\s*(?:I{1,3}|IV|V|VI{0,3}|\d))*)\s*[—–:-]\s*(.*)$/.exec(l);
      if (m) chapters.push({ num: m[1].replace(/\s+/g, ''), text: m[2] }); else if (!chapters.length) intro.push(l); else chapters[chapters.length - 1].text += ' ' + l.trim();
    });
    return { intro: intro.join('\n'), chapters: chapters };
  }
  function drawSagaBox(ctx, d, L, pal) {
    var r = L.box, x = r[0], y = r[1], w = r[2], h = r[3], s = parseSaga(d.rules), n = Math.max(1, s.chapters.length);
    ctx.save(); rr(ctx, x, y, w, h, 10); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fillStyle = vgrad(ctx, y, h, mix(pal.box, '#ffffff', 0.25), pal.box); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.lineWidth = 3; ctx.strokeStyle = pal.edge; ctx.stroke(); ctx.restore();
    var introH = 0, size = 31, rowsH;
    for (; size >= 14; size--) {
      var il = s.intro ? layout(ctx, tokenize(s.intro), w - 40, size, F_BODY, true) : null; introH = il ? il.h + 14 : 0;
      rowsH = (h - 24 - introH) / n; var ok = true;
      for (var i = 0; i < s.chapters.length; i++) { var l = layout(ctx, tokenize(s.chapters[i].text), w - 40 - 78, size, F_BODY, false); if (l.h > rowsH - 14) { ok = false; break; } }
      if (ok) break;
    }
    var cy = y + 12;
    if (s.intro) { var il2 = layout(ctx, tokenize(s.intro), w - 40, size, F_BODY, true); drawLayout(ctx, il2, x + 20, cy, pal.ink, 'left', w - 40); cy += il2.h + 14; }
    s.chapters.forEach(function (c, i) {
      var ry = cy + i * rowsH;
      if (i || s.intro) { ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 14, ry - 3); ctx.lineTo(x + w - 14, ry - 3); ctx.stroke(); }
      ctx.save(); ctx.translate(x + 44, ry + rowsH / 2 - 2); disc(ctx, 0, 0, 28, pal.b); ctx.lineWidth = 3; ctx.strokeStyle = pal.edge; ctx.beginPath(); ctx.arc(0, 0, 28, 0, 6.2832); ctx.stroke();
      var fs = fitLine(ctx, c.num, F_TITLE, 700, 26, 12, 46); ctx.font = '700 ' + fs + 'px ' + F_TITLE; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.num, 0, 2); ctx.restore();
      var lay = layout(ctx, tokenize(c.text), w - 40 - 78, size, F_BODY, false);
      drawLayout(ctx, lay, x + 90, ry + (rowsH - lay.h) / 2 - 4, pal.ink, 'left', w - 40 - 78);
    });
  }

  /* ---------- carta intera ---------- */
  function render(ctx, d, assets, opt) {
    assets = assets || {}; opt = opt || {};
    var L = LAYOUT[d.frame] || LAYOUT.classic, pk = paletteKey(d), pal = PAL[pk], user = assets.frameImg ? { ink: d.ink === 'light' ? 'light' : 'dark', pt: !!assets.ptImg } : null;
    /* una cornice importata può portare la propria geometria (zona arte, barre, riquadri): sostituisce quella della cornice disegnata */
    if (user && assets.frameGeo) { var G = assets.frameGeo, L2 = {}; Object.keys(L).forEach(function (k) { L2[k] = L[k]; }); ['art', 'title', 'type', 'box', 'pt', 'info'].forEach(function (k) { if (G[k]) L2[k] = G[k]; }); L = L2; }
    var over = !!L.over && !user, square = opt.square || d.corners === 'square';
    var BORDER = { black: '#0d0b0e', white: '#f2eee6', silver: '#b9bdc4', gold: '#c9a640' }[d.border] || '#0d0b0e';
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    var outer = square ? 0 : 38;
    rr(ctx, 0, 0, W, H, outer); ctx.clip();
    ctx.fillStyle = BORDER; ctx.fillRect(0, 0, W, H);
    var b = L.b, hasArt = !!assets.art;
    if (user) {
      /* cornice importata dall'utente: arte sotto, cornice sopra, testi sopra tutto */
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      var ar = (assets.frameGeo && assets.frameGeo.art) || LAYOUT.classic.art; if (d.frame === 'fullart' || d.frame === 'borderless') ar = [0, 0, W, H];
      if (hasArt) drawArtImage(ctx, assets.art, ar, d.art); else { ctx.fillStyle = '#26222c'; ctx.fillRect(0, 0, W, H); }
      ctx.drawImage(assets.frameImg, 0, 0, W, H);
      if (assets.frameGeo && assets.frameGeo.panel && !L.walker && !L.saga) { var bx = L.box; ctx.fillStyle = assets.frameGeo.panel; ctx.fillRect(bx[0] + 4, bx[1] + 4, bx[2] - 8, bx[3] - 8); }
      if (assets.ptImg && L.pt && String(d.pt || '').trim() && !L.walker) ctx.drawImage(assets.ptImg, 0, 0, W, H);
      ctx.restore();
    } else if (over) {
      /* arte a tutta carta */
      var ar2 = L.art;
      ctx.save(); rr(ctx, b, b, W - 2 * b, H - 2 * b, b ? 8 : 0); if (!b) { ctx.beginPath(); ctx.rect(0, 0, W, H); } ctx.clip();
      if (hasArt) drawArtImage(ctx, assets.art, ar2, d.art); else artPlaceholder(ctx, ar2, pal);
      var gt = ctx.createLinearGradient(0, 0, 0, 160); gt.addColorStop(0, 'rgba(0,0,0,0.45)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gt; ctx.fillRect(0, 0, W, 160);
      var gb = ctx.createLinearGradient(0, 560, 0, H); gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, 'rgba(0,0,0,0.65)'); ctx.fillStyle = gb; ctx.fillRect(0, 560, W, H - 560);
      ctx.restore();
    } else {
      /* corpo della cornice */
      var fx = b, fy = b, fw = W - 2 * b, fh = H - 2 * b;
      ctx.save(); rr(ctx, fx, fy, fw, fh, 12); ctx.fillStyle = vgrad(ctx, fy, fh, pal.a, pal.b); ctx.fill();
      var np = noisePattern(ctx); if (np) { ctx.fillStyle = np; ctx.fill(); }
      var vg = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 720); vg.addColorStop(0, 'rgba(255,255,255,0.10)'); vg.addColorStop(1, 'rgba(0,0,0,0.18)'); ctx.fillStyle = vg; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; rr(ctx, fx + 3, fy + 3, fw - 6, fh - 6, 10); ctx.stroke(); ctx.restore();
      /* finestra dell'arte */
      var ar3 = L.art; ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; rr(ctx, ar3[0] - 4, ar3[1] - 4, ar3[2] + 8, ar3[3] + 8, 6); ctx.fillStyle = pal.edge; ctx.fill(); ctx.restore();
      ctx.save(); rr(ctx, ar3[0], ar3[1], ar3[2], ar3[3], 3); ctx.clip();
      if (hasArt) drawArtImage(ctx, assets.art, ar3, d.art); else artPlaceholder(ctx, ar3, pal);
      ctx.restore();
      ctx.save(); rr(ctx, ar3[0], ar3[1], ar3[2], ar3[3], 3); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.stroke(); ctx.restore();
    }
    if (!user || true) {
      var barR = user ? 0 : 14;
      if (!user) { bar(ctx, L.title, pal, barR, over); bar(ctx, L.type, pal, barR, over); }
      drawTitle(ctx, d, L, pal, over, user); drawType(ctx, d, L, pal, over, user);
      if (L.walker) drawWalkerBox(ctx, d, L, pal, user);
      else if (L.saga) drawSagaBox(ctx, d, L, pal);
      else drawRulesBox(ctx, d, L, pal, over, user);
      drawPT(ctx, d, L, pal, over, user);
      drawInfo(ctx, d, L, pal, over || !!user || pk === 'B' || pk === 'U' || pk === 'R' || pk === 'G' || pk === 'L');
    }
    ctx.restore();
  }

  return {
    W: W, H: H, FRAMES: FRAMES, LAYOUT: LAYOUT, PAL: PAL, PAL_ORDER: PAL_ORDER, RARITY: RARITY, defaults: defaults, paletteKey: paletteKey,
    render: render, tokenize: tokenize, costTokens: costTokens, parseWalker: parseWalker, parseSaga: parseSaga, drawSymbol: drawSymbol,
    F_UI: F_UI, setResources: setResources, hasSymbols: function () { return Object.keys(RES.symbols).length > 0; }
  };
});
