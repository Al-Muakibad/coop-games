// «Хутор» — сеть на двоих поверх shared/net.js (Net.open, 1 на 1).
// Хозяин считает мир и шлёт гостю «снимки»: полный (f) при входе и раз в 8 с, а между ними 10 раз в секунду — только изменившиеся карты (d).
// Гость шлёт намерения: взять (pk), вести (mv, «быстрый» канал), положить (dr), купить (by), открыть (op), скорость (sp), курсор (cu), метку (pg), эмоцию (em).
import { KINDS, KIDX, RECIPES } from "./data.js";
import * as S from "./sim.js";

const RIDS = RECIPES.map((r) => r.id); const RIDX = {}; RIDS.forEach((r, i) => (RIDX[r] = i));
const PH = ["day", "night", "hold"];
// карта → массив
function enc(c) {
  return [c.id, KIDX[c.k], Math.round(c.x), Math.round(c.y), c.dn || 0, c.up || 0, c.drag || 0, c.o == null ? -1 : c.o, c.u == null ? -1 : c.u, c.hp == null ? -1 : c.hp,
    c.f == null ? -1 : c.f, c.rc ? RIDX[c.rc] : -1, Math.round((c.rt || 0) * 10), Math.round((c.rT || 0) * 10), c.cb || 0, c.ms ? RIDX[c.ms] : -1, c.mhp == null ? -1 : c.mhp, c.fx || 0, c.br || 0, c.n || 0];
}
function dec(a, c) {
  c = c || {};
  c.id = a[0]; c.k = KINDS[a[1]]; c.x = a[2]; c.y = a[3]; c.dn = a[4]; c.up = a[5]; c.drag = a[6];
  if (a[7] >= 0) c.o = a[7]; else delete c.o;
  if (a[8] >= 0) c.u = a[8]; else delete c.u;
  if (a[9] >= 0) c.hp = a[9]; else delete c.hp;
  if (a[10] >= 0) c.f = a[10]; else delete c.f;
  const rc = a[11] >= 0 ? RIDS[a[11]] : "";
  if (rc !== c.rc || Math.abs((c.rt || 0) - a[12] / 10) > 0.6) c.rt = a[12] / 10;
  c.rc = rc; c.rT = a[13] / 10; c.cb = a[14]; c.ms = a[15] >= 0 ? RIDS[a[15]] : "";
  if (a[16] >= 0) c.mhp = a[16]; c.fx = a[17]; c.br = a[18]; c.n = a[19];
  return c;
}
const sigOf = (e) => { const s = e.slice(); s[12] = 0; return s.join(","); };
function meta(G) { return [G.day, Math.round(G.t * 10), PH.indexOf(G.ph), Math.round(G.nt * 10), G.spd, G.q, G.bridge, G.won ? 1 : 0, G.lost ? 1 : 0, G.season || 0, Math.round((G.hold || 0) * 10), G.nid]; }
function unmeta(G, m) { G.day = m[0]; G.t = m[1] / 10; G.ph = PH[m[2]] || "day"; G.nt = m[3] / 10; G.spd = m[4]; G.q = m[5]; G.bridge = m[6]; G.won = m[7] ? G.won || "bridge" : 0; G.lost = m[8]; G.season = m[9]; G.hold = m[10] / 10; G.nid = m[11]; }
const RARE = ["kn", "f", "st", "bought", "pl", "solo", "open", "fights", "lastNight", "wonDay", "ht", "sett"];

/* ---------- хозяин ---------- */
export class HostSync {
  constructor(room, api) {
    this.room = room; this.api = api;          // api: {G(), intent(type, data), peer(on), cursor(d), ping(d), emote(d)}
    this.last = new Map(); this.seq = 0; this.evq = []; this.t = 0; this.tf = 0; this.rareSig = ""; this.rt = 0; this.on = true;
    this.stat = { tx: 0, bytes: 0, full: 0 };
    const R = room;
    const I = (t) => R.on(t, (d) => { if (this.on) api.intent(t, d || {}); });
    ["pk", "mv", "dr", "by", "op", "sp", "rl", "rd"].forEach(I);
    R.on("cu", (d) => api.cursor && api.cursor(d));
    R.on("pg", (d) => api.ping && api.ping(d, 1));
    R.on("em", (d) => api.emote && api.emote(d, 1));
    R.on("rf", () => this.full());
    R.on("peer", (p) => { api.peer && api.peer(true, p); });
    R.on("peer-left", (p) => { api.peer && api.peer(false, p); });
    // гость нас «терял» (связь рвалась в одну сторону) — шлём ему мир целиком
    R.on("resync", () => { this.full(); api.resync && api.resync(); });
  }
  send(t, d, fast) { const s = JSON.stringify(d); this.stat.tx++; this.stat.bytes += s.length; if (fast) this.room.sendFast(t, d); else this.room.send(t, d); }
  events(list) { for (const e of list) if (e.t !== "drop" && e.t !== "stack") this.evq.push(e); if (this.evq.length > 300) this.evq.splice(0, this.evq.length - 300); }
  full() {
    const G = this.api.G(); if (!G || !this.room.peer) return;
    this.last.clear();
    for (const id in G.cards) this.last.set(+id, sigOf(enc(G.cards[id])));
    this.rareSig = "";
    this.send("f", { s: ++this.seq, g: S.serialize(G) });
    this.stat.full++; this.tf = 0;
  }
  tick(dt) {
    if (!this.room.peer) return;
    this.t += dt; this.tf += dt; this.rt += dt;
    if (this.tf > 8) { this.full(); return; }
    if (this.t < 0.1) return;
    this.t = 0;
    const G = this.api.G(); if (!G) return;
    const c = [], x = [];
    const seen = new Set();
    for (const id in G.cards) {
      const e = enc(G.cards[id]); const s = sigOf(e); seen.add(+id);
      if (this.last.get(+id) !== s) { this.last.set(+id, s); c.push(e); }
    }
    for (const id of this.last.keys()) if (!seen.has(id)) { x.push(id); this.last.delete(id); }
    const msg = { s: ++this.seq, m: meta(G) };
    if (c.length) msg.c = c; if (x.length) msg.x = x;
    if (this.evq.length) { msg.e = this.evq; this.evq = []; }
    if (this.rt > 0.5) {
      this.rt = 0;
      const rare = {}; for (const k of RARE) rare[k] = G[k];
      const rs = JSON.stringify(rare); if (rs !== this.rareSig) { this.rareSig = rs; msg.r = rare; }
    }
    this.send("d", msg);
  }
}

/* ---------- гость ---------- */
export class GuestSync {
  constructor(room, api) {
    this.room = room; this.api = api;          // api: {full(G), events(list), nack(d), cursor(d), ping, emote, lob(d), go(d), peer(on)}
    this.G = null; this.seq = 0; this.askT = 0; this.stat = { rx: 0, bytes: 0, gaps: 0, fulls: 0 }; this.lastRx = Date.now();
    const R = room;
    R.on("f", (d) => {
      this.stat.fulls++; this.lastRx = Date.now();
      const G = S.deserialize(d.g); if (!G) return;
      for (const id in G.cards) { const c = G.cards[id]; const old = this.G && this.G.cards[id]; if (old && old._dx != null) { c._dx = old._dx; c._dy = old._dy; } }
      this.G = G; this.seq = d.s; api.full && api.full(G);
    });
    R.on("d", (d) => {
      this.stat.rx++; this.lastRx = Date.now();
      if (!this.G) { this.ask(); return; }
      if (d.s !== this.seq + 1) { this.stat.gaps++; if (d.s > this.seq + 1) this.ask(); if (d.s <= this.seq) return; }
      this.seq = d.s;
      const G = this.G;
      unmeta(G, d.m);
      if (d.c) for (const a of d.c) { const c = G.cards[a[0]] || (G.cards[a[0]] = {}); dec(a, c); }
      if (d.x) for (const id of d.x) delete G.cards[id];
      if (d.r) for (const k in d.r) G[k] = d.r[k];
      if (d.e && api.events) api.events(d.e);
    });
    R.on("nk", (d) => api.nack && api.nack(d));
    R.on("cu", (d) => api.cursor && api.cursor(d));
    R.on("pg", (d) => api.ping && api.ping(d, 0));
    R.on("em", (d) => api.emote && api.emote(d, 0));
    R.on("lob", (d) => api.lob && api.lob(d));
    R.on("go", (d) => api.go && api.go(d));
    R.on("peer", (p) => { this.askT = 0; this.ask(); api.peer && api.peer(true, p); });
    R.on("peer-left", (p) => api.peer && api.peer(false, p));
    R.on("resync", () => { this.askT = 0; this.ask(); api.resync && api.resync(); });
  }
  // сколько секунд от хозяина ничего не приходило (он шлёт 10 раз в секунду)
  silence() { return (Date.now() - this.lastRx) / 1000; }
  ask() { const now = Date.now(); if (now - this.askT < 1500) return; this.askT = now; this.room.send("rf", {}); }
  send(t, d, fast) { if (fast) this.room.sendFast(t, d); else this.room.send(t, d); }
  // между снимками: время дня и полоски работы идут сами
  extrapolate(dt) {
    const G = this.G; if (!G || G.lost) return;
    const k = dt * (G.spd || 0);
    if (G.ph === "day") G.t = Math.min(G.t + k, 9999);
    for (const id in G.cards) { const c = G.cards[id]; if (c.rc && !c.dn && !c.drag && G.ph === "day") c.rt = Math.min((c.rt || 0) + k, c.rT || 999); }
  }
}
export { enc, dec };
