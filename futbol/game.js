/* Футбол машинками — вид сверху, вертикальное поле, ворота сверху и снизу. 1 на 1 и 2 на 2, пустые места — боты.
   Каждый сам двигает свою машину и шлёт позицию/скорость/угол ~15 Гц. Мяч, голы, бочки ускорения и время считает хозяин,
   клиенты рисуют мяч по своей симуляции с экстраполяцией и мягкой коррекцией; свои касания мяча клиент считает сам и шлёт хозяину. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  // поле
  const AW = 600, AH = 980, CX = AW / 2, HW = 94, GD = 62, CR = 96, PR = 7;
  // мяч и машины
  const BR = 19, BMAXV = 1150, CARR = 18, CL = 10, CW = 14;
  const MAXV = 380, ACC = 720, BACC = 950, BMAX = 640, TURN = 4.6, BUSE = 34, BREG = 7;
  const DURATION = 120, OT = 30;
  const PADS = [[52, AH / 2], [AW - 52, AH / 2], [105, 175], [AW - 105, 175], [105, AH - 175], [AW - 105, AH - 175]];
  const TCOL = [["#2563eb", "#0891b2", "#7c3aed"], ["#dc2626", "#ea580c", "#db2777"]];

  const canvas = $("game"), ctx = canvas.getContext("2d", { alpha: false }), bgc = document.createElement("canvas"), bg = bgc.getContext("2d", { alpha: false });
  let W, H, DPR, z = 0.6, follow = false, off = null, offQ = 0;
  function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; canvas.width = bgc.width = Math.round(W * DPR); canvas.height = bgc.height = Math.round(H * DPR); bgKey = ""; layout(); }
  addEventListener("resize", resize);

  let room = null, cfg = null, phase = "menu", ended = false, gt = 0, st = "kick", stT = 0, ot = false;
  let C = [], ball = { x: CX, y: AH / 2, vx: 0, vy: 0, rot: 0 }, score = [0, 0], G = [], OG = [], TH = [], lastTouch = -1, touchCd = [], teamTouch = [[-1, -9], [-1, -9]];
  let pads = PADS.map(() => 0), padMask = 63, bv = 0, waitV = 0, waitT = 0, corrX = 0, corrY = 0, hitSendT = 0;
  let fx = [], skid = [], shake = 0, flip = false;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const team = (i) => cfg.players[i].team;
  const pname = (i) => (i === cfg.me ? "Ты" : cfg.players[i].name);
  const local = (i) => i === cfg.me || (isHost() && cfg.players[i].bot);
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const now = () => performance.now();

  // ---------- состав: добиваем команды ботами ----------
  function normalize(c, meId) {
    const humans = c.players.filter((p) => !p.bot);
    const per = Math.min(3, Math.max(c.mode === "1v1" ? 1 : 2, Math.ceil(humans.length / 2)));
    const tm = [[], []];
    humans.forEach((p) => { let t = (p.team || 0) % 2; if (tm[t].length >= per) t = 1 - t; tm[t].push(Object.assign({}, p, { team: t })); });
    let k = 0;
    for (let t = 0; t < 2; t++) while (tm[t].length < per) { tm[t].push({ id: "bot" + k, name: "🤖 Бот " + (k + 1), bot: true, team: t }); k++; }
    const players = tm[0].concat(tm[1]);
    players.forEach((p) => { const s = players.filter((q) => q.team === p.team).indexOf(p); p.slot = s; p.color = TCOL[p.team][s]; });
    return Object.assign({}, c, { teams: 2, players, me: Math.max(0, players.findIndex((p) => p.id === meId)) });
  }
  function slotPos(i) {
    const p = cfg.players[i], n = cfg.players.filter((q) => q.team === p.team).length;
    const L = n === 1 ? [[CX, AH / 2 + 250]] : [[CX - 130, AH / 2 + 205], [CX + 75, AH / 2 + 335], [CX, AH - 110]];
    let [x, y] = L[p.slot] || L[0];
    if (p.team === 1) { x = AW - x; y = AH - y; }
    return [x, y, Math.atan2(AH / 2 - y, CX - x)];
  }

  // ---------- стенки: скруглённое поле + ворота ----------
  function confine(o, r, e) {
    let hit = 0;
    const push = (nx, ny, pen, e2) => { const ee = e2 == null ? e : Math.min(e, e2); o.x += nx * pen; o.y += ny * pen; const vn = o.vx * nx + o.vy * ny; if (vn < 0) { o.vx -= (1 + ee) * vn * nx; o.vy -= (1 + ee) * vn * ny; if (-vn > hit) hit = -vn; } };
    if (o.x < r) push(1, 0, r - o.x); else if (o.x > AW - r) push(-1, 0, o.x - (AW - r));
    if (o.y < CR || o.y > AH - CR) {
      const ccx = o.x < CR ? CR : o.x > AW - CR ? AW - CR : -1;
      if (ccx > 0) { const ccy = o.y < CR ? CR : AH - CR, dx = ccx - o.x, dy = ccy - o.y, d = Math.hypot(dx, dy); if (d > CR - r) push(dx / d, dy / d, d - (CR - r)); }
    }
    for (let e2 = 0; e2 < 2; e2++) {
      const top = e2 === 0, v = top ? o.y : AH - o.y, sv = top ? 1 : -1;
      if (v > r + PR + 2) continue;
      const ax = Math.abs(o.x - CX), sx = o.x < CX ? -1 : 1;
      if (ax > HW) { if (v < r) push(0, sv, r - v); }
      else if (v < 0) {
        if (ax > HW - r) push(-sx, 0, ax - (HW - r), 0.4);
        if (v < -GD + r) push(0, sv, (-GD + r) - v, 0.35);
      }
      const py = top ? 0 : AH;
      for (let s = -1; s <= 1; s += 2) { const dx = o.x - (CX + s * HW), dy = o.y - py, d = Math.hypot(dx, dy); if (d < r + PR && d > 0.01) push(dx / d, dy / d, r + PR - d); }
    }
    return hit;
  }

  // ---------- машины ----------
  function mkCar(i) { const [x, y, a] = slotPos(i); return { x, y, vx: 0, vy: 0, a, boost: 34, bo: false, slip: 0, n: null, meT: 0, stuck: 0 }; }
  function resetCar(i) { const c = C[i], [x, y, a] = slotPos(i); Object.assign(c, { x, y, vx: 0, vy: 0, a, n: null }); c.lw = null; }
  function stepCar(c, ix, iy, wantBoost, dt, mul, brake) {
    const m = Math.hypot(ix, iy); let thr = 0, diff = 0;
    if (m > 0.08) { diff = wrap(Math.atan2(iy, ix) - c.a); const tr = TURN * dt; c.a = wrap(c.a + clamp(diff, -tr, tr)); thr = Math.min(1, m); if (Math.abs(diff) > 2.2) { thr = 0; brake = true; } }
    const fx_ = Math.cos(c.a), fy = Math.sin(c.a);
    let vf = c.vx * fx_ + c.vy * fy, vl = -c.vx * fy + c.vy * fx_;
    c.bo = !!wantBoost && c.boost > 0.5;
    if (c.bo) { vf = Math.min(BMAX, vf + BACC * dt); c.boost = Math.max(0, c.boost - BUSE * dt); }
    else c.boost = Math.min(100, c.boost + BREG * dt);
    const lim = MAXV * mul;
    if (thr > 0) { if (vf < lim) vf = Math.min(lim, vf + ACC * thr * dt); else if (!c.bo) vf -= (vf - lim) * Math.min(1, dt * 1.8); }
    else if (!c.bo) vf *= Math.exp(-1.7 * dt);
    if (brake && !c.bo && vf > 0) vf = Math.max(0, vf - 800 * dt);
    if (vf < 0) vf *= Math.exp(-3 * dt);
    const drift = Math.abs(diff) > 0.6 && vf > 190;
    vl *= Math.exp(-(drift ? 2.3 : 9) * dt);
    c.vx = fx_ * vf - fy * vl; c.vy = fy * vf + fx_ * vl;
    c.x += c.vx * dt; c.y += c.vy * dt;
    confine(c, CARR, 0.3);
    c.slip = Math.abs(vl);
  }
  function carCars(dt) {
    for (let i = 0; i < C.length; i++) {
      if (!local(i)) continue;
      const a = C[i];
      for (let j = 0; j < C.length; j++) {
        if (j === i || (local(j) && j < i)) continue;
        const b = C[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), md = CARR * 2 + 4;
        if (d >= md || d < 0.01) continue;
        const nx = dx / d, ny = dy / d, both = local(j), pen = md - d;
        a.x += nx * pen * (both ? 0.5 : 1); a.y += ny * pen * (both ? 0.5 : 1);
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vn < 0) { const k = both ? 0.75 : 1.3; a.vx -= nx * vn * k; a.vy -= ny * vn * k; if (both) { b.vx += nx * vn * k; b.vy += ny * vn * k; } }
        if (both) { b.x -= nx * pen * 0.5; b.y -= ny * pen * 0.5; }
        if (i === cfg.me && -vn > 150) T.haptic("impact", "light");
      }
    }
  }
  // машина — капсула вдоль оси
  function carBall(c) {
    const fx_ = Math.cos(c.a), fy = Math.sin(c.a);
    const t = clamp((ball.x - c.x) * fx_ + (ball.y - c.y) * fy, -CL, CL), px = c.x + fx_ * t, py = c.y + fy * t;
    const dx = ball.x - px, dy = ball.y - py, d = Math.hypot(dx, dy), md = BR + CW;
    if (d >= md || d < 0.01) return 0;
    const nx = dx / d, ny = dy / d; ball.x = px + nx * md; ball.y = py + ny * md;
    const vr = (ball.vx - c.vx) * nx + (ball.vy - c.vy) * ny;
    if (vr >= 0) return 1;
    const cn = Math.max(0, c.vx * nx + c.vy * ny), imp = -1.5 * vr + 35 + cn * 0.32;
    ball.vx += nx * imp; ball.vy += ny * imp;
    const s = Math.hypot(ball.vx, ball.vy); if (s > BMAXV) { ball.vx *= BMAXV / s; ball.vy *= BMAXV / s; }
    c.vx -= nx * cn * 0.12; c.vy -= ny * cn * 0.12;
    return -vr;
  }
  function stepBall(dt, hitters) {
    const n = 3, h = dt / n; let touched = -1, power = 0;
    for (let s = 0; s < n; s++) {
      ball.x += ball.vx * h; ball.y += ball.vy * h;
      const w = confine(ball, BR, 0.78); if (w > 260) { fx.push({ k: "ring", x: ball.x, y: ball.y, t: 0, life: 0.25, c: "rgba(255,255,255,.8)" }); }
      for (const i of hitters) { const p = carBall(C[i]); if (p) { touched = i; power = Math.max(power, p); } }
    }
    const sp = Math.hypot(ball.vx, ball.vy);
    const fr = Math.exp(-0.42 * dt) - (sp > 0 ? Math.min(sp, 14 * dt) / sp : 0);
    ball.vx *= Math.max(0, fr); ball.vy *= Math.max(0, fr);
    ball.rot += sp * dt / BR;
    return [touched, power];
  }
  function touchFx(i, p) {
    if (p > 260) { fx.push({ k: "ring", x: ball.x, y: ball.y, t: 0, life: 0.3, c: cfg.players[i].color }); if (i === cfg.me) T.haptic("impact", p > 600 ? "heavy" : "medium"); }
  }

  // ---------- хозяин: касания, голы, бочки, время ----------
  function credit(i) { teamTouch[team(i)] = [i, gt]; if (window.__log) { const c = C[i], b = BOT[i]; window.__lt = { i, c: [c.x | 0, c.y | 0, +c.a.toFixed(2), c.vx | 0, c.vy | 0], b: [ball.x | 0, ball.y | 0, ball.vx | 0, ball.vy | 0], s: b && [b.tx | 0, b.ty | 0, b.role, b.unst > 0 ? 1 : 0] }; } lastTouch = i; if (touchCd[i] <= 0) { TH[i]++; } touchCd[i] = 0.45; }
  function hostGoal() {
    if (st !== "live") return;
    let t = -1;
    if (ball.y < -BR && Math.abs(ball.x - CX) < HW) t = 0; else if (ball.y > AH + BR && Math.abs(ball.x - CX) < HW) t = 1;
    if (t < 0) return;
    score[t]++;
    const tt = teamTouch[t], att = tt[0] >= 0 && gt - tt[1] < 4;   // автор — последний касавшийся из забившей команды (за 4 с)
    const sc = att ? tt[0] : lastTouch, own = !att && sc >= 0 && team(sc) !== t;
    if (sc >= 0) { if (own) OG[sc]++; else G[sc]++; }
    if (window.__log) window.__log.push({ t, sc, own, gt: +gt.toFixed(1), lt: window.__lt });
    const d = [t, sc, own ? 1 : 0, score[0], score[1], G, OG];
    send("goal", d); onGoal(d);
  }
  function onGoal(d) {
    const [t, sc, own] = d; score = [d[3], d[4]]; if (d[5]) { G = d[5]; OG = d[6]; }
    st = "goal"; stT = 2.6; shake = 0.6;
    const col = TCOL[t][0];
    fx.push({ k: "ring", x: ball.x, y: ball.y, t: 0, life: 0.9, c: col, R: 260 });
    for (let k = 0; k < 46; k++) { const a = Math.random() * 6.28, s = 120 + Math.random() * 380; fx.push({ k: "conf", x: ball.x, y: ball.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 1.2 + Math.random() * 0.6, c: k % 3 ? col : "#fff", r: 4 + Math.random() * 3 }); }
    const mine = t === team(cfg.me);
    msg(mine ? "⚽ ГОЛ!" : "😱 ГОЛ…", 1900, true);
    feed(sc < 0 ? "" : own ? `${pname(sc)} — автогол 🙈` : `⚽ ${pname(sc)} забивает!`);
    T.haptic("notify", mine ? "success" : "error");
    hud();
  }
  function hostKickoff() {
    bv++;
    const d = { s: score, ot: ot ? 1 : 0, t: +gt.toFixed(2) };
    send("kick", d); onKick(d);
  }
  function onKick(d) {
    score = d.s; ot = !!d.ot; if (!isHost()) gt = d.t;
    Object.assign(ball, { x: CX, y: AH / 2, vx: 0, vy: 0 }); corrX = corrY = 0; waitV = 0; waitT = 0; lastTouch = -1; teamTouch = [[-1, -9], [-1, -9]];
    C.forEach((_, i) => { if (local(i)) resetCar(i); });
    st = "kick"; stT = 1.3;
    msg(ot ? "⚡ Золотой гол!" : "На старт…", 1200);
    hud();
  }
  function hostPads(dt) {
    let mask = 0;
    PADS.forEach((p, k) => {
      if (pads[k] > 0) { pads[k] -= dt; return; }
      for (let i = 0; i < C.length; i++) {
        const c = C[i];
        if (Math.hypot(c.x - p[0], c.y - p[1]) > CARR + 18 || (local(i) && c.boost > 97)) continue;
        pads[k] = 8;
        if (local(i)) gotPad(i); else send("pad", [i, k]);
        break;
      }
    });
    PADS.forEach((_, k) => { if (pads[k] <= 0) mask |= 1 << k; });
    if (mask !== padMask) { const lost = padMask & ~mask; PADS.forEach((p, k) => { if (lost & (1 << k)) fx.push({ k: "ring", x: p[0], y: p[1], t: 0, life: 0.4, c: "#fde047" }); }); }
    padMask = mask;
  }
  function gotPad(i) { C[i].boost = Math.min(100, C[i].boost + 40); if (i === cfg.me) T.haptic("impact", "medium"); }
  function hostTime(dt) {
    if (st === "live") {
      gt += dt;
      if (!ot && gt >= DURATION) { if (score[0] !== score[1]) finish(); else { ot = true; hostKickoff(); } }
      else if (ot && gt >= DURATION + OT) finish();
    } else if (st === "goal" && stT <= 0) {
      if (ot || (gt >= DURATION && score[0] !== score[1])) finish();
      else { if (gt >= DURATION) ot = true; hostKickoff(); }
    }
  }

  // ---------- боты ----------
  const BOT = {};
  function botInput(i, dt) {
    const c = C[i], t = team(i), s = BOT[i] || (BOT[i] = { think: 0, tx: c.x, ty: c.y, boost: false, role: "a", roleT: 0, noise: 0, stuck: 0, unst: 0, ua: 0, mul: 0.9 + Math.random() * 0.06 });
    s.think -= dt; s.roleT -= dt;
    const sp = Math.hypot(c.vx, c.vy);
    if (st === "live" && sp < 30) s.stuck += dt; else s.stuck = 0;
    if (s.stuck > 0.9) { s.unst = 0.55; s.ua = c.a + Math.PI * (0.6 + Math.random() * 0.8); s.stuck = 0; }
    if (s.unst > 0) { s.unst -= dt; return [Math.cos(s.ua), Math.sin(s.ua), false, s.mul]; }
    const gy = t === 0 ? -20 : AH + 20, oy = t === 0 ? AH : 0;   // куда бьём / свои ворота
    if (s.think <= 0) {
      s.think = 0.13 + Math.random() * 0.12;
      const db = Math.hypot(ball.x - c.x, ball.y - c.y);
      const lead = clamp(db / 520, 0, 0.8);
      const bx = clamp(ball.x + ball.vx * lead, BR, AW - BR), by = clamp(ball.y + ball.vy * lead, BR - 10, AH - BR + 10);
      // роли: ближний к мячу (со своей стороны) атакует, второй иногда страхует
      const mates = cfg.players.map((p, j) => j).filter((j) => team(j) === t);
      if (s.roleT <= 0) {
        s.roleT = 1.2 + Math.random() * 1.3;
        s.noise = (Math.random() - 0.5) * 2;
        if (mates.length < 2) s.role = "a";
        else {
          const cost = (j) => { const q = C[j], ahead = t === 0 ? q.y < ball.y - 20 : q.y > ball.y + 20; return Math.hypot(ball.x - q.x, ball.y - q.y) + (ahead ? 260 : 0); };
          const best = mates.reduce((a, b) => (cost(b) < cost(a) ? b : a));
          s.role = best === i ? "a" : Math.random() < 0.72 ? "d" : "a";
        }
      }
      const toOwn = Math.hypot(ball.x - CX, ball.y - oy), danger = toOwn < 330 || (t === 0 ? ball.vy > 250 && ball.y > AH * 0.55 : ball.vy < -250 && ball.y < AH * 0.45);
      let tx, ty, boost = false;
      if (s.role === "d" && !(danger && db < 260)) {
        const k = 0.26; tx = CX + (bx - CX) * k * 0.8; ty = oy + (by - oy) * k; ty = t === 0 ? Math.min(ty, AH - 60) : Math.max(ty, 60);
        s.slow = true;
      } else {
        s.slow = false;
        let ax = CX + s.noise * 55, ay = gy;
        if (toOwn < 270) { ax = bx < CX ? -80 : AW + 80; ay = by + (t === 0 ? -240 : 240); }   // у своих ворот — выбиваем в сторону
        const ux = ax - bx, uy = ay - by, ul = Math.hypot(ux, uy) || 1, dx = ux / ul, dy = uy / ul;
        const rx = c.x - bx, ry = c.y - by, along = rx * dx + ry * dy, px = -dy, py = dx, lat = rx * px + ry * py, side = lat >= 0 ? 1 : -1;
        s.wrong = along > -18;
        if (along > -18) {
          if (Math.hypot(rx, ry) < 170 && Math.abs(lat) < 80) { tx = bx + px * side * 135 - dx * 20; ty = by + py * side * 135 - dy * 20; }
          else { tx = bx - dx * 105 + px * side * 100; ty = by - dy * 105 + py * side * 100; }
          // путь не должен идти через мяч
          const sx = tx - c.x, sy = ty - c.y, sl = sx * sx + sy * sy || 1, u = clamp(((bx - c.x) * sx + (by - c.y) * sy) / sl, 0, 1);
          if (Math.hypot(c.x + sx * u - bx, c.y + sy * u - by) < BR + CW + 26) { tx += px * side * 80; ty += py * side * 80; }
        }
        else {
          const rl = Math.hypot(rx, ry) || 1, cosA = -(rx * dx + ry * dy) / rl;
          if (cosA < 0.86 && rl > 70) { tx = bx - dx * 60; ty = by - dy * 60; }
          else { tx = bx + dx * 50; ty = by + dy * 50; boost = rl < 160 && Math.random() < 0.5; }
        }
        if (db > 330 && Math.abs(wrap(Math.atan2(ty - c.y, tx - c.x) - c.a)) < 0.3 && c.boost > 25) boost = Math.random() < 0.85;
      }
      s.tx = clamp(tx, 25, AW - 25); s.ty = clamp(ty, 25, AH - 25); s.boost = boost;
    }
    const dx = s.tx - c.x, dy = s.ty - c.y, d = Math.hypot(dx, dy) || 1;
    if (s.slow && d < 40) { const a = Math.atan2(ball.y - c.y, ball.x - c.x); return [Math.cos(a) * 0.09, Math.sin(a) * 0.09, false, s.mul]; }
    const m = s.slow ? clamp(d / 140, 0.25, 1) : 1;
    let brake = false;
    if (s.wrong && !s.slow) { const bx = ball.x - c.x, by = ball.y - c.y, bl = Math.hypot(bx, by) || 1; if (bl < 230 && (c.vx * bx + c.vy * by) / bl > 140) brake = true; }
    return [dx / d * m, dy / d * m, s.boost && !brake, s.mul, brake];
  }

  // ---------- конец ----------
  function finish() { if (ended || !isHost()) return; const d = { s: score, G, OG, H: TH }; send("end", d); onEnd(d); }
  function onEnd(d) {
    phase = "end"; ended = true; score = d.s; G = d.G; OG = d.OG; TH = d.H;
    const mt = team(cfg.me), win = score[mt] > score[1 - mt], draw = score[0] === score[1];
    St.gameEnd({ win, draw, players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode, goals: G[cfg.me], score: score[mt] + ":" + score[1 - mt] });
    T.haptic("notify", win ? "success" : draw ? "warning" : "error");
    $("end-emoji").textContent = win ? "🏆" : draw ? "🤝" : "😞";
    $("end-title").textContent = win ? "Победа!" : draw ? "Ничья" : "Поражение";
    const row = (i) => { const p = cfg.players[i]; return `<div style="display:flex;justify-content:space-between;gap:8px;margin:2px 0"><span><b style="color:${p.color}">●</b> ${p.name.replace(/[<>&]/g, "")}${i === cfg.me && p.name !== "Ты" ? " (ты)" : ""}</span><b>⚽ ${G[i] || 0}${OG[i] ? " · 🙈 " + OG[i] : ""} · 👟 ${TH[i] || 0}</b></div>`; };
    const order = (t) => cfg.players.map((p, i) => i).filter((i) => team(i) === t).sort((a, b) => (G[b] || 0) - (G[a] || 0) || (TH[b] || 0) - (TH[a] || 0));
    $("end-sub").innerHTML = `<div style="font-size:40px;font-weight:900;color:#2b1d14;margin:4px 0 8px"><span style="color:#2563eb">${score[0]}</span> : <span style="color:#dc2626">${score[1]}</span></div>`
      + `<div style="font-weight:800;color:#2563eb;text-align:left">${Party.TEAMNAMES[0]}</div>` + order(0).map(row).join("")
      + `<div style="font-weight:800;color:#dc2626;text-align:left;margin-top:6px">${Party.TEAMNAMES[1]}</div>` + order(1).map(row).join("");
    const b = [];
    if (isHost()) b.push(["🔁 Ещё матч", "primary", () => { const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) }); }]);
    else b.push(["Ждём, пока хозяин запустит матч…", "", () => {}]);
    b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
    const box = $("end-buttons"); box.innerHTML = "";
    b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
    ["boost", "hint"].forEach((s) => $(s).classList.add("hidden"));
    setTimeout(() => $("screen-end").classList.remove("hidden"), 900);
  }

  // ---------- сеть ----------
  const r0 = (v) => Math.round(v);
  function snapshot() {
    return { c: C.map((c) => [r0(c.x), r0(c.y), r0(c.vx), r0(c.vy), r0(c.a * 100), c.bo ? 1 : 0]), b: [r0(ball.x), r0(ball.y), r0(ball.vx), r0(ball.vy)], v: bv, t: +gt.toFixed(2), p: padMask, s: score, st, lt: lastTouch };
  }
  function netCar(i, v, bo) { const c = C[i]; if (!c) return; c.n = { x: v[0], y: v[1], vx: v[2], vy: v[3], a: v[4] / 100, bo: !!bo, t: now() }; }
  function applySnap(s) {
    const tn = now();
    s.c.forEach((v, i) => { if (i === cfg.me || !C[i]) return; if (!cfg.players[i].bot && tn - C[i].meT < 600) return; netCar(i, v, v[5]); });
    gt = s.t; padMask = s.p; score = s.s; lastTouch = s.lt;
    if (waitT > 0 && s.v < waitV) return;
    if (s.v > bv) { bv = s.v; }
    const lat = clamp((room && room.rtt ? room.rtt : 160) / 2000, 0.03, 0.2);
    const tx = s.b[0] + s.b[2] * lat, ty = s.b[1] + s.b[3] * lat;
    const ex = tx - ball.x, ey = ty - ball.y;
    if (Math.hypot(ex, ey) > 220) { ball.x = tx; ball.y = ty; corrX = corrY = 0; } else { corrX = ex; corrY = ey; }
    ball.vx = s.b[2]; ball.vy = s.b[3];
  }
  function smoothNet(dt) {
    const tn = now(), k = Math.min(1, dt * 10);
    C.forEach((c, i) => {
      if (local(i) || !c.n) return;
      const n = c.n, age = Math.min(0.3, (tn - n.t) / 1000), tx = n.x + n.vx * age, ty = n.y + n.vy * age;
      if (Math.hypot(tx - c.x, ty - c.y) > 160) { c.x = tx; c.y = ty; c.a = n.a; }
      else { c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.a = wrap(c.a + wrap(n.a - c.a) * k); }
      c.vx = n.vx; c.vy = n.vy; c.bo = n.bo;
      const fx_ = Math.cos(c.a), fy = Math.sin(c.a); c.slip = Math.abs(-c.vx * fy + c.vy * fx_);
    });
  }

  function begin(c) {
    const meId = c.cfg.players[c.cfg.me] ? c.cfg.players[c.cfg.me].id : "me";
    cfg = normalize(c.cfg, meId); room = c.room; ended = false; gt = 0; phase = "play"; ot = false;
    fx = []; skid = []; score = [0, 0]; bv = 0; waitV = 0; waitT = 0; corrX = corrY = 0; lastTouch = -1; teamTouch = [[-1, -9], [-1, -9]]; padMask = 63; pads = PADS.map(() => 0);
    G = cfg.players.map(() => 0); OG = G.slice(); TH = G.slice(); touchCd = G.slice();
    for (const k in BOT) delete BOT[k];
    C = cfg.players.map((_, i) => mkCar(i));
    Object.assign(ball, { x: CX, y: AH / 2, vx: 0, vy: 0 });
    flip = team(cfg.me) === 1; atQ = 0; layout();
    st = "kick"; stT = 1.8;
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    ["top", "boost", "hint"].forEach((s) => $(s).classList.remove("hidden"));
    setTimeout(() => $("hint").classList.add("hidden"), 6500);
    if (room) {
      ["snap", "me", "hit", "goal", "kick", "pad", "end", "start", "roster", "host-left", "full", "left"].forEach((t) => room.off(t));
      room.on("snap", (s) => { if (!isHost()) applySnap(s); });
      room.on("me", (d, from) => { const i = cfg.players.findIndex((p) => p.id === from); if (i < 0 || i === cfg.me) return; netCar(i, d, d[5]); C[i].meT = now(); });
      room.on("hit", (d, from) => {
        if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i < 0 || st === "kick") return;
        Object.assign(ball, { x: d[0] + d[2] * 0.03, y: d[1] + d[3] * 0.03, vx: d[2], vy: d[3] }); bv++; credit(i);
      });
      room.on("goal", (d) => { if (!isHost()) onGoal(d); });
      room.on("kick", (d) => { if (!isHost()) onKick(d); });
      room.on("pad", (d) => { if (!isHost() && d[0] === cfg.me) gotPad(cfg.me); });
      room.on("end", (d) => { if (!isHost()) onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: Math.max(0, c2.players.findIndex((p) => p.id === room.me.id)) }) }); });
      room.on("host-left", () => { if (phase === "play") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; feed(`${p.name} вышел — играет бот`); } });
    }
    msg(`Ты за ${Party.TEAMNAMES[team(cfg.me)]}! Бей вверх ⬆`, 1700);
    hud();
    St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode });
  }
  function toMenu() { phase = "menu"; ["top", "boost", "hint", "screen-end"].forEach((s) => $(s).classList.add("hidden")); $("screen-menu").classList.remove("hidden"); }
  let msgT = 0, feedT = 0;
  function msg(t, ms, big) { const el = $("msg"); el.textContent = t; el.classList.toggle("big", !!big); el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }
  function feed(t) { const el = $("feed"); el.textContent = t; clearTimeout(feedT); feedT = setTimeout(() => { el.textContent = ""; }, 2600); }

  // ---------- ввод: джойстик в любом месте, ⚡ справа внизу ----------
  let stick = null, boostHeld = false;
  canvas.addEventListener("pointerdown", (e) => { if (stick) return; stick = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY }; });
  addEventListener("pointermove", (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    stick.cx = e.clientX; stick.cy = e.clientY;
    const dx = stick.cx - stick.x, dy = stick.cy - stick.y, d = Math.hypot(dx, dy);
    if (d > 70) { stick.x += dx / d * (d - 70); stick.y += dy / d * (d - 70); }
  });
  const up = (e) => { if (stick && e.pointerId === stick.id) stick = null; };
  addEventListener("pointerup", up); addEventListener("pointercancel", up);
  const bEl = $("boost");
  bEl.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); boostHeld = true; try { bEl.setPointerCapture(e.pointerId); } catch (_) {} });
  const bUp = () => { boostHeld = false; };
  bEl.addEventListener("pointerup", bUp); bEl.addEventListener("pointercancel", bUp); bEl.addEventListener("lostpointercapture", bUp);
  const keys = {};
  addEventListener("keydown", (e) => { keys[e.code] = 1; }); addEventListener("keyup", (e) => { keys[e.code] = 0; });
  function myInput() {
    let v = null;
    if (stick) { const dx = stick.cx - stick.x, dy = stick.cy - stick.y, d = Math.hypot(dx, dy); if (d > 8) v = [dx / 55, dy / 55]; const m = v ? Math.hypot(v[0], v[1]) : 0; if (m > 1) v = [v[0] / m, v[1] / m]; }
    if (!v) { const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0); if (kx || ky) { const d = Math.hypot(kx, ky); v = [kx / d, ky / d]; } }
    const b = boostHeld || !!keys.ShiftLeft || !!keys.ShiftRight || !!keys.Space;
    if (v && flip) v = [-v[0], -v[1]];
    if (window.__autoBot) { const r = botInput(cfg.me, 1 / 60); return [r[0], r[1], r[2]]; }
    return [v ? v[0] : 0, v ? v[1] : 0, b];
  }

  // ---------- камера и отрисовка ----------
  const M = 36, TOPH = 50;
  let camX = CX, camY = AH / 2, scrX = 0, scrY = 0;
  function layout() {
    if (!W) return;
    const fw = AW + 2 * M, fh = AH + 2 * GD + 2 * M, fit = Math.min(W / fw, (H - TOPH) / fh);
    follow = fit < 0.46; z = follow ? clamp(W / 720, 0.5, 0.8) : fit;
    scrX = W / 2; scrY = follow ? H * 0.52 : TOPH + (H - TOPH) / 2;
    const q = z * DPR; if (Math.abs(q - offQ) > 0.01 || !off) buildField(q);
    bgKey = "";
  }
  function fieldPath(g) {
    g.beginPath();
    g.moveTo(CR, 0); g.lineTo(CX - HW, 0); g.lineTo(CX - HW, -GD); g.lineTo(CX + HW, -GD); g.lineTo(CX + HW, 0); g.lineTo(AW - CR, 0);
    g.arcTo(AW, 0, AW, CR, CR); g.lineTo(AW, AH - CR); g.arcTo(AW, AH, AW - CR, AH, CR);
    g.lineTo(CX + HW, AH); g.lineTo(CX + HW, AH + GD); g.lineTo(CX - HW, AH + GD); g.lineTo(CX - HW, AH); g.lineTo(CR, AH);
    g.arcTo(0, AH, 0, AH - CR, CR); g.lineTo(0, CR); g.arcTo(0, 0, CR, 0, CR); g.closePath();
  }
  function buildField(q) {
    offQ = q;
    off = document.createElement("canvas"); off.width = Math.ceil((AW + 2 * M) * q); off.height = Math.ceil((AH + 2 * GD + 2 * M) * q);
    const g = off.getContext("2d");
    g.setTransform(q, 0, 0, q, M * q, (GD + M) * q);
    paintField(g, true);
  }
  function paintField(g, crowd) {
    g.fillStyle = "#0f2e1c"; g.fillRect(-M - 400, -GD - M - 400, AW + 2 * M + 800, AH + 2 * GD + 2 * M + 800);
    // трибуны — точки «зрителей»
    if (crowd) for (let k = 0; k < 260; k++) { const side = k % 4, s = (k * 0.6180339) % 1; let x, y; if (side < 2) { x = side ? AW + 8 + (k % 3) * 9 : -10 - (k % 3) * 9; y = -GD + s * (AH + 2 * GD); } else { y = side === 2 ? -GD - 8 - (k % 3) * 8 : AH + GD + 8 + (k % 3) * 8; x = s * AW; } g.fillStyle = ["#f87171", "#60a5fa", "#fde047", "#f8fafc", "#4ade80"][k % 5]; g.globalAlpha = 0.45; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // борта
    fieldPath(g); g.lineJoin = "round"; g.strokeStyle = "#0b1a10"; g.lineWidth = 26; g.stroke(); g.strokeStyle = "#e2e8f0"; g.lineWidth = 12; g.stroke(); g.strokeStyle = "#94a3b8"; g.lineWidth = 4; g.stroke();
    // газон полосами
    g.save(); fieldPath(g); g.clip();
    for (let y = -GD, k = 0; y < AH + GD; y += 70, k++) { g.fillStyle = k % 2 ? "#3c9f4a" : "#46b055"; g.fillRect(0, y, AW, 70); }
    // ворота: сетка
    [[-GD, 0], [AH, 1]].forEach(([y0, t]) => {
      g.fillStyle = t === 0 ? "rgba(220,38,38,.28)" : "rgba(37,99,235,.28)"; g.fillRect(CX - HW, y0, HW * 2, GD);
      g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 1.5; g.beginPath();
      for (let x = CX - HW; x <= CX + HW; x += 12) { g.moveTo(x, y0); g.lineTo(x, y0 + GD); }
      for (let y = y0; y <= y0 + GD; y += 12) { g.moveTo(CX - HW, y); g.lineTo(CX + HW, y); }
      g.stroke();
    });
    // разметка
    g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 4; g.beginPath();
    g.moveTo(0, AH / 2); g.lineTo(AW, AH / 2);
    g.moveTo(CX + 88, AH / 2); g.arc(CX, AH / 2, 88, 0, 7);
    g.rect(CX - 165, 0, 330, 140); g.rect(CX - 165, AH - 140, 330, 140);
    g.rect(CX - 80, 0, 160, 52); g.rect(CX - 80, AH - 52, 160, 52);
    g.moveTo(CX + 60, 140); g.arc(CX, 140, 60, 0, Math.PI); g.moveTo(CX - 60, AH - 140); g.arc(CX, AH - 140, 60, Math.PI, 2 * Math.PI);
    g.moveTo(CX - HW, 0); g.lineTo(CX + HW, 0); g.moveTo(CX - HW, AH); g.lineTo(CX + HW, AH);
    g.stroke();
    g.fillStyle = "#fff"; for (const [y, r] of [[AH / 2, 6], [100, 4], [AH - 100, 4]]) { g.beginPath(); g.arc(CX, y, r, 0, 7); g.fill(); }
    g.restore();
    // рамки ворот и штанги
    [[0, -1, "#ef4444"], [AH, 1, "#3b82f6"]].forEach(([y0, s, col]) => {
      g.strokeStyle = col; g.lineWidth = 7; g.lineJoin = "round"; g.beginPath(); g.moveTo(CX - HW, y0); g.lineTo(CX - HW, y0 + s * GD); g.lineTo(CX + HW, y0 + s * GD); g.lineTo(CX + HW, y0); g.stroke();
      for (const x of [CX - HW, CX + HW]) { g.fillStyle = "#fff"; g.strokeStyle = "#0b1a10"; g.lineWidth = 3; g.beginPath(); g.arc(x, y0, PR + 1, 0, 7); g.fill(); g.stroke(); }
    });
  }

  // спрайты: машины, мяч, подписи — рисуются один раз, в кадре только drawImage
  // один общий атлас — меньше переключений текстур
  const AT = document.createElement("canvas"); AT.width = 1024; AT.height = 512;
  const atx = AT.getContext("2d");
  let SPR = {}, atQ = 0, atX = 0, atY = 0, atRow = 0;
  function sprite(key, w, h, paint, scale) {
    const q0 = z * DPR; if (q0 !== atQ) { SPR = {}; atQ = q0; atX = atY = atRow = 0; atx.setTransform(1, 0, 0, 1, 0, 0); atx.clearRect(0, 0, AT.width, AT.height); }
    let r = SPR[key]; if (r) return r;
    const q = scale || q0, pw = Math.ceil(w * q), ph = Math.ceil(h * q);
    if (atX + pw + 2 > AT.width) { atX = 0; atY += atRow + 2; atRow = 0; }
    r = { sx: atX, sy: atY, pw, ph, w, h }; atX += pw + 2; atRow = Math.max(atRow, ph);
    atx.save(); atx.setTransform(1, 0, 0, 1, 0, 0); atx.beginPath(); atx.rect(r.sx, r.sy, pw, ph); atx.clip();
    atx.setTransform(q, 0, 0, q, r.sx + pw / 2, r.sy + ph / 2); paint(atx); atx.restore();
    return (SPR[key] = r);
  }
  function carSprite(i) {
    return sprite("c" + i + (i === cfg.me ? "m" : ""), 64, 48, (g) => {
      const p = cfg.players[i], L = CL + CW, Wd = CW;
      g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.roundRect(-L + 4, -Wd + 6, L * 2, Wd * 2, 8); g.fill();
      g.fillStyle = "#111827"; for (const [x, y] of [[-14, -Wd - 2], [8, -Wd - 2], [-14, Wd - 4], [8, Wd - 4]]) g.fillRect(x, y, 11, 6);
      g.fillStyle = p.color; g.strokeStyle = i === cfg.me ? "#fff" : "#0b1a10"; g.lineWidth = i === cfg.me ? 3.5 : 2.5;
      g.beginPath(); g.roundRect(-L, -Wd, L * 2, Wd * 2, 8); g.fill(); g.stroke();
      g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.roundRect(-12, -Wd + 4, 16, Wd * 2 - 8, 4); g.fill();
      g.fillStyle = "#bae6fd"; g.beginPath(); g.roundRect(4, -Wd + 4, 8, Wd * 2 - 8, 3); g.fill();
      g.fillStyle = "#fef08a"; g.fillRect(L - 4, -Wd + 3, 3, 6); g.fillRect(L - 4, Wd - 9, 3, 6);
      g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(-L + 2, -2.5, 10, 5);
    });
  }
  function ballSprite() {
    return sprite("ball", BR * 2 + 4, BR * 2 + 4, (g) => {
      g.fillStyle = "#fff"; g.strokeStyle = "#0b1a10"; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, BR, 0, 7); g.fill(); g.stroke();
      g.save(); g.beginPath(); g.arc(0, 0, BR - 1.5, 0, 7); g.clip(); g.fillStyle = "#1f2937";
      const pent = (x, y, r) => { g.moveTo(x + r, y); for (let k = 1; k < 5; k++) g.lineTo(x + Math.cos(k * 1.2566) * r, y + Math.sin(k * 1.2566) * r); g.closePath(); };
      g.beginPath(); pent(0, 0, 6.5); for (let k = 0; k < 5; k++) pent(Math.cos(k * 1.2566 + 0.63) * 15, Math.sin(k * 1.2566 + 0.63) * 15, 6); g.fill(); g.restore();
    });
  }
  function labelSprite(i) {
    const me = i === cfg.me, txt = cfg.players[i].bot ? "🤖" : cfg.players[i].name.slice(0, 10);
    return sprite("l" + i + (me ? "m" : ""), me ? 20 : Math.min(110, 12 + txt.length * 8), 18, (g) => {
      g.strokeStyle = "#000"; g.lineWidth = 3; g.fillStyle = "#fff";
      if (me) { g.beginPath(); g.moveTo(-7, -5); g.lineTo(7, -5); g.lineTo(0, 4); g.closePath(); g.stroke(); g.fill(); }
      else { g.font = "800 11px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.strokeText(txt, 0, 0); g.fillText(txt, 0, 0); }
    }, DPR);
  }
  function drawRot(spr, x, y, a, k, ox, oy) {
    const c = Math.cos(a) * DPR * k, s_ = Math.sin(a) * DPR * k;
    ctx.setTransform(c, s_, -s_, c, DPR * (k * x + ox), DPR * (k * y + oy));
    ctx.drawImage(AT, spr.sx, spr.sy, spr.pw, spr.ph, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
  }
  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!cfg || !C.length) { ctx.fillStyle = "#0f2e1c"; ctx.fillRect(0, 0, W, H); return; }
    const me = C[cfg.me], f = flip ? -1 : 1;
    if (follow) {
      const tx = ball.x * 0.6 + me.x * 0.4, ty = ball.y * 0.6 + me.y * 0.4;
      camX += (tx - camX) * Math.min(1, dt * 4); camY += (ty - camY) * Math.min(1, dt * 4);
      const hw = W / 2 / z, hh = H / 2 / z;
      camX = hw * 2 > AW + 2 * M ? CX : clamp(camX, -M + hw, AW + M - hw); camY = hh * 2 > AH + 2 * GD + 2 * M ? AH / 2 : clamp(camY, -GD - M + hh, AH + GD + M - hh);
    } else { camX = CX; camY = AH / 2; }
    shake = Math.max(0, shake - dt);
    const shx = shake > 0 ? Math.round((Math.random() - 0.5) * 16 * shake) : 0, shy = shake > 0 ? Math.round((Math.random() - 0.5) * 16 * shake) : 0;
    const k = z * f, ox = scrX - camX * k + shx, oy = scrY - camY * k + shy;
    if (follow) { ctx.fillStyle = "#0f2e1c"; ctx.fillRect(0, 0, W, H); ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * ox, DPR * oy); ctx.drawImage(off, -M, -GD - M, AW + 2 * M, AH + 2 * GD + 2 * M); }
    else {
      drawBg(k, ox - shx, oy - shy);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (shx || shy) { ctx.fillStyle = "#0f2e1c"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(bgc, Math.round(shx * DPR), Math.round(shy * DPR));
    }
    ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * ox, DPR * oy);
    // бочки ускорения
    PADS.forEach((p, n) => {
      const on = padMask & (1 << n);
      ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.arc(p[0], p[1], 17, 0, 7); ctx.fill();
      if (!on) { ctx.strokeStyle = "rgba(253,224,71,.45)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, 7); ctx.stroke(); return; }
      const bb = Math.sin(t * 5 + n) * 2;
      ctx.fillStyle = "#f59e0b"; ctx.strokeStyle = "#0b1a10"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p[0], p[1] - 3 + bb, 14, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.moveTo(p[0] + 2, p[1] - 13 + bb); ctx.lineTo(p[0] - 6, p[1] - 1 + bb); ctx.lineTo(p[0], p[1] - 1 + bb); ctx.lineTo(p[0] - 2, p[1] + 8 + bb); ctx.lineTo(p[0] + 6, p[1] - 5 + bb); ctx.lineTo(p[0], p[1] - 5 + bb); ctx.closePath(); ctx.fill();
    });
    // следы шин
    const tn = t;
    C.forEach((c) => {
      const fx_ = Math.cos(c.a), fy = Math.sin(c.a), rx = c.x - fx_ * 15, ry = c.y - fy * 15;
      const w = [[rx - fy * 11, ry + fx_ * 11], [rx + fy * 11, ry - fx_ * 11]];
      if (c.lw && c.slip > 110 && skid.length < 180) for (let q = 0; q < 2; q++) skid.push([c.lw[q][0], c.lw[q][1], w[q][0], w[q][1], tn]);
      c.lw = w;
    });
    while (skid.length && tn - skid[0][4] > 2.2) skid.shift();
    if (skid.length) { ctx.strokeStyle = "rgba(20,40,20,.28)"; ctx.lineWidth = 5; ctx.beginPath(); for (const s of skid) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); } ctx.stroke(); }
    // след ускорения
    C.forEach((c) => {
      if (!c.bo || fx.length > 150) return;
      const fx_ = Math.cos(c.a), fy = Math.sin(c.a);
      fx.push({ k: "fire", x: c.x - fx_ * 24 + (Math.random() - 0.5) * 8, y: c.y - fy * 24 + (Math.random() - 0.5) * 8, vx: -fx_ * 90 + c.vx * 0.2, vy: -fy * 90 + c.vy * 0.2, t: 0, life: 0.32 });
    });
    fx = fx.filter((e) => (e.t += dt) < e.life);
    const FC = ["#fde047", "#fb923c", "rgba(120,120,120,.4)"];
    for (let q = 0; q < 3; q++) {
      let any = false; ctx.beginPath();
      for (const e of fx) { if (e.k !== "fire") continue; const a = 1 - e.t / e.life, b = a > 0.6 ? 0 : a > 0.3 ? 1 : 2; if (b !== q) continue; if (q === 0) { e.x += e.vx * dt; e.y += e.vy * dt; } const r = 4 + (1 - a) * 9; ctx.moveTo(e.x + r, e.y); ctx.arc(e.x, e.y, r, 0, 7); any = true; }
      if (any) { ctx.fillStyle = FC[q]; ctx.fill(); }
    }
    for (const e of fx) if (e.k === "fire" && e.t / e.life >= 0.4) { e.x += e.vx * dt; e.y += e.vy * dt; }
    // машины и мяч
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(ball.x + 5, ball.y + 8, BR, BR * 0.8, 0, 0, 7); ctx.fill();
    const bsp = Math.hypot(ball.vx, ball.vy);
    if (bsp > 500) { ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.arc(ball.x - ball.vx * 0.03, ball.y - ball.vy * 0.03, BR * 0.9, 0, 7); ctx.moveTo(ball.x - ball.vx * 0.06 + BR * 0.75, ball.y - ball.vy * 0.06); ctx.arc(ball.x - ball.vx * 0.06, ball.y - ball.vy * 0.06, BR * 0.75, 0, 7); ctx.fill(); }
    C.forEach((c, i) => drawRot(carSprite(i), c.x, c.y, c.a, k, ox, oy));
    drawRot(ballSprite(), ball.x, ball.y, ball.rot, k, ox, oy);
    ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * ox, DPR * oy);
    for (const e of fx) {
      if (e.k === "ring") { ctx.globalAlpha = 1 - e.t / e.life; ctx.strokeStyle = e.c; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(e.x, e.y, BR + e.t / e.life * (e.R || 50), 0, 7); ctx.stroke(); }
      else if (e.k === "conf") { e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.95; e.vy *= 0.95; ctx.globalAlpha = Math.min(1, 2 * (1 - e.t / e.life)); ctx.fillStyle = e.c; ctx.fillRect(e.x - e.r / 2, e.y - e.r / 2, e.r, e.r); }
    }
    ctx.globalAlpha = 1;
    // подписи — в экранных координатах (не переворачиваются)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    C.forEach((c, i) => {
      const l = labelSprite(i), x = ox + c.x * k, y = oy + c.y * k - 30 * z - 6;
      ctx.drawImage(AT, l.sx, l.sy, l.pw, l.ph, Math.round(x * DPR - l.pw / 2), Math.round((y - 2) * DPR - l.ph / 2), l.pw, l.ph);
    });
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // мяч за краем экрана (режим слежения)
    if (follow) { const bx = ox + ball.x * k, by = oy + ball.y * k; if (bx < 0 || bx > W || by < 0 || by > H) { const ax = clamp(bx, 18, W - 18), ay = clamp(by, 70, H - 18); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ax, ay, 9, 0, 7); ctx.fill(); ctx.stroke(); } }
    // джойстик
    drawBoost();
    if (stick) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(stick.x, stick.y, 70, 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(stick.cx, stick.cy, 24, 0, 7); ctx.fill(); }
  }
  let bgKey = "";
  // статичный слой экранного размера: перерисовывается только при сдвиге камеры, в кадре — копия 1:1 без масштабирования
  function drawBg(k, ox, oy) {
    const key = k.toFixed(4) + "," + ox.toFixed(1) + "," + oy.toFixed(1);
    if (key === bgKey) return; bgKey = key;
    bg.setTransform(DPR, 0, 0, DPR, 0, 0); bg.fillStyle = "#0f2e1c"; bg.fillRect(0, 0, W, H);
    bg.setTransform(DPR * k, 0, 0, DPR * k, DPR * ox, DPR * oy);
    bg.drawImage(off, -M, -GD - M, AW + 2 * M, AH + 2 * GD + 2 * M);
  }
  // кнопка ускорения рисуется на холсте, DOM-элемент — только зона нажатия
  let bRect = null;
  function drawBoost() {
    if (bEl.classList.contains("hidden")) return;
    if (!bRect || bRect.w !== W || bRect.h !== H) { const r = bEl.getBoundingClientRect(); bRect = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2, w: W, h: H }; }
    const c = C[cfg.me], key = (Math.floor(c.boost) >> 1) + (c.bo ? "b" : "") + DPR;
    if (bSpr.key !== key) paintBoost(c, key);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bSpr, Math.round((bRect.x - bSpr.w / 2) * DPR), Math.round((bRect.y - bSpr.w / 2) * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  const bSpr = document.createElement("canvas");
  function paintBoost(c, key) {
    const R = bRect.r, w = R * 2 + 12, h = w + 22; bSpr.key = key; bSpr.w = w;
    if (bSpr.width !== Math.ceil(w * DPR)) { bSpr.width = Math.ceil(w * DPR); bSpr.height = Math.ceil(h * DPR); }
    const ctx = bSpr.getContext("2d"); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, w, h);
    const x = w / 2, y = w / 2, b = c.boost / 100;
    ctx.fillStyle = "#0b1a10"; ctx.beginPath(); ctx.arc(x, y + 4, R + 2, 0, 7); ctx.fill();
    ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    if (b > 0.005) { ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R - 1, -Math.PI / 2, -Math.PI / 2 + b * 2 * Math.PI); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = c.bo ? "#fde047" : b < 0.01 ? "#64748b" : "#f97316"; ctx.strokeStyle = "#0b1a10"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, R - 11, 0, 7); ctx.fill(); ctx.stroke();
    const s = R / 47; ctx.fillStyle = c.bo ? "#f97316" : "#fff"; ctx.lineWidth = 2.5; ctx.beginPath();
    ctx.moveTo(x + 5 * s, y - 20 * s); ctx.lineTo(x - 11 * s, y + 3 * s); ctx.lineTo(x - 1 * s, y + 3 * s); ctx.lineTo(x - 5 * s, y + 20 * s); ctx.lineTo(x + 11 * s, y - 4 * s); ctx.lineTo(x + 1 * s, y - 4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = "900 13px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; const tx = String(Math.floor(c.boost));
    ctx.strokeText(tx, x, y + R + 15); ctx.fillStyle = "#fff"; ctx.fillText(tx, x, y + R + 15);
  }
  let hudKey = "";
  function hud() {
    if (!cfg) return;
    const te = $("s-time"); let tt;
    if (ot) tt = `ЗОЛОТОЙ ГОЛ ${Math.ceil(Math.max(0, DURATION + OT - gt))}`;
    else { const tl = Math.ceil(Math.max(0, DURATION - gt)); tt = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, "0")}`; }
    const key = score[0] + "|" + score[1] + "|" + tt;
    if (key === hudKey) return; hudKey = key;
    $("s-a").textContent = score[0]; $("s-b").textContent = score[1]; te.textContent = tt; te.classList.toggle("ot", ot);
  }

  // ---------- главный цикл ----------
  let last = 0, snapT = 0, meT = 0, hudT = 0;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    const reps = window.__speed || 1;
    for (let r = 0; r < reps; r++) update(dt);
    render(ts / 1000, dt);
    requestAnimationFrame(frame);
  }
  function update(dt) {
    if (phase === "play" || phase === "end") {
      const host = isHost();
      stT -= dt; waitT -= dt; hitSendT -= dt;
      if (st === "kick" && stT <= 0 && phase === "play") { st = "live"; msg("Вперёд!", 700); }
      if (!host && st === "live" && phase === "play") gt += dt;
      const frozen = st === "kick" || phase === "end";
      // своя машина и боты
      C.forEach((c, i) => {
        if (!local(i)) return;
        if (frozen) { c.vx = c.vy = 0; c.bo = false; return; }
        let inp;
        if (i === cfg.me) { const r = myInput(); inp = [r[0], r[1], r[2], 1]; } else inp = botInput(i, dt);
        stepCar(c, inp[0], inp[1], inp[2], dt, inp[3], inp[4]);
      });
      smoothNet(dt);
      carCars(dt);
      // мяч
      if (!host) { const kk = Math.min(1, dt * 7); ball.x += corrX * kk; ball.y += corrY * kk; corrX -= corrX * kk; corrY -= corrY * kk; }
      const hitters = st === "kick" ? [] : host ? C.map((_, i) => i).filter(local) : [cfg.me];
      for (let i = 0; i < touchCd.length; i++) touchCd[i] -= dt;
      const [ti, pw] = stepBall(dt, hitters);
      if (ti >= 0) {
        touchFx(ti, pw);
        if (host) { bv++; credit(ti); }
        else if (hitSendT <= 0) { hitSendT = 0.07; waitV = bv + 1; waitT = 0.9; send("hit", [r0(ball.x), r0(ball.y), r0(ball.vx), r0(ball.vy)]); }
      }
      if (host && phase === "play") { hostGoal(); hostPads(dt); hostTime(dt); }
      if (room && phase === "play") {
        if (host) { snapT -= dt; if (snapT <= 0) { snapT = 1 / 15; room.sendFast("snap", snapshot()); } }
        else { meT -= dt; if (meT <= 0) { meT = 1 / 15; const c = C[cfg.me]; room.sendFast("me", [r0(c.x), r0(c.y), r0(c.vx), r0(c.vy), r0(c.a * 100), c.bo ? 1 : 0]); } }
      }
      hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.2; }
    }
  }

  const PARTY = { title: "Футбол машинками", icon: "🚗", max: 4, noBots: true, text: "Го в «Футбол машинками» 🚗⚽ Заходи в комнату!",
    modes: [{ id: "2v2", name: "2 на 2 (+боты)", teams: 2 }, { id: "1v1", name: "1 на 1 (+бот)", teams: 2 }], onCancel: toMenu };
  const solo = (mode) => { $("screen-menu").classList.add("hidden"); begin({ room: null, cfg: { mode, teams: 2, seed: 1, players: [{ id: "me", name: "Ты", bot: false, team: 0 }], me: 0 } }); };
  $("m-bots").onclick = () => solo("2v2");
  $("m-bots1").onclick = () => solo("1v1");
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("futbol", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  resize();
  T.init({ header: "#0f2e1c", bg: "#0f2e1c", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("futbol", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get st() { return st; }, get C() { return C; }, get ball() { return ball; }, get cfg() { return cfg; }, get score() { return score; }, get gt() { return gt; }, get G() { return G; }, get TH() { return TH; }, get OG() { return OG; }, set gt(v) { gt = v; }, finish };
})();
