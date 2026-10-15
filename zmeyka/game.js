/* Змейка — соло-игра набора «Кооп-игры». */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id), KEY = "zmeyka_best";
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let W, H, DPR, cell, cols = 15, rows = 22, ox, oy;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    const top = 70, bottom = 70;
    rows = Math.max(16, Math.min(26, Math.floor((H - top - bottom) / ((W - 20) / cols))));
    cell = Math.floor(Math.min((W - 20) / cols, (H - top - bottom) / rows));
    ox = Math.floor((W - cell * cols) / 2); oy = top + Math.floor((H - top - bottom - cell * rows) / 2);
  }
  addEventListener("resize", resize); resize();

  let snake, dir, nextDir, food, bonus, score, best = 0, state = "start", acc = 0, stepMs, last = 0, t = 0, deadAt = 0;
  const challenge = T.readChallenge();
  const eq = (a, b) => a.x === b.x && a.y === b.y;
  function freeCell() {
    for (;;) { const p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) }; if (!snake.some((s) => eq(s, p)) && !(food && eq(food, p))) return p; }
  }
  function start() {
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    snake = [{ x: cx, y: cy + 1 }, { x: cx, y: cy + 2 }, { x: cx, y: cy + 3 }];
    dir = { x: 0, y: -1 }; nextDir = [];
    food = null; food = freeCell(); bonus = null; score = 0; stepMs = 150; state = "play"; acc = 0;
    $("screen-start").classList.add("hidden"); $("screen-end").classList.add("hidden");
    $("hud").classList.remove("hidden"); $("hint").classList.remove("hidden"); hud();
    window.Stats && Stats.gameStart({ challenge: !!challenge });
  }
  function hud() { $("h-score").textContent = "🍎 " + score; $("h-best").textContent = "⭐ " + Math.max(best, score); }
  function turn(dx, dy) {
    const lastD = nextDir.length ? nextDir[nextDir.length - 1] : dir;
    if (lastD.x === -dx && lastD.y === -dy) return;
    if (lastD.x === dx && lastD.y === dy) return;
    if (nextDir.length < 3) nextDir.push({ x: dx, y: dy });
    $("hint").classList.add("hidden");
  }
  function step() {
    if (nextDir.length) dir = nextDir.shift();
    const h = snake[0], n = { x: (h.x + dir.x + cols) % cols, y: (h.y + dir.y + rows) % rows };
    if (snake.slice(0, -1).some((s) => eq(s, n))) return die();
    snake.unshift(n);
    if (eq(n, food)) {
      score++; food = freeCell(); stepMs = Math.max(65, stepMs - 3); T.haptic("impact", "light");
      if (!bonus && Math.random() < 0.25) bonus = { ...freeCell(), until: t + 5 };
    } else if (bonus && eq(n, bonus)) { score += 3; bonus = null; T.haptic("impact", "medium"); snake.push({ ...snake[snake.length - 1] }, { ...snake[snake.length - 1] }); }
    else snake.pop();
    if (bonus && t > bonus.until) bonus = null;
    hud();
  }
  function die() {
    state = "dead"; deadAt = t; T.haptic("notify", "error");
    if (score > best) { best = score; T.saveBest(KEY, best); }
    $("end-score").textContent = score;
    window.Stats && Stats.gameEnd({ score, length: snake.length });
    let v = `Длина змейки: ${snake.length}`;
    if (challenge) { const d = score - challenge.score; v = d > 0 ? `Рекорд ${challenge.name} побит на ${d}! 🔥` : `${challenge.name}: ${challenge.score} — не хватило ${-d + 1}`; }
    $("end-verdict").textContent = v;
    setTimeout(() => { $("screen-end").classList.remove("hidden"); $("hud").classList.add("hidden"); }, 700);
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#1d3b2a"; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#a8d672" : "#b4de7e"; ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
    ctx.strokeStyle = "#2b1d14"; ctx.lineWidth = 4; ctx.strokeRect(ox - 2, oy - 2, cols * cell + 4, rows * cell + 4);
    if (!snake) return;
    const em = (ch, p, s) => { ctx.font = `${cell * s}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ch, ox + (p.x + 0.5) * cell, oy + (p.y + 0.55) * cell); };
    em("🍎", food, 0.9 + Math.sin(t * 6) * 0.06);
    if (bonus) { ctx.globalAlpha = bonus.until - t < 1.5 ? 0.5 + 0.5 * Math.sin(t * 20) : 1; em("🍇", bonus, 0.95); ctx.globalAlpha = 1; }
    const dead = state === "dead";
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i], k = i / Math.max(1, snake.length - 1);
      ctx.fillStyle = dead && Math.floor((t - deadAt) * 10) % 2 ? "#e5484d" : `hsl(${145 - k * 30},55%,${34 + k * 10}%)`;
      const pad = i === 0 ? 0.5 : 1.5 + k * 2;
      ctx.beginPath(); ctx.roundRect(ox + s.x * cell + pad, oy + s.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.35); ctx.fill();
    }
    const h = snake[0], hx = ox + (h.x + 0.5) * cell, hy = oy + (h.y + 0.5) * cell;
    const px = -dir.y, py = dir.x;
    for (const sgn of [-1, 1]) {
      const ex = hx + dir.x * cell * 0.12 + px * sgn * cell * 0.2, ey = hy + dir.y * cell * 0.12 + py * sgn * cell * 0.2;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, ey, cell * 0.14, 0, 7); ctx.fill();
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(ex + dir.x * cell * 0.05, ey + dir.y * cell * 0.05, cell * 0.07, 0, 7); ctx.fill();
    }
  }
  function frame(ts) {
    const dt = Math.min(ts - (last || ts), 100); last = ts; t = ts / 1000;
    if (state === "play") { acc += dt; while (acc >= stepMs && state === "play") { acc -= stepMs; step(); } }
    draw(); requestAnimationFrame(frame);
  }
  let sp = null;
  canvas.addEventListener("pointerdown", (e) => { sp = { x: e.clientX, y: e.clientY }; });
  addEventListener("pointermove", (e) => {
    if (!sp || state !== "play") return;
    const dx = e.clientX - sp.x, dy = e.clientY - sp.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0); else turn(0, Math.sign(dy));
    sp = { x: e.clientX, y: e.clientY };
  });
  addEventListener("pointerup", () => { sp = null; });
  addEventListener("keydown", (e) => {
    const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (m && state === "play") { e.preventDefault(); turn(m[0], m[1]); }
  });
  $("btn-start").onclick = start; $("btn-again").onclick = start;
  $("btn-menu").onclick = () => { location.href = "../"; };
  $("btn-challenge").onclick = () => T.shareChallenge("zmeyka", score, `Моя змейка съела ${score} 🍎 Побьёшь?`);
  T.init({ header: "#1d3b2a", bg: "#1d3b2a", back: "../" });
  if (challenge) { const el = $("challenge"); el.textContent = `${challenge.name} набрал(а) ${challenge.score}. Сможешь больше?`; el.classList.remove("hidden"); }
  T.loadBest(KEY, (b) => { best = b; if (b) $("best-start").textContent = "Твой рекорд: " + b; });
  requestAnimationFrame(frame);
  window.__game = { get state() { return state; }, get score() { return score; }, start, turn, get snake() { return snake; }, get food() { return food; } };
})();
