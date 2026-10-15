/* Дуэль — онлайн-реакция 1 на 1 (и разминка с ботом). Набор «Кооп-игры». */
(function () {
  "use strict";
  const T = window.TG;
  const $ = (id) => document.getElementById(id);
  const WIN = 3, INTRO = 3;

  function rng(seed) {
    let a = (seed * 2654435761) >>> 0 || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const FRUITS = ["🍎", "🍌", "🍇", "🍓", "🥝", "🍋", "🍑", "💣"];
  const PAIRS = ["🐶", "🐱", "🐸", "🐵", "🦊", "🐼"];
  const COLORS = [["КРАСНЫЙ", "#e5484d"], ["СИНИЙ", "#1d4ed8"], ["ЖЁЛТЫЙ", "#ffd34d"], ["ЗЕЛЁНЫЙ", "#16a34a"], ["БЕЛЫЙ", "#ffffff"]];
  const TYPES = {
    green: { title: "Реакция", rule: "Ждите зелёный экран — и жмите!" },
    fruit: { title: "Лови арбуз", rule: "Жми, когда появится 🍉. Не на что-то другое!" },
    pairs: { title: "Пара", rule: "Жми, когда зверьки одинаковые" },
    stroop: { title: "Цвета", rule: "Жми, когда слово совпадает с цветом букв" },
    tug: { title: "Перетягивание", rule: "Тапай как можно чаще — перетяни шкалу!" }
  };
  // Кадры «смотри и жми» строятся одинаково на обоих телефонах из общего seed
  function buildFrames(type, seed) {
    const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
    const hitAt = 2 + Math.floor(r() * 3), base = type === "fruit" ? 0.65 : type === "pairs" ? 0.85 : 0.9;
    const frames = []; let t = 0;
    for (let i = 0; i <= hitAt + 2; i++) {
      const hit = i === hitAt; let f;
      if (type === "fruit") f = { big: hit ? "🍉" : pick(FRUITS) };
      else if (type === "pairs") { const a = pick(PAIRS); let b = pick(PAIRS); if (hit) b = a; else while (b === a) b = pick(PAIRS); f = { big: a + " " + b }; }
      else { const w = pick(COLORS); let c = pick(COLORS); if (hit) c = w; else while (c === w) c = pick(COLORS); f = { big: w[0], color: c[1] }; }
      f.hit = hit; f.t = t; t += hit ? base * 1.6 : base * (0.75 + r() * 0.5);
      frames.push(f);
    }
    return { frames, end: t };
  }

  // ---------- состояние ----------
  let mode = null, room = null, phase = "menu", me = "Ты", opp = "Друг";
  let score = { me: 0, opp: 0 }, R = null, now = 0, stats = { best: null, rounds: 0 }, order = [], lastType = "";
  let results = {}, tug = { pos: 0, myTaps: 0, sentT: 0 }, rematch = { me: false, opp: false };
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };

  // ---------- экран ----------
  const show = (id, on) => $(id).classList.toggle("hidden", !on);
  function screen(id) { ["screen-menu", "screen-room", "screen-end"].forEach((s) => show(s, s === id)); }
  function say(title, big, small, cls, color) {
    $("title").textContent = title || ""; $("big").textContent = big || ""; $("small").textContent = small || "";
    $("big").style.color = color || ""; $("arena").className = cls || "";
  }
  function board() {
    $("nm-me").textContent = me; $("nm-opp").textContent = opp;
    $("dots-me").textContent = "●".repeat(score.me) + "○".repeat(WIN - score.me);
    $("dots-opp").textContent = "●".repeat(score.opp) + "○".repeat(WIN - score.opp);
  }
  function buttons(boxId, list) {
    const box = $(boxId); box.innerHTML = "";
    for (const [label, cls, fn] of list) { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = label; b.onclick = fn; box.appendChild(b); }
  }
  function toMenu() {
    if (room) { try { room.close(); } catch (_) {} room = null; }
    phase = "menu"; R = null; show("board", false); show("tug", false); say("", "⚡", ""); screen("screen-menu");
  }

  // ---------- комната ----------
  async function createRoom() {
    window.Stats && Stats.event("invite_create", {});
    mode = "online"; phase = "room"; screen("screen-room");
    $("room-emoji").textContent = "📡"; $("room-title").textContent = "Создаём комнату"; $("room-sub").textContent = "";
    $("room-status").innerHTML = `<span class="dotsa">Подключаемся к серверу</span>`;
    buttons("room-buttons", [["Отмена", "ghost", toMenu]]);
    try { room = await Net.open("duel", null, { name: T.playerName() }); } catch (_) { return netError(); }
    bindRoom();
    const link = Net.inviteLink("duel", room.id);
    const share = () => T.openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Вызываю на дуэль ⚡ Кто быстрее нажмёт? Заходи, я жду!")}`);
    $("room-emoji").textContent = "📨"; $("room-title").textContent = "Позови соперника";
    $("room-sub").textContent = "Отправь приглашение. Как только друг откроет ссылку — дуэль начнётся. Не закрывай игру.";
    $("room-status").innerHTML = `<span class="dotsa">Ждём соперника</span>`;
    buttons("room-buttons", [["📨 Отправить приглашение", "primary", share], ["Отмена", "ghost", toMenu]]);
    share();
  }
  async function joinRoom(id) {
    mode = "online"; phase = "room"; screen("screen-room");
    $("room-emoji").textContent = "⚡"; $("room-title").textContent = "Тебя вызвали на дуэль"; $("room-sub").textContent = "";
    $("room-status").innerHTML = `<span class="dotsa">Подключаемся</span>`;
    buttons("room-buttons", [["Отмена", "ghost", toMenu]]);
    try { room = await Net.open("duel", id, { name: T.playerName() }); } catch (_) { return netError(); }
    bindRoom();
    setTimeout(() => {
      if (room && !room.peer && phase === "room") {
        $("room-emoji").textContent = "😕"; $("room-title").textContent = "Комната не найдена";
        $("room-status").textContent = "Соперник уже вышел. Попроси прислать новое приглашение.";
        buttons("room-buttons", [["🤖 Сыграть с ботом", "", startBot], ["В меню", "ghost", toMenu]]);
      }
    }, 12000);
  }
  function netError() {
    $("room-emoji").textContent = "📵"; $("room-title").textContent = "Нет связи с сервером";
    $("room-status").textContent = "Проверь интернет и попробуй ещё раз.";
    buttons("room-buttons", [["Попробовать снова", "primary", () => location.reload()], ["🤖 С ботом", "", startBot], ["В меню", "ghost", toMenu]]);
  }
  function bindRoom() {
    room.on("peer", (p) => {
      opp = p.name || "Друг"; room.send("name", { name: me });
      window.Stats && Stats.event(room.isHost ? "invite_accepted" : "invite_join", {});
      $("room-emoji").textContent = "✅"; $("room-title").textContent = `${opp} в игре!`; $("room-status").textContent = "Начинаем…";
      T.haptic("notify", "success");
      if (room.isHost) setTimeout(() => { if (room && room.peer) hostStart(); }, 1200);
    });
    room.on("name", (d) => { if (d && d.name) { opp = d.name.slice(0, 20); board(); } });
    room.on("peer-left", () => {
      if (phase === "menu") return;
      if (phase === "room" && room.isHost) { $("room-status").innerHTML = `<span class="dotsa">Соперник вышел. Ждём снова</span>`; return; }
      phase = "end"; R = null; show("tug", false);
      $("end-emoji").textContent = "🚪"; $("end-title").textContent = `${opp} вышел`; $("end-score").textContent = `${score.me} : ${score.opp}`;
      $("end-sub").textContent = ""; $("end-status").textContent = "";
      buttons("end-buttons", [["⚔️ Позвать снова", "primary", () => { toMenu(); createRoom(); }], ["В меню", "ghost", toMenu]]);
      screen("screen-end");
    });
    bindGame(room);
  }
  function bindGame(rm) {
    rm.on("start", () => beginMatch());
    rm.on("round", (d) => beginRound(d));
    rm.on("ready", (d) => { if (isHost()) onReady("opp", d.n); });
    rm.on("go", (d) => onGo(d));
    rm.on("res", (d) => { if (isHost()) collect("opp", d); });
    rm.on("taps", (d) => { if (isHost() && R && R.type === "tug") hostTug(0, d.c); });
    rm.on("tug", (d) => { if (!isHost()) { tug.pos = -d.pos; drawTug(); } });
    rm.on("point", (d) => onPoint(d));
    rm.on("rematch", () => { rematch.opp = true; tryRematch(); });
  }

  // ---------- ход матча (хозяин решает) ----------
  function hostStart() { send("start", {}); beginMatch(); setTimeout(hostNextRound, 900); }
  function nextType() {
    if (!order.length) { order = Object.keys(TYPES).sort(() => Math.random() - 0.5); if (order[0] === lastType) order.push(order.shift()); }
    return (lastType = order.shift());
  }
  function hostNextRound() {
    if (score.me >= WIN || score.opp >= WIN) return;
    const d = { n: stats.rounds, type: nextType(), seed: Math.floor(Math.random() * 1e6), delay: 1.4 + Math.random() * 3.2 };
    send("round", d); beginRound(d);
  }
  function collect(who, res) {
    if (!R || R.decided || res.n !== R.n) return;
    results[who] = res;
    if (results.me && results.opp) decide();
  }
  function decide() {
    R.decided = true;
    const a = results.me, b = results.opp;
    let w = null, note = "";
    if (a.fs && !b.fs) { w = "opp"; note = `${me}: фальстарт`; }
    else if (b.fs && !a.fs) { w = "me"; note = `${opp}: фальстарт`; }
    else if (!a.fs && !b.fs) {
      if (a.ms != null && (b.ms == null || a.ms < b.ms)) { w = "me"; note = `${a.ms} мс` + (b.ms != null ? ` против ${b.ms}` : ""); }
      else if (b.ms != null) { w = "opp"; note = `${b.ms} мс` + (a.ms != null ? ` против ${a.ms}` : ""); }
      else note = "Оба прозевали";
    } else note = "Оба поспешили";
    const d = { n: R.n, w: w === "me" ? "host" : w === "opp" ? "guest" : null, note, ms: { host: a.ms, guest: b.ms } };
    send("point", d); onPoint(d);
  }
  function hostTug(myTaps, oppTaps) {
    if (!R || R.decided) return;
    tug.pos += (myTaps - oppTaps) * 0.045;
    send("tug", { pos: tug.pos }); drawTug();
    if (Math.abs(tug.pos) >= 1) {
      R.decided = true;
      const d = { n: R.n, w: tug.pos > 0 ? "host" : "guest", note: "Перетянул!" };
      send("point", d); onPoint(d);
    }
  }

  function beginMatch() {
    score = { me: 0, opp: 0 }; stats = { best: null, rounds: 0 }; order = []; rematch = { me: false, opp: false };
    screen(null); show("board", true); board();
    window.Stats && Stats.gameStart({ mode });
  }

  // Раунд: сначала правила и кнопка «Готов» у обоих, потом 3-2-1 и игра
  function beginRound(d) {
    stats.rounds = d.n + 1;
    R = { n: d.n, type: d.type, seed: d.seed, t0: null, sent: false, decided: false, delay: d.delay, frameIdx: -1, ready: { me: false, opp: false } };
    results = {};
    phase = "rules"; show("tug", false);
    say(`Раунд ${d.n + 1}`, TYPES[d.type].title, TYPES[d.type].rule);
    const b = $("ready-btn"); b.classList.remove("hidden"); b.disabled = false; b.textContent = "Понятно, готов!";
    T.haptic("select");
    if (mode === "bot") setTimeout(() => onReady("opp", R.n), 900 + Math.random() * 900);
  }
  function pressReady() {
    if (!R || phase !== "rules" || R.ready.me) return;
    const b = $("ready-btn"); b.disabled = true; b.textContent = `Ждём ${opp}…`;
    T.haptic("impact", "medium");
    if (isHost()) onReady("me", R.n); else send("ready", { n: R.n });
  }
  function onReady(who, n) {
    if (!R || R.n !== n || phase !== "rules") return;
    R.ready[who] = true;
    if (who === "opp") $("small").textContent = `${opp} готов ✅`;
    if (isHost() && R.ready.me && R.ready.opp) { send("go", { n }); onGo({ n }); }
  }
  function onGo(d) {
    if (!R || R.n !== d.n || phase !== "rules") return;
    $("ready-btn").classList.add("hidden");
    R.t0 = now;
    if (R.type === "green") R.goAt = R.t0 + INTRO + R.delay;
    if (["fruit", "pairs", "stroop"].includes(R.type)) { const f = buildFrames(R.type, R.seed); R.frames = f.frames; R.endAt = R.t0 + INTRO + f.end; }
    if (R.type === "tug") { tug = { pos: 0, myTaps: 0, sentT: 0 }; R.endAt = R.t0 + INTRO + 12; }
    phase = "intro";
    if (mode === "bot") bot.plan(R);
  }

  function submit(res) {
    if (!R || R.sent) return;
    R.sent = true; res.n = R.n;
    if (isHost()) collect("me", res); else send("res", res);
    if (res.fs) say("", "Рано! 😬", "Фальстарт", "lose");
    else if (res.ms != null) say("", `${res.ms} мс`, "Ждём соперника…", "");
  }

  function onPoint(d) {
    if (!R || R.done) return;
    R.done = true; phase = "result";
    const host = isHost();
    const w = d.w === null ? null : (d.w === "host") === host ? "me" : "opp";
    if (w) score[w]++;
    const myMs = d.ms ? (host ? d.ms.host : d.ms.guest) : null;
    if (myMs != null && (!stats.best || myMs < stats.best)) stats.best = myMs;
    board(); show("tug", false);
    if (w === "me") { say("", "+1 🎉", d.note, "win"); T.haptic("notify", "success"); }
    else if (w === "opp") { say("", "Мимо 😤", `Очко у ${opp} · ${d.note}`, "lose"); T.haptic("notify", "error"); }
    else say("", "Ничья", d.note, "");
    setTimeout(() => {
      if (score.me >= WIN || score.opp >= WIN) return endMatch();
      if (isHost()) hostNextRound();
    }, 1900);
  }

  function endMatch() {
    phase = "end"; R = null;
    const win = score.me > score.opp;
    window.Stats && Stats.gameEnd({ mode, win, me: score.me, opp: score.opp, rounds: stats.rounds, best_ms: stats.best });
    $("end-emoji").textContent = win ? "🏆" : "😤";
    $("end-title").textContent = win ? "Ты победил!" : `Победил ${opp}`;
    $("end-score").textContent = `${score.me} : ${score.opp}`;
    $("end-sub").textContent = `Раундов: ${stats.rounds}` + (stats.best ? ` · твоя лучшая реакция ${stats.best} мс` : "");
    $("end-status").textContent = "";
    const list = [["🔁 Реванш", "primary", askRematch]];
    if (mode === "bot") list.push(["⚔️ Позвать друга", "", () => { toMenu(); createRoom(); }]);
    list.push(["В меню", "ghost", toMenu]);
    buttons("end-buttons", list);
    screen("screen-end");
  }
  function askRematch() {
    if (mode === "bot") return startBot();
    rematch.me = true; send("rematch", {}); $("end-status").innerHTML = `<span class="dotsa">Ждём ${opp}</span>`; tryRematch();
  }
  function tryRematch() {
    if (phase !== "end") return;
    if (!rematch.me) {
      $("end-status").innerHTML = `<b style="color:#e5484d;font-size:18px">🔥 ${opp} хочет реванш!</b>`;
      const b = $("end-buttons").querySelector(".btn.primary"); if (b) b.textContent = "✅ Принять реванш";
      T.haptic("notify", "warning"); return;
    }
    if (rematch.opp && isHost()) hostStart();
  }

  // ---------- бот ----------
  let botH = {};
  const bot = {
    plan(r) {
      if (r.type === "green") {
        const fs = Math.random() < 0.08;
        const ms = Math.round(230 + Math.random() * 190);
        setTimeout(() => botRes(fs ? { fs: true } : { ms }), ((fs ? INTRO + r.delay * Math.random() : INTRO + r.delay) * 1000) + (fs ? 0 : ms));
      } else if (r.frames) {
        const hit = r.frames.find((f) => f.hit), ms = Math.round(320 + Math.random() * 260);
        if (Math.random() < 0.06) { const f = r.frames[1]; setTimeout(() => botRes({ fs: true }), (INTRO + f.t + 0.3) * 1000); }
        else setTimeout(() => botRes({ ms }), (INTRO + hit.t) * 1000 + ms);
      } else if (r.type === "tug") {
        const rate = 6 + Math.random() * 2.5;
        r.botTimer = setInterval(() => { if (!R || R !== r || r.decided) return clearInterval(r.botTimer); if (now > r.t0 + INTRO) hostTug(0, 1); }, 1000 / rate);
      }
    }
  };
  function botRes(res) { const n = R && R.n; if (R) collect("opp", Object.assign(res, { n })); }
  function startBot() {
    if (room) { try { room.close(); } catch (_) {} room = null; }
    mode = "bot"; opp = "🤖 Бот"; botH = {};
    hostStart();
  }

  // ---------- цикл ----------
  let last = 0;
  function frame(ts) {
    now = ts / 1000;
    if (R && !R.done && R.t0 != null) {
      const lt = now - R.t0;
      if (phase === "intro" && lt < INTRO) {
        const c = Math.ceil(INTRO - lt);
        if (R.cd !== c) { R.cd = c; say(TYPES[R.type].title, String(c), "приготовься", ""); T.haptic("impact", "light"); }
      }
      if (phase === "intro" && lt >= INTRO) {
        phase = "play";
        if (R.type === "green") say("Реакция", "Ждём…", "не жми раньше времени", "wait");
        if (R.type === "tug") { say("", "ТАПАЙ!", "", ""); show("tug", true); drawTug(); }
        T.haptic("impact", "heavy");
      }
      if (phase === "play" && !R.sent) {
        if (R.type === "green") {
          if (now >= R.goAt && !R.live) { R.live = true; say("", "ЖМИ!", "", "go"); T.haptic("impact", "heavy"); }
          if (now > R.goAt + 3) submit({ ms: null });
        } else if (R.frames) {
          const t = now - R.t0 - INTRO;
          let idx = -1; for (let i = 0; i < R.frames.length; i++) if (t >= R.frames[i].t) idx = i;
          if (idx !== R.frameIdx && idx >= 0) {
            R.frameIdx = idx; const f = R.frames[idx];
            if (f.hit) R.hitShown = now;
            say(TYPES[R.type].title, f.big, "", "", f.color);
          }
          if (now >= R.endAt) submit({ ms: null });
        }
      }
      if (phase === "play" && R.type === "tug") {
        tug.sentT -= 1 / 60;
        if (tug.myTaps && (isHost() || tug.sentT <= 0)) {
          if (isHost()) hostTug(tug.myTaps, 0); else send("taps", { c: tug.myTaps });
          tug.myTaps = 0; tug.sentT = 0.12;
        }
        if (isHost() && now >= R.endAt && !R.decided) {
          R.decided = true; const d = { n: R.n, w: tug.pos === 0 ? null : tug.pos > 0 ? "host" : "guest", note: "Время вышло" };
          send("point", d); onPoint(d);
        }
      }
    }
    requestAnimationFrame(frame);
  }
  function drawTug() { $("tug-me").style.width = Math.max(0, Math.min(100, 50 + tug.pos * 50)) + "%"; }

  function tap() {
    if (!R || R.done || phase !== "play") return;
    if (R.type === "tug") { tug.myTaps++; T.haptic("impact", "light"); return; }
    if (R.sent) return;
    if (R.type === "green") {
      if (!R.live) return submit({ fs: true });
      return submit({ ms: Math.round((now - R.goAt) * 1000) });
    }
    const f = R.frames[R.frameIdx];
    if (!f) return;
    if (f.hit) submit({ ms: Math.round((now - R.hitShown) * 1000) }); else submit({ fs: true });
  }
  $("arena").addEventListener("pointerdown", (e) => { if (e.target.id === "ready-btn") return; e.preventDefault(); tap(); });
  $("ready-btn").addEventListener("click", (e) => { e.stopPropagation(); pressReady(); });
  window.addEventListener("keydown", (e) => { if (e.code === "Space") tap(); });

  $("m-invite").onclick = createRoom;
  $("m-bot").onclick = () => { screen(null); startBot(); };
  $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#2f7cf6", bg: "#2f7cf6", back: "../" });
  me = T.playerName() === "Друг" ? "Ты" : T.playerName();
  const fake = { on(t, fn) { (botH[t] = botH[t] || []).push(fn); return fake; } };
  const inv = Net.readInvite();
  if (inv) joinRoom(inv); else toMenu();
  requestAnimationFrame(frame);

  window.__game = { get phase() { return phase; }, get R() { return R; }, get score() { return score; }, get roomId() { return room && room.id; }, tap, startBot, createRoom };
})();
