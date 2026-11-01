// «Осада цитадели»: общая крепость в горном ущелье. Игроки строят стены, ворота, башни на стенах, камнемёты и котёл смолы,
// а ночью по насыпи к воротам идёт огромная орда слабых врагов с тараном и лестницами.
// Орда — это сотни лёгких юнитов: поле потока (flow field) по сетке ущелья, отрисовка инстансами с вершинной анимацией
// (два «запечённых» кадра шага) и LOD, в сеть — сжатые пакеты позиций (4 байта на юнита) несколько раз в секунду.
import * as THREE from "three";
import { SimplifyModifier } from "three/addons/modifiers/SimplifyModifier.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import * as D from "./data.js";
import { A, makeChar, makeQ, cloneWorld, cloneProp, cloneWeapon, cloneNature, pbr, has } from "./assets.js";
import { buildTowerDeep, bake, BM, builderMats } from "./builders.js";
import { terrainMaterial, makeWeather, makeBanner, rng, noise2, NS } from "./world.js";

// ---------- геометрия крепости ----------
export const WZ = -10, WT = 1.2, WH = 2.6;            // линия стены, полутолщина, высота боевого хода
export const NSEG = 11, SEGW = 3, X0 = -16.5, GATE = 5;
export const KZ = 13;                                  // цитадель (донжон)
export const SLOTS = [1, 3, 4, 6, 7, 9];              // места под башни на стене (номер пролёта)
const SPAWN_Z = -66, ZMIN = -84, ZMAX = 30, XMIN = -26, XMAX = 26;
export const segX = (i) => X0 + SEGW * (i + 0.5);
export const segOf = (x) => Math.max(0, Math.min(NSEG - 1, Math.floor((x - X0) / SEGW)));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k, dist = (a, b, c, d) => Math.hypot(a - c, b - d);
// полуширина ущелья: внутри крепости — 16.5 м, снаружи расширяется к лагерю врага, за цитаделью — скалы смыкаются
export function halfW(z) {
  if (z >= WZ - 1.3) return z > 22 ? Math.max(4, 16.5 - (z - 22) * 1.6) : 16.5;
  return Math.min(23, 16.5 + (WZ - 1.3 - z) * 0.14);
}

// ---------- уровни построек ----------
export const WALL = [null,
  { name: "Частокол", hp: 520, icon: "🪵" },
  { name: "Каменная стена", hp: 1600, icon: "🧱", cost: { c: 20, s: 45 } },
  { name: "Стена с зубцами", hp: 2800, icon: "🏯", cost: { c: 45, s: 85 } },
  { name: "Крепостная стена", hp: 4500, icon: "🏰", cost: { c: 90, w: 20, s: 140 } }];
export const GATE_LV = [null,
  { name: "Деревянные ворота", hp: 1800 },
  { name: "Окованные ворота", hp: 3500, cost: { c: 40, w: 40, s: 30 } },
  { name: "Стальная решётка", hp: 6000, cost: { c: 95, s: 95 } }];
const OIL_COST = [null, { c: 60, s: 20 }, { c: 120, s: 40 }], ROCK_COST = [null, { c: 30, s: 35 }, { c: 70, s: 70 }];
const REP_COST = { w: 10, s: 15 }, FIX_COST = { w: 30, s: 30 }, GATE_FIX = { w: 50, s: 30 };
const SG_TOWERS = ["arrow", "cannon", "frost", "fire", "minaret", "ballista"];

// ---------- орда ----------
export const HZ = {
  hz_skel:   { name: "Скелет", fam: "undead", src: "sk_minion", wpn: "Skeleton_Blade", clip: "Walking_D_Skeletons", scale: 0.6, hp: 16, spd: 1.9, dmg: 5, hdmg: 1.6, rate: 1.0, range: 1.0, r: 0.34, coin: 0.45, xp: 0.6, snd: "bone" },
  hz_rat:    { name: "Крыса", fam: "beasts", src: "m_rat", q: true, h: 0.5, clip: "Rat_Run", hp: 7, spd: 3.3, dmg: 3, hdmg: 0.8, rate: 1.4, range: 0.9, r: 0.28, coin: 0.25, xp: 0.3, snd: "squeak" },
  hz_brute:  { name: "Костолом", fam: "undead", src: "sk_warrior", wpn: "Skeleton_Axe", clip: "Walking_A", scale: 0.82, hp: 70, spd: 1.35, dmg: 12, hdmg: 7, rate: 0.7, range: 1.4, r: 0.55, coin: 3, xp: 3, snd: "bone", tint: [1.05, 0.86, 0.8] },
  hz_archer: { name: "Лучник", fam: "undead", src: "sk_rogue", wpn: "crossbow_1handed", clip: "Walking_D_Skeletons", scale: 0.62, hp: 14, spd: 1.7, dmg: 6, hdmg: 1.2, rate: 0.45, range: 9.5, ranged: "arrow", r: 0.36, coin: 1, xp: 1, snd: "bone", tint: [0.85, 0.95, 1.1] },
  hz_ladder: { name: "Лестничник", fam: "undead", src: "sk_minion", clip: "Walking_D_Skeletons", scale: 0.62, hp: 22, spd: 1.6, dmg: 5, hdmg: 1.6, rate: 1.0, range: 1.0, r: 0.36, coin: 1, xp: 1, snd: "bone", tint: [1.1, 1.0, 0.8] },
  ram:       { name: "Таран", fam: "siege", hp: 520, spd: 0.8, dmg: 0, hdmg: 95, rate: 1 / 2.4, range: 1.5, r: 1.35, coin: 25, xp: 20, snd: "wood", big: true }
};
export const HZ_T = Object.keys(HZ);
for (const k of HZ_T) D.MON[k] = Object.assign({ cost: 1, model: HZ[k].src || "sk_minion" }, HZ[k]);
D.LOC.siege = { id: "siege", name: "Осада цитадели", icon: "🏰", waves: 7, diff: 1, fam: [], bosses: {}, mid: {}, mods: {}, house: "medieval", music: "snow", water: "none", weather: "rain", night: true,
  ground: { base: "mud", alt: "darkrock", path: "gravel", plaza: "stone", tint: [0.92, 0.95, 1.0], tintAlt: [0.9, 0.92, 1.0] },
  sky: { day: 0x1c2740, night: 0x0e1424, fog: 0x1a2236, sun: 0x9fb4e0, sunNight: 0x8aa2d8, hemi: [0x6a7fae, 0x24221c] } };
export const MODELS = ["merchant", "sk_minion", "sk_warrior", "sk_rogue", "m_rat"];
export const wavesFor = (slv) => Math.min(10, 6 + slv);

let api = null;                     // доступ к игре (ставит game.js)
export function bind(a) { api = a; }
const G = () => api.G;

// ================= МИР УЩЕЛЬЯ =================
let world = null, W = null, views = null;
const hgt = { f: null };
export function buildSiegeWorld(wroot, renderer, seed) {
  world = wroot; const r = rng(seed || 7), L = D.LOC.siege;
  W = { L, obstacles: [], water: [], nodes: [], fxPoints: [], resInst: {}, lakes: [], lakeD: () => 99, lights: [], inst: [], siege: true };
  // рельеф: дно ущелья, отвесные скалы по бокам, насыпь к воротам, двор цитадели
  const GW = XMAX - XMIN + 30, GD = ZMAX - ZMIN + 30, sx = 96, sz = 132;
  const geo = new THREE.PlaneGeometry(GW, GD, sx, sz); geo.rotateX(-Math.PI / 2); geo.translate((XMAX + XMIN) / 2, 0, (ZMAX + ZMIN) / 2);
  const pos = geo.attributes.position, sp = new Float32Array(pos.count * 4);
  const fb = (x, z) => noise2(x, z) * 0.6 + noise2(x * 2.1 + 7, z * 2.1) * 0.3 + noise2(x * 4.3, z * 4.3 + 3) * 0.1;
  const cliffY = (x, z) => { const e = Math.abs(x) - halfW(z); const eb = z - 26; let y = 0; if (e > 0) y = Math.min(24, Math.pow(e, 1.3) * 1.5) * (0.65 + 0.7 * fb(x * 0.08, z * 0.08)); if (eb > 0) y = Math.max(y, Math.min(24, Math.pow(eb, 1.3) * 1.6) * (0.7 + 0.6 * fb(x * 0.07 + 3, z * 0.07))); return y; };
  hgt.f = cliffY;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = cliffY(x, z);
    const e = Math.abs(x) - halfW(z);
    let alt = clamp((e + 1.2) / 2.5, 0, 1), path = 0, plaza = 0;
    alt = Math.max(alt, clamp((z - 25) / 3, 0, 1));
    if (z < WZ - 1) path = clamp(1 - (Math.abs(x + Math.sin(z * 0.09) * 1.2) - 2.6) / 1.4, 0, 1) * (0.75 + 0.25 * noise2(x * 1.3, z * 1.3));   // насыпь-дорога к воротам
    if (z > WZ + 1 && z < KZ) path = Math.max(path, clamp(1 - (Math.abs(x) - 1.8) / 1.2, 0, 1) * 0.8);                                         // дорога от ворот к донжону
    plaza = clamp(1 - (dist(x, z, 0, KZ) - 7.5 - (noise2(x * 0.8, z * 0.8) - 0.5) * 2) / 1.2, 0, 1);
    if (z > WZ - 2.5 && z < WZ + 4.5 && Math.abs(x) < 17) plaza = Math.max(plaza, 0.55 * clamp(1 - Math.abs(z - WZ - 1) / 3.5, 0, 1));
    const yy = y + (y === 0 ? (fb(x * 0.15, z * 0.15) - 0.5) * 0.12 : 0);
    pos.setY(i, yy);
    const s = alt + path + plaza; if (s > 1) { alt /= s; path /= s; plaza /= s; }
    sp[i * 4] = alt; sp[i * 4 + 1] = path; sp[i * 4 + 2] = plaza; sp[i * 4 + 3] = fb(x * 0.09 + 3, z * 0.09);
  }
  geo.setAttribute("splat", new THREE.BufferAttribute(sp, 4)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, terrainMaterial(L.ground)); ground.receiveShadow = true; world.add(ground); W.ground = ground;
  // скалы, ели и сухие деревья на склонах — инстансами
  const inst = {}; const put = (n, x, y, z, s, ry) => (inst[n] = inst[n] || []).push({ x, y, z, s, ry: ry == null ? r() * 6.28 : ry });
  for (let i = 0; i < 170; i++) {
    const z = ZMIN + 6 + r() * (ZMAX - ZMIN - 2), side = r() < 0.5 ? -1 : 1, hw = halfW(z), e = 0.3 + Math.pow(r(), 1.6) * 12, x = side * (hw + e);
    const y = cliffY(x, z);
    if (e < 3.2) put("Rock_Medium_" + (1 + Math.floor(r() * 3)), x, y - 0.3, z, 1.4 + r() * 2.2);
    else put(r() < 0.75 ? (r() < 0.5 ? "Pine_2" : "Pine_3") : "DeadTree_1", x, y - 0.2, z, 0.7 + r() * 0.6);
  }
  for (let i = 0; i < 40; i++) { const x = (r() - 0.5) * 30, z = 27 + r() * 8; put(r() < 0.6 ? "Pine_3" : "Rock_Medium_2", x, cliffY(x, z) - 0.2, z, 0.9 + r() * 0.8); }
  // валуны на поле перед стеной — укрытия для орды и разнообразие маршрута
  for (let i = 0; i < 16; i++) { const z = SPAWN_Z + 8 + r() * (WZ - 12 - SPAWN_Z - 8), hw = halfW(z), x = (r() < 0.5 ? -1 : 1) * (4.5 + r() * (hw - 6)); put("Rock_Medium_" + (1 + Math.floor(r() * 3)), x, 0, z, 0.9 + r() * 0.7); W.obstacles.push({ x, z, r: 1.0, out: true }); }
  for (let i = 0; i < 60; i++) { const z = ZMIN + 10 + r() * (ZMAX - ZMIN - 14), x = (r() - 0.5) * 2 * (halfW(z) - 0.8); if (Math.abs(x) < 3.5 && z < WZ) continue; if (z > WZ - 2 && z < WZ + 4) continue; put(r() < 0.5 ? "Grass_Common_Short" : "Pebble_Round_1", x, 0, z, 0.8 + r() * 0.6); }
  for (const [name, list] of Object.entries(inst)) {
    const src = A.nature[name]; if (!src) continue; src.updateMatrixWorld(true);
    src.traverse((o) => { if (!o.isMesh) return; const im = new THREE.InstancedMesh(o.geometry, o.material, list.length); im.castShadow = /Rock_Medium/.test(name) && list.some((it) => Math.abs(it.x) < halfW(it.z) + 1); im.receiveShadow = true;
      const mm = new THREE.Matrix4(), local = o.matrixWorld.clone(), sc = /Pine|Dead/.test(name) ? 0.6 : /Rock_Medium/.test(name) ? 0.55 : /Grass/.test(name) ? 0.35 : 1.2;
      list.forEach((it, i) => { mm.compose(new THREE.Vector3(it.x, it.y, it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it.ry, 0)), new THREE.Vector3(1, 1, 1).multiplyScalar(it.s * sc)); im.setMatrixAt(i, mm.multiply(local)); });
      world.add(im); W.inst.push(im); });
  }
  // ресурсы внутри крепости: деревья у скал и камни во дворе — добыча как обычно
  const mk = (kind, x, z) => { const model = kind === "tree" ? ["CommonTree_1", "CommonTree_3", "Pine_2"][Math.floor(r() * 3)] : "Rock_Medium_" + (1 + Math.floor(r() * 3)), sc = (kind === "tree" ? 0.95 + r() * 0.3 : 0.95 + r() * 0.3) * NS(model); return { kind, x, z, amt: D.RES[kind].amount, regrow: 0, model, ry: r() * 6.28, s: sc, r: kind === "tree" ? 0.4 : 0.42 * 3.2 * sc }; };
  const nodeOk = (x, z) => W.nodes.every((n) => dist(n.x, n.z, x, z) > 2.4) && dist(x, z, 0, KZ) > 8 && Math.abs(x) > 4;
  for (let t = 0, n = 0; n < 16 && t < 800; t++) { const z = WZ + 5 + r() * (KZ + 9 - WZ - 5), side = r() < 0.5 ? -1 : 1, x = side * (11.5 + r() * 3.5); if (nodeOk(x, z)) { W.nodes.push(mk("tree", x, z)); n++; } }
  for (let t = 0, n = 0; n < 9 && t < 800; t++) { const z = WZ + 6 + r() * 16, x = (r() < 0.5 ? -1 : 1) * (5 + r() * 8); if (nodeOk(x, z) && Math.abs(x) < 12) { W.nodes.push(mk("rock", x, z)); n++; } }
  // дома ремесленников вдоль ущелья (препятствия, «живая» крепость)
  const houses = [["building_barracks_blue", -9, KZ - 3, 1.6, 0.6], ["building_blacksmith_blue", 9.5, KZ - 4, 1.5, -0.7], ["building_home_A_blue", -12.5, WZ + 9, 1.4, 1.2], ["building_home_B_blue", 12.8, WZ + 10, 1.4, -1.3], ["building_well_blue", 4.5, KZ - 9, 1.2, 0], ["building_market_blue", -6, WZ + 13.5, 1.3, 0.3]];
  for (const [n, x, z, s, ry] of houses) { const o = cloneWorld(n); o.position.set(x, 0, z); o.scale.setScalar(s); o.rotation.y = ry; o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); world.add(o); W.obstacles.push({ x, z, r: 1.5 * s }); }
  // лагерь врага в глубине ущелья: шатры, костры, тёмные знамёна
  for (let i = 0; i < 9; i++) { const z = ZMIN + 4 + r() * 10, x = (r() - 0.5) * 2 * (halfW(z) - 4); const t = cloneWorld("tent"); t.position.set(x, 0, z); t.scale.setScalar(1.7 + r() * 0.5); t.rotation.y = r() * 6.28; t.traverse((c) => { if (c.isMesh) { c.material = c.material.clone(); c.material.color.multiplyScalar(0.45); } }); world.add(t); }
  for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 7, z = ZMIN + 12 + r() * 3; W.fxPoints.push({ k: "campfire", x, z }); const b = makeBanner("#3a1020"); b.position.set(x + 1.5, 0, z + 1); b.scale.setScalar(1.3); world.add(b); }
  // факелы вдоль насыпи и у ворот
  for (let z = WZ - 7; z > SPAWN_Z + 6; z -= 9) for (const s of [-1, 1]) { const t = cloneProp("Torch_Metal"); t.position.set(s * 3.6, 0, z); t.scale.setScalar(1.4); world.add(t); W.fxPoints.push({ k: "torch", x: s * 3.6, z, y: 1.75 }); }
  // свет: тёплые факелы у ворот и донжона (немного — на телефоне каждый свет дорог)
  for (const [x, y, z, c, i] of [[0, 4.2, WZ - 2.4, 0xff9a4a, 9], [0, 3.5, KZ - 6, 0xffb066, 7], [-9, 3.2, WZ + 3, 0xff9a4a, 5]]) { const l = new THREE.PointLight(c, i, 14, 1.6); l.position.set(x, y, z); world.add(l); W.lights.push(l); }
  // дождь
  W.weather = makeWeather(world, "rain", 1.35);
  views = { seg: [], gate: null, slot: [], ladders: new Map(), rams: new Map(), oil: null };
  return W;
}
export const terrainY = (x, z) => (hgt.f ? hgt.f(x, z) : 0);

// ================= СОСТОЯНИЕ КРЕПОСТИ =================
// sg: пролёты стены (уровень, прочность, пролом, камнемёт), ворота (уровень, прочность, выбиты, котёл смолы), башни на стене, лестницы
export function newState(cfg, np) {
  const hk = 0.8 + 0.25 * np;
  const s = { slv: cfg.slv || 1, np, hk, seg: [], gate: { lv: 1, hp: GATE_LV[1].hp * hk, max: GATE_LV[1].hp * hk, br: 0, oil: 0, oilCd: 0 }, slot: SLOTS.map(() => null), lad: [], lid: 1, left: 0, plan: null, killed: 0, keepMin: 1, breaches: 0, fieldT: 0, fieldDirty: true, spawnT: 0, ramAt: [], ladLeft: 0, hitT: {} };
  for (let i = 0; i < NSEG; i++) s.seg.push(i === GATE ? null : { lv: 1, hp: WALL[1].hp * hk, max: WALL[1].hp * hk, br: 0, rock: 0, rcd: 1 });
  return s;
}
const intact = (sg, i) => (i === GATE ? !sg.gate.br : !sg.seg[i].br);
// высота поверхности для героев и врагов: боевой ход стены, насыпь за стеной (вал), иначе земля
export function heightAt(x, z) {
  const sg = G().sg; if (!sg) return 0;
  if (Math.abs(x) > 16.5) return 0;
  const i = segOf(x);
  if (z >= WZ - WT && z <= WZ + WT) return intact(sg, i) ? WH : 0;
  if (z > WZ + WT && z < WZ + WT + 2.2 && i !== GATE) return WH * (1 - (z - WZ - WT) / 2.2);
  return 0;
}
export const onWall = (x, z) => z >= WZ - WT - 0.2 && z <= WZ + WT + 0.4 && heightAt(x, z) > WH * 0.8;
// герой: внутри ущелья, наружу — только через пролом или выбитые ворота
export function clampHero(o, r) {
  const sg = G().sg;
  const hw = halfW(o.z) - 0.6 - r; if (o.x > hw) o.x = hw; if (o.x < -hw) o.x = -hw;
  if (o.z > 25.5) o.z = 25.5;
  if (o.z < SPAWN_Z + 4) o.z = SPAWN_Z + 4;
  if (o.z < WZ - WT + 0.15 && o.z > WZ - WT - 1.4) { const i = segOf(o.x); if (intact(sg, i) && Math.abs(o.x) < 16.6) o.z = WZ - WT + 0.15; }
  for (const ob of W.obstacles) { const d = dist(o.x, o.z, ob.x, ob.z), rr = ob.r + r; if (d < rr && d > 1e-4) { o.x = ob.x + (o.x - ob.x) / d * rr; o.z = ob.z + (o.z - ob.z) / d * rr; } }
  // башни на стене не мешают ходить по стене, но в них не входишь
  for (let k = 0; k < SLOTS.length; k++) if (sg.slot[k]) { const tx = segX(SLOTS[k]), d = dist(o.x, o.z, tx, WZ), rr = 0.75 + r; if (d < rr && d > 1e-4) { o.x = tx + (o.x - tx) / d * rr; o.z = WZ + (o.z - WZ) / d * rr; } }
}

// ================= ПОЛЕ ПОТОКА =================
// сетка 1 м по ущелью; цель — кольцо у донжона. Целая стена/ворота проходимы «дорого» (их надо ломать): цена растёт с прочностью,
// поэтому орда сама ищет слабое место — пролом, выбитые ворота или самый хлипкий пролёт.
const GX = XMAX - XMIN, GZ = ZMAX - ZMIN, GN = GX * GZ;
let fDist = new Float32Array(GN), fDx = new Float32Array(GN), fDz = new Float32Array(GN), fBlock = new Uint8Array(GN), fSeg = new Int8Array(GN);
const ci = (x, z) => { const i = Math.floor(x - XMIN), j = Math.floor(z - ZMIN); return i < 0 || j < 0 || i >= GX || j >= GZ ? -1 : i + j * GX; };
const cxx = (k) => (k % GX) + XMIN + 0.5, czz = (k) => Math.floor(k / GX) + ZMIN + 0.5;
function buildField() {
  const sg = G().sg, keep = G().houses[0]; sg.fieldDirty = false;
  fBlock.fill(0); fSeg.fill(-1);
  for (let k = 0; k < GN; k++) {
    const x = cxx(k), z = czz(k);
    if (Math.abs(x) > halfW(z) - 0.4 || z > 25) { fBlock[k] = 1; continue; }
    if (z > WZ - WT - 0.1 && z < WZ + WT + 0.1 && Math.abs(x) < 16.5) fSeg[k] = segOf(x);
  }
  for (const ob of W.obstacles) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const k = ci(ob.x + dx, ob.z + dz); if (k >= 0 && dist(cxx(k), czz(k), ob.x, ob.z) < ob.r * 0.8) fBlock[k] = 1; }
  // цена клетки стены: «сколько метров обхода стоит её проломить»
  const segCost = new Float32Array(NSEG);
  for (let i = 0; i < NSEG; i++) { if (i === GATE) segCost[i] = sg.gate.br ? 0 : 6 + sg.gate.hp / 70; else segCost[i] = sg.seg[i].br ? 0 : 10 + sg.seg[i].hp / 55; }
  // Дейкстра с бинарной кучей
  fDist.fill(1e9);
  const heap = new Int32Array(GN * 4), hv = new Float32Array(GN * 4); let hn = 0;
  const push = (k, v) => { let i = hn++; heap[i] = k; hv[i] = v; while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= hv[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const k = heap[0]; hn--; heap[0] = heap[hn]; hv[0] = hv[hn]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hn && hv[l] < hv[m]) m = l; if (r < hn && hv[r] < hv[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } return k; };
  const R = (keep && keep.alive ? (keep.whp > 0 ? D.WALL_R : D.HOUSE_R + 0.8) : 2) + 1.2;
  for (let k = 0; k < GN; k++) if (!fBlock[k] && dist(cxx(k), czz(k), keep ? keep.x : 0, keep ? keep.z : KZ) <= R) { fDist[k] = 0; push(k, 0); }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (hn) {
    const k = pop(), dk = fDist[k], i = k % GX, j = (k / GX) | 0;
    for (const [di, dj, c] of nb) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GX || nj >= GZ) continue;
      const nk = ni + nj * GX; if (fBlock[nk]) continue;
      if (di && dj && (fBlock[i + di + j * GX] || fBlock[i + (j + dj) * GX])) continue;
      const sgi = fSeg[nk]; const nd = dk + c * (sgi >= 0 ? 1 + segCost[sgi] / 2.4 : 1);
      if (nd < fDist[nk] - 0.001) { fDist[nk] = nd; push(nk, nd); }
    }
  }
  for (let k = 0; k < GN; k++) {
    fDx[k] = fDz[k] = 0; if (fDist[k] >= 1e9) continue;
    const i = k % GX, j = (k / GX) | 0; let best = fDist[k], bx = 0, bz = 0;
    for (const [di, dj] of nb) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GX || nj >= GZ) continue; const nk = ni + nj * GX; if (fDist[nk] < best) { best = fDist[nk]; bx = di; bz = dj; } }
    const l = Math.hypot(bx, bz) || 1; fDx[k] = bx / l; fDz[k] = bz / l;
  }
}
export const fieldInfo = () => ({ dist: fDist, dx: fDx, dz: fDz, GX, GZ, XMIN, ZMIN });

// ================= ВОЛНЫ (НОЧИ) =================
export function planWave(w, np, heroLvl) {
  const sg = G().sg, slv = sg.slv;
  const n = Math.round((34 + 21 * w + 2.4 * w * w) * (0.72 + 0.28 * np) * (1.15 + 0.22 * (slv - 1)));
  sg.left = n; sg.total = n; sg.spawnT = 2.5;
  sg.hpMul = (1 + 0.1 * (w - 1)) * (1 + 0.28 * (slv - 1)) * (1 + 0.12 * (np - 1)) * (1 + 0.012 * Math.max(0, heroLvl - 1));
  sg.dmgMul = (1 + 0.08 * (w - 1)) * (1 + 0.15 * (slv - 1));
  sg.ladLeft = w >= 2 ? Math.round(1 + w * 0.7 + np) : 0;
  sg.ramAt = w >= 3 ? (w >= 6 ? [0.3, 0.65] : [0.45]).map((k) => Math.round(n * (1 - k))) : [];
  sg.wave = w;
}
// новый хозяин (прежний вышел): дополняем то, что гость не знал, — и орда продолжает идти
export function adoptHost(w, np, heroLvl) {
  const g = G(), sg = g.sg; if (!sg) return;
  // очередь ночи (сколько ещё выйдет, тараны, лестницы, множители) пришла в снимке — продолжаем с того же места
  const keep = { left: sg.left, lad: sg.ladLeft, rams: (sg.ramAt || []).slice(), hm: sg.hpMul, dm: sg.dmgMul, tot: sg.total };
  planWave(Math.max(1, w), np, heroLvl);
  sg.left = g.ph === "wave" ? keep.left : 0; sg.ladLeft = keep.lad || 0; sg.ramAt = keep.rams; if (keep.hm) sg.hpMul = keep.hm; if (keep.dm) sg.dmgMul = keep.dm; if (keep.tot) sg.total = keep.tot; sg.spawnT = 1; sg.fieldDirty = true;
  for (const e of g.enemies.values()) if (e.hz) {
    const M = HZ[e.type]; e.cd = Math.random(); e.lc = Math.random(); e.slowT = e.slowT || 0; e.burnT = 0; e.poisonT = 0; e.dmgBy = e.dmgBy || {}; e.r = M.r; e.lane = e.x;
    if (e.type === "hz_ladder" && e.st !== 2 && e.st !== 3) { const s0 = segOf(e.x); e.lseg = s0 === GATE ? s0 - 1 : s0; e.lx = segX(e.lseg); e.st = 5; }
    if (e.st === 2) { const L = nearestLadder(e.x); if (L) { e.lad = L.id; e.ct = e.ct || 0; } else e.st = 0; }
  }
}
const CAP = () => (window.__sgCap || 420);
function pickType(w) {
  const r = Math.random(), sg = G().sg;
  if (sg.ladLeft > 0 && r < 0.08) { sg.ladLeft--; return "hz_ladder"; }
  if (w >= 3 && r < 0.14) { let n = 0; for (const e of G().enemies.values()) if (e.type === "hz_archer") n++; if (n < 24) return "hz_archer"; }
  if (w >= 2 && r < 0.14 + Math.min(0.14, 0.05 + 0.012 * w)) return "hz_brute";
  if (r < 0.48) return "hz_rat";
  return "hz_skel";
}
function spawnUnit(type, x, z) {
  const g = G(), sg = g.sg, M = HZ[type], hp = M.hp * sg.hpMul * (type === "ram" ? 1 + 0.25 * (sg.np - 1) : 1);
  const e = { id: g.eid++, type, hz: 1, x, z, ry: 0, hp, max: hp, r: M.r, lane: (Math.random() - 0.5) * 2 * (halfW(z) - 3), st: type === "hz_ladder" ? 5 : 0, cd: Math.random(), spawnT: 0, slowT: 0, burnT: 0, poisonT: 0, el: 0, dmgBy: {}, ab: {}, ph: Math.random() * 6.28, ram: type === "ram" ? 1 : 0, lc: Math.random() };
  if (type === "hz_ladder") { const opts = []; for (let i = 0; i < NSEG; i++) if (i !== GATE && !sg.seg[i].br) opts.push(i); const s0 = opts.length ? opts[Math.floor(Math.random() * opts.length)] : 2; e.lseg = s0; e.lx = segX(s0) + (Math.random() - 0.5) * 1.6; }
  g.enemies.set(e.id, e);
  return e;
}
// ================= ХОД ХОЗЯИНА =================
const hgrid = new Map();
export function hostStep(dt, wave) {
  const g = G(), sg = g.sg; if (!sg) return;
  sg.fieldT -= dt; if (sg.fieldDirty || sg.fieldT <= 0) { sg.fieldT = 2.5; buildField(); }
  const keep = g.houses[0];
  if (keep && keep.alive) sg.keepMin = Math.min(sg.keepMin, keep.hp / keep.max);
  // подход орды: пачками из лагеря, не больше предела живых
  if (wave && sg.left > 0) {
    sg.spawnT -= dt;
    let alive = 0; for (const e of g.enemies.values()) if (e.hz) alive++;
    if (sg.spawnT <= 0 && alive < CAP()) {
      const k = Math.min(sg.left, 4 + Math.floor(Math.random() * 7), CAP() - alive);
      const cx = (Math.random() - 0.5) * 2 * (halfW(SPAWN_Z) - 3);
      for (let i = 0; i < k; i++) { spawnUnit(pickType(sg.wave), cx + (Math.random() - 0.5) * 4, SPAWN_Z - Math.random() * 4); sg.left--; }
      if (sg.ramAt.length && sg.left <= sg.ramAt[0]) { sg.ramAt.shift(); spawnUnit("ram", (Math.random() - 0.5) * 2, SPAWN_Z - 2); api.emit(["Sq"]); }
      sg.spawnT = (0.55 + Math.random() * 0.7) / Math.sqrt(Math.max(1, sg.np * 0.7));
    }
  }
  // сетка для расталкивания
  hgrid.clear();
  for (const e of g.enemies.values()) { if (!e.hz || e.st === 2) continue; const key = Math.floor(e.x / 1.2) * 4096 + Math.floor(e.z / 1.2); let c = hgrid.get(key); if (!c) hgrid.set(key, (c = [])); c.push(e); }
  const players = g.players.filter((p) => p.alive && p.present);
  for (const e of [...g.enemies.values()]) if (e.hz) unitStep(e, dt, sg, keep, players);
  // лестницы: защитники на стене рядом сталкивают их (вместе быстрее)
  for (const L of [...sg.lad]) {
    let n = 0, who = -1; for (const p of players) if (onWall(p.x, p.z) && Math.abs(p.x - L.x) < 1.9) { n++; who = p.idx; }
    if (n) { L.push += dt * (0.9 + 0.5 * (n - 1)); L.by = who; } else L.push = Math.max(0, L.push - dt * 0.6);
    if (L.push >= 1.1 || intactAt(L.x) === false) topple(L, who);
  }
  // камнемёты на стене: бьют по тем, кто у подножия
  for (let i = 0; i < NSEG; i++) {
    const s = sg.seg[i]; if (!s || !s.rock || s.br) continue;
    s.rcd -= dt; if (s.rcd > 0) continue;
    const x0 = segX(i); let best = null, bn = 0;
    for (const e of g.enemies.values()) { if (!e.hz || e.st === 2 || e.z < WZ - 4.5 || e.z > WZ - WT || Math.abs(e.x - x0) > 2.2) continue; let n = 0; for (const o of g.enemies.values()) if (o.hz && Math.abs(o.x - e.x) < 1.4 && Math.abs(o.z - e.z) < 1.4) n++; if (n > bn) { bn = n; best = e; } if (bn > 6) break; }
    if (!best) { s.rcd = 0.4; continue; }
    s.rcd = s.rock === 2 ? 1.8 : 2.6;
    const bx = best.x, bz = best.z;
    api.emit(["Sr", i, Math.round(bx * 10), Math.round(bz * 10)]);
    setTimeout(() => { if (!G().sg) return; for (const o of [...G().enemies.values()]) if (o.hz && dist(o.x, o.z, bx, bz) < 1.5 + o.r) api.hitEnemy(o.id, (s.rock === 2 ? 75 : 45) * (o.ram ? 2.5 : 1), -1, 0, 16); }, 380);
  }
  // башни на стене
  for (let k = 0; k < SLOTS.length; k++) {
    const t = sg.slot[k]; if (!t) continue; if (sg.seg[SLOTS[k]] && sg.seg[SLOTS[k]].br) continue;
    t.cd -= dt; if (t.cd > 0) continue;
    const TD = D.TURRETS[t.type], tx = segX(SLOTS[k]), rng = TD.range * 1.2 * (1 + 0.025 * (t.lv - 1));
    let best = null, bd = rng; for (const e of g.enemies.values()) { if (!e.hz || e.st === 2) continue; const d = dist(tx, WZ, e.x, e.z) - (e.z > WZ ? 3 : 0); if (d < bd) { bd = d; best = e; } }
    if (!best) { t.cd = 0.25; continue; }
    t.cd = 1 / TD.rate;
    const dmg = TD.dmg * D.turretMul(t.lv);
    if (TD.beh === "chain") {
      const ids = [best.id], hit = new Set(ids); let cur = best;
      for (let j = 0; j < TD.jumps + 1; j++) { let nb = null, nd = 4.5; for (const e of g.enemies.values()) { if (!e.hz || hit.has(e.id)) continue; const d = dist(e.x, e.z, cur.x, cur.z); if (d < nd) { nd = d; nb = e; } } if (!nb) break; ids.push(nb.id); hit.add(nb.id); cur = nb; }
      api.emit(["Sz", k, ...ids]); ids.forEach((id, j) => api.hitEnemy(id, dmg * Math.pow(0.85, j), -1, 0, 0));
    } else { api.emit(["St", k, best.id]); const sh = api.shots[api.shots.length - 1]; if (sh && sh.sgSlot === k) { sh.real = true; sh.dmg = dmg; sh.src = -1; } }
  }
  if (sg.gate.oilCd > 0) sg.gate.oilCd -= dt;
}
const intactAt = (x) => { const sg = G().sg; if (Math.abs(x) > 16.5) return true; return intact(sg, segOf(x)); };
function topple(L, who) {
  const g = G(), sg = g.sg;
  sg.lad = sg.lad.filter((q) => q !== L);
  api.emit(["Sl", L.id, who]);
  for (const e of [...g.enemies.values()]) if (e.hz && e.st === 2 && e.lad === L.id) api.hitEnemy(e.id, 1e6, who, 0, 16);
  api.dirty();
}
function nearestLadder(x) { let b = null, bd = 1.6; for (const L of G().sg.lad) { const d = Math.abs(L.x - x); if (d < bd) { bd = d; b = L; } } return b; }
export function damageStruct(i, dmg) {
  const g = G(), sg = g.sg;
  if (i === GATE) { const gt = sg.gate; if (gt.br) return; gt.hp -= dmg; if ((sg.hitT.g || 0) < g.t) { sg.hitT.g = g.t + 0.35; api.emit(["Sh", i]); } if (gt.hp <= 0) { gt.hp = 0; gt.br = 1; sg.fieldDirty = true; sg.breaches++; api.emit(["SB"]); api.dirty(); } return; }
  const s = sg.seg[i]; if (!s || s.br) return;
  s.hp -= dmg; if ((sg.hitT[i] || 0) < g.t) { sg.hitT[i] = g.t + 0.4; api.emit(["Sh", i]); }
  if (s.hp <= 0) { s.hp = 0; s.br = 1; sg.fieldDirty = true; sg.breaches++; api.emit(["Sb", i]); api.dirty(); for (const L of [...sg.lad]) if (segOf(L.x) === i) topple(L, -1); }
}
function unitStep(e, dt, sg, keep, players) {
  const M = HZ[e.type];
  if (e.burnT > 0) { e.burnT -= dt; e.hp -= (e.burnD || 0) * dt; if (e.hp <= 0) { api.killEnemy(e, e.burnBy ?? -1); return; } }
  if (e.poisonT > 0) { e.poisonT -= dt; e.hp -= (e.poisonD || 0) * dt; if (e.hp <= 0) { api.killEnemy(e, e.poisonBy ?? -1); return; } }
  e.slowT -= dt; e.cd -= dt;
  // «застрял» (толпа, угол скалы): 4 с почти на месте и не дерётся — шаг в сторону
  e.sT = (e.sT || 0) + dt; if (e.sT > 4) { if (!e.atk && dist(e.x, e.z, e.sx || 0, e.sz || 0) < 0.4 && e.st !== 2) { e.x += (Math.random() - 0.5) * 1.2; e.z += (Math.random() - 0.5) * 0.8 + 0.3; } e.sT = 0; e.sx = e.x; e.sz = e.z; }
  let spd = M.spd * (e.slowT > 0 ? 0.5 : 1);
  e.atk = 0;
  // лезет по лестнице
  if (e.st === 2) {
    const L = sg.lad.find((q) => q.id === e.lad); if (!L) { api.killEnemy(e, -1); return; }
    e.ct += dt / 2.9; e.x = L.x + (e.ph - 3) * 0.05; e.z = lerp(WZ - WT - 1.0, WZ - WT + 0.2, Math.min(1, e.ct));
    if (e.ct >= 1) { e.st = 3; e.z = WZ - 0.6; L.n = Math.max(0, (L.n || 1) - 1); }
    return;
  }
  // рядом герой — бьём его (снаружи и внутри)
  let tp = null, td = e.st === 3 ? 4.5 : 1.6;
  for (const p of players) { const d = dist(p.x, p.z, e.x, e.z); if (d < td && Math.abs(api.heroY(p) - unitY(e)) < 1.2) { td = d; tp = p; } }
  let mx = 0, mz = 0, want = 0;
  // лучники: встают на выстрел и бьют защитников на стене
  if (M.ranged && e.st !== 3) {
    let tgt = null, bd = M.range; for (const p of players) { const d = dist(p.x, p.z, e.x, e.z); if (d < bd) { bd = d; tgt = p; } }
    if (tgt) { e.ry = Math.atan2(tgt.x - e.x, tgt.z - e.z); e.atk = 1; if (e.cd <= 0) { e.cd = 1 / M.rate; api.enemyArrow(e, tgt); } sep(e); return; }
  }
  if (tp && td < M.range + 0.3) {
    e.atk = 1; e.ry = Math.atan2(tp.x - e.x, tp.z - e.z);
    if (e.cd <= 0) { e.cd = 1 / M.rate; api.setSrc(e.type); api.damagePlayer(tp, M.dmg * sg.dmgMul); }
    sep(e); return;
  }
  if (tp && e.st === 3) { mx = tp.x - e.x; mz = tp.z - e.z; want = 1; }
  // таран: по насыпи к воротам, бьёт их; ворота выбиты — к донжону
  else if (e.ram) {
    if (!sg.gate.br) {
      const gx = 0, gz = WZ - WT - 1.3, d = dist(e.x, e.z, gx, gz);
      if (d < 0.4) { e.atk = 1; e.ry = 0; if (e.cd <= 0) { e.cd = 2.4; damageStruct(GATE, M.hdmg * sg.dmgMul); api.emit(["Sm"]); } return; }
      mx = gx - e.x; mz = gz - e.z; want = 1;
    }
  }
  // лестничник: к своему пролёту, ставит лестницу
  else if (e.st === 5) {
    if (sg.seg[e.lseg] && sg.seg[e.lseg].br) e.st = 0;
    else {
      const gx = e.lx, gz = WZ - WT - 1.0, d = dist(e.x, e.z, gx, gz);
      if (d < 0.5) {
        let L = nearestLadder(gx);
        if (!L) { L = { id: sg.lid++, x: gx, push: 0, n: 0, by: -1 }; sg.lad.push(L); api.emit(["Sp", L.id, Math.round(gx * 10)]); api.dirty(); }
        e.st = 2; e.lad = L.id; e.ct = 0; L.n = (L.n || 0) + 1; return;
      }
      mx = gx - e.x; mz = gz - e.z; want = 1;
    }
  }
  if (!want) {
    // на боевом ходу — спускаемся внутрь
    if (e.st === 3 && e.z < WZ + WT + 0.3) { mx = 0; mz = 1; want = 1; }
    else {
      const k = ci(e.x, e.z);
      if (k >= 0 && fDist[k] < 1e9 && (fDx[k] || fDz[k])) { mx = fDx[k]; mz = fDz[k]; }
      // широким фронтом, а не двумя колоннами: вдали от стены каждый держится своей «полосы»
      if (e.st === 0 && e.lane != null && e.z < WZ - 7) { const k2 = clamp((WZ - 7 - e.z) / 18, 0, 1) * 0.12; mx += clamp(e.lane - e.x, -3, 3) * k2; }
      else if (keep) { mx = keep.x - e.x; mz = keep.z - e.z; }
      want = 1;
      // у донжона — бьём его
      if (keep && keep.alive) { const kr = (keep.whp > 0 ? D.WALL_R : D.HOUSE_R + 0.6) + e.r + 0.25; if (dist(e.x, e.z, keep.x, keep.z) < kr + 0.2) { e.atk = 1; e.ry = Math.atan2(keep.x - e.x, keep.z - e.z); if (e.cd <= 0) { e.cd = 1 / M.rate; api.setSrc(e.type); api.damageHouse(keep, (e.ram ? M.hdmg * 0.5 : M.hdmg * 1.2) * sg.dmgMul); } sep(e); return; } }
    }
  }
  const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
  let nx = e.x + mx * spd * dt, nz = e.z + mz * spd * dt;
  // упёрлись в целую стену/ворота — ломаем; рядом стоит лестница — лезем
  if (e.st !== 3 && nz > WZ - WT - 0.05 && e.z <= WZ - WT + 0.2 && Math.abs(nx) < 16.6) {
    const i = segOf(nx);
    if (intact(sg, i)) {
      nz = Math.min(nz, WZ - WT - 0.05);
      const L = i !== GATE ? nearestLadder(nx) : null;
      if (L && e.lc < 0.32 && (L.n || 0) < 2 && !e.ram) { e.st = 2; e.lad = L.id; e.ct = 0; L.n = (L.n || 0) + 1; return; }
      e.atk = 1; e.ry = Math.PI * 0 + 0;
      if (e.cd <= 0) { e.cd = 1 / M.rate; damageStruct(i, M.hdmg * sg.dmgMul); }
    }
  }
  const dr0 = Math.atan2(mx, mz) - e.ry; let dr = dr0; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; e.ry += dr * Math.min(1, dt * 7);
  e.x = nx; e.z = nz;
  sep(e);
  // стены ущелья
  const hw = halfW(e.z) - 0.4 - e.r; if (e.x > hw) e.x = hw; if (e.x < -hw) e.x = -hw;
  if (e.z > 25) e.z = 25;
  // целая стена непроходима (кроме тех, кто уже на ней)
  if (e.st !== 3 && e.z > WZ - WT - 0.05 && e.z < WZ + WT && Math.abs(e.x) < 16.6 && intact(sg, segOf(e.x))) e.z = WZ - WT - 0.05;
}
function sep(e) {
  if (e.ram) return;
  const gx = Math.floor(e.x / 1.2), gz = Math.floor(e.z / 1.2);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const c = hgrid.get((gx + i) * 4096 + gz + j); if (!c) continue;
    for (const o of c) { if (o === e) continue; const ox = e.x - o.x, oz = e.z - o.z, rr = e.r + o.r; if (Math.abs(ox) > rr || Math.abs(oz) > rr) continue; const od = Math.hypot(ox, oz); if (od < rr && od > 0.001) { const k = (rr - od) * (o.ram ? 1 : 0.45); e.x += ox / od * k; e.z += oz / od * k; } }
  }
  for (const ob of W.obstacles) { const d = dist(e.x, e.z, ob.x, ob.z), rr = ob.r + e.r; if (d < rr && d > 1e-4) { e.x = ob.x + (e.x - ob.x) / d * rr; e.z = ob.z + (e.z - ob.z) / d * rr; } }
}
export function unitY(e) { if (e.st === 2) return Math.min(1, e.ct || 0) * WH; return heightAt(e.x, e.z); }

// ================= ДЕЙСТВИЯ ИГРОКОВ =================
const canPay = (w, c) => (w.c >= (c.c || 0)) && (w.w >= (c.w || 0)) && (w.s >= (c.s || 0));
const pay = (w, c) => { for (const r of ["c", "w", "s"]) w[r] -= c[r] || 0; };
export function costOf(a) {
  const sg = G().sg;
  if (a.op === "seg") { const s = sg.seg[a.i]; return s && WALL[s.lv + 1] ? WALL[s.lv + 1].cost : null; }
  if (a.op === "rep") { const s = a.i === GATE ? sg.gate : sg.seg[a.i]; if (!s) return null; return s.br ? (a.i === GATE ? GATE_FIX : FIX_COST) : s.hp < s.max ? REP_COST : null; }
  if (a.op === "gate") return GATE_LV[sg.gate.lv + 1] ? GATE_LV[sg.gate.lv + 1].cost : null;
  if (a.op === "oil") return OIL_COST[sg.gate.oil + 1] || null;
  if (a.op === "rock") { const s = sg.seg[a.i]; return s && ROCK_COST[s.rock + 1] ? ROCK_COST[s.rock + 1] : null; }
  if (a.op === "tw") { if (sg.slot[a.i] || !D.TURRETS[a.t]) return null; return D.TURRETS[a.t].cost; }
  if (a.op === "twu") { const t = sg.slot[a.i]; return t && t.lv < D.TURRET_MAX ? D.upCost(D.TURRETS[t.type].cost, t.lv) : null; }
  return null;
}
export function doAct(pi, a) {
  const g = G(), sg = g.sg, p = g.players[pi]; if (!sg || !p || !p.alive) return false;
  if (a.op === "pour") {
    const gt = sg.gate; if (!gt.oil || gt.oilCd > 0 || gt.br || dist(p.x, p.z, 0, WZ) > 4.2 || !onWall(p.x, p.z)) return false;
    gt.oilCd = gt.oil === 2 ? 11 : 16;
    api.emit(["So", gt.oil, pi]);
    const dmg = (gt.oil === 2 ? 110 : 65) * (1 + 0.1 * (sg.wave || 1));
    for (const e of [...g.enemies.values()]) if (e.hz && Math.abs(e.x) < 3.6 && e.z > WZ - 7 && e.z < WZ - WT + 0.2) api.hitEnemy(e.id, dmg * (e.ram ? 3 : 1), pi, 0, 2 | 16);
    api.dirty(); return true;
  }
  const near = a.i == null ? true : a.op === "tw" || a.op === "twu" ? dist(p.x, p.z, segX(SLOTS[a.i]), WZ) < 5 : dist(p.x, p.z, segX(a.i), WZ) < 6;
  if (!near) return false;
  const c = costOf(a); if (!c || !canPay(p.wallet, c)) return false;
  pay(p.wallet, c);
  let what = "";
  if (a.op === "seg") { const s = sg.seg[a.i]; s.lv++; const mx = WALL[s.lv].hp * sg.hk; s.hp = mx; s.max = mx; s.br = 0; what = WALL[s.lv].name; }
  else if (a.op === "rep") { const s = a.i === GATE ? sg.gate : sg.seg[a.i]; if (s.br) { s.br = 0; s.hp = s.max * 0.5; what = a.i === GATE ? "поставил ворота заново" : "заделал пролом"; api.emit(["Sf", a.i]); } else { s.hp = Math.min(s.max, s.hp + s.max * 0.35); what = "починил стену"; } }
  else if (a.op === "gate") { const gt = sg.gate; gt.lv++; gt.max = GATE_LV[gt.lv].hp * sg.hk; gt.hp = gt.max; gt.br = 0; what = GATE_LV[gt.lv].name; }
  else if (a.op === "oil") { sg.gate.oil++; what = sg.gate.oil === 1 ? "поставил котёл смолы" : "усилил котёл смолы"; }
  else if (a.op === "rock") { sg.seg[a.i].rock++; sg.seg[a.i].rcd = 1; what = sg.seg[a.i].rock === 1 ? "поставил камнемёт" : "усилил камнемёт"; }
  else if (a.op === "tw") { sg.slot[a.i] = { type: a.t, lv: 1, cd: 0.5 }; what = "поставил " + D.TURRETS[a.t].name.toLowerCase(); }
  else if (a.op === "twu") { sg.slot[a.i].lv++; what = "улучшил " + D.TURRETS[sg.slot[a.i].type].name.toLowerCase(); }
  sg.fieldDirty = true;
  p.built++;
  api.emit(["Su", what, pi, a.op, a.i == null ? -1 : a.i]);
  api.dirty(); return true;
}
// что рядом с героем для кнопки «Строить»
export function nearStruct(p) {
  if (Math.abs(p.x) > 17 || p.z < WZ - 3.5 || p.z > WZ + 5) return null;
  const i = segOf(p.x); let slot = -1, bd = 3.2; SLOTS.forEach((s, k) => { const d = dist(p.x, p.z, segX(s), WZ); if (d < bd) { bd = d; slot = k; } });
  return { seg: i, slot, gate: Math.abs(p.x) < 4.5 };
}
export function panelHtml(p, esc, head) {
  const sg = G().sg, n = nearStruct(p); if (!n) return null;
  const item = (icon, title, sub, a, label) => { const c = costOf(a); if (!c) return ""; const can = canPay(p.wallet, c); return `<div class="it"><div class="ic">${icon}</div><div class="tx2"><b>${title}</b><span>${sub} · ${D.fmtCost(c)}</span></div><button ${can ? "" : "disabled"} data-a='${JSON.stringify(Object.assign({ k: "sg" }, a))}'>${label || "🔨 Построить"}</button></div>`; };
  const info = (icon, title, sub) => `<div class="it"><div class="ic">${icon}</div><div class="tx2"><b>${title}</b><span>${sub}</span></div></div>`;
  let h = head("🏰 Стена цитадели") + `<div class="wallet">У тебя: 🪙 ${p.wallet.c} · 🪵 ${p.wallet.w} · 🪨 ${p.wallet.s}</div>`;
  h += `<p class="hint">Строишь за свои ресурсы — стена общая. Камень и дерево добывай во дворе, монеты — за врагов.</p>`;
  if (n.gate) {
    const gt = sg.gate, GL = GATE_LV[gt.lv];
    h += `<div class="sec">Ворота</div>`;
    h += gt.br ? item("🚪", "Поставить ворота заново", "ворота выбиты — орда идёт во двор!", { op: "rep", i: GATE }, "🔨 Поставить") : info("🚪", GL.name, `прочность ${Math.ceil(gt.hp)} / ${Math.round(gt.max)}`);
    if (!gt.br && gt.hp < gt.max) h += item("🔧", "Починить ворота", "+35% прочности", { op: "rep", i: GATE }, "🔧 Чинить");
    if (GATE_LV[gt.lv + 1]) h += item("🛡️", GATE_LV[gt.lv + 1].name, `прочность ${Math.round(GATE_LV[gt.lv + 1].hp * sg.hk)}`, { op: "gate" });
    h += gt.oil ? info("🔥", gt.oil === 2 ? "Большой котёл смолы" : "Котёл смолы", "встань на ворота и нажми «🔥 Смола»") : "";
    if (gt.oil < 2) h += item("🔥", gt.oil ? "Большой котёл смолы" : "Котёл смолы над воротами", gt.oil ? "урон ×1.7, перезарядка 11 с" : "выливает кипящую смолу на тех, кто у ворот (таран — ×3)", { op: "oil" });
  }
  if (n.seg !== GATE) {
    const s = sg.seg[n.seg];
    h += `<div class="sec">Пролёт стены ${n.seg + 1}</div>`;
    h += s.br ? item("🧱", "Заделать пролом", "пока пролом открыт — орда идёт сюда", { op: "rep", i: n.seg }, "🔨 Заделать") : info(WALL[s.lv].icon, WALL[s.lv].name, `прочность ${Math.ceil(s.hp)} / ${Math.round(s.max)}`);
    if (!s.br && s.hp < s.max) h += item("🔧", "Починить пролёт", "+35% прочности", { op: "rep", i: n.seg }, "🔧 Чинить");
    if (!s.br && WALL[s.lv + 1]) h += item(WALL[s.lv + 1].icon, WALL[s.lv + 1].name, `прочность ${Math.round(WALL[s.lv + 1].hp * sg.hk)} — орда ищет места слабее`, { op: "seg", i: n.seg }, "⬆️ Улучшить");
    if (!s.br && s.rock < 2) h += item("🪨", s.rock ? "Тяжёлый камнемёт" : "Камнемёт", s.rock ? "чаще и больнее" : "сбрасывает камни на тех, кто ломает стену", { op: "rock", i: n.seg });
  }
  if (n.slot >= 0) {
    const t = sg.slot[n.slot];
    h += `<div class="sec">Башня на стене</div>`;
    if (!t) for (const k of SG_TOWERS) { const TD = D.TURRETS[k]; h += item(TD.icon, TD.name, TD.desc + " · со стены бьёт дальше", { op: "tw", i: n.slot, t: k }); }
    else { const TD = D.TURRETS[t.type]; h += t.lv < D.TURRET_MAX ? item(TD.icon, `${TD.name} → ур. ${t.lv + 1}`, `урон ${Math.round(TD.dmg * D.turretMul(t.lv))} → ${Math.round(TD.dmg * D.turretMul(t.lv + 1))}`, { op: "twu", i: n.slot }, "⬆️ Улучшить") : info(TD.icon, `${TD.name} · максимум`, ""); }
  }
  return h;
}
export const canPour = (p) => { const sg = G().sg; return sg && sg.gate.oil && !sg.gate.br && dist(p.x, p.z, 0, WZ) < 4.2 && onWall(p.x, p.z); };
export const ladderNear = (p) => { const sg = G().sg; if (!sg || !onWall(p.x, p.z)) return null; return sg.lad.find((L) => Math.abs(L.x - p.x) < 1.9) || null; };

// ================= СЕТЬ =================
// состояние крепости — строкой в полном снимке; орда — бинарный пакет (base64): id-дельта + 4 байта на юнита
export function stateStr() {
  const sg = G().sg; if (!sg) return "";
  const segs = sg.seg.map((s) => (s ? `${s.lv}.${Math.round(s.hp / s.max * 1000)}.${s.br}.${s.rock}` : "")).join(",");
  const gt = sg.gate, gs = `${gt.lv}.${Math.round(gt.hp / gt.max * 1000)}.${gt.br}.${gt.oil}.${Math.ceil(gt.oilCd * 10)}`;
  const sl = sg.slot.map((t) => (t ? t.type + ":" + t.lv : "")).join(",");
  const ld = sg.lad.map((L) => `${L.id}.${Math.round(L.x * 10)}.${Math.round(L.push * 10)}`).join(",");
  const cur = [sg.wave || 0, sg.total || 0, sg.ladLeft || 0, (sg.ramAt || []).join("_"), Math.round((sg.hpMul || 1) * 1000), Math.round((sg.dmgMul || 1) * 1000)].join(";");
  return [segs, gs, sl, ld, sg.left, sg.killed, sg.slv, sg.breaches, Math.round(sg.keepMin * 100), cur].join("|");
}
export function applyStateStr(str) {
  const sg = G().sg; if (!sg || !str) return;
  const [segs, gs, sl, ld, left, killed, slv, br, km, cur] = str.split("|");
  if (cur) { const [w, tot, lad, rams, hm, dm] = cur.split(";"); sg.wave = +w; sg.total = +tot; sg.ladLeft = +lad; sg.ramAt = rams ? rams.split("_").map(Number) : []; sg.hpMul = +hm / 1000; sg.dmgMul = +dm / 1000; }
  const chS = [];
  segs.split(",").forEach((x, i) => { if (!x || !sg.seg[i]) return; const [lv, hp, b, rock] = x.split(".").map(Number); const s = sg.seg[i]; if (s.lv !== lv || s.br !== b || s.rock !== rock) chS.push(i); s.lv = lv; s.max = WALL[lv].hp * sg.hk; s.hp = s.max * hp / 1000; s.br = b; s.rock = rock; });
  { const [lv, hp, b, oil, cd] = gs.split(".").map(Number), gt = sg.gate; const ch = gt.lv !== lv || gt.br !== b || gt.oil !== oil; gt.lv = lv; gt.max = GATE_LV[lv].hp * sg.hk; gt.hp = gt.max * hp / 1000; gt.br = b; gt.oil = oil; gt.oilCd = cd / 10; if (ch) chS.push(GATE); }
  const chT = []; sl.split(",").forEach((x, k) => { const old = sg.slot[k] ? sg.slot[k].type + ":" + sg.slot[k].lv : ""; if (old !== x) chT.push(k); sg.slot[k] = x ? { type: x.split(":")[0], lv: +x.split(":")[1], cd: 0 } : null; });
  const ids = new Set();
  (ld || "").split(",").filter(Boolean).forEach((x) => { const [id, x10, pu] = x.split(".").map(Number); ids.add(id); let L = sg.lad.find((q) => q.id === id); if (!L) { L = { id, x: x10 / 10, push: 0, n: 0 }; sg.lad.push(L); } L.push = pu / 10; });
  sg.lad = sg.lad.filter((L) => ids.has(L.id));
  sg.left = +left; sg.killed = +killed; sg.slv = +slv; sg.breaches = +br; sg.keepMin = +km / 100;
  chS.forEach(updSegView); chT.forEach(updSlotView);
}
// ---------- орда по сети ----------
// Хозяин, 8 раз в секунду: раз в секунду «ключевой кадр» (все юниты: id + 4 байта, по надёжному каналу), между ними — дельты
// к последнему ключевому кадру по быстрому каналу (3 байта на юнита: сдвиг x, z в 1/8 м и состояние). Потеря дельты не страшна.
// Гость: буфер снимков с отметкой времени хозяина, рисуем «прошлое» с задержкой ≈ 1.5 интервала + разброс; НИКОГДА не экстраполируем.
// Отображаемая точка не может пройти сквозь целую стену: её прижимает к той стороне, где юнит по последнему снимку хозяина.
export const HZ_RATE = 8, HZ_KEY_EVERY = 8;
const HK = { seq: 0, kSeq: 0, n: 0, ids: new Int32Array(1024), qx: new Int16Array(1024), qz: new Int16Array(1024), idx: new Map() };
let outBuf = new Uint8Array(8192);
const putB = (o, b) => { if (o >= outBuf.length) { const nb = new Uint8Array(outBuf.length * 2); nb.set(outBuf); outBuf = nb; } outBuf[o] = b; return o + 1; };
function b64(n) { let s = ""; for (let i = 0; i < n; i += 4096) s += String.fromCharCode.apply(null, outBuf.subarray(i, Math.min(n, i + 4096))); return btoa(s); }
const qX = (x) => clamp(Math.round((x - XMIN) * 8), 0, 511), qZ = (z) => clamp(Math.round((z - ZMIN) * 8), 0, 1023);
const stByte = (e) => { const hp = clamp(Math.ceil(e.hp / e.max * 15), 0, 15), st = (e.st === 2 ? 2 : e.st === 3 ? 3 : e.atk ? 1 : 0) | ((e.burnT > 0 ? 1 : 0) << 2); return hp | (st << 4); };
// возвращает [строка, ключевой ли кадр]
export function packHorde(forceKey) {
  const g = G(); HK.seq = (HK.seq + 1) & 65535;
  const key = forceKey || HK.seq % HZ_KEY_EVERY === 1 || !HK.n && HK.kSeq === 0;
  const tms = Math.round(g.t * 1000) >>> 0;
  let o = 0; o = putB(o, 2); o = putB(o, key ? 1 : 0); o = putB(o, HK.seq & 255); o = putB(o, HK.seq >> 8);
  o = putB(o, tms & 255); o = putB(o, (tms >>> 8) & 255); o = putB(o, (tms >>> 16) & 255); o = putB(o, (tms >>> 24) & 255);
  const vint = (v) => { while (v >= 128) { o = putB(o, (v & 127) | 128); v >>>= 7; } o = putB(o, v); };
  const full = (e, last) => { vint(e.id - last); const ty = HZ_T.indexOf(e.type), v = qX(e.x) | (qZ(e.z) << 9) | (ty << 19) | (stByte(e) << 22); o = putB(o, v & 255); o = putB(o, (v >>> 8) & 255); o = putB(o, (v >>> 16) & 255); o = putB(o, (v >>> 24) & 255); };
  if (key) {
    HK.kSeq = HK.seq; HK.n = 0; HK.idx.clear();
    let cnt = 0; for (const e of g.enemies.values()) if (e.hz) cnt++;
    if (HK.ids.length < cnt) { HK.ids = new Int32Array(cnt * 2); HK.qx = new Int16Array(cnt * 2); HK.qz = new Int16Array(cnt * 2); }
    vint(cnt); let last = 0;
    for (const e of g.enemies.values()) { if (!e.hz) continue; full(e, last); last = e.id; HK.ids[HK.n] = e.id; HK.qx[HK.n] = qX(e.x); HK.qz[HK.n] = qZ(e.z); HK.idx.set(e.id, HK.n); HK.n++; }
  } else {
    o = putB(o, HK.kSeq & 255); o = putB(o, HK.kSeq >> 8);
    // кто из ключевого кадра жив — битовая маска; затем по 3 байта на живого
    const nb = (HK.n + 7) >> 3, maskAt = o; for (let i = 0; i < nb; i++) o = putB(o, 0);
    let extra = 0;
    for (let i = 0; i < HK.n; i++) {
      const e = g.enemies.get(HK.ids[i]); if (!e) continue;
      outBuf[maskAt + (i >> 3)] |= 1 << (i & 7);
      const dx = qX(e.x) - HK.qx[i], dz = qZ(e.z) - HK.qz[i];
      if (dx < -127 || dx > 127 || dz < -127 || dz > 127) { o = putB(o, 128); o = putB(o, 0); o = putB(o, stByte(e)); extra++; e.__x = 1; continue; }
      o = putB(o, dx & 255); o = putB(o, dz & 255); o = putB(o, stByte(e));
    }
    // новые юниты (и далеко ушедшие) — полной записью
    let cnt = extra; for (const e of g.enemies.values()) if (e.hz && !HK.idx.has(e.id)) cnt++;
    vint(cnt); let last = 0;
    for (const e of g.enemies.values()) { if (!e.hz) continue; if (!HK.idx.has(e.id) || e.__x) { e.__x = 0; full(e, last); last = e.id; } }
  }
  return [b64(o), key];
}

// ----- гость -----
export const NETSTAT = { pk: 0, key: 0, late: 0, noBase: 0, dropped: 0, delay: 0, gap: 0, jit: 0, lastSeq: -1, rate: 0, rateT: 0, rateN: 0, procMs: 0 };
const RB = { kT: -1, off: -1e15, offs: new Float64Array(48), oi: 0, on: 0, lastArr: 0, lastHostT: -1, kSeq: -1, kN: 0, kIds: new Int32Array(1024), kX: new Float32Array(1024), kZ: new Float32Array(1024), kType: new Uint8Array(1024) };
let inBuf = new Uint8Array(8192);
const pending = [];
export function applyHorde(str) { pending.push(str); NETSTAT.pk++; if (pending.length > 24) { pending.splice(0, pending.length - 24); NETSTAT.dropped++; } }
function resetBuffer() { RB.off = -1e15; RB.on = 0; RB.lastHostT = -1; RB.kSeq = -1; RB.kT = -1; NETSTAT.lastSeq = -1; for (const e of G().enemies.values()) if (e.hz) e.hn = 0; }
function pushSample(e, t, x, z) {
  if (!e.hb) { e.hb = new Float64Array(18); e.hn = 0; }
  const b = e.hb; if (e.hn && t <= b[(e.hn - 1) % 6 * 3]) return;
  const i = e.hn % 6; b[i * 3] = t; b[i * 3 + 1] = x; b[i * 3 + 2] = z; e.hn++;
}
function newUnit(id, type, x, z, t) {
  const M = HZ[type], g = G();
  const e = { id, type, hz: 1, x, z, ry: Math.PI, r: M.r, hp: M.hp, max: M.hp * (g.sg.hpMul || 1), spawnT: 0, dmgBy: {}, ph: (id * 2.39) % 6.28, ram: type === "ram" ? 1 : 0, st: 0, fresh: 1, born: t, die: 0, mk: 0 };
  g.enemies.set(id, e); return e;
}
function setState(e, sb) { const hp = sb & 15, st = (sb >> 4) & 7, s2 = st & 3; e.hpPct = hp / 15 * 100; e.hp = e.max * hp / 15; if (s2 === 2 && e.st !== 2) e.ct = 0; e.st = s2 === 1 ? 0 : s2; e.atk = s2 === 1; e.burnT = st & 4 ? 1 : 0; }
function decode(str) {
  const g = G(), sg = g.sg; if (!sg) return;
  const bin = atob(str), n = bin.length; if (inBuf.length < n) inBuf = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) inBuf[i] = bin.charCodeAt(i);
  let i = 0; const rd = () => inBuf[i++];
  const vint = () => { let v = 0, sh = 0, b; do { b = rd(); v |= (b & 127) << sh; sh += 7; } while (b & 128); return v >>> 0; };
  if (rd() !== 2) return;
  const key = rd(), seq = rd() | (rd() << 8), t = (rd() | (rd() << 8) | (rd() << 16) | (rd() << 24)) >>> 0;
  // новый хозяин / время назад — начинаем буфер заново
  if (RB.lastHostT >= 0 && t + 1500 < RB.lastHostT) resetBuffer();
  // опоздавший/переставленный пакет: ключевой кадр всё равно берём как базу (если он новее прежней базы), позиции — только если новее
  // уже известных (кольцо юнита само отбрасывает старое), а «кто погиб» по нему не решаем
  const late = RB.lastHostT >= 0 && t <= RB.lastHostT;
  if (late) { NETSTAT.late++; if (!key || t <= RB.kT) return; }   // опоздавший или переставленный пакет — старее уже полученного
  const now = performance.now();
  // часы хозяина: offset = t - now; «самый быстрый» пакет из последних — лучшая оценка; разброс задержки — джиттер
  const off = t - now; if (!late) { RB.offs[RB.oi] = off; RB.oi = (RB.oi + 1) % RB.offs.length; RB.on = Math.min(RB.on + 1, RB.offs.length);
  let mx = -1e15; for (let k = 0; k < RB.on; k++) if (RB.offs[k] > mx) mx = RB.offs[k];
  RB.off = mx; }
  if (RB.lastArr) { const gap = now - RB.lastArr; NETSTAT.gap = NETSTAT.gap ? NETSTAT.gap * 0.9 + gap * 0.1 : gap; }
  if (!late) NETSTAT.jit = NETSTAT.jit * 0.92 + (RB.off - off) * 0.08;
  RB.lastArr = now; if (!late) RB.lastHostT = t;
  const mark = seq + 1;
  if (key) {
    NETSTAT.key++;
    const cnt = vint(); if (RB.kIds.length < cnt) { RB.kIds = new Int32Array(cnt * 2); RB.kX = new Float32Array(cnt * 2); RB.kZ = new Float32Array(cnt * 2); RB.kType = new Uint8Array(cnt * 2); }
    let id = 0;
    for (let k = 0; k < cnt; k++) {
      id += vint(); const w = (rd() | (rd() << 8) | (rd() << 16) | (rd() << 24)) >>> 0;
      const x = (w & 511) / 8 + XMIN, z = ((w >>> 9) & 1023) / 8 + ZMIN, ty = (w >>> 19) & 7;
      RB.kIds[k] = id; RB.kX[k] = x; RB.kZ[k] = z; RB.kType[k] = ty;
      let e = g.enemies.get(id); if (!e) e = newUnit(id, HZ_T[ty], x, z, t);
      e.mk = mark; e.die = 0; pushSample(e, t, x, z); setState(e, (w >>> 22) & 255);
    }
    RB.kN = cnt; RB.kSeq = seq; RB.kT = t;
  } else {
    const ks = rd() | (rd() << 8);
    if (ks !== RB.kSeq) { NETSTAT.noBase++; return; }   // ключевой кадр, к которому дельта, ещё не пришёл — ждём следующий
    const nb = (RB.kN + 7) >> 3, maskAt = i; i += nb;
    for (let k = 0; k < RB.kN; k++) {
      if (!(inBuf[maskAt + (k >> 3)] & (1 << (k & 7)))) continue;
      const dxb = rd(), dzb = rd(), sb = rd(); const e = g.enemies.get(RB.kIds[k]); if (!e) continue;
      e.mk = mark; e.die = 0; setState(e, sb);
      if (dxb === 128 && dzb === 0) continue;   // далеко ушёл — придёт полной записью ниже
      const dx = dxb > 127 ? dxb - 256 : dxb, dz = dzb > 127 ? dzb - 256 : dzb;
      pushSample(e, t, RB.kX[k] + dx / 8, RB.kZ[k] + dz / 8);
    }
    const cnt = vint(); let id = 0;
    for (let k = 0; k < cnt; k++) {
      id += vint(); const w = (rd() | (rd() << 8) | (rd() << 16) | (rd() << 24)) >>> 0;
      const x = (w & 511) / 8 + XMIN, z = ((w >>> 9) & 1023) / 8 + ZMIN;
      let e = g.enemies.get(id); if (!e) e = newUnit(id, HZ_T[(w >>> 19) & 7], x, z, t);
      e.mk = mark; e.die = 0; pushSample(e, t, x, z); setState(e, (w >>> 22) & 255);
    }
  }
  // кого нет в пакете — погиб; убираем, когда «прошлое» на экране дойдёт до этого момента
  if (!late) for (const e of g.enemies.values()) if (e.hz && e.mk !== mark && !e.die) e.die = t;
  NETSTAT.lastSeq = seq;
}
// стена: целый пролёт (или ворота) у гостя — по снимку хозяина; точка не может оказаться в нём или за ним, если юнит снаружи
function constrain(e, x, z) {
  if (e.st === 2 || e.st === 3 || Math.abs(x) > 16.6) return z;
  const lo = WZ - WT - 0.05, hi = WZ + WT + 0.05; if (z <= lo || !G().sg) return z;
  const i = segOf(x); if (!intact(G().sg, i)) return z;
  const b = e.hb, nz = e.hn ? b[(e.hn - 1) % 6 * 3 + 2] : z;   // где юнит по последнему снимку
  if (nz < WZ) return lo;            // снаружи — стену не проходит
  return z < hi ? hi : z;            // уже внутри (через пролом) — остаётся внутри
}
// гость, каждый кадр: разбор пачки пакетов с ограничением по времени, затем интерполяция всех юнитов
export function clientStep(dt) {
  const g = G(); if (!g.sg) return;
  const t0 = performance.now();
  // пачка пакетов за кадр (брокер «залип» и отдал разом): ключевые кадры обязательно, из дельт — только свежие, в пределах ~3 мс
  if (pending.length) {
    for (let k = 0; k < pending.length; k++) {
      const s = pending[k], late = pending.length - k > 2 && performance.now() - t0 > 3;
      if (late && atob(s.slice(0, 4)).charCodeAt(1) !== 1) { NETSTAT.dropped++; continue; }   // не успеваем — пропускаем промежуточные дельты, ключевые кадры разбираем всегда
      decode(s);
    }
    pending.length = 0;
  }
  const now = performance.now();
  NETSTAT.rateN++; if (now - NETSTAT.rateT > 1000) { NETSTAT.rate = NETSTAT.pkRate = (NETSTAT.pk - (NETSTAT.pk0 || 0)) * 1000 / (now - NETSTAT.rateT); NETSTAT.pk0 = NETSTAT.pk; NETSTAT.rateT = now; }
  if (RB.off < -1e14) return;
  // задержка показа: 1.5 интервала + 2 джиттера (+ запас), 90…900 мс
  const want = clamp(1.5 * (NETSTAT.gap || 125) + 2 * NETSTAT.jit + 25, 90, 900);
  NETSTAT.delay = NETSTAT.delay ? NETSTAT.delay + (want - NETSTAT.delay) * Math.min(1, dt * 1.5) : want;
  const R = now + RB.off - NETSTAT.delay;
  const kb = 1 - Math.exp(-dt / 0.07);   // большие поправки — плавно за ~200 мс
  for (const [id, e] of g.enemies) {
    if (!e.hz) continue;
    if (e.die && R >= e.die) { g.enemies.delete(id); onDeath(e); continue; }
    const n = e.hn || 0; if (!n) continue;
    const b = e.hb; let tx, tz;
    const ni = (n - 1) % 6, oi = n >= 6 ? n % 6 : 0, cnt = Math.min(n, 6);
    if (e.fresh && R < b[oi * 3]) { e.vis = 0; e.x = b[oi * 3 + 1]; e.z = b[oi * 3 + 2]; continue; }   // ещё «не родился» на экране
    if (R >= b[ni * 3]) { tx = b[ni * 3 + 1]; tz = b[ni * 3 + 2]; }                   // новее последнего снимка не рисуем — стоим, не угадываем
    else if (R <= b[oi * 3]) { tx = b[oi * 3 + 1]; tz = b[oi * 3 + 2]; }
    else {
      tx = b[ni * 3 + 1]; tz = b[ni * 3 + 2];
      for (let c = cnt - 1; c > 0; c--) { const j1 = (oi + c) % 6, j0 = (oi + c - 1) % 6, t1 = b[j1 * 3], t0b = b[j0 * 3]; if (R >= t0b) { const k = (R - t0b) / Math.max(1, t1 - t0b); tx = b[j0 * 3 + 1] + (b[j1 * 3 + 1] - b[j0 * 3 + 1]) * k; tz = b[j0 * 3 + 2] + (b[j1 * 3 + 2] - b[j0 * 3 + 2]) * k; break; } }
    }
    tz = constrain(e, tx, tz);
    if (e.fresh) { e.fresh = 0; e.vis = 1; e.x = tx; e.z = tz; continue; }
    e.vis = 1;
    const ox = e.x, oz = e.z, d = Math.hypot(tx - ox, tz - oz);
    if (d > 8) { e.x = tx; e.z = tz; }                       // настоящий скачок — сразу
    else if (d > 0.9) { e.x += (tx - ox) * kb; e.z += (tz - oz) * kb; }   // большая поправка — плавно
    else { e.x = tx; e.z = tz; }
    e.z = constrain(e, e.x, e.z);
    const mx = e.x - ox, mz = e.z - oz;
    if (mx * mx + mz * mz > 1e-6) { const want2 = Math.atan2(mx, mz); let dr = want2 - e.ry; while (dr > Math.PI) dr -= 6.283; while (dr < -Math.PI) dr += 6.283; e.ry += dr * Math.min(1, dt * 8); }
    if (e.st === 2) e.ct = Math.min(1, (e.ct || 0) + dt / 2.9);
  }
  NETSTAT.procMs = NETSTAT.procMs * 0.9 + (performance.now() - t0) * 0.1;
}
export function resetNet() { pending.length = 0; resetBuffer(); HK.seq = 0; HK.kSeq = 0; HK.n = 0; HK.idx.clear(); }
// ================= ОТРИСОВКА: ОРДА =================
// для каждого типа — два «запечённых» кадра походки (вершинная анимация в шейдере) + упрощённая модель для дальних
const hr = { types: {}, uT: { value: 0 }, ready: false, blob: null, ladderIM: null, cap: 640 };
const NEAR_CAP = 120, NEAR_TOTAL = 90;   // подробных юнитов в кадре не больше 90 — остальные упрощённые
function bakeFrames(M) {
  let c; if (M.q) c = makeQ(M.src, M.h); else { c = makeChar(M.src); c.obj.scale.setScalar(M.scale); }
  if (M.wpn && !M.q) { const h = c.bone("handslotr"); if (h) h.add(cloneWeapon(M.wpn)); }
  if (!M.q && M.src === "sk_warrior") { const h = c.bone("handslotl"); if (h) h.add(cloneWeapon("Skeleton_Shield_Small_A")); }
  const clip = M.q ? A.qclips[M.src] && A.qclips[M.src][M.clip] : A.clips[M.clip];
  const act = clip ? c.mixer.clipAction(clip) : null; if (act) act.play();
  const dur = clip ? clip.duration : 1, frames = [];
  for (const t of [dur * 0.12, dur * 0.62]) {
    if (act) { act.time = t; c.mixer.update(0); }
    c.obj.updateMatrixWorld(true);
    const parts = new Map();
    c.obj.traverse((m) => {
      if (!m.isMesh) return;
      const src = m.geometry, n = src.attributes.position.count, P = new Float32Array(n * 3), v = new THREE.Vector3();
      for (let i = 0; i < n; i++) { if (m.isSkinnedMesh) { v.fromBufferAttribute(src.attributes.position, i); m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld); } else { v.fromBufferAttribute(src.attributes.position, i).applyMatrix4(m.matrixWorld); } P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
      const key = m.material.uuid; let p = parts.get(key); if (!p) parts.set(key, (p = { mat: m.material, list: [] }));
      p.list.push({ P, src });
    });
    frames.push(parts);
  }
  // собираем: позиция = кадр A, aPosB = кадр B; uv и индексы из исходника; группы по материалам
  const geos = [], mats = [];
  for (const [key, pa] of frames[0]) {
    const pb = frames[1].get(key); const gg = [];
    pa.list.forEach((it, j) => {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(it.P, 3)); g.setAttribute("aPosB", new THREE.BufferAttribute(pb ? pb.list[j].P : it.P, 3));
      const uv = it.src.attributes.uv; g.setAttribute("uv", uv ? new THREE.BufferAttribute(new Float32Array(Array.from({ length: uv.count * 2 }, (_, k) => uv.getComponent(k >> 1, k & 1))), 2) : new THREE.BufferAttribute(new Float32Array(it.P.length / 3 * 2), 2));
      if (it.src.index) g.setIndex(Array.from(it.src.index.array));
      gg.push(g);
    });
    const mg = mergeGeos(gg); mg.computeVertexNormals(); geos.push(mg); mats.push(pa.mat);
  }
  const full = mergeGeos(geos, true);
  return { full, mats, parts: geos };
}
function mergeGeos(list, groups) {
  // упрощённое слияние (позиции, aPosB, uv, индексы) — всё Float32 и с индексами
  const g = new THREE.BufferGeometry(); let nv = 0, ni = 0; for (const x of list) { nv += x.attributes.position.count; ni += x.index ? x.index.count : x.attributes.position.count; }
  const P = new Float32Array(nv * 3), B = new Float32Array(nv * 3), U = new Float32Array(nv * 2), N = new Float32Array(nv * 3), I = new Uint32Array(ni);
  let ov = 0, oi = 0;
  list.forEach((x, k) => {
    const c = x.attributes.position.count; P.set(x.attributes.position.array, ov * 3); B.set((x.attributes.aPosB || x.attributes.position).array, ov * 3); U.set(x.attributes.uv.array, ov * 2); if (x.attributes.normal) N.set(x.attributes.normal.array, ov * 3);
    const st = oi; if (x.index) { const ia = x.index.array; for (let i = 0; i < ia.length; i++) I[oi++] = ia[i] + ov; } else for (let i = 0; i < c; i++) I[oi++] = i + ov;
    if (groups) g.addGroup(st, oi - st, k);
    ov += c;
  });
  g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("aPosB", new THREE.BufferAttribute(B, 3)); g.setAttribute("uv", new THREE.BufferAttribute(U, 2)); g.setAttribute("normal", new THREE.BufferAttribute(N, 3)); g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}
// упрощение с сохранением анимации: SimplifyModifier оставляет исходные вершины — по их позиции находим кадр B
function simplifyAnim(geo, keep, noUv) {
  const n = geo.attributes.position.count; if (n < 60) return geo;
  const tmp = new THREE.BufferGeometry(); tmp.setAttribute("position", geo.attributes.position.clone()); if (!noUv) tmp.setAttribute("uv", geo.attributes.uv.clone()); tmp.setIndex(geo.index.clone());
  let low; try { const mv = mergeVertices(tmp, 1e-4); low = new SimplifyModifier().modify(mv, Math.floor(mv.attributes.position.count * (1 - keep))); } catch (e) { low = null; }
  if (!low || !low.attributes.position || low.attributes.position.count < 12 || (low.index && low.index.count < 36)) return !noUv ? simplifyAnim(geo, keep, true) : keep < 0.5 ? simplifyAnim(geo, keep + 0.25, true) : geo;
  if (noUv) { /* без развёртки: берём uv исходной вершины по позиции (ниже) */ }
  const P = geo.attributes.position.array, B = geo.attributes.aPosB.array, key = (x, y, z) => Math.round(x * 2000) + "," + Math.round(y * 2000) + "," + Math.round(z * 2000), map = new Map();
  for (let i = 0; i < n; i++) map.set(key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), i);
  const LP = low.attributes.position.array, LB = new Float32Array(LP.length);
  for (let j = 0; j < LP.length / 3; j++) { const i = map.get(key(LP[j * 3], LP[j * 3 + 1], LP[j * 3 + 2])); if (i != null) { LB[j * 3] = B[i * 3]; LB[j * 3 + 1] = B[i * 3 + 1]; LB[j * 3 + 2] = B[i * 3 + 2]; } else { LB[j * 3] = LP[j * 3]; LB[j * 3 + 1] = LP[j * 3 + 1]; LB[j * 3 + 2] = LP[j * 3 + 2]; } }
  low.setAttribute("aPosB", new THREE.BufferAttribute(LB, 3));
  if (noUv) { const U = geo.attributes.uv.array, LU = new Float32Array(LP.length / 3 * 2); for (let j = 0; j < LP.length / 3; j++) { const i = map.get(key(LP[j * 3], LP[j * 3 + 1], LP[j * 3 + 2])); if (i != null) { LU[j * 2] = U[i * 2]; LU[j * 2 + 1] = U[i * 2 + 1]; } } low.setAttribute("uv", new THREE.BufferAttribute(LU, 2)); }
  if (!low.attributes.uv) low.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(LP.length / 3 * 2), 2));
  if (!low.index) low.setIndex(Array.from({ length: LP.length / 3 }, (_, i) => i));
  low.computeVertexNormals();
  return low;
}
function hordeMat(base, lod) {
  const m = base.clone(); m.envMapIntensity = 0.5;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = hr.uT;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aPosB; attribute vec3 aI; uniform float uT;")
      .replace("#include <begin_vertex>", lod ? `vec3 transformed = position; transformed.y += abs(sin(uT * aI.y * 0.5 + aI.x)) * 0.06;`
        : `float kk = 0.5 + 0.5 * sin(uT * aI.y + aI.x); vec3 transformed = mix(position, aPosB, kk); transformed.z += aI.z * max(0.0, sin(uT * 9.0 + aI.x)) * 0.28;`);
  };
  m.customProgramCacheKey = () => "horde" + lod;
  return m;
}
function makeIM(geo, mats, n, lod) {
  const g = geo.clone(); const aI = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); aI.setUsage(THREE.DynamicDrawUsage); g.setAttribute("aI", aI);
  const im = new THREE.InstancedMesh(g, mats.length > 1 ? mats.map((m) => hordeMat(m, lod)) : hordeMat(mats[0], lod), n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.count = 0;
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.userData.aI = aI;
  return im;
}
export const hordeReady = () => hr.ready;
export function prepareHorde() {
  if (hr.ready) return;
  for (const [k, M] of Object.entries(HZ)) {
    if (M.big) continue;
    if (!has(M.src)) continue;
    const b = bakeFrames(M), t0 = performance.now();
    // два уровня детализации, оба с анимацией: ближние ~40% треугольников, дальние ~12%
    const near = mergeGeos(b.parts.map((g) => simplifyAnim(g, M.q ? 0.4 : 0.55)), true), far = mergeGeos(b.parts.map((g) => simplifyAnim(g, M.q ? 0.1 : 0.17)), true);
    hr.types[k] = { near: makeIM(near, b.mats, NEAR_CAP, 0), far: makeIM(far, b.mats, hr.cap, 0), tris: (near.index.count / 3) | 0, trisLow: (far.index.count / 3) | 0, full: (b.full.index.count / 3) | 0, ms: Math.round(performance.now() - t0) };
  }
  // мягкие тени-пятна под каждым
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const gr = x.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,.5)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  hr.blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }), hr.cap); hr.blob.frustumCulled = false; hr.blob.renderOrder = 1; hr.blob.count = 0;
  // лестница (её несут и приставляют к стене)
  builderMats();
  const lg = []; const wood = BM.wood;
  for (const sx of [-0.32, 0.32]) { const r = new THREE.BoxGeometry(0.08, 4.2, 0.08); r.translate(sx, 2.1, 0); lg.push(r); }
  for (let i = 0; i < 9; i++) { const r = new THREE.BoxGeometry(0.64, 0.06, 0.06); r.translate(0, 0.3 + i * 0.45, 0); lg.push(r); }
  const lgeo = mergeSimple(lg); hr.ladderIM = new THREE.InstancedMesh(lgeo, wood, 64); hr.ladderIM.castShadow = true; hr.ladderIM.frustumCulled = false; hr.ladderIM.count = 0;
  hr.ready = true;
}
function mergeSimple(list) { const g = new THREE.BufferGeometry(); let nv = 0, ni = 0; for (const x of list) { nv += x.attributes.position.count; ni += x.index.count; } const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), I = new Uint32Array(ni); let ov = 0, oi = 0; for (const x of list) { P.set(x.attributes.position.array, ov * 3); N.set(x.attributes.normal.array, ov * 3); U.set(x.attributes.uv.array, ov * 2); for (const v of x.index.array) I[oi++] = v + ov; ov += x.attributes.position.count; } g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.BufferAttribute(N, 3)); g.setAttribute("uv", new THREE.BufferAttribute(U, 2)); g.setIndex(new THREE.BufferAttribute(I, 1)); return g; }
export function attachHorde(root) {
  for (const t of Object.values(hr.types)) { root.add(t.near); root.add(t.far); }
  if (hr.blob) root.add(hr.blob); if (hr.ladderIM) root.add(hr.ladderIM);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
export const stats = { near: 0, far: 0, culled: 0, tris: 0 };
export const hordeInfo = () => Object.fromEntries(Object.entries(hr.types).map(([k, t]) => [k, { full: t.full, near: t.tris, far: t.trisLow, ms: t.ms }]));
export function updateHorde(dt, camX, camZ, t, isHost) {
  if (!hr.ready) return;
  hr.uT.value = t;
  const g = G(), counts = {}; for (const k in hr.types) counts[k] = [0, 0];
  let nb = 0, nl = 0, near = 0, far = 0, cul = 0, tris = 0, nearAll = 0;
  // ближние — подробные (до 200 на тип), дальние — упрощённые
  for (const e of g.enemies.values()) {
    if (!e.hz) continue;
    const dx = e.x - camX, dz = e.z - camZ;
    if (Math.abs(dx) > 24 || dz < -46 || dz > 20) { cul++; continue; }
    if (e.ram || e.vis === 0) continue;
    const T = hr.types[e.type]; if (!T) continue;
    const cnt = counts[e.type], isNear = Math.abs(dx) < 12 && dz > -15 && dz < 12 && cnt[0] < NEAR_CAP && nearAll < NEAR_TOTAL;
    const im = isNear ? T.near : T.far, i = isNear ? cnt[0]++ : cnt[1]++;
    if (isNear) nearAll++;
    if (i >= (isNear ? NEAR_CAP : hr.cap)) continue;
    const y = unitY(e), M = HZ[e.type];
    _q.setFromEuler(_e.set(e.st === 2 ? -0.35 : 0, e.st === 2 ? Math.PI : e.ry, 0)); _m.compose(_v.set(e.x, y, e.z), _q, _s.setScalar(1)); im.setMatrixAt(i, _m);
    const fl = e.fl > 0 ? (e.fl -= dt * 5, e.fl) : 0, tn = M.tint || [1, 1, 1];
    if (e.burnT > 0) im.instanceColor.setXYZ(i, 1.6 + fl, 0.8 + fl, 0.5 + fl); else im.instanceColor.setXYZ(i, tn[0] + fl * 1.5, tn[1] + fl * 1.5, tn[2] + fl * 1.5);
    const moving = !e.atk && e.st !== 2;
    im.userData.aI.setXYZ(i, e.ph, moving ? M.spd * 3.4 : e.st === 2 ? 6 : 0.8, e.atk ? 1 : 0);
    if (isNear) { near++; tris += T.tris; } else { far++; tris += T.trisLow || T.tris; }
    if (nb < hr.cap) { _m.compose(_v.set(e.x, y + 0.03, e.z), _q.identity(), _s.set(M.r * 2.6, 1, M.r * 2.6)); hr.blob.setMatrixAt(nb++, _m); }
    if (e.type === "hz_ladder" && e.st === 5 && nl < 64) { _q.setFromEuler(_e.set(Math.PI / 2 - 0.15, e.ry, 0)); _m.compose(_v.set(e.x - Math.sin(e.ry) * 1.6, y + 1.1, e.z - Math.cos(e.ry) * 1.6), _q, _s.setScalar(0.9)); hr.ladderIM.setMatrixAt(nl++, _m); }
  }
  for (const [k, T] of Object.entries(hr.types)) for (const [im, n] of [[T.near, counts[k][0]], [T.far, counts[k][1]]]) { im.count = n; if (n) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.userData.aI.needsUpdate = true; } }
  // приставленные лестницы
  const sg = g.sg;
  if (sg) for (const L of sg.lad) { if (nl >= 64) break; const fall = L.push > 0 ? L.push / 1.1 : 0; _q.setFromEuler(_e.set(-0.42 - fall * 0.5, 0, Math.sin(G().t * 30) * 0.03 * fall)); _m.compose(_v.set(L.x, 0, WZ - WT - 1.45), _q, _s.setScalar(1)); hr.ladderIM.setMatrixAt(nl++, _m); }
  // падающие
  for (const f of falling) { if (nl >= 64) break; f.t += dt; const k = Math.min(1, f.t / 0.9); _q.setFromEuler(_e.set(-0.42 - k * 1.2, 0, 0)); _m.compose(_v.set(f.x, -k * 0.3, WZ - WT - 1.45 - k * 0.6), _q, _s.setScalar(1)); hr.ladderIM.setMatrixAt(nl++, _m); }
  for (let i = falling.length - 1; i >= 0; i--) if (falling[i].t > 1.6) falling.splice(i, 1);
  hr.ladderIM.count = nl; hr.ladderIM.instanceMatrix.needsUpdate = true;
  hr.blob.count = nb; hr.blob.instanceMatrix.needsUpdate = true;
  // тараны — отдельные модели
  if (views) {
    const seen = new Set();
    for (const e of g.enemies.values()) if (e.ram) {
      seen.add(e.id); let v = views.rams.get(e.id); if (!v) { v = makeRam(); world.add(v.g); views.rams.set(e.id, v); }
      v.g.position.set(e.x, 0, e.z); v.g.rotation.y = e.ry; v.swing = e.atk ? v.swing + dt : 0; v.log.position.z = 0.9 + Math.max(0, Math.sin(v.swing * 2.6)) * 0.7 - 0.2;
      v.wheels.forEach((w) => (w.rotation.x += (e.atk ? 0 : dt * 1.4)));
    }
    for (const [id, v] of views.rams) if (!seen.has(id)) { world.remove(v.g); views.rams.delete(id); api.fx.explosion(v.g.position.x, v.g.position.z, 2); api.fx.chips(v.g.position.x, 1, v.g.position.z, api.COL.wood); }
  }
  Object.assign(stats, { near, far, culled: cul, tris });
}
const falling = [];
function makeRam() {
  builderMats(); const g = new THREE.Group(), wood = BM.wood, iron = BM.iron, roofM = BM.roofG;
  const m = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  m(new THREE.BoxGeometry(1.6, 0.18, 2.8), wood, 0, 0.55, 0);
  for (const sx of [-0.7, 0.7]) for (const sz of [-1.1, 1.1]) m(new THREE.BoxGeometry(0.12, 1.5, 0.12), wood, sx, 1.3, sz);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 3.0, 3, 1, false), roofM); roof.rotation.x = Math.PI / 2; roof.rotation.z = Math.PI; roof.position.set(0, 2.1, 0); roof.scale.set(1, 1, 0.75); roof.castShadow = true; g.add(roof);
  const wheels = []; for (const sx of [-0.85, 0.85]) for (const sz of [-0.95, 0.95]) { const w = m(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10), wood, sx, 0.42, sz); w.rotation.z = Math.PI / 2; wheels.push(w); }
  const log = new THREE.Group(); const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.2, 10), wood); lg.rotation.x = Math.PI / 2; lg.castShadow = true; log.add(lg);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 8), iron); head.rotation.x = Math.PI / 2; head.position.z = 1.85; log.add(head);
  log.position.set(0, 1.15, 0.9); g.add(log);
  g.scale.setScalar(1.05);
  return { g, log, wheels, swing: 0 };
}
// смерть юнита: косточки/пыль (с ограничением, чтобы сотни смертей не душили кадр)
let deathBudget = 0, deathT = 0;
export function onDeath(e) {
  const t = performance.now(); if (t - deathT > 100) { deathT = t; deathBudget = 8; }
  if (deathBudget <= 0) return; deathBudget--;
  const M = HZ[e.type]; api.fx.death(e.x, e.z, e.type === "hz_rat" ? api.COL.acid : api.COL.bone);
  if (Math.random() < 0.35) api.AU.play(M.snd === "bone" ? "bone" : "die", { x: e.x, z: e.z, vol: 0.35, gap: 0.08 });
}

// ================= ОТРИСОВКА: СТЕНЫ, ВОРОТА, БАШНИ =================
export function buildStructViews() {
  for (let i = 0; i < NSEG; i++) updSegView(i);
  for (let k = 0; k < SLOTS.length; k++) updSlotView(k);
}
function stoneMat(lv) { builderMats(); return lv >= 4 ? (BM.stoneD || (BM.stoneD = BM.stone.clone(), BM.stoneD.color = new THREE.Color(0.82, 0.84, 0.9), BM.stoneD)) : BM.stone; }
function segGroup(i) {
  const sg = G().sg, x0 = segX(i), g = new THREE.Group(); g.position.set(x0, 0, WZ);
  const m = (geo, mat, x, y, z, ry) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (ry) o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  builderMats(); const wood = BM.wood, iron = BM.iron, dirt = BM.sgRamp || (BM.sgRamp = pbr("planks", 1, { roughness: 0.9, color: 0xa08a6c })), planks = BM.planks || (BM.planks = pbr("planks", 1, { roughness: 0.8 }));
  const out = { g, fx: [] };
  if (i === GATE) {
    const gt = sg.gate;
    // надвратная арка и две башни
    for (const s of [-1, 1]) { m(new THREE.BoxGeometry(1.3, WH + 1.6, 2.9), stoneMat(gt.lv + 1), s * 1.85, (WH + 1.6) / 2, 0); m(new THREE.ConeGeometry(1.05, 1.4, 4), BM.roofG, s * 1.85, WH + 1.6 + 0.7, 0, Math.PI / 4); for (const z of [-1.0, 1.0]) m(new THREE.BoxGeometry(0.34, 0.4, 0.34), stoneMat(gt.lv + 1), s * 1.85 + 0.45, WH + 1.8, z * 0.5); }
    m(new THREE.BoxGeometry(2.6, 0.7, 2.6), stoneMat(gt.lv + 1), 0, WH - 0.05, 0);
    for (let k = -1; k <= 1; k++) m(new THREE.BoxGeometry(0.4, 0.42, 0.3), stoneMat(gt.lv + 1), k * 0.85, WH + 0.5, -1.15);
    if (!gt.br) {
      if (gt.lv >= 3) { for (let k = -5; k <= 5; k++) m(new THREE.BoxGeometry(0.07, WH - 0.4, 0.07), iron, k * 0.22, (WH - 0.4) / 2, -0.9); for (let k = 0; k < 6; k++) m(new THREE.BoxGeometry(2.4, 0.06, 0.07), iron, 0, 0.25 + k * 0.38, -0.9); }
      m(new THREE.BoxGeometry(2.4, WH - 0.35, 0.22), planks, 0, (WH - 0.35) / 2, -0.55);
      if (gt.lv >= 2) for (const y of [0.5, 1.4]) m(new THREE.BoxGeometry(2.42, 0.12, 0.25), iron, 0, y, -0.56);
    } else { for (let k = 0; k < 5; k++) { const o = m(new THREE.BoxGeometry(0.3, 0.12, 1.1 + Math.random()), planks, (Math.random() - 0.5) * 2, 0.08, -1.4 - Math.random() * 1.6, Math.random() * 3); o.rotation.z = (Math.random() - 0.5) * 0.4; } }
    if (gt.oil) { const c = cloneProp("Cauldron"); c.position.set(0, WH + 0.35, -0.75); c.scale.setScalar(gt.oil === 2 ? 1.25 : 1.0); g.add(c); out.fx.push({ k: "oil", x: x0, y: WH + 0.9, z: WZ - 0.75 }); }
    for (const s of [-1, 1]) { const t = cloneProp("Torch_Metal"); t.position.set(s * 2.75, 0, -1.65); t.scale.setScalar(1.3); g.add(t); out.fx.push({ k: "torch", x: x0 + s * 2.75, y: 1.65, z: WZ - 1.65 }); }
    return bake(out);
  }
  const s = sg.seg[i];
  // вал за стеной (насыпь с досками): по нему поднимаются на боевой ход
  { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(2.2, 0); sh.lineTo(0, WH); sh.closePath(); const rg = new THREE.ExtrudeGeometry(sh, { depth: SEGW, bevelEnabled: false }); rg.rotateY(-Math.PI / 2); rg.translate(SEGW / 2, 0, WT); const o = m(rg, dirt, 0, 0, 0); o.castShadow = false; }
  if (s.br) {
    // пролом: груда камней и обломки
    for (let k = 0; k < 16; k++) { const r = 0.35 + Math.random() * 0.6, o = m(new THREE.DodecahedronGeometry(r, 0), s.lv === 1 && k % 2 ? wood : stoneMat(Math.max(2, s.lv)), (Math.random() - 0.5) * 2.8, r * 0.45, (Math.random() - 0.5) * 3.2); o.rotation.set(Math.random() * 3, Math.random() * 3, 0); o.scale.y = 0.6; }
    for (const sx of [-1, 1]) m(new THREE.BoxGeometry(0.5, WH * 0.6, 2.2), s.lv === 1 ? wood : stoneMat(s.lv), sx * 1.3, WH * 0.3, 0);
    out.fx.push({ k: "smoke", x: x0, y: 0.6, z: WZ });
    return bake(out);
  }
  if (s.lv === 1) {
    // частокол: заострённые брёвна + помост
    for (let k = 0; k < 9; k++) { const x = -1.33 + k * 0.333, h = WH + 0.6 + (k % 2) * 0.15; m(new THREE.CylinderGeometry(0.16, 0.18, h, 7), wood, x, h / 2, -0.85); m(new THREE.ConeGeometry(0.16, 0.38, 7), wood, x, h + 0.19, -0.85); }
    m(new THREE.BoxGeometry(SEGW, 0.16, 1.9), planks, 0, WH - 0.08, 0.15);
    for (const x of [-1.2, 0, 1.2]) for (const z of [-0.6, 0.9]) m(new THREE.BoxGeometry(0.16, WH - 0.15, 0.16), wood, x, (WH - 0.15) / 2, z);
  } else {
    const H = WH + (s.lv >= 3 ? 0.1 : 0);
    m(new THREE.BoxGeometry(SEGW + 0.02, H, 2.4), stoneMat(s.lv), 0, H / 2, 0);
    m(new THREE.BoxGeometry(SEGW, 0.08, 1.5), planks, 0, H + 0.04, 0.25);
    if (s.lv >= 3) for (let k = 0; k < 4; k++) m(new THREE.BoxGeometry(0.46, 0.55, 0.42), stoneMat(s.lv), -1.15 + k * 0.77, H + 0.27, -0.98);
    else m(new THREE.BoxGeometry(SEGW, 0.38, 0.3), stoneMat(s.lv), 0, H + 0.19, -1.05);
    if (s.lv >= 4) { for (const sx of [-1.1, 1.1]) { const b = m(new THREE.BoxGeometry(0.5, H * 0.8, 0.6), stoneMat(s.lv), sx, H * 0.4, -1.45); b.rotation.x = 0.18; } const bn = makeBanner("#1f2a44"); bn.position.set(0, H - 0.2, -1.25); bn.rotation.y = Math.PI; bn.scale.setScalar(0.8); g.add(bn); }
  }
  if (s.rock) {
    // камнемёт: стойка со стрелой и корзина камней
    const H = WH + 0.1;
    m(new THREE.BoxGeometry(0.14, 1.4, 0.14), wood, 0.9, H + 0.7, -0.4);
    const arm = m(new THREE.BoxGeometry(0.1, 0.1, 1.5), wood, 0.9, H + 1.35, -0.85); arm.rotation.x = -0.3;
    const pile = cloneWorld("resource_stone"); pile.position.set(0.9, H + 0.05, 0.35); pile.scale.setScalar(s.rock === 2 ? 0.75 : 0.55); g.add(pile);
  }
  if (i % 3 === 0) { const t = cloneProp("Torch_Metal"); t.position.set(0, WH - 0.05, 0.85); t.scale.setScalar(0.9); g.add(t); out.fx.push({ k: "torch", x: x0, y: WH + 1.05, z: WZ + 0.85 }); }
  return bake(out);
}
export function updSegView(i) {
  if (!views || !world) return;
  const old = views.seg[i]; if (old) world.remove(old.g);
  const v = segGroup(i); world.add(v.g); views.seg[i] = v; v.shake = 0;
  api.shadowsDirty();
}
export function updSlotView(k) {
  if (!views || !world) return;
  const old = views.slot[k]; if (old) { world.remove(old.obj); views.slot[k] = null; }
  const t = G().sg.slot[k]; if (!t) { api.shadowsDirty(); return; }
  const b = buildTowerDeep(t.type, t.lv, 0.02, null), obj = new THREE.Group(); obj.add(b.g); obj.position.set(segX(SLOTS[k]), WH - 0.05, WZ - 0.1); obj.scale.setScalar(0.82); world.add(obj);
  views.slot[k] = { obj, b, kick: 0 }; api.shadowsDirty();
}
export const slotTop = (k) => { const v = views && views.slot[k]; const y = v && v.b ? WH + v.b.top.y * 0.82 : WH + 2.6; return { x: segX(SLOTS[k]), y, z: WZ - 0.1 }; };
export function updateViews(dt, t) {
  if (!views) return;
  for (const v of views.seg) if (v && v.fx) for (const f of v.fx) {
    if (f.k === "torch" && Math.random() < 0.5) api.fx.add.add(f.x + (Math.random() - 0.5) * 0.12, f.y, f.z + (Math.random() - 0.5) * 0.12, 0, 0.9, 0, 0.32, 0.3, 0.06, Math.random() < 0.5 ? api.COL.fire : api.COL.spark, 0, 1);
    if (f.k === "smoke" && Math.random() < 0.15) api.fx.puff(f.x + (Math.random() - 0.5) * 2, f.z + (Math.random() - 0.5) * 1.5, 1, api.COL.smoke, 0.7);
    if (f.k === "oil" && Math.random() < 0.2) api.fx.norm.add(f.x + (Math.random() - 0.5) * 0.3, f.y, f.z, 0, 0.6, 0, 0.9, 0.35, 0.3, api.COL.smoke, 0, 1);
  }
  for (const s of views.slot) if (s) { s.kick = Math.max(0, s.kick - dt * 5); s.obj.scale.setScalar(0.82 * (1 + s.kick * 0.04)); if (s.b.spin) s.b.spin.rotation.y += dt * 2; if (s.b.orbs) s.b.orbs.forEach((o, i) => { const a = t * 2 + o.userData.orbit.a; o.position.set(Math.cos(a) * 0.55, s.b.spin.position.y + Math.sin(t * 3 + i) * 0.1, Math.sin(a) * 0.55); }); }
}
// события крепости (эффекты и звук у всех)
export function onEvent(f) {
  const g = G(), sg = g.sg, k = f[0], fx = api.fx, AU = api.AU, COL = api.COL; if (!sg) return;
  if (k === "St") { const e = g.enemies.get(f[2]); if (e) towerShot(f[1], e); }
  else if (k === "Sz") { const top = slotTop(f[1]); const pts = [new THREE.Vector3(top.x, top.y, top.z)]; for (const id of f.slice(2)) { const e = g.enemies.get(id); if (e) pts.push(new THREE.Vector3(e.x, unitY(e) + 0.8, e.z)); } if (pts.length > 1) { fx.lightning(pts, COL.purple); AU.play("zap", { x: top.x, z: top.z, vol: 0.45, gap: 0.1 }); } }
  else if (k === "Sr") { const x = f[2] / 10, z = f[3] / 10, s0 = segX(f[1]); const sh = { kind: "stone", arc: true, sx: s0 + 0.9, sz: WZ - 0.85, sy: WH + 1.4, tx: x, tz: z, t: 0, dur: 0.38, real: false, hit: new Set(), sgRock: true }; api.shots.push(sh); setTimeout(() => { fx.explosion(x, z, 1.2); fx.chips(x, 0.4, z, COL.stone); AU.play("stonehit", { x, z, vol: 0.6, gap: 0.1 }); }, 380); }
  else if (k === "So") { const lvl = f[1]; for (let i = 0; i < 26; i++) fx.add.add((Math.random() - 0.5) * 6, WH + 0.6, WZ - 1.2 - Math.random() * 0.5, (Math.random() - 0.5) * 2, -2 - Math.random() * 3, -Math.random() * 3, 0.8, 0.5, 0.3, Math.random() < 0.5 ? COL.fire : COL.gold, 0, 1); setTimeout(() => { fx.explosion(0, WZ - 3.5, lvl === 2 ? 3.4 : 2.6); fx.ring(0, WZ - 3.4, 0.4, 3.6, 0.6, 0xff8030); for (let i = 0; i < 12; i++) fx.puff((Math.random() - 0.5) * 6, WZ - 2 - Math.random() * 4, 2, COL.smoke, 1); AU.play("flame", { x: 0, z: WZ - 3, vol: 0.9 }); AU.play("boom", { x: 0, z: WZ - 3 }); }, 260); fx.shake = Math.min(1, fx.shake + 0.4); if (f[2] === api.me) api.vib("impact", "heavy"); }
  else if (k === "Sp") { const L = sg.lad.find((q) => q.id === f[1]); if (!L) sg.lad.push({ id: f[1], x: f[2] / 10, push: 0, n: 0 }); AU.play("build", { x: f[2] / 10, z: WZ, vol: 0.5 }); if (Math.abs(f[2] / 10 - (api.P() ? api.P().x : 0)) < 10) api.toast("🪜 Лестница у стены! Встань рядом на стене — столкнёшь"); }
  else if (k === "Sl") { const L = sg.lad.find((q) => q.id === f[1]); if (L) { falling.push({ x: L.x, t: 0 }); sg.lad = sg.lad.filter((q) => q !== L); AU.play("collapse", { x: L.x, z: WZ, vol: 0.6 }); fx.puff(L.x, WZ - 3, 8, COL.dust, 0.8); if (f[2] === api.me) { fx.text(L.x, WH + 2, WZ, "Лестница сброшена!", "#ffe9a0", 18, 1.2); api.vib("impact", "medium"); } } }
  else if (k === "Sh") { const i = f[1], v = views && views.seg[i]; const x = segX(i); fx.chips(x + (Math.random() - 0.5) * 2.4, 1 + Math.random(), WZ - 1.3, i === GATE || (sg.seg[i] && sg.seg[i].lv === 1) ? COL.wood : COL.stone); AU.play("househit", { x, z: WZ, vol: 0.35, gap: 0.2 }); }
  else if (k === "Sm") { fx.explosion(0, WZ - WT - 0.4, 1.4); fx.chips(0, 1.2, WZ - 1.3, COL.wood); fx.shake = Math.min(1, fx.shake + 0.35); AU.play("boom2", { x: 0, z: WZ, vol: 0.7, gap: 0.3 }); }
  else if (k === "Sq") { api.msg("🐏 Таран!", "Его не взять стрелами — смола и камни ×3", 2600); AU.play("gong2", { vol: 0.8 }); }
  else if (k === "Sb") { if (sg.seg[f[1]]) sg.seg[f[1]].br = 1; updSegView(f[1]); const x = segX(f[1]); fx.explosion(x, WZ, 3); fx.puff(x, WZ, 30, COL.dust, 1.2); AU.play("collapse", { x, z: WZ }); api.msg("Пролом в стене!", "Заделай его камнем или отходи к цитадели", 2600, "bad"); api.vib("notify", "error"); }
  else if (k === "SB") { sg.gate.br = 1; updSegView(GATE); fx.explosion(0, WZ, 3.4); fx.puff(0, WZ, 30, COL.dust, 1.2); AU.play("collapse", { x: 0, z: WZ }); api.msg("Ворота выбиты!", "Орда идёт во двор — защищай цитадель!", 2800, "bad"); api.vib("notify", "error"); }
  else if (k === "Sf") { const i = f[1]; if (i === GATE) sg.gate.br = 0; else if (sg.seg[i]) sg.seg[i].br = 0; updSegView(i); fx.puff(segX(i), WZ, 14, COL.dust, 0.8); AU.play("build", { x: segX(i), z: WZ }); }
  else if (k === "Su") { const p = g.players[f[2]]; AU.play("build", { vol: 0.7 }); if (p && f[2] !== api.me) api.toast(`${p.name}: ${f[1]}`); else api.toast(`✔ ${f[1]}`); if (f[3] === "tw" || f[3] === "twu") updSlotView(f[4]); else if (f[4] >= 0) updSegView(f[4]); else updSegView(GATE); if (f[3] === "oil") updSegView(GATE); }
}
function towerShot(k, e) {
  const t = G().sg.slot[k]; if (!t) return; const TD = D.TURRETS[t.type], top = slotTop(k), y = top.y, ey = unitY(e) + 0.7;
  const sh = { kind: TD.proj || "arrow", x: top.x, y, z: top.z, life: 4, real: false, tgt: e.id, splash: TD.splash || 0, slow: TD.slow, burn: TD.burn, pierce: TD.pierce || 0, tower: 900 + k, sgSlot: k, hit: new Set(), homing: TD.proj !== "stone" && TD.proj !== "spear" };
  if (TD.proj === "stone" || TD.proj === "fire" || TD.proj === "venom") { sh.arc = true; sh.sx = top.x; sh.sz = top.z; sh.sy = y; sh.tx = e.x; sh.tz = e.z; sh.t = 0; sh.dur = Math.max(0.6, dist(top.x, top.z, e.x, e.z) / TD.speed); }
  else { const d = dist(top.x, top.z, e.x, e.z) || 1; sh.vx = (e.x - top.x) / d * TD.speed; sh.vz = (e.z - top.z) / d * TD.speed; sh.vy = (ey - y) / (d / TD.speed); sh.speed = TD.speed; if (TD.proj === "spear") sh.life = TD.range * 1.3 / TD.speed; }
  api.shots.push(sh);
  api.fx.muzzle(top.x, y, top.z, 0, 0, api.COL.spark);
  const v = views && views.slot[k]; if (v) { v.kick = 1; if (v.b.aim) v.b.aim.rotation.y = Math.atan2(e.x - top.x, e.z - top.z); }
  api.AU.play(TD.snd, { x: top.x, z: top.z, vol: 0.4, gap: 0.12 });
}
// подсказки и полоски поверх 3D
export function overlay(octx, scr, bar, me) {
  const sg = G().sg; if (!sg || !views) return;
  for (let i = 0; i < NSEG; i++) {
    const s = i === GATE ? sg.gate : sg.seg[i]; if (!s || s.br || s.hp >= s.max * 0.999) continue;
    const p = scr(segX(i), WH + 1.3, WZ - 0.6); if (!p.on) continue;
    const k = s.hp / s.max; bar(p.x, p.y, i === GATE ? 54 : 40, 5, k, k > 0.5 ? "#8fd16a" : k > 0.25 ? "#ffc14d" : "#ff5a4a");
  }
  for (const L of sg.lad) { const p = scr(L.x, WH + 1.2, WZ - 1.3); if (!p.on) continue; octx.font = "20px sans-serif"; octx.textAlign = "center"; octx.fillText("🪜", p.x, p.y); if (L.push > 0) bar(p.x, p.y + 8, 34, 5, L.push / 1.1, "#ffe9a0"); }
  for (const e of G().enemies.values()) if (e.ram) { const p = scr(e.x, 3.2, e.z); if (p.on) { const k = (e.hpPct != null ? e.hpPct / 100 : e.hp / e.max); bar(p.x, p.y, 56, 6, k, "#ff6a4a"); octx.font = "16px sans-serif"; octx.textAlign = "center"; octx.fillText("🐏", p.x, p.y - 6); } }
}
export function hudText() {
  const sg = G().sg; if (!sg) return "";
  let alive = 0; for (const e of G().enemies.values()) if (e.hz) alive++;
  return `👹 ${alive + Math.max(0, sg.left)}`;
}
export function dispose() { if (views) { for (const v of views.rams.values()) world && world.remove(v.g); } views = null; falling.length = 0; }
// ================= НАГРАДЫ =================
export const SIEGE_SPECIAL = [
  { banner: "citadel", txt: "Стяг цитадели" },
  { outfit: "defender", txt: "Доспех защитника" },
  { tskin: "citadel", txt: "Облик башен «Цитадель»" },
  { amulet: "guard", txt: "Амулет «Страж»" }
];
export function siegeReward(slv, year) {
  const k = 1 + 0.25 * Math.max(0, (year || 1) - 1);
  return { gems: Math.round((30 + 14 * slv) * k), res: { c: Math.round((50 + 30 * slv) * k), w: Math.round((40 + 20 * slv) * k), s: Math.round((40 + 22 * slv) * k) }, special: SIEGE_SPECIAL[slv - 1] || null, yearK: k };
}
