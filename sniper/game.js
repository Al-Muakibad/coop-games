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
  const PRICE = [60, 120, 220], MAXLV = 3;
  const THEMES = [
    { name: "Пустынный", sky: ["#3d8fe0", "#a9dcff"], sea: ["#1f78c4", "#4fb3e8"], sand: ["#e7c27c", "#b07f45"], top: "#d9ae67", brick: 22, mortar: "#8a5a3c" },
    { name: "Закатный", sky: ["#5b3a8c", "#ff9d6c"], sea: ["#3a4f9a", "#e2837a"], sand: ["#d9a066", "#8a5232"], top: "#e6b07a", brick: 6, mortar: "#6e3b2a" }
  ];
  const EMOS = ["😂", "😡", "🖕", "👍", "😎", "🤡", "😱", "💩", "🔥"];

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
      emo() { tone(660, 0.08, 0.2, "triangle", 990); }
    };
  })();

  // ---------- кошелёк и улучшения ----------
  let wallet = { coins: 0, mag: 0, zoom: 0, speed: 0, armor: 0 };
  function saveWallet() {
    const s = JSON.stringify(wallet);
    try { localStorage.setItem("sniper_wallet", s); } catch (_) {}
    try { if (T.tg && T.tg.CloudStorage) T.tg.CloudStorage.setItem("sniper_wallet", s); } catch (_) {}
  }
  function loadWallet(cb) {
    const apply = (s) => { try { const w = JSON.parse(s); if (w && typeof w.coins === "number") wallet = Object.assign(wallet, w); } catch (_) {} };
    try { apply(localStorage.getItem("sniper_wallet")); } catch (_) {}
    try {
      if (T.tg && T.tg.CloudStorage && T.tg.isVersionAtLeast && T.tg.isVersionAtLeast("6.9")) {
        T.tg.CloudStorage.getItem("sniper_wallet", (e, v) => { if (!e && v) { const before = wallet.coins; apply(v); wallet.coins = Math.max(before, wallet.coins); } cb(); });
        return;
      }
    } catch (_) {}
    cb();
  }
  const myUp = () => ({ mag: wallet.mag, zoom: wallet.zoom, speed: wallet.speed, armor: wallet.armor });

  // ---------- экран ----------
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1, S = 1, OX = 0, OY = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
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
  function genMap(seed) {
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

  // ---------- рисование ----------
  const layer = document.createElement("canvas"); const LR = 4;
  layer.width = WW * LR; layer.height = WH * LR; const lctx = layer.getContext("2d");

  function drawBricks(g, c) {
    const r = rng(c.seed), y = G - c.h, TH = THEMES[map.theme || 0];
    g.fillStyle = TH.mortar; g.fillRect(c.x, y, c.w, c.h);
    const bh = 8.5, bw = 17;
    for (let row = 0, yy = y + 1; yy < G; yy += bh, row++) {
      for (let xx = c.x - (row % 2 ? bw / 2 : 0); xx < c.x + c.w; xx += bw) {
        const x0 = Math.max(c.x + 0.8, xx + 0.8), x1 = Math.min(c.x + c.w - 0.8, xx + bw - 0.8);
        if (x1 <= x0) continue;
        const l = 38 + r() * 14, h = TH.brick + r() * 8;
        g.fillStyle = `hsl(${h},${38 + r() * 12}%,${l}%)`;
        g.fillRect(x0, yy + 0.8, x1 - x0, Math.min(bh - 1.6, G - yy - 0.8));
        g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(x0, yy + 0.8, x1 - x0, 1.2);
      }
    }
    g.fillStyle = "#6e4a33"; g.fillRect(c.x - 3, y - 5, c.w + 6, 6);
    g.fillStyle = "#a0745a"; g.fillRect(c.x - 3, y - 5, c.w + 6, 2);
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
    for (const c of map.covers) for (const o of c.open) {
      lctx.beginPath(); if (o.t === "r") lctx.rect(o.x, o.y, o.w, o.h); else lctx.arc(o.x, o.y, o.r, 0, 7); lctx.fill();
    }
    lctx.globalCompositeOperation = "source-over";
    for (const c of map.covers) for (const o of c.open) if (o.t === "c") {
      lctx.strokeStyle = "rgba(30,15,5,.75)"; lctx.lineWidth = 1.6; lctx.beginPath(); lctx.arc(o.x, o.y, o.r + 0.7, 0, 7); lctx.stroke();
      lctx.strokeStyle = "rgba(255,230,200,.35)"; lctx.lineWidth = 1; lctx.beginPath(); lctx.arc(o.x, o.y, o.r + 2.2, 0.5, 2.2); lctx.stroke();
    }
    layerDirty = false;
  }

  function drawBg(t) {
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
      ctx.save(); ctx.translate(x - 4, G - 30); ctx.rotate(sw * 0.45); ctx.fillStyle = pants; ctx.fillRect(-3.5, 0, 7, 29); ctx.fillStyle = "#1d1d1d"; ctx.fillRect(-3.5, 25, 9 * f, 5); ctx.restore();
      ctx.save(); ctx.translate(x + 4, G - 30); ctx.rotate(-sw * 0.45); ctx.fillStyle = pants; ctx.fillRect(-3.5, 0, 7, 29); ctx.fillStyle = "#1d1d1d"; ctx.fillRect(-3.5, 25, 9 * f, 5); ctx.restore();
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
      } else {
        ctx.globalAlpha = 1 - k; ctx.font = `bold ${12 + k * 10}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(f.text, f.x, f.y - k * 16); ctx.fillStyle = f.color || "#fff"; ctx.fillText(f.text, f.x, f.y - k * 16);
        ctx.globalAlpha = 1;
      }
    }
  }

  const iHide = () => R && R.iHide;
  function hiderPos() { return iHide() ? pos : remote; }

  function drawWorld(dt, t, scale, ox, oy, view) {
    ctx.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * ox, DPR * oy);
    drawBg(t); drawPickups(t);
    const hp = hiderPos();
    const hiderColor = iHide() ? "#3b82f6" : "#ef4444";
    if (R && (phase === "prep" || phase === "live" || phase === "over")) drawSoldier(hp, hiderColor);
    if (layerDirty) drawLayer();
    ctx.drawImage(layer, 0, 0, WW, WH);
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
    drawFx(dt);
  }

  function octagon(cx, cy, r, keep) {
    if (!keep) ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath();
  }

  function render(dt, t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b1226"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!map) return;
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
    drawWorld(dt, t, sc, cx - (aim.x + sway) * sc, cy - (aim.y - kick * 10) * sc, "sniper");
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const Rr = Math.min(W * 0.48, H * 0.36);
    ctx.fillStyle = "#04060c"; ctx.beginPath(); ctx.rect(0, 0, W, H); octagon(cx, cy, Rr, true); ctx.fill("evenodd");
    ctx.strokeStyle = "#000"; ctx.lineWidth = 14; octagon(cx, cy, Rr + 6); ctx.stroke();
    const vg = ctx.createRadialGradient(cx, cy, Rr * 0.6, cx, cy, Rr); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.45)");
    ctx.save(); octagon(cx, cy, Rr); ctx.clip(); ctx.fillStyle = vg; ctx.fillRect(cx - Rr, cy - Rr, Rr * 2, Rr * 2);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(cx - Rr, cy); ctx.lineTo(cx - 10, cy); ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + Rr, cy);
    ctx.moveTo(cx, cy - Rr); ctx.lineTo(cx, cy - 10); ctx.moveTo(cx, cy + 10); ctx.lineTo(cx, cy + Rr); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - Rr, cy); ctx.lineTo(cx - Rr * 0.5, cy); ctx.moveTo(cx + Rr * 0.5, cy); ctx.lineTo(cx + Rr, cy);
    ctx.moveTo(cx, cy + Rr * 0.5); ctx.lineTo(cx, cy + Rr); ctx.stroke();
    ctx.lineWidth = 1.2; for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(cx - 5, cy + k * 18); ctx.lineTo(cx + 5, cy + k * 18); ctx.stroke(); }
    ctx.fillStyle = "#e5484d"; ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0, 7); ctx.fill();
    const gl = ctx.createLinearGradient(cx - Rr, cy - Rr, cx, cy); gl.addColorStop(0, "rgba(180,220,255,.16)"); gl.addColorStop(1, "rgba(180,220,255,0)");
    ctx.fillStyle = gl; ctx.fillRect(cx - Rr, cy - Rr, Rr * 2, Rr * 2);
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
    $("coins").textContent = "🪙 +" + match.earned;
    if (R) {
      $("role").textContent = `Раунд ${R.n + 1}/${ROUNDS} · ` + (R.iHide ? "🏃 Прячься и собирай деньги" : "🎯 Найди и подстрели");
      const ammo = $("ammo");
      if (!R.iHide) ammo.innerHTML = Array.from({ length: R.mag }, (_, i) => `<b class="${i < R.mag - R.bullets ? "used" : ""}"></b>`).join("");
      else ammo.innerHTML = "";
    }
  }
  function controls(kind) {
    const c = $("controls");
    if (kind === "hider") {
      c.innerHTML = `<button class="ctl" id="c-l">◀</button><div class="mid"><button class="ctl small" id="c-c">🧎</button></div><button class="ctl" id="c-r">▶</button>`;
      const hold = (id, k) => {
        const el = $(id);
        el.addEventListener("pointerdown", (e) => { e.preventDefault(); keys[k] = true; el.classList.add("on"); T.haptic("select"); });
        ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => el.addEventListener(ev, () => { keys[k] = false; el.classList.remove("on"); }));
      };
      hold("c-l", "l"); hold("c-r", "r");
      $("c-c").addEventListener("pointerdown", (e) => { e.preventDefault(); pos.st = pos.st ? 0 : 1; $("c-c").textContent = pos.st ? "🧍" : "🧎"; T.haptic("impact", "light"); });
    } else if (kind === "sniper") {
      c.innerHTML = `<div></div><button class="ctl fire" id="c-f">ОГОНЬ</button>`;
      $("c-f").addEventListener("pointerdown", (e) => { e.preventDefault(); fire(); });
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
    $("wallet").textContent = `🪙 ${wallet.coins}`;
    screen("screen-menu");
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
        wallet.coins -= price; wallet[k]++; saveWallet(); T.haptic("notify", "success"); window.Stats && Stats.event("buy_upgrade", { item: k, level: wallet[k], price }); render();
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
      opp.name = p.name || "Друг";
      window.Stats && Stats.event(room.isHost ? "invite_accepted" : "invite_join", {});
      room.send("info", { name: me.name, up: me.up });
      $("room-emoji").textContent = "✅"; $("room-title").textContent = `${opp.name} в игре!`; $("room-status").textContent = "Начинаем…";
      T.haptic("notify", "success");
      if (room.isHost) setTimeout(() => { if (room && room.peer) hostStartMatch(); }, 1200);
    });
    room.on("info", (d) => { if (d) { opp.name = (d.name || opp.name).slice(0, 20); opp.up = d.up || opp.up; hud(); } });
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
    $("end-sub").textContent = match ? "Монеты за матч сохранены." : ""; $("end-coins").textContent = ""; $("end-status").textContent = "";
    if (match && match.earned) { wallet.coins += match.earned; saveWallet(); match.earned = 0; }
    buttons("end-buttons", [["⚔️ Позвать снова", "primary", () => { toMenu(); createRoom(); }], ["В меню", "ghost", toMenu]]);
    screen("screen-end");
  }

  // ---------- сообщения матча (одинаково для онлайна и бота) ----------
  function bindGame(rm) {
    rm.on("start", (d) => beginMatch(d.seed));
    rm.on("round", (d) => beginRound(d));
    rm.on("pos", (d) => { if (R && !R.iHide) { remote.tx = d.x; remote.st = d.st; remote.dir = d.dir; remote.moving = !!d.m; } });
    rm.on("hp", (d) => { if (match) { match.hp.opp = d.hp; flashBar("h2"); hud(); } });
    rm.on("ko", () => { if (isHost()) setTimeout(() => hostEndRound("ko"), 500); });
    rm.on("out", () => { if (isHost()) setTimeout(() => hostEndRound("ammo"), 1300); });
    rm.on("emo", (d) => bubble("opp", d.e));
    rm.on("shot", (d) => applyShot(d, false));
    rm.on("pick", (d) => { if (R && R.pickups[d.i]) R.pickups[d.i].taken = true; });
    rm.on("rend", (d) => onRoundEnd(d));
    rm.on("mend", () => endMatch());
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
    if (n >= ROUNDS || match.hp.me <= 0 || match.hp.opp <= 0) { send("mend", {}); endMatch(); return; }
    const pick = Array.from({ length: 4 }, () => Math.round(14 + Math.random() * (WW - 28)));
    const d = { n, hiderHost: n % 2 === 1, pick };
    send("round", d); beginRound(d);
  }
  function hostEndRound(reason) {
    if (!R || R.ended) return;
    const d = { n: R.n, reason };
    send("rend", d); onRoundEnd(d);
    const next = R.n + 1;
    setTimeout(() => hostNextRound(next), 3400);
  }

  function beginMatch(seed) {
    maps = { host: genMap(seed * 2 + 1), guest: genMap(seed * 2 + 2) };
    maps.host.theme = 0; maps.guest.theme = 1;
    map = maps.host; layerDirty = true;
    $("vs-n1").textContent = me.name; $("vs-n2").textContent = opp.name;
    $("vs-a1").textContent = (me.name[0] || "Я").toUpperCase(); $("vs-a2").textContent = opp.name.startsWith("🤖") ? "🤖" : (opp.name[0] || "?").toUpperCase();
    show("vs", true); setTimeout(() => show("vs", false), 1400);
    show("tools", true); $("snd-btn").textContent = Snd.on ? "🔊" : "🔇";
    match = { hp: { me: 100, opp: 100 }, earned: 0, hits: 0, survived: 0, picks: 0 };
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
    map = maps[hostHides ? "host" : "guest"]; layerDirty = true;
    R = { n: d.n, iHide: iH, pickups: d.pick.map((x) => ({ x, taken: false })), mag: BASE_MAG + (iH ? 0 : me.up.mag),
      bullets: 0, start: now, ended: false, reveal: false, shots: 0, endAt: now + PREP + DUR };
    R.bullets = R.mag;
    phase = "prep";
    if (iH) { pos = startPos(); controls("hider"); }
    else { aim = { x: WW / 2, y: G - 50 }; remote = { x: WW / 2, tx: WW / 2, st: 0, dir: 1, walk: 0, moving: false }; controls("sniper"); }
    remoteAim = { x: WW / 2, y: 190, tx: WW / 2, ty: 190 };
    keys = { l: false, r: false };
    hud();
    T.haptic("impact", "medium");
    banner(`РАУНД ${d.n + 1} / ${ROUNDS}`, iH ? "ТЫ ПРЯЧЕШЬСЯ" : "ТЫ СНАЙПЕР",
      (iH ? "Твой остров. Беги между укрытиями, собирай $" : `Остров соперника · ${R.mag} патрона`) + ` · ${THEMES[map.theme].name}`);
    if (mode === "bot") bot.beginRound();
    window.Stats && Stats.state({ round: d.n, hide: iH, hp: match.hp.me });
  }

  function goLive() {
    phase = "live"; big(""); Snd.beep(true);
    msg(R.iHide ? "Беги! Снайпер ищет тебя 👀" : "Огонь по готовности 🎯", 1300);
    T.haptic("impact", "heavy");
  }

  // ---------- выстрел ----------
  function fire() {
    if (phase !== "live" || !R || R.iHide || R.bullets <= 0) return;
    R.bullets--; R.shots++;
    const x = aim.x, y = aim.y, target = remote;
    const b = bodyRect(target);
    let res = null;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= G) res = y < b.y + 18 ? "head" : "body";
    const dmg = res ? Math.round((res === "head" ? HEAD : BODY) * (1 - 0.12 * (opp.up.armor || 0))) : 0;
    const d = { x, y, res, dmg };
    send("shot", d); applyShot(d, true);
    T.haptic("impact", "heavy"); Snd.shot(); kick = 1;
    hud();
    if (R.bullets <= 0) {
      if (isHost()) setTimeout(() => hostEndRound("ammo"), 1300); else send("out", {});
    }
  }
  function applyShot(d, byMe) {
    if (!R) return;
    const c = map.covers.find((c) => d.x >= c.x && d.x <= c.x + c.w && d.y >= G - c.h && d.y <= G && !inOpening(c, d.x, d.y));
    if (c) { c.open.push({ t: "c", x: d.x, y: d.y, r: 4 }); layerDirty = true; fx.push({ kind: "dust", x: d.x, y: d.y, t: 0, life: 0.6, seed: Math.random() * 6 }); if (byMe) setTimeout(() => Snd.thud(), 90); }
    fx.push({ kind: "flash", x: d.x, y: d.y, t: 0, life: 0.25 });
    if (!byMe) Snd.far();
    if (d.res) {
      fx.push({ kind: "txt", text: `−${d.dmg}`, color: "#ff5a5a", x: d.x, y: d.y - 8, t: 0, life: 1 });
      if (byMe) {
        match.earned += d.res === "head" ? 20 : 10; match.hits++; Snd.hit();
        msg(d.res === "head" ? `В ГОЛОВУ! 💀<br>+20 🪙` : `Попал! +10 🪙`, 1400);
        if (mode === "bot") { match.hp.opp -= d.dmg; flashBar("h2"); if (match.hp.opp <= 0) setTimeout(() => hostEndRound("ko"), 500); if (Math.random() < 0.5) setTimeout(() => bubble("opp", pick(["😡", "😱", "🤡"])), 600); }
      } else {
        match.hp.me -= d.dmg; flashBar("h1"); shake = 1; Snd.hit();
        send("hp", { hp: match.hp.me });
        msg(d.res === "head" ? "Тебе в голову! 😵" : "Тебя ранили! 🩸", 1300); T.haptic("notify", "error");
        if (match.hp.me <= 0) { if (isHost()) setTimeout(() => hostEndRound("ko"), 500); else send("ko", {}); }
        if (mode === "bot" && Math.random() < 0.6) setTimeout(() => bubble("opp", pick(["😂", "😎", "🖕", "🔥"])), 700);
      }
    } else if (byMe) {
      const p = remote, dist = Math.hypot(d.x - p.x, d.y - (G - 35));
      msg(dist < 30 ? "Совсем рядом! 😬" : dist < 70 ? "Тепло…" : "Мимо", 900);
    } else {
      const dist = Math.hypot(d.x - pos.x, d.y - (G - 35));
      if (dist < 40) { msg("Пуля рядом! 😱", 900); T.haptic("impact", "rigid"); shake = 0.4; }
    }
    hud();
  }
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
    const total = match.earned + bonus;
    window.Stats && Stats.gameEnd({ mode, win, draw, hp_me: a, hp_opp: b, hits: match.hits, survived: match.survived, coins: total });
    wallet.coins += total; saveWallet();
    $("end-emoji").textContent = draw ? "🤝" : win ? "🏆" : "💀";
    $("end-title").textContent = draw ? "Ничья" : win ? "Победа!" : `Победил ${opp.name}`;
    $("end-sub").textContent = `Здоровье: ты ${Math.max(0, a)} · ${opp.name} ${Math.max(0, b)} · попаданий ${match.hits} · выжил раундов ${match.survived}`;
    $("end-coins").textContent = `+${total} 🪙 (бонус за ${draw ? "ничью" : win ? "победу" : "участие"} ${bonus})`;
    $("end-status").textContent = "";
    match.earned = 0;
    const list = [["🔁 Реванш", "primary", askRematch], ["🛒 Улучшения", "", () => { openShop(); $("shop-close").onclick = () => screen("screen-end"); }]];
    if (mode === "online") list.push(["Выйти в меню", "ghost", toMenu]); else list.push(["⚔️ Позвать друга", "", () => { toMenu(); createRoom(); }], ["В меню", "ghost", toMenu]);
    buttons("end-buttons", list);
    setTimeout(() => screen("screen-end"), 800);
  }
  function askRematch() {
    if (mode === "bot") { startBot(); return; }
    rematch.me = true; me.up = myUp(); send("info", { name: me.name, up: me.up }); send("rematch", {});
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
      if (R.iHide) { this.aim = { x: WW * Math.random(), y: 190 }; }
      else { this.pos = startPos(); }
    },
    hideSpot() {
      for (let i = 0; i < 200; i++) {
        const c = map.covers[Math.floor(Math.random() * map.covers.length)];
        const p = { x: c.x + 12 + Math.random() * (c.w - 24), st: c.h < 72 || Math.random() < 0.35 ? 1 : 0 };
        const s = coverState(p); if (s.hidden && !s.peek.length) return p;
      }
      return { x: this.pos.x, st: 1 };
    },
    update(dt) {
      if (!R || phase !== "live") return;
      if (!R.iHide) {                        // бот прячется
        const p = this.pos;
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
        const a = this.aim, vis = visible(pos);
        if (vis) { if (this.seenAt < 0) this.seenAt = now; this.lastSeen = { x: pos.x, y: G - (pos.st ? 30 : 50) }; } else this.seenAt = -1;
        let tx, ty;
        const vx = (pos.x - (this.px == null ? pos.x : this.px)) / Math.max(dt, 0.001); this.px = pos.x;
        if (vis && now - this.seenAt > 0.45) { const b = bodyRect(pos); tx = pos.x + vx * 0.18; ty = b.y + (this.headAim ? 8 : 26); }
        else if (this.lastSeen) { tx = this.lastSeen.x + Math.sin(now * 1.7) * 30; ty = this.lastSeen.y; }
        else { tx = WW / 2 + Math.sin(now * 0.6) * 150; ty = 185 + Math.sin(now * 1.1) * 15; }
        const k = Math.min(1, dt * (vis ? 7 : 1.5));
        a.x += (tx - a.x) * k; a.y += (ty - a.y) * k;
        if (R.bullets <= 0 && !R.botOut) { R.botOut = true; setTimeout(() => hostEndRound("ammo"), 1300); }
        if (now > this.nextShot && R.bullets > 0) {
          const b = bodyRect(pos), onTarget = a.x > b.x - 3 && a.x < b.x + b.w + 3 && a.y > b.y && a.y < G;
          const wild = !vis && this.lastSeen && Math.random() < 0.006;
          if ((vis && onTarget && now - this.seenAt > 0.7) || wild) {
            R.bullets--; this.nextShot = now + 1.1; this.headAim = Math.random() < 0.3;
            const x = a.x + (Math.random() - 0.5) * 10, y = a.y + (Math.random() - 0.5) * 8;
            let res = null; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= G) res = y < b.y + 18 ? "head" : "body";
            const dmg = res ? Math.round((res === "head" ? HEAD : BODY) * (1 - 0.12 * me.up.armor)) : 0;
            emit("shot", { x, y, res, dmg });
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
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts; now = ts / 1000;
    if (R && phase === "prep") {
      const left = Math.ceil(R.start + PREP - now);
      if (left !== R.lastBeep && left > 0) { R.lastBeep = left; Snd.beep(false); }
      big(left > 0 ? String(left) : "");
      if (!R.iHide && !R.prepMsg) { R.prepMsg = true; msg("Противник прячется…", 2900); }
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
        if (sendT <= 0) { send("pos", { x: Math.round(pos.x * 10) / 10, st: pos.st, dir: pos.dir, m: mv ? 1 : 0 }); sendT = 1 / 12; }

      } else {
        remote.x += (remote.tx - remote.x) * Math.min(1, dt * 12);
        remote.walk = remote.moving ? remote.walk + dt * 12 : 0;

      }
      if (mode === "bot") bot.update(dt);
      if (phase === "live" && isHost() && now > R.endAt + 0.3) hostEndRound("time");

    }
    render(dt, now);
    requestAnimationFrame(frame);
  }

  // ---------- ввод прицела ----------
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); drag = { x: e.clientX, y: e.clientY }; });
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
    if (!drag) return;
    if (R && !R.iHide && (phase === "live" || phase === "prep")) {
      const Z = 2.3 + 0.35 * me.up.zoom, k = 1 / (S * Z) * 1.15;
      aim.x = Math.max(0, Math.min(WW, aim.x + (e.clientX - drag.x) * k));
      aim.y = Math.max(90, Math.min(WH - 20, aim.y + (e.clientY - drag.y) * k));
    }
    drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => { drag = null; });
  window.addEventListener("keydown", (e) => {
    if (!R) return;
    if (R.iHide) { if (e.key === "ArrowLeft") keys.l = true; if (e.key === "ArrowRight") keys.r = true; if (e.key === "ArrowDown") pos.st = 1; if (e.key === "ArrowUp") pos.st = 0; }
    else { const d = e.shiftKey ? 1 : 6; if (e.key === "ArrowLeft") aim.x -= d; if (e.key === "ArrowRight") aim.x += d; if (e.key === "ArrowUp") aim.y -= d; if (e.key === "ArrowDown") aim.y += d; if (e.key === " ") fire(); }
  });
  window.addEventListener("keyup", (e) => { if (e.key === "ArrowLeft") keys.l = false; if (e.key === "ArrowRight") keys.r = false; });

  // ---------- старт ----------
  $("m-invite").onclick = () => { mode = "online"; me.up = myUp(); createRoom(); };
  $("m-bot").onclick = () => startBot();
  $("m-shop").onclick = () => { openShop(); $("shop-close").onclick = toMenu; };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#0b1226", bg: "#0b1226", back: "../" });
  me.name = T.playerName() === "Друг" ? "Ты" : T.playerName();
  resize();
  loadWallet(() => {
    $("wallet").textContent = `🪙 ${wallet.coins}`;
    me.up = myUp();
    const inv = Net.readInvite();
    map = genMap(7); layerDirty = true;
    if (inv) { mode = "online"; joinRoom(inv); } else toMenu();
  });
  requestAnimationFrame(frame);

  window.__game = {
    get phase() { return phase; }, get R() { return R; }, get match() { return match; }, get pos() { return pos; }, get aim() { return aim; },
    get remote() { return remote; }, get map() { return map; }, get wallet() { return wallet; }, get roomId() { return room && room.id; }, get mode() { return mode; }, keys, fire, coverState,
    aimAt(x, y) { aim.x = x; aim.y = y; }, setPos(x, st) { pos.x = x; pos.st = st; }, startBot, createRoom
  };
})();
