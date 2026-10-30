/* Звук и музыка для всех «Кооп-игр». Всё синтезируется в WebAudio — без файлов, ничего не грузится.
   Само подключается: клики по кнопкам, звуки к вибро-событиям игр (TG.haptic), джингл в конце партии,
   тихая фоновая музыка на экранах меню/лобби/итогов. Выключатель 🔊 — в правом верхнем углу меню.
   Sfx.play("coin" | "hit" | "boom" | "shot" | "win" | "lose" | "click" | "pop" | "whoosh" | "tick"),
   Sfx.on (вкл/выкл всё), Sfx.toggle(). */
(function () {
  "use strict";
  const KEY = "kg_sound";
  let on = true;
  try { on = localStorage.getItem(KEY) !== "0"; } catch (_) {}
  // В «Снайпере» и «Танчиках» свои звуки событий — общие к вибро там не включаем, чтобы не дублировать
  const OWN = /\/(sniper|tanchiki)\//.test(location.pathname);

  let ac = null, master = null, sfxBus = null, musBus = null;
  function ctx() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = on ? 1 : 0; master.connect(ac.destination);
        const comp = ac.createDynamicsCompressor(); comp.connect(master);
        sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(comp);
        musBus = ac.createGain(); musBus.gain.value = 0; musBus.connect(comp);
      } catch (_) { ac = null; }
    }
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
  }
  // iOS/Telegram: звук разрешён только после касания
  ["pointerdown", "touchstart", "keydown"].forEach((e) => addEventListener(e, () => { ctx(); tickMusic(); }, { capture: true, passive: true }));

  function tone(f, t0, dur, type, vol, f2, bus) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || sfxBus); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(t0, dur, vol, from, to, q) {
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = "lowpass"; f.Q.value = q || 0.7;
    f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t0); s.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    click(t) { tone(880, t, 0.05, "triangle", 0.18, 660); },
    tick(t) { tone(1500, t, 0.03, "square", 0.05); },
    pop(t) { tone(420, t, 0.09, "sine", 0.3, 900); },
    coin(t) { tone(988, t, 0.08, "square", 0.12); tone(1319, t + 0.07, 0.22, "square", 0.12); },
    whoosh(t) { noise(t, 0.25, 0.25, 3000, 400, 1.5); },
    shot(t) { noise(t, 0.18, 0.6, 5000, 300); tone(160, t, 0.12, "square", 0.25, 60); },
    hit(t) { tone(220, t, 0.12, "sawtooth", 0.25, 90); noise(t, 0.08, 0.3, 2500, 500); },
    boom(t) { noise(t, 0.6, 0.9, 1800, 60); tone(90, t, 0.45, "sine", 0.6, 35); },
    win(t) { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.35, "triangle", 0.22)); tone(1568, t + 0.44, 0.5, "sine", 0.12); },
    lose(t) { [392, 349, 311, 262].forEach((f, i) => tone(f, t + i * 0.16, 0.32, "triangle", 0.2)); },
    error(t) { tone(180, t, 0.12, "square", 0.15); tone(150, t + 0.12, 0.16, "square", 0.15); },
    warn(t) { tone(660, t, 0.09, "square", 0.1); tone(660, t + 0.13, 0.09, "square", 0.1); }
  };
  const last = {};
  function play(name) {
    if (!on || !SOUNDS[name] || !ctx()) return;
    const now = ac.currentTime;
    if (last[name] && now - last[name] < 0.06) return;   // не строчить одинаковым звуком
    last[name] = now;
    try { SOUNDS[name](now + 0.005); } catch (_) {}
  }

  /* ---------- Фоновая музыка: мягкий лоу-фай луп, генерируется на ходу ---------- */
  const BPM = 92, BEAT = 60 / BPM;
  const CH = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];   // Am7 – Fmaj7 – Cmaj7 – G7
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let musNext = 0, step = 0, musTimer = null, wantMusic = false;
  function schedule() {
    if (!ac || !wantMusic || !on) return;
    while (musNext < ac.currentTime + 0.6) {
      const bar = Math.floor(step / 8) % 4, chord = CH[bar], s = step % 8, t = musNext;
      if (s === 0) chord.forEach((n) => tone(mtof(n), t, BEAT * 3.8, "sine", 0.05, 0, musBus));          // пэд
      if (s === 0 || s === 4) tone(mtof(chord[0] - 12), t, BEAT * 1.6, "triangle", 0.12, 0, musBus);    // бас
      const arp = [0, 2, 1, 3, 2, 1, 3, 2][s];
      tone(mtof(chord[arp] + 12), t, BEAT * 0.9, "triangle", 0.045, 0, musBus);                           // арпеджио
      if (s === 2 || s === 6) noise(t, 0.05, 0.05, 7000, 4000);                                            // шейкер
      musNext += BEAT / 2; step++;
    }
  }
  function setMusic(want) {
    wantMusic = want && on;
    if (!ac) return;
    const g = musBus.gain, t = ac.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(wantMusic ? 0.5 : 0, t + 0.8);
    if (wantMusic && !musTimer) { musNext = Math.max(musNext, t + 0.05); musTimer = setInterval(schedule, 200); }
    if (!wantMusic && musTimer) setTimeout(() => { if (!wantMusic) { clearInterval(musTimer); musTimer = null; } }, 900);
  }
  // Музыка играет, когда открыт экран меню/лобби/итогов, и затихает во время самой игры
  function menuVisible() {
    if (document.querySelector("main .tabs")) return true;                                     // главное меню хаба
    return !!document.querySelector(".screen:not(.hidden), #lobby:not(.hidden), .pt-screen:not(.pt-hidden)");
  }
  function tickMusic() { setMusic(menuVisible()); updBtn(); }

  /* ---------- Кнопка 🔊 и автоматические звуки ---------- */
  let btn = null;
  function updBtn() {
    if (!btn) return;
    const tx = on ? "🔊" : "🔇", d = menuVisible() ? "block" : "none";
    if (btn.textContent !== tx) btn.textContent = tx;
    if (btn.style.display !== d) btn.style.display = d;
  }
  function toggle() {
    on = !on;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) {}
    if (ac) master.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05);
    tickMusic(); if (on) play("click");
    return on;
  }
  const WIN = /Победа|Победили|Ты не дурак|выиграл|Шпиона вычислили|Ты победил|Рекорд|рекорд!|Victory|Winners|not the fool|Spy caught|You win|New best/i;
  const LOSE = /Ты дурак|Проиграл|Поражение|Победил шпион|Тебя нашли|Game over|Игра окончена|You're the fool|The spy wins|lost/i;
  function start() {
    btn = document.createElement("button");
    btn.setAttribute("aria-label", "Звук");
    btn.style.cssText = "position:fixed;z-index:9999;top:calc(10px + env(safe-area-inset-top));right:10px;width:40px;height:40px;border-radius:50%;border:0;background:rgba(0,0,0,.35);color:#fff;font-size:19px;line-height:40px;padding:0;display:none;backdrop-filter:blur(4px)";
    btn.onclick = (e) => { e.stopPropagation(); toggle(); };
    document.body.appendChild(btn);
    // клик по любой кнопке
    document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button, .btn, a.game, .pt-chip"); if (b && b !== btn) play(b.matches("a.game, .primary") ? "pop" : "click"); }, true);
    // итог партии: следим за заголовком экрана конца
    let lastEnd = "";
    new MutationObserver((list) => {
      if (list.every((m) => m.target === btn || m.target.parentNode === btn)) return;
      tickMusic();
      const end = document.querySelector("#screen-end:not(.hidden)");
      if (!end) { lastEnd = ""; return; }
      const title = ((document.getElementById("end-title") || end).textContent || "").trim();
      if (title && title !== lastEnd) { lastEnd = title; play(LOSE.test(title) ? "lose" : WIN.test(title) ? "win" : "coin"); }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"], characterData: true });
    tickMusic();
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  document.addEventListener("visibilitychange", () => { if (ac) { if (document.hidden) ac.suspend(); else if (on) ac.resume(); } });

  // Звуки к вибро-событиям игр
  function fromHaptic(kind, style) {
    if (OWN) return;
    if (kind === "impact") play(style === "heavy" ? "boom" : style === "medium" || style === "rigid" ? "hit" : "tick");
    else if (kind === "select") play("tick");
    else play(style === "success" ? "coin" : style === "error" ? "error" : "warn");
  }

  window.Sfx = { play, toggle, fromHaptic, get on() { return on; } };
})();
