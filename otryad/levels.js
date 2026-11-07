// «Отряд» — режим «Забег»: 30 уровней вручную + бесконечные после 30-го (собираются из тех же кусков по сиду).
// Кусок трассы («бит») — объект {t: тип, ...}. Финал: армия, великан или крепость.
// v2: толпа из разных бойцов (состав comp), оружие, эпохи, ворота «стреляй — растёт», бочки с наградой.
// Сила финала считается от лучшего возможного отряда (оценка est) × k.
// (без three.js — файл гоняется и в node для проверки баланса)
const BIOME_ORDER = ["meadow", "desert", "snow", "autumn", "volcano", "night"];
function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const RUN_CFG = {
  speed: 9.5,          // скорость бега, м/с
  hw: 4.6,             // полуширина дороги
  gap: 11,             // расстояние между кусками трассы
  startUnits: 5, startPerUp: 3,
  cap: 1000,           // сколько человечков рисуем максимум (дальше один рисованный = несколько)
  hpK: 0.1, atkK: 0.1, incK: 0.12,   // улучшения: прочность / сила / доход за уровень
  upCost0: 60, upMul: 1.5,
  numGrow: 0.14,       // на сколько растут числа «+N/−N» с каждым уровнем
  kMul: 0.82,          // общий множитель силы финала (баланс по прогону бота без улучшений)
  cannonK: 3,          // скольких врагов уносит один заряженный в пушку боец
  cannonUp: 0.2,       // «Боевая пушка»: +20% за уровень
  coinsBase: 40, coinsPerLv: 8,
  // лестница после победы: множители монет (раньше ×1…×10 — слишком щедро), цена ступеньки растёт ×1.3
  stair: [1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 5], stairK: 0.07, stairGrow: 1.3,
  // стрельба толпы по воротам «↑» и бочкам: выстрелов в секунду
  shot: { base: 2.5, perUnit: 0.05, max: 14, archer: 0.15, upK: 0.15, speed: 42 },
  // ворота «↑»: «+N»/«−N» прибавляют шаг за попадание, «×N» — +1 за growHits×N попаданий
  grow: { plusDiv: 10, minusDiv: 10, growHits: 6, xMax: 5 },
  mastery: 0.08        // «Мастерство оружия»: +8% к силе оружия за уровень
};

// ---------- бойцы, эпохи, оружие ----------
export const TYPES = ["basic", "scout", "brute", "archer", "shield", "champ"];
// pow — сила в бою (обычный = 1); trap — доля смертей от ловушек; volley — урон залпом до схватки
export const UNIT = {
  basic:  { pow: 1,   trap: 1 },
  scout:  { pow: 0.7, trap: 0.45 },
  brute:  { pow: 5,   trap: 0.25 },
  archer: { pow: 0.8, trap: 1, volley: 0.4 },
  shield: { pow: 1.2, trap: 0.5, def: 0.8 },
  champ:  { pow: 25,  trap: 0 }
};
export const UNIT_NAME = { basic: "Бойцы", scout: "Бегуны", brute: "Громилы", archer: "Лучники", shield: "Щитоносцы", champ: "Чемпион" };
export const UNIT_GEN = { scout: "бегунов", brute: "громил", archer: "лучников", shield: "щитоносцев", champ: "чемпион" };
const UCODE = { A: "archer", B: "brute", S: "shield", R: "scout", C: "champ" };
// эпохи (Crowd Evolution): облик и сила обычных бойцов
export const TIERS = [
  { kind: "militia", mul: 0.75, name: "Ополчение" },
  { kind: "blue", mul: 1, name: "Мечники" },
  { kind: "shield", mul: 1.3, name: "Латники" },
  { kind: "knight2", mul: 1.65, name: "Рыцари" }
];
// оружие на дороге: меняет облик обычных бойцов и их силу против разных финалов
export const WEAPONS = {
  sword:  { kind: "blue", name: "Мечи", icon: "🗡️", melee: 1.15, desc: "+15% в любой схватке" },
  spear:  { kind: "spear", name: "Копья", icon: "🔱", melee: 1.0, big: 1.9, desc: "×1,9 против великанов" },
  bow:    { kind: "archer", name: "Арбалеты", icon: "🏹", melee: 0.9, volley: 0.3, desc: "Залп до схватки" },
  shield: { kind: "shield", name: "Щиты", icon: "🛡️", melee: 1.0, trap: 0.5, def: 0.75, desc: "Меньше потерь" },
  axe:    { kind: "axe", name: "Топоры", icon: "🪓", melee: 1.1, castle: 2.0, desc: "×2 по крепости" }
};
// состав красных: доли от числа тел — G великаны, A лучники, S щиты
export const EMIX = { G: { pow: 6 }, A: { pow: 0.8, volley: 0.35 }, S: { pow: 1.4 } };
export function mixPow(mix) { mix = mix || {}; let p = 1; for (const k in EMIX) p += (mix[k] || 0) * (EMIX[k].pow - 1); return p; }

export function newComp(start, cards, tier) {
  const c = { basic: start, scout: 0, brute: 0, archer: 0, shield: 0, champ: 0, tier: tier != null ? tier : 1 };
  cards = cards || {};
  if (cards.scout) c.scout = 3 * cards.scout;
  if (cards.brute) c.brute = Math.min(5, cards.brute);
  if (cards.archer) c.archer = 2 * cards.archer;
  if (cards.shield) c.shield = 2 * cards.shield;
  if (cards.champ) c.champ = 1;
  return c;
}
export function compCount(c) { let n = 0; for (const t of TYPES) n += c[t]; return n; }
// сила отряда без оружия (эпоха умножает всех, кроме чемпиона; карты казармы — +10% за уровень)
export function compPower(c, cards) {
  cards = cards || {}; const tm = TIERS[c.tier].mul; let p = 0;
  for (const t of TYPES) p += c[t] * UNIT[t].pow * (t === "champ" ? 1 + 0.15 * Math.max(0, (cards.champ || 1) - 1) : tm) * (1 + 0.1 * (cards[t] || 0));
  return p;
}
export function cloneComp(c) { return Object.assign({}, c); }
// убрать n тел: сначала обычных, потом остальных поровну
export function removeBodies(c, n) {
  const b = Math.min(c.basic, n); c.basic -= b; n -= b;
  if (n > 0) { const tot = compCount(c) - c.champ; if (tot > 0) { const k = Math.max(0, 1 - n / tot); for (const t of TYPES) if (t !== "champ" && t !== "basic") c[t] *= k; } }
  return c;
}
// разбор подписи ворот: "+10", "-20^", "x2^", "/2", "uA10", "cB", "e"
export function parseGate(v) {
  const grow = v.endsWith("^"), s = grow ? v.slice(0, -1) : v, k = s[0];
  if (k === "u") return { k: "u", unit: UCODE[s[1]], N: parseInt(s.slice(2), 10) || 1, grow };
  if (k === "c") return { k: "c", unit: UCODE[s[1]] || "brute", grow };
  if (k === "e") return { k: "e", grow };
  return { k, N: parseFloat(s.slice(1)), grow };
}
export function gateGood(g) { return g.k === "+" || g.k === "x" || g.k === "u" || g.k === "c" || g.k === "e"; }
// применить ворота к составу (на месте)
export function applyGateComp(c, g) {
  if (typeof g === "string") g = parseGate(g);
  const N = g.N;
  if (g.k === "+") { if (N >= 0) c.basic += N; else removeBodies(c, -N); }
  else if (g.k === "-") { if (N >= 0) removeBodies(c, N); else c.basic += -N; }
  else if (g.k === "x") { for (const t of TYPES) if (t !== "champ") c[t] = Math.round(c[t] * N); }
  else if (g.k === "/") { for (const t of TYPES) if (t !== "champ") c[t] = Math.floor(c[t] / N); }
  else if (g.k === "u") { if (g.unit === "champ") c.champ = Math.max(c.champ, 1); else c[g.unit] += N; }
  else if (g.k === "c") { const k = Math.floor(c.basic * 0.5 / 5); c.basic -= k * 5; c[g.unit] += k; }
  else if (g.k === "e") c.tier = Math.min(TIERS.length - 1, c.tier + 1);
  return c;
}
// совместимость: только число тел
export function applyGate(c, v) { const g = parseGate(v), N = g.N; if (g.k === "+") return c + N; if (g.k === "-") return Math.max(0, c - N); if (g.k === "x") return c * N; if (g.k === "/") return Math.floor(c / N); if (g.k === "u") return c + N; return c; }
// сила нашего оружия против цели: vs = { kind: "army"|"squad"|"boss"|"castle", mix }
export function weaponMul(w, vs, mastery) {
  const W = WEAPONS[w]; if (!W) return 1;
  const mk = 1 + RUN_CFG.mastery * (mastery || 0);
  let m = W.melee;
  if (W.big) { const big = vs.kind === "boss" ? 1 : (vs.mix && vs.mix.G ? vs.mix.G * EMIX.G.pow / mixPow(vs.mix) : 0); m *= 1 + (W.big - 1) * big; }
  if (W.castle && vs.kind === "castle") m *= W.castle;
  return 1 + (m - 1) * mk;
}
// залп до схватки (наши лучники + арбалеты) — урон в «силе»
export function volleyPow(c, w, mastery) {
  let v = c.archer * UNIT.archer.volley;
  if (w === "bow") v += c.basic * WEAPONS.bow.volley * TIERS[c.tier].mul * (1 + RUN_CFG.mastery * (mastery || 0));
  return v;
}
export function shotRate(count, archers, up) { const S = RUN_CFG.shot; return Math.min(S.max, S.base + count * S.perUnit + (archers || 0) * S.archer) * (1 + S.upK * (up || 0)); }
// ворота «↑»: значение после h попаданий
export function grownGate(g, h, base) {
  const G = RUN_CFG.grow, o = Object.assign({}, g);
  if (g.k === "+") o.N = g.N + h * Math.max(1, Math.round(Math.abs(base || g.N) / G.plusDiv));
  else if (g.k === "-") { o.N = g.N - h * Math.max(1, Math.round(Math.abs(base || g.N) / G.minusDiv)); }
  else if (g.k === "x") { let n = g.N, acc = h; while (n < G.xMax && acc >= G.growHits * n) { acc -= G.growHits * n; n++; } o.N = n; }
  return o;
}
export function gateText(g) {
  if (g.k === "+") return (g.N >= 0 ? "+" : "−") + Math.abs(Math.round(g.N));
  if (g.k === "-") return g.N >= 0 ? "−" + Math.round(g.N) : "+" + Math.round(-g.N);
  if (g.k === "x") return "×" + g.N;
  if (g.k === "/") return "÷" + g.N;
  if (g.k === "u") return g.unit === "champ" ? "+1\nчемпион" : "+" + g.N + "\n" + UNIT_GEN[g.unit];
  if (g.k === "c") return "5 → 1\nгромила";
  if (g.k === "e") return "ЭПОХА ↑";
  return "";
}
export function gateValueGood(g) { return g.k === "-" ? g.N < 0 : g.k === "+" ? g.N >= 0 : g.k !== "/"; }

const G = (...v) => ({ t: "gate", v });
const GM = (...v) => ({ t: "gate", v, move: 1 });
const SQ = (p, mix) => ({ t: "squad", p, mix });       // p — процент от отряда, который сюда дойдёт; mix — великаны/лучники/щиты
const BL = (x) => ({ t: "blade", x: x || 0 });
const BL2 = () => ({ t: "blade2" });
const SAW = (n) => ({ t: "saw", n });
const PIT = (k) => ({ t: "pit", k });
const LOG = (n) => ({ t: "log", n });
const CR = (n) => ({ t: "crush", n });
const BR = (w, l) => ({ t: "bridge", w, l });
const SP = () => ({ t: "spikes" });
const AX = (n) => ({ t: "axe", n });
const CAN = () => ({ t: "cannon" });
const SPD = (a, b) => ({ t: "speed", a, b });          // b — ускорение, m — грязь, - — ничего
const SPL = (L, R) => ({ t: "split", L, R });
const WP = (a, b) => ({ t: "weapon", v: [a, b] });     // выбор оружия: левая/правая стойка
const BAR = (hp, r, x) => ({ t: "barrel", hp, r, x: x || 0 });   // бочка: отстреляй hp — получишь r (ворота-строку или "w:копьё")

// f: тип финала, k — доля от лучшего отряда; tm — уровень на время; new — что показываем как новинку; tier — эпоха на старте; mix — состав армии финала
const LV = [
  /* 1 */ { tut: 1, s: [G("+5", "+2"), G("x2", "+3"), G("+10", "x2"), G("+4", "x2")], f: "army", k: 0.38 },
  /* 2 */ { s: [G("+10", "x2"), SQ(17), G("x2", "+5"), SQ(18), G("+15", "x3")], f: "army", k: 0.55, new: "squad" },
  /* 3 */ { s: [G("+8", "x2"), G("+5^", "+5^"), BL(0), G("x2^", "+10"), SQ(19), G("+20", "x2")], f: "army", k: 0.6, new: "shoot" },
  /* 4 */ { s: [G("x2", "+10"), BAR(10, "+15", -0.5), PIT("R"), G("+15", "x2"), BAR(16, "uB2", 0.5), PIT("L"), G("x3", "-10^"), SQ(20, { G: 0.04 })], f: "army", k: 0.6, mix: { G: 0.03 }, new: "barrel" },
  /* 5 */ { s: [G("+10", "x2"), WP("spear", "sword"), BL(0.3), G("x3", "+20^"), PIT("C"), G("x2", "-5", "+15"), SQ(20), G("+30", "x2")], f: "boss", k: 0.58, new: "weapon" },
  /* 6 */ { s: [G("x2", "+10"), SAW(2), G("uA10", "+20"), SAW(3), SQ(21, { A: 0.15 }), G("x3", "-15"), PIT("LR"), G("+20", "uS12")], f: "army", k: 0.45, mix: { A: 0.1 }, new: "units" },
  /* 7 */ { tier: 0, s: [G("x2", "+10"), G("e", "+5"), SPL([G("x3"), SAW(2), G("+20")], [G("e"), SQ(20), G("x2")]), G("x2", "-20")], f: "army", k: 0.62, new: "evo" },
  /* 8 */ { s: [G("+10", "x2"), WP("axe", "bow"), CAN(), G("x3", "+20^"), BL(0), SQ(21), G("x2", "+30")], f: "castle", k: 0.5, new: "cannon" },
  /* 9 */ { s: [G("x2", "+15"), LOG(4), G("cB", "+20"), G("+20", "x3"), SAW(2), LOG(6), G("x2", "-20"), SQ(22, { G: 0.05 })], f: "army", k: 0.62, mix: { G: 0.04 }, new: "convert" },
  /* 10 */ { s: [G("+15", "x2"), WP("spear", "shield"), LOG(4), G("x3", "-10^"), BL2(), CAN(), PIT("C"), G("x2", "+40")], f: "boss", k: 0.62 },
  /* 11 */ { s: [G("x2", "+20"), CR(3), G("+30^", "x2"), CR(4), SQ(22, { A: 0.25 }), WP("bow", "shield"), G("x3", "-25", "+10")], f: "army", k: 0.55, mix: { A: 0.15 }, new: "archers" },
  /* 12 */ { s: [G("+20", "x2"), BR(3.4, 18), BAR(24, "uB3", 0), G("x3", "+10"), CR(3), BR(2.6, 14), G("x2", "+30"), SQ(24)], f: "army", k: 0.44, new: "bridge" },
  /* 13 */ { tier: 0, s: [GM("x3", "+20"), G("e", "uR20"), SAW(3), GM("x2", "/2"), BL2(), GM("+40", "x2"), LOG(5), SQ(25)], f: "army", k: 0.55, new: "move" },
  /* 14 */ { tm: 1, s: [G("x2", "uR20"), SPD("b", "m"), G("+30", "x2"), SPD("m", "b"), LOG(4), G("x3", "-20"), SPD("b", "b")], f: "army", k: 0.46, new: "timer" },
  /* 15 */ { s: [G("x2", "+20^"), WP("axe", "sword"), CAN(), G("x3", "+30"), CR(3), SQ(25, { S: 0.2 }), G("x2", "-30^"), SAW(3)], f: "castle", k: 0.6 },
  /* 16 */ { s: [G("x2", "+20"), SP(), G("+40", "uS20"), SP(), BAR(30, "uC1", 0), SQ(25), BL2(), G("x3", "-30")], f: "army", k: 0.64, mix: { G: 0.05 }, new: "champ" },
  /* 17 */ { s: [G("+30", "x2"), AX(2), G("x2^", "-20"), AX(3), LOG(5), G("cB", "+40"), G("x3", "+40"), SQ(28, { G: 0.06 })], f: "army", k: 0.64, mix: { G: 0.06 }, new: "axe" },
  /* 18 */ { tier: 0, s: [G("x2", "+30"), SPL([SQ(25), G("x3"), G("e")], [G("+50"), BL(0), G("x2")]), SP(), G("x2", "-40")], f: "army", k: 0.64 },
  /* 19 */ { tm: 1, s: [SPD("b", "m"), GM("x2", "+30"), CR(4), SPD("m", "b"), G("x3", "-20^"), LOG(5), SPD("b", "m"), G("+40", "x2")], f: "army", k: 0.6 },
  /* 20 */ { s: [G("x2", "+30"), WP("spear", "bow"), AX(3), GM("x3", "-30"), CAN(), SP(), G("x2", "+50"), SQ(30, { G: 0.08 })], f: "boss", k: 0.64 },
  /* 21 */ { s: [G("x2", "+30"), PIT("LR"), BAR(36, "e", 0), G("+40^", "x2"), SAW(4), BL2(), G("x3", "-40", "x2"), SQ(26, { A: 0.15 }), CR(4)], f: "army", k: 0.45, mix: { A: 0.15 } },
  /* 22 */ { s: [GM("x2", "+40"), CAN(), WP("sword", "shield"), BL2(), G("x3", "-30"), LOG(6), G("+60", "uA20"), SQ(32)], f: "army", k: 0.7 },
  /* 23 */ { s: [G("x3", "+20"), BR(3, 20), CR(4), G("x2", "-30^"), BR(2.4, 16), AX(3), G("+60", "x2")], f: "army", k: 0.6, mix: { S: 0.2 } },
  /* 24 */ { s: [G("x2", "+30"), SPL([G("x3"), LOG(4)], [G("+60"), SAW(3)]), G("cB", "-50"), SPL([SQ(34), G("x2")], [SP(), G("+50")])], f: "army", k: 0.58, mix: { G: 0.05 } },
  /* 25 */ { tier: 0, s: [GM("x2", "+40"), G("e", "+30"), SAW(4), G("x3", "-40^"), WP("spear", "axe"), AX(3), CAN(), PIT("LR"), G("x2", "+80"), SQ(34)], f: "boss", k: 0.5 },
  /* 26 */ { s: [GM("x3", "+40"), BL2(), SP(), GM("x2", "-50"), CR(5), BAR(44, "uC1", 0.4), LOG(6), G("+80", "x2"), SQ(34, { G: 0.06, A: 0.1 })], f: "army", k: 0.65, mix: { G: 0.05, A: 0.1 } },
  /* 27 */ { tm: 1, s: [SPD("b", "m"), GM("x2", "uR40"), AX(3), SPD("m", "b"), GM("x3", "-40"), BR(3, 16), SPD("b", "m"), G("x2", "+60")], f: "army", k: 0.6 },
  /* 28 */ { s: [G("x2", "+40"), WP("axe", "bow"), CAN(), GM("x3", "-40"), CR(5), SQ(34, { S: 0.2 }), G("x2", "+80^"), AX(3)], f: "castle", k: 0.6 },
  /* 29 */ { s: [GM("x2", "+50"), BL2(), SAW(4), GM("x3", "-60"), LOG(6), PIT("C"), SP(), SQ(28, { G: 0.06 }), G("x2", "+100")], f: "army", k: 0.52, mix: { G: 0.06, A: 0.12 } },
  /* 30 */ { s: [G("x3", "+50"), WP("spear", "sword"), SPL([G("x3"), AX(3)], [G("+150"), CR(4)]), CAN(), GM("x2", "-80"), SP(), SQ(34), G("x2", "+100")], f: "boss", k: 0.68, king: 1 }
];
export const RUN_LEVELS = LV.length;
// новинки уровня: короткая подсказка в начале
export const RUN_NEWS = {
  squad: "Красный отряд на дороге — нужно больше бойцов, чем у них",
  shoot: "Толпа стреляет сама: встань за ворота «↑» — число растёт!",
  barrel: "Бочка с числом: отстреляй — получишь награду",
  weapon: "Выбери оружие! Копья сильны против великана",
  units: "Новые бойцы: лучники бьют до схватки, щитоносцы держат удар",
  evo: "Ворота «Эпоха»: вся толпа станет сильнее",
  cannon: "Боевая пушка: заведи в неё бойцов — в конце будет залп",
  convert: "«5 → 1»: из пятерых — громила. Громил не берут ловушки",
  archers: "У красных лучники — стреляют издалека",
  bridge: "Узкий мост — не упади", move: "Ворота едут — лови момент",
  timer: "На время! Голубые дорожки ускоряют", champ: "В бочке — чемпион! Отстреляй её",
  axe: "Маятники-топоры — проходи, когда отклонились"
};

// уровни после 30-го: случайные, но из проверенных кусков
function endless(n) {
  const r = rng(n * 7919);
  const hazards = [() => BL2(), () => SAW(3 + (r() * 2 | 0)), () => LOG(5 + (r() * 3 | 0)), () => CR(4), () => SP(), () => AX(3), () => PIT(["L", "R", "C", "LR"][r() * 4 | 0]), () => BR(2.6 + r(), 14)];
  const gate = () => { const m = [["x2", "+" + (30 + (r() * 6 | 0) * 10)], ["x3", "-" + (20 + (r() * 4 | 0) * 10) + "^"], ["+" + (40 + (r() * 6 | 0) * 10) + "^", "x2"], ["x2", "/2"], ["cB", "+" + (30 + (r() * 4 | 0) * 10)], ["uA20", "x2"]][r() * 6 | 0]; return r() < 0.5 ? GM(...m) : G(...m); };
  const f = n % 5 === 0 ? "boss" : n % 4 === 0 ? "castle" : "army";
  const s = [gate()];
  const wp = f === "boss" ? ["spear", ["sword", "bow", "shield"][r() * 3 | 0]] : f === "castle" ? ["axe", ["sword", "bow"][r() * 2 | 0]] : [["sword", "shield"], ["bow", "spear"], ["shield", "bow"]][r() * 3 | 0];
  for (let i = 0; i < 6; i++) { s.push(r() < 0.25 ? SQ(24 + (r() * 10 | 0), r() < 0.5 ? { G: 0.05 } : { A: 0.15 }) : hazards[r() * hazards.length | 0]()); if (i % 2) s.push(gate()); if (i === 1) s.push(WP(...(r() < 0.5 ? wp : wp.slice().reverse()))); if (i === 3 && r() < 0.6) s.push(BAR(30 + (r() * 20 | 0), ["uB3", "uA20", "e", "+40"][r() * 4 | 0], (r() - 0.5) * 1.2)); }
  if (r() < 0.5) s.splice(3, 0, CAN());
  return { s, f, k: Math.min(0.75, 0.66 + (n - 30) * 0.004), mix: r() < 0.5 ? { G: 0.05, A: 0.1 } : { S: 0.15, A: 0.1 }, tier: r() < 0.25 ? 0 : 1 };
}

export function levelDef(n) {
  const L = JSON.parse(JSON.stringify(n <= LV.length ? LV[n - 1] : endless(n)));
  const d = Object.assign({ n, biome: BIOME_ORDER[Math.floor((n - 1) / 5) % BIOME_ORDER.length], tier: 1, mix: {} }, L);
  // «+N» и «−N» растут с номером уровня — чтобы к 30-му отряды были в сотни и тысячи
  const sc = 1 + (Math.min(n, 40) - 1) * RUN_CFG.numGrow;
  const scaleV = (v) => { const g = v.endsWith("^"); const s = g ? v.slice(0, -1) : v; let o = v; if ((s[0] === "+" || s[0] === "-") && sc > 1) o = s[0] + Math.max(1, Math.round(parseFloat(s.slice(1)) * sc / 5) * 5) + (g ? "^" : ""); else if (s[0] === "u" && s[1] !== "C" && s[1] !== "B" && sc > 1) o = s.slice(0, 2) + Math.max(1, Math.round(parseInt(s.slice(2), 10) * sc / 5) * 5); return o; };
  const walk = (bs) => bs.forEach((b) => {
    if (b.t === "gate") b.v = b.v.map(scaleV);
    if (b.t === "barrel") { b.hp = Math.round(b.hp * (1 + (Math.min(n, 40) - 1) * 0.06)); if (typeof b.r === "string" && b.r[0] !== "w") b.r = scaleV(b.r); }
    if (b.t === "split") { walk(b.L); walk(b.R); }
  });
  walk(d.s);
  d.weapons = []; const ww = (bs) => bs.forEach((b) => { if (b.t === "weapon") d.weapons.push(...b.v); if (b.t === "split") { ww(b.L); ww(b.R); } }); ww(d.s);
  estimate(d);           // заодно проставляет размеры отрядов-засад (b.n)
  return d;
}

// --- оценка: сколько силы соберёт хороший игрок (для силы финала и ступенек) ---
const LOSS = { blade: 0.9, blade2: 0.85, saw: 0.9, pit: 0.94, log: 0.9, crush: 0.9, spikes: 0.9, axe: 0.9, speed: 1 };
const FOCUS = 1.2;        // сколько секунд хороший игрок успевает стрелять в одни ворота «↑»
function trapLoss(c, loss, w) {
  for (const t of TYPES) { let k = UNIT[t].trap; if (t === "basic" && w === "shield") k *= WEAPONS.shield.trap; c[t] = c[t] * (1 - (1 - loss) * k); }
}
function estBeats(beats, c, acc) {
  for (const b of beats) {
    const cnt = compCount(c);
    if (b.t === "gate") {
      let best = null, bp = -1;
      for (const v of b.v) {
        let g = parseGate(v);
        if (g.grow) g = grownGate(g, Math.round(shotRate(cnt, c.archer) * FOCUS), g.N);
        const cc = applyGateComp(cloneComp(c), g), p = compPower(cc, acc.cards);
        if (p > bp) { bp = p; best = cc; }
      }
      Object.assign(c, best);
    } else if (b.t === "squad") {
      b.n = Math.max(3, Math.round(cnt * b.p / 100));
      const ep = b.n * mixPow(b.mix);
      const before = compPower(c, acc.cards); const left = Math.max(0, before - ep * 0.9);
      const k = before > 0 ? left / before : 0; for (const t of TYPES) c[t] *= k;
    } else if (b.t === "weapon") acc.weapons.push(...b.v);
    else if (b.t === "barrel") {
      if (b.hp <= shotRate(cnt, c.archer) * 2.6) { if (b.r[0] === "w") { acc.weapons.push(b.r.slice(2)); } else applyGateComp(c, b.r); }
    }
    else if (b.t === "bridge") { const nc = Math.min(cnt, Math.round(cnt * 0.85 + b.w * 30)); removeBodies(c, cnt - nc); }
    else if (b.t === "cannon") { const k = 0.3; acc.ammo += compPower(c, acc.cards) * k; for (const t of TYPES) if (t !== "champ") c[t] *= 1 - k; }
    else if (b.t === "split") { const a = { ammo: 0, weapons: [], cards: acc.cards }, bb = { ammo: 0, weapons: [], cards: acc.cards }; const l = cloneComp(c), r = cloneComp(c); estBeats(b.L, l, a); estBeats(b.R, r, bb); const lw = compPower(l, acc.cards) + a.ammo, rw = compPower(r, acc.cards) + bb.ammo; const pick = lw > rw ? [l, a] : [r, bb]; Object.assign(c, pick[0]); acc.ammo += pick[1].ammo; acc.weapons.push(...pick[1].weapons); }
    else if (LOSS[b.t]) trapLoss(c, LOSS[b.t], acc.weapon);
    for (const t of TYPES) if (t !== "champ") c[t] = Math.round(c[t]);
  }
  return c;
}
export function estimate(def, start, cards) {
  const acc = { ammo: 0, weapons: [], cards: cards || {} };
  const c = estBeats(def.s, newComp(start || RUN_CFG.startUnits, cards, def.tier), acc);
  const vs = { kind: def.f === "army" ? "army" : def.f, mix: def.mix };
  let wm = 1, bw = null; for (const w of acc.weapons) { const m = weaponMul(w, vs); if (m > wm) { wm = m; bw = w; } }
  const p = compPower(c, acc.cards);
  return { best: compCount(c), comp: c, weapon: bw, ammo: acc.ammo, power: p * wm + (bw ? volleyPow(c, bw) : volleyPow(c)) + acc.ammo * RUN_CFG.cannonK };
}
// сила финала считается от игрока без улучшений — улучшения делают уровень легче, так и задумано
export function finalStrength(def) {
  const e = estimate(def, RUN_CFG.startUnits);
  const pw = Math.max(6, e.power * def.k * RUN_CFG.kMul);
  return { enemy: Math.max(6, Math.round(pw / (def.f === "army" ? mixPow(def.mix) : 1))), enemyPow: pw, est: e };
}
export function upCostRun(lv, kind) { return Math.round(RUN_CFG.upCost0 * Math.pow(RUN_CFG.upMul, lv) * (kind === "cannon" ? 1.2 : kind === "mastery" ? 1.3 : kind === "shots" ? 1.1 : 1)); }
