// «Отряд» — режим «Забег»: толпа бежит вперёд, палец рулит влево-вправо, ворота меняют число,
// ловушки косят бойцов, в конце — армия, великан или крепость, потом лестница множителей.
import { THREE, Units, Crowd, Debris, Particles, Labels, textTex, glowLabel, redrawText, blobShadow, buildScenery, fenceLine, placeModels, makeGate, setGateKind, makeCannonModel, makeBanner, cloneModel, hueMaterial, pbr, boxUV, disposeGroup, clamp, lerp, rng, BIOMES, RED as RED0, COL } from "./core.js";
import { RUN_CFG, RUN_NEWS, levelDef, finalStrength, applyGate, TYPES, UNIT, UNIT_GEN, TIERS, WEAPONS, EMIX, mixPow, newComp, compCount, compPower, cloneComp, removeBodies, parseGate, applyGateComp, gateText, gateValueGood, grownGate, weaponMul, volleyPow, shotRate } from "./levels.js";
import { play } from "./audio.js";

const T = window.TG;
const GA = Math.PI * (3 - Math.sqrt(5));
const SPC = 0.215;                 // плотность строя
const BLUE_DBG = 0x2f7bff, RED = 0xe5393b;
// виды бойцов в толпе (индекс = ty в Crowd): 0 обычные, 1 бегуны, 2 громилы, 3 лучники, 4 щитоносцы, 5 чемпион
const TY = { basic: 0, scout: 1, brute: 2, archer: 3, shield: 4, champ: 5 };
const TSCALE = [1, 0.9, 2.0, 1, 1.05, 2.6];          // рост вида
const BIGTY = { 2: 1, 5: 1 };                          // громил и чемпиона рисуем 1:1 (не сэмплом)
const E_TY = { basic: 0, G: 1, A: 2, S: 3 }, E_SCALE = [1, 2.2, 1, 1.1];
const GATE_KIND = (g) => g.k === "u" || g.k === "c" ? "unit" : g.k === "e" ? "evo" : !gateValueGood(g) ? "bad" : g.grow ? "gold" : g.k === "x" ? "mult" : "plus";
export const REWARD_TXT = (r) => r[0] === "w" ? WEAPONS[r.slice(2)].name : gateText(parseGate(r)).replace("\n", " ").replace("ЭПОХА ↑", "Эпоха ↑");

// общие материалы (не пересоздаются между уровнями)
const MAT = {};
function mat(key, color, opts) {
  if (!MAT[key]) { MAT[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.1 }, opts || {})); MAT[key].userData.keep = 1; }
  return MAT[key];
}
function stripeTex(a, b) {
  const c = document.createElement("canvas"); c.width = 8; c.height = 64; const g = c.getContext("2d");
  g.fillStyle = a; g.fillRect(0, 0, 8, 64); g.fillStyle = b; g.fillRect(0, 32, 8, 32);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}

export class Runner {
  constructor(eng, hud, labelsRoot) {
    this.eng = eng; this.hud = hud;
    this.labels = new Labels(labelsRoot, eng.camera);
    this.cap = RUN_CFG.cap;
    this.P = null; this.E = null;
    this.debris = new Debris(eng, 400);
    this.parts = new Particles(eng);
    eng.scene.add(this.debris.group);
    this.form = new Float32Array(this.cap * 2);
    for (let i = 0; i < this.cap; i++) { const r = SPC * Math.sqrt(i + 0.5), a = i * GA; this.form[i * 2] = Math.cos(a) * r; this.form[i * 2 + 1] = Math.sin(a) * r; }
    this.ud = new Float32Array(this.cap); this.dead = new Uint8Array(this.cap); this.pop = new Float32Array(this.cap);
    this.ed = new Float32Array(this.cap); this.eg = new Int16Array(this.cap); this.edead = new Uint8Array(this.cap);
    this.timeScale = 1; this.slowT = 0; this.auto = false; this.speedUp = 1;
  }
  // ---------- загрузка уровня ----------
  load(n, up, look) {
    this.dispose();
    const eng = this.eng;
    this.n = n; this.up = up; this.look = look;
    this.def = levelDef(n);
    const fs = finalStrength(this.def);
    this.enemyTotal = fs.enemy; this.enemyPow = fs.enemyPow; this.est = fs.est;
    eng.setBiome(this.def.biome);
    this.B = BIOMES[this.def.biome];
    this.world = new THREE.Group(); eng.scene.add(this.world);
    this.atk = 1 + RUN_CFG.atkK * (up.atk || 0); this.hpm = 1 + RUN_CFG.hpK * (up.hp || 0);
    this.cards = up.cards || {}; this.mastery = up.mastery || 0;
    this.comp = newComp(RUN_CFG.startUnits + RUN_CFG.startPerUp * (up.start || 0), this.cards, this.def.tier);
    this.count = compCount(this.comp);
    this.weapon = null; this.np = 0; this.repT = new Float32Array(6).fill(1);
    // наши: обычные (облик — эпоха или оружие), бегуны, громилы, лучники, щитоносцы, чемпион (золотой)
    this.P = new Crowd(eng, this.cap, look.color, look.hat, false, [
      { kind: TIERS[this.comp.tier].kind }, { kind: "scout", hat: "none", cap: 400, capK: 0.6 }, { kind: "brute", hat: "none", cap: 160, capK: 0.5 },
      { kind: "archer", hat: "none", cap: 400, capK: 0.6 }, { kind: "shield", hat: "none", cap: 400, capK: 0.6 }, { kind: "knight2", hat: "crown", color: 0xffc62b, cap: 4, capK: 0.2, nearCap: 4, lod: 3 }]);
    this.world.add(this.P.mesh);
    // красные: пехота, великаны, лучники, щиты
    this.E = new Crowd(eng, this.cap, RED, "none", true, [{ kind: "blue" }, { kind: "brute", cap: 200, capK: 0.5, lod: 2 }, { kind: "archer", cap: 400, capK: 0.6 }, { kind: "shield", cap: 400, capK: 0.6 }]);
    this.world.add(this.E.mesh);
    this.Park = new Units(eng, 700, look.color, look.hat, "cheer"); this.world.add(this.Park.mesh);
    for (let i = 0; i < 700; i++) { this.Park.run[i] = 1; this.Park.atk[i] = -0.6; this.Park.yaw[i] = Math.PI; }
    this.debris.setTeam(look.color);
    this.ne = 0; this.groups = []; this.items = []; this.road = []; this.pits = []; this.shots = []; this.bul = []; this.fireAcc = 0; this.arrows = []; this.arrowAcc = 0; this.newsShown = false;
    this.d = 0; this.cx = 0; this.want = 0; this.sx = 1; this.sd = 1; this.t = 0; this.phase = "intro";
    this.spdMul = 1; this.boostT = 0; this.clashG = null; this.cannon = null; this.fed = 0;
    this.kills = 0; this.lostTotal = 0; this.maxCount = this.count; this.tutStep = this.def.tut ? 1 : 0; this.dragT = 0;
    this.result = null; this.mult = 0; this.stats = { gates: [] }; this.topT = 0; this.hitAcc = 0; this.hapT = 0; this.sndT = 0;
    this.build();
    this.lbl = this.labels.add("cnt blue", "0"); this.lbl.pop();
    // трассеры выстрелов толпы и стрелы красных
    this.bulM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 6, 4).scale(1, 1, 3.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe27a).multiplyScalar(2.2), toneMapped: false }), 160); this.bulM.frustumCulled = false; this.bulM.count = 0; this.world.add(this.bulM);
    this.arrM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4).rotateX(Math.PI / 2), mat("arrow", 0x5a3a20), 80); this.arrM.frustumCulled = false; this.arrM.count = 0; this.world.add(this.arrM);
    this.hud.weapon && this.hud.weapon(null);
    this.updateLook();
    this.syncUnits(true);
    for (let i = 0; i < this.np; i++) { this.ud[i] = this.form[i * 2 + 1] + this.d; this.P.x[i] = this.form[i * 2]; }
    this.timeLeft = this.def.tm ? Math.round(this.len / RUN_CFG.speed * 1.02) : 0;
    this.camInit = false;
    if (eng.camera.fov !== 52) { eng.camera.fov = 52; eng.camera.updateProjectionMatrix(); }
    this.updateCamera(1);
    this.hud.progress(0);
    this.hud.count(Math.round(this.count));
    this.hud.timer(this.def.tm ? this.timeLeft : null);
  }
  dispose() {
    if (!this.world) return;
    this.labels.clear();
    this.debris.clear(); this.parts.clear();
    if (this.P) this.P.dispose(); if (this.E) this.E.dispose(); if (this.Park) this.Park.dispose();
    for (const it of this.items) if (it.prev) it.prev.forEach((u) => u.dispose());
    disposeGroup(this.world); this.world = null;
  }
  // ---------- дорога ----------
  roadAt(d) {
    const R = this.road;
    let lo = 0, hi = R.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (R[m].d1 <= d) lo = m + 1; else hi = m; }
    return R[lo] || R[R.length - 1];
  }
  seg(d0, d1, hw, walls, kind) {
    const last = this.road[this.road.length - 1];
    if (last && last.hw === hw && last.walls === walls && last.kind === (kind || "") && Math.abs(last.d1 - d0) < 0.01) { last.d1 = d1; return; }
    this.road.push({ d0, d1, hw, walls, kind: kind || "" });
  }
  build() {
    const C = RUN_CFG, hw = C.hw, B = this.B;
    let d = 0;
    this.seg(-30, 18, hw, true);
    d = 18;
    const place = (beats, lane, laneHW) => {
      // lane: смещение центра полосы (для развилки), laneHW — её полуширина
      let dd = d;
      for (const b of beats) { dd = this.placeBeat(b, dd, lane || 0, laneHW || hw); dd += C.gap; }
      return dd;
    };
    for (const b of this.def.s) {
      if (b.t === "split") {
        const shw = 7.2, gap = 1.6, lhw = (shw - gap) / 2, lc = gap + lhw;
        const d0 = d;
        this.seg(d, d + 6, shw, true);       // расширение перед развилкой
        d += 8;
        const dl = place(b.L, -lc, lhw), dr = place(b.R, lc, lhw);
        const d1 = Math.max(dl, dr) + 2;
        this.seg(d0 + 6, d1 + 4, shw, true, "split");
        this.pits.push({ d0: d0 + 8, d1: d1, x0: -gap, x1: gap, split: 1 });
        this.items.push({ t: "fork", d: d0 + 8, d1, lc, lhw });
        d = d1 + 6;
        this.seg(d1 + 4, d, hw, true);
        continue;
      }
      d = this.placeBeat(b, d, 0, hw);
      d += C.gap;
    }
    // финал
    this.finalD = d + 10;
    if (this.def.tm) { this.items.push({ t: "drawbridge", d: d + 2 }); }
    this.seg(this.road[this.road.length - 1].d1, d + 6, hw, true);
    const ahw = 7.5;
    this.seg(d + 6, d + 50, ahw, true, "arena");
    this.arena = { d0: d + 6, d1: d + 50, hw: ahw };
    this.stairsD = d + 50;
    for (let i = 0; i < 10; i++) this.seg(this.stairsD + i * 2, this.stairsD + (i + 1) * 2, 3.2, true, "stair" + i);
    this.seg(this.stairsD + 20, this.stairsD + 34, 3.2, true, "top");
    this.len = this.finalD;
    this.buildRoadMeshes();
    this.buildItems();
    this.buildFinal();
    for (const it of this.items) if (it.g && it.t !== "pit" && it.t !== "speed") it.g.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
    buildScenery(this.world, this.def.biome, 30, -(this.stairsD + 60), { inner: 9, seed: this.n * 13 + 1 });
    this.buildProps();
  }
  placeBeat(b, d, lc, lhw) {
    const it = Object.assign({}, b, { d, lc, lhw });
    const L = { gate: 4, squad: 12, blade: 10, blade2: 14, saw: 0, pit: 9, log: 26, crush: 4, bridge: 0, spikes: 7, axe: 0, cannon: 18, speed: 12, weapon: 5, barrel: 4 };
    let len = L[b.t] || 6;
    if (b.t === "saw") len = b.n * 5;
    if (b.t === "axe") len = b.n * 4.5;
    if (b.t === "bridge") { len = b.l; this.seg(this.road[this.road.length - 1].d1, d, RUN_CFG.hw, true); this.seg(d, d + len, b.w / 2, false, "bridge"); }
    if (b.t === "pit") {
      const hw = lhw, P = (x0, x1) => this.pits.push({ d0: d + 1, d1: d + 7.5, x0: lc + x0, x1: lc + x1 });
      if (b.k === "L") P(-hw - 0.5, 0.6); else if (b.k === "R") P(-0.6, hw + 0.5); else if (b.k === "C") P(-1.9, 1.9); else { P(-hw - 0.5, -1.7); P(1.7, hw + 0.5); }
    }
    if (b.t !== "bridge" && lc === 0) this.seg(this.road.length ? this.road[this.road.length - 1].d1 : d, d + len, RUN_CFG.hw, true);
    it.len = len;
    this.items.push(it);
    return d + len;
  }
  buildRoadMeshes() {
    const B = this.B, w = this.world, bid = this.def.biome;
    const roadMat = pbr(B.road, { roughness: 0.85 }), cliffM = pbr(B.cliff, { roughness: 0.95 }), plankM = pbr("planks", { roughness: 0.8 });
    const add = (m) => { m.receiveShadow = true; w.add(m); return m; };
    // режем дорогу по ямам
    for (const s of this.road) {
      const cuts = new Set([s.d0, s.d1]);
      for (const p of this.pits) if (p.d1 > s.d0 && p.d0 < s.d1) { cuts.add(clamp(p.d0, s.d0, s.d1)); cuts.add(clamp(p.d1, s.d0, s.d1)); }
      const cs = [...cuts].sort((a, b) => a - b);
      const stairI = s.kind.startsWith("stair") ? +s.kind.slice(5) : s.kind === "top" ? 10 : -1;
      const y0 = stairI >= 0 ? 0.55 * (stairI + 1) : 0;
      for (let k = 0; k < cs.length - 1; k++) {
        const a = cs[k], b = cs[k + 1]; if (b - a < 0.01) continue;
        const mid = (a + b) / 2;
        let iv = [[-s.hw, s.hw]];
        for (const p of this.pits) if (p.d0 < mid && p.d1 > mid) { const nv = []; for (const [l, r] of iv) { if (p.x1 <= l || p.x0 >= r) { nv.push([l, r]); continue; } if (p.x0 > l) nv.push([l, p.x0]); if (p.x1 < r) nv.push([p.x1, r]); } iv = nv; }
        for (const [l, r] of iv) {
          if (r - l < 0.05) continue;
          const th = stairI >= 0 ? y0 + 9 : 0.8, wd = r - l, ln = b - a;
          const mt = s.kind === "bridge" ? plankM : stairI >= 0 ? mat("stair" + (stairI % 10), new THREE.Color().setHSL(((stairI) / 10) * 0.8, 0.7, 0.55).getHex(), { roughness: 0.5 }) : roadMat;
          const m = add(new THREE.Mesh(boxUV(new THREE.BoxGeometry(wd, th, ln), wd, th, ln, s.kind === "bridge" ? 1.5 : 3), mt));
          m.position.set((l + r) / 2, y0 - th / 2, -mid);
          if (s.kind !== "bridge" && stairI < 0) { const c = add(new THREE.Mesh(boxUV(new THREE.BoxGeometry(wd + 0.3, 9, ln), wd + 0.3, 9, ln, 5), cliffM)); c.position.set((l + r) / 2, -0.8 - 4.5, -mid); }
        }
      }
      // заборы вдоль краёв с бортиками; у мостов — канатные стойки
      if (s.walls && !s.kind.startsWith("stair") && s.kind !== "top") for (const sg of [-1, 1]) fenceLine(w, bid, sg * (s.hw + 0.12), -s.d0, -s.d1, 0);
      if (s.kind === "bridge") for (let dd = s.d0; dd <= s.d1; dd += 3) for (const sg of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), plankM); p.position.set(sg * (s.hw + 0.05), -0.25, -dd); p.castShadow = true; w.add(p); }
      if (s.kind === "bridge") { const pil = new THREE.Mesh(new THREE.BoxGeometry(s.hw * 2 + 0.6, 0.3, 0.3), plankM); for (let dd = s.d0 + 1; dd < s.d1; dd += 4) { const q = pil.clone(); q.position.set(0, -0.95, -dd); w.add(q); } }
    }
  }
  // знамёна, факелы, бочки вдоль трассы
  buildProps() {
    const w = this.world, B = this.B, r = rng(this.n * 77 + 3);
    for (let d = 20; d < this.len; d += 34 + r() * 16) {
      const seg = this.roadAt(d); if (!seg.walls || seg.kind) continue;
      const sd = r() < 0.5 ? -1 : 1;
      const bn = makeBanner(B.banner); bn.position.set(sd * (seg.hw + 0.75), 0, -d); bn.rotation.y = sd * Math.PI / 2 + Math.PI; bn.scale.setScalar(1.25); w.add(bn);
    }
    const props = { Barrel: [], Crate_Wooden: [] };
    for (let d = 30; d < this.len; d += 22 + r() * 30) { const seg = this.roadAt(d); if (!seg.walls || seg.kind) continue; const sd = r() < 0.5 ? -1 : 1; (r() < 0.5 ? props.Barrel : props.Crate_Wooden).push([sd * (seg.hw + 0.9), 0, -d, 0.9 + r() * 0.3, r() * 6]); }
    for (const k in props) placeModels(w, k, props[k], { shadow: true });
    if (B.torches || this.def.biome === "volcano") {
      const list = [];
      for (let d = 12; d < this.stairsD; d += 16) { const seg = this.roadAt(d); if (!seg.walls) continue; for (const sd of [-1, 1]) list.push([sd * (seg.hw + 0.35), 0.4, -d, 2.2, sd > 0 ? -Math.PI / 2 : Math.PI / 2]); }
      placeModels(w, "Torch_Metal", list, {});
      const glow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(3), toneMapped: false }), list.length);
      list.forEach((it, i) => glow.setMatrixAt(i, new THREE.Matrix4().makeTranslation(it[0], 1.85, it[2])));
      w.add(glow); this.torches = list;
    }
  }
  // ---------- предметы трассы ----------
  buildItems() {
    const w = this.world, B = this.B;
    const steel = mat("steel", 0xc8d0dc, { metalness: 0.9, roughness: 0.28 }), dark = mat("dark", 0x3a3f4a, { metalness: 0.6, roughness: 0.45 }), red = mat("redm", 0xd8423a, { metalness: 0.4, roughness: 0.4 }), wood = pbr("planks", { roughness: 0.8 }), gold = mat("gold", 0xffc83a, { metalness: 0.85, roughness: 0.3 });
    for (const it of this.items) {
      const g = new THREE.Group(); g.position.set(it.lc || 0, 0, -it.d); w.add(g); it.g = g;
      const hw = it.lhw || RUN_CFG.hw;
      if (it.t === "gate") {
        const n = it.v.length, W = it.move ? Math.min(3.2, hw * 2 / n - 0.6) : hw * 2 / n;
        it.panels = [];
        it.W = W; it.tot = W * n;
        it.amp = it.move ? Math.max(0, hw - it.tot / 2 - 0.2) : 0;
        it.off = 0; it.ph = Math.random() * 6;
        for (let k = 0; k < n; k++) {
          const v = it.v[k], g0 = parseGate(v), x = -it.tot / 2 + W * (k + 0.5);
          const pg = new THREE.Group(); pg.position.x = x; g.add(pg);
          const txt = gateText(g0) + (g0.grow ? (g0.k === "x" ? "↑" : "") : "");
          const G = makeGate(W, txt, GATE_KIND(g0)); pg.add(G.g);
          if (g0.grow) { // значок прицела: в эти ворота можно стрелять
            const tgt = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe27a).multiplyScalar(1.8), toneMapped: false, side: THREE.DoubleSide })); tgt.position.set(0, 3.25, 0.05); pg.add(tgt);
            const dot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), tgt.material); dot.position.copy(tgt.position); pg.add(dot);
          }
          it.panels.push({ v, g0, g: g0, hits: 0, x, pg, G, pm: G.pm, lab: G.lab, tex: G.tex, txt, gd: gateValueGood(g0) });
        }
      } else if (it.t === "blade" || it.t === "blade2") {
        const two = it.t === "blade2";
        it.blades = [];
        const pivots = two ? [[-hw * 0.5, 3], [hw * 0.5, 9]] : [[clamp(it.x, -0.6, 0.6) * hw, 5]];
        pivots.forEach(([px, pd], k) => {
          const bg = new THREE.Group(); bg.position.set(px, 0, -pd); g.add(bg);
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.3, 10), dark); col.position.y = 0.65; bg.add(col);
          const L = two ? 2.5 : 2.9;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(L * 2, 0.22, 0.32), red); bar.position.y = 0.55; bg.add(bar);
          for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.5), steel); tip.position.set(s * L, 0.55, 0); bar.add(tip); tip.position.y = 0; }
          const sh = blobShadow(L); sh.position.y = 0.03; bg.add(sh);
          it.blades.push({ px: px + (it.lc || 0), pd: it.d + pd, L, bar, w: (k % 2 ? -1 : 1) * (two ? 2.6 : 2.2), a: Math.random() * 3 });
        });
      } else if (it.t === "saw") {
        it.saws = [];
        for (let k = 0; k < it.n; k++) {
          const s = new THREE.Group(); s.position.set(0, 0, -(2.5 + k * 5)); g.add(s);
          const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 16), steel); disc.rotation.x = Math.PI / 2; disc.position.y = 0.55; s.add(disc);
          for (let j = 0; j < 8; j++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 4), steel); const a = j / 8 * Math.PI * 2; tooth.position.set(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0); tooth.rotation.z = a - Math.PI / 2; disc.add(tooth); tooth.rotation.x = Math.PI / 2; tooth.position.set(Math.cos(a) * 1.02, 0, Math.sin(a) * 1.02); }
          const rail = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.06, 0.25), dark); rail.position.y = 0.03; s.add(rail);
          it.saws.push({ m: s, disc, pd: it.d + 2.5 + k * 5, ph: k * 1.7 + Math.random(), sp: 1.5 + this.n * 0.02, A: hw - 1.0, x: 0 });
        }
      } else if (it.t === "pit") {
        // ямы уже вырезаны из дороги; на краях — предупреждающие полосы
        for (const p of this.pits) if (p.d0 === it.d + 1 && !p.split) { const m = new THREE.Mesh(new THREE.BoxGeometry(p.x1 - p.x0, 0.04, 0.35), mat("warn", 0xffc21a)); m.position.set((p.x0 + p.x1) / 2 - (it.lc || 0), 0.02, -1 + 0.2); g.add(m); }
      } else if (it.t === "log") {
        it.logs = []; it.spawnT = 0; it.sent = 0;
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 1.2, 2), mat("wall_" + this.def.biome, B.edge)); ramp.position.set(0, 0.6, -it.len); g.add(ramp);
      } else if (it.t === "crush") {
        it.cr = [];
        const W = hw * 2 / it.n;
        for (let k = 0; k < it.n; k++) {
          const x = -hw + W * (k + 0.5);
          const blk = new THREE.Mesh(boxUV(new THREE.BoxGeometry(W - 0.35, 1.4, 2.4), W - 0.35, 1.4, 2.4, 1.6), pbr("stone", { roughness: 0.8, color: 0xb0b4bc })); blk.position.set(x, 3, -2); g.add(blk);
          const face = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.2, 2.5), mat("warn", 0xffc21a)); face.position.y = -0.7; blk.add(face);
          const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), dark); pole.position.y = 3.7; blk.add(pole);
          const sh = blobShadow(1.2); sh.scale.set(W - 0.3, 2.4, 1); sh.position.set(x, 0.03, -2); g.add(sh);
          it.cr.push({ m: blk, sh, x: x + (it.lc || 0), W: W - 0.35, pd: it.d + 2, ph: (k % 2) * 1.2 + Math.random() * 0.3, y: 3, down: false });
        }
      } else if (it.t === "spikes") {
        it.sp = [];
        for (let k = 0; k < 2; k++) {
          const x0 = k === 0 ? -hw : 0, x1 = k === 0 ? 0 : hw;
          const base = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.06, 5), mat("spbase", 0x55505a)); base.position.set((x0 + x1) / 2, 0.03, -3.5); g.add(base);
          const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.7, 4), steel, 60); const m4 = new THREE.Matrix4(); let i = 0;
          for (let a = 0; a < 6; a++) for (let b2 = 0; b2 < 10; b2++) { m4.makeTranslation(x0 + (a + 0.5) * (x1 - x0) / 6, 0, -1.25 - b2 * 0.5); spikes.setMatrixAt(i++, m4); }
          g.add(spikes);
          it.sp.push({ m: spikes, base, x0: x0 + (it.lc || 0), x1: x1 + (it.lc || 0), d0: it.d + 1, d1: it.d + 6, up: 0, on: false });
        }
        it.cyc = Math.random() * 3;
      } else if (it.t === "axe") {
        it.ax = [];
        for (let k = 0; k < it.n; k++) {
          const ag = new THREE.Group(); ag.position.set(0, 5.2, -(2 + k * 4.5)); g.add(ag);
          const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.2, 0.3, 0.3), wood); beam.position.y = 0.1; g.add(beam); beam.position.set(0, 5.35, -(2 + k * 4.5));
          for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 0.3), wood); post.position.set(s * (hw + 0.6), 2.7, -(2 + k * 4.5)); g.add(post); }
          const arm = new THREE.Group(); ag.add(arm);
          const rod = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.4, 0.1), dark); rod.position.y = -2.2; arm.add(rod);
          const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 12, 1, false, 0, Math.PI), steel); blade.rotation.z = Math.PI / 2; blade.rotation.y = Math.PI / 2; blade.position.y = -4.4; arm.add(blade);
          it.ax.push({ arm, pd: it.d + 2 + k * 4.5, ph: k * 1.3, A: 1.05, x: 0 });
        }
      } else if (it.t === "weapon") {
        // две стойки с оружием: на балке стоит боец с этим оружием (настоящая модель), снизу — чем полезно
        const n = 2, W = hw * 2 / n; it.panels = []; it.W = W; it.tot = W * n; it.off = 0; it.prev = [];
        for (let k = 0; k < n; k++) {
          const w = it.v[k], WD = WEAPONS[w], x = -it.tot / 2 + W * (k + 0.5);
          const pg = new THREE.Group(); pg.position.x = x; g.add(pg);
          const G = makeGate(W, WD.name.toUpperCase() + "\n" + WD.desc, "gold"); pg.add(G.g);
          const U = new Units(this.eng, 1, this.look.color, "none", WD.kind); U.near.castShadow = true;
          U.x[0] = x + (it.lc || 0); U.y[0] = 2.86; U.z[0] = -it.d; U.yaw[0] = Math.PI; U.s[0] = 1.5; U.run[0] = 0; U.atk[0] = 0; U.lodScale = 3; U.commit(1);
          this.world.add(U.mesh); it.prev.push(U);
          const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 14), mat("gold", 0xffc83a, { metalness: 0.85, roughness: 0.3 })); ped.position.set(0, 2.78, 0); pg.add(ped);
          it.panels.push({ w, x, pg, pm: G.pm, lab: G.lab, gd: true, wp: 1 });
        }
      } else if (it.t === "barrel") {
        // бочка с числом: толпа стреляет — число тает, на нуле — награда
        const bx = clamp(it.x, -0.8, 0.8) * (hw - 1.4);
        const bg = new THREE.Group(); bg.position.set(bx, 0, 0); g.add(bg);
        const br = cloneModel("Barrel"); br.scale.setScalar(2.2); bg.add(br);
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 24).rotateX(Math.PI / 2), mat("gold", 0xffc83a, { metalness: 0.85, roughness: 0.3 })); hoop.position.y = 0.9; bg.add(hoop);
        it.bx = bx + (it.lc || 0); it.bg = bg; it.max = it.hp;
        it.lb = this.labels.add("crate", ""); it.lb.el.innerHTML = "<b></b><small></small>"; it.lb.x = it.bx; it.lb.y = 3.1; it.lb.z = -it.d;
        it.lb.el.firstChild.textContent = it.hp; it.lb.el.lastChild.textContent = REWARD_TXT(it.r);
      } else if (it.t === "cannon") {
        const side = (it.d | 0) % 2 ? 1 : -1, px = side * hw * 0.5;
        const pad = new THREE.Mesh(new THREE.BoxGeometry(hw - 0.4, 0.05, 13), new THREE.MeshBasicMaterial({ color: 0xffc83a, transparent: true, opacity: 0.45 })); pad.position.set(px, 0.03, -6.5); g.add(pad);
        for (let k = 0; k < 4; k++) { const ar = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 3), new THREE.MeshBasicMaterial({ color: 0xfff1a8 })); ar.rotation.x = -Math.PI / 2; ar.position.set(px, 0.06, -2 - k * 3); g.add(ar); }
        const cn = this.makeCannon(); cn.position.set(px, 0, -14.5); g.add(cn);
        it.pad = { x: px + (it.lc || 0), hw: (hw - 0.4) / 2, d0: it.d, d1: it.d + 13 }; it.cm = cn; it.side = side; it.ammo = 0;
        it.lb = this.labels.add("cnt gold", "0"); it.lb.x = px; it.lb.y = 2.6; it.lb.z = -(it.d + 14.5);
        this.cannon = it;
      } else if (it.t === "speed") {
        it.zones = [];
        [["a", -1], ["b", 1]].forEach(([k, s]) => {
          const ty = it[k]; if (ty === "-") return;
          const zx = s * hw / 2, boost = ty === "b";
          const z = new THREE.Mesh(new THREE.BoxGeometry(hw - 0.3, 0.05, 10), new THREE.MeshBasicMaterial({ color: boost ? 0x3fd2ff : 0x6a4a2a, transparent: true, opacity: boost ? 0.6 : 0.85 })); z.position.set(zx, 0.03, -6); g.add(z);
          if (boost) for (let j = 0; j < 4; j++) { const ar = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 3), new THREE.MeshBasicMaterial({ color: 0xffffff })); ar.rotation.x = -Math.PI / 2; ar.position.set(zx, 0.07, -2.5 - j * 2.5); g.add(ar); }
          else for (let j = 0; j < 7; j++) { const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), mat("mud", 0x4a3220)); b2.scale.y = 0.3; b2.position.set(zx + (Math.random() - 0.5) * (hw - 1), 0.05, -1.5 - Math.random() * 9); g.add(b2); }
          it.zones.push({ x: zx + (it.lc || 0), hw: (hw - 0.3) / 2, d0: it.d + 1, d1: it.d + 11, boost });
        });
      } else if (it.t === "squad") {
        it.grp = this.addGroup(it.n, (it.lc || 0), it.d + 6, "squad", { mix: it.mix || {} });
      } else if (it.t === "drawbridge") {
        const gate = new THREE.Group(); g.add(gate);
        for (const s of [-1, 1]) { const tw = new THREE.Mesh(boxUV(new THREE.BoxGeometry(1.4, 5, 1.4), 1.4, 5, 1.4, 2), pbr("stone")); tw.position.set(s * (RUN_CFG.hw + 0.7), 2.5, 0); gate.add(tw); }
        const br = new THREE.Mesh(new THREE.BoxGeometry(RUN_CFG.hw * 2, 0.3, 4), wood); br.position.set(0, 0.0, -2); const piv = new THREE.Group(); piv.add(br); piv.position.z = 0; gate.add(piv);
        it.piv = piv; it.br = br; it.up = 0;
      } else if (it.t === "fork") {
        const wedge = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 3), mat("warn", 0xffc21a)); wedge.rotation.x = -Math.PI / 2; wedge.position.set(0, 0.6, 0.6); g.add(wedge);
      }
    }
  }
  makeCannon() {
    // боевая пушка: большая, золотая, многоствольная
    const g = makeCannonModel({ gold: true });
    g.userData.setBarrels(3); g.scale.setScalar(1.45);
    g.userData.barrel = g.userData.pitch;
    g.userData.pitch.rotation.x = 0.35;
    return g;
  }
  addGroup(n, x, d, kind, opts) {
    const grp = Object.assign({ n, count: n, x, d, kind, idx: [], R: 0, charge: false, done: false, lb: null, mix: {} }, opts || {});
    grp.pw = mixPow(grp.mix);
    const show = Math.min(n, this.cap - this.ne, kind === "army" ? 900 : 250);
    grp.rep = n / Math.max(1, show);
    // состав: великаны в середине строя, лучники — сзади, щиты — вперемешку
    const m = grp.mix, nG = m.G ? Math.max(1, Math.round(show * m.G)) : 0, nA = m.A ? Math.max(1, Math.round(show * m.A)) : 0, nS = m.S ? Math.round(show * m.S) : 0;
    for (let i = 0; i < show; i++) {
      const j = this.ne++;
      const ty = i < nG ? 1 : i >= show - nA ? 2 : nS && (i % Math.max(1, Math.round(show / nS))) === 1 ? 3 : 0;
      const sp = ty === 1 ? 1.6 : 1.05;
      this.E.x[j] = x + this.form[i * 2] * sp; this.ed[j] = d - this.form[i * 2 + 1] * sp; this.E.y[j] = 0; this.E.yaw[j] = 0; this.E.s[j] = E_SCALE[ty]; this.E.run[j] = 0; this.E.atk[j] = 0; this.E.ty[j] = ty;
      this.eg[j] = this.groups.length; this.edead[j] = 0;
    }
    grp.shown = show; grp.R = SPC * Math.sqrt(show) * 1.05 + 0.3;
    grp.lb = this.labels.add("cnt red", String(n)); grp.lb.x = x; grp.lb.y = 2.2; grp.lb.z = -(d);
    this.groups.push(grp);
    return grp;
  }
  buildFinal() {
    const f = this.def.f, A = this.arena, w = this.world;
    const fd = A.d0 + 24;
    this.final = { kind: f, d: fd, started: false, done: false };
    if (f === "army") {
      this.final.grp = this.addGroup(this.enemyTotal, 0, fd, "army", { mix: this.def.mix || {} });
    } else if (f === "boss") {
      const B = new Units(this.eng, 1, RED, this.def.king ? "crown" : "none", "boss"); w.add(B.mesh); B.near.castShadow = true;
      B.x[0] = 0; B.y[0] = 0; B.z[0] = -(fd + 2); B.yaw[0] = 0; B.s[0] = this.def.king ? 5.6 : 4.6; B.run[0] = 0; B.atk[0] = 0; B.commit(1);
      this.final.boss = B; this.final.hp = this.enemyPow; this.final.max = this.enemyPow; this.final.swing = 1.2; this.final.pend = 0; this.final.atk = 0;
      const lb = this.labels.add("hpbar", ""); lb.el.innerHTML = '<i></i><b></b>'; lb.x = 0; lb.y = B.s[0] * 1.15; lb.z = -(fd + 2); this.final.lb = lb;
      this.final.bd = fd + 2;
    } else {
      const g = new THREE.Group(); g.position.z = -(fd + 6); w.add(g);
      // крепость из моделей KayKit, синие крыши перекрашены в красный
      const parts = [], H = 0.4;
      const cs = cloneModel("building_castle_blue", { hue: H }); cs.scale.setScalar(3.3); g.add(cs); parts.push(cs);
      const tows = [];
      for (const s of [-1, 1]) {
        for (let k = 0; k < 2; k++) { const wl = cloneModel("wall_straight", { hue: H }); wl.scale.setScalar(2.6); wl.position.set(s * (4.6 + k * 2.6 * 2), 0, 0.6); g.add(wl); parts.push(wl); }
        const tw = cloneModel("building_tower_A_blue", { hue: H }); tw.scale.setScalar(3.4); tw.position.set(s * 13, 0, 0.4); g.add(tw); parts.push(tw); tows.push(tw);
        const bn = makeBanner(0xc0392b); bn.position.set(s * 3.2, 0, 2.2); bn.scale.setScalar(1.6); g.add(bn); parts.push(bn);
      }
      const door = cs;
      this.final.castle = g; this.final.parts = parts; this.final.door = door; this.final.hp = this.enemyTotal; this.final.max = this.enemyTotal; this.final.arrowT = 1; this.final.tows = tows;
      const lb = this.labels.add("hpbar", ""); lb.el.innerHTML = '<i></i><b></b>'; lb.x = 0; lb.y = 7; lb.z = -(fd + 6); this.final.lb = lb; this.final.pend = 0;
      this.final.bd = fd + 4.6;
      // защитники перед воротами
      this.final.grp = this.addGroup(Math.max(4, Math.round(this.enemyPow * 0.25)), 0, fd, "army", { mix: { S: 0.2 } });
      this.final.hp = this.final.max = Math.round(this.enemyPow * 0.75);
    }
    // лестница: множители монет ×1,2…×5; каждая ступенька дороже предыдущей в 1,3 раза (×5 — редкость)
    const est = Math.max(10, this.est.power - this.enemyPow), C = RUN_CFG;
    this.stepCost = [];
    for (let i = 0; i < 10; i++) this.stepCost.push(Math.max(1, Math.round(est * C.stairK * Math.pow(C.stairGrow, i))));
    for (let i = 0; i < 10; i++) {
      const m = glowLabel("×" + String(C.stair[i]).replace(".", ","), 2.4, 1.2, 1.25);
      m.rotation.x = -Math.PI / 2 + 0.25; m.position.set(0, 0.55 * (i + 1) + 0.02, -(this.stairsD + i * 2 + 1)); w.add(m);
    }
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.4), mat("gold", 0xffc83a)); chest.position.set(0, 0.55 * 11 + 0.7, -(this.stairsD + 27)); w.add(chest);
  }
  // ---------- число и рисованные человечки ----------
  // ---------- состав и рисованные человечки ----------
  // обычные/бегуны/лучники/щиты рисуются «сэмплом» (один рисованный = rep бойцов), громилы и чемпион — 1:1
  repP() { return this.count > this.cap * 0.95 ? this.count / (this.cap * 0.95) : 1; }
  powNow() { return compPower(this.comp, this.cards); }
  unitPow(t) { return UNIT[TYPES[t]].pow * (t === 5 ? 1 : TIERS[this.comp.tier].mul) * (1 + 0.1 * (this.cards[TYPES[t]] || 0)); }
  wantDrawn() {
    const rep = this.repP(), w = [0, 0, 0, 0, 0, 0];
    for (let t = 0; t < 6; t++) { const c = Math.max(0, this.comp[TYPES[t]]); w[t] = BIGTY[t] ? Math.min(t === 5 ? 3 : 150, Math.round(c)) : Math.round(c / rep); }
    let tot = w.reduce((a, b) => a + b, 0);
    while (tot > this.cap) { w[0] = Math.max(0, w[0] - (tot - this.cap)); tot = w.reduce((a, b) => a + b, 0); if (w[0] === 0) break; }
    return w;
  }
  syncUnits(init) {
    this.count = Math.max(0, compCount(this.comp));
    const want = this.wantDrawn(), have = [0, 0, 0, 0, 0, 0], P = this.P;
    for (let i = 0; i < this.np; i++) if (!this.dead[i]) have[P.ty[i]]++;
    // лишние — исчезают с облачком, с разных мест строя
    let rmAny = false;
    for (let t = 0; t < 6; t++) {
      let rm = have[t] - want[t];
      for (let tries = 0; rm > 0 && tries < this.np * 4; tries++) { const i = (Math.random() * this.np) | 0; if (!this.dead[i] && P.ty[i] === t) { this.dead[i] = 2; rm--; rmAny = true; } }
    }
    if (rmAny) this.compact();
    for (let t = 0; t < 6; t++) {
      let add = want[t] - have[t];
      while (add-- > 0 && this.np < this.cap) {
        const i = this.np++, k = i * 2;
        P.x[i] = this.cx + this.form[k] * this.sx * 0.5; this.ud[i] = this.d + this.form[k + 1] * this.sd * 0.5; P.y[i] = 0; P.yaw[i] = Math.PI; P.s[i] = init ? TSCALE[t] : 0.01; P.run[i] = 1; P.atk[i] = 0; P.ty[i] = t;
        this.dead[i] = 0; this.pop[i] = init ? 1 : 0;
      }
    }
    // сколько бойцов за одним рисованным каждого вида
    const n = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < this.np; i++) n[P.ty[i]]++;
    for (let t = 0; t < 6; t++) this.repT[t] = n[t] > 0 ? Math.max(0, this.comp[TYPES[t]]) / n[t] : 1;
  }
  // убрать бойцов по «силе» (схватка, стрелы, удар великана): гибнут передние рисованные
  losePower(pw, how, vx, vz) {
    if (!(pw > 0)) return 0;
    if (!(this.hitAcc >= 0)) this.hitAcc = 0;
    this.hitAcc += pw; let killed = 0;
    for (let guard = 0; guard < 400 && this.np > 0; guard++) {
      let bi = -1, bd = -1e9;
      for (let s = 0; s < 6; s++) { const i = (Math.random() * this.np) | 0; if (!this.dead[i] && this.ud[i] > bd) { bd = this.ud[i]; bi = i; } }
      if (bi < 0) break;
      const t = this.P.ty[bi], cost = this.unitPow(t) * this.repT[t];
      if (this.hitAcc < cost) break;
      this.hitAcc -= cost; this.killP(bi, how ? how : Math.random() < 0.25 ? "fling" : "pop", vx != null ? vx : (Math.random() - 0.5) * 6, vz != null ? vz : 5); killed++;
    }
    if (killed) this.compact();
    if (this.np === 0) { this.hitAcc = 0; for (const t of TYPES) this.comp[t] = 0; this.count = 0; }
    return killed;
  }
  killP(i, how, vx, vz) {
    if (this.dead[i]) return;
    this.dead[i] = 1;
    const P = this.P, x = P.x[i], z = -this.ud[i], y = P.y[i], t = P.ty[i];
    const col = this.look.color;
    if (how === "fall") this.debris.add(x, y, z, (vx || 0) * 0.5, 0.5, (vz || 0), col, P.yaw[i], null, TSCALE[t]);
    else if (how === "fling") this.debris.add(x, y + 0.2, z, vx != null ? vx : (Math.random() - 0.5) * 10, 6 + Math.random() * 5, vz != null ? vz : (Math.random() - 0.5) * 6, col, P.yaw[i], 0, TSCALE[t]);
    else if (how === "squash") { this.parts.burst(x, 0.2, z, 3, col, 3, 0.16, 2); if (Math.random() < 0.3) this.parts.dust(x, z, 3, 0.4); }
    else this.parts.burst(x, 0.5, z, 2, col, 3.5, 0.13, 3);
    const k = TYPES[t]; this.comp[k] = Math.max(0, this.comp[k] - this.repT[t]);
    this.count = compCount(this.comp);
    this.lostTotal++;
  }
  compact() {
    const P = this.P; let j = 0;
    for (let i = 0; i < this.np; i++) {
      if (this.dead[i]) { if (this.dead[i] === 2) this.parts.burst(P.x[i], 0.5, -this.ud[i], 2, this.look.color, 2, 0.12, 2); continue; }
      if (i !== j) { P.move(j, i); this.ud[j] = this.ud[i]; this.pop[j] = this.pop[i]; }
      this.dead[j] = 0; j++;
    }
    this.np = j;
    if (this.count < 0.5) { this.count = 0; }
  }
  // облик обычных: оружие важнее эпохи
  updateLook() {
    const kind = this.weapon ? WEAPONS[this.weapon].kind : TIERS[this.comp.tier].kind;
    this.P.setLook(0, { kind, hat: this.weapon || this.comp.tier !== 1 ? "none" : undefined });
    if (this.comp.tier !== 1 || this.weapon) this.P.looks[0].hat = this.comp.tier === 1 || this.weapon === "sword" ? this.look.hat : "none";
    this.lblIcon = this.weapon ? WEAPONS[this.weapon].icon : "";
    if (this.hud.weapon) this.hud.weapon(this.weapon ? WEAPONS[this.weapon].icon + " " + WEAPONS[this.weapon].name : this.comp.tier !== 1 ? "⬆ " + TIERS[this.comp.tier].name : null);
  }
  killE(j, how) {
    if (this.edead[j]) return;
    this.edead[j] = 1;
    const E = this.E, x = E.x[j], z = -this.ed[j];
    if (how === "fling") this.debris.add(x, 0.2, z, (Math.random() - 0.5) * 8, 5 + Math.random() * 5, -2 - Math.random() * 5, RED, 0, 0);
    else this.parts.burst(x, 0.5, z, 3, RED, 4, 0.14, 3);
  }
  compactE() {
    const E = this.E; let j = 0;
    for (let i = 0; i < this.ne; i++) {
      if (this.edead[i]) continue;
      if (i !== j) { E.move(j, i); this.ed[j] = this.ed[i]; this.eg[j] = this.eg[i]; }
      this.edead[j] = 0; j++;
    }
    this.ne = j;
  }
  // ---------- ввод ----------
  steer(dxPx, W) { this.want = clamp(this.want + dxPx / W * 2.2 * RUN_CFG.hw * 1.15, -8, 8); this.dragT += 0.016; }
  start() { if (this.phase === "intro") { this.phase = "run"; this.t = 0; play("whoosh"); } }
  // ---------- кадр ----------
  update(rdt) {
    if (!this.world) return;
    // замедление на финальной сшибке
    if (this.slowT > 0) { this.slowT -= rdt; this.timeScale = lerp(this.timeScale, 0.3, 0.2); } else this.timeScale = lerp(this.timeScale, 1, Math.min(1, rdt * 3));
    const steps = this.speedUp > 1 ? this.speedUp : 1;
    for (let s = 0; s < steps; s++) this.step(Math.min(rdt, 1 / 30) * this.timeScale);
    this.render(rdt);
  }
  step(dt) {
    this.t += dt;
    const C = RUN_CFG;
    if (this.auto) this.autoSteer();
    if (this.phase === "intro" || this.phase === "done" || this.phase === "fail") { this.animIdle(dt); return; }
    // скорость
    let v = C.speed;
    if (this.phase === "run") {
      this.spdMul = this.boostT > 0 ? 1.55 : 1; if (this.boostT > 0) this.boostT -= dt;
      for (const it of this.items) if (it.zones) for (const z of it.zones) if (this.d > z.d0 && this.d < z.d1 && Math.abs(this.cx - z.x) < z.hw + 0.3) { if (z.boost) { if (this.boostT <= 0) { play("whoosh", { vol: 0.7 }); T.haptic("impact", "light"); } this.boostT = 1.2; this.spdMul = 1.55; } else this.spdMul = Math.min(this.spdMul, 0.55); }
      v *= this.spdMul;
      if (this.clashG) v *= 0.25;
      if (this.def.tm) { this.timeLeft -= dt; if (this.timeLeft <= 0) { this.timeLeft = 0; this.fail("time"); return; } }
    } else if (this.phase === "battle") v = this.battleMove(dt);
    else if (this.phase === "stairs") v = this.stairsMove(dt);
    this.d += v * dt;
    if (this.phase === "run" && this.d >= this.final.d - 26) this.beginFinal();
    // коридор, сжатие строя, руль
    const R0 = SPC * Math.sqrt(Math.max(1, this.np)) + 0.25;
    const seg = this.roadAt(this.d + 1);
    let L = -seg.hw, Rr = seg.hw;
    for (const p of this.pits) if (p.split && this.d > p.d0 - 1 && this.d < p.d1) { if (this.cx < 0) Rr = Math.min(Rr, p.x0); else L = Math.max(L, p.x1); }
    if (this.phase === "stairs") { L = -3; Rr = 3; }
    // ямы впереди: строй сжимается до ширины той полосы, где сейчас толпа (рулить всё равно надо самому)
    let fL = L, fR = Rr;
    for (const p of this.pits) if (!p.split && this.d > p.d0 - 7 && this.d < p.d1 + 1) {
      if (p.x0 <= -seg.hw + 0.1) fL = Math.max(fL, p.x1); else if (p.x1 >= seg.hw - 0.1) fR = Math.min(fR, p.x0);
      else if (this.cx < (p.x0 + p.x1) / 2) fR = Math.min(fR, p.x0); else fL = Math.max(fL, p.x1);
    }
    const half = (Math.max(1.2, fR - fL)) / 2 - 0.3;
    const sxT = clamp(half / R0, seg.walls ? 0.28 : 0.42, 1);
    this.sx = lerp(this.sx, sxT, Math.min(1, dt * 5)); this.sd = 1 / Math.pow(this.sx, 0.85);
    let want = this.phase === "run" ? this.want : this.phase === "stairs" ? 0 : this.cx;
    const bw = R0 * this.sx * 0.92;
    want = L + bw > Rr - bw ? (L + Rr) / 2 : clamp(want, L + bw, Rr - bw);
    if (this.phase === "run") this.want = clamp(this.want, -seg.hw - 1, seg.hw + 1);
    this.cx = lerp(this.cx, want, Math.min(1, dt * 9));
    this.updateItems(dt);
    this.moveUnits(dt, v);
    if (this.phase === "run") this.checkGates();
    if (this.np === 0 && this.count < 1 && this.phase !== "done" && this.phase !== "fail") { if (this.phase === "stairs") this.finishStairs(); else this.fail("dead"); }
    this.maxCount = Math.max(this.maxCount, this.count);
    // тутор
    if (this.tutStep) this.tutorial();
    else if (this.phase === "run" && !this.newsShown && this.def.new && RUN_NEWS[this.def.new] && this.t > 0.4 && !this.auto) { this.newsShown = true; this.hud.hint(RUN_NEWS[this.def.new], "new"); setTimeout(() => this.hud.hint(null), 3800); }
  }
  animIdle(dt) {
    for (let i = 0; i < this.np; i++) this.P.run[i] = lerp(this.P.run[i], 0, Math.min(1, dt * 6));
    for (let j = 0; j < this.ne; j++) this.E.run[j] = lerp(this.E.run[j], 0, Math.min(1, dt * 6));
    this.updateItems(dt);
  }
  tutorial() {
    const H = this.hud;
    if (this.tutStep === 1) { H.hint("👆 Веди пальцем влево-вправо", "drag"); if (this.dragT > 0.6) { this.tutStep = 2; H.hint(null); } }
    const g = this.items.find((it) => it.t === "gate" && !it.used);
    if (this.tutStep === 2 && g && g.d - this.d < 22) { this.tutStep = 3; H.hint("Синие ворота — плюс, жми в ту, где больше!", "gate"); }
    if (this.tutStep === 3 && g && g.d - this.d < 2) { this.tutStep = 4; setTimeout(() => this.hud.hint(null), 900); }
    if (this.tutStep === 4 && this.d > this.final.d - 34) { this.tutStep = 5; H.hint("Красных бей числом: нужно больше бойцов, чем у них!", "army"); setTimeout(() => this.hud.hint(null), 2600); }
  }
  moveUnits(dt, v) {
    const P = this.P, n = this.np, f = this.form, sx = this.sx, sd = this.sd, cx = this.cx, d = this.d;
    const k = Math.min(1, dt * 7.5), kd = Math.min(1, dt * 6);
    const battle = this.phase === "battle", stairs = this.phase === "stairs";
    let anyDead = false;
    let roadSeg = null, segD1 = -1, segD0 = 1;
    const pits = this.pits.filter((p) => !p.split ? p.d1 > d - 14 && p.d0 < d + 14 : true);
    const hazards = this.activeHazards();
    for (let i = 0; i < n; i++) {
      let tx = cx + f[i * 2] * sx, td = d - f[i * 2 + 1] * sd;
      if (battle && this.batT) { tx = cx + f[i * 2] * sx * 0.9; }
      if (stairs) { tx = f[i * 2] * Math.min(1, 2.6 / (SPC * Math.sqrt(n) + 0.3)); td = d - f[i * 2 + 1] * 1.2; }
      let x = P.x[i], ud = this.ud[i];
      ud += v * dt; x += (tx - x) * k; ud += (td - ud) * kd;
      // дорога под ногами
      if (ud > segD1 || ud < segD0) { roadSeg = this.roadAt(ud); segD0 = roadSeg.d0; segD1 = roadSeg.d1; }
      const hw = roadSeg.hw;
      if (roadSeg.walls) { if (x > hw - 0.2) x = hw - 0.2; else if (x < -hw + 0.2) x = -hw + 0.2; }
      else if (x > hw + 0.05 || x < -hw - 0.05) { P.x[i] = x; this.ud[i] = ud; this.killP(i, "fall", Math.sign(x) * 2, -v); anyDead = true; continue; }
      let fell = false;
      for (const p of pits) if (ud > p.d0 && ud < p.d1 && x > p.x0 && x < p.x1) { fell = true; break; }
      if (fell) { P.x[i] = x; this.ud[i] = ud; this.killP(i, "fall", 0, -v * 0.6); anyDead = true; continue; }
      P.x[i] = x; this.ud[i] = ud;
      // высота: ступеньки
      if (roadSeg.kind.startsWith("stair")) P.y[i] = lerp(P.y[i], 0.55 * (+roadSeg.kind.slice(5) + 1), 0.4);
      else if (roadSeg.kind === "top") P.y[i] = 0.55 * 11; else P.y[i] = lerp(P.y[i], 0, 0.4);
      if (this.pop[i] < 1) { this.pop[i] = Math.min(1, this.pop[i] + dt * 5); P.s[i] = (0.2 + 0.8 * this.pop[i] + Math.sin(this.pop[i] * Math.PI) * 0.35) * TSCALE[P.ty[i]] * (P.ty[i] === 0 && this.comp.tier === 3 ? 1.1 : 1); }
      P.run[i] = 1; P.yaw[i] = Math.PI + (tx - x) * 0.6;
      // ловушки
      for (let h = 0; h < hazards.length; h++) {
        const how = hazards[h](x, ud, i);
        if (how) {
          // громил, щитоносцев, бегунов и чемпиона ловушки берут реже (щиты-оружие берегут обычных)
          const t = P.ty[i]; let k = UNIT[TYPES[t]].trap; if (t === 0 && this.weapon === "shield") k *= WEAPONS.shield.trap;
          if (k >= 1 || Math.random() < k) { this.killP(i, how.k || how, how.vx, how.vz); anyDead = true; }
          else if (Math.random() < 0.3) this.parts.sparks(x, 1, -ud, 2);
          break;
        }
      }
    }
    if (anyDead) { this.compact(); this.deathFx(); }
  }
  deathFx() {
    if (this.t - this.sndT > 0.08) { this.sndT = this.t; play(Math.random() < 0.5 ? "hit" : "hit2", { vol: 0.5, gap: 0.07 }); }
    if (this.t - this.hapT > 0.12) { this.hapT = this.t; T.haptic("impact", "light"); }
    this.hud.count(Math.round(this.count));
  }
  // функции-проверки ловушек вблизи толпы. У каждой ловушки «бюджет» убийств в секунду:
  // она прорежает толпу, а не выкашивает её целиком; кого не убила — отбрасывает в сторону
  activeHazards() {
    const out = [], d = this.d, near = (a, b) => b > d - 14 && a < d + 16, P = this.P;
    const hit = (o, i, res, px) => { if ((o.bud || 0) >= 1) { o.bud -= 1; return res; } P.x[i] += (P.x[i] >= px ? 0.35 : -0.35); return null; };
    for (const it of this.items) {
      if (it.blades && near(it.d, it.d + 14)) for (const b of it.blades) {
        const c = Math.cos(b.a), s = Math.sin(b.a);
        out.push((x, ud, i) => {
          const dx = x - b.px, dd = -(ud - b.pd);   // локальные оси: x, z=-d
          if (dx * dx + dd * dd > (b.L + 0.3) * (b.L + 0.3)) return null;
          // расстояние до отрезка-перекладины
          const along = dx * c - dd * s, perp = dx * s + dd * c;
          if (Math.abs(perp) < 0.38 && Math.abs(along) < b.L + 0.2) return hit(b, i, { k: "fling", vx: -s * Math.sign(along) * b.w * 3.5, vz: -c * Math.sign(along) * b.w * 3.5 }, b.px);
          return null;
        });
      }
      if (it.saws && near(it.d, it.d + it.len)) for (const sw of it.saws) out.push((x, ud, i) => ((x - sw.x) * (x - sw.x) + (ud - sw.pd) * (ud - sw.pd) < 1.1 ? hit(sw, i, { k: "fling", vx: (x - sw.x) * 6, vz: 3 }, sw.x) : null));
      if (it.logs) for (const lg of it.logs) if (Math.abs(lg.d - d) < 14) out.push((x, ud, i) => (Math.abs(ud - lg.d) < 0.6 && Math.abs(x - lg.x) < lg.L / 2 && lg.bud >= 1 ? (lg.bud--, "squash") : null));
      if (it.cr && near(it.d, it.d + 4)) for (const c of it.cr) out.push((x, ud, i) => {
        if (Math.abs(x - c.x) > c.W / 2 || Math.abs(ud - c.pd) > 1.2) return null;
        if (c.slam) return "squash";
        if (c.y < 0.9) { this.P.x[i] = x < c.x ? c.x - c.W / 2 - 0.05 : c.x + c.W / 2 + 0.05; }
        return null;
      });
      if (it.sp && near(it.d, it.d + 7)) for (const s of it.sp) if (s.on) out.push((x, ud, i) => (ud > s.d0 && ud < s.d1 && x > s.x0 && x < s.x1 ? hit(s, i, "fling", (s.x0 + s.x1) / 2 + (s.x0 < 0 ? 99 : -99)) : null));
      if (it.ax && near(it.d, it.d + it.len)) for (const a of it.ax) out.push((x, ud, i) => (Math.abs(ud - a.pd) < 0.45 && Math.abs(x - a.x) < 0.8 && a.low ? hit(a, i, { k: "fling", vx: a.vx * 4, vz: 1 }, a.x) : null));
    }
    // засады: строй прижимается, а не проходит насквозь
    return out;
  }
  updateItems(dt) {
    const t = this.t, d = this.d;
    for (const it of this.items) {
      if (it.d > d + 90 || (it.d + (it.len || 10) < d - 30 && !it.logs)) continue;
      if (it.panels && it.move && !it.used) { it.off = Math.sin(t * (1.1 + this.n * 0.015) + it.ph) * it.amp; it.panels.forEach((p) => (p.pg.position.x = p.x + it.off)); }
      if (it.panels && it.used) { it.fade = (it.fade || 0) + dt; const f = it.fade; it.panels.forEach((p, k) => { if (k === it.chosen && f < 0.25) { p.pm.emissiveIntensity = 2.5 - f * 8; p.pg.scale.setScalar(1 + f * 0.6); } else { p.pg.position.y = -Math.max(0, f - (k === it.chosen ? 0.25 : 0)) * 7; p.pg.rotation.x = f * 1.5; } }); if (f > 1.1) { it.g.visible = false; it.panels = null; if (it.prev) it.prev.forEach((u) => (u.mesh.visible = false)); } else if (it.prev) it.prev.forEach((u, k) => { if (k !== it.chosen) u.y[0] = 2.86 - Math.max(0, f) * 7; }); }
      if (it.blades) for (const b of it.blades) { b.bud = Math.min(5, (b.bud || 0) + dt * (7 + this.n * 0.12)); b.a += b.w * dt; b.bar.rotation.y = b.a; if (Math.abs(b.pd - d) < 10 && this.t - (b.sT || 0) > 0.9) { b.sT = this.t; play("blade", { vol: 0.35, gap: 0.3 }); } }
      if (it.saws) for (const s of it.saws) { s.bud = Math.min(3, (s.bud || 0) + dt * (4 + this.n * 0.08)); s.x = Math.sin(t * s.sp + s.ph) * s.A + (it.lc || 0); s.m.children[0].position.x = s.x - (it.lc || 0); s.disc.rotation.y += dt * 14; s.m.children[1].position.x = 0; }
      if (it.cr) for (const c of it.cr) {
        const per = 2.3, ph = ((t + c.ph) % per) / per; let y;
        if (ph < 0.55) y = 3 - ph / 0.55 * 0.6; else if (ph < 0.62) y = lerp(2.4, 0.7, (ph - 0.55) / 0.07); else if (ph < 0.82) y = 0.7; else y = lerp(0.7, 3, (ph - 0.82) / 0.18);
        c.slam = c.y > 0.8 && y <= 0.8;
        if (c.slam && Math.abs(c.pd - d) < 22) { play("heavy", { vol: 0.6, gap: 0.1 }); this.eng.shake(Math.abs(c.pd - d) < 8 ? 0.25 : 0.08); this.parts.dust(c.x, -c.pd, 8, 0.6); }
        c.y = y; c.m.position.y = y + 0.0; c.sh.material.opacity = 1 - (y - 0.7) / 3;
      }
      if (it.sp) { it.sp.forEach((q) => (q.bud = Math.min(8, (q.bud || 0) + dt * (12 + this.n * 0.2)))); it.cyc += dt; const k = Math.floor(it.cyc / 1.7) % 2; it.sp.forEach((s, i) => { const on = i === k; const prev = s.on; s.up = lerp(s.up, on ? 1 : 0, Math.min(1, dt * 14)); s.on = s.up > 0.6; s.m.position.y = -0.7 + s.up * 0.7; s.base.material = mat(on ? "spon" : "spbase", on ? 0xc84040 : 0x55505a); if (s.on && !prev && Math.abs(s.d0 - d) < 18) play("chop", { vol: 0.5, gap: 0.2 }); }); }
      if (it.ax) for (const a of it.ax) { a.bud = Math.min(3, (a.bud || 0) + dt * (5 + this.n * 0.08)); const ang = Math.sin(t * 2.2 + a.ph) * a.A; a.arm.rotation.z = ang; a.x = Math.sin(ang) * 4.4 + (it.lc || 0); a.vx = Math.cos(t * 2.2 + a.ph); a.low = Math.abs(ang) < 0.5; }
      if (it.logs) this.updateLogs(it, dt);
      if (it.zones) {}
      if (it.t === "drawbridge") { const late = this.def.tm && this.timeLeft < 4; it.up = lerp(it.up, this.phase === "fail" && this.failWhy === "time" ? 1 : late ? 0.15 : 0, Math.min(1, dt * 3)); it.piv.rotation.x = it.up * 1.3; }
    }
    // засады бегут навстречу
    for (const g of this.groups) if (g.kind === "squad" && !g.done && !g.fight) {
      if (g.d - this.d < 16 && Math.abs(g.x - this.cx) < 7) g.charge = true;
      if (g.charge) g.d -= 3.5 * dt;
    }
    this.updateEnemies(dt);
    this.updateCannon(dt);
    this.updateShots(dt);
    this.updateShooting(dt);
    this.updateArrows(dt);
    for (const it of this.items) if (it.t === "barrel" && it.bg && it.bg.visible) { it.pop = Math.max(0, (it.pop || 0) - dt * 6); it.bg.scale.setScalar(1 + it.pop * 0.06); }
    for (const it of this.items) if (it.prev && !it.used) it.prev.forEach((u) => { u.yaw[0] += dt * 1.2; u.atk[0] = 0.15 + Math.sin(this.t * 2) * 0.1; u.commit(1); });
  }
  updateArrows(dt) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]; a.t += dt;
      if (a.t >= a.T) { if (a.hit && !a.hit.done) { this.attritionVisual(a.hit); if (a.hit.count <= 0.5) this.groupDone(a.hit); } this.parts.sparks(a.x1, 0.6, -a.d1, 1); this.arrows.splice(i, 1); }
    }
  }
  updateLogs(it, dt) {
    const hw = it.lhw || RUN_CFG.hw;
    if (it.d + it.len - this.d < 55 && it.sent < it.n) {
      it.spawnT -= dt;
      if (it.spawnT <= 0) {
        it.spawnT = 1.5; it.sent++;
        const L = hw * (it.sent % 3 === 0 ? 1.1 : 0.95), x = (it.lc || 0) + (it.sent % 2 ? -1 : 1) * (hw - L / 2) * (it.sent % 3 === 0 ? 0 : 1);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, L, 10), mat("log", 0x7a4f2b, { roughness: 0.9, metalness: 0 })); m.rotation.z = Math.PI / 2;
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.05, 10), mat("logend", 0xd9b27a)); ring.position.y = L / 2; m.add(ring); const r2 = ring.clone(); r2.position.y = -L / 2; m.add(r2);
        this.world.add(m);
        it.logs.push({ m, x, L, d: it.d + it.len - 1, y: 1.6, vy: 0, bud: 6 + this.np * 0.07 });   // каток давит не больше своей «нормы», остальные перепрыгивают
        play("househit", { vol: 0.4, gap: 0.2 });
      }
    }
    for (let i = it.logs.length - 1; i >= 0; i--) {
      const lg = it.logs[i];
      lg.d -= 7 * dt; lg.vy -= 20 * dt; lg.y = Math.max(0.55, lg.y + lg.vy * dt); if (lg.y === 0.55) lg.vy = 0;
      lg.m.position.set(lg.x, lg.y, -lg.d); lg.m.rotation.x -= dt * 12;
      if (lg.d < this.d - 25 || lg.d < it.d - 6) { lg.d -= 0; lg.y -= 0; if (lg.d < it.d - 6) { this.parts.burst(lg.x, 0.6, -lg.d, 6, 0x8a5a2b, 4, 0.2, 3); } this.world.remove(lg.m); lg.m.geometry.dispose(); it.logs.splice(i, 1); }
    }
  }
  // ---------- ворота, оружие ----------
  checkGates() {
    for (const it of this.items) {
      if (!it.panels || it.used || it.d > this.d) continue;
      it.used = true;
      if (it.lc && Math.sign(it.lc) !== Math.sign(this.cx || 1)) { it.chosen = -1; continue; }
      // какая створка под центром толпы
      let lx = this.cx - (it.lc || 0) - (it.off || 0);
      // толпа шире полосы и прижата к борту, палец тянет дальше — берём крайнюю створку с той стороны
      if (Math.abs(this.want - this.cx) > 0.4 && Math.sign(this.want - this.cx) === Math.sign(this.cx || 1) && Math.abs(this.cx) > 0.6) lx = clamp(this.want - (it.lc || 0) - (it.off || 0), -it.tot / 2 + 0.1, it.tot / 2 - 0.1);
      let k = Math.floor((lx + it.tot / 2) / it.W);
      if (k < 0 || k >= it.panels.length) { if (it.move) { it.chosen = -1; continue; } k = clamp(k, 0, it.panels.length - 1); }
      it.chosen = k;
      const P = it.panels[k];
      if (it.t === "weapon") { this.takeWeapon(P.w, it); continue; }
      const g = P.g, before = Math.round(this.count), tierB = this.comp.tier;
      applyGateComp(this.comp, g);
      this.syncUnits(false);
      const gd = gateValueGood(g), diff = Math.round(compCount(this.comp) - before);
      this.hud.count(Math.round(this.count), true);
      this.lbl.pop();
      if (g.k === "e") { this.updateLook(); this.syncUnits(false); for (let i = 0; i < this.np; i++) this.pop[i] = 0.2; this.hud.float(tierB !== this.comp.tier ? TIERS[this.comp.tier].name + "!" : "Эпоха ↑", "gold"); play("levelup", { vol: 0.9 }); play("magic", { vol: 0.6 }); this.parts.ring(this.cx, -it.d, 0.3, 5, 0.6, 0xb455ff, 0.1); }
      else if (g.k === "u") { this.hud.float(gateText(g).replace("\n", " "), "good"); play("perk", { vol: 0.7 }); }
      else if (g.k === "c") { this.hud.float("Громилы +" + this.comp.brute, "good"); play("heavy", { vol: 0.7 }); this.eng.shake(0.3); }
      else { this.hud.float((diff >= 0 ? "+" : "−") + Math.abs(diff), gd ? "good" : "bad"); play(gd ? (g.k === "x" ? "levelup" : "coin2") : "error", { vol: gd ? 0.7 : 0.8 }); }
      T.haptic("impact", gd ? "medium" : "heavy");
      this.parts.burst(this.cx, 1.3, -it.d, 10, gd ? 0x7cc8ff : 0xff6a6a, 6, 0.16, 4, 10);
      this.parts.sparkle(this.cx, 1.4, -it.d, gd ? 0x9fe0ff : 0xff8a8a, 14); this.parts.ring(this.cx, -it.d, 0.3, 3.2, 0.45, gd ? 0x7cc8ff : 0xff5a5a, 0.1);
      if (!gd) this.eng.shake(0.25);
      this.stats = this.stats || { gates: [] }; this.stats.gates.push(P.v + (P.hits ? "(" + gateText(g).replace("\n", " ") + ")" : ""));
    }
    this.updateBarrels();
  }
  takeWeapon(w, it) {
    this.weapon = w; this.updateLook(); this.syncUnits(false);
    for (let i = 0; i < this.np; i++) if (this.P.ty[i] === 0) this.pop[i] = 0.25;
    const WD = WEAPONS[w];
    this.hud.toast(WD.name + "!"); this.hud.float(WD.desc, "gold");
    play("upgrade", { vol: 0.9 }); play("blade", { vol: 0.5 }); T.haptic("notify", "success");
    this.parts.sparkle(this.cx, 1.6, -it.d, 0xffd34a, 30); this.parts.ring(this.cx, -it.d, 0.3, 4.5, 0.55, 0xffd34a, 0.1);
    if (it.prev) it.prev.forEach((u, k) => { if (k === it.chosen) u.mesh.visible = false; });
    this.stats.gates.push("W:" + w);
  }
  // бочки: отстреляли — награда; не успели — толпа врезается
  updateBarrels() {
    for (const it of this.items) {
      if (it.t !== "barrel" || it.done) continue;
      if (it.hp <= 0) { this.openBarrel(it); continue; }
      if (it.d < this.d + 0.5) {
        it.done = true; it.lb.on = false;
        const R0 = SPC * Math.sqrt(Math.max(1, this.np)) * this.sx + 0.4;
        if (Math.abs(this.cx - it.bx) < R0 + 1.1) {
          const loss = Math.min(this.count * 0.25, it.hp * 0.5);
          if (loss >= 1) { this.losePower(loss * this.unitPow(0), "fling", null, 2); this.deathFx(); this.hud.float("−" + Math.round(loss), "bad"); }
          play("househit", { vol: 0.8 }); this.eng.shake(0.3);
        }
        this.parts.burst(it.bx, 1.2, -it.d, 14, 0x8a5a2e, 6, 0.22, 5); it.bg.visible = false;
      }
    }
  }
  openBarrel(it) {
    it.done = true; it.lb.on = false; it.bg.visible = false;
    play("collapse", { vol: 0.6, rate: 1.3 }); play("perk", { vol: 0.8 }); T.haptic("notify", "success"); this.eng.shake(0.3);
    this.parts.burst(it.bx, 1.4, -it.d, 24, 0x9a6a3a, 7, 0.24, 6); this.parts.sparkle(it.bx, 2, -it.d, 0xffd34a, 28);
    if (it.r[0] === "w") { this.takeWeapon(it.r.slice(2), it); return; }
    const g = parseGate(it.r), tb = this.comp.tier;
    applyGateComp(this.comp, g); if (g.k === "e" && tb !== this.comp.tier) this.updateLook();
    this.syncUnits(false); this.hud.count(Math.round(this.count), true); this.lbl.pop();
    this.hud.toast(REWARD_TXT(it.r) + "!");
    this.stats.gates.push("B:" + it.r);
  }
  // ---------- стрельба толпы: по воротам «↑» и бочкам ----------
  shootTargets() {
    const out = [];
    for (const it of this.items) {
      if (it.d < this.d + 1 || it.d > this.d + 46) continue;
      if (it.t === "barrel" && !it.done && it.hp > 0) out.push({ it, x0: it.bx - 1.1, x1: it.bx + 1.1, d: it.d });
      else if (it.t === "gate" && !it.used && it.panels) for (const p of it.panels) if (p.g0.grow) { const x = (it.lc || 0) + (it.off || 0) + p.x; out.push({ it, p, x0: x - it.W / 2 + 0.1, x1: x + it.W / 2 - 0.1, d: it.d }); }
    }
    return out;
  }
  updateShooting(dt) {
    if (this.phase === "run" && this.np > 0) {
      const tg = this.shootTargets();
      if (tg.length) {
        this.fireAcc += shotRate(this.count, this.comp.archer, this.up.shots) * dt;
        while (this.fireAcc >= 1) {
          this.fireAcc -= 1;
          // стреляют передние: x — у случайного из первых рядов
          let bi = 0, bd = -1e9; for (let s = 0; s < 4; s++) { const i = (Math.random() * this.np) | 0; if (this.ud[i] > bd) { bd = this.ud[i]; bi = i; } }
          const x = this.P.x[bi], d0 = this.ud[bi] + 0.5;
          let hit = null; for (const t of tg) if (x >= t.x0 && x <= t.x1 && (!hit || t.d < hit.d)) hit = t;
          if (this.bul.length < 160) this.bul.push({ x, d: d0, y: 1.0, hit, end: hit ? hit.d : d0 + 40 });
          if (this.t - (this.shT || 0) > 0.09) { this.shT = this.t; play("xbow", { vol: 0.22, gap: 0.08, rate: 1.4 }); }
        }
      } else this.fireAcc = 0;
    }
    const sp = RUN_CFG.shot.speed;
    for (let i = this.bul.length - 1; i >= 0; i--) {
      const b = this.bul[i]; b.d += sp * dt;
      if (b.d >= b.end) {
        this.bul[i] = this.bul[this.bul.length - 1]; this.bul.pop();
        if (b.hit) this.onShotHit(b.hit, b.x);
      }
    }
  }
  onShotHit(h, x) {
    const it = h.it;
    if (it.t === "barrel") {
      if (it.done || it.hp <= 0) return;
      it.hp -= 1; it.pop = 1; it.lb.el.firstChild.textContent = Math.max(0, it.hp);
      if (Math.random() < 0.5) this.parts.burst(x, 1.4, -it.d + 0.8, 2, 0xc89a5a, 3, 0.12, 2);
      if (this.t - (this.bhT || 0) > 0.07) { this.bhT = this.t; play("househit", { vol: 0.25, gap: 0.06, rate: 1.5 }); }
      if (it.hp <= 0) this.openBarrel(it);
      return;
    }
    if (it.used) return;
    const p = h.p; p.hits++; p.pop = 1;
    p.g = grownGate(p.g0, p.hits, p.g0.N);
    const txt = gateText(p.g) + (p.g.k === "x" ? (p.g.N < RUN_CFG.grow.xMax ? "↑" : "") : "");
    if (txt !== p.txt) {
      const wasGood = p.gd; p.txt = txt; p.gd = gateValueGood(p.g);
      redrawText(p.tex, txt, "#fff", null);
      if (p.gd !== wasGood || (p.g.k === "x" && p.g.N !== p.lastN)) { setGateKind(p.G, p.gd ? (p.g0.k === "x" ? "gold" : "plus") : "bad"); if (p.gd && !wasGood) { play("levelup", { vol: 0.6 }); this.parts.sparkle(x, 2.2, -it.d, 0x7dff9a, 16); } }
      if (p.g.k === "x" && p.g.N !== p.lastN) { p.lastN = p.g.N; play("levelup", { vol: 0.5, rate: 1 + p.g.N * 0.1 }); this.parts.sparkle(x, 2.2, -it.d, 0xffd34a, 16); }
    }
    if (Math.random() < 0.6) this.parts.burst(x, 1.5, -it.d + 0.2, 2, 0xffe27a, 3, 0.1, 2, 4);
    if (this.t - (this.ghT || 0) > 0.06) { this.ghT = this.t; play("coin", { vol: 0.18, gap: 0.05, rate: 1.3 + Math.min(0.8, p.hits * 0.01) }); }
  }
  // ---------- враги: засады и армия ----------
  updateEnemies(dt) {
    const E = this.E, n = this.ne, f = this.form;
    const pf = this.d + (SPC * Math.sqrt(Math.max(1, this.np)) + 0.25) * this.sd * 0.6;
    // столкновение засады с толпой
    if (this.phase === "run") {
      if (!this.clashG) for (const g of this.groups) if (g.kind === "squad" && !g.done && g.count > 0 && g.d - g.R * 0.7 < pf + 0.3 && Math.abs(g.x - this.cx) < 5.5) { this.clashG = g; g.fight = true; play("gong", { vol: 0.5 }); this.eng.shake(0.3); }
      for (const g of this.groups) if (g.kind === "squad" && !g.done) this.ranged(g, dt);
      if (this.clashG) { const g = this.clashG; g.d = lerp(g.d, pf + g.R * 0.7, Math.min(1, dt * 5)); g.x = lerp(g.x, this.cx, Math.min(1, dt * 2)); this.attrition(g, dt, 1); }
      // засады в другой полосе развилки — просто остаются позади
      for (const g of this.groups) if (g.kind === "squad" && !g.done && g.d < this.d - 18) this.groupDone(g, true);
    }
    for (const g of this.groups) g.rank = 0;
    const k = Math.min(1, dt * 6);
    for (let j = 0; j < n; j++) {
      const g = this.groups[this.eg[j]];
      if (!g || g.done) continue;
      const r = g.rank++ % this.cap;
      const tx = g.x + f[r * 2] * 1.05, td = g.d - f[r * 2 + 1] * 1.05;
      E.x[j] += (tx - E.x[j]) * k; this.ed[j] += (td - this.ed[j]) * k;
      if (g.charge || g.fight) { E.run[j] = 1; E.yaw[j] = Math.atan2(this.cx - E.x[j], this.ed[j] - this.d); }
      else { E.run[j] = lerp(E.run[j], 0, k); E.yaw[j] = 0; }
    }
    for (const g of this.groups) if (!g.done) { g.R = SPC * Math.sqrt(Math.max(1, g.rank)) * 1.05 + 0.3; g.lb.x = g.x; g.lb.z = -g.d; g.lb.y = 1.9 + g.R * 0.15; }
  }
  // размен «сила на силу» между толпой и группой (оружие, щиты, улучшения меняют курс)
  defMul() { const sh = this.count > 0 ? this.comp.shield / this.count : 0; return (this.weapon === "shield" ? WEAPONS.shield.def : 1) * (1 - sh * (1 - UNIT.shield.def)); }
  attrition(g, dt, mode) {
    const cpP = this.powNow(), ceP = g.count * g.pw;
    if (g.count <= 0) { this.groupDone(g); return; }
    if (cpP <= 0) return;
    const rate = (7 + 0.42 * Math.min(cpP, ceP)) * dt;
    const wm = weaponMul(this.weapon, { kind: "army", mix: g.mix }, this.mastery);
    const lossE = Math.min(ceP, rate * this.atk * wm), lossP = Math.min(cpP, rate / this.hpm * this.defMul() * (g.str || 1));
    g.count -= lossE / g.pw;
    this.losePower(lossP);
    if (this.count < 1 && this.np === 0) this.count = 0;
    this.attritionVisual(g, true);
    this.hud.count(Math.round(this.count));
    if (this.t - this.sndT > 0.07) { this.sndT = this.t; play(["hit", "hit2", "bone"][(Math.random() * 3) | 0], { vol: 0.55, gap: 0.05 }); }
    if (this.t - this.hapT > 0.1) { this.hapT = this.t; T.haptic("impact", mode === 2 ? "medium" : "light"); this.eng.shake(mode === 2 ? 0.2 : 0.08); }
    const cxp = (this.cx + g.x) / 2;
    if (Math.random() < 0.5) this.parts.sparks(cxp + (Math.random() - 0.5) * 3, 0.7, -(this.d + 1.2), 3);
    if (Math.random() < 0.15) this.parts.dust(cxp + (Math.random() - 0.5) * 3, -(this.d + 1.2), 3, 0.5);
    if (g.count <= 0.5) this.groupDone(g);
  }
  // до схватки: наши лучники/арбалеты дают залп, красные лучники стреляют по нам
  ranged(g, dt) {
    if (g.done || g.fight) return;
    const dist = g.d - g.R * 0.7 - this.d;
    if (dist < 18 && dist > 0 && !g.volleyed) {
      g.volleyed = true;
      const v = volleyPow(this.comp, this.weapon, this.mastery);
      if (v > 0.5) {
        g.count = Math.max(0, g.count - v / g.pw); g.pend = (g.pend || 0);
        const n = Math.min(36, 6 + Math.round(v / 3));
        for (let k = 0; k < n; k++) { const i = (Math.random() * Math.max(1, this.np)) | 0; this.arrows.push({ x0: this.P.x[i] || this.cx, d0: this.ud[i] || this.d, x1: g.x + (Math.random() - 0.5) * g.R * 1.6, d1: g.d + (Math.random() - 0.5) * g.R, t: 0, T: 0.55 + Math.random() * 0.2, hit: k === n - 1 ? g : null }); }
        play("xbow", { vol: 0.8 }); play("arrow", { vol: 0.6 });
        this.hud.float("Залп −" + Math.round(v / g.pw), "good");
      }
    }
    const A = g.mix && g.mix.A ? g.count * g.mix.A : 0;
    if (A > 0 && dist < 24 && dist > 0.5) {
      this.arrowAcc += A * EMIX.A.volley * 0.55 * dt;
      if (Math.random() < Math.min(1, A * dt * 1.2)) { const i = (Math.random() * Math.max(1, this.np)) | 0; this.arrows.push({ x0: g.x + (Math.random() - 0.5) * g.R * 2, d0: g.d + g.R * 0.5, x1: this.P.x[i] || this.cx, d1: this.ud[i] || this.d, t: 0, T: 0.6, red: 1 }); if (this.t - (this.arrT || 0) > 0.15) { this.arrT = this.t; play("arrow", { vol: 0.35, gap: 0.12 }); } }
      if (this.arrowAcc > 1) { const k = this.losePower(this.arrowAcc, "fling", (Math.random() - 0.5) * 3, -2); this.arrowAcc = 0; if (k) this.deathFx(); }
    }
  }
  groupDone(g, quiet) {
    if (g.done) return;
    g.done = true; g.count = 0;
    const gi = this.groups.indexOf(g);
    for (let j = 0; j < this.ne; j++) if (this.eg[j] === gi) { if (quiet) this.edead[j] = 1; else this.killE(j, "fling"); }
    if (!quiet) { this.parts.dust(g.x, -g.d, 12, 0.8); this.parts.ring(g.x, -g.d, 0.5, 4, 0.5, 0xffd36a, 0.1); }
    this.compactE();
    this.labels.remove(g.lb);
    if (this.clashG === g) this.clashG = null;
    if (!quiet) play("coin", { vol: 0.6 });
  }
  // ---------- пушка ----------
  cannonK() { return RUN_CFG.cannonK * (1 + RUN_CFG.cannonUp * (this.up.cannon || 0)); }
  updateCannon(dt) {
    const c = this.cannon; if (!c) return;
    const p = c.pad;
    if (this.phase === "run" && this.d > p.d0 && this.d < p.d1 + 1.5 && Math.abs(this.cx - p.x) < p.hw + 0.6 && this.count > 1) {
      // заряжаем: бойцы прыгают в пушку
      c.acc = (c.acc || 0) + (5 + this.count * 0.11) * dt;
      while (c.acc >= 1 && this.count > 1) {
        c.acc -= 1;
        const i = (Math.random() * this.np) | 0;
        const P = this.P;
        if (this.np <= 0) break;
        const t = P.ty[i]; if (t === 5) continue;   // чемпиона в пушку не грузим
        const pw = this.unitPow(t) * this.repT[t];
        this.debris.add(P.x[i], 0.4, -this.ud[i], (c.pad.x - P.x[i]) * 0.9, 7, -(p.d1 + 1.5 - this.ud[i]) * 1.2, this.look.color, Math.PI, null, TSCALE[t]);
        this.comp[TYPES[t]] = Math.max(0, this.comp[TYPES[t]] - this.repT[t]); this.dead[i] = 2; this.compact(); this.count = compCount(this.comp);
        c.ammo += pw; this.fed += pw;
      }
      c.lb.set(Math.round(c.ammo * this.cannonK())); if (Math.random() < 0.3) c.lb.pop();
      if (this.t - (c.sT || 0) > 0.12) { c.sT = this.t; play("select", { vol: 0.5, rate: 0.8 + Math.min(0.8, c.ammo / 100), vary: false }); }
      if (this.t - this.hapT > 0.09) { this.hapT = this.t; T.haptic("select"); }
      this.hud.count(Math.round(this.count));
    }
    // после площадки пушка едет следом
    if (this.d > p.d1 + 3 && c.ammo > 0 && !c.follow) { c.follow = true; play("confirm"); }
    if (c.follow) {
      const hw = this.roadAt(this.d).hw;
      const tx = c.side * (hw - 1.2), td = this.d - 3.5;
      c.cm.position.x = lerp(c.cm.position.x, tx - (c.lc || 0), Math.min(1, dt * 4));
      const cur = -(c.cm.position.z + c.g.position.z);
      const nd = lerp(cur, td, Math.min(1, dt * 4)); c.cm.position.z = -nd - c.g.position.z;
      c.lb.x = c.cm.position.x + (c.lc || 0); c.lb.z = -nd; c.lb.y = 2.7;
      c.wd = nd;
      if (c.ammo <= 0.01) { c.follow = false; c.lb.on = false; }
    }
  }
  fireCannon(dt) {
    const c = this.cannon; if (!c || !c.follow || c.ammo <= 0.01) return;
    if ((this.final.bd || this.final.d) - this.d > 42) return;
    c.fireT = (c.fireT || 0) - dt;
    if (c.fireT > 0) return;
    c.fireT = 0.13;
    const take = Math.min(c.ammo, Math.max(1, c.ammo / 25)); c.ammo -= take;
    c.lb.set(Math.round(c.ammo * this.cannonK()));
    const sx = c.cm.position.x + (c.lc || 0), sd = c.wd + 1.6;
    let tx = 0, td = this.final.bd || this.final.d;
    if (this.final.grp && !this.final.grp.done) {
      const gi = this.groups.indexOf(this.final.grp); let j = (Math.random() * this.ne) | 0;
      for (let s = 0; s < 10 && this.eg[j] !== gi; s++) j = (Math.random() * this.ne) | 0;
      if (this.eg[j] === gi) { tx = this.E.x[j]; td = this.ed[j]; }
    }
    const T0 = 0.75 + Math.random() * 0.2;
    this.shots.push({ tx, td, t: T0, pow: take * this.cannonK() });
    this.debris.add(sx, 1.9, -sd, (tx - sx) / T0, (0 - 1.9 + 0.5 * 22 * T0 * T0) / T0, -(td - sd) / T0, this.look.color, 0, -5);
    play("cannon", { vol: 0.6, gap: 0.09 });
    c.cm.userData.barrel.position.z = 0.3;
    this.parts.burst(sx, 2.2, -(sd + 1), 4, 0xffffff, 2, 0.25, 2, 2);
  }
  updateShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.t -= dt;
      if (s.t > 0) continue;
      this.shots.splice(i, 1);
      const F = this.final;
      play("boom", { vol: 0.5, gap: 0.08 }); this.eng.shake(0.18);
      this.parts.explosion(s.tx, -s.td, 1.3);
      if (F.grp && !F.grp.done) { F.grp.count -= s.pow / F.grp.pw; this.attritionVisual(F.grp); if (F.grp.count <= 0.5) this.groupDone(F.grp); }
      else if (F.hp != null) { F.hp -= s.pow; }
    }
    if (this.cannon) this.cannon.cm.userData.barrel.position.z = lerp(this.cannon.cm.userData.barrel.position.z, 0, 0.2);
  }
  attritionVisual(g, front) {
    const gi = this.groups.indexOf(g), want = Math.ceil(Math.max(0, g.count) / g.rep);
    let alive = 0; for (let j = 0; j < this.ne; j++) if (this.eg[j] === gi && !this.edead[j]) alive++;
    for (let rm = alive - want; rm > 0; rm--) {
      let bj = -1, bd = 1e9;
      for (let s = 0; s < (front ? 8 : 20); s++) { const j = (Math.random() * this.ne) | 0; if (this.eg[j] === gi && !this.edead[j] && (!front || this.ed[j] < bd)) { bd = this.ed[j]; bj = j; if (!front) break; } }
      if (bj < 0) for (let j = 0; j < this.ne; j++) if (this.eg[j] === gi && !this.edead[j]) { bj = j; break; }
      if (bj < 0) break;
      this.killE(bj, Math.random() < 0.3 || !front ? "fling" : "pop"); this.kills++;
    }
    this.compactE();
    g.lb.set(Math.max(0, Math.ceil(g.count)));
  }
  // ---------- финал ----------
  beginFinal() {
    this.phase = "battle"; this.clashG = null;
    const F = this.final;
    F.started = true; F.contact = false;
    if (F.grp) F.grp.charge = false;
    play(F.kind === "boss" ? "roar" : "gong", { vol: 0.8 });
    this.hud.toast(F.kind === "boss" ? "Великан!" : F.kind === "castle" ? "Штурм крепости!" : "В атаку!");
    T.haptic("notify", "warning");
  }
  battleMove(dt) {
    const F = this.final, C = RUN_CFG;
    this.fireCannon(dt);
    // сначала защитники / армия: сходятся в линию и рубятся
    if (F.grp && !F.grp.done) {
      this.ranged(F.grp, dt);
      const g = F.grp, Rp = SPC * Math.sqrt(Math.max(1, this.np)) + 0.25, pf = this.d + Rp * this.sd * 0.6, ef = g.d - g.R * 0.65;
      if (!F.contact) {
        if (ef - pf < 18) g.charge = true;
        if (g.charge) g.d -= 5 * dt;
        if (ef - pf > 0.3) return C.speed * 0.85;
        F.contact = true; F.cp = (pf + ef) / 2; this.slowT = 0.9; this.eng.shake(0.6); play("boom2", { vol: 0.7 }); T.haptic("impact", "heavy");
      }
      g.fight = true;
      g.d = lerp(g.d, F.cp + g.R * 0.65, Math.min(1, dt * 3));
      const v = (F.cp - Rp * this.sd * 0.6 - this.d) * 3;
      this.attrition(g, dt, 2);
      if (g.done) { F.contact = false; if (F.kind === "army") this.winBattle(); }
      return v;
    }
    if (F.kind === "army") { if (!F.done) this.winBattle(); return C.speed; }
    // великан / крепость
    const front = this.d + (SPC * Math.sqrt(Math.max(1, this.np)) + 0.25) * this.sd * 0.6;
    const gap = F.bd - (F.kind === "boss" ? 2.6 : 1.2) - front;
    if (gap > 0.3) { this.updateBossIdle(dt); return C.speed * 0.8; }
    if (!F.contact) { F.contact = true; this.slowT = 0.8; this.eng.shake(0.6); play(F.kind === "boss" ? "roar2" : "stonehit", { vol: 0.8 }); T.haptic("impact", "heavy"); }
    // размен: наши бойцы бьют, великан/стрелы косят
    const cp = this.powNow();
    const rate = (6 + 0.35 * Math.min(cp, F.hp)) * dt;
    F.hp -= rate * this.atk * weaponMul(this.weapon, { kind: F.kind }, this.mastery);
    F.pend += rate / this.hpm * this.defMul();
    if (F.kind === "boss") this.bossFight(dt); else this.castleFight(dt);
    if (Math.random() < 0.7) this.parts.burst((Math.random() - 0.5) * 3, 1 + Math.random() * 2, -(F.bd - 1.5), 2, 0xffe08a, 4, 0.1, 3);
    if (this.t - this.sndT > 0.08) { this.sndT = this.t; play(F.kind === "boss" ? (Math.random() < 0.5 ? "hit" : "bone") : "stonehit", { vol: 0.45, gap: 0.06 }); }
    F.lb.el.querySelector("i").style.width = Math.max(0, F.hp / F.max * 100) + "%";
    F.lb.el.querySelector("b").textContent = Math.max(0, Math.ceil(F.hp));
    if (F.hp <= 0) { F.hp = 0; this.winBattle(); }
    return 0;
  }
  updateBossIdle(dt) {
    const F = this.final; if (F.kind !== "boss") return;
    const B = F.boss; B.run[0] = 0; B.atk[0] = 0.12 + Math.sin(this.t * 2.5) * 0.1; B.commit(1);
  }
  bossFight(dt) {
    const F = this.final, B = F.boss;
    F.swing -= dt;
    // замах
    const k = F.swing < 0.35 ? 1 - F.swing / 0.35 : 0;
    B.atk[0] = F.swing < 0.3 ? Math.min(1, k * 1.3) : Math.max(0, B.atk[0] - dt * 1.4);
    if (F.swing <= 0) {
      F.swing = 1.25;
      // удар: улетает накопленное
      const n = F.pend; F.pend = 0;
      this.losePower(n, "fling", (Math.random() - 0.5) * 14, 9 + Math.random() * 6);
      this.eng.shake(0.7); play("heavy", { vol: 0.9 }); play("die", { vol: 0.4, gap: 0.2 }); T.haptic("impact", "heavy");
      this.parts.dust(0, -(F.bd - 2.5), 16, 1.0); this.parts.ring(0, -(F.bd - 2.5), 0.6, 5, 0.5, 0xffe2b0, 0.1);
      this.parts.burst(0, 0.2, -(F.bd - 2), 20, 0xcfc6b8, 7, 0.22, 3);
      this.hud.count(Math.round(this.count));
    }
    B.run[0] = 0; B.commit(1);
    if (this.count < 1 && this.np === 0) this.fail("dead");
  }
  castleFight(dt) {
    const F = this.final;
    // бойцы ломятся в ворота и тают; лучники с башен
    const n = F.pend; F.pend = 0;
    if (this.losePower(n, null, (Math.random() - 0.5) * 6, 3)) this.hud.count(Math.round(this.count));
    F.arrowT -= dt;
    if (F.arrowT <= 0) { F.arrowT = 0.5; play("arrow", { vol: 0.4, gap: 0.2 }); }
    F.door.position.x = Math.sin(this.t * 40) * 0.08 * (1 - F.hp / F.max);
    if (this.t - this.hapT > 0.12) { this.hapT = this.t; T.haptic("impact", "light"); this.eng.shake(0.12); }
  }
  winBattle() {
    const F = this.final; if (F.done) return;
    F.done = true;
    if (F.kind === "boss") {
      const B = F.boss; B.mesh.visible = false; this.parts.explosion(0, -F.bd, 3);
      for (let i = 0; i < 6; i++) this.debris.add((Math.random() - 0.5) * 2, 3, -F.bd, (Math.random() - 0.5) * 8, 8, -4, RED, 0, 0);
      this.parts.burst(0, 3, -F.bd, 40, RED, 8, 0.3, 6);
      play("collapse", { vol: 0.9 }); play("roar", { vol: 0.5, rate: 0.7 });
      F.lb.on = false;
    } else if (F.kind === "castle") {
      for (const p of F.parts) { this.parts.burst(p.position.x, 3, -(F.d + 6), 8, 0x8d8a86, 7, 0.45, 6); this.parts.explosion(p.position.x, -(F.d + 6), 2.2); p.visible = false; }
      this.parts.dust(0, -(F.d + 4), 30, 1.4);
      play("collapse", { vol: 1 }); this.eng.shake(1);
      F.lb.on = false;
    }
    this.eng.shake(0.6);
    T.haptic("notify", "success");
    this.hud.toast("Победа!");
    this.slowT = 0;
    this.phase = "stairs"; this.stair = -1; this.stairT = 0;
    if (this.cannon) { this.cannon.follow = false; this.cannon.lb.on = false; }
  }
  stairsMove(dt) {
    // каждая ступень забирает своих бойцов — они остаются стоять на ней
    const i = Math.floor((this.d - this.stairsD) / 2);
    if (this.d < this.stairsD) return RUN_CFG.speed;
    if (i > this.stair && i < 10) {
      const need = this.stepCost[i], pw = this.powNow();
      if (pw + 0.01 < need) { this.finishStairs(); return 0; }
      this.stair = i; this.mult = RUN_CFG.stair[i];
      const kk = Math.max(0, 1 - need / pw), before = this.count;
      for (const t of TYPES) this.comp[t] *= kk;
      // ставим бойцов на ступеньку
      let show = Math.min(Math.max(1, Math.ceil((before - compCount(this.comp)) / this.repP())), this.np, 60);
      const P = this.P, K = this.Park;
      K.parkN = K.parkN || 0;
      for (let s = 0; s < show && K.parkN < K.cap; s++) {
        const j = K.parkN++;
        K.x[j] = (s / Math.max(1, show - 1) - 0.5) * 5.6; K.y[j] = 0.55 * (i + 1); K.z[j] = -(this.stairsD + i * 2 + 0.8 + (s % 2) * 0.5); K.s[j] = 1; K.yaw[j] = Math.PI; K.run[j] = 0; K.atk[j] = 1;
      }
      K.commit(K.parkN);
      this.syncUnits(false);
      play("select", { rate: 0.8 + i * 0.12, vary: false, vol: 0.8 }); play("coin", { vol: 0.5 });
      T.haptic("impact", "medium");
      this.hud.float("×" + String(RUN_CFG.stair[i]).replace(".", ","), "gold");
      this.parts.burst(0, 0.55 * (i + 1) + 0.5, -(this.stairsD + i * 2 + 1), 14, new THREE.Color().setHSL(i / 10 * 0.8, 0.8, 0.6).getHex(), 6, 0.15, 6, 12);
      this.hud.count(Math.round(this.count));
      if (i === 9) { this.topT = this.t + 0.5; }
    }
    if (this.topT && this.t > this.topT) { this.topT = 0; this.finishStairs(); return 0; }
    return i >= 10 ? 0 : RUN_CFG.speed * 0.6;
  }
  finishStairs() {
    if (this.phase === "done") return;
    this.mult = Math.max(1, this.mult || 1);
    this.phase = "done";
    const coins = Math.round((RUN_CFG.coinsBase + RUN_CFG.coinsPerLv * this.n) * this.mult * (1 + RUN_CFG.incK * (this.up.inc || 0)));
    this.result = { win: true, mult: this.mult, coins, kills: Math.round(this.kills), max: Math.round(this.maxCount) };
    for (let k = 0; k < 4; k++) setTimeout(() => this.parts && this.parts.burst((Math.random() - 0.5) * 6, 8, -(this.d + 2), 30, [0xffd34a, 0x5ac8ff, 0xff6ad5, 0x7dff8a][k], 7, 0.16, 8, 9), k * 220);
    play("perk", { vol: 0.8 });
    setTimeout(() => this.hud.end(this.result), 900);
  }
  fail(why) {
    if (this.phase === "fail" || this.phase === "done") return;
    this.phase = "fail"; this.failWhy = why;
    this.result = { win: false, why, coins: Math.round((RUN_CFG.coinsBase * 0.4 + this.n) * Math.min(1, this.d / this.len)), progress: Math.min(1, this.d / this.len), max: Math.round(this.maxCount) };
    T.haptic("notify", "error");
    play("die2", { vol: 0.8 });
    this.hud.toast(why === "time" ? "Мост подняли — не успели!" : "Отряд разбит");
    setTimeout(() => this.hud.end(this.result), 1300);
  }
  // ---------- бот для автотестов и демо ----------
  // skilled — лучшие ворота с учётом стрельбы, лучшее оружие против финала, бочки, обход ловушек; random — рулит наугад
  autoSteer() {
    if (this.phase !== "run") return;
    const hw = this.roadAt(this.d + 4).hw, R0 = SPC * Math.sqrt(Math.max(1, this.np)) + 0.25;
    if (this.autoKind === "random") {
      this.rndT = (this.rndT || 0) - 1 / 30;
      if (this.rndT <= 0) { this.rndT = 0.5 + Math.random() * 0.9; this.rndX = (Math.random() * 2 - 1) * hw; }
      this.want = lerp(this.want, this.rndX, 0.2); this.dragT += 0.05; return;
    }
    const side = (this.autoSide = this.autoSide || (Math.random() < 0.5 ? -1 : 1));
    let target = this.cx, best = 1e9;
    const consider = (dist, x) => { if (dist > -2 && dist < best) { best = dist; target = x; } };
    const rate = shotRate(this.count, this.comp.archer, this.up.shots), spd = RUN_CFG.speed;
    // ворота и стойки с оружием: лучшая створка (ворота «↑» — с учётом того, что успеем настрелять)
    const g = this.items.find((it) => it.panels && !it.used && it.d > this.d - 1 && it.d - this.d < 34 && (!it.lc || Math.sign(it.lc) === side));
    if (g) {
      let bk = 0, bv = -1;
      const vs = { kind: this.def.f === "army" ? "army" : this.def.f, mix: this.def.mix };
      g.panels.forEach((p, k) => {
        let v;
        if (g.t === "weapon") v = weaponMul(p.w, vs, this.mastery) * (p.w === "shield" ? 1.04 : 1);
        else { const left = Math.max(0, (g.d - this.d - 2) / spd); const pg = p.g0.grow ? grownGate(p.g0, p.hits + rate * left * 0.75, p.g0.N) : p.g; v = compPower(applyGateComp(cloneComp(this.comp), pg), this.cards); }
        if (v > bv) { bv = v; bk = k; }
      });
      consider(g.d - this.d + 6, (g.lc || 0) + (g.off || 0) + (-g.tot / 2 + g.W * (bk + 0.5)));
    }
    // бочки: стоим за ней, пока успеваем разбить; вплотную — обходим
    for (const it of this.items) {
      if (it.t !== "barrel" || it.done || it.d < this.d || it.d - this.d > 34) continue;
      const left = (it.d - this.d - 1) / spd;
      if (it.d - this.d < 3.5) consider(0, it.bx > 0 ? it.bx - 1.3 - R0 : it.bx + 1.3 + R0);
      else if (it.hp <= rate * left * 0.85) consider(it.d - this.d + 3, it.bx);
    }
    const fk = this.items.find((it) => it.t === "fork" && it.d - this.d < 30 && it.d1 > this.d);
    if (fk) consider(fk.d - this.d, side * fk.lc);
    const c = this.cannon; if (c && this.d > c.pad.d0 - 20 && this.d < c.pad.d1) consider(c.pad.d0 - this.d, c.pad.x);
    // ямы — в сторону, где больше места
    const tail = this.d - R0 * this.sd - 1;
    for (const p of this.pits) if (!p.split && p.d1 > tail && p.d0 - this.d < 16) { const left = p.x0 - (-hw), right = hw - p.x1; consider(Math.max(0, p.d0 - this.d - 3), left > right ? (-hw + p.x0) / 2 : (p.x1 + hw) / 2); }
    // вертушки, пилы, маятники, катки — мимо центра ловушки
    for (const it of this.items) {
      if (it.d - this.d > 16 || it.d + (it.len || 8) < this.d - 2) continue;
      if (it.blades) for (const b of it.blades) if (b.pd + b.L > tail) consider(Math.max(0, b.pd - this.d - 4), b.px > 0 ? b.px - b.L - R0 * 0.6 : b.px + b.L + R0 * 0.6);
      if (it.logs) for (const lg of it.logs) if (lg.d > this.d) consider(lg.d - this.d - 2, lg.x > 0 ? lg.x - lg.L / 2 - R0 : lg.x + lg.L / 2 + R0);
      if (it.zones) { const b = it.zones.find((z) => z.boost); if (b) consider(it.d - this.d, b.x); }
      if (it.sp) { const on = it.sp.find((q) => q.on); if (on) consider(it.d - this.d, on.x0 < 0 ? hw / 2 : -hw / 2); }
    }
    const sq = this.groups.find((gg) => gg.kind === "squad" && !gg.done && gg.d - this.d < 20 && gg.d > this.d);
    if (sq) consider(sq.d - this.d + 8, sq.x);
    this.want = lerp(this.want, target, 0.2);
    this.dragT += 0.05;
  }
  // ---------- камера и отрисовка ----------
  updateCamera(dt) {
    const cam = this.eng.camera;
    const R = SPC * Math.sqrt(Math.max(1, this.np)) + 0.3;
    let h = 7.6 + R * 0.75, back = 9.5 + R * 0.85, ahead = 10, lx = this.cx * 0.55;
    if (this.phase === "battle") { const big = this.final.kind === "boss" ? 5 : this.final.kind === "castle" ? 4 : 3; h += big; back += big; ahead = 14; }
    if (this.phase === "stairs" || (this.phase === "done" && this.result && this.result.win)) { h = 9; back = 13; ahead = 4; lx = 0; }
    if (this.phase === "intro") { h = 6.5 + R * 0.6; back = 8.5 + R * 0.6; }
    const yb = this.phase === "stairs" || this.phase === "done" ? Math.max(0, this.stair) * 0.55 : 0;
    const tp = new THREE.Vector3(lx, h + yb, -(this.d - back));
    const k = this.camInit ? Math.min(1, dt * 3.5) : 1; this.camInit = true;
    cam.position.lerp(tp, k);
    this._look = this._look || new THREE.Vector3(lx, 0, -(this.d + ahead));
    this._look.lerp(new THREE.Vector3(lx, yb, -(this.d + ahead)), k);
    cam.lookAt(this._look);
  }
  render(dt) {
    const P = this.P;
    for (let i = 0; i < this.np; i++) P.z[i] = -this.ud[i];
    P.commit(this.np);
    const E = this.E;
    for (let j = 0; j < this.ne; j++) { E.z[j] = -this.ed[j]; E.y[j] = 0; }
    E.commit(this.ne);
    this.debris.update(dt * this.timeScale);
    this.parts.update(dt * this.timeScale);
    const R = SPC * Math.sqrt(Math.max(1, this.np)) + 0.4;
    this.eng.focus(this.cx * 0.5, -(this.d + 6));
    this.lbl.x = this.cx; this.lbl.y = 1.6 + R * 0.25; this.lbl.z = -(this.d + R * this.sd * 0.2);
    this.lbl.set((this.lblIcon ? this.lblIcon + " " : "") + Math.max(0, Math.round(this.count)));
    { const m = this.bulM.instanceMatrix.array; let k = 0; for (const b of this.bul) { const o = k++ * 16; m.fill(0, o, o + 16); m[o] = m[o + 5] = m[o + 10] = 1; m[o + 15] = 1; m[o + 12] = b.x; m[o + 13] = b.y; m[o + 14] = -b.d; } this.bulM.count = k; this.bulM.instanceMatrix.needsUpdate = true; }
    { const am = this.arrM, m4 = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), p = this._p || (this._p = new THREE.Vector3()), e3 = this._e3 || (this._e3 = new THREE.Euler()), one = this._one || (this._one = new THREE.Vector3(1, 1, 1)); let k = 0;
      for (const a of this.arrows) { if (k >= 80) break; const f = Math.min(1, a.t / a.T); p.set(lerp(a.x0, a.x1, f), 1 + Math.sin(f * Math.PI) * 3, -lerp(a.d0, a.d1, f)); e3.set(-Math.cos(f * Math.PI) * 0.9 * Math.sign(a.d1 - a.d0), Math.atan2(a.x1 - a.x0, -(a.d1 - a.d0)), 0); q.setFromEuler(e3); m4.compose(p, q, one); am.setMatrixAt(k++, m4); }
      am.count = k; am.instanceMatrix.needsUpdate = true; }
    this.lbl.on = this.np > 0 && this.phase !== "done";
    this.updateCamera(dt);
    this.labels.update(this.eng.W, this.eng.H);
    if (this.phase === "run" || this.phase === "battle") this.hud.progress(Math.min(1, this.d / this.len));
    if (this.def.tm) this.hud.timer(Math.ceil(this.timeLeft));
  }
}
