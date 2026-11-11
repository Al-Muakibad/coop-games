// «Хутор» — бот-напарник. Играет за одну семью через те же намерения, что и человек (pickI → moveI → dropI).
// Используется в игре (напарник, если друг вышел или «с ботом») и в Node для проверки баланса.
// skill: "good" — планирует стройки, еду и оборону; "careless" — медленный, хаотичный, без запасов.
import { CARDS, RECIPES, PACKS, BRIDGE, SITE_POS, CW, CH, EAT, DAY_LEN, BANKS } from "./data.js";
import * as S from "./sim.js";

const REC = {}; for (const r of RECIPES) REC[r.id] = r;
// разбор потребностей рецепта
function needs(r) {
  const o = { use: {}, keep: [], wear: [], w: 0 };
  for (const tk of r.need) {
    if (tk === "@w") o.w++;
    else if (tk === "?@w") continue;
    else if (tk[0] === "=") o.keep.push(tk.slice(1));
    else if (tk[0] === "~") o.wear.push(tk.slice(1));
    else o.use[tk] = (o.use[tk] || 0) + 1;
  }
  return o;
}
const GATHER = { wood: ["tree", "willow", "deadtree"], stone: ["quarry", "rock"], fiber: ["grass", "willow"], clay: ["claypit"], ore: ["vein", "quarry"], crystal: ["crystalvein"] };
const CRAFT = { plank: ["r_lumber", "r_plank"], cutstone: ["r_cutstone"], rope: ["r_rope"], brick: ["r_brick"], coal: ["r_coal"], iron: ["r_iron"] };
const FOOD_SRC = ["shoal", "bush", "mushpatch", "hive"];
const RAW_FOOD = { meat: "r_roast", fish: "r_bakefish", mushroom: "r_friedmush" };

export function makeBot(p, opt) {
  opt = opt || {};
  const skill = opt.skill || "good";
  const good = skill === "good";
  const B = { p, skill, busy: null, plan: null, cd: 0.5 + (opt.delay || 0), log: [], acts: 0, rng: (opt.seed || 7) + p * 101 };
  const rand = () => { B.rng = (B.rng * 16807) % 2147483647; return B.rng / 2147483647; };
  const think = () => good ? (opt.fast ? 0.35 : 0.8) + rand() * 0.6 : 2 + rand() * 3;
  const carry = (d) => good ? 0.3 + d / 1300 : 0.6 + d / 800;
  // рецепты, понятные из описаний карт (их знает внимательный игрок и без идей)
  const OBVIOUS = { r_trail: 1, r_darkpath: 1, r_hut: 1, r_plank: 1, r_cutstone: 1 };
  const known = (G, rid) => G.kn[rid] || OBVIOUS[rid] || rid.startsWith("b_");

  /* ---------- взгляд на стол ---------- */
  function claimed(G, id) { const c = G._claims && G._claims[id]; return c && c.p !== p && c.t > G.st.time; }
  function claim(G, id, sec) { (G._claims || (G._claims = {}))[id] = { p, t: G.st.time + (sec || 6) }; }
  const free = (G, r) => r && !r.drag && !r.cb && !r.dn && !claimed(G, r.id);
  const mine = (c) => S.isPerson(c.k) && c.o === p;
  // жители моей семьи, которые ничего не делают
  function idle(G) {
    const out = [];
    for (const id in G.cards) {
      const c = G.cards[id];
      if (!mine(c) || c.cb || c.up || claimed(G, c.id)) continue;
      const r = S.root(G, c);
      if (r.drag || r.cb) continue;
      if (r === c) { out.push(c); continue; }
      if (r.rc) continue;                                     // работает
      if (CARDS[r.k].c === "site" && G.ph === "day") continue; // ждёт напарника на мосту
      out.push(c);
    }
    return out;
  }
  // стопки из карт одного вида: [{r, n}]
  let PC = null;   // кэш на одно решение
  function piles(G, k) {
    if (PC && PC["p" + k]) return PC["p" + k];
    const out = [];
    for (const id in G.cards) {
      const r = G.cards[id];
      if (r.dn || r.k !== k || !free(G, r) || r.rc) continue;
      const cs = S.chain(G, r); if (cs.some((q) => q.k !== k)) continue;
      out.push({ r, n: cs.length, cs });
    }
    if (PC) PC["p" + k] = out;
    return out;
  }
  const avail = (G, k) => piles(G, k).reduce((a, q) => a + q.n, 0);
  const nature = (G, k) => { const a = []; for (const id in G.cards) { const c = G.cards[id]; if (c.k === k && !c.dn && !c.up && free(G, c) && !c.rc) a.push(c); } return a; };
  const hasK = (G, k) => { for (const id in G.cards) if (G.cards[id].k === k) return G.cards[id]; return null; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function nearest(list, to) { let b = null, bd = 1e18; for (const c of list) { const d = dist(c, to); if (d < bd) { bd = d; b = c; } } return b; }
  const homeY = p === 0 ? 1300 : 380;
  const home = { x: 700, y: homeY };

  /* ---------- руки: взять → нести → положить ---------- */
  function move(G, id, tid, x, y, why) {
    const c = G.cards[id]; if (!c) return false;
    const r = S.pickI(G, p, id);
    if (r.err) return false;
    const tgt = tid > 0 ? G.cards[tid] : null;
    if (tgt) { const tr = tgt.cb ? tgt : S.root(G, tgt); x = tr.x; y = tr.y + (tgt.cb ? 0 : S.stackH(G, tr) - CH + 24); }
    const d = Math.hypot(c.x - x, c.y - y);
    B.busy = { id, tid, fx: c.x, fy: c.y, x, y, t: 0, dur: carry(d), why };
    if (tid > 0) { claim(G, tid, 3); (G._carry || (G._carry = {}))[p] = { tid, ks: S.chain(G, c).map((q) => q.k) }; }
    B.acts++;
    return true;
  }
  function tickHand(G, dt) {
    const h = B.busy; h.t += dt;
    const c = G.cards[h.id];
    if (!c || c.drag !== p + 1) { B.busy = null; if (G._carry) delete G._carry[p]; return; }
    const k = Math.min(1, h.t / h.dur), e = k * k * (3 - 2 * k);
    let tx = h.x, ty = h.y;
    if (h.tid > 0) { const t = G.cards[h.tid]; if (!t) { h.tid = 0; } else { const tr = t.cb ? t : S.root(G, t); tx = tr.x; ty = tr.y + (t.cb ? 0 : S.stackH(G, tr) - CH + 24); } }
    S.moveI(G, p, h.id, h.fx + (tx - h.fx) * e, h.fy + (ty - h.fy) * e - Math.sin(k * Math.PI) * 30);
    B.hand = { x: c.x, y: c.y };
    if (k >= 1) {
      const res = S.dropI(G, p, h.id, tx, ty, h.tid || 0);
      B.busy = null; if (G._carry) delete G._carry[p];
      if (h.tid === -1 && res.res !== "sell") B.cd += 1;
    }
  }

  /* ---------- сборка стопки по рецепту ---------- */
  // план: {rid, anchor (id корня), pair}
  function anchorFor(G, rid) {
    const r = REC[rid], n = needs(r);
    if (n.keep.length) {
      const k = n.keep[0];
      let best = null;
      for (const id in G.cards) {
        const c = G.cards[id];
        if (c.k !== k || c.dn || c.cb || c.drag || c.rc) continue;
        if (!stackOk(G, c, rid)) continue;
        if (!best || dist(c, home) < dist(best, home)) best = c;
      }
      return best;
    }
    if (n.wear.length) return null;
    // уже начатая стопка из материалов этого рецепта
    for (const id in G.cards) {
      const c = G.cards[id];
      if (c.dn || !free(G, c) || c.rc || !c.up) continue;
      const cs = S.chain(G, c);
      if (cs.some((q) => !n.use[q.k])) continue;
      if (new Set(cs.map((q) => q.k)).size < 2) continue;
      if (stackOk(G, c, rid)) return c;
    }
    // якорь — стопка одного из материалов (не больше, чем нужно)
    for (const k in n.use) { const ps = piles(G, k).filter((q) => q.n <= n.use[k]); if (ps.length) return nearest(ps.map((q) => q.r), home); }
    // большая стопка — отделяем сверху сколько нужно
    for (const k in n.use) { const ps = piles(G, k); if (ps.length) { const pl = nearest(ps.map((q) => q.r), home); const cs = S.chain(G, pl); return { split: cs[cs.length - n.use[k]] }; } }
    return null;
  }
  // содержимое стопки не мешает рецепту?
  function stackOk(G, root, rid) {
    const r = REC[rid], n = needs(r);
    const left = Object.assign({}, n.use); n.keep.forEach((k) => (left[k] = (left[k] || 0) + 1));
    let w = 0;
    for (const c of S.chain(G, root)) {
      if (left[c.k]) { left[c.k]--; continue; }
      if (S.isW(c.k)) { w++; continue; }
      return false;
    }
    return w <= n.w;
  }
  // чего не хватает в стопке-якоре: {k: n}
  function missing(G, root, rid) {
    const r = REC[rid], n = needs(r);
    const left = Object.assign({}, n.use);
    let w0 = 0, w1 = 0;
    for (const c of S.chain(G, root)) { if (left[c.k]) left[c.k]--; else if (S.isW(c.k)) { if (c.o === 0) w0++; else w1++; } }
    for (const q in (G._carry || {})) { const cr = G._carry[q]; if (!cr || cr.tid !== root.id) continue; for (const k of cr.ks) { if (left[k]) left[k]--; else if (S.isW(k)) { if (+q === 0) w0++; else w1++; } } }
    for (const k in left) if (!left[k]) delete left[k];
    return { mat: left, w0, w1, w: n.w };
  }
  function canAfford(G, rid, reserve) {
    const r = REC[rid], n = needs(r);
    for (const k of n.keep) if (!hasK(G, k)) return false;
    for (const k in n.use) if (avail(G, k) - ((reserve && reserve[k]) || 0) < n.use[k]) return false;
    return true;
  }
  // один шаг сборки; true — что-то сделали
  function stepPlan(G) {
    const P = B.plan;
    let a = G.cards[P.anchor];
    if (!a || a.dn || a.drag || a.cb) { B.plan = null; return false; }
    if (a.rc) { B.plan = null; return false; }               // уже работает
    if (!stackOk(G, a, P.rid)) { B.plan = null; return false; }
    const m = missing(G, a, P.rid);
    const mk = Object.keys(m.mat);
    if (mk.length) {
      const k = mk[0], want = m.mat[k];
      const ps = piles(G, k).filter((q) => q.r !== a);
      if (!ps.length) { B.plan = null; return false; }
      const pl = nearest(ps.map((q) => q.r), a); const cs = S.chain(G, pl);
      const take = cs[Math.max(0, cs.length - want)];
      return move(G, take.id, a.id, 0, 0, "mat " + k);
    }
    // материалы на месте — нужны работники
    const pair = REC[P.rid].pair;
    const haveMine = p === 0 ? m.w0 : m.w1;
    const total = m.w0 + m.w1;
    if (total >= m.w) { B.plan = null; return false; }
    if (pair && haveMine >= 1 && !G.solo) { P.wait = (P.wait || 0) + 1; return false; }
    const ws = idle(G).filter((c) => S.root(G, c) !== a);
    if (!ws.length) return false;
    const w = pickWorker(G, ws, REC[P.rid].cat, a);
    claim(G, a.id, 4);
    return move(G, w.id, a.id, 0, 0, "work " + P.rid);
  }
  function pickWorker(G, ws, cat, near) {
    const pref = cat === "build" || cat === "bridge" ? "builder" : cat === "farm" || cat === "food" ? "farmer" : cat === "explore" ? "explorer" : "";
    const fighters = ["warrior", "knight", "archer", "spearman"];
    const sorted = ws.slice().sort((a, b) => (b.k === pref) - (a.k === pref) || (fighters.indexOf(a.k) >= 0) - (fighters.indexOf(b.k) >= 0) || dist(a, near) - dist(b, near));
    return sorted[0];
  }
  function startPlan(G, rid) {
    const a = anchorFor(G, rid);
    if (!a) return false;
    if (a.split) { const c = a.split, r = S.root(G, c); return move(G, c.id, 0, r.x + (r.x < 700 ? 110 : -110), r.y + 30, "split " + c.k); }
    B.plan = { rid, anchor: a.id };
    claim(G, a.id, 8);
    return stepPlan(G);
  }

  /* ---------- решения ---------- */
  function enemies(G) { const a = []; for (const id in G.cards) { const c = G.cards[id]; if (S.isEnemy(c.k)) a.push(c); } return a; }
  // сила отряда по Ланчестеру: (сумма урона в секунду) × (сумма здоровья)
  function power(G, list, foeSide, both) {
    let dps = 0, hp = 0;
    for (const c of list) { const d = CARDS[c.k]; let a = (d.atk || 1) + (S.isPerson(c.k) && S.roleOf(G, c.o) === "guard" ? 1 : 0); if (foeSide && d.pair && !both) a *= 3; dps += a / (d.spd || 1.4); hp += c.hp || d.hp || 1; }
    return dps * hp;
  }
  function combat(G) {
    const es = enemies(G); if (!es.length) return false;
    const ws = idle(G);
    const avail2 = []; for (const id in G.cards) { const c = G.cards[id]; if (mine(c) && !c.cb && !S.root(G, c).drag && !claimed(G, c.id)) avail2.push(c); }
    const rank = (c) => (CARDS[c.k].tg.indexOf("fighter") >= 0 ? 10 : 0) + (ws.indexOf(c) >= 0 ? 3 : 0) + (CARDS[c.k].atk || 1) + (c.hp || 0) * 0.1;
    const pool = (near) => avail2.filter((c) => dist(c, near) < 1700 && (c.hp || 0) >= 3).sort((a, b) => rank(b) - rank(a) || dist(a, near) - dist(b, near));
    for (const f of Object.values(G.fights)) {
      const foes = f.foes.map((i) => G.cards[i]).filter(Boolean);
      const allies = f.allies.map((i) => G.cards[i]).filter(Boolean);
      if (!foes.length) continue;
      const heavy = foes.some((e) => CARDS[e.k].pair);
      const meIn = allies.some((c) => c.o === p);
      let inbound = 0; for (const q in (G._carry || {})) if (G._carry[q] && G._carry[q].tid && foes.some((e) => e.id === G._carry[q].tid)) inbound++;
      const ally = power(G, allies, false) * (1 + inbound * 0.5), foe = power(G, foes, true, f.both);
      if (!(heavy && !meIn && !G.solo) && ally > foe * 1.6) continue;
      const pl = pool(f); if (!pl.length) continue;
      return move(G, pl[0].id, foes[0].id, 0, 0, "join fight");
    }
    for (const e of es) {
      if (e.cb) continue;
      const near = nearest(avail2, e);
      const myBank = p === 0 ? "s" : "n";
      if (!(near && dist(near, e) < 1000) && S.bankOf(e.y) !== myBank) continue;
      const pl = pool(e); if (!pl.length) continue;
      return move(G, pl[0].id, e.id, 0, 0, "attack " + e.k);
    }
    return false;
  }
  function equip(G) {
    const order = [["sword", ["spearman", "villager"]], ["armor", ["warrior"]], ["bow", ["villager"]], ["spear", ["villager"]], ["lantern", ["villager"]], ["hammer", ["villager"]], ["hoe", ["villager"]]];
    for (const [it, who] of order) {
      if (it === "lantern" && (G.open.haunted || hasK(G, "explorer"))) continue;
      if (it === "hammer" && countMine(G, "builder") >= 1) continue;
      if (it === "hoe" && countMine(G, "farmer") >= 1) continue;
      const ps = piles(G, it); if (!ps.length) continue;
      const ws = idle(G).filter((c) => who.indexOf(c.k) >= 0 && S.root(G, c) === c);
      if (!ws.length) continue;
      const w = nearest(ws, ps[0].r);
      const cs = S.chain(G, ps[0].r);
      return move(G, cs[cs.length - 1].id, w.id, 0, 0, "equip " + it);
    }
    return false;
  }
  const countMine = (G, k) => { let n = 0; for (const id in G.cards) { const c = G.cards[id]; if (c.k === k && c.o === p) n++; } return n; };
  function foodPlan(G) {
    const need = S.foodNeed(G), have = S.foodSafe(G);
    let coming = 0;
    for (const id in G.cards) { const r = G.cards[id]; if (r.rc && !r.dn) { const R = REC[r.rc]; if (R && R.out && CARDS[R.out[0]].c === "food") coming += (CARDS[R.out[0]].f || 0) * R.out.length; } }
    const left = (DAY_LEN - G.t) / DAY_LEN;
    return { short: have + coming * 0.8 - need, need, have, left };
  }
  function cook(G) {
    for (const k in RAW_FOOD) {
      const ps = piles(G, k); if (!ps.length) continue;
      const rid = RAW_FOOD[k];
      const kit = hasK(G, "kitchen");
      const keep = kit && (k === "meat") ? "kitchen" : "campfire";
      const fires = []; for (const id in G.cards) { const c = G.cards[id]; if (c.k === keep && !c.dn && !c.up && !c.rc && !c.cb && free(G, c)) fires.push(c); }
      if (!fires.length) continue;
      const cs = ps[0].cs;
      return move(G, cs[cs.length - 1].id, nearest(fires, ps[0].r).id, 0, 0, "cook " + k);
    }
    // кухня: хлеб, уха, похлёбка
    const kit = []; for (const id in G.cards) { const c = G.cards[id]; if (c.k === "kitchen" && !c.dn && !c.up && !c.rc && free(G, c)) kit.push(c); }
    if (kit.length) for (const rid of ["r_bread", "r_soup", "r_stew", "r_pie"]) if (G.kn[rid] && canAfford(G, rid)) { B.plan = { rid, anchor: kit[0].id }; return stepPlan(G); }
    return false;
  }
  function gatherFood(G, ws) {
    for (const k of FOOD_SRC) {
      const ns = nature(G, k); if (!ns.length) continue;
      const w = pickWorker(G, ws, "food", ns[0]);
      return move(G, w.id, nearest(ns, w).id, 0, 0, "food " + k);
    }
    // грядка: морковь/колос
    const fields = []; for (const id in G.cards) { const c = G.cards[id]; if (c.k === "field" && !c.dn && !c.up && !c.rc && free(G, c)) fields.push(c); }
    if (fields.length) for (const k of ["carrot", "wheat", "berry"]) { const ps = piles(G, k); if (ps.length) { const cs = ps[0].cs; return move(G, cs[cs.length - 1].id, fields[0].id, 0, 0, "plant " + k); } }
    return false;
  }
  // список целей стройки по порядку
  function goals(G) {
    const g = [];
    const has = (k) => !!hasK(G, k);
    const nb = (k) => { let n = 0; for (const id in G.cards) if (G.cards[id].k === k) n++; return n; };
    const pop = S.popCount(G);
    const nextB = G.bridge + 1;
    if (!has("hut")) g.push("r_hut");
    if (G.kn.r_campfire && !has("campfire") && !has("kitchen")) g.push("r_campfire");
    if (nextB === 1 && G.day >= 2) g.push("b_1");
    if (nb("hut") < 2 && G.day >= 2) g.push("r_hut");
    if (G.kn.r_field && nb("field") < 1 + Math.floor(pop / 5)) g.push("r_field");
    if (G.kn.r_palisade && nb("palisade") < 2 && G.day >= 4) g.push("r_palisade");
    const over = S.cardCount(G) - S.capacity(G);
    if (over > -6) { if (G.kn.r_shed && nb("shed") < 3) g.unshift("r_shed"); if (G.kn.r_granary && nb("granary") < 2) g.push("r_granary"); }
    if (nextB === 2) g.push("b_2");
    if (G.kn.r_sawmill && !has("sawmill")) g.push("r_sawmill");
    if (G.kn.r_smithy && !has("smithy")) g.push("r_smithy");
    if (G.kn.r_kitchen && !has("kitchen") && has("campfire") && nb("campfire") >= 1 && G.day >= 5) g.push("r_kitchen");
    if (G.kn.r_campfire && nb("campfire") < 1) g.push("r_campfire");
    if (nextB === 3) g.push("b_3");
    if (G.kn.r_fair && !has("fair")) g.push("r_fair");
    if (G.kn.r_tower && nb("tower") < 1 && G.day >= 8) g.push("r_tower");
    if (G.kn.r_quarryb && !has("quarry")) g.push("r_quarryb");
    if (has("map") && !G.open.mountains) g.push("r_trail");
    const wantF = Math.min(8, 2 + Math.floor(G.day / 2.5));
    if (countFighters(G) < wantF) { if (G.kn.r_sword && has("smithy")) g.unshift("r_sword"); if (G.kn.r_spear) g.unshift("r_spear"); if (G.kn.r_bow) g.push("r_bow"); if (G.kn.r_iron && has("smithy") && avail(G, "iron") < 1) g.push("r_iron"); }
    if (G.kn.r_sword && has("smithy") && countFighters(G) < Math.min(6, 2 + G.day / 3)) g.push("r_sword");
    if (G.kn.r_spear && countFighters(G) < 2 + G.day / 4) g.push("r_spear");
    if (G.kn.r_bow && countFighters(G) < 3 + G.day / 4) g.push("r_bow");
    if (nextB === 4 && avail(G, "crystal") >= 1) g.push("r_iron", "b_4");
    if (nextB === 4) g.push("b_4");
    if (G.open.mountains && !G.open.haunted && !has("explorer") && !has("lantern") && G.kn.r_lantern && has("smithy")) g.push("r_iron", "r_lantern");
    if (has("explorer") && !G.open.haunted) g.push("r_darkpath");
    if (nextB === 5) g.push("b_5");
    if (G.kn.r_boat && !G.open.island && G.day >= 6 && !has("boat")) g.push("r_boat");
    if (G.kn.r_armor && has("smithy") && avail(G, "hide")) g.push("r_armor");
    if (pop < 6 + G.day && G.kn.r_hut && nb("hut") < 1 + Math.floor(pop / 3)) g.push("r_hut");
    return g;
  }
  const countFighters = (G) => { let n = 0; for (const id in G.cards) if (["spearman", "warrior", "knight", "archer"].indexOf(G.cards[id].k) >= 0) n++; return n; };
  // материалы, нужные первым целям
  function demand(G, gl) {
    const d = {};
    for (const rid of gl.slice(0, 3)) { const n = needs(REC[rid]); for (const k in n.use) d[k] = (d[k] || 0) + n.use[k]; for (const k of n.keep) if (!hasK(G, k)) { const br = RECIPES.find((r) => r.out && r.out[0] === k); if (br) { const n2 = needs(br); for (const k2 in n2.use) d[k2] = (d[k2] || 0) + n2.use[k2]; } } }
    // мост на очереди — материалы ему
    const nb = G.bridge + 1;
    if (nb <= 5) { const n = needs(REC["b_" + nb]); for (const k in n.use) d[k] = Math.max(d[k] || 0, n.use[k]); }
    return d;
  }
  // занять свободного работника: ремесло → сбор → еда → разведка
  function work(G, ws, dem) {
    // ремесло из того, что лежит
    for (const out in CRAFT) {
      if (!dem[out] || avail(G, out) >= dem[out]) continue;
      for (const rid of CRAFT[out]) {
        if (!known(G, rid)) continue;
        const n = needs(REC[rid]);
        if (n.keep.some((k) => !hasK(G, k))) continue;
        if (!canAfford(G, rid)) continue;
        if (startPlan(G, rid)) return true;
      }
    }
    // сырьё
    const order = Object.keys(dem).sort((a, b) => (avail(G, a) - dem[a]) - (avail(G, b) - dem[b]));
    for (const k of order) {
      if (avail(G, k) >= dem[k] + 1 || avail(G, k) >= 6) continue;
      let raw = [k];
      if (k === "plank") raw = ["wood"]; else if (k === "cutstone") raw = ["stone"]; else if (k === "rope") raw = ["fiber"]; else if (k === "brick") raw = ["clay"]; else if (k === "coal") raw = ["wood"];
      else if (k === "iron") raw = ["ore", "wood"];
      for (const rk of raw) {
        for (const src of GATHER[rk] || []) {
          const ns = nature(G, src); if (!ns.length) continue;
          const w = pickWorker(G, ws, "gather", ns[0]);
          return move(G, w.id, nearest(ns, w).id, 0, 0, "gather " + rk);
        }
      }
      if (k === "relic") { const rs = nature(G, "ruins"); if (rs.length) { const w = pickWorker(G, ws.filter((c) => CARDS[c.k].atk >= 2).length ? ws.filter((c) => CARDS[c.k].atk >= 2) : ws, "explore", rs[0]); return move(G, w.id, rs[0].id, 0, 0, "ruins"); } }
      if (k === "crystal") { const ps = nature(G, "pass"); if (ps.length) { const w = pickWorker(G, ws, "explore", ps[0]); return move(G, w.id, ps[0].id, 0, 0, "pass"); } }
      if (k === "ore") { const cv = nature(G, "cave"); if (cv.length) { const w = pickWorker(G, ws, "explore", cv[0]); return move(G, w.id, cv[0].id, 0, 0, "cave ore"); } }
    }
    return false;
  }
  function explore(G, ws) {
    if (opt.debug > 1) console.log("explore", ws.length, ["cave","forest","shore","pass"].map(k=>k+":"+nature(G,k).length).join(","));
    const want = [];
    if (!G.open.mountains && !G.f.got_map) want.push("cave");
    want.push("forest", "shore", "cave", "pass");
    if (G.open.haunted && !G.f.got_relic) want.unshift("ruins");
    for (const k of want) {
      const ns = nature(G, k); if (!ns.length) continue;
      const w = pickWorker(G, ws, "explore", ns[0]);
      return move(G, w.id, nearest(ns, w).id, 0, 0, "explore " + k);
    }
    return false;
  }
  function foodProducers(G) { let n = 0; for (const id in G.cards) { const k = G.cards[id].k; if (k === "field") n += 1.5; else if (k === "shoal") n += 2; else if (k === "bush" || k === "mushpatch" || k === "appletree" || k === "hive") n += 0.5; else if (k === "kitchen") n += 1; } return n; }
  function breed(G, ws) {
    const fp = foodPlan(G);
    const pop = S.popCount(G);
    const cap = Math.min(4 + G.day * 0.9, 6 + foodProducers(G) * 2, 22);
    if (fp.have < S.foodNeed(G) + 3 || pop >= cap) return false;
    const huts = []; for (const id in G.cards) { const c = G.cards[id]; if (c.k === "hut" && !c.dn && free(G, c) && !c.rc && c.br !== G.day) huts.push(c); }
    for (const h of huts) {
      const cs = S.chain(G, h);
      if (cs.length === 1 && ws.length >= 2) return move(G, ws[0].id, h.id, 0, 0, "breed");
      const other = ws.find((c) => c !== cs[1]);
      if (cs.length === 2 && S.isPerson(cs[1].k) && other) return move(G, other.id, h.id, 0, 0, "breed2");
    }
    return false;
  }
  function shop(G) {
    const coins = S.coins(G);
    if (B.lastBuy && G.st.time - B.lastBuy < (good ? 4 : 10)) return false;
    if (coins < 2 || (B.shopT && G.st.time - B.shopT < 2.5)) return false;
    B.shopT = G.st.time;
    let order;
    if (!good) order = PACKS.map((q) => q.k).sort(() => rand() - 0.5);
    else {
      // оцениваем, какой сундук сейчас нужнее
      const fp = foodPlan(G), dem = demand(G, goals(G));
      const src = (ks) => ks.reduce((a, k) => a + nature(G, k).length, 0);
      const bo = (k) => G.bought[k] || 0;
      const sc = {
        pk_forest: ((dem.wood || dem.plank) && src(["tree", "willow", "deadtree"]) < 2 ? 4 : 0) + ((dem.fiber || dem.rope) && !src(["grass", "willow"]) ? 3 : 0) + (fp.short < 4 ? 2 : 0) + (!G.kn.r_rope ? 1 : 0),
        pk_stone: ((dem.stone || dem.cutstone) && src(["rock", "quarry"]) < 2 ? 4 : 0) + ((dem.clay || dem.brick) && !src(["claypit"]) ? 3 : 0),
        pk_farm: (fp.short < 4 ? 3 : 0) + (bo("pk_farm") < 1 ? 2 : 0) - (avail(G, "wheat") > 4 && !hasK(G, "kitchen") ? 4 : 0) - bo("pk_farm") * 0.7,
        pk_craft: (bo("pk_craft") < 3 ? 4 : 1) + (["r_smithy", "r_sawmill", "r_iron", "r_granary", "r_shed"].filter((k) => !G.kn[k]).length) - bo("pk_craft") * 0.4,
        pk_defense: G.day >= 3 ? (countFighters(G) < 2 + G.day / 3 ? 4 : 1) + (["r_sword", "r_bow", "r_palisade", "r_iron"].filter((k) => !G.kn[k]).length) * 0.7 - bo("pk_defense") * 0.3 : 0,
        pk_explore: (src(["forest", "cave"]) === 0 ? 3 : 0) + (bo("pk_explore") < 2 ? 2 : 0) + (!G.kn.r_lantern && G.open.mountains ? 2 : 0) - bo("pk_explore") * 0.6,
      };
      order = Object.keys(sc).sort((a, b) => sc[b] - sc[a]).filter((k) => sc[k] > 0);
    }
    for (const k of order) {
      const pk = PACKS.find((q) => q.k === k);
      if (S.packLocked(G, pk)) continue;
      const cost = S.packCost(G, pk, p);
      if (coins < cost) continue;
      if (good && coins < 16 && S.cardCount(G) + pk.cnt > S.capacity(G) + (G.t < DAY_LEN * 0.6 ? 3 : 0)) continue;
      const c = S.buyI(G, p, k, home.x + (rand() - 0.5) * 200, home.y + (p === 0 ? 120 : -120));
      if (c) { B.lastBuy = G.st.time; B.acts++; return true; }
    }
    return false;
  }
  function sellJunk(G, force) {
    const junk = ["bone", "nugget", "scale", "hide", "map"];
    const over = S.cardCount(G) - S.capacity(G);
    // лишняя природа (больше трёх одинаковых) — убрать, если тесно
    if (over > -4) {
      const cnt = {}; for (const id in G.cards) { const c = G.cards[id]; if (CARDS[c.k].c === "nature" && !c.dn && !c.up && free(G, c) && CARDS[c.k].v === 0) (cnt[c.k] || (cnt[c.k] = [])).push(c); }
      for (const k in cnt) if (cnt[k].length > 3) { const c = cnt[k][cnt[k].length - 1]; return move(G, c.id, -1, c.x, c.y + 300, "discard " + k); }
    }
    for (const id in G.cards) {
      const c = G.cards[id];
      if (c.dn || !free(G, c) || c.rc) continue;
      const cs = S.chain(G, c);
      if (!cs.every((q) => q.k === c.k)) continue;
      const isJ = junk.indexOf(c.k) >= 0 && !(c.k === "hide" && hasK(G, "smithy")) && !(c.k === "map" && !G.open.mountains);
      if (isJ || (force && CARDS[c.k].v != null && !S.isPerson(c.k) && CARDS[c.k].c !== "build" && CARDS[c.k].c !== "site" && over > 0 && ["stone", "wood", "berry", "apple", "fiber", "clay", "coal", "mushroom", "bone"].indexOf(c.k) >= 0)) {
        const top = cs[cs.length - 1];
        return move(G, top.id, -1, c.x, c.y + 400, "sell " + c.k);
      }
    }
    return false;
  }
  // разобрать брошенные смешанные стопки и лишнее на мосту
  function cleanup(G) {
    const plans = new Set(); if (G._plans) for (const q in G._plans) if (G._plans[q]) plans.add(G._plans[q]);
    for (const id in G.cards) {
      const r = G.cards[id];
      if (r.dn || !r.up || !free(G, r) || r.rc || plans.has(r.id)) continue;
      const cs = S.chain(G, r);
      const site = CARDS[r.k].c === "site";
      if (site) {
        const rid = "b_" + (G.bridge + 1);
        if (G.bridge >= 5 || stackOk(G, r, rid)) continue;
        const top = cs[cs.length - 1];
        if (S.isPerson(top.k)) { if (top.o !== p) continue; return move(G, top.id, 0, r.x + 140, r.y + 260, "unsite"); }
        return move(G, top.id, 0, r.x - 140, r.y + 260, "unsite");
      }
      if (cs.some((q) => S.isPerson(q.k) || ["build", "site", "nature", "place", "pack"].indexOf(CARDS[q.k].c) >= 0)) continue;
      if (new Set(cs.map((q) => q.k)).size < 2) continue;
      if ((r.idle = (r.idle || 0) + 1) < 3) continue;          // даём время достроить
      const top = cs[cs.length - 1];
      const same = piles(G, top.k).filter((q) => q.r !== r && q.n < 6);
      if (same.length) return move(G, top.id, nearest(same.map((q) => q.r), r).id, 0, 0, "tidy");
      return move(G, top.id, 0, r.x + 100, r.y + 40, "tidy");
    }
    return false;
  }
  // монет нет, работы нет — продаём то, что не нужно стройкам
  function liquidate(G, dem) {
    const cheapest = Math.min(...PACKS.filter((q) => !S.packLocked(G, q)).map((q) => S.packCost(G, q, p)));
    if (S.coins(G) >= cheapest) return false;
    const keep = Object.assign({}, dem, { relic: 1, crystal: 2, iron: 2, map: G.open.mountains ? 0 : 1, lantern: 1, sword: 3, bow: 3, spear: 3, armor: 2 });
    let best = null, bv = -1;
    for (const id in G.cards) {
      const c = G.cards[id];
      if (c.dn || !free(G, c) || c.rc) continue;
      const cs = S.chain(G, c);
      if (!cs.every((q) => q.k === c.k)) continue;
      const d = CARDS[c.k]; if (d.v == null || d.v <= 0 || ["build", "nature", "place"].indexOf(d.c) >= 0) continue;
      if (d.c === "food" && S.foodSafe(G) < S.foodNeed(G) + 6) continue;
      const extra = avail(G, c.k) - (keep[c.k] || 0); if (extra <= 0) continue;
      const v = d.v * Math.min(extra, cs.length);
      if (v > bv) { bv = v; best = { c, n: Math.min(extra, cs.length), cs }; }
    }
    if (!best) return false;
    const top = best.cs[best.cs.length - best.n];
    return move(G, top.id, -1, best.c.x, best.c.y + 400, "liquidate " + best.c.k);
  }
  function openPacks(G) {
    for (const id in G.cards) { const c = G.cards[id]; if (CARDS[c.k].c === "pack" && !c.drag && (c.o === p || G.st.time - (c.bt || 0) > 4 || !good)) { if (!c.bt) { c.bt = G.st.time; if (c.o !== p) continue; } S.openI(G, p, c.id); B.acts++; return true; } }
    return false;
  }

  function decide(G) {
    if (G.ph === "hold") return sellJunk(G, true);
    if (openPacks(G)) return true;
    if (good) { if (combat(G)) return true; } else if (rand() < 0.4 && combat(G)) return true;
    if (good && equip(G)) return true;
    const fp = foodPlan(G);
    let ws = idle(G);
    if (good) {
      if (cook(G)) return true;
      if (fp.short < 2 && ws.length && gatherFood(G, ws)) return true;
      if (B.plan && stepPlan(G)) return true;
      const gl = goals(G);
      for (const rid of gl) {
        if (rid === "b_" + (G.bridge + 1)) {
          const site = Object.values(G.cards).find((c) => CARDS[c.k].c === "site");
          if (site && !site.rc && canAfford(G, rid) && stackOk(G, site, rid)) { B.plan = { rid, anchor: site.id }; if (stepPlan(G)) return true; continue; }
          if (site && !site.rc && stackOk(G, site, rid) && S.chain(G, site).length > 1) { B.plan = { rid, anchor: site.id }; if (stepPlan(G)) return true; }
          continue;
        }
        if (!known(G, rid)) continue;
        if (canAfford(G, rid) && startPlan(G, rid)) return true;
      }
      if (shop(G)) return true;
      ws = idle(G);
      if (!ws.length) { if (cleanup(G)) return true; return sellJunk(G, false); }
      if (fp.short < 6 && gatherFood(G, ws)) return true;
      if (breed(G, ws)) return true;
      if (work(G, ws, demand(G, gl))) return true;
      if (fp.short < 14 && gatherFood(G, ws)) return true;
      if (cleanup(G)) return true;
      if (explore(G, ws)) return true;
      if (liquidate(G, demand(G, gl))) return true;
      if (sellJunk(G, false)) return true;
      if (S.cardCount(G) < S.capacity(G) - 6 && work(G, ws, { wood: 3, stone: 3, plank: 2, fiber: 2 })) return true;
      return false;
    }
    // небрежный бот: что-то случайное
    const r = rand();
    if (r < 0.15 && shop(G)) return true;
    if (!ws.length) return false;
    if (r < 0.35) return gatherFood(G, ws);
    if (r < 0.55) return explore(G, ws);
    if (r < 0.75) { if (!G.kn.r_hut || hasK(G, "hut")) return work(G, ws, { wood: 2, stone: 2 }); return startPlan(G, "r_hut"); }
    if (r < 0.85 && canAfford(G, "b_" + (G.bridge + 1))) { const site = Object.values(G.cards).find((c) => CARDS[c.k].c === "site"); if (site) { B.plan = { rid: "b_" + (G.bridge + 1), anchor: site.id }; return stepPlan(G); } }
    return work(G, ws, { wood: 3, stone: 2, fiber: 1 });
  }

  B.tick = function (G, dt) {
    if (G.lost) return;
    if (B.busy) { tickHand(G, dt); return; }
    B.cd -= dt;
    if (B.cd > 0) return;
    let did = false;
    PC = {};
    try { did = decide(G); } catch (e) { if (opt.debug) console.error(e); B.plan = null; }
    PC = null;
    B.cd = did ? think() : think() + (good ? 0.4 : 1);
    if (!B.busy) B.hand = null;
    (G._plans || (G._plans = {}))[p] = B.plan ? B.plan.anchor : 0;
  };
  B.reset = function () { B.busy = null; B.plan = null; };
  return B;
}
