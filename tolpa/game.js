/* Толпа — собери самую большую толпу (в духе Crowd City). До 6 игроков, боты, команды.
   Каждый сам ведёт своего лидера и шлёт его координаты; хозяин решает, кто к кому перешёл. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const MW = 900, MH = 1300, START_PEOPLE = 170, MAXP = 330, DURATION = 120, LSPEED = 135, FSPEED = 190, TOUCH = 16;

  function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR;
  function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; canvas.width = W * DPR; canvas.height = H * DPR; }
  addEventListener("resize", resize); resize();

  let room = null, cfg = null, phase = "menu", ended = false, gt = 0, people = [], L = [], diffs = [], spawns = [], fx = [], zoom = 1, blocks = [];
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const team = (i) => cfg.players[i].team;
  const col = (i) => cfg.players[i].color;
  const ally = (a, b) => a === b || (cfg.teams && team(a) === team(b));

  function neutralPos(p, t) { return [p.x0 + Math.cos(p.ph + t * 0.7) * 16, p.y0 + Math.sin(p.ph * 1.3 + t * 0.5) * 16]; }
  function addPerson(id, x0, y0, ph) { const p = { id, x0, y0, ph, o: -1, x: x0, y: y0 }; people[id] = p; return p; }
  function setOwner(p, o) { if (p.o === o) return; if (p.o < 0) { const q = neutralPos(p, gt); p.x = q[0]; p.y = q[1]; } p.o = o; diffs.push(p.id, o + 1); }

  function genWorld(seed) {
    const r = rng(seed); people = [];
    for (let i = 0; i < START_PEOPLE; i++) addPerson(i, 30 + r() * (MW - 60), 30 + r() * (MH - 60), r() * 6.28);
    blocks = [];
    for (let bx = 0; bx + 122 <= MW; bx += 150) for (let by = 0; by + 122 <= MH; by += 150) if (r() < 0.55) blocks.push([bx + 28, by + 28, 94, 94, Math.floor(r() * 4)]);
  }
  function startLeaders() {
    const n = cfg.players.length;
    L = cfg.players.map((p, i) => { const a = (i / n) * Math.PI * 2 + 0.4; return { x: MW / 2 + Math.cos(a) * MW * 0.33, y: MH / 2 + Math.sin(a) * MH * 0.33, tx: 0, ty: 0, alive: true, resp: 0, vx: 0, vy: 0, dir: null, best: 1 }; });
    L.forEach((l) => { l.tx = l.x; l.ty = l.y; });
  }
  function counts() { const c = new Array(L.length).fill(1); for (const p of people) if (p && p.o >= 0) c[p.o]++; L.forEach((l, i) => { if (!l.alive) c[i] = 0; }); return c; }

  // ---------- симуляция (у всех): последователи бегут за лидером ----------
  function simFollowers(dt) {
    const slot = new Array(L.length).fill(0);
    for (const p of people) {
      if (!p) continue;
      if (p.o < 0) { const q = neutralPos(p, gt); p.x = q[0]; p.y = q[1]; continue; }
      const l = L[p.o]; const k = ++slot[p.o];
      const r = 9 * Math.sqrt(k), a = k * 2.399;
      const tx = l.x + Math.cos(a) * r, ty = l.y + Math.sin(a) * r;
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d > 1) { const s = Math.min(d, (FSPEED + d * 0.8) * dt); p.x += dx / d * s; p.y += dy / d * s; }
    }
  }
  // ---------- хозяин: вербовка и переманивание ----------
  let grid = new Map();
  function host(dt) {
    // сетка
    grid.clear();
    const key = (x, y) => ((x / 40) | 0) * 1000 + ((y / 40) | 0);
    for (const p of people) { if (!p) continue; const k = key(p.x, p.y); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
    const near = (x, y, fn) => { const gx = (x / 40) | 0, gy = (y / 40) | 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c = grid.get((gx + i) * 1000 + gy + j); if (c) for (const p of c) fn(p); } };
    const cnt = counts();
    // каждый, кто в толпе (и лидер) — вербует нейтралов и переманивает слабых
    const touch = (o, x, y) => near(x, y, (q) => {
      if (q.o === o || Math.abs(q.x - x) > TOUCH || Math.abs(q.y - y) > TOUCH) return;
      if (q.o < 0) { setOwner(q, o); cnt[o]++; }
      else if (!ally(q.o, o) && cnt[o] > cnt[q.o]) { cnt[q.o]--; cnt[o]++; setOwner(q, o); }
    });
    L.forEach((l, i) => { if (l.alive) touch(i, l.x, l.y); });
    for (const p of people) if (p && p.o >= 0 && L[p.o].alive && Math.random() < 0.5) touch(p.o, p.x, p.y);
    // лидер без толпы пойман большей толпой — выбывает
    L.forEach((l, i) => {
      if (!l.alive) { l.resp -= dt; if (l.resp <= 0) respawn(i); return; }
      if (cnt[i] > 1) return;
      L.forEach((m, j) => {
        if (!l.alive || j === i || !m.alive || ally(i, j) || cnt[j] < 4) return;
        let hit = Math.hypot(m.x - l.x, m.y - l.y) < 16;
        if (!hit) near(l.x, l.y, (q) => { if (q.o === j && Math.hypot(q.x - l.x, q.y - l.y) < 12) hit = true; });
        if (hit) { l.alive = false; l.resp = 3; send("ko", { i, by: j }); onKo({ i, by: j }); }
      });
    });
    // новые прохожие
    spawnT -= dt;
    if (spawnT <= 0 && people.filter(Boolean).length < MAXP) {
      spawnT = 0.35;
      const id = people.length, x0 = 30 + Math.random() * (MW - 60), y0 = 30 + Math.random() * (MH - 60), ph = Math.random() * 6.28;
      let ok = L.every((l) => Math.hypot(l.x - x0, l.y - y0) > 160);
      if (ok) { addPerson(id, Math.round(x0), Math.round(y0), +ph.toFixed(2)); spawns.push(id, Math.round(x0), Math.round(y0), +ph.toFixed(2)); }
    }
    cnt.forEach((c, i) => { L[i].best = Math.max(L[i].best || 1, c); });
    if (gt >= DURATION) finish();
  }
  let spawnT = 0;
  function respawn(i) {
    const l = L[i]; let x = MW / 2, y = MH / 2;
    for (let t = 0; t < 50; t++) { x = 60 + Math.random() * (MW - 120); y = 60 + Math.random() * (MH - 120); if (L.every((m, j) => j === i || Math.hypot(m.x - x, m.y - y) > 250)) break; }
    Object.assign(l, { x, y, tx: x, ty: y, alive: true });
    send("rs", { i, x: Math.round(x), y: Math.round(y) });
  }
  // ---------- боты ----------
  let botT = {};
  function bots(dt) {
    const cnt = counts();
    cfg.players.forEach((pl, i) => {
      if (!pl.bot || !L[i].alive) return;
      const l = L[i];
      botT[i] = (botT[i] || 0) - dt;
      if (botT[i] <= 0) {
        botT[i] = 0.4;
        let best = null, bs = -1e9;
        // бежать от больших
        let fx0 = 0, fy0 = 0;
        L.forEach((m, j) => { if (j === i || !m.alive || ally(i, j)) return; const d = Math.hypot(m.x - l.x, m.y - l.y); if (cnt[j] > cnt[i] * 1.15 && d < 170) { fx0 += (l.x - m.x) / d; fy0 += (l.y - m.y) / d; } if (cnt[j] < cnt[i] * 0.85 && d < 380) { const s = 30 + cnt[j] * 3 - d * 0.1; if (s > bs) { bs = s; best = [m.x, m.y]; } } });
        if (fx0 || fy0) { l.dir = Math.atan2(fy0, fx0) + (Math.random() - 0.5) * 0.6; }
        else {
          for (let k = 0; k < 40; k++) { const q = people[Math.floor(Math.random() * people.length)]; if (!q || q.o >= 0 && ally(q.o, i)) continue; if (q.o >= 0 && cnt[q.o] >= cnt[i]) continue; const d = Math.hypot(q.x - l.x, q.y - l.y); const s = 20 - d * 0.08; if (s > bs) { bs = s; best = [q.x, q.y]; } }
          l.dir = best ? Math.atan2(best[1] - l.y, best[0] - l.x) : (l.dir || 0) + 0.5;
        }
      }
      move(l, l.dir, dt);
    });
  }
  function move(l, a, dt) {
    if (a == null) return;
    l.x = Math.max(12, Math.min(MW - 12, l.x + Math.cos(a) * LSPEED * dt));
    l.y = Math.max(12, Math.min(MH - 12, l.y + Math.sin(a) * LSPEED * dt));
  }
  function finish() {
    if (ended) return;
    const c = counts(), byT = {};
    c.forEach((v, i) => { byT[team(i)] = (byT[team(i)] || 0) + v; });
    let win = null, b = -1; for (const k in byT) if (byT[k] > b) { b = byT[k]; win = +k; }
    const d = { win, c, best: L.map((l) => l.best || 1) };
    send("end", d); onEnd(d);
  }

  // ---------- сеть ----------
  function snapshot(full) {
    const s = { L: L.map((l) => [Math.round(l.x), Math.round(l.y), l.alive ? 1 : 0]), O: diffs, S: spawns, t: +gt.toFixed(2) };
    if (full) s.F = people.map((p) => (p ? [p.x0 | 0, p.y0 | 0, p.ph, p.o] : 0));
    diffs = []; spawns = []; return s;
  }
  function applySnap(s) {
    if (s.F) s.F.forEach((v, id) => { if (!v) return; let p = people[id]; if (!p) p = addPerson(id, v[0], v[1], v[2]); if (p.o !== v[3]) { if (p.o < 0) { const q = neutralPos(p, gt); p.x = q[0]; p.y = q[1]; } p.o = v[3]; } });
    for (let j = 0; j < s.S.length; j += 4) if (!people[s.S[j]]) addPerson(s.S[j], s.S[j + 1], s.S[j + 2], s.S[j + 3]);
    for (let j = 0; j < s.O.length; j += 2) { const p = people[s.O[j]]; if (p) { const o = s.O[j + 1] - 1; if (p.o < 0 && o >= 0) { const q = neutralPos(p, gt); p.x = q[0]; p.y = q[1]; } if (o === cfg.me && p.o !== cfg.me) T.haptic("select"); p.o = o; } }
    s.L.forEach((v, i) => { if (i === cfg.me) { L[i].alive = !!v[2]; return; } L[i].tx = v[0]; L[i].ty = v[1]; L[i].alive = !!v[2]; });
    gt = s.t;
  }

  function begin(c) {
    cfg = c.cfg; room = c.room; ended = false; gt = 0; phase = "play"; fx = []; diffs = []; spawns = []; botT = {}; spawnT = 0;
    genWorld(cfg.seed); startLeaders();
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    $("top").classList.remove("hidden"); $("hint").classList.remove("hidden");
    setTimeout(() => $("hint").classList.add("hidden"), 7000);
    if (room) {
      ["snap", "me", "end", "start", "roster", "host-left", "full", "left", "ko", "rs"].forEach((t) => room.off(t));
      room.on("snap", (s) => { if (!isHost()) applySnap(s); });
      room.on("me", (d, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i >= 0 && L[i].alive) { L[i].tx = d[0]; L[i].ty = d[1]; } });
      room.on("ko", (d) => { if (!isHost()) { L[d.i].alive = false; onKo(d); } });
      room.on("rs", (d) => { if (!isHost()) { const l = L[d.i]; Object.assign(l, { x: d.x, y: d.y, tx: d.x, ty: d.y, alive: true }); } });
      room.on("end", (d) => { if (!isHost()) onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
      room.on("host-left", () => { if (phase === "play") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; msg(`${p.name} вышел — играет бот`, 2000); } });
    }
    msg(cfg.teams ? `Ты за ${Party.TEAMNAMES[cfg.players[cfg.me].team]}` : "Собери самую большую толпу!", 1800);
    St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode });
  }
  function onKo(d) {
    const l = L[d.i]; fx.push({ x: l.x, y: l.y, t: 0, c: col(d.by) });
    if (d.i === cfg.me) { msg(`😵 Тебя поймал ${cfg.players[d.by].name}`, 1800); T.haptic("notify", "error"); }
    else if (d.by === cfg.me) { msg(`🎯 Поймал ${cfg.players[d.i].name}!`, 1300); T.haptic("notify", "success"); }
  }
  function onEnd(d) {
    phase = "end"; ended = true;
    const win = d.win === team(cfg.me);
    St.gameEnd({ win, players: cfg.players.length, mode: cfg.mode, crowd: d.c[cfg.me] });
    T.haptic("notify", win ? "success" : "error");
    $("end-emoji").textContent = win ? "🏆" : "🏳️";
    $("end-title").textContent = win ? "Самая большая толпа — ваша!" : "Не в этот раз";
    $("end-sub").innerHTML = cfg.players.map((p, i) => ({ p, i, c: d.c[i] })).sort((a, b) => b.c - a.c)
      .map((r) => `<div style="display:flex;justify-content:space-between;gap:8px"><span><b style="color:${r.p.color}">●</b> ${r.p.name.replace(/[<>&]/g, "")}${r.i === cfg.me ? " (ты)" : ""}</span><b>👥 ${r.c} · макс ${d.best[r.i]}</b></div>`).join("");
    const b = [];
    if (isHost()) b.push(["🔁 Ещё раунд", "primary", () => { const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) }); }]);
    else b.push(["Ждём, пока хозяин запустит раунд…", "", () => {}]);
    b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
    const box = $("end-buttons"); box.innerHTML = "";
    b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
    setTimeout(() => $("screen-end").classList.remove("hidden"), 600);
  }
  function toMenu() { phase = "menu"; $("top").classList.add("hidden"); $("screen-end").classList.add("hidden"); $("screen-menu").classList.remove("hidden"); }
  let msgT = 0;
  function msg(t, ms) { const el = $("msg"); el.textContent = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }

  // ---------- ввод: джойстик где угодно ----------
  let joy = null;
  canvas.addEventListener("pointerdown", (e) => { joy = { x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY }; });
  addEventListener("pointermove", (e) => { if (joy) { joy.cx = e.clientX; joy.cy = e.clientY; const dx = joy.cx - joy.x, dy = joy.cy - joy.y, d = Math.hypot(dx, dy); if (d > 60) { joy.x += dx / d * (d - 60); joy.y += dy / d * (d - 60); } } });
  addEventListener("pointerup", () => { joy = null; });
  const keys = {};
  addEventListener("keydown", (e) => { keys[e.key] = 1; }); addEventListener("keyup", (e) => { keys[e.key] = 0; });
  function myDir() {
    if (joy) { const dx = joy.cx - joy.x, dy = joy.cy - joy.y; if (Math.hypot(dx, dy) > 8) return Math.atan2(dy, dx); }
    const kx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), ky = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    if (kx || ky) return Math.atan2(ky, kx);
    return window.__autoDir != null ? window.__autoDir : null;
  }

  // ---------- отрисовка ----------
  const BCOL = ["#cbd5e1", "#d6d3d1", "#bfdbfe", "#bbf7d0"];
  function person(x, y, c, s, t, ph) {
    const bob = Math.sin(t * 14 + ph) * 1.2;
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(x, y + 5 * s, 4.5 * s, 1.8 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x - 3.6 * s, y - 3 * s + bob, 7.2 * s, 8 * s, 3 * s); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 5.5 * s + bob, 3.4 * s, 0, 7); ctx.fill();
  }
  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#475569"; ctx.fillRect(0, 0, W, H);
    if (!cfg || !L.length) return;
    const me = L[cfg.me], cnt = counts();
    const want = Math.min(1.25, Math.max(0.55, W / (330 + Math.sqrt(cnt[cfg.me]) * 34)));
    zoom += (want - zoom) * Math.min(1, dt * 2);
    const cx = W / 2 - me.x * zoom, cy = H * 0.55 - me.y * zoom;
    ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, DPR * cx, DPR * cy);
    ctx.fillStyle = "#e7e2d6"; ctx.fillRect(0, 0, MW, MH);
    ctx.strokeStyle = "#f8f5ee"; ctx.lineWidth = 10;
    for (let x = 0; x <= MW; x += 150) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MH); ctx.stroke(); }
    for (let y = 0; y <= MH; y += 150) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MW, y); ctx.stroke(); }
    for (const b of blocks) { ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.fillRect(b[0] + 4, b[1] + 6, b[2], b[3]); ctx.fillStyle = BCOL[b[4]]; ctx.fillRect(b[0], b[1], b[2], b[3]); ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 2; ctx.strokeRect(b[0], b[1], b[2], b[3]); }
    ctx.strokeStyle = "#334155"; ctx.lineWidth = 6; ctx.strokeRect(-3, -3, MW + 6, MH + 6);
    const vx0 = -cx / zoom - 20, vy0 = -cy / zoom - 20, vx1 = (W - cx) / zoom + 20, vy1 = (H - cy) / zoom + 20;
    const vis = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
    const list = people.filter((p) => p && vis(p.x, p.y)).sort((a, b) => a.y - b.y);
    for (const p of list) person(p.x, p.y, p.o < 0 ? "#f8fafc" : col(p.o), 1.2, p.o < 0 ? t * 0.3 : t, p.ph);
    // лидеры
    L.forEach((l, i) => {
      if (!l.alive || !vis(l.x, l.y)) return;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(l.x, l.y + 7, 11, 4, 0, 0, 7); ctx.stroke();
      person(l.x, l.y, col(i), 1.7, t, 0);
      ctx.font = "800 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const lab = (i === cfg.me ? "Ты" : cfg.players[i].name) + " · " + cnt[i];
      ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.strokeText(lab, l.x, l.y - 17); ctx.fillStyle = col(i); ctx.fillText(lab, l.x, l.y - 17);
    });
    fx = fx.filter((e) => (e.t += dt) < 0.8);
    for (const e of fx) { ctx.globalAlpha = 1 - e.t / 0.8; ctx.strokeStyle = e.c; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + e.t * 120, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    // стрелки к соперникам за краем экрана
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    L.forEach((l, i) => {
      if (i === cfg.me || !l.alive) return;
      const sx = cx + l.x * zoom, sy = cy + l.y * zoom;
      if (sx > 0 && sx < W && sy > 70 && sy < H) return;
      const a = Math.atan2(sy - H * 0.55, sx - W / 2), ex = Math.max(18, Math.min(W - 18, W / 2 + Math.cos(a) * W)), ey = Math.max(84, Math.min(H - 18, H * 0.55 + Math.sin(a) * H));
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = col(i); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.font = "800 11px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText(cnt[i], ex - Math.cos(a) * 18, ey - Math.sin(a) * 18 + 4);
    });
    if (joy) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(joy.x, joy.y, 60, 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(joy.cx, joy.cy, 22, 0, 7); ctx.fill(); }
    if (!me.alive) { ctx.fillStyle = "rgba(15,23,42,.4)"; ctx.fillRect(0, 0, W, H); ctx.font = "900 26px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText("Возвращаешься в игру…", W / 2, H * 0.62); }
  }
  function hud() {
    const c = counts(), tot = c.reduce((a, b) => a + b, 0) || 1, by = {};
    c.forEach((v, i) => { const k = cfg.teams ? "t" + team(i) : i; by[k] = (by[k] || 0) + v; });
    $("bars").innerHTML = Object.entries(by).filter((e) => e[1] > 0).map(([k, v]) => `<i style="width:${(v / tot * 100).toFixed(1)}%;background:${k[0] === "t" ? Party.COLORS[+k.slice(1)] : col(+k)}"></i>`).join("");
    const rank = c.filter((v) => v > c[cfg.me]).length + 1;
    $("i-me").textContent = `👥 ${c[cfg.me]} · место ${rank}`;
    const tl = Math.max(0, DURATION - gt); $("i-time").textContent = `⏱ ${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, "0")}`;
  }
  let last = 0, snapT = 0, fullT = 0, meT = 0, hudT = 0;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (phase === "play") {
      gt += dt;
      const me = L[cfg.me];
      if (me.alive) move(me, myDir(), dt);
      L.forEach((l, i) => { if (i !== cfg.me && !(isHost() && cfg.players[i].bot)) { l.x += (l.tx - l.x) * Math.min(1, dt * 10); l.y += (l.ty - l.y) * Math.min(1, dt * 10); } });
      if (isHost()) { bots(dt); }
      simFollowers(dt);
      if (isHost()) {
        host(dt);
        if (room) { snapT -= dt; fullT -= dt; if (snapT <= 0) { snapT = 1 / 10; send("snap", snapshot(fullT <= 0)); if (fullT <= 0) fullT = 3; } }
        else { diffs = []; spawns = []; }
      } else { meT -= dt; if (meT <= 0) { meT = 1 / 12; send("me", [Math.round(me.x), Math.round(me.y)]); } }
      hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.25; }
    }
    render(ts / 1000, dt);
    requestAnimationFrame(frame);
  }

  const PARTY = { title: "Толпа", icon: "🏃", max: 6, bots: 4, text: "Го в «Толпу» 🏃‍♂️ У кого толпа больше — тот и прав. Заходи!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }, { id: "t2", name: "2 команды", teams: 2 }, { id: "t3", name: "3 команды", teams: 3 }], onCancel: toMenu };
  $("m-bots").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.offline(PARTY)); };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("tolpa", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#0f172a", bg: "#0f172a", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("tolpa", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get L() { return L; }, get cfg() { return cfg; }, counts, get people() { return people; } };
})();
