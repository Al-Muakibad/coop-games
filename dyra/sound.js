/* «Чёрная дыра»: звук. Никаких «пищалок»: только шумовая фоли-синтезация (глухие удары, хруст, шорох, гул)
   плюс несколько записанных CC0-звуков (audio/LICENSE.txt). Window.Foley.
   Выключатель общий с остальными играми (localStorage kg_sound). */
(function () {
  "use strict";
  const KEY = "kg_sound";
  let on = true;
  try { on = localStorage.getItem(KEY) !== "0"; } catch (_) {}
  const SAMPLES = ["stonehit", "househit", "collapse", "heavy", "chop", "mine", "boom2", "hit"];
  let ac = null, master = null, bus = null, amb = null, white = null, brown = null, unlocked = false;
  const buf = {};

  function ctx() {
    if (ac) return ac;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
      comp.connect(ac.destination);
      master = ac.createGain(); master.gain.value = on ? 1 : 0; master.connect(comp);
      bus = ac.createGain(); bus.gain.value = 0.9; bus.connect(master);
      const n = ac.sampleRate * 2;
      white = ac.createBuffer(1, n, ac.sampleRate); brown = ac.createBuffer(1, n, ac.sampleRate);
      const w = white.getChannelData(0), b = brown.getChannelData(0); let last = 0;
      for (let i = 0; i < n; i++) { const x = Math.random() * 2 - 1; w[i] = x; last = (last + 0.02 * x) / 1.02; b[i] = last * 3.5; }
    } catch (_) { ac = null; }
    return ac;
  }
  function unlock() {
    if (!ctx()) return;
    if (ac.state === "suspended") ac.resume();
    if (unlocked) return;
    unlocked = true;
    SAMPLES.forEach((s) => fetch(`audio/${s}.mp3`).then((r) => r.arrayBuffer()).then((a) => new Promise((res, rej) => ac.decodeAudioData(a, res, rej))).then((b) => { buf[s] = b; }).catch(() => {}));
  }
  ["pointerdown", "touchstart", "keydown"].forEach((e) => addEventListener(e, unlock, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend(); else if (on) ac.resume(); });

  const rnd = (a, b) => a + Math.random() * (b - a);
  // ---------- примитивы ----------
  function src(b, t, dur, rate) {
    const s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1;
    s.start(t, Math.random() * (b.duration - dur - 0.05 > 0 ? b.duration - dur - 0.05 : 0)); s.stop(t + dur + 0.05);
    return s;
  }
  function env(t, a, d, vol, out) {   // гейн с атакой a и экспоненциальным спадом d
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); g.connect(out || bus); return g;
  }
  function filt(type, f, q) { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || 0.7; return x; }
  // глухой удар тела (мешок на пол, кулаком по столу): шум через низкий фильтр + совсем низкая «масса» (ниже 110 Гц — не читается как нота)
  function thump(t, f0, f1, dur, vol, lp) {
    const n = src(brown, t, dur * 1.5), f = filt("lowpass", f0 * 4, 1.6);
    f.frequency.setValueAtTime(Math.min(4000, f0 * 4), t); f.frequency.exponentialRampToValueAtTime(Math.max(60, f1 * 2), t + dur);
    const g = env(t, 0.002, dur * 1.3, vol * 1.1); n.connect(f); f.connect(g);
    const o = ac.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(Math.min(110, f0), t); o.frequency.exponentialRampToValueAtTime(Math.min(70, f1 * 0.8), t + dur);
    const og = env(t, 0.003, dur * 0.9, vol * 0.4); o.connect(og); o.start(t); o.stop(t + dur + 0.05);
    const c = src(white, t, 0.02), cf = filt("lowpass", Math.min(6000, (lp || 500) * 4)), cg = env(t, 0.001, 0.018, vol * 0.35);
    c.connect(cf); cf.connect(cg);
  }
  // хруст: рой коротких шумовых крупинок (мнущийся металл, ломающиеся ветки, щебень)
  function crunch(t, dur, vol, lo, hi, grains, out) {
    for (let i = 0; i < grains; i++) {
      const at = t + dur * Math.pow(Math.random(), 1.8), len = rnd(0.004, 0.016), k = 1 - (at - t) / (dur + 0.001);
      const s = src(white, at, len + 0.01), f = filt("bandpass", rnd(lo, hi), rnd(0.8, 3));
      const g = env(at, 0.0015, len, vol * rnd(0.35, 1) * (0.35 + 0.65 * k), out);
      s.connect(f); f.connect(g);
    }
  }
  // шорох/свист: полоса шума с движущимся фильтром
  function whoosh(t, dur, vol, f0, f1, q) {
    const s = src(white, t, dur), f = filt("bandpass", f0, q || 1.1);
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
  }
  // гул обрушения
  function rumble(t, dur, vol, lp) {
    const s = src(brown, t, dur), f = filt("lowpass", lp || 200, 0.9), g = env(t, 0.03, dur, vol);
    s.connect(f); f.connect(g);
  }
  function sample(name, t, vol, rate, lp) {
    const b = buf[name]; if (!b) return false;
    const s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = (rate || 1) * rnd(0.94, 1.06);
    const g = ac.createGain(); g.gain.value = vol;
    if (lp) { const f = filt("lowpass", lp); s.connect(f); f.connect(g); } else s.connect(g);
    g.connect(bus); s.start(t); return true;
  }
  const ready = () => on && ac && unlocked && ac.state === "running";
  let lastSw = 0, burst = 0;

  /* ---------- события игры ---------- */
  // предмет сорвался в дыру. mat — материал, s — размер (м), v — громкость 0..1 (дальность)
  function swallow(mat, s, v) {
    if (!ready() || v < 0.03) return;
    const t = ac.currentTime + 0.005;
    if (t - lastSw < 0.035) { if (++burst > 3) return; } else burst = 0;   // не строчить мелочью
    lastSw = t;
    const big = s > 2.2, mid = s > 1.2;
    if (mat === "soft") { thump(t, rnd(170, 230), 70, 0.09, 0.9 * v, 420); crunch(t, 0.05, 0.25 * v, 500, 1400, 5); sample("hit", t, 0.2 * v, rnd(1.4, 1.6), 1800); }
    else if (mat === "plastic") { thump(t, rnd(260, 320), 120, 0.06, 0.6 * v, 900); crunch(t, 0.06, 0.45 * v, 1500, 4200, 7); sample("stonehit", t, 0.18 * v, 1.7); }
    else if (mat === "leaf") {
      crunch(t, 0.28 + s * 0.12, 0.22 * v, 2500, 7500, 18 + s * 12); crunch(t + 0.02, 0.18, 0.3 * v, 600, 2000, 6);
      if (s > 0.8) { sample("chop", t + 0.03, 0.45 * v, rnd(0.85, 1.0)); thump(t + 0.05, 140, 50, 0.16, 0.45 * v, 380); }
      else thump(t, 200, 80, 0.08, 0.3 * v, 500);
    } else if (mat === "wood") {
      sample("chop", t, (mid ? 0.6 : 0.42) * v, mid ? 0.8 : rnd(1.0, 1.2)); crunch(t, 0.12 + s * 0.1, 0.35 * v, 700, 3200, 10 + s * 10);
      thump(t, mid ? 120 : 180, 55, mid ? 0.18 : 0.1, 0.45 * v, 450);
    } else if (mat === "metal") {
      if (mid) {   // машина/автобус: смятый металл + тяжёлый удар
        sample("househit", t, 0.7 * v, big ? 0.72 : rnd(0.85, 1.0)); sample("heavy", t + 0.03, 0.5 * v, big ? 0.7 : 0.9);
        crunch(t, 0.25 + s * 0.08, 0.38 * v, 900, 5200, 22 + s * 8); thump(t, big ? 90 : 120, 38, big ? 0.35 : 0.24, 0.75 * v, 320);
        if (big) rumble(t, 0.7, 0.35 * v, 160);
      } else { sample("hit", t, 0.32 * v, rnd(1.15, 1.35), 3500); crunch(t, 0.07, 0.25 * v, 1800, 6000, 7); thump(t, 220, 90, 0.07, 0.35 * v, 700); }
    } else {   // камень: дом/фонтан/небоскрёб
      sample("collapse", t, 0.75 * v, s > 4 ? 0.7 : 0.85); sample("mine", t + 0.08, 0.5 * v, 0.8); sample("boom2", t, 0.6 * v, s > 4 ? 0.8 : 1);
      rumble(t, 1.0 + s * 0.25, 0.65 * v, 180); crunch(t, 0.6 + s * 0.1, 0.4 * v, 400, 3000, 40 + s * 6); thump(t, 80, 30, 0.45, 0.9 * v, 260);
    }
  }
  // предмет долетел до дна — глухой удар из глубины
  function land(s, v) {
    if (!ready() || v < 0.05 || s < 0.5) return;
    const t = ac.currentTime + 0.005;
    thump(t, 110 - Math.min(60, s * 12), 32, 0.12 + s * 0.04, Math.min(0.9, 0.2 + s * 0.12) * v, 220);
    if (s > 1.2) { const ok = sample("heavy", t, 0.35 * v, 0.6, 700); if (!ok) rumble(t, 0.3, 0.3 * v, 150); }
  }
  // большой предмет раскачивается на краю — стук
  function rattle(s, v) { if (!ready() || v < 0.08) return; const t = ac.currentTime; crunch(t, 0.12, 0.12 * v, 300, 1500, 4); thump(t, 90, 50, 0.08, 0.18 * v, 300); }
  // дыра проглотила другую дыру
  function gulp(v) {
    if (!ready()) return; const t = ac.currentTime + 0.005;
    whoosh(t, 0.55, 0.6 * v, 2600, 160, 0.9); sample("boom2", t + 0.12, 0.8 * v, 0.9); thump(t + 0.12, 75, 28, 0.5, 0.9 * v, 240); rumble(t + 0.1, 0.9, 0.5 * v);
  }
  function tap() { if (!ready()) return; const t = ac.currentTime; crunch(t, 0.004, 1.2, 1800, 3200, 2); thump(t, 200, 90, 0.03, 0.5, 1200); }
  function knock(hi) { if (!ready()) return; const t = ac.currentTime; const s = src(white, t, 0.05), f = filt("bandpass", hi ? 1300 : 850, 3.5), g = env(t, 0.001, 0.045, 2.2); s.connect(f); f.connect(g); thump(t, 160, 80, 0.06, 0.9, 900); }   // стук костяшкой по дереву
  function go() { if (!ready()) return; whoosh(ac.currentTime, 0.4, 0.4, 400, 3000, 1.2); }
  function win() {   // хлопушка + конфетти
    if (!ready()) return; const t = ac.currentTime + 0.01;
    for (const d of [0, 0.22, 0.4]) { const s = src(white, t + d, 0.03), f = filt("highpass", 900), g = env(t + d, 0.001, 0.03, 0.8); s.connect(f); f.connect(g); thump(t + d, 160, 70, 0.08, 0.5, 600); crunch(t + d + 0.02, 0.9, 0.12, 3500, 9000, 40); }
  }
  function lose() { if (!ready()) return; const t = ac.currentTime + 0.01; whoosh(t, 1.1, 0.35, 1400, 140, 1.4); thump(t + 0.9, 90, 40, 0.3, 0.5, 260); }

  // тихий фон города (низкий гул, как вдалеке) — только во время раунда
  function ambient(want) {
    if (!ac || !unlocked) return;
    if (want && !amb) {
      const s = ac.createBufferSource(); s.buffer = brown; s.loop = true;
      const f = filt("lowpass", 380, 0.5), g = ac.createGain(); g.gain.value = 0.0001;
      s.connect(f); f.connect(g); g.connect(bus); s.start();
      g.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 1.5);
      amb = { s, g };
    } else if (!want && amb) {
      const a = amb; amb = null; a.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.3); setTimeout(() => { try { a.s.stop(); } catch (_) {} }, 1500);
    }
  }
  function toggle() {
    on = !on;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) {}
    if (ctx()) { master.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05); if (on) { unlock(); ac.resume(); } }
    return on;
  }
  window.Foley = { swallow, land, rattle, gulp, tap, knock, go, win, lose, ambient, toggle, unlock, get on() { return on; }, get ready() { return !!(ac && ac.state === "running"); } };
})();
