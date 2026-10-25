/* Рикошет — танки в лабиринте (в духе Tank Trouble). До 4 танков, каждый сам за себя или 2 на 2, боты.
   Каждый двигает свой танк сам и шлёт координаты (~15 Гц). Выстрел — событие хозяину, хозяин рассылает «shot»,
   все симулируют снаряд одинаково (фиксированный шаг 1/120 с, округлённые старт и скорость, только + и * — детерминированно).
   Попадания, смерти, бонусы и раунды решает хозяин. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const C = 80, WT = 8, TR = 12, BR = 3.5, SPEED = 100, TURN = 3.6, BSPEED = 180, LIFE = 6, MAXBN = 6, MAXSH = 5, COOL = 0.15;
  const HZ = 120, HS = 1 / HZ, HITR = 14, IMM = 16, ROUNDS = 5, ROUND_MAX = 75, FREEZE = 1.2;
  const PWK = ["laser", "triple", "shield"], PW_T = { laser: 12, triple: 20, shield: 15 };
  const BG = "#1f2430";

  function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR, S = 1, OX = 0, OY = 0, CY = 0;
  function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; canvas.width = W * DPR; canvas.height = H * DPR; layout(); }
  addEventListener("resize", resize);

  let room = null, cfg = null, phase = "menu", round = 0, roundT = 0, freezeT = 0, roundOver = false, endT = null, nextT = 0, timeout = false, auto = false;
  let P = [], B = [], fx = [], PU = [], Wn = [], K = [], acc = 0, puT = 8, puN = 0;
  const shotN = {}, DS = { kills: 0, self: 0, ric: 0, shots: 0 };
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const team = (i) => cfg.players[i].team;
  const col = (i) => cfg.players[i].color;
  const grp = (i) => (cfg.teams ? team(i) : i);
  const ally = (a, b) => a === b || (cfg.teams > 0 && team(a) === team(b));
  const pname = (i) => (i === cfg.me ? "Ты" : cfg.players[i].name);
  const gname = (g) => (cfg.teams ? Party.TEAMNAMES[g] : pname(g));
  const lagSteps = () => clamp(Math.round(((room && room.rtt) || 160) / 2 / 1000 * HZ), 0, 24);

  // ---------- лабиринт ----------
  let cols = 7, rows = 10, AW = 560, AH = 800, hw = [], vw = [], rects = [], cellR = [];
  function genMaze(seed) {
    const r = rng(seed);
    cols = 6 + (cfg.players.length > 2 ? 1 : 0) + (r() < 0.5 ? 1 : 0); rows = cols + 3; AW = cols * C; AH = rows * C;
    hw = []; for (let y = 0; y <= rows; y++) hw.push(new Array(cols).fill(true));
    vw = []; for (let y = 0; y < rows; y++) vw.push(new Array(cols + 1).fill(true));
    const vis = new Uint8Array(cols * rows), st = [Math.floor(r() * cols * rows)]; vis[st[0]] = 1;
    while (st.length) {
      const c = st[st.length - 1], x = c % cols, y = (c / cols) | 0, nb = [];
      if (x > 0 && !vis[c - 1]) nb.push(0); if (x < cols - 1 && !vis[c + 1]) nb.push(1);
      if (y > 0 && !vis[c - cols]) nb.push(2); if (y < rows - 1 && !vis[c + cols]) nb.push(3);
      if (!nb.length) { st.pop(); continue; }
      const d = nb[Math.floor(r() * nb.length)]; let n;
      if (d === 0) { vw[y][x] = false; n = c - 1; } else if (d === 1) { vw[y][x + 1] = false; n = c + 1; }
      else if (d === 2) { hw[y][x] = false; n = c - cols; } else { hw[y + 1][x] = false; n = c + cols; }
      vis[n] = 1; st.push(n);
    }
    // лишние проходы — петли, чтобы было где маневрировать
    for (let y = 1; y < rows; y++) for (let x = 0; x < cols; x++) if (hw[y][x] && r() < 0.22) hw[y][x] = false;
    for (let y = 0; y < rows; y++) for (let x = 1; x < cols; x++) if (vw[y][x] && r() < 0.22) vw[y][x] = false;
    rects = [];
    for (let y = 0; y <= rows; y++) for (let x = 0; x < cols;) { if (!hw[y][x]) { x++; continue; } let x1 = x; while (x1 + 1 < cols && hw[y][x1 + 1]) x1++; rects.push([x * C - WT / 2, y * C - WT / 2, (x1 + 1) * C + WT / 2, y * C + WT / 2]); x = x1 + 1; }
    for (let x = 0; x <= cols; x++) for (let y = 0; y < rows;) { if (!vw[y][x]) { y++; continue; } let y1 = y; while (y1 + 1 < rows && vw[y1 + 1][x]) y1++; rects.push([x * C - WT / 2, y * C - WT / 2, x * C + WT / 2, (y1 + 1) * C + WT / 2]); y = y1 + 1; }
    cellR = Array.from({ length: cols * rows }, () => []);
    for (const q of rects) {
      for (let y = Math.max(0, Math.floor((q[1] - 16) / C)); y <= Math.min(rows - 1, Math.floor((q[3] + 16) / C)); y++)
        for (let x = Math.max(0, Math.floor((q[0] - 16) / C)); x <= Math.min(cols - 1, Math.floor((q[2] + 16) / C)); x++) cellR[y * cols + x].push(q);
    }
    layout();
    return r;
  }
  function hitAt(x, y, m) {
    if (!(x > 0 && y > 0 && x < AW && y < AH)) return true;
    let cx = (x / C) | 0, cy = (y / C) | 0; if (cx >= cols) cx = cols - 1; if (cy >= rows) cy = rows - 1;
    const L = cellR[cy * cols + cx];
    for (let k = 0; k < L.length; k++) { const q = L[k]; if (x > q[0] - m && x < q[2] + m && y > q[1] - m && y < q[3] + m) return true; }
    return false;
  }
  // проходима ли граница из клетки c в направлении d (0 лево, 1 право, 2 верх, 3 низ)
  function open(c, d) {
    const x = c % cols, y = (c / cols) | 0;
    if (d === 0) return x > 0 && !vw[y][x]; if (d === 1) return x < cols - 1 && !vw[y][x + 1];
    if (d === 2) return y > 0 && !hw[y][x]; return y < rows - 1 && !hw[y + 1][x];
  }
  const DSTEP = () => [-1, 1, -cols, cols];
  const cellOf = (x, y) => clamp((y / C) | 0, 0, rows - 1) * cols + clamp((x / C) | 0, 0, cols - 1);
  // луч с отражениями (аналитически, стены расширены на радиус снаряда) → [x0,y0,x1,y1,...]
  function traceRay(x, y, dx, dy, len, maxB) {
    const pts = [x, y];
    for (let b = 0; b <= maxB && len > 0; b++) {
      let best = len, ax = -1;
      for (let k = 0; k < rects.length; k++) {
        const q = rects[k], x0 = q[0] - BR, x1 = q[2] + BR, y0 = q[1] - BR, y1 = q[3] + BR;
        let txa, txb, tya, tyb;
        if (dx !== 0) { const a1 = (x0 - x) / dx, a2 = (x1 - x) / dx; if (a1 < a2) { txa = a1; txb = a2; } else { txa = a2; txb = a1; } } else { if (x <= x0 || x >= x1) continue; txa = -1e9; txb = 1e9; }
        if (dy !== 0) { const a1 = (y0 - y) / dy, a2 = (y1 - y) / dy; if (a1 < a2) { tya = a1; tyb = a2; } else { tya = a2; tyb = a1; } } else { if (y <= y0 || y >= y1) continue; tya = -1e9; tyb = 1e9; }
        const te = txa > tya ? txa : tya, tx = txb < tyb ? txb : tyb;
        if (te < tx && te > 1e-4 && te < best) { best = te; ax = txa > tya ? 0 : 1; }
      }
      x += dx * best; y += dy * best; pts.push(x, y); len -= best;
      if (ax < 0) break;
      if (ax === 0) dx = -dx; else dy = -dy;
    }
    return pts;
  }
  // первый танк на траектории (свой — только после 45 ед. пути)
  function firstHit(pts, sh) {
    let along = 0, bj = -1, bl = 1e9;
    for (let s = 0; s + 3 < pts.length; s += 2) {
      const x0 = pts[s], y0 = pts[s + 1], sx = pts[s + 2] - x0, sy = pts[s + 3] - y0, L2 = sx * sx + sy * sy, L = Math.sqrt(L2) || 1e-6;
      for (let j = 0; j < P.length; j++) {
        const p = P[j]; if (!p.alive) continue;
        const u = clamp(((p.x - x0) * sx + (p.y - y0) * sy) / (L2 || 1e-6), 0, 1), ex = x0 + sx * u - p.x, ey = y0 + sy * u - p.y;
        if (ex * ex + ey * ey < HITR * HITR) { const al = along + u * L; if (j === sh && al < 45) continue; if (al < bl) { bl = al; bj = j; } }
      }
      if (bj >= 0) break;
      along += L;
    }
    return bj < 0 ? null : { j: bj, d: bl };
  }

  // ---------- танки ----------
  function spawnAll(r) {
    const used = [], need = Math.max(3, Math.floor((cols + rows) / 3));
    P.forEach((p, i) => {
      let c = -1;
      for (let tr = 0; tr < 500 && c < 0; tr++) {
        const cand = Math.floor(r() * cols * rows), cx = cand % cols, cy = (cand / cols) | 0;
        if (used.every((u) => Math.abs(u[0] - cx) + Math.abs(u[1] - cy) >= need - Math.floor(tr / 100))) c = cand;
      }
      if (c < 0) c = Math.floor(r() * cols * rows);
      used.push([c % cols, (c / cols) | 0]);
      const dirs = [0, 1, 2, 3].filter((d) => open(c, d)), d = dirs.length ? dirs[Math.floor(r() * dirs.length)] : 1;
      const a = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][d];
      Object.assign(p, { x: (c % cols) * C + C / 2, y: ((c / cols) | 0) * C + C / 2, a, alive: true, pw: null, cool: 0 });
      p.tx = p.x; p.ty = p.y; p.ta = p.a;
    });
  }
  function drive(p, turn, thr, dt) {
    if (turn) { p.a += turn * TURN * dt; if (p.a > Math.PI) p.a -= 2 * Math.PI; else if (p.a < -Math.PI) p.a += 2 * Math.PI; }
    if (thr) {
      const sp = SPEED * thr * dt, dx = Math.cos(p.a) * sp, dy = Math.sin(p.a) * sp;
      if (!hitAt(p.x + dx, p.y, TR)) p.x += dx;
      if (!hitAt(p.x, p.y + dy, TR)) p.y += dy;
    }
  }

  // ---------- снаряды ----------
  function makeShot(i, a) {
    const p = P[i], tri = p.pw && p.pw.k === "triple", n = tri ? 3 : 1;
    if (tri && --p.pw.n <= 0) p.pw = null;
    let mx = p.x + Math.cos(a) * 15, my = p.y + Math.sin(a) * 15;
    if (hitAt(mx, my, BR) || hitAt((p.x + mx) / 2, (p.y + my) / 2, BR)) { mx = p.x; my = p.y; }
    const v = [];
    for (let k = 0; k < n; k++) { const aa = a + (k - (n - 1) / 2) * 0.2; v.push([+(Math.cos(aa) * BSPEED).toFixed(2), +(Math.sin(aa) * BSPEED).toFixed(2)]); }
    shotN[i] = ((shotN[i] || 0) + 1) % 30000;
    return { o: i, id: i * 100000 + shotN[i] * 3, x: +mx.toFixed(1), y: +my.toFixed(1), v, r: round };
  }
  function addBullets(d, lag) {
    const nb = [];
    d.v.forEach((v, k) => { const b = { id: d.id + k, o: d.o, x: d.x, y: d.y, vx: v[0], vy: v[1], t: 0, bn: 0, dead: false, ghost: 0 }; B.push(b); nb.push(b); });
    fx.push({ k: "flash", x: d.x, y: d.y, t: 0 });
    for (let s = 0; s < lag; s++) for (const b of nb) if (!b.dead) { stepB(b); if (!b.dead) checkHit(b); }
  }
  function stepB(b) {
    const nx = b.x + b.vx * HS;
    if (hitAt(nx, b.y, BR)) { b.vx = -b.vx; b.bn++; } else b.x = nx;
    const ny = b.y + b.vy * HS;
    if (hitAt(b.x, ny, BR)) { b.vy = -b.vy; b.bn++; } else b.y = ny;
    b.t++;
    if (b.t === 300 && window.__dbg) window.__dbg[b.id] = [b.x, b.y, b.bn];
    if (b.bn > MAXBN || b.t > LIFE * HZ) { b.dead = true; fx.push({ k: "puff", x: b.x, y: b.y, t: 0 }); }
  }
  function checkHit(b) {
    if (b.ghost > 0 || roundOver) return;
    for (let j = 0; j < P.length; j++) {
      const p = P[j]; if (!p.alive || (j === b.o && b.t < IMM)) continue;
      const dx = p.x - b.x, dy = p.y - b.y; if (dx * dx + dy * dy > HITR * HITR) continue;
      if (isHost()) {
        b.dead = true;
        if (p.pw && p.pw.k === "shield") { const d = [j, b.id]; send("sh", d); onSh(d); }
        else kill(j, b.o, b.id);
      } else b.ghost = 0.6;           // клиент прячет снаряд и ждёт решения хозяина
      return;
    }
  }
  function canFire(i) {
    const p = P[i]; if (!p.alive || phase !== "play" || freezeT > 0 || p.cool > 0) return false;
    let n = 0; for (const b of B) if (b.o === i && !b.dead) n++;
    return n < (cfg.players[i].bot && i !== cfg.me ? 3 : MAXSH);
  }
  function fire(i, a) {
    if (!canFire(i)) return false;
    const d = makeShot(i, a); P[i].cool = COOL; DS.shots++;
    addBullets(d, 0);
    if (isHost()) send("shot", d); else send("fire", d);
    if (i === cfg.me) T.haptic("impact", "light");
    return true;
  }
  function myFire() { if (cfg && P[cfg.me] && !auto) fire(cfg.me, P[cfg.me].a); }
  function remoteTriple(d) { const p = P[d.o]; if (d.v.length === 3 && p.pw && p.pw.k === "triple" && --p.pw.n <= 0) p.pw = null; }

  function kill(j, by, bid) {
    if (!P[j].alive) return;
    if (by !== j && !ally(by, j)) K[by]++;
    const bb = B.find((q) => q.id === bid); DS.kills++; if (by === j) DS.self++; if (bb && bb.bn > 0) DS.ric++;
    const d = [j, by, bid, K[by]]; send("ko", d); onKo(d);
  }
  function onKo(d) {
    const [j, by, bid] = d, p = P[j];
    K[by] = d[3];
    for (const b of B) if (b.id === bid) b.dead = true;
    if (!p.alive) return;
    p.alive = false; boom(p.x, p.y, col(j));
    feed(by === j ? `${pname(j)} — свой рикошет 🤦` : `${pname(by)} 💥 ${pname(j)}`);
    if (j === cfg.me) { msg(by === j ? "🤦 Свой же снаряд!" : "💀 Подбит!", 1300); T.haptic("notify", "error"); }
    else if (by === cfg.me && !ally(by, j)) { msg("🎯 Есть!", 800); T.haptic("notify", "success"); }
  }
  function onSh(d) { const p = P[d[0]]; if (p) p.pw = null; for (const b of B) if (b.id === d[1]) b.dead = true; fx.push({ k: "ring", x: p.x, y: p.y, t: 0, c: "#38bdf8" }); if (d[0] === cfg.me) { msg("🛡 Щит спас!", 900); T.haptic("impact", "heavy"); } }
  function boom(x, y, c) {
    fx.push({ k: "ring", x, y, t: 0, c });
    for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 110; fx.push({ k: "part", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, c: k % 3 ? c : "#fbbf24" }); }
  }

  // ---------- бонусы (хозяин) ----------
  function hostPU(dt) {
    if (roundOver) return;
    puT -= dt;
    if (puT <= 0) {
      puT = 9 + Math.random() * 5;
      if (PU.length < 2) {
        for (let tr = 0; tr < 30; tr++) {
          const c = Math.floor(Math.random() * cols * rows), x = (c % cols) * C + C / 2, y = ((c / cols) | 0) * C + C / 2;
          if (PU.some((q) => q[2] === c) || P.some((p) => p.alive && Math.hypot(p.x - x, p.y - y) < C * 1.5)) continue;
          PU.push([++puN, PWK[Math.floor(Math.random() * 3)], c]); send("pu", PU); break;
        }
      }
    }
    for (let k = PU.length - 1; k >= 0; k--) {
      const q = PU[k], x = (q[2] % cols) * C + C / 2, y = ((q[2] / cols) | 0) * C + C / 2;
      const i = P.findIndex((p) => p.alive && Math.hypot(p.x - x, p.y - y) < 22);
      if (i >= 0) { PU.splice(k, 1); const d = [q[0], i, q[1]]; send("pk", d); send("pu", PU); onPk(d); }
    }
  }
  function onPk(d) {
    const [id, i, k] = d; PU = PU.filter((q) => q[0] !== id);
    P[i].pw = { k, t: PW_T[k], n: 3 };
    if (i === cfg.me) { msg({ laser: "🔴 Лазер-прицел!", triple: "🔱 Тройной выстрел ×3", shield: "🛡 Щит!" }[k], 1100); T.haptic("notify", "success"); }
  }

  // ---------- боты ----------
  const BOT = {}; let scanBudget = 1;
  function threat(i) {
    const p = P[i]; let best = null, bt = 1e9;
    for (const b of B) {
      if (b.dead || (b.o === i && b.t < IMM * 3)) continue;
      const rx = p.x - b.x, ry = p.y - b.y; if (rx * rx + ry * ry > 230 * 230) continue;
      const vv = b.vx * b.vx + b.vy * b.vy, t = (rx * b.vx + ry * b.vy) / vv;
      if (t < 0 || t > 0.9) continue;
      const cx = b.x + b.vx * t, cy = b.y + b.vy * t, d = Math.hypot(p.x - cx, p.y - cy);
      if (d < 21 && t < bt) { bt = t; let ax = p.x - cx, ay = p.y - cy; if (Math.hypot(ax, ay) < 1) { ax = -b.vy; ay = b.vx; } best = { b, dir: Math.cos(p.a) * ax + Math.sin(p.a) * ay >= 0 ? 1 : -1 }; }
    }
    return best;
  }
  function findShot(i, s) {
    const p = P[i]; let best = null;
    for (let j = 0; j < P.length; j++) {
      const q = P[j]; if (ally(i, j) || !q.alive) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y); if (d > 640) continue;
      const a = Math.atan2(q.y - p.y, q.x - p.x), h = firstHit(traceRay(p.x, p.y, Math.cos(a), Math.sin(a), d + 10, 0), i);
      if (h && h.j === j && (!best || d < best.d)) best = { a, j, d };
    }
    if (best) return best;
    s.bt = !s.bt; if (!s.bt || scanBudget <= 0) return null;   // рикошетный перебор — через раз и не больше одного бота за кадр
    scanBudget--;
    const off = Math.random() * 0.087;
    for (let k = 0; k < 72; k++) {
      const a = off + k * Math.PI / 36, h = firstHit(traceRay(p.x, p.y, Math.cos(a), Math.sin(a), 720, 1), i);
      if (h && !ally(i, h.j) && (!best || h.d < best.d)) best = { a, j: h.j, d: h.d };
    }
    return best;
  }
  function route(i, s) {
    const p = P[i], start = cellOf(p.x, p.y), N = cols * rows, prev = new Int16Array(N).fill(-1), ds = DSTEP();
    const goals = new Set();
    P.forEach((q, j) => { if (!ally(i, j) && q.alive) goals.add(cellOf(q.x, q.y)); });
    if (!p.pw) PU.forEach((q) => goals.add(q[2]));
    if (!goals.size) return null;
    const qu = [start]; prev[start] = start; let goal = -1;
    for (let h = 0; h < qu.length; h++) { const c = qu[h]; if (goals.has(c) && c !== start) { goal = c; break; } for (let d = 0; d < 4; d++) if (open(c, d)) { const n = c + ds[d]; if (prev[n] < 0) { prev[n] = c; qu.push(n); } } }
    if (goal < 0) return null;
    let c = goal; while (prev[c] !== start) c = prev[c];
    const cx = (start % cols) * C + C / 2, cy = ((start / cols) | 0) * C + C / 2, nx = (c % cols) * C + C / 2, ny = ((c / cols) | 0) * C + C / 2;
    // сначала выровняться по центру своей клетки, чтобы не цеплять углы
    const lat = nx !== cx ? Math.abs(p.y - cy) : Math.abs(p.x - cx);
    return lat > 13 ? [cx, cy] : [nx, ny];
  }
  function botStep(i, dt) {
    const p = P[i];
    const s = BOT[i] || (BOT[i] = { think: 0, wp: null, aim: null, react: 0, dodge: 0, ddir: 1, seen: {}, lx: p.x, ly: p.y, rev: 0, tgt: -1, wait: 0 });
    s.think -= dt; s.dodge -= dt; s.rev -= dt; s.react -= dt; s.wait -= dt;
    if (s.think <= 0) {
      s.think = 0.17 + Math.random() * 0.1;
      if (s.dodge <= 0) { const th = threat(i); if (th) { if (!(th.b.id in s.seen)) s.seen[th.b.id] = Math.random() < 0.6; if (s.seen[th.b.id]) { s.dodge = 0.45; s.ddir = th.dir; } } }
      s.aim = s.wait > 0 ? null : findShot(i, s);
      if (s.aim && s.aim.j !== s.tgt) { s.tgt = s.aim.j; s.react = 0.15 + Math.random() * 0.3; }
      if (!s.aim) s.wp = route(i, s);
      const moved = Math.hypot(p.x - s.lx, p.y - s.ly); s.lx = p.x; s.ly = p.y;
      if (!s.aim && s.wp && moved < 2 && s.dodge <= 0 && s.rev <= 0) { s.rev = 0.35; s.rturn = Math.random() < 0.5 ? -1 : 1; }
    }
    let turn = 0, thr = 0;
    if (s.dodge > 0) { thr = s.ddir; }
    else if (s.rev > 0) { thr = -0.8; turn = s.rturn; }
    else if (s.aim) {
      const diff = angDiff(s.aim.a, p.a); turn = clamp(diff * 7, -1, 1);
      if (Math.abs(diff) < 0.06 && s.react <= 0 && canFire(i)) { fire(i, p.a + (Math.random() - 0.5) * 0.08); s.aim = null; s.wait = 0.35 + Math.random() * 0.5; s.think = 0.1; }
    } else if (s.wp) {
      const diff = angDiff(Math.atan2(s.wp[1] - p.y, s.wp[0] - p.x), p.a);
      turn = clamp(diff * 4, -1, 1); thr = Math.abs(diff) < 0.9 ? Math.cos(diff) * 0.95 : 0;
      if (Math.hypot(s.wp[0] - p.x, s.wp[1] - p.y) < 6) s.think = 0;
    }
    drive(p, turn, thr, dt);
  }

  // ---------- раунды ----------
  function aliveGroups() { const g = new Set(); P.forEach((p, i) => { if (p.alive) g.add(grp(i)); }); return g; }
  function applyRound(r, seed) {
    round = r; roundT = 0; freezeT = FREEZE; roundOver = false; endT = null; nextT = 0; timeout = false;
    B = []; fx = []; PU = []; acc = 0; puT = 7 + Math.random() * 4;
    for (const k in BOT) delete BOT[k];
    const rr = genMaze(seed); spawnAll(rr);
    msg(round > ROUNDS ? "⚡ Решающий раунд!" : `Раунд ${round}`, 1200);
    hud(true);
  }
  function hostRound(dt) {
    if (roundOver) {
      if (nextT > 0) { nextT -= dt; if (nextT <= 0) { if (matchOver()) finish(); else { const d = { r: round + 1, seed: Math.floor(Math.random() * 1e9), W: Wn, K }; send("round", d); applyRound(d.r, d.seed); } } }
      return;
    }
    const ag = aliveGroups();
    if (endT == null && (ag.size <= 1 || roundT > ROUND_MAX)) { timeout = ag.size > 1; endT = timeout ? 0.01 : 1.6; }
    if (endT != null) {
      endT -= dt;
      if (endT <= 0) {
        const g2 = aliveGroups(), w = !timeout && g2.size === 1 ? [...g2][0] : -1;
        if (w >= 0) Wn[w]++;
        const d = { w, W: Wn, K, r: round, to: timeout ? 1 : 0 }; send("rend", d); onRend(d); nextT = 2.6;
      }
    }
  }
  function onRend(d) {
    roundOver = true; Wn = d.W.slice(); K = d.K.slice();
    const mine = grp(cfg.me);
    if (d.w < 0) msg(d.to ? "⏱ Время вышло — ничья" : "🤝 Ничья — никто не выжил", 2200);
    else if (d.w === mine) { msg(cfg.teams ? "🏆 Раунд за вами!" : "🏆 Раунд твой!", 2200); T.haptic("notify", "success"); }
    else msg(`Раунд: ${gname(d.w)} 🏆`, 2200);
    hud(true);
  }
  function matchOver() {
    const s = Wn.slice().sort((a, b) => b - a), top = s[0], sec = s[1] || 0, rem = ROUNDS - round;
    if (rem > 0) return top - sec > rem;
    return top > sec || round >= ROUNDS + 3;
  }
  function finish() { if (phase !== "play") return; const d = { W: Wn, K }; send("end", d); onEnd(d); }
  function onEnd(d) {
    phase = "end"; Wn = d.W.slice(); K = d.K.slice();
    const mine = grp(cfg.me), top = Math.max(...Wn), nTop = Wn.filter((x) => x === top).length;
    const win = Wn[mine] === top && nTop === 1, draw = Wn[mine] === top && nTop > 1;
    St.gameEnd({ win, draw, players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode, rounds: round, wins: Wn[mine], kills: K[cfg.me] });
    T.haptic("notify", win ? "success" : "error");
    $("end-emoji").textContent = win ? "🏆" : draw ? "🤝" : "💥";
    $("end-title").textContent = win ? (cfg.teams ? "Ваша команда победила!" : "Ты победил!") : draw ? "Ничья!" : "Не в этот раз";
    const esc = (s) => s.replace(/[<>&]/g, "");
    const row = (l, r) => `<div style="display:flex;justify-content:space-between;gap:8px;margin:3px 0">${l}<b>${r}</b></div>`;
    let html = `<div style="margin-bottom:6px">Сыграно раундов: ${round}</div>`;
    if (cfg.teams) {
      html += Wn.map((w, g) => ({ w, g })).sort((a, b) => b.w - a.w).map((t) => row(`<span><b style="color:${Party.COLORS[t.g]}">●</b> ${Party.TEAMNAMES[t.g]}${t.g === mine ? " (вы)" : ""}</span>`, `🏆 ${t.w}`)).join("");
      html += cfg.players.map((p, i) => row(`<span style="font-size:13px"><b style="color:${p.color}">●</b> ${esc(p.name)}${i === cfg.me && p.name !== "Ты" ? " (ты)" : ""}</span>`, `🎯 ${K[i]}`)).join("");
    } else html += cfg.players.map((p, i) => ({ p, i })).sort((a, b) => Wn[b.i] - Wn[a.i] || K[b.i] - K[a.i])
      .map((r) => row(`<span><b style="color:${r.p.color}">●</b> ${esc(r.p.name)}${r.i === cfg.me && r.p.name !== "Ты" ? " (ты)" : ""}</span>`, `🏆 ${Wn[r.i]} · 🎯 ${K[r.i]}`)).join("");
    $("end-sub").innerHTML = html;
    const b = [];
    if (isHost()) b.push(["🔁 Ещё матч", "primary", () => { const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) }); }]);
    else b.push(["Ждём, пока хозяин запустит матч…", "", () => {}]);
    b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
    const box = $("end-buttons"); box.innerHTML = "";
    b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
    setTimeout(() => { if (phase === "end") $("screen-end").classList.remove("hidden"); }, 900);
  }

  // ---------- сеть ----------
  const idx = (from) => cfg.players.findIndex((p) => p.id === from);
  function snapshot() { return { r: round, P: P.map((p) => [Math.round(p.x), Math.round(p.y), +p.a.toFixed(2), p.alive ? 1 : 0]) }; }
  function applySnap(s) {
    if (s.r !== round) return;
    s.P.forEach((v, i) => {
      const p = P[i]; if (!p) return;
      if (!v[3] && p.alive) { p.alive = false; boom(p.x, p.y, col(i)); }
      if (i === cfg.me) return;
      p.tx = v[0]; p.ty = v[1]; p.ta = v[2];
    });
  }
  function begin(c) {
    cfg = c.cfg; room = c.room; phase = "play"; auto = false;
    P = cfg.players.map(() => ({ x: 0, y: 0, a: 0, tx: 0, ty: 0, ta: 0, alive: true, pw: null, cool: 0 }));
    const ng = cfg.teams ? cfg.teams : cfg.players.length;
    Wn = new Array(ng).fill(0); K = new Array(cfg.players.length).fill(0);
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    ["top", "hint"].forEach((s) => $(s).classList.remove("hidden"));
    setTimeout(() => $("hint").classList.add("hidden"), 7000);
    applyRound(1, cfg.seed);
    if (room) {
      ["snap", "me", "fire", "shot", "ko", "sh", "pu", "pk", "rend", "round", "end", "start", "roster", "host-left", "full", "left"].forEach((t) => room.off(t));
      room.on("snap", (s) => { if (!isHost()) applySnap(s); });
      room.on("me", (d, from) => { if (!isHost() || d[0] !== round) return; const i = idx(from); if (i >= 0 && i !== cfg.me && P[i].alive) { P[i].tx = d[1]; P[i].ty = d[2]; P[i].ta = d[3]; } });
      room.on("fire", (d, from) => {
        if (!isHost() || d.r !== round || phase !== "play") return; const i = idx(from);
        if (i < 0 || i !== d.o || !P[i].alive) return;
        remoteTriple(d); addBullets(d, lagSteps()); send("shot", d);
      });
      room.on("shot", (d) => { if (isHost() || d.o === cfg.me || d.r !== round) return; remoteTriple(d); addBullets(d, lagSteps() * (d.o !== 0 && !cfg.players[d.o].bot ? 2 : 1)); });
      room.on("ko", (d) => { if (!isHost()) onKo(d); });
      room.on("sh", (d) => { if (!isHost()) onSh(d); });
      room.on("pu", (d) => { if (!isHost()) PU = d; });
      room.on("pk", (d) => { if (!isHost()) onPk(d); });
      room.on("rend", (d) => { if (!isHost() && d.r === round) onRend(d); });
      room.on("round", (d) => { if (!isHost() && d.r > round) { Wn = d.W.slice(); K = d.K.slice(); applyRound(d.r, d.seed); } });
      room.on("end", (d) => { if (!isHost() && phase === "play") onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
      room.on("host-left", () => { if (phase === "play") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; feed(`${p.name} вышел — играет бот`); } });
    }
    St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode });
  }
  function toMenu() { phase = "menu"; ["top", "hint", "screen-end"].forEach((s) => $(s).classList.add("hidden")); $("screen-menu").classList.remove("hidden"); }
  let msgT = 0, feedT = 0;
  function msg(t, ms) { const el = $("msg"); el.textContent = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }
  function feed(t) { const el = $("feed"); el.textContent = t; clearTimeout(feedT); feedT = setTimeout(() => { el.textContent = ""; }, 2500); }

  // ---------- ввод: левая половина — джойстик, правая — огонь ----------
  const sticks = {}; let moveS = null, fireP = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.clientX < W / 2 && !moveS) { moveS = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY }; sticks[e.pointerId] = "m"; }
    else { sticks[e.pointerId] = "f"; fireP = e.pointerId; myFire(); }
  });
  addEventListener("pointermove", (e) => {
    if (sticks[e.pointerId] !== "m" || !moveS) return;
    const s = moveS; s.cx = e.clientX; s.cy = e.clientY;
    const dx = s.cx - s.x, dy = s.cy - s.y, d = Math.hypot(dx, dy);
    if (d > 60) { s.x += dx / d * (d - 60); s.y += dy / d * (d - 60); }
  });
  const up = (e) => { const k = sticks[e.pointerId]; delete sticks[e.pointerId]; if (k === "m") moveS = null; if (k === "f" && fireP === e.pointerId) fireP = null; };
  addEventListener("pointerup", up); addEventListener("pointercancel", up);
  const keys = {};
  addEventListener("keydown", (e) => { if (!keys[e.code] && (e.code === "Space" || e.code === "Enter" || e.code === "KeyF")) myFire(); keys[e.code] = 1; });
  addEventListener("keyup", (e) => { keys[e.code] = 0; });
  function myControls(p) {
    if (moveS) {
      const dx = moveS.cx - moveS.x, dy = moveS.cy - moveS.y, d = Math.hypot(dx, dy);
      if (d > 8) { const diff = angDiff(Math.atan2(dy, dx), p.a), m = Math.min(1, d / 45); return [clamp(diff * 5, -1, 1), Math.abs(diff) < 1.3 ? m * Math.cos(diff) : 0]; }
      return [0, 0];
    }
    const thr = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 0.7 : 0), turn = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    return [turn, thr];
  }

  // ---------- отрисовка ----------
    function layout() {
    if (!W) return;
    const top = 50, portrait = H > W * 1.15, reserve = portrait ? Math.max(150, H * 0.2) : 24;
    S = Math.min((W - 12) / (AW + WT), (H - top - reserve - 8) / (AH + WT));
    OX = (W - AW * S) / 2; OY = top + WT * S;
    if (!portrait) OY = top + Math.max(0, (H - top - reserve - AH * S) / 2);
    const bot = OY + AH * S;
    CY = portrait ? clamp((bot + H) / 2, H - 170, H - 80) : H - 100;
  }
  function drawMaze(c) {
    c.fillStyle = "#ece6d6"; c.fillRect(0, 0, AW, AH);
    c.fillStyle = "#e3dbc6";
    for (let y = 0; y < rows; y++) for (let x = (y + 1) % 2; x < cols; x += 2) c.fillRect(x * C, y * C, C, C);
    c.fillStyle = "rgba(0,0,0,.13)";
    for (const q of rects) c.fillRect(q[0] + 2, q[1] + 3, q[2] - q[0], q[3] - q[1]);
    c.fillStyle = "#363c4e";
    for (const q of rects) c.fillRect(q[0], q[1], q[2] - q[0], q[3] - q[1]);
  }
  function drawTank(p, i, t) {
    const c = col(i), ca = Math.cos(p.a), sa = Math.sin(p.a), k = DPR * S;
    ctx.setTransform(k * ca, k * sa, -k * sa, k * ca, DPR * OX + k * p.x, DPR * OY + k * p.y);
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(-12, -10, 28, 24);
    ctx.fillStyle = "#23262e"; ctx.fillRect(-14, -12, 28, 7); ctx.fillRect(-14, 5, 28, 7);
    ctx.fillStyle = "#4b505c"; for (let x = -12; x < 14; x += 6) { ctx.fillRect(x, -11, 2, 5); ctx.fillRect(x, 6, 2, 5); }
    ctx.fillStyle = c; ctx.strokeStyle = i === cfg.me ? "#fff" : "#15171c"; ctx.lineWidth = 2;
    ctx.fillRect(-12, -7, 24, 14); ctx.strokeRect(-12, -7, 24, 14);
    ctx.fillStyle = "#15171c";
    if (p.pw && p.pw.k === "triple") { ctx.save(); ctx.rotate(-0.25); ctx.fillRect(2, -1.8, 14, 3.6); ctx.rotate(0.5); ctx.fillRect(2, -1.8, 14, 3.6); ctx.restore(); }
    ctx.fillRect(2, -2.5, 17, 5);
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill(); ctx.stroke();
    if (p.pw && p.pw.k === "laser") { ctx.fillStyle = "#ef4444"; ctx.fillRect(17, -1.5, 3, 3); }
    if (i === cfg.me) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 7); ctx.fill(); }
    ctx.setTransform(k, 0, 0, k, DPR * OX, DPR * OY);
    if (p.pw && p.pw.k === "shield") { ctx.strokeStyle = `rgba(56,189,248,${0.6 + Math.sin(t * 8) * 0.3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, 7); ctx.stroke(); }
  }
  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    if (!cfg || !P.length || phase === "menu") return;
    const k = DPR * S;
    ctx.setTransform(k, 0, 0, k, DPR * OX, DPR * OY);
    drawMaze(ctx);
    // бонусы
    for (const q of PU) {
      const x = (q[2] % cols) * C + C / 2, y = ((q[2] / cols) | 0) * C + C / 2 + Math.sin(t * 4 + q[0]) * 2;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#15171c"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(x - 13, y - 13, 26, 26, 7); ctx.fill(); ctx.stroke();
      if (q[1] === "laser") { ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 8, y + 6); ctx.lineTo(x + 2, y - 4); ctx.lineTo(x + 8, y + 2); ctx.stroke(); ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(x - 8, y + 6, 3, 0, 7); ctx.fill(); }
      else if (q[1] === "triple") { ctx.fillStyle = "#f59e0b"; for (let m = -1; m <= 1; m++) { ctx.beginPath(); ctx.arc(x + m * 6.5, y + Math.abs(m) * 4 - 2, 3.5, 0, 7); ctx.fill(); } }
      else { ctx.strokeStyle = "#0ea5e9"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, 7); ctx.stroke(); }
    }
    // подбитые танки
    P.forEach((p, i) => {
      if (p.alive) return;
      ctx.fillStyle = "rgba(30,30,34,.55)"; ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, 7); ctx.fill();
      ctx.fillStyle = col(i); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    });
    const me = P[cfg.me];
    // лазер-прицел
    if (me.alive && me.pw && me.pw.k === "laser") {
      const pts = traceRay(me.x, me.y, Math.cos(me.a), Math.sin(me.a), 900, 4);
      ctx.strokeStyle = "rgba(239,68,68,.75)"; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (let s = 2; s < pts.length; s += 2) ctx.lineTo(pts[s], pts[s + 1]);
      ctx.stroke(); ctx.setLineDash([]);
    }
    // танки
    P.forEach((p, i) => { if (p.alive) drawTank(p, i, t); });
    if (freezeT > 0 || roundT < 2) {
      ctx.font = "800 12px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.fillStyle = "#fff";
      P.forEach((p, i) => { if (!p.alive) return; const l = pname(i), ly = p.y - (i === cfg.me ? 32 : 20); ctx.strokeText(l, p.x, ly); ctx.fillText(l, p.x, ly); });
      if (me.alive) { ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(me.x, me.y, 24 + Math.sin(t * 10) * 4, 0, 7); ctx.stroke(); }
    }
    // снаряды
    ctx.fillStyle = "#111318"; ctx.beginPath();
    for (const b of B) if (!b.dead && b.ghost <= 0) { ctx.moveTo(b.x + BR + 0.8, b.y); ctx.arc(b.x, b.y, BR + 0.8, 0, 7); }
    ctx.fill();
    // эффекты
    fx = fx.filter((e) => (e.t += dt) < (e.k === "part" ? 0.7 : e.k === "ring" ? 0.5 : 0.18));
    for (const e of fx) {
      if (e.k === "flash") { ctx.fillStyle = `rgba(255,200,80,${1 - e.t / 0.18})`; ctx.beginPath(); ctx.arc(e.x, e.y, 7, 0, 7); ctx.fill(); }
      else if (e.k === "puff") { ctx.fillStyle = `rgba(80,80,90,${0.6 - e.t * 3})`; ctx.beginPath(); ctx.arc(e.x, e.y, 4 + e.t * 30, 0, 7); ctx.fill(); }
      else if (e.k === "ring") { ctx.globalAlpha = 1 - e.t / 0.5; ctx.strokeStyle = e.c; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + e.t * 80, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
      else { e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.94; e.vy *= 0.94; ctx.globalAlpha = 1 - e.t / 0.7; ctx.fillStyle = e.c; ctx.fillRect(e.x - 3, e.y - 3, 6, 6); ctx.globalAlpha = 1; }
    }
    // управление
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (phase === "play") {
      const jx = moveS ? moveS.x : Math.min(100, W * 0.24), jy = moveS ? moveS.y : CY;
      ctx.globalAlpha = moveS ? 1 : 0.45;
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(jx, jy, 55, 0, 7); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(moveS ? moveS.cx : jx, moveS ? moveS.cy : jy, 22, 0, 7); ctx.fill();
      const fxp = W - Math.min(95, W * 0.24), fr = 44;
      ctx.globalAlpha = me.alive ? (fireP != null ? 1 : 0.8) : 0.3;
      ctx.fillStyle = fireP != null ? "#f87171" : "#ef4444"; ctx.strokeStyle = "#15171c"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fxp, CY, fireP != null ? fr - 3 : fr, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "900 15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("ОГОНЬ", fxp, CY); ctx.textBaseline = "alphabetic";
      let used = 0; for (const b of B) if (b.o === cfg.me && !b.dead) used++;
      for (let m = 0; m < MAXSH; m++) { const a = -Math.PI / 2 + (m - 2) * 0.32, x = fxp + Math.cos(a) * (fr + 13), y = CY + Math.sin(a) * (fr + 13); ctx.fillStyle = m < MAXSH - used ? "#fde047" : "#475569"; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.globalAlpha = 1;
      if (me.pw) { ctx.font = "800 13px sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; const l = { laser: "🔴 лазер", triple: `🔱 ×${me.pw.n}`, shield: "🛡 щит" }[me.pw.k]; ctx.fillText(l + (me.pw.k !== "triple" ? ` ${Math.ceil(me.pw.t)}с` : ""), fxp, CY + fr + 20); }
      if (!me.alive && !roundOver) { ctx.font = "800 15px sans-serif"; ctx.fillStyle = "#e2e8f0"; ctx.textAlign = "center"; ctx.fillText("Ты подбит — смотри, кто выживет", W / 2, Math.min(H - 14, CY + 70)); }
    }
  }
  let hudKey = "";
  function hud(force) {
    const mine = grp(cfg.me), key = Wn.join(",") + "|" + round + "|" + mine;
    if (!force && key === hudKey) return; hudKey = key;
    $("s-round").textContent = round > ROUNDS ? `Доп. раунд ${round}` : `Раунд ${round}/${ROUNDS}`;
    $("s-chips").innerHTML = Wn.map((w, g) => `<span class="${g === mine ? "me" : ""}"><i style="background:${cfg.teams ? Party.COLORS[g] : col(g)}"></i>${w}</span>`).join("");
  }
  let last = 0, netT = 0;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (phase === "play") {
      roundT += dt; if (freezeT > 0) freezeT -= dt; scanBudget = 1;
      const me = P[cfg.me];
      for (const p of P) { p.cool -= dt; if (p.pw) { p.pw.t -= dt; if (p.pw.t <= 0) p.pw = null; } }
      if (me.alive && freezeT <= 0) { if (auto) botStep(cfg.me, dt); else { const c = myControls(me); drive(me, c[0], c[1], dt); } }
      const lk = Math.min(1, dt * 12);
      P.forEach((p, i) => { if (i === cfg.me || (isHost() && cfg.players[i].bot)) return; p.x += (p.tx - p.x) * lk; p.y += (p.ty - p.y) * lk; p.a += angDiff(p.ta, p.a) * lk; });
      if (isHost()) {
        if (freezeT <= 0) cfg.players.forEach((pl, i) => { if (pl.bot && i !== cfg.me && P[i].alive) botStep(i, dt); });
        hostPU(dt); hostRound(dt);
      }
      acc += dt; let n = 0;
      while (acc >= HS && n < 12) { for (const b of B) if (!b.dead) { stepB(b); if (!b.dead) checkHit(b); } acc -= HS; n++; }
      if (n >= 12) acc = 0;
      for (const b of B) if (b.ghost > 0) b.ghost -= dt;
      if (B.length > 40 || (B.length && B[0].dead)) B = B.filter((b) => !b.dead);
      if (room) {
        netT -= dt;
        if (netT <= 0) { netT = 1 / 15; if (isHost()) room.sendFast("snap", snapshot()); else if (me.alive) room.sendFast("me", [round, Math.round(me.x * 10) / 10, Math.round(me.y * 10) / 10, +me.a.toFixed(2)]); }
      }
      hud(false);
    }
    render(ts / 1000, dt);
    requestAnimationFrame(frame);
  }

  const PARTY = { title: "Рикошет", icon: "💣", max: 4, bots: 2, text: "Го в «Рикошет» 💣 Танки в лабиринте, снаряды отскакивают — заходи!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }, { id: "t2", name: "2 на 2", teams: 2 }], onCancel: toMenu };
  function offline(teams) {
    const nm = T.playerName() === "Друг" ? "Ты" : T.playerName();
    const players = [{ id: "me", name: nm, bot: false }];
    for (let i = 0; i < 3; i++) players.push({ id: "bot" + i, name: "🤖 Бот " + (i + 1), bot: true });
    players.forEach((p, i) => { p.team = teams ? i % 2 : i; p.color = Party.COLORS[teams ? p.team : i]; });
    if (teams) { players[1].team = 1; players[2].team = 0; players[1].color = Party.COLORS[1]; players[2].color = Party.COLORS[0]; }
    return { room: null, cfg: { mode: teams ? "t2" : "ffa", teams: teams ? 2 : 0, seed: Math.floor(Math.random() * 1e9), players, me: 0 } };
  }
  $("m-bots").onclick = () => begin(offline(false));
  $("m-bots2").onclick = () => begin(offline(true));
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("rikoshet", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  resize();
  T.init({ header: BG, bg: BG, back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("rikoshet", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = {
    get phase() { return phase; }, get P() { return P; }, get cfg() { return cfg; }, get B() { return B; }, get round() { return round; },
    get W() { return Wn; }, get K() { return K; }, get rects() { return rects; }, get maze() { return { cols, rows, AW, AH }; }, get PU() { return PU; },
    set auto(v) { auto = !!v; }, get auto() { return auto; }, fire: myFire, finish, traceRay, DS,
  };
})();
