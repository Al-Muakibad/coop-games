/* Танчики — защита штаба от волн танков, соло или онлайн-кооп вдвоём. Набор «Кооп-игры».
   Механика в духе классических 8-битных «танчиков»; уровни, графика и названия — свои. */
(function () {
  "use strict";
  const T = window.TG, $ = (id) => document.getElementById(id);
  const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
  const U = 8, N = 26, SZ = N * U;                   // клетка 8 px, поле 26×26 клеток
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];      // 0 вверх, 1 вправо, 2 вниз, 3 влево
  const BASE = { x: 12 * U, y: 24 * U };
  const SPAWN_P = [{ x: 8 * U, y: 24 * U }, { x: 16 * U, y: 24 * U }];
  const SPAWN_E = [{ x: 0, y: 0 }, { x: 12 * U, y: 0 }, { x: 24 * U, y: 0 }];
  const KINDS = {
    p: { speed: 44, hp: 1 },
    basic: { speed: 28, hp: 1, score: 100, color: "#c3cad4", fire: 1.0 },
    fast: { speed: 58, hp: 1, score: 200, color: "#e8edf3", fire: 0.9 },
    power: { speed: 32, hp: 1, score: 300, color: "#a3b1c2", fire: 1.8, bspeed: 200 },
    armor: { speed: 26, hp: 4, score: 400, color: "#7d8796", fire: 1.1 }
  };
  const PCOL = ["#f5c518", "#4ade80"];
  const BONUSES = ["star", "helmet", "grenade", "clock", "shovel", "life"];
  const BICON = { star: "⭐", helmet: "⛑️", grenade: "💣", clock: "⏱️", shovel: "🧱", life: "❤️" };

  // Уровни: 13×13 крупных клеток. . пусто, B кирпич, S бетон, W вода, G кусты
  const LEVELS = [
    [".............", ".B.B.B.B.B.B.", ".B.B.B.B.B.B.", ".B.B.BSB.B.B.", ".B.B.B.B.B.B.", ".....B.B.....", "B.BB.....BB.B",
     "S....B.B....S", ".B.B.BBB.B.B.", ".B.B.B.B.B.B.", ".B.B.....B.B.", ".B.B.....B.B.", "............."],
    ["...S...S.....", ".B.S.....B.B.", ".BGG..BB.B.S.", "..GG...S.....", "W...BB..WWG.B", "WWW..B..W..G.", ".GW.SS..W.BB.",
     ".G...BBGG..B.", "..BBB.BGGB.B.", "SS..B.B..G...", "..B.B.....BB.", ".BB.......B.B", "............."],
    ["....GG.GG....", ".SS.B...B.SS.", ".S..B.B.B..S.", "...WWW.WWW...", "BB.........BB", "..GGBBSBBGG..", "S...B...B...S",
     "..WW.B.B.WW..", ".B....B....B.", ".BGG.B.B.GGB.", ".B.B.....B.B.", "...B.....B...", "............."]
  ];
  const WAVES = [
    "bbbbbbbbbbbbbbffffpa".split(""), "bbbbffffffppppaaaabb".split(""), "ffffppppaaaabbffppaa".split("")
  ];
  const KMAP = { b: "basic", f: "fast", p: "power", a: "armor" };

  // ---------- экран ----------
  const canvas = $("game"), ctx = canvas.getContext("2d");
  let FW = 300;
  function resize() {
    FW = Math.floor(Math.min(innerWidth - 16, innerHeight - 260, 560));
    document.documentElement.style.setProperty("--fw", FW + "px");
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(FW * dpr); canvas.height = Math.round(FW * dpr);
  }
  addEventListener("resize", resize); resize();

  // ---------- состояние ----------
  let mode = null, room = null, phase = "menu", lastNet = 0;
  let G = null;                        // мир (живёт у хозяина; у гостя — снимок)
  let inputs = [{ d: -1, f: false }, { d: -1, f: false }];
  let myIdx = 0, snapPrev = null, snapCur = null, snapT = 0, mapV = -1;
  let fx = [], msgT = 0, me = T.playerName() === "Друг" ? "Ты" : T.playerName(), opp = "Друг";
  const isHost = () => !room || room.isHost;
  const send = (t, d) => { if (room) room.send(t, d); };

  function msg(t, ms) { const el = $("msg"); el.innerHTML = t; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1500); }

  // ---------- звук ----------
  const Snd = (() => {
    let ac = null;
    const A = () => { if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} if (ac && ac.state === "suspended") ac.resume(); return ac; };
    function tone(f, d, v, type, slide) { const a = A(); if (!a) return; const o = a.createOscillator(), g = a.createGain(); o.type = type || "square"; o.frequency.value = f; if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + d); g.gain.setValueAtTime(v, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + d); }
    function noise(d, v, f) { const a = A(); if (!a) return; const len = Math.floor(a.sampleRate * d), b = a.createBuffer(1, len, a.sampleRate), c = b.getChannelData(0); for (let i = 0; i < len; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / len); const s = a.createBufferSource(); s.buffer = b; const fl = a.createBiquadFilter(); fl.frequency.value = f || 1200; const g = a.createGain(); g.gain.value = v; s.connect(fl); fl.connect(g); g.connect(a.destination); s.start(); }
    return { unlock: A, shot() { tone(440, 0.07, 0.12, "square", 220); }, boom(big) { noise(big ? 0.6 : 0.25, big ? 0.6 : 0.35, big ? 600 : 1500); }, brick() { noise(0.06, 0.2, 2500); }, steel() { tone(1200, 0.05, 0.1, "square"); }, bonus() { [660, 880, 1100].forEach((f, i) => setTimeout(() => tone(f, 0.09, 0.15), i * 70)); } };
  })();

  // ---------- карта ----------
  function buildMap(lv) {
    const L = LEVELS[lv % LEVELS.length], m = new Uint8Array(N * N);
    const code = { ".": 0, B: 1, S: 2, W: 3, G: 4 };
    for (let by = 0; by < 13; by++) for (let bx = 0; bx < 13; bx++) {
      const v = code[L[by][bx]] || 0;
      for (let k = 0; k < 4; k++) m[(by * 2 + (k >> 1)) * N + bx * 2 + (k & 1)] = v;
    }
    // штаб и кирпичное кольцо вокруг, места появления — свободны
    for (let y = 22; y < N; y++) for (let x = 10; x < 16; x++) m[y * N + x] = 0;
    for (const s of [...SPAWN_P, ...SPAWN_E]) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) m[(s.y / U + y) * N + s.x / U + x] = 0;
    ring(m, 1);
    return m;
  }
  function ring(m, v) { for (let y = 23; y < 26; y++) { m[y * N + 11] = v; m[y * N + 14] = v; } m[23 * N + 12] = v; m[23 * N + 13] = v; }
  const cell = (m, x, y) => (x < 0 || y < 0 || x >= N || y >= N ? 2 : m[y * N + x]);

  // ---------- мир (хозяин) ----------
  let idc = 1;
  function newWorld(coop) {
    G = { lv: 0, map: buildMap(0), mapV: 1, tanks: [], bullets: [], queue: WAVES[0].slice(), killed: 0, spawnT: 1, spawnI: 0, bonusN: 0,
      bonus: null, frozen: 0, shovel: 0, base: true, over: false, score: 0, lives: [2, coop ? 2 : 0], out: [false, !coop], stars: [0, 0], players: coop ? 2 : 1, state: "play", stateT: 0, events: [] };
    for (let i = 0; i < G.players; i++) spawnPlayer(i);
  }
  function spawnPlayer(i) {
    const s = SPAWN_P[i];
    G.tanks.push({ id: idc++, team: "p", pi: i, kind: "p", x: s.x, y: s.y, dir: 0, hp: 1, cool: 0, shield: 3, spawn: 0.8, moving: false, anim: 0 });
  }
  function spawnEnemy() {
    let s = null;
    for (let i = 0; i < 3 && !s; i++) { const c = SPAWN_E[G.spawnI++ % 3]; if (!G.tanks.some((o) => rectHit(c, o, 16, 16, 16, 16))) s = c; }
    if (!s) return false;
    const k = KMAP[G.queue.shift()];
    G.bonusN++;
    G.tanks.push({ id: idc++, team: "e", kind: k, x: s.x, y: s.y, dir: 2, hp: KINDS[k].hp, cool: 1, shield: 0, spawn: 0.9, moving: true, anim: 0,
      carrier: [4, 11, 18].includes(G.bonusN), turnT: 0.5 + Math.random() * 2 });
    return true;
  }
  const rectHit = (a, b, aw, ah, bw, bh) => a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
  function free(t, x, y) {
    if (x < 0 || y < 0 || x > SZ - 16 || y > SZ - 16) return false;
    for (let cy = Math.floor(y / U); cy <= Math.floor((y + 15.9) / U); cy++)
      for (let cx = Math.floor(x / U); cx <= Math.floor((x + 15.9) / U); cx++) { const v = cell(G.map, cx, cy); if (v === 1 || v === 2 || v === 3) return false; }
    if (G.base !== null && rectHit({ x, y }, BASE, 16, 16, 16, 16)) return false;
    for (const o of G.tanks) if (o !== t && o.hp > 0 && rectHit({ x, y }, o, 16, 16, 16, 16) && !rectHit(t, o, 16, 16, 16, 16)) return false;
    return true;
  }
  function moveTank(t, dir, dt) {
    if (dir !== t.dir) {
      if ((dir & 1) !== (t.dir & 1)) {             // поворот на 90° — выравниваем по сетке
        const nx = dir & 1 ? t.x : Math.round(t.x / U) * U, ny = dir & 1 ? Math.round(t.y / U) * U : t.y;
        if (free(t, nx, ny)) { t.x = nx; t.y = ny; }
      }
      t.dir = dir;
    }
    const sp = KINDS[t.kind].speed * dt;
    const nx = t.x + DX[dir] * sp, ny = t.y + DY[dir] * sp;
    if (free(t, nx, ny)) { t.x = nx; t.y = ny; t.anim += sp; return true; }
    return false;
  }
  function fire(t) {
    const maxB = t.team === "p" && G.stars[t.pi] >= 2 ? 2 : 1;
    if (t.cool > 0 || G.bullets.filter((b) => b.owner === t.id).length >= maxB) return;
    const sp = t.team === "p" ? (G.stars[t.pi] >= 1 ? 210 : 150) : (KINDS[t.kind].bspeed || 130);
    G.bullets.push({ x: t.x + 8 + DX[t.dir] * 8, y: t.y + 8 + DY[t.dir] * 8, dir: t.dir, sp, owner: t.id, team: t.team, power: t.team === "p" && G.stars[t.pi] >= 3 });
    t.cool = t.team === "p" ? 0.22 : KINDS[t.kind].fire;
    if (t.team === "p") G.events.push(["shot"]);
  }
  function boom(x, y, big) { G.events.push(["boom", Math.round(x), Math.round(y), big ? 1 : 0]); }

  function stepWorld(dt) {
    if (G.state === "over") return;
    if (G.state === "level") { G.stateT -= dt; if (G.stateT <= 0) nextLevel(); return; }
    G.frozen = Math.max(0, G.frozen - dt);
    if (G.shovel > 0) { G.shovel -= dt; if (G.shovel <= 0) { ring(G.map, 1); G.mapV++; } }
    if (G.bonus) { G.bonus.t -= dt; if (G.bonus.t <= 0) G.bonus = null; }
    // появление врагов
    G.spawnT -= dt;
    const enemies = G.tanks.filter((t) => t.team === "e");
    if (G.spawnT <= 0 && G.queue.length && enemies.length < 4) G.spawnT = spawnEnemy() ? 2.6 : 0.4;
    // танки
    for (const t of G.tanks) {
      if (t.spawn > 0) { t.spawn -= dt; continue; }
      t.cool -= dt; t.shield = Math.max(0, t.shield - dt);
      if (t.team === "p") {
        const inp = inputs[t.pi];
        t.moving = inp.d >= 0 && moveTank(t, inp.d, dt);
        if (inp.d >= 0 && !t.moving) t.dir = inp.d;
        if (inp.f) fire(t);
        if (G.bonus && rectHit(t, G.bonus, 16, 16, 16, 16)) takeBonus(t);
      } else if (!G.frozen) {
        t.turnT -= dt;
        const moved = moveTank(t, t.dir, dt);
        if (!moved || t.turnT <= 0) {
          const toBase = Math.random() < 0.45;
          let d;
          if (toBase) d = Math.abs(t.x - BASE.x) > 24 && Math.random() < 0.5 ? (t.x < BASE.x ? 1 : 3) : 2;
          else d = Math.floor(Math.random() * 4);
          if (!moved && d === t.dir) d = (d + 1 + Math.floor(Math.random() * 3)) % 4;
          t.dir = d; t.turnT = 0.6 + Math.random() * 2.2;
        }
        if (t.cool <= 0 && Math.random() < dt * 1.5) fire(t);
      }
    }
    // пули
    for (const b of G.bullets) {
      let dist = b.sp * dt;
      while (dist > 0 && !b.dead) {
        const s = Math.min(2, dist); dist -= s;
        b.x += DX[b.dir] * s; b.y += DY[b.dir] * s;
        bulletHit(b);
      }
    }
    G.bullets = G.bullets.filter((b) => !b.dead);
    // пули сталкиваются друг с другом
    for (let i = 0; i < G.bullets.length; i++) for (let j = i + 1; j < G.bullets.length; j++) {
      const a = G.bullets[i], c = G.bullets[j];
      if (a.team !== c.team && Math.abs(a.x - c.x) < 4 && Math.abs(a.y - c.y) < 4) { a.dead = c.dead = true; }
    }
    G.bullets = G.bullets.filter((b) => !b.dead);
    // конец уровня / игры
    if (!G.queue.length && !G.tanks.some((t) => t.team === "e") && G.state === "play") { G.state = "level"; G.stateT = 3; G.events.push(["level"]); }
    const alive = G.tanks.some((t) => t.team === "p"), allOut = G.out.slice(0, G.players).every(Boolean);
    if (!G.base || (!alive && allOut)) { G.state = "over"; G.events.push(["over", G.base ? 0 : 1]); }
  }
  function bulletHit(b) {
    if (b.x < 0 || b.y < 0 || b.x > SZ || b.y > SZ) { b.dead = true; return; }
    const vert = b.dir % 2 === 0;
    const r = vert ? { x: b.x - 6, y: b.y - 2, w: 12, h: 4 } : { x: b.x - 2, y: b.y - 6, w: 4, h: 12 };
    let hitWall = false, steel = false;
    const cells = [];
    for (let cy = Math.floor(r.y / U); cy <= Math.floor((r.y + r.h - 0.1) / U); cy++)
      for (let cx = Math.floor(r.x / U); cx <= Math.floor((r.x + r.w - 0.1) / U); cx++) {
        const v = cell(G.map, cx, cy);
        if (v === 1) { hitWall = true; cells.push([cx, cy]); }
        if (v === 2) { hitWall = true; steel = true; if (b.power) cells.push([cx, cy]); }
      }
    // попадание засчитываем, только если сама пуля (4×4) задела стену
    const core = cell(G.map, Math.floor(b.x / U), Math.floor(b.y / U));
    if (hitWall && (core === 1 || core === 2 || cells.length)) {
      const coreHit = [1, 2].includes(cell(G.map, Math.floor((b.x - 1.5) / U), Math.floor((b.y - 1.5) / U))) || [1, 2].includes(cell(G.map, Math.floor((b.x + 1.5) / U), Math.floor((b.y + 1.5) / U)));
      if (coreHit) {
        for (const [cx, cy] of cells) G.map[cy * N + cx] = 0;
        if (cells.length) { G.mapV++; if (b.team === "p") G.events.push(["brick"]); }
        else if (b.team === "p") G.events.push(["steel"]);
        b.dead = true; return;
      }
    }
    if (G.base && rectHit({ x: b.x - 2, y: b.y - 2 }, BASE, 4, 4, 16, 16)) { G.base = false; b.dead = true; boom(BASE.x + 8, BASE.y + 8, true); return; }
    for (const t of G.tanks) {
      if (t.id === b.owner || t.spawn > 0 || t.hp <= 0) continue;
      if (!rectHit({ x: b.x - 2, y: b.y - 2 }, t, 4, 4, 16, 16)) continue;
      if (t.team === b.team) { if (t.team === "p") { b.dead = true; t.stun = 1.5; } continue; }
      b.dead = true;
      if (t.team === "p") {
        if (t.shield > 0) return;
        killPlayer(t);
      } else {
        if (t.carrier) { t.carrier = false; dropBonus(); }
        t.hp--;
        if (t.hp <= 0) killEnemy(t, b);
        else G.events.push(["steel"]);
      }
      return;
    }
  }
  function killEnemy(t) {
    t.hp = 0; G.tanks = G.tanks.filter((o) => o !== t); G.killed++; G.score += KINDS[t.kind].score;
    boom(t.x + 8, t.y + 8, true);
  }
  function killPlayer(t) {
    t.hp = 0; G.tanks = G.tanks.filter((o) => o !== t); boom(t.x + 8, t.y + 8, true);
    G.stars[t.pi] = 0;
    if (G.lives[t.pi] > 0) {
      G.lives[t.pi]--;
      const g = G;
      setTimeout(() => { if (G === g && G.state !== "over" && !G.tanks.some((x) => x.team === "p" && x.pi === t.pi)) spawnPlayer(t.pi); }, 1500);
    } else G.out[t.pi] = true;
  }
  function dropBonus() {
    for (let i = 0; i < 50; i++) {
      const x = Math.floor(Math.random() * 24) * U, y = Math.floor(Math.random() * 22) * U;
      if (cell(G.map, x / U, y / U) !== 3) { G.bonus = { x, y, type: BONUSES[Math.floor(Math.random() * BONUSES.length)], t: 15 }; G.events.push(["bonusdrop"]); return; }
    }
  }
  function takeBonus(t) {
    const k = G.bonus.type; G.bonus = null; G.score += 500; G.events.push(["bonus", k, t.pi]);
    if (k === "star") G.stars[t.pi] = Math.min(3, G.stars[t.pi] + 1);
    if (k === "helmet") t.shield = 10;
    if (k === "grenade") for (const e of G.tanks.filter((o) => o.team === "e" && o.spawn <= 0)) killEnemy(e);
    if (k === "clock") G.frozen = 8;
    if (k === "shovel") { ring(G.map, 2); G.shovel = 15; G.mapV++; }
    if (k === "life") G.lives[t.pi]++;
  }
  function nextLevel() {
    G.lv++; G.map = buildMap(G.lv); G.mapV++; G.queue = WAVES[G.lv % WAVES.length].slice(); G.killed = 0; G.bonusN = 0;
    G.bullets = []; G.bonus = null; G.frozen = 0; G.shovel = 0; G.base = true; G.state = "play"; G.spawnT = 1.5;
    G.tanks = [];
    for (let i = 0; i < G.players; i++) if (!G.out[i]) spawnPlayer(i);
    if (G.lv >= LEVELS.length) for (const k of ["basic", "fast", "power", "armor"]) KINDS[k].speed *= 1.08;
  }

  // ---------- снимок для гостя и для отрисовки ----------
  function snapshot() {
    return {
      T: G.tanks.map((t) => [t.id, t.team === "p" ? "p" + t.pi : t.kind, Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10, t.dir,
        (t.shield > 0 ? 1 : 0) | (t.spawn > 0 ? 2 : 0) | (t.carrier ? 4 : 0) | (t.moving || t.team === "e" ? 8 : 0), t.hp]),
      B: G.bullets.map((b) => [Math.round(b.x), Math.round(b.y), b.dir]),
      bo: G.bonus ? [G.bonus.x, G.bonus.y, G.bonus.type, G.bonus.t] : null,
      L: G.lives, S: G.score, Q: G.queue.length + G.tanks.filter((t) => t.team === "e").length, lv: G.lv, fr: G.frozen > 0 ? 1 : 0,
      base: G.base ? 1 : 0, mv: G.mapV, st: G.state, ev: G.events.splice(0), stars: G.stars
    };
  }

  // ---------- цикл ----------
  let last = 0, acc = 0, mapSentT = 0, mapSentV = -1;
  function frame(ts) {
    const dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
    if (phase === "play") {
      if (isHost() && G) {
        acc += dt; while (acc >= 1 / 60) { stepWorld(1 / 60); acc -= 1 / 60; }
        const snap = snapshot();
        handleEvents(snap.ev);
        snapCur = snap;
        if (room) {
          lastNet += dt;
          if (lastNet >= 1 / 15) { send("s", Object.assign({}, snap, { ev: netEvents.splice(0) })); lastNet = 0; }
          mapSentT -= dt;
          if (G.mapV !== mapSentV || mapSentT <= 0) { send("m", { v: G.mapV, m: mapStr(G.map) }); mapSentV = G.mapV; mapSentT = 2; }
        }
        if (snap.st === "over" && phase === "play") setTimeout(() => endGame(snap), 1200), phase = "ending";
      } else if (!isHost()) {
        snapT += dt;
        inSentT -= dt; if (inSentT <= 0) { sendInput(); }
      }
      hud();
    }
    render(dt);
    requestAnimationFrame(frame);
  }
  let netEvents = [];
  function handleEvents(ev) {
    for (const e of ev) {
      netEvents.push(e);
      playEvent(e);
    }
  }
  function playEvent(e) {
    if (e[0] === "boom") { fx.push({ x: e[1], y: e[2], big: e[3], t: 0 }); Snd.boom(e[3]); T.haptic("impact", e[3] ? "heavy" : "light"); }
    if (e[0] === "shot") Snd.shot();
    if (e[0] === "brick") Snd.brick();
    if (e[0] === "steel") Snd.steel();
    if (e[0] === "bonus") { Snd.bonus(); msg({ star: "⭐ Пушка мощнее", helmet: "⛑️ Щит!", grenade: "💣 Все враги взорваны!", clock: "⏱️ Враги заморожены", shovel: "🧱 Штаб в бетоне", life: "❤️ +1 жизнь" }[e[1]], 1500); }
    if (e[0] === "bonusdrop") Snd.bonus();
    if (e[0] === "level") { msg("Уровень пройден! 🎉", 2500); T.haptic("notify", "success"); }
  }
  const mapStr = (m) => Array.from(m).join("");

  // ---------- гость ----------
  let inSentT = 0, lastIn = "";
  function sendInput() {
    const k = inputs[myIdx].d + ":" + (inputs[myIdx].f ? 1 : 0);
    send("in", { d: inputs[myIdx].d, f: inputs[myIdx].f });
    lastIn = k; inSentT = 0.3;
  }
  let guestMap = null;
  function onSnap(s) {
    snapPrev = snapCur; snapCur = s; snapT = 0;
    for (const e of s.ev || []) playEvent(e);
    if (s.st === "over" && phase === "play") { phase = "ending"; setTimeout(() => endGame(s), 1200); }
  }

  // ---------- отрисовка ----------
  const tankPos = (row) => {
    if (isHost() || !snapPrev) return [row[2], row[3]];
    const p = snapPrev.T.find((r) => r[0] === row[0]); if (!p) return [row[2], row[3]];
    const k = Math.min(1, snapT * 15);
    return [p[2] + (row[2] - p[2]) * k, p[3] + (row[3] - p[3]) * k];
  };
  function drawCell(c, x, y, v, t) {
    if (v === 1) {
      c.fillStyle = "#9c4a24"; c.fillRect(x, y, U, U);
      c.fillStyle = "#c8632f"; c.fillRect(x, y, U - 1, 3); c.fillRect(x + (y % 16 ? 0 : 0), y + 4, 3, 3); c.fillRect(x + 4, y + 4, U - 5, 3);
      c.fillStyle = "#e0a07a"; c.fillRect(x, y, U - 1, 1);
    } else if (v === 2) {
      c.fillStyle = "#7c8794"; c.fillRect(x, y, U, U); c.fillStyle = "#c9d1da"; c.fillRect(x + 1, y + 1, U - 3, U - 3); c.fillStyle = "#e9eef3"; c.fillRect(x + 2, y + 2, 2, 2);
    } else if (v === 3) {
      c.fillStyle = "#1d4ed8"; c.fillRect(x, y, U, U);
      c.fillStyle = "#60a5fa"; const o = Math.floor(t * 4 + x / U) % 4; c.fillRect(x + o, y + 2, 3, 1); c.fillRect(x + ((o + 2) % 4), y + 5, 3, 1);
    }
  }
  function drawTank(c, x, y, dir, col, flags, anim, hp, kind) {
    c.save(); c.translate(x + 8, y + 8); c.rotate(dir * Math.PI / 2);
    if (flags & 2) { const k = (performance.now() / 120) % 2 < 1; c.fillStyle = k ? "#fff" : "#ffd34d"; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 3 : 8; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill(); c.restore(); return; }
    // гусеницы
    c.fillStyle = "#2b2b2b"; c.fillRect(-8, -7, 4, 15); c.fillRect(4, -7, 4, 15);
    c.fillStyle = "#555"; const off = Math.floor(anim) % 3;
    for (let i = -7 + off; i < 8; i += 3) { c.fillRect(-8, i, 4, 1); c.fillRect(4, i, 4, 1); }
    // корпус и башня
    c.fillStyle = col; c.fillRect(-5, -5, 10, 12);
    c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(-5, 4, 10, 3);
    c.fillStyle = col; c.beginPath(); c.arc(0, 1, 3.6, 0, 7); c.fill(); c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 0.8; c.stroke();
    c.fillStyle = "#222"; c.fillRect(-1, -9, 2, 9);
    if (kind === "armor" && hp > 1) { c.fillStyle = ["", "#fff", "#ffd34d", "#f97316", "#ef4444"][hp] || "#fff"; c.fillRect(-2, 4, 4, 2); }
    c.restore();
    if (flags & 1) { c.strokeStyle = `rgba(120,200,255,${0.5 + 0.4 * Math.sin(performance.now() / 60)})`; c.lineWidth = 1.2; c.beginPath(); c.arc(x + 8, y + 8, 10, 0, 7); c.stroke(); }
  }
  let curMap = null;
  function render(dt) {
    const s = canvas.width / SZ;
    ctx.setTransform(s, 0, 0, s, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, SZ, SZ);
    const snap = snapCur;
    const m = isHost() ? (G && G.map) : guestMap;
    if (!m || !snap) return;
    const t = performance.now() / 1000;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = m[y * N + x]; if (v && v !== 4) drawCell(ctx, x * U, y * U, v, t); }
    // штаб
    if (snap.base) {
      ctx.fillStyle = "#5b6b3a"; ctx.fillRect(BASE.x + 1, BASE.y + 4, 14, 12); ctx.fillStyle = "#3e4a27"; ctx.fillRect(BASE.x + 1, BASE.y + 12, 14, 4);
      ctx.fillStyle = "#ddd"; ctx.fillRect(BASE.x + 7, BASE.y, 1.2, 9); ctx.fillStyle = "#ef4444"; ctx.fillRect(BASE.x + 8, BASE.y, 6, 4);
      ctx.fillStyle = "#ffd34d"; ctx.font = "7px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("★", BASE.x + 8, BASE.y + 10);
    } else { ctx.fillStyle = "#3a2a20"; ctx.fillRect(BASE.x + 1, BASE.y + 6, 14, 10); ctx.fillStyle = "#222"; ctx.fillRect(BASE.x + 3, BASE.y + 9, 4, 3); ctx.fillRect(BASE.x + 9, BASE.y + 7, 4, 4); }
    // танки
    for (const r of snap.T) {
      const [x, y] = tankPos(r), kind = r[1];
      let col = kind === "p0" ? PCOL[0] : kind === "p1" ? PCOL[1] : KINDS[kind].color;
      if (r[5] & 4 && Math.floor(t * 6) % 2) col = "#ef4444";
      if (snap.fr && !kind.startsWith("p") && Math.floor(t * 3) % 2) col = "#9ad7ff";
      drawTank(ctx, x, y, r[4], col, r[5], (r[5] & 8 ? t * 30 : 0), r[6], kind);
    }
    // пули
    ctx.fillStyle = "#fff";
    for (const b of snap.B) { const [bx, by] = [b[0], b[1]]; ctx.fillRect(bx - 1.5, by - 1.5, 3, 3); }
    // кусты поверх
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y * N + x] === 4) {
      ctx.fillStyle = "#166534"; ctx.fillRect(x * U, y * U, U, U); ctx.fillStyle = "#22c55e";
      ctx.fillRect(x * U + 1, y * U + 1, 3, 3); ctx.fillRect(x * U + 4, y * U + 4, 3, 3); ctx.fillStyle = "#15803d"; ctx.fillRect(x * U + 4, y * U + 1, 2, 2);
    }
    // бонус
    if (snap.bo && (snap.bo[3] > 3 || Math.floor(t * 6) % 2)) {
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(snap.bo[0], snap.bo[1], 16, 16);
      ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(BICON[snap.bo[2]], snap.bo[0] + 8, snap.bo[1] + 9);
    }
    // взрывы
    fx = fx.filter((f) => (f.t += dt) < 0.45);
    for (const f of fx) {
      const k = f.t / 0.45, r = (f.big ? 13 : 7) * (0.4 + k);
      ctx.fillStyle = `rgba(255,${Math.round(220 - 160 * k)},60,${1 - k})`; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.45, 0, 7); ctx.fill();
    }
    if (snap.st === "level") { ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(0, 0, SZ, SZ); }
  }
  function hud() {
    const s = snapCur; if (!s) return;
    $("t-lv").textContent = `Уровень ${s.lv + 1}` + (s.fr ? " ⏱️" : "");
    $("t-lives").textContent = `🟡 ❤${s.L[0]}` + (mode === "coop" ? `  🟢 ❤${s.L[1]}` : "") + (s.stars ? `  ⭐${s.stars[myIdx]}` : "");
    $("t-score").textContent = s.S;
    const box = $("enemies"); if (box.childElementCount !== s.Q) box.innerHTML = "<i></i>".repeat(Math.max(0, s.Q));
  }

  // ---------- управление ----------
  const pad = $("pad"), knob = $("knob");
  let padId = null;
  function padMove(e) {
    const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy, len = Math.hypot(dx, dy);
    let d = -1;
    if (len > 14) d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    const k = Math.min(1, len / 50);
    knob.style.left = 44 + (dx / (len || 1)) * 46 * k + "px"; knob.style.top = 44 + (dy / (len || 1)) * 46 * k + "px";
    setInput(d, null);
  }
  pad.addEventListener("pointerdown", (e) => { e.preventDefault(); padId = e.pointerId; pad.setPointerCapture(e.pointerId); Snd.unlock(); padMove(e); });
  pad.addEventListener("pointermove", (e) => { if (e.pointerId === padId) padMove(e); });
  const padUp = (e) => { if (e.pointerId !== padId) return; padId = null; knob.style.left = "44px"; knob.style.top = "44px"; setInput(-1, null); };
  pad.addEventListener("pointerup", padUp); pad.addEventListener("pointercancel", padUp);
  const fireBtn = $("fire");
  fireBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); fireBtn.classList.add("on"); Snd.unlock(); setInput(null, true); });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => fireBtn.addEventListener(ev, () => { fireBtn.classList.remove("on"); setInput(null, false); }));
  const keys = {};
  addEventListener("keydown", (e) => {
    const m = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[e.key];
    if (m !== undefined) { keys[m] = true; setInput(m, null); e.preventDefault(); }
    if (e.code === "Space") { setInput(null, true); e.preventDefault(); }
  });
  addEventListener("keyup", (e) => {
    const m = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[e.key];
    if (m !== undefined) { keys[m] = false; const other = [0, 1, 2, 3].find((k) => keys[k]); setInput(other === undefined ? -1 : other, null); }
    if (e.code === "Space") setInput(null, false);
  });
  function setInput(d, f) {
    const inp = inputs[myIdx];
    if (d !== null) inp.d = d; if (f !== null) inp.f = f;
    if (!isHost()) { const k = inp.d + ":" + (inp.f ? 1 : 0); if (k !== lastIn) sendInput(); }
  }

  // ---------- режимы ----------
  function show(id, on) { $(id).classList.toggle("hidden", !on); }
  function startSolo() { mode = "solo"; leave(); myIdx = 0; begin(false); }
  function begin(coop) {
    knob.style.background = PCOL[myIdx];
    show("screen-menu", false); show("screen-end", false);
    phase = "play"; fx = []; inputs = [{ d: -1, f: false }, { d: -1, f: false }];
    for (const k of ["basic", "fast", "power", "armor"]) KINDS[k].speed = { basic: 28, fast: 58, power: 32, armor: 26 }[k];
    if (isHost()) { newWorld(coop); snapCur = snapshot(); }
    St.gameStart({ mode });
    msg(coop ? `Защищайте штаб вместе! 🟡 ${me} · 🟢 ${opp}` : "Защити штаб! ★", 2000);
  }
  async function invite() {
    mode = "coop"; show("screen-menu", false); St.event("invite_create", {});
    room = await Lobby.host("tanchiki", { text: "Го в танчики вдвоём 🪖 Защищаем штаб! Заходи", onCancel: toMenu, onBot: startSolo });
    opp = room.peer ? room.peer.name : "Друг"; myIdx = 0; bind(room);
    setTimeout(() => { send("go", {}); begin(true); }, 400);
  }
  async function joinInvite(id) {
    mode = "coop"; show("screen-menu", false);
    room = await Lobby.join("tanchiki", id, { onCancel: toMenu, onBot: startSolo });
    St.event("invite_join", {}); opp = room.peer ? room.peer.name : "Друг"; myIdx = 1; bind(room);
  }
  function bind(rm) {
    rm.on("in", (d) => { if (isHost()) inputs[1] = { d: d.d, f: !!d.f }; });
    rm.on("go", () => { if (!isHost()) { snapCur = null; snapPrev = null; begin(true); } });
    rm.on("s", (d) => { if (!isHost()) onSnap(d); });
    rm.on("m", (d) => { if (!isHost() && d.v !== mapV) { mapV = d.v; guestMap = Uint8Array.from(d.m, (ch) => +ch); } });
    rm.on("again", () => { if (isHost() && phase === "end") { send("go", {}); begin(true); } else if (!isHost()) $("end-status").textContent = `${opp} хочет ещё раз!`; });
    rm.on("peer-left", () => {
      if (phase === "menu") return;
      phase = "end"; $("end-emoji").textContent = "🚪"; $("end-title").textContent = `${opp} вышел из игры`; $("end-score").textContent = snapCur ? snapCur.S : 0; $("end-sub").textContent = ""; $("end-status").textContent = "";
      buttons([["🙋 Играть одному", "primary", startSolo], ["В меню", "ghost", () => { leave(); toMenu(); }]]);
      show("screen-end", true);
    });
  }
  function leave() { if (room) { room.close(); room = null; } }
  function toMenu() { phase = "menu"; show("screen-end", false); show("screen-menu", true); }
  function buttons(list) { const box = $("end-buttons"); box.innerHTML = ""; list.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); }); }
  function endGame(s) {
    phase = "end";
    const baseLost = !s.base;
    St.gameEnd({ mode, score: s.S, level: s.lv + 1, base_lost: baseLost });
    $("end-emoji").textContent = baseLost ? "🏚️" : "💥";
    $("end-title").textContent = baseLost ? "Штаб уничтожен" : "Танки закончились";
    $("end-score").textContent = s.S;
    $("end-sub").textContent = `Дошли до уровня ${s.lv + 1}`;
    $("end-status").textContent = "";
    const list = [];
    if (mode === "coop") list.push(["🔁 Ещё раз вместе", "primary", () => { if (isHost()) { send("go", {}); begin(true); } else { send("again", {}); $("end-status").textContent = `Ждём ${opp}…`; } }]);
    else list.push(["🔁 Ещё раз", "primary", startSolo], ["👥 Позвать друга", "", () => { invite(); }]);
    list.push(["В меню", "ghost", () => { leave(); toMenu(); }]);
    buttons(list);
    show("screen-end", true);
  }

  $("m-solo").onclick = startSolo; $("m-coop").onclick = invite; $("m-menu").onclick = () => { location.href = "../"; };
  T.init({ header: "#1a1a1a", bg: "#1a1a1a", back: "../" });
  const inv = Net.readInvite(); if (inv) joinInvite(inv);
  requestAnimationFrame(frame);
  window.__game = { get phase() { return phase; }, get G() { return G; }, get snap() { return snapCur; }, setInput, startSolo, invite, get guestMap() { return guestMap; } };
})();
