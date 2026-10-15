/* 2048 — соло-игра набора «Кооп-игры». */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id), N = 4, KEY = "g2048_best";
  const COLORS = { 2: "#fff7ea", 4: "#ffe7b8", 8: "#ffb98a", 16: "#ff9a5c", 32: "#ff7a2f", 64: "#ef4a2a", 128: "#ffd34d",
    256: "#ffc61a", 512: "#9ee6c8", 1024: "#6fd3ff", 2048: "#b48cff", 4096: "#ff6fae" };
  let grid, score = 0, best = 0, over = false, won = false, idc = 0;
  const board = $("board"), challenge = T.readChallenge();

  function geom() { const s = board.clientWidth, gap = s * 0.03, c = (s - gap * (N + 1)) / N; return { gap, c }; }
  function drawCells() {
    board.innerHTML = ""; const { gap, c } = geom();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = document.createElement("div"); d.className = "cell";
      Object.assign(d.style, { left: gap + x * (c + gap) + "px", top: gap + y * (c + gap) + "px", width: c + "px", height: c + "px" });
      board.appendChild(d);
    }
  }
  function render(flags) {
    board.querySelectorAll(".tile").forEach((t) => t.remove());
    const { gap, c } = geom();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = grid[y][x]; if (!t) continue;
      const d = document.createElement("div"); d.className = "tile" + (flags[t.id] ? " " + flags[t.id] : "");
      const fs = t.v < 100 ? c * 0.45 : t.v < 1000 ? c * 0.38 : c * 0.3;
      Object.assign(d.style, { left: gap + x * (c + gap) + "px", top: gap + y * (c + gap) + "px", width: c + "px", height: c + "px",
        background: COLORS[t.v] || "#2b1d14", color: t.v > 4096 ? "#fff" : "", fontSize: fs + "px" });
      d.textContent = t.v; board.appendChild(d);
    }
    $("score").textContent = score; $("best").textContent = Math.max(best, score);
  }
  function empty() { const e = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!grid[y][x]) e.push([x, y]); return e; }
  function spawn(flags) { const e = empty(); if (!e.length) return; const [x, y] = e[Math.floor(Math.random() * e.length)]; grid[y][x] = { v: Math.random() < 0.9 ? 2 : 4, id: ++idc }; flags[idc] = "new"; }
  function reset() {
    grid = Array.from({ length: N }, () => Array(N).fill(null)); score = 0; over = false; won = false;
    const f = {}; spawn(f); spawn(f); drawCells(); render(f); $("screen-end").classList.add("hidden");
    window.Stats && Stats.gameStart({ challenge: !!challenge });
  }
  function move(dir) {             // 0 влево, 1 вправо, 2 вверх, 3 вниз
    if (over) return;
    let moved = false; const flags = {};
    for (let i = 0; i < N; i++) {
      const line = [];
      for (let j = 0; j < N; j++) {
        const x = dir < 2 ? (dir === 0 ? j : N - 1 - j) : i, y = dir < 2 ? i : (dir === 2 ? j : N - 1 - j);
        line.push(grid[y][x]);
      }
      const tiles = line.filter(Boolean), out = [];
      for (let k = 0; k < tiles.length; k++) {
        if (k + 1 < tiles.length && tiles[k].v === tiles[k + 1].v) {
          const v = tiles[k].v * 2; const t = { v, id: ++idc }; out.push(t); flags[t.id] = "merged"; score += v; k++;
          if (v === 2048 && !won) { won = true; setTimeout(() => { T.haptic("notify", "success"); }, 100); }
        } else out.push(tiles[k]);
      }
      while (out.length < N) out.push(null);
      for (let j = 0; j < N; j++) {
        const x = dir < 2 ? (dir === 0 ? j : N - 1 - j) : i, y = dir < 2 ? i : (dir === 2 ? j : N - 1 - j);
        if (grid[y][x] !== out[j]) moved = true;
        grid[y][x] = out[j];
      }
    }
    if (!moved) return;
    T.haptic("impact", "light");
    spawn(flags); render(flags);
    if (score > best) { best = score; T.saveBest(KEY, best); }
    window.Stats && Stats.state({ score, max: maxTile() });
    if (!canMove()) finish();
  }
  function canMove() {
    if (empty().length) return true;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = grid[y][x].v;
      if ((x + 1 < N && grid[y][x + 1].v === v) || (y + 1 < N && grid[y + 1][x].v === v)) return true;
    }
    return false;
  }
  function maxTile() { let m = 0; grid.forEach((r) => r.forEach((t) => { if (t) m = Math.max(m, t.v); })); return m; }
  function finish() {
    over = true; T.haptic("notify", "warning");
    $("end-emoji").textContent = maxTile() >= 2048 ? "🏆" : "🧩";
    $("end-score").textContent = score;
    window.Stats && Stats.gameEnd({ score, max: maxTile() });
    let v = `Лучшая плитка: ${maxTile()}`;
    if (challenge) { const d = score - challenge.score; v += d > 0 ? ` · рекорд ${challenge.name} побит на ${d}! 🔥` : ` · ${challenge.name}: ${challenge.score}`; }
    $("end-verdict").textContent = v;
    setTimeout(() => $("screen-end").classList.remove("hidden"), 500);
  }
  const share = () => T.shareChallenge("g2048", score, `Я набрал ${score} в 2048 🧩 Побьёшь?`);

  let start = null;
  board.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY }; });
  window.addEventListener("pointerup", (e) => {
    if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 0 : 1); else move(dy < 0 ? 2 : 3);
  });
  window.addEventListener("keydown", (e) => { const m = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3 }[e.key]; if (m !== undefined) { e.preventDefault(); move(m); } });
  window.addEventListener("resize", () => { drawCells(); render({}); });
  $("b-new").onclick = reset; $("e-again").onclick = reset; $("b-share").onclick = share; $("e-share").onclick = share;
  $("e-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#fff3dc", bg: "#fff3dc", back: "../" });
  if (challenge) { const el = $("challenge"); el.textContent = `${challenge.name} набрал(а) ${challenge.score}. Сможешь больше?`; el.classList.remove("hidden"); }
  T.loadBest(KEY, (b) => { best = b; $("best").textContent = b; });
  reset();
  window.__game = { move, get score() { return score; }, get over() { return over; }, get grid() { return grid; } };
})();
