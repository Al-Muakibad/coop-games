// «Промысел» — сеть на двоих поверх shared/net.js (Net.open, 1 на 1). Хозяин считает мир.
// Хозяин → гость: «s» — снимок всего мира 10 раз в секунду (по прямому каналу; через брокер — 5 раз), «ev» — важные события надёжно.
// Гость → хозяин: «p» — где он стоит (20 раз в секунду), «o» — его действия (поймал, положил, взял, заплатил, забрал выручку) с номером.
// Гость применяет свои действия сразу у себя, а пришедший снимок «догоняет»: всё, что хозяин ещё не подтвердил, гость применяет поверх снова.
import * as S from "./sim.js";

const R = (v) => Math.round(v * 100) / 100;
const st2s = (st) => String.fromCharCode(...st.map((i) => 97 + i));
const s2st = (s) => { const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i) - 97); return a; };
const MAJOR = { open: 1, upg: 1, goal: 1, contract: 1, ship: 1, switch: 1, angry: 1 };

export function encode(G) {
  return {
    t: R(G.t), m: G.money.map(R), er: G.earned.map(R), sp: G.spent.map(R), u: G.upg, bv: G.bv, nid: G.nid, rs: G.rs,
    e: G.e.map((s) => { const o = Object.assign({}, s); if (o.tm != null) o.tm = R(o.tm); if (o.rt != null) o.rt = R(o.rt); if (o.st != null) o.st = R(o.st); if (o.lt != null) o.lt = R(o.lt); if (o.cash != null) o.cash = R(o.cash); if (o.p) o.p = R(o.p); return o; }),
    pl: G.pl.map((p) => [R(p.x), R(p.z), R(p.dir), p.mv ? 1 : 0, st2s(p.st), p.team]),
    hp: G.hp.map((h) => [h.e, R(h.x), R(h.z), R(h.dir), h.mv ? 1 : 0, h.s, h.tg, st2s(h.st), R(h.tm)]),
    cu: G.cu.map((c) => [c.id, R(c.x), R(c.z), R(c.dir), c.s, c.w, c.n, c.g, c.st, c.mood, c.sk, c.mv ? 1 : 0, Math.round(c.pat), Math.round(c.pm)]),
    con: G.con, conT: R(G.conT), done: G.done, winner: G.winner, stars: G.stars, cdone: G.cdone, cfail: G.cfail, served: G.served, lost: G.lost, paused: G.paused || 0, tEnd: G.tEnd,
  };
}
// head — постоянные поля (режим, бухта, сложность…), их шлём в «go»
export function head(G) { return { v: G.v, mode: G.mode, bay: G.bay, diff: G.diff, goal: G.goal, teams: G.teams, perks: G.perks, cid: G.cid }; }
export function decode(h, s, prev) {
  const G = prev && prev.cid === h.cid ? prev : { ev: [] };
  Object.assign(G, h);
  G.t = s.t; G.money = s.m; G.earned = s.er; G.spent = s.sp; G.upg = s.u; G.bv = s.bv; G.nid = s.nid; G.rs = s.rs;
  G.e = s.e;
  G.pl = s.pl.map((a, i) => { const o = (prev && prev.pl && prev.pl[i]) || {}; return Object.assign(o, { x: a[0], z: a[1], dir: a[2], mv: a[3], st: s2st(a[4]), team: a[5] }); });
  G.hp = s.hp.map((a) => ({ e: a[0], x: a[1], z: a[2], dir: a[3], mv: a[4], s: a[5], tg: a[6], st: s2st(a[7]), tm: a[8], team: S.layout(h.mode).E[a[0]].team, xt: 0 }));
  G.cu = s.cu.map((a) => ({ id: a[0], x: a[1], z: a[2], dir: a[3], s: a[4], w: a[5], n: a[6], g: a[7], st: a[8], mood: a[9], sk: a[10], mv: a[11], pat: a[12], pm: a[13] }));
  G.con = s.con; G.conT = s.conT; G.done = s.done; G.winner = s.winner; G.stars = s.stars; G.cdone = s.cdone; G.cfail = s.cfail; G.served = s.served; G.lost = s.lost; G.paused = s.paused; G.tEnd = s.tEnd;
  G.ev = G.ev || [];
  if (!G.rate) G.rate = 0; if (!G.rateAcc) G.rateAcc = 0;
  return G;
}

/* ---------- хозяин ---------- */
export class HostSync {
  constructor(room, api) {
    this.room = room; this.api = api;       // api: {G(), gi() — номер игрока гостя, peer(on,p), hello(d)}
    this.seq = 0; this.t = 0; this.ack = 0; this.evq = []; this.stat = { tx: 0, bytes: 0, rej: 0 };
    room.on("p", (d) => { const G = api.G(); if (!G || !d) return; const p = G.pl[api.gi()]; if (!p) return; this.pos(p, d); });
    room.on("o", (d) => {
      const G = api.G(); if (!G || !d || !d.ops) return;
      const gi = api.gi(), p = G.pl[gi]; if (!p) return;
      if (d.x != null) this.pos(p, d);
      for (const it of d.ops) {
        if (it.q <= this.ack) continue;
        this.ack = it.q;
        if (G.paused || G.winner >= 0) continue;
        if (!zoneOk(G, gi, it.op)) { this.stat.rej++; continue; }
        if (!S.applyOp(G, "p" + gi, it.op)) this.stat.rej++;
      }
    });
    room.on("hi", (d) => api.hello && api.hello(d || {}));
    room.on("peer", (p) => api.peer && api.peer(true, p));
    room.on("peer-left", (p) => api.peer && api.peer(false, p));
    room.on("resync", () => this.go());
  }
  pos(p, d) {
    // гость сам ведёт своего человека; хозяин только не даёт уйти сквозь стены далеко
    if (typeof d.x !== "number" || typeof d.z !== "number") return;
    const L = S.layout(this.api.G().mode);
    p.x = Math.max(L.MAP.w[0], Math.min(L.MAP.w[1], d.x)); p.z = Math.max(L.MAP.d[0], Math.min(L.fz, d.z));
    if (typeof d.d === "number") p.dir = d.d; p.mv = d.m || 0;
  }
  // полный старт для гостя: постоянные поля + снимок
  go(extra) { const G = this.api.G(); if (!G || !this.room.peer) return; this.room.send("go", Object.assign({ h: head(G), s: Object.assign(encode(G), { k: this.ack, n: ++this.seq }), gi: this.api.gi() }, extra || {})); }
  events(list) { for (const e of list) { if (MAJOR[e.t]) this.room.send("ev", e); else if (this.evq.length < 120) this.evq.push(e); } }
  tick(dt) {
    if (!this.room.peer) { this.evq.length = 0; return; }
    this.t += dt;
    const per = this.room.link === "p2p" ? 0.1 : 0.2;
    if (this.t < per) return;
    this.t = 0;
    const G = this.api.G(); if (!G) return;
    const s = encode(G); s.k = this.ack; s.n = ++this.seq; if (this.evq.length) { s.ev = this.evq; this.evq = []; }
    this.stat.tx++;
    this.room.sendFast("s", s);
  }
}
// гость стоит там, где делает действие? (с запасом на задержку)
function zoneOk(G, pi, op) {
  const L = S.layout(G.mode), e = L.E[op[1]], p = G.pl[pi]; if (!e) return false;
  const z = op[0] === "c" ? e.zin : op[0] === "d" ? e.zin : op[0] === "p" ? e.zout : op[0] === "m" ? e.zpad : op[0] === "k" ? e.zcash : null;
  if (!z) return false;
  return Math.hypot(p.x - z.x, p.z - z.z) < z.r + 1.6;
}

/* ---------- гость ---------- */
export class GuestSync {
  constructor(room, api) {
    this.room = room; this.api = api;        // api: {go(G, gi), snap(G), events(list), peer(on), local() → {x,z,dir,mv}}
    this.G = null; this.h = null; this.n = 0; this.q = 0; this.pending = []; this.lastRx = Date.now(); this.stat = { rx: 0, gaps: 0, replays: 0 }; this.pt = 0; this.batch = [];
    room.on("go", (d) => { if (!d || !d.h) return; this.h = d.h; this.n = d.s.n || 0; this.lastRx = Date.now(); this.pending = this.pending.filter((p) => p.q > (d.s.k || 0)); this.G = decode(d.h, d.s, null); this.replay(); api.go && api.go(this.G, d.gi == null ? 1 : d.gi, d); });
    room.on("s", (d) => {
      this.lastRx = Date.now(); this.stat.rx++;
      if (!this.h || !d || d.n <= this.n) return;
      if (d.n > this.n + 1) this.stat.gaps++;
      this.n = d.n;
      this.pending = this.pending.filter((p) => p.q > (d.k || 0));
      const loc = api.local && api.local();
      this.G = decode(this.h, d, this.G);
      if (loc) { const p = this.G.pl[api.gi()]; if (p) { p.x = loc.x; p.z = loc.z; p.dir = loc.dir; p.mv = loc.mv; } }
      this.replay();
      if (d.ev && api.events) api.events(d.ev);
      api.snap && api.snap(this.G);
    });
    room.on("ev", (e) => api.events && api.events([e]));
    room.on("end", (d) => api.end && api.end(d));
    room.on("peer", (p) => { api.peer && api.peer(true, p); room.send("hi", { name: api.name ? api.name() : "" }); });
    room.on("peer-left", (p) => api.peer && api.peer(false, p));
    room.on("resync", () => room.send("hi", { name: api.name ? api.name() : "", re: 1 }));
  }
  // свои неподтверждённые действия — поверх свежего снимка
  replay() { const gi = this.api.gi(); const ev = this.G.ev; const n0 = ev.length; for (const p of this.pending) { S.applyOp(this.G, "p" + gi, p.op); this.stat.replays++; } ev.length = n0; }
  silence() { return (Date.now() - this.lastRx) / 1000; }
  // действие гостя: уже применено у себя — запоминаем и шлём пачкой в конце кадра
  op(op) { const it = { q: ++this.q, op }; this.pending.push(it); this.batch.push(it); if (this.pending.length > 400) this.pending.splice(0, this.pending.length - 400); }
  flush(dt, me) {
    this.pt += dt;
    if (this.batch.length) { this.room.send("o", { ops: this.batch, x: R(me.x), z: R(me.z) }); this.batch = []; }
    // неподтверждённое дольше 2 с — повторяем (могло потеряться при переподключении)
    if (this.pending.length && this.pending[0].sent && Date.now() - this.pending[0].sent > 2000) { this.room.send("o", { ops: this.pending.slice(0, 60), x: R(me.x), z: R(me.z) }); this.pending[0].sent = Date.now(); }
    else if (this.pending.length && !this.pending[0].sent) this.pending[0].sent = Date.now();
    if (this.pt >= 0.05) { this.pt = 0; this.room.sendFast("p", { x: R(me.x), z: R(me.z), d: R(me.dir), m: me.mv ? 1 : 0 }); }
  }
}
