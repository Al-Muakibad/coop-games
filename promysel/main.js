// «Промысел» — склейка: загрузка, камера, джойстик, режимы (один / вместе / друг против друга; хозяин / гость / бот),
// HUD, события → эффекты и звук, сохранения, кнопка «Назад».
import * as THREE from "three";
import * as S from "./sim.js";
import { ITEMS, IT, UPG, BAYS, DIFF, VS_GOALS, PERKS, recText } from "./data.js";
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
  camera.position.set(cam.x + sx, Math.sin(cam.pitch) * d, cam.z + Math.cos(cam.pitch) * d);
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
// мир строится под раскладку (вместе/против) и тему бухты
function ensureWorld(mode, theme) {
  const key = (mode === "vs" ? "vs" : "coop") + ":" + theme;
  if (worldKey === key && world) return;
  if (view) view.dispose(); if (world) world.dispose();
  world = new World(scene, renderer, { quality, mode, theme });
  view = new View(scene, world, { mode, quality });
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
  ensureWorld("coop", 0);
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
  const Ld = S.layout("coop");
  for (const id of ["table1", "stall_fillet", "fisher1", "runner1", "wood", "smoke", "stall_smoked", "table2", "woodman", "fisher2", "runner2", "runner3", "cashier", "pier", "steak", "stall_steak", "fisher3", "runner4", "caviar", "stall_caviar", "fisher4", "runner5"]) S.forceOpen(demo, Ld.byId[0][id]);
  for (let i = 0; i < 5; i++) { S.forceOpen(demo, Ld.byId[0].bag); S.forceOpen(demo, Ld.byId[0].crew); S.forceOpen(demo, Ld.byId[0].crewspd); }
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
  ensureWorld("coop", 0); world.sync(demo, false);
  const sv = {}; for (const k of SV.SLOTS) sv[k] = SV.peek(k);
  const order = SV.SLOTS.filter((k) => sv[k]).sort((a, b) => (sv[b].t || 0) - (sv[a].t || 0));
  const resBtn = (k, primary) => { const q = sv[k]; const [a, b] = SLOT_UI[k](q); const sum = q.sum || {}; return `<button class="b ${primary ? "primary" : ""}" data-slot="${k}"><span>▶</span><span class="t">${a}<small>${b}${sum.o ? " · " + L("открыто") + " " + sum.o : ""}${sum.earned ? " · " + fmt(sum.earned) : ""}</small></span></button>`; };
  const pk = prof.perks, perkN = (pk.p_cap || 0) + (pk.p_spd || 0) + (pk.p_price || 0);
  $("menup").innerHTML = `
    ${order.length ? resBtn(order[0], true) : ""}
    <button class="b ${order.length ? "" : "primary"}" id="m-coop"><span>👥</span><span class="t">${L("Вместе")}<small>${L("Одна бухта на двоих: общие деньги, заказы, маяк")}</small></span></button>
    <button class="b ice" id="m-vs"><span>⚔️</span><span class="t">${L("Друг против друга")}<small>${L("Две лавки, одна толпа: кто быстрее обслужит")}</small></span></button>
    <button class="b" id="m-solo"><span>🙋</span><span class="t">${L("Одному")}<small>${L("Своя бухта — долгая прокачка")}</small></span></button>
    ${order.slice(1).map((k) => resBtn(k)).join("")}
    <div class="b2"><button class="b ghost" id="m-help">❓ ${L("Как играть")}</button><button class="b ghost" id="m-set">⚙️ ${L("Настройки")}</button><button class="b ghost" id="m-games">🎮 ${L("Игры")}</button></div>
    ${perkN || prof.vsWin || prof.bays ? `<p style="margin:6px 0 0;font-size:12.5px">${prof.bays ? "⭐ " + L("Бухт пройдено") + ": " + prof.bays + " · " : ""}${perkN ? "🎖 " + L("Знаков промысла") + ": " + perkN + " · " : ""}${prof.vsWin ? "🏆 " + L("Побед") + ": " + prof.vsWin : ""}</p>` : ""}`;
  $("menup").querySelectorAll("[data-slot]").forEach((b) => (b.onclick = () => resumeSlot(b.dataset.slot)));
  $("m-coop").onclick = () => coopMenu();
  $("m-vs").onclick = () => vsMenu();
  $("m-solo").onclick = () => guardSlot("solo", () => soloMenu());
  $("m-help").onclick = () => showHelp();
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
function soloMenu() { const g = S.newGame({ mode: "solo", seed: (Math.random() * 1e9) | 0, bay: 0, perks: prof.perks, diff: 1 }); start("local", g, 0); }
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
    $("c-inv").onclick = () => guardSlot("coop", () => { hideDlg(); hostGame(S.newGame({ mode: "coop", seed: (Math.random() * 1e9) | 0, perks: prof.perks, diff })); });
    $("c-bot").onclick = () => guardSlot("coop", () => { hideDlg(); start("local", S.newGame({ mode: "coop", seed: (Math.random() * 1e9) | 0, perks: prof.perks, diff }), 0, { bot: 1 }); });
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
  if (!s) { toast(L("Сохранение не найдено"), "bad"); showMenu(); return; }
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
  ensureWorld(G.mode, BAYS[G.bay || 0].theme);
  world.sync(G, false);
  view.disp = { p: [], h: [], c: new Map() };
  const p = G.pl[me]; gloc.x = p.x; gloc.z = p.z; gloc.dir = p.dir;
  cam.x = p.x; cam.z = p.z - 1; cam.dist = camDist();
  music(G.mode === "vs" ? "m_town" : "m_shanty");
  St.gameStart({ mode: G.mode, role: r, bay: G.bay, resume: G.t > 5 ? 1 : 0 });
  // доход, пока игры не было
  if (opt.away > 60 && r !== "guest") { const got = S.offline(G, opt.away); if (got > 0) { G.money[0] += got; setTimeout(() => banner(L("Пока тебя не было") + ": +" + fmt(got), L("Помощники работали и торговали"), "gold"), 700); } }
  if (G.t < 2) setTimeout(() => banner(G.mode === "vs" ? (me === 0 ? L("Твоя лавка — слева") : L("Твоя лавка — справа")) : BAYS[G.bay].n, G.mode === "vs" ? (G.goal === "time" ? L("10 минут: у кого больше выручка") : L("Первым зажги маяк")) : L("Заходи в воду — рыба сама прыгнет в короб")), 500);
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
    if (e.target.closest && e.target.closest(".btn, button, .panel")) return;
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
}
function stick() {
  let x = joy.x, z = joy.y;
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), kz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (kx || kz) { x = kx; z = kz; }
  if (window.__auto) { x = window.__auto.x; z = window.__auto.z; }
  const m = Math.hypot(x, z); if (m > 1) { x /= m; z /= m; }
  // мёртвая зона и плавный разгон
  if (m < 0.12) return { x: 0, z: 0 };
  return { x, z };
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
const L_ = () => S.layout(G.mode);
function camNear(x, z, r) { return Math.hypot(x - cam.x, z - cam.z) < (r || 13); }
function vol(x, z, base) { const d = Math.hypot(x - cam.x, (z - cam.z) * 0.8); return Math.max(0, Math.min(1, 1.2 - d / 13)) * (base == null ? 1 : base); }
let padFlyT = {};
function onEvents(list, remote) {
  if (!G || !view) return;
  const Lr = L_();
  for (const e of list) {
    const isMe = e.a === "p" + me;
    if (remote && isMe && (e.t === "catch" || e.t === "drop" || e.t === "pick" || e.t === "padpay" || e.t === "cash")) continue;   // свои — уже показаны
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
        const z = en.k === "pier" ? { x: en.pier.x, z: (en.pier.z0 + en.pier.z1) / 2 } : en.zpad;
        const mine = G.mode !== "vs" || en.team === G.pl[me].team;
        if (camNear(z.x, z.z, 18)) { view.burst(z.x, 0.6, z.z, "conf", 46); view.burst(z.x, 0.2, z.z, "snow", 14); cam.shake = 0.25; }
        if (mine) {
          play("levelup", { vol: 0.8 }); setTimeout(() => play("build", { vol: 0.6 }), 150); haptic("notify", "success", true);
          const nm = entName(en);
          if (en.k === "goal") break;
          banner(en.k === "helper" ? L("Нанят") + ": " + nm : L("Открыто") + ": " + nm, entDesc(en), "");
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
        if (e.s === "new") { play("bell", { vol: 0.6 }); toast("📋 " + L("Новый заказ на доске!"), "gold"); }
        else if (e.s === "done") { play("levelup"); banner(L("Заказ выполнен!") + " +" + fmt(e.amt), L("Награда — у доски заказов"), "gold"); haptic("notify", "success", true); }
        else { play("error"); toast(L("Заказ сорван — не успели"), "bad"); }
        break;
      case "switch": { const to = Lr.E[e.e]; if (G.mode === "vs") { if (to.team === G.pl[me].team) toast("😊 " + L("Покупатель перешёл к тебе"), "good"); else toast("💢 " + L("Покупатель ушёл к сопернику"), "bad"); } break; }
      case "goal": onGoal(e); break;
    }
  }
}
function upgText(u, lv) { const v = UPG[u].v(lv); if (u === "bag" || u === "crew") return v + " " + L("мест"); if (u === "boots" || u === "crewspd") return L("скорость") + " +" + Math.round((v / UPG[u].v(0) - 1) * 100) + "%"; if (u === "net") return L("ловля") + " +" + Math.round((UPG[u].v(0) / v - 1) * 100) + "%"; return ""; }
function entName(e) { if (e.k === "upg") return L(UPG[e.def.u].n); return L(e.def.n || e.id); }
function entDesc(e) {
  if (e.k === "proc") return e.rec.in.map((i) => L(ITEMS[i].n)).join(" + ") + " → " + L(ITEMS[e.rec.out].n);
  if (e.k === "helper") { if (e.def.role === "cashier") return L("Сам собирает выручку с прилавков"); const s = S.layout(G.mode).E[e.from], to = e.to.map((i) => entName(S.layout(G.mode).E[i])).join(" / "); return (s.k === "spot" ? L("Ловит") + ": " + L(ITEMS[s.item].n) : L("Носит") + ": " + L(ITEMS[s.k === "gen" ? s.item : s.rec.out].n)) + " → " + to; }
  if (e.k === "stall") return L("Покупатели платят за") + " «" + L(ITEMS[e.item].n) + "»: " + fmt(S.itemPrice(G, e.item)) + " " + L("за штуку");
  if (e.k === "gen") return L("Сам заготавливает") + ": " + L(ITEMS[e.item].n);
  if (e.k === "pier") return L("В конце мостков ловится лосось");
  if (e.k === "dock") return L("Судно увозит консервы и ящики улова — платит щедро");
  if (e.k === "goal") return G.mode === "vs" ? L("Зажги первым — победа") : L("Маяк зажжён — бухта пройдена");
  if (e.k === "upg") { const lv = G.upg[e.team][e.def.u]; return L(UPG[e.def.u].d) + ": " + upgText(e.def.u, lv) + " → " + upgText(e.def.u, lv + 1); }
  return "";
}
function onGoal(e) {
  const team = e.team, mine = G.mode !== "vs" || team === G.pl[me].team;
  const en = S.layout(G.mode).E.find((x) => x.k === "goal" && x.team === team);
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
function bayDone() {
  if (role === "guest") { banner(L("Маяк зажжён!"), L("Хозяин выбирает знак промысла и новую бухту"), "gold"); return; }
  prof.bays = Math.max(prof.bays || 0, G.bay + 1); prof.stars = (prof.stars || 0) + (G.stars || 0); SV.saveProfile(prof);
  const next = G.bay + 1 < BAYS.length ? BAYS[G.bay + 1] : null;
  dialog(`<h2>🗼 ${L("Маяк зажжён!")}</h2><p>${L(BAYS[G.bay].n)} ${L("пройдена за")} ${Math.floor(G.t / 60)} ${L("мин")}. ${L("Выбери знак промысла — он останется навсегда:")}</p>
    <div class="perks">${PERKS.map((p) => `<button class="b" data-p="${p.id}"><span>🎖</span><span class="t">${L(p.n)}<small>${L("сейчас")}: ${prof.perks[p.id] || 0}</small></span></button>`).join("")}</div>`, true);
  $("dlgp").querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => {
    prof.perks[b.dataset.p] = (prof.perks[b.dataset.p] || 0) + 1; SV.saveProfile(prof); play("perk");
    dialog(`<h2>${L("Дальше")}</h2><p>${next ? L("Новая бухта: больше покупателей, дороже товар, всё строим заново — но со знаками промысла.") : L("Это была последняя бухта. Можно начать её заново с новыми знаками.")}</p>
      <button class="b primary" id="n-go"><span>⛵</span><span class="t">${next ? L(next.n) : L(BAYS[G.bay].n)}</span></button><button class="b" id="n-stay"><span>🏝</span><span class="t">${L("Остаться в этой бухте")}</span></button>`, true);
    $("n-go").onclick = () => { hideDlg(); const g = S.newGame({ mode: G.mode, seed: (Math.random() * 1e9) | 0, bay: next ? G.bay + 1 : G.bay, perks: prof.perks, diff: G.diff }); const wasBot = !!bot; const r = role; start(r, g, 0, { bot: wasBot }); if (hs) hs.go(); };
    $("n-stay").onclick = () => hideDlg();
  }));
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
  // заказ
  const ce = $("con");
  if (G.con && G.mode !== "vs") {
    ce.classList.remove("hidden"); const c = G.con;
    const html = `<img src="${ICONURL[ITEMS[c.it].id]}"><div class="ct"><span>📋 ${L("Заказ")}: ${L(ITEMS[c.it].n)} <b>${c.got}/${c.n}</b></span><div class="cbar"><i style="width:${Math.max(0, c.t / c.T * 100).toFixed(1)}%"></i></div></div><span>${c.end ? (c.ok ? "✅" : "❌") : Math.ceil(Math.max(0, c.t)) + L("с")}</span>`;
    if (ce.dataset.h !== html) { ce.innerHTML = html; ce.dataset.h = html; }
    ce.classList.toggle("late", c.t < c.T * 0.25 && !c.end); ce.classList.toggle("ok", !!(c.end && c.ok));
  } else ce.classList.add("hidden");
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
let hintTarget = null, tipE = -1;
function computeHint() {
  const Lr = S.layout(G.mode), p = G.pl[me], team = p.team, cap = S.capOf(G, team);
  const mine = (e) => G.mode !== "vs" || e.team === team;
  // площадка рядом — подсказка о ней
  let near = -1, nd = 2.6;
  for (const e of Lr.E) { if (!mine(e) || !S.padVisible(G, e.i)) continue; const d = Math.hypot(p.x - e.zpad.x, p.z - e.zpad.z); if (d < nd) { nd = d; near = e.i; } }
  tipE = near;
  const np = S.nextPad(G, team);
  let cashSum = 0, cashE = null, cd = 1e9;
  for (const e of Lr.E) if (mine(e) && e.zcash && G.e[e.i].o && G.e[e.i].cash > 0) { cashSum += G.e[e.i].cash; const d = Math.hypot(p.x - e.zcash.x, p.z - e.zcash.z); if (d < cd) { cd = d; cashE = e; } }
  if (np >= 0) { const need = S.padCost(G, np) - G.e[np].p; const e = Lr.E[np]; if (G.money[team] >= need) return { ic: "star", tx: L("Открой") + ": " + entName(e), t: e.zpad }; if (G.money[team] + cashSum >= need && cashE) return { ic: "cash", tx: L("Собери выручку — хватит на") + " «" + entName(e) + "»", t: cashE.zcash }; }
  if (p.st.length) {
    let best = null, bd = 1e9;
    for (const e of Lr.E) { if (!mine(e) || !e.zin || e.k === "spot" || !G.e[e.i].o) continue; let ok = false; for (const it of p.st) if (S.accepts(G, e.i, it)) ok = true; if (!ok) continue; const d = Math.hypot(p.x - e.zin.x, p.z - e.zin.z) - (e.k === "board" ? 6 : 0); if (d < bd) { bd = d; best = e; } }
    if (best && (p.st.length >= cap || !G.e.some((s, i) => Lr.E[i].k === "spot" && s.o && Lr.E[i].zin && S.inZone(p, Lr.E[i].zin)))) { const it = p.st[p.st.length - 1]; return { ic: ITEMS[it].id, tx: (best.k === "stall" ? L("На прилавок") : best.k === "board" ? L("На доску заказов") : best.k === "dock" ? L("На причал") : L("Отнеси в") + " «" + entName(best) + "»"), t: best.zin }; }
    if (!best && p.st.length >= cap) return { ic: "bag", tx: L("Короб полон — всё занято, собери выручку"), t: cashE ? cashE.zcash : null };
  }
  if (cashSum > 0 && cashE && (cashSum > 40 * S.priceMul(G) || p.st.length === 0 && cd < 6)) return { ic: "cash", tx: L("Забери выручку"), t: cashE.zcash };
  // готовое на выходе цеха
  let out = null, od = 1e9;
  for (const e of Lr.E) { if (!mine(e) || !e.zout || !G.e[e.i].o || G.e[e.i].ob <= 0) continue; const d = Math.hypot(p.x - e.zout.x, p.z - e.zout.z); if (d < od) { od = d; out = e; } }
  if (out && p.st.length < cap) return { ic: ITEMS[out.k === "gen" ? out.item : out.rec.out].id, tx: L("Забери") + ": " + L(ITEMS[out.k === "gen" ? out.item : out.rec.out].n), t: out.zout };
  const spot = Lr.E.find((e) => mine(e) && e.k === "spot" && G.e[e.i].o && e.item === IT.herring);
  if (spot && p.st.length < cap) return { ic: "herring", tx: S.inZone(p, spot.zin) ? L("Стой в воде — рыба прыгает в короб") : L("Иди на отмель ловить рыбу"), t: spot.zin };
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
    const e = S.layout(G.mode).E[tipE], cost = S.padCost(G, tipE), left = cost - G.e[tipE].p, money = G.money[G.pl[me].team];
    tipShow(`<b>${esc(entName(e))}</b>${esc(entDesc(e))}<br><span class="c">💵 ${fmt(left)}</span>${money < left ? ` · <span class="no">${L("не хватает")} ${fmt(left - money)}</span>` : ` · ${L("стой на месте — оплата")}`}`);
  } else tipShow(null);
}
function tipShow(html) { const t = $("tip"); if (!html) { t.classList.remove("show"); return; } if (t.dataset.h !== html) { t.innerHTML = html; t.dataset.h = html; } t.classList.add("show"); }
// метка у края экрана, если цель за кадром
let edgeEl = null, tagEl = null;
function drawOverlay() {
  const showGuide = G && hintTarget && (S.progress(G, G.pl[me].team).o < 7 || idleT > 4);
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
}

/* ---------- окна ---------- */
function banner(a, b, cls) { const el = $("banner"); el.className = cls || ""; el.innerHTML = esc(a) + (b ? `<small>${esc(b)}</small>` : ""); void el.offsetWidth; el.classList.add("show"); clearTimeout(banner.t); banner.t = setTimeout(() => el.classList.remove("show"), 2600); }
function toast(txt, cls, life) { const box = $("toasts"); while (box.children.length > 2) box.firstChild.remove(); const el = document.createElement("div"); el.className = "toast " + (cls || ""); el.textContent = txt; box.appendChild(el); setTimeout(() => { el.style.transition = "opacity .4s"; el.style.opacity = "0"; setTimeout(() => el.remove(), 400); }, (life || 2.8) * 1000); }
function hideAll() { ["menu", "dlg"].forEach((id) => $(id).classList.add("hidden")); }
function dialog(html, keep) { $("dlgp").innerHTML = html; $("dlg").classList.remove("hidden"); $("dlg").dataset.keep = keep ? 1 : ""; if (joy.on) { joy.on = false; joy.x = joy.y = 0; $("joy").classList.remove("on"); } }
function hideDlg() { $("dlg").classList.add("hidden"); }
$("dlg").addEventListener("pointerdown", (e) => { if (e.target === $("dlg") && !$("dlg").dataset.keep) hideDlg(); });
function showHelp(back) {
  const I = (k) => `<img src="${ICONURL[k] || ""}">`;
  dialog(`<h2>${L("Как играть")}</h2><div class="help">
    <p>🕹 ${L("Веди пальцем по низу экрана — человек идёт. Кнопок нет: всё делается, когда стоишь рядом.")}</p>
    <p>${I("herring")} ${L("Зайди на отмель — рыба сама прыгает в короб за спиной.")}</p>
    <p>${I("fillet")} ${L("Встань у белого круга цеха — короб разгружается. У жёлтого — забираешь готовое.")}</p>
    <p>${I("cash")} ${L("Покупатели платят у прилавка. Зелёный круг — забери выручку.")}</p>
    <p>⭐ ${L("Встань на площадку с ценой — деньги уходят в неё, и открывается новое: цех, прилавок, помощник, улучшение.")}</p>
    <p>👥 <b>${L("Вместе")}</b>: ${L("деньги общие, доска заказов даёт награды за сроки. Цель — маяк, потом новая бухта со знаком промысла.")}</p>
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
  if (TFPS) setTimeout(() => loop(performance.now()), 1000 / TFPS); else requestAnimationFrame(loop);
  const rdt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
  const dt = Math.min(0.05, rdt);
  clock += dt;
  if (document.hidden) return;
  let ctx;
  if (started && G) {
    tick(dt);
    if (G.winner >= 0 && G.mode === "vs" && !lastEnd) onGoal({ team: G.winner, time: G.goal === "time" });
    const p = role === "guest" ? gloc : G.pl[me];
    ctx = { me, cam, local: role === "guest" ? gloc : { x: G.pl[me].x, z: G.pl[me].z, dir: G.pl[me].dir }, hot: tipE, remoteK: role === "guest" ? 10 : 16 };
    // камера: за игроком, чуть вперёд по ходу
    const d = view.disp.p[me];
    const tx = (d ? d.x : p.x), tz = (d ? d.z : p.z) - 0.8;
    cam.x += (tx - cam.x) * Math.min(1, dt * 5); cam.z += (tz - cam.z) * Math.min(1, dt * 5);
    cam.dist += (camDist() + Math.min(4, (G.pl[me].st.length || 0) * 0.08) - cam.dist) * Math.min(1, dt * 2);
    hudT += dt; if (hudT > 0.1) { hudT = 0; updHud(); updHint(); netWatch(); }
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
  if (window.__noRender) return;     // автотесты: мир считается, картинка — нет
  world.update(dt, g);
  view.update(g, dt, ctx);
  placeCamera(dt);
  if (started && G) { drawFloats(dt); drawOverlay(); } else view.guide(null);
  // фон: ветер всегда, огонь у коптильни, чайки и волны у воды
  ambT += dt;
  if (ambT > 0.25) {
    ambT = 0; const Lr = S.layout(g.mode); let fire = 0;
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
  solo: () => { soloMenu(); return true; }, coopBot: () => { start("local", S.newGame({ mode: "coop", seed: 77, perks: prof.perks, diff: 1 }), 0, { bot: 1 }); return true; },
  vsBot: (goal) => { start("local", S.newGame({ mode: "vs", seed: 77, goal: goal || "light" }), 0, { bot: 1 }); return true; },
  host: (mode) => { hostGame(S.newGame({ mode: mode || "coop", seed: 99, perks: prof.perks, diff: 1 })); return true; },
  join: (id) => { joinGame(id); return true; },
  money: (v) => { G.money[G.pl[me].team] = v; },
  open: (id) => { const Lr = S.layout(G.mode); S.forceOpen(G, Lr.byId[G.pl[me].team][id]); world.sync(G, true); },
  tp: (x, z) => { if (role === "guest") { gloc.x = x; gloc.z = z; } G.pl[me].x = x; G.pl[me].z = z; },
  ff: (sec) => { if (role === "guest") return; for (let t = 0; t < sec; t += 1 / 30) { if (bot) { const b = bot.tick(G, 1 / 30); S.movePlayer(G, bot.pi, b.x, b.z, 1 / 30); } S.step(G, 1 / 30); } const evs = G.ev; G.ev = []; if (hs) hs.events(evs.filter((e) => e.t === "open" || e.t === "upg")); world.sync(G, false); },
  autoBot: (on) => { window.__autoBot = on ? makeBot(me, { seed: 11 }) : null; },
  quality: (q) => { quality = q; qLock = true; applyQuality(); }, banner, toast, menu: () => toMenu(), save: () => save(true),
};
// автопилот для тестов: бот ведёт своего игрока
setInterval(() => { if (window.__autoBot && G && started) { const b = window.__autoBot.tick(G, 0.05); window.__auto = b; } else if (!window.__autoBot) window.__auto = null; }, 50);
boot().catch((e) => { console.error(e); loadtx.textContent = L("Не удалось загрузить: ") + (e && e.message || e); });
