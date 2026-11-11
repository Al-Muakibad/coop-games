// «Очаг» — логика игры без DOM: столы, стопки, рецепты, бои, дни, еда, вместимость, задания.
// Одна и та же логика работает в браузере и в Node (проверка баланса ботом).
import { CARDS, RECIPES, LOOT, PACKS, IDEAS, BIOMES, THREATS, BOSS_DAY, BIOME_THREATS, QUESTS, ENDLESS,
  DAY_LEN, EAT, BASE_CAP, STACK_DY, COIN_DY, CW, CH } from "./data.js";

export const NIGHT_LEN = 3.2;
const MAX_STACK = 16;

/* ---------- случайность (сохраняется вместе с игрой) ---------- */
function rnd(G) {
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
// конкретные рецепты (больше названных карт) проверяются раньше общих: «следопыт + 2 доски» — тропа, а не сарай
PR.sort((a, b) => b.spec.length - a.spec.length);
export const RECIPE_BY_ID = {}; for (const p of PR) RECIPE_BY_ID[p.r.id] = p.r;
const isW = (k) => CARDS[k] && CARDS[k].tg && CARDS[k].tg.indexOf("w") >= 0;
export const isPerson = (k) => CARDS[k] && CARDS[k].c === "person";

/* ---------- новая игра ---------- */
export function newGame(seed) {
  const G = {
    v: 1, rs: (seed >>> 0) || 12345, nid: 1, day: 1, t: 0, ph: "day", nt: 0,
    cards: {}, fights: {}, nfid: 1, kn: {}, q: 0, won: 0, lost: 0, endless: 0, eq: 0,
    open: { home: 1 }, f: {}, bought: {}, ev: [], twr: 0, ht: {},
    st: { made: {}, sold: 0, packs: 0, kills: 0, deaths: 0, starve: 0, born: 0, eaten: 0, time: 0, maxPop: 2 },
  };
  for (const id of ["r_wood", "r_stone", "r_berry", "r_hut", "r_plank", "r_apple"]) G.kn[id] = 1;
  const b = "home", cx = BIOMES.home.w / 2, cy = BIOMES.home.h / 2;
  const put = (k, x, y) => add(G, k, b, cx + x, cy + y);
  put("tree", -138, -250); put("tree", -46, -250); put("rock", 46, -250); put("forest", 138, -250);
  put("appletree", -138, -100); put("bush", -46, -100); put("berry", 46, -100); put("berry", 46, -76);
  put("villager", -46, 50); put("villager", 46, 50);
  stackOnto(G, findK(G, "berry", 1), findK(G, "berry", 0));
  for (let i = 0; i < 4; i++) { const c = put("coin", 138, 60); const t = coinPile(G, "home", c.id); if (t) stackOnto(G, c, t); }
  G.ev = [];
  return G;
}
function findK(G, k, skip) { let n = 0; for (const id in G.cards) if (G.cards[id].k === k) { if (n++ === skip) return G.cards[id]; } return null; }

/* ---------- карты и стопки ---------- */
export function add(G, k, b, x, y) {
  const d = CARDS[k];
  const c = { id: G.nid++, k, b, x, y, dn: 0, up: 0, dirty: 1 };
  if (d.u) c.u = d.u;
  if (d.hp) c.hp = d.hp;
  if (d.f) c.f = d.f;
  if (d.c === "enemy") c.tm = d.spd;
  G.cards[c.id] = c;
  return c;
}
export const root = (G, c) => { while (c.dn) c = G.cards[c.dn]; return c; };
export function chain(G, r) { const a = []; let c = r; while (c) { a.push(c); c = c.up ? G.cards[c.up] : null; } return a; }
export const topOf = (G, c) => { while (c.up) c = G.cards[c.up]; return c; };
// монеты в стопке: первые 10 видны «лесенкой», остальные ложатся сверху (на верхней — число)
function dyOf(below, c, i) { return below.k === "coin" && c.k === "coin" ? (i < 10 ? COIN_DY : 0) : STACK_DY; }
export function stackH(G, r) { let h = CH, c = r, i = 0; while (c.up) { const u = G.cards[c.up]; h += dyOf(c, u, ++i); c = u; } return h; }
export function layout(G, r) {
  let c = r, i = 0;
  while (c.up) { const u = G.cards[c.up]; u.x = c.x; u.y = c.y + dyOf(c, u, ++i); u.b = r.b; c = u; }
}
function dirty(G, r) { r.rc = ""; r.rt = 0; r.dirty = 1; }
// снять карту c (и всё, что выше) со стопки
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
// убрать одну карту из стопки, сохранив остальные
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
export function roots(G, b) { const a = []; for (const id in G.cards) { const c = G.cards[id]; if (!c.dn && (!b || c.b === b)) a.push(c); } return a; }

/* ---------- поиск свободного места ---------- */
function overlaps(G, b, x, y, h, skip) {
  for (const id in G.cards) {
    const c = G.cards[id];
    if (c.dn || c.b !== b || c === skip || c.cb) continue;
    const ch = stackH(G, c);
    if (Math.abs(c.x - x) < CW + 6 && y < c.y + ch + 6 && c.y < y + h + 6) return true;
  }
  return false;
}
// видимая часть стола (ставит интерфейс): новые карты стараются появиться там, где их видно
export const VIEW = {};
export function setView(b, x0, y0, x1, y1) { VIEW[b] = [x0, y0, x1, y1]; }
const inView = (b, x, y, h) => { const v = VIEW[b]; return !v || (x - CW / 2 >= v[0] && x + CW / 2 <= v[2] && y >= v[1] && y + Math.min(h, CH) <= v[3]); };
export function clampToBoard(b, c) {
  const B = BIOMES[b];
  c.x = Math.max(CW / 2 + 10, Math.min(B.w - CW / 2 - 10, c.x));
  c.y = Math.max(60, Math.min(B.h - CH - 20, c.y));
}
export function freeSpot(G, b, x, y, h, skip) {
  const B = BIOMES[b];
  h = h || CH;
  const v = VIEW[b];
  // сначала ищем место на виду (если интерфейс сообщил, что видно), потом — где угодно на столе
  for (let pass = v ? 0 : 1; pass < 2; pass++) {
    let cx = x, cy = y;
    if (pass === 0) { cx = Math.max(v[0] + CW / 2, Math.min(v[2] - CW / 2, x)); cy = Math.max(v[1], Math.min(v[3] - CH, y)); }
    for (let ring = 0; ring < 14; ring++) {
      const n = ring === 0 ? 1 : ring * 6;
      const a0 = rnd(G) * 6.283;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.283, rr = ring * 62;
        const px = Math.max(CW / 2 + 10, Math.min(B.w - CW / 2 - 10, cx + Math.cos(a) * rr * 1.25));
        const py = Math.max(60, Math.min(B.h - h - 20, cy + Math.sin(a) * rr));
        if (pass === 0 && !inView(b, px, py, h)) continue;
        if (!overlaps(G, b, px, py, h, skip) && !inFight(G, b, px, py, h)) return [px, py];
      }
    }
  }
  return [x + (rnd(G) - 0.5) * 80, y + (rnd(G) - 0.5) * 80];
}
function coinPile(G, b, skipId) {
  let best = null, bd = 1e9;
  for (const r of roots(G, b)) {
    if (r.id === skipId || r.k !== "coin" || r.drag) continue;
    const d = r.y; if (d < bd) { bd = d; best = r; }
  }
  return best;
}
// выпадение новой карты рядом с (x,y); похожие складываются в ближайшую одинаковую стопку
export function spawn(G, k, b, x, y, opt) {
  opt = opt || {};
  const d = CARDS[k];
  if (d.c === "idea") { learn(G, d.rec, x, y, k); return null; }
  const c = add(G, k, b, x, y);
  const fx = x, fy = y;
  let placed = false;
  if (k === "coin") {
    const p = coinPile(G, b, c.id);
    if (p) { stackOnto(G, c, p); placed = true; }
  } else if ((d.c === "res" || d.c === "food" || d.c === "item") && !opt.loose) {
    let best = null, bd = 230 * 230;
    for (const r of roots(G, b)) {
      if (r === c || r.drag || r.cb || r.k !== k) continue;
      const ch = chain(G, r); if (ch.length >= 8 || ch.some((q) => q.k !== k)) continue;
      const dd = (r.x - x) ** 2 + (r.y - y) ** 2; if (dd < bd) { bd = dd; best = r; }
    }
    if (best) { stackOnto(G, c, best); placed = true; }
  }
  if (!placed) { const p = freeSpot(G, b, x + (opt.dx || 0), y + (opt.dy == null ? 40 : opt.dy), CH, c); c.x = p[0]; c.y = p[1]; dirty(G, c); }
  G.st.made[k] = (G.st.made[k] || 0) + 1;
  G.ev.push({ t: "pop", id: c.id, fx, fy, k });
  return c;
}
function learn(G, rec, x, y, ik) {
  const isNew = !G.kn[rec];
  G.kn[rec] = 1;
  G.ev.push({ t: "learn", rec, k: ik, x, y, isNew });
}

/* ---------- сопоставление рецептов ---------- */
function matchStack(G, cs) {
  if (cs.length < 1) return null;
  const cnt = {};
  for (const c of cs) cnt[c.k] = (cnt[c.k] || 0) + 1;
  outer: for (const p of PR) {
    if (p.size > cs.length || p.size + p.opt < cs.length) continue;
    const left = Object.assign({}, cnt);
    for (const k of p.spec) { if (!left[k]) continue outer; left[k]--; }
    let ws = 0;
    for (const k in left) { if (!left[k]) continue; if (!isW(k)) continue outer; ws += left[k]; }
    if (ws < p.w || ws > p.w + p.opt) continue;
    if (p.r.id === "r_breed") { const hut = cs.find((c) => c.k === "hut"); if (hut.br === G.day) continue; if (popCount(G) >= 24) continue; }
    if (p.r.id === "r_trail" && G.open.mountains) continue;
    if (p.r.id === "r_beacon" && G.f.beacon) continue;
    return p;
  }
  return null;
}
function roleMult(k, cat) {
  if (k === "builder" && cat === "build") return 2;
  if (k === "farmer" && (cat === "farm" || cat === "food")) return 2;
  if (k === "explorer" && cat === "explore") return 2;
  return 1;
}
function recipeMult(cs, p) {
  const cat = p.r.cat;
  const specLeft = {}; for (const k of p.spec) specLeft[k] = (specLeft[k] || 0) + 1;
  let m = p.w ? 0 : 1, wcount = 0;
  for (const c of cs) {
    if (specLeft[c.k]) { specLeft[c.k]--; continue; }
    if (isW(c.k)) { wcount++; m = Math.max(m, roleMult(c.k, cat)); }
  }
  if (p.opt && wcount > p.w) m = p.w ? m : (cs.some((c) => c.k === "farmer") ? 2.5 : 1.6);
  return Math.max(1, m);
}
export function stackInfo(G, r) { return r.rc ? { rec: RECIPE_BY_ID[r.rc], p: Math.min(1, r.rt / r.rT) } : null; }

function finishRecipe(G, r, p) {
  const cs = chain(G, r);
  const x = r.x, y = r.y, b = r.b;
  const recId = p.r.id;
  // расход
  const byK = (k) => { for (let i = cs.length - 1; i >= 0; i--) if (cs[i].k === k && G.cards[cs[i].id]) return cs[i]; return null; };
  for (const k of p.use) { const c = byK(k); if (c) removeCard(G, c); }
  let depleted = null;
  for (const k of p.wear) {
    const c = byK(k); if (!c) continue;
    c.u = (c.u || 1) - 1; c.n = (c.n || 0) + 1;
    if (c.u <= 0) { depleted = c; }
  }
  if (recId === "r_breed") { const hut = cs.find((c) => c.k === "hut"); hut.br = G.day; G.st.born++; }
  // выход
  const outs = [];
  if (p.r.out) outs.push(...p.r.out);
  else if (Array.isArray(p.r.lo)) outs.push(pickW(G, p.r.lo));
  else if (p.r.lo) outs.push(exploreLoot(G, p.r.lo, cs, byK(p.wear[0])));
  const equip = p.r.cat === "equip";
  let ri = 0;
  for (const k of outs) {
    if (k[0] === "!") { ambush(G, k.slice(1), b, x, y, cs); continue; }
    if (equip && ri === 0 && isPerson(k)) {
      const c = add(G, k, b, x, y); G.st.made[k] = (G.st.made[k] || 0) + 1; dirty(G, c);
      G.ev.push({ t: "pop", id: c.id, fx: x, fy: y, k, inplace: 1 }); ri++; continue;
    }
    const c = spawn(G, k, b, x, y, { dx: (ri - (outs.length - 1) / 2) * 30 });
    ri++;
    if (c && (k === "trail" || k === "darkpath" || k === "boat")) unlockVia(G, k);
    if (c && k === "beacon") { G.f.beacon = 1; win(G, "beacon"); }
  }
  if (depleted) { G.ev.push({ t: "deplete", k: depleted.k, x: depleted.x, y: depleted.y }); removeCard(G, depleted); }
  const disc = !G.kn[recId];
  G.kn[recId] = 1;
  G.ev.push({ t: "done", rec: recId, x, y, b, disc, cat: p.r.cat });
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
  let t = L.t;
  if (name === "cave" && (G.open.mountains || G.f.got_map)) t = t.filter((e) => e[0] !== "map");
  if (expl) t = t.map((e) => (e[0][0] === "!" ? [e[0], e[1] * 0.4] : (e[0] === "relic" || e[0] === "crystal" || e[0] === "nugget") ? [e[0], e[1] * 2] : e));
  const k = pickW(G, t);
  if (k === "relic") G.f.got_relic = 1;
  return k;
}

/* ---------- бои ---------- */
function newFight(G, b, x, y) {
  const f = { id: G.nfid++, b, x, y, foes: [], allies: [] };
  G.fights[f.id] = f;
  return f;
}
function joinFight(G, f, c, side) {
  if (c.cb === f.id) return;
  if (c.cb) leaveFight(G, c);
  if (c.dn || c.up) { // вынуть из стопки, остальные остаются
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
    f.allies.forEach((id, i) => { const c = G.cards[id]; if (!c) return; c.cb = 0; const p = freeSpot(G, f.b, c.x, c.y, CH, c); c.x = p[0]; c.y = p[1]; dirty(G, c); });
    G.ev.push({ t: "fightend", win: 1, x: f.x, y: f.y, b: f.b });
  } else if (!f.allies.length) {
    delete G.fights[f.id];
    f.foes.forEach((id) => { const c = G.cards[id]; if (c) { c.cb = 0; c.tm = 1.5; } });
    G.ev.push({ t: "fightend", win: 0, x: f.x, y: f.y, b: f.b });
  }
}
export function fightLayout(G, f) {
  const B = BIOMES[f.b], PER = 5;
  const nf = f.foes.length, na = f.allies.length, w = Math.min(PER, Math.max(nf, na));
  const ar = Math.ceil(na / PER);
  const fw = w * (CW + 10) + 30;
  f.x = Math.max(fw / 2 + 10, Math.min(B.w - fw / 2 - 10, f.x));
  f.y = Math.max(CH + 60, Math.min(B.h - CH * Math.max(1, ar) - 40, f.y));
  const row = (ids, y0, dir) => ids.forEach((id, i) => {
    const c = G.cards[id]; if (!c) return;
    const r = Math.floor(i / PER), inRow = Math.min(PER, ids.length - r * PER), j = i % PER;
    c.x = f.x + (j - (inRow - 1) / 2) * (CW + 10); c.y = y0 + dir * r * (CH * 0.62);
  });
  row(f.foes, f.y - CH - 8, -1);
  row(f.allies, f.y + 8, 1);
  f.w = fw; f.h = CH * 2 + 40; f.ar = ar; f.fr = Math.ceil(nf / PER);
  // зона боя: в ней не лежат чужие карты (их мягко раздвигает separate)
  const fr = Math.max(1, f.fr), arr = Math.max(1, ar);
  f.rx0 = f.x - fw / 2; f.rx1 = f.x + fw / 2;
  f.ry0 = f.y - CH - 22 - (fr - 1) * CH * 0.62; f.ry1 = f.y + CH + 22 + (arr - 1) * CH * 0.62;
}
function inFight(G, b, x, y, h) {
  for (const id in G.fights) {
    const f = G.fights[id];
    if (f.b !== b || f.rx0 == null) continue;
    if (x + CW / 2 > f.rx0 - 8 && x - CW / 2 < f.rx1 + 8 && y + h > f.ry0 - 8 && y < f.ry1 + 8) return true;
  }
  return false;
}
function ambush(G, k, b, x, y, cs) {
  const e = add(G, k, b, x, y - 40);
  G.ev.push({ t: "pop", id: e.id, fx: x, fy: y, k, enemy: 1 });
  const f = newFight(G, b, x, y);
  joinFight(G, f, e, "foe");
  for (const c of cs) if (G.cards[c.id] && isW(c.k)) joinFight(G, f, c, "ally");
  fightLayout(G, f);
  G.ev.push({ t: "ambush", k, x, y, b });
}
function damage(G, f, a, t, dmg) {
  const d = CARDS[t.k];
  const real = Math.max(1, dmg - (d.def || 0));
  t.hp -= real;
  G.ev.push({ t: "hit", a: a ? a.id : 0, b: t.id, d: real, x: t.x, y: t.y, bd: t.b, foe: d.c === "enemy" });
  if (t.hp <= 0) kill(G, f, t);
}
function kill(G, f, c) {
  const d = CARDS[c.k];
  const x = c.x, y = c.y, b = c.b;
  if (!f && c.cb) f = G.fights[c.cb] || null;
  if (f) { f.foes = f.foes.filter((i) => i !== c.id); f.allies = f.allies.filter((i) => i !== c.id); }
  c.cb = 0;
  removeCard(G, c);
  G.ev.push({ t: "die", k: c.k, x, y, b, foe: d.c === "enemy" });
  if (d.c === "enemy") {
    G.st.kills++;
    for (const [k, ch] of d.lo || []) if (ch == null || rnd(G) < ch) spawn(G, k, b, x, y, { dy: 20 });
    if (d.boss) { G.f.boss = 1; win(G, "boss"); }
  } else if (isPerson(c.k)) {
    G.st.deaths++;
    checkLose(G);
  }
  if (f) checkFight(G, f);
}
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
      damage(G, f, c, tgt, d.atk || 1);
    }
  }
}
function stepEnemies(G, dt) {
  for (const id in G.cards) {
    const e = G.cards[id];
    if (CARDS[e.k].c !== "enemy" || e.cb) continue;
    const d = CARDS[e.k];
    // ищем ближайшего жителя на этом столе
    let best = null, bd = 1e12;
    for (const jd in G.cards) {
      const c = G.cards[jd];
      if (c.b !== e.b || !isPerson(c.k) || root(G, c).drag) continue;
      const dd = (c.x - e.x) ** 2 + (c.y - e.y) ** 2;
      if (dd < bd) { bd = dd; best = c; }
    }
    e.tm = (e.tm || 0) - dt;
    if (!best) {
      if (e.tm <= 0) { e.tm = 2 + rnd(G) * 2; e.vx = (rnd(G) - 0.5) * d.sp; e.vy = (rnd(G) - 0.5) * d.sp; }
      e.x += (e.vx || 0) * dt; e.y += (e.vy || 0) * dt; clampToBoard(e.b, e);
      continue;
    }
    const dist = Math.sqrt(bd);
    if (dist < 60) {
      let f = best.cb ? G.fights[best.cb] : null;
      if (!f) {
        f = newFight(G, e.b, (e.x + best.x) / 2, (e.y + best.y) / 2 + 20);
        const r = root(G, best);
        for (const c of chain(G, r)) if (isW(c.k)) joinFight(G, f, c, "ally");
        if (!f.allies.length) joinFight(G, f, best, "ally");
        G.ev.push({ t: "attacked", k: e.k, x: e.x, y: e.y, b: e.b });
      }
      joinFight(G, f, e, "foe");
      e.tm = d.spd * 0.6;
      fightLayout(G, f);
      continue;
    }
    const sp = d.sp * (G.ph === "day" ? 1 : 0.3);
    e.x += ((best.x - e.x) / dist) * sp * dt; e.y += ((best.y - e.y) / dist) * sp * dt;
  }
}
function stepTowers(G, dt) {
  G.twr -= dt;
  if (G.twr > 0) return;
  G.twr = 2.2;
  for (const id in G.cards) {
    const t = G.cards[id];
    if (t.k !== "tower") continue;
    let best = null, bd = 360 * 360;
    for (const jd in G.cards) {
      const e = G.cards[jd];
      if (e.b !== t.b || CARDS[e.k].c !== "enemy") continue;
      const dd = (e.x - t.x) ** 2 + (e.y - t.y) ** 2; if (dd < bd) { bd = dd; best = e; }
    }
    if (best) { G.ev.push({ t: "arrow", x: t.x, y: t.y, tx: best.x, ty: best.y, b: t.b }); damage(G, best.cb ? G.fights[best.cb] : null, null, best, 1); }
  }
}
// житель/стопка брошены на врага или бой
export function attack(G, r, target) {
  const tgt = target.cb ? null : target;
  let f = target.cb ? G.fights[target.cb] : null;
  if (!f) { f = newFight(G, target.b, target.x, target.y + CH / 2 + 10); joinFight(G, f, tgt, "foe"); }
  const cs = chain(G, r);
  const rest = [];
  for (const c of cs) { if (isW(c.k)) joinFight(G, f, c, "ally"); else rest.push(c); }
  // остальное (не бойцы) — рядом стопкой
  if (rest.length) {
    for (let i = 0; i < rest.length; i++) { rest[i].dn = i ? rest[i - 1].id : 0; rest[i].up = i < rest.length - 1 ? rest[i + 1].id : 0; }
    const p = freeSpot(G, f.b, f.x, f.y + CH * 1.6, stackH(G, rest[0]), rest[0]); rest[0].x = p[0]; rest[0].y = p[1]; rest[0].b = f.b;
    layout(G, rest[0]); dirty(G, rest[0]);
  }
  fightLayout(G, f);
  return f;
}
function spawnEnemy(G, k, b, weaken) {
  const B = BIOMES[b];
  const side = Math.floor(rnd(G) * 4);
  const x = side === 0 ? 60 : side === 1 ? B.w - 60 : 80 + rnd(G) * (B.w - 160);
  const y = side === 2 ? 70 : side === 3 ? B.h - CH - 30 : 80 + rnd(G) * (B.h - 240);
  const e = add(G, k, b, x, y);
  if (weaken) e.hp = Math.max(1, Math.round(e.hp * (1 - weaken)));
  e.mhp = e.hp; e.tm = 2;
  G.ev.push({ t: "pop", id: e.id, fx: x, fy: y, k, enemy: 1 });
  return e;
}

/* ---------- края ---------- */
function unlockVia(G, k) {
  for (const b in BIOMES) {
    if (BIOMES[b].via !== k || G.open[b]) continue;
    G.open[b] = 1;
    G.ht[b] = G.day + 2;
    const B = BIOMES[b];
    B.start.forEach((s, i) => {
      const x = B.w / 2 + ((i % 4) - 1.5) * 92, y = B.h / 2 - 260 + Math.floor(i / 4) * 140;
      if (s[0] === "!") { const e = add(G, s.slice(1), b, B.w / 2 + 260, B.h / 2 - 420); e.mhp = e.hp; e.tm = 3; }
      else if (CARDS[s].c === "idea") G.f["idea_" + b] = s;
      else { const c = add(G, s, b, x, y); const p = freeSpot(G, b, x, y, CH, c); c.x = p[0]; c.y = p[1]; dirty(G, c); }
    });
    G.ev.push({ t: "unlock", b });
  }
}
// перенести стопку на другой край
export function travel(G, r, b) {
  if (!G.open[b] || r.b === b) return false;
  if (chain(G, r).some((c) => c.cb || CARDS[c.k].c === "enemy" || c.k === "barrow" || c.k === "shoal")) return false;
  const B = BIOMES[b];
  r.b = b;
  const p = freeSpot(G, b, B.w / 2, B.h / 2 + 40, stackH(G, r), r); r.x = p[0]; r.y = p[1];
  layout(G, r); dirty(G, r);
  if (G.f["idea_" + b] && chain(G, r).some((c) => isPerson(c.k))) { const ik = G.f["idea_" + b]; G.f["idea_" + b] = 0; learn(G, CARDS[ik].rec, r.x, r.y, ik); }
  G.ev.push({ t: "travel", b, id: r.id });
  return true;
}

/* ---------- перетаскивание ---------- */
export function pick(G, c) {
  if (CARDS[c.k].c === "enemy") return null;
  if (c.cb) { leaveFight(G, c); c.drag = 1; return c; }
  detach(G, c);
  c.drag = 1; c.rc = ""; c.rt = 0;
  return c;
}
// бросить стопку r на target (корень стопки или карта в бою) либо в пустое место
export function drop(G, r, x, y, target) {
  r.drag = 0; r.x = x; r.y = y; clampToBoard(r.b, r); layout(G, r); dirty(G, r);
  if (!target || target === r) { G.ev.push({ t: "drop", id: r.id }); return "place"; }
  const td = CARDS[target.k];
  const cs = chain(G, r);
  if (td.c === "enemy") {
    if (!cs.some((c) => isW(c.k))) { nudge(G, r, target); return "bounce"; }
    attack(G, r, target); G.ev.push({ t: "charge", x: target.x, y: target.y, b: target.b }); return "fight";
  }
  if (target.k === "barrow" && cs.some((c) => isW(c.k))) {
    if (!G.f.boss && !G.f.bossOut) {
      G.f.bossOut = 1;
      const e = add(G, "boss", target.b, target.x, target.y); e.mhp = e.hp; e.tm = 1.2;
      G.ev.push({ t: "pop", id: e.id, fx: target.x, fy: target.y, k: "boss", enemy: 1 });
      G.ev.push({ t: "boss", b: target.b });
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
  const p = freeSpot(G, r.b, target.x + CW + 20, target.y, stackH(G, r), r);
  r.x = p[0]; r.y = p[1]; layout(G, r); dirty(G, r);
  G.ev.push({ t: "bounce", id: r.id });
}

/* ---------- монеты, продажа, наборы ---------- */
export function coins(G) { let n = 0; for (const id in G.cards) if (G.cards[id].k === "coin") n++; return n; }
export function sellValue(G, c) { const v = CARDS[c.k].v; if (v == null) return null; return v + (v > 0 && hasB(G, "market") ? 1 : 0); }
export function canSell(G, r) { return chain(G, r).every((c) => CARDS[c.k].v != null || c.k === "coin"); }
// продать стопку r; монеты появляются у (x,y) на столе b
export function sell(G, r, x, y) {
  const cs = chain(G, r);
  if (cs[0].k === "coin") return { ok: false, coin: true };
  if (!cs.every((c) => CARDS[c.k].v != null)) return { ok: false };
  let sum = 0;
  for (const c of cs) { sum += sellValue(G, c); G.st.sold++; }
  for (const c of cs) delete G.cards[c.id];
  for (let i = 0; i < sum; i++) spawn(G, "coin", r.b, x, y);
  G.ev.push({ t: "sell", n: sum, x, y, cnt: cs.length });
  return { ok: true, n: sum };
}
export function packLocked(G, p) {
  if (!p.lock) return false;
  if (p.lock === "hut") return !(G.st.made.hut > 0);
  if (p.lock === "day2") return G.day < 2;
  if (p.lock === "day3") return G.day < 3;
  return false;
}
export function buyPack(G, k, b, x, y) {
  const p = PACKS.find((q) => q.k === k);
  if (!p || packLocked(G, p)) return null;
  if (coins(G) < p.cost) return null;
  // снимаем монеты: сначала с этого стола, сверху стопок
  let need = p.cost;
  const pools = Object.values(G.cards).filter((c) => c.k === "coin" && !c.drag).sort((a, c) => (a.b === b ? 0 : 1) - (c.b === b ? 0 : 1) || (c.up ? 0 : 1) - (a.up ? 0 : 1));
  for (const c of pools) {
    if (!need) break;
    if (c.up) continue;
    G.ev.push({ t: "spend", x: c.x, y: c.y, b: c.b });
    removeCard(G, c); need--;
  }
  while (need > 0) { const c = Object.values(G.cards).find((q) => q.k === "coin" && !q.up && !q.drag); if (!c) break; G.ev.push({ t: "spend", x: c.x, y: c.y, b: c.b }); removeCard(G, c); need--; }
  const c = add(G, k, b, x, y);
  const sp = freeSpot(G, b, x, y, CH, c); c.x = sp[0]; c.y = sp[1];
  G.st.packs++;
  G.bought[k] = (G.bought[k] || 0) + 1;
  G.ev.push({ t: "buy", id: c.id, k });
  return c;
}
export function openPack(G, c) {
  const p = PACKS.find((q) => q.k === c.k);
  if (!p) return false;
  const nth = (G.f["op_" + c.k] = (G.f["op_" + c.k] || 0) + 1);
  const x = c.x, y = c.y, b = c.b;
  delete G.cards[c.id];
  const got = [];
  for (let i = 0; i < p.cnt; i++) {
    let k = null;
    if (nth === 1 && p.first && p.first[i]) k = p.first[i];
    for (let tries = 0; !k && tries < 8; tries++) {
      const cand = pickW(G, p.t);
      if (CARDS[cand].c === "idea" && G.kn[CARDS[cand].rec]) continue;
      if (got.indexOf(cand) >= 0 && CARDS[cand].c === "idea") continue;
      k = cand;
    }
    if (!k) k = p.t[0][0];
    if (CARDS[k].c === "idea" && G.kn[CARDS[k].rec]) k = p.t[0][0];
    got.push(k);
  }
  got.forEach((k, i) => { G.ev.push({ t: "packpop", i }); spawn(G, k, b, x, y, { dx: (i - (got.length - 1) / 2) * 70, dy: 30, loose: 1 }); });
  G.ev.push({ t: "open", k: c.k, x, y, b });
  return true;
}

/* ---------- население, еда, место ---------- */
export function popCount(G) { let n = 0; for (const id in G.cards) if (isPerson(G.cards[id].k)) n++; return n; }
export function foodTotal(G) { let n = 0; for (const id in G.cards) { const c = G.cards[id]; if (CARDS[c.k].c === "food") n += c.f || 0; } return n; }
export function foodNeed(G) { return popCount(G) * EAT; }
export const hasB = (G, k) => { for (const id in G.cards) if (G.cards[id].k === k) return true; return false; };
const NOCAP = { coin: 1, enemy: 1, pack: 1, person: 1 };
export function cardCount(G) {
  let n = 0;
  for (const id in G.cards) { const c = G.cards[id]; const d = CARDS[c.k]; if (NOCAP[d.c] || c.k === "boat" || c.k === "trail" || c.k === "darkpath" || c.k === "beacon" || c.k === "barrow" || c.k === "shoal") continue; n++; }
  return n;
}
export function capacity(G) { let n = BASE_CAP; for (const id in G.cards) n += CARDS[G.cards[id].k].cap || 0; return n; }

// еда на грядке, костре или кухне (в идущем рецепте) не съедается
function inWork(G, c) { const r = root(G, c); return !!r.rc && r !== c; }
export function foodSafe(G) { let n = 0; for (const id in G.cards) { const c = G.cards[id]; if (CARDS[c.k].c === "food" && !inWork(G, c)) n += c.f || 0; } return n; }
function nightfall(G) {
  G.ph = "night"; G.nt = NIGHT_LEN;
  G.ev.push({ t: "night", day: G.day });
  // кормёжка: сначала самая простая еда
  const people = Object.values(G.cards).filter((c) => isPerson(c.k)).sort((a, b) => a.id - b.id);
  const food = Object.values(G.cards).filter((c) => CARDS[c.k].c === "food" && (c.f || 0) > 0 && !c.drag && !inWork(G, c)).sort((a, b) => (a.f - b.f) || (CARDS[a.k].f - CARDS[b.k].f));
  let fi = 0, starved = 0, delay = 0;
  for (const p of people) {
    let need = EAT;
    while (need > 0 && fi < food.length) {
      const fc = food[fi];
      const bite = Math.min(need, fc.f);
      fc.f -= bite; need -= bite; G.st.eaten += bite;
      G.ev.push({ t: "eat", fx: fc.x, fy: fc.y, fb: fc.b, k: fc.k, px: p.x, py: p.y, pb: p.b, pid: p.id, delay: delay++ * 0.12 });
      if (fc.f <= 0) { removeCard(G, fc); fi++; }
    }
    if (need > 0) { starved++; p.starve = 1; }
  }
  for (const p of people) {
    if (!p.starve) continue;
    G.ev.push({ t: "starve", k: p.k, x: p.x, y: p.y, b: p.b, delay: delay * 0.12 + 0.4 });
    G.st.starve++; G.st.deaths++;
    if (p.cb) { const f = G.fights[p.cb]; if (f) { f.allies = f.allies.filter((i) => i !== p.id); p.cb = 0; checkFight(G, f); } }
    removeCard(G, p);
  }
  G.lastNight = { ate: people.length - starved, starved, day: G.day };
  checkLose(G);
}
function dawn(G) {
  G.day++; G.t = 0; G.ph = "day";
  for (const id in G.cards) { const c = G.cards[id]; if (isPerson(c.k)) c.hp = CARDS[c.k].hp; }
  // рынок
  let m = 0; for (const id in G.cards) if (G.cards[id].k === "market") m++;
  m = Math.min(2, m);
  for (let i = 0; i < m * 2; i++) { const mk = Object.values(G.cards).find((c) => c.k === "market"); if (mk) spawn(G, "coin", mk.b, mk.x, mk.y); }
  // угрозы
  let list = THREATS[G.day];
  if (G.day === BOSS_DAY && list && G.f.boss) list = ["raider", "raider", "chief"];
  if (G.day === BOSS_DAY && list && G.f.bossOut && !G.f.boss) list = list.filter((k) => k !== "boss");
  if (!list && G.day > BOSS_DAY && G.day % 2 === 0) list = endlessWave(G);
  if (list && list.length) {
    let pal = 0; for (const id in G.cards) if (G.cards[id].k === "palisade" && G.cards[id].b === "home") pal++;
    const weaken = Math.min(2, pal) * 0.25;
    for (const k of list) { const e = spawnEnemy(G, k, "home", CARDS[k].boss ? 0 : weaken); if (k === "boss") G.f.bossOut = 1; }
    G.ev.push({ t: "threat", ks: list, b: "home", weak: weaken });
  }
  for (const b in G.open) {
    if (b === "home" || !G.ht[b] || G.day < G.ht[b]) continue;
    G.ht[b] = G.day + 3;
    const ks = BIOME_THREATS[b] || [];
    const hasP = Object.values(G.cards).some((c) => c.b === b && isPerson(c.k));
    if (!hasP) continue;
    for (const k of ks) spawnEnemy(G, k, b, 0);
    G.ev.push({ t: "threat", ks, b });
  }
  // странник: если в колонии меньше двух людей, к утру приходит новый житель (не чаще раза в 2 дня) — иначе хижина не даст потомства и игра встаёт
  if (!G.lost && popCount(G) > 0 && popCount(G) < 2 && G.day - (G.f.wand || -9) >= 2) {
    G.f.wand = G.day;
    const any = Object.values(G.cards).find((c) => isPerson(c.k));
    const b = "home", hut = Object.values(G.cards).find((c) => c.k === "hut" && c.b === b);
    const at = hut || (any && any.b === b ? any : null);
    const v = spawn(G, "villager", b, at ? at.x : 600, at ? at.y : 500, { dy: 60 });
    G.ev.push({ t: "wander", b });
  }
  G.ev.push({ t: "dawn", day: G.day });
}
function endlessWave(G) {
  const pow = 20 + (G.day - BOSS_DAY) * 6;
  const pool = ["raider", "wolf", "bear", "chief", "skeleton", "wraith", "troll"];
  const out = []; let s = 0;
  while (s < pow && out.length < 7) { const k = pool[Math.floor(rnd(G) * pool.length)]; out.push(k); s += CARDS[k].hp; }
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

/* ---------- задания ---------- */
const hasRole = (G) => Object.values(G.cards).some((c) => ["spearman", "warrior", "knight", "archer"].indexOf(c.k) >= 0);
const QCHK = {
  q_wood: (G) => G.st.made.wood > 0, q_stone: (G) => G.st.made.stone > 0, q_berry: (G) => G.st.made.berry > 0,
  q_hut: (G) => G.st.made.hut > 0, q_sell: (G) => G.st.sold > 0, q_pack: (G) => G.st.packs > 0, q_night: (G) => G.day >= 2,
  q_fire: (G) => G.st.made.campfire > 0, q_cook: (G) => ["roast", "bakedfish", "friedmush", "bread", "pie", "soup", "stew"].some((k) => G.st.made[k] > 0),
  q_field: (G) => G.st.made.field > 0, q_kill: (G) => G.st.kills > 0, q_pop: (G) => popCount(G) >= 4, q_arm: hasRole,
  q_store: (G) => G.st.made.shed > 0 || G.st.made.warehouse > 0, q_island: (G) => !!G.open.island, q_mount: (G) => !!G.open.mountains,
  q_crystal: (G) => G.st.made.crystal > 0, q_dark: (G) => !!G.open.haunted, q_relic: (G) => G.st.made.relic > 0, q_win: (G) => !!G.won,
};
export function questNow(G) {
  if (G.q < QUESTS.length) return QUESTS[G.q];
  const d = ENDLESS.find((x) => x > G.day) || G.day + 10;
  return { id: "q_end", n: "Продержись до дня " + d, h: "Бесконечный режим: набеги всё сильнее.", d };
}
function stepQuests(G) {
  let guard = 0;
  while (G.q < QUESTS.length && QCHK[QUESTS[G.q].id](G) && guard++ < 30) { G.ev.push({ t: "quest", n: QUESTS[G.q].n, i: G.q }); G.q++; }
}
export function questDone(G, i) { return i < G.q; }
export function questState(G, i) { return QCHK[QUESTS[i].id](G); }

/* ---------- шаг симуляции ---------- */
let qt = 0;
export function step(G, dt) {
  if (G.lost) return;
  G.st.time += dt;
  if (G.ph === "night") {
    G.nt -= dt;
    if (G.nt <= 0) {
      const over = cardCount(G) - capacity(G);
      if (over > 0) { G.ph = "hold"; G.ev.push({ t: "hold", over }); }
      else dawn(G);
    }
    stepFights(G, dt * 0.5);
    pushFromFights(G, null, dt);
    return;
  }
  if (G.ph === "hold") {
    if (cardCount(G) <= capacity(G)) dawn(G);
    return;
  }
  G.t += dt;
  if (G.t >= DAY_LEN) { nightfall(G); return; }
  // стопки и рецепты
  for (const id in G.cards) {
    const r = G.cards[id];
    if (r.dn || r.drag || r.cb) continue;
    if (CARDS[r.k].c === "enemy") continue;
    layout(G, r);
    if (r.dirty) {
      r.dirty = 0;
      const cs = chain(G, r);
      const p = matchStack(G, cs);
      if (p) {
        if (r.rc !== p.r.id) { r.rc = p.r.id; r.rt = 0; }
        r.rT = p.r.t / recipeMult(cs, p);
      } else { r.rc = ""; r.rt = 0; }
    }
    if (r.rc) {
      r.rt += dt;
      if (r.rt >= r.rT) {
        const cs = chain(G, r);
        const p = matchStack(G, cs);
        r.rc = ""; r.rt = 0; r.dirty = 1;
        if (p) finishRecipe(G, r, p);
      }
    }
  }
  stepEnemies(G, dt);
  stepFights(G, dt);
  stepTowers(G, dt);
  // лечение вне боя
  G.hl = (G.hl || 0) + dt;
  if (G.hl > 15) { G.hl = 0; for (const id in G.cards) { const c = G.cards[id]; if (isPerson(c.k) && !c.cb && c.hp < CARDS[c.k].hp) c.hp++; } }
  separate(G, dt);
  qt += dt; if (qt > 0.5) { qt = 0; stepQuests(G); const p = popCount(G); if (p > G.st.maxPop) G.st.maxPop = p; }
  if (G.won && !G.endless) G.endless = 1;
}
// мягко раздвигаем перекрывшиеся стопки
function separate(G, dt) {
  const rs = [];
  for (const id in G.cards) { const c = G.cards[id]; if (!c.dn && !c.drag && !c.cb && CARDS[c.k].c !== "enemy") rs.push(c); }
  const k = Math.min(1, dt * 6);
  for (let i = 0; i < rs.length; i++) {
    const a = rs[i]; const ah = a.h || CH;
    for (let j = i + 1; j < rs.length; j++) {
      const b = rs[j]; if (a.b !== b.b) continue;
      const ox = CW + 4 - Math.abs(a.x - b.x); if (ox <= 0) continue;
      const bh = b.h || CH;
      const oy = Math.min(a.y + ah, b.y + bh) - Math.max(a.y, b.y) + 4; if (oy <= 0) continue;
      if (ox < oy) { const s = (a.x < b.x ? -1 : 1) * ox * 0.5 * k; a.x += s; b.x -= s; }
      else { const s = (a.y < b.y ? -1 : 1) * oy * 0.5 * k; a.y += s; b.y -= s; }
      clampToBoard(a.b, a); clampToBoard(b.b, b);
    }
  }
  for (const r of rs) r.h = stackH(G, r);
  pushFromFights(G, rs, dt);
}
// выталкиваем стопки из зоны боя — плавно, в сторону ближайшего края зоны
function pushFromFights(G, rs, dt) {
  let any = false; for (const id in G.fights) { any = true; break; }
  if (!any) return;
  if (!rs) { rs = []; for (const id in G.cards) { const c = G.cards[id]; if (!c.dn && !c.drag && !c.cb && CARDS[c.k].c !== "enemy") { c.h = stackH(G, c); rs.push(c); } } }
  const k = Math.min(1, dt * 7), M = 10;
  for (const id in G.fights) {
    const f = G.fights[id];
    if (f.rx0 == null) fightLayout(G, f);
    for (const r of rs) {
      if (r.b !== f.b) continue;
      const h = r.h || CH;
      const l = r.x + CW / 2 - (f.rx0 - M), rt = f.rx1 + M - (r.x - CW / 2), u = r.y + h - (f.ry0 - M), d = f.ry1 + M - r.y;
      if (l <= 0 || rt <= 0 || u <= 0 || d <= 0) continue;
      const m = Math.min(l, rt, u * 1.3, d * 1.3);
      // сдвиг не меньше 40 px/с, чтобы не «залипать» у края
      const step = (v) => Math.min(v, Math.max(v * k, 40 * dt));
      if (m === l) r.x -= step(l); else if (m === rt) r.x += step(rt); else if (m === u * 1.3) r.y -= step(u); else r.y += step(d);
      const ox = r.x, oy = r.y; clampToBoard(r.b, r);
      // упёрлись в край стола — уходим вбок
      if (ox !== r.x || oy !== r.y) r.x += (r.x < f.x ? -1 : 1) * step(Math.min(l, rt));
      clampToBoard(r.b, r);
      layout(G, r);
    }
  }
}

/* ---------- сохранение ---------- */
export function serialize(G) {
  const o = Object.assign({}, G); o.ev = [];
  return JSON.stringify(o);
}
export function deserialize(s) {
  const G = JSON.parse(s);
  if (!G || !G.cards || G.v !== 1) return null;
  G.ev = [];
  for (const id in G.cards) { const c = G.cards[id]; c.drag = 0; if (!CARDS[c.k]) delete G.cards[id]; }
  // бои: на всякий случай чистим ссылки на исчезнувшие карты
  for (const id in G.fights) { const f = G.fights[id]; f.foes = f.foes.filter((i) => G.cards[i]); f.allies = f.allies.filter((i) => G.cards[i]); if (!f.foes.length || !f.allies.length) { [...f.foes, ...f.allies].forEach((i) => { G.cards[i].cb = 0; }); delete G.fights[id]; } }
  for (const id in G.cards) { const c = G.cards[id]; if (c.cb && !G.fights[c.cb]) c.cb = 0; if (!c.dn) c.dirty = 1; }
  return G;
}
export { rnd };
