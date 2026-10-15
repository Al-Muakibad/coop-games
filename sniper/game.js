/* Снайпер: прятки — пошаговый батл. Набор «Кооп-игры». */
(function () {
  "use strict";
  const T = window.TG;
  const $ = (id) => document.getElementById(id);
  const WW = 360, WH = 300, G = 232;           // размеры мира и линия земли
  const BULLETS = 3, MAX_TURNS = 6, HEAD_DMG = 60, BODY_DMG = 30;
  const COL = { 1: "#ff7a2f", 2: "#2f7cf6" };

  // ---------- экран ----------
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1, S = 1, OX = 0, OY = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    const top = 112, bottom = 165;
    S = Math.min(W / WW, (H - top - bottom) / WH);
    OX = (W - WW * S) / 2; OY = top + ((H - top - bottom) - WH * S) / 2;
  }
  window.addEventListener("resize", () => { resize(); layerDirty = true; }); resize();

  // ---------- карта ----------
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0 || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function genMap(seed) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const r = rng(seed * 31 + attempt), covers = [];
      let x = 8 + r() * 14, tall = 0;
      for (;;) {
        const t = r(); let c;
        if (t < 0.45) {
          const w = 74 + r() * 40, h = 84 + r() * 16;
          c = { kind: "wall", x, w, h, open: [] };
          if (r() < 0.4) { const ww = 16 + r() * 8; c.open.push({ t: "r", x: x + w * (0.3 + r() * 0.4) - ww / 2, y: G - h + 12, w: ww, h: 28 }); }
        } else if (t < 0.62) c = { kind: "low", x, w: 96 + r() * 34, h: 52, open: [] };
        else if (t < 0.82) c = { kind: "crate", x, w: 52 + r() * 10, h: 50 + r() * 4, open: [] };
        else c = { kind: "barrel", x, w: 34, h: 56, open: [] };
        if (x + c.w > WW - 6) break;
        if (c.kind === "wall") tall++;
        covers.push(c); x += c.w + 18 + r() * 26;
      }
      if (tall >= 2 && covers.length >= 3) return { covers, deco: r() };
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
  // {hidden, peek, openings через которые видно}
  function coverState(p) {
    const b = bodyRect(p);
    const c = map.covers.find((c) => c.x <= b.x && b.x + b.w <= c.x + c.w && G - c.h <= b.y);
    if (!c) return { hidden: false, peek: [] };
    const peek = c.open.filter((o) => openHitsRect(o, b));
    return { hidden: true, peek, cover: c };
  }

  // ---------- состояние ----------
  let map, mode = "menu", phase = "menu", turn = 0, hp = { 1: 100, 2: 100 };
  let players = {}, hider = 1, shooter = 2, pos = { x: WW / 2, st: 0 };
  let bullets = 0, cross = { x: WW / 2, y: G - 50 }, lastShot = null, shotsUsed = 0, hitKind = null;
  let fx = [], layerDirty = true, revealT = 0, challenge = null, chResult = null;

  // ---------- кодирование вызова ----------
  const XOR = 0x2A5F3;
  function encode(seed, x, st) {
    let n = ((seed % 1000) * 361 + Math.round(x)) * 2 + st; n ^= XOR;
    let s = n.toString(36); while (s.length < 5) s = "0" + s; return s;
  }
  function decode(s) {
    let n = parseInt(s, 36) ^ XOR; const st = n % 2; n = (n - st) / 2;
    const x = n % 361, seed = (n - x) / 361; return { seed, x, st };
  }
  function readLink() {
    const p = new URLSearchParams(location.search).get("c");
    const m = p && /^h([0-9a-z]{5})([A-Za-z0-9_-]{0,48})$/.exec(p);
    if (!m) return null;
    const d = decode(m[1]); if (!(d.seed >= 0 && d.seed < 1000)) return null;
    let name = "Друг"; try { name = T.unb64url(m[2]).slice(0, 16) || "Друг"; } catch (_) {}
    return { ...d, name };
  }

  // ---------- рисование ----------
  const layer = document.createElement("canvas"); const LR = 4;
  layer.width = WW * LR; layer.height = WH * LR; const lctx = layer.getContext("2d");
  function bricks(g, x, y, w, h, base, line) {
    g.fillStyle = base; g.fillRect(x, y, w, h);
    g.strokeStyle = line; g.lineWidth = 1;
    for (let r = 0, yy = y + 9; yy < y + h; yy += 9, r++) {
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
      for (let xx = x + (r % 2 ? 9 : 0); xx < x + w; xx += 18) { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + 9); g.stroke(); }
    }
  }
  function drawLayer() {
    lctx.setTransform(LR, 0, 0, LR, 0, 0); lctx.clearRect(0, 0, WW, WH);
    lctx.globalCompositeOperation = "source-over";
    for (const c of map.covers) {
      const y = G - c.h;
      if (c.kind === "wall" || c.kind === "low") {
        bricks(lctx, c.x, y, c.w, c.h, c.kind === "wall" ? "#a9744c" : "#b8865a", "rgba(70,40,20,.55)");
        lctx.fillStyle = "#8c5f3e"; lctx.fillRect(c.x - 3, y - 5, c.w + 6, 6);
        lctx.fillStyle = "rgba(90,140,60,.55)";
        for (let i = 0; i < c.w / 16; i++) lctx.fillRect(c.x + ((i * 37) % c.w), y + 10 + ((i * 23) % (c.h - 20)), 6, 3);
      } else if (c.kind === "crate") {
        lctx.fillStyle = "#c8914b"; lctx.fillRect(c.x, y, c.w, c.h);
        lctx.strokeStyle = "#7a5228"; lctx.lineWidth = 3; lctx.strokeRect(c.x + 1.5, y + 1.5, c.w - 3, c.h - 3);
        lctx.beginPath(); lctx.moveTo(c.x + 3, y + 3); lctx.lineTo(c.x + c.w - 3, y + c.h - 3);
        lctx.moveTo(c.x + c.w - 3, y + 3); lctx.lineTo(c.x + 3, y + c.h - 3); lctx.stroke();
      } else {
        lctx.fillStyle = "#3f7d4f"; lctx.beginPath(); lctx.roundRect(c.x, y, c.w, c.h, 5); lctx.fill();
        lctx.fillStyle = "#2e5e3a"; lctx.fillRect(c.x, y + 12, c.w, 4); lctx.fillRect(c.x, y + c.h - 16, c.w, 4);
        lctx.fillStyle = "#e5484d"; lctx.save(); lctx.translate(c.x + c.w / 2, y + c.h / 2); lctx.rotate(Math.PI / 4);
        lctx.fillRect(-6, -6, 12, 12); lctx.restore();
      }
      lctx.strokeStyle = "#2b1d14"; lctx.lineWidth = 1.5; lctx.strokeRect(c.x, y, c.w, c.h);
    }
    lctx.globalCompositeOperation = "destination-out";
    for (const c of map.covers) for (const o of c.open) {
      lctx.beginPath(); if (o.t === "r") lctx.rect(o.x, o.y, o.w, o.h); else lctx.arc(o.x, o.y, o.r, 0, 7); lctx.fill();
    }
    lctx.globalCompositeOperation = "source-over";
    for (const c of map.covers) for (const o of c.open) if (o.t === "c") {
      lctx.strokeStyle = "rgba(40,20,10,.7)"; lctx.lineWidth = 1.6; lctx.beginPath(); lctx.arc(o.x, o.y, o.r + 0.6, 0, 7); lctx.stroke();
    }
    layerDirty = false;
  }

  function drawBg() {
    const sky = ctx.createLinearGradient(0, 0, 0, 140);
    sky.addColorStop(0, "#5fb4f0"); sky.addColorStop(1, "#bfe6ff");
    ctx.fillStyle = sky; ctx.fillRect(-WW, -WH, WW * 3, 140 + WH);
    ctx.fillStyle = "#2c86c9"; ctx.fillRect(-WW, 140, WW * 3, 38);
    ctx.fillStyle = "#3c9be0"; ctx.fillRect(-WW, 140, WW * 3, 6);
    // остров с вражеской базой вдали
    const ix = 70 + map.deco * 200;
    ctx.fillStyle = "#d9b26a"; ctx.beginPath(); ctx.ellipse(ix, 143, 60, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#a9744c"; ctx.fillRect(ix - 30, 129, 16, 12); ctx.fillRect(ix + 12, 129, 16, 12);
    const sand = ctx.createLinearGradient(0, 176, 0, WH);
    sand.addColorStop(0, "#e2b66f"); sand.addColorStop(1, "#b98545");
    ctx.fillStyle = sand; ctx.fillRect(-WW, 176, WW * 3, WH * 2);
    ctx.fillStyle = "rgba(0,0,0,.12)";
    for (const c of map.covers) ctx.fillRect(c.x - 2, G, c.w + 10, 5);
  }

  function drawSoldier(p, color, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const x = p.x, ink = "#1d1712";
    if (!p.st) {
      ctx.fillStyle = "#4b5a34"; ctx.fillRect(x - 8, G - 26, 7, 26); ctx.fillRect(x + 1, G - 26, 7, 26);
      ctx.fillStyle = color; ctx.fillRect(x - 11, G - 54, 22, 30);
      ctx.fillStyle = "#f1c7a0"; ctx.beginPath(); ctx.arc(x, G - 61, 9, 0, 7); ctx.fill();
      ctx.fillStyle = "#4b5a34"; ctx.beginPath(); ctx.arc(x, G - 63, 9.5, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 4, G - 44); ctx.lineTo(x + 20, G - 50); ctx.stroke();
    } else {
      ctx.fillStyle = "#4b5a34"; ctx.fillRect(x - 11, G - 14, 22, 14);
      ctx.fillStyle = color; ctx.fillRect(x - 11, G - 34, 22, 21);
      ctx.fillStyle = "#f1c7a0"; ctx.beginPath(); ctx.arc(x, G - 37, 9, 0, 7); ctx.fill();
      ctx.fillStyle = "#4b5a34"; ctx.beginPath(); ctx.arc(x, G - 39, 9.5, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 4, G - 26); ctx.lineTo(x + 20, G - 30); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFx(dt) {
    fx = fx.filter((f) => (f.t += dt) < f.life);
    for (const f of fx) {
      const k = f.t / f.life;
      if (f.kind === "dust") {
        ctx.fillStyle = `rgba(230,200,150,${1 - k})`;
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + f.seed; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * k * 14, f.y + Math.sin(a) * k * 10, 3 + k * 3, 0, 7); ctx.fill(); }
      } else {
        ctx.globalAlpha = 1 - k; ctx.font = `${16 + k * 14}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(f.text, f.x, f.y - k * 18); ctx.globalAlpha = 1;
      }
    }
  }

  function drawWorld(dt, scale, ox, oy) {
    ctx.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * ox, DPR * oy);
    drawBg();
    const showHider = phase !== "menu";
    if (showHider) drawSoldier(pos, COL[hider]);       // за укрытиями: видно только через дыры и окна
    if (layerDirty) drawLayer();
    ctx.drawImage(layer, 0, 0, WW, WH);
    if (phase === "hide" && !players[hider].bot) {      // прячущийся видит себя полупрозрачным
      const st = coverState(pos);
      drawSoldier(pos, COL[hider], 0.5);
      const b = bodyRect(pos);
      ctx.strokeStyle = st.hidden && !st.peek.length ? "#22c55e" : st.hidden ? "#ffd34d" : "#e5484d";
      ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); ctx.setLineDash([]);
    }
    if (phase === "reveal") {
      const pulse = 0.6 + 0.4 * Math.sin(revealT * 8);
      drawSoldier(pos, COL[hider], 0.95);
      const b = bodyRect(pos);
      ctx.strokeStyle = `rgba(255,211,77,${pulse})`; ctx.lineWidth = 3; ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    }
    drawFx(dt);
  }

  function render(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#101831"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!map) return;
    drawWorld(dt, S, OX, OY);
    const aiming = phase === "shoot" || phase === "botaim";
    if (!aiming) return;
    // затемнение и прицел с увеличением
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "rgba(5,8,20,.6)"; ctx.fillRect(0, 0, W, H);
    const px = OX + cross.x * S, py = OY + cross.y * S, R = Math.min(W * 0.36, 150), Z = 2.4;
    ctx.save(); ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.clip();
    drawWorld(0, S * Z, px - cross.x * S * Z, py - cross.y * S * Z);
    ctx.restore();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(px, py, R + 4, 0, 7); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(px - R, py); ctx.lineTo(px - 8, py); ctx.moveTo(px + 8, py); ctx.lineTo(px + R, py);
    ctx.moveTo(px, py - R); ctx.lineTo(px, py - 8); ctx.moveTo(px, py + 8); ctx.lineTo(px, py + R); ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px - R, py); ctx.lineTo(px - R * 0.55, py); ctx.moveTo(px + R * 0.55, py); ctx.lineTo(px + R, py);
    ctx.moveTo(px, py + R * 0.55); ctx.lineTo(px, py + R); ctx.stroke();
    ctx.fillStyle = "#e5484d"; ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 7); ctx.fill();
  }

  let last = 0;
  function frame(t) {
    const dt = Math.min((t - (last || t)) / 1000, 0.05); last = t;
    if (phase === "reveal") revealT += dt;
    if (bot.anim) bot.step(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  // ---------- UI ----------
  function show(id, on) { $(id).classList.toggle("hidden", !on); }
  let msgTimer = 0;
  function msg(text, ms) {
    const el = $("msg"); el.textContent = text; el.classList.add("on");
    clearTimeout(msgTimer); msgTimer = setTimeout(() => el.classList.remove("on"), ms || 1400);
  }
  function hud() {
    $("n1").textContent = players[1].name; $("n2").textContent = players[2].name;
    $("h1").style.width = Math.max(0, hp[1]) + "%"; $("h2").style.width = Math.max(0, hp[2]) + "%";
    const turnNo = mode === "challenge" || mode === "link" ? "" : `Раунд ${Math.floor(turn / 2) + 1}/3 · `;
    $("turn").textContent = phase === "hide" ? `${turnNo}🫣 Прячется ${players[hider].name}`
      : `${turnNo}🎯 Стреляет ${players[shooter].name}`;
    $("bullets").textContent = phase === "shoot" || phase === "botaim" || phase === "reveal"
      ? "🔸".repeat(bullets) + "▫️".repeat(BULLETS - bullets) : "";
  }
  function controls(html) { const c = $("controls"); c.innerHTML = html; show("controls", !!html); }
  function hint(text) { $("hint").textContent = text || ""; show("hint", !!text); }

  // ---------- матч ----------
  function setupPlayers() {
    const me = T.playerName();
    if (mode === "bot") players = { 1: { name: me === "Друг" ? "Ты" : me }, 2: { name: "🤖 Бот", bot: true } };
    else if (mode === "local") players = { 1: { name: "🟠 Оранжевый" }, 2: { name: "🔵 Синий" } };
    else if (mode === "challenge") players = { 1: { name: me === "Друг" ? "Ты" : me }, 2: { name: challenge.name } };
    else players = { 1: { name: me === "Друг" ? "Ты" : me }, 2: { name: "Друг" } };
  }

  function newMatch(m) {
    mode = m; turn = 0; hp = { 1: 100, 2: 100 }; fx = [];
    const seed = m === "challenge" ? challenge.seed : Math.floor(Math.random() * 1000);
    map = genMap(seed); map.seed = seed; layerDirty = true;
    setupPlayers();
    ["screen-menu", "screen-end", "screen-pass"].forEach((s) => show(s, false));
    show("hud", true);
    if (m === "link") { hider = 1; shooter = 2; goHide(); return; }
    if (m === "challenge") { hider = 2; shooter = 1; pos = { x: challenge.x, st: challenge.st }; goShoot(); return; }
    startTurn();
  }

  function startTurn() {
    if (hp[1] <= 0 || hp[2] <= 0 || turn >= MAX_TURNS) return endMatch();
    hider = turn % 2 === 0 ? 2 : 1; shooter = hider === 1 ? 2 : 1;
    if (players[hider].bot) { pos = bot.hide(); goShoot(); return; }
    if (mode === "local") return pass(hider, "hide");
    goHide();
  }

  function pass(who, what) {
    phase = "pass"; controls(""); hint("");
    const other = players[who === 1 ? 2 : 1].name;
    $("pass-emoji").textContent = what === "hide" ? "🫣" : "🎯";
    $("pass-title").textContent = `Телефон — ${players[who].name}`;
    $("pass-sub").textContent = what === "hide" ? `${other}, отвернись! Сейчас ${players[who].name} прячется.`
      : `${players[who].name}, твой выстрел. У тебя ${BULLETS} пули.`;
    $("pass-go").onclick = () => { show("screen-pass", false); what === "hide" ? goHide() : goShoot(); };
    show("screen-pass", true);
  }

  function goHide() {
    phase = "hide"; pos = { x: WW / 2, st: 0 };
    const c = map.covers[Math.floor(map.covers.length / 2)]; pos.x = c.x + c.w / 2;
    hud();
    hint("Двигай пальцем по экрану. Зелёная рамка — тебя не видно");
    controls(`<button class="btn" id="b-st">🧎 Присесть</button><button class="btn primary" id="b-ok">Спрятался ✅</button>`);
    $("b-st").onclick = () => { pos.st = pos.st ? 0 : 1; $("b-st").textContent = pos.st ? "🧍 Встать" : "🧎 Присесть"; checkHide(); };
    $("b-ok").onclick = confirmHide;
    checkHide();
  }
  function checkHide() {
    const st = coverState(pos), ok = st.hidden;
    const b = $("b-ok"); if (b) { b.disabled = !ok; b.style.opacity = ok ? 1 : 0.5; }
    hint(!st.hidden ? "❌ Тебя видно — встань за укрытие" : st.peek.length ? "⚠️ Тебя видно через дыру или окно!" : "✅ Спрятан. Можно подтверждать");
  }
  function confirmHide() {
    if (phase !== "hide" || !coverState(pos).hidden) return;
    T.haptic("impact", "medium"); hint("");
    if (mode === "link") return shareHide();
    if (players[shooter].bot) { goShoot(); bot.start(); return; }
    if (mode === "local") return pass(shooter, "shoot");
    goShoot();
  }

  function goShoot() {
    phase = players[shooter].bot ? "botaim" : "shoot";
    bullets = BULLETS; shotsUsed = 0; lastShot = null; hitKind = null;
    cross = { x: WW / 2, y: G - 50 };
    hud();
    if (phase === "shoot") {
      hint("Води пальцем — двигай прицел. Стены пробиваются насквозь");
      controls(`<button id="fire">ОГОНЬ</button>`);
      $("fire").addEventListener("pointerdown", (e) => { e.preventDefault(); fire(); });
    } else { controls(""); hint(`${players[shooter].name} целится…`); }
  }

  function fire() {
    if ((phase !== "shoot" && phase !== "botaim") || bullets <= 0) return;
    bullets--; shotsUsed++;
    const x = cross.x, y = cross.y;
    const c = map.covers.find((c) => x >= c.x && x <= c.x + c.w && y >= G - c.h && y <= G && !inOpening(c, x, y));
    if (c) { c.open.push({ t: "c", x, y, r: 4.5 }); layerDirty = true; fx.push({ kind: "dust", x, y, t: 0, life: 0.6, seed: Math.random() * 6 }); }
    T.haptic("impact", "heavy");
    const b = bodyRect(pos);
    let res = null;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= G) res = y < b.y + 18 ? "head" : "body";
    lastShot = { x, y, dist: Math.hypot(x - pos.x, y - (b.y + b.h / 2)) };
    hud();
    if (res) {
      hitKind = res;
      const dmg = res === "head" ? HEAD_DMG : BODY_DMG;
      hp[hider] -= dmg;
      fx.push({ kind: "txt", text: "💥", x, y, t: 0, life: 0.9 });
      msg(res === "head" ? `В ГОЛОВУ! −${HEAD_DMG} 💀` : `Попадание! −${BODY_DMG}`, 1600);
      T.haptic("notify", "success");
      return reveal(1700);
    }
    if (!c) fx.push({ kind: "txt", text: "💨", x, y, t: 0, life: 0.6 });
    msg(lastShot.dist < 34 ? "Совсем рядом! 😰" : lastShot.dist < 80 ? "Тепло…" : "Мимо", 1100);
    if (bullets <= 0) { setTimeout(() => { msg(`Не нашёл! ${players[hider].name} был тут 👇`, 1800); reveal(2000); }, 700); }
  }

  function reveal(ms) {
    phase = "reveal"; revealT = 0; controls(""); hint(""); bot.anim = null; hud();
    setTimeout(endTurn, ms);
  }
  function endTurn() {
    if (mode === "challenge") return challengeEnd();
    turn++; startTurn();
  }

  function endMatch() {
    phase = "end"; controls(""); hint(""); show("hud", true);
    const a = hp[1], b = hp[2];
    let emoji = "🤝", title = "Ничья";
    if (a !== b) { const w = a > b ? 1 : 2; emoji = players[w].bot ? "🤖" : "🏆"; title = `Победа: ${players[w].name}`; }
    $("end-emoji").textContent = emoji; $("end-title").textContent = title;
    $("end-sub").textContent = `Осталось здоровья — ${players[1].name}: ${Math.max(0, a)}, ${players[2].name}: ${Math.max(0, b)}`;
    endButtons([["Реванш", "primary", () => newMatch(mode)],
      ["✉️ Вызвать друга по ссылке", "", () => newMatch("link")],
      ["В меню", "ghost", toMenu]]);
    setTimeout(() => show("screen-end", true), 400);
  }

  function challengeEnd() {
    phase = "end"; controls(""); hint("");
    const found = !!hitKind;
    chResult = found ? shotsUsed : 0;
    $("end-emoji").textContent = found ? (hitKind === "head" ? "🎯" : "✅") : "😅";
    $("end-title").textContent = found ? `Нашёл ${challenge.name} с ${shotsUsed}-го выстрела!` : `${challenge.name} спрятался надёжно`;
    $("end-sub").textContent = found ? (hitKind === "head" ? "Точно в голову." : "Попал в корпус.") + " Теперь твоя очередь прятаться."
      : "Отомсти: спрячься сам и отправь ответный вызов.";
    endButtons([["🫣 Спрятаться и отправить ответку", "primary", () => newMatch("link")],
      ["🤖 Сыграть с ботом", "", () => newMatch("bot")],
      ["Другие игры", "ghost", () => { location.href = "../"; }]]);
    setTimeout(() => show("screen-end", true), 300);
  }

  function shareHide() {
    const me = T.playerName().slice(0, 12);
    const code = "h" + encode(map.seed, pos.x, pos.st) + T.b64url(me);
    const text = chResult === null ? "Я спрятался за стеной 🧱 У тебя 3 пули — найдёшь меня?"
      : chResult ? `Нашёл тебя с ${chResult}-го выстрела 🎯 Теперь я спрятался — найди меня!`
        : "Не нашёл тебя 😅 Ладно, теперь я спрятался — попробуй найти меня!";
    T.openLink(`https://t.me/share/url?url=${encodeURIComponent(T.gameLink("sniper", code))}&text=${encodeURIComponent(text)}`);
    phase = "end"; controls("");
    $("end-emoji").textContent = "✉️"; $("end-title").textContent = "Вызов отправлен";
    $("end-sub").textContent = "Выбери друга или чат в Telegram. Когда он сыграет — пришлёт ответку.";
    endButtons([["Отправить ещё раз", "primary", shareHide], ["🤖 Пока сыграть с ботом", "", () => newMatch("bot")], ["В меню", "ghost", toMenu]]);
    show("screen-end", true);
  }

  function endButtons(list) {
    const box = $("end-buttons"); box.innerHTML = "";
    for (const [label, cls, fn] of list) { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = label; b.onclick = fn; box.appendChild(b); }
  }
  function toMenu() {
    phase = "menu"; ["screen-end", "screen-pass", "hud", "controls", "hint"].forEach((s) => show(s, false));
    show("screen-menu", true);
  }

  // ---------- бот ----------
  const bot = {
    anim: null,
    hide() {
      for (let i = 0; i < 400; i++) {
        const c = map.covers[Math.floor(Math.random() * map.covers.length)];
        const p = { x: c.x + 12 + Math.random() * (c.w - 24), st: c.h < 72 || Math.random() < 0.4 ? 1 : 0 };
        const s = coverState(p);
        if (s.hidden && !s.peek.length) return p;
      }
      const c = map.covers[0]; return { x: c.x + c.w / 2, st: 1 };
    },
    target() {
      const b = bodyRect(pos), st = coverState(pos), j = (n) => (Math.random() - 0.5) * n;
      if (st.peek.length && Math.random() < 0.85) {            // видит через дыру
        const o = st.peek[0];
        const ox = o.t === "r" ? o.x + o.w / 2 : o.x, oy = o.t === "r" ? o.y + o.h / 2 : o.y;
        return { x: Math.max(b.x + 2, Math.min(b.x + b.w - 2, ox)) + j(4), y: Math.max(b.y + 4, Math.min(G - 4, oy)) + j(6) };
      }
      if (lastShot && lastShot.dist < 80) {                     // «тепло» — бьёт рядом
        const k = lastShot.dist < 34 ? 18 : 40;
        return { x: lastShot.x + j(k * 2), y: G - 20 - Math.random() * 40 };
      }
      const tot = map.covers.reduce((s, c) => s + c.w, 0); let r = Math.random() * tot, c = map.covers[0];
      for (const cc of map.covers) { if ((r -= cc.w) <= 0) { c = cc; break; } }
      return { x: c.x + 10 + Math.random() * (c.w - 20), y: G - 12 - Math.random() * Math.min(c.h - 8, 52) };
    },
    start() { setTimeout(() => this.aim(), 700); },
    aim() {
      if (phase !== "botaim" || bullets <= 0) return;
      const tg = this.target(), from = { ...cross };
      this.anim = { t: 0, dur: 1.1, from, tg };
    },
    step(dt) {
      const a = this.anim; a.t += dt;
      const k = Math.min(1, a.t / a.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      cross.x = a.from.x + (a.tg.x - a.from.x) * e + Math.sin(a.t * 9) * 2 * (1 - k);
      cross.y = a.from.y + (a.tg.y - a.from.y) * e + Math.cos(a.t * 7) * 2 * (1 - k);
      if (k >= 1) { this.anim = null; fire(); if (phase === "botaim") setTimeout(() => this.aim(), 900); }
    }
  };

  // ---------- ввод ----------
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault(); drag = { x: e.clientX, y: e.clientY };
    if (phase === "hide") movePos(e.clientX);
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (phase === "hide") movePos(e.clientX);
    if (phase === "shoot") {
      cross.x = Math.max(0, Math.min(WW, cross.x + (e.clientX - drag.x) / S * 0.6));
      cross.y = Math.max(60, Math.min(WH - 10, cross.y + (e.clientY - drag.y) / S * 0.6));
    }
    drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => { drag = null; });
  function movePos(cx) { pos.x = Math.max(12, Math.min(WW - 12, (cx - OX) / S)); checkHide(); }
  window.addEventListener("keydown", (e) => {
    if (phase === "shoot") {
      const d = e.shiftKey ? 1 : 5;
      if (e.key === "ArrowLeft") cross.x -= d; if (e.key === "ArrowRight") cross.x += d;
      if (e.key === "ArrowUp") cross.y -= d; if (e.key === "ArrowDown") cross.y += d;
      if (e.key === " ") fire();
    }
  });

  // ---------- старт ----------
  $("m-bot").onclick = () => newMatch("bot");
  $("m-local").onclick = () => newMatch("local");
  $("m-link").onclick = () => { chResult = null; newMatch("link"); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#101831", bg: "#101831", back: "../" });

  challenge = readLink();
  map = genMap(challenge ? challenge.seed : 7); map.seed = challenge ? challenge.seed : 7;
  if (challenge) {
    const el = $("challenge");
    el.innerHTML = `${challenge.name.replace(/[<>&]/g, "")} спрятался 🫣<br>У тебя 3 пули`;
    el.classList.remove("hidden");
    const b = document.createElement("button"); b.className = "btn primary"; b.textContent = "🎯 Найти и выстрелить";
    b.onclick = () => newMatch("challenge");
    el.after(b);
    $("m-bot").classList.remove("primary");
  }
  requestAnimationFrame(frame);

  window.__game = {
    get phase() { return phase; }, get hp() { return hp; }, get pos() { return pos; }, get cross() { return cross; },
    get map() { return map; }, get bullets() { return bullets; }, start: newMatch, fire, coverState,
    aimAt(x, y) { cross.x = x; cross.y = y; }, setPos(x, st) { pos.x = x; pos.st = st; checkHide(); }, confirmHide, encode, decode
  };
})();
