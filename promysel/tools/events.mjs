// Помощники и события бухт: в каждой бухте открываем всё, боты играют, события идут подряд (буран, ход лосося, отлив, ярмарка;
// в «против» — смесь). После каждого события проверяем: каждый помощник за 40 с снова что-то сделал (взял/поймал/отдал),
// никто не стоит «на ходу» дольше 8 с, сторож почти не срабатывает. Запуск из корня: node promysel/tools/events.mjs
import * as S from "../sim.js";
import { makeBot } from "../bot.js";
const runs = [["coop", 0], ["coop", 1], ["coop", 2], ["coop", 3], ["vs", 0]];
let bad = 0;
for (const [mode, bay] of runs) {
  const G = S.newGame({ mode, seed: 8, bay }); const L = S.layoutOf(G);
  for (const e of L.E) if (e.k !== "goal" && e.k !== "upg" && e.k !== "supg") S.forceOpen(G, e.i);
  G.money = [1e6, 1e6]; G.bigN = 99;
  const bots = G.pl.map((_, i) => makeBot(i, { seed: 4 + i })); const dt = 1 / 30;
  const play = (sec) => { for (let t = 0; t < sec; t += dt) { for (let i = 0; i < bots.length; i++) { const j = bots[i].tick(G, dt); S.movePlayer(G, i, j.x, j.z, dt); } S.step(G, dt); G.ev.length = 0; } };
  play(60);
  const fix = () => { if (G.winner >= 0 || G.done >= 0) { G.winner = -1; G.done = -1; } };
  const res = [];
  for (let n = 0; n < 4; n++) {
    S.forceEvent(G); play(1);
    const k = G.evt && G.evt.k; let guard = 0;
    while (G.evt && G.evt.ph !== 0 && guard++ < 200) { play(1); fix(); }      // событие идёт до конца
    const tEnd = G.t, wd0 = G.wdN || 0; for (let i = 0; i < 40; i++) { play(1); fix(); }
    // бездельник: 40 с ничего не сделал, хотя у его источника есть что взять (а не просто нечего носить)
    const has = (e) => (e.k === "spot" ? G.e[e.i].f >= 5 : (G.e[e.i].ob || 0) >= 3);
    const lazy = G.hp.filter((h) => L.E[h.e].def.role !== "cashier" && !((h.lo || 0) > tEnd) && has(L.E[L.E[h.e].from]) && !(h.s === 2 && h.st.length) && !(G.con && L.E[L.E[h.e].from].rec && G.con.it === L.E[L.E[h.e].from].rec.out));      // запас для заказа у доски — помощник ждёт нарочно
    const names = lazy.map((h) => L.E[h.e].id + (process.env.DBG ? JSON.stringify({ s: h.s, st: h.st.length, tm: Math.round(h.tm), wd: Math.round(h.wd), x: +h.x.toFixed(1), z: +h.z.toFixed(1), con: G.con && G.con.it, ob: G.e[L.E[h.e].from].ob }) : ""));
    res.push(`${k}: после — бездельников ${lazy.length}${names.length ? " (" + names.join(", ") + ")" : ""}, сторож ${(G.wdN || 0) - wd0}`);
    if (lazy.length) bad++;
  }
  console.log(`${mode} бухта ${bay + 1} (помощников ${G.hp.length}): ${res.join(" | ")}`);
}
console.log(bad ? `ПРОБЛЕМ: ${bad}` : "после каждого события все помощники снова работают");
process.exit(bad ? 1 : 0);
