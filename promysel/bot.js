// «Промысел» — бот-игрок (соперник в «друг против друга», напарник во «вместе», и он же гоняет баланс).
// Бот не жульничает: только выбирает, куда идти, и «держит джойстик». Ловить, носить и платить его заставляет
// та же самая близость к местам, что и человека (sim.proximityOps).
import { cosCost, upgMax, gearOf, gearCost, bigStage, canAd, adCost, canMgr, mgrCost, safeCost, layoutOf, padVisible, padCost, accepts, capOf, inZone, via, hyp, itemPrice, canHire, hireCost, crewCost, applyOp } from "./sim.js";
import { UPG } from "./data.js";
import { IT, ITEMS } from "./data.js";

const bigNeeds = (G, it) => { const s = bigStage(G); return !!(s && s.it === it && s.got < s.need) || !!(G.con && G.con.ac && !G.con.end && G.con.it === it && G.con.got < G.con.n); };
export function makeBot(pi, opt) {
  opt = opt || {};
  const skill = opt.skill || "good";
  const B = { pi, task: null, tt: 0, think: 0, stuck: 0, lx: 0, lz: 0, wob: (opt.seed || 1) % 7, react: skill === "easy" ? 0.9 : skill === "hard" ? 0.15 : 0.4, tick };
  return B;
  function zoneOf(G, t) {
    const e = layoutOf(G).E[t.e];
    if (t.k === "pad") return e.zpad;
    if (t.k === "hire") return e.zin;
    if (t.k === "cash") return e.zcash;
    if (t.k === "deliver") return e.zin;
    if (t.k === "pick") return e.zout;
    if (t.k === "fish") return e.zin;
    return null;
  }
  function choose(G) {
    const L = layoutOf(G), p = G.pl[pi], team = p.team, cap = capOf(G, pi);
    const mine = L.E.filter((e) => e.team === team || G.mode !== "vs");
    // 1) площадка, на которую хватает денег
    let pad = -1, pc = 1e18;
    for (const e of mine) {
      if (!padVisible(G, e.i)) continue;
      const c = padCost(G, e.i) - G.e[e.i].p, w = c * (e.k === "upg" ? (e.def.u === "bag" ? 1.2 : 1.6) : e.k === "supg" ? 1.3 : e.k === "goal" ? 0.25 : 1);
      if (w < pc) { pc = w; pad = e.i; }
    }
    // наём в артели и улучшения артели — как площадки, только покупаются в доме артели
    const house = L.hire.find((h) => L.E[h].team === team || G.mode !== "vs");
    let hireT = null;
    if (house != null) {
      for (const e of mine) { if (e.k !== "helper" || !canHire(G, e.i)) continue; const c = hireCost(G, e.i); if (c < pc) { pc = c; pad = -1; hireT = { k: "hire", e: house, h: e.i, c }; } }
      for (const u of ["crew", "crewspd"]) { if (G.upg[team][u] >= upgMax(G, u) || !G.hp.some((h) => h.team === team)) continue; const c = crewCost(G, team, u), w = c * 1.6; if (w < pc) { pc = w; pad = -1; hireT = { k: "hire", e: house, u, c }; } }
      // управляющий цехом и сейф — когда цех уже обставлен помощниками
      if (G.mode !== "vs") {
        for (const e of mine) { if (!canMgr(G, e.i) || !G.hp.some((h) => L.E[h.e].from === e.i)) continue; const c = mgrCost(G, e.i), w = c * 1.5; if (w < pc) { pc = w; pad = -1; hireT = { k: "hire", e: house, op: ["g", house, e.i], c }; } }
        // сейфа больше нет — выручку собирает кассир (его нанимают в артели)
      }
    }
    // своя хижина: рюкзак, унты, сеть, длинные руки
    const hut = L.huts.find((h) => L.E[h].slot === pi);
    if (hut != null && G.t > 40) for (const u of ["bag", "boots", "net", "reach"]) { if ((gearOf(G, pi)[u] || 0) >= upgMax(G, u)) continue; const c = gearCost(G, pi, u), w = c * (u === "bag" ? 1.2 : u === "reach" ? 2.2 : 1.6); if (w < pc) { pc = w; pad = -1; hireT = { k: "hire", e: hut, op: ["y", hut, u], c }; } }
    if (hut != null && G.t > 40 && G.mode !== "vs") for (const u of ["dog", "ride"]) { const c = cosCost(G, pi, u); if (c <= 0) continue; const w = c * 1.5; if (w < pc) { pc = w; pad = -1; hireT = { k: "hire", e: hut, op: ["y", hut, u], c }; } }
    // реклама: вывеска — как улучшение; листовки и глашатай — когда товара на прилавках много
    const adsE = L.ads.find((h) => L.E[h].team === team || G.mode !== "vs");
    if (adsE != null && G.t > 60) {
      const stock = mine.reduce((a, e) => a + (e.k === "stall" && G.e[e.i].o ? G.e[e.i].sh : 0), 0);
      for (const k of ["sign", "fl", "cr"]) {
        if (!canAd(G, team, k)) continue; const c = adCost(G, team, k);
        if (k !== "sign" && (stock < 16 || G.money[team] < c * 4)) continue;     // листовки и глашатай — только когда товара много и деньги лишние
        const w = c * (k === "sign" ? 1.3 : 3); if (w < pc) { pc = w; pad = -1; hireT = { k: "hire", e: adsE, op: ["ad", adsE, k], c }; }
      }
    }
    if (hireT && G.money[team] >= hireT.c) return hireT;
    const padNeed = pad >= 0 ? padCost(G, pad) - G.e[pad].p : hireT ? hireT.c : 1e18;
    if (pad >= 0 && G.money[team] >= padNeed) return { k: "pad", e: pad };
    // 2) несём то, что в руках
    if (p.st.length) {
      let best = -1, bs = -1e9;
      for (const e of mine) {
        if (!e.zin || e.k === "spot" || !G.e[e.i].o) continue;
        let ok = false; for (const it of p.st) if (accepts(G, e.i, it)) { ok = true; break; }
        if (!ok) continue;
        const s = G.e[e.i];
        let sc = -hyp(e.zin.x - p.x, e.zin.z - p.z) * 0.6;
        if (e.k === "stall") sc += 8 - s.sh * 0.8 + s.q.length * 1.5;
        if (e.k === "proc") sc += 6 - Math.min(...s.ib) * 0.7;
        if (e.k === "board") sc += 40;
        if (e.k === "dock") sc += 5;
        if (sc > bs) { bs = sc; best = e.i; }
      }
      if (best >= 0 && (p.st.length >= cap * 0.8 || !freeWork(G, p, cap))) return { k: "deliver", e: best };
      if (best < 0 && p.st.length >= cap) { const c = cashTask(G, mine, p, 0); if (c) return c; return { k: "wait" }; }
    }
    // большой заказ судна — важнее, чем собирать выручку впрок
    if ((bigStage(G) || (G.con && G.con.ac && !G.con.end)) && G.mode !== "vs") { const fw = freeWork(G, p, cap); if (fw && (fw.big || fw.bigFish)) return fw; }
    // 3) выручка: если не хватает на площадку или её много скопилось
    const ct = cashTask(G, mine, p, (pad >= 0 || hireT) && G.money[team] + cashSum(G, mine) >= padNeed ? 0.01 : 25 * (G.mode === "vs" ? 1 : 1));
    if (ct) return ct;
    return freeWork(G, p, cap) || (p.st.length ? { k: "deliver", e: -1 } : { k: "wait" });
  }
  function cashSum(G, mine) { let s = 0; for (const e of mine) if (e.zcash && G.e[e.i].o) s += G.e[e.i].cash || 0; return s; }
  function cashTask(G, mine, p, min) {
    let best = -1, bs = -1e9;
    for (const e of mine) { if (!e.zcash || !G.e[e.i].o) continue; const c = G.e[e.i].cash || 0; if (c < Math.max(0.01, min)) continue; const sc = c - hyp(e.zcash.x - p.x, e.zcash.z - p.z) * 2; if (sc > bs) { bs = sc; best = e.i; } }
    return best >= 0 ? { k: "cash", e: best } : null;
  }
  // взять готовое или ловить
  function freeWork(G, p, cap) {
    const L = layoutOf(G), team = p.team;
    if (p.st.length >= cap) return null;
    let best = null, bs = -1e9;
    for (const e of L.E) {
      if ((e.team !== team && G.mode === "vs") || !G.e[e.i].o) continue;
      const s = G.e[e.i];
      // большой заказ: встаём у цеха, который делает нужное, и ждём готового
      if ((e.k === "proc" || e.k === "gen") && !(B.bigCool > 0) && bigNeeds(G, e.k === "gen" ? e.item : e.rec.out) && (s.ob > 0 || e.k === "gen" || s.ib.every((n) => n > 0))) { const sc = 500 + Math.min(s.ob, cap) - hyp(e.zout.x - p.x, e.zout.z - p.z) * 0.4; if (sc > bs) { bs = sc; best = { k: "pick", e: e.i, big: 1 }; } }
      if ((e.k === "proc" || e.k === "gen") && s.ob > 0) {
        const it = e.k === "gen" ? e.item : e.rec.out;
        if (!hasDest(G, L, team, it)) continue;
        const v = (itemPrice(G, it) || 4) * (G.con && !G.con.end && G.con.it === it ? 3 : 1) * (bigNeeds(G, it) ? 3 : 1);
        const sc = Math.min(s.ob, cap) * v * 0.3 + (e.k === "gen" ? 2 : 0) - hyp(e.zout.x - p.x, e.zout.z - p.z) * 0.5 + (s.ob > 12 ? 6 : 0);
        if (sc > bs) { bs = sc; best = { k: "pick", e: e.i }; }
      }
      if (e.k === "spot" && s.f > 2) {
        if (!hasDest(G, L, team, e.item)) continue;
        const need = needOf(G, L, team, e.item);
        const bf = bigNeeds(G, e.item), sc = 3 + need * 1.5 - hyp(e.zin.x - p.x, e.zin.z - p.z) * 0.35 + (e.item === IT.salmon ? 2 : 0) + (bf ? 500 : 0);
        if (sc > bs) { bs = sc; best = { k: "fish", e: e.i, bigFish: bf ? 1 : 0 }; }
      }
    }
    return best;
  }
  function hasDest(G, L, team, it) { for (const e of L.E) if ((e.team === team || G.mode !== "vs") && G.e[e.i].o && e.zin && e.k !== "spot" && accepts(G, e.i, it)) return true; return false; }
  function needOf(G, L, team, it) {
    let n = 0;
    for (const e of L.E) { if ((e.team !== team && G.mode === "vs") || !G.e[e.i].o) continue; const s = G.e[e.i];
      if (e.k === "proc") { const k = e.rec.in.indexOf(it); if (k >= 0) n += Math.max(0, 6 - s.ib[k]) / 3; }
      if (e.k === "stall" && e.item === it) n += Math.max(0, 5 - s.sh) / 2 + s.q.length * 0.3; }
    return n;
  }
  function done(G, t) {
    const p = G.pl[pi], s = t.e >= 0 ? G.e[t.e] : null, cap = capOf(G, pi);
    if (t.k === "pad") return !padVisible(G, t.e) || G.money[p.team] < 1;
    if (t.k === "hire") return t.op ? G.money[p.team] < t.c || t.done : t.h != null ? !canHire(G, t.h) || G.money[p.team] < hireCost(G, t.h) : G.money[p.team] < crewCost(G, p.team, t.u);
    if (t.k === "cash") return !(s.cash > 0);
    if (t.k === "deliver") { if (t.e < 0) return true; for (const it of p.st) if (accepts(G, t.e, it)) return false; return true; }
    if (t.k === "pick") { const end = p.st.length >= cap || (s.ob <= 0 && !(t.big && B.tt < 25)) || (t.big && p.st.length >= 4); if (end && t.big && s.ob <= 0 && !p.st.length) B.bigCool = 30; return end; }
    if (t.k === "fish") return p.st.length >= cap || s.f <= 0;
    return true;
  }
  // вызывать каждый кадр: возвращает джойстик {x, z}
  function tick(G, dt) {
    const p = G.pl[pi];
    B.tt += dt; B.think -= dt; if (B.bigCool > 0) B.bigCool -= dt;
    if (!B.task || B.think <= 0 || (B.arr && done(G, B.task))) {
      if (!B.task || B.arr && done(G, B.task) || B.think <= 0) {
        const nt = choose(G);
        if (!B.task || nt.k !== B.task.k || nt.e !== B.task.e) { B.task = nt; B.arr = false; B.tt = 0; } else if (nt.k === "hire") B.task = nt;
        B.think = B.arr ? 0.25 : 1.2 + B.react;
      }
    }
    const t = B.task; if (!t || t.k === "wait" || t.e < 0) return { x: 0, z: 0 };
    const z = zoneOf(G, t); if (!z) return { x: 0, z: 0 };
    // стоим в зоне — ждём (ловим, кладём, платим)
    const inside = inZone(p, z, -0.35);
    if (inside) {
      if (!B.arr) { B.arr = true; B.think = 0.2; }
      // в артели бот «нажимает» карточку
      if (t.k === "hire" && (B.ht = (B.ht || 0) + dt) > 0.6) { B.ht = 0; if (applyOp(G, "p" + pi, t.op || (t.h != null ? ["h", t.e, t.h] : ["u", t.e, t.u])) && t.op) t.done = 1; B.think = 0; }
      return { x: 0, z: 0 };
    }
    if (B.arr && inZone(p, z, -0.1)) return { x: 0, z: 0 };
    B.arr = false;
    let tx = z.x + Math.sin(pi * 2.3 + B.wob) * z.r * 0.3, tz = z.z + Math.cos(pi * 2.3) * z.r * 0.2;
    const w = via(G, p.x, p.z, tx, tz); if (w) { tx = w[0]; tz = w[1]; }
    // застрял — шаг в сторону
    B.stuck = hyp(p.x - B.lx, p.z - B.lz) < 0.02 ? B.stuck + dt : 0; B.lx = p.x; B.lz = p.z;
    let dx = tx - p.x, dz = tz - p.z; const d = hyp(dx, dz) || 1;
    if (B.stuck > 0.5) { const a = Math.atan2(dx, dz) + (Math.sin(B.tt * 3) > 0 ? 1.4 : -1.4); dx = Math.sin(a); dz = Math.cos(a); if (B.stuck > 1.6) { B.stuck = 0; B.think = 0; } return { x: dx, z: dz }; }
    const k = Math.min(1, d / 0.6);
    return { x: dx / d * k, z: dz / d * k };
  }
}
export { ITEMS };
