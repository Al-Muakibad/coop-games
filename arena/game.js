/* Змеиная арена (в духе slither.io). До 6 игроков, боты. Каждый сам ведёт свою змею (без задержки на своём телефоне),
   хозяин решает, кто что съел и кто в кого врезался. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const AW = 1500, AH = 1500, SEG = 7, SPEED = 140, BOOST = 245, TURN = 4.2, START_LEN = 14, FOOD = 230, DURATION = 150, RESPAWN = 3;
  const radius = (len) => 7 + Math.min(len, 400) / 45;

  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR;
  function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; canvas.width = W * DPR; canvas.height = H * DPR; }
  addEventListener("resize", resize); resize();

  let room = null, cfg = null, phase = "menu", ended = false, gt = 0, S = [], food = new Map(), foodId = 0, fx = [];
  let eaten = [], added = [];          // изменения еды для снимка
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const col = (i) => cfg.players[i].color;
  const pname = (i) => (i === cfg.me ? "Ты" : cfg.players[i].name);

  // ---------- змеи ----------
  function makeSnake(i, x, y, a) { return { x, y, a, ta: a, tx: x, ty: y, len: START_LEN, path: [[x, y]], alive: true, resp: 0, boost: false, best: START_LEN, kills: 0, sh: 1.2 }; }
  function spawnPoint() {
    let best = [AW / 2, AH / 2], bd = -1;
    for (let k = 0; k < 30; k++) {
      const x = 150 + Math.random() * (AW - 300), y = 150 + Math.random() * (AH - 300);
      let d = 1e9; for (const s of S) if (s && s.alive) for (let j = 0; j < s.path.length; j += 4) d = Math.min(d, Math.hypot(s.path[j][0] - x, s.path[j][1] - y));
      if (d > bd) { bd = d; best = [x, y]; }
    }
    return best;
  }
  function track(s) {                               // добавляем точки пути через каждые SEG пикселей
    let h = s.path[0], d = Math.hypot(s.x - h[0], s.y - h[1]);
    if (d > 300) { s.path = [[s.x, s.y]]; return; }
    while (d >= SEG) { const k = SEG / d; h = [h[0] + (s.x - h[0]) * k, h[1] + (s.y - h[1]) * k]; s.path.unshift(h); d = Math.hypot(s.x - h[0], s.y - h[1]); }
    const need = Math.ceil(s.len) + 1; if (s.path.length > need) s.path.length = need;
  }
  function steer(s, dt, speed) {
    let da = s.ta - s.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    s.a += Math.max(-TURN * dt, Math.min(TURN * dt, da));
    s.x += Math.cos(s.a) * speed * dt; s.y += Math.sin(s.a) * speed * dt;
  }

  // ---------- еда (хозяин) ----------
  function addFood(x, y, v) { const id = ++foodId; const f = [Math.round(x), Math.round(y), v, Math.floor(Math.random() * 6)]; food.set(id, f); added.push(id, f[0], f[1], v, f[3]); return id; }
  function eat(id) { if (food.delete(id)) eaten.push(id); }
  function hostWorld(dt) {
    while (food.size < FOOD) addFood(30 + Math.random() * (AW - 60), 30 + Math.random() * (AH - 60), 1);
    S.forEach((s, i) => {
      if (!s.alive) { s.resp -= dt; if (s.resp <= 0 && !ended) respawn(i); return; }
      const r = radius(s.len) + 9;
      for (const [id, f] of food) if (Math.abs(f[0] - s.x) < r && Math.abs(f[1] - s.y) < r && Math.hypot(f[0] - s.x, f[1] - s.y) < r) { eat(id); s.len += f[2] * 0.7; }
      if (s.boost && s.len > START_LEN) { s.len -= dt * 3.5; s.dropT = (s.dropT || 0) - dt; if (s.dropT <= 0) { s.dropT = 0.35; const t = s.path[s.path.length - 1]; addFood(t[0], t[1], 1); } }
      s.best = Math.max(s.best, s.len);
    });
    // столкновения
    S.forEach((s, i) => {
      if (!s.alive || s.sh > 0) return;
      const ri = radius(s.len);
      if (s.x < ri || s.y < ri || s.x > AW - ri || s.y > AH - ri) { die(i, -1); return; }
      for (let j = 0; j < S.length; j++) {
        const o = S[j]; if (j === i || !o.alive) continue;
        const rj = radius(o.len);
        for (let k = 0; k < o.path.length; k += 2) { const p = o.path[k]; if (Math.abs(p[0] - s.x) < ri + rj && Math.abs(p[1] - s.y) < ri + rj && Math.hypot(p[0] - s.x, p[1] - s.y) < ri + rj * 0.8) { die(i, j); return; } }
      }
    });
    if (gt >= DURATION) finish();
  }
  function die(i, by) {
    const s = S[i]; if (!s.alive) return;
    s.alive = false; s.resp = RESPAWN;
    for (let k = 0; k < s.path.length; k += 3) { const p = s.path[k]; addFood(p[0] + (Math.random() - 0.5) * 10, p[1] + (Math.random() - 0.5) * 10, 2); }
    if (by >= 0) S[by].kills++;
    const d = [i, by]; send("ko", d); onKo(d);
  }
  function respawn(i) {
    const [x, y] = spawnPoint(), a = Math.atan2(AH / 2 - y, AW / 2 - x);
    const old = S[i]; S[i] = Object.assign(makeSnake(i, x, y, a), { kills: old.kills, best: old.best });
    send("rs", [i, Math.round(x), Math.round(y), +a.toFixed(2)]);
  }

  // ---------- боты (хозяин) ----------
  const BOT = {};
  function bots(dt) {
    cfg.players.forEach((pl, i) => {
      if (!pl.bot) return;
      const s = S[i]; if (!s.alive) return;
      const b = BOT[i] || (BOT[i] = { t: 0, food: null });
      b.t -= dt;
      if (b.t <= 0) {
        b.t = 0.15;
        // опасность впереди: проверяем лучи
        const look = 40 + radius(s.len) * 3, danger = (a) => {
          for (let d = 20; d <= look; d += 18) {
            const x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
            if (x < 25 || y < 25 || x > AW - 25 || y > AH - 25) return true;
            for (let j = 0; j < S.length; j++) { if (j === i || !S[j].alive) continue; const o = S[j], rr = radius(o.len) + 12; for (let k = 0; k < o.path.length; k += 3) { const p = o.path[k]; if (Math.abs(p[0] - x) < rr && Math.abs(p[1] - y) < rr) return true; } }
          }
          return false;
        };
        if (danger(s.a)) { for (const off of [0.6, -0.6, 1.2, -1.2, 2, -2, 3]) if (!danger(s.a + off)) { s.ta = s.a + off; break; } s.boost = false; return; }
        // добыча: ближайшая ценная конфета
        let best = null, bs = -1e9;
        for (const f of food.values()) { const d = Math.hypot(f[0] - s.x, f[1] - s.y); if (d > 420) continue; const sc = f[2] * 60 - d; if (sc > bs) { bs = sc; best = f; } }
        // иногда подрезаем: если кто-то рядом и мы длиннее — встаём у него на пути
        let cut = null;
        S.forEach((o, j) => { if (j === i || !o.alive) return; const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < 220 && s.len > o.len * 1.1) cut = [o.x + Math.cos(o.a) * 90, o.y + Math.sin(o.a) * 90]; });
        const tgt = cut || (best && [best[0], best[1]]) || [AW / 2 + Math.sin(gt * 0.3 + i) * 400, AH / 2 + Math.cos(gt * 0.27 + i) * 400];
        s.ta = Math.atan2(tgt[1] - s.y, tgt[0] - s.x);
        s.boost = !!cut && s.len > 30 && Math.random() < 0.6;
      }
    });
  }

  // ---------- конец ----------
  function finish() { if (ended) return; const d = { L: S.map((s) => (s.alive ? Math.round(s.len) : 0)), B: S.map((s) => Math.round(s.best)), K: S.map((s) => s.kills) }; send("end", d); onEnd(d); }
  function onEnd(d) {
    phase = "end"; ended = true; boostBtn(false);
    const order = cfg.players.map((p, i) => i).sort((a, b) => d.L[b] - d.L[a] || d.B[b] - d.B[a]);
    const win = order[0] === cfg.me;
    St.gameEnd({ win, players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, len: d.L[cfg.me], best: d.B[cfg.me], kills: d.K[cfg.me] });
    T.haptic("notify", win ? "success" : "error");
    $("end-emoji").textContent = win ? "🏆" : "🐍";
    $("end-title").textContent = win ? "Самая длинная змея — твоя!" : `Место: ${order.indexOf(cfg.me) + 1} из ${order.length}`;
    $("end-sub").innerHTML = order.map((i) => `<div style="display:flex;justify-content:space-between;gap:8px"><span><b style="color:${col(i)}">●</b> ${cfg.players[i].name.replace(/[<>&]/g, "")}${i === cfg.me ? " (ты)" : ""}</span><b>📏 ${d.L[i]} · макс ${d.B[i]} · ✂️${d.K[i]}</b></div>`).join("");
    const b = [];
    if (isHost()) b.push(["🔁 Ещё раунд", "primary", () => { const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) }); }]);
    else b.push(["Ждём, пока хозяин запустит раунд…", "", () => {}]);
    b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
    const box = $("end-buttons"); box.innerHTML = "";
    b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
    setTimeout(() => $("screen-end").classList.remove("hidden"), 700);
  }
  function onKo(d) {
    const [i, by] = d, s = S[i]; s.alive = false;
    fx.push({ x: s.x, y: s.y, t: 0, c: col(i) });
    if (i === cfg.me) { msg(by >= 0 ? `💥 Врезался в ${cfg.players[by].name}` : "💥 Врезался в стену", 1700); T.haptic("notify", "error"); boostBtn(false); }
    else if (by === cfg.me) { msg(`✂️ Подрезал ${cfg.players[i].name}!`, 1300); T.haptic("notify", "success"); }
  }

  // ---------- сеть ----------
  let fullT = 0;
  function snapshot(full) {
    const s = { S: S.map((q) => [Math.round(q.x), Math.round(q.y), +q.a.toFixed(2), Math.round(q.len * 10) / 10, q.alive ? 1 : 0, q.boost ? 1 : 0]), E: eaten, A: added, t: +gt.toFixed(1), id: foodId };
    if (full) s.F = [...food].flatMap(([id, f]) => [id, f[0], f[1], f[2], f[3]]);
    eaten = []; added = []; return s;
  }
  function applySnap(s) {
    if (s.F) { food.clear(); for (let k = 0; k < s.F.length; k += 5) food.set(s.F[k], [s.F[k + 1], s.F[k + 2], s.F[k + 3], s.F[k + 4]]); }
    for (let k = 0; k < s.A.length; k += 5) food.set(s.A[k], [s.A[k + 1], s.A[k + 2], s.A[k + 3], s.A[k + 4]]);
    for (const id of s.E) food.delete(id);
    s.S.forEach((v, i) => {
      const q = S[i]; if (!q) return;
      q.len = v[3]; if (q.alive && !v[4]) q.alive = false;
      if (i === cfg.me) return;
      q.tx = v[0]; q.ty = v[1]; q.ta = v[2]; q.boost = !!v[5];
      if (!q.alive && v[4]) { q.alive = true; q.x = v[0]; q.y = v[1]; q.path = [[v[0], v[1]]]; }
    });
    gt = s.t;
  }

  function begin(c) {
    cfg = c.cfg; room = c.room; ended = false; gt = 0; phase = "play"; fx = []; food = new Map(); foodId = 0; eaten = []; added = []; fullT = 0;
    for (const k in BOT) delete BOT[k];
    const n = cfg.players.length;
    S = cfg.players.map((_, i) => { const a = (i / n) * Math.PI * 2, x = AW / 2 + Math.cos(a) * AW * 0.32, y = AH / 2 + Math.sin(a) * AH * 0.32; return makeSnake(i, x, y, a + Math.PI); });
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    ["top", "boost", "hint"].forEach((s) => $(s).classList.remove("hidden"));
    setTimeout(() => $("hint").classList.add("hidden"), 7000);
    if (room) {
      ["snap", "me", "ko", "rs", "end", "start", "roster", "host-left", "full", "left"].forEach((t) => room.off(t));
      room.on("snap", (s) => { if (!isHost()) applySnap(s); });
      room.on("me", (d, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i >= 0 && S[i].alive) { S[i].tx = d[0]; S[i].ty = d[1]; S[i].ta = d[2]; S[i].boost = !!d[3]; } });
      room.on("ko", (d) => { if (!isHost()) onKo(d); });
      room.on("rs", (d) => { if (isHost()) return; const old = S[d[0]]; S[d[0]] = Object.assign(makeSnake(d[0], d[1], d[2], d[3]), { kills: old.kills, best: old.best }); });
      room.on("end", (d) => { if (!isHost()) onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
      room.on("host-left", () => { if (phase === "play") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; msg(`${p.name} вышел — играет бот`, 2000); } });
    }
    msg("Расти и подрезай!", 1500);
    St.gameStart({ players: n, humans: cfg.players.filter((p) => !p.bot).length, mode: room ? "online" : "bots" });
  }
  function toMenu() { phase = "menu"; ["top", "boost", "hint", "screen-end"].forEach((s) => $(s).classList.add("hidden")); $("screen-menu").classList.remove("hidden"); }
  let msgT = 0;
  function msg(t, ms) { const el = $("msg"); el.textContent = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }

  // ---------- ввод ----------
  let joy = null, boosting = false;
  canvas.addEventListener("pointerdown", (e) => { if (joy) { boostBtn(true); joy.second = e.pointerId; return; } joy = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY }; });
  addEventListener("pointermove", (e) => { if (!joy || e.pointerId !== joy.id) return; joy.cx = e.clientX; joy.cy = e.clientY; const dx = joy.cx - joy.x, dy = joy.cy - joy.y, d = Math.hypot(dx, dy); if (d > 60) { joy.x += dx / d * (d - 60); joy.y += dy / d * (d - 60); } });
  const up = (e) => { if (joy && e.pointerId === joy.second) { joy.second = null; boostBtn(false); } else if (joy && e.pointerId === joy.id) joy = null; };
  addEventListener("pointerup", up); addEventListener("pointercancel", up);
  const bb = $("boost");
  bb.addEventListener("pointerdown", (e) => { e.stopPropagation(); boostBtn(true); });
  bb.addEventListener("pointerup", () => boostBtn(false)); bb.addEventListener("pointerleave", () => boostBtn(false));
  function boostBtn(on) { boosting = on; bb.classList.toggle("on", on); }
  const keys = {};
  addEventListener("keydown", (e) => { keys[e.code] = 1; if (e.code === "Space") boostBtn(true); }); addEventListener("keyup", (e) => { keys[e.code] = 0; if (e.code === "Space") boostBtn(false); });
  function myAim() {
    if (joy) { const dx = joy.cx - joy.x, dy = joy.cy - joy.y; if (Math.hypot(dx, dy) > 8) return Math.atan2(dy, dx); }
    const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (kx || ky) return Math.atan2(ky, kx);
    return window.__autoAim != null ? window.__autoAim : null;
  }

  // ---------- отрисовка ----------
  const CANDY = ["#f472b6", "#facc15", "#4ade80", "#60a5fa", "#fb923c", "#c084fc"];
  let zoom = 1, camX = AW / 2, camY = AH / 2;
  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#101828"; ctx.fillRect(0, 0, W, H);
    if (!cfg || !S.length) return;
    const me = S[cfg.me];
    const want = Math.min(1.15, Math.max(0.5, W / (380 + radius(me.len) * 20)));
    zoom += (want - zoom) * Math.min(1, dt * 2);
    if (me.alive) { camX += (me.x - camX) * Math.min(1, dt * 10); camY += (me.y - camY) * Math.min(1, dt * 10); }
    const cx = W / 2 - camX * zoom, cy = H * 0.5 - camY * zoom;
    ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, DPR * cx, DPR * cy);
    const vx0 = -cx / zoom - 40, vy0 = -cy / zoom - 40, vx1 = (W - cx) / zoom + 40, vy1 = (H - cy) / zoom + 40;
    const vis = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
    // поле: соты-точки
    ctx.fillStyle = "#1d2a44"; ctx.fillRect(0, 0, AW, AH);
    ctx.fillStyle = "#24345a";
    for (let x = Math.max(0, Math.floor(vx0 / 50) * 50); x < Math.min(AW, vx1); x += 50) for (let y = Math.max(0, Math.floor(vy0 / 50) * 50); y < Math.min(AH, vy1); y += 50) { ctx.beginPath(); ctx.arc(x + 25, y + 25, 4, 0, 7); ctx.fill(); }
    ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 8; ctx.strokeRect(-4, -4, AW + 8, AH + 8);
    // еда
    for (const f of food.values()) { if (!vis(f[0], f[1])) continue; const r = f[2] > 1 ? 7 : 4.5, pulse = 1 + Math.sin(t * 5 + f[0]) * 0.15; ctx.fillStyle = CANDY[f[3]]; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(f[0], f[1], r * 2 * pulse, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(f[0], f[1], r, 0, 7); ctx.fill(); }
    // змеи (сначала тела, сверху головы)
    S.forEach((s, i) => {
      if (!s.alive || s.path.length < 2) return;
      const r = radius(s.len), c = col(i);
      for (let k = s.path.length - 1; k >= 1; k -= 1) {
        const p = s.path[k]; if (!vis(p[0], p[1])) continue;
        ctx.fillStyle = k % 6 < 3 ? c : shade(c);
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
      }
    });
    S.forEach((s, i) => {
      if (!s.alive) return;
      const r = radius(s.len);
      if (s.boost) { ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.9, 0, 7); ctx.fill(); }
      ctx.fillStyle = col(i); ctx.strokeStyle = i === cfg.me ? "#fff" : "rgba(0,0,0,.5)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.12, 0, 7); ctx.fill(); ctx.stroke();
      for (const k of [-1, 1]) {
        const ex = s.x + Math.cos(s.a) * r * 0.45 + Math.cos(s.a + Math.PI / 2) * k * r * 0.5, ey = s.y + Math.sin(s.a) * r * 0.45 + Math.sin(s.a + Math.PI / 2) * k * r * 0.5;
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, ey, r * 0.38, 0, 7); ctx.fill();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(ex + Math.cos(s.a) * r * 0.15, ey + Math.sin(s.a) * r * 0.15, r * 0.18, 0, 7); ctx.fill();
      }
      if (s.sh > 0) { ctx.strokeStyle = "rgba(125,211,252,.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, r * 1.8, 0, 7); ctx.stroke(); }
      ctx.font = "800 12px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; const lab = pname(i);
      ctx.strokeText(lab, s.x, s.y - r * 1.4 - 6); ctx.fillStyle = "#fff"; ctx.fillText(lab, s.x, s.y - r * 1.4 - 6);
    });
    fx = fx.filter((e) => (e.t += dt) < 0.7);
    for (const e of fx) { ctx.globalAlpha = 1 - e.t / 0.7; ctx.strokeStyle = e.c; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + e.t * 130, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    // мини-карта и джойстик
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const ms = Math.min(90, W * 0.22), mx0 = 10, my0 = H - ms - 14;
    ctx.fillStyle = "rgba(15,23,42,.75)"; ctx.fillRect(mx0, my0, ms, ms); ctx.strokeStyle = "#64748b"; ctx.lineWidth = 2; ctx.strokeRect(mx0, my0, ms, ms);
    S.forEach((s, i) => { if (!s.alive) return; ctx.fillStyle = col(i); const z = i === cfg.me ? 5 : 3.5; ctx.fillRect(mx0 + s.x / AW * ms - z / 2, my0 + s.y / AH * ms - z / 2, z, z); });
    if (joy) { ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(joy.x, joy.y, 60, 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(joy.cx, joy.cy, 22, 0, 7); ctx.fill(); }
    if (!me.alive && phase === "play") { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, W, H); ctx.font = "900 24px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText("Возрождение…", W / 2, H * 0.6); }
  }
  const shadeCache = {};
  function shade(hex) { if (shadeCache[hex]) return shadeCache[hex]; const n = parseInt(hex.slice(1), 16); return (shadeCache[hex] = `rgb(${((n >> 16) * 0.75) | 0},${(((n >> 8) & 255) * 0.75) | 0},${((n & 255) * 0.75) | 0})`); }
  function hud() {
    const me = S[cfg.me], order = S.map((s, i) => i).sort((a, b) => (S[b].alive ? S[b].len : 0) - (S[a].alive ? S[a].len : 0));
    $("s-me").textContent = `📏 ${me.alive ? Math.round(me.len) : 0}`;
    $("s-place").textContent = `🏅 ${order.indexOf(cfg.me) + 1}/${S.length}`;
    const tl = Math.max(0, DURATION - gt); $("s-time").textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, "0")}`;
    $("board").innerHTML = order.slice(0, 3).map((i, k) => `${["🥇", "🥈", "🥉"][k]} ${pname(i).replace(/[<>&]/g, "")}: ${S[i].alive ? Math.round(S[i].len) : 0}`).join("<br>");
  }
  let last = 0, snapT = 0, meT = 0, hudT = 0;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (phase === "play") {
      gt += dt;
      const me = S[cfg.me];
      S.forEach((s) => { if (s.sh > 0) s.sh -= dt; });
      if (me.alive) {
        const a = myAim(); if (a != null) me.ta = a;
        me.boost = boosting && me.len > START_LEN + 1;
        steer(me, dt, me.boost ? BOOST : SPEED); track(me);
        if (!isHost()) for (const [id, f] of food) if (Math.hypot(f[0] - me.x, f[1] - me.y) < radius(me.len) + 9) food.delete(id);   // съели — сразу убираем у себя
      }
      S.forEach((s, i) => {
        if (i === cfg.me || !s.alive) return;
        if (isHost() && cfg.players[i].bot) { steer(s, dt, s.boost ? BOOST : SPEED); }
        else {                                         // чужая змея: едем к последней известной точке, чуть забегая вперёд
          const sp = s.boost ? BOOST : SPEED, px = s.tx + Math.cos(s.ta) * sp * 0.06, py = s.ty + Math.sin(s.ta) * sp * 0.06;
          s.x += (px - s.x) * Math.min(1, dt * 9); s.y += (py - s.y) * Math.min(1, dt * 9);
          let da = s.ta - s.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; s.a += da * Math.min(1, dt * 10);
        }
        track(s);
      });
      if (isHost()) { bots(dt); hostWorld(dt); }
      if (room) {
        if (isHost()) { snapT -= dt; fullT -= dt; if (snapT <= 0) { snapT = 1 / 12; const full = fullT <= 0; room.sendFast("snap", snapshot(full)); if (full) fullT = 2; } }
        else { meT -= dt; if (meT <= 0) { meT = 1 / 15; room.sendFast("me", [Math.round(me.x), Math.round(me.y), +me.a.toFixed(2), me.boost ? 1 : 0]); } }
      } else { eaten = []; added = []; }
      hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.25; }
    }
    render(ts / 1000, dt);
    requestAnimationFrame(frame);
  }

  const PARTY = { title: "Змеиная арена", icon: "🐍", max: 6, bots: 3, text: "Го в «Змеиную арену» 🐍 Кто вырастет длиннее? Заходи!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }], onCancel: toMenu };
  $("m-bots").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.offline(Object.assign({}, PARTY, { bots: 4 }))); };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("arena", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#101828", bg: "#101828", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("arena", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get S() { return S; }, get cfg() { return cfg; }, get food() { return food; }, finish };
})();
