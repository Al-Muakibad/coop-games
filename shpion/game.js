/* Шпион. Онлайн: каждый со своего телефона (хозяин ведёт состояние). Офлайн: один телефон по кругу.
   Фазы: deal (офлайн: раздача карт) → talk (вопросы, таймер) → vote (голосование) → guess (шпион называет локацию) → end. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const P = window.PLACES;
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

  let room = null, cfg = null, S = null, offline = false, deadline = 0, minutes = 6;
  let open = false, crossed = {}, myVote = -1, lastPh = "", endShown = false, lastRound = 0;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const N = () => cfg.players.length;
  const name = (i) => (offline ? cfg.players[i].name : i === cfg.me ? "Ты" : cfg.players[i].name);

  // ---------- логика (хозяин) ----------
  function newRound() {
    const prev = S;
    const used = prev ? prev.used.slice(-12) : [];
    let loc; do { loc = Math.floor(Math.random() * P.length); } while (used.indexOf(loc) >= 0 && used.length < P.length);
    const spy = Math.floor(Math.random() * N());
    const roles = cfg.players.map(() => Math.floor(Math.random() * 6));
    const scores = prev ? prev.scores : cfg.players.map(() => 0);
    S = { ph: offline ? "deal" : "talk", round: prev ? prev.round + 1 : 1, loc, spy, roles, used: used.concat(loc),
      votes: {}, accused: -1, win: "", why: "", guess: -1, scores, deal: 0, left: minutes * 60, first: Math.floor(Math.random() * N()) };
    deadline = Date.now() + minutes * 60 * 1000;
    St.event("shpion_round", { round: S.round, players: N(), mode: offline ? "one" : "party" });
    push();
  }
  function push() {
    if (S.ph === "talk") S.left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    send("st", S); draw();
  }
  function finish(win, why) {
    S.ph = "end"; S.win = win; S.why = why;
    if (win === "spy") S.scores[S.spy] += 2; else cfg.players.forEach((_, i) => { if (i !== S.spy) S.scores[i] += 1; });
  }
  function tally() {
    const cnt = {}; Object.values(S.votes).forEach((t) => { cnt[t] = (cnt[t] || 0) + 1; });
    const arr = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    if (!arr.length) { finish("spy", "Никто не проголосовал — шпион ушёл незамеченным."); return; }
    if (arr.length > 1 && arr[0][1] === arr[1][1]) { finish("spy", "Голоса разделились — шпион ускользнул."); return; }
    S.accused = +arr[0][0];
    if (S.accused === S.spy) { S.ph = "guess"; S.why = "caught"; }
    else finish("spy", `Вы обвинили невиновного: ${cfg.players[S.accused].name}.`);
  }
  function act(a, from) {
    if (!S) return;
    if (a.a === "dealnext" && S.ph === "deal") { S.deal++; if (S.deal >= N()) { S.ph = "talk"; deadline = Date.now() + minutes * 60 * 1000; } }
    else if (a.a === "vote" && S.ph === "talk") { S.ph = "vote"; S.votes = {}; }
    else if (a.a === "pick" && S.ph === "vote") {
      if (offline) { S.votes = { 0: a.t }; tally(); }
      else { if (a.t === from || a.t < 0 || a.t >= N()) return; S.votes[from] = a.t; if (Object.keys(S.votes).length >= N()) tally(); }
    }
    else if (a.a === "count" && S.ph === "vote" && (from === cfg.me && isHost())) tally();
    else if (a.a === "spycall" && S.ph === "talk" && (offline || from === S.spy)) { S.ph = "guess"; S.why = "call"; }
    else if (a.a === "guess" && S.ph === "guess" && (offline || from === S.spy)) {
      S.guess = a.l;
      if (a.l === S.loc) finish("spy", S.why === "call" ? "Шпион сам назвал локацию — и угадал!" : "Шпиона поймали, но он угадал локацию!");
      else finish("town", S.why === "call" ? `Шпион рискнул и ошибся: «${P[a.l][0]}».` : `Шпиона поймали, и он не угадал локацию («${P[a.l][0]}»).`);
    }
    else return;
    push();
  }
  setInterval(() => {
    if (!S || !isHost() || S.ph !== "talk") return;
    if (Date.now() >= deadline) { S.ph = "vote"; S.votes = {}; T.haptic("notify", "warning"); push(); }
  }, 300);
  setInterval(() => { if (S && isHost() && room) send("st", S); }, 3000);

  // ---------- отрисовка ----------
  const doAct = (a) => { if (isHost()) act(a, cfg.me); else send("act", a); T.haptic("impact", "light"); };
  function cardHTML(i) {
    if (i === S.spy) return `<div class="em">🕵️</div><div class="big">Ты — шпион</div><div class="small">Не выдай себя. Слушай ответы и угадай, где все находятся.</div>`;
    const pl = P[S.loc], role = pl[2][S.roles[i] % pl[2].length];
    return `<div class="em">${pl[1]}</div><div class="big">${esc(pl[0])}</div><div class="small">Твоя роль: ${esc(role)}</div>`;
  }
  function placesGrid(pickFn) {
    $("places").innerHTML = P.map((p, i) => `<button data-l="${i}" class="${crossed[i] ? "x" : ""}">${p[1]} ${esc(p[0])}</button>`).join("");
    $("places").querySelectorAll("button").forEach((b) => b.onclick = () => {
      const l = +b.dataset.l;
      if (pickFn) { pickFn(l); return; }
      crossed[l] = !crossed[l]; b.classList.toggle("x", !!crossed[l]); T.haptic("select");
    });
  }
  function btn(label, cls, fn, box) { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = label; b.onclick = fn; (box || $("acts")).appendChild(b); return b; }
  function draw() {
    if (!S) return;
    if (S.ph !== lastPh) { if (S.ph === "talk" || S.ph === "vote") T.haptic("notify", "success"); if (S.ph !== "talk") open = false; if (S.ph === "vote") myVote = -1; lastPh = S.ph; }
    if (S.round !== lastRound) { crossed = {}; open = false; lastRound = S.round; }
    $("play").classList.toggle("hidden", S.ph === "end");
    $("round").textContent = `Раунд ${S.round}`;
    $("votes").textContent = S.ph === "vote" && !offline ? `🗳 ${Object.keys(S.votes).length}/${N()}` : "";
    $("timer").classList.remove("low");
    const card = $("card"), acts = $("acts"); acts.innerHTML = ""; card.className = ""; card.onclick = null; $("places-lbl").textContent = "Все локации (нажми, чтобы зачеркнуть):";
    $("places").parentElement && ($("places").style.display = ""); $("places-lbl").style.display = "";
    if (S.ph === "deal") {
      $("timer").textContent = "🃏"; $("places").style.display = "none"; $("places-lbl").style.display = "none";
      const k = S.deal;
      $("hint").textContent = `Раздача карт: ${k + 1} из ${N()}`;
      if (!open) { card.className = "closed"; card.innerHTML = `<div class="em">📱</div><div class="big">Передай телефон: ${esc(cfg.players[k].name)}</div><div class="small">Остальные — не подглядывать!</div>`;
        btn("👀 Показать мою карту", "primary", () => { open = true; draw(); }); }
      else { if (k === S.spy) card.className = "spy"; card.innerHTML = cardHTML(k);
        btn(k + 1 < N() ? "🙈 Скрыть и передать дальше" : "🙈 Скрыть и начать игру", "primary", () => { open = false; doAct({ a: "dealnext" }); }); }
      return;
    }
    if (S.ph === "talk") {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      $("timer").textContent = fmt(left); $("timer").classList.toggle("low", left <= 30);
      $("hint").textContent = `Первым спрашивает: ${name(S.first)}. Задавайте вопросы по кругу.`;
      if (offline) { card.innerHTML = `<div class="em">💬</div><div class="big">Спрашивайте друг друга</div><div class="small">Карты розданы. Когда кого-то заподозрите — голосуйте.</div>`; }
      else if (open) { if (cfg.me === S.spy) card.className = "spy"; card.innerHTML = cardHTML(cfg.me); card.onclick = () => { open = false; draw(); }; }
      else { card.className = "closed"; card.innerHTML = `<div class="em">🃏</div><div class="big">Моя карта</div><div class="small">Нажми, чтобы посмотреть (и ещё раз — чтобы скрыть)</div>`; card.onclick = () => { open = true; draw(); }; }
      if (offline) card.onclick = null;
      btn("🗳 Голосовать: кто шпион?", "primary", () => doAct({ a: "vote" }));
      if (offline) btn("🕵️ Шпион: я знаю, где мы!", "", () => doAct({ a: "spycall" }));
      else if (cfg.me === S.spy) btn("🕵️ Я знаю, где мы! (назвать локацию)", "", () => doAct({ a: "spycall" }));
      placesGrid(null); return;
    }
    card.onclick = null;
    if (S.ph === "vote") {
      $("timer").textContent = "🗳"; $("places").style.display = "none"; $("places-lbl").style.display = "none";
      card.innerHTML = `<div class="em">🤔</div><div class="big">Кто шпион?</div><div class="small">${offline ? "Обсудите и выберите одного вслух" : "Нажми на того, кого подозреваешь"}</div>`;
      $("hint").textContent = offline ? "Если голоса разделились — шпион победил." : "Нужно большинство. При ничьей шпион побеждает.";
      const box = document.createElement("div"); box.className = "who"; acts.appendChild(box);
      cfg.players.forEach((p, i) => {
        if (!offline && i === cfg.me) return;
        const voted = !offline && S.votes[cfg.me] === i;
        btn(name(i), voted ? "on" : "", () => { myVote = i; doAct({ a: "pick", t: i }); }, box);
      });
      if (!offline && isHost()) btn("Подвести итог сейчас", "ghost", () => doAct({ a: "count" }));
      return;
    }
    if (S.ph === "guess") {
      $("timer").textContent = "🎯";
      const iAmSpy = offline || cfg.me === S.spy;
      card.className = "spy";
      card.innerHTML = S.why === "call" ? `<div class="em">🕵️</div><div class="big">${esc(name(S.spy))}: «Я шпион!»</div><div class="small">Сейчас назовёт локацию. Угадает — победа шпиона.</div>`
        : `<div class="em">🎯</div><div class="big">Шпион пойман: ${esc(name(S.spy))}</div><div class="small">Последний шанс: угадает локацию — победит.</div>`;
      $("hint").textContent = iAmSpy ? (offline ? "Шпион, выбери локацию на экране:" : "Выбери локацию:") : "Ждём, что выберет шпион…";
      $("places-lbl").textContent = iAmSpy ? "Где вы находитесь?" : "Локации:";
      placesGrid(iAmSpy ? (l) => doAct({ a: "guess", l }) : null); return;
    }
    if (S.ph === "end" && !endShown) showEnd();
  }
  function fmt(s) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function showEnd() {
    endShown = true;
    const spyWin = S.win === "spy", iAmSpy = !offline && cfg.me === S.spy;
    const iWin = offline ? true : (spyWin === iAmSpy);
    St.gameEnd({ win: iWin, mode: offline ? "one" : "party", spy_win: spyWin, players: N(), round: S.round });
    $("end-emoji").textContent = spyWin ? "🕵️" : "🎉";
    $("end-title").textContent = spyWin ? "Победил шпион!" : "Шпиона вычислили!";
    const pl = P[S.loc];
    const sc = cfg.players.map((p, i) => [i, S.scores[i]]).sort((a, b) => b[1] - a[1]);
    $("end-sub").innerHTML = `<p style="margin:4px 0 10px">${esc(S.why)}</p>
      <p style="margin:0 0 4px">Локация: <b>${pl[1]} ${esc(pl[0])}</b></p><p style="margin:0 0 10px">Шпион: <b>${esc(name(S.spy))}</b></p>
      ${sc.map(([i, v]) => `<div style="display:flex;justify-content:space-between"><span>${esc(name(i))}${i === S.spy ? " 🕵️" : ""}</span><b>${v}</b></div>`).join("")}`;
    const box = $("end-buttons"); box.innerHTML = "";
    if (isHost()) btn("🔁 Новый раунд", "primary", () => { newRound(); }, box);
    else btn("Ждём хозяина…", "", () => {}, box);
    btn("Выйти", "ghost", () => { if (room) room.close(); room = null; S = null; $("play").classList.add("hidden"); $("screen-end").classList.add("hidden"); $("screen-menu").classList.remove("hidden"); }, box);
    $("screen-end").classList.remove("hidden");
  }
  const _draw = draw;
  draw = function () { if (S && S.ph !== "end") { endShown = false; $("screen-end").classList.add("hidden"); } _draw(); };
  setInterval(() => { if (S && S.ph === "talk") { const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); $("timer").textContent = fmt(left); $("timer").classList.toggle("low", left <= 30); } }, 250);

  // ---------- старт ----------
  function beginOnline(c) {
    room = c.room; cfg = c.cfg; offline = false;
    minutes = cfg.mode === "m4" ? 4 : cfg.mode === "m8" ? 8 : 6;
    $("screen-menu").classList.add("hidden");
    ["st", "act", "host-left", "left"].forEach((t) => room.off(t));
    room.on("st", (s) => { if (isHost()) return; const was = S && S.ph; S = s; if (S.ph === "talk" && (was !== "talk" || Math.abs((deadline - Date.now()) / 1000 - S.left) > 3)) deadline = Date.now() + S.left * 1000; draw(); });
    room.on("act", (a, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i >= 0) act(a, i); });
    room.on("host-left", () => { $("hint").textContent = "Хозяин вышел 😕"; });
    St.gameStart({ players: N(), mode: "party" });
    $("play").classList.remove("hidden");
    if (isHost()) newRound(); else { $("card").innerHTML = `<div class="big">Подключаемся…</div>`; }
  }
  function beginOffline(n, min) {
    room = null; offline = true; minutes = min; S = null;
    cfg = { mode: "one", me: 0, players: Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "Игрок " + (i + 1) })) };
    $("screen-menu").classList.add("hidden"); $("play").classList.remove("hidden");
    St.gameStart({ players: n, mode: "one" });
    newRound();
  }
  const PARTY = { title: "Шпион", icon: "🕵️", max: 8, noBots: true, minHumans: 3, text: "Го в «Шпиона» 🕵️ Один из нас шпион — вычислим?",
    modes: [{ id: "m6", name: "6 минут" }, { id: "m4", name: "4 минуты" }, { id: "m8", name: "8 минут" }], onCancel: () => $("screen-menu").classList.remove("hidden") };
  const pickChips = (id) => { const box = $(id); box.querySelectorAll(".chip").forEach((c) => c.onclick = () => { box.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === c)); }); return () => +box.querySelector(".chip.on").dataset.v; };
  const nP = pickChips("c-n"), nM = pickChips("c-min");
  $("m-one").onclick = () => $("one-setup").classList.toggle("hidden");
  $("one-go").onclick = () => beginOffline(nP(), nM());
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); beginOnline(await Party.host("shpion", PARTY)); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#1f2a44", bg: "#2e3b5e", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("shpion", inv, PARTY).then(beginOnline); }
  window.__game = { get S() { return S; }, get cfg() { return cfg; }, act: (a) => (isHost() ? act(a, cfg.me) : send("act", a)) };
})();
