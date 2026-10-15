# Кооп-игры

Мини-игры для Telegram-канала [«Кооп с друзьями»](https://t.me/coop_s_druzyami).
Открываются в боте [@hrupkiy_gruz_bot](https://t.me/hrupkiy_gruz_bot) (Main Mini App = корень этого сайта).

| Игра | Папка | Ссылка |
|---|---|---|
| Хрупкий груз | `gruz/` | t.me/hrupkiy_gruz_bot?startapp=gruz |
| Башня | `bashnya/` | t.me/hrupkiy_gruz_bot?startapp=bashnya |
| Дуэль (вдвоём на одном телефоне) | `duel/` | t.me/hrupkiy_gruz_bot?startapp=duel |

Корневой `index.html` — меню игр и маршрутизация по `startapp=<игра>[-c<очки>x<имя>]`.
Общий код: `shared/tg.js` (Telegram, рекорды, вызов другу), `shared/ui.css`.
