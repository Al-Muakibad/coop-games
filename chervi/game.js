/* Червячки — пошаговые бои команд червяков на разрушаемой земле. До 4 игроков, боты, команды.
   Ход считает телефон того, чей червяк ходит (за ботов — хозяин комнаты); остальные получают снимки. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const WW = 1000, WH = 640, WATER = 598, G = 330, WALK = 42, TURN = 30, RETREAT = 3, WINDK = 70;
  const WP = {
    bazooka: { i: "🚀", n: "Базука", r: 30, d: 45, speed: 560 },
    grenade: { i: "💣", n: "Граната", r: 34, d: 48, speed: 470, fuse: 3, bounce: 0.45 },
    dynamite: { i: "🧨", n: "Динамит", r: 54, d: 72, fuse: 4, bounce: 0.1, ammo: 1 },
    shotgun: { i: "🔫", n: "Дробовик", r: 13, d: 26 }
  };
  const WLIST = ["bazooka", "grenade", "dynamite", "shotgun"];
  const NAMES = ["Боря", "Гоша", "Шнурок", "Вжик", "Пончик", "Кексик", "Бублик", "Жужа", "Тоша", "Червик", "Хрум", "Ластик", "Пиксель", "Моня", "Фантик", "Зефир"];
  function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR, S = 1;
  function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; canvas.width = W * DPR; canvas.height = H * DPR; S = Math.max(0.8, Math.min(2.2, W / 230, (H - 150) / 380)); }
  addEventListener("resize", resize); resize();

  // ---------- земля ----------
  let mask = new Uint8Array(WW * WH);
  const tc = document.createElement("canvas"); tc.width = WW; tc.height = WH;
  const tx = tc.getContext("2d");
  const bc = document.createElement("canvas"); bc.width = WW; bc.height = WH;   // задняя стенка: видна в ямах и пещерах
  const bx = bc.getContext("2d");
  const solid = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || x >= WW || y < 0) return false; if (y >= WH) return false; return mask[y * WW + x] === 1; };
  function genTerrain(seed) {
    const r = rng(seed), p = [r() * 6, r() * 6, r() * 6, r() * 6], f = [0.006 + r() * 0.004, 0.017 + r() * 0.008, 0.045 + r() * 0.02];
    mask = new Uint8Array(WW * WH);
    const hs = [];
    for (let x = 0; x < WW; x++) {
      let h = 360 + Math.sin(x * f[0] + p[0]) * 70 + Math.sin(x * f[1] + p[1]) * 38 + Math.sin(x * f[2] + p[2]) * 12;
      const e = Math.min(x, WW - 1 - x); if (e < 70) h += (70 - e) * (70 - e) * 0.06;
      hs.push(Math.round(Math.min(h, WH)));
    }
    for (let x = 0; x < WW; x++) for (let y = hs[x]; y < WH; y++) mask[y * WW + x] = 1;
    const blob = (cx, cy, rx, ry, v) => { for (let y = Math.max(0, cy - ry); y < Math.min(WH, cy + ry); y++) for (let x = Math.max(0, cx - rx); x < Math.min(WW, cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy < 1) mask[y * WW + x] = v; } };
    for (let i = 0; i < 2; i++) blob(Math.round(200 + r() * 600), Math.round(170 + r() * 80), Math.round(55 + r() * 40), Math.round(14 + r() * 8), 1);   // летающие острова
    for (let i = 0; i < 2; i++) { const cx = Math.round(150 + r() * 700); blob(cx, Math.round(hs[cx] + 70 + r() * 60), Math.round(40 + r() * 30), Math.round(18 + r() * 10), 0); } // пещеры
    // картинка земли
    const img = tx.createImageData(WW, WH), d = img.data, nr = rng(seed + 7);
    for (let x = 0; x < WW; x++) {
      let depth = 0;
      for (let y = 0; y < WH; y++) {
        const k = y * WW + x;
        if (!mask[k]) { depth = 0; continue; }
        depth++;
        const o = k * 4, n = nr() * 18;
        if (depth <= 5) { d[o] = 76 + n; d[o + 1] = 175 + n; d[o + 2] = 60; }
        else if (depth <= 8) { d[o] = 60; d[o + 1] = 120 + n; d[o + 2] = 45; }
        else { const v = ((x * 7 + y * 13) % 97 < 3) ? -25 : 0; d[o] = 150 + n + v; d[o + 1] = 100 + n * 0.7 + v; d[o + 2] = 62 + v; }
        d[o + 3] = 255;
      }
    }
    tx.putImageData(img, 0, 0);
    // задняя стенка — по силуэту исходной земли (без пещер), затемнённая
    bx.clearRect(0, 0, WW, WH); bx.fillStyle = "#5b3a22"; bx.beginPath(); bx.moveTo(0, WH);
    for (let x = 0; x < WW; x += 2) bx.lineTo(x, hs[x] + 10); bx.lineTo(WW, WH); bx.fill();
    bx.fillStyle = "rgba(0,0,0,.12)"; for (let i = 0; i < 400; i++) { const x = nr() * WW, y = nr() * WH; bx.fillRect(x, y, 3, 2); }
  }
  function cut(x, y, r) {
    x = Math.round(x); y = Math.round(y);
    for (let yy = Math.max(0, y - r); yy <= Math.min(WH - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(WW - 1, x + r); xx++) { const dx = xx - x, dy = yy - y; if (dx * dx + dy * dy <= r * r) mask[yy * WW + xx] = 0; }
    tx.save(); tx.globalCompositeOperation = "source-atop"; tx.fillStyle = "rgba(60,30,10,.55)"; tx.beginPath(); tx.arc(x, y, r + 4, 0, 7); tx.fill(); tx.restore();
    tx.save(); tx.globalCompositeOperation = "destination-out"; tx.beginPath(); tx.arc(x, y, r, 0, 7); tx.fill(); tx.restore();
  }

  // ---------- состояние ----------
  let room = null, cfg = null, phase = "menu", worms = [], proj = [], fx = [], wind = 0, cur = 0, turnNo = 0, teamLast = {}, ammo = {};
  let ph = "aim", tl = TURN, wpn = "bazooka", aim = null, explosions = [], settleT = 0, ended = false, lastAuthMsg = 0, botPlan = null;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const owner = () => (worms[cur] ? worms[cur].p : 0);
  const isAuth = () => !room || owner() === cfg.me || (cfg.players[owner()].bot && isHost());
  const myTurn = () => worms[cur] && owner() === cfg.me && !cfg.players[cfg.me].bot;
  const tcol = (t) => (cfg.teams ? Party.COLORS[t] : cfg.players.find((p) => p.team === t).color);
  const tname = (t) => (cfg.teams ? Party.TEAMNAMES[t] : cfg.players.find((p) => p.team === t).name);

  function setup() {
    const r = rng(cfg.seed + 3), np = cfg.players.length, per = np <= 2 ? 3 : 2;
    genTerrain(cfg.seed);
    const names = NAMES.slice().sort(() => r() - 0.5);
    worms = [];
    for (let k = 0; k < per; k++) cfg.players.forEach((p, i) => worms.push({ p: i, t: p.team, hp: 100, dead: false, air: false, vx: 0, vy: 0, face: 1, name: names[worms.length % names.length] }));
    const n = worms.length, xs = [];
    for (let k = 0; k < n; k++) xs.push(80 + (WW - 160) * (k + 0.5) / n + (r() - 0.5) * 40);
    const order = worms.map((_, i) => i).sort(() => r() - 0.5);
    order.forEach((wi, k) => { const w = worms[wi]; w.x = Math.round(xs[k]); w.y = 0; while (w.y < WATER && !solid(w.x, w.y + 1)) w.y++; while (solid(w.x, w.y) && w.y > 0) w.y--; w.rx = w.x; w.ry = w.y; w.face = w.x < WW / 2 ? 1 : -1; });
    proj = []; fx = []; turnNo = 0; teamLast = {}; ammo = {}; ended = false;
    const teams = [...new Set(worms.map((w) => w.t))];
    teams.forEach((t) => { ammo[t] = { dynamite: 1 }; });
    cur = worms.findIndex((w) => w.t === teams[Math.floor(r() * teams.length)]);
    teamLast[worms[cur].t] = cur;
    wind = Math.round((r() * 2 - 1) * 10) / 10;
  }

  // ---------- физика ----------
  function wormStep(w, dt, walk) {
    if (w.dead) return;
    if (w.air) {
      w.vy += G * dt;
      const n = Math.ceil(Math.max(Math.abs(w.vx), Math.abs(w.vy)) * dt / 1.5) + 1;
      for (let i = 0; i < n; i++) {
        const nx = w.x + w.vx * dt / n, ny = w.y + w.vy * dt / n;
        if (w.vy > 0 && solid(nx, ny)) {
          let y = ny; for (let k = 0; k < 8 && solid(nx, y); k++) y--;
          if (w.vy > 330) { const dmg = Math.round((w.vy - 330) / 7); hurt(w, dmg); }
          w.x = nx; w.y = Math.round(y); w.vx = 0; w.vy = 0; w.air = false; return;
        }
        if (solid(nx, ny - 7) || solid(nx, ny - 12)) {
          if (w.vy < 0 && solid(w.x, ny - 13)) { w.vy = 0; }
          else { w.vx = -w.vx * 0.3; }
          continue;
        }
        w.x = nx; w.y = ny;
      }
      if (w.x < -30 || w.x > WW + 30) w.vx = 0;
      if (w.y > WATER + 6) drown(w);
      return;
    }
    if (!solid(w.x, w.y + 1)) {
      let k = 1; while (k <= 4 && !solid(w.x, w.y + k + 1)) k++;
      if (k <= 4) w.y += k; else { w.air = true; w.vx = 0; w.vy = 0; return; }
    }
    if (walk) {
      w.face = walk;
      const nx = w.x + walk * WALK * dt;
      if (nx < 3 || nx > WW - 3) return;
      let y = w.y, ok = false;
      for (let k = 0; k <= 6; k++) if (!solid(nx, y - k) && !solid(nx, y - k - 10)) { y -= k; ok = true; break; }
      if (ok) { w.x = nx; w.y = y; let k = 0; while (k < 5 && !solid(w.x, w.y + 1)) { w.y++; k++; } if (!solid(w.x, w.y + 1)) { w.air = true; w.vx = walk * 20; w.vy = 0; } }
    }
  }
  function hurt(w, dmg) { if (dmg <= 0 || w.dead) return; w.hp = Math.max(0, w.hp - dmg); fx.push({ k: "num", x: w.x, y: w.y - 26, t: 0, s: "-" + dmg, c: tcol(w.t) }); }
  function drown(w) { if (w.dead) return; w.hp = 0; w.dead = true; w.drowned = true; fx.push({ k: "splash", x: w.x, y: WATER, t: 0 }); }
  function explode(x, y, r, d, local) {
    cut(x, y, r); explosions.push([Math.round(x), Math.round(y), r]);
    fx.push({ k: "boom", x, y, r, t: 0 });
    if (local !== false) send("x", [Math.round(x), Math.round(y), r]);
    T.haptic("impact", r > 40 ? "heavy" : "medium");
    for (const w of worms) {
      if (w.dead) continue;
      const dx = w.x - x, dy = w.y - 6 - y, dd = Math.hypot(dx, dy), R = r * 1.6;
      if (dd >= R) continue;
      const f = 1 - dd / R;
      hurt(w, Math.round(d * f));
      const a = Math.atan2(dy, dx || 0.01), kick = 300 * f;
      w.vx += Math.cos(a) * kick; w.vy += Math.sin(a) * kick - 110 * f; w.air = true;
    }
    for (const p of proj) { const dd = Math.hypot(p.x - x, p.y - y); if (dd < r * 1.6 && p.k !== "bazooka") { const a = Math.atan2(p.y - y, p.x - x); p.vx += Math.cos(a) * 200; p.vy += Math.sin(a) * 200 - 80; p.rest = false; } }
  }
  function normalAt(x, y) { let nx = 0, ny = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!solid(x + dx, y + dy)) { nx += dx; ny += dy; } const l = Math.hypot(nx, ny) || 1; return [nx / l, ny / l]; }
  function projStep(p, dt) {
    const wp = WP[p.k];
    if (p.fuse != null) { p.fuse -= dt; if (p.fuse <= 0) { p.gone = true; explode(p.x, p.y, wp.r, wp.d); return; } }
    if (p.rest) { if (!solid(p.x, p.y + 2)) p.rest = false; else return; }
    p.vy += G * dt; if (p.k === "bazooka") p.vx += wind * WINDK * dt;
    p.age = (p.age || 0) + dt;
    const n = Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 2) + 1;
    for (let i = 0; i < n; i++) {
      const nx = p.x + p.vx * dt / n, ny = p.y + p.vy * dt / n;
      if (p.k === "bazooka") {
        const hitW = worms.some((w) => !w.dead && (p.age > 0.12 || w !== worms[cur]) && Math.hypot(w.x - nx, w.y - 6 - ny) < 9);
        if (solid(nx, ny) || hitW) { p.gone = true; explode(nx, ny, wp.r, wp.d); return; }
      } else if (solid(nx, ny)) {
        const [ux, uy] = normalAt(nx, ny), dot = p.vx * ux + p.vy * uy;
        p.vx = (p.vx - 2 * dot * ux) * wp.bounce; p.vy = (p.vy - 2 * dot * uy) * wp.bounce;
        if (Math.hypot(p.vx, p.vy) < 25) { p.vx = 0; p.vy = 0; p.rest = true; }
        return;
      }
      p.x = nx; p.y = ny;
    }
    if (p.x < -60 || p.x > WW + 60 || p.y > WATER + 4) { p.gone = true; if (p.y > WATER) fx.push({ k: "splash", x: p.x, y: WATER, t: 0 }); }
  }
  function shotgun(w, a) {
    const ox = w.x, oy = w.y - 8;
    for (let s = 6; s < 520; s += 2) {
      const x = ox + Math.cos(a) * s, y = oy + Math.sin(a) * s;
      if (x < 0 || x > WW || y > WATER) break;
      const hit = worms.some((o) => o !== w && !o.dead && Math.hypot(o.x - x, o.y - 6 - y) < 8);
      if (hit || solid(x, y)) { explode(x, y, WP.shotgun.r, WP.shotgun.d); fx.push({ k: "ray", x: ox, y: oy, x2: x, y2: y, t: 0 }); return; }
    }
    fx.push({ k: "ray", x: ox, y: oy, x2: ox + Math.cos(a) * 520, y2: oy + Math.sin(a) * 520, t: 0 });
  }
  function fire(a, pw) {
    if (ph !== "aim") return;
    const w = worms[cur], wp = WP[wpn], t = w.t;
    if (wp.ammo && !(ammo[t] && ammo[t][wpn] > 0)) { msg("Динамит закончился", 900); return; }
    if (wp.ammo) ammo[t][wpn]--;
    w.face = Math.cos(a) >= 0 ? 1 : -1;
    if (wpn === "shotgun") shotgun(w, a);
    else if (wpn === "dynamite") proj.push({ k: wpn, x: w.x + w.face * 6, y: w.y - 8, vx: w.face * 30, vy: -60, fuse: wp.fuse });
    else proj.push({ k: wpn, x: w.x + Math.cos(a) * 12, y: w.y - 8 + Math.sin(a) * 12, vx: Math.cos(a) * wp.speed * pw, vy: Math.sin(a) * wp.speed * pw, fuse: wp.fuse });
    ph = "fly"; aim = null;
    T.haptic("impact", "heavy");
    if (wp.ammo) updWpnBtn();
  }

  // ---------- ход ----------
  function stepAuth(dt) {
    const w = worms[cur];
    if (ph === "aim" || ph === "retreat") { tl -= dt; if (tl <= 0) { ph = "settle"; settleT = 0.6; aim = null; } }
    let walk = 0;
    if (myTurn() && (ph === "aim" || ph === "retreat") && !w.air) walk = (keys.l ? -1 : 0) + (keys.r ? 1 : 0);
    if (!myTurn() && botPlan && ph === "aim") botTick(dt);
    worms.forEach((o, i) => wormStep(o, dt, i === cur ? walk : 0));
    proj.forEach((p) => projStep(p, dt)); proj = proj.filter((p) => !p.gone);
    if (w && (w.dead || w.hp <= 0) && (ph === "aim" || ph === "retreat")) { ph = "settle"; settleT = 0.6; }
    if (ph === "fly" && !proj.length) { ph = "retreat"; tl = RETREAT; if (wpn === "dynamite" || w.dead) { tl = RETREAT; } }
    if (ph === "settle") {
      const busy = proj.length || worms.some((o) => !o.dead && o.air);
      if (busy) settleT = 0.6; else { settleT -= dt; if (settleT <= 0) nextTurn(); }
    }
  }
  function nextTurn() {
    // гибель
    let died = false;
    for (const w of worms) if (!w.dead && w.hp <= 0) { w.dead = true; died = true; fx.push({ k: "boom", x: w.x, y: w.y - 6, r: 14, t: 0 }); }
    const alive = [...new Set(worms.filter((w) => !w.dead).map((w) => w.t))];
    if (alive.length <= 1) { const d = { win: alive.length ? alive[0] : -1, W: packW(true), X: explosions }; send("end", d); onEnd(d); return; }
    const teams = [...new Set(worms.map((w) => w.t))].sort((a, b) => a - b);
    let ti = teams.indexOf(worms[cur].t);
    for (let k = 1; k <= teams.length; k++) { const t = teams[(ti + k) % teams.length]; if (alive.includes(t)) { ti = t; break; } }
    const mine = worms.map((w, i) => i).filter((i) => worms[i].t === ti && !worms[i].dead);
    const lastI = teamLast[ti] != null ? teamLast[ti] : -1;
    const nxt = mine.find((i) => i > lastI); cur = nxt != null ? nxt : mine[0];
    teamLast[ti] = cur;
    wind = Math.round((Math.random() * 2 - 1) * 10) / 10;
    turnNo++;
    const d = { cur, wind, W: packW(true), X: explosions, L: teamLast, A: ammo, n: turnNo };
    explosions = [];
    send("turn", d); startTurn(d, died);
  }
  function packW(full) { return worms.map((w) => full ? [Math.round(w.x * 10) / 10, Math.round(w.y * 10) / 10, w.hp, w.dead ? 1 : 0, w.face, w.air ? 1 : 0, w.drowned ? 1 : 0] : [Math.round(w.x), Math.round(w.y), w.hp, w.dead ? 1 : 0, w.face]); }
  function unpackW(W, snapPos) {
    W.forEach((v, i) => { const w = worms[i]; if (!w) return; if (v[2] < w.hp && !snapPos) {} if (v[2] < w.hp) fx.push({ k: "num", x: v[0], y: v[1] - 26, t: 0, s: "-" + (w.hp - v[2]), c: tcol(w.t) }); w.x = v[0]; w.y = v[1]; w.hp = v[2]; if (v[3] && !w.dead && v[6]) fx.push({ k: "splash", x: w.x, y: WATER, t: 0 }); w.dead = !!v[3]; w.face = v[4]; if (v.length > 5) { w.air = !!v[5]; w.drowned = !!v[6]; } if (snapPos) { w.rx = w.x; w.ry = w.y; } });
  }
  function startTurn(d, died) {
    cur = d.cur; wind = d.wind; turnNo = d.n; teamLast = d.L; ammo = d.A;
    ph = "aim"; tl = TURN; aim = null; proj = []; wpn = "bazooka"; updWpnBtn(); botPlan = null; lastAuthMsg = Date.now();
    const w = worms[cur], p = cfg.players[w.p];
    $("turn").textContent = (w.p === cfg.me && !p.bot ? "Твой ход: " : `Ходит ${p.name}: `) + "🪱 " + w.name;
    if (myTurn()) { msg("Твой ход!", 900); T.haptic("notify", "success"); }
    $("pad").classList.toggle("off", !myTurn());
    if (isAuth() && p.bot) botPlan = { t: 1.2 + Math.random() * 0.8 };
  }

  // ---------- бот ----------
  function simShot(x, y, a, pw, wpnk, skip) {
    const wp = WP[wpnk]; let vx = Math.cos(a) * wp.speed * pw, vy = Math.sin(a) * wp.speed * pw; x += Math.cos(a) * 12; y += Math.sin(a) * 12;
    const dt = 1 / 40;
    for (let t = 0; t < 5; t += dt) {
      vy += G * dt; if (wpnk === "bazooka") vx += wind * WINDK * dt;
      const n = Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) * dt / 3) + 1;
      for (let i = 0; i < n; i++) {
        x += vx * dt / n; y += vy * dt / n;
        if (x < -20 || x > WW + 20 || y > WATER) return null;
        if (solid(x, y) || worms.some((w, k) => !w.dead && k !== skip && Math.hypot(w.x - x, w.y - 6 - y) < 9)) return [x, y];
      }
    }
    return null;
  }
  function botTick(dt) {
    const w = worms[cur];
    if (!botPlan.shot) {
      const enemies = worms.filter((o) => !o.dead && o.t !== w.t);
      if (!enemies.length) return;
      let best = null, bs = 1e9;
      for (let a = -Math.PI; a < Math.PI; a += Math.PI / 40) for (let pw = 0.3; pw <= 1.001; pw += 0.1) {
        const hit = simShot(w.x, w.y - 8, a, pw, "bazooka", cur); if (!hit) continue;
        if (Math.hypot(hit[0] - w.x, hit[1] - w.y) < 50) continue;
        if (worms.some((o) => !o.dead && o.t === w.t && Math.hypot(hit[0] - o.x, hit[1] - o.y) < 40)) continue;
        for (const e of enemies) { const s = Math.hypot(hit[0] - e.x, hit[1] - (e.y - 6)) + e.hp * 0.05; if (s < bs) { bs = s; best = [a, pw]; } }
      }
      if (!best) best = [w.face > 0 ? -0.6 : -Math.PI + 0.6, 0.7];
      const miss = Math.max(0.03, 0.13 - turnNo * 0.008);
      botPlan.shot = [best[0] + (Math.random() - 0.5) * miss, Math.min(1, best[1] + (Math.random() - 0.5) * miss)];
      botPlan.cur = [w.face > 0 ? -0.4 : -Math.PI + 0.4, 0.3];
      wpn = "bazooka";
    }
    botPlan.t -= dt;
    const k = Math.min(1, dt * 2.5);
    let da = botPlan.shot[0] - botPlan.cur[0]; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    botPlan.cur[0] += da * k; botPlan.cur[1] += (botPlan.shot[1] - botPlan.cur[1]) * k;
    aim = { a: botPlan.cur[0], p: botPlan.cur[1] }; w.face = Math.cos(aim.a) >= 0 ? 1 : -1;
    if (botPlan.t <= 0) { const s = botPlan.shot; botPlan = null; fire(s[0], s[1]); }
  }

  // ---------- сеть ----------
  function onSnap(s) {
    if (isAuth()) return;
    lastAuthMsg = Date.now();
    s.W.forEach((v, i) => { const w = worms[i]; if (!w) return; if (v[2] < w.hp) fx.push({ k: "num", x: v[0], y: v[1] - 26, t: 0, s: "-" + (w.hp - v[2]), c: tcol(w.t) }); w.x = v[0]; w.y = v[1]; w.hp = v[2]; w.dead = !!v[3]; w.face = v[4]; });
    proj = s.P.map((p) => ({ k: p[0], x: p[1], y: p[2], fuse: p[3] }));
    aim = s.A ? { a: s.A[0], p: s.A[1] } : null; ph = s.ph; tl = s.tl; wpn = s.wp;
  }
  function begin(c) {
    cfg = c.cfg; room = c.room; phase = "play";
    setup();
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    ["top", "pad"].forEach((s) => $(s).classList.remove("hidden"));
    if (room) {
      ["s", "x", "turn", "end", "start", "roster", "host-left", "full", "left"].forEach((t) => room.off(t));
      room.on("s", onSnap);
      room.on("x", (e) => { if (!isAuth()) { cut(e[0], e[1], e[2]); fx.push({ k: "boom", x: e[0], y: e[1], r: e[2], t: 0 }); T.haptic("impact", "medium"); } });
      room.on("turn", (d) => { if (d.n <= turnNo && turnNo > 0) return; d.X.forEach((e) => cut(e[0], e[1], e[2])); unpackW(d.W, true); explosions = []; startTurn(d); });
      room.on("end", (d) => { if (phase !== "play") return; d.X.forEach((e) => cut(e[0], e[1], e[2])); unpackW(d.W, true); onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
      room.on("host-left", () => { if (phase === "play") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; msg(`${p.name} вышел — за него бот`, 2000); if (isHost() && owner() === cfg.players.indexOf(p)) { botPlan = { t: 1 }; } } });
    }
    startTurn({ cur, wind, n: 0, L: teamLast, A: ammo });
    St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode });
  }
  function onEnd(d) {
    if (phase !== "play") return;
    phase = "end"; ended = true;
    const myT = cfg.players[cfg.me].team, win = d.win === myT;
    St.gameEnd({ win, players: cfg.players.length, mode: cfg.mode, turns: turnNo });
    T.haptic("notify", win ? "success" : "error");
    $("end-emoji").textContent = d.win < 0 ? "🤝" : win ? "🏆" : "🪦";
    $("end-title").textContent = d.win < 0 ? "Ничья — никого не осталось" : win ? "Победа!" : `Победили ${tname(d.win)}`;
    $("end-sub").innerHTML = [...new Set(worms.map((w) => w.t))].map((t) => `<div style="display:flex;justify-content:space-between"><span><b style="color:${tcol(t)}">●</b> ${tname(t).replace(/[<>&]/g, "")}</span><b>${worms.filter((w) => w.t === t && !w.dead).length} 🪱 · ${worms.filter((w) => w.t === t).reduce((s, w) => s + (w.dead ? 0 : w.hp), 0)} ❤️</b></div>`).join("");
    const box = $("end-buttons"); box.innerHTML = "";
    const b = (l, c, f) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); };
    if (isHost()) b("🔁 Новая карта", "primary", () => { const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) }); });
    else b("Ждём, пока хозяин начнёт новую карту…", "", () => {});
    b("Выйти", "ghost", () => { if (room) room.close(); room = null; phase = "menu"; ["top", "pad", "screen-end"].forEach((s) => $(s).classList.add("hidden")); $("turn").textContent = ""; $("screen-menu").classList.remove("hidden"); });
    setTimeout(() => { if (phase === "end") $("screen-end").classList.remove("hidden"); }, 1200);
  }
  let msgT = 0;
  function msg(t, ms) { const el = $("msg"); el.textContent = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }

  // ---------- управление ----------
  const keys = {};
  const hold = (id, k) => { const b = $(id); b.addEventListener("pointerdown", (e) => { e.preventDefault(); keys[k] = 1; b.classList.add("on"); }); ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => { keys[k] = 0; b.classList.remove("on"); })); };
  hold("b-left", "l"); hold("b-right", "r");
  $("b-jump").addEventListener("pointerdown", (e) => { e.preventDefault(); const w = worms[cur]; if (myTurn() && (ph === "aim" || ph === "retreat") && w && !w.air && !w.dead) { w.air = true; w.vy = -170; w.vx = w.face * 85; w.y -= 1; T.haptic("impact", "light"); } });
  function updWpnBtn() { const wp = WP[wpn]; const t = worms[cur] && worms[cur].t; const left = wp.ammo ? ` ×${(ammo[t] && ammo[t][wpn]) || 0}` : ""; $("b-wpn").textContent = `${wp.i} ${wp.n}${left}`; }
  $("b-wpn").onclick = () => {
    if (!myTurn() || ph !== "aim") return;
    const m = $("wmenu");
    if (!m.classList.contains("hidden")) { m.classList.add("hidden"); return; }
    const t = worms[cur].t;
    m.innerHTML = WLIST.map((k) => { const wp = WP[k], left = wp.ammo ? ` ×${(ammo[t] && ammo[t][k]) || 0}` : ""; return `<button data-w="${k}" class="${k === wpn ? "on" : ""}"><b>${wp.i}</b>${wp.n}${left}</button>`; }).join("");
    m.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => { wpn = b.dataset.w; updWpnBtn(); m.classList.add("hidden"); T.haptic("select"); if (wpn === "dynamite") msg("Потяни и отпусти — червяк бросит динамит под ноги", 1600); });
    m.classList.remove("hidden");
  };
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { if (!myTurn() || ph !== "aim") return; $("wmenu").classList.add("hidden"); drag = { x: e.clientX, y: e.clientY }; });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = drag.x - e.clientX, dy = drag.y - e.clientY, d = Math.hypot(dx, dy);
    if (d < 10) { aim = null; return; }
    aim = { a: Math.atan2(dy, dx), p: Math.min(1, d / 150) };
    worms[cur].face = dx >= 0 ? 1 : -1;
  });
  addEventListener("pointerup", () => { if (!drag) return; drag = null; if (aim && aim.p > 0.1 && myTurn()) fire(aim.a, wpn === "shotgun" ? 1 : aim.p); aim = null; });

  // ---------- отрисовка ----------
  const cam = { x: 0, y: 0 };
  const hills = (() => { const r = rng(5), a = []; for (let i = 0; i < 3; i++) a.push([r() * 6, 0.004 + r() * 0.004]); return a; })();
  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#5fb4f0"); sky.addColorStop(1, "#cfeaff");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (!cfg || !worms.length) return;
    // камера
    const focus = proj[0] || worms[cur] || { x: WW / 2, y: WH / 2 };
    const vw = W / S, vh = H / S;
    const tx0 = Math.max(-60, Math.min(WW + 60 - vw, focus.x - vw / 2));
    const ty0 = vh > WH + 110 ? WH + 90 - vh : Math.max(-80, Math.min(WH + 90 - vh, focus.y - vh / 2));
    cam.x += (tx0 - cam.x) * Math.min(1, dt * 4); cam.y += (ty0 - cam.y) * Math.min(1, dt * 4);
    if (!cam.init) { cam.x = tx0; cam.y = ty0; cam.init = 1; }
    // дальние холмы
    hills.forEach((h, i) => {
      ctx.fillStyle = ["#9dd0a8", "#7fbf8f", "#6aae7c"][i]; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 12) { const wx = x / S + cam.x * (0.2 + i * 0.15); ctx.lineTo(x, H * (0.45 + i * 0.08) + Math.sin(wx * h[1] + h[0]) * 50 - (cam.y * S * (0.1 + i * 0.1))); }
      ctx.lineTo(W, H); ctx.fill();
    });
    ctx.setTransform(DPR * S, 0, 0, DPR * S, -DPR * S * cam.x, -DPR * S * cam.y);
    ctx.drawImage(bc, 0, 0); ctx.drawImage(tc, 0, 0);
    // червяки
    worms.forEach((w, i) => {
      if (!isAuth()) { w.rx = (w.rx == null ? w.x : w.rx + (w.x - w.rx) * Math.min(1, dt * 12)); w.ry = (w.ry == null ? w.y : w.ry + (w.y - w.ry) * Math.min(1, dt * 12)); } else { w.rx = w.x; w.ry = w.y; }
      const x = w.rx, y = w.ry;
      if (w.dead) { if (w.drowned) return; ctx.fillStyle = "#9ca3af"; ctx.strokeStyle = "#374151"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x - 5, y - 14, 10, 14, [5, 5, 0, 0]); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#374151"; ctx.fillRect(x - 0.75, y - 11, 1.5, 7); ctx.fillRect(x - 3, y - 9, 6, 1.5); return; }
      const c = tcol(w.t), f = w.face, bob = i === cur && keys.l + keys.r && myTurn() ? Math.sin(t * 18) * 1 : 0;
      ctx.fillStyle = "#f9a8c4"; ctx.strokeStyle = "#9d4467"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x - f * 3, y - 3, 6, 3.4, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x - 3.6 + f * 0.6, y - 14 + bob, 7.2, 12, 3.6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c; ctx.fillRect(x - 3.6 + f * 0.6, y - 12 + bob, 7.2, 2);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + f * 1.2 - 1.6, y - 9 + bob, 1.9, 0, 7); ctx.arc(x + f * 1.2 + 1.6, y - 9 + bob, 1.9, 0, 7); ctx.fill();
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(x + f * 1.9 - 1.6, y - 9 + bob, 0.9, 0, 7); ctx.arc(x + f * 1.9 + 1.6, y - 9 + bob, 0.9, 0, 7); ctx.fill();
      ctx.font = "800 8px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#000";
      const lab = i === cur ? `${w.name} ${w.hp}` : `${w.hp}`;
      ctx.strokeText(lab, x, y - 17); ctx.fillStyle = c; ctx.fillText(lab, x, y - 17);
      if (i === cur && ph === "aim" && !aim) { const by = y - 32 + Math.sin(t * 6) * 3; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 5, by - 6); ctx.lineTo(x + 5, by - 6); ctx.lineTo(x, by); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    });
    // прицел
    const aw = worms[cur];
    if (aim && aw && !aw.dead && ph === "aim" && wpn !== "dynamite") {
      const ox = aw.rx, oy = aw.ry - 8, L = wpn === "shotgun" ? 60 : 18 + aim.p * 50;
      ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(aim.a) * L, oy + Math.sin(aim.a) * L); ctx.stroke(); ctx.setLineDash([]);
      const cx = ox + Math.cos(aim.a) * (L + 6), cy = oy + Math.sin(aim.a) * (L + 6);
      ctx.strokeStyle = aim.p > 0.75 ? "#ef4444" : aim.p > 0.4 ? "#f59e0b" : "#22c55e"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
      if (wpn !== "shotgun") { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(ox - 15, oy + 14, 30, 4); ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(ox - 15, oy + 14, 30 * aim.p, 4); }
    }
    // снаряды
    for (const p of proj) {
      if (p.k === "bazooka") { const a = Math.atan2(p.vy || 0, p.vx || 1); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a); ctx.fillStyle = "#475569"; ctx.fillRect(-6, -2, 10, 4); ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(8, 0); ctx.lineTo(4, 2); ctx.fill(); ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(-8, 0, 2 + Math.random() * 1.5, 0, 7); ctx.fill(); ctx.restore(); }
      else if (p.k === "grenade") { ctx.fillStyle = "#3f6212"; ctx.strokeStyle = "#1a2e05"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y - 2, 3.5, 0, 7); ctx.fill(); ctx.stroke(); }
      else if (p.k === "dynamite") { ctx.fillStyle = "#dc2626"; ctx.fillRect(p.x - 2.5, p.y - 10, 5, 10); ctx.fillStyle = Math.random() < 0.5 ? "#fde047" : "#fb923c"; ctx.beginPath(); ctx.arc(p.x + 1, p.y - 12, 1.8, 0, 7); ctx.fill(); }
      if (p.fuse != null) { ctx.font = "900 9px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#000"; ctx.strokeText(Math.ceil(p.fuse), p.x, p.y - 14); ctx.fillStyle = "#fff"; ctx.fillText(Math.ceil(p.fuse), p.x, p.y - 14); }
    }
    // вода
    ctx.fillStyle = "#1d4ed8"; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(-400, WH + 200);
    for (let x = -400; x <= WW + 400; x += 10) ctx.lineTo(x, WATER + Math.sin(x * 0.05 + t * 2) * 2.5);
    ctx.lineTo(WW + 400, WH + 200); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = "#1e3a8a"; ctx.fillRect(-400, WATER + 14, WW + 800, 400);
    // эффекты
    fx = fx.filter((e) => (e.t += dt) < (e.k === "num" ? 1.2 : 0.6));
    for (const e of fx) {
      if (e.k === "boom") { const k = e.t / 0.6; ctx.fillStyle = `rgba(255,${180 - k * 120},40,${1 - k})`; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.6 + k * 0.8), 0, 7); ctx.fill(); ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.8 + k * 1.2), 0, 7); ctx.stroke(); }
      else if (e.k === "num") { ctx.font = "900 12px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(e.s, e.x, e.y - e.t * 25); ctx.fillStyle = e.c; ctx.fillText(e.s, e.x, e.y - e.t * 25); }
      else if (e.k === "splash") { ctx.strokeStyle = `rgba(255,255,255,${1 - e.t / 0.6})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(e.x, e.y, 6 + e.t * 40, 2 + e.t * 8, 0, 0, 7); ctx.stroke(); }
      else if (e.k === "ray") { ctx.strokeStyle = `rgba(255,240,150,${1 - e.t / 0.6})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke(); }
    }
  }
  function hud() {
    const teams = [...new Set(worms.map((w) => w.t))], tot = (t) => worms.filter((w) => w.t === t && !w.dead).reduce((s, w) => s + w.hp, 0);
    const max = Math.max(1, ...teams.map((t) => worms.filter((w) => w.t === t).length * 100));
    $("teams").innerHTML = teams.map((t) => `<div class="tb"><i style="width:${Math.max(2, tot(t) / max * 110)}px;background:${tcol(t)}"></i>${tname(t).replace(/[<>&]/g, "")} ${tot(t)}</div>`).join("");
    $("timer").textContent = ph === "aim" || ph === "retreat" ? Math.ceil(Math.max(0, tl)) : "⏳";
    const n = Math.round(Math.abs(wind) * 5);
    $("wind").textContent = wind === 0 ? "💨 штиль" : `💨 ${wind < 0 ? "◀".repeat(Math.max(1, n)) : ""}${wind > 0 ? "▶".repeat(Math.max(1, n)) : ""}`;
  }
  let last = 0, acc = 0, snapT = 0, hudT = 0;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (phase === "play") {
      if (isAuth()) {
        acc += dt; while (acc >= 1 / 60) { stepAuth(1 / 60); acc -= 1 / 60; if (phase !== "play") break; }
        if (room && phase === "play") { snapT -= dt; if (snapT <= 0) { snapT = 1 / 15; room.sendFast("s", { W: packW(false), P: proj.map((p) => [p.k, Math.round(p.x), Math.round(p.y), p.fuse != null ? +p.fuse.toFixed(1) : null]), A: aim ? [+aim.a.toFixed(3), +aim.p.toFixed(2)] : null, ph, tl: +tl.toFixed(1), wp: wpn }); } }
      } else {
        acc = 0;
        if (isHost() && room && Date.now() - lastAuthMsg > 14000) { msg("Игрок не отвечает — пропускаем ход", 1500); lastAuthMsg = Date.now(); nextTurn(); }
      }
      hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.2; }
    }
    render(ts / 1000, dt);
    requestAnimationFrame(frame);
  }

  const PARTY = { title: "Червячки", icon: "🪱", max: 4, bots: 1, text: "Го в «Червячков» 🪱💥 Базуки, гранаты, динамит — заходи!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }, { id: "t2", name: "2 команды", teams: 2 }], onCancel: () => $("screen-menu").classList.remove("hidden") };
  $("m-bots").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.offline(PARTY)); };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("chervi", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#5fb4f0", bg: "#7cc8f5", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("chervi", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get worms() { return worms; }, get cfg() { return cfg; }, get ph() { return ph; }, get cur() { return cur; }, fire: (a, p, w) => { if (w) wpn = w; fire(a, p); }, get turnNo() { return turnNo; }, keys };
})();
