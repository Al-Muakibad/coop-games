/* Дуэль — игра вдвоём на одном телефоне. Набор «Кооп-игры». */
(function () {
  "use strict";
  const T = window.TG;
  const WIN = 3;
  const P = { 1: { name: "🟠 Оранжевый", el: "p1" }, 2: { name: "🔵 Синий", el: "p2" } };
  const $ = (id) => document.getElementById(id);

  let score = { 1: 0, 2: 0 }, round = 0, mode = "idle", rt = null, timers = [], order = [], lastType = "";
  let stats = { fastest: null };

  // ---------- вывод сразу на обе половины ----------
  function say(title, big, small) {
    for (const k of [1, 2]) {
      $(`p${k}-title`).textContent = title || "";
      $(`p${k}-big`).textContent = big || "";
      $(`p${k}-small`).textContent = typeof small === "function" ? small(k) : (small || "");
    }
  }
  function paint(cls) {
    for (const k of [1, 2]) { const el = $(`p${k}`); el.classList.remove("go", "wait", "win"); if (cls) el.classList.add(cls); }
  }
  function pts() {
    for (const k of [1, 2]) {
      const o = k === 1 ? 2 : 1;
      $(`p${k}-pts`).textContent = "●".repeat(score[k]) + "○".repeat(WIN - score[k]) + "   vs   " + "●".repeat(score[o]) + "○".repeat(WIN - score[o]);
    }
  }
  function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; if (rt && rt.raf) cancelAnimationFrame(rt.raf); }
  function setSplit(frac) { // доля экрана у синего (сверху)
    $("p2").style.height = frac * 100 + "%"; $("p1").style.height = (1 - frac) * 100 + "%";
    $("divider").style.top = `calc(${frac * 100}% - 3px)`;
  }

  // ---------- типы раундов ----------
  const FRUITS = ["🍎", "🍌", "🍇", "🍓", "🥝", "🍋", "🍑", "💣"];
  const PAIRS = ["🐶", "🐱", "🐸", "🐵", "🦊", "🐼"];
  const COLORS = [["КРАСНЫЙ", "#e5484d"], ["СИНИЙ", "#2f7cf6"], ["ЖЁЛТЫЙ", "#ffd34d"], ["ЗЕЛЁНЫЙ", "#22c55e"], ["БЕЛЫЙ", "#ffffff"]];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  const TYPES = {
    green: {
      title: "Реакция", rule: "Ждите зелёный экран — и жмите!",
      start() {
        paint("wait"); say("Реакция", "Ждём…", "не жми раньше времени");
        later(() => { rt.live = true; rt.at = performance.now(); paint("go"); say("", "ЖМИ!", ""); T.haptic("impact", "heavy"); },
          1400 + Math.random() * 3200);
      },
      tap(k) {
        if (!rt.live) return falseStart(k);
        const ms = Math.round(performance.now() - rt.at);
        if (!stats.fastest || ms < stats.fastest.ms) stats.fastest = { k, ms };
        win(k, `${ms} мс`);
      }
    },
    fruit: watchType("Лови арбуз", "Жми, когда появится 🍉. Не на что-то другое!",
      (i, hit) => ({ big: hit ? "🍉" : pick(FRUITS), hit }), 650),
    pairs: watchType("Пара", "Жми, когда зверьки одинаковые",
      (i, hit) => { const a = pick(PAIRS); let b = pick(PAIRS); if (hit) b = a; else while (b === a) b = pick(PAIRS); return { big: a + " " + b, hit }; }, 850),
    stroop: watchType("Цвета", "Жми, когда слово совпадает с цветом букв",
      (i, hit) => { const w = pick(COLORS); let c = pick(COLORS); if (hit) c = w; else while (c === w) c = pick(COLORS); return { big: w[0], color: c[1], hit }; }, 900),
    tug: {
      title: "Перетягивание", rule: "Жми как можно чаще — отожми половину экрана у соперника!",
      start() {
        rt.pos = 0.5; rt.live = true; paint(null); say("", "ТАПАЙ!", "");
        T.haptic("impact", "heavy");
      },
      tap(k) {
        rt.pos += k === 2 ? 0.028 : -0.028;
        setSplit(rt.pos);
        if (rt.pos >= 0.85) win(2); else if (rt.pos <= 0.15) win(1);
      }
    }
  };

  function watchType(title, rule, gen, period) {
    return {
      title, rule,
      start() {
        paint(null); rt.n = 0; rt.hitAt = 3 + Math.floor(Math.random() * 5); rt.live = true;
        const tick = () => {
          const hit = rt.n === rt.hitAt;
          rt.frame = gen(rt.n, hit); rt.n++;
          if (hit) rt.hitTime = performance.now();
          if (rt.n > rt.hitAt + 2) rt.hitAt = rt.n + 2 + Math.floor(Math.random() * 4); // прозевали — ещё раз
          say("", rt.frame.big, "");
          for (const k of [1, 2]) $(`p${k}-big`).style.color = rt.frame.color || "";
          later(tick, hit ? period * 1.5 : period * (0.75 + Math.random() * 0.5));
        };
        tick();
      },
      tap(k) {
        if (!rt.frame) return;
        if (rt.frame.hit) win(k, `${Math.round(performance.now() - rt.hitTime)} мс`);
        else falseStart(k, "мимо!");
      }
    };
  }

  // ---------- ход матча ----------
  function nextType() {
    if (!order.length) {
      order = Object.keys(TYPES).sort(() => Math.random() - 0.5);
      if (order[0] === lastType) order.push(order.shift());
    }
    lastType = order.shift();
    return lastType;
  }

  function startRound() {
    clearTimers(); setSplit(0.5);
    round++;
    const type = nextType();
    rt = { type, live: false };
    mode = "intro"; paint(null);
    for (const k of [1, 2]) $(`p${k}-big`).style.color = "";
    say(`Раунд ${round}`, TYPES[type].title, TYPES[type].rule);
    T.haptic("select");
    later(() => { mode = "play"; TYPES[type].start(); }, 2300);
  }

  function win(k, note) {
    if (mode !== "play") return;
    mode = "result"; clearTimers();
    score[k]++; pts();
    T.haptic("notify", "success");
    for (const j of [1, 2]) {
      $(`p${j}`).classList.remove("go", "wait", "win");
      if (j === k) $(`p${j}`).classList.add("win");
      $(`p${j}-big`).style.color = "";
    }
    say("", "", "");
    for (const j of [1, 2]) {
      $(`p${j}-big`).textContent = j === k ? "+1 🎉" : "Мимо 😤";
      $(`p${j}-small`).textContent = (j === k ? "Раунд твой" : `Раунд за: ${P[k].name}`) + (note ? ` · ${note}` : "");
    }
    later(() => (score[k] >= WIN ? endMatch(k) : startRound()), 1700);
  }

  function falseStart(k, why) {
    if (mode !== "play") return;
    const o = k === 1 ? 2 : 1;
    win(o, `${P[k].name}: ${why || "фальстарт!"}`);
  }

  function endMatch(k) {
    mode = "end"; clearTimers(); setSplit(0.5);
    for (const j of [1, 2]) {
      $(`p${j}`).classList.remove("go", "wait", "win");
      if (j === k) $(`p${j}`).classList.add("win");
    }
    say("", "", "");
    for (const j of [1, 2]) $(`p${j}-big`).textContent = j === k ? "ПОБЕДА 🏆" : "Реванш?";
    $("end-title").textContent = `Победил ${P[k].name}`;
    $("end-score").textContent = `${score[1]} : ${score[2]}`;
    $("end-breakdown").textContent = `🟠 : 🔵 · раундов: ${round}` +
      (stats.fastest ? ` · лучшая реакция ${stats.fastest.ms} мс (${P[stats.fastest.k].name})` : "");
    later(() => $("screen-end").classList.remove("hidden"), 1200);
  }

  function startMatch() {
    score = { 1: 0, 2: 0 }; round = 0; order = []; stats = { fastest: null };
    $("screen-start").classList.add("hidden"); $("screen-end").classList.add("hidden");
    pts(); startRound();
  }

  // ---------- ввод: каждая половина отдельно, мультитач ----------
  for (const k of [1, 2]) {
    $(`p${k}`).addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (mode !== "play" || !rt) return;
      const el = $(`p${k}`); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 80);
      TYPES[rt.type].tap(k);
    });
  }
  window.addEventListener("keydown", (e) => { // для теста на компьютере: A — синий, L — оранжевый
    if (mode !== "play" || !rt) return;
    if (e.key === "a" || e.key === "ф") TYPES[rt.type].tap(2);
    if (e.key === "l" || e.key === "д") TYPES[rt.type].tap(1);
  });

  $("btn-start").onclick = startMatch;
  $("btn-again").onclick = startMatch;
  $("btn-menu").onclick = $("btn-menu0").onclick = () => { location.href = "../"; };
  $("btn-share").onclick = () => T.shareGame("duel", "Дуэль на одном телефоне ⚡ Кто быстрее? Зови друга и жми");

  T.init({ header: "#2f7cf6", bg: "#2b1d14", back: "../" });
  say("", "⚡", ""); pts();

  window.__game = {
    get mode() { return mode; }, get score() { return score; }, get type() { return rt && rt.type; },
    get live() { return rt && (rt.live || (rt.frame && rt.frame.hit)); },
    tap(k) { if (mode === "play" && rt) TYPES[rt.type].tap(k); }, start: startMatch
  };
})();
