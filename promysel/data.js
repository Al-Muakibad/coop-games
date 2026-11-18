// «Промысел» — данные: товары, карты (вместе / друг против друга), цены, помощники, улучшения, бухты.
// Мир в метрах: x — вправо, z — к игроку (вниз по экрану). Море сверху (z < SHORE), рынок снизу.
// Ничего не знает про three.js и DOM — используется и игрой, и симуляцией баланса (tools/balance.mjs).

export const SHORE = -7.2;
// поворот камеры вокруг вертикали: берег идёт по диагонали экрана, как у диорамы
export const YAW = 0;           // линия берега
export const ROAD_Z = 20.5;          // дорога, откуда приходят покупатели

// товары. price — цена одной штуки у прилавка (в бухте 1); ship — сколько платит судно (только для экспорта)
export const ITEMS = [
  { id: "herring", n: "Сельдь", price: 2, h: 0.2, c: "#8fb4c9" },
  { id: "fillet", n: "Филе", price: 5, h: 0.16, c: "#f39a7b" },
  { id: "log", n: "Дрова", price: 0, h: 0.24, c: "#a06a3b" },
  { id: "smoked", n: "Копчёная рыба", price: 14, h: 0.22, c: "#c7772f" },
  { id: "salmon", n: "Лосось", price: 3, h: 0.26, c: "#e2876e" },
  { id: "steak", n: "Стейк лосося", price: 6, h: 0.17, c: "#ff8a6a" },
  { id: "caviar", n: "Икра", price: 18, h: 0.2, c: "#ff5a3c" },
  { id: "can", n: "Консервы", price: 0, ship: 11, h: 0.2, c: "#cfd7de" },
  { id: "ice", n: "Лёд", price: 0, h: 0.3, c: "#bfeaff" },
  { id: "crate", n: "Ящик краба", price: 0, ship: 22, h: 0.34, c: "#d9b27a" },
  // товары, которых в первой версии не было (дописываем в конец — старые сохранения хранят номера товаров)
  { id: "salted", n: "Солёная сельдь", price: 9, h: 0.24, c: "#9aa86a" },
  { id: "crab", n: "Краб", price: 3, h: 0.22, c: "#d4553f" },
  { id: "crabc", n: "Варёный краб", price: 8, h: 0.2, c: "#ff6a3d" },
  { id: "mussel", n: "Мидии", price: 14, h: 0.2, c: "#3b3f5c" },
  { id: "cod", n: "Треска", price: 4, h: 0.24, c: "#9a9a6a" },
  { id: "stockfish", n: "Вяленая треска", price: 10, h: 0.16, c: "#d8c08a" },
  { id: "seaweed", n: "Морская капуста", price: 18, h: 0.2, c: "#4f9a5a" },
  { id: "oil", n: "Рыбий жир", price: 0, ship: 27, h: 0.3, c: "#e8b33c" },
  { id: "pie", n: "Рыбник", price: 43, h: 0.18, c: "#e0a050" },
  { id: "soup", n: "Уха", price: 22, h: 0.2, c: "#e8c06a" },
  { id: "gift", n: "Подарочный набор икры", price: 0, ship: 28, h: 0.22, c: "#c9433a" },
  { id: "platter", n: "Морское ассорти", price: 34, h: 0.16, c: "#ff8a6a" },
  { id: "liver", n: "Печень трески", price: 27, h: 0.18, c: "#d9c36a" },
  // раунд 7: глубже цепочки в бухтах 2–4
  { id: "salt", n: "Соль", price: 0, h: 0.18, c: "#f2f2ee" },
  { id: "lox", n: "Копчёный лосось", price: 24, h: 0.16, c: "#e8703f" },
  { id: "keg", n: "Бочонок икры", price: 0, ship: 55, h: 0.26, c: "#a0703f" },
  { id: "dmussel", n: "Вяленые мидии", price: 30, h: 0.16, c: "#5a4a3a" },
  { id: "pate", n: "Крабовый паштет", price: 0, ship: 50, h: 0.18, c: "#e0906a" },
  { id: "smcod", n: "Копчёная треска", price: 16, h: 0.2, c: "#b8742f" },
  { id: "klip", n: "Клипфиск", price: 0, ship: 30, h: 0.14, c: "#e8dcc0" },
  { id: "basket", n: "Ярмарочная корзина", price: 0, ship: 140, h: 0.3, c: "#c8963f" },
  { id: "chest", n: "Сундук с деньгами", price: 0, h: 0.4, c: "#a0703f", g: "chest" },
  // раунд 10: ещё четыре острова. g — какой формы значок/модель (см. art.js ITEM_GEO)
  // Северный фьорд
  { id: "semga", n: "Сёмга", price: 4, h: 0.26, c: "#e09a86", g: "fish" },
  { id: "gravlax", n: "Гравлакс", price: 8, h: 0.14, c: "#ff9a6a", g: "slab" },
  { id: "balyk", n: "Балык", price: 20, h: 0.18, c: "#d9663a", g: "smoke" },
  { id: "pres", n: "Пресервы", price: 0, ship: 13, h: 0.18, c: "#3a8a7a", g: "jar" },
  { id: "nordset", n: "Северный набор", price: 0, ship: 32, h: 0.22, c: "#3a6ab8", g: "gift" },
  { id: "kulebyaka", n: "Кулебяка", price: 28, h: 0.17, c: "#d9a050", g: "pie" },
  { id: "balykbar", n: "Бочка балыка", price: 0, ship: 60, h: 0.28, c: "#8a5a32", g: "barrel" },
  // Ледник
  { id: "saika", n: "Сайка", price: 3, h: 0.2, c: "#a8bcd0", g: "fish" },
  { id: "strogan", n: "Строганина", price: 9, h: 0.14, c: "#eef4fa", g: "slab" },
  { id: "urchin", n: "Морской ёж", price: 15, h: 0.18, c: "#5a3a6a", g: "urchin" },
  { id: "icebox", n: "Ледяной короб", price: 0, ship: 24, h: 0.32, c: "#bfe4f4", g: "box" },
  { id: "nordplat", n: "Северное ассорти", price: 36, h: 0.1, c: "#b8d8ec", g: "plate" },
  { id: "urchroe", n: "Икра ежа", price: 32, h: 0.16, c: "#f2a03a", g: "jar" },
  { id: "saikapate", n: "Паштет из сайки", price: 0, ship: 52, h: 0.18, c: "#c8b89a", g: "tin" },
  // Вулканический остров
  { id: "redfish", n: "Морской окунь", price: 5, h: 0.24, c: "#e0503a", g: "fish" },
  { id: "bakedfish", n: "Окунь из каменной печи", price: 11, h: 0.16, c: "#c86a3a", g: "slab" },
  { id: "warmweed", n: "Тёплые водоросли", price: 19, h: 0.2, c: "#6aa04a", g: "weed" },
  { id: "volpie", n: "Вулканический пирог", price: 45, h: 0.18, c: "#b85a2a", g: "pie" },
  { id: "rliver", n: "Печень окуня", price: 28, h: 0.14, c: "#d9a86a", g: "tin" },
  { id: "fishmeal", n: "Рыбная мука", price: 0, ship: 28, h: 0.3, c: "#d8c8a0", g: "box" },
  { id: "steam", n: "Пар гейзера", price: 0, h: 0.26, c: "#e8f0f4", g: "steam" },
  { id: "hotsmoke", n: "Окунь горячего копчения", price: 17, h: 0.21, c: "#a0502a", g: "smoke" },
  { id: "saltred", n: "Солёный окунь", price: 0, ship: 32, h: 0.14, c: "#e8c8b0", g: "slab" },
  { id: "volbasket", n: "Вулканическая корзина", price: 0, ship: 145, h: 0.3, c: "#8a3a2a", g: "basket" },
  // Туманные шхеры — самая дорогая рыба
  { id: "halibut", n: "Палтус", price: 8, h: 0.24, c: "#8a8070", g: "flat" },
  { id: "halisteak", n: "Стейк палтуса", price: 15, h: 0.15, c: "#f4e8d8", g: "slab" },
  { id: "halismoke", n: "Палтус горячего копчения", price: 34, h: 0.2, c: "#b8803a", g: "smoke" },
  { id: "halican", n: "Консервы из палтуса", price: 0, ship: 20, h: 0.2, c: "#6a7a8a", g: "tin" },
  { id: "royalset", n: "Королевский набор", price: 0, ship: 52, h: 0.22, c: "#6a2a8a", g: "gift" },
  { id: "halipie", n: "Пирог с палтусом", price: 44, h: 0.17, c: "#e0b060", g: "pie" },
  { id: "skerkeg", n: "Бочонок шхер", price: 0, ship: 90, h: 0.28, c: "#4a4a5a", g: "barrel" },
];
export const IT = {}; ITEMS.forEach((it, i) => { it.i = i; IT[it.id] = i; });
export const NIT = ITEMS.length;

// базовые параметры игрока и помощников
export const PLAYER = { speed: 4.4, cap: 6, catchT: 0.5, xferT: 0.075 };
export const HELPER = { speed: 3.4, cap: 6, catchT: 0.75, xferT: 0.11 };
export const SCHOOL = { max: 40, regen: 0.28 };       // рыб в косяке, сек на одну новую
export const CUSTOMER = { patience: 46, speed: 2.9, buyT: 0.16 };
export const PAD_R = 1.05;           // радиус площадки-покупки

// улучшения снаряжения (у каждой команды свои уровни). v(lv) — значение на уровне lv (0 — без улучшения)
export const UPG = {
  bag: { n: "Рюкзак", d: "Больше места в стопке", ic: "bag", max: 12, ext: 2, base: 30, mult: 1.6, v: (lv) => PLAYER.cap + lv * 2 },
  boots: { n: "Унты", d: "Ходишь быстрее", ic: "boots", max: 8, ext: 1, base: 50, mult: 1.85, v: (lv) => PLAYER.speed * (1 + Math.min(lv, 8) * 0.075 + Math.max(0, lv - 8) * 0.04) },
  net: { n: "Сеть", d: "Ловишь быстрее", ic: "net", max: 8, ext: 1, base: 45, mult: 1.8, v: (lv) => PLAYER.catchT / (1 + Math.min(lv, 8) * 0.22 + Math.max(0, lv - 8) * 0.12) },
  reach: { n: "Длинные руки", d: "Выручку собираешь издалека", ic: "cash", max: 5, base: 60, mult: 1.9, v: (lv) => lv * 0.6 },
  crew: { n: "Артель: короба", d: "Помощники носят больше", ic: "crate", max: 10, ext: 2, base: 80, mult: 1.6, v: (lv) => HELPER.cap + lv * 2 },
  crewspd: { n: "Артель: лыжи", d: "Помощники быстрее", ic: "skis", max: 8, ext: 1, base: 120, mult: 1.65, v: (lv) => HELPER.speed * (1 + Math.min(lv, 8) * 0.12 + Math.max(0, lv - 8) * 0.06) },
};
// ext — сколько новых уровней открывает каждая следующая бухта (цена уровня везде одна: зависит только от уровня)
// улучшение цеха: быстрее и больше места. Цена — от цены самого цеха
export const SUPG = { max: 5, k: 0.45, mult: 1.9, speed: 0.45, cap: 10 };
export const upgCost = (u, lv, mul) => Math.round(UPG[u].base * Math.pow(UPG[u].mult, lv) * (mul || 1) / 5) * 5;

// уровни прилавка: +25% к цене и +полка
export const STALL_LV = { max: 3, mult: 1.25, cost: [0, 2.2, 5, 11] };    // множитель к стоимости самого прилавка

/* ---------- Старая карта «Вместе» / «Один» (версия 1): на ней доигрываются старые сохранения ----------
   Новые места только дописываются в конец списка — сохранение хранит состояние мест по номерам.
   k: spot (место лова), proc (цех: вход → выход), gen (сам производит), stall (прилавок), dock (причал с судном),
      board (доска заказов), helper (наём помощника), upg (улучшение), goal (маяк), pier (мостки)
   cost/after — площадка покупки появляется, когда открыто всё из after. pad — где лежит площадка (по умолчанию в центре). */
export const LEGACY = {
  w: [-14.5, 14.5], d: [-18, 21.5], start: [-9, -4.8], deco: [],
  // таблички зон улучшений (без столкновений)
  signs: [{ t: "СНАРЯЖЕНИЕ", x: -10.7, z: 2.02, w: 3.2, c: "#3aa0c8" }],
  shore: { base: -7.2, capes: [[9.2, 10.6, -13.2, 1]] },
  ents: [
    { id: "spot1", k: "spot", n: "Отмель", item: "herring", x: -9.4, z: -9.7, r: 2.8, sx: -9.4, sz: -12, free: 1 },
    { id: "stall_fish", k: "stall", n: "Прилавок: сельдь", item: "herring", x: -10.2, z: 6.8, free: 1, cost: 60 },
    { id: "fisher0", k: "helper", n: "Рыбак-лоточник", role: "fisher", from: "spot1", to: ["stall_fish"], x: -12.6, z: 7.9, cost: 30, after: ["spot1"] },
    { id: "stall_fillet", k: "stall", n: "Прилавок: филе", item: "fillet", x: -6.1, z: 6.8, cost: 25, after: ["spot1"] },
    { id: "table1", k: "proc", n: "Разделочный стол", model: "table", x: -12.0, z: -3.2, w: 2.4, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.5 }, cost: 35, after: ["stall_fillet"] },
    { id: "runner1", k: "helper", n: "Носильщик", role: "runner", from: "table1", to: ["stall_fillet"], x: -12.6, z: 10.0, cost: 60, after: ["table1"] },
    { id: "bag", k: "upg", u: "bag", x: -12.9, z: 0.65, after: ["table1"] },
    { id: "boots", k: "upg", u: "boots", x: -10.7, z: 0.65, after: ["table1"] },
    { id: "net", k: "upg", u: "net", x: -8.5, z: 0.65, after: ["table1"] },
    { id: "su_table1", k: "supg", of: "table1", x: -12.0, z: -5.75, after: ["table1"] },
    { id: "fisher1", k: "helper", n: "Рыбак", role: "fisher", from: "spot1", to: ["table1", "stall_fish"], x: -5.6, z: -5.75, cost: 100, after: ["runner1"] },
    { id: "crew", k: "upg", u: "crew", x: -12.9, z: 3.4, after: ["fisher0"] },
    { id: "crewspd", k: "upg", u: "crewspd", x: -10.7, z: 3.4, after: ["fisher0"] },
    { id: "stall_smoked", k: "stall", n: "Прилавок: копчёности", item: "smoked", x: -2, z: 6.8, cost: 200, after: ["fisher1"] },
    { id: "smoke", k: "proc", n: "Коптильня", model: "smokehouse", x: -3.4, z: -3.4, w: 2.8, d: 2.3, rec: { in: ["fillet", "log"], out: "smoked", t: 0.8 }, cost: 280, after: ["stall_smoked"] },
    { id: "wood", k: "gen", n: "Дровяник", model: "woodshed", x: -0.6, z: 1.4, w: 2.4, d: 2, item: "log", t: 1.0, cap: 20, cost: 340, after: ["smoke"] },
    { id: "su_smoke", k: "supg", of: "smoke", x: -3.2, z: 0.45, after: ["smoke"] },
    { id: "su_wood", k: "supg", of: "wood", x: -1.1, z: -5.75, after: ["wood"] },
    { id: "feed_smoke", k: "helper", n: "Подносчик филе", role: "runner", from: "table1", to: ["smoke"], x: -9.9, z: -5.75, cost: 380, after: ["smoke"] },
    { id: "woodman", k: "helper", n: "Дровосек", role: "runner", from: "wood", to: ["smoke"], x: -5.6, z: 1.4, cost: 400, after: ["wood"] },
    { id: "runner3", k: "helper", n: "Коптильщик", role: "runner", from: "smoke", to: ["stall_smoked"], x: 3.4, z: 1.4, cost: 480, after: ["woodman"] },
    { id: "board", k: "board", n: "Доска заказов", x: 12.4, z: 8.9, after: ["fisher1"], coopOnly: 1 },
    { id: "table2", k: "proc", n: "Второй стол", model: "table", x: -7.8, z: -3.2, w: 2.4, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.5 }, cost: 560, after: ["runner3"] },
    { id: "su_table2", k: "supg", of: "table2", x: -7.8, z: -5.75, after: ["table2"] },
    { id: "fisher2", k: "helper", n: "Рыбак", role: "fisher", from: "spot1", to: ["table2", "table1"], x: 5.2, z: -5.75, cost: 650, after: ["table2"] },
    { id: "runner2", k: "helper", n: "Носильщик", role: "runner", from: "table2", to: ["smoke", "stall_fillet"], x: 9.0, z: 3.9, cost: 750, after: ["fisher2"] },
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
    { id: "feed_can", k: "helper", n: "Подносчик филе", role: "runner", from: "table2", to: ["cannery"], x: 13.4, z: 3.9, cost: 7500, after: ["cannery"] },
    { id: "runner6", k: "helper", n: "Грузчик", role: "runner", from: "cannery", to: ["dock"], x: 10.1, z: -0.5, cost: 8000, after: ["cannery"] },
    { id: "icehouse", k: "proc", n: "Ледник", model: "icehouse", x: 3.8, z: 1.4, w: 2.8, d: 2, rec: { in: ["steak", "ice"], out: "crate", t: 1.0 }, cost: 9500, after: ["runner6", "runner3"] },
    { id: "feed_ice", k: "helper", n: "Подносчик стейков", role: "runner", from: "steak", to: ["icehouse"], x: 10.4, z: 7.0, cost: 10000, after: ["icehouse"] },
    { id: "icehole", k: "gen", n: "Прорубь", model: "icehole", x: 13.4, z: -10.0, w: 2.0, d: 1.6, item: "ice", t: 1.2, cap: 20, cost: 11000, after: ["icehouse"] },
    { id: "runner7", k: "helper", n: "Ледоруб", role: "runner", from: "icehole", to: ["icehouse"], x: 12.3, z: -0.5, cost: 12500, after: ["icehole"] },
    { id: "runner8", k: "helper", n: "Грузчик", role: "runner", from: "icehouse", to: ["dock"], x: 11.2, z: 3.9, cost: 14000, after: ["runner7"] },
    { id: "light", k: "goal", n: "Маяк", x: 11.4, z: -12.4, pad: [13.0, -4.6], cost: 30000, after: ["runner8"] },
    { id: "artel", k: "hire", n: "Артель", x: -12.4, z: 2.5, w: 2.2, d: 1.4, free: 1 },
    { id: "ads", k: "ads", n: "Реклама", x: -8.15, z: 9.3, free: 1 },
  ],
};

/* ---------- Карта «Друг против друга»: две базы зеркально, общая толпа в центре ----------
   Координаты — для левой базы (команда 0, x < 0). Правая — зеркально по x. */
export const VS = {
  w: [-15, 15], d: [-18, 21.5], start: [-7, -4.8], deco: [], cm: 1,
  shore: { base: -7.2, capes: [[3.4, 5.0, -13.4, 2]] }, event: "mix",
  signs: [],
  ents: [
    { id: "spot1", k: "spot", n: "Отмель", item: "herring", x: -7.0, z: -9.7, r: 2.5, sx: -7.0, sz: -12, free: 1 },
    { id: "stall_fish", k: "stall", n: "Прилавок: сельдь", item: "herring", x: -2.1, z: 6.8, free: 1, cost: 40 },
    { id: "fisher0", k: "helper", n: "Рыбак-лоточник", role: "fisher", from: "spot1", to: ["stall_fish"], x: -3.0, z: -5.6, cost: 40, after: ["spot1"] },
    { id: "stall_fillet", k: "stall", n: "Прилавок: филе", item: "fillet", x: -5.75, z: 6.8, cost: 40, after: ["spot1"] },
    { id: "table1", k: "proc", n: "Разделочный стол", model: "table", x: -8.0, z: -3.0, w: 2.4, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.5 }, cost: 50, after: ["stall_fillet"] },
    { id: "hut0", k: "hut", n: "Своя хижина", slot: 0, x: -7.3, z: 2.1, w: 2.0, d: 1.0, free: 1 },
    { id: "runner1", k: "helper", n: "Носильщик", role: "runner", from: "table1", to: ["stall_fillet"], x: -8.4, z: 1.0, cost: 90, after: ["table1"] },
    { id: "su_table1", k: "supg", of: "table1", x: -8.0, z: -5.6, after: ["table1"] },
    { id: "fisher1", k: "helper", n: "Рыбак", role: "fisher", from: "spot1", to: ["table1", "stall_fish"], x: -5.2, z: -5.6, cost: 140, after: ["runner1"] },
    { id: "stall_smoked", k: "stall", n: "Прилавок: копчёности", item: "smoked", x: -9.4, z: 6.8, cost: 220, after: ["fisher1"] },
    { id: "smoke", k: "proc", n: "Коптильня", model: "smokehouse", x: -3.2, z: -3.2, w: 2.8, d: 2.3, rec: { in: ["fillet", "log"], out: "smoked", t: 0.8 }, cost: 330, after: ["stall_smoked"] },
    { id: "wood", k: "gen", n: "Дровяник", model: "woodshed", x: -13.2, z: 1.4, w: 2.2, d: 2, item: "log", t: 1.0, cap: 20, cost: 420, after: ["smoke"] },
    { id: "su_smoke", k: "supg", of: "smoke", x: -3.2, z: -5.8, after: ["smoke"] },
    { id: "woodman", k: "helper", n: "Дровосек", role: "runner", from: "wood", to: ["smoke"], x: -10.6, z: 1.0, cost: 520, after: ["wood"] },
    { id: "feed_smoke", k: "helper", n: "Подносчик филе", role: "runner", from: "table1", to: ["smoke"], x: -2.9, z: 3.2, cost: 450, after: ["smoke"] },
    { id: "runner3", k: "helper", n: "Коптильщик", role: "runner", from: "smoke", to: ["stall_smoked"], x: -4.0, z: 1.0, cost: 640, after: ["woodman"] },
    { id: "stall_caviar", k: "stall", n: "Прилавок: икра", item: "caviar", x: -13.05, z: 6.8, cost: 900, after: ["runner3"] },
    { id: "caviar", k: "proc", n: "Икорня", model: "caviar", x: -12.5, z: -3.1, w: 2.4, d: 1.9, rec: { in: ["salmon"], out: "caviar", t: 1.1 }, cost: 1150, after: ["stall_caviar"] },
    { id: "pier", k: "pier", n: "Мостки", x: -10.1, z: -10.6, x0: -10.1, z0: -7.4, z1: -14.6, pad: [-10.1, -5.6], cost: 1400, after: ["caviar"] },
    { id: "spot2", k: "spot", n: "Глубина: лосось", item: "salmon", x: -10.1, z: -14, r: 1.5, sx: -10.1, sz: -16.4, after: ["pier"], auto: 1 },
    { id: "fisher3", k: "helper", n: "Рыбак с мостков", role: "fisher", from: "spot2", to: ["caviar"], x: -12.2, z: -5.6, cost: 1800, after: ["pier"] },
    { id: "runner5", k: "helper", n: "Носильщик", role: "runner", from: "caviar", to: ["stall_caviar"], x: -10.1, z: -5.6, cost: 2200, after: ["fisher3"] },
    { id: "cashier", k: "helper", n: "Кассир", role: "cashier", cost: 2600, after: ["runner5"] },
    { id: "light", k: "goal", n: "Маяк", x: -2.0, z: -12.0, pad: [-1.3, -8.0], cost: 5500, after: ["runner5"] },
    { id: "artel", k: "hire", n: "Артель", x: -2.2, z: 0.4, w: 1.9, d: 1.2, free: 1 },
    { id: "ads", k: "ads", n: "Реклама", x: -7.6, z: 9.3, free: 1 },
  ],
};

/* ---------- Четыре бухты «Вместе» / «Один» — у каждой своя форма берега, свой вид и своя цепочка товаров ----------
   Помощников нанимают в «Артели» (дом найма у старта), у них на карте площадок нет: x/z у помощника не нужны.
   shore: base — где кончается суша; capes — [x0, x1, z, вид]: 1 — справа от x0..x1 берег уходит к z, -1 — слева, 2 — посередине (|x| < x0). */
const GEAR = (z, xs, after) => [
  { id: "bag", k: "upg", u: "bag", x: xs[0], z, after },
  { id: "boots", k: "upg", u: "boots", x: xs[1], z, after },
  { id: "net", k: "upg", u: "net", x: xs[2], z, after },
];
// Бухта 1 — Тихая бухта: сельдь, филе, засолка, коптильня с дровами
const BAY1 = {
  w: [-14.5, 14.5], d: [-18, 21.5], start: [-6.4, -4.4], pl: 1,
  shore: { base: -7.2, capes: [[9.2, 10.6, -13.2, 1]] }, event: "storm",
  // большой заказ (середина бухты) и финальная поставка перед маяком: три ступени, сдаются у доски заказов
  big: [{ n: "Большой заказ судна", after: "runner3", st: [["smoked", 10], ["salted", 14], ["fillet", 24]], rw: 900 },
    { n: "Финальная поставка", after: "runner_soup", st: [["soup", 8], ["smoked", 11], ["salted", 14]], rw: 1600 }],
  signs: [],
  ents: [
    { id: "spot1", k: "spot", n: "Отмель: сельдь", item: "herring", x: -6.6, z: -9.7, r: 2.8, sx: -6.6, sz: -12, free: 1 },
    { id: "artel", k: "hire", n: "Артель", x: -12.3, z: 1.2, w: 2.2, d: 1.4, free: 1 },
    { id: "stall_fish", k: "stall", n: "Прилавок: сельдь", item: "herring", x: -9.6, z: 6.8, free: 1 },
    { id: "fisher0", k: "helper", n: "Рыбак-лоточник", role: "fisher", from: "spot1", to: ["stall_fish"], cost: 30, after: ["spot1"] },
    { id: "stall_fillet", k: "stall", n: "Прилавок: филе", item: "fillet", x: -5.6, z: 6.8, cost: 25, after: ["spot1"] },
    { id: "table1", k: "proc", n: "Разделочный стол", model: "table", x: -9.6, z: -3.0, w: 2.8, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.5 }, cost: 35, after: ["stall_fillet"] },
    { id: "runner1", k: "helper", n: "Носильщик филе", role: "runner", from: "table1", to: ["stall_fillet"], cost: 60, after: ["table1"] },
    { id: "hut0", k: "hut", n: "Своя хижина", slot: 0, x: -7.4, z: 1.2, w: 2.0, d: 1.3, free: 1 },
    { id: "hut1", k: "hut", n: "Своя хижина", slot: 1, x: -4.4, z: 1.2, w: 2.0, d: 1.3, free: 1 },
    { id: "su_table1", k: "supg", of: "table1", x: -9.6, z: -5.4, after: ["table1"] },
    { id: "fisher1", k: "helper", n: "Рыбак у стола", role: "fisher", from: "spot1", to: ["table1", "stall_fish"], cost: 100, after: ["runner1"] },
    { id: "stall_salt", k: "stall", n: "Прилавок: солёная сельдь", item: "salted", x: -1.6, z: 6.8, cost: 130, after: ["fisher1"] },
    { id: "salt", k: "proc", n: "Засолка", model: "saltery", x: -4.2, z: -3.0, w: 2.8, d: 1.4, rec: { in: ["herring"], out: "salted", t: 0.7 }, cost: 180, after: ["stall_salt"] },
    { id: "su_salt", k: "supg", of: "salt", x: -4.2, z: -5.4, after: ["salt"] },
    { id: "feed_salt", k: "helper", n: "Рыбак засолки", role: "fisher", from: "spot1", to: ["salt"], cost: 230, after: ["salt"] },
    { id: "runner_salt", k: "helper", n: "Носильщик бочек", role: "runner", from: "salt", to: ["stall_salt"], cost: 270, after: ["salt"] },
    { id: "board", k: "board", n: "Доска заказов", x: 11.8, z: 7.6, after: ["fisher1"], coopOnly: 1 },
    { id: "stall_smoked", k: "stall", n: "Прилавок: копчёности", item: "smoked", x: 2.4, z: 6.8, cost: 380, after: ["runner_salt"] },
    { id: "smoke", k: "proc", n: "Коптильня", model: "smokehouse", x: 1.6, z: -3.2, w: 2.8, d: 2.2, rec: { in: ["fillet", "log"], out: "smoked", t: 0.8 }, cost: 480, after: ["stall_smoked"] },
    { id: "wood", k: "gen", n: "Дровяник", model: "woodshed", x: 6.6, z: -3.0, w: 2.4, d: 2, item: "log", t: 1.0, cap: 20, cost: 560, after: ["smoke"] },
    { id: "su_smoke", k: "supg", of: "smoke", x: 1.6, z: -5.6, after: ["smoke"] },
    { id: "su_wood", k: "supg", of: "wood", x: 6.6, z: -5.4, after: ["wood"] },
    { id: "woodman", k: "helper", n: "Дровосек", role: "runner", from: "wood", to: ["smoke"], cost: 600, after: ["wood"] },
    { id: "feed_smoke", k: "helper", n: "Подносчик филе", role: "runner", from: "table1", to: ["smoke"], cost: 650, after: ["wood"] },
    { id: "runner3", k: "helper", n: "Коптильщик", role: "runner", from: "smoke", to: ["stall_smoked"], cost: 720, after: ["woodman"] },
    { id: "cashier", k: "helper", n: "Кассир", role: "cashier", cost: 900, after: ["runner3"] },
    { id: "table2", k: "proc", n: "Второй стол", model: "table", x: 11.6, z: -3.0, w: 2.8, d: 1.3, rec: { in: ["herring"], out: "fillet", t: 0.5 }, cost: 950, after: ["runner3"] },
    { id: "su_table2", k: "supg", of: "table2", x: 11.6, z: -5.4, after: ["table2"] },
    { id: "fisher2", k: "helper", n: "Рыбак второго стола", role: "fisher", from: "spot1", to: ["table2"], cost: 1050, after: ["table2"] },
    { id: "runner2", k: "helper", n: "Носильщик второго стола", role: "runner", from: "table2", to: ["smoke", "stall_fillet"], cost: 1200, after: ["fisher2"] },
    // уха: сельдь + дрова в котле на костре
    { id: "stall_soup", k: "stall", n: "Ларёк ухи", item: "soup", x: 6.4, z: 6.8, cost: 1300, after: ["runner2"] },
    { id: "kettle", k: "proc", n: "Котёл ухи", model: "kettle", x: 5.0, z: 1.6, w: 2.6, d: 1.4, rec: { in: ["herring", "log"], out: "soup", t: 0.9 }, cost: 1500, after: ["stall_soup"] },
    { id: "su_kettle", k: "supg", of: "kettle", x: 9.4, z: 2.0, after: ["kettle"] },
    { id: "fisher_soup", k: "helper", n: "Рыбак для ухи", role: "fisher", from: "spot1", to: ["kettle"], cost: 1650, after: ["kettle"] },
    { id: "woodman2", k: "helper", n: "Истопник", role: "runner", from: "wood", to: ["kettle"], cost: 1750, after: ["kettle"] },
    { id: "runner_soup", k: "helper", n: "Разносчик ухи", role: "runner", from: "kettle", to: ["stall_soup"], cost: 1900, after: ["fisher_soup"] },
    { id: "light", k: "goal", n: "Маяк", x: 11.8, z: -11.0, pad: [12.4, -7.8], cost: 3200, after: ["runner_soup", "cashier"] },
    { id: "ads", k: "ads", n: "Реклама", x: -7.6, z: 9.3, free: 1 },
    { id: "maptable", k: "map", n: "Карта архипелага", x: -12.95, z: 4.6, w: 1.5, d: 1.0, free: 1 },
    { id: "jetty", k: "jetty", n: "Причал перевозки", x: 3.75, z: -6.3, w: 1.6, d: 1.0, free: 1 },
  ],
};
// Бухта 2 — Ледяной фьорд: лосось с отмели и с мостков, стейки, икра, консервы на судно
const BAY2 = {
  w: [-14.5, 28.5], d: [-18, 21.5], start: [-4.4, -4.2], pl: 1.25,
  shore: { base: -6.6, capes: [[-10.6, -9.2, -13.2, -1], [9.2, 10.6, -13.2, 1]] }, event: "run",
  big: [{ n: "Большой заказ судна", after: "fisher3", st: [["steak", 16], ["caviar", 10], ["salmon", 30]], rw: 1125 },
    { n: "Поставка наборов", after: "loader2", st: [["caviar", 11], ["steak", 14], ["salmon", 24]], rw: 2000 },
    { n: "Флотский контракт", after: "saltman", st: [["keg", 14], ["gift", 12], ["can", 30], ["keg", 20]], rw: 6000 }],
  signs: [],
  ents: [
    { id: "spot1", k: "spot", n: "Отмель: лосось", item: "salmon", x: -5.4, z: -9.2, r: 2.6, sx: -5.4, sz: -11.6, free: 1 },
    { id: "artel", k: "hire", n: "Артель", x: -12.3, z: 1.4, w: 2.2, d: 1.4, free: 1 },
    { id: "stall_salmon", k: "stall", n: "Прилавок: лосось", item: "salmon", x: -9.6, z: 6.8, free: 1 },
    { id: "fisher0", k: "helper", n: "Рыбак-лоточник", role: "fisher", from: "spot1", to: ["stall_salmon"], cost: 80, after: ["spot1"] },
    { id: "stall_steak", k: "stall", n: "Прилавок: стейки", item: "steak", x: -5.6, z: 6.8, cost: 70, after: ["spot1"] },
    { id: "steak", k: "proc", n: "Разделка лосося", model: "table2", x: -9.0, z: -2.8, w: 2.8, d: 1.4, rec: { in: ["salmon"], out: "steak", t: 0.6 }, cost: 100, after: ["stall_steak"] },
    { id: "runner1", k: "helper", n: "Носильщик стейков", role: "runner", from: "steak", to: ["stall_steak"], cost: 170, after: ["steak"] },
    { id: "hut0", k: "hut", n: "Своя хижина", slot: 0, x: -8.0, z: 1.6, w: 2.0, d: 1.3, free: 1 },
    { id: "hut1", k: "hut", n: "Своя хижина", slot: 1, x: -5.0, z: 1.6, w: 2.0, d: 1.3, free: 1 },
    { id: "su_steak", k: "supg", of: "steak", x: -9.0, z: -5.0, after: ["steak"] },
    { id: "fisher1", k: "helper", n: "Рыбак у разделки", role: "fisher", from: "spot1", to: ["steak", "stall_salmon"], cost: 280, after: ["runner1"] },
    { id: "stall_caviar", k: "stall", n: "Прилавок: икра", item: "caviar", x: -1.6, z: 6.8, cost: 380, after: ["fisher1"] },
    { id: "caviar", k: "proc", n: "Икорня", model: "caviar", x: -2.0, z: -3.0, w: 2.8, d: 2.0, rec: { in: ["salmon"], out: "caviar", t: 1.0 }, cost: 520, after: ["stall_caviar"] },
    { id: "su_caviar", k: "supg", of: "caviar", x: -2.0, z: -5.6, after: ["caviar"] },
    { id: "fisher2", k: "helper", n: "Рыбак икорни", role: "fisher", from: "spot1", to: ["caviar"], cost: 640, after: ["caviar"] },
    { id: "runner2", k: "helper", n: "Носильщик икры", role: "runner", from: "caviar", to: ["stall_caviar"], cost: 720, after: ["caviar"] },
    { id: "board", k: "board", n: "Доска заказов", x: 6.4, z: 7.4, after: ["fisher1"], coopOnly: 1 },
    { id: "pier", k: "pier", n: "Мостки", x: 1.2, z: -10.6, x0: 1.2, z0: -6.8, z1: -14.4, pad: [1.2, -5.0], cost: 1100, after: ["runner2"] },
    { id: "spot2", k: "spot", n: "Глубина: крупный лосось", item: "salmon", x: 1.2, z: -13.8, r: 1.5, sx: 1.2, sz: -16.2, after: ["pier"], auto: 1 },
    { id: "fisher3", k: "helper", n: "Рыбак с мостков", role: "fisher", from: "spot2", to: ["caviar", "steak"], cost: 1300, after: ["pier"] },
    { id: "dock", k: "dock", n: "Причал", x: 7.6, z: -8.3, accept: ["can", "gift", "keg"], cap: 30, pad: [7.8, -5.2], cost: 1700, after: ["fisher3"] },
    { id: "cannery", k: "proc", n: "Консервный цех", model: "cannery", x: 4.6, z: -2.8, w: 2.8, d: 2.0, rec: { in: ["steak"], out: "can", t: 0.5 }, cost: 2000, after: ["dock"] },
    { id: "su_cannery", k: "supg", of: "cannery", x: 4.6, z: -5.2, after: ["cannery"] },
    { id: "feed_can", k: "helper", n: "Подносчик стейков", role: "runner", from: "steak", to: ["cannery"], cost: 2200, after: ["cannery"] },
    { id: "loader", k: "helper", n: "Грузчик", role: "runner", from: "cannery", to: ["dock"], cost: 2400, after: ["cannery"] },
    { id: "cashier", k: "helper", n: "Кассир", role: "cashier", cost: 2600, after: ["loader"] },
    // подарочные наборы: икра + консервная банка, на судно
    { id: "pack", k: "proc", n: "Упаковочная", model: "packhouse", x: 11.6, z: -2.6, w: 2.6, d: 1.6, rec: { in: ["caviar", "can"], out: "gift", t: 1.0 }, cost: 3000, after: ["cashier"] },
    { id: "su_pack", k: "supg", of: "pack", x: 11.6, z: -5.0, after: ["pack"] },
    { id: "packer", k: "helper", n: "Подносчик икры", role: "runner", from: "caviar", to: ["pack"], cost: 3200, after: ["pack"] },
    { id: "packer2", k: "helper", n: "Подносчик банок", role: "runner", from: "cannery", to: ["pack"], cost: 3400, after: ["pack"] },
    { id: "loader2", k: "helper", n: "Грузчик наборов", role: "runner", from: "pack", to: ["dock"], cost: 3700, after: ["packer"] },
    // восточный двор: копчёный лосось (стейк + дрова) и бочонки икры (икра + соль) на судно
    { id: "stall_lox", k: "stall", n: "Прилавок: копчёный лосось", item: "lox", x: 2.4, z: 6.8, cost: 3900, after: ["loader2"] },
    { id: "wood", k: "gen", n: "Дровяник", model: "woodshed", x: 17.4, z: -3.0, w: 2.4, d: 2, item: "log", t: 1.0, cap: 20, cost: 4000, after: ["smokery"] },
    { id: "smokery", k: "proc", n: "Коптильня лосося", model: "smokehouse", x: 22.2, z: -3.2, w: 2.8, d: 2.2, rec: { in: ["steak", "log"], out: "lox", t: 0.9 }, cost: 4200, after: ["stall_lox"] },
    { id: "su_wood", k: "supg", of: "wood", x: 17.4, z: -5.4, after: ["wood"] },
    { id: "su_smokery", k: "supg", of: "smokery", x: 22.2, z: -5.6, after: ["smokery"] },
    { id: "woodman", k: "helper", n: "Дровосек", role: "runner", from: "wood", to: ["smokery"], cost: 4000, after: ["wood"] },
    { id: "feed_smk", k: "helper", n: "Подносчик стейков в коптильню", role: "runner", from: "steak", to: ["smokery"], cost: 4300, after: ["wood"] },
    { id: "runner_lox", k: "helper", n: "Разносчик копчёного лосося", role: "runner", from: "smokery", to: ["stall_lox"], cost: 4600, after: ["woodman"] },
    { id: "saltpan", k: "gen", n: "Солеварня", model: "boiler", x: 26.6, z: -3.0, w: 2.6, d: 1.8, item: "salt", t: 1.0, cap: 20, cost: 4800, after: ["cooper"] },
    { id: "su_saltpan", k: "supg", of: "saltpan", x: 26.6, z: -5.4, after: ["saltpan"] },
    { id: "cooper", k: "proc", n: "Бондарня", model: "saltery", x: 23.0, z: 1.6, w: 2.8, d: 1.4, rec: { in: ["caviar", "salt"], out: "keg", t: 1.0 }, cost: 5200, after: ["runner_lox"] },
    { id: "su_cooper", k: "supg", of: "cooper", x: 26.8, z: 1.6, after: ["cooper"] },
    { id: "saltman", k: "helper", n: "Солевар", role: "runner", from: "saltpan", to: ["cooper"], cost: 5300, after: ["saltpan"] },
    { id: "feed_keg", k: "helper", n: "Подносчик икры в бондарню", role: "runner", from: "caviar", to: ["cooper"], cost: 5600, after: ["cooper"] },
    { id: "loader3", k: "helper", n: "Грузчик бочонков", role: "runner", from: "cooper", to: ["dock"], cost: 6000, after: ["cooper"] },
    { id: "light", k: "goal", n: "Маяк", x: -12.0, z: -10.8, pad: [-12.6, -7.6], cost: 11000, after: ["saltman", "feed_keg", "loader3"] },
    { id: "ads", k: "ads", n: "Реклама", x: -7.6, z: 9.3, free: 1 },
    { id: "maptable", k: "map", n: "Карта архипелага", x: -12.95, z: 4.6, w: 1.5, d: 1.0, free: 1 },
    { id: "jetty", k: "jetty", n: "Причал перевозки", x: 10.5, z: -12.2, w: 1.6, d: 1.0, free: 1 },
  ],
};
// Бухта 3 — Крабовый мыс: краб у камней, варочная, мидийная ферма, лёд и ящики на судно
const BAY3 = {
  w: [-14.5, 28.5], d: [-18, 21.5], start: [-5.0, -4.6], pl: 1.55,
  shore: { base: -7.4, capes: [[-10.6, -9.2, -13.2, -1], [3.4, 5.0, -5.0, 1]] }, event: "tide",
  traps: [[-11.2, -7.3], [-4.0, -7.0], [1.8, -6.9]],     // на отливе здесь находят ловушки с крабами
  big: [{ n: "Большой заказ судна", after: "musselman", st: [["crabc", 16], ["mussel", 16], ["crab", 30]], rw: 1400 },
    { n: "Поставка ассорти", after: "runner_plat", st: [["platter", 8], ["crabc", 14], ["mussel", 14]], rw: 2500 },
    { n: "Флотский контракт", after: "loader_p", st: [["pate", 16], ["crate", 16], ["pate", 24], ["crate", 24]], rw: 8000 }],
  signs: [],
  ents: [
    { id: "spot1", k: "spot", n: "Камни: краб", item: "crab", x: -5.8, z: -9.8, r: 2.6, sx: -5.8, sz: -12.2, free: 1 },
    { id: "artel", k: "hire", n: "Артель", x: -12.3, z: 1.4, w: 2.2, d: 1.4, free: 1 },
    { id: "stall_crab", k: "stall", n: "Прилавок: краб", item: "crab", x: -9.6, z: 6.8, free: 1 },
    { id: "fisher0", k: "helper", n: "Ловец-лоточник", role: "fisher", from: "spot1", to: ["stall_crab"], cost: 200, after: ["spot1"] },
    { id: "stall_crabc", k: "stall", n: "Прилавок: варёный краб", item: "crabc", x: -5.6, z: 6.8, cost: 180, after: ["spot1"] },
    { id: "boil", k: "proc", n: "Варочная", model: "boiler", x: -9.4, z: -3.0, w: 2.8, d: 1.8, rec: { in: ["crab"], out: "crabc", t: 0.7 }, cost: 260, after: ["stall_crabc"] },
    { id: "runner1", k: "helper", n: "Носильщик варёного краба", role: "runner", from: "boil", to: ["stall_crabc"], cost: 420, after: ["boil"] },
    { id: "hut0", k: "hut", n: "Своя хижина", slot: 0, x: -8.0, z: 1.6, w: 2.0, d: 1.3, free: 1 },
    { id: "hut1", k: "hut", n: "Своя хижина", slot: 1, x: -5.0, z: 1.6, w: 2.0, d: 1.3, free: 1 },
    { id: "su_boil", k: "supg", of: "boil", x: -9.4, z: -5.4, after: ["boil"] },
    { id: "fisher1", k: "helper", n: "Ловец у варочной", role: "fisher", from: "spot1", to: ["boil", "stall_crab"], cost: 700, after: ["runner1"] },
    { id: "stall_mussel", k: "stall", n: "Прилавок: мидии", item: "mussel", x: -1.6, z: 6.8, cost: 900, after: ["fisher1"] },
    { id: "farm", k: "gen", n: "Мидийная ферма", model: "musselfarm", x: 6.4, z: -1.6, w: 2.4, d: 1.6, item: "mussel", t: 1.1, cap: 20, cost: 1300, after: ["stall_mussel"] },
    { id: "su_farm", k: "supg", of: "farm", x: 6.4, z: -3.8, after: ["farm"] },
    { id: "musselman", k: "helper", n: "Сборщик мидий", role: "runner", from: "farm", to: ["stall_mussel"], cost: 1500, after: ["farm"] },
    { id: "board", k: "board", n: "Доска заказов", x: 6.4, z: 7.4, after: ["fisher1"], coopOnly: 1 },
    { id: "dock", k: "dock", n: "Причал", x: 10.8, z: -6.4, accept: ["crate", "pate"], cap: 30, pad: [11.6, -3.4], cost: 2600, after: ["musselman"] },
    { id: "icehouse", k: "proc", n: "Ледник", model: "icehouse", x: -2.0, z: -3.0, w: 2.8, d: 2.0, rec: { in: ["crab", "ice"], out: "crate", t: 1.0 }, cost: 3000, after: ["dock"] },
    { id: "icehole", k: "gen", n: "Прорубь", model: "icehole", x: 1.6, z: -4.0, w: 2.0, d: 1.6, item: "ice", t: 1.2, cap: 20, cost: 3300, after: ["icehouse"] },
    { id: "su_icehouse", k: "supg", of: "icehouse", x: -2.0, z: -5.6, after: ["icehouse"] },
    { id: "fisher2", k: "helper", n: "Ловец для ледника", role: "fisher", from: "spot1", to: ["icehouse"], cost: 3600, after: ["icehole"] },
    { id: "iceman", k: "helper", n: "Ледоруб", role: "runner", from: "icehole", to: ["icehouse"], cost: 3900, after: ["icehole"] },
    { id: "loader", k: "helper", n: "Грузчик", role: "runner", from: "icehouse", to: ["dock"], cost: 4300, after: ["iceman"] },
    { id: "cashier", k: "helper", n: "Кассир", role: "cashier", cost: 4800, after: ["loader"] },
    // закусочная: варёный краб + мидии = морское ассорти
    { id: "stall_platter", k: "stall", n: "Прилавок: ассорти", item: "platter", x: 2.4, z: 6.8, cost: 5200, after: ["cashier"] },
    { id: "bar", k: "proc", n: "Закусочная", model: "snackbar", x: 2.6, z: 1.6, w: 2.6, d: 1.4, rec: { in: ["crabc", "mussel"], out: "platter", t: 1.0 }, cost: 6000, after: ["stall_platter"] },
    { id: "su_bar", k: "supg", of: "bar", x: 6.4, z: 3.4, after: ["bar"] },
    { id: "runner_bar", k: "helper", n: "Подносчик краба", role: "runner", from: "boil", to: ["bar"], cost: 6400, after: ["bar"] },
    { id: "mussel2", k: "helper", n: "Подносчик мидий", role: "runner", from: "farm", to: ["bar"], cost: 6800, after: ["bar"] },
    { id: "runner_plat", k: "helper", n: "Разносчик ассорти", role: "runner", from: "bar", to: ["stall_platter"], cost: 7300, after: ["runner_bar"] },
    // восточный двор: соль, вяленые мидии на прилавок и крабовый паштет на судно
    { id: "stall_dm", k: "stall", n: "Прилавок: вяленые мидии", item: "dmussel", x: 10.4, z: 6.8, cost: 7600, after: ["runner_plat"] },
    { id: "saltpan", k: "gen", n: "Солеварня", model: "boiler", x: 17.4, z: -3.0, w: 2.6, d: 1.8, item: "salt", t: 1.0, cap: 20, cost: 7800, after: ["drysh"] },
    { id: "farm2", k: "gen", n: "Вторая мидийная ферма", model: "musselfarm", x: 26.6, z: -2.8, w: 2.4, d: 1.6, item: "mussel", t: 1.0, cap: 20, cost: 8000, after: ["drysh"] },
    { id: "drysh", k: "proc", n: "Вялильня мидий", model: "dryer", x: 22.2, z: -3.0, w: 2.8, d: 1.6, rec: { in: ["mussel", "salt"], out: "dmussel", t: 0.9 }, cost: 8200, after: ["stall_dm"] },
    { id: "su_saltpan", k: "supg", of: "saltpan", x: 17.4, z: -5.4, after: ["saltpan"] },
    { id: "su_farm2", k: "supg", of: "farm2", x: 26.6, z: -5.0, after: ["farm2"] },
    { id: "su_drysh", k: "supg", of: "drysh", x: 22.2, z: -5.4, after: ["drysh"] },
    { id: "saltman", k: "helper", n: "Солевар", role: "runner", from: "saltpan", to: ["drysh"], cost: 7900, after: ["saltpan"] },
    { id: "feed_dry", k: "helper", n: "Сборщик второй фермы", role: "runner", from: "farm2", to: ["drysh"], cost: 8300, after: ["farm2"] },
    { id: "runner_dm", k: "helper", n: "Разносчик вяленых мидий", role: "runner", from: "drysh", to: ["stall_dm"], cost: 8700, after: ["saltman"] },
    { id: "boil2", k: "proc", n: "Вторая варочная", model: "boiler", x: 17.6, z: 1.6, w: 2.8, d: 1.8, rec: { in: ["crab"], out: "crabc", t: 0.7 }, cost: 8600, after: ["patehouse"] },
    { id: "su_boil2", k: "supg", of: "boil2", x: 14.2, z: 1.6, after: ["boil2"] },
    { id: "fisher_b2", k: "helper", n: "Ловец второй варочной", role: "fisher", from: "spot1", to: ["boil2"], cost: 9100, after: ["boil2"] },
    { id: "patehouse", k: "proc", n: "Паштетная", model: "packhouse", x: 23.0, z: 1.6, w: 2.6, d: 1.6, rec: { in: ["crabc", "mussel"], out: "pate", t: 1.0 }, cost: 9200, after: ["runner_dm"] },
    { id: "su_pate", k: "supg", of: "patehouse", x: 26.8, z: 1.6, after: ["patehouse"] },
    { id: "feed_p1", k: "helper", n: "Подносчик краба в паштетную", role: "runner", from: "boil2", to: ["patehouse"], cost: 9500, after: ["boil2"] },
    { id: "feed_p2", k: "helper", n: "Подносчик мидий в паштетную", role: "runner", from: "farm2", to: ["patehouse"], cost: 9900, after: ["patehouse"] },
    { id: "loader_p", k: "helper", n: "Грузчик паштета", role: "runner", from: "patehouse", to: ["dock"], cost: 10400, after: ["feed_p1"] },
    { id: "light", k: "goal", n: "Маяк", x: -12.0, z: -10.8, pad: [-12.6, -7.6], cost: 19000, after: ["loader_p", "feed_p2"] },
    { id: "ads", k: "ads", n: "Реклама", x: -7.6, z: 9.3, free: 1 },
    { id: "maptable", k: "map", n: "Карта архипелага", x: -12.95, z: 4.6, w: 1.5, d: 1.0, free: 1 },
    { id: "jetty", k: "jetty", n: "Причал перевозки", x: 4.0, z: -5.74, w: 1.6, d: 1.0, free: 1 },
  ],
};
// Бухта 4 — Ярмарочная гавань: треска, сушильня, морская капуста, пекарня рыбников, жиротопня и судно в гавани
const BAY4 = {
  w: [-14.5, 28.5], d: [-18, 21.5], start: [-6.4, -5.6], pl: 1.95,
  shore: { base: -8.4, capes: [[3.4, 5.0, -4.8, 2], [9.2, 10.6, -13.2, 1]] }, event: "fair",
  big: [{ n: "Большой заказ судна", after: "planter", st: [["stockfish", 16], ["seaweed", 16], ["cod", 30]], rw: 1750 },
    { n: "Ярмарочная поставка", after: "runner_liver", st: [["pie", 8], ["liver", 8], ["stockfish", 14]], rw: 3100 },
    { n: "Флотский контракт", after: "loader_b", st: [["klip", 20], ["basket", 12], ["oil", 24], ["basket", 18]], rw: 12000 }],
  signs: [],
  ents: [
    { id: "spot1", k: "spot", n: "Банка: треска", item: "cod", x: -8.0, z: -11.0, r: 2.6, sx: -8.0, sz: -13.4, free: 1 },
    { id: "artel", k: "hire", n: "Артель", x: -12.4, z: 1.4, w: 2.2, d: 1.4, free: 1 },
    { id: "stall_cod", k: "stall", n: "Прилавок: треска", item: "cod", x: -10.0, z: 6.8, free: 1 },
    { id: "fisher0", k: "helper", n: "Рыбак-лоточник", role: "fisher", from: "spot1", to: ["stall_cod"], cost: 500, after: ["spot1"] },
    { id: "stall_stock", k: "stall", n: "Прилавок: вяленая треска", item: "stockfish", x: -6.0, z: 6.8, cost: 450, after: ["spot1"] },
    { id: "dryer", k: "proc", n: "Сушильня", model: "dryer", x: -10.4, z: -4.2, w: 2.8, d: 1.6, rec: { in: ["cod"], out: "stockfish", t: 0.7 }, cost: 650, after: ["stall_stock"] },
    { id: "runner1", k: "helper", n: "Носильщик вяленой трески", role: "runner", from: "dryer", to: ["stall_stock"], cost: 1000, after: ["dryer"] },
    { id: "hut0", k: "hut", n: "Своя хижина", slot: 0, x: -8.6, z: 1.8, w: 2.0, d: 1.3, free: 1 },
    { id: "hut1", k: "hut", n: "Своя хижина", slot: 1, x: -5.6, z: 1.8, w: 2.0, d: 1.3, free: 1 },
    { id: "su_dryer", k: "supg", of: "dryer", x: -10.4, z: -6.6, after: ["dryer"] },
    { id: "fisher1", k: "helper", n: "Рыбак у сушильни", role: "fisher", from: "spot1", to: ["dryer", "stall_cod"], cost: 1700, after: ["runner1"] },
    { id: "stall_sea", k: "stall", n: "Прилавок: морская капуста", item: "seaweed", x: -2.0, z: 6.8, cost: 2200, after: ["fisher1"] },
    { id: "plant", k: "gen", n: "Плантация капусты", model: "seafarm", x: 11.4, z: -5.0, w: 2.4, d: 1.6, item: "seaweed", t: 1.0, cap: 20, cost: 3000, after: ["stall_sea"] },
    { id: "planter", k: "helper", n: "Сборщик капусты", role: "runner", from: "plant", to: ["stall_sea", "bakery"], cost: 3600, after: ["plant"] },
    { id: "su_plant", k: "supg", of: "plant", x: 8.2, z: -6.4, after: ["plant"] },
    { id: "board", k: "board", n: "Доска заказов", x: 11.8, z: 7.6, after: ["fisher1"], coopOnly: 1 },
    { id: "stall_pie", k: "stall", n: "Прилавок: рыбники", item: "pie", x: 2.0, z: 6.8, cost: 5000, after: ["planter"] },
    { id: "bakery", k: "proc", n: "Пекарня", model: "bakery", x: -1.0, z: -1.4, w: 2.8, d: 2.0, rec: { in: ["stockfish", "seaweed"], out: "pie", t: 1.1 }, cost: 6200, after: ["stall_pie"] },
    { id: "su_bakery", k: "supg", of: "bakery", x: -1.8, z: -3.8, after: ["bakery"] },
    { id: "feed_bake", k: "helper", n: "Подносчик трески", role: "runner", from: "dryer", to: ["bakery"], cost: 7000, after: ["bakery"] },
    { id: "runner_pie", k: "helper", n: "Пекарь-разносчик", role: "runner", from: "bakery", to: ["stall_pie"], cost: 7800, after: ["bakery"] },
    { id: "dock", k: "dock", n: "Причал", x: 0.0, z: -5.9, accept: ["oil", "klip", "basket"], cap: 30, pad: [1.8, -3.8], cost: 9500, after: ["runner_pie"] },
    { id: "render", k: "proc", n: "Жиротопня", model: "render", x: 5.8, z: -3.6, w: 2.8, d: 2.0, rec: { in: ["cod"], out: "oil", t: 0.8 }, cost: 11000, after: ["dock"] },
    { id: "su_render", k: "supg", of: "render", x: 5.8, z: -6.2, after: ["render"] },
    { id: "fisher2", k: "helper", n: "Рыбак жиротопни", role: "fisher", from: "spot1", to: ["render"], cost: 12000, after: ["render"] },
    { id: "loader", k: "helper", n: "Грузчик", role: "runner", from: "render", to: ["dock"], cost: 13000, after: ["render"] },
    { id: "cashier", k: "helper", n: "Кассир", role: "cashier", cost: 14000, after: ["loader"] },
    // цех печени трески и свой прилавок
    { id: "stall_liver", k: "stall", n: "Прилавок: печень трески", item: "liver", x: 6.0, z: 6.8, cost: 15000, after: ["cashier"] },
    { id: "liverhouse", k: "proc", n: "Цех печени", model: "liverhouse", x: 5.6, z: 1.4, w: 2.6, d: 1.4, rec: { in: ["cod"], out: "liver", t: 0.8 }, cost: 17000, after: ["stall_liver"] },
    { id: "su_liver", k: "supg", of: "liverhouse", x: 9.2, z: 2.0, after: ["liverhouse"] },
    { id: "fisher3", k: "helper", n: "Рыбак цеха печени", role: "fisher", from: "spot1", to: ["liverhouse"], cost: 18000, after: ["liverhouse"] },
    { id: "runner_liver", k: "helper", n: "Разносчик печени", role: "runner", from: "liverhouse", to: ["stall_liver"], cost: 19500, after: ["liverhouse"] },
    // восточный двор: копчёная треска, клипфиск (треска + соль) и ярмарочные корзины (рыбник + копчёная треска) на судно
    { id: "stall_smcod", k: "stall", n: "Прилавок: копчёная треска", item: "smcod", x: 15.8, z: 6.8, cost: 21000, after: ["runner_liver"] },
    { id: "wood", k: "gen", n: "Дровяник", model: "woodshed", x: 17.4, z: -3.0, w: 2.4, d: 2, item: "log", t: 1.0, cap: 20, cost: 21500, after: ["smokery"] },
    { id: "smokery", k: "proc", n: "Коптильня трески", model: "smokehouse", x: 22.2, z: -3.2, w: 2.8, d: 2.2, rec: { in: ["cod", "log"], out: "smcod", t: 0.8 }, cost: 22000, after: ["stall_smcod"] },
    { id: "su_wood", k: "supg", of: "wood", x: 17.4, z: -5.4, after: ["wood"] },
    { id: "su_smokery", k: "supg", of: "smokery", x: 22.2, z: -5.6, after: ["smokery"] },
    { id: "woodman", k: "helper", n: "Дровосек", role: "runner", from: "wood", to: ["smokery"], cost: 21000, after: ["wood"] },
    { id: "fisher_smk", k: "helper", n: "Рыбак коптильни", role: "fisher", from: "spot1", to: ["smokery"], cost: 22000, after: ["wood"] },
    { id: "runner_smcod", k: "helper", n: "Разносчик копчёной трески", role: "runner", from: "smokery", to: ["stall_smcod"], cost: 23000, after: ["woodman"] },
    { id: "saltpan", k: "gen", n: "Солеварня", model: "boiler", x: 26.6, z: -3.0, w: 2.6, d: 1.8, item: "salt", t: 1.0, cap: 20, cost: 23000, after: ["klipyard"] },
    { id: "su_saltpan", k: "supg", of: "saltpan", x: 26.6, z: -5.4, after: ["saltpan"] },
    { id: "klipyard", k: "proc", n: "Клипфисковый двор", model: "dryer", x: 23.0, z: 1.6, w: 2.8, d: 1.6, rec: { in: ["cod", "salt"], out: "klip", t: 0.8 }, cost: 24000, after: ["runner_smcod"] },
    { id: "su_klip", k: "supg", of: "klipyard", x: 26.8, z: 1.6, after: ["klipyard"] },
    { id: "saltman", k: "helper", n: "Солевар", role: "runner", from: "saltpan", to: ["klipyard"], cost: 24000, after: ["saltpan"] },
    { id: "fisher_klip", k: "helper", n: "Рыбак клипфиска", role: "fisher", from: "spot1", to: ["klipyard"], cost: 25000, after: ["saltpan"] },
    { id: "loader_k", k: "helper", n: "Грузчик клипфиска", role: "runner", from: "klipyard", to: ["dock"], cost: 26000, after: ["saltman"] },
    { id: "basketry", k: "proc", n: "Корзинная лавка", model: "packhouse", x: 17.6, z: 1.6, w: 2.6, d: 1.6, rec: { in: ["pie", "smcod"], out: "basket", t: 1.2 }, cost: 26000, after: ["loader_k"] },
    { id: "su_basket", k: "supg", of: "basketry", x: 14.2, z: 1.6, after: ["basketry"] },
    { id: "feed_b1", k: "helper", n: "Подносчик рыбников", role: "runner", from: "bakery", to: ["basketry"], cost: 27000, after: ["basketry"] },
    { id: "feed_b2", k: "helper", n: "Подносчик копчёной трески", role: "runner", from: "smokery", to: ["basketry"], cost: 28000, after: ["basketry"] },
    { id: "loader_b", k: "helper", n: "Грузчик корзин", role: "runner", from: "basketry", to: ["dock"], cost: 29000, after: ["feed_b1"] },
    { id: "light", k: "goal", n: "Маяк", x: 12.0, z: -11.0, pad: [12.6, -7.8], cost: 36000, after: ["loader_b", "feed_b2"] },
    { id: "ads", k: "ads", n: "Реклама", x: -8.0, z: 9.3, free: 1 },
    { id: "maptable", k: "map", n: "Карта архипелага", x: -12.95, z: 4.6, w: 1.5, d: 1.0, free: 1 },
    { id: "jetty", k: "jetty", n: "Причал перевозки", x: -5.0, z: -7.5, w: 1.6, d: 1.0, free: 1 },
  ],
};
// Новые острова строятся на проверенной раскладке старой бухты: свои товары, цепочки, названия, погода и событие.
function reskin(base, o) {
  const M = JSON.parse(JSON.stringify(base));
  const it = (s) => o.items[s] || s, nm = (s) => (ITEMS[IT[s]] || { n: s }).n;
  const byId = {}; for (const e of M.ents) byId[e.id] = e;
  for (const e of M.ents) {
    if (o.drop && o.drop.includes(e.id)) continue;
    if (e.item) e.item = it(e.item);
    if (e.rec) e.rec = { in: e.rec.in.map(it).filter((s) => !(o.noIn || []).includes(s)), out: it(e.rec.out), t: e.rec.t };
    if (e.accept) e.accept = e.accept.map(it);
    if (o.models && o.models[e.id]) e.model = o.models[e.id];
  }
  const prod = (e) => (e.k === "spot" || e.k === "gen" ? e.item : e.rec ? e.rec.out : null);
  for (const e of M.ents) {
    if (o.names[e.id]) { e.n = o.names[e.id]; continue; }
    if (e.k === "stall") e.n = "Прилавок: " + nm(e.item);
    else if (e.k === "spot") e.n = (e.def2 || (e.auto ? "Глубина: " : o.spotWord || "Отмель: ")) + nm(e.item);
    else if (e.k === "helper" && e.role === "fisher") e.n = "Рыбак: " + nm(prod(byId[e.from])) + (e.to && byId[e.to[0]] && byId[e.to[0]].k !== "stall" ? " → " + (o.names[e.to[0]] || byId[e.to[0]].n) : "");
    else if (e.k === "helper" && e.role === "runner") { const p = prod(byId[e.from]); e.n = "Носильщик: " + nm(p).toLowerCase(); }
  }
  M.big = base.big.map((b, i) => ({ n: (o.big && o.big[i]) || b.n, after: b.after, st: b.st.map(([s, n]) => [it(s), n]), rw: b.rw }));
  M.event = o.event; if (o.shore) M.shore = o.shore;
  const g = M.ents.find((e) => e.k === "goal"); if (g && o.light) g.cost = o.light;
  return M;
}
// 5. Северный фьорд — узкие бухты между скал, сёмга (раскладка Ледяного фьорда)
const BAY5 = reskin(BAY2, { event: "run", light: 13000,
  items: { salmon: "semga", steak: "gravlax", caviar: "balyk", can: "pres", gift: "nordset", lox: "kulebyaka", keg: "balykbar" },
  names: { steak: "Засолочный стол", caviar: "Балычная", cannery: "Цех пресервов", pack: "Упаковочная", smokery: "Пекарня кулебяк", cooper: "Бондарня балыка", pier: "Мостки в узкой бухте", dock: "Причал фьорда" },
  big: ["Заказ рыбной лавки", "Поставка наборов", "Флотский контракт"] });
// 6. Ледник — айсберги и тюлени, ловят только в прорубях (раскладка Крабового мыса)
const BAY6 = reskin(BAY3, { event: "storm", light: 21000, spotWord: "Прорубь: ",
  items: { crab: "saika", crabc: "strogan", mussel: "urchin", crate: "icebox", platter: "nordplat", dmussel: "urchroe", pate: "saikapate" },
  names: { boil: "Разделка строганины", farm: "Ежовая лунка", icehouse: "Ледяной погреб", icehole: "Большая прорубь", bar: "Закусочная «Север»", farm2: "Вторая ежовая лунка", drysh: "Икорня ежей", boil2: "Вторая разделка", patehouse: "Паштетная", dock: "Причал у льдины" },
  big: ["Заказ полярной станции", "Поставка ассорти", "Флотский контракт"] });
BAY6.traps = [];      // на леднике ловушек на отливе нет
// 7. Вулканический остров — горячие источники, вода не замерзает, коптильня на гейзере (раскладка Ярмарочной гавани)
const BAY7 = reskin(BAY4, { event: "geyser", light: 38000,
  items: { cod: "redfish", stockfish: "bakedfish", seaweed: "warmweed", pie: "volpie", liver: "rliver", oil: "fishmeal", smcod: "hotsmoke", log: "steam", klip: "saltred", basket: "volbasket" },
  names: { dryer: "Каменная печь", plant: "Тёплая заводь", bakery: "Пекарня у кратера", render: "Мельница рыбной муки", liverhouse: "Цех печени", wood: "Гейзер", smokery: "Коптильня на гейзере", saltpan: "Солеварня на источнике", klipyard: "Засолка окуня", basketry: "Корзинная лавка", woodman: "Носильщик пара", dock: "Причал у кратера" },
  models: { wood: "geyser" },
  big: ["Заказ курорта", "Поставка пирогов", "Флотский контракт"] });
// 8. Туманные шхеры — финал: туман, без маяка лодки теряются, самая дорогая рыба (раскладка Ледяного фьорда)
const BAY8 = reskin(BAY2, { event: "fog", light: 70000,
  items: { salmon: "halibut", steak: "halisteak", caviar: "halismoke", can: "halican", gift: "royalset", lox: "halipie", keg: "skerkeg" },
  names: { steak: "Разделка палтуса", caviar: "Коптильня шхер", cannery: "Консервный цех", pack: "Королевская упаковочная", smokery: "Пекарня шхер", cooper: "Бондарня шхер", pier: "Мостки между шхерами", dock: "Причал в тумане" },
  big: ["Заказ смотрителя", "Королевская поставка", "Последний флотский контракт"] });
export const BAYMAPS = [BAY1, BAY2, BAY3, BAY4, BAY5, BAY6, BAY7, BAY8];
// бухты: название, тема мира, что нового (для окна перехода)
export const BAYS = [
  { n: "Тихая бухта", theme: 0, news: ["herring", "fillet", "salted", "smoked", "soup"], ev: "Бураны: косяк уходит — держи запас" },
  { n: "Ледяной фьорд", theme: 1, news: ["salmon", "steak", "caviar", "can", "gift", "lox", "keg"], ev: "Ход лосося: улов вдвое" },
  { n: "Крабовый мыс", theme: 2, news: ["crab", "crabc", "mussel", "crate", "platter", "dmussel", "pate"], ev: "Приливы и отливы: на отливе — ловушки с крабами" },
  { n: "Ярмарочная гавань", theme: 3, news: ["cod", "stockfish", "seaweed", "pie", "liver", "oil", "smcod", "klip", "basket"], ev: "Ярмарочный день: важные гости платят втрое" },
  { n: "Северный фьорд", theme: 4, news: ["semga", "gravlax", "balyk", "pres", "nordset", "kulebyaka", "balykbar"], ev: "Ход сёмги: улов вдвое" },
  { n: "Ледник", theme: 5, news: ["saika", "strogan", "urchin", "icebox", "nordplat", "urchroe", "saikapate"], ev: "Буран: рыба уходит подо лёд — держи запас" },
  { n: "Вулканический остров", theme: 6, news: ["redfish", "bakedfish", "warmweed", "volpie", "rliver", "fishmeal", "hotsmoke", "saltred", "volbasket"], ev: "Гейзер: все цеха работают вдвое быстрее" },
  { n: "Туманные шхеры", theme: 7, news: ["halibut", "halisteak", "halismoke", "halican", "royalset", "halipie", "skerkeg"], ev: "Туман: без маяка лодки теряются — судно опаздывает, покупателей меньше" },
];
// сколько платят за товар в каждой бухте (выручка, не цены построек): подогнано, чтобы каждая бухта шла 30–40 минут
export const BAY_INCOME = [1.1, 1.3, 0.75, 0.85, 0.55, 0.66, 0.745, 0.6];
// старые бухты (версия 1: одна карта, цены умножались)
export const BAYS_OLD = [{ mult: 1 }, { mult: 3.5 }, { mult: 12 }, { mult: 40 }];

/* ---------- Знаки промысла: после маяка выбираешь 1 из 3 случайных. Действуют до конца забега (все бухты подряд) ---------- */
export const PERKS = [
  { id: "p_cap", g: "Ты", n: "Широкий короб", d: "+2 места в стопке", max: 5 },
  { id: "p_spd", g: "Ты", n: "Лёгкий шаг", d: "+8% к скорости", max: 5 },
  { id: "p_wade", g: "Ты", n: "Свой у воды", d: "+25% к скорости у берега и в воде", max: 3 },
  { id: "p_dbl", g: "Ты", n: "Двойной улов", d: "+20% шанс поймать сразу две", max: 3 },
  { id: "p_mag", g: "Ты", n: "Длинные руки", d: "Выручку собираешь издалека (+1,5 м)", max: 3 },
  { id: "h_spd", g: "Артель", n: "Быстрые ноги", d: "Помощники +15% к скорости", max: 5 },
  { id: "h_cap", g: "Артель", n: "Крепкие спины", d: "Помощники несут +2", max: 5 },
  { id: "h_free", g: "Артель", n: "Земляк", d: "Первый рыбак в каждой бухте — бесплатно", max: 1 },
  { id: "h_shelf", g: "Артель", n: "Большие полки", d: "Прилавки и цеха вмещают +12 — помощники реже ждут", max: 3 },
  { id: "e_tip", g: "Торговля", n: "Чаевые", d: "Каждый пятый покупатель доплачивает половину", max: 3 },
  { id: "e_order", g: "Торговля", n: "Хорошая слава", d: "Заказы платят +40%, срок +20%", max: 3 },
  { id: "e_cheap", g: "Торговля", n: "Знакомый плотник", d: "Первые 6 построек в бухте на 35% дешевле", max: 2 },
  { id: "e_start", g: "Торговля", n: "Подъёмные", d: "В новую бухту — с запасом денег", max: 3 },
  { id: "s_pre", g: "Цех", n: "Готовый цех", d: "Первый цех бухты уже построен и ускорен", max: 1 },
  { id: "s_speed", g: "Цех", n: "Сноровка", d: "Цеха работают на 20% быстрее", max: 5 },
];
/* ---------- «Флот»: якоря за каждую пройденную бухту, тратятся на постоянные улучшения (для всех новых забегов) ---------- */
export const META = [
  { id: "m_bag", br: "Снаряжение", n: "Свой короб", d: "+1 место в стопке", max: 5, cost: [2, 3, 4, 5, 6] },
  { id: "m_boots", br: "Снаряжение", n: "Ладные унты", d: "+4% к скорости", max: 5, cost: [2, 3, 4, 5, 6], req: "m_bag" },
  { id: "m_net", br: "Снаряжение", n: "Своя сеть", d: "Ловишь на 8% быстрее", max: 5, cost: [3, 4, 5, 6, 7], req: "m_boots" },
  { id: "m_crew", br: "Артель", n: "Бывалые", d: "Помощники +6% к скорости", max: 5, cost: [2, 3, 4, 5, 6] },
  { id: "m_hcap", br: "Артель", n: "Короба артели", d: "Помощники несут +1", max: 4, cost: [3, 4, 5, 6], req: "m_crew" },
  { id: "m_free", br: "Артель", n: "Старый друг", d: "Первый рыбак в каждой бухте — бесплатно", max: 1, cost: [6], req: "m_hcap" },
  { id: "m_start", br: "Торговля", n: "Запас в кармане", d: "Начинаешь бухту с деньгами", max: 5, cost: [2, 3, 4, 5, 6] },
  { id: "m_cash", br: "Торговля", n: "Счетовод", d: "Выручку собираешь издалека (+1 м)", max: 2, cost: [4, 6], req: "m_start" },
  { id: "m_off", br: "Торговля", n: "Приказчик", d: "+25% к доходу, пока тебя нет", max: 4, cost: [3, 4, 5, 6], req: "m_cash" },
];
// события бухт: когда первое, как часто, сколько длится предупреждение и само событие (с)
export const EVENTS = {
  storm: { n: "Буран", first: 420, every: 330, warn: 15, dur: 40 },
  run: { n: "Ход лосося", first: 360, every: 300, warn: 10, dur: 35 },
  tide: { n: "Отлив", first: 150, every: 140, warn: 10, dur: 55 },
  fair: { n: "Ярмарочный день", first: 420, every: 330, warn: 12, dur: 60 },
  geyser: { n: "Гейзер", first: 300, every: 300, warn: 10, dur: 40 },      // все цеха вдвое быстрее
  fog: { n: "Туман", first: 240, every: 260, warn: 12, dur: 50 },      // пока маяк не горит: судно опаздывает, покупателей меньше
};
export const DECO_MAX = 3;      // украшения базы: фонари, флажки, вывески — за ступени больших заказов
// сколько якорей за бухту
export const anchorsFor = (bay, stars) => 3 + bay * 2 + Math.min(4, Math.floor((stars || 0) / 6));

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

// порядок мест в сохранениях версии до «Хижины» (для переноса старых сохранений по названиям мест)
export const IDS_V2 = {"b0": ["spot1", "artel", "stall_fish", "fisher0", "stall_fillet", "table1", "runner1", "bag", "boots", "net", "su_table1", "fisher1", "stall_salt", "salt", "su_salt", "feed_salt", "runner_salt", "board", "stall_smoked", "smoke", "wood", "su_smoke", "su_wood", "woodman", "feed_smoke", "runner3", "cashier", "table2", "su_table2", "fisher2", "runner2", "stall_soup", "kettle", "su_kettle", "fisher_soup", "woodman2", "runner_soup", "light"], "b1": ["spot1", "artel", "stall_salmon", "fisher0", "stall_steak", "steak", "runner1", "bag", "boots", "net", "su_steak", "fisher1", "stall_caviar", "caviar", "su_caviar", "fisher2", "runner2", "board", "pier", "spot2", "fisher3", "dock", "cannery", "su_cannery", "feed_can", "loader", "cashier", "pack", "su_pack", "packer", "packer2", "loader2", "light"], "b2": ["spot1", "artel", "stall_crab", "fisher0", "stall_crabc", "boil", "runner1", "bag", "boots", "net", "su_boil", "fisher1", "stall_mussel", "farm", "su_farm", "musselman", "board", "dock", "icehouse", "icehole", "su_icehouse", "fisher2", "iceman", "loader", "cashier", "stall_platter", "bar", "su_bar", "runner_bar", "mussel2", "runner_plat", "light"], "b3": ["spot1", "artel", "stall_cod", "fisher0", "stall_stock", "dryer", "runner1", "bag", "boots", "net", "su_dryer", "fisher1", "stall_sea", "plant", "planter", "su_plant", "board", "stall_pie", "bakery", "su_bakery", "feed_bake", "runner_pie", "dock", "render", "su_render", "fisher2", "loader", "cashier", "stall_liver", "liverhouse", "su_liver", "fisher3", "runner_liver", "light"], "vs": ["spot1", "stall_fish", "fisher0", "stall_fillet", "table1", "bag", "boots", "net", "runner1", "su_table1", "fisher1", "stall_smoked", "smoke", "wood", "su_smoke", "woodman", "feed_smoke", "runner3", "stall_caviar", "caviar", "pier", "spot2", "fisher3", "runner5", "cashier", "light", "artel", "spot1@1", "stall_fish@1", "fisher0@1", "stall_fillet@1", "table1@1", "bag@1", "boots@1", "net@1", "runner1@1", "su_table1@1", "fisher1@1", "stall_smoked@1", "smoke@1", "wood@1", "su_smoke@1", "woodman@1", "feed_smoke@1", "runner3@1", "stall_caviar@1", "caviar@1", "pier@1", "spot2@1", "fisher3@1", "runner5@1", "cashier@1", "light@1", "artel@1"]};

/* ---------- архипелаг (раунд 7) ---------- */
// острова на карте архипелага (координаты в процентах карты) и торговые пути: что один остров везёт другому
export const ISLES = [{ x: 22, y: 70 }, { x: 30, y: 22 }, { x: 74, y: 30 }, { x: 72, y: 76 }];
export const ROUTES = [
  { a: 0, b: 1, it: "salted", n: "Солёная сельдь для фьорда", cost: 2500 },
  { a: 1, b: 2, it: "can", n: "Консервы для крабовых лодок", cost: 5000 },
  { a: 2, b: 3, it: "mussel", n: "Мидии для пирогов гавани", cost: 9000 },
  { a: 3, b: 0, it: "seaweed", n: "Ламинария в уху Тихой бухты", cost: 9000 },
  { a: 0, b: 2, it: "smoked", n: "Копчёности на мыс", cost: 6000 },
  { a: 1, b: 3, it: "caviar", n: "Икра на ярмарку", cost: 12000 },
  { a: 3, b: 4, it: "pie", n: "Рыбники во фьорд", cost: 12000 },
  { a: 4, b: 5, it: "pres", n: "Пресервы для полярников", cost: 14000 },
  { a: 5, b: 6, it: "icebox", n: "Лёд на вулкан", cost: 16000 },
  { a: 6, b: 7, it: "hotsmoke", n: "Копчёный окунь в шхеры", cost: 18000 },
  { a: 7, b: 0, it: "royalset", n: "Королевские наборы в Тихую бухту", cost: 20000 },
];
// перевод денег между островами: телеграф (сразу, комиссия; прокачка в артели), инкассаторская шхуна (без комиссии, ~90 с, риск),
// сундук своими руками (без комиссии и риска; чайки клюют, если никто не отгоняет)
export const XFER = { tel: [0.25, 0.2, 0.15, 0.1], telCost: [3000, 9000, 20000], guardCost: [4000, 12000], lhCost: [2500, 6000, 12000], shipT: 90, risk: 0.35, riskLh: 0.07, riskGuard: 0.08, loss: [0.2, 0.4], peck: 0.025, gullEvery: 6, carrySpeed: 0.78, min: 50 };
export const ARCH = { cap: 7200, routeK: 0.25, routeT: 90, srcBonus: 0.1 };     // сундук острова — до 2 часов дохода; путь: 25% дохода острова-поставщика

/* ---------- хижина: наряды, пёс, санки и лодка (за деньги в игре, переносятся) ---------- */
export const OUTFITS = [
  { n: "Рабочая куртка", cost: 0 },          // свой цвет игрока
  { n: "Штормовка", coat: "#f2c230", hat: "#2f3b4a", cost: 600 },
  { n: "Тельняшка", coat: "#e8eef5", hat: "#1f4d8f", cost: 1500 },
  { n: "Шуба", coat: "#8a5a3a", hat: "#e9dcc6", cost: 3500 },
  { n: "Капитанский китель", coat: "#1d2c4f", hat: "#f2f2f2", cost: 7000 },
  { n: "Праздничный кафтан", coat: "#c8323c", hat: "#f4c542", cost: 12000 },
];
export const PET = { n: "Пёс-помощник", d: "Сам бегает к прилавкам и приносит выручку", cost: 2500, r: 9, cd: 3.5, speed: 6.2 };
export const RIDES = [
  null,
  { n: "Санки", d: "Ходишь быстрее", sp: 0.1, cost: 1800 },
  { n: "Лёгкая лодка", d: "Ещё быстрее, а по мелководью — как по суше", sp: 0.2, cost: 8000 },
];

/* ---------- книга улова: редкие рыбы и находки ---------- */
// bay — где попадается (-1 — везде), p — шанс на один улов игрока, v — сколько стоит (умножается на цены бухты)
export const RARE = [
  { id: "gold", n: "Золотая сельдь", d: "Блестит, как монета", ic: "🐟", f: "sepia(1) saturate(4) hue-rotate(5deg)", bay: 0, p: 1 / 500, v: 300 },
  { id: "bottle", n: "Бутылка с запиской", d: "«Ищи там, где спит маяк»", ic: "🍾", bay: 0, p: 1 / 800, v: 150, tr: 1 },
  { id: "king", n: "Королевский лосось", d: "Вдвое больше обычного", ic: "🐠", f: "hue-rotate(-30deg) saturate(1.6)", bay: 1, p: 1 / 500, v: 600 },
  { id: "ice", n: "Ледяной кристалл", d: "Не тает даже в руке", ic: "💎", bay: 1, p: 1 / 800, v: 400, tr: 1 },
  { id: "blue", n: "Голубой краб", d: "Один на две тысячи", ic: "🦀", f: "hue-rotate(190deg) saturate(1.5)", bay: 2, p: 1 / 500, v: 900 },
  { id: "pearl", n: "Жемчужина", d: "Нашлась в мидии", ic: "🦪", bay: 2, p: 1 / 800, v: 1200, tr: 1 },
  { id: "giant", n: "Гигантская треска", d: "Еле влезла в короб", ic: "🐡", f: "hue-rotate(60deg)", bay: 3, p: 1 / 500, v: 1200 },
  { id: "anchor", n: "Старинный якорь", d: "С затонувшего брига", ic: "⚓", bay: 3, p: 1 / 800, v: 2000, tr: 1 },
  { id: "silver", n: "Серебряная сёмга", d: "Чешуя как зеркало", ic: "🐟", f: "grayscale(1) brightness(1.3)", bay: 4, p: 1 / 500, v: 1100 },
  { id: "seal", n: "Тюленёнок-соня", d: "Уснул в сетке, его отпустили — на удачу", ic: "🦭", bay: 5, p: 1 / 800, v: 1500, tr: 1 },
  { id: "obsidian", n: "Обсидиановая раковина", d: "Тёплая, как камень у гейзера", ic: "🐚", f: "brightness(0.5) saturate(2)", bay: 6, p: 1 / 800, v: 2200, tr: 1 },
  { id: "ghost", n: "Призрачный палтус", d: "Видели только в тумане", ic: "🐡", f: "grayscale(1) opacity(.8)", bay: 7, p: 1 / 500, v: 3000 },
  { id: "moon", n: "Рыба-луна", d: "Говорят, приносит удачу", ic: "🌕", bay: -1, p: 1 / 5000, v: 5000 },
];

/* ---------- задания дня ---------- */
export const DAILY = [
  { k: "served", n: "Обслужи покупателей", need: [120, 200, 300] },
  { k: "orders", n: "Выполни заказы с доски", need: [3, 5, 7] },
  { k: "catch", n: "Поймай рыбы сам", need: [80, 150, 250] },
  { k: "buy", n: "Открой новые места", need: [5, 8, 12] },
  { k: "earn", n: "Заработай", need: [20000, 50000, 120000] },
  { k: "rare", n: "Поймай редкую рыбу", need: [1, 1, 2] },
  { k: "cash", n: "Собери выручку с прилавков", need: [40, 70, 110] },
];
export const DAILY_RW = { task: 3, streak: [4, 5, 6, 8, 10, 12, 15] };     // якоря за задание и за все три (по дню серии)
