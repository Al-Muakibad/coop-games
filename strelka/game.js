/* Перестрелка — арена сверху: бег, укрытия, кусты, 3 заряда с перезарядкой. До 6 игроков, боты, команды.
   Каждый сам двигает своего бойца и шлёт координаты; выстрелы и попадания считает хозяин. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const AW = 780, AH = 1100, R = 15, SPEED = 175, BSPEED = 620, BRANGE = 470, DMG = 25, AMMO = 3, RELOAD = 0.85, COOL = 0.22;
  const DURATION = 150, RESPAWN = 3, SHIELD = 1.5;

  function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR;
  function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; canvas.width = W * DPR; canvas.height = H * DPR; }
  addEventListener("resize", resize); resize();

  let room = null, cfg = null, phase = "menu", ended = false, gt = 0, walls = [], bushes = [], spawns = [], P = [], B = [], packs = [], fx = [], target = 10;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const team = (i) => cfg.players[i].team;
  const col = (i) => cfg.players[i].color;
  const ally = (a, b) => a === b || (cfg.teams > 0 && team(a) === team(b));
  const pname = (i) => (i === cfg.me ? "Ты" : cfg.players[i].name);

  // ---------- арена ----------
  function genArena(seed) {
    const r = rng(seed); walls = []; bushes = [];
    const sx = AW / 900, sy = AH / 1300;
    const add = (x0, y0, w0, h0) => { const x = x0 * sx, y = y0 * sy, w = w0 * sx, h = h0 * sy; walls.push([x, y, w, h]); walls.push([AW - x - w, AH - y - h, w, h]); };   // симметрично
    add(150, 170, 120, 34); add(560, 260, 34, 150); add(90, 470, 34, 160); add(330, 430, 160, 34);
    add(640, 560, 150, 34); add(250, 610, 34, 90);
    for (let k = 0; k < 4; k++) { const x = 120 + r() * 600, y = 140 + r() * 390, w = 50 + r() * 40, h = 50 + r() * 40;
      if (walls.every((q) => x * sx > q[0] + q[2] + 40 || (x + w) * sx < q[0] - 40 || y * sy > q[1] + q[3] + 40 || (y + h) * sy < q[1] - 40)) add(x, y, w, h); }
    walls.push([AW / 2 - 60, AH / 2 - 17, 120, 34]);
    const bush = (x0, y0) => { const x = x0 * sx, y = y0 * sy; bushes.push([x, y, 52]); bushes.push([AW - x, AH - y, 52]); };
    bush(120, 320); bush(760, 160); bush(450, 300); bush(300, 560); bush(780, 470); bush(130, 760);
    spawns = [[90, 90], [AW - 90, AH - 90], [AW - 90, 90], [90, AH - 90], [AW / 2, 70], [AW / 2, AH - 70]];
  }
  const inWall = (x, y, rad) => x < rad || y < rad || x > AW - rad || y > AH - rad || walls.some((w) => x + rad > w[0] && x - rad < w[0] + w[2] && y + rad > w[1] && y - rad < w[1] + w[3]);
  const segHits = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10); for (let k = 1; k <= n; k++) { const t = k / n; if (inWall(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1)) return true; } return false; };
  const inBush = (x, y) => bushes.some((b) => Math.hypot(b[0] - x, b[1] - y) < b[2] - 6);
  const seen = (by, i) => { const a = P[by], b = P[i]; if (!b.alive) return false; if (inBush(b.x, b.y) && Math.hypot(a.x - b.x, a.y - b.y) > 110) return false; return !segHits(a.x, a.y, b.x, b.y); };
  function moveP(p, dx, dy) {
    if (!inWall(p.x + dx, p.y, R)) p.x += dx;
    if (!inWall(p.x, p.y + dy, R)) p.y += dy;
  }
  function spawnPos(i) {
    let best = spawns[i % spawns.length], bd = -1;
    for (const s of spawns) { const d = Math.min(...P.map((q, j) => (j === i || !q.alive ? 1e9 : Math.hypot(q.x - s[0], q.y - s[1])))); if (d > bd) { bd = d; best = s; } }
    return best;
  }

  // ---------- бойцы ----------
  function startPlayers() {
    P = cfg.players.map((_, i) => { const s = spawns[i % spawns.length]; return { x: s[0], y: s[1], tx: s[0], ty: s[1], a: Math.atan2(AH / 2 - s[1], AW / 2 - s[0]), hp: 100, alive: true, resp: 0, sh: SHIELD, k: 0, d: 0 }; });
  }
  function respawn(i) {
    const s = spawnPos(i), p = P[i];
    Object.assign(p, { x: s[0], y: s[1], tx: s[0], ty: s[1], hp: 100, alive: true, sh: SHIELD });
    send("rs", [i, s[0], s[1]]);
  }

  // ---------- выстрелы ----------
  let ammo = AMMO, reload = 0, cool = 0;
  function shoot(a) {
    const p = P[cfg.me];
    if (!p.alive || ammo < 1 || cool > 0 || phase !== "play") return;
    ammo -= 1; cool = COOL; if (reload <= 0) reload = RELOAD;
    p.a = a;
    const x = p.x + Math.cos(a) * (R + 4), y = p.y + Math.sin(a) * (R + 4);
    addBullet(cfg.me, x, y, a);
    T.haptic("impact", "light");
    if (isHost()) send("shot", [cfg.me, Math.round(x), Math.round(y), +a.toFixed(3)]);
    else send("fire", [Math.round(x), Math.round(y), +a.toFixed(3)]);
  }
  function addBullet(o, x, y, a) { B.push({ o, x, y, vx: Math.cos(a) * BSPEED, vy: Math.sin(a) * BSPEED, life: BRANGE / BSPEED }); fx.push({ k: "flash", x, y, t: 0 }); }
  function stepBullets(dt) {
    for (const b of B) {
      const steps = 3;
      for (let s = 0; s < steps && b.life > 0; s++) {
        b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
        if (inWall(b.x, b.y, 2)) { b.life = 0; fx.push({ k: "puff", x: b.x, y: b.y, t: 0 }); break; }
        for (let i = 0; i < P.length; i++) {
          const p = P[i];
          if (!p.alive || ally(i, b.o) || Math.hypot(p.x - b.x, p.y - b.y) > R + 3) continue;
          b.life = 0; fx.push({ k: "hit", x: b.x, y: b.y, t: 0 });
          if (isHost() && p.sh <= 0) damage(i, b.o);
          break;
        }
      }
      b.life -= dt;
    }
    B = B.filter((b) => b.life > 0);
  }
  function damage(i, by) {
    const p = P[i]; p.hp -= DMG;
    if (p.hp > 0) { send("hp", [i, p.hp]); onHp(i); return; }
    p.hp = 0; p.alive = false; p.resp = RESPAWN; p.d++; P[by].k++;
    const d = [i, by, P[by].k]; send("ko", d); onKo(d);
    checkEnd();
  }
  function onHp(i) { if (i === cfg.me) T.haptic("impact", "medium"); }
  function onKo(d) {
    const [i, by] = d; P[i].alive = false; P[i].hp = 0; P[by].k = d[2];
    fx.push({ k: "boom", x: P[i].x, y: P[i].y, t: 0, c: col(i) });
    feed(`${pname(by)} 🔫 ${pname(i)}`);
    if (i === cfg.me) { msg("💀 Вернёшься через 3 с", 1600); T.haptic("notify", "error"); }
    else if (by === cfg.me) { msg("🎯 Фраг!", 900); T.haptic("notify", "success"); }
  }

  // ---------- аптечки (хозяин) ----------
  let packT = 6;
  const PACKS = [[AW / 2, AH / 2 - 110], [AW / 2, AH / 2 + 110], [200, AH / 2], [AW - 200, AH / 2]];
  function hostPacks(dt) {
    packT -= dt;
    if (packT <= 0) { packT = 11; const free = PACKS.filter((q) => !packs.some((p) => p[0] === q[0] && p[1] === q[1])); if (free.length) { packs.push(free[Math.floor(Math.random() * free.length)].slice()); send("packs", packs); } }
    for (let k = packs.length - 1; k >= 0; k--) {
      const pk = packs[k];
      const i = P.findIndex((p) => p.alive && p.hp < 100 && Math.hypot(p.x - pk[0], p.y - pk[1]) < R + 14);
      if (i >= 0) { P[i].hp = Math.min(100, P[i].hp + 50); packs.splice(k, 1); send("packs", packs); send("hp", [i, P[i].hp]); if (i === cfg.me) T.haptic("notify", "success"); }
    }
  }

  // ---------- боты (хозяин) ----------
  const BOT = {};
  function bots(dt) {
    cfg.players.forEach((pl, i) => {
      if (!pl.bot) return;
      const p = P[i]; if (!p.alive) return;
      const s = BOT[i] || (BOT[i] = { str: 1, strT: 0, goal: null, ammo: AMMO, rel: 0, cool: 0, think: 0, tgt: -1, react: 0 });
      s.cool -= dt; s.rel -= dt; s.strT -= dt; s.think -= dt;
      if (s.ammo < AMMO && s.rel <= 0) { s.ammo++; s.rel = RELOAD; }
      if (s.strT <= 0) { s.str = -s.str; s.strT = 0.8 + Math.random() * 1.4; }
      if (s.think <= 0) {
        s.think = 0.25;
        let best = -1, bd = 1e9;
        P.forEach((q, j) => { if (ally(i, j) || !q.alive || !seen(i, j)) return; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = j; } });
        if (best !== s.tgt) { s.tgt = best; s.react = 0.25 + Math.random() * 0.35; }
        if (p.hp <= 50 && packs.length) { let pk = null, pd = 1e9; packs.forEach((q) => { const d = Math.hypot(q[0] - p.x, q[1] - p.y); if (d < pd) { pd = d; pk = q; } }); s.goal = pk; }
        else if (best < 0 && (!s.goal || Math.hypot(s.goal[0] - p.x, s.goal[1] - p.y) < 30)) {
          let near = -1, nd = 1e9; P.forEach((q, j) => { if (ally(i, j) || !q.alive) return; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < nd) { nd = d; near = j; } });
          s.goal = near >= 0 && Math.random() < 0.7 ? [P[near].x + (Math.random() - 0.5) * 200, P[near].y + (Math.random() - 0.5) * 200] : [80 + Math.random() * (AW - 160), 80 + Math.random() * (AH - 160)];
        } else if (best >= 0) s.goal = null;
      }
      s.react -= dt;
      let dir = null;
      if (s.tgt >= 0 && P[s.tgt].alive) {
        const q = P[s.tgt], d = Math.hypot(q.x - p.x, q.y - p.y), a = Math.atan2(q.y - p.y, q.x - p.x);
        p.a = a;
        dir = d > 280 ? a : d < 170 ? a + Math.PI : a + s.str * Math.PI / 2;
        if (s.react <= 0 && s.cool <= 0 && s.ammo >= 1 && d < BRANGE - 20 && !segHits(p.x, p.y, q.x, q.y)) {
          const lead = d / BSPEED, ex = q.x + (q.x - (q.px || q.x)) / Math.max(dt, 0.016) * lead * 0.5, ey = q.y + (q.y - (q.py || q.y)) / Math.max(dt, 0.016) * lead * 0.5;
          const aa = Math.atan2(ey - p.y, ex - p.x) + (Math.random() - 0.5) * 0.22;
          s.ammo--; s.cool = 0.35 + Math.random() * 0.35; if (s.rel <= 0) s.rel = RELOAD;
          const x = p.x + Math.cos(aa) * (R + 4), y = p.y + Math.sin(aa) * (R + 4);
          addBullet(i, x, y, aa); send("shot", [i, Math.round(x), Math.round(y), +aa.toFixed(3)]);
        }
      } else if (s.goal) { dir = Math.atan2(s.goal[1] - p.y, s.goal[0] - p.x); p.a = dir; }
      if (dir != null) {
        const ox = p.x, oy = p.y;
        moveP(p, Math.cos(dir) * SPEED * 0.92 * dt, Math.sin(dir) * SPEED * 0.92 * dt);
        if (Math.hypot(p.x - ox, p.y - oy) < SPEED * dt * 0.3) { const d2 = dir + (s.str * Math.PI / 2); moveP(p, Math.cos(d2) * SPEED * dt, Math.sin(d2) * SPEED * dt); if (s.goal) s.goal = null; s.str = -s.str; }
      }
    });
  }

  // ---------- конец ----------
  function checkEnd() {
    if (ended || !isHost()) return;
    const sc = scores();
    if (Math.max(...Object.values(sc)) >= target || gt >= DURATION) finish();
  }
  function scores() { const s = {}; P.forEach((p, i) => { const k = cfg.teams ? "t" + team(i) : "p" + i; s[k] = (s[k] || 0) + p.k; }); return s; }
  function finish() { if (ended) return; const d = { K: P.map((p) => p.k), D: P.map((p) => p.d) }; send("end", d); onEnd(d); }
  function onEnd(d) {
    phase = "end"; ended = true;
    d.K.forEach((k, i) => { P[i].k = k; P[i].d = d.D[i]; });
    const sc = scores(), mine = cfg.teams ? "t" + team(cfg.me) : "p" + cfg.me, top = Math.max(...Object.values(sc));
    const win = sc[mine] === top;
    St.gameEnd({ win, players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode, kills: P[cfg.me].k, deaths: P[cfg.me].d });
    T.haptic("notify", win ? "success" : "error");
    $("end-emoji").textContent = win ? "🏆" : "💀";
    $("end-title").textContent = win ? (cfg.teams ? "Ваша команда победила!" : "Ты лучший стрелок!") : "Не в этот раз";
    $("end-sub").innerHTML = cfg.players.map((p, i) => ({ p, i })).sort((a, b) => P[b.i].k - P[a.i].k || P[a.i].d - P[b.i].d)
      .map((r) => `<div style="display:flex;justify-content:space-between;gap:8px"><span><b style="color:${r.p.color}">●</b> ${r.p.name.replace(/[<>&]/g, "")}${r.i === cfg.me ? " (ты)" : ""}</span><b>🎯 ${P[r.i].k} · 💀 ${P[r.i].d}</b></div>`).join("");
    const b = [];
    if (isHost()) b.push(["🔁 Ещё раунд", "primary", () => { const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) }); }]);
    else b.push(["Ждём, пока хозяин запустит раунд…", "", () => {}]);
    b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
    const box = $("end-buttons"); box.innerHTML = "";
    b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
    setTimeout(() => $("screen-end").classList.remove("hidden"), 700);
  }

  // ---------- сеть ----------
  function snapshot() { return { P: P.map((p) => [Math.round(p.x), Math.round(p.y), +p.a.toFixed(2), p.hp, p.alive ? 1 : 0]), t: +gt.toFixed(1) }; }
  function applySnap(s) {
    s.P.forEach((v, i) => { const p = P[i]; if (!p) return; p.hp = v[3]; const was = p.alive; p.alive = !!v[4]; if (i === cfg.me) { if (!was && p.alive) { p.x = v[0]; p.y = v[1]; } return; } p.tx = v[0]; p.ty = v[1]; p.a = v[2]; });
    gt = s.t;
  }

  function begin(c) {
    cfg = c.cfg; room = c.room; ended = false; gt = 0; phase = "play"; fx = []; B = []; packs = []; packT = 6; ammo = AMMO; reload = 0; cool = 0;
    for (const k in BOT) delete BOT[k];
    target = cfg.teams ? 15 : 10;
    genArena(cfg.seed); startPlayers();
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    ["top", "ammo", "hint"].forEach((s) => $(s).classList.remove("hidden"));
    setTimeout(() => $("hint").classList.add("hidden"), 7000);
    if (room) {
      ["snap", "me", "fire", "shot", "ko", "hp", "rs", "packs", "end", "start", "roster", "host-left", "full", "left"].forEach((t) => room.off(t));
      room.on("snap", (s) => { if (!isHost()) applySnap(s); });
      room.on("me", (d, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i >= 0 && P[i].alive) { P[i].tx = d[0]; P[i].ty = d[1]; P[i].a = d[2]; } });
      room.on("fire", (d, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i < 0 || !P[i].alive) return; addBullet(i, d[0], d[1], d[2]); send("shot", [i, d[0], d[1], d[2]]); });
      room.on("shot", (d) => { if (isHost() || d[0] === cfg.me) return; addBullet(d[0], d[1], d[2], d[3]); P[d[0]].a = d[3]; });
      room.on("ko", (d) => { if (!isHost()) { P[d[0]].d++; onKo(d); } });
      room.on("hp", (d) => { if (!isHost()) { P[d[0]].hp = d[1]; onHp(d[0]); } });
      room.on("rs", (d) => { if (!isHost()) { const p = P[d[0]]; Object.assign(p, { x: d[1], y: d[2], tx: d[1], ty: d[2], alive: true, hp: 100, sh: SHIELD }); } });
      room.on("packs", (d) => { if (!isHost()) packs = d; });
      room.on("end", (d) => { if (!isHost()) onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
      room.on("host-left", () => { if (phase === "play") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; feed(`${p.name} вышел — играет бот`); } });
    }
    msg(cfg.teams ? `Ты за ${Party.TEAMNAMES[team(cfg.me)]}` : `До ${target} фрагов!`, 1600);
    St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode });
  }
  function toMenu() { phase = "menu"; ["top", "ammo", "hint", "screen-end"].forEach((s) => $(s).classList.add("hidden")); $("screen-menu").classList.remove("hidden"); }
  let msgT = 0, feedT = 0;
  function msg(t, ms) { const el = $("msg"); el.textContent = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }
  function feed(t) { const el = $("feed"); el.textContent = t; clearTimeout(feedT); feedT = setTimeout(() => { el.textContent = ""; }, 2500); }

  // ---------- ввод: левая половина — бег, правая — прицел/огонь ----------
  const sticks = {}; let moveS = null, aimS = null;
  canvas.addEventListener("pointerdown", (e) => {
    const s = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, t: performance.now(), far: false };
    if (e.clientX < W / 2 && !moveS) { moveS = s; sticks[e.pointerId] = "m"; }
    else if (!aimS) { aimS = s; sticks[e.pointerId] = "a"; }
  });
  addEventListener("pointermove", (e) => {
    const k = sticks[e.pointerId]; const s = k === "m" ? moveS : k === "a" ? aimS : null; if (!s) return;
    s.cx = e.clientX; s.cy = e.clientY;
    const dx = s.cx - s.x, dy = s.cy - s.y, d = Math.hypot(dx, dy);
    if (d > 26) s.far = true;
    if (d > 60) { s.x += dx / d * (d - 60); s.y += dy / d * (d - 60); }
  });
  const up = (e) => {
    const k = sticks[e.pointerId]; delete sticks[e.pointerId];
    if (k === "m") moveS = null;
    if (k === "a") { if (!aimS.far && performance.now() - aimS.t < 350) autoShot(); aimS = null; }
  };
  addEventListener("pointerup", up); addEventListener("pointercancel", up);
  const keys = {};
  addEventListener("keydown", (e) => { keys[e.code] = 1; if (e.code === "Space") autoShot(); }); addEventListener("keyup", (e) => { keys[e.code] = 0; });
  function autoShot() {
    const p = P[cfg.me]; if (!p || !p.alive) return;
    let best = -1, bd = 1e9;
    P.forEach((q, j) => { if (ally(cfg.me, j) || !q.alive || !seen(cfg.me, j)) return; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = j; } });
    shoot(best >= 0 ? Math.atan2(P[best].y - p.y, P[best].x - p.x) : p.a);
  }
  function myMove() {
    if (moveS) { const dx = moveS.cx - moveS.x, dy = moveS.cy - moveS.y, d = Math.hypot(dx, dy); if (d > 6) return [dx / Math.max(d, 60), dy / Math.max(d, 60)]; }
    const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (kx || ky) { const d = Math.hypot(kx, ky); return [kx / d, ky / d]; }
    return window.__autoMove || null;
  }

  // ---------- отрисовка ----------
  let camX = AW / 2, camY = AH / 2;
  const ZOOM = () => Math.min(1.2, Math.max(0.62, W / 430));
  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#1b2a1f"; ctx.fillRect(0, 0, W, H);
    if (!cfg || !P.length) return;
    const me = P[cfg.me], z = ZOOM();
    camX += (me.x - camX) * Math.min(1, dt * 8); camY += (me.y - camY) * Math.min(1, dt * 8);
    const cx = W / 2 - camX * z, cy = H * 0.52 - camY * z;
    ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * cx, DPR * cy);
    // пол
    ctx.fillStyle = "#c9b98f"; ctx.fillRect(0, 0, AW, AH);
    ctx.fillStyle = "#bfae82";
    for (let x = 0; x < AW; x += 60) for (let y = 0; y < AH; y += 60) if (((x + y) / 60) % 2 === 0) ctx.fillRect(x, y, 60, 60);
    // аптечки
    for (const pk of packs) { const b = Math.sin(t * 4) * 2; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(pk[0] - 13, pk[1] - 13 + b, 26, 26, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#ef4444"; ctx.fillRect(pk[0] - 3.5, pk[1] - 9 + b, 7, 18); ctx.fillRect(pk[0] - 9, pk[1] - 3.5 + b, 18, 7); }
    // стены-ящики
    for (const w of walls) {
      ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(w[0] + 5, w[1] + 7, w[2], w[3]);
      ctx.fillStyle = "#8b5a2b"; ctx.fillRect(w[0], w[1], w[2], w[3]);
      ctx.strokeStyle = "#5b3a1a"; ctx.lineWidth = 3; ctx.strokeRect(w[0] + 1.5, w[1] + 1.5, w[2] - 3, w[3] - 3);
      ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w[0] + 4, w[1] + 4); ctx.lineTo(w[0] + w[2] - 4, w[1] + w[3] - 4); ctx.stroke();
    }
    // бойцы
    P.forEach((p, i) => {
      if (!p.alive) return;
      const hid = inBush(p.x, p.y) && !ally(cfg.me, i) && Math.hypot(p.x - me.x, p.y - me.y) > 110;
      if (hid) return;
      ctx.globalAlpha = inBush(p.x, p.y) ? 0.55 : 1;
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 6, R, R * 0.7, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#111"; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.a) * (R + 12), p.y + Math.sin(p.a) * (R + 12)); ctx.stroke();
      ctx.fillStyle = col(i); ctx.strokeStyle = i === cfg.me ? "#fff" : "#111"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x + Math.cos(p.a) * 6 - Math.sin(p.a) * 5, p.y + Math.sin(p.a) * 6 + Math.cos(p.a) * 5, 3, 0, 7); ctx.arc(p.x + Math.cos(p.a) * 6 + Math.sin(p.a) * 5, p.y + Math.sin(p.a) * 6 - Math.cos(p.a) * 5, 3, 0, 7); ctx.fill();
      if (p.sh > 0) { ctx.strokeStyle = "rgba(125,211,252,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, R + 6, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000"; ctx.fillRect(p.x - 20, p.y - R - 14, 40, 7);
      ctx.fillStyle = p.hp > 50 ? "#22c55e" : p.hp > 25 ? "#f59e0b" : "#ef4444"; ctx.fillRect(p.x - 19, p.y - R - 13, 38 * p.hp / 100, 5);
      ctx.font = "800 11px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; const lab = i === cfg.me ? "Ты" : cfg.players[i].name;
      ctx.strokeText(lab, p.x, p.y - R - 18); ctx.fillStyle = "#fff"; ctx.fillText(lab, p.x, p.y - R - 18);
    });
    // кусты поверх
    for (const b of bushes) {
      ctx.fillStyle = me.alive && inBush(me.x, me.y) && Math.hypot(b[0] - me.x, b[1] - me.y) < b[2] ? "rgba(34,120,50,.55)" : "#2f8f46";
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; ctx.beginPath(); ctx.arc(b[0] + Math.cos(a) * b[2] * 0.45, b[1] + Math.sin(a) * b[2] * 0.45, b[2] * 0.55, 0, 7); ctx.fill(); }
    }
    // пули и эффекты
    for (const b of B) { ctx.strokeStyle = "rgba(255,240,150,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 7); ctx.fill(); }
    fx = fx.filter((e) => (e.t += dt) < (e.k === "boom" ? 0.6 : 0.2));
    for (const e of fx) {
      if (e.k === "flash") { ctx.fillStyle = `rgba(255,220,100,${1 - e.t / 0.2})`; ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, 7); ctx.fill(); }
      else if (e.k === "hit") { ctx.fillStyle = `rgba(239,68,68,${1 - e.t / 0.2})`; ctx.beginPath(); ctx.arc(e.x, e.y, 10, 0, 7); ctx.fill(); }
      else if (e.k === "puff") { ctx.fillStyle = `rgba(90,60,30,${0.7 - e.t * 3})`; ctx.beginPath(); ctx.arc(e.x, e.y, 6 + e.t * 30, 0, 7); ctx.fill(); }
      else { ctx.globalAlpha = 1 - e.t / 0.6; ctx.strokeStyle = e.c; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + e.t * 90, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    ctx.strokeStyle = "#3a2a14"; ctx.lineWidth = 8; ctx.strokeRect(-4, -4, AW + 8, AH + 8);
    // прицельная линия
    if (aimS && aimS.far && me.alive) { const a = Math.atan2(aimS.cy - aimS.y, aimS.cx - aimS.x); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.setLineDash([8, 8]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(me.x + Math.cos(a) * BRANGE, me.y + Math.sin(a) * BRANGE); ctx.stroke(); ctx.setLineDash([]); }
    // джойстики
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const s of [moveS, aimS]) { if (!s) continue; ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, 60, 0, 7); ctx.stroke(); ctx.fillStyle = s === aimS ? "rgba(255,120,60,.7)" : "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(s.cx, s.cy, 22, 0, 7); ctx.fill(); }
    if (!me.alive && phase === "play") { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, W, H); }
  }
  function hud() {
    const sc = scores(), me = P[cfg.me];
    if (cfg.teams) { $("s-me").textContent = Object.keys(sc).sort().map((k) => `${["🔵", "🔴", "🟢", "🟡"][+k.slice(1)]} ${sc[k]}`).join("  "); $("s-lead").textContent = `🎯 ${me.k} / ${target}`; }
    else { $("s-me").textContent = `🎯 ${me.k}  💀 ${me.d}`; let li = 0; P.forEach((p, i) => { if (p.k > P[li].k) li = i; }); $("s-lead").textContent = `👑 ${pname(li)}: ${P[li].k}/${target}`; }
    const tl = Math.max(0, DURATION - gt); $("s-time").textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, "0")}`;
    $("ammo").innerHTML = Array.from({ length: AMMO }, (_, k) => `<i class="${k < Math.floor(ammo) ? "" : "e"}"></i>`).join("");
  }
  let last = 0, snapT = 0, meT = 0, hudT = 0;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (phase === "play") {
      gt += dt;
      const me = P[cfg.me];
      P.forEach((p) => { p.px = p.x; p.py = p.y; if (p.sh > 0) p.sh -= dt; });
      if (me.alive) {
        const mv = myMove(); if (mv) moveP(me, mv[0] * SPEED * dt, mv[1] * SPEED * dt);
        if (aimS && aimS.far) { const a = Math.atan2(aimS.cy - aimS.y, aimS.cx - aimS.x); me.a = a; shoot(a); }
        else if (mv && !aimS) me.a = Math.atan2(mv[1], mv[0]);
      }
      cool -= dt; if (ammo < AMMO) { reload -= dt; if (reload <= 0) { ammo += 1; reload = ammo < AMMO ? RELOAD : 0; } }
      P.forEach((p, i) => { if (i !== cfg.me && !(isHost() && cfg.players[i].bot)) { p.x += (p.tx - p.x) * Math.min(1, dt * 12); p.y += (p.ty - p.y) * Math.min(1, dt * 12); } });
      if (isHost()) {
        bots(dt); hostPacks(dt);
        P.forEach((p, i) => { if (!p.alive) { p.resp -= dt; if (p.resp <= 0 && !ended) respawn(i); } });
        if (gt >= DURATION) checkEnd();
      }
      stepBullets(dt);
      if (room) {
        if (isHost()) { snapT -= dt; if (snapT <= 0) { snapT = 1 / 12; room.sendFast("snap", snapshot()); } }
        else { meT -= dt; if (meT <= 0) { meT = 1 / 15; room.sendFast("me", [Math.round(me.x), Math.round(me.y), +me.a.toFixed(2)]); } }
      }
      hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.15; }
    }
    render(ts / 1000, dt);
    requestAnimationFrame(frame);
  }

  const PARTY = { title: "Перестрелка", icon: "🔫", max: 6, bots: 2, text: "Го в «Перестрелку» 🔫 Арена, кусты, фраги — заходи в комнату!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }, { id: "t2", name: "2 команды", teams: 2 }], onCancel: toMenu };
  $("m-bots").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.offline(Object.assign({}, PARTY, { bots: 3 }))); };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("strelka", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#1b2a1f", bg: "#1b2a1f", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("strelka", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get P() { return P; }, get cfg() { return cfg; }, get B() { return B; }, shoot, autoShot, finish };
})();
