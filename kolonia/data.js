// «Очаг» — данные: карты, рецепты, наборы, задания, угрозы, края.
// Всё придумано для этой игры (жанр «карточная колония»), названия и рецепты свои.
// Тексты — по-русски, английские — в en.js (shared/i18n.js переводит на лету).

// Категории: цвет рамки и подпись
// c — цвет шапки карты, m — её низ, d — тёмный (подписи), t/t2 — фон окна с картинкой
export const CATS = {
  person: { n: "Житель", c: "#e2a04a", m: "#cf8a36", d: "#94591c", t: "#f5dfb6", t2: "#fff6e2" },
  res: { n: "Ресурс", c: "#b88c5c", m: "#a57849", d: "#6e4d2c", t: "#ead8bb", t2: "#fbf2e2" },
  food: { n: "Еда", c: "#d06d52", m: "#bd5a40", d: "#8c3a26", t: "#f4d6c4", t2: "#fff3ea" },
  nature: { n: "Природа", c: "#7c9d4e", m: "#698a3e", d: "#46652a", t: "#dfe8c4", t2: "#f8faea" },
  place: { n: "Место", c: "#5b958f", m: "#4a827c", d: "#2e5f5a", t: "#d3e6df", t2: "#f3faf6" },
  build: { n: "Постройка", c: "#9a7aa6", m: "#866593", d: "#5b4268", t: "#e7dcea", t2: "#faf6fb" },
  enemy: { n: "Враг", c: "#b8483f", m: "#a13a32", d: "#7a2620", t: "#f0cfc6", t2: "#fdf0eb" },
  idea: { n: "Идея", c: "#d9ab3c", m: "#c4952a", d: "#8a6812", t: "#f6e6b4", t2: "#fffae6" },
  item: { n: "Снаряжение", c: "#8c9a92", m: "#77867e", d: "#4c5953", t: "#dfe5e0", t2: "#f8faf8" },
  coin: { n: "Монета", c: "#e2b448", m: "#cc9c32", d: "#8a6616", t: "#f7e7b8", t2: "#fffbe8" },
  pack: { n: "Набор", c: "#c27598", m: "#ad6083", d: "#7c3a5a", t: "#f1dbe5", t2: "#fdf5f8" },
};

// c — категория, v — цена продажи (null — не продаётся), f — сытость, u — запас использований,
// hp/atk/def/spd — бой (spd — секунд между ударами), cap — +вместимость, tg — метки, d — описание
const C = {};
function def(k, o) { o.k = k; C[k] = o; return o; }

/* ---------- Жители (метка w — может работать) ---------- */
def("villager", { n: "Житель", c: "person", v: null, hp: 7, atk: 1, spd: 1.4, tg: ["w", "plain"], d: "Работает, строит и сражается. Каждую ночь съедает 2 еды." });
def("spearman", { n: "Копейщик", c: "person", v: null, hp: 7, atk: 2, spd: 1.3, tg: ["w", "fighter"], d: "Житель с копьём. Неплох против зверей." });
def("warrior", { n: "Воин", c: "person", v: null, hp: 9, atk: 3, spd: 1.2, tg: ["w", "fighter"], d: "Житель с мечом. Основа обороны." });
def("knight", { n: "Латник", c: "person", v: null, hp: 14, atk: 3, def: 1, spd: 1.2, tg: ["w", "fighter"], d: "Воин в доспехе. Держит удар: каждый удар по нему слабее на 1." });
def("archer", { n: "Лучник", c: "person", v: null, hp: 6, atk: 2, spd: 0.85, tg: ["w", "fighter", "ranged"], d: "Стреляет часто и стоит позади: враги бьют его в последнюю очередь." });
def("builder", { n: "Строитель", c: "person", v: null, hp: 7, atk: 1, spd: 1.4, tg: ["w"], d: "С молотом. Строит вдвое быстрее." });
def("farmer", { n: "Фермер", c: "person", v: null, hp: 7, atk: 1, spd: 1.4, tg: ["w"], d: "С мотыгой. Грядки и сбор еды идут быстрее." });
def("explorer", { n: "Следопыт", c: "person", v: null, hp: 8, atk: 2, spd: 1.2, tg: ["w"], d: "С фонарём. Разведывает вдвое быстрее и реже попадает в засады." });

/* ---------- Ресурсы ---------- */
def("wood", { n: "Бревно", c: "res", v: 1, d: "Из него делают доски, костры и хижины." });
def("stone", { n: "Камень", c: "res", v: 1, d: "Для хижин, костров и тёсаного камня." });
def("plank", { n: "Доска", c: "res", v: 2, d: "Главный строительный материал." });
def("cutstone", { n: "Тёсаный камень", c: "res", v: 3, d: "Прочные постройки и Маяк." });
def("clay", { n: "Глина", c: "res", v: 1, d: "На костре обжигается в кирпич." });
def("brick", { n: "Кирпич", c: "res", v: 3, d: "Для кузни, кухни и склада." });
def("fiber", { n: "Волокно", c: "res", v: 1, d: "Два волокна скручиваются в верёвку." });
def("rope", { n: "Верёвка", c: "res", v: 2, d: "Луки, лодки, частокол." });
def("ore", { n: "Руда", c: "res", v: 2, d: "В кузне с углём даёт железо." });
def("coal", { n: "Уголь", c: "res", v: 1, d: "Бревно, пережжённое на костре." });
def("iron", { n: "Железо", c: "res", v: 4, d: "Мечи, доспехи, фонари." });
def("hide", { n: "Шкура", c: "res", v: 2, d: "Нужна для доспеха." });
def("bone", { n: "Кость", c: "res", v: 1, d: "Остаётся после нежити. Можно продать." });
def("nugget", { n: "Самородок", c: "res", v: 6, d: "Чистое золото. Продай — и купишь пару наборов." });
def("crystal", { n: "Кристалл", c: "res", v: 6, d: "Светится изнутри. Нужен для фонаря и Маяка." });
def("relic", { n: "Реликвия", c: "res", v: 8, d: "Древняя вещь из Гиблого леса. Нужна для Маяка." });
def("map", { n: "Карта гор", c: "res", v: 2, d: "Житель на карту — и откроется путь в Горы." });
def("crown", { n: "Корона князя", c: "res", v: 25, d: "Трофей с Курганного князя." });

/* ---------- Монеты ---------- */
def("coin", { n: "Монета", c: "coin", v: null, d: "Наборы покупаются монетами. Монеты не занимают места." });

/* ---------- Еда (f — сколько сытости) ---------- */
def("berry", { n: "Ягоды", c: "food", v: 1, f: 1, d: "Сытость 1. На грядке вырастает новый куст." });
def("apple", { n: "Яблоко", c: "food", v: 1, f: 1, d: "Сытость 1." });
def("mushroom", { n: "Гриб", c: "food", v: 1, f: 1, d: "Сытость 1. На костре — жареный гриб." });
def("carrot", { n: "Морковь", c: "food", v: 1, f: 1, d: "Сытость 1. На грядке из одной — две." });
def("wheat", { n: "Колос", c: "food", v: 1, f: 0, d: "Сам по себе не кормит. На грядке множится, на кухне — хлеб." });
def("meat", { n: "Сырое мясо", c: "food", v: 1, f: 2, d: "Сытость 2. На костре — жаркое на 5." });
def("fish", { n: "Рыба", c: "food", v: 1, f: 2, d: "Сытость 2. На костре — печёная рыба." });
def("coconut", { n: "Кокос", c: "food", v: 1, f: 2, d: "Сытость 2." });
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
def("claypit", { n: "Глиняный берег", c: "nature", v: 0, u: 4, d: "Житель — глина." });
def("mushpatch", { n: "Грибница", c: "nature", v: 0, u: 4, d: "Житель — гриб." });
def("hive", { n: "Дикий улей", c: "nature", v: 0, u: 3, d: "Житель — мёд. Пчёлы кусаются, но мёд того стоит." });
def("palm", { n: "Пальма", c: "nature", v: 0, u: 4, d: "Житель — кокос." });
def("shoal", { n: "Рыбное место", c: "nature", v: null, d: "Житель ловит рыбу сколько угодно." });
def("vein", { n: "Рудная жила", c: "nature", v: 0, u: 4, d: "Житель — руда." });
def("crystalvein", { n: "Кристальная жила", c: "nature", v: 0, u: 3, d: "Житель — кристалл. Долго." });
def("deadtree", { n: "Сухое дерево", c: "nature", v: 0, u: 3, d: "Житель — бревно, иногда кость." });

/* ---------- Места (разведка: житель на место) ---------- */
def("forest", { n: "Чаща", c: "place", v: 0, u: 8, d: "Отправь жителя на разведку: дерево, ягоды, грибы… или зверь." });
def("cave", { n: "Пещера", c: "place", v: 0, u: 10, d: "Камень, уголь, руда — и карта гор. В темноте водятся мыши и пауки." });
def("shore", { n: "Берег", c: "place", v: 0, u: 10, d: "Рыба, кокосы, ракушки на продажу. Бывают крабы." });
def("pass", { n: "Перевал", c: "place", v: 0, u: 10, d: "Руда, кристаллы, золото. И горный тролль." });
def("ruins", { n: "Руины", c: "place", v: 0, u: 10, d: "Реликвии и монеты. Нежить не любит гостей." });
def("barrow", { n: "Курган", c: "place", v: null, d: "Здесь спит Курганный князь. Брось на курган бойцов — начнётся бой." });

/* ---------- Постройки ---------- */
def("hut", { n: "Хижина", c: "build", v: 2, cap: 2, d: "Положи на хижину двух жителей — через полминуты появится третий (раз в день на хижину). Остался один житель? Утром придёт странник. +2 к месту." });
def("campfire", { n: "Костёр", c: "build", v: 1, d: "Жарит мясо, рыбу, грибы. Обжигает глину, пережигает бревно в уголь." });
def("field", { n: "Грядка", c: "build", v: 2, d: "Положи морковь или колос — вырастет вдвое больше. Ягоды — новый куст. Житель ускоряет." });
def("shed", { n: "Сарай", c: "build", v: 2, cap: 6, d: "+6 к месту для карт." });
def("warehouse", { n: "Склад", c: "build", v: 4, cap: 14, d: "+14 к месту для карт." });
def("sawmill", { n: "Лесопилка", c: "build", v: 3, d: "Житель + бревно — сразу две доски." });
def("quarry", { n: "Каменоломня", c: "build", v: 3, d: "Житель добывает камень без конца, изредка — руду." });
def("smithy", { n: "Кузня", c: "build", v: 4, d: "Железо из руды и угля. Мечи, доспехи, фонари." });
def("kitchen", { n: "Кухня", c: "build", v: 4, d: "Хлеб, пироги, уха и похлёбка — сытнее всего." });
def("palisade", { n: "Частокол", c: "build", v: 2, d: "Враги, пришедшие в долину, слабее на четверть (до двух частоколов)." });
def("tower", { n: "Сторожевая башня", c: "build", v: 4, d: "Сама стреляет по врагам рядом." });
def("market", { n: "Рынок", c: "build", v: 4, d: "Каждая проданная карта приносит +1 монету. Утром — 2 монеты торговли." });
def("boat", { n: "Лодка", c: "build", v: 3, d: "Открывает путь на Остров." });
def("beacon", { n: "Маяк Очага", c: "build", v: null, d: "Свет, который видно со всех краёв. Цель зажжена!" });
def("trail", { n: "Горная тропа", c: "build", v: null, d: "Путь в Горы открыт." });
def("darkpath", { n: "Тёмная тропа", c: "build", v: null, d: "Путь в Гиблый лес открыт." });

/* ---------- Снаряжение ---------- */
def("spear", { n: "Копьё", c: "item", v: 2, d: "Положи на жителя — станет копейщиком." });
def("sword", { n: "Меч", c: "item", v: 4, d: "Положи на жителя — станет воином." });
def("bow", { n: "Лук", c: "item", v: 3, d: "Положи на жителя — станет лучником." });
def("armor", { n: "Доспех", c: "item", v: 4, d: "Положи на воина — станет латником." });
def("hammer", { n: "Молот", c: "item", v: 2, d: "Положи на жителя — станет строителем." });
def("hoe", { n: "Мотыга", c: "item", v: 2, d: "Положи на жителя — станет фермером." });
def("lantern", { n: "Фонарь", c: "item", v: 4, d: "Положи на жителя — станет следопытом." });

/* ---------- Враги (lo — добыча) ---------- */
def("wolf", { n: "Волк", c: "enemy", hp: 4, atk: 1, spd: 1.3, sp: 26, lo: [["meat"], ["hide", 0.5]], d: "Голодный и быстрый." });
def("boar", { n: "Кабан", c: "enemy", hp: 8, atk: 2, spd: 1.6, sp: 18, lo: [["meat"], ["meat"]], d: "Крепкий. Зато мяса много." });
def("bat", { n: "Летучая мышь", c: "enemy", hp: 3, atk: 1, spd: 1.0, sp: 30, lo: [["coin", 0.5]], d: "Мелкая и вредная." });
def("spider", { n: "Пещерный паук", c: "enemy", hp: 6, atk: 2, spd: 1.4, sp: 22, lo: [["fiber"], ["fiber"]], d: "После него остаётся паутина-волокно." });
def("raider", { n: "Разбойник", c: "enemy", hp: 7, atk: 2, spd: 1.4, sp: 20, lo: [["coin"], ["coin"], ["coin", 0.5]], d: "Пришёл за чужим добром." });
def("chief", { n: "Атаман", c: "enemy", hp: 18, atk: 3, spd: 1.4, def: 1, sp: 16, lo: [["coin"], ["coin"], ["coin"], ["coin"], ["iron"]], d: "Главарь разбойников. Удары по нему слабее на 1." });
def("bear", { n: "Медведь", c: "enemy", hp: 16, atk: 3, spd: 1.8, sp: 15, lo: [["meat"], ["meat"], ["meat"], ["hide"], ["hide"]], d: "Медленный, но бьёт тяжело." });
def("crab", { n: "Краб", c: "enemy", hp: 4, atk: 1, spd: 1.2, sp: 18, lo: [["meat"]], d: "Щиплется." });
def("skeleton", { n: "Скелет", c: "enemy", hp: 7, atk: 2, spd: 1.4, sp: 18, lo: [["bone"], ["coin", 0.5]], d: "Гремит костями." });
def("wraith", { n: "Призрак", c: "enemy", hp: 10, atk: 3, spd: 1.2, sp: 24, lo: [["coin"], ["relic", 0.35]], d: "Холодный и злой." });
def("troll", { n: "Горный тролль", c: "enemy", hp: 22, atk: 4, spd: 2.0, sp: 12, lo: [["stone"], ["stone"], ["crystal"], ["nugget", 0.5]], d: "Огромный. Нужна целая дружина." });
def("boss", { n: "Курганный князь", c: "enemy", hp: 64, atk: 5, spd: 1.5, def: 1, sp: 9, boss: 1, lo: [["crown"], ["relic"], ["nugget"], ["nugget"]], d: "Древний князь из кургана. Победи его — и край будет свободен." });

/* ---------- Наборы (покупаются, лежат на столе, открываются тапом) ---------- */
def("pk_forest", { n: "Набор «Лес»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_stone", { n: "Набор «Камень»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_farm", { n: "Набор «Поле»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_craft", { n: "Набор «Ремесло»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_defense", { n: "Набор «Оборона»", c: "pack", v: null, d: "Нажми, чтобы открыть." });
def("pk_explore", { n: "Набор «Странствия»", c: "pack", v: null, d: "Нажми, чтобы открыть." });

/* ---------- Рецепты ----------
   need: список. "wood" — расходуется; "=hut" — остаётся; "~tree" — остаётся, тратит одно использование;
   "@w" — любой работник (остаётся); "?@w" — работник по желанию (ускоряет).
   t — секунды, out — что выпадает (или lo — таблица разведки), cat — для ускорения ролями. */
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
  { id: "r_coconut", need: ["@w", "~palm"], t: 9, out: ["coconut"], cat: "food" },
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
  { id: "r_warehouse", need: ["@w", "plank", "plank", "cutstone", "brick"], t: 24, out: ["warehouse"], cat: "build" },
  { id: "r_palisade", need: ["@w", "wood", "wood", "wood", "rope"], t: 14, out: ["palisade"], cat: "build" },
  { id: "r_tower", need: ["@w", "cutstone", "cutstone", "plank"], t: 24, out: ["tower"], cat: "build" },
  { id: "r_market", need: ["@w", "plank", "brick", "rope"], t: 20, out: ["market"], cat: "build" },
  { id: "r_boat", need: ["@w", "plank", "plank", "rope"], t: 20, out: ["boat"], cat: "build" },
  { id: "r_trail", need: ["@w", "map"], t: 4, out: ["trail"], cat: "build" },
  { id: "r_darkpath", need: ["=explorer", "plank", "plank"], t: 10, out: ["darkpath"], cat: "build" },
  { id: "r_beacon", need: ["@w", "cutstone", "cutstone", "crystal", "relic"], t: 45, out: ["beacon"], cat: "build" },
  { id: "r_breed", need: ["=hut", "@w", "@w"], t: 36, out: ["villager"], cat: "breed" },
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
  r_apple: "Яблоки сами", r_deadwood: "Сухостой", r_quarry: "Каменоломня: добыча", r_lumber: "Распил", r_breed: "Новый житель",
  r_kroast: "Жаркое на кухне", r_carrot: "Урожай моркови", r_wheat: "Урожай колосьев", r_regrow: "Новый куст", r_mushfarm: "Своя грибница",
  x_forest: "Разведка чащи", x_cave: "Разведка пещеры", x_shore: "Разведка берега", x_pass: "Разведка перевала", x_ruins: "Разведка руин",
  r_quarryb: "Каменоломня",
};

// Таблицы разведки: [карта, вес]; "!" — враг (бой); first — гарантия к n-й разведке
export const LOOT = {
  forest: { t: [["wood", 18], ["berry", 14], ["tree", 9], ["bush", 9], ["mushroom", 10], ["grass", 8], ["hive", 4], ["appletree", 2], ["coin", 6], ["!wolf", 9], ["!boar", 3]] },
  cave: { t: [["stone", 20], ["coal", 15], ["ore", 15], ["nugget", 4], ["coin", 6], ["crystal", 4], ["mushpatch", 5], ["!bat", 12], ["!spider", 9]], first: { map: 3 } },
  shore: { t: [["fish", 18], ["coconut", 14], ["coin", 14], ["clay", 8], ["palm", 7], ["fiber", 8], ["nugget", 4], ["!crab", 12]] },
  pass: { t: [["ore", 20], ["stone", 14], ["crystal", 10], ["vein", 7], ["meat", 10], ["nugget", 8], ["coin", 6], ["!troll", 7], ["!wolf", 8]] },
  ruins: { t: [["relic", 8], ["bone", 14], ["coin", 18], ["iron", 9], ["deadtree", 6], ["nugget", 5], ["!skeleton", 20], ["!wraith", 9]], first: { relic: 2 } },
};

// Наборы магазина
export const PACKS = [
  { k: "pk_forest", n: "Лес", cost: 3, cnt: 3, ic: "tree",
    t: [["tree", 20], ["bush", 14], ["wood", 12], ["berry", 10], ["grass", 13], ["mushpatch", 6], ["appletree", 3], ["hive", 4], ["i_campfire", 7], ["i_plank", 6], ["i_rope", 6], ["i_field", 4]],
    first: ["grass", "i_campfire", "bush"] },
  { k: "pk_stone", n: "Камень", cost: 3, cnt: 3, ic: "rock",
    t: [["rock", 22], ["stone", 16], ["claypit", 12], ["clay", 10], ["i_brick", 6], ["i_cutstone", 6], ["i_shed", 7], ["i_hammer", 5], ["i_spear", 6]],
    first: ["rock", "claypit", "i_spear"] },
  { k: "pk_farm", n: "Поле", cost: 5, cnt: 3, ic: "carrot", lock: "hut",
    t: [["carrot", 18], ["wheat", 16], ["bush", 9], ["berry", 8], ["mushroom", 6], ["i_field", 10], ["i_hoe", 6], ["i_bread", 6], ["i_pie", 4], ["i_kitchen", 5], ["i_stew", 3], ["villager", 3]],
    first: ["i_field", "carrot", "wheat"] },
  { k: "pk_craft", n: "Ремесло", cost: 6, cnt: 3, ic: "plank", lock: "hut",
    t: [["plank", 9], ["rope", 9], ["brick", 6], ["i_sawmill", 8], ["i_quarry", 6], ["i_smithy", 8], ["i_kitchen", 6], ["i_warehouse", 7], ["i_market", 5], ["i_boat", 7], ["i_hammer", 4], ["i_bow", 4], ["i_shed", 4], ["i_iron", 5]],
    first: ["i_boat", "i_smithy", "plank"] },
  { k: "pk_defense", n: "Оборона", cost: 7, cnt: 3, ic: "sword", lock: "day3",
    t: [["i_spear", 7], ["i_bow", 8], ["i_sword", 8], ["i_armor", 7], ["i_palisade", 8], ["i_tower", 7], ["spear", 5], ["hide", 6], ["iron", 4], ["i_smithy", 3], ["i_iron", 5]],
    first: ["i_sword", "i_palisade", "spear"] },
  { k: "pk_explore", n: "Странствия", cost: 6, cnt: 2, ic: "forest", lock: "day2",
    t: [["forest", 22], ["cave", 18], ["i_lantern", 7], ["i_darkpath", 4], ["i_boat", 5], ["villager", 5], ["hive", 5], ["i_soup", 4], ["i_stew", 4], ["coin", 4]],
    first: ["forest", "cave"] },
];
export const PACK_LOCK = { hut: "После первой хижины", day2: "Со 2-го дня", day3: "С 3-го дня" };

// Идеи: карта, которая открывает рецепт в книге
export const IDEAS = {
  i_hut: "r_hut", i_campfire: "r_campfire", i_plank: "r_plank", i_rope: "r_rope", i_field: "r_field", i_shed: "r_shed",
  i_sawmill: "r_sawmill", i_quarry: "r_quarryb", i_smithy: "r_smithy", i_kitchen: "r_kitchen", i_warehouse: "r_warehouse",
  i_palisade: "r_palisade", i_tower: "r_tower", i_market: "r_market", i_boat: "r_boat", i_spear: "r_spear", i_bow: "r_bow",
  i_hammer: "r_hammer", i_hoe: "r_hoe", i_sword: "r_sword", i_armor: "r_armor", i_lantern: "r_lantern", i_bread: "r_bread",
  i_pie: "r_pie", i_soup: "r_soup", i_stew: "r_stew", i_brick: "r_brick", i_cutstone: "r_cutstone", i_iron: "r_iron",
  i_beacon: "r_beacon", i_darkpath: "r_darkpath",
};
for (const ik in IDEAS) {
  const r = RECIPES.find((x) => x.id === IDEAS[ik]);
  const outk = r.out[0];
  def(ik, { n: "Идея: " + C[outk].n, c: "idea", v: 1, rec: r.id, ico: outk, d: "Открывает рецепт «" + C[outk].n + "» в книге." });
}
export const CARDS = C;

// Края (отдельные столы)
export const BIOMES = {
  home: { n: "Долина", w: 1500, h: 1700, bg: ["#8fab5e", "#86a256"], start: [] },
  island: { n: "Остров", w: 1300, h: 1400, bg: ["#e2c993", "#d6ba7f"], via: "boat",
    start: ["palm", "palm", "shoal", "shore", "claypit", "grass", "!crab"] },
  mountains: { n: "Горы", w: 1300, h: 1500, bg: ["#a7a298", "#9a958b"], via: "trail",
    start: ["rock", "rock", "vein", "vein", "crystalvein", "pass", "cave", "i_darkpath"] },
  haunted: { n: "Гиблый лес", w: 1300, h: 1500, bg: ["#5c6650", "#525c47"], via: "darkpath",
    start: ["deadtree", "deadtree", "mushpatch", "ruins", "barrow", "i_beacon", "!skeleton"] },
};

// Угрозы по дням: на рассвете дня d в долину приходят враги
export const THREATS = {
  3: ["wolf"], 5: ["wolf", "wolf"], 7: ["raider", "wolf"], 9: ["raider", "raider"], 11: ["bear", "wolf"], 13: ["raider", "raider", "chief"],
  15: ["bear", "wolf", "wolf"], 16: ["raider", "raider", "raider", "chief"], 18: ["boss", "skeleton", "skeleton"],
};
// Предупреждение за день
export const BOSS_DAY = 18;
// Угрозы на открытых краях: раз в несколько дней
export const BIOME_THREATS = { island: ["crab", "crab"], mountains: ["wolf", "wolf"], haunted: ["skeleton", "skeleton"] };

// Задания: по порядку (обучение → цели). chk(G) — выполнено ли
export const QUESTS = [
  { id: "q_wood", n: "Добудь бревно", h: "Перетащи жителя на дерево и подожди." },
  { id: "q_stone", n: "Добудь камень", h: "Житель на валун." },
  { id: "q_berry", n: "Собери ягоды", h: "Житель на ягодный куст. Еда нужна к ночи!" },
  { id: "q_hut", n: "Построй хижину", h: "Сложи в одну стопку бревно, камень и жителя." },
  { id: "q_sell", n: "Продай карту", h: "Перетащи лишнюю карту на «Продать» внизу." },
  { id: "q_pack", n: "Купи набор", h: "Нажми на набор внизу, потом на него на столе." },
  { id: "q_night", n: "Переживи первую ночь", h: "В конце дня каждый житель съедает 2 еды. Голодный — погибает." },
  { id: "q_fire", n: "Разведи костёр", h: "2 бревна, камень и житель. Идея — в наборе «Лес»." },
  { id: "q_cook", n: "Приготовь еду", h: "Мясо, рыбу или гриб — на костёр. Готовая еда сытнее." },
  { id: "q_field", n: "Сделай грядку", h: "Доска, волокно и житель. Положи на неё морковь." },
  { id: "q_kill", n: "Победи зверя", h: "Перетащи жителей на врага — бой пойдёт сам." },
  { id: "q_pop", n: "Население: 4 жителя", h: "Два жителя в хижине — к утру будет новый." },
  { id: "q_arm", n: "Вооружи жителя", h: "Копьё, меч или лук — положи на жителя." },
  { id: "q_store", n: "Построй сарай или склад", h: "Место для карт кончается — карты сверх лимита придётся продать." },
  { id: "q_island", n: "Доплыви до Острова", h: "Построй лодку: 2 доски, верёвка и житель. Идея — в «Ремесле»." },
  { id: "q_mount", n: "Найди путь в Горы", h: "Разведывай пещеру — там лежит карта гор." },
  { id: "q_crystal", n: "Добудь кристалл", h: "Кристальная жила в Горах." },
  { id: "q_dark", n: "Открой Гиблый лес", h: "Фонарь (кузня: железо + кристалл) на жителя → следопыт. Следопыт + 2 доски." },
  { id: "q_relic", n: "Найди реликвию", h: "Разведывай руины в Гиблом лесу." },
  { id: "q_win", n: "Зажги Маяк или победи князя", h: "Маяк: 2 тёсаных камня, кристалл, реликвия и житель. Или собери дружину на Курган." },
];
export const ENDLESS = [25, 30, 40, 50, 75, 100];

export const DAY_LEN = 100;          // секунд в дне на обычной скорости
export const EAT = 2;                 // еды на жителя за ночь
export const BASE_CAP = 20;           // мест для карт без построек
export const STACK_DY = 24;           // сдвиг карт в стопке
export const COIN_DY = 5;
export const CW = 78, CH = 106;       // размер карты на столе
