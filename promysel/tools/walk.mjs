// Проверка проходимости «Промысла»: на каждом шаге развития (после каждой покупки) —
// 1) заливка сетки 0,2 м от точки старта: до каждой зоны (вход/выход цеха, прилавок, выручка, площадка, место лова) можно дойти;
// 2) прогулки «как человек» (джойстик прямо на цель + обход зданий) между случайными парами зон — никто не застревает;
// 3) зоны разных мест, открытые одновременно, не налезают друг на друга.
// Запуск из корня репозитория: node --experimental-default-type=module promysel/tools/walk.mjs [coop|vs]
import * as S from "../sim.js";
import { makeBot } from "../bot.js";

const mode = process.argv[2] || "coop";
const G0 = S.newGame({ mode, seed: 3 });
const L = S.layout(mode);
const bots = G0.pl.map((_, i) => makeBot(i, { seed: 5 + i }));
const stages = [];
const snap = (G, why) => stages.push({ why, g: S.deserialize(S.serialize(G)) });
snap(G0, "старт");
// быстро прокручиваем развитие ботами; щедро добавляем денег, чтобы пройти всё дерево
for (let t = 0; t < 60 * 60 * 3; t += 1 / 20) {
  for (let i = 0; i < bots.length; i++) { const j = bots[i].tick(G0, 1 / 20); S.movePlayer(G0, i, j.x, j.z, 1 / 20); }
  S.step(G0, 1 / 20);
  for (const e of G0.ev) if (e.t === "open") snap(G0, L.E[e.e].def.n || L.E[e.e].id);
  G0.ev.length = 0;
  G0.money[0] += 3 + G0.t / 60; G0.money[1] += 3 + G0.t / 60;
  if (L.E.every((e) => e.k === "upg" || e.k === "supg" || G0.e[e.i].o || e.def.coopOnly)) break;
}
console.log("не открыто:", L.E.filter((e) => !G0.e[e.i].o && e.k !== "upg" && e.k !== "supg").map((e) => e.id + (S.padVisible(G0, e.i) ? "(видна " + S.padCost(G0, e.i) + ")" : "")).join(" "), "деньги", G0.money.map(Math.round));
console.log(`режим ${mode}: шагов развития ${stages.length}, открыто ${G0.e.filter((s) => s.o).length}/${L.E.length}`);

const STEP = 0.2, M = L.MAP;
let fails = 0;
function zonesOf(G) {
  const z = [];
  for (const e of L.E) {
    const s = G.e[e.i];
    if (S.padVisible(G, e.i)) z.push({ n: (e.def.n || e.id) + " (площадка)", z: e.zpad, e });
    if (!s.o) continue;
    for (const k of ["zin", "zout", "zcash"]) if (e[k]) z.push({ n: (e.def.n || e.id) + "." + k, z: e[k], e });
  }
  return z;
}
for (const st of stages) {
  const G = st.g;
  // 1) заливка
  const nx = Math.ceil((M.w[1] - M.w[0]) / STEP), nz = Math.ceil((L.fz - M.d[0]) / STEP);
  const seen = new Uint8Array(nx * nz), q = [];
  const idx = (i, j) => j * nx + i, wx = (i) => M.w[0] + i * STEP, wz = (j) => M.d[0] + j * STEP;
  for (const p of G.pl) { const i = Math.round((p.x - M.w[0]) / STEP), j = Math.round((p.z - M.d[0]) / STEP); if (S.canStand(G, wx(i), wz(j))) { seen[idx(i, j)] = 1; q.push([i, j]); } }
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz || seen[idx(a, b)]) continue;
      if (!S.canStand(G, wx(a), wz(b))) continue; seen[idx(a, b)] = 1; q.push([a, b]);
    }
  }
  const zs = zonesOf(G);
  for (const z of zs) {
    let ok = false; const r = z.z.r * 0.7;
    for (let i = Math.floor((z.z.x - r - M.w[0]) / STEP); i <= Math.ceil((z.z.x + r - M.w[0]) / STEP) && !ok; i++)
      for (let j = Math.floor((z.z.z - r - M.d[0]) / STEP); j <= Math.ceil((z.z.z + r - M.d[0]) / STEP) && !ok; j++)
        if (i >= 0 && j >= 0 && i < nx && j < nz && seen[idx(i, j)] && Math.hypot(wx(i) - z.z.x, wz(j) - z.z.z) <= r) ok = true;
    if (!ok) { fails++; console.log(`! [${st.why}] не дойти: ${z.n} [${z.e.team}]`); }
  }
  // 3) наложение зон разных мест
  for (let a = 0; a < zs.length; a++) for (let b = a + 1; b < zs.length; b++) {
    if (zs[a].e === zs[b].e || zs[a].e.team !== zs[b].e.team) continue;
    const d = Math.hypot(zs[a].z.x - zs[b].z.x, zs[a].z.z - zs[b].z.z);
    if (d < zs[a].z.r + zs[b].z.r - 0.1) { fails++; console.log(`! [${st.why}] зоны налезают: ${zs[a].n} и ${zs[b].n} (${d.toFixed(2)} м)`); }
  }
  // 2) прогулки
  const pts = zs.filter((z) => z.e.team === 0).map((z) => z.z);
  let walks = 0, stuck = 0;
  for (let k = 0; k < Math.min(30, pts.length * 2); k++) {
    const A = pts[(k * 7) % pts.length], B = pts[(k * 13 + 5) % pts.length]; if (A === B) continue;
    const W = S.deserialize(S.serialize(G)); W.cu = []; W.hp = [];
    const p = W.pl[0]; p.x = A.x; p.z = A.z; S.movePlayer(W, 0, 0, 0.0001, 0.01);
    let t = 0, ok = false;
    for (; t < 30; t += 1 / 30) {
      if (Math.hypot(p.x - B.x, p.z - B.z) < B.r * 0.8) { ok = true; break; }
      let tx = B.x, tz = B.z; const w = S.via(W, p.x, p.z, tx, tz); if (w) { tx = w[0]; tz = w[1]; }
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
      S.movePlayer(W, 0, dx / d, dz / d, 1 / 30);
    }
    walks++;
    if (!ok) { stuck++; console.log(`! [${st.why}] прогулка не удалась: (${A.x.toFixed(1)},${A.z.toFixed(1)}) → (${B.x.toFixed(1)},${B.z.toFixed(1)}), застрял у (${p.x.toFixed(1)},${p.z.toFixed(1)})`); }
  }
  fails += stuck;
}
console.log(fails ? `ПРОБЛЕМ: ${fails}` : "проходимость: всё в порядке");
process.exit(fails ? 1 : 0);
