// «Отряд» — меню, магазин, облик, HUD, сохранение, Telegram. Два режима: «Забег» (runner.js) и «Пушка» (gun.js).
import { Engine, COLORS, HATS, loadAssets } from "./core.js";
import { Runner } from "./runner.js";
import { Gun } from "./gun.js";
import { RUN_CFG, RUN_LEVELS, levelDef, upCostRun, WEAPONS } from "./levels.js";
import { CFG as GCFG, LEVEL_COUNT as GUN_LEVELS, levelInfo, upCost as upCostGun } from "./gun-sim.js";
import { S, load, save } from "./save.js";
import { play, music, applyVol, unlock } from "./audio.js";

const T = window.TG, $ = (id) => document.getElementById(id);
const L = window.L || ((s) => s);
const GAME_ID = "otryad", BEST_KEY = "otryad_best";
const Q = new URLSearchParams(location.search);

const eng = new Engine($("gl"));
const hud = makeHud();
let runner = null, gun = null;
let mode = "run", active = null, state = "menu", paused = false, curLevel = 1, last = 0;

const clampQ = (q) => Math.max(0, Math.min(2, q | 0));
const look = () => ({ color: (COLORS[S.col] || COLORS.blue).hex, hat: S.hat || "none" });

// ---------- HUD ----------
function makeHud() {
  let toastT = 0, coinsShown = 0;
  return {
    count(n, pop) { const el = $("h-count"); el.textContent = mode === "run" ? n : ""; if (pop) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); } },
    progress(f) { $("h-prog").firstChild.style.width = (f * 100).toFixed(1) + "%"; },
    timer(s) { const el = $("h-timer"); if (s == null) { el.style.display = "none"; return; } el.style.display = ""; el.textContent = "⏱ " + s; el.classList.toggle("low", s <= 5); },
    toast(t) { const el = $("toast"); el.textContent = t; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); },
    float(t, cls) { const el = document.createElement("div"); el.className = "fl " + (cls || ""); el.textContent = t; $("floats").appendChild(el); setTimeout(() => el.remove(), 1000); },
    hint(t, kind) { const el = $("hint"); if (!t) { el.classList.remove("on"); return; } el.innerHTML = (kind === "drag" ? '<span class="hand">👆</span>' : "") + t.replace(/^👆\s*/, ""); el.classList.add("on"); },
    wave(i, n) { $("h-wave").textContent = `Волна ${i}/${n}`; },
    hp(f, v) { $("b-hp").firstChild.style.width = Math.max(0, f * 100) + "%"; $("b-hp").lastChild.textContent = "Пушка " + Math.max(0, Math.ceil(v || 0)); },
    heat(f, lock, rapid) { const b = $("b-heat"); b.firstChild.style.width = f * 100 + "%"; b.classList.toggle("lock", !!lock); b.classList.toggle("rapid", !!rapid); const t = rapid ? "Скорострельность!" : lock ? "Перегрев!" : "Нагрев"; if (b.lastChild.textContent !== t) b.lastChild.textContent = t; },
    charge(f, ready, on) { const b = $("champ"); const d = on && mode === "gun" ? "block" : "none"; if (b.style.display !== d) b.style.display = d; if (!on) return; const p = Math.round(f * 100) + "%"; if (b._f !== p) { b._f = p; b.style.setProperty("--f", p); } b.classList.toggle("ready", !!ready); },
    weapon(t) { const el = $("h-weapon"); if (!t) { el.style.display = "none"; return; } el.style.display = ""; el.textContent = t; },
    hurt() { const el = $("hurt"); el.classList.add("on"); setTimeout(() => el.classList.remove("on"), 60); },
    end(res) { onEnd(res); }
  };
}
function setCoins() { ["m-coins", "s-coins", "l-coins", "h-coins", "b-coins"].forEach((id) => { const el = $(id); if (el) el.textContent = S.coins; }); }

// ---------- экраны ----------
const SCREENS = ["screen-menu", "screen-levels", "screen-shop", "screen-look", "screen-pause", "screen-end", "screen-barracks", "screen-chest"];
function show(id) { SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id)); $("snd").classList.toggle("hidden", id !== "screen-menu"); }
function toMenu() {
  state = "menu"; paused = false;
  $("hud").classList.add("hidden"); hud.hint(null);
  // фон меню — начало текущего уровня забега, толпа ждёт
  mode = "run"; active = runner; curLevel = S.run.lv;
  runner.auto = false; runner.speedUp = 1;
  runner.load(curLevel, runUps(), look());
  updMenu(); show("screen-menu");
  music("");
}
function updMenu() {
  setCoins();
  $("m-run-lv").textContent = `Уровень ${S.run.lv}`;
  const gs = Object.values(S.gun.st).reduce((a, b) => a + b, 0);
  $("m-gun-lv").textContent = `Уровень ${S.gun.max}` + (gs ? ` · ★${gs}` : "");
  $("m-barracks").classList.toggle("dot", S.chests > 0 || canUpgradeCard());
  if (challenge) { $("challenge").classList.remove("hidden"); $("challenge").textContent = `${challenge.name} прошёл ${challenge.score} уровней в «Отряде». Догонишь?`; }
}
function startLevel(m, n) {
  mode = m; curLevel = n; paused = false;
  active = m === "run" ? runner : gun;
  if (m === "run") { gun.dispose(); runner.load(n, runUps(), look()); }
  else { runner.dispose(); gun.load(n, Object.assign({}, S.gun.up, { cards: S.cards }), look()); }
  hud.charge(0, false, false); if (m === "gun") hud.weapon(null);
  show(null);
  $("hud").classList.remove("hidden");
  $("h-lv").textContent = (m === "run" ? "🏃 " : "💣 ") + `Уровень ${n}`;
  $("h-prog").style.display = m === "run" ? "" : "none";
  $("h-wave").style.display = m === "gun" ? "" : "none";
  $("gunbars").style.display = m === "gun" ? "block" : "none";
  $("h-count").textContent = m === "run" ? Math.round(runner.count) : "";
  const tg = $("tapgo"); tg.style.display = "block";
  tg.textContent = m === "run" ? "Коснись и веди пальцем" : "Веди — пушка едет. Держи — огонь!";
  if (m === "run") { const d = runner.def; if (d.f === "boss" || d.f === "castle" || d.tm) setTimeout(() => hud.toast(d.f === "boss" ? "Уровень с великаном" : d.f === "castle" ? "Штурм крепости" : "Успей до моста!"), 300); }
  else if (levelInfo(n).boss) setTimeout(() => hud.toast("Уровень с великаном"), 300);
  setCoins();
  state = "play";
  music("m_battle2");
  if (Q.get("bot") || window.__autoBot) { if (m === "run") { runner.auto = true; runner.autoKind = window.__autoBot === "runrandom" ? "random" : "skilled"; runner.start(); } else { gun.setAuto(window.__autoBot || "skilled"); gun.start(); } tg.style.display = "none"; }
  Stats.gameStart({ mode: m, level: n });
  Stats.state({ mode: m, level: n });
}
function onEnd(res) {
  if (state !== "play") return;
  state = "end";
  $("hud").classList.add("hidden"); hud.hint(null);
  music(res.win ? "m_win" : "m_lose");
  S.coins += res.coins; S.plays = (S.plays || 0) + 1;
  let first = false;
  if (mode === "run") {
    if (res.win) { first = curLevel >= S.run.max; S.run.max = Math.max(S.run.max, curLevel + 1); S.run.lv = curLevel + 1; }
  } else if (res.win) {
    first = curLevel >= S.gun.max;
    S.gun.max = Math.max(S.gun.max, curLevel + 1); S.gun.st[curLevel] = Math.max(S.gun.st[curLevel] || 0, res.stars);
  }
  // сундук каждые 3 победы; первая победа на некоторых уровнях дарит карту бойца
  let newCard = null;
  if (res.win) {
    S.wins = (S.wins || 0) + 1; if (S.wins % 3 === 0) S.chests = (S.chests || 0) + 1;
    const fc = FIRST_CARD[mode][curLevel], key = mode + curLevel;
    if (fc && !S.got[key]) { S.got[key] = 1; newCard = fc; addShards(fc, 1); }
  }
  save(true);
  const score = S.run.max - 1 + S.gun.max - 1;
  T.loadBest(BEST_KEY, (b) => { if (score > b) T.saveBest(BEST_KEY, score); });
  Stats.gameEnd({ mode, level: curLevel, win: res.win, coins: res.coins, mult: res.mult, stars: res.stars, max: res.max });
  // экран итогов
  $("end-emoji").textContent = res.win ? (mode === "gun" ? "💣" : "🏆") : "💥";
  $("end-title").textContent = res.win ? "Победа!" : "Поражение";
  let big = "";
  const mfmt = (m) => "×" + String(m).replace(".", ",");
  if (mode === "run" && res.win) big = `<div class="mult">${mfmt(res.mult)}</div>`;
  if (mode === "gun" && res.win) big = `<div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= res.stars ? "" : "off"}">⭐</span>`).join("")}</div>`;
  $("end-big").innerHTML = big;
  const rows = [];
  if (mode === "run") {
    if (res.win) rows.push(["Лучший отряд", res.max], ["Ступенька", mfmt(res.mult)]);
    else rows.push(["Пройдено", Math.round(res.progress * 100) + "%"], ["Лучший отряд", res.max]);
  } else {
    rows.push(["Пушка", `${res.hp}/${res.maxHp}`], ["Сбито врагов", res.kills], ["Бойцов в бою", res.made]);
  }
  if (mode === "gun" && res.win && (res.champs || res.crates)) rows.push(["Чемпионы / ящики", `${res.champs || 0} / ${res.crates || 0}`]);
  if (mode === "run" && res.win && runner.weapon) rows.push(["Оружие", WEAPONS[runner.weapon].icon + " " + WEAPONS[runner.weapon].name]);
  rows.push(["Монеты", "+" + res.coins + " 🪙"]);
  if (newCard) rows.push(["Новая карта!", CARDS[newCard].ic + " " + CARDS[newCard].name]);
  rows.push(["До сундука", S.chests > 0 ? `🎁 готов: ${S.chests}` : `🎁 ${S.wins % 3}/3`]);
  let html = rows.map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join("");
  if (!res.win) html += `<p class="tip">${mode === "run" ? (res.why === "time" ? "Ищи голубые дорожки-ускорители и обходи грязь." : runTip()) : "Подъезжай под «×» — ворота двигаются, бери упреждение. Отстреливай ящики, береги чемпиона на великанов. Улучшения — в «Силе»."}</p>`;
  if (res.win && first && mode === "run" && curLevel % 5 === 4) html += `<p class="tip">Дальше — уровень с великаном 👹</p>`;
  $("end-sub").innerHTML = html;
  const B = $("end-buttons"); B.innerHTML = "";
  const btn = (t, cls, fn) => { const b = document.createElement("button"); b.className = "btn " + (cls || ""); b.textContent = t; b.onclick = fn; B.appendChild(b); };
  if (res.win) btn("▶ Дальше: уровень " + (curLevel + 1), "primary", () => startLevel(mode, curLevel + 1));
  else btn("🔁 Ещё раз", "primary", () => startLevel(mode, curLevel));
  if (S.chests > 0) btn(`🎁 Открыть сундук (${S.chests})`, "gold", () => openChest(true));
  else if (newCard) btn("🛡 В казарму", "", () => openBarracks(true));
  btn("⬆️ Сила отряда", "", () => openShop(mode, true));
  btn("📨 Вызов другу", "", () => T.shareChallenge(GAME_ID, score, `Мой отряд прошёл уже ${score} уровней в «Отряде» 🏃💣 Сможешь дальше?`));
  btn("В меню", "ghost", () => toMenu());
  show("screen-end");
}

// ---------- уровни ----------
let lvMode = "run";
function openLevels(m) {
  lvMode = m || lvMode;
  document.querySelectorAll("#lv-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.m === lvMode));
  const G = $("lv-grid"); G.innerHTML = "";
  const max = lvMode === "run" ? S.run.max : S.gun.max, total = Math.max(lvMode === "run" ? RUN_LEVELS : GUN_LEVELS, max);
  for (let n = 1; n <= total; n++) {
    const b = document.createElement("button"); b.className = "lvb"; b.textContent = n;
    let sp = "";
    if (lvMode === "run") { const d = levelDef(n); sp = d.f === "boss" ? "👹" : d.f === "castle" ? "🏰" : d.tm ? "⏱" : d.new ? "✨" : d.s.some((x) => x.t === "split") ? "🔀" : ""; }
    else { const li = levelInfo(n); if (li.boss) sp = "👹"; else if (li.news) sp = "✨"; const st = S.gun.st[n] || 0; if (st) { const s = document.createElement("small"); s.textContent = "★".repeat(st); b.appendChild(s); } }
    if (sp) { const s = document.createElement("span"); s.className = "sp"; s.textContent = sp; b.appendChild(s); }
    if (n > max) { b.classList.add("lock"); b.disabled = true; }
    else if (n === max) b.classList.add("cur"); else b.classList.add("done");
    b.onclick = () => { play("click"); if (lvMode === "run") S.run.lv = n; startLevel(lvMode, n); };
    G.appendChild(b);
  }
  $("lv-tip").textContent = lvMode === "run" ? "👹 — великан, 🏰 — крепость, ⏱ — на время, ✨ — новинка, 🔀 — развилка" : "👹 — великан, ✨ — новинка. Звёзды — сколько прочности пушки осталось.";
  show("screen-levels");
}

// ---------- магазин ----------
let shopMode = "run", shopBack = false;
const RUN_UP = [
  ["start", "🧑‍🤝‍🧑", "Новобранцы", (l) => `+${RUN_CFG.startPerUp} бойца на старте (сейчас ${RUN_CFG.startUnits + RUN_CFG.startPerUp * l})`, 12],
  ["atk", "⚔️", "Сила удара", (l) => `+${Math.round(RUN_CFG.atkK * 100)}% урона по красным (сейчас +${Math.round(RUN_CFG.atkK * 100 * l)}%)`, 12],
  ["hp", "🛡️", "Броня", (l) => `Меньше потерь в схватке (сейчас −${Math.round((1 - 1 / (1 + RUN_CFG.hpK * l)) * 100)}%)`, 12],
  ["inc", "🪙", "Доход", (l) => `+${Math.round(RUN_CFG.incK * 100)}% монет за уровень (сейчас +${Math.round(RUN_CFG.incK * 100 * l)}%)`, 10],
  ["shots", "🎯", "Меткость", (l) => `Толпа чаще стреляет по воротам «↑» и бочкам (+${Math.round(RUN_CFG.shot.upK * 100 * l)}%)`, 6],
  ["cannon", "💥", "Боевая пушка", (l) => `Залп пушки на дороге сильнее (+${Math.round(RUN_CFG.cannonUp * 100 * l)}%)`, 5],
  ["mastery", "⚔️", "Мастерство оружия", (l) => `Копья, топоры, арбалеты и щиты сильнее (+${Math.round(RUN_CFG.mastery * 100 * l)}%)`, 5]
];
const GUN_UP = [
  ["rate", "⚡", "Скорострельность", (l) => `+${Math.round(GCFG.up.rate.k * 100)}% выстрелов и остывания (сейчас +${Math.round(GCFG.up.rate.k * 100 * l)}%)`, GCFG.up.rate.max],
  ["shot", "👥", "Бойцов за выстрел", (l) => `+${GCFG.up.shot.k} бойца в каждом залпе (сейчас ${(1 + GCFG.up.shot.k * l).toFixed(2).replace(/\.?0+$/, "")})`, GCFG.up.shot.max],
  ["gate", "✨", "Сила ворот", (l) => `Запас «+N» больше, «×N» иногда даёт лишнего (сейчас +${Math.round(GCFG.up.gate.k * 100 * l)}%)`, GCFG.up.gate.max],
  ["hp", "🧱", "Прочность пушки", (l) => `+${Math.round(GCFG.up.hp.k * 100)}% прочности (сейчас ${Math.round(GCFG.cannon.hp * (1 + GCFG.up.hp.k * l))})`, GCFG.up.hp.max],
  ["barrel", "🔫", "Ещё ствол", (l) => `Пушка стреляет из ${l + 2} стволов сразу (сейчас ${l + 1})`, GCFG.up.barrel.max],
  ["charge", "🦸", "Заряд чемпиона", (l) => `Чемпион копится быстрее и крепче (+${Math.round(GCFG.up.charge.k * 100 * l)}%)`, GCFG.up.charge.max]
];
function openShop(m, fromEnd) {
  shopMode = m || shopMode; shopBack = !!fromEnd;
  document.querySelectorAll("#shop-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.m === shopMode));
  setCoins();
  const list = $("shop-list"); list.innerHTML = "";
  const src = shopMode === "run" ? RUN_UP : GUN_UP, ups = shopMode === "run" ? S.run.up : S.gun.up;
  for (const [k, ic, name, desc, max] of src) {
    const l = ups[k] || 0, cost = shopMode === "run" ? upCostRun(l, k) : upCostGun(k, l);
    const row = document.createElement("div"); row.className = "up";
    row.innerHTML = `<div class="ic">${ic}</div><div class="tx"><b>${name}</b><span>${desc(l)}</span><div class="dots">${"●".repeat(l)}${"○".repeat(Math.max(0, max - l))}</div></div>`;
    const b = document.createElement("button"); b.className = "btn buy primary";
    if (l >= max) { b.textContent = "Макс."; b.disabled = true; }
    else { b.textContent = cost + " 🪙"; b.disabled = S.coins < cost; }
    b.onclick = () => { if (S.coins < cost || l >= max) { play("error"); return; } S.coins -= cost; ups[k] = l + 1; save(); play("upgrade"); T.haptic("notify", "success"); Stats.event("upgrade", { mode: shopMode, k, lv: l + 1 }); openShop(shopMode, shopBack); };
    row.appendChild(b); list.appendChild(row);
  }
  show("screen-shop");
}
// ---------- облик ----------
function openLook() {
  setCoins();
  const mk = (box, dict, cur, owned, key) => {
    box.innerHTML = "";
    for (const id in dict) {
      const it = dict[id], b = document.createElement("button"); b.className = "swb" + (cur === id ? " on" : "");
      b.innerHTML = (key === "col" ? `<div class="c" style="background:#${it.hex.toString(16).padStart(6, "0")}"></div>` : `<span class="e">${{ none: "🙂", helmet: "⛑️", cap: "🧢", horns: "🐮", party: "🥳", tophat: "🎩", crown: "👑" }[id]}</span>`) + it.name + (owned[id] ? "" : `<span class="pr">${it.price} 🪙</span>`);
      b.onclick = () => {
        if (!owned[id]) { if (S.coins < it.price) { play("error"); T.haptic("notify", "error"); return; } S.coins -= it.price; owned[id] = 1; play("buy"); T.haptic("notify", "success"); Stats.event("cosmetic", { key, id }); }
        else play("click");
        S[key] = id; save(); openLook();
        runner.load(S.run.lv, runUps(), look());
      };
      box.appendChild(b);
    }
  };
  mk($("look-col"), COLORS, S.col, S.cols, "col");
  mk($("look-hat"), HATS, S.hat, S.hats, "hat");
  show("screen-look");
}

// ---------- казарма: карты бойцов ----------
const CARDS = {
  scout:  { ic: "🏃", name: "Бегуны", run: (l) => `Забег: +${3 * l} бегунов на старте, ловушки их почти не берут`, gun: () => "" },
  brute:  { ic: "💪", name: "Громилы", run: (l) => `Забег: +${Math.min(5, l)} громил на старте, каждый бьёт за пятерых`, gun: (l) => `Пушка: громила каждые ${GCFG.cards.bruteEvery[Math.min(5, l)]} выстрелов` },
  archer: { ic: "🏹", name: "Лучники", run: (l) => `Забег: +${2 * l} лучников — залп до схватки`, gun: () => "" },
  shield: { ic: "🛡️", name: "Щитоносцы", run: (l) => `Забег: +${2 * l} щитоносцев — меньше потерь`, gun: (l) => `Пушка: ${Math.round(GCFG.cards.shieldChance[Math.min(5, l)] * 100)}% бойцов со щитом` },
  champ:  { ic: "🦸", name: "Чемпион", run: (l) => `Забег: золотой чемпион на старте (+${15 * Math.max(0, l - 1)}% силы)`, gun: (l) => `Пушка: заряд чемпиона быстрее на ${10 * l}%` }
};
const CARD_NEED = [1, 3, 6, 10, 15], CARD_COST = [0, 150, 400, 900, 1800], CARD_MAX = 5;
// первая победа на этих уровнях дарит карту (так новые бойцы появляются по одному, вместе с подсказкой)
const FIRST_CARD = { run: { 4: "brute", 6: "archer", 9: "shield", 13: "scout", 16: "champ" }, gun: { 4: "champ", 6: "brute", 10: "shield" } };
function runUps() { return Object.assign({}, S.run.up, { cards: S.cards }); }
function runTip() { const d = runner && runner.def; if (d && d.f === "castle") return "На крепость лучше топоры, на великана — копья. Заводи бойцов в боевую пушку."; if (d && d.f === "boss") return "Против великана бери копья. Стреляй по воротам «↑» — они растут."; return "Стреляй по воротам «↑» и бочкам, обходи ловушки, а монеты вложи в «Силу» и «Казарму»."; }
function addShards(k, n) {
  S.shards[k] = (S.shards[k] || 0) + n;
  if (!S.cards[k] && S.shards[k] >= CARD_NEED[0]) { S.shards[k] -= CARD_NEED[0]; S.cards[k] = 1; return true; }
  return false;
}
function canUpgradeCard() { for (const k in CARDS) { const l = S.cards[k] || 0; if (l > 0 && l < CARD_MAX && S.shards[k] >= CARD_NEED[l] && S.coins >= CARD_COST[l]) return true; } return false; }
let barBack = false;
function openBarracks(fromEnd) {
  barBack = !!fromEnd; setCoins();
  $("bar-chest").classList.toggle("hidden", !(S.chests > 0)); $("bar-chest").textContent = `🎁 Открыть сундук (${S.chests})`;
  $("bar-prog").textContent = `Сундук — каждые 3 победы (${(S.wins || 0) % 3}/3)`;
  const list = $("bar-list"); list.innerHTML = "";
  for (const k in CARDS) {
    const C = CARDS[k], l = S.cards[k] || 0, need = CARD_NEED[Math.min(l, CARD_MAX - 1)], cost = CARD_COST[Math.min(l, CARD_MAX - 1)];
    const row = document.createElement("div"); row.className = "up card-row" + (l ? "" : " locked");
    const eff = l ? [C.run(l), C.gun(l)].filter(Boolean).join("<br>") + `<br>+${10 * l}% силы этих бойцов` : "Пока закрыт. Карты — в сундуках и за новые уровни";
    row.innerHTML = `<div class="ic">${C.ic}</div><div class="tx"><b>${C.name}${l ? ` · ур. ${l}` : ""}</b><span>${eff}</span><div class="shards"><i style="width:${Math.min(100, (S.shards[k] || 0) / need * 100)}%"></i><em>${l >= CARD_MAX ? "Макс." : `${S.shards[k] || 0}/${need} карт`}</em></div></div>`;
    const b = document.createElement("button"); b.className = "btn buy primary";
    if (!l) { b.textContent = "🔒"; b.disabled = true; }
    else if (l >= CARD_MAX) { b.textContent = "Макс."; b.disabled = true; }
    else { b.textContent = cost + " 🪙"; b.disabled = S.coins < cost || (S.shards[k] || 0) < need; }
    b.onclick = () => { if (b.disabled) { play("error"); return; } S.coins -= cost; S.shards[k] -= need; S.cards[k] = l + 1; save(); play("levelup"); T.haptic("notify", "success"); Stats.event("card", { k, lv: l + 1 }); openBarracks(barBack); };
    row.appendChild(b); list.appendChild(row);
  }
  show("screen-barracks");
}
function openChest(fromEnd) {
  if (!(S.chests > 0)) { openBarracks(fromEnd); return; }
  S.chests--; barBack = !!fromEnd;
  // 3 карты: чаще те, что слабее; плюс монеты
  const keys = Object.keys(CARDS), got = {}, opened = [];
  for (let i = 0; i < 3; i++) {
    const w = keys.map((k) => (CARD_MAX + 1 - (S.cards[k] || 0)) * (k === "champ" ? 0.5 : 1)), sum = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum, k = keys[0]; for (let j = 0; j < keys.length; j++) { r -= w[j]; if (r <= 0) { k = keys[j]; break; } }
    got[k] = (got[k] || 0) + 1;
  }
  for (const k in got) if (addShards(k, got[k])) opened.push(k);
  const coins = 40 + 5 * (S.wins || 0); S.coins += coins;
  save(true); play("perk"); play("coin2", { vol: 0.7 }); T.haptic("notify", "success"); Stats.event("chest", { got });
  const box = $("chest-items"); box.innerHTML = "";
  let i = 0;
  for (const k in got) { const d = document.createElement("div"); d.className = "loot"; d.style.animationDelay = (i++ * 0.18) + "s"; d.innerHTML = `<span>${CARDS[k].ic}</span><b>${CARDS[k].name}</b><small>+${got[k]} ${got[k] === 1 ? "карта" : "карты"}${opened.includes(k) ? " · ОТКРЫТ!" : ""}</small>`; box.appendChild(d); }
  const d = document.createElement("div"); d.className = "loot"; d.style.animationDelay = (i * 0.18) + "s"; d.innerHTML = `<span>🪙</span><b>${coins}</b><small>монет</small>`; box.appendChild(d);
  $("chest-more").classList.toggle("hidden", !(S.chests > 0)); $("chest-more").textContent = `🎁 Ещё сундук (${S.chests})`;
  setCoins(); show("screen-chest");
}

// ---------- ввод ----------
let drag = null;
const cv = $("gl");
cv.addEventListener("pointerdown", (e) => {
  if (state !== "play" || paused) return;
  drag = { x: e.clientX, id: e.pointerId };
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  $("tapgo").style.display = "none";
  if (mode === "run") runner.start(); else gun.setFiring(true);
});
cv.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x; drag.x = e.clientX;
  if (mode === "run") runner.steer(dx, innerWidth); else gun.aimDrag(dx, innerWidth);
});
const up = (e) => { if (drag && drag.id === e.pointerId) drag = null; if (mode === "gun" && gun) gun.setFiring(false); };
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
// клавиатура (компьютер)
const keys = {};
addEventListener("keydown", (e) => { keys[e.key] = 1; if (state === "play" && (e.key === " " || e.key.startsWith("Arrow"))) { $("tapgo").style.display = "none"; if (mode === "run") runner.start(); else gun.setFiring(true); } });
addEventListener("keyup", (e) => { keys[e.key] = 0; if (e.key === " " && mode === "gun") gun.setFiring(false); });

// ---------- кнопки ----------
$("m-run").onclick = () => startLevel("run", S.run.lv);
$("m-gun").onclick = () => startLevel("gun", S.gun.max);
$("m-levels").onclick = () => openLevels("run");
$("m-shop").onclick = () => openShop("run");
$("m-look").onclick = () => openLook();
$("m-barracks").onclick = () => openBarracks(false);
$("bar-chest").onclick = () => openChest(barBack);
$("chest-more").onclick = () => openChest(barBack);
$("chest-ok").onclick = () => openBarracks(barBack);
$("m-menu").onclick = () => { location.href = "../"; };
document.querySelectorAll("#lv-tabs button").forEach((b) => (b.onclick = () => { play("click"); openLevels(b.dataset.m); }));
document.querySelectorAll("#shop-tabs button").forEach((b) => (b.onclick = () => { play("click"); openShop(b.dataset.m, shopBack); }));
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => { play("close"); if (shopBack && !$("screen-shop").classList.contains("hidden")) { shopBack = false; show("screen-end"); return; } if (barBack && !$("screen-barracks").classList.contains("hidden")) { barBack = false; show("screen-end"); return; } toMenu(); }));
$("champ").addEventListener("pointerdown", (e) => { e.stopPropagation(); if (state === "play" && mode === "gun" && gun.launchChamp()) T.haptic("impact", "heavy"); });
$("pause").onclick = () => { if (state !== "play") return; paused = true; gun.setFiring(false); show("screen-pause"); play("open"); };
$("p-resume").onclick = () => { paused = false; show(null); };
$("p-restart").onclick = () => startLevel(mode, curLevel);
$("p-menu").onclick = () => toMenu();
const sndBtn = $("snd"); const updSnd = () => { sndBtn.textContent = S.set.snd ? "🔊" : "🔇"; };
sndBtn.onclick = () => { S.set.snd = S.set.snd ? 0 : 1; save(); applyVol(); updSnd(); unlock(); if (S.set.snd) play("click"); };
document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("button") && !e.target.closest("#snd,.buy,.swb,.lvb,.tabs2 button,[data-back]")) play("click", { vol: 0.6 }); }, true);
document.addEventListener("visibilitychange", () => { if (document.hidden && state === "play" && !paused) { paused = true; gun.setFiring(false); show("screen-pause"); } });

// ---------- цикл ----------
let hold = false;
function frame(ts) {
  if (hold) { last = ts; requestAnimationFrame(frame); return; }
  const dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
  if (active && !paused) {
    if (state === "play" && mode === "run" && (keys.ArrowLeft || keys.ArrowRight)) runner.steer((keys.ArrowRight ? 1 : -1) * 9, innerWidth);
    if (state === "play" && mode === "gun" && (keys.ArrowLeft || keys.ArrowRight)) gun.aimDrag((keys.ArrowRight ? 1 : -1) * 5, innerWidth);
    active.update(dt);
    if (state === "play" && $("tapgo").style.display !== "none" && ((mode === "run" && runner.phase !== "intro") || (mode === "gun" && gun.phase !== "intro"))) $("tapgo").style.display = "none";
  } else if (active && paused) active.render ? (mode === "run" ? active.render(0) : active.render(0, 0)) : 0;
  eng.frame(dt, state === "play" && !paused);
  requestAnimationFrame(frame);
}

// ---------- старт ----------
const challenge = T.readChallenge && T.readChallenge();
T.init({ header: "#1d55d8", bg: "#9fd6ff", back: "../" });
Promise.all([load(), loadAssets((f) => { $("loading").textContent = `Загружаем… ${Math.round(f * 100)}%`; })]).then(() => {
  if (Q.get("q") != null) { eng.quality = clampQ(+Q.get("q")); eng.lockQ = true; eng.applyQuality(); }
  runner = new Runner(eng, hud, $("labels")); gun = new Gun(eng, hud, $("labels"));
  window.__ot.runner = runner; window.__ot.gun = gun;
  updSnd(); applyVol();
  if (Q.get("reset")) { localStorage.removeItem("ot_save1"); location.href = location.pathname; }
  toMenu();
  document.body.classList.add("ready");
  requestAnimationFrame(frame);
  if (Q.get("lv")) startLevel(Q.get("mode") === "gun" ? "gun" : "run", +Q.get("lv"));
});

// ---------- для автотестов ----------
window.__ot = {
  S, runner, gun, eng, save,
  get state() { return state; }, get mode() { return mode; },
  start: (m, n) => startLevel(m, n),
  menu: toMenu, shop: openShop, levels: openLevels, looks: openLook, barracks: openBarracks, chest: openChest,
  setBot(kind) { window.__autoBot = kind; if (state === "play") { if (mode === "run") { runner.auto = !!kind; runner.autoKind = kind === "runrandom" ? "random" : "skilled"; runner.start(); } else { gun.setAuto(kind); gun.start(); } } },
  speed(k) { runner.speedUp = k; gun.speedUp = k; },
  fps: () => eng.fps,
  // автотесты: остановить цикл, прогнать логику на sec секунд (шагами), отрисовать один кадр
  hold(on) { hold = on; },
  advance(sec, step) { step = step || 1 / 30; for (let t = 0; t < sec; t += step) { if (active) active.update(step); } eng.frame(step, false); }
};
