// Аванпост — баланс, каталоги предметов, перки, монстры, постройки.
export const MAP_R = 28;            // радиус игрового поля
export const HOUSE_R = 1.7;         // радиус «тела» дома (столкновения)
export const WALL_R = 3.0;          // радиус кольца забора
export const SLOT_R = 4.6;          // радиус мест под башни
export const SLOTS = 6;
export const BUILD_FIRST = 40, BUILD_TIME = 28;   // секунды на стройку
export const HEROES = ["knight", "barbarian", "rogue", "mage"];
export const HERO_NAMES = { knight: "Рыцарь", barbarian: "Варвар", rogue: "Разбойник", mage: "Маг" };

// ---------- Монстры ----------
export const MON = {
  walker:  { name: "Скелет",   model: "sk_minion",  wpn: "Skeleton_Blade", hp: 30,  spd: 1.7, dmg: 8,  hdmg: 10, rate: 1.0, range: 1.1, xp: 2,  coin: 1, r: 0.45, scale: 0.7, cost: 1 },
  runner:  { name: "Бегун",    model: "sk_rogue",   wpn: null,             hp: 18,  spd: 3.5, dmg: 6,  hdmg: 6,  rate: 1.3, range: 1.0, xp: 2,  coin: 1, r: 0.4,  scale: 0.66, cost: 1.4, from: 2 },
  spitter: { name: "Колдун",   model: "sk_mage",    wpn: "Skeleton_Staff", hp: 34,  spd: 1.5, dmg: 9,  hdmg: 9,  rate: 0.55, range: 7.5, xp: 4, coin: 2, r: 0.45, scale: 0.7, cost: 3, from: 3, ranged: true },
  exploder:{ name: "Бомбер",   model: "sk_minion",  wpn: null,             hp: 24,  spd: 2.7, dmg: 38, hdmg: 55, rate: 1.0, range: 1.2, xp: 3,  coin: 2, r: 0.45, scale: 0.68, cost: 2, from: 3, boom: 2.6 },
  brute:   { name: "Громила",  model: "sk_warrior", wpn: "Skeleton_Axe",   hp: 150, spd: 1.25, dmg: 22, hdmg: 34, rate: 0.7, range: 1.5, xp: 9, coin: 5, r: 0.7,  scale: 1.0,  cost: 6, from: 4 },
  boss:    { name: "Король костей", model: "sk_warrior", wpn: "Skeleton_Axe", shield: "Skeleton_Shield_Large_A", hp: 1100, spd: 1.15, dmg: 30, hdmg: 42, rate: 0.4, range: 2.4, xp: 70, coin: 45, r: 1.3, scale: 1.8, cost: 0, boss: true, slam: 3.6 }
};
export const MON_IDS = Object.keys(MON);

// состав волны: бюджет «очков» растёт плавно, новые виды появляются постепенно
export function waveBudget(w, n) { return Math.round((7 + w * 4.2 + Math.pow(w, 1.35)) * (1 + 0.55 * (n - 1))); }
export function hpMul(w, n) { return (1 + 0.14 * (w - 1) + 0.012 * (w - 1) * (w - 1)) * (1 + 0.3 * (n - 1)); }
export function makeWave(w, n, rnd) {
  const list = [];
  let b = waveBudget(w, n);
  if (w % 5 === 0) list.push("boss");
  const pool = MON_IDS.filter((k) => k !== "boss" && (MON[k].from || 1) <= w);
  const weight = { walker: 5, runner: 3, spitter: 1.6, exploder: 1.6, brute: 1 };
  while (b > 0) {
    let tot = 0; pool.forEach((k) => (tot += weight[k]));
    let x = rnd() * tot, pick = pool[0];
    for (const k of pool) { x -= weight[k]; if (x <= 0) { pick = k; break; } }
    list.push(pick); b -= MON[pick].cost;
  }
  // перемешиваем, но босса выпускаем в середине волны
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

// ---------- Оружие ----------
export const WEAPONS = {
  crossbow: { name: "Арбалет", icon: "🏹", model: "crossbow_1handed", dmg: 12, rate: 2.0, range: 8, n: 1, spread: 0.12, speed: 24, pierce: 0, proj: "bolt", price: 0, desc: "Надёжный и быстрый" },
  shotgun:  { name: "Арбалет-дробовик", icon: "💥", model: "crossbow_2handed", dmg: 7, rate: 1.25, range: 6.5, n: 5, spread: 0.75, speed: 22, pierce: 0, proj: "bolt", price: 70, desc: "Веер из 5 болтов вблизи" },
  heavy:    { name: "Тяжёлый арбалет", icon: "🎯", model: "crossbow_2handed", tint: 0x6b4b8a, dmg: 34, rate: 0.95, range: 11, n: 1, spread: 0.05, speed: 34, pierce: 2, proj: "heavy", price: 95, desc: "Пробивает насквозь троих" },
  storm:    { name: "Посох молний", icon: "⚡", model: "staff", dmg: 8, rate: 3.6, range: 8.5, n: 1, spread: 0.15, speed: 20, pierce: 0, bounce: 2, proj: "spark", price: 130, desc: "Молнии скачут между врагами" },
  fire:     { name: "Огненный жезл", icon: "🔥", model: "wand", dmg: 22, rate: 1.5, range: 9, n: 1, spread: 0.08, speed: 16, pierce: 0, splash: 2.1, proj: "fire", price: 160, desc: "Огненные шары с взрывом" }
};
// ---------- Броня (меняет цвет одежды) ----------
export const ARMOR = {
  none:    { name: "Без брони", hp: 0, def: 0, tint: null },
  leather: { name: "Кожаная куртка", icon: "🧥", hp: 30, def: 0.1, tint: 0xb07a4a, price: 40, desc: "+30 ❤️, −10% урона" },
  chain:   { name: "Кольчуга", icon: "🛡️", hp: 60, def: 0.2, tint: 0x9fb3c8, price: 90, desc: "+60 ❤️, −20% урона" },
  gold:    { name: "Золотые латы", icon: "👑", hp: 110, def: 0.3, tint: 0xffc94d, price: 180, desc: "+110 ❤️, −30% урона" }
};
// ---------- Амулеты ----------
export const AMULETS = {
  none:   { name: "Нет" },
  greed:  { name: "Амулет жадности", icon: "💰", price: 55, color: 0xffd34d, desc: "+40% монет" },
  vamp:   { name: "Амулет вампира", icon: "🩸", price: 70, color: 0xff3355, desc: "+3 ❤️ за каждое убийство" },
  rage:   { name: "Амулет ярости", icon: "😡", price: 85, color: 0xff7a2f, desc: "+25% урона" },
  wind:   { name: "Амулет ветра", icon: "🌪️", price: 65, color: 0x7dfcc6, desc: "+20% бега, +10% скорострельности" },
  guard:  { name: "Амулет стража", icon: "🏰", price: 75, color: 0x6aa8ff, desc: "Твои башни бьют на 35% сильнее" }
};
export const POTION = { name: "Зелье лечения", icon: "🧪", price: 15, heal: 70, max: 5, desc: "Лечит 70 ❤️ (кнопка 🧪)" };

// ---------- Перки при повышении уровня ----------
export const PERKS = {
  multi:  { name: "+1 снаряд",        icon: "🎯", desc: "Стреляешь на один снаряд больше", max: 4 },
  rate:   { name: "Скорострельность", icon: "⚡", desc: "+18% к скорости стрельбы", max: 6 },
  dmg:    { name: "Сила",             icon: "💪", desc: "+20% к урону", max: 8 },
  pierce: { name: "Пробивание",       icon: "🗡️", desc: "Снаряд пробивает +1 врага", max: 3 },
  range:  { name: "Дальнобойность",   icon: "🔭", desc: "+12% к дальности", max: 4 },
  speed:  { name: "Быстрые ноги",     icon: "👟", desc: "+12% к скорости бега", max: 4 },
  hp:     { name: "Здоровяк",         icon: "❤️", desc: "+30 к макс. здоровью и лечение", max: 6 },
  regen:  { name: "Регенерация",      icon: "💚", desc: "+1.2 ❤️ в секунду", max: 4 },
  crit:   { name: "Меткость",         icon: "💥", desc: "+10% шанс крита (×2 урона)", max: 5 },
  magnet: { name: "Магнит",           icon: "🧲", desc: "Монеты летят к тебе издалека", max: 3 },
  lumber: { name: "Работяга",         icon: "🪓", desc: "Дерево и камень добываются вдвое быстрее", max: 2 },
  frost:  { name: "Ледяные болты",    icon: "❄️", desc: "Попадания замедляют врагов", max: 1 },
  boom:   { name: "Взрывные болты",   icon: "🧨", desc: "Попадания взрываются (малый радиус)", max: 2 },
  bounce: { name: "Рикошет",          icon: "🔄", desc: "Снаряд отскакивает в ещё одного врага", max: 2 }
};
export const xpNeed = (lvl) => Math.round(8 + 7 * Math.pow(lvl, 1.35));

// Итоговые характеристики игрока — одинаковая функция у всех (хозяин и гости)
export function stats(p) {
  const w = WEAPONS[p.wpn] || WEAPONS.crossbow, a = ARMOR[p.arm] || ARMOR.none, k = p.perks || {};
  const am = p.amu || "none";
  const s = {
    dmg: w.dmg * (1 + 0.2 * (k.dmg || 0)) * (am === "rage" ? 1.25 : 1),
    rate: w.rate * (1 + 0.18 * (k.rate || 0)) * (am === "wind" ? 1.1 : 1),
    range: w.range * (1 + 0.12 * (k.range || 0)),
    n: w.n + (k.multi || 0),
    spread: w.spread, speedP: w.speed, proj: w.proj,
    pierce: w.pierce + (k.pierce || 0), bounce: (w.bounce || 0) + (k.bounce || 0), splash: w.splash || (k.boom ? 0.9 + 0.5 * k.boom : 0),
    splashDmg: w.splash ? 1 : 0.5,
    crit: 0.05 + 0.1 * (k.crit || 0), frost: !!k.frost,
    move: 5.2 * (1 + 0.12 * (k.speed || 0)) * (am === "wind" ? 1.2 : 1),
    maxhp: 100 + 30 * (k.hp || 0) + a.hp, def: a.def, regen: 0.4 + 1.2 * (k.regen || 0),
    magnet: 3.4 * (1 + 0.6 * (k.magnet || 0)), gather: 1 + (k.lumber || 0),
    coinMul: am === "greed" ? 1.4 : 1, vamp: am === "vamp" ? 3 : 0, turretMul: am === "guard" ? 1.35 : 1
  };
  return s;
}

// ---------- Дом, стены, башни ----------
export const HOUSE_LV = [
  null,
  { model: "building_home_A_blue", hp: 300, scale: 3.2 },
  { model: "building_home_B_blue", hp: 520, scale: 2.9, cost: { c: 35, w: 30, s: 15 } },
  { model: "building_barracks_blue", hp: 800, scale: 2.25, cost: { c: 80, w: 60, s: 45 } },
  { model: "building_castle_blue", hp: 1200, scale: 1.55, cost: { c: 160, w: 90, s: 100 } }
];
export const WALL_LV = [
  { name: "Нет ограды", hp: 0 },
  { name: "Деревянный забор", model: "fence_wood_straight", hp: 160, cost: { w: 30 } },
  { name: "Каменная ограда", model: "fence_stone_straight", hp: 380, cost: { w: 20, s: 40 } },
  { name: "Крепостная стена", model: "wall_straight", hp: 650, cost: { c: 50, s: 80 } }
];
export const TURRETS = {
  arrow:    { name: "Башня лучников", icon: "🏹", model: "building_tower_A_blue", scale: 2.0, dmg: 10, rate: 1.6, range: 9.5, proj: "arrow", speed: 26, cost: { c: 20, w: 15 }, desc: "Быстро стреляет по одной цели" },
  catapult: { name: "Катапульта", icon: "💣", model: "building_tower_catapult_blue", scale: 1.9, dmg: 30, rate: 0.45, range: 11.5, proj: "stone", speed: 13, splash: 2.4, cost: { c: 35, s: 20 }, desc: "Камни с уроном по площади" },
  frost:    { name: "Ледяная башня", icon: "❄️", model: "building_tower_B_blue", scale: 1.7, dmg: 6, rate: 1.0, range: 8.5, proj: "ice", speed: 18, splash: 1.6, slow: 0.5, cost: { c: 30, w: 10, s: 10 }, desc: "Замедляет врагов вокруг цели", hue: -0.1 }
};
export const TURRET_MAX = 4;
export const turretMul = (lv) => 1 + 0.55 * (lv - 1);           // урон растёт с уровнем
export const upCost = (cost, lv) => { const o = {}; for (const k in cost) o[k] = Math.round(cost[k] * (0.9 + 0.8 * lv)); return o; };
export const REPAIR = { w: 12, part: 0.3 };                    // починка: 12 дерева = 30% прочности

export const RES = { tree: { give: "w", amount: 6, regrow: 45 }, rock: { give: "s", amount: 5, regrow: 60 } };
export const fmtCost = (c) => [c.c ? `${c.c}🪙` : "", c.w ? `${c.w}🪵` : "", c.s ? `${c.s}🪨` : ""].filter(Boolean).join(" ");
