// «Отряд» — режим «Пушка»: чистая логика без графики (её же гоняют боты-тестеры в node).
// Пушка стоит внизу, стреляет бойцами. Бойцы пролетают ворота (×N, +N, −N, щиты) и бьются 1:1 с красными.
// ВСЕ числа настройки — в CFG.

export const CFG = {
  field: { hw: 6, len: 42, baseZ: 1.0, spawnZ: 43 },
  cannon: {
    hp: 20,            // запас прочности пушки (без улучшений)
    rate: 5,           // выстрелов в секунду, пока держишь палец
    heatShot: 10,      // нагрев за выстрел (100 — перегрев)
    cool: 28,          // остывание в секунду
    lockCool: 0.55,    // при перегреве остывает медленнее (×), стрелять нельзя, пока не остынет до 0
    aimMax: 0.78,      // предел наклона ствола, рад
    muzzle: 1.6        // откуда вылетают бойцы
  },
  soldier: { speed: 11, r: 0.28, spread: 0.035, fan: 0.22, maxAlive: 650, home: 6.5, turn: 3.2, life: 8 },
  gate: {
    w: 2.5, gap: 0.35,
    rows: [9, 17, 24],                 // где стоят ряды ворот (z)
    speedBase: 0.9, speedPerLv: 0.11,   // скорость скольжения ворот, м/с: база + за уровень
    plusPer: 2,        // «+N»: сколько бойцов выпускает за каждого пролетевшего, пока запас не кончится
    plusRegen: 0.12,   // «+N» и «−N» восстанавливают запас: доля от N в секунду
    minusRegen: 0.08,
    shieldRegen: 7     // щит отрастает через столько секунд после поломки
  },
  enemy: {
    grunt:  { hp: 1,  spd: 1.7, r: 0.34, dmg: 1 },
    runner: { hp: 1,  spd: 3.5, r: 0.30, dmg: 1 },
    tank:   { hp: 7,  spd: 1.0, r: 0.60, dmg: 3 },
    giant:  { hp: 32, spd: 0.75, r: 1.15, dmg: 8 },
    boss:   { hp: 160, spd: 0.42, r: 1.9, dmg: 99, spawn: 3.4, perLv: 14 },
    tower:  { hp: 45, spawn: 3.6, r: 1.3 }
  },
  waves: {
    gap: 9,            // через сколько секунд приходит следующая волна (или раньше, если поле чистое)
    clearDelay: 1.6,
    growth: 0.03,      // общий множитель роста волн за уровень (сверх ручных чисел)
    base: 1.9
  },
  up: {   // улучшения пушки за монеты: max уровней, эффект за уровень, цена
    rate:  { max: 8, k: 0.08 },   // +8% скорострельности и остывания
    shot:  { max: 4, k: 0.25 },   // +0,25 бойца за выстрел (1 → 2)
    gate:  { max: 6, k: 0.12 },   // +12% к запасу «+N» и шанс лишнего бойца в «×N»
    hp:    { max: 8, k: 0.18 },   // +18% прочности
    cost0: 70, costMul: 1.6
  },
  stars: [0.7, 0.35],   // доля прочности для 3 и 2 звёзд
  coins: { base: 30, perLv: 6, perStar: 15 }
};

// ---------- уровни ----------
// ряды ворот: "x2", "x3", "+12", "-8", "#10" (щит с прочностью 10), "." — пустое место
// волны: "g12" — 12 пехотинцев, "r6" бегуны, "t2" танки со щитами, "G1" великан, "B" босс, "T2" две башни-казармы
// ,x — смещение группы (-1..1): "g10,-0.5"
const LV = [
  /* 1 */ { rows: [["x2", ".", "x2"]], v: 0.6, w: ["g6", "g8", "g10", "g12"] },
  /* 2 */ { rows: [["+10", "x2"]], v: 0.7, w: ["g8", "g10,-0.5 g6,0.5", "g14", "g16"] },
  /* 3 */ { rows: [["x2", "+10"], ["x2"]], w: ["g10", "r6", "g12 r4", "g16 r6"] },
  /* 4 */ { rows: [["-6", "x3", "-6"], ["+12", "x2"]], w: ["g14", "g12 r8", "g18", "g20 r8"] },
  /* 5 */ { rows: [["x2", "-8", "x2"], ["x3", "+15"]], w: ["g16", "r10 g10", "B g10"], boss: 1 },
  /* 6 */ { rows: [["x3", "#8", "x2"], ["-10", "x2", "+15"]], w: ["g18", "g16 r10", "g24", "r16 g12"] },
  /* 7 */ { rows: [["x2", "-8", "x3"], ["+20", "x2"]], w: ["g16 t1", "g20 t2", "r12 t2", "g24 t3"] },
  /* 8 */ { rows: [["x3", "-10"], ["#12", "x2", "#12"]], w: ["T2 g10", "g18 r8", "g20 t2", "r14 g20"] },
  /* 9 */ { rows: [["x2", "x3", "-12"], ["+20", "-10", "x2"]], w: ["g20", "G1 g12", "g24 t2", "G1 r16"] },
  /* 10 */ { rows: [["x3", "-12", "x2"], ["x2", "#14"]], w: ["g24 r8", "t3 g18", "B G1 g16"], boss: 1 },
  /* 11 */ { rows: [["-10", "x3", "-10"], ["x2", "+25"], ["#10", "x2"]], w: ["g26", "r20", "g24 t3", "r16 G1 g12"] },
  /* 12 */ { rows: [["x4", "-15", "-15"], ["+25", "x2"]], w: ["g28 t2", "T2 r14", "g30 t3", "G2 g18"] },
  /* 13 */ { rows: [["x2", "-12", "x3", "-12"], ["x2", "#16"]], w: ["r24", "g30 t3", "G1 r20", "g34 t4"] },
  /* 14 */ { rows: [["x3", "#16"], ["-15", "x2", "-15"], ["+30", "x2"]], w: ["g32", "t5 g20", "r26 G1", "g36 t4 G1"] },
  /* 15 */ { rows: [["x3", "-15", "x2"], ["x2", "-15", "+30"]], w: ["g30 t3", "r24 G1", "B T2 g20"], boss: 1 },
  /* 16 */ { rows: [["-20", "x4", "-20"], ["x2", "#20"], ["+30", "-15"]], w: ["g40", "r30 t3", "G2 g24", "g40 t5"] },
  /* 17 */ { rows: [["x2", "x3", "-20"], ["#18", "x2", "#18"]], w: ["T2 g30", "r30 t4", "G2 r20", "g44 t6"] },
  /* 18 */ { rows: [["x3", "-20"], ["-20", "x3"], ["x2", "+35"]], w: ["g44 r16", "t6 G1", "r40 G2", "g50 t6"] },
  /* 19 */ { rows: [["x4", "-25", "x2", "-25"], ["x2", "#22"]], w: ["r40", "g44 t6", "G3 g24", "T2 r30 t4"] },
  /* 20 */ { rows: [["x3", "-25", "x3"], ["-20", "x2", "-20"], ["+40", "x2"]], w: ["g48 t5", "G2 r30", "B G2 g30"], boss: 1 },
  /* 21 */ { rows: [["x4", "#24", "-25"], ["x2", "-25", "+40"]], w: ["g50 r20", "t8 G1", "G3 r30", "g60 t6"] },
  /* 22 */ { rows: [["-30", "x3", "-30"], ["x3", "#26"], ["x2", "-20"]], w: ["T3 g30", "r44 t6", "G3 g40", "g60 t8 G1"] },
  /* 23 */ { rows: [["x2", "-30", "x4"], ["#28", "x2", "#28"], ["+45", "-30"]], w: ["g56", "t9 r28", "G3 g30", "r46 t7 G2"] },
  /* 24 */ { rows: [["x5", "-35", "-35"], ["x2", "-30", "x2"]], w: ["g64 t6", "G3 r40", "T3 t8 g40", "G4 g60"] },
  /* 25 */ { rows: [["x3", "-35", "x3"], ["-30", "x3", "-30"], ["x2", "+50"]], w: ["g60 t8", "G3 r50", "B G3 t8 g40"], boss: 1 }
];
export const LEVEL_COUNT = LV.length;

function mulberry(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function levelInfo(n) {
  const L = LV[Math.min(n, LV.length) - 1];
  const types = new Set();
  L.w.forEach((w) => w.split(" ").forEach((g) => types.add(g[0])));
  return { boss: !!L.boss, types: [...types], rows: L.rows.length };
}

// разбор уровня: n — номер с 1; уровни после 25 — те же 25 по кругу, но сильнее
export function buildLevel(n) {
  const idx = (n - 1) % LV.length, loop = Math.floor((n - 1) / LV.length);
  const L = LV[idx];
  const scale = CFG.waves.base * Math.pow(1 + CFG.waves.growth, idx) * Math.pow(1.35, loop);
  const gv = (L.v || CFG.gate.speedBase + CFG.gate.speedPerLv * (idx + 1)) * (1 + 0.15 * loop);
  const rows = L.rows.map((r, ri) => ({ z: CFG.gate.rows[ri], v: gv * (ri % 2 ? -1 : 1) * (1 + ri * 0.12), gates: r.map((s) => s) }));
  const waves = L.w.map((w) => w.split(" ").map((g) => {
    const [a, xs] = g.split(","); const ty = { g: "grunt", r: "runner", t: "tank", G: "giant", B: "boss", T: "tower" }[a[0]];
    let cnt = a.length > 1 ? parseInt(a.slice(1), 10) : 1;
    if (ty !== "boss" && ty !== "tower") cnt = Math.max(1, Math.round(cnt * scale));
    return { type: ty, n: cnt, x: xs != null ? parseFloat(xs) : null };
  }));
  return { n, idx, loop, rows, waves, boss: !!L.boss, bossHp: Math.round((CFG.enemy.boss.hp + CFG.enemy.boss.perLv * idx) * Math.pow(1.4, loop)) };
}

export function upCost(kind, lv) { return Math.round(CFG.up.cost0 * Math.pow(CFG.up.costMul, lv) * (kind === "shot" ? 1.8 : 1)); }

export class GunSim {
  constructor(n, up, seed) {
    up = up || {};
    this.up = { rate: up.rate || 0, shot: up.shot || 0, gate: up.gate || 0, hp: up.hp || 0 };
    this.rnd = mulberry(seed || 1234 + n * 77);
    this.lv = buildLevel(n);
    const C = CFG.cannon;
    this.maxHp = Math.round(C.hp * (1 + CFG.up.hp.k * this.up.hp));
    this.hp = this.maxHp;
    this.rate = C.rate * (1 + CFG.up.rate.k * this.up.rate);
    this.cool = C.cool * (1 + CFG.up.rate.k * this.up.rate);
    this.perShot = 1 + CFG.up.shot.k * this.up.shot;
    this.shotAcc = 0; this.fireT = 0;
    this.heat = 0; this.locked = false;
    this.aim = 0; this.firing = false;
    this.t = 0; this.state = "play";
    this.soldiers = []; this.enemies = []; this.towers = []; this.ev = [];
    this.fired = 0; this.made = 0; this.killed = 0; this.enemyHpTotal = 0; this.uid = 1;
    // ряды ворот
    const G = CFG.gate, hw = CFG.field.hw;
    this.rows = this.lv.rows.map((r, ri) => {
      const gates = []; let w = 0;
      r.gates.forEach((s) => {
        const gw = s === "." ? G.w * 0.8 : s[0] === "#" ? G.w * 0.85 : G.w;
        if (s !== ".") {
          const k = s[0], N = parseInt(s.slice(1), 10);
          const g = { k, N, off: w + gw / 2, w: gw, x: 0, row: ri, id: ri * 10 + gates.length, hits: 0, pop: 0 };
          if (k === "+") g.pool = g.max = Math.round(N * (1 + CFG.up.gate.k * this.up.gate));
          if (k === "-") g.pool = g.max = N;
          if (k === "#") { g.pool = g.max = N; g.broken = 0; }
          gates.push(g);
        }
        w += gw + G.gap;
      });
      w -= G.gap;
      gates.forEach((g) => (g.off -= w / 2));
      const amp = Math.max(0, hw - w / 2 - 0.1);
      return { z: r.z, v: r.v, w, amp, pos: (ri % 2 ? 0.35 : -0.35) * amp, dir: r.v >= 0 ? 1 : -1, speed: Math.abs(r.v), gates };
    });
    this.lastRowZ = this.rows.length ? this.rows[this.rows.length - 1].z : 0;
    // волны
    this.wave = 0; this.waveT = 2.2; this.waveClearT = 0; this.boss = null;
    this.lv.waves.forEach((w) => w.forEach((g) => {
      const e = CFG.enemy[g.type];
      this.enemyHpTotal += g.type === "boss" ? this.lv.bossHp : g.type === "tower" ? e.hp * g.n : e.hp * g.n;
    }));
    this.updateGates(0);
  }
  emit(e) { if (this.ev.length < 400) this.ev.push(e); }
  // --- ворота: ряд скользит туда-сюда ---
  updateGates(dt) {
    const G = CFG.gate;
    for (const r of this.rows) {
      if (r.amp > 0) {
        r.pos += r.dir * r.speed * dt;
        if (r.pos > r.amp) { r.pos = r.amp; r.dir = -1; }
        if (r.pos < -r.amp) { r.pos = -r.amp; r.dir = 1; }
      }
      for (const g of r.gates) {
        g.x = r.pos + g.off;
        if (g.pop > 0) g.pop = Math.max(0, g.pop - dt * 4);
        if (g.k === "+" && g.pool < g.max) g.pool = Math.min(g.max, g.pool + g.max * G.plusRegen * dt);
        if (g.k === "-" && g.pool < g.max) g.pool = Math.min(g.max, g.pool + g.max * G.minusRegen * dt);
        if (g.k === "#" && g.broken > 0) { g.broken -= dt; if (g.broken <= 0) { g.broken = 0; g.pool = g.max; this.emit({ t: "shield_up", g }); } }
      }
    }
  }
  // где окажется ворота через dt секунд (для бота)
  rowPosAt(r, dt) {
    if (r.amp <= 0) return r.pos;
    const span = 4 * r.amp;
    let s = r.dir > 0 ? (r.pos + r.amp) : (2 * r.amp + (r.amp - r.pos));
    s = (s + r.speed * dt) % span; if (s < 0) s += span;
    return s <= 2 * r.amp ? s - r.amp : r.amp - (s - 2 * r.amp);
  }
  spawnSoldier(x, z, vx, vz, mask, from) {
    if (this.soldiers.length >= CFG.soldier.maxAlive) return null;
    const s = { id: this.uid++, x, z, vx, vz, mask: mask || 0, life: CFG.soldier.life, from: from || 0 };
    this.soldiers.push(s); this.made++;
    return s;
  }
  shoot() {
    const C = CFG.cannon, S = CFG.soldier;
    this.shotAcc += this.perShot;
    let n = Math.floor(this.shotAcc); this.shotAcc -= n;
    const mx = Math.sin(this.aim) * C.muzzle, mz = Math.cos(this.aim) * C.muzzle;
    for (let i = 0; i < n; i++) {
      const a = this.aim + (n > 1 ? (i - (n - 1) / 2) * 0.05 : 0) + (this.rnd() - 0.5) * S.spread;
      this.spawnSoldier(mx, mz, Math.sin(a) * S.speed, Math.cos(a) * S.speed, 0, 0);
    }
    this.fired++;
    this.heat += C.heatShot;
    this.emit({ t: "shot", n });
    if (this.heat >= 100) { this.heat = 100; this.locked = true; this.emit({ t: "overheat" }); }
  }
  spawnEnemy(type, x, z, hpOverride) {
    const e = CFG.enemy[type];
    const o = { id: this.uid++, type, x, z, hp: hpOverride || e.hp, max: hpOverride || e.hp, spd: e.spd * (0.92 + this.rnd() * 0.16), r: e.r, dmg: e.dmg, hit: 0, wob: this.rnd() * 6 };
    this.enemies.push(o);
    return o;
  }
  spawnWave(w) {
    const F = CFG.field;
    for (const g of w) {
      if (g.type === "tower") {
        for (let i = 0; i < g.n; i++) {
          const x = g.n === 1 ? 0 : -3.6 + 7.2 * i / (g.n - 1);
          this.towers.push({ id: this.uid++, x, z: F.len - 2, hp: CFG.enemy.tower.hp, max: CFG.enemy.tower.hp, t: 1 + i * 0.7, r: CFG.enemy.tower.r });
        }
        this.emit({ t: "tower" });
        continue;
      }
      if (g.type === "boss") {
        this.boss = this.spawnEnemy("boss", 0, F.spawnZ + 1, this.lv.bossHp);
        this.boss.st = CFG.enemy.boss.spawn;
        this.emit({ t: "boss" });
        continue;
      }
      const cx = g.x != null ? g.x * (F.hw - 1.5) : (this.rnd() - 0.5) * 2 * (F.hw - 2.5);
      const e = CFG.enemy[g.type], sp = e.r * 2.3;
      const cols = Math.max(1, Math.min(g.n, Math.floor((F.hw * 2 - 1) / sp), Math.ceil(Math.sqrt(g.n * 1.6))));
      for (let i = 0; i < g.n; i++) {
        const c = i % cols, rr = Math.floor(i / cols);
        let x = cx + (c - (cols - 1) / 2) * sp + (this.rnd() - 0.5) * 0.2;
        x = Math.max(-F.hw + e.r, Math.min(F.hw - e.r, x));
        this.spawnEnemy(g.type, x, F.spawnZ + rr * sp + this.rnd() * 0.3);
      }
    }
  }
  step(dt) {
    if (this.state !== "play") return;
    this.t += dt;
    const C = CFG.cannon, F = CFG.field, S = CFG.soldier;
    this.ev.length = this.ev.length > 300 ? 0 : this.ev.length;
    // огонь и нагрев
    this.aim = Math.max(-C.aimMax, Math.min(C.aimMax, this.aim));
    if (this.locked) { this.heat -= this.cool * C.lockCool * dt; if (this.heat <= 0) { this.heat = 0; this.locked = false; this.emit({ t: "cooled" }); } }
    else {
      this.heat = Math.max(0, this.heat - this.cool * dt);
      this.fireT -= dt;
      if (this.firing && this.fireT <= 0) { this.shoot(); this.fireT = 1 / this.rate; }
    }
    this.updateGates(dt);
    // волны
    if (this.wave < this.lv.waves.length) {
      this.waveT -= dt;
      const clear = this.enemies.length === 0 && this.towers.length === 0;
      if (clear && this.wave > 0) { this.waveClearT += dt; if (this.waveClearT > CFG.waves.clearDelay) this.waveT = Math.min(this.waveT, 0); } else this.waveClearT = 0;
      if (this.waveT <= 0) {
        this.spawnWave(this.lv.waves[this.wave]); this.wave++;
        this.waveT = CFG.waves.gap + (this.wave === this.lv.waves.length - 1 ? 2 : 0);
        this.emit({ t: "wave", i: this.wave, n: this.lv.waves.length });
      }
    }
    // башни-казармы и босс выпускают пехоту
    for (const tw of this.towers) { tw.t -= dt; if (tw.t <= 0) { tw.t = CFG.enemy.tower.spawn; for (let i = 0; i < 2; i++) this.spawnEnemy("grunt", tw.x + (i - 0.5) * 0.8, tw.z - 1.5); this.emit({ t: "tspawn", x: tw.x, z: tw.z }); } }
    if (this.boss && this.boss.hp > 0) { this.boss.st -= dt; if (this.boss.st <= 0 && this.boss.z < F.spawnZ) { this.boss.st = CFG.enemy.boss.spawn; for (let i = 0; i < 3; i++) this.spawnEnemy("grunt", this.boss.x + (i - 1) * 0.9, this.boss.z - 2); this.emit({ t: "bspawn", x: this.boss.x, z: this.boss.z }); } }

    // враги идут к пушке
    const grid = this.grid || (this.grid = new Map());
    grid.clear();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.z -= e.spd * dt;
      e.wob += dt * 2;
      if (e.z < 14) e.x += (0 - e.x) * Math.min(1, dt * 0.25);
      if (e.hit > 0) e.hit -= dt;
      if (e.z <= F.baseZ + e.r) {
        this.hp -= e.dmg; this.emit({ t: "base", dmg: e.dmg, x: e.x, type: e.type });
        this.enemies.splice(i, 1);
        if (e === this.boss) this.boss = null;
        continue;
      }
      const k = ((e.x + 8) >> 1) * 64 + ((e.z + 4) >> 1);
      let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(e);
    }
    if (this.hp <= 0) { this.hp = 0; this.state = "lose"; this.emit({ t: "lose" }); return; }

    // бойцы
    const rows = this.rows;
    for (let i = this.soldiers.length - 1; i >= 0; i--) {
      const s = this.soldiers[i];
      const pz = s.z;
      // наводка на ближайшего врага после ворот
      if (s.z > this.lastRowZ + 0.5) {
        let best = null, bd = S.home * S.home;
        const cx = (s.x + 8) >> 1, cz = (s.z + 4) >> 1;
        for (let a = -3; a <= 3; a++) for (let c = -1; c <= 4; c++) {
          const b = grid.get((cx + a) * 64 + cz + c); if (!b) continue;
          for (const e of b) { const dx = e.x - s.x, dz = e.z - s.z; const d = dx * dx + dz * dz; if (dz > -1 && d < bd) { bd = d; best = e; } }
        }
        if (!best) for (const tw of this.towers) { const dx = tw.x - s.x, dz = tw.z - s.z; const d = dx * dx + dz * dz; if (d < 14 * 14 && d < bd * 4) { best = tw; bd = d; } }
        if (best) {
          const dx = best.x - s.x, dz = best.z - s.z, l = Math.hypot(dx, dz) || 1;
          const tvx = dx / l * S.speed, tvz = dz / l * S.speed, k = Math.min(1, S.turn * dt);
          s.vx += (tvx - s.vx) * k; s.vz += (tvz - s.vz) * k;
          const sp = Math.hypot(s.vx, s.vz) || 1; s.vx *= S.speed / sp; s.vz *= S.speed / sp;
        }
      }
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
      if (s.x > F.hw - S.r) { s.x = F.hw - S.r; s.vx = -Math.abs(s.vx); }
      if (s.x < -F.hw + S.r) { s.x = -F.hw + S.r; s.vx = Math.abs(s.vx); }
      let dead = false;
      // ворота
      for (let ri = 0; ri < rows.length && !dead; ri++) {
        const r = rows[ri];
        if (pz < r.z && s.z >= r.z && !(s.mask & (1 << ri))) {
          s.mask |= 1 << ri;
          for (const g of r.gates) {
            if (Math.abs(s.x - g.x) > g.w / 2) continue;
            if (g.k === "x") {
              g.hits++; g.pop = 1;
              let extra = g.N - 1;
              if (this.up.gate && this.rnd() < CFG.up.gate.k * this.up.gate * 0.8) extra++;
              for (let j = 0; j < extra; j++) {
                const a = Math.atan2(s.vx, s.vz) + (j + 1 - extra / 2 - 0.5) * S.fan * (0.6 + this.rnd() * 0.6) / Math.max(1, extra / 2);
                this.spawnSoldier(s.x + (this.rnd() - 0.5) * 0.5, s.z + 0.05, Math.sin(a) * S.speed, Math.cos(a) * S.speed, s.mask, g.id + 1);
              }
              this.emit({ t: "gate", k: "x", g, x: s.x, z: s.z });
            } else if (g.k === "+") {
              if (g.pool >= 1) {
                const m = Math.min(CFG.gate.plusPer, Math.floor(g.pool)); g.pool -= m; g.hits++; g.pop = 1;
                for (let j = 0; j < m; j++) {
                  const a = Math.atan2(s.vx, s.vz) + (this.rnd() - 0.5) * S.fan * 1.4;
                  this.spawnSoldier(s.x + (this.rnd() - 0.5) * 0.6, s.z + 0.05, Math.sin(a) * S.speed, Math.cos(a) * S.speed, s.mask, g.id + 1);
                }
                this.emit({ t: "gate", k: "+", g, x: s.x, z: s.z });
              }
            } else if (g.k === "-") {
              if (g.pool >= 1) { g.pool -= 1; g.hits++; g.pop = 1; dead = true; this.emit({ t: "gate", k: "-", g, x: s.x, z: s.z }); }
            } else if (g.k === "#") {
              if (!g.broken) { g.pool -= 1; g.pop = 1; dead = true; this.emit({ t: "shield", g, x: s.x, z: s.z }); if (g.pool <= 0) { g.broken = CFG.gate.shieldRegen; this.emit({ t: "shield_break", g }); } }
            }
            break;
          }
        }
      }
      // столкновение с врагами
      if (!dead) {
        const cx = (s.x + 8) >> 1, cz = (s.z + 4) >> 1;
        outer: for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
          const b = grid.get((cx + a) * 64 + cz + c); if (!b) continue;
          for (const e of b) {
            if (e.hp <= 0) continue;
            const dx = e.x - s.x, dz = e.z - s.z, rr = e.r + S.r;
            if (dx * dx + dz * dz < rr * rr) {
              e.hp -= 1; e.hit = 0.12; dead = true;
              this.emit({ t: "clash", x: s.x, z: s.z, type: e.type });
              if (e.hp <= 0) this.killEnemy(e);
              break outer;
            }
          }
        }
      }
      if (!dead) for (const tw of this.towers) {
        if (tw.hp > 0 && Math.abs(s.x - tw.x) < tw.r + S.r && Math.abs(s.z - tw.z) < tw.r + S.r) {
          tw.hp -= 1; dead = true; this.emit({ t: "thit", x: s.x, z: s.z });
          if (tw.hp <= 0) { this.emit({ t: "tdie", x: tw.x, z: tw.z }); this.killed++; }
          break;
        }
      }
      if (dead || s.life <= 0 || s.z > F.len + 3) {
        this.soldiers[i] = this.soldiers[this.soldiers.length - 1]; this.soldiers.pop();
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].hp <= 0) { this.enemies[i] = this.enemies[this.enemies.length - 1]; this.enemies.pop(); }
    for (let i = this.towers.length - 1; i >= 0; i--) if (this.towers[i].hp <= 0) this.towers.splice(i, 1);
    if (this.boss && this.boss.hp <= 0) this.boss = null;
    if (this.wave >= this.lv.waves.length && this.enemies.length === 0 && this.towers.length === 0) { this.state = "win"; this.emit({ t: "win" }); }
  }
  killEnemy(e) {
    this.killed++;
    this.emit({ t: "kill", x: e.x, z: e.z, type: e.type });
    if (e === this.boss) { this.emit({ t: "bossdie", x: e.x, z: e.z }); this.boss = null; }
  }
  stars() { if (this.state !== "win") return 0; const f = this.hp / this.maxHp; return f >= CFG.stars[0] ? 3 : f >= CFG.stars[1] ? 2 : 1; }
  coins() { const C = CFG.coins; return this.state === "win" ? C.base + C.perLv * this.lv.n + C.perStar * this.stars() : Math.round((C.base / 3) * Math.min(1, this.killed / 40)); }
  // самый опасный враг (ближе всех к пушке; великаны и босс весомее)
  threat() {
    let best = null, bs = -1e9;
    for (const e of this.enemies) { const s = -e.z + (e.type === "giant" ? 6 : e.type === "boss" ? 8 : e.type === "tank" ? 2 : 0) + (e.type === "runner" ? 3 : 0); if (s > bs) { bs = s; best = e; } }
    if (!best && this.towers.length) best = this.towers[0];
    return best;
  }
}
