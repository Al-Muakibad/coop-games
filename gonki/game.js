/* Гонки — машинки сверху в духе Micro Machines. 3 трассы-сплайна, 3 круга, чекпоинты, дрифт с ускорением,
   бонусы (ракета, масло, нитро). До 6 машин, пустые места — боты.
   Каждый сам ведёт свою машину и шлёт позицию ~15 Гц; бонусы, попадания, порядок и финиш считает хозяин. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const SP = 12, HW = 78, KERB = 9, WALL = 132, CR = 13, LAPS = 3, NCP = 8, MAXS = 360, ACC = 560, BRAKE = 620, RSPEED = 820;
  const SCALE = 0.85;
  const TRACKS = [
    { name: "Зелёное кольцо", th: { out: "#3f8f3f", strip: "#6cbf4f", asph: "#5a5f67", dec: "tree" },
      pts: [[700, 400], [1500, 330], [2050, 520], [2150, 1100], [1700, 1500], [1950, 2100], [2000, 2800], [1400, 3050], [650, 2950], [380, 2350], [750, 1750], [420, 1150], [380, 650]] },
    { name: "Пустынная шпилька", th: { out: "#c8975a", strip: "#e6c486", asph: "#6a6460", dec: "cactus" },
      pts: [[600, 320], [1600, 300], [2150, 450], [2150, 900], [1700, 1030], [1050, 980], [850, 1280], [1150, 1580], [2000, 1620], [2200, 2100], [2100, 2800], [1550, 2980], [1250, 2600], [1000, 2220], [600, 2380], [330, 2050], [300, 1300], [350, 700]] },
    { name: "Снежный каньон", th: { out: "#d5e2ee", strip: "#eaf2fa", asph: "#4c5561", dec: "pine" },
      pts: [[1200, 300], [2000, 350], [2200, 800], [1850, 1150], [1300, 1080], [950, 1330], [1200, 1650], [1900, 1720], [2250, 2200], [1950, 2800], [1350, 2950], [950, 2650], [650, 2950], [300, 2700], [350, 2150], [500, 1750], [320, 1100], [500, 550]] },
  ];
  const ITEMS = { rk: "🚀", oil: "🛢️", nb: "⚡" };
  const ITEMNAME = { rk: "Ракета", oil: "Масло", nb: "Нитро" };

  function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const angD = (a, b) => { let d = (a - b) % 6.283185; if (d > 3.141593) d -= 6.283185; if (d < -3.141593) d += 6.283185; return d; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const canvas = $("game"), ctx = canvas.getContext("2d", { alpha: false }), mmc = $("mm"), mctx = mmc.getContext("2d");
  let W, H, DPR;
  function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; canvas.width = W * DPR; canvas.height = H * DPR; mmc.width = 104 * DPR; mmc.height = 132 * DPR; }
  addEventListener("resize", resize); resize();

  // ---------- трасса ----------
  let TR = null; // {N, L, sl, X, Y, TX, TY, TA, th, bx, mm, dec, grid}
  function buildTrack(k, seed) {
    const def = TRACKS[k], pts = def.pts.map((p) => [p[0] * SCALE, p[1] * SCALE]), n = pts.length, raw = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let s = 0; s < 40; s++) {
        const t = s / 40, t2 = t * t, t3 = t2 * t;
        raw.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    let tot = 0; const cum = [0];
    for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; tot += Math.hypot(b[0] - a[0], b[1] - a[1]); cum.push(tot); }
    const N = Math.round(tot / SP / 8) * 8, sl = tot / N, X = new Float32Array(N), Y = new Float32Array(N);
    let j = 0;
    for (let q = 0; q < N; q++) { const s = q * sl; while (cum[j + 1] < s) j++; const a = raw[j], b = raw[(j + 1) % raw.length], f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1); X[q] = a[0] + (b[0] - a[0]) * f; Y[q] = a[1] + (b[1] - a[1]) * f; }
    const TX = new Float32Array(N), TY = new Float32Array(N), TA = new Float32Array(N);
    for (let q = 0; q < N; q++) { const a = (q - 1 + N) % N, b = (q + 1) % N, dx = X[b] - X[a], dy = Y[b] - Y[a], d = Math.hypot(dx, dy) || 1; TX[q] = dx / d; TY[q] = dy / d; TA[q] = Math.atan2(dy, dx); }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let q = 0; q < N; q++) { x0 = Math.min(x0, X[q]); x1 = Math.max(x1, X[q]); y0 = Math.min(y0, Y[q]); y1 = Math.max(y1, Y[q]); }
    TR = { k, name: def.name, th: def.th, N, L: tot, sl, X, Y, TX, TY, TA, x0: x0 - WALL - 300, x1: x1 + WALL + 300, y0: y0 - WALL - 300, y1: y1 + WALL + 300 };
    // коробки бонусов: 3 линии по 3
    TR.bx = [];
    for (const f of [0.2, 0.5, 0.77]) { const q = Math.round(f * N / 4) * 4; for (const o of [-44, 0, 44]) TR.bx.push({ x: X[q] - TY[q] * o, y: Y[q] + TX[q] * o, on: 1, t: 0 }); }
    // декор вне бортиков
    const r = rng(seed ^ 0x5bd1e995); TR.dec = [];
    for (let tries = 0; tries < 900 && TR.dec.length < 140; tries++) {
      const x = TR.x0 + r() * (TR.x1 - TR.x0), y = TR.y0 + r() * (TR.y1 - TR.y0);
      let md = 1e9; for (let q = 0; q < N; q += 3) { const d = (X[q] - x) ** 2 + (Y[q] - y) ** 2; if (d < md) md = d; }
      md = Math.sqrt(md); if (md < WALL + 40) continue;
      TR.dec.push([x, y, 14 + r() * 16, r()]);
    }
    // мини-карта
    const mm = document.createElement("canvas"), sx = 96 / (x1 - x0), sy = 124 / (y1 - y0), s = Math.min(sx, sy);
    mm.width = 104 * DPR; mm.height = 132 * DPR; const m = mm.getContext("2d");
    TR.mmS = s; TR.mmX = 52 - (x0 + x1) / 2 * s; TR.mmY = 66 - (y0 + y1) / 2 * s;
    m.setTransform(DPR, 0, 0, DPR, 0, 0);
    m.fillStyle = "rgba(0,0,0,.35)"; m.beginPath(); m.roundRect(0, 0, 104, 132, 12); m.fill();
    m.lineJoin = "round"; m.beginPath();
    for (let q = 0; q <= N; q += 4) { const px = TR.mmX + X[q % N] * s, py = TR.mmY + Y[q % N] * s; q ? m.lineTo(px, py) : m.moveTo(px, py); }
    m.closePath(); m.strokeStyle = "#111"; m.lineWidth = 7; m.stroke(); m.strokeStyle = "#cbd5e1"; m.lineWidth = 4; m.stroke();
    m.fillStyle = "#fff"; m.fillRect(TR.mmX + X[0] * s - 3, TR.mmY + Y[0] * s - 3, 6, 6);
    TR.mm = mm;
    document.body.style.background = def.th.out;
  }
  function nearest(ci, x, y, win) {
    const N = TR.N, X = TR.X, Y = TR.Y; let best = ci, bd = 1e18;
    if (win >= N / 2) { for (let q = 0; q < N; q++) { const d = (X[q] - x) ** 2 + (Y[q] - y) ** 2; if (d < bd) { bd = d; best = q; } } return best; }
    for (let k = -win; k <= win; k++) { const q = (ci + k + N) % N, d = (X[q] - x) ** 2 + (Y[q] - y) ** 2; if (d < bd) { bd = d; best = q; } }
    return best;
  }
  function locate(c, win) {
    c.ci = nearest(c.ci, c.x, c.y, win || 14);
    const q = c.ci, dx = c.x - TR.X[q], dy = c.y - TR.Y[q];
    c.lat = -dx * TR.TY[q] + dy * TR.TX[q];
    c.s = q * TR.sl + dx * TR.TX[q] + dy * TR.TY[q];
  }
  const sector = (ci) => Math.floor(ci * NCP / TR.N);
  const FINCP = LAPS * NCP + 1;
  function updCP(c) { if (c.cp < FINCP && sector(c.ci) === c.cp % NCP) c.cp++; }
  function progOf(c) {
    if (c.fin) return 1e9 - c.fin;
    const secL = TR.L / NCP, k = (((c.cp - 1) % NCP) + NCP) % NCP;
    let d = c.s - k * secL; d = ((d % TR.L) + TR.L) % TR.L; if (d > TR.L - secL) d -= TR.L;
    return (c.cp - 1) * secL + d;
  }
  const lapOf = (c) => clamp(Math.floor((c.cp - 1) / NCP) + 1, 1, LAPS);

  // ---------- состояние ----------
  let room = null, cfg = null, phase = "menu", ended = false, rt = 0, cd = 0, C = [], order = [], rockets = [], oils = [], parts = [], rings = [];
  let myItem = null, endAt = 0, oilId = 0, rkId = 0, lastLap = 1, wrongT = 0;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const col = (i) => cfg.players[i].color;
  const pname = (i) => (i === cfg.me ? "Ты" : cfg.players[i].name);
  const hostSim = (i) => isHost() && i !== cfg.me && cfg.players[i].bot;     // машины, которые ведёт хозяин
  const SKN = 700, SK = new Float32Array(SKN * 4); let skI = 0, skC = 0;

  function startCars() {
    const r = rng(cfg.seed);
    // боты впереди, люди сзади
    const slots = cfg.players.map((p, i) => i).sort((a, b) => (cfg.players[a].bot ? 0 : 1) - (cfg.players[b].bot ? 0 : 1) || a - b);
    C = cfg.players.map(() => ({}));
    slots.forEach((i, k) => {
      const row = Math.floor(k / 2), side = k % 2 ? 1 : -1, back = 60 + row * 66 + (k % 2) * 30;
      const q = (TR.N - Math.round(back / TR.sl)) % TR.N, o = side * 34;
      const x = TR.X[q] - TR.TY[q] * o, y = TR.Y[q] + TR.TX[q] * o, a = TR.TA[q];
      C[i] = { x, y, a, vx: 0, vy: 0, ci: q, lat: o, s: q * TR.sl, cp: 0, spin: 0, spinDir: 1, boost: 0, boostK: 1, dT: 0, item: null, fin: 0,
        tx: x, ty: y, ta: a, tvx: 0, tvy: 0, rcv: 0, skill: cfg.players[i].bot ? 0.86 + r() * 0.1 : 1, imm: 0, lw: null, slip: 0, grid: [x, y, a] };
    });
    order = slots.slice();
  }

  // ---------- физика машины ----------
  function applyBoost(c, t, k) { c.boost = Math.max(c.boost, t); c.boostK = Math.max(c.boost > t ? c.boostK : 1, k); }
  function stepCar(c, dir, gas, dt) {
    const sp0 = Math.hypot(c.vx, c.vy);
    let drifting = false;
    if (c.spin > 0) {
      c.spin -= dt; c.a += c.spinDir * 9 * dt * Math.min(1, c.spin + 0.35);
      const f = Math.exp(-2.6 * dt); c.vx *= f; c.vy *= f; c.dT = 0;
    } else {
      if (dir != null) {
        const diff = angD(dir, c.a), tr = (2.3 + 1.5 * Math.min(1, sp0 / 220)) * dt;
        c.a += clamp(diff, -tr, tr);
        drifting = sp0 > 175 && Math.abs(diff) > 0.6;
      }
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      let vf = c.vx * fx + c.vy * fy, vl = -c.vx * fy + c.vy * fx;
      const off = Math.abs(c.lat) > HW + KERB * 0.6;
      const mx = MAXS * c.skill * (c.boost > 0 ? c.boostK : 1) * (off ? 0.48 : 1);
      if (gas) { if (vf < mx) vf += ACC * dt * (1 - Math.max(0, vf) / mx) * (c.boost > 0 ? 1.8 : 1); }
      else vf -= Math.sign(vf) * Math.min(Math.abs(vf), BRAKE * dt);
      if (vf > mx) vf += (mx - vf) * Math.min(1, (off ? 2.6 : 1.4) * dt);
      if (vf < -60) vf = -60;
      vl *= Math.exp(-(drifting ? 2.0 : 8.5) * dt);
      c.vx = fx * vf - fy * vl; c.vy = fy * vf + fx * vl;
      if (drifting) c.dT += dt;
      else { if (c.dT > 0.5) { applyBoost(c, Math.min(1.1, 0.3 + c.dT * 0.6), 1.22); if (c === C[cfg.me]) T.haptic("impact", "light"); } c.dT = 0; }
    }
    if (c.boost > 0) { c.boost -= dt; if (c.boost <= 0) c.boostK = 1; }
    c.x += c.vx * dt; c.y += c.vy * dt;
    locate(c);
    collideWall(c);
  }
  function collideWall(c) {
    const lim = WALL - CR;
    if (Math.abs(c.lat) <= lim) return 0;
    const q = c.ci, nx = -TR.TY[q], ny = TR.TX[q], sg = c.lat > 0 ? 1 : -1, over = c.lat - sg * lim;
    c.x -= nx * over; c.y -= ny * over; c.lat = sg * lim;
    const vn = c.vx * nx + c.vy * ny;
    if (vn * sg > 0) { c.vx -= nx * vn * 1.4; c.vy -= ny * vn * 1.4; c.vx *= 0.93; c.vy *= 0.93; if (c === C[cfg.me] && Math.abs(vn) > 110) T.haptic("impact", "medium"); }
    return 1;
  }
  function collideCars(i) {
    const c = C[i];
    for (let j = 0; j < C.length; j++) {
      if (j === i) continue; const o = C[j], dx = c.x - o.x, dy = c.y - o.y, d2 = dx * dx + dy * dy;
      if (d2 > 26 * 26 || d2 < 0.01) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (26 - d) * 0.5;
      c.x += nx * push; c.y += ny * push;
      const rv = (c.vx - o.vx) * nx + (c.vy - o.vy) * ny;
      if (rv < 0) { c.vx -= nx * rv * 0.6; c.vy -= ny * rv * 0.6; }
    }
  }

  // ---------- боты (и автопилот после финиша) ----------
  const BOT = {};
  function botDrive(i, dt) {
    const c = C[i], st = BOT[i] || (BOT[i] = { off: 0, offT: 0, err: 0, errT: 4 + Math.random() * 8, errOff: 0, itemT: 0, stuck: 0, care: 0.9 + Math.random() * 0.15 });
    const N = TR.N, sp = Math.hypot(c.vx, c.vy);
    st.offT -= dt; if (st.offT <= 0) { st.off = (Math.random() * 2 - 1) * HW * 0.5; st.offT = 1.5 + Math.random() * 2.5; }
    st.errT -= dt;
    if (st.errT <= 0) { st.err = 0.5 + Math.random() * 0.7; st.errT = 7 + Math.random() * 11; st.errOff = (Math.random() < 0.5 ? -1 : 1) * (HW + 25 + Math.random() * 30); }
    let off = st.off; if (st.err > 0) { st.err -= dt; off = st.errOff; }
    const k = (c.ci + Math.round((70 + sp * 0.42) / TR.sl)) % N;
    const tx = TR.X[k] - TR.TY[k] * off, ty = TR.Y[k] + TR.TX[k] * off;
    const dir = Math.atan2(ty - c.y, tx - c.x);
    const k1 = (c.ci + Math.round((40 + sp * 0.35) / TR.sl)) % N, k2 = (k1 + Math.round(230 / TR.sl)) % N;
    const dth = Math.abs(angD(TR.TA[k2], TR.TA[k1]));
    const want = MAXS * c.skill * (1 - 0.55 * Math.min(1, dth / 1.7)) * st.care + (st.err > 0 ? 60 : 0);
    let gas = sp < want + 12 || sp < 120;
    if (sp < 25 && phase === "race") st.stuck += dt; else st.stuck = 0;
    if (st.stuck > 1.5) { st.err = 0; gas = true; }
    // бонусы
    if (c.item && !c.fin && phase === "race" && i !== cfg.me) {
      st.itemT -= dt;
      if (st.itemT <= 0) {
        const r = order.indexOf(i), me = progOf(c);
        let use = st.itemT < -9;
        if (c.item === "rk") use = use || (r > 0 && progOf(C[order[r - 1]]) - me < 1500);
        else if (c.item === "oil") use = use || (r < order.length - 1 && me - progOf(C[order[r + 1]]) < 380);
        else use = use || dth < 0.25;
        if (use) hostUse(i, c.item, c.x, c.y, c.a);
      }
    }
    return [dir, gas];
  }

  // ---------- бонусы и снаряды (хозяин) ----------
  function giveItem(i) {
    const r = order.indexOf(i), n = order.length, u = Math.random(), back = n > 1 ? r / (n - 1) : 0.5;
    const it = u < 0.25 + back * 0.25 ? "rk" : u < 0.62 - back * 0.12 ? "oil" : "nb";
    C[i].item = it;
    if (i === cfg.me) setItem(it);
    else if (cfg.players[i].bot) { (BOT[i] || (BOT[i] = { off: 0, offT: 0, err: 0, errT: 6, errOff: 0, itemT: 0, stuck: 0, care: 1 })).itemT = 0.6 + Math.random() * 2; }
    else send("item", [i, it]);
  }
  function hostBoxes(dt) {
    let ch = false;
    for (const b of TR.bx) {
      if (!b.on) { b.t -= dt; if (b.t <= 0) { b.on = 1; ch = true; } continue; }
      for (let i = 0; i < C.length; i++) {
        const c = C[i]; if ((c.x - b.x) ** 2 + (c.y - b.y) ** 2 > 24 * 24) continue;
        b.on = 0; b.t = 4; ch = true; parts.push(...burst(b.x, b.y, "#ffd34d", 6));
        if (!c.item && !c.fin) giveItem(i);
        break;
      }
    }
    return ch;
  }
  function hostUse(i, type, x, y, a) {
    const c = C[i]; c.item = null;
    if (type === "rk") {
      const r = order.indexOf(i); let tgt = -1;
      for (let k = r - 1; k >= 0; k--) if (!C[order[k]].fin) { tgt = order[k]; break; }
      rockets.push({ id: ++rkId, x: x + Math.cos(a) * 26, y: y + Math.sin(a) * 26, a, ci: c.ci, own: i, tgt, life: 4.5 });
      feed(`${pname(i)} 🚀${tgt >= 0 ? " → " + pname(tgt) : ""}`);
    } else if (type === "oil") {
      oils.push({ id: ++oilId, x: x - Math.cos(a) * 30, y: y - Math.sin(a) * 30, own: i, t: 0 });
      if (oils.length > 8) oils.shift();
      send("oil", oils.map((o) => [o.id, Math.round(o.x), Math.round(o.y)]));
    } else if (type === "nb" && (i === cfg.me || cfg.players[i].bot)) applyBoost(c, 1.6, 1.5);
  }
  function hostShots(dt) {
    for (const k of rockets) {
      k.life -= dt;
      k.ci = nearest(k.ci, k.x, k.y, 10);
      let want;
      const t = k.tgt >= 0 ? C[k.tgt] : null;
      if (t && !t.fin && (t.x - k.x) ** 2 + (t.y - k.y) ** 2 < 330 * 330) want = Math.atan2(t.y - k.y, t.x - k.x);
      else { const q = (k.ci + 10) % TR.N; want = Math.atan2(TR.Y[q] - k.y, TR.X[q] - k.x); }
      k.a += clamp(angD(want, k.a), -7 * dt, 7 * dt);
      k.x += Math.cos(k.a) * RSPEED * dt; k.y += Math.sin(k.a) * RSPEED * dt;
      for (let i = 0; i < C.length; i++) {
        if (i === k.own && k.life > 4) continue;
        const c = C[i]; if (c.fin || (c.x - k.x) ** 2 + (c.y - k.y) ** 2 > 22 * 22) continue;
        k.life = 0; hit(i, "rk", k.x, k.y, k.own); break;
      }
    }
    rockets = rockets.filter((k) => k.life > 0);
    let och = false;
    for (const o of oils) {
      o.t += dt;
      for (let i = 0; i < C.length; i++) {
        const c = C[i]; if (c.imm > 0 || c.fin || (i === o.own && o.t < 1.2)) continue;
        if ((c.x - o.x) ** 2 + (c.y - o.y) ** 2 > 28 * 28) continue;
        c.imm = 2; hit(i, "oil", o.x, o.y, o.own);
      }
    }
    const before = oils.length; oils = oils.filter((o) => o.t < 16); if (oils.length !== before) och = true;
    if (och) send("oil", oils.map((o) => [o.id, Math.round(o.x), Math.round(o.y)]));
    C.forEach((c) => { if (c.imm > 0) c.imm -= dt; });
  }
  function hit(i, kind, x, y, by) { const d = [i, kind, Math.round(x), Math.round(y), by]; send("hit", d); onHit(d); }
  function onHit(d) {
    const [i, kind, x, y, by] = d, c = C[i]; if (!c) return;
    if (kind === "rk") { rings.push({ x, y, t: 0, c: "#ff7a2f" }); parts.push(...burst(x, y, "#ff7a2f", 12)); }
    else parts.push(...burst(x, y, "#222", 6));
    if (i === cfg.me || hostSim(i)) {
      c.spin = kind === "rk" ? 1.25 : 0.85; c.spinDir = Math.random() < 0.5 ? -1 : 1; c.boost = 0; c.boostK = 1;
      if (kind === "rk") { c.vx *= 0.3; c.vy *= 0.3; }
    }
    if (i === cfg.me) { T.haptic("notify", "error"); msg(kind === "rk" ? "💥 Ракета!" : "🛢️ Масло!", 900); }
    else if (by === cfg.me) { T.haptic("notify", "success"); feed(kind === "rk" ? `🚀 Попал в ${pname(i)}!` : `🛢️ ${pname(i)} в твоём масле`); }
  }

  // ---------- мои бонусы ----------
  function setItem(it) {
    myItem = it; const b = $("itembtn");
    b.textContent = it ? ITEMS[it] : "?"; b.classList.toggle("on", !!it);
    if (it) { T.haptic("impact", "light"); feed(`Бонус: ${ITEMNAME[it]} — жми кнопку`); }
  }
  function useItem() {
    const me = C[cfg.me];
    if (!myItem || phase !== "race" || !me || me.fin || me.spin > 0) return;
    const it = myItem; setItem(null);
    if (it === "nb") { applyBoost(me, 1.6, 1.5); T.haptic("impact", "heavy"); }
    if (isHost()) hostUse(cfg.me, it, me.x, me.y, me.a);
    else { me.item = null; send("use", [it, Math.round(me.x), Math.round(me.y), +me.a.toFixed(2)]); }
  }

  // ---------- порядок, финиш, конец ----------
  function computeOrder() {
    const pr = C.map((c) => progOf(c));
    order = C.map((_, i) => i).sort((a, b) => pr[b] - pr[a]);
  }
  function onFinish(i) {
    const c = C[i];
    if (i === cfg.me) {
      const place = C.filter((o) => o.fin && o.fin <= c.fin).length || 1;
      msg(`🏁 Финиш! ${place} место`, 2200); T.haptic("notify", place === 1 ? "success" : "warning"); setItem(null);
      $("itembtn").classList.add("hidden");
    } else feed(`🏁 ${pname(i)} финишировал`);
  }
  function hostEndCheck() {
    if (ended) return;
    const allDone = C.every((c) => c.fin), humansDone = cfg.players.every((p, i) => p.bot || C[i].fin), any = C.some((c) => c.fin);
    if (allDone || rt > 300) return finish();
    if (humansDone && (!endAt || endAt > rt + 8)) endAt = rt + 8;
    if (any && !endAt) endAt = rt + 35;
    if (endAt && rt >= endAt) finish();
  }
  function finish() {
    if (ended) return; computeOrder();
    const full = (FINCP - 1) * TR.L / NCP;
    const e = C.map((c) => { if (c.fin) return 0; const pr = Math.max(1, progOf(c)); return +(rt + (full - pr) / Math.max(120, pr / Math.max(1, rt))).toFixed(1); });
    const d = { o: order, f: C.map((c) => +(c.fin || 0).toFixed(2)), cp: C.map((c) => c.cp), e };
    send("end", d); onEnd(d);
  }
  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
  function onEnd(d) {
    phase = "end"; ended = true;
    order = d.o; d.f.forEach((f, i) => { if (C[i]) { C[i].fin = f; C[i].cp = d.cp[i]; } });
    const place = order.indexOf(cfg.me) + 1, win = place === 1;
    St.gameEnd({ win, place, players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode, track: TR.k, time: C[cfg.me].fin || null });
    T.haptic("notify", win ? "success" : "warning");
    $("end-emoji").textContent = ["🏆", "🥈", "🥉"][place - 1] || "🏁";
    $("end-title").textContent = win ? "Победа!" : `${place} место из ${order.length}`;
    $("end-sub").innerHTML = `<div style="margin-bottom:6px">${TR.name}</div>` + order.map((i, k) => {
      const p = cfg.players[i], c = C[i];
      return `<div class="row${i === cfg.me ? " me" : ""}"><span>${k + 1}. <b style="color:${p.color}">●</b> ${p.name.replace(/[<>&]/g, "")}${i === cfg.me && p.name !== "Ты" ? " (ты)" : ""}</span><b>${c.fin ? "⏱ " + fmt(c.fin) : d.e && d.e[i] && c.cp > 0 ? `<span style="opacity:.6">≈ ${fmt(d.e[i])}</span>` : "круг " + lapOf(c) + "/" + LAPS}</b></div>`;
    }).join("");
    const b = [];
    if (isHost()) b.push(["🔁 Ещё заезд", "primary", () => { const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) }); }]);
    else b.push(["Ждём, пока хозяин запустит заезд…", "", () => {}]);
    b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
    const box = $("end-buttons"); box.innerHTML = "";
    b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
    $("itembtn").classList.add("hidden");
    setTimeout(() => { if (phase === "end") $("screen-end").classList.remove("hidden"); }, 900);
  }

  // ---------- сеть ----------
  const r1 = (v) => Math.round(v);
  function snapshot() {
    let bm = 0; TR.bx.forEach((b, k) => { if (b.on) bm |= 1 << k; });
    return { c: C.map((c) => [r1(c.x), r1(c.y), +c.a.toFixed(2), r1(c.vx), r1(c.vy), c.cp]), o: order, f: C.map((c) => +(c.fin || 0).toFixed(2)),
      b: bm, r: rockets.map((k) => [r1(k.x), r1(k.y), +k.a.toFixed(2)]), t: +rt.toFixed(2) };
  }
  function recvCar(i, v) {
    const c = C[i]; if (!c) return;
    c.tx = v[0]; c.ty = v[1]; c.ta = v[2]; c.tvx = v[3]; c.tvy = v[4]; c.rcv = performance.now();
    if (v[5] > c.cp) c.cp = v[5];
  }
  function applySnap(s) {
    s.c.forEach((v, i) => { if (i !== cfg.me) recvCar(i, v); });
    s.f.forEach((f, i) => { const c = C[i]; if (c && i !== cfg.me && f && !c.fin) { c.fin = f; onFinish(i); } });
    order = s.o;
    TR.bx.forEach((b, k) => { b.on = (s.b >> k) & 1; });
    rockets = s.r.map((v) => ({ x: v[0], y: v[1], a: v[2] }));
    if (phase === "race" && Math.abs(s.t - rt) > 1.5) rt = s.t;
  }
  function follow(c, dt) {     // чужая машина: экстраполяция + сглаживание
    const age = Math.min(0.3, (performance.now() - c.rcv) / 1000);
    const px = c.tx + c.tvx * age, py = c.ty + c.tvy * age;
    const k = Math.min(1, dt * 10);
    if ((px - c.x) ** 2 + (py - c.y) ** 2 > 250 * 250) { c.x = px; c.y = py; locate(c, TR.N); }
    else { c.x += (px - c.x) * k; c.y += (py - c.y) * k; locate(c, 20); }
    c.a += angD(c.ta, c.a) * k; c.vx = c.tvx; c.vy = c.tvy;
  }

  function begin(c) {
    cfg = c.cfg; room = c.room; ended = false; phase = "count"; cd = 3.4; rt = 0; endAt = 0;
    rockets = []; oils = []; parts = []; rings = []; skC = 0; skI = 0; lastLap = 1; wrongT = 0;
    for (const k in BOT) delete BOT[k];
    const tk = cfg.mode === "rnd" ? cfg.seed % TRACKS.length : +String(cfg.mode).slice(1) || 0;
    buildTrack(clamp(tk, 0, TRACKS.length - 1), cfg.seed); startCars(); resetTiles(); setItem(null);
    const me = C[cfg.me]; camX = me.x; camY = me.y;
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    ["top", "mm", "hint", "itembtn"].forEach((s) => $(s).classList.remove("hidden"));
    setTimeout(() => $("hint").classList.add("hidden"), 8000);
    if (room) {
      ["snap", "me", "fin", "use", "item", "hit", "oil", "end", "start", "roster", "host-left", "full", "left"].forEach((t) => room.off(t));
      const idx = (from) => cfg.players.findIndex((p) => p.id === from);
      room.on("snap", (s) => { if (!isHost()) applySnap(s); });
      room.on("me", (d, from) => { if (!isHost()) return; const i = idx(from); if (i < 0 || i === cfg.me || cfg.players[i].bot) return; recvCar(i, d); if (d[6] && !C[i].fin) { C[i].fin = d[6]; C[i].cp = FINCP; onFinish(i); } });
      room.on("fin", (d, from) => { if (!isHost()) return; const i = idx(from); if (i >= 0 && !C[i].fin) { C[i].fin = d[0]; C[i].cp = FINCP; onFinish(i); } });
      room.on("use", (d, from) => { if (!isHost()) return; const i = idx(from); if (i >= 0) hostUse(i, d[0], d[1], d[2], d[3]); });
      room.on("item", (d) => { if (!isHost() && d[0] === cfg.me && !C[cfg.me].fin) setItem(d[1]); });
      room.on("hit", (d) => { if (!isHost()) onHit(d); });
      room.on("oil", (d) => { if (!isHost()) oils = d.map((v) => ({ id: v[0], x: v[1], y: v[2] })); });
      room.on("end", (d) => { if (!isHost()) onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
      room.on("host-left", () => { if (phase !== "end") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const i = idx(id); if (i >= 0 && !cfg.players[i].bot) { cfg.players[i].bot = true; C[i].skill = 0.9; feed(`${cfg.players[i].name} вышел — едет бот`); } });
    }
    msg(TR.name, 1300);
    St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode, track: TR.k });
  }
  function toMenu() { phase = "menu"; ["top", "mm", "hint", "itembtn", "screen-end"].forEach((s) => $(s).classList.add("hidden")); $("screen-menu").classList.remove("hidden"); }
  let msgT = 0, feedT = 0;
  function msg(t, ms, big) { const el = $("msg"); el.textContent = t; el.classList.add("on"); el.classList.toggle("big", !!big); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }
  function feed(t) { const el = $("feed"); el.textContent = t; clearTimeout(feedT); feedT = setTimeout(() => { el.textContent = ""; }, 2600); }

  // ---------- ввод: палец где угодно — направление; отпустил — тормоз ----------
  let stick = null;
  canvas.addEventListener("pointerdown", (e) => { if (!stick) stick = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY }; });
  addEventListener("pointermove", (e) => {
    if (!stick || stick.id !== e.pointerId) return;
    stick.cx = e.clientX; stick.cy = e.clientY;
    const dx = stick.cx - stick.x, dy = stick.cy - stick.y, d = Math.hypot(dx, dy);
    if (d > 70) { stick.x += dx / d * (d - 70); stick.y += dy / d * (d - 70); }
  });
  const up = (e) => { if (stick && stick.id === e.pointerId) stick = null; };
  addEventListener("pointerup", up); addEventListener("pointercancel", up);
  $("itembtn").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); useItem(); });
  const keys = {};
  addEventListener("keydown", (e) => { keys[e.code] = 1; if (e.code === "Space" || e.code === "Enter") useItem(); });
  addEventListener("keyup", (e) => { keys[e.code] = 0; });
  function myInput() {
    const me = C[cfg.me];
    if (stick) { const dx = stick.cx - stick.x, dy = stick.cy - stick.y; return [Math.hypot(dx, dy) > 14 ? Math.atan2(dy, dx) : me.a, true]; }
    const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (kx || ky) return [Math.atan2(ky, kx), true];
    if (window.__autoDrive) return botDrive(cfg.me, 1 / 60);
    return [null, false];
  }

  // ---------- частицы и следы ----------
  function burst(x, y, c, n) { const a = []; for (let k = 0; k < n; k++) { const an = Math.random() * 6.28, v = 60 + Math.random() * 160; a.push({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, t: 0, life: 0.5 + Math.random() * 0.3, c, r: 3 + Math.random() * 3 }); } return a; }
  function skid(c) {
    const sp = Math.hypot(c.vx, c.vy);
    const slip = sp > 60 ? Math.abs(angD(Math.atan2(c.vy, c.vx), c.a)) : 0;
    const on = c.spin > 0 || (sp > 140 && slip > 0.3 && slip < 2.8);
    const fx = Math.cos(c.a), fy = Math.sin(c.a), bx = c.x - fx * 11, by = c.y - fy * 11;
    const L = [bx + fy * 8, by - fx * 8], R = [bx - fy * 8, by + fx * 8];
    if (on && c.lw) {
      for (const [a, b] of [[c.lw[0], L], [c.lw[1], R]]) { const o = skI * 4; SK[o] = a[0]; SK[o + 1] = a[1]; SK[o + 2] = b[0]; SK[o + 3] = b[1]; skI = (skI + 1) % SKN; skC = Math.min(SKN, skC + 1); }
    }
    c.lw = on ? [L, R] : null;
    c.slip = slip;
    if (Math.abs(c.lat) > HW + KERB && sp > 110 && Math.random() < 0.35 && parts.length < 160) parts.push({ x: bx, y: by, vx: -c.vx * 0.2 + (Math.random() - 0.5) * 40, vy: -c.vy * 0.2 + (Math.random() - 0.5) * 40, t: 0, life: 0.45, c: TR.th.dec === "pine" ? "#ffffff" : "#8a6a3c", r: 4 });
  }

  // ---------- отрисовка ----------
  let camX = 0, camY = 0, mmT = 0;
  function trackRuns(x0, y0, x1, y1) {
    const N = TR.N, X = TR.X, Y = TR.Y, runs = []; let cur = null;
    for (let q = 0; q < N; q += 2) {
      const ins = X[q] > x0 && X[q] < x1 && Y[q] > y0 && Y[q] < y1;
      if (ins) { if (!cur) { cur = [q, q]; runs.push(cur); } cur[1] = q; } else cur = null;
    }
    if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === N - 2) { const f = runs.shift(); runs[runs.length - 1][1] = f[1] + N; }
    if (runs.length === 1 && runs[0][0] === 0 && runs[0][1] === N - 2) runs[0][1] = N;
    return runs.map((r) => [Math.floor((r[0] - 2) / 4) * 4, r[1] + 4]);
  }
  function runPath(runs) {
    const p = new Path2D(), N = TR.N, X = TR.X, Y = TR.Y;
    for (const [a, b] of runs) { const closed = b - a >= N; for (let q = a; q <= b; q += 2) { const k = ((q % N) + N) % N; q === a ? p.moveTo(X[k], Y[k]) : p.lineTo(X[k], Y[k]); } if (closed) p.closePath(); }
    return p;
  }
  function drawDecor(ctx, d) {
    const [x, y, r, v] = d, t = TR.th.dec;
    if (t === "tree") { ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.arc(x + 5, y + 6, r, 0, 7); ctx.fill(); ctx.fillStyle = v < 0.5 ? "#2e7d32" : "#388e3c"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.fillStyle = "#4caf50"; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, 7); ctx.fill(); }
    else if (t === "cactus") {
      if (v < 0.45) { ctx.fillStyle = "#9c7a54"; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, v * 6, 0, 7); ctx.fill(); ctx.fillStyle = "#b8956a"; ctx.beginPath(); ctx.ellipse(x - r * 0.25, y - r * 0.2, r * 0.5, r * 0.35, v * 6, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = "#2f7d4a"; ctx.beginPath(); ctx.roundRect(x - 5, y - r, 10, r * 2, 5); ctx.roundRect(x - r * 0.8, y - r * 0.4, 7, r * 0.8, 3.5); ctx.roundRect(x + r * 0.8 - 7, y - r * 0.6, 7, r * 0.7, 3.5); ctx.fill(); }
    } else {
      ctx.fillStyle = "rgba(60,80,100,.18)"; ctx.beginPath(); ctx.arc(x + 4, y + 6, r, 0, 7); ctx.fill();
      ctx.fillStyle = v < 0.5 ? "#1f5f45" : "#2a6e50"; ctx.beginPath(); ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 0.4, y - r * 0.4); ctx.lineTo(x - r * 0.4, y - r * 0.4); ctx.closePath(); ctx.fill();
    }
  }
  function drawCar(c, i) {
    const me = i === cfg.me;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    if (c.boost > 0) { const f = 10 + Math.random() * 10; ctx.fillStyle = c.boostK > 1.3 ? "#60a5fa" : "#ff9a3c"; ctx.beginPath(); ctx.moveTo(-17, -5); ctx.lineTo(-17 - f, 0); ctx.lineTo(-17, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.moveTo(-17, -2.5); ctx.lineTo(-17 - f * 0.5, 0); ctx.lineTo(-17, 2.5); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(-15, -7, 34, 20);
    ctx.fillStyle = "#111"; ctx.fillRect(-14, -12, 9, 5); ctx.fillRect(-14, 7, 9, 5); ctx.fillRect(7, -11.5, 8, 4.5); ctx.fillRect(7, 7, 8, 4.5);
    ctx.fillStyle = col(i); ctx.strokeStyle = me ? "#fff" : "#111"; ctx.lineWidth = me ? 2.5 : 2;
    ctx.beginPath(); ctx.roundRect(-17, -9, 34, 18, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(15,23,42,.85)"; ctx.beginPath(); ctx.roundRect(1, -6.5, 8, 13, 2.5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(-14, -1.8, 13, 3.6);
    ctx.fillStyle = "#1f2937"; ctx.fillRect(-18, -8, 3, 16);
    if (c.dT > 0.5) { ctx.fillStyle = Math.random() < 0.5 ? "#ffd34d" : "#ff7a2f"; ctx.beginPath(); ctx.arc(-15, -11, 2.5, 0, 7); ctx.arc(-15, 11, 2.5, 0, 7); ctx.fill(); }
    ctx.restore();
    if (!me) { const lab = cfg.players[i].name; ctx.font = "800 11px sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(lab, c.x, c.y - 22); ctx.fillStyle = "#fff"; ctx.fillText(lab, c.x, c.y - 22); }
  }
  // статичный фон рисуется плитками TS×TS и кэшируется (дорогие широкие штрихи — один раз)
  const TS = 256, TMAX = 30; let tiles = new Map(), tilePool = [], RS = 1.5, ZF = 1;
  // масштаб подобран так, что плитка ровно целое число пикселей, а рисуется 1:1 без растяжения (дёшево)
  let tileSz = ""; function resetTiles() { tileSz = W + "x" + H + "x" + DPR; for (const t of tiles.values()) tilePool.push(t); tiles.clear(); RS = Math.round(TS * clamp(Math.min(W / 440, H / 880), 0.6, 1.15) * DPR) / TS; ZF = RS / DPR; }
  function drawStatic(g, x0, y0, x1, y1) {
    const th = TR.th, M = WALL + 30;
    g.fillStyle = th.out; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const runs = trackRuns(x0 - M, y0 - M, x1 + M, y1 + M), path = runPath(runs);
    let filled = runs.length > 0;
    g.lineJoin = "round"; g.lineCap = "butt";
    g.strokeStyle = "#f8fafc"; g.lineWidth = WALL * 2 + 14; g.stroke(path);
    g.setLineDash([24, 24]); g.strokeStyle = "#e11d48"; g.stroke(path); g.setLineDash([]);
    g.strokeStyle = th.strip; g.lineWidth = WALL * 2; g.stroke(path);
    g.strokeStyle = "#fff"; g.lineWidth = (HW + KERB) * 2; g.stroke(path);
    g.setLineDash([24, 24]); g.strokeStyle = "#ef4444"; g.stroke(path); g.setLineDash([]);
    g.strokeStyle = th.asph; g.lineWidth = HW * 2; g.stroke(path);
    g.setLineDash([24, 24]); g.strokeStyle = "rgba(255,255,255,.22)"; g.lineWidth = 3; g.stroke(path); g.setLineDash([]);
    if (TR.X[0] > x0 - 200 && TR.X[0] < x1 + 200 && TR.Y[0] > y0 - 200 && TR.Y[0] < y1 + 200) {
      g.save(); g.translate(TR.X[0], TR.Y[0]); g.rotate(TR.TA[0]);
      const sq = HW * 2 / 10; for (let r = 0; r < 2; r++) for (let k = 0; k < 10; k++) { g.fillStyle = (r + k) % 2 ? "#111" : "#fff"; g.fillRect(-sq + r * sq, -HW + k * sq, sq, sq); }
      g.restore();
      for (const c of C) { const q = c.grid; g.save(); g.translate(q[0], q[1]); g.rotate(q[2]); g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 3; g.beginPath(); g.moveTo(22, -14); g.lineTo(26, -14); g.lineTo(26, 14); g.lineTo(22, 14); g.stroke(); g.restore(); }
    }
    return filled;
  }
  function makeTile(key, tx, ty) {
    let cv;
    if (tiles.size >= TMAX) { const k0 = tiles.keys().next().value; cv = tiles.get(k0); tiles.delete(k0); }
    else cv = tilePool.pop() || document.createElement("canvas");
    const px = Math.round(TS * RS); if (cv.width !== px) { cv.width = px; cv.height = px; }
    const g = cv.getContext("2d"); g.setTransform(RS, 0, 0, RS, -tx * TS * RS, -ty * TS * RS);
    cv._e = !drawStatic(g, tx * TS, ty * TS, tx * TS + TS, ty * TS + TS);     // пустая плитка (только фон) не рисуется
    tiles.set(key, cv); return cv;
  }
  const tkey = (tx, ty) => (tx + 512) * 4096 + ty + 512;
  function drawTiles(ox, oy, z, vx0, vy0, vx1, vy1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const a0 = Math.floor(vx0 / TS), a1 = Math.floor(vx1 / TS), b0 = Math.floor(vy0 / TS), b1 = Math.floor(vy1 / TS);
    for (let tx = a0; tx <= a1; tx++) for (let ty = b0; ty <= b1; ty++) {
      const key = tkey(tx, ty); let cv = tiles.get(key);
      if (cv) { tiles.delete(key); tiles.set(key, cv); } else cv = makeTile(key, tx, ty);
      if (!cv._e) ctx.drawImage(cv, Math.round(tx * TS * RS + ox * DPR), Math.round(ty * TS * RS + oy * DPR));
    }
    // подгрузка одной плитки впереди по ходу движения
    const me = C[cfg.me], fx = me.vx * 0.7, fy = me.vy * 0.7;
    const c0 = Math.floor((vx0 + Math.min(0, fx)) / TS), c1 = Math.floor((vx1 + Math.max(0, fx)) / TS), d0 = Math.floor((vy0 + Math.min(0, fy)) / TS), d1 = Math.floor((vy1 + Math.max(0, fy)) / TS);
    for (let tx = c0; tx <= c1; tx++) for (let ty = d0; ty <= d1; ty++) { const key = tkey(tx, ty); if (!tiles.has(key)) { makeTile(key, tx, ty); return; } }
  }
  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = TR ? TR.th.out : "#3f8f3f"; ctx.fillRect(0, 0, W, H);   // фон под пустыми плитками
    if (!cfg || !C.length || !TR) return;
    const me = C[cfg.me], sp = Math.hypot(me.vx, me.vy);
    if (tileSz !== W + "x" + H + "x" + DPR) resetTiles();
    const z = ZF;
    const lx = clamp(me.vx * 0.42, -W * 0.22 / z, W * 0.22 / z), ly = clamp(me.vy * 0.42, -H * 0.24 / z, H * 0.24 / z);
    camX += (me.x + lx - camX) * Math.min(1, dt * 4); camY += (me.y + ly - camY) * Math.min(1, dt * 4);
    const ox = Math.round((W / 2 - camX * z) * DPR) / DPR, oy = Math.round((H * 0.54 - camY * z) * DPR) / DPR;
    ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * ox, DPR * oy);
    const vx0 = -ox / z, vy0 = -oy / z, vx1 = vx0 + W / z, vy1 = vy0 + H / z, M = WALL + 30;
    const inV = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;
    // трасса и декор — из кэша плиток
    if (tileSz !== W + "x" + H + "x" + DPR) resetTiles();
    drawTiles(ox, oy, z, vx0, vy0, vx1, vy1);
    ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * ox, DPR * oy);
    for (const d of TR.dec) if (inV(d[0], d[1], 40)) drawDecor(ctx, d);
    // следы шин
    ctx.strokeStyle = "rgba(20,20,20,.28)"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath();
    for (let k = 0; k < skC; k++) { const o = k * 4; if (!inV(SK[o], SK[o + 1], 10)) continue; ctx.moveTo(SK[o], SK[o + 1]); ctx.lineTo(SK[o + 2], SK[o + 3]); }
    ctx.stroke(); ctx.lineCap = "butt";
    // масло
    for (const o of oils) { if (!inV(o.x, o.y, 40)) continue; ctx.fillStyle = "#111827"; ctx.beginPath(); ctx.ellipse(o.x, o.y, 28, 21, 0.6, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(o.x + 18, o.y - 14, 9, 0, 7); ctx.fill(); ctx.fillStyle = "rgba(147,197,253,.35)"; ctx.beginPath(); ctx.ellipse(o.x - 8, o.y - 6, 9, 5, 0.6, 0, 7); ctx.fill(); }
    // коробки
    for (const b of TR.bx) {
      if (!b.on || !inV(b.x, b.y, 30)) continue;
      const s = 1 + Math.sin(t * 5 + b.x) * 0.08;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(t * 1.5); ctx.scale(s, s);
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(-11, -9, 26, 26);
      ctx.fillStyle = "#ffd34d"; ctx.strokeStyle = "#7c2d12"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(-13, -13, 26, 26, 5); ctx.fill(); ctx.stroke();
      ctx.rotate(-t * 1.5); ctx.fillStyle = "#7c2d12"; ctx.font = "900 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", 0, 1); ctx.textBaseline = "alphabetic";
      ctx.restore();
    }
    // машины
    for (let i = 0; i < C.length; i++) if (i !== cfg.me && inV(C[i].x, C[i].y, 40)) drawCar(C[i], i);
    drawCar(me, cfg.me);
    // ракеты
    for (const k of rockets) {
      if (!inV(k.x, k.y, 40)) continue;
      ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.a);
      ctx.fillStyle = Math.random() < 0.5 ? "#ffd34d" : "#ff7a2f"; ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-22 - Math.random() * 8, 0); ctx.lineTo(-10, 4); ctx.fill();
      ctx.fillStyle = "#e5e7eb"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-11, -4.5, 20, 9, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.moveTo(9, -4.5); ctx.lineTo(15, 0); ctx.lineTo(9, 4.5); ctx.fill();
      ctx.restore();
    }
    // частицы
    for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
    parts = parts.filter((p) => p.t < p.life);
    for (const p of parts) { if (!inV(p.x, p.y, 10)) continue; ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.c; ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); }
    ctx.globalAlpha = 1;
    rings = rings.filter((e) => (e.t += dt) < 0.5);
    for (const e of rings) { ctx.globalAlpha = 1 - e.t / 0.5; ctx.strokeStyle = e.c; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + e.t * 110, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // джойстик
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (stick) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(stick.x, stick.y, 70, 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.65)"; ctx.beginPath(); ctx.arc(stick.cx, stick.cy, 24, 0, 7); ctx.fill(); }
    else if (phase === "race" && !me.fin && !window.__autoDrive && sp < 30 && rt > 1) { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.font = "800 15px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Зажми палец и веди — поедешь", W / 2, H * 0.72); }
    // мини-карта
    if ((mmT -= dt) > 0) return; mmT = 1 / 15;
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mmc.width, mmc.height); mctx.drawImage(TR.mm, 0, 0);
    mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let k = 0; k <= C.length; k++) { const i = k === C.length ? cfg.me : k; if (k === cfg.me) continue; const c = C[i]; mctx.fillStyle = col(i); mctx.strokeStyle = i === cfg.me ? "#fff" : "#000"; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(TR.mmX + c.x * TR.mmS, TR.mmY + c.y * TR.mmS, i === cfg.me ? 5 : 3.5, 0, 7); mctx.fill(); mctx.stroke(); }
  }
  const setT = (id, v, html) => { const el = $(id); if (el._v === v) return; el._v = v; if (html) el.innerHTML = v; else el.textContent = v; };
  function hud() {
    const me = C[cfg.me], place = order.indexOf(cfg.me) + 1;
    setT("pos", `${place}<small>/${C.length}</small>`, 1);
    setT("lap", me.fin ? "🏁 Финиш" : `Круг ${lapOf(me)}/${LAPS}`);
    setT("tm", fmt(me.fin || rt));
  }

  // ---------- главный цикл ----------
  let last = 0, snapT = 0, meT = 0, hudT = 0, ordT = 0, lastCd = 9;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (phase === "count" || phase === "race") {
      const me = C[cfg.me];
      if (phase === "count") {
        cd -= dt; const n = Math.ceil(cd);
        if (n !== lastCd && n <= 3 && n >= 1) { msg(String(n), 900, true); T.haptic("impact", "light"); }
        lastCd = n;
        if (cd <= 0) { phase = "race"; msg("Вперёд!", 800, true); T.haptic("notify", "success"); }
      } else {
        rt += dt;
        // своя машина
        let inp = me.fin ? botDrive(cfg.me, dt) : myInput();
        stepCar(me, inp[0], inp[1], dt); collideCars(cfg.me); locate(me); collideWall(me);
        if (!me.fin) {
          const pc = me.cp; updCP(me);
          if (me.cp !== pc && me.cp >= FINCP) { me.fin = +rt.toFixed(2); if (isHost()) { computeOrder(); onFinish(cfg.me); } else { send("fin", [me.fin]); onFinish(cfg.me); } }
          else if (lapOf(me) !== lastLap) { lastLap = lapOf(me); msg(lastLap === LAPS ? "Последний круг!" : `Круг ${lastLap}/${LAPS}`, 1300); }
          const tg = Math.cos(TR.TA[me.ci]) * me.vx + Math.sin(TR.TA[me.ci]) * me.vy;
          wrongT = tg < -50 ? wrongT + dt : 0; if (wrongT > 1.2) { msg("↩ Не туда!", 900); wrongT = -1; }
        }
        // чужие и боты
        for (let i = 0; i < C.length; i++) {
          if (i === cfg.me) continue; const c = C[i];
          if (hostSim(i)) {
            const r = botDrive(i, dt); stepCar(c, r[0], r[1], dt); collideCars(i); locate(c); collideWall(c);
            if (!c.fin) { updCP(c); if (c.cp >= FINCP) { c.fin = +rt.toFixed(2); onFinish(i); } }
          } else follow(c, dt);
        }
        if (isHost()) {
          for (let i = 0; i < C.length; i++) if (i !== cfg.me && !hostSim(i) && !C[i].fin) updCP(C[i]);
          ordT -= dt; if (ordT <= 0) { ordT = 0.2; computeOrder(); }
          hostBoxes(dt); hostShots(dt); hostEndCheck();
        } else for (const k of rockets) { k.x += Math.cos(k.a) * RSPEED * dt; k.y += Math.sin(k.a) * RSPEED * dt; }
        for (const c of C) skid(c);
      }
      if (room) {
        if (isHost()) { snapT -= dt; if (snapT <= 0) { snapT = 1 / 12; room.sendFast("snap", snapshot()); } }
        else { meT -= dt; if (meT <= 0) { meT = 1 / 15; room.sendFast("me", [r1(me.x), r1(me.y), +me.a.toFixed(2), r1(me.vx), r1(me.vy), me.cp, me.fin || 0]); } }
      }
      hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.1; }
    }
    render(ts / 1000, dt);
    requestAnimationFrame(frame);
  }

  const PARTY = { title: "Гонки", icon: "🏎️", max: 6, bots: 2, text: "Го в «Гонки» 🏎️ Три круга, дрифт и ракеты — заходи в заезд!",
    modes: [{ id: "t0", name: "🌳 Кольцо" }, { id: "t1", name: "🌵 Шпилька" }, { id: "t2", name: "❄️ Каньон" }, { id: "rnd", name: "🎲 Случайная" }], onCancel: toMenu };
  $("m-bots").onclick = async () => {
    $("screen-menu").classList.add("hidden");
    const c = await Party.offline(Object.assign({}, PARTY, { bots: 4 }));
    // против ботов — минимум 3 бота
    const n = c.cfg.players.filter((p) => p.bot).length;
    for (let k = n; k < 3; k++) c.cfg.players.push({ id: "bot" + k, name: "🤖 Бот " + (k + 1), bot: true, team: c.cfg.players.length, color: Party.COLORS[c.cfg.players.length] });
    begin(c);
  };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("gonki", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#2b1d14", bg: "#3f8f3f", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("gonki", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get C() { return C; }, get cfg() { return cfg; }, get TR() { return TR; }, get order() { return order; }, get rockets() { return rockets; }, get oils() { return oils; },
    get myItem() { return myItem; }, get rt() { return rt; }, useItem, finish, progOf, setItem };
})();
