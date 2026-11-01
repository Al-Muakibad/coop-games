// Сохранения: прогресс кампании, кристаллы, улучшения, скины, настройки.
// Telegram CloudStorage (6.9+) + localStorage как запасной вариант. Берётся версия с бо́льшим прогрессом.
const KEY = "ob_save1";
const T = window.TG, tg = T && T.tg;
const cloudOk = () => { try { return !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")); } catch (_) { return false; } };

export const S = {
  v: 1, t: 0, gems: 0, loc: {}, up: {}, hero: "knight", skin: "medieval", skins: { medieval: 1 }, startw: { crossbow: 1 }, wpn: "crossbow",
  set: { music: 0.6, sfx: 0.8, q: "a", vib: 1 }, uid: "", runs: 0
};
function score(s) { let k = (s.gems || 0) + (s.runs || 0); for (const id in s.loc || {}) k += 100 * ((s.loc[id].stars || 0) + (s.loc[id].best || 0) / 100); for (const u in s.up || {}) k += 50 * s.up[u]; return k; }
function apply(o) { if (!o || typeof o !== "object") return; for (const k in S) if (o[k] !== undefined) S[k] = o[k]; S.set = Object.assign({ music: 0.6, sfx: 0.8, q: "a", vib: 1 }, o.set || {}); }
export function load() {
  return new Promise((res) => {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
    apply(local);
    if (!S.uid) { const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user; S.uid = u ? "tg" + u.id : "a" + Math.random().toString(36).slice(2, 10); }
    if (!cloudOk()) return res(S);
    let done = false; const fin = () => { if (!done) { done = true; res(S); } };
    setTimeout(fin, 2500);
    try {
      tg.CloudStorage.getItem(KEY, (err, v) => {
        if (!err && v) { try { const c = JSON.parse(v); if (score(c) > score(S) || (score(c) === score(S) && (c.t || 0) > (S.t || 0))) { const uid = S.uid; apply(c); S.uid = S.uid || uid; } } catch (_) {} }
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
export function locState(id) { return S.loc[id] || { best: 0, stars: 0, cleared: 0 }; }
export function unlocked(locs) { const out = new Set([locs[0].id]); locs.forEach((l, i) => { if (S.loc[l.id] && S.loc[l.id].cleared && locs[i + 1]) out.add(locs[i + 1].id); }); return out; }
// итог забега: вернёт заработанные кристаллы
export function finishRun(locId, wave, cleared, stars, bossKills) {
  const st = S.loc[locId] || (S.loc[locId] = { best: 0, stars: 0, cleared: 0 });
  let gems = Math.floor(wave * 1) + (bossKills || 0) * 4;
  const firstClear = cleared && !st.cleared;
  if (cleared) { gems += 6 + stars * 2; if (firstClear) gems += 10; }
  if (stars > (st.stars || 0)) { gems += (stars - (st.stars || 0)) * 4; st.stars = stars; }
  st.best = Math.max(st.best || 0, wave);
  if (cleared) st.cleared = 1;
  S.gems = (S.gems || 0) + gems; S.runs = (S.runs || 0) + 1;
  save(true);
  return { gems, firstClear };
}
