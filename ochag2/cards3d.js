// «Хутор» — карты на столе: объёмные карты одним InstancedMesh (лица из атласа), фигурки на стопках, значки, полоски работы, арены боёв.
import * as THREE from "three";
import { CARDS, FAM, CW, CH, STACK_DY } from "./data.js";
import * as S from "./sim.js";
import { CELL, cellOf, AW, AH, CELLW, CELLH, COLS, UI } from "./atlas.js";
import { KIT, FigPool } from "./kit.js";

const U = (v) => v / CW;
const CD = CH / CW;                  // глубина карты в единицах мира
const TH = 0.026;                    // толщина карты
const LIFT = 0.62;                   // высота поднятой карты

// какая фигурка стоит на карте
const MINI = {
  tree: "tree", rock: "rock", bush: "bush", appletree: "appletree", grass: "grass", claypit: "claypit", mushpatch: "mushpatch", hive: "hive", willow: "willow",
  shoal: "shoal", vein: "vein", crystalvein: "crystalvein", deadtree: "deadtree",
  forest: "forest", cave: "cave", shore: "shore", pass: "pass", ruins: "ruins", barrow: "barrow",
  hut: "hut", campfire: "campfire", field: "field", shed: "shed", granary: "granary", sawmill: "sawmill", quarry: "quarry", smithy: "smithy", kitchen: "kitchen",
  palisade: "palisade", tower: "tower", fair: "fair", boat: "boat", trail: "trail", darkpath: "darkpath",
  villager: "villager", spearman: "spearman", warrior: "warrior", knight: "knight", archer: "archer", builder: "builder", farmer: "farmer", explorer: "explorer",
  wolf: "wolf", boar: "boar", tusker: "boar", bat: "bat", spider: "spider", frog: "frog", raider: "raider", chief: "chief", skeleton: "skeleton", wraith: "wraith", troll: "troll", warden: "warden", boss: "boss",
  pk_forest: "chest", pk_stone: "chest", pk_farm: "chest", pk_craft: "chest", pk_defense: "chest", pk_explore: "chest",
  coin: "coins", wood: "lumber", stone: "stonepile",
};
const MSCALE = { tusker: 1.35, troll: 1.25, boss: 1.6, warden: 1.15, chief: 1.08, bat: 0.85, coin: 0.85, wood: 0.8, stone: 0.75 };
const ENEMY_TINT = { raider: "#6a1f24", chief: "#3a1418", troll: "#7f9a7a", wraith: "#9fd8ff" };
// свечение ночью: [сила света, размер ореола, сдвиг x, высота]
const GLOWS = { campfire: [1, 1.3, 0, 0.25], hut: [0.45, 0.8, 0.1, 0.35], kitchen: [0.7, 0.9, 0, 0.4], smithy: [0.8, 1.0, -0.1, 0.35], tower: [0.4, 0.7, 0, 1.1], granary: [0.4, 0.8, 0, 0.45], fair: [0.5, 1.0, 0, 0.3], sawmill: [0.3, 0.7, 0, 0.4], crystalvein: [0.5, 0.8, 0, 0.3] };
const SWAY = { tree: 1, appletree: 1, willow: 1, deadtree: 0.6, bush: 0.6, grass: 1.2, forest: 0.4 };

function cardGeometry() {
  const w = 1, h = CD, r = 0.09;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: TH, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 4 });
  // UV по положению: верхняя грань — лицо, бока — край лица (цвет рамки)
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = Math.min(0.995, Math.max(0.005, x / w + 0.5)), v = Math.min(0.995, Math.max(0.005, (h / 2 - y) / h));
    uv.setXY(i, u, v);
  }
  g.rotateX(-Math.PI / 2);                       // лицо смотрит вверх, верх карты — на север (−Z)
  g.translate(0, -TH - 0.006, 0);                // верхняя грань на y = 0
  g.computeVertexNormals();
  return g;
}

class QuadPool {
  constructor(scene, tex, cap, opt) {
    opt = opt || {};
    const g = new THREE.PlaneGeometry(1, 1);
    this.uvr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.uvr.setUsage(THREE.DynamicDrawUsage);
    this.al = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.al.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aUvr", this.uvr); g.setAttribute("aAl", this.al);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthTest: opt.depthTest !== false });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 aUvr; attribute float aAl; varying float vAl;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = aUvr.xy + vec2(uv.x, 1.0 - uv.y) * aUvr.zw; vAl = aAl;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vAl;").replace("#include <opaque_fragment>", "diffuseColor.a *= vAl;\n#include <opaque_fragment>");
    };
    m.customProgramCacheKey = () => "quad" + (opt.add ? "a" : "n");
    this.mesh = new THREE.InstancedMesh(g, m, cap); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = opt.order || 5; this.cap = cap; this.n = 0;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.sv = new THREE.Vector3(); this.pv = new THREE.Vector3(); this.c = new THREE.Color();
  }
  begin() { this.n = 0; }
  // tilt: наклон к камере (рад) — 0 лежит плоско
  push(X, Y, Z, w, h, uvr, col, a, tilt, rot) {
    if (this.n >= this.cap) this.grow();
    const i = this.n++;
    this.e.set(-Math.PI / 2 + (tilt || 0), 0, rot || 0, "XYZ"); this.q.setFromEuler(this.e);
    this.sv.set(w, h, 1); this.pv.set(X, Y, Z); this.m.compose(this.pv, this.q, this.sv);
    this.mesh.setMatrixAt(i, this.m);
    this.uvr.array.set(uvr, i * 4); this.al.array[i] = a == null ? 1 : a;
    this.c.set(col == null ? 0xffffff : col); this.mesh.instanceColor.setXYZ(i, this.c.r, this.c.g, this.c.b);
  }
  // пул кончился — удваиваем (раньше лишнее молча не рисовалось)
  grow() {
    const cap = this.cap * 2, old = this.mesh, g = old.geometry;
    const u = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); u.array.set(this.uvr.array); u.setUsage(THREE.DynamicDrawUsage);
    const a = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); a.array.set(this.al.array); a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aUvr", u); g.setAttribute("aAl", a); this.uvr = u; this.al = a;
    const m = new THREE.InstancedMesh(g, old.material, cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceMatrix.array.set(old.instanceMatrix.array);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.array.set(old.instanceColor.array); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.renderOrder = old.renderOrder;
    old.parent.add(m); old.parent.remove(old); old.dispose();
    this.mesh = m; this.cap = cap;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.uvr.needsUpdate = true; this.al.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
}

export class Cards3D {
  constructor(scene, atlasTex, uiTex, opt) {
    this.scene = scene; this.opt = opt || {};
    this.cap = 400;
    const g = cardGeometry();
    this.cell = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 2), 2); this.cell.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aCell", this.cell);
    const m = new THREE.MeshLambertMaterial({ map: atlasTex });
    const cw = CELLW / AW, ch = CELLH / AH;
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aCell;")
        .replace("#include <uv_vertex>", `#include <uv_vertex>\nvMapUv = aCell + uv * vec2(${cw.toFixed(6)}, ${ch.toFixed(6)});`);
    };
    m.customProgramCacheKey = () => "card1";
    this.mesh = new THREE.InstancedMesh(g, m, this.cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3).fill(1), 3); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.quads = new QuadPool(scene, uiTex, 900, { order: 6 });
    this.glow = new QuadPool(scene, uiTex, 300, { add: true, order: 7 });
    this.ground = new QuadPool(scene, uiTex, 200, { order: 1 });
    this.figs = {};
    this.disp = new Map();            // id → {x, y, h, born, flash, atk, tilt}
    this.order = new Map(); this.oc = 1;
    this.time = 0;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.sv = new THREE.Vector3(); this.pv = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0); this.col = new THREE.Color();
    this.lights = [];
    this.fam = FAM.map((f) => new THREE.Color(f.c));
    this.enemyCol = {}; for (const k in ENEMY_TINT) this.enemyCol[k] = new THREE.Color(ENEMY_TINT[k]);
  }
  // карт стало больше, чем мест в меше: расширяем. Иначе последние по порядку (только что тронутые!) карты не рисовались
  growCards(need) {
    let cap = this.cap; while (cap < need) cap *= 2;
    if (cap === this.cap) return;
    const old = this.mesh, g = old.geometry;
    const c = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2); c.array.set(this.cell.array); c.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aCell", c); this.cell = c;
    const m = new THREE.InstancedMesh(g, old.material, cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = old.castShadow; m.receiveShadow = old.receiveShadow; m.frustumCulled = false; m.renderOrder = old.renderOrder;
    old.parent.add(m); old.parent.remove(old); old.dispose();
    this.mesh = m; this.cap = cap;
  }
  fig(name) { if (!this.figs[name]) { if (!KIT[name]) return null; this.figs[name] = new FigPool(this.scene, name, 16); } return this.figs[name]; }
  bump(id) { this.order.set(id, this.oc++); }
  ev(e) {
    const d = (id) => this.disp.get(id);
    if (e.t === "pop" && e.id) { const q = this.dget(e.id); q.born = 0; if (e.fx != null) { q.x = e.fx; q.y = e.fy; q.h = 0.4; } this.bump(e.id); }
    else if (e.t === "hit") { const a = d(e.a), b = d(e.b); if (a) a.atk = 0.32; if (b) b.flash = 0.3; }
    else if (e.t === "stack" || e.t === "drop" || e.t === "bounce") this.bump(e.id);
    else if (e.t === "buy") { this.bump(e.id); const q = this.dget(e.id); q.born = 0; }
    else if (e.t === "open") { this.opening = { x: e.x, y: e.y, t: 0 }; }
  }
  dget(id) { let q = this.disp.get(id); if (!q) { q = { x: 0, y: 0, h: 0, born: 1, flash: 0, atk: 0, tilt: 0, vx: 0, init: 0 }; this.disp.set(id, q); } return q; }
  /* ---------- кадр: из состояния игры в инстансы ----------
     local: {drag: {id, ids:Set, x, y}} — что тащит этот игрок (рисуем без сглаживания)
     hi: {target, me, sell} */
  update(dt, G, me, local, hi, camPitch) {
    this.time += dt;
    const T = this.time;
    const k = 1 - Math.exp(-dt * 13);
    const roots = [];
    let nAll = 0;
    for (const id in G.cards) { nAll++; const c = G.cards[id]; if (!c.dn) roots.push(c); }
    if (nAll > this.cap) { try { window.O2LOG && window.O2LOG.add("рисование: карт " + nAll + " > мест " + this.cap + " — расширяю"); } catch (_) {} this.growCards(nAll + 64); }
    this.frame = (this.frame || 0) + 1;
    roots.sort((a, b) => (this.order.get(a.id) || 0) - (this.order.get(b.id) || 0));
    // стопки для рисования: то, что тащит этот игрок, отделяем от стопки сразу (у гостя — до ответа хозяина)
    const ldrag = local && local.drag;
    const stacks = [];
    let dragStack = null;
    for (const r of roots) {
      const cs = S.chain(G, r);
      if (ldrag) { const i = cs.findIndex((c) => ldrag.ids.has(c.id)); if (i >= 0) { if (i > 0) stacks.push(cs.slice(0, i)); dragStack = cs.slice(i); continue; } }
      stacks.push(cs);
    }
    if (dragStack) stacks.push(dragStack);
    let ci = 0;
    const cell = this.cell.array, icol = this.mesh.instanceColor.array;
    this.quads.begin(); this.glow.begin(); this.ground.begin();
    for (const p in this.figs) this.figs[p].begin();
    this.lights.length = 0;
    const seen = new Set();
    const m = this.m, q = this.q, sv = this.sv, pv = this.pv;
    let ri = 0;
    for (const cs of stacks) {
      const r = cs[0];
      ri++;
      const mineDrag = !!(ldrag && ldrag.ids.has(r.id));
      const dragged = (!!r.drag && !(ldrag && ldrag.settle && mineDrag)) || (mineDrag && !ldrag.settle);
      const enemy = S.isEnemy(r.k);
      const inFight = !!r.cb;
      const yBase = 0.0015 * (ri % 60);
      let prevDisp = null;
      for (let j = 0; j < cs.length; j++) {
        const c = cs[j];
        seen.add(c.id);
        const q0 = this.dget(c.id);
        // целевая позиция
        let tx = c.x, ty = c.y, th = dragged ? 1 : 0;
        if (mineDrag) { tx = ldrag.x; ty = ldrag.y + (j ? (prevDisp ? 0 : 0) : 0); }
        if (mineDrag && j > 0) { ty = ldrag.y + this.stackOff(cs, j); }
        if (!q0.init) { q0.x = tx; q0.y = ty; q0.h = th; q0.init = 1; }
        if (mineDrag) { q0.vx = (tx - q0.x) / Math.max(dt, 0.001); q0.x = tx; q0.y = ty; q0.h += (th - q0.h) * Math.min(1, dt * 18); }
        else { const kk = c.drag ? 1 - Math.exp(-dt * 9) : k; q0.vx = q0.vx * 0.8 + ((tx - q0.x) * kk / Math.max(dt, 0.001)) * 0.2; q0.x += (tx - q0.x) * kk; q0.y += (ty - q0.y) * kk; q0.h += (th - q0.h) * Math.min(1, dt * 12); }
        q0.born = Math.min(1, q0.born + dt * 3.2); q0.flash = Math.max(0, q0.flash - dt); q0.atk = Math.max(0, q0.atk - dt);
        q0.tilt += ((dragged ? Math.max(-0.4, Math.min(0.4, -q0.vx / 1400)) : 0) - q0.tilt) * Math.min(1, dt * 8);
        prevDisp = q0;
        if (ci >= this.cap) break;
        const X = U(q0.x), Z = U(q0.y) + CD / 2;
        const lift = q0.h * LIFT;
        const Y = 0.004 + yBase + j * (TH + 0.008) + lift + (enemy ? 0.01 : 0);
        const pop = q0.born < 1 ? 0.35 + 0.65 * easeBack(q0.born) : 1;
        q.setFromAxisAngle(this.up, 0); sv.set(pop, 1, pop); pv.set(X, Y, Z);
        if (q0.tilt) { const e = new THREE.Euler(0, 0, q0.tilt * 0.4); q.setFromEuler(e); }
        m.compose(pv, q, sv);
        this.mesh.setMatrixAt(ci, m);
        const cidx = cellOf(c.k, c.o);
        cell[ci * 2] = (cidx % COLS) * CELLW / AW; cell[ci * 2 + 1] = Math.floor(cidx / COLS) * CELLH / AH;
        let br = 1 + (this.night || 0) * 0.5;
        if (hi && hi.target && hi.target === r.id) br = 1.18;
        if (c.drag && c.drag !== me + 1) br = 0.92;
        icol[ci * 3] = br; icol[ci * 3 + 1] = br; icol[ci * 3 + 2] = br;
        if (enemy) { icol[ci * 3 + 1] = br * 0.93; icol[ci * 3 + 2] = br * 0.9; }
        // монеты — в цвет кошелька (семьи-хозяина)
        else if (c.k === "coin" && !G.solo) { const fc = this.fam[S.coinOf(c)]; icol[ci * 3] = br * (0.6 + 0.4 * fc.r); icol[ci * 3 + 1] = br * (0.6 + 0.4 * fc.g); icol[ci * 3 + 2] = br * (0.6 + 0.4 * fc.b); }
        ci++;
        c._dx = q0.x; c._dy = q0.y; c._Y = Y; c._f = this.frame;
        // фигурки: верхняя карта — целиком; нижние «якоря» (природа/постройки/жители) — поменьше, в своей полоске
        const top = j === cs.length - 1;
        const kind = CARDS[c.k].c;
        if (MINI[c.k] && (top || ((kind === "nature" || kind === "place" || kind === "build" || kind === "person") && j < 3))) {
          this.mini(c, q0, X, Y, Z, top ? 1 : 0.62, top ? 0 : (STACK_DY / CW) * 0.5 - CD / 2 + 0.04, r, dragged, G, T);
        }
      }
      // значки и полоски поверх верхней карты
      const topc = cs[cs.length - 1], tq = this.disp.get(topc.id);
      if (!tq) continue;
      const TX = U(tq.x), TZ = U(tq.y) + CD / 2, TY = topc._Y + 0.002;
      this.badges(G, topc, r, cs, TX, TY, TZ);
      // прогресс работы
      if (r.rc && r.rT) {
        const rq = this.disp.get(r.id);
        const p = Math.min(1, (r.rt || 0) / r.rT);
        const bx = U(rq.x), bz = U(rq.y) - 0.16, by = r._Y + 0.08 + rq.h * LIFT;
        const bw = 0.86, bh = 0.13, tilt = camPitch * 0.8;
        this.quads.push(bx, by, bz, bw + 0.06, bh + 0.06, UI.bar, 0x2b1d14, 0.85, tilt);
        const rec = S.RECIPE_BY_ID[r.rc];
        const fc = rec && rec.pair ? 0x7ee0ee : rec && rec.stage ? 0xffb347 : 0xf6c945;
        if (p > 0.01) this.quads.push(bx - bw / 2 + bw * p / 2, by + 0.001, bz - 0.0005, bw * p, bh, UI.bar, fc, 1, tilt);
        if (rec && rec.pair) this.quads.push(bx - bw / 2 - 0.12, by + 0.002, bz, 0.24, 0.24, UI.icon.pair, 0xffffff, 1, tilt);
      } else if (r.ms) {
        // общий рецепт ждёт жителя второй семьи
        const rq = this.disp.get(r.id);
        const bob = Math.sin(T * 4) * 0.04;
        const want = this.whoMissing(G, cs);
        this.quads.push(U(rq.x), r._Y + 0.35 + bob, U(rq.y) - 0.2, 0.42, 0.42, UI.icon.pair, want != null ? FAM[want].c : 0xffffff, 0.95, camPitch);
        this.glow.push(U(rq.x), r._Y + 0.3, U(rq.y) - 0.2, 0.9, 0.9, UI.soft, want != null ? FAM[want].c : 0xffffff, 0.35 + 0.15 * Math.sin(T * 4), camPitch);
      }
      // подсветка цели при перетаскивании
      if (hi && hi.target === r.id) {
        const rq = this.disp.get(r.id), h = S.stackH(G, r) / CW;
        this.glow.push(U(rq.x), r._Y + 0.01, U(rq.y) + h / 2, 1.28, h + 0.3, UI.frame, hi.bad ? 0xff5040 : FAM[me].c, 0.95, 0);
      }
      // тень-свечение под картой, которую тащит напарник
      if (r.drag && r.drag !== me + 1) {
        const rq = this.disp.get(r.id);
        this.ground.push(U(rq.x), 0.02, U(rq.y) + CD / 2, 1.5, 1.8, UI.soft, FAM[r.drag - 1].c, 0.7, 0);
      }
    }
    // бои: красная арена под участниками
    for (const id in G.fights) {
      const f = G.fights[id];
      const w = U(f.w || 300) + 0.3, h = U(f.h || 260) * 1.25;
      this.ground.push(U(f.x), 0.012, U(f.y) + 0.1, w * 1.15, h, UI.soft, 0xff4030, 0.55, 0);
      this.ground.push(U(f.x), 0.014, U(f.y) + 0.1, w * 0.9, 0.04, UI.bar, 0xffd0c0, 0.5, 0);
      if (f.both === 0 && f.foes.some((i) => G.cards[i] && CARDS[G.cards[i].k].pair)) {
        const want = f.allies.some((i) => G.cards[i] && G.cards[i].o === 0) ? 1 : 0;
        this.quads.push(U(f.x) + w / 2 - 0.1, 0.9 + Math.sin(T * 5) * 0.05, U(f.y) - 0.6, 0.45, 0.45, UI.icon.pair, FAM[want].c, 1, camPitch);
      }
    }
    // забытые позиции
    if (this.disp.size > seen.size + 50) for (const id of this.disp.keys()) if (!seen.has(+id)) this.disp.delete(id);
    this.mesh.count = ci;
    this.mesh.instanceMatrix.needsUpdate = true; this.cell.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
    for (const p in this.figs) this.figs[p].end();
    this.quads.end(); this.glow.end(); this.ground.end();
  }
  stackOff(cs, j) { let o = 0; for (let i = 1; i <= j; i++) o += cs[i - 1].k === "coin" && cs[i].k === "coin" ? (i < 10 ? 5 : 0) : STACK_DY; return o; }
  whoMissing(G, cs) { let f0 = 0, f1 = 0; for (const c of cs) if (S.isW(c.k)) { if (c.o === 0) f0++; else f1++; } return !f0 ? 0 : !f1 ? 1 : null; }
  mini(c, q0, X, Y, Z, scl, dz, r, dragged, G, T) {
    const name = MINI[c.k]; const P = this.fig(name); if (!P) return;
    const d = CARDS[c.k];
    let s = scl * (MSCALE[c.k] || 1) * (q0.born < 1 ? easeBack(q0.born) : 1);
    const enemy = d.c === "enemy", person = d.c === "person";
    let frame = 0, yaw = 0, bob = 0, lean = 0;
    const ph = (c.id * 1.7) % 6.28;
    if (person) {
      const working = r.rc && !r.drag;
      if (working && r !== c) frame = 0.5 + 0.5 * Math.sin(T * 7 + ph);
      else frame = 0;
      if (q0.atk > 0) frame = 1;
      bob = working ? 0 : Math.sin(T * 2 + ph) * 0.008;
      yaw = enemy ? 0 : Math.sin(T * 0.3 + ph) * 0.25;
    } else if (enemy) {
      const moving = !c.cb;
      frame = moving ? 0.5 + 0.5 * Math.sin(T * 9 + ph) : 0.15 + 0.15 * Math.sin(T * 3 + ph);
      if (q0.atk > 0) frame = 1;
      if (c.k === "bat" || c.k === "boss") { frame = 0.5 + 0.5 * Math.sin(T * (c.k === "boss" ? 4 : 12) + ph); bob = 0.18 + Math.sin(T * 2 + ph) * 0.06; }
      yaw = c.fx === -1 ? -0.6 : c.fx === 1 ? 0.6 : 0;
    } else if (SWAY[c.k]) { lean = Math.sin(T * 1.3 + X * 0.7) * 0.045 * SWAY[c.k]; }
    else if (d.c === "pack") { frame = 0; }
    if (dragged) { lean += q0.tilt * 1.2; }
    this.q.setFromEuler(new THREE.Euler(lean * 0.6, yaw, lean, "YXZ"));
    this.sv.setScalar(s);
    const zo = dz || (person || enemy ? 0.3 : 0.2);
    this.pv.set(X, Y + bob, Z + zo);
    this.m.compose(this.pv, this.q, this.sv);
    let team = 0, col = null;
    if (person) { team = 1; col = this.fam[c.o || 0]; }
    else if (enemy && this.enemyCol[c.k]) { team = c.k === "troll" || c.k === "wraith" ? -1 : 1; col = this.enemyCol[c.k]; }
    else if (c.k === "tusker") { team = -1; col = this.col.setRGB(0.55, 0.42, 0.34); }
    const glow = c.k === "wraith" ? 0.35 : c.k === "crystalvein" ? 0.25 + 0.1 * Math.sin(T * 2) : 0;
    P.push(this.m, frame, team, q0.flash > 0 ? q0.flash * 3 : 0, glow, col || this.col.setRGB(1, 1, 1));
    // источники света ночью: огонь, окна домов
    const LG = GLOWS[c.k];
    if (LG && scl === 1) {
      this.lights.push({ X, Y: Y + 0.5, Z: Z + 0.1, k: LG[0] });
      const n = this.night || 0;
      if (n > 0.05) {
        const fl = 0.85 + Math.sin(T * 9 + X) * 0.08 + Math.sin(T * 23 + Z) * 0.07;
        this.glow.push(X + LG[2], Y + LG[3], Z + 0.15, LG[1], LG[1], UI.soft, c.k === "crystalvein" ? 0x7ee8ff : 0xffa850, n * 0.55 * fl, 0);
        this.ground.push(X, 0.02, Z + 0.3, LG[1] * 2.6, LG[1] * 2.6, UI.soft, 0xffb060, n * 0.35 * fl, 0);
      }
    }
  }
  badges(G, topc, r, cs, X, Y, Z) {
    const d = CARDS[topc.k];
    const bx = X + 0.3, bz = Z + CD / 2 - 0.2;
    const num = (n, x, z, s, col) => {
      const str = String(Math.max(0, Math.min(999, n | 0)));
      const w = s * 0.62;
      for (let i = 0; i < str.length; i++) this.quads.push(x + (i - (str.length - 1) / 2) * w, Y + 0.004, z, w * 1.05, s * 1.15, UI.digit[+str[i]], col || 0xffffff, 1, 0);
    };
    if (topc.k === "coin") {
      const n = cs.filter((c) => c.k === "coin").length;
      const bg = G.solo ? 0x2b1d14 : parseInt(FAM[S.coinOf(topc)].d.slice(1), 16);
      if (n > 1) { this.quads.push(X, Y + 0.003, Z + 0.33, 0.62, 0.3, UI.bar, bg, 0.9, 0); this.quads.push(X - 0.17, Y + 0.004, Z + 0.33, 0.18, 0.18, UI.icon.x, 0xffffff, 1, 0); num(n, X + 0.07, Z + 0.33, 0.2); }
      return;
    }
    const isP = d.c === "person" || d.c === "enemy";
    if (isP && topc.hp != null) {
      const mx = topc.mhp || S.maxHp(G, topc);
      if (topc.hp < mx || topc.cb) {
        const p = Math.max(0, topc.hp / mx);
        this.quads.push(X, Y + 0.003, Z - CD / 2 + 0.06, 0.84, 0.11, UI.bar, 0x2b1d14, 0.85, 0);
        this.quads.push(X - 0.4 + 0.4 * p, Y + 0.004, Z - CD / 2 + 0.06, 0.8 * p, 0.08, UI.bar, d.c === "enemy" ? 0xff5a4a : 0x6fdc5a, 1, 0);
      }
      return;
    }
    if (topc.u != null && (d.c === "nature" || d.c === "place")) {
      this.quads.push(bx, Y + 0.003, bz, 0.42, 0.24, UI.bar, 0x2b1d14, 0.75, 0);
      this.quads.push(bx - 0.1, Y + 0.004, bz, 0.17, 0.17, UI.icon.pick, 0xffffff, 1, 0);
      num(topc.u, bx + 0.08, bz, 0.17);
    }
    if (d.c === "food" && topc.f != null && topc.f < d.f) { this.quads.push(X - 0.3, Y + 0.004, bz, 0.26, 0.26, UI.icon.food, 0xffffff, 1, 0); num(topc.f, X - 0.12, bz, 0.17, 0xffd0c0); }
  }
}
function easeBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
export { U, CD, TH, LIFT, MINI };
