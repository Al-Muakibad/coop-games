// Звук «Отряда»: записанные CC0-сэмплы (папка audio/, см. audio/LICENSE.txt). Грузятся лениво после первого касания.
import { S } from "./save.js";

const SFX = ["click", "select", "confirm", "error", "coin", "coin2", "buy", "upgrade", "levelup", "perk", "hit", "hit2", "bone", "die", "die2",
  "blade", "whoosh", "chop", "heavy", "stonehit", "househit", "cannon", "boom", "boom2", "gong", "roar", "roar2", "collapse", "arrow", "bell", "xbow", "open", "close", "hurt", "magic", "heal", "potion"];
let ac = null, sfxG = null, musG = null;
const buf = {}, loading = {}, last = {};
let unlocked = false;
function ctx() {
  if (ac) return ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4; comp.connect(ac.destination);
    sfxG = ac.createGain(); sfxG.connect(comp);
    musG = ac.createGain(); musG.connect(comp);
    applyVol();
  } catch (_) { ac = null; }
  return ac;
}
export function applyVol() { if (!ac) return; sfxG.gain.value = S.set.snd ? 0.8 : 0; musG.gain.value = S.set.mus && S.set.snd ? 0.32 : 0; }
function fetchBuf(name) {
  if (buf[name] || loading[name]) return loading[name];
  if (!ctx()) return null;
  loading[name] = fetch(`audio/${name}.mp3`).then((r) => r.arrayBuffer()).then((a) => new Promise((res, rej) => ac.decodeAudioData(a, res, rej))).then((b) => { buf[name] = b; return b; }).catch(() => null);
  return loading[name];
}
export function unlock() {
  if (unlocked) { if (ac && ac.state === "suspended") ac.resume(); return; }
  if (!ctx()) return;
  unlocked = true; if (ac.state === "suspended") ac.resume();
  SFX.forEach(fetchBuf);
  if (wantMus) { const w = wantMus; curMus = ""; music(w); }
}
["pointerdown", "touchstart", "keydown"].forEach((e) => addEventListener(e, unlock, { capture: true, passive: true }));
document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });

// play(name, {vol, rate, gap})
export function play(name, o) {
  if (!ac || !unlocked || !S.set.snd) return;
  if (!buf[name]) { fetchBuf(name); return; }
  o = o || {};
  const now = ac.currentTime, gap = o.gap != null ? o.gap : 0.05;
  if (last[name] && now - last[name] < gap) return;
  last[name] = now;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = buf[name]; s.playbackRate.value = (o.rate || 1) * (o.vary === false ? 1 : 0.94 + Math.random() * 0.12);
  g.gain.value = o.vol != null ? o.vol : 1;
  s.connect(g); g.connect(sfxG); s.start(now);
}

let cur = null, curMus = "", wantMus = "";
export function music(name) {
  wantMus = name;
  if (!ctx() || !unlocked) return;
  if (curMus === name) return;
  curMus = name;
  const t = ac.currentTime;
  if (cur) { const o = cur; o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(Math.max(0.0001, o.g.gain.value), t); o.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); setTimeout(() => { try { o.s.stop(); } catch (_) {} }, 1400); cur = null; }
  if (!name) return;
  const p = fetchBuf(name); if (!p) return;
  p.then((b) => {
    if (!b || wantMus !== name) return;
    const g = ac.createGain(), s = ac.createBufferSource();
    s.buffer = b; s.loop = name === "m_battle2"; s.connect(g); g.connect(musG);
    const t2 = ac.currentTime; g.gain.setValueAtTime(0.0001, t2); g.gain.exponentialRampToValueAtTime(1, t2 + 1.2);
    s.start(t2); cur = { s, g };
  });
}
