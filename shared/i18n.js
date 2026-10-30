/* Перевод «Кооп-игр». Язык берётся из Telegram: СНГ-языки → русский, остальные → английский.
   Переключить вручную: ?lang=en / ?lang=ru (запоминается) или I18N.set("en").
   Как работает: тексты в коде остаются русскими, а этот модуль на лету заменяет их на английские —
   в разметке, в новых элементах и в тексте на канвасе. Словари: общий ниже, свой у игры в <игра>/en.js. */
(function () {
  "use strict";
  const RU = ["ru", "uk", "be", "kk", "uz", "ky", "tg", "az", "hy", "ka", "tk", "mo"];
  const CY = /[А-Яа-яЁё]/;

  function detect() {
    try {
      const q = new URLSearchParams(location.search).get("lang");
      if (q === "en" || q === "ru") { localStorage.setItem("kg_lang", q); return q; }
    } catch (_) {}
    try { const s = localStorage.getItem("kg_lang"); if (s === "en" || s === "ru") return s; } catch (_) {}
    const tg = window.Telegram && window.Telegram.WebApp;
    const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    const code = String((u && u.language_code) || navigator.language || "ru").slice(0, 2).toLowerCase();
    return RU.indexOf(code) >= 0 ? "ru" : "en";
  }

  const lang = detect();
  const D = Object.create(null);
  let re = null, cache = new Map();

  function add(dict) { for (const k in dict) D[k] = dict[k]; re = null; cache = new Map(); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function build() {
    const keys = Object.keys(D).filter((k) => k.length >= 2).sort((a, b) => b.length - a.length);
    re = keys.length ? new RegExp("(^|[^А-Яа-яЁё])(" + keys.map(esc).join("|") + ")(?![А-Яа-яЁё])", "g") : null;
  }
  function t(s) {
    if (lang === "ru" || typeof s !== "string" || !CY.test(s)) return s;
    const hit = cache.get(s); if (hit !== undefined) return hit;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    let out;
    if (D[m[2]] !== undefined) out = m[1] + D[m[2]] + m[3];
    else {
      if (!re) build();
      out = re ? s.replace(re, (all, pre, k) => pre + D[k]).replace(re, (all, pre, k) => pre + D[k]) : s;
    }
    if (cache.size > 3000) cache.clear();
    cache.set(s, out);
    return out;
  }

  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  function doText(n) { const v = n.nodeValue; if (v && CY.test(v)) { const r = t(v); if (r !== v) n.nodeValue = r; } }
  function doAttrs(el) {
    for (const a of ["placeholder", "title", "aria-label", "alt"]) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && CY.test(v)) { const r = t(v); if (r !== v) el.setAttribute(a, r); }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!(root.parentNode && SKIP[root.parentNode.nodeName])) doText(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    doAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && SKIP[n.nodeName] ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }

  if (lang === "en") {
    // Текст на канвасе
    try {
      const P = CanvasRenderingContext2D.prototype;
      ["fillText", "strokeText", "measureText"].forEach((f) => {
        const orig = P[f];
        P[f] = function (txt) { const a = Array.prototype.slice.call(arguments); a[0] = t(String(txt)); return orig.apply(this, a); };
      });
    } catch (_) {}
    const start = () => {
      document.documentElement.lang = "en";
      if (CY.test(document.title)) document.title = t(document.title);
      walk(document.body);
      new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === "characterData") doText(m.target);
          else if (m.type === "attributes") doAttrs(m.target);
          else m.addedNodes.forEach(walk);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
    };
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  }

  function set(l) { try { localStorage.setItem("kg_lang", l); } catch (_) {} location.reload(); }

  // Игры, переведённые полностью (в меню у остальных на английском стоит пометка RU)
  const FULL = ["sniper", "chervi", "durak", "shpion"];
  window.I18N = { lang, t, add, set, FULL };
  window.L = t;

  /* ---------- Общий словарь: меню, лобби, отзывы, приглашения ---------- */
  add({
    "Ты": "You", "(ты)": "(you)", "Друг": "Friend", "Игрок": "Player", "Хозяин": "Host",
    "КООП": "CO-OP", "-ИГРЫ": " GAMES", "Кооп-игры": "Co-op Games",
    "мини-игра": "mini-games", "мини-игры": "mini-games", "мини-игр": "mini-games",
    "прямо в Telegram": "right in Telegram", "мини-игры прямо в Telegram": "mini-games right in Telegram",
    "Назад": "Back", "Выйти": "Leave", "В меню": "Menu", "Отмена": "Cancel", "Закрыть": "Close", "Позже": "Later",
    "Отправить": "Send", "Начинаем…": "Starting…", "Подключаемся": "Connecting", "Подключаемся…": "Connecting…",
    "Подключаемся к серверу": "Connecting to server", "Создаём комнату": "Creating room", "Создаём комнату…": "Creating room…",
    "Позови друга": "Invite a friend", "Позвать друга": "Invite a friend", "👋 Позвать друга": "👋 Invite a friend",
    "Ждём друга": "Waiting for a friend", "в игре!": "joined!", "ждёт тебя!": "is waiting for you!",
    "Тебя позвали в игру": "You've been invited", "📨 Отправить приглашение": "📨 Send invite",
    "Отправь приглашение. Как только друг откроет ссылку — игра начнётся. Не закрывай экран.":
      "Send the invite. The game starts as soon as your friend opens the link. Keep this screen open.",
    "Комната не найдена": "Room not found",
    "Друг уже вышел или закрыл игру. Попроси прислать новое приглашение.": "Your friend left or closed the game. Ask for a new invite.",
    "🤖 Сыграть с ботом": "🤖 Play with a bot", "🤖 С ботом": "🤖 With a bot", "Попробовать снова": "Try again",
    "Нет связи с сервером": "No connection to server", "Проверь интернет и попробуй ещё раз.": "Check your internet and try again.",
    "Заходи в игру!": "Join my game!", "Боты:": "Bots:", "🤖 Бот": "🤖 Bot",
    "Синие": "Blue", "Красные": "Red", "Зелёные": "Green", "Жёлтые": "Yellow",
    "Позови друзей одной ссылкой — заходят сколько угодно до": "Invite friends with one link — up to",
    "Пустые места займут боты.": "Bots fill empty seats.",
    "Ты в комнате. Ждём, пока хозяин начнёт игру.": "You're in the room. Waiting for the host to start.",
    "📨 Пригласить друзей": "📨 Invite friends", "▶ Начать": "▶ Start", "Нужно минимум": "Need at least",
    "игрока — позови друзей": "players — invite friends", "Хозяин комнаты вышел 😕": "The host left 😕", "Хозяин вышел 😕": "The host left 😕",
    "Игра уже началась — попроси новое приглашение": "Game already started — ask for a new invite", "Комната заполнена": "Room is full",
    // отзывы и канал
    "Идея или баг": "Idea or bug", "Идея / баг": "Idea / bug", "💬 Идея / баг": "💬 Idea / bug",
    "Что улучшить, что сломалось, какую игру добавить? Читаю всё.": "What to improve, what broke, which game to add? I read everything.",
    "💡 Идея": "💡 Idea", "🐞 Баг": "🐞 Bug", "🎮 Хочу игру": "🎮 Game request", "Напиши тут…": "Write here…",
    "Спасибо! Получил ✅": "Thanks! Got it ✅", "Понравилось?": "Enjoyed it?",
    "Новые игры для компании выходят каждую неделю. Первым узнаешь в канале «Кооп с друзьями» — там же ищем напарников.":
      "New party games every week. Follow our channel to hear first (posts are in Russian, games are for everyone).",
    "📢 Подписаться на канал": "📢 Follow the channel", "📢 Новые игры — в канале": "📢 New games — channel",
    "Канал с новыми играми": "Channel with new games", "Другие игры": "Other games",
    "Сыграем? Зайди по ссылке — игра прямо в Телеге 🎮": "Let's play? Open the link — the game runs right in Telegram 🎮",
    "Го со мной в мини-игры прямо в Телеге 🎮": "Play mini-games with me right in Telegram 🎮",
    "Го рубиться в мини-игры прямо в Телеге 🎮": "Let's play mini-games right in Telegram 🎮",
    "Твой рекорд:": "Your best:", "Онлайн:": "Online:",
    // меню: вкладки, теги
    "Одна ссылка — и вы в одной игре, каждый со своего телефона": "One link and you're in the same game, each on your own phone",
    "🎉 Компания": "🎉 Party", "🙋 Один": "🙋 Solo", "⚔️ онлайн": "⚔️ online", "🤖 бот": "🤖 bot", "🤖 боты": "🤖 bots",
    "🙋 соло": "🙋 solo", "👥 1 на 1": "👥 1 vs 1", "🚗 2 на 2": "🚗 2 vs 2", "👑 битва": "👑 royale",
    "🏁 до 6": "🏁 up to 6", "🐍 до 6": "🐍 up to 6", "🎉 до 6": "🎉 up to 6", "🎉 до 8": "🎉 up to 8", "💣 до 4": "💣 up to 4",
    "⚔️ до 4": "⚔️ up to 4", "🃏 до 4": "🃏 up to 4", "👥 кооп онлайн": "👥 online co-op", "📱 или на одном": "📱 or one phone",
    "Онлайн 1 на 1: жмёшь «Позвать друга» — он открывает ссылку и вы играете каждый на своём телефоне. Нет друга рядом — есть бот.":
      "Online 1 vs 1: tap “Invite a friend”, they open the link and you play on your own phones. No friend around? There's a bot.",
    "До 6 человек: одна ссылка в общий чат — все заходят в комнату, каждый со своего телефона. Можно командами 2 на 2, 2 на 1… Пустые места займут боты.":
      "Up to 6 people: drop one link in a group chat and everyone joins from their own phone. Teams 2v2, 2v1… Bots fill empty seats.",
    "Играй сам и кидай друзьям вызов на свой рекорд.": "Play solo and challenge friends to beat your score.",
    // меню: игры
    "Хрупкий груз": "Fragile Cargo", "Башня": "Tower", "Дуэль": "Duel", "Снайпер: прятки": "Sniper: Hide & Seek",
    "Морской бой": "Battleship", "Артиллерия": "Artillery", "Змейка": "Snake", "Танчики": "Tanks", "Захват": "Conquest",
    "Толпа": "Crowd", "Объясни слово": "Explain the Word", "Червячки": "Worms", "Шпион": "Spyfall", "Дурак": "Durak",
    "Перестрелка": "Shootout", "Змеиная арена": "Snake Arena", "Футбол машинками": "Car Soccer", "Гонки": "Racing",
    "Рикошет": "Ricochet", "Бильярд": "Pool",
    "60 секунд, кочки и шаткая гора коробок.": "60 seconds, bumps and a wobbly pile of boxes.",
    "Один тап — один этаж. Промахнулся — срезало.": "One tap, one floor. Miss and it gets sliced.",
    "Кто быстрее нажмёт — 5 видов раундов на реакцию.": "Who taps first? 5 kinds of reaction rounds.",
    "Один прячется, другой ищет в прицел. Звания и рейтинг за онлайн-бои.": "One hides, the other hunts through a scope. Ranks and rating for online fights.",
    "Дуэль пушек: угол, сила, ветер. Снаряды роют землю.": "Cannon duel: angle, power, wind. Shells dig the ground.",
    "Классика: расставь флот и топи корабли друга.": "Classic: place your fleet and sink your friend's ships.",
    "Свайпай и сливай плитки. Дойдёшь до 2048?": "Swipe and merge tiles. Can you reach 2048?",
    "Классика: ешь яблоки, расти, не кусай хвост.": "Classic: eat apples, grow, don't bite your tail.",
    "Защити штаб от волн танков. Кирпич ломается, бонусы, уровни.": "Defend your base from waves of tanks. Breakable bricks, power-ups, levels.",
    "Крепости копят армию — веди войска пальцем и захвати всю карту.": "Forts build armies — drag troops with your finger and take the whole map.",
    "Собирай прохожих и переманивай толпы поменьше. У кого больше людей?": "Collect passers-by and steal smaller crowds. Who gets the biggest?",
    "Алиас: объясняй слово, команда угадывает. Слово видно только на твоём телефоне.": "Explain the word, your team guesses. Only you see the word on your phone.",
    "Команды червяков по очереди: базука, граната, динамит. Земля рушится, ветер дует.": "Worm teams take turns: bazooka, grenade, dynamite. Destructible ground, wind.",
    "Все знают, где вы, — кроме шпиона. Вопросы, подозрения и голосование. От 3 человек.": "Everyone knows where you are — except the spy. Questions, suspicion, a vote. 3+ players.",
    "Подкидной на 2–4: с ботами сразу или с друзьями онлайн.": "Classic Russian card game for 2–4: with bots or friends online.",
    "Арена сверху: фраги, команды или королевская битва с зоной. Боты.": "Top-down arena: frags, teams or battle royale with a zone. Bots.",
    "Ешь конфеты, расти и подрезай соперников. До 6 игроков, боты.": "Eat candy, grow and cut off rivals. Up to 6 players, bots.",
    "Гоняй мяч машинкой с ускорением и заносом. 1 на 1 или 2 на 2, боты.": "Push the ball with a boosting, drifting car. 1v1 or 2v2, bots.",
    "Машинки сверху: дрифт, ракеты и масло, 3 круга. До 6 игроков, боты.": "Top-down cars: drift, rockets and oil, 3 laps. Up to 6 players, bots.",
    "Танки в лабиринте: снаряды отскакивают от стен — бей из-за угла.": "Tanks in a maze: shells bounce off walls — shoot around corners.",
    "Пул «восьмёрка»: с ботом, с другом онлайн или вдвоём на одном телефоне.": "8-ball pool: vs bot, a friend online or two on one phone.",
    "🌐 English": "🌐 English", "🌐 Русский": "🌐 Русский"
  });
})();
