// Сквозная проверка помощников во всех бухтах и режимах: боты играют, денег вдоволь, открываем всё.
// Проверяем каждый кадр:
//  1) помощник никогда не стоит в воде (кроме отмели у места лова) и не «под настилом» — на мостках/причале он на досках;
//  2) помощник, который идёт (к месту или с грузом), не стоит на месте дольше 5 с;
//  3) у каждого помощника все точки маршрута достижимы от дверей артели (заливка сетки).
// Запуск из корня репозитория: node --experimental-default-type=module promysel/tools/sweep.mjs
import * as S from "../sim.js";
import { makeBot } from "../bot.js";

const runs = [["coop", 0], ["coop", 1], ["coop", 2], ["coop", 3], ["coop", 4], ["coop", 5], ["coop", 6], ["coop", 7], ["solo", 0], ["vs", 0], ["coop", 0, 1]];
let total = 0;
for (const [mode, bay, old] of runs) {
  const G = S.newGame({ mode, seed: 5, bay, v: old ? 1 : 2 });
  const L = S.layoutOf(G);
  const bots = G.pl.map((_, i) => makeBot(i, { seed: 9 + i }));
  const errs = new Map(); const bad = (k, m) => { if (!errs.has(k)) errs.set(k, m); };
  const track = new Map();
  let wetT = 0, stuckN = 0, maxStill = 0;
  const dt = 1 / 30;
  for (; G.t < 3600;) {
    for (let i = 0; i < bots.length; i++) { const j = bots[i].tick(G, dt); S.movePlayer(G, i, j.x, j.z, dt); }
    S.step(G, dt); G.ev.length = 0;
    for (let t = 0; t < G.teams; t++) G.money[t] += 2 + G.t / 20;
    for (let hi = 0; hi < G.hp.length; hi++) {
      const h = G.hp[hi], e = L.E[h.e];
      // 1) вода
      if (S.wet(G, h.x, h.z)) { wetT += dt; bad("wet" + e.id, `${e.id}: в воде у (${h.x.toFixed(1)}, ${h.z.toFixed(1)})`); }
      // 2) застрял
      let tr = track.get(hi); if (!tr) { tr = { x: h.x, z: h.z, t: G.t }; track.set(hi, tr); }
      const walking = h.mv && (h.s === 0 || h.s === 2 || e.def.role === "cashier");
      if (!walking || Math.hypot(h.x - tr.x, h.z - tr.z) > 0.1) { tr.x = h.x; tr.z = h.z; tr.t = G.t; }
      else { const still = G.t - tr.t; maxStill = Math.max(maxStill, still); if (still > 5) { stuckN++; bad("stuck" + e.id, `${e.id}: идёт, но стоит ${still.toFixed(1)} с у (${h.x.toFixed(1)}, ${h.z.toFixed(1)}), состояние ${h.s}`); tr.t = G.t; } }
    }
    if (L.E.every((e) => G.e[e.i].o || e.k === "upg" || e.k === "supg" || e.k === "goal" || (e.def.coopOnly && mode === "vs")) && G.t > 600) break;
    if (G.done >= 0 || G.winner >= 0) { G.done = -1; G.winner = -1; }
  }
  // 3) маршруты: заливка от дверей артели
  const M = L.MAP, STEP = 0.2, nx = Math.ceil((M.w[1] - M.w[0]) / STEP), nz = Math.ceil((L.fz - M.d[0]) / STEP);
  for (const hidx of L.hire) {
    const house = L.E[hidx], seen = new Uint8Array(nx * nz), q = [], idx = (i, j) => j * nx + i, wx = (i) => M.w[0] + i * STEP, wz = (j) => M.d[0] + j * STEP;
    const si = Math.round((house.zin.x - M.w[0]) / STEP), sj = Math.round((house.zin.z - M.d[0]) / STEP); seen[idx(si, sj)] = 1; q.push([si, sj]);
    while (q.length) { const [i, j] = q.pop(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz || seen[idx(a, b)] || !S.canStand(G, wx(a), wz(b))) continue; seen[idx(a, b)] = 1; q.push([a, b]); } }
    const reach = (z) => { for (let i = Math.floor((z.x - z.r * 0.7 - M.w[0]) / STEP); i <= Math.ceil((z.x + z.r * 0.7 - M.w[0]) / STEP); i++) for (let j = Math.floor((z.z - z.r * 0.7 - M.d[0]) / STEP); j <= Math.ceil((z.z + z.r * 0.7 - M.d[0]) / STEP); j++) if (i >= 0 && j >= 0 && i < nx && j < nz && seen[idx(i, j)]) return true; return false; };
    for (const e of L.E) {
      if (e.k !== "helper" || e.team !== house.team || e.def.role === "cashier") continue;
      const src = L.E[e.from], zs = [[src.k === "spot" ? src.zin : src.zout, src.id]]; for (const t of e.to) zs.push([L.E[t].zin, L.E[t].id]);
      for (const [z, id] of zs) if (!reach(z)) bad("route" + e.id + id, `${e.id}: не дойти до ${id}`);
    }
  }
  const nm = `${mode}${old ? " (старая карта)" : ""} бухта ${bay + 1}`;
  console.log(`${nm}: ${Math.round(G.t / 60)} мин, помощников ${G.hp.length}, в воде ${wetT.toFixed(1)} с, застреваний ${stuckN}, дольше всего стоял на ходу ${maxStill.toFixed(1)} с${errs.size ? "" : " — OK"}`);
  for (const m of errs.values()) console.log("  ! " + m);
  total += errs.size;
}
console.log(total ? `ПРОБЛЕМ: ${total}` : "все помощники ходят по суше и доскам, не застревают, все маршруты достижимы");
process.exit(total ? 1 : 0);
