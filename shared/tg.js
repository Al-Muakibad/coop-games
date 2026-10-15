/* Общие функции для всех игр «Кооп-игр»: Telegram, рекорды, вызов другу. */
(function () {
  "use strict";
  const BOT = "hrupkiy_gruz_bot";
  const CHANNEL = "https://t.me/coop_s_druzyami";
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined
    ? window.Telegram.WebApp : null;

  function haptic(kind, style) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "impact") tg.HapticFeedback.impactOccurred(style);
      else if (kind === "select") tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.notificationOccurred(style);
    } catch (_) {}
  }

  function b64url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64url(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function playerName() {
    const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    return (u && (u.first_name || u.username)) || "Друг";
  }

  // Вызов передаётся как ?c=c<очки>x<имя в base64url>
  function readChallenge() {
    const p = new URLSearchParams(location.search).get("c");
    if (!p) return null;
    const m = /^c(\d{1,7})x([A-Za-z0-9_-]{0,80})$/.exec(p);
    if (!m) return null;
    let name = "Друг";
    try { name = unb64url(m[2]).slice(0, 24) || "Друг"; } catch (_) {}
    return { score: parseInt(m[1], 10), name };
  }

  function openLink(url) {
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank");
  }
  function gameLink(gameId, param) {
    return `https://t.me/${BOT}?startapp=${gameId}${param ? "-" + param : ""}`;
  }
  function shareChallenge(gameId, score, text) {
    const link = gameLink(gameId, `c${score}x${b64url(playerName().slice(0, 24))}`);
    openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  }
  function shareGame(gameId, text) {
    openLink(`https://t.me/share/url?url=${encodeURIComponent(gameLink(gameId))}&text=${encodeURIComponent(text)}`);
  }
  function openChannel() { openLink(CHANNEL); }

  function loadBest(key, cb) {
    let best = 0;
    try { best = parseInt(localStorage.getItem(key) || "0", 10) || 0; } catch (_) {}
    try {
      if (tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")) {
        tg.CloudStorage.getItem(key, (err, v) => { if (!err && v) best = Math.max(best, parseInt(v, 10) || 0); cb(best); });
        return;
      }
    } catch (_) {}
    cb(best);
  }
  function saveBest(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (_) {}
    try { if (tg && tg.CloudStorage) tg.CloudStorage.setItem(key, String(val)); } catch (_) {}
  }

  // Подготовка окна игры: развернуть, цвета, кнопка «Назад» в меню игр
  function init(opts) {
    opts = opts || {};
    if (!tg) return;
    try {
      tg.ready(); tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (opts.header && tg.setHeaderColor) tg.setHeaderColor(opts.header);
      if (opts.bg && tg.setBackgroundColor) tg.setBackgroundColor(opts.bg);
      if (opts.back && tg.BackButton) {
        tg.BackButton.show();
        tg.BackButton.onClick(() => { location.href = opts.back; });
      }
    } catch (_) {}
  }

  window.TG = { tg, BOT, CHANNEL, haptic, playerName, readChallenge, shareChallenge, shareGame, gameLink,
    openChannel, openLink, loadBest, saveBest, init, b64url };
})();
