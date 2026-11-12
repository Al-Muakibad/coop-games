// Симуляция баланса «Промысла»: боты играют без графики, печатаем, на какой минуте открывается каждая площадка.
// Запуск из корня репозитория:  node --experimental-default-type=module promysel/tools/balance.mjs [solo|coop|vs] [минут] [сид]
// Игра в браузер этот файл не грузит.
import * as S from "../sim.js";
import { makeBot } from "../bot.js";
import { UPG } from "../data.js";

const mode = process.argv[2] || "solo";
const minutes = +(process.argv[3] || 90);
const seed = +(process.argv[4] || 7);
const extra = process.argv[5] || "";
const G = S.newGame({ mode, seed, diff: 1, goal: "light" });
const L = S.layout(mode);
const bots = G.pl.map((_, i) => makeBot(i, { seed: seed + i, skill: extra || "good" }));
const dt = 1 / 30;
const log = [];
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
let lastE = [0, 0], lastT = 0;
const rows = [];
for (let t = 0; t < minutes * 60; t += dt) {
  for (let i = 0; i < bots.length; i++) { const j = bots[i].tick(G, dt); S.movePlayer(G, i, j.x, j.z, dt); }
  S.step(G, dt);
  for (const e of G.ev) {
    if (e.t === "open" || e.t === "upg") {
      const en = L.E[e.e];
      log.push({ t: G.t, team: e.team, what: e.t === "upg" ? `${UPG[e.u].n} ур.${e.lv}` : en.def.n || en.id, cost: 0 });
    }
    if (e.t === "goal") log.push({ t: G.t, team: e.team, what: "*** МАЯК / ПОБЕДА ***" });
    if (e.t === "contract" && e.s !== "new") log.push({ t: G.t, team: 0, what: e.s === "done" ? `заказ выполнен +${e.amt}` : "заказ провален" });
  }
  G.ev.length = 0;
  if (G.t - lastT >= 60) { rows.push(`${fmt(G.t)}  доход/мин: ${G.earned.slice(0, G.teams).map((v, k) => Math.round(v - lastE[k])).join(" / ")}  деньги: ${G.money.slice(0, G.teams).map(Math.round).join(" / ")}  помощников: ${G.hp.length}  покупателей: ${G.cu.length} обслужено: ${G.served} ушли злыми: ${G.lost}`); lastE = G.earned.slice(); lastT = G.t; }
  if (G.done >= 0 && mode !== "vs" && !G._stop) G._stop = G.t + 5;
  if (G._stop && G.t > G._stop) break;
  if (mode === "vs" && G.winner >= 0) break;
}
for (const l of log) console.log(`${fmt(l.t)}  ${G.teams > 1 ? "[" + l.team + "] " : ""}${l.what}`);
console.log("\n" + rows.join("\n"));
console.log(`\nитог: ${fmt(G.t)}, заработано ${G.earned.slice(0, G.teams).map(Math.round).join(" / ")}, открыто ${S.progress(G, 0).o}/${S.progress(G, 0).n}${G.teams > 1 ? " и " + S.progress(G, 1).o : ""}, заказов ${G.cdone}/${G.cdone + G.cfail}, победитель ${G.winner}`);
function anc(e, i, seen) { seen = seen || new Set(); for (const a of e.after) { if (a === i) return true; if (seen.has(a)) continue; seen.add(a); if (anc(L.E[a], i, seen)) return true; } return false; }
// пересечения зон: площадка не должна лежать на зоне другого места
const zones = [];
for (const e of L.E) { if (!e.def.free && e.k !== "spot" && e.k !== "board") zones.push({ n: e.id + "#pad", z: e.zpad, t: e.team }); for (const k of ["zin", "zout", "zcash"]) if (e[k]) zones.push({ n: e.id + "." + k, z: e[k], t: e.team, pad: 0 }); }
for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
  const a = zones[i], b = zones[j]; if (!a.n.includes("#pad") && !b.n.includes("#pad")) continue;
  if (a.n.split(/[#.]/)[0] === b.n.split(/[#.]/)[0] && a.t === b.t) continue;
  // площадка исчезает раньше, чем появится второе место (оно открывается после неё) — не страшно
  const ea = L.E.find((e) => e.id === a.n.split(/[#.]/)[0] && e.team === a.t), eb = L.E.find((e) => e.id === b.n.split(/[#.]/)[0] && e.team === b.t);
  if (anc(eb, ea.i) || anc(ea, eb.i)) continue;
  const d = Math.hypot(a.z.x - b.z.x, a.z.z - b.z.z); if (d < a.z.r + b.z.r - 0.05) console.log(`! пересечение: ${a.n}[${a.t}] и ${b.n}[${b.t}] (${d.toFixed(2)} м)`);
}
