/* Перестрелка — арена сверху: бег, укрытия, кусты, 3 заряда с перезарядкой. До 6 игроков, боты, команды.
   Режим «Королевская битва»: одна жизнь, большая арена, сужающаяся зона, оружие с пола.
   Каждый сам двигает своего бойца и шлёт координаты; выстрелы, попадания, оружие и зона — у хозяина. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const R = 15, SPEED = 175, DMG = 25, AMMO = 3, RELOAD = 0.85;
  const DURATION = 150, RESPAWN = 3, SHIELD = 1.5;
  let AW = 780, AH = 1100;
  // оружие: mag — заряды, rel — перезарядка одного заряда, cool — между выстрелами, pel/spr — дробь, jit — разброс,
  // near/far — дистанция боя ботов, bc/bcr — темп ботов, bj — разброс ботов, len/wid/c — ствол
  const WEAP = {
    p: { n: "Пистолет", i: "🔫", mag: 3, rel: 0.85, cool: 0.22, dmg: 25, sp: 620, rng: 470, pel: 1, spr: 0, jit: 0, near: 170, far: 280, bc: 0.35, bcr: 0.35, bj: 0.22, len: 12, wid: 7, c: "#111" },
    s: { n: "Дробовик", i: "💥", mag: 2, rel: 1.0, cool: 0.45, dmg: 13, sp: 560, rng: 250, pel: 6, spr: 0.5, jit: 0.05, near: 70, far: 150, bc: 0.45, bcr: 0.3, bj: 0.2, len: 15, wid: 10, c: "#7c3f12", lc: "#f97316" },
    r: { n: "Винтовка", i: "🎯", mag: 2, rel: 1.5, cool: 0.95, dmg: 55, sp: 1150, rng: 950, pel: 1, spr: 0, jit: 0, near: 380, far: 650, bc: 0.95, bcr: 0.5, bj: 0.09, len: 26, wid: 5, c: "#3b0764", lc: "#a855f7" },
    a: { n: "Автомат", i: "⚡", mag: 10, rel: 0.22, cool: 0.1, dmg: 11, sp: 720, rng: 520, pel: 1, spr: 0, jit: 0.09, near: 150, far: 300, bc: 0.1, bcr: 0.08, bj: 0.26, len: 18, wid: 7, c: "#0f172a", lc: "#06b6d4" },
  };
  // зона: [ожидание, сужение, радиус, урон в секунду за пределами на этом этапе]
  const STAGES = [[15, 12, 760, 3], [12, 10, 480, 6], [10, 9, 270, 10], [9, 8, 120, 15], [7, 8, 0, 24]];

  function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR, mmY = 0;
  function resize() { mmY = 0; DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; canvas.width = W * DPR; canvas.height = H * DPR; }
  addEventListener("resize", resize); resize();

  let room = null, cfg = null, phase = "menu", ended = false, gt = 0, walls = [], bushes = [], spawns = [], P = [], B = [], packs = [], fx = [], target = 10;
  let BR = false, Z = null, Zd = { x: 0, y: 0, r: 0 }, loot = [], lootId = 0, rooms = [], specI = -1;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const team = (i) => cfg.players[i].team;
  const col = (i) => cfg.players[i].color;
  const ally = (a, b) => a === b || (cfg.teams > 0 && team(a) === team(b));
  const pname = (i) => (i === cfg.me ? "Ты" : cfg.players[i].name);
  const aliveN = () => P.reduce((n, p) => n + (p.alive ? 1 : 0), 0);

  // ---------- арена ----------
  function genArena(seed) {
    AW = 780; AH = 1100; rooms = [];
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
    buildGrid();
  }
  // большая арена королевской битвы: руины-комнаты, ящики, кусты (одинаково у всех по seed)
  function genBR(seed) {
    AW = 1400; AH = 1800; rooms = [];
    const r = rng(seed); walls = []; bushes = [];
    spawns = [[130, 130], [AW - 130, AH - 130], [AW - 130, 130], [130, AH - 130], [130, AH / 2], [AW - 130, AH / 2]];
    const free = (x, y, w, h, m) => x > 40 && y > 40 && x + w < AW - 40 && y + h < AH - 40 &&
      walls.every((q) => x > q[0] + q[2] + m || x + w < q[0] - m || y > q[1] + q[3] + m || y + h < q[1] - m) &&
      spawns.every((s) => s[0] < x - 70 || s[0] > x + w + 70 || s[1] < y - 70 || s[1] > y + h + 70);
    for (let t = 0; t < 40 && rooms.length < 7; t++) {
      const s = 150 + r() * 70, x0 = 120 + r() * (AW - 240 - s), y0 = 120 + r() * (AH - 240 - s), L = s * 0.33, Tk = 24;
      const pcs = [[x0, y0, L, Tk], [x0, y0, Tk, L], [x0 + s - L, y0, L, Tk], [x0 + s - Tk, y0, Tk, L],
        [x0, y0 + s - Tk, L, Tk], [x0, y0 + s - L, Tk, L], [x0 + s - L, y0 + s - Tk, L, Tk], [x0 + s - Tk, y0 + s - L, Tk, L]];
      if (pcs.every((q) => free(q[0], q[1], q[2], q[3], 60))) { pcs.forEach((q) => walls.push([q[0], q[1], q[2], q[3], 1])); rooms.push([x0 + s / 2, y0 + s / 2]); }
    }
    for (let t = 0; t < 400 && walls.length < 56 + 40; t++) {
      const big = r() < 0.5, a = big ? 50 + r() * 90 : 34 + r() * 26, b = big ? 30 + r() * 8 : 34 + r() * 26, [w, h] = r() < 0.5 ? [a, b] : [b, a];
      const x = 60 + r() * (AW - 120 - w), y = 60 + r() * (AH - 120 - h);
      if (free(x, y, w, h, 55)) walls.push([x, y, w, h]);
    }
    buildGrid();
    for (let t = 0; t < 300 && bushes.length < 20; t++) {
      const x = 80 + r() * (AW - 160), y = 80 + r() * (AH - 160), rad = 46 + r() * 14;
      if (!inWall(x, y, rad + 6) && bushes.every((b) => Math.hypot(b[0] - x, b[1] - y) > 170) && spawns.every((s) => Math.hypot(s[0] - x, s[1] - y) > 90)) bushes.push([x, y, rad]);
    }
  }
  // сетка стен: проверка столкновений смотрит только свою клетку
  const GC = 100; let grid = { gw: 1, c: [[]] };
  function buildGrid() {
    const gw = Math.ceil(AW / GC), gh = Math.ceil(AH / GC); grid = { gw, c: Array.from({ length: gw * gh }, () => []) };
    for (const w of walls) {
      const x0 = Math.max(0, Math.floor((w[0] - 21) / GC)), x1 = Math.min(gw - 1, Math.floor((w[0] + w[2] + 21) / GC));
      const y0 = Math.max(0, Math.floor((w[1] - 21) / GC)), y1 = Math.min(gh - 1, Math.floor((w[1] + w[3] + 21) / GC));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid.c[y * gw + x].push(w);
    }
  }
  const hitW = (w, x, y, rad) => x + rad > w[0] && x - rad < w[0] + w[2] && y + rad > w[1] && y - rad < w[1] + w[3];
  const inWall = (x, y, rad) => {
    if (x < rad || y < rad || x > AW - rad || y > AH - rad) return true;
    if (rad > 20) return walls.some((w) => hitW(w, x, y, rad));
    const c = grid.c[Math.floor(y / GC) * grid.gw + Math.floor(x / GC)];
    for (let k = 0; k < c.length; k++) if (hitW(c[k], x, y, rad)) return true;
    return false;
  };
  const segHits = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10); for (let k = 1; k <= n; k++) { const t = k / n; if (inWall(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1)) return true; } return false; };
  const inBush = (x, y) => bushes.some((b) => Math.hypot(b[0] - x, b[1] - y) < b[2] - 6);
  const seen = (by, i) => { const a = P[by], b = P[i]; if (!b.alive) return false; const d = Math.hypot(a.x - b.x, a.y - b.y); if (BR && d > (a.w === "r" ? 680 : 500)) return false; if (inBush(b.x, b.y) && d > 110) return false; return !segHits(a.x, a.y, b.x, b.y); };
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
    P = cfg.players.map((_, i) => { const s = spawns[i % spawns.length]; return { x: s[0], y: s[1], tx: s[0], ty: s[1], a: Math.atan2(AH / 2 - s[1], AW / 2 - s[0]), hp: 100, alive: true, resp: 0, sh: SHIELD, k: 0, d: 0, w: "p", ar: 0, pl: 0 }; });
  }
  function respawn(i) {
    const s = spawnPos(i), p = P[i];
    Object.assign(p, { x: s[0], y: s[1], tx: s[0], ty: s[1], hp: 100, alive: true, sh: SHIELD });
    send("rs", [i, s[0], s[1]]);
  }

  // ---------- выстрелы ----------
  let ammo = AMMO, reload = 0, cool = 0;
  const myW = () => WEAP[(P[cfg.me] && P[cfg.me].w) || "p"];
  function shoot(a) {
    const p = P[cfg.me], Wp = myW();
    if (!p.alive || ammo < 1 || cool > 0 || phase !== "play") return;
    ammo -= 1; cool = Wp.cool; if (reload <= 0) reload = Wp.rel;
    p.a = a;
    const x = p.x + Math.cos(a) * (R + 4), y = p.y + Math.sin(a) * (R + 4), sd = 1 + Math.floor(Math.random() * 1e6);
    fireW(cfg.me, x, y, a, p.w, sd);
    T.haptic("impact", p.w === "s" || p.w === "r" ? "medium" : "light");
    if (isHost()) send("shot", [cfg.me, Math.round(x), Math.round(y), +a.toFixed(3), p.w, sd]);
    else send("fire", [Math.round(x), Math.round(y), +a.toFixed(3), p.w, sd]);
  }
  function fireW(o, x, y, a, w, sd) {
    const Wp = WEAP[w] || WEAP.p, r = rng(sd || 1);
    for (let k = 0; k < Wp.pel; k++) {
      const aa = a + (Wp.pel > 1 ? Wp.spr * (k / (Wp.pel - 1) - 0.5) : 0) + (r() - 0.5) * Wp.jit * 2;
      B.push({ o, x, y, vx: Math.cos(aa) * Wp.sp, vy: Math.sin(aa) * Wp.sp, life: Wp.rng / Wp.sp, d: Wp.dmg, w: w || "p" });
    }
    fx.push({ k: "flash", x, y, t: 0 });
  }
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
          if (isHost() && p.sh <= 0) damage(i, b.o, b.d);
          break;
        }
      }
      b.life -= dt;
    }
    B = B.filter((b) => b.life > 0);
  }
  function damage(i, by, dmg) {
    const p = P[i]; if (!p.alive || ended) return;
    if (dmg == null) dmg = DMG;
    if (BR && by >= 0) dmg = Math.round(dmg * 0.75);   // в королевской битве бои длиннее: есть время отступить и подлечиться
    if (by >= 0 && p.ar > 0) { const a = Math.min(p.ar, Math.round(dmg * 0.5)); p.ar -= a; dmg -= a; }
    p.hp -= dmg;
    if (p.hp > 0) { send("hp", [i, p.hp, p.ar]); onHp(i); return; }
    p.hp = 0; p.alive = false; p.d++;
    if (BR) {
      p.pl = aliveN() + 1; if (by >= 0) P[by].k++;
      const d = [i, by, by >= 0 ? P[by].k : 0, p.pl]; send("ko", d); onKo(d);
      checkEnd(); return;
    }
    p.resp = RESPAWN; P[by].k++;
    const d = [i, by, P[by].k]; send("ko", d); onKo(d);
    checkEnd();
  }
  function onHp(i) { if (i === cfg.me) T.haptic("impact", "medium"); }
  function leader() { let li = -1; P.forEach((p, i) => { if (p.alive && (li < 0 || p.k > P[li].k)) li = i; }); return li; }
  function onKo(d) {
    const [i, by] = d; P[i].alive = false; P[i].hp = 0; if (by >= 0) P[by].k = d[2]; if (d[3]) P[i].pl = d[3];
    fx.push({ k: "boom", x: P[i].x, y: P[i].y, t: 0, c: col(i) });
    feed(by >= 0 ? `${pname(by)} 🔫 ${pname(i)}` : `☠ ${pname(i)} — зона`);
    if (BR) {
      if (i === cfg.me) { msg(`💀 Ты выбыл · #${P[i].pl} из ${P.length}`, 2200); T.haptic("notify", "error"); specI = by >= 0 && P[by].alive ? by : leader(); }
      else {
        if (by === cfg.me) { msg(`🎯 Минус один! Осталось ${aliveN()}`, 1100); T.haptic("notify", "success"); }
        if (i === specI) specI = by >= 0 && P[by].alive ? by : leader();
      }
      return;
    }
    if (i === cfg.me) { msg("💀 Вернёшься через 3 с", 1600); T.haptic("notify", "error"); }
    else if (by === cfg.me) { msg("🎯 Фраг!", 900); T.haptic("notify", "success"); }
  }

  // ---------- аптечки (хозяин, обычный режим) ----------
  let packT = 6;
  const PACKS = () => [[AW / 2, AH / 2 - 110], [AW / 2, AH / 2 + 110], [200, AH / 2], [AW - 200, AH / 2]];
  function hostPacks(dt) {
    packT -= dt;
    if (packT <= 0) { packT = 11; const free = PACKS().filter((q) => !packs.some((p) => p[0] === q[0] && p[1] === q[1])); if (free.length) { packs.push(free[Math.floor(Math.random() * free.length)].slice()); send("packs", packs); } }
    for (let k = packs.length - 1; k >= 0; k--) {
      const pk = packs[k];
      const i = P.findIndex((p) => p.alive && p.hp < 100 && Math.hypot(p.x - pk[0], p.y - pk[1]) < R + 14);
      if (i >= 0) { P[i].hp = Math.min(100, P[i].hp + 50); packs.splice(k, 1); send("packs", packs); send("hp", [i, P[i].hp, P[i].ar]); if (i === cfg.me) T.haptic("notify", "success"); }
    }
  }

  // ---------- королевская битва: добыча и зона (хозяин) ----------
  // loot: [id, тип, x, y, кому временно нельзя поднять], тип: s/r/a — оружие, h — аптечка, b — броня
  function genLoot() {
    loot = []; lootId = 0;
    const put = (t, cx, cy, d0, d1) => {
      for (let k = 0; k < 80; k++) {
        let x, y;
        if (cx != null) { const a = Math.random() * 6.283, d = d0 + Math.random() * (d1 - d0); x = cx + Math.cos(a) * d; y = cy + Math.sin(a) * d; }
        else { x = 80 + Math.random() * (AW - 160); y = 80 + Math.random() * (AH - 160); }
        if (inWall(x, y, 26) || loot.some((l) => Math.hypot(l[2] - x, l[3] - y) < 80) || spawns.some((s) => Math.hypot(s[0] - x, s[1] - y) < 120)) continue;
        loot.push([++lootId, t, Math.round(x), Math.round(y)]); return;
      }
    };
    const guns = ["s", "r", "a"];
    spawns.forEach((s, k) => put(guns[(k + Math.floor(Math.random() * 3)) % 3], s[0], s[1], 150, 260));   // у каждого старта рядом ствол
    rooms.forEach((c, k) => put(k % 2 ? "b" : guns[k % 3], c[0], c[1], 0, 20));
    ["s", "r", "a", "a", "h", "h", "h", "h", "h", "h", "h", "b", "b", "b"].forEach((t) => put(t));
  }
  function setW(i, t) {
    P[i].w = t; send("wp", [i, t]);
    if (i === cfg.me) myWeapon(t);
  }
  function myWeapon(t) { const Wp = WEAP[t] || WEAP.p; ammo = Wp.mag; reload = 0; cool = 0.15; msg(`${Wp.i} ${Wp.n}`, 900); T.haptic("notify", "success"); }
  function hostLoot() {
    let ch = false;
    for (let k = loot.length - 1; k >= 0; k--) {
      const l = loot[k];
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; if (!p.alive) continue;
        const d = Math.hypot(p.x - l[2], p.y - l[3]);
        if (l[4] === i) { if (d > R + 40) { l.length = 4; ch = true; } continue; }
        if (d > R + 16) continue;
        const t = l[1];
        if (t === "h") { if (p.hp >= 100) continue; p.hp = Math.min(100, p.hp + 50); send("hp", [i, p.hp, p.ar]); }
        else if (t === "b") { if (p.ar >= 50) continue; p.ar = 50; send("hp", [i, p.hp, p.ar]); }
        else {
          if (p.w === t || (cfg.players[i].bot && p.w !== "p")) continue;
          const old = p.w; setW(i, t);
          if (old !== "p") { loot.splice(k, 1); loot.push([++lootId, old, l[2], l[3], i]); ch = true; break; }
        }
        if (i === cfg.me && (t === "h" || t === "b")) { T.haptic("notify", "success"); msg(t === "h" ? "❤️ +50" : "🛡 Броня", 800); }
        loot.splice(k, 1); ch = true; break;
      }
    }
    if (ch) send("loot", loot);
  }
  function zoneInit() {
    Z = { x: AW / 2, y: AH / 2, r: 1180, ox: 0, oy: 0, or: 0, nx: AW / 2, ny: AH / 2, nr: 1180, st: 0, ph: 0, t: STAGES[0][0], tick: 1 };
    Zd = { x: Z.x, y: Z.y, r: Z.r };
    if (isHost()) zoneNext();
  }
  function zoneNext() {
    const nr = STAGES[Z.st][2], room0 = Math.max(0, Z.r - nr);
    let nx = Z.x, ny = Z.y;
    const a = Math.random() * 6.283, d = Math.random() * room0 * 0.75;
    nx = Math.max(Math.min(AW / 2, 90 + nr * 0.6), Math.min(Math.max(AW / 2, AW - 90 - nr * 0.6), Z.x + Math.cos(a) * d));
    ny = Math.max(Math.min(AH / 2, 90 + nr * 0.6), Math.min(Math.max(AH / 2, AH - 90 - nr * 0.6), Z.y + Math.sin(a) * d));
    const dd = Math.hypot(nx - Z.x, ny - Z.y);
    if (dd > room0) { nx = Z.x + (nx - Z.x) * room0 / dd; ny = Z.y + (ny - Z.y) * room0 / dd; }
    Z.nx = nx; Z.ny = ny; Z.nr = nr;
  }
  function hostZone(dt) {
    Z.t -= dt;
    if (Z.ph === 1) { const k = 1 - Math.max(0, Z.t) / STAGES[Z.st][1]; Z.x = Z.ox + (Z.nx - Z.ox) * k; Z.y = Z.oy + (Z.ny - Z.oy) * k; Z.r = Z.or + (Z.nr - Z.or) * k; }
    if (Z.t <= 0 && Z.ph < 2) {
      if (Z.ph === 0) { Z.ph = 1; Z.t = STAGES[Z.st][1]; Z.ox = Z.x; Z.oy = Z.y; Z.or = Z.r; }
      else { Z.x = Z.nx; Z.y = Z.ny; Z.r = Z.nr; Z.st++; if (Z.st < STAGES.length) { Z.ph = 0; Z.t = STAGES[Z.st][0]; zoneNext(); } else { Z.ph = 2; Z.t = 0; Z.st = STAGES.length - 1; } }
      zoneEvt();
    }
    Z.tick -= dt;
    if (Z.tick <= 0) {
      Z.tick = 1;
      const dps = Z.ph === 2 ? 30 : STAGES[Z.st][3];
      for (let i = 0; i < P.length && !ended; i++) { const p = P[i]; if (p.alive && Math.hypot(p.x - Z.x, p.y - Z.y) > Z.r) { damage(i, -1, dps); if (i === cfg.me) fx.push({ k: "zap", t: 0, x: 0, y: 0 }); } }
    }
  }
  function zoneEvt() {
    if (Z.ph === 1) { msg("⚠ Зона сужается!", 1500); T.haptic("notify", "warning"); }
    else if (Z.ph === 0 && Z.st > 0) feed(`🔵 Следующее сужение через ${STAGES[Z.st][0]} с`);
    else if (Z.ph === 2) msg("🔥 Зона закрылась!", 1500);
  }

  // ---------- боты (хозяин) ----------
  const BOT = {};
  function botGoalBR(i, p, s, best) {
    const shrinkSoon = Z.ph === 1 || (Z.ph === 0 && Z.t < 8) || Z.ph === 2;
    const sz = shrinkSoon ? [Z.nx, Z.ny, Z.nr] : [Z.x, Z.y, Z.r];
    const dz = Math.hypot(p.x - Z.x, p.y - Z.y), dn = Math.hypot(p.x - sz[0], p.y - sz[1]);
    s.out = dz > Z.r - 25 || dn > sz[2] - 35;
    const safe = (x, y) => Math.hypot(x - sz[0], y - sz[1]) < sz[2] - 20 && Math.hypot(x - Z.x, y - Z.y) < Z.r - 10;
    let it = null, id = 1e9;
    for (const l of loot) {
      if (l[4] === i) continue;
      const t = l[1], d = Math.hypot(l[2] - p.x, l[3] - p.y);
      const want = t === "h" ? (p.hp <= 60 ? 650 : p.hp < 100 ? 220 : 0) : t === "b" ? (p.ar < 25 ? 380 : 0) : (p.w === "p" ? 750 : 0);
      if (d < want && d < id && (safe(l[2], l[3]) || d < 120)) { id = d; it = l; }
    }
    if (s.out && !(it && id < 150)) { s.item = 0; const a = Math.random() * 6.283, rr = Math.random() * Math.max(0, sz[2]) * 0.4; s.goal = [sz[0] + Math.cos(a) * rr, sz[1] + Math.sin(a) * rr]; return; }
    if (it && (best < 0 || it[1] === "h" || id < 160 || (p.w === "p" && it[1] !== "b" && id < 320))) { s.goal = [it[2], it[3]]; s.item = it[0]; return; }
    if (best >= 0) { s.goal = null; return; }
    if (!s.goal || Math.hypot(s.goal[0] - p.x, s.goal[1] - p.y) < 30 || (s.item && !loot.some((l) => l[0] === s.item))) {
      s.item = 0; if (s.goal) s.idle = 0.5 + Math.random() * 1.8;
      let near = -1, nd = 1e9; P.forEach((q, j) => { if (j === i || !q.alive) return; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < nd) { nd = d; near = j; } });
      const ga = Math.random() * 6.283, gd = 150 + Math.random() * 200, gx = p.x + Math.cos(ga) * gd, gy = p.y + Math.sin(ga) * gd;
      if (near >= 0 && Math.random() < (Z.st >= 2 ? 0.4 : 0.08) && safe(P[near].x, P[near].y)) s.goal = [P[near].x + (Math.random() - 0.5) * 200, P[near].y + (Math.random() - 0.5) * 200];
      else if (gx > 60 && gy > 60 && gx < AW - 60 && gy < AH - 60 && safe(gx, gy)) s.goal = [gx, gy];   // бродим рядом, без марш-бросков
      else { const a = Math.random() * 6.283, rr = Math.random() * Math.max(0, sz[2]) * 0.7; s.goal = [Math.max(60, Math.min(AW - 60, sz[0] + Math.cos(a) * rr)), Math.max(60, Math.min(AH - 60, sz[1] + Math.sin(a) * rr))]; }
    }
  }
  function bots(dt) {
    cfg.players.forEach((pl, i) => {
      if (!pl.bot) return;
      const p = P[i]; if (!p.alive) return;
      const s = BOT[i] || (BOT[i] = { str: 1, strT: 0, goal: null, ammo: AMMO, rel: 0, cool: 0, think: 0, tgt: -1, react: 0, w: "p", detT: 0, det: null, out: false, item: 0, idle: 0 });
      const Wp = WEAP[p.w] || WEAP.p;
      if (s.w !== p.w) { s.w = p.w; s.ammo = Wp.mag; s.rel = 0; }
      s.cool -= dt; s.rel -= dt; s.strT -= dt; s.think -= dt; s.detT -= dt;
      if (s.ammo < Wp.mag && s.rel <= 0) { s.ammo++; s.rel = Wp.rel; }
      if (s.strT <= 0) { s.str = -s.str; s.strT = 0.8 + Math.random() * 1.4; }
      if (s.think <= 0) {
        s.think = 0.25;
        let best = -1, bd = 1e9;
        P.forEach((q, j) => { if (ally(i, j) || !q.alive || !seen(i, j)) return; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = j; } });
        if (best !== s.tgt) { s.tgt = best; s.react = BR ? 0.4 + Math.random() * 0.5 : 0.25 + Math.random() * 0.35; }
        if (BR) botGoalBR(i, p, s, best);
        else if (p.hp <= 50 && packs.length) { let pk = null, pd = 1e9; packs.forEach((q) => { const d = Math.hypot(q[0] - p.x, q[1] - p.y); if (d < pd) { pd = d; pk = q; } }); s.goal = pk; }
        else if (best < 0 && (!s.goal || Math.hypot(s.goal[0] - p.x, s.goal[1] - p.y) < 30)) {
          let near = -1, nd = 1e9; P.forEach((q, j) => { if (ally(i, j) || !q.alive) return; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < nd) { nd = d; near = j; } });
          s.goal = near >= 0 && Math.random() < 0.7 ? [P[near].x + (Math.random() - 0.5) * 200, P[near].y + (Math.random() - 0.5) * 200] : [80 + Math.random() * (AW - 160), 80 + Math.random() * (AH - 160)];
        } else if (best >= 0) s.goal = null;
      }
      s.react -= dt;
      let dir = null;
      const fight = s.tgt >= 0 && P[s.tgt].alive;
      if (fight) {
        const q = P[s.tgt], d = Math.hypot(q.x - p.x, q.y - p.y), a = Math.atan2(q.y - p.y, q.x - p.x);
        p.a = a;
        dir = d > Wp.far ? a : d < Wp.near ? a + Math.PI : a + s.str * Math.PI / 2;
        if (BR && p.hp < 40 && !s.out && !(s.goal && s.item)) dir = a + Math.PI + s.str * 0.6;   // мало здоровья — отходим
        if (BR && (s.out || (s.goal && s.item))) dir = s.goal ? Math.atan2(s.goal[1] - p.y, s.goal[0] - p.x) : dir;   // зона и аптечка важнее позиции
        if (s.react <= 0 && s.cool <= 0 && s.ammo >= 1 && d < Wp.rng - 20 && !segHits(p.x, p.y, q.x, q.y)) {
          const lead = d / Wp.sp, ex = q.x + (q.x - (q.px || q.x)) / Math.max(dt, 0.016) * lead * 0.5, ey = q.y + (q.y - (q.py || q.y)) / Math.max(dt, 0.016) * lead * 0.5;
          const aa = Math.atan2(ey - p.y, ex - p.x) + (Math.random() - 0.5) * Wp.bj * (BR ? 1.5 : 1), sd = 1 + Math.floor(Math.random() * 1e6);
          s.ammo--; s.cool = (Wp.bc + Math.random() * Wp.bcr) * (BR ? 1.35 : 1); if (s.rel <= 0) s.rel = Wp.rel;
          const x = p.x + Math.cos(aa) * (R + 4), y = p.y + Math.sin(aa) * (R + 4);
          fireW(i, x, y, aa, p.w, sd); send("shot", [i, Math.round(x), Math.round(y), +aa.toFixed(3), p.w, sd]);
        }
      } else if (BR && s.idle > 0 && !s.out) { s.idle -= dt; }
      else if (s.goal) { dir = Math.atan2(s.goal[1] - p.y, s.goal[0] - p.x); p.a = dir; }
      if (BR && s.detT > 0 && s.det && !(fight && !s.out)) dir = Math.atan2(s.det[1] - p.y, s.det[0] - p.x);
      if (dir != null) {
        const ox = p.x, oy = p.y;
        moveP(p, Math.cos(dir) * SPEED * 0.92 * dt, Math.sin(dir) * SPEED * 0.92 * dt);
        if (Math.hypot(p.x - ox, p.y - oy) < SPEED * dt * 0.3) {
          const d2 = dir + (s.str * Math.PI / 2); moveP(p, Math.cos(d2) * SPEED * dt, Math.sin(d2) * SPEED * dt);
          if (BR) { if (s.detT <= 0) { s.det = [p.x + Math.cos(d2) * 120, p.y + Math.sin(d2) * 120]; s.detT = 0.7; } }
          else if (s.goal) s.goal = null;
          s.str = -s.str;
        }
      }
    });
  }

  // ---------- конец ----------
  function checkEnd() {
    if (ended || !isHost()) return;
    if (BR) { if (aliveN() <= 1 || gt >= 300) finish(); return; }
    const sc = scores();
    if (Math.max(...Object.values(sc)) >= target || gt >= DURATION) finish();
  }
  function scores() { const s = {}; P.forEach((p, i) => { const k = cfg.teams ? "t" + team(i) : "p" + i; s[k] = (s[k] || 0) + p.k; }); return s; }
  function finish() {
    if (ended) return;
    const d = { K: P.map((p) => p.k), D: P.map((p) => p.d) };
    if (BR) { P.map((p, i) => i).filter((i) => P[i].alive).sort((a, b) => P[b].hp - P[a].hp).forEach((i, k) => { P[i].pl = k + 1; }); d.PL = P.map((p) => p.pl); }
    send("end", d); onEnd(d);
  }
  function onEnd(d) {
    phase = "end"; ended = true; mini.style.display = "none";
    d.K.forEach((k, i) => { P[i].k = k; P[i].d = d.D[i]; if (d.PL) P[i].pl = d.PL[i]; });
    $("spec").classList.add("hidden");
    const esc = (s) => s.replace(/[<>&]/g, "");
    let win;
    if (BR) {
      const pl = P[cfg.me].pl || P.length; win = pl === 1;
      St.gameEnd({ win, players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode, kills: P[cfg.me].k, deaths: P[cfg.me].d, place: pl });
      $("end-emoji").textContent = win ? "👑" : pl <= 3 ? "🎖️" : "💀";
      $("end-title").textContent = win ? "Победа! Ты последний выживший" : `Место #${pl} из ${P.length}`;
      $("end-sub").innerHTML = cfg.players.map((p, i) => ({ p, i })).sort((a, b) => (P[a.i].pl || 99) - (P[b.i].pl || 99))
        .map((r) => `<div style="display:flex;justify-content:space-between;gap:8px"><span><b>#${P[r.i].pl}</b> <b style="color:${r.p.color}">●</b> ${esc(r.p.name)}${r.i === cfg.me ? " (ты)" : ""}</span><b>${P[r.i].pl === 1 ? "👑 " : ""}🎯 ${P[r.i].k}</b></div>`).join("");
    } else {
      const sc = scores(), mine = cfg.teams ? "t" + team(cfg.me) : "p" + cfg.me, top = Math.max(...Object.values(sc));
      win = sc[mine] === top;
      St.gameEnd({ win, players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode, kills: P[cfg.me].k, deaths: P[cfg.me].d });
      $("end-emoji").textContent = win ? "🏆" : "💀";
      $("end-title").textContent = win ? (cfg.teams ? "Ваша команда победила!" : "Ты лучший стрелок!") : "Не в этот раз";
      $("end-sub").innerHTML = cfg.players.map((p, i) => ({ p, i })).sort((a, b) => P[b.i].k - P[a.i].k || P[a.i].d - P[b.i].d)
        .map((r) => `<div style="display:flex;justify-content:space-between;gap:8px"><span><b style="color:${r.p.color}">●</b> ${esc(r.p.name)}${r.i === cfg.me ? " (ты)" : ""}</span><b>🎯 ${P[r.i].k} · 💀 ${P[r.i].d}</b></div>`).join("");
    }
    T.haptic("notify", win ? "success" : "error");
    const b = [];
    if (isHost()) b.push(["🔁 Ещё раунд", "primary", () => { const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) }); }]);
    else b.push(["Ждём, пока хозяин запустит раунд…", "", () => {}]);
    b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
    const box = $("end-buttons"); box.innerHTML = "";
    b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
    setTimeout(() => $("screen-end").classList.remove("hidden"), 700);
  }

  // ---------- сеть ----------
  let snapN = 0;
  function snapshot() {
    if (!BR) return { P: P.map((p) => [Math.round(p.x), Math.round(p.y), +p.a.toFixed(2), p.hp, p.alive ? 1 : 0]), t: +gt.toFixed(1) };
    const s = { P: P.map((p) => [Math.round(p.x), Math.round(p.y), +p.a.toFixed(2), p.hp, p.alive ? 1 : 0, p.ar, p.w]), t: +gt.toFixed(1),
      z: [Math.round(Z.x), Math.round(Z.y), Math.round(Z.r), Math.round(Z.nx), Math.round(Z.ny), Z.nr, Z.st, Z.ph, +Z.t.toFixed(1)] };
    if (++snapN % 6 === 0) s.L = loot;
    return s;
  }
  function applySnap(s) {
    s.P.forEach((v, i) => {
      const p = P[i]; if (!p) return; p.hp = v[3]; const was = p.alive; p.alive = !!v[4];
      if (v.length > 5) { p.ar = v[5]; if (v[6] && v[6] !== p.w) { p.w = v[6]; if (i === cfg.me) myWeapon(v[6]); } }
      if (i === cfg.me) { if (!was && p.alive) { p.x = v[0]; p.y = v[1]; } return; }
      p.tx = v[0]; p.ty = v[1]; p.a = v[2];
    });
    gt = s.t;
    if (s.z && Z) {
      const z = s.z, ch = z[6] !== Z.st || z[7] !== Z.ph;
      Object.assign(Z, { x: z[0], y: z[1], r: z[2], nx: z[3], ny: z[4], nr: z[5], st: z[6], ph: z[7], t: z[8] });
      if (ch) zoneEvt();
    }
    if (s.L) loot = s.L;
  }

  function begin(c) {
    cfg = c.cfg; room = c.room; ended = false; gt = 0; phase = "play"; fx = []; B = []; packs = []; packT = 6; ammo = AMMO; reload = 0; cool = 0;
    BR = cfg.mode === "br"; specI = -1; snapN = 0; loot = [];
    for (const k in BOT) delete BOT[k];
    target = cfg.teams ? 15 : 10;
    if (BR) genBR(cfg.seed); else genArena(cfg.seed);
    startPlayers(); mm = null; mmY = 0;
    if (BR) { zoneInit(); if (isHost()) { genLoot(); send("loot", loot); } }
    camX = P[cfg.me].x; camY = P[cfg.me].y; mini.style.display = BR ? "block" : "none";
    ["screen-menu", "screen-end", "spec"].forEach((s) => $(s).classList.add("hidden"));
    ["top", "ammo", "hint"].forEach((s) => $(s).classList.remove("hidden"));
    $("hint").textContent = BR ? "Одна жизнь! Оружие, аптечки и броня — пробеги по ним. Держись внутри зоны" : "Левый палец — бег, правый — прицел и огонь. Короткий тап справа — выстрел в ближайшего";
    setTimeout(() => $("hint").classList.add("hidden"), 7000);
    if (room) {
      ["snap", "me", "fire", "shot", "ko", "hp", "rs", "packs", "loot", "wp", "end", "start", "roster", "host-left", "full", "left"].forEach((t) => room.off(t));
      room.on("snap", (s) => { if (!isHost()) applySnap(s); });
      room.on("me", (d, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i >= 0 && P[i].alive) { P[i].tx = d[0]; P[i].ty = d[1]; P[i].a = d[2]; } });
      room.on("fire", (d, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i < 0 || !P[i].alive) return; const w = P[i].w || "p"; fireW(i, d[0], d[1], d[2], w, d[4]); send("shot", [i, d[0], d[1], d[2], w, d[4]]); });
      room.on("shot", (d) => { if (isHost() || d[0] === cfg.me) return; fireW(d[0], d[1], d[2], d[3], d[4] || "p", d[5]); P[d[0]].a = d[3]; });
      room.on("ko", (d) => { if (!isHost()) { P[d[0]].d++; onKo(d); } });
      room.on("hp", (d) => { if (!isHost()) { P[d[0]].hp = d[1]; if (d[2] != null) P[d[0]].ar = d[2]; onHp(d[0]); } });
      room.on("rs", (d) => { if (!isHost()) { const p = P[d[0]]; Object.assign(p, { x: d[1], y: d[2], tx: d[1], ty: d[2], alive: true, hp: 100, sh: SHIELD }); } });
      room.on("packs", (d) => { if (!isHost()) packs = d; });
      room.on("loot", (d) => { if (!isHost()) loot = d; });
      room.on("wp", (d) => { if (isHost() || !P[d[0]]) return; if (P[d[0]].w !== d[1]) { P[d[0]].w = d[1]; if (d[0] === cfg.me) myWeapon(d[1]); } });
      room.on("end", (d) => { if (!isHost()) onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
      room.on("host-left", () => { if (phase === "play") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; feed(`${p.name} вышел — играет бот`); } });
    }
    if (BR) { msg("👑 Выживет только один!", 1800); feed(`🔵 Зона начнёт сужаться через ${STAGES[0][0]} с`); }
    else msg(cfg.teams ? `Ты за ${Party.TEAMNAMES[team(cfg.me)]}` : `До ${target} фрагов!`, 1600);
    St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode });
  }
  function toMenu() { phase = "menu"; mini.style.display = "none"; ["top", "ammo", "hint", "screen-end", "spec"].forEach((s) => $(s).classList.add("hidden")); $("screen-menu").classList.remove("hidden"); }
  let msgT = 0, feedT = 0;
  function msg(t, ms) { const el = $("msg"); el.textContent = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }
  function feed(t) { const el = $("feed"); el.textContent = t; clearTimeout(feedT); feedT = setTimeout(() => { el.textContent = ""; }, 2500); }

  // ---------- ввод: левая половина — бег, правая — прицел/огонь ----------
  const sticks = {}; let moveS = null, aimS = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (BR && phase === "play" && P[cfg.me] && !P[cfg.me].alive) { nextSpec(); return; }   // зритель: тап — следующий игрок
    const s = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, t: performance.now(), far: false };
    if (e.clientX < W / 2 && !moveS) { moveS = s; sticks[e.pointerId] = "m"; }
    else if (!aimS) { aimS = s; sticks[e.pointerId] = "a"; }
  });
  function nextSpec() { for (let k = 1; k <= P.length; k++) { const j = ((specI < 0 ? 0 : specI) + k) % P.length; if (P[j].alive) { specI = j; return; } } }
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
  let camX = AW / 2, camY = AH / 2, mm = null;
  const ZOOM = () => Math.min(1.2, Math.max(0.62, W / 430)) * (BR ? 0.82 : 1);
  const LOOTC = { h: "#ef4444", b: "#3b82f6" };
  function drawLoot(l, t) {
    const x = l[2], y = l[3] + Math.sin(t * 4 + l[0]) * 2, ty = l[1];
    if (ty === "h") { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x - 13, y - 13, 26, 26, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#ef4444"; ctx.fillRect(x - 3.5, y - 9, 7, 18); ctx.fillRect(x - 9, y - 3.5, 18, 7); return; }
    if (ty === "b") {
      ctx.fillStyle = "#3b82f6"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x, y - 14); ctx.lineTo(x + 12, y - 9); ctx.lineTo(x + 10, y + 5); ctx.lineTo(x, y + 14); ctx.lineTo(x - 10, y + 5); ctx.lineTo(x - 12, y - 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#bfdbfe"; ctx.fillRect(x - 2, y - 8, 4, 14); return;
    }
    const Wp = WEAP[ty];
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.arc(x + 2, y + 4, 19, 0, 7); ctx.fill();
    ctx.fillStyle = Wp.lc; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#111"; ctx.lineCap = "round"; ctx.lineWidth = ty === "s" ? 7 : ty === "r" ? 4 : 6;
    const L = ty === "r" ? 15 : ty === "s" ? 10 : 12;
    ctx.beginPath(); ctx.moveTo(x - L, y + 3); ctx.lineTo(x + L, y - 3); ctx.stroke();
    if (ty === "a") { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2, y + 8); ctx.stroke(); }
    if (ty === "r") { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x - 2, y - 7); ctx.stroke(); }
    ctx.lineCap = "butt";
  }
  function buildMini() {
    const mw = 92, mh = Math.round(92 * AH / AW), c = document.createElement("canvas"); c.width = mw * DPR; c.height = mh * DPR;
    const g = c.getContext("2d"), s = mw / AW; g.scale(DPR * s, DPR * s);
    g.fillStyle = "#c9b98f"; g.fillRect(0, 0, AW, AH);
    for (const b of bushes) { g.fillStyle = "#2f8f46"; g.beginPath(); g.arc(b[0], b[1], b[2], 0, 7); g.fill(); }
    for (const w of walls) { g.fillStyle = w[4] ? "#57534e" : "#6b4423"; g.fillRect(w[0], w[1], w[2], w[3]); }
    mm = { c, dpr: DPR, w: mw, h: mh, s };
  }
  // мини-карта — отдельный маленький canvas, перерисовывается 10 раз в секунду, а не каждый кадр
  const mini = document.createElement("canvas"), mc = mini.getContext("2d");
  mini.style.cssText = "position:fixed;left:10px;top:60px;z-index:3;pointer-events:none;border:3px solid #000;border-radius:4px;display:none";
  document.body.appendChild(mini);
  function drawMini(fo) {
    if (!mm || mm.dpr !== DPR) { buildMini(); mini.width = mm.w * DPR; mini.height = mm.h * DPR; mini.style.width = mm.w + "px"; mini.style.height = mm.h + "px"; }
    if (!mmY) { mmY = Math.round($("top").getBoundingClientRect().bottom + 6); mini.style.top = mmY + "px"; }
    const s = mm.s, g = mc;
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(mm.c, 0, 0);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = "rgba(37,99,235,.45)"; g.beginPath(); g.rect(0, 0, mm.w, mm.h); g.arc(Zd.x * s, Zd.y * s, Math.max(0, Zd.r * s), 0, 7); g.fill("evenodd");
    g.strokeStyle = "#93c5fd"; g.lineWidth = 1.5; g.beginPath(); g.arc(Zd.x * s, Zd.y * s, Math.max(0, Zd.r * s), 0, 7); g.stroke();
    if (Z.ph < 2 && Z.nr < Zd.r - 2) { g.strokeStyle = "#fff"; g.lineWidth = 1.2; g.beginPath(); g.arc(Z.nx * s, Z.ny * s, Math.max(0.5, Z.nr * s), 0, 7); g.stroke(); }
    const me = P[cfg.me];
    if (fo !== me) { g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 1.5; g.beginPath(); g.arc(fo.x * s, fo.y * s, 3, 0, 7); g.fill(); g.stroke(); }
    if (me.alive) { g.fillStyle = col(cfg.me); g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(me.x * s, me.y * s, 3.5, 0, 7); g.fill(); g.stroke(); }
  }

  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!cfg || !P.length) { ctx.fillStyle = "#1b2a1f"; ctx.fillRect(0, 0, W, H); return; }
    const me = P[cfg.me], z = ZOOM();
    let fi = cfg.me; if (BR && !me.alive && specI >= 0 && P[specI]) fi = specI;
    const fo = P[fi];
    camX += (fo.x - camX) * Math.min(1, dt * 8); camY += (fo.y - camY) * Math.min(1, dt * 8);
    const cx = W / 2 - camX * z, cy = H * 0.52 - camY * z;
    const vx0 = -cx / z, vy0 = -cy / z, vx1 = vx0 + W / z, vy1 = vy0 + H / z;
    if (vx0 < 0 || vy0 < 0 || vx1 > AW || vy1 > AH) { ctx.fillStyle = "#1b2a1f"; ctx.fillRect(0, 0, W, H); }   // фон только если виден край арены
    ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * cx, DPR * cy);
    // пол (только видимая часть)
    ctx.fillStyle = "#c9b98f"; ctx.fillRect(Math.max(0, vx0), Math.max(0, vy0), Math.min(AW, vx1) - Math.max(0, vx0), Math.min(AH, vy1) - Math.max(0, vy0));
    ctx.fillStyle = "#bfae82";
    const gx0 = Math.max(0, Math.floor(vx0 / 60) * 60), gy0 = Math.max(0, Math.floor(vy0 / 60) * 60);
    for (let x = gx0; x < AW && x < vx1; x += 60) for (let y = gy0; y < AH && y < vy1; y += 60) if (((x + y) / 60) % 2 === 0) ctx.fillRect(x, y, 60, 60);
    // аптечки и добыча
    for (const pk of packs) { const b = Math.sin(t * 4) * 2; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(pk[0] - 13, pk[1] - 13 + b, 26, 26, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#ef4444"; ctx.fillRect(pk[0] - 3.5, pk[1] - 9 + b, 7, 18); ctx.fillRect(pk[0] - 9, pk[1] - 3.5 + b, 18, 7); }
    for (const l of loot) if (l[2] > vx0 - 30 && l[2] < vx1 + 30 && l[3] > vy0 - 30 && l[3] < vy1 + 30) drawLoot(l, t);
    // стены-ящики и руины
    for (const w of walls) {
      if (w[0] > vx1 || w[0] + w[2] + 6 < vx0 || w[1] > vy1 || w[1] + w[3] + 8 < vy0) continue;
      ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(w[0] + 5, w[1] + 7, w[2], w[3]);
      if (w[4]) { ctx.fillStyle = "#78716c"; ctx.fillRect(w[0], w[1], w[2], w[3]); ctx.strokeStyle = "#44403c"; ctx.lineWidth = 3; ctx.strokeRect(w[0] + 1.5, w[1] + 1.5, w[2] - 3, w[3] - 3); continue; }
      ctx.fillStyle = "#8b5a2b"; ctx.fillRect(w[0], w[1], w[2], w[3]);
      ctx.strokeStyle = "#5b3a1a"; ctx.lineWidth = 3; ctx.strokeRect(w[0] + 1.5, w[1] + 1.5, w[2] - 3, w[3] - 3);
      ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w[0] + 4, w[1] + 4); ctx.lineTo(w[0] + w[2] - 4, w[1] + w[3] - 4); ctx.stroke();
    }
    // бойцы
    P.forEach((p, i) => {
      if (!p.alive) return;
      if (p.x < vx0 - 40 || p.x > vx1 + 40 || p.y < vy0 - 50 || p.y > vy1 + 40) return;
      const ib = inBush(p.x, p.y);
      const hid = ib && !ally(fi, i) && Math.hypot(p.x - fo.x, p.y - fo.y) > 110;
      if (hid) return;
      const Wp = WEAP[p.w] || WEAP.p;
      ctx.globalAlpha = ib ? 0.55 : 1;
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 6, R, R * 0.7, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = Wp.c; ctx.lineWidth = Wp.wid; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.a) * (R + Wp.len), p.y + Math.sin(p.a) * (R + Wp.len)); ctx.stroke();
      ctx.fillStyle = col(i); ctx.strokeStyle = i === cfg.me ? "#fff" : "#111"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.fill(); ctx.stroke();
      if (p.ar > 0) { ctx.strokeStyle = "#60a5fa"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, R - 4, 0, 7); ctx.stroke(); }
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x + Math.cos(p.a) * 6 - Math.sin(p.a) * 5, p.y + Math.sin(p.a) * 6 + Math.cos(p.a) * 5, 3, 0, 7); ctx.arc(p.x + Math.cos(p.a) * 6 + Math.sin(p.a) * 5, p.y + Math.sin(p.a) * 6 - Math.cos(p.a) * 5, 3, 0, 7); ctx.fill();
      if (p.sh > 0) { ctx.strokeStyle = "rgba(125,211,252,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, R + 6, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000"; ctx.fillRect(p.x - 20, p.y - R - 14, 40, 7);
      ctx.fillStyle = p.hp > 50 ? "#22c55e" : p.hp > 25 ? "#f59e0b" : "#ef4444"; ctx.fillRect(p.x - 19, p.y - R - 13, 38 * p.hp / 100, 5);
      if (p.ar > 0) { ctx.fillStyle = "#60a5fa"; ctx.fillRect(p.x - 19, p.y - R - 9, 38 * p.ar / 50, 2); }
      ctx.font = "800 11px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; const lab = (i === cfg.me ? "Ты" : cfg.players[i].name) + (BR && p.w !== "p" ? " " + Wp.i : "");
      ctx.strokeText(lab, p.x, p.y - R - 18); ctx.fillStyle = "#fff"; ctx.fillText(lab, p.x, p.y - R - 18);
    });
    // кусты поверх
    const inMe = fo.alive && inBush(fo.x, fo.y);
    for (const b of bushes) {
      if (b[0] + b[2] < vx0 || b[0] - b[2] > vx1 || b[1] + b[2] < vy0 || b[1] - b[2] > vy1) continue;
      ctx.fillStyle = inMe && Math.hypot(b[0] - fo.x, b[1] - fo.y) < b[2] ? "rgba(34,120,50,.55)" : "#2f8f46";
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; ctx.beginPath(); ctx.arc(b[0] + Math.cos(a) * b[2] * 0.45, b[1] + Math.sin(a) * b[2] * 0.45, b[2] * 0.55, 0, 7); ctx.fill(); }
    }
    // пули и эффекты
    for (const b of B) {
      if (b.w === "r") { ctx.strokeStyle = "rgba(216,180,254,.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillStyle = "#f5d0fe"; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, 7); ctx.fill(); continue; }
      const rr = b.w === "s" ? 3 : b.w === "a" ? 3.2 : 4;
      ctx.strokeStyle = "rgba(255,240,150,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, 7); ctx.fill();
    }
    fx = fx.filter((e) => (e.t += dt) < (e.k === "boom" ? 0.6 : e.k === "zap" ? 0.5 : 0.2));
    for (const e of fx) {
      if (e.k === "flash") { ctx.fillStyle = `rgba(255,220,100,${1 - e.t / 0.2})`; ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, 7); ctx.fill(); }
      else if (e.k === "hit") { ctx.fillStyle = `rgba(239,68,68,${1 - e.t / 0.2})`; ctx.beginPath(); ctx.arc(e.x, e.y, 10, 0, 7); ctx.fill(); }
      else if (e.k === "puff") { ctx.fillStyle = `rgba(90,60,30,${0.7 - e.t * 3})`; ctx.beginPath(); ctx.arc(e.x, e.y, 6 + e.t * 30, 0, 7); ctx.fill(); }
      else if (e.k === "boom") { ctx.globalAlpha = 1 - e.t / 0.6; ctx.strokeStyle = e.c; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + e.t * 90, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // зона
    if (BR && Z) {
      const zr = Math.max(0, Zd.r), ddx = Math.max(Math.abs(Zd.x - vx0), Math.abs(Zd.x - vx1)), ddy = Math.max(Math.abs(Zd.y - vy0), Math.abs(Zd.y - vy1));
      const nx = Math.max(vx0, Math.min(vx1, Zd.x)), ny = Math.max(vy0, Math.min(vy1, Zd.y));
      if (Math.hypot(ddx, ddy) > zr) {   // заливка вне зоны — только если край зоны виден
        ctx.fillStyle = "rgba(37,99,235,.28)"; ctx.beginPath(); ctx.rect(vx0 - 10, vy0 - 10, vx1 - vx0 + 20, vy1 - vy0 + 20);
        if (Math.hypot(nx - Zd.x, ny - Zd.y) < zr) { ctx.arc(Zd.x, Zd.y, zr, 0, 7); ctx.fill("evenodd"); } else ctx.fill();
      }
      ctx.strokeStyle = "rgba(96,165,250,.95)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(Zd.x, Zd.y, Math.max(0, Zd.r), 0, 7); ctx.stroke();
      if (Z.ph < 2 && Z.nr < Zd.r - 2) { ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Z.nx, Z.ny, Math.max(1, Z.nr), 0, 7); ctx.stroke(); }
    }
    ctx.strokeStyle = "#3a2a14"; ctx.lineWidth = 8; ctx.strokeRect(-4, -4, AW + 8, AH + 8);
    // прицельная линия
    if (aimS && aimS.far && me.alive) { const a = Math.atan2(aimS.cy - aimS.y, aimS.cx - aimS.x), rg = myW().rng; ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.setLineDash([8, 8]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(me.x + Math.cos(a) * rg, me.y + Math.sin(a) * rg); ctx.stroke(); ctx.setLineDash([]); }
    // джойстики
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const s of [moveS, aimS]) { if (!s) continue; ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, 60, 0, 7); ctx.stroke(); ctx.fillStyle = s === aimS ? "rgba(255,120,60,.7)" : "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(s.cx, s.cy, 22, 0, 7); ctx.fill(); }
    if (BR && Z) {
      if (me.alive && phase === "play" && Math.hypot(me.x - Zd.x, me.y - Zd.y) > Zd.r) {   // вне зоны — синяя рамка
        ctx.fillStyle = `rgba(59,130,246,${0.35 + Math.sin(t * 8) * 0.15})`; const b = 14; ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); ctx.fillRect(0, 0, b, H); ctx.fillRect(W - b, 0, b, H);
      }
      for (const e of fx) if (e.k === "zap") { ctx.fillStyle = `rgba(59,130,246,${0.3 * (1 - e.t / 0.5)})`; ctx.fillRect(0, 0, W, H); }
    }
    if (!me.alive && phase === "play") { ctx.fillStyle = BR ? "rgba(0,0,0,.12)" : "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, W, H); }
  }
  function hud() {
    const me = P[cfg.me], tEl = $("s-time");
    if (BR) {
      $("s-me").textContent = `👥 ${aliveN()}  🎯 ${me.k}${me.ar > 0 ? "  🛡" + me.ar : ""}`;
      const tl = Math.max(0, Math.ceil(Z.t)), warn = Z.ph === 1 || (Z.ph === 0 && Z.t < 6);
      tEl.textContent = Z.ph === 2 ? "🔥 зона" : `${Z.ph === 1 ? "⚠" : "🔵"} ${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, "0")}`;
      tEl.style.color = warn ? "#fca5a5" : "";
      const Wp = myW();
      $("s-lead").textContent = me.alive ? `${Wp.i} ${Wp.n}` : "👁 зритель";
      $("ammo").classList.toggle("hidden", !me.alive);
      $("ammo").classList.toggle("sm", Wp.mag > 5);
      $("ammo").innerHTML = Array.from({ length: Wp.mag }, (_, k) => `<i class="${k < Math.floor(ammo) ? "" : "e"}"></i>`).join("");
      const sp = $("spec");
      if (!me.alive && phase === "play") {
        sp.classList.remove("hidden");
        const f = specI >= 0 && P[specI] && P[specI].alive ? specI : -1;
        $("spec-t").textContent = `💀 Место #${me.pl || "?"} из ${P.length}` + (f >= 0 ? ` · 👁 ${cfg.players[f].name}` : "");
        $("spec-skip").classList.toggle("hidden", !(isHost() && cfg.players.every((pl, i) => pl.bot || !P[i].alive)));
      } else sp.classList.add("hidden");
      return;
    }
    tEl.style.color = "";
    const sc = scores();
    if (cfg.teams) { $("s-me").textContent = Object.keys(sc).sort().map((k) => `${["🔵", "🔴", "🟢", "🟡"][+k.slice(1)]} ${sc[k]}`).join("  "); $("s-lead").textContent = `🎯 ${me.k} / ${target}`; }
    else { $("s-me").textContent = `🎯 ${me.k}  💀 ${me.d}`; let li = 0; P.forEach((p, i) => { if (p.k > P[li].k) li = i; }); $("s-lead").textContent = `👑 ${pname(li)}: ${P[li].k}/${target}`; }
    const tl = Math.max(0, DURATION - gt); tEl.textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, "0")}`;
    $("ammo").classList.remove("sm");
    $("ammo").innerHTML = Array.from({ length: AMMO }, (_, k) => `<i class="${k < Math.floor(ammo) ? "" : "e"}"></i>`).join("");
  }
  let last = 0, snapT = 0, meT = 0, hudT = 0, miniT = 0;
  function update(dt) {
    gt += dt;
    const me = P[cfg.me];
    P.forEach((p) => { p.px = p.x; p.py = p.y; if (p.sh > 0) p.sh -= dt; });
    if (me.alive) {
      const mv = myMove(); if (mv) moveP(me, mv[0] * SPEED * dt, mv[1] * SPEED * dt);
      if (aimS && aimS.far) { const a = Math.atan2(aimS.cy - aimS.y, aimS.cx - aimS.x); me.a = a; shoot(a); }
      else if (mv && !aimS) me.a = Math.atan2(mv[1], mv[0]);
    } else if (BR && (specI < 0 || !P[specI].alive)) specI = leader();
    const Wp = myW();
    cool -= dt; if (ammo < Wp.mag) { reload -= dt; if (reload <= 0) { ammo += 1; reload = ammo < Wp.mag ? Wp.rel : 0; } }
    P.forEach((p, i) => { if (i !== cfg.me && !(isHost() && cfg.players[i].bot)) { p.x += (p.tx - p.x) * Math.min(1, dt * 12); p.y += (p.ty - p.y) * Math.min(1, dt * 12); } });
    if (isHost()) {
      bots(dt);
      if (BR) { hostLoot(); if (!ended) hostZone(dt); checkEnd(); }
      else {
        hostPacks(dt);
        P.forEach((p, i) => { if (!p.alive) { p.resp -= dt; if (p.resp <= 0 && !ended) respawn(i); } });
        if (gt >= DURATION) checkEnd();
      }
    } else if (BR && Z) Z.t -= dt;
    if (BR && Z) { const k = isHost() ? 1 : Math.min(1, dt * 10); Zd.x += (Z.x - Zd.x) * k; Zd.y += (Z.y - Zd.y) * k; Zd.r += (Z.r - Zd.r) * k; }
    stepBullets(dt);
    if (room) {
      if (isHost()) { snapT -= dt; if (snapT <= 0) { snapT = 1 / 12; room.sendFast("snap", snapshot()); } }
      else { meT -= dt; if (meT <= 0) { meT = 1 / 15; room.sendFast("me", [Math.round(me.x), Math.round(me.y), +me.a.toFixed(2)]); } }
    }
    hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.15; }
    if (BR) { miniT -= dt; if (miniT <= 0) { miniT = 0.1; const me = P[cfg.me]; drawMini(!me.alive && specI >= 0 ? P[specI] : me); } }
  }
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    const n = window.__ts || 1;   // ускорение времени только для тестов
    for (let k = 0; k < n && phase === "play"; k++) update(dt);
    render(ts / 1000, dt);
    requestAnimationFrame(frame);
  }

  const PARTY = { title: "Перестрелка", icon: "🔫", max: 6, bots: 2, text: "Го в «Перестрелку» 🔫 Арена, кусты, фраги — заходи в комнату!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }, { id: "t2", name: "2 команды", teams: 2 }, { id: "br", name: "👑 Королевская битва" }], onCancel: toMenu };
  $("m-bots").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.offline(Object.assign({}, PARTY, { bots: 3 }))); };
  $("m-br").onclick = () => {
    $("screen-menu").classList.add("hidden");
    const nm = T.playerName && T.playerName() !== "Друг" ? T.playerName() : "Ты";
    const players = [{ id: "me", name: nm, bot: false }];
    for (let k = 0; k < 5; k++) players.push({ id: "bot" + k, name: "🤖 Бот " + (k + 1), bot: true });
    players.forEach((p, i) => { p.team = i; p.color = Party.COLORS[i]; });
    begin({ room: null, cfg: { mode: "br", teams: 0, seed: Math.floor(Math.random() * 1e9), players, me: 0 } });
  };
  $("spec-skip").onclick = () => { if (isHost() && phase === "play") finish(); };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("strelka", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#1b2a1f", bg: "#1b2a1f", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("strelka", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get P() { return P; }, get cfg() { return cfg; }, get B() { return B; }, get Z() { return Z; }, get loot() { return loot; }, get gt() { return gt; }, get specI() { return specI; }, shoot, autoShot, finish };
})();
