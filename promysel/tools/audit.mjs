// Сквозная проверка «Промысла» от первой секунды до последней покупки (боты играют сами).
// На каждом шаге развития проверяем правила:
//  1) заказ — только на товар, у которого открыта вся цепочка и есть куда сдавать; и он выполним за срок;
//  2) у каждого открытого цеха вход и выход есть и стоят спереди (со стороны камеры), готовому товару есть куда идти;
//  3) у каждого входа и выхода каждого цеха есть помощник, и он появляется сразу или вскоре после цеха;
//  4) улучшения сгруппированы: «Снаряжение» — в одном ряду, «Артель» — в одном ряду, ряды рядом;
//  5) площадка не лежит под открытой постройкой и не налезает на зоны; покупатели не ждут того, что нельзя сделать.
// Запуск из корня репозитория: node --experimental-default-type=module promysel/tools/audit.mjs [coop|solo|vs]
import * as S from "../sim.js";
import { makeBot } from "../bot.js";
import { ITEMS, UPG } from "../data.js";

const mode = process.argv[2] || "coop";
const G = S.newGame({ mode, seed: 11, bay: +(process.argv[3] || 0) });
const L = S.layout(mode);
const errs = new Set();
const bad = (m) => { if (!errs.has(m)) { errs.add(m); console.log("! " + m); } };
const nm = (e) => (e.def.n || e.id) + (L.teams > 1 ? `[${e.team}]` : "");

/* ---------- статика: помощники на каждый вход и выход, группы улучшений ---------- */
const anc = (e, seen = new Set()) => { for (const a of e.after) if (!seen.has(a)) { seen.add(a); anc(L.E[a], seen); } return seen; };
const depthTo = (e, target) => { let q = [[e.i, 0]], seen = new Set(); while (q.length) { const [i, d] = q.shift(); if (i === target) return d; for (const a of L.E[i].after) if (!seen.has(a)) { seen.add(a); q.push([a, d + 1]); } } return 99; };
const prodOf = (e) => (e.k === "spot" || e.k === "gen" ? e.item : e.k === "proc" ? e.rec.out : -1);
for (const e of L.E) {
  if (e.k !== "proc" && e.k !== "gen") continue;
  const helpers = L.E.filter((h) => h.k === "helper" && h.team === e.team);
  const outH = helpers.filter((h) => h.from === e.i);
  if (!outH.length) bad(`нет помощника, который уносит готовое: ${nm(e)}`);
  if (outH.length) { const d = Math.min(...outH.map((h) => depthTo(h, e.i))); if (d > 3) bad(`помощник для выхода ${nm(e)} появляется слишком поздно (через ${d} покупок)`); }
  if (e.k === "proc") for (const it of e.rec.in) {
    const inH = helpers.filter((h) => (h.to || []).includes(e.i) && prodOf(L.E[h.from]) === it);
    if (!inH.length) bad(`нет помощника, который подносит «${ITEMS[it].n}» в ${nm(e)}`);
    else if (Math.min(...inH.map((h) => depthTo(h, e.i))) > 3) bad(`подносчик «${ITEMS[it].n}» в ${nm(e)} появляется слишком поздно`);
  }
}
for (const team of [...Array(L.teams).keys()]) {
  const grp = (us) => L.E.filter((e) => e.k === "upg" && e.team === team && us.includes(e.def.u));
  const gear = grp(["bag", "boots", "net"]), crew = grp(["crew", "crewspd"]);
  const row = (g, n) => { if (!g.length) return null; const zs = g.map((e) => e.zpad.z), xs = g.map((e) => e.zpad.x); if (Math.max(...zs) - Math.min(...zs) > 0.3) bad(`«${n}» не в одном ряду`); if (Math.max(...xs) - Math.min(...xs) > 2.4 * (g.length - 1) + 0.1) bad(`«${n}» разбросано`); return { x: xs.reduce((a, b) => a + b) / xs.length, z: zs[0] }; };
  const a = row(gear, "Снаряжение"), b = row(crew, "Артель");
  if (a && b && Math.hypot(a.x - b.x, a.z - b.z) > 4) bad("«Снаряжение» и «Артель» далеко друг от друга");
  if (a && Math.hypot(a.x - L.start[0] * (team ? -1 : 1), a.z - L.start[1]) > 9) bad("«Снаряжение» далеко от старта");
}

/* ---------- игра ---------- */
const bots = G.pl.map((_, i) => makeBot(i, { seed: 3 + i }));
let steps = 0, conN = 0, lastChk = 0;
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
function check(why) {
  // 1) заказ
  if (G.con && !G.con.end) {
    const it = G.con.it;
    if (!S.chainOK(G, 0, it)) bad(`[${why}] заказ на «${ITEMS[it].n}», а цепочка не открыта`);
    if (!S.hasDest(G, 0, it)) bad(`[${why}] заказ на «${ITEMS[it].n}», а сдать некуда`);
  }
  for (const e of L.E) {
    const s = G.e[e.i];
    // 2) входы/выходы спереди, сбыт открыт
    if (s.o && (e.k === "proc" || e.k === "gen")) {
      if (e.k === "proc" && !(e.zin && e.zin.z > e.z + e.d / 2)) bad(`вход ${nm(e)} не спереди`);
      if (!(e.zout && e.zout.z > e.z + e.d / 2)) bad(`выход ${nm(e)} не спереди`);
      if (!S.hasDest(G, e.team, prodOf(e))) bad(`[${why}] ${nm(e)}: готовое некуда нести`);
    }
    if (s.o && e.k === "spot" && !S.hasDest(G, e.team, e.item)) bad(`[${why}] улов «${ITEMS[e.item].n}» некуда нести`);
    // 5) площадка под постройкой
    if (S.padVisible(G, e.i)) for (const o of L.E) {
      if (!o.box || !G.e[o.i].o || o === e) continue; const b = o.box, p = e.zpad;
      const cx = Math.max(b[0], Math.min(p.x, b[2])), cz = Math.max(b[1], Math.min(p.z, b[3]));
      if (Math.hypot(p.x - cx, p.z - cz) < p.r * 0.6) bad(`[${why}] площадка «${e.def.n || e.id}» лежит под «${o.def.n}»`);
    }
  }
  for (const c of G.cu) if (c.s < 4 && ![0, 1].slice(0, G.teams).some((t) => S.chainOK(G, t, c.w))) bad(`[${why}] покупатель ждёт «${ITEMS[c.w].n}», которое нельзя сделать`);
}
check("старт");
const dt = 1 / 20;
for (let t = 0; t < 4 * 3600; t += dt) {
  for (let i = 0; i < bots.length; i++) { const j = bots[i].tick(G, dt); S.movePlayer(G, i, j.x, j.z, dt); }
  S.step(G, dt);
  for (const e of G.ev) {
    if (e.t === "open") { steps++; check(nm(L.E[e.e])); }
    if (e.t === "contract" && e.s === "new") {
      conN++; const c = G.con, rate = S.chainRate(G, 0, c.it);
      if (c.n > c.T * rate * 0.5) bad(`заказ «${ITEMS[c.it].n}» ×${c.n} за ${c.T} с невыполним при выработке ${rate.toFixed(2)}/с`);
      check("заказ");
    }
  }
  G.ev.length = 0;
  if (G.t - lastChk > 2) { lastChk = G.t; check(fmt(G.t)); }
  if (mode !== "vs") { G.money[0] += G.t > 600 ? 2 : 0; } else G.money[0] += 0;
  if (G.done >= 0 || G.winner >= 0) break;
}
console.log(`${mode}: ${fmt(G.t)}, покупок ${steps}, заказов ${conN} (выполнено ${G.cdone}), открыто ${S.progress(G, 0).o}/${S.progress(G, 0).n}, итог: ${G.done >= 0 || G.winner >= 0 ? "дошли до маяка" : "НЕ дошли до маяка"}`);
if (!(G.done >= 0 || G.winner >= 0)) bad("за 4 часа не дошли до маяка");
console.log(errs.size ? `НАРУШЕНИЙ: ${errs.size}` : "правила соблюдены");
process.exit(errs.size ? 1 : 0);
