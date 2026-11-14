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
// изменилась ли карта с прошлой отправки. Полоска работы (rt) идёт у гостя сама; координаты карт внутри стопки гость
// считает сам (layout); лежащие карты сдвинувшиеся меньше POSQ пикселей не шлём — «дрожь» кучек монет давала 80+ карт в каждом пакете
const POSQ = 8;
// 0 — без изменений, 1 — сдвинулась (шлём только x,y), 2 — изменилось что-то ещё (шлём карту целиком)
function changed(e, L, c) {
  let pos = 0;
  for (let i = 1; i < e.length; i++) {
    if (i === 12) continue;
    if (i === 2 || i === 3) { if (c.dn) continue; if (!c.drag && Math.abs(e[i] - L[i]) < POSQ) continue; if (e[i] !== L[i]) pos = 1; continue; }
    if (e[i] !== L[i]) return 2;
  }
  return pos;
}
// полный снимок без служебных полей отрисовки (было ~97 КБ на 500 карт, стало ~42 КБ)
function compact(G) {
  const o = JSON.parse(S.serialize(G));
  for (const id in o.cards) { const c = o.cards[id]; for (const k in c) if (k[0] === "_" || k === "dirty" || k === "h") delete c[k]; c.x = Math.round(c.x); c.y = Math.round(c.y); if (c.rt) c.rt = Math.round(c.rt * 10) / 10; }
  delete o._claims; delete o._carry; delete o._plans; delete o._miss;
  return JSON.stringify(o);
}
function meta(G) { return [G.day, Math.round(G.t * 10), PH.indexOf(G.ph), Math.round(G.nt * 10), G.spd, G.q, G.bridge, G.won ? 1 : 0, G.lost ? 1 : 0, G.season || 0, Math.round((G.hold || 0) * 10), G.nid]; }
function unmeta(G, m) { G.day = m[0]; G.t = m[1] / 10; G.ph = PH[m[2]] || "day"; G.nt = m[3] / 10; G.spd = m[4]; G.q = m[5]; G.bridge = m[6]; G.won = m[7] ? G.won || "bridge" : 0; G.lost = m[8]; G.season = m[9]; G.hold = m[10] / 10; G.nid = m[11]; }
const RARE = ["kn", "f", "st", "bought", "pl", "solo", "open", "fights", "lastNight", "wonDay", "ht", "sett"];

/* ---------- хозяин ---------- */
export class HostSync {
  constructor(room, api) {
    this.room = room; this.api = api;          // api: {G(), intent(type, data), peer(on), cursor(d), ping(d), emote(d)}
    this.last = new Map(); this.seq = 0; this.evq = []; this.t = 0; this.tf = 0; this.rareSig = ""; this.rt = 0; this.on = true;
    this.ver = new Map(); this.dels = []; this.delFloor = 0;     // для догонялки: когда карта менялась последний раз, какие удалены
    this.stat = { tx: 0, bytes: 0, full: 0, catchup: 0 };
    const R = room;
    this.ack = 0;
    const I = (t) => R.on(t, (d) => { if (!this.on) return; api.intent(t, d || {}); if (d && d.q && t === "dr") this.ack = Math.max(this.ack, d.q); });
    ["pk", "mv", "dr", "by", "op", "sp", "rl", "rd"].forEach(I);
    R.on("cu", (d) => api.cursor && api.cursor(d));
    R.on("pg", (d) => api.ping && api.ping(d, 1));
    R.on("em", (d) => api.emote && api.emote(d, 1));
    // гость пропустил пакеты: шлём только то, что менялось после его последнего (раньше — весь мир, 60–100 КБ, и на сервере это шло лавиной)
    R.on("rf", (d) => { if (d && d.since != null) this.catchup(d.since); else this.full(); });
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
    const s = ++this.seq;
    for (const id in G.cards) { this.last.set(+id, enc(G.cards[id])); this.ver.set(+id, s); }
    this.rareSig = "";
    this.send("f", { s, g: compact(G), k: this.ack, hf: this.api.fam ? this.api.fam() : 0 });
    this.stat.full++; this.tf = 0;
  }
  catchup(since) {
    const G = this.api.G(); if (!G || !this.room.peer) return;
    if (since < this.delFloor || since > this.seq) return this.full();
    const c = [], x = [];
    for (const [id, v] of this.ver) if (v > since && G.cards[id]) c.push(enc(G.cards[id]));
    for (const d of this.dels) if (d[1] > since) x.push(d[0]);
    const rare = {}; for (const k of RARE) rare[k] = G[k];
    this.send("u", { s: this.seq, m: meta(G), k: this.ack, c, x, r: rare });
    this.stat.catchup++;
  }
  tick(dt) {
    if (!this.room.peer) return;
    this.t += dt; this.tf += dt; this.rt += dt;
    if (this.tf > 60) { this.full(); return; }          // страховочный полный снимок — редко; пропуски чинит догонялка
    // напрямую — 10 пакетов в секунду; через сервер — 5, а если ответы на пинг задерживаются (очередь на сервере) — 2:
    // реже шлём — меньше байт (карта, сдвинувшаяся трижды, уходит один раз), очередь рассасывается
    const R = this.room, slow = R.link !== "p2p" && (R.ping || 0) > 800;
    if (this.t < (R.link === "p2p" ? 0.1 : slow ? 0.5 : 0.2)) return;
    this.t = 0;
    const G = this.api.G(); if (!G) return;
    const c = [], x = [], p = [];
    const seq = ++this.seq;
    for (const id in G.cards) {
      const cc = G.cards[id], e = enc(cc), L = this.last.get(+id);
      const ch = L ? changed(e, L, cc) : 2;
      if (ch === 2) { this.last.set(+id, e); this.ver.set(+id, seq); c.push(e); }
      else if (ch === 1) { L[2] = e[2]; L[3] = e[3]; this.ver.set(+id, seq); p.push(e[0], e[2], e[3]); }   // только координаты: [id, x, y]
    }
    if (this.last.size > c.length) for (const id of this.last.keys()) if (!G.cards[id]) { x.push(id); this.last.delete(id); this.ver.delete(id); this.dels.push([id, seq]); }
    if (this.dels.length > 3000) { const cut = this.dels.splice(0, 1000); this.delFloor = cut[cut.length - 1][1]; }
    const msg = { s: seq, m: meta(G), k: this.ack };
    if (c.length) msg.c = c; if (x.length) msg.x = x; if (p.length) msg.p = p;
    if (this.evq.length) { msg.e = this.evq; this.evq = []; }
    // редкие поля — только изменившиеся ключи; статистика (st) меняется каждый кадр (время) — не чаще раза в 10 с.
    // Раньше весь блок уходил каждые 0,5 с и давал ~70% всего трафика
    if (this.rt > 0.5) {
      this.rt = 0;
      if (!this.rsig || this.rareSig === "") { this.rsig = {}; this.rareSig = "x"; }
      const now = Date.now(), rare = {}; let any = false;
      for (const k of RARE) {
        if (k === "st" && now - (this.stT || 0) < 10000) continue;
        const v = JSON.stringify(G[k] === undefined ? null : G[k]);
        if (this.rsig[k] !== v) { this.rsig[k] = v; rare[k] = G[k]; any = true; if (k === "st") this.stT = now; }
      }
      if (any) msg.r = rare;
    }
    this.send("d", msg);
  }
}

/* ---------- гость ---------- */
export class GuestSync {
  constructor(room, api) {
    this.room = room; this.api = api;          // api: {full(G), events(list), nack(d), cursor(d), ping, emote, lob(d), go(d), peer(on)}
    this.G = null; this.seq = 0; this.askT = 0;
    // предсказание: карты, которые гость взял/положил у себя сразу. Пока хозяин не подтвердил (k >= q), его устаревшие данные по ним не применяем.
    this.q = 0; this.txn = null; this.hold = new Set(); this.pend = new Map(); this.stat = { rx: 0, bytes: 0, gaps: 0, fulls: 0 }; this.lastRx = Date.now();
    const R = room;
    R.on("f", (d) => {
      this.stat.fulls++; this.lastRx = Date.now();
      const G = S.deserialize(d.g); if (!G) return;
      this.gapAt = 0;
      if (this.txn && d.k >= this.txn.q && this.txn.dropped) { this.txn = null; this.hold.clear(); this.pend.clear(); }
      for (const id in G.cards) { const c = G.cards[id]; const old = this.G && this.G.cards[id]; if (old && old._dx != null) { c._dx = old._dx; c._dy = old._dy; } }
      this.G = G; this.seq = d.s; api.full && api.full(G, d);
    });
    R.on("d", (d) => {
      this.stat.rx++; this.lastRx = Date.now();
      if (!this.G) { this.ask(); return; }
      if (d.s <= this.seq) return;
      // пропуск: применяем этот пакет и просим у хозяина только то, что поменялось после нашего последнего
      if (d.s !== this.seq + 1) { this.stat.gaps++; this.askSince(this.seq); }
      this.seq = d.s;
      this.apply(d);
    });
    R.on("u", (d) => { this.stat.catchups = (this.stat.catchups || 0) + 1; this.lastRx = Date.now(); this.gapAt = 0; if (this.G) this.apply(d, true); });
    this.R = R;
    R.on("nk", (d) => api.nack && api.nack(d));
    this.rest(R, api);
  }
  apply(d, catchup) {
      const G = this.G, api = this.api;
      unmeta(G, d.m);
      const done = this.txn && this.txn.dropped && d.k != null && d.k >= this.txn.q;
      if (done) { for (const [id, a] of this.pend) if (G.cards[id]) dec(a, G.cards[id]); this.txn = null; this.hold.clear(); this.pend.clear(); }
      if (d.c) for (const a of d.c) { if (this.hold.has(a[0])) { this.pend.set(a[0], a); continue; } const c = G.cards[a[0]] || (G.cards[a[0]] = {}); dec(a, c); }
      if (d.p) for (let i = 0; i < d.p.length; i += 3) {
        const id = d.p[i], c = G.cards[id]; if (!c) continue;
        if (this.hold.has(id)) { const a = this.pend.get(id); if (a) { a[2] = d.p[i + 1]; a[3] = d.p[i + 2]; } continue; }
        c.x = d.p[i + 1]; c.y = d.p[i + 2];
      }
      if (d.x) for (const id of d.x) { delete G.cards[id]; this.hold.delete(id); this.pend.delete(id); }
      if (d.r) for (const k in d.r) G[k] = d.r[k];
      // координаты карт в стопках считаем сами (хозяин их не шлёт)
      for (const id in G.cards) { const c = G.cards[id]; if (!c.dn && c.up) S.layout(G, c); }
      if (!catchup && d.e && api.events) api.events(d.e);
  }
  rest(R, api) {
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
  // гость взял карту: номер действия и карты, которые меняются у него сразу
  begin(ids) { this.q++; this.txn = { q: this.q, dropped: false, t: Date.now() }; this.hold = new Set(ids); this.pend.clear(); return this.q; }
  holdMore(id) { if (this.txn && id) this.hold.add(id); }
  dropped() { if (this.txn) { this.txn.dropped = true; this.txn.t = Date.now(); } return this.txn ? this.txn.q : 0; }
  // отказ хозяина или долгая тишина — берём его данные и просим полный снимок
  release(ask) {
    const G = this.G;
    if (G) for (const [id, a] of this.pend) if (G.cards[id]) dec(a, G.cards[id]);
    this.txn = null; this.hold.clear(); this.pend.clear();
    if (ask) { this.askT = 0; this.ask(); }
  }
  ask() { const now = Date.now(); if (now - this.askT < 1500) return; this.askT = now; this.room.send("rf", {}); }
  askSince(since) { const now = Date.now(); if (now - (this.askS || 0) < 700) return; this.askS = now; this.room.send("rf", { since }); }
  send(t, d, fast) { if (fast) this.room.sendFast(t, d); else this.room.send(t, d); }
  // между снимками: время дня и полоски работы идут сами
  extrapolate(dt) {
    const G = this.G; if (!G || G.lost) return;
    if (this.txn && this.txn.dropped && Date.now() - this.txn.t > 3500) this.release(true);
    const k = dt * (G.spd || 0);
    if (G.ph === "day") G.t = Math.min(G.t + k, 9999);
    for (const id in G.cards) { const c = G.cards[id]; if (c.rc && !c.dn && !c.drag && G.ph === "day") c.rt = Math.min((c.rt || 0) + k, c.rT || 999); }
  }
}
export { enc, dec };
