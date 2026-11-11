// «Хутор» — звук: только записанные CC0-сэмплы (audio/, см. audio/LICENSE.txt). Грузятся после первого касания.
// Фон: река (громче у воды), птицы днём, сверчки ночью, треск костра рядом с огнём.
const SFX = ["select", "click", "confirm", "error", "whoosh", "chop", "stonehit", "mine", "househit", "build", "upgrade", "heal", "perk", "open", "levelup",
  "magic", "hit", "hit2", "die", "die2", "bone", "hurt", "collapse", "coin", "coin2", "buy", "roar", "roar2", "growl", "gong", "bell", "arrow", "potion", "close"];
const AMB = ["amb_river", "amb_birds", "amb_night", "fire"];
export const SET = { snd: 1, mus: 1 };
try { const o = JSON.parse(localStorage.getItem("o2_set") || "null"); if (o) Object.assign(SET, o); } catch (_) {}
try { if (localStorage.getItem("kg_sound") === "0") SET.snd = 0; } catch (_) {}
export function saveSet() { try { localStorage.setItem("o2_set", JSON.stringify(SET)); localStorage.setItem("kg_sound", SET.snd ? "1" : "0"); } catch (_) {} applyVol(); }
let ac = null, sfxG = null, musG = null, ambG = null, unlocked = false;
const buf = {}, loading = {}, last = {}, amb = {};
function ctx() {
  if (ac) return ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ac.destination);
    sfxG = ac.createGain(); sfxG.connect(comp); musG = ac.createGain(); musG.connect(comp); ambG = ac.createGain(); ambG.connect(comp);
    applyVol();
  } catch (_) { ac = null; }
  return ac;
}
export function applyVol() { if (!ac) return; sfxG.gain.value = SET.snd ? 0.75 : 0; musG.gain.value = SET.snd && SET.mus ? 0.22 : 0; ambG.gain.value = SET.snd ? 0.5 : 0; }
function fetchBuf(name) {
  if (buf[name]) return Promise.resolve(buf[name]);
  if (loading[name]) return loading[name];
  if (!ctx()) return null;
  loading[name] = fetch(`audio/${name}.mp3`).then((r) => r.arrayBuffer()).then((a) => new Promise((res, rej) => ac.decodeAudioData(a, res, rej))).then((b) => { buf[name] = b; return b; }).catch(() => null);
  return loading[name];
}
function unlock() {
  if (unlocked) { if (ac && ac.state === "suspended") ac.resume(); return; }
  if (!ctx()) return;
  unlocked = true; if (ac.state === "suspended") ac.resume();
  SFX.forEach(fetchBuf);
  AMB.forEach((n) => fetchBuf(n).then((b) => startAmb(n, b)));
  if (wantMus) { const w = wantMus; curMus = ""; music(w); }
}
["pointerdown", "touchstart", "keydown"].forEach((e) => addEventListener(e, unlock, { capture: true, passive: true }));
document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });
// play(имя, {vol, rate, gap, delay})
export function play(name, o) {
  if (!ac || !unlocked || !SET.snd) return;
  if (!buf[name]) { fetchBuf(name); return; }
  o = o || {};
  const now = ac.currentTime, gap = o.gap != null ? o.gap : 0.06;
  if (last[name] && now - last[name] < gap) return;
  last[name] = now;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = buf[name]; s.playbackRate.value = (o.rate || 1) * (0.94 + Math.random() * 0.12);
  g.gain.value = o.vol != null ? o.vol : 1;
  s.connect(g); g.connect(sfxG); s.start(now + (o.delay || 0));
}
function startAmb(n, b) {
  if (!b || amb[n]) return;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = b; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(ambG); s.start(ac.currentTime + Math.random() * 0.3);
  amb[n] = { s, g, v: 0 };
}
// уровни фона 0..1 — вызывать каждый кадр (сглаживается)
export function ambience(levels) {
  if (!ac || !unlocked) return;
  const t = ac.currentTime;
  for (const n in levels) { const a = amb[n]; if (!a) continue; const v = Math.max(0, Math.min(1, levels[n])); if (Math.abs(v - a.v) > 0.02) { a.v = v; a.g.gain.setTargetAtTime(v * (n === "fire" ? 0.7 : n === "amb_river" ? 0.8 : 0.55), t, 0.4); } }
}
let cur = null, curMus = "", wantMus = "";
export function music(name) {
  wantMus = name;
  if (!ctx() || !unlocked || curMus === name) return;
  curMus = name;
  const t = ac.currentTime;
  if (cur) { const o = cur; o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(Math.max(0.0001, o.g.gain.value), t); o.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5); setTimeout(() => { try { o.s.stop(); } catch (_) {} }, 1700); cur = null; }
  if (!name) return;
  const p = fetchBuf(name); if (!p) return;
  p.then((b) => {
    if (!b || wantMus !== name) return;
    const g = ac.createGain(), s = ac.createBufferSource();
    s.buffer = b; s.loop = name === "m_build" || name === "m_battle2"; s.connect(g); g.connect(musG);
    const t2 = ac.currentTime; g.gain.setValueAtTime(0.0001, t2); g.gain.exponentialRampToValueAtTime(1, t2 + 2);
    s.start(t2); cur = { s, g };
  });
}
