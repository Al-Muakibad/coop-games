// Остаться или плыть дальше? Боты проходят бухту до маяка, дальше два пути на 60 минут:
//  A — остаться и докупать всё в этой бухте;  B — уплыть в следующую (с тем, что переносится).
// Плыть дальше должно быть выгоднее. Запуск из корня: node promysel/tools/stay.mjs [бухта 0..2] [минут]
import * as S from "../sim.js";
import { makeBot } from "../bot.js";
const bay = +(process.argv[2] || 0), mins = +(process.argv[3] || 60), sd = +(process.argv[4] || 31);
const play = (G, bots, sec, stopAtGoal) => { const dt = 1 / 30; const t0 = G.t; let e0 = G.earned[0];
  for (; G.t - t0 < sec;) { for (let i = 0; i < bots.length; i++) { const j = bots[i].tick(G, dt); S.movePlayer(G, i, j.x, j.z, dt); } S.step(G, dt); G.ev.length = 0; if (stopAtGoal && G.done >= 0) break; }
  return G.earned[0] - e0; };
const G = S.newGame({ mode: "coop", seed: sd, bay });
const bots = G.pl.map((_, i) => makeBot(i, { seed: 3 + i }));
play(G, bots, 4 * 3600, true);
console.log(`бухта ${bay + 1}: маяк на ${(G.t / 60).toFixed(1)} мин`);
const snap = S.serialize(G);
// A: остаться
const A = S.deserialize(snap); A.done = -1; const ba = A.pl.map((_, i) => makeBot(i, { seed: 3 + i }));
const ea = play(A, ba, mins * 60, false);
// B: уплыть (как в игре: артель и снаряжение переносятся)
const carry = S.carryOf(G);
const B = S.newGame(Object.assign({ mode: "coop", seed: sd + 1, bay: bay + 1, perks: G.perks }, carry)); const bb = B.pl.map((_, i) => makeBot(i, { seed: 3 + i }));
const eb = play(B, bb, mins * 60, false);
console.log(`за ${mins} мин: остаться — ${Math.round(ea)}, уплыть — ${Math.round(eb)} (${eb > ea ? "уплыть выгоднее ✓" : "остаться выгоднее ✗"})`);
process.exit(eb > ea ? 0 : 1);
