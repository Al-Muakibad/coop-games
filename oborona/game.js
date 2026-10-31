/* Аванпост — кооперативная 3D-оборона. three.js + модели KayKit (CC0).
   Онлайн: хозяин комнаты считает монстров, волны, дома, башни, монеты; гости шлют свои координаты, попадания и действия. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { A, loadAll, makeChar, cloneWorld, cloneWeapon, hueMaterial } from "./assets.js";
import { FX, COL } from "./fx.js";
import * as D from "./data.js";

const T = window.TG, $ = (id) => document.getElementById(id);
const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
const Sfx = window.Sfx || { play() {} };
const BOT = "new_rpg_yar_bot", GAME = "oborona";
const PI2 = Math.PI * 2, clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, k) => a + (b - a) * k;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

// ---------- ссылки-приглашения: свой бот у этой игры ----------
if (window.Net) Net.inviteLink = (game, id) => `https://t.me/${BOT}?startapp=r${id}`;
if (T) T.gameLink = (game, param) => `https://t.me/${BOT}` + (param ? `?startapp=${param}` : "");   // «Позвать друга» и прочие ссылки — тоже на бота игры
function readInvite() {
  const sp = new URLSearchParams(location.search), tg = T && T.tg;
  let hashP = null; try { hashP = new URLSearchParams(location.hash.slice(1)).get("tgWebAppStartParam"); } catch (_) {}
  const list = [sp.get("c"), sp.get("tgWebAppStartParam"), sp.get("startapp"), hashP, tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param];
  for (const c of list) { const m = c && /^(?:oborona-)?r([a-z0-9]{6})$/.exec(c); if (m) return m[1]; }
  return null;
}

// ================= РЕНДЕР =================
const canvas = $("gl"), ov = $("ov"), octx = ov.getContext("2d");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
const DAY = { sky: new THREE.Color(0xa9d6ec), hemi: 1.25, sun: 2.4, sunC: new THREE.Color(0xfff0d2) };
const NIGHT = { sky: new THREE.Color(0x3d4270), hemi: 0.6, sun: 1.25, sunC: new THREE.Color(0xff9a6a) };
scene.background = DAY.sky.clone();
scene.fog = new THREE.Fog(DAY.sky.clone(), 34, 80);
const hemi = new THREE.HemisphereLight(0xe2f3ff, 0x587a3a, DAY.hemi); scene.add(hemi);
const sun = new THREE.DirectionalLight(DAY.sunC.clone(), DAY.sun);
sun.position.set(16, 30, 14); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 90 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);
const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 160);
const fx = new FX(scene);

// качество графики: 2 высокое, 1 среднее, 0 низкое; «авто» снижает при низком FPS
const mobile = matchMedia("(pointer:coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
let qAuto = true, quality = mobile ? 1 : 2;
try { const q = localStorage.getItem("ob_q"); if (q != null && q !== "a") { qAuto = false; quality = +q; } } catch (_) {}
let composer = null, bloom = null, W = 1, H = 1, DPR = 1;
function applyQuality() {
  DPR = Math.min(devicePixelRatio || 1, [1, 1.5, 2][quality]);
  if (quality === 0) DPR = Math.min(DPR, 1);
  renderer.setPixelRatio(DPR);
  const sz = [0, 1024, 2048][quality];
  renderer.shadowMap.enabled = quality > 0;
  if (sz && sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined && o.isMesh) o.material.needsUpdate = true; });
  renderer.shadowMap.needsUpdate = true;
  if (quality > 0) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality === 2 ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.92);
    composer.addPass(bloom); composer.addPass(new OutputPass());
  } else composer = null;
  fx.quality = [0.5, 0.8, 1][quality];
  resize();
  const lab = $("q-btn"); if (lab) lab.textContent = (qAuto ? "авто · " : "") + ["низкая", "средняя", "высокая"][quality];
}
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(DPR); composer.setSize(W, H); if (bloom) bloom.resolution.set(W * DPR / 2, H * DPR / 2); }
  const od = Math.min(devicePixelRatio || 1, 2); ov.width = W * od; ov.height = H * od; octx.setTransform(od, 0, 0, od, 0, 0);
  fx.add.mat.uniforms.scale.value = fx.norm.mat.uniforms.scale.value = H * DPR * 0.6;
}
addEventListener("resize", resize);

// ================= ИГРОВОЕ СОСТОЯНИЕ =================
let room = null, cfg = null, me = 0, phase = "menu";   // menu | play | over
const G = { t: 0, ph: "build", timer: 0, wave: 0, players: [], houses: [], enemies: new Map(), drops: new Map(), nodes: [], merchant: null, F: [], over: false, eid: 1, did: 1, queue: [], spawnT: 0, bossId: 0, stats: {} };
const isHost = () => !room || room.isHost;
const send = (t, d) => { if (room) room.send(t, d); };
const sendFast = (t, d) => { if (room) room.sendFast(t, d); };
const P = () => G.players[me];
const world = new THREE.Group(); scene.add(world);
let obstacles = [];          // {x,z,r}

// ---------- вспомогательная геометрия ----------
const GET = [THREE.BufferAttribute.prototype.getX, THREE.BufferAttribute.prototype.getY, THREE.BufferAttribute.prototype.getZ, THREE.BufferAttribute.prototype.getW];
function toFloatGeo(g, m) {
  const out = new THREE.BufferGeometry();
  for (const a of ["position", "normal", "uv"]) {
    const at = g.getAttribute(a); if (!at) continue;
    const arr = new Float32Array(at.count * at.itemSize);
    for (let i = 0; i < at.count; i++) for (let j = 0; j < at.itemSize; j++) arr[i * at.itemSize + j] = j === 0 ? at.getX(i) : j === 1 ? at.getY(i) : j === 2 ? at.getZ(i) : at.getW(i);
    out.setAttribute(a, new THREE.BufferAttribute(arr, at.itemSize));
  }
  out.setIndex(g.index ? Array.from(g.index.array) : null);
  if (m) out.applyMatrix4(m);
  const N = out.getAttribute("normal");
  if (N) for (let i = 0; i < N.count; i++) { const x = N.getX(i), y = N.getY(i), z = N.getZ(i), l = Math.hypot(x, y, z); if (!(l > 1e-4)) N.setXYZ(i, 0, 1, 0); }
  return out;
}
// склеивает все статичные объекты с общим материалом в одну сетку (меньше вызовов отрисовки)
function bake(objs, group) {
  const by = new Map();
  for (const o of objs) {
    o.updateMatrixWorld(true);
    o.traverse((c) => { if (c.isMesh) { const k = c.material.uuid; if (!by.has(k)) by.set(k, { mat: c.material, g: [] }); by.get(k).g.push(toFloatGeo(c.geometry, c.matrixWorld)); } });
  }
  for (const { mat, g } of by.values()) {
    const merged = mergeGeometries(g, false); if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
}
function noise2(x, z) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), u), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
}
function blobTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const BLOB = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
const BLOBGEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function blob(r) { const m = new THREE.Mesh(BLOBGEO, BLOB); m.scale.set(r * 2.2, 1, r * 2.2); m.position.y = 0.03; m.renderOrder = 1; return m; }

// ================= МИР =================
const HUES = [0, -0.6, -0.2, -0.5, 0.13, 0.33];     // сдвиг оттенка «синего» под цвета игроков
function hueFor(i) { const c = new THREE.Color(cfg ? cfg.players[i].color : "#3b82f6"), hsl = {}; c.getHSL(hsl); return hsl.h - 0.6; }
let hexMat = null;
function houseSpots(n) {
  if (n === 1) return [{ x: 0, z: 0 }];
  const r = 9 + n * 0.8;
  return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + i * PI2 / n + (n === 2 ? Math.PI / 2 : 0); return { x: Math.cos(a) * r, z: Math.sin(a) * r }; });
}
function merchantSpot(n) { return n === 1 ? { x: 0, z: 8.5 } : { x: 0, z: 1.5 }; }
let treeInst = [], grassMesh = null, nodeViews = [];
function buildWorld(seed, n) {
  world.clear(); obstacles = []; treeInst = []; nodeViews = [];
  const r = rng(seed);
  hexMat = null; A.world.building_home_A_blue.traverse((o) => { if (o.isMesh && !hexMat) hexMat = o.material; });
  const spots = houseSpots(n), msp = merchantSpot(n);
  // земля: трава разных оттенков, утоптанные площадки у домов, холмы за краем
  const GS = 150, seg = 110, geo = new THREE.PlaneGeometry(GS, GS, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(0x6fa83f), cB = new THREE.Color(0x8fc04f), cC = new THREE.Color(0x4f8a35), dirt = new THREE.Color(0xb39566), path = new THREE.Color(0xa58a5c), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), rr = Math.hypot(x, z);
    const nz = noise2(x * 0.08, z * 0.08), nz2 = noise2(x * 0.3 + 10, z * 0.3);
    tmp.copy(cA).lerp(cB, nz).lerp(cC, clamp(nz2 - 0.45, 0, 1) * 0.8);
    let d = 1e9; for (const s of spots) d = Math.min(d, dist(x, z, s.x, s.z));
    const dm = dist(x, z, msp.x, msp.z);
    let k = clamp(1 - (d - 3.6) / 2.2, 0, 1) * 0.85; k = Math.max(k, clamp(1 - (dm - 2) / 2, 0, 1) * 0.6);
    // тропинки от домов к центру
    if (n > 1) for (const s of spots) { const L = Math.hypot(s.x, s.z), t = clamp((x * s.x + z * s.z) / (L * L), 0, 1), px = s.x * t, pz = s.z * t; const dd = dist(x, z, px, pz); k = Math.max(k, clamp(1 - (dd - 0.6) / 0.9, 0, 1) * 0.55 * (0.7 + 0.3 * noise2(x, z))); }
    tmp.lerp(k > 0.5 ? dirt : path, k);
    let y = 0;
    if (rr > D.MAP_R + 1) { const e = rr - D.MAP_R - 1; y = Math.min(6, e * e * 0.035) * (0.6 + 0.8 * noise2(x * 0.1, z * 0.1)); tmp.lerp(cC, clamp(e / 14, 0, 0.5)); }
    pos.setY(i, y);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true; world.add(ground);

  // декор вокруг поля: горы, лес, холмы — запекаем в одну сетку
  const deco = [];
  const place = (name, x, z, s, ry) => { const o = cloneWorld(name); o.position.set(x, 0, z); o.scale.setScalar(s); o.rotation.y = ry; deco.push(o); return o; };
  for (let i = 0; i < 34; i++) {
    const a = i / 34 * PI2 + r() * 0.1, rr = D.MAP_R + 7 + r() * 9;
    const kind = ["mountain_A_grass_trees", "mountain_B_grass_trees", "mountain_C_grass", "hills_A_trees", "hills_B_trees"][Math.floor(r() * 5)];
    const o = place(kind, Math.cos(a) * rr, Math.sin(a) * rr, 5 + r() * 3, r() * PI2); o.position.y = -0.3;
  }
  for (let i = 0; i < 46; i++) { const a = r() * PI2, rr = D.MAP_R + 1.5 + r() * 5; place(["trees_A_large", "trees_B_medium", "trees_A_small"][Math.floor(r() * 3)], Math.cos(a) * rr, Math.sin(a) * rr, 2.6 + r() * 1.2, r() * PI2); }
  // центр: колодец, мельница, ящики
  const well = n === 1 ? { x: -6.5, z: 6 } : { x: 2.6, z: -1.2 };
  place("building_well_blue", well.x, well.z, 2.2, 0.4); obstacles.push({ x: well.x, z: well.z, r: 0.9 });
  const mill = n === 1 ? { x: 7, z: -9 } : { x: -3.2, z: -2.6 };
  place("building_windmill_blue", mill.x, mill.z, 2.4, 2.2); obstacles.push({ x: mill.x, z: mill.z, r: 1.4 });
  // реквизит у каждого дома
  spots.forEach((s, i) => {
    const ang = Math.atan2(s.z, s.x) + Math.PI + 0.9;
    const px = s.x + Math.cos(ang) * 6.1, pz = s.z + Math.sin(ang) * 6.1;
    place("resource_lumber", px, pz, 2.4, ang); place("barrel", px + 0.9, pz - 0.8, 2.4, 0); place("crate_A_big", px - 0.7, pz + 0.9, 2.4, 0.5);
    obstacles.push({ x: px, z: pz, r: 0.9 });
    const bx = s.x + Math.cos(ang - 1.8) * 6.2, bz = s.z + Math.sin(ang - 1.8) * 6.2;
    place("resource_stone", bx, bz, 2.4, 1); place("wheelbarrow", bx + 1, bz, 2.4, 2); obstacles.push({ x: bx, z: bz, r: 0.8 });
  });
  for (let i = 0; i < 14; i++) { const a = r() * PI2, rr = 8 + r() * 24; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (spots.some((s) => dist(x, z, s.x, s.z) < 7)) continue; place(["rock_single_A", "rock_single_B", "rock_single_D"][i % 3], x, z, 3 + r() * 2, r() * PI2); }
  const decoG = new THREE.Group(); bake(deco, decoG); world.add(decoG);
  // облака над горами
  for (let i = 0; i < 7; i++) { const a = r() * PI2, rr = D.MAP_R + 14 + r() * 8, c = cloneWorld(r() < 0.5 ? "cloud_big" : "cloud_small"); c.position.set(Math.cos(a) * rr, 9 + r() * 4, Math.sin(a) * rr); c.scale.setScalar(2.5 + r() * 2); c.userData.cloud = 0.2 + r() * 0.3; world.add(c); }

  // ресурсы: деревья и камни (общие для всех — одинаковый seed)
  G.nodes = [];
  const ok = (x, z, pad) => Math.hypot(x, z) < D.MAP_R - 2 && spots.every((s) => dist(x, z, s.x, s.z) > 7.2) && dist(x, z, msp.x, msp.z) > 4 && dist(x, z, well.x, well.z) > 3 && dist(x, z, mill.x, mill.z) > 3.5 && G.nodes.every((q) => dist(x, z, q.x, q.z) > pad) && obstacles.every((o) => dist(x, z, o.x, o.z) > o.r + 1.5);
  const want = { tree: 26 + 5 * n, rock: 11 + 3 * n };
  for (const kind of ["tree", "rock"]) {
    let made = 0;
    // по паре штук недалеко от каждого дома, чтобы было с чего начать
    for (const s of spots) for (let k = 0; k < (kind === "tree" ? 3 : 2); k++) for (let tries = 0; tries < 60; tries++) {
      const a = r() * PI2, rr = 8 + r() * 4, x = s.x + Math.cos(a) * rr, z = s.z + Math.sin(a) * rr;
      if (ok(x, z, 2.4)) { G.nodes.push({ kind, x, z, v: Math.floor(r() * 2), s: 0.9 + r() * 0.3, ry: r() * PI2, amt: D.RES[kind].amount, regrow: 0 }); made++; break; }
    }
    for (let tries = 0; made < want[kind] && tries < 3000; tries++) {
      const a = r() * PI2, rr = (n === 1 ? 7 : 6) + Math.sqrt(r()) * 25, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (ok(x, z, 2.4)) { G.nodes.push({ kind, x, z, v: Math.floor(r() * 2), s: 0.85 + r() * 0.35, ry: r() * PI2, amt: D.RES[kind].amount, regrow: 0 }); made++; }
    }
  }
  buildNodeViews();
  // трава (качается на ветру) и цветы
  buildGrass(quality === 0 ? 350 : quality === 1 ? 700 : 1100, spots);
  renderer.shadowMap.needsUpdate = true;
}

function instFrom(name, count) {
  // модель → набор InstancedMesh (по одному на каждую её часть)
  const src = A.world[name], parts = [];
  src.updateMatrixWorld(true);
  src.traverse((o) => { if (o.isMesh) { const im = new THREE.InstancedMesh(o.geometry, o.material, count); im.castShadow = true; im.receiveShadow = true; im.userData.local = o.matrixWorld.clone(); im.count = count; parts.push(im); world.add(im); } });
  return parts;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function setInst(parts, i, x, y, z, ry, s, sx, sz) {
  _q.setFromEuler(_e.set(sx || 0, ry, sz || 0)); _m.compose(_v.set(x, y, z), _q, _s.set(s, s, s));
  for (const p of parts) { const mm = new THREE.Matrix4().multiplyMatrices(_m, p.userData.local); p.setMatrixAt(i, mm); p.instanceMatrix.needsUpdate = true; }
}
const RES_MODELS = { tree: [["tree_single_A", "tree_single_A_cut"], ["tree_single_B", "tree_single_B_cut"]], rock: [["rock_single_E", null], ["rock_single_C", null]] };
const RES_SCALE = { tree: 3.1, rock: 5.2 };
let resInst = {};
function buildNodeViews() {
  resInst = {};
  const groups = {};
  G.nodes.forEach((nd, i) => { const k = nd.kind + nd.v; (groups[k] = groups[k] || []).push(i); nd.slot = groups[k].length - 1; nd.gk = k; });
  for (const k in groups) {
    const kind = k.slice(0, -1), v = +k.slice(-1), [full, cut] = RES_MODELS[kind][v];
    resInst[k] = { full: instFrom(full, groups[k].length), cut: cut ? instFrom(cut, groups[k].length) : null };
  }
  G.nodes.forEach((nd) => { nd.shake = 0; nd.shown = -1; updNode(nd); });
}
function updNode(nd) {
  const ri = resInst[nd.gk], up = nd.amt > 0, s = RES_SCALE[nd.kind] * nd.s;
  const sh = nd.shake > 0 ? Math.sin(nd.shake * 40) * 0.08 * nd.shake : 0;
  const grow = nd.kind === "tree" && up && nd.grow != null ? nd.grow : 1;
  setInst(ri.full, nd.slot, nd.x, 0, nd.z, nd.ry, up ? s * (nd.kind === "rock" ? 0.55 + 0.45 * nd.amt / D.RES.rock.amount : grow) : 0.0001, sh, sh * 0.6);
  if (ri.cut) setInst(ri.cut, nd.slot, nd.x, 0, nd.z, nd.ry, up ? 0.0001 : s, 0, 0);
  if (nd.shown !== up) { nd.shown = up; renderer.shadowMap.needsUpdate = true; }
}
function buildGrass(count, spots) {
  const g = new THREE.BufferGeometry(), P3 = [], C3 = [];
  for (let b = 0; b < 4; b++) {
    const a = b / 4 * Math.PI + 0.3, w = 0.07, h = 0.38 + (b % 2) * 0.16, ox = Math.cos(a) * 0.08, oz = Math.sin(a) * 0.08, lean = 0.12;
    P3.push(ox - Math.sin(a) * w, 0, oz + Math.cos(a) * w, ox + Math.sin(a) * w, 0, oz - Math.cos(a) * w, ox * 3 + lean, h, oz * 3);
    C3.push(0.22, 0.42, 0.12, 0.22, 0.42, 0.12, 0.62, 0.85, 0.32);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(P3, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C3, 3)); g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = grassT;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uT;").replace("#include <begin_vertex>", `#include <begin_vertex>
      vec4 wp = instanceMatrix * vec4(0.,0.,0.,1.); float sw = sin(uT * 1.7 + wp.x * 0.35 + wp.z * 0.25) * 0.5 + sin(uT * 3.1 + wp.x) * 0.15;
      transformed.x += sw * position.y * 0.35; transformed.z += sw * position.y * 0.2;`);
  };
  grassMesh = new THREE.InstancedMesh(g, mat, count); grassMesh.receiveShadow = true;
  const col = new THREE.Color();
  let k = 0;
  for (let i = 0; i < count * 3 && k < count; i++) {
    const a = Math.random() * PI2, rr = Math.sqrt(Math.random()) * (D.MAP_R + 3), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (spots.some((s) => dist(x, z, s.x, s.z) < 5.2)) continue;
    if (noise2(x * 0.15, z * 0.15) < 0.35 && Math.random() < 0.7) continue;
    _m.compose(_v.set(x, 0, z), _q.setFromEuler(_e.set(0, Math.random() * PI2, 0)), _s.setScalar(0.8 + Math.random() * 1.1));
    grassMesh.setMatrixAt(k, _m);
    const fl = Math.random();
    grassMesh.setColorAt(k, fl < 0.04 ? col.set(0xffe066) : fl < 0.07 ? col.set(0xff9ecf) : fl < 0.09 ? col.set(0xffffff) : col.setHSL(0.26 + Math.random() * 0.05, 0.55, 0.5 + Math.random() * 0.2));
    k++;
  }
  grassMesh.count = k; world.add(grassMesh);
}
const grassT = { value: 0 };

// ---------- дома ----------
const WALL_SEG = 11;
function makeHouseView(h) {
  const g = new THREE.Group(); g.position.set(h.x, 0, h.z); world.add(g);
  h.view = { g, model: null, lv: -1, wall: -1, segs: [], turrets: [], flag: null, alive: true, slots: [], shake: 0 };
  // места под башни — едва заметные круги
  const ringG = new THREE.RingGeometry(0.7, 0.9, 28).rotateX(-Math.PI / 2);
  for (let s = 0; s < D.SLOTS; s++) {
    const p = slotPos(h, s), m = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.35, depthWrite: false }));
    m.position.set(p.x - h.x, 0.04, p.z - h.z); g.add(m); h.view.slots.push(m);
  }
  updHouseView(h);
}
function slotPos(h, s) { const base = Math.atan2(-h.z, -h.x) || Math.PI / 2, a = base + Math.PI / D.SLOTS + s * PI2 / D.SLOTS; return { x: h.x + Math.cos(a) * D.SLOT_R, z: h.z + Math.sin(a) * D.SLOT_R }; }
function tint(obj, hue) { obj.traverse((o) => { if (o.isMesh) o.material = hueMaterial(o.material, hue); }); return obj; }
function updHouseView(h) {
  const v = h.view; if (!v) return;
  const hue = hueFor(h.owner);
  const lvKey = h.alive ? h.lv : -2;
  if (v.lv !== lvKey) {
    if (v.model) { v.g.remove(v.model); fx.puff(h.x, h.z, 24, COL.dust, 0.9); }
    const L = D.HOUSE_LV[h.lv];
    v.model = h.alive ? tint(cloneWorld(L.model), hue) : cloneWorld("building_destroyed");
    v.model.scale.setScalar(h.alive ? L.scale : 2.6);
    v.model.rotation.y = Math.atan2(-h.x, -h.z) || 0;      // фасадом к центру
    v.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    v.g.add(v.model);
    if (!v.flag) { v.flag = tint(cloneWorld("flag_blue"), hue); v.flag.scale.setScalar(4); v.g.add(v.flag); }
    v.flag.position.set(-1.9, 0, 1.2); v.flag.visible = h.alive;
    if (v.lv >= 0 && h.alive && v.lv !== -2) { v.pop = 1; fx.levelup(h.x, h.z); }
    v.lv = lvKey; renderer.shadowMap.needsUpdate = true;
  }
  const wl = h.alive && h.whp > 0 ? h.wall : 0;
  if (v.wall !== wl) {
    v.segs.forEach((s) => v.g.remove(s)); v.segs = [];
    if (wl > 0) {
      const L = D.WALL_LV[wl];
      for (let i = 0; i < WALL_SEG; i++) {
        const a = i / WALL_SEG * PI2, seg = new THREE.Group(), m = cloneWorld(L.model);
        if (L.model === "wall_straight") { m.scale.set(0.85, 1.1, 1); m.rotation.y = Math.PI / 2; seg.scale.setScalar(1.0); }
        else { m.position.x = 1; seg.scale.setScalar(1.45); }
        m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        seg.add(m); seg.position.set(Math.cos(a) * D.WALL_R, 0, Math.sin(a) * D.WALL_R); seg.rotation.y = -a;
        v.g.add(seg); v.segs.push(seg);
      }
    }
    if (v.wall > 0 && wl === 0) { for (let i = 0; i < 6; i++) fx.chips(h.x + Math.cos(i) * D.WALL_R, 0.5, h.z + Math.sin(i) * D.WALL_R, COL.wood); fx.puff(h.x, h.z, 16, COL.dust, 0.8); }
    v.wall = wl; renderer.shadowMap.needsUpdate = true;
  }
  for (let s = 0; s < D.SLOTS; s++) {
    const t = h.alive ? h.turrets[s] : null, key = t ? t.type + t.lv : "", cur = v.turrets[s];
    if ((cur && cur.key) === key) continue;
    if (cur && cur.obj) v.g.remove(cur.obj);
    v.turrets[s] = { key, obj: null };
    v.slots[s].visible = !t && h.alive;
    if (t) {
      const TD = D.TURRETS[t.type], p = slotPos(h, s);
      const o = TD.hue != null ? cloneWorld(TD.model) : tint(cloneWorld(TD.model), hue);
      if (TD.hue != null) o.traverse((c) => { if (c.isMesh) c.material = hueMaterial(c.material, TD.hue, 0.6); });
      o.scale.setScalar(TD.scale * (1 + 0.07 * (t.lv - 1))); o.position.set(p.x - h.x, 0, p.z - h.z); o.rotation.y = Math.atan2(p.x - h.x, p.z - h.z);
      o.traverse((c) => { if (c.isMesh) c.castShadow = true; });
      // звёздочки уровня: флажки
      for (let k = 1; k < t.lv; k++) { const f = tint(cloneWorld("flag_blue"), hue); f.scale.setScalar(2.2 / (TD.scale)); f.position.set(-0.25 + k * 0.17, TD.model.includes("tower_A") ? 1.3 : 1.1, 0.25); o.add(f); }
      v.g.add(o); v.turrets[s].obj = o; v.turrets[s].pop = 1;
      fx.puff(p.x, p.z, 14, COL.dust, 0.7); fx.sparkle(p.x, 2, p.z, COL.gold, 10);
    }
    renderer.shadowMap.needsUpdate = true;
  }
}

// ================= ПЕРСОНАЖИ =================
const playerViews = [], enemyViews = new Map();
const HERO_HAND = "handslotr";
function makePlayerView(p) {
  const hero = D.HEROES[p.idx % D.HEROES.length];
  const c = makeChar(hero);
  c.obj.scale.setScalar(0.72);
  const root = new THREE.Group(); root.add(c.obj); root.add(blob(0.5)); world.add(root);
  // кольцо под ногами цвета игрока
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.position.y = 0.04; root.add(ring);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  orb.visible = false; root.add(orb);
  const v = { p, c, root, orb, ring, hero, wpn: null, wkey: "", arm: "", base: null, upper: null, recoil: 0, hurt: 0, deadShown: false, pos: new THREE.Vector3(p.x, 0, p.z) };
  // материалы одежды отдельно — чтобы перекрашивать броню
  v.cloth = c.meshes.filter((m) => /Body|Arm|Helmet|Hat|Cape/i.test(m.name)).map((m) => { m.material = m.material.clone(); return m; });
  c.meshes.forEach((m) => { if (!v.cloth.includes(m)) m.material = m.material.clone(); });
  v.allMats = c.meshes.map((m) => m.material);
  playerViews[p.idx] = v;
  updGear(v);
  return v;
}
function updGear(v) {
  const p = v.p, W = D.WEAPONS[p.wpn] || D.WEAPONS.crossbow;
  if (v.wkey !== p.wpn) {
    const hand = v.c.bone(HERO_HAND);
    if (v.wpn) v.wpn.parent.remove(v.wpn);
    v.wpn = cloneWeapon(W.model);
    if (W.tint) v.wpn.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(W.tint); } });
    if (hand) hand.add(v.wpn);
    v.wkey = p.wpn;
  }
  if (v.arm !== p.arm) {
    const a = D.ARMOR[p.arm] || D.ARMOR.none;
    v.cloth.forEach((m) => m.material.color.set(a.tint || 0xffffff));
    v.arm = p.arm;
  }
  const am = D.AMULETS[p.amu];
  v.orb.visible = !!(am && am.color);
  if (v.orb.visible) v.orb.material.color.set(am.color).multiplyScalar(2.2);
}
function playAnim(v, slot, name, fade) {
  if (v[slot] === name) return;
  const old = v[slot] && v.c.act(v[slot]);
  v[slot] = name;
  if (old) old.fadeOut(fade || 0.2);
  if (name) { const a = v.c.act(name); if (a) { a.reset(); a.setEffectiveWeight(1); a.fadeIn(fade || 0.2); a.play(); } }
}
function playOnce(v, name, ts) {
  const a = v.c.act(name); if (!a) return;
  a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = ts || 1; a.fadeIn(0.1); a.play();
  return a;
}

// ---------- монстры ----------
const MON_ANIM = {
  walker: { move: "Walking_D_Skeletons", atk: "1H_Melee_Attack_Chop" },
  runner: { move: "Running_C", atk: "Unarmed_Melee_Attack_Punch_A" },
  spitter: { move: "Walking_A", atk: "Spellcast_Shoot" },
  exploder: { move: "Running_A", atk: "Unarmed_Melee_Attack_Punch_A" },
  brute: { move: "Walking_A", atk: "2H_Melee_Attack_Chop" },
  boss: { move: "Walking_D_Skeletons", atk: "2H_Melee_Attack_Chop" }
};
function makeEnemyView(e) {
  const M = D.MON[e.type], c = makeChar(M.model);
  c.obj.scale.setScalar(M.scale);
  const root = new THREE.Group(); root.add(c.obj); root.add(blob(M.r)); world.add(root);
  const mats = [];
  c.meshes.forEach((m) => { m.material = m.material.clone(); mats.push(m.material); });
  if (M.wpn) { const h = c.bone("handslotr"); if (h) h.add(cloneWeapon(M.wpn)); }
  if (M.shield) { const h = c.bone("handslotl"); if (h) h.add(cloneWeapon(M.shield)); }
  if (e.type === "exploder") { mats.forEach((m) => m.color.set(0xff8a7a)); const b = cloneWorld("barrel"); b.scale.setScalar(4.2); b.position.set(0, 0.2, -0.6); const ch = c.bone("chest"); if (ch) ch.add(b); }
  if (e.type === "boss") mats.forEach((m) => m.color.set(0xd9c2ff));
  if (e.type === "brute") mats.forEach((m) => m.color.set(0xd6d0c4));
  const v = { e, c, root, mats, base: null, flash: 0, dead: 0, spawn: 0 };
  root.position.set(e.x, 0, e.z); root.rotation.y = e.ry || 0;
  enemyViews.set(e.id, v);
  if (e.spawning) { const a = playOnce(v, "Spawn_Ground_Skeletons", 2.4); v.spawn = 1.6; fx.puff(e.x, e.z, 10, COL.dust, 0.6); }
  return v;
}
function killEnemyView(id) {
  const v = enemyViews.get(id); if (!v || v.dead) return;
  v.dead = 0.001;
  const e = v.e, M = D.MON[e.type];
  playAnim(v, "base", null, 0.1);
  const a = playOnce(v, v.c.act("Death_C_Skeletons") ? "Death_C_Skeletons" : "Death_A", 1.3);
  fx.death(e.x, e.z, e.type === "exploder" ? COL.red : COL.bone);
  if (M.boss) { fx.explosion(e.x, e.z, 4); fx.text(e.x, 3, e.z, "БОСС ПОВЕРЖЕН!", "#ffd34d", 26, 1.8); }
}
function removeEnemyView(id) { const v = enemyViews.get(id); if (v) { world.remove(v.root); enemyViews.delete(id); } }

// ---------- купец ----------
let merchView = null;
function updMerchantView() {
  const on = !!G.merchant;
  if (on && !merchView) {
    const sp = merchantSpot(G.players.length), c = makeChar("merchant");
    c.obj.scale.setScalar(0.62);
    const root = new THREE.Group(); root.position.set(sp.x, 0, sp.z); root.add(c.obj); root.add(blob(0.5));
    const tent = cloneWorld("tent"); tent.scale.setScalar(3.2); tent.position.set(-1.6, 0, -1.4); tent.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const cr = cloneWorld("crate_open"); cr.scale.setScalar(3); cr.position.set(1.2, 0, -0.3);
    const sk = cloneWorld("sack"); sk.scale.setScalar(4); sk.position.set(0.9, 0, 0.6);
    root.add(tent, cr, sk); world.add(root);
    c.obj.rotation.y = 0.3;
    merchView = { root, c, base: null };
    playAnim(merchView, "base", "Idle");
    fx.puff(sp.x, sp.z, 24, COL.gold, 0.6); fx.sparkle(sp.x, 1.5, sp.z, COL.gold, 20);
    renderer.shadowMap.needsUpdate = true;
  } else if (!on && merchView) {
    const p = merchView.root.position; fx.puff(p.x, p.z, 20, COL.dust, 0.7);
    world.remove(merchView.root); merchView = null; renderer.shadowMap.needsUpdate = true;
  }
}

// ================= СНАРЯДЫ =================
const PROJ = {
  bolt:  { geo: new THREE.CylinderGeometry(0.07, 0.07, 0.95, 6).rotateX(Math.PI / 2), col: [3.0, 2.6, 1.6], trail: COL.spark, size: 0.34, hit: COL.spark },
  heavy: { geo: new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6).rotateX(Math.PI / 2), col: [2.6, 1.4, 3.6], trail: COL.purple, size: 0.4, hit: COL.purple },
  spark: { geo: new THREE.IcosahedronGeometry(0.2, 1), col: [1.4, 2.6, 4.0], trail: COL.blue, size: 0.45, hit: COL.blue },
  fire:  { geo: new THREE.IcosahedronGeometry(0.28, 1), col: [4.0, 1.8, 0.5], trail: COL.fire, size: 0.6, hit: COL.fire },
  arrow: { geo: new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5).rotateX(Math.PI / 2), col: [1.8, 1.6, 1.2], trail: COL.white, size: 0.18, hit: COL.spark },
  stone: { geo: new THREE.DodecahedronGeometry(0.32, 0), col: [0.55, 0.52, 0.5], trail: COL.dust, size: 0.3, hit: COL.stone, lit: true },
  ice:   { geo: new THREE.IcosahedronGeometry(0.24, 0), col: [1.6, 3.2, 4.0], trail: COL.ice, size: 0.4, hit: COL.ice },
  acid:  { geo: new THREE.IcosahedronGeometry(0.26, 1), col: [1.6, 3.6, 0.6], trail: COL.acid, size: 0.5, hit: COL.acid }
};
for (const k in PROJ) {
  const pr = PROJ[k];
  const mat = pr.lit ? new THREE.MeshLambertMaterial({ color: new THREE.Color(...pr.col) }) : new THREE.MeshBasicMaterial({ color: new THREE.Color(...pr.col), toneMapped: false });
  pr.mesh = new THREE.InstancedMesh(pr.geo, mat, 160); pr.mesh.count = 0; pr.mesh.frustumCulled = false; scene.add(pr.mesh);
}
let shots = [];   // {kind, x,y,z, vx,vy,vz, life, real, dmg, pierce, bounce, splash, crit, frost, owner, tgt, hit:Set, arc, tx,tz, t, dur, team}

// ================= СТАРТ / СЕТЬ =================
function newPlayer(c, i, spots) {
  const h = spots[i % spots.length], a = Math.atan2(-h.z, -h.x) || Math.PI / 2;
  return { idx: i, id: c.id, name: c.name, color: c.color, x: h.x + Math.cos(a) * 3.5, z: h.z + Math.sin(a) * 3.5, ry: 0, hp: 100, alive: true, downT: 0, wallet: { c: 15, w: 10, s: 5 },
    xp: 0, lvl: 1, perks: {}, wpn: "crossbow", arm: "none", amu: "none", pot: 1, kills: 0, dmg: 0, built: 0, ready: false, house: i, tgt: 0, mv: 0, seq: 0, present: true, gn: -1 };
}
function begin(c) {
  cfg = c.cfg; room = c.room; me = cfg.me || 0;
  ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
  // очистка
  for (const id of [...enemyViews.keys()]) removeEnemyView(id);
  playerViews.forEach((v) => v && world.remove(v.root)); playerViews.length = 0;
  if (merchView) { world.remove(merchView.root); merchView = null; }
  shots = []; G.enemies.clear(); G.drops.clear(); G.F = []; G.over = false; G.t = 0; G.wave = 0; G.ph = "build"; G.timer = D.BUILD_FIRST; G.queue = []; G.merchant = null; G.bossId = 0; G.eid = 1; G.did = 1;
  const n = cfg.players.length, spots = houseSpots(n);
  buildWorld(cfg.seed, n);
  G.houses = spots.map((s, i) => ({ idx: i, owner: i, x: s.x, z: s.z, lv: 1, hp: D.HOUSE_LV[1].hp, max: D.HOUSE_LV[1].hp, wall: 0, whp: 0, wmax: 0, alive: true, turrets: Array(D.SLOTS).fill(null) }));
  G.houses.forEach(makeHouseView);
  G.players = cfg.players.map((pc, i) => newPlayer(pc, i, spots));
  G.players.forEach((p) => { p.st = D.stats(p); p.hp = p.st.maxhp; makePlayerView(p); });
  lastLvl = 1; perkQueue = 0; seenSeq = 0; myTarget = null; fireCd = 0.5; gatherCd = 0;
  phase = "play";
  $("hud").classList.remove("hidden"); $("acts").classList.remove("hidden");
  closePanel(); $("perks").classList.add("hidden");
  camPos.set(P().x, 0, P().z);
  if (room) {
    ["s", "i", "h", "a", "over", "start", "left", "host-left", "roster", "full"].forEach((t) => room.off(t));
    room.on("s", (s) => { if (!isHost()) applySnap(s); });
    room.on("i", (d, from) => { const p = G.players.find((q) => q.id === from); if (!p || p.idx === me) return; p.x = d[0] / 10; p.z = d[1] / 10; p.ry = d[2] / 100; p.tgt = d[3]; p.mv = d[4]; p.gn = d[5]; p.seen = G.t; });
    room.on("h", (d, from) => { if (!isHost()) return; const p = G.players.find((q) => q.id === from); if (p) (d || []).forEach((hh) => hitEnemy(hh[0], hh[1], p.idx, hh[2], hh[3])); });
    room.on("a", (d, from) => { if (!isHost()) return; const p = G.players.find((q) => q.id === from); if (p) doAct(p.idx, d); });
    room.on("over", (d) => { if (!isHost()) onOver(d); });
    room.on("left", (id) => { const p = G.players.find((q) => q.id === id); if (p && p.present) { p.present = false; p.alive = false; msg(`${p.name} вышел`, "", 1800); } });
    room.on("host-left", () => { if (phase === "play") { msg("Хозяин вышел 😕", "Игра остановлена", 3000); setTimeout(() => onOver({ wave: G.wave, hostLeft: true, stats: G.players.map(pStat) }), 1500); } });
    room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
  }
  msg("Строй оборону!", `Первая волна через ${D.BUILD_FIRST} с · руби лес, ставь башни`, 3200);
  St.gameStart({ players: n, mode: room ? "party" : "solo" });
  T.haptic("notify", "success");
  updMerchantView();
  hudDirty = true;
}

// ---------- снимок (хозяин → все) ----------
const ENEMY_T = D.MON_IDS;
let snapT = 0, slowT = 0, lastFull = 0;
function makeSnap() {
  const E = [];
  for (const e of G.enemies.values()) E.push(e.id, ENEMY_T.indexOf(e.type), Math.round(e.x * 10), Math.round(e.z * 10), Math.round(e.ry * 10), Math.max(1, Math.round(e.hp / e.max * 100)), (e.slowT > 0 ? 1 : 0) | (e.atk ? 2 : 0) | (e.spawnT > 0 ? 4 : 0));
  const s = { ph: G.ph === "build" ? 0 : 1, tm: Math.ceil(G.timer), w: G.wave, E, b: G.bossId,
    P: G.players.map((p) => [Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.ry * 100), Math.ceil(p.hp), p.alive ? 1 : 0, p.tgt || 0, Math.floor(p.xp), p.lvl, p.wallet.c, p.wallet.w, p.wallet.s, p.kills, p.seq, p.ready ? 1 : 0, p.pot, p.mv, p.present ? 1 : 0, Math.ceil(p.downT), p.gn]) };
  if (G.F.length) { s.F = G.F; G.F = []; }
  if (G.t - lastFull > 1 || dirtyFull) {
    lastFull = G.t; dirtyFull = false;
    s.G = G.players.map((p) => [p.wpn, p.arm, p.amu, Object.entries(p.perks).map(([k, v]) => k + v).join(",")]);
    s.H = G.houses.map((h) => [h.lv, Math.ceil(h.hp), h.wall, Math.ceil(h.whp), h.alive ? 1 : 0, h.turrets.map((t) => (t ? t.type[0] + t.lv : "")).join(","), h.max, h.wmax]);
    s.D = [...G.drops.values()].map((d) => [d.id, Math.round(d.x * 10), Math.round(d.z * 10), d.v]);
    s.N = G.nodes.map((n) => n.amt).join("");
    s.M = G.merchant ? G.merchant.stock : 0;
  }
  return s;
}
let dirtyFull = true;
const TT = { a: "arrow", c: "catapult", f: "frost" };
function applySnap(s) {
  G.ph = s.ph ? "wave" : "build"; G.timer = s.tm;
  if (s.w !== G.wave) { if (s.w > G.wave && G.wave > 0 || s.w === 1) onWaveStart(s.w); G.wave = s.w; }
  G.bossId = s.b;
  // монстры
  const seen = new Set();
  for (let i = 0; i < s.E.length; i += 7) {
    const id = s.E[i]; seen.add(id);
    let e = G.enemies.get(id);
    const x = s.E[i + 2] / 10, z = s.E[i + 3] / 10, fl = s.E[i + 6];
    if (!e) { const type = ENEMY_T[s.E[i + 1]], M = D.MON[type]; e = { id, type, x, z, ry: s.E[i + 4] / 10, hp: 1, max: 1, r: M.r, spawning: !!(fl & 4) }; G.enemies.set(id, e); makeEnemyView(e); }
    e.tx = x; e.tz = z; e.try = s.E[i + 4] / 10; e.hpPct = s.E[i + 5]; e.slowT = fl & 1 ? 1 : 0; e.atk = !!(fl & 2); e.spawnT = fl & 4 ? 1 : 0;
    if (e.predHp == null || e.hpPct < e.predHp || G.t - (e.predT || 0) > 0.6) e.predHp = e.hpPct;
  }
  for (const id of [...G.enemies.keys()]) if (!seen.has(id)) { G.enemies.delete(id); killEnemyView(id); }
  // игроки
  s.P.forEach((a, i) => {
    const p = G.players[i]; if (!p) return;
    const wasAlive = p.alive, oldHp = p.hp;
    if (i !== me) { p.x = a[0] / 10; p.z = a[1] / 10; p.ry = a[2] / 100; p.tgt = a[5]; p.mv = a[15]; p.gn = a[18]; }
    p.hp = a[3]; p.alive = !!a[4]; p.xp = a[6]; p.lvl = a[7]; p.wallet.c = a[8]; p.wallet.w = a[9]; p.wallet.s = a[10]; p.kills = a[11];
    p.ready = !!a[13]; p.pot = a[14]; p.present = !!a[16]; p.downT = a[17];
    if (i === me && a[12] !== p.seq) { p.seq = a[12]; p.x = a[0] / 10; p.z = a[1] / 10; }
    if (i === me && p.hp < oldHp - 0.5 && p.alive) onHurt(oldHp - p.hp);
    if (wasAlive && !p.alive) onPlayerDown(p);
  });
  if (s.F) s.F.forEach(onEvent);
  if (s.G) s.G.forEach((g, i) => { const p = G.players[i]; if (!p) return; const perks = {}; (g[3] || "").split(",").filter(Boolean).forEach((x) => { const m = /^([a-z]+)(\d+)$/.exec(x); if (m) perks[m[1]] = +m[2]; }); const ch = p.wpn !== g[0] || p.arm !== g[1] || p.amu !== g[2]; p.wpn = g[0]; p.arm = g[1]; p.amu = g[2]; p.perks = perks; p.st = D.stats(p); if (ch && playerViews[i]) updGear(playerViews[i]); });
  if (s.H) s.H.forEach((a, i) => {
    const h = G.houses[i]; if (!h) return;
    const wasAlive = h.alive;
    h.lv = a[0]; h.hp = a[1]; h.wall = a[2]; h.whp = a[3]; h.alive = !!a[4]; h.max = a[6]; h.wmax = a[7];
    h.turrets = a[5].split(",").map((x) => (x ? { type: TT[x[0]], lv: +x.slice(1), cd: 0 } : null));
    if (wasAlive && !h.alive) onHouseDestroyed(h);
    updHouseView(h);
  });
  if (s.D) { const ids = new Set(s.D.map((d) => d[0])); for (const id of [...G.drops.keys()]) if (!ids.has(id)) G.drops.delete(id); s.D.forEach((d) => { if (!G.drops.has(d[0])) G.drops.set(d[0], { id: d[0], x: d[1] / 10, z: d[2] / 10, v: d[3], y: 0, vy: 0 }); }); }
  if (s.N) [...s.N].forEach((ch, i) => { const nd = G.nodes[i]; if (nd && nd.amt !== +ch) { if (+ch > nd.amt && nd.amt === 0) nd.grow = 0.05; nd.amt = +ch; updNode(nd); } });
  if (s.M !== undefined) { const was = !!G.merchant; G.merchant = s.M ? { stock: s.M } : null; if (was !== !!G.merchant) { updMerchantView(); if (G.merchant) msg("🛒 Пришёл торговец!", "Он у центра карты до начала волны", 2600); } }
  hudDirty = true;
}
// события (эффекты) — у всех одинаково
function onEvent(f) {
  const k = f[0];
  if (k === "t") { const h = G.houses[f[1]]; if (!h) return; const t = h.turrets[f[2]]; const e = G.enemies.get(f[3]); if (!t || !e) return; turretShot(h, f[2], t, e, false); }
  else if (k === "a") { const e = G.enemies.get(f[1]); if (e) acidShot(e, f[2] / 10, f[3] / 10, false); }
  else if (k === "x") { fx.explosion(f[1] / 10, f[2] / 10, f[3] / 10); Sfx.play("boom"); }
  else if (k === "b") { fx.ring(f[1] / 10, f[2] / 10, D.MON.boss.slam, D.MON.boss.slam + 0.01, 0.8, 0xff3030); }
  else if (k === "B") { fx.explosion(f[1] / 10, f[2] / 10, 2.4); fx.ring(f[1] / 10, f[2] / 10, 0.5, D.MON.boss.slam, 0.5, 0xffffff); fx.shake = 1.2; }
  else if (k === "c") { G.drops.set(f[1], { id: f[1], x: f[2] / 10, z: f[3] / 10, v: f[4], y: 0.4, vy: 5 + Math.random() * 2, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3 }); }
  else if (k === "p") { const d = G.drops.get(f[1]); const p = G.players[f[2]]; if (d) { fx.sparkle(d.x, 0.6, d.z, COL.gold, 6); if (p) fx.text(d.x, 1.4, d.z, `+${f[3]}🪙`, "#ffd34d", 15, 0.8); if (f[2] === me) Sfx.play("coin"); G.drops.delete(f[1]); } }
  else if (k === "hh") { const h = G.houses[f[1]]; if (h && h.view) { h.view.shake = 0.3; fx.chips(h.x + (Math.random() - 0.5) * 2, 1.2, h.z + (Math.random() - 0.5) * 2, f[2] ? COL.wood : COL.stone); } }
  else if (k === "lv") { const p = G.players[f[1]]; if (p) { fx.levelup(p.x, p.z); fx.text(p.x, 2.4, p.z, "НОВЫЙ УРОВЕНЬ!", "#ffd34d", 18, 1.4); } }
  else if (k === "heal") { const p = G.players[f[1]]; if (p) fx.heal(p.x, p.z); }
  else if (k === "clr") { onWaveCleared(f[1], f[2]); }
  else if (k === "n") { const nd = G.nodes[f[1]]; if (nd) { nd.amt = f[2]; if (f[2] > 0 && f[3]) nd.grow = 0.05; updNode(nd); } }
}
function emit(f) { if (isHost()) { if (room) G.F.push(f); onEvent(f); } }

// ================= ЛОГИКА ХОЗЯИНА =================
function startWave() {
  G.wave++; G.ph = "wave"; G.timer = 0;
  G.queue = D.makeWave(G.wave, activePlayers(), Math.random);
  G.spawnT = 1.5; G.merchant = null; dirtyFull = true; updMerchantView();
  G.players.forEach((p) => (p.ready = false));
  onWaveStart(G.wave);
}
const activePlayers = () => Math.max(1, G.players.filter((p) => p.present).length);
function onWaveStart(w) {
  const boss = w % 5 === 0;
  msg(boss ? `Волна ${w} — БОСС!` : `Волна ${w}`, boss ? "Король костей идёт за тобой 💀" : "Скелеты идут! Защищай аванпост", 2400);
  T.haptic("notify", "warning");
  St.event("wave_reached", { game: GAME, wave: w, players: G.players.length });
  St.state({ wave: w });
  closePanel();
}
function onWaveCleared(w, bonus) {
  msg(`Волна ${w} отбита!`, `+${bonus}🪙 каждому · стены починены`, 2600);
  T.haptic("notify", "success");
  playerViews.forEach((v) => { if (v && v.p.alive) { const a = playOnce(v, "Cheer", 1.2); v.cheer = 1.6; } });
}
function spawnEnemy(type) {
  const alive = G.houses.filter((h) => h.alive); if (!alive.length) return;
  const h = alive[Math.floor(Math.random() * alive.length)];
  const base = G.houses.length === 1 ? Math.random() * PI2 : Math.atan2(h.z, h.x) + (Math.random() - 0.5) * 1.6;
  const rr = D.MAP_R - 2, x = Math.cos(base) * rr, z = Math.sin(base) * rr;
  const M = D.MON[type], hm = D.hpMul(G.wave, activePlayers());
  const e = { id: G.eid++, type, x, z, ry: Math.atan2(-x, -z), hp: M.hp * hm, max: M.hp * hm, r: M.r, h: h.idx, cd: 1, spawnT: 1.4, spawning: true, slowT: 0, atk: false, summonT: 8, slamT: 0 };
  if (M.boss) { G.bossId = e.id; e.hp = e.max = M.hp * (1 + 0.5 * (G.wave / 5 - 1)) * (1 + 0.45 * (activePlayers() - 1)); }
  G.enemies.set(e.id, e); makeEnemyView(e);
}
const grid = new Map();
function hostStep(dt) {
  G.t += dt;
  if (G.ph === "build") {
    G.timer -= dt;
    const act = G.players.filter((p) => p.present);
    if (G.timer <= 0 || (act.length && act.every((p) => p.ready))) startWave();
  } else {
    G.spawnT -= dt;
    const cap = 28 + 6 * activePlayers();
    if (G.queue.length && G.spawnT <= 0 && G.enemies.size < cap) {
      const type = G.queue.shift(); spawnEnemy(type);
      G.spawnT = Math.max(0.28, 1.5 - G.wave * 0.07) / Math.sqrt(activePlayers()) * (0.6 + Math.random() * 0.8);
      if (type === "boss") G.spawnT += 3;
    }
    if (!G.queue.length && !G.enemies.size) waveCleared();
  }
  // монстры
  grid.clear();
  for (const e of G.enemies.values()) { const k = (Math.floor(e.x / 2) * 1000 + Math.floor(e.z / 2)); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(e); }
  for (const e of G.enemies.values()) enemyAI(e, dt);
  // башни
  for (const h of G.houses) {
    if (!h.alive) continue;
    const owner = G.players[h.owner], tm = owner && owner.st ? owner.st.turretMul : 1;
    h.turrets.forEach((t, s) => {
      if (!t) return;
      t.cd -= dt; if (t.cd > 0) return;
      const TD = D.TURRETS[t.type], p = slotPos(h, s);
      let best = null, bd = TD.range;
      for (const e of G.enemies.values()) { if (e.spawnT > 0) continue; const d = dist(p.x, p.z, e.x, e.z); if (d < bd) { bd = d; best = e; } }
      if (!best) { t.cd = 0.2; return; }
      t.cd = 1 / TD.rate;
      emit(["t", h.idx, s, best.id]);
      // реальный урон наносит снаряд хозяина (см. turretShot real)
      const sh = shots[shots.length - 1]; if (sh && sh.tower === h.idx * 10 + s) { sh.real = true; sh.dmg = TD.dmg * D.turretMul(t.lv) * tm; sh.src = -1 - h.idx; }
    });
  }
  // монеты: магнит и подбор
  for (const d of G.drops.values()) {
    let best = null, bd = 1e9;
    for (const p of G.players) { if (!p.alive || !p.present) continue; const dd = dist(p.x, p.z, d.x, d.z); if (dd < bd) { bd = dd; best = p; } }
    if (best && bd < (best.st ? best.st.magnet : 2.6)) {
      const sp = 7 + (2.6 - Math.min(bd, 2.6)) * 4; d.x += (best.x - d.x) / bd * Math.min(bd, sp * dt); d.z += (best.z - d.z) / bd * Math.min(bd, sp * dt);
      if (bd < 0.7) { const v = Math.max(1, Math.round(d.v * best.st.coinMul)); best.wallet.c += v; emit(["p", d.id, best.idx, v]); G.drops.delete(d.id); }
    }
    d.age = (d.age || 0) + dt; if (d.age > 70) G.drops.delete(d.id);
  }
  // игроки: реген, возрождение
  for (const p of G.players) {
    if (!p.present) continue;
    if (p.alive) { p.hp = Math.min(p.st.maxhp, p.hp + p.st.regen * dt); }
    else { p.downT -= dt; if (p.downT <= 0) respawn(p); }
  }
  // ресурсы отрастают
  G.nodes.forEach((nd, i) => { if (nd.amt <= 0) { nd.regrow -= dt; if (nd.regrow <= 0) { nd.amt = D.RES[nd.kind].amount; emit(["n", i, nd.amt, 1]); } } });
  // конец
  if (!G.over && G.houses.every((h) => !h.alive)) gameOver();
}
function waveCleared() {
  G.ph = "build"; G.timer = D.BUILD_TIME + Math.min(10, G.wave);
  const bonus = 8 + G.wave * 3;
  G.players.forEach((p) => { if (p.present) { p.wallet.c += bonus; if (!p.alive) respawn(p); p.hp = Math.min(p.st.maxhp, p.hp + p.st.maxhp * 0.3); } });
  G.houses.forEach((h) => { if (h.alive && h.wall) h.whp = h.wmax; });
  // оставшиеся монеты сами летят к ближайшему игроку
  for (const d of [...G.drops.values()]) {
    let best = null, bd = 1e9; for (const p of G.players) { if (!p.present) continue; const dd = dist(p.x, p.z, d.x, d.z); if (dd < bd) { bd = dd; best = p; } }
    if (best) { const v = Math.max(1, Math.round(d.v * best.st.coinMul)); best.wallet.c += v; emit(["p", d.id, best.idx, v]); }
    G.drops.delete(d.id);
  }
  if (G.wave % 2 === 1) G.merchant = { stock: rollStock() };
  G.bossId = 0; dirtyFull = true; updMerchantView();
  if (G.merchant) setTimeout(() => msg("🛒 Пришёл торговец!", "Подойди к нему — оружие, броня, амулеты", 2600), 2700);
  emit(["clr", G.wave, bonus]);
  G.houses.forEach(updHouseView);
}
function rollStock() {
  const r = Math.random, pick = (o, k) => { const ks = Object.keys(o).filter((x) => o[x].price); const out = []; while (out.length < k && ks.length) out.push(ks.splice(Math.floor(r() * ks.length), 1)[0]); return out; };
  return [...pick(D.WEAPONS, 2).map((x) => "w:" + x), ...pick(D.ARMOR, 2).map((x) => "r:" + x), ...pick(D.AMULETS, 2).map((x) => "m:" + x), "p:potion"].join(";");
}
function respawn(p) {
  const own = G.houses[p.house] && G.houses[p.house].alive ? G.houses[p.house] : G.houses.filter((h) => h.alive).sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z))[0];
  if (!own) return;
  if (!G.houses[p.house].alive) p.house = own.idx;
  const a = Math.atan2(-own.z, -own.x) || Math.PI / 2;
  p.x = own.x + Math.cos(a) * 3.6; p.z = own.z + Math.sin(a) * 3.6; p.alive = true; p.hp = p.st.maxhp; p.downT = 0; p.seq++;
  emit(["heal", p.idx]);
}
function damagePlayer(p, dmg) {
  if (!p.alive || !p.present) return;
  p.hp -= dmg * (1 - p.st.def);
  if (p.idx === me) onHurt(dmg);
  if (p.hp <= 0) { p.hp = 0; p.alive = false; p.downT = 6; onPlayerDown(p); }
}
function damageHouse(h, dmg) {
  if (!h.alive) return;
  if (h.whp > 0) { h.whp -= dmg; emit(["hh", h.idx, 1]); if (h.whp <= 0) { h.whp = 0; dirtyFull = true; updHouseView(h); } }
  else { h.hp -= dmg; emit(["hh", h.idx, 0]); if (h.hp <= 0) { h.hp = 0; h.alive = false; dirtyFull = true; onHouseDestroyed(h); updHouseView(h); } }
  dirtyFullSoon();
}
let dfT = 0; function dirtyFullSoon() { if (G.t - dfT > 0.4) { dfT = G.t; dirtyFull = true; } }
function onHouseDestroyed(h) {
  fx.explosion(h.x, h.z, 3.5); fx.puff(h.x, h.z, 30, COL.smoke, 1.2);
  const own = G.players[h.owner];
  msg(own && own.idx === me ? "Твой аванпост разрушен!" : `Аванпост ${own ? own.name : ""} разрушен`, G.houses.some((x) => x.alive) ? "Беги к друзьям и защищай их дом!" : "", 2800);
  T.haptic("notify", "error");
  if (isHost()) G.players.forEach((p) => { if (p.house === h.idx) { const o = G.houses.filter((x) => x.alive).sort((a, b) => dist(a.x, a.z, h.x, h.z) - dist(b.x, b.z, h.x, h.z))[0]; if (o) p.house = o.idx; } });
}
function onPlayerDown(p) {
  const v = playerViews[p.idx]; if (v) { playAnim(v, "base", null); playAnim(v, "upper", null); playOnce(v, "Death_A", 1); v.deadShown = true; }
  fx.death(p.x, p.z, COL.red);
  if (p.idx === me) T.haptic("notify", "error");
}
function nearestHouse(x, z) { let b = null, bd = 1e9; for (const h of G.houses) if (h.alive) { const d = dist(x, z, h.x, h.z); if (d < bd) { bd = d; b = h; } } return b; }
function enemyAI(e, dt) {
  const M = D.MON[e.type];
  if (e.spawnT > 0) { e.spawnT -= dt; return; }
  e.slowT -= dt; const slow = e.slowT > 0 ? 0.5 : 1;
  let h = G.houses[e.h]; if (!h || !h.alive) { h = nearestHouse(e.x, e.z); if (!h) return; e.h = h.idx; }
  // цель: ближайший игрок рядом или дом
  let tp = null, td = M.ranged ? 7 : M.boss ? 5 : 4.2;
  for (const p of G.players) { if (!p.alive || !p.present) continue; const d = dist(p.x, p.z, e.x, e.z); if (d < td) { td = d; tp = p; } }
  let tx, tz, stop;
  const hd = dist(e.x, e.z, h.x, h.z), houseStop = (h.whp > 0 ? D.WALL_R + 0.25 : D.HOUSE_R + (h.lv >= 4 ? 0.8 : 0.3)) + e.r;
  if (tp && !(hd < houseStop + 0.5)) { tx = tp.x; tz = tp.z; stop = M.ranged ? M.range * 0.85 : M.range + 0.35; }
  else { tx = h.x; tz = h.z; stop = M.ranged ? Math.max(houseStop, M.range) : houseStop; tp = null; }
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
  e.cd -= dt;
  if (d > stop) {
    e.atk = false;
    const sp = M.spd * slow * dt;
    e.x += dx / d * sp; e.z += dz / d * sp;
  } else {
    e.atk = true;
    if (e.cd <= 0) {
      e.cd = 1 / M.rate;
      if (M.boom) { explode(e); return; }
      if (M.ranged) emit(["a", e.id, Math.round(tx * 10), Math.round(tz * 10)]), lastAcid(e, tp, h);
      else if (M.boss) { e.slamT = 0.8; emit(["b", Math.round(e.x * 10), Math.round(e.z * 10)]); }
      else if (tp) damagePlayer(tp, M.dmg);
      else damageHouse(h, M.hdmg);
    }
  }
  if (M.boss) {
    if (e.slamT > 0) { e.slamT -= dt; if (e.slamT <= 0) { emit(["B", Math.round(e.x * 10), Math.round(e.z * 10)]); for (const p of G.players) if (p.alive && dist(p.x, p.z, e.x, e.z) < M.slam) damagePlayer(p, M.dmg); if (dist(e.x, e.z, h.x, h.z) < M.slam + D.WALL_R) damageHouse(h, M.hdmg); } }
    e.summonT -= dt; if (e.summonT <= 0) { e.summonT = 11; for (let i = 0; i < 2 + activePlayers(); i++) { const a = Math.random() * PI2; const m = { type: "walker" }; spawnEnemy("walker"); const last = [...G.enemies.values()].pop(); last.x = e.x + Math.cos(a) * 2; last.z = e.z + Math.sin(a) * 2; last.h = e.h; } }
  }
  // поворот
  const want = Math.atan2(dx, dz); let dr = want - e.ry; while (dr > Math.PI) dr -= PI2; while (dr < -Math.PI) dr += PI2; e.ry += dr * Math.min(1, dt * 8);
  // расталкивание и препятствия
  const gx = Math.floor(e.x / 2), gz = Math.floor(e.z / 2);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const c = grid.get((gx + i) * 1000 + gz + j); if (!c) continue;
    for (const o of c) { if (o === e) continue; const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), rr = e.r + o.r; if (od < rr && od > 0.001) { const push = (rr - od) * 0.5; e.x += ox / od * push; e.z += oz / od * push; } }
  }
  collide(e, e.r, true);
}
function lastAcid(e, tp, h) { const sh = shots[shots.length - 1]; if (sh && sh.kind === "acid" && sh.from === e.id) { sh.real = true; sh.tp = tp ? tp.idx : -1; sh.th = h.idx; sh.dmg = tp ? D.MON.spitter.dmg : D.MON.spitter.hdmg; } }
function explode(e) {
  const M = D.MON.exploder;
  emit(["x", Math.round(e.x * 10), Math.round(e.z * 10), Math.round(M.boom * 10)]);
  for (const p of G.players) if (p.alive && dist(p.x, p.z, e.x, e.z) < M.boom) damagePlayer(p, M.dmg);
  for (const h of G.houses) if (h.alive && dist(h.x, h.z, e.x, e.z) < M.boom + (h.whp > 0 ? D.WALL_R : D.HOUSE_R) + 0.3) damageHouse(h, M.hdmg);
  G.enemies.delete(e.id); killEnemyView(e.id);
}
function hitEnemy(id, dmg, src, crit, frost) {
  const e = G.enemies.get(id); if (!e || e.spawnT > 0) return;
  e.hp -= dmg; if (frost) e.slowT = 2.2;
  const p = src >= 0 ? G.players[src] : null; if (p) p.dmg += dmg;
  if (e.hp <= 0) killEnemy(e, src);
}
function killEnemy(e, src) {
  const M = D.MON[e.type];
  G.enemies.delete(e.id); killEnemyView(e.id);
  if (e.type === "exploder") { emit(["x", Math.round(e.x * 10), Math.round(e.z * 10), 22]); for (const o of [...G.enemies.values()]) if (dist(o.x, o.z, e.x, e.z) < 2.2) hitEnemy(o.id, 30, src, false, false); }
  if (M.boss) G.bossId = 0;
  // монеты
  let left = M.coin; const k = Math.min(left, M.boss ? 10 : 3);
  for (let i = 0; i < k; i++) { const v = i === k - 1 ? left : Math.max(1, Math.floor(M.coin / k)); left -= v; if (v <= 0) continue; const id = G.did++, a = Math.random() * PI2, r = Math.random() * 0.6; const d = { id, x: e.x + Math.cos(a) * r, z: e.z + Math.sin(a) * r, v }; G.drops.set(id, d); emit(["c", id, Math.round(d.x * 10), Math.round(d.z * 10), v]); }
  // опыт: убийце всё, остальным 40%
  const killer = src >= 0 ? src : (G.houses[-1 - src] ? G.houses[-1 - src].owner : -1);
  for (const p of G.players) { if (!p.present) continue; giveXp(p, M.xp * (p.idx === killer ? 1 : 0.4)); }
  const kp = G.players[killer]; if (kp) { kp.kills++; if (kp.st.vamp && kp.alive) kp.hp = Math.min(kp.st.maxhp, kp.hp + kp.st.vamp); }
}
function giveXp(p, x) {
  p.xp += x;
  while (p.xp >= D.xpNeed(p.lvl)) { p.xp -= D.xpNeed(p.lvl); p.lvl++; emit(["lv", p.idx]); }
}
function gameOver() {
  G.over = true;
  const d = { wave: G.wave, stats: G.players.map(pStat) };
  send("over", d); onOver(d);
}
const pStat = (p) => [p.name, p.kills, Math.round(p.dmg), p.lvl, p.built];
// ---------- действия игроков (стройка, покупки, перки) ----------
const canPay = (w, c) => (w.c >= (c.c || 0)) && (w.w >= (c.w || 0)) && (w.s >= (c.s || 0));
const pay = (w, c) => { w.c -= c.c || 0; w.w -= c.w || 0; w.s -= c.s || 0; };
function doAct(pi, a) {
  const p = G.players[pi]; if (!p || !a) return false;
  const h = a.h != null ? G.houses[a.h] : null;
  const near = (hh) => hh && hh.alive && dist(p.x, p.z, hh.x, hh.z) < 9;
  let ok = false;
  switch (a.k) {
    case "g": {
      const nd = G.nodes[a.n]; if (!nd || nd.amt <= 0 || dist(p.x, p.z, nd.x, nd.z) > 3) return false;
      nd.amt--; const g = D.RES[nd.kind].give; p.wallet[g] += p.st.gather; if (nd.amt <= 0) nd.regrow = D.RES[nd.kind].regrow;
      emit(["n", a.n, nd.amt, 0]); return true;
    }
    case "hup": { const L = D.HOUSE_LV[h && h.lv + 1]; if (!near(h) || !L || !canPay(p.wallet, L.cost)) return false; pay(p.wallet, L.cost); h.lv++; h.max = L.hp; h.hp = L.hp; ok = true; break; }
    case "rep": { if (!near(h) || h.hp >= h.max || p.wallet.w < D.REPAIR.w) return false; p.wallet.w -= D.REPAIR.w; h.hp = Math.min(h.max, h.hp + h.max * D.REPAIR.part); emit(["heal", pi]); ok = true; break; }
    case "wall": { const L = D.WALL_LV[h && h.wall + 1]; if (!near(h) || !L || !canPay(p.wallet, L.cost)) return false; pay(p.wallet, L.cost); h.wall++; h.wmax = L.hp; h.whp = L.hp; ok = true; break; }
    case "tb": { const TD = D.TURRETS[a.t]; if (!near(h) || !TD || h.turrets[a.s] !== null || !canPay(p.wallet, TD.cost)) return false; pay(p.wallet, TD.cost); h.turrets[a.s] = { type: a.t, lv: 1, cd: 0.5 }; ok = true; break; }
    case "tu": { const t = h && h.turrets[a.s]; if (!near(h) || !t || t.lv >= D.TURRET_MAX) return false; const c = D.upCost(D.TURRETS[t.type].cost, t.lv); if (!canPay(p.wallet, c)) return false; pay(p.wallet, c); t.lv++; ok = true; break; }
    case "buy": {
      if (!G.merchant || !G.merchant.stock.split(";").includes(a.id)) return false;
      const [cat, key] = a.id.split(":");
      const item = cat === "w" ? D.WEAPONS[key] : cat === "r" ? D.ARMOR[key] : cat === "m" ? D.AMULETS[key] : D.POTION;
      if (!item || p.wallet.c < item.price) return false;
      if (cat === "w") { if (p.wpn === key) return false; p.wpn = key; }
      else if (cat === "r") { if (p.arm === key) return false; p.arm = key; }
      else if (cat === "m") { if (p.amu === key) return false; p.amu = key; }
      else { if (p.pot >= D.POTION.max) return false; p.pot++; }
      p.wallet.c -= item.price;
      const oldMax = p.st.maxhp; p.st = D.stats(p); if (p.st.maxhp > oldMax) p.hp += p.st.maxhp - oldMax;
      if (playerViews[pi]) updGear(playerViews[pi]);
      ok = true; break;
    }
    case "pot": { if (p.pot <= 0 || !p.alive) return false; p.pot--; p.hp = Math.min(p.st.maxhp, p.hp + D.POTION.heal); emit(["heal", pi]); return true; }
    case "perk": {
      const pk = D.PERKS[a.id]; if (!pk || (p.perks[a.id] || 0) >= pk.max) return false;
      const spent = Object.values(p.perks).reduce((s, x) => s + x, 0); if (spent >= p.lvl - 1) return false;
      p.perks[a.id] = (p.perks[a.id] || 0) + 1; const oldMax = p.st.maxhp; p.st = D.stats(p); if (p.st.maxhp > oldMax) p.hp += p.st.maxhp - oldMax; ok = true; break;
    }
    case "rdy": p.ready = !!a.v; return true;
  }
  if (ok) { dirtyFull = true; if (a.k !== "buy" && a.k !== "perk") p.built++; if (h) updHouseView(h); }
  return ok;
}
// локальное действие: хозяин выполняет сразу, гость — отправляет и сразу проверяет кошелёк для отзывчивости
function act(a) {
  if (isHost()) return doAct(me, a);
  send("a", a); return true;
}

// ================= ЛОКАЛЬНЫЙ ИГРОК =================
const keys = {}; let joy = null, joyV = { x: 0, y: 0 };
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "KeyQ" && phase === "play") drinkPotion(); });
addEventListener("keyup", (e) => { keys[e.code] = false; });
const jEl = $("joy"), jKnob = jEl.firstElementChild;
const UI_SEL = "button, #panel, #perks, .screen, .pt-screen, .fb-screen";
addEventListener("pointerdown", (e) => {
  if (phase !== "play" || e.target.closest(UI_SEL)) return;
  if ($("panel").classList.contains("on") && e.clientY > H * 0.35) return;
  joy = { id: e.pointerId, x: e.clientX, y: e.clientY }; joyV.x = joyV.y = 0;
  jEl.style.display = "block"; jEl.style.left = e.clientX + "px"; jEl.style.top = e.clientY + "px"; jKnob.style.transform = "";
});
addEventListener("pointermove", (e) => {
  if (!joy || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const d = Math.hypot(dx, dy), R = 50;
  if (d > R) { joy.x += dx / d * (d - R); joy.y += dy / d * (d - R); dx = e.clientX - joy.x; dy = e.clientY - joy.y; jEl.style.left = joy.x + "px"; jEl.style.top = joy.y + "px"; }
  joyV.x = dx / R; joyV.y = dy / R; jKnob.style.transform = `translate(${dx}px,${dy}px)`;
});
const endJoy = (e) => { if (joy && e.pointerId === joy.id) { joy = null; joyV.x = joyV.y = 0; jEl.style.display = "none"; } };
addEventListener("pointerup", endJoy); addEventListener("pointercancel", endJoy);

let myTarget = null, fireCd = 0, gatherCd = 0, lastLvl = 1, perkQueue = 0, seenSeq = 0, hurtT = 0, sendT = 0, hitsBuf = [], hitT = 0, shotSnd = 0;
function collide(o, r, isEnemy) {
  for (const h of G.houses) { const hr = (h.alive ? (h.lv >= 4 ? 2.3 : h.lv >= 3 ? 1.9 : D.HOUSE_R) : 1.4) + r; push(o, h.x, h.z, hr);
    if (h.alive) { h.turrets.forEach((t, s) => { if (t) { const p = slotPos(h, s); push(o, p.x, p.z, 0.85 + r); } });
      if (isEnemy && h.whp > 0) { const d = dist(o.x, o.z, h.x, h.z); if (d < D.WALL_R + r && d > 0.01) { o.x = h.x + (o.x - h.x) / d * (D.WALL_R + r); o.z = h.z + (o.z - h.z) / d * (D.WALL_R + r); } } } }
  for (const ob of obstacles) push(o, ob.x, ob.z, ob.r + r);
  for (const nd of G.nodes) if (nd.amt > 0) push(o, nd.x, nd.z, (nd.kind === "tree" ? 0.45 : 0.85) * nd.s + r);
  if (G.merchant) { const m = merchantSpot(G.players.length); push(o, m.x - 1.6, m.z - 1.4, 1.1 + r); }
  const rr = Math.hypot(o.x, o.z), lim = D.MAP_R - 0.5; if (rr > lim) { o.x *= lim / rr; o.z *= lim / rr; }
}
function push(o, x, z, r) { const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz); if (d < r && d > 0.0001) { o.x = x + dx / d * r; o.z = z + dz / d * r; } }
function localStep(dt) {
  const p = P(); if (!p) return;
  if (!p.st) p.st = D.stats(p);
  // ввод
  let mx = joyV.x, mz = joyV.y;
  if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1; if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const moving = p.alive && ml > 0.12;
  if (p.alive) { p.x += mx * p.st.move * dt; p.z += mz * p.st.move * dt; collide(p, 0.42, false); }
  p.mv = moving ? 1 : 0;
  // цель: ближайший монстр в радиусе
  myTarget = null;
  if (p.alive) { let bd = p.st.range; for (const e of G.enemies.values()) { if (e.spawnT > 0) continue; const d = dist(p.x, p.z, e.x, e.z) - e.r * 0.5; if (d < bd) { bd = d; myTarget = e; } } }
  p.tgt = myTarget ? myTarget.id : 0;
  if (myTarget) p.ry = Math.atan2(myTarget.x - p.x, myTarget.z - p.z);
  else if (moving) p.ry = Math.atan2(mx, mz);
  // стрельба
  fireCd -= dt;
  if (myTarget && fireCd <= 0) { fireCd = 1 / p.st.rate; firePlayer(p, myTarget, true); }
  // сбор ресурсов: рядом с деревом/камнем и врагов поблизости нет
  p.gn = -1;
  if (p.alive && !myTarget) {
    let calm = true; for (const e of G.enemies.values()) if (dist(e.x, e.z, p.x, p.z) < 6.5) { calm = false; break; }
    if (calm) { let bi = -1, bd = 1e9; G.nodes.forEach((nd, i) => { if (nd.amt <= 0) return; const d = dist(nd.x, nd.z, p.x, p.z) - (nd.kind === "tree" ? 0.45 : 0.85) * nd.s; if (d < 1.1 && d < bd) { bd = d; bi = i; } }); p.gn = bi; }
  }
  if (p.gn >= 0) {
    const nd = G.nodes[p.gn]; p.ry = Math.atan2(nd.x - p.x, nd.z - p.z);
    gatherCd -= dt;
    if (gatherCd <= 0) {
      gatherCd = 0.75;
      if (act({ k: "g", n: p.gn })) {
        nd.shake = 0.35; const g = D.RES[nd.kind].give;
        fx.chips(nd.x, nd.kind === "tree" ? 1.2 : 0.6, nd.z, nd.kind === "tree" ? COL.wood : COL.stone);
        fx.text(nd.x, 2, nd.z, `+${p.st.gather}${g === "w" ? "🪵" : "🪨"}`, "#fff", 16, 0.9);
        if (!isHost()) { nd.amt = Math.max(0, nd.amt - 1); updNode(nd); }
        T.haptic("impact", "light");
      }
    }
  } else gatherCd = Math.min(gatherCd, 0.35);
  // уровни → выбор перка
  if (p.lvl > lastLvl) { perkQueue += p.lvl - lastLvl; lastLvl = p.lvl; if (isHost()) {} T.haptic("notify", "success"); }
  if (perkQueue > 0 && $("perks").classList.contains("hidden") && p.alive) showPerks();
  // отправка координат хозяину
  if (room && !isHost()) {
    sendT -= dt;
    if (sendT <= 0) { sendT = 1 / 12; sendFast("i", [Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.ry * 100), p.tgt, p.mv, p.gn]); }
    hitT -= dt; if (hitsBuf.length && hitT <= 0) { hitT = 0.1; send("h", hitsBuf); hitsBuf = []; }
  }
}
function drinkPotion() { const p = P(); if (!p || p.pot <= 0 || !p.alive || p.hp >= p.st.maxhp) { toast(p && p.pot <= 0 ? "Зелий нет — купи у торговца" : "Здоровье и так полное"); return; } act({ k: "pot" }); if (!isHost()) { p.pot--; } fx.heal(p.x, p.z); T.haptic("impact", "medium"); hudDirty = true; }

// ---------- выстрелы ----------
function firePlayer(p, tgt, real) {
  const st = p.st, v = playerViews[p.idx];
  const sx = p.x + Math.sin(p.ry) * 0.5, sz = p.z + Math.cos(p.ry) * 0.5, sy = 0.95;
  const base = Math.atan2(tgt.x - p.x, tgt.z - p.z);
  const n = st.n, spread = n > 1 ? Math.max(st.spread, 0.12 * (n - 1)) : 0;
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0) + (Math.random() - 0.5) * 0.04;
    const crit = Math.random() < st.crit;
    shots.push({ kind: st.proj, x: sx, y: sy, z: sz, vx: Math.sin(a) * st.speedP, vy: 0, vz: Math.cos(a) * st.speedP, life: st.range / st.speedP * 1.25, real, owner: p.idx, dmg: st.dmg * (crit ? 2 : 1), crit, pierce: st.pierce, bounce: st.bounce, splash: st.splash, frost: st.frost, hit: new Set(), tgt: n === 1 ? tgt.id : 0 });
  }
  const PR = PROJ[st.proj];
  fx.muzzle(sx + Math.sin(base) * 0.3, sy, sz + Math.cos(base) * 0.3, Math.sin(base), Math.cos(base), PR.trail);
  if (v) v.recoil = 1;
  if (real && p.idx === me && G.t - shotSnd > 0.22) { shotSnd = G.t; Sfx.play("tick"); }
}
function turretShot(h, s, t, e, real) {
  const TD = D.TURRETS[t.type], p = slotPos(h, s), y = t.type === "arrow" ? 3.3 : t.type === "frost" ? 3.4 : 2.6;
  const sh = { kind: TD.proj, x: p.x, y, z: p.z, life: 4, real: false, tgt: e.id, splash: TD.splash || 0, slow: TD.slow, tower: h.idx * 10 + s, hit: new Set(), homing: TD.proj !== "stone" };
  if (TD.proj === "stone") { sh.arc = true; sh.sx = p.x; sh.sz = p.z; sh.sy = y; sh.tx = e.x; sh.tz = e.z; sh.t = 0; sh.dur = Math.max(0.6, dist(p.x, p.z, e.x, e.z) / TD.speed); }
  else { const d = dist(p.x, p.z, e.x, e.z) || 1; sh.vx = (e.x - p.x) / d * TD.speed; sh.vz = (e.z - p.z) / d * TD.speed; sh.vy = (1 - y) / (d / TD.speed); sh.speed = TD.speed; }
  shots.push(sh);
  fx.muzzle(p.x, y, p.z, 0, 0, PROJ[TD.proj].trail);
  if (h.view && h.view.turrets[s]) h.view.turrets[s].kick = 1;
}
function acidShot(e, tx, tz, real) {
  const d = dist(e.x, e.z, tx, tz);
  shots.push({ kind: "acid", arc: true, sx: e.x, sz: e.z, sy: 1.4, tx, tz, t: 0, dur: Math.max(0.5, d / 9), from: e.id, real: false, hit: new Set(), splash: 1 });
  const v = enemyViews.get(e.id); if (v) playOnce(v, "Spellcast_Shoot", 1.6);
}
function updateShots(dt) {
  const counts = {}; for (const k in PROJ) counts[k] = 0;
  const keep = [];
  for (const s of shots) {
    let alive = true;
    if (s.arc) {
      s.t += dt; const k = Math.min(1, s.t / s.dur);
      s.x = lerp(s.sx, s.tx, k); s.z = lerp(s.sz, s.tz, k); s.y = lerp(s.sy, 0.2, k) + Math.sin(k * Math.PI) * (2 + s.dur * 2.5);
      if (k >= 1) { alive = false; landArc(s); }
    } else {
      if (s.homing) { const e = G.enemies.get(s.tgt); if (e) { const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz) || 1; s.vx = dx / d * s.speed; s.vz = dz / d * s.speed; s.vy = (0.9 - s.y) * 6; } }
      const ox = s.x, oz = s.z;
      s.x += s.vx * dt; s.y += (s.vy || 0) * dt; s.z += s.vz * dt; s.life -= dt;
      if (s.life <= 0) alive = false;
      // попадание: проверяем весь отрезок пути за кадр (быстрые болты не пролетают сквозь)
      const sx = s.x - ox, sz = s.z - oz, L2 = sx * sx + sz * sz || 1e-6, pad = Math.sqrt(L2) + 1.6;
      if (alive) for (const e of G.enemies.values()) {
        if (s.hit.has(e.id) || e.spawnT > 0) continue;
        if (Math.abs(e.x - s.x) > pad || Math.abs(e.z - s.z) > pad) continue;
        const k = clamp(((e.x - ox) * sx + (e.z - oz) * sz) / L2, 0, 1);
        if (dist(e.x, e.z, ox + sx * k, oz + sz * k) < e.r + 0.3) { s.x = ox + sx * k; s.z = oz + sz * k; alive = projHit(s, e); if (!alive) break; }
      }
    }
    if (alive) {
      keep.push(s);
      const PR = PROJ[s.kind], im = PR.mesh, i = counts[s.kind]++;
      if (i < 160) {
        const yaw = s.arc ? 0 : Math.atan2(s.vx, s.vz);
        _m.compose(_v.set(s.x, s.y, s.z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.setScalar(s.kind === "spark" || s.kind === "fire" ? 0.8 + Math.random() * 0.4 : 1));
        if (s.arc && s.kind === "stone") _q.setFromEuler(_e.set(s.t * 9, s.t * 7, 0)), _m.compose(_v, _q, _s.setScalar(1));
        im.setMatrixAt(i, _m);
      }
      if (Math.random() < (quality === 0 ? 0.35 : 0.8)) fx.trail(s.x, s.y, s.z, PR.trail, PR.size);
    }
  }
  shots = keep;
  for (const k in PROJ) { PROJ[k].mesh.count = Math.min(160, counts[k]); PROJ[k].mesh.instanceMatrix.needsUpdate = true; }
}
// снаряд попал в монстра; вернуть true, если летит дальше
function projHit(s, e) {
  s.hit.add(e.id);
  const PR = PROJ[s.kind];
  fx.hit(s.x, s.y, s.z, PR.hit, s.crit);
  const ev = enemyViews.get(e.id); if (ev) ev.flash = 1;
  if (s.owner != null) {
    // снаряд игрока
    const dmg = s.dmg;
    if (s.owner === me || s.real) {
      dealDamage(e, dmg, s.crit, s.frost);
      if (s.splash) for (const o of G.enemies.values()) if (o !== e && dist(o.x, o.z, e.x, e.z) < s.splash) dealDamage(o, dmg * (s.kind === "fire" ? 1 : 0.5), false, s.frost);
    }
    if (s.splash) { fx.ring(e.x, e.z, 0.2, s.splash, 0.3, s.kind === "fire" ? 0xff8030 : 0xffd080); if (s.kind === "fire") fx.explosion(e.x, e.z, 1.1); }
    if (s.pierce > 0) { s.pierce--; return true; }
    if (s.bounce > 0) {
      s.bounce--; let best = null, bd = 6;
      for (const o of G.enemies.values()) { if (s.hit.has(o.id) || o.spawnT > 0) continue; const d = dist(o.x, o.z, e.x, e.z); if (d < bd) { bd = d; best = o; } }
      if (best) { const sp = Math.hypot(s.vx, s.vz), d = bd || 1; s.vx = (best.x - e.x) / d * sp; s.vz = (best.z - e.z) / d * sp; s.x = e.x; s.z = e.z; s.life = 1; if (s.kind === "spark") fx.hit(e.x, 1, e.z, COL.blue, true); return true; }
    }
    return false;
  }
  // снаряд башни
  if (s.tower != null) {
    const dmg = s.dmg || 0;
    if (s.real) { hitEnemy(e.id, dmg, s.src, false, !!s.slow); if (s.splash) for (const o of [...G.enemies.values()]) if (o !== e && dist(o.x, o.z, e.x, e.z) < s.splash) hitEnemy(o.id, dmg * 0.6, s.src, false, !!s.slow); }
    if (s.splash) fx.ring(e.x, e.z, 0.2, s.splash, 0.35, s.slow ? 0x9fe8ff : 0xffd080);
    const TD = Object.values(D.TURRETS).find((x) => x.proj === s.kind);
    if (TD && e.hpPct != null || TD && isHost()) fx.text(e.x, 1.8, e.z, Math.round(s.dmg || TD.dmg), s.slow ? "#bff3ff" : "#ffe6a8", 13, 0.6);
  }
  return false;
}
function landArc(s) {
  const PR = PROJ[s.kind];
  fx.hit(s.x, 0.3, s.z, PR.hit, true);
  if (s.kind === "stone") {
    fx.explosion(s.x, s.z, 1.4); fx.chips(s.x, 0.4, s.z, COL.stone);
    const e = G.enemies.get(s.tgt);
    if (s.real) for (const o of [...G.enemies.values()]) if (dist(o.x, o.z, s.x, s.z) < (s.splash || 2) + o.r) hitEnemy(o.id, s.dmg, s.src, false, false);
    fx.text(s.x, 1.6, s.z, Math.round(s.dmg || D.TURRETS.catapult.dmg), "#ffe6a8", 15, 0.7);
  } else if (s.kind === "acid") {
    fx.ring(s.x, s.z, 0.2, 1.2, 0.4, 0x9cff3a); fx.puff(s.x, s.z, 6, COL.acid, 0.4);
    if (s.real) {
      for (const p of G.players) if (p.alive && dist(p.x, p.z, s.x, s.z) < 1.3) damagePlayer(p, D.MON.spitter.dmg);
      const h = G.houses[s.th]; if (h && h.alive && dist(h.x, h.z, s.x, s.z) < (h.whp > 0 ? D.WALL_R : D.HOUSE_R) + 1.5) damageHouse(h, D.MON.spitter.hdmg);
    }
  }
}
// урон от моего снаряда: хозяин применяет сразу, гость копит и шлёт пачкой
function dealDamage(e, dmg, crit, frost) {
  const d = Math.round(dmg);
  fx.text(e.x, 1.9 + (D.MON[e.type].boss ? 1.5 : 0), e.z, crit ? d + "!" : d, crit ? "#ff5a3c" : "#ffffff", crit ? 22 : 16, crit ? 0.9 : 0.7);
  if (isHost()) hitEnemy(e.id, dmg, me, crit, frost);
  else { hitsBuf.push([e.id, Math.round(dmg * 10) / 10, crit ? 1 : 0, frost ? 1 : 0]); e.predHp = Math.max(0, (e.predHp != null ? e.predHp : 100) - dmg / ((e.max > 1 ? e.max : D.MON[e.type].hp * D.hpMul(G.wave || 1, G.players.length))) * 100); e.predT = G.t; }
}
function onHurt(d) {
  if (G.t - hurtT > 0.35) { hurtT = G.t; T.haptic("impact", d > 20 ? "heavy" : "light"); }
  const v = playerViews[me]; if (v) v.hurt = 1;
  fx.shake = Math.min(1, fx.shake + 0.25);
  const p = P(); fx.text(p.x, 2.2, p.z, "-" + Math.round(d * (1 - (p.st ? p.st.def : 0))), "#ff4040", 17, 0.8);
}
// чужие выстрелы (только картинка): у гостя — для всех игроков, у хозяина — для гостей
const remoteCd = [];
function remoteFire(dt) {
  G.players.forEach((p, i) => {
    if (i === me || !p.alive || !p.present || !p.tgt) return;
    remoteCd[i] = (remoteCd[i] || 0) - dt;
    if (remoteCd[i] > 0) return;
    const e = G.enemies.get(p.tgt); if (!e) return;
    if (!p.st) p.st = D.stats(p);
    remoteCd[i] = 1 / p.st.rate;
    firePlayer(p, e, false);
  });
}

// ================= ОТРИСОВКА =================
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let menuAng = 0, dayK = 0;
function updateViews(dt) {
  const t = G.t;
  // игроки
  G.players.forEach((p, i) => {
    const v = playerViews[i]; if (!v) return;
    v.root.visible = p.present;
    if (!p.present) return;
    const k = i === me ? 1 : 1 - Math.exp(-dt * 12);
    v.pos.x = lerp(v.pos.x, p.x, k); v.pos.z = lerp(v.pos.z, p.z, k);
    const moved = Math.hypot(v.pos.x - v.root.position.x, v.pos.z - v.root.position.z) / Math.max(dt, 0.001);
    v.root.position.set(v.pos.x, 0, v.pos.z);
    let dr = p.ry - v.c.obj.rotation.y; while (dr > Math.PI) dr -= PI2; while (dr < -Math.PI) dr += PI2; v.c.obj.rotation.y += dr * Math.min(1, dt * 16);
    if (!p.alive) { if (!v.deadShown) onPlayerDown(p); v.c.mixer.update(dt); return; }
    if (v.deadShown) { v.deadShown = false; v.c.mixer.stopAllAction(); v.base = v.upper = null; fx.heal(p.x, p.z); }
    const moving = (i === me ? p.mv : moved > 0.8), aiming = !!p.tgt && !!G.enemies.get(p.tgt), chop = p.gn >= 0 && !aiming;
    v.cheer = (v.cheer || 0) - dt;
    if (v.cheer > 0 && !moving && !aiming) { /* радуемся */ }
    else {
      const upper = aiming ? (D.WEAPONS[p.wpn] && D.WEAPONS[p.wpn].model === "crossbow_2handed" ? "Aim2_U" : "Aim_U") : chop ? "Chop_U" : null;
      playAnim(v, "base", moving ? (upper ? "Run_L" : "Running_A") : (upper ? "Idle_L" : "Idle"));
      playAnim(v, "upper", upper);
      if (v.cheer > -0.5 && v.cheer < 0) { const a = v.c.act("Cheer"); if (a) a.fadeOut(0.2); v.cheer = -1; }
    }
    const runA = v.c.act("Running_A"); if (runA) runA.timeScale = p.st ? p.st.move / 5.2 : 1;
    const ch = v.c.act("Chop_U"); if (ch) ch.timeScale = 1.35;
    v.c.mixer.update(dt);
    // отдача оружия, вспышка урона, амулет
    v.recoil = Math.max(0, v.recoil - dt * 8);
    if (v.wpn) v.wpn.position.z = -v.recoil * 0.25;
    v.hurt = Math.max(0, (v.hurt || 0) - dt * 4);
    v.allMats.forEach((m) => { if (m.emissive) m.emissive.setRGB(v.hurt * 0.9, 0, 0); });
    if (v.orb.visible) { const a = t * 2.4; v.orb.position.set(Math.cos(a) * 0.65, 1.1 + Math.sin(t * 3) * 0.12, Math.sin(a) * 0.65); if (Math.random() < 0.3) fx.trail(v.root.position.x + v.orb.position.x, v.orb.position.y, v.root.position.z + v.orb.position.z, new THREE.Color(D.AMULETS[p.amu].color), 0.15); }
    v.ring.material.opacity = 0.55 + Math.sin(t * 4) * 0.2;
  });
  // монстры
  const camX = camPos.x, camZ = camPos.z;
  for (const [id, v] of enemyViews) {
    const e = v.e;
    if (v.dead) {
      v.dead += dt; v.c.mixer.update(dt);
      if (v.dead > 1.6) v.root.position.y = -(v.dead - 1.6) * 1.2;
      if (v.dead > 2.6) removeEnemyView(id);
      continue;
    }
    if (!isHost()) {
      const k = 1 - Math.exp(-dt * 10);
      e.x = lerp(e.x, e.tx, k); e.z = lerp(e.z, e.tz, k);
      let dr = e.try - e.ry; while (dr > Math.PI) dr -= PI2; while (dr < -Math.PI) dr += PI2; e.ry += dr * k;
    }
    v.root.position.set(e.x, 0, e.z); v.root.rotation.y = e.ry;
    const M = D.MON[e.type], A2 = MON_ANIM[e.type];
    v.spawn -= dt;
    if (v.spawn <= 0) {
      const name = e.atk ? A2.atk : A2.move;
      if (v.base !== name) { const old = v.c.act("Spawn_Ground_Skeletons"); if (old && old.isRunning()) old.fadeOut(0.2); }
      playAnim(v, "base", name, 0.25);
      const a = v.c.act(name);
      if (a) a.timeScale = e.atk ? Math.max(0.6, a.getClip().duration * M.rate) : (M.spd / (e.type === "runner" ? 3.2 : e.type === "exploder" ? 3 : 1.6)) * (e.slowT > 0 ? 0.5 : 1);
    }
    const far = Math.abs(e.x - camX) > 22 || Math.abs(e.z - camZ) > 26;
    v.skip = far ? (v.skip || 0) + 1 : 0;
    if (!far || v.skip % 3 === 0) v.c.mixer.update(far ? dt * 3 : dt);
    v.flash = Math.max(0, v.flash - dt * 6);
    const pulse = e.type === "exploder" ? (Math.sin(t * 10) * 0.5 + 0.5) * 0.6 : 0;
    const sl = e.slowT > 0 ? 0.35 : 0;
    v.mats.forEach((m) => m.emissive.setRGB(v.flash + pulse, v.flash + sl * 0.6, v.flash + sl));
  }
  // монеты
  updDrops(dt);
  // дома: тряска при ударах, «пружинка» после стройки
  for (const h of G.houses) {
    const v = h.view; if (!v) continue;
    v.shake = Math.max(0, v.shake - dt);
    if (v.model) { v.model.position.x = Math.sin(t * 70) * v.shake * 0.12; }
    if (v.pop > 0) { v.pop = Math.max(0, v.pop - dt * 2.2); const s = 1 + Math.sin(v.pop * Math.PI) * 0.12; v.model.scale.setScalar(D.HOUSE_LV[h.lv].scale * s); }
    v.turrets.forEach((tv) => {
      if (!tv || !tv.obj) return;
      if (tv.pop > 0) { tv.pop = Math.max(0, tv.pop - dt * 2.5); const s = 1 + Math.sin(tv.pop * Math.PI) * 0.25; tv.obj.scale.y = tv.obj.scale.x * s; } else tv.obj.scale.y = tv.obj.scale.x;
      if (tv.kick > 0) { tv.kick = Math.max(0, tv.kick - dt * 6); tv.obj.scale.y = tv.obj.scale.x * (1 - tv.kick * 0.06); }
    });
    if (!h.alive && Math.random() < dt * 4) fx.norm.add(h.x + (Math.random() - 0.5) * 2, 1, h.z + (Math.random() - 0.5) * 2, 0, 1.2, 0, 2, 0.8, 2.6, COL.smoke, -0.2, 0.3);
    // подсветка мест под башни, когда я рядом
    const near = P() && dist(P().x, P().z, h.x, h.z) < 9;
    v.slots.forEach((s) => { s.material.opacity = near ? 0.35 + Math.sin(t * 3) * 0.15 : 0.12; });
  }
  // ресурсы: дрожь при рубке, рост
  for (const nd of G.nodes) {
    if (nd.shake > 0) { nd.shake = Math.max(0, nd.shake - dt); updNode(nd); }
    if (nd.grow != null && nd.amt > 0) { nd.grow = Math.min(1, nd.grow + dt * 1.5); updNode(nd); if (nd.grow >= 1) { nd.grow = null; renderer.shadowMap.needsUpdate = true; } }
  }
  if (merchView) { merchView.c.mixer.update(dt); }
  world.children.forEach((c) => { if (c.userData.cloud) { c.position.x += Math.cos(t * 0.05) * c.userData.cloud * dt; } });
}
const COIN = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.8, roughness: 0.3, emissive: 0x6b4500 }), 300);
COIN.count = 0; COIN.frustumCulled = false; scene.add(COIN);
function updDrops(dt) {
  let i = 0;
  for (const d of G.drops.values()) {
    if (d.vy) { d.vy -= 18 * dt; d.y += d.vy * dt; d.x += (d.vx || 0) * dt; d.z += (d.vz || 0) * dt; if (d.y <= 0) { d.y = 0; d.vy = Math.abs(d.vy) > 2 ? -d.vy * 0.35 : 0; } }
    if (!isHost()) {
      // гость: магнит рисуем сам
      let best = null, bd = 1e9; for (const p of G.players) { if (!p.alive || !p.present) continue; const dd = dist(p.x, p.z, d.x, d.z); if (dd < bd) { bd = dd; best = p; } }
      if (best && bd < (best.st ? best.st.magnet : 2.6) && bd > 0.3) { const sp = 9 * dt; d.x += (best.x - d.x) / bd * Math.min(bd, sp); d.z += (best.z - d.z) / bd * Math.min(bd, sp); }
    }
    if (i >= 300) break;
    _m.compose(_v.set(d.x, 0.35 + d.y + Math.sin(G.t * 4 + d.id) * 0.08, d.z), _q.setFromEuler(_e.set(0, G.t * 3 + d.id, 0)), _s.setScalar(d.v >= 5 ? 1.5 : d.v >= 2 ? 1.2 : 1));
    COIN.setMatrixAt(i++, _m);
    if (Math.random() < 0.02) fx.sparkle(d.x, 0.5, d.z, COL.gold, 1);
  }
  COIN.count = i; COIN.instanceMatrix.needsUpdate = true;
}
function updateCamera(dt) {
  const p = P();
  const portrait = H > W;
  const vfov = camera.fov * Math.PI / 180, hfovT = Math.tan(vfov / 2) * camera.aspect;
  const wantHalfW = portrait ? 5.6 : 9;
  let d = clamp(wantHalfW / hfovT, 15, 30);
  const pitch = 0.98;
  if (phase === "play" && p) {
    const vv = playerViews[me]; const tx = vv ? vv.root.position.x : p.x, tz = vv ? vv.root.position.z : p.z;
    camPos.x = lerp(camPos.x, tx, 1 - Math.exp(-dt * 6)); camPos.z = lerp(camPos.z, tz + 1.2, 1 - Math.exp(-dt * 6));
  } else {
    menuAng += dt * 0.06; d = 52; camPos.set(Math.cos(menuAng) * 6, 0, Math.sin(menuAng) * 6);
  }
  const sh = fx.shake * fx.shake * 0.5;
  camera.position.set(camPos.x + (Math.random() - 0.5) * sh, Math.sin(pitch) * d, camPos.z + Math.cos(pitch) * d + (Math.random() - 0.5) * sh);
  camLook.set(camPos.x, 0, camPos.z);
  camera.lookAt(camLook);
  // день/сумерки: во время волны темнеет
  const want = phase === "play" && G.ph === "wave" ? 1 : 0;
  dayK = lerp(dayK, want, 1 - Math.exp(-dt * 0.8));
  scene.background.copy(DAY.sky).lerp(NIGHT.sky, dayK); scene.fog.color.copy(scene.background); scene.fog.near = d + 6; scene.fog.far = d + 50;
  hemi.intensity = lerp(DAY.hemi, NIGHT.hemi, dayK); sun.intensity = lerp(DAY.sun, NIGHT.sun, dayK); sun.color.copy(DAY.sunC).lerp(NIGHT.sunC, dayK);
}

// ---------- 2D-слой: цифры урона, полоски здоровья, имена, стрелки ----------
const _p = new THREE.Vector3();
function scr(x, y, z) { _p.set(x, y, z).project(camera); return { x: (_p.x + 1) / 2 * W, y: (1 - _p.y) / 2 * H, on: _p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1 }; }
function bar(x, y, w, h, k, col, bg) { octx.fillStyle = bg || "rgba(0,0,0,.6)"; octx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2); octx.fillStyle = col; octx.fillRect(x - w / 2, y, w * clamp(k, 0, 1), h); }
function drawOverlay() {
  octx.clearRect(0, 0, W, H);
  if (phase !== "play") return;
  octx.textAlign = "center"; octx.textBaseline = "middle"; octx.lineJoin = "round";
  // монстры: полоски здоровья у раненых
  for (const e of G.enemies.values()) {
    const k = isHost() ? e.hp / e.max : (e.predHp != null ? Math.min(e.predHp, e.hpPct) : e.hpPct) / 100;
    if (k >= 0.999 || D.MON[e.type].boss) continue;
    const M = D.MON[e.type], s = scr(e.x, 1.75 * M.scale / 0.62, e.z); if (!s.on) continue;
    bar(s.x, s.y, M.r > 0.6 ? 44 : 30, 4, k, e.slowT > 0 ? "#7cc9ff" : "#ff4d4d");
  }
  // игроки: имя и здоровье
  G.players.forEach((p, i) => {
    if (!p.present) return;
    const v = playerViews[i]; const x = v ? v.root.position.x : p.x, z = v ? v.root.position.z : p.z;
    const s = scr(x, 1.95, z); if (!s.on) return;
    if (i !== me) { octx.font = "800 12px sans-serif"; octx.lineWidth = 3; octx.strokeStyle = "rgba(0,0,0,.8)"; octx.strokeText(p.name, s.x, s.y - 10); octx.fillStyle = p.color; octx.fillText(p.name, s.x, s.y - 10); }
    if (p.alive && p.st) bar(s.x, s.y, 36, 4, p.hp / p.st.maxhp, "#5cff7a");
    if (!p.alive) { octx.font = "900 15px sans-serif"; octx.strokeText("💀 " + Math.max(0, Math.ceil(p.downT)), s.x, s.y); octx.fillStyle = "#fff"; octx.fillText("💀 " + Math.max(0, Math.ceil(p.downT)), s.x, s.y); }
  });
  // дома
  for (const h of G.houses) {
    if (!h.alive) continue;
    const s = scr(h.x, D.HOUSE_LV[h.lv].scale * 1.3 + 1.6, h.z); if (!s.on) continue;
    bar(s.x, s.y, 64, 6, h.hp / h.max, "#5cff7a");
    if (h.wmax > 0) bar(s.x, s.y + 9, 64, 3, h.whp / h.wmax, "#ffd34d");
  }
  // купец
  if (merchView) {
    const mp = merchView.root.position, s = scr(mp.x, 1.9 + Math.sin(G.t * 3) * 0.12, mp.z);
    if (s.on) { octx.font = "26px sans-serif"; octx.fillText("🛒", s.x, s.y); }
    else edgeArrow(mp.x, mp.z, "🛒");
  }
  // свой дом, если он далеко
  const p = P(); const myH = p && G.houses[p.house];
  if (myH && myH.alive && G.ph === "wave" && dist(p.x, p.z, myH.x, myH.z) > 14) edgeArrow(myH.x, myH.z, "🏠");
  // цифры
  for (const t of fx.texts) {
    const k = t.t / t.life, s = scr(t.x, t.y + k * 1.2, t.z); if (!s.on) continue;
    const sc = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
    octx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    octx.font = `900 ${Math.round(t.size * sc)}px sans-serif`; octx.lineWidth = 4; octx.strokeStyle = "rgba(25,12,4,.85)";
    octx.strokeText(t.str, s.x + t.dx * k, s.y); octx.fillStyle = t.color; octx.fillText(t.str, s.x + t.dx * k, s.y);
  }
  octx.globalAlpha = 1;
  // тёмная виньетка, когда мало здоровья
  if (p && p.alive && p.st && p.hp / p.st.maxhp < 0.35) {
    const g = octx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, "rgba(255,0,0,0)"); g.addColorStop(1, `rgba(200,0,0,${0.25 + Math.sin(G.t * 6) * 0.1})`); octx.fillStyle = g; octx.fillRect(0, 0, W, H);
  }
}
function edgeArrow(x, z, icon) {
  const s = scr(x, 0, z); const cx = W / 2, cy = H / 2; let dx = s.x - cx, dy = s.y - cy; if (_p.z > 1) { dx = -dx; dy = -dy; }
  const k = Math.min((W / 2 - 34) / Math.abs(dx || 1), (H / 2 - 120) / Math.abs(dy || 1)); const ax = cx + dx * k, ay = cy + dy * k;
  octx.save(); octx.translate(ax, ay); octx.fillStyle = "rgba(28,20,14,.75)"; octx.beginPath(); octx.arc(0, 0, 20, 0, PI2); octx.fill();
  octx.rotate(Math.atan2(dy, dx)); octx.fillStyle = "#ffd34d"; octx.beginPath(); octx.moveTo(26, 0); octx.lineTo(16, -7); octx.lineTo(16, 7); octx.fill(); octx.restore();
  octx.font = "20px sans-serif"; octx.fillText(icon, ax, ay + 1);
}

// ================= ИНТЕРФЕЙС =================
let hudDirty = true, hudT = 0;
const cache = {};
function setTxt(id, s) { if (cache[id] !== s) { cache[id] = s; $(id).innerHTML = s; } }
function setW(el, k) { const s = (clamp(k, 0, 1) * 100).toFixed(1) + "%"; if (el.style.width !== s) el.style.width = s; }
function hud() {
  const p = P(); if (!p) return;
  const tm = Math.max(0, Math.ceil(G.timer));
  setTxt("wave", G.ph === "build" ? `${G.wave ? "Волна " + G.wave + " ✔" : "Подготовка"}<small>⏳ до волны ${G.wave + 1}: ${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, "0")}</small>` : `Волна ${G.wave}<small>💀 врагов: ${G.enemies.size + (isHost() ? G.queue.length : 0)}</small>`);
  setTxt("r-c", "🪙 " + p.wallet.c); setTxt("r-w", "🪵 " + p.wallet.w); setTxt("r-s", "🪨 " + p.wallet.s);
  setTxt("lvl", p.lvl);
  const mh = p.st ? p.st.maxhp : 100;
  setW($("hpbar").firstElementChild, p.hp / mh); $("hpbar").lastElementChild.textContent = `${Math.ceil(p.hp)} / ${mh}`;
  setW($("xpbar").firstElementChild, p.xp / D.xpNeed(p.lvl));
  // дома
  const hs = G.houses.map((h) => `<div class="hs ${h.alive ? "" : "dead"}"><span style="color:${G.players[h.owner] ? G.players[h.owner].color : "#fff"}">🏠</span>${G.houses.length > 1 ? esc((G.players[h.owner] || {}).name || "") .slice(0, 8) : "Дом"}<div class="bar"><i style="width:${(h.hp / h.max * 100).toFixed(0)}%"></i>${h.wmax ? `<u style="width:${(h.whp / h.wmax * 100).toFixed(0)}%"></u>` : ""}</div></div>`).join("");
  setTxt("houses", hs);
  // босс
  const boss = G.bossId && G.enemies.get(G.bossId);
  $("boss").style.display = boss ? "block" : "none";
  if (boss) setW($("boss").querySelector("i"), isHost() ? boss.hp / boss.max : (boss.hpPct || 100) / 100);
  // кнопки
  const nh = nearHouse(), nm = nearMerchant();
  $("b-build").classList.toggle("hidden", !nh || !p.alive);
  $("b-shop").classList.toggle("hidden", !nm || !p.alive);
  $("b-shop").classList.toggle("hot", !!nm);
  $("b-pot").classList.toggle("hidden", p.pot <= 0);
  $("b-pot").querySelector("small").textContent = p.pot;
  $("b-ready").classList.toggle("hidden", G.ph !== "build");
  $("b-ready").classList.toggle("on", p.ready);
  const rd = G.players.filter((q) => q.present && q.ready).length, tot = G.players.filter((q) => q.present).length;
  setTxt("b-ready", p.ready ? (tot > 1 ? `⏳ Ждём ${rd}/${tot}` : "⏳ Скоро…") : (tot > 1 ? `✅ Готов ${rd}/${tot}` : "✅ В бой!"));
  // подсказка
  let hint = "";
  if (!p.alive) hint = "";
  else if (p.gn >= 0) hint = G.nodes[p.gn].kind === "tree" ? "🪓 Рублю дерево…" : "⛏️ Добываю камень…";
  else if (G.wave === 0 && G.t < 25) hint = "Подойди к дереву или камню — добыча сама. Стреляю сам!";
  setTxt("near", hint);
  const dead = $("dead");
  if (!p.alive) { dead.classList.remove("hidden"); setTxt("dead", `💀 Ты пал<br><small>Возрождение через ${Math.max(0, Math.ceil(p.downT))} с</small>`); } else dead.classList.add("hidden");
  if (panelOpen) refreshPanel();
}
function nearHouse() { const p = P(); let b = null, bd = 8; for (const h of G.houses) { if (!h.alive) continue; const d = dist(p.x, p.z, h.x, h.z); if (d < bd) { bd = d; b = h; } } return b; }
function nearMerchant() { if (!G.merchant) return false; const p = P(), m = merchantSpot(G.players.length); return dist(p.x, p.z, m.x, m.z) < 4.5; }
let msgT = 0;
function msg(t, sub, ms) { const el = $("msg"); el.innerHTML = esc(t) + (sub ? `<small>${esc(sub)}</small>` : ""); el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1600); }
let toastT = 0;
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 1500); }

// ---------- панель стройки / торговца ----------
let panelOpen = null, panelKey = "", selSlot = -1;
function closePanel() { panelOpen = null; $("panel").classList.remove("on"); }
function openPanel(kind, h) { panelOpen = { kind, h: h ? h.idx : -1 }; selSlot = -1; panelKey = ""; refreshPanel(); $("panel").classList.add("on"); }
const costOk = (c) => canPay(P().wallet, c);
function item(icon, title, sub, btn, ok, data, own) { return `<div class="it ${own ? "own" : ""}"><div class="ic">${icon}</div><div class="tx2"><b>${title}</b><span>${sub}</span></div>${btn ? `<button ${ok ? "" : "disabled"} data-a='${JSON.stringify(data)}'>${btn}</button>` : ""}</div>`; }
function refreshPanel() {
  const p = P(); if (!panelOpen || !p) return;
  let html = "";
  const wal = `<div class="wallet">У тебя: 🪙 ${p.wallet.c} · 🪵 ${p.wallet.w} · 🪨 ${p.wallet.s}</div>`;
  if (panelOpen.kind === "build") {
    const h = G.houses[panelOpen.h];
    if (!h || !h.alive || dist(p.x, p.z, h.x, h.z) > 9.5) { closePanel(); return; }
    const own = G.players[h.owner];
    html += `<h3>🏠 Аванпост${G.houses.length > 1 ? " · " + esc(own ? own.name : "") : ""}<button data-x>✕</button></h3>${wal}`;
    const NL = D.HOUSE_LV[h.lv + 1];
    html += item(["", "🏠", "🏡", "🏯", "🏰"][h.lv], `Дом · уровень ${h.lv}/4`, `Прочность ${Math.ceil(h.hp)} / ${h.max}` + (NL ? ` → ${NL.hp}, полный ремонт` : " · максимум"), NL ? "⬆ " + D.fmtCost(NL.cost) : "", NL && costOk(NL.cost), { k: "hup", h: h.idx });
    if (h.hp < h.max) html += item("🔧", "Починить дом", `+${Math.round(D.REPAIR.part * 100)}% прочности`, `${D.REPAIR.w}🪵`, p.wallet.w >= D.REPAIR.w, { k: "rep", h: h.idx });
    const WL = D.WALL_LV[h.wall + 1];
    html += item("🧱", h.wall ? D.WALL_LV[h.wall].name : "Ограда", h.wall ? `Прочность ${Math.ceil(h.whp)} / ${h.wmax} · чинится сама после волны` : "Принимает удары первой", WL ? (h.wall ? "⬆ " : "＋ ") + D.fmtCost(WL.cost) : "", WL && costOk(WL.cost), { k: "wall", h: h.idx });
    html += `<div class="sec">Башни — выбери место</div><div class="slots">`;
    for (let s = 0; s < D.SLOTS; s++) { const t = h.turrets[s]; html += `<div class="slot ${s === selSlot ? "sel" : ""}" data-slot="${s}"><span class="ic">${t ? D.TURRETS[t.type].icon : "➕"}</span>${t ? "ур. " + t.lv : "Пусто"}<small>место ${s + 1}</small></div>`; }
    html += `</div>`;
    if (selSlot >= 0) {
      const t = h.turrets[selSlot];
      if (!t) for (const [k, TD] of Object.entries(D.TURRETS)) html += item(TD.icon, TD.name, `${TD.desc} · урон ${TD.dmg}, дальность ${TD.range}`, D.fmtCost(TD.cost), costOk(TD.cost), { k: "tb", h: h.idx, s: selSlot, t: k });
      else { const TD = D.TURRETS[t.type], c = D.upCost(TD.cost, t.lv); html += item(TD.icon, `${TD.name} · ур. ${t.lv}/${D.TURRET_MAX}`, `Урон ${Math.round(TD.dmg * D.turretMul(t.lv))}` + (t.lv < D.TURRET_MAX ? ` → ${Math.round(TD.dmg * D.turretMul(t.lv + 1))}` : " · максимум"), t.lv < D.TURRET_MAX ? "⬆ " + D.fmtCost(c) : "", t.lv < D.TURRET_MAX && costOk(c), { k: "tu", h: h.idx, s: selSlot }); }
    } else html += `<div class="sec" style="text-transform:none">Нажми на место, чтобы поставить или улучшить башню</div>`;
  } else {
    if (!G.merchant || !nearMerchant()) { closePanel(); return; }
    html += `<h3>🛒 Торговец<button data-x>✕</button></h3>${wal}`;
    const groups = { w: "Оружие", r: "Броня", m: "Амулеты", p: "Зелья" }; let last = "";
    for (const id of G.merchant.stock.split(";")) {
      const [cat, key] = id.split(":");
      const it = cat === "w" ? D.WEAPONS[key] : cat === "r" ? D.ARMOR[key] : cat === "m" ? D.AMULETS[key] : D.POTION; if (!it) continue;
      if (cat !== last) { html += `<div class="sec">${groups[cat]}</div>`; last = cat; }
      const owned = (cat === "w" && p.wpn === key) || (cat === "r" && p.arm === key) || (cat === "m" && p.amu === key);
      const full = cat === "p" && p.pot >= D.POTION.max;
      const sub = cat === "w" ? `${it.desc} · урон ${it.dmg}${it.n > 1 ? "×" + it.n : ""}, ${it.rate}/с` : it.desc + (cat === "p" ? ` · у тебя ${p.pot}/${D.POTION.max}` : "");
      html += item(it.icon, it.name, sub, owned ? "✔ Твоё" : full ? "Полно" : it.price + "🪙", !owned && !full && p.wallet.c >= it.price, { k: "buy", id }, owned);
    }
    html += `<div class="sec" style="text-transform:none">Сейчас: ${D.WEAPONS[p.wpn].icon} ${D.WEAPONS[p.wpn].name}${p.arm !== "none" ? " · " + D.ARMOR[p.arm].icon + " " + D.ARMOR[p.arm].name : ""}${p.amu !== "none" ? " · " + D.AMULETS[p.amu].icon : ""}</div>`;
  }
  if (html === panelKey) return;
  panelKey = html;
  const el = $("panel"); el.innerHTML = html;
  el.querySelector("[data-x]").onclick = closePanel;
  el.querySelectorAll("[data-slot]").forEach((b) => (b.onclick = () => { selSlot = +b.dataset.slot; T.haptic("select"); refreshPanel(); }));
  el.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => {
    const a = JSON.parse(b.dataset.a);
    const ok = act(a);
    if (ok) { T.haptic("impact", "medium"); Sfx.play("coin"); if (a.k === "buy") { fx.sparkle(p.x, 1.4, p.z, COL.gold, 18); toast("Куплено! ✨"); St.event("buy", { game: GAME, id: a.id }); } else { St.event("build", { game: GAME, k: a.k, t: a.t }); } }
    else toast("Не хватает ресурсов");
    panelKey = ""; setTimeout(refreshPanel, 60);
  }));
}
$("b-build").onclick = () => { const h = nearHouse(); if (h) openPanel("build", h); };
$("b-shop").onclick = () => { if (nearMerchant()) openPanel("shop"); };
$("b-pot").onclick = drinkPotion;
$("b-ready").onclick = () => { const p = P(); const v = !p.ready; act({ k: "rdy", v }); p.ready = v; T.haptic("select"); hudDirty = true; };

// ---------- выбор перка ----------
function showPerks() {
  const p = P(); const pool = Object.keys(D.PERKS).filter((k) => (p.perks[k] || 0) < D.PERKS[k].max);
  const pick = []; while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  if (!pick.length) { perkQueue = 0; return; }
  const el = $("perks");
  el.innerHTML = `<h2 class="tx">Уровень ${p.lvl - perkQueue + 1}!</h2><p>Выбери улучшение${room ? "" : " (игра на паузе)"}</p>` + pick.map((k) => { const pk = D.PERKS[k], n = p.perks[k] || 0; return `<button class="pk" data-k="${k}"><span class="ic">${pk.icon}</span><div><b>${pk.name}</b><span>${pk.desc}</span>${n ? `<br><em>уже ${n}/${pk.max}</em>` : ""}</div></button>`; }).join("");
  el.classList.remove("hidden");
  fx.levelup(p.x, p.z); T.haptic("notify", "success");
  el.querySelectorAll(".pk").forEach((b) => (b.onclick = () => {
    const k = b.dataset.k;
    if (!isHost()) { p.perks[k] = (p.perks[k] || 0) + 1; p.st = D.stats(p); }
    act({ k: "perk", id: k });
    perkQueue--; el.classList.add("hidden"); T.haptic("impact", "medium");
    St.event("perk", { game: GAME, id: k, lvl: p.lvl });
  }));
}
const paused = () => !room && !$("perks").classList.contains("hidden");

// ---------- конец игры ----------
function onOver(d) {
  if (phase === "over") return;
  phase = "over"; G.over = true;
  St.gameEnd({ wave: d.wave, players: G.players.length, solo: !room });
  St.event("game_over", { game: GAME, wave: d.wave, players: G.players.length, solo: !room });
  closePanel(); $("perks").classList.add("hidden");
  $("end-title").textContent = d.hostLeft ? "Игра окончена — хозяин вышел" : "Игра окончена — аванпосты пали";
  $("end-wave").textContent = `Волна ${d.wave}`;
  let best = 0; try { best = +localStorage.getItem("ob_best") || 0; if (d.wave > best) localStorage.setItem("ob_best", d.wave); } catch (_) {}
  $("end-sub").innerHTML = (d.wave > best && best ? `<div><span>🏆 Новый рекорд!</span><span>было ${best}</span></div>` : best ? `<div><span>Рекорд</span><span>волна ${Math.max(best, d.wave)}</span></div>` : "") +
    (d.stats || []).map((s) => `<div><span>${esc(s[0])} · ур.${s[3]}</span><span>💀 ${s[1]} · ⚔️ ${s[2]}</span></div>`).join("");
  const b = [];
  if (isHost()) b.push(["🔁 Ещё раз", "primary", () => { const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me }) }); }]);
  else if (!d.hostLeft) b.push(["Ждём, пока хозяин начнёт заново…", "", () => {}]);
  b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
  const box = $("end-buttons"); box.innerHTML = "";
  b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
  setTimeout(() => $("screen-end").classList.remove("hidden"), 1200);
}
function toMenu() {
  phase = "menu"; $("hud").classList.add("hidden"); $("acts").classList.add("hidden"); $("screen-end").classList.add("hidden"); $("screen-menu").classList.remove("hidden"); $("dead").classList.add("hidden"); $("near").textContent = "";
  closePanel();
}

// ================= ГЛАВНЫЙ ЦИКЛ =================
let last = 0, acc = 0, fpsAcc = 0, fpsN = 0, fpsCheck = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  let dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
  if (!A.ready) return;
  if (window.__speed) dt *= window.__speed;
  if (phase === "play" && !paused()) {
    G.t += isHost() ? 0 : dt;
    if (isHost()) { acc += dt; let n = 0; while (acc >= 1 / 30 && n < 8) { hostStep(1 / 30); acc -= 1 / 30; n++; } }
    localStep(dt);
    remoteFire(dt);
    updateShots(dt);
    if (isHost() && room) { snapT -= dt; if (snapT <= 0) { snapT = 1 / 10; sendFast("s", makeSnap()); } }
    hudT -= dt; if (hudT <= 0 || hudDirty) { hudT = 0.15; hudDirty = false; hud(); }
  }
  if (phase === "over") updateShots(dt);
  if (!paused()) { updateViews(phase === "menu" ? 0 : dt); fx.update(dt); }
  grassT.value += dt;
  updateCamera(dt);
  sun.position.set(camPos.x * 0 + 16, 30, 14);
  renderer.info.autoReset = false; renderer.info.reset();
  if (composer) composer.render(); else renderer.render(scene, camera);
  drawOverlay();
  // авто-качество
  if (qAuto && phase === "play") {
    fpsAcc += dt; fpsN++; fpsCheck += dt;
    if (fpsCheck > 4) { const fps = fpsN / fpsAcc; fpsAcc = fpsN = fpsCheck = 0; if (fps < 40 && quality > 0) { quality--; applyQuality(); toast(`Графика: ${["низкая", "средняя", "высокая"][quality]} (для плавности)`); } }
  }
}

// ================= МЕНЮ =================
const PARTY = { title: "Аванпост", icon: "🏰", max: 6, noBots: true, text: "Го в «Аванпост» 🏰 Отбиваемся от скелетов вместе — заходи!", modes: [{ id: "coop", name: "Кооператив" }], onCancel: toMenu };
let loaded = false;
function setLoad(k) { $("load").firstElementChild.style.width = (k * 100).toFixed(0) + "%"; }
$("m-solo").onclick = () => { if (!loaded) return toast("Загрузка…"); $("screen-menu").classList.add("hidden"); begin({ room: null, cfg: { seed: Math.floor(Math.random() * 1e9), players: [{ id: "me", name: T.playerName() === "Друг" ? "Ты" : T.playerName(), color: "#3b82f6" }], me: 0 } }); };
$("m-party").onclick = async () => { if (!loaded) return toast("Загрузка…"); $("screen-menu").classList.add("hidden"); begin(await Party.host(GAME, PARTY)); };
$("m-menu").onclick = () => { location.href = "../"; };
$("q-btn").onclick = () => {
  if (qAuto) { qAuto = false; quality = 0; } else if (quality < 2) quality++; else { qAuto = true; quality = mobile ? 1 : 2; }
  try { localStorage.setItem("ob_q", qAuto ? "a" : quality); } catch (_) {}
  applyQuality();
};
T.init({ header: "#2a3b2c", bg: "#2a3b2c", back: "../" });
applyQuality();
requestAnimationFrame(frame);
loadAll(setLoad).then(() => {
  loaded = true; setLoad(1); $("load").style.opacity = 0.3;
  const inv = readInvite();
  if (inv) { $("screen-menu").classList.add("hidden"); Party.join(GAME, inv, PARTY).then(begin); return; }   // по приглашению — сразу в комнату
  cfg = null; buildWorld(12345, 3);
  // фоновая сцена меню: три аванпоста
  G.houses = houseSpots(3).map((s, i) => ({ idx: i, owner: i, x: s.x, z: s.z, lv: 1 + i, hp: 1, max: 1, wall: i, whp: 1, wmax: 1, alive: true, turrets: [i ? { type: "arrow", lv: 1 } : null, null, { type: ["catapult", "frost", "arrow"][i], lv: 1 }, null, null, null] }));
  cfg = { players: [0, 1, 2].map((i) => ({ color: Party.COLORS[i] })) }; G.houses.forEach(makeHouseView); cfg = null;
  renderer.shadowMap.needsUpdate = true;
}).catch((e) => { console.error(e); $("qual").textContent = "Не удалось загрузить модели 😕 Проверь интернет и открой заново"; });

// отладка и автотесты
window.__game = {
  get G() { return G; }, get phase() { return phase; }, get me() { return me; }, act, doAct, startWave, spawnEnemy, waveCleared,
  give(c, w, s) { const p = P(); p.wallet.c += c || 0; p.wallet.w += w || 0; p.wallet.s += s || 0; dirtyFull = true; },
  killAll() { for (const e of [...G.enemies.values()]) killEnemy(e, me); G.queue = []; },
  setQuality(q) { qAuto = false; quality = q; applyQuality(); }, openPanel: (k) => openPanel(k, nearHouse()), tp(x, z) { const p = P(); p.x = x; p.z = z; },
  get renderer() { return renderer; }, get shots() { return shots; }, get myTarget() { return myTarget; }, get composer() { return composer; }, set composer(c) { composer = c; }, scene, camera, sun
};
