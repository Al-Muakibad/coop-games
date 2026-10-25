/* Бильярд — американский пул «восьмёрка» на вертикальном столе. Против бота (3 уровня), вдвоём на одном телефоне
   или онлайн 1 на 1. Пошагово: удар (направление, сила, винт, место битка) рассылается всем, каждый считает одну и ту же
   детерминированную симуляцию с фиксированным шагом (только + − × ÷ и sqrt); после остановки шаров хозяин рассылает итог для сверки. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

  // ---------- стол (мировые единицы: игровое поле 500 × 1000) ----------
  const W = 500, L = 1000, R = 12.5, D2 = 4 * R * R, CUSH = 24, FR = 50;
  const HEAD = L * 0.75, FOOT = L * 0.25, CM = 40, SM = 26;
  const DT = 1 / 480, VMAX = 2500, DECEL = 150, DAMPK = 1 - 0.35 * DT, SPINK = 1 - 0.8 * DT, VSTOP2 = 9, EB = 0.95, ER = 0.78, MAXSTEPS = 480 * 20;
  const SEG = [], POCK = [];
  (function build() {
    const raw = [];
    const top = [[CM, 0, W - CM, 0], [CM, 0, CM - 12, -CUSH], [W - CM, 0, W - CM + 12, -CUSH]];
    top.forEach((s) => { raw.push(s); raw.push([s[0], L - s[1], s[2], L - s[3]]); });
    const side = [[0, CM, 0, L / 2 - SM], [0, CM, -CUSH, CM - 12], [0, L / 2 - SM, -CUSH, L / 2 - SM + 4]];
    side.forEach((s) => { const v = [s, [W - s[0], s[1], W - s[2], s[3]], [s[0], L - s[1], s[2], L - s[3]], [W - s[0], L - s[1], W - s[2], L - s[3]]]; v.forEach((q) => raw.push(q)); });
    raw.forEach((s) => { const dx = s[2] - s[0], dy = s[3] - s[1]; SEG.push([s[0], s[1], dx, dy, dx * dx + dy * dy]); });
    POCK.push([-6, -6, 26], [W + 6, -6, 26], [-6, L + 6, 26], [W + 6, L + 6, 26], [-12, L / 2, 22], [W + 12, L / 2, 22]);
  })();
  const PAIM = [[9, 9], [W - 9, 9], [-2, L / 2], [W + 2, L / 2], [9, L - 9], [W - 9, L - 9]];   // куда целить шар
  const COLORS = ["#f8fafc", "#facc15", "#2563eb", "#dc2626", "#7c3aed", "#f97316", "#16a34a", "#881337", "#111111"];
  const bcol = (i) => COLORS[i === 8 ? 8 : i > 8 ? i - 8 : i];
  const grp = (i) => (i === 8 ? 3 : i < 8 ? 1 : 2);
  const GNAME = ["стол открыт", "сплошные", "полосатые"];

  // ---------- симуляция ----------
  function newSim(b, shot) {
    const s = { x: new Float64Array(16), y: new Float64Array(16), vx: new Float64Array(16), vy: new Float64Array(16), on: new Uint8Array(16),
      sp: shot.sy || 0, ss: shot.sx || 0, first: -1, rail: false, pots: [], steps: 0, done: false, hits: 0 };
    for (let i = 0; i < 16; i++) if (b[i]) { s.on[i] = 1; s.x[i] = b[i][0]; s.y[i] = b[i][1]; }
    if (shot.cx != null) { s.on[0] = 1; s.x[0] = shot.cx; s.y[0] = shot.cy; }
    const l = Math.sqrt(shot.dx * shot.dx + shot.dy * shot.dy) || 1, v = shot.p * VMAX;
    s.vx[0] = shot.dx / l * v; s.vy[0] = shot.dy / l * v;
    return s;
  }
  function collide(s, i, j, d2) {
    const x = s.x, y = s.y, vx = s.vx, vy = s.vy;
    const px = x[j] - x[i], py = y[j] - y[i], wx = vx[j] - vx[i], wy = vy[j] - vy[i], a = wx * wx + wy * wy;
    let t = 0;
    if (a > 1e-9) { const b = -2 * (px * wx + py * wy), c = d2 - D2, disc = b * b - 4 * a * c; t = (-b + Math.sqrt(disc > 0 ? disc : 0)) / (2 * a); if (!(t >= 0 && t <= DT * 1.5)) t = 0; }
    const xi = x[i] - vx[i] * t, yi = y[i] - vy[i] * t, xj = x[j] - vx[j] * t, yj = y[j] - vy[j] * t;
    let nx = xj - xi, ny = yj - yi, d = Math.sqrt(nx * nx + ny * ny);
    if (d < 1e-9) { nx = 1; ny = 0; d = 1; }
    nx /= d; ny /= d;
    const vn = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
    if (vn > 0) {
      const J = (1 + EB) * 0.5 * vn;
      let fx = 0, fy = 0, spin = 0;
      if (i === 0 && s.first < 0) { s.first = j; if (s.sp !== 0) { const v = Math.sqrt(vx[0] * vx[0] + vy[0] * vy[0]); if (v > 0) { fx = vx[0] / v; fy = vy[0] / v; spin = s.sp; s.sp = 0; } } }
      vx[i] -= J * nx; vy[i] -= J * ny; vx[j] += J * nx; vy[j] += J * ny;
      if (spin !== 0) { vx[0] += fx * spin * J * 0.7; vy[0] += fy * spin * J * 0.7; }
      s.hits++;
      if (t > 0) { x[i] = xi + vx[i] * t; y[i] = yi + vy[i] * t; x[j] = xj + vx[j] * t; y[j] = yj + vy[j] * t; }
    }
    const qx = x[j] - x[i], qy = y[j] - y[i], q2 = qx * qx + qy * qy;
    if (q2 < D2) { const q = Math.sqrt(q2) || 1, o = (2 * R - q) * 0.5 + 0.001, ux = q2 > 0 ? qx / q : 1, uy = q2 > 0 ? qy / q : 0; x[i] -= ux * o; y[i] -= uy * o; x[j] += ux * o; y[j] += uy * o; }
  }
  function rails(s, i) {
    const x = s.x, y = s.y, vx = s.vx, vy = s.vy;
    for (let k = 0; k < SEG.length; k++) {
      const g = SEG[k];
      let t = ((x[i] - g[0]) * g[2] + (y[i] - g[1]) * g[3]) / g[4];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = g[0] + g[2] * t, qy = g[1] + g[3] * t, ex = x[i] - qx, ey = y[i] - qy, d2 = ex * ex + ey * ey;
      if (d2 >= R * R || d2 < 1e-12) continue;
      const d = Math.sqrt(d2), nx = ex / d, ny = ey / d, vn = vx[i] * nx + vy[i] * ny;
      x[i] = qx + nx * R; y[i] = qy + ny * R;
      if (vn >= 0) continue;
      let tx = vx[i] - vn * nx, ty = vy[i] - vn * ny;          // касательная составляющая
      tx *= 0.93; ty *= 0.93;
      if (i === 0 && s.ss !== 0) { const sx = -ny, sy = nx, dir = (tx * sx + ty * sy) >= 0 ? 1 : -1; tx += sx * dir * s.ss * (-vn) * 0.35; ty += sy * dir * s.ss * (-vn) * 0.35; s.ss *= 0.5; }
      vx[i] = tx - vn * ER * nx; vy[i] = ty - vn * ER * ny;
      if (s.first >= 0) s.rail = true;
    }
  }
  function pockets(s, i) {
    const x = s.x[i], y = s.y[i];
    let hit = -1;
    for (let k = 0; k < 6; k++) { const p = POCK[k], dx = x - p[0], dy = y - p[1]; if (dx * dx + dy * dy < p[2] * p[2]) { hit = k; break; } }
    if (hit < 0 && (x < -R * 1.5 || x > W + R * 1.5 || y < -R * 1.5 || y > L + R * 1.5)) {
      let bd = 1e18; for (let k = 0; k < 6; k++) { const p = POCK[k], d = (x - p[0]) * (x - p[0]) + (y - p[1]) * (y - p[1]); if (d < bd) { bd = d; hit = k; } }
    }
    if (hit < 0) return;
    s.on[i] = 0; s.vx[i] = 0; s.vy[i] = 0; s.pots.push(i); if (s.onPot) s.onPot(i, hit);
  }
  function step(s) {
    const x = s.x, y = s.y, vx = s.vx, vy = s.vy, on = s.on;
    for (let i = 0; i < 16; i++) if (on[i] && (vx[i] !== 0 || vy[i] !== 0)) { x[i] += vx[i] * DT; y[i] += vy[i] * DT; }
    for (let i = 0; i < 15; i++) {
      if (!on[i]) continue;
      for (let j = i + 1; j < 16; j++) {
        if (!on[j] || (vx[i] === 0 && vy[i] === 0 && vx[j] === 0 && vy[j] === 0)) continue;
        const px = x[j] - x[i], py = y[j] - y[i], d2 = px * px + py * py;
        if (d2 < D2) collide(s, i, j, d2);
      }
    }
    let moving = false;
    for (let i = 0; i < 16; i++) {
      if (!on[i] || (vx[i] === 0 && vy[i] === 0)) continue;
      if (x[i] < R + 1 || x[i] > W - R - 1 || y[i] < R + 1 || y[i] > L - R - 1) { rails(s, i); pockets(s, i); if (!on[i]) continue; }
      const v2 = vx[i] * vx[i] + vy[i] * vy[i];
      if (v2 < VSTOP2) { vx[i] = 0; vy[i] = 0; continue; }
      const v = Math.sqrt(v2), nv = v - DECEL * DT;
      if (nv <= 0) { vx[i] = 0; vy[i] = 0; continue; }
      const k = nv * DAMPK / v; vx[i] *= k; vy[i] *= k; moving = true;
    }
    s.sp *= SPINK;
    if (++s.steps >= MAXSTEPS || !moving) s.done = true;
  }
  const q2 = (v) => Math.round(v * 100) / 100;
  function simBalls(s) { const b = []; for (let i = 0; i < 16; i++) b.push(s.on[i] ? [q2(s.x[i]), q2(s.y[i])] : null); return b; }
  function runSim(b, shot, max) { const s = newSim(b, shot); const lim = max || MAXSTEPS; while (!s.done && s.steps < lim) step(s); s.done = true; return s; }

  // ---------- правила ----------
  const left = (b, g) => { let n = 0; for (let i = 1; i < 16; i++) if (b[i] && grp(i) === g) n++; return n; };
  const free = (b, x, y, skip) => { for (let i = 0; i < 16; i++) { if (i === skip || !b[i]) continue; const dx = b[i][0] - x, dy = b[i][1] - y; if (dx * dx + dy * dy < D2 + 0.5) return false; } return true; };
  function okPlace(S, x, y) { return x >= R && x <= W - R && y >= R && y <= L - R && (!S.brk || y >= HEAD) && free(S.b, x, y, 0); }
  function spotFree(b, x, y, dy) { while (!free(b, x, y, -1) && y > R && y < L - R) y += dy; return [x, y]; }
  function legal(S, p, id) { const g = S.g[p]; if (!g) return id !== 8; if (left(S.b, g) === 0) return id === 8; return grp(id) === g; }
  function judge(S0, s) {
    const p = S0.turn, o = 1 - p, g = S0.g.slice(), cleared = !!g[p] && left(S0.b, g[p]) === 0;
    const b = simBalls(s), cuePot = s.pots.indexOf(0) >= 0;
    let foul = "";
    if (s.first < 0) foul = "биток ни во что не попал";
    else if (!S0.brk) {
      if (!g[p] && s.first === 8) foul = "первой задета восьмёрка";
      else if (cleared && s.first !== 8) foul = "сначала нужно бить восьмёрку";
      else if (g[p] && !cleared && grp(s.first) !== g[p]) foul = "первым задет чужой шар";
    }
    if (cuePot) foul = "биток в лузе";
    if (!foul && !s.pots.length && !s.rail && !S0.brk) foul = "ни один шар не коснулся борта";
    const S = Object.assign({}, S0, { n: S0.n + 1, b, g, brk: false, fc: S0.fc.slice(), pc: S0.pc.slice(), msg: "", last: p });
    let eight = s.pots.indexOf(8) >= 0;
    if (eight && S0.brk) { b[8] = spotFree(b, W / 2, FOOT, -1); eight = false; S.msg = "Восьмёрка на разбое — вернули на точку. "; }
    if (foul) S.fc[p]++;
    if (eight) {
      S.ph = "end"; S.win = cleared && !foul ? p : o;
      S.why = S.win === p ? "забил восьмёрку" : foul ? "восьмёрка с фолом: " + foul : "восьмёрка забита раньше времени";
      S.turn = p; S.bih = false; S.wins = S0.wins.slice(); S.wins[S.win]++;
      return S;
    }
    if (!g[p] && !foul) { const f = s.pots.find((id) => id !== 0 && id !== 8); if (f) { g[p] = grp(f); g[o] = 3 - g[p]; S.msg += `${S0.names[p]}: ${GNAME[g[p]]}! `; } }
    const own = s.pots.filter((id) => id !== 0 && id !== 8 && (g[p] ? grp(id) === g[p] : true)).length;
    S.pc[p] += own;
    const cont = !foul && own > 0;
    S.turn = cont ? p : o; S.bih = !!foul;
    if (foul) S.msg += `Фол: ${foul}. Шар с руки — ${S0.names[o]}`;
    else if (cont) S.msg += own > 1 ? `Забито ${own}! Ещё удар` : "Забил! Ещё удар";
    else if (S0.brk && !s.pots.length) S.msg += "Разбой без шаров";
    return S;
  }
  function rack(seed) {
    let a = seed >>> 0 || 7; const rnd = () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296; };
    const ids = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    // углы последнего ряда: один сплошной и один полосатый
    const s = ids.find((i) => i < 8), st = ids.find((i) => i > 8);
    const rest = ids.filter((i) => i !== s && i !== st);
    const order = []; let k = 0;
    const b = new Array(16).fill(null);
    for (let r = 0; r < 5; r++) for (let c = 0; c <= r; c++) {
      let id;
      if (r === 2 && c === 1) id = 8; else if (r === 4 && c === 0) id = rnd() < 0.5 ? s : st; else if (r === 4 && c === 4) id = order.indexOf(s) >= 0 ? st : s; else id = rest[k++];
      order.push(id);
      b[id] = [q2(W / 2 + (c - r / 2) * (2 * R + 0.2)), q2(FOOT - r * (2 * R + 0.2) * 0.8660254)];
    }
    b[0] = [W / 2, q2(HEAD + (L - HEAD) / 3)];
    return b;
  }

  // ---------- состояние ----------
  let mode = "bot", level = 1, room = null, cfg = null, S = null, sim = null, acc = 0, endShown = false, pendingSt = null, pendingShot = null;
  let cuePos = null, aimAng = -Math.PI / 2, aimPow = 0, drag = null, placing = null, spin = { x: 0, y: 0 }, remote = null, botJob = null, botAnim = null, botAt = 0, aimSentT = 0;
  const syncLog = [], fx = [];
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const meIdx = () => (mode === "local" && S ? S.turn : cfg.me);
  const isBotTurn = () => mode === "bot" && S && S.turn === 1;
  const myTurn = () => S && S.ph === "aim" && !sim && (mode === "local" || (mode === "bot" ? S.turn === 0 : S.turn === cfg.me && S.auth));
  const pname = (i) => (mode === "local" ? S.names[i] : i === cfg.me ? "Ты" : S.names[i]);

  function newGame() {
    const prev = S, game = prev ? prev.game + 1 : 1;
    const breaker = prev ? 1 - prev.breaker : mode === "online" ? cfg.seed % 2 : 0;
    S = { game, n: 0, b: rack(Math.floor(Math.random() * 4294967295)), turn: breaker, breaker, g: [0, 0], bih: true, brk: true, ph: "aim", win: -1, why: "", msg: "",
      fc: [0, 0], pc: [0, 0], names: cfg.players.map((p) => p.name), wins: prev ? prev.wins.slice() : [0, 0], auth: true };
    sim = null; endShown = false; botJob = null; botAnim = null; remote = null; fx.length = 0;
    $("screen-end").classList.add("hidden");
    send("st", S); onState(true);
  }
  function onState(fresh) {
    cuePos = null; drag = null; placing = null; aimPow = 0;
    if (S.ph === "aim" && S.bih) cuePos = S.b[0] ? S.b[0].slice() : spotFree(S.b, W / 2, S.brk ? HEAD + 80 : L * 0.75, 4);
    if (S.ph === "aim") pointAim();
    if (S.msg && !fresh) msg(S.msg, 1900);
    if (S.ph === "end") { if (!endShown) { endShown = true; setTimeout(showEnd, 1300); } }
    else $("screen-end").classList.add("hidden");
    if (isBotTurn() && S.ph === "aim") botAt = performance.now() + 700 + Math.random() * 500;
    hud();
  }
  function cueXY() { return cuePos || S.b[0]; }
  function pointAim() {
    const c = cueXY(); if (!c) return;
    let bd = 1e18, t = null;
    for (let i = 1; i < 16; i++) { if (!S.b[i] || !legal(S, S.turn, i)) continue; const d = (S.b[i][0] - c[0]) ** 2 + (S.b[i][1] - c[1]) ** 2; if (d < bd) { bd = d; t = S.b[i]; } }
    if (S.brk) t = S.b.find((q, i) => q && i && Math.abs(q[1] - FOOT) < 1 && Math.abs(q[0] - W / 2) < 1) || t;
    if (t) aimAng = Math.atan2(t[1] - c[1], t[0] - c[0]);
  }

  // ---------- удар ----------
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  function makeShot(ang, pow, sx, sy, cp) {
    const sh = { n: S.n, dx: r5(Math.cos(ang)), dy: r5(Math.sin(ang)), p: r5(Math.max(0.02, Math.min(1, pow))), sx: r5(sx || 0), sy: r5(sy || 0) };
    if (S.bih && cp) { sh.cx = q2(cp[0]); sh.cy = q2(cp[1]); }
    return sh;
  }
  function shoot(sh) {
    if (!myTurn() && !(isBotTurn() && !sim)) return;
    send("shot", sh);
    startShot(sh);
  }
  function startShot(sh) {
    sim = newSim(S.b, sh); acc = 0; remote = null; cuePos = null; drag = null; placing = null; botAnim = null;
    sim.shot = sh; sim.onPot = (i, k) => { fx.push({ i, k, t: 0 }); if (i === 0) T.haptic("notify", "error"); else T.haptic("impact", "medium"); };
    spin = { x: 0, y: 0 }; drawSpin();
    T.haptic("impact", sh.p > 0.6 ? "heavy" : "light");
    hud();
  }
  function finishShot() {
    const s = sim; sim = null;
    const nS = judge(S, s);
    if (room && !isHost()) { nS.auth = false; S = nS; onState(false); if (pendingSt) { const ps = pendingSt; pendingSt = null; applySt(ps); } return; }
    nS.auth = true; S = nS; send("st", S);
    onState(false);
  }
  function applySt(s) {
    if (S && s.game === S.game && s.n < S.n) return;
    if (S && sim && s.game === S.game && s.n === S.n + 1) { pendingSt = s; return; }
    const same = S && s.game === S.game && s.n === S.n;
    let diff = 0;
    if (same) for (let i = 0; i < 16; i++) { const a = S.b[i], b = s.b[i]; if (!a !== !b) diff = 1e9; else if (a) diff = Math.max(diff, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
    if (same && !S.auth) syncLog.push({ n: s.n, diff });
    if (S && s.game !== S.game) endShown = false;
    if (sim && !same) sim = null;
    const wasAuth = S && S.auth;
    S = s; S.auth = true; pendingSt = null; dirty = true;
    if (!same || diff > 0) onState(true); else if (!wasAuth) hud();
    if (pendingShot && pendingShot.n === S.n && !sim && S.ph === "aim") { const ps = pendingShot; pendingShot = null; startShot(ps); }
  }

  // ---------- бот ----------
  const LV = [{ ang: 0.055, pw: 0.25, cand: 2, pos: false }, { ang: 0.024, pw: 0.12, cand: 5, pos: true }, { ang: 0.009, pw: 0.06, cand: 12, pos: true }];
  function blocked(b, ax, ay, bx, by, s1, s2) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    for (let i = 0; i < 16; i++) {
      if (i === s1 || i === s2 || !b[i]) continue;
      let t = ((b[i][0] - ax) * dx + (b[i][1] - ay) * dy) / l2; if (t < 0 || t > 1) continue;
      const ex = ax + dx * t - b[i][0], ey = ay + dy * t - b[i][1];
      if (ex * ex + ey * ey < D2 * 0.98) return true;
    }
    return false;
  }
  // геометрия прямых ударов с позиции c (cue) по своим шарам в лузы
  function potShots(St0, p, c) {
    const b = St0.b, res = [];
    for (let i = 1; i < 16; i++) {
      if (!b[i] || !legal(St0, p, i)) continue;
      for (let k = 0; k < 6; k++) {
        const P = PAIM[k], ux0 = P[0] - b[i][0], uy0 = P[1] - b[i][1], dl = Math.hypot(ux0, uy0), ux = ux0 / dl, uy = uy0 / dl;
        if (k >= 2 && k <= 3 && Math.abs(ux) < 0.4) continue;          // в среднюю лузу под острым углом не идёт
        const gx = b[i][0] - ux * 2 * R, gy = b[i][1] - uy * 2 * R, ax0 = gx - c[0], ay0 = gy - c[1], al = Math.hypot(ax0, ay0);
        if (al < 1) continue;
        const ax = ax0 / al, ay = ay0 / al, cut = ax * ux + ay * uy;
        if (cut < 0.3) continue;
        if (blocked(b, c[0], c[1], gx, gy, 0, i) || blocked(b, b[i][0], b[i][1], P[0], P[1], i, 0)) continue;
        const q = cut * cut / (1 + (al + dl * 1.6) / 900);
        const pw = Math.min(0.95, 0.2 + (al * 0.35 + dl) / (1500 * Math.max(cut, 0.45)));
        res.push({ ang: Math.atan2(ay, ax), pw, q, id: i, k });
      }
    }
    return res.sort((a, b) => b.q - a.q);
  }
  function placeSpots(St0, p) {
    const b = St0.b, res = [];
    for (let i = 1; i < 16; i++) {
      if (!b[i] || !legal(St0, p, i)) continue;
      for (let k = 0; k < 6; k++) {
        const P = PAIM[k], ux0 = P[0] - b[i][0], uy0 = P[1] - b[i][1], dl = Math.hypot(ux0, uy0), ux = ux0 / dl, uy = uy0 / dl;
        if (k >= 2 && k <= 3 && Math.abs(ux) < 0.5) continue;
        if (blocked(b, b[i][0], b[i][1], P[0], P[1], i, 0)) continue;
        for (const d of [60, 120]) {
          for (const off of [0, 0.25, -0.25]) {
            const vx = ux * Math.cos(off) - uy * Math.sin(off), vy = ux * Math.sin(off) + uy * Math.cos(off);
            const x = b[i][0] - ux * 2 * R - vx * d, y = b[i][1] - uy * 2 * R - vy * d;
            if (!okPlace(St0, x, y) || blocked(b, x, y, b[i][0] - ux * 2 * R, b[i][1] - uy * 2 * R, 0, i)) continue;
            res.push({ c: [x, y], q: (1 - Math.abs(off)) / (1 + dl / 900) + (off === 0 ? 0.1 : 0) });
          }
        }
      }
    }
    return res.sort((a, b) => b.q - a.q);
  }
  function posValue(S2, p) { const c = S2.b[0]; if (!c) return 0; const ps = potShots(S2, p, c); return ps.length ? ps[0].q + Math.min(ps.length, 5) * 0.05 : 0; }
  function planBot(St0, p, lvl) {
    const cfgL = LV[lvl], cands = [];
    if (St0.brk) {
      const apex = St0.b.find((q, i) => q && i && Math.abs(q[1] - FOOT) < 1 && Math.abs(q[0] - W / 2) < 1) || [W / 2, FOOT];
      const c = [W / 2 + (Math.random() - 0.5) * 120, HEAD + 60 + Math.random() * 60];
      const ang = Math.atan2(apex[1] - c[1], apex[0] + (Math.random() - 0.5) * 6 - c[0]);
      return { list: [{ ang, pw: lvl === 0 ? 0.8 : 0.97, c, sy: 0 }], i: 0, best: { ang, pw: lvl === 0 ? 0.8 : 0.97, c, sy: 0, sc: 0 }, p, lvl, St0 };
    }
    const spots = St0.bih ? placeSpots(St0, p).slice(0, lvl === 2 ? 5 : 3).map((s) => s.c) : [St0.b[0]];
    if (St0.bih && !spots.length) spots.push(cuePos || St0.b[0] || spotFree(St0.b, W / 2, HEAD, 4));
    for (const c of spots) {
      const ps = potShots(St0, p, c).slice(0, Math.ceil(cfgL.cand / spots.length) + 1);
      for (const s of ps) {
        cands.push({ ang: s.ang, pw: s.pw, c, sy: 0 });
        cands.push({ ang: s.ang, pw: Math.min(1, s.pw * 1.35), c, sy: 0 });
        if (lvl >= 1) cands.push({ ang: s.ang, pw: s.pw, c, sy: -0.5 });
        if (lvl === 2) { cands.push({ ang: s.ang, pw: s.pw * 0.8, c, sy: 0.5 }); cands.push({ ang: s.ang, pw: Math.min(1, s.pw * 1.7), c, sy: 0 }); }
      }
      // безопасные удары: прямо в свои шары
      for (let i = 1; i < 16; i++) {
        if (!St0.b[i] || !legal(St0, p, i)) continue;
        const a = Math.atan2(St0.b[i][1] - c[1], St0.b[i][0] - c[0]);
        cands.push({ ang: a, pw: 0.35, c, sy: 0, safe: 1 });
        if (lvl > 0) { cands.push({ ang: a + 0.04, pw: 0.5, c, sy: 0, safe: 1 }); cands.push({ ang: a - 0.04, pw: 0.5, c, sy: 0, safe: 1 }); }
      }
      if (lvl === 2) for (let k = 0; k < 10; k++) cands.push({ ang: Math.random() * 6.283, pw: 0.45 + Math.random() * 0.4, c, sy: 0, safe: 1 });
    }
    return { list: cands, i: 0, best: null, p, lvl, St0 };
  }
  function scoreShot(job, cd, s) {
    const St0 = job.St0, S2 = judge(St0, s), p = job.p;
    if (S2.ph === "end") return S2.win === p ? 5000 : -5000;
    let sc = 0;
    if (S2.fc[p] > St0.fc[p]) sc -= 400;
    if (S2.turn === p) sc += 300 + (LV[job.lvl].pos ? posValue(S2, p) * 150 : 0) + (S2.pc[p] - St0.pc[p]) * 40;
    else if (job.lvl === 2) sc -= posValue(Object.assign({}, S2, { bih: false }), 1 - p) * 120;
    return sc + Math.random() * 5;
  }
  // перебор кандидатов кусками по времени (и внутри одной симуляции), чтобы не было рывков кадров
  function botWork(job, budget) {
    const t0 = performance.now();
    while (job.i < job.list.length) {
      const cd = job.list[job.i];
      if (!job.cur) {
        const sh = { n: job.St0.n, dx: Math.cos(cd.ang), dy: Math.sin(cd.ang), p: cd.pw, sx: 0, sy: cd.sy };
        if (job.St0.bih) { sh.cx = cd.c[0]; sh.cy = cd.c[1]; }
        job.cur = newSim(job.St0.b, sh);
      }
      const s = job.cur;
      while (!s.done && s.steps < 480 * 10) { step(s); if ((s.steps & 63) === 0 && performance.now() - t0 > budget) return false; }
      s.done = true; job.cur = null; job.i++;
      cd.sc = scoreShot(job, cd, s);
      if (!job.best || cd.sc > job.best.sc) job.best = cd;
      if (performance.now() - t0 > budget) break;
    }
    return job.i >= job.list.length;
  }
  function botFinal(job) {
    const b = job.best, L0 = LV[job.lvl];
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    return { ang: b.ang + g() * L0.ang * (job.St0.brk ? 0.5 : 1), pw: Math.max(0.05, Math.min(1, b.pw * (1 + g() * L0.pw))), sy: b.sy || 0, c: b.c };
  }
  function selfPlay(l0, l1, maxShots) {     // для тестов: партия бот против бота без анимации
    let G = { game: 1, n: 0, b: rack(Math.floor(Math.random() * 4294967295)), turn: 0, breaker: 0, g: [0, 0], bih: true, brk: true, ph: "aim", win: -1, why: "", msg: "", fc: [0, 0], pc: [0, 0], names: ["A", "B"], wins: [0, 0] };
    const lv = [l0, l1]; let att = [0, 0];
    while (G.ph === "aim" && G.n < (maxShots || 150)) {
      const job = planBot(G, G.turn, lv[G.turn]); while (!botWork(job, 1e9)); const f = botFinal(job);
      const sh = { n: G.n, dx: r5(Math.cos(f.ang)), dy: r5(Math.sin(f.ang)), p: r5(f.pw), sx: 0, sy: r5(f.sy) };
      if (G.bih) { const c = f.c || G.b[0] || spotFree(G.b, W / 2, HEAD + 80, 4); sh.cx = q2(c[0]); sh.cy = q2(c[1]); }
      att[G.turn]++; G = judge(G, runSim(G.b, sh));
    }
    return { n: G.n, win: G.win, why: G.why, pc: G.pc, fc: G.fc, att };
  }
  function autoShotNow(lvl) {     // для тестов: сразу ударить за себя лучшим ударом
    if (!myTurn()) return false;
    const job = planBot(S, S.turn, lvl == null ? 2 : lvl); while (!botWork(job, 1e9)); const f = botFinal(job);
    shoot(makeShot(f.ang, f.pw, 0, f.sy, f.c)); return true;
  }

  // ---------- сеть ----------
  function bindRoom() {
    ["st", "shot", "aim", "left", "host-left", "start"].forEach((t) => room.off(t));
    room.on("st", (s) => { if (!isHost()) applySt(s); });
    room.on("shot", (d, from) => {
      if (!S) return;
      if (isHost()) { if (S.ph === "aim" && !sim && d.n === S.n && cfg.players[S.turn].id === from) startShot(d); return; }
      if (d.n === S.n && !sim && S.ph === "aim" && S.turn !== cfg.me) startShot(d); else if (d.n > S.n || sim) pendingShot = d;
    });
    room.on("aim", (d) => { if (S && !sim && S.turn !== cfg.me && d.n === S.n) remote = { a: d.a, p: d.p, c: d.c, ta: d.a, t: performance.now() }; });
    room.on("left", () => { msg("Соперник вышел 😕", 3000); $("status").textContent = "Соперник вышел из игры"; });
    room.on("host-left", () => { msg("Хозяин вышел 😕", 3000); $("status").textContent = "Хозяин вышел из игры"; });
  }
  // гость: свою отправку удара хозяин перешлёт обратно — игнорируем по номеру
  setInterval(() => { if (room && isHost() && S && !sim) send("st", S); }, 3000);

  // ---------- конец ----------
  function showEnd() {
    if (!S || S.ph !== "end") return;
    const meWin = mode === "local" ? true : S.win === cfg.me;
    St.gameEnd({ win: mode === "local" ? null : meWin, mode, level: mode === "bot" ? level : undefined, shots: S.n, pots: S.pc[meIdx()], fouls: S.fc[meIdx()] });
    T.haptic("notify", meWin ? "success" : "error");
    $("end-emoji").textContent = mode === "local" ? "🏆" : meWin ? "🏆" : "🎱";
    $("end-title").textContent = mode === "local" ? `Победил ${S.names[S.win]}!` : meWin ? "Победа!" : "Поражение";
    const why = `${pname(S.last)}: ${S.why}`;
    const row = (i) => `<div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(mode === "local" ? S.names[i] : i === cfg.me ? "Ты" : S.names[i])}</span><b>🎱 ${S.pc[i]} · фолы ${S.fc[i]} · победы ${S.wins[i]}</b></div>`;
    $("end-sub").innerHTML = `<p style="margin:4px 0 8px">${esc(why)} · ударов: ${S.n}</p>${row(0)}${row(1)}`;
    const box = $("end-buttons"); box.innerHTML = "";
    const b = (l, c, f) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); };
    if (isHost()) b("🔁 Ещё партия", "primary", () => newGame()); else b("Ждём хозяина…", "", () => {});
    b("Выйти", "ghost", toMenu);
    $("screen-end").classList.remove("hidden");
  }
  function toMenu() {
    if (room) room.close(); room = null; S = null; sim = null; cfg = null;
    ["hud", "bar", "screen-end"].forEach((s) => $(s).classList.add("hidden")); $("screen-menu").classList.remove("hidden");
  }

  // ---------- HUD ----------
  let msgT = 0;
  function msg(t, ms) { const el = $("msg"); el.textContent = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }
  function ballIcon(i, off) {
    const c = bcol(i), bg = i > 8 ? `linear-gradient(#fff 0 27%, ${c} 27% 73%, #fff 73%)` : c;
    return `<i class="bi ${off ? "off" : ""}" style="background:${bg}"></i>`;
  }
  function hud() {
    dirty = true;
    if (!S) return;
    for (let p = 0; p < 2; p++) {
      const el = $("pl" + p), g = S.g[p];
      el.classList.toggle("on", S.ph === "aim" && S.turn === p);
      el.querySelector(".nm span").textContent = pname(p);
      el.querySelector(".nm small").textContent = S.ph === "aim" && S.turn === p ? (sim ? "бьёт" : "ходит") : "";
      let h = "";
      if (!g) h = "стол открыт";
      else { const ids = g === 1 ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]; h = ids.map((i) => ballIcon(i, !S.b[i])).join(""); if (!left(S.b, g)) h += ballIcon(8, !S.b[8]); }
      el.querySelector(".bl").innerHTML = h;
    }
    status();
  }
  let lastStatus = null;
  function status() {
    let t = "";
    if (!S) t = "Подключаемся…";
    else if (S.ph === "end") t = "Партия окончена";
    else if (sim) t = S.turn === meIdx() || mode === "local" ? "" : `Бьёт ${pname(S.turn)}…`;
    else if (myTurn()) {
      const who = mode === "local" ? `${S.names[S.turn]}: ` : "";
      const g = S.g[S.turn], tgt = !g ? "" : left(S.b, g) ? ` (${GNAME[g]})` : " — бей восьмёрку!";
      t = S.brk ? `${who}Разбой! Двигай биток за линией, потом тяни назад и отпусти` : S.bih ? `${who}Шар с руки: перетащи биток, потом тяни для удара${tgt}` : `${who}Тяни назад и отпусти${tgt}`;
    } else if (isBotTurn()) t = "🤖 Бот прицеливается…";
    else if (mode === "online" && !S.auth) t = "Сверяем позиции…";
    else t = `Ходит ${pname(S.turn)} — смотри его прицел`;
    if (t !== lastStatus) { lastStatus = t; $("status").textContent = t; }
  }

  // ---------- графика ----------
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let SW, SH, DPR, sc = 1, ox = 0, oy = 0, tableImg = null, sprites = [], dirty = true;
  const bg = $("bg"), bctx = bg.getContext("2d");
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); SW = innerWidth; SH = innerHeight; canvas.width = bg.width = SW * DPR; canvas.height = bg.height = SH * DPR; dirty = true;
    const top = $("hud").classList.contains("hidden") ? 64 : $("hud").getBoundingClientRect().bottom + 2;
    const bot = $("bar").classList.contains("hidden") ? SH - 56 : $("bar").getBoundingClientRect().top - 2;
    const aw = SW - 6, ah = bot - top;
    sc = Math.min(aw / (W + 2 * FR), ah / (L + 2 * FR));
    ox = (SW - W * sc) / 2; oy = top + (ah - (L + 2 * FR) * sc) / 2 + FR * sc;
    buildTable(); buildSprites();
  }
  function buildTable() {
    const c = document.createElement("canvas"), w = Math.ceil((W + 2 * FR) * sc * DPR), h = Math.ceil((L + 2 * FR) * sc * DPR);
    c.width = w; c.height = h; const g = c.getContext("2d");
    g.setTransform(sc * DPR, 0, 0, sc * DPR, FR * sc * DPR, FR * sc * DPR);
    // дерево
    const rr = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fill(); };
    g.fillStyle = "#5b3416"; rr(-FR, -FR, W + 2 * FR, L + 2 * FR, 22);
    g.fillStyle = "#7a4a22"; rr(-FR + 5, -FR + 5, W + 2 * FR - 10, L + 2 * FR - 10, 18);
    // ромбики
    g.fillStyle = "#f5e6c8";
    const dm = (x, y) => { g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 3, y); g.lineTo(x, y + 4); g.lineTo(x - 3, y); g.fill(); };
    for (let k = 1; k < 4; k++) { dm(W * k / 4, -FR + 14); dm(W * k / 4, L + FR - 14); }
    for (let k = 1; k < 8; k++) { if (k === 4) continue; dm(-FR + 14, L * k / 8); dm(W + FR - 14, L * k / 8); }
    // сукно до бортов
    g.fillStyle = "#0f7a43"; g.fillRect(-CUSH, -CUSH, W + 2 * CUSH, L + 2 * CUSH);
    // лузы
    for (const p of POCK) { g.fillStyle = "#0a0a0a"; g.beginPath(); g.arc(p[0], p[1], p[2] + 2, 0, 7); g.fill(); g.strokeStyle = "#2a1a0c"; g.lineWidth = 3; g.stroke(); }
    // борта (резина) — трапеции по сегментам
    g.fillStyle = "#0a5c32";
    const cush = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]); g.closePath(); g.fill(); };
    const T1 = [CM, 0, W - CM, 0, W - CM + 12, -CUSH, CM - 12, -CUSH];
    cush(T1); cush([CM, L, W - CM, L, W - CM + 12, L + CUSH, CM - 12, L + CUSH]);
    const S1 = [0, CM, 0, L / 2 - SM, -CUSH, L / 2 - SM + 4, -CUSH, CM - 12];
    const S2 = [0, L / 2 + SM, 0, L - CM, -CUSH, L - CM + 12, -CUSH, L / 2 + SM - 4];
    cush(S1); cush(S2); cush(S1.map((v, k) => (k % 2 ? v : W - v))); cush(S2.map((v, k) => (k % 2 ? v : W - v)));
    g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 2;
    for (const s of SEG) { if (s[2] && s[3]) continue; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[0] + s[2], s[1] + s[3]); g.stroke(); }
    // сукно: лёгкий градиент
    const gr = g.createRadialGradient(W / 2, L / 2, 50, W / 2, L / 2, L * 0.65); gr.addColorStop(0, "rgba(255,255,255,.07)"); gr.addColorStop(1, "rgba(0,0,0,.12)");
    g.fillStyle = gr; g.fillRect(0, 0, W, L);
    g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, HEAD); g.lineTo(W, HEAD); g.stroke();
    g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.arc(W / 2, FOOT, 2.5, 0, 7); g.arc(W / 2, HEAD, 2.5, 0, 7); g.fill();
    tableImg = c;
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0); bctx.fillStyle = "#10241a"; bctx.fillRect(0, 0, SW, SH);
    bctx.drawImage(c, ox - FR * sc, oy - FR * sc, c.width / DPR, c.height / DPR);
  }
  function buildSprites() {
    const pr = R * sc * DPR, size = Math.ceil(pr * 2 + 6);
    sprites = [];
    for (let i = 0; i < 16; i++) {
      const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"), m = size / 2;
      g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.arc(m + pr * 0.18, m + pr * 0.22, pr, 0, 7); g.fill();
      g.save(); g.beginPath(); g.arc(m, m, pr, 0, 7); g.clip();
      g.fillStyle = i > 8 ? "#f8fafc" : bcol(i); g.fillRect(0, 0, size, size);
      if (i > 8) { g.fillStyle = bcol(i); g.fillRect(0, m - pr * 0.55, size, pr * 1.1); }
      const sh = g.createRadialGradient(m - pr * 0.4, m - pr * 0.45, pr * 0.1, m, m, pr * 1.1); sh.addColorStop(0, "rgba(255,255,255,.45)"); sh.addColorStop(0.5, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,.35)");
      g.fillStyle = sh; g.fillRect(0, 0, size, size);
      g.restore();
      if (i > 0) {
        g.fillStyle = "#fff"; g.beginPath(); g.arc(m, m, pr * 0.46, 0, 7); g.fill();
        g.fillStyle = "#111"; g.font = `900 ${Math.round(pr * (i > 9 ? 0.56 : 0.66))}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i), m, m + pr * 0.04);
      } else { g.fillStyle = "rgba(220,38,38,.55)"; g.beginPath(); g.arc(m, m, pr * 0.12, 0, 7); g.fill(); }
      g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = Math.max(1, pr * 0.07); g.beginPath(); g.arc(m, m, pr, 0, 7); g.stroke();
      sprites.push(c);
    }
  }
  const sx = (x) => ox + x * sc, sy = (y) => oy + y * sc;
  function castBalls(b, ox0, oy0, dx, dy, skip) {
    let bt = Infinity, id = -1;
    for (let i = 0; i < 16; i++) {
      if (i === skip || !b[i]) continue;
      const mx = b[i][0] - ox0, my = b[i][1] - oy0, pr = mx * dx + my * dy; if (pr <= 0) continue;
      const pp = mx * mx + my * my - pr * pr; if (pp >= D2) continue;
      const t = pr - Math.sqrt(D2 - pp); if (t < bt) { bt = t; id = i; }
    }
    return { t: bt, id };
  }
  function castRail(x, y, dx, dy) {
    const tx = dx > 1e-9 ? (W - R - x) / dx : dx < -1e-9 ? (R - x) / dx : Infinity, ty = dy > 1e-9 ? (L - R - y) / dy : dy < -1e-9 ? (R - y) / dy : Infinity;
    return tx < ty ? { t: Math.max(0, tx), ax: 0 } : { t: Math.max(0, ty), ax: 1 };
  }
  function drawAim(c, ang, pow, alpha, full) {
    const b = S.b, dx = Math.cos(ang), dy = Math.sin(ang);
    ctx.globalAlpha = alpha; ctx.lineCap = "round";
    // кий
    const back = R + 5 + pow * 80;
    const k0x = c[0] - dx * back, k0y = c[1] - dy * back, k1x = c[0] - dx * (back + 330), k1y = c[1] - dy * (back + 330);
    ctx.strokeStyle = "#3b2410"; ctx.lineWidth = 7.5 * sc; ctx.beginPath(); ctx.moveTo(sx(k0x - dx * 30), sy(k0y - dy * 30)); ctx.lineTo(sx(k1x), sy(k1y)); ctx.stroke();
    ctx.strokeStyle = "#e0b47a"; ctx.lineWidth = 5.5 * sc; ctx.beginPath(); ctx.moveTo(sx(k0x), sy(k0y)); ctx.lineTo(sx(k0x - dx * 200), sy(k0y - dy * 200)); ctx.stroke();
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 5.5 * sc; ctx.beginPath(); ctx.moveTo(sx(k0x), sy(k0y)); ctx.lineTo(sx(k0x - dx * 7), sy(k0y - dy * 7)); ctx.stroke();
    // линия прицела
    const bb = b.slice(); bb[0] = c;
    let x = c[0], y = c[1], ddx = dx, ddy = dy;
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2;
    for (let seg = 0; seg < 2; seg++) {
      const hb = castBalls(bb, x, y, ddx, ddy, 0), hr = castRail(x, y, ddx, ddy);
      const t = Math.min(hb.t, hr.t, seg ? 260 : 2000);
      if (seg) ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(sx(x), sy(y)); ctx.lineTo(sx(x + ddx * t), sy(y + ddy * t)); ctx.stroke(); ctx.setLineDash([]);
      if (hb.t <= hr.t && hb.t <= t) {
        const gx = x + ddx * hb.t, gy = y + ddy * hb.t, o = bb[hb.id];
        ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.beginPath(); ctx.arc(sx(gx), sy(gy), R * sc, 0, 7); ctx.stroke();
        const nx = (o[0] - gx) / (2 * R), ny = (o[1] - gy) / (2 * R), ok = legal(S, S.turn, hb.id) || S.brk;
        if (full) {
          const len = 60 + 170 * Math.max(0.25, ddx * nx + ddy * ny);
          ctx.strokeStyle = ok ? "rgba(255,230,90,.95)" : "rgba(255,90,90,.95)"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(sx(o[0]), sy(o[1])); ctx.lineTo(sx(o[0] + nx * len), sy(o[1] + ny * len)); ctx.stroke();
          const dt = ddx * nx + ddy * ny, tx = ddx - dt * nx, ty = ddy - dt * ny, tl = Math.hypot(tx, ty);
          if (tl > 0.05) { ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx(gx), sy(gy)); ctx.lineTo(sx(gx + tx / tl * 70 * tl), sy(gy + ty / tl * 70 * tl)); ctx.stroke(); }
        }
        if (!ok) { ctx.strokeStyle = "rgba(255,90,90,.95)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx(o[0]), sy(o[1]), (R + 3) * sc, 0, 7); ctx.stroke(); }
        break;
      }
      x += ddx * t; y += ddy * t;
      if (hr.ax === 0) ddx = -ddx; else ddy = -ddy;
      ctx.strokeStyle = "rgba(255,255,255,.55)";
    }
    ctx.globalAlpha = 1;
  }
  function drawBall(i, x, y, scale) {
    const s = sprites[i], w = s.width / DPR * (scale || 1);
    ctx.drawImage(s, sx(x) - w / 2, sy(y) - w / 2, w, w);
  }
  function render(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, SW, SH);
    if (!S) return;
    // эффекты лунок
    for (let k = fx.length - 1; k >= 0; k--) { const e = fx[k]; e.t += dt; if (e.t > 0.3) { fx.splice(k, 1); continue; } const p = POCK[e.k]; drawBall(e.i, p[0], p[1], 1 - e.t / 0.3); }
    if (sim) { for (let i = 1; i < 16; i++) if (sim.on[i]) drawBall(i, sim.x[i], sim.y[i]); if (sim.on[0]) drawBall(0, sim.x[0], sim.y[0]); }
    else {
      for (let i = 1; i < 16; i++) if (S.b[i]) drawBall(i, S.b[i][0], S.b[i][1]);
      let c = cueXY();
      if (!myTurn() && remote && remote.c) c = remote.c;
      if (!myTurn() && botAnim && botAnim.c) c = botAnim.c;
      if (c) {
        if (S.ph === "aim" && S.bih && (myTurn() || remote || botAnim)) {
          ctx.strokeStyle = placing ? "rgba(255,230,90,.95)" : "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.arc(sx(c[0]), sy(c[1]), (R + 9) * sc, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          if (S.brk && myTurn()) { ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.fillRect(sx(0), sy(HEAD), W * sc, (L - HEAD) * sc); }
          if (myTurn() && !drag) { ctx.font = `${Math.round(16 * Math.max(1, sc * 1.4))}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("✋", sx(c[0] + R + 12), sy(c[1] + R + 10)); }
        }
        drawBall(0, c[0], c[1]);
        if (S.ph === "aim" && !placing) {
          if (myTurn() && !isBotTurn()) drawAim(c, aimAng, aimPow, 1, true);
          else if (botAnim) drawAim(c, botAnim.a, botAnim.p, 0.6, false);
          else if (remote) { remote.a += angDiff(remote.ta, remote.a) * Math.min(1, dt * 10); drawAim(c, remote.a, remote.p, 0.55, false); }
        }
      }
    }
    // сила
    if (drag && aimPow > 0) {
      const bx = SW - 16, bh = Math.min(260, SH * 0.32), by = SH / 2 - bh / 2;
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(bx - 7, by - 3, 14, bh + 6);
      ctx.fillStyle = aimPow > 0.8 ? "#ef4444" : aimPow > 0.5 ? "#f59e0b" : "#22c55e"; ctx.fillRect(bx - 4, by + bh * (1 - aimPow), 8, bh * aimPow);
      ctx.fillStyle = "#fff"; ctx.font = "900 13px sans-serif"; ctx.textAlign = "right"; ctx.fillText(Math.round(aimPow * 100) + "%", bx - 10, by + bh * (1 - aimPow) + 5);
    }
  }
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  // ---------- ввод ----------
  const toW = (x, y) => [(x - ox) / sc, (y - oy) / sc];
  let pid = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!myTurn() || isBotTurn() || pid !== null) return;
    pid = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const w = toW(e.clientX, e.clientY), c = cueXY();
    if (S.bih && c && Math.hypot(w[0] - c[0], w[1] - c[1]) < Math.max(R * 3, 40 / sc)) { placing = { dx: c[0] - w[0], dy: c[1] - w[1] }; return; }
    drag = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), base: aimAng, armed: false };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    if (placing) {
      const w = toW(e.clientX, e.clientY), x = Math.max(R, Math.min(W - R, w[0] + placing.dx)), y = Math.max(S.brk ? HEAD : R, Math.min(L - R, w[1] + placing.dy));
      if (okPlace(S, x, y)) cuePos = [x, y]; sendAim(); return;
    }
    if (!drag) return;
    const now = performance.now(), vx = drag.sx - e.clientX, vy = drag.sy - e.clientY, len = Math.hypot(vx, vy);
    const mv = Math.hypot(e.clientX - drag.lx, e.clientY - drag.ly), spd = mv / Math.max(1, now - drag.lt);
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now;
    const maxPull = Math.min(260, SH * 0.3);
    aimPow = Math.max(0, Math.min(1, (len - 14) / maxPull));
    if (len > 18) {
      const raw = Math.atan2(vy, vx);
      if (!drag.armed) { drag.armed = true; aimAng = raw; }
      else { const k = Math.max(0.1, Math.min(1, spd / 0.9)); aimAng += angDiff(raw, aimAng) * k; }
    }
    sendAim();
  });
  const up = (e) => {
    if (e.pointerId !== pid) return; pid = null; dirty = true;
    if (placing) { placing = null; sendAim(true); return; }
    if (!drag) return; drag = null;
    if (aimPow >= 0.03 && myTurn()) shoot(makeShot(aimAng, aimPow, spin.x, -spin.y, cuePos)); else { aimPow = 0; sendAim(true); }
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  function sendAim(force) {
    if (!room || !myTurn()) return;
    const now = performance.now(); if (!force && now - aimSentT < 180) return; aimSentT = now;
    const c = cueXY();
    room.sendFast("aim", { n: S.n, a: +aimAng.toFixed(4), p: +aimPow.toFixed(2), c: c ? [q2(c[0]), q2(c[1])] : null });
  }
  // клавиатура: ←/→ поворот (Shift — точно), ↑/↓ сила, пробел — удар
  const keys = {};
  addEventListener("keydown", (e) => {
    keys[e.code] = 1;
    if (!S || !myTurn() || isBotTurn()) return;
    if (e.code === "Space" && aimPow >= 0.03) { shoot(makeShot(aimAng, aimPow, spin.x, -spin.y, cuePos)); aimPow = 0; }
  });
  addEventListener("keyup", (e) => { keys[e.code] = 0; });
  function keyAim(dt) {
    if (!S || !myTurn() || isBotTurn()) return;
    const r = (keys.ShiftLeft || keys.ShiftRight ? 0.08 : 0.9) * dt;
    if (keys.ArrowLeft || keys.KeyA) { aimAng -= r; sendAim(); } if (keys.ArrowRight || keys.KeyD) { aimAng += r; sendAim(); }
    if (keys.ArrowUp || keys.KeyW) aimPow = Math.min(1, aimPow + dt * 0.6); if (keys.ArrowDown || keys.KeyS) aimPow = Math.max(0, aimPow - dt * 0.6);
  }
  // винт
  const spinEl = $("spin");
  function drawSpin() { dirty = true; spinEl.querySelector("i").style.transform = `translate(${spin.x * 15}px, ${spin.y * 15}px)`; }
  function setSpin(e) { const r = spinEl.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 0.85) { x *= 0.85 / l; y *= 0.85 / l; } if (l < 0.15) { x = 0; y = 0; } spin = { x: +x.toFixed(2), y: +y.toFixed(2) }; drawSpin(); }
  let spinDown = false;
  spinEl.addEventListener("pointerdown", (e) => { spinDown = true; try { spinEl.setPointerCapture(e.pointerId); } catch (_) {} setSpin(e); });
  spinEl.addEventListener("pointermove", (e) => { if (spinDown) setSpin(e); });
  spinEl.addEventListener("pointerup", () => { spinDown = false; });
  spinEl.addEventListener("dblclick", () => { spin = { x: 0, y: 0 }; drawSpin(); });

  // ---------- цикл ----------
  let last = 0, hudT = 0;
  window.__auto = false;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (S) {
      if (sim) {
        acc += dt; let n = 0;
        while (acc >= DT && !sim.done && n < 60) { step(sim); acc -= DT; n++; }
        if (sim.done) finishShot();
      } else if (S.ph === "aim") {
        keyAim(dt);
        if (isBotTurn()) {
          if (!botJob && ts >= botAt && botAt) { botJob = planBot(S, 1, level); botAt = 0; }
          if (botJob && !botAnim) { if (botWork(botJob, 4)) { const f = botFinal(botJob); botAnim = { a: aimAng, ta: f.ang, p: 0, f, t: 0, c: f.c || cueXY() }; botJob = null; } }
          if (botAnim) {
            const A = botAnim; A.t += dt;
            A.a += angDiff(A.ta, A.a) * Math.min(1, dt * 6); A.p = Math.min(A.f.pw, A.t > 0.5 ? (A.t - 0.5) * 1.2 : 0);
            if (A.t > 1.1 + A.f.pw * 0.4) { const f = A.f; aimAng = f.ang; shoot(makeShot(f.ang, f.pw, 0, f.sy, f.c)); }
          }
        } else if (window.__auto && myTurn() && ts > (window.__autoAt || 0)) { window.__autoAt = ts + 400; autoShotNow(window.__auto === true ? 2 : window.__auto); }
      }
      hudT -= dt; if (hudT <= 0) { hudT = 0.25; status(); }
    }
    // перерисовываем слой шаров только когда что-то меняется
    if (dirty || sim || fx.length || drag || placing || botAnim || remote || Object.keys(keys).some((k) => keys[k])) { dirty = false; render(dt); }
    requestAnimationFrame(frame);
  }

  // ---------- старт ----------
  function begin(c, m) {
    room = c.room; cfg = c.cfg; mode = m; S = null; sim = null; pendingSt = null; pendingShot = null; endShown = false; botJob = null; botAnim = null; remote = null;
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    ["hud", "bar"].forEach((s) => $(s).classList.remove("hidden"));
    resize();
    if (room) bindRoom();
    St.gameStart({ mode, level: mode === "bot" ? level : undefined, players: 2 });
    if (isHost()) newGame(); else status();
  }
  const PARTY = { title: "Бильярд", icon: "🎱", max: 2, noBots: true, minHumans: 2, text: "Го в бильярд 🎱 Сыграем в восьмёрку!",
    modes: [{ id: "8ball", name: "Восьмёрка" }], onCancel: () => $("screen-menu").classList.remove("hidden") };
  const LVN = ["Лёгкий", "Средний", "Мастер"];
  try { const v = +localStorage.getItem("bilyard_lvl"); if (v >= 0 && v <= 2) level = v; } catch (_) {}
  const chips = () => document.querySelectorAll("#c-lvl .chip").forEach((b) => b.classList.toggle("on", +b.dataset.v === level));
  document.querySelectorAll("#c-lvl .chip").forEach((b) => b.onclick = () => { level = +b.dataset.v; chips(); try { localStorage.setItem("bilyard_lvl", level); } catch (_) {} });
  chips();
  $("m-bots").onclick = () => {
    const nm = T.playerName && T.playerName() !== "Друг" ? T.playerName() : "Ты";
    begin({ room: null, cfg: { me: 0, seed: Math.floor(Math.random() * 1e9), players: [{ id: "me", name: nm }, { id: "bot", name: `🤖 Бот · ${LVN[level]}`, bot: true }] } }, "bot");
  };
  $("m-local").onclick = () => begin({ room: null, cfg: { me: 0, seed: 1, players: [{ id: "a", name: "Игрок 1" }, { id: "b", name: "Игрок 2" }] } }, "local");
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("bilyard", PARTY), "online"); };
  $("m-menu").onclick = () => { location.href = "../"; };
  addEventListener("resize", () => { resize(); });
  T.init({ header: "#10241a", bg: "#10241a", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("bilyard", inv, PARTY).then((c) => begin(c, "online")); }
  resize();
  requestAnimationFrame(frame);
  window.__game = { get S() { return S; }, get sim() { return sim; }, get cfg() { return cfg; }, get mode() { return mode; }, syncLog,
    myTurn, autoShotNow, selfPlay, runSim, judge, rack, shoot: (a, p, sx, sy) => shoot(makeShot(a, p, sx, sy, cuePos)), get aim() { return { ang: aimAng, pow: aimPow }; } };
})();
