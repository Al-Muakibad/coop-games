// «Хутор» — кооп-колония на двоих. Склейка: загрузка, камера, касания, режимы (один / с ботом / хозяин / гость), HUD, события → эффекты и звук.
import * as THREE from "three";
import * as S from "./sim.js";
import { CARDS, CATS, FAM, RECIPES, RNAME, PACKS, PACK_LOCK, QUESTS, ROLES, ROLE_IDS, DAY_LEN, CW, CH, REGIONS, BRIDGE, SITE_POS, BOSS_DAY, STACK_DY } from "./data.js";
import { loadKit } from "./kit.js";
import { buildAtlas, buildUiAtlas, iconURL, cardURL } from "./atlas.js";
import { World, U, SX0, SX1, SZ0, SZ1, BRX } from "./world.js";
import { Cards3D, CD, LIFT } from "./cards3d.js";
import { FX } from "./fx.js";
import { play, music, ambience, SET, saveSet } from "./audio.js";
import * as SV from "./save.js";
import { HostSync, GuestSync } from "./coop.js";
import { makeBot } from "./bot.js";

const T = window.TG || { haptic() {}, init() {}, playerName: () => "Друг", tg: null, openLink() {}, inviteFriend() {} };
const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
const $ = (id) => document.getElementById(id);
const L = (s) => (window.I18N ? I18N.t(s) : s);
const haptic = (a, b) => { try { T.haptic(a, b); } catch (_) {} };
const QS = new URLSearchParams(location.search);
const GAME = "ochag2";
const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);

/* ---------- состояние ---------- */
let G = null, mode = "menu", me = 0, room = null, hs = null, gs = null, bot = null, botSkill = "good";
let partner = { name: "", online: false, cur: null, bot: false };
let waitPause = false, lastSave = 0, hf = 0;
let started = false, ended = false, simAcc = 0, saveT = 0, hudT = 0, clock = 0, menuG = null, pendingRoles = null;
let drag = null, pend = null, ghost = null, hiT = null, sellHot = false;
const pings = [];
const myName = () => { const n = T.playerName ? T.playerName() : "Друг"; return n && n !== "Друг" ? n : L("Ты"); };

/* ---------- рендер ---------- */
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let quality = QS.get("q") != null ? Math.max(0, Math.min(2, +QS.get("q"))) : mobile ? 1 : 2, qLock = QS.get("q") != null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.2, 260);
const cam = { tx: BRX, tz: 15, dist: 12, pitch: 0.9, vx: 0, vz: 0, goal: null };
let W = 0, H = 0, DPR = 1;
let world = null, cards = null, fx = null;
function resize() {
  W = innerWidth; H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, [1, 1.5, 2][quality]);
  renderer.setPixelRatio(menuLow ? Math.min(devicePixelRatio || 1, mobile ? 0.75 : 1) : DPR); renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.fov = W < H ? 50 : 38; camera.updateProjectionMatrix();
  if (fx) fx.setScale(H * DPR * 0.62 / Math.tan(camera.fov * Math.PI / 360));
}
addEventListener("resize", resize);
function defDist() { const hf = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect); return Math.max(7, Math.min(16, (W < H ? 6.4 : 10) / 2 / Math.tan(hf / 2) * 1.05)); }
function camBounds() {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  const open = (G && G.open) || { home: 1 };
  for (const r in open) for (const q of REGIONS[r].rects) { x0 = Math.min(x0, U(q[0])); x1 = Math.max(x1, U(q[2])); z0 = Math.min(z0, U(q[1])); z1 = Math.max(z1, U(q[3])); }
  return [x0 - 1, x1 + 1, z0 - 1.5, z1 + 1.5];
}
function clampCam() {
  const b = camBounds();
  cam.dist = Math.max(5.5, Math.min(26, cam.dist));
  cam.tx = Math.max(b[0], Math.min(b[1], cam.tx)); cam.tz = Math.max(b[2], Math.min(b[3], cam.tz));
}
function placeCamera() {
  const p = cam.pitch;
  camera.position.set(cam.tx, cam.dist * Math.sin(p), cam.tz + cam.dist * Math.cos(p));
  camera.lookAt(cam.tx, 0, cam.tz);
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitv = new THREE.Vector3();
// экран → точка мира на высоте h (в единицах симуляции: x, y — как у карт)
function s2w(sx, sy, h) {
  ndc.set((sx / W) * 2 - 1, -(sy / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  plane.constant = -(h || 0);
  if (!ray.ray.intersectPlane(plane, hitv)) return null;
  return { X: hitv.x, Z: hitv.z, x: hitv.x * CW, y: hitv.z * CW };
}
const pv = new THREE.Vector3();
function project(X, Y, Z) { pv.set(X, Y, Z).project(camera); return { x: (pv.x + 1) / 2 * W, y: (1 - pv.y) / 2 * H, z: pv.z }; }

/* ---------- загрузка ---------- */
const loadbar = $("loadbar"), loadtx = $("loadtx");
async function boot() {
  try { await Promise.race([document.fonts.load('800 12px "Nunito"'), new Promise((r) => setTimeout(r, 1500))]); } catch (_) {}
  loadbar.style.width = "8%";
  await loadKit("assets/kit.bin?v=1", (p) => { loadbar.style.width = (8 + p * 80).toFixed(0) + "%"; });
  loadtx.textContent = L("Строим хутор…");
  const atlas = buildAtlas(), uiTex = buildUiAtlas();
  resize();
  world = new World(scene, renderer, { quality });
  cards = new Cards3D(scene, atlas.tex, uiTex);
  fx = new FX(scene, $("layer"), project);
  resize(); applyQuality();
  loadbar.style.width = "100%";
  T.init({ header: "#2a1d14", bg: "#1b1410" });
  setupBack();
  buildShop();
  menuG = demoState();
  world.setStage(menuG.bridge, false);
  $("load").classList.add("hidden");
  requestAnimationFrame(loop);
  const inv = window.Net && Net.readInvite ? Net.readInvite() : null;
  if (inv) joinGame(inv); else showMenu();
}
let menuLow = null;
function menuRes(on) {
  if (menuLow === on || !world) return;
  menuLow = on;
  const d = on ? Math.min(devicePixelRatio || 1, mobile ? 0.75 : 1) : Math.min(devicePixelRatio || 1, [1, 1.5, 2][quality]);
  renderer.setPixelRatio(d); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = !on && quality > 0; world.sun.castShadow = !on && quality > 0;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
}
function applyQuality() {
  resize();
  renderer.shadowMap.enabled = quality > 0 && !menuLow;
  if (world) { world.sun.castShadow = quality > 0 && !menuLow; const s = quality > 1 ? 2048 : 1024; if (world.sun.shadow.map && world.sun.shadow.mapSize.x !== s) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; } world.sun.shadow.mapSize.set(s, s); }
  if (fx) fx.q = [0.45, 0.8, 1][quality];
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
}
// фон меню: хутор в сумерках
function demoState() {
  const g = S.newGame({ seed: 4242 });
  const add = (k, x, y, o) => { const c = S.add(g, k, x, y); if (o != null) c.o = o; return c; };
  add("hut", 560, 1110); add("campfire", 840, 1080); add("field", 980, 1250); add("hut", 560, 280); add("smithy", 860, 250); add("tower", 1000, 420);
  const w = add("warrior", 760, 1420, 0); w.hp = 9; add("archer", 660, 410, 1);
  g.bridge = 3; for (const id in g.cards) if (g.cards[id].k === "site0") g.cards[id].k = "site3";
  g.t = DAY_LEN * 0.86; g.season = 1;
  return g;
}

/* ---------- лавка ---------- */
function buildShop() {
  const box = $("shop"); box.innerHTML = "";
  for (const p of PACKS) {
    const el = document.createElement("div"); el.className = "pk"; el.dataset.k = p.k;
    el.innerHTML = `<img src="${iconURL(p.k, 40)}" alt=""><span>${L(p.n)}</span><span class="cost"><i></i><b>${p.cost}</b></span>`;
    el.onclick = () => buy(p.k);
    box.appendChild(el);
  }
}
function viewCenter() { const p = s2w(W / 2, H * 0.55, 0); return p ? { x: p.x, y: p.y - CH / 2 } : { x: 700, y: me === 0 ? 1300 : 380 }; }
function buy(k) {
  if (!G || !started || ended) return;
  const p = PACKS.find((q) => q.k === k);
  if (S.packLocked(G, p)) { toast(L("Пока закрыто: ") + L(PACK_LOCK[p.lock]), "bad"); play("error"); haptic("notify", "error"); return; }
  const cost = S.packCost(G, p, me);
  if (S.coins(G, me) < cost) { toast(L("Не хватает монет: нужно ") + cost + (mode !== "solo" && S.coins(G, 1 - me) >= cost ? " · " + L("у напарника есть — попроси перекинуть через реку") : ""), "bad", 3.5); play("error"); haptic("notify", "error"); flash("s-coins"); return; }
  const c = viewCenter();
  if (mode === "guest") { gs.send("by", { k, x: Math.round(c.x), y: Math.round(c.y) }); play("buy"); haptic("impact", "light"); return; }
  const r = S.buyI(G, me, k, c.x, c.y);
  if (!r) { play("error"); return; }
  haptic("impact", "light");
}

/* ---------- режимы ---------- */
// подписи сохранений: что это за хутор
const SLOT_UI = {
  host: (p) => [`👥 ${L("Продолжить вдвоём")}${p.meta.partner ? " · " + esc(p.meta.partner) : ""}`, L("Твой хутор, ты хозяин")],
  guest: (p) => [`🏡 ${L("Вернуться в хутор")}${p.meta.partner ? " " + esc(p.meta.partner) : " " + L("друга")}`, L("Ты был гостем")],
  bot: () => [`🤖 ${L("Продолжить с ботом")}`, ""],
  solo: () => [`🙋 ${L("Продолжить одному")}`, ""],
};
function showMenu() {
  mode = "menu"; started = false; ended = false; G = null; drag = null; partner = { name: "", online: false, cur: null }; bot = null; waitPause = false;
  closeConfirm(false); clearPairs(); netNote(""); siteSc = null; if ($("sitep")) $("sitep").classList.add("hidden");
  hideAll(); $("top").classList.add("hidden"); $("bot").classList.add("hidden");
  $("menu").classList.remove("hidden"); $("title").classList.remove("hidden");
  const sv = {}; for (const k of SV.SLOTS) sv[k] = SV.peek(k);
  const p = $("menup");
  const resBtn = (k) => { const q = sv[k]; if (!q) return ""; const [a, b] = SLOT_UI[k](q); return `<button class="b" id="m-r-${k}" data-slot="${k}"><span>▶</span><span class="t">${a}<small>${b ? b + " · " : ""}${L("День")} ${q.day} · ${L("мост")} ${q.bridge}/5</small></span></button>`; };
  p.innerHTML = `
    <button class="b primary" id="m-coop"><span>👥</span><span class="t">${L("Играть вдвоём")}<small>${L("Ссылка другу — каждый со своего телефона")}</small></span></button>
    ${resBtn("host")}${resBtn("guest")}
    <div class="b2"><button class="b" id="m-bot"><span>🤖</span><span class="t">${L("С ботом")}</span></button><button class="b" id="m-solo"><span>🙋</span><span class="t">${L("Одному")}</span></button></div>
    ${resBtn("bot")}${resBtn("solo")}
    <div class="b2"><button class="b ghost" id="m-help">❓ ${L("Как играть")}</button><button class="b ghost" id="m-games">🎮 ${L("Другие игры")}</button></div>`;
  $("m-coop").onclick = () => guardSlot("host", null, () => hostGame(null, 0));
  $("m-bot").onclick = () => guardSlot("bot", null, () => rolesLocal("bot", null));
  $("m-solo").onclick = () => guardSlot("solo", null, () => rolesLocal("solo", null));
  for (const k of SV.SLOTS) if (sv[k]) $("m-r-" + k).onclick = () => resumeSlot(k);
  $("m-help").onclick = () => showHelp();
  $("m-games").onclick = () => { location.href = "../"; };
  music("m_build");
  // localStorage мог очиститься (Telegram так делает), а в облаке сохранение есть — покажем «Продолжить»
  const miss = SV.SLOTS.filter((k) => !sv[k]);
  if (miss.length) Promise.all(miss.map((k) => SV.probe(k))).then((r) => { if (r.some(Boolean) && mode === "menu" && !started && $("dlg").classList.contains("hidden") && $("roles").classList.contains("hidden")) showMenu(); });
}
// новая (или другая) игра в занятый слот — только после вопроса
function guardSlot(slot, cid, go) {
  const have = SV.peek(slot);
  if (!have || (cid && have.cid === cid)) return go();
  const [a] = SLOT_UI[slot](have);
  dialog(`<h2>${L("Заменить сохранение?")}</h2><p>${L("Там уже есть хутор")}: <b>${a}</b> (${L("день")} ${have.day}, ${L("мост")} ${have.bridge}/5). ${L("Он будет заменён.")}</p>
    <button class="b primary" id="nw-res">▶ ${L("Продолжить сохранённый")}</button><button class="b" id="nw-go">${L("Да, заменить")}</button><button class="b ghost" id="nw-x">${L("Назад")}</button>`);
  $("nw-res").onclick = () => { hideDlg(); resumeSlot(slot); };
  $("nw-go").onclick = () => { hideDlg(); go(); };
  $("nw-x").onclick = () => hideDlg();
}
// загрузка сохранения: облако может отвечать до 2,5 с — показываем, что идёт загрузка
async function loadSlot(slot) {
  dialog(`<h2>${L("Загружаем хутор…")}</h2><p class="lb-dots"></p>`, true);
  const s = await SV.load(slot);
  hideDlg();
  if (!s) { toast(L("Сохранение не найдено"), "bad"); showMenu(); return null; }
  return s;
}
async function resumeSlot(slot) {
  const s = await loadSlot(slot); if (!s) return;
  const m = s.meta || {}, fam = m.me === 1 ? 1 : 0;
  if (slot === "solo") return start("solo", s.G, fam);
  if (slot === "bot") { s.G.solo = 0; return start("bot", s.G, fam); }
  const rid = m.room, gfam = slot === "guest" ? (m.me === 0 ? 0 : 1) : fam;
  const toBot = () => guardSlot("bot", s.G.cid, () => { hideAll(); s.G.solo = 0; start("bot", s.G, gfam); });
  if (slot === "host") {
    dialog(`<h2>${L("Твой общий хутор")}</h2><p>${L("День")} ${s.G.day} · ${L("мост")} ${s.G.bridge}/5${m.partner ? " · " + L("с") + " " + esc(m.partner) : ""}.</p>
      ${rid ? `<button class="b primary" id="r-same">▶ ${L("Продолжить")}<small>${L("Друг подключится сам: пусть нажмёт «Вернуться в хутор» или откроет твою ссылку")}</small></button>` : ""}
      <button class="b ${rid ? "" : "primary"}" id="r-f">📨 ${L("Новая ссылка другу")}</button>
      <button class="b" id="r-b">🤖 ${L("Доиграть с ботом")}</button><button class="b ghost" id="r-x">${L("Назад")}</button>`);
    if (rid) $("r-same").onclick = () => { hideAll(); rehost(s.G, rid, fam); };
    $("r-f").onclick = () => { hideAll(); hostGame(s.G, fam); };
  } else {
    dialog(`<h2>${L("Хутор")}${m.partner ? " " + esc(m.partner) : ""}</h2><p>${L("Ты был там гостем")} · ${L("день")} ${s.G.day} · ${L("мост")} ${s.G.bridge}/5.</p>
      ${rid ? `<button class="b primary" id="r-same">▶ ${L("Вернуться к напарнику")}<small>${L("Подождём, пока хозяин откроет хутор")}</small></button>` : ""}
      <button class="b" id="r-f">📨 ${L("Стать хозяином этой копии")}<small>${L("Новая ссылка; ты ведёшь свою же семью")}</small></button>
      <button class="b" id="r-b">🤖 ${L("Доиграть с ботом")}</button><button class="b ghost" id="r-x">${L("Назад")}</button>`);
    if (rid) $("r-same").onclick = () => { hideAll(); rejoin(rid, s.G, gfam); };
    $("r-f").onclick = () => guardSlot("host", s.G.cid, () => { hideAll(); hostGame(s.G, gfam); });
  }
  $("r-b").onclick = toBot;
  $("r-x").onclick = () => showMenu();
}
// хозяин вернулся в ту же комнату: гость, если он ещё в игре, подключится сам (у него та же ссылка)
async function rehost(saved, rid, fam) {
  hideAll(); $("title").classList.add("hidden");
  dialog(`<h2>${L("Подключаемся…")}</h2><p class="lb-dots"></p>`, true);
  let r;
  try { r = await Net.open(GAME, rid, { name: myName(), host: true }); }
  catch (_) { hideDlg(); toast(L("Нет связи с сервером"), "bad"); start("bot", saved, fam); return; }
  room = r;
  partner = { name: r.peer ? r.peer.name : L("Друг"), online: !!r.peer, cur: null };
  hs = new HostSync(room, hostApi());
  saved.solo = 0;
  start("host", saved, fam);
  partner.online = !!room.peer;
  St.event("o2_room", { role: "host", resume: 2 });
  if (room.peer) { hs.full(); room.send("go", {}); return; }
  G.spd = 0; waitPause = true;
  waitDialog();
}
function waitDialog() {
  dialog(`<h2>${L("Ждём напарника")}</h2><p>${L("Хутор на паузе. Если друг ещё в игре — он подключится сам. Если вышел — пусть откроет «Вернуться в хутор» в меню или твою ссылку.")}</p>
    <button class="b primary" id="w-inv">📨 ${L("Отправить ссылку")}</button><button class="b" id="w-bot">🤖 ${L("Пусть играет бот")}</button><button class="b ghost" id="w-menu">${L("В меню")}</button>`, true);
  $("w-inv").onclick = () => { const link = Net.inviteLink(GAME, room.id); T.openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(L("Заходи в мой хутор!"))}`); };
  $("w-bot").onclick = () => { botFor(); if (waitPause) { waitPause = false; G.spd = 1; } hideDlg(); };
  $("w-menu").onclick = () => toMenu();
}
// бот берёт семью напарника
function botFor() { bot = makeBot(1 - me, { skill: "good" }); partner.name = "🤖 " + L("Бот"); partner.bot = true; partner.online = true; toast(1 - me === 1 ? L("Бот ведёт северную семью") : L("Бот ведёт южную семью"), "good"); }
function toMenu() { save(true); try { room && room.close(); } catch (_) {} room = null; hs = null; gs = null; bot = null; started = false; waitPause = false; showMenu(); }
// выбор ремёсел: локально (один / бот)
function rolesLocal(m, saved) {
  hideAll(); $("title").classList.add("hidden");
  const r = saved ? [saved.pl[0].role, saved.pl[1].role] : ["forester", "master"];
  const draw = () => {
    const p = $("rolesp");
    const fam = (i) => `<div class="who"><span style="background:${FAM[i].c};color:#fff">${i === 0 ? L("Южная семья") : L("Северная семья")}${m === "bot" ? (i === 0 ? " · " + L("ты") : " · 🤖") : ""}</span></div>
      <div class="roles">${ROLE_IDS.map((id) => `<div class="role ${r[i] === id ? "me" : ""}" style="--myc:${FAM[i].c}" data-f="${i}" data-r="${id}"><div class="ri">${ROLES[id].ic}</div><b>${L(ROLES[id].n)}</b><span>${L(ROLES[id].d)}</span></div>`).join("")}</div>`;
    p.innerHTML = `<h2>${L("Ремёсла семей")}</h2><p>${m === "solo" ? L("Ты ведёшь обе семьи. Общие стройки требуют жителей из обеих.") : L("Бот поведёт северную семью: строит, кормит, бьётся рядом с тобой.")}</p>
      ${fam(0)}${m === "solo" ? fam(1) : ""}
      <button class="b primary" id="r-go">▶ ${L("Начать")}</button><button class="b ghost" id="r-x">${L("Назад")}</button>`;
    p.querySelectorAll(".role").forEach((el) => el.onclick = () => { r[+el.dataset.f] = el.dataset.r; if (m === "bot" && +el.dataset.f === 0 && r[1] === r[0]) r[1] = ROLE_IDS.find((x) => x !== r[0] && x !== "trader"); play("select"); draw(); });
    $("r-go").onclick = () => { hideAll(); const g = saved || S.newGame({ seed: (Math.random() * 1e9) | 0, roles: r, solo: m === "solo" }); g.pl[0].role = r[0]; g.pl[1].role = r[1]; g.solo = m === "solo" ? 1 : 0; start(m, g, 0); };
    $("r-x").onclick = () => showMenu();
  };
  $("roles").classList.remove("hidden"); draw();
}
// хозяин: комната → друг зашёл → ремёсла → старт. fam — какую семью ведёт хозяин (обычно южную; у бывшего гостя — свою северную)
async function hostGame(saved, fam) {
  hideAll(); $("title").classList.add("hidden");
  hf = fam === 1 ? 1 : 0;
  const r = await Lobby.host(GAME, { text: L("Го строить хутор вдвоём 🌉 Заходи — два берега, один мост!"), onCancel: () => showMenu(), onBot: () => { if (saved) { saved.solo = 0; start("bot", saved, hf); } else rolesLocal("bot", null); } });
  room = r; me = hf;
  r.off("peer"); r.off("peer-left");      // обработчики лобби больше не нужны: при переподключении окно лобби не должно всплывать поверх игры
  partner = { name: r.peer ? r.peer.name : L("Друг"), online: true, cur: null };
  const roles = saved ? [saved.pl[0].role, saved.pl[1].role] : ["forester", "master"];
  pendingRoles = { roles, saved, hf };
  hs = new HostSync(room, hostApi());
  St.event("o2_room", { role: "host", resume: saved ? 1 : 0 });
  rolesCoop();
}
function rolesCoop() {
  const isHost = mode !== "guest" && !!hs;
  const P = pendingRoles; if (!P) return;
  hideDlg();
  const r = P.roles; const hfam = P.hf === 1 ? 1 : 0; const mine = isHost ? hfam : 1 - hfam, other = 1 - mine;
  const p = $("rolesp");
  p.innerHTML = `<h2>${L("Ремёсла семей")}</h2><p>${L("Каждый ведёт свою семью на своём берегу. Мост и тяжёлые стройки — только вдвоём.")}</p>
    <div class="who"><span style="background:${FAM[mine].c};color:#fff">${L("Ты")}: ${mine === 0 ? L("юг") : L("север")}</span><span style="background:${FAM[other].c};color:#062428">${esc(partner.name || L("Друг"))}: ${other === 0 ? L("юг") : L("север")}</span></div>
    <div class="roles">${ROLE_IDS.map((id) => `<div class="role ${r[mine] === id ? "me" : ""} ${r[other] === id ? "pa" : ""}" style="--myc:${FAM[mine].c};--pac:${FAM[other].c}" data-who="${esc(partner.name || L("Друг"))}" data-r="${id}"><div class="ri">${ROLES[id].ic}</div><b>${L(ROLES[id].n)}</b><span>${L(ROLES[id].d)}</span></div>`).join("")}</div>
    ${isHost ? `<button class="b primary" id="r-go">▶ ${L("Начать")}${P.saved ? " · " + L("день") + " " + P.saved.day : ""}</button>` : `<p style="font-weight:800">${L("Хозяин начнёт игру, когда вы оба выберете.")}</p>`}`;
  p.querySelectorAll(".role").forEach((el) => el.onclick = () => {
    if (r[other] === el.dataset.r) { toast(L("Это ремесло выбрал напарник"), "bad"); return; }
    r[mine] = el.dataset.r; play("select"); haptic("select");
    if (isHost) room.send("lob", { roles: r, name: myName(), day: P.saved ? P.saved.day : 0, hf: hfam }); else room.send("rl", { r: r[mine], name: myName() });
    rolesCoop();
  });
  if (isHost) {
    $("r-go").onclick = () => {
      const g = P.saved || S.newGame({ seed: (Math.random() * 1e9) | 0, roles: r });
      g.pl[0].role = r[0]; g.pl[1].role = r[1]; g.solo = 0;
      hideAll(); start("host", g, hfam);
      room.send("go", {}); hs.full();
    };
    room.send("lob", { roles: r, name: myName(), day: P.saved ? P.saved.day : 0, hf: hfam });
  }
  $("roles").classList.remove("hidden");
}
/* ---------- журнал хода игры (log.js): кто что тронул, связь, сколько карт нарисовано ---------- */
const TR = (m) => { try { window.O2LOG && window.O2LOG.add(m); } catch (_) {} };
const cdesc = (c) => c ? c.id + ":" + c.k + (c.o != null ? "/o" + c.o : "") + (c.dn ? "/dn" + c.dn : "") + (c.up ? "/up" + c.up : "") + (c.drag ? "/d" + c.drag : "") : "∅";
// карту тронули — через полсекунды проверяем, что она есть в игре и нарисована
function watchCard(id, what) {
  setTimeout(() => {
    if (!G || !started) return;
    const c = G.cards[id];
    if (!c) { TR("  ↳ " + what + " " + id + " — карты больше нет в игре"); return; }
    const f = cards && cards.frame;
    if (c._f !== f) TR("!! " + what + " " + cdesc(c) + " НЕ НАРИСОВАНА: карт " + Object.keys(G.cards).length + ", в меше " + (cards.mesh.count) + "/" + cards.cap + " x" + Math.round(c.x) + " y" + Math.round(c.y));
    else if (!isFinite(c.x) || !isFinite(c.y)) TR("!! " + what + " " + cdesc(c) + " координаты NaN");
  }, 500);
}
function hostApi() {
  const pg = () => 1 - me;      // семья гостя
  return {
    G: () => G, fam: () => me,
    intent: (t, d) => {
      if (t === "rl") { if (pendingRoles && !started) { const gi = 1 - (pendingRoles.hf || 0); if (d.r && pendingRoles.roles[1 - gi] !== d.r) pendingRoles.roles[gi] = d.r; if (d.name) partner.name = d.name; rolesCoop(); } return; }
      if (!G || !started) return;
      if (t !== "mv") TR("← гость " + t + " " + JSON.stringify(d).slice(0, 120));
      if (t === "pk") { const r = S.pickI(G, pg(), d.i); if (r.err) TR("  ↳ отказ " + r.err + " " + cdesc(G.cards[d.i])); if (r.err) room.send("nk", { i: d.i, w: r.err }); else { const c = G.cards[d.i]; if (c && d.x != null) { c.x = d.x; c.y = d.y; } } }
      else if (t === "mv") { S.moveI(G, pg(), d.i, d.x, d.y); partner.cur = { x: d.x, y: d.y + CH / 2, t: clock, down: 1 }; }
      else if (t === "dr") { const r = S.dropI(G, pg(), d.i, d.x, d.y, d.t); TR("  ↳ " + (r.err || r.res) + " " + cdesc(G.cards[d.i])); watchCard(d.i, "гость положил"); if (r.err) room.send("nk", { i: d.i, w: r.err }); }
      else if (t === "by") { const c = S.buyI(G, pg(), d.k, d.x, d.y); if (!c) room.send("nk", { w: "coins" }); }
      else if (t === "op") S.openI(G, pg(), d.i);
      else if (t === "sp") { S.speedI(G, pg(), d.s); }
    },
    cursor: (d) => { partner.cur = { x: d.x, y: d.y, t: clock, down: d.d }; },
    ping: (d) => addPing(d.x, d.y, d.k, pg(), true),
    emote: (d) => showEmote(d.e, pg(), true),
    peer: (on, p) => { TR("сеть: напарник " + (on ? "пришёл" : "ушёл") + (p && p.via ? " " + p.via : "")); partnerConn(on, p); },
    resync: () => { TR("сеть: пересинхронизация (хозяин)"); if (started) netNote(L("Связь с напарником восстановлена"), "good"); },
  };
}
// гость возвращается в комнату хозяина: ждём, сколько нужно (хозяин может нажать «Продолжить» позже)
async function rejoin(rid, copy, fam) {
  hideAll(); $("title").classList.add("hidden"); $("menu").classList.add("hidden");
  let r = null, gone = false;
  const cancel = (fn) => () => { gone = true; try { r && r.close(); } catch (_) {} hideDlg(); fn(); };
  dialog(`<h2>${L("Ждём хозяина")}</h2><p class="lb-dots">${L("Попроси напарника открыть меню и нажать «Продолжить вдвоём» → «Продолжить»")}</p>
    <button class="b" id="rj-bot">🤖 ${L("Доиграть с ботом")}</button><button class="b ghost" id="rj-x">${L("В меню")}</button>`, true);
  $("rj-bot").onclick = cancel(() => guardSlot("bot", copy.cid, () => { copy.solo = 0; start("bot", copy, fam); }));
  $("rj-x").onclick = cancel(() => showMenu());
  try { r = await Net.open(GAME, rid, { name: myName() }); } catch (_) { if (!gone) { hideDlg(); toast(L("Нет связи с сервером"), "bad"); showMenu(); } return; }
  if (gone) { try { r.close(); } catch (_) {} return; }
  if (!r.peer) await new Promise((res) => r.on("peer", () => res()));
  if (gone) return;
  hideDlg();
  joinGame(rid, copy, r);
}
// гость: вход по ссылке (или с уже открытой комнатой из rejoin)
async function joinGame(id, copy, opened) {
  hideAll(); $("title").classList.add("hidden"); $("menu").classList.add("hidden"); mode = "guest"; me = 1;
  const r = opened || await Lobby.join(GAME, id, { onCancel: () => { mode = "menu"; showMenu(); }, onBot: () => { mode = "menu"; if (copy) { copy.solo = 0; start("bot", copy, 1); } else rolesLocal("bot", null); } });
  room = r; r.off("peer"); r.off("peer-left"); partner = { name: r.peer ? r.peer.name : L("Хозяин"), online: true, cur: null };
  St.event("o2_room", { role: "guest", resume: opened ? 1 : 0 });
  gs = new GuestSync(room, {
    // семья гостя — противоположная хозяйской (хозяин сообщает свою в снимке)
    full: (g, d) => { const gf = d && d.hf === 1 ? 0 : 1; if (!started) { G = g; start("guest", g, gf); } else { G = g; ghost = null; if (me !== gf) me = gf; } },
    events: (list) => onEvents(list),
    nack: (d) => { TR("сеть: хозяин отказал " + JSON.stringify(d)); gs.release(true); if (drag && drag.id === d.i) cancelDrag(); if (ghost && ghost.id === d.i) ghost = null; toast(d.w === "foreign" ? L("Это житель напарника — его двигает только он") : d.w === "fcoin" ? L("Это монеты напарника — тратит их только он") : d.w === "busy" ? L("Эту карту уже держит напарник") : d.w === "coins" ? L("Не хватает монет") : L("Не вышло"), "bad"); play("error"); haptic("notify", "error"); },
    cursor: (d) => { partner.cur = { x: d.x, y: d.y, t: clock, down: d.d, bot: d.b }; },
    ping: (d) => addPing(d.x, d.y, d.k, 1 - me, true),
    emote: (d) => showEmote(d.e, 1 - me, true),
    lob: (d) => { if (started) return; partner.name = d.name || partner.name; pendingRoles = { roles: d.roles.slice(), saved: d.day ? { day: d.day } : null, hf: d.hf || 0 }; me = d.hf === 1 ? 0 : 1; rolesCoop(); },
    go: () => {},
    peer: (on, p) => { TR("сеть: хозяин " + (on ? "на связи" : "пропал")); partnerConn(on, p); },
    resync: () => { TR("сеть: пересинхронизация (гость)"); if (started) netNote(L("Связь восстановлена — сверяем хутор"), "good"); },
  });
  // хозяин мог ещё не подписаться — повторяем «я тут», пока не пришёл выбор ремёсел
  room.send("rl", { name: myName() });
  const hello = setInterval(() => { if (started || pendingRoles || !room || mode !== "guest") { clearInterval(hello); return; } room.send("rl", { name: myName() }); }, 2000);
  dialog(`<h2>${L("Подключились!")}</h2><p class="lb-dots">${L("Ждём, пока хозяин откроет выбор ремёсел")}</p>`);
}

/* ---------- старт ---------- */
function start(m, g, fam) {
  mode = m; G = g; started = true; ended = false; simAcc = 0; drag = null; ghost = null; waitPause = false; lastSave = performance.now();
  me = fam === 1 ? 1 : fam === 0 ? 0 : m === "guest" ? 1 : 0;
  TR("==== старт: режим " + m + ", семья " + me + ", день " + G.day + ", мост " + G.bridge + ", карт " + Object.keys(G.cards).length + ", nid " + G.nid);
  for (const id in G.cards) if (G.cards[id].drag) G.cards[id].drag = 0;
  if (m === "bot") { bot = makeBot(1 - me, { skill: botSkill, seed: (Math.random() * 1e6) | 0 }); partner = { name: "🤖 " + L("Бот"), online: true, cur: null, bot: true }; }
  else bot = null;
  if (m === "solo") partner = { name: "", online: false, cur: null };
  hideAll(); $("title").classList.add("hidden"); $("menu").classList.add("hidden");
  $("top").classList.remove("hidden"); $("bot").classList.remove("hidden");
  $("partner").style.display = m === "solo" ? "none" : "";
  world.setStage(G.bridge, false); world.snap = true;
  cards.disp.clear();
  const home = me === 0 ? { x: 700, y: 1240 } : { x: 700, y: 360 };
  cam.tx = U(home.x); cam.tz = U(home.y) + 0.6; cam.dist = defDist(); clampCam();
  for (const id in G.cards) cards.bump(+id);
  music("m_build");
  St.gameStart({ mode: m, roles: G.pl.map((x) => x.role).join(","), day: G.day, resume: G.day > 1 ? 1 : 0 });
  if (G.day === 1 && G.t < 2) {
    setTimeout(() => banner(m === "solo" ? L("Две семьи — два берега") : me === 0 ? L("Твой берег — южный") : L("Твой берег — северный"), m === "solo" ? L("Строй мост: ему нужны жители обеих семей") : L("Трудитесь вместе: мост строят только вдвоём")), 600);
  }
  updHud(true);
  closeConfirm(true);
  pairSeen.clear();
  save(true);
}

/* ---------- напарник: связь ---------- */
let leftT = 0;
function partnerConn(on, p) {
  if (on) {
    partner.online = true; if (p && p.name) partner.name = p.name;
    if (started && mode === "host") { hs.full(); room.send("go", {}); if (bot) { bot = null; partner.bot = false; toast(L("Напарник вернулся — бот уступил место"), "good"); } else toast(L("Напарник снова с нами"), "good"); S.releaseAll(G, 1 - me); if (waitPause) { waitPause = false; G.spd = 1; } }
    if (started && mode === "guest") toast(L("Связь с хозяином восстановлена"), "good");
    if (!started && mode === "host" && pendingRoles) rolesCoop();
    hideDlg();
    return;
  }
  partner.online = false; partner.cur = null; leftT = clock;
  if (!started) { toast(L("Друг отключился"), "bad"); return; }
  if (mode === "host") {
    S.releaseAll(G, 1 - me);
    St.event("o2_partner_left", { day: G.day });
    dialog(`<h2>${L("Напарник отключился")}</h2><p>${L("Связь пропала. Если друг вернётся по той же ссылке — продолжит за свою семью. Пока можно отдать его семью боту.")}</p>
      <button class="b primary" id="pl-bot">🤖 ${L("Пусть играет бот")}</button><button class="b" id="pl-wait">⏳ ${L("Ждать друга")}</button>`, true);
    $("pl-bot").onclick = () => { botFor(); hideDlg(); };
    $("pl-wait").onclick = () => { hideDlg(); G.spd = 0; waitPause = true; toast(L("Пауза, пока друг не вернётся. Он подключится сам"), ""); };
  } else if (mode === "guest") {
    St.event("o2_host_left", { day: G.day });
    save(true);
    dialog(`<h2>${L("Хозяин отключился")}</h2><p>${L("Хутор сохранён у тебя. Можно подождать или продолжить без него — с ботом или одному за обе семьи.")}</p>
      <button class="b primary" id="hl-bot">🤖 ${L("Продолжить с ботом")}</button><button class="b" id="hl-solo">🙋 ${L("Одному за обе семьи")}</button><button class="b ghost" id="hl-wait">⏳ ${L("Подождать")}</button>`, true);
    const takeover = (solo) => {
      hideDlg(); try { room && room.close(); } catch (_) {}
      const g = S.deserialize(S.serialize(G)); g.solo = solo ? 1 : 0;
      for (const id in g.cards) g.cards[id].drag = 0;
      mode = solo ? "solo" : "bot"; G = g; hs = null; gs = null; room = null;
      bot = solo ? null : makeBot(1 - me, { skill: "good" });
      partner = solo ? { name: "", online: false } : { name: "🤖 " + L("Бот"), online: true, bot: true };
      $("partner").style.display = solo ? "none" : "";
      toast(solo ? L("Теперь обе семьи — твои") : 1 - me === 0 ? L("Бот ведёт южную семью") : L("Бот ведёт северную семью"), "good");
      save(true);
    };
    $("hl-bot").onclick = () => takeover(false);
    $("hl-solo").onclick = () => takeover(true);
    $("hl-wait").onclick = () => hideDlg();
  }
}

/* ---------- касания ---------- */
const ptrs = new Map();
let gest = null, lastTap = 0, lpT = 0;
// долгое нажатие (метка «Сюда!») — только один палец, пустой стол, палец почти не двигался 650 мс
const lpCancel = () => { if (lpT) { clearTimeout(lpT); lpT = 0; } };
canvas.addEventListener("pointerdown", (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
  lpCancel();
  if (ptrs.size === 2) { if (drag) endDrag(e, true); pend = null; const [a, b] = [...ptrs.values()]; gest = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.dist, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return; }
  if (ptrs.size > 2) return;
  if (!started || ended || mode === "menu") { gest = { pan: 1 }; return; }
  const c = hitCard(e.clientX, e.clientY);
  if (c && e.button !== 2) { pend = { id: c.id, x: e.clientX, y: e.clientY, t: performance.now() }; }
  else { gest = { pan: 1 }; const pid = e.pointerId; lpT = setTimeout(() => { lpT = 0; const q = ptrs.get(pid); if (ptrs.size === 1 && q && !drag && !pend && Math.hypot(q.x - q.x0, q.y - q.y0) < 8) longPress(q.x0, q.y0); }, 650); }
  sendCursor(e.clientX, e.clientY, 1);
});
canvas.addEventListener("pointermove", (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2 && gest && gest.d) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    cam.dist = gest.dist * gest.d / Math.max(20, d);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; panBy(mx - gest.mx, my - gest.my); gest.mx = mx; gest.my = my; clampCam(); return;
  }
  if (pend && !drag) {
    if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 7) { startDrag(pend.id, e.clientX, e.clientY); pend = null; }
    return;
  }
  if (drag) { moveDrag(e.clientX, e.clientY); return; }
  if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) lpCancel();
  if (gest && gest.pan) { panBy(dx, dy); cam.vx = dx; cam.vz = dy; }
  sendCursor(e.clientX, e.clientY, 1);
});
const up = (e) => {
  const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
  lpCancel();
  if (ptrs.size === 0) gest = null;
  if (drag) { endDrag(e); return; }
  if (pend) { const c = G && G.cards[pend.id]; pend = null; if (c && p && performance.now() - p.t0 < 450) tapCard(c); }
  sendCursor(e.clientX, e.clientY, 0);
};
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); clampCam(); }, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
function panBy(dx, dy) {
  const k = cam.dist * Math.tan(camera.fov * Math.PI / 360) * 2 / H;
  cam.tx -= dx * k; cam.tz -= dy * k / Math.sin(cam.pitch) * 0.95; clampCam(); cam.goal = null;
}
let curT = 0;
function sendCursor(sx, sy, down) {
  if (!started || mode === "solo" || mode === "bot") return;
  // через сервер курсор — 4 раза в секунду (каждый — отдельное сообщение брокеру), напрямую — ~14
  const now = performance.now(); if (down && now - curT < (room && room.link === "p2p" ? 70 : 250)) return; curT = now;
  const p = s2w(sx, sy, 0); if (!p) return;
  const d = { x: Math.round(p.x), y: Math.round(p.y), d: down ? 1 : 0 };
  if (mode === "host" && room && room.peer) room.sendFast("cu", d); else if (mode === "guest" && gs) gs.send("cu", d, true);
}
// карта под пальцем: сначала фигурки (они выше), потом лица карт
function hitCard(sx, sy) {
  if (!G) return null;
  const roots = Object.values(G.cards).filter((c) => !c.dn);
  roots.sort((a, b) => (cards.order.get(b.id) || 0) - (cards.order.get(a.id) || 0));
  const test = (p, pad, onlyMini) => {
    for (const r of roots) {
      const cs = S.chain(G, r);
      for (let j = cs.length - 1; j >= 0; j--) {
        const c = cs[j]; const x = c._dx != null ? c._dx : c.x, y = c._dy != null ? c._dy : c.y;
        if (onlyMini && (j !== cs.length - 1 || !CARDS[c.k] || ["nature", "build", "place", "person", "enemy", "pack"].indexOf(CARDS[c.k].c) < 0)) continue;
        if (p.x > x - CW / 2 - pad && p.x < x + CW / 2 + pad && p.y > y - pad && p.y < y + CH + pad) return c;
      }
    }
    return null;
  };
  const pm = s2w(sx, sy, 0.45), pg = s2w(sx, sy, 0.03);
  const a = pg && test(pg, 4, false), b = pm && test(pm, 0, true);
  if (b && (!a || (b._dy || b.y) >= (a._dy || a.y))) return b;
  return a;
}
function chainIds(c) { const s = new Set(); for (const q of S.chain(G, c)) s.add(q.id); return s; }
function startDrag(id, sx, sy) {
  const c = G.cards[id]; if (!c) { TR("взял " + id + " — карты нет"); return; }
  const why = S.canTouch(G, me, c);
  TR("взял " + cdesc(c) + (why ? " отказ:" + why : "") + " (" + mode + ")");
  if (why === "foreign") { toast(L("Это житель напарника — его двигает только он"), "bad"); play("error"); haptic("notify", "error"); return; }
  if (why === "busy") { toast(L("Эту карту уже держит напарник"), "bad"); play("error"); return; }
  if (why === "fcoin") { toast(L("Это монеты напарника — тратит их только он"), "bad"); play("error"); haptic("notify", "error"); return; }
  if (why) { if (S.isEnemy(c.k)) toast(L("Врага не утащить — перетащи на него жителей"), ""); return; }
  const p = s2w(sx, sy, LIFT); if (!p) return;
  const ox = c.x - p.x, oy = c.y - p.y;
  const ids = chainIds(c);
  if (mode === "guest") {
    // сразу снимаем карту у себя — не ждём ответа хозяина (на 300–500 мс пинга иначе всё дёргается)
    const q = gs.begin([...ids, c.dn || 0].filter(Boolean));
    gs.send("pk", { i: id, x: Math.round(c.x), y: Math.round(c.y), q });
    S.pickI(G, me, id); G.ev = [];
  }
  else { const r = S.pickI(G, me, id); if (r.err) return; }
  drag = { id, ids, ox, oy, x: c.x, y: c.y, sx, sy, mvT: 0 };
  cards.bump(id); play("select", { vol: 0.6 }); haptic("impact", "light");
  moveDrag(sx, sy);
}
function moveDrag(sx, sy) {
  const p = s2w(sx, sy, LIFT); if (!p) return;
  drag.x = p.x + drag.ox; drag.y = p.y + drag.oy; drag.sx = sx; drag.sy = sy;
  if (mode === "guest") { const now = performance.now(); if (now - drag.mvT > (room && room.link === "p2p" ? 50 : 120)) { drag.mvT = now; gs.send("mv", { i: drag.id, x: Math.round(drag.x), y: Math.round(drag.y) }, true); } S.moveI(G, me, drag.id, drag.x, drag.y); }
  else S.moveI(G, me, drag.id, drag.x, drag.y);
  // зона продажи
  const sr = $("sell").getBoundingClientRect();
  sellHot = sx > sr.left - 6 && sx < sr.right + 6 && sy > sr.top - 6 && sy < sr.bottom + 6;
  hiT = sellHot ? null : findTarget();
}
function findTarget() {
  const c = G.cards[drag.id]; if (!c) return null;
  const x = drag.x, y = drag.y;
  let best = null, ba = CW * CH * 0.18;
  for (const id in G.cards) {
    const r = G.cards[id];
    if (drag.ids.has(r.id)) continue;
    if (r.dn && !r.cb) continue;
    if (r.drag) continue;
    const rx = r._dx != null ? r._dx : r.x, ry = r._dy != null ? r._dy : r.y;
    const h = r.cb ? CH : S.stackH(G, r);
    const ox = Math.min(x + CW / 2, rx + CW / 2) - Math.max(x - CW / 2, rx - CW / 2);
    const oy = Math.min(y + CH, ry + h) - Math.max(y, ry);
    if (ox <= 0 || oy <= 0) continue;
    const a = ox * oy;
    if (a > ba) { ba = a; best = r; }
  }
  return best;
}
function endDrag(e, cancel) {
  const d = drag; drag = null;
  const c = G.cards[d.id];
  let tid = 0;
  if (sellHot) tid = -1;
  else if (hiT) tid = hiT.id;
  TR("положил " + cdesc(c) + " → " + (tid === -1 ? "продажа" : tid ? cdesc(G.cards[tid]) : "стол") + " x" + Math.round(d.x) + " y" + Math.round(d.y));
  watchCard(d.id, "положил");
  sellHot = false; const tgt = hiT; hiT = null;
  $("sell").classList.remove("hot");
  if (mode === "guest") {
    const x = Math.round(d.x), y = Math.round(d.y);
    const tr = tid > 0 && G.cards[tid] ? (G.cards[tid].cb ? G.cards[tid] : S.root(G, G.cards[tid])) : null;
    const special = tid === -1 || (tr && (S.isEnemy(tr.k) || tr.cb || CARDS[tr.k].c === "pack" || tr.k === "barrow"));
    if (!special && c) {
      // кладём у себя сразу: в стопку или на стол. Хозяин подтвердит (или поправит) — без рывков назад
      if (tr) gs.holdMore(S.topOf(G, tr).id);
      c.drag = me + 1; S.dropI(G, me, d.id, x, y, tid); G.ev = [];
      const q = gs.dropped();
      gs.send("dr", { i: d.id, x, y, t: tid, q });
    } else {
      const q = gs.dropped(); gs.release(false);
      gs.send("dr", { i: d.id, x, y, t: tid, q });
      ghost = { id: d.id, ids: d.ids, x: d.x, y: d.y, t: clock, sell: tid === -1 };
    }
  } else if (c) {
    const r = S.dropI(G, me, d.id, d.x, d.y, tid);
    if (r.res === "nosell") { toast(L("Это не продаётся"), "bad"); play("error"); }
  }
  if (tid === -1) haptic("impact", "medium");
  else if (tgt) { haptic("impact", "medium"); play("click", { vol: 0.7 }); dropHint(d.id); }
  else { play("whoosh", { vol: 0.35 }); haptic("impact", "light"); }
  cards.bump(d.id);
}
// положил карту в стопку, из которой ничего не выйдет — коротко объясняем почему
function dropHint(id) {
  const c = G && G.cards[id]; if (!c || !c.dn) return;
  const r = S.root(G, c), cs = S.chain(G, r);
  const sc = S.siteCheck(G, r);
  if (sc) {
    const ek = Object.keys(sc.extra).find((k) => S.chain(G, c).some((q) => q.k === k));
    if (ek) { const res = S.SRC[ek]; toast("🌉 " + cName(ek) + " " + L("мосту не нужен") + (res && sc.mats.some((m) => m.k === res) ? " — " + L("нужен") + " " + cName(res).toLowerCase() + ". " + L("Поставь жителя на") + " " + cName(ek).toLowerCase() + ", " + L("чтобы добыть") + "." : "."), "bad", 4.5); }
    else if (sc.overW) toast("🌉 " + L("Слишком много жителей на мосту — хватит") + " " + sc.maxW, "bad", 3.5);
    return;
  }
  if (!S.stackFits(G, cs)) {
    const nat = cs.find((q) => S.SRC[q.k] && q !== cs[0]);
    toast("✗ " + L("Из такой стопки ничего не выйдет") + (nat ? ". " + cName(nat.k) + " " + L("— не ресурс: поставь на него жителя") : ". " + L("Рецепты — в книге 📖")), "bad", 3.5);
  }
}
function cancelDrag() { if (!drag) return; const d = drag; drag = null; hiT = null; sellHot = false; if (mode !== "guest") S.dropI(G, me, d.id, d.x, d.y, 0); else { const c = G.cards[d.id]; if (c) c.drag = 0; } }
function tapCard(c) {
  TR("тап " + cdesc(c)); watchCard(c.id, "тап");
  if (CARDS[c.k].c === "pack") {
    if (mode === "guest") gs.send("op", { i: c.id }); else S.openI(G, me, c.id);
    haptic("impact", "medium"); return;
  }
  showInfo(c);
}
function longPress(sx, sy) {
  if (!started || drag || ended || hitCard(sx, sy)) return;
  const p = s2w(sx, sy, 0); if (!p) return;
  gest = null;
  const msg = { x: Math.round(p.x), y: Math.round(p.y), k: "here" };
  if (mode === "host" && room && room.peer) room.send("pg", msg); else if (mode === "guest") gs.send("pg", msg);
  addPing(p.x, p.y, "here", me, false); haptic("impact", "heavy");
}

/* ---------- метки и эмоции ---------- */
const PINGS = { here: ["📍", "Сюда!"], food: ["🍖", "Нужна еда"], fight: ["⚔️", "Нужны бойцы"], thx: ["🤝", "Спасибо!"], wood: ["🪵", "Нужны брёвна"], stone: ["🪨", "Нужен камень"], ok: ["👍", "Готово"], wait: ["✋", "Подожди"] };
function addPing(x, y, k, who, remote) {
  const el = document.createElement("div"); el.className = "ping";
  const P = PINGS[k] || PINGS.here;
  el.innerHTML = `<div class="pr" style="border-color:${FAM[who].c}"></div><div>${P[0]}</div><div class="pt" style="background:${FAM[who].d}">${esc(L(P[1]))}</div>`;
  $("layer").appendChild(el);
  pings.push({ el, x, y, t: 0, who });
  if (remote) { play("bell", { vol: 0.5 }); haptic("notify", "warning"); }
  if (pings.length > 6) { const q = pings.shift(); q.el.remove(); }
}
function showEmote(k, who, remote) {
  const P = PINGS[k] || PINGS.ok;
  toast(`${P[0]} ${who === me ? L("Ты") : partner.name || L("Друг")}: ${L(P[1])}`, "f" + who);
  if (remote) { play("select"); haptic("notify", "success"); }
  // метка у курсора/взгляда
  const c = who === me ? viewCenter() : partner.cur ? { x: partner.cur.x, y: partner.cur.y - CH / 2 } : null;
  if (c && k !== "thx" && k !== "ok" && k !== "wait") addPing(c.x, c.y + CH / 2, k, who, false);
}
function emoteMenu() {
  const box = $("emotes");
  if (!box.classList.contains("hidden")) { box.classList.add("hidden"); return; }
  box.innerHTML = Object.keys(PINGS).map((k) => `<button data-k="${k}">${PINGS[k][0]} ${L(PINGS[k][1])}</button>`).join("");
  box.querySelectorAll("button").forEach((b) => b.onclick = () => {
    const k = b.dataset.k; box.classList.add("hidden");
    if (mode === "host" && room && room.peer) room.send("em", { e: k }); else if (mode === "guest") gs.send("em", { e: k });
    showEmote(k, me, false); play("click");
  });
  box.classList.remove("hidden");
}

/* ---------- события мира ---------- */
const famName = (o) => (o === 0 ? L("южной семьи") : L("северной семьи"));
const cName = (k) => L(CARDS[k] ? CARDS[k].n : k);
function wp(x, y, h) { return [U(x), h == null ? 0.4 : h, U(y) + CD / 2]; }
function onEvents(list) {
  for (const e of list) {
    try { onEvent(e); } catch (err) { console.error(err); }
    cards.ev(e);
  }
}
const GATHER_SND = { r_wood: "chop", r_willow: "chop", r_deadwood: "chop", r_stone: "stonehit", r_quarry: "stonehit", r_ore: "mine", r_crystal: "mine", r_clay: "stonehit" };
function onEvent(e) {
  const t = e.t;
  if (t === "pop") {
    const d = CARDS[e.k]; if (!d) return;
    const c = G.cards[e.id]; const x = c ? c.x : e.fx, y = c ? c.y : e.fy;
    if (d.c === "coin") { play("coin", { vol: 0.5, gap: 0.04 }); fx.burst(...wp(x, y, 0.2), 6, fx.col.gold, 1.2); }
    else if (e.enemy) { play(d.boss ? "roar2" : "growl", { vol: 0.8 }); fx.puff(...wp(x, y, 0.1), 14, fx.col.dust, 1.4); }
    else { fx.puff(...wp(x, y, 0.05), 8); if (d.c === "person") { play("heal", { vol: 0.7 }); } }
  } else if (t === "done") {
    const [X, Y, Z] = wp(e.x, e.y, 0.5);
    if (GATHER_SND[e.rec]) { play(GATHER_SND[e.rec], { vol: 0.8 }); fx.chips(X, 0.4, Z, e.rec === "r_wood" || e.rec === "r_willow" ? fx.col.wood : fx.col.stone, 8); }
    else if (e.cat === "build") { play("build"); play("upgrade", { delay: 0.25, vol: 0.7 }); fx.puff(X, 0.1, Z, 22, fx.col.dust, 1.6); fx.burst(X, 0.6, Z, 14, fx.col.gold, 1.6); }
    else if (e.cat === "craft") { play("build", { vol: 0.6 }); fx.burst(X, 0.4, Z, 8, fx.col.gold, 1); }
    else if (e.cat === "cook") { play("potion", { vol: 0.6 }); fx.burst(X, 0.5, Z, 8, fx.col.fire, 0.9); }
    else if (e.cat === "food" || e.cat === "farm" || e.cat === "nat") { play("click", { vol: 0.7 }); fx.burst(X, 0.4, Z, 6, fx.col.green, 0.9); }
    else if (e.cat === "explore") { play("whoosh", { vol: 0.6 }); }
    else if (e.cat === "equip") { play("upgrade"); fx.burst(X, 0.6, Z, 14, fx.col.white, 1.4); }
    else if (e.cat === "breed") { play("levelup"); fx.text(X, 1, Z, "❤ " + L("Новый житель!"), "big"); fx.burst(X, 0.8, Z, 18, fx.col.pink, 1.4); }
    if (e.pair && e.cat !== "bridge") { fx.text(X, 1.2, Z, "👥 " + L("Вместе!"), "big"); }
    if (e.disc && e.cat !== "bridge" && e.cat !== "equip") { const r = S.RECIPE_BY_ID[e.rec]; toast("📖 " + L("Новый рецепт:") + " " + recName(e.rec), "good"); }
  } else if (t === "learn") {
    if (e.isNew && !e.quiet) { banner("💡 " + L("Новая идея"), recName(e.rec)); play("perk"); }
  } else if (t === "bridge") {
    world.setStage(e.s, true);
    const [X, , Z] = wp(SITE_POS[0], SITE_POS[1]);
    play("gong"); play("bell", { delay: 0.6 }); haptic("notify", "success");
    for (let i = 0; i < 3; i++) setTimeout(() => fx.firework(X + (Math.random() - 0.5) * 3, 3 + Math.random(), Z + (Math.random() - 0.5) * 2), 300 + i * 350);
    fx.puff(X, 0.2, Z, 30, fx.col.dust, 2);
    const names = ["", "Сваи стоят!", "Опоры готовы!", "Настил уложен!", "Фонари зажглись!", "Арка Очага горит!"];
    banner("🌉 " + L(names[e.s]), e.s < 5 ? L("Мост") + " " + e.s + "/5 · " + L("дальше:") + " " + L(BRIDGE[e.s].st) : L("Мост готов!"), "gold");
    St.event("o2_bridge", { stage: e.s, day: G.day, mode, min: Math.round(G.st.time / 60) });
    if (mode !== "guest") cam.goal = { tx: X, tz: Z + 0.5, t: 2.2 };
  } else if (t === "hit") {
    const tc = G.cards[e.b]; const [X, , Z] = wp(tc ? tc._dx || e.x : e.x, tc ? tc._dy || e.y : e.y);
    play(e.foe ? "hit" : "hit2", { vol: 0.55, gap: 0.05 }); fx.text(X, 0.9, Z, "−" + e.d, "dmg", 0.8); fx.burst(X, 0.5, Z, 4, e.foe ? fx.col.white : fx.col.red, 1);
  } else if (t === "block") { const [X, , Z] = wp(e.x, e.y); fx.text(X, 0.9, Z, "🛡 " + L("нужны обе семьи"), "block", 1); play("stonehit", { vol: 0.35, gap: 0.3 }); }
  else if (t === "die") {
    const [X, , Z] = wp(e.x, e.y);
    if (e.foe) { play(e.k === "skeleton" || e.k === "warden" ? "bone" : "die", { vol: 0.8 }); fx.puff(X, 0.2, Z, 16, fx.col.dust, 1.5); }
    else { play("die2"); fx.puff(X, 0.2, Z, 16, fx.col.smoke, 1.2); toast("✝ " + L("Погиб") + " " + cName(e.k).toLowerCase() + " " + famName(e.o), "bad"); haptic("notify", "error"); }
  } else if (t === "ambush") { play("roar"); toast("⚠ " + L("Засада:") + " " + cName(e.k), "bad"); haptic("notify", "warning"); }
  else if (t === "attacked") { play("growl", { vol: 0.7 }); }
  else if (t === "threat") {
    const ks = {}; for (const k of e.ks) ks[k] = (ks[k] || 0) + 1;
    const txt = Object.entries(ks).map(([k, n]) => cName(k) + (n > 1 ? " ×" + n : "")).join(", ");
    banner(e.boss ? "🐉 " + L("Речной дракон поднялся!") : "⚔ " + L("Набег!"), txt + (e.region ? " · " + L(REGIONS[e.region].n) : L(" — с севера и юга")), "red");
    play("gong"); play("roar", { delay: 0.4 }); haptic("notify", "warning"); music("m_battle2");
  } else if (t === "fightend") {
    if (!Object.keys(G.fights).length && !Object.values(G.cards).some((c) => S.isEnemy(c.k))) music("m_build");
    if (e.win) { const [X, , Z] = wp(e.x, e.y); fx.burst(X, 0.6, Z, 14, fx.col.gold, 1.5); }
  } else if (t === "night") {
    banner("🌙 " + L("Ночь. Ужин"), L("Каждый житель съедает 2 еды — общей для обоих берегов")); play("bell", { vol: 0.7 });
  } else if (t === "eat") {
    const pc = G.cards[e.pid];
    const a = wp(e.fx, e.fy, 0.3), b = wp(pc ? pc.x : e.px, pc ? pc.y : e.py, 0.5);
    fx.fly(iconURL(e.k, 30), a, b, e.delay, 0.7, 30, () => { play("click", { vol: 0.25, gap: 0.03 }); });
  } else if (t === "starve") { setTimeout(() => { toast("🍂 " + cName(e.k) + " " + famName(e.o) + " " + L("умер от голода"), "bad"); play("die2"); }, (e.delay || 0) * 1000); }
  else if (t === "dawn") {
    const SN = ["🌱 " + L("Весна"), "☀ " + L("Лето"), "🍂 " + L("Осень"), "❄ " + L("Зима")];
    banner("☀ " + L("День") + " " + e.day, (e.day - 1) % 4 === 0 && e.day > 1 ? SN[e.season] : G.lastNight && G.lastNight.starved ? L("Голодали:") + " " + G.lastNight.starved : L("Все сыты"));
    play("perk", { vol: 0.5 });
    if (mode !== "guest") save(true);
    St.state({ day: e.day, bridge: G.bridge, pop: S.popCount(G) });
  } else if (t === "hold") { banner("📦 " + L("Слишком много карт"), L("Продайте лишние:") + " " + e.over + " · " + L("иначе продадим сами")); play("error"); }
  else if (t === "autosell") toast(L("Лишние карты проданы за вас"), "");
  else if (t === "gift") {
    const [X, , Z] = wp(e.x, e.y); fx.burst(X, 0.6, Z, 12, fx.col.gold, 1.2); play("coin2");
    if (mode !== "solo") toast("🎁 " + (e.p === me ? L("Ты подарил напарнику") : (partner.name || L("Напарник")) + " " + L("подарил тебе")) + " 🪙" + e.n, "f" + e.to, 3);
  }
  else if (t === "settler") {
    const [X, , Z] = wp(e.x, e.y);
    banner("🚶 " + L("Пришёл странник"), (e.o === 0 ? L("Южная семья") : L("Северная семья")) + L(" получила нового жителя"), "gold");
    fx.burst(X, 0.6, Z, 16, fx.col.gold, 1.3); play("heal");
  }
  else if (t === "sell") { const [X, , Z] = wp(e.x, e.y); play("coin2"); fx.text(X, 0.8, Z, "+" + e.n + " 🪙", "coin"); }
  else if (t === "buy") { play("buy"); const c = G.cards[e.id]; if (c) { const [X, , Z] = wp(c.x, c.y); fx.puff(X, 0.2, Z, 14, fx.col.dust, 1.2); fx.burst(X, 0.5, Z, 10, fx.col.gold, 1.3); } if (e.p !== me && mode !== "solo") toast("🧺 " + (partner.name || L("Напарник")) + " " + L("купил сундук"), "f" + e.p); }
  else if (t === "open") { play("open"); const [X, , Z] = wp(e.x, e.y); fx.burst(X, 0.5, Z, 26, fx.col.gold, 2); fx.puff(X, 0.2, Z, 12); }
  else if (t === "unlock") { banner("🗺 " + L("Открыт край:") + " " + L(REGIONS[e.b].n), L("Облака расходятся…"), "gold"); play("magic"); play("levelup", { delay: 0.5 }); const q = REGIONS[e.b].rects[0]; if (mode !== "guest") cam.goal = { tx: U((q[0] + q[2]) / 2), tz: U((q[1] + q[3]) / 2), t: 2.5, dist: Math.max(cam.dist, 13) }; }
  else if (t === "trade") { if (e.p !== me && mode !== "solo") toast("🌊 " + (partner.name || L("Напарник")) + " " + L("передал через реку"), "f" + e.p); const [X, , Z] = wp(e.x, e.y); fx.ring(X, Z, fx.col.blue); play("whoosh", { vol: 0.5 }); }
  else if (t === "quest") { toast("✓ " + L(QUESTS[e.i].n), "good"); play("confirm"); }
  else if (t === "speed") { if (e.p !== me && mode !== "solo") toast((partner.name || L("Напарник")) + ": " + (e.s === 0 ? L("пауза") : e.s === 2 ? L("быстро") : L("обычная скорость"))); }
  else if (t === "warden") { banner("💀 " + L("Страж кургана проснулся"), L("Тяжёлый враг: нужны бойцы обеих семей"), "red"); play("roar2"); music("m_battle2"); }
  else if (t === "bossdown") { banner("🐉 " + L("Речной дракон повержен!"), L("Чешуя и реликвия — ваши"), "gold"); play("gong"); }
  else if (t === "charge") { play("whoosh", { vol: 0.6 }); }
  else if (t === "deplete") { const [X, , Z] = wp(e.x, e.y); fx.puff(X, 0.2, Z, 10, fx.col.dust); }
  else if (t === "arrow") { play("arrow", { vol: 0.5 }); }
  else if (t === "win") { winNow(); }
  else if (t === "lose") { loseNow(); }
}
function recName(id) { const r = S.RECIPE_BY_ID[id]; if (!r) return id; return L(RNAME[id] || (r.out ? CARDS[r.out[0]].n : id)); }

/* ---------- конец ---------- */
function winNow() {
  play("bell"); music("m_win"); haptic("notify", "success");
  const [X, , Z] = wp(SITE_POS[0], SITE_POS[1]);
  for (let i = 0; i < 14; i++) setTimeout(() => fx.firework(X + (Math.random() - 0.5) * 6, 3 + Math.random() * 2, Z + (Math.random() - 0.5) * 4), 200 + i * 260);
  cam.goal = { tx: X, tz: Z + 0.5, t: 3, dist: 10 };
  St.gameEnd({ win: 1, day: G.day, mode, bridge: 5, pop: S.popCount(G), min: Math.round(G.st.time / 60) });
  setTimeout(() => endScreen(true), 3800);
}
function loseNow() {
  ended = true; music("m_lose"); haptic("notify", "error");
  St.gameEnd({ win: 0, day: G.day, mode, bridge: G.bridge, min: Math.round(G.st.time / 60) });
  SV.wipe(slotOf());
  setTimeout(() => endScreen(false), 1500);
}
function endScreen(win) {
  const st = G.st;
  $("endp").innerHTML = `<div style="font-size:52px">${win ? "🌉" : "🍂"}</div><h2 id="end-title">${win ? L("Мост построен!") : L("Хутор опустел")}</h2>
    <p>${win ? L("Два берега стали одним хутором. Огонь на арке видно издалека.") : L("Последний житель ушёл. Попробуйте снова — и держите запас еды.")}</p>
    <div class="stats2"><div><b>${G.day}</b>${L("дней")}</div><div><b>${Math.round(st.time / 60)}</b>${L("минут")}</div><div><b>${st.maxPop}</b>${L("жителей максимум")}</div><div><b>${st.kills}</b>${L("врагов отбито")}</div>
    <div><b>${st.trades || 0}</b>${L("передач через реку")}</div><div><b>${st.pairs || 0}</b>${L("общих строек")}</div></div>`;
  const b = $("end-buttons"); b.innerHTML = "";
  const mk = (txt, cls, fn) => { const el = document.createElement("button"); el.className = "b " + cls; el.textContent = txt; el.onclick = fn; b.appendChild(el); };
  if (win && mode !== "guest") mk("♾ " + L("Играть дальше (бесконечный режим)"), "primary", () => { $("screen-end").classList.add("hidden"); ended = false; });
  if (win && mode === "guest") mk("♾ " + L("Играть дальше"), "primary", () => { $("screen-end").classList.add("hidden"); ended = false; });
  mk("🏠 " + L("В меню"), "", () => toMenu());
  $("screen-end").classList.remove("hidden");
  ended = true;
}

/* ---------- HUD ---------- */
const SEASON_IC = ["🌱", "☀", "🍂", "❄"];
function setText(el, s) { if (el.textContent !== s) el.textContent = s; }
function updHud(force) {
  if (!G) return;
  const night = G.ph !== "day";
  $("day").classList.toggle("night", night);
  setText($("dayic"), night ? "☾" : "☀");
  setText($("daytx"), night ? L("Ночь") + " " + G.day : L("День") + " " + G.day);
  $("dbar").firstChild.style.width = (night ? 100 : Math.min(100, G.t / DAY_LEN * 100)).toFixed(1) + "%";
  setText($("season"), SEASON_IC[G.season || 0]);
  document.querySelectorAll("#spd button").forEach((b) => b.classList.toggle("on", +b.dataset.s === G.spd));
  const pop = S.popCount(G), f0 = S.famCount(G, 0), f1 = S.famCount(G, 1);
  setText($("s-pop").children[0], String(pop));
  const dots = `<i style="background:${FAM[0].c}"></i>${f0} <i style="background:${FAM[1].c}"></i>${f1}`;
  if ($("s-dots").innerHTML !== dots) $("s-dots").innerHTML = dots;
  const fs = S.foodSafe(G), fn = S.foodNeed(G);
  setText($("s-food").children[0], fs + "/" + fn);
  $("s-food").classList.toggle("warn", fs < fn && G.t > DAY_LEN * 0.55 && G.ph === "day");
  $("s-food").classList.toggle("ok", fs >= fn && fn > 0);
  const cc = S.cardCount(G), cap = S.capacity(G);
  setText($("s-cards").children[0], cc + "/" + cap);
  $("s-cards").classList.toggle("warn", cc > cap);
  setText($("s-coins").children[0], String(S.coins(G, me)));
  const pc = $("s-pcoins"), pcs = mode === "solo" ? "" : String(S.coins(G, 1 - me));
  if (pc.textContent !== pcs) { pc.textContent = pcs; pc.style.background = FAM[1 - me].c; pc.title = L("Монеты напарника"); }
  setText($("s-bridge").children[0], G.bridge + "/5");
  const q = S.questNow(G);
  setText($("goaltx"), L(q.n));
  // напарник
  const pt = $("partner");
  pt.classList.toggle("off", !partner.online);
  const pdot = pt.querySelector(".pd"); pdot.style.background = FAM[1 - me].c; pdot.style.boxShadow = partner.online ? "0 0 8px " + FAM[1 - me].c : "none";
  setText($("ptx"), partner.name || L("Напарник"));
  let net = "";
  const png = room ? (room.ping != null ? room.ping : room.rtt) : 0;
  if (room && partner.online) net = (room.link === "p2p" ? "⚡ " + L("напрямую") : "📶 " + L("через сервер")) + (png ? " " + (png > 2000 ? Math.round(png / 1000) + L(" с") : Math.round(png) + L("мс")) : "");
  else if (!partner.online && mode !== "solo" && mode !== "bot") net = L("нет связи");
  $("pnet").classList.toggle("bad", png > 1000);
  setText($("pnet"), net);
  // лавка
  const coins = S.coins(G, me);
  document.querySelectorAll(".pk").forEach((el) => {
    const p = PACKS.find((x) => x.k === el.dataset.k); const lock = S.packLocked(G, p); const cost = S.packCost(G, p, me);
    el.classList.toggle("lock", lock); el.classList.toggle("can", !lock && coins >= cost); el.classList.toggle("no", !lock && coins < cost);
    const cb = el.querySelector(".cost"); const want = lock ? `🔒 ${p.lock === "hut" ? "🏠" : L("д.") + (p.lock === "day2" ? 2 : 3)}` : `<i></i><b>${cost}</b>`; if (cb.innerHTML !== want) cb.innerHTML = want;
  });
  const sell = $("sell");
  if (drag) { const c = G.cards[drag.id]; const can = c && S.canSell(G, c) && c.k !== "coin"; sell.classList.toggle("can", !!can); sell.classList.toggle("no", !can); sell.classList.toggle("hot", sellHot && !!can); }
  else { sell.classList.remove("can", "no", "hot"); }
}
function flash(id) { const el = $(id); if (!el) return; el.style.transition = "none"; el.style.filter = "brightness(1.8)"; requestAnimationFrame(() => { el.style.transition = "filter .6s"; el.style.filter = ""; }); }
let bannerT = 0;
function banner(a, b, cls) {
  const el = $("banner"); el.className = cls || ""; el.innerHTML = ""; el.append(document.createTextNode(a));
  if (b) { const s = document.createElement("small"); s.textContent = b; el.appendChild(s); }
  void el.offsetWidth; el.classList.add("show"); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove("show"), 2600);
}
function toast(txt, cls, life) {
  const box = $("toasts"); const el = document.createElement("div"); el.className = "toast " + (cls || ""); el.textContent = txt;
  box.appendChild(el); while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), (life || 2.6) * 1000);
}
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
function hideAll() { ["menu", "roles", "info", "book", "pause", "dlg", "screen-end"].forEach((id) => $(id) && $(id).classList.add("hidden")); $("emotes").classList.add("hidden"); }
function dialog(html, keep) { $("dlgp").innerHTML = html; $("dlg").classList.remove("hidden"); $("dlg").dataset.keep = keep ? 1 : ""; }
function hideDlg() { $("dlg").classList.add("hidden"); }

/* ---------- подсказки, книга, пауза ---------- */
function tokenKey(tk) { if (tk === "@w" || tk === "?@w") return "villager"; return tk.replace(/^[=~]/, ""); }
function recRow(r, known) {
  const toks = r.need.map((tk) => `<img src="${iconURL(tokenKey(tk), 24)}" title="${esc(L(CARDS[tokenKey(tk)].n))}"${tk === "?@w" ? ' style="opacity:.5"' : ""}>`).join("");
  const out = r.out ? r.out.map((k) => `<img src="${iconURL(k, 24)}">`).join("") : r.stage ? `<img src="${iconURL(r.stage >= 5 ? "bridge" : BRIDGE[r.stage].k, 24)}">` : "❓";
  return `<div class="rec ${r.pair ? "pair" : ""} ${known ? "" : "unk"}">${toks}<span class="eq">→</span>${out}<span class="nm">${r.pair ? "👥 " : ""}${known ? esc(recName(r.id)) : "???"}</span></div>`;
}
function showInfo(c) {
  const d = CARDS[c.k];
  const rel = RECIPES.filter((r) => (G.kn[r.id] || r.stage) && (r.need.some((tk) => tokenKey(tk) === c.k) || (r.out && r.out.indexOf(c.k) >= 0) || (r.stage && CARDS[c.k].c === "site" && BRIDGE[r.stage - 1] && BRIDGE[r.stage - 1].k === c.k))).slice(0, 8);
  const extra = [];
  if (d.c === "person") extra.push(`<b style="color:${FAM[c.o || 0].c}">${c.o === 1 ? L("Северная семья") : L("Южная семья")}</b> · ❤ ${c.hp}/${S.maxHp(G, c)} · ⚔ ${d.atk}`);
  if (d.c === "enemy") extra.push(`❤ ${c.hp} · ⚔ ${d.atk}${d.pair ? " · 👥 " + L("тяжёлый") : ""}`);
  if (c.u != null) extra.push("⛏ " + L("осталось") + ": " + c.u);
  if (d.v != null && d.v > 0) extra.push("🪙 " + L("цена") + ": " + S.sellValue(G, c));
  $("infop").innerHTML = `<div class="ih"><img src="${cardURL(c.k, c.o)}"><div><h3>${esc(L(d.n))}</h3><small>${esc(L(CATS[d.c].n))}</small><div style="font-size:13px;font-weight:800;margin-top:4px">${extra.join("<br>")}</div></div></div>
    <p style="color:var(--cream)">${esc(L(d.d))}</p>${rel.length ? `<div class="recs">${rel.map((r) => recRow(r, true)).join("")}</div>` : ""}
    <button class="b ghost" id="i-x">${L("Закрыть")}</button>`;
  $("info").classList.remove("hidden"); $("i-x").onclick = () => $("info").classList.add("hidden");
  $("info").onclick = (e) => { if (e.target === $("info")) $("info").classList.add("hidden"); };
  play("click", { vol: 0.5 });
}
const BOOK_TABS = [["gather", "Сбор"], ["food", "Еда"], ["craft", "Ремесло"], ["build", "Постройки"], ["bridge", "Мост"], ["explore", "Разведка"], ["equip", "Снаряжение"]];
let bookTab = "bridge";
function showBook() {
  const cat = (r) => r.cat === "cook" || r.cat === "farm" || r.cat === "nat" ? "food" : r.cat === "breed" ? "build" : r.cat;
  const list = RECIPES.filter((r) => cat(r) === bookTab);
  const kn = list.filter((r) => G.kn[r.id] || r.stage).length;
  $("bookp").innerHTML = `<h2>📖 ${L("Книга рецептов")}</h2><div class="tabs2">${BOOK_TABS.map(([k, n]) => `<button data-k="${k}" class="${k === bookTab ? "on" : ""}">${L(n)}</button>`).join("")}</div>
    <p>${L("Открыто")}: ${kn}/${list.length}. ${L("Новые рецепты — в сундуках и опытах со стопками.")}</p>
    <div class="recs">${list.map((r) => recRow(r, !!(G.kn[r.id] || r.stage))).join("")}</div><button class="b ghost" id="bk-x">${L("Закрыть")}</button>`;
  $("bookp").querySelectorAll(".tabs2 button").forEach((b) => b.onclick = () => { bookTab = b.dataset.k; showBook(); });
  $("bk-x").onclick = () => $("book").classList.add("hidden");
  $("book").classList.remove("hidden");
}
function showGoals() {
  $("bookp").innerHTML = `<h2>🎯 ${L("Общие цели")}</h2><div class="gl">${QUESTS.map((q, i) => `<div class="${i < G.q ? "done" : i === G.q ? "now" : ""}">${i < G.q ? "✓" : i === G.q ? "▶" : "·"} ${esc(L(q.n))}${i === G.q ? `<br><small style="font-weight:700;color:var(--muted2)">${esc(L(q.h))}</small>` : ""}</div>`).join("")}</div><button class="b ghost" id="bk-x">${L("Закрыть")}</button>`;
  $("bk-x").onclick = () => $("book").classList.add("hidden");
  $("book").classList.remove("hidden");
}
function showHelp() {
  dialog(`<h2>${L("Как играть")}</h2><div class="help">
    <p><b>${L("Складывай карты в стопки.")}</b> ${L("Житель на дерево — бревно, на валун — камень. Подходящая стопка работает сама: над ней бежит полоска.")}</p>
    <p><b>${L("Два берега.")}</b> ${L("Юг богат лесом, север — камнем. Перетаскивай ресурсы через реку напарнику. Своих жителей двигает только их семья.")}</p>
    <p><b>${L("Мост — общая цель.")}</b> ${L("Каждый шаг моста и тяжёлые стройки (амбар, ярмарка) требуют жителей из обеих семей в одной стопке.")}</p>
    <p><b>${L("Новые жители.")}</b> ${L("Хижина + 2 твоих жителя — через полминуты новый житель в твою семью, раз в день на хижину. Остался один? Положи его на хижину — напарник добавит своего, и новый житель придёт к тебе. А к семье, где меньше двух жителей, утром приходит странник.")}</p>
    <p><b>${L("Свои монеты.")}</b> ${L("У каждого свой кошелёк: продал — монеты твои, сундук покупаешь на свои, и всё из него — твоё. Ресурсы общие. Монеты можно подарить: перетащи их на берег напарника.")}</p>
    <p><b>${L("Ночью ужин.")}</b> ${L("Каждый житель съедает 2 еды из общего запаса. Голодный погибает. Готовая еда сытнее.")}</p>
    <p><b>${L("Набеги")}</b> ${L("приходят с севера и юга. Тяжёлых врагов (👥) пробивают только бойцы обеих семей вместе.")}</p>
    <p><b>${L("Связь:")}</b> ${L("долгое нажатие на стол — метка «Сюда!», кнопка 💬 — быстрые фразы.")}</p>
    <p>👆 ${L("Тап по карте — подсказка. Два пальца — масштаб. Тащи пустое место — двигай стол.")}</p></div>
    <button class="b primary" id="h-ok">${L("Понятно")}</button>`);
  $("h-ok").onclick = () => { hideDlg(); if (mode === "menu") showMenu(); };
}
// отчёт о баге: журнал + сжатый снимок хутора одной строкой — игрок копирует и присылает
async function packSave() {
  try {
    const raw = new TextEncoder().encode(S.serialize(G));
    const cs = new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = new Uint8Array(await new Response(cs).arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch (e) { return "нет снимка: " + (e && e.message); }
}
async function bugReport() {
  TR("== отчёт о баге (" + mode + ")");
  window.O2LOG && window.O2LOG.flush();
  const head = "ХУТОР-ОТЧЁТ v1 · " + new Date().toISOString() + " · режим " + mode + " · семья " + me + " · " + (navigator.userAgent.match(/\(([^)]+)\)/) || ["", ""])[1];
  const txt = head + "\n---- журнал\n" + (window.O2LOG ? window.O2LOG.text().split("\n").slice(-600).join("\n") : "") + "\n---- снимок (gzip+base64)\n" + (G ? await packSave() : "") + "\n---- конец";
  let ok = false;
  try { await navigator.clipboard.writeText(txt); ok = true; } catch (_) {}
  $("pausep").innerHTML = `<h2>🐞 ${L("Отчёт о баге")}</h2>
    <p style="margin:6px 0 10px">${ok ? L("Отчёт скопирован. Вставь его в чат с Claude и напиши, что случилось.") : L("Выдели весь текст ниже, скопируй и пришли в чат с Claude.")}</p>
    <textarea id="bug-t" readonly style="width:100%;height:150px;font-size:10px;border-radius:10px">${esc(txt.slice(0, 200000))}</textarea>
    <button class="b" id="bug-c">📋 ${L("Скопировать ещё раз")}</button><button class="b ghost" id="bug-x">${L("Закрыть")}</button>`;
  $("pause").classList.remove("hidden");
  $("bug-c").onclick = async () => { try { await navigator.clipboard.writeText(txt); toast(L("Скопировано"), "good"); } catch (_) { const t = $("bug-t"); t.focus(); t.select(); try { document.execCommand("copy"); toast(L("Скопировано"), "good"); } catch (__) {} } };
  $("bug-x").onclick = () => $("pause").classList.add("hidden");
}
function openPause() {
  $("pausep").innerHTML = `<h2>${L("Пауза")}</h2>
    <button class="b" id="p-goals">🎯 ${L("Цели")}</button><button class="b" id="p-book">📖 ${L("Книга рецептов")}</button><button class="b" id="p-help">❓ ${L("Как играть")}</button>
    <div class="b2"><button class="b" id="p-snd">${SET.snd ? "🔊 " + L("Звук") : "🔇 " + L("Звук")}</button><button class="b" id="p-mus">${SET.mus ? "🎵 " + L("Музыка") : "🎵 " + L("выкл")}</button></div>
    <button class="b" id="p-q">✨ ${L("Графика")}: ${[L("низкая"), L("средняя"), L("высокая")][quality]}</button>
    ${mode === "host" || mode === "guest" ? `<button class="b" id="p-inv">📨 ${L("Ссылка для друга ещё раз")}</button>` : ""}
    <button class="b" id="p-bug">🐞 ${L("Отчёт о баге")}</button>
    <button class="b" id="p-menu">🏠 ${L("В меню")} · ${L("сохранится")}</button><button class="b ghost" id="p-x">${L("Продолжить")}</button>`;
  $("pause").classList.remove("hidden");
  $("p-goals").onclick = () => { $("pause").classList.add("hidden"); showGoals(); };
  $("p-book").onclick = () => { $("pause").classList.add("hidden"); showBook(); };
  $("p-help").onclick = () => { $("pause").classList.add("hidden"); showHelp(); };
  $("p-snd").onclick = () => { SET.snd = SET.snd ? 0 : 1; saveSet(); openPause(); };
  $("p-mus").onclick = () => { SET.mus = SET.mus ? 0 : 1; saveSet(); openPause(); };
  $("p-q").onclick = () => { quality = (quality + 2) % 3; qLock = true; applyQuality(); openPause(); };
  if ($("p-inv")) $("p-inv").onclick = () => { const link = Net.inviteLink(GAME, room.id); T.openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(L("Заходи в мой хутор!"))}`); };
  $("p-bug").onclick = () => { $("pause").classList.add("hidden"); bugReport(); };
  $("p-menu").onclick = () => toMenu();
  $("p-x").onclick = () => $("pause").classList.add("hidden");
}
$("b-menu").onclick = () => { play("click"); openPause(); };
$("b-book").onclick = () => { play("click"); showBook(); };
$("b-emote").onclick = () => { play("click"); emoteMenu(); };
$("goal").onclick = () => { const q = S.questNow(G); toast("🎯 " + L(q.h), "", 4); };
$("partner").onclick = () => { if (partner.cur) { cam.goal = { tx: U(partner.cur.x), tz: U(partner.cur.y), t: 0.8 }; } else toast(L("Напарник пока ничего не трогал")); };
$("s-bridge").onclick = () => { const [X, , Z] = wp(SITE_POS[0], SITE_POS[1]); cam.goal = { tx: X, tz: Z, t: 0.8 }; const r = S.RECIPE_BY_ID["b_" + Math.min(5, G.bridge + 1)]; if (G.bridge < 5 && r) toast("🌉 " + L(BRIDGE[G.bridge].d), "", 4.5); };
$("s-food").onclick = () => toast(L("Еда к ночи: есть / нужно. Еда на грядках и кострах не считается."), "", 3.5);
$("s-coins").onclick = () => toast(mode === "solo" ? L("Монеты: общий кошелёк обеих семей.") : L("Твои монеты (рядом — у напарника). Продаёшь — монеты твои, сундук покупаешь на свои. Перетащи монеты на берег напарника — подаришь."), "", 4.5);
$("s-cards").onclick = () => toast(L("Место для карт. Сараи и амбар дают больше. Жители и монеты место не занимают."), "", 3.5);
document.querySelectorAll("#spd button").forEach((b) => b.onclick = () => {
  if (!G) return; const s = +b.dataset.s; play("click");
  if (mode === "guest") gs.send("sp", { s }); else S.speedI(G, me, s);
  G.spd = s; updHud();
});

/* ---------- сохранение ---------- */
// каждый режим — в свой слот: свой общий хутор, чужой (копия гостя), с ботом, одному
const slotOf = () => (mode === "host" ? "host" : mode === "guest" ? "guest" : mode === "solo" ? "solo" : "bot");
// автосохранение — когда браузер свободен (не посреди кадра); при сворачивании — сразу
function idleSave() {
  lastSave = performance.now();
  const go = () => { const t = performance.now(); save(); const ms = performance.now() - t; if (ms > 60) TR("сохранение " + Math.round(ms) + " мс, карт " + Object.keys(G ? G.cards : {}).length); };
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 0);
}
function save(force) {
  if (!G || !started || G.lost) return;
  lastSave = performance.now();
  try { SV.save(slotOf(), G, { from: mode, mode, room: room ? room.id : "", me, partner: partner.bot ? "" : (partner.name || "").slice(0, 24) }, force); }
  catch (e) { console.warn("save", e); }
}
// уход со страницы: Telegram свернули/закрыли, экран погас, «Назад» — сохраняем сразу (и в облако)
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(true); });
addEventListener("pagehide", () => save(true));
// Telegram: не закрывать мини-приложение случайным свайпом во время игры
function closeConfirm(on) { try { const tg = T.tg; if (!tg) return; if (on) tg.enableClosingConfirmation && tg.enableClosingConfirmation(); else tg.disableClosingConfirmation && tg.disableClosingConfirmation(); } catch (_) {} }
// кнопка «Назад» Telegram: в игре — не выходим молча, а спрашиваем; в меню — к списку игр
function setupBack() {
  const tg = T.tg; if (!tg || !tg.BackButton) return;
  try { tg.BackButton.show(); tg.BackButton.onClick(onBack); } catch (_) {}
}
function onBack() {
  play("click");
  if (started && G) {
    save(true);
    for (const id of ["info", "book", "pause", "emotes"]) if (!$(id).classList.contains("hidden")) { $(id).classList.add("hidden"); return; }
    if (!$("dlg").classList.contains("hidden") && !$("dlg").dataset.keep) { hideDlg(); return; }
    if (!$("screen-end").classList.contains("hidden")) { toMenu(); return; }
    dialog(`<h2>${L("Выйти в меню?")}</h2><p>${L("Прогресс сохранится.")}${mode === "host" || mode === "guest" ? " " + L("Напарник сможет подождать тебя — вернись через «Продолжить общий хутор».") : ""}</p>
      <button class="b primary" id="bk-stay">▶ ${L("Остаться")}</button><button class="b" id="bk-menu">🏠 ${L("В меню")}</button>`);
    $("bk-stay").onclick = () => hideDlg();
    $("bk-menu").onclick = () => { hideDlg(); toMenu(); };
    return;
  }
  if (!$("roles").classList.contains("hidden") || !$("dlg").classList.contains("hidden")) { hideAll(); showMenu(); return; }
  if (window.Lobby && document.getElementById("lobby") && !document.getElementById("lobby").classList.contains("hidden")) { try { Lobby.current && Lobby.current.close(); } catch (_) {} Lobby.hide(); showMenu(); return; }
  location.href = "../";
}

/* ---------- общие стройки: чего ждёт стопка ---------- */
const pairEls = new Map(), pairSeen = new Set();
function clearPairs() { for (const el of pairEls.values()) el.remove(); pairEls.clear(); }
const famGen = (f) => (f === 0 ? L("южной семьи") : L("северной семьи"));
function pairText(w) {
  const solo = mode === "solo";
  if (w.fam === -1) return "👥 " + L("Нужны жители обеих семей");
  if (w.swap) {
    if (solo) return "👥 " + L("Тут двое из одной семьи — замени одного на жителя") + " " + famGen(w.fam);
    return w.fam === me ? "👥 " + L("Напарник положил двоих — нужен твой житель вместо одного") : "👥 " + L("Двое твоих не подойдут: убери одного — нужен житель второй семьи (напарника)");
  }
  if (solo) return "👥 " + L("Нужен житель") + " " + famGen(w.fam);
  if (w.fam === me) return "👥 " + L("Нужен твой житель");
  return "👥 " + (partner.bot ? L("Ждём жителя бота — он уже несёт") : L("Нужен житель второй семьи (напарника)"));
}
// чек-лист стройки моста: что лежит, чего не хватает, что лишнее
function siteHtml(sc, compact) {
  const ok = (b) => (b ? "✓" : "✗");
  const mats = sc.mats.map((m) => `<span class="${m.have >= m.need ? "ok" : "no"}">${ok(m.have >= m.need)} ${esc(cName(m.k))} ${m.have}/${m.need}</span>`).join(" · ");
  const dot = (f) => `<i style="background:${FAM[f].c}"></i>`;
  const wOk = sc.w0 >= 1 && sc.w1 >= 1 && !sc.overW;
  let w = `<span class="${wOk ? "ok" : "no"}">${ok(wOk)} 👥 ${dot(0)}${sc.w0} ${dot(1)}${sc.w1}</span>`;
  if (!sc.w0 || !sc.w1) w += ` <small>${L("нужен хотя бы 1 житель от каждой семьи")}</small>`;
  if (sc.overW) w += ` <small>${L("лишние жители")}: ${sc.overW}</small>`;
  const ex = Object.entries(sc.extra).map(([k, n]) => {
    const want = sc.mats.find((m) => m.k === S.SRC[k]);
    return `<div class="no">✗ ${esc(cName(k))}${n > 1 ? " ×" + n : ""} — ${want ? esc(L("это не")) + " " + esc(cName(want.k).toLowerCase()) + ": " + esc(L("поставь жителя на")) + " " + esc(cName(k).toLowerCase()) + ", " + esc(L("чтобы добыть")) : esc(L("мосту не нужно, убери"))}</div>`;
  }).join("");
  return (compact ? "" : `<b>🌉 ${esc(recName(sc.rid))}</b>`) + `<div>${mats}</div><div>${w}</div>${ex}`;
}
// панель стройки моста — у края экрана (не поверх поля), сворачивается в значок, ✕ прячет до следующего изменения
let siteSc = null;
const SP = { col: (() => { try { return localStorage.getItem("o2_sitec") === "1"; } catch (_) { return false; } })(), hid: "" };
function sitePanel() {
  let el = $("sitep");
  if (!el) {
    el = document.createElement("div"); el.id = "sitep"; document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]"); const a = b ? b.dataset.a : "tog";
      if (a === "x") { SP.hid = el.dataset.k || ""; el.classList.add("hidden"); }
      else if (a === "go") { const s = siteSc && G.cards[siteSc.id]; if (s) cam.goal = { tx: U(s.x), tz: U(s.y) + 1.2, t: 0.9 }; }
      else { SP.col = !SP.col; try { localStorage.setItem("o2_sitec", SP.col ? "1" : "0"); } catch (_) {} el.dataset.h = ""; sitePanel(); }
      play("click", { vol: 0.5 }); e.stopPropagation();
    });
  }
  if (!siteSc || !started) { el.classList.add("hidden"); return; }
  const sc = siteSc.sc;
  const bad = sc.mats.filter((m) => m.have < m.need).length + (sc.w0 && sc.w1 ? 0 : 1) + (sc.overW ? 1 : 0) + Object.keys(sc.extra).length;
  const key = JSON.stringify([sc.rid, sc.mats.map((m) => m.have), sc.w0, sc.w1, Object.keys(sc.extra)]);
  if (SP.hid && SP.hid === key) { el.classList.add("hidden"); return; }
  SP.hid = ""; el.dataset.k = key; el.classList.remove("hidden");
  const head = `<div class="sh"><span data-a="go" title="${esc(L("Показать мост"))}">🌉</span><b>${esc(recName(sc.rid))}</b><span class="sc ${bad ? "no" : "ok"}">${bad ? "✗" + bad : "✓"}</span><span class="sb" data-a="tog">${SP.col ? "▸" : "▾"}</span><span class="sb" data-a="x">✕</span></div>`;
  const h = SP.col ? head : head + `<div class="sbody">${siteHtml(sc, true)}</div>`;
  el.classList.toggle("col", SP.col);
  if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
}
function updPairs() {
  const want = new Map();
  siteSc = null;
  for (const id in G.cards) {
    const r = G.cards[id]; if (r.dn || !r.up || r.drag) continue;
    const sc = S.siteCheck(G, r);
    if (sc) { if (!r.rc) siteSc = { sc, id: r.id }; continue; }
    const w = S.pairWait(G, r); if (w) want.set(r.id, w);
  }
  sitePanel();
  for (const [id, el] of pairEls) if (!want.has(id)) { el.remove(); pairEls.delete(id); }
  for (const [id, w] of want) {
    let el = pairEls.get(id);
    if (!el) { el = document.createElement("div"); el.className = "pairlab"; $("layer").appendChild(el); pairEls.set(id, el); }
    if (w.site) { const h = siteHtml(w.site); if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; } el.classList.add("site"); el.style.background = ""; el.style.borderColor = ""; continue; }
    el.classList.remove("site");
    const txt = pairText(w); if (el.textContent !== txt) { el.textContent = txt; el.dataset.h = ""; }
    const f = w.fam < 0 ? 1 - me : w.fam; el.style.background = FAM[f].d; el.style.borderColor = FAM[f].c;
    const key = id + ":" + w.rid + ":" + w.fam + ":" + w.swap;
    if (!pairSeen.has(key)) { pairSeen.add(key); if (w.fam !== me || w.swap || mode === "solo") { toast(txt + " · " + recName(w.rid), "f" + f, 4); haptic("notify", "warning"); } else toast(txt + " · " + recName(w.rid), "f" + f, 4); }
  }
}
function drawPairs() {
  for (const [id, el] of pairEls) {
    const r = G.cards[id]; if (!r) continue;
    // под стопкой (над ней часто баннеры и шапка)
    const s = project(U(r._dx != null ? r._dx : r.x), 0.1, U((r._dy != null ? r._dy : r.y) + S.stackH(G, r)) + 0.12);
    el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, 0)`;
  }
}
// «в семье остался один» — подсказка, где взять жителей (раз в день на семью)
const loneSeen = {};
function loneHint() {
  for (const f of mode === "solo" ? [0, 1] : [me]) {
    const n = S.famCount(G, f); const key = f + ":" + G.day;
    if (n >= 2 || loneSeen[key] || G.ph !== "day" || G.lost) continue;
    loneSeen[key] = 1;
    toast("🏠 " + (mode === "solo" ? (f === 0 ? L("Южная семья") : L("Северная семья")) : L("У тебя")) + ": " + L("жителей меньше двух. Положи жителя на хижину — напарник добавит своего, будет новый. А утром придёт странник."), "f" + f, 6);
  }
}
/* ---------- связь у гостя: хозяин шлёт 10 раз в секунду, тишина дольше 3 с — проблема ---------- */
let netNoteT = 0;
function netNote(txt, cls) {
  let el = $("netw"); if (!el) { el = document.createElement("div"); el.id = "netw"; document.body.appendChild(el); }
  el.textContent = txt; el.className = txt ? "show " + (cls || "") : "";
  clearTimeout(netNoteT); if (txt && cls === "good") netNoteT = setTimeout(() => netNote(""), 2500);
}
let netBad = false;
function netWatch() {
  if (!gs || !started || mode !== "guest") return;
  const q = gs.silence();
  if (q > 3 && partner.online) { if (!netBad) { netBad = true; netNote("📶 " + L("Связь с хозяином прервалась — переподключаемся…"), "bad"); } gs.ask(); }
  else if (netBad && q < 1) { netBad = false; netNote(L("Связь восстановлена"), "good"); }
}

/* ---------- курсоры, метки, стрелки ---------- */
let curEl = null;
const arrows = [];
function drawOverlay(dt) {
  // курсор напарника (или бота)
  let pc = null;
  if (partner.cur && clock - partner.cur.t < 3) pc = partner.cur;
  if (bot && bot.hand) pc = { x: bot.hand.x, y: bot.hand.y + CH / 2, down: 1 };
  if (pc && started) {
    if (!curEl) { curEl = document.createElement("div"); curEl.className = "cur"; curEl.innerHTML = `<div class="hand"></div><div class="nm"></div>`; $("layer").appendChild(curEl); }
    const col = FAM[1 - me].c;
    curEl.firstChild.style.background = col; curEl.lastChild.style.background = FAM[1 - me].d; curEl.lastChild.textContent = partner.name || L("Друг");
    const s = project(U(pc.x), pc.down ? 0.7 : 0.1, U(pc.y));
    curEl.dataset.x = curEl.dataset.x ? +curEl.dataset.x + (s.x - +curEl.dataset.x) * Math.min(1, dt * 14) : s.x;
    curEl.dataset.y = curEl.dataset.y ? +curEl.dataset.y + (s.y - +curEl.dataset.y) * Math.min(1, dt * 14) : s.y;
    curEl.style.transform = `translate(${(+curEl.dataset.x).toFixed(1)}px, ${(+curEl.dataset.y).toFixed(1)}px) scale(${pc.down ? 1 : 0.8})`;
    curEl.style.opacity = "1";
  } else if (curEl) curEl.style.opacity = "0";
  // метки
  for (let i = pings.length - 1; i >= 0; i--) {
    const p = pings[i]; p.t += dt;
    if (p.t > 4.5) { p.el.remove(); pings.splice(i, 1); continue; }
    const s = project(U(p.x), 0.1, U(p.y));
    const m = 30, off = s.x < m || s.x > W - m || s.y < 120 || s.y > H - 120;
    const x = Math.max(m, Math.min(W - m, s.x)), y = Math.max(130, Math.min(H - 130, s.y));
    p.el.style.transform = `translate(${x}px, ${y}px) scale(${off ? 0.8 : 1})`; p.el.style.opacity = p.t > 3.8 ? ((4.5 - p.t) / 0.7).toFixed(2) : "1";
  }
  // стрелки к врагам за краем экрана
  let n = 0;
  if (G && started) for (const id in G.cards) {
    const c = G.cards[id]; if (!S.isEnemy(c.k) || n >= 5) continue;
    const s = project(U(c._dx || c.x), 0.3, U(c._dy || c.y) + CD / 2);
    if (s.x > 0 && s.x < W && s.y > 110 && s.y < H - 110 && s.z < 1) continue;
    let el = arrows[n]; if (!el) { el = document.createElement("div"); el.className = "arrow foe"; $("layer").appendChild(el); arrows[n] = el; }
    const cx = W / 2, cy = H / 2; let dx = s.x - cx, dy = s.y - cy; if (s.z > 1) { dx = -dx; dy = -dy; }
    const k = Math.min((W / 2 - 26) / Math.max(1, Math.abs(dx)), (H / 2 - 130) / Math.max(1, Math.abs(dy)));
    el.style.transform = `translate(${cx + dx * k}px, ${cy + dy * k}px)`; el.textContent = CARDS[c.k].pair ? "👥" : "⚔"; el.style.display = "grid";
    n++;
  }
  for (let i = n; i < arrows.length; i++) arrows[i].style.display = "none";
  if (G && started) drawPairs();
}

/* ---------- главный цикл ---------- */
let last = 0, fpsAcc = 0, fpsN = 0, fpsCheck = 0, ambT = 0;
const fpsEl = QS.get("fps") ? Object.assign(document.body.appendChild(document.createElement("div")), { id: "fps" }) : null;
let fpsT = 0, fpsC = 0, simMs = 0;
window.__perf = { frames: [], sim: 0, js: [], gl: [] };
const TFPS = +QS.get("tfps") || 0;          // для автотестов: ограничить частоту кадров
// журнал подвисаний: кадр дольше 200 мс (с разбивкой, что его съело) и всплески пинга
const PF = { sim: 0, rnd: 0, hud: 0, n: 0, t: 0, png: 0, pngT: 0 };
function perfTrace(gap) {
  if (!started) return;
  if (gap > 200 && !document.hidden) TR("подвис кадр " + Math.round(gap) + " мс: симуляция " + PF.sim.toFixed(0) + " · рендер " + PF.rnd.toFixed(0) + " · интерфейс " + PF.hud.toFixed(0) + " мс, карт " + (G ? Object.keys(G.cards).length : 0) + (room ? " · связь " + room.link + " " + Math.round(room.ping || room.rtt || 0) + " мс" : ""));
  if (room && room.peer && performance.now() - PF.pngT > 3000) {
    const p = room.ping || 0;
    if (p > 1000 && PF.png <= 1000) { PF.pngT = performance.now(); TR("пинг вырос до " + Math.round(p) + " мс (" + (room.link === "p2p" ? "напрямую" : "через сервер") + ")" + (hs ? " · отправлено " + hs.stat.tx + " пакетов, " + Math.round(hs.stat.bytes / 1024) + " КБ, полных " + hs.stat.full + ", догонялок " + hs.stat.catchup : gs ? " · пропусков " + gs.stat.gaps + ", догонялок " + (gs.stat.catchups || 0) + ", полных " + gs.stat.fulls : "")); }
    else if (p < 500 && PF.png >= 1000) { PF.pngT = performance.now(); TR("пинг снова " + Math.round(p) + " мс"); }
    PF.png = p;
  }
}
function loop(now) {
  if (TFPS) setTimeout(() => loop(performance.now()), 1000 / TFPS); else requestAnimationFrame(loop);
  if (last && !TFPS) perfTrace(now - last);
  PF.sim = 0;
  const rdt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
  const tj0 = performance.now();
  const dt = Math.min(0.05, rdt);
  clock += dt;
  const live = started && G;
  // симуляция
  if (live && mode !== "guest") {
    const t0 = performance.now();
    const spd = ended ? 0 : G.spd == null ? 1 : G.spd;       // на экране итогов мир стоит, но связь с гостем идёт
    simAcc += dt * spd;
    let n = 0;
    while (simAcc >= 1 / 30 && n < 6) { simAcc -= 1 / 30; n++; if (bot) bot.tick(G, 1 / 30); S.step(G, 1 / 30); }
    if (G.spd === 0 && bot) { /* пауза — бот ждёт */ }
    if (drag && G.cards[drag.id]) S.moveI(G, me, drag.id, drag.x, drag.y);
    if (G.ev.length) { const evs = G.ev; G.ev = []; onEvents(evs); if (hs) hs.events(evs); }
    if (hs) hs.tick(dt);
    simMs += performance.now() - t0; PF.sim = performance.now() - t0;
    if (performance.now() - lastSave > 10000) idleSave();
    // курсор хозяина для гостя
    if (hs && room && room.peer && drag) { const d = { x: Math.round(drag.x), y: Math.round(drag.y + CH / 2), d: 1 }; if ((loop.ct = (loop.ct || 0) + dt) > (room.link === "p2p" ? 0.08 : 0.25)) { loop.ct = 0; room.sendFast("cu", d); } }
  } else if (live && mode === "guest") {
    gs.extrapolate(dt);
    if (performance.now() - lastSave > 10000) idleSave();
    netWatch(dt);
    if (ghost) { const c = G.cards[ghost.id]; if (!c || (c.drag === 0 && Math.abs(c.x - ghost.x) + Math.abs(c.y - ghost.y) < 260) || clock - ghost.t > 1.6 || ghost.sell) ghost = ghost.sell && c && clock - ghost.t < 1.2 ? ghost : null; }
  }
  // камера
  if (cam.goal) { const g = cam.goal; const k = Math.min(1, dt * 3.5); cam.tx += (g.tx - cam.tx) * k; cam.tz += (g.tz - cam.tz) * k; if (g.dist) cam.dist += (g.dist - cam.dist) * k; g.t -= dt; if (g.t <= 0) cam.goal = null; }
  else if (!ptrs.size && (Math.abs(cam.vx) + Math.abs(cam.vz) > 0.1)) { panBy(cam.vx, cam.vz); cam.vx *= 0.88; cam.vz *= 0.88; }
  if (drag) { const e = 48, sp = 9 * dt * cam.dist / 12; if (drag.sx < e) cam.tx -= sp; if (drag.sx > W - e) cam.tx += sp; if (drag.sy < 150) cam.tz -= sp; if (drag.sy > H - 150 && !sellHot) cam.tz += sp; clampCam(); moveDrag(drag.sx, drag.sy); }
  if (mode === "menu" || !started) { const t = clock * 0.05; cam.tx = BRX + Math.sin(t) * 2.4; cam.tz = 11.6 + Math.cos(t * 0.7) * 1.2; cam.dist = W < H ? 15.5 : 13; }
  placeCamera();
  const GG = started ? G : menuG;
  // мир
  const lights = cards.lights;
  world.update(dt, GG, cam, { lights });
  // карты
  const local = {};
  if (drag) local.drag = { id: drag.id, ids: drag.ids, x: drag.x, y: drag.y };
  else if (ghost && mode === "guest") local.drag = { id: ghost.id, ids: ghost.ids, x: ghost.x, y: ghost.y, settle: 1 };
  const hi = drag ? { target: hiT ? (hiT.cb ? hiT.id : S.root(G, hiT).id) : 0, bad: false } : null;
  cards.night = world.lampOn || 0;
  if (GG) cards.update(dt, GG, me, local, hi, Math.PI / 2 - cam.pitch);
  // огонь, дым, искры
  ambT += dt;
  if (GG && ambT > 0.06) {
    const k = ambT; ambT = 0;
    for (const id in GG.cards) {
      const c = GG.cards[id]; if (c.up) continue;
      const X = U(c._dx != null ? c._dx : c.x), Z = U(c._dy != null ? c._dy : c.y) + CD / 2;
      if (Math.abs(X - cam.tx) > 9 || Math.abs(Z - cam.tz) > 11) continue;
      if (c.k === "campfire") { fx.flame(X, (c._Y || 0) + 0.18, Z + 0.12); if (Math.random() < 0.5) fx.embers(X, (c._Y || 0) + 0.3, Z + 0.12); if (Math.random() < 0.3) fx.smoke(X, (c._Y || 0) + 0.5, Z + 0.12); }
      else if (c.k === "kitchen" || c.k === "hut") { if (Math.random() < (c.k === "kitchen" ? 0.5 : 0.18)) fx.smoke(X + 0.18, (c._Y || 0) + 0.95, Z + 0.02, 0.8); }
      else if (c.k === "smithy") { if (Math.random() < 0.4) fx.smoke(X - 0.15, (c._Y || 0) + 0.75, Z, 0.9); if (c.rc && Math.random() < 0.6) fx.embers(X + 0.1, (c._Y || 0) + 0.35, Z + 0.2); }
      else if (c.k === "crystalvein" && Math.random() < 0.2) fx.add.add(X + (Math.random() - 0.5) * 0.5, (c._Y || 0) + 0.3 + Math.random() * 0.3, Z + 0.1, 0, 0.2, 0, 1.2, 0.05, 0, fx.col.blue, 0, 0.8);
    }
    if (world.stage >= 5) { const [X, , Z] = wp(SITE_POS[0], SITE_POS[1]); fx.flame(BRX, 2.3, U(870)); fx.flame(BRX, 2.3, U(870)); fx.embers(BRX, 2.4, U(870)); }
    fx.ambient(k, cam.tx, cam.tz, GG ? GG.season : 1, world.night || 0, GG && GG.season === 0 && GG.day % 3 === 2 && GG.t > 30 && GG.t < 60);
  }
  fx.update(dt);
  drawOverlay(dt);
  // звук фона
  if (GG) {
    const dRiver = Math.abs(cam.tz - U(875)) / Math.max(4, cam.dist);
    let fire = 0; for (const l of lights) { const d = Math.hypot(l.X - cam.tx, l.Z - cam.tz); fire = Math.max(fire, 1 - d / 6); }
    ambience({ amb_river: 0.55 * Math.max(0.15, 1 - dRiver * 0.8), amb_birds: (1 - (world.night || 0)) * (GG.season === 3 ? 0.2 : 0.55), amb_night: (world.night || 0) * 0.6, fire: fire * 0.6 * (started ? 1 : 0.5) });
  }
  hudT += dt; if (live && hudT > 0.15) { hudT = 0; updHud(); updPairs(); loneHint(); if (drag) $("sell").classList.toggle("hot", sellHot); }
  // за окнами лобби и выбора ремёсел мир почти не виден — рисуем редко (экономим батарею и не мешаем сети)
  // меню и окна до старта: ровные ~30 кадров (за окнами лобби — 20) в пониженном разрешении, без теней.
  // Раньше за окнами рисовали раз в 0,4 с — на телефоне это выглядело как «фриз».
  const busyUi = !started && ((document.getElementById("lobby") && !document.getElementById("lobby").classList.contains("hidden")) || !$("roles").classList.contains("hidden") || !$("dlg").classList.contains("hidden"));
  menuRes(!started);
  if (!started && now - (loop.lr || 0) < (busyUi ? 48 : 31)) return;
  loop.lr = now;
  if (document.hidden || window.__noRender) return;
  const tj1 = performance.now();
  PF.hud = tj1 - tj0 - PF.sim;
  renderer.render(scene, camera);
  PF.rnd = performance.now() - tj1;
  if (live && window.__perf.js.length < 3000) { window.__perf.js.push(tj1 - tj0); window.__perf.gl.push(performance.now() - tj1); }
  // частота кадров: при постоянных тормозах снижаем качество
  if (live) {
    fpsAcc += rdt; fpsN++; fpsCheck += rdt;
    if (window.__perf.frames.length < 2000) window.__perf.frames.push(rdt * 1000);
    if (fpsCheck > 5) { const fps = fpsN / fpsAcc; fpsAcc = fpsN = fpsCheck = 0; if (fps < 36 && quality > 0 && !qLock) { quality--; applyQuality(); toast(L("Графика: ") + [L("низкая"), L("средняя"), L("высокая")][quality] + L(" (для плавности)")); } }
  }
  if (fpsEl) { fpsC++; if (now - fpsT > 500) { fpsEl.textContent = `${Math.round(fpsC * 1000 / (now - fpsT))} fps · ${renderer.info.render.calls} dc · ${Math.round(renderer.info.render.triangles / 1000)}k tri · q${quality} · sim ${(simMs / Math.max(1, fpsC)).toFixed(2)}ms · ${G ? Object.keys(G.cards).length : 0} cards`; fpsC = 0; fpsT = now; simMs = 0; } }
}

// раз в 30 с — сводка в журнал
setInterval(() => {
  if (!G || !started || document.hidden) return;
  const n = Object.keys(G.cards).length;
  TR("сводка: " + mode + " день " + G.day + " мост " + G.bridge + " карт " + n + " нарисовано " + (cards ? cards.mesh.count + "/" + cards.cap : "?") + " подписей " + (cards ? cards.quads.n + "/" + cards.quads.cap : "?") + (room && room.peer ? " связь " + (room.via || "") + " " + (room.ping != null ? Math.round(room.ping) + "мс" : "") : mode === "host" || mode === "guest" ? " нет связи" : ""));
}, 30000);
/* ---------- для автотестов и отладки ---------- */
window.__o2 = {
  get G() { return G; }, get mode() { return mode; }, get me() { return me; }, get started() { return started; }, get room() { return room; }, get hs() { return hs; }, get gs() { return gs; }, get partner() { return partner; },
  cam, S, project, s2w, renderer, scene, world: () => world, cards: () => cards,
  start: (m, opt) => { const g = S.newGame(Object.assign({ seed: 777, solo: m === "solo" }, opt || {})); start(m, g); return true; },
  load: (json, m) => { const g = S.deserialize(json); start(m || "bot", g); return Object.keys(g.cards).length; },
  join: (id) => { joinGame(id); return true; },
  hostLoad: (json) => { const g = S.deserialize(json); g.solo = 0; start("host", g); if (hs) hs.full(); return Object.keys(g.cards).length; },
  // перетащить карту id в точку (x, y) или на карту tid — как делает человек (через намерения)
  drag(id, tid, x, y) {
    const c = G.cards[id]; if (!c) return "no card";
    const t = tid ? G.cards[tid] : null; const tr = t ? (t.cb ? t : S.root(G, t)) : null;
    const tx = tr ? tr.x : x, ty = tr ? tr.y + S.stackH(G, tr) - CH + 20 : y;
    if (mode === "guest") { gs.send("pk", { i: id }); gs.send("mv", { i: id, x: tx, y: ty }, true); gs.send("dr", { i: id, x: tx, y: ty, t: tid || 0 }); return "sent"; }
    const r = S.pickI(G, me, id); if (r.err) return r.err;
    return S.dropI(G, me, id, tx, ty, tid || 0).res;
  },
  // эмуляция пальца: экранные координаты
  touch: { down: (x, y) => canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, pointerId: 9, bubbles: true })), move: (x, y) => canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, pointerId: 9, bubbles: true })), up: (x, y) => canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, pointerId: 9, bubbles: true })) },
  screenOf(id) { const c = G.cards[id]; if (!c) return null; const s = project(U(c._dx || c.x), 0.05, U(c._dy || c.y) + CD / 2 + 0.2); return { x: s.x, y: s.y }; },
  ff(sec) { if (mode === "guest") return; for (let t = 0; t < sec; t += 1 / 30) { if (bot) bot.tick(G, 1 / 30); S.step(G, 1 / 30); } const evs = G.ev; G.ev = []; onEvents(evs.filter((e) => e.t !== "eat")); if (hs) hs.events(evs); },
  buy, look(x, y, dist) { cam.tx = U(x); cam.tz = U(y); if (dist) cam.dist = dist; cam.goal = null; clampCam(); }, setDist(d) { cam.dist = d; },
  ping: (x, y, k) => { const msg = { x, y, k: k || "here" }; if (mode === "host" && room) room.send("pg", msg); else if (mode === "guest") gs.send("pg", msg); addPing(x, y, k || "here", me, false); },
  emote: (k) => { if (mode === "host" && room) room.send("em", { e: k }); else if (mode === "guest") gs.send("em", { e: k }); showEmote(k, me, false); },
  setBot(on, skill) { bot = on ? makeBot(1 - me, { skill: skill || "good" }) : null; },
  quality: (q) => { quality = q; qLock = true; applyQuality(); },
  showEnd: (w) => endScreen(w), banner, toast, onEvents,
};
boot().catch((e) => { console.error(e); loadtx.textContent = L("Не удалось загрузить: ") + (e && e.message || e); });
