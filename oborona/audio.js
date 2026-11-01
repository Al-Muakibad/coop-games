// Звук: сэмплы (CC0) и живая музыка с плавными переходами. Всё грузится лениво.
import { S } from "./save.js";

const SFX = ["click", "open", "close", "error", "select", "confirm", "coin", "coin2", "buy", "build", "upgrade", "levelup", "perk", "xbow", "shotgun", "heavy", "zap", "firecast", "whoosh", "blade", "flame", "rocket", "poison", "ice", "boom", "boom2", "cannon", "stonehit", "arrow", "ballista", "magic", "hit", "hit2", "bone", "die", "die2", "slime", "growl", "growl2", "moan", "roar", "roar2", "hurt", "househit", "collapse", "chop", "mine", "potion", "gong", "gong2", "bell", "thunder", "fire", "heal"];
// музыка: биом → треки
export const MUSIC = {
  menu: "m_menu", build: "m_build", battle: ["m_battle", "m_battle2"], boss: "m_boss", win: "m_win", lose: "m_lose"
};
let ac = null, master = null, sfxG = null, musG = null, comp = null;
const buf = {}, loading = {}, last = {};
let unlocked = false, listener = { x: 0, z: 0 };
function ctx() {
  if (ac) return ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ac.destination);
    master = ac.createGain(); master.connect(comp);
    sfxG = ac.createGain(); sfxG.connect(master);
    musG = ac.createGain(); musG.connect(master);
    applyVol();
  } catch (_) { ac = null; }
  return ac;
}
export function applyVol() { if (!ac) return; sfxG.gain.value = (S.set.sfx ?? 0.8) * 0.9; musG.gain.value = (S.set.music ?? 0.6) * 0.55; }
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
  if (wantName) { const w = wantName; curName = ""; music(w); }
}
["pointerdown", "touchstart", "keydown"].forEach((e) => addEventListener(e, unlock, { capture: true, passive: true }));
document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });

export function setListener(x, z) { listener.x = x; listener.z = z; }
// play(name, {x,z, vol, rate, gap})
export function play(name, o) {
  if (!ac || !unlocked || !buf[name]) { if (unlocked && !buf[name]) fetchBuf(name); return; }
  o = o || {};
  const now = ac.currentTime, gap = o.gap != null ? o.gap : 0.05;
  if (last[name] && now - last[name] < gap) return;
  last[name] = now;
  let vol = o.vol != null ? o.vol : 1;
  if (o.x != null) { const d = Math.hypot(o.x - listener.x, o.z - listener.z); vol *= Math.max(0, 1 - Math.max(0, d - 6) / 22); if (vol < 0.03) return; }
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = buf[name]; s.playbackRate.value = (o.rate || 1) * (o.vary === false ? 1 : 0.94 + Math.random() * 0.12);
  g.gain.value = vol;
  if (o.x != null && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-0.8, Math.min(0.8, (o.x - listener.x) / 14)); s.connect(g); g.connect(p); p.connect(sfxG); }
  else { s.connect(g); g.connect(sfxG); }
  s.start(now);
}

// ---------- музыка ----------
let cur = null, curName = "", wantName = "", stingT = 0;
export function music(name) {
  wantName = name;
  if (!ctx() || !unlocked) return;
  let file = MUSIC[name] || name;
  if (Array.isArray(file)) file = file[Math.floor(Math.random() * file.length)];
  if (curName === name && cur) return;
  curName = name;
  const p = fetchBuf(file);
  if (!p) return;
  p.then((b) => {
    if (!b || wantName !== name) return;
    const g = ac.createGain(), s = ac.createBufferSource();
    s.buffer = b; s.loop = !/m_win|m_lose/.test(file); s.connect(g); g.connect(musG);
    const t = ac.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 1.6);
    s.start(t);
    if (cur) { const o = cur; o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(Math.max(0.0001, o.g.gain.value), t); o.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); setTimeout(() => { try { o.s.stop(); } catch (_) {} }, 1800); }
    cur = { s, g, name };
  });
}
// короткий джингл поверх музыки (победа волны и т.п.): приглушаем фон
export function sting(name) {
  if (!ac || !unlocked) return;
  const p = fetchBuf(MUSIC[name] || name); if (!p) return;
  p.then((b) => {
    if (!b) return;
    const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.value = 0.9; s.connect(g); g.connect(musG); s.start();
    if (cur) { const t = ac.currentTime; cur.g.gain.cancelScheduledValues(t); cur.g.gain.setValueAtTime(cur.g.gain.value, t); cur.g.gain.linearRampToValueAtTime(0.15, t + 0.4); cur.g.gain.linearRampToValueAtTime(1, t + Math.min(b.duration, 9)); }
  });
}
export function preloadMusic(list) { if (!unlocked) return; list.forEach((n) => { const f = MUSIC[n] || n; (Array.isArray(f) ? f : [f]).forEach(fetchBuf); }); }
export const ready = () => unlocked;
