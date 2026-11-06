// Сохранение «Отряда»: localStorage + Telegram CloudStorage (6.9+). Берётся версия с бо́льшим прогрессом.
// Два режима с отдельным прогрессом: забег (run) и пушка (gun). Монеты и облик — общие.
const KEY = "ot_save1";
const T = window.TG, tg = T && T.tg;
const cloudOk = () => { try { return !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")); } catch (_) { return false; } };

const DEF = () => ({
  v: 1, t: 0, coins: 0,
  run: { lv: 1, max: 1, up: { start: 0, hp: 0, atk: 0, inc: 0 } },          // lv — выбранный, max — открытый
  gun: { max: 1, st: {}, up: { rate: 0, shot: 0, gate: 0, hp: 0 } },       // st[уровень] = звёзды (1–3)
  col: "blue", hat: "none", cols: { blue: 1 }, hats: { none: 1 },
  set: { snd: 1, mus: 1, vib: 1 }, tut: 0, gtut: 0, plays: 0
});
export const S = DEF();

function score(s) {
  if (!s) return -1;
  let k = (s.run && s.run.max || 0) * 1000 + (s.gun && s.gun.max || 0) * 1000;
  for (const m of ["run", "gun"]) if (s[m] && s[m].up) for (const u in s[m].up) k += 40 * s[m].up[u];
  if (s.gun && s.gun.st) for (const l in s.gun.st) k += 10 * s.gun.st[l];
  k += Object.keys(s.cols || {}).length * 20 + Object.keys(s.hats || {}).length * 20;
  return k;
}
function apply(o) {
  if (!o || typeof o !== "object") return;
  const d = DEF();
  for (const k in d) if (o[k] !== undefined) S[k] = o[k];
  S.run = Object.assign(d.run, o.run || {}); S.run.up = Object.assign(DEF().run.up, (o.run && o.run.up) || {});
  S.gun = Object.assign(d.gun, o.gun || {}); S.gun.up = Object.assign(DEF().gun.up, (o.gun && o.gun.up) || {}); S.gun.st = S.gun.st || {};
  S.set = Object.assign(DEF().set, o.set || {});
  S.cols = Object.assign({ blue: 1 }, o.cols || {}); S.hats = Object.assign({ none: 1 }, o.hats || {});
}
export function load() {
  return new Promise((res) => {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
    apply(local);
    if (!cloudOk()) return res(S);
    let done = false; const fin = () => { if (!done) { done = true; res(S); } };
    setTimeout(fin, 2500);
    try {
      tg.CloudStorage.getItem(KEY, (err, v) => {
        if (!err && v) { try { const c = JSON.parse(v); if (score(c) > score(S) || (score(c) === score(S) && (c.t || 0) > (S.t || 0))) apply(c); } catch (_) {} }
        fin();
      });
    } catch (_) { fin(); }
  });
}
let saveT = 0;
export function save(now) {
  S.t = Date.now();
  const s = JSON.stringify(S);
  try { localStorage.setItem(KEY, s); } catch (_) {}
  clearTimeout(saveT);
  const go = () => { try { if (cloudOk() && s.length < 4000) tg.CloudStorage.setItem(KEY, s, () => {}); } catch (_) {} };
  if (now) go(); else saveT = setTimeout(go, 800);
}
export function reset() { apply(DEF()); Object.assign(S, DEF()); save(true); }
