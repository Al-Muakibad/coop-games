// «Хутор» — данные: карты, рецепты, наборы, ремёсла, мост, угрозы, края, задания.
// Кооп-версия «Очага» на двоих: два берега реки, две семьи жителей, общие стройки.
// Тексты — по-русски, английские — в en.js (shared/i18n.js переводит на лету).

// Категории: цвет рамки и подпись
export const CATS = {
  person: { n: "Житель", c: "#f0a63a", d: "#a8641a" },
  res: { n: "Ресурс", c: "#c49a6c", d: "#7d5a35" },
  food: { n: "Еда", c: "#e7645a", d: "#9c2f27" },
  nature: { n: "Природа", c: "#5fb25a", d: "#2f6e2c" },
  place: { n: "Место", c: "#3fa7c9", d: "#1d6380" },
  build: { n: "Постройка", c: "#7f8fd6", d: "#424f96" },
  enemy: { n: "Враг", c: "#d64545", d: "#7a1b1b" },
  idea: { n: "Идея", c: "#e9c548", d: "#9a7c12" },
  item: { n: "Снаряжение", c: "#9fb0c0", d: "#55646f" },
  coin: { n: "Монета", c: "#f6c945", d: "#a77d0c" },
  pack: { n: "Сундук", c: "#d562b9", d: "#842a6e" },
  site: { n: "Общая стройка", c: "#ffb347", d: "#9a5a10" },
};

// Две семьи (игроки): цвет одежды жителей, курсора и рамки
export const FAM = [
  { n: "Южные", c: "#f08a3c", d: "#a8501a", glow: "#ffb070", side: "s" },
  { n: "Северные", c: "#3fb8c8", d: "#1d6e7a", glow: "#7ee0ee", side: "n" },
];

// c — категория, v — цена продажи (null — не продаётся), f — сытость, u — запас использований,
// hp/atk/def/spd — бой (spd — секунд между ударами), cap — +вместимость, d — описание
const C = {};
function def(k, o) { o.k = k; C[k] = o; return o; }

/* ---------- Жители (метка w — может работать). У каждого жителя есть семья (o: 0/1) ---------- */
def("villager", { n: "Житель", c: "person", v: null, hp: 7, atk: 1, spd: 1.4, tg: ["w"], d: "Работает, строит и сражается. Каждую ночь съедает 2 еды. Двигать может только его семья." });
def("spearman", { n: "Копейщик", c: "person", v: null, hp: 7, atk: 2, spd: 1.3, tg: ["w", "fighter"], d: "Житель с копьём. Неплох против зверей." });
def("warrior", { n: "Воин", c: "person", v: null, hp: 9, atk: 3, spd: 1.2, tg: ["w", "fighter"], d: "Житель с мечом. Основа обороны." });
def("knight", { n: "Латник", c: "person", v: null, hp: 14, atk: 3, def: 1, spd: 1.2, tg: ["w", "fighter"], d: "Воин в доспехе. Каждый удар по нему слабее на 1." });
def("archer", { n: "Лучник", c: "person", v: null, hp: 6, atk: 2, spd: 0.85, tg: ["w", "fighter", "ranged"], d: "Стреляет часто и стоит позади: враги бьют его в последнюю очередь." });
def("builder", { n: "Строитель", c: "person", v: null, hp: 7, atk: 1, spd: 1.4, tg: ["w"], d: "С молотом. Строит вдвое быстрее." });
def("farmer", { n: "Фермер", c: "person", v: null, hp: 7, atk: 1, spd: 1.4, tg: ["w"], d: "С мотыгой. Грядки и сбор еды идут вдвое быстрее." });
def("explorer", { n: "Следопыт", c: "person", v: null, hp: 8, atk: 2, spd: 1.2, tg: ["w"], d: "С фонарём. Разведывает вдвое быстрее и реже попадает в засады." });

/* ---------- Ресурсы ---------- */
def("wood", { n: "Бревно", c: "res", v: 1, d: "Доски, костры, хижины, сваи моста." });
def("stone", { n: "Камень", c: "res", v: 1, d: "Хижины, костры, тёсаный камень, сваи моста." });
def("plank", { n: "Доска", c: "res", v: 2, d: "Главный строительный материал." });
def("cutstone", { n: "Тёсаный камень", c: "res", v: 3, d: "Опоры и арка моста, прочные постройки." });
def("clay", { n: "Глина", c: "res", v: 1, d: "На костре обжигается в кирпич." });
def("brick", { n: "Кирпич", c: "res", v: 3, d: "Кузня, кухня, амбар, арка моста." });
def("fiber", { n: "Волокно", c: "res", v: 1, d: "Два волокна скручиваются в верёвку." });
def("rope", { n: "Верёвка", c: "res", v: 2, d: "Луки, лодки, частокол, настил моста." });
def("ore", { n: "Руда", c: "res", v: 2, d: "В кузне с углём даёт железо." });
def("coal", { n: "Уголь", c: "res", v: 1, d: "Бревно, пережжённое на костре." });
def("iron", { n: "Железо", c: "res", v: 4, d: "Мечи, доспехи, фонари, перила моста." });
def("hide", { n: "Шкура", c: "res", v: 2, d: "Нужна для доспеха." });
def("bone", { n: "Кость", c: "res", v: 1, d: "Остаётся после нежити. Можно продать." });
def("nugget", { n: "Самородок", c: "res", v: 6, d: "Чистое золото. Продай — и купишь пару сундуков." });
def("crystal", { n: "Кристалл", c: "res", v: 6, d: "Светится изнутри. Фонари и перила моста." });
def("relic", { n: "Реликвия", c: "res", v: 8, d: "Древняя вещь из Гиблой чащи. Нужна для арки моста." });
def("map", { n: "Карта гор", c: "res", v: 2, d: "Житель на карту — и откроется путь в Горы." });
def("scale", { n: "Чешуя дракона", c: "res", v: 20, d: "Трофей с Речного дракона. Очень дорогая." });

/* ---------- Монеты ---------- */
def("coin", { n: "Монета", c: "coin", v: null, d: "Монеты общие. На них покупают сундуки. Место не занимают." });

/* ---------- Еда (f — сытость) ---------- */
def("berry", { n: "Ягоды", c: "food", v: 1, f: 1, d: "Сытость 1. На грядке вырастает новый куст." });
def("apple", { n: "Яблоко", c: "food", v: 1, f: 1, d: "Сытость 1." });
def("mushroom", { n: "Гриб", c: "food", v: 1, f: 1, d: "Сытость 1. На костре — жареный гриб." });
def("carrot", { n: "Морковь", c: "food", v: 1, f: 1, d: "Сытость 1. На грядке из одной — две." });
def("wheat", { n: "Колос", c: "food", v: 1, f: 0, d: "Сам не кормит. На грядке множится, на кухне — хлеб." });
def("meat", { n: "Сырое мясо", c: "food", v: 1, f: 2, d: "Сытость 2. На костре — жаркое на 5." });
def("fish", { n: "Рыба", c: "food", v: 1, f: 2, d: "Сытость 2. На костре — печёная рыба." });
def("honey", { n: "Мёд", c: "food", v: 2, f: 3, d: "Сытость 3." });
def("friedmush", { n: "Жареный гриб", c: "food", v: 2, f: 3, d: "Сытость 3." });
def("roast", { n: "Жаркое", c: "food", v: 3, f: 5, d: "Сытость 5." });
def("bakedfish", { n: "Печёная рыба", c: "food", v: 3, f: 4, d: "Сытость 4." });
def("bread", { n: "Хлеб", c: "food", v: 3, f: 5, d: "Сытость 5." });
def("pie", { n: "Ягодный пирог", c: "food", v: 5, f: 8, d: "Сытость 8." });
def("soup", { n: "Уха", c: "food", v: 4, f: 7, d: "Сытость 7." });
def("stew", { n: "Грибная похлёбка", c: "food", v: 4, f: 7, d: "Сытость 7." });

/* ---------- Природа (u — сколько раз можно добыть) ---------- */
def("tree", { n: "Дерево", c: "nature", v: 0, u: 4, d: "Житель на дерево — бревно. Хватает на 4 бревна." });
def("rock", { n: "Валун", c: "nature", v: 0, u: 4, d: "Житель на валун — камень. Хватает на 4 камня." });
def("bush", { n: "Ягодный куст", c: "nature", v: 0, u: 3, d: "Житель на куст — ягоды. 3 урожая." });
def("appletree", { n: "Яблоня", c: "nature", v: 2, d: "Сама роняет яблоко раз в полдня. Без жителя." });
def("grass", { n: "Камыш", c: "nature", v: 0, u: 3, d: "Житель на камыш — волокно." });
def("claypit", { n: "Глиняный яр", c: "nature", v: 0, u: 4, d: "Житель — глина." });
def("mushpatch", { n: "Грибница", c: "nature", v: 0, u: 4, d: "Житель — гриб." });
def("hive", { n: "Дикий улей", c: "nature", v: 0, u: 3, d: "Житель — мёд." });
def("willow", { n: "Ива", c: "nature", v: 0, u: 4, d: "Житель — бревно, иногда волокно." });
def("shoal", { n: "Рыбное место", c: "nature", v: null, d: "Житель ловит рыбу сколько угодно." });
def("vein", { n: "Рудная жила", c: "nature", v: 0, u: 4, d: "Житель — руда." });
def("crystalvein", { n: "Кристальная жила", c: "nature", v: 0, u: 3, d: "Житель — кристалл. Долго." });
def("deadtree", { n: "Сухое дерево", c: "nature", v: 0, u: 3, d: "Житель — бревно, иногда кость." });

/* ---------- Места (разведка: житель на место) ---------- */
def("forest", { n: "Чаща", c: "place", v: 0, u: 8, d: "Отправь жителя на разведку: дерево, ягоды, грибы… или зверь." });
def("cave", { n: "Пещера", c: "place", v: 0, u: 10, d: "Камень, уголь, руда — и карта гор. Водятся мыши и пауки." });
def("shore", { n: "Плёс", c: "place", v: 0, u: 10, d: "Рыба, глина, монеты в иле. Бывают жабы." });
def("pass", { n: "Перевал", c: "place", v: 0, u: 10, d: "Руда, кристаллы, золото. И горный тролль." });
def("ruins", { n: "Руины", c: "place", v: 0, u: 10, d: "Реликвии и монеты. Нежить не любит гостей." });
def("barrow", { n: "Курган", c: "place", v: null, fixed: 1, d: "Брось на курган бойцов — проснётся страж кургана. За победу — реликвия." });

/* ---------- Постройки ---------- */
def("hut", { n: "Хижина", c: "build", v: 2, cap: 2, d: "Хижина + 2 жителя — через полминуты новый житель в их семью. Раз в день на хижину. Если работали обе семьи — он идёт туда, где людей меньше. +2 к месту." });
def("campfire", { n: "Костёр", c: "build", v: 1, d: "Жарит мясо, рыбу, грибы. Обжигает глину, пережигает бревно в уголь." });
def("field", { n: "Грядка", c: "build", v: 2, d: "Морковь или колос — вырастет вдвое больше. Ягоды — новый куст. Житель ускоряет." });
def("shed", { n: "Сарай", c: "build", v: 2, cap: 8, d: "+8 к месту для карт." });
def("granary", { n: "Амбар", c: "build", v: 4, cap: 16, pairB: 1, d: "Общий амбар двух семей: +16 к месту для карт." });
def("sawmill", { n: "Лесопилка", c: "build", v: 3, d: "Житель + бревно — сразу две доски." });
def("quarry", { n: "Каменоломня", c: "build", v: 3, d: "Житель добывает камень без конца, изредка — руду." });
def("smithy", { n: "Кузня", c: "build", v: 4, d: "Железо из руды и угля. Мечи, доспехи, фонари." });
def("kitchen", { n: "Кухня", c: "build", v: 4, d: "Хлеб, пироги, уха и похлёбка — сытнее всего." });
def("palisade", { n: "Частокол", c: "build", v: 2, d: "Враги, пришедшие к хутору, слабее на четверть (до двух частоколов)." });
def("tower", { n: "Сторожевая башня", c: "build", v: 4, d: "Сама стреляет по врагам рядом." });
def("fair", { n: "Ярмарка", c: "build", v: 4, pairB: 1, d: "Торг между берегами: каждая проданная карта +1 монета, утром — 2 монеты." });
def("boat", { n: "Лодка", c: "build", v: 3, d: "Открывает путь на Остров." });
def("trail", { n: "Горная тропа", c: "build", v: null, d: "Путь в Горы открыт." });
def("darkpath", { n: "Тёмная тропа", c: "build", v: null, d: "Путь в Гиблую чащу открыт." });

/* ---------- Общая стройка: мост через реку (стоит в реке, двигать нельзя) ---------- */
export const BRIDGE = [
  { k: "site0", n: "Мост: место", st: "Сваи", d: "Здесь будет мост. Сложите сюда 3 бревна, 2 камня и хотя бы по жителю от каждой семьи (лишние жители ускоряют)." },
  { k: "site1", n: "Мост: сваи", st: "Опоры", d: "Сваи стоят. Дальше — опоры: 2 тёсаных камня, 2 доски и двое жителей из разных семей." },
  { k: "site2", n: "Мост: опоры", st: "Настил", d: "Опоры готовы. Настил: 4 доски, 2 верёвки и двое жителей из разных семей." },
  { k: "site3", n: "Мост: настил", st: "Перила и фонари", d: "По мосту уже можно пройти. Перила и фонари: 2 железа, 2 кристалла, 2 доски и двое из разных семей." },
  { k: "site4", n: "Мост: фонари", st: "Арка Очага", d: "Последнее — Арка Очага: 3 тёсаных камня, 2 кирпича, реликвия и двое из разных семей." },
];
BRIDGE.forEach((b, i) => def(b.k, { n: b.n, c: "site", v: null, fixed: 1, stage: i, d: b.d }));
def("bridge", { n: "Мост Очага", c: "site", v: null, fixed: 1, stage: 5, d: "Мост готов: два берега — один хутор. Огонь на арке видно издалека." });

/* ---------- Снаряжение ---------- */
def("spear", { n: "Копьё", c: "item", v: 2, d: "Положи на жителя — станет копейщиком." });
def("sword", { n: "Меч", c: "item", v: 4, d: "Положи на жителя — станет воином." });
def("bow", { n: "Лук", c: "item", v: 3, d: "Положи на жителя — станет лучником." });
def("armor", { n: "Доспех", c: "item", v: 4, d: "Положи на воина — станет латником." });
def("hammer", { n: "Молот", c: "item", v: 2, d: "Положи на жителя — станет строителем." });
def("hoe", { n: "Мотыга", c: "item", v: 2, d: "Положи на жителя — станет фермером." });
def("lantern", { n: "Фонарь", c: "item", v: 4, d: "Положи на жителя — станет следопытом." });

/* ---------- Враги (lo — добыча; pair — «тяжёлый»: без бойцов обеих семей бьётся втрое слабее) ---------- */
def("wolf", { n: "Волк", c: "enemy", hp: 4, atk: 1, spd: 1.3, sp: 26, lo: [["meat"], ["hide", 0.5]], d: "Голодный и быстрый." });
def("boar", { n: "Кабан", c: "enemy", hp: 8, atk: 2, spd: 1.6, sp: 18, lo: [["meat"], ["meat"]], d: "Крепкий. Зато мяса много." });
def("tusker", { n: "Секач", c: "enemy", hp: 15, atk: 3, spd: 1.8, sp: 15, lo: [["meat"], ["meat"], ["meat"], ["hide"], ["hide"]], d: "Старый кабан-великан. Бьёт тяжело." });
def("bat", { n: "Летучая мышь", c: "enemy", hp: 3, atk: 1, spd: 1.0, sp: 30, lo: [["coin", 0.5]], d: "Мелкая и вредная." });
def("spider", { n: "Пещерный паук", c: "enemy", hp: 6, atk: 2, spd: 1.4, sp: 22, lo: [["fiber"], ["fiber"]], d: "После него остаётся паутина-волокно." });
def("frog", { n: "Болотная жаба", c: "enemy", hp: 4, atk: 1, spd: 1.2, sp: 18, lo: [["meat"]], d: "Скользкая и злая." });
def("raider", { n: "Разбойник", c: "enemy", hp: 7, atk: 2, spd: 1.4, sp: 20, lo: [["coin"], ["coin"], ["coin", 0.5]], d: "Пришёл за чужим добром." });
def("chief", { n: "Атаман", c: "enemy", hp: 18, atk: 3, spd: 1.4, def: 1, sp: 16, pair: 1, lo: [["coin"], ["coin"], ["coin"], ["coin"], ["iron"]], d: "Главарь разбойников. Тяжёлый враг: без бойцов обеих семей удары по нему втрое слабее." });
def("skeleton", { n: "Скелет", c: "enemy", hp: 7, atk: 2, spd: 1.4, sp: 18, lo: [["bone"], ["coin", 0.5]], d: "Гремит костями." });
def("wraith", { n: "Призрак", c: "enemy", hp: 10, atk: 3, spd: 1.2, sp: 24, lo: [["coin"], ["relic", 0.3]], d: "Холодный и злой." });
def("troll", { n: "Горный тролль", c: "enemy", hp: 22, atk: 4, spd: 2.0, sp: 12, pair: 1, lo: [["stone"], ["stone"], ["crystal"], ["nugget", 0.5]], d: "Огромный. Тяжёлый враг: нужны бойцы обеих семей." });
def("warden", { n: "Страж кургана", c: "enemy", hp: 34, atk: 4, spd: 1.5, def: 1, sp: 10, pair: 1, lo: [["relic"], ["iron"], ["nugget"]], d: "Древний воин из кургана. Тяжёлый враг: нужны бойцы обеих семей." });
def("boss", { n: "Речной дракон", c: "enemy", hp: 60, atk: 5, spd: 1.6, def: 1, sp: 9, boss: 1, pair: 1, lo: [["scale"], ["relic"], ["nugget"], ["nugget"]], d: "Поднялся со дна реки. Тяжёлый враг: без бойцов обеих семей его почти не поцарапать." });

/* ---------- Сундуки (покупаются, стоят на столе, открываются тапом) ---------- */
def("pk_forest", { n: "Сундук «Лес»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_stone", { n: "Сундук «Камень»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_farm", { n: "Сундук «Поле»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_craft", { n: "Сундук «Ремесло»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_defense", { n: "Сундук «Оборона»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_explore", { n: "Сундук «Странствия»", c: "pack", v: null, d: "Нажми, чтобы открыть." });

/* ---------- Рецепты ----------
   need: "wood" — расходуется; "=hut" — остаётся; "~tree" — остаётся, тратит одно использование;
   "@w" — любой работник (остаётся); "?@w" — работник по желанию (ускоряет).
   pair: 1 — нужны работники из обеих семей. stage — шаг моста. t — секунды. */
export const RECIPES = [
  // сбор
  { id: "r_wood", need: ["@w", "~tree"], t: 9, out: ["wood"], cat: "gather" },
  { id: "r_stone", need: ["@w", "~rock"], t: 10, out: ["stone"], cat: "gather" },
  { id: "r_berry", need: ["@w", "~bush"], t: 7, out: ["berry"], cat: "food" },
  { id: "r_apple", need: ["=appletree"], t: 48, out: ["apple"], cat: "nat" },
  { id: "r_fiber", need: ["@w", "~grass"], t: 7, out: ["fiber"], cat: "gather" },
  { id: "r_clay", need: ["@w", "~claypit"], t: 9, out: ["clay"], cat: "gather" },
  { id: "r_mush", need: ["@w", "~mushpatch"], t: 7, out: ["mushroom"], cat: "food" },
  { id: "r_honey", need: ["@w", "~hive"], t: 12, out: ["honey"], cat: "food" },
  { id: "r_willow", need: ["@w", "~willow"], t: 9, lo: [["wood", 3], ["fiber", 2]], cat: "gather" },
  { id: "r_fish", need: ["@w", "=shoal"], t: 12, out: ["fish"], cat: "food" },
  { id: "r_ore", need: ["@w", "~vein"], t: 13, out: ["ore"], cat: "gather" },
  { id: "r_crystal", need: ["@w", "~crystalvein"], t: 22, out: ["crystal"], cat: "gather" },
  { id: "r_deadwood", need: ["@w", "~deadtree"], t: 9, lo: [["wood", 3], ["bone", 1]], cat: "gather" },
  { id: "r_quarry", need: ["@w", "=quarry"], t: 11, lo: [["stone", 6], ["ore", 1]], cat: "gather" },
  // ремесло
  { id: "r_plank", need: ["@w", "wood", "wood"], t: 10, out: ["plank"], cat: "craft" },
  { id: "r_lumber", need: ["@w", "=sawmill", "wood"], t: 7, out: ["plank", "plank"], cat: "craft" },
  { id: "r_rope", need: ["@w", "fiber", "fiber"], t: 8, out: ["rope"], cat: "craft" },
  { id: "r_cutstone", need: ["@w", "stone", "stone"], t: 12, out: ["cutstone"], cat: "craft" },
  { id: "r_brick", need: ["=campfire", "clay", "clay"], t: 12, out: ["brick"], cat: "cook" },
  { id: "r_coal", need: ["=campfire", "wood"], t: 10, out: ["coal"], cat: "cook" },
  { id: "r_iron", need: ["@w", "=smithy", "ore", "coal"], t: 12, out: ["iron"], cat: "craft" },
  { id: "r_spear", need: ["@w", "wood", "stone", "rope"], t: 9, out: ["spear"], cat: "craft" },
  { id: "r_bow", need: ["@w", "plank", "rope"], t: 10, out: ["bow"], cat: "craft" },
  { id: "r_hammer", need: ["@w", "plank", "stone"], t: 8, out: ["hammer"], cat: "craft" },
  { id: "r_hoe", need: ["@w", "wood", "rope"], t: 8, out: ["hoe"], cat: "craft" },
  { id: "r_sword", need: ["@w", "=smithy", "iron", "plank"], t: 12, out: ["sword"], cat: "craft" },
  { id: "r_armor", need: ["@w", "=smithy", "iron", "hide"], t: 14, out: ["armor"], cat: "craft" },
  { id: "r_lantern", need: ["@w", "=smithy", "iron", "crystal"], t: 12, out: ["lantern"], cat: "craft" },
  // роли (снаряжение на жителя)
  { id: "e_spear", need: ["villager", "spear"], t: 1.5, out: ["spearman"], cat: "equip" },
  { id: "e_sword", need: ["villager", "sword"], t: 1.5, out: ["warrior"], cat: "equip" },
  { id: "e_sword2", need: ["spearman", "sword"], t: 1.5, out: ["warrior", "spear"], cat: "equip" },
  { id: "e_bow", need: ["villager", "bow"], t: 1.5, out: ["archer"], cat: "equip" },
  { id: "e_armor", need: ["warrior", "armor"], t: 1.5, out: ["knight"], cat: "equip" },
  { id: "e_hammer", need: ["villager", "hammer"], t: 1.5, out: ["builder"], cat: "equip" },
  { id: "e_hoe", need: ["villager", "hoe"], t: 1.5, out: ["farmer"], cat: "equip" },
  { id: "e_lantern", need: ["villager", "lantern"], t: 1.5, out: ["explorer"], cat: "equip" },
  // постройки
  { id: "r_hut", need: ["@w", "wood", "stone"], t: 14, out: ["hut"], cat: "build" },
  { id: "r_campfire", need: ["@w", "wood", "wood", "stone"], t: 8, out: ["campfire"], cat: "build" },
  { id: "r_field", need: ["@w", "plank", "fiber"], t: 12, out: ["field"], cat: "build" },
  { id: "r_shed", need: ["@w", "plank", "plank"], t: 12, out: ["shed"], cat: "build" },
  { id: "r_sawmill", need: ["@w", "plank", "stone", "stone"], t: 18, out: ["sawmill"], cat: "build" },
  { id: "r_quarryb", need: ["@w", "plank", "cutstone"], t: 18, out: ["quarry"], cat: "build" },
  { id: "r_smithy", need: ["@w", "brick", "brick", "cutstone"], t: 24, out: ["smithy"], cat: "build" },
  { id: "r_kitchen", need: ["@w", "campfire", "brick", "plank"], t: 20, out: ["kitchen"], cat: "build" },
  { id: "r_granary", need: ["@w", "@w", "plank", "plank", "cutstone", "brick"], t: 24, out: ["granary"], cat: "build", pair: 1 },
  { id: "r_palisade", need: ["@w", "wood", "wood", "wood", "rope"], t: 14, out: ["palisade"], cat: "build" },
  { id: "r_tower", need: ["@w", "cutstone", "cutstone", "plank"], t: 24, out: ["tower"], cat: "build" },
  { id: "r_fair", need: ["@w", "@w", "plank", "brick", "rope"], t: 20, out: ["fair"], cat: "build", pair: 1 },
  { id: "r_boat", need: ["@w", "plank", "plank", "rope"], t: 20, out: ["boat"], cat: "build" },
  { id: "r_trail", need: ["@w", "map"], t: 4, out: ["trail"], cat: "build" },
  { id: "r_darkpath", need: ["=explorer", "plank", "plank"], t: 10, out: ["darkpath"], cat: "build" },
  { id: "r_breed", need: ["=hut", "@w", "@w"], t: 36, out: ["villager"], cat: "breed" },
  // мост (общая стройка)
  { id: "b_1", need: ["=site0", "@w", "@w", "wood", "wood", "wood", "stone", "stone"], t: 26, stage: 1, cat: "bridge", pair: 1 },
  { id: "b_2", need: ["=site1", "@w", "@w", "cutstone", "cutstone", "plank", "plank"], t: 32, stage: 2, cat: "bridge", pair: 1 },
  { id: "b_3", need: ["=site2", "@w", "@w", "plank", "plank", "plank", "plank", "rope", "rope"], t: 36, stage: 3, cat: "bridge", pair: 1 },
  { id: "b_4", need: ["=site3", "@w", "@w", "iron", "iron", "crystal", "crystal", "plank", "plank"], t: 40, stage: 4, cat: "bridge", pair: 1 },
  { id: "b_5", need: ["=site4", "@w", "@w", "cutstone", "cutstone", "cutstone", "brick", "brick", "relic"], t: 46, stage: 5, cat: "bridge", pair: 1 },
  // еда
  { id: "r_roast", need: ["=campfire", "meat"], t: 10, out: ["roast"], cat: "cook" },
  { id: "r_bakefish", need: ["=campfire", "fish"], t: 10, out: ["bakedfish"], cat: "cook" },
  { id: "r_friedmush", need: ["=campfire", "mushroom"], t: 8, out: ["friedmush"], cat: "cook" },
  { id: "r_kroast", need: ["=kitchen", "meat"], t: 6, out: ["roast"], cat: "cook" },
  { id: "r_bread", need: ["=kitchen", "wheat", "wheat"], t: 12, out: ["bread"], cat: "cook" },
  { id: "r_pie", need: ["=kitchen", "berry", "berry", "wheat"], t: 14, out: ["pie"], cat: "cook" },
  { id: "r_soup", need: ["=kitchen", "fish", "carrot"], t: 14, out: ["soup"], cat: "cook" },
  { id: "r_stew", need: ["=kitchen", "mushroom", "mushroom", "carrot"], t: 14, out: ["stew"], cat: "cook" },
  { id: "r_carrot", need: ["=field", "carrot", "?@w"], t: 30, out: ["carrot", "carrot"], cat: "farm" },
  { id: "r_wheat", need: ["=field", "wheat", "?@w"], t: 30, out: ["wheat", "wheat"], cat: "farm" },
  { id: "r_regrow", need: ["=field", "berry", "?@w"], t: 34, out: ["bush"], cat: "farm" },
  { id: "r_mushfarm", need: ["=field", "mushroom", "?@w"], t: 34, out: ["mushpatch"], cat: "farm" },
  // разведка
  { id: "x_forest", need: ["@w", "~forest"], t: 12, lo: "forest", cat: "explore" },
  { id: "x_cave", need: ["@w", "~cave"], t: 14, lo: "cave", cat: "explore" },
  { id: "x_shore", need: ["@w", "~shore"], t: 12, lo: "shore", cat: "explore" },
  { id: "x_pass", need: ["@w", "~pass"], t: 15, lo: "pass", cat: "explore" },
  { id: "x_ruins", need: ["@w", "~ruins"], t: 15, lo: "ruins", cat: "explore" },
];
// Подписи рецептов в книге (если нет — берётся имя результата)
export const RNAME = {
  r_apple: "Яблоки сами", r_deadwood: "Сухостой", r_willow: "Ивняк", r_quarry: "Каменоломня: добыча", r_lumber: "Распил", r_breed: "Новый житель",
  r_kroast: "Жаркое на кухне", r_carrot: "Урожай моркови", r_wheat: "Урожай колосьев", r_regrow: "Новый куст", r_mushfarm: "Своя грибница",
  x_forest: "Разведка чащи", x_cave: "Разведка пещеры", x_shore: "Разведка плёса", x_pass: "Разведка перевала", x_ruins: "Разведка руин",
  r_quarryb: "Каменоломня", b_1: "Мост: сваи", b_2: "Мост: опоры", b_3: "Мост: настил", b_4: "Мост: перила и фонари", b_5: "Мост: Арка Очага",
};

// Таблицы разведки: [карта, вес]; "!" — враг (бой); first — гарантия к n-й разведке
export const LOOT = {
  forest: { t: [["wood", 18], ["berry", 14], ["tree", 9], ["bush", 9], ["mushroom", 10], ["grass", 8], ["hive", 4], ["appletree", 2], ["coin", 6], ["!wolf", 9], ["!boar", 3]] },
  cave: { t: [["stone", 20], ["coal", 15], ["ore", 15], ["nugget", 4], ["coin", 6], ["crystal", 2], ["mushpatch", 5], ["!bat", 12], ["!spider", 9]], first: { map: 3 } },
  shore: { t: [["fish", 18], ["clay", 12], ["coin", 14], ["grass", 8], ["fiber", 8], ["willow", 5], ["nugget", 4], ["!frog", 12]] },
  pass: { t: [["ore", 20], ["stone", 14], ["crystal", 10], ["vein", 7], ["meat", 10], ["nugget", 8], ["coin", 6], ["!troll", 6], ["!wolf", 8]] },
  ruins: { t: [["relic", 8], ["bone", 14], ["coin", 18], ["iron", 9], ["deadtree", 6], ["nugget", 5], ["!skeleton", 20], ["!wraith", 9]], first: { relic: 3 } },
};

// Сундуки в лавке
export const PACKS = [
  { k: "pk_forest", n: "Лес", cost: 3, cnt: 3, ic: "tree",
    t: [["tree", 20], ["bush", 14], ["wood", 12], ["berry", 10], ["grass", 13], ["mushpatch", 6], ["appletree", 3], ["hive", 4], ["i_campfire", 7], ["i_rope", 6], ["i_field", 4], ["willow", 4]],
    first: ["grass", "i_campfire", "bush"] },
  { k: "pk_stone", n: "Камень", cost: 3, cnt: 3, ic: "rock",
    t: [["rock", 22], ["stone", 16], ["claypit", 12], ["clay", 10], ["i_brick", 6], ["i_cutstone", 6], ["i_shed", 7], ["i_hammer", 5], ["i_spear", 6]],
    first: ["rock", "i_cutstone", "i_spear"] },
  { k: "pk_farm", n: "Поле", cost: 5, cnt: 3, ic: "carrot", lock: "hut",
    t: [["carrot", 18], ["wheat", 16], ["bush", 9], ["berry", 8], ["mushroom", 6], ["i_field", 10], ["i_hoe", 6], ["i_bread", 6], ["i_pie", 4], ["i_kitchen", 5], ["i_stew", 3], ["villager", 3]],
    first: ["i_field", "carrot", "wheat"] },
  { k: "pk_craft", n: "Ремесло", cost: 6, cnt: 3, ic: "plank", lock: "hut",
    t: [["plank", 9], ["rope", 9], ["brick", 6], ["i_sawmill", 8], ["i_quarry", 6], ["i_smithy", 8], ["i_kitchen", 6], ["i_granary", 7], ["i_fair", 5], ["i_boat", 7], ["i_hammer", 4], ["i_bow", 4], ["i_shed", 4], ["i_iron", 5]],
    first: ["i_boat", "i_smithy", "plank"] },
  { k: "pk_defense", n: "Оборона", cost: 7, cnt: 3, ic: "sword", lock: "day3",
    t: [["i_spear", 7], ["i_bow", 8], ["i_sword", 8], ["i_armor", 7], ["i_palisade", 8], ["i_tower", 7], ["spear", 5], ["hide", 6], ["iron", 4], ["i_smithy", 3], ["i_iron", 5]],
    first: ["i_sword", "i_palisade", "spear"] },
  { k: "pk_explore", n: "Странствия", cost: 6, cnt: 2, ic: "forest", lock: "day2",
    t: [["forest", 22], ["cave", 18], ["i_lantern", 6], ["i_boat", 5], ["villager", 5], ["hive", 5], ["i_soup", 4], ["i_stew", 4], ["coin", 4]],
    first: ["forest", "cave"] },
];
export const PACK_LOCK = { hut: "После первой хижины", day2: "Со 2-го дня", day3: "С 3-го дня" };

// Идеи: карта, которая открывает рецепт в книге
export const IDEAS = {
  i_hut: "r_hut", i_campfire: "r_campfire", i_plank: "r_plank", i_rope: "r_rope", i_field: "r_field", i_shed: "r_shed",
  i_sawmill: "r_sawmill", i_quarry: "r_quarryb", i_smithy: "r_smithy", i_kitchen: "r_kitchen", i_granary: "r_granary",
  i_palisade: "r_palisade", i_tower: "r_tower", i_fair: "r_fair", i_boat: "r_boat", i_spear: "r_spear", i_bow: "r_bow",
  i_hammer: "r_hammer", i_hoe: "r_hoe", i_sword: "r_sword", i_armor: "r_armor", i_lantern: "r_lantern", i_bread: "r_bread",
  i_pie: "r_pie", i_soup: "r_soup", i_stew: "r_stew", i_brick: "r_brick", i_cutstone: "r_cutstone", i_iron: "r_iron", i_darkpath: "r_darkpath",
};
for (const ik in IDEAS) {
  const r = RECIPES.find((x) => x.id === IDEAS[ik]);
  const outk = r.out[0];
  def(ik, { n: "Идея: " + C[outk].n, c: "idea", v: 1, rec: r.id, ico: outk, d: "Открывает рецепт «" + C[outk].n + "» в книге." });
}
export const CARDS = C;
export const KINDS = Object.keys(C);            // индекс вида карты — для компактной передачи по сети
export const KIDX = {}; KINDS.forEach((k, i) => (KIDX[k] = i));

/* ---------- Ремёсла семей (каждый игрок выбирает одно) ---------- */
export const ROLES = {
  forester: { n: "Лесовод", ic: "🌲", d: "Сбор и еда у твоих жителей идут в 1,4 раза быстрее.", cats: ["gather", "food", "farm", "nat"], mult: 1.4 },
  master: { n: "Мастер", ic: "🔨", d: "Ремесло и стройка у твоих жителей идут в 1,4 раза быстрее (и мост тоже).", cats: ["craft", "build", "bridge", "cook"], mult: 1.4 },
  guard: { n: "Страж", ic: "🛡️", d: "Твои жители бьют на 1 сильнее и крепче на 3. Разведка реже кончается засадой.", cats: ["explore"], mult: 1.25 },
  trader: { n: "Купец", ic: "🪙", d: "Сундуки, купленные тобой, на 1 монету дешевле. Продажа твоими руками — +1 монета.", cats: [], mult: 1 },
};
export const ROLE_IDS = Object.keys(ROLES);

/* ---------- Карта мира (единицы — как пиксели карты 78×106) ----------
   x — вправо, y — к игроку (на юг). Посередине течёт река с запада на восток. */
export const RIV = [770, 980];          // река по y
export const REGIONS = {
  home: { n: "Хутор", rects: [[0, 0, 1400, 770], [0, 980, 1400, 1760]] },
  island: { n: "Остров", via: "boat", rects: [[-760, 640, -60, 1110]], start: ["shoal", "shoal", "shore", "claypit", "willow", "grass", "!frog"] },
  mountains: { n: "Горы", via: "trail", rects: [[1460, 0, 2220, 770]], start: ["rock", "rock", "vein", "vein", "crystalvein", "pass", "cave"] },
  haunted: { n: "Гиблая чаща", via: "darkpath", rects: [[1460, 980, 2220, 1760]], start: ["deadtree", "deadtree", "mushpatch", "ruins", "barrow", "!skeleton"] },
};
export const WORLD = { x0: -760, x1: 2220, y0: 0, y1: 1760 };
export const BANKS = { n: [0, 0, 1400, 770], s: [0, 980, 1400, 1760] };   // берег северной и южной семьи
export const SITE_POS = [700, 822];      // место моста (левый-верхний угол карты: x — центр, y — верх)

// Угрозы по дням: на рассвете дня d к хутору приходят враги (поровну с севера и юга)
export const THREATS = {
  3: ["wolf", "wolf"], 5: ["wolf", "wolf", "boar"], 7: ["raider", "raider", "wolf", "wolf"], 9: ["raider", "raider", "boar", "wolf"],
  11: ["tusker", "raider", "raider", "wolf"], 13: ["chief", "raider", "raider", "raider"], 15: ["troll", "raider", "raider", "wolf", "wolf"],
  16: ["boss", "skeleton", "skeleton"], 18: ["chief", "raider", "raider", "tusker", "wolf"],
};
export const BOSS_DAY = 16;
// Угрозы на открытых краях (если там есть жители): раз в несколько дней
export const REGION_THREATS = { island: ["frog", "frog"], mountains: ["wolf", "wolf"], haunted: ["skeleton", "skeleton"] };

// Задания: по порядку (обучение → общие цели)
export const QUESTS = [
  { id: "q_wood", n: "Добудьте бревно", h: "Перетащи жителя на дерево и подожди. Деревья растут на южном берегу." },
  { id: "q_stone", n: "Добудьте камень", h: "Житель на валун. Валуны — на северном берегу." },
  { id: "q_trade", n: "Передайте карту через реку", h: "Перетащи ресурс на другой берег — напарнику. Бревно на север, камень на юг." },
  { id: "q_hut", n: "Постройте хижину", h: "Бревно, камень и житель в одну стопку." },
  { id: "q_pack", n: "Купите сундук", h: "Нажми на сундук в лавке внизу, потом на него на столе." },
  { id: "q_night", n: "Переживите первую ночь", h: "Ночью каждый житель съедает 2 еды. Еда общая: кормят оба берега." },
  { id: "q_fire", n: "Разведите костёр", h: "2 бревна, камень и житель. Идея — в сундуке «Лес»." },
  { id: "q_br1", n: "Мост: заложите сваи", h: "Сложите на место моста 3 бревна, 2 камня и по жителю от каждой семьи." },
  { id: "q_sell", n: "Продайте карту", h: "Перетащи лишнюю карту на «Продать» внизу." },
  { id: "q_kill", n: "Отбейте зверя", h: "Перетащи жителей на врага — бой пойдёт сам. Вдвоём проще." },
  { id: "q_field", n: "Сделайте грядку", h: "Доска, волокно и житель. Положи на неё морковь." },
  { id: "q_pop", n: "Население: 6 жителей", h: "Положи двух своих жителей на хижину — через полминуты будет новый, твой. Один остался? Положи его, напарник добавит своего." },
  { id: "q_br2", n: "Мост: поставьте опоры", h: "2 тёсаных камня, 2 доски и двое из разных семей." },
  { id: "q_arm", n: "Вооружите жителя", h: "Копьё, меч или лук — положи на жителя." },
  { id: "q_store", n: "Сарай или амбар", h: "Место для карт кончается. Амбар строят вдвоём — он вмещает больше." },
  { id: "q_br3", n: "Мост: настелите доски", h: "4 доски, 2 верёвки и двое из разных семей." },
  { id: "q_mount", n: "Найдите путь в Горы", h: "Разведывай пещеру — там лежит карта гор." },
  { id: "q_crystal", n: "Добудьте кристалл", h: "Кристальная жила — в Горах." },
  { id: "q_br4", n: "Мост: перила и фонари", h: "2 железа (кузня), 2 кристалла, 2 доски и двое из разных семей." },
  { id: "q_dark", n: "Откройте Гиблую чащу", h: "Фонарь (кузня: железо + кристалл) на жителя → следопыт. Следопыт + 2 доски." },
  { id: "q_relic", n: "Найдите реликвию", h: "Разведывай руины в Гиблой чаще или одолей стража кургана." },
  { id: "q_win", n: "Мост: Арка Очага", h: "3 тёсаных камня, 2 кирпича, реликвия и двое из разных семей. Это победа!" },
];
export const ENDLESS = [22, 25, 30, 40, 50, 75, 100];

export const DAY_LEN = 105;           // секунд в дне на обычной скорости
export const EAT = 2;                  // еды на жителя за ночь
export const BASE_CAP = 34;            // мест для карт без построек (на двоих)
export const STACK_DY = 24;            // сдвиг карт в стопке
export const COIN_DY = 5;
export const CW = 78, CH = 106;        // размер карты на столе
