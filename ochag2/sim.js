// «Хутор» — логика без DOM: стол, стопки, рецепты, бои, дни, еда, место, мост, задания.
// Работает у хозяина комнаты (он «считает» мир), в одиночной игре и в Node (проверка баланса ботами).
// Игроки p = 0 (южная семья, хозяин) и p = 1 (северная семья). Действия игроков — функции *I (намерения).
import { CARDS, RECIPES, LOOT, PACKS, IDEAS, REGIONS, RIV, WORLD, BANKS, SITE_POS, THREATS, BOSS_DAY, REGION_THREATS, QUESTS, ENDLESS,
  ROLES, DAY_LEN, EAT, BASE_CAP, STACK_DY, COIN_DY, CW, CH, BRIDGE } from "./data.js";

export const NIGHT_LEN = 4.2;
const MAX_STACK = 16;
const HOLD_AUTO = 25;                  // сек: если лишние карты не продали — продаём сами (самые дешёвые)

/* ---------- случайность (сохраняется вместе с игрой) ---------- */
export function rnd(G) {
  let t = (G.rs = (G.rs + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pickW(G, table) {
  let s = 0; for (const e of table) s += e[1];
  let r = rnd(G) * s;
  for (const e of table) { r -= e[1]; if (r <= 0) return e[0]; }
  return table[table.length - 1][0];
}

/* ---------- разбор рецептов ---------- */
const PR = RECIPES.map((r) => {
  const p = { r, use: [], keep: [], wear: [], w: 0, opt: 0 };
  for (const tk of r.need) {
    if (tk === "@w") p.w++;
    else if (tk === "?@w") p.opt++;
    else if (tk[0] === "=") p.keep.push(tk.slice(1));
    else if (tk[0] === "~") p.wear.push(tk.slice(1));
    else p.use.push(tk);
  }
  p.spec = p.use.concat(p.keep, p.wear);
  p.size = p.spec.length + p.w;
  return p;
});
PR.sort((a, b) => b.spec.length - a.spec.length);
export const RECIPE_BY_ID = {}; for (const p of PR) RECIPE_BY_ID[p.r.id] = p.r;
export const PR_BY_ID = {}; for (const p of PR) PR_BY_ID[p.r.id] = p;
export const PAIR_XW = 2;
// откуда берётся ресурс: природная карта → что с неё добывают (валун → камень)
export const SRC = {}; for (const p of PR) if (p.r.cat === "gather" && p.wear.length === 1 && p.r.out) SRC[p.wear[0]] = SRC[p.wear[0]] || p.r.out[0];
export const isW = (k) => CARDS[k] && CARDS[k].tg && CARDS[k].tg.indexOf("w") >= 0;
export const isPerson = (k) => CARDS[k] && CARDS[k].c === "person";
export const isEnemy = (k) => CARDS[k] && CARDS[k].c === "enemy";
export const isFixed = (k) => CARDS[k] && !!CARDS[k].fixed;

/* ---------- новая игра ----------
   opt: {seed, roles:[r0, r1], solo: bool} */
export function newGame(opt) {
  opt = opt || {};
  const G = {
    v: 2, cid: ((opt.seed >>> 0) || 12345).toString(36) + Date.now().toString(36).slice(-4), rs: (opt.seed >>> 0) || 12345, nid: 1, day: 1, t: 0, ph: "day", nt: 0, spd: 1, hold: 0,
    cards: {}, fights: {}, nfid: 1, kn: {}, q: 0, won: 0, lost: 0, endless: 0, bridge: 0,
    open: { home: 1 }, f: {}, bought: {}, ev: [], twr: 0, ht: {}, season: 0,
    pl: [{ role: (opt.roles && opt.roles[0]) || "forester" }, { role: (opt.roles && opt.roles[1]) || "master" }],
    solo: opt.solo ? 1 : 0,
    st: { made: {}, sold: 0, packs: 0, kills: 0, deaths: 0, starve: 0, born: 0, eaten: 0, time: 0, maxPop: 4, acts: [0, 0], trades: 0 },
  };
  for (const id of ["r_wood", "r_stone", "r_berry", "r_mush", "r_clay", "r_hut", "r_breed", "r_plank", "r_apple", "b_1", "b_2", "b_3", "b_4", "b_5"]) G.kn[id] = 1;
  const put = (k, x, y, o) => { const c = add(G, k, x, y); if (o != null) c.o = o; return c; };
  // мост — в реке посередине
  put("site0", SITE_POS[0], SITE_POS[1]);
  // южный берег (семья 0): лес
  const sy = 1180, sx = 700;
  put("tree", sx - 270, sy - 40); put("tree", sx - 180, sy + 110); put("bush", sx + 180, sy - 40); put("grass", sx + 270, sy + 110);
  put("appletree", sx - 360, sy + 260); put("forest", sx + 360, sy + 260);
  put("villager", sx - 50, sy + 120, 0); put("villager", sx + 50, sy + 120, 0);
  const b1 = put("berry", sx + 140, sy + 270); stackOnto(G, put("berry", sx, sy), b1);
  // северный берег (семья 1): камень
  const ny = 330, nx = 700;
  put("rock", nx - 270, ny + 40); put("rock", nx - 180, ny - 110); put("claypit", nx + 180, ny + 40); put("mushpatch", nx + 270, ny - 110);
  put("cave", nx + 360, ny - 230); put("tree", nx - 360, ny - 230);
  put("villager", nx - 50, ny - 120 + 140, 1); put("villager", nx + 50, ny - 120 + 140, 1);
  const m1 = put("mushroom", nx - 140, ny + 220); stackOnto(G, put("mushroom", nx, ny), m1);
  // монеты — у каждого берега
  G.wal = [3, 3];          // кошельки семей: монеты — просто число, карт-монет на столе нет
  for (const id in G.cards) { const c = G.cards[id]; if (isPerson(c.k)) c.hp = maxHp(G, c); }
  G.ev = [];
  return G;
}

/* ---------- карты и стопки ---------- */
export function add(G, k, x, y) {
  const d = CARDS[k];
  const c = { id: G.nid++, k, x, y, dn: 0, up: 0, dirty: 1 };
  if (d.u) c.u = d.u;
  if (d.hp) c.hp = d.hp;
  if (d.f) c.f = d.f;
  if (d.c === "enemy") c.tm = d.spd;
  G.cards[c.id] = c;
  return c;
}
export const root = (G, c) => { while (c.dn && G.cards[c.dn]) c = G.cards[c.dn]; return c; };
export function chain(G, r) { const a = []; let c = r; while (c) { a.push(c); c = c.up ? G.cards[c.up] : null; } return a; }
export const topOf = (G, c) => { while (c.up && G.cards[c.up]) c = G.cards[c.up]; return c; };
function dyOf(below, c, i) { return below.k === "coin" && c.k === "coin" ? (i < 10 ? COIN_DY : 0) : STACK_DY; }
export function stackH(G, r) { let h = CH, c = r, i = 0; while (c.up) { const u = G.cards[c.up]; if (!u) break; h += dyOf(c, u, ++i); c = u; } return h; }
export function layout(G, r) {
  let c = r, i = 0;
  while (c.up) { const u = G.cards[c.up]; if (!u) break; u.x = c.x; u.y = c.y + dyOf(c, u, ++i); c = u; }   // у гостя соседняя карта могла ещё не прийти
}
function dirty(G, r) { r.rc = ""; r.rt = 0; r.dirty = 1; }
export function detach(G, c) {
  if (!c.dn) return c;
  const below = G.cards[c.dn];
  below.up = 0; c.dn = 0;
  dirty(G, root(G, below));
  dirty(G, c);
  return c;
}
export function stackOnto(G, c, target) {
  const t = topOf(G, target);
  if (t === c) return;
  t.up = c.id; c.dn = t.id;
  const r = root(G, t);
  layout(G, r); dirty(G, r);
}
export function removeCard(G, c) {
  if (!G.cards[c.id]) return;
  const below = c.dn ? G.cards[c.dn] : null, above = c.up ? G.cards[c.up] : null;
  if (below) below.up = above ? above.id : 0;
  if (above) {
    above.dn = below ? below.id : 0;
    if (!below) { above.x = c.x; above.y = c.y; above.rc = c.rc; above.rt = c.rt; }
  }
  delete G.cards[c.id];
  const r = below ? root(G, below) : above;
  if (r) { layout(G, r); dirty(G, r); }
}
export function roots(G) { const a = []; for (const id in G.cards) { const c = G.cards[id]; if (!c.dn) a.push(c); } return a; }

/* ---------- карта мира: где можно класть карты ---------- */
export function openRects(G) { const a = []; for (const r in G.open) for (const q of REGIONS[r].rects) a.push(q); return a; }
export function regionAt(x, y) { for (const r in REGIONS) for (const q of REGIONS[r].rects) if (x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3]) return r; return null; }
export function inRiver(x, y) { return y + CH * 0.5 > RIV[0] && y + CH * 0.5 < RIV[1] && x > -100 && x < 2300; }
// берег по центру карты: "n" | "s" | null
export function bankOf(y) { const cy = y + CH / 2; return cy < RIV[0] ? "n" : cy > RIV[1] ? "s" : null; }
// прижать карту (x — центр, y — верх) к ближайшему открытому месту
export function clampToBoard(G, c, h) {
  h = h || CH;
  let best = null, bd = 1e18;
  for (const q of openRects(G)) {
    const x = Math.max(q[0] + CW / 2 + 8, Math.min(q[2] - CW / 2 - 8, c.x));
    const y = Math.max(q[1] + 14, Math.min(q[3] - Math.min(h, q[3] - q[1] - 30) - 14, c.y));
    const d = (x - c.x) ** 2 + (y - c.y) ** 2;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  if (best) { c.x = best[0]; c.y = best[1]; }
}
function okSpot(G, x, y, h) {
  for (const q of openRects(G)) if (x - CW / 2 >= q[0] + 6 && x + CW / 2 <= q[2] - 6 && y >= q[1] + 10 && y + h <= q[3] - 10) return true;
  return false;
}
function overlaps(G, x, y, h, skip) {
  for (const id in G.cards) {
    const c = G.cards[id];
    if (c.dn || c === skip || c.cb) continue;
    const ch = c.h || stackH(G, c);
    if (Math.abs(c.x - x) < CW + 6 && y < c.y + ch + 6 && c.y < y + h + 6) return true;
  }
  return false;
}
export function freeSpot(G, x, y, h, skip) {
  h = h || CH;
  for (let ring = 0; ring < 16; ring++) {
    const n = ring === 0 ? 1 : ring * 6;
    const a0 = rnd(G) * 6.283;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 6.283, rr = ring * 62;
      const px = x + Math.cos(a) * rr * 1.25, py = y + Math.sin(a) * rr;
      if (okSpot(G, px, py, h) && !overlaps(G, px, py, h, skip)) return [px, py];
    }
  }
  const t = { x: x + (rnd(G) - 0.5) * 80, y: y + (rnd(G) - 0.5) * 80 }; clampToBoard(G, t, h); return [t.x, t.y];
}
// у каждой семьи свой кошелёк: монета помнит хозяина (o). Без хозяина (старые сохранения) — по берегу.
export const bankFam = (y) => (bankOf(y) === "n" ? 1 : 0);
export const coinOf = (c) => (c.o != null ? c.o : bankFam(c.y));
function coinPile(G, skipId, nearY, o) {
  let best = null, bd = 1e12;
  const bank = nearY != null ? bankOf(nearY) : null;
  for (const r of roots(G)) {
    if (r.id === skipId || r.k !== "coin" || r.drag) continue;
    if (o != null && coinOf(r) !== o) continue;
    if (bank && bankOf(r.y) !== bank) continue;
    const d = nearY != null ? Math.abs(r.y - nearY) : r.y; if (d < bd) { bd = d; best = r; }
  }
  return best;
}
// выпадение новой карты рядом с (x,y); похожие складываются в ближайшую одинаковую стопку
// монеты сразу в кошелёк семьи o (без хозяина — по берегу, где появились); событие для «летящих монет» к счётчику
export function addCoins(G, o, n, x, y) {
  if (!(n > 0)) return;
  if (!G.wal) G.wal = [0, 0];
  o = o === 1 ? 1 : 0;
  G.wal[o] += n; G.st.made.coin = (G.st.made.coin || 0) + n;
  G.ev.push({ t: "coin", o, n, x, y });
}
export function spawn(G, k, x, y, opt) {
  opt = opt || {};
  const d = CARDS[k];
  if (k === "coin") { addCoins(G, opt.o != null ? opt.o : bankFam(y), opt.n || 1, x, y); return null; }
  if (d.c === "idea") { learn(G, d.rec, x, y, k); return null; }
  const c = add(G, k, x, y);
  if (isPerson(k)) { c.o = opt.o != null ? opt.o : weakFam(G); c.hp = maxHp(G, c); }
  const fx = x, fy = y;
  let placed = false;
  if (k === "coin") {
    c.o = opt.o != null ? opt.o : bankFam(y);
    const p = coinPile(G, c.id, y, c.o);
    if (p && Math.abs(p.x - x) + Math.abs(p.y - y) < 900) { stackOnto(G, c, p); placed = true; }
  } else if ((d.c === "res" || d.c === "food" || d.c === "item") && !opt.loose) {
    let best = null, bd = 230 * 230;
    for (const r of roots(G)) {
      if (r === c || r.drag || r.cb || r.k !== k) continue;
      const ch = chain(G, r); if (ch.length >= 8 || ch.some((q) => q.k !== k)) continue;
      const dd = (r.x - x) ** 2 + (r.y - y) ** 2; if (dd < bd) { bd = dd; best = r; }
    }
    if (best) { stackOnto(G, c, best); placed = true; }
  }
  if (!placed) { const p = freeSpot(G, x + (opt.dx || 0), y + (opt.dy == null ? 40 : opt.dy), CH, c); c.x = p[0]; c.y = p[1]; dirty(G, c); }
  G.st.made[k] = (G.st.made[k] || 0) + 1;
  G.ev.push({ t: "pop", id: c.id, fx, fy, k });
  return c;
}
function learn(G, rec, x, y, ik) {
  const isNew = !G.kn[rec];
  G.kn[rec] = 1;
  G.ev.push({ t: "learn", rec, k: ik, x, y, isNew: isNew ? 1 : 0 });
}

/* ---------- семьи и ремёсла ---------- */
export function famCount(G, o) { let n = 0; for (const id in G.cards) { const c = G.cards[id]; if (isPerson(c.k) && c.o === o) n++; } return n; }
function weakFam(G) { const a = famCount(G, 0), b = famCount(G, 1); return a === b ? (rnd(G) < 0.5 ? 0 : 1) : a < b ? 0 : 1; }
export const roleOf = (G, o) => (G.pl[o] && G.pl[o].role) || "";
export function maxHp(G, c) { return (CARDS[c.k].hp || 1) + (isPerson(c.k) && roleOf(G, c.o) === "guard" ? 3 : 0); }

/* ---------- сопоставление рецептов ---------- */
// возвращает рецепт; если стопка подходит под общий рецепт, но жители из одной семьи — G._miss = рецепт
function matchStack(G, cs, noMiss) {
  if (cs.length < 1) return null;
  const cnt = {};
  for (const c of cs) cnt[c.k] = (cnt[c.k] || 0) + 1;
  let miss = null;
  outer: for (const p of PR) {
    const xw = p.r.pair ? PAIR_XW : 0;     // общие стройки: можно больше жителей (лишние ускоряют)
    if (p.size > cs.length || p.size + p.opt + xw < cs.length) continue;
    const left = Object.assign({}, cnt);
    for (const k of p.spec) { if (!left[k]) continue outer; left[k]--; }
    let ws = 0;
    for (const k in left) { if (!left[k]) continue; if (!isW(k)) continue outer; ws += left[k]; }
    if (ws < p.w || ws > p.w + p.opt + xw) continue;
    if (p.r.pair && !G.solo2) {
      let f0 = 0, f1 = 0; for (const c of cs) if (isW(c.k)) { if (c.o === 0) f0++; else f1++; }
      if (!f0 || !f1) { if (!miss) miss = p; continue; }
    }
    if (p.r.id === "r_breed") { const hut = cs.find((c) => c.k === "hut"); if (hut.br === G.day) continue; if (popCount(G) >= 28) continue; }
    if (p.r.id === "r_trail" && G.open.mountains) continue;
    return p;
  }
  if (!noMiss) G._miss = miss;
  return null;
}
function roleMult(k, cat) {
  if (k === "builder" && (cat === "build" || cat === "bridge")) return 2;
  if (k === "farmer" && (cat === "farm" || cat === "food")) return 2;
  if (k === "explorer" && cat === "explore") return 2;
  return 1;
}
function recipeMult(G, cs, p) {
  const cat = p.r.cat;
  const specLeft = {}; for (const k of p.spec) specLeft[k] = (specLeft[k] || 0) + 1;
  let m = p.w ? 0 : 1, wcount = 0, fam = 1;
  for (const c of cs) {
    if (specLeft[c.k]) { specLeft[c.k]--; continue; }
    if (isW(c.k)) {
      wcount++; m = Math.max(m, roleMult(c.k, cat));
      const R = ROLES[roleOf(G, c.o)]; if (R && R.cats.indexOf(cat) >= 0) fam = Math.max(fam, R.mult);
    }
  }
  if (p.opt && wcount > p.w) m = p.w ? m : (cs.some((c) => c.k === "farmer") ? 2.5 : 1.6);
  const extra = p.r.pair ? Math.max(0, wcount - p.w - p.opt) * 0.25 : 0;   // лишние жители на общей стройке: +25% каждый
  return Math.max(1, m) * fam * (1 + extra);
}
// общий рецепт ждёт жителя другой семьи: {rid, fam, swap}. fam — чья семья нужна (-1 — нужны обе);
// swap — в стопке двое из одной семьи: одного надо убрать и положить жителя другой.
const wFams = (cs) => { let f0 = 0, f1 = 0; for (const c of cs) if (isW(c.k)) { if (c.o === 0) f0++; else f1++; } return [f0, f1]; };
export function pairWait(G, r) {
  if (!r || r.dn || r.rc || r.cb || r.drag || isEnemy(r.k) || (CARDS[r.k] && CARDS[r.k].c === "pack")) return null;
  const cs = chain(G, r);
  const [f0, f1] = wFams(cs);
  if (f0 && f1) return null;
  if (!f0 && !f1) {
    if (cs.length < 3) return null;
    const p = matchStack(G, cs.concat([{ k: "villager", o: 0 }, { k: "villager", o: 1 }]), true);
    return p && p.r.pair ? { rid: p.r.id, fam: -1, swap: 0 } : null;
  }
  const fam = f0 ? 1 : 0;
  const p = matchStack(G, cs.concat([{ k: "villager", o: fam }]), true);
  if (p && p.r.pair) return { rid: p.r.id, fam, swap: 0 };
  return r.ms ? { rid: r.ms, fam, swap: 1 } : null;
}
// может ли из этой стопки выйти хоть какой-то рецепт (если доложить карт)
export function stackFits(G, cs) {
  if (cs.length < 2 || cs.every((c) => c.k === "coin")) return true;
  outer: for (const p of PR) {
    const left = {}; for (const k of p.spec) left[k] = (left[k] || 0) + 1;
    let ws = 0;
    for (const c of cs) { if (left[c.k]) { left[c.k]--; continue; } if (isW(c.k)) { ws++; continue; } continue outer; }
    if (ws <= p.w + p.opt + (p.r.pair ? PAIR_XW : 0)) return true;
  }
  return false;
}
// стройка моста: что уже лежит и чего не хватает — для подсказки над местом моста
export function siteCheck(G, r) {
  if (!r || r.dn || !CARDS[r.k] || CARDS[r.k].c !== "site" || G.bridge >= 5) return null;
  const p = PR_BY_ID["b_" + (G.bridge + 1)]; if (!p) return null;
  const cs = chain(G, r).slice(1);
  const need = {}; for (const k of p.use) need[k] = (need[k] || 0) + 1;
  const have = {}, extra = {};
  let w0 = 0, w1 = 0;
  for (const c of cs) {
    if (need[c.k] && (have[c.k] || 0) < need[c.k]) { have[c.k] = (have[c.k] || 0) + 1; continue; }
    if (isW(c.k)) { if (c.o === 0) w0++; else w1++; continue; }
    extra[c.k] = (extra[c.k] || 0) + 1;
  }
  const mats = Object.keys(need).map((k) => ({ k, have: have[k] || 0, need: need[k] }));
  const maxW = p.w + p.opt + PAIR_XW;
  return { rid: p.r.id, mats, w0, w1, maxW, overW: Math.max(0, w0 + w1 - maxW), extra, ok: mats.every((m) => m.have >= m.need) && w0 >= 1 && w1 >= 1 && w0 + w1 <= maxW && !Object.keys(extra).length };
}
export function stackInfo(G, r) { return r.rc ? { rec: RECIPE_BY_ID[r.rc], p: Math.min(1, r.rt / r.rT) } : null; }

function finishRecipe(G, r, p) {
  const cs = chain(G, r);
  const x = r.x, y = r.y;
  const recId = p.r.id;
  const byK = (k) => { for (let i = cs.length - 1; i >= 0; i--) if (cs[i].k === k && G.cards[cs[i].id]) return cs[i]; return null; };
  for (const k of p.use) { const c = byK(k); if (c) removeCard(G, c); }
  let depleted = null;
  for (const k of p.wear) {
    const c = byK(k); if (!c) continue;
    c.u = (c.u || 1) - 1; c.n = (c.n || 0) + 1;
    if (c.u <= 0) depleted = c;
  }
  const workers = cs.filter((c) => G.cards[c.id] && isW(c.k));
  const fams = [...new Set(workers.map((c) => c.o))];
  if (recId === "r_breed") { const hut = cs.find((c) => c.k === "hut"); hut.br = G.day; G.st.born++; }
  if (p.r.stage) {
    const site = cs.find((c) => CARDS[c.k].c === "site");
    G.bridge = p.r.stage;
    site.k = p.r.stage >= 5 ? "bridge" : BRIDGE[p.r.stage].k;
    dirty(G, site);
    G.ev.push({ t: "bridge", s: p.r.stage, x, y, fams });
    if (p.r.stage >= 5) win(G, "bridge");
  }
  const outs = [];
  if (p.r.out) outs.push(...p.r.out);
  else if (Array.isArray(p.r.lo)) outs.push(pickW(G, p.r.lo));
  else if (p.r.lo) outs.push(exploreLoot(G, p.r.lo, cs, byK(p.wear[0])));
  const equip = p.r.cat === "equip";
  let ri = 0;
  for (const k of outs) {
    if (k[0] === "!") { ambush(G, k.slice(1), x, y, cs); continue; }
    if (equip && ri === 0 && isPerson(k)) {
      const old = cs.find((c) => isPerson(c.k));
      const c = add(G, k, x, y); c.o = old ? old.o : 0; c.hp = maxHp(G, c);
      if (old && G.cards[old.id]) removeCard(G, old);
      G.st.made[k] = (G.st.made[k] || 0) + 1; dirty(G, c);
      G.ev.push({ t: "pop", id: c.id, fx: x, fy: y, k, inplace: 1 }); ri++; continue;
    }
    // новый житель — в семью тех, кто работал; если работали обе семьи (выручка одинокого жителя) — в меньшую
    const c = spawn(G, k, x, y, { dx: (ri - (outs.length - 1) / 2) * 30, o: isPerson(k) ? (fams.length === 1 ? fams[0] : weakFam(G)) : k === "coin" && fams.length === 1 ? fams[0] : undefined });
    ri++;
    if (c && (k === "trail" || k === "darkpath" || k === "boat")) unlockVia(G, k);
  }
  if (depleted) { G.ev.push({ t: "deplete", k: depleted.k, x: depleted.x, y: depleted.y }); removeCard(G, depleted); }
  const disc = !G.kn[recId];
  G.kn[recId] = 1;
  for (const k of outs) for (const rid of (UNLOCKS[k] || [])) if (!G.kn[rid]) { G.kn[rid] = 1; G.ev.push({ t: "learn", rec: rid, x, y, isNew: 1, quiet: 1 }); }
  G.ev.push({ t: "done", rec: recId, x, y, disc: disc ? 1 : 0, cat: p.r.cat, pair: p.r.pair ? 1 : 0, fams });
  if (p.r.pair) G.st.pairs = (G.st.pairs || 0) + 1;
  const nr = cs.find((c) => G.cards[c.id] && !c.dn);
  if (nr) dirty(G, nr);
}
function exploreLoot(G, name, cs, place) {
  const L = LOOT[name];
  const n = place ? place.n : 1;
  if (L.first) for (const k in L.first) {
    if (G.f["got_" + k]) continue;
    if (n >= L.first[k] || rnd(G) < 0.12) { G.f["got_" + k] = 1; return k; }
  }
  const expl = cs.some((c) => c.k === "explorer");
  const guard = cs.some((c) => isW(c.k) && roleOf(G, c.o) === "guard");
  let t = L.t;
  if (name === "cave" && (G.open.mountains || G.f.got_map)) t = t.filter((e) => e[0] !== "map");
  if (expl) t = t.map((e) => (e[0][0] === "!" ? [e[0], e[1] * 0.4] : (e[0] === "relic" || e[0] === "crystal" || e[0] === "nugget") ? [e[0], e[1] * 2] : e));
  if (guard) t = t.map((e) => (e[0][0] === "!" ? [e[0], e[1] * 0.5] : e));
  if (n <= 2 && G.day <= 4) t = t.filter((e) => e[0][0] !== "!");      // первые вылазки — без засад
  const k = pickW(G, t);
  if (k === "relic") G.f.got_relic = 1;
  return k;
}

// постройка сразу открывает свои рецепты (они написаны на её карте)
const UNLOCKS = { campfire: ["r_brick", "r_coal", "r_roast", "r_bakefish", "r_friedmush"], smithy: ["r_iron"], sawmill: ["r_lumber"], kitchen: ["r_kroast"],
  field: ["r_carrot", "r_wheat", "r_regrow", "r_mushfarm"], quarry: ["r_quarry"], hut: ["r_breed"] };

/* ---------- бои ---------- */
function newFight(G, x, y) {
  const f = { id: G.nfid++, x, y, foes: [], allies: [] };
  G.fights[f.id] = f;
  return f;
}
function joinFight(G, f, c, side) {
  if (c.cb === f.id) return;
  if (c.cb) leaveFight(G, c);
  if (c.dn || c.up) {
    const above = c.up ? G.cards[c.up] : null;
    const r = root(G, c);
    if (c.dn) { const below = G.cards[c.dn]; below.up = above ? above.id : 0; if (above) above.dn = below.id; }
    else if (above) { above.dn = 0; above.x = c.x; above.y = c.y; }
    c.dn = 0; c.up = 0;
    const nr = r === c ? above : r;
    if (nr) { layout(G, nr); dirty(G, nr); }
  }
  c.cb = f.id; c.rc = ""; c.rt = 0;
  if (c.tm == null || c.tm <= 0) c.tm = (CARDS[c.k].spd || 1.4) * (0.4 + rnd(G) * 0.6);
  (side === "foe" ? f.foes : f.allies).push(c.id);
  if (side === "ally" && isPerson(c.k)) G.f.fought = 1;
}
function leaveFight(G, c) {
  const f = G.fights[c.cb];
  c.cb = 0;
  if (!f) return;
  f.foes = f.foes.filter((i) => i !== c.id);
  f.allies = f.allies.filter((i) => i !== c.id);
  checkFight(G, f);
}
function checkFight(G, f) {
  if (!G.fights[f.id]) return;
  if (!f.foes.length) {
    delete G.fights[f.id];
    f.allies.forEach((id) => { const c = G.cards[id]; if (!c) return; c.cb = 0; const p = freeSpot(G, c.x, c.y, CH, c); c.x = p[0]; c.y = p[1]; dirty(G, c); });
    G.ev.push({ t: "fightend", win: 1, x: f.x, y: f.y });
  } else if (!f.allies.length) {
    delete G.fights[f.id];
    f.foes.forEach((id) => { const c = G.cards[id]; if (c) { c.cb = 0; c.tm = 1.5; } });
    G.ev.push({ t: "fightend", win: 0, x: f.x, y: f.y });
  }
}
export function fightLayout(G, f) {
  const PER = 5;
  const nf = f.foes.length, na = f.allies.length, w = Math.min(PER, Math.max(nf, na));
  const ar = Math.ceil(na / PER);
  const fw = w * (CW + 10) + 30;
  f.x = Math.max(WORLD.x0 + fw / 2 + 10, Math.min(WORLD.x1 - fw / 2 - 10, f.x));
  f.y = Math.max(CH + 30, Math.min(WORLD.y1 - CH * Math.max(1, ar) - 30, f.y));
  const row = (ids, y0, dir) => ids.forEach((id, i) => {
    const c = G.cards[id]; if (!c) return;
    const r = Math.floor(i / PER), inRow = Math.min(PER, ids.length - r * PER), j = i % PER;
    c.x = f.x + (j - (inRow - 1) / 2) * (CW + 10); c.y = y0 + dir * r * (CH * 0.62);
  });
  row(f.foes, f.y - CH - 8, -1);
  row(f.allies, f.y + 8, 1);
  f.w = fw; f.h = CH * 2 + 40; f.ar = ar; f.fr = Math.ceil(nf / PER);
  let f0 = 0, f1 = 0; for (const id of f.allies) { const c = G.cards[id]; if (c && isPerson(c.k)) { if (c.o === 0) f0 = 1; else f1 = 1; } }
  f.both = f0 && f1 ? 1 : 0;
}
function ambush(G, k, x, y, cs) {
  const e = add(G, k, x, y - 40); e.mhp = e.hp;
  G.ev.push({ t: "pop", id: e.id, fx: x, fy: y, k, enemy: 1 });
  const f = newFight(G, x, y);
  joinFight(G, f, e, "foe");
  for (const c of cs) if (G.cards[c.id] && isW(c.k)) joinFight(G, f, c, "ally");
  fightLayout(G, f);
  G.ev.push({ t: "ambush", k, x, y });
}
function damage(G, f, a, t, dmg) {
  const d = CARDS[t.k];
  let real = Math.max(1, dmg - (d.def || 0));
  if (d.pair && f && !f.both) real = Math.max(1, Math.round(real / 3)) * (rnd(G) < 0.5 ? 1 : 0) || 0;   // тяжёлый враг: одна семья почти не пробивает
  if (real <= 0) { G.ev.push({ t: "block", b: t.id, x: t.x, y: t.y }); return; }
  t.hp -= real;
  G.ev.push({ t: "hit", a: a ? a.id : 0, b: t.id, d: real, x: t.x, y: t.y, foe: d.c === "enemy" ? 1 : 0 });
  if (t.hp <= 0) kill(G, f, t);
}
function kill(G, f, c) {
  const d = CARDS[c.k];
  const x = c.x, y = c.y;
  if (!f && c.cb) f = G.fights[c.cb] || null;
  if (f) { f.foes = f.foes.filter((i) => i !== c.id); f.allies = f.allies.filter((i) => i !== c.id); }
  c.cb = 0;
  removeCard(G, c);
  G.ev.push({ t: "die", k: c.k, x, y, foe: d.c === "enemy" ? 1 : 0, o: c.o });
  if (d.c === "enemy") {
    G.st.kills++;
    for (const [k, ch] of d.lo || []) if (ch == null || rnd(G) < ch) spawn(G, k, x, y, { dy: 20 });
    if (d.boss) { G.f.boss = 1; G.ev.push({ t: "bossdown" }); }
  } else if (isPerson(c.k)) {
    G.st.deaths++;
    checkLose(G);
  }
  if (f) checkFight(G, f);
}
function atkOf(G, c) { return (CARDS[c.k].atk || 1) + (isPerson(c.k) && roleOf(G, c.o) === "guard" ? 1 : 0); }
function stepFights(G, dt) {
  for (const id in G.fights) {
    const f = G.fights[id];
    fightLayout(G, f);
    const parts = f.foes.concat(f.allies);
    for (const pid of parts) {
      const c = G.cards[pid];
      if (!c || !G.fights[id]) continue;
      c.tm -= dt;
      if (c.tm > 0) continue;
      const d = CARDS[c.k];
      c.tm = d.spd || 1.4;
      const enemy = d.c === "enemy";
      let pool = (enemy ? f.allies : f.foes).map((i) => G.cards[i]).filter(Boolean);
      if (!pool.length) continue;
      if (enemy) { const melee = pool.filter((q) => !(CARDS[q.k].tg || []).includes("ranged")); if (melee.length) pool = melee; }
      const tgt = pool[Math.floor(rnd(G) * pool.length)];
      damage(G, f, c, tgt, atkOf(G, c));
    }
  }
}
function stepEnemies(G, dt) {
  for (const id in G.cards) {
    const e = G.cards[id];
    if (!isEnemy(e.k) || e.cb) continue;
    const d = CARDS[e.k];
    let best = null, bd = 1e12;
    for (const jd in G.cards) {
      const c = G.cards[jd];
      if (!isPerson(c.k) || root(G, c).drag) continue;
      const dd = (c.x - e.x) ** 2 + (c.y - e.y) ** 2;
      if (dd < bd) { bd = dd; best = c; }
    }
    e.tm = (e.tm || 0) - dt;
    if (!best) {
      if (e.tm <= 0) { e.tm = 2 + rnd(G) * 2; e.vx = (rnd(G) - 0.5) * d.sp; e.vy = (rnd(G) - 0.5) * d.sp; }
      e.x += (e.vx || 0) * dt; e.y += (e.vy || 0) * dt; clampEnemy(G, e);
      continue;
    }
    const dist = Math.sqrt(bd);
    if (dist < 60) {
      let f = best.cb ? G.fights[best.cb] : null;
      if (!f) {
        f = newFight(G, (e.x + best.x) / 2, (e.y + best.y) / 2 + 20);
        const r = root(G, best);
        for (const c of chain(G, r)) if (isW(c.k)) joinFight(G, f, c, "ally");
        if (!f.allies.length) joinFight(G, f, best, "ally");
        G.ev.push({ t: "attacked", k: e.k, x: e.x, y: e.y, o: best.o });
      }
      joinFight(G, f, e, "foe");
      e.tm = d.spd * 0.6;
      fightLayout(G, f);
      continue;
    }
    const wade = inRiver(e.x, e.y) && !CARDS[e.k].boss ? 0.45 : 1;
    const sp = d.sp * (G.ph === "day" ? 1 : 0.3) * wade;
    e.x += ((best.x - e.x) / dist) * sp * dt; e.y += ((best.y - e.y) / dist) * sp * dt;
    e.fx = best.x > e.x ? 1 : -1;
  }
}
function clampEnemy(G, e) {
  e.x = Math.max(WORLD.x0 + 50, Math.min(WORLD.x1 - 50, e.x));
  e.y = Math.max(WORLD.y0 + 10, Math.min(WORLD.y1 - CH - 10, e.y));
  if (!regionAt(e.x, e.y + CH / 2) && !inRiver(e.x, e.y)) clampToBoard(G, e);
}
function stepTowers(G, dt) {
  G.twr -= dt;
  if (G.twr > 0) return;
  G.twr = 2.2;
  for (const id in G.cards) {
    const t = G.cards[id];
    if (t.k !== "tower") continue;
    let best = null, bd = 380 * 380;
    for (const jd in G.cards) {
      const e = G.cards[jd];
      if (!isEnemy(e.k)) continue;
      const dd = (e.x - t.x) ** 2 + (e.y - t.y) ** 2; if (dd < bd) { bd = dd; best = e; }
    }
    if (best) { G.ev.push({ t: "arrow", x: t.x, y: t.y, tx: best.x, ty: best.y }); const f = best.cb ? G.fights[best.cb] : null; damage(G, f ? Object.assign({}, f, { both: 1 }) : null, null, best, 1); }
  }
}
export function attack(G, r, target) {
  const tgt = target.cb ? null : target;
  let f = target.cb ? G.fights[target.cb] : null;
  if (!f) { f = newFight(G, target.x, target.y + CH / 2 + 10); joinFight(G, f, tgt, "foe"); }
  const cs = chain(G, r);
  const rest = [];
  for (const c of cs) { if (isW(c.k)) joinFight(G, f, c, "ally"); else rest.push(c); }
  if (rest.length) {
    for (let i = 0; i < rest.length; i++) { rest[i].dn = i ? rest[i - 1].id : 0; rest[i].up = i < rest.length - 1 ? rest[i + 1].id : 0; }
    const p = freeSpot(G, f.x, f.y + CH * 1.6, stackH(G, rest[0]), rest[0]); rest[0].x = p[0]; rest[0].y = p[1];
    layout(G, rest[0]); dirty(G, rest[0]);
  }
  fightLayout(G, f);
  return f;
}
// враг приходит с края своего берега (side "n"|"s"), босс — из реки
function spawnEnemy(G, k, side, weaken) {
  let x, y;
  if (CARDS[k].boss) { x = 1250; y = RIV[0] + 30; }
  else {
    const q = side === "n" ? BANKS.n : BANKS.s;
    const edge = Math.floor(rnd(G) * 3);
    if (edge === 0) { x = q[0] + 40; y = q[1] + 60 + rnd(G) * (q[3] - q[1] - 220); }
    else if (edge === 1) { x = q[2] - 40; y = q[1] + 60 + rnd(G) * (q[3] - q[1] - 220); }
    else { x = q[0] + 80 + rnd(G) * (q[2] - q[0] - 160); y = side === "n" ? q[1] + 20 : q[3] - CH - 20; }
  }
  const e = add(G, k, x, y);
  if (weaken) e.hp = Math.max(1, Math.round(e.hp * (1 - weaken)));
  e.mhp = e.hp; e.tm = 2;
  G.ev.push({ t: "pop", id: e.id, fx: x, fy: y, k, enemy: 1 });
  return e;
}

/* ---------- края ---------- */
function unlockVia(G, k) {
  for (const b in REGIONS) {
    const R = REGIONS[b];
    if (R.via !== k || G.open[b]) continue;
    G.open[b] = 1;
    G.ht[b] = G.day + 2;
    const q = R.rects[0], cx = (q[0] + q[2]) / 2, cy = (q[1] + q[3]) / 2;
    R.start.forEach((s, i) => {
      const x = cx + ((i % 4) - 1.5) * 120, y = cy - 160 + Math.floor(i / 4) * 160;
      if (s[0] === "!") { const e = add(G, s.slice(1), q[2] - 60, q[1] + 30); e.mhp = e.hp; e.tm = 3; }
      else { const c = add(G, s, x, y); const p = freeSpot(G, x, y, CH, c); c.x = p[0]; c.y = p[1]; dirty(G, c); }
    });
    G.ev.push({ t: "unlock", b });
  }
}

/* ---------- перетаскивание: намерения игроков ----------
   pickI(G, p, id) → {ok} | {err}; moveI; dropI(G, p, id, x, y, tid)  (tid: id цели, -1 — продажа) */
export function canTouch(G, p, c) {
  if (!c || isEnemy(c.k) || isFixed(c.k)) return "no";
  if (c.drag) return c.drag === p + 1 ? "" : "busy";
  if (!G.solo) for (const q of chain(G, c)) if ((isPerson(q.k) || q.k === "coin") && (q.k === "coin" ? coinOf(q) : q.o) !== p) return q.k === "coin" ? "fcoin" : "foreign";
  return "";
}
export function pickI(G, p, id) {
  const c = G.cards[id];
  const why = canTouch(G, p, c);
  if (why) return { err: why };
  if (c.drag) return { ok: 1 };
  G.st.acts[p] = (G.st.acts[p] || 0) + 1;
  if (c.cb) leaveFight(G, c); else detach(G, c);
  c.drag = p + 1; c.rc = ""; c.rt = 0; c.px = c.x; c.py = c.y;
  return { ok: 1 };
}
export function moveI(G, p, id, x, y) {
  const c = G.cards[id];
  if (!c || c.drag !== p + 1) return;
  c.x = x; c.y = y; layout(G, c);
}
export function dropI(G, p, id, x, y, tid) {
  const c = G.cards[id];
  if (!c || c.drag !== p + 1) return { err: "gone" };
  if (tid === -1) {
    const r = sell(G, c, x, y, p);
    if (r.ok) return { ok: 1, res: "sell" };
    drop(G, c, x, y - 200, null); return { ok: 1, res: "nosell" };
  }
  let target = tid ? G.cards[tid] : null;
  if (target) {
    const inMine = chain(G, c).indexOf(target) >= 0;
    const tr = target.cb ? target : root(G, target);
    if (inMine || tr.drag || Math.abs(tr.x - x) > 190 || Math.abs(tr.y - y) > 320) target = null; else target = tr;
  }
  const bank0 = bankOf(c.py != null ? c.py : c.y);
  const res = drop(G, c, x, y, target);
  const r = root(G, c);
  const bank1 = bankOf(r.y);
  if (bank0 && bank1 && bank0 !== bank1 && chain(G, c).some((q) => !isPerson(q.k) && q.k !== "coin")) { G.f.traded = 1; G.st.trades++; G.ev.push({ t: "trade", p, x: r.x, y: r.y }); }
  // монеты на чужой берег или в чужую кучку — подарок напарнику
  if (c.k === "coin" && !G.solo) {
    const to = r !== c && r.k === "coin" ? coinOf(r) : bank1 ? bankFam(r.y) : p;
    if (to !== p) { const cs = chain(G, c).filter((q) => q.k === "coin"); for (const q of cs) q.o = to; G.st.gifts = (G.st.gifts || 0) + cs.length; G.ev.push({ t: "gift", p, to, n: cs.length, x: r.x, y: r.y }); }
  }
  delete c.px; delete c.py;
  return { ok: 1, res };
}
// игрок пропал — бросить всё, что он нёс
export function releaseAll(G, p) {
  for (const id in G.cards) { const c = G.cards[id]; if (c.drag === p + 1) { c.drag = 0; clampToBoard(G, c, stackH(G, c)); layout(G, c); dirty(G, c); } }
}
function drop(G, r, x, y, target) {
  r.drag = 0; r.x = x; r.y = y;
  if (!target || target === r) { clampToBoard(G, r, stackH(G, r)); layout(G, r); dirty(G, r); G.ev.push({ t: "drop", id: r.id }); return "place"; }
  layout(G, r); dirty(G, r);
  const td = CARDS[target.k];
  const cs = chain(G, r);
  if (td.c === "enemy") {
    if (!cs.some((c) => isW(c.k))) { nudge(G, r, target); return "bounce"; }
    attack(G, r, target); G.ev.push({ t: "charge", x: target.x, y: target.y }); return "fight";
  }
  if (target.k === "barrow" && cs.some((c) => isW(c.k))) {
    if (!G.f.warden) {
      G.f.warden = 1;
      const e = add(G, "warden", target.x, target.y + 10); e.mhp = e.hp; e.tm = 1.2;
      G.ev.push({ t: "pop", id: e.id, fx: target.x, fy: target.y, k: "warden", enemy: 1 });
      G.ev.push({ t: "warden" });
      attack(G, r, e); return "fight";
    }
    nudge(G, r, target); return "bounce";
  }
  if (td.c === "pack") { nudge(G, r, target); return "bounce"; }
  const tcs = chain(G, root(G, target));
  if ((r.k === "coin") !== (tcs[0].k === "coin")) { nudge(G, r, target); return "bounce"; }
  if (tcs.length + cs.length > MAX_STACK && r.k !== "coin") { nudge(G, r, target); return "bounce"; }
  if (tcs.some((c) => c.cb)) { nudge(G, r, target); return "bounce"; }
  stackOnto(G, r, target);
  G.ev.push({ t: "stack", id: r.id });
  return "stack";
}
function nudge(G, r, target) {
  const p = freeSpot(G, target.x + CW + 20, target.y, stackH(G, r), r);
  r.x = p[0]; r.y = p[1]; layout(G, r); dirty(G, r);
  G.ev.push({ t: "bounce", id: r.id });
}

/* ---------- монеты, продажа, сундуки ---------- */
// coins(G) — все монеты; coins(G, p) — кошелёк семьи p (в одиночной игре кошелёк общий)
export function coins(G, p) { const w = G.wal || [0, 0]; return p == null || G.solo ? w[0] + w[1] : w[p] || 0; }
// подарить монеты напарнику (из своего кошелька в его)
export function giveI(G, p, n) {
  if (G.solo || !G.wal) return 0;
  n = Math.min(Math.floor(n) || 0, G.wal[p] || 0); if (n <= 0) return 0;
  G.wal[p] -= n; G.wal[1 - p] += n;
  G.st.gifts = (G.st.gifts || 0) + n;
  G.ev.push({ t: "gift", p, to: 1 - p, n });
  return n;
}
export function sellValue(G, c) { const v = CARDS[c.k].v; if (v == null) return null; return v + (v > 0 && hasB(G, "fair") ? 1 : 0); }
export function canSell(G, r) { return chain(G, r).every((c) => CARDS[c.k].v != null); }
function sell(G, r, x, y, p) {
  const cs = chain(G, r);
  if (cs[0].k === "coin") { r.drag = 0; return { ok: false, coin: true }; }
  if (!cs.every((c) => CARDS[c.k].v != null)) { r.drag = 0; return { ok: false }; }
  let sum = 0;
  for (const c of cs) { sum += sellValue(G, c); G.st.sold++; }
  if (p != null && roleOf(G, p) === "trader" && sum > 0) sum++;
  for (const c of cs) delete G.cards[c.id];
  const sp = { x, y: y - 120 }; clampToBoard(G, sp);
  const o = p != null && !G.solo ? p : bankFam(sp.y);
  addCoins(G, o, sum, sp.x, sp.y);
  G.ev.push({ t: "sell", n: sum, x: sp.x, y: sp.y, cnt: cs.length, p });
  return { ok: true, n: sum };
}
export function packLocked(G, p) {
  if (!p.lock) return false;
  if (p.lock === "hut") return !(G.st.made.hut > 0);
  if (p.lock === "day2") return G.day < 2;
  if (p.lock === "day3") return G.day < 3;
  return false;
}
export function packCost(G, pk, p) { return Math.max(2, pk.cost - (p != null && roleOf(G, p) === "trader" ? 1 : 0)); }
export function buyI(G, p, k, x, y) {
  const pk = PACKS.find((q) => q.k === k);
  if (!pk || packLocked(G, pk)) return null;
  const cost = packCost(G, pk, p);
  if (coins(G, p) < cost) return null;
  G.st.acts[p] = (G.st.acts[p] || 0) + 1;
  // платим из своего кошелька (в одиночной игре кошелёк общий: сначала из своего, остаток — из второго)
  const a = Math.min(cost, G.wal[p]); G.wal[p] -= a; if (cost > a) G.wal[1 - p] -= cost - a;
  G.ev.push({ t: "spend", p, n: cost });
  const c = add(G, k, x, y);
  c.o = p;
  const sp = freeSpot(G, x, y, CH, c); c.x = sp[0]; c.y = sp[1];
  G.st.packs++;
  G.bought[k] = (G.bought[k] || 0) + 1;
  G.ev.push({ t: "buy", id: c.id, k, p });
  return c;
}
export function openI(G, p, id) {
  const c = G.cards[id];
  if (!c || c.drag || CARDS[c.k].c !== "pack") return false;
  const pk = PACKS.find((q) => q.k === c.k);
  if (!pk) return false;
  G.st.acts[p] = (G.st.acts[p] || 0) + 1;
  const nth = (G.f["op_" + c.k] = (G.f["op_" + c.k] || 0) + 1);
  const x = c.x, y = c.y;
  removeCard(G, c);
  const got = [];
  for (let i = 0; i < pk.cnt; i++) {
    let k = null;
    if (nth === 1 && pk.first && pk.first[i]) k = pk.first[i];
    for (let tries = 0; !k && tries < 8; tries++) {
      const cand = pickW(G, pk.t);
      if (CARDS[cand].c === "idea" && G.kn[CARDS[cand].rec]) continue;
      if (got.indexOf(cand) >= 0 && CARDS[cand].c === "idea") continue;
      k = cand;
    }
    if (!k) k = pk.t[0][0];
    if (CARDS[k].c === "idea" && G.kn[CARDS[k].rec]) k = pk.t[0][0];
    got.push(k);
  }
  G.ev.push({ t: "open", k: c.k, x, y, p, id });
  const own = c.o != null ? c.o : p;   // всё из сундука — у того, кто его купил: жители — в его семью, монеты — в его кошелёк
  got.forEach((k, i) => { spawn(G, k, x, y, { dx: (i - (got.length - 1) / 2) * 70, dy: 30, loose: 1, o: isPerson(k) || k === "coin" ? own : undefined }); });
  return true;
}
export function speedI(G, p, s) { G.spd = s; G.ev.push({ t: "speed", s, p }); }

/* ---------- население, еда, место ---------- */
export function popCount(G) { let n = 0; for (const id in G.cards) if (isPerson(G.cards[id].k)) n++; return n; }
export function foodTotal(G) { let n = 0; for (const id in G.cards) { const c = G.cards[id]; if (CARDS[c.k].c === "food") n += c.f || 0; } return n; }
export function foodNeed(G) { return popCount(G) * EAT; }
export const hasB = (G, k) => { for (const id in G.cards) if (G.cards[id].k === k) return true; return false; };
const NOCAP = { coin: 1, enemy: 1, pack: 1, person: 1, site: 1 };
export function cardCount(G) {
  let n = 0;
  for (const id in G.cards) { const c = G.cards[id]; const d = CARDS[c.k]; if (NOCAP[d.c] || c.k === "boat" || c.k === "trail" || c.k === "darkpath" || c.k === "barrow" || c.k === "shoal") continue; n++; }
  return n;
}
export function capacity(G) { let n = BASE_CAP; for (const id in G.cards) n += CARDS[G.cards[id].k].cap || 0; return n; }
function inWork(G, c) { const r = root(G, c); return !!r.rc && r !== c; }
export function foodSafe(G) { let n = 0; for (const id in G.cards) { const c = G.cards[id]; if (CARDS[c.k].c === "food" && !inWork(G, c)) n += c.f || 0; } return n; }
function nightfall(G) {
  G.ph = "night"; G.nt = NIGHT_LEN;
  G.ev.push({ t: "night", day: G.day });
  const people = Object.values(G.cards).filter((c) => isPerson(c.k)).sort((a, b) => a.id - b.id);
  const food = Object.values(G.cards).filter((c) => CARDS[c.k].c === "food" && (c.f || 0) > 0 && !c.drag && !inWork(G, c)).sort((a, b) => (a.f - b.f) || (CARDS[a.k].f - CARDS[b.k].f));
  let fi = 0, starved = 0, delay = 0;
  for (const p of people) {
    let need = EAT;
    while (need > 0 && fi < food.length) {
      const fc = food[fi];
      const bite = Math.min(need, fc.f);
      fc.f -= bite; need -= bite; G.st.eaten += bite;
      G.ev.push({ t: "eat", fx: fc.x, fy: fc.y, k: fc.k, px: p.x, py: p.y, pid: p.id, o: p.o, delay: Math.round(delay++ * 12) / 100 });
      if (fc.f <= 0) { removeCard(G, fc); fi++; }
    }
    if (need > 0) { starved++; p.starve = 1; }
  }
  for (const p of people) {
    if (!p.starve) continue;
    G.ev.push({ t: "starve", k: p.k, x: p.x, y: p.y, o: p.o, delay: Math.round(delay * 12 + 40) / 100 });
    G.st.starve++; G.st.deaths++;
    if (p.cb) { const f = G.fights[p.cb]; if (f) { f.allies = f.allies.filter((i) => i !== p.id); p.cb = 0; checkFight(G, f); } }
    removeCard(G, p);
  }
  G.lastNight = { ate: people.length - starved, starved, day: G.day };
  checkLose(G);
}
function dawn(G) {
  G.day++; G.t = 0; G.ph = "day"; G.hold = 0;
  G.season = Math.floor((G.day - 1) / 4) % 4;
  for (const id in G.cards) { const c = G.cards[id]; if (isPerson(c.k)) c.hp = maxHp(G, c); }
  let m = 0; for (const id in G.cards) if (G.cards[id].k === "fair") m++;
  m = Math.min(2, m);
  for (let i = 0; i < m * 2; i++) { const mk = Object.values(G.cards).find((c) => c.k === "fair"); if (mk) spawn(G, "coin", mk.x, mk.y); }
  let list = THREATS[G.day];
  if (G.day === BOSS_DAY && G.won) list = ["chief", "raider", "raider"];
  if (!list && G.day > BOSS_DAY + 2 && G.day % 2 === 0) list = endlessWave(G);
  if (list && list.length) {
    const wk = (side) => { let pal = 0; for (const id in G.cards) { const c = G.cards[id]; if (c.k === "palisade" && bankOf(c.y) === side) pal++; } return Math.min(2, pal) * 0.25; };
    let i = 0; const ks = [];
    for (const k of list) {
      const side = CARDS[k].boss ? "r" : i++ % 2 === 0 ? "s" : "n";
      spawnEnemy(G, k, side, CARDS[k].boss ? 0 : wk(side));
      if (k === "boss") G.f.bossOut = 1;
      ks.push(k);
    }
    G.ev.push({ t: "threat", ks, weak: wk("s") + wk("n") > 0 ? 1 : 0, boss: list.indexOf("boss") >= 0 ? 1 : 0 });
  }
  for (const b in G.open) {
    if (b === "home" || !G.ht[b] || G.day < G.ht[b]) continue;
    G.ht[b] = G.day + 3;
    const ks = REGION_THREATS[b] || [];
    const q = REGIONS[b].rects[0];
    const hasP = Object.values(G.cards).some((c) => isPerson(c.k) && c.x > q[0] && c.x < q[2] && c.y > q[1] - 40 && c.y < q[3]);
    if (!hasP) continue;
    for (const k of ks) { const e = add(G, k, q[0] + 60 + rnd(G) * (q[2] - q[0] - 120), q[1] + 30); e.mhp = e.hp; e.tm = 2; G.ev.push({ t: "pop", id: e.id, fx: e.x, fy: e.y, k, enemy: 1 }); }
    G.ev.push({ t: "threat", ks, region: b });
  }
  // семья осталась без пары жителей — утром к ней приходит странник (не чаще раза в 2 дня на семью): из такого положения иначе не выбраться
  if (popCount(G) > 0) for (const f of [0, 1]) {
    G.sett = G.sett || [0, 0];
    // странник: семье меньше двух жителей или она втрое меньше соседней (одному игроку нечего делать)
    const mine = famCount(G, f), other = famCount(G, 1 - f);
    if ((mine >= 2 && !(other >= 6 && mine * 3 <= other)) || G.day - (G.sett[f] || 0) < 2) continue;
    G.sett[f] = G.day;
    const hy = f === 0 ? 1240 : 360;
    const c = spawn(G, "villager", 700, hy, { o: f, dy: 0 });
    if (c) { G.st.settlers = (G.st.settlers || 0) + 1; G.ev.push({ t: "settler", o: f, id: c.id, x: c.x, y: c.y }); }
  }
  G.ev.push({ t: "dawn", day: G.day, season: G.season });
}
function endlessWave(G) {
  const pow = 26 + (G.day - BOSS_DAY) * 7;
  const pool = ["raider", "wolf", "tusker", "chief", "skeleton", "wraith", "troll"];
  const out = []; let s = 0;
  while (s < pow && out.length < 8) { const k = pool[Math.floor(rnd(G) * pool.length)]; out.push(k); s += CARDS[k].hp; }
  return out;
}
function checkLose(G) {
  if (G.lost) return;
  if (popCount(G) === 0) { G.lost = 1; G.ev.push({ t: "lose" }); }
}
function win(G, how) {
  if (G.won) return;
  G.won = how; G.wonDay = G.day; G.ev.push({ t: "win", how });
}
// продать лишние карты самим (самые дешёвые), если ночью никто не продал
function autoSell(G, over) {
  const sellable = (c) => CARDS[c.k].v != null && !isPerson(c.k) && ["build", "site", "place", "pack"].indexOf(CARDS[c.k].c) < 0 && !isFixed(c.k) && !c.drag && !c.cb && !(c.up === 0 && c.dn === 0 && c.rc);
  // сначала верхние карты стопок из ресурсов/еды — самые дешёвые
  for (let guard = 0; over > 0 && guard < 200; guard++) {
    let best = null;
    for (const id in G.cards) { const c = G.cards[id]; if (c.up || !sellable(c)) continue; if (c.dn && root(G, c).rc) continue; if (!best || CARDS[c.k].v < CARDS[best.k].v || (CARDS[c.k].v === CARDS[best.k].v && c.id > best.id)) best = c; }
    if (!best) break;
    const x = best.x, y = best.y;
    detach(G, best); sell(G, best, x, y + 150, null); over--;
  }
  G.ev.push({ t: "autosell" });
}
/* ---------- задания ---------- */
const hasRole = (G) => Object.values(G.cards).some((c) => ["spearman", "warrior", "knight", "archer"].indexOf(c.k) >= 0);
const QCHK = {
  q_wood: (G) => G.st.made.wood > 0, q_stone: (G) => G.st.made.stone > 0, q_trade: (G) => !!G.f.traded,
  q_hut: (G) => G.st.made.hut > 0, q_sell: (G) => G.st.sold > 0, q_pack: (G) => G.st.packs > 0, q_night: (G) => G.day >= 2,
  q_fire: (G) => G.st.made.campfire > 0, q_br1: (G) => G.bridge >= 1, q_br2: (G) => G.bridge >= 2, q_br3: (G) => G.bridge >= 3, q_br4: (G) => G.bridge >= 4,
  q_field: (G) => G.st.made.field > 0, q_kill: (G) => G.st.kills > 0, q_pop: (G) => popCount(G) >= 6, q_arm: hasRole,
  q_store: (G) => G.st.made.shed > 0 || G.st.made.granary > 0, q_mount: (G) => !!G.open.mountains,
  q_crystal: (G) => G.st.made.crystal > 0, q_dark: (G) => !!G.open.haunted, q_relic: (G) => G.st.made.relic > 0, q_win: (G) => !!G.won,
};
export function questNow(G) {
  if (G.q < QUESTS.length) return QUESTS[G.q];
  const d = ENDLESS.find((x) => x > G.day) || G.day + 10;
  return { id: "q_end", n: "Продержитесь до дня " + d, h: "Бесконечный режим: набеги всё сильнее.", d };
}
function stepQuests(G) {
  let guard = 0;
  while (G.q < QUESTS.length && QCHK[QUESTS[G.q].id](G) && guard++ < 30) { G.ev.push({ t: "quest", i: G.q }); G.q++; }
}
export function questState(G, i) { return QCHK[QUESTS[i].id](G); }

/* ---------- шаг симуляции ---------- */
export function step(G, dt) {
  if (G.lost) return;
  G.st.time += dt;
  if (G.ph === "night") {
    G.nt -= dt;
    if (G.nt <= 0) {
      const over = cardCount(G) - capacity(G);
      if (over > 0) { G.ph = "hold"; G.hold = 0; G.ev.push({ t: "hold", over }); }
      else dawn(G);
    }
    stepFights(G, dt * 0.5);
    return;
  }
  if (G.ph === "hold") {
    G.hold += dt;
    const over = cardCount(G) - capacity(G);
    if (over <= 0) dawn(G);
    else if (G.hold > HOLD_AUTO) { autoSell(G, over); dawn(G); }
    return;
  }
  G.t += dt;
  if (G.t >= DAY_LEN) { nightfall(G); return; }
  for (const id in G.cards) {
    const r = G.cards[id];
    if (r.dn || r.drag || r.cb) continue;
    if (isEnemy(r.k)) continue;
    layout(G, r);
    if (r.dirty) {
      r.dirty = 0;
      const cs = chain(G, r);
      G._miss = null;
      const p = matchStack(G, cs);
      r.ms = !p && G._miss ? G._miss.r.id : "";
      if (p) {
        if (r.rc !== p.r.id) { r.rc = p.r.id; r.rt = 0; }
        r.rT = p.r.t / recipeMult(G, cs, p);
      } else { r.rc = ""; r.rt = 0; }
    }
    if (r.rc) {
      r.rt += dt;
      if (r.rt >= r.rT) {
        const cs = chain(G, r);
        const p = matchStack(G, cs, true);
        r.rc = ""; r.rt = 0; r.dirty = 1;
        if (p) finishRecipe(G, r, p);
      }
    }
  }
  stepEnemies(G, dt);
  stepFights(G, dt);
  stepTowers(G, dt);
  G.hl = (G.hl || 0) + dt;
  if (G.hl > 15) { G.hl = 0; for (const id in G.cards) { const c = G.cards[id]; if (isPerson(c.k) && !c.cb && c.hp < maxHp(G, c)) c.hp++; } }
  separate(G, dt);
  G.qt = (G.qt || 0) + dt; if (G.qt > 0.5) { G.qt = 0; stepQuests(G); const p = popCount(G); if (p > G.st.maxPop) G.st.maxPop = p; }
  if (G.won && !G.endless) G.endless = 1;
}
// мягко раздвигаем перекрывшиеся стопки; закреплённые (мост, курган) не двигаются
function separate(G, dt) {
  const rs = [];
  for (const id in G.cards) { const c = G.cards[id]; if (!c.dn && !c.drag && !c.cb && !isEnemy(c.k)) rs.push(c); }
  const k = Math.min(1, dt * 6);
  // сортировка по x и проход «окном»: пары дальше CW+4 по x не пересекаются (было O(n²) — на 500+ картах это главный расход хозяина)
  rs.sort((p, q) => p.x - q.x);
  const fx = rs.map((c) => isFixed(c.k));
  for (let i = 0; i < rs.length; i++) {
    const a = rs[i]; const ah = a.h || CH, af = fx[i];
    for (let j = i + 1; j < rs.length; j++) {
      const b = rs[j];
      if (b.x - a.x > CW + 4 + 40) break;          // запас 40: в этом проходе карты сдвигаются
      const bf = fx[j];
      if (af && bf) continue;
      if (a.dn || b.dn) continue;                     // уже слились в этом проходе
      const ox = CW + 4 - Math.abs(a.x - b.x); if (ox <= 0) continue;
      const bh = b.h || CH;
      const oy = Math.min(a.y + ah, b.y + bh) - Math.max(a.y, b.y) + 4; if (oy <= 0) continue;
      // две кучки монет одного хозяина налезли друг на друга — ссыпаем в одну (иначе десятки кучек толкаются без конца)
      if (a.k === "coin" && b.k === "coin" && coinOf(a) === coinOf(b) && !a.drag && !b.drag) { stackOnto(G, b, a); continue; }
      const wa = af ? 0 : bf ? 2 : 1, wb = bf ? 0 : af ? 2 : 1;
      if (ox < oy) { const s = (a.x < b.x ? -1 : 1) * ox * 0.5 * k; a.x += s * wa; b.x -= s * wb; }
      else { const s = (a.y < b.y ? -1 : 1) * oy * 0.5 * k; a.y += s * wa; b.y -= s * wb; }
      if (!af) clampToBoard(G, a, ah); if (!bf) clampToBoard(G, b, bh);
      if (!af) layout(G, a); if (!bf) layout(G, b);
    }
  }
  for (const r of rs) if (!r.dn) r.h = stackH(G, r);
}

/* ---------- сохранение ---------- */
export function serialize(G) {
  const o = Object.assign({}, G); o.ev = []; delete o._miss;
  return JSON.stringify(o);
}
export function deserialize(s) {
  const G = typeof s === "string" ? JSON.parse(s) : s;
  if (!G || !G.cards || G.v !== 2) return null;
  G.ev = [];
  for (const id in G.cards) { const c = G.cards[id]; c.drag = 0; if (!CARDS[c.k]) delete G.cards[id]; }
  for (const id in G.fights) { const f = G.fights[id]; f.foes = f.foes.filter((i) => G.cards[i]); f.allies = f.allies.filter((i) => G.cards[i]); if (!f.foes.length || !f.allies.length) { [...f.foes, ...f.allies].forEach((i) => { G.cards[i].cb = 0; }); delete G.fights[id]; } }
  for (const id in G.cards) { const c = G.cards[id]; if (c.cb && !G.fights[c.cb]) c.cb = 0; if (!c.dn) c.dirty = 1; }
  if (!G.st.acts) G.st.acts = [0, 0];
  // старые сохранения: карты-монеты на столе → в кошельки хозяев (по владельцу, иначе по берегу) и со стола убираем
  if (!G.wal) {
    G.wal = [0, 0];
    for (const id of Object.keys(G.cards)) { const c = G.cards[id]; if (c.k !== "coin") continue; G.wal[c.o != null ? (c.o === 1 ? 1 : 0) : bankFam(c.y)] += c.cn || 1; delete G.cards[id]; }
    for (const id in G.cards) { const c = G.cards[id]; if (c.dn && !G.cards[c.dn]) c.dn = 0; if (c.up && !G.cards[c.up]) c.up = 0; }
  }
  if (G.kn) G.kn.r_breed = 1;
  // старые сохранения: монеты без хозяина делим по берегу (вся кучка — хозяину её нижней монеты)
  for (const id in G.cards) { const c = G.cards[id]; if (c.k !== "coin" || c.dn || c.o != null) continue; const o = bankFam(c.y); for (const q of chain(G, c)) if (q.k === "coin") q.o = o; }          // старые сохранения: рецепт «Новый житель» виден сразу
  return G;
}
