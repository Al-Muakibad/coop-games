/* Статистика игр «Кооп-игры». Отправляет события в PostHog (если задан ключ),
   иначе копит их в localStorage (до 300 штук) и досылает позже.
   Stats.event(name, props)  Stats.gameStart(props)  Stats.gameEnd(props)  Stats.state(obj)  */
(function () {
  "use strict";
  // Автотесты и запись роликов (headless-браузер) не считаем — они портили статистику (16.10 и 18.10 это были они).
  const BOT_RUN = !!navigator.webdriver;
  const CFG = BOT_RUN ? { key: "" } : window.STATS_CONFIG || {
    key: "phc_uwVWQ7yDjZYiUUasnKcpfaGPbhYn93GG9McX99P56YUs",   // публичный ключ проекта PostHog (его можно держать в коде)
    host: "https://us.i.posthog.com"
  };
  const T = window.TG, tg = T && T.tg;
  const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  const QK = "kg_stats_queue";
  let anon = null;
  try { anon = localStorage.getItem("kg_anon") || ("a_" + Math.random().toString(36).slice(2, 12)); localStorage.setItem("kg_anon", anon); } catch (_) { anon = "a_" + Math.random().toString(36).slice(2, 12); }
  const distinct = u ? "tg_" + u.id : anon;
  const game = (location.pathname.split("/").filter(Boolean).pop() || "hub").replace("coop-games", "hub");
  const start = Date.now();
  const sp = new URLSearchParams(location.search);
  const startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || "";
  const cParam = sp.get("c") || "";
  const friendRef = /^f[0-9a-z]{1,10}$/.test(cParam) ? cParam.slice(1) : /^f[0-9a-z]{1,10}$/.test(startParam) ? startParam.slice(1) : "";
  const source = friendRef ? "friend" : cParam ? (cParam[0] === "r" ? "invite" : "challenge") : startParam ? "link" : document.referrer.includes("/coop-games/") ? "hub" : "direct";
  const base = {
    game, source, start_param: startParam || undefined, ref: friendRef || undefined,
    platform: tg ? tg.platform : "web", tg_version: tg ? tg.version : undefined,
    lang: u ? u.language_code : navigator.language, premium: u ? !!u.is_premium : undefined,
    screen: `${screen.width}x${screen.height}`
  };
  let lastState = null, gameT0 = null, plays = 0;

  function queue() { try { return JSON.parse(localStorage.getItem(QK) || "[]"); } catch (_) { return []; } }
  function saveQueue(q) { try { localStorage.setItem(QK, JSON.stringify(q.slice(-300))); } catch (_) {} }
  function post(batch, beacon) {
    const body = JSON.stringify({ api_key: CFG.key, batch });
    const url = CFG.host + "/batch/";
    if (beacon && navigator.sendBeacon) return Promise.resolve(navigator.sendBeacon(url, new Blob([body], { type: "text/plain" })));
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).then((r) => r.ok);
  }
  function flush(beacon) {
    if (!CFG.key) return;
    const q = queue(); if (!q.length) return;
    saveQueue([]);
    post(q, beacon).then((ok) => { if (!ok) saveQueue(queue().concat(q)); }).catch(() => saveQueue(queue().concat(q)));
  }
  function event(name, props, beacon) {
    const e = { event: name, distinct_id: distinct, timestamp: new Date().toISOString(),
      properties: Object.assign({}, base, props || {}, { $current_url: location.href.split("#")[0], session_sec: Math.round((Date.now() - start) / 1000) }) };
    const q = queue(); q.push(e); saveQueue(q);
    if (CFG.key) flush(beacon);
  }
  // профиль игрока
  if (u) event("$identify", { $set: { name: [u.first_name, u.last_name].filter(Boolean).join(" "), username: u.username, tg_id: u.id, lang: u.language_code, premium: !!u.is_premium },
    $set_once: { first_game: game, first_source: source } });
  event("open", {});

  const api = {
    event: (n, p) => event(n, p),
    gameStart(p) { gameT0 = Date.now(); plays++; event("game_start", Object.assign({ play_no: plays }, p)); },
    gameEnd(p) { event("game_end", Object.assign({ duration_sec: gameT0 ? Math.round((Date.now() - gameT0) / 1000) : null, play_no: plays }, p)); gameT0 = null;
      try { window.Feedback && Feedback.gameOver(); } catch (_) {} },
    state(s) { lastState = s; },            // «на чём остановился» — уходит при закрытии
    flush
  };
  // пульс раз в 30 с — точное время в игре, и событие ухода
  setInterval(() => { if (document.visibilityState === "visible") event("heartbeat", { in_game: !!gameT0, state: lastState }); }, 30000);
  const leave = () => event("leave", { total_sec: Math.round((Date.now() - start) / 1000), in_game: !!gameT0, state: lastState, plays }, true);
  addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { event("hidden", { state: lastState }, true); } });
  window.Stats = api;
})();
