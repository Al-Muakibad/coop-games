// «Хутор» — сохранение: localStorage (часто) + Telegram CloudStorage (6.9+, кусками по 3800 символов, не чаще раза в 30 с).
// Четыре отдельных слота — чтобы один хутор не затирал другой:
//   solo  — одному за обе семьи;      bot   — с ботом;
//   host  — свой общий хутор (я хозяин); guest — копия чужого хутора, где я был гостем.
// У каждого хутора есть свой номер (G.cid). Облачная копия берётся, только если это тот же хутор и она новее локальной.
import { serialize, deserialize } from "./sim.js";
export const SLOTS = ["host", "guest", "bot", "solo"];
const KEYS = { host: "o2_host", guest: "o2_guest", bot: "o2_bot", solo: "o2_solo2" };
const CK = { host: "o2h", guest: "o2g", bot: "o2b", solo: "o2o" };
// старые ключи (до разделения): общий слот coop и общий solo (там же жили игры с ботом)
const LEGACY = { host: ["o2_coop"], guest: ["o2_coop"], bot: ["o2_solo"], solo: ["o2_solo"] };
const LEGACY_CK = { host: "o2c", guest: "o2c", bot: "o2s", solo: "o2s" };
const CHUNK = 3800, MAXCH = 60;
const T = window.TG, tg = T && T.tg;
const cloudOk = () => { try { return !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")); } catch (_) { return false; } };

// к какому слоту относится сохранение (для старых — по meta.from / meta.mode / G.solo)
function kindOf(o) {
  const m = (o && o.meta) || {};
  if (m.kind) return m.kind;
  if (m.from === "guest") return "guest";
  if (m.from === "host") return "host";
  if (m.mode === "solo") return "solo";
  if (m.mode === "bot") return "bot";
  try { const g = typeof o.g === "string" ? JSON.parse(o.g) : o.g; return g && g.solo ? "solo" : "bot"; } catch (_) { return "bot"; }
}
const cidOf = (o) => (o && o.meta && o.meta.cid) || "legacy";

// служебные поля отрисовки (_dx, _Y …) в сохранение не пишем — меньше кусков в облаке
function wrap(G, meta) { const g = JSON.parse(serialize(G)); for (const id in g.cards) for (const k in g.cards[id]) if (k[0] === "_") delete g.cards[id][k]; delete g._claims; delete g._carry; delete g._plans; return JSON.stringify({ t: Date.now(), day: G.day, bridge: G.bridge, meta: meta || {}, g: JSON.stringify(g) }); }
function unwrap(s) { try { const o = JSON.parse(s); if (!o || !o.g) return null; const G = deserialize(o.g); return G ? { t: o.t || 0, G, meta: o.meta || {}, kind: kindOf(o), cid: cidOf(o) } : null; } catch (_) { return null; } }

// локальная строка слота; старые ключи переносим один раз (если подходят по виду)
function localStr(slot) {
  try {
    const s = localStorage.getItem(KEYS[slot]); if (s) return s;
    for (const k of LEGACY[slot]) {
      const o = localStorage.getItem(k); if (!o) continue;
      let p = null; try { p = JSON.parse(o); } catch (_) {}
      if (p && kindOf(p) === slot) { localStorage.setItem(KEYS[slot], o); localStorage.removeItem(k); return o; }
    }
  } catch (_) {}
  return null;
}
export function peek(slot) { try { const s = localStr(slot); if (!s) return null; const o = JSON.parse(s); return { day: o.day || 1, bridge: o.bridge || 0, meta: o.meta || {}, t: o.t, cid: cidOf(o) }; } catch (_) { return null; } }

function cloudRead(prefix) {
  return new Promise((res) => {
    try {
      tg.CloudStorage.getItem(prefix + "_n", (err, n) => {
        n = parseInt(n, 10) || 0;
        if (err || !n || n > MAXCH) return res(null);
        const keys = []; for (let i = 0; i < n; i++) keys.push(prefix + i);
        tg.CloudStorage.getItems(keys, (e2, vals) => {
          if (e2 || !vals) return res(null);
          let s = ""; for (const k of keys) s += vals[k] || "";
          res(unwrap(s));
        });
      });
    } catch (_) { res(null); }
  });
}
export function load(slot) {
  return new Promise((res) => {
    let local = null;
    const ls = localStr(slot); if (ls) local = unwrap(ls);
    if (local && local.kind !== slot) local = null;
    if (!cloudOk()) return res(local);
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    setTimeout(() => fin(local), 2500);
    (async () => {
      let cloud = await cloudRead(CK[slot]);
      if (!cloud) { const c2 = await cloudRead(LEGACY_CK[slot]); if (c2 && c2.kind === slot) cloud = c2; }
      if (cloud && cloud.kind !== slot) cloud = null;
      // своё локальное — главное; облако — только если локального нет или это тот же хутор, но новее
      if (cloud && (!local || (cloud.cid === local.cid && cloud.t > local.t + 1000))) fin(cloud); else fin(local);
    })();
  });
}
const lastCloud = {};
export function save(slot, G, meta, force) {
  if (!G || G.lost || !KEYS[slot]) return;
  meta = Object.assign({}, meta || {}, { kind: slot, cid: G.cid || "legacy" });
  const s = wrap(G, meta);
  try { localStorage.setItem(KEYS[slot], s); } catch (_) {}
  const now = Date.now();
  if (!cloudOk() || (!force && now - (lastCloud[slot] || 0) < 30000)) return;
  lastCloud[slot] = now;
  const parts = []; for (let i = 0; i < s.length; i += CHUNK) parts.push(s.slice(i, i + CHUNK));
  if (parts.length > MAXCH) { try { tg.CloudStorage.setItem(CK[slot] + "_n", "0", () => {}); } catch (_) {} return; }   // не оставлять в облаке старую копию
  try { parts.forEach((p, i) => tg.CloudStorage.setItem(CK[slot] + i, p, () => {})); tg.CloudStorage.setItem(CK[slot] + "_n", String(parts.length), () => {}); } catch (_) {}
}
// есть ли сохранение (с облаком): если в localStorage пусто, а в облаке есть — восстанавливаем его локально
export async function probe(slot) {
  const p = peek(slot); if (p) return p;
  const s = await load(slot); if (!s) return null;
  try { localStorage.setItem(KEYS[slot], JSON.stringify({ t: s.t, day: s.G.day, bridge: s.G.bridge, meta: Object.assign({}, s.meta, { kind: slot, cid: s.cid }), g: serialize(s.G) })); } catch (_) {}
  return peek(slot);
}
export function wipe(slot) {
  try { localStorage.removeItem(KEYS[slot]); } catch (_) {}
  try { if (cloudOk()) tg.CloudStorage.setItem(CK[slot] + "_n", "0", () => {}); } catch (_) {}
}
