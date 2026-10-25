/* Снайпер: прятки — онлайн-батл 1 на 1 (и тренировка с ботом). Набор «Кооп-игры». */
(function () {
  "use strict";
  const T = window.TG;
  const $ = (id) => document.getElementById(id);
  const WW = 360, WH = 300, G = 232;
  const ROUNDS = 6, PREP = 3, DUR = 20, BASE_MAG = 3, HEAD = 50, BODY = 25, SPEED = 72;
  const UP = {
    mag: { name: "Обойма", ic: "🔫", desc: "+1 патрон в раунде снайпера" },
    zoom: { name: "Прицел", ic: "🔭", desc: "Сильнее увеличение" },
    speed: { name: "Кроссовки", ic: "👟", desc: "+12% к скорости бега" },
    armor: { name: "Броня", ic: "🦺", desc: "−12% урона по тебе" }
  };
  const PRICE = [40, 80, 140], MAXLV = 3;
  const THEMES = [
    { name: "Пустынный", sky: ["#3d8fe0", "#a9dcff"], sea: ["#1f78c4", "#4fb3e8"], sand: ["#e7c27c", "#b07f45"], top: "#d9ae67", brick: 22, mortar: "#8a5a3c" },
    { name: "Закатный", sky: ["#5b3a8c", "#ff9d6c"], sea: ["#3a4f9a", "#e2837a"], sand: ["#d9a066", "#8a5232"], top: "#e6b07a", brick: 6, mortar: "#6e3b2a" }
  ];
  const EMOS = ["😂", "😡", "🖕", "👍", "😎", "🤡", "😱", "💩", "🔥"];
  // «Снайпер 2»: локации (выбираются на раунд по seed — одинаково у обоих), дым и граната, рейтинг
  const LOCS = [
    { id: "island", name: "Остров", ic: "🏝️" },
    { id: "city", name: "Город", ic: "🏙️" },
    { id: "forest", name: "Лес", ic: "🌲" },
    { id: "snow", name: "Снег", ic: "❄️" }
  ];
  const SMOKES = 2, SMOKE_T = 5.5, SMOKE_R = 36;      // дымовые шашки бегущего
  const GRENS = 1, GREN_DELAY = 1.7, GREN_R = 46, GREN_MAX = 40;   // граната снайпера
  const RANKS = [[0, "🔰", "Новичок"], [1100, "🎯", "Стрелок"], [1250, "🔭", "Снайпер"], [1450, "👑", "Легенда"]];
  const rankOf = (r) => { let k = RANKS[0]; for (const x of RANKS) if (r >= x[0]) k = x; return { ic: k[1], name: k[2] }; };

  // ---------- рейтинг (ELO за онлайн, отдельно победы над ботом): localStorage + CloudStorage ----------
  const RKEY = "sniper_rating";
  let rating = { r: 1000, g: 0, w: 0, l: 0, d: 0, bw: 0, bg: 0, n: 0 };
  const cloudOk = () => { try { return !!(T.tg && T.tg.CloudStorage && T.tg.isVersionAtLeast && T.tg.isVersionAtLeast("6.9")); } catch (_) { return false; } };
  function parseRating(s) { try { const o = typeof s === "string" ? JSON.parse(s) : s; return o && typeof o.r === "number" && isFinite(o.r) ? o : null; } catch (_) { return null; } }
  function loadRating(cb) {
    let loc = null; try { loc = parseRating(localStorage.getItem(RKEY)); } catch (_) {}
    const done = (cl) => { const best = [loc, cl].filter(Boolean).sort((a, b) => (b.n || 0) - (a.n || 0))[0]; if (best) rating = Object.assign(rating, best); cb && cb(); };
    if (!cloudOk()) return done(null);
    let fired = false; const to = setTimeout(() => { fired = true; done(null); }, 2500);
    try { T.tg.CloudStorage.getItem(RKEY, (err, v) => { if (fired) return; clearTimeout(to); done(!err && v ? parseRating(v) : null); }); }
    catch (_) { clearTimeout(to); done(null); }
  }
  function saveRating() {
    rating.n = (rating.n || 0) + 1; const s = JSON.stringify(rating);
    try { localStorage.setItem(RKEY, s); } catch (_) {}
    try { if (cloudOk()) T.tg.CloudStorage.setItem(RKEY, s); } catch (_) {}
  }

  // ---------- звук (синтез, без файлов) ----------
  const Snd = (() => {
    let ac = null, on = true;
    try { on = localStorage.getItem("sniper_mute") !== "1"; } catch (_) {}
    const ctxA = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} } if (ac && ac.state === "suspended") ac.resume(); return ac; };
    function noise(dur, vol, freq, q) {
      const a = ctxA(); if (!a || !on) return;
      const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      const src = a.createBufferSource(); src.buffer = buf;
      const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 3000; f.Q.value = q || 0.7;
      const g = a.createGain(); g.gain.value = vol; src.connect(f); f.connect(g); g.connect(a.destination); src.start();
    }
    function tone(freq, dur, vol, type, slide) {
      const a = ctxA(); if (!a || !on) return;
      const o = a.createOscillator(), g = a.createGain(); o.type = type || "sine"; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
      g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
    }
    return {
      unlock: ctxA,
      get on() { return on; }, toggle() { on = !on; try { localStorage.setItem("sniper_mute", on ? "0" : "1"); } catch (_) {} return on; },
      shot() { noise(0.35, 0.9, 2600); tone(90, 0.25, 0.6, "triangle", 40); },
      far() { noise(0.4, 0.35, 900); },
      thud() { noise(0.15, 0.5, 700, 2); tone(160, 0.12, 0.2, "square", 70); },
      hit() { tone(220, 0.18, 0.5, "sawtooth", 80); noise(0.12, 0.5, 1500); },
      coin() { tone(988, 0.08, 0.25, "square"); setTimeout(() => tone(1319, 0.12, 0.25, "square"), 70); },
      beep(h) { tone(h ? 880 : 520, 0.12, 0.3, "square"); },
      emo() { tone(660, 0.08, 0.2, "triangle", 990); },
      boom() { noise(0.9, 1, 600, 0.9); tone(70, 0.6, 0.7, "sine", 30); },
      hiss() { noise(0.8, 0.35, 5000, 0.4); },
      pin() { tone(1500, 0.05, 0.2, "square"); setTimeout(() => tone(1100, 0.06, 0.2, "square"), 60); }
    };
  })();

  // ---------- кошелёк и улучшения ----------
  // Улучшения действуют только против текущего соперника: новый соперник — всё с нуля, реванш — сохраняем.
  let wallet = { coins: 0, mag: 0, zoom: 0, speed: 0, armor: 0 };
  function resetWallet() { wallet = { coins: 0, mag: 0, zoom: 0, speed: 0, armor: 0 }; me.up = myUp(); }
  function saveWallet() {}
  function loadWallet(cb) { try { localStorage.removeItem("sniper_wallet"); } catch (_) {} try { if (T.tg && T.tg.CloudStorage && T.tg.isVersionAtLeast && T.tg.isVersionAtLeast("6.9")) T.tg.CloudStorage.removeItem("sniper_wallet"); } catch (_) {} cb(); }
  const myUp = () => ({ mag: wallet.mag, zoom: wallet.zoom, speed: wallet.speed, armor: wallet.armor });

  // ---------- экран ----------
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1, S = 1, OX = 0, OY = 0, dprCap = 2, smooth = true, perfBuf = [];
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, dprCap);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    const top = 120, bottom = 150, y0 = 70, y1 = WH;      // показываем мир от y0 до y1
    S = Math.min(W / WW, (H - top - bottom) / (y1 - y0));
    OX = (W - WW * S) / 2; OY = top + ((H - top - bottom) - (y1 - y0) * S) / 2 - y0 * S;
    layerDirty = true;
  }
  window.addEventListener("resize", resize);

  // ---------- карта ----------
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0 || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // локация на раунд: перемешиваем 4 карты по seed матча — у обоих одинаково, за 6 раундов будут все
  function locFor(seed, n) {
    const r = rng(seed * 13 + 5), seq = [];
    while (seq.length < ROUNDS + 4) {
      const a = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (seq.length && a[0] === seq[seq.length - 1]) a.push(a.shift());
      seq.push(...a);
    }
    return seq[n % seq.length];
  }
  function genMap(seed, loc) {
    loc = loc || 0;
    if (loc) return genMap2(seed, loc);
    for (let attempt = 0; attempt < 30; attempt++) {
      const r = rng(seed * 31 + attempt), covers = [];
      let x = 6 + r() * 12, tall = 0;
      for (;;) {
        const t = r(); let c;
        if (t < 0.42) {
          const w = 70 + r() * 36, h = 84 + r() * 14;
          c = { kind: "wall", x, w, h, open: [] };
          if (r() < 0.45) { const ww = 15 + r() * 7; c.open.push({ t: "r", x: x + w * (0.25 + r() * 0.5) - ww / 2, y: G - h + 12, w: ww, h: 26 }); }
        } else if (t < 0.58) c = { kind: "sand", x, w: 60 + r() * 30, h: 44, open: [] };
        else if (t < 0.78) c = { kind: "crate", x, w: 50 + r() * 8, h: 50 + r() * 4, open: [] };
        else c = { kind: "barrel", x, w: 34, h: 56, open: [] };
        if (x + c.w > WW - 4) break;
        if (c.kind === "wall") tall++;
        c.seed = Math.floor(r() * 1e6);
        covers.push(c); x += c.w + 22 + r() * 30;
      }
      if (tall >= 2 && covers.length >= 3) return { covers, deco: r(), seed };
    }
    return genMap(seed + 1);
  }
  // город / лес / снег: свои укрытия. Прямоугольник укрытия (x, w, h) — то, что прячет; рисунок может быть шире (крона, бампер, верхушка ели)
  function genMap2(seed, loc) {
    const id = LOCS[loc].id;
    for (let attempt = 0; attempt < 40; attempt++) {
      const r = rng(seed * 31 + attempt + loc * 7919), covers = [];
      let x = 6 + r() * 12, tall = 0;
      for (;;) {
        const t = r(); let c, pad = 0;
        const win = (w, h, y) => ({ t: "r", x: 0, y, w, h });
        if (id === "city") {
          if (t < 0.4) {
            const w = 66 + r() * 34, h = 86 + r() * 12;
            c = { kind: "bwall", x, w, h, open: [] };
            const nw = r() < 0.35 ? 2 : r() < 0.75 ? 1 : 0;
            for (let k = 0; k < nw; k++) { const ww = 14 + r() * 4, o = win(ww, 18, G - h + 13); o.x = x + (nw === 2 ? w * (k ? 0.72 : 0.28) : w * (0.3 + r() * 0.4)) - ww / 2; c.open.push(o); }
          } else if (t < 0.68) {
            pad = 10; const w = 74 + r() * 16;
            c = { kind: "car", x: x + pad, w, h: 60, open: [], pad, color: Math.floor(r() * 5) };
            const ww = (w - 16) / 2;
            c.open.push({ t: "r", x: c.x + 5, y: G - 57, w: ww, h: 10 }, { t: "r", x: c.x + w / 2 + 3, y: G - 57, w: ww, h: 10 });
          } else if (t < 0.86) c = { kind: "bin", x, w: 48 + r() * 8, h: 54, open: [] };
          else c = { kind: "barrier", x, w: 42 + r() * 10, h: 50, open: [] };
        } else if (id === "forest") {
          if (t < 0.26) {
            c = { kind: "tree", x, w: 34 + r() * 10, h: 108 + r() * 12, open: [] };
            if (r() < 0.3) c.open.push({ t: "c", x: x + c.w / 2 + (r() - 0.5) * 6, y: G - 62 - r() * 6, r: 4.5 });
          } else if (t < 0.4) {
            const w = 64 + r() * 26, h = 82 + r() * 8;
            c = { kind: "fence", x, w, h, open: [] };
            if (r() < 0.6) { const ww = 7; c.open.push({ t: "r", x: x + 8 + Math.floor(r() * ((w - 26) / 11)) * 11 + 2, y: G - h + 10, w: ww, h: 24 }); }
          } else if (t < 0.7) {
            c = { kind: "bush", x, w: 54 + r() * 18, h: 56, open: [] };
            const n = r() < 0.5 ? 1 : 2;
            for (let k = 0; k < n; k++) c.open.push({ t: "c", x: x + 12 + r() * (c.w - 24), y: G - 50 + r() * 10, r: 4 + r() * 1.5 });
          } else if (t < 0.86) c = { kind: "logs", x, w: 60 + r() * 20, h: 50, open: [] };
          else c = { kind: "rock", x, w: 46 + r() * 12, h: 52, open: [] };
        } else {
          if (t < 0.3) c = { kind: "fir", x, w: 36 + r() * 10, h: 100 + r() * 8, open: [] };
          else if (t < 0.52) {
            const w = 68 + r() * 28, h = 84 + r() * 8;
            c = { kind: "swall", x, w, h, open: [] };
            if (r() < 0.55) { const ww = 16; c.open.push({ t: "r", x: x + w * (0.25 + r() * 0.5) - ww / 2, y: G - h + 16, w: ww, h: 10 }); }
          } else if (t < 0.82) c = { kind: "drift", x, w: 60 + r() * 30, h: 54, open: [] };
          else c = { kind: "icecrate", x, w: 50 + r() * 8, h: 52, open: [] };
        }
        if (x + c.w + pad * 2 > WW - 4) break;
        if (c.h >= 72) tall++;
        c.seed = Math.floor(r() * 1e6);
        covers.push(c); x += c.w + pad * 2 + 22 + r() * 30;
      }
      if (tall >= 2 && covers.length >= 3) return { covers, deco: r(), seed, loc };
    }
    return genMap2(seed + 1, loc);
  }

  // ---------- геометрия ----------
  const bodyRect = (p) => { const h = p.st ? 46 : 70; return { x: p.x - 11, y: G - h, w: 22, h }; };
  function inOpening(c, x, y) {
    return c.open.some((o) => o.t === "r" ? x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h
      : (x - o.x) ** 2 + (y - o.y) ** 2 <= o.r * o.r);
  }
  function openHitsRect(o, b) {
    if (o.t === "r") return o.x < b.x + b.w && o.x + o.w > b.x && o.y < b.y + b.h && o.y + o.h > b.y;
    const cx = Math.max(b.x, Math.min(o.x, b.x + b.w)), cy = Math.max(b.y, Math.min(o.y, b.y + b.h));
    return (o.x - cx) ** 2 + (o.y - cy) ** 2 <= o.r * o.r;
  }
  function coverState(p) {
    const b = bodyRect(p);
    const c = map.covers.find((c) => c.x <= b.x && b.x + b.w <= c.x + c.w && G - c.h <= b.y);
    if (!c) return { hidden: false, peek: [] };
    return { hidden: true, peek: c.open.filter((o) => openHitsRect(o, b)), cover: c };
  }
  const visible = (p) => { const s = coverState(p); return !s.hidden || s.peek.length > 0; };

  // ---------- состояние ----------
  let mode = null, room = null, map = null, maps = null, layerDirty = true, shake = 0, kick = 0, emoT = 0;
  let me = { name: "Ты", up: myUp() }, opp = { name: "Друг", up: { mag: 0, zoom: 0, speed: 0, armor: 0 } };
  let match = null, R = null;            // матч и текущий раунд
  let phase = "menu";                    // menu | room | prep | live | over | end
  let pos = { x: 180, st: 0, dir: 1, walk: 0 }, remote = { x: 180, st: 0, dir: 1, walk: 0, tx: 180, moving: false };
  let aim = { x: 180, y: 190 }, remoteAim = { x: 180, y: 190, tx: 180, ty: 190 };
  let camX = 180, keys = { l: false, r: false }, fx = [], sendT = 0, aimSendT = 0, now = 0;
  let rematch = { me: false, opp: false };
  let hist = [], rbuf = [], stT = 0;
  const INTERP = 0.12;

  // ---------- рисование ----------
  const layer = document.createElement("canvas"); const LR = 4;
  layer.width = WW * LR; layer.height = WH * LR; const lctx = layer.getContext("2d");

  function drawBricks(g, c, P) {
    const r = rng(c.seed), y = G - c.h, TH = THEMES[map.theme || 0];
    P = P || { mortar: TH.mortar, bw: 17, bh: 8.5, col: () => { const l = 38 + r() * 14, h = TH.brick + r() * 8; return `hsl(${h},${38 + r() * 12}%,${l}%)`; }, cap: ["#6e4a33", "#a0745a"], vines: true };
    g.fillStyle = P.mortar; g.fillRect(c.x, y, c.w, c.h);
    const bh = P.bh, bw = P.bw;
    for (let row = 0, yy = y + 1; yy < G; yy += bh, row++) {
      for (let xx = c.x - (row % 2 ? bw / 2 : 0); xx < c.x + c.w; xx += bw) {
        const x0 = Math.max(c.x + 0.8, xx + 0.8), x1 = Math.min(c.x + c.w - 0.8, xx + bw - 0.8);
        if (x1 <= x0) continue;
        g.fillStyle = P.col(r);
        g.fillRect(x0, yy + 0.8, x1 - x0, Math.min(bh - 1.6, G - yy - 0.8));
        g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(x0, yy + 0.8, x1 - x0, 1.2);
      }
    }
    g.fillStyle = P.cap[0]; g.fillRect(c.x - 3, y - 5, c.w + 6, 6);
    g.fillStyle = P.cap[1]; g.fillRect(c.x - 3, y - 5, c.w + 6, 2);
    if (!P.vines) return;
    // плющ
    const vines = 1 + Math.floor(r() * 3);
    for (let v = 0; v < vines; v++) {
      let vx = c.x + 8 + r() * (c.w - 16), vy = y - 2;
      const len = 20 + r() * (c.h * 0.6);
      g.strokeStyle = "#3d6b2a"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(vx, vy);
      const pts = [];
      for (let k = 0; k < len; k += 4) { vx += (r() - 0.5) * 5; vy += 4; g.lineTo(vx, vy); pts.push([vx, vy]); }
      g.stroke();
      for (const [px, py] of pts) {
        if (r() < 0.75) { g.fillStyle = r() < 0.5 ? "#5b9a3a" : "#4b8a2f"; g.beginPath(); g.ellipse(px + (r() - 0.5) * 6, py, 2.8, 1.8, r() * 3, 0, 7); g.fill(); }
      }
    }
  }
  function drawLayer() {
    lctx.setTransform(LR, 0, 0, LR, 0, 0); lctx.clearRect(0, 0, WW, WH);
    lctx.globalCompositeOperation = "source-over";
    for (const c of map.covers) {
      const y = G - c.h;
      if (drawCover2(lctx, c)) continue;
      if (c.kind === "wall") drawBricks(lctx, c);
      else if (c.kind === "sand") {
        const r = rng(c.seed);
        for (let row = 0; row < 4; row++) for (let k = 0; k < c.w / 18 + 1; k++) {
          const bx = c.x + k * 18 - (row % 2 ? 9 : 0), by = G - 11 - row * 11;
          if (bx < c.x - 4 || bx + 18 > c.x + c.w + 4) continue;
          lctx.fillStyle = `hsl(42,${30 + r() * 10}%,${62 + r() * 8}%)`; lctx.strokeStyle = "#8c7444"; lctx.lineWidth = 1;
          lctx.beginPath(); lctx.roundRect(bx, by, 19, 12, 5); lctx.fill(); lctx.stroke();
        }
        c.h = 44;
      } else if (c.kind === "crate") {
        lctx.fillStyle = "#b9803f"; lctx.fillRect(c.x, y, c.w, c.h);
        lctx.fillStyle = "#a06b31"; for (let k = 0; k < 4; k++) lctx.fillRect(c.x, y + k * c.h / 4, c.w, 1.5);
        lctx.strokeStyle = "#6b4520"; lctx.lineWidth = 4; lctx.strokeRect(c.x + 2, y + 2, c.w - 4, c.h - 4);
        lctx.beginPath(); lctx.moveTo(c.x + 4, y + 4); lctx.lineTo(c.x + c.w - 4, y + c.h - 4); lctx.stroke();
      } else {
        const gr = lctx.createLinearGradient(c.x, 0, c.x + c.w, 0);
        gr.addColorStop(0, "#2e5a3a"); gr.addColorStop(0.45, "#4f8f5c"); gr.addColorStop(1, "#24452d");
        lctx.fillStyle = gr; lctx.beginPath(); lctx.roundRect(c.x, y, c.w, c.h, 4); lctx.fill();
        lctx.fillStyle = "rgba(0,0,0,.25)"; lctx.fillRect(c.x, y + 13, c.w, 3); lctx.fillRect(c.x, y + c.h - 16, c.w, 3);
        lctx.save(); lctx.translate(c.x + c.w / 2, y + c.h / 2); lctx.rotate(Math.PI / 4);
        lctx.fillStyle = "#fff"; lctx.fillRect(-7, -7, 14, 14); lctx.fillStyle = "#e5484d"; lctx.fillRect(-5, -5, 10, 10); lctx.restore();
      }
    }
    lctx.globalCompositeOperation = "destination-out";
    lctx.fillStyle = "#000";                              // непрозрачная заливка, иначе дырка вырезается частично
    for (const c of map.covers) for (const o of c.open) {
      lctx.beginPath(); if (o.t === "r") lctx.rect(o.x, o.y, o.w, o.h); else lctx.arc(o.x, o.y, o.r, 0, 7); lctx.fill();
    }
    lctx.globalCompositeOperation = "source-over";
    for (const c of map.covers) for (const o of c.open) if (o.t === "c") {
      if (c.kind === "bush") continue;
      lctx.strokeStyle = "rgba(30,15,5,.75)"; lctx.lineWidth = 1.6; lctx.beginPath(); lctx.arc(o.x, o.y, o.r + 0.7, 0, 7); lctx.stroke();
      lctx.strokeStyle = "rgba(255,230,200,.35)"; lctx.lineWidth = 1; lctx.beginPath(); lctx.arc(o.x, o.y, o.r + 2.2, 0.5, 2.2); lctx.stroke();
    } else if (c.kind === "car") {                       // стёкла машины: тонированные, но сквозь них видно
      lctx.fillStyle = "rgba(160,210,240,.28)"; lctx.fillRect(o.x, o.y, o.w, o.h);
      lctx.strokeStyle = "rgba(255,255,255,.55)"; lctx.lineWidth = 1; lctx.beginPath(); lctx.moveTo(o.x + 2, o.y + o.h - 2); lctx.lineTo(o.x + 6, o.y + 2); lctx.stroke();
      lctx.strokeStyle = "#1c1f24"; lctx.lineWidth = 1.4; lctx.strokeRect(o.x, o.y, o.w, o.h);
    } else if (c.kind === "bwall" || c.kind === "swall") {   // оконные рамы
      const ice = c.kind === "swall";
      lctx.strokeStyle = ice ? "#7fa4c2" : "#2b2f38"; lctx.lineWidth = 2; lctx.strokeRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2);
      lctx.fillStyle = ice ? "#ffffff" : "#c9ccd2"; lctx.fillRect(o.x - 3, o.y + o.h + 1, o.w + 6, 2.5);
      if (!ice) { lctx.strokeStyle = "rgba(43,47,56,.8)"; lctx.lineWidth = 1; lctx.beginPath(); lctx.moveTo(o.x + o.w / 2, o.y); lctx.lineTo(o.x + o.w / 2, o.y + o.h); lctx.stroke(); }
    }
    layerDirty = false;
  }

  // укрытия города, леса и снега. Всё внутри прямоугольника (c.x, G − c.h, c.w, c.h) должно быть залито — иначе «спрятанного» видно
  function drawCover2(g, c) {
    const x = c.x, w = c.w, h = c.h, y = G - h, r = rng(c.seed + 11);
    switch (c.kind) {
      case "bwall": {
        drawBricks(g, c, { mortar: "#463935", bw: 17, bh: 8.5, col: (q) => `hsl(${6 + q() * 12},${28 + q() * 16}%,${30 + q() * 13}%)`, cap: ["#555c69", "#9aa3b2"], vines: false });
        // заколоченное окно и вывеска/граффити — для живости
        if (r() < 0.6) { const wx = x + 8 + r() * (w - 30); g.fillStyle = "#2a3346"; g.fillRect(wx, G - 42, 14, 15); g.fillStyle = "rgba(140,190,255,.35)"; g.fillRect(wx + 1.5, G - 40.5, 5, 5); g.strokeStyle = "#c9ccd2"; g.lineWidth = 1.5; g.strokeRect(wx, G - 42, 14, 15); }
        if (r() < 0.5) { g.strokeStyle = ["#ff5fa2", "#4ee1ff", "#ffe14d"][Math.floor(r() * 3)]; g.lineWidth = 2.2; g.beginPath(); let gx = x + 6 + r() * (w - 40); g.moveTo(gx, G - 18); for (let k = 0; k < 6; k++) { gx += 5; g.lineTo(gx, G - 18 + (k % 2 ? -7 : 0)); } g.stroke(); }
        g.fillStyle = "#3a3f4a"; g.fillRect(x, G - 4, w, 4);
        return true;
      }
      case "car": {
        const cols = ["#e5484d", "#2f7cf6", "#f2c94c", "#3fb27f", "#e9e9ee"], col = cols[c.color || 0];
        const x0 = x - c.pad, x1 = x + w + c.pad;
        g.fillStyle = "#1f2329"; g.fillRect(x, G - 14, w, 14);
        g.fillStyle = col; g.beginPath(); g.roundRect(x0, G - 38, x1 - x0, 27, 7); g.fill();
        g.beginPath(); g.roundRect(x, G - 60, w, 28, [9, 9, 0, 0]); g.fill();
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x0, G - 22, x1 - x0, 3); g.fillRect(x + w / 2 - 1, G - 58, 2, 46);
        g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(x0 + 4, G - 36, x1 - x0 - 8, 2);
        g.fillStyle = "#ffe08a"; g.fillRect(x1 - 4, G - 33, 4, 5); g.fillStyle = "#ff4d4d"; g.fillRect(x0, G - 33, 3, 5);
        g.fillStyle = "#2b2b2b"; g.fillRect(x + w / 2 - 12, G - 30, 7, 2); g.fillRect(x + w / 2 + 6, G - 30, 7, 2);
        for (const wx of [x0 + 14, x1 - 14]) { g.fillStyle = "#15171b"; g.beginPath(); g.arc(wx, G - 9, 9.5, 0, 7); g.fill(); g.fillStyle = "#9aa0aa"; g.beginPath(); g.arc(wx, G - 9, 4, 0, 7); g.fill(); }
        return true;
      }
      case "bin": {
        g.fillStyle = "#1c2a22"; g.fillRect(x, G - 6, w, 6);
        g.fillStyle = "#2f7a4f"; g.fillRect(x, y + 6, w, h - 10);
        g.fillStyle = "rgba(0,0,0,.2)"; for (let k = 1; k < 5; k++) g.fillRect(x + k * w / 5 - 1, y + 12, 2, h - 20);
        g.fillStyle = "#245e3d"; g.fillRect(x - 3, y, w + 6, 8); g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(x - 3, y, w + 6, 2);
        g.fillStyle = "#e9e9ee"; g.fillRect(x + w / 2 - 9, y + 20, 18, 7); g.fillStyle = "#2f7a4f"; g.font = "bold 6px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("♻", x + w / 2, y + 23.7);
        for (const wx of [x + 6, x + w - 6]) { g.fillStyle = "#111"; g.beginPath(); g.arc(wx, G - 3, 3.5, 0, 7); g.fill(); }
        return true;
      }
      case "barrier": {
        g.fillStyle = "#b9bcc2"; g.fillRect(x, y, w, h);
        g.fillStyle = "#9a9ea6"; g.fillRect(x, y + h - 14, w, 14); g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(x, y, w, 2);
        g.save(); g.beginPath(); g.rect(x, y + 8, w, 12); g.clip();
        for (let k = -2; k < w / 8 + 2; k++) { g.fillStyle = k % 2 ? "#e5484d" : "#f4f4f4"; g.beginPath(); g.moveTo(x + k * 8, y + 20); g.lineTo(x + k * 8 + 8, y + 20); g.lineTo(x + k * 8 + 20, y + 8); g.lineTo(x + k * 8 + 12, y + 8); g.fill(); }
        g.restore();
        return true;
      }
      case "tree": {
        const cx = x + w / 2;
        g.fillStyle = "#6b4426"; g.beginPath(); g.moveTo(x - 7, G); g.lineTo(x, G - 14); g.lineTo(x + w, G - 14); g.lineTo(x + w + 7, G); g.fill();
        g.fillStyle = "#7a4e2c"; g.fillRect(x, y + 10, w, h - 10);
        g.fillStyle = "#5c3a20"; g.fillRect(x + w * 0.62, y + 10, w * 0.38, h - 10);
        g.strokeStyle = "rgba(40,22,10,.55)"; g.lineWidth = 1.2;
        for (let k = 0; k < 5; k++) { let bx = x + 4 + r() * (w - 8), by = y + 20 + r() * 20; g.beginPath(); g.moveTo(bx, by); for (let j = 0; j < 5; j++) { bx += (r() - 0.5) * 3; by += 12; g.lineTo(bx, Math.min(G - 2, by)); } g.stroke(); }
        const cr = 22 + w * 0.25, cy = y + 4;
        const blobs = [[-1.1, 0.1, 0.9], [1.05, 0.05, 0.85], [0, -0.75, 1.1], [-0.55, 0.45, 0.8], [0.6, 0.45, 0.8], [0, 0.1, 0.9]];
        for (const [bx, by, br] of blobs) { g.fillStyle = "#2f6b33"; g.beginPath(); g.arc(cx + bx * cr, cy + by * cr, br * cr, 0, 7); g.fill(); }
        for (const [bx, by, br] of blobs) { g.fillStyle = "#3f8a3f"; g.beginPath(); g.arc(cx + bx * cr - 3, cy + by * cr - 4, br * cr * 0.72, 0, 7); g.fill(); }
        g.fillStyle = "#5aa84f"; for (let k = 0; k < 10; k++) { g.beginPath(); g.arc(cx + (r() - 0.5) * cr * 2.6, cy + (r() - 0.8) * cr * 1.4, 2 + r() * 3, 0, 7); g.fill(); }
        return true;
      }
      case "fence": {
        g.fillStyle = "#4a2f1a"; g.fillRect(x, y, w, h);
        for (let px = x, k = 0; px < x + w; px += 11, k++) {
          const pw = Math.min(10, x + w - px);
          g.fillStyle = `hsl(28,${35 + r() * 12}%,${34 + r() * 10}%)`; g.fillRect(px, y, pw, h);
          g.beginPath(); g.moveTo(px, y); g.lineTo(px + pw / 2, y - 7); g.lineTo(px + pw, y); g.fill();
          g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(px + pw - 2, y, 2, h);
        }
        g.fillStyle = "#5a391f"; g.fillRect(x - 2, y + 14, w + 4, 6); g.fillRect(x - 2, G - 22, w + 4, 6);
        g.fillStyle = "#222"; for (let px = x + 5; px < x + w; px += 11) { g.fillRect(px, y + 16, 1.5, 1.5); g.fillRect(px, G - 20, 1.5, 1.5); }
        return true;
      }
      case "bush": {
        g.fillStyle = "#2a5e2a"; g.fillRect(x, y + 8, w, h - 8);
        const n = Math.max(3, Math.round(w / 16));
        for (let k = 0; k <= n; k++) { g.fillStyle = "#2a5e2a"; g.beginPath(); g.arc(x + k * w / n, y + 11, 11 + r() * 4, 0, 7); g.fill(); }
        for (const sx of [x, x + w]) { g.beginPath(); g.arc(sx, G - 18, 14, 0, 7); g.fill(); }
        for (let k = 0; k < n + 2; k++) { g.fillStyle = r() < 0.5 ? "#3d7d34" : "#4a9140"; g.beginPath(); g.arc(x + r() * w, y + 8 + r() * (h - 18), 7 + r() * 5, 0, 7); g.fill(); }
        for (let k = 0; k < 6; k++) { g.fillStyle = ["#ff6b8a", "#fff", "#ffd34d"][k % 3]; g.beginPath(); g.arc(x + 5 + r() * (w - 10), y + 4 + r() * (h - 14), 1.5, 0, 7); g.fill(); }
        return true;
      }
      case "logs": {
        const lh = h / 4;
        for (let k = 0; k < 4; k++) {
          const ly = G - (k + 1) * lh, off = (r() - 0.5) * 6;
          g.fillStyle = k % 2 ? "#7a5232" : "#8a5d38"; g.fillRect(x + Math.min(0, off), ly, w + Math.abs(off), lh);
          g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(x, ly + lh - 2, w, 2);
          g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(x, ly + 1.5, w, 1.5);
          const ex = x + w + Math.max(0, off);
          g.fillStyle = "#d9b27a"; g.beginPath(); g.ellipse(ex, ly + lh / 2, 4, lh / 2, 0, 0, 7); g.fill();
          g.strokeStyle = "#a07c4e"; g.lineWidth = 0.8; g.beginPath(); g.ellipse(ex, ly + lh / 2, 2, lh / 4, 0, 0, 7); g.stroke();
        }
        g.fillStyle = "#4f8f3a"; g.beginPath(); g.ellipse(x + w * 0.3, y + 1, 9, 3, 0, 0, 7); g.fill();
        return true;
      }
      case "rock": {
        g.fillStyle = "#6f747c"; g.beginPath(); g.roundRect(x - 6, y - 6, w + 12, h + 6, 18); g.fill();
        g.fillStyle = "#5a5f67"; g.beginPath(); g.roundRect(x - 6, G - 18, w + 12, 18, [0, 0, 6, 6]); g.fill();
        g.fillStyle = "#8b9099"; g.beginPath(); g.ellipse(x + w * 0.35, y + 6, w * 0.28, 7, -0.2, 0, 7); g.fill();
        g.strokeStyle = "rgba(30,30,35,.5)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x + w * 0.6, y + 2); g.lineTo(x + w * 0.52, y + 18); g.lineTo(x + w * 0.66, y + 30); g.stroke();
        g.fillStyle = "#4f8f3a"; g.beginPath(); g.ellipse(x + w * 0.7, y - 3, 10, 3.5, 0.1, 0, 7); g.fill();
        return true;
      }
      case "fir": {
        const cx = x + w / 2, N = 5, s = h / N, L = s * 2.25;
        g.fillStyle = "#5c3a20"; g.fillRect(cx - 5, G - 12, 10, 12);
        g.fillStyle = "#1f5a43"; g.fillRect(x, y, w, h - 4);
        for (let k = 0; k < N; k++) {
          const yb = G - 4 - k * s, hw = w * (2.3 - k * 0.1) / 2;
          g.fillStyle = "#1f5a43"; g.beginPath(); g.moveTo(cx - hw, yb); g.lineTo(cx, yb - L); g.lineTo(cx + hw, yb); g.fill();
          g.fillStyle = "#2c7556"; g.beginPath(); g.moveTo(cx - hw, yb); g.lineTo(cx, yb - L); g.lineTo(cx - hw * 0.25, yb); g.fill();
          g.fillStyle = "#f4f8fc";                              // снег на лапах
          g.beginPath(); g.moveTo(cx - hw, yb); g.lineTo(cx - hw * 0.45, yb - L * 0.25); g.lineTo(cx - hw * 0.1, yb - 2); g.lineTo(cx + hw * 0.4, yb - L * 0.2); g.lineTo(cx + hw, yb); g.lineTo(cx + hw * 0.4, yb - L * 0.1); g.lineTo(cx - hw * 0.1, yb + 0.5); g.lineTo(cx - hw * 0.45, yb - L * 0.15); g.fill();
        }
        g.fillStyle = "#f4f8fc"; g.beginPath(); g.moveTo(cx - 7, G - 4 - (N - 1) * s - L + 12); g.lineTo(cx, G - 4 - (N - 1) * s - L); g.lineTo(cx + 7, G - 4 - (N - 1) * s - L + 12); g.fill();
        g.fillStyle = "#e9f1f8"; g.beginPath(); g.ellipse(cx, G, w / 2 + 14, 6, 0, 0, 7); g.fill();
        return true;
      }
      case "swall": {
        drawBricks(g, c, { mortar: "#a9c3d8", bw: 22, bh: 11, col: (q) => `hsl(${200 + q() * 12},${24 + q() * 18}%,${83 + q() * 11}%)`, cap: ["#dfeaf4", "#ffffff"], vines: false });
        g.fillStyle = "#ffffff"; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + (k + 0.5) * w / 4, y - 5, w / 7, 4, 0, 0, 7); g.fill(); }
        return true;
      }
      case "drift": {
        const gr = g.createLinearGradient(0, y - 8, 0, G); gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#c8dcec");
        g.fillStyle = gr; g.fillRect(x, y + 6, w, h - 6);
        for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + (k + 0.5) * w / 3, y + 8, w / 4.2, 10 + r() * 3, 0, 0, 7); g.fill(); }
        g.beginPath(); g.ellipse(x, G - 16, 14, 16, 0, 0, 7); g.ellipse(x + w, G - 16, 14, 16, 0, 0, 7); g.fill();
        g.strokeStyle = "rgba(120,160,200,.45)"; g.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + 10 + r() * (w - 20), y + 22 + r() * 20, 8 + r() * 6, 0.3, 2.6); g.stroke(); }
        g.fillStyle = "#fff"; for (let k = 0; k < 5; k++) g.fillRect(x + r() * w, y + 4 + r() * 30, 1.5, 1.5);
        return true;
      }
      case "icecrate": {
        g.fillStyle = "#9a7448"; g.fillRect(x, y, w, h);
        g.fillStyle = "#86633b"; for (let k = 0; k < 4; k++) g.fillRect(x, y + k * h / 4, w, 1.5);
        g.strokeStyle = "#5e4426"; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
        g.beginPath(); g.moveTo(x + 4, y + 4); g.lineTo(x + w - 4, y + h - 4); g.stroke();
        g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(x + w / 2, y, w / 2 + 4, 6, 0, 0, 7); g.fill();
        g.fillStyle = "#d8ecfa"; for (let k = 0; k < 4; k++) { const ix = x + 6 + k * (w - 12) / 3; g.beginPath(); g.moveTo(ix - 2, y + 3); g.lineTo(ix, y + 9 + r() * 5); g.lineTo(ix + 2, y + 3); g.fill(); }
        return true;
      }
    }
    return false;
  }

  // фон города/леса/снега: неподвижное рисуется один раз на карту в отдельный холст, в кадре — только картинка + анимация
  const PAL = [null,
    { sky: ["#4f6fb8", "#f3b98f"], ground: "#7c8189", far: "#8a93b8" },
    { sky: ["#6fb6ea", "#d8f1ff"], ground: "#3a6f28", far: "#7fb98a" },
    { sky: ["#93abc4", "#e8eff6"], ground: "#c3d6e6", far: "#8aa0b8" }];
  const BGX = -120, BGY = -100, BGW = 600, BGH = 600, BR = 2;
  const bgc = document.createElement("canvas"); bgc.width = BGW * BR; bgc.height = BGH * BR;
  const bctx = bgc.getContext("2d"); let bgMap = null;
  function buildBg() {
    const g = bctx, P = PAL[map.loc], id = LOCS[map.loc].id, r = rng(map.seed + 3);
    g.setTransform(BR, 0, 0, BR, -BGX * BR, -BGY * BR);
    const sky = g.createLinearGradient(0, BGY, 0, 176); sky.addColorStop(0, P.sky[0]); sky.addColorStop(1, P.sky[1]);
    g.fillStyle = sky; g.fillRect(BGX, BGY, BGW, 176 - BGY);
    const ix = 60 + map.deco * 240;
    map.nest = { x: ix, y: 120 };
    if (id === "city") {
      g.fillStyle = "rgba(255,226,168,.85)"; g.beginPath(); g.arc(360 - ix * 0.6, 118, 16, 0, 7); g.fill();
      g.fillStyle = P.far;
      for (let bx = BGX; bx < BGX + BGW;) { const bw = 20 + r() * 26, top = 96 + r() * 40; g.fillRect(bx, top, bw, 176 - top); bx += bw + 2; }
      for (let bx = BGX + 10; bx < BGX + BGW;) {
        const bw = 26 + r() * 30, top = 84 + r() * 50;
        if (Math.abs(bx + bw / 2 - ix) < 40) { bx += bw + 4; continue; }
        g.fillStyle = r() < 0.5 ? "#46506e" : "#3e4762"; g.fillRect(bx, top, bw, 176 - top);
        for (let wy = top + 5; wy < 168; wy += 9) for (let wx = bx + 4; wx < bx + bw - 5; wx += 7) { g.fillStyle = r() < 0.32 ? "#ffd76a" : "#333a52"; g.fillRect(wx, wy, 3.5, 4.5); }
        if (r() < 0.3) { g.fillStyle = "#3e4762"; g.fillRect(bx + bw / 2 - 1, top - 10, 2, 10); }
        bx += bw + 4 + r() * 8;
      }
      g.fillStyle = "#2d3348"; g.fillRect(ix - 20, 76, 40, 100);                   // дом снайпера
      for (let wy = 84; wy < 170; wy += 12) for (let wx = ix - 15; wx < ix + 14; wx += 10) { g.fillStyle = wy === 108 && wx > ix - 8 && wx < ix + 2 ? "#0b0e16" : r() < 0.25 ? "#ffd76a" : "#252a3c"; g.fillRect(wx, wy, 6, 7); }
      map.nest = { x: ix - 2, y: 112 };
      g.fillStyle = "#3b3f46"; g.fillRect(BGX, 176, BGW, 38);                     // дорога позади укрытий
      g.fillStyle = "rgba(255,255,255,.55)"; for (let lx = BGX; lx < BGX + BGW; lx += 34) g.fillRect(lx, 194, 18, 2);
      g.fillStyle = "#6b7078"; g.fillRect(BGX, 212, BGW, 4);
      const sw = g.createLinearGradient(0, 216, 0, 500); sw.addColorStop(0, "#a3a8b0"); sw.addColorStop(1, "#7c8189");
      g.fillStyle = sw; g.fillRect(BGX, 216, BGW, BGY + BGH - 216);
      g.strokeStyle = "rgba(60,64,72,.35)"; g.lineWidth = 1;
      for (let ty = 222; ty < 500; ty += 14) { g.beginPath(); g.moveTo(BGX, ty); g.lineTo(BGX + BGW, ty); g.stroke(); }
      for (let tx = BGX; tx < BGX + BGW; tx += 22) { g.beginPath(); g.moveTo(tx, 216); g.lineTo(tx + (tx - 180) * 1.0, 500); g.stroke(); }
      g.fillStyle = "#3a3f47"; g.beginPath(); g.ellipse(80 + r() * 200, 268, 14, 4, 0, 0, 7); g.fill();
      for (let k = 0; k < 4; k++) { const lx = 20 + k * 100 + r() * 30; g.fillStyle = "#2d3138"; g.fillRect(lx, 150, 2.5, 64); g.fillRect(lx, 150, 10, 2.5); g.fillStyle = "#ffe9a8"; g.fillRect(lx + 7, 152, 5, 2.5); }
    } else if (id === "forest") {
      g.fillStyle = "rgba(255,250,210,.9)"; g.beginPath(); g.arc(360 - ix * 0.6, 60, 14, 0, 7); g.fill();
      g.fillStyle = P.far; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(BGX + k * 140 + r() * 40, 178, 110, 40 + r() * 25, 0, 0, 7); g.fill(); }
      g.fillStyle = "#5c9c62"; for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(BGX + k * 110 + r() * 40, 180, 80, 22 + r() * 14, 0, 0, 7); g.fill(); }
      for (let tx = BGX; tx < BGX + BGW; tx += 9 + r() * 8) { const th = 18 + r() * 22; g.fillStyle = r() < 0.5 ? "#3c7a48" : "#2f6640"; g.beginPath(); g.moveTo(tx - 7, 178); g.lineTo(tx, 178 - th); g.lineTo(tx + 7, 178); g.fill(); }
      g.strokeStyle = "#5b3b20"; g.lineWidth = 2;                                 // вышка снайпера
      g.beginPath(); g.moveTo(ix - 12, 178); g.lineTo(ix - 7, 122); g.moveTo(ix + 12, 178); g.lineTo(ix + 7, 122); g.moveTo(ix - 11, 160); g.lineTo(ix + 10, 140); g.moveTo(ix + 11, 160); g.lineTo(ix - 10, 140); g.stroke();
      g.fillStyle = "#7a5232"; g.fillRect(ix - 11, 110, 22, 13); g.fillStyle = "#0e140e"; g.fillRect(ix - 7, 113, 14, 5);
      g.fillStyle = "#5b3b20"; g.beginPath(); g.moveTo(ix - 14, 111); g.lineTo(ix, 101); g.lineTo(ix + 14, 111); g.fill();
      map.nest = { x: ix, y: 115.5 };
      const gr = g.createLinearGradient(0, 176, 0, 500); gr.addColorStop(0, "#6fae4a"); gr.addColorStop(1, "#3a6f28");
      g.fillStyle = gr; g.fillRect(BGX, 176, BGW, BGY + BGH - 176);
      g.fillStyle = "rgba(160,124,78,.55)"; g.beginPath(); g.ellipse(180, 252, 300, 9, 0, 0, 7); g.fill();
      g.strokeStyle = "#2f6b24"; g.lineWidth = 1.2;
      for (let k = 0; k < 110; k++) { const gx = BGX + r() * BGW, gy = 182 + r() * 210; g.beginPath(); g.moveTo(gx - 2, gy); g.lineTo(gx - 3, gy - 4); g.moveTo(gx, gy); g.lineTo(gx, gy - 5); g.moveTo(gx + 2, gy); g.lineTo(gx + 3, gy - 4); g.stroke(); }
      for (let k = 0; k < 30; k++) { g.fillStyle = ["#fff", "#ffd34d", "#ff8fb1"][k % 3]; g.beginPath(); g.arc(BGX + r() * BGW, 186 + r() * 200, 1.4, 0, 7); g.fill(); }
      for (let k = 0; k < 3; k++) { const mx = 20 + r() * 320, my = 262 + r() * 30; g.fillStyle = "#f2efe6"; g.fillRect(mx - 1, my - 4, 2, 4); g.fillStyle = "#e5484d"; g.beginPath(); g.arc(mx, my - 4, 3.5, Math.PI, 0); g.fill(); }
    } else {
      for (let k = 0; k < 6; k++) {
        const mx = BGX + k * 110 + r() * 50, mh = 50 + r() * 45, mw = 70 + r() * 40;
        g.fillStyle = k % 2 ? "#7f95ae" : P.far; g.beginPath(); g.moveTo(mx - mw, 178); g.lineTo(mx, 178 - mh); g.lineTo(mx + mw, 178); g.fill();
        g.fillStyle = "#f4f8fc"; g.beginPath(); g.moveTo(mx - mw * 0.32, 178 - mh * 0.68); g.lineTo(mx, 178 - mh); g.lineTo(mx + mw * 0.32, 178 - mh * 0.68); g.lineTo(mx + mw * 0.12, 178 - mh * 0.6); g.lineTo(mx - mw * 0.05, 178 - mh * 0.72); g.fill();
      }
      for (let tx = BGX; tx < BGX + BGW; tx += 10 + r() * 14) { const th = 14 + r() * 14; g.fillStyle = "#4f6f78"; g.beginPath(); g.moveTo(tx - 5, 179); g.lineTo(tx, 179 - th); g.lineTo(tx + 5, 179); g.fill(); }
      g.fillStyle = "#e9f1f8"; g.beginPath(); g.ellipse(ix, 140, 34, 12, 0, Math.PI, 0); g.fill();   // укрытие снайпера на склоне
      g.fillStyle = "#6a4a2e"; g.fillRect(ix - 13, 122, 26, 14); g.fillStyle = "#0b0f14"; g.fillRect(ix - 8, 126, 12, 5);
      g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(ix, 122, 17, 4, 0, 0, 7); g.fill();
      map.nest = { x: ix - 2, y: 128.5 };
      const gr = g.createLinearGradient(0, 176, 0, 500); gr.addColorStop(0, "#f4f8fc"); gr.addColorStop(1, "#c3d6e6");
      g.fillStyle = gr; g.fillRect(BGX, 176, BGW, BGY + BGH - 176);
      g.fillStyle = "rgba(150,180,210,.35)"; for (let k = 0; k < 40; k++) { g.beginPath(); g.ellipse(BGX + r() * BGW, 186 + r() * 200, 6 + r() * 14, 1.5 + r() * 2, 0, 0, 7); g.fill(); }
      g.fillStyle = "rgba(110,140,175,.5)"; for (let k = 0; k < 14; k++) { const fx0 = 20 + r() * 320, fy = 196 + r() * 26; g.beginPath(); g.ellipse(fx0, fy, 1.6, 1, 0, 0, 7); g.ellipse(fx0 + 5, fy + 1.2, 1.6, 1, 0, 0, 7); g.fill(); }
    }
    g.fillStyle = "rgba(0,0,0,.16)";
    for (const c of map.covers) { g.beginPath(); g.ellipse(c.x + c.w / 2 + 4, G + 2, c.w / 2 + 6 + (c.pad || 0), 4, 0, 0, 7); g.fill(); }
    bgMap = map;
  }
  const FLAKES = Array.from({ length: 90 }, (_, i) => { const q = rng(900 + i); return [q() * 600 - 120, q() * 560, 14 + q() * 16, 0.9 + q() * 1.4, q() * 6]; });
  const LEAVES = Array.from({ length: 12 }, (_, i) => { const q = rng(500 + i); return [q() * 520 - 80, q() * 300, 9 + q() * 8, q() * 6, i % 3]; });
  function drawBg2(t) {
    if (bgMap !== map) buildBg();
    const P = PAL[map.loc];
    // запасная заливка — только там, куда не достаёт заготовленная картинка (лишний проход по экрану дорог на слабых телефонах)
    const bx1 = BGX + BGW, by1 = BGY + BGH;
    if (vis.x0 < BGX || vis.y0 < BGY || vis.x1 > bx1 || vis.y1 > by1) {
      ctx.fillStyle = P.sky[0]; ctx.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, Math.max(0, BGY + 1 - vis.y0));
      ctx.fillStyle = P.ground; ctx.fillRect(vis.x0, by1 - 1, vis.x1 - vis.x0, Math.max(0, vis.y1 - by1 + 1));
      for (const [a, b] of [[vis.x0, BGX + 1], [bx1 - 1, vis.x1]]) if (b > a) {
        ctx.fillStyle = P.sky[1]; ctx.fillRect(a, BGY, b - a, 176 - BGY);
        ctx.fillStyle = P.ground; ctx.fillRect(a, 176, b - a, BGH - 276);
      }
    }
    ctx.imageSmoothingEnabled = smooth; ctx.drawImage(bgc, BGX, BGY, BGW, BGH); ctx.imageSmoothingEnabled = true;
    if (map.loc !== 3) {
      ctx.fillStyle = "rgba(255,255,255,.8)";
      for (let i = 0; i < 3; i++) { const x = ((i * 150 + t * 3) % 480) - 60, y = 30 + i * 14; ctx.beginPath(); ctx.ellipse(x, y, 24, 6, 0, 0, 7); ctx.ellipse(x + 13, y - 4, 13, 6, 0, 0, 7); ctx.fill(); }
    }
    if (phase === "live" && map.nest && Math.sin(t * 5) > 0.6) { ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(map.nest.x, map.nest.y, 1.6, 0, 7); ctx.fill(); }
  }
  function drawWeather(t) {                     // снегопад / листопад поверх всего — дешёвые прямоугольники и эллипсы
    if (!map || !map.loc) return;
    if (map.loc === 3) {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      for (const f of FLAKES) {
        const y = (f[1] + t * f[2]) % 560 - 100, x = f[0] + Math.sin(t * 0.8 + f[4]) * 6;
        ctx.fillRect(x, y, f[3], f[3]);
      }
    } else if (map.loc === 2) {
      for (const f of LEAVES) {
        const y = (f[1] + t * f[2]) % 360 - 40, x = f[0] + Math.sin(t * 1.2 + f[3]) * 10;
        ctx.fillStyle = ["#e8a33a", "#d9692b", "#c9b03a"][f[4]];
        ctx.beginPath(); ctx.ellipse(x, y, 2.2, 1.1, Math.sin(t * 2 + f[3]), 0, 7); ctx.fill();
      }
    }
  }

  function drawBg(t) {
    if (map.loc) { drawBg2(t); return; }
    const TH = THEMES[map.theme || 0];
    const sky = ctx.createLinearGradient(0, 0, 0, 150);
    sky.addColorStop(0, TH.sky[0]); sky.addColorStop(1, TH.sky[1]);
    ctx.fillStyle = sky; ctx.fillRect(-WW, -WH, WW * 3, 150 + WH);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 4; i++) { const x = ((i * 120 + t * 3) % 480) - 60, y = 40 + i * 17; ctx.beginPath(); ctx.ellipse(x, y, 26, 7, 0, 0, 7); ctx.ellipse(x + 14, y - 5, 15, 7, 0, 0, 7); ctx.fill(); }
    // море
    const sea = ctx.createLinearGradient(0, 132, 0, 178);
    sea.addColorStop(0, TH.sea[0]); sea.addColorStop(1, TH.sea[1]);
    ctx.fillStyle = sea; ctx.fillRect(-WW, 132, WW * 3, 48);
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1;
    for (let k = 0; k < 7; k++) { const yy = 138 + k * 6, off = (t * (6 + k) + k * 40) % 60; ctx.beginPath();
      for (let xx = -60 + off; xx < WW + 60; xx += 60) { ctx.moveTo(xx, yy); ctx.lineTo(xx + 14 + k, yy); } ctx.stroke(); }
    // остров с руинами и снайпером
    const ix = 60 + map.deco * 240;
    ctx.fillStyle = "#c9a35b"; ctx.beginPath(); ctx.ellipse(ix, 136, 70, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#e0bd74"; ctx.beginPath(); ctx.ellipse(ix, 134, 62, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#8a5a3c";
    for (const dx of [-44, -26, 14, 32]) ctx.fillRect(ix + dx, 121, 12, 12);
    ctx.fillStyle = "#2b2b2b"; ctx.fillRect(ix - 4, 124, 4, 9); ctx.beginPath(); ctx.arc(ix - 2, 122, 2, 0, 7); ctx.fill();
    if (phase === "live" && Math.sin(t * 5) > 0.6) { ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(ix + 1, 122, 1.6, 0, 7); ctx.fill(); }
    // песок
    const sand = ctx.createLinearGradient(0, 176, 0, WH);
    sand.addColorStop(0, TH.sand[0]); sand.addColorStop(1, TH.sand[1]);
    ctx.fillStyle = sand; ctx.fillRect(-WW, 176, WW * 3, WH * 2);
    ctx.fillStyle = TH.top; ctx.fillRect(-WW, 176, WW * 3, 3);
    const r = rng(map.seed + 7);
    ctx.fillStyle = "rgba(120,80,40,.25)";
    for (let i = 0; i < 70; i++) { ctx.beginPath(); ctx.ellipse(r() * WW, 185 + r() * 110, 1 + r() * 2, 0.6 + r(), 0, 0, 7); ctx.fill(); }
    // «ежи» вдали
    ctx.strokeStyle = "#7a5530"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const hx = 30 + r() * 300, hy = 186 + r() * 8;
      ctx.beginPath(); ctx.moveTo(hx - 6, hy + 6); ctx.lineTo(hx + 6, hy - 6); ctx.moveTo(hx - 6, hy - 6); ctx.lineTo(hx + 6, hy + 6); ctx.moveTo(hx, hy - 7); ctx.lineTo(hx, hy + 7); ctx.stroke(); }
    ctx.fillStyle = "rgba(0,0,0,.16)";
    for (const c of map.covers) { ctx.beginPath(); ctx.ellipse(c.x + c.w / 2 + 4, G + 2, c.w / 2 + 6, 4, 0, 0, 7); ctx.fill(); }
  }

  function drawPickups(t) {
    if (!R) return;
    for (const p of R.pickups) {
      if (p.taken) continue;
      const y = G - 9 + Math.sin(t * 4 + p.x) * 1.5;
      ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(p.x, G, 7, 2, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(p.x, y); ctx.scale(Math.abs(Math.cos(t * 3 + p.x)) * 0.6 + 0.4, 1);
      ctx.fillStyle = "#1f9d55"; ctx.strokeStyle = "#0b4d27"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(-8, -5, 16, 10, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c7f5d6"; ctx.font = "bold 7px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", 0, 0.5);
      ctx.restore();
    }
  }

  function drawSoldier(p, shirt, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const x = p.x, sw = Math.sin(p.walk || 0), f = p.dir || 1;
    const pants = "#3f4a2f", skin = "#f1c7a0", helm = "#4b5a34";
    if (!p.st) {
      ctx.save(); ctx.translate(x - 4, G - 30); ctx.rotate(sw * 0.22); ctx.fillStyle = pants; ctx.fillRect(-3.5, 0, 7, 28); ctx.fillStyle = "#1d1d1d"; ctx.fillRect(-3.5, 25, 6.5 * f, 4); ctx.restore();
      ctx.save(); ctx.translate(x + 4, G - 30); ctx.rotate(-sw * 0.22); ctx.fillStyle = pants; ctx.fillRect(-3.5, 0, 7, 28); ctx.fillStyle = "#1d1d1d"; ctx.fillRect(-3.5, 25, 6.5 * f, 4); ctx.restore();
      ctx.fillStyle = shirt; ctx.beginPath(); ctx.roundRect(x - 11, G - 55, 22, 28, 5); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x - 11, G - 42, 22, 4);
      ctx.save(); ctx.translate(x, G - 51); ctx.rotate(-sw * 0.5); ctx.fillStyle = shirt; ctx.fillRect(-3, 0, 6, 20); ctx.fillStyle = skin; ctx.fillRect(-3, 18, 6, 4); ctx.restore();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, G - 61, 8.5, 0, 7); ctx.fill();
      ctx.fillStyle = helm; ctx.beginPath(); ctx.arc(x, G - 63, 9.5, Math.PI, 0); ctx.fill(); ctx.fillRect(x - 10.5, G - 64, 21, 3);
      ctx.fillStyle = "#222"; ctx.fillRect(x + 3 * f - 1, G - 61, 2, 2);
    } else {
      ctx.fillStyle = pants; ctx.beginPath(); ctx.roundRect(x - 12, G - 16, 24, 14, 4); ctx.fill();
      ctx.fillStyle = "#1d1d1d"; ctx.fillRect(x - 12, G - 4, 10, 4); ctx.fillRect(x + 3, G - 4, 10, 4);
      ctx.fillStyle = shirt; ctx.beginPath(); ctx.roundRect(x - 11, G - 36, 22, 22, 5); ctx.fill();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, G - 37, 8.5, 0, 7); ctx.fill();
      ctx.fillStyle = helm; ctx.beginPath(); ctx.arc(x, G - 39, 9.5, Math.PI, 0); ctx.fill(); ctx.fillRect(x - 10.5, G - 40, 21, 3);
      ctx.fillStyle = "#222"; ctx.fillRect(x + 3 * f - 1, G - 37, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawFx(dt) {
    fx = fx.filter((f) => (f.t += dt) < f.life);
    for (const f of fx) {
      const k = f.t / f.life;
      if (f.kind === "dust") {
        ctx.fillStyle = `rgba(225,195,150,${1 - k})`;
        for (let i = 0; i < 7; i++) { const a = i * 0.9 + f.seed; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * k * 14, f.y + Math.sin(a) * k * 10, 2.5 + k * 3, 0, 7); ctx.fill(); }
      } else if (f.kind === "flash") {
        ctx.fillStyle = `rgba(255,240,180,${1 - k})`; ctx.beginPath(); ctx.arc(f.x, f.y, 4 + k * 10, 0, 7); ctx.fill();
      } else if (f.kind === "boom") {
        const e = Math.min(1, k * 4);
        if (k < 0.35) { ctx.fillStyle = `rgba(255,230,140,${1 - k / 0.35})`; ctx.beginPath(); ctx.arc(f.x, f.y, GREN_R * (0.3 + e * 0.75), 0, 7); ctx.fill(); }
        ctx.fillStyle = `rgba(255,120,40,${Math.max(0, 0.9 - k * 1.6)})`; ctx.beginPath(); ctx.arc(f.x, f.y, GREN_R * 0.55 * (0.4 + e), 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(70,64,60,${0.75 * (1 - k)})`;
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + f.seed; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * GREN_R * 0.5 * e, f.y + Math.sin(a) * GREN_R * 0.3 * e - k * 18, 8 + k * 12, 0, 7); ctx.fill(); }
        ctx.fillStyle = `rgba(40,30,20,${1 - k})`;
        for (let i = 0; i < 12; i++) { const a = i * 0.52 + f.seed, d = GREN_R * 1.1 * Math.min(1, k * 2.2); ctx.fillRect(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.7 + k * k * 40, 2.2, 2.2); }
      } else {
        ctx.globalAlpha = 1 - k; ctx.font = `bold ${12 + k * 10}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(f.text, f.x, f.y - k * 16); ctx.fillStyle = f.color || "#fff"; ctx.fillText(f.text, f.x, f.y - k * 16);
        ctx.globalAlpha = 1;
      }
    }
  }

  const iHide = () => R && R.iHide;
  function hiderPos() { return iHide() ? pos : remote; }

  const vis = { x0: 0, y0: 0, x1: WW, y1: WH };           // видимая часть мира в текущем кадре
  function drawWorld(dt, t, scale, ox, oy, view) {
    ctx.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * ox, DPR * oy);
    vis.x0 = -ox / scale - 2; vis.y0 = -oy / scale - 2; vis.x1 = (W - ox) / scale + 2; vis.y1 = (H - oy) / scale + 2;
    drawBg(t); drawPickups(t);
    const hp = hiderPos();
    const hiderColor = iHide() ? "#3b82f6" : "#ef4444";
    if (R && (phase === "prep" || phase === "live" || phase === "over")) {
      ctx.save(); ctx.beginPath(); ctx.rect(-WW, -WH, WW * 3, WH + G); ctx.clip(); drawSoldier(hp, hiderColor); ctx.restore();
    }
    if (layerDirty) drawLayer();
    ctx.imageSmoothingEnabled = smooth; ctx.drawImage(layer, 0, 0, WW, WH); ctx.imageSmoothingEnabled = true;
    if (view === "hider") {
      const st = coverState(pos);
      drawSoldier(pos, "#3b82f6", 0.45);
      const b = bodyRect(pos);
      ctx.strokeStyle = st.hidden && !st.peek.length ? "#22c55e" : st.hidden ? "#ffd34d" : "#ef4444";
      ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); ctx.setLineDash([]);
    }
    if (phase === "over" && R && R.reveal) {
      const b = bodyRect(hp); ctx.strokeStyle = "#ffd34d"; ctx.lineWidth = 2.5; ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      drawSoldier(hp, hiderColor, 0.9);
    }
    drawSmoke(view);
    drawGrens();
    drawFx(dt);
    drawWeather(t);
  }

  // дым: несколько кругов; у снайпера почти непрозрачный, у бегущего — полупрозрачный, чтобы видеть себя
  const PUFFS = [[-0.7, 0.15, 0.5, 0], [0.7, 0.15, 0.5, 1], [0, 0.12, 0.62, 2], [-0.45, 0.55, 0.55, 3], [0.45, 0.55, 0.55, 4], [0, 0.85, 0.6, 5], [-0.2, 1.2, 0.45, 6], [0.3, 1.25, 0.42, 1.5], [-0.9, 0.6, 0.35, 2.5], [0.9, 0.6, 0.35, 3.5]];
  const PUFF_COL = ["#d5d9df", "#c3c8d0", "#e8eaee"];
  function drawSmoke(view) {
    if (!R || !R.clouds || !R.clouds.length) return;
    for (const s of R.clouds) {
      const age = now - s.t0; if (age < 0 || age > SMOKE_T) continue;
      const grow = Math.min(1, 0.25 + age / 0.5), fade = Math.min(1, (SMOKE_T - age) / 0.9);
      ctx.globalAlpha = (view === "hider" ? 0.5 : view === "sniper" ? 0.94 : 0.8) * fade;
      PUFFS.forEach((p, i) => {
        const rr = p[2] * SMOKE_R * grow * (1 + 0.07 * Math.sin(now * 2 + p[3]));
        ctx.fillStyle = PUFF_COL[i % 3]; ctx.beginPath();
        ctx.arc(s.x + p[0] * SMOKE_R * grow + Math.sin(now * 0.7 + p[3]) * 2 + age * 1.5, G - 8 - p[1] * SMOKE_R * 1.45 * grow, rr, 0, 7); ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
  }
  const smokeActive = (s) => { const age = now - s.t0; return age > 0.3 && age < SMOKE_T - 0.5; };
  const inSmoke = (p) => !!(R && R.clouds && R.clouds.some((s) => smokeActive(s) && Math.abs(p.x - s.x) < SMOKE_R - 10));
  function drawGrens() {
    if (!R || !R.grens) return;
    for (const g of R.grens) {
      if (g.done) continue;
      const left = Math.max(0, g.at - now), blink = 0.5 + 0.5 * Math.sin(now * (10 + (GREN_DELAY - left) * 8));
      ctx.fillStyle = `rgba(255,40,30,${0.1 + blink * 0.12})`; ctx.beginPath(); ctx.arc(g.x, g.y, GREN_R, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(255,60,40,${0.55 + blink * 0.4})`; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(g.x, g.y, GREN_R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#2f3b23"; ctx.beginPath(); ctx.ellipse(g.x, g.y, 4, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = blink > 0.5 ? "#ff3b30" : "#5a1410"; ctx.beginPath(); ctx.arc(g.x, g.y - 5, 1.6, 0, 7); ctx.fill();
      ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 3; ctx.strokeStyle = "#000";
      ctx.strokeText(left.toFixed(1), g.x, g.y - 16); ctx.fillStyle = "#ffd34d"; ctx.fillText(left.toFixed(1), g.x, g.y - 16);
    }
  }

  function octagon(cx, cy, r, keep) {
    if (!keep) ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath();
  }

  function render(dt, t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!map) { ctx.fillStyle = "#0b1226"; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }   // мир и прицел сами закрывают весь экран
    const sniping = R && !R.iHide && (phase === "live" || phase === "prep" || (phase === "over" && !R.reveal));
    if (!sniping) {
      if (!R) { drawWorld(dt, t, S, OX, OY, "plain"); return; }
      const sc = S * 1.75, half = W / 2 / sc;
      const fx0 = hiderPos().x;
      camX += (Math.max(half, Math.min(WW - half, fx0)) - camX) * Math.min(1, dt * 6);
      if (WW < half * 2) camX = WW / 2;
      shake = Math.max(0, shake - dt * 3); const sx = (Math.random() - 0.5) * shake * 14, sy = (Math.random() - 0.5) * shake * 14;
      drawWorld(dt, t, sc, W / 2 - camX * sc + sx, H * 0.66 - G * sc + sy, R.iHide && phase !== "over" ? "hider" : "plain");
      return;
    }
    if (phase === "prep") {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = "#05080f"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.08)"; octagon(W / 2, H / 2, Math.min(W, H) * 0.42); ctx.fill();
      return;
    }
    const Z = 2.3 + 0.35 * me.up.zoom, sc = S * Z, cx = W / 2, cy = H * 0.47;
    const sway = phase === "live" ? Math.sin(t * 1.3) * 0.6 : 0;
    kick = Math.max(0, kick - dt * 4);
    shake = Math.max(0, shake - dt * 3);
    const Rr = Math.min(W * 0.48, H * 0.36), q = Math.ceil(Rr + 10), qx = Math.floor(cx - q), qy = Math.floor(cy - q), qs = q * 2;
    // мир рисуем только внутри квадрата прицела — снаружи всё равно чёрное (в 2 раза меньше пикселей на слабых телефонах)
    ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.beginPath(); ctx.rect(qx, qy, qs, qs); ctx.clip();
    drawWorld(dt, t, sc, cx - (aim.x + sway) * sc, cy - (aim.y - kick * 10) * sc, "sniper");
    ctx.restore();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#04060c";
    ctx.fillRect(0, 0, W, qy); ctx.fillRect(0, qy + qs, W, H - qy - qs); ctx.fillRect(0, qy, qx, qs); ctx.fillRect(qx + qs, qy, W - qx - qs, qs);
    ctx.beginPath(); ctx.rect(qx, qy, qs, qs); octagon(cx, cy, Rr, true); ctx.fill("evenodd");
    ctx.strokeStyle = "#000"; ctx.lineWidth = 14; octagon(cx, cy, Rr + 6); ctx.stroke();
    ctx.save(); octagon(cx, cy, Rr); ctx.clip();
    ctx.strokeStyle = "rgba(0,0,0,.055)"; octagon(cx, cy, Rr);                        // виньетка наложением широких полос — дешевле градиента
    for (let k = 1; k <= 8; k++) { ctx.lineWidth = k * 15; ctx.stroke(); }
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(cx - Rr, cy); ctx.lineTo(cx - 10, cy); ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + Rr, cy);
    ctx.moveTo(cx, cy - Rr); ctx.lineTo(cx, cy - 10); ctx.moveTo(cx, cy + 10); ctx.lineTo(cx, cy + Rr); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - Rr, cy); ctx.lineTo(cx - Rr * 0.5, cy); ctx.moveTo(cx + Rr * 0.5, cy); ctx.lineTo(cx + Rr, cy);
    ctx.moveTo(cx, cy + Rr * 0.5); ctx.lineTo(cx, cy + Rr); ctx.stroke();
    ctx.lineWidth = 1.2; for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(cx - 5, cy + k * 18); ctx.lineTo(cx + 5, cy + k * 18); ctx.stroke(); }
    ctx.fillStyle = "#e5484d"; ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,.09)"; ctx.beginPath(); ctx.moveTo(cx - Rr, cy - Rr); ctx.lineTo(cx + Rr * 0.2, cy - Rr); ctx.lineTo(cx - Rr, cy + Rr * 0.2); ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,.06)"; ctx.beginPath(); ctx.moveTo(cx - Rr, cy - Rr); ctx.lineTo(cx + Rr * 0.5, cy - Rr); ctx.lineTo(cx - Rr, cy + Rr * 0.5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`${Math.round(320 + (aim.y - 150) * 2)} м`, cx + 12, cy - 8);
    ctx.restore();
  }

  // ---------- UI ----------
  const show = (id, on) => $(id).classList.toggle("hidden", !on);
  let msgTimer = 0;
  function msg(text, ms) { const el = $("msg"); el.innerHTML = text; el.classList.add("on"); clearTimeout(msgTimer); msgTimer = setTimeout(() => el.classList.remove("on"), ms || 1400); }
  function big(text) { $("big").textContent = text || ""; }
  function hud() {
    if (!match) return;
    $("n1").textContent = me.name; $("n2").textContent = opp.name;
    $("av1").textContent = (me.name[0] || "Я").toUpperCase(); $("av2").textContent = opp.name.startsWith("🤖") ? "🤖" : (opp.name[0] || "?").toUpperCase();
    $("h1").style.width = Math.max(0, match.hp.me) + "%"; $("h2").style.width = Math.max(0, match.hp.opp) + "%";
    $("hn1").textContent = Math.max(0, match.hp.me); $("hn2").textContent = Math.max(0, match.hp.opp);
    $("coins").textContent = "🪙 +" + (match.earned + hitCoins());
    if (R) {
      $("role").textContent = `Раунд ${R.n + 1}/${ROUNDS} · ` + (R.iHide ? "🏃 Прячься и собирай деньги" : "🎯 Найди и подстрели");
      const ammo = $("ammo");
      if (!R.iHide) ammo.innerHTML = Array.from({ length: R.mag }, (_, i) => `<b class="${i < R.mag - R.bullets ? "used" : ""}"></b>`).join("") +
        Array.from({ length: GRENS }, (_, i) => `<span class="${i < GRENS - R.gr ? "used" : ""}">💣</span>`).join("");
      else ammo.innerHTML = Array.from({ length: SMOKES }, (_, i) => `<span class="${i < SMOKES - R.smk ? "used" : ""}">💨</span>`).join("");
      updBtns();
    }
  }
  function updBtns() {
    const s = $("c-s"), g = $("c-g");
    if (s && R) { s.querySelector("i").textContent = R.smk; s.classList.toggle("used", R.smk <= 0); }
    if (g && R) { g.querySelector("i").textContent = R.gr; g.classList.toggle("used", R.gr <= 0); }
  }
  function controls(kind) {
    const c = $("controls");
    if (kind === "hider") {
      c.innerHTML = `<button class="ctl" id="c-l">◀</button><div class="mid"><button class="ctl small" id="c-c">🧎</button><button class="ctl small tool" id="c-s">💨<i>${SMOKES}</i></button></div><button class="ctl" id="c-r">▶</button>`;
      $("c-s").addEventListener("pointerdown", (e) => { e.preventDefault(); useSmoke(); });
      const hold = (id, k) => {
        const el = $(id);
        el.addEventListener("pointerdown", (e) => { e.preventDefault(); keys[k] = true; el.classList.add("on"); T.haptic("select"); });
        ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => el.addEventListener(ev, () => { keys[k] = false; el.classList.remove("on"); }));
      };
      hold("c-l", "l"); hold("c-r", "r");
      $("c-c").addEventListener("pointerdown", (e) => { e.preventDefault(); pos.st = pos.st ? 0 : 1; $("c-c").textContent = pos.st ? "🧍" : "🧎"; T.haptic("impact", "light"); });
    } else if (kind === "sniper") {
      c.innerHTML = `<button class="ctl tool" id="c-g">💣<i>${GRENS}</i></button><button class="ctl fire" id="c-f">ОГОНЬ</button>`;
      $("c-f").addEventListener("pointerdown", (e) => { e.preventDefault(); fire(); });
      $("c-g").addEventListener("pointerdown", (e) => { e.preventDefault(); throwGren(); });
    } else c.innerHTML = "";
    show("controls", !!kind);
  }
  function screen(id) { ["screen-menu", "screen-room", "screen-shop", "screen-end"].forEach((s) => show(s, s === id)); }
  function buttons(boxId, list) {
    const box = $(boxId); box.innerHTML = "";
    for (const [label, cls, fn] of list) { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = label; b.onclick = fn; box.appendChild(b); }
  }

  // ---------- меню и магазин ----------
  function toMenu() {
    if (room) { try { room.close(); } catch (_) {} room = null; }
    phase = "menu"; match = null; R = null; controls(null); show("hud", false); show("tools", false); show("emo-panel", false); big("");
    if (!map) { map = genMap(7); layerDirty = true; }
    renderRank();
    screen("screen-menu");
  }
  function renderRank() {
    const k = rankOf(rating.r), el = $("m-rank"); if (!el) return;
    el.innerHTML = `<div class="rk-ic">${k.ic}</div><div class="rk-tx"><b>${k.name} · ${rating.r}</b>` +
      `<small>Онлайн: ${rating.w} ${plural(rating.w, "победа", "победы", "побед")} из ${rating.g} · 🤖 побед над ботом: ${rating.bw}</small></div>`;
  }
  function openShop() {
    screen("screen-shop");
    const render = () => {
      $("shop-wallet").textContent = `🪙 ${wallet.coins}`;
      $("shop-list").innerHTML = Object.entries(UP).map(([k, u]) => {
        const lv = wallet[k], price = PRICE[lv];
        return `<div class="it"><div class="ic">${u.ic}</div><div class="tx"><b>${u.name}</b>${u.desc}<div class="lv">Уровень ${lv}/${MAXLV}</div></div>` +
          (lv >= MAXLV ? `<button disabled>MAX</button>` : `<button data-k="${k}" ${wallet.coins < price ? "disabled" : ""}>🪙 ${price}</button>`) + `</div>`;
      }).join("");
      $("shop-list").querySelectorAll("button[data-k]").forEach((b) => b.onclick = () => {
        const k = b.dataset.k, price = PRICE[wallet[k]];
        if (wallet.coins < price) return;
        wallet.coins -= price; wallet[k]++; me.up = myUp(); if (rematch.me && mode === "online") send("info", { name: me.name, up: me.up, rt: rating.r }); T.haptic("notify", "success"); window.Stats && Stats.event("buy_upgrade", { item: k, level: wallet[k], price }); render();
      });
    };
    render();
  }

  // ---------- онлайн-комната ----------
  async function createRoom() {
    window.Stats && Stats.event("invite_create", {});
    phase = "room"; screen("screen-room");
    $("room-emoji").textContent = "📡"; $("room-title").textContent = "Создаём комнату";
    $("room-sub").textContent = ""; $("room-status").innerHTML = `<span class="dots">Подключаемся к серверу</span>`;
    buttons("room-buttons", [["Отмена", "ghost", toMenu]]);
    try { room = await Net.open("sniper", null, { name: T.playerName() }); }
    catch (e) { return netError(); }
    bindRoom();
    const link = Net.inviteLink("sniper", room.id);
    const share = () => T.openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Го в снайперский батл 1 на 1 🎯 Я уже в комнате — жми и заходи!")}`);
    $("room-emoji").textContent = "📨"; $("room-title").textContent = "Позови друга";
    $("room-sub").textContent = "Отправь приглашение. Как только друг откроет ссылку — бой начнётся автоматически. Не закрывай игру.";
    $("room-status").innerHTML = `<span class="dots">Ждём друга</span>`;
    buttons("room-buttons", [["📨 Отправить приглашение", "primary", share], ["Отмена", "ghost", toMenu]]);
    share();
  }
  async function joinRoom(id) {
    phase = "room"; screen("screen-room");
    $("room-emoji").textContent = "⚔️"; $("room-title").textContent = "Тебя позвали в батл";
    $("room-sub").textContent = ""; $("room-status").innerHTML = `<span class="dots">Подключаемся к комнате</span>`;
    buttons("room-buttons", [["Отмена", "ghost", toMenu]]);
    try { room = await Net.open("sniper", id, { name: T.playerName() }); }
    catch (e) { return netError(); }
    bindRoom();
    setTimeout(() => {
      if (room && !room.peer && phase === "room") {
        $("room-emoji").textContent = "😕"; $("room-title").textContent = "Комната не найдена";
        $("room-status").textContent = "Друг уже вышел или игра у него закрыта. Попроси прислать новое приглашение.";
        buttons("room-buttons", [["🤖 Пока сыграть с ботом", "", () => { toMenu(); startBot(); }], ["В меню", "ghost", toMenu]]);
      }
    }, 12000);
  }
  function netError() {
    $("room-emoji").textContent = "📵"; $("room-title").textContent = "Нет связи с сервером";
    $("room-status").textContent = "Проверь интернет и попробуй ещё раз. Тренировка с ботом работает без сети.";
    buttons("room-buttons", [["Попробовать снова", "primary", () => location.reload()], ["🤖 С ботом", "", () => { toMenu(); startBot(); }], ["В меню", "ghost", toMenu]]);
  }
  function bindRoom() {
    room.on("peer", (p) => {
      opp.name = p.name || "Друг"; opp.rt = 1000;
      window.Stats && Stats.event(room.isHost ? "invite_accepted" : "invite_join", {});
      room.send("info", { name: me.name, up: me.up, rt: rating.r });
      $("room-emoji").textContent = "✅"; $("room-title").textContent = `${opp.name} в игре!`; $("room-status").textContent = "Начинаем…";
      T.haptic("notify", "success");
      if (room.isHost) setTimeout(() => { if (room && room.peer) hostStartMatch(); }, 1200);
    });
    room.on("info", (d) => { if (d) { opp.name = (d.name || opp.name).slice(0, 20); opp.up = d.up || opp.up; if (typeof d.rt === "number" && isFinite(d.rt)) opp.rt = Math.max(100, Math.min(4000, Math.round(d.rt))); hud(); } });
    room.on("full", () => { $("room-title").textContent = "Комната занята"; $("room-status").textContent = "В этой комнате уже играют двое."; });
    room.on("peer-left", () => {
      if (phase === "menu") return;
      if (phase === "room" && room.isHost) { $("room-status").innerHTML = `<span class="dots">Друг вышел. Ждём снова</span>`; return; }
      opponentLeft();
    });
    bindGame(room);
  }
  function opponentLeft() {
    phase = "end"; controls(null); big("");
    $("end-emoji").textContent = "🚪"; $("end-title").textContent = `${opp.name} вышел из игры`;
    $("end-sub").textContent = match ? "Монеты за матч сохранены." : ""; $("end-coins").textContent = ""; $("end-status").textContent = ""; $("end-rating").innerHTML = "";
    if (match && (match.earned || match.hits)) { wallet.coins += match.earned + hitCoins(); match.earned = 0; match.hits = match.heads = 0; }
    buttons("end-buttons", [["⚔️ Позвать снова", "primary", () => { toMenu(); createRoom(); }], ["В меню", "ghost", toMenu]]);
    screen("screen-end");
  }

  // ---------- сообщения матча (одинаково для онлайна и бота) ----------
  function bindGame(rm) {
    rm.on("start", (d) => beginMatch(d.seed));
    rm.on("round", (d) => beginRound(d));
    rm.on("pos", (d) => {
      if (!R || R.iHide) return;
      if (d.t == null) { remote.tx = d.x; remote.st = d.st; remote.dir = d.dir; remote.moving = !!d.m; return; }   // бот
      if (rbuf.length && d.t <= rbuf[rbuf.length - 1].vt) return;   // устаревший пакет
      rbuf.push({ rt: now, vt: d.t, x: d.x, st: d.st, dir: d.dir, m: !!d.m }); if (rbuf.length > 60) rbuf.shift();
    });
    rm.on("st", (d) => {                            // состояние соперника — его здоровье и сколько раз в него попали
      if (!match) return;
      if (d.hp !== match.hp.opp) { if (d.hp < match.hp.opp) flashBar("h2"); match.hp.opp = d.hp; }
      if (d.ht > match.hits) match.hits = d.ht; if (d.hh > match.heads) match.heads = d.hh;
      hud();
    });
    rm.on("hp", (d) => { if (match) { match.hp.opp = d.hp; flashBar("h2"); hud(); } });
    rm.on("ko", (d) => { if (isHost()) setTimeout(() => hostEndRound("ko", d && d.n), 500); });
    rm.on("out", (d) => { if (isHost()) setTimeout(() => hostEndRound("ammo", d && d.n), 1600); });
    rm.on("hitres", (d) => onHitRes(d));
    rm.on("emo", (d) => bubble("opp", d.e));
    rm.on("shot", (d) => onShotAtMe(d));
    rm.on("smoke", (d) => onSmoke(d));
    rm.on("gren", (d) => onGren(d));
    rm.on("pick", (d) => { if (R && R.pickups[d.i]) R.pickups[d.i].taken = true; });
    rm.on("rend", (d) => onRoundEnd(d));
    rm.on("mend", (d) => { if (d && d.hp != null) match.hp.opp = d.hp; endMatch(); });
    rm.on("rematch", () => { rematch.opp = true; tryRematch(); });
  }
  const send = (t, d) => { if (room) room.send(t, d); };
  const isHost = () => !room || room.isHost;

  function hostStartMatch() {
    const seed = Math.floor(Math.random() * 100000);
    send("start", { seed }); beginMatch(seed);
    setTimeout(() => hostNextRound(0), 1500);
  }
  function hostNextRound(n) {
    if (!match) return;
    if (n >= ROUNDS || match.hp.me <= 0 || match.hp.opp <= 0) { send("mend", { hp: match.hp.me }); endMatch(); return; }
    const pick = Array.from({ length: 4 }, () => Math.round(14 + Math.random() * (WW - 28)));
    const loc = forceLoc != null ? forceLoc : locFor(match.seed, n);
    const d = { n, hiderHost: n % 2 === 1, pick, loc };
    send("round", d); beginRound(d);
  }
  let forceLoc = null;                              // для тестов/скриншотов
  const grenPending = () => !!(R && R.grens && R.grens.some((g) => !g.done));
  function hostEndRound(reason, n) {
    if (!R || R.ended || (n != null && R.n !== n)) return;
    if (reason === "ammo" && grenPending()) { setTimeout(() => hostEndRound(reason, n), 300); return; }   // ждём, пока граната взорвётся
    const d = { n: R.n, reason };
    send("rend", d); onRoundEnd(d);
    const next = R.n + 1;
    setTimeout(() => hostNextRound(next), 3400);
  }

  function beginMatch(seed) {
    maps = { seed };
    map = genMap(seed * 2 + 1); map.theme = 0; layerDirty = true;
    $("vs-n1").textContent = me.name; $("vs-n2").textContent = opp.name;
    { const k1 = rankOf(rating.r), k2 = rankOf(opp.rt || 1000);
      $("vs-r1").textContent = `${k1.ic} ${k1.name} · ${rating.r}`;
      $("vs-r2").textContent = mode === "bot" ? "🤖 тренировка" : `${k2.ic} ${k2.name} · ${opp.rt || 1000}`; }
    $("vs-a1").textContent = (me.name[0] || "Я").toUpperCase(); $("vs-a2").textContent = opp.name.startsWith("🤖") ? "🤖" : (opp.name[0] || "?").toUpperCase();
    show("vs", true); setTimeout(() => show("vs", false), 1400);
    show("tools", true); $("snd-btn").textContent = Snd.on ? "🔊" : "🔇";
    match = { seed, hp: { me: 100, opp: 100 }, earned: 0, hits: 0, heads: 0, taken: 0, takenHead: 0, survived: 0, picks: 0, seenShots: new Set(), smokes: 0, grens: 0 };
    hist = []; rbuf = [];
    rematch = { me: false, opp: false };
    screen(null); show("hud", true); hud();
    window.Stats && Stats.gameStart({ mode, up: me.up });
  }

  function startPos() {
    const cs = map.covers.filter((c) => c.h >= 50);
    const c = cs[Math.floor(Math.random() * cs.length)] || map.covers[0];
    return { x: c.x + c.w / 2, st: c.h < 72 ? 1 : 0, dir: 1, walk: 0 };
  }

  function beginRound(d) {
    const hostHides = d.hiderHost;
    const iH = isHost() ? hostHides : !hostHides;
    // карта раунда: локация от хозяина (или по seed), сама карта — из seed матча, номера раунда и того, кто прячется → у обоих одинаково
    const loc = d.loc != null && LOCS[d.loc] ? d.loc : locFor(match.seed, d.n);
    map = genMap((match.seed * 2 + (hostHides ? 1 : 2)) * 16 + d.n, loc); map.theme = hostHides ? 0 : 1; layerDirty = true;
    R = { n: d.n, iHide: iH, pickups: d.pick.map((x) => ({ x, taken: false })), mag: BASE_MAG + (iH ? 0 : me.up.mag),
      bullets: 0, start: now, ended: false, reveal: false, shots: 0, endAt: now + PREP + DUR,
      smk: SMOKES, gr: GRENS, clouds: [], grens: [] };
    R.bullets = R.mag;
    phase = "prep";
    if (iH) { pos = startPos(); controls("hider"); }
    else { aim = { x: WW / 2, y: G - 50 }; remote = { x: WW / 2, tx: WW / 2, st: 0, dir: 1, walk: 0, moving: false }; controls("sniper"); }
    hist = []; rbuf = [];
    remoteAim = { x: WW / 2, y: 190, tx: WW / 2, ty: 190 };
    keys = { l: false, r: false };
    hud();
    T.haptic("impact", "medium");
    const L = LOCS[loc], place = loc ? `${L.ic} ${L.name}` : `${L.ic} ${THEMES[map.theme].name} остров`;
    banner(`РАУНД ${d.n + 1} / ${ROUNDS}`, iH ? "ТЫ ПРЯЧЕШЬСЯ" : "ТЫ СНАЙПЕР",
      `${place} · ` + (iH ? `беги, собирай $ · 💨×${SMOKES}` : `${R.mag} ${plural(R.mag, "патрон", "патрона", "патронов")} + 💣`));
    if (mode === "bot") bot.beginRound();
    window.Stats && Stats.state({ round: d.n, hide: iH, hp: match.hp.me });
  }

  function goLive() {
    phase = "live"; big(""); Snd.beep(true);
    msg(R.iHide ? "Беги! Снайпер ищет тебя 👀" : "Огонь по готовности 🎯", 1300);
    T.haptic("impact", "heavy");
  }

  // ---------- выстрел ----------
  // Попадание проверяет тот, в кого стреляют: у него точная позиция своего человечка
  function hitTest(p, x, y) {
    const dx = x - p.x;
    if (!p.st) {
      if (dx * dx + (y - (G - 61)) ** 2 <= 9.5 * 9.5) return "head";
      if (Math.abs(dx) <= 11 && y >= G - 55 && y <= G - 27) return "body";
      if (Math.abs(dx) <= 8 && y >= G - 30 && y <= G) return "body";
    } else {
      if (dx * dx + (y - (G - 37)) ** 2 <= 9.5 * 9.5) return "head";
      if (Math.abs(dx) <= 11 && y >= G - 36 && y <= G - 14) return "body";
      if (Math.abs(dx) <= 12 && y >= G - 16 && y <= G) return "body";
    }
    return null;
  }
  let lastFire = 0, shotId = 0;
  function fire() {
    if (phase !== "live" || !R || R.iHide || R.bullets <= 0 || now - lastFire < 0.35) return;
    lastFire = now; R.bullets--; R.shots++;
    const d = { id: ++shotId, x: aim.x, y: aim.y, vt: remote.vt };
    send("shot", d); impact(d, true);
    T.haptic("impact", "heavy"); Snd.shot(); kick = 1;
    hud();
    if (mode === "bot") {                       // бот прячется у нас локально — проверяем по его настоящей позиции
      const res = hitTest(bot.pos, d.x, d.y), dmg = res ? (res === "head" ? HEAD : BODY) : 0;
      setTimeout(() => onHitRes({ id: d.id, res, dmg, dist: Math.hypot(d.x - bot.pos.x, d.y - (G - 35)) }), 120);
    }
    if (R.bullets <= 0) {
      if (R.gr > 0) setTimeout(() => { if (R && !R.ended && R.gr > 0) msg("Патроны кончились — остался 💣", 1300); }, 1000);
      else outOfAmmo();
    }
  }
  function outOfAmmo() {
    const n = R.n;
    if (isHost()) setTimeout(() => hostEndRound("ammo", n), 1600); else send("out", { n });
  }

  // ---------- дым (у бегущего) и граната (у снайпера) ----------
  const r1 = (v) => Math.round(v * 10) / 10;
  function useSmoke() {
    if (phase !== "live" || !R || !R.iHide || R.smk <= 0 || now - (R.lastSmk || -9) < 0.8) return;
    R.smk--; R.lastSmk = now; match.smokes++;
    const s = { x: r1(pos.x), t0: now }; R.clouds.push(s);
    send("smoke", { x: s.x, n: R.n });
    Snd.hiss(); T.haptic("impact", "medium"); msg("💨 Дым! Снайпер тебя не видит", 1100); hud();
  }
  function onSmoke(d) {                            // соперник (или бот) пустил дым — у снайпера
    if (!R || R.iHide || R.ended || !d || d.n !== R.n) return;
    R.clouds.push({ x: +d.x || 0, t0: now }); Snd.hiss();
    if (mode !== "bot" || Math.random() < 0.7) msg("💨 Дымовая шашка!", 900);
  }
  function throwGren() {
    if (phase !== "live" || !R || R.iHide || R.gr <= 0) return;
    R.gr--; match.grens++;
    const d = { id: 9000 + (++shotId), x: r1(aim.x), y: r1(Math.max(G - 110, Math.min(G - 6, aim.y))), n: R.n };
    addGren(d, true); send("gren", d);
    Snd.pin(); T.haptic("impact", "medium"); kick = 0.5; msg(`💣 Граната! ${GREN_DELAY.toFixed(1)} с…`, 1000); hud();
    if (R.bullets <= 0) outOfAmmo();
  }
  function addGren(d, mine) { R.grens.push({ id: d.id, x: +d.x || 0, y: +d.y || G - 30, at: now + GREN_DELAY, mine, done: false }); }
  function onGren(d) {                             // в меня летит граната: предупреждение, взрыв считаю я сам
    if (!R || !R.iHide || R.ended || !d || d.n !== R.n || R.grens.some((g) => g.id === d.id)) return;
    addGren(d, false); Snd.pin();
    if (Math.abs(d.x - pos.x) < GREN_R + 24) { msg("💣 ГРАНАТА! Беги!", 1300); T.haptic("notify", "warning"); }
    else msg("💣 Снайпер бросил гранату", 1000);
  }
  function grenDmg(p, g) {                         // урон по площади: чем ближе к центру — тем больнее; укрытие ослабляет
    const b = bodyRect(p), cx = Math.max(b.x, Math.min(g.x, b.x + b.w)), cy = Math.max(b.y, Math.min(g.y, b.y + b.h));
    const dist = Math.hypot(g.x - cx, g.y - cy);
    if (dist >= GREN_R) return { dmg: 0, dist };
    let dmg = 12 + (GREN_MAX - 12) * (1 - dist / GREN_R);
    const s = coverState(p); if (s.hidden && !s.peek.length) dmg *= 0.6;
    return { dmg: Math.round(dmg), dist };
  }
  function explode(g) {
    g.done = true;
    fx.push({ kind: "boom", x: g.x, y: g.y, t: 0, life: 1.1, seed: Math.random() * 6 });
    const q = rng(g.id * 97 + Math.round(g.x * 10));          // одинаковые дыры от осколков у обоих
    for (let i = 0; i < 6; i++) {
      const a = q() * 6.283, rr = 6 + q() * GREN_R * 0.55, hx = g.x + Math.cos(a) * rr, hy = g.y + Math.sin(a) * rr * 0.8;
      const c = map.covers.find((c) => hx >= c.x && hx <= c.x + c.w && hy >= G - c.h && hy <= G && !inOpening(c, hx, hy));
      if (c) { c.open.push({ t: "c", x: r1(hx), y: r1(hy), r: 2.6 + q() * 1.2 }); layerDirty = true; }
    }
    Snd.boom();
    if (!R || R.ended) return;
    if (R.iHide) {
      const o = grenDmg(pos, g), dmg = Math.round(o.dmg * (1 - 0.12 * me.up.armor));
      send("hitres", { id: g.id, res: dmg ? "gren" : null, dmg, dist: Math.round(o.dist), g: 1 });
      shake = dmg ? 1.3 : o.dist < GREN_R + 40 ? 0.7 : 0.3;
      if (dmg) takeHit("gren", dmg, pos.x, G - 50);
      else if (o.dist < GREN_R + 30) { msg("Осколки мимо! 😅", 1000); T.haptic("impact", "heavy"); }
      hud();
    } else {
      kick = 0.4;
      if (mode === "bot") { const o = grenDmg(bot.pos, g); setTimeout(() => onHitRes({ id: g.id, res: o.dmg ? "gren" : null, dmg: o.dmg, dist: Math.round(o.dist), g: 1 }), 120); }
    }
  }
  function updTools() {
    if (!R) return;
    for (const g of R.grens) if (!g.done && now >= g.at) explode(g);
    if (R.clouds.length && now - R.clouds[0].t0 > SMOKE_T) R.clouds = R.clouds.filter((s) => now - s.t0 < SMOKE_T);
  }
  function impact(d, byMe) {                     // дырка, пыль, звук — у обоих
    const c = map.covers.find((c) => d.x >= c.x && d.x <= c.x + c.w && d.y >= G - c.h && d.y <= G && !inOpening(c, d.x, d.y));
    if (c) { c.open.push({ t: "c", x: d.x, y: d.y, r: 4 }); layerDirty = true; fx.push({ kind: "dust", x: d.x, y: d.y, t: 0, life: 0.6, seed: Math.random() * 6 }); if (byMe) setTimeout(() => Snd.thud(), 90); }
    fx.push({ kind: "flash", x: d.x, y: d.y, t: 0, life: 0.25 });
    if (!byMe) Snd.far();
  }
  function onShotAtMe(d) {                       // в меня стреляли
    if (!R || !R.iHide || R.ended) return;
    impact(d, false);
    // компенсация задержки: проверяем и где я сейчас, и где я был в тот момент, который снайпер видел у себя на экране
    let res = hitTest(pos, d.x, d.y);
    if (!res && d.vt != null && d.vt > now - 1.2 && d.vt <= now + 0.05) { const hp0 = histAt(d.vt); if (hp0) res = hitTest(hp0, d.x, d.y); }
    const dmg = res ? Math.round((res === "head" ? HEAD : BODY) * (1 - 0.12 * me.up.armor)) : 0;
    const dist = Math.hypot(d.x - pos.x, d.y - (G - 35));
    send("hitres", { id: d.id, res, dmg, dist: Math.round(dist) });
    if (res) takeHit(res, dmg, d.x, d.y);
    else if (dist < 40) { msg("Пуля рядом! 😱", 900); T.haptic("impact", "rigid"); shake = 0.4; }
    hud();
  }
  function takeHit(res, dmg, x, y) {               // по мне попали (пуля или граната) — считаю я сам, как и раньше
    fx.push({ kind: "txt", text: `−${dmg}`, color: "#ff5a5a", x, y: y - 8, t: 0, life: 1 });
    match.hp.me -= dmg; flashBar("h1"); shake = Math.max(shake, 1); Snd.hit();
    match.taken++; if (res === "head") match.takenHead++;
    sendSt();
    msg(res === "head" ? "Тебе в голову! 😵" : res === "gren" ? "Тебя накрыло гранатой! 💥" : "Тебя ранили! 🩸", 1300); T.haptic("notify", "error");
    if (match.hp.me <= 0) { const n = R.n; if (isHost()) setTimeout(() => hostEndRound("ko", n), 500); else send("ko", { n }); }
    if (mode === "bot" && Math.random() < 0.6) setTimeout(() => bubble("opp", pick(["😂", "😎", "🖕", "🔥"])), 700);
  }
  function onHitRes(r) {                          // ответ на мой выстрел
    if (!R || R.iHide) return;
    if (r.res) {
      const gg = r.res === "gren" && R.grens && R.grens.find((g) => g.id === r.id);
      fx.push({ kind: "txt", text: `−${r.dmg}`, color: "#ff5a5a", x: gg ? gg.x : aim.x, y: (gg ? gg.y : aim.y) - 8, t: 0, life: 1 });
      if (!match.seenShots.has(r.id) || mode === "bot") { match.seenShots.add(r.id); match.hits++; if (r.res === "head") match.heads++; }
      Snd.hit();
      msg(r.res === "head" ? `В ГОЛОВУ! 💀<br>+20 🪙` : r.res === "gren" ? `💣 Накрыл гранатой!<br>+10 🪙` : `Попал! +10 🪙`, 1400);
      if (mode === "bot") { match.hp.opp -= r.dmg; flashBar("h2"); if (match.hp.opp <= 0) { const n = R.n; setTimeout(() => hostEndRound("ko", n), 500); } if (Math.random() < 0.5) setTimeout(() => bubble("opp", pick(["😡", "😱", "🤡"])), 600); }
    } else if (r.g) msg(r.dist < GREN_R + 25 ? "Граната чуть-чуть не достала 😬" : "Граната мимо 💨", 1000);
    else msg(r.dist < 30 ? "Совсем рядом! 😬" : r.dist < 70 ? "Тепло…" : "Мимо", 900);
    hud();
  }
  const hitCoins = () => (match ? match.hits * 10 + match.heads * 10 : 0);
  function sendSt() { if (match && room) send("st", { hp: match.hp.me, ht: match.taken, hh: match.takenHead }); }
  function histAt(t) {
    for (let i = hist.length - 1; i > 0; i--) if (hist[i - 1].t <= t) { const a = hist[i - 1], b = hist[i], k = (t - a.t) / Math.max(1e-3, b.t - a.t); return { x: a.x + (b.x - a.x) * Math.min(1, k), st: k < 0.5 ? a.st : b.st }; }
    return hist[0] || null;
  }
  const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function flashBar(id) { const el = $(id); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 180); }
  function banner(a, b, c) {
    const el = $("banner"); $("ban0").textContent = a; $("ban1").textContent = b; $("ban2").textContent = c;
    el.classList.add("hidden"); void el.offsetWidth; el.classList.remove("hidden");
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  }
  function bubble(who, e) {
    const el = $(who === "me" ? "bub-me" : "bub-opp"); el.textContent = e; el.classList.add("on");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 1800);
    if (who === "opp") { T.haptic("impact", "light"); Snd.emo(); }
  }

  function onRoundEnd(d) {
    if (!R || R.ended) return;
    R.ended = true; R.reveal = true; phase = "over"; controls(null);
    let text;
    if (R.iHide) {
      if (match.hp.me > 0) { match.earned += 15; match.survived++; text = d.reason === "ammo" ? "У снайпера кончились патроны!<br>Выжил! +15 🪙" : "Выжил! +15 🪙"; }
      else text = "Тебя нашли 💀";
    } else text = d.reason === "ko" ? "Цель уничтожена! 🎯" : d.reason === "ammo" ? "Патроны кончились 🫙" : "Время вышло ⏱️";
    msg(text, 2600); hud();
    if (mode === "bot") bot.anim = null;
  }

  function endMatch() {
    phase = "end"; controls(null); big("");
    const a = match.hp.me, b = match.hp.opp, win = a > b, draw = a === b;
    const bonus = draw ? 15 : win ? 30 : 10;
    const total = match.earned + hitCoins() + bonus;
    const rt = applyRating(win, draw);
    window.Stats && Stats.gameEnd({ mode, win, draw, hp_me: a, hp_opp: b, hits: match.hits, survived: match.survived, coins: total, rating: rating.r, smokes: match.smokes, grens: match.grens });
    wallet.coins += total; saveWallet();
    $("end-emoji").textContent = draw ? "🤝" : win ? "🏆" : "💀";
    $("end-title").textContent = draw ? "Ничья" : win ? "Победа!" : `Победил ${opp.name}`;
    $("end-sub").textContent = `Здоровье: ты ${Math.max(0, a)} · ${opp.name} ${Math.max(0, b)} · попаданий ${match.hits} · выжил раундов ${match.survived}`;
    $("end-coins").textContent = `+${total} 🪙 (бонус за ${draw ? "ничью" : win ? "победу" : "участие"} ${bonus})`;
    $("end-rating").innerHTML = rt;
    $("end-status").textContent = "";
    match.earned = 0;
    const list = [["🔁 Реванш", "primary", askRematch], ["🛒 Улучшения", "", () => { openShop(); $("shop-close").onclick = () => screen("screen-end"); }]];
    if (mode === "online") list.push(["Выйти в меню", "ghost", toMenu]); else list.push(["⚔️ Позвать друга", "", () => { toMenu(); mode = "online"; resetWallet(); createRoom(); }], ["В меню", "ghost", toMenu]);
    buttons("end-buttons", list);
    setTimeout(() => screen("screen-end"), 800);
  }
  // ELO: онлайн — против рейтинга соперника (K=40 первые 10 матчей, потом 28); с ботом — счётчик побед
  function applyRating(win, draw) {
    if (match.rated) return match.rated;
    let html;
    if (mode === "online") {
      const before = rating.r, k0 = rankOf(before), ro = opp.rt || 1000;
      const E = 1 / (1 + Math.pow(10, (ro - before) / 400)), S = draw ? 0.5 : win ? 1 : 0, K = rating.g < 10 ? 40 : 28;
      let dl = Math.round(K * (S - E)); if (win && dl < 1) dl = 1; if (!win && !draw && dl > -1) dl = -1;
      rating.r = Math.max(100, before + dl); rating.g++; if (draw) rating.d++; else if (win) rating.w++; else rating.l++;
      saveRating();
      const k1 = rankOf(rating.r), col = dl > 0 ? "#1f9d55" : dl < 0 ? "#e5484d" : "#8a7462";
      html = `<div class="rk-end">${k1.ic} ${k1.name} · рейтинг <b>${rating.r}</b> <b style="color:${col}">(${dl > 0 ? "+" : dl < 0 ? "−" : "±"}${Math.abs(dl)})</b></div>` +
        (k1.name !== k0.name ? `<div class="rk-up">${rating.r > before ? "🎉 Новое звание" : "Звание понижено"}: ${k1.ic} ${k1.name}</div>` : "");
    } else {
      rating.bg++; if (win) rating.bw++; saveRating();
      const k = rankOf(rating.r);
      html = `<div class="rk-end">🤖 Побед над ботом: <b>${rating.bw}</b>${win ? ` <b style="color:#1f9d55">(+1)</b>` : ""}</div>` +
        `<div class="rk-note">${k.ic} ${k.name} · ${rating.r} — рейтинг растёт только в онлайн-боях</div>`;
    }
    match.rated = html;
    return html;
  }
  function askRematch() {
    if (mode === "bot") { startBot(); return; }
    rematch.me = true; me.up = myUp(); send("info", { name: me.name, up: me.up, rt: rating.r }); send("rematch", {});
    $("end-status").innerHTML = `<span class="dots">Ждём ${opp.name}</span>`;
    tryRematch();
  }
  function tryRematch() {
    if (phase !== "end") return;
    if (!rematch.me) { $("end-status").innerHTML = `<b style="color:#e5484d;font-size:18px">🔥 ${opp.name} хочет реванш!</b>`; { const b = $("end-buttons").querySelector(".btn.primary"); if (b) b.textContent = "✅ Принять реванш"; } T.haptic("notify", "warning"); return; }
    if (rematch.opp && isHost()) hostStartMatch();
  }

  // ---------- бот ----------
  const bot = {
    anim: null, pos: { x: 180, st: 0, dir: 1, walk: 0 }, target: null, aim: { x: 180, y: 190 }, seenAt: -1, nextShot: 0, wait: 0, lastSeen: null,
    beginRound() {
      this.target = null; this.wait = 0; this.seenAt = -1; this.lastSeen = null; this.nextShot = 0;
      this.expT = 0; this.smkDelay = 0.2 + Math.random() * 0.6; this.dodged = null; this.flee = null; this.react = 0;
      this.lostAt = -1; this.smokeSeen = -1; this.grenAt = 0; this.px = null;
      if (R.iHide) { this.aim = { x: WW * Math.random(), y: 190 }; }
      else { this.pos = startPos(); }
    },
    hideSpot(avoid) {
      for (let i = 0; i < 200; i++) {
        const c = map.covers[Math.floor(Math.random() * map.covers.length)];
        const p = { x: c.x + 12 + Math.random() * (c.w - 24), st: c.h < 72 || Math.random() < 0.35 ? 1 : 0 };
        if (avoid != null && Math.abs(p.x - avoid) < GREN_R + 22 && i < 150) continue;
        const s = coverState(p); if (s.hidden && !s.peek.length) return p;
      }
      return { x: avoid != null ? Math.max(14, Math.min(WW - 14, this.pos.x + (this.pos.x > avoid ? 1 : -1) * 90)) : this.pos.x, st: 1 };
    },
    throwAt(x) {                             // бот-снайпер бросает гранату (чуть неточно)
      if (!R || R.gr <= 0) return;
      R.gr--; this.grenAt = now;
      emit("gren", { id: 70000 + (++shotId), x: r1(Math.max(0, Math.min(WW, x + (Math.random() - 0.5) * 24))), y: G - 32 - Math.random() * 10, n: R.n });
    },
    update(dt) {
      if (!R || phase !== "live") return;
      if (!R.iHide) {                        // бот прячется
        const p = this.pos;
        // граната рядом — убегает (не всегда успевает среагировать)
        const th = R.grens.find((g) => !g.done && Math.abs(g.x - p.x) < GREN_R + 18);
        if (th && this.dodged !== th.id) { this.dodged = th.id; if (Math.random() < 0.75) { this.flee = th; this.react = now + 0.25 + Math.random() * 0.4; } }
        if (this.flee && now > this.react) { this.target = this.hideSpot(this.flee.x); this.target.st = 0; this.wait = 0.6; this.flee = null; }
        // на виду и прицел рядом — пускает дым
        const near = Math.abs(aim.x - p.x) < 60 && Math.abs(aim.y - (G - 35)) < 80;
        if (visible(p) && !inSmoke(p) && near) this.expT += dt; else this.expT = Math.max(0, this.expT - dt * 0.5);
        if (R.smk > 0 && this.expT > 0.3 + this.smkDelay && now - (this.lastSmk || -9) > 3) {
          R.smk--; this.lastSmk = now; this.expT = 0; this.smkDelay = 0.3 + Math.random() * 0.9;
          emit("smoke", { x: r1(p.x), n: R.n });
          if (!th) { this.target = Math.random() < 0.55 ? { x: p.x, st: 1 } : this.hideSpot(); this.wait = 1.2 + Math.random(); }
        }
        if (!this.target) {
          const free = R.pickups.map((c, i) => ({ c, i })).filter((o) => !o.c.taken);
          const aimFar = Math.abs(remoteAimOf().x - p.x) > 90;
          if (free.length && aimFar && Math.random() < 0.5) { const o = free[Math.floor(Math.random() * free.length)]; this.target = { x: o.c.x, st: 0, coin: true }; }
          else this.target = this.hideSpot();
          this.wait = 1 + Math.random() * 3;
        }
        const dx = this.target.x - p.x, sp = SPEED * (p.st ? 0.5 : 1) * dt;
        if (Math.abs(dx) > 1) { p.st = 0; p.x += Math.sign(dx) * Math.min(sp, Math.abs(dx)); p.dir = Math.sign(dx); p.walk += dt * 12; }
        else { p.st = this.target.st; p.walk = 0; this.wait -= dt; if (this.wait <= 0 || this.target.coin) this.target = null; }
        R.pickups.forEach((c, i) => { if (!c.taken && Math.abs(c.x - p.x) < 12) { c.taken = true; } });
        emit("pos", { x: p.x, st: p.st, dir: p.dir, m: Math.abs(dx) > 1 });
      } else {                               // бот стреляет
        const a = this.aim, smoked = inSmoke(pos), vis = visible(pos) && !smoked;
        if (vis) { if (this.seenAt < 0) this.seenAt = now; this.lastSeen = { x: pos.x, y: G - (pos.st ? 30 : 50) }; this.lostAt = -1; }
        else { if (this.seenAt >= 0) this.lostAt = now; this.seenAt = -1; }
        // дым: если игрок пропал рядом с облаком — бот держит облако на прицеле
        const cloud = R.clouds.find((s) => smokeActive(s) && (!this.lastSeen || Math.abs(this.lastSeen.x - s.x) < 60));
        if (cloud) { if (this.smokeSeen < 0) this.smokeSeen = now; } else this.smokeSeen = -1;
        let tx, ty;
        const vx = (pos.x - (this.px == null ? pos.x : this.px)) / Math.max(dt, 0.001); this.px = pos.x;
        if (vis && now - this.seenAt > 0.45) { const b = bodyRect(pos); tx = pos.x + vx * 0.18; ty = b.y + (this.headAim ? 8 : 26); }
        else if (cloud && !vis) { tx = cloud.x + Math.sin(now * 2.1) * 14; ty = G - 34 + Math.sin(now * 1.3) * 8; }
        else if (this.lastSeen) { tx = this.lastSeen.x + Math.sin(now * 1.7) * 30; ty = this.lastSeen.y; }
        else { tx = WW / 2 + Math.sin(now * 0.6) * 150; ty = 185 + Math.sin(now * 1.1) * 15; }
        const k = Math.min(1, dt * (vis ? 7 : 1.5));
        a.x += (tx - a.x) * k; a.y += (ty - a.y) * k;
        // граната: в облако дыма, по месту, где игрок пропал, или когда кончились патроны
        if (R.gr > 0 && now - R.start > PREP + 2) {
          if (cloud && now - this.smokeSeen > 0.7 && Math.random() < dt * 0.9) this.throwAt(cloud.x);
          else if (!vis && this.lastSeen && this.lostAt > 0 && now - this.lostAt > 2.5 && Math.random() < dt * 0.22) this.throwAt(this.lastSeen.x);
          else if (!this.lastSeen && now - R.start > PREP + 11 && Math.random() < dt * 0.12) { const c = map.covers[Math.floor(Math.random() * map.covers.length)]; this.throwAt(c.x + c.w / 2); }   // наугад по укрытию
          else if (R.bullets <= 0 && Math.random() < dt * 1.2) this.throwAt(this.lastSeen ? this.lastSeen.x : map.covers[Math.floor(Math.random() * map.covers.length)].x + 20);
        }
        if (R.bullets <= 0 && R.gr <= 0 && !R.botOut) { R.botOut = true; const n = R.n; setTimeout(() => hostEndRound("ammo", n), 1600); }
        if (now > this.nextShot && R.bullets > 0) {
          const b = bodyRect(pos), onTarget = a.x > b.x - 3 && a.x < b.x + b.w + 3 && a.y > b.y && a.y < G;
          const wild = !vis && this.lastSeen && Math.random() < 0.006;
          const blind = cloud && !vis && Math.abs(a.x - cloud.x) < 16 && R.bullets > 1 && Math.random() < dt * 0.45;
          if ((vis && onTarget && now - this.seenAt > 0.7) || wild || blind) {
            R.bullets--; this.nextShot = now + 1.1; this.headAim = Math.random() < 0.3;
            const x = a.x + (Math.random() - 0.5) * 10, y = a.y + (Math.random() - 0.5) * 8;
            emit("shot", { id: 0, x, y });
          }
        }
      }
    }
  };
  function remoteAimOf() { return aim; }
  let botHandlers = {};
  function emit(t, d) { (botHandlers[t] || []).forEach((f) => f(d)); }
  function startBot() {
    mode = "bot";
    botHandlers = {};
    room = null;
    const fake = { on(t, fn) { (botHandlers[t] = botHandlers[t] || []).push(fn); return fake; } };
    bindGame(fake);
    opp = { name: "🤖 Бот-снайпер", up: { mag: 0, zoom: 0, speed: 0, armor: 0 } };
    me.up = myUp();
    screen(null);
    hostStartMatch();
  }

  // ---------- цикл ----------
  let last = 0;
  function frame(ts) {
    const raw = (ts - (last || ts)) / 1000, dt = Math.min(raw, 0.05); last = ts; now = ts / 1000;
    // слабый телефон: если в бою кадр стабильно дольше ~24 мс — упрощаем картинку: без сглаживания больших слоёв, потом чёткость 1.5 и 1
    if (phase === "live" && raw > 0 && raw < 0.5 && document.visibilityState === "visible") {
      perfBuf.push(raw);
      if (perfBuf.length >= 45) {
        const med = perfBuf.sort((a, b) => a - b)[22]; perfBuf = [];
        if (med > 0.024) { if (smooth) smooth = false; else if (dprCap > 1 && (window.devicePixelRatio || 1) > 1) { dprCap = dprCap > 1.5 ? 1.5 : 1; resize(); } }
      }
    } else if (perfBuf.length) perfBuf = [];
    if (R && phase === "prep") {
      const left = Math.ceil(R.start + PREP - now);
      if (left !== R.lastBeep && left > 0) { R.lastBeep = left; Snd.beep(false); }
      big(left > 0 ? String(left) : "");

      if (now >= R.start + PREP) goLive();
    }
    if (R && (phase === "prep" || phase === "live")) {
      const left = Math.max(0, Math.ceil(R.endAt - now));
      $("timer").textContent = phase === "prep" ? DUR : left; $("timer").classList.toggle("warn", phase === "live" && left <= 5);
      if (R.iHide) {
        const sp = SPEED * (1 + 0.12 * me.up.speed) * (pos.st ? 0.5 : 1) * dt;
        const mv = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
        if (mv) { pos.x = Math.max(10, Math.min(WW - 10, pos.x + mv * sp)); pos.dir = mv; pos.walk += dt * (pos.st ? 6 : 12); } else pos.walk = 0;
        if (phase === "live") R.pickups.forEach((c, i) => {
          if (!c.taken && Math.abs(c.x - pos.x) < 12) { c.taken = true; match.earned += 5; match.picks++; send("pick", { i }); Snd.coin(); fx.push({ kind: "txt", text: "+5 🪙", color: "#7CFC9A", x: c.x, y: G - 30, t: 0, life: 1 }); T.haptic("impact", "light"); hud(); }
        });
        sendT -= dt;
        hist.push({ t: now, x: pos.x, st: pos.st }); while (hist.length && hist[0].t < now - 1.5) hist.shift();
        if (sendT <= 0) { (room && room.sendFast ? room.sendFast.bind(room) : send)("pos", { x: Math.round(pos.x * 10) / 10, st: pos.st, dir: pos.dir, m: mv ? 1 : 0, t: +now.toFixed(3) }); sendT = 1 / 20; }

      } else {
        if (rbuf.length) {                        // показываем соперника чуть в прошлом — плавно, без рывков; запоминаем его время для честного попадания
          const rt = now - INTERP; let a = rbuf[0], b = rbuf[rbuf.length - 1];
          for (let i = rbuf.length - 1; i > 0; i--) if (rbuf[i - 1].rt <= rt) { a = rbuf[i - 1]; b = rbuf[i]; break; }
          const k = rt <= a.rt ? 0 : Math.min(1, (rt - a.rt) / Math.max(1e-3, b.rt - a.rt));
          remote.x = a.x + (b.x - a.x) * k; remote.vt = a.vt + (b.vt - a.vt) * k;
          const c = k < 0.5 ? a : b; remote.st = c.st; remote.dir = c.dir; remote.moving = c.m;
        } else remote.x += (remote.tx - remote.x) * Math.min(1, dt * 12);
        remote.walk = remote.moving ? remote.walk + dt * 12 : 0;

      }
      if (mode === "bot") bot.update(dt);
      stT -= dt; if (stT <= 0) { stT = 0.4; sendSt(); }
      if (phase === "live" && isHost() && now > R.endAt + 0.3 && !grenPending()) hostEndRound("time");

    }
    if (R && phase !== "menu") updTools();
    render(dt, now);
    requestAnimationFrame(frame);
  }

  // ---------- ввод прицела ----------
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); if (drag) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  document.addEventListener("pointerdown", () => Snd.unlock(), { once: true });
  $("emo-panel").innerHTML = EMOS.map((e) => `<button>${e}</button>`).join("");
  $("emo-btn").onclick = () => show("emo-panel", $("emo-panel").classList.contains("hidden"));
  $("emo-panel").querySelectorAll("button").forEach((b) => b.onclick = () => {
    if (now - emoT < 0.8) return; emoT = now;
    send("emo", { e: b.textContent }); bubble("me", b.textContent); show("emo-panel", false); T.haptic("select");
    window.Stats && Stats.event("emote", { e: b.textContent });
  });
  $("snd-btn").onclick = () => { $("snd-btn").textContent = Snd.toggle() ? "🔊" : "🔇"; };
  window.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;          // второй палец (кнопка «Огонь») не двигает прицел
    if (R && !R.iHide && (phase === "live" || phase === "prep")) {
      const Z = 2.3 + 0.35 * me.up.zoom, k = 1 / (S * Z) * 1.15;
      aim.x = Math.max(0, Math.min(WW, aim.x + (e.clientX - drag.x) * k));
      aim.y = Math.max(90, Math.min(WH - 20, aim.y + (e.clientY - drag.y) * k));
    }
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  window.addEventListener("pointerup", endDrag); window.addEventListener("pointercancel", endDrag);
  window.addEventListener("keydown", (e) => {
    if (!R) return;
    if (R.iHide) { if (e.key === "ArrowLeft") keys.l = true; if (e.key === "ArrowRight") keys.r = true; if (e.key === "ArrowDown") pos.st = 1; if (e.key === "ArrowUp") pos.st = 0; if (e.key === "s" || e.key === "S" || e.key === "ы" || e.key === "Ы") useSmoke(); }
    else { const d = e.shiftKey ? 1 : 6; if (e.key === "ArrowLeft") aim.x -= d; if (e.key === "ArrowRight") aim.x += d; if (e.key === "ArrowUp") aim.y -= d; if (e.key === "ArrowDown") aim.y += d; if (e.key === " ") fire(); if (e.key === "g" || e.key === "G" || e.key === "п" || e.key === "П") throwGren(); }
  });
  window.addEventListener("keyup", (e) => { if (e.key === "ArrowLeft") keys.l = false; if (e.key === "ArrowRight") keys.r = false; });

  // ---------- старт ----------
  $("m-invite").onclick = () => { mode = "online"; resetWallet(); createRoom(); };
  $("m-bot").onclick = () => { resetWallet(); startBot(); };
    $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#0b1226", bg: "#0b1226", back: "../" });
  me.name = T.playerName() === "Друг" ? "Ты" : T.playerName();
  resize();
  loadWallet(() => {

    me.up = myUp();
    const inv = Net.readInvite();
    map = genMap(7); layerDirty = true;
    if (inv) { mode = "online"; resetWallet(); joinRoom(inv); } else toMenu();
  });
  loadRating(() => { if (phase === "menu") renderRank(); });
  requestAnimationFrame(frame);

  window.__game = {
    get phase() { return phase; }, get R() { return R; }, get match() { return match; }, get pos() { return pos; }, get aim() { return aim; },
    get remote() { return remote; }, get map() { return map; }, get wallet() { return wallet; }, get roomId() { return room && room.id; }, get mode() { return mode; }, get dpr() { return DPR; }, get smooth() { return smooth; }, keys, fire, coverState,
    aimAt(x, y) { aim.x = x; aim.y = y; }, setPos(x, st) { pos.x = x; pos.st = st; }, startBot, createRoom,
    useSmoke, throwGren, get rating() { return rating; }, get bot() { return bot; }, set forceLoc(v) { forceLoc = v; }, showMap(loc, seed) { map = genMap(seed || 7, loc); map.theme = 0; layerDirty = true; screen(null); }, LOCS, locFor, genMap
  };
})();
