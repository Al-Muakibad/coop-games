/* Объясни слово (алиас). Онлайн: каждый со своего телефона, слово видит только объясняющий. Офлайн: один телефон по кругу. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const TURN = 60;
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  let room = null, cfg = null, S = null, deck = [], deadline = 0, offline = false;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const nteams = () => (cfg.teams || cfg.players.length);
  const teamName = (t) => (offline ? cfg.players[t].name : cfg.teams ? Party.TEAMNAMES[t] : cfg.players[t].name);
  const teamColor = (t) => (cfg.teams ? Party.COLORS[t] : cfg.players[t].color);
  const iAmExp = () => offline || (S && S.exp === cfg.me);

  // ---------- логика (хозяин) ----------
  function explainerFor(turn) {
    if (offline || !cfg.teams) return turn % cfg.players.length;
    const nt = cfg.teams, t = turn % nt, members = cfg.players.map((p, i) => ({ p, i })).filter((o) => o.p.team === t);
    if (!members.length) return explainerFor(turn + 1);
    return members[Math.floor(turn / nt) % members.length].i;
  }
  function newGame(target) {
    const r = rng(cfg.seed); deck = window.WORDS.slice();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const scores = {}; for (let t = 0; t < nteams(); t++) scores[t] = 0;
    S = { ph: "wait", turn: 0, exp: explainerFor(0), scores, wi: 0, word: "", words: [], target: target || S && S.target || 30, over: false, left: TURN };
    push();
  }
  function nextWord() { S.word = deck[S.wi % deck.length]; S.wi++; }
  function push() { if (S.ph === "turn" && !S.over) S.left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); send("st", S); draw(); }
  function act(a, from) {
    if (!S) return;
    const allowed = from === S.exp || from === cfg.me && isHost() || offline;
    if (!allowed) return;
    const tm = cfg.players[S.exp].team;
    if (a.a === "start" && S.ph === "wait") { S.ph = "turn"; S.words = []; S.over = false; deadline = Date.now() + TURN * 1000; nextWord(); St.event("slovo_turn", { turn: S.turn }); }
    else if ((a.a === "ok" || a.a === "skip") && S.ph === "turn") {
      const ok = a.a === "ok";
      S.words.push([S.word, ok ? 1 : 0, ok && a.who != null ? a.who : -1]);
      if (ok) { S.scores[tm] = (S.scores[tm] || 0) + 1; if (!cfg.teams && !offline && a.who != null && a.who >= 0) S.scores[cfg.players[a.who].team]++; }
      if (S.over) S.ph = "sum"; else nextWord();
    }
    else if (a.a === "fix" && S.ph === "sum") {
      const w = S.words[a.i]; if (!w) return;
      const d = w[1] ? -1 : 1; w[1] = w[1] ? 0 : 1; S.scores[tm] += d;
      if (!cfg.teams && !offline && w[2] >= 0) S.scores[cfg.players[w[2]].team] += d;
    }
    else if (a.a === "next" && S.ph === "sum") {
      const cycleEnd = (S.turn + 1) % nteams() === 0, best = Math.max(...Object.values(S.scores));
      if (cycleEnd && best >= S.target) { S.ph = "end"; }
      else { S.turn++; S.exp = explainerFor(S.turn); S.ph = "wait"; S.word = ""; }
    }
    else if (a.a === "finish") S.ph = "end";
    else return;
    push();
  }
  setInterval(() => {
    if (!S || !isHost() || S.ph !== "turn" || S.over) return;
    if (Date.now() >= deadline) { S.over = true; S.left = 0; T.haptic("notify", "warning"); push(); }
  }, 250);
  setInterval(() => { if (S && isHost() && room) send("st", S); }, 3000);   // на случай потерянных сообщений

  // ---------- отрисовка ----------
  let lastPh = "", lastEnd = false;
  function draw() {
    if (!S) return;
    $("play").classList.toggle("hidden", S.ph === "end");
    const lead = Math.max(...Object.values(S.scores));
    $("scores").innerHTML = Object.keys(S.scores).map((t) => `<div class="sc ${+t === cfg.players[S.exp].team ? "on" : ""}"><i style="background:${teamColor(+t)}"></i>${esc(teamName(+t))}: ${S.scores[t]}${S.scores[t] === lead && lead > 0 ? " 👑" : ""}</div>`).join("") + `<div class="sc">🎯 до ${S.target}</div>`;
    const ex = cfg.players[S.exp], exName = offline ? ex.name : (S.exp === cfg.me ? "Ты" : ex.name), exTeam = cfg.teams && !offline ? ` (${Party.TEAMNAMES[ex.team]})` : "";
    const acts = $("acts"); acts.innerHTML = ""; $("pick").innerHTML = ""; $("list").innerHTML = ""; $("wsub").textContent = ""; $("timer").classList.remove("low");
    const btn = (label, cls, fn) => { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = label; b.onclick = fn; acts.appendChild(b); return b; };
    const doAct = (a) => { if (isHost()) act(a, cfg.me); else send("act", a); T.haptic("impact", "light"); };
    if (S.ph === "wait") {
      $("timer").textContent = "⏳"; $("who").textContent = `Объясняет: ${exName}${exTeam}`;
      if (iAmExp()) { $("word").textContent = offline ? `Передай телефон: ${ex.name}` : "Твой ход!"; $("wsub").textContent = "Объясняй слово, не называя его и однокоренные. Жми «Угадали» или «Пропуск»."; btn("▶ Я готов — старт!", "primary", () => doAct({ a: "start" })); }
      else { $("word").textContent = "🙈"; $("wsub").textContent = `Ждём, пока ${ex.name} начнёт. Слово увидит только объясняющий.`; }
      if (isHost() && !offline) { const b = btn("🏁 Закончить игру", "ghost", () => doAct({ a: "finish" })); b.style.flex = "0 0 auto"; }
    } else if (S.ph === "turn") {
      const left = S.over ? 0 : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      $("timer").textContent = S.over ? "⏰" : left; if (left <= 10) $("timer").classList.add("low");
      $("who").textContent = `Объясняет: ${exName}${exTeam} · угадано ${S.words.filter((w) => w[1]).length}`;
      if (iAmExp()) {
        $("word").textContent = S.word;
        if (S.over) $("wsub").textContent = "Время вышло — последнее слово! Угадали?";
        if (!cfg.teams && !offline) {
          $("wsub").textContent = (S.over ? "Последнее слово! " : "") + "Кто угадал? Нажми на имя:";
          cfg.players.forEach((p, i) => { if (i === S.exp) return; const b = document.createElement("button"); b.textContent = "✅ " + p.name; b.onclick = () => doAct({ a: "ok", who: i }); $("pick").appendChild(b); });
          btn("⏭ Пропуск", "skip", () => doAct({ a: "skip" }));
        } else { btn("⏭ Пропуск", "skip", () => doAct({ a: "skip" })); btn("✅ Угадали", "ok", () => doAct({ a: "ok" })); }
      } else {
        const myTeam = cfg.players[cfg.me].team, guessing = !cfg.teams || myTeam === ex.team;
        $("word").textContent = guessing ? "🤔 Угадывай вслух!" : "🤫 Слушай";
        $("wsub").textContent = guessing ? `${ex.name} объясняет слово` : `Объясняет команда ${Party.TEAMNAMES[ex.team]} — следи, чтобы не говорили само слово`;
        $("list").innerHTML = S.words.slice(-6).reverse().map((w) => `<div><span>${esc(w[0])}</span><span>${w[1] ? "✅" : "⏭"}</span></div>`).join("");
      }
    } else if (S.ph === "sum") {
      const got = S.words.filter((w) => w[1]).length;
      $("timer").textContent = `+${got}`; $("who").textContent = `Итог хода: ${exName}${exTeam}`;
      $("word").textContent = got >= 8 ? "🔥 Огонь!" : got >= 4 ? "👍 Неплохо" : "🙂 Бывает";
      const canFix = iAmExp() || isHost();
      $("list").innerHTML = S.words.map((w, i) => `<div><span>${esc(w[0])}${w[2] >= 0 && !cfg.teams && !offline ? " · " + esc(cfg.players[w[2]].name) : ""}</span>${canFix ? `<button data-i="${i}">${w[1] ? "✅" : "❌"}</button>` : `<span>${w[1] ? "✅" : "❌"}</span>`}</div>`).join("") || "<div>Ни одного слова</div>";
      if (canFix) { $("wsub").textContent = "Можно поправить: нажми на ✅/❌"; $("list").querySelectorAll("button").forEach((b) => b.onclick = () => doAct({ a: "fix", i: +b.dataset.i })); btn("Дальше ➜", "primary", () => doAct({ a: "next" })); }
    } else if (S.ph === "end" && !lastEnd) showEnd();
    if (S.ph !== "end") { lastEnd = false; $("screen-end").classList.add("hidden"); }
    if (S.ph !== lastPh) { if (S.ph === "turn") T.haptic("notify", "success"); lastPh = S.ph; }
  }
  function showEnd() {
    lastEnd = true;
    const arr = Object.entries(S.scores).sort((a, b) => b[1] - a[1]), win = +arr[0][0];
    const mine = offline ? null : cfg.players[cfg.me].team;
    const iWin = offline || mine === win;
    St.gameEnd({ win: iWin, mode: offline ? "one" : cfg.mode, turns: S.turn + 1 });
    $("end-emoji").textContent = iWin ? "🏆" : "👏";
    $("end-title").textContent = `Победа: ${teamName(win)}!`;
    $("end-sub").innerHTML = arr.map(([t, v]) => `<div style="display:flex;justify-content:space-between"><span><b style="color:${teamColor(+t)}">●</b> ${esc(teamName(+t))}</span><b>${v}</b></div>`).join("");
    const box = $("end-buttons"); box.innerHTML = "";
    const b = (l, c, f) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); };
    if (isHost()) b("🔁 Ещё партия", "primary", () => { cfg.seed = Math.floor(Math.random() * 1e9); newGame(S.target); });
    else b("Ждём хозяина…", "", () => {});
    b("Выйти", "ghost", () => { if (room) room.close(); room = null; S = null; $("play").classList.add("hidden"); $("screen-end").classList.add("hidden"); $("screen-menu").classList.remove("hidden"); });
    $("screen-end").classList.remove("hidden");
  }
  setInterval(() => { if (S && S.ph === "turn" && !S.over) { const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); $("timer").textContent = left; $("timer").classList.toggle("low", left <= 10); } }, 200);

  // ---------- старт ----------
  function beginOnline(c) {
    room = c.room; cfg = c.cfg; offline = false;
    $("screen-menu").classList.add("hidden");
    ["st", "act", "roster", "host-left", "full", "left", "start"].forEach((t) => room.off(t));
    room.on("st", (s) => { if (isHost()) return; const was = S && S.ph; S = s; if (S.ph === "turn" && (!was || was !== "turn" || S.over)) deadline = Date.now() + S.left * 1000; draw(); });
    room.on("act", (a, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i >= 0) act(a, i); });
    room.on("host-left", () => { $("who").textContent = "Хозяин вышел 😕"; });
    room.on("left", (id) => { const i = cfg.players.findIndex((p) => p.id === id); if (i >= 0 && S && S.exp === i && S.ph !== "end") { S.ph = "sum"; S.over = true; push(); } });
    St.gameStart({ players: cfg.players.length, mode: cfg.mode });
    $("play").classList.remove("hidden");
    if (isHost()) newGame(30); else { $("word").textContent = "Подключаемся…"; }
  }
  function beginOffline(nt, target) {
    room = null; offline = true;
    cfg = { mode: "one", teams: 0, seed: Math.floor(Math.random() * 1e9), me: 0, players: Array.from({ length: nt }, (_, i) => ({ id: "t" + i, name: "Команда " + (i + 1), team: i, color: Party.COLORS[i] })) };
    $("screen-menu").classList.add("hidden"); $("play").classList.remove("hidden");
    St.gameStart({ players: nt, mode: "one" });
    newGame(target);
  }
  const PARTY = { title: "Объясни слово", icon: "🗣️", max: 8, noBots: true, minHumans: 2, text: "Го в «Объясни слово» 🗣️ Я объясняю — ты угадываешь!",
    modes: [{ id: "t2", name: "2 команды", teams: 2 }, { id: "t3", name: "3 команды", teams: 3 }, { id: "ffa", name: "Каждый сам за себя" }], onCancel: () => $("screen-menu").classList.remove("hidden") };
  const pickChips = (id) => { const box = $(id); box.querySelectorAll(".chip").forEach((c) => c.onclick = () => { box.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c)); }); return () => +box.querySelector(".chip.on").dataset.v; };
  const nT = pickChips("c-teams"), nG = pickChips("c-target");
  $("m-one").onclick = () => $("one-setup").classList.toggle("hidden");
  $("one-go").onclick = () => beginOffline(nT(), nG());
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); beginOnline(await Party.host("slovo", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#ffd8a8", bg: "#ffeccc", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("slovo", inv, PARTY).then(beginOnline); }
  window.__game = { get S() { return S; }, get cfg() { return cfg; }, act: (a) => (isHost() ? act(a, cfg.me) : send("act", a)) };
})();
