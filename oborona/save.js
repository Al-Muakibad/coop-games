// Сохранения: аванпост (растёт навсегда), прогресс героя, кампания «Времена года», кристаллы, косметика, настройки.
// Telegram CloudStorage (6.9+) + localStorage как запасной вариант. Берётся версия с бо́льшим прогрессом.
import { STEPS, rewardFor, parseStep } from "./seasons.js";
const KEY = "ob_save1";
const T = window.TG, tg = T && T.tg;
const cloudOk = () => { try { return !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")); } catch (_) { return false; } };

const DEF_OP = () => ({ lv: 1, wall: 0, tw: ["arrow:1", "", "", "", "", ""], g: { saw: 0, quarry: 0, mine: 0 } });
const DEF_PROG = () => ({ lvl: 1, xp: 0, perks: {}, arm: "none", amu: "none", items: { potion: 1 }, c: 60, w: 40, s: 25 });
export const S = {
  v: 2, t: 0, gems: 0, loc: {}, up: {}, hero: "knight", skin: "medieval", skins: { medieval: 1 }, startw: { crossbow: 1 }, wpn: "crossbow",
  set: { music: 0.6, sfx: 0.8, q: "a", vib: 1 }, uid: "", runs: 0,
  op: DEF_OP(), prog: DEF_PROG(),
  camp: { st: {}, max: 0 },                      // st[шаг] = { s: звёзды, b: рекорд, c: пройден }; max — сколько шагов открыто сверх первого
  cos: { ts: "none", tsk: { none: 1 }, out: "team", outs: { team: 1 }, ban: "team", bans: { team: 1 } },
  unl: {}, amus: {}, seed: 0
};
function score(s) {
  let k = (s.gems || 0) + (s.runs || 0);
  for (const id in s.loc || {}) k += 100 * ((s.loc[id].stars || 0) + (s.loc[id].best || 0) / 100);
  for (const id in (s.camp && s.camp.st) || {}) k += 100 * ((s.camp.st[id].s || 0) + (s.camp.st[id].b || 0) / 100 + (s.camp.st[id].c ? 3 : 0));
  for (const u in s.up || {}) k += 50 * s.up[u];
  const op = s.op; if (op) { k += 40 * (op.lv || 1) + 30 * (op.wall || 0); (op.tw || []).forEach((t) => { if (t) k += 15 * (+t.split(":")[1] || 1); }); for (const g in op.g || {}) k += 15 * op.g[g]; }
  return k;
}
function apply(o) {
  if (!o || typeof o !== "object") return;
  for (const k in S) if (o[k] !== undefined) S[k] = o[k];
  S.set = Object.assign({ music: 0.6, sfx: 0.8, q: "a", vib: 1 }, o.set || {});
  S.op = Object.assign(DEF_OP(), S.op || {}); S.op.g = Object.assign({ saw: 0, quarry: 0, mine: 0 }, S.op.g || {}); while (S.op.tw.length < 6) S.op.tw.push("");
  S.prog = Object.assign(DEF_PROG(), S.prog || {});
  S.camp = Object.assign({ st: {}, max: 0 }, S.camp || {});
  S.cos = Object.assign({ ts: "none", tsk: { none: 1 }, out: "team", outs: { team: 1 }, ban: "team", bans: { team: 1 } }, S.cos || {});
  S.unl = S.unl || {}; S.amus = S.amus || {};
}
// старые сохранения (отдельные карты) → «Времена года»: пройденные карты = пройденные сезоны, аванпост — по прогрессу
const OLD = ["forest", "autumn", "swamp", "desert", "snow", "volcano"];
function migrate() {
  if (S.v >= 2) return;
  const n = OLD.filter((id) => S.loc[id] && S.loc[id].cleared).length;
  OLD.forEach((id, i) => { const o = S.loc[id]; if (o && STEPS[i]) S.camp.st[STEPS[i].id] = { s: o.stars || 0, b: o.best || 0, c: o.cleared ? 1 : 0 }; });
  S.camp.max = Math.min(STEPS.length - 1, n);
  // награды за уже пройденное — сразу, а аванпост «дорастает» до уровня прогресса
  for (let i = 0; i < n; i++) grantSpecial(rewardFor(STEPS[i].year, STEPS[i].si).special);
  if (n) { S.op.lv = Math.min(1 + n, 6); S.op.wall = Math.min(n, 3); S.op.g.saw = Math.min(n, 3); S.op.g.quarry = Math.min(n, 2); S.prog.c += 60 * n; S.prog.w += 40 * n; S.prog.s += 30 * n; }
  S.v = 2;
}
export function load() {
  return new Promise((res) => {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
    apply(local);
    if (!S.uid) { const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user; S.uid = u ? "tg" + u.id : "a" + Math.random().toString(36).slice(2, 10); }
    const done0 = () => { apply(S); const old = S.v < 2; migrate(); if (!S.seed) S.seed = 1 + Math.floor(Math.random() * 1e9); if (old) save(true); res(S); };
    if (!cloudOk()) return done0();
    let done = false; const fin = () => { if (!done) { done = true; done0(); } };
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
// ---------- кампания ----------
export function stepState(id) { const o = S.camp.st[id]; return { best: o ? o.b || 0 : 0, stars: o ? o.s || 0 : 0, cleared: o ? !!o.c : false }; }
export const locState = stepState;
export const stepOpen = (idx) => idx <= S.camp.max;
export function currentStep() { return STEPS[Math.min(S.camp.max, STEPS.length - 1)]; }
// аванпост и герой сохраняются после каждой волны и в конце боя — ничего не сбрасывается
export function saveOutpost(op, prog) {
  if (op) S.op = op;
  if (prog) S.prog = Object.assign(S.prog, prog);
  save();
}
export function grantSpecial(sp) {
  if (!sp) return;
  if (sp.unlock) S.unl[sp.unlock] = 1;
  if (sp.tower) S.unl[sp.tower] = 1;
  if (sp.tskin) S.cos.tsk[sp.tskin] = 1;
  if (sp.outfit) S.cos.outs[sp.outfit] = 1;
  if (sp.banner) S.cos.bans[sp.banner] = 1;
  if (sp.style) S.skins[sp.style] = 1;
  if (sp.amulet) S.amus[sp.amulet] = 1;
}
// итог боя: звёзды, рекорд, кристаллы и сундук наград (особая награда — только за первый проход)
export function finishRun(stepId, wave, cleared, stars, bossKills) {
  const o = S.camp.st[stepId] || (S.camp.st[stepId] = { s: 0, b: 0, c: 0 });
  const ps = parseStep(stepId), R = ps ? rewardFor(ps.y, ps.i) : { gems: 10, res: { c: 30, w: 20, s: 15 } };
  const firstClear = cleared && !o.c, oldStars = o.s || 0;
  let gems = Math.floor(wave) + (bossKills || 0) * 4;
  const chest = { gems: 0, res: { c: 0, w: 0, s: 0 }, special: null, firstClear, stars, newStars: Math.max(0, stars - oldStars) };
  if (cleared) {
    const k = firstClear ? 1 : 0.35;
    gems += Math.round(R.gems * (firstClear ? 1 : 0.4)) + stars * 3;
    for (const r of ["c", "w", "s"]) chest.res[r] = Math.round(R.res[r] * k * (1 + 0.25 * stars));
    if (firstClear) { chest.special = R.special; grantSpecial(R.special); }
  }
  if (stars > oldStars) { gems += (stars - oldStars) * 6; o.s = stars; }
  o.b = Math.max(o.b || 0, wave);
  if (cleared) { o.c = 1; const idx = STEPS.findIndex((s) => s.id === stepId); if (idx >= S.camp.max) S.camp.max = Math.min(STEPS.length - 1, idx + 1); }
  chest.gems = gems;
  S.gems = (S.gems || 0) + gems; S.runs = (S.runs || 0) + 1;
  S.prog.c += chest.res.c; S.prog.w += chest.res.w; S.prog.s += chest.res.s;
  save(true);
  return chest;
}
