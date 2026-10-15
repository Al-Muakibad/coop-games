/* Танчики — артиллерийская дуэль 1 на 1 онлайн (и против бота). Набор «Кооп-игры». */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const S_ = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const WW = 380, WH = 620, GRAV = 260, DT = 1 / 60;
  const WEAP = { std: { r: 26, dmg: 38 }, tri: { r: 17, dmg: 20 }, big: { r: 44, dmg: 60 } };

  function rng(seed) {
    let a = (seed * 2654435761) >>> 0 || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- экран ----------
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR, S, OX, OY;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    S = Math.min(W / WW, (H - 40) / WH); OX = (W - WW * S) / 2; OY = H - WH * S - 0;
  }
  addEventListener("resize", resize); resize();

  // ---------- состояние ----------
  let mode = null, room = null, phase = "menu", seed = 1, ground = [], tanks = {}, turn = 0, firstHost = true;
  let me = T.playerName() === "Друг" ? "Ты" : T.playerName(), opp = "Соперник";
  let aim = { angle: 45, power: 0.6 }, weapon = "std", ammo = { tri: 2, big: 1 }, anim = null, fx = [], wind = 0, rematch = { me: false, opp: false }, stats = { shots: 0, dmg: 0 };
  const isHost = () => !room || room.isHost;
  const mySide = () => (isHost() ? "host" : "guest");
  const oppSide = () => (isHost() ? "guest" : "host");
  const shooterSide = () => ((turn % 2 === 0) === firstHost ? "host" : "guest");
  const myTurn = () => shooterSide() === mySide();
  const send = (t, d) => { if (room) room.send(t, d); };

  function genGround(sd) {
    const r = rng(sd), a = [r() * 6, r() * 6, r() * 6], amp = [40 + r() * 40, 18 + r() * 20, 6 + r() * 8];
    const g = [];
    for (let x = 0; x <= WW; x++) {
      let y = 390 - amp[0] * Math.sin(x / 95 + a[0]) - amp[1] * Math.sin(x / 41 + a[1]) - amp[2] * Math.sin(x / 13 + a[2]);
      const hill = Math.exp(-((x - WW / 2) ** 2) / (2 * 70 * 70)) * (60 + r() * 0); y -= hill;
      g.push(Math.round(y));
    }
    for (const cx of [48, 332]) { const base = g[cx]; for (let x = cx - 18; x <= cx + 18; x++) g[x] = base; }
    return g;
  }
  const groundAt = (x) => ground[Math.max(0, Math.min(WW, Math.round(x)))];
  function windFor(k) { const r = rng(seed * 1000 + k * 7 + 3); return Math.round((r() * 2 - 1) * 55); }

  // ---------- физика выстрела (считает стреляющий) ----------
  function simulate(side, angle, power, w, g) {
    const tk = tanks[side], gr = g || ground;
    const offs = w === "tri" ? [-5, 0, 5] : [0];
    const shells = [];
    for (const off of offs) {
      const a = (angle + off) * Math.PI / 180, v = 130 + power * 330;
      let x = tk.x + Math.cos(a) * 18, y = tk.y - 12 - Math.sin(a) * 18, vx = Math.cos(a) * v, vy = -Math.sin(a) * v, t = 0;
      const path = [[Math.round(x), Math.round(y)]]; let hit = null;
      for (let i = 0; i < 1200; i++) {
        vx += wind * DT; vy += GRAV * DT; x += vx * DT; y += vy * DT; t += DT;
        if (i % 2 === 0) path.push([Math.round(x), Math.round(y)]);
        if (x < -30 || x > WW + 30 || y > WH + 20) break;
        if (x >= 0 && x <= WW && y >= gr[Math.round(x)]) { hit = { x: Math.round(x), y: Math.round(y) }; break; }
        let tankHit = false;
        for (const s of ["host", "guest"]) { const o = tanks[s]; if (t > 0.15 && Math.abs(x - o.x) < 19 && y > o.y - 22 && y < o.y + 2) tankHit = true; }
        if (tankHit) { hit = { x: Math.round(x), y: Math.round(y) }; break; }
      }
      if (hit) path.push([hit.x, hit.y]);
      shells.push({ path, hit });
    }
    const impacts = shells.filter((s) => s.hit).map((s) => ({ x: s.hit.x, y: s.hit.y, r: WEAP[w].r }));
    const dmg = { host: 0, guest: 0 };
    for (const im of impacts) for (const s of ["host", "guest"]) {
      const o = tanks[s], d = Math.hypot(im.x - o.x, im.y - (o.y - 8)), R = im.r + 12;
      if (d < R) dmg[s] += Math.round(WEAP[w].dmg * (1 - d / R * 0.7));
    }
    return { shells: shells.map((s) => s.path), impacts, dmg };
  }
  function crater(im) {
    for (let x = Math.max(0, im.x - im.r); x <= Math.min(WW, im.x + im.r); x++) {
      const dy = Math.round(Math.sqrt(im.r * im.r - (x - im.x) ** 2));
      const bottom = im.y + dy, top = im.y - dy;
      if (ground[x] < bottom && ground[x] >= top - 200) ground[x] = Math.max(ground[x], bottom) > WH - 20 ? WH - 20 : Math.max(ground[x], bottom);
    }
  }

  // ---------- ход игры ----------
  function startMatch(sd, hostFirst) {
    seed = sd; firstHost = hostFirst; ground = genGround(sd); turn = 0;
    tanks = { host: { x: 48, y: ground[48], hp: 100, ang: 45 }, guest: { x: 332, y: ground[332], hp: 100, ang: 135 } };
    botShots = 0; ammo = { tri: 2, big: 1 }; weapon = "std"; stats = { shots: 0, dmg: 0 }; rematch = { me: false, opp: false };
    phase = "aim"; ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
    $("hud").classList.remove("hidden"); $("controls").classList.remove("hidden");
    $("n1").textContent = me; $("n2").textContent = opp;
    S_.gameStart({ mode });
    beginTurn();
  }
  function beginTurn() {
    wind = windFor(turn); phase = "aim";
    const mine = myTurn();
    aim = { angle: tanks[shooterSide()].ang, power: aim.power || 0.6 };
    $("wind").textContent = wind === 0 ? "💨 0" : (wind > 0 ? "💨 " + Math.abs(wind) + " →" : "← " + Math.abs(wind) + " 💨");
    $("turn").textContent = mine ? "🎯 Твой выстрел" : `⏳ Стреляет ${opp}`;
    $("controls").style.opacity = mine ? 1 : 0.4; $("fire").disabled = !mine;
    updWeapons(); hud();
    if (mine) { msg("Тяни пальцем — целься", 1200); T.haptic("impact", "medium"); }
    if (mode === "bot" && !mine) setTimeout(botShoot, 1100);
    S_.state({ turn, hp: tanks[mySide()].hp });
    if (pendingShot && pendingShot.k === turn) { const p = pendingShot; pendingShot = null; playShot(p); }
  }
  function hud() {
    const L = mySide() === "host" ? "host" : "guest";       // слева всегда я
    $("h1").style.width = Math.max(0, tanks[mySide()].hp) + "%"; $("h2").style.width = Math.max(0, tanks[oppSide()].hp) + "%";
    $("aiminfo").textContent = myTurn() && phase === "aim" ? `угол ${Math.round(displayAngle())}° · сила ${Math.round(aim.power * 100)}%` : "";
  }
  function displayAngle() { return mySide() === "host" ? aim.angle : 180 - aim.angle; }
  function updWeapons() {
    document.querySelectorAll(".wp").forEach((b) => {
      const w = b.dataset.w; b.classList.toggle("on", w === weapon);
      b.disabled = !myTurn() || (w !== "std" && ammo[w] <= 0);
    });
    $("c-tri").textContent = ammo.tri; $("c-big").textContent = ammo.big;
  }
  function fire() {
    if (phase !== "aim" || !myTurn()) return;
    if (weapon !== "std") { if (ammo[weapon] <= 0) return; ammo[weapon]--; }
    const res = simulate(mySide(), aim.angle, aim.power, weapon);
    stats.shots++; stats.dmg += res.dmg[oppSide()];
    const d = { k: turn, ang: aim.angle, w: weapon, shells: res.shells, impacts: res.impacts, dmg: res.dmg };
    send("shot", d); playShot(d);
    if (weapon !== "std" && ammo[weapon] <= 0) weapon = "std";
    T.haptic("impact", "heavy");
  }
  let pendingShot = null, botShots = 0;
  function playShot(d) {
    if (d.k !== turn || phase !== "aim") { if (d.k >= turn) pendingShot = d; return; }
    tanks[shooterSide()].ang = d.ang;
    phase = "fly"; anim = { d, t: 0, len: Math.max(...d.shells.map((p) => p.length)) };
    $("fire").disabled = true; hud();
  }
  function landShot(d) {
    for (const im of d.impacts) { crater(im); fx.push({ x: im.x, y: im.y, r: im.r, t: 0 }); }
    for (const s of ["host", "guest"]) { tanks[s].hp -= d.dmg[s]; tanks[s].y = groundAt(tanks[s].x); }
    const myD = d.dmg[mySide()], oppD = d.dmg[oppSide()];
    if (oppD > 0 && myTurn()) msg(`Попал! −${oppD}`, 1300);
    else if (myD > 0) { msg(`По тебе −${myD}`, 1300); T.haptic("notify", "error"); }
    else msg(myTurn() ? "Мимо" : "Промах соперника", 900);
    T.haptic("impact", "heavy");
    hud();
    phase = "wait";
    setTimeout(() => {
      if (tanks.host.hp <= 0 || tanks.guest.hp <= 0) return finish();
      turn++; beginTurn();
    }, 1400);
  }
  function finish() {
    phase = "end"; $("controls").classList.add("hidden");
    const a = tanks[mySide()].hp, b = tanks[oppSide()].hp, win = b <= 0 && a > 0, draw = a <= 0 && b <= 0;
    S_.gameEnd({ mode, win, draw, shots: stats.shots, dmg: stats.dmg, turns: turn + 1 });
    $("end-emoji").textContent = draw ? "🤝" : win ? "🏆" : "💥";
    $("end-title").textContent = draw ? "Взаимное уничтожение!" : win ? "Победа!" : `Победил ${opp}`;
    $("end-sub").textContent = `Выстрелов: ${stats.shots} · урон по сопернику: ${stats.dmg}`;
    $("end-status").textContent = "";
    const b2 = [["🔁 Реванш", "primary", askRematch]];
    if (mode === "bot") b2.push(["⚔️ Позвать друга", "", () => { leave(); invite(); }]);
    b2.push(["В меню", "ghost", () => { leave(); toMenu(); }]);
    buttons(b2);
    setTimeout(() => $("screen-end").classList.remove("hidden"), 900);
  }
  function buttons(list) { const box = $("end-buttons"); box.innerHTML = ""; list.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); }); }
  function askRematch() {
    if (mode === "bot") return startMatch(Math.floor(Math.random() * 1e5), Math.random() < 0.5);
    rematch.me = true; send("rematch", {}); $("end-status").textContent = `Ждём ${opp}…`; tryRematch();
  }
  function tryRematch() { if (rematch.me && rematch.opp && isHost()) hostStart(); else if (rematch.opp && !rematch.me) $("end-status").innerHTML = `<b style="color:#e5484d;font-size:18px">🔥 ${opp} хочет реванш!</b>`; { const b = $("end-buttons").querySelector(".btn.primary"); if (b) b.textContent = "✅ Принять реванш"; } T.haptic("notify", "warning"); }
  function hostStart() { const d = { seed: Math.floor(Math.random() * 1e5), hostFirst: Math.random() < 0.5 }; send("start", d); startMatch(d.seed, d.hostFirst); }
  function leave() { if (room) { room.close(); room = null; } }
  function toMenu() { phase = "menu"; ["hud", "controls", "screen-end"].forEach((s) => $(s).classList.add("hidden")); $("screen-menu").classList.remove("hidden"); }
  let msgT = 0;
  function msg(t, ms) { const el = $("msg"); el.textContent = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1200); }

  // ---------- сеть ----------
  function bind(rm) {
    rm.on("start", (d) => startMatch(d.seed, d.hostFirst));
    rm.on("shot", (d) => playShot(d));
    rm.on("rematch", () => { rematch.opp = true; tryRematch(); });
    rm.on("peer-left", () => {
      if (phase === "menu") return;
      phase = "end"; $("controls").classList.add("hidden");
      $("end-emoji").textContent = "🚪"; $("end-title").textContent = `${opp} вышел из игры`; $("end-sub").textContent = ""; $("end-status").textContent = "";
      buttons([["⚔️ Позвать снова", "primary", () => { leave(); invite(); }], ["В меню", "ghost", () => { leave(); toMenu(); }]]);
      $("screen-end").classList.remove("hidden");
    });
  }
  async function invite() {
    mode = "online"; $("screen-menu").classList.add("hidden"); S_.event("invite_create", {});
    room = await Lobby.host("tanki", { text: "Танковая дуэль 1 на 1 🛡️💥 Заходи, я уже в окопе!", onCancel: toMenu, onBot: startBot });
    opp = room.peer ? room.peer.name : "Друг"; bind(room); setTimeout(hostStart, 300);
  }
  async function joinInvite(id) {
    mode = "online"; $("screen-menu").classList.add("hidden");
    room = await Lobby.join("tanki", id, { onCancel: toMenu, onBot: startBot });
    S_.event("invite_join", {}); opp = room.peer ? room.peer.name : "Друг"; bind(room);
  }
  function startBot() { leave(); mode = "bot"; opp = "🤖 Бот-артиллерист"; $("screen-menu").classList.add("hidden"); startMatch(Math.floor(Math.random() * 1e5), Math.random() < 0.5); }
  function botShoot() {
    if (phase !== "aim" || myTurn()) return;
    const side = oppSide(), target = tanks[mySide()];
    let best = null;
    for (let i = 0; i < 90; i++) {
      const ang = side === "guest" ? 95 + Math.random() * 70 : 15 + Math.random() * 70, pw = 0.2 + Math.random() * 0.8;
      const r = simulate(side, ang, pw, "std");
      const im = r.impacts[0], d = im ? Math.hypot(im.x - target.x, im.y - target.y) : 1e9;
      if (!best || d < best.d) best = { ang, pw, d };
    }
    const w = ammo.big > 0 && Math.random() < 0.25 ? "big" : Math.random() < 0.2 ? "tri" : "std";
    const err = Math.max(0.25, 1 - botShots * 0.2); botShots++;          // с каждым выстрелом бот пристреливается
    const ang = best.ang + (Math.random() - 0.5) * 14 * err, pw = Math.max(0.1, Math.min(1, best.pw + (Math.random() - 0.5) * 0.22 * err));
    const res = simulate(side, ang, pw, w);
    playShot({ k: turn, ang, w, shells: res.shells, impacts: res.impacts, dmg: res.dmg });
  }

  // ---------- рисование ----------
  function drawTank(tk, color, ang) {
    ctx.save(); ctx.translate(tk.x, tk.y); ctx.scale(1.2, 1.2);
    const a = ang * Math.PI / 180;
    ctx.strokeStyle = "#1d1d1d"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(Math.cos(a) * 20, -12 - Math.sin(a) * 20); ctx.stroke();
    ctx.fillStyle = color; ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -10, 8, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-16, -10, 32, 9, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#333"; ctx.beginPath(); ctx.roundRect(-17, -2, 34, 6, 3); ctx.fill();
    ctx.fillStyle = "#777"; for (let i = -12; i <= 12; i += 6) { ctx.beginPath(); ctx.arc(i, 1, 2, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function render(dt, t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#4a90e2"); sky.addColorStop(1, "#ffd9a8");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * OX, DPR * OY);
    if (!ground.length) return;
    ctx.fillStyle = "#ffe9a6"; ctx.beginPath(); ctx.arc(300, 110, 30, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(90,110,150,.45)"; ctx.beginPath(); ctx.moveTo(0, 300);
    for (let x = 0; x <= WW; x += 10) ctx.lineTo(x, 270 + Math.sin(x / 60 + seed) * 30 + Math.sin(x / 23) * 10); ctx.lineTo(WW, 700); ctx.lineTo(0, 700); ctx.fill();
    for (let i = 0; i < 4; i++) { const cx = ((i * 160 + t * (6 + wind * 0.3)) % 700 + 700) % 700 - 100, cy = 90 + i * 40; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.ellipse(cx, cy, 40, 12, 0, 0, 7); ctx.ellipse(cx + 22, cy - 8, 24, 12, 0, 0, 7); ctx.fill(); }
    const gg = ctx.createLinearGradient(0, 300, 0, WH); gg.addColorStop(0, "#7cb342"); gg.addColorStop(0.08, "#8d6e4a"); gg.addColorStop(1, "#4e3826");
    ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(0, WH + 50);
    for (let x = 0; x <= WW; x++) ctx.lineTo(x, ground[x]); ctx.lineTo(WW, WH + 50); ctx.fill();
    ctx.strokeStyle = "#5e9e2f"; ctx.lineWidth = 5; ctx.beginPath(); for (let x = 0; x <= WW; x += 2) x ? ctx.lineTo(x, ground[x] + 1) : ctx.moveTo(x, ground[x] + 1); ctx.stroke();
    if (tanks.host) {
      for (const s of ["host", "guest"]) { const tk = tanks[s]; tk.y += (groundAt(tk.x) - tk.y) * 0.3; }
      const myC = "#3b82f6", opC = "#ef4444";
      const angFor = (s) => (phase === "aim" && shooterSide() === s && myTurn() ? aim.angle : tanks[s].ang);
      drawTank(tanks.host, mySide() === "host" ? myC : opC, angFor("host"));
      drawTank(tanks.guest, mySide() === "guest" ? myC : opC, angFor("guest"));
      if (phase === "aim" && myTurn()) {        // подсказка траектории (только начало)
        const saveW = wind; const res = simulate(mySide(), aim.angle, aim.power, "std");
        wind = saveW;
        const p = res.shells[0];
        ctx.fillStyle = "rgba(255,255,255,.9)";
        for (let i = 2; i < Math.min(p.length, 22); i += 2) { ctx.beginPath(); ctx.arc(p[i][0], p[i][1], 2.2, 0, 7); ctx.fill(); }
      }
    }
    if (anim) {
      anim.t += dt * 60 / 2 * 1.6;
      const k = Math.floor(anim.t);
      for (const p of anim.d.shells) {
        const i = Math.min(k, p.length - 1);
        ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.beginPath();
        for (let j = Math.max(0, i - 12); j <= i; j++) j === Math.max(0, i - 12) ? ctx.moveTo(p[j][0], p[j][1]) : ctx.lineTo(p[j][0], p[j][1]); ctx.stroke();
        if (k < p.length) { ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(p[i][0], p[i][1], anim.d.w === "big" ? 6 : 4, 0, 7); ctx.fill(); }
      }
      if (k >= anim.len) { const d = anim.d; anim = null; landShot(d); }
    }
    fx = fx.filter((f) => (f.t += dt) < 0.7);
    for (const f of fx) {
      const k = f.t / 0.7;
      ctx.fillStyle = `rgba(255,${Math.round(200 - k * 150)},60,${1 - k})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + k), 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(80,60,40,${0.6 * (1 - k)})`;
      for (let i = 0; i < 8; i++) { const a = i * 0.8; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * f.r * k * 1.4, f.y - Math.abs(Math.sin(a)) * f.r * k * 1.6, 3, 0, 7); ctx.fill(); }
    }
  }
  let last = 0;
  function frame(ts) { const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts; render(dt, ts / 1000); if (phase === "aim") hud(); requestAnimationFrame(frame); }

  // ---------- ввод ----------
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { if (phase === "aim" && myTurn()) drag = { x: e.clientX, y: e.clientY, a: aim.angle, p: aim.power }; });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = drag.x - e.clientX, dy = drag.y - e.clientY, len = Math.hypot(dx, dy);
    if (len < 12) return;
    let ang = Math.atan2(-dy, dx) * 180 / Math.PI;    // тянем назад — летит вперёд
    ang = Math.max(5, Math.min(175, ang < 0 ? (ang < -90 ? 175 : 5) : ang));
    aim.angle = ang; aim.power = Math.max(0.05, Math.min(1, len / (Math.min(W, H) * 0.42)));
  });
  addEventListener("pointerup", () => { drag = null; });
  document.querySelectorAll(".wp").forEach((b) => b.addEventListener("click", () => { if (b.disabled) return; weapon = b.dataset.w; updWeapons(); T.haptic("select"); }));
  $("fire").addEventListener("click", fire);
  $("m-invite").onclick = invite; $("m-bot").onclick = startBot; $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#4a90e2", bg: "#20304f", back: "../" });
  const inv = Net.readInvite(); if (inv) joinInvite(inv);
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get tanks() { return tanks; }, get turn() { return turn; }, myTurn, aim, fire, startBot, invite, get roomId() { return room && room.id; }, setAim(a, p) { aim.angle = a; aim.power = p; } };
})();
