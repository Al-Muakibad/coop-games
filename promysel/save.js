// «Промысел» — сохранения: localStorage (часто) + Telegram CloudStorage (6.9+, кусками, не чаще раза в 30 с).
// Отдельные слоты, чтобы одна игра не затирала другую:
//   solo — одному;  coop — общая бухта, где я хозяин;  guest — копия чужой бухты (был гостем);  vs — матч «друг против друга».
// Профиль (знаки промысла, открытые бухты, победы) — отдельно, ключ pm_prof.
import { serialize, deserialize } from "./sim.js";
export const SLOTS = ["coop", "guest", "solo", "vs"];
const KEYS = { coop: "pm_coop", guest: "pm_guest", solo: "pm_solo", vs: "pm_vs" };
const CK = { coop: "pmc", guest: "pmg", solo: "pms", vs: "pmv" };
const CHUNK = 3800, MAXCH = 60;
const T = window.TG, tg = T && T.tg;
const cloudOk = () => { try { return !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")); } catch (_) { return false; } };

function wrap(G, meta) { const g = JSON.parse(serialize(G)); return JSON.stringify({ t: Date.now(), meta: meta || {}, sum: summary(G), g }); }
function unwrap(s) { try { const o = JSON.parse(s); if (!o || !o.g) return null; const G = deserialize(o.g); return G ? { t: o.t || 0, G, meta: o.meta || {}, cid: (o.meta && o.meta.cid) || G.cid } : null; } catch (_) { return null; } }
export function summary(G) { let o = 0, n = 0; for (const s of G.e) { if (s.o) o++; n++; } return { bay: G.bay, money: Math.floor(G.money[0]), earned: Math.floor(G.earned[0] + (G.earned[1] || 0)), o, t: Math.floor(G.t), mode: G.mode, diff: G.diff }; }
export function peek(slot) { try { const s = localStorage.getItem(KEYS[slot]); if (!s) return null; const o = JSON.parse(s); return { t: o.t, meta: o.meta || {}, sum: o.sum || {} }; } catch (_) { return null; } }

function cloudRead(prefix) {
  return new Promise((res) => {
    try {
      tg.CloudStorage.getItem(prefix + "_n", (err, n) => {
        n = parseInt(n, 10) || 0;
        if (err || !n || n > MAXCH) return res(null);
        const keys = []; for (let i = 0; i < n; i++) keys.push(prefix + i);
        tg.CloudStorage.getItems(keys, (e2, vals) => { if (e2 || !vals) return res(null); let s = ""; for (const k of keys) s += vals[k] || ""; res(s); });
      });
    } catch (_) { res(null); }
  });
}
export function load(slot) {
  return new Promise((res) => {
    let ls = null; try { ls = localStorage.getItem(KEYS[slot]); } catch (_) {}
    const local = ls ? unwrap(ls) : null;
    if (!cloudOk()) return res(local);
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    setTimeout(() => fin(local), 2500);
    cloudRead(CK[slot]).then((cs) => {
      const cloud = cs ? unwrap(cs) : null;
      if (cloud && (!local || (cloud.cid === local.cid && cloud.t > local.t + 1000))) { try { localStorage.setItem(KEYS[slot], cs); } catch (_) {} fin(cloud); } else fin(local);
    });
  });
}
const lastCloud = {};
export function save(slot, G, meta, force) {
  if (!G || !KEYS[slot]) return;
  meta = Object.assign({}, meta || {}, { cid: G.cid });
  const s = wrap(G, meta);
  try { localStorage.setItem(KEYS[slot], s); } catch (_) {}
  const now = Date.now();
  if (!cloudOk() || (!force && now - (lastCloud[slot] || 0) < 30000)) return;
  lastCloud[slot] = now;
  const parts = []; for (let i = 0; i < s.length; i += CHUNK) parts.push(s.slice(i, i + CHUNK));
  if (parts.length > MAXCH) { try { tg.CloudStorage.setItem(CK[slot] + "_n", "0", () => {}); } catch (_) {} return; }
  try { parts.forEach((p, i) => tg.CloudStorage.setItem(CK[slot] + i, p, () => {})); tg.CloudStorage.setItem(CK[slot] + "_n", String(parts.length), () => {}); } catch (_) {}
}
// есть ли сохранение (с облаком): если локально пусто, а в облаке есть — восстанавливаем локально
export async function probe(slot) {
  const p = peek(slot); if (p) return p;
  if (!cloudOk()) return null;
  const s = await load(slot); if (!s) return null;
  save(slot, s.G, s.meta, false);
  return peek(slot);
}
export function wipe(slot) {
  try { localStorage.removeItem(KEYS[slot]); } catch (_) {}
  try { if (cloudOk()) tg.CloudStorage.setItem(CK[slot] + "_n", "0", () => {}); } catch (_) {}
}
/* ---------- профиль ---------- */
const PROF0 = { perks: { p_cap: 0, p_spd: 0, p_price: 0 }, bays: 0, vsWin: 0, vsLoss: 0, stars: 0, best: {} };
export function profile() { try { const o = JSON.parse(localStorage.getItem("pm_prof") || "null"); return Object.assign(JSON.parse(JSON.stringify(PROF0)), o || {}); } catch (_) { return JSON.parse(JSON.stringify(PROF0)); } }
export function saveProfile(p) {
  const s = JSON.stringify(p);
  try { localStorage.setItem("pm_prof", s); } catch (_) {}
  try { if (cloudOk()) tg.CloudStorage.setItem("pm_prof", s, () => {}); } catch (_) {}
}
export function syncProfile(cb) {
  if (!cloudOk()) return;
  try { tg.CloudStorage.getItem("pm_prof", (err, v) => { if (err || !v) return; try { const c = JSON.parse(v), l = profile(); const score = (p) => (p.bays || 0) * 1000 + (p.vsWin || 0) + (p.stars || 0) * 0.01; if (score(c) > score(l)) { localStorage.setItem("pm_prof", v); cb && cb(); } } catch (_) {} }); } catch (_) {}
}
