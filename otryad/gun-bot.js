// Боты для режима «Пушка» (автотесты баланса и демо в меню).
// skilled — целится в лучшие ворота с учётом их движения и не перегревает ствол;
// human — как skilled, но с промахами (разброс прицела) и задержкой реакции, как у живого игрока;
// random — крутит ствол наугад и жмёт без остановки.
import { CFG } from "./gun-sim.js";

// во что попадёт боец, вылетевший под углом a (без наводки), и чего это стоит
export function pathValue(sim, a) {
  const C = CFG.cannon, S = CFG.soldier, hw = CFG.field.hw - S.r;
  let x = Math.sin(a) * C.muzzle, z = Math.cos(a) * C.muzzle, vx = Math.sin(a) * S.speed, vz = Math.cos(a) * S.speed, t = 0, val = 1;
  for (const r of sim.rows) {
    const dt = (r.z - z) / vz; t += dt; x += vx * dt; z = r.z;
    // отскок от бортов
    for (let k = 0; k < 3; k++) { if (x > hw) { x = 2 * hw - x; vx = -vx; } else if (x < -hw) { x = -2 * hw - x; vx = -vx; } }
    const pos = sim.rowPosAt(r, t);
    for (const g of r.gates) {
      const gx = pos + g.off;
      if (Math.abs(x - gx) > g.w / 2 - 0.15) continue;
      if (g.k === "x") val *= g.N;
      else if (g.k === "+") val += g.pool >= 2 ? CFG.gate.plusPer * Math.min(1, g.pool / 12) : 0;
      else if (g.k === "-") { if (g.pool >= 1) return { val: 0, x, t }; }
      else if (g.k === "#") { if (!g.broken) return { val: 0, x, t }; }
      break;
    }
  }
  return { val, x, t };
}

export function makeBot(kind, seed) {
  let s = seed || 7, nextT = 0, aimT = 0;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return function control(sim, dt) {
    const C = CFG.cannon;
    if (kind === "random") {
      aimT -= dt;
      if (aimT <= 0) { aimT = 0.4 + rnd() * 0.6; sim.aimTarget = (rnd() * 2 - 1) * C.aimMax; }
      sim.aim += Math.max(-dt * 2.5, Math.min(dt * 2.5, sim.aimTarget - sim.aim));
      sim.firing = true;
      return;
    }
    // skilled / human
    const human = kind === "human";
    nextT -= dt;
    if (nextT <= 0) {
      nextT = human ? 0.3 + rnd() * 0.25 : 0.08;
      const th = sim.threat();
      let best = sim.aim, bs = -1;
      for (let a = -C.aimMax; a <= C.aimMax + 1e-6; a += 0.025) {
        const p = pathValue(sim, a);
        let sc = p.val;
        if (th) { const ex = Math.sin(a) * (th.z || 30); sc *= 1 + 0.25 * Math.max(0, 1 - Math.abs(ex - th.x) / 6); }
        sc -= Math.abs(a - sim.aim) * 0.05;      // не дёргать ствол без нужды
        if (sc > bs) { bs = sc; best = a; }
      }
      sim.aimTarget = best + (human ? (rnd() * 2 - 1) * 0.09 : 0); sim.bestVal = bs;
    }
    // ствол поворачивается с ограниченной скоростью — как палец
    sim.aim += Math.max(-dt * 3, Math.min(dt * 3, sim.aimTarget - sim.aim));
    const danger = sim.enemies.some((e) => e.z < 8);
    sim.firing = !sim.locked && (sim.heat < 86 || danger) && (sim.enemies.length > 0 || sim.towers.length > 0 || sim.wave < sim.lv.waves.length);
  };
}
