// Забег ботами по всем островам подряд: маяк → знак (1 из 3) → следующая бухта с переносом артели и всего снаряжения.
// Печатает время каждой бухты, покупки к 10-й минуте и что дали знаки. Сравнение: тот же забег без знаков.
// Запуск из корня репозитория: node --experimental-default-type=module promysel/tools/campaign.mjs [coop|solo] [знаки: pick|none] [сид]
import * as S from "../sim.js";
import { makeBot } from "../bot.js";
import { PERKS, BAYS, anchorsFor } from "../data.js";

const mode = process.argv[2] || "coop", how = process.argv[3] || "pick", seed = +(process.argv[4] || 3);
let rs = seed * 9301 + 49297; const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
let perks = {}, upg = null, gear = null, anchors = 0, total = 0;
const pref = ["s_pre", "e_start", "h_spd", "p_cap", "e_cheap", "s_speed", "h_cap", "p_spd", "h_free", "e_tip", "p_dbl", "h_shelf", "e_order", "p_wade", "p_mag"];
for (let bay = 0; bay < BAYS.length; bay++) {
  const G = S.newGame({ mode, seed: seed * 100 + bay, bay, perks, upg, gear });
  const bots = G.pl.map((_, i) => makeBot(i, { seed: seed + i }));
  const L = S.layoutOf(G); let n10 = 0, buys = 0;
  const dt = 1 / 30;
  for (; G.t < 3 * 3600;) {
    for (let i = 0; i < bots.length; i++) { const j = bots[i].tick(G, dt); S.movePlayer(G, i, j.x, j.z, dt); }
    S.step(G, dt);
    for (const e of G.ev) if (e.t === "open" || e.t === "upg" || e.t === "supg") { buys++; if (G.t < 600) n10++; }
    G.ev.length = 0;
    if (G.done >= 0) break;
  }
  total += G.t; anchors += anchorsFor(bay, G.stars);
  let pick = "";
  if (how === "pick") {
    const pool = PERKS.filter((p) => (perks[p.id] || 0) < p.max), three = [];
    while (three.length < 3 && pool.length) three.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
    pick = three.sort((a, b) => pref.indexOf(a) - pref.indexOf(b))[0]; perks[pick] = (perks[pick] || 0) + 1;
  }
  const cr = S.carryOf(G); upg = cr.upg; gear = cr.gear;
  console.log(`бухта ${bay + 1} «${BAYS[bay].n}»: маяк ${G.done >= 0 ? fmt(G.t) : "НЕТ"}, покупок ${buys} (к 10-й мин ${n10}), заказы ${G.cdone}/${G.cdone + G.cfail}, якорей +${anchorsFor(bay, G.stars)}${pick ? ", знак: " + PERKS.find((p) => p.id === pick).n : ""}`);
}
console.log(`всего ${fmt(total)}, якорей ${anchors}, знаки: ${JSON.stringify(perks)}`);
