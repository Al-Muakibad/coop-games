/* Реклама Adsgram между партиями — только для игроков не из СНГ (русскоязычных оставляем под прямую рекламу).
   Пока BLOCK_ID пустой, модуль ничего не делает. Чтобы включить: зарегистрироваться на partner.adsgram.ai,
   добавить мини-приложение @hrupkiy_gruz_bot, создать блок «Interstitial» и вписать его номер ниже.
   Правила показа: не раньше 2-й законченной партии, не чаще раза в 3 минуты, только на экране итогов. */
(function () {
  "use strict";
  const BLOCK_ID = "";                 // ← номер блока Interstitial из partner.adsgram.ai
  const ONLY_FOREIGN = true;           // русскоязычным рекламу Adsgram не показываем
  const COOLDOWN = 3 * 60 * 1000, MIN_GAMES = 2;

  if (!BLOCK_ID) return;
  if (ONLY_FOREIGN && (!window.I18N || I18N.lang === "ru")) return;

  let ctrl = null, games = 0, lastShow = 0, lastEnd = "";
  try { lastShow = parseInt(sessionStorage.getItem("kg_ad_last") || "0", 10) || 0; games = parseInt(sessionStorage.getItem("kg_ad_games") || "0", 10) || 0; } catch (_) {}

  const s = document.createElement("script");
  s.src = "https://sad.adsgram.ai/js/sad.min.js"; s.async = true;
  s.onload = () => { try { ctrl = window.Adsgram.init({ blockId: BLOCK_ID }); } catch (_) {} };
  document.head.appendChild(s);

  function onEnd() {
    games++;
    try { sessionStorage.setItem("kg_ad_games", String(games)); } catch (_) {}
    if (!ctrl || games < MIN_GAMES || Date.now() - lastShow < COOLDOWN) return;
    lastShow = Date.now();
    try { sessionStorage.setItem("kg_ad_last", String(lastShow)); } catch (_) {}
    window.Stats && Stats.event("ad_show", {});
    setTimeout(() => {   // дать игроку увидеть результат
      ctrl.show().then((r) => window.Stats && Stats.event("ad_done", { done: !!(r && r.done) }))
        .catch((r) => window.Stats && Stats.event("ad_fail", { d: r && r.description }));
    }, 1200);
  }
  const start = () => new MutationObserver(() => {
    const end = document.querySelector("#screen-end:not(.hidden)");
    const title = end ? ((document.getElementById("end-title") || end).textContent || "").trim() : "";
    if (title && title !== lastEnd) onEnd();
    lastEnd = title;
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
