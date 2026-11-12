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
export const HELPER = { speed: 2.9, cap: 4, catchT: 0.95, xferT: 0.14 };
export const SCHOOL = { max: 26, regen: 0.55 };       // рыб в косяке, сек на одну новую
export const CUSTOMER = { patience: 46, speed: 2.4, buyT: 0.28 };
export const PAD_R = 1.05;           // радиус площадки-покупки

// улучшения снаряжения (у каждой команды свои уровни). v(lv) — значение на уровне lv (0 — без улучшения)
export const UPG = {
  bag: { n: "Рюкзак", d: "Больше места в стопке", ic: "bag", max: 12, base: 45, mult: 1.62, v: (lv) => PLAYER.cap + lv * 2 },
  boots: { n: "Унты", d: "Ходишь быстрее", ic: "boots", max: 8, base: 70, mult: 1.9, v: (lv) => PLAYER.speed * (1 + lv * 0.075) },
  net: { n: "Сеть", d: "Ловишь быстрее", ic: "net", max: 8, base: 60, mult: 1.85, v: (lv) => PLAYER.catchT / (1 + lv * 0.22) },
  crew: { n: "Артель: короба", d: "Помощники носят больше", ic: "crate", max: 8, base: 300, mult: 1.95, v: (lv) => HELPER.cap + lv },
  crewspd: { n: "Артель: лыжи", d: "Помощники быстрее", ic: "skis", max: 6, base: 450, mult: 2.05, v: (lv) => HELPER.speed * (1 + lv * 0.1) },
};
export const upgCost = (u, lv, mul) => Math.round(UPG[u].base * Math.pow(UPG[u].mult, lv) * (mul || 1) / 5) * 5;

// уровни прилавка: +25% к цене и +полка
export const STALL_LV = { max: 3, mult: 1.25, cost: [0, 2.2, 5, 11] };    // множитель к стоимости самого прилавка

/* ---------- Карта «Вместе» / «Один»: одна большая бухта ----------
   k: spot (место лова), proc (цех: вход → выход), gen (сам производит), stall (прилавок), dock (причал с судном),
      board (доска заказов), helper (наём помощника), upg (улучшение), goal (маяк), pier (мостки)
   cost/after — площадка покупки появляется, когда открыто всё из after. pad — где лежит площадка (по умолчанию в центре). */
export const COOP = {
  w: [-14.5, 14.5], d: [-18, 21.5], start: [-7, -4.6], deco: [{ m: "gear", x: 11.2, z: 1.5, w: 2.8, d: 1.3 }],
  ents: [
    { id: "spot1", k: "spot", n: "Отмель", item: "herring", x: -7, z: -9.6, r: 2.7, sx: -7, sz: -12, free: 1 },
    { id: "stall_fish", k: "stall", n: "Прилавок: сельдь", item: "herring", x: -10.2, z: 6.8, free: 1, cost: 60 },
    { id: "table1", k: "proc", n: "Разделочный стол", model: "table", x: -9.6, z: -2.4, w: 2.4, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.85 }, cost: 30, after: ["spot1"] },
    { id: "stall_fillet", k: "stall", n: "Прилавок: филе", item: "fillet", x: -6.1, z: 6.8, cost: 70, after: ["table1"] },
    { id: "bag", k: "upg", u: "bag", x: 9.0, z: 3.9, after: ["table1"] },
    { id: "boots", k: "upg", u: "boots", x: 11.2, z: 3.9, after: ["stall_fillet"] },
    { id: "net", k: "upg", u: "net", x: 13.4, z: 3.9, after: ["stall_fillet"] },
    { id: "fisher1", k: "helper", n: "Рыбак", role: "fisher", from: "spot1", to: ["table1", "stall_fish"], x: -7.4, z: -5.4, cost: 140, after: ["stall_fillet"] },
    { id: "runner1", k: "helper", n: "Носильщик", role: "runner", from: "table1", to: ["stall_fillet"], x: -9.6, z: 1.6, cost: 220, after: ["fisher1"] },
    { id: "wood", k: "gen", n: "Дровяник", model: "woodshed", x: -12.2, z: 1.9, w: 2.6, d: 2, item: "log", t: 2.2, cap: 14, out: [-12.2, 3.6], cost: 320, after: ["runner1"] },
    { id: "smoke", k: "proc", n: "Коптильня", model: "smokehouse", x: -2, z: -2.7, w: 2.8, d: 2.3, rec: { in: ["fillet", "log"], out: "smoked", t: 1.6 }, cost: 480, after: ["wood"] },
    { id: "stall_smoked", k: "stall", n: "Прилавок: копчёности", item: "smoked", x: -2, z: 6.8, cost: 620, after: ["smoke"] },
    { id: "table2", k: "proc", n: "Второй стол", model: "table", x: -6.4, z: -2.4, w: 2.4, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.85 }, cost: 750, after: ["stall_smoked"] },
    { id: "woodman", k: "helper", n: "Дровосек", role: "runner", from: "wood", to: ["smoke"], x: -13.6, z: -0.6, cost: 900, after: ["stall_smoked"] },
    { id: "fisher2", k: "helper", n: "Рыбак", role: "fisher", from: "spot1", to: ["table2", "table1"], x: -5.0, z: -5.4, cost: 1100, after: ["table2"] },
    { id: "runner2", k: "helper", n: "Носильщик", role: "runner", from: "table2", to: ["smoke", "stall_fillet"], x: -6.4, z: 1.6, cost: 1300, after: ["fisher2"] },
    { id: "runner3", k: "helper", n: "Коптильщик", role: "runner", from: "smoke", to: ["stall_smoked"], x: -2, z: 1.6, cost: 1500, after: ["woodman"] },
    { id: "cashier", k: "helper", n: "Кассир", role: "cashier", x: 0.1, z: 3.2, cost: 1800, after: ["runner3"] },
    { id: "crew", k: "upg", u: "crew", x: -12.6, z: 9.9, after: ["fisher2"] },
    { id: "crewspd", k: "upg", u: "crewspd", x: -12.6, z: 7.8, after: ["runner3"] },
    { id: "pier", k: "pier", n: "Мостки", x: 5, z: -10.6, x0: 5, z0: -7.4, z1: -14.6, pad: [5, -6.2], cost: 1800, after: ["cashier"] },
    { id: "spot2", k: "spot", n: "Глубина: лосось", item: "salmon", x: 5, z: -14, r: 1.5, sx: 5, sz: -16.5, after: ["pier"], auto: 1 },
    { id: "steak", k: "proc", n: "Разделка лосося", model: "table2", x: 2.6, z: -2.4, w: 2.4, d: 1.4, rec: { in: ["salmon"], out: "steak", t: 1.1 }, cost: 2200, after: ["pier"] },
    { id: "stall_steak", k: "stall", n: "Прилавок: стейки", item: "steak", x: 2.1, z: 6.8, cost: 2700, after: ["steak"] },
    { id: "fisher3", k: "helper", n: "Рыбак с мостков", role: "fisher", from: "spot2", to: ["steak"], x: 6.4, z: -6.2, cost: 3200, after: ["stall_steak"] },
    { id: "runner4", k: "helper", n: "Носильщик", role: "runner", from: "steak", to: ["stall_steak"], x: 2.6, z: 1.6, cost: 3800, after: ["fisher3"] },
    { id: "caviar", k: "proc", n: "Икорня", model: "caviar", x: 7.2, z: -2.6, w: 2.4, d: 1.9, rec: { in: ["salmon"], out: "caviar", t: 1.9 }, cost: 4600, after: ["runner4"] },
    { id: "stall_caviar", k: "stall", n: "Прилавок: икра", item: "caviar", x: 6.2, z: 6.8, cost: 5600, after: ["caviar"] },
    { id: "fisher4", k: "helper", n: "Рыбак с мостков", role: "fisher", from: "spot2", to: ["caviar", "steak"], x: 3.6, z: -6.2, cost: 6400, after: ["stall_caviar"] },
    { id: "runner5", k: "helper", n: "Носильщик", role: "runner", from: "caviar", to: ["stall_caviar"], x: 7.2, z: 1.7, cost: 7100, after: ["fisher4"] },
    { id: "cannery", k: "proc", n: "Консервный цех", model: "cannery", x: -5.6, z: 2.4, w: 2.8, d: 1.9, rec: { in: ["fillet"], out: "can", t: 0.7 }, inS: "n", outS: "e", cost: 8200, after: ["runner5", "runner2"] },
    { id: "dock", k: "dock", n: "Причал", x: 10.7, z: -9.4, accept: ["can", "crate"], cap: 30, pad: [10.4, -5.2], cost: 9800, after: ["cannery"] },
    { id: "runner6", k: "helper", n: "Грузчик", role: "runner", from: "cannery", to: ["dock"], x: -1.2, z: 3.4, cost: 11200, after: ["dock"] },
    { id: "icehole", k: "gen", n: "Прорубь", model: "icehole", x: -12.4, z: -4.6, w: 2.4, d: 2.2, item: "ice", t: 1.8, cap: 14, out: [-12.4, -2.7], cost: 13500, after: ["runner6"] },
    { id: "icehouse", k: "proc", n: "Ледник", model: "icehouse", x: 3.6, z: 2.4, w: 2.8, d: 2, rec: { in: ["steak", "ice"], out: "crate", t: 2.0 }, inS: "n", outS: "s", cost: 17200, after: ["icehole"] },
    { id: "runner7", k: "helper", n: "Ледоруб", role: "runner", from: "icehole", to: ["icehouse"], x: -10, z: -6, cost: 20200, after: ["icehouse"] },
    { id: "runner8", k: "helper", n: "Грузчик", role: "runner", from: "icehouse", to: ["dock"], x: 6.6, z: 2.4, cost: 23200, after: ["runner7"] },
    { id: "board", k: "board", n: "Доска заказов", x: 10.4, z: 7.2, after: ["stall_smoked"], coopOnly: 1 },
    { id: "light", k: "goal", n: "Маяк", x: 12.6, z: -11.6, pad: [13.0, -4.6], cost: 45000, after: ["runner8"] },
  ],
};

/* ---------- Карта «Друг против друга»: две базы зеркально, общая толпа в центре ----------
   Координаты — для левой базы (команда 0, x < 0). Правая — зеркально по x. */
export const VS = {
  w: [-15, 15], d: [-18, 21.5], start: [-7, -4.6], deco: [],
  ents: [
    { id: "spot1", k: "spot", n: "Отмель", item: "herring", x: -7.6, z: -9.6, r: 2.5, sx: -7.6, sz: -12, free: 1 },
    { id: "stall_fish", k: "stall", n: "Прилавок: сельдь", item: "herring", x: -2.8, z: 6.8, free: 1, cost: 40 },
    { id: "table1", k: "proc", n: "Разделочный стол", model: "table", x: -8.2, z: -2.4, w: 2.4, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.85 }, cost: 25, after: ["spot1"] },
    { id: "stall_fillet", k: "stall", n: "Прилавок: филе", item: "fillet", x: -6.2, z: 6.8, cost: 50, after: ["table1"] },
    { id: "bag", k: "upg", u: "bag", x: -9.8, z: 2.8, after: ["table1"] },
    { id: "boots", k: "upg", u: "boots", x: -7.5, z: 2.8, after: ["stall_fillet"] },
    { id: "net", k: "upg", u: "net", x: -5.2, z: 2.8, after: ["stall_fillet"] },
    { id: "fisher1", k: "helper", n: "Рыбак", role: "fisher", from: "spot1", to: ["table1", "stall_fish"], x: -6, z: -6.2, cost: 90, after: ["stall_fillet"] },
    { id: "runner1", k: "helper", n: "Носильщик", role: "runner", from: "table1", to: ["stall_fillet"], x: -8.2, z: 0.4, cost: 140, after: ["fisher1"] },
    { id: "wood", k: "gen", n: "Дровяник", model: "woodshed", x: -13.2, z: 2.6, w: 2.2, d: 2, item: "log", t: 2.2, cap: 14, out: [-13.2, 4.3], cost: 200, after: ["runner1"] },
    { id: "smoke", k: "proc", n: "Коптильня", model: "smokehouse", x: -4.2, z: -2.6, w: 2.8, d: 2.3, rec: { in: ["fillet", "log"], out: "smoked", t: 1.6 }, cost: 290, after: ["wood"] },
    { id: "stall_smoked", k: "stall", n: "Прилавок: копчёности", item: "smoked", x: -9.6, z: 6.8, cost: 360, after: ["smoke"] },
    { id: "woodman", k: "helper", n: "Дровосек", role: "runner", from: "wood", to: ["smoke"], x: -11, z: 4.6, cost: 450, after: ["stall_smoked"] },
    { id: "runner3", k: "helper", n: "Коптильщик", role: "runner", from: "smoke", to: ["stall_smoked"], x: -4.2, z: 0.6, cost: 560, after: ["woodman"] },
    { id: "pier", k: "pier", n: "Мостки", x: -12.2, z: -10.6, x0: -12.2, z0: -7.4, z1: -14.6, pad: [-12.2, -6.0], cost: 800, after: ["runner3"] },
    { id: "spot2", k: "spot", n: "Глубина: лосось", item: "salmon", x: -12.2, z: -14, r: 1.5, sx: -12.2, sz: -16.4, after: ["pier"], auto: 1 },
    { id: "caviar", k: "proc", n: "Икорня", model: "caviar", x: -12.0, z: -2.6, w: 2.4, d: 1.9, rec: { in: ["salmon"], out: "caviar", t: 1.9 }, cost: 1100, after: ["pier"] },
    { id: "stall_caviar", k: "stall", n: "Прилавок: икра", item: "caviar", x: -13.0, z: 6.8, cost: 1400, after: ["caviar"] },
    { id: "fisher3", k: "helper", n: "Рыбак с мостков", role: "fisher", from: "spot2", to: ["caviar"], x: -10.6, z: -6.2, cost: 1700, after: ["stall_caviar"] },
    { id: "runner5", k: "helper", n: "Носильщик", role: "runner", from: "caviar", to: ["stall_caviar"], x: -12.0, z: 0.6, cost: 2000, after: ["fisher3"] },
    { id: "cashier", k: "helper", n: "Кассир", role: "cashier", x: -6.4, z: 4.6, cost: 2300, after: ["runner5"] },
    { id: "light", k: "goal", n: "Маяк", x: -2.6, z: -12.2, pad: [-2.6, -5.4], cost: 4000, after: ["stall_caviar"] },
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
