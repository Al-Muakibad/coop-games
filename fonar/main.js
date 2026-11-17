// «Красный фонарь» v2 — оболочка: одиночная игра / хозяин / гость, ввод, интерфейс, звук.
import { renderer } from "./c3d.js";
import { GIRL, TYPES, ART_BY } from "./data.js";
import * as S from "./sim.js";
import { createView, PCOL } from "./view.js";

const $ = (s) => document.querySelector(s);
const tg = window.Telegram && window.Telegram.WebApp;
try { tg && tg.ready(); tg && tg.expand(); tg && tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (_) {}
const myName = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && (tg.initDataUnsafe.user.first_name || tg.initDataUnsafe.user.username)) || "Игрок";
const BOT = "barled_game_bot";
if (new URLSearchParams(location.search).get("broker")) window.NET_BROKERS = [new URLSearchParams(location.search).get("broker")]; // для автотестов

/* ---------- звук: записанные CC0-сэмплы из ../promysel/audio ---------- */
const SND = { buy: "upgrade", cash: "coins", pick: "click", ok: "confirm", bad: "error", alarm: "bell", promo: "levelup", open: "open" };
let ac = null; const buf = {};
function unlockAudio() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; }
  for (const f of new Set(Object.values(SND))) fetch(`../promysel/audio/${f}.mp3`).then((r) => r.arrayBuffer()).then((a) => ac.decodeAudioData(a)).then((b) => (buf[f] = b)).catch(() => {});
}
const lastPlay = {};
function sfx(n) { const f = SND[n]; if (!ac || !buf[f]) return; const now = performance.now(); if (now - (lastPlay[n] || 0) < 70) return; lastPlay[n] = now; const s = ac.createBufferSource(); s.buffer = buf[f]; const g = ac.createGain(); g.gain.value = 0.6; s.connect(g).connect(ac.destination); s.start(); }
["pointerdown", "touchstart"].forEach((e) => addEventListener(e, unlockAudio, { capture: true, passive: true }));
function haptic(k) { try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(k || "light"); } catch (_) {} }

/* ---------- интерфейс ---------- */
let toastT = 0;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2800); }
function tip(m) { const t = $("#tip"); if (t.textContent !== m) t.textContent = m; t.style.display = m ? "block" : "none"; }
let modalKey = "";
function modal(html, mount, key) { if (key && key === modalKey) return; modalKey = key || ""; $("#mbox").innerHTML = html; $("#modal").classList.add("on"); $("#mbox").querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeModal)); if (mount) mount($("#mbox")); }
function closeModal() { $("#modal").classList.remove("on"); modalKey = ""; }

/* ---------- режим игры ---------- */
let mode = null, room = null, me = "solo", G = null, V = null, view = null;
const inputs = {};
const L = { x: 0, z: 4.2, yaw: Math.PI, init: false };
const SAVE = "fonar2";

function saveGame() {
  if (mode === "guest" || !G) return;
  try { const o = { ...G, R: undefined, P: undefined, ev: [], mine: G.P[me] ? { tips: G.P[me].tips, lv: G.P[me].lv } : null }; localStorage.setItem(SAVE, JSON.stringify(o)); } catch (_) {}
}
function loadGame() {
  try { const o = JSON.parse(localStorage.getItem(SAVE) || "null"); if (!o || !o.S) return null; o.R = S.newGame(o.seed + o.night * 7).R; o.P = {}; o.ev = []; return o; } catch (_) { return null; }
}
function startWorld(fresh) {
  G = fresh ? S.newGame() : loadGame() || S.newGame();
  const mine = G.mine; delete G.mine;
  const p = S.addPlayer(G, me, myName); if (mine) { p.tips = mine.tips; p.lv = mine.lv; }
  if (G.ph === "night" || G.ph === "morning") { G.ph = "prep"; G.offer = null; G.report = null; for (const c of G.C) c.st = "gone"; }
  L.x = p.x; L.z = p.z; L.init = true;
}

$("#solo").onclick = () => { mode = "solo"; me = "solo"; const has = loadGame(); if (has && has.night > 1) { modal(`<h2>Продолжить?</h2><p>Сохранена банда: ночь ${has.night}, в кассе 💰 ${has.money}.</p><button class="gold" id="cont">Продолжить</button><button class="ghost" id="anew">Начать заново</button>`, (b) => { b.querySelector("#cont").onclick = () => { closeModal(); begin(false); }; b.querySelector("#anew").onclick = () => { closeModal(); begin(true); }; }); } else begin(true); };
$("#host").onclick = async () => { mode = "host"; showLobby("Создаю комнату…"); try { room = await Net.openParty("fonar", null, { name: myName, max: 4, late: true }); } catch (e) { showLobby("Нет связи с сервером встреч. Проверь интернет и попробуй снова."); return; } me = room.me.id; hookHost(); showLobby(); };
$("#join").onclick = () => { const c = $("#codeIn").value.trim().toLowerCase(); if (/^[a-z0-9]{6}$/.test(c)) joinRoom(c); else toast("Код — 6 букв и цифр"); };
async function joinRoom(id) {
  mode = "guest"; showLobby("Подключаюсь к банде…");
  try { room = await Net.openParty("fonar", id, { name: myName, max: 4 }); } catch (e) { showLobby("Не получилось подключиться. Проверь интернет."); return; }
  me = room.me.id; hookGuest();
  setTimeout(() => { if (!V) showLobby("Жду ответа хозяина… Если долго — пусть он откроет игру и проверит код."); }, 6000);
}
function begin(fresh) {
  $("#start").style.display = "none"; $("#lobby").style.display = "none";
  if (mode !== "guest") { startWorld(fresh); if (room) for (const p of room.players) if (!G.P[p.id]) S.addPlayer(G, p.id, p.name); }
  if (!view) view = createView(), hookView();
  view.resize();
  if (!localStorage.getItem("fonar2_how")) { localStorage.setItem("fonar2_how", "1"); setTimeout(howTo, 300); }
}
function showLobby(msg) {
  $("#start").style.display = "none"; const lb = $("#lobby"); lb.style.display = "flex";
  if (msg) { lb.innerHTML = `<h2>Банда</h2><p class="muted">${msg}</p><button class="ghost" onclick="location.reload()">Назад</button>`; return; }
  const pl = room ? room.players : [];
  lb.innerHTML = `<h2>Банда собирается</h2><div class="muted">Код комнаты</div><div class="roomcode">${room.id}</div>
    <div class="pl">${pl.map((p, i) => `<div style="background:${PCOL[i % 4]}">${p.name}${p.host ? " 👑" : ""}</div>`).join("")}</div>
    <p class="muted">Друзья жмут ссылку-приглашение или вводят код на стартовом экране. Можно зайти и посреди игры. Баланс подстраивается под число игроков (1–4).</p>
    <button class="gold" id="inv">📨 Позвать друзей</button>${mode === "host" ? `<button class="gold" id="go">Начать (${pl.length}/4)</button>` : `<p>Ждём, когда хозяин начнёт…</p>`}`;
  $("#inv").onclick = invite;
  const go = $("#go"); if (go) go.onclick = () => { begin(false); };
}
function inviteLink() { return `https://t.me/${BOT}?startapp=r${room.id}`; }
function invite() {
  const text = `Залетай в банду «Красный фонарь»! Код комнаты: ${room.id}`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink())}&text=${encodeURIComponent(text)}`;
  try { if (tg && tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank"); } catch (_) { window.open(url, "_blank"); }
}

/* ---------- сеть ---------- */
let sentVer = -1, fullAt = 0, needFull = false;
function hookHost() {
  room.on("roster", (pl) => {
    if (!G) { showLobby(); return; }
    for (const p of pl) if (!G.P[p.id]) S.addPlayer(G, p.id, p.name);
    for (const id of Object.keys(G.P)) if (!pl.some((p) => p.id === id)) S.removePlayer(G, id);
    needFull = true;
  });
  room.on("left", (id) => { if (G) S.removePlayer(G, id); });
  room.on("in", (d, from) => { inputs[from] = d; });
  room.on("op", (d, from) => { if (G) S.applyOp(G, from, d); });
  room.on("need", () => (needFull = true));
}
function hookGuest() {
  room.on("s", (d) => {
    const first = !V; V = S.unpack(d, V);
    if (V.needMeta && Date.now() - fullAt > 800) { fullAt = Date.now(); room.send("need", 1); }
    if (first) { const p = V.P[me]; if (p) { L.x = p.x; L.z = p.z; } L.init = true; begin(false); }
  });
  room.on("roster", () => { if (!V) showLobby(); });
  room.on("host-left", () => modal(`<h2>Хозяин вышел</h2><p>Банда распалась — без хозяина мир не считается. Можно собрать свою.</p><button class="gold" onclick="location.reload()">В меню</button>`, null, "hostleft"));
  room.on("full", () => showLobby("Комната полная (4 из 4) или закрыта."));
}
function op(o) { if (mode === "guest") room.send("op", o); else S.applyOp(G, me, o); }

/* ---------- ввод: плавающий джойстик ---------- */
const input = { x: 0, z: 0 };
let joyId = null, jx = 0, jy = 0;
const canvas = $("#view");
canvas.addEventListener("pointerdown", (e) => { if (joyId !== null) return; joyId = e.pointerId; jx = e.clientX; jy = e.clientY; const j = $("#joy"); j.style.left = jx + "px"; j.style.top = jy + "px"; j.style.display = "block"; j.firstElementChild.style.transform = ""; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => { if (e.pointerId !== joyId) return; let dx = e.clientX - jx, dy = e.clientY - jy; const d = Math.hypot(dx, dy), R = 50; if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; } $("#joy").firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; const k = Math.min(1, d / R), n = d > 4 ? 1 / d : 0; input.x = (e.clientX - jx) * n * k; input.z = (e.clientY - jy) * n * k; });
function endJoy(e) { if (e.pointerId !== joyId) return; joyId = null; input.x = input.z = 0; $("#joy").style.display = "none"; }
canvas.addEventListener("pointerup", endJoy); canvas.addEventListener("pointercancel", endJoy);
const keys = {}; addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = 1)); addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = 0));

/* ---------- кнопки ---------- */
$("#act").onclick = () => { const p = V && V.P[me]; if (!p) return; op(p.holding ? ["place", null] : ["grab"]); haptic("medium"); };
$("#ready").onclick = () => { op(["ready"]); haptic("light"); };
$("#menuBtn").onclick = () => modal(`<h2>Меню</h2>${room ? `<p class="muted">Комната <b>${room.id}</b> · игроков: ${Object.keys(V.P).length}</p><button class="gold" id="inv2">📨 Позвать друзей</button>` : `<button class="gold" id="toHost">👥 Позвать друзей (сделать комнату)</button>`}
  <button class="ghost" id="how">❓ Как играть</button>${mode !== "guest" ? `<button class="ghost" id="cash">+500 💰 (тест)</button><button class="ghost" id="skip">⏭ Закончить ночь (тест)</button><button class="ghost" id="reset" style="color:#ff8a7a">🗑 Начать заново</button>` : ""}<button class="ghost" data-close>Закрыть</button>`, (b) => {
  const i = b.querySelector("#inv2"); if (i) i.onclick = invite;
  const th = b.querySelector("#toHost"); if (th) th.onclick = async () => { closeModal(); toast("Создаю комнату…"); try { room = await Net.openParty("fonar", null, { name: myName, max: 4, late: true }); const old = me; me = room.me.id; const p = G.P[old]; delete G.P[old]; p.id = me; G.P[me] = p; mode = "host"; hookHost(); invite(); toast("Комната " + room.id + " — друзья могут заходить"); } catch (_) { toast("Нет связи"); } };
  b.querySelector("#how").onclick = howTo;
  const c = b.querySelector("#cash"); if (c) c.onclick = () => { G.money += 500; closeModal(); };
  const sk = b.querySelector("#skip"); if (sk) sk.onclick = () => { if (G.ph === "night") G.pt = 0.01; closeModal(); };
  const r = b.querySelector("#reset"); if (r) r.onclick = () => { localStorage.removeItem(SAVE); location.reload(); };
});
function howTo() {
  modal(`<h2>Как играть</h2><div class="mech">
  <b>Смена = подготовка → ночь → утро.</b><br>
  • <b>Подготовка:</b> расставь мебель как удобно (подойди — «✋ Взять», отнеси — «Поставить»). В <b>Конторе 📒</b> покупки банды, в <b>Гардеробе 👔</b> — твои личные улучшения за чаевые. Все жмут «Готов» — начинается ночь.<br>
  • <b>Ночь (2,5 мин):</b> постой у очереди — клиенты пойдут за тобой. Веди к свободному номеру: ⚓ любят 🔥, 🎓 — 🌸, 🎩 — 💎 (совпадение ×1,5). После клиента номер грязный — неси бельё из стиральной машины. Выручку забирай у номера. VIP 👑 идут только в номер с 🍾 из бара.<br>
  • <b>Облава 🚨</b> (с 3-й ночи): 20 секунд — убери грязные номера и выручку, иначе штраф.<br>
  • <b>Утро:</b> отчёт и голосование за 1 из 3 карт: новая девушка, автоматика, правила ночи.<br>
  • <b>Автоматика — это мебель:</b> шкаф с бельём сам застилает, пневмопочта сама собирает выручку, лифт разносит шампанское, дорожка сама ведёт клиентов. Работает только в своём круге — расставь с умом.<br>
  • Не набрали цель ночи — минус ❤️. Три ❤️ потеряны — хозяйка выгоняет банду. 6 ночей — повышение.</div>
  <p class="muted">Касса общая. Чаевые (10% с каждого клиента, которого ты привёл) — личные, на Гардероб.</p><button class="gold" data-close>Понятно</button>`);
}

/* ---------- панели Контора и Гардероб ---------- */
let sheetOpen = "", sheetKey = "";
function drawSheet(which, P) {
  const el = $("#" + which); let h = "";
  if (which === "office") {
    h = `<div class="sh-h"><b>Контора 📒</b><span>касса банды: 💰 ${V.money}. Купленное появится в ящике у входа — поставьте куда нужно.</span></div>`;
    for (const it of S.CATALOG) {
      const ok = V.money >= it.cost && (!it.need || V.S.some((s) => s.k === it.need || s.as === it.need));
      const auto = S.ST[it.id] && S.ST[it.id].auto;
      h += `<button class="oc ${ok ? "ok" : ""}" data-b="${it.id}" ${ok ? "" : "disabled"}><div class="ic">${{ room: "🛏", laundry: "🫧", bar: "🍾", shelf: "🧺", post: "📮", lift: "🛗", carpet: "🟥" }[it.id]}</div><div class="tx"><b>${it.n}</b><span>${auto || (it.id === "room" ? "ещё одна девушка и её номер" : it.id === "laundry" ? "больше чистого белья" : "бар делает шампанское для VIP")}</span></div><div class="pr">💰 ${it.cost}</div></button>`;
      if (it.id === "room" && ok) h += `<div class="types" style="margin:-2px 0 8px">${["fire", "sweet", "chic"].map((t) => `<button data-room="${t}">${TYPES[t].ic} ${TYPES[t].n}</button>`).join("")}</div>`;
    }
  } else {
    h = `<div class="sh-h"><b>Гардероб 👔</b><span>твои чаевые: 💸 ${P.tips}. Улучшения только для тебя.</span></div>`;
    for (const w of S.WARD) { const l = P.lv[w.id], max = l >= w.max, c = max ? 0 : w.cost[l], ok = !max && P.tips >= c; h += `<button class="oc ${ok ? "ok" : ""}" data-w="${w.id}" ${ok ? "" : "disabled"}><div class="ic">${{ spd: "👞", lead: "🎩", hands: "👜" }[w.id]}</div><div class="tx"><b>${w.n} · ур. ${l}/${w.max}</b><span>${w.d}: ${w.v(l)}${max ? "" : ` → <em>${w.v(l + 1)}</em>`}</span></div><div class="pr">${max ? "MAX" : "💸 " + c}</div></button>`; }
  }
  if (h === sheetKey) return; sheetKey = h; el.innerHTML = h;
  el.querySelectorAll("[data-b]").forEach((b) => (b.onclick = () => { if (b.dataset.b === "room") { toast("Выбери тип девушки ниже"); return; } op(["buy", b.dataset.b]); sfx("buy"); }));
  el.querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => { op(["buy", "room", b.dataset.room]); sfx("buy"); }));
  el.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { op(["ward", b.dataset.w]); sfx("buy"); }));
}

/* ---------- события мира → звук и тосты ---------- */
function hookView() {
  view.on("*", (e) => {
    if (e.to && e.to !== me) return;
    if (e.k === "sfx") sfx(e.s);
    if (e.k === "toast") toast(e.m);
    if (e.k === "pay" || e.k === "cash") sfx("cash");
    if (e.k === "raid") { haptic("heavy"); }
    if (e.k === "raidEnd") { toast(e.n ? `👮 Облава нашла улики: ${e.dirty} грязных номеров, ${e.cash} кучек денег. Штраф −${e.fine}` : "👮 Облава ушла ни с чем. Чисто!"); sfx(e.n ? "bad" : "ok"); }
    if (e.k === "lost") haptic("light");
  });
}

/* ---------- 18+ заглушка ---------- */
let peekRoom = null;
$("#peek").onclick = () => { if (!peekRoom) return; const g = GIRL[peekRoom.girl]; const id = `SC18-T1-${(peekRoom.girl || "").toUpperCase()}-1`; const a = ART_BY[id]; modal(`<div class="scene18"><div style="font-size:34px">🔞</div><code>${a ? id : "SC18-GIRL-" + (peekRoom.girl || "").toUpperCase()}</code><b>Заглушка сцены 18+</b><small>${a ? a.idea : "Сцена в номере: " + (g ? g.n : "девушка") + " и клиент. Описание — в таблице арта."}</small></div><button class="gold" data-close>Задёрнуть шторку</button>`); };

/* ---------- кадр ---------- */
let last = performance.now(), netT = 0, saveT = 0, hudT = 0, phSeen = "";
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!view || document.hidden) return;
  // своё движение — считаем сами
  const W = mode === "guest" ? V : G;
  if (!W) return;
  const P = W.P[me];
  if (P && L.init) {
    let ix = input.x, iz = input.z; if (keys.a || keys.arrowleft) ix = -1; if (keys.d || keys.arrowright) ix = 1; if (keys.w || keys.arrowup) iz = -1; if (keys.s || keys.arrowdown) iz = 1;
    const sp = S.speedOf(P) * (P.holding ? 0.8 : 1), m = W.ph === "morning" ? 0 : 1;
    L.x += ix * sp * dt * m; L.z += iz * sp * dt * m; if (Math.hypot(ix, iz) > 0.2) L.yaw = Math.atan2(ix, iz);
    S.collide(W, L);
  }
  if (mode === "guest") {
    netT += dt; if (netT > 0.066 && room) { netT = 0; room.send("in", { x: Math.round(L.x * 100) / 100, z: Math.round(L.z * 100) / 100, yaw: Math.round(L.yaw * 100) / 100 }, true); }
    if (V.P[me]) { V.P[me].x = L.x; V.P[me].z = L.z; V.P[me].yaw = L.yaw; }
  } else {
    inputs[me] = { x: L.x, z: L.z, yaw: L.yaw };
    S.step(G, dt, inputs);
    if (G.strikes >= 3 && G.report && G.report.over && G.ph === "morning" && !G.overShown) { G.overShown = 1; }
    V = S.unpack(S.snapshot(G, true), V);
    if (room) { netT += dt; if (netT > 0.1) { netT = 0; const full = needFull || G.stVer !== sentVer || now - fullAt > 2500; if (full) { sentVer = G.stVer; fullAt = now; needFull = false; } room.send("s", S.snapshot(G, full), true); } }
    saveT += dt; if (saveT > 5) { saveT = 0; saveGame(); }
  }
  view.draw(V, me, dt);
  hudT += dt; if (hudT > 0.12) { hudT = 0; hud(); }
}

function hud() {
  const P = V.P[me]; if (!P) return;
  $("#money").textContent = "💰 " + V.money.toLocaleString("ru-RU");
  $("#tips").textContent = "💸 " + P.tips + " чаевые";
  $("#lives").textContent = "❤️".repeat(Math.max(0, 3 - V.strikes)) + "🖤".repeat(Math.min(3, V.strikes));
  const loc = S.LOCS[V.loc] ? S.LOCS[V.loc].n : "";
  const nIn = ((V.night - 1) % S.NIGHTS_PER_LOC) + 1;
  if (V.ph === "night") { $("#phTxt").innerHTML = `Ночь ${nIn}/${S.NIGHTS_PER_LOC} · <b>${Math.ceil(V.pt)} с</b> · заработано <b>${V.earned}</b> / ${V.target}`; $("#phBar").style.width = Math.min(100, (V.earned / Math.max(1, V.target)) * 100) + "%"; }
  else { $("#phTxt").innerHTML = `${V.ph === "prep" ? "Подготовка" : "Утро"} · ночь ${nIn}/${S.NIGHTS_PER_LOC} · <b>${loc}</b>`; $("#phBar").style.width = ((nIn - 1) / S.NIGHTS_PER_LOC) * 100 + "%"; }
  $("#roster").innerHTML = Object.values(V.P).map((p) => `<div class="pc" style="background:${PCOL[p.c]}">${p.name}${V.ph === "prep" ? (p.ready ? " ✓" : " …") : ""}</div>`).join("");
  // кнопки
  const near = !P.holding && S.grabbable(V, P);
  $("#act").style.display = P.holding || near ? "block" : "none";
  if (P.holding) { const s = V.S.find((x) => x.id === P.holding); $("#act").textContent = "⬇ Поставить " + (s ? (s.k === "crate" ? S.ST[s.as].n : S.ST[s.k].n).toLowerCase() : ""); }
  else if (near) $("#act").textContent = "✋ Взять: " + (near.k === "crate" ? "ящик" : S.ST[near.k].n.toLowerCase());
  const rb = $("#ready"); rb.style.display = V.ph === "prep" ? "block" : "none";
  const np = Object.keys(V.P).length, nr = Object.values(V.P).filter((p) => p.ready).length;
  rb.textContent = P.ready ? `✓ Готов (${nr}/${np})` : `🌙 Готов к ночи (${nr}/${np})`; rb.classList.toggle("on", P.ready);
  // облава
  const rd = $("#raid"); if (V.raid) { rd.style.display = "block"; const dirty = V.S.filter((s) => s.k === "room" && s.st === "dirty").length, cash = V.S.filter((s) => s.k === "room" && s.cash > 0).length; rd.innerHTML = `🚨 ОБЛАВА через ${Math.ceil(V.raid.t)} с! Улики: 🧺 ${dirty} грязных · 💰 ${cash} кучек денег`; } else rd.style.display = "none";
  // заглянуть
  peekRoom = V.S.find((s) => s.k === "room" && s.st === "room" && Math.hypot(P.x - s.x, P.z - S.front(s).z - 0) < 1.6 && Math.abs(P.x - s.x) < 1.3) || null;
  $("#peek").style.display = peekRoom ? "block" : "none";
  // площадки
  const inOff = Math.hypot(P.x - S.PADS.office.x, P.z - S.PADS.office.z) < 0.95, inWard = Math.hypot(P.x - S.PADS.ward.x, P.z - S.PADS.ward.z) < 0.95;
  const want = inOff ? "office" : inWard ? "ward" : "";
  if (want !== sheetOpen) { if (sheetOpen) $("#" + sheetOpen).classList.remove("on"); sheetOpen = want; sheetKey = ""; if (want) { $("#" + want).classList.add("on"); sfx("open"); } }
  if (sheetOpen) drawSheet(sheetOpen, P);
  // подсказка
  let t = "";
  if (V.ph === "prep" && V.night === 1 && !P.ready) t = "Осмотрись. Когда готов — жми «Готов к ночи» внизу";
  if (V.ph === "night") {
    const dirty = V.S.find((s) => s.k === "room" && s.st === "dirty");
    if (P.carryN && !P.hands.length) t = "Отведи гостей к свободному номеру";
    else if (dirty && !P.hands.includes("l") && V.night <= 2) t = "Номер грязный 🧺 — возьми бельё у стиральной машины";
    else if (!P.carryN && V.C.some((c) => c.st === "wait") && V.night === 1) t = "Постой у очереди у входа — гости пойдут за тобой";
  }
  if (P.holding) t = "Встань туда, куда хочешь поставить, и жми «Поставить». Круг — зона действия";
  tip(t);
  // смена фаз
  if (V.ph !== phSeen) {
    const prev = phSeen; phSeen = V.ph;
    if (V.ph === "night") { closeModal(); toast(`🌙 Ночь ${nIn}! Цель — 💰 ${V.target}`); sfx("promo"); }
    if (V.ph === "prep" && prev === "morning") closeModal();
  }
  if (V.ph === "morning" && V.report) morning();
}
function morning() {
  const r = V.report;
  if (r.over) { modal(`<h2>Хозяйка выгнала банду 🖤</h2><p>Три ночи подряд мимо цели. Начнём заново — с тем, что узнали.</p>${mode !== "guest" ? `<button class="gold" id="again">Заново</button>` : `<p class="muted">Ждём хозяина…</p>`}`, (b) => { const a = b.querySelector("#again"); if (a) a.onclick = () => { G = S.restart(G); closeModal(); }; }, "over"); return; }
  const myVote = V.votes[me];
  const cards = (V.offer || []).map((id, i) => { const c = S.CARDS.find((x) => x.id === id); const voters = Object.entries(V.votes).filter(([, v]) => v === i).map(([pid]) => V.P[pid]).filter(Boolean); return `<button class="card ${myVote === i ? "mine" : ""}" data-v="${i}"><div class="ic">${c.ic}</div><div class="tx"><b>${c.n}</b><small>${c.d}</small></div><div class="vt">${voters.map((p) => `<i style="background:${PCOL[p.c]}"></i>`).join("")}</div></button>`; }).join("");
  const nVoted = Object.keys(V.votes).length, np = Object.keys(V.P).length;
  const tips = Object.entries(r.tips || {}).map(([n, v]) => `${n} +${v}`).join(", ");
  const html = `<h2>${r.ok ? "Ночь удалась ✅" : "Цель не взята 💔"}</h2>
    <table class="rep"><tr><td>Заработано</td><td>${r.earned} / ${r.target}</td></tr><tr><td>Обслужено гостей</td><td>${r.served}</td></tr><tr><td>Ушли, не дождавшись</td><td>${r.lost}</td></tr>${tips ? `<tr><td>Чаевые</td><td>${tips}</td></tr>` : ""}</table>
    ${r.promo ? `<div class="mech">🎩 <b>Повышение!</b> Банда заработала имя. Следующая локация: ${r.promo} (в разработке — пока продолжаем здесь, ночи сложнее).</div>` : ""}
    <p><b>Выберите карту</b> — голосуют все, побеждает большинство (${nVoted}/${np} проголосовали):</p><div class="cards">${cards}</div>`;
  modal(html, (b) => b.querySelectorAll("[data-v]").forEach((x) => (x.onclick = () => { op(["vote", +x.dataset.v]); haptic("light"); })), "m" + r.night + JSON.stringify(V.votes));
}

addEventListener("resize", () => view && view.resize());
requestAnimationFrame(frame);

// вход по приглашению: ?startapp / start_param = r<код>, или ?room=<код>
const sp = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || new URLSearchParams(location.search).get("tgWebAppStartParam") || "";
const qroom = new URLSearchParams(location.search).get("room");
const inv = (/^r([a-z0-9]{6})$/.exec(sp) || [])[1] || qroom;
if (inv) joinRoom(inv);
// для автотестов
const qs = new URLSearchParams(location.search);
if (qs.get("go")) { mode = "solo"; begin(true); }
window.__fonar = { get view() { return view; }, get G() { return G; }, get V() { return V; }, get me() { return me; }, L, input, S, op, get room() { return room; } };
