// «Красный фонарь» — оболочка: сохранение, интерфейс, звук, ввод, переходы между этапами.
import { renderer } from "./c3d.js";
import { GIRL, GIRLS, TYPES, CLIENTS, T2_HOSTS, T2_ALLEYS, T2_SHOP, T2_NIGHTS, SCENES, ART_BY } from "./data.js";
import { createT1, T1_UPG, T1_GOAL, upgCost } from "./t1.js";
import { createT2 } from "./t2.js";
import { createT3 } from "./t3.js";

const $ = (s) => document.querySelector(s);
const tg = window.Telegram && window.Telegram.WebApp;
try { tg && tg.ready(); tg && tg.expand(); tg && tg.disableVerticalSwipes && tg.disableVerticalSwipes(); tg && tg.setHeaderColor && tg.setHeaderColor("#120c1c"); } catch (_) {}

/* ---------- сохранение ---------- */
const KEY = "fonar_v1";
function fresh() {
  return { stage: 1, money: 0, scenes: ["SC18-T1-LOLA-1"], lost: 0,
    t1: { v: 2 },
    t2: null, t3: null };
}
function t2fresh() { return { night: 0, alleys: ["port", "fonar"], girls: ["lola", "mimi", "vivien", "carmen"], place: { lola: "fonar", mimi: "fonar", carmen: "fonar", vivien: "port" }, hosts: { fonar: "gosha" }, perfect: 0 }; }
function t3fresh() {
  const d = {}; for (const id of ["old", "port", "uni", "prosp", "market", "hills"]) d[id] = { own: false, heat: 0, pol: "even", mgr: null, mods: [] };
  d.old = { own: true, heat: 10, pol: "even", mgr: "gosha", mods: [] }; d.port = { own: true, heat: 20, pol: "even", mgr: "fabian", mods: [] };
  return { week: 1, rep: 2, audits: 2, d, mgr: {}, fired: [], sel: null };
}
let state;
try { state = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
if (!state || !state.t1) state = fresh();
if (state.t1.v !== 2) { state.t1 = { v: 2 }; state.money = Math.min(state.money, 200); } // старая версия первого этапа
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }

/* ---------- звук: записанные CC0-сэмплы из ../../promysel/audio ---------- */
const SND = { buy: "upgrade", cash: "coins", pick: "click", ok: "confirm", tick: "coin", bad: "error", alarm: "bell", promo: "levelup", door: "door", open: "open" };
let ac = null; const buf = {};
function unlockAudio() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; }
  for (const f of new Set(Object.values(SND).concat(["amb_wind"]))) fetch(`../../promysel/audio/${f}.mp3`).then((r) => r.arrayBuffer()).then((a) => ac.decodeAudioData(a)).then((b) => { buf[f] = b; if (f === "amb_wind") amb(b); }).catch(() => {});
}
function amb(b) { const s = ac.createBufferSource(); s.buffer = b; s.loop = true; const g = ac.createGain(); g.gain.value = 0.18; s.connect(g).connect(ac.destination); s.start(); }
const lastPlay = {};
function sfx(n) {
  const f = SND[n]; if (!ac || !buf[f]) return;
  const now = performance.now(); if (now - (lastPlay[n] || 0) < 60) return; lastPlay[n] = now;
  const s = ac.createBufferSource(); s.buffer = buf[f]; const g = ac.createGain(); g.gain.value = n === "tick" ? 0.25 : 0.7; s.connect(g).connect(ac.destination); s.start();
}
["pointerdown", "touchstart"].forEach((e) => addEventListener(e, unlockAudio, { capture: true, passive: true }));
function haptic(k) { try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(k === "heavy" ? "heavy" : k === "medium" ? "medium" : "light"); } catch (_) {} }

/* ---------- интерфейс ---------- */
let toastT = 0;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }
function tip(m) { const t = $("#tip"); t.textContent = m; t.style.display = m ? "block" : "none"; }
let shownMoney = -1;
function drawMoney() { const v = Math.floor(state.money); if (v !== shownMoney) { shownMoney = v; $("#money").textContent = "💰 " + v.toLocaleString("ru-RU"); } }
function addMoney(v, silent) { state.money = Math.max(0, state.money + v); drawMoney(); if (v > 0 && !silent) { const m = $("#money"); m.classList.add("bump"); setTimeout(() => m.classList.remove("bump"), 120); } }
function setProgress(f, txt) { $("#stageBar").style.width = Math.round(Math.min(1, f) * 100) + "%"; if ($("#stageTxt").textContent !== txt) $("#stageTxt").textContent = txt; }
let modalClose = null;
function modal(html, onMount, onClose) {
  $("#mbox").innerHTML = html; $("#modal").classList.add("on"); modalClose = onClose || null;
  $("#mbox").querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeModal));
  if (onMount) onMount($("#mbox"));
}
function closeModal() { $("#modal").classList.remove("on"); const f = modalClose; modalClose = null; if (f) f(); }
$("#modal").addEventListener("pointerdown", (e) => { if (e.target.id === "modal" && !$("#mbox").querySelector("[data-lock]")) closeModal(); });

function sceneCard(id) {
  const a = ART_BY[id];
  return `<div class="scene18"><div class="big">🔞</div><code>${id}</code><b>Заглушка сцены 18+</b><small>${a ? a.idea : ""}</small></div>`;
}
function unlockScene(id, msg) {
  if (state.scenes.includes(id)) return;
  state.scenes.push(id); save();
  toast("🔞 " + (msg || "Новая сцена в альбоме"));
  const b = $("#albumBtn"); b.style.boxShadow = "0 0 0 3px #ff6a8a, 0 0 20px #ff6a8a"; setTimeout(() => (b.style.boxShadow = ""), 3000);
}
function album() {
  modal(`<h2>Альбом сцен</h2><p class="muted">Открыто ${state.scenes.length} из ${SCENES.length}. На месте каждой сцены пока заглушка с ID — описание задумки в таблице арта.</p>
  <div class="album">${SCENES.map((s) => { const on = state.scenes.includes(s.id); return `<button class="it ${on ? "" : "lock"}" data-s="${s.id}"><code>${s.id}</code><span>${on ? "🔞 открыто" : "🔒 " + s.where.replace(/^Этап \d, /, "")}</span></button>`; }).join("")}</div>
  <button class="ghost" style="width:100%;margin-top:10px" data-close>Закрыть</button>`, (box) => {
    box.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { if (!state.scenes.includes(b.dataset.s)) return; modal(sceneCard(b.dataset.s) + `<button class="gold" style="width:100%" id="back">Назад</button>`, (bx) => (bx.querySelector("#back").onclick = album)); }));
  });
}
$("#albumBtn").onclick = album;

function menu() {
  modal(`<h2>Меню</h2><div class="menu-list">
    <button class="ghost" id="mHow">❓ Как играть на этом этапе</button>
    <button class="ghost" id="mAlbum">🔞 Альбом сцен</button>
    <p class="muted" style="margin:8px 0 0">Для теста механик — перейти сразу на этап:</p>
    <div class="dbg"><button class="ghost" data-st="1">Этап 1</button><button class="ghost" data-st="2">Этап 2</button><button class="ghost" data-st="3">Этап 3</button></div>
    <button class="ghost" id="mCash">+1000 💰 (тест)</button>
    <button class="ghost" id="mReset" style="color:#ff8a7a">🗑 Начать заново</button>
    <button class="gold" data-close>Продолжить</button></div>`, (box) => {
    box.querySelector("#mHow").onclick = () => howTo(state.stage);
    box.querySelector("#mAlbum").onclick = album;
    box.querySelector("#mCash").onclick = () => { addMoney(1000); closeModal(); };
    box.querySelector("#mReset").onclick = () => { if (confirmReset()) { state = fresh(); save(); location.reload(); } };
    box.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => { const s = +b.dataset.st; closeModal(); jumpTo(s); }));
  });
}
function confirmReset() { return window.confirm ? true : true; }
$("#menuBtn").onclick = menu;

const HOW = {
  1: `<div class="mech"><b>Этап 1 · Переулок.</b> Ты зазывала.<br>• Веди пальцем по экрану — идёшь. Постой у очереди — клиенты пойдут за тобой цепочкой. Подведи к свободной девушке.<br>• После клиента номер грязный 🧺: принеси бельё из прачечной.<br>• Выручка копится у места девушки — пройди по монетам.<br>• Бар даёт шампанское 🍾: отнеси девушке, и к ней можно вести VIP 👑 (платят втрое).<br>• Пузырь над клиентом — кого любит: ⚓ → 🔥, 🎓 → 🌸, 🎩 → 💎. Совпадение = ❤️ ×1,5.<br>• <b>Все улучшения — в Конторе 📒</b> справа: постой в жёлтом круге. Там же помощники, которые делают каждое звено сами.<br>• Новые девушки и бар открываются на розовых кругах прямо на своих местах.</div>`,
  2: `<div class="mech"><b>Этап 2 · Квартал.</b> Ты больше не ходишь — ты менеджер зазывал.<br>• Сверху видны 4 переулка. Клиенты идут из Порта (⚓), с Проспекта (🎩) и из Университета (🎓) волнами — расписание на полосе сверху.<br>• У каждого входа свой переулок: моряки ⚓ → Портовый, богачи 🎩 → Бульварный, студенты 🎓 → Садовый. Пока переулок закрыт, его гости идут в центральный Фонарный.<br>• <b>Перетащи девушку пальцем в другой переулок</b> (или тап по ней, потом по переулку). Ставь туда тех, кого любят его гости: ⚓ → 🔥, 🎓 → 🌸, 🎩 → 💎. Совпадение = ×1,6 и быстрее.<br>• Перед ночью план покажет, где не хватает нужной девушки, а стрелка — кого куда перетащить.<br>• Без зазывалы переулок обслуживает медленно и держит очередь до 3. Зазывалы нанимаются утром.<br>• 👮 Патруль: если в переулке очередь 2+ — штраф. <b>Тап по переулку</b> гасит фонари на 10 с, очередь уходит в другие.<br>• Ночь выполнена, если заработал цель. 4 ночи — повышение.</div>`,
  3: `<div class="mech"><b>Этап 3 · Город.</b> Ты менеджер менеджеров. Ход = неделя.<br>• Тап по району: назначь управляющего и курс — 🌙 Тихо / ⚖️ Ровно / 🔥 Напор (деньги против внимания властей).<br>• Управляющие присылают отчёты — но могут приворовывать. <b>🔍 Аудит</b> (2 в неделю) показывает правду.<br>• Внимание района 100 — облава, район потерян.<br>• Амбициозный управляющий с низкой лояльностью может уйти вместе с районом.<br>• Каждую неделю — событие с выбором.<br>• Цель: 5 районов и доход 4 200 за неделю.</div>`,
};
function howTo(st, then) { modal(HOW[st] + `<button class="gold" style="width:100%" data-close>Понятно</button>`, null, then); }

/* ---------- ввод: плавающий джойстик ---------- */
const input = { x: 0, z: 0 };
let joyId = null, jx = 0, jy = 0, downT = 0, downX = 0, downY = 0;
const canvas = $("#view");
let dragging = false;
canvas.addEventListener("pointerdown", (e) => {
  downT = performance.now(); downX = e.clientX; downY = e.clientY;
  if (state.stage === 2 && cur2 && cur2.dragStart(e.clientX, e.clientY)) { dragging = true; canvas.setPointerCapture(e.pointerId); return; }
  if (state.stage !== 1 || joyId !== null) return;
  joyId = e.pointerId; jx = e.clientX; jy = e.clientY;
  const j = $("#joy"); j.style.left = jx + "px"; j.style.top = jy + "px"; j.style.display = "block"; j.firstElementChild.style.transform = "";
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (dragging && cur2) { cur2.dragMove(e.clientX, e.clientY); return; }
  if (e.pointerId !== joyId) return;
  let dx = e.clientX - jx, dy = e.clientY - jy; const d = Math.hypot(dx, dy), R = 50;
  if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
  $("#joy").firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  const k = Math.min(1, d / R); const n = d > 4 ? 1 / Math.max(d, 0.001) : 0;
  input.x = (e.clientX - jx) * n * k; input.z = (e.clientY - jy) * n * k;
});
function endJoy(e) {
  if (dragging) { dragging = false; if (cur2 && Math.hypot(e.clientX - downX, e.clientY - downY) > 14) cur2.dragEnd(e.clientX, e.clientY); return; }
  if (state.stage === 2 && performance.now() - downT < 400 && Math.hypot(e.clientX - downX, e.clientY - downY) < 14 && cur2) cur2.tap(e.clientX, e.clientY);
  if (e.pointerId !== joyId) return;
  joyId = null; input.x = input.z = 0; $("#joy").style.display = "none";
}
canvas.addEventListener("pointerup", endJoy); canvas.addEventListener("pointercancel", endJoy);
addEventListener("keydown", (e) => { const k = e.key.toLowerCase(); if (k === "arrowleft" || k === "a") input.x = -1; if (k === "arrowright" || k === "d") input.x = 1; if (k === "arrowup" || k === "w") input.z = -1; if (k === "arrowdown" || k === "s") input.z = 1; });
addEventListener("keyup", () => { if (joyId === null) input.x = input.z = 0; });

/* ---------- приложение для этапов ---------- */
let cur1 = null, cur2 = null, cur3 = null, peekG = null;
const app = {
  get state() { return state; }, save, addMoney, toast, tip, sfx, haptic, setProgress, modal, closeModal, unlockScene,
  hint() {}, lost() { state.lost++; },
  peek(g) { peekG = g; $("#peek").style.display = g ? "block" : "none"; if (g) $("#peekBtn").textContent = `👁 Заглянуть к ${g.def.n}`; },
  promote(from) { promote(from); },
  office(on) { officeOn = on; if (on) { drawOffice(); sfx("open"); } $("#office").classList.toggle("on", on); },
  t1hud(o) { const h = `<span>💰 <b>+${Math.round(o.rate)}</b>/мин</span><span>⚙ <b>${o.auto}/${o.autoN}</b> помощников</span><span>🧺 ${o.linen}/${o.linMax}</span>${o.bar >= 0 ? `<span>🍾 ${o.bar}</span>` : ""}`; const e = $("#t1hud"); if (e.dataset.h !== h) { e.innerHTML = h; e.dataset.h = h; } if (officeOn) { if ((officeT += 1) % 20 === 0) drawOffice(); } },
  t2sel(g) { const el = $("#t2sel"); if (!g) { el.style.display = "none"; return; } el.style.display = "block"; el.innerHTML = `${g.def.n} ${TYPES[g.def.t].ic} ${TYPES[g.def.t].n} — любят ${Object.values(CLIENTS).filter((c) => c.likes === g.def.t && c.n !== "VIP").map((c) => c.ic + " " + c.n.toLowerCase()).join(", ")}.<br>Тапни переулок, куда её перевести`; },
  t2hud(o) { t2hud(o); },
  t2report(r) { t2report(r); },
};
$("#peekBtn").onclick = () => {
  if (!peekG) return; const id = `SC18-T1-${peekG.def.id.toUpperCase()}-1`;
  if (!state.scenes.includes(id)) { state.scenes.push(id); save(); }
  modal(sceneCard(id) + `<p class="muted">Здесь при открытой двери играет короткая сцена. Пока — заглушка: ID и описание задумки (полностью — в таблице арта).</p><button class="gold" style="width:100%" data-close>Закрыть дверь</button>`);
};

/* ---------- этап 1: Контора — все улучшения в одном месте ---------- */
let officeOn = false, officeT = 0, officeKey = "";
function drawOffice() {
  if (!cur1) return;
  const S = state.t1, money = state.money, lv = (id) => S.lv[id] || 0;
  const spent = Object.values(S.spent || {}).reduce((a, b) => a + b, 0);
  const ready = money >= T1_GOAL;
  h += `<button class="oc promo ${ready ? "ok" : ""}" data-promo ${ready ? "" : "disabled"}><div class="ic">🎩</div><div class="tx"><b>Повышение: менеджер квартала</b><span>${ready ? "Хватает — жми!" : `Накопи ${T1_GOAL.toLocaleString("ru-RU")}: сейчас ${Math.floor(money).toLocaleString("ru-RU")}`}</span><i class="bar"><u style="width:${Math.min(100, (money / T1_GOAL) * 100)}%"></u></i></div><div class="pr">💰 ${T1_GOAL.toLocaleString("ru-RU")}</div></button>`;
  let grp = "";
  for (const u of T1_UPG) {
    if (u.girl && u.girl !== "lola" && !S.un[u.girl]) continue;
    if (u.need && !S.un[u.need]) continue;
    if (u.g !== grp) { grp = u.g; h += `<div class="of-g">${grp}</div>`; }
    const l = lv(u.id), max = l >= u.max, c = max ? 0 : upgCost(u, l), ok = !max && money >= c;
    const dots = Array.from({ length: u.max }, (_, k) => `<i class="${k < l ? "on" : ""}"></i>`).join("");
    h += `<button class="oc ${ok ? "ok" : ""}" data-u="${u.id}" ${max ? "disabled" : ""}><div class="ic">${u.ic}</div><div class="tx"><b>${u.n}</b><span>${u.d}: ${u.v(l, S)}${max ? "" : ` → <em>${u.v(l + 1, S)}</em>`}</span><span class="dots">${dots}${S.spent[u.id] ? `<small>вложено ${S.spent[u.id]}</small>` : ""}</span></div><div class="pr">${max ? "MAX" : "💰 " + c.toLocaleString("ru-RU") + (ok ? "" : `<small>ещё ${(c - Math.floor(money)).toLocaleString("ru-RU")}</small>`)}</div></button>`;
  }
  if (h === officeKey) return; officeKey = h;
  $("#office").innerHTML = h;
  $("#office").querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => { if (cur1.buyUpg(b.dataset.u)) { officeKey = ""; drawOffice(); } else { sfx("bad"); toast("Не хватает денег"); } }));
  const pb = $("#office [data-promo]"); if (pb) pb.onclick = () => { if (state.money < T1_GOAL) return toast("Нужно 💰 " + T1_GOAL.toLocaleString("ru-RU")); addMoney(-T1_GOAL, true); app.office(false); promote(1); };
}

/* ---------- этап 2: интерфейс ---------- */
let tlBuilt = "";
function t2hud(o) {
  $("#t2name").textContent = o.def.n;
  $("#t2earn").textContent = Math.round(o.earned); $("#t2goalTxt").textContent = o.def.goal;
  $("#t2goal i").style.width = Math.min(100, (o.earned / o.def.goal) * 100) + "%";
  $("#t2goal i").style.background = o.earned >= o.def.goal ? "#ffd34d" : "#7ed957";
  const tl = $("#t2tl");
  if (tlBuilt !== o.def.n) {
    tlBuilt = o.def.n;
    tl.innerHTML = `<div class="now"></div>` + o.def.waves.map((w) => `<div class="w" style="left:${(w.at + 0.08) * 100}%">${CLIENTS[w.who].ic}</div>`).join("") + ["22", "23", "00", "01", "02", "03", "04"].map((h, i) => `<div class="hrs" style="left:${4 + (i / 6) * 92}%">${h}</div>`).join("");
  }
  tl.firstElementChild.style.left = o.f * 100 + "%";
  setProgress(state.t2.night / T2_NIGHTS.length, `Этап 2 · ночь ${Math.min(state.t2.night + 1, 4)}/4`);
  const pre = !o.on && !$("#modal").classList.contains("on");
  $("#t2pre").style.display = pre ? "block" : "none";
  if ((advT += 1) % 30 === 0) { const adv = t2advice(); if (o.on) tip(adv && $("#t2sel").style.display === "none" ? adv : ""); else { tip(""); if (pre && adv !== lastAdv) t2pre(); } lastAdv = adv; }
}
// куда пойдёт клиент: в свой переулок, если открыт, иначе в центральный Фонарный
const HOME = { sailor: "port", student: "sad", rich: "bulvar", vip: "bulvar" };
const ALN = Object.fromEntries(T2_ALLEYS.map((a) => [a.id, a.n]));
function t2analyze() {
  const plan = cur2.plan(), by = Object.fromEntries(plan.map((a) => [a.id, a]));
  const n = cur2.nightDef();
  const rows = [], problems = [];
  const seen = new Set();
  for (const w of n.waves) {
    if (seen.has(w.who)) continue; seen.add(w.who);
    const dest = by[HOME[w.who]] && by[HOME[w.who]].open ? HOME[w.who] : "fonar";
    const like = CLIENTS[w.who].likes, a = by[dest];
    const have = a.girls.filter((g) => g.t === like);
    const hour = ["22", "23", "00", "01", "02", "03"][Math.floor((w.at + 0.08) * 6)] + ":00";
    rows.push({ w, dest, like, have, hour });
    if (!have.length) {
      // кого можно перевести: девушку нужного типа из переулка, где она не нужна
      const needIn = new Set(n.waves.map((x) => { const d = by[HOME[x.who]] && by[HOME[x.who]].open ? HOME[x.who] : "fonar"; return d + ":" + CLIENTS[x.who].likes; }));
      let cand = null;
      for (const al of plan) for (const g of al.girls) if (g.t === like && al.id !== dest && (!needIn.has(al.id + ":" + like) || al.girls.filter((x) => x.t === like).length > 1)) cand = cand || { g, from: al.id };
      problems.push({ who: w.who, dest, like, cand, full: a.girls.length >= 3 });
    }
  }
  return { rows, problems, n };
}
function t2advice() {
  const { problems } = t2analyze();
  const p = problems[0];
  if (!p) { cur2.pointAt(null); return ""; }
  if (p.cand) { cur2.pointAt(p.cand.g.id, p.dest); return `Перетащи девушку ${TYPES[p.like].ic} ${p.cand.g.n} в ${ALN[p.dest]}: туда придут ${CLIENTS[p.who].ic}, они любят ${TYPES[p.like].ic}`; }
  cur2.pointAt(null);
  return `В ${ALN[p.dest]} нет ${TYPES[p.like].ic} для ${CLIENTS[p.who].ic} — найми девушку ${TYPES[p.like].ic} в «Найме»`;
}
let advT = 0, lastAdv = null;
function t2pre() {
  const { rows, n } = t2analyze();
  const adv = t2advice();
  $("#t2pre").innerHTML = `<h3>${n.n}</h3>
  <div class="fc"><b>Суть:</b> клиенты идут в свой переулок и ждут девушку, которую любят. Есть такая — платят ×1,6 и быстро. Нет — обслужат дольше и дешевле, очередь растёт, люди уходят. Цель ночи: заработать <b>💰 ${n.goal}</b>.</div>
  <div class="plan">${rows.map((r) => `<div class="pr ${r.have.length ? "ok" : "bad"}"><span class="t">${r.hour}</span><span class="w">${CLIENTS[r.w.who].ic} ${CLIENTS[r.w.who].n}${r.w.why ? `<small>${r.w.why}</small>` : ""}</span><span class="d">→ ${ALN[r.dest]}<small>любят ${TYPES[r.like].ic}</small></span><span class="s">${r.have.length ? "✓ " + r.have.map((g) => g.n).join(", ") : "✗ нет " + TYPES[r.like].ic}</span></div>`).join("")}</div>
  ${adv ? `<div class="adv">👉 ${adv}</div>` : `<div class="adv ok">✓ Расстановка хорошая. Можно начинать.</div>`}
  <div class="row2"><button class="ghost" id="t2shop">🛍 Найм · 💰 ${Math.floor(state.money)}</button><button class="gold" id="t2go">🌙 Начать ночь</button></div>`;
  $("#t2go").onclick = () => { cur2.pointAt(null); cur2.startNight(); };
  $("#t2shop").onclick = t2shop;
}
function t2report(r) {
  const last = state.t2.night >= T2_NIGHTS.length;
  const by = r.by || {};
  const typeRows = Object.entries(by).map(([t, v]) => `<tr><td>${CLIENTS[t].ic} ${CLIENTS[t].n}</td><td class="muted">обслужено ${v.s}</td><td><b>${v.l ? "ушли " + v.l : "все довольны"}</b></td></tr>`).join("");
  // совет: где больше всего ушло и почему
  const tips = [];
  let worst = null;
  for (const [al, m] of Object.entries(r.where || {})) for (const [t, k] of Object.entries(m)) if (!worst || k > worst.k) worst = { al, t, k };
  if (worst && worst.k >= 2) tips.push(`В ${ALN[worst.al]} не дождались ${worst.k} × ${CLIENTS[worst.t].ic}. Поставь туда ещё девушку ${TYPES[CLIENTS[worst.t].likes].ic} или найми зазывалу.`);
  if ((r.why || {}).full >= 3) tips.push(`${r.why.full} клиентов развернулись: все очереди были полны. Зазывала держит очередь до 6, новый переулок — ещё 3 места.`);
  if (r.fines) tips.push("Штраф: патруль застал очередь. Когда видишь ⚠️, тапни по переулку — фонари погаснут.");
  modal(`<h2>${r.ok ? "Ночь выполнена ✅" : "Цель не выполнена"}</h2>
    <p class="muted">Заработано <b style="color:#ffd34d">${Math.round(r.earned)}</b> из ${r.def.goal}. В кассе сейчас 💰 ${Math.floor(state.money)}.</p>
    <table class="rep">${typeRows}<tr><td>Штрафы 👮</td><td></td><td><b>${r.fines || 0}</b></td></tr></table>
    ${tips.length ? `<div class="mech">${tips.map((t) => "👉 " + t).join("<br>")}</div>` : ""}
    <p class="muted">${r.ok ? (last ? "Квартал работает как часы. Тебя зовут наверх." : "Утро: можно нанять людей и открыть переулки, потом следующая ночь.") : "Ночь придётся повторить. Деньги за неё остались у тебя — потрать их в «Найме»."}</p>
    ${last && r.ok ? `<button class="gold" style="width:100%" id="goUp">ПОВЫШЕНИЕ → этап 3</button>` : `<button class="gold" style="width:100%" data-close>Утро</button>`}`, (box) => { const g = box.querySelector("#goUp"); if (g) g.onclick = () => { closeModal(); promote(2); }; }, () => t2pre());
}
function t2shop() {
  const S = state.t2, money = Math.floor(state.money);
  const { problems } = t2analyze();
  const needT = new Set(problems.map((p) => p.like));
  const hireable = GIRLS.filter((g) => !S.girls.includes(g.id)).sort((a, b) => needT.has(b.t) - needT.has(a.t)).slice(0, 4);
  const open = T2_ALLEYS.filter((a) => S.alleys.includes(a.id));
  const freeHosts = T2_HOSTS.filter((h) => !Object.values(S.hosts).includes(h.id));
  const noHostAlleys = open.filter((a) => !S.hosts[a.id]).map((a) => a.n);
  const price = (c) => `<span class="price">💰 ${c}</span>${money < c ? `<small class="warn">не хватает ${c - money}</small>` : ""}`;
  const ALLEY_WHY = { bulvar: "сюда пойдут богачи 🎩 и VIP 👑 — сейчас они теснятся в Фонарном", sad: "сюда пойдут студенты 🎓 — сейчас они теснятся в Фонарном" };
  modal(`<h2>Найм и улучшения</h2>
    <div class="cash">В кассе: <b>💰 ${money}</b></div>
    <h3 class="sh">Девушки <small>· свободных мест: ${cur2.freeSlots()} (по 3 в переулке)</small></h3>
    <p class="muted">Каждая девушка — ещё один клиент одновременно. Бери тех, кого любят твои гости.</p>
    <div class="cards">${hireable.map((g) => `<button class="mcard ${needT.has(g.t) ? "on" : ""}" data-g="${g.id}"><div class="ph sm"><span>${g.art}</span></div><b>${g.n} ${TYPES[g.t].ic}</b><small>её любят ${Object.values(CLIENTS).filter((c) => c.likes === g.t).map((c) => c.ic).join("")}</small>${needT.has(g.t) ? "<em>советую: такой сейчас не хватает</em>" : ""}${price(260)}</button>`).join("")}</div>
    <h3 class="sh">Зазывалы</h3>
    <p class="muted">Без зазывалы очередь — до 3 человек, остальные уходят. С зазывалой — до 6, клиенты ждут дольше и обслуживаются быстрее. Он берёт свою долю.${noHostAlleys.length ? ` Сейчас без зазывалы: <b>${noHostAlleys.join(", ")}</b>.` : ""}</p>
    <div class="cards">${freeHosts.map((h) => { const c = Math.round(150 + h.speed * h.charm * 150); return `<button class="mcard" data-h="${h.id}"><div class="ph sm"><span>${h.art}</span></div><b>${h.n}</b><small>${h.note}<br>скорость ${h.speed} · обаяние ${h.charm} · доля ${Math.round(h.cut * 100)}%</small>${price(c)}</button>`; }).join("")}</div>
    <h3 class="sh">Квартал</h3>
    <div class="cards">${T2_SHOP.filter((it) => !(S.bought || []).includes(it.id)).map((it) => `<button class="mcard" data-i="${it.id}"><b>${it.n}</b><small>${it.k === "alley" ? ALLEY_WHY[it.v] + "; +3 места для девушек" : it.k === "ads" ? "больше клиентов каждую ночь" : "девушки освобождаются быстрее"}</small>${price(it.cost)}</button>`).join("")}</div>
    <button class="gold" style="width:100%" data-close>Готово</button>`, (box) => {
    box.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => {
      if (state.money < 260) return toast("Не хватает денег");
      if (cur2.freeSlots() <= 0) return toast("Нет мест: открой ещё переулок");
      addMoney(-260); cur2.hire(b.dataset.g); sfx("buy"); save(); toast(`${GIRL[b.dataset.g].n} в квартале. Перетащи её, куда нужно`); t2shop();
    }));
    box.querySelectorAll("[data-h]").forEach((b) => (b.onclick = () => {
      const h = T2_HOSTS.find((x) => x.id === b.dataset.h), cost = Math.round(150 + h.speed * h.charm * 150);
      if (state.money < cost) return toast("Не хватает денег");
      modal(`<h2>Куда поставить ${h.n}?</h2><div class="cards">${open.map((a) => `<button class="mcard" data-a="${a.id}"><b>${a.n}</b><small>${S.hosts[a.id] ? "сейчас: " + T2_HOSTS.find((x) => x.id === S.hosts[a.id]).n + " (заменит)" : "без зазывалы — очередь до 3"}</small></button>`).join("")}</div><button class="ghost" style="width:100%" id="bk">Назад</button>`, (bx) => {
        bx.querySelector("#bk").onclick = t2shop;
        bx.querySelectorAll("[data-a]").forEach((x) => (x.onclick = () => { addMoney(-cost); cur2.setHost(x.dataset.a, h.id); sfx("buy"); save(); t2shop(); }));
      });
    }));
    box.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => {
      const it = T2_SHOP.find((x) => x.id === b.dataset.i);
      if (state.money < it.cost) return toast("Не хватает денег");
      addMoney(-it.cost); (S.bought ||= []).push(it.id);
      if (it.k === "alley") cur2.openAlley(it.v);
      if (it.k === "ads") S.ads = 1;
      if (it.k === "rooms") S.rooms = 1;
      sfx("buy"); save(); t2shop();
    }));
  }, () => t2pre());
}

/* ---------- переходы ---------- */
const PROMO = {
  1: { h: "Новый управляющий квартала!", p: "Хозяйка квартала мадам Ада заметила шустрого зазывалу из переулка «У стены». Теперь у тебя четыре переулка, свои зазывалы и девушки.", mech: HOW[2] },
  2: { h: "Хозяин ночного города?", p: "Квартал приносит больше всех в Порт-Лантерне. Теперь тебе подчиняются управляющие районов. Только верить им на слово не стоит.", mech: HOW[3] },
};
let promoting = false;
function promote(from) {
  if (promoting) return; promoting = true; // повышение запускается один раз, пока не нажата кнопка
  sfx("promo"); haptic("heavy");
  const P = PROMO[from];
  modal(`<div class="news"><small>ВЕЧЕРНИЙ ВЕСТНИК · ПОРТ-ЛАНТЕРН</small><h1>${P.h}</h1><p>${P.p}</p></div>
    <p class="muted">Новая работа — новые правила:</p>${P.mech}<button class="gold" style="width:100%" data-close data-lock>Начать этап ${from + 1}</button>`, null, () => { jumpTo(from + 1, true); });
}
function jumpTo(st, fromPromo) {
  promoting = false;
  if (st >= 2 && !state.t2) state.t2 = t2fresh();
  if (st >= 3 && !state.t3) state.t3 = t3fresh();
  if (fromPromo && st === 2) state.money = Math.max(state.money, 300);
  if (fromPromo && st === 3) state.money = Math.max(state.money, 1000);
  if (!fromPromo && st === 2 && state.money < 300) state.money = 300;
  if (!fromPromo && st === 3 && state.money < 1000) state.money = 1000;
  state.stage = st; save();
  setStage(true);
}
function setStage(showHow) {
  tip(""); app.peek(null); $("#t2sel").style.display = "none"; app.office(false);
  $("#t1hud").style.display = state.stage === 1 ? "flex" : "none";
  $("#tip").style.cssText = state.stage === 2 ? "top:auto !important;bottom:calc(20px + var(--sab))" : "";
  cur1 = cur2 = null;
  const st = state.stage;
  $("#t2hud").style.display = st === 2 ? "flex" : "none";
  $("#t2pre").style.display = "none";
  $("#t3").style.display = st === 3 ? "flex" : "none";
  canvas.style.display = st === 3 ? "none" : "block";
  if (st === 1) { cur1 = createT1(app); cur1.resize(); }
  if (st === 2) { cur2 = createT2(app); cur2.resize(); tlBuilt = ""; t2pre(); }
  if (st === 3) { cur3 = createT3(app); setProgress(Math.min(1, (state.t3.week - 1) / 12), `Этап 3 · неделя ${state.t3.week}`); }
  drawMoney();
  if (showHow) howTo(st);
}
addEventListener("resize", () => { cur1 && cur1.resize(); cur2 && cur2.resize(); });

/* ---------- цикл ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (document.hidden) return;
  if ($("#modal").classList.contains("on") && state.stage === 1) dt = 0;
  if (cur1) { cur1.update(dt, input); cur1.render(); }
  if (cur2) { cur2.update(dt); cur2.render(); }
  if (state.stage === 3 && cur3) setProgress(Math.min(1, (state.t3.week - 1) / 12), `Этап 3 · неделя ${state.t3.week}`);
}

$("#startBtn").textContent = state.stage > 1 || state.t1.pad > 0 ? "Продолжить" : "Играть";
$("#startBtn").onclick = () => {
  unlockAudio();
  $("#start").style.display = "none";
  const first = !state.seenHow; state.seenHow = 1; save();
  setStage(first);
};
// превью без кнопки старта (для проверок): ?go=1&stage=2
const qs = new URLSearchParams(location.search);
if (qs.get("stage")) { state.stage = +qs.get("stage"); if (state.stage >= 2 && !state.t2) state.t2 = t2fresh(); if (state.stage >= 3 && !state.t3) state.t3 = t3fresh(); }
if (qs.get("go")) { $("#start").style.display = "none"; state.seenHow = 1; setStage(false); }
drawMoney();
requestAnimationFrame(frame);
window.__fonar = { get state() { return state; }, input, app, get t1() { return cur1; }, get t2() { return cur2; } };
// для автотестов: прокрутить игру без отрисовки
window.__fonar.sim = (sec, inp) => { const n = Math.round(sec / 0.033); for (let i = 0; i < n; i++) { if (cur1) cur1.update(0.033, inp || input); if (cur2) cur2.update(0.033); } };
let fpsN = 0, fpsT = performance.now(); window.__fonar.fps = 0;
(function fpsLoop() { fpsN++; const now = performance.now(); if (now - fpsT > 1000) { window.__fonar.fps = fpsN; fpsN = 0; fpsT = now; } requestAnimationFrame(fpsLoop); })();
