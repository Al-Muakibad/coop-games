# Кооп-игры

Мини-игры для Telegram-канала [«Кооп с друзьями»](https://t.me/coop_s_druzyami).
Открываются в боте [@hrupkiy_gruz_bot](https://t.me/hrupkiy_gruz_bot) (Main Mini App = корень этого сайта).

| Игра | Папка | Ссылка |
|---|---|---|
| Снайпер: прятки (онлайн 1 на 1) | `sniper/` | t.me/hrupkiy_gruz_bot?startapp=sniper |
| Хрупкий груз | `gruz/` | t.me/hrupkiy_gruz_bot?startapp=gruz |
| Башня | `bashnya/` | t.me/hrupkiy_gruz_bot?startapp=bashnya |
| Дуэль (онлайн 1 на 1) | `duel/` | t.me/hrupkiy_gruz_bot?startapp=duel |
| Футбол машинками (1×1, 2×2, боты) | `futbol/` | t.me/hrupkiy_gruz_bot?startapp=futbol |
| Гонки (до 6, боты, ракеты/масло) | `gonki/` | t.me/hrupkiy_gruz_bot?startapp=gonki |
| Рикошет (танки в лабиринте, до 4) | `rikoshet/` | t.me/hrupkiy_gruz_bot?startapp=rikoshet |
| Бильярд (пул-восьмёрка: бот, онлайн, один телефон) | `bilyard/` | t.me/hrupkiy_gruz_bot?startapp=bilyard |
| Змеиная арена (slither, до 6, боты) | `arena/` | t.me/hrupkiy_gruz_bot?startapp=arena |
| Перестрелка (арена, до 6, боты, команды) | `strelka/` | t.me/hrupkiy_gruz_bot?startapp=strelka |
| Дурак (2–4, с ботами или онлайн) | `durak/` | t.me/hrupkiy_gruz_bot?startapp=durak |
| Шпион (компания 3–8, или один телефон) | `shpion/` | t.me/hrupkiy_gruz_bot?startapp=shpion |

Корневой `index.html` — меню игр и маршрутизация по `startapp=<игра>[-c<очки>x<имя>]`.
Общий код: `shared/tg.js` (Telegram, рекорды, вызов другу), `shared/ui.css`.

Онлайн: `shared/net.js` — комнаты поверх публичного MQTT-брокера (wss://broker.emqx.io, запасные hivemq/mosquitto). Приглашение: `startapp=<игра>-r<комната>`.

Территория (`territoria/`) убрана из меню 25.10.2026: онлайн дёргалась (ходы по клеткам ждут хозяина). Старые ссылки работают.
