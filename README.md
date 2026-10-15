# Кооп-игры

Мини-игры для Telegram-канала [«Кооп с друзьями»](https://t.me/coop_s_druzyami).
Открываются в боте [@hrupkiy_gruz_bot](https://t.me/hrupkiy_gruz_bot) (Main Mini App = корень этого сайта).

| Игра | Папка | Ссылка |
|---|---|---|
| Снайпер: прятки (онлайн 1 на 1) | `sniper/` | t.me/hrupkiy_gruz_bot?startapp=sniper |
| Хрупкий груз | `gruz/` | t.me/hrupkiy_gruz_bot?startapp=gruz |
| Башня | `bashnya/` | t.me/hrupkiy_gruz_bot?startapp=bashnya |
| Дуэль (онлайн 1 на 1) | `duel/` | t.me/hrupkiy_gruz_bot?startapp=duel |

Корневой `index.html` — меню игр и маршрутизация по `startapp=<игра>[-c<очки>x<имя>]`.
Общий код: `shared/tg.js` (Telegram, рекорды, вызов другу), `shared/ui.css`.

Онлайн: `shared/net.js` — комнаты поверх публичного MQTT-брокера (wss://broker.emqx.io, запасные hivemq/mosquitto). Приглашение: `startapp=<игра>-r<комната>`.
