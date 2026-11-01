// Кампания «Времена года»: один и тот же родной край, сезоны и погода сменяют друг друга, аванпост растёт навсегда.
// Год: Весна → Лето → Осень → Зима; у каждого сезона — погодное событие (в чётные годы — другое), свои монстры, босс, свет и правила.
import * as D from "./data.js";

export const SEASON = {
  spring: { name: "Весна", icon: "🌸", col: ["#7ccf6a", "#f3a6c8"] },
  summer: { name: "Лето", icon: "☀️", col: ["#f2c14e", "#e9884a"] },
  autumn: { name: "Осень", icon: "🍂", col: ["#e07a2e", "#a8482a"] },
  winter: { name: "Зима", icon: "❄️", col: ["#bfe0f6", "#6f9fd0"] }
};
export const ORDER = ["spring", "summer", "autumn", "winter"];

// погодные события: внешний вид берём из готовых биомов, плюс правила игры
export const EVENT = {
  bloom: { name: "Цветение", icon: "🌸", base: "forest", weather: "petals", blossom: true, text: ["Здоровье восстанавливается быстрее", "Добыча +20%"], mods: { regen: 1.2, gather: 1.2 },
    sky: { day: 0xbfe4f2, fog: 0xd4ecf2, sun: 0xfff2dc } },
  fog: { name: "Туман", icon: "🌫️", base: "forest", weather: "pollen", text: ["Густой туман — видно недалеко", "Монстры подкрадываются ближе"], mods: { vis: 0.42 },
    sky: { day: 0xb8c4c8, night: 0x404858, fog: 0xc4ced2, sun: 0xeef0e8 }, grassTint: [0.75, 1.0, 0.6] },
  sandstorm: { name: "Песчаная буря", icon: "🌪️", base: "desert", trees: "forest", weather: "dust", heavy: 2.2, text: ["Башни бьют на 20% ближе", "Видно хуже, ветер замедляет"], mods: { towerRange: 0.8, vis: 0.6, move: 0.94 },
    ground: { base: "grass", alt: "sand", path: "gravel", plaza: "sandpave", tint: [1.02, 1.0, 0.62], tintAlt: [1.05, 0.98, 0.88] }, water: "lake", palms: false },
  heat: { name: "Зной", icon: "🔥", base: "volcano", trees: "autumn", weather: "embers", text: ["Огонь жжёт на 30% сильнее", "В жару здоровье почти не восстанавливается"], mods: { fireMul: 1.3, regen: 0.3, enemySpd: 1.05 },
    ground: { base: "grass2", alt: "burnt", path: "dirt", plaza: "volctile", tint: [1.05, 0.9, 0.55], tintAlt: [1.0, 0.85, 0.75] }, water: "lake", charred: false },
  storm: { name: "Гроза и ливень", icon: "⛈️", base: "autumn", weather: "rain", heavy: 1.5, text: ["Ливень гасит огонь: −40% огню", "Молнии сильнее на 35% и бьют с неба по монстрам"], mods: { fireMul: 0.6, zapMul: 1.35, strikes: 1 },
    sky: { day: 0x8a95a8, night: 0x262a3c, fog: 0x8d97a6, sun: 0xd8dde8, hemi: [0xc8d0e0, 0x4a4a3a] } },
  leaffall: { name: "Листопад", icon: "🍁", base: "autumn", weather: "leaves", heavy: 2.2, text: ["Добыча дерева и камня +50%", "Монстры злее: +5% скорости"], mods: { gather: 1.5, enemySpd: 1.05 } },
  blizzard: { name: "Буран", icon: "🌨️", base: "snow", weather: "snow", heavy: 2.4, text: ["Метель: все двигаются на 20% медленнее", "Видно хуже"], mods: { move: 0.8, enemySpd: 0.88, vis: 0.5 },
    sky: { day: 0xc9d6e2, fog: 0xd6e1ea, night: 0x2a3550 } },
  frost: { name: "Лютый мороз", icon: "🥶", base: "snow", weather: "snow", text: ["Лёд сильнее на 40%", "Мороз: башни стреляют на 10% реже"], mods: { frostMul: 1.4, towerRate: 0.9 },
    sky: { day: 0xd8ecfb, fog: 0xe4f1fb, sun: 0xffffff } }
};
const EV_BY_YEAR = [["bloom", "sandstorm", "storm", "blizzard"], ["fog", "heat", "leaffall", "frost"]];
const FAMS = { spring: ["undead", "beasts"], summer: ["orcs", "beasts", "flyers"], autumn: ["zombies", "beasts", "flyers"], winter: ["undead", "orcs", "flyers"] };
const BOSS = [
  { spring: ["boss_skel"], summer: ["boss_orc"], autumn: ["boss_spider"], winter: ["boss_giant"] },
  { spring: ["boss_spider", "boss_skel"], summer: ["boss_dragon", "boss_orc"], autumn: ["boss_orc", "boss_spider"], winter: ["boss_giant", "boss_dragon"] }
];

// косметика и открытия за сезоны
export const TSKIN = {   // облик башен: сдвиг оттенка «синих» частей + цвет отделки
  none: { name: "Обычные", hue: null }, sand: { name: "Пустынные пагоды", hue: 0.45, trim: 0xe8b04a }, sakura: { name: "Сакура", hue: 0.33, trim: 0xffb7d5 },
  frost: { name: "Ледяные", hue: -0.08, trim: 0xbff3ff }, ember: { name: "Огненные", hue: 0.48, trim: 0xff7a2a }, royal: { name: "Королевские", hue: 0.12, trim: 0xffd34d }
};
export const OUTFIT = { team: { name: "Цвет команды" }, winter: { name: "Зимний наряд", color: "#e8f2ff" }, gold: { name: "Золотые доспехи", color: "#ffcc4d" }, sakura: { name: "Наряд сакуры", color: "#ff9cc8" }, shadow: { name: "Теневой наряд", color: "#5a4a7a" } };
export const BANNER = { team: { name: "Цвет команды" }, bloom: { name: "Весенний стяг", color: "#ff9cc8", trim: "#ffffff" }, autumn: { name: "Осенний стяг", color: "#e07a2e", trim: "#ffd34d" }, royal: { name: "Королевский стяг", color: "#6b2fbf", trim: "#ffd34d" } };
// башни, которые открываются наградами (остальные доступны сразу)
export const LOCKED_TOWERS = { pagoda: "Лето · год 1", poison: "Осень · год 1", ballista: "Лето · год 2" };
export const LOCKED_BUILD = { mine: "Весна · год 1" };

// награда за первый проход шага (видна заранее на карте)
const SPECIAL = [
  [{ unlock: "mine", banner: "bloom", txt: "Золотой рудник + Весенний стяг" }, { tower: "pagoda", tskin: "sand", txt: "Башня-пагода + облик «Пустынные пагоды»" },
   { tower: "poison", style: "eastern", txt: "Ядовитый котёл + восточный замок" }, { outfit: "winter", amulet: "guard", txt: "Зимний наряд + амулет «Страж»" }],
  [{ tskin: "sakura", amulet: "luck", txt: "Облик «Сакура» + амулет удачи" }, { tower: "ballista", outfit: "gold", txt: "Баллиста + золотые доспехи" },
   { style: "nordic", banner: "autumn", txt: "Северный замок + Осенний стяг" }, { tskin: "frost", amulet: "phoenix", txt: "Облик «Ледяные» + амулет «Феникс»" }],
  [{ outfit: "sakura", txt: "Наряд сакуры" }, { tskin: "ember", txt: "Облик «Огненные»" }, { banner: "royal", txt: "Королевский стяг" }, { tskin: "royal", outfit: "shadow", txt: "«Королевские» башни + теневой наряд" }]
];

export const stepId = (y, i) => `y${y}${ORDER[i]}`;
export function parseStep(id) { const m = /^y(\d+)(spring|summer|autumn|winter)$/.exec(id || ""); return m ? { y: +m[1], i: ORDER.indexOf(m[2]) } : null; }

// собираем «локацию» шага — совместима с миром и игрой (D.LOC)
export function step(y, i) {
  const id = stepId(y, i), key = ORDER[i], ev = EVENT[EV_BY_YEAR[(y - 1) % 2][i]], base = D.LOC[ev.base], trees = D.LOC[ev.trees || ev.base];
  const S = SEASON[key];
  const waves = (y === 1 ? [6, 7, 8, 9] : y === 2 ? [8, 9, 10, 11] : [10, 11, 12, 12])[i];
  const bl = BOSS[(y - 1) % 2][key];
  const L = Object.assign({}, base, {
    id, base: ev.base, year: y, si: i, season: key, event: EV_BY_YEAR[(y - 1) % 2][i],
    name: `${S.name} · ${ev.name}`, icon: S.icon, evIcon: ev.icon, desc: ev.text.join(". ") + ".", mods: ev.mods, modText: ev.text,
    waves, diff: 1 + 0.1 * i + 0.4 * (y - 1), fam: FAMS[key], bossHp: y === 1 ? [0.6, 0.75, 0.85, 0.95][i] : 1,   // в первый год сезоны короче — боссы мягче
    bosses: { [waves]: bl[0] }, mid: y >= 2 && bl[1] ? { [Math.ceil(waves / 2)]: bl[1] } : {},
    trees: trees.trees, deadTrees: trees.deadTrees, deco: ev.blossom ? [...D.LOC.forest.deco, "Flower_3_Group", "Flower_4_Group", "Bush_Common_Flowers"] : trees.deco,
    weather: ev.weather, heavy: ev.heavy || 1, blossom: !!ev.blossom,
    water: ev.water || (key === "winter" ? "ice" : "lake"), palms: ev.palms != null ? ev.palms : false, charred: ev.charred != null ? ev.charred : base.charred,
    ground: Object.assign({}, base.ground, ev.ground || {}), sky: Object.assign({}, base.sky, ev.sky || {}), house: "medieval", music: base.music
  });
  if (ev.grassTint) L.ground.tint = ev.grassTint;
  L.reward = rewardFor(y, i);
  return L;
}
export function rewardFor(y, i) {
  const sp = (SPECIAL[y - 1] || SPECIAL[2])[i];
  return { special: sp, gems: Math.round((20 + 6 * i) * (1 + 0.5 * (y - 1))), res: { c: 60 * y + 20 * i, w: 50 * y + 15 * i, s: 40 * y + 15 * i } };
}
// все шаги до года N заранее в D.LOC (мир и игра берут параметры оттуда)
export const MAX_YEAR = 6;
export const STEPS = [];
for (let y = 1; y <= MAX_YEAR; y++) for (let i = 0; i < 4; i++) { const L = step(y, i); STEPS.push(L); D.LOC[L.id] = L; }
export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);
