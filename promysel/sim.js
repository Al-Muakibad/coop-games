// «Промысел» — симуляция мира. Без DOM и three.js: её крутит хозяин (и одиночная игра), её же гоняет tools/balance.mjs.
// Состояние G сериализуется целиком (сохранение и снимки для гостя). Статичная раскладка карты — в layoutOf(G).
// Действия игроков — «операции» (op): поймать, положить, взять, заплатить, собрать выручку. Гость применяет их у себя сразу
// и отправляет хозяину; хозяин проверяет и применяет у себя (см. coop.js).
import { ITEMS, IT, NIT, PLAYER, HELPER, SCHOOL, CUSTOMER, PAD_R, UPG, SUPG, upgCost, LEGACY, VS, BAYMAPS, BAYS_OLD, DIFF, ROAD_Z, EVENTS, DECO_MAX, IDS_V2, OUTFITS, PET, RIDES, RARE, ROUTES, ARCH, BAYS } from "./data.js";

const TAU = Math.PI * 2;
const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- раскладка ---------- */
const LAYOUTS = {};
// раскладка: «друг против друга» — одна карта; «вместе»/«один» — своя карта у каждой бухты; старые сохранения (v < 2) — старая карта
export const layoutOf = (G) => layout(G.mode, G.bay, G.v);
export function layout(mode, bay, v) {
  const key = mode === "vs" ? "vs" : (v || 2) < 2 ? "old" : "b" + ((bay || 0) % BAYMAPS.length);
  if (LAYOUTS[key]) return LAYOUTS[key];
  const MAP = key === "vs" ? VS : key === "old" ? LEGACY : BAYMAPS[+key.slice(1)], teams = key === "vs" ? 2 : 1;
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
      // вход и выход цеха — оба спереди (со стороны камеры): вход слева, выход справа
      const fz = e.z + e.d / 2 + 0.95;
      if (e.k === "proc") {
        e.zin = { x: e.x - (e.w / 2 - 0.12) * sg, z: fz, r: 1.0 };
        e.zout = { x: e.x + (e.w / 2 - 0.12) * sg, z: fz, r: 1.0 };
        e.box = [e.x - e.w / 2, e.z - e.d / 2, e.x + e.w / 2, e.z + e.d / 2];
      }
      if (e.k === "gen") { e.zout = { x: e.x + (e.w / 2 - 0.25) * sg, z: fz, r: 1.0 }; e.box = [e.x - e.w / 2, e.z - e.d / 2, e.x + e.w / 2, e.z + e.d / 2]; }
      void side;
      if (e.k === "stall") {
        e.w = 2.6; e.d = 0.9;
        e.zin = { x: e.x - 0.45 * sg, z: e.z - 1.2, r: 1.0 };
        e.zcash = { x: e.x + 0.95 * sg, z: e.z - 1.15, r: 0.85 };
        e.box = [e.x - 1.3, e.z - 0.45, e.x + 1.3, e.z + 0.45];
        e.slots = []; for (let s = 0; s < 5; s++) e.slots.push({ x: e.x, z: e.z + 1.25 + s * 0.85 });
      }
      if (e.k === "dock") { e.zin = { x: e.x, z: e.z, r: 1.05 }; e.zcash = { x: e.x + 0.9 * sg, z: e.z + 1.5, r: 0.8 }; e.berth = { x: e.x - 2.7 * sg, z: e.z - 0.8 }; }
      if (e.k === "board") { e.zin = { x: e.x - 0.55, z: e.z + 1.35, r: 1.05 }; e.zcash = { x: e.x + 1.0, z: e.z + 1.3, r: 0.8 }; e.box = [e.x - 1.1, e.z - 0.3, e.x + 1.1, e.z + 0.3]; }
      if (e.k === "goal") e.box = [e.x - 1.1, e.z - 1.1, e.x + 1.1, e.z + 1.1];
      if (e.k === "hut") { e.box = [e.x - e.w / 2, e.z - e.d / 2, e.x + e.w / 2, e.z + e.d / 2]; e.zin = { x: e.x, z: fz, r: 1.0 }; e.slot = (def.slot || 0) + (key === "vs" ? team : 0); }
      if (e.k === "hire") { e.box = [e.x - e.w / 2, e.z - e.d / 2, e.x + e.w / 2, e.z + e.d / 2]; e.zin = { x: e.x, z: fz, r: 1.0 }; }
      if (e.k === "ads") { e.w = 1.0; e.d = 0.7; e.box = [e.x - 0.5, e.z - 0.35, e.x + 0.5, e.z + 0.35]; e.zin = { x: e.x, z: e.z + 0.35 + 0.85, r: 0.85 }; }
      if (e.k === "pier") e.pier = { x: def.x0 * sg, z0: def.z0, z1: def.z1 };
      if (e.k === "spot") e.school = { x: def.sx * sg, z: def.sz };
      byId[team][def.id] = e.i;
      E.push(e);
    }
  }
  // цены одинаковы во всех бухтах: n-я постройка и n-й наём стоят как в первой бухте (ничего не дорожает от бухты к бухте)
  if (key[0] === "b") {
    const isB = (d) => ["stall", "proc", "gen", "pier", "dock"].includes(d.k) && !d.free && !d.auto, isH = (d) => d.k === "helper";
    const B1 = BAYMAPS[0].ents, sb = B1.filter(isB).map((d) => d.cost), sh = B1.filter(isH).map((d) => d.cost);
    const pick = (seq, k) => (k < seq.length ? seq[k] : seq[seq.length - 1] * Math.pow(1.2, k - seq.length + 1));
    let kb = 0, kh = 0;
    for (const e of E) { if (isB(e.def)) e.cost = Math.round(pick(sb, kb++)); else if (isH(e.def)) e.cost = Math.round(pick(sh, kh++)); }      // маяк — цель бухты, а не улучшение: его цена своя у каждой бухты
  }
  for (const e of E) {
    // помощники без своего места на карте (их нанимают в артели): ждут работы у прилавков
    if (e.k === "helper" && (e.def.x == null || e.def.z == null)) { const st = E.filter((o) => o.k === "stall" && o.team === e.team); const ax = st.reduce((a, o) => a + o.x, 0) / Math.max(1, st.length); e.x = ax; e.z = (st[0] ? st[0].z : 6.8) - 2.7; e.zpad = { x: e.x, z: e.z, r: PAD_R }; }
    e.after = (e.def.after || []).map((id) => byId[e.team][id]).filter((v) => v != null);
    if (e.def.from) e.from = byId[e.team][e.def.from];
    if (e.def.to) e.to = e.def.to.map((id) => byId[e.team][id]).filter((v) => v != null);
    if (e.def.of) e.tg = byId[e.team][e.def.of];
  }
  // забор рынка: от края до края, с проходами к очередям
  const fz = 11.95, fences = [];
  const gaps = E.filter((e) => e.k === "stall").map((e) => e.x).sort((a, b) => a - b);
  let x0 = MAP.w[0];
  for (const gx of gaps) { if (gx - 0.75 > x0 + 0.2) fences.push([x0, fz - 0.15, gx - 0.75, fz + 0.15]); x0 = gx + 0.75; }
  if (MAP.w[1] > x0 + 0.2) fences.push([x0, fz - 0.15, MAP.w[1], fz + 0.15]);
  const div = key === "vs" ? [[-0.15, -13.6, 0.15, fz]] : [];
  const deco = []; for (const d of MAP.deco || []) for (let t = 0; t < teams; t++) { const sg = t ? -1 : 1; deco.push({ m: d.m, x: d.x * sg, z: d.z, box: [d.x * sg - d.w / 2, d.z - d.d / 2, d.x * sg + d.w / 2, d.z + d.d / 2] }); }
  const L = { key, MAP, E, byId, teams, fences, div, fz, deco, crowd: key === "vs" ? [-12, 12, 13.2, 18] : [-12.5, 12.5, 13.2, 18], start: MAP.start, hire: E.filter((e) => e.k === "hire").map((e) => e.i), ads: E.filter((e) => e.k === "ads").map((e) => e.i), huts: E.filter((e) => e.k === "hut").map((e) => e.i) };
  LAYOUTS[key] = L;
  return L;
}
// берег: где кончается суша (z меньше — море)
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function shoreZ(L, x) {
  const sh = L.MAP.shore; let z = sh.base;
  for (const c of sh.capes) { const k = c[3] === 2 ? 1 - ss(c[0], c[1], Math.abs(x)) : c[3] < 0 ? 1 - ss(c[0], c[1], x) : ss(c[0], c[1], x); z += (c[2] - sh.base) * k; }
  return z;
}
/* ---------- случайные числа (в состоянии, чтобы сохранение продолжало ту же цепочку) ---------- */
function rnd(G) { let t = (G.rs = (G.rs + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

/* ---------- новая игра ----------
   o: mode, seed, bay, diff, goal, perks (знаки забега), meta (уровни «Флота»), upg (улучшения, перенесённые из прошлой бухты), lap (круг), cid */
export function newGame(o) {
  o = o || {};
  const mode = o.mode || "solo", v = o.v || 2;
  const L = layout(mode, o.bay || 0, v);
  const G = {
    v, mode, rs: (o.seed || 1) | 0, t: 0, bay: o.bay || 0, lap: o.lap || 0, diff: o.diff == null ? 1 : o.diff, goal: o.goal || "light", tEnd: o.goal === "time" ? 600 : 0,
    perks: Object.assign({}, o.perks || {}), meta: mode === "vs" ? {} : Object.assign({}, o.meta || {}),
    teams: L.teams, money: [o.money || 0, o.money || 0], earned: [0, 0], spent: [0, 0], nbuy: 0, ne: L.E.length,
    upg: [{}, {}], e: [], pl: [], hp: [], cu: [], nid: 1, ev: [], bv: 1,
    con: null, conT: 40, stars: 0, cdone: 0, cfail: 0, done: -1, winner: -1, rate: 0, rateAcc: 0, served: 0, lost: 0,
    big: null, bigN: 0, bigS: 0, deco: 0, evt: null, traps: [],
    cid: o.cid || Math.random().toString(36).slice(2, 10),
  };
  if (mode === "vs") G.perks = {};
  for (const t of [0, 1]) for (const u in UPG) G.upg[t][u] = (o.upg && o.upg[u]) || 0;
  G.ids = L.E.map((e) => e.id + (e.team ? "@1" : ""));
  for (const e of L.E) G.e.push(entState(e));
  const np = mode === "solo" ? 1 : 2;
  for (let i = 0; i < np; i++) {
    const sg = mode === "vs" && i === 1 ? -1 : 1;
    const sx = L.start[0] * sg + (mode === "coop" ? (i ? 1.4 : -0.6) : 0);
    const g0 = o.gear && o.gear[i] ? o.gear[i] : o.gear && o.gear[0] ? o.gear[0] : null;
    G.pl.push({ x: sx, z: L.start[1], dir: Math.PI, st: [], team: mode === "vs" ? i : 0, xt: 0, ct: 0, mv: 0, on: 1, g: Object.assign({ bag: 0, boots: 0, net: 0, reach: 0 }, g0 || {}) });
  }
  if (mode !== "vs" && v >= 2) {
    // подъёмные и запас в кармане — в деньгах этой бухты
    G.money[0] += Math.round((150 * pk(G, "e_start") + 60 * mt(G, "m_start")) * (L.MAP.pl || 1));
    // готовый цех: первый цех бухты построен (с тем, без чего он не открылся бы) и ускорен
    if (pk(G, "s_pre")) {
      const first = L.E.find((e) => e.k === "proc");
      const openDeps = (e) => { for (const a of e.after) if (!G.e[a].o && L.E[a].k !== "helper") openDeps(L.E[a]); if (!G.e[e.i].o) { G.e[e.i].o = 1; } };
      if (first) { openDeps(first); G.e[first.i].lv = 1; G.bv++; autoOpen(G); }
    }
  }
  return G;
}
function entState(e) {
  const s = { o: e.def.free ? 1 : 0, p: 0 };
  if (e.k === "spot") { s.f = SCHOOL.max; s.rt = 0; }
  if (e.k === "proc") { s.ib = e.rec.in.map(() => 0); s.ob = 0; s.tm = 0; }
  if (e.k === "gen") { s.ob = 0; s.tm = 0; }
  if (e.k === "stall") { s.sh = 0; s.cash = 0; s.q = []; }
  if (e.k === "dock") { s.pile = []; s.ship = 0; s.st = 6; s.load = []; s.cash = 0; }
  if (e.k === "board") { s.cash = 0; }
  return s;
}
// знак забега и уровень «Флота» (в «друг против друга» не действуют)
export const pk = (G, id) => (G.mode === "vs" ? 0 : (G.perks && G.perks[id]) || 0);
export const mt = (G, id) => (G.mode === "vs" ? 0 : (G.meta && G.meta[id]) || 0);

// что переносится в следующую бухту: всё снаряжение игроков и вся артель — целиком
// цена косметики: -1 — нельзя (уже есть / нет такого), 0 — уже куплено (наряд можно надеть)
export function cosCost(G, pi, u) {
  const g = gearOf(G, pi);
  if (u === "dog") return g.dog ? -1 : PET.cost;
  if (u === "ride") { const n = RIDES[(g.ride || 0) + 1]; return n ? n.cost : -1; }
  const k = +String(u).slice(1), o = OUTFITS[k]; if (!o) return -1;
  if (k === 0 || ((g.ow || 0) & (1 << k))) return (g.out || 0) === k ? -1 : 0;
  return o.cost;
}
// редкий улов: только у хозяина мира (у гостя бросок не делаем — придёт событием)
function rollRare(G, a, e) {
  if (G.gst || G.mode === "vs" || (G.v || 1) < 2) return;
  const bay = (G.bay || 0) % 4, k = a[0] === "p" ? 1 : 0.2;
  for (const r of RARE) {
    if (r.bay !== -1 && r.bay !== bay) continue;
    if (rnd(G) < r.p * k) { const v = Math.round(r.v * priceMul(G)); G.money[0] += v; G.earned[0] += v; G.nrare = (G.nrare || 0) + 1; G.ev.push({ t: "rare", id: r.id, a, v, x: e.zin.x, z: e.zin.z }); return; }
  }
}
// пёс-помощник: бегает к ближайшей кучке выручки и приносит её хозяину
function stepDogs(G, dt) {
  const L = layoutOf(G);
  for (let pi = 0; pi < G.pl.length; pi++) {
    const p = G.pl[pi], g = gearOf(G, pi);
    if (!g.dog) { p.dg = null; continue; }
    const d = p.dg || (p.dg = { x: p.x + 0.8, z: p.z + 0.4, s: 0, t: 0, e: -1, c: 0, dir: 0, mv: 0 });
    const go = (tx, tz, sp) => { const dx = tx - d.x, dz = tz - d.z, l = hyp(dx, dz); if (l < 0.05) { d.mv = 0; return l; } const m = Math.min(l, sp * dt); d.x += dx / l * m; d.z += dz / l * m; d.dir = Math.atan2(dx, dz); d.mv = 1; return l - m; };
    d.t = Math.max(0, d.t - dt);
    if (d.s === 0) {      // рядом с хозяином
      const ox = p.x + Math.sin(p.dir + 2.2) * 0.9, oz = p.z + Math.cos(p.dir + 2.2) * 0.9;
      if (hyp(ox - d.x, oz - d.z) > 0.4) go(ox, oz, Math.max(PET.speed * 0.8, speedOf(G, pi) * 1.1)); else d.mv = 0;
      if (hyp(p.x - d.x, p.z - d.z) > 12) { d.x = ox; d.z = oz; }
      if (d.t <= 0) {
        let best = -1, bc = 4;
        for (const e of L.E) { if (!e.zcash || (G.mode === "vs" && e.team !== p.team) || !G.e[e.i].o) continue; const c = G.e[e.i].cash || 0; if (c < bc) continue; if (hyp(e.zcash.x - p.x, e.zcash.z - p.z) > PET.r) continue; bc = c; best = e.i; }
        if (best >= 0) { d.s = 1; d.e = best; } else d.t = 1;
      }
    } else if (d.s === 1) {      // бежит к кучке
      const z = L.E[d.e].zcash;
      if (go(z.x, z.z, PET.speed) < 0.3) { const s = G.e[d.e]; d.c = s.cash || 0; s.cash = 0; d.s = 2; if (d.c > 0) G.ev.push({ t: "dogpick", a: "p" + pi, e: d.e, amt: d.c }); }
    } else {      // несёт хозяину
      if (go(p.x, p.z, PET.speed) < 0.7) { if (d.c > 0) { G.money[p.team] += d.c; p.nk = (p.nk || 0) + 1; G.ev.push({ t: "cash", a: "p" + pi, e: d.e, amt: d.c, dog: 1 }); } d.c = 0; d.s = 0; d.e = -1; d.t = PET.cd; }
    }
  }
}

/* ---------- архипелаг: старые острова торгуют сами, торговые пути возят товар ---------- */
// доход острова без игроков (в секунду) — как «пока тебя не было»
export function isleRate(G) {
  const helpers = G.hp.length; if (!helpers || !(G.rate > 0)) return 0;
  const ai = autoInfo(G, 0);
  const k = Math.min(0.6, 0.06 + helpers * 0.02 + (ai.n ? 0.35 * ai.ok / ai.n : 0) + (G.safe ? 0.08 : 0)) * (1 + 0.25 * mt(G, "m_off"));
  return G.rate * k;
}
export function archOf(G) { return G.arch || (G.arch = { ac: 0, isl: {}, rt: [], top: G.bay || 0 }); }
const routeOn = (A, k) => A.rt.some((r) => r.k === k);
// доход острова b с учётом путей (свой остров поставщика +10%, путь даёт острову-получателю долю дохода поставщика)
function rateOfIsle(G, A, b) {
  const rec = A.isl[b]; const base = b === G.bay ? isleRate(G) : rec ? rec.r : 0;
  let r = base; for (const t of A.rt) { const R = ROUTES[t.k]; if (R.a === b) r += base * ARCH.srcBonus; }
  return r;
}
export function routeIncome(G, k) { const A = archOf(G), R = ROUTES[k]; return rateOfIsle(G, A, R.a) * ARCH.routeK; }
// сколько накопилось в сундуке острова b
export function chestOf(G, b) {
  const A = archOf(G), rec = A.isl[b]; if (!rec || b === G.bay) return 0;
  let r = rateOfIsle(G, A, b); for (const t of A.rt) if (ROUTES[t.k].b === b) r += routeIncome(G, t.k);
  return Math.min(r * ARCH.cap, (rec.ch || 0) + r * Math.max(0, A.ac - rec.left));
}
export function chestCap(G, b) { const A = archOf(G); let r = rateOfIsle(G, A, b); for (const t of A.rt) if (ROUTES[t.k].b === b) r += routeIncome(G, t.k); return r * ARCH.cap; }
// пока играешь: часы архипелага идут, шхуны по путям в эту бухту приходят каждые 90 с
function stepArch(G, dt) {
  const A = G.arch; if (!A) return;
  A.ac += dt;
  for (const t of A.rt) {
    const R = ROUTES[t.k];
    if (R.b !== G.bay) continue;
    t.t = (t.t || 0) + dt;
    if (t.t >= ARCH.routeT) { t.t = 0; const v = Math.round(routeIncome(G, t.k) * ARCH.routeT); if (v > 0) { G.money[0] += v; G.earned[0] += v; G.ev.push({ t: "route", k: t.k, v, it: IT[R.it] }); } }
  }
}
// путь можно проложить, когда оба острова открыты, а на острове-поставщике маяк уже горит
export function isleKnown(G, b) { const A = archOf(G); return b === G.bay || !!A.isl[b]; }
export function isleLit(G, b) { const A = archOf(G); return b === G.bay ? G.done >= 0 : !!(A.isl[b] && A.isl[b].lit); }
export function canRoute(G, k) { const A = archOf(G), R = ROUTES[k]; if (!R || routeOn(A, k) || G.mode === "vs") return false; return isleKnown(G, R.a) && isleKnown(G, R.b) && isleLit(G, R.a); }
export const routeCost = (G, k) => Math.round(ROUTES[k].cost * costMul(G));
export function buyRoute(G, k) {
  if (!canRoute(G, k)) return false; const c = routeCost(G, k); if (G.money[0] < c) return false;
  G.money[0] -= c; G.spent[0] += c; archOf(G).rt.push({ k, t: 0 }); G.ev.push({ t: "routeon", k }); return true;
}
// снимок острова, который покидаем (без покупателей — им всё равно уходить)
function isleRec(G) {
  const o = JSON.parse(serialize(G)); delete o.arch; o.cu = []; o.ev = [];
  return { s: o, r: isleRate(G), left: G.arch ? G.arch.ac : 0, ch: 0, lap: G.lap || 0, lit: G.done >= 0 ? 1 : 0, m: Math.floor(G.money[0]) };
}
// плыть на остров b: новый (если ещё не был) или вернуться к старому. Снаряжение, знаки, артель — с собой.
// Казна у каждого острова своя: деньги острова и его сундук ждут тебя там.
export function sailTo(G, b, o) {
  o = o || {};
  const A = archOf(G); A.isl[G.bay] = isleRec(G); A.top = Math.max(A.top || 0, b, G.bay);
  const cr = carryOf(G); const rec = A.isl[b];
  let N;
  if (rec && (o.lap == null || o.lap === rec.lap)) {
    N = deserialize(JSON.parse(JSON.stringify(rec.s)));
    const ch = Math.floor(chestOf(G, b)); N.money[0] += ch; N.earned[0] += ch; N.chestGot = ch;
    for (let i = 0; i < N.pl.length && i < cr.gear.length; i++) N.pl[i].g = Object.assign({}, cr.gear[i]);
    for (const u of ["crew", "crewspd"]) N.upg[0][u] = Math.max(N.upg[0][u] || 0, cr.upg[u] || 0);
    N.perks = Object.assign({}, G.perks); N.meta = Object.assign({}, G.meta || {}); N.diff = G.diff;
    N.rateBase = N.earned[0]; N.rateAcc = 0;
  } else {
    N = newGame({ mode: G.mode, seed: o.seed || ((G.rs >>> 0) ^ 0x5bd1e995) + b, bay: b, lap: o.lap || 0, perks: G.perks, meta: G.meta, upg: cr.upg, gear: cr.gear, diff: G.diff });
    if (rec) { const ch = Math.floor(chestOf(G, b)) + (rec.m || 0); N.money[0] += ch; N.chestGot = ch; }      // новый круг на старом месте: казна старого острова переходит
  }
  delete A.isl[b];
  for (const t of A.rt) t.t = 0;
  N.arch = A;
  return N;
}
// потолок уровня: в каждой следующей бухте открываются новые уровни (в первой — как раньше)
export const upgMax = (G, u) => UPG[u].max + ((G.v || 1) >= 2 && G.mode !== "vs" ? Math.max(G.bay || 0, (G.arch && G.arch.top) || 0) * (UPG[u].ext || 0) : 0);
export function carryOf(G) { return { upg: { crew: G.upg[0].crew || 0, crewspd: G.upg[0].crewspd || 0 }, gear: G.pl.map((p) => Object.assign({}, p.g || {})) }; }
/* ---------- запросы ---------- */
export const teamOf = (G, pi) => (G.mode === "vs" ? pi : 0);
export function costMul(G) {
  if (G.mode === "vs") return 0.38;
  const base = DIFF[G.diff].cost * (G.mode === "coop" ? 1.15 : 1);
  return (G.v || 1) < 2 ? BAYS_OLD[G.bay].mult * base : base * Math.pow(1.6, G.lap || 0);
}
export function priceMul(G) {
  if (G.mode === "vs") return 2.5;
  return (G.v || 1) < 2 ? BAYS_OLD[G.bay].mult * (1 + 0.15 * (G.perks.p_price || 0)) : Math.pow(1.6, G.lap || 0) * (1 + 0.12 * (G.bay || 0)) * (1 + 0.03 * (G.deco || 0));     // второй круг: цены растут ровно как стоимость; дальние бухты платят за товар чуть больше (+12% за бухту), стоимость улучшений не растёт
}
const gearMul = (G) => costMul(G);      // улучшения стоят одинаково в любой бухте — зависят только от уровня
// снаряжение у каждого игрока своё (p.g): рюкзак, унты, сеть, длинные руки; покупается в «Своей хижине»
export const gearOf = (G, pi) => { const p = G.pl[pi]; return (p && p.g) || (p && p.g === undefined && (p.g = { bag: 0, boots: 0, net: 0, reach: 0 })) || { bag: 0, boots: 0, net: 0, reach: 0 }; };
export function capOf(G, pi) { return UPG.bag.v(gearOf(G, pi).bag || 0) + 2 * pk(G, "p_cap") + mt(G, "m_bag"); }
export function speedOf(G, pi) { const g = gearOf(G, pi); return UPG.boots.v(g.boots || 0) * (1 + 0.08 * pk(G, "p_spd")) * (1 + 0.04 * mt(G, "m_boots")) * (1 + ((RIDES[g.ride || 0] || {}).sp || 0)); }
export function catchOf(G, pi) { return UPG.net.v(gearOf(G, pi).net || 0) / (1 + 0.08 * mt(G, "m_net")); }
export function gearCost(G, pi, u) { return upgCost(u, gearOf(G, pi)[u] || 0, gearMul(G)); }
export function helperSpeed(G, team) { return UPG.crewspd.v(G.upg[team].crewspd) * (1 + 0.15 * pk(G, "h_spd")) * (1 + 0.06 * mt(G, "m_crew")); }
export function helperCap(G, team) { return UPG.crew.v(G.upg[team].crew) + 2 * pk(G, "h_cap") + mt(G, "m_hcap"); }
export const shelfPlus = (G) => 12 * pk(G, "h_shelf");
export const cashReach = (G, pi) => 1.5 * pk(G, "p_mag") + 1.0 * mt(G, "m_cash") + (pi == null ? 3 : UPG.reach.v(gearOf(G, pi).reach || 0));
export function itemPrice(G, it) { const I = ITEMS[it]; return (I.price || I.ship || 0) * priceMul(G); }
// цена найма помощника и улучшений артели (их покупают в «Артели», не на площадках)
export function hireCost(G, ei) {
  const L = layoutOf(G), e = L.E[ei];
  if (e.def.id === "fisher0" && (pk(G, "h_free") || mt(G, "m_free"))) return 0;
  return Math.round((e.cost || e.def.cost || 0) * costMul(G) * cheapK(G) / 5) * 5 || 5;
}
export function crewCost(G, team, u) { return upgCost(u, G.upg[team][u], gearMul(G)); }
// можно ли нанять: зависимости открыты, ещё не нанят
export function canHire(G, ei) {
  const L = layoutOf(G), e = L.E[ei]; if (!e || e.k !== "helper" || G.e[ei].o) return false;
  for (const a of e.after) if (!G.e[a].o) return false;
  return true;
}
// чем дальше в бухте — тем дешевле стройка и наём (своя артель, свои плотники): жизнь становится проще, а не только дороже
function scaleK(G) { if ((G.v || 1) < 2 || G.mode === "vs") return 1; const L = layoutOf(G); let n = 0, o = 0; for (const e of L.E) { if (e.k === "upg" || e.k === "supg" || e.def.free || e.def.auto || e.k === "board" || e.k === "goal") continue; n++; if (G.e[e.i].o) o++; } return (1 - 0.4 * (n ? o / n : 0)) * ((G.nbuy || 0) < 6 ? 0.6 : 1); }     // первые шаги бухты — быстрые
const cheapK = (G) => ((G.nbuy || 0) < 6 && pk(G, "e_cheap") ? 1 - 0.35 * pk(G, "e_cheap") : 1) * scaleK(G);
// площадка видна: зависимости открыты, сама ещё не куплена (улучшение — пока не максимум)
export function padVisible(G, i) {
  const L = layoutOf(G), e = L.E[i], s = G.e[i];
  if (e.k === "spot" || e.k === "board" || e.k === "helper" || e.k === "hire" || e.k === "ads" || e.k === "hut") return false;
  if (e.k === "upg") { if (e.def.u === "crew" || e.def.u === "crewspd") return false; if (G.upg[e.team][e.def.u] >= UPG[e.def.u].max) return false; }
  else if (e.k === "supg") { if (!G.e[e.tg].o || (G.e[e.tg].lv || 0) >= SUPG.max) return false; }
  else if (e.k === "goal" && !bigDone(G)) return false;
  else if (s.o) return false;
  if (e.def.free) return false;
  for (const a of e.after) if (!G.e[a].o) return false;
  return true;
}
export function padCost(G, i) {
  const L = layoutOf(G), e = L.E[i];
  if (e.k === "upg") return upgCost(e.def.u, G.upg[e.team][e.def.u], gearMul(G));     // старая карта: площадки снаряжения
  if (e.k === "supg") { const t = L.E[e.tg]; return Math.round(Math.max(25, (t.cost || t.def.cost || 50) * SUPG.k) * Math.pow(SUPG.mult, G.e[e.tg].lv || 0) * costMul(G) / 5) * 5; }
  return Math.round((e.cost || e.def.cost || 0) * costMul(G) * cheapK(G) / 5) * 5 || 5;
}
// открыто ли автоматически (место лова на мостках открывается вместе с ними)
function autoOpen(G) {
  const L = layoutOf(G);
  for (const e of L.E) if (e.def.auto && !G.e[e.i].o && e.after.every((a) => G.e[a].o)) { G.e[e.i].o = 1; G.bv++; }
  for (const e of L.E) if (e.k === "board" && !G.e[e.i].o && e.after.every((a) => G.e[a].o)) { G.e[e.i].o = 1; G.bv++; }
}

/* ---------- препятствия и ходьба ---------- */
let boxCache = { key: "", bv: -1, list: [] };
export function boxes(G) {
  const L = layoutOf(G);
  if (boxCache.key === L.key && boxCache.bv === G.bv && boxCache.g === G) return boxCache.list;
  const list = [];
  for (const e of L.E) if (e.box && G.e[e.i].o) list.push(e.box);
  for (const f of L.fences) list.push(f);
  for (const d of L.deco) list.push(d.box);
  for (const f of L.div) list.push(f);
  boxCache = { key: L.key, bv: G.bv, g: G, list };
  return list;
}
// у берега можно заходить в воду по колено (0,6 м) — выход из моря широкий
const WADE = 0.6;
function inWater(G, L, x, z) {
  if (z >= shoreZ(L, x) - WADE) return false;
  for (const e of L.E) {
    if (e.k === "spot" && !e.def.auto && hyp(x - e.zin.x, z - e.zin.z) < e.zin.r + 0.35 + tideR(G)) return false;   // отмель — можно зайти в воду (на отливе шире)
    if (e.k === "pier" && G.e[e.i].o && Math.abs(x - e.pier.x) < 0.95 && z > e.pier.z1 - 0.3 && z < e.pier.z0 + 0.5) return false;
    if (e.k === "dock" && G.e[e.i].o && hyp(x - e.x, z - e.z) < 1.3) return false;
  }
  return true;
}
// круг против прямоугольника: прямоугольник «скруглён» на радиус — на углах соскальзываем, а не застреваем
function hitBox(x, z, r, b) { const cx = clamp(x, b[0], b[2]), cz = clamp(z, b[1], b[3]); return hyp(x - cx, z - cz) < r - 1e-4; }
function walkable(G, L, x, z, r, who) {
  const M = L.MAP;
  if (x < M.w[0] + 0.3 || x > M.w[1] - 0.3 || z > (who === "c" ? 26 : L.fz - 0.35) || z < M.d[0]) return false;
  if (who !== "c" && inWater(G, L, x, z)) return false;
  if (who !== "c") for (const b of boxes(G)) if (hitBox(x, z, r, b)) return false;
  return true;
}
export function canStand(G, x, z) { return walkable(G, layoutOf(G), x, z, 0.3, "p"); }
// вытолкнуть точку из прямоугольников (скольжение вдоль стен и по углам)
function pushOut(G, p, r) {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (const b of boxes(G)) {
      const cx = clamp(p.x, b[0], b[2]), cz = clamp(p.z, b[1], b[3]), dx = p.x - cx, dz = p.z - cz, d = hyp(dx, dz);
      if (d >= r) continue;
      if (d > 1e-5) { p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
      else { const o = [p.x - b[0], b[2] - p.x, p.z - b[1], b[3] - p.z], m = Math.min(...o), k = o.indexOf(m); if (k === 0) p.x = b[0] - r; else if (k === 1) p.x = b[2] + r; else if (k === 2) p.z = b[1] - r; else p.z = b[3] + r; }
      moved = true;
    }
    if (!moved) break;
  }
}
// высота настила под точкой (мостки, причал) — чтобы люди стояли на досках, а не «тонули»; null — настила нет
let deckCache = { g: null, bv: -1, list: [] };
export function deckY(G, x, z) {
  if (deckCache.g !== G || deckCache.bv !== G.bv) {
    const L = layoutOf(G), list = [];
    for (const e of L.E) {
      if (e.k === "pier" && G.e[e.i].o) list.push([e.pier.x - 1.0, e.pier.z1 - 0.45, e.pier.x + 1.0, e.pier.z0 + 0.45, 0.4]);
      if (e.k === "dock" && G.e[e.i].o) list.push([e.x - 1.35, e.z - 1.35, e.x + 1.35, e.z + 1.35, 0.21]);
    }
    deckCache = { g: G, bv: G.bv, list };
  }
  for (const d of deckCache.list) if (x > d[0] && x < d[2] && z > d[1] && z < d[3]) return d[4];
  return null;
}
// вода: вернуть точку на ближайшую сушу/отмель/мостки
function pullFromWater(G, L, p) {
  if (!inWater(G, L, p.x, p.z)) return;
  let best = null, bd = 1e9;
  const cand = (x, z) => { if (inWater(G, L, x, z)) return; const d = hyp(x - p.x, z - p.z); if (d < bd) { bd = d; best = [x, z]; } };
  cand(p.x, shoreZ(L, p.x) - WADE + 0.01);
  for (const e of L.E) {
    if (e.k === "spot" && !e.def.auto) { const R0 = e.zin.r + 0.34, dx = p.x - e.zin.x, dz = p.z - e.zin.z, d = hyp(dx, dz) || 1; cand(e.zin.x + dx / d * R0, e.zin.z + dz / d * R0); }
    if (e.k === "pier" && G.e[e.i].o) cand(clamp(p.x, e.pier.x - 0.94, e.pier.x + 0.94), clamp(p.z, e.pier.z1 - 0.29, e.pier.z0 + 0.49));
    if (e.k === "dock" && G.e[e.i].o) { const dx = p.x - e.x, dz = p.z - e.z, d = hyp(dx, dz) || 1; cand(e.x + dx / d * 1.29, e.z + dz / d * 1.29); }
  }
  if (best) { p.x = best[0]; p.z = best[1]; }
}
// шаг: двигаемся, потом выталкиваемся из стен и воды. Застрять нельзя: если всё равно внутри — ищем свободное место рядом
function moveAgent(G, a, dx, dz, who) {
  const L = layoutOf(G), r = who === "c" ? 0.25 : 0.3, M = L.MAP;
  if (!dx && !dz) { if (who !== "c" && !walkable(G, L, a.x, a.z, r, who)) unstick(G, L, a, r, who); return; }
  if (who === "c") { a.x += dx; a.z += dz; return; }
  // пробуем прямо, а если упёрлись (угол, край воды) — чуть в сторону: берём вариант, что продвигает дальше всего
  const len = hyp(dx, dz); let best = null, bp = -1;
  for (const ang of [0, 0.6, -0.6, 1.1, -1.1]) {
    const c = Math.cos(ang), sn = Math.sin(ang), ddx = dx * c - dz * sn, ddz = dx * sn + dz * c;
    const p = { x: clamp(a.x + ddx, M.w[0] + 0.31, M.w[1] - 0.31), z: clamp(a.z + ddz, M.d[0], L.fz - 0.36) };
    pullFromWater(G, L, p); pushOut(G, p, r); pullFromWater(G, L, p);
    if (!walkable(G, L, p.x, p.z, r * 0.98, who)) continue;
    const prog = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len;
    if (prog > bp + 1e-4) { bp = prog; best = p; }
    if (ang === 0 && prog > len * 0.6) break;
  }
  if (best && bp > len * 0.05) { a.x = best.x; a.z = best.z; return; }
  // запасной путь — по осям
  if (walkable(G, L, a.x + dx, a.z, r, who)) { a.x += dx; return; }
  if (walkable(G, L, a.x, a.z + dz, r, who)) { a.z += dz; return; }
  if (!walkable(G, L, a.x, a.z, r, who)) unstick(G, L, a, r, who);
}
function unstick(G, L, a, r, who) {
  for (let k = 1; k <= 40; k++) { const ang = k * 2.4, d = 0.12 * k; const nx = a.x + Math.cos(ang) * d, nz = a.z + Math.sin(ang) * d; if (walkable(G, L, nx, nz, r, who)) { a.x = nx; a.z = nz; return; } }
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
  const L = layoutOf(G), aw = az < shoreZ(L, ax) + 0.05, tw = tz < shoreZ(L, tx) + 0.05;
  if (aw && (!tw || Math.abs(ax - tx) > 1.4)) return [ax, shoreZ(L, ax) + 0.75];
  if (!aw && tw) { const ex = tx, ez = shoreZ(L, tx) + 0.55; if (Math.abs(ax - ex) > 0.45 || az > ez + 0.3) return viaBox(G, ax, az, ex, ez) || [ex, ez]; return null; }
  return viaBox(G, ax, az, tx, tz);
}
function viaBox(G, ax, az, tx, tz, depth) {
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
  // до самого угла мешает другое здание — сначала обходим его
  if (c && (depth || 0) < 2) { const w = viaBox(G, ax, az, c[0], c[1], (depth || 0) + 1); if (w) return w; }
  return c;
}
// идти к точке; true — пришли
function goTo(G, a, tx, tz, spd, dt, who, near) {
  const d = hyp(tx - a.x, tz - a.z);
  if (d < (near || 0.25)) { a.mv = 0; return true; }
  let gx = tx, gz = tz;
  // страховка: помощник, который упёрся (обход завёл в тупик), какое-то время идёт напрямую — со скольжением по стенам
  if (who === "h" && (a.dz || 0) > 0) a.dz -= dt;
  if (who !== "c" && !(a.dz > 0)) { const w = via(G, a.x, a.z, tx, tz); if (w) { gx = w[0]; gz = w[1]; } }
  const dd = hyp(gx - a.x, gz - a.z) || 1, st = Math.min(spd * dt, dd);
  const ox = a.x, oz = a.z;
  moveAgent(G, a, (gx - a.x) / dd * st, (gz - a.z) / dd * st, who);
  if (who === "h") { if (hyp(a.x - ox, a.z - oz) < st * 0.2) { a.sk = (a.sk || 0) + dt; if (a.sk > 2.5) { a.sk = 0; a.dz = 1.5; } } else a.sk = 0; }
  if (a.x !== ox || a.z !== oz) a.dir = Math.atan2(a.x - ox, a.z - oz);
  a.mv = 1;
  return false;
}
// игрок двигается джойстиком (jx, jz — направление и сила 0..1)
export function movePlayer(G, pi, jx, jz, dt) {
  const p = G.pl[pi]; const m = hyp(jx, jz);
  if (m < 0.05) { p.mv = 0; return; }
  let s = speedOf(G, pi) * Math.min(1, m) * dt;
  if (pk(G, "p_wade") && p.z < shoreZ(layoutOf(G), p.x) + 2.5) s *= 1 + 0.25 * pk(G, "p_wade");
  if ((gearOf(G, pi).ride || 0) >= 2 && p.z < shoreZ(layoutOf(G), p.x) + 1.5) s *= 1.15;     // лёгкая лодка: на мелководье ещё быстрее
  moveAgent(G, p, jx / m * s, jz / m * s, "p");
  p.dir = Math.atan2(jx, jz); p.mv = Math.min(1, m);
}
export function inZone(a, z, pad) { return z && hyp(a.x - z.x, a.z - z.z) < z.r + (pad || 0); }

/* ---------- операции ----------
   ["c", e]  поймать рыбу на месте лова    ["d", e, it] положить предмет      ["p", e] взять готовое
   ["m", e, amt] заплатить в площадку       ["k", e] забрать выручку
   a — кто делает: "p0"/"p1" игрок, "h3" помощник. Возвращает true, если получилось. */
function agentOf(G, a) { return a[0] === "p" ? G.pl[+a.slice(1)] : G.hp[+a.slice(1)]; }
function capFor(G, a) { const ag = agentOf(G, a); return a[0] === "p" ? capOf(G, +a.slice(1)) : helperCap(G, ag.team); }
// есть ли у команды открытое место, куда этот товар можно отнести (иначе его не берём)
export function hasDest(G, team, it) {
  const L = layoutOf(G);
  for (const e of L.E) { if (G.mode === "vs" && e.team !== team) continue; const s = G.e[e.i]; if (!s.o) continue;
    if (e.k === "proc" && e.rec.in.includes(it)) return true; if (e.k === "stall" && e.item === it) return true; if (e.k === "dock" && e.acc.includes(it)) return true; }
  return !!(conActive(G) && G.con.it === it && G.mode !== "vs") || bigWants(G, it);
}
// чего не хватает, чтобы товар было куда нести (для подсказки)
export function needFor(G, team, it) {
  const L = layoutOf(G);
  for (const e of L.E) { if (G.mode === "vs" && e.team !== team) continue; if (G.e[e.i].o) continue;
    if ((e.k === "proc" && e.rec.in.includes(it)) || (e.k === "stall" && e.item === it) || (e.k === "dock" && e.acc.includes(it))) return e.i; }
  return -1;
}
export function accepts(G, ei, it) {
  const L = layoutOf(G), e = L.E[ei], s = G.e[ei];
  if (!s.o) return false;
  if (e.k === "proc") { const k = e.rec.in.indexOf(it); return k >= 0 && s.ib[k] < 24 + SUPG.cap * (s.lv || 0) + shelfPlus(G); }
  if (e.k === "stall") return e.item === it && s.sh < 24 + shelfPlus(G);
  if (e.k === "dock") return e.acc.includes(it) && s.pile.length < e.def.cap;
  if (e.k === "board") return !!(conActive(G) && G.con.it === it && G.con.got < G.con.n) || bigWants(G, it);
  return false;
}
export function applyOp(G, a, op) {
  const L = layoutOf(G), ag = agentOf(G, a); if (!ag) return false;
  if (op[0] === "t") {      // ловушка с крабами на отливе: op = ["t", номер ловушки]
    const tr = G.traps && G.traps[op[1]]; if (!tr || tr.n <= 0 || ag.st.length >= capFor(G, a)) return false;
    tr.n--; ag.st.push(IT.crab); G.ev.push({ t: "trap", a, k: op[1], it: IT.crab }); return true;
  }
  const ei = op[1], e = L.E[ei], s = G.e[ei]; if (!e || !s) return false;
  const team = ag.team;
  if (e.team !== team && G.mode === "vs" && op[0] !== "c") return false;
  switch (op[0]) {
    case "c": {
      if (e.k !== "spot" || !s.o || s.f <= 0 || ag.st.length >= capFor(G, a)) return false;
      s.f--; ag.st.push(e.item); G.ev.push({ t: "catch", a, e: ei, it: e.item }); made(G, e.item);
      if (a[0] === "p") ag.nc = (ag.nc || 0) + 1;
      rollRare(G, a, e);
      // ход лосося: каждый улов — двойной
      if (evOn(G, "run") && s.f > 0 && ag.st.length < capFor(G, a)) { s.f--; ag.st.push(e.item); G.ev.push({ t: "catch", a, e: ei, it: e.item, dbl: 1 }); }
      if (a[0] === "p" && pk(G, "p_dbl") && s.f > 0 && ag.st.length < capFor(G, a) && rnd(G) < 0.2 * pk(G, "p_dbl")) { s.f--; ag.st.push(e.item); G.ev.push({ t: "catch", a, e: ei, it: e.item, dbl: 1 }); }
      return true;
    }
    case "d": {
      const it = op[2]; const k = ag.st.lastIndexOf(it);
      if (k < 0 || !accepts(G, ei, it)) return false;
      ag.st.splice(k, 1);
      if (e.k === "proc") s.ib[e.rec.in.indexOf(it)]++;
      else if (e.k === "stall") s.sh++;
      else if (e.k === "dock") s.pile.push(it);
      else if (e.k === "board") { if (conActive(G) && G.con.it === it && G.con.got < G.con.n) { G.con.got++; if (G.con.got >= G.con.n) finishContract(G, true); } else bigGot(G, ei); }
      G.ev.push({ t: "drop", a, e: ei, it, k }); return true;
    }
    case "p": {
      if (!(e.k === "proc" || e.k === "gen") || !s.o || s.ob <= 0 || ag.st.length >= capFor(G, a)) return false;
      if (!hasDest(G, team, e.k === "gen" ? e.item : e.rec.out)) return false;
      s.ob--; const it = e.k === "gen" ? e.item : e.rec.out; ag.st.push(it); G.ev.push({ t: "pick", a, e: ei, it }); return true;
    }
    case "m": {
      if (!padVisible(G, ei)) return false;
      const cost = padCost(G, ei), amt = Math.min(op[2], G.money[team], cost - s.p);
      if (amt <= 0) return false;
      G.money[team] -= amt; s.p += amt; G.spent[team] += amt;
      G.ev.push({ t: "padpay", a, e: ei, amt });
      if (s.p >= cost - 0.001) unlock(G, ei, null, a[0] === "p" ? +a.slice(1) : null);
      return true;
    }
    case "h": {      // нанять помощника в «Артели»: op = ["h", дом артели, номер помощника]
      if (e.k !== "hire") return false;
      const hi = op[2], he = L.E[hi]; if (!he || he.team !== team || !canHire(G, hi)) return false;
      const cost = hireCost(G, hi); if (G.money[team] < cost) return false;
      G.money[team] -= cost; G.spent[team] += cost; G.nbuy = (G.nbuy || 0) + 1;
      unlock(G, hi, ei); return true;
    }
    case "u": {      // улучшить артель: op = ["u", дом артели, "crew" | "crewspd"]
      if (e.k !== "hire") return false;
      const u = op[2]; if (u !== "crew" && u !== "crewspd" || G.upg[team][u] >= upgMax(G, u)) return false;
      const cost = crewCost(G, team, u); if (G.money[team] < cost) return false;
      G.money[team] -= cost; G.spent[team] += cost; G.upg[team][u]++;
      G.ev.push({ t: "upg", e: ei, u, lv: G.upg[team][u], team }); return true;
    }
    case "a": return e.k === "board" && acceptContract(G);     // принять заказ у доски
    case "ad": {     // реклама у рекламной тумбы: op = ["ad", тумба, "fl" | "sign" | "cr"]
      if (e.k !== "ads") return false;
      const k = op[2]; if (!ADS[k] || !canAd(G, team, k)) return false;
      const cost = adCost(G, team, k); if (G.money[team] < cost) return false;
      G.money[team] -= cost; G.spent[team] += cost; const a = adOf(G, team);
      if (k === "sign") a.sign = (a.sign || 0) + 1; else { a[k] = ADS[k].dur; a[k + "c"] = ADS[k].dur + ADS[k].cd; }
      if (k === "cr") G.spT = 0;
      G.ev.push({ t: "ad", k, e: ei, team, lv: a.sign || 0 }); return true;
    }
    case "g": {      // управляющий цехом (в артели): op = ["g", дом артели, цех]
      if (e.k !== "hire" || !canMgr(G, op[2])) return false;
      const cost = mgrCost(G, op[2]); if (G.money[team] < cost) return false;
      G.money[team] -= cost; G.spent[team] += cost; (G.mgr || (G.mgr = {}))[op[2]] = 1;
      G.ev.push({ t: "mgr", e: op[2], team }); return true;
    }
    case "y": {      // своя хижина: op = ["y", хижина, "bag" | "boots" | "net" | "reach"] — только своя
      const pi = +a.slice(1); if (e.k !== "hut" || a[0] !== "p" || e.slot !== pi) return false;
      const u = op[2], g = gearOf(G, pi);
      if (u === "dog" || u === "ride" || /^o\d+$/.test(u)) {      // наряды, пёс, санки/лодка — за деньги в игре, навсегда
        const c = cosCost(G, pi, u); if (c < 0) return false;
        if (c === 0 && u[0] === "o") { g.out = +u.slice(1); G.ev.push({ t: "cos", a, u, team }); return true; }      // уже куплен — надеть
        if (G.money[team] < c) return false;
        G.money[team] -= c; G.spent[team] += c;
        if (u === "dog") g.dog = 1; else if (u === "ride") g.ride = (g.ride || 0) + 1; else { const k = +u.slice(1); g.ow = (g.ow || 0) | (1 << k); g.out = k; }
        G.ev.push({ t: "cos", a, u, team, buy: 1 }); return true;
      } if (!["bag", "boots", "net", "reach"].includes(u) || (g[u] || 0) >= upgMax(G, u)) return false;
      const cost = gearCost(G, pi, u); if (G.money[team] < cost) return false;
      G.money[team] -= cost; G.spent[team] += cost; g[u] = (g[u] || 0) + 1;
      G.ev.push({ t: "upg", e: ei, u, lv: g[u], team, a }); return true;
    }
    case "s": {      // сейф с автосбором (в артели)
      if (e.k !== "hire" || G.safe || G.mode === "vs") return false;
      const cost = safeCost(G); if (G.money[team] < cost) return false;
      G.money[team] -= cost; G.spent[team] += cost; G.safe = 1; G.ev.push({ t: "safe" }); return true;
    }
    case "k": {
      const amt = s.cash || 0; if (amt <= 0) return false;
      s.cash = 0; G.money[team] += amt; if (a[0] === "p") ag.nk = (ag.nk || 0) + 1;
      G.ev.push({ t: "cash", a, e: ei, amt }); return true;
    }
  }
  return false;
}
function unlock(G, ei, from, payer) {
  const L = layoutOf(G), e = L.E[ei], s = G.e[ei];
  s.p = 0;
  if (e.k !== "upg" && e.k !== "supg" && e.k !== "helper") G.nbuy = (G.nbuy || 0) + 1;
  if (e.k === "upg") {
    const u = e.def.u;
    if (u === "crew" || u === "crewspd" || payer == null) { G.upg[e.team][u]++; G.ev.push({ t: "upg", e: ei, u, lv: G.upg[e.team][u], team: e.team }); return; }
    // старая карта: площадка снаряжения общая на команду (как было) — уровень растёт у всех игроков команды
    G.upg[e.team][u]++; for (let pi = 0; pi < G.pl.length; pi++) if (G.pl[pi].team === e.team) { const g = gearOf(G, pi); g[u] = Math.max(g[u] || 0, G.upg[e.team][u]); }
    G.ev.push({ t: "upg", e: ei, u, lv: G.upg[e.team][u], team: e.team, a: "p" + payer }); return;
  }
  if (e.k === "supg") { const t = G.e[e.tg]; t.lv = (t.lv || 0) + 1; G.ev.push({ t: "supg", e: ei, of: e.tg, lv: t.lv, team: e.team }); return; }
  s.o = 1; G.bv++;
  if (e.k === "helper") {
    // новый помощник выходит из дверей артели и идёт на своё место
    const hz = from != null ? L.E[from].zin : (L.hire.length ? L.E[L.hire.find((h) => L.E[h].team === e.team) ?? L.hire[0]].zin : e.zpad);
    G.hp.push({ e: ei, team: e.team, x: hz.x, z: hz.z, dir: 0, st: [], s: 0, tm: 0, xt: 0, mv: 0, tg: -1, born: G.t });
  }
  G.ev.push({ t: "open", e: ei, team: e.team });
  // кто стоял на месте новой постройки — выходит к её выходу (или на юг)
  if (e.box) for (const a of [...G.pl, ...G.hp]) {
    const bx = e.box; if (a.x > bx[0] - 0.3 && a.x < bx[2] + 0.3 && a.z > bx[1] - 0.3 && a.z < bx[3] + 0.3) { const z = e.zout || e.zin || { x: e.x, z: bx[3] + 0.9 }; a.x = z.x; a.z = z.z + (z === e.zin ? 0 : 0.2); }
  }
  if (e.k === "goal" && G.done < 0) { G.done = e.team; if (G.mode === "vs" && G.winner < 0) G.winner = e.team; G.ev.push({ t: "goal", team: e.team }); }
  autoOpen(G);
}

/* ---------- взаимодействие по близости: что сделал бы игрок, стоя здесь ----------
   Возвращает операции. Используется и для игрока (хозяин/гость), и для бота.
   Чтобы на бегу ничего случайно не взять и не купить: класть/брать — только постояв в зоне DWELL с (или отпустив джойстик),
   платить в площадку — постояв PAD_GRACE с. Пока бежишь, отсчёт сброшен. Ловля и сбор выручки — сразу. */
export const DWELL = 0.35, PAD_GRACE = 0.4;
export function proximityOps(G, pi, dt, loc) {
  const L = layoutOf(G), p = G.pl[pi], team = p.team, a = "p" + pi;
  loc = loc || p;              // таймеры: у гостя свои, у хозяина — в игроке
  const ops = [];
  loc.xt = Math.max(0, (loc.xt || 0) - dt); loc.ct = Math.max(0, (loc.ct || 0) - dt);
  const mine = (e) => e.team === team || G.mode !== "vs";
  // в какой зоне стоим (ближайшая): площадка, вход, выход
  let zk = -1, zz = null, zd = 1e9, zkind = "";
  for (const e of L.E) {
    if (!mine(e)) continue;
    const s = G.e[e.i];
    if (padVisible(G, e.i) && inZone(p, e.zpad)) { const d = hyp(p.x - e.zpad.x, p.z - e.zpad.z) - 0.3; if (d < zd) { zd = d; zk = e.i * 4; zz = e.zpad; zkind = "pad"; } }
    if (!s.o) continue;
    if (e.zin && e.k !== "spot" && e.k !== "hire" && e.k !== "ads" && e.k !== "hut" && inZone(p, e.zin)) { const d = hyp(p.x - e.zin.x, p.z - e.zin.z); if (d < zd) { zd = d; zk = e.i * 4 + 1; zz = e.zin; zkind = "in"; } }
    if (e.zout && inZone(p, e.zout)) { const d = hyp(p.x - e.zout.x, p.z - e.zout.z); if (d < zd) { zd = d; zk = e.i * 4 + 2; zz = e.zout; zkind = "out"; } }
    if (e.zcash && (s.cash || 0) > 0 && inZone(p, e.zcash, 0.15 + cashReach(G, pi))) ops.push(["k", e.i]);
  }
  const mv = p.mv || 0;
  if (zk !== loc.zk) { loc.zk = zk; loc.dw = 0; loc.pacc = 0; }
  if (zk < 0 || mv >= 0.6) loc.dw = 0;
  else loc.dw = Math.min(2, (loc.dw || 0) + dt * (mv < 0.15 ? 3 : 1));
  const need = zkind === "pad" ? PAD_GRACE : DWELL;
  loc.dwK = zk >= 0 ? Math.min(1, loc.dw / need) : 0; loc.dwZ = zz; loc.dwKind = zkind;
  const armed = zk >= 0 && loc.dw >= need;
  if (armed && zkind === "pad") {
    const ei = zk >> 2, s = G.e[ei];
    if (G.money[team] > 0) {
      const cost = padCost(G, ei), rate = Math.max(cost / 1.7, 12), left = cost - s.p;
      loc.pacc = Math.min((loc.pacc || 0) + rate * dt, left + 1);
      let amt = Math.min(Math.floor(loc.pacc), G.money[team], left);
      if (amt <= 0 && (left < 1 || G.money[team] < 1)) amt = Math.min(G.money[team], left);
      if (amt > 0.0001) { loc.pacc = Math.max(0, loc.pacc - amt); ops.push(["m", ei, amt]); }
    }
  }
  if (armed && zkind === "in" && G.con && !G.con.ac && !G.con.end && L.E[zk >> 2].k === "board") ops.push(["a", zk >> 2]);
  if (armed && loc.xt <= 0 && zkind === "in") {
    // положить (сверху стопки — первое, что примут)
    const ei = zk >> 2;
    for (let k = p.st.length - 1; k >= 0; k--) if (accepts(G, ei, p.st[k])) { ops.push(["d", ei, p.st[k]]); loc.xt = PLAYER.xferT; break; }
  }
  if (armed && loc.xt <= 0 && zkind === "out" && p.st.length < capOf(G, pi)) {
    // взять готовое
    const ei = zk >> 2, e = L.E[ei];
    if (G.e[ei].ob > 0) {
      const it = e.k === "gen" ? e.item : e.rec.out;
      if (!hasDest(G, team, it)) loc.noDest = it; else { ops.push(["p", ei]); loc.xt = PLAYER.xferT; }
    }
  }
  // ловушки на отливе: стоишь у ловушки — крабы сами идут в короб
  if (loc.ct <= 0 && G.traps && G.traps.length && p.st.length < capOf(G, pi)) for (let k = 0; k < G.traps.length; k++) {
    const tr = G.traps[k]; if (tr.n <= 0 || hyp(p.x - tr.x, p.z - tr.z) > 1.0) continue;
    if (!hasDest(G, team, IT.crab)) { loc.noDest = IT.crab; break; }
    ops.push(["t", k]); loc.ct = 0.18; break;
  }
  // ловля
  if (loc.ct <= 0 && p.st.length < capOf(G, pi)) for (const e of L.E) {
    if (!mine(e) || e.k !== "spot" || !G.e[e.i].o || G.e[e.i].f <= 0 || !inZone(p, e.zin, e.def.auto ? 0 : tideR(G))) continue;
    if (!hasDest(G, team, e.item)) { loc.noDest = e.item; continue; }
    ops.push(["c", e.i]); loc.ct = catchOf(G, pi); break;
  }
  return ops;
}
// стоит ли игрок у дома артели (для окна найма)
export function atHut(G, pi, loc) {
  const L = layoutOf(G), p = loc || G.pl[pi];
  for (const i of L.huts) { const e = L.E[i]; if (e.slot === pi && inZone(p, e.zin, 0.2)) return i; }
  return -1;
}
export function atAds(G, pi, loc) {
  const L = layoutOf(G), p = loc || G.pl[pi], team = G.pl[pi].team;
  for (const i of L.ads) { const e = L.E[i]; if ((e.team === team || G.mode !== "vs") && inZone(p, e.zin, 0.2)) return i; }
  return -1;
}
export function atHire(G, pi, loc) {
  const L = layoutOf(G), p = loc || G.pl[pi], team = G.pl[pi].team;
  for (const i of L.hire) { const e = L.E[i]; if ((e.team === team || G.mode !== "vs") && inZone(p, e.zin, 0.2)) return i; }
  return -1;
}

/* ---------- шаг мира ---------- */
export function step(G, dt, opt) {
  opt = opt || {};
  const L = layoutOf(G);
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
    if (e.k === "spot") {
      if (evOn(G, "storm") && !e.def.auto) { s.f = Math.max(0, s.f - dt * 14); s.rt = 0; continue; }     // буран: косяк уходит
      if (s.f < SCHOOL.max) { s.rt += dt; const per = SCHOOL.regen / (1 + 0.9 * helpersAt(G, e.i) + (s.f < 8 ? 1 : 0)) / (evOn(G, "run") ? 4 : 1); while (s.rt > per && s.f < SCHOOL.max) { s.rt -= per; s.f++; } } else s.rt = 0;
    }
    else if (e.k === "proc") {
      const ready = s.ib.every((n) => n > 0) && s.ob < 30 + SUPG.cap * (s.lv || 0) + shelfPlus(G);
      if (ready) { s.tm += dt; if (s.tm >= e.rec.t / (1 + SUPG.speed * (s.lv || 0)) / (1 + 0.2 * pk(G, "s_speed"))) { s.tm = 0; for (let k = 0; k < s.ib.length; k++) s.ib[k]--; s.ob++; G.ev.push({ t: "made", e: e.i, it: e.rec.out }); made(G, e.rec.out); } }
      else s.tm = Math.max(0, s.tm - dt);
    } else if (e.k === "gen") {
      if (s.ob < e.def.cap + SUPG.cap * (s.lv || 0) + shelfPlus(G)) { s.tm += dt; if (s.tm >= e.def.t / (1 + SUPG.speed * (s.lv || 0)) / (1 + 0.2 * pk(G, "s_speed"))) { s.tm = 0; s.ob++; G.ev.push({ t: "made", e: e.i, it: e.item }); made(G, e.item); } }
    } else if (e.k === "dock") stepDock(G, e, s, dt);
  }
  stepHelpers(G, dt);
  stepCustomers(G, dt);
  // сколько чего реально делается (штук в секунду, сглажено) — по этому считаются заказы
  G.prT = (G.prT || 0) + dt;
  if (G.prT >= 10) { G.pr = G.pr || []; G.prc = G.prc || []; for (let i = 0; i < NIT; i++) G.pr[i] = (G.pr[i] || 0) * 0.7 + ((G.prc[i] || 0) / G.prT) * 0.3; G.prc = []; G.prT = 0; }
  if (G.mode !== "vs") { stepContract(G, dt); stepBig(G); stepMgr(G, dt); stepSafe(G, dt); stepIdle(G, dt); stepArch(G, dt); }
  stepDogs(G, dt);
  stepEvent(G, dt); stepAds(G, dt);
  // средний доход (для дохода, пока игры нет)
  G.rateAcc += dt;
  if (G.rateAcc >= 10) { const got = G.earned[0] - (G.rateBase || 0); G.rateBase = G.earned[0]; G.rate = G.rate ? G.rate * 0.8 + got / G.rateAcc * 0.2 : got / G.rateAcc; G.rateAcc = 0; }
  if (G.mode === "vs" && G.tEnd && G.t >= G.tEnd && G.winner < 0) { G.winner = G.earned[0] >= G.earned[1] ? 0 : 1; G.ev.push({ t: "goal", team: G.winner, time: 1 }); }
  if (G.ev.length > 400) G.ev.splice(0, G.ev.length - 400);
}
function helpersAt(G, ei) { let n = 0; for (const h of G.hp) if (h.s === 1 && layoutOf(G).E[h.e].from === ei) n++; return n; }

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
  const L = layoutOf(G);
  for (let hi = 0; hi < G.hp.length; hi++) {
    const h = G.hp[hi], he = L.E[h.e], a = "h" + hi, team = h.team;
    const spd = helperSpeed(G, team), cap = helperCap(G, team);
    h.xt = Math.max(0, h.xt - dt); h.tm += dt;
    if (he.def.role === "cashier") {
      if (h.tg < 0 || !(G.e[h.tg].cash > 0)) {
        let best = -1, bc = 0;
        for (const e of L.E) if (e.team === team && e.zcash && G.e[e.i].o && (G.e[e.i].cash || 0) > bc) { bc = G.e[e.i].cash; best = e.i; }     // все кучки: прилавки, причал, доска
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
        // большой заказ: у цеха, который делает нужное, помощники оставляют запас — его забирает игрок
        const out = src.k === "gen" || src.k === "spot" ? src.item : src.rec.out;
        const keep = src.k !== "spot" && ((bigWants(G, out) && G.e[src.i].ob <= 8) || (conActive(G) && G.con.it === out && G.con.got < G.con.n && G.e[src.i].ob <= 6));
        const ok = keep ? false : src.k === "spot" ? applyOp(G, a, ["c", src.i]) : applyOp(G, a, ["p", src.i]);
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
function openStalls(G) { const L = layoutOf(G); return L.E.filter((e) => e.k === "stall" && G.e[e.i].o); }
function stepCustomers(G, dt) {
  const L = layoutOf(G), stalls = openStalls(G);
  const pat0 = CUSTOMER.patience * (G.mode === "vs" ? 0.85 : DIFF[G.diff].pat);
  // кого сколько хотят (по товару)
  const wantN = new Array(NIT).fill(0);
  for (const c of G.cu) if (c.s < 4) wantN[c.w]++;
  const canMake = (it) => [0, 1].slice(0, G.teams).some((t) => chainOK(G, t, it));
  const items = [...new Set(stalls.map((e) => e.item))].filter(canMake);
  // поток покупателей (в минуту): чем больше товаров — тем больше людей; репутация и реклама его поднимают
  const flow = flowOf(G, items.length);
  G.flow = flow;
  const capIt = Math.max(8, Math.round(6 + flow / Math.max(1, items.length) / 3));
  // не даём простаивать: прилавок с товаром и без очереди дольше 10 с — к нему скоро кто-то подходит
  let force = -1;
  for (const e of stalls) { const s = G.e[e.i]; if (s.sh > 0 && !s.q.length && canMake(e.item)) { s.idle = (s.idle || 0) + dt; if (s.idle > 10 && force < 0 && wantN[e.item] < 2) { force = e.item; s.idle = 0; } } else s.idle = 0; }
  G.spT = (G.spT || 0) - dt;
  if (items.length && (G.spT <= 0 || force >= 0)) {
    const free = force >= 0 ? [force] : items.filter((it) => wantN[it] < capIt);
    if (force < 0) G.spT = 60 / flow * (0.6 + rnd(G) * 0.8);
    if (free.length && G.cu.length < 84) {
      let it = free[Math.floor(rnd(G) * free.length)];
      // ярмарочный день: половина новых покупателей — важные гости: берут дорогое и больше, платят втрое
      const vip = evOn(G, "fair") && rnd(G) < 0.5;
      if (vip) { const best = free.reduce((a, b) => ((ITEMS[b].price || 0) > (ITEMS[a].price || 0) ? b : a)); if (rnd(G) < 0.6) it = best; }
      const pr = ITEMS[it].price || 1, nmax = pr < 10 ? 4 : pr < 35 ? 3 : 2;
      const cx = L.crowd;
      G.cu.push({ id: G.nid++, x: (rnd(G) * 2 - 1) * 13, z: force >= 0 ? L.fz + 2 + rnd(G) : ROAD_Z + 1.5 + rnd(G), dir: Math.PI, s: force >= 0 ? 1 : 0, w: it, n: 1 + Math.floor(rnd(G) * nmax + ((G.v || 1) < 2 && G.bay > 0 ? 1 : 0)) + (vip ? 1 : 0), g: 0, st: -1, pat: pat0 * (vip ? 1.5 : 1), pm: pat0 * (vip ? 1.5 : 1), vip: vip ? 1 : 0,
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
        const sc = s.q.length * 1.5 + (s.sh > 0 ? 0 : 2) + hyp(c.x - e.x, c.z - e.z) * 0.05 + rnd(G) * 0.6 - (G.mode === "vs" ? adPow(G, e.team) : 0);
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
          const tip = pk(G, "e_tip") && rnd(G) < 0.2 ? 0.5 * pk(G, "e_tip") : 0;
          const amt = Math.round(itemPrice(G, c.w) * c.n * (c.mood === 2 ? 0.9 : 1) * (1 + tip) * (c.vip ? 3 : 1) * 10) / 10;
          s.cash += amt; G.earned[e.team] += amt; G.served++; repAdd(G, e.team, c.pat > c.pm * 0.55 ? 0.0016 : 0.0006);
          G.srev = G.srev || {}; G.srev[c.st] = (G.srev[c.st] || 0) + amt;
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
      if (c.pat <= 0) { s.q.splice(k, 1); c.s = 4; c.mood = 3; c.tx = c.x; c.tz = ROAD_Z + 3; G.lost++; G.ang = (G.ang || 0) + 1; repAdd(G, e.team, -0.02); G.ev.push({ t: "angry", c: c.id, e: c.st }); }
    } else if (c.s === 4) {
      if (c.z < L.fz + 0.4 && Math.abs(c.x - L.E[c.st >= 0 ? c.st : 0].x) < 1.2 && c.st >= 0) { goTo(G, c, L.E[c.st].x, L.fz + 1, spd * 1.1, dt, "c", 0.3); }
      else if (goTo(G, c, c.tx, c.tz, spd * 1.1, dt, "c", 0.4) || c.z > ROAD_Z + 2) G.cu.splice(ci, 1);
    }
  }
}

function made(G, it) { (G.prc || (G.prc = []))[it] = ((G.prc || [])[it] || 0) + 1; }
/* ---------- поток покупателей: товары, репутация, реклама ----------
   G.rep[team] 0..1 (0,5 — обычная): растёт от обслуженных (быстро — больше), падает от ушедших злыми.
   G.ads[team] = { sign: уровень вывески, fl: сколько ещё идут листовки, cr: сколько ещё кричит глашатай, flc/crc: перезарядка } */
export const ADS = {
  fl: { n: "Листовки", d: "40 с покупателей вдвое больше", dur: 40, cd: 70, k: 12 },
  sign: { n: "Вывеска и зазывала", d: "Навсегда +15% покупателей за уровень", max: 5, k: 45, mult: 1.9 },
  cr: { n: "Глашатай на площади", d: "Сразу толпа и 30 с втрое больше людей", dur: 30, cd: 160, k: 70 },
};
const adOf = (G, t) => { G.ads = G.ads || [{}, {}]; return G.ads[t] || (G.ads[t] = {}); };
export function repOf(G, t) { const r = G.rep && G.rep[t || 0]; return r == null ? 0.5 : r; }
function repAdd(G, t, v) { G.rep = G.rep || [0.5, 0.5]; G.rep[t] = Math.max(0, Math.min(1, repOf(G, t) + v)); }
// во сколько раз реклама поднимает поток у команды
export function adMul(G, t) { const a = adOf(G, t); return Math.min(4, (1 + 0.15 * (a.sign || 0)) * ((a.fl || 0) > 0 ? 2 : 1) * ((a.cr || 0) > 0 ? 3 : 1)); }
function adPow(G, t) { const a = adOf(G, t); return 0.3 * (a.sign || 0) + ((a.fl || 0) > 0 ? 1 : 0) + ((a.cr || 0) > 0 ? 2 : 0); }
export function flowOf(G, nItems) {
  if (!nItems) return 0;
  const teams = G.mode === "vs" ? [0, 1] : [0];
  let m = 0; for (const t of teams) m += adMul(G, t) * (0.7 + 0.6 * repOf(G, t)); m /= teams.length;
  return (16 + 18 * nItems) * Math.min(4.5, m * (evOn(G, "fair") ? 1.6 : 1)) * (G.mode === "vs" ? 0.9 : 1);
}
// цена рекламы — от цены самого дорогого товара, который сейчас продаётся (чтобы в каждой бухте была по карману)
export function adCost(G, team, k) {
  const L = layoutOf(G); let unit = 2;
  for (const e of L.E) if (e.k === "stall" && G.e[e.i].o && (G.mode !== "vs" || e.team === team)) unit = Math.max(unit, itemPrice(G, e.item));
  const A = ADS[k]; return Math.round(unit * A.k * (G.mode === "vs" ? (k === "sign" ? 0.15 : 0.3) : 1) * (k === "sign" ? Math.pow(A.mult, adOf(G, team).sign || 0) : 1) / 5) * 5;
}
export function canAd(G, team, k) { const a = adOf(G, team); if (k === "sign") return (a.sign || 0) < ADS.sign.max; return !((a[k] || 0) > 0) && !((a[k + "c"] || 0) > 0); }
function stepAds(G, dt) {
  for (let t = 0; t < G.teams; t++) { const a = adOf(G, t); for (const k of ["fl", "cr", "flc", "crc"]) if (a[k] > 0) a[k] = Math.max(0, a[k] - dt); }
  G.ang = Math.max(0, (G.ang || 0) - dt / 30);     // «злые за последнее время»
}
// почему людей мало (для подсказки в шапке)
export function flowWhy(G, team) {
  if ((G.ang || 0) >= 2) return "angry";
  const L = layoutOf(G);
  for (const e of L.E) if (e.k === "stall" && G.e[e.i].o && (G.mode !== "vs" || e.team === team) && G.e[e.i].sh <= 0 && G.e[e.i].q.length >= 2) return "empty";
  if (!(adOf(G, team).sign > 0) && G.t > 240) return "ads";
  if (repOf(G, team) < 0.35) return "rep";
  return "";
}

/* ---------- автоматизация: цех «работает сам», если всё, что ему нужно, подносят помощники, и готовое уносят ---------- */
function feeders(G, e, it) { const L = layoutOf(G); return L.E.some((h) => h.k === "helper" && h.team === e.team && G.e[h.i].o && h.to && h.to.includes(e.i) && prodItem(L.E[h.from]) === it); }
function prodItem(e) { return e.k === "spot" || e.k === "gen" ? e.item : e.k === "proc" ? e.rec.out : -1; }
export function stationAuto(G, e) {
  const L = layoutOf(G);
  if (!G.e[e.i].o || !(e.k === "proc" || e.k === "gen")) return false;
  const outOk = L.E.some((h) => h.k === "helper" && h.team === e.team && G.e[h.i].o && h.from === e.i) || mgrOn(G, e.i);
  if (!outOk) return false;
  if (e.k === "proc") for (const it of e.rec.in) if (!feeders(G, e, it) && !(mgrOn(G, e.i) && mgrSource(G, e, it) >= 0)) return false;
  return true;
}
// цепочки: каждый прилавок и причал. Цепочка «сама», если товар на неё носит помощник и весь путь до моря — автоматический
export function autoInfo(G, team) {
  const L = layoutOf(G); team = team || 0; let n = 0, ok = 0; const st = [];
  const auto = (it, depth) => {
    if (depth > 6) return false;
    for (const e of L.E) {
      if (e.team !== team || !G.e[e.i].o) continue;
      if (e.k === "spot" && e.item === it) return true;
      if ((e.k === "gen" || e.k === "proc") && prodItem(e) === it && stationAuto(G, e) && (e.k === "gen" || e.rec.in.every((x) => auto(x, depth + 1)))) return true;
    }
    return false;
  };
  for (const e of L.E) {
    if (e.team !== team || !G.e[e.i].o || !(e.k === "stall" || e.k === "dock")) continue;
    const its = e.k === "stall" ? [e.item] : e.acc.filter((it) => chainOK(G, team, it));
    for (const it of its) {
      n++;
      const fed = L.E.some((h) => h.k === "helper" && h.team === team && G.e[h.i].o && h.to && h.to.includes(e.i) && prodItem(L.E[h.from]) === it);
      if (fed && auto(it, 0)) { ok++; st.push(e.i + ":" + it); }
    }
  }
  return { n, ok, st };
}
// управляющий цехом: сам подтягивает сырьё с выхода соседнего цеха (тележкой) — помощник на подноске не нужен
export const mgrOn = (G, ei) => !!(G.mgr && G.mgr[ei]);
function mgrSource(G, e, it) { const L = layoutOf(G); for (const o of L.E) if (o.team === e.team && G.e[o.i].o && (o.k === "proc" || o.k === "gen") && prodItem(o) === it) return o.i; return -1; }
export function mgrCost(G, ei) { const e = layoutOf(G).E[ei]; return Math.round((e.cost || e.def.cost || 100) * 3 * costMul(G) / 5) * 5; }
export function canMgr(G, ei) { const e = layoutOf(G).E[ei]; return e && e.k === "proc" && G.e[ei].o && !mgrOn(G, ei); }
function stepMgr(G, dt) {
  if (!G.mgr) return;
  const L = layoutOf(G);
  for (const k in G.mgr) {
    const e = L.E[+k], s = G.e[e.i]; s.mt = (s.mt || 0) + dt;
    if (s.mt < 0.5) continue; s.mt = 0;
    for (let j = 0; j < e.rec.in.length; j++) {
      const it = e.rec.in[j]; if (s.ib[j] >= 12) continue;
      const src = mgrSource(G, e, it); if (src < 0 || G.e[src].ob <= 0) continue;
      G.e[src].ob--; s.ib[j]++; G.ev.push({ t: "cart", from: src, to: e.i, it });
    }
  }
}
// доход без тебя: выручка цепочек, которые работают сами (сглажено, в минуту); сейф или кассир её собирают
function stepIdle(G, dt) {
  G.idT = (G.idT || 0) + dt; if (G.idT < 15) return;
  const ai = autoInfo(G, 0), set = new Set(ai.st.map((s) => +s.split(":")[0])); let sum = 0;
  for (const k in (G.srev || {})) if (set.has(+k)) sum += G.srev[k];
  const L = layoutOf(G), collects = G.safe || G.hp.some((h) => L.E[h.e].def.role === "cashier");
  const v = sum / G.idT * 60 * (collects ? 1 : 0.5);
  G.idle = G.idle ? G.idle * 0.6 + v * 0.4 : v; G.srev = {}; G.idT = 0;
  // событие: цепочка стала автоматической
  const prev = G.autoN || 0; if (ai.ok > prev) G.ev.push({ t: "auto", n: ai.ok, of: ai.n }); G.autoN = ai.ok;
}
// сейф: вся выручка с прилавков, причала и доски сама уходит в кошелёк
function stepSafe(G, dt) {
  if (!G.safe) return;
  G.sft = (G.sft || 0) + dt; if (G.sft < 3) return; G.sft = 0;
  const L = layoutOf(G);
  for (const e of L.E) { if (!e.zcash || !G.e[e.i].o || !(G.e[e.i].cash > 0) || (G.mode === "vs" && e.team !== 0)) continue; const amt = G.e[e.i].cash; G.e[e.i].cash = 0; G.money[e.team] += amt; G.ev.push({ t: "cash", a: "safe", e: e.i, amt }); }
}
export function safeCost(G) { const L = layoutOf(G), g = L.E.find((e) => e.k === "goal"); return Math.round(((g && (g.cost || g.def.cost)) || 3000) * 0.18 * costMul(G) / 5) * 5; }

/* ---------- заказы (вместе / один) ---------- */
// заказ на доске: сначала предложение (принять — постоять у доски, иначе само примется через OFFER с),
// потом срок. Объём и срок — от того, сколько цепочка реально даёт сейчас, с большим запасом.
// Не успели — платим за сданное. Пока идёт ступень большого заказа судна, заказ — только на другой товар и если цепочка тянет.
export const OFFER = 15;
export const conActive = (G) => !!(G.con && G.con.ac && !G.con.end);
function stepContract(G, dt) {
  const L = layoutOf(G), bi = L.byId[0].board;
  if (bi == null || !G.e[bi].o) return;
  if (!G.con) {
    G.conT -= dt;
    if (G.conT > 0) return;
    const bs = bigStage(G);
    const its = [];
    for (let it = 0; it < NIT; it++) {
      if (!(ITEMS[it].price || ITEMS[it].ship) || !chainOK(G, 0, it) || !hasDest(G, 0, it)) continue;
      const pr = (G.pr && G.pr[it]) || 0;
      if (pr < 0.08 || (bs && (bs.it === it || pr < 0.5))) continue;
      its.push(it);
    }
    if (!its.length) { G.conT = 15; return; }
    const pool = its.filter((it) => it !== IT.herring || its.length < 3);
    const it = pool[Math.floor(rnd(G) * pool.length)];
    const tier = ITEMS[it].price || ITEMS[it].ship, rate = Math.max(0.08, G.pr[it]);
    let n = Math.max(4, Math.round((6 + G.cdone * 1.2) * Math.pow(6 / tier, 0.25)));
    // на заказ уходит примерно треть выработки (остальное — прилавкам); срок с запасом, не дольше 4 минут
    const share = G.mode === "solo" ? 0.13 : 0.2;     // одному — заказы меньше: рук вдвое меньше
    n = Math.max(3, Math.min(n, Math.floor((240 - 45) * rate * share / 1.5)));
    // далёкий источник — срок больше (дорога к доске и обратно)
    const be = L.E[bi], src = L.E.find((e) => G.e[e.i].o && ((e.k === "spot" || e.k === "gen") ? e.item === it : e.k === "proc" && e.rec.out === it));
    const far = src ? hyp(src.x - be.x, src.z - be.z) : 10;
    const T = Math.round(Math.min(260, Math.max(80, n / (rate * share) * 1.5 + 45 + far * 3)) * DIFF[G.diff].ct * (1 + 0.2 * pk(G, "e_order")));
    G.con = { it, n, got: 0, T, t: OFFER, ac: 0, rw: Math.round(itemPrice(G, it) * n * 2.6 * (1 + 0.4 * pk(G, "e_order"))), end: 0 };
    G.ev.push({ t: "contract", s: "new" });
    return;
  }
  const c = G.con;
  if (c.end) { c.end -= dt; if (c.end <= 0.0001) { G.con = null; G.conT = 25; } return; }
  c.t -= dt;
  if (!c.ac) { if (c.t <= 0) acceptContract(G); return; }
  if (c.t <= 0) finishContract(G, false);
}
function acceptContract(G) { const c = G.con; if (!c || c.ac || c.end) return false; c.ac = 1; c.t = c.T; G.ev.push({ t: "contract", s: "go" }); return true; }
function finishContract(G, ok) {
  const L = layoutOf(G), c = G.con; if (!c || c.end) return;
  c.end = 3; c.ok = ok ? 1 : 0;
  if (ok) { G.e[L.byId[0].board].cash += c.rw; G.earned[0] += c.rw; G.cdone++; G.stars += DIFF[G.diff].star; G.ev.push({ t: "contract", s: "done", amt: c.rw }); }
  else {
    // не успели: платим за то, что сдали
    const part = Math.round(c.rw * (c.got / c.n) * 0.6);
    if (part > 0) { G.e[L.byId[0].board].cash += part; G.earned[0] += part; }
    G.cfail++; G.ev.push({ t: "contract", s: "fail", amt: part });
  }
}

/* ---------- большой заказ судна и финальная поставка: три ступени, сдаются у доски заказов ---------- */
const bigList = (G) => ((G.v || 1) >= 2 && G.mode !== "vs" && layoutOf(G).MAP.big) || [];
export function bigDone(G) { return (G.bigN || 0) >= bigList(G).length; }
export function bigStage(G) { const b = G.big; if (!b) return null; const d = bigList(G)[b.i]; if (!d) return null; const st = d.st[b.s]; return { n: d.n, it: IT[st[0]], need: G.mode === "solo" ? Math.max(5, Math.round(st[1] * 0.6)) : st[1], got: b.got, s: b.s, of: d.st.length, rw: d.rw }; }
function bigWants(G, it) { const s = bigStage(G); return !!(s && s.it === it && s.got < s.need); }
function bigGot(G, bi) {
  const st = bigStage(G); if (!st) return;
  G.big.got++;
  if (G.big.got < st.need) return;
  // ступень сдана: награда у доски, украшения базы растут
  const amt = Math.round(st.rw * (0.25 + 0.15 * st.s) * priceMul(G));
  G.e[bi].cash += amt; G.earned[0] += amt; G.bigS = (G.bigS || 0) + 1;
  if (G.bigS % 2 === 1 && (G.deco || 0) < DECO_MAX) { G.deco = (G.deco || 0) + 1; G.ev.push({ t: "deco", lv: G.deco }); }
  if (G.big.s + 1 < st.of) { G.big.s++; G.big.got = 0; G.ev.push({ t: "big", s: "stage", amt, k: G.big.s }); }
  else { G.big = null; G.bigN = (G.bigN || 0) + 1; G.ev.push({ t: "big", s: "done", amt, last: bigDone(G) ? 1 : 0 }); }
}
function stepBig(G) {
  const list = bigList(G); if (G.big || (G.bigN || 0) >= list.length) return;
  const L = layoutOf(G), bi = L.byId[0].board, d = list[G.bigN];
  if (bi == null || !G.e[bi].o || !G.e[L.byId[0][d.after]].o) return;
  G.big = { i: G.bigN, s: 0, got: 0 }; G.ev.push({ t: "big", s: "new" });
}
/* ---------- события бухт: буран, ход лосося, отлив, ярмарочный день ----------
   G.evt = { k, ph: 0 — ждём, 1 — предупреждение, 2 — идёт; t — сколько осталось до смены фазы, n — сколько уже было } */
export function evOn(G, k) { return !!(G.evt && G.evt.ph === 2 && G.evt.k === k); }
export const tideR = (G) => (evOn(G, "tide") ? 1.3 : 0);
function stepEvent(G, dt) {
  const mk = (G.v || 1) >= 2 && layoutOf(G).MAP.event; if (!mk) return;
  // «против»: события по очереди — буран (у обоих) и ярмарочный день (важные гости идут в ту лавку, где быстрее)
  const vs = G.mode === "vs", kind = (n) => (mk === "mix" ? (n % 2 ? "fair" : "storm") : mk);
  if (!G.evt) G.evt = { k: kind(0), ph: 0, t: vs ? 150 : EVENTS[kind(0)].first, n: 0 };
  const v = G.evt, E = EVENTS[v.k]; v.t -= dt;
  if (v.t > 0) return;
  if (v.ph === 0) { v.ph = 1; v.t = E.warn; G.ev.push({ t: "bayev", s: "warn", k: v.k }); }
  else if (v.ph === 1) {
    v.ph = 2; v.t = vs ? Math.min(E.dur, 35) : E.dur; v.n++; G.ev.push({ t: "bayev", s: "start", k: v.k });
    if (v.k === "tide") G.traps = (layoutOf(G).MAP.traps || []).map(([x, z]) => ({ x, z, n: 6 }));
  } else {
    G.ev.push({ t: "bayev", s: "end", k: v.k }); if (v.k === "tide") G.traps = [];
    v.ph = 0; v.k = kind(v.n); v.t = vs ? 170 : EVENTS[v.k].every - EVENTS[v.k].warn - EVENTS[v.k].dur;
  }
}
// принудительно запустить событие (отладка и проверки)
export function forceEvent(G) { if (G.evt) { G.evt.t = 0.001; } else { const k = layoutOf(G).MAP.event; if (k) G.evt = { k, ph: 0, t: 0.001, n: 0 }; } }

/* ---------- цепочки ---------- */
// товар можно сделать: открыто место, где он ловится/делается, и всё, что нужно на входе, тоже можно сделать
export function chainOK(G, team, it, depth) {
  if ((depth || 0) > 6) return false;
  const L = layoutOf(G);
  for (const e of L.E) {
    if ((G.mode === "vs" && e.team !== team) || !G.e[e.i].o) continue;
    if ((e.k === "spot" || e.k === "gen") && e.item === it) return true;
    if (e.k === "proc" && e.rec.out === it && e.rec.in.every((x) => chainOK(G, team, x, (depth || 0) + 1))) return true;
  }
  return false;
}
// сколько штук в секунду цепочка может дать (грубо: самый медленный цех, улов игрока ~1,5/с)
export function chainRate(G, team, it, depth) {
  if ((depth || 0) > 6) return 0;
  const L = layoutOf(G); let best = 0;
  for (const e of L.E) {
    if ((G.mode === "vs" && e.team !== team) || !G.e[e.i].o) continue;
    const lv = 1 + SUPG.speed * (G.e[e.i].lv || 0);
    if (e.k === "spot" && e.item === it) best = Math.max(best, 1.5);
    if (e.k === "gen" && e.item === it) best = Math.max(best, lv / e.def.t);
    if (e.k === "proc" && e.rec.out === it) { let r = lv / e.rec.t; for (const x of e.rec.in) r = Math.min(r, chainRate(G, team, x, (depth || 0) + 1)); best += r; }
  }
  return best;
}

/* ---------- доход, пока игры не было ---------- */
export function offline(G, sec) {
  const helpers = G.hp.length; if (!helpers || !(G.rate > 0) || G.mode === "vs") return 0;
  const ai = (G.v || 1) >= 2 ? autoInfo(G, 0) : { n: 0, ok: 0 };
  const k = Math.min(0.6, 0.06 + helpers * 0.02 + (ai.n ? 0.35 * ai.ok / ai.n : 0) + (G.safe ? 0.08 : 0)) * (1 + 0.25 * mt(G, "m_off"));
  return Math.floor(G.rate * k * Math.min(sec, 2 * 3600));
}

/* ---------- прогресс ---------- */
export function progress(G, team) {
  const L = layoutOf(G); let n = 0, o = 0;
  for (const e of L.E) { if (e.team !== (team || 0) || e.k === "upg" || e.k === "supg" || e.def.free || e.def.auto || e.k === "board") continue; n++; if (G.e[e.i].o) o++; }
  return { n, o };
}
// следующая цель для подсказки: доступная площадка подешевле
export function nextPad(G, team) {
  const L = layoutOf(G); let best = -1, bc = 1e18;
  for (const e of L.E) { if (e.team !== team || !padVisible(G, e.i)) continue; const c = padCost(G, e.i) - G.e[e.i].p; const w = c * (e.k === "upg" || e.k === "supg" ? 1.6 : 1); if (w < bc) { bc = w; best = e.i; } }
  return best;
}

/* ---------- сериализация ---------- */
export function serialize(G) { const o = Object.assign({}, G); o.ev = []; return JSON.stringify(o); }
export function deserialize(s) {
  try {
    const G = typeof s === "string" ? JSON.parse(s) : s;
    if (!G || !G.e || !G.pl) return null;
    G.ev = []; delete G.gst;
    if (!G.v) G.v = 1;
    if (!G.perks) G.perks = {}; if (!G.meta) G.meta = {};
    if (G.con && G.con.ac == null) G.con.ac = 1;     // заказ из сохранения до «принять у доски» — уже идёт
    const L = layoutOf(G);
    // снаряжение стало личным: у старых сохранений берём общее снаряжение команды
    for (const p of G.pl) if (!p.g) { const u = G.upg[p.team] || {}; p.g = { bag: u.bag || 0, boots: u.boots || 0, net: u.net || 0, reach: 0 }; }
    // карта дописалась (старые сохранения): новым местам — начальное состояние
    if (G.e.length < L.E.length && L.key === "old") for (let i = G.e.length; i < L.E.length; i++) G.e.push(entState(L.E[i]));
    // карта бухты поменялась: переносим состояние мест по названиям
    const ids = L.E.map((e) => e.id + (e.team ? "@1" : ""));
    const old = G.ids || (IDS_V2[L.key] && IDS_V2[L.key].length === G.e.length ? IDS_V2[L.key] : null);
    if (old && old.join() !== ids.join()) {
      const map = new Map(old.map((id, i) => [id, i])), ne = L.E.map((e, i) => { const k = map.get(ids[i]); return k != null ? G.e[k] : entState(e); });
      const re = (i) => { const k = ids.indexOf(old[i]); return k; };
      G.hp = G.hp.filter((h) => re(h.e) >= 0).map((h) => Object.assign(h, { e: re(h.e), tg: h.tg >= 0 ? re(h.tg) : -1 }));
      for (const c of G.cu) if (c.st >= 0) c.st = re(c.st);
      G.cu = G.cu.filter((c) => c.st == null || c.st >= -1);
      if (G.mgr) { const m = {}; for (const k in G.mgr) { const n = re(+k); if (n >= 0) m[n] = 1; } G.mgr = m; }
      G.e = ne; G.bv = (G.bv || 1) + 1;
    }
    G.ids = ids;
    if (G.e.length !== L.E.length) return null;
    return G;
  } catch (_) { return null; }
}
export { rnd, via, goTo, hyp };
// для проверок: точка в воде (не отмель, не мостки, не причал)
export const wet = (G, x, z) => inWater(G, layoutOf(G), x, z);
// открыть место без оплаты (заставка меню, отладка)
export function forceOpen(G, ei) { const L = layoutOf(G), e = L.E[ei]; if (e.k === "upg") { G.upg[e.team][e.def.u]++; return; } if (!G.e[ei].o) unlock(G, ei); }
