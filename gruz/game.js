/* Хрупкий груз — Telegram Mini App. Физика: Matter.js 0.19 (MIT). */
(function () {
  "use strict";

  const CFG = window.GAME_CONFIG;
  const { Engine, Bodies, Body, Composite, Constraint } = Matter;
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined
    ? window.Telegram.WebApp : null;

  // ---------- константы мира ----------
  const UNITS_PER_M = 50;
  const STEP_MS = 1000 / 60;
  const ROUND_STEPS = CFG.roundSeconds * 60;
  const SETTLE_STEPS = 150; // 2,5 с обратного отсчёта, пока груз садится
  const GROUND_Y = 400;
  const SEG = 40;
  const WORLD_END = 70000;

  const CARGO_DEFS = [
    { emoji: "📦", w: 62, h: 48, x: -48, row: 0 },
    { emoji: "📦", w: 54, h: 44, x: 26, row: 0 },
    { emoji: "📺", w: 58, h: 44, x: -40, row: 1, fragile: true },
    { emoji: "🪴", w: 40, h: 48, x: 30, row: 1 },
    { emoji: "🍉", r: 21, x: -14, row: 2, fragile: true },
    { emoji: "🥚", r: 13, x: 34, row: 2, fragile: true }
  ];

  // ---------- canvas ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1, zoom = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    zoom = Math.min(W / 470, H / 620);
    zoom = Math.max(0.5, Math.min(zoom, 1.3));
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- рельеф ----------
  function terrainHeight(x) {
    if (x < 300) return 0;
    const t = x - 300;
    const amp = Math.min(1 + t / 5000, 2.8);
    const ramp = Math.min(t / 400, 1);
    const h = 26 * Math.sin(t / 170) + 18 * Math.sin(t / 89 + 1.3) + 9 * Math.sin(t / 41 + 0.7);
    return -h * amp * ramp + (Math.sin(t / 1300) * 60) * ramp;
  }
  const terrainPts = [];
  for (let x = -800; x <= WORLD_END; x += SEG) terrainPts.push({ x, y: GROUND_Y + terrainHeight(x) });

  function groundYAt(x) {
    const i = Math.floor((x + 800) / SEG);
    const a = terrainPts[Math.max(0, Math.min(i, terrainPts.length - 2))];
    const b = terrainPts[Math.max(1, Math.min(i + 1, terrainPts.length - 1))];
    const k = (x - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * k;
  }

  // ---------- состояние ----------
  let engine, chassis, wheels, cargo, startX, cartGroup;
  let state = "start"; // start | settle | play | end
  let steps = 0, playSteps = 0, flipSteps = 0, maxDist = 0;
  let input = 0;
  let camX = 0, camY = GROUND_Y - 60;
  let floaters = [];
  let endReason = "";
  let best = 0;
  let challenge = null;

  function buildWorld() {
    engine = Engine.create({ positionIterations: 8, velocityIterations: 6 });
    engine.gravity.y = 1;
    const world = engine.world;

    const ground = [];
    for (let i = 0; i < terrainPts.length - 1; i++) {
      const p0 = terrainPts[i], p1 = terrainPts[i + 1];
      const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy);
      const nx = -dy / len, ny = dx / len; // нормаль вниз, в землю
      const th = 40;
      ground.push(Bodies.rectangle(
        (p0.x + p1.x) / 2 + nx * th / 2, (p0.y + p1.y) / 2 + ny * th / 2, len + 2, th,
        { isStatic: true, angle: Math.atan2(dy, dx), friction: 1, label: "ground" }
      ));
    }
    Composite.add(world, ground);

    const x0 = 0, y0 = GROUND_Y - 70;
    const group = Body.nextGroup(true);
    cartGroup = group;
    const cf = { group };
    const bed = Bodies.rectangle(x0, y0, 190, 16, { collisionFilter: cf });
    const lipL = Bodies.rectangle(x0 - 90, y0 - 12, 10, 26, { collisionFilter: cf });
    const lipR = Bodies.rectangle(x0 + 90, y0 - 12, 10, 26, { collisionFilter: cf });
    chassis = Body.create({ parts: [bed, lipL, lipR], collisionFilter: cf, friction: 0.8, label: "chassis" });
    Body.setDensity(chassis, 0.0025);

    const wOpts = { collisionFilter: cf, friction: 1, frictionStatic: 2, restitution: 0, density: 0.004, label: "wheel" };
    wheels = [Bodies.circle(x0 - 62, y0 + 30, 26, wOpts), Bodies.circle(x0 + 62, y0 + 30, 26, wOpts)];
    const axles = wheels.map((w, i) => Constraint.create({
      bodyA: chassis, pointA: { x: i ? 62 : -62, y: 30 }, bodyB: w, length: 0, stiffness: 0.6, damping: 0.15
    }));
    Composite.add(world, [chassis, ...wheels, ...axles]);

    const bedTop = y0 - 8;
    const rowY = [bedTop - 26, bedTop - 50 - 26, bedTop - 98 - 24];
    cargo = CARGO_DEFS.map((d) => {
      const opts = { friction: 0.9, frictionStatic: 1.4, restitution: 0.04, density: 0.0012, label: "cargo" };
      const y = rowY[d.row];
      const body = d.r ? Bodies.circle(x0 + d.x, y, d.r, opts) : Bodies.rectangle(x0 + d.x, y, d.w, d.h, opts);
      return { def: d, body, lost: false };
    });
    Composite.add(world, cargo.map((c) => c.body));

    startX = chassis.position.x;
    camX = startX + 100; camY = chassis.position.y - 60;
  }

  // ---------- управление ----------
  const btnGas = document.getElementById("btn-gas");
  const btnBack = document.getElementById("btn-back");
  const held = { gas: false, back: false };
  function bindHold(btn, key) {
    const on = (e) => { e.preventDefault(); held[key] = true; btn.classList.add("pressed"); haptic("impact", "light"); };
    const off = (e) => { e && e.preventDefault(); held[key] = false; btn.classList.remove("pressed"); };
    btn.addEventListener("pointerdown", on);
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => btn.addEventListener(ev, off));
  }
  bindHold(btnGas, "gas"); bindHold(btnBack, "back");
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") held.gas = true;
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") held.back = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") held.gas = false;
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") held.back = false;
  });

  function haptic(kind, style) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "impact") tg.HapticFeedback.impactOccurred(style);
      else tg.HapticFeedback.notificationOccurred(style);
    } catch (_) { /* старые клиенты */ }
  }

  // ---------- шаг физики ----------
  function step() {
    steps++;
    input = state === "play" ? (held.gas ? 1 : 0) - (held.back ? 1 : 0) : 0;

    for (const w of wheels) {
      let av = w.angularVelocity;
      if (input > 0) av += (0.34 - av) * 0.06;
      else if (input < 0) av += (-0.2 - av) * 0.1;
      else av *= 0.985;
      Body.setAngularVelocity(w, av);
    }
    if (input !== 0) {
      const grounded = wheels.some((w) => w.position.y > groundYAt(w.position.x) - 30);
      if (!grounded) Body.setAngularVelocity(chassis, chassis.angularVelocity - 0.0025 * input);
    }

    Engine.update(engine, STEP_MS);

    if (state === "settle" && steps >= SETTLE_STEPS) beginPlay();
    if (state !== "play") return;
    playSteps++;

    const cx = chassis.position.x, cy = chassis.position.y;
    maxDist = Math.max(maxDist, (cx - startX) / UNITS_PER_M);

    for (const c of cargo) {
      if (c.lost) continue;
      const p = c.body.position;
      if (p.y > cy + 70 || Math.abs(p.x - cx) > 260) {
        c.lost = true;
        // упавший груз больше не цепляется за машину, только за землю
        c.body.collisionFilter = { group: cartGroup, category: 1, mask: 0xFFFFFFFF };
        floaters.push({ x: p.x, y: p.y - 30, text: c.def.fragile ? "💥" : "−" + c.def.emoji, life: 70 });
        haptic("notify", "error");
        renderCargoHud();
      }
    }

    let a = chassis.angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    flipSteps = Math.abs(a) > 1.9 ? flipSteps + 1 : 0;

    const alive = cargo.filter((c) => !c.lost).length;
    if (flipSteps > 70) finish("flip");
    else if (alive === 0) finish("empty");
    else if (playSteps >= ROUND_STEPS) finish("time");
  }

  // ---------- отрисовка ----------
  const toSX = (x) => (x - camX) * zoom + W / 2;
  const toSY = (y) => (y - camY) * zoom + H * 0.5;

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#8fd3ff"); g.addColorStop(1, "#ffe7b8");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 6; i++) {
      const px = ((i * 260 - camX * 0.15) % (W + 300) + W + 300) % (W + 300) - 150;
      const py = 60 + (i % 3) * 45;
      ctx.beginPath();
      ctx.ellipse(px, py, 46, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(px + 30, py - 10, 30, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const layers = [{ k: 0.25, col: "#b9d98c", amp: 50, base: 0.62 }, { k: 0.45, col: "#9cc76b", amp: 34, base: 0.7 }];
    for (const L of layers) {
      ctx.fillStyle = L.col; ctx.beginPath(); ctx.moveTo(0, H);
      for (let sx = 0; sx <= W + 10; sx += 10) {
        const wx = sx + camX * L.k;
        ctx.lineTo(sx, H * L.base - L.amp * (Math.sin(wx / 160) * 0.6 + Math.sin(wx / 71) * 0.4));
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }
  }

  function drawTerrain() {
    const left = camX - W / 2 / zoom - SEG * 2, right = camX + W / 2 / zoom + SEG * 2;
    const i0 = Math.max(0, Math.floor((left + 800) / SEG)), i1 = Math.min(terrainPts.length - 1, Math.ceil((right + 800) / SEG));
    ctx.beginPath();
    ctx.moveTo(toSX(terrainPts[i0].x), H + 10);
    for (let i = i0; i <= i1; i++) ctx.lineTo(toSX(terrainPts[i].x), toSY(terrainPts[i].y));
    ctx.lineTo(toSX(terrainPts[i1].x), H + 10); ctx.closePath();
    const g = ctx.createLinearGradient(0, toSY(GROUND_Y - 120), 0, H);
    g.addColorStop(0, "#c9874f"); g.addColorStop(1, "#7a4a2a");
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const sx = toSX(terrainPts[i].x), sy = toSY(terrainPts[i].y);
      i === i0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.lineWidth = 9 * zoom; ctx.strokeStyle = "#5fae3b"; ctx.lineJoin = "round"; ctx.stroke();

    const mStep = 25 * UNITS_PER_M;
    for (let mx = Math.ceil(left / mStep) * mStep; mx < right; mx += mStep) {
      const m = Math.round((mx - startX) / UNITS_PER_M);
      if (m <= 0) continue;
      const sx = toSX(mx), sy = toSY(groundYAt(mx));
      ctx.strokeStyle = "#2b1d14"; ctx.lineWidth = 3 * zoom;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 70 * zoom); ctx.stroke();
      ctx.fillStyle = m % 100 === 0 ? "#ff7a2f" : "#fff7ea";
      ctx.beginPath(); ctx.moveTo(sx, sy - 70 * zoom); ctx.lineTo(sx + 44 * zoom, sy - 60 * zoom); ctx.lineTo(sx, sy - 50 * zoom); ctx.fill();
      ctx.fillStyle = "#2b1d14"; ctx.font = `800 ${Math.round(13 * zoom)}px sans-serif`; ctx.textAlign = "left";
      ctx.fillText(m + " м", sx + 4 * zoom, sy - 56 * zoom);
    }
  }

  function drawPoly(body, fill, stroke) {
    const v = body.vertices;
    ctx.beginPath(); ctx.moveTo(toSX(v[0].x), toSY(v[0].y));
    for (let i = 1; i < v.length; i++) ctx.lineTo(toSX(v[i].x), toSY(v[i].y));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 3 * zoom; ctx.strokeStyle = stroke; ctx.stroke();
  }

  function drawCart() {
    for (const w of wheels) {
      const sx = toSX(w.position.x), sy = toSY(w.position.y), r = 26 * zoom;
      ctx.fillStyle = "#2b1d14"; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e9e1d4"; ctx.beginPath(); ctx.arc(sx, sy, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#2b1d14"; ctx.lineWidth = 3 * zoom;
      for (let k = 0; k < 3; k++) {
        const a = w.angle + k * Math.PI / 1.5;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * r * 0.55, sy + Math.sin(a) * r * 0.55); ctx.stroke();
      }
    }
    for (let i = 1; i < chassis.parts.length; i++) drawPoly(chassis.parts[i], i === 1 ? "#ff7a2f" : "#d95a12", "#2b1d14");
    // кабина водителя
    const ang = chassis.angle, c = Math.cos(ang), s = Math.sin(ang);
    const ox = chassis.position.x + c * 70 - s * -30, oy = chassis.position.y + s * 70 + c * -30;
    ctx.save(); ctx.translate(toSX(ox), toSY(oy)); ctx.rotate(ang);
    ctx.font = `${Math.round(30 * zoom)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.scale(-1, 1); ctx.fillText("🧑‍🦱", 0, 0); ctx.restore();
  }

  function drawCargo() {
    for (const c of cargo) {
      const b = c.body, d = c.def;
      ctx.save(); ctx.translate(toSX(b.position.x), toSY(b.position.y)); ctx.rotate(b.angle);
      if (!d.r) {
        ctx.fillStyle = c.lost ? "rgba(255,255,255,0.35)" : "rgba(255,247,234,0.9)";
        ctx.strokeStyle = "#2b1d14"; ctx.lineWidth = 2 * zoom;
        const w = d.w * zoom, h = d.h * zoom;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, 6 * zoom) : ctx.rect(-w / 2, -h / 2, w, h);
        ctx.fill(); ctx.stroke();
      }
      const size = (d.r ? d.r * 2.1 : Math.min(d.w, d.h) * 0.95) * zoom;
      ctx.globalAlpha = c.lost ? 0.5 : 1;
      ctx.font = `${Math.round(size)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(d.emoji, 0, 2 * zoom);
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  function drawFloaters() {
    floaters = floaters.filter((f) => f.life-- > 0);
    for (const f of floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 30);
      ctx.font = `900 ${Math.round(28 * zoom)}px sans-serif`; ctx.textAlign = "center";
      ctx.fillText(f.text, toSX(f.x), toSY(f.y - (70 - f.life) * 0.8));
    }
    ctx.globalAlpha = 1;
  }

  function drawCountdown() {
    if (state !== "settle") return;
    const left = Math.ceil((SETTLE_STEPS - steps) / 50);
    ctx.font = `900 ${Math.round(80 * Math.max(zoom, 0.8))}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 8; ctx.strokeStyle = "#2b1d14"; ctx.fillStyle = "#fff7ea";
    const t = left > 0 ? String(left) : "Газ!";
    ctx.strokeText(t, W / 2, H * 0.3); ctx.fillText(t, W / 2, H * 0.3);
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(); drawTerrain(); drawCart(); drawCargo(); drawFloaters(); drawCountdown();
  }

  // ---------- HUD ----------
  const hud = document.getElementById("hud");
  const controls = document.getElementById("controls");
  const hudTime = document.getElementById("hud-time");
  const hudDist = document.getElementById("hud-dist");
  const hudCargo = document.getElementById("hud-cargo");
  function renderCargoHud() {
    hudCargo.innerHTML = cargo.map((c) => `<span class="${c.lost ? "lost" : ""}">${c.def.emoji}</span>`).join("");
  }
  function updateHud() {
    const left = Math.max(0, Math.ceil((ROUND_STEPS - playSteps) / 60));
    hudTime.textContent = state === "settle" ? CFG.roundSeconds : left;
    hudTime.classList.toggle("warn", state === "play" && left <= 10);
    hudDist.textContent = Math.floor(maxDist) + " м";
  }

  // ---------- игровой цикл ----------
  let last = 0, acc = 0;
  function frame(t) {
    if (!last) last = t;
    acc += Math.min(t - last, 100); last = t;
    let n = 0;
    while (acc >= STEP_MS && n < 5) {
      if (state === "settle" || state === "play") step();
      acc -= STEP_MS; n++;
    }
    if (chassis) {
      camX += (chassis.position.x + 110 - camX) * 0.08;
      camY += (chassis.position.y - 60 - camY) * 0.06;
    }
    render();
    if (state === "play" || state === "settle") updateHud();
    requestAnimationFrame(frame);
  }

  // ---------- экраны ----------
  const scrStart = document.getElementById("screen-start");
  const scrEnd = document.getElementById("screen-end");
  function show(el, on) { el.classList.toggle("hidden", !on); }

  function startRound() {
    buildWorld();
    steps = 0; playSteps = 0; flipSteps = 0; maxDist = 0; floaters = [];
    held.gas = held.back = false;
    state = "settle";
    show(scrStart, false); show(scrEnd, false); show(hud, true); show(controls, true);
    renderCargoHud(); updateHud();
  }
  function beginPlay() { state = "play"; haptic("impact", "medium"); }

  function finish(reason) {
    if (state !== "play") return;
    state = "end"; endReason = reason;
    held.gas = held.back = false;
    const alive = cargo.filter((c) => !c.lost).length;
    const dist = Math.floor(maxDist);
    const score = dist + alive * CFG.pointsPerCargo;
    const titles = { time: ["🏁", "Время вышло!"], flip: ["🙃", "Перевернулся!"], empty: ["💥", "Груз потерян"] };
    document.getElementById("end-emoji").textContent = titles[reason][0];
    document.getElementById("end-title").textContent = titles[reason][1];
    document.getElementById("end-score").textContent = score;
    document.getElementById("end-breakdown").textContent =
      `${dist} м + ${alive} из ${cargo.length} грузов × ${CFG.pointsPerCargo}`;
    let verdict = "";
    if (challenge) {
      const diff = score - challenge.score;
      verdict = diff > 0 ? `Рекорд друга побит на ${diff}! 🔥 (${challenge.name}: ${challenge.score})`
        : diff === 0 ? `Ничья! (${challenge.name}: ${challenge.score})` : `${challenge.name}: ${challenge.score} — не хватило ${-diff}`;
    }
    if (score > best) { if (best > 0) verdict = (verdict ? verdict + " · " : "") + "Новый рекорд!"; best = score; saveBest(); }
    document.getElementById("end-verdict").textContent = verdict;
    document.getElementById("best-end").textContent = `Твой рекорд: ${best}`;
    lastScore = score;
    show(hud, false); show(controls, false);
    setTimeout(() => show(scrEnd, true), 500);
    haptic("notify", reason === "time" ? "success" : "warning");
  }
  let lastScore = 0;

  // ---------- рекорд ----------
  function saveBest() { window.TG.saveBest("fragile_best", best); }
  function loadBest(cb) { window.TG.loadBest("fragile_best", (b) => { best = b; cb(); }); }

  // ---------- вызов другу ----------
  function b64url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64url(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function playerName() {
    const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    return (u && (u.first_name || u.username)) || "Друг";
  }
  function parseChallenge() { return window.TG.readChallenge(); }
  function shareChallenge() {
    window.TG.shareChallenge("gruz", lastScore, `Я довёз «Хрупкий груз» на ${lastScore} очков 📦🚚 Побьёшь?`);
  }
  function openChannel() {
    if (tg && tg.openTelegramLink) tg.openTelegramLink(CFG.channelUrl); else window.open(CFG.channelUrl, "_blank");
  }

  // ---------- запуск ----------
  document.getElementById("btn-start").addEventListener("click", startRound);
  document.getElementById("btn-again").addEventListener("click", startRound);
  document.getElementById("btn-challenge").addEventListener("click", shareChallenge);
  document.getElementById("btn-channel").addEventListener("click", openChannel);

  window.TG.init({ header: "#8fd3ff", bg: "#ffe7b8", back: "../" });

  challenge = parseChallenge();
  if (challenge) {
    const el = document.getElementById("challenge");
    el.textContent = `${challenge.name} набрал(а) ${challenge.score} очков. Сможешь больше?`;
    el.classList.remove("hidden");
  }
  loadBest(() => {
    if (best > 0) document.getElementById("best-start").textContent = `Твой рекорд: ${best}`;
  });

  buildWorld(); // фон на стартовом экране
  requestAnimationFrame(frame);

  // для автотестов
  window.__game = {
    get state() { return state; }, get dist() { return maxDist; },
    get alive() { return cargo.filter((c) => !c.lost).length; }, press(k, v) { held[k] = v; }, start: startRound
  };
})();
