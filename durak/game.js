/* Дурак (подкидной) на 2–4 игрока: с ботами или с друзьями онлайн (хозяин ведёт состояние, боты — у хозяина). */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const RANKS = ["6", "7", "8", "9", "10", "В", "Д", "К", "Т"], SUITS = ["♠", "♣", "♥", "♦"];
  const suit = (c) => Math.floor(c / 9), rank = (c) => c % 9;
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const AUTOPASS = 12000;

  let room = null, cfg = null, S = null, botAt = 0, passAt = 0, endShown = false;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const N = () => cfg.players.length;
  const isBot = (i) => !!cfg.players[i].bot;
  const pname = (i) => (i === cfg.me ? "Ты" : cfg.players[i].name);

  // ---------- правила (чистые функции от S) ----------
  const beats = (a, d) => (suit(d) === suit(a) && rank(d) > rank(a)) || (suit(d) === S.ts && suit(a) !== S.ts);
  const active = (i) => S.out.indexOf(i) < 0;
  function nextActive(i) { for (let k = 1; k <= N(); k++) { const j = (i + k) % N(); if (active(j)) return j; } return -1; }
  const unbeaten = () => S.table.filter((p) => p[1] < 0).length;
  const onTable = () => { const r = {}; S.table.forEach((p) => { r[rank(p[0])] = 1; if (p[1] >= 0) r[rank(p[1])] = 1; }); return r; };
  const attackers = () => cfg.players.map((_, i) => i).filter((i) => active(i) && i !== S.def);
  const passReady = () => S.table.length > 0 && (S.taking || unbeaten() === 0);
  function canAdd(i, c) {
    if (S.ph !== "play" || i === S.def || !active(i) || S.hands[i].indexOf(c) < 0) return false;
    if (!S.table.length) return i === S.att;
    if (S.table.length >= 6 || unbeaten() >= S.hands[S.def].length) return false;
    return !!onTable()[rank(c)];
  }
  function beatTarget(i, c) {
    if (S.ph !== "play" || i !== S.def || S.taking || S.hands[i].indexOf(c) < 0) return -1;
    let best = -1;
    S.table.forEach((p, k) => { if (p[1] < 0 && beats(p[0], c) && (best < 0 || rank(p[0]) > rank(S.table[best][0]))) best = k; });
    return best;
  }
  const passed = (i) => S.passed[i] || !S.hands[i].some((c) => canAdd(i, c));

  // ---------- логика (хозяин) ----------
  function newGame() {
    const deck = []; for (let c = 0; c < 36; c++) deck.push(c);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const hands = cfg.players.map(() => deck.splice(0, 6));
    const trumpCard = deck[deck.length - 1], ts = suit(trumpCard);
    let att = 0, low = 99;
    hands.forEach((h, i) => h.forEach((c) => { if (suit(c) === ts && rank(c) < low) { low = rank(c); att = i; } }));
    if (low === 99) att = Math.floor(Math.random() * hands.length);
    const prev = S;
    S = { ph: "play", deck, trumpCard, ts, hands, table: [], att, def: (att + 1) % hands.length, passed: {}, taking: false, out: [], fool: -1,
      msg: low < 99 ? `Первым ходит ${cfg.players[att].name}: младший козырь ${RANKS[low]}${SUITS[ts]}` : "", game: prev ? prev.game + 1 : 1, losses: prev ? prev.losses : {} };
    endShown = false; touch();
  }
  function touch() { botAt = Date.now() + 650 + Math.random() * 500; passAt = Date.now() + AUTOPASS; push(); }
  function push() { send("st", S); draw(); }
  function take(i, c) { const h = S.hands[i], k = h.indexOf(c); if (k >= 0) h.splice(k, 1); }
  function act(a, i) {
    if (!S || S.ph !== "play") return;
    if (a.a === "add" && canAdd(i, a.c)) { take(i, a.c); S.table.push([a.c, -1]); S.passed = {}; S.msg = ""; T.haptic("impact", "light"); }
    else if (a.a === "beat") { const k = beatTarget(i, a.c); if (k < 0) return; take(i, a.c); S.table[k][1] = a.c; S.passed = {}; S.msg = ""; }
    else if (a.a === "take" && i === S.def && !S.taking && unbeaten() > 0) { S.taking = true; S.passed = {}; S.msg = `${cfg.players[i].name} берёт`; }
    else if (a.a === "pass" && i !== S.def && passReady()) S.passed[i] = true;
    else return;
    if (passReady() && attackers().every(passed)) { resolve(); return; }
    touch();
  }
  function resolve() {
    const took = S.taking, def = S.def;
    if (took) S.table.forEach((p) => { S.hands[def].push(p[0]); if (p[1] >= 0) S.hands[def].push(p[1]); });
    S.msg = took ? `${cfg.players[def].name} забирает карты` : "Бито!";
    // добор: заходящий, потом по кругу, защитник последним
    const order = [S.att]; for (let k = 1; k < N(); k++) { const j = (S.att + k) % N(); if (j !== def && active(j)) order.push(j); }
    order.push(def);
    order.forEach((i) => { while (S.hands[i].length < 6 && S.deck.length) S.hands[i].push(S.deck.shift()); });
    S.table = []; S.passed = {}; S.taking = false;
    if (!S.deck.length) cfg.players.forEach((_, i) => { if (active(i) && !S.hands[i].length) S.out.push(i); });
    const left = cfg.players.map((_, i) => i).filter(active);
    if (left.length <= 1) {
      S.ph = "end"; S.fool = left.length ? left[0] : -1;
      if (S.fool >= 0) S.losses[S.fool] = (S.losses[S.fool] || 0) + 1;
      push(); return;
    }
    S.att = took ? nextActive(def) : active(def) ? def : nextActive(def);
    S.def = nextActive(S.att);
    touch();
  }
  // боты и автопас
  function lowest(cards) { return cards.slice().sort((a, b) => (suit(a) === S.ts) - (suit(b) === S.ts) || rank(a) - rank(b))[0]; }
  function botMove() {
    if (S.ph !== "play") return false;
    const d = S.def;
    if (isBot(d) && !S.taking && unbeaten() > 0) {
      const k = S.table.findIndex((p) => p[1] < 0);
      const opts = S.hands[d].filter((c) => beats(S.table[k][0], c));
      const c = opts.length ? lowest(opts) : -1;
      const costly = c >= 0 && suit(c) === S.ts && rank(c) >= 6 && S.deck.length > 8 && S.table.length <= 2;
      if (c < 0 || costly) act({ a: "take" }, d); else act({ a: "beat", c }, d);
      return true;
    }
    if (!S.table.length && isBot(S.att)) { act({ a: "add", c: lowest(S.hands[S.att]) }, S.att); return true; }
    if (passReady()) {
      for (const i of attackers()) {
        if (!isBot(i) || S.passed[i]) continue;
        const ok = S.hands[i].filter((c) => canAdd(i, c) && (suit(c) !== S.ts || !S.deck.length) && (rank(c) <= 4 || !S.deck.length || S.taking));
        if (ok.length) act({ a: "add", c: lowest(ok) }, i); else act({ a: "pass" }, i);
        return true;
      }
    }
    return false;
  }
  setInterval(() => {
    if (!S || !isHost() || S.ph !== "play") return;
    const now = Date.now();
    if (now >= botAt) { if (!botMove()) botAt = now + 400; }
    if (passReady() && now >= passAt) { attackers().forEach((i) => { S.passed[i] = true; }); act({ a: "pass" }, attackers()[0]); }
  }, 200);
  setInterval(() => { if (S && isHost() && room) send("st", S); }, 3000);

  // ---------- отрисовка ----------
  const cardEl = (c, extra) => `<div class="c ${suit(c) >= 2 ? "red" : ""} ${suit(c) === S.ts ? "tr" : ""} ${extra || ""}" data-c="${c}"><b>${RANKS[rank(c)]}</b><span>${SUITS[suit(c)]}</span></div>`;
  const doAct = (a) => { if (isHost()) act(a, cfg.me); else send("act", a); };
  function draw() {
    if (!S) return;
    $("play").classList.toggle("hidden", false);
    const me = cfg.me, n = N();
    // соперники по кругу от меня
    let html = "";
    for (let k = 1; k < n; k++) {
      const i = (me + k) % n, cnt = S.hands[i].length;
      const st = !active(i) ? "вышел ✓" : i === S.def ? (S.taking ? "берёт" : "отбивается") : i === S.att ? "ходит" : S.passed[i] ? "пас" : "";
      html += `<div class="opp ${i === S.att ? "att" : ""} ${i === S.def ? "def" : ""} ${!active(i) ? "out" : ""}">${esc(cfg.players[i].name)}<div class="backs">${"<i></i>".repeat(Math.min(cnt, 8))}</div><small>${cnt} карт · ${st}</small></div>`;
    }
    $("opps").innerHTML = html;
    $("deck").innerHTML = (S.deck.length ? `<div class="c back"><b style="color:#fff;font-size:20px;text-shadow:0 1px 2px #000">${S.deck.length}</b></div>${cardEl(S.trumpCard)}` : `<div class="c" style="opacity:.6"><span>${SUITS[S.ts]}</span></div>`) + `<small>козырь</small>`;
    $("table").innerHTML = S.table.map((p) => `<div class="pair">${cardEl(p[0])}${p[1] >= 0 ? cardEl(p[1]) : ""}</div>`).join("");
    // мои карты
    const hand = S.hands[me].slice().sort((a, b) => (suit(a) === S.ts) - (suit(b) === S.ts) || suit(a) - suit(b) || rank(a) - rank(b));
    const playable = (c) => S.ph === "play" && (canAdd(me, c) || beatTarget(me, c) >= 0);
    $("hand").innerHTML = hand.map((c) => cardEl(c, playable(c) ? "ok" : "dim")).join("");
    $("hand").querySelectorAll(".c").forEach((el) => el.onclick = () => {
      const c = +el.dataset.c;
      if (beatTarget(me, c) >= 0) doAct({ a: "beat", c }); else if (canAdd(me, c)) doAct({ a: "add", c }); else T.haptic("notify", "error");
    });
    // кнопки и подсказка
    const acts = $("acts"); acts.innerHTML = "";
    const btn = (l, cls, a) => { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = l; b.onclick = () => doAct(a); acts.appendChild(b); };
    let st = "";
    if (S.ph === "play") {
      if (!active(me)) st = "Ты вышел — без карт! Ждём, кто останется дураком 🍿";
      else if (me === S.def) {
        if (S.taking) st = "Ты берёшь — остальные могут подкинуть";
        else if (unbeaten() > 0) { st = "Отбивайся: нажми на карту, которой бьёшь"; btn("🫳 Беру", "", { a: "take" }); }
        else st = "Отбился! Ждём, подкинут ли ещё…";
      } else if (!S.table.length) st = me === S.att ? "Твой ход: нажми на карту" : `Ходит ${pname(S.att)}…`;
      else if (passReady() && !S.passed[me]) {
        const can = S.hands[me].some((c) => canAdd(me, c));
        st = can ? (S.taking ? "Можно подкинуть ему ещё" : "Подкинешь? Или бито") : "";
        btn(S.taking ? "✋ Забирай" : "✅ Бито", "primary", { a: "pass" });
      } else st = S.hands[me].some((c) => canAdd(me, c)) ? "Можно подкинуть карту того же достоинства" : `${pname(S.def)} отбивается…`;
    }
    $("status").textContent = S.msg && (!st || S.table.length === 0) ? S.msg + (st ? " · " + st : "") : st;
    if (S.ph === "end" && !endShown) showEnd();
    if (S.ph !== "end") $("screen-end").classList.add("hidden");
  }
  function showEnd() {
    endShown = true;
    const me = cfg.me, iFool = S.fool === me;
    St.gameEnd({ win: !iFool, players: N(), bots: cfg.players.filter((p) => p.bot).length, game: S.game });
    $("end-emoji").textContent = iFool ? "🤡" : S.fool < 0 ? "🤝" : "🎉";
    $("end-title").textContent = iFool ? "Ты дурак!" : S.fool < 0 ? "Ничья!" : "Ты не дурак!";
    const rows = cfg.players.map((p, i) => `<div style="display:flex;justify-content:space-between"><span>${esc(pname(i))}${i === S.fool ? " 🤡" : ""}</span><b>${S.losses[i] || 0}</b></div>`).join("");
    $("end-sub").innerHTML = `<p style="margin:4px 0 8px">${S.fool >= 0 ? "Дурак: <b>" + esc(pname(S.fool)) + "</b>" : "Все вышли одновременно"}</p><p style="margin:0 0 4px">Сколько раз был дураком:</p>${rows}`;
    const box = $("end-buttons"); box.innerHTML = "";
    const b = (l, c, f) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); };
    if (isHost()) b("🔁 Ещё партия", "primary", () => newGame()); else b("Ждём хозяина…", "", () => {});
    b("Выйти", "ghost", () => { if (room) room.close(); room = null; S = null; $("play").classList.add("hidden"); $("screen-end").classList.add("hidden"); $("screen-menu").classList.remove("hidden"); });
    $("screen-end").classList.remove("hidden");
  }

  // ---------- старт ----------
  function begin(c) {
    room = c.room; cfg = c.cfg; S = null;
    $("screen-menu").classList.add("hidden");
    if (room) {
      ["st", "act", "host-left"].forEach((t) => room.off(t));
      room.on("st", (s) => { if (isHost()) return; S = s; if (S.ph !== "end") endShown = false; draw(); });
      room.on("act", (a, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i >= 0) act(a, i); });
      room.on("host-left", () => { $("status").textContent = "Хозяин вышел 😕"; });
    }
    St.gameStart({ players: cfg.players.length, bots: cfg.players.filter((p) => p.bot).length, mode: room ? "online" : "bots" });
    $("play").classList.remove("hidden");
    if (isHost()) newGame(); else $("status").textContent = "Подключаемся…";
  }
  const PARTY = { title: "Дурак", icon: "🃏", max: 4, bots: 1, text: "Го в дурака 🃏 Заходи — раздаю!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }], onCancel: () => $("screen-menu").classList.remove("hidden") };
  $("m-bots").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.offline(Object.assign({}, PARTY, { bots: 2 }))); };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("durak", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#0f4d2e", bg: "#0f4d2e", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("durak", inv, PARTY).then(begin); }
  window.__game = { get S() { return S; }, get cfg() { return cfg; }, act: (a) => (isHost() ? act(a, cfg.me) : send("act", a)) };
})();
