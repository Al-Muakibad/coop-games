// Выход из воды: в каждой бухте (и на карте «против», и на старой карте) встаём в каждую точку брода/мостков вдоль берега
// с шагом 0.5 м и ведём джойстик к суше. Если за 6 с игрок не вышел на сушу — «застрял». Запуск из корня: node promysel/tools/shore.mjs
import * as S from "../sim.js";
const runs = [["coop", 0], ["coop", 1], ["coop", 2], ["coop", 3], ["coop", 4], ["coop", 5], ["coop", 6], ["coop", 7], ["vs", 0], ["coop", 0, 1]];
let bad = 0, total = 0;
for (const [mode, bay, old] of runs) {
  for (const tide of [0, 1]) {
    const G = S.newGame({ mode, seed: 3, bay, v: old ? 1 : 2 }); const L = S.layoutOf(G);
    for (const e of L.E) if (e.k === "pier" || e.k === "dock") S.forceOpen(G, e.i);      // мостки и причал открыты
    if (tide) G.evt = { k: "tide", ph: 2, t: 99, n: 1 };
    const M = L.MAP, fails = [];
    for (let x = M.w[0] + 0.4; x <= M.w[1] - 0.4; x += 0.5) {
      const sh = S.shoreZ(L, x);
      // все точки на этой линии, где можно стоять в воде (брод, отмель, мостки) — берём каждые 0.5 м вглубь
      for (let z = sh - 0.1; z > M.d[0] + 0.5; z -= 0.5) {
        if (!S.canStand(G, x, z)) continue;
        if (z > sh + 0.5) continue;
        for (const [jx, jz] of [[0, 1], [0.7, 0.7], [-0.7, 0.7]]) {      // к суше: прямо и наискосок
          total++;
          const p = G.pl[0]; p.x = x; p.z = z; p.st = [];
          let ok = false;
          for (let t = 0; t < 6; t += 1 / 30) { S.movePlayer(G, 0, jx, jz, 1 / 30); if (p.z > S.shoreZ(L, p.x) + 0.6 || (p.x < M.w[0] + 0.5 || p.x > M.w[1] - 0.5) && p.z > S.shoreZ(L, p.x) - 0.1) { ok = true; break; } }
          if (!ok) fails.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) джойстик (${jx}, ${jz}) → застрял у (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
        }
      }
    }
    const nm = `${mode}${old ? " (старая карта)" : ""} бухта ${bay + 1}${tide ? ", отлив" : ""}`;
    console.log(`${nm}: ${fails.length ? "ЗАСТРЕВАНИЙ " + fails.length : "выход из воды везде"}`);
    for (const f of fails.slice(0, 6)) console.log("  ! " + f);
    bad += fails.length;
  }
}
console.log(bad ? `ПРОБЛЕМ: ${bad} из ${total}` : `все ${total} точек: из воды выходим за 6 с`);
process.exit(bad ? 1 : 0);
