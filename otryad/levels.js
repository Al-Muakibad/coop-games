// «Отряд» — режим «Забег»: 30 уровней вручную + бесконечные после 30-го (собираются из тех же кусков по сиду).
// Кусок трассы («бит») — объект {t: тип, ...}. Финал: армия, великан или крепость.
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
  numGrow: 0.14,
  kMul: 0.82,          // общий множитель силы финала (баланс по прогону бота без улучшений)       // на сколько растут числа «+N/−N» с каждым уровнем
  cannonK: 3,          // скольких врагов уносит один заряженный в пушку боец
  coinsBase: 25, coinsPerLv: 5
};

const G = (...v) => ({ t: "gate", v });
const GM = (...v) => ({ t: "gate", v, move: 1 });
const SQ = (p) => ({ t: "squad", p });                 // p — процент от отряда, который сюда дойдёт
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

// f: тип финала, k — доля от лучшего отряда; tm — уровень на время; new — что показываем как новинку
const LV = [
  /* 1 */ { tut: 1, s: [G("+5", "+2"), G("x2", "+3"), G("+10", "x2"), G("+4", "x2")], f: "army", k: 0.45 },
  /* 2 */ { s: [G("+10", "x2"), SQ(17), G("x2", "+5"), SQ(18), G("+15", "x3")], f: "army", k: 0.55, new: "squad" },
  /* 3 */ { s: [G("+8", "x2"), BL(0), G("x3", "+10"), BL(-0.4), SQ(19), G("+20", "x2")], f: "army", k: 0.6, new: "blade" },
  /* 4 */ { s: [G("x2", "+10"), PIT("L"), G("+15", "x2"), PIT("R"), BL(0), G("x3", "-10"), SQ(20)], f: "army", k: 0.6, new: "pit" },
  /* 5 */ { s: [G("+10", "x2"), BL(0.3), G("x3", "+20"), PIT("C"), G("x2", "-5", "+15"), SQ(20), G("+30", "x2")], f: "boss", k: 0.58, new: "boss" },
  /* 6 */ { s: [G("x2", "+10"), SAW(2), G("+20", "x2"), SAW(3), SQ(21), G("x3", "-15"), PIT("LR"), G("+20", "/2")], f: "army", k: 0.62, new: "saw" },
  /* 7 */ { s: [G("x2", "+10"), SPL([G("x3"), SAW(2), G("+20")], [G("+30"), SQ(20), G("x2")]), G("x2", "-20")], f: "army", k: 0.62, new: "split" },
  /* 8 */ { s: [G("+10", "x2"), CAN(), G("x3", "+20"), BL(0), SQ(21), G("x2", "+30")], f: "castle", k: 0.62, new: "cannon" },
  /* 9 */ { s: [G("x2", "+15"), LOG(4), G("+20", "x3"), SAW(2), LOG(6), G("x2", "-20"), SQ(22)], f: "army", k: 0.62, new: "log" },
  /* 10 */ { s: [G("+15", "x2"), LOG(4), G("x3", "-10"), BL2(), CAN(), PIT("C"), G("x2", "+40")], f: "boss", k: 0.62 },
  /* 11 */ { s: [G("x2", "+20"), CR(3), G("+30", "x2"), CR(4), SQ(22), G("x3", "-25", "+10")], f: "army", k: 0.64, new: "crush" },
  /* 12 */ { s: [G("+20", "x2"), BR(3.4, 18), G("x3", "+10"), CR(3), BR(2.6, 14), G("x2", "+30"), SQ(24)], f: "army", k: 0.6, new: "bridge" },
  /* 13 */ { s: [GM("x3", "+20"), SAW(3), GM("x2", "/2"), BL2(), GM("+40", "x2"), LOG(5), SQ(25)], f: "army", k: 0.55, new: "move" },
  /* 14 */ { tm: 1, s: [G("x2", "+20"), SPD("b", "m"), G("+30", "x2"), SPD("m", "b"), LOG(4), G("x3", "-20"), SPD("b", "b")], f: "army", k: 0.46, new: "timer" },
  /* 15 */ { s: [G("x2", "+20"), CAN(), G("x3", "+30"), CR(3), SQ(25), G("x2", "-30"), SAW(3)], f: "castle", k: 0.72 },
  /* 16 */ { s: [G("x2", "+20"), SP(), G("+40", "x2"), SP(), SQ(25), BL2(), G("x3", "-30")], f: "army", k: 0.64, new: "spikes" },
  /* 17 */ { s: [G("+30", "x2"), AX(2), G("x2", "-20"), AX(3), LOG(5), G("x3", "+40"), SQ(28)], f: "army", k: 0.64, new: "axe" },
  /* 18 */ { s: [G("x2", "+30"), SPL([SQ(25), G("x3"), AX(2)], [G("+50"), BL(0), G("x2")]), SP(), G("x2", "-40")], f: "army", k: 0.64 },
  /* 19 */ { tm: 1, s: [SPD("b", "m"), GM("x2", "+30"), CR(4), SPD("m", "b"), G("x3", "-20"), LOG(5), SPD("b", "m"), G("+40", "x2")], f: "army", k: 0.6 },
  /* 20 */ { s: [G("x2", "+30"), AX(3), GM("x3", "-30"), CAN(), SP(), G("x2", "+50"), SQ(30)], f: "boss", k: 0.64 },
  /* 21 */ { s: [G("x2", "+30"), PIT("LR"), G("+40", "x2"), SAW(4), PIT("C"), G("x3", "-40", "/2"), SQ(30), CR(4)], f: "army", k: 0.52 },
  /* 22 */ { s: [GM("x2", "+40"), CAN(), BL2(), G("x3", "-30"), LOG(6), G("+60", "x2"), SQ(32)], f: "army", k: 0.7 },
  /* 23 */ { s: [G("x3", "+20"), BR(3, 20), CR(4), G("x2", "-30"), BR(2.4, 16), AX(3), G("+60", "x2")], f: "army", k: 0.6 },
  /* 24 */ { s: [G("x2", "+30"), SPL([G("x3"), LOG(4)], [G("+60"), SAW(3)]), G("x2", "-50"), SPL([SQ(34), G("x2")], [SP(), G("+50")])], f: "army", k: 0.58 },
  /* 25 */ { s: [GM("x2", "+40"), SAW(4), G("x3", "-40"), AX(3), CAN(), PIT("LR"), G("x2", "+80"), SQ(34)], f: "boss", k: 0.65 },
  /* 26 */ { s: [GM("x3", "+40"), BL2(), SP(), GM("x2", "-50"), CR(5), LOG(6), G("+80", "x2"), SQ(34)], f: "army", k: 0.65 },
  /* 27 */ { tm: 1, s: [SPD("b", "m"), GM("x2", "+40"), AX(3), SPD("m", "b"), GM("x3", "-40"), BR(3, 16), SPD("b", "m"), G("x2", "+60")], f: "army", k: 0.6 },
  /* 28 */ { s: [G("x2", "+40"), CAN(), GM("x3", "-40"), CR(5), SQ(34), G("x2", "+80"), AX(3)], f: "castle", k: 0.72 },
  /* 29 */ { s: [GM("x2", "+50"), BL2(), SAW(4), GM("x3", "-60"), LOG(6), PIT("C"), SP(), SQ(34), G("x2", "+100")], f: "army", k: 0.6 },
  /* 30 */ { s: [G("x3", "+50"), SPL([G("x3"), AX(3)], [G("+150"), CR(4)]), CAN(), GM("x2", "-80"), SP(), SQ(34), G("x2", "+100")], f: "boss", k: 0.68, king: 1 }
];
export const RUN_LEVELS = LV.length;

// уровни после 30-го: случайные, но из проверенных кусков
function endless(n) {
  const r = rng(n * 7919);
  const hazards = [() => BL2(), () => SAW(3 + (r() * 2 | 0)), () => LOG(5 + (r() * 3 | 0)), () => CR(4), () => SP(), () => AX(3), () => PIT(["L", "R", "C", "LR"][r() * 4 | 0]), () => BR(2.6 + r(), 14)];
  const gate = () => { const m = [["x2", "+" + (30 + (r() * 6 | 0) * 10)], ["x3", "-" + (20 + (r() * 4 | 0) * 10)], ["+" + (40 + (r() * 6 | 0) * 10), "x2"], ["x2", "/2"]][r() * 4 | 0]; return r() < 0.5 ? GM(...m) : G(...m); };
  const s = [gate()];
  for (let i = 0; i < 6; i++) { s.push(r() < 0.25 ? SQ(24 + (r() * 10 | 0)) : hazards[r() * hazards.length | 0]()); if (i % 2) s.push(gate()); }
  if (r() < 0.5) s.splice(3, 0, CAN());
  const f = n % 5 === 0 ? "boss" : n % 4 === 0 ? "castle" : "army";
  return { s, f, k: Math.min(0.75, 0.66 + (n - 30) * 0.004) };
}

export function levelDef(n) {
  const L = JSON.parse(JSON.stringify(n <= LV.length ? LV[n - 1] : endless(n)));
  const d = Object.assign({ n, biome: BIOME_ORDER[Math.floor((n - 1) / 5) % BIOME_ORDER.length] }, L);
  // «+N» и «−N» растут с номером уровня — чтобы к 30-му отряды были в сотни и тысячи
  const sc = 1 + (Math.min(n, 40) - 1) * RUN_CFG.numGrow;
  const walk = (bs) => bs.forEach((b) => {
    if (b.t === "gate") b.v = b.v.map((v) => (v[0] === "+" || v[0] === "-") && sc > 1 ? v[0] + Math.max(1, Math.round(parseFloat(v.slice(1)) * sc / 5) * 5) : v);
    if (b.t === "split") { walk(b.L); walk(b.R); }
  });
  walk(d.s);
  estimate(d);           // заодно проставляет размеры отрядов-засад (b.n)
  return d;
}

// --- оценка: сколько бойцов соберёт хороший игрок (для силы финала и ступенек) ---
const LOSS = { blade: 0.9, blade2: 0.85, saw: 0.9, pit: 0.94, log: 0.9, crush: 0.9, spikes: 0.9, axe: 0.9, speed: 1 };
export function applyGate(c, v) {
  const k = v[0], N = parseFloat(v.slice(1));
  if (k === "+") return c + N; if (k === "-") return Math.max(0, c - N);
  if (k === "x") return c * N; if (k === "/") return Math.floor(c / N);
  return c;
}
function estBeats(beats, c, acc) {
  for (const b of beats) {
    if (b.t === "gate") c = Math.max(...b.v.map((v) => applyGate(c, v)));
    else if (b.t === "squad") { b.n = Math.max(3, Math.round(c * b.p / 100)); c = Math.max(0, c - b.n); }
    else if (b.t === "bridge") c = Math.min(c, Math.round(c * 0.85 + b.w * 30));
    else if (b.t === "cannon") { const fed = Math.round(c * 0.3); c -= fed; acc.ammo += fed; }
    else if (b.t === "split") { const a = { ammo: 0 }, bb = { ammo: 0 }; const l = estBeats(b.L, c, a), r = estBeats(b.R, c, bb); c = Math.max(l, r); acc.ammo += l > r ? a.ammo : bb.ammo; }
    else if (LOSS[b.t]) c *= LOSS[b.t];
    c = Math.round(c);
  }
  return c;
}
export function estimate(def, start) {
  const acc = { ammo: 0 };
  const c = estBeats(def.s, start || RUN_CFG.startUnits, acc);
  return { best: c, ammo: acc.ammo, power: c + acc.ammo * RUN_CFG.cannonK };
}
// сила финала считается от игрока без улучшений — улучшения делают уровень легче, так и задумано
export function finalStrength(def) {
  const e = estimate(def, RUN_CFG.startUnits);
  return { enemy: Math.max(6, Math.round(e.power * def.k * RUN_CFG.kMul)), est: e };
}
export function upCostRun(lv) { return Math.round(RUN_CFG.upCost0 * Math.pow(RUN_CFG.upMul, lv)); }
