// «Промысел» — симуляция мира. Без DOM и three.js: её крутит хозяин (и одиночная игра), её же гоняет tools/balance.mjs.
// Состояние G сериализуется целиком (сохранение и снимки для гостя). Статичная раскладка карты — в layout(G.mode).
// Действия игроков — «операции» (op): поймать, положить, взять, заплатить, собрать выручку. Гость применяет их у себя сразу
// и отправляет хозяину; хозяин проверяет и применяет у себя (см. coop.js).
import { ITEMS, IT, NIT, PLAYER, HELPER, SCHOOL, CUSTOMER, PAD_R, UPG, upgCost, COOP, VS, BAYS, DIFF, SHORE, ROAD_Z } from "./data.js";

const TAU = Math.PI * 2;
const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- раскладка ---------- */
const LAYOUTS = {};
export function layout(mode) {
  const key = mode === "vs" ? "vs" : "coop";
  if (LAYOUTS[key]) return LAYOUTS[key];
  const MAP = key === "vs" ? VS : COOP, teams = key === "vs" ? 2 : 1;
  const E = [], byId = [{}, {}];
  for (let team = 0; team < teams; team++) {
    const sg = team === 1 ? -1 : 1;     // правая база — зеркало левой
    for (const def of MAP.ents) {
      if (def.coopOnly && key === "vs") continue;
      const e = { i: E.length, def, id: def.id, k: def.k, team, sg, x: def.x * sg, z: def.z, w: def.w || 0, d: def.d || 0 };
      if (def.item) e.item = IT[def.item];
      if (def.rec) e.rec = { in: def.rec.in.map((s) => IT[s]), out: IT[def.rec.out], t: def.rec.t };
      if (def.accept) e.acc = def.accept.map((s) => IT[s]);
      const pad = def.pad ? { x: def.pad[0] * sg, z: def.pad[1] } : { x: e.x, z: e.z };
      e.zpad = { x: pad.x, z: pad.z, r: PAD_R };
      const side = (s, w, d) => (s === "n" ? [0, -d / 2 - 0.8] : s === "s" ? [0, d / 2 + 0.8] : s === "e" ? [w / 2 + 0.8, 0] : [-w / 2 - 0.8, 0]);
      if (e.k === "spot") e.zin = { x: e.x, z: e.z, r: def.r };
      if (e.k === "proc") {
        const a = side(def.inS || "n", e.w, e.d), b = side(def.outS || "s", e.w, e.d);
        const fx = (v) => ((def.inS === "e" || def.inS === "w") ? v * sg : v);
        e.zin = { x: e.x + (def.inS === "e" || def.inS === "w" ? a[0] * sg : 0), z: e.z + a[1], r: 0.95 };
        e.zout = { x: e.x + ((def.outS === "e" || def.outS === "w") ? b[0] * sg : 0), z: e.z + b[1], r: 0.95 };
        void fx;
        e.box = [e.x - e.w / 2, e.z - e.d / 2, e.x + e.w / 2, e.z + e.d / 2];
      }
      if (e.k === "gen") { e.zout = { x: def.out[0] * sg, z: def.out[1], r: 0.95 }; e.box = [e.x - e.w / 2, e.z - e.d / 2, e.x + e.w / 2, e.z + e.d / 2]; }
      if (e.k === "stall") {
        e.w = 2.6; e.d = 0.9;
        e.zin = { x: e.x - 0.45 * sg, z: e.z - 1.2, r: 1.0 };
        e.zcash = { x: e.x + 0.95 * sg, z: e.z - 1.15, r: 0.85 };
        e.box = [e.x - 1.3, e.z - 0.45, e.x + 1.3, e.z + 0.45];
        e.slots = []; for (let s = 0; s < 5; s++) e.slots.push({ x: e.x, z: e.z + 1.25 + s * 0.85 });
      }
      if (e.k === "dock") { e.zin = { x: e.x, z: e.z, r: 1.05 }; e.zcash = { x: e.x + 0.9 * sg, z: e.z + 1.5, r: 0.8 }; e.berth = { x: e.x - 2.7 * sg, z: e.z - 0.8 }; }
      if (e.k === "board") { e.zin = { x: e.x - 0.5, z: e.z - 1.25, r: 1.0 }; e.zcash = { x: e.x + 0.85, z: e.z - 1.2, r: 0.8 }; e.box = [e.x - 1.1, e.z - 0.3, e.x + 1.1, e.z + 0.3]; }
      if (e.k === "goal") e.box = [e.x - 1.1, e.z - 1.1, e.x + 1.1, e.z + 1.1];
      if (e.k === "pier") e.pier = { x: def.x0 * sg, z0: def.z0, z1: def.z1 };
      if (e.k === "spot") e.school = { x: def.sx * sg, z: def.sz };
      byId[team][def.id] = e.i;
      E.push(e);
    }
  }
  for (const e of E) {
    e.after = (e.def.after || []).map((id) => byId[e.team][id]).filter((v) => v != null);
    if (e.def.from) e.from = byId[e.team][e.def.from];
    if (e.def.to) e.to = e.def.to.map((id) => byId[e.team][id]).filter((v) => v != null);
  }
  // забор рынка: от края до края, с проходами к очередям
  const fz = 11.95, fences = [];
  const gaps = E.filter((e) => e.k === "stall").map((e) => e.x).sort((a, b) => a - b);
  let x0 = MAP.w[0];
  for (const gx of gaps) { if (gx - 0.75 > x0 + 0.2) fences.push([x0, fz - 0.15, gx - 0.75, fz + 0.15]); x0 = gx + 0.75; }
  if (MAP.w[1] > x0 + 0.2) fences.push([x0, fz - 0.15, MAP.w[1], fz + 0.15]);
  const div = key === "vs" ? [[-0.15, -13.6, 0.15, fz]] : [];
  const deco = []; for (const d of MAP.deco || []) for (let t = 0; t < teams; t++) { const sg = t ? -1 : 1; deco.push({ m: d.m, x: d.x * sg, z: d.z, box: [d.x * sg - d.w / 2, d.z - d.d / 2, d.x * sg + d.w / 2, d.z + d.d / 2] }); }
  const L = { key, MAP, E, byId, teams, fences, div, fz, deco, crowd: key === "vs" ? [-12, 12, 13.2, 18] : [-12.5, 12.5, 13.2, 18], start: MAP.start };
  LAYOUTS[key] = L;
  return L;
}
// берег: где кончается суша (z меньше — море)
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function shoreZ(L, x) {
  if (L.key === "vs") return SHORE + (-13.4 - SHORE) * (1 - ss(3.4, 5.0, Math.abs(x)));
  return SHORE + (-13.2 - SHORE) * ss(9.2, 10.6, x);
}

/* ---------- случайные числа (в состоянии, чтобы сохранение продолжало ту же цепочку) ---------- */
function rnd(G) { let t = (G.rs = (G.rs + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

/* ---------- новая игра ---------- */
export function newGame(o) {
  o = o || {};
  const mode = o.mode || "solo";
  const L = layout(mode);
  const G = {
    v: 1, mode, rs: (o.seed || 1) | 0, t: 0, bay: o.bay || 0, diff: o.diff == null ? 1 : o.diff, goal: o.goal || "light", tEnd: o.goal === "time" ? 600 : 0,
    perks: o.perks || { p_cap: 0, p_spd: 0, p_price: 0 },
    teams: L.teams, money: [o.money || 0, o.money || 0], earned: [0, 0], spent: [0, 0],
    upg: [{}, {}], e: [], pl: [], hp: [], cu: [], nid: 1, ev: [], bv: 1,
    con: null, conT: 40, stars: 0, cdone: 0, cfail: 0, done: -1, winner: -1, rate: 0, rateAcc: 0, served: 0, lost: 0,
    cid: o.cid || Math.random().toString(36).slice(2, 10),
  };
  for (const t of [0, 1]) for (const u in UPG) G.upg[t][u] = 0;
  for (const e of L.E) {
    const s = { o: e.def.free ? 1 : 0, p: 0 };
    if (e.k === "spot") { s.f = SCHOOL.max; s.rt = 0; }
    if (e.k === "proc") { s.ib = e.rec.in.map(() => 0); s.ob = 0; s.tm = 0; }
    if (e.k === "gen") { s.ob = 0; s.tm = 0; }
    if (e.k === "stall") { s.sh = 0; s.cash = 0; s.q = []; }
    if (e.k === "dock") { s.pile = []; s.ship = 0; s.st = 6; s.load = []; s.cash = 0; }
    if (e.k === "board") { s.cash = 0; }
    G.e.push(s);
  }
  const np = mode === "solo" ? 1 : 2;
  for (let i = 0; i < np; i++) {
    const sg = mode === "vs" && i === 1 ? -1 : 1;
    const sx = L.start[0] * sg + (mode === "coop" ? (i ? 1.4 : -0.6) : 0);
    G.pl.push({ x: sx, z: L.start[1], dir: Math.PI, st: [], team: mode === "vs" ? i : 0, xt: 0, ct: 0, mv: 0, on: 1 });
  }
  return G;
}

/* ---------- запросы ---------- */
export const teamOf = (G, pi) => (G.mode === "vs" ? pi : 0);
export function costMul(G) { return G.mode === "vs" ? 0.45 : BAYS[G.bay].mult * DIFF[G.diff].cost * (G.mode === "coop" ? 1.15 : 1); }
export function priceMul(G) { return G.mode === "vs" ? 2.5 : BAYS[G.bay].mult * (1 + 0.15 * (G.perks.p_price || 0)); }
export function capOf(G, team) { return UPG.bag.v(G.upg[team].bag) + (G.mode === "vs" ? 0 : 2 * (G.perks.p_cap || 0)); }
export function speedOf(G, team) { return UPG.boots.v(G.upg[team].boots) * (G.mode === "vs" ? 1 : 1 + 0.08 * (G.perks.p_spd || 0)); }
export function catchOf(G, team) { return UPG.net.v(G.upg[team].net); }
export function itemPrice(G, it) { const I = ITEMS[it]; return (I.price || I.ship || 0) * priceMul(G); }
// площадка видна: зависимости открыты, сама ещё не куплена (улучшение — пока не максимум)
export function padVisible(G, i) {
  const L = layout(G.mode), e = L.E[i], s = G.e[i];
  if (e.k === "spot" || e.k === "board") return false;
  if (e.k === "upg") { if (G.upg[e.team][e.def.u] >= UPG[e.def.u].max) return false; }
  else if (s.o) return false;
  if (e.def.free) return false;
  for (const a of e.after) if (!G.e[a].o) return false;
  return true;
}
export function padCost(G, i) {
  const L = layout(G.mode), e = L.E[i];
  if (e.k === "upg") return upgCost(e.def.u, G.upg[e.team][e.def.u], costMul(G));
  return Math.round((e.def.cost || 0) * costMul(G) / 5) * 5 || 5;
}
// открыто ли автоматически (место лова на мостках открывается вместе с ними)
function autoOpen(G) {
  const L = layout(G.mode);
  for (const e of L.E) if (e.def.auto && !G.e[e.i].o && e.after.every((a) => G.e[a].o)) { G.e[e.i].o = 1; G.bv++; }
  for (const e of L.E) if (e.k === "board" && !G.e[e.i].o && e.after.every((a) => G.e[a].o)) { G.e[e.i].o = 1; G.bv++; }
}

/* ---------- препятствия и ходьба ---------- */
let boxCache = { key: "", bv: -1, list: [] };
export function boxes(G) {
  const L = layout(G.mode);
  if (boxCache.key === L.key && boxCache.bv === G.bv && boxCache.g === G) return boxCache.list;
  const list = [];
  for (const e of L.E) if (e.box && G.e[e.i].o) list.push(e.box);
  for (const f of L.fences) list.push(f);
  for (const d of L.deco) list.push(d.box);
  for (const f of L.div) list.push(f);
  boxCache = { key: L.key, bv: G.bv, g: G, list };
  return list;
}
function inWater(G, L, x, z) {
  if (z >= shoreZ(L, x)) return false;
  for (const e of L.E) {
    if (e.k === "spot" && !e.def.auto && hyp(x - e.zin.x, z - e.zin.z) < e.zin.r + 0.35) return false;   // отмель — можно зайти в воду
    if (e.k === "pier" && G.e[e.i].o && Math.abs(x - e.pier.x) < 0.95 && z > e.pier.z1 - 0.3 && z < e.pier.z0 + 0.5) return false;
    if (e.k === "dock" && G.e[e.i].o && hyp(x - e.x, z - e.z) < 1.3) return false;
  }
  return true;
}
function walkable(G, L, x, z, r, who) {
  const M = L.MAP;
  if (x < M.w[0] + 0.3 || x > M.w[1] - 0.3 || z > (who === "c" ? 26 : L.fz - 0.35) || z < M.d[0]) return false;
  if (inWater(G, L, x, z)) return false;
  for (const b of boxes(G)) if (x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r) return false;
  return true;
}
// шаг с упором в стены: если прямо нельзя — скользим вдоль
function moveAgent(G, a, dx, dz, who) {
  const L = layout(G.mode), r = 0.3;
  if (!dx && !dz) return;
  if (walkable(G, L, a.x + dx, a.z + dz, r, who)) { a.x += dx; a.z += dz; return; }
  if (walkable(G, L, a.x + dx, a.z, r, who)) { a.x += dx; return; }
  if (walkable(G, L, a.x, a.z + dz, r, who)) { a.z += dz; return; }
  // застряли (например, на месте только что поставленного здания) — выталкиваем
  if (!walkable(G, L, a.x, a.z, r, who)) for (let k = 1; k <= 12; k++) { const ang = k * 2.4, d = 0.15 * k; const nx = a.x + Math.cos(ang) * d, nz = a.z + Math.sin(ang) * d; if (walkable(G, L, nx, nz, r, who)) { a.x = nx; a.z = nz; return; } }
}
// отрезок пересекает прямоугольник (расширенный на m)?
function segBox(ax, az, bx, bz, b, m) {
  const x0 = b[0] - m, z0 = b[1] - m, x1 = b[2] + m, z1 = b[3] + m;
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz], q = [ax - x0, x1 - ax, az - z0, z1 - az];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return -1; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return -1; if (t > t0) t0 = t; } else { if (t < t0) return -1; if (t < t1) t1 = t; }
  }
  return t0;
}
// куда идти, чтобы обойти здания (один обходной угол)
function via(G, ax, az, tx, tz) {
  // вода: сначала выйти на берег; в воду (отмель, мостки) — заходить с берега прямо
  const L = layout(G.mode), aw = az < shoreZ(L, ax) + 0.05, tw = tz < shoreZ(L, tx) + 0.05;
  if (aw && (!tw || Math.abs(ax - tx) > 1.4)) return [ax, shoreZ(L, ax) + 0.75];
  if (!aw && tw) { const ex = tx, ez = shoreZ(L, tx) + 0.55; if (Math.abs(ax - ex) > 0.45 || az > ez + 0.3) return viaBox(G, ax, az, ex, ez) || [ex, ez]; return null; }
  return viaBox(G, ax, az, tx, tz);
}
function viaBox(G, ax, az, tx, tz) {
  let best = null, bt = 2;
  for (const b of boxes(G)) { const t = segBox(ax, az, tx, tz, b, 0.32); if (t >= 0 && t < bt) { bt = t; best = b; } }
  if (!best) return null;
  const m = 0.62, cs = [[best[0] - m, best[1] - m], [best[2] + m, best[1] - m], [best[0] - m, best[3] + m], [best[2] + m, best[3] + m]];
  let c = null, cd = 1e9;
  // угол, из которого цель видна (или видна через соседний угол)
  const rest = (k) => {
    if (segBox(k[0], k[1], tx, tz, best, 0.3) < 0) return hyp(tx - k[0], tz - k[1]);
    let r = 1e9;
    for (const k2 of cs) { if (k2 === k || segBox(k[0], k[1], k2[0], k2[1], best, 0.3) >= 0 || segBox(k2[0], k2[1], tx, tz, best, 0.3) >= 0) continue; r = Math.min(r, hyp(k2[0] - k[0], k2[1] - k[1]) + hyp(tx - k2[0], tz - k2[1])); }
    return r;
  };
  for (const k of cs) { const d0 = hyp(k[0] - ax, k[1] - az); if (d0 < 0.3 || segBox(ax, az, k[0], k[1], best, 0.3) >= 0) continue; const d = d0 + rest(k); if (d < cd) { cd = d; c = k; } }
  if (!c) { for (const k of cs) { const d = hyp(k[0] - ax, k[1] - az); if (d < cd) { cd = d; c = k; } } }
  return c;
}
// идти к точке; true — пришли
function goTo(G, a, tx, tz, spd, dt, who, near) {
  const d = hyp(tx - a.x, tz - a.z);
  if (d < (near || 0.25)) { a.mv = 0; return true; }
  let gx = tx, gz = tz;
  if (who !== "c") { const w = via(G, a.x, a.z, tx, tz); if (w) { gx = w[0]; gz = w[1]; } }
  const dd = hyp(gx - a.x, gz - a.z) || 1, st = Math.min(spd * dt, dd);
  const ox = a.x, oz = a.z;
  moveAgent(G, a, (gx - a.x) / dd * st, (gz - a.z) / dd * st, who);
  if (a.x !== ox || a.z !== oz) a.dir = Math.atan2(a.x - ox, a.z - oz);
  a.mv = 1;
  return false;
}
// игрок двигается джойстиком (jx, jz — направление и сила 0..1)
export function movePlayer(G, pi, jx, jz, dt) {
  const p = G.pl[pi]; const m = hyp(jx, jz);
  if (m < 0.05) { p.mv = 0; return; }
  const s = speedOf(G, p.team) * Math.min(1, m) * dt;
  moveAgent(G, p, jx / m * s, jz / m * s, "p");
  p.dir = Math.atan2(jx, jz); p.mv = Math.min(1, m);
}
export function inZone(a, z, pad) { return z && hyp(a.x - z.x, a.z - z.z) < z.r + (pad || 0); }

/* ---------- операции ----------
   ["c", e]  поймать рыбу на месте лова    ["d", e, it] положить предмет      ["p", e] взять готовое
   ["m", e, amt] заплатить в площадку       ["k", e] забрать выручку
   a — кто делает: "p0"/"p1" игрок, "h3" помощник. Возвращает true, если получилось. */
function agentOf(G, a) { return a[0] === "p" ? G.pl[+a.slice(1)] : G.hp[+a.slice(1)]; }
function capFor(G, a) { const ag = agentOf(G, a); return a[0] === "p" ? capOf(G, ag.team) : UPG.crew.v(G.upg[ag.team].crew); }
export function accepts(G, ei, it) {
  const L = layout(G.mode), e = L.E[ei], s = G.e[ei];
  if (!s.o) return false;
  if (e.k === "proc") { const k = e.rec.in.indexOf(it); return k >= 0 && s.ib[k] < 18; }
  if (e.k === "stall") return e.item === it && s.sh < 24;
  if (e.k === "dock") return e.acc.includes(it) && s.pile.length < e.def.cap;
  if (e.k === "board") return !!(G.con && G.con.it === it && G.con.got < G.con.n && !G.con.end);
  return false;
}
export function applyOp(G, a, op) {
  const L = layout(G.mode), ag = agentOf(G, a); if (!ag) return false;
  const ei = op[1], e = L.E[ei], s = G.e[ei]; if (!e || !s) return false;
  const team = ag.team;
  if (e.team !== team && G.mode === "vs" && op[0] !== "c") return false;
  switch (op[0]) {
    case "c": {
      if (e.k !== "spot" || !s.o || s.f <= 0 || ag.st.length >= capFor(G, a)) return false;
      s.f--; ag.st.push(e.item); G.ev.push({ t: "catch", a, e: ei, it: e.item }); return true;
    }
    case "d": {
      const it = op[2]; const k = ag.st.lastIndexOf(it);
      if (k < 0 || !accepts(G, ei, it)) return false;
      ag.st.splice(k, 1);
      if (e.k === "proc") s.ib[e.rec.in.indexOf(it)]++;
      else if (e.k === "stall") s.sh++;
      else if (e.k === "dock") s.pile.push(it);
      else if (e.k === "board") { G.con.got++; if (G.con.got >= G.con.n) finishContract(G, true); }
      G.ev.push({ t: "drop", a, e: ei, it, k }); return true;
    }
    case "p": {
      if (!(e.k === "proc" || e.k === "gen") || !s.o || s.ob <= 0 || ag.st.length >= capFor(G, a)) return false;
      s.ob--; const it = e.k === "gen" ? e.item : e.rec.out; ag.st.push(it); G.ev.push({ t: "pick", a, e: ei, it }); return true;
    }
    case "m": {
      if (!padVisible(G, ei)) return false;
      const cost = padCost(G, ei), amt = Math.min(op[2], G.money[team], cost - s.p);
      if (amt <= 0) return false;
      G.money[team] -= amt; s.p += amt; G.spent[team] += amt;
      G.ev.push({ t: "padpay", a, e: ei, amt });
      if (s.p >= cost - 0.001) unlock(G, ei);
      return true;
    }
    case "k": {
      const amt = s.cash || 0; if (amt <= 0) return false;
      s.cash = 0; G.money[team] += amt;
      G.ev.push({ t: "cash", a, e: ei, amt }); return true;
    }
  }
  return false;
}
function unlock(G, ei) {
  const L = layout(G.mode), e = L.E[ei], s = G.e[ei];
  s.p = 0;
  if (e.k === "upg") { G.upg[e.team][e.def.u]++; G.ev.push({ t: "upg", e: ei, u: e.def.u, lv: G.upg[e.team][e.def.u], team: e.team }); return; }
  s.o = 1; G.bv++;
  if (e.k === "helper") G.hp.push({ e: ei, team: e.team, x: e.zpad.x, z: e.zpad.z, dir: 0, st: [], s: 0, tm: 0, xt: 0, mv: 0, tg: -1 });
  G.ev.push({ t: "open", e: ei, team: e.team });
  // кто стоял на месте новой постройки — выходит к её выходу (или на юг)
  if (e.box) for (const a of [...G.pl, ...G.hp]) {
    const bx = e.box; if (a.x > bx[0] - 0.3 && a.x < bx[2] + 0.3 && a.z > bx[1] - 0.3 && a.z < bx[3] + 0.3) { const z = e.zout || e.zin || { x: e.x, z: bx[3] + 0.9 }; a.x = z.x; a.z = z.z + (z === e.zin ? 0 : 0.2); }
  }
  if (e.k === "goal" && G.done < 0) { G.done = e.team; if (G.mode === "vs" && G.winner < 0) G.winner = e.team; G.ev.push({ t: "goal", team: e.team }); }
  autoOpen(G);
}

/* ---------- взаимодействие по близости: что сделал бы игрок, стоя здесь ----------
   Возвращает операцию или null. Используется и для игрока (хозяин/гость), и для бота. */
export function proximityOps(G, pi, dt, loc) {
  const L = layout(G.mode), p = G.pl[pi], team = p.team, a = "p" + pi;
  loc = loc || p;              // таймеры: у гостя свои, у хозяина — в игроке
  const ops = [];
  loc.xt = Math.max(0, (loc.xt || 0) - dt); loc.ct = Math.max(0, (loc.ct || 0) - dt); loc.pt = (loc.pt || 0) + dt;
  let onPad = -1;
  for (const e of L.E) {
    if (e.team !== team && G.mode === "vs") continue;
    const s = G.e[e.i];
    // площадка покупки: деньги утекают, пока стоишь
    if (padVisible(G, e.i) && inZone(p, e.zpad)) {
      onPad = e.i;
      if (loc.padE !== e.i) { loc.padE = e.i; loc.pt = 0; loc.pay = 0; }
      // проходя мимо, не платим: нужно остановиться (или постоять подольше)
      if ((loc.pt > 0.3 && !(p.mv > 0.35)) || loc.pt > 1.1) loc.pay = 1;
      if (loc.pay && G.money[team] > 0) {
        const cost = padCost(G, e.i), rate = Math.max(cost / 1.7, 12), need = cost - s.p;
        loc.pacc = Math.min((loc.pacc || 0) + rate * dt, need + 1);
        let amt = Math.min(Math.floor(loc.pacc), G.money[team], need);
        if (amt <= 0 && (need < 1 || G.money[team] < 1)) amt = Math.min(G.money[team], need);
        if (amt > 0.0001) { loc.pacc = Math.max(0, loc.pacc - amt); ops.push(["m", e.i, amt]); }
      }
      continue;
    }
    if (!s.o) continue;
    if (e.zcash && (s.cash || 0) > 0 && inZone(p, e.zcash, 0.15)) ops.push(["k", e.i]);
  }
  if (onPad < 0) { loc.padE = -1; loc.pacc = 0; }
  if (loc.xt <= 0) {
    // положить (сверху стопки — первое, что примут)
    let done = false;
    for (const e of L.E) {
      if (done || (e.team !== team && G.mode === "vs") || !e.zin || e.k === "spot" || !G.e[e.i].o || !inZone(p, e.zin)) continue;
      for (let k = p.st.length - 1; k >= 0; k--) { if (accepts(G, e.i, p.st[k])) { ops.push(["d", e.i, p.st[k]]); done = true; break; } }
    }
    // взять готовое
    if (!done && p.st.length < capOf(G, team)) for (const e of L.E) {
      if ((e.team !== team && G.mode === "vs") || !e.zout || !G.e[e.i].o || G.e[e.i].ob <= 0 || !inZone(p, e.zout)) continue;
      ops.push(["p", e.i]); done = true; break;
    }
    if (done) loc.xt = PLAYER.xferT;
  }
  // ловля
  if (loc.ct <= 0 && p.st.length < capOf(G, team)) for (const e of L.E) {
    if ((e.team !== team && G.mode === "vs") || e.k !== "spot" || !G.e[e.i].o || G.e[e.i].f <= 0 || !inZone(p, e.zin)) continue;
    ops.push(["c", e.i]); loc.ct = catchOf(G, team); break;
  }
  return ops;
}

/* ---------- шаг мира ---------- */
export function step(G, dt, opt) {
  opt = opt || {};
  const L = layout(G.mode);
  if (G.paused) return;
  G.t += dt;
  if (G.winner >= 0 && G.mode === "vs") return;
  // игроки хозяина (и бота) взаимодействуют сами; гостевой игрок — своими операциями (opt.skip)
  for (let pi = 0; pi < G.pl.length; pi++) {
    if (opt.skip && opt.skip[pi]) continue;
    for (const op of proximityOps(G, pi, dt)) applyOp(G, "p" + pi, op);
  }
  for (const e of L.E) {
    const s = G.e[e.i]; if (!s.o) continue;
    if (e.k === "spot") { if (s.f < SCHOOL.max) { s.rt += dt; const per = SCHOOL.regen / (1 + 0.6 * helpersAt(G, e.i)); while (s.rt > per && s.f < SCHOOL.max) { s.rt -= per; s.f++; } } else s.rt = 0; }
    else if (e.k === "proc") {
      const ready = s.ib.every((n) => n > 0) && s.ob < 30;
      if (ready) { s.tm += dt; if (s.tm >= e.rec.t) { s.tm = 0; for (let k = 0; k < s.ib.length; k++) s.ib[k]--; s.ob++; G.ev.push({ t: "made", e: e.i, it: e.rec.out }); } }
      else s.tm = Math.max(0, s.tm - dt);
    } else if (e.k === "gen") {
      if (s.ob < e.def.cap) { s.tm += dt; if (s.tm >= e.def.t) { s.tm = 0; s.ob++; G.ev.push({ t: "made", e: e.i, it: e.item }); } }
    } else if (e.k === "dock") stepDock(G, e, s, dt);
  }
  stepHelpers(G, dt);
  stepCustomers(G, dt);
  if (G.mode !== "vs") stepContract(G, dt);
  // средний доход (для дохода, пока игры нет)
  G.rateAcc += dt;
  if (G.rateAcc >= 10) { const got = G.earned[0] - (G.rateBase || 0); G.rateBase = G.earned[0]; G.rate = G.rate ? G.rate * 0.8 + got / G.rateAcc * 0.2 : got / G.rateAcc; G.rateAcc = 0; }
  if (G.mode === "vs" && G.tEnd && G.t >= G.tEnd && G.winner < 0) { G.winner = G.earned[0] >= G.earned[1] ? 0 : 1; G.ev.push({ t: "goal", team: G.winner, time: 1 }); }
  if (G.ev.length > 400) G.ev.splice(0, G.ev.length - 400);
}
function helpersAt(G, ei) { let n = 0; for (const h of G.hp) if (h.s === 1 && layout(G.mode).E[h.e].from === ei) n++; return n; }

/* ---------- причал и судно ---------- */
function stepDock(G, e, s, dt) {
  s.st -= dt;
  if (s.ship === 0 && s.st <= 0) { s.ship = 1; s.st = 4; G.ev.push({ t: "ship", s: "in", e: e.i }); }
  else if (s.ship === 1 && s.st <= 0) { s.ship = 2; s.st = 40; s.lt = 0; }
  else if (s.ship === 2) {
    s.lt = (s.lt || 0) + dt;
    if (s.pile.length && s.lt > 0.18 && s.load.length < 40) { s.lt = 0; const it = s.pile.pop(); s.load.push(it); G.ev.push({ t: "load", e: e.i, it }); }
    if (s.load.length >= 40 || (s.st <= 0 && s.load.length)) { s.ship = 3; s.st = 4; G.ev.push({ t: "ship", s: "out", e: e.i }); }
    if (s.st <= 0 && !s.load.length) s.st = 10;
  } else if (s.ship === 3 && s.st <= 0) {
    let amt = 0; for (const it of s.load) amt += itemPrice(G, it);
    amt = Math.round(amt * 1.15);
    s.cash += amt; G.earned[e.team] += amt; s.load = []; s.ship = 0; s.st = 14;
    G.ev.push({ t: "pay", e: e.i, amt, ship: 1 });
  }
}

/* ---------- помощники ---------- */
// s: 0 — идёт к источнику, 1 — набирает, 2 — несёт, 3 — отдаёт; кассир: 0 — ищет, 1 — идёт к прилавку
function stepHelpers(G, dt) {
  const L = layout(G.mode);
  for (let hi = 0; hi < G.hp.length; hi++) {
    const h = G.hp[hi], he = L.E[h.e], a = "h" + hi, team = h.team;
    const spd = UPG.crewspd.v(G.upg[team].crewspd), cap = UPG.crew.v(G.upg[team].crew);
    h.xt = Math.max(0, h.xt - dt); h.tm += dt;
    if (he.def.role === "cashier") {
      if (h.tg < 0 || !(G.e[h.tg].cash > 0)) {
        let best = -1, bc = 0;
        for (const e of L.E) if (e.team === team && e.zcash && G.e[e.i].o && (G.e[e.i].cash || 0) > bc && e.k === "stall") { bc = G.e[e.i].cash; best = e.i; }
        h.tg = bc >= 6 * priceMul(G) || (best >= 0 && h.tm > 6) ? best : -1;
        if (h.tg < 0) { goTo(G, h, he.zpad.x, he.zpad.z, spd, dt, "h", 0.4); continue; }
        h.tm = 0;
      }
      const z = L.E[h.tg].zcash;
      if (goTo(G, h, z.x, z.z, spd, dt, "h", 0.5)) { applyOp(G, a, ["k", h.tg]); h.tg = -1; }
      continue;
    }
    const src = L.E[he.from];
    const dest = () => { for (const t of he.to) { if (!G.e[t].o) continue; for (const it of h.st) if (accepts(G, t, it)) return t; } return -1; };
    if (h.s === 0) {
      const z = src.k === "spot" ? src.zin : src.zout;
      const tx = src.k === "spot" ? z.x + Math.sin(hi * 2.1) * z.r * 0.55 : z.x + Math.sin(hi * 1.7) * 0.3;
      const tz = src.k === "spot" ? z.z + Math.cos(hi * 2.1) * z.r * 0.4 : z.z;
      if (goTo(G, h, tx, tz, spd, dt, "h", 0.3)) { h.s = 1; h.tm = 0; }
    } else if (h.s === 1) {
      h.mv = 0;
      if (h.st.length >= cap || (h.st.length && h.tm > 5)) { h.s = 2; h.tm = 0; continue; }
      if (h.xt <= 0) {
        const ok = src.k === "spot" ? applyOp(G, a, ["c", src.i]) : applyOp(G, a, ["p", src.i]);
        h.xt = src.k === "spot" ? HELPER.catchT : HELPER.xferT;
        if (ok) h.tm = Math.min(h.tm, 3.5);
      }
    } else if (h.s === 2) {
      if (!h.st.length) { h.s = 0; continue; }
      let t = dest();
      if (t < 0) { h.mv = 0; if (h.tm > 1) h.tm = 0; continue; }     // некуда нести — ждём
      h.tg = t;
      const z = L.E[t].zin;
      if (goTo(G, h, z.x + Math.sin(hi) * 0.25, z.z, spd, dt, "h", 0.45)) { h.s = 3; h.tm = 0; }
    } else if (h.s === 3) {
      h.mv = 0;
      if (h.xt <= 0) {
        let did = false;
        for (let k = h.st.length - 1; k >= 0 && !did; k--) if (accepts(G, h.tg, h.st[k])) did = applyOp(G, a, ["d", h.tg, h.st[k]]);
        h.xt = HELPER.xferT;
        if (!did) { h.s = h.st.length ? 2 : 0; h.tm = 0; if (h.st.length && h.tg >= 0 && dest() === h.tg) h.s = 3; }
        if (!h.st.length) { h.s = 0; }
      }
    }
  }
}

/* ---------- покупатели ----------
   s: 0 — идёт к толпе, 1 — ждёт в толпе, 2 — идёт в очередь / стоит в ней, 4 — уходит */
function openStalls(G) { const L = layout(G.mode); return L.E.filter((e) => e.k === "stall" && G.e[e.i].o); }
function stepCustomers(G, dt) {
  const L = layout(G.mode), stalls = openStalls(G);
  const pat0 = CUSTOMER.patience * (G.mode === "vs" ? 0.85 : DIFF[G.diff].pat);
  // кого сколько хотят (по товару)
  const wantN = new Array(NIT).fill(0);
  for (const c of G.cu) if (c.s < 4) wantN[c.w]++;
  const items = [...new Set(stalls.map((e) => e.item))];
  G.spT = (G.spT || 0) - dt;
  if (items.length && G.spT <= 0) {
    const free = items.filter((it) => wantN[it] < (G.mode === "vs" ? 16 : 13));
    G.spT = 1.15 / Math.sqrt(items.length) * (0.7 + rnd(G) * 0.6);
    if (free.length && G.cu.length < 64) {
      const it = free[Math.floor(rnd(G) * free.length)];
      const nmax = it === IT.herring ? 4 : it === IT.caviar ? 2 : 3;
      const cx = L.crowd;
      G.cu.push({ id: G.nid++, x: (rnd(G) * 2 - 1) * 13, z: ROAD_Z + 1.5 + rnd(G), dir: Math.PI, s: 0, w: it, n: 1 + Math.floor(rnd(G) * nmax + (G.bay > 0 ? 1 : 0)), g: 0, st: -1, pat: pat0, pm: pat0,
        tx: cx[0] + rnd(G) * (cx[1] - cx[0]), tz: cx[2] + rnd(G) * (cx[3] - cx[2]), lk: rnd(G) * 6, bt: 0, mood: 0, sk: Math.floor(rnd(G) * 6), mv: 0 });
    }
  }
  // очереди: выбрать прилавок для ждущих
  for (const e of stalls) {
    const q = G.e[e.i].q;
    for (let k = q.length - 1; k >= 0; k--) { const c = G.cu.find((u) => u.id === q[k]); if (!c || c.st !== e.i || c.s !== 2) q.splice(k, 1); }
  }
  for (const c of G.cu) {
    if (c.s === 1 || c.s === 0) {
      let best = -1, bs = 1e9;
      for (const e of stalls) {
        if (e.item !== c.w) continue;
        const s = G.e[e.i]; if (s.q.length >= 5) continue;
        const sc = s.q.length * 1.5 + (s.sh > 0 ? 0 : 2) + hyp(c.x - e.x, c.z - e.z) * 0.05 + rnd(G) * 0.6;
        if (sc < bs) { bs = sc; best = e.i; }
      }
      if (best >= 0 && (c.s === 1 || c.z < 19.5)) { c.s = 2; c.st = best; G.e[best].q.push(c.id); }
    }
  }
  for (let ci = G.cu.length - 1; ci >= 0; ci--) {
    const c = G.cu[ci], spd = CUSTOMER.speed;
    if (c.s === 0) { if (goTo(G, c, c.tx, c.tz, spd, dt, "c", 0.3)) c.s = 1; }
    else if (c.s === 1) { c.mv = 0; c.pat = Math.max(c.pm * 0.5, c.pat - dt * 0.1); c.dir += Math.sin(G.t * 0.7 + c.lk) * dt * 0.4; }
    else if (c.s === 2) {
      const e = L.E[c.st], s = G.e[c.st], k = s.q.indexOf(c.id);
      if (k < 0) { c.s = 1; continue; }
      const sl = e.slots[k];
      // через проход в заборе
      let tx = sl.x, tz = sl.z;
      if (c.z > L.fz - 0.2 && Math.abs(c.x - sl.x) > 0.35) { tx = sl.x; tz = L.fz + 0.9; }
      const at = goTo(G, c, tx, tz, spd, dt, "c", 0.12) && tz === sl.z;
      if (at) { c.dir = Math.PI; c.mv = 0; }
      c.pat -= dt * (k === 0 && at ? 1 : 0.55);
      c.mood = c.pat < c.pm * 0.35 ? 2 : 0;
      if (k === 0 && at) {
        c.bt += dt;
        if (c.g < c.n && s.sh > 0 && c.bt > CUSTOMER.buyT) { c.bt = 0; s.sh--; c.g++; G.ev.push({ t: "buy", c: c.id, e: c.st, it: c.w }); c.pat = Math.min(c.pm, c.pat + 4); }
        if (c.g >= c.n) {
          const amt = Math.round(itemPrice(G, c.w) * c.n * (c.mood === 2 ? 0.9 : 1) * 10) / 10;
          s.cash += amt; G.earned[e.team] += amt; G.served++;
          G.ev.push({ t: "pay", e: c.st, amt, c: c.id });
          s.q.splice(0, 1); c.s = 4; c.mood = 1; c.tx = c.x + (c.x < 0 ? -2 : 2); c.tz = ROAD_Z + 3;
          continue;
        }
      }
      // соперник (в «друг против друга») — уходим к нему, если у него есть товар и место
      if (G.mode === "vs" && c.mood === 2 && !c.sw && k > 0) {
        const alt = stalls.find((o) => o.item === c.w && o.i !== c.st && G.e[o.i].sh > 0 && G.e[o.i].q.length < 5);
        if (alt) { s.q.splice(k, 1); c.st = alt.i; c.sw = 1; c.pat = c.pm * 0.6; G.e[alt.i].q.push(c.id); G.ev.push({ t: "switch", c: c.id, e: alt.i }); continue; }
      }
      if (c.pat <= 0) { s.q.splice(k, 1); c.s = 4; c.mood = 3; c.tx = c.x; c.tz = ROAD_Z + 3; G.lost++; G.ev.push({ t: "angry", c: c.id, e: c.st }); }
    } else if (c.s === 4) {
      if (c.z < L.fz + 0.4 && Math.abs(c.x - L.E[c.st >= 0 ? c.st : 0].x) < 1.2 && c.st >= 0) { goTo(G, c, L.E[c.st].x, L.fz + 1, spd * 1.1, dt, "c", 0.3); }
      else if (goTo(G, c, c.tx, c.tz, spd * 1.1, dt, "c", 0.4) || c.z > ROAD_Z + 2) G.cu.splice(ci, 1);
    }
  }
}

/* ---------- заказы (вместе / один) ---------- */
function stepContract(G, dt) {
  const L = layout(G.mode), bi = L.byId[0].board;
  if (bi == null || !G.e[bi].o) return;
  if (!G.con) {
    G.conT -= dt;
    if (G.conT > 0) return;
    const its = openStalls(G).map((e) => e.item);
    const dock = L.byId[0].dock; if (dock != null && G.e[dock].o) { if (G.e[L.byId[0].cannery].o) its.push(IT.can); if (G.e[L.byId[0].icehouse].o) its.push(IT.crate); }
    const pool = its.filter((it) => it !== IT.herring || its.length < 3);
    const it = pool[Math.floor(rnd(G) * pool.length)];
    const tier = ITEMS[it].price || ITEMS[it].ship;
    const n = Math.max(8, Math.round((14 + G.cdone * 2.2) * Math.pow(6 / tier, 0.35)));
    const T = Math.round((70 + n * 3.2) * DIFF[G.diff].ct);
    G.con = { it, n, got: 0, T, t: T, rw: Math.round(itemPrice(G, it) * n * 2.6), end: 0 };
    G.ev.push({ t: "contract", s: "new" });
    return;
  }
  const c = G.con;
  if (c.end) { c.end -= dt; if (c.end <= 0.0001) { G.con = null; G.conT = 25; } return; }
  c.t -= dt;
  if (c.t <= 0) finishContract(G, false);
}
function finishContract(G, ok) {
  const L = layout(G.mode), c = G.con; if (!c || c.end) return;
  c.end = 3; c.ok = ok ? 1 : 0;
  if (ok) { G.e[L.byId[0].board].cash += c.rw; G.earned[0] += c.rw; G.cdone++; G.stars += DIFF[G.diff].star; G.ev.push({ t: "contract", s: "done", amt: c.rw }); }
  else { G.cfail++; G.ev.push({ t: "contract", s: "fail" }); }
}

/* ---------- доход, пока игры не было ---------- */
export function offline(G, sec) {
  const helpers = G.hp.length; if (!helpers || !(G.rate > 0) || G.mode === "vs") return 0;
  const k = Math.min(0.35, 0.06 + helpers * 0.02);
  return Math.floor(G.rate * k * Math.min(sec, 2 * 3600));
}

/* ---------- прогресс ---------- */
export function progress(G, team) {
  const L = layout(G.mode); let n = 0, o = 0;
  for (const e of L.E) { if (e.team !== (team || 0) || e.k === "upg" || e.def.free || e.def.auto || e.k === "board") continue; n++; if (G.e[e.i].o) o++; }
  return { n, o };
}
// следующая цель для подсказки: доступная площадка подешевле
export function nextPad(G, team) {
  const L = layout(G.mode); let best = -1, bc = 1e18;
  for (const e of L.E) { if (e.team !== team || !padVisible(G, e.i)) continue; const c = padCost(G, e.i) - G.e[e.i].p; const w = c * (e.k === "upg" ? 1.6 : 1); if (w < bc) { bc = w; best = e.i; } }
  return best;
}

/* ---------- сериализация ---------- */
export function serialize(G) { const o = Object.assign({}, G); o.ev = []; return JSON.stringify(o); }
export function deserialize(s) {
  try {
    const G = typeof s === "string" ? JSON.parse(s) : s;
    if (!G || !G.e || !G.pl) return null;
    G.ev = []; layout(G.mode);
    return G;
  } catch (_) { return null; }
}
export { rnd, via, goTo, hyp };
// открыть место без оплаты (заставка меню, отладка)
export function forceOpen(G, ei) { const L = layout(G.mode), e = L.E[ei]; if (e.k === "upg") { G.upg[e.team][e.def.u]++; return; } if (!G.e[ei].o) unlock(G, ei); }
