/* Захват — крепости, армии, штурмы. До 6 игроков онлайн (хозяин считает мир), боты, команды. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const WW = 400, WH = 680, SPEED = 70, DURATION = 240;
  const NEUTRAL = "#64748b";

  function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- экран ----------
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR, S, OX, OY;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    const top = 70, bottom = 40;
    S = Math.min(W / WW, (H - top - bottom) / WH); OX = (W - WW * S) / 2; OY = top + (H - top - bottom - WH * S) / 2;
  }
  addEventListener("resize", resize); resize();
  const toW = (cx, cy) => ({ x: (cx - OX) / S, y: (cy - OY) / S });

  // ---------- состояние ----------
  let room = null, cfg = null, phase = "menu", nodes = [], groups = [], timeLeft = DURATION, ended = false, fx = [], snapAge = 0;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const team = (i) => (i < 0 ? -1 : cfg.players[i].team);
  const color = (i) => (i < 0 ? NEUTRAL : cfg.players[i].color);

  function genMap(seed, np) {
    const r = rng(seed), list = [];
    const want = Math.min(22, 10 + np * 2);
    for (let tries = 0; list.length < want && tries < 4000; tries++) {
      const big = r() < 0.25, rad = big ? 30 : 22;
      const x = 40 + r() * (WW - 80), y = 50 + r() * (WH - 100);
      if (list.every((n) => Math.hypot(n.x - x, n.y - y) > n.r + rad + 34)) list.push({ x, y, r: rad, cap: big ? 120 : 60, grow: big ? 2 : 1, owner: -1, n: 5 + Math.floor(r() * (big ? 25 : 15)) });
    }
    // стартовые крепости — подальше друг от друга
    const starts = [];
    for (let i = 0; i < np; i++) {
      let best = null, bd = -1;
      for (const n of list) {
        if (starts.includes(n)) continue;
        const d = starts.length ? Math.min(...starts.map((s) => Math.hypot(s.x - n.x, s.y - n.y))) : (i === 0 ? n.y : 0);
        if (d > bd) { bd = d; best = n; }
      }
      starts.push(best);
    }
    starts.forEach((n, i) => { n.owner = i; n.n = 25; n.r = 26; n.cap = 80; n.grow = 1.5; });
    return list;
  }

  // ---------- мир (хозяин) ----------
  function sendArmy(owner, from, to) {
    const a = nodes[from], b = nodes[to];
    if (!a || !b || from === to || a.owner !== owner || a.n < 2) return;
    const k = Math.floor(a.n * 0.5); a.n -= k;
    groups.push({ owner, from, to, n: k, t: 0, len: Math.hypot(b.x - a.x, b.y - a.y) });
  }
  function step(dt) {
    timeLeft -= dt;
    for (const n of nodes) {
      if (n.owner >= 0) { if (n.n < n.cap) n.n = Math.min(n.cap, n.n + n.grow * dt); else n.n -= (n.n - n.cap) * 0.2 * dt; }
    }
    for (const g of groups) {
      g.t += SPEED * dt / g.len;
      if (g.t >= 1 && !g.done) {
        g.done = true;
        const b = nodes[g.to];
        if (b.owner >= 0 && team(b.owner) === team(g.owner)) b.n += g.n;
        else { b.n -= g.n; if (b.n < 0) { b.owner = g.owner; b.n = -b.n; } }
      }
    }
    groups = groups.filter((g) => !g.done);
    botsThink(dt);
    // победа
    const alive = new Set();
    nodes.forEach((n) => { if (n.owner >= 0) alive.add(team(n.owner)); });
    groups.forEach((g) => alive.add(team(g.owner)));
    if (alive.size <= 1 || timeLeft <= 0) finish();
  }
  let botT = {};
  function botsThink(dt) {
    cfg.players.forEach((p, i) => {
      if (!p.bot) return;
      botT[i] = (botT[i] == null ? 1 + Math.random() * 2 : botT[i]) - dt;
      if (botT[i] > 0) return;
      botT[i] = 1.2 + Math.random() * 1.6;
      const mine = nodes.map((n, k) => ({ n, k })).filter((o) => o.n.owner === i).sort((a, b) => b.n.n - a.n.n);
      if (!mine.length) return;
      const src = mine[0];
      let best = null, bs = 1e9;
      nodes.forEach((t, k) => {
        if (k === src.k || (t.owner >= 0 && team(t.owner) === p.team)) return;
        const d = Math.hypot(t.x - src.n.x, t.y - src.n.y);
        const need = t.n + (t.owner >= 0 ? t.grow * d / SPEED : 0) + 2;
        if (src.n.n * 0.5 > need) { const sc = need + d / 25; if (sc < bs) { bs = sc; best = k; } }
      });
      if (best != null) sendArmy(i, src.k, best);
      else if (mine.length > 1 && Math.random() < 0.3) sendArmy(i, mine[mine.length - 1].k, src.k);
    });
  }
  function finish() {
    if (ended) return; ended = true;
    const score = {};
    nodes.forEach((n) => { if (n.owner >= 0) score[team(n.owner)] = (score[team(n.owner)] || 0) + 1000 + n.n; });
    groups.forEach((g) => { score[team(g.owner)] = (score[team(g.owner)] || 0) + g.n; });
    let win = null, best = -1; for (const k in score) if (score[k] > best) { best = score[k]; win = +k; }
    const d = { win };
    send("end", d); onEnd(d);
  }

  // ---------- снимок ----------
  function snap(withMap) {
    const s = { N: nodes.map((n) => [n.owner, Math.floor(n.n)]), G: groups.map((g) => [g.owner, g.from, g.to, g.n, Math.round(g.t * 1000)]), T: Math.ceil(timeLeft) };
    if (withMap) s.M = nodes.map((n) => [Math.round(n.x), Math.round(n.y), n.r, n.cap, n.grow]);
    return s;
  }
  function applySnap(s) {
    if (s.M) nodes = s.M.map((m, i) => Object.assign(nodes[i] || {}, { x: m[0], y: m[1], r: m[2], cap: m[3], grow: m[4] }));
    if (!nodes.length) return;
    s.N.forEach((v, i) => { if (nodes[i]) { if (nodes[i].owner !== v[0] && nodes[i].owner !== undefined) fx.push({ x: nodes[i].x, y: nodes[i].y, t: 0, c: color(v[0]) }); nodes[i].owner = v[0]; nodes[i].n = v[1]; } });
    groups = s.G.map((g) => ({ owner: g[0], from: g[1], to: g[2], n: g[3], t: g[4] / 1000, len: Math.hypot(nodes[g[2]].x - nodes[g[1]].x, nodes[g[2]].y - nodes[g[1]].y) }));
    timeLeft = s.T; snapAge = 0;
  }

  // ---------- старт ----------
  function begin(c) {
    cfg = c.cfg; room = c.room; ended = false; groups = []; fx = []; botT = {}; timeLeft = DURATION;
    phase = "play";
    ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    $("top").classList.remove("hidden"); $("hint").classList.remove("hidden");
    setTimeout(() => $("hint").classList.add("hidden"), 6000);
    nodes = genMap(cfg.seed, cfg.players.length);       // одинаково у всех (тот же seed), хозяин дальше шлёт точные числа
    if (room) {
      ["snap", "cmd", "end", "start", "roster", "host-left", "full", "left"].forEach((t) => room.off(t));
      room.on("host-left", () => { if (phase === "play") msg("Хозяин вышел 😕", 3000); });
      room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; p.name += " 🤖"; msg(`${p.name.replace(" 🤖", "")} вышел — играет бот`, 2000); } });
      room.on("snap", (s) => { if (!isHost()) applySnap(s); });
      room.on("cmd", (d, from) => { if (!isHost()) return; const idx = cfg.players.findIndex((p) => p.id === from); if (idx >= 0) (d.f || []).forEach((f) => sendArmy(idx, f, d.t)); });
      room.on("end", (d) => { if (!isHost()) onEnd(d); });
      room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
    }
    const mine = cfg.players[cfg.me];
    msg(cfg.teams ? `Ты за ${Party.TEAMNAMES[mine.team]} 🏰` : "Захвати все крепости! 🏰", 2000);
    St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: cfg.mode });
  }
  function onEnd(d) {
    phase = "end"; ended = true;
    const mineTeam = cfg.players[cfg.me].team, win = d.win === mineTeam;
    const winners = cfg.players.filter((p) => p.team === d.win).map((p) => p.name).join(", ");
    St.gameEnd({ win, players: cfg.players.length, mode: cfg.mode });
    T.haptic("notify", win ? "success" : "error");
    $("end-emoji").textContent = win ? "🏆" : "🏳️";
    $("end-title").textContent = win ? "Победа! Карта твоя" : "Поражение";
    $("end-sub").textContent = `Победил${cfg.teams ? "и" : ""}: ${winners}`;
    const b = [];
    if (isHost()) b.push(["🔁 Новая карта", "primary", () => {
      const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me;
      send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) });
    }]);
    else b.push(["Ждём, пока хозяин начнёт новую карту…", "", () => {}]);
    b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
    const box = $("end-buttons"); box.innerHTML = "";
    b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
    setTimeout(() => $("screen-end").classList.remove("hidden"), 700);
  }
  function toMenu() { phase = "menu"; $("top").classList.add("hidden"); $("screen-end").classList.add("hidden"); $("screen-menu").classList.remove("hidden"); }
  let msgT = 0;
  function msg(t, ms) { const el = $("msg"); el.textContent = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1400); }
  const PARTY = { title: "Захват", icon: "🏰", max: 6, bots: 2, text: "Го в «Захват» 🏰 Крепости, армии, штурм — заходи в комнату!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }, { id: "t2", name: "2 команды", teams: 2 }, { id: "t3", name: "3 команды", teams: 3 }], onCancel: toMenu };

  // ---------- ввод ----------
  let drag = null;
  const nodeAt = (p, pad) => nodes.findIndex((n) => Math.hypot(n.x - p.x, n.y - p.y) < n.r + (pad || 10));
  canvas.addEventListener("pointerdown", (e) => {
    if (phase !== "play") return;
    const p = toW(e.clientX, e.clientY), k = nodeAt(p, 14);
    if (k >= 0 && nodes[k].owner === cfg.me) { drag = { sel: [k], p }; T.haptic("select"); }
  });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.p = toW(e.clientX, e.clientY);
    const k = nodeAt(drag.p, 4);
    if (k >= 0 && nodes[k].owner === cfg.me && !drag.sel.includes(k)) { drag.sel.push(k); T.haptic("select"); }
  });
  addEventListener("pointerup", () => {
    if (!drag) return;
    const k = nodeAt(drag.p, 14);
    if (k >= 0) {
      const from = drag.sel.filter((f) => f !== k);
      if (from.length) {
        if (isHost()) from.forEach((f) => sendArmy(cfg.me, f, k)); else send("cmd", { f: from, t: k });
        T.haptic("impact", "medium");
      }
    }
    drag = null;
  });

  // ---------- отрисовка ----------
  function render(dt, t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bg = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, Math.max(W, H));
    bg.addColorStop(0, "#1e293b"); bg.addColorStop(1, "#0b1120"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (!nodes.length || !cfg) return;
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
    ctx.strokeStyle = "rgba(148,163,184,.08)"; ctx.lineWidth = 1;
    for (let x = 0; x <= WW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WH); ctx.stroke(); }
    for (let y = 0; y <= WH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WW, y); ctx.stroke(); }
    // отряды
    for (const g of groups) {
      const a = nodes[g.from], b = nodes[g.to]; if (!a || !b) continue;
      const tt = Math.min(1, g.t + (isHost() ? 0 : SPEED * snapAge / g.len));
      const x = a.x + (b.x - a.x) * tt, y = a.y + (b.y - a.y) * tt;
      ctx.strokeStyle = color(g.owner) + "55"; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      const k = Math.min(8, 2 + Math.floor(g.n / 6));
      ctx.fillStyle = color(g.owner);
      for (let i = 0; i < k; i++) { const a2 = i * 2.4 + t * 3, rr = 3 + i * 0.9; ctx.beginPath(); ctx.arc(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr, 3, 0, 7); ctx.fill(); }
      ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(g.n, x, y - 13); ctx.fillStyle = "#fff"; ctx.fillText(g.n, x, y - 13);
    }
    // крепости
    nodes.forEach((n, i) => {
      const mine = n.owner === cfg.me, sel = drag && drag.sel.includes(i);
      if (mine) { ctx.fillStyle = color(n.owner) + "33"; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 8 + Math.sin(t * 3) * 2, 0, 7); ctx.fill(); }
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(n.x + 3, n.y + n.r * 0.8, n.r, n.r * 0.35, 0, 0, 7); ctx.fill();
      ctx.fillStyle = color(n.owner); ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 7); ctx.fill();
      ctx.lineWidth = sel ? 4 : 2.5; ctx.strokeStyle = sel ? "#fff" : "rgba(0,0,0,.6)"; ctx.stroke();
      // заполненность
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, n.n / n.cap)); ctx.stroke();
      // башенки
      ctx.fillStyle = "rgba(0,0,0,.25)";
      for (let k = -1; k <= 1; k++) ctx.fillRect(n.x + k * n.r * 0.45 - 3, n.y - n.r * 0.75, 6, 6);
      ctx.font = `900 ${n.r > 25 ? 17 : 14}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(Math.floor(n.n), n.x, n.y + 2); ctx.fillStyle = "#fff"; ctx.fillText(Math.floor(n.n), n.x, n.y + 2);
    });
    if (drag) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      for (const k of drag.sel) { ctx.beginPath(); ctx.moveTo(nodes[k].x, nodes[k].y); ctx.lineTo(drag.p.x, drag.p.y); ctx.stroke(); }
      ctx.setLineDash([]);
      const k = nodeAt(drag.p, 14); if (k >= 0) { ctx.strokeStyle = "#ffd34d"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(nodes[k].x, nodes[k].y, nodes[k].r + 9, 0, 7); ctx.stroke(); }
    }
    fx = fx.filter((f) => (f.t += dt) < 0.6);
    for (const f of fx) { ctx.strokeStyle = f.c; ctx.globalAlpha = 1 - f.t / 0.6; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, 20 + f.t * 60, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  function hud() {
    if (!cfg || !nodes.length) return;
    const tot = {}; let all = 0;
    nodes.forEach((n) => { if (n.owner >= 0) { const k = cfg.teams ? "t" + team(n.owner) : n.owner; tot[k] = (tot[k] || 0) + n.n; all += n.n; } });
    groups.forEach((g) => { const k = cfg.teams ? "t" + team(g.owner) : g.owner; tot[k] = (tot[k] || 0) + g.n; all += g.n; });
    $("bars").innerHTML = Object.entries(tot).map(([k, v]) => `<i style="width:${(v / all * 100).toFixed(1)}%;background:${k[0] === "t" ? Party.COLORS[+k.slice(1)] : color(+k)}"></i>`).join("");
    const myForts = nodes.filter((n) => n.owner === cfg.me).length;
    $("i-me").textContent = `🏰 ${myForts} · ⚔️ ${Math.floor(tot[cfg.teams ? "t" + team(cfg.me) : cfg.me] || 0)}`;
    $("i-time").textContent = `⏱ ${Math.floor(Math.max(0, timeLeft) / 60)}:${String(Math.floor(Math.max(0, timeLeft) % 60)).padStart(2, "0")}`;
  }
  let last = 0, snapT = 0, mapT = 0, acc = 0;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (phase === "play") {
      if (isHost()) {
        acc += dt; while (acc >= 1 / 30) { step(1 / 30); acc -= 1 / 30; }
        if (room) { snapT -= dt; mapT -= dt; if (snapT <= 0) { send("snap", snap(mapT <= 0)); snapT = 1 / 8; if (mapT <= 0) mapT = 2; } }
      } else snapAge += dt;
      hud();
    }
    render(dt, ts / 1000);
    requestAnimationFrame(frame);
  }

  $("m-bots").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.offline(Object.assign({}, PARTY, { bots: 3 }))); };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("zahvat", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#0f172a", bg: "#0f172a", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("zahvat", inv, PARTY).then(begin); }
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get nodes() { return nodes; }, get groups() { return groups; }, get cfg() { return cfg; }, sendArmy, cmd(f, t) { if (isHost()) sendArmy(cfg.me, f, t); else send("cmd", { f: [f], t }); } };
})();
