// Боты для режима «Пушка» (автотесты баланса и демо в меню).
// v2: пушка ездит по рельсу, бойцы летят прямо. Бот выбирает, КУДА встать.
// skilled — встаёт под лучшие ворота с учётом их движения, отстреливает ящики, не перегревает ствол, чемпиона бережёт на великанов;
// human — как skilled, но с промахами по месту и задержкой реакции, как у живого игрока;
// random — ездит наугад и жмёт без остановки, чемпиона выпускает сразу.
import { CFG } from "./gun-sim.js";

// во что попадёт боец, вылетевший с места x, и чего это стоит (0 — сгорит в «−»/щите или уйдёт в ящик)
export function pathValue(sim, x) {
  const C = CFG.cannon, S = CFG.soldier;
  let z = C.muzzle, t = 0, val = 1, crate = 0;
  const events = [];
  for (const c of sim.crates) if (c.wait <= 0 && c.hp > 0 && Math.abs(x - c.x) < c.r + S.r) events.push({ z: c.z, c });
  for (const r of sim.rows) events.push({ z: r.z, r });
  events.sort((a, b) => a.z - b.z);
  for (const e of events) {
    const dt = (e.z - z) / S.speed; t += dt; z = e.z;
    if (e.c) { crate = 1; return { val: 0, crate, x, t, c: e.c }; }
    const r = e.r, pos = sim.rowPosAt(r, t);
    for (const g of r.gates) {
      const gx = pos + g.off;
      if (Math.abs(x - gx) > g.w / 2 - 0.15) continue;
      if (g.k === "x") val *= g.N;
      else if (g.k === "+") val += g.pool >= 2 ? CFG.gate.plusPer * Math.min(1, g.pool / 12) : 0;
      else if (g.k === "M") val *= 1.15;       // громила ценнее пятерых только против щитов — почти нейтрально
      else if (g.k === "-") { if (g.pool >= 1) return { val: 0, x, t }; }
      else if (g.k === "#") { if (!g.broken) return { val: 0, x, t }; }
      break;
    }
  }
  return { val, x, t };
}
// ценность награды из ящика (в «бойцах за выстрел»)
const GIVE_V = { rapid: 4, barrel: 6, champ: 5, gate: 5, brutes: 4, heal: 3 };

export function makeBot(kind, seed) {
  let s = seed || 7, nextT = 0, moveT = 0;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return function control(sim, dt) {
    const C = CFG.cannon;
    if (kind === "random") {
      moveT -= dt;
      if (moveT <= 0) { moveT = 0.4 + rnd() * 0.8; sim.tx = (rnd() * 2 - 1) * C.rail; }
      sim.firing = true;
      if (sim.charged) sim.launchChamp();
      return;
    }
    // skilled / human
    const human = kind === "human";
    nextT -= dt;
    if (nextT <= 0) {
      nextT = human ? 0.3 + rnd() * 0.25 : 0.08;
      const th = sim.threat();
      let best = sim.x, bs = -1;
      for (let x = -C.rail; x <= C.rail + 1e-6; x += 0.25) {
        const p = pathValue(sim, x);
        let sc = p.val;
        if (p.c) { const left = p.c.hp / Math.max(1, sim.rate * sim.barrelsNow); sc = (GIVE_V[p.c.gives[p.c.gi % p.c.gives.length]] || 3) * (left < 6 ? 1.2 : 0.7); }
        if (th) { sc *= 1 + 0.3 * Math.max(0, 1 - Math.abs(x - th.x) / 5) * (th.z < 14 ? 2 : 1); }
        sc -= Math.abs(x - sim.x) * 0.04;        // не дёргаться без нужды
        if (sc > bs) { bs = sc; best = x; }
      }
      sim.tx = best + (human ? (rnd() * 2 - 1) * 0.7 : 0); sim.bestVal = bs;
      // чемпион: на великана/босса/толпу у пушки, или когда врагов много
      if (sim.charged) {
        const big = sim.enemies.some((e) => e.type === "giant" || e.type === "boss" || e.type === "tower") || sim.towers.length;
        const near = sim.enemies.filter((e) => e.z < 16).length;
        if (big || near > 12 || (human && rnd() < 0.3)) { sim.tx = th ? Math.max(-C.rail, Math.min(C.rail, th.x)) : sim.tx; sim.launchChamp(); }
      }
    }
    const danger = sim.enemies.some((e) => e.z < 8);
    sim.firing = !sim.locked && (sim.heat < 86 || danger || sim.rapidT > 0) && (sim.enemies.length > 0 || sim.towers.length > 0 || sim.wave < sim.lv.waves.length);
  };
}
