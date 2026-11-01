// Аванпост — баланс, локации кампании, монстры, башни, оружие, перки, мета-прогресс.
export const MAP_R = 28;            // радиус игрового поля
export const HOUSE_R = 1.7;
export const WALL_R = 3.0;
export const SLOT_R = 4.7;
export const SLOTS = 6;
export const BUILD_FIRST = 40, BUILD_TIME = 26;
export const HEROES = ["knight", "barbarian", "rogue", "mage"];
export const HERO_INFO = { knight: { name: "Рыцарь", icon: "🛡️", desc: "Доспехи в цвет твоей команды" }, barbarian: { name: "Варвар", icon: "🐻", desc: "Медвежья шапка и плащ" }, rogue: { name: "Следопыт", icon: "🏹", desc: "Плащ с капюшоном" }, mage: { name: "Волшебница", icon: "🔮", desc: "Шляпа и мантия" } };

// ---------- Локации кампании ----------
// ground: base/alt/path/plaza — наборы PBR-текстур из assets/tex
export const LOCS = [
  { id: "forest", name: "Лесная долина", icon: "🌲", desc: "Тихая долина у старого леса. По ночам из курганов поднимается нежить.",
    waves: 8, diff: 1.0, fam: ["undead", "beasts"], bosses: { 8: "boss_skel" }, mid: {}, music: "forest",
    ground: { base: "grass", alt: "grass2", path: "dirt", plaza: "stone", tint: [0.78, 1.12, 0.52], tintAlt: [0.85, 1.05, 0.6] },
    trees: [["CommonTree_1", 3], ["CommonTree_2", 3], ["CommonTree_3", 2], ["Pine_2", 2], ["Pine_3", 1], ["TwistedTree_1", 0.5]], deadTrees: 0.05,
    deco: ["Bush_Common", "Bush_Common_Flowers", "Fern_1", "Flower_3_Group", "Flower_4_Group", "Mushroom_Common", "Plant_1_Big", "Clover_1"],
    grass: [0.34, 0.62, 0.48], water: "lake", weather: "pollen", house: "medieval",
    sky: { day: 0xa9d6ec, night: 0x3d4270, fog: 0xb9dceb, sun: 0xfff0d2, sunNight: 0xff9a6a, hemi: [0xe2f3ff, 0x587a3a] } },
  { id: "autumn", name: "Осенние холмы", icon: "🍂", desc: "Багряные холмы. С востока идут орки — сжигают всё на пути.",
    waves: 10, diff: 1.15, fam: ["orcs", "beasts", "flyers"], bosses: { 10: "boss_orc" }, mid: { 5: "boss_skel" }, music: "forest",
    ground: { base: "leaves", alt: "grass2", path: "dirt", plaza: "stone", tint: [1.1, 0.9, 0.75], tintAlt: [1.0, 0.95, 0.55] },
    trees: [["TwistedTree_1", 3], ["TwistedTree_3", 3], ["CommonTree_5", 1], ["DeadTree_1", 0.7], ["Pine_5", 0.5]], deadTrees: 0.1,
    deco: ["Bush_Common", "Fern_1", "Mushroom_Laetiporus", "Mushroom_Common", "Plant_7_Big", "Flower_3_Group"],
    grass: [0.12, 0.55, 0.45], water: "lake", weather: "leaves", house: "medieval",
    sky: { day: 0xf2c99a, night: 0x4a3558, fog: 0xe9c7a0, sun: 0xffd29a, sunNight: 0xff7a4a, hemi: [0xffe6c8, 0x6b4a2a] } },
  { id: "swamp", name: "Гиблое болото", icon: "🐸", desc: "Туман, гнилая вода и зомби. Говорят, в топях живёт королева пауков.",
    waves: 10, diff: 1.3, fam: ["zombies", "beasts", "flyers"], bosses: { 10: "boss_spider" }, mid: { 5: "boss_orc" }, music: "swamp",
    ground: { base: "mud", alt: "mudleaf", path: "planks", plaza: "planks", tint: [0.85, 0.95, 0.8], tintAlt: [0.9, 1, 0.85] },
    trees: [["DeadTree_1", 2], ["DeadTree_3", 2], ["TwistedTree_3", 1], ["Pine_5", 1]], deadTrees: 0.4,
    deco: ["Fern_1", "Mushroom_Common", "Mushroom_Laetiporus", "Plant_7_Big", "Clover_1", "Plant_1_Big"],
    grass: [0.22, 0.45, 0.3], water: "swamp", weather: "fireflies", house: "nordic",
    sky: { day: 0x9fb5a0, night: 0x26353a, fog: 0x9fb39c, sun: 0xe8f0d0, sunNight: 0x8fb0a0, hemi: [0xcfe0c8, 0x34402a] } },
  { id: "desert", name: "Оазис в пустыне", icon: "🏜️", desc: "Восточный оазис среди песков. Минареты, пагоды и песчаный дракон.",
    waves: 12, diff: 1.45, fam: ["orcs", "undead", "beasts", "flyers"], bosses: { 12: "boss_dragon" }, mid: { 6: "boss_spider" }, music: "desert",
    ground: { base: "sand", alt: "redsand", path: "gravel", plaza: "sandpave", tint: [1.05, 0.98, 0.88], tintAlt: [1, 0.95, 0.9] },
    trees: [["DeadTree_3", 1], ["Pine_5", 0.3]], deadTrees: 0.6, palms: true,
    deco: ["Plant_7_Big", "Grass_Wispy_Short", "Pebble_Round_1", "Pebble_Round_3", "Grass_Common_Short"],
    grass: [0.16, 0.45, 0.45], water: "oasis", weather: "dust", house: "eastern", dragonTint: 0xe8b04a,
    sky: { day: 0xf6dcae, night: 0x3b3466, fog: 0xf3d9a8, sun: 0xfff1c0, sunNight: 0xff8a5a, hemi: [0xfff2d8, 0x8a6a3a] } },
  { id: "snow", name: "Снежный перевал", icon: "🏔️", desc: "Ледяной перевал в горах. Мороз, метель и ледяной великан.",
    waves: 12, diff: 1.6, fam: ["undead", "orcs", "flyers", "beasts"], bosses: { 12: "boss_giant" }, mid: { 6: "boss_skel" }, music: "snow",
    ground: { base: "snow", alt: "snow2", path: "snowpath", plaza: "stone", tint: [1, 1, 1.04], tintAlt: [1, 1, 1.05] },
    trees: [["Pine_2", 3], ["Pine_3", 3], ["Pine_5", 2], ["DeadTree_1", 0.4]], deadTrees: 0.1, snowy: true,
    deco: ["Pebble_Round_1", "Pebble_Square_2", "Fern_1"],
    grass: [0.3, 0.2, 0.75], water: "ice", weather: "snow", house: "nordic",
    sky: { day: 0xcfe4f4, night: 0x2a3560, fog: 0xdbe9f5, sun: 0xffffff, sunNight: 0x9fb8ff, hemi: [0xf0f7ff, 0x8899aa] } },
  { id: "volcano", name: "Огненная крепость", icon: "🌋", desc: "Крепость у вулкана. Лава, пепел и огненный дракон — последний рубеж.",
    waves: 15, diff: 1.85, fam: ["orcs", "undead", "zombies", "flyers", "beasts"], bosses: { 15: "boss_dragon" }, mid: { 5: "boss_orc", 10: "boss_giant" }, music: "volcano",
    ground: { base: "burnt", alt: "darkrock", path: "rocks", plaza: "volctile", tint: [1.0, 0.9, 0.85], tintAlt: [0.9, 0.85, 0.85] },
    trees: [["DeadTree_1", 2], ["DeadTree_3", 2]], deadTrees: 1, charred: true,
    deco: ["Pebble_Round_1", "Pebble_Round_3", "Pebble_Square_2"],
    grass: [0.08, 0.35, 0.3], water: "lava", weather: "embers", house: "eastern", dragonTint: 0xff5a2a,
    sky: { day: 0xd99a7a, night: 0x3a1a20, fog: 0xc98a6a, sun: 0xffc090, sunNight: 0xff5030, hemi: [0xffd0b0, 0x4a2010] } }
];
export const LOC = Object.fromEntries(LOCS.map((l) => [l.id, l]));

// ---------- Монстры ----------
// kk: модели KayKit (общие анимации), q: модели Quaternius (свои анимации)
export const MON = {
  // нежить
  walker:   { name: "Скелет", fam: "undead", model: "sk_minion", wpn: "Skeleton_Blade", hp: 30, spd: 1.7, dmg: 8, hdmg: 10, rate: 1.0, range: 1.1, xp: 2, coin: 1, r: 0.45, scale: 0.7, cost: 1, snd: "bone" },
  runner:   { name: "Скелет-бегун", fam: "undead", model: "sk_rogue", hp: 18, spd: 3.5, dmg: 6, hdmg: 6, rate: 1.3, range: 1.0, xp: 2, coin: 1, r: 0.4, scale: 0.66, cost: 1.3, from: 2, snd: "bone" },
  caster:   { name: "Колдун", fam: "undead", model: "sk_mage", wpn: "Skeleton_Staff", hp: 34, spd: 1.5, dmg: 9, hdmg: 9, rate: 0.55, range: 7.5, xp: 4, coin: 2, r: 0.45, scale: 0.7, cost: 3, from: 3, ranged: "curse", snd: "bone" },
  brute:    { name: "Громила", fam: "undead", model: "sk_warrior", wpn: "Skeleton_Axe", hp: 150, spd: 1.25, dmg: 22, hdmg: 34, rate: 0.7, range: 1.5, xp: 9, coin: 5, r: 0.7, scale: 1.0, cost: 6, from: 4, snd: "bone" },
  // орки (модели героев KayKit, перекрашенные)
  orc:      { name: "Орк", fam: "orcs", model: "barbarian", wpn: "Skeleton_Axe", tint: 0x86c46a, hp: 55, spd: 1.9, dmg: 12, hdmg: 16, rate: 0.9, range: 1.2, xp: 3, coin: 2, r: 0.5, scale: 0.78, cost: 2, snd: "growl" },
  orc_archer:{ name: "Орк-лучник", fam: "orcs", model: "rogue", wpn: "crossbow_1handed", tint: 0x8fc070, hp: 38, spd: 1.8, dmg: 9, hdmg: 9, rate: 0.6, range: 8, xp: 4, coin: 2, r: 0.45, scale: 0.74, cost: 3, from: 2, ranged: "arrow", snd: "growl" },
  orc_brute:{ name: "Орк-громила", fam: "orcs", model: "barbarian", wpn: "Skeleton_Axe", tint: 0x5f9a4a, hp: 230, spd: 1.3, dmg: 26, hdmg: 40, rate: 0.6, range: 1.6, xp: 11, coin: 6, r: 0.75, scale: 1.08, cost: 7, from: 4, snd: "growl2" },
  // зомби
  zombie:   { name: "Зомби", fam: "zombies", model: "merchant", tint: 0x9fb08a, walk: "Walking_D_Skeletons", hp: 70, spd: 1.15, dmg: 12, hdmg: 14, rate: 0.8, range: 1.1, xp: 3, coin: 2, r: 0.5, scale: 0.74, cost: 2, snd: "moan" },
  bomber:   { name: "Бомбер", fam: "zombies", model: "sk_minion", tint: 0xff8a7a, hp: 24, spd: 2.7, dmg: 38, hdmg: 55, rate: 1.0, range: 1.2, xp: 3, coin: 2, r: 0.45, scale: 0.68, cost: 2, from: 3, boom: 2.6, snd: "moan" },
  // звери (Quaternius)
  spider:   { name: "Паук", fam: "beasts", q: "m_spider", qa: { move: "Spider_Walk", atk: "Spider_Attack", die: "Spider_Death", idle: "Spider_Idle" }, qs: 0.75, hp: 22, spd: 3.6, dmg: 6, hdmg: 6, rate: 1.2, range: 1.0, xp: 2, coin: 1, r: 0.45, cost: 1.2, snd: "slime" },
  rat:      { name: "Крыса", fam: "beasts", q: "m_rat", qa: { move: "Rat_Run", atk: "Rat_Attack", die: "Rat_Death", idle: "Rat_Idle" }, qs: 0.5, hp: 10, spd: 4.2, dmg: 4, hdmg: 4, rate: 1.4, range: 0.9, xp: 1, coin: 1, r: 0.3, cost: 0.5, group: 3, snd: "die2" },
  frog:     { name: "Жаба", fam: "beasts", q: "m_frog", qa: { move: "Frog_Jump", atk: "Frog_Attack", die: "Frog_Death", idle: "Frog_Idle" }, qs: 0.65, hp: 38, spd: 2.8, dmg: 10, hdmg: 10, rate: 1.0, range: 1.1, xp: 3, coin: 2, r: 0.5, cost: 1.6, from: 2, hop: true, snd: "slime" },
  slime:    { name: "Слизень", fam: "beasts", q: "m_slime", qa: { move: "Slime_Walk", atk: "Slime_Attack", die: "Slime_Death", idle: "Slime_Idle" }, qs: 0.95, hp: 50, spd: 1.5, dmg: 9, hdmg: 12, rate: 0.9, range: 1.1, xp: 3, coin: 2, r: 0.55, cost: 2, from: 2, split: "slimelet", snd: "slime" },
  slimelet: { name: "Слизнячок", fam: "beasts", q: "m_slime", qa: { move: "Slime_Walk", atk: "Slime_Attack", die: "Slime_Death", idle: "Slime_Idle" }, qs: 0.55, hp: 16, spd: 2.2, dmg: 5, hdmg: 6, rate: 1.1, range: 0.9, xp: 1, coin: 1, r: 0.35, cost: 99, snd: "slime" },
  // летающие
  bat:      { name: "Летучая мышь", fam: "flyers", q: "m_bat", qa: { move: "Bat_Flying", atk: "Bat_Attack", die: "Bat_Death" }, qs: 0.8, fly: 1.6, hp: 16, spd: 3.8, dmg: 5, hdmg: 7, rate: 1.2, range: 1.0, xp: 2, coin: 1, r: 0.45, cost: 1.3, from: 2, snd: "die2" },
  wasp:     { name: "Оса", fam: "flyers", q: "m_wasp", qa: { move: "Wasp_Flying", atk: "Wasp_Attack", die: "Wasp_Death" }, qs: 0.8, fly: 1.8, hp: 22, spd: 3.0, dmg: 7, hdmg: 7, rate: 0.7, range: 5.5, xp: 3, coin: 2, r: 0.45, cost: 2, from: 3, ranged: "sting", snd: "die2" },
  dragonling:{ name: "Дракончик", fam: "flyers", q: "m_dragon", qa: { move: "Dragon_Flying", atk: "Dragon_Attack", die: "Dragon_Death" }, qs: 1.1, fly: 2.0, hp: 60, spd: 2.4, dmg: 12, hdmg: 14, rate: 0.5, range: 6.5, xp: 6, coin: 4, r: 0.6, cost: 4, from: 5, ranged: "fire", snd: "roar" },
  // боссы
  boss_skel:  { name: "Король костей", fam: "boss", model: "sk_warrior", wpn: "Skeleton_Axe", shield: "Skeleton_Shield_Large_A", tint: 0xd9c2ff, hp: 1100, spd: 1.2, dmg: 30, hdmg: 42, rate: 0.45, range: 2.4, xp: 70, coin: 45, r: 1.3, scale: 1.8, boss: true, abil: ["slam", "summon", "charge"], minion: "walker", snd: "roar" },
  boss_orc:   { name: "Вождь орков", fam: "boss", model: "barbarian", wpn: "Skeleton_Axe", tint: 0x4f8a3a, hp: 1500, spd: 1.35, dmg: 34, hdmg: 48, rate: 0.5, range: 2.3, xp: 85, coin: 55, r: 1.3, scale: 1.9, boss: true, abil: ["charge", "slam", "enrage"], minion: "orc", snd: "roar2" },
  boss_spider:{ name: "Королева пауков", fam: "boss", q: "m_spider", qa: { move: "Spider_Walk", atk: "Spider_Attack", die: "Spider_Death", idle: "Spider_Idle" }, qs: 2.3, tint: 0xb04aa0, hp: 1700, spd: 1.5, dmg: 28, hdmg: 40, rate: 0.55, range: 2.6, xp: 95, coin: 60, r: 1.5, boss: true, abil: ["web", "summon", "charge"], minion: "spider", snd: "roar" },
  boss_dragon:{ name: "Дракон", fam: "boss", q: "m_dragon", qa: { move: "Dragon_Flying", atk: "Dragon_Attack2", die: "Dragon_Death" }, qs: 3.0, fly: 3.2, hp: 2300, spd: 1.4, dmg: 30, hdmg: 45, rate: 0.5, range: 6, xp: 130, coin: 80, r: 1.6, boss: true, abil: ["breath", "volley", "summon"], minion: "dragonling", ranged: "fire", snd: "roar2" },
  boss_giant: { name: "Ледяной великан", fam: "boss", model: "knight", tint: 0x9fd8ff, hp: 2600, spd: 1.15, dmg: 40, hdmg: 60, rate: 0.4, range: 2.6, xp: 140, coin: 85, r: 1.5, scale: 2.2, boss: true, abil: ["slam", "shards", "enrage"], minion: "walker", snd: "roar2" }
};
export const MON_IDS = Object.keys(MON);
export const FAM = { undead: ["walker", "runner", "caster", "brute"], orcs: ["orc", "orc_archer", "orc_brute"], zombies: ["zombie", "bomber"], beasts: ["spider", "rat", "frog", "slime"], flyers: ["bat", "wasp", "dragonling"] };
export const ELITE = { rage: { name: "Ярость", color: 0xff4040 }, shield: { name: "Щит", color: 0x4aa8ff }, regen: { name: "Лечение", color: 0x5cff7a } };

export function waveBudget(w, n, diff) { return Math.round((7 + w * 4.2 + Math.pow(w, 1.35)) * (1 + 0.55 * (n - 1)) * (0.85 + 0.15 * diff) * (w <= 2 ? 0.8 : 1)); }
export function hpMul(w, n, diff) { return (1 + 0.13 * (w - 1) + 0.011 * (w - 1) * (w - 1)) * (1 + 0.3 * (n - 1)) * (1 + (diff - 1) * 0.7); }
export function makeWave(loc, w, n, rnd) {
  const L = LOC[loc] || LOCS[0], list = [];
  let b = waveBudget(w, n, L.diff);
  const boss = L.bosses[w] || L.mid[w];
  if (boss) list.push(boss);
  const pool = [];
  for (const f of L.fam) for (const k of FAM[f]) if ((MON[k].from || 1) <= w) pool.push(k);
  const weight = { walker: 5, runner: 3, caster: 1.4, brute: 1, orc: 4, orc_archer: 1.6, orc_brute: 0.9, zombie: 4, bomber: 1.4, spider: 3, rat: 1.6, frog: 1.6, slime: 1.4, bat: 2, wasp: 1.2, dragonling: 0.7 };
  while (b > 0 && pool.length) {
    let tot = 0; pool.forEach((k) => (tot += weight[k] || 1));
    let x = rnd() * tot, pick = pool[0];
    for (const k of pool) { x -= weight[k] || 1; if (x <= 0) { pick = k; break; } }
    const g = MON[pick].group || 1;
    for (let i = 0; i < g; i++) list.push(pick);
    b -= MON[pick].cost * g;
  }
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

// ---------- Оружие ----------
// kind: bolt (снаряд), chain (молния), cone (огнемёт), boomer (бумеранг), orbit (клинки), rocket
export const WEAPONS = {
  crossbow: { name: "Арбалет", icon: "🏹", model: "crossbow_1handed", kind: "bolt", dmg: 12, rate: 2.0, range: 8, n: 1, spread: 0.12, speed: 24, pierce: 0, proj: "bolt", snd: "xbow", price: 0, desc: "Надёжный и быстрый" },
  shotgun:  { name: "Арбалет-дробовик", icon: "💥", model: "crossbow_2handed", kind: "bolt", dmg: 7, rate: 1.25, range: 6.5, n: 5, spread: 0.75, speed: 22, pierce: 0, proj: "bolt", snd: "shotgun", price: 70, desc: "Веер из 5 болтов вблизи" },
  heavy:    { name: "Тяжёлый арбалет", icon: "🎯", model: "crossbow_2handed", tint: 0x6b4b8a, kind: "bolt", dmg: 34, rate: 0.95, range: 11, n: 1, spread: 0.05, speed: 34, pierce: 2, proj: "heavy", snd: "heavy", price: 95, desc: "Пробивает насквозь троих" },
  frostbow: { name: "Ледяной посох", icon: "❄️", model: "staff", tint: 0x9fe8ff, kind: "bolt", dmg: 10, rate: 2.3, range: 8.5, n: 1, spread: 0.1, speed: 22, pierce: 1, proj: "ice", frost: true, snd: "ice", price: 90, desc: "Осколки льда замедляют" },
  venom:    { name: "Ядовитый лук", icon: "🧪", model: "crossbow_1handed", tint: 0x7ad04a, kind: "bolt", dmg: 8, rate: 2.2, range: 8.5, n: 1, spread: 0.1, speed: 24, pierce: 0, proj: "venom", poison: true, snd: "xbow", price: 90, desc: "Яд: урон со временем" },
  storm:    { name: "Посох молний", icon: "⚡", model: "staff", kind: "chain", dmg: 11, rate: 2.0, range: 8.5, n: 1, jumps: 3, snd: "zap", price: 130, desc: "Цепная молния по 4 врагам" },
  fire:     { name: "Огненный жезл", icon: "🔥", model: "wand", kind: "bolt", dmg: 22, rate: 1.5, range: 9, n: 1, spread: 0.08, speed: 16, pierce: 0, splash: 2.1, proj: "fire", burn: true, snd: "firecast", price: 150, desc: "Огненные шары с поджогом" },
  flamer:   { name: "Дыхание дракона", icon: "🐉", model: "wand", tint: 0xff7a2f, kind: "cone", dmg: 4.5, rate: 9, range: 4.8, n: 1, cone: 0.6, burn: true, snd: "flame", price: 160, desc: "Огнемёт: конус пламени вблизи" },
  boomer:   { name: "Бумеранг", icon: "🪃", model: "Axe_Bronze", kind: "boomer", dmg: 16, rate: 1.1, range: 8, n: 1, spread: 0.4, speed: 15, snd: "whoosh", price: 120, desc: "Летит туда и обратно сквозь всех" },
  blades:   { name: "Кружащие клинки", icon: "⚔️", model: "Sword_Bronze", kind: "orbit", dmg: 11, rate: 2.5, range: 2.4, n: 3, snd: "blade", price: 140, desc: "3 клинка кружат вокруг тебя" },
  rocket:   { name: "Ракетница гномов", icon: "🚀", model: "crossbow_2handed", tint: 0x3a3a46, kind: "rocket", dmg: 28, rate: 0.9, range: 11, n: 1, spread: 0.2, speed: 13, splash: 2.4, proj: "rocket", snd: "rocket", price: 175, desc: "Самонаводящиеся ракеты со взрывом" }
};
// ---------- Броня ----------
export const ARMOR = {
  none:    { name: "Без брони", hp: 0, def: 0, tint: null },
  leather: { name: "Кожаная куртка", icon: "🧥", hp: 30, def: 0.1, tint: 0xb07a4a, price: 40, desc: "+30 ❤️, −10% урона" },
  robe:    { name: "Мантия мага", icon: "🔮", hp: 20, def: 0.05, mag: 0.2, tint: 0x8a5cf6, price: 70, desc: "+20 ❤️, +20% урона магией" },
  wind:    { name: "Плащ ветра", icon: "🌬️", hp: 25, def: 0.08, spd: 0.15, tint: 0x6fd6c6, price: 75, desc: "+15% скорости, +25 ❤️" },
  chain:   { name: "Кольчуга", icon: "🛡️", hp: 60, def: 0.2, tint: 0x9fb3c8, price: 90, desc: "+60 ❤️, −20% урона" },
  samurai: { name: "Доспех самурая", icon: "🏯", hp: 70, def: 0.22, crit: 0.1, tint: 0xd84a3a, price: 140, desc: "+70 ❤️, −22% урона, +10% крит" },
  gold:    { name: "Золотые латы", icon: "👑", hp: 110, def: 0.3, tint: 0xffc94d, price: 180, desc: "+110 ❤️, −30% урона" }
};
// ---------- Амулеты ----------
export const AMULETS = {
  none:   { name: "Нет" },
  greed:  { name: "Амулет жадности", icon: "💰", price: 55, color: 0xffd34d, desc: "+40% монет" },
  vamp:   { name: "Амулет вампира", icon: "🩸", price: 70, color: 0xff3355, desc: "+3 ❤️ за каждое убийство" },
  rage:   { name: "Амулет ярости", icon: "😡", price: 85, color: 0xff7a2f, desc: "+25% урона" },
  wind:   { name: "Амулет ветра", icon: "🌪️", price: 65, color: 0x7dfcc6, desc: "+20% бега, +10% скорострельности" },
  guard:  { name: "Амулет стража", icon: "🏰", price: 75, color: 0x6aa8ff, desc: "Твои башни бьют на 35% сильнее" },
  storm:  { name: "Амулет грозы", icon: "🌩️", price: 95, color: 0xb8a6ff, desc: "Каждый 6-й выстрел — удар молнии" },
  luck:   { name: "Клевер удачи", icon: "🍀", price: 60, color: 0x6cff6c, desc: "+12% шанс крита" },
  phoenix:{ name: "Перо феникса", icon: "🪶", price: 120, color: 0xff9a3a, desc: "Раз за волну воскрешает на месте" }
};
// ---------- Расходники ----------
export const ITEMS = {
  potion: { name: "Зелье лечения", icon: "🧪", price: 15, max: 5, desc: "Лечит 70 ❤️" },
  rage:   { name: "Зелье ярости", icon: "🍷", price: 25, max: 3, desc: "×2 урон на 10 секунд" },
  bomb:   { name: "Бомба", icon: "💣", price: 30, max: 3, desc: "Взрыв по ближайшей толпе" },
  scroll: { name: "Свиток дома", icon: "📜", price: 20, max: 2, desc: "Телепорт к своему аванпосту" }
};

// ---------- Перки ----------
export const RARITY = { c: { name: "Обычный", color: "#9fb3c8", w: 60 }, r: { name: "Редкий", color: "#4aa8ff", w: 30 }, e: { name: "Эпический", color: "#c77dff", w: 10 } };
export const PERKS = {
  dmg:     { r: "c", name: "Сила", icon: "💪", desc: "+18% к урону", max: 8 },
  rate:    { r: "c", name: "Скорострельность", icon: "⚡", desc: "+14% к скорости атаки", max: 6 },
  range:   { r: "c", name: "Дальнобойность", icon: "🔭", desc: "+12% к дальности", max: 4 },
  speed:   { r: "c", name: "Быстрые ноги", icon: "👟", desc: "+12% к скорости бега", max: 4 },
  hp:      { r: "c", name: "Здоровяк", icon: "❤️", desc: "+30 к макс. здоровью и лечение", max: 6 },
  regen:   { r: "c", name: "Регенерация", icon: "💚", desc: "+1.2 ❤️ в секунду", max: 4 },
  crit:    { r: "c", name: "Меткость", icon: "🎯", desc: "+9% шанс крита", max: 5 },
  magnet:  { r: "c", name: "Магнит", icon: "🧲", desc: "Монеты летят к тебе издалека", max: 3 },
  lumber:  { r: "c", name: "Работяга", icon: "🪓", desc: "Добыча дерева и камня ×2", max: 2 },
  armor:   { r: "c", name: "Толстая кожа", icon: "🛡️", desc: "−7% входящего урона", max: 3 },
  multi:   { r: "r", name: "+1 снаряд", icon: "🔱", desc: "Ещё один снаряд / клинок / бумеранг", max: 4 },
  pierce:  { r: "r", name: "Пробивание", icon: "🗡️", desc: "Снаряд пробивает +1 врага", max: 3 },
  bounce:  { r: "r", name: "Рикошет", icon: "🔄", desc: "Снаряд отскакивает в ещё одного врага", max: 2 },
  frost:   { r: "r", name: "Ледяные болты", icon: "❄️", desc: "Попадания замедляют врагов", max: 1 },
  burn:    { r: "r", name: "Поджог", icon: "🔥", desc: "Попадания поджигают (урон со временем)", max: 1 },
  venom:   { r: "r", name: "Отравление", icon: "☠️", desc: "Попадания отравляют", max: 1 },
  boom:    { r: "r", name: "Взрывные заряды", icon: "🧨", desc: "Попадания взрываются (малый радиус)", max: 2 },
  leech:   { r: "r", name: "Вампиризм", icon: "🦇", desc: "+2 ❤️ за убийство", max: 3 },
  engineer:{ r: "r", name: "Инженер", icon: "🔧", desc: "Твои башни бьют на 20% сильнее", max: 3 },
  greed:   { r: "r", name: "Жадность", icon: "🪙", desc: "+25% монет", max: 2 },
  pyro:    { r: "e", name: "Пироман", icon: "🌋", desc: "Огонь жжёт втрое сильнее", max: 1, need: "burn" },
  plague:  { r: "e", name: "Чума", icon: "🦠", desc: "Отравленные враги заражают соседей при смерти", max: 1, need: "venom" },
  shatter: { r: "e", name: "Ледяной взрыв", icon: "💠", desc: "Замедленные враги взрываются осколками при смерти", max: 1, need: "frost" },
  chain:   { r: "e", name: "Цепная реакция", icon: "💥", desc: "Каждое 4-е убийство вызывает взрыв", max: 1 },
  stormp:  { r: "e", name: "Гроза", icon: "🌩️", desc: "Каждый 5-й выстрел бьёт молнией", max: 1 },
  berserk: { r: "e", name: "Берсерк", icon: "😤", desc: "+45% урона, когда здоровья меньше половины", max: 1 },
  ghost:   { r: "e", name: "Призрачные клинки", icon: "👻", desc: "+2 клинка кружат вокруг тебя с любым оружием", max: 2 },
  nova:    { r: "e", name: "Ледяная нова", icon: "🌀", desc: "Каждые 6 с — волна холода вокруг", max: 1 },
  angel:   { r: "e", name: "Ангел-хранитель", icon: "😇", desc: "Раз за волну спасает от смерти", max: 1 }
};
export const xpNeed = (lvl) => Math.round(8 + 7 * Math.pow(lvl, 1.35));

// ---------- Мета-прогресс (кристаллы 💎) ----------
export const META = {
  hp:    { name: "Закалка", icon: "❤️", desc: "+8% здоровья героя", max: 5, cost: [5, 10, 18, 30, 45] },
  dmg:   { name: "Оружейник", icon: "⚔️", desc: "+6% урона героя", max: 5, cost: [5, 10, 18, 30, 45] },
  coins: { name: "Казна", icon: "🪙", desc: "+12 монет на старте", max: 5, cost: [4, 8, 14, 22, 32] },
  tower: { name: "Зодчий", icon: "🏯", desc: "+6% урона башен", max: 5, cost: [6, 12, 20, 32, 48] },
  wall:  { name: "Каменщик", icon: "🧱", desc: "+10% прочности дома и стен", max: 5, cost: [5, 10, 18, 30, 45] },
  gather:{ name: "Лесоруб", icon: "🪓", desc: "+1 ресурс за удар", max: 2, cost: [10, 25] }
};
export const SKINS = {
  medieval: { name: "Средневековый замок", icon: "🏰", cost: 0 },
  eastern:  { name: "Восточный дворец", icon: "🏯", cost: 25 },
  nordic:   { name: "Северная усадьба", icon: "🛖", cost: 25 }
};
export const STARTW = { crossbow: 0, frostbow: 20, venom: 20, boomer: 35, storm: 45 };   // стартовое оружие за кристаллы

// Итоговые характеристики игрока — одинаковая функция у всех
export function stats(p) {
  const w = WEAPONS[p.wpn] || WEAPONS.crossbow, a = ARMOR[p.arm] || ARMOR.none, k = p.perks || {}, m = p.meta || {};
  const am = p.amu || "none", magic = w.kind === "chain" || w.proj === "fire" || w.proj === "ice" || w.kind === "cone";
  const s = {
    kind: w.kind, dmg: w.dmg * (1 + 0.18 * (k.dmg || 0)) * (am === "rage" ? 1.25 : 1) * (1 + 0.06 * (m.dmg || 0)) * (magic && a.mag ? 1 + a.mag : 1),
    rate: w.rate * (1 + 0.14 * (k.rate || 0)) * (am === "wind" ? 1.1 : 1),
    range: w.range * (1 + 0.12 * (k.range || 0)),
    n: w.n + (k.multi || 0), spread: w.spread || 0, speedP: w.speed || 0, proj: w.proj, jumps: (w.jumps || 0) + (k.bounce || 0), cone: w.cone || 0,
    pierce: (w.pierce || 0) + (k.pierce || 0), bounce: w.kind === "bolt" || w.kind === "rocket" ? (k.bounce || 0) : 0,
    splash: w.splash || (k.boom ? 0.9 + 0.5 * k.boom : 0), splashDmg: w.splash ? 1 : 0.5,
    crit: 0.05 + 0.09 * (k.crit || 0) + (a.crit || 0) + (am === "luck" ? 0.12 : 0),
    frost: !!(w.frost || k.frost), burn: !!(w.burn || k.burn), poison: !!(w.poison || k.venom), pyro: !!k.pyro,
    move: 5.2 * (1 + 0.12 * (k.speed || 0) + (a.spd || 0)) * (am === "wind" ? 1.2 : 1),
    maxhp: Math.round((100 + 30 * (k.hp || 0) + a.hp) * (1 + 0.08 * (m.hp || 0))), def: Math.min(0.6, a.def + 0.07 * (k.armor || 0)), regen: 0.4 + 1.2 * (k.regen || 0),
    magnet: 3.4 * (1 + 0.6 * (k.magnet || 0)), gather: 1 + (k.lumber || 0) + (m.gather || 0),
    coinMul: (am === "greed" ? 1.4 : 1) * (1 + 0.25 * (k.greed || 0)), vamp: (am === "vamp" ? 3 : 0) + 2 * (k.leech || 0),
    turretMul: (am === "guard" ? 1.35 : 1) * (1 + 0.2 * (k.engineer || 0)) * (1 + 0.06 * (m.tower || 0)),
    storm: am === "storm" ? 6 : k.stormp ? 5 : 0, berserk: !!k.berserk, ghost: 2 * (k.ghost || 0), nova: !!k.nova, chain: !!k.chain, plague: !!k.plague, shatter: !!k.shatter,
    angel: !!k.angel, phoenix: am === "phoenix"
  };
  return s;
}

// ---------- Дом, стены, башни ----------
export const HOUSE_LV = [null, { hp: 400 }, { hp: 650, cost: { c: 35, w: 30, s: 15 } }, { hp: 950, cost: { c: 80, w: 60, s: 45 } }, { hp: 1400, cost: { c: 160, w: 90, s: 100 } }];
export const WALL_LV = [
  { name: "Нет ограды", hp: 0 },
  { name: "Деревянный частокол", hp: 200, cost: { w: 30 } },
  { name: "Каменная ограда", hp: 450, cost: { w: 20, s: 40 } },
  { name: "Крепостная стена", hp: 750, cost: { c: 50, s: 80 } }
];
// beh: single / splash / chain / slow / burn / poison / pierce / multi
export const TURRETS = {
  arrow:    { name: "Башня лучников", icon: "🏹", dmg: 10, rate: 1.6, range: 9.5, proj: "arrow", speed: 26, beh: "single", cost: { c: 20, w: 15 }, desc: "Быстро стреляет по одной цели", snd: "arrow" },
  cannon:   { name: "Пушка", icon: "💣", dmg: 30, rate: 0.45, range: 11.5, proj: "stone", speed: 13, splash: 2.4, beh: "splash", cost: { c: 35, s: 20 }, desc: "Ядра с уроном по площади", snd: "cannon" },
  ballista: { name: "Баллиста", icon: "🎯", dmg: 42, rate: 0.55, range: 13, proj: "spear", speed: 34, pierce: 4, beh: "pierce", cost: { c: 40, w: 25 }, desc: "Огромный болт пробивает ряд врагов", snd: "ballista" },
  frost:    { name: "Ледяная башня", icon: "❄️", dmg: 6, rate: 1.0, range: 8.5, proj: "ice", speed: 18, splash: 1.6, slow: 0.5, beh: "slow", cost: { c: 30, w: 10, s: 10 }, desc: "Замедляет врагов вокруг цели", snd: "ice" },
  minaret:  { name: "Минарет молний", icon: "⚡", dmg: 14, rate: 0.9, range: 9, beh: "chain", jumps: 3, cost: { c: 45, s: 25 }, desc: "Цепная молния по 4 врагам", snd: "zap" },
  fire:     { name: "Огненная жаровня", icon: "🔥", dmg: 16, rate: 0.8, range: 8, proj: "fire", speed: 14, splash: 1.8, burn: true, beh: "burn", cost: { c: 40, w: 20, s: 10 }, desc: "Огненные шары и поджог", snd: "firecast" },
  poison:   { name: "Ядовитый котёл", icon: "☠️", dmg: 7, rate: 0.6, range: 8.5, proj: "venom", speed: 12, splash: 2.2, cloud: 3, beh: "poison", cost: { c: 35, w: 15, s: 15 }, desc: "Ядовитое облако на 3 секунды", snd: "poison" },
  pagoda:   { name: "Пагода ниндзя", icon: "🏯", dmg: 9, rate: 1.4, range: 9, proj: "shuriken", speed: 22, multi: 3, beh: "multi", cost: { c: 45, w: 30 }, desc: "Сюрикены сразу по 3 целям", snd: "whoosh" }
};
export const TURRET_MAX = 4;
export const turretMul = (lv) => 1 + 0.55 * (lv - 1);
export const upCost = (cost, lv) => { const o = {}; for (const k in cost) o[k] = Math.round(cost[k] * (0.9 + 0.8 * lv)); return o; };
export const REPAIR = { w: 12, part: 0.3 };
export const RES = { tree: { give: "w", amount: 6, regrow: 45 }, rock: { give: "s", amount: 5, regrow: 60 } };
export const fmtCost = (c) => [c.c ? `${c.c}🪙` : "", c.w ? `${c.w}🪵` : "", c.s ? `${c.s}🪨` : ""].filter(Boolean).join(" ");
