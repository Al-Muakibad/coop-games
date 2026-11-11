// «Хутор» — сохранение: localStorage (часто) + Telegram CloudStorage (6.9+, кусками по 3800 символов, не чаще раза в 30 с).
// Два слота: "coop" — общий хутор (сохраняют оба игрока: хозяин — всегда, гость — копию от хозяина) и "solo".
import { serialize, deserialize } from "./sim.js";
const KEYS = { coop: "o2_coop", solo: "o2_solo" }, CK = { coop: "o2c", solo: "o2s" }, CHUNK = 3800, MAXCH = 28;
const T = window.TG, tg = T && T.tg;
const cloudOk = () => { try { return !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")); } catch (_) { return false; } };

function wrap(G, meta) { return JSON.stringify({ t: Date.now(), day: G.day, bridge: G.bridge, meta: meta || {}, g: serialize(G) }); }
function unwrap(s) { try { const o = JSON.parse(s); if (!o || !o.g) return null; const G = deserialize(o.g); return G ? { t: o.t || 0, G, meta: o.meta || {} } : null; } catch (_) { return null; } }

export function peek(slot) { try { const s = localStorage.getItem(KEYS[slot]); if (!s) return null; const o = JSON.parse(s); return { day: o.day || 1, bridge: o.bridge || 0, meta: o.meta || {}, t: o.t }; } catch (_) { return null; } }
export function load(slot) {
  return new Promise((res) => {
    let local = null;
    try { const s = localStorage.getItem(KEYS[slot]); if (s) local = unwrap(s); } catch (_) {}
    if (!cloudOk()) return res(local);
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    setTimeout(() => fin(local), 2500);
    try {
      tg.CloudStorage.getItem(CK[slot] + "_n", (err, n) => {
        n = parseInt(n, 10) || 0;
        if (err || !n || n > MAXCH) return fin(local);
        const keys = []; for (let i = 0; i < n; i++) keys.push(CK[slot] + i);
        tg.CloudStorage.getItems(keys, (e2, vals) => {
          if (e2 || !vals) return fin(local);
          let s = ""; for (const k of keys) s += vals[k] || "";
          const cloud = unwrap(s);
          fin(cloud && (!local || cloud.t > local.t + 1000) ? cloud : local);
        });
      });
    } catch (_) { fin(local); }
  });
}
const lastCloud = {};
export function save(slot, G, meta, force) {
  if (!G || G.lost) return;
  const s = wrap(G, meta);
  try { localStorage.setItem(KEYS[slot], s); } catch (_) {}
  const now = Date.now();
  if (!cloudOk() || (!force && now - (lastCloud[slot] || 0) < 30000)) return;
  lastCloud[slot] = now;
  const parts = []; for (let i = 0; i < s.length; i += CHUNK) parts.push(s.slice(i, i + CHUNK));
  if (parts.length > MAXCH) return;
  try { parts.forEach((p, i) => tg.CloudStorage.setItem(CK[slot] + i, p, () => {})); tg.CloudStorage.setItem(CK[slot] + "_n", String(parts.length), () => {}); } catch (_) {}
}
export function wipe(slot) {
  try { localStorage.removeItem(KEYS[slot]); } catch (_) {}
  try { if (cloudOk()) tg.CloudStorage.setItem(CK[slot] + "_n", "0", () => {}); } catch (_) {}
}
