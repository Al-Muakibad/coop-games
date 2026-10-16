/* Территория — захват земли хвостом (в духе paper.io). До 6 игроков, хозяин считает мир, боты, команды. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const N = 50, TICK = 0.14, DURATION = 150, RESPAWN = 3;
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR, C;
  function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; canvas.width = W * DPR; canvas.height = H * DPR; C = Math.max(16, Math.min(W, H) / 19); }
  addEventListener("resize", resize); resize();

  let room = null, cfg = null, phase = "menu", ended = false, timeLeft = DURATION;
  let terr = new Uint8Array(N * N), trail = new Uint8Array(N * N);   // 0 = ничьё, иначе игрок+1
  let ps = [], diffs = [], acc = 0, sinceTick = 0, fx = [];
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const team = (i) => cfg.players[i].team;
  const col = (i) => cfg.players[i].color;
  const set = (arr, k, v) => { if (arr[k] !== v) { arr[k] = v; diffs.push(k, terr[k] * 8 + trail[k]); } };

  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; } return `rgb(${r | 0},${g | 0},${b | 0})`; }
  let pal = [];

  // ---------- мир (хозяин) ----------
  function spawn(i, first) {
    const p = ps[i];
    let bx = 0, by = 0;
    for (let tries = 0; tries < 300; tries++) {
      let x, y;
      if (first) { const a = (i / ps.length) * Math.PI * 2 + 0.6, r = N * 0.32; x = Math.round(N / 2 + Math.cos(a) * r); y = Math.round(N / 2 + Math.sin(a) * r); }
      else { x = 4 + Math.floor(Math.random() * (N - 8)); y = 4 + Math.floor(Math.random() * (N - 8)); }
      let ok = true;
      for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) { const k = (y + dy) * N + x + dx; if (trail[k] || (terr[k] && !first)) { ok = false; break; } }
      bx = x; by = y; if (ok || first) break;
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(terr, (by + dy) * N + bx + dx, i + 1);
    Object.assign(p, { x: bx, y: by, px: bx, py: by, d: Math.floor(Math.random() * 4), nd: -1, alive: true, resp: 0, tr: [] });
    p.nd = p.d; p.plan = [];
  }
  function kill(i, by) {
    const p = ps[i]; if (!p.alive) return;
    p.alive = false; p.resp = RESPAWN; p.deaths = (p.deaths || 0) + 1;
    for (const k of p.tr) set(trail, k, 0);
    p.tr = [];
    for (let k = 0; k < N * N; k++) if (terr[k] === i + 1) set(terr, k, 0);
    if (by != null && by !== i) ps[by].kills = (ps[by].kills || 0) + 1;
    send("ko", { i, by }); onKo({ i, by });
  }
  function capture(i) {
    const p = ps[i], me = i + 1;
    for (const k of p.tr) { set(trail, k, 0); set(terr, k, me); }
    p.tr = [];
    // заливка: всё, до чего нельзя дойти от края bbox, не проходя по моей земле — моё
    let x0 = N, y0 = N, x1 = -1, y1 = -1;
    for (let k = 0; k < N * N; k++) if (terr[k] === me) { const x = k % N, y = (k / N) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(N - 1, x1 + 1); y1 = Math.min(N - 1, y1 + 1);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, seen = new Uint8Array(bw * bh), q = [];
    const push = (x, y) => { if (x < x0 || x > x1 || y < y0 || y > y1) return; const l = (y - y0) * bw + x - x0; if (seen[l] || terr[y * N + x] === me) return; seen[l] = 1; q.push(x, y); };
    for (let x = x0; x <= x1; x++) { push(x, y0); push(x, y1); }
    for (let y = y0; y <= y1; y++) { push(x0, y); push(x1, y); }
    while (q.length) { const y = q.pop(), x = q.pop(); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
    let got = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!seen[(y - y0) * bw + x - x0] && terr[y * N + x] !== me) { set(terr, y * N + x, me); got++; }
    if (got > 0) send("cap", { i, n: got }), onCap({ i, n: got });
  }
  function step() {
    // боты
    ps.forEach((p, i) => { if (cfg.players[i].bot && p.alive) botDir(i); });
    // ходы
    const heads = [];
    ps.forEach((p, i) => {
      p.px = p.x; p.py = p.y;
      if (!p.alive) { p.resp -= TICK; if (p.resp <= 0) spawn(i, false); return; }
      if (p.nd >= 0 && (p.nd + 2) % 4 !== p.d) p.d = p.nd;
      let nx = p.x + DX[p.d], ny = p.y + DY[p.d];
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) {          // у края не умираем — сворачиваем вдоль стенки
        const alt = [(p.d + 1) % 4, (p.d + 3) % 4].filter((d) => { const x = p.x + DX[d], y = p.y + DY[d]; return x >= 0 && y >= 0 && x < N && y < N && trail[y * N + x] !== i + 1; });
        if (!alt.length) { kill(i, null); return; }
        p.d = p.nd = alt[Math.random() < 0.5 ? 0 : alt.length - 1]; nx = p.x + DX[p.d]; ny = p.y + DY[p.d];
      }
      heads.push([i, nx, ny]);
    });
    for (const [i, nx, ny] of heads) {
      if (!ps[i].alive) continue;
      const k = ny * N + nx, t = trail[k];
      if (t) {
        const o = t - 1;
        if (o === i) { kill(i, null); continue; }
        if (cfg.teams && team(o) === team(i)) {} else kill(o, i);
      }
    }
    for (const [i, nx, ny] of heads) {
      const p = ps[i]; if (!p.alive) continue;
      p.x = nx; p.y = ny;
      const k = ny * N + nx;
      if (terr[k] === i + 1) { if (p.tr.length) capture(i); }
      else { set(trail, k, i + 1); p.tr.push(k); }
    }
    // голова в голову снаружи — оба выбывают
    for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
      const A = ps[a], B = ps[b];
      if (A.alive && B.alive && A.x === B.x && A.y === B.y && !(cfg.teams && team(a) === team(b))) {
        const ka = terr[A.y * N + A.x] === a + 1, kb = terr[B.y * N + B.x] === b + 1;
        if (!ka) kill(a, b); if (!kb) kill(b, a);
      }
    }
    timeLeft -= TICK;
    if (timeLeft <= 0) finish();
  }
  function botDir(i) {
    const p = ps[i], me = i + 1, k0 = p.y * N + p.x;
    const safe = (d) => { const x = p.x + DX[d], y = p.y + DY[d]; if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) return false; return trail[y * N + x] !== me; };
    const home = terr[k0] === me;
    // опасность: чужая голова рядом с моим хвостом — домой
    let danger = false;
    if (p.tr.length) for (let j = 0; j < ps.length; j++) { if (j === i || !ps[j].alive || (cfg.teams && team(j) === team(i))) continue; for (let t = p.tr.length - 1; t >= 0; t -= 3) { const k = p.tr[t]; if (Math.abs((k % N) - ps[j].x) + Math.abs(((k / N) | 0) - ps[j].y) < 5) { danger = true; break; } } }
    if (home && !p.plan.length) {
      const a = 3 + Math.floor(Math.random() * 6), b = 2 + Math.floor(Math.random() * 6), d1 = Math.floor(Math.random() * 4), d2 = (d1 + (Math.random() < 0.5 ? 1 : 3)) % 4;
      p.plan = Array(a).fill(d1).concat(Array(b).fill(d2), Array(a).fill((d1 + 2) % 4));
      p.ret = false;
    }
    let d = -1;
    if (!home && (danger || !p.plan.length || p.tr.length > 26)) p.ret = true;
    if (p.ret && !home) {
      // к ближайшей своей клетке
      let best = 1e9, tx = p.x, ty = p.y;
      for (let k = 0; k < N * N; k++) if (terr[k] === me) { const x = k % N, y = (k / N) | 0, dd = Math.abs(x - p.x) + Math.abs(y - p.y); if (dd < best) { best = dd; tx = x; ty = y; } }
      const opts = [0, 1, 2, 3].filter((q) => (q + 2) % 4 !== p.d && safe(q));
      opts.sort((u, v) => (Math.abs(p.x + DX[u] - tx) + Math.abs(p.y + DY[u] - ty)) - (Math.abs(p.x + DX[v] - tx) + Math.abs(p.y + DY[v] - ty)));
      d = opts.length ? opts[0] : p.d;
    } else if (p.plan.length) {
      d = p.plan.shift();
      if ((d + 2) % 4 === p.d || !safe(d)) { const o = [0, 1, 2, 3].filter((q) => (q + 2) % 4 !== p.d && safe(q)); d = o.length ? o[Math.floor(Math.random() * o.length)] : p.d; }
      if (home) p.ret = false;
    } else d = p.d;
    if (!safe(d)) { const o = [0, 1, 2, 3].filter((q) => (q + 2) % 4 !== p.d && safe(q)); if (o.length) d = o[0]; }
    p.nd = d;
  }
  function areas() { const a = new Array(ps.length).fill(0); for (let k = 0; k < N * N; k++) if (terr[k]) a[terr[k] - 1]++; return a; }
  function finish() {
    if (ended) return;
    const a = areas(), byTeam = {};
    a.forEach((v, i) => { byTeam[team(i)] = (byTeam[team(i)] || 0) + v; });
    let win = null, b = -1; for (const k in byTeam) if (byTeam[k] > b) { b = byTeam[k]; win = +k; }
    const d = { win, a, kills: ps.map((p) => p.kills || 0) };
    send("end", d); onEnd(d);
  }

  // ---------- сеть ----------
  function rle() { let s = "", last = -1, n = 0; for (let k = 0; k <= N * N; k++) { const v = k < N * N ? terr[k] * 8 + trail[k] : -2; if (v === last && n < 60) n++; else { if (n) s += String.fromCharCode(48 + last) + (n > 1 ? String.fromCharCode(160 + n) : ""); last = v; n = 1; } } return s; }
  function unrle(s) { let k = 0; for (let i = 0; i < s.length; i++) { const v = s.charCodeAt(i) - 48; let n = 1; if (i + 1 < s.length && s.charCodeAt(i + 1) >= 160) { n = s.charCodeAt(i + 1) - 160; i++; } for (let j = 0; j < n; j++, k++) { terr[k] = v >> 3; trail[k] = v & 7; } } }
  // Снимок уходит по быстрому каналу (может потеряться) — поэтому в нём изменения за последние 4 хода, а раз в секунду — вся карта.
  let tickNo = 0, recent = [], lastK = -1, predK = -1;
  function snapshot(full) {
    recent.push([tickNo, diffs]); if (recent.length > 4) recent.shift();
    const s = { k: tickNo, P: ps.map((p) => [p.x, p.y, p.d, p.alive ? 1 : 0]), D: recent, T: Math.ceil(timeLeft) };
    if (full) s.F = rle();
    diffs = []; return s;
  }
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  function predictStep(i) {                         // гость сам двигает головы на ход вперёд, пока ждёт хозяина
    const p = ps[i]; if (!p.alive) return;
    let d = p.d; if (i === cfg.me && p.nd >= 0 && (p.nd + 2) % 4 !== p.d) d = p.nd;
    const nx = p.x + DX[d], ny = p.y + DY[d];
    p.px = p.x; p.py = p.y;
    if (inside(nx, ny)) { p.x = nx; p.y = ny; p.d = d; }
  }
  function applySnap(s) {
    if (s.k != null && s.k <= lastK) return;               // старый или повторный снимок
    if (s.F) unrle(s.F);
    else for (const [dk, D] of s.D || []) { if (dk <= lastK) continue; for (let j = 0; j < D.length; j += 2) { terr[D[j]] = D[j + 1] >> 3; trail[D[j]] = D[j + 1] & 7; } }
    const ahead = Math.max(0, Math.min(3, predK - s.k));
    s.P.forEach((v, i) => { const p = ps[i]; if (!p) return; p.x = v[0]; p.y = v[1]; p.d = v[2]; p.alive = !!v[3]; p.px = p.x; p.py = p.y; });
    for (let a = 0; a < ahead; a++) ps.forEach((_, i) => predictStep(i));
    if (!ahead) { ps.forEach((p, i) => { const v = s.P[i]; if (v && p.alive) { p.px = v[0] - DX[v[2]]; p.py = v[1] - DY[v[2]]; } }); sinceTick = 0; }
    if (s.k != null) lastK = s.k; if (predK < lastK) predK = lastK;
    timeLeft = s.T;
  }

  // ---------- старт ----------
  function begin(c) {
    cfg = c.cfg; room = c.room; ended = false; timeLeft = DURATION; phase = "play"; acc = 0; sinceTick = 0; fx = []; tickNo = 0; recent = []; lastK = -1; predK = -1;
    terr = new Uint8Array(N * N); trail = new Uint8Array(N * N); diffs = [];
    pal = cfg.players.map((p) => ({ land: shade(p.color, 0.45), edge: shade(p.color, 0.15), tail: shade(p.color, 0.25), head: p.color, dark: shade(p.color, -0.35) }));
    ps = cfg.players.map(() => ({ tr: [], plan: [], kills: 0 }));
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    $("top").classList.remove("hidden"); $("hint").classList.remove("hidden");
    setTimeout(() => $("hint").classList.add("hidden"), 7000);
    if (isHost()) ps.forEach((_, i) => spawn(i, true));
    else ps.forEach((p) => Object.assign(p, { x: 0, y: 0, px: 0, py: 0, d: 0, alive: true }));
    if (room) {
      ["snap", "dir", "end", "start", "roster", "host-left", "full", "left", "ko", "cap"].forEach((t) => room.off(t));
      room.on("snap", (s) => { if (!isHost()) applySnap(s); });
      room.on("dir", (d, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i >= 0) ps[i].nd = d.d; });
      room.on("ko", (d) => { if (!isHost()) onKo(d); });
      room.on("cap", (d) => { if (!isHost()) onCap(d); });
      room.on("end", (d) => { if (!isHost()) onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
      room.on("host-left", () => { if (phase === "play") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; msg(`${p.name} вышел — играет бот`, 2000); } });
      if (isHost()) send("snap", snapshot(true));
    }
    const mine = cfg.players[cfg.me];
    msg(cfg.teams ? `Ты за ${Party.TEAMNAMES[mine.team]}` : "Захвати больше всех!", 1800);
    St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode });
  }
  function onKo(d) {
    const p = ps[d.i]; if (p) fx.push({ x: p.x, y: p.y, t: 0, c: col(d.i), big: true });
    if (d.i === cfg.me) { msg(d.by != null ? `💥 Тебя срезал ${cfg.players[d.by].name}` : "💥 Врезался!", 1600); T.haptic("notify", "error"); }
    else if (d.by === cfg.me) { msg(`✂️ Срезал ${cfg.players[d.i].name}!`, 1300); T.haptic("notify", "success"); }
  }
  function onCap(d) { if (d.i === cfg.me) { T.haptic("impact", d.n > 30 ? "heavy" : "light"); if (d.n > 40) msg(`+${d.n} 🔥`, 900); } }
  function onEnd(d) {
    phase = "end"; ended = true;
    const myTeam = team(cfg.me), win = d.win === myTeam;
    const tot = d.a.reduce((x, y) => x + y, 0) || 1;
    St.gameEnd({ win, players: cfg.players.length, mode: cfg.mode, area: d.a[cfg.me] });
    T.haptic("notify", win ? "success" : "error");
    $("end-emoji").textContent = win ? "🏆" : "🏳️";
    $("end-title").textContent = win ? "Победа!" : "В этот раз не вышло";
    const rows = cfg.players.map((p, i) => ({ p, i, a: d.a[i] })).sort((x, y) => y.a - x.a)
      .map((r) => `<div style="display:flex;justify-content:space-between;gap:8px"><span><b style="color:${r.p.color}">■</b> ${r.p.name.replace(/[<>&]/g, "")}${r.i === cfg.me ? " (ты)" : ""}</span><b>${Math.round(r.a / (N * N) * 100)}% · ✂️${d.kills[r.i]}</b></div>`).join("");
    $("end-sub").innerHTML = rows;
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

  // ---------- ввод ----------
  function turn(d) {
    if (phase !== "play" || !ps[cfg.me]) return;
    const p = ps[cfg.me]; if ((d + 2) % 4 === p.d || d === p.nd) return;
    if (isHost()) p.nd = d; else { p.nd = d; send("dir", { d }); }
    T.haptic("select");
  }
  let sw = null;
  canvas.addEventListener("pointerdown", (e) => { sw = { x: e.clientX, y: e.clientY }; });
  addEventListener("pointermove", (e) => {
    if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.hypot(dx, dy) < 22) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3)); sw = { x: e.clientX, y: e.clientY };
  });
  addEventListener("pointerup", () => { sw = null; });
  addEventListener("keydown", (e) => { const m = { ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3 }[e.key]; if (m != null) turn(m); });

  // ---------- отрисовка ----------
  function render(t, dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#94a3b8"; ctx.fillRect(0, 0, W, H);
    if (!cfg || !ps.length || ps[cfg.me].x == null) return;
    const f = Math.min(1, sinceTick / TICK);
    const ip = (p) => (Math.abs(p.x - p.px) + Math.abs(p.y - p.py) > 1 ? [p.x, p.y] : [p.px + (p.x - p.px) * f, p.py + (p.y - p.py) * f]);
    const me = ps[cfg.me], [mx, my] = ip(me);
    const cx = W / 2 - (mx + 0.5) * C, cy = H * 0.52 - (my + 0.5) * C;
    ctx.setTransform(DPR, 0, 0, DPR, DPR * cx, DPR * cy);
    // поле
    ctx.fillStyle = "#f4f7fb"; ctx.fillRect(0, 0, N * C, N * C);
    ctx.strokeStyle = "rgba(100,116,139,.12)"; ctx.lineWidth = 1;
    const vx0 = Math.max(0, Math.floor(-cx / C)), vy0 = Math.max(0, Math.floor(-cy / C)), vx1 = Math.min(N - 1, Math.ceil((W - cx) / C)), vy1 = Math.min(N - 1, Math.ceil((H - cy) / C));
    ctx.beginPath();
    for (let x = vx0; x <= vx1 + 1; x++) { ctx.moveTo(x * C, vy0 * C); ctx.lineTo(x * C, (vy1 + 1) * C); }
    for (let y = vy0; y <= vy1 + 1; y++) { ctx.moveTo(vx0 * C, y * C); ctx.lineTo((vx1 + 1) * C, y * C); }
    ctx.stroke();
    ctx.strokeStyle = "#475569"; ctx.lineWidth = 4; ctx.strokeRect(-2, -2, N * C + 4, N * C + 4);
    // земля с «бортиком»
    for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) {
      const v = terr[y * N + x]; if (!v) continue;
      const P = pal[v - 1];
      const below = y + 1 < N ? terr[(y + 1) * N + x] : 0;
      ctx.fillStyle = P.land; ctx.fillRect(x * C, y * C, C + 0.5, C + 0.5);
      if (below !== v) { ctx.fillStyle = P.edge; ctx.fillRect(x * C, y * C + C * 0.72, C + 0.5, C * 0.28 + 0.5); }
    }
    // хвосты
    for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) {
      const v = trail[y * N + x]; if (!v) continue;
      ctx.fillStyle = pal[v - 1].tail; ctx.globalAlpha = 0.75; ctx.fillRect(x * C + C * 0.12, y * C + C * 0.12, C * 0.76, C * 0.76); ctx.globalAlpha = 1;
    }
    // игроки
    ps.forEach((p, i) => {
      if (!p.alive) return;
      const [x, y] = ip(p), P = pal[i], s = C * 1.08, X = x * C + (C - s) / 2, Y = y * C + (C - s) / 2;
      ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(X + 2, Y + 4, s, s);
      ctx.fillStyle = P.dark; ctx.fillRect(X, Y + s * 0.18, s, s * 0.82);
      ctx.fillStyle = P.head; ctx.fillRect(X, Y, s, s * 0.82);
      // глаза по направлению
      const ex = DX[p.d] * s * 0.14, ey = DY[p.d] * s * 0.12;
      ctx.fillStyle = "#fff"; [-1, 1].forEach((k) => { ctx.beginPath(); ctx.arc(X + s / 2 + k * s * 0.18 + ex, Y + s * 0.38 + ey, s * 0.12, 0, 7); ctx.fill(); });
      ctx.fillStyle = "#111"; [-1, 1].forEach((k) => { ctx.beginPath(); ctx.arc(X + s / 2 + k * s * 0.18 + ex * 1.5, Y + s * 0.38 + ey * 1.5, s * 0.06, 0, 7); ctx.fill(); });
      ctx.font = `800 ${Math.round(C * 0.5)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; const nm = i === cfg.me ? "Ты" : cfg.players[i].name;
      ctx.strokeText(nm, X + s / 2, Y - 3); ctx.fillStyle = "#1e293b"; ctx.fillText(nm, X + s / 2, Y - 3);
    });
    fx = fx.filter((e) => (e.t += dt) < 0.7);
    for (const e of fx) { ctx.globalAlpha = 1 - e.t / 0.7; ctx.strokeStyle = e.c; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc((e.x + 0.5) * C, (e.y + 0.5) * C, C * (0.5 + e.t * 5), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    // мёртв — затемнение
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!me.alive) { ctx.fillStyle = "rgba(15,23,42,.35)"; ctx.fillRect(0, 0, W, H); ctx.font = "900 26px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText("Возрождение…", W / 2, H * 0.6); }
    // мини-карта
    const ms = Math.min(96, W * 0.24), mx0 = W - ms - 10, my0 = H - ms - 12 - (parseInt(getComputedStyle(document.body).getPropertyValue("--sab")) || 0);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(mx0 - 2, my0 - 2, ms + 4, ms + 4); ctx.strokeStyle = "#475569"; ctx.lineWidth = 2; ctx.strokeRect(mx0 - 2, my0 - 2, ms + 4, ms + 4);
    const q = ms / N;
    for (let k = 0; k < N * N; k++) if (terr[k]) { ctx.fillStyle = pal[terr[k] - 1].head; ctx.fillRect(mx0 + (k % N) * q, my0 + ((k / N) | 0) * q, q + 0.3, q + 0.3); }
    ps.forEach((p, i) => { if (p.alive) { ctx.fillStyle = i === cfg.me ? "#000" : "#334155"; ctx.fillRect(mx0 + p.x * q - 1.5, my0 + p.y * q - 1.5, 4, 4); } });
  }
  function hud() {
    const a = areas(), tot = N * N, by = {};
    a.forEach((v, i) => { const k = cfg.teams ? "t" + team(i) : i; by[k] = (by[k] || 0) + v; });
    $("bars").innerHTML = Object.entries(by).filter((e) => e[1] > 0).map(([k, v]) => `<i style="width:${(v / tot * 100).toFixed(1)}%;background:${k[0] === "t" ? Party.COLORS[+k.slice(1)] : col(+k)}"></i>`).join("");
    $("i-me").textContent = `🟩 ${(a[cfg.me] / tot * 100).toFixed(1)}%` + (cfg.teams ? ` · команда ${((by["t" + team(cfg.me)] || 0) / tot * 100).toFixed(0)}%` : "");
    const tl = Math.max(0, timeLeft); $("i-time").textContent = `⏱ ${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, "0")}`;
  }
  let last = 0, fullT = 0, hudT = 0;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (phase === "play") {
      sinceTick += dt;
      if (isHost()) {
        acc += dt;
        while (acc >= TICK && !ended) {
          acc -= TICK; step(); sinceTick = 0;
          tickNo++;
          if (room) { fullT -= TICK; room.sendFast("snap", snapshot(fullT <= 0)); if (fullT <= 0) fullT = 1; } else diffs = [];
        }
      } else if (lastK >= 0) {
        acc += dt;
        while (acc >= TICK) { acc -= TICK; if (predK - lastK < 3) { predK++; ps.forEach((_, i) => predictStep(i)); sinceTick = 0; } else acc = 0; }
      }
      hudT -= dt; if (hudT <= 0) { hud(); hudT = 0.25; }
    }
    render(ts / 1000, dt);
    requestAnimationFrame(frame);
  }

  const PARTY = { title: "Территория", icon: "🟦", max: 6, bots: 3, text: "Го в «Территорию» 🟦🟥 Кто захватит больше земли? Заходи!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }, { id: "t2", name: "2 команды", teams: 2 }, { id: "t3", name: "3 команды", teams: 3 }], onCancel: toMenu };
  $("m-bots").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.offline(PARTY)); };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("territoria", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#0f172a", bg: "#0f172a", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("territoria", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get ps() { return ps; }, get cfg() { return cfg; }, areas, turn, get terr() { return terr; }, get trail() { return trail; } };
})();
