// «Промысел» — данные: товары, карты (вместе / друг против друга), цены, помощники, улучшения, бухты.
// Мир в метрах: x — вправо, z — к игроку (вниз по экрану). Море сверху (z < SHORE), рынок снизу.
// Ничего не знает про three.js и DOM — используется и игрой, и симуляцией баланса (tools/balance.mjs).

export const SHORE = -7.2;           // линия берега
export const ROAD_Z = 20.5;          // дорога, откуда приходят покупатели

// товары. price — цена одной штуки у прилавка (в бухте 1); ship — сколько платит судно (только для экспорта)
export const ITEMS = [
  { id: "herring", n: "Сельдь", price: 2, h: 0.2, c: "#8fb4c9" },
  { id: "fillet", n: "Филе", price: 5, h: 0.16, c: "#f39a7b" },
  { id: "log", n: "Дрова", price: 0, h: 0.24, c: "#a06a3b" },
  { id: "smoked", n: "Копчёная рыба", price: 14, h: 0.22, c: "#c7772f" },
  { id: "salmon", n: "Лосось", price: 0, h: 0.26, c: "#e2876e" },
  { id: "steak", n: "Стейк лосося", price: 21, h: 0.17, c: "#ff8a6a" },
  { id: "caviar", n: "Икра", price: 44, h: 0.2, c: "#ff5a3c" },
  { id: "can", n: "Консервы", price: 0, ship: 30, h: 0.2, c: "#cfd7de" },
  { id: "ice", n: "Лёд", price: 0, h: 0.3, c: "#bfeaff" },
  { id: "crate", n: "Ящик улова", price: 0, ship: 120, h: 0.34, c: "#d9b27a" },
];
export const IT = {}; ITEMS.forEach((it, i) => { it.i = i; IT[it.id] = i; });
export const NIT = ITEMS.length;

// базовые параметры игрока и помощников
export const PLAYER = { speed: 4.4, cap: 6, catchT: 0.5, xferT: 0.075 };
export const HELPER = { speed: 3.4, cap: 6, catchT: 0.75, xferT: 0.11 };
export const SCHOOL = { max: 40, regen: 0.28 };       // рыб в косяке, сек на одну новую
export const CUSTOMER = { patience: 46, speed: 2.4, buyT: 0.28 };
export const PAD_R = 1.05;           // радиус площадки-покупки

// улучшения снаряжения (у каждой команды свои уровни). v(lv) — значение на уровне lv (0 — без улучшения)
export const UPG = {
  bag: { n: "Рюкзак", d: "Больше места в стопке", ic: "bag", max: 12, base: 30, mult: 1.6, v: (lv) => PLAYER.cap + lv * 2 },
  boots: { n: "Унты", d: "Ходишь быстрее", ic: "boots", max: 8, base: 50, mult: 1.85, v: (lv) => PLAYER.speed * (1 + lv * 0.075) },
  net: { n: "Сеть", d: "Ловишь быстрее", ic: "net", max: 8, base: 45, mult: 1.8, v: (lv) => PLAYER.catchT / (1 + lv * 0.22) },
  crew: { n: "Артель: короба", d: "Помощники носят больше", ic: "crate", max: 10, base: 80, mult: 1.6, v: (lv) => HELPER.cap + lv * 2 },
  crewspd: { n: "Артель: лыжи", d: "Помощники быстрее", ic: "skis", max: 8, base: 120, mult: 1.65, v: (lv) => HELPER.speed * (1 + lv * 0.12) },
};
// улучшение цеха: быстрее и больше места. Цена — от цены самого цеха
export const SUPG = { max: 5, k: 0.45, mult: 1.9, speed: 0.45, cap: 10 };
export const upgCost = (u, lv, mul) => Math.round(UPG[u].base * Math.pow(UPG[u].mult, lv) * (mul || 1) / 5) * 5;

// уровни прилавка: +25% к цене и +полка
export const STALL_LV = { max: 3, mult: 1.25, cost: [0, 2.2, 5, 11] };    // множитель к стоимости самого прилавка

/* ---------- Карта «Вместе» / «Один»: одна большая бухта ----------
   k: spot (место лова), proc (цех: вход → выход), gen (сам производит), stall (прилавок), dock (причал с судном),
      board (доска заказов), helper (наём помощника), upg (улучшение), goal (маяк), pier (мостки)
   cost/after — площадка покупки появляется, когда открыто всё из after. pad — где лежит площадка (по умолчанию в центре). */
export const COOP = {
  w: [-14.5, 14.5], d: [-18, 21.5], start: [-9, -4.8], deco: [{ m: "gear", x: 11.2, z: 1.5, w: 2.8, d: 1.3 }],
  ents: [
    { id: "spot1", k: "spot", n: "Отмель", item: "herring", x: -9.4, z: -9.7, r: 2.8, sx: -9.4, sz: -12, free: 1 },
    { id: "stall_fish", k: "stall", n: "Прилавок: сельдь", item: "herring", x: -10.2, z: 6.8, free: 1, cost: 60 },
    { id: "fisher0", k: "helper", n: "Рыбак-лоточник", role: "fisher", from: "spot1", to: ["stall_fish"], x: -12.6, z: 7.9, cost: 30, after: ["spot1"] },
    { id: "stall_fillet", k: "stall", n: "Прилавок: филе", item: "fillet", x: -6.1, z: 6.8, cost: 25, after: ["spot1"] },
    { id: "table1", k: "proc", n: "Разделочный стол", model: "table", x: -12.0, z: -3.2, w: 2.4, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.5 }, cost: 35, after: ["stall_fillet"] },
    { id: "runner1", k: "helper", n: "Носильщик", role: "runner", from: "table1", to: ["stall_fillet"], x: -9.05, z: 1.4, cost: 60, after: ["table1"] },
    { id: "bag", k: "upg", u: "bag", x: 9.0, z: 3.9, after: ["table1"] },
    { id: "boots", k: "upg", u: "boots", x: 11.2, z: 3.9, after: ["table1"] },
    { id: "net", k: "upg", u: "net", x: 13.4, z: 3.9, after: ["table1"] },
    { id: "su_table1", k: "supg", of: "table1", x: -12.0, z: -5.75, after: ["table1"] },
    { id: "fisher1", k: "helper", n: "Рыбак", role: "fisher", from: "spot1", to: ["table1", "stall_fish"], x: -5.6, z: -5.75, cost: 100, after: ["runner1"] },
    { id: "crew", k: "upg", u: "crew", x: -12.6, z: 10.0, after: ["fisher0"] },
    { id: "crewspd", k: "upg", u: "crewspd", x: 12.6, z: 10.0, after: ["fisher1"] },
    { id: "stall_smoked", k: "stall", n: "Прилавок: копчёности", item: "smoked", x: -2, z: 6.8, cost: 200, after: ["fisher1"] },
    { id: "smoke", k: "proc", n: "Коптильня", model: "smokehouse", x: -3.4, z: -3.4, w: 2.8, d: 2.3, rec: { in: ["fillet", "log"], out: "smoked", t: 0.8 }, cost: 280, after: ["stall_smoked"] },
    { id: "wood", k: "gen", n: "Дровяник", model: "woodshed", x: -12.4, z: 1.4, w: 2.6, d: 2, item: "log", t: 1.0, cap: 20, cost: 340, after: ["smoke"] },
    { id: "su_smoke", k: "supg", of: "smoke", x: -2.6, z: 1.4, after: ["smoke"] },
    { id: "su_wood", k: "supg", of: "wood", x: -13.4, z: 4.6, after: ["wood"] },
    { id: "woodman", k: "helper", n: "Дровосек", role: "runner", from: "wood", to: ["smoke"], x: -5.6, z: 1.4, cost: 400, after: ["wood"] },
    { id: "runner3", k: "helper", n: "Коптильщик", role: "runner", from: "smoke", to: ["stall_smoked"], x: 3.4, z: 1.4, cost: 480, after: ["woodman"] },
    { id: "board", k: "board", n: "Доска заказов", x: 10.4, z: 7.2, after: ["stall_smoked"], coopOnly: 1 },
    { id: "table2", k: "proc", n: "Второй стол", model: "table", x: -7.8, z: -3.2, w: 2.4, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.5 }, cost: 560, after: ["runner3"] },
    { id: "su_table2", k: "supg", of: "table2", x: -7.8, z: -5.75, after: ["table2"] },
    { id: "fisher2", k: "helper", n: "Рыбак", role: "fisher", from: "spot1", to: ["table2", "table1"], x: 5.2, z: -5.75, cost: 650, after: ["table2"] },
    { id: "runner2", k: "helper", n: "Носильщик", role: "runner", from: "table2", to: ["smoke", "stall_fillet"], x: 0.0, z: 1.4, cost: 750, after: ["fisher2"] },
    { id: "cashier", k: "helper", n: "Кассир", role: "cashier", x: 8.6, z: 1.4, cost: 850, after: ["runner3"] },
    { id: "stall_steak", k: "stall", n: "Прилавок: стейки", item: "steak", x: 2.1, z: 6.8, cost: 1200, after: ["cashier"] },
    { id: "steak", k: "proc", n: "Разделка лосося", model: "table2", x: 1.0, z: -3.2, w: 2.4, d: 1.4, rec: { in: ["salmon"], out: "steak", t: 0.6 }, cost: 1500, after: ["stall_steak"] },
    { id: "pier", k: "pier", n: "Мостки", x: 3.1, z: -10.6, x0: 3.1, z0: -7.4, z1: -14.6, pad: [3.1, -5.8], cost: 1800, after: ["steak"] },
    { id: "spot2", k: "spot", n: "Глубина: лосось", item: "salmon", x: 3.1, z: -14, r: 1.5, sx: 3.1, sz: -16.5, after: ["pier"], auto: 1 },
    { id: "su_steak", k: "supg", of: "steak", x: 1.0, z: -5.75, after: ["pier"] },
    { id: "fisher3", k: "helper", n: "Рыбак с мостков", role: "fisher", from: "spot2", to: ["steak"], x: 7.3, z: -5.75, cost: 2200, after: ["pier"] },
    { id: "runner4", k: "helper", n: "Носильщик", role: "runner", from: "steak", to: ["stall_steak"], x: 9.0, z: -2.6, cost: 2600, after: ["fisher3"] },
    { id: "stall_caviar", k: "stall", n: "Прилавок: икра", item: "caviar", x: 6.2, z: 6.8, cost: 3100, after: ["runner4"] },
    { id: "caviar", k: "proc", n: "Икорня", model: "caviar", x: 5.2, z: -3.3, w: 2.4, d: 1.9, rec: { in: ["salmon"], out: "caviar", t: 1.1 }, cost: 3700, after: ["stall_caviar"] },
    { id: "su_caviar", k: "supg", of: "caviar", x: 6.4, z: 1.4, after: ["caviar"] },
    { id: "fisher4", k: "helper", n: "Рыбак с мостков", role: "fisher", from: "spot2", to: ["caviar", "steak"], x: 11.2, z: -2.6, cost: 4300, after: ["caviar"] },
    { id: "runner5", k: "helper", n: "Носильщик", role: "runner", from: "caviar", to: ["stall_caviar"], x: 13.4, z: -2.6, cost: 5000, after: ["fisher4"] },
    { id: "dock", k: "dock", n: "Причал", x: 10.7, z: -9.4, accept: ["can", "crate"], cap: 30, pad: [10.4, -5.2], cost: 6000, after: ["runner5"] },
    { id: "cannery", k: "proc", n: "Консервный цех", model: "cannery", x: -5.6, z: 1.4, w: 2.8, d: 1.9, rec: { in: ["fillet"], out: "can", t: 0.45 }, cost: 7000, after: ["dock", "runner2", "woodman"] },
    { id: "runner6", k: "helper", n: "Грузчик", role: "runner", from: "cannery", to: ["dock"], x: 10.1, z: -0.5, cost: 8000, after: ["cannery"] },
    { id: "icehouse", k: "proc", n: "Ледник", model: "icehouse", x: 3.4, z: 1.4, w: 2.8, d: 2, rec: { in: ["steak", "ice"], out: "crate", t: 1.0 }, cost: 9500, after: ["runner6", "runner3"] },
    { id: "icehole", k: "gen", n: "Прорубь", model: "icehole", x: 13.4, z: -10.0, w: 2.0, d: 1.6, item: "ice", t: 1.2, cap: 20, cost: 11000, after: ["icehouse"] },
    { id: "runner7", k: "helper", n: "Ледоруб", role: "runner", from: "icehole", to: ["icehouse"], x: 12.3, z: -0.5, cost: 12500, after: ["icehole"] },
    { id: "runner8", k: "helper", n: "Грузчик", role: "runner", from: "icehouse", to: ["dock"], x: -3.3, z: -5.75, cost: 14000, after: ["runner7"] },
    { id: "light", k: "goal", n: "Маяк", x: 11.4, z: -12.4, pad: [13.0, -4.6], cost: 30000, after: ["runner8"] },
  ],
};

/* ---------- Карта «Друг против друга»: две базы зеркально, общая толпа в центре ----------
   Координаты — для левой базы (команда 0, x < 0). Правая — зеркально по x. */
export const VS = {
  w: [-15, 15], d: [-18, 21.5], start: [-7, -4.8], deco: [],
  ents: [
    { id: "spot1", k: "spot", n: "Отмель", item: "herring", x: -7.0, z: -9.7, r: 2.5, sx: -7.0, sz: -12, free: 1 },
    { id: "stall_fish", k: "stall", n: "Прилавок: сельдь", item: "herring", x: -2.8, z: 6.8, free: 1, cost: 40 },
    { id: "fisher0", k: "helper", n: "Рыбак-лоточник", role: "fisher", from: "spot1", to: ["stall_fish"], x: -3.0, z: -5.6, cost: 40, after: ["spot1"] },
    { id: "stall_fillet", k: "stall", n: "Прилавок: филе", item: "fillet", x: -6.2, z: 6.8, cost: 40, after: ["spot1"] },
    { id: "table1", k: "proc", n: "Разделочный стол", model: "table", x: -8.0, z: -3.0, w: 2.4, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.5 }, cost: 50, after: ["stall_fillet"] },
    { id: "bag", k: "upg", u: "bag", x: -9.8, z: 3.2, after: ["table1"] },
    { id: "boots", k: "upg", u: "boots", x: -7.5, z: 3.2, after: ["table1"] },
    { id: "net", k: "upg", u: "net", x: -5.2, z: 3.2, after: ["table1"] },
    { id: "runner1", k: "helper", n: "Носильщик", role: "runner", from: "table1", to: ["stall_fillet"], x: -8.4, z: 1.0, cost: 90, after: ["table1"] },
    { id: "su_table1", k: "supg", of: "table1", x: -8.0, z: -5.6, after: ["table1"] },
    { id: "fisher1", k: "helper", n: "Рыбак", role: "fisher", from: "spot1", to: ["table1", "stall_fish"], x: -5.2, z: -5.6, cost: 140, after: ["runner1"] },
    { id: "stall_smoked", k: "stall", n: "Прилавок: копчёности", item: "smoked", x: -9.6, z: 6.8, cost: 220, after: ["fisher1"] },
    { id: "smoke", k: "proc", n: "Коптильня", model: "smokehouse", x: -3.6, z: -3.2, w: 2.8, d: 2.3, rec: { in: ["fillet", "log"], out: "smoked", t: 0.8 }, cost: 330, after: ["stall_smoked"] },
    { id: "wood", k: "gen", n: "Дровяник", model: "woodshed", x: -13.2, z: 1.4, w: 2.2, d: 2, item: "log", t: 1.0, cap: 20, cost: 420, after: ["smoke"] },
    { id: "su_smoke", k: "supg", of: "smoke", x: -6.2, z: 1.0, after: ["smoke"] },
    { id: "woodman", k: "helper", n: "Дровосек", role: "runner", from: "wood", to: ["smoke"], x: -10.6, z: 1.0, cost: 520, after: ["wood"] },
    { id: "runner3", k: "helper", n: "Коптильщик", role: "runner", from: "smoke", to: ["stall_smoked"], x: -4.0, z: 1.0, cost: 640, after: ["woodman"] },
    { id: "stall_caviar", k: "stall", n: "Прилавок: икра", item: "caviar", x: -13.0, z: 6.8, cost: 900, after: ["runner3"] },
    { id: "caviar", k: "proc", n: "Икорня", model: "caviar", x: -12.2, z: -3.1, w: 2.4, d: 1.9, rec: { in: ["salmon"], out: "caviar", t: 1.1 }, cost: 1150, after: ["stall_caviar"] },
    { id: "pier", k: "pier", n: "Мостки", x: -10.1, z: -10.6, x0: -10.1, z0: -7.4, z1: -14.6, pad: [-10.1, -5.6], cost: 1400, after: ["caviar"] },
    { id: "spot2", k: "spot", n: "Глубина: лосось", item: "salmon", x: -10.1, z: -14, r: 1.5, sx: -10.1, sz: -16.4, after: ["pier"], auto: 1 },
    { id: "fisher3", k: "helper", n: "Рыбак с мостков", role: "fisher", from: "spot2", to: ["caviar"], x: -12.2, z: -5.6, cost: 1800, after: ["pier"] },
    { id: "runner5", k: "helper", n: "Носильщик", role: "runner", from: "caviar", to: ["stall_caviar"], x: -2.9, z: 3.2, cost: 2200, after: ["fisher3"] },
    { id: "cashier", k: "helper", n: "Кассир", role: "cashier", x: -1.8, z: 1.0, cost: 2600, after: ["runner5"] },
    { id: "light", k: "goal", n: "Маяк", x: -2.0, z: -12.0, pad: [-1.3, -8.0], cost: 5500, after: ["runner5"] },
  ],
};

// бухты (локации) — цены и стоимость растут; тема меняет вид мира
export const BAYS = [
  { n: "Тихая бухта", mult: 1, theme: 0 },
  { n: "Ледяной фьорд", mult: 3.5, theme: 1 },
  { n: "Китовый мыс", mult: 12, theme: 2 },
  { n: "Полярная гавань", mult: 40, theme: 3 },
];
// постоянные награды за маяк каждой бухты («Знаки промысла»)
export const PERKS = [
  { id: "p_cap", n: "+2 к рюкзаку навсегда" },
  { id: "p_spd", n: "+8% к скорости навсегда" },
  { id: "p_price", n: "+15% к ценам навсегда" },
];

// сложность «Вместе»: цены площадок, терпение покупателей, сроки заказов
export const DIFF = [
  { id: "easy", n: "Спокойно", cost: 0.8, pat: 1.5, ct: 1.5, star: 1 },
  { id: "norm", n: "Обычно", cost: 1, pat: 1, ct: 1, star: 2 },
  { id: "hard", n: "Сурово", cost: 1.3, pat: 0.7, ct: 0.75, star: 3 },
];
// «Друг против друга»: цели матча
export const VS_GOALS = [
  { id: "light", n: "Кто первым зажжёт маяк", t: 0 },
  { id: "time", n: "10 минут: у кого больше выручка", t: 600 },
];

// подписи, что нужно цеху
export function recText(e) { return e.rec ? e.rec.in.map((i) => ITEMS[IT[i]].n).join(" + ") + " → " + ITEMS[IT[e.rec.out]].n : ""; }
