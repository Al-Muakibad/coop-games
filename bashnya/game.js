/* Башня — Telegram Mini App из набора «Кооп-игры». */
(function () {
  "use strict";
  const T = window.TG;
  const BH = 40;           // высота этажа
  const BASE_W = 220;      // ширина первого этажа
  const RANGE = 240;       // размах движения
  const PERFECT = 6;       // допуск «идеально»
  const BEST_KEY = "bashnya_best";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1, S = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    S = Math.min(W / 440, H / 640, 1.6);
  }
  window.addEventListener("resize", resize); resize();

  let state = "start"; // start | play | over | end
  let stack = [], cur = null, debris = [], floaters = [], flashes = [];
  let dir = 1, combo = 0, perfects = 0, cam = 0, t0 = 0, best = 0;
  const challenge = T.readChallenge();

  const score = () => Math.max(0, stack.length - 1);
  const baseY = () => H * 0.8;
  const sy = (y) => baseY() - (y - cam) * S;
  const sx = (x) => W / 2 + x * S;
  const color = (i, l) => `hsl(${(195 + i * 11) % 360}, 68%, ${l}%)`;

  function reset() {
    stack = [{ x: 0, w: BASE_W, i: 0 }];
    debris = []; floaters = []; flashes = [];
    combo = 0; perfects = 0; cam = 0; dir = 1;
    spawn();
  }
  function spawn() {
    const top = stack[stack.length - 1];
    dir = stack.length % 2 ? 1 : -1;
    cur = { x: -dir * RANGE, w: top.w, i: stack.length };
  }
  function speed() { return Math.min(170 + score() * 8, 430); }

  function drop() {
    if (state !== "play" || !cur) return;
    const top = stack[stack.length - 1];
    const dx = cur.x - top.x;
    const y = stack.length * BH;
    if (Math.abs(dx) <= PERFECT) {
      combo++; perfects++;
      let w = top.w;
      if (combo >= 3) w = Math.min(w + 14, BASE_W);
      stack.push({ x: top.x, w, i: cur.i });
      flashes.push({ x: top.x, y, w, life: 24 });
      floaters.push({ text: combo >= 3 ? `Идеально ×${combo}! +ширина` : combo > 1 ? `Идеально ×${combo}!` : "Идеально!", y: y + BH, life: 60 });
      T.haptic("impact", "medium");
    } else {
      combo = 0;
      const overlap = top.w - Math.abs(dx);
      if (overlap <= 0) {
        debris.push({ x: cur.x, y, w: cur.w, i: cur.i, vy: 0, vx: dir * 40, rot: 0, vr: dir * 1.5 });
        cur = null;
        gameOver();
        return;
      }
      const nx = top.x + dx / 2;
      stack.push({ x: nx, w: overlap, i: cur.i });
      const cutW = Math.abs(dx);
      const cutX = dx > 0 ? nx + overlap / 2 + cutW / 2 : nx - overlap / 2 - cutW / 2;
      debris.push({ x: cutX, y, w: cutW, i: cur.i, vy: 0, vx: Math.sign(dx) * 60, rot: 0, vr: Math.sign(dx) * 2 });
      T.haptic("impact", "light");
    }
    document.getElementById("hud-score").textContent = score();
    document.getElementById("hud-combo").textContent = combo > 1 ? `🔥 серия ${combo}` : "";
    spawn();
  }

  function gameOver() {
    state = "over";
    T.haptic("notify", "error");
    setTimeout(showEnd, 1100);
  }

  function showEnd() {
    state = "end";
    const s = score();
    const tiers = [[0, "🧱", "Фундамент заложен"], [10, "🏠", "Уютный домик"], [25, "🏢", "Неплохая высотка"],
      [45, "🏙️", "Небоскрёб!"], [70, "🗼", "Выше облаков"], [100, "🚀", "Это уже космос"]];
    let tier = tiers[0]; for (const t of tiers) if (s >= t[0]) tier = t;
    document.getElementById("end-emoji").textContent = tier[1];
    document.getElementById("end-title").textContent = tier[2];
    document.getElementById("end-score").textContent = s;
    document.getElementById("end-breakdown").textContent = `этажей · идеальных попаданий: ${perfects}`;
    let verdict = "";
    if (challenge) {
      const d = s - challenge.score;
      verdict = d > 0 ? `Башня ${challenge.name} побита на ${d}! 🔥` : d === 0 ? `Ничья с ${challenge.name}!`
        : `${challenge.name}: ${challenge.score} — не хватило ${-d}`;
    }
    if (s > best) { if (best > 0) verdict = (verdict ? verdict + " · " : "") + "Новый рекорд!"; best = s; T.saveBest(BEST_KEY, best); }
    document.getElementById("end-verdict").textContent = verdict;
    window.Stats && Stats.gameEnd({ score: s, perfects, beat_challenge: challenge ? s > challenge.score : undefined });
    document.getElementById("best-end").textContent = `Твой рекорд: ${best}`;
    show("hud", false); show("hint", false); show("screen-end", true);
  }

  // ---------- отрисовка ----------
  const SKY = [ // [этаж, верх, низ]
    [0, [126, 214, 255], [214, 255, 236]], [30, [255, 166, 120], [255, 226, 160]],
    [60, [62, 52, 120], [190, 110, 160]], [90, [10, 12, 40], [30, 30, 80]]];
  function mix(a, b, k) { return a.map((v, i) => Math.round(v + (b[i] - v) * k)); }
  function skyAt(f) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
      if (f <= b[0]) { const k = Math.max(0, (f - a[0]) / (b[0] - a[0])); return [mix(a[1], b[1], k), mix(a[2], b[2], k)]; }
    }
    return [SKY[3][1], SKY[3][2]];
  }
  const stars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 97.3) % 1, y: (i * 61.7) % 1, r: (i % 3) + 1 }));

  function drawSky() {
    const f = cam / BH;
    const [top, bot] = skyAt(f);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgb(${top})`); g.addColorStop(1, `rgb(${bot})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const starA = Math.max(0, Math.min(1, (f - 55) / 30));
    if (starA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${starA})`;
      for (const s of stars) { ctx.beginPath(); ctx.arc(s.x * W, ((s.y * H + cam * S * 0.1) % H), s.r, 0, 7); ctx.fill(); }
    }
    const cloudA = Math.max(0, 1 - f / 70);
    if (cloudA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.8 * cloudA})`;
      for (let i = 0; i < 5; i++) {
        const cy = (((i * 260 + cam * S * 0.5) % (H + 200)) + H + 200) % (H + 200) - 100;
        const cx = ((i * 173 + performance.now() * 0.01 * (i % 2 ? 1 : -1)) % (W + 200) + W + 200) % (W + 200) - 100;
        ctx.beginPath(); ctx.ellipse(cx, cy, 50, 16, 0, 0, 7); ctx.ellipse(cx + 32, cy - 10, 30, 15, 0, 0, 7); ctx.fill();
      }
    }
  }

  function drawGround() {
    const gy = sy(0);
    if (gy > H + 10) return;
    ctx.fillStyle = "#6cbf4f"; ctx.fillRect(0, gy, W, H - gy + 10);
    ctx.fillStyle = "#4f9a37"; ctx.fillRect(0, gy, W, 6 * S);
  }

  function drawBlock(b, y, alpha) {
    const x0 = sx(b.x - b.w / 2), y0 = sy(y + BH), w = b.w * S, h = BH * S;
    if (y0 > H + 50 || y0 + h < -50) return;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color(b.i, 60); ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = color(b.i, 76); ctx.fillRect(x0, y0, w, 7 * S);
    ctx.fillStyle = color(b.i, 38);
    const ww = 9 * S, wh = 12 * S, gap = 18 * S;
    for (let wx = x0 + 8 * S; wx + ww < x0 + w - 4 * S; wx += gap) ctx.fillRect(wx, y0 + 15 * S, ww, wh);
    ctx.strokeStyle = "#2b1d14"; ctx.lineWidth = 2.5 * S; ctx.strokeRect(x0, y0, w, h);
    ctx.globalAlpha = 1;
  }

  function drawMarker(floors, label, col) {
    const y = sy((floors + 1) * BH);
    if (y < -20 || y > H + 20) return;
    ctx.setLineDash([10, 8]); ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = "800 14px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.strokeText(label, 10, y - 4);
    ctx.fillStyle = col; ctx.fillText(label, 10, y - 4);
  }

  function render(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSky(); drawGround();
    if (best > 0 && state !== "start") drawMarker(best, `⭐ твой рекорд ${best}`, "#d95a12");
    if (challenge) drawMarker(challenge.score, `🚩 ${challenge.name}: ${challenge.score}`, "#7b2cbf");

    stack.forEach((b, k) => drawBlock(b, k * BH));
    if (cur && state === "play") drawBlock(cur, stack.length * BH);

    for (const d of debris) {
      d.vy -= 1400 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.rot += d.vr * dt;
      ctx.save(); ctx.translate(sx(d.x), sy(d.y + BH / 2)); ctx.rotate(d.rot);
      ctx.fillStyle = color(d.i, 60); ctx.fillRect(-d.w * S / 2, -BH * S / 2, d.w * S, BH * S);
      ctx.strokeStyle = "#2b1d14"; ctx.lineWidth = 2.5 * S; ctx.strokeRect(-d.w * S / 2, -BH * S / 2, d.w * S, BH * S);
      ctx.restore();
    }
    debris = debris.filter((d) => sy(d.y) < H + 200);

    flashes = flashes.filter((f) => f.life-- > 0);
    for (const f of flashes) {
      const k = 1 - f.life / 24, pad = 6 + k * 26;
      ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 4;
      ctx.strokeRect(sx(f.x - f.w / 2) - pad, sy(f.y + BH) - pad, f.w * S + pad * 2, BH * S + pad * 2);
    }
    floaters = floaters.filter((f) => f.life-- > 0);
    for (const f of floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 25);
      ctx.font = "900 22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const y = sy(f.y) - 40 - (60 - f.life) * 0.8;
      ctx.lineWidth = 5; ctx.strokeStyle = "#2b1d14"; ctx.strokeText(f.text, W / 2, y);
      ctx.fillStyle = "#fff"; ctx.fillText(f.text, W / 2, y);
      ctx.globalAlpha = 1;
    }
  }

  let last = 0;
  function frame(t) {
    const dt = Math.min((t - (last || t)) / 1000, 0.05); last = t;
    if (state === "play" && cur) {
      cur.x += dir * speed() * dt;
      if (cur.x > RANGE) { cur.x = RANGE; dir = -1; }
      if (cur.x < -RANGE) { cur.x = -RANGE; dir = 1; }
    }
    const target = Math.max(0, stack.length * BH - (baseY() - H * 0.4) / S);
    cam += (target - cam) * Math.min(1, dt * 5);
    render(dt);
    requestAnimationFrame(frame);
  }

  // ---------- экраны и ввод ----------
  function show(id, on) { document.getElementById(id).classList.toggle("hidden", !on); }
  function start() {
    reset(); state = "play"; t0 = performance.now();
    document.getElementById("hud-score").textContent = "0";
    document.getElementById("hud-combo").textContent = "";
    show("screen-start", false); show("screen-end", false); show("hud", true); show("hint", true);
    window.Stats && Stats.gameStart({ challenge: !!challenge });
  }
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === "play" && performance.now() - t0 > 250) { show("hint", false); drop(); }
  });
  window.addEventListener("keydown", (e) => { if (e.code === "Space" || e.key === "Enter") { if (state === "play") drop(); } });

  document.getElementById("btn-start").onclick = start;
  document.getElementById("btn-again").onclick = start;
  document.getElementById("btn-menu").onclick = () => { location.href = "../"; };
  document.getElementById("btn-challenge").onclick = () =>
    T.shareChallenge("bashnya", score(), `Я построил башню в ${score()} этажей 🏗️ Слабо выше?`);

  T.init({ header: "#7ed6ff", bg: "#d6ffec", back: "../" });
  if (challenge) {
    const el = document.getElementById("challenge");
    el.textContent = `${challenge.name} построил(а) ${challenge.score} этажей. Перестроишь?`;
    el.classList.remove("hidden");
  }
  T.loadBest(BEST_KEY, (b) => { best = b; if (b > 0) document.getElementById("best-start").textContent = `Твой рекорд: ${b}`; });

  reset();
  requestAnimationFrame(frame);

  window.__game = {
    get state() { return state; }, get score() { return score(); }, start, drop,
    perfect() { if (cur) { cur.x = stack[stack.length - 1].x; drop(); } },
    offset(d) { if (cur) { cur.x = stack[stack.length - 1].x + d; drop(); } }
  };
})();
