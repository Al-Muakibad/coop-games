/* Форма «Идея / баг». Отправляет отзыв в статистику (событие feedback).
   Feedback.open(game) — открыть форму. Сама добавляет кнопку в #end-buttons, когда там появляются кнопки. */
(function () {
  "use strict";
  const T = window.TG;
  let el = null;
  function ui() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "fb-screen fb-hidden";
    const st = document.createElement("style");
    st.textContent = `.fb-screen{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(43,29,20,.45);font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
      .fb-hidden{display:none!important}.fb-card{width:100%;max-width:380px;background:#fff7ea;color:#2b1d14;border:3px solid #2b1d14;border-radius:22px;box-shadow:0 8px 0 #2b1d14;padding:18px;text-align:center}
      .fb-card h2{margin:6px 0;font-size:24px;font-weight:900}.fb-card .sub{color:#8a7462;font-size:14px;margin:0 0 10px}
      .fb-card .btn{display:block;width:100%;margin-top:10px;padding:12px;border-radius:14px;border:3px solid #2b1d14;background:#fff;font:inherit;font-weight:800;font-size:15px;color:#2b1d14;box-shadow:0 4px 0 #2b1d14}
      .fb-card .btn.primary{background:#ff7a2f;color:#fff}.fb-card .btn.ghost{background:transparent;border-color:transparent;box-shadow:none;color:#d95a12}`;
    document.head.appendChild(st);
    el.innerHTML = `<div class="fb-card">
      <div style="font-size:40px">💬</div><h2>Идея или баг</h2>
      <p class="sub">Что улучшить, что сломалось, какую игру добавить? Читаю всё.</p>
      <div style="display:flex;gap:8px;margin-bottom:8px" data-kinds>
        <button class="btn" data-k="idea" style="margin:0;padding:10px">💡 Идея</button>
        <button class="btn" data-k="bug" style="margin:0;padding:10px">🐞 Баг</button>
        <button class="btn" data-k="game" style="margin:0;padding:10px">🎮 Хочу игру</button>
      </div>
      <textarea data-t rows="5" maxlength="1000" placeholder="Напиши тут…" style="user-select:text;-webkit-user-select:text;touch-action:auto;width:100%;border:3px solid var(--ink);border-radius:12px;padding:10px;font:inherit;font-size:16px;resize:vertical"></textarea>
      <button class="btn primary" data-send>Отправить</button>
      <button class="btn ghost" data-close>Закрыть</button>
      <div data-ok style="display:none;font-weight:800;color:#16a34a;margin-top:8px">Спасибо! Получил ✅</div>
    </div>`;
    document.body.appendChild(el);
    let kind = "idea";
    const paint = () => el.querySelectorAll("[data-k]").forEach((b) => { b.style.background = b.dataset.k === kind ? "#ffd34d" : "#fff"; });
    el.querySelectorAll("[data-k]").forEach((b) => b.onclick = () => { kind = b.dataset.k; paint(); });
    paint();
    el.querySelector("[data-close]").onclick = () => el.classList.add("fb-hidden");
    el.querySelector("[data-send]").onclick = () => {
      const t = el.querySelector("[data-t]"), text = t.value.trim();
      if (text.length < 2) { t.focus(); return; }
      window.Stats && Stats.event("feedback", { kind, text, where: el.dataset.game || "" });
      t.value = ""; el.querySelector("[data-ok]").style.display = "block";
      T && T.haptic("notify", "success");
      setTimeout(() => { el.querySelector("[data-ok]").style.display = "none"; el.classList.add("fb-hidden"); }, 1400);
    };
    return el;
  }
  function open(game) { const u = ui(); u.dataset.game = game || ""; u.classList.remove("fb-hidden"); u.querySelector("[data-t]").focus(); }
  // кнопка в конце игры
  function attach() {
    const box = document.getElementById("end-buttons");
    if (!box) return;
    const add = () => {
      if (!box.children.length || box.querySelector("[data-fb]")) return;
      const b = document.createElement("button"); b.className = "btn ghost"; b.dataset.fb = 1; b.textContent = "💬 Идея / баг";
      b.onclick = () => open(location.pathname.split("/").filter(Boolean).pop());
      box.appendChild(b);
      if (T && T.openChannel) {                       // ссылка на канал с новыми играми
        const c = document.createElement("button"); c.className = "btn ghost"; c.dataset.fb = 1; c.textContent = "📢 Новые игры — в канале";
        c.onclick = () => { window.Stats && Stats.event("channel_click", { where: location.pathname }); T.openChannel(); };
        box.appendChild(c);
      }
    };
    new MutationObserver(add).observe(box, { childList: true });
  }
  window.Feedback = { open };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attach); else attach();
})();
