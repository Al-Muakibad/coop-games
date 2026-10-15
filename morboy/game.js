/* Морской бой — онлайн 1 на 1 (и против бота). Набор «Кооп-игры». */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id), N = 10;
  const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
  const S = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };

  let mode = null, room = null, phase = "menu", myTurn = false, pending = false;
  let me = T.playerName() === "Друг" ? "Ты" : T.playerName(), opp = "Соперник";
  let mine, enemy, ready = { me: false, opp: false }, stats = { shots: 0, hits: 0 }, lastEnemy = null, lastMine = null, rematch = { me: false, opp: false };
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); else if (mode === "bot") bot.recv(t, d); };

  // ---------- поле ----------
  function emptyGrid(v) { return Array.from({ length: N }, () => Array(N).fill(v)); }
  function randomFleet() {
    for (;;) {
      const grid = emptyGrid(-1), ships = []; let ok = true;
      for (const len of FLEET) {
        let placed = false;
        for (let tries = 0; tries < 300 && !placed; tries++) {
          const hor = Math.random() < 0.5, x = Math.floor(Math.random() * (hor ? N - len + 1 : N)), y = Math.floor(Math.random() * (hor ? N : N - len + 1));
          const cells = Array.from({ length: len }, (_, i) => [hor ? x + i : x, hor ? y : y + i]);
          if (cells.every(([cx, cy]) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && grid[ny][nx] >= 0) return false; } return true; })) {
            cells.forEach(([cx, cy]) => (grid[cy][cx] = ships.length)); ships.push({ cells, hits: 0 }); placed = true;
          }
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) return { grid, ships, shots: emptyGrid(null) };
    }
  }
  // защитник сам считает результат выстрела по своему полю
  function resolve(board, x, y) {
    if (board.shots[y][x]) return { x, y, r: board.shots[y][x] === "miss" ? "miss" : "hit", dup: true };
    const si = board.grid[y][x];
    if (si < 0) { board.shots[y][x] = "miss"; return { x, y, r: "miss" }; }
    const s = board.ships[si]; s.hits++; board.shots[y][x] = "hit";
    if (s.hits === s.cells.length) {
      s.cells.forEach(([cx, cy]) => (board.shots[cy][cx] = "sunk"));
      const over = board.ships.every((sh) => sh.hits === sh.cells.length);
      return { x, y, r: "sunk", cells: s.cells, over };
    }
    return { x, y, r: "hit" };
  }
  function markAround(view, cells) {
    cells.forEach(([cx, cy]) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N && !view[ny][nx]) view[ny][nx] = "miss"; } });
  }

  // ---------- отрисовка ----------
  function buildGrid(el, onTap) {
    el.innerHTML = "";
    for (let i = 0; i < N * N; i++) { const c = document.createElement("div"); c.className = "c"; if (onTap) c.addEventListener("pointerdown", (e) => { e.preventDefault(); onTap(i % N, Math.floor(i / N)); }); el.appendChild(c); }
  }
  function paint() {
    const ge = $("g-enemy").children, gm = $("g-me").children;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = enemy ? enemy[y][x] : null, c = ge[y * N + x];
      c.className = "c" + (v ? " " + v : "") + (lastEnemy && lastEnemy[0] === x && lastEnemy[1] === y ? " last" : "");
      c.textContent = v === "hit" ? "🔥" : v === "sunk" ? "💥" : v === "miss" ? "•" : "";
      const s = mine.shots[y][x], ship = mine.grid[y][x] >= 0, m = gm[y * N + x];
      m.className = "c" + (ship ? " ship" : "") + (s ? " " + s : "") + (lastMine && lastMine[0] === x && lastMine[1] === y ? " last" : "");
      m.textContent = s === "hit" ? "🔥" : s === "sunk" ? "💥" : s === "miss" ? "•" : "";
    }
    const sunkEnemy = enemySunk.length;
    $("fleet-enemy").textContent = phase === "play" || phase === "end" ? `Потоплено: ${sunkEnemy} из ${FLEET.length} · выстрелов ${stats.shots}, попаданий ${stats.hits}` : "";
  }
  let enemySunk = [];
  function setTurn() {
    const t = $("turn");
    if (phase === "setup") { t.textContent = "Расставь флот"; t.className = ""; }
    else if (phase === "wait") { t.textContent = `Ждём ${opp}…`; t.className = "their"; }
    else if (phase === "play") { t.textContent = myTurn ? "🎯 Твой выстрел" : `⏳ Стреляет ${opp}`; t.className = myTurn ? "" : "their"; }
    $("g-enemy").classList.toggle("target", phase === "play" && myTurn);
    $("g-enemy").classList.toggle("off", phase === "play" && !myTurn);
    $("nm-me").textContent = me; $("nm-opp").textContent = opp;
  }
  function layout() {
    const setup = phase === "setup" || phase === "wait";
    $("setup-btns").classList.toggle("hidden", phase !== "setup");
    $("g-enemy").classList.toggle("hidden", setup); $("lbl-enemy").classList.toggle("hidden", setup); $("fleet-enemy").classList.toggle("hidden", setup);
    $("g-me").className = "grid " + (setup ? "big" : "small");
    $("lbl-me").textContent = setup ? "Твой флот — нажми «Перемешать», пока не понравится" : "Твой флот";
  }

  // ---------- игра ----------
  function newGame() {
    mine = randomFleet(); enemy = emptyGrid(null); enemySunk = []; ready = { me: false, opp: false }; rematch = { me: false, opp: false };
    stats = { shots: 0, hits: 0 }; lastEnemy = lastMine = null; pending = false;
    phase = "setup"; ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden")); $("main").classList.remove("hidden");
    layout(); setTurn(); paint();
    if (mode === "bot") bot.reset();
    S.state({ phase });
  }
  function onReady() {
    if (phase !== "setup") return;
    ready.me = true; phase = "wait"; send("ready", {}); layout(); setTurn(); paint(); T.haptic("impact", "medium");
    tryBegin();
  }
  function tryBegin() {
    if (!(ready.me && ready.opp) || !isHost() || phase !== "wait") return;
    const hostFirst = Math.random() < 0.5;
    send("first", { hostFirst }); begin(hostFirst);
  }
  function begin(hostFirst) {
    phase = "play"; myTurn = isHost() ? hostFirst : !hostFirst;
    layout(); setTurn(); paint();
    S.gameStart({ mode }); S.state({ phase: "play" });
    T.haptic("notify", "success");
  }
  function shoot(x, y) {
    if (phase !== "play" || !myTurn || pending || enemy[y][x]) return;
    pending = true; stats.shots++; lastEnemy = [x, y];
    send("fire", { x, y }); T.haptic("impact", "light");
  }
  function onFire(d) {                                  // по мне стреляют
    if (phase !== "play") return;
    const r = resolve(mine, d.x, d.y); lastMine = [d.x, d.y];
    send("res", r);
    if (r.r === "miss") { myTurn = true; } else T.haptic("impact", "heavy");
    setTurn(); paint();
    if (r.over) finish(false);
  }
  function onRes(r) {                                   // ответ на мой выстрел
    pending = false;
    enemy[r.y][r.x] = r.r === "miss" ? "miss" : r.r;
    if (r.r === "sunk") { r.cells.forEach(([cx, cy]) => (enemy[cy][cx] = "sunk")); markAround(enemy, r.cells); enemySunk.push(r.cells.length); stats.hits++; T.haptic("notify", "success"); }
    else if (r.r === "hit") { stats.hits++; T.haptic("impact", "medium"); }
    else { myTurn = false; }
    setTurn(); paint();
    S.state({ phase: "play", shots: stats.shots, sunk: enemySunk.length });
    if (r.over) finish(true);
  }
  function finish(win) {
    phase = "end"; setTurn(); paint();
    S.gameEnd({ mode, win, shots: stats.shots, hits: stats.hits, sunk: enemySunk.length });
    $("end-emoji").textContent = win ? "🏆" : "🌊";
    $("end-title").textContent = win ? "Флот соперника на дне!" : `${opp} потопил твой флот`;
    $("end-sub").textContent = `Выстрелов: ${stats.shots} · попаданий: ${stats.hits} · точность ${stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0}%`;
    $("end-status").textContent = "";
    const b = [["🔁 Реванш", "primary", askRematch]];
    if (mode === "bot") b.push(["⚔️ Позвать друга", "", () => { leave(); invite(); }]);
    b.push(["В меню", "ghost", () => { leave(); toMenu(); }]);
    const box = $("end-buttons"); box.innerHTML = "";
    b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
    setTimeout(() => $("screen-end").classList.remove("hidden"), 1200);
  }
  function askRematch() {
    if (mode === "bot") return newGame();
    rematch.me = true; send("rematch", {}); $("end-status").textContent = `Ждём ${opp}…`;
    if (rematch.opp) { send("rematch", {}); newGame(); }
  }
  function leave() { if (room) { room.close(); room = null; } }
  function toMenu() { phase = "menu"; $("main").classList.add("hidden"); $("screen-end").classList.add("hidden"); $("screen-menu").classList.remove("hidden"); }

  // ---------- сеть ----------
  function bind(rm) {
    rm.on("ready", () => { ready.opp = true; tryBegin(); });
    rm.on("first", (d) => begin(d.hostFirst));
    rm.on("fire", onFire);
    rm.on("res", onRes);
    rm.on("rematch", () => { rematch.opp = true; if (phase === "end") { if (rematch.me) newGame(); else $("end-status").textContent = `${opp} хочет реванш!`; } });
    rm.on("peer-left", () => {
      if (phase === "menu") return;
      $("end-emoji").textContent = "🚪"; $("end-title").textContent = `${opp} вышел из игры`; $("end-sub").textContent = ""; $("end-status").textContent = "";
      const box = $("end-buttons"); box.innerHTML = "";
      [["⚔️ Позвать снова", "primary", () => { leave(); invite(); }], ["В меню", "ghost", () => { leave(); toMenu(); }]].forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
      phase = "end"; $("screen-end").classList.remove("hidden");
    });
  }
  async function invite() {
    mode = "online"; $("screen-menu").classList.add("hidden");
    S.event("invite_create", {});
    room = await Lobby.host("morboy", { text: "Сыграем в морской бой? 🚢 Заходи, я жду!", onCancel: toMenu, onBot: startBot });
    opp = room.peer ? room.peer.name : "Друг"; bind(room); newGame();
  }
  async function joinInvite(id) {
    mode = "online"; $("screen-menu").classList.add("hidden");
    room = await Lobby.join("morboy", id, { onCancel: toMenu, onBot: startBot });
    S.event("invite_join", {});
    opp = room.peer ? room.peer.name : "Друг"; bind(room); newGame();
  }

  // ---------- бот ----------
  const bot = {
    board: null, view: null, targets: [],
    reset() { this.board = randomFleet(); this.view = emptyGrid(null); this.targets = []; setTimeout(() => { ready.opp = true; tryBegin(); }, 800); },
    recv(t, d) {
      if (t === "fire") setTimeout(() => { const r = resolve(this.board, d.x, d.y); onRes(r); if (r.r === "miss") this.turn(); }, 350);
      else if (t === "first") { if (!d.hostFirst) this.turn(); }
      else if (t === "res") { this.learn(d); if (d.r !== "miss" && !d.over) this.turn(); }
    },
    pick() {
      while (this.targets.length) { const [x, y] = this.targets.shift(); if (!this.view[y][x]) return [x, y]; }
      const free = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!this.view[y][x] && (x + y) % 2 === 0) free.push([x, y]);
      if (!free.length) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!this.view[y][x]) free.push([x, y]);
      return free[Math.floor(Math.random() * free.length)];
    },
    turn() { setTimeout(() => { if (phase !== "play") return; const [x, y] = this.pick(); onFire({ x, y }); }, 700 + Math.random() * 600); },
    learn(r) {
      this.view[r.y][r.x] = r.r;
      if (r.r === "hit") {
        const hits = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (this.view[y][x] === "hit") hits.push([x, y]);
        let cand = [];
        if (hits.length >= 2) {
          const hor = hits.every(([, y]) => y === hits[0][1]);
          if (hor) { const xs = hits.map(([x]) => x); cand = [[Math.min(...xs) - 1, hits[0][1]], [Math.max(...xs) + 1, hits[0][1]]]; }
          else { const ys = hits.map(([, y]) => y); cand = [[hits[0][0], Math.min(...ys) - 1], [hits[0][0], Math.max(...ys) + 1]]; }
        } else cand = [[r.x - 1, r.y], [r.x + 1, r.y], [r.x, r.y - 1], [r.x, r.y + 1]].sort(() => Math.random() - 0.5);
        this.targets = cand.filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N && !this.view[y][x]);
      } else if (r.r === "sunk") { r.cells.forEach(([x, y]) => (this.view[y][x] = "sunk")); markAround(this.view, r.cells); this.targets = []; }
    }
  };
  // в режиме бота мой «send» уходит боту, а его ответы — в мои обработчики
  function startBot() { leave(); mode = "bot"; opp = "🤖 Адмирал Бот"; $("screen-menu").classList.add("hidden"); newGame(); }

  buildGrid($("g-enemy"), shoot); buildGrid($("g-me"), null);
  $("b-shuffle").onclick = () => { if (phase === "setup") { mine = randomFleet(); paint(); T.haptic("select"); } };
  $("b-ready").onclick = onReady;
  $("m-invite").onclick = invite; $("m-bot").onclick = startBot;
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#0e4d8a", bg: "#0a2f57", back: "../" });
  const inv = Net.readInvite(); if (inv) joinInvite(inv);
  window.__game = { get phase() { return phase; }, get myTurn() { return myTurn; }, get enemy() { return enemy; }, get mine() { return mine; }, shoot, onReady, startBot, invite, get roomId() { return room && room.id; } };
})();
