/* Лобби для игр компанией (до 6–8 игроков, боты добивают места, режимы и команды).
   Party.host(game, opts) / Party.join(game, roomId, opts) / Party.offline(opts) → Promise<{room, cfg}>
   cfg = {mode, seed, players:[{id, name, bot, team, color}], me: индекс меня}
   opts: {title, max, modes:[{id, name, teams}], bots, text, onCancel} */
(function () {
  "use strict";
  const T = window.TG;
  const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];
  const TEAMNAMES = ["Синие", "Красные", "Зелёные", "Жёлтые"];
  let el = null;
  function ui() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "pt-screen pt-hidden";
    const st = document.createElement("style");
    st.textContent = `.pt-screen{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(10,14,30,.6);font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
    .pt-hidden{display:none!important}
    .pt-card{width:100%;max-width:400px;max-height:calc(100vh - 28px);overflow:auto;background:#fff7ea;color:#2b1d14;border:3px solid #2b1d14;border-radius:22px;box-shadow:0 8px 0 #2b1d14;padding:16px;text-align:center}
    .pt-card h2{margin:4px 0;font-size:24px;font-weight:900}.pt-sub{color:#8a7462;font-size:14px;margin:0 0 8px}
    .pt-list{display:flex;flex-direction:column;gap:6px;margin:10px 0;text-align:left}
    .pt-p{display:flex;align-items:center;gap:8px;padding:7px 10px;border:2px solid #2b1d14;border-radius:12px;background:#fff;font-weight:800}
    .pt-dot{width:16px;height:16px;border-radius:50%;border:2px solid #2b1d14;flex:0 0 16px}
    .pt-p small{margin-left:auto;font-weight:700;color:#8a7462}
    .pt-row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:6px 0}
    .pt-chip{border:2px solid #2b1d14;border-radius:999px;padding:6px 10px;background:#fff;font:inherit;font-weight:800;font-size:13px}
    .pt-chip.on{background:#ffd34d}
    .pt-btn{display:block;width:100%;margin-top:8px;padding:13px;border-radius:14px;border:3px solid #2b1d14;background:#fff;font:inherit;font-weight:900;font-size:16px;color:#2b1d14;box-shadow:0 4px 0 #2b1d14}
    .pt-btn.primary{background:#ff7a2f;color:#fff}.pt-btn.ghost{background:transparent;border-color:transparent;box-shadow:none;color:#d95a12}
    .pt-st{font-weight:700;color:#8a7462;margin:6px 0}`;
    document.head.appendChild(st);
    document.body.appendChild(el);
    return el;
  }
  const hide = () => el && el.classList.add("pt-hidden");
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

  function build(humans, opts, mode, bots, teamsOverride) {
    const m = opts.modes.find((x) => x.id === mode) || opts.modes[0];
    const list = humans.map((p) => ({ id: p.id, name: p.name, bot: false }));
    for (let i = 0; i < bots; i++) list.push({ id: "bot" + i, name: "🤖 Бот " + (i + 1), bot: true });
    list.forEach((p, i) => {
      p.team = m.teams ? (teamsOverride && teamsOverride[p.id] != null ? teamsOverride[p.id] % m.teams : i % m.teams) : i;
      p.color = m.teams ? COLORS[p.team] : COLORS[i % COLORS.length];
    });
    return { mode: m.id, teams: m.teams || 0, seed: Math.floor(Math.random() * 1e9), players: list };
  }
  function render(room, opts, state, isHost) {
    const u = ui(), m = opts.modes.find((x) => x.id === state.mode) || opts.modes[0];
    const preview = build(room ? room.players : [{ id: "me", name: "Ты" }], opts, state.mode, state.bots, state.teams);
    const meId = room ? room.me.id : "me";
    u.innerHTML = `<div class="pt-card">
      <div style="font-size:38px">${opts.icon || "🎉"}</div><h2>${esc(opts.title)}</h2>
      <div class="pt-sub">${isHost ? "Позови друзей одной ссылкой — заходят сколько угодно до " + opts.max + "." + (opts.noBots ? "" : " Пустые места займут боты.") : "Ты в комнате. Ждём, пока хозяин начнёт игру."}</div>
      ${isHost ? `<div class="pt-row">${opts.modes.map((x) => `<button class="pt-chip ${x.id === state.mode ? "on" : ""}" data-mode="${x.id}">${x.name}</button>`).join("")}</div>
      ${opts.noBots ? "" : `<div class="pt-row" style="align-items:center"><b style="font-size:14px">Боты:</b>
        <button class="pt-chip" data-bot="-1">−</button><b>${state.bots}</b><button class="pt-chip" data-bot="1">+</button></div>`}` : ""}
      <div class="pt-list">${preview.players.map((p) => `<div class="pt-p" data-pid="${p.id}"><span class="pt-dot" style="background:${p.color}"></span>${esc(p.name)}${p.id === meId ? " (ты)" : ""}
        <small>${m.teams ? TEAMNAMES[p.team] + (isHost && !p.bot ? " ⇄" : "") : ""}</small></div>`).join("")}</div>
      <div class="pt-st">${state.status || ""}</div>
      ${isHost && room ? `<button class="pt-btn" data-inv>📨 Пригласить друзей</button>` : ""}
      ${isHost ? `<button class="pt-btn primary" data-go>▶ Начать (${preview.players.length})</button>` : ""}
      <button class="pt-btn ghost" data-x>Выйти</button></div>`;
    u.classList.remove("pt-hidden");
    return u;
  }

  function lobby(room, opts, isHost) {
    return new Promise((resolve) => {
      const state = { mode: opts.modes[0].id, bots: opts.noBots ? 0 : opts.bots != null ? opts.bots : 2, teams: {}, status: "" };
      const draw = () => {
        const humans = room ? room.players.length : 1;
        state.bots = Math.max(0, Math.min(state.bots, opts.max - humans));
        const u = render(room, opts, state, isHost);
        u.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => { state.mode = b.dataset.mode; draw(); });
        u.querySelectorAll("[data-bot]").forEach((b) => b.onclick = () => { state.bots += +b.dataset.bot; draw(); });
        u.querySelectorAll("[data-pid]").forEach((b) => b.onclick = () => {
          const mm = opts.modes.find((x) => x.id === state.mode);
          if (!isHost || !mm.teams || b.dataset.pid.startsWith("bot")) return;
          const cur = state.teams[b.dataset.pid] != null ? state.teams[b.dataset.pid] : [...(room ? room.players : [{ id: "me" }])].findIndex((p) => p.id === b.dataset.pid) % mm.teams;
          state.teams[b.dataset.pid] = (cur + 1) % mm.teams; draw();
        });
        const inv = u.querySelector("[data-inv]");
        if (inv) inv.onclick = () => share(room, opts);
        const go = u.querySelector("[data-go]");
        if (go && opts.minHumans && (room ? room.players.length : 1) < opts.minHumans) { go.disabled = true; go.style.opacity = .5; go.textContent = `Нужно минимум ${opts.minHumans} игрока — позови друзей`; }
        if (go) go.onclick = () => {
          if (go.disabled) return;
          const cfg = build(room ? room.players : [{ id: "me", name: T.playerName() === "Друг" ? "Ты" : T.playerName() }], opts, state.mode, state.bots, state.teams);
          if (room) { room.lock(); room.send("start", cfg); }
          hide(); resolve(withMe(cfg, room));
        };
        u.querySelector("[data-x]").onclick = () => { if (room) room.close(); hide(); opts.onCancel && opts.onCancel(); };
      };
      if (room) {
        room.on("roster", draw);
        room.on("start", (cfg) => { if (!isHost) { hide(); resolve(withMe(cfg, room)); } });
        room.on("host-left", () => { state.status = "Хозяин комнаты вышел 😕"; draw(); });
        room.on("full", (d) => { state.status = d && d.started ? "Игра уже началась — попроси новое приглашение" : "Комната заполнена"; draw(); });
      }
      draw();
    });
  }
  function withMe(cfg, room) { const id = room ? room.me.id : "me"; return { room, cfg: Object.assign({}, cfg, { me: Math.max(0, cfg.players.findIndex((p) => p.id === id)) }) }; }
  function share(room, opts) {
    const link = Net.inviteLink(opts.game, room.id);
    T.openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(opts.text || "Заходи в игру!")}`);
  }
  async function host(game, opts) {
    opts = Object.assign({ max: 6 }, opts, { game });
    const u = ui(); u.innerHTML = `<div class="pt-card"><div style="font-size:38px">📡</div><h2>Создаём комнату…</h2></div>`; u.classList.remove("pt-hidden");
    let room;
    try { room = await Net.openParty(game, null, { name: T.playerName() === "Друг" ? "Хозяин" : T.playerName(), max: opts.max }); }
    catch (e) { u.innerHTML = `<div class="pt-card"><div style="font-size:38px">📵</div><h2>Нет связи с сервером</h2><button class="pt-btn" data-x>Назад</button></div>`; u.querySelector("[data-x]").onclick = () => { hide(); opts.onCancel && opts.onCancel(); }; return new Promise(() => {}); }
    window.Party.current = room; window.Stats && Stats.event("party_create", { game });
    share(room, opts);
    return lobby(room, opts, true);
  }
  async function join(game, id, opts) {
    opts = Object.assign({ max: 6 }, opts, { game });
    const u = ui(); u.innerHTML = `<div class="pt-card"><div style="font-size:38px">⚔️</div><h2>Подключаемся…</h2></div>`; u.classList.remove("pt-hidden");
    let room;
    try { room = await Net.openParty(game, id, { name: T.playerName() }); }
    catch (e) { u.innerHTML = `<div class="pt-card"><div style="font-size:38px">📵</div><h2>Нет связи с сервером</h2><button class="pt-btn" data-x>Назад</button></div>`; u.querySelector("[data-x]").onclick = () => { hide(); opts.onCancel && opts.onCancel(); }; return new Promise(() => {}); }
    window.Stats && Stats.event("party_join", { game });
    return lobby(room, opts, false);
  }
  function offline(opts) { opts = Object.assign({ max: 6 }, opts); return lobby(null, opts, true); }
  window.Party = { host, join, offline, COLORS, TEAMNAMES, hide };
})();
