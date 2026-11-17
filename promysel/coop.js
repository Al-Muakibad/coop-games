// «Промысел» — сеть на двоих поверх shared/net.js (Net.open, 1 на 1). Хозяин считает мир.
// Хозяин → гость: «s» — снимок всего мира 10 раз в секунду (по прямому каналу; через брокер — 5 раз), «ev» — важные события надёжно.
// Гость → хозяин: «p» — где он стоит (20 раз в секунду), «o» — его действия (поймал, положил, взял, заплатил, забрал выручку) с номером.
// Гость применяет свои действия сразу у себя, а пришедший снимок «догоняет»: всё, что хозяин ещё не подтвердил, гость применяет поверх снова.
import * as S from "./sim.js";

const R = (v) => Math.round(v * 100) / 100, R1 = (v) => Math.round(v * 10) / 10;
const st2s = (st) => String.fromCharCode(...st.map((i) => 97 + i));
const s2st = (s) => { const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i) - 97); return a; };
const MAJOR = { sail: 1, rare: 1, route: 1, routeon: 1, cos: 1, ad: 1, mgr: 1, safe: 1, auto: 1, open: 1, upg: 1, goal: 1, contract: 1, ship: 1, switch: 1, angry: 1, big: 1, bayev: 1, deco: 1 };

export function encode(G) {
  return {
    t: R(G.t), m: G.money.map(R), er: G.earned.map(R), sp: G.spent.map(R), u: G.upg, bv: G.bv, nid: G.nid, rs: G.rs,
    e: G.e.map((s) => { const o = Object.assign({}, s); if (o.tm != null) o.tm = R(o.tm); if (o.rt != null) o.rt = R(o.rt); if (o.st != null) o.st = R(o.st); if (o.lt != null) o.lt = R(o.lt); if (o.cash != null) o.cash = R(o.cash); if (o.p) o.p = R(o.p); return o; }),
    pl: G.pl.map((p) => [R(p.x), R(p.z), R(p.dir), p.mv ? 1 : 0, st2s(p.st), p.team, p.g || null, p.dg ? [R(p.dg.x), R(p.dg.z), R(p.dg.dir), p.dg.mv, p.dg.s] : 0, p.nc || 0, p.nk || 0]),
    hp: G.hp.map((h) => [h.e, R(h.x), R(h.z), R(h.dir), h.mv ? 1 : 0, h.s, h.tg, st2s(h.st), R(h.tm)]),
    cu: G.cu.map((c) => [c.id, R1(c.x), R1(c.z), c.mv ? R1(c.dir) : null, c.s, c.w, c.n, c.g, c.st, c.mood, c.sk, c.mv ? 1 : 0, 0, 0, c.vip || 0]),      // стоящим направление не шлём (гость оставляет прежнее), терпение гостю не нужно: меньше меняется между снимками
    nb: G.nbuy || 0, ads: G.ads || null, rep: G.rep || null, mgr: G.mgr || null, safe: G.safe || 0, fl: R(G.flow || 0), idl: Math.round(G.idle || 0), an: G.autoN || 0, ang: R(G.ang || 0), big: G.big, bn: G.bigN || 0, bs: G.bigS || 0, dc: G.deco || 0, evt: G.evt ? { k: G.evt.k, ph: G.evt.ph, t: R(G.evt.t), n: G.evt.n } : null, tr: G.traps || [], con: G.con, conT: R(G.conT), done: G.done, winner: G.winner, stars: G.stars, cdone: G.cdone, cfail: G.cfail, served: G.served, lost: G.lost, paused: G.paused || 0, tEnd: G.tEnd, nr: G.nrare || 0, ar: S.archSummary(G),
  };
}
// head — постоянные поля (режим, бухта, сложность…), их шлём в «go»
export function head(G) { return { v: G.v, mode: G.mode, bay: G.bay, lap: G.lap || 0, diff: G.diff, goal: G.goal, teams: G.teams, perks: G.perks, meta: G.meta || {}, cid: G.cid }; }
export function decode(h, s, prev) {
  const G = prev && prev.cid === h.cid ? prev : { ev: [] };
  Object.assign(G, h);
  G.t = s.t; G.money = s.m; G.earned = s.er; G.spent = s.sp; G.upg = s.u; G.bv = s.bv; G.nid = s.nid; G.rs = s.rs;
  G.e = s.e;
  G.pl = s.pl.map((a, i) => { const o = (prev && prev.pl && prev.pl[i]) || {}; return Object.assign(o, { x: a[0], z: a[1], dir: a[2], mv: a[3], st: s2st(a[4]), team: a[5], g: a[6] || o.g || { bag: 0, boots: 0, net: 0, reach: 0 }, dg: a[7] ? { x: a[7][0], z: a[7][1], dir: a[7][2], mv: a[7][3], s: a[7][4] } : null, nc: a[8] || 0, nk: a[9] || 0 }); });
  G.hp = s.hp.map((a) => ({ e: a[0], x: a[1], z: a[2], dir: a[3], mv: a[4], s: a[5], tg: a[6], st: s2st(a[7]), tm: a[8], team: S.layout(h.mode, h.bay, h.v).E[a[0]].team, xt: 0 }));
  const pd = prev && prev.cu ? new Map(prev.cu.map((c) => [c.id, c.dir])) : null;
  G.cu = s.cu.map((a) => ({ id: a[0], x: a[1], z: a[2], dir: a[3] != null ? a[3] : (pd && pd.get(a[0])) || 0, s: a[4], w: a[5], n: a[6], g: a[7], st: a[8], mood: a[9], sk: a[10], mv: a[11], pat: a[12], pm: a[13], vip: a[14] || 0 }));
  G.nbuy = s.nb || 0; G.ads = s.ads || null; G.rep = s.rep || null; G.mgr = s.mgr || null; G.safe = s.safe || 0; G.flow = s.fl || 0; G.idle = s.idl || 0; G.autoN = s.an || 0; G.ang = s.ang || 0; G.big = s.big || null; G.bigN = s.bn || 0; G.bigS = s.bs || 0; G.deco = s.dc || 0; G.evt = s.evt || null; G.traps = s.tr || []; G.con = s.con; G.conT = s.conT; G.done = s.done; G.winner = s.winner; G.stars = s.stars; G.cdone = s.cdone; G.cfail = s.cfail; G.served = s.served; G.lost = s.lost; G.paused = s.paused; G.tEnd = s.tEnd; G.nrare = s.nr || 0; G.gst = 1; G.ar = s.ar || null;
  G.ev = G.ev || [];
  if (!G.rate) G.rate = 0; if (!G.rateAcc) G.rateAcc = 0;
  return G;
}

/* ---------- дельты: ключевой снимок раз в 2 с, между ними — только то, что изменилось относительно него ----------
   Каждая дельта считается от ключевого снимка (а не от предыдущей дельты), поэтому потеря одной дельты ничего не ломает. */
function kfIndex(kf) { const str = {}; for (const k in kf) if (k !== "e" && k !== "cu") str[k] = JSON.stringify(kf[k]); const e = kf.e.map((x) => JSON.stringify(x)); const cu = new Map(kf.cu.map((r) => [r[0], JSON.stringify(r)])); return { str, e, cu }; }
export function makeDelta(full, kf, ix) {
  const d = { t: full.t, n: full.n, k: full.k, kb: kf.n, dl: 1 };
  for (const k in full) {
    if (k === "t" || k === "n" || k === "k" || k === "kf") continue;
    if (k === "e") { const ch = {}; let any = false; full.e.forEach((x, i) => { if (JSON.stringify(x) !== ix.e[i]) { ch[i] = x; any = true; } }); if (any || full.e.length !== kf.e.length) { d.e = ch; d.en = full.e.length; } continue; }
    if (k === "cu") { d.ci = full.cu.map((r) => r[0]); d.cu = full.cu.filter((r) => ix.cu.get(r[0]) !== JSON.stringify(r)); continue; }
    if (JSON.stringify(full[k]) !== ix.str[k]) d[k] = full[k];
  }
  return d;
}
export function applyDelta(d, kf) {
  const full = Object.assign({}, kf); delete full.kf;
  for (const k in d) if (k !== "e" && k !== "cu" && k !== "ci" && k !== "kb" && k !== "dl" && k !== "en") full[k] = d[k];
  if (d.e) { full.e = kf.e.slice(0, d.en); for (const i in d.e) full.e[+i] = d.e[i]; }
  if (d.ci) { const m = new Map(kf.cu.map((r) => [r[0], r])); for (const r of d.cu || []) m.set(r[0], r); full.cu = d.ci.map((id) => m.get(id)).filter(Boolean); }
  return full;
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
    room.on("kfreq", () => { this.kfWant = 1; });
  }
  pos(p, d) {
    // гость сам ведёт своего человека; хозяин только не даёт уйти сквозь стены далеко
    if (typeof d.x !== "number" || typeof d.z !== "number") return;
    const L = S.layoutOf(this.api.G());
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
    const s = encode(G); s.k = this.ack; s.n = ++this.seq;
    const now = Date.now();
    let out;
    if (!this.kf || now - this.kfAt > 2000 || this.kfWant) { s.kf = 1; this.kf = s; this.kfIx = kfIndex(s); this.kfAt = now; this.kfWant = 0; out = s; }
    else out = makeDelta(s, this.kf, this.kfIx);
    if (this.evq.length) { out.ev = this.evq; this.evq = []; }
    this.stat.tx++; const str = JSON.stringify(out); this.stat.bytes += str.length; if (out.kf) this.stat.kf = (this.stat.kf || 0) + 1;
    if (out.kf) this.room.send("s", out); else this.room.sendFast("s", out);      // ключевой — надёжно, дельты — быстро
  }
}
// гость стоит там, где делает действие? (с запасом на задержку)
function zoneOk(G, pi, op) {
  const L = S.layoutOf(G), p = G.pl[pi];
  if (op[0] === "t") { const tr = G.traps && G.traps[op[1]]; return !!tr && Math.hypot(p.x - tr.x, p.z - tr.z) < 2.6; }
  const e = L.E[op[1]]; if (!e) return false;
  const z = op[0] === "c" || op[0] === "d" || op[0] === "h" || op[0] === "u" || op[0] === "a" || op[0] === "ad" || op[0] === "g" || op[0] === "s" || op[0] === "y" ? e.zin : op[0] === "p" ? e.zout : op[0] === "m" ? e.zpad : op[0] === "k" ? e.zcash : null;
  if (!z) return false;
  return Math.hypot(p.x - z.x, p.z - z.z) < z.r + 1.6 + (op[0] === "k" ? S.cashReach(G, pi) : 0);
}

/* ---------- гость ---------- */
export class GuestSync {
  constructor(room, api) {
    this.room = room; this.api = api;        // api: {go(G, gi), snap(G), events(list), peer(on), local() → {x,z,dir,mv}}
    this.G = null; this.h = null; this.n = 0; this.q = 0; this.pending = []; this.lastRx = Date.now(); this.stat = { rx: 0, gaps: 0, replays: 0 }; this.pt = 0; this.batch = [];
    room.on("go", (d) => { if (!d || !d.h) return; this.h = d.h; this.n = d.s.n || 0; this.lastRx = Date.now(); this.pending = this.pending.filter((p) => p.q > (d.s.k || 0)); this.G = decode(d.h, d.s, null); this.replay(); api.go && api.go(this.G, d.gi == null ? 1 : d.gi, d); });
    room.on("s", (d0) => {
      this.lastRx = Date.now(); this.stat.rx++;
      if (!this.h || !d0 || d0.n <= this.n) return;
      let d = d0;
      if (d0.kf) this.kf = d0;
      else if (d0.dl) {
        if (!this.kf || this.kf.n !== d0.kb) { this.stat.gaps++; if (Date.now() - (this.kfAsk || 0) > 800) { this.kfAsk = Date.now(); room.send("kfreq", 1); } if (d0.ev && api.events) api.events(d0.ev); return; }
        d = applyDelta(d0, this.kf);
      }
      if (d.n > this.n + 1) this.stat.gaps++;
      this.n = d.n;
      this.pending = this.pending.filter((p) => p.q > (d.k || 0));
      const loc = api.local && api.local();
      const prev = this.G, rxGap = Math.min(0.6, Math.max(0.05, (Date.now() - (this.rxAt || 0)) / 1000)); this.rxAt = Date.now();
      const old = prev ? { hp: prev.hp.map((h) => [h.x, h.z]), cu: new Map(prev.cu.map((c) => [c.id, [c.x, c.z]])), pl: prev.pl.map((p) => [p.x, p.z]) } : null;
      this.G = decode(this.h, d, this.G);
      // скорость каждого — чтобы между снимками двигать их дальше (на плохой связи не «замирают»)
      if (old) { const v = (o, a) => { if (!a) { o.vx = o.vz = 0; return; } const vx = (o.x - a[0]) / rxGap, vz = (o.z - a[1]) / rxGap; const sp = Math.hypot(vx, vz); const k = sp > 7 ? 0 : 1; o.vx = vx * k; o.vz = vz * k; };
        this.G.hp.forEach((h, i) => v(h, old.hp[i])); this.G.cu.forEach((c) => v(c, old.cu.get(c.id))); this.G.pl.forEach((p, i) => v(p, old.pl[i])); }
      this.pt0 = 0;
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
  // между снимками: двигаем помощников, покупателей и хозяина по их скорости (не дольше 0.35 с)
  predict(dt) {
    const G = this.G; if (!G || (typeof window !== "undefined" && window.__noPredict)) return; this.pt0 = (this.pt0 || 0) + dt; if (this.pt0 > 0.35) return;
    const me = this.api.gi(), mv = (o) => { if (o.vx || o.vz) { o.x += o.vx * dt; o.z += o.vz * dt; } };
    for (const h of G.hp) if (h.mv) mv(h); for (const c of G.cu) if (c.mv) mv(c); G.pl.forEach((p, i) => { if (i !== me && p.mv) mv(p); });
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
