/* Шаткая башня — пошаговая физическая дуэль-стройка на 2–4 игроков: против ботов, онлайн (комната Party) или на одном телефоне.

   Физика: planck.js (Box2D), фиксированный шаг 1/60 с, 8/3 итерации. Синхронизация онлайн — «детерминированный повтор + сверка»:
   1) Состояние хода S — список брусков [вид, x, y, угол], округлённых до 0.0001. Каждый ход мир planck СОБИРАЕТСЯ ЗАНОВО из S
      (никакого скрытого состояния: тёплые старты контактов, сон тел — всё с нуля), поэтому все телефоны начинают ход одинаково.
   2) Ходящий рассылает только параметры броска {q, вид, x, y, угол}. Каждый телефон сам считает тот же бросок тем же кодом.
      В planck подставлены sin/cos/atan2 из dmath.js (только + − × ÷), так что Android и iPhone считают бит-в-бит одинаково.
   3) Хозяин комнаты — арбитр: досчитав, рассылает итоговое состояние (новые позиции + кто уронил). Гости, досмотрев свою
      анимацию, принимают его (обычно разница 0; если вдруг нет — побеждает версия хозяина, и следующий ход стартует из неё).
   Симуляция считается вперёд быстрее, чем показывается, и записывается по кадрам — поэтому мы заранее знаем, что башня рухнет,
   и включаем замедление ДО начала падения, а потом можем показать повтор. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const FX = window.Foley || { knock() {}, creak() {}, crash() {}, whoosh() {}, slowmo() {}, applause() {}, click() {}, toggle() { return false; }, on: false };
  const D = window.DMath, PL = window.planck, V = (x, y) => PL.Vec2(x, y);
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

  // ---------- константы ----------
  const DT = 1 / 60, VI = 8, PI_IT = 3, PH = 2.6, FALL_Y = -1.0, MAXSTEP = 780, EVAL_STEPS = 300, TURN_SEC = 30;
  const TAU = 6.283185307179586, HP = 1.5707963267948966, PI = 3.141592653589793;
  const q4 = (v) => Math.round(v * 1e4) / 1e4;
  const normA = (a) => a - TAU * Math.round(a / TAU);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const COLORS = ["#ff7a2f", "#3a86ff", "#38d16a", "#e056fd"];

  // ---------- бруски ----------
  const box = (x0, y0, x1, y1) => ({ v: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  const arcPts = (cx, cy, r, a0, a1, n) => { const p = []; for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; p.push([q4(cx + r * D.cos(t)), q4(cy + r * D.sin(t))]); } return p; };
  const KINDS = [
    { nm: "Кирпич", parts: [box(-0.75, -0.35, 0.75, 0.35)], col: "#ff595e", w: 10, angs: [0, HP] },
    { nm: "Балка", parts: [box(-1.4, -0.2, 1.4, 0.2)], col: "#ffb703", w: 8, angs: [0, 0, 0.12, -0.12] },
    { nm: "Кубик", parts: [box(-0.45, -0.45, 0.45, 0.45)], col: "#2ec4b6", w: 9, angs: [0, 0.7854] },
    { nm: "Столбик", parts: [box(-0.25, -0.85, 0.25, 0.85)], col: "#8338ec", w: 6, angs: [HP, 0], min: 2 },
    { nm: "Треугольник", parts: [{ v: [[-0.85, -0.4], [0.85, -0.4], [0, 0.62]] }], col: "#38d16a", w: 6, angs: [0, PI], min: 2 },
    { nm: "Арка", arch: 1, col: "#fb8500", w: 5, angs: [0, PI], min: 3 },
    { nm: "Колесо", circ: 0.55, col: "#2f3447", hub: "#ffd23f", mat: "rubber", d: 1.1, f: 0.9, w: 3, angs: [0], min: 4 },
    { nm: "Мяч", circ: 0.4, col: "#ff4fa3", mat: "plastic", f: 0.5, r: 0.12, w: 3, angs: [0], min: 4 },
    { nm: "Уголок", parts: [box(-0.6, -0.6, -0.15, 0.75), box(-0.15, -0.6, 0.65, -0.15)], vis: [[-0.6, -0.6], [0.65, -0.6], [0.65, -0.15], [-0.15, -0.15], [-0.15, 0.75], [-0.6, 0.75]], col: "#3a86ff", w: 6, angs: [0, HP, PI, -HP], min: 2 },
    { nm: "Тавр", parts: [box(-0.95, 0.15, 0.95, 0.55), box(-0.22, -0.65, 0.22, 0.15)], vis: [[-0.22, -0.65], [0.22, -0.65], [0.22, 0.15], [0.95, 0.15], [0.95, 0.55], [-0.95, 0.55], [-0.95, 0.15], [-0.22, 0.15]], col: "#22d3ee", w: 5, angs: [0, PI], min: 3 },
    { nm: "Полукруг", half: 0.85, col: "#ffd23f", w: 5, angs: [0, PI], min: 2 },
    { nm: "Трапеция", parts: [{ v: [[-0.95, -0.4], [0.95, -0.4], [0.5, 0.4], [-0.5, 0.4]] }], col: "#a3e635", w: 8, angs: [0, PI] },
    { nm: "Крестик", parts: [box(-0.75, -0.2, 0.75, 0.2), box(-0.2, -0.75, 0.2, 0.75)], vis: [[-0.2, -0.75], [0.2, -0.75], [0.2, -0.2], [0.75, -0.2], [0.75, 0.2], [0.2, 0.2], [0.2, 0.75], [-0.2, 0.75], [-0.2, 0.2], [-0.75, 0.2], [-0.75, -0.2], [-0.2, -0.2]], col: "#e056fd", w: 3, angs: [0, 0.7854], min: 4 },
    { nm: "Доска", parts: [box(-1.7, -0.15, 1.7, 0.15)], col: "#ff7b54", w: 5, angs: [0, 0.1, -0.1], min: 1 }
  ];
  (function prep() {
    KINDS.forEach((K, i) => {
      K.id = i;
      if (K.arch) {
        const top = arcPts(0, -0.1, 0.5, PI, 0, 14);
        K.vis = [[-0.95, -0.5], [-0.5, -0.5]].concat(top, [[0.5, -0.5], [0.95, -0.5], [0.95, 0.6], [-0.95, 0.6]]);
        K.parts = [box(-0.95, -0.5, -0.5, 0.6), box(0.5, -0.5, 0.95, 0.6)];
        const xs = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5], ay = (x) => q4(-0.1 + Math.sqrt(Math.max(0, 0.25 - x * x)));
        for (let k = 0; k < 5; k++) K.parts.push({ v: [[xs[k], ay(xs[k])], [xs[k + 1], ay(xs[k + 1])], [xs[k + 1], 0.6], [xs[k], 0.6]] });
      } else if (K.half) {
        K.vis = arcPts(0, -0.3, K.half, 0, PI, 10);
        K.parts = [{ v: K.vis }];
      } else if (K.circ) {
        K.parts = [{ c: K.circ }];
      } else if (!K.vis) K.vis = K.parts[0].v;
      let e = 0;
      if (K.circ) e = K.circ; else K.vis.forEach((p) => { e = Math.max(e, Math.hypot(p[0], p[1])); });
      K.ext = e; K.sz = e * 2;
      K.mat = K.mat || "wood";
      K.dark = shade(K.col, -0.42);
    });
  })();
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  // случайный вид бруска — целочисленный хэш, одинаковый на всех телефонах
  function hash(a, b, c) {
    let h = (a ^ Math.imul(b + 1, 0x9e3779b1) ^ Math.imul(c + 7, 0x85ebca77)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
    return h;
  }
  function kindFor(seed, round, n) {
    const pool = KINDS.filter((K) => n >= (K.min || 0));
    let tot = 0; pool.forEach((K) => (tot += K.w));
    let r = hash(seed, round, n) % tot;
    for (const K of pool) { if (r < K.w) return K.id; r -= K.w; }
    return 0;
  }
  // габариты повёрнутого бруска (только + − × ÷ и DMath — одинаково везде)
  function extents(k, a) {
    const K = KINDS[k];
    if (K.circ) return { lo: -K.circ, hi: K.circ, l: -K.circ, r: K.circ };
    const c = D.cos(a), s = D.sin(a); let lo = 1e9, hi = -1e9, l = 1e9, r = -1e9;
    for (const p of K.vis) { const y = p[0] * s + p[1] * c, x = p[0] * c - p[1] * s; if (y < lo) lo = y; if (y > hi) hi = y; if (x < l) l = x; if (x > r) r = x; }
    return { lo, hi, l, r };
  }
  function topY(bodies) { let t = 0; for (const b of bodies) { const e = extents(b[0], b[3]); if (b[2] + e.hi > t) t = b[2] + e.hi; } return t; }
  const dropY = (S0, k, a) => q4(topY(S0.bodies) + 0.45 - extents(k, a).lo);
  const START = () => [[0, 0, 0.35, 0]];

  // ---------- симуляция ----------
  function shapeOf(p) { return p.c ? new PL.Circle(V(0, 0), p.c) : new PL.Polygon(p.v.map((q) => V(q[0], q[1]))); }
  function newSim(S0, drop, rec) {
    const w = new PL.World({ gravity: V(0, -10) });
    const plat = w.createBody({ type: "static", position: V(0, 0) });
    plat.createFixture(new PL.Box(PH, 0.4, V(0, -0.4), 0), { friction: 0.8, restitution: 0 });
    const src = S0.bodies.concat([[drop.k, drop.x, drop.y, drop.a]]);
    const list = src.map((b, i) => {
      const K = KINDS[b[0]];
      const bd = w.createBody({ type: "dynamic", position: V(b[1], b[2]), angle: b[3], angularDamping: 0.1, linearDamping: 0.02 });
      K.parts.forEach((p) => bd.createFixture(shapeOf(p), { density: K.d || 1, friction: K.f || 0.62, restitution: K.r || 0.03 }));
      bd.__i = i; return bd;
    });
    const n = list.length;
    const s = { w, plat, list, src, n, step: 0, fall: -1, fallI: -1, move: -1, done: false, quiet: 0, rec, drop, crumble: -1, gone: new Uint8Array(n), maxOld: 0 };
    if (rec) {
      s.fr = []; s.ev = []; s.mot = [0]; s.platX = [0]; s.platA = [0];
      const f0 = new Float32Array(n * 3); src.forEach((b, i) => { f0[i * 3] = b[1]; f0[i * 3 + 1] = b[2]; f0[i * 3 + 2] = b[3]; }); s.fr.push(f0);
      w.on("begin-contact", (c) => { c.__b = s.step + 1; });
      w.on("post-solve", (c, imp) => {
        const ni = imp.normalImpulses, J = (ni[0] || 0) + (ni[1] || 0);
        if (J < 0.04) return;
        const A = c.getFixtureA().getBody(), B = c.getFixtureB().getBody(), ma = A.getMass(), mb = B.getMass();
        const m = ma && mb ? Math.min(ma, mb) : ma || mb; if (!m) return;
        // удар = всплеск импульса над «фоном» контакта (в покое контакт всё время держит вес башни — это не удар)
        const base = c.__e || 0, st = s.step + 1, fresh = st - (c.__b || -99) <= 1;
        c.__e = base * 0.85 + J * 0.15;
        const dv = (J - base) / m;
        if (fresh ? !c.__p && dv > 0.16 : dv > 0.9 && J > base * 2.2 && st - (c.__p || 0) > 14) {
          c.__p = st;
          const dyn = ma ? A : B, oth = ma && mb ? (dyn === A ? B : A) : null, p = dyn.getPosition();
          const k1 = src[dyn.__i][0], k2 = oth ? src[oth.__i][0] : -1;
          const mat = KINDS[k1].mat !== "wood" ? KINDS[k1].mat : k2 >= 0 && KINDS[k2].mat !== "wood" ? KINDS[k2].mat : k2 < 0 ? "table" : "wood";
          s.ev.push([st, dv, p.x, p.y, mat, KINDS[k1].sz, k2 < 0 ? 1 : 0]);
        }
      });
    }
    return s;
  }
  function stepSim(s) {
    if (s.crumble >= 0) {   // после падения — «землетрясение» для эффектного обвала (вердикт уже вынесен)
      const t = s.step - s.crumble;
      if (t === 0) { s.plat.setType("kinematic"); s.dir = s.fallX < 0 ? 1 : -1; }
      if (t >= 0 && t < 90) {
        const om = TAU * 2.4, k = t < 60 ? 1 : (90 - t) / 30;
        s.plat.setLinearVelocity(V(0.12 * k * om * D.cos(om * t * DT), 0));
        s.plat.setAngularVelocity(t < 40 ? s.dir * 0.75 : 0);
      } else if (t >= 120 && t < 160) { const r = (160 - t) * DT; s.plat.setLinearVelocity(V(-s.plat.getPosition().x / r, 0)); s.plat.setAngularVelocity(-s.plat.getAngle() / r); }
      else if (t === 160) { s.plat.setLinearVelocity(V(0, 0)); s.plat.setAngularVelocity(0); }
    }
    s.w.step(DT, VI, PI_IT); s.step++;
    let maxV = 0, maxOld = 0, sleep = true;
    for (let i = 0; i < s.n; i++) {
      if (s.gone[i]) continue;
      const b = s.list[i], p = b.getPosition();
      if (p.y < FALL_Y && s.fall < 0) { s.fall = s.step; s.fallI = i; s.fallX = p.x; if (s.rec) s.crumble = s.step + 30; }
      if (p.y < -45) { s.w.destroyBody(b); s.gone[i] = 1; continue; }
      if (b.isAwake()) sleep = false;
      const v = b.getLinearVelocity(), sp = Math.abs(v.x) + Math.abs(v.y) + 0.5 * Math.abs(b.getAngularVelocity());
      if (sp > maxV) maxV = sp;
      if (i < s.n - 1) {
        if (sp > maxOld) maxOld = sp;
        if (s.move < 0) { const dx = p.x - s.src[i][1], dy = p.y - s.src[i][2]; if (dx * dx + dy * dy > 0.02) s.move = s.step; }
      }
    }
    if (s.rec) {
      const f = new Float32Array(s.n * 3);
      for (let i = 0; i < s.n; i++) { if (s.gone[i]) { f[i * 3] = NaN; continue; } const b = s.list[i], p = b.getPosition(); f[i * 3] = p.x; f[i * 3 + 1] = p.y; f[i * 3 + 2] = b.getAngle(); }
      s.fr.push(f); s.mot.push(maxOld); s.platX.push(s.plat.getPosition().x); s.platA.push(s.plat.getAngle());
    }
    if (maxOld > s.maxOld) s.maxOld = maxOld;
    if (s.fall < 0) {
      if (sleep && s.step > 8) s.done = true;
      else if (maxV < 0.03) { if (++s.quiet > 30 && s.step > 50) s.done = true; } else s.quiet = 0;
    } else if (!s.rec || s.step > s.fall + 230) s.done = true;
    if (s.step >= (s.rec ? MAXSTEP : EVAL_STEPS)) s.done = true;
  }
  function simBodies(s) { return s.list.map((b, i) => { const p = b.getPosition(); return [s.src[i][0], q4(p.x), q4(p.y), q4(normA(b.getAngle()))]; }); }
  function runSim(S0, drop) { const s = newSim(S0, drop, false); while (!s.done) stepSim(s); return s; }

  // ---------- правила ----------
  let mode = "bot", level = 1, room = null, cfg = null, S = null;
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };
  const N = () => cfg.players.length;
  const isBot = (i) => !!(cfg.players[i] && cfg.players[i].bot);
  const lives0 = () => (N() === 2 ? 2 : 1);
  const pname = (i) => (mode === "local" || !cfg ? cfg.players[i].name : i === cfg.me ? "Ты" : cfg.players[i].name);
  const pcol = (i) => cfg.players[i].color || COLORS[i % 4];
  function nextAlive(S0, from) { for (let k = 1; k <= N(); k++) { const j = (from + k) % N(); if (S0.lives[j] > 0) return j; } return from; }
  function judge(S0, drop, s) {
    const S1 = Object.assign({}, S0, { q: S0.q + 1, last: drop, lives: S0.lives.slice(), placed: S0.placed.slice(), auth: true, shift: s.maxOld });
    if (s.fall >= 0) { S1.lives[S0.turn]--; S1.ph = "over"; S1.loser = S0.turn; }
    else {
      S1.bodies = simBodies(s); S1.placed[S0.turn]++; S1.n = S0.n + 1;
      S1.turn = nextAlive(S0, S0.turn); S1.kind = kindFor(S0.seed, S0.round, S1.n);
      S1.h = q4(topY(S1.bodies)); S1.best = Math.max(S0.best, S1.h);
    }
    return S1;
  }
  function newGame() {
    const prev = S, seed = (Math.random() * 4294967296) >>> 0;
    const first = prev ? (prev.first + 1) % N() : mode === "online" ? seed % N() : 0;
    S = { q: prev ? prev.q + 1 : 1, game: prev ? prev.game + 1 : 1, round: 0, seed, n: 0, first, turn: first, ph: "aim",
      lives: cfg.players.map(lives0), placed: cfg.players.map(() => 0), wins: prev ? prev.wins.slice() : cfg.players.map(() => 0),
      bodies: START(), kind: kindFor(seed, 0, 0), h: 0.7, best: 0.7, top: prev ? prev.top || 0 : 0, loser: -1, win: -1, last: null, auth: true, shift: 0,
      bots: cfg.players.map((p) => (p.bot ? 1 : 0)) };
    endShown = false; lastSim = null;
    push();
    St.gameStart({ mode, players: N(), bots: cfg.players.filter((p) => p.bot).length, level: mode !== "local" ? level : undefined });
  }
  function nextRound() {
    if (!S || S.ph !== "over" || !isHost()) return;
    const alive = [], hum = [];
    S.lives.forEach((l, i) => { if (l > 0) { alive.push(i); if (!isBot(i)) hum.push(i); } });
    const top = Math.max(S.top || 0, S.best || 0);
    if (alive.length <= 1 || !hum.length) {
      alive.sort((a, b) => S.lives[b] - S.lives[a] || S.placed[b] - S.placed[a]);
      const win = alive.length ? alive[0] : -1, wins = S.wins.slice(); if (win >= 0) wins[win]++;
      S = Object.assign({}, S, { q: S.q + 1, ph: "end", win, wins, top, last: null });
    } else {
      const r = S.round + 1, turn = nextAlive(S, S.loser);
      S = Object.assign({}, S, { q: S.q + 1, round: r, n: 0, ph: "aim", turn, loser: -1, bodies: START(), kind: kindFor(S.seed, r, 0), h: 0.7, top, last: null, shift: 0 });
      lastSim = null;
    }
    push();
  }
  function push() { S.bots = cfg.players.map((p) => (p.bot ? 1 : 0)); send("st", S); onState(); }

  // ---------- ход: бросок, расчёт, показ ----------
  let play = null, replay = null, lastSim = null, pending = null, myDrop = null, endShown = false;
  let aim = { x: 0, a: 0 }, aimFor = -1, remote = null, turnT0 = 0, aimSentT = 0;
  let botJob = null, botAt = 0, botAnim = null, handFor = -1, overFor = -1;
  const syncLog = [];
  const canAct = () => !!(S && S.ph === "aim" && !play && !replay && cfg && (mode === "local" ? !isBot(S.turn) && handFor === S.q : S.turn === cfg.me && S.auth !== false));
  const botHere = () => !!(S && S.ph === "aim" && !play && isHost() && isBot(S.turn));
  const clampX = (x) => clamp(x, -PH - 0.7, PH + 0.7);
  function mkDrop(x, a) { const k = S.kind; a = q4(normA(a)); return { q: S.q, k, x: q4(clampX(x)), a, y: dropY(S, k, a) }; }
  function dropNow(x, a) {
    if (!S || S.ph !== "aim" || play) return false;
    const d = mkDrop(x, a);
    send("drop", d);
    if (!isHost()) myDrop = { d, t: performance.now() };
    startPlay(d, S);
    return true;
  }
  function tryDrop() { if (canAct()) { dropNow(aim.x, aim.a); } }
  function startPlay(d, base) {
    const sim = newSim(base, d, true);
    play = { sim, base, d, t: 0, started: false, res: null, evI: 0, slowOn: false, crashOn: false, kind: "live", creakT: 0 };
    botJob = null; botAnim = null; remote = null;
    FX.whoosh(); T.haptic("impact", "light");
    hud();
  }
  function computeTick(budget) {
    const p = play; if (!p || p.sim.done) return;
    const t0 = performance.now();
    while (!p.sim.done) { stepSim(p.sim); if ((p.sim.step & 3) === 0 && performance.now() - t0 > budget) break; }
    if (p.sim.done && !p.res) {
      p.res = judge(p.base, p.d, p.sim);
      if (isHost()) { p.res.bots = cfg.players.map((q) => (q.bot ? 1 : 0)); send("st", p.res); }
    }
  }
  function slowWin(s) {
    if (s.fall < 0) return null;
    // замедляем момент, когда башня реально пошла: от первого сдвига, но не раньше чем за ~0.75 с до падения
    const a = Math.max(4, (s.move >= 0 && s.move < s.fall ? clamp(s.move, s.fall - 45, s.fall - 6) : s.fall - 26) - 4);
    return [a, a + 92];
  }
  function speedAt(p) {
    const w = slowWin(p.sim);
    if (p.kind === "replay") { if (!w) return 0.35; const c = p.t < w[0] ? 0.55 : p.t < w[1] ? 0.2 : 0.5; return c; }
    if (!w) return 1;
    const t = p.t, lo = 0.24;
    if (t < w[0] - 10 || t > w[1] + 30) return 1;
    if (t < w[0]) return 1 - (1 - lo) * (t - (w[0] - 10)) / 10;
    if (t <= w[1]) return lo;
    return lo + (1 - lo) * (t - w[1]) / 30;
  }
  function advancePlay(p, dt) {
    const s = p.sim;
    if (!p.started) { if (s.step >= 100 || s.done) p.started = true; else return; }
    const sp = speedAt(p), slow = sp < 0.6;
    const t1 = Math.min(p.t + dt * 60 * sp, s.step);
    // звуки и пыль — по записанным ударам
    while (p.evI < s.ev.length && s.ev[p.evI][0] <= t1) {
      const e = s.ev[p.evI++];
      if (e[0] < p.t - 2) continue;
      const v = clamp(e[1] / 4.2, 0, 1), pan = clamp(e[2] / (PH + 1), -1, 1);
      FX.knock(v, e[5], e[4], pan, slow);
      if (e[6] && e[4] !== "table") FX.knock(v * 0.7, 3, "table", pan, slow);
      if (e[1] > 1.8) dust(e[2], e[3] - 0.3, Math.min(7, 2 + e[1]), Math.min(0.5, e[1] * 0.08));
      if (e[1] > 2.2 && p.kind === "live") { T.haptic("impact", e[1] > 4 ? "medium" : "light"); shake = Math.max(shake, Math.min(0.2, e[1] * 0.02)); }
    }
    const w = slowWin(s);
    if (w && !p.slowOn && t1 >= w[0] - 10) { p.slowOn = true; if (p.kind === "live") { FX.slowmo(); T.haptic("impact", "heavy"); } }
    if (s.fall >= 0 && !p.crashOn && t1 >= s.fall) {
      p.crashOn = true; FX.crash(1, slow); shake = 0.55; T.haptic("notify", "error");
      const f = s.fr[s.fall], i = s.fallI; if (f && f[i * 3] === f[i * 3]) dust(f[i * 3], -0.6, 12, 0.6);
    }
    if (s.crumble >= 0 && t1 >= s.crumble && !p.quake) { p.quake = true; FX.crash(0.7, slow); shake = 0.8; dust(-PH * 0.8, 0.1, 8, 0.7); dust(PH * 0.8, 0.1, 8, 0.7); }
    // скрип, пока башня качается
    const m = s.mot[Math.floor(t1)] || 0;
    p.creakT -= dt;
    if (m > 0.18 && m < 2.5 && p.creakT <= 0 && s.n > 3) { FX.creak(clamp(m / 1.5, 0.2, 1), slow); p.creakT = 0.55 + Math.random() * 0.5; }
    wobbleDyn = Math.max(wobbleDyn * 0.9, clamp(m / 1.3, 0, 1));
    p.t = t1;
    if (p.kind === "replay" && p.t >= p.end) { replay = null; overFor = -1; onState(); return; }
    if (p.kind === "live" && s.done && p.res && p.t >= s.step) endPlay();
  }
  function bodiesDiff(a, b) { if (a.length !== b.length) return 1e9; let d = 0; for (let i = 0; i < a.length; i++) for (let k = 1; k < 4; k++) d = Math.max(d, Math.abs(a[i][k] - b[i][k])); return d; }
  function endPlay() {
    const p = play; play = null; lastSim = p.sim;
    let nS = p.res;
    if (!isHost()) {
      if (pending && pending.q === nS.q) { syncLog.push({ q: nS.q, diff: bodiesDiff(nS.bodies, pending.bodies), ph: [nS.ph, pending.ph] }); nS = pending; nS.auth = true; pending = null; }
      else nS.auth = false;
    }
    S = nS; onState();
    if (pending && pending.q > S.q) { const s2 = pending; pending = null; applySt(s2); }
  }
  function applySt(s) {
    if (isHost()) return;
    if (S && s.q < S.q) return;
    if (S && s.q === S.q && S.auth) return;
    if (play) { if (s.q === play.base.q + 1) { pending = s; return; } if (s.q <= play.base.q) return; play = null; }
    if (S && s.q === S.q + 1 && s.last && s.last.q === S.q && S.ph === "aim" && S.auth !== false && s.game === S.game) { pending = s; startPlay(s.last, S); return; }
    if (S && s.game !== S.game) endShown = false;
    if (s.ph === "aim" && (!S || s.round !== S.round || s.game !== S.game)) lastSim = null;
    S = s; S.auth = true; pending = null;
    (s.bots || []).forEach((b, i) => { if (cfg.players[i]) cfg.players[i].bot = !!b; });
    onState();
  }
  function onState() {
    if (!S) return;
    replay = null;
    if (S.ph === "aim" && aimFor !== S.q) {
      aimFor = S.q; aim = { x: 0, a: 0 }; remote = null; turnT0 = performance.now(); botJob = null; botAnim = null;
      botAt = performance.now() + 650 + Math.random() * 500;
      if (myDrop && S.q > myDrop.d.q) myDrop = null;
      if (mode === "local") { if (handFor !== S.q) showHand(); }
      else if (S.turn === cfg.me && N() > 1 && S.auth !== false) banner("Твой ход!", `Брусок: ${KINDS[S.kind].nm}`, 1100);
    }
    risk = staticRisk(S);
    $("round").classList.toggle("hidden", S.ph !== "over" || !!replay || !!play);
    if (S.ph === "over" && overFor !== S.q) showRound();
    if (S.ph === "end") { if (!endShown) { endShown = true; setTimeout(showEnd, 900); } }
    else $("screen-end").classList.add("hidden");
    if (S.ph !== "aim") $("handoff").classList.add("hidden");
    hud();
    if (S.h > bestH && S.ph === "aim") { bestH = S.h; bestDirty = true; }
    if (bestDirty && S.ph !== "aim") { bestDirty = false; saveBest(); }
  }

  let bestDirty = false;
  function saveBest() {
    const v = String(Math.round(bestH * 100));
    try { localStorage.setItem("shatkaya_best", v); } catch (_) {}
    try { const tg = T.tg; if (tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9")) tg.CloudStorage.setItem("shatkaya_best", v); } catch (_) {}
  }
  // ---------- бот ----------
  const LV = [{ n: 4, sx: 0.3, sa: 0.12, rob: 0 }, { n: 7, sx: 0.1, sa: 0.04, rob: 2 }, { n: 11, sx: 0.025, sa: 0.01, rob: 3 }];
  function planBot(S0, lvl) {
    const K = KINDS[S0.kind], L = LV[lvl];
    let lo = PH, hi = -PH, cm = 0;
    S0.bodies.forEach((b) => { lo = Math.min(lo, b[1]); hi = Math.max(hi, b[1]); cm += b[1]; });
    cm /= S0.bodies.length || 1; lo = Math.max(-PH + 0.5, lo - 0.7); hi = Math.min(PH - 0.5, hi + 0.7);
    const tops = S0.bodies.slice().sort((a, b) => b[2] - a[2]).slice(0, 3).map((b) => b[1]);
    const list = [];
    for (let i = 0; i < L.n; i++) {
      let x = i < tops.length ? tops[i] : i === tops.length ? -cm * 0.6 : lo + Math.random() * (hi - lo);
      x += (Math.random() - 0.5) * 0.16;
      list.push({ x: clamp(x, -PH + 0.4, PH - 0.4), a: K.angs[i % K.angs.length] });
    }
    return { S0, list, i: 0, cur: null, best: null, lvl };
  }
  function scoreSim(s) {
    if (s.fall >= 0) return -1000 + s.fall;
    let disp = 0, mx = 0, mt = 0;
    for (let i = 0; i < s.n; i++) {
      const b = s.list[i], p = b.getPosition(), m = b.getMass(); mx += m * p.x; mt += m;
      if (i < s.n - 1) disp += Math.abs(p.x - s.src[i][1]) + Math.abs(p.y - s.src[i][2]) + 0.4 * Math.abs(normA(b.getAngle() - s.src[i][3]));
    }
    const pc = s.list[s.n - 1], v = pc.getLinearVelocity(), com = mt ? mx / mt : 0;
    return -disp * 6 - Math.abs(com) / PH * 2.5 - (Math.abs(v.x) + Math.abs(v.y)) * 3 - Math.abs(pc.getPosition().x) / PH * 0.4 + Math.random() * 0.05;
  }
  function botWork(job, budget) {
    const t0 = performance.now();
    while (job.i < job.list.length) {
      const c = job.list[job.i];
      if (!job.cur) { c.d = { q: job.S0.q, k: job.S0.kind, x: q4(c.x), a: q4(c.a), y: dropY(job.S0, job.S0.kind, c.a) }; job.cur = newSim(job.S0, c.d, false); }
      const s = job.cur;
      while (!s.done) { stepSim(s); if ((s.step & 3) === 0 && performance.now() - t0 > budget) return false; }
      c.sc = scoreSim(s); job.cur = null; job.i++;
      if (job.i >= job.list.length && !job.p2) {
        // проверка на «дрожь руки»: лучшие варианты пробуем чуть левее и правее и берём самый надёжный
        job.p2 = true;
        const L = LV[job.lvl], dl = Math.max(0.07, L.sx * 1.6);
        job.list.slice().sort((a, b) => b.sc - a.sc).slice(0, L.rob).forEach((c0) => { if (c0.sc > -500) [dl, -dl].forEach((o) => job.list.push({ x: c0.x + o, a: c0.a, par: c0 })); });
      }
      if (performance.now() - t0 > budget) break;
    }
    if (job.i < job.list.length) return false;
    job.best = null;
    for (const c of job.list) {
      if (c.par) continue;
      const kids = job.list.filter((k) => k.par === c);
      c.rs = kids.length ? Math.min(c.sc, ...kids.map((k) => k.sc)) : c.sc - (job.p2 && LV[job.lvl].rob ? 3 : 0);
      if (!job.best || c.rs > job.best.rs) job.best = c;
    }
    return true;
  }
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;
  function botFinal(job) { const b = job.best, L = LV[job.lvl]; return { x: clampX(b.x + gauss() * L.sx), a: b.a + gauss() * L.sa }; }
  function botTick(now, dt) {
    if (!botHere()) return;
    if (!botJob && now >= botAt) botJob = planBot(S, level);
    if (botJob && !botAnim) {
      if (botWork(botJob, 7)) { const f = botFinal(botJob); botAnim = { x: f.x, a: f.a, t: 0 }; }
      else { const c = botJob.list[Math.min(botJob.i, botJob.list.length - 1)]; aim.x += (c.x - aim.x) * Math.min(1, dt * 3); aim.a += (c.a - aim.a) * Math.min(1, dt * 3); sendAim(); }
    }
    if (botAnim) {
      botAnim.t += dt;
      aim.x += (botAnim.x - aim.x) * Math.min(1, dt * 7); aim.a += (botAnim.a - aim.a) * Math.min(1, dt * 7); sendAim();
      if (botAnim.t > 0.75) { const b = botAnim; botAnim = null; aim.x = b.x; aim.a = b.a; dropNow(b.x, b.a); }
    }
  }
  function autoDrop(lvl) {   // для тестов: мгновенно бросить за себя лучшим найденным броском
    if (!canAct()) return false;
    const job = planBot(S, lvl == null ? 2 : lvl); while (!botWork(job, 1e9)); const f = lvl === 2 || lvl == null ? job.best : botFinal(job);
    aim.x = f.x; aim.a = f.a; return dropNow(f.x, f.a);
  }

  // ---------- сеть ----------
  function sendAim(force) {
    if (!room || !S) return;
    const now = performance.now(); if (!force && now - aimSentT < 120) return; aimSentT = now;
    room.sendFast("aim", { q: S.q, x: +aim.x.toFixed(3), a: +aim.a.toFixed(3) });
  }
  function bindRoom() {
    ["st", "drop", "aim", "left", "host-left"].forEach((t) => room.off(t));
    room.on("st", (s) => applySt(s));
    room.on("drop", (d, from) => {
      if (!S || play || replay || S.ph !== "aim" || d.q !== S.q || S.auth === false) return;
      if (isHost()) { const p = cfg.players[S.turn]; if (!p || p.bot || p.id !== from) return; }
      startPlay(d, S);
    });
    room.on("aim", (d) => { if (S && !canAct() && d.q === S.q && !play) { if (!remote) remote = { x: d.x, a: d.a }; remote.tx = d.x; remote.ta = d.a; } });
    room.on("left", (id) => {
      const i = cfg.players.findIndex((p) => p.id === id); if (i < 0) return;
      cfg.players[i].bot = true; banner(`${cfg.players[i].name} вышел`, "За него доиграет бот", 1800);
      if (S && isHost()) { S.bots = cfg.players.map((p) => (p.bot ? 1 : 0)); send("st", S); hud(); }
    });
    room.on("host-left", () => { banner("Хозяин вышел 😕", "Игра остановлена", 4000); $("status").textContent = "Хозяин вышел из игры"; });
  }
  setInterval(() => { if (room && isHost() && S && !play) send("st", S); }, 3000);

  // ---------- экраны ----------
  let bannerT = 0;
  function banner(t, sub, ms) { const el = $("banner"); el.innerHTML = esc(t) + (sub ? `<small>${esc(sub)}</small>` : ""); el.classList.add("on"); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove("on"), ms || 1400); }
  function hearts(i) { const L = lives0(); let h = ""; for (let k = 0; k < L; k++) h += k < S.lives[i] ? "❤️" : "🖤"; return h; }
  function showHand() {
    const i = S.turn;
    if (N() < 2) { handFor = S.q; return; }
    $("hand-name").textContent = cfg.players[i].name; $("hand-name").style.color = pcol(i);
    $("hand-sub").textContent = `Твой брусок: ${KINDS[S.kind].nm}`;
    $("handoff").classList.remove("hidden");
  }
  $("hand-go").onclick = () => { handFor = S ? S.q : -1; $("handoff").classList.add("hidden"); hud(); };
  function showRound() {
    overFor = S.q;
    const L = S.loser;
    $("round-title").textContent = mode !== "local" && L === cfg.me ? "💥 Ты уронил башню!" : `💥 ${cfg.players[L].name} роняет башню!`;
    $("round-lives").innerHTML = cfg.players.map((p, i) => `<span style="white-space:nowrap"><b style="color:${pcol(i)}">●</b> ${esc(pname(i))} ${hearts(i)}</span>`).join(" &nbsp; ");
    const box = $("round-buttons"); box.innerHTML = "";
    const b = (l, c, f) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); };
    if (lastSim && lastSim.fall >= 0) b("🔁 Повтор", "", startReplay);
    if (isHost()) b("▶ Дальше", "primary", nextRound); else b("Ждём хозяина…", "", () => {});
    clearTimeout(showRound.t);
    if (room && isHost()) showRound.t = setTimeout(() => { if (S && S.ph === "over" && !replay) nextRound(); }, 14000);
    $("round").classList.toggle("hidden", !!play);
  }
  function startReplay() {
    if (!lastSim || lastSim.fall < 0 || play) return;
    const w = slowWin(lastSim), t = Math.max(0, w[0] - 50);
    replay = { sim: lastSim, t, started: true, evI: lastSim.ev.findIndex((e) => e[0] >= t), slowOn: false, crashOn: false, kind: "replay", creakT: 0, end: Math.min(lastSim.step, lastSim.fall + 170), quake: false };
    if (replay.evI < 0) replay.evI = lastSim.ev.length;
    $("round").classList.add("hidden"); FX.slowmo();
  }
  function showEnd() {
    if (!S || S.ph !== "end") return;
    const me = cfg.me, w = S.win, meWin = mode === "local" ? true : w === me;
    St.gameEnd({ win: mode === "local" ? null : meWin, mode, rounds: S.round + 1, placed: S.placed[me], height: Math.round((S.top || 0) * 100) / 100 });
    T.haptic("notify", meWin ? "success" : "error");
    if (meWin || mode === "local") FX.applause();
    $("end-emoji").textContent = meWin ? "🏆" : "🧱";
    $("end-title").textContent = mode === "local" ? (w >= 0 ? `Победил ${cfg.players[w].name}!` : "Ничья!") : meWin ? "Победа!" : "Поражение";
    const multi = S.game > 1;
    const rows = cfg.players.map((p, i) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 2px;border-top:1px dashed rgba(43,29,20,.15)"><span style="text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b style="color:${pcol(i)}">●</b> ${esc(pname(i))}${i === w ? " 🏆" : ""}</span><b style="white-space:nowrap">🧱${S.placed[i]} ${hearts(i)}${multi ? " · " + S.wins[i] + "🏆" : ""}</b></div>`).join("");
    $("end-sub").innerHTML = `<p style="margin:4px 0 8px">${w >= 0 && mode !== "local" && !meWin ? "Победил " + esc(cfg.players[w].name) + " · " : ""}Раундов: ${S.round + 1} · выше всех: ${(S.top || 0).toFixed(1)} м</p>${rows}`;
    $("end-best").textContent = bestH > 0 ? `🏆 Твой рекорд высоты: ${bestH.toFixed(1)} м` : "";
    const box = $("end-buttons"); box.innerHTML = "";
    const b = (l, c, f) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); };
    if (isHost()) b("🔁 Ещё партия", "primary", () => newGame()); else b("Ждём хозяина…", "", () => {});
    b("Выйти", "ghost", toMenu);
    $("screen-end").classList.remove("hidden");
  }
  function toMenu() {
    if (bestDirty) { bestDirty = false; saveBest(); }
    if (room) room.close(); room = null; S = null; play = null; replay = null; cfg = null; lastSim = null;
    ["hud", "bar", "screen-end", "round", "handoff"].forEach((s) => $(s).classList.add("hidden"));
    $("screen-menu").classList.remove("hidden"); bestText();
  }

  // ---------- HUD ----------
  let lastHud = "";
  function hud() {
    if (!S || !cfg) return;
    const h = cfg.players.map((p, i) => {
      const on = S.ph === "aim" && S.turn === i, out = S.lives[i] <= 0;
      return `<div class="pc ${on ? "on" : ""} ${out ? "out" : ""}" style="--pc:${pcol(i)}"><div class="nm">${esc(pname(i))}</div><div class="lv">${hearts(i)}<b>🧱${S.placed[i]}</b></div>${on && mode === "online" && !isBot(i) ? '<i class="tm" data-tm></i>' : ""}</div>`;
    }).join("");
    if (h !== lastHud) { lastHud = h; $("players").innerHTML = h; pads(); }
    status();
  }
  let lastStatus = null, tips = 0;
  function status() {
    if (!S) return;
    let t = "";
    const act = canAct();
    if (S.ph === "end") t = "Партия окончена";
    else if (S.ph === "over") t = "Раунд окончен";
    else if (play) t = play.sim.fall >= 0 && play.t >= (slowWin(play.sim) || [1e9])[0] - 10 ? "Ой-ой-ой…" : "Качается…";
    else if (act) t = tips < 2 ? "Двигай пальцем · ↺ ↻ — повернуть · «Бросить»" : `Твой ход: ${KINDS[S.kind].nm.toLowerCase()}`;
    else if (isBot(S.turn)) t = `${cfg.players[S.turn].name} примеряется…`;
    else if (mode === "online" && S.auth === false) t = "Сверяем башню…";
    else if (mode !== "local") t = `Ходит ${pname(S.turn)}…`;
    if (t !== lastStatus) { lastStatus = t; $("status").textContent = t; }
    $("ctl").classList.toggle("off", !act);
  }

  // ---------- графика ----------
  const canvas = $("game"), ctx = canvas.getContext("2d"), bgc = $("bg"), bx = bgc.getContext("2d");
  let bgKey = "", bgT = -1;
  const shc = document.createElement("canvas"), sctx = shc.getContext("2d");
  let SW = 0, SH = 0, DPR = 1, topPad = 70, botPad = 110, camTop = 7, camS = 50, shake = 0, wobbleDyn = 0, wobShown = 0, risk = 0, bestH = 0, slowK = 0;
  let far = null, near = null, cloudImg = null, stars = [];
  const SHK = 4;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); SW = innerWidth; SH = innerHeight;
    canvas.width = bgc.width = SW * DPR; canvas.height = bgc.height = SH * DPR; bgKey = "";
    shc.width = Math.ceil(SW / SHK); shc.height = Math.ceil(SH / SHK);
    pads(); buildScenery();
  }
  function pads() {
    const hd = $("hud"), br = $("bar");
    topPad = hd.classList.contains("hidden") ? 30 : hd.getBoundingClientRect().bottom + 52;
    botPad = br.classList.contains("hidden") ? SH * 0.12 : SH - br.getBoundingClientRect().top + 14;
  }
  function ridge(w, h, rough, seed, col, col2) {
    const c = document.createElement("canvas"); c.width = Math.ceil(w * DPR); c.height = Math.ceil(h * DPR);
    const g = c.getContext("2d"); g.scale(DPR, DPR);
    let a = seed; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    const pts = []; const n = 9; for (let i = 0; i <= n; i++) pts.push(h * (0.25 + 0.5 * r()));
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 3) {
      const u = x / w * n, i = Math.floor(u), f = u - i, s = f * f * (3 - 2 * f);
      const y = pts[i] + (pts[Math.min(n, i + 1)] - pts[i]) * s + Math.sin(x * 0.07 + seed) * rough + Math.sin(x * 0.19 + seed * 2) * rough * 0.5;
      g.lineTo(x, y);
    }
    g.lineTo(w, h); g.closePath();
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, col); gr.addColorStop(1, col2); g.fillStyle = gr; g.fill();
    return c;
  }
  function buildScenery() {
    far = ridge(SW, SH * 0.3, 5, 7, "#b4669b", "#7c3f86");
    near = ridge(SW, SH * 0.24, 3, 29, "#5b2a6e", "#2a1340");
    cloudImg = document.createElement("canvas"); cloudImg.width = cloudImg.height = 128;
    const g = cloudImg.getContext("2d"), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(255,236,245,.85)"); gr.addColorStop(0.5, "rgba(255,220,236,.35)"); gr.addColorStop(1, "rgba(255,220,236,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    stars = []; let a = 99; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    for (let i = 0; i < 70; i++) stars.push([r(), r(), 0.5 + r() * 1.3, r() * 6]);
  }
  const X = (x) => SW / 2 + x * camS, Y = (y) => topPad + (camTop - y) * camS;
  const lerpC = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const m = (s) => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t); return `rgb(${m(16)},${m(8)},${m(0)})`; };
  function drawSky(time) {
    const hgt = clamp((camTop - 6) / 26, 0, 1);
    const g = bx.createLinearGradient(0, 0, 0, SH);
    g.addColorStop(0, lerpC("#3b1f6b", "#0d0a24", hgt)); g.addColorStop(0.45, lerpC("#a24a8f", "#3a1d63", hgt));
    g.addColorStop(0.78, lerpC("#ff8f6b", "#a2508a", hgt)); g.addColorStop(1, lerpC("#ffd29a", "#e48a7a", hgt));
    bx.fillStyle = g; bx.fillRect(0, 0, SW, SH);
    // звёзды проступают на высоте
    const sa = clamp((camTop - 9) / 14, 0, 1) * 0.9;
    if (sa > 0.02) { bx.fillStyle = "#fff"; for (const s of stars) { bx.globalAlpha = sa * (0.5 + 0.5 * Math.sin(time * 1.3 + s[3])); bx.fillRect(s[0] * SW, s[1] * SH * 0.7, s[2], s[2]); } bx.globalAlpha = 1; }
    // солнце
    const hz = Y(-2.2), sunY = SH * 0.62 + (hz - SH * 0.62) * 0.18 - 26, sunX = SW * 0.74;
    const sg = bx.createRadialGradient(sunX, sunY, 4, sunX, sunY, SW * 0.55);
    sg.addColorStop(0, "rgba(255,244,214,.95)"); sg.addColorStop(0.07, "rgba(255,214,160,.75)"); sg.addColorStop(0.25, "rgba(255,150,120,.25)"); sg.addColorStop(1, "rgba(255,120,120,0)");
    bx.fillStyle = sg; bx.fillRect(0, 0, SW, SH);
    bx.fillStyle = "rgba(255,248,230,.95)"; bx.beginPath(); bx.arc(sunX, sunY, Math.max(16, SW * 0.06), 0, 7); bx.fill();
    // облака (мир, параллакс)
    for (let i = 0; i < 7; i++) {
      const wy = 3 + i * 4.2, px = ((i * 0.37 + time * 0.006 * (1 + i % 3)) % 1.4) - 0.2;
      const y = topPad + (camTop * 0.6 - wy * 0.6) * camS * 1.1, w = SW * (0.45 + (i % 3) * 0.15);
      if (y < -80 || y > SH + 40) continue;
      bx.globalAlpha = 0.5 - hgt * 0.25; bx.drawImage(cloudImg, px * SW - w / 2, y - w * 0.12, w, w * 0.24); bx.drawImage(cloudImg, px * SW - w * 0.2, y - w * 0.18, w * 0.55, w * 0.2);
    }
    bx.globalAlpha = 1;
    // горы
    const fy = SH * 0.66 + (hz - SH * 0.66) * 0.3;
    if (fy < SH) bx.drawImage(far, 0, fy - far.height / DPR * 0.7, SW, far.height / DPR);
    const ny = SH * 0.7 + (hz - SH * 0.7) * 0.6;
    if (ny < SH + 40) { bx.drawImage(near, 0, ny - near.height / DPR * 0.55, SW, near.height / DPR); bx.fillStyle = "#2a1340"; bx.fillRect(0, ny + near.height / DPR * 0.44, SW, SH); }
  }
  function drawColumn() {
    const y1 = Y(-0.8);
    // колонна уходит вниз в туман
    const cx0 = X(-1.05), cx1 = X(1.05), cb = Math.min(SH + 10, Y(-60));
    let g = bx.createLinearGradient(cx0, 0, cx1, 0);
    g.addColorStop(0, "#3a2350"); g.addColorStop(0.3, "#6a4a7e"); g.addColorStop(0.55, "#8c6a9c"); g.addColorStop(1, "#2c1a40");
    bx.fillStyle = g; bx.fillRect(cx0, y1, cx1 - cx0, cb - y1);
    bx.fillStyle = "rgba(255,255,255,.06)"; for (let k = 1; k < 4; k++) bx.fillRect(cx0 + (cx1 - cx0) * k / 4 - 1, y1, 2, cb - y1);
    // капитель
    g = bx.createLinearGradient(0, y1, 0, y1 + camS * 0.35); g.addColorStop(0, "#5a3c70"); g.addColorStop(1, "#3a2350");
    bx.fillStyle = g; rr(bx, X(-1.45), y1 - 2, camS * 2.9, camS * 0.32, 6); bx.fill();
    // туман внизу
    const fg = bx.createLinearGradient(0, Y(-1.5), 0, Y(-9));
    fg.addColorStop(0, "rgba(42,19,64,0)"); fg.addColorStop(1, "rgba(28,12,46,.92)");
    bx.fillStyle = fg; bx.fillRect(0, Y(-1.5), SW, SH);
  }
  function drawPedestal(px, pa) {
    const y1 = Y(-0.8);
    let g;
    // столешница (может наклониться при обвале)
    ctx.save(); ctx.translate(X(px), Y(0)); ctx.rotate(-(pa || 0)); ctx.translate(-X(px), -Y(0));
    const x0 = X(-PH + px), x1 = X(PH + px), y0 = Y(0);
    g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "#c98b5a"); g.addColorStop(0.18, "#a8683c"); g.addColorStop(1, "#6e3e20");
    ctx.fillStyle = g; rr(ctx, x0, y0, x1 - x0, y1 - y0, Math.min(10, camS * 0.18)); ctx.fill();
    ctx.strokeStyle = "rgba(255,226,190,.75)"; ctx.lineWidth = Math.max(1.5, camS * 0.04); ctx.beginPath(); ctx.moveTo(x0 + 6, y0 + 1.5); ctx.lineTo(x1 - 6, y0 + 1.5); ctx.stroke();
    ctx.strokeStyle = "rgba(60,25,10,.35)"; ctx.lineWidth = 1; for (let k = 1; k < 3; k++) { const yy = y0 + (y1 - y0) * k / 3; ctx.beginPath(); ctx.moveTo(x0 + 8, yy); ctx.bezierCurveTo(X(-1 + px), yy + 2, X(1 + px), yy - 2, x1 - 8, yy); ctx.stroke(); }
    ctx.restore();
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  // контуры брусков: Path2D в метрах (локальные координаты, y вверх) со скруглёнными углами
  function roundPoly(pts, r) {
    const p = new Path2D(), n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]), rad = Math.min(r, l1 * 0.45, l2 * 0.45);
      const sx = b[0] + (a[0] - b[0]) / l1 * rad, sy = b[1] + (a[1] - b[1]) / l1 * rad;
      if (i === 0) p.moveTo(sx, sy); else p.lineTo(sx, sy);
      p.arcTo(b[0], b[1], b[0] + (c[0] - b[0]) / l2 * rad, b[1] + (c[1] - b[1]) / l2 * rad, rad);
    }
    p.closePath(); return p;
  }
  KINDS.forEach((K) => { if (K.circ) { K.path = new Path2D(); K.path.arc(0, 0, K.circ, 0, TAU); } else K.path = roundPoly(K.vis, 0.09); });
  function drawBody(g, k, x, y, a, opt) {
    const K = KINDS[k], s = camS;
    g.setTransform(DPR * s, 0, 0, -DPR * s, DPR * X(x), DPR * Y(y)); g.rotate(a);
    const P = K.path, e = K.ext, ux = Math.sin(a), uy = Math.cos(a);
    if (opt && opt.ghost) { g.globalAlpha = opt.ghost; }
    g.fillStyle = K.col; g.fill(P);
    g.save(); g.clip(P);
    if (K.circ && K.hub) {          // колесо: шина, диск, болты
      const tg = g.createRadialGradient(0, 0, e * 0.55, 0, 0, e); tg.addColorStop(0, "#1c2030"); tg.addColorStop(0.75, "#3a4158"); tg.addColorStop(1, "#151826"); g.fillStyle = tg; g.fill(P);
      g.fillStyle = "rgba(255,255,255,.08)"; for (let i = 0; i < 12; i++) { const t = i / 12 * TAU; g.fillRect(Math.cos(t) * e * 0.86 - 0.03, Math.sin(t) * e * 0.86 - 0.03, 0.06, 0.06); }
      g.fillStyle = K.hub; g.beginPath(); g.arc(0, 0, e * 0.5, 0, TAU); g.fill();
      g.fillStyle = shade(K.hub, -0.35); for (let i = 0; i < 5; i++) { const t = i / 5 * TAU; g.beginPath(); g.arc(Math.cos(t) * e * 0.3, Math.sin(t) * e * 0.3, e * 0.06, 0, TAU); g.fill(); }
    } else if (K.circ) {            // мяч: полоса показывает вращение
      g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(-e, -e * 0.16, e * 2, e * 0.32);
      g.fillStyle = "#ffd23f"; g.fillRect(-e, -e * 0.08, e * 2, e * 0.16);
    }
    const lg = g.createLinearGradient(-ux * e, -uy * e, ux * e, uy * e);
    lg.addColorStop(0, "rgba(30,0,40,.34)"); lg.addColorStop(0.42, "rgba(30,0,40,0)"); lg.addColorStop(0.6, "rgba(255,255,255,.06)"); lg.addColorStop(1, "rgba(255,255,255,.4)");
    g.fillStyle = lg; g.fillRect(-e - 0.1, -e - 0.1, 2 * e + 0.2, 2 * e + 0.2);
    // блик: свет сверху-слева в мировых координатах
    const wx = -0.38 * e, wy = 0.42 * e, lx = wx * Math.cos(a) + wy * Math.sin(a), ly = -wx * Math.sin(a) + wy * Math.cos(a);
    const sg = g.createRadialGradient(lx, ly, 0, lx, ly, e * 0.75); sg.addColorStop(0, "rgba(255,255,255,.5)"); sg.addColorStop(0.35, "rgba(255,255,255,.14)"); sg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sg; g.fillRect(-e - 0.1, -e - 0.1, 2 * e + 0.2, 2 * e + 0.2);
    // фаска: светлая сверху, тёмная снизу
    const bg = g.createLinearGradient(-ux * e, -uy * e, ux * e, uy * e);
    bg.addColorStop(0, "rgba(40,0,30,.5)"); bg.addColorStop(0.5, "rgba(255,255,255,.08)"); bg.addColorStop(1, "rgba(255,255,255,.85)");
    g.lineWidth = 0.13; g.strokeStyle = bg; g.stroke(P);
    g.restore();
    g.lineWidth = Math.max(1.2, 1.8 * DPR) / (DPR * s); g.strokeStyle = K.circ && K.hub ? "#0c0e18" : K.dark; g.stroke(P);
    if (opt && opt.glow) { g.lineWidth = 3 / s; g.strokeStyle = `rgba(255,255,255,${opt.glow})`; g.stroke(P); }
    g.globalAlpha = 1;
  }
  function drawShadow(k, x, y, a) {
    const K = KINDS[k], s = camS / SHK;
    sctx.setTransform(s, 0, 0, -s, (X(x) + camS * 0.13) / SHK, (Y(y) + camS * 0.16) / SHK); sctx.rotate(a);
    sctx.fill(K.path);
  }
  // тела для показа: идёт анимация — из записи (с интерполяцией), иначе из состояния
  function viewBodies() {
    const v = play || replay;
    if (v && v.started) {
      const s = v.sim, i0 = Math.floor(v.t), i1 = Math.min(s.fr.length - 1, i0 + 1), f = v.t - i0, A = s.fr[Math.min(i0, s.fr.length - 1)], B = s.fr[i1], out = [];
      for (let i = 0; i < s.n; i++) {
        const ax = A[i * 3]; if (ax !== ax) continue;
        let bx = B[i * 3], by = B[i * 3 + 1], ba = B[i * 3 + 2]; if (bx !== bx) { bx = ax; by = A[i * 3 + 1]; ba = A[i * 3 + 2]; }
        let da = ba - A[i * 3 + 2]; if (da > PI) da -= TAU; if (da < -PI) da += TAU;
        out.push([s.src[i][0], ax + (bx - ax) * f, A[i * 3 + 1] + (by - A[i * 3 + 1]) * f, A[i * 3 + 2] + da * f, i === s.n - 1]);
      }
      return { list: out, px: s.platX[i0] || 0, pa: s.platA[i0] || 0 };
    }
    if (S && S.ph === "over" && lastSim && lastSim.fr) {
      const s = lastSim, A = s.fr[s.fr.length - 1], out = [];
      for (let i = 0; i < s.n; i++) { if (A[i * 3] === A[i * 3]) out.push([s.src[i][0], A[i * 3], A[i * 3 + 1], A[i * 3 + 2]]); }
      return { list: out, px: s.platX[s.platX.length - 1] || 0, pa: s.platA[s.platA.length - 1] || 0 };
    }
    return { pa: 0, list: S ? S.bodies.map((b) => [b[0], b[1], b[2], b[3]]) : DEMO, px: 0 };
  }
  // пыль
  const parts = [];
  function dust(x, y, n, k) {
    for (let i = 0; i < n; i++) parts.push({ x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.2, vx: (Math.random() - 0.5) * 2.2 * k, vy: Math.random() * 1.4 * k, r: 0.08 + Math.random() * 0.18 * (0.6 + k), life: 0, max: 0.7 + Math.random() * 0.8 });
    if (parts.length > 220) parts.splice(0, parts.length - 220);
  }
  function camUpdate(dt, vb) {
    let top = S ? Math.max(0.7, S.h || 0.7) : 3.2;
    const v = play || replay;
    let bottom = -1.7, hover = top + (S && S.ph === "aim" && !play ? 3.1 : 1.6);
    if (v && v.sim.fall >= 0 && v.t >= (slowWin(v.sim) || [0])[0] - 12) bottom = -4.2;
    if (!S) hover = 6.5;
    let bp = botPad;
    const rc = !$("round").classList.contains("hidden") && $("round").querySelector(".card");
    if (rc) bp = Math.max(bp, SH - rc.getBoundingClientRect().top + 16);
    const avail = Math.max(120, SH - topPad - bp);
    let s = Math.min(SW / 6.4, avail / (hover - bottom));
    if (v && v.sim.fall >= 0 && v.t >= (slowWin(v.sim) || [0])[0] - 12) {   // обвал: отъезжаем, чтобы летящие бруски оставались в кадре
      let mx = PH + 0.6, my = top;
      for (const b of vb.list) if (b[2] > -5) { mx = Math.max(mx, Math.abs(b[1]) + KINDS[b[0]].ext + 0.3); my = Math.max(my, b[2] + KINDS[b[0]].ext); }
      s = Math.min(s, SW / (2 * Math.min(mx, 8)));
      hover = Math.max(hover, my + 0.8);
      s = Math.min(s, avail / (hover - bottom));
    }
    s = Math.max(s, SW / 16);
    const tTop = Math.max(hover, bottom + avail / s);
    const k = Math.min(1, dt * (v && v.kind === "replay" ? 1.6 : 2.6));
    camS += (s - camS) * k; camTop += (tTop - camTop) * k;
  }
  let time = 0, idleCreak = 3;
  function render(dt) {
    time += dt;
    const vb = viewBodies();
    camUpdate(dt, vb);
    const sx0 = shake > 0.002 ? (Math.random() - 0.5) * shake * camS * 0.25 : 0, sy0 = shake > 0.002 ? (Math.random() - 0.5) * shake * camS * 0.25 : 0;
    shake *= Math.pow(0.04, dt);
    // фон (небо, горы, колонна, туман) — отдельный холст, перерисовываем только когда сдвинулась камера (и изредка — для облаков)
    const key = camTop.toFixed(3) + "|" + camS.toFixed(3);
    if (key !== bgKey || time - bgT > 0.3) { bgKey = key; bgT = time; bx.setTransform(DPR, 0, 0, DPR, 0, 0); drawSky(time); drawColumn(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(DPR, 0, 0, DPR, sx0 * DPR, sy0 * DPR);
    drawPedestal(vb.px, vb.pa);
    // мягкие тени — рисуем силуэты в маленький холст и растягиваем (бесплатное размытие)
    sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, shc.width, shc.height); sctx.fillStyle = "#1a0526";
    let bl = 1e9, bt = 1e9, br = -1e9, bb = -1e9;
    const box = (x, y, e) => { const X0 = X(x), Y0 = Y(y), r = e * camS + 4; if (X0 - r < bl) bl = X0 - r; if (X0 + r + camS * 0.25 > br) br = X0 + r + camS * 0.25; if (Y0 - r < bt) bt = Y0 - r; if (Y0 + r + camS * 0.25 > bb) bb = Y0 + r + camS * 0.25; };
    for (const b of vb.list) { drawShadow(b[0], b[1] + sx0 / camS, b[2] - sy0 / camS, b[3]); box(b[1], b[2], KINDS[b[0]].ext); }
    const hv = hoverPiece();
    if (hv) { drawShadow(hv.k, hv.x, hv.y, hv.a); box(hv.x, hv.y, KINDS[hv.k].ext); }
    if (br > bl) {   // растягиваем только кусок вокруг башни
      bl = Math.max(0, Math.floor(bl / SHK)); bt = Math.max(0, Math.floor(bt / SHK)); br = Math.min(shc.width, Math.ceil(br / SHK) + 2); bb = Math.min(shc.height, Math.ceil(bb / SHK) + 2);
      if (br > bl && bb > bt) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.42; ctx.imageSmoothingEnabled = true; ctx.drawImage(shc, bl, bt, br - bl, bb - bt, bl * SHK * DPR, bt * SHK * DPR, (br - bl) * SHK * DPR, (bb - bt) * SHK * DPR); ctx.globalAlpha = 1; }
    }
    const sh = (b) => drawBody(ctx, b[0], b[1] + sx0 / camS, b[2] - sy0 / camS, b[3]);
    vb.list.forEach(sh);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S) drawMarks();
    if (hv) drawHover(hv);
    // пыль
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], sp = (play || replay) ? speedAt(play || replay) : 1; p.life += dt * sp;
      if (p.life > p.max) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt * sp; p.y += p.vy * dt * sp; p.vy -= 0.6 * dt * sp; p.vx *= 1 - dt * sp;
      const t = p.life / p.max, r = (p.r + t * 0.35) * camS;
      ctx.globalAlpha = (1 - t) * (1 - t) * 0.42; ctx.fillStyle = "#fbe7d6"; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // замедление: кинополосы и виньетка
    const v = play || replay, slowNow = v && v.started && speedAt(v) < 0.7 ? 1 : 0;
    slowK += (slowNow - slowK) * Math.min(1, dt * 5);
    if (slowK > 0.01) {
      const vg = ctx.createRadialGradient(SW / 2, SH / 2, SH * 0.25, SW / 2, SH / 2, SH * 0.75);
      vg.addColorStop(0, "rgba(10,0,20,0)"); vg.addColorStop(1, `rgba(10,0,20,${0.55 * slowK})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, SW, SH);
      const bh = SH * 0.075 * slowK; ctx.fillStyle = "rgba(6,0,12,.92)"; ctx.fillRect(0, 0, SW, bh); ctx.fillRect(0, SH - bh, SW, bh);
      if (replay) { ctx.globalAlpha = slowK; ctx.fillStyle = "#fff"; ctx.font = "15px 'Russo One', sans-serif"; ctx.textAlign = "left"; ctx.fillText("● ПОВТОР", 14, SH - bh / 2 + 5); ctx.globalAlpha = 1; }
    }
    if (S && S.ph === "aim") drawMeter(dt);
    if (S && S.ph === "aim" && !play) drawNext();
  }
  function hoverPiece() {
    if (!S || S.ph !== "aim" || play || replay) return null;
    let x = aim.x, a = aim.a;
    if (!canAct() && remote && !botHere()) { remote.x += (remote.tx - remote.x) * 0.25; remote.a += (remote.ta - remote.a) * 0.25; x = remote.x; a = remote.a; }
    const k = S.kind;
    return { k, x, a, y: dropY(S, k, a) + Math.sin(time * 2.4) * 0.04 };
  }
  function drawHover(h) {
    const e = extents(h.k, h.a), mine = canAct();
    // направляющие вниз
    const yb = Y(0), yt = Y(h.y + e.lo);
    const g = ctx.createLinearGradient(0, yt, 0, yb); g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
    for (const xx of [h.x + e.l, h.x + e.r]) { ctx.beginPath(); ctx.moveTo(X(xx), yt); ctx.lineTo(X(xx), yb); ctx.stroke(); }
    ctx.setLineDash([]);
    drawBody(ctx, h.k, h.x, h.y, h.a, { glow: mine ? 0.35 + 0.25 * Math.sin(time * 5) : 0.15, ghost: mine ? 1 : 0.85 });
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function drawMarks() {
    const h = S.ph === "aim" && !play ? S.h : null;
    ctx.font = "13px 'Russo One', sans-serif"; ctx.textBaseline = "middle";
    const best = Math.max(bestH, S.best || 0);
    if (best > (S.h || 0) + 0.25) {
      const y = Y(best);
      ctx.strokeStyle = "rgba(255,210,63,.7)"; ctx.lineWidth = 1.5; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(X(-PH - 0.4), y); ctx.lineTo(X(PH + 0.4), y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ffd23f"; ctx.textAlign = "right"; label(`🏆 ${best.toFixed(1)} м`, X(PH + 0.4) - 2, y - 11);
    }
    if (h != null && h > 0.8) {
      const y = Y(h);
      let lx = PH; for (const b of S.bodies) { const e = extents(b[0], b[3]); if (b[2] + e.hi > h - 0.35) lx = Math.min(lx, b[1] + e.l); }
      ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(62, y); ctx.lineTo(Math.max(64, X(lx) - 6), y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#fff"; ctx.textAlign = "left"; label(`${h.toFixed(1)} м`, 12, y);
    }
  }
  function label(t, x, y) { ctx.lineWidth = 4; ctx.strokeStyle = "rgba(30,8,50,.75)"; ctx.lineJoin = "round"; ctx.strokeText(t, x, y); ctx.fillText(t, x, y); }
  function staticRisk(S0) {
    if (!S0 || !S0.bodies.length) return 0;
    let mx = 0, mt = 0, edge = 0;
    for (const b of S0.bodies) { const K = KINDS[b[0]], m = K.ext * K.ext; mx += m * b[1]; mt += m; if (Math.abs(b[1]) > PH - 0.5) edge++; }
    const com = Math.abs(mx / mt) / PH;
    return clamp(0.06 + com * 0.55 + (S0.h || 0) * 0.035 + (S0.shift || 0) * 0.35 + edge * 0.05, 0, 0.97);
  }
  function drawMeter(dt) {
    const target = Math.max(risk, wobbleDyn);
    wobbleDyn *= Math.pow(0.3, dt);
    wobShown += (target - wobShown) * Math.min(1, dt * 4);
    const v = clamp(wobShown + Math.sin(time * 23) * 0.012 * (1 + wobShown * 4) + Math.sin(time * 37) * 0.008 * wobShown * 4, 0, 1);
    const x = SW - 24, h = Math.min(170, SH * 0.24), y0 = topPad - 14, w = 14;
    ctx.fillStyle = "rgba(18,10,38,.55)"; rr(ctx, x - w / 2 - 4, y0 - 4, w + 8, h + 8, 11); ctx.fill();
    const g = ctx.createLinearGradient(0, y0 + h, 0, y0); g.addColorStop(0, "#38d16a"); g.addColorStop(0.5, "#ffd23f"); g.addColorStop(1, "#ff3b3b");
    ctx.save(); rr(ctx, x - w / 2, y0, w, h, 7); ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fillRect(x - w / 2, y0, w, h);
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y0 + h * (1 - v), w, h * v);
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(x - w / 2 + 2, y0, 3, h);
    ctx.restore();
    ctx.font = "18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(v < 0.3 ? "🙂" : v < 0.6 ? "😬" : "😱", x, y0 + h + 18);
    ctx.font = "11px 'Russo One', sans-serif"; ctx.fillStyle = "#fff"; label(`${Math.round(v * 100)}%`, x, y0 + h + 38);
  }
  function drawNext() {
    const k = kindFor(S.seed, S.round, S.n + 1), K = KINDS[k];
    const x = 14, y = topPad - 14, w = 58, h = 50;
    ctx.fillStyle = "rgba(18,10,38,.55)"; rr(ctx, x, y, w, h, 11); ctx.fill();
    ctx.font = "9px 'Russo One', sans-serif"; ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("ДАЛЕЕ", x + w / 2, y + 9);
    const sc = 18 / Math.max(0.8, K.ext), s0 = camS, t0 = camTop;
    camS = sc; camTop = 0;   // временно рисуем в мини-масштабе
    const cx = x + w / 2, cy = y + 30;
    drawBody(ctx, k, (cx - SW / 2) / sc, -(cy - topPad) / sc, 0);
    camS = s0; camTop = t0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  // башня для экрана меню
  const DEMO = [[0, 0, 0.35, 0], [1, 0.15, 0.9, 0], [2, -0.75, 1.55, 0], [11, 0.75, 1.5, 0], [13, 0, 2.15, 0.02], [5, -0.3, 2.86, 0], [4, 0.95, 2.72, 0], [3, -0.4, 4.24, 0], [7, 0.55, 3.82, 0]];

  // ---------- ввод ----------
  const ptrs = new Map();
  let twist = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!canAct()) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; twist = { ang: Math.atan2(b.y - a.y, b.x - a.x), base: aim.a }; }
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId); if (!p || !canAct()) return;
    if (ptrs.size === 1) { aim.x = clampX(aim.x + (e.clientX - p.x) / camS * 1.05); }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2 && twist) { const [a, b] = [...ptrs.values()]; let d = Math.atan2(b.y - a.y, b.x - a.x) - twist.ang; aim.a = twist.base - d; }
    sendAim();
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) twist = null; if (canAct()) { tips++; sendAim(true); } };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  function rotBtn(el, dir) {
    let iv = null, to = null;
    const stepR = () => { if (!canAct()) return; aim.a = Math.round((aim.a + dir * PI / 12) / (PI / 12)) * (PI / 12); FX.click(); T.haptic("select"); sendAim(true); };
    const stop = () => { clearTimeout(to); clearInterval(iv); to = iv = null; el.classList.remove("dn"); };
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.classList.add("dn"); stepR(); to = setTimeout(() => { iv = setInterval(stepR, 110); }, 330); });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => el.addEventListener(t, stop));
  }
  rotBtn($("rl"), 1); rotBtn($("rr"), -1);
  $("drop").addEventListener("click", () => { if (canAct()) { tips++; tryDrop(); } });
  const keys = {};
  addEventListener("keydown", (e) => {
    keys[e.code] = 1;
    if (!canAct()) return;
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); tryDrop(); }
    if (e.code === "KeyQ" || e.code === "ArrowUp") { aim.a += PI / 12; sendAim(true); }
    if (e.code === "KeyE" || e.code === "ArrowDown") { aim.a -= PI / 12; sendAim(true); }
  });
  addEventListener("keyup", (e) => { keys[e.code] = 0; });
  $("snd").onclick = (e) => { e.stopPropagation(); const o = FX.toggle(); $("snd").textContent = o ? "🔊" : "🔇"; };
  $("snd").textContent = FX.on ? "🔊" : "🔇";
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest(".btn, .chip, .pt-btn, .pt-chip"); if (b) FX.click(); }, true);

  // ---------- цикл ----------
  let last = 0, hudT = 0;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (S) {
      if (play) { computeTick(play.started ? 6 : 10); advancePlay(play, dt); }
      else if (replay) advancePlay(replay, dt);
      else if (S.ph === "aim") {
        if (canAct()) { const mv = (keys.ArrowLeft || keys.KeyA ? -1 : 0) + (keys.ArrowRight || keys.KeyD ? 1 : 0); if (mv) { aim.x = clampX(aim.x + mv * dt * 2.6); sendAim(); } }
        botTick(ts, dt);
        if (mode === "online" && !isBot(S.turn)) {
          const left = TURN_SEC - (ts - turnT0) / 1000, tm = document.querySelector("[data-tm]");
          if (tm) tm.style.transform = `scaleX(${clamp(left / TURN_SEC, 0, 1)})`;
          if (left <= 0 && canAct()) dropNow(aim.x, aim.a);
          else if (left <= -8 && isHost() && S.turn !== cfg.me) { const r = remote || { x: 0, a: 0 }; dropNow(r.tx != null ? r.tx : r.x, r.ta != null ? r.ta : r.a); }
        }
        if (myDrop && !play && S.auth === false && ts - myDrop.t > 4000) { myDrop.t = ts; send("drop", myDrop.d); }
        idleCreak -= dt;
        if (idleCreak <= 0) { idleCreak = 2.5 + Math.random() * 4; if (risk > 0.42 && S.bodies.length > 3) FX.creak(risk * 0.5); }
      }
      hudT -= dt; if (hudT <= 0) { hudT = 0.25; status(); }
    }
    render(dt);
    requestAnimationFrame(frame);
  }

  // ---------- старт ----------
  function begin(c, m) {
    room = c.room; cfg = c.cfg; mode = m; S = null; play = null; replay = null; pending = null; lastSim = null; endShown = false; handFor = -1; overFor = -1; aimFor = -1; tips = 0;
    cfg.players.forEach((p, i) => { if (!p.color) p.color = COLORS[i % 4]; });
    ["screen-menu", "screen-end", "round", "handoff"].forEach((s) => $(s).classList.add("hidden"));
    ["hud", "bar"].forEach((s) => $(s).classList.remove("hidden"));
    resize();
    if (room) bindRoom();
    if (isHost()) newGame(); else $("status").textContent = "Подключаемся…";
  }
  const LVN = ["Лёгкий", "Средний", "Мастер"];
  let nBots = 1, nLocal = 2;
  try { const lv = localStorage.getItem("shatkaya_lvl"), v = +lv; if (lv !== null && v >= 0 && v <= 2) level = v; const b = +localStorage.getItem("shatkaya_bots"); if (b >= 1 && b <= 3) nBots = b; } catch (_) {}
  function chips(id, get, set) {
    const all = document.querySelectorAll(`#${id} .chip`), draw = () => all.forEach((b) => b.classList.toggle("on", +b.dataset.v === get()));
    all.forEach((b) => b.onclick = () => { set(+b.dataset.v); draw(); }); draw();
  }
  chips("c-lvl", () => level, (v) => { level = v; try { localStorage.setItem("shatkaya_lvl", v); } catch (_) {} });
  chips("c-bots", () => nBots, (v) => { nBots = v; try { localStorage.setItem("shatkaya_bots", v); } catch (_) {} });
  chips("c-local", () => nLocal, (v) => { nLocal = v; });
  const PARTY = { title: "Шаткая башня", icon: "🗼", max: 4, bots: 0, text: "Го строить шаткую башню 🗼 Кто уронит — тот проиграл!",
    modes: [{ id: "ffa", name: "Каждый сам за себя" }], onCancel: () => $("screen-menu").classList.remove("hidden") };
  $("m-bots").onclick = () => {
    const nm = T.playerName && T.playerName() !== "Друг" ? T.playerName() : "Ты", pl = [{ id: "me", name: nm }];
    for (let i = 0; i < nBots; i++) pl.push({ id: "bot" + i, name: nBots > 1 ? `🤖 Бот ${i + 1}` : `🤖 Бот · ${LVN[level]}`, bot: true });
    begin({ room: null, cfg: { me: 0, players: pl } }, "bot");
  };
  $("m-local").onclick = () => { const pl = []; for (let i = 0; i < nLocal; i++) pl.push({ id: "p" + i, name: `Игрок ${i + 1}` }); begin({ room: null, cfg: { me: 0, players: pl } }, "local"); };
  $("m-party").onclick = async () => { $("screen-menu").classList.add("hidden"); begin(await Party.host("shatkaya", PARTY), "online"); };
  $("m-menu").onclick = () => { location.href = "../"; };
  function bestText() { $("best-menu").textContent = bestH > 0 ? `🏆 Рекорд высоты: ${bestH.toFixed(1)} м` : ""; }
  T.loadBest("shatkaya_best", (v) => { bestH = Math.max(bestH, (v || 0) / 100); bestText(); });
  addEventListener("resize", resize);
  T.init({ header: "#2a1846", bg: "#2a1846", back: "../" });
  const inv = Net.readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join("shatkaya", inv, PARTY).then((c) => begin(c, "online")); }
  resize();
  requestAnimationFrame(frame);
  window.__game = {
    get S() { return S; }, get cfg() { return cfg; }, get mode() { return mode; }, get play() { return play; }, get replay() { return replay; }, get lastSim() { return lastSim; },
    get aim() { return aim; }, syncLog, KINDS, canAct, autoDrop, runSim, judge, kindFor, topY, dropY,
    drop(x, a) { if (!canAct()) return false; aim.x = x; aim.a = a || 0; return dropNow(x, aim.a); },
    nextRound, startReplay, newGame, setLevel(v) { level = v; }, hand() { $("hand-go").click(); }, get cam() { return { top: camTop, s: camS }; }
  };
})();
