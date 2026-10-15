/* Экран «позови друга / подключаемся» для онлайн-игр. Нужны tg.js, net.js и ui.css.
   Lobby.host(game, {text, onCancel, onBot}) -> Promise<room>   (резолвится, когда друг зашёл)
   Lobby.join(game, roomId, {onCancel, onBot}) -> Promise<room> */
(function () {
  "use strict";
  const T = window.TG;
  let el = null;
  function ui() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "screen hidden"; el.id = "lobby";
    el.innerHTML = `<div class="card"><div class="logo" data-e></div><h2 data-t></h2><p class="sub" data-s></p>
      <div class="status" data-st style="margin:10px 0 2px;font-weight:700;color:var(--muted)"></div><div data-b></div></div>
      <style>.lb-dots::after{content:"";animation:lbd 1.2s infinite}@keyframes lbd{0%{content:""}33%{content:"."}66%{content:".."}100%{content:"..."}}</style>`;
    document.body.appendChild(el);
    return el;
  }
  function set(e, t, s, st, btns) {
    const u = ui();
    u.querySelector("[data-e]").textContent = e; u.querySelector("[data-t]").textContent = t;
    u.querySelector("[data-s]").textContent = s || ""; u.querySelector("[data-st]").innerHTML = st || "";
    const box = u.querySelector("[data-b]"); box.innerHTML = "";
    (btns || []).forEach(([label, cls, fn]) => { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = label; b.onclick = fn; box.appendChild(b); });
    u.classList.remove("hidden");
  }
  function hide() { if (el) el.classList.add("hidden"); }
  const dots = (s) => `<span class="lb-dots">${s}</span>`;

  function host(game, opts) {
    return new Promise(async (resolve) => {
      let room = null;
      const cancel = () => { if (room) room.close(); hide(); opts.onCancel && opts.onCancel(); };
      set("📡", "Создаём комнату", "", dots("Подключаемся к серверу"), [["Отмена", "ghost", cancel]]);
      try { room = await Net.open(game, null, { name: T.playerName() }); }
      catch (e) { return fail(opts); }
      window.Lobby.current = room;
      const link = Net.inviteLink(game, room.id);
      const share = () => T.openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(opts.text || "Заходи в игру!")}`);
      set("📨", "Позови друга", "Отправь приглашение. Как только друг откроет ссылку — игра начнётся. Не закрывай экран.", dots("Ждём друга"),
        [["📨 Отправить приглашение", "primary", share], ["Отмена", "ghost", cancel]]);
      room.on("peer", (p) => { set("✅", `${p.name} в игре!`, "", "Начинаем…", []); setTimeout(() => { hide(); resolve(room); }, 900); });
      share();
    });
  }
  function join(game, id, opts) {
    return new Promise(async (resolve) => {
      let room = null;
      const cancel = () => { if (room) room.close(); hide(); opts.onCancel && opts.onCancel(); };
      set("⚔️", "Тебя позвали в игру", "", dots("Подключаемся"), [["Отмена", "ghost", cancel]]);
      try { room = await Net.open(game, id, { name: T.playerName() }); }
      catch (e) { return fail(opts); }
      let ok = false;
      room.on("peer", (p) => { ok = true; set("✅", `${p.name} ждёт тебя!`, "", "Начинаем…", []); setTimeout(() => { hide(); resolve(room); }, 700); });
      setTimeout(() => {
        if (ok) return;
        room.close();
        const b = [["В меню", "ghost", () => { hide(); opts.onCancel && opts.onCancel(); }]];
        if (opts.onBot) b.unshift(["🤖 Сыграть с ботом", "", () => { hide(); opts.onBot(); }]);
        set("😕", "Комната не найдена", "", "Друг уже вышел или закрыл игру. Попроси прислать новое приглашение.", b);
      }, 12000);
    });
  }
  function fail(opts) {
    const b = [["Попробовать снова", "primary", () => location.reload()], ["В меню", "ghost", () => { hide(); opts.onCancel && opts.onCancel(); }]];
    if (opts.onBot) b.splice(1, 0, ["🤖 С ботом", "", () => { hide(); opts.onBot(); }]);
    set("📵", "Нет связи с сервером", "", "Проверь интернет и попробуй ещё раз.", b);
  }
  window.Lobby = { host, join, hide };
})();
