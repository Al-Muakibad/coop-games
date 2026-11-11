// Сохранение «Очага»: localStorage (автосохранение) + Telegram CloudStorage (6.9+), игра режется на куски по 3800 символов.
// При загрузке берётся более свежая копия (по времени сохранения).
import { serialize, deserialize } from "./sim.js";
const KEY = "ko_save1", CK = "ko_c", CHUNK = 3800, MAXCH = 24;
const T = window.TG, tg = T && T.tg;
const cloudOk = () => { try { return !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")); } catch (_) { return false; } };

function wrap(G) { return JSON.stringify({ t: Date.now(), day: G.day, g: serialize(G) }); }
function unwrap(s) { try { const o = JSON.parse(s); if (!o || !o.g) return null; const G = deserialize(o.g); return G ? { t: o.t || 0, G } : null; } catch (_) { return null; } }

export function hasLocal() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s).day || 1 : 0; } catch (_) { return 0; } }
export function load() {
  return new Promise((res) => {
    let local = null;
    try { const s = localStorage.getItem(KEY); if (s) local = unwrap(s); } catch (_) {}
    if (!cloudOk()) return res(local && local.G);
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    setTimeout(() => fin(local && local.G), 2500);
    try {
      tg.CloudStorage.getItem(CK + "_n", (err, n) => {
        n = parseInt(n, 10) || 0;
        if (err || !n || n > MAXCH) return fin(local && local.G);
        const keys = []; for (let i = 0; i < n; i++) keys.push(CK + i);
        tg.CloudStorage.getItems(keys, (e2, vals) => {
          if (e2 || !vals) return fin(local && local.G);
          let s = ""; for (const k of keys) s += vals[k] || "";
          const cloud = unwrap(s);
          if (cloud && (!local || cloud.t > local.t + 1000)) fin(cloud.G); else fin(local && local.G);
        });
      });
    } catch (_) { fin(local && local.G); }
  });
}
let lastCloud = 0;
export function save(G, force) {
  const s = wrap(G);
  try { localStorage.setItem(KEY, s); } catch (_) {}
  const now = Date.now();
  if (!cloudOk() || (!force && now - lastCloud < 30000)) return;
  lastCloud = now;
  const parts = []; for (let i = 0; i < s.length; i += CHUNK) parts.push(s.slice(i, i + CHUNK));
  if (parts.length > MAXCH) return;
  try {
    parts.forEach((p, i) => tg.CloudStorage.setItem(CK + i, p, () => {}));
    tg.CloudStorage.setItem(CK + "_n", String(parts.length), () => {});
  } catch (_) {}
}
export function wipe() {
  try { localStorage.removeItem(KEY); } catch (_) {}
  try { if (cloudOk()) tg.CloudStorage.setItem(CK + "_n", "0", () => {}); } catch (_) {}
}
