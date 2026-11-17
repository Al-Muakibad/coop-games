// «Красный фонарь» v2 — логика мира. Чистый JS без графики: её считает хозяин комнаты (или одиночная игра),
// гости получают снимки. Каждый игрок сам ведёт свою позицию (отзывчиво), всё остальное решает хозяин.
//
// Формула: смена = подготовка (расставить мебель, купить) → ночь (аркада, все бегают) → утро (отчёт + голосование за 1 из 3 карт).
// Автоматика — это мебель, которую банда сама ставит: бельевой шкаф, пневмопочта, лифт шампанского, красная дорожка.
// Облава: 20 секунд паники — убрать грязные номера и выручку.
// Баланс под 1–4 игроков — множители потока и терпения (как в PlateUp!).

import { GIRLS, GIRL, CLIENTS } from "./data.js?v=3";

export const CUST = [0.8, 1, 1.25, 1.5], PATI = [0.75, 1, 1.1, 1.15];
export const NIGHTS_PER_LOC = 6, NIGHT_LEN = 150, RAID_FROM = 3;
export const LOCS = [
  { id: "alley", n: "Переулок «У стены»" },
  { id: "pier", n: "Причал" },
  { id: "theatre", n: "Театральная улица" },
];
export const AREA = { x0: -5.9, x1: 5.9, z0: -5.4, z1: 6.4, px0: -5, px1: 5, pz0: -5, pz1: 3 };
export const DOOR = { x: 0, z: 6.6 }, QUEUE = { x: 1.2, z: 5.4 };
export const PADS = { office: { x: -4.8, z: 5.3 }, ward: { x: -2.5, z: 5.3 } };
export const PAY = { sailor: 16, student: 13, rich: 23, vip: 60 };
const TYPES_ORDER = ["sailor", "student", "rich", "vip"];

// мебель: r — радиус тела, R — радиус действия автоматики, fr — где стоять (смещение по z от центра)
export const ST = {
  room: { n: "Номер", r: 0.95, fr: 1.35, big: true },
  laundry: { n: "Стиральная машина", r: 0.5, fr: 0.95, rate: 3.2, max: 6 },
  bar: { n: "Бар", r: 0.55, fr: 0.95, rate: 3.0, max: 4 },
  shelf: { n: "Бельевой шкаф", r: 0.5, fr: 0.95, R: 3.2, max: 6, auto: "сам застилает грязные номера рядом" },
  post: { n: "Пневмопочта", r: 0.45, fr: 0.9, R: 3.6, auto: "сама забирает выручку из номеров рядом" },
  lift: { n: "Лифт шампанского", r: 0.45, fr: 0.9, R: 3.2, auto: "берёт 🍾 у бара рядом и разносит по номерам" },
  carpet: { n: "Красная дорожка", r: 0.45, fr: 0, R: 3.4, flat: true, auto: "клиенты сами идут в свободные номера рядом" },
  crate: { n: "Ящик", r: 0.45, fr: 0.8 },
};
export const CATALOG = [
  { id: "room", n: "Номер + новая девушка", cost: 320, need: null },
  { id: "laundry", n: "Стиральная машина", cost: 140 },
  { id: "bar", n: "Бар: шампанское → VIP 👑", cost: 240 },
  { id: "shelf", n: "Бельевой шкаф (автоматика)", cost: 220 },
  { id: "post", n: "Пневмопочта (автоматика)", cost: 260 },
  { id: "lift", n: "Лифт шампанского (автоматика)", cost: 300, need: "bar" },
  { id: "carpet", n: "Красная дорожка (автоматика)", cost: 280 },
];
export const WARD = [
  { id: "spd", n: "Лаковые туфли", d: "скорость", max: 3, cost: [40, 90, 170], v: (l) => (5 * (1 + 0.12 * l)).toFixed(1) + " м/с" },
  { id: "lead", n: "Обаяние", d: "ведёшь клиентов", max: 3, cost: [35, 80, 150], v: (l) => 2 + l + " чел." },
  { id: "hands", n: "Сумка", d: "вещей в руках", max: 3, cost: [30, 70, 140], v: (l) => 2 + l + " шт." },
];
// карты утра
export const CARDS = [
  { id: "girl", n: "Новая девушка", d: "+ номер и девушка (тип на выбор при постановке)", ic: "💃", many: true },
  { id: "bar", n: "Шампанское и VIP", d: "бар бесплатно; приходят VIP 👑 (платят втрое)", ic: "🍾" },
  { id: "shelf", n: "Бельевой шкаф", d: "бесплатно; сам застилает номера рядом", ic: "🧺" },
  { id: "post", n: "Пневмопочта", d: "бесплатно; сама собирает выручку рядом", ic: "📮" },
  { id: "carpet", n: "Красная дорожка", d: "бесплатно; клиенты сами идут в номера рядом", ic: "🟥" },
  { id: "lift", n: "Лифт шампанского", d: "бесплатно; разносит 🍾 от бара", ic: "🛗", need: "bar" },
  { id: "fleet", n: "Флот в порту", d: "клиентов +30%, платят +20%. Цель ночи выше", ic: "⚓", many: true },
  { id: "silk", n: "Шёлковые простыни", d: "в номере на 15% быстрее", ic: "🎀", many: true },
  { id: "patient", n: "Терпеливые гости", d: "ждут в очереди на 30% дольше", ic: "⏳", many: true },
  { id: "tips", n: "Щедрые чаевые", d: "личные чаевые ×2", ic: "💸" },
  { id: "wash", n: "Быстрая стирка", d: "машины стирают на 30% быстрее", ic: "🫧", many: true },
];

const rnd = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function newGame(seed = (Math.random() * 1e9) | 0) {
  const G = {
    seed, R: rnd(seed), nid: 1, t: 0, loc: 0, night: 1, ph: "prep", pt: 0, money: 0, strikes: 0,
    earned: 0, lost: 0, served: 0, target: 0, P: {}, S: [], C: [], girls: [], flags: {}, mods: { cust: 1, pay: 1, silk: 1, pat: 1, wash: 1, tips: 1 },
    offer: null, votes: {}, raid: null, ev: [], evId: 0, stVer: 1, report: null, won: false,
  };
  addStation(G, "room", -3.5, -3.5, { girl: "lola" });
  addStation(G, "room", -1, -3.5, { girl: "mimi" });
  addStation(G, "laundry", 3.5, -3.5);
  G.girls = ["lola", "mimi"];
  return G;
}
export function addStation(G, k, x, z, o = {}) {
  const s = { id: G.nid++, k, x, z, carried: null, st: "idle", t: 0, dur: 0, cl: null, bottle: false, cash: 0, stock: k === "laundry" ? 2 : k === "bar" ? 2 : 0, cd: 0, ...o };
  G.S.push(s); G.stVer++;
  return s;
}
export function players(G) { return Object.values(G.P); }
export function nP(G) { return clamp(players(G).length, 1, 4); }
export function custMult(G) { return CUST[nP(G) - 1] * G.mods.cust; }
export function nightTarget(G) { return Math.round((200 + 150 * (G.night - 1) + 60 * G.loc * NIGHTS_PER_LOC) * custMult(G)); }
export function ev(G, k, o = {}) { G.ev.push({ i: ++G.evId, k, ...o }); if (G.ev.length > 40) G.ev.splice(0, G.ev.length - 40); }

export function addPlayer(G, id, name) {
  if (G.P[id]) return G.P[id];
  const idx = players(G).length;
  G.P[id] = { id, name: (name || "Игрок").slice(0, 14), c: idx % 4, x: -1 + idx * 0.8, z: 4.2, yaw: Math.PI, still: 0, mv: 0, hands: [], carry: [], tips: 0, lv: { spd: 0, lead: 0, hands: 0 }, ready: false, act: 0, holding: null };
  ev(G, "toast", { m: `${name || "Игрок"} в банде` });
  return G.P[id];
}
export function removePlayer(G, id) {
  const p = G.P[id]; if (!p) return;
  for (const cid of p.carry) { const c = G.C.find((c) => c.id === cid); if (c) { c.st = "wait"; c.leader = null; } }
  if (p.holding) { const s = G.S.find((s) => s.id === p.holding); if (s) { s.carried = null; s.x = clamp(p.x, AREA.px0, AREA.px1); s.z = clamp(p.z, AREA.pz0, AREA.pz1); G.stVer++; } }
  delete G.P[id];
}
export const speedOf = (p) => 5 * (1 + 0.12 * p.lv.spd);
export const leadCap = (p) => 2 + p.lv.lead;
export const handsCap = (p) => 2 + p.lv.hands;
export const front = (s) => ({ x: s.x, z: s.z + ST[s.k].fr });

/* ---------- столкновения (общие для хозяина и гостя: гость считает своё движение сам) ---------- */
export function collide(G, o) {
  o.x = clamp(o.x, AREA.x0, AREA.x1); o.z = clamp(o.z, AREA.z0, AREA.z1);
  for (const s of G.S) {
    if (s.carried || ST[s.k].flat) continue;
    const r = ST[s.k].r + 0.3, dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz);
    if (d < r && d > 0.0001) { o.x = s.x + (dx / d) * r; o.z = s.z + (dz / d) * r; }
  }
}

/* ---------- расстановка ---------- */
export function placeSpot(G, p) {
  const x = Math.round(p.x + Math.sin(p.yaw) * 1.6), z = Math.round(p.z + Math.cos(p.yaw) * 1.6);
  return { x: clamp(x, AREA.px0, AREA.px1), z: clamp(z, AREA.pz0, AREA.pz1) };
}
export function canPlace(G, k, x, z, ignoreId) {
  const r = ST[k].r;
  if (x < AREA.px0 || x > AREA.px1 || z < AREA.pz0 || z > AREA.pz1) return false;
  for (const s of G.S) { if (s.id === ignoreId || s.carried) continue; if (Math.hypot(s.x - x, s.z - z) < r + ST[s.k].r + 0.35) return false; }
  for (const q of [PADS.office, PADS.ward, QUEUE]) if (Math.hypot(q.x - x, q.z - z) < r + 1) return false;
  return true;
}
export function grabbable(G, p) {
  if (p.holding || p.hands.length || (p.carry && p.carry.length) || p.carryN) return null;
  let best = null, bd = 1.9;
  for (const s of G.S) { if (s.carried || s.st === "wait" || s.st === "toRoom" || s.st === "room" || s.st === "out") continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } }
  return best;
}

/* ---------- действия игроков (кнопки) ---------- */
export function applyOp(G, pid, op) {
  const p = G.P[pid]; if (!p) return false;
  const [k, a, b] = op;
  if (k === "grab") { const s = grabbable(G, p); if (!s) return false; s.carried = pid; p.holding = s.id; G.stVer++; ev(G, "sfx", { s: "pick" }); return true; }
  if (k === "place") {
    const s = G.S.find((s) => s.id === p.holding); if (!s) { p.holding = null; return false; }
    const sp = placeSpot(G, p); if (!canPlace(G, s.k, sp.x, sp.z, s.id)) { ev(G, "toast", { to: pid, m: "Сюда не встанет — найди свободное место" }); return false; }
    if (s.k === "crate") { s.k = s.as; delete s.as; if (s.k === "room") { s.girl = s.girl || nextGirl(G, a); G.girls.push(s.girl); ev(G, "toast", { m: `${GIRL[s.girl].n} заступила на смену` }); } }
    s.x = sp.x; s.z = sp.z; s.carried = null; p.holding = null; G.stVer++; ev(G, "sfx", { s: "ok" }); ev(G, "poof", { x: s.x, z: s.z });
    return true;
  }
  if (k === "buy") {
    const it = CATALOG.find((c) => c.id === a); if (!it || G.money < it.cost) return false;
    if (it.need && !G.S.some((s) => s.k === it.need || (s.k === "crate" && s.as === it.need))) { ev(G, "toast", { to: pid, m: "Сначала нужен бар" }); return false; }
    G.money -= it.cost; crate(G, it.id, b); ev(G, "sfx", { s: "buy" }); ev(G, "toast", { m: `${p.name} купил: ${it.n}. Ящик у входа — поставь его` });
    return true;
  }
  if (k === "ward") {
    const w = WARD.find((x) => x.id === a); const l = p.lv[a]; if (!w || l >= w.max || p.tips < w.cost[l]) return false;
    p.tips -= w.cost[l]; p.lv[a] = l + 1; ev(G, "sfx", { s: "buy", to: pid }); return true;
  }
  if (k === "ready") { if (G.ph !== "prep") return false; p.ready = !p.ready; if (players(G).every((q) => q.ready)) startNight(G); return true; }
  if (k === "vote") { if (G.ph !== "morning" || !G.offer) return false; G.votes[pid] = a; if (players(G).every((q) => G.votes[q.id] != null)) resolveVote(G); return true; }
  return false;
}
function nextGirl(G, type) {
  const free = GIRLS.filter((g) => !G.girls.includes(g.id) && !G.S.some((s) => s.girl === g.id));
  return (free.find((g) => g.t === type) || free[0] || GIRLS[0]).id;
}
function crate(G, as, type) {
  let x = 0, z = 3; for (let i = 0; i < 12 && !canPlace(G, "crate", x, z); i++) { x = ((i % 5) - 2) * 1.2; z = 3 - Math.floor(i / 5); }
  const s = addStation(G, "crate", x, z, { as });
  if (as === "room") s.girl = nextGirl(G, type);
  ev(G, "poof", { x, z });
  return s;
}

/* ---------- фазы ---------- */
export function startNight(G) {
  G.ph = "night"; G.pt = NIGHT_LEN; G.earned = 0; G.lost = 0; G.served = 0; G.target = nightTarget(G); G.spawnT = 2; G.raid = null;
  G.raidAt = G.night >= RAID_FROM ? NIGHT_LEN * (0.35 + G.R() * 0.3) : -1;
  for (const p of players(G)) p.ready = false;
  ev(G, "night"); ev(G, "sfx", { s: "promo" });
}
function endNight(G) {
  G.ph = "morning";
  for (const c of G.C) if (c.st === "wait" || c.st === "arrive" || c.st === "follow") { c.st = "leave"; c.leader = null; }
  for (const p of players(G)) p.carry = [];
  const ok = G.earned >= G.target;
  if (!ok) G.strikes++;
  G.report = { night: G.night, earned: G.earned, target: G.target, ok, lost: G.lost, served: G.served, tips: Object.fromEntries(players(G).map((p) => [p.name, Math.round(p.nightTips || 0)])), strikes: G.strikes };
  for (const p of players(G)) p.nightTips = 0;
  if (G.strikes >= 3) { G.report.over = true; G.offer = null; return; }
  if (ok && G.night % NIGHTS_PER_LOC === 0) G.report.promo = LOCS[Math.min(LOCS.length - 1, G.loc + 1)].n;
  G.offer = makeOffer(G); G.votes = {};
  ev(G, "morning"); ev(G, "sfx", { s: ok ? "promo" : "bad" });
}
function makeOffer(G) {
  const pool = CARDS.filter((c) => (c.many || !G.flags[c.id]) && (!c.need || G.flags[c.need] || G.S.some((s) => s.k === c.need)));
  const out = [];
  if (G.night % 2 === 1 || G.girls.length < 3) out.push("girl");
  while (out.length < 3 && pool.length) { const c = pool[Math.floor(G.R() * pool.length)]; if (!out.includes(c.id)) out.push(c.id); if (out.length >= Math.min(3, pool.length)) break; }
  return out.slice(0, 3);
}
function resolveVote(G) {
  const cnt = {}; for (const v of Object.values(G.votes)) cnt[v] = (cnt[v] || 0) + 1;
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
  const id = G.offer[+best]; G.flags[id] = (G.flags[id] || 0) + 1;
  if (id === "girl") crate(G, "room", ["fire", "sweet", "chic"][G.girls.length % 3]);
  if (["bar", "shelf", "post", "carpet", "lift"].includes(id)) crate(G, id);
  if (id === "fleet") { G.mods.cust *= 1.3; G.mods.pay *= 1.2; }
  if (id === "silk") G.mods.silk *= 0.85;
  if (id === "patient") G.mods.pat *= 1.3;
  if (id === "tips") G.mods.tips *= 2;
  if (id === "wash") G.mods.wash *= 0.7;
  ev(G, "toast", { m: `Банда выбрала: ${CARDS.find((c) => c.id === id).n}` });
  if (G.report && G.report.promo) { G.loc = Math.min(LOCS.length - 1, G.loc + 1); ev(G, "toast", { m: `Повышение! Новая локация скоро: ${G.report.promo}. Пока продолжаем здесь` }); }
  G.night++; G.offer = null; G.votes = {}; G.ph = "prep"; G.report = null;
}
export function restart(G) { const g = newGame(); for (const p of players(G)) { addPlayer(g, p.id, p.name); } return g; }

/* ---------- шаг мира (только у хозяина) ---------- */
export function step(G, dt, inputs) {
  G.t += dt;
  // позиции присылают сами игроки
  for (const p of players(G)) {
    const inp = inputs[p.id]; if (!inp) continue;
    if (inp.x != null) { const d = Math.hypot(inp.x - p.x, inp.z - p.z); p.mv = d / Math.max(dt, 0.001); p.x = inp.x; p.z = inp.z; p.yaw = inp.yaw; p.still = p.mv < 0.6 ? p.still + dt : 0; }
  }
  for (const s of G.S) if (s.carried) { const p = G.P[s.carried]; if (p) { s.x = p.x; s.z = p.z; } else s.carried = null; }
  // станции, которые производят сами
  for (const s of G.S) {
    if (s.k === "laundry" && s.stock < ST.laundry.max) { s.t += dt; if (s.t >= ST.laundry.rate * G.mods.wash) { s.t = 0; s.stock++; } }
    if (s.k === "bar" && s.stock < ST.bar.max) { s.t += dt; if (s.t >= ST.bar.rate) { s.t = 0; s.stock++; } }
  }
  if (G.ph === "night") {
    G.pt -= dt;
    G.spawnT -= dt;
    if (G.spawnT <= 0 && G.pt > 6) { spawn(G); G.spawnT = Math.max(1.6, 4.4 - 0.22 * (G.night - 1) - 0.4 * G.loc) / custMult(G) * (0.7 + G.R() * 0.6); }
    if (G.raidAt > 0 && !G.raid && G.pt < G.raidAt) { G.raid = { t: 20 }; ev(G, "raid"); ev(G, "sfx", { s: "alarm" }); }
    if (G.raid) { G.raid.t -= dt; if (G.raid.t <= 0) doRaid(G); }
    if (G.pt <= 0) endNight(G);
  }
  for (const p of players(G)) stepPlayer(G, p, dt);
  for (const s of G.S) if (s.k === "room" && !s.carried) stepRoom(G, s, dt);
  stepAuto(G, dt);
  for (const c of G.C) stepClient(G, c, dt);
  G.C = G.C.filter((c) => c.st !== "gone");
  // очередь: места
  let i = 0; for (const c of G.C) if (c.st === "wait" || c.st === "arrive") { c.tx = QUEUE.x + 0.55 * (i % 7); c.tz = QUEUE.z - (i >= 7 ? 0.7 : 0); i++; }
}
function spawn(G) {
  if (G.C.filter((c) => c.st === "wait" || c.st === "arrive").length >= 9) return;
  let type = TYPES_ORDER[Math.floor(G.R() * 3)];
  if (G.S.some((s) => s.k === "bar") && G.R() < 0.16) type = "vip";
  G.C.push({ id: G.nid++, type, x: DOOR.x + (G.R() - 0.5), z: DOOR.z + 2.5, st: "arrive", tx: QUEUE.x, tz: QUEUE.z, pat: 32 * PATI[nP(G) - 1] * G.mods.pat, leader: null, room: null, mood: 0, sp: 2.6 + G.R() * 0.5 });
}
function lostOne(G, c) { G.lost++; c.st = "leave"; c.mood = -1; ev(G, "lost"); }
function stepClient(G, c, dt) {
  let tx = c.tx, tz = c.tz, sp = c.sp;
  if (c.st === "follow") {
    const L = G.P[c.leader]; if (!L) { c.st = "wait"; c.leader = null; return; }
    const i = L.carry.indexOf(c.id); const ahead = i <= 0 ? L : G.C.find((k) => k.id === L.carry[i - 1]) || L;
    const d = Math.hypot(ahead.x - c.x, ahead.z - c.z);
    if (d > 0.8) { tx = ahead.x; tz = ahead.z; sp = Math.max(3, d * 4.5); } else { tx = c.x; tz = c.z; }
  }
  if (c.st === "toRoom" || c.st === "walkRoom") { const s = G.S.find((s) => s.id === c.room); if (!s) { c.st = "wait"; return; } const f = front(s); tx = f.x + 0.4; tz = f.z; }
  if (c.st === "leave") { tx = DOOR.x; tz = DOOR.z + 3; }
  if (c.st === "inRoom" || c.st === "atRoom") return;
  const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
  c.mv = 0;
  if (d > 0.05) { const stp = Math.min(d, sp * dt); c.x += (dx / d) * stp; c.z += (dz / d) * stp; c.mv = stp / dt; c.yaw = Math.atan2(dx, dz); }
  if (c.st === "arrive" && d < 0.1) c.st = "wait";
  if (c.st === "wait") { c.pat -= dt; if (c.pat <= 0) lostOne(G, c); }
  if ((c.st === "toRoom" || c.st === "walkRoom") && d < 0.15) c.st = "atRoom";
  if (c.st === "leave" && d < 0.3) c.st = "gone";
}
function stepPlayer(G, p, dt) {
  if (G.ph === "morning" || p.holding) return;
  if (p.still < 0.15) return;
  p.act -= dt; if (p.act > 0) return; p.act = 0.2;
  // очередь
  if (G.ph === "night" && Math.hypot(p.x - QUEUE.x - 0.6, p.z - QUEUE.z) < 1.7 && p.carry.length < leadCap(p)) {
    const c = G.C.find((c) => c.st === "wait"); if (c) { c.st = "follow"; c.leader = p.id; p.carry.push(c.id); ev(G, "sfx", { s: "pick", to: p.id }); return; }
  }
  for (const s of G.S) {
    if (s.carried) continue;
    const f = front(s); if (Math.hypot(p.x - f.x, p.z - f.z) > 1.05) continue;
    if ((s.k === "laundry" || s.k === "bar") && s.stock > 0 && p.hands.length < handsCap(p)) { s.stock--; p.hands.push(s.k === "laundry" ? "l" : "b"); ev(G, "sfx", { s: "pick", to: p.id }); return; }
    if (s.k === "shelf" && s.stock < ST.shelf.max && p.hands.includes("l")) { p.hands.splice(p.hands.indexOf("l"), 1); s.stock++; ev(G, "sfx", { s: "ok", to: p.id }); return; }
    if (s.k === "room") {
      if (s.st === "dirty" && p.hands.includes("l")) { p.hands.splice(p.hands.indexOf("l"), 1); clean(G, s); return; }
      if (!s.bottle && s.st !== "dirty" && p.hands.includes("b")) { p.hands.splice(p.hands.indexOf("b"), 1); s.bottle = true; ev(G, "sfx", { s: "ok" }); return; }
      if (s.st === "idle" && p.carry.length) {
        const cid = p.carry.find((id) => { const c = G.C.find((k) => k.id === id); return c && (c.type !== "vip" || s.bottle); });
        if (cid == null) { if (!s.warnT || G.t > s.warnT) { s.warnT = G.t + 3; ev(G, "toast", { to: p.id, m: "VIP 👑 идёт только в номер с шампанским 🍾" }); } continue; }
        p.carry.splice(p.carry.indexOf(cid), 1); assign(G, s, G.C.find((k) => k.id === cid), p.id); return;
      }
    }
  }
  // выручка
  for (const s of G.S) { if (s.k !== "room" || !s.cash || s.carried) continue; const f = front(s); if (Math.hypot(p.x - (f.x + 0.75), p.z - f.z) < 0.9) { takeCash(G, s, p); return; } }
}
function takeCash(G, s, p) { const v = s.cash; s.cash = 0; G.money += v; G.earned += v; ev(G, "cash", { x: s.x, z: s.z, v, to2: p ? p.id : null }); }
function clean(G, s) { s.st = "idle"; ev(G, "clean", { x: s.x, z: s.z }); }
function assign(G, s, c, leaderId) {
  s.st = "wait"; s.cl = c.id; s.leader = leaderId; c.st = "toRoom"; c.room = s.id; c.leader = null;
  if (c.type === "vip") s.bottle = false;
  ev(G, "sfx", { s: "ok" });
}
function stepRoom(G, s, dt) {
  const girl = GIRL[s.girl];
  if (s.st === "wait") { const c = G.C.find((k) => k.id === s.cl); if (!c) { s.st = "idle"; return; } if (c.st === "atRoom") { s.st = "room"; s.t = 0; c.st = "inRoom"; s.dur = 4.6 * G.mods.silk * (c.type === "vip" ? 1.4 : 1); ev(G, "door", { id: s.id }); } return; }
  if (s.st === "room") {
    s.t += dt;
    if (s.t >= s.dur) {
      const c = G.C.find((k) => k.id === s.cl); s.st = "dirty"; s.cl = null;
      if (!c) return;
      const match = girl && CLIENTS[c.type].likes === girl.t;
      const val = Math.round(PAY[c.type] * (match ? 1.5 : 1) * G.mods.pay);
      s.cash += val; G.served++;
      const L = G.P[s.leader]; if (L) { const tip = Math.round(val * 0.1 * G.mods.tips); L.tips += tip; L.nightTips = (L.nightTips || 0) + tip; }
      c.st = "leave"; c.mood = match ? 2 : 1; c.x = s.x + 0.4; c.z = front(s).z;
      ev(G, "pay", { x: s.x, z: s.z, v: val, match: !!match, vip: c.type === "vip", girl: s.girl });
    }
  }
}
function stepAuto(G, dt) {
  const rooms = G.S.filter((s) => s.k === "room" && !s.carried);
  for (const a of G.S) {
    if (a.carried) continue;
    a.cd = Math.max(0, a.cd - dt);
    if (a.cd > 0) continue;
    const near = (s) => Math.hypot(front(s).x - a.x, front(s).z - a.z) <= ST[a.k].R;
    if (a.k === "shelf" && a.stock > 0) { const r = rooms.find((s) => s.st === "dirty" && near(s)); if (r) { a.stock--; clean(G, r); a.cd = 1.2; ev(G, "auto", { a: a.id, b: r.id, it: "l" }); } }
    if (a.k === "post") { const r = rooms.find((s) => s.cash > 0 && near(s)); if (r) { takeCash(G, r, null); a.cd = 1.0; ev(G, "auto", { a: r.id, b: a.id, it: "c" }); } }
    if (a.k === "lift") { const bar = G.S.find((b) => b.k === "bar" && !b.carried && b.stock > 0 && Math.hypot(b.x - a.x, b.z - a.z) <= ST.lift.R); const r = rooms.find((s) => !s.bottle && s.st !== "dirty" && near(s)); if (bar && r) { bar.stock--; r.bottle = true; a.cd = 2; ev(G, "auto", { a: a.id, b: r.id, it: "b" }); } }
    if (a.k === "carpet" && G.ph === "night") {
      const r = rooms.find((s) => s.st === "idle" && near(s));
      const c = r && G.C.find((k) => k.st === "wait" && (k.type !== "vip" || r.bottle));
      if (r && c) { assign(G, r, c, null); c.st = "walkRoom"; a.cd = 2.5; }
    }
  }
}
function doRaid(G) {
  const dirty = G.S.filter((s) => s.k === "room" && s.st === "dirty").length;
  const cash = G.S.filter((s) => s.k === "room" && s.cash > 0).length;
  const n = dirty + cash, fine = n * 60;
  G.money = Math.max(0, G.money - fine); G.raid = null;
  ev(G, "raidEnd", { n, fine, dirty, cash });
}

/* ---------- снимок для гостей (компактный) ---------- */
const TI = { sailor: 0, student: 1, rich: 2, vip: 3 }, TN = ["sailor", "student", "rich", "vip"];
const CS = ["arrive", "wait", "follow", "toRoom", "walkRoom", "atRoom", "inRoom", "leave"];
const RS = ["idle", "wait", "room", "dirty"];
const r2 = (v) => Math.round(v * 100) / 100;
export function snapshot(G, full) {
  const o = {
    t: r2(G.t), ph: G.ph, pt: r2(G.pt), n: G.night, loc: G.loc, m: G.money, sk: G.strikes, e: G.earned, tg: G.target, lost: G.lost,
    rd: G.raid ? r2(G.raid.t) : 0, of: G.offer, vo: G.votes, rp: G.report, fl: G.flags, sv: G.stVer,
    P: players(G).map((p) => [p.id, p.name, p.c, r2(p.x), r2(p.z), r2(p.yaw), p.hands.join(""), p.carry.length, p.tips, p.ready ? 1 : 0, p.lv.spd, p.lv.lead, p.lv.hands, p.holding || 0]),
    C: G.C.map((c) => [c.id, TI[c.type], r2(c.x), r2(c.z), r2(c.yaw || 0), CS.indexOf(c.st), c.mood, Math.round(c.pat || 0), r2(c.mv || 0)]),
    D: G.S.map((s) => [s.id, RS.indexOf(s.st), s.cash, s.bottle ? 1 : 0, s.stock, s.st === "room" ? r2(s.t / s.dur) : 0, s.carried ? 1 : 0, r2(s.x), r2(s.z)]),
    ev: G.ev.slice(-20),
  };
  if (full) o.S = G.S.map((s) => [s.id, s.k, s.girl || "", s.as || ""]);
  return o;
}
// гость: разворачиваем снимок в «вид мира» (те же поля, что использует картинка)
export function unpack(o, prev) {
  const V = prev || { S: [] };
  Object.assign(V, { t: o.t, ph: o.ph, pt: o.pt, night: o.n, loc: o.loc, money: o.m, strikes: o.sk, earned: o.e, target: o.tg, lost: o.lost, raid: o.rd ? { t: o.rd } : null, offer: o.of, votes: o.vo || {}, report: o.rp, flags: o.fl || {}, stVer: o.sv });
  V.P = {}; for (const a of o.P) V.P[a[0]] = { id: a[0], name: a[1], c: a[2], x: a[3], z: a[4], yaw: a[5], hands: a[6] ? a[6].split("") : [], carryN: a[7], tips: a[8], ready: !!a[9], lv: { spd: a[10], lead: a[11], hands: a[12] }, holding: a[13] || null, carry: [] };
  V.C = o.C.map((a) => ({ id: a[0], type: TN[a[1]], x: a[2], z: a[3], yaw: a[4], st: CS[a[5]], mood: a[6], pat: a[7], mv: a[8] }));
  if (o.S) V.Smeta = Object.fromEntries(o.S.map((a) => [a[0], { k: a[1], girl: a[2] || null, as: a[3] || null }]));
  const meta = V.Smeta || {};
  V.S = o.D.filter((a) => meta[a[0]]).map((a) => ({ id: a[0], k: meta[a[0]].k, girl: meta[a[0]].girl, as: meta[a[0]].as, st: RS[a[1]] || "idle", cash: a[2], bottle: !!a[3], stock: a[4], prog: a[5], carried: a[6] ? 1 : null, x: a[7], z: a[8] }));
  V.needMeta = o.D.some((a) => !meta[a[0]]);
  V.ev = o.ev || [];
  return V;
}
