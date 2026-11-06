// «Отряд» — режим «Забег»: толпа бежит вперёд, палец рулит влево-вправо, ворота меняют число,
// ловушки косят бойцов, в конце — армия, великан или крепость, потом лестница множителей.
import { THREE, Units, Debris, Particles, Labels, textTex, glowLabel, blobShadow, buildScenery, fenceLine, placeModels, makeGate, makeCannonModel, makeBanner, cloneModel, hueMaterial, pbr, boxUV, disposeGroup, clamp, lerp, rng, BIOMES, RED as RED0, COL } from "./core.js";
import { RUN_CFG, levelDef, finalStrength, applyGate } from "./levels.js";
import { play } from "./audio.js";

const T = window.TG;
const GA = Math.PI * (3 - Math.sqrt(5));
const SPC = 0.215;                 // плотность строя
const BLUE_DBG = 0x2f7bff, RED = 0xe5393b;
const fmtGate = (v) => (v[0] === "x" ? "×" : v[0] === "/" ? "÷" : v[0] === "-" ? "−" : "+") + v.slice(1);
const good = (v) => v[0] === "+" || v[0] === "x";

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
    this.enemyTotal = fs.enemy; this.est = fs.est;
    eng.setBiome(this.def.biome);
    this.B = BIOMES[this.def.biome];
    this.world = new THREE.Group(); eng.scene.add(this.world);
    this.atk = 1 + RUN_CFG.atkK * (up.atk || 0); this.hpm = 1 + RUN_CFG.hpK * (up.hp || 0);
    this.count = RUN_CFG.startUnits + RUN_CFG.startPerUp * (up.start || 0);
    this.np = 0;
    this.P = new Units(eng, this.cap, look.color, look.hat, "blue"); this.world.add(this.P.mesh);
    this.E = new Units(eng, this.cap, RED, "none", "red"); this.world.add(this.E.mesh);
    this.Park = new Units(eng, 700, look.color, look.hat, "cheer"); this.world.add(this.Park.mesh);
    for (let i = 0; i < 700; i++) { this.Park.run[i] = 1; this.Park.atk[i] = -0.6; this.Park.yaw[i] = Math.PI; }
    this.debris.setTeam(look.color);
    this.ne = 0; this.groups = []; this.items = []; this.road = []; this.pits = []; this.shots = [];
    this.d = 0; this.cx = 0; this.want = 0; this.sx = 1; this.sd = 1; this.t = 0; this.phase = "intro";
    this.spdMul = 1; this.boostT = 0; this.clashG = null; this.cannon = null; this.fed = 0;
    this.kills = 0; this.lostTotal = 0; this.maxCount = this.count; this.tutStep = this.def.tut ? 1 : 0; this.dragT = 0;
    this.result = null; this.mult = 0; this.stats = { gates: [] }; this.topT = 0; this.hitAcc = 0; this.hapT = 0; this.sndT = 0;
    this.build();
    this.lbl = this.labels.add("cnt blue", "0"); this.lbl.pop();
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
    const L = { gate: 4, squad: 12, blade: 10, blade2: 14, saw: 0, pit: 9, log: 26, crush: 4, bridge: 0, spikes: 7, axe: 0, cannon: 18, speed: 12 };
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
          const v = it.v[k], gd = good(v), x = -it.tot / 2 + W * (k + 0.5);
          const pg = new THREE.Group(); pg.position.x = x; g.add(pg);
          const G = makeGate(W, fmtGate(v), gd ? (v[0] === "x" ? "mult" : "plus") : "bad"); pg.add(G.g);
          it.panels.push({ v, x, pg, pm: G.pm, lab: G.lab, gd });
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
        it.grp = this.addGroup(it.n, (it.lc || 0), it.d + 6, "squad");
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
    const g = makeCannonModel();
    g.userData.barrel = g.userData.pitch;
    g.userData.pitch.rotation.x = 0.35;
    return g;
  }
  addGroup(n, x, d, kind, opts) {
    const grp = Object.assign({ n, count: n, x, d, kind, idx: [], R: 0, charge: false, done: false, lb: null }, opts || {});
    const show = Math.min(n, this.cap - this.ne, kind === "army" ? 900 : 250);
    grp.rep = n / Math.max(1, show);
    for (let i = 0; i < show; i++) {
      const j = this.ne++;
      this.E.x[j] = x + this.form[i * 2] * 1.05; this.ed[j] = d - this.form[i * 2 + 1] * 1.05; this.E.y[j] = 0; this.E.yaw[j] = 0; this.E.s[j] = 1; this.E.run[j] = 0; this.E.atk[j] = 0;
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
      this.final.grp = this.addGroup(this.enemyTotal, 0, fd, "army");
    } else if (f === "boss") {
      const B = new Units(this.eng, 1, RED, this.def.king ? "crown" : "none", "boss"); w.add(B.mesh); B.near.castShadow = true;
      B.x[0] = 0; B.y[0] = 0; B.z[0] = -(fd + 2); B.yaw[0] = 0; B.s[0] = this.def.king ? 5.6 : 4.6; B.run[0] = 0; B.atk[0] = 0; B.commit(1);
      this.final.boss = B; this.final.hp = this.enemyTotal; this.final.max = this.enemyTotal; this.final.swing = 1.2; this.final.pend = 0; this.final.atk = 0;
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
      const lb = this.labels.add("hpbar", ""); lb.el.innerHTML = '<i></i><b></b>'; lb.x = 0; lb.y = 7; lb.z = -(fd + 6); this.final.lb = lb;
      this.final.bd = fd + 4.6;
      // защитники перед воротами
      this.final.grp = this.addGroup(Math.max(4, Math.round(this.enemyTotal * 0.25)), 0, fd, "army");
      this.final.hp = this.final.max = Math.round(this.enemyTotal * 0.75);
    }
    // лестница: подписи ×1…×10
    const est = Math.max(10, this.est.power - this.enemyTotal);
    this.stepCost = []; let acc = 0;
    for (let i = 0; i < 10; i++) { const c = Math.max(1, Math.round(est * 0.068 * (1 + i * 0.12))); this.stepCost.push(c); acc += c; }
    for (let i = 0; i < 10; i++) {
      const m = glowLabel("×" + (i + 1), 2.4, 1.2, 1.25);
      m.rotation.x = -Math.PI / 2 + 0.25; m.position.set(0, 0.55 * (i + 1) + 0.02, -(this.stairsD + i * 2 + 1)); w.add(m);
    }
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.4), mat("gold", 0xffc83a)); chest.position.set(0, 0.55 * 11 + 0.7, -(this.stairsD + 27)); w.add(chest);
  }
  // ---------- число и рисованные человечки ----------
  repP() { return this.count > this.np && this.np > 0 ? this.count / this.np : 1; }
  syncUnits(init) {
    const want = Math.min(this.cap, Math.max(0, Math.round(this.count)));
    const P = this.P;
    while (this.np < want) {
      const i = this.np++;
      // новые появляются в задней части строя
      const k = i * 2;
      P.x[i] = this.cx + this.form[k] * this.sx * 0.5; this.ud[i] = this.d + this.form[k + 1] * this.sd * 0.5; P.y[i] = 0; P.yaw[i] = Math.PI; P.s[i] = init ? 1 : 0.01; P.run[i] = 1; P.atk[i] = 0;
      this.dead[i] = 0; this.pop[i] = init ? 1 : 0;
    }
    if (this.np > want) {
      // лишние (деление/минус) — исчезают с облачком, с разных мест строя
      let rm = this.np - want;
      const r = Math.random;
      for (let tries = 0; rm > 0 && tries < this.np * 3; tries++) { const i = (r() * this.np) | 0; if (!this.dead[i]) { this.dead[i] = 2; rm--; } }
      this.compact();
    }
  }
  killP(i, how, vx, vz) {
    if (this.dead[i]) return;
    this.dead[i] = 1;
    const P = this.P, x = P.x[i], z = -this.ud[i], y = P.y[i];
    const col = this.look.color;
    if (how === "fall") this.debris.add(x, y, z, (vx || 0) * 0.5, 0.5, (vz || 0), col, P.yaw[i]);
    else if (how === "fling") this.debris.add(x, y + 0.2, z, vx != null ? vx : (Math.random() - 0.5) * 10, 6 + Math.random() * 5, vz != null ? vz : (Math.random() - 0.5) * 6, col, P.yaw[i], 0);
    else if (how === "squash") { this.parts.burst(x, 0.2, z, 3, col, 3, 0.16, 2); if (Math.random() < 0.3) this.parts.dust(x, z, 3, 0.4); }
    else this.parts.burst(x, 0.5, z, 2, col, 3.5, 0.13, 3);
    this.count -= this.repP();
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
    if (this.count < 0.5) this.count = 0;
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
    const half = (Rr - L) / 2 - 0.3;
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
      if (this.pop[i] < 1) { this.pop[i] = Math.min(1, this.pop[i] + dt * 5); P.s[i] = 0.2 + 0.8 * this.pop[i] + Math.sin(this.pop[i] * Math.PI) * 0.35; }
      P.run[i] = 1; P.yaw[i] = Math.PI + (tx - x) * 0.6;
      // ловушки
      for (let h = 0; h < hazards.length; h++) { const how = hazards[h](x, ud, i); if (how) { this.killP(i, how.k || how, how.vx, how.vz); anyDead = true; break; } }
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
      if (it.panels && it.used) { it.fade = (it.fade || 0) + dt; const f = it.fade; it.panels.forEach((p, k) => { if (k === it.chosen && f < 0.25) { p.pm.emissiveIntensity = 2.5 - f * 8; p.pg.scale.setScalar(1 + f * 0.6); } else { p.pg.position.y = -Math.max(0, f - (k === it.chosen ? 0.25 : 0)) * 7; p.pg.rotation.x = f * 1.5; } }); if (f > 1.1) { it.g.visible = false; it.panels = null; } }
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
  // ---------- ворота ----------
  checkGates() {
    for (const it of this.items) {
      if (!it.panels || it.used || it.d > this.d) continue;
      it.used = true;
      if (it.lc && Math.sign(it.lc) !== Math.sign(this.cx || 1)) { it.chosen = -1; continue; }
      // какая створка под центром толпы
      const lx = this.cx - (it.lc || 0) - (it.off || 0);
      let k = Math.floor((lx + it.tot / 2) / it.W);
      if (k < 0 || k >= it.panels.length) { if (it.move) { it.chosen = -1; continue; } k = clamp(k, 0, it.panels.length - 1); }
      it.chosen = k;
      const v = it.panels[k].v, before = this.count;
      this.count = Math.max(0, applyGate(Math.round(this.count), v));
      const gd = good(v), diff = Math.round(this.count - before);
      this.syncUnits(false);
      this.hud.count(Math.round(this.count), true);
      this.lbl.pop();
      this.hud.float((diff >= 0 ? "+" : "−") + Math.abs(diff), gd ? "good" : "bad");
      play(gd ? (v[0] === "x" ? "levelup" : "coin2") : "error", { vol: gd ? 0.7 : 0.8 });
      T.haptic("impact", gd ? "medium" : "heavy");
      this.parts.burst(this.cx, 1.3, -it.d, 10, gd ? 0x7cc8ff : 0xff6a6a, 6, 0.16, 4, 10);
      this.parts.sparkle(this.cx, 1.4, -it.d, gd ? 0x9fe0ff : 0xff8a8a, 14); this.parts.ring(this.cx, -it.d, 0.3, 3.2, 0.45, gd ? 0x7cc8ff : 0xff5a5a, 0.1);
      if (!gd) this.eng.shake(0.25);
      this.stats = this.stats || { gates: [] }; this.stats.gates.push(v);
    }
  }
  // ---------- враги: засады и армия ----------
  updateEnemies(dt) {
    const E = this.E, n = this.ne, f = this.form;
    const pf = this.d + (SPC * Math.sqrt(Math.max(1, this.np)) + 0.25) * this.sd * 0.6;
    // столкновение засады с толпой
    if (this.phase === "run") {
      if (!this.clashG) for (const g of this.groups) if (g.kind === "squad" && !g.done && g.count > 0 && g.d - g.R * 0.7 < pf + 0.3 && Math.abs(g.x - this.cx) < 5.5) { this.clashG = g; g.fight = true; play("gong", { vol: 0.5 }); this.eng.shake(0.3); }
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
  // размен 1:1 между толпой и группой
  attrition(g, dt, mode) {
    const cp = this.count, ce = g.count;
    if (ce <= 0) { this.groupDone(g); return; }
    if (cp <= 0) return;
    const rate = (7 + 0.42 * Math.min(cp, ce)) * dt;
    const lossE = Math.min(ce, rate * this.atk), lossP = Math.min(cp, rate / this.hpm * (g.str || 1));
    g.count -= lossE;
    // наши потери: передние бойцы, убираем по одному рисованному
    this.hitAcc += lossP;
    const rp = this.repP();
    let killed = 0;
    while (this.hitAcc >= rp && this.np > 0) {
      this.hitAcc -= rp;
      // ищем переднего среди нескольких случайных
      let bi = -1, bd = -1e9;
      for (let s = 0; s < 6; s++) { const i = (Math.random() * this.np) | 0; if (!this.dead[i] && this.ud[i] > bd) { bd = this.ud[i]; bi = i; } }
      if (bi < 0) break;
      this.killP(bi, Math.random() < 0.25 ? "fling" : "pop", (Math.random() - 0.5) * 6, 5);
      killed++;
    }
    if (this.count < 1) this.count = 0;
    if (killed) this.compact();
    // их потери — передние красные этой группы
    const showWant = Math.ceil(g.count / g.rep);
    let alive = 0; for (let j = 0; j < this.ne; j++) if (this.eg[j] === this.groups.indexOf(g) && !this.edead[j]) alive++;
    let rm = alive - showWant, gi = this.groups.indexOf(g);
    while (rm > 0) {
      let bj = -1, bd = 1e9;
      for (let s = 0; s < 8; s++) { const j = (Math.random() * this.ne) | 0; if (this.eg[j] === gi && !this.edead[j] && this.ed[j] < bd) { bd = this.ed[j]; bj = j; } }
      if (bj < 0) { for (let j = 0; j < this.ne; j++) if (this.eg[j] === gi && !this.edead[j]) { bj = j; break; } }
      if (bj < 0) break;
      this.killE(bj, Math.random() < 0.3 ? "fling" : "pop"); rm--; this.kills++;
    }
    this.compactE();
    g.lb.set(Math.max(0, Math.ceil(g.count)));
    this.hud.count(Math.round(this.count));
    if (this.t - this.sndT > 0.07) { this.sndT = this.t; play(["hit", "hit2", "bone"][(Math.random() * 3) | 0], { vol: 0.55, gap: 0.05 }); }
    if (this.t - this.hapT > 0.1) { this.hapT = this.t; T.haptic("impact", mode === 2 ? "medium" : "light"); this.eng.shake(mode === 2 ? 0.2 : 0.08); }
    const cxp = (this.cx + g.x) / 2;
    if (Math.random() < 0.5) this.parts.sparks(cxp + (Math.random() - 0.5) * 3, 0.7, -(this.d + 1.2), 3);
    if (Math.random() < 0.15) this.parts.dust(cxp + (Math.random() - 0.5) * 3, -(this.d + 1.2), 3, 0.5);
    if (g.count <= 0.5) this.groupDone(g);
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
  updateCannon(dt) {
    const c = this.cannon; if (!c) return;
    const p = c.pad;
    if (this.phase === "run" && this.d > p.d0 && this.d < p.d1 + 1.5 && Math.abs(this.cx - p.x) < p.hw + 0.6 && this.count > 1) {
      // заряжаем: бойцы прыгают в пушку
      c.acc = (c.acc || 0) + (5 + this.count * 0.11) * dt;
      while (c.acc >= 1 && this.count > 1) {
        c.acc -= 1;
        const rp = this.repP(), i = (Math.random() * this.np) | 0;
        const P = this.P;
        if (this.np > 0) { this.debris.add(P.x[i], 0.4, -this.ud[i], (c.pad.x - P.x[i]) * 0.9, 7, -(p.d1 + 1.5 - this.ud[i]) * 1.2, this.look.color, Math.PI); this.dead[i] = 2; this.compact(); }
        this.count -= rp; c.ammo += rp; this.fed += rp;
      }
      c.lb.set(Math.round(c.ammo * RUN_CFG.cannonK)); if (Math.random() < 0.3) c.lb.pop();
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
    c.lb.set(Math.round(c.ammo * RUN_CFG.cannonK));
    const sx = c.cm.position.x + (c.lc || 0), sd = c.wd + 1.6;
    let tx = 0, td = this.final.bd || this.final.d;
    if (this.final.grp && !this.final.grp.done) {
      const gi = this.groups.indexOf(this.final.grp); let j = (Math.random() * this.ne) | 0;
      for (let s = 0; s < 10 && this.eg[j] !== gi; s++) j = (Math.random() * this.ne) | 0;
      if (this.eg[j] === gi) { tx = this.E.x[j]; td = this.ed[j]; }
    }
    const T0 = 0.75 + Math.random() * 0.2;
    this.shots.push({ tx, td, t: T0, pow: take * RUN_CFG.cannonK });
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
      if (F.grp && !F.grp.done) { F.grp.count -= s.pow; this.kills += s.pow; this.attritionVisual(F.grp); if (F.grp.count <= 0.5) this.groupDone(F.grp); }
      else if (F.hp != null) { F.hp -= s.pow; }
    }
    if (this.cannon) this.cannon.cm.userData.barrel.position.z = lerp(this.cannon.cm.userData.barrel.position.z, 0, 0.2);
  }
  attritionVisual(g) {
    const gi = this.groups.indexOf(g), want = Math.ceil(Math.max(0, g.count) / g.rep);
    let alive = 0; for (let j = 0; j < this.ne; j++) if (this.eg[j] === gi && !this.edead[j]) alive++;
    for (let rm = alive - want; rm > 0; rm--) { let j = (Math.random() * this.ne) | 0; for (let s = 0; s < 20 && (this.eg[j] !== gi || this.edead[j]); s++) j = (Math.random() * this.ne) | 0; if (this.eg[j] === gi && !this.edead[j]) this.killE(j, "fling"); }
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
    const cp = this.count;
    const rate = (6 + 0.35 * Math.min(cp, F.hp)) * dt;
    F.hp -= rate * this.atk;
    F.pend += rate / this.hpm;
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
      let n = F.pend; F.pend = 0;
      const rp = this.repP(); let killed = 0;
      while (n >= rp && this.np > 0) { n -= rp; let bi = -1, bd = -1e9; for (let s = 0; s < 6; s++) { const i = (Math.random() * this.np) | 0; if (!this.dead[i] && this.ud[i] > bd) { bd = this.ud[i]; bi = i; } } if (bi < 0) break; this.killP(bi, "fling", (Math.random() - 0.5) * 14, 9 + Math.random() * 6); killed++; }
      F.pend += n;
      if (killed) this.compact();
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
    let n = F.pend; const rp = this.repP(); let killed = 0;
    while (n >= rp && this.np > 0) { n -= rp; let bi = -1, bd = -1e9; for (let s = 0; s < 6; s++) { const i = (Math.random() * this.np) | 0; if (!this.dead[i] && this.ud[i] > bd) { bd = this.ud[i]; bi = i; } } if (bi < 0) break; this.killP(bi, Math.random() < 0.3 ? "fling" : "pop", (Math.random() - 0.5) * 6, 3); killed++; }
    F.pend = n; if (killed) { this.compact(); this.hud.count(Math.round(this.count)); }
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
      const need = this.stepCost[i];
      if (this.count + 0.01 < need) { this.finishStairs(); return 0; }
      this.stair = i; this.mult = i + 1;
      this.count -= need;
      // ставим бойцов на ступеньку
      let show = Math.min(Math.ceil(need / this.repP()), this.np, 60);
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
      this.hud.float("×" + (i + 1), "gold");
      this.parts.burst(0, 0.55 * (i + 1) + 0.5, -(this.stairsD + i * 2 + 1), 14, new THREE.Color().setHSL(i / 10 * 0.8, 0.8, 0.6).getHex(), 6, 0.15, 6, 12);
      this.hud.count(Math.round(this.count));
      if (i === 9) { this.mult = 10; this.topT = this.t + 0.5; }
    }
    if (this.topT && this.t > this.topT) { this.topT = 0; this.finishStairs(); return 0; }
    return i >= 10 ? 0 : RUN_CFG.speed * 0.6;
  }
  finishStairs() {
    if (this.phase === "done") return;
    this.mult = Math.max(1, this.mult);
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
  autoSteer() {
    if (this.phase !== "run") return;
    const hw = this.roadAt(this.d + 4).hw, R0 = SPC * Math.sqrt(Math.max(1, this.np)) + 0.25;
    const side = (this.autoSide = this.autoSide || (Math.random() < 0.5 ? -1 : 1));
    let target = this.cx, best = 1e9;
    const consider = (dist, x) => { if (dist > -2 && dist < best) { best = dist; target = x; } };
    // ворота: лучшая створка
    const g = this.items.find((it) => it.panels && !it.used && it.d > this.d - 1 && it.d - this.d < 30 && (!it.lc || Math.sign(it.lc) === side));
    if (g) { let bk = -1, bv = -1; g.panels.forEach((p, k) => { const v = applyGate(Math.round(this.count), p.v); if (v > bv) { bv = v; bk = k; } }); consider(g.d - this.d + 6, (g.lc || 0) + (g.off || 0) + (-g.tot / 2 + g.W * (bk + 0.5))); }
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
    this.lbl.set(Math.max(0, Math.round(this.count)));
    this.lbl.on = this.np > 0 && this.phase !== "done";
    this.updateCamera(dt);
    this.labels.update(this.eng.W, this.eng.H);
    if (this.phase === "run" || this.phase === "battle") this.hud.progress(Math.min(1, this.d / this.len));
    if (this.def.tm) this.hud.timer(Math.ceil(this.timeLeft));
  }
}
