// Сохранение «Отряда»: localStorage + Telegram CloudStorage (6.9+). Берётся версия с бо́льшим прогрессом.
// Два режима с отдельным прогрессом: забег (run) и пушка (gun). Монеты, облик и казарма (карты бойцов) — общие.
// v2: новые улучшения (стрельба, боевая пушка, мастерство оружия, стволы, заряд чемпиона), карты бойцов, сундуки.
// Старое сохранение (v1) подхватывается как есть: недостающее берётся из умолчаний, за пройденные уровни — сундуки.
const KEY = "ot_save1";
const T = window.TG, tg = T && T.tg;
const cloudOk = () => { try { return !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")); } catch (_) { return false; } };

export const VERSION = 2;
const DEF = () => ({
  v: VERSION, t: 0, coins: 0,
  run: { lv: 1, max: 1, up: { start: 0, hp: 0, atk: 0, inc: 0, shots: 0, cannon: 0, mastery: 0 } },          // lv — выбранный, max — открытый
  gun: { max: 1, st: {}, up: { rate: 0, shot: 0, gate: 0, hp: 0, barrel: 0, charge: 0 } },                  // st[уровень] = звёзды (1–3)
  cards: { scout: 0, brute: 0, archer: 0, shield: 0, champ: 0 },     // уровень карты бойца (0 — не открыт)
  shards: { scout: 0, brute: 0, archer: 0, shield: 0, champ: 0 },    // карточки к следующему уровню
  wins: 0, chests: 0, got: {},                                        // победы (каждые 3 — сундук), неоткрытые сундуки, выданные «первые» карты
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
  if (s.cards) for (const c in s.cards) k += 60 * s.cards[c];
  if (s.shards) for (const c in s.shards) k += 5 * s.shards[c];
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
  S.cards = Object.assign(d.cards, o.cards || {}); S.shards = Object.assign(DEF().shards, o.shards || {}); S.got = Object.assign({}, o.got || {});
  migrate(o);
}
// v1 → v2: за уже пройденные уровни — сундуки (по одному на каждые 3 победы, не больше 5), чтобы старые игроки сразу попали в казарму
function migrate(o) {
  if ((o.v || 1) >= VERSION) return;
  const done = Math.max(0, ((o.run && o.run.max) || 1) - 1) + Math.max(0, ((o.gun && o.gun.max) || 1) - 1);
  S.wins = done; S.chests = Math.min(5, Math.floor(done / 3));
  S.v = VERSION;
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
