// «Промысел» — склейка: загрузка, камера, джойстик, режимы (один / вместе / друг против друга; хозяин / гость / бот),
// HUD, события → эффекты и звук, сохранения, кнопка «Назад».
import * as THREE from "three";
import * as S from "./sim.js";
import { ITEMS, IT, UPG, BAYS, DIFF, VS_GOALS, PERKS, META, EVENTS, anchorsFor, recText, YAW } from "./data.js";
import { World, THEMES } from "./world.js";
import { View, fmt, CASH, PCOL } from "./view.js";
import { buildIcons, URL as ICONURL } from "./icons.js";
import { makeBot } from "./bot.js";
import { play, music, ambience, SET, saveSet } from "./audio.js";
import * as SV from "./save.js";
import { HostSync, GuestSync } from "./coop.js";

const T = window.TG || { haptic() {}, init() {}, playerName: () => "Друг", tg: null, openLink() {}, inviteFriend() {} };
const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
const $ = (id) => document.getElementById(id);
const L = (s) => (window.I18N ? I18N.t(s) : s);
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const QS = new URLSearchParams(location.search);
const GAME = "promysel";
const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
let hapT = 0;
const haptic = (a, b, force) => { const n = performance.now(); if (!force && n - hapT < 60) return; hapT = n; try { const tg = T.tg; if (tg && tg.HapticFeedback) { if (a === "impact") tg.HapticFeedback.impactOccurred(b); else if (a === "select") tg.HapticFeedback.selectionChanged(); else tg.HapticFeedback.notificationOccurred(b); } } catch (_) {} };
const myName = () => { const n = T.playerName ? T.playerName() : "Друг"; return n && n !== "Друг" ? n : L("Ты"); };

/* ---------- состояние ---------- */
let G = null, role = "menu", me = 0, room = null, hs = null, gs = null, bot = null, demo = null, demoBots = [];
let partner = { name: "", online: false, bot: false };
let world = null, view = null, worldKey = "";
let started = false, simAcc = 0, saveT = 0, hudT = 0, clock = 0, idleT = 0, lastEnd = 0;
const gloc = { x: 0, z: 0, dir: Math.PI, mv: 0 };    // своя позиция у гостя (ведём сами)
const gtm = {};                                        // таймеры действий гостя
let prof = SV.profile();

/* ---------- рендер ---------- */
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let quality = QS.get("q") != null ? Math.max(0, Math.min(2, +QS.get("q"))) : mobile ? 1 : 2, qLock = QS.get("q") != null;
try { const q = localStorage.getItem("pm_q"); if (q != null && QS.get("q") == null) { quality = +q; qLock = true; } } catch (_) {}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 140);
let W = 1, H = 1, DPR = 1;
const cam = { x: -6, z: -2, dist: 30, pitch: 0.9, shake: 0 };
function resize() {
  W = innerWidth; H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, [1, 1.5, 2][quality]);
  renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
// расстояние камеры: в портрете по ширине видно ~12 м, в альбоме по высоте ~14 м
function camDist() {
  const vf = camera.fov * Math.PI / 180, a = camera.aspect;
  const byW = 4.9 / (Math.tan(vf / 2) * a), byH = 6.4 / Math.tan(vf / 2);
  return Math.max(16, Math.min(40, a < 1 ? byW : byH));
}
function placeCamera(dt) {
  const d = cam.dist;
  const sx = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0; cam.shake = Math.max(0, cam.shake - dt * 2);
  const h = Math.cos(cam.pitch) * d;
  camera.position.set(cam.x + sx + Math.sin(YAW) * h, Math.sin(cam.pitch) * d, cam.z + Math.cos(YAW) * h);
  camera.lookAt(cam.x + sx, 0, cam.z);
  if (world) world.follow(cam.x, cam.z);
}
const pv = new THREE.Vector3();
function project(x, y, z) { pv.set(x, y, z).project(camera); return { x: (pv.x + 1) / 2 * W, y: (1 - pv.y) / 2 * H, z: pv.z }; }
function applyQuality() {
  resize();
  renderer.shadowMap.enabled = quality > 0;
  if (world) { world.sun.castShadow = quality > 0; const s = quality > 1 ? 2048 : 1024; if (world.sun.shadow.map && world.sun.shadow.mapSize.x !== s) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; } world.sun.shadow.mapSize.set(s, s); }
  try { if (qLock) localStorage.setItem("pm_q", String(quality)); } catch (_) {}
}
// мир строится под раскладку (своя у каждой бухты; «против» — одна) и тему бухты
const themeOf = (g) => (g.mode === "vs" ? 0 : BAYS[(g.bay || 0) % BAYS.length].theme);
function ensureWorld(g) {
  const Lw = S.layoutOf(g), theme = themeOf(g), key = Lw.key + ":" + theme;
  if (worldKey === key && world) return;
  if (view) view.dispose(); if (world) world.dispose();
  world = new World(scene, renderer, { quality, mode: g.mode, theme, L: Lw });
  view = new View(scene, world, { mode: g.mode, quality, L: Lw });
  worldKey = key;
}

/* ---------- загрузка ---------- */
const loadbar = $("loadbar"), loadtx = $("loadtx");
async function boot() {
  T.init && T.init({ header: "#0f2133", bg: "#0f2133" });
  resize();
  loadbar.style.width = "30%"; loadtx.textContent = L("Строим бухту…");
  await new Promise((r) => setTimeout(r, 30));
  buildIcons(renderer);
  $("money-ic").src = ICONURL.cash;
  loadbar.style.width = "70%";
  makeDemo();
  ensureWorld(demo);
  for (let i = 0; i < 60 * 25; i++) stepDemo(1 / 30);
  world.sync(demo, false);
  loadbar.style.width = "100%";
  setTimeout(() => { $("load").style.opacity = "0"; $("load").style.transition = "opacity .4s"; $("load").style.pointerEvents = "none"; setTimeout(() => $("load").remove(), 450); }, 200);
  setupBack(); setupInput();
  SV.syncProfile(() => { prof = SV.profile(); if (role === "menu") showMenu(); });
  requestAnimationFrame(loop);
  const inv = window.Net && Net.readInvite ? Net.readInvite() : null;
  if (inv) joinGame(inv); else showMenu();
}
// заставка меню: бухта, где уже кипит работа (два бота-рыбака)
function makeDemo() {
  demo = S.newGame({ mode: "coop", seed: 4242 });
  const Ld = S.layoutOf(demo);
  for (const id of ["stall_fillet", "table1", "fisher0", "runner1", "fisher1", "stall_salt", "salt", "feed_salt", "runner_salt", "stall_smoked", "smoke", "wood", "woodman", "feed_smoke", "runner3", "cashier", "table2", "fisher2", "runner2"]) S.forceOpen(demo, Ld.byId[0][id]);
  for (let i = 0; i < 5; i++) S.forceOpen(demo, Ld.byId[0].bag); demo.upg[0].crew = 5; demo.upg[0].crewspd = 5;
  demo.ev = [];
  demoBots = [makeBot(0, { seed: 3 }), makeBot(1, { seed: 9 })];
}
function stepDemo(dt) { for (let i = 0; i < 2; i++) { const j = demoBots[i].tick(demo, dt); S.movePlayer(demo, i, j.x, j.z, dt); } S.step(demo, dt); demo.money[0] = 0; demo.ev.length = 0; }

/* ---------- меню ---------- */
const SLOT_UI = {
  coop: (p) => [`👥 ${L("Общая бухта")}${p.meta.partner ? " " + L("с") + " " + esc(p.meta.partner) : ""}`, BAYS[p.sum.bay || 0].n],
  guest: (p) => [`🏝 ${L("Бухта друга")}${p.meta.partner ? " " + esc(p.meta.partner) : ""}`, L("Ты был гостем")],
  solo: (p) => [`🙋 ${L("Своя бухта")}`, BAYS[p.sum.bay || 0].n],
  vs: (p) => [`⚔️ ${L("Матч против")} ${p.meta.partner ? esc(p.meta.partner) : "🤖"}`, L("не доигран")],
};
function showMenu() {
  role = "menu"; started = false; G = null; bot = null; hs = null; gs = null; partner = { name: "", online: false, bot: false };
  closeConfirm(false); netNote("");
  hideAll(); $("top").classList.add("hidden"); $("hint").classList.add("hidden"); tipShow(null);
  $("menu").classList.remove("hidden"); $("title").classList.remove("hidden");
  ensureWorld(demo); world.sync(demo, false);
  const sv = {}; for (const k of SV.SLOTS) sv[k] = SV.peek(k);
  const order = SV.SLOTS.filter((k) => sv[k]).sort((a, b) => (sv[b].t || 0) - (sv[a].t || 0));
  const resBtn = (k, primary) => { const q = sv[k]; const [a, b] = SLOT_UI[k](q); const sum = q.sum || {}; return `<button class="b ${primary ? "primary" : ""}" data-slot="${k}"><span>▶</span><span class="t">${a}<small>${b}${sum.o ? " · " + L("открыто") + " " + sum.o : ""}${sum.earned ? " · " + fmt(sum.earned) : ""}</small></span></button>`; };
  const metaN = Object.values(prof.meta || {}).reduce((a, b) => a + b, 0);
  $("menup").innerHTML = `
    ${order.length ? resBtn(order[0], true) : ""}
    <button class="b ${order.length ? "" : "primary"}" id="m-coop"><span>👥</span><span class="t">${L("Вместе")}<small>${L("Одна бухта на двоих: общие деньги, заказы, маяк")}</small></span></button>
    <button class="b ice" id="m-vs"><span>⚔️</span><span class="t">${L("Друг против друга")}<small>${L("Две лавки, одна толпа: кто быстрее обслужит")}</small></span></button>
    <button class="b" id="m-solo"><span>🙋</span><span class="t">${L("Одному")}<small>${L("Своя бухта — долгая прокачка")}</small></span></button>
    ${order.slice(1).map((k) => resBtn(k)).join("")}
    <button class="b fleet" id="m-fleet"><span>⚓</span><span class="t">${L("Флот")}<small>${L("Якоря за бухты — постоянные улучшения")}: ⚓ ${prof.anchors || 0}${metaN ? " · " + L("куплено") + " " + metaN : ""}</small></span></button>
    <div class="b2"><button class="b ghost" id="m-help">❓ ${L("Как играть")}</button><button class="b ghost" id="m-set">⚙️ ${L("Настройки")}</button><button class="b ghost" id="m-games">🎮 ${L("Игры")}</button></div>
    ${prof.vsWin || prof.bays ? `<p style="margin:6px 0 0;font-size:12.5px">${prof.bays ? "⭐ " + L("Бухт пройдено") + ": " + prof.bays + " · " : ""}${prof.vsWin ? "🏆 " + L("Побед") + ": " + prof.vsWin : ""}</p>` : ""}`;
  $("menup").querySelectorAll("[data-slot]").forEach((b) => (b.onclick = () => resumeSlot(b.dataset.slot)));
  $("m-coop").onclick = () => coopMenu();
  $("m-vs").onclick = () => vsMenu();
  $("m-solo").onclick = () => guardSlot("solo", () => soloMenu());
  $("m-help").onclick = () => showHelp();
  $("m-fleet").onclick = () => fleetMenu(() => showMenu());
  $("m-set").onclick = () => settings(() => showMenu());
  $("m-games").onclick = () => { location.href = "../"; };
  music("m_shanty");
  const miss = SV.SLOTS.filter((k) => !sv[k]);
  if (miss.length && !showMenu.probed) { showMenu.probed = 1; Promise.all(miss.map((k) => SV.probe(k))).then((r) => { if (r.some(Boolean) && role === "menu" && $("dlg").classList.contains("hidden")) showMenu(); }); }
}
function guardSlot(slot, go) {
  const have = SV.peek(slot);
  if (!have) return go();
  const [a] = SLOT_UI[slot](have);
  dialog(`<h2>${L("Начать заново?")}</h2><p>${L("Уже есть сохранение")}: <b>${a}</b>. ${L("Новая игра его заменит.")}</p>
    <button class="b primary" id="g-res"><span>▶</span><span class="t">${L("Продолжить сохранённую")}</span></button><button class="b" id="g-new"><span>✨</span><span class="t">${L("Да, начать заново")}</span></button><button class="b ghost" id="g-x">${L("Назад")}</button>`);
  $("g-res").onclick = () => { hideDlg(); resumeSlot(slot); };
  $("g-new").onclick = () => { hideDlg(); go(); };
  $("g-x").onclick = () => hideDlg();
}
function soloMenu() { const g = S.newGame({ mode: "solo", seed: (Math.random() * 1e9) | 0, bay: 0, meta: prof.meta, diff: 1 }); start("local", g, 0); }
function coopMenu() {
  let diff = 1;
  const draw = () => dialog(`<h2>👥 ${L("Вместе")}</h2><p>${L("Общая бухта, общие деньги. Один ловит — другой продаёт. На доске — заказы на время. Цель — зажечь маяк.")}</p>
    <div class="seg">${DIFF.map((d, i) => `<button data-d="${i}" class="${i === diff ? "on" : ""}">${L(d.n)}<small>${i === 0 ? L("дешевле, терпеливее") : i === 1 ? L("как задумано") : L("дороже, сроки жёстче")}</small></button>`).join("")}</div>
    <button class="b primary" id="c-inv"><span>📨</span><span class="t">${L("Позвать друга")}<small>${L("Ссылка — друг играет со своего телефона")}</small></span></button>
    <button class="b" id="c-bot"><span>🤖</span><span class="t">${L("Вместе с ботом")}<small>${L("Бот ловит и носит, ты управляешь бухтой")}</small></span></button>
    <button class="b ghost" id="c-x">${L("Назад")}</button>`);
  draw();
  const wire = () => {
    $("dlgp").querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { diff = +b.dataset.d; play("select"); draw(); wire(); }));
    $("c-inv").onclick = () => guardSlot("coop", () => { hideDlg(); hostGame(S.newGame({ mode: "coop", seed: (Math.random() * 1e9) | 0, meta: prof.meta, diff })); });
    $("c-bot").onclick = () => guardSlot("coop", () => { hideDlg(); start("local", S.newGame({ mode: "coop", seed: (Math.random() * 1e9) | 0, meta: prof.meta, diff }), 0, { bot: 1 }); });
    $("c-x").onclick = () => hideDlg();
  };
  wire();
}
function vsMenu() {
  let goal = 0, skill = 1;
  const draw = () => dialog(`<h2>⚔️ ${L("Друг против друга")}</h2><p>${L("У каждого своя лавка и свои деньги. Толпа одна — покупатель идёт к тому, у кого товар есть и очередь короче. Заставишь ждать — уйдёт к сопернику.")}</p>
    <div class="seg">${VS_GOALS.map((g, i) => `<button data-g="${i}" class="${i === goal ? "on" : ""}">${L(g.n)}</button>`).join("")}</div>
    <button class="b primary" id="v-inv"><span>📨</span><span class="t">${L("Вызвать друга")}<small>${L("Ссылка — матч начнётся, когда друг зайдёт")}</small></span></button>
    <div class="seg">${["Лёгкий", "Обычный", "Сильный"].map((n, i) => `<button data-s="${i}" class="${i === skill ? "on" : ""}">🤖 ${L(n)}</button>`).join("")}</div>
    <button class="b" id="v-bot"><span>🤖</span><span class="t">${L("Против бота")}</span></button>
    <button class="b ghost" id="v-x">${L("Назад")}</button>`);
  const wire = () => {
    $("dlgp").querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => { goal = +b.dataset.g; play("select"); draw(); wire(); }));
    $("dlgp").querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { skill = +b.dataset.s; play("select"); draw(); wire(); }));
    const mk = () => S.newGame({ mode: "vs", seed: (Math.random() * 1e9) | 0, goal: VS_GOALS[goal].id });
    $("v-inv").onclick = () => guardSlot("vs", () => { hideDlg(); hostGame(mk()); });
    $("v-bot").onclick = () => guardSlot("vs", () => { hideDlg(); start("local", mk(), 0, { bot: 1, skill: ["easy", "good", "hard"][skill] }); });
    $("v-x").onclick = () => hideDlg();
  };
  draw(); wire();
}
async function resumeSlot(slot) {
  dialog(`<h2>${L("Загружаем…")}</h2><p class="lb-dots"></p>`, true);
  const s = await SV.load(slot); hideDlg();
  if (!s) { toast(L("Сохранение не найдено"), "bad"); if (SV.peek(slot)) SV.wipe(slot); showMenu(); return; }
  const m = s.meta || {};
  const away = (Date.now() - (s.t || Date.now())) / 1000;
  if (slot === "solo") return start("local", s.G, 0, { away });
  if (slot === "vs") { if (m.role === "host" && m.room) return rehost(s.G, m.room, m); return start("local", s.G, 0, { bot: 1, skill: m.skill || "good" }); }
  if (slot === "coop") {
    dialog(`<h2>👥 ${L("Общая бухта")}</h2><p>${BAYS[s.G.bay].n}${m.partner ? " · " + L("с") + " " + esc(m.partner) : ""}</p>
      ${m.room ? `<button class="b primary" id="r-same"><span>▶</span><span class="t">${L("Продолжить с другом")}<small>${L("Друг подключится сам, если ещё в игре, или по старой ссылке")}</small></span></button>` : ""}
      <button class="b ${m.room ? "" : "primary"}" id="r-new"><span>📨</span><span class="t">${L("Новая ссылка другу")}</span></button>
      <button class="b" id="r-bot"><span>🤖</span><span class="t">${L("Продолжить с ботом")}</span></button><button class="b ghost" id="r-x">${L("Назад")}</button>`);
    if (m.room) $("r-same").onclick = () => { hideDlg(); rehost(s.G, m.room, m, away); };
    $("r-new").onclick = () => { hideDlg(); hostGame(s.G, away); };
    $("r-bot").onclick = () => { hideDlg(); start("local", s.G, 0, { bot: 1, away }); };
    $("r-x").onclick = () => hideDlg();
    return;
  }
  if (slot === "guest") {
    const gi = m.me || 1;
    dialog(`<h2>🏝 ${L("Бухта друга")}</h2><p>${m.partner ? esc(m.partner) + " · " : ""}${BAYS[s.G.bay].n}</p>
      ${m.room ? `<button class="b primary" id="r-same"><span>▶</span><span class="t">${L("Вернуться к другу")}<small>${L("Подождём, пока хозяин откроет бухту")}</small></span></button>` : ""}
      <button class="b" id="r-bot"><span>🤖</span><span class="t">${L("Доиграть копию с ботом")}</span></button><button class="b ghost" id="r-x">${L("Назад")}</button>`);
    if (m.room) $("r-same").onclick = () => { hideDlg(); rejoin(m.room); };
    $("r-bot").onclick = () => { hideDlg(); start("local", s.G, gi, { bot: 1, slot: "guest" }); };
    $("r-x").onclick = () => hideDlg();
  }
}

/* ---------- онлайн: хозяин ---------- */
async function hostGame(g, away) {
  hideAll(); $("title").classList.add("hidden");
  const text = g.mode === "vs" ? L("Вызываю тебя в «Промысел» ⚔️ Кто быстрее накормит толпу?") : L("Го строить рыбацкую бухту вдвоём 🎣 Заходи!");
  const r = await Lobby.host(GAME, { text, onCancel: () => showMenu(), onBot: () => start("local", g, 0, { bot: 1 }) });
  room = r; r.off("peer"); r.off("peer-left");
  partner = { name: r.peer ? r.peer.name : L("Друг"), online: true, bot: false };
  hs = new HostSync(room, hostApi());
  St.event("pm_room", { role: "host", mode: g.mode });
  start("host", g, 0, { away });
  hs.go();
}
async function rehost(g, rid, m, away) {
  hideAll(); $("title").classList.add("hidden");
  dialog(`<h2>${L("Подключаемся…")}</h2><p class="lb-dots"></p>`, true);
  let r;
  try { r = await Net.open(GAME, rid, { name: myName(), host: true }); }
  catch (_) { hideDlg(); toast(L("Нет связи с сервером"), "bad"); start("local", g, 0, { bot: 1, away }); return; }
  hideDlg();
  room = r; partner = { name: (m && m.partner) || L("Друг"), online: !!r.peer, bot: false };
  hs = new HostSync(room, hostApi());
  start("host", g, 0, { away });
  if (room.peer) hs.go(); else { if (g.mode === "vs") G.paused = 1; waitFriend(); }
}
function waitFriend() {
  dialog(`<h2>${L("Ждём друга")}</h2><p>${G && G.mode === "vs" ? L("Матч на паузе, пока соперник не вернётся.") : L("Бухта работает — можно играть, друг подключится сам.")} ${L("Если он вышел из игры — отправь ссылку ещё раз.")}</p>
    <button class="b primary" id="w-inv"><span>📨</span><span class="t">${L("Отправить ссылку")}</span></button>
    <button class="b" id="w-bot"><span>🤖</span><span class="t">${G && G.mode === "vs" ? L("Доиграть с ботом") : L("Пусть пока поможет бот")}</span></button>
    ${G && G.mode !== "vs" ? `<button class="b" id="w-go"><span>▶</span><span class="t">${L("Играть, пока ждём")}</span></button>` : ""}
    <button class="b ghost" id="w-menu">${L("В меню")}</button>`, true);
  $("w-inv").onclick = () => sendInvite();
  $("w-bot").onclick = () => { botFor(); hideDlg(); };
  if ($("w-go")) $("w-go").onclick = () => hideDlg();
  $("w-menu").onclick = () => toMenu();
}
function sendInvite() { if (!room) return; const link = Net.inviteLink(GAME, room.id); T.openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(G && G.mode === "vs" ? L("Вызываю тебя в «Промысел» ⚔️") : L("Заходи в мою бухту 🎣"))}`); }
function botFor() { bot = makeBot(1 - me, { skill: "good", seed: 5 }); partner.bot = true; partner.name = "🤖 " + L("Бот"); if (G) G.paused = 0; toast(L("Бот занял место напарника"), "good"); }
function hostApi() {
  return {
    G: () => G, gi: () => 1 - me,
    hello: (d) => { if (d.name) partner.name = d.name.slice(0, 24); if (hs) hs.go(); },
    peer: (on, p) => partnerConn(on, p),
  };
}
/* ---------- онлайн: гость ---------- */
async function joinGame(id, opened) {
  hideAll(); $("title").classList.add("hidden"); $("menu").classList.add("hidden"); role = "guest-wait";
  const r = opened || await Lobby.join(GAME, id, { onCancel: () => showMenu(), onBot: () => showMenu() });
  room = r; r.off("peer"); r.off("peer-left");
  partner = { name: r.peer ? r.peer.name : L("Хозяин"), online: true, bot: false };
  gs = new GuestSync(room, guestApi());
  St.event("pm_room", { role: "guest" });
  dialog(`<h2>${L("Подключились!")}</h2><p class="lb-dots">${L("Получаем бухту")}</p>`, true);
  room.send("hi", { name: myName() });
  const hello = setInterval(() => { if (started || !room || role !== "guest-wait") { clearInterval(hello); return; } room.send("hi", { name: myName() }); }, 2000);
}
async function rejoin(rid) {
  hideAll(); $("title").classList.add("hidden");
  let r = null, gone = false;
  dialog(`<h2>${L("Ждём хозяина")}</h2><p class="lb-dots">${L("Попроси друга открыть «Промысел» и нажать «Продолжить с другом»")}</p><button class="b ghost" id="rj-x">${L("В меню")}</button>`, true);
  $("rj-x").onclick = () => { gone = true; try { r && r.close(); } catch (_) {} hideDlg(); showMenu(); };
  try { r = await Net.open(GAME, rid, { name: myName() }); } catch (_) { if (!gone) { hideDlg(); toast(L("Нет связи с сервером"), "bad"); showMenu(); } return; }
  if (gone) { try { r.close(); } catch (_) {} return; }
  if (!r.peer) await new Promise((res) => r.on("peer", () => res()));
  if (gone) return;
  joinGame(rid, r);
}
function guestApi() {
  return {
    gi: () => me, name: () => myName(),
    local: () => (started ? gloc : null),
    go: (g, gi, d) => {
      if (!started || role !== "guest" || !G || G.cid !== g.cid) { me = gi; const p = g.pl[gi]; gloc.x = p.x; gloc.z = p.z; gloc.dir = p.dir; hideDlg(); start("guest", g, gi); }
      else { G = g; const p = g.pl[me]; if (Math.hypot(p.x - gloc.x, p.z - gloc.z) > 6) { gloc.x = p.x; gloc.z = p.z; } p.x = gloc.x; p.z = gloc.z; world.sync(G, false); hideDlg(); netNote(L("Связь восстановлена"), "good"); }
      if (d && d.name) partner.name = d.name;
    },
    snap: (g) => { G = g; },
    events: (list) => onEvents(list, true),
    peer: (on, p) => partnerConn(on, p),
  };
}

/* ---------- старт ---------- */
function start(r, g, pi, opt) {
  opt = opt || {};
  role = r; G = g; me = pi || 0; started = true; simAcc = 0; idleT = 0; lastEnd = 0;
  bot = null;
  if (opt.bot && G.pl.length > 1) { bot = makeBot(1 - me, { skill: opt.skill || "good", seed: (Math.random() * 1e6) | 0 }); partner = { name: "🤖 " + L("Бот"), online: true, bot: true }; G.botSkill = opt.skill || "good"; }
  if (r === "local" && !opt.bot) partner = { name: "", online: false, bot: false };
  start.slot = opt.slot || null;
  hideAll(); $("title").classList.add("hidden"); $("menu").classList.add("hidden");
  $("top").classList.remove("hidden"); $("hint").classList.remove("hidden");
  $("partner").classList.toggle("hidden", G.pl.length < 2);
  ensureWorld(G);
  world.sync(G, false);
  view.disp = { p: [], h: [], c: new Map() };
  const p = G.pl[me]; gloc.x = p.x; gloc.z = p.z; gloc.dir = p.dir;
  cam.x = p.x; cam.z = p.z - 1; cam.dist = camDist();
  music(G.mode === "vs" ? "m_town" : "m_shanty");
  St.gameStart({ mode: G.mode, role: r, bay: G.bay, resume: G.t > 5 ? 1 : 0 });
  // доход, пока игры не было
  if (opt.away > 60 && r !== "guest") { const got = S.offline(G, opt.away); if (got > 0) { G.money[0] += got; setTimeout(() => banner(L("Пока тебя не было") + ": +" + fmt(got), L("Помощники работали и торговали"), "gold"), 700); } }
  // улучшения «Флота» хозяина действуют сразу, в том числе в начатом забеге
  if (r !== "guest" && G.mode !== "vs" && (G.v || 1) >= 2) G.meta = Object.assign({}, prof.meta);
  hireOpen = -1; $("hire").classList.add("hidden");
  const bayN = L(BAYS[G.bay % BAYS.length].n);
  if (G.t < 2) setTimeout(() => banner(G.mode === "vs" ? (me === 0 ? L("Твоя лавка — слева") : L("Твоя лавка — справа")) : bayN, G.mode === "vs" ? (G.goal === "time" ? L("10 минут: у кого больше выручка") : L("Первым зажги маяк")) : G.bay > 0 || G.lap ? L("Новое здесь") + ": " + BAYS[G.bay % BAYS.length].news.map((k) => L(ITEMS[IT[k]].n)).join(", ") : L("Заходи в воду — рыба сама прыгнет в короб")), 500);
  if (G.mode === "vs") vsRival = { o: S.progress(G, 1 - me).o };
  updHud(true);
  closeConfirm(true);
  save(true);
}
let vsRival = null;
/* ---------- связь с напарником ---------- */
function partnerConn(on, p) {
  if (on) {
    partner.online = true; if (p && p.name && !partner.bot) partner.name = p.name;
    if (started && role === "host") { if (bot) { bot = null; partner.bot = false; partner.name = (p && p.name) || L("Друг"); toast(L("Друг вернулся — бот уступил место"), "good"); } else toast(L("Друг снова с нами"), "good"); if (G) G.paused = 0; hs.go(); hideDlg(); }
    if (started && role === "guest") { hideDlg(); netNote(L("Связь с хозяином восстановлена"), "good"); }
    return;
  }
  partner.online = false;
  if (!started) return;
  if (role === "host") {
    toast(L("Друг отключился"), "bad");
    if (G.mode === "vs" && G.winner < 0) { G.paused = 1; waitFriend(); }
    save(true);
  } else if (role === "guest") {
    save(true);
    dialog(`<h2>${L("Хозяин отключился")}</h2><p class="lb-dots">${L("Ждём, пока он вернётся. Твой прогресс сохранён как копия.")}</p>
      ${G.mode !== "vs" ? `<button class="b" id="h-bot"><span>🤖</span><span class="t">${L("Доиграть копию с ботом")}</span></button>` : ""}<button class="b ghost" id="h-menu">${L("В меню")}</button>`, true);
    if ($("h-bot")) $("h-bot").onclick = () => { const g = G; try { room && room.close(); } catch (_) {} room = null; gs = null; hideDlg(); start("local", g, me, { bot: 1, slot: "guest" }); };
    $("h-menu").onclick = () => toMenu();
  }
}
function toMenu() { save(true); try { room && room.close(); } catch (_) {} room = null; hs = null; gs = null; bot = null; started = false; St.gameEnd({ mode: G ? G.mode : "", t: G ? Math.round(G.t) : 0 }); showMenu(); }

/* ---------- ввод: плавающий джойстик ---------- */
const joy = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 }, keys = {};
function setupInput() {
  const el = $("joy"), knob = el.firstChild, R = 56;
  const down = (e) => {
    if (!started || joy.on || !$("dlg").classList.contains("hidden")) return;
    if (e.target.closest && e.target.closest(".btn, button, .panel, #hire")) return;
    joy.on = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
    el.style.transform = `translate(${joy.ox}px, ${joy.oy}px)`; el.classList.add("on"); knob.style.transform = "";
    idleT = 0;
  };
  const move = (e) => {
    if (!joy.on || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy);
    if (d > R) { // база тянется за пальцем
      const k = (d - R) / d; joy.ox += dx * k; joy.oy += dy * k; dx = e.clientX - joy.ox; dy = e.clientY - joy.oy;
      el.style.transform = `translate(${joy.ox}px, ${joy.oy}px)`;
    }
    joy.x = dx / R; joy.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const up = (e) => { if (e.pointerId !== joy.id) return; joy.on = false; joy.id = -1; joy.x = joy.y = 0; el.classList.remove("on"); };
  addEventListener("pointerdown", down, { passive: true }); addEventListener("pointermove", move, { passive: true }); addEventListener("pointerup", up); addEventListener("pointercancel", up);
  addEventListener("keydown", (e) => { keys[e.code] = 1; if (e.code === "Escape") onBack(); });
  addEventListener("keyup", (e) => { keys[e.code] = 0; });
  $("b-menu").onclick = () => openPause();
  $("partner").onclick = () => partnerMenu();
  // нажал на строку задач — подробности (и камера покажет доску заказов)
  const tasks = () => { const t = $("top"); t.classList.toggle("exp"); play("click"); if (t.classList.contains("exp") && G && (G.con || S.bigStage(G))) focusBoard(2.2); updHud(true); };
  for (const id of ["con", "big", "evc"]) $(id).onclick = tasks;
  // нажал на поток — объясняем, отчего людей мало и что даёт автоматизация
  $("flow").onclick = () => { if (!G) return; play("click"); const why = S.flowWhy(G, G.pl[me].team); toast((why ? "⚠ " + L(WHY[why]) : "👥 " + L("Поток в норме — реклама у рынка добавит людей")) + (G.mode !== "vs" ? " · ⚙ " + L("цепочек сами") + ": " + autoInfoC.ok + "/" + autoInfoC.n + " · 💤 " + L("без тебя") + " +" + fmt(G.idle || 0) + L("/мин") : ""), why ? "bad" : "good", 4); };
  $("hirel").addEventListener("click", hireClick);
}
function stick() {
  let x = joy.x, z = joy.y;
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), kz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (kx || kz) { x = kx; z = kz; }
  if (window.__auto) { const a = window.__auto, n = Math.hypot(a.x, a.z); return n < 0.05 ? { x: 0, z: 0 } : n > 1 ? { x: a.x / n, z: a.z / n } : { x: a.x, z: a.z }; }   // автопилот уже в мировых осях
  const m = Math.hypot(x, z); if (m > 1) { x /= m; z /= m; }
  // мёртвая зона и плавный разгон
  if (m < 0.12) return { x: 0, z: 0 };
  // экран → мир: камера повёрнута на YAW
  const c = Math.cos(YAW), s = Math.sin(YAW);
  return { x: x * c + z * s, z: -x * s + z * c };
}

/* ---------- такт игры ---------- */
const H_STEP = 1 / 60;
function tick(dt) {
  if (!G) return;
  const j = stick();
  if (j.x || j.z) idleT = 0; else idleT += dt;
  if (role === "guest") {
    if (!gs || !gs.G) return;
    G = gs.G;
    const p = G.pl[me];
    p.x = gloc.x; p.z = gloc.z;
    if (!G.paused && G.winner < 0) S.movePlayer(G, me, j.x, j.z, dt);
    gloc.x = p.x; gloc.z = p.z; gloc.dir = p.dir; gloc.mv = p.mv;
    if (!G.paused && G.winner < 0) {
      const n0 = G.ev.length;
      for (const op of S.proximityOps(G, me, dt, gtm)) if (S.applyOp(G, "p" + me, op)) gs.op(op);
      const mine = G.ev.splice(n0); onEvents(mine, false);
    }
    gs.flush(dt, gloc);
    return;
  }
  simAcc += dt;
  let n = 0;
  while (simAcc >= H_STEP && n < 6) {
    simAcc -= H_STEP; n++;
    if (!G.paused) {
      S.movePlayer(G, me, j.x, j.z, H_STEP);
      if (bot && G.pl[bot.pi]) { const b = bot.tick(G, H_STEP); S.movePlayer(G, bot.pi, b.x, b.z, H_STEP); }
    }
    S.step(G, H_STEP, role === "host" && !bot ? { skip: { [1 - me]: true } } : undefined);
    if (G.ev.length) { const evs = G.ev; G.ev = []; onEvents(evs, false); if (hs) hs.events(evs); }
  }
  if (simAcc > 0.2) simAcc = 0;
  if (hs) hs.tick(dt);
}

/* ---------- события → эффекты ---------- */
const L_ = () => S.layoutOf(G);
function camNear(x, z, r) { return Math.hypot(x - cam.x, z - cam.z) < (r || 13); }
function vol(x, z, base) { const d = Math.hypot(x - cam.x, (z - cam.z) * 0.8); return Math.max(0, Math.min(1, 1.2 - d / 13)) * (base == null ? 1 : base); }
let padFlyT = {};
function onEvents(list, remote) {
  if (!G || !view) return;
  const Lr = L_();
  for (const e of list) {
    const isMe = e.a === "p" + me;
    if (remote && isMe && (e.t === "catch" || e.t === "drop" || e.t === "pick" || e.t === "padpay" || e.t === "cash" || e.t === "trap")) continue;   // свои — уже показаны
    const en = e.e != null ? Lr.E[e.e] : null;
    switch (e.t) {
      case "catch": {
        const sc = view.schools.get(e.e), fx = sc && sc.cx != null ? sc.cx : en.school.x, fz = sc && sc.cz != null ? sc.cz : en.school.z;
        const a = e.a, from = { x: fx + (Math.random() - 0.5) * 1.6, y: -0.05, z: fz + (Math.random() - 0.5) * 1.2 };
        view.fly(e.it, from, () => view.topOf(a), { key: a, dur: 0.42, h: 1.6 });
        if (camNear(from.x, from.z)) { view.burst(from.x, 0.05, from.z, "splash", 6); play(Math.random() < 0.5 ? "splash" : "splash2", { vol: vol(from.x, from.z, isMe ? 0.75 : 0.4) }); }
        if (isMe) { play("plop", { vol: 0.5, delay: 0.38, rate: 1 + Math.min(0.5, G.pl[me].st.length * 0.03) }); haptic("impact", "light"); }
        break;
      }
      case "drop": {
        const from = view.topOf(e.a); if (!from) break;
        let key = "", to = null;
        if (en.k === "proc") { const k = en.rec.in.indexOf(e.it); key = "e" + e.e + "i" + k; to = view.pileTarget(en, "in", G, e.it); }
        else if (en.k === "stall") { key = "e" + e.e + "s"; to = view.pileTarget(en, "shelf", G, e.it); }
        else if (en.k === "dock") { key = "e" + e.e + "d"; to = view.pileTarget(en, "dock", G, e.it); }
        else to = new THREE.Vector3(en.x, 1.4, en.z);
        view.fly(e.it, from, to, { key, dur: 0.26, h: 0.7 });
        if (isMe) { play("plop2", { vol: 0.45, rate: 1.1 }); haptic("impact", "light"); } else if (camNear(from.x, from.z, 9)) play("plop2", { vol: vol(from.x, from.z, 0.2) });
        if (en.k === "board") { play("cloth", { vol: 0.6 }); }
        break;
      }
      case "pick": {
        const base = en.k === "gen" || en.k === "proc" ? view.pileTarget(en, "out", G, e.it, 1) : new THREE.Vector3(en.x, 0.5, en.z);
        view.fly(e.it, base, () => view.topOf(e.a), { key: e.a, dur: 0.26, h: 0.8 });
        if (isMe) { play("plop", { vol: 0.45, rate: 1.05 + Math.min(0.5, G.pl[me].st.length * 0.03) }); haptic("impact", "light"); }
        break;
      }
      case "buy": {
        const from = view.pileTarget(en, "shelf", G, e.it, 1);
        view.fly(e.it, from, () => view.topOf("c" + e.c), { key: "c" + e.c, dur: 0.3, h: 0.6 });
        if (camNear(en.x, en.z, 8)) play("chip", { vol: vol(en.x, en.z, 0.25), gap: 0.08 });
        break;
      }
      case "pay": {
        const z = en.zcash; if (!z) break;
        if (camNear(z.x, z.z, 10)) { view.burst(z.x, 0.3, z.z, "cash", e.ship ? 14 : 4); play(e.ship ? "cash2" : "coins", { vol: vol(z.x, z.z, e.ship ? 0.9 : 0.35), gap: 0.1 }); floatText(z.x, 1.2, z.z, "+" + fmt(e.amt), "sm"); }
        if (e.ship && (G.mode !== "vs" || en.team === G.pl[me].team)) toast("🚢 " + L("Судно расплатилось") + ": +" + fmt(e.amt) + " — " + L("забери на причале"), "good");
        break;
      }
      case "cash": {
        if (e.a === "safe") { const z = en.zcash; if (camNear(z.x, z.z, 12)) { floatText(z.x, 1.4, z.z, "+" + fmt(e.amt), "cash"); moneyFly(z.x, 0.6, z.z, 2); } break; }
        const z = en.zcash, n = Math.min(10, 2 + Math.floor(Math.log2(1 + e.amt)));
        for (let i = 0; i < n; i++) view.fly(CASH, { x: z.x + (Math.random() - 0.5) * 0.5, y: 0.2 + i * 0.05, z: z.z + (Math.random() - 0.5) * 0.5 }, () => view.topOf(e.a), { dur: 0.3, h: 0.9, delay: i * 0.035, s: 0.8 });
        if (isMe) {
          play("cash", { vol: 0.8 }); setTimeout(() => play("coins", { vol: 0.5 }), 120); haptic("impact", "medium");
          floatText(z.x, 1.9, z.z, "+" + fmt(e.amt), "cash");
          moneyFly(z.x, 0.8, z.z, Math.min(6, n));
        } else if (e.a[0] === "h" && camNear(z.x, z.z, 9)) play("coins", { vol: vol(z.x, z.z, 0.3) });
        break;
      }
      case "padpay": {
        const now = clock; if (now - (padFlyT[e.a] || 0) > 0.07) { padFlyT[e.a] = now; const from = view.topOf(e.a); const pz = en.zpad; if (from) view.fly(CASH, from, { x: pz.x + (Math.random() - 0.5) * 0.8, y: 0.1, z: pz.z + (Math.random() - 0.5) * 0.8 }, { dur: 0.28, h: 0.7, s: 0.8 }); if (isMe) { play("chip", { vol: 0.35, gap: 0.06, rate: 1.2 }); haptic("select"); } }
        if (isMe) { $("money").classList.add("spend"); clearTimeout(onEvents.st); onEvents.st = setTimeout(() => $("money").classList.remove("spend"), 250); }
        break;
      }
      case "open": {
        world.sync(G, true);
        const z = en.k === "pier" ? { x: en.pier.x, z: (en.pier.z0 + en.pier.z1) / 2 } : en.k === "helper" ? (Lr.hire.length ? Lr.E[Lr.hire.find((h) => Lr.E[h].team === en.team) ?? Lr.hire[0]].zin : en.zpad) : en.zpad;
        const mine = G.mode !== "vs" || en.team === G.pl[me].team;
        if (camNear(z.x, z.z, 18)) { view.burst(z.x, 0.6, z.z, "conf", 46); view.burst(z.x, 0.2, z.z, "snow", 14); cam.shake = 0.25; }
        if (mine) {
          play("levelup", { vol: 0.8 }); setTimeout(() => play("build", { vol: 0.6 }), 150); haptic("notify", "success", true);
          const nm = entName(en);
          if (en.k === "goal") break;
          banner(en.k === "helper" ? L("Нанят") + ": " + nm : L("Открыто") + ": " + nm, entDesc(en), "");
          // нанятый идёт на своё место — подсвечиваем, где он будет работать
          if (en.k === "helper" && en.def.role !== "cashier") view.flash([en.from, ...en.to], 5);
        } else toast("⚔️ " + L("Соперник открыл") + ": " + entName(en), "bad");
        break;
      }
      case "upg": {
        const z = en.zpad, mine = G.mode !== "vs" || e.team === G.pl[me].team;
        if (camNear(z.x, z.z, 14)) view.burst(z.x, 0.4, z.z, "gold", 26);
        if (mine) { play("upgrade", { vol: 0.8 }); haptic("notify", "success", true); toast(`⬆ ${L(UPG[e.u].n)} — ${L("ур.")}${e.lv}: ${upgText(e.u, e.lv)}`, "gold"); }
        break;
      }
      case "made": {
        if (!en || !camNear(en.x, en.z, 8)) break;
        const md = en.def.model;
        if (md === "table" || md === "table2") play(Math.random() < 0.5 ? "knife" : "knife2", { vol: vol(en.x, en.z, 0.35), gap: 0.12 });
        else if (md === "cannery") play("pot", { vol: vol(en.x, en.z, 0.25), gap: 0.3 });
        else if (md === "woodshed") play("chopk", { vol: vol(en.x, en.z, 0.35), gap: 0.3 });
        else if (md === "icehole") play("splash3", { vol: vol(en.x, en.z, 0.25), gap: 0.3 });
        else play("plop2", { vol: vol(en.x, en.z, 0.2), gap: 0.2 });
        const o = en.zout; if (o) view.burst(o.x, 0.6, o.z, "snow", 3);
        break;
      }
      case "ship": play(e.s === "in" ? "bell" : "gull1", { vol: vol(en.x, en.z, 0.8) }); if (e.s === "in" && (G.mode !== "vs" || en.team === G.pl[me].team)) toast("🚢 " + L("Судно у причала — неси консервы и ящики"), ""); break;
      case "contract":
        if (e.s === "new") {
          play("bell", { vol: 0.6 });
          const c = G.con; if (c) toast("📋 " + L("Новый заказ") + ": " + L(ITEMS[c.it].n) + " ×" + c.n + " — " + L("подойди к доске, чтобы начать"), "gold", 4);
          if (!G.cdone) focusBoard(2.4);       // первый заказ — покажем, где доска
        }
        else if (e.s === "go") { const c = G.con; if (c) toast("📋 " + L("Заказ принят") + ": " + L(ITEMS[c.it].n) + " ×" + c.n + " · " + Math.round(c.T) + L("с"), "gold", 3); }
        else if (e.s === "done") { play("levelup"); banner(L("Заказ выполнен!") + " +" + fmt(e.amt), L("Награда — у доски заказов"), "gold"); haptic("notify", "success", true); }
        else { play("error"); toast(e.amt ? L("Не успели — оплачено за сданное") + ": +" + fmt(e.amt) : L("Заказ сорван — не успели"), "bad"); }
        break;
      case "switch": { const to = Lr.E[e.e]; if (G.mode === "vs") { if (to.team === G.pl[me].team) toast("😊 " + L("Покупатель перешёл к тебе"), "good"); else toast("💢 " + L("Покупатель ушёл к сопернику"), "bad"); } break; }
      case "goal": onGoal(e); break;
      case "bayev": {
        const E = EVENTS[e.k], txt = {
          storm: ["🌨 " + L("Идёт буран!"), L("Через 15 с косяк уйдёт на 40 с — запасись рыбой"), L("Буран: косяк ушёл"), L("Буран стих — рыба вернулась")],
          run: ["🐟 " + L("Лосось идёт на нерест!"), L("Скоро ход лосося — беги на отмель"), L("Ход лосося: каждый улов вдвое"), L("Ход лосося закончился")],
          tide: ["🌊 " + L("Начинается отлив"), L("Вода уйдёт — на берегу появятся ловушки с крабами"), L("Отлив: отмель шире, ловушки на берегу"), L("Прилив — ловушки ушли под воду")],
          fair: ["🎪 " + L("Ярмарочный день!"), L("Скоро придут важные гости — запасись товаром"), L("Важные гости платят втрое"), L("Ярмарка закончилась")],
        }[e.k];
        if (!txt) break;
        if (e.s === "warn") { banner(txt[0], txt[1], "gold"); play("bell", { vol: 0.7 }); haptic("notify", "warning", true); }
        else if (e.s === "start") { toast(txt[2], "gold", 3.5); play(e.k === "storm" ? "gull2" : "levelup", { vol: 0.5 }); if (e.k === "storm") cam.shake = 0.3; }
        else toast(txt[3], "good", 3);
        void E; break;
      }
      case "big": {
        const b = S.bigStage(G);
        if (e.s === "new") { banner("🚢 " + L(b ? b.n : "Большой заказ"), L("Неси к доске заказов") + ": " + (b ? L(ITEMS[b.it].n) + " ×" + b.need : ""), "gold"); play("bell"); focusBoard(2.4); }
        else { play("levelup"); haptic("notify", "success", true); banner(e.s === "done" ? "✅ " + L("Заказ судна выполнен!") : "✅ " + L("Ступень сдана!"), "+" + fmt(e.amt) + " — " + L("у доски заказов") + (e.last ? " · " + L("маяк можно строить") : ""), "gold"); const bi = Lr.byId[0].board; if (bi != null) { const be = Lr.E[bi]; view.burst(be.x, 2.5, be.z, "conf", 40); } }
        break;
      }
      case "ad": {
        const mine = G.mode !== "vs" || e.team === G.pl[me].team, A = S.ADS[e.k];
        if (mine) { banner((e.k === "fl" ? "📜 " : e.k === "sign" ? "🪧 " : "📣 ") + L(A.n) + (e.k === "sign" ? " · " + L("ур.") + e.lv : ""), L(A.d), "gold"); play(e.k === "cr" ? "bell" : "cloth", { vol: 0.7 }); }
        else toast("⚔️ " + L("Соперник дал рекламу") + ": " + L(A.n), "bad");
        if (en && camNear(en.x, en.z, 14)) view.burst(en.x, 2, en.z, "conf", 24);
        break;
      }
      case "mgr": { const st = Lr.E[e.e]; banner("⚙ " + L("Управляющий") + ": " + entName(st), L("Цех сам подтягивает сырьё тележкой"), "gold"); play("upgrade"); view.flash([e.e], 4); break; }
      case "safe": banner("🔐 " + L("Сейф с автосбором"), L("Выручка сама идёт в кошелёк"), "gold"); play("cash2"); haptic("notify", "success", true); break;
      case "auto": { banner("⚙ " + L("Цепочка работает сама!"), L("Автоматизация") + ": " + e.n + "/" + e.of, "gold"); play("levelup", { vol: 0.7 }); setTimeout(() => play("bell", { vol: 0.5 }), 250); for (const i of autoSet) { const st = Lr.E[i]; if (camNear(st.x, st.z, 14)) view.burst(st.x, 2.6, st.z, "gold", 18); } break; }
      case "cart": { const a = Lr.E[e.from], b2 = Lr.E[e.to]; if (camNear(b2.x, b2.z, 12)) view.fly(e.it, view.pileTarget(a, "out", G, e.it, 1), view.pileTarget(b2, "in", G, e.it), { dur: 0.6, h: 1.4 }); break; }
      case "deco": banner("🏮 " + L("База украшена"), L("Покупатели довольнее — цены выше на 3%"), "gold"); play("upgrade"); break;
      case "trap": { const tp = G.traps && G.traps[e.k]; if (tp) view.fly(e.it, { x: tp.x, y: 0.1, z: tp.z }, () => view.topOf(e.a), { key: e.a, dur: 0.3, h: 0.8 }); if (isMe) { play("plop", { vol: 0.45 }); haptic("impact", "light"); } break; }
      case "perk": { const pp = PERKS.find((x) => x.id === e.id); if (pp) banner("🎖 " + L(pp.n), L(pp.d), "gold"); break; }
      case "supg": { const z = en.zpad, mine = G.mode !== "vs" || e.team === G.pl[me].team; if (camNear(z.x, z.z, 14)) view.burst(z.x, 0.4, z.z, "gold", 22); if (mine) { play("upgrade", { vol: 0.8 }); toast(`⚙ ${entName(Lr.E[e.of])} — ${L("ур.")}${e.lv}: ${L("быстрее и вмещает больше")}`, "gold"); } break; }
    }
  }
}
function upgText(u, lv) { const v = UPG[u].v(lv); if (u === "bag" || u === "crew") return v + " " + L("мест"); if (u === "boots" || u === "crewspd") return L("скорость") + " +" + Math.round((v / UPG[u].v(0) - 1) * 100) + "%"; if (u === "net") return L("ловля") + " +" + Math.round((UPG[u].v(0) / v - 1) * 100) + "%"; return ""; }
function entName(e) { if (e.k === "upg") return L(UPG[e.def.u].n); if (e.k === "supg") return L("Ускорить") + ": " + entName(S.layoutOf(G).E[e.tg]); return L(e.def.n || e.id); }
function entDesc(e) {
  if (e.k === "proc") return e.rec.in.map((i) => L(ITEMS[i].n)).join(" + ") + " → " + L(ITEMS[e.rec.out].n);
  if (e.k === "helper") return jobText(e);
  if (e.k === "stall") return L("Покупатели платят за") + " «" + L(ITEMS[e.item].n) + "»: " + fmt(S.itemPrice(G, e.item)) + " " + L("за штуку");
  if (e.k === "gen") return L("Сам заготавливает") + ": " + L(ITEMS[e.item].n);
  if (e.k === "pier") return L("В конце мостков ловится лосось");
  if (e.k === "dock") return L("Судно увозит консервы и ящики улова — платит щедро");
  if (e.k === "goal") return G.mode === "vs" ? L("Зажги первым — победа") : L("Маяк зажжён — бухта пройдена");
  if (e.k === "supg") { const lv = G.e[e.tg].lv || 0; return L("Работает быстрее и вмещает больше") + ": " + L("ур.") + lv + " → " + (lv + 1); }
  if (e.k === "upg") { const lv = G.upg[e.team][e.def.u]; return L(UPG[e.def.u].d) + ": " + upgText(e.def.u, lv) + " → " + upgText(e.def.u, lv + 1); }
  return "";
}
function onGoal(e) {
  const team = e.team, mine = G.mode !== "vs" || team === G.pl[me].team;
  const en = S.layoutOf(G).E.find((x) => x.k === "goal" && x.team === team);
  if (en) { view.burst(en.x, 3, en.z, "conf", 120); view.burst(en.x, 5, en.z, "gold", 40); }
  play(mine ? "levelup" : "error"); haptic("notify", mine ? "success" : "error", true);
  if (G.mode === "vs") {
    if (lastEnd) return; lastEnd = 1;
    const win = team === G.pl[me].team;
    if (role !== "guest") { if (win) prof.vsWin++; else prof.vsLoss++; SV.saveProfile(prof); }
    else { if (win) prof.vsWin++; else prof.vsLoss++; SV.saveProfile(prof); }
    SV.wipe("vs");
    St.gameEnd({ mode: "vs", win: win ? 1 : 0, t: Math.round(G.t) });
    setTimeout(() => endVs(win, e.time), 1800);
  } else {
    if (!G.ancPaid && onGoal.paid !== G.cid) { onGoal.paid = G.cid; if (role !== "guest") G.ancPaid = 1; prof.anchors = (prof.anchors || 0) + anchorsFor(G.bay, G.stars); prof.bays = Math.max(prof.bays || 0, G.bay + 1 + (G.lap || 0) * BAYS.length); prof.stars = (prof.stars || 0) + (G.stars || 0); SV.saveProfile(prof); }
    setTimeout(() => bayDone(), 1600);
  }
}
function endVs(win, byTime) {
  const t = G.pl[me].team, o = 1 - t;
  dialog(`<h2>${win ? "🏆 " + L("Победа!") : L("Соперник оказался быстрее")}</h2>
    <p>${byTime ? L("Время вышло — считаем выручку") : win ? L("Твой маяк загорелся первым") : L("Его маяк загорелся первым")}</p>
    <div class="stats2"><div>${L("Твоя выручка")}<b>${fmt(G.earned[t])}</b></div><div>${L("У соперника")}<b>${fmt(G.earned[o])}</b></div><div>${L("Открыто")}<b>${S.progress(G, t).o}</b></div><div>${L("Время")}<b>${Math.floor(G.t / 60)}:${String(Math.floor(G.t % 60)).padStart(2, "0")}</b></div></div>
    ${role === "host" && partner.online ? `<button class="b primary" id="e-re"><span>🔁</span><span class="t">${L("Реванш")}</span></button>` : ""}
    ${role === "local" ? `<button class="b primary" id="e-re2"><span>🔁</span><span class="t">${L("Ещё матч")}</span></button>` : ""}
    ${role === "guest" ? `<p>${L("Реванш запускает хозяин.")}</p>` : ""}
    <button class="b" id="e-menu"><span>🏠</span><span class="t">${L("В меню")}</span></button>`, true);
  if ($("e-re")) $("e-re").onclick = () => { hideDlg(); const g = S.newGame({ mode: "vs", seed: (Math.random() * 1e9) | 0, goal: G.goal }); start("host", g, 0); hs.go(); };
  if ($("e-re2")) $("e-re2").onclick = () => { hideDlg(); start("local", S.newGame({ mode: "vs", seed: (Math.random() * 1e9) | 0, goal: G.goal }), 0, { bot: 1, skill: G.botSkill || "good" }); };
  $("e-menu").onclick = () => { hideDlg(); toMenu(); };
}
// маяк зажжён: якоря во «Флот», выбор знака (1 из 3), потом — следующая бухта
function bayDone() {
  if (role === "guest") { banner(L("Маяк зажжён!"), L("Хозяин выбирает знак промысла и новую бухту"), "gold"); return; }
  if (G.perkDone) return nextBayDlg();
  if (G.perkPick) return perkStep();
  // три разные карточки из тех, что ещё не на максимуме
  const pool = PERKS.filter((p) => (G.perks[p.id] || 0) < p.max), pick = [];
  while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
  G.perkPick = pick; save(true);
  perkStep();
}
function perkCard(p, lv, attr) {
  return `<button class="pcard g-${PERKS.indexOf(p) < 5 ? "me" : PERKS.indexOf(p) < 9 ? "crew" : PERKS.indexOf(p) < 13 ? "trade" : "shop"}" ${attr}><i>${L(p.g)}</i><b>${L(p.n)}</b><span>${L(p.d)}</span><small>${lv ? L("сейчас") + ": " + lv + " → " + (lv + 1) : L("новый знак")}${p.max > 1 ? " · " + L("макс.") + " " + p.max : ""}</small></button>`;
}
function perkStep() {
  const got = anchorsFor(G.bay, G.stars);
  dialog(`<h2>🗼 ${L("Маяк зажжён!")}</h2><p>${L(BAYS[G.bay % BAYS.length].n)} — ${L("за")} ${Math.floor(G.t / 60)} ${L("мин")}. ${L("Во «Флот»")}: <b class="anc">+${got} ⚓</b></p>
    <p class="pk-h">${L("Выбери знак промысла — он будет с тобой во всех следующих бухтах:")}</p>
    <div class="pcards">${G.perkPick.map((id) => { const p = PERKS.find((x) => x.id === id); return perkCard(p, G.perks[id] || 0, `data-p="${id}"`); }).join("")}</div>`, true);
  $("dlgp").querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => {
    const id = b.dataset.p; G.perks[id] = (G.perks[id] || 0) + 1; G.perkPick = null; G.perkDone = 1; play("perk"); haptic("notify", "success", true);
    if (hs) hs.room.send("ev", { t: "perk", id });
    save(true); nextBayDlg();
  }));
}
// что переносится в следующую бухту
function carryUpg(u) { const c = {}; for (const k in u) c[k] = k === "crew" || k === "crewspd" ? u[k] : Math.floor(u[k] / 2); return c; }
function nextBayDlg() {
  const nb = ((G.v || 1) < 2 ? G.bay + 1 : G.bay + 1) % BAYS.length, lap = (G.lap || 0) + (G.bay + 1 >= BAYS.length ? 1 : 0), B = BAYS[nb], c = carryUpg(G.upg[0]);
  const icons = B.news.map((k) => `<img src="${ICONURL[k] || ""}" title="${esc(L(ITEMS[IT[k]].n))}">`).join("");
  const nPerk = Object.values(G.perks).reduce((a, b) => a + b, 0);
  dialog(`<h2>⛵ ${L(B.n)}${lap ? " · " + L("круг") + " " + (lap + 1) : ""}</h2>
    <div class="news">${icons}</div><p>${L("Новый берег и новые товары")}: ${B.news.map((k) => L(ITEMS[IT[k]].n)).join(", ")}.</p><p>✨ ${L("Особое")}: ${L(B.ev)}</p>
    <div class="carry"><div>🎖 ${L("Знаки промысла")}<b>${nPerk}</b></div><div>👷 ${L("Артель")}<b>${L("ур.")} ${c.crew} / ${c.crewspd}</b></div><div>🎒 ${L("Снаряжение")}<b>${L("половина")}</b></div><div>🏗 ${L("Постройки")}<b>${L("заново")}</b></div></div>
    <button class="b primary" id="n-go"><span>⛵</span><span class="t">${L("Плыть")}: ${L(B.n)}</span></button>
    <button class="b" id="n-stay"><span>🏝</span><span class="t">${L("Остаться пока здесь")}<small>${L("Уплыть можно из меню")}</small></span></button>`, true);
  $("n-go").onclick = () => { hideDlg(); goNextBay(nb, lap, c); };
  $("n-stay").onclick = () => hideDlg();
}
function goNextBay(nb, lap, c) {
  const g = S.newGame({ mode: G.mode, seed: (Math.random() * 1e9) | 0, bay: nb, lap, perks: G.perks, meta: prof.meta, upg: c, diff: G.diff });
  const wasBot = !!bot, r = role;
  start(r, g, 0, { bot: wasBot, newBay: 1 });
  if (hs) hs.go();
}
/* ---------- «Флот»: постоянные улучшения за якоря ---------- */
function fleetMenu(back) {
  const draw = () => {
    const br = [...new Set(META.map((m) => m.br))];
    dialog(`<h2>⚓ ${L("Флот")}</h2><p>${L("Якоря дают за каждую пройденную бухту. Улучшения действуют во всех забегах «Вместе» и «Одному».")}</p>
      <div class="anchors">⚓ <b>${prof.anchors || 0}</b></div>
      <div class="tree">${br.map((b) => `<div class="branch"><h3>${L(b)}</h3>${META.filter((m) => m.br === b).map((m) => {
        const lv = prof.meta[m.id] || 0, max = lv >= m.max, lock = m.req && !(prof.meta[m.req] > 0), cost = max ? 0 : m.cost[lv], ok = !max && !lock && (prof.anchors || 0) >= cost;
        return `<button class="node ${max ? "max" : lock ? "lock" : ok ? "ok" : ""}" data-m="${m.id}" ${max || lock ? "disabled" : ""}><b>${L(m.n)}</b><span>${L(m.d)}</span><small>${lock ? "🔒 " + L("сначала") + " «" + L(META.find((x) => x.id === m.req).n) + "»" : max ? "✓ " + L("максимум") : "⚓ " + cost}</small><em>${"●".repeat(lv)}${"○".repeat(m.max - lv)}</em></button>`; }).join("")}</div>`).join("")}</div>
      <button class="b ghost" id="f-x">${L("Готово")}</button>`);
    $("dlgp").querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => {
      const m = META.find((x) => x.id === b.dataset.m), lv = prof.meta[m.id] || 0;
      if (lv >= m.max || (prof.anchors || 0) < m.cost[lv]) { play("error"); return; }
      prof.anchors -= m.cost[lv]; prof.meta[m.id] = lv + 1; SV.saveProfile(prof); play("upgrade"); haptic("notify", "success", true);
      if (G && started && role !== "guest" && G.mode !== "vs" && (G.v || 1) >= 2) G.meta = Object.assign({}, prof.meta);
      draw();
    }));
    $("f-x").onclick = () => { hideDlg(); if (back) back(); };
  };
  draw();
}

// взять нельзя: некуда нести — объясняем, что открыть
let noDestT = -99;
function noDest(it) {
  if (clock - noDestT < 4) return; noDestT = clock;
  const team = G.pl[me].team, ni = S.needFor(G, team, it), Lr = S.layoutOf(G);
  toast("✋ " + L("Некуда нести") + " «" + L(ITEMS[it].n) + "»" + (ni >= 0 ? " — " + L("сначала открой") + " «" + entName(Lr.E[ni]) + "»" : ""), "bad", 3.5);
  play("error", { vol: 0.4 }); haptic("notify", "warning");
}
/* ---------- деньги и подписи на экране ---------- */
const floats = [];
function floatText(x, y, z, txt, cls) {
  if (floats.length > 24) { const f = floats.shift(); f.el.remove(); }
  const el = document.createElement("div"); el.className = "fl " + (cls || ""); el.textContent = txt; $("layer").appendChild(el);
  floats.push({ el, x, y, z, t: 0 });
}
function moneyFly(x, y, z, n) {
  const s = project(x, y, z), r = $("money").getBoundingClientRect(), tx = r.left + 24, ty = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("img"); el.className = "fly"; el.src = ICONURL.cash; $("layer").appendChild(el);
    const sx = s.x + (Math.random() - 0.5) * 40, sy = s.y + (Math.random() - 0.5) * 30;
    el.animate([{ transform: `translate(${sx}px, ${sy}px) scale(.6)` }, { transform: `translate(${(sx + tx) / 2 + (Math.random() - 0.5) * 60}px, ${Math.min(sy, ty) - 60}px) scale(1.1)`, offset: 0.45 }, { transform: `translate(${tx}px, ${ty}px) scale(.5)` }], { duration: 520 + i * 60, easing: "cubic-bezier(.4,.1,.6,1)" }).onfinish = () => { el.remove(); bumpMoney(); };
  }
}
function bumpMoney() { const m = $("money"); m.classList.add("bump"); clearTimeout(bumpMoney.t); bumpMoney.t = setTimeout(() => m.classList.remove("bump"), 120); play("coin", { vol: 0.3, gap: 0.05, rate: 1.3 }); }
function drawFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt;
    if (f.t > 1.1) { f.el.remove(); floats.splice(i, 1); continue; }
    const s = project(f.x, f.y + f.t * 1.2, f.z);
    f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${f.t < 0.15 ? 0.6 + f.t * 3 : 1})`; f.el.style.opacity = f.t > 0.7 ? String((1.1 - f.t) / 0.4) : "1";
  }
}

/* ---------- Артель: дом найма. Стоишь у дверей — снизу открывается доска с карточками ---------- */
let hireOpen = -1, hireKey = "";
const myLoc = () => (role === "guest" ? gloc : G.pl[me]);
// чем занят помощник — одной строкой
function jobText(e) {
  const Lr = S.layoutOf(G);
  if (e.def.role === "cashier") return L("Сам собирает выручку со всех прилавков");
  const s = Lr.E[e.from], it = s.k === "spot" || s.k === "gen" ? s.item : s.rec.out, to = e.to.map((i) => entName(Lr.E[i])).join(" / ");
  return s.k === "spot" ? L("Ловит") + " «" + L(ITEMS[it].n) + "» → " + to : L("Носит") + " «" + L(ITEMS[it].n) + "»: " + entName(s) + " → " + to;
}
function roleItem(e) { if (e.def.role === "cashier") return "cash"; const s = S.layoutOf(G).E[e.from]; return ITEMS[s.k === "spot" || s.k === "gen" ? s.item : s.rec.out].id; }
function crewText(u, lv) { return u === "crew" ? L("Помощники несут") + " " + (UPG.crew.v(lv) + 2 * S.pk(G, "h_cap") + S.mt(G, "m_hcap")) + " → " + (UPG.crew.v(lv + 1) + 2 * S.pk(G, "h_cap") + S.mt(G, "m_hcap")) : L("Скорость помощников") + " +" + Math.round(lv * 12) + "% → +" + Math.round((lv + 1) * 12) + "%"; }
// одна доска снизу на два дома: «Артель» (наём) и «Реклама» (поток покупателей)
let boardKind = "";
// автоматизация (раз в секунду): какие цеха работают сами — для значков ⚙ и шапки
let autoSet = new Set(), autoInfoC = { n: 0, ok: 0 }, autoT = 0;
function updAuto(dt) {
  autoT -= dt; if (autoT > 0 || !G) return; autoT = 1;
  const Lr = S.layoutOf(G), team = G.pl[me].team; autoSet = new Set();
  for (const e of Lr.E) if ((G.mode !== "vs" || e.team === team) && S.stationAuto(G, e)) autoSet.add(e.i);
  autoInfoC = G.mode !== "vs" ? S.autoInfo(G, team) : { n: 0, ok: 0 }; view.autoSet = autoSet;
}
function updHire() {
  if (!G || !started) return;
  const busy = G.winner >= 0 || !$("dlg").classList.contains("hidden");
  const hi = busy ? -1 : S.atHire(G, me, myLoc()), ai = busy || hi >= 0 ? -1 : S.atAds(G, me, myLoc());
  const at = hi >= 0 ? hi : ai, kind = hi >= 0 ? "hire" : ai >= 0 ? "ads" : "";
  if (at < 0) { if (hireOpen >= 0) { hireOpen = -1; boardKind = ""; $("hire").classList.add("hidden"); } return; }
  if (hireOpen !== at) { hireOpen = at; boardKind = kind; hireKey = ""; $("hire").classList.remove("hidden"); play("cloth", { vol: 0.5 }); haptic("select"); $("hire").classList.toggle("ads", kind === "ads"); $("hire").querySelector(".hh").innerHTML = kind === "ads" ? `<b>${L("РЕКЛАМА")}</b><small>${L("больше покупателей — больше выручки")}</small>` : `<b>${L("АРТЕЛЬ")}</b><small>${L("нанимай помощников и улучшай их")}</small>`; }
  if (kind === "ads") return updAds();
  const Lr = S.layoutOf(G), team = G.pl[me].team, money = G.money[team];
  const mine = Lr.E.filter((e) => e.k === "helper" && (G.mode !== "vs" || e.team === team));
  const card = (e) => { const c = S.hireCost(G, e.i), ok = money >= c; return `<button class="hc ${ok ? "ok" : ""}" data-h="${e.i}"><div class="por"><img src="${ICONURL[e.def.role === "cashier" ? "cashier" : "helper"]}"><img class="it" src="${ICONURL[roleItem(e)] || ""}"></div><div class="tx"><b>${esc(entName(e))}</b><span>${esc(jobText(e))}</span></div><div class="pr">${c ? "💵 " + fmt(c) : L("даром")}${ok ? "" : `<small>${L("ещё")} ${fmt(c - money)}</small>`}</div></button>`; };
  const avail = mine.filter((e) => S.canHire(G, e.i)), hired = mine.filter((e) => G.e[e.i].o), locked = mine.filter((e) => !G.e[e.i].o && !S.canHire(G, e.i));
  const crew = hired.length ? ["crew", "crewspd"].filter((u) => G.upg[team][u] < UPG[u].max).map((u) => { const lv = G.upg[team][u], c = S.crewCost(G, team, u), ok = money >= c; return `<button class="hc up ${ok ? "ok" : ""}" data-u="${u}"><div class="por"><img src="${ICONURL[u === "crew" ? "crate2" : "skis"]}"></div><div class="tx"><b>${L(u === "crew" ? "Короба артели" : "Лыжи артели")} · ${L("ур.")}${lv + 1}</b><span>${esc(crewText(u, lv))}</span></div><div class="pr">💵 ${fmt(c)}${ok ? "" : `<small>${L("ещё")} ${fmt(c - money)}</small>`}</div></button>`; }).join("") : "";
  const lockHtml = locked.slice(0, 2).map((e) => { const need = e.after.find((a) => !G.e[a].o); return `<div class="hc lock"><div class="por"><img src="${ICONURL.helper}"><img class="it" src="${ICONURL[roleItem(e)] || ""}"></div><div class="tx"><b>${esc(entName(e))}</b><span>🔒 ${L("сначала открой")} «${esc(entName(Lr.E[need]))}»</span></div></div>`; }).join("");
  // управляющие цехами (цех сам тянет сырьё тележкой) и сейф с автосбором выручки
  const priceTag = (c) => `<div class="pr">💵 ${fmt(c)}${money >= c ? "" : `<small>${L("ещё")} ${fmt(c - money)}</small>`}</div>`;
  const mgr = G.mode === "vs" ? "" : Lr.E.filter((e) => S.canMgr(G, e.i) && hired.some((h) => h.from === e.i)).slice(0, 3).map((e) => { const c = S.mgrCost(G, e.i); return `<button class="hc up ${money >= c ? "ok" : ""}" data-g="${e.i}"><div class="por"><img src="${ICONURL.helper}"><img class="it" src="${ICONURL[ITEMS[e.rec.out].id] || ""}"></div><div class="tx"><b>${L("Управляющий")}: ${esc(entName(e))}</b><span>${L("Цех сам подтягивает сырьё тележкой — подносить не нужно")}</span></div>${priceTag(c)}</button>`; }).join("");
  const safe = G.mode !== "vs" && !G.safe && hired.length >= 3 ? (() => { const c = S.safeCost(G); return `<button class="hc up ${money >= c ? "ok" : ""}" data-s="1"><div class="por"><img src="${ICONURL.cashier}"></div><div class="tx"><b>${L("Сейф с автосбором")}</b><span>${L("Вся выручка сама идёт в кошелёк — бегать за деньгами не нужно")}</span></div>${priceTag(c)}</button>`; })() : "";
  const html = `${avail.map(card).join("")}${safe}${mgr}${crew}${lockHtml}${hired.length ? `<div class="hired">${L("Уже работают")}: ${hired.map((e) => `<img src="${ICONURL[roleItem(e)] || ""}" title="${esc(entName(e))}">`).join("")}</div>` : ""}${!avail.length && !crew && !locked.length ? `<p>${L("Все помощники наняты")}</p>` : ""}`;
  if (html !== hireKey) { hireKey = html; $("hirel").innerHTML = html; }
}
function doOp(op) {
  if (role === "guest") { if (!gs || !gs.G) return false; const n0 = G.ev.length; if (S.applyOp(G, "p" + me, op)) { gs.op(op); onEvents(G.ev.splice(n0), false); return true; } return false; }
  return S.applyOp(G, "p" + me, op);
}
function updAds() {
  const team = G.pl[me].team, money = G.money[team], a = (G.ads && G.ads[team]) || {}, why = S.flowWhy(G, team);
  const card = (k, lv) => { const A = S.ADS[k], c = S.adCost(G, team, k), can = S.canAd(G, team, k), act = (a[k] || 0) > 0, cd = (a[k + "c"] || 0) - (a[k] || 0);
    const st = k === "sign" ? (lv >= A.max ? "✓ " + L("максимум") : L("ур.") + lv + "&nbsp;→&nbsp;" + (lv + 1)) : act ? "▶ " + L("идёт") + " " + Math.ceil(a[k]) + L("с") : cd > 0 ? "⏳ " + Math.ceil(cd) + L("с") : "";
    return `<button class="hc ad ${can && money >= c ? "ok" : ""} ${act ? "on" : ""}" data-ad="${k}" ${can ? "" : "disabled"}><div class="por"><span class="em">${k === "fl" ? "📜" : k === "sign" ? "🪧" : "📣"}</span></div><div class="tx"><b>${L(A.n)}</b><span>${L(A.d)}</span><small>${st}</small></div>${can ? `<div class="pr">💵 ${fmt(c)}${money >= c ? "" : `<small>${L("ещё")} ${fmt(c - money)}</small>`}</div>` : ""}</button>`; };
  const rep = S.repOf(G, team);
  const html = `<div class="flowbox"><div>👥 <b>${Math.round(G.flow || 0)}</b> ${L("покупателей в минуту")}</div><div class="rep">${L("Репутация")} <i><u style="width:${Math.round(rep * 100)}%"></u></i></div>${why ? `<small>⚠ ${L(WHY[why])}</small>` : ""}</div>${card("fl")}${card("sign", a.sign || 0)}${card("cr")}`;
  if (html !== hireKey) { hireKey = html; $("hirel").innerHTML = html; }
}
const WHY = { angry: "Очередь злится — покупатели уходят, репутация падает", empty: "На прилавке пусто, а очередь ждёт", ads: "Мало рекламы — поставь вывеску", rep: "Плохая репутация — обслуживай быстрее" };
function hireClick(ev) {
  const b = ev.target.closest("[data-h],[data-u],[data-g],[data-s],[data-ad]"); if (!b || hireOpen < 0 || !G || b.disabled) return;
  const op = b.dataset.ad ? ["ad", hireOpen, b.dataset.ad] : b.dataset.g ? ["g", hireOpen, +b.dataset.g] : b.dataset.s ? ["s", hireOpen] : b.dataset.h != null ? ["h", hireOpen, +b.dataset.h] : ["u", hireOpen, b.dataset.u];
  if (!doOp(op)) { play("error", { vol: 0.5 }); haptic("notify", "warning"); toast(L("Не хватает денег"), "bad", 1.8); return; }
  hireKey = ""; updHire();
}

/* ---------- HUD ---------- */
let shownMoney = 0;
function setText(el, s) { if (el.textContent !== s) el.textContent = s; }
function updHud(force) {
  if (!G) return;
  const p = G.pl[me], team = p.team, money = G.money[team];
  shownMoney = Math.abs(money - shownMoney) < 1 || force ? money : shownMoney + (money - shownMoney) * 0.35;
  setText($("money-v"), fmt(shownMoney));
  setText($("money-r"), G.mode !== "vs" && G.rate > 0.05 ? "+" + fmt(G.rate * 60) + L("/мин") : "");
  const pr = S.progress(G, team);
  setText($("prog-t"), G.mode === "vs" ? (me === 0 ? L("Твоя лавка") : L("Твоя лавка")) : L(BAYS[G.bay].n));
  $("prog-i").style.width = (pr.o / pr.n * 100).toFixed(1) + "%"; setText($("prog-n"), pr.o + "/" + pr.n);
  // напарник
  const pe = $("partner");
  if (G.pl.length > 1) {
    const on = partner.online || partner.bot;
    pe.classList.toggle("off", !on); pe.classList.toggle("relay", on && room && !partner.bot && room.link !== "p2p");
    setText($("ptx"), partner.name || (G.mode === "vs" ? L("Соперник") : L("Напарник")));
    setText($("pnet"), partner.bot ? "" : room ? (on ? (room.rtt ? room.rtt + L("мс") : "") : L("нет связи")) : "");
  }
  // поток покупателей, автоматизация, доход без тебя
  {
    const fe = $("flow"), why = S.flowWhy(G, team), ai = autoInfoC;
    const html = `<span>👥 <b>${Math.round(G.flow || 0)}</b>${L("/мин")}${why ? ` <i class="w">⚠</i>` : ""}</span>${G.mode !== "vs" && ai.n ? `<span>⚙ <b>${ai.ok}/${ai.n}</b></span>` : ""}${G.mode !== "vs" && (G.idle || 0) > 0 ? `<span>💤 <b>+${fmt(G.idle)}</b>${L("/мин")}</span>` : ""}`;
    if (fe.dataset.h !== html) { fe.innerHTML = html; fe.dataset.h = html; } fe.classList.remove("hidden");
  }
  // строка задач под полосой бухты: заказ, заказ судна, событие — коротко; нажал — подробно
  const exp = $("top").classList.contains("exp");
  const chip = (el, show, html, cls) => { if (!show) { el.classList.add("hidden"); return; } el.classList.remove("hidden"); if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } for (const k in cls) el.classList.toggle(k, !!cls[k]); };
  const c = G.mode !== "vs" ? G.con : null;
  chip($("con"), !!c, c ? `<img src="${ICONURL[ITEMS[c.it].id]}"><b>${c.got}/${c.n}</b><span class="tm">${c.end ? (c.ok ? "✅" : "⌛") : !c.ac ? "▶ " + Math.ceil(Math.max(0, c.t)) + L("с") : Math.ceil(Math.max(0, c.t)) + L("с")}</span>${exp ? `<span class="full">${c.ac ? L("Заказ") : L("Новый заказ — подойди к доске")}: ${L(ITEMS[c.it].n)}</span>` : ""}<i class="bar" style="width:${c.ac && !c.end ? Math.max(0, c.t / c.T * 100).toFixed(1) : 100}%"></i>` : "", c ? { late: c.ac && c.t < c.T * 0.25 && !c.end, ok: c.end && c.ok, offer: !c.ac } : {});
  const bs = G.mode !== "vs" ? S.bigStage(G) : null;
  chip($("big"), !!bs, bs ? `<span class="ic">🚢</span><img src="${ICONURL[ITEMS[bs.it].id]}"><b>${bs.got}/${bs.need}</b><span class="dots">${Array.from({ length: bs.of }, (_, k) => `<i class="${k < bs.s ? "on" : ""}"></i>`).join("")}</span>${exp ? `<span class="full">${L(bs.n)}: ${L(ITEMS[bs.it].n)}</span>` : ""}` : "", {});
  const ev = G.evt;
  chip($("evc"), !!(ev && ev.ph > 0), ev && ev.ph > 0 ? `<span class="ic">${{ storm: "🌨", run: "🐟", tide: "🌊", fair: "🎪" }[ev.k] || "⏱"}</span><b>${ev.ph === 1 ? "→ " : ""}${Math.ceil(Math.max(0, ev.t))}${L("с")}</b>${exp ? `<span class="full">${L(EVENTS[ev.k].n)}${ev.ph === 1 ? " — " + L("скоро") : ""}</span>` : ""}` : "", { warn: ev && ev.ph === 1, on: ev && ev.ph === 2 });
  // против
  const ve = $("vs");
  if (G.mode === "vs") {
    ve.classList.remove("hidden"); $("row2").classList.add("hidden");
    const o = 1 - team, mo = S.progress(G, team), ro = S.progress(G, o);
    const time = G.goal === "time";
    const val = (t) => (time ? G.earned[t] : S.progress(G, t).o / S.progress(G, t).n * 100);
    const mx = time ? Math.max(1, G.earned[0], G.earned[1]) : 100;
    const rem = time ? Math.max(0, G.tEnd - G.t) : 0;
    const html = `<div class="vr"><b style="color:${PCOL[team].coat}">${L("Ты")}</b><div class="vb"><i style="width:${(val(team) / mx * 100).toFixed(1)}%;background:${PCOL[team].coat}"></i></div><span>${time ? fmt(G.earned[team]) : mo.o + "/" + mo.n}</span></div>
      <div class="vr"><b style="color:${PCOL[o].coat}">${esc(partner.name || L("Соперник"))}</b><div class="vb"><i style="width:${(val(o) / mx * 100).toFixed(1)}%;background:${PCOL[o].coat}"></i></div><span>${time ? fmt(G.earned[o]) : ro.o + "/" + ro.n}</span></div>
      ${time ? `<div class="vr" style="justify-content:center"><span id="vtime" style="width:auto">⏱ ${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, "0")}</span></div>` : ""}`;
    if (ve.dataset.h !== html) { ve.innerHTML = html; ve.dataset.h = html; }
  } else { ve.classList.add("hidden"); $("row2").classList.remove("hidden"); }
}
// подсказка: что делать дальше (и куда показывает стрелка)
let hintTarget = null, tipE = -1, guideForce = false;
// камера ненадолго показывает доску заказов
function focusBoard(sec) { if (!G || G.mode === "vs") return; const Lr = S.layoutOf(G), bi = Lr.byId[0].board; if (bi == null) return; const e = Lr.E[bi]; cam.focus = { x: e.x, z: e.z + 0.5, t: sec || 2.2 }; }
function computeHint() {
  const Lr = S.layoutOf(G), p = G.pl[me], team = p.team, cap = S.capOf(G, team);
  const mine = (e) => G.mode !== "vs" || e.team === team;
  // площадка рядом — подсказка о ней
  let near = -1, nd = 1.5;
  for (const e of Lr.E) { if (!mine(e) || !S.padVisible(G, e.i)) continue; const d = Math.hypot(p.x - e.zpad.x, p.z - e.zpad.z); if (d < nd) { nd = d; near = e.i; } }
  tipE = near;
  guideForce = false;
  // заказ: несёшь нужное — к доске; пока ни одного не сдали — всегда показываем дорогу к доске
  const bi = G.mode !== "vs" ? Lr.byId[0].board : null, con = G.con && !G.con.end ? G.con : null;
  if (G.con && !G.con.ac && !G.con.end && bi != null && G.e[bi].o && (!G.cdone || p.st.includes(G.con.it))) return { ic: ITEMS[G.con.it].id, tx: "📋 " + L("Новый заказ — подойди к доске, чтобы начать"), t: Lr.E[bi].zin };
  if (con && con.ac && bi != null && G.e[bi].o) {
    const be = Lr.E[bi];
    if (p.st.includes(con.it)) { guideForce = true; return { ic: ITEMS[con.it].id, tx: L("Неси") + " «" + L(ITEMS[con.it].n) + "» " + L("к доске заказов"), t: be.zin }; }
    const np0 = S.nextPad(G, team), afford = np0 >= 0 && G.money[team] >= S.padCost(G, np0) - G.e[np0].p;
    if (!G.cdone && !p.st.length && !afford) { guideForce = true; return { ic: ITEMS[con.it].id, tx: L("Заказ") + ": " + L(ITEMS[con.it].n) + " ×" + (con.n - con.got) + " — " + L("собери и неси к доске"), t: be.zin }; }
  }
  const bst = G.mode !== "vs" ? S.bigStage(G) : null;
  if (bst && bi != null && G.e[bi].o && p.st.includes(bst.it)) { guideForce = true; return { ic: ITEMS[bst.it].id, tx: "🚢 " + L("Неси") + " «" + L(ITEMS[bst.it].n) + "» " + L("к доске заказов"), t: Lr.E[bi].zin }; }
  let np = S.nextPad(G, team);
  // нанять в артели дешевле, чем ближайшая площадка? — подсказываем артель
  const house = Lr.hire.find((h) => Lr.E[h].team === team || G.mode !== "vs");
  let hireE = null, hc = np >= 0 ? S.padCost(G, np) - G.e[np].p : 1e18;
  if (house != null) for (const e of Lr.E) if (e.k === "helper" && mine(e) && S.canHire(G, e.i) && S.hireCost(G, e.i) < hc) { hc = S.hireCost(G, e.i); hireE = e; }
  if (hireE && hireOpen < 0) { if (G.money[team] >= hc) return { ic: "helper", tx: L("Найми в артели") + ": " + entName(hireE), t: Lr.E[house].zin }; np = -1; }
  if (hireOpen >= 0) return boardKind === "ads" ? { ic: "cash", tx: L("Выбери рекламу — нажми на карточку"), t: null } : { ic: "helper", tx: L("Выбери, кого нанять — нажми на карточку"), t: null };
  let cashSum = 0, cashE = null, cd = 1e9;
  for (const e of Lr.E) if (mine(e) && e.zcash && G.e[e.i].o && G.e[e.i].cash > 0) { cashSum += G.e[e.i].cash; const d = Math.hypot(p.x - e.zcash.x, p.z - e.zcash.z); if (d < cd) { cd = d; cashE = e; } }
  if (np >= 0) { const need = S.padCost(G, np) - G.e[np].p; const e = Lr.E[np]; if (G.money[team] >= need) return { ic: "star", tx: (e.k === "goal" ? "🗼 " : "") + L("Открой") + ": " + entName(e), t: e.zpad }; if (G.money[team] + cashSum >= need && cashE) return { ic: "cash", tx: L("Собери выручку — хватит на") + " «" + entName(e) + "»", t: cashE.zcash }; }
  else if (hireE && G.money[team] + cashSum >= hc && cashE) return { ic: "cash", tx: L("Собери выручку — хватит нанять") + " «" + entName(hireE) + "»", t: cashE.zcash };
  if (p.st.length) {
    let best = null, bd = 1e9;
    for (const e of Lr.E) { if (!mine(e) || !e.zin || e.k === "spot" || !G.e[e.i].o) continue; let ok = false; for (const it of p.st) if (S.accepts(G, e.i, it)) ok = true; if (!ok) continue; const d = Math.hypot(p.x - e.zin.x, p.z - e.zin.z) - (e.k === "board" ? 6 : 0); if (d < bd) { bd = d; best = e; } }
    if (best && (p.st.length >= cap || !G.e.some((s, i) => Lr.E[i].k === "spot" && s.o && Lr.E[i].zin && S.inZone(p, Lr.E[i].zin)))) { const it = p.st[p.st.length - 1]; return { ic: ITEMS[it].id, tx: (best.k === "stall" ? L("На прилавок") : best.k === "board" ? L("На доску заказов") : best.k === "dock" ? L("На причал") : L("Отнеси в") + " «" + entName(best) + "»"), t: best.zin }; }
    if (!best && p.st.length >= cap) return { ic: "bag", tx: L("Короб полон — всё занято, собери выручку"), t: cashE ? cashE.zcash : null };
  }
  if (cashSum > 0 && cashE && (cashSum > 40 * S.priceMul(G) || p.st.length === 0 && cd < 6)) return { ic: "cash", tx: L("Забери выручку"), t: cashE.zcash };
  // готовое на выходе цеха
  let out = null, od = 1e9;
  for (const e of Lr.E) { if (!mine(e) || !e.zout || !G.e[e.i].o || G.e[e.i].ob <= 0 || !S.hasDest(G, team, e.k === "gen" ? e.item : e.rec.out)) continue; const d = Math.hypot(p.x - e.zout.x, p.z - e.zout.z); if (d < od) { od = d; out = e; } }
  if (out && p.st.length < cap) return { ic: ITEMS[out.k === "gen" ? out.item : out.rec.out].id, tx: L("Забери") + ": " + L(ITEMS[out.k === "gen" ? out.item : out.rec.out].n), t: out.zout };
  // людей мало, а деньги есть — к рекламной тумбе
  const adE = Lr.ads.find((i) => mine(Lr.E[i]));
  if (adE != null && hireOpen < 0 && S.flowWhy(G, team) === "ads" && S.canAd(G, team, "sign") && G.money[team] >= S.adCost(G, team, "sign")) return { ic: "cash", tx: "🪧 " + L("Мало покупателей — дай рекламу у рынка"), t: Lr.E[adE].zin };
  const spot = Lr.E.find((e) => mine(e) && e.k === "spot" && G.e[e.i].o && e.def.free);
  if (spot && p.st.length < cap) return { ic: ITEMS[spot.item].id, tx: S.inZone(p, spot.zin) ? L("Стой в воде — улов сам прыгает в короб") : L("Иди на отмель ловить") + ": " + L(ITEMS[spot.item].n), t: spot.zin };
  return null;
}
let hintKey = "";
function updHint() {
  if (!G || G.winner >= 0) { $("hint").classList.add("fade"); view.guide(null); return; }
  const h = computeHint(); hintTarget = h && h.t ? h.t : null;
  const k = h ? h.ic + h.tx : "";
  if (k !== hintKey) { hintKey = k; $("hint").innerHTML = h ? `${ICONURL[h.ic] ? `<img src="${ICONURL[h.ic]}">` : ""}<span>${esc(h.tx)}</span>` : ""; }
  $("hint").classList.toggle("fade", !h);
  // площадка под ногами — подробности
  if (tipE >= 0) {
    const e = S.layoutOf(G).E[tipE], cost = S.padCost(G, tipE), left = cost - G.e[tipE].p, money = G.money[G.pl[me].team];
    const nb = (t) => esc(t).replace(/ → /g, "&nbsp;→&nbsp;").replace(/(\d) /g, "$1&nbsp;").replace(/\+ /g, "+&nbsp;");
    tipShow(`<b>${esc(entName(e))}</b><span class="d">${nb(entDesc(e))}</span><span class="c">💵 ${fmt(left)}</span>${money < left ? ` · <span class="no">${L("не хватает")} ${fmt(left - money)}</span>` : ` · ${L("постой — и оплата пойдёт")}`}`);
  } else tipShow(null);
}
function tipShow(html) { const t = $("tip"); if (!html) { t.classList.remove("show"); return; } if (t.dataset.h !== html) { t.innerHTML = html; t.dataset.h = html; } t.classList.add("show"); }
// метка у края экрана, если цель за кадром
let edgeEl = null, tagEl = null;
function drawOverlay() {
  const showGuide = G && hintTarget && (guideForce || S.progress(G, G.pl[me].team).o < 7 || idleT > 4);
  const p = view.disp.p[me];
  if (showGuide && p) view.guide({ x: p.x, z: p.z }, hintTarget); else view.guide(null);
  if (showGuide && hintTarget) {
    const s = project(hintTarget.x, 0.5, hintTarget.z);
    const off = s.x < 20 || s.x > W - 20 || s.y < 140 || s.y > H - 80 || s.z > 1;
    if (!edgeEl) { edgeEl = document.createElement("div"); edgeEl.className = "edge"; edgeEl.innerHTML = "<img>"; $("layer").appendChild(edgeEl); }
    if (off) { const cx = W / 2, cy = H / 2; let dx = s.x - cx, dy = s.y - cy; if (s.z > 1) { dx = -dx; dy = -dy; } const k = Math.min((W / 2 - 28) / Math.max(1, Math.abs(dx)), (H / 2 - 110) / Math.max(1, Math.abs(dy))); edgeEl.style.transform = `translate(${cx + dx * k}px, ${cy + dy * k}px)`; edgeEl.style.display = "grid"; const img = edgeEl.firstChild, src = $("hint").querySelector("img"); if (src && img.src !== src.src) img.src = src.src; }
    else edgeEl.style.display = "none";
  } else if (edgeEl) edgeEl.style.display = "none";
  // имя напарника над головой
  if (G && G.pl.length > 1 && view.disp.p[1 - me]) {
    const d = view.disp.p[1 - me];
    if (!tagEl) { tagEl = document.createElement("div"); tagEl.className = "tag"; $("layer").appendChild(tagEl); }
    const s = project(d.x, 2.0, d.z); tagEl.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`; tagEl.style.background = PCOL[G.mode === "vs" ? G.pl[1 - me].team : 1 - me].coat;
    setText(tagEl, partner.name || (G.mode === "vs" ? L("Соперник") : L("Напарник"))); tagEl.style.display = s.z < 1 ? "" : "none";
  } else if (tagEl) tagEl.style.display = "none";
  // подпись над площадкой, на которой стоишь
  const tip = $("tip");
  if (G && tipE >= 0) { const z = S.layoutOf(G).E[tipE].zpad, s = project(z.x, 1.0, z.z); tip.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`; }
  // новые помощники: подпись над головой, пока идут на место
  let hn = 0;
  if (G) for (let i = 0; i < G.hp.length; i++) {
    const h = G.hp[i]; if (h.born == null || G.t - h.born > 7 || G.t < h.born) continue;
    const d = view.disp.h[i]; if (!d) continue;
    const el = hTags[hn] || (hTags[hn] = Object.assign($("layer").appendChild(document.createElement("div")), { className: "tag htag" }));
    const s = project(d.x, 2.3, d.z); el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`; el.style.display = s.z < 1 ? "" : "none";
    setText(el, (G.t - h.born < 2.5 ? L("Нанят") + ": " : "→ ") + (G.t - h.born < 2.5 ? entName(S.layoutOf(G).E[h.e]) : workName(h))); hn++;
  }
  for (let i = hn; i < hTags.length; i++) hTags[i].style.display = "none";
}
const hTags = [];
function workName(h) { const Lr = S.layoutOf(G), e = Lr.E[h.e]; return e.def.role === "cashier" ? L("к прилавкам") : entName(Lr.E[e.from]); }

/* ---------- окна ---------- */
function banner(a, b, cls) { const el = $("banner"); el.className = cls || ""; const tp = $("top"); el.style.top = (tp.classList.contains("hidden") ? 90 : tp.getBoundingClientRect().bottom + 8) + "px"; el.innerHTML = esc(a) + (b ? `<small>${esc(b)}</small>` : ""); void el.offsetWidth; el.classList.add("show"); clearTimeout(banner.t); banner.t = setTimeout(() => el.classList.remove("show"), 2600); }
function toast(txt, cls, life) { const box = $("toasts"); while (box.children.length > 2) box.firstChild.remove(); const el = document.createElement("div"); el.className = "toast " + (cls || ""); el.textContent = txt; box.appendChild(el); setTimeout(() => { el.style.transition = "opacity .4s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 400); }, (life || 2.8) * 1000); }
function hideAll() { ["menu", "dlg"].forEach((id) => $(id).classList.add("hidden")); }
function dialog(html, keep) { $("dlgp").innerHTML = html; $("dlg").classList.remove("hidden"); $("dlg").dataset.keep = keep ? 1 : ""; if (joy.on) { joy.on = false; joy.x = joy.y = 0; $("joy").classList.remove("on"); } }
function hideDlg() { $("dlg").classList.add("hidden"); }
$("dlg").addEventListener("pointerdown", (e) => { if (e.target === $("dlg") && !$("dlg").dataset.keep) hideDlg(); });
function showHelp(back) {
  const I = (k) => `<img src="${ICONURL[k] || ""}">`;
  dialog(`<h2>${L("Как играть")}</h2><div class="help">
    <p>🕹 ${L("Веди пальцем по низу экрана — человек идёт. Кнопок нет: постой у круга — кольцо под ногами заполнится, и дело пойдёт. На бегу ничего не берётся и не покупается.")}</p>
    <p>${I("herring")} ${L("Зайди на отмель — рыба сама прыгает в короб за спиной.")}</p>
    <p>${I("fillet")} ${L("Встань у белого круга цеха — короб разгружается. У жёлтого — забираешь готовое.")}</p>
    <p>${I("cash")} ${L("Покупатели платят у прилавка. Зелёный круг — забери выручку.")}</p>
    <p>⭐ ${L("Встань на площадку с ценой — деньги уходят в неё, и открывается новое: цех, прилавок, улучшение.")}</p>
    <p>👷 <b>${L("Артель")}</b>: ${L("дом у старта. Подойди к дверям и выбери карточку — помощник выйдет и сам пойдёт на своё место.")}</p>
    <p>🗼 ${L("Маяк — конец бухты: выбери знак промысла (1 из 3) и плыви дальше. В каждой бухте свои товары. Якоря тратятся во «Флоте».")}</p>
    <p>👥 <b>${L("Вместе")}</b>: ${L("деньги общие, доска заказов даёт награды за сроки.")}</p>
    <p>⚔️ <b>${L("Против")}</b>: ${L("толпа общая. Покупатель, который заждался, уходит к сопернику. Кто первым зажжёт маяк — победил.")}</p></div>
    <button class="b primary" id="h-ok">${L("Понятно")}</button>`);
  $("h-ok").onclick = () => { hideDlg(); if (back) back(); };
}
function settings(back) {
  const draw = () => dialog(`<h2>⚙️ ${L("Настройки")}</h2>
    <button class="b" id="s-snd"><span>${SET.snd ? "🔊" : "🔇"}</span><span class="t">${L("Звук")}: ${SET.snd ? L("вкл") : L("выкл")}</span></button>
    <button class="b" id="s-mus"><span>🎵</span><span class="t">${L("Музыка")}: ${SET.mus ? L("вкл") : L("выкл")}</span></button>
    <button class="b" id="s-q"><span>✨</span><span class="t">${L("Графика")}: ${[L("быстрая"), L("обычная"), L("красивая")][quality]}</span></button>
    <button class="b ghost" id="s-x">${L("Готово")}</button>`);
  draw();
  const wire = () => {
    $("s-snd").onclick = () => { SET.snd = SET.snd ? 0 : 1; saveSet(); draw(); wire(); };
    $("s-mus").onclick = () => { SET.mus = SET.mus ? 0 : 1; saveSet(); draw(); wire(); };
    $("s-q").onclick = () => { quality = (quality + 1) % 3; qLock = true; applyQuality(); draw(); wire(); };
    $("s-x").onclick = () => { hideDlg(); if (back) back(); };
  };
  wire();
}
function openPause() {
  if (!started) return;
  play("click");
  dialog(`<h2>${G.mode === "vs" ? "⚔️ " + L("Матч") : L(BAYS[G.bay].n)}</h2>
    <p>${G.mode !== "vs" ? `${L("Заработано")}: ${fmt(G.earned[0])} · ${L("заказов")}: ${G.cdone} · ⭐ ${G.stars}` : ""}</p>
    <button class="b primary" id="p-go"><span>▶</span><span class="t">${L("Продолжить")}</span></button>
    ${role === "host" ? `<button class="b" id="p-inv"><span>📨</span><span class="t">${L("Ссылка другу ещё раз")}</span></button>` : ""}
    ${G.pl.length > 1 && role === "local" && G.mode !== "vs" ? "" : ""}
    ${G.done >= 0 && G.mode !== "vs" && role !== "guest" ? `<button class="b" id="p-next"><span>⛵</span><span class="t">${L("Новая бухта")}</span></button>` : ""}
    <div class="b2"><button class="b" id="p-help">❓ ${L("Как играть")}</button><button class="b" id="p-set">⚙️ ${L("Настройки")}</button></div>
    <button class="b" id="p-menu"><span>🏠</span><span class="t">${L("В меню")}<small>${L("Прогресс сохранится")}</small></span></button>`);
  $("p-go").onclick = () => hideDlg();
  if ($("p-inv")) $("p-inv").onclick = () => sendInvite();
  if ($("p-next")) $("p-next").onclick = () => bayDone();
  $("p-help").onclick = () => showHelp(openPause);
  $("p-set").onclick = () => settings(openPause);
  $("p-menu").onclick = () => { hideDlg(); toMenu(); };
}
function partnerMenu() {
  if (!started || G.pl.length < 2) return;
  if (role === "host" && !partner.online && !partner.bot) return waitFriend();
  toast(partner.bot ? L("Играет бот") : room ? (room.link === "p2p" ? L("Прямая связь") : L("Связь через сервер")) + (room.rtt ? " · " + room.rtt + L("мс") : "") : "");
}

/* ---------- сохранение ---------- */
function slotOf() {
  if (start.slot) return start.slot;
  if (role === "guest") return G.mode === "vs" ? null : "guest";
  if (G.mode === "solo") return "solo";
  if (G.mode === "vs") return G.winner >= 0 ? null : "vs";
  return "coop";
}
function save(force) {
  if (!G || !started) return;
  const sl = slotOf(); if (!sl) return;
  try { SV.save(sl, G, { role, room: room ? room.id : "", me, partner: partner.bot ? "" : (partner.name || "").slice(0, 24), skill: G.botSkill || "" }, force); } catch (e) { console.warn("save", e); }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(true); });
addEventListener("pagehide", () => save(true));
function closeConfirm(on) { try { const tg = T.tg; if (!tg) return; if (on) tg.enableClosingConfirmation && tg.enableClosingConfirmation(); else tg.disableClosingConfirmation && tg.disableClosingConfirmation(); } catch (_) {} }
function setupBack() { const tg = T.tg; if (!tg || !tg.BackButton) return; try { tg.BackButton.show(); tg.BackButton.onClick(onBack); } catch (_) {} }
function onBack() {
  play("click");
  if (started && G) {
    save(true);
    if (!$("dlg").classList.contains("hidden") && !$("dlg").dataset.keep) { hideDlg(); return; }
    if (!$("dlg").classList.contains("hidden") && (G.winner >= 0)) { toMenu(); return; }
    dialog(`<h2>${L("Выйти в меню?")}</h2><p>${L("Прогресс сохранён.")}${role === "host" || role === "guest" ? " " + L("Вернуться к другу можно из меню.") : ""}</p>
      <button class="b primary" id="bk-stay"><span>▶</span><span class="t">${L("Остаться")}</span></button><button class="b" id="bk-menu"><span>🏠</span><span class="t">${L("В меню")}</span></button>`);
    $("bk-stay").onclick = () => hideDlg();
    $("bk-menu").onclick = () => { hideDlg(); toMenu(); };
    return;
  }
  if (!$("dlg").classList.contains("hidden")) { hideDlg(); if (role !== "menu") showMenu(); return; }
  if (document.getElementById("lobby") && !document.getElementById("lobby").classList.contains("hidden")) { try { Lobby.current && Lobby.current.close(); } catch (_) {} Lobby.hide(); showMenu(); return; }
  location.href = "../";
}

/* ---------- связь у гостя ---------- */
let netNoteT = 0, netBad = false;
function netNote(txt, cls) {
  let el = $("netw"); if (!el) { el = document.createElement("div"); el.id = "netw"; document.body.appendChild(el); }
  el.textContent = txt; el.className = txt ? "show " + (cls || "") : "";
  clearTimeout(netNoteT); if (txt && cls === "good") netNoteT = setTimeout(() => netNote(""), 2500);
}
function netWatch() {
  if (!gs || !started || role !== "guest") return;
  const q = gs.silence();
  if (q > 2.5 && partner.online) { if (!netBad) { netBad = true; netNote("📶 " + L("Связь с хозяином прервалась — переподключаемся…"), "bad"); } }
  else if (netBad && q < 1) { netBad = false; netNote(L("Связь восстановлена"), "good"); }
}

/* ---------- главный цикл ---------- */
let last = 0, fpsAcc = 0, fpsN = 0, fpsCheck = 0, ambT = 0, stepSnd = 0;
const fpsEl = QS.get("fps") ? Object.assign(document.body.appendChild(document.createElement("div")), { id: "fps" }) : null;
let fpsT = 0, fpsC = 0;
window.__perf = { frames: [] };
const TFPS = +QS.get("tfps") || 0;
function loop(now) {
  // запись ролика: кадры идут строго по шагу, не по часам (window.__manual + __pm.frame)
  if (!loop.forced) { if (TFPS) setTimeout(() => loop(performance.now()), 1000 / TFPS); else requestAnimationFrame(loop); if (window.__manual) return; }
  const rdt = loop.forced || Math.min(0.1, (now - (last || now)) / 1000); last = now;
  const dt = Math.min(0.05, rdt);
  clock += dt;
  if (document.hidden) return;
  let ctx;
  if (started && G) {
    tick(dt);
    if (G.winner >= 0 && G.mode === "vs" && !lastEnd) onGoal({ team: G.winner, time: G.goal === "time" });
    const p = role === "guest" ? gloc : G.pl[me];
    const dl = role === "guest" ? gtm : G.pl[me];
    ctx = { me, cam, local: role === "guest" ? gloc : { x: G.pl[me].x, z: G.pl[me].z, dir: G.pl[me].dir }, hot: tipE, remoteK: role === "guest" ? 10 : 16, dwell: dl.dwK > 0 && dl.dwK < 1 && dl.dwZ ? { z: dl.dwZ, k: dl.dwK, pad: dl.dwKind === "pad" } : null };
    // камера: за игроком, чуть вперёд по ходу
    const d = view.disp.p[me];
    let tx = (d ? d.x : p.x) - Math.sin(YAW) * 0.8, tz = (d ? d.z : p.z) - Math.cos(YAW) * 0.8;
    if (cam.focus) { cam.focus.t -= dt; if (cam.focus.t <= 0 || (joy.on && cam.focus.t < 1.6)) cam.focus = null; else { tx = cam.focus.x; tz = cam.focus.z; } }
    const ce = 1 - Math.exp(-dt * 3.6); cam.x += (tx - cam.x) * ce; cam.z += (tz - cam.z) * ce;
    cam.dist += (camDist() * (cam.zk || 1) + Math.min(4, (G.pl[me].st.length || 0) * 0.08) - cam.dist) * Math.min(1, dt * 2);
    hudT += dt; if (hudT > 0.1) { hudT = 0; updAuto(0.1); updHud(); updHint(); updHire(); netWatch(); }
    const nd = role === "guest" ? gtm : G.pl[me];
    if (nd.noDest != null) { noDest(nd.noDest); nd.noDest = null; }
    saveT += dt; if (saveT > 5) { saveT = 0; save(false); }
    // шаги по снегу
    if (G.pl[me].mv) { stepSnd += dt * (2.2 + G.pl[me].mv); if (stepSnd > 1) { stepSnd = 0; play(["step1", "step2", "step3"][(Math.random() * 3) | 0], { vol: 0.16, gap: 0.15 }); } }
  } else {
    // меню: бухта живёт сама, камера плывёт над рынком
    stepDemo(dt);
    G = null;
    cam.x = -2 + Math.sin(clock * 0.07) * 6; cam.z = 1 + Math.sin(clock * 0.05) * 3; cam.dist = camDist() * 1.1;
    ctx = { me: 0, cam, local: null, hot: -1 };
  }
  const g = started && G ? G : demo;
  if (started && G) world.sync(G, true);     // постройки — ровно те, что открыты (у гостя тоже)
  if (window.__noRender) return;     // автотесты: мир считается, картинка — нет
  world.update(dt, g);
  view.update(g, dt, ctx);
  placeCamera(dt);
  if (started && G) { drawFloats(dt); drawOverlay(); } else view.guide(null);
  // фон: ветер всегда, огонь у коптильни, чайки и волны у воды
  ambT += dt;
  if (ambT > 0.25) {
    ambT = 0; const Lr = S.layoutOf(g); let fire = 0;
    for (const e of Lr.E) if (e.def.model === "smokehouse" && g.e[e.i].o) fire = Math.max(fire, 1 - Math.hypot(e.x - cam.x, e.z - cam.z) / 9);
    const sea = Math.max(0, 1 - Math.abs(cam.z - S.shoreZ(Lr, cam.x)) / 14);
    ambience({ amb_wind: 0.55 + 0.25 * sea, fire });
    if (Math.random() < 0.02 * sea) play(Math.random() < 0.5 ? "gull1" : "gull2", { vol: 0.18 + Math.random() * 0.15 });
    if (Math.random() < 0.03 * sea) play(Math.random() < 0.5 ? "wave1" : "wave2", { vol: 0.15 + sea * 0.2 });
  }
  renderer.render(scene, camera);
  if (started) {
    fpsAcc += rdt; fpsN++; fpsCheck += rdt;
    if (window.__perf.frames.length < 3000) window.__perf.frames.push(rdt * 1000);
    if (fpsCheck > 5) { const fps = fpsN / fpsAcc; fpsAcc = fpsN = fpsCheck = 0; if (fps < 38 && quality > 0 && !qLock) { quality--; applyQuality(); toast(L("Графика упрощена для плавности")); } }
  }
  if (fpsEl) { fpsC++; if (now - fpsT > 500) { fpsEl.textContent = `${Math.round(fpsC * 1000 / (now - fpsT))} fps · ${renderer.info.render.calls} dc · ${Math.round(renderer.info.render.triangles / 1000)}k tri · q${quality}`; fpsC = 0; fpsT = now; } }
}

/* ---------- для автотестов и отладки ---------- */
window.__pm = {
  get G() { return G; }, get role() { return role; }, get me() { return me; }, get started() { return started; }, get room() { return room; }, get hs() { return hs; }, get gs() { return gs; }, get partner() { return partner; }, get view() { return view; },
  S, cam, renderer, project, camera, scene, get world() { return world; },
  solo: () => { soloMenu(); return true; }, coopBot: (bay, o) => { start("local", S.newGame(Object.assign({ mode: "coop", seed: 77, meta: prof.meta, diff: 1, bay: bay || 0 }, o || {})), 0, { bot: 1 }); return true; },
  bayDone: () => bayDone(), zoom: (k) => { cam.zk = k; }, fleet: () => fleetMenu(), get prof() { return prof; }, doOp,
  vsBot: (goal) => { start("local", S.newGame({ mode: "vs", seed: 77, goal: goal || "light" }), 0, { bot: 1 }); return true; },
  host: (mode, bay) => { hostGame(S.newGame({ mode: mode || "coop", seed: 99, meta: prof.meta, diff: 1, bay: bay || 0 })); return true; },
  join: (id) => { joinGame(id); return true; },
  money: (v) => { G.money[G.pl[me].team] = v; },
  open: (id) => { const Lr = S.layoutOf(G); S.forceOpen(G, Lr.byId[G.pl[me].team][id]); world.sync(G, true); },
  tp: (x, z) => { if (role === "guest") { gloc.x = x; gloc.z = z; } G.pl[me].x = x; G.pl[me].z = z; },
  ff: (sec) => { if (role === "guest") return; for (let t = 0; t < sec; t += 1 / 30) { if (bot) { const b = bot.tick(G, 1 / 30); S.movePlayer(G, bot.pi, b.x, b.z, 1 / 30); } S.step(G, 1 / 30); } const evs = G.ev; G.ev = []; if (hs) hs.events(evs.filter((e) => e.t === "open" || e.t === "upg")); world.sync(G, false); },
  autoBot: (on) => { window.__autoBot = on ? makeBot(me, { seed: 11 }) : null; },
  quality: (q) => { quality = q; qLock = true; applyQuality(); }, banner, toast,
  frame: (dt) => { loop.forced = dt; try { loop(performance.now()); } finally { loop.forced = 0; } }, menu: () => toMenu(), save: () => save(true),
};
// автопилот для тестов: бот ведёт своего игрока
setInterval(() => { if (window.__autoBot && G && started) { const b = window.__autoBot.tick(G, 0.05); window.__auto = b; } else if (!window.__autoBot) window.__auto = null; }, 50);
boot().catch((e) => { console.error(e); loadtx.textContent = L("Не удалось загрузить: ") + (e && e.message || e); });
