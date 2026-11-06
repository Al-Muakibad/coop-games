/* Звук «Шаткой башни» — физическая фоли-озвучка без синтезаторных «пищалок».
   Все звуки собираются в буферы один раз при первом касании:
   — стук дерева/пластика: модальный синтез (затухающие неравномерные моды, как у настоящего бруска) + шумовой щелчок удара;
   — скрип: «прилипание-срыв» (серия микроимпульсов с плавающей частотой) через резонансы деревянного корпуса;
   — обвал: низкий гул (коричневый шум), удар по столу и россыпь мелких стуков;
   — свист броска, «провал» замедления, аплодисменты победителю (шумовые хлопки).
   Плюс короткая комнатная реверберация из сгенерированного отклика. Выключатель общий со всеми играми (kg_sound).
   Foley.knock(сила 0..1, размер, материал, x -1..1, slow) / creak(v) / crash(v) / whoosh() / slowmo() / applause() / click() */
(function () {
  "use strict";
  const KEY = "kg_sound";
  let on = true;
  try { on = localStorage.getItem(KEY) !== "0"; } catch (_) {}
  let ac = null, master = null, dry = null, wet = null, comp = null;
  const B = {};
  let voices = 0;
  const now = () => (ac ? ac.currentTime : 0);

  // ---------- генерация ----------
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const nz = () => rnd() * 2 - 1;
  let SR = 44100;   // частота, с которой синтезируем текущий буфер (для «тяжёлых» звуков — 22050, их и так не слышно выше)
  function buf(len, ch) { return ac.createBuffer(ch || 1, Math.max(1, Math.floor(len * SR)), SR); }
  function norm(d, peak) { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); if (m > 0) { const k = (peak || 0.9) / m; for (let i = 0; i < d.length; i++) d[i] *= k; } }
  // модальный стук: f0 — основная мода, tau — затухание, bright — доля высоких мод, click — сила шумового щелчка
  function modal(d, at, f0, tau, bright, click, gain, ratios) {
    const sr = SR, R = ratios || [1, 2.59, 4.33, 6.1, 8.2, 10.9];
    const start = Math.floor(at * sr);
    for (let k = 0; k < R.length; k++) {
      const f = f0 * R[k] * (1 + nz() * 0.03), a = gain * Math.pow(bright, k) * (k ? 0.75 : 1), tk = tau / (1 + k * 0.85), ph = rnd() * 6.283;
      if (f > sr * 0.45) continue;
      const n = Math.min(d.length - start, Math.floor(tk * 6 * sr)), w = 6.283185 * f / sr, dk = Math.exp(-1 / (tk * sr));
      // затухающая синусоида рекуррентно: без sin/exp на каждый отсчёт
      const c2 = 2 * Math.cos(w);
      let y1 = Math.sin(ph - w), y2 = Math.sin(ph - 2 * w), env = a;
      for (let i = 0; i < n; i++) { const y = c2 * y1 - y2; y2 = y1; y1 = y; d[start + i] += env * y; env *= dk; }
    }
    // щелчок удара: шум с очень быстрым спадом, «продифференцированный» (ярче)
    const cn = Math.min(d.length - start, Math.floor(0.012 * sr));
    let prev = 0;
    for (let i = 0; i < cn; i++) { const v = nz(); d[start + i] += click * gain * (v - prev * 0.6) * Math.exp(-i / (0.0016 * sr)); prev = v; }
    // мягкая атака, чтобы не щёлкало цифрой
    const an = Math.min(24, d.length - start);
    for (let i = 0; i < an; i++) d[start + i] *= i / an;
  }
  function svfNoise(d, at, len, f0, f1, q, env, gain, brown) {
    const sr = SR, s = Math.floor(at * sr), n = Math.min(d.length - s, Math.floor(len * sr));
    let lo = 0, bp = 0, br = 0, F = 0, e = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      if ((i & 31) === 0) { const f = f0 * Math.pow(f1 / f0, t); F = 2 * Math.sin(Math.PI * Math.min(0.24, f / sr)); e = env(t); }
      let x = nz(); if (brown) { br = (br + 0.02 * x) / 1.02; x = br * 3.5; }
      const hi = x - lo - q * bp; bp += F * hi; lo += F * bp;
      d[s + i] += (brown ? lo : bp) * e * gain;
    }
  }
  function build() {
    SR = ac.sampleRate;
    const sr = SR;
    // дерево: несколько брусков разной высоты
    B.wood = [];
    [[230, 0.05], [310, 0.045], [420, 0.04], [560, 0.035], [740, 0.03], [960, 0.026]].forEach(([f, t], i) => {
      const b = buf(0.4), d = b.getChannelData(0);
      modal(d, 0, f, t, 0.62, 0.55, 1);
      modal(d, 0, f * 0.42, 0.022, 0.3, 0, 0.45, [1, 1.9]);   // «тело» бруска — глухой низ
      norm(d, 0.9); B.wood.push(b);
    });
    // пластик (мяч): ярче и короче
    B.plastic = [];
    [1250, 1600].forEach((f) => { const b = buf(0.25), d = b.getChannelData(0); modal(d, 0, f, 0.014, 0.7, 1.1, 1, [1, 2.3, 3.9, 5.6]); norm(d, 0.85); B.plastic.push(b); });
    // резина (колесо): глухой «бум»
    B.rubber = [];
    [120, 165].forEach((f) => { const b = buf(0.3), d = b.getChannelData(0); modal(d, 0, f, 0.03, 0.35, 0.25, 1, [1, 2.1, 3.3]); svfNoise(d, 0, 0.06, 600, 200, 1.2, (t) => Math.exp(-t * 6), 0.4); norm(d, 0.9); B.rubber.push(b); });
    // столешница: низкий плотный стук
    B.table = [];
    [150, 190].forEach((f) => { const b = buf(0.5), d = b.getChannelData(0); modal(d, 0, f, 0.07, 0.55, 0.45, 1, [1, 2.2, 3.7, 5.1, 6.9]); norm(d, 0.95); B.table.push(b); });
    // свист броска
    { const b = buf(0.4), d = b.getChannelData(0); svfNoise(d, 0, 0.38, 500, 1600, 0.7, (t) => Math.sin(Math.PI * t) ** 2, 1); norm(d, 0.6); B.whoosh = b; }
    // отклик комнаты
    {
      const len = 1.1, b = buf(len, 2);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < d.length; i++) { const t = i / sr, k = 0.5 * Math.exp(-t * 7); lp += (nz() - lp) * (0.9 - t * 0.6); d[i] = lp * k; } }
      const conv = ac.createConvolver(); conv.buffer = b; conv.connect(wet);
      B.verb = conv;
    }
    // остальное — по кусочку в отдельных задачах, чтобы не подвесить первое касание
    const later = [buildCreak, buildSlow, buildCrash, buildClap];
    const next = () => { const f = later.shift(); if (!f) return; try { f(); } catch (_) {} setTimeout(next, 30); };
    setTimeout(next, 60);
  }
  function buildCreak() {
    SR = ac.sampleRate; const sr = SR;
    B.creak = [];
    for (let v = 0; v < 3; v++) {
      const len = 0.7 + v * 0.25, b = buf(len + 0.1), d = b.getChannelData(0);
      const fr = [470 + v * 90, 1130 + v * 140, 2050 + v * 200];
      let t = 0.01;
      while (t < len) {
        const x = t / len, env = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 1.5;
        const rate = 18 + 95 * Math.sin(Math.PI * x) * (0.55 + 0.45 * Math.sin(x * (7 + v * 3))) * (1 + nz() * 0.25);
        const s = Math.floor(t * sr), A = env * (0.55 + 0.45 * rnd());
        for (let k = 0; k < 3; k++) {
          const w = 6.283185 * fr[k] * (1 + nz() * 0.01) / sr, tk = [0.0045, 0.003, 0.002][k] * sr, a = A * [1, 0.6, 0.3][k], n = Math.min(d.length - s, Math.floor(tk * 6));
          for (let i = 0; i < n; i++) d[s + i] += a * Math.exp(-i / tk) * Math.sin(w * i);
        }
        t += 1 / Math.max(12, rate);
      }
      svfNoise(d, 0, len, 900, 1400, 0.5, (x) => Math.sin(Math.PI * x) * 0.6, 0.05);
      norm(d, 0.8); B.creak.push(b);
    }
  }
  function buildCrash() {
    SR = 22050;
    // обвал: гул + удар + россыпь стуков
    {
      const len = 2.6, b = buf(len, 2);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        svfNoise(d, 0, len, 240, 90, 0.9, (t) => (t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) * 3.2)), 1.3, true);
        modal(d, 0, 58, 0.25, 0.4, 0.3, 1.1, [1, 1.6, 2.4]);
        let t = 0.02;
        while (t < 1.9) { modal(d, t, 250 + rnd() * 900, 0.02 + rnd() * 0.02, 0.6, 0.5, 0.25 * Math.exp(-t * 1.4) * (0.4 + rnd()), [1, 2.59, 4.33]); t += 0.014 + rnd() * 0.06 * (1 + t * 2); }
        norm(d, 0.95);
      }
      B.crash = b;
    }
    SR = ac.sampleRate;
  }
  function buildSlow() {
    SR = 22050;
    // «провал» в замедление: опускающийся гул
    { const b = buf(1.3), d = b.getChannelData(0); svfNoise(d, 0, 1.25, 1800, 70, 0.6, (t) => (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 2.2)), 1, true); modal(d, 0, 46, 0.45, 0.3, 0, 0.8, [1, 1.5]); norm(d, 0.9); B.slow = b; }
    SR = ac.sampleRate;
  }
  function buildClap() {
    SR = 22050;
    // аплодисменты
    {
      const len = 3.2, b = buf(len, 2);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let p = 0; p < 22; p++) {
          let t = rnd() * 0.25; const per = 0.2 + rnd() * 0.12, f = 900 + rnd() * 1500, g = 0.4 + rnd() * 0.6;
          while (t < len - 0.1) {
            const env = t < 0.3 ? t / 0.3 : t > 1.9 ? Math.max(0, 1 - (t - 1.9) / 1.2) : 1;
            if (env > 0.02) for (let m = 0; m < 3; m++) svfNoise(d, t + m * 0.0013 * rnd(), 0.03, f, f * 0.8, 0.9, (x) => Math.exp(-x * 9), g * env * (m ? 0.5 : 1));
            t += per * (0.85 + rnd() * 0.3);
          }
        }
        norm(d, 0.8);
      }
      B.clap = b;
    }
    SR = ac.sampleRate;
  }

  function ctx() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = on ? 1 : 0;
        comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.knee.value = 10;
        comp.connect(master); master.connect(ac.destination);
        dry = ac.createGain(); dry.gain.value = 0.9; dry.connect(comp);
        wet = ac.createGain(); wet.gain.value = 0.22; wet.connect(comp);
        build();
      } catch (e) { ac = null; }
    }
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
  }
  ["pointerdown", "touchstart", "keydown"].forEach((e) => addEventListener(e, ctx, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", () => { if (ac) { if (document.hidden) ac.suspend(); else if (on) ac.resume(); } });

  function play(b, o) {
    if (!on || !b || !ctx() || voices > 18) return;
    o = o || {};
    const s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = o.rate || 1;
    const g = ac.createGain(); g.gain.value = o.vol == null ? 1 : o.vol;
    let n = s;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; f.Q.value = 0.5; n.connect(f); n = f; }
    n.connect(g); n = g;
    if (o.pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); n.connect(p); n = p; }
    n.connect(dry); if (B.verb) n.connect(B.verb);
    voices++; s.onended = () => { voices--; };
    s.start(now() + (o.delay || 0));
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  const api = {
    get on() { return on; },
    toggle() { on = !on; try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (_) {} if (ctx()) master.gain.setTargetAtTime(on ? 1 : 0, now(), 0.05); if (on) api.click(); return on; },
    // стук: v — сила 0..1, size — размер бруска (м), mat: "wood" | "plastic" | "rubber" | "table"
    knock(v, size, mat, pan, slow) {
      if (!ctx() || v < 0.02) return;
      const set = B[mat] || B.wood;
      let b;
      if (set === B.wood) { const i = Math.max(0, Math.min(5, Math.round(5.4 - size * 2.2 + (Math.random() - 0.5) * 1.6))); b = B.wood[i]; } else b = pick(set);
      const rate = (0.94 + Math.random() * 0.12) * (slow ? 0.55 : 1);
      play(b, { vol: Math.min(1, Math.pow(v, 1.15)) * (mat === "table" ? 1 : 0.85), rate, lp: 700 + 11000 * v * v * (slow ? 0.4 : 1), pan: pan * 0.7 });
    },
    creak(v, slow) { if (ctx()) play(pick(B.creak), { vol: Math.min(0.55, 0.12 + v * 0.45), rate: (0.8 + Math.random() * 0.4) * (slow ? 0.6 : 1), lp: 5000 }); },
    crash(v, slow) { if (ctx()) play(B.crash, { vol: 0.6 + 0.4 * (v || 1), rate: slow ? 0.7 : 1 }); },
    whoosh() { if (ctx()) play(B.whoosh, { vol: 0.35, rate: 0.9 + Math.random() * 0.2 }); },
    slowmo() { if (ctx()) play(B.slow, { vol: 0.9 }); },
    applause() { if (ctx()) play(B.clap, { vol: 0.75 }); },
    click() { if (ctx()) play(B.wood[5], { vol: 0.28, rate: 1.3 + Math.random() * 0.1, lp: 6000 }); }
  };
  window.Foley = api;
})();
