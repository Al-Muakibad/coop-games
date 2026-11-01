/* Аванпост — кооперативная 3D-оборона. three.js + CC0-ассеты (KayKit, Quaternius, Poly Haven).
   Онлайн до 6 игроков: хозяин считает мир (монстры, волны, дома, башни, добычу), гости шлют координаты, попадания и действия.
   Если хозяин выходит — хозяином становится следующий игрок (миграция), вышедший может вернуться по той же ссылке. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { A, loadAll, makeChar, makeQ, cloneWorld, cloneWeapon, cloneProp, loadEnv } from "./assets.js";
import { buildTower, buildHouse } from "./builders.js";
import { buildWorld, buildNodeViews, updNode, updateWorld, grassT, rng } from "./world.js";
import { FX, COL } from "./fx.js";
import * as D from "./data.js";
import { S, load as loadSave, save, finishRun, locState } from "./save.js";
import * as AU from "./audio.js";
import * as UI from "./ui.js";

const T = window.TG, $ = (id) => document.getElementById(id);
const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
const BOT = "new_rpg_yar_bot", GAME = "oborona";
const PI2 = Math.PI * 2, clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, k) => a + (b - a) * k;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const esc = UI.esc;
const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#ec4899"];

// ---------- ссылки-приглашения: свой бот у этой игры ----------
if (window.Net) Net.inviteLink = (game, id) => `https://t.me/${BOT}?startapp=r${id}`;
if (T) T.gameLink = (game, param) => `https://t.me/${BOT}` + (param ? `?startapp=${param}` : "");
function readInvite() {
  const sp = new URLSearchParams(location.search), tg = T && T.tg;
  let hashP = null; try { hashP = new URLSearchParams(location.hash.slice(1)).get("tgWebAppStartParam"); } catch (_) {}
  const list = [sp.get("c"), sp.get("tgWebAppStartParam"), sp.get("startapp"), hashP, tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param];
  for (const c of list) { const m = c && /^(?:oborona-)?r([a-z0-9]{6})$/.exec(c); if (m) return m[1]; }
  return null;
}
const vib = (k, s) => { if (S.set.vib) T.haptic(k, s); };

// ================= РЕНДЕР =================
const canvas = $("gl"), ov = $("ov"), octx = ov.getContext("2d");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9d6ec); scene.fog = new THREE.Fog(0xa9d6ec, 30, 90);
const hemi = new THREE.HemisphereLight(0xe2f3ff, 0x587a3a, 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d2, 2.3);
sun.position.set(16, 30, 14); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 90 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);
const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 220);
const fx = new FX(scene);
let envMap = null;

const mobile = matchMedia("(pointer:coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
let qAuto = true, quality = mobile ? 1 : 2;
let composer = null, bloom = null, W = 1, H = 1, DPR = 1;
function readQ() { qAuto = S.set.q === "a" || S.set.q == null; quality = qAuto ? (mobile ? 1 : 2) : +S.set.q; applyQuality(); }
function applyQuality() {
  DPR = Math.min(devicePixelRatio || 1, [1, 1.5, 2][quality]);
  renderer.setPixelRatio(DPR);
  const sz = [0, 1024, 2048][quality];
  renderer.shadowMap.enabled = quality > 0;
  if (sz && sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.traverse((o) => { if (o.isMesh && o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
  renderer.shadowMap.needsUpdate = true;
  if (quality > 0) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality === 2 ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.95);
    composer.addPass(bloom); composer.addPass(new OutputPass());
  } else composer = null;
  fx.quality = [0.5, 0.8, 1][quality];
  resize();
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
document.addEventListener("visibilitychange", () => { lastSnapT = performance.now(); });

// ================= СОСТОЯНИЕ =================
let room = null, cfg = null, me = 0, phase = "menu";   // menu | lobby | play | over
let hosting = true, hostIdx = 0, ep = 0;               // кто считает мир; эпоха (растёт при смене хозяина)
const G = { t: 0, ph: "build", timer: 0, wave: 0, loc: "forest", players: [], houses: [], enemies: new Map(), drops: new Map(), nodes: [], merchant: null, F: [], over: false, eid: 1, did: 1, queue: [], spawnT: 0, bossId: 0, clouds: [], lost: 0, bossKills: 0 };
const isHost = () => hosting;
const send = (t, d) => { if (room) room.send(t, d); };
const sendFast = (t, d) => { if (room) room.sendFast(t, d); };
const P = () => G.players[me];
const world = new THREE.Group(); scene.add(world);
let WD = null;                     // данные мира (озёра, узлы, препятствия)
let obstacles = [];

// ---------- общие помощники ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function blobTexture() { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }
const BLOB = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
const BLOBGEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function blob(r) { const m = new THREE.Mesh(BLOBGEO, BLOB); m.scale.set(r * 2.2, 1, r * 2.2); m.position.y = 0.03; m.renderOrder = 1; return m; }
function hueFor(i) { const c = new THREE.Color((cfg && cfg.players[i] && cfg.players[i].color) || COLORS[i % 6]), hsl = {}; c.getHSL(hsl); return hsl.h - 0.6; }
function houseSpots(n) {
  if (n === 1) return [{ x: 0, z: 0 }];
  const r = 9 + n * 0.8;
  return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + i * PI2 / n + (n === 2 ? Math.PI / 2 : 0); return { x: Math.cos(a) * r, z: Math.sin(a) * r }; });
}
function merchantSpot(n) { return n === 1 ? { x: 0, z: 8.5 } : { x: 0, z: 1.5 }; }
function slotPos(h, s) { const base = Math.atan2(-h.z, -h.x) || Math.PI / 2, a = base + Math.PI / D.SLOTS + s * PI2 / D.SLOTS; return { x: h.x + Math.cos(a) * D.SLOT_R, z: h.z + Math.sin(a) * D.SLOT_R }; }
function gates() {
  const n = G.houses.length, R = D.MAP_R - 1.5, out = [];
  if (n === 1) for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; out.push({ x: Math.cos(a) * R, z: Math.sin(a) * R, h: 0 }); }
  else G.houses.forEach((h, i) => { const a = Math.atan2(h.z, h.x); for (const d of [-0.42, 0.42]) out.push({ x: Math.cos(a + d) * R, z: Math.sin(a + d) * R, h: i }); });
  return out;
}

// ================= МИР =================
let gateViews = [];
function buildLocation(locId, seed, n) {
  world.clear(); obstacles = []; gateViews = [];
  const L = D.LOC[locId] || D.LOCS[0];
  const spots = houseSpots(n), msp = merchantSpot(n);
  WD = buildWorld(world, renderer, locId, seed, spots, msp);
  buildNodeViews(world, WD);
  G.nodes = WD.nodes;
  G.nodes.forEach((nd) => updNode(WD, nd));
  obstacles = WD.obstacles.slice();
  // небо, свет, туман по биому
  const sk = L.sky;
  DAY.sky.set(sk.day); NIGHT.sky.set(sk.night); DAY.sunC.set(sk.sun); NIGHT.sunC.set(sk.sunNight); DAY.fog.set(sk.fog);
  hemi.color.set(sk.hemi[0]); hemi.groundColor.set(sk.hemi[1]);
  scene.background.copy(DAY.sky); scene.fog.color.copy(DAY.fog);
  renderer.shadowMap.needsUpdate = true;
  navDirty = true;
}
const DAY = { sky: new THREE.Color(), fog: new THREE.Color(), hemi: 1.05, sun: 2.3, sunC: new THREE.Color() };
const NIGHT = { sky: new THREE.Color(), hemi: 0.55, sun: 1.15, sunC: new THREE.Color() };
function buildGates() {
  gateViews.forEach((g) => world.remove(g)); gateViews = [];
  for (const gt of gates()) {
    const g = new THREE.Group(); g.position.set(gt.x, 0.05, gt.z);
    const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb36bff).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 40).rotateX(-Math.PI / 2), ringM); g.add(ring);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a0830, transparent: true, opacity: 0.6, depthWrite: false })); g.add(inner);
    for (let i = 0; i < 4; i++) { const st = cloneNature2("Pebble_Square_2"); const a = i / 4 * PI2 + 0.4; st.position.set(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6); st.scale.setScalar(1.5); g.add(st); }
    g.userData.ring = ring; world.add(g); gateViews.push(g);
  }
}
function cloneNature2(n) { const src = A.nature[n]; const g = new THREE.Group(); if (src) g.add(src.clone()); return g; }

// ---------- поле проходимости и «поток» к домам (обход деревьев, камней, воды) ----------
const GR = 1, GN = Math.ceil((D.MAP_R * 2 + 6) / GR), OFF = GN * GR / 2;
let blocked = new Uint8Array(GN * GN), flows = [], navDirty = true, navT = 0;
const gi = (x, z) => { const i = Math.floor((x + OFF) / GR), j = Math.floor((z + OFF) / GR); return i < 0 || j < 0 || i >= GN || j >= GN ? -1 : i + j * GN; };
const cx = (i) => (i % GN) * GR - OFF + GR / 2, cz = (i) => Math.floor(i / GN) * GR - OFF + GR / 2;
function markCircle(arr, x, z, r) { const r2 = r * r; for (let i = Math.floor((x - r + OFF) / GR); i <= Math.floor((x + r + OFF) / GR); i++) for (let j = Math.floor((z - r + OFF) / GR); j <= Math.floor((z + r + OFF) / GR); j++) { if (i < 0 || j < 0 || i >= GN || j >= GN) continue; const px = i * GR - OFF + GR / 2, pz = j * GR - OFF + GR / 2; if ((px - x) * (px - x) + (pz - z) * (pz - z) <= r2) arr[i + j * GN] = 1; } }
function rebuildNav() {
  navDirty = false;
  blocked = new Uint8Array(GN * GN);
  for (let k = 0; k < GN * GN; k++) { const x = cx(k), z = cz(k); if (Math.hypot(x, z) > D.MAP_R - 0.6) blocked[k] = 1; else if (WD && WD.lakes.length && WD.L.water !== "ice" && WD.lakeD(x, z) < 0.2) blocked[k] = 1; }
  for (const o of obstacles) markCircle(blocked, o.x, o.z, o.r * 0.85);
  for (const nd of G.nodes) if (nd.amt > 0) markCircle(blocked, nd.x, nd.z, (nd.r || 0.5) * 0.8);
  for (const h of G.houses) if (h.alive) h.turrets.forEach((t, s) => { if (t) { const p = slotPos(h, s); markCircle(blocked, p.x, p.z, 0.8); } });
  flows = G.houses.map((h) => (h.alive ? flowTo(h) : null));
}
function flowTo(h) {
  const distF = new Float32Array(GN * GN).fill(1e9), q = [];
  // цель: кольцо вокруг дома (у стены)
  const R = (h.whp > 0 ? D.WALL_R : D.HOUSE_R) + 1.0;
  for (let k = 0; k < GN * GN; k++) { const d = dist(cx(k), cz(k), h.x, h.z); if (d <= R + 0.8) { distF[k] = 0; q.push(k); } }
  // волна по сетке (8 соседей)
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let head = 0;
  while (head < q.length) {
    const k = q[head++], i = k % GN, j = (k / GN) | 0, dk = distF[k];
    for (const [di, dj, c] of nb) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue;
      const nk = ni + nj * GN; if (blocked[nk] && distF[k] > 0.5) continue;
      if (di && dj && (blocked[i + di + j * GN] || blocked[i + (j + dj) * GN])) continue;
      const nd = dk + c * (blocked[nk] ? 6 : 1);
      if (nd < distF[nk] - 0.01) { distF[nk] = nd; q.push(nk); }
    }
  }
  const dirX = new Float32Array(GN * GN), dirZ = new Float32Array(GN * GN);
  for (let k = 0; k < GN * GN; k++) {
    if (distF[k] >= 1e9) continue;
    const i = k % GN, j = (k / GN) | 0; let best = distF[k], bx = 0, bz = 0;
    for (const [di, dj] of nb) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue; const nk = ni + nj * GN; if (distF[nk] < best) { best = distF[nk]; bx = di; bz = dj; } }
    const l = Math.hypot(bx, bz) || 1; dirX[k] = bx / l; dirZ[k] = bz / l;
  }
  return { distF, dirX, dirZ };
}

// ================= ДОМА =================
function makeHouseView(h) {
  const g = new THREE.Group(); g.position.set(h.x, 0, h.z); world.add(g);
  h.view = { g, model: null, key: "", wall: -1, segs: [], turrets: [], alive: true, slots: [], shake: 0, fx: [] };
  const ringG = new THREE.RingGeometry(0.7, 0.88, 28).rotateX(-Math.PI / 2);
  for (let s = 0; s < D.SLOTS; s++) {
    const p = slotPos(h, s), m = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.35, depthWrite: false }));
    m.position.set(p.x - h.x, 0.05, p.z - h.z); g.add(m); h.view.slots.push(m);
  }
  updHouseView(h);
}
function updHouseView(h) {
  const v = h.view; if (!v) return;
  const hue = hueFor(h.owner), style = h.style || "medieval";
  const key = h.alive ? style + h.lv : "dead";
  if (v.key !== key) {
    if (v.model) { v.g.remove(v.model); fx.puff(h.x, h.z, 24, COL.dust, 0.9); }
    if (h.alive) { const b = buildHouse(style, h.lv, hue); v.model = b.g; v.fx = b.fx; v.flag = b.flag; v.hh = b.h; }
    else { v.model = cloneWorld("building_destroyed"); v.model.scale.setScalar(2.6); v.fx = []; v.hh = 2; }
    v.model.rotation.y = Math.atan2(-h.x, -h.z) || 0;
    v.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    v.g.add(v.model);
    if (v.key && h.alive && v.key !== "dead") { v.pop = 1; fx.levelup(h.x, h.z); AU.play("upgrade", { x: h.x, z: h.z }); }
    v.key = key; renderer.shadowMap.needsUpdate = true;
  }
  const wl = h.alive && h.whp > 0 ? h.wall : 0;
  if (v.wall !== wl) {
    v.segs.forEach((s) => v.g.remove(s)); v.segs = [];
    if (wl > 0) {
      const name = ["", "fence_wood_straight", "fence_stone_straight", "wall_straight"][wl], N = 11;
      for (let i = 0; i < N; i++) {
        const a = i / N * PI2, seg = new THREE.Group(), m = cloneWorld(name);
        if (name === "wall_straight") { m.scale.set(0.85, 1.1, 1); m.rotation.y = Math.PI / 2; } else { m.position.x = 1; seg.scale.setScalar(1.45); }
        m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        seg.add(m); seg.position.set(Math.cos(a) * D.WALL_R, 0, Math.sin(a) * D.WALL_R); seg.rotation.y = -a; v.g.add(seg); v.segs.push(seg);
      }
    }
    if (v.wall > 0 && wl === 0) { for (let i = 0; i < 6; i++) fx.chips(h.x + Math.cos(i) * D.WALL_R, 0.5, h.z + Math.sin(i) * D.WALL_R, COL.wood); fx.puff(h.x, h.z, 16, COL.dust, 0.8); AU.play("collapse", { x: h.x, z: h.z, vol: 0.6 }); }
    v.wall = wl; renderer.shadowMap.needsUpdate = true;
  }
  for (let s = 0; s < D.SLOTS; s++) {
    const t = h.alive ? h.turrets[s] : null, k2 = t ? t.type + t.lv : "", cur = v.turrets[s];
    if ((cur && cur.key) === k2) continue;
    if (cur && cur.obj) v.g.remove(cur.obj);
    v.turrets[s] = { key: k2, obj: null };
    v.slots[s].visible = !t && h.alive;
    if (t) {
      const p = slotPos(h, s), b = buildTower(t.type, t.lv, hue);
      b.g.position.set(p.x - h.x, 0, p.z - h.z); b.g.rotation.y = Math.atan2(p.x - h.x, p.z - h.z);
      b.g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
      v.g.add(b.g); Object.assign(v.turrets[s], { obj: b.g, b, pop: 1 });
      fx.puff(p.x, p.z, 14, COL.dust, 0.7); fx.sparkle(p.x, 2, p.z, COL.gold, 12);
    }
    renderer.shadowMap.needsUpdate = true; navDirty = true;
  }
}
function towerTop(h, s) { const p = slotPos(h, s), tv = h.view && h.view.turrets[s]; const y = tv && tv.b ? tv.b.top.y : 3; return { x: p.x, y, z: p.z }; }

// ================= ПЕРСОНАЖИ =================
const playerViews = [], enemyViews = new Map();
function makePlayerView(p) {
  const hero = D.HEROES[p.idx % D.HEROES.length], c = makeChar(hero);
  c.obj.scale.setScalar(0.72);
  const root = new THREE.Group(); root.add(c.obj); root.add(blob(0.5)); world.add(root);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.position.y = 0.05; root.add(ring);
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); orb.visible = false; root.add(orb);
  const v = { p, c, root, orb, ring, hero, wpn: null, wkey: "", arm: "", base: null, upper: null, recoil: 0, hurt: 0, deadShown: false, pos: new THREE.Vector3(p.x, 0, p.z), blades: [], rage: 0 };
  v.cloth = c.meshes.filter((m) => /Body|Arm|Helmet|Hat|Cape/i.test(m.name)).map((m) => { m.material = m.material.clone(); return m; });
  c.meshes.forEach((m) => { if (!v.cloth.includes(m)) m.material = m.material.clone(); });
  v.allMats = c.meshes.map((m) => m.material);
  playerViews[p.idx] = v;
  updGear(v);
  return v;
}
function updGear(v) {
  const p = v.p, Wp = D.WEAPONS[p.wpn] || D.WEAPONS.crossbow;
  if (v.wkey !== p.wpn) {
    const hand = v.c.bone("handslotr");
    if (v.wpn && v.wpn.parent) v.wpn.parent.remove(v.wpn);
    v.wpn = cloneWeapon(Wp.model);
    if (/Axe_Bronze|Sword_Bronze/.test(Wp.model)) v.wpn.scale.setScalar(0.9);
    if (Wp.tint) v.wpn.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(Wp.tint); } });
    if (hand) hand.add(v.wpn);
    v.wkey = p.wpn;
  }
  if (v.arm !== p.arm) { const a = D.ARMOR[p.arm] || D.ARMOR.none; v.cloth.forEach((m) => m.material.color.set(a.tint || 0xffffff)); v.arm = p.arm; }
  const am = D.AMULETS[p.amu]; v.orb.visible = !!(am && am.color); if (v.orb.visible) v.orb.material.color.set(am.color).multiplyScalar(2.2);
  // кружащие клинки (оружие «клинки» и перк «призрачные клинки»)
  const st = p.st || D.stats(p), nb = (st.kind === "orbit" ? st.n : 0) + st.ghost;
  while (v.blades.length < nb) { const b = cloneProp("Sword_Bronze"); b.scale.setScalar(0.85); if (v.blades.length >= (st.kind === "orbit" ? st.n : 0)) b.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x6a8cff); o.material.emissiveIntensity = 1.2; o.material.transparent = true; o.material.opacity = 0.75; } }); world.add(b); v.blades.push(b); }
  while (v.blades.length > nb) world.remove(v.blades.pop());
}
function playAnim(v, slot, name, fade) {
  if (v[slot] === name) return;
  const old = v[slot] && v.c.act(v[slot]); v[slot] = name;
  if (old) old.fadeOut(fade || 0.2);
  if (name) { const a = v.c.act(name); if (a) { a.reset(); a.setEffectiveWeight(1); a.fadeIn(fade || 0.2); a.play(); } }
}
function playOnce(v, name, ts) { const a = v.c.act(name); if (!a) return null; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = ts || 1; a.fadeIn(0.1); a.play(); return a; }

// ---------- монстры ----------
const KK_ANIM = {
  walker: ["Walking_D_Skeletons", "1H_Melee_Attack_Chop"], runner: ["Running_C", "Unarmed_Melee_Attack_Punch_A"], caster: ["Walking_A", "Spellcast_Shoot"], brute: ["Walking_A", "2H_Melee_Attack_Chop"],
  orc: ["Running_A", "1H_Melee_Attack_Chop"], orc_archer: ["Walking_A", "1H_Ranged_Shoot"], orc_brute: ["Walking_A", "2H_Melee_Attack_Chop"], zombie: ["Walking_D_Skeletons", "Unarmed_Melee_Attack_Punch_A"], bomber: ["Running_A", "Unarmed_Melee_Attack_Punch_A"],
  boss_skel: ["Walking_D_Skeletons", "2H_Melee_Attack_Chop"], boss_orc: ["Running_A", "2H_Melee_Attack_Chop"], boss_giant: ["Walking_A", "2H_Melee_Attack_Chop"]
};
function monScale(M, e) { return (M.scale || 1) * (e.el ? 1.25 : 1); }
function makeEnemyView(e) {
  const M = D.MON[e.type]; let c;
  if (M.q) c = makeQ(M.q, M.qs * (e.el ? 1.25 : 1)); else { c = makeChar(M.model); c.obj.scale.setScalar(monScale(M, e)); }
  const root = new THREE.Group(); root.add(c.obj); const bl = blob(M.r * (e.el ? 1.25 : 1)); root.add(bl); world.add(root);
  const mats = []; c.meshes.forEach((m) => { m.material = m.material.clone(); mats.push(m.material); if (!m.material.emissive) m.material.emissive = new THREE.Color(); });
  let tint = M.tint; if (e.type === "boss_dragon" && WD && WD.L.dragonTint) tint = WD.L.dragonTint;
  if (tint) mats.forEach((m) => m.color.multiply(new THREE.Color(tint)));
  if (M.wpn && !M.q) { const h = c.bone("handslotr"); if (h) h.add(cloneWeapon(M.wpn)); }
  if (M.shield && !M.q) { const h = c.bone("handslotl"); if (h) h.add(cloneWeapon(M.shield)); }
  if (e.type === "bomber") { const b = cloneProp("Barrel"); b.scale.setScalar(0.7); b.position.set(0, 0.2, -0.6); const ch = c.bone("chest"); if (ch) ch.add(b); }
  let aura = null;
  if (e.el) { const col = D.ELITE[["", "rage", "shield", "regen"][e.el]].color; aura = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.95, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.8), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); aura.position.y = 0.06; aura.scale.setScalar(M.r * 1.6 + 0.6); root.add(aura); }
  const v = { e, c, root, mats, base: null, flash: 0, dead: 0, spawn: 0, aura, bl };
  root.position.set(e.x, 0, e.z); root.rotation.y = e.ry || 0;
  enemyViews.set(e.id, v);
  if (e.spawning) {
    if (!M.q && /^sk_/.test(M.model)) { playOnce(v, "Spawn_Ground_Skeletons", 2.4); v.spawn = 1.6; }
    else { v.spawn = 0.8; v.rise = 0.8; }
    fx.puff(e.x, e.z, 10, COL.dust, 0.6); fx.ring(e.x, e.z, 0.2, 1.4, 0.5, 0xb36bff);
  }
  if (M.boss) { onBossAppear(e); }
  return v;
}
function enemyAnim(e) {
  const M = D.MON[e.type];
  if (M.q) return [M.qa.move, M.qa.atk, M.qa.die];
  const a = KK_ANIM[e.type] || ["Walking_A", "1H_Melee_Attack_Chop"];
  return [M.walk || a[0], a[1], /^sk_/.test(M.model) ? "Death_C_Skeletons" : "Death_A"];
}
function killEnemyView(id, quiet) {
  const v = enemyViews.get(id); if (!v || v.dead) return;
  v.dead = 0.001;
  const e = v.e, M = D.MON[e.type];
  playAnim(v, "base", null, 0.1);
  const die = enemyAnim(e)[2]; if (!playOnce(v, die, 1.3)) v.noDie = true;
  if (!quiet) {
    fx.death(e.x, e.z, e.type === "bomber" ? COL.red : M.fam === "undead" ? COL.bone : M.fam === "beasts" || M.fam === "flyers" ? COL.acid : COL.red);
    AU.play(M.snd === "bone" ? "bone" : Math.random() < 0.5 ? "die" : "die2", { x: e.x, z: e.z, vol: 0.55 });
  }
  if (M.boss) { fx.explosion(e.x, e.z, 4); fx.text(e.x, 3.5, e.z, "БОСС ПОВЕРЖЕН!", "#ffd36a", 26, 1.8); AU.play("roar2", { vol: 1 }); G.bossKills++; }
}
function removeEnemyView(id) { const v = enemyViews.get(id); if (v) { world.remove(v.root); enemyViews.delete(id); } }
let bossCam = 0, bossCamPos = new THREE.Vector3();
function onBossAppear(e) {
  const M = D.MON[e.type];
  msg(M.name, "Босс вышел на поле боя!", 2800, "boss");
  AU.play(M.snd || "roar", { vol: 1 }); AU.music("boss"); vib("notify", "warning");
  bossCam = 1.8; bossCamPos.set(e.x, 0, e.z); fx.shake = 1;
}

// ---------- торговец ----------
let merchView = null;
function updMerchantView() {
  const on = !!G.merchant;
  if (on && !merchView) {
    const sp = merchantSpot(G.houses.length), c = makeChar("merchant");
    c.obj.scale.setScalar(0.72);
    const root = new THREE.Group(); root.position.set(sp.x, 0, sp.z); root.add(c.obj); root.add(blob(0.5));
    const cart = cloneProp("Stall_Cart_Empty"); cart.scale.setScalar(0.85); cart.position.set(-1.6, 0, -1.2); cart.rotation.y = 0.5;
    const ch = cloneProp("Chest_Wood"); ch.scale.setScalar(0.6); ch.position.set(1.2, 0, -0.4);
    const b = cloneProp("Barrel_Apples"); b.position.set(1.0, 0, 0.7); const pt = cloneProp("Potion_2"); pt.scale.setScalar(2); pt.position.set(1.2, 0.73, -0.4);
    root.add(cart, ch, b, pt); root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); world.add(root);
    c.obj.rotation.y = 0.3;
    merchView = { root, c, base: null };
    playAnim(merchView, "base", "Idle");
    fx.puff(sp.x, sp.z, 24, COL.gold, 0.6); fx.sparkle(sp.x, 1.5, sp.z, COL.gold, 20); AU.play("bell");
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
  fire:  { geo: new THREE.IcosahedronGeometry(0.28, 1), col: [4.0, 1.8, 0.5], trail: COL.fire, size: 0.6, hit: COL.fire },
  arrow: { geo: new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5).rotateX(Math.PI / 2), col: [1.8, 1.6, 1.2], trail: COL.white, size: 0.18, hit: COL.spark },
  spear: { geo: new THREE.CylinderGeometry(0.08, 0.06, 1.8, 6).rotateX(Math.PI / 2), col: [1.6, 1.3, 0.9], trail: COL.white, size: 0.25, hit: COL.spark },
  stone: { geo: new THREE.DodecahedronGeometry(0.32, 0), col: [0.55, 0.52, 0.5], trail: COL.dust, size: 0.3, hit: COL.stone, lit: true },
  ice:   { geo: new THREE.OctahedronGeometry(0.24, 0), col: [1.6, 3.2, 4.0], trail: COL.ice, size: 0.4, hit: COL.ice },
  venom: { geo: new THREE.IcosahedronGeometry(0.22, 1), col: [1.4, 3.6, 0.6], trail: COL.venom, size: 0.45, hit: COL.acid },
  acid:  { geo: new THREE.IcosahedronGeometry(0.26, 1), col: [1.6, 3.6, 0.6], trail: COL.acid, size: 0.5, hit: COL.acid },
  curse: { geo: new THREE.IcosahedronGeometry(0.24, 1), col: [2.4, 0.8, 3.6], trail: COL.purple, size: 0.5, hit: COL.purple },
  sting: { geo: new THREE.ConeGeometry(0.06, 0.5, 5).rotateX(Math.PI / 2), col: [3.2, 2.6, 0.5], trail: COL.gold, size: 0.2, hit: COL.gold },
  web:   { geo: new THREE.IcosahedronGeometry(0.3, 1), col: [2.5, 2.5, 2.5], trail: COL.white, size: 0.4, hit: COL.white },
  rocket:{ geo: new THREE.CylinderGeometry(0.09, 0.12, 0.6, 7).rotateX(Math.PI / 2), col: [3.0, 1.2, 0.4], trail: COL.fire, size: 0.5, hit: COL.fire },
  boomer:{ geo: new THREE.TorusGeometry(0.28, 0.07, 5, 10, Math.PI * 1.2), col: [2.6, 2.0, 1.0], trail: COL.gold, size: 0.2, hit: COL.spark },
  shuriken: { geo: shurikenGeo(), col: [2.6, 2.6, 3.0], trail: COL.white, size: 0.18, hit: COL.spark }
};
function shurikenGeo() { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = i / 8 * PI2, r = i % 2 ? 0.1 : 0.32; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(r, 0); } const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }); g.rotateX(Math.PI / 2); return g; }
for (const k in PROJ) {
  const pr = PROJ[k];
  const mat = pr.lit ? new THREE.MeshLambertMaterial({ color: new THREE.Color(...pr.col) }) : new THREE.MeshBasicMaterial({ color: new THREE.Color(...pr.col), toneMapped: false });
  pr.mesh = new THREE.InstancedMesh(pr.geo, mat, 180); pr.mesh.count = 0; pr.mesh.frustumCulled = false; scene.add(pr.mesh);
}
let shots = [];

// ================= СТАРТ МАТЧА =================
function newPlayer(c, i, spots) {
  const h = spots[i % spots.length], a = Math.atan2(-h.z, -h.x) || Math.PI / 2;
  const meta = c.meta || {}, items = { potion: 1, rage: 0, bomb: 0, scroll: 0 };
  return { idx: i, id: c.id, uid: c.uid || "", name: c.name, color: c.color, x: h.x + Math.cos(a) * 3.5, z: h.z + Math.sin(a) * 3.5, ry: 0, hp: 100, alive: true, downT: 0,
    wallet: { c: 20 + 12 * (meta.coins || 0), w: 10, s: 5 }, xp: 0, lvl: 1, perks: {}, wpn: c.wpn && D.WEAPONS[c.wpn] ? c.wpn : "crossbow", arm: "none", amu: "none", items, kills: 0, dmg: 0, built: 0,
    ready: false, house: Math.min(i, spots.length - 1), tgt: 0, mv: 0, seq: 0, present: true, gn: -1, meta, style: c.style || "medieval", rageT: 0, angelUsed: false, seen: 0, killN: 0 };
}
function begin(c, snap) {
  cfg = c.cfg; room = c.room; me = cfg.me || 0;
  hosting = !room || !!(c.host); hostIdx = c.hostIdx || 0; ep = c.ep || 0;
  ["menu", "map", "lobby", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
  UI.closeSheet();
  for (const id of [...enemyViews.keys()]) removeEnemyView(id);
  playerViews.forEach((v) => { if (v) { world.remove(v.root); v.blades.forEach((b) => world.remove(b)); } }); playerViews.length = 0;
  if (merchView) { world.remove(merchView.root); merchView = null; }
  shots = []; G.enemies.clear(); G.drops.clear(); G.F = []; G.over = false; G.t = 0; G.wave = 0; G.ph = "build"; G.timer = D.BUILD_FIRST; G.queue = []; G.merchant = null; G.bossId = 0; G.eid = 1; G.did = 1; G.clouds = []; G.lost = 0; G.bossKills = 0;
  G.loc = cfg.loc || "forest";
  const n = cfg.houses || cfg.players.length, spots = houseSpots(n);
  buildLocation(G.loc, cfg.seed, n);
  const wallMul = 1;
  G.houses = spots.map((s, i) => { const pc = cfg.players[i] || {}; const mh = 1 + 0.1 * ((pc.meta && pc.meta.wall) || 0); return { idx: i, owner: i, x: s.x, z: s.z, lv: 1, hp: D.HOUSE_LV[1].hp * mh, max: D.HOUSE_LV[1].hp * mh, mh, wall: 0, whp: 0, wmax: 0, alive: true, turrets: Array(D.SLOTS).fill(null), style: pc.style && pc.style !== "medieval" ? pc.style : ((D.LOC[G.loc] || {}).house || "medieval"), pools: {} }; });
  G.houses.forEach(makeHouseView);
  buildGates();
  G.players = cfg.players.map((pc, i) => newPlayer(pc, i, spots));
  G.players.forEach((p) => { p.st = D.stats(p); p.hp = p.st.maxhp; makePlayerView(p); });
  lastLvl = 1; perkQueue = 0; myTarget = null; fireCd = 0.5; gatherCd = 0; lastSnapT = snapRx = performance.now(); hostGoneT = 0; camPos.set(P().x, 0, P().z);
  if (snap) applySnap(snap, true);
  phase = "play";
  ["hud", "acts", "btn-set"].forEach((id) => $(id).classList.remove("hidden"));
  $("net").classList.toggle("hidden", !room); $("team").classList.toggle("hidden", !room);
  $("perks").classList.add("hidden");
  if (room) wireRoom();
  const L = D.LOC[G.loc];
  msg(`${L.icon} ${L.name}`, `Продержись ${L.waves} волн · первая через ${D.BUILD_FIRST} с`, 3600);
  St.gameStart({ players: G.players.length, mode: room ? "party" : "solo", loc: G.loc });
  vib("notify", "success");
  AU.music("build");
  updMerchantView();
  hudDirty = true; teamDirty = true;
  if (isHost() && room) setTimeout(() => { dirtyFull = true; }, 300);
}

// ================= СЕТЬ =================
let lastSnapT = 0, snapRx = 0, otherRx = 0, hostGoneT = 0, seenAt = {};
function wireRoom() {
  ["s", "i", "h", "a", "over", "start", "left", "host-left", "roster", "full", "hello", "welcome", "join-late", "bye2"].forEach((t) => room.off(t));
  room.on("s", (s, from) => {
    // два хозяина (после смены): побеждает более поздняя эпоха, при равенстве — меньший номер игрока
    if (hosting) { if (s.ep > ep || (s.ep === ep && s.hi < me)) { hosting = false; (G.mlog = G.mlog || []).push(["yield", s.hi, s.ep, ep]); } else return; }
    else if (s.ep < ep || (s.ep === ep && s.hi > hostIdx)) return;
    ep = s.ep; hostIdx = s.hi;
    lastSnapT = snapRx = performance.now(); hostGoneT = 0; applySnap(s);
  });
  room.on("i", (d, from) => { const p = G.players.find((q) => q.id === from); if (!p || p.idx === me) return; if (p.idx !== hostIdx) otherRx = performance.now(); p.x = d[0] / 10; p.z = d[1] / 10; p.ry = d[2] / 100; p.tgt = d[3]; p.mv = d[4]; p.gn = d[5]; p.seen = performance.now(); if (isHost() && !p.present) { p.present = true; dirtyFull = true; } });
  room.on("h", (d, from) => { if (!isHost()) return; const p = G.players.find((q) => q.id === from); if (p) (d || []).forEach((hh) => hitEnemy(hh[0], hh[1], p.idx, hh[2], hh[3])); });
  room.on("a", (d, from) => { if (!isHost()) return; const p = G.players.find((q) => q.id === from); if (p) doAct(p.idx, d); });
  room.on("over", (d) => { if (!isHost()) onOver(d); });
  room.on("left", (id) => { const p = G.players.find((q) => q.id === id); if (p && p.present) { p.present = false; dirtyFull = true; msg(`${p.name} вышел`, "Он может вернуться по той же ссылке", 2200); teamDirty = true; } });
  room.on("host-left", () => {   // ушёл хозяин комнаты (сетевой). Если мир уже ведёт другой игрок — просто отмечаем ушедшего
    if (phase !== "play") return;
    const nh = (room.players || []).find((q) => q.host), gone = nh && G.players.find((q) => q.id === nh.id);
    if (gone && gone.idx !== hostIdx) { if (gone.present) { gone.present = false; teamDirty = true; if (hosting) dirtyFull = true; } return; }
    if (!hosting) hostGoneT = performance.now();   // сеть могла «проспать» (телефон свернули) — решаем в netStatus, если снимков так и нет
  });
  room.on("start", () => {});
  // поздний вход и возвращение: игрок с той же меткой занимает свой слот
  room.on("hello", (d, from) => { if (isHost() && phase === "play") lateJoin(from, d); });
  room.on("join-late", () => {});
}
function lateJoin(from, d) {
  if (!d) return;
  let p = G.players.find((q) => q.uid && q.uid === d.uid);
  if (!p && G.players.length < 6) {   // новый игрок посреди боя: без своего дома, живёт у ближайшего
    const i = G.players.length, nm0 = (d.name || "Игрок").slice(0, 18), pc = { id: from, name: G.players.some((q) => q.name === nm0) ? `${nm0} ${i + 1}` : nm0, color: COLORS[i % 6], uid: d.uid, style: d.style, meta: d.meta, wpn: d.wpn };
    cfg.players.push(pc); p = newPlayer(pc, i, G.houses.map((h) => ({ x: h.x, z: h.z }))); p.house = G.houses.findIndex((h) => h.alive); p.st = D.stats(p); p.hp = p.st.maxhp;
    G.players.push(p); makePlayerView(p);
  }
  if (!p) return;
  p.id = from; p.present = true; p.seen = performance.now(); cfg.players[p.idx].id = from;
  dirtyFull = true; teamDirty = true;
  const c2 = Object.assign({}, cfg, { me: p.idx }); delete c2.me;
  send("welcome", { to: from, cfg: c2, me: p.idx, ep, hi: me, snap: makeSnap(true) });
  msg(`${p.name} вернулся в бой`, "", 1800);
}
// смена хозяина: оставшийся игрок с наименьшим номером продолжает считать мир
function migrate(why) {
  if (hosting || !room || phase !== "play") return;
  const now = performance.now();
  const cands = G.players.filter((p) => p.present && p.idx !== hostIdx && (p.idx === me || now - (p.seen || 0) < 7000));
  if (!cands.length) return;
  const nh = Math.min(...cands.map((p) => p.idx));
  (G.mlog = G.mlog || []).push([why, hostIdx, nh, ep, Math.round(now - lastSnapT)]);
  const oldHost = G.players[hostIdx];
  if (oldHost && nh === me) oldHost.present = false;
  if (nh !== me) { lastSnapT = now; msg("Хозяин вышел", `Мир теперь ведёт ${G.players[nh].name}`, 2600); teamDirty = true; return; }   // ждём снимков нового хозяина (эпоха вырастет у него)
  hostIdx = nh; ep++;
  // я — новый хозяин: восстанавливаем точные значения из того, что приходило в снимках
  hosting = true;
  for (const e of G.enemies.values()) { const M = D.MON[e.type]; e.max = e.max > 1 ? e.max : M.hp * D.hpMul(G.wave || 1, G.players.length, D.LOC[G.loc].diff) * (M.boss ? 1.6 : 1) * (e.el ? 2.5 : 1); e.hp = Math.max(1, (e.hpPct || 100) / 100 * e.max); e.x = e.tx ?? e.x; e.z = e.tz ?? e.z; e.cd = 1; e.spawnT = 0; e.h = nearestHouse(e.x, e.z)?.idx ?? 0; e.dmgBy = {}; e.ab = {}; }
  if (G.ph === "wave") { const L = D.LOC[G.loc]; const full = D.makeWave(G.loc, G.wave, activePlayers(), Math.random).filter((k) => !D.MON[k].boss); G.queue = full.slice(0, Math.max(0, qLeft)); }
  G.eid = Math.max(G.eid, ...[...G.enemies.keys()], 0) + 100; G.did = Math.max(G.did, ...[...G.drops.keys()], 0) + 100;
  dirtyFull = true; navDirty = true;
  msg("Хозяин вышел", "Теперь мир ведёшь ты — игра продолжается!", 3000);
  vib("notify", "warning");
}

// ---------- снимок (хозяин → все) ----------
const ENEMY_T = D.MON_IDS;
let snapT = 0, lastFull = 0, dirtyFull = true, qLeft = 0;
function makeSnap(full) {
  const E = [];
  for (const e of G.enemies.values()) E.push(e.id, ENEMY_T.indexOf(e.type), Math.round(e.x * 10), Math.round(e.z * 10), Math.round(e.ry * 10), Math.max(1, Math.round(e.hp / e.max * 100)),
    (e.slowT > 0 ? 1 : 0) | (e.atk ? 2 : 0) | (e.spawnT > 0 ? 4 : 0) | (e.burnT > 0 ? 8 : 0) | (e.poisonT > 0 ? 16 : 0) | (e.enr ? 32 : 0) | (e.chg > 0 ? 64 : 0), e.el || 0);
  const s = { ep, hi: me, ph: G.ph === "build" ? 0 : 1, tm: Math.ceil(G.timer), w: G.wave, E, b: G.bossId, q: G.queue.length,
    P: G.players.map((p) => [Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.ry * 100), Math.ceil(p.hp), p.alive ? 1 : 0, p.tgt || 0, Math.floor(p.xp), p.lvl, p.wallet.c, p.wallet.w, p.wallet.s, p.kills, p.seq, p.ready ? 1 : 0, p.present ? 1 : 0, Math.ceil(p.downT), p.gn, p.mv, p.rageT > 0 ? 1 : 0]) };
  if (G.F.length) { s.F = G.F; G.F = []; }
  if (full || G.t - lastFull > 1.2 || dirtyFull) {
    lastFull = G.t; dirtyFull = false;
    s.G = G.players.map((p) => [p.wpn, p.arm, p.amu, Object.entries(p.perks).map(([k, v]) => k + v).join(","), Object.entries(p.items).map(([k, v]) => k + v).join(","), p.uid, p.style, p.name, p.color, p.house, JSON.stringify(p.meta || {})]);
    s.H = G.houses.map((h) => [h.lv, Math.ceil(h.hp), h.wall, Math.ceil(h.whp), h.alive ? 1 : 0, h.turrets.map((t) => (t ? t.type + ":" + t.lv : "")).join(","), Math.round(h.max), Math.round(h.wmax), h.style, poolStr(h)]);
    s.D = [...G.drops.values()].map((d) => [d.id, Math.round(d.x * 10), Math.round(d.z * 10), d.v, d.o]);
    s.N = G.nodes.map((n) => n.amt).join("");
    s.M = G.merchant ? G.merchant.stock : 0;
    s.L = G.loc; s.lost = G.lost;
  }
  return s;
}
const poolStr = (h) => Object.entries(h.pools).map(([k, p]) => [k, p.paid.c, p.paid.w, p.paid.s, Object.entries(p.by).map(([i, b]) => `${i}.${b.c}.${b.w}.${b.s}`).join("_")].join("~")).join("|");
function parsePools(str) {
  const out = {}; if (!str) return out;
  for (const part of str.split("|")) { const [k, c, w, s, by] = part.split("~"); const o = { paid: { c: +c, w: +w, s: +s }, by: {} }; (by || "").split("_").filter(Boolean).forEach((x) => { const [i, a, b, d] = x.split(".").map(Number); o.by[i] = { c: a, w: b, s: d }; }); out[k] = o; }
  return out;
}
function applySnap(s, initial) {
  G.ph = s.ph ? "wave" : "build"; G.timer = s.tm; qLeft = s.q || 0;
  if (s.w !== G.wave) { if (s.w > G.wave && s.w >= 1) onWaveStart(s.w); G.wave = s.w; }
  G.bossId = s.b;
  const seen = new Set();
  for (let i = 0; i < s.E.length; i += 8) {
    const id = s.E[i]; seen.add(id);
    let e = G.enemies.get(id);
    const x = s.E[i + 2] / 10, z = s.E[i + 3] / 10, fl = s.E[i + 6];
    if (!e) { const type = ENEMY_T[s.E[i + 1]], M = D.MON[type]; e = { id, type, x, z, ry: s.E[i + 4] / 10, hp: 1, max: 1, r: M.r, spawning: !!(fl & 4), el: s.E[i + 7], vx: 0, vz: 0 }; G.enemies.set(id, e); makeEnemyView(e); }
    if (e.tx != null) { const dtS = 0.1; e.vx = (x - e.tx) / dtS; e.vz = (z - e.tz) / dtS; }
    e.tx = x; e.tz = z; e.try = s.E[i + 4] / 10; e.hpPct = s.E[i + 5]; e.slowT = fl & 1 ? 1 : 0; e.atk = !!(fl & 2); e.spawnT = fl & 4 ? 1 : 0; e.burnT = fl & 8 ? 1 : 0; e.poisonT = fl & 16 ? 1 : 0; e.enr = !!(fl & 32); e.chg = fl & 64 ? 1 : 0; e.extra = 0;
    if (e.predHp == null || e.hpPct < e.predHp || G.t - (e.predT || 0) > 0.6) e.predHp = e.hpPct;
  }
  for (const id of [...G.enemies.keys()]) if (!seen.has(id)) { G.enemies.delete(id); killEnemyView(id); }
  if (s.G) s.G.forEach((g, i) => {
    let p = G.players[i];
    if (!p) { const pc = { id: "", name: g[7], color: g[8], uid: g[5], style: g[6] }; if (!cfg.players[i]) cfg.players[i] = pc; p = newPlayer(pc, i, G.houses.map((h) => ({ x: h.x, z: h.z }))); G.players[i] = p; p.st = D.stats(p); makePlayerView(p); teamDirty = true; }
    const perks = {}; (g[3] || "").split(",").filter(Boolean).forEach((x) => { const m = /^([a-z]+)(\d+)$/.exec(x); if (m) perks[m[1]] = +m[2]; });
    const items = {}; (g[4] || "").split(",").filter(Boolean).forEach((x) => { const m = /^([a-z]+)(\d+)$/.exec(x); if (m) items[m[1]] = +m[2]; });
    const ch = p.wpn !== g[0] || p.arm !== g[1] || p.amu !== g[2] || JSON.stringify(perks) !== JSON.stringify(p.perks);
    p.wpn = g[0]; p.arm = g[1]; p.amu = g[2]; p.perks = perks; p.items = Object.assign({ potion: 0, rage: 0, bomb: 0, scroll: 0 }, items); p.uid = g[5]; p.style = g[6]; p.name = g[7]; p.color = g[8]; p.house = g[9]; try { p.meta = JSON.parse(g[10] || "{}"); } catch (_) {}
    p.st = D.stats(p); if (ch && playerViews[i]) updGear(playerViews[i]);
  });
  s.P.forEach((a, i) => {
    const p = G.players[i]; if (!p) return;
    const wasAlive = p.alive, oldHp = p.hp, oldC = p.wallet.c, oldW = p.wallet.w, oldS = p.wallet.s;
    if (i !== me) { p.x = a[0] / 10; p.z = a[1] / 10; p.ry = a[2] / 100; p.tgt = a[5]; p.gn = a[16]; p.mv = a[17]; }
    p.hp = a[3]; p.alive = !!a[4]; p.xp = a[6]; p.lvl = a[7]; p.wallet.c = a[8]; p.wallet.w = a[9]; p.wallet.s = a[10]; p.kills = a[11];
    p.ready = !!a[13]; const pres = i === me ? true : !!a[14]; if (pres !== p.present) teamDirty = true; p.present = pres; p.downT = a[15]; p.rageT = a[18] ? Math.max(p.rageT, 0.5) : 0;
    if (i === me && (a[12] !== p.seq || initial)) { p.seq = a[12]; p.x = a[0] / 10; p.z = a[1] / 10; }
    if (i === me && p.hp < oldHp - 0.5 && p.alive && !initial) onHurt(oldHp - p.hp);
    if (i === me && !initial) { if (p.wallet.c > oldC) popRes("r-c"); if (p.wallet.w > oldW) popRes("r-w"); if (p.wallet.s > oldS) popRes("r-s"); }
    if (wasAlive && !p.alive) onPlayerDown(p);
  });
  if (s.F) s.F.forEach(onEvent);
  if (s.H) s.H.forEach((a, i) => {
    const h = G.houses[i]; if (!h) return;
    const wasAlive = h.alive;
    h.lv = a[0]; h.hp = a[1]; h.wall = a[2]; h.whp = a[3]; h.alive = !!a[4]; h.max = a[6]; h.wmax = a[7]; h.style = a[8]; h.pools = parsePools(a[9]);
    const oldT = JSON.stringify(h.turrets.map((t) => t && t.type + t.lv));
    h.turrets = a[5].split(",").map((x) => (x ? { type: x.split(":")[0], lv: +x.split(":")[1], cd: 0 } : null));
    if (oldT !== JSON.stringify(h.turrets.map((t) => t && t.type + t.lv))) navDirty = true;
    if (wasAlive && !h.alive) onHouseDestroyed(h);
    updHouseView(h);
  });
  if (s.D) { const ids = new Set(s.D.map((d) => d[0])); for (const id of [...G.drops.keys()]) if (!ids.has(id)) { const d = G.drops.get(id); if (!d.fly) G.drops.delete(id); } s.D.forEach((d) => { if (!G.drops.has(d[0])) G.drops.set(d[0], { id: d[0], x: d[1] / 10, z: d[2] / 10, v: d[3], o: d[4], y: 0, vy: 0 }); }); }
  if (s.N) [...s.N].forEach((ch, i) => { const nd = G.nodes[i]; if (nd && nd.amt !== +ch) { if (+ch > nd.amt && nd.amt === 0) nd.grow = 0.05; nd.amt = +ch; if (updNode(WD, nd)) { renderer.shadowMap.needsUpdate = true; navDirty = true; } } });
  if (s.M !== undefined) { const was = !!G.merchant; G.merchant = s.M ? { stock: s.M } : null; if (was !== !!G.merchant) { updMerchantView(); if (G.merchant && !initial) msg("🛒 Пришёл торговец!", "Он у центра карты до начала волны", 2600); } }
  if (s.lost != null) G.lost = s.lost;
  hudDirty = true;
}
function popRes(id) { const el = $(id); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
// события (эффекты и звук) — у всех одинаково
function onEvent(f) {
  const k = f[0];
  if (k === "t") { const h = G.houses[f[1]]; if (!h) return; const t = h.turrets[f[2]]; const e = G.enemies.get(f[3]); if (!t || !e) return; turretShot(h, f[2], t, e, false); }
  else if (k === "tz") { const h = G.houses[f[1]]; if (!h) return; const top = towerTop(h, f[2]); const pts = [new THREE.Vector3(top.x, top.y, top.z)]; for (const id of f.slice(3)) { const e = G.enemies.get(id); if (e) pts.push(new THREE.Vector3(e.x, 1, e.z)); } if (pts.length > 1) { fx.lightning(pts, COL.purple); AU.play("zap", { x: top.x, z: top.z, vol: 0.5 }); } }
  else if (k === "a") { const e = G.enemies.get(f[1]); if (e) enemyShot(e, f[2] / 10, f[3] / 10, f[4] || "acid", false); }
  else if (k === "x") { fx.explosion(f[1] / 10, f[2] / 10, f[3] / 10); AU.play(f[3] > 30 ? "boom2" : "boom", { x: f[1] / 10, z: f[2] / 10 }); }
  else if (k === "b") { fx.ring(f[1] / 10, f[2] / 10, f[3] / 10, f[3] / 10 + 0.01, 0.9, 0xff3030); }
  else if (k === "B") { fx.explosion(f[1] / 10, f[2] / 10, 2.4); fx.ring(f[1] / 10, f[2] / 10, 0.5, f[3] / 10, 0.5, 0xffffff); fx.shake = 1.2; AU.play("boom2", { x: f[1] / 10, z: f[2] / 10 }); }
  else if (k === "ch") { const e = G.enemies.get(f[1]); if (e) { fx.text(e.x, 3.2, e.z, "РЫВОК!", "#ff6a6a", 18, 1); AU.play("roar", { x: e.x, z: e.z }); } }
  else if (k === "br") { const e = G.enemies.get(f[1]); if (e) { e.breath = 1.2; e.breathA = f[2] / 100; AU.play("flame", { x: e.x, z: e.z }); } }
  else if (k === "sh") { const e = G.enemies.get(f[1]); if (e) { for (let i = 0; i < 10; i++) { const a = i / 10 * PI2; shots.push({ kind: "ice", x: e.x, y: 1, z: e.z, vx: Math.cos(a) * 12, vy: 0, vz: Math.sin(a) * 12, life: 0.9, enemy: true, real: isHost(), dmg: 14, hit: new Set() }); } AU.play("ice", { x: e.x, z: e.z }); } }
  else if (k === "c") { G.drops.set(f[1], { id: f[1], x: f[2] / 10, z: f[3] / 10, v: f[4], o: f[5], y: 0.4, vy: 5 + Math.random() * 2, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3 }); }
  else if (k === "p") { const d = G.drops.get(f[1]); if (d) { if (f[2] === me) { fx.sparkle(d.x, 0.6, d.z, COL.gold, 6); fx.text(d.x, 1.4, d.z, `+${f[3]}🪙`, "#ffd36a", 15, 0.8); AU.play(Math.random() < 0.5 ? "coin" : "coin2", { vol: 0.5, gap: 0.07 }); } G.drops.delete(f[1]); } }
  else if (k === "sw") { if (f[1] === me) { let n = 0; for (const d of G.drops.values()) if (d.o === me) { d.fly = 0.001; n++; } if (f[2] > 0) { const p = P(); fx.text(p.x, 2.6, p.z, `+${f[2]}🪙`, "#ffd36a", 24, 1.6); setTimeout(() => AU.play("buy"), 400); } } for (const d of [...G.drops.values()]) if (d.o !== me) G.drops.delete(d.id); }
  else if (k === "hh") { const h = G.houses[f[1]]; if (h && h.view) { h.view.shake = 0.3; fx.chips(h.x + (Math.random() - 0.5) * 2, 1.2, h.z + (Math.random() - 0.5) * 2, f[2] ? COL.wood : COL.stone); AU.play("househit", { x: h.x, z: h.z, vol: 0.5, gap: 0.25 }); } }
  else if (k === "lv") { const p = G.players[f[1]]; if (p) { fx.levelup(p.x, p.z); fx.text(p.x, 2.4, p.z, "НОВЫЙ УРОВЕНЬ!", "#ffd36a", 18, 1.4); if (f[1] === me) AU.play("levelup"); } }
  else if (k === "heal") { const p = G.players[f[1]]; if (p) { fx.heal(p.x, p.z); AU.play("heal", { x: p.x, z: p.z, vol: 0.6 }); } }
  else if (k === "rev") { const p = G.players[f[1]]; if (p) { fx.levelup(p.x, p.z); fx.text(p.x, 2.6, p.z, "ВОСКРЕШЕНИЕ!", "#ffe9a0", 20, 1.4); AU.play("levelup"); } }
  else if (k === "clr") { onWaveCleared(f[1], f[2]); }
  else if (k === "n") { const nd = G.nodes[f[1]]; if (nd) { const was = nd.amt; nd.amt = f[2]; if (f[2] > 0 && f[3]) nd.grow = 0.05; if (was > 0 && f[2] === 0 && f[3] === 2) { fx.chips(nd.x, 1, nd.z, COL.wood); fx.puff(nd.x, nd.z, 10, COL.dust, 0.6); AU.play("chop", { x: nd.x, z: nd.z }); } if (updNode(WD, nd)) { renderer.shadowMap.needsUpdate = true; navDirty = true; } } }
  else if (k === "as") { if (f[1] === me) { const p = P(); fx.text(p.x, 2.2, p.z, `+${f[2]}🪙 помощь`, "#ffe9a0", 13, 0.9); } }
  else if (k === "bu") { const h = G.houses[f[1]]; if (h) { AU.play("build", { x: h.x, z: h.z }); const p = G.players[f[3]]; if (p && f[3] !== me) toast(`${p.name}: ${f[2]}`); } }
  else if (k === "gift") { onGift(f[1], f[2], f[3], f[4], f[5]); }
  else if (k === "cloud") { G.clouds.push({ x: f[1] / 10, z: f[2] / 10, r: f[3] / 10, t: f[4] / 10, vis: true }); AU.play("poison", { x: f[1] / 10, z: f[2] / 10, vol: 0.5 }); }
  else if (k === "nova") { const p = G.players[f[1]]; if (p) { fx.ring(p.x, p.z, 0.3, 3.6, 0.5, 0x9fe8ff); for (let i = 0; i < 18; i++) { const a = i / 18 * PI2; fx.add.add(p.x, 0.6, p.z, Math.cos(a) * 7, 0.5, Math.sin(a) * 7, 0.5, 0.35, 0.05, COL.ice, 0, 1); } AU.play("ice", { x: p.x, z: p.z }); } }
  else if (k === "strike") { const x = f[1] / 10, z = f[2] / 10; fx.lightning([new THREE.Vector3(x + 1, 9, z - 1), new THREE.Vector3(x + 0.3, 4, z), new THREE.Vector3(x, 0.5, z)], COL.blue); fx.hit(x, 0.5, z, COL.blue, true); AU.play("thunder", { x, z, vol: 0.7 }); }
  else if (k === "item") { const p = G.players[f[1]]; if (p) { if (f[2] === "potion") { fx.heal(p.x, p.z); AU.play("potion", { x: p.x, z: p.z }); } else if (f[2] === "rage") { fx.ring(p.x, p.z, 0.3, 2, 0.5, 0xff3a3a); AU.play("roar", { x: p.x, z: p.z, vol: 0.5 }); } else if (f[2] === "scroll") { fx.levelup(p.x, p.z); AU.play("magic"); } } }
  else if (k === "web") { const e = G.enemies.get(f[1]); if (e) enemyShot(e, f[2] / 10, f[3] / 10, "web", false); }
  else if (k === "k") { /* убийство: для статистики */ }
}
function emit(f) { if (isHost()) { if (room) G.F.push(f); onEvent(f); } }

// ================= ЛОГИКА ХОЗЯИНА =================
const activePlayers = () => Math.max(1, G.players.filter((p) => p.present).length);
const LOCD = () => D.LOC[G.loc] || D.LOCS[0];
function startWave() {
  G.wave++; G.ph = "wave"; G.timer = 0;
  G.queue = D.makeWave(G.loc, G.wave, activePlayers(), Math.random);
  // босс выходит в середине волны, а не первым
  const bi = G.queue.findIndex((k) => D.MON[k].boss); if (bi >= 0) { const b = G.queue.splice(bi, 1)[0]; G.queue.splice(Math.floor(G.queue.length * 0.35), 0, b); }
  G.spawnT = 1.5; G.merchant = null; dirtyFull = true; updMerchantView();
  G.players.forEach((p) => { p.ready = false; p.angelUsed = false; });
  onWaveStart(G.wave);
}
function onWaveStart(w) {
  const L = LOCD(), boss = L.bosses[w] || L.mid[w], last = w === L.waves;
  msg(`ВОЛНА ${w}${L.waves ? " / " + L.waves : ""}`, boss ? `${D.MON[boss].name} идёт сюда 💀` : last ? "Последняя волна — держись!" : "Чудовища идут — защищай аванпост!", 2600);
  AU.play(boss ? "gong2" : "gong"); AU.music(boss ? "boss" : "battle"); vib("notify", "warning");
  St.event("wave_reached", { game: GAME, wave: w, players: G.players.length, loc: G.loc });
  St.state({ wave: w, loc: G.loc });
  if (UI.sheetOpen() && !room) {} // в соло лист можно оставить — время замедляется
}
function onWaveCleared(w, bonus) {
  const L = LOCD();
  if (w < L.waves) { msg(`Волна ${w} отбита!`, `+${bonus}🪙 каждому · стены починены`, 2600); AU.sting("win"); AU.music("build"); }
  vib("notify", "success");
  playerViews.forEach((v) => { if (v && v.p.alive) { playOnce(v, "Cheer", 1.2); v.cheer = 1.6; } });
}
function spawnEnemy(type, at, el) {
  const alive = G.houses.filter((h) => h.alive); if (!alive.length) return null;
  const gts = gates(); let g;
  if (at) g = at; else { const h = alive[Math.floor(Math.random() * alive.length)]; const cand = gts.filter((q) => G.houses.length === 1 || q.h === h.idx); g = cand[Math.floor(Math.random() * cand.length)] || gts[0]; g = { x: g.x + (Math.random() - 0.5) * 1.5, z: g.z + (Math.random() - 0.5) * 1.5, h: h.idx }; }
  const M = D.MON[type], L = LOCD(), n = activePlayers();
  let hp = M.hp * D.hpMul(G.wave || 1, n, L.diff);
  if (M.boss) hp = M.hp * (1 + (L.diff - 1) * 0.7) * (1 + 0.45 * (n - 1)) * (1 + 0.04 * G.wave);
  if (el == null && !M.boss && G.wave >= 4 && Math.random() < Math.min(0.2, 0.04 + 0.012 * G.wave)) el = 1 + Math.floor(Math.random() * 3);
  if (el) hp *= 2.5;
  const mid = M.boss && L.mid[G.wave] === type && L.bosses[G.wave] !== type;
  if (mid) hp *= 0.6;
  const target = g.h != null ? g.h : nearestHouse(g.x, g.z).idx;
  const e = { id: G.eid++, type, x: g.x, z: g.z, ry: Math.atan2(-g.x, -g.z), hp, max: hp, r: M.r * (el ? 1.25 : 1), h: target, cd: 1, spawnT: M.boss ? 1.2 : 1.1, spawning: true, slowT: 0, burnT: 0, poisonT: 0, atk: false, el: el || 0, dmgBy: {}, ab: {}, lx: g.x, lz: g.z, stuckT: 0, ghost: 0, aggroT: 0, ignoreP: 0, hopT: 0, hm: mid ? 0.5 : M.boss ? 0.75 : 1 };
  if (M.boss) { G.bossId = e.id; e.ab = { slam: 4, charge: 6, summon: 9, web: 4, breath: 6, volley: 4, shards: 5 }; }
  G.enemies.set(e.id, e); makeEnemyView(e);
  return e;
}
const grid = new Map();
let hostStepT = 0;
function hostStep(dt) {
  G.t += dt;
  const self = G.players[me]; if (self && !self.present) { self.present = true; dirtyFull = true; }
  if (navDirty && G.t - navT > 0.4) { navT = G.t; rebuildNav(); }
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
      if (D.MON[type].boss) G.spawnT += 3;
    }
    if (!G.queue.length && !G.enemies.size) waveCleared();
  }
  // монстры
  grid.clear();
  for (const e of G.enemies.values()) { const k = Math.floor(e.x / 2) * 1000 + Math.floor(e.z / 2); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(e); }
  for (const e of [...G.enemies.values()]) enemyAI(e, dt);
  // ядовитые облака
  G.clouds = G.clouds.filter((c) => (c.t -= dt) > 0);
  for (const c of G.clouds) if (c.dps) for (const e of G.enemies.values()) if (dist(e.x, e.z, c.x, c.z) < c.r + e.r) { e.poisonT = Math.max(e.poisonT, 0.5); e.poisonD = Math.max(e.poisonD || 0, c.dps); e.poisonBy = c.owner; }
  // башни
  for (const h of G.houses) {
    if (!h.alive) continue;
    const owner = G.players[h.owner], tm = owner && owner.st ? owner.st.turretMul : 1;
    h.turrets.forEach((t, s) => {
      if (!t) return;
      t.cd -= dt; if (t.cd > 0) return;
      const TD = D.TURRETS[t.type], p = slotPos(h, s);
      const inR = []; for (const e of G.enemies.values()) { if (e.spawnT > 0) continue; const d = dist(p.x, p.z, e.x, e.z); if (d < TD.range) inR.push([d, e]); }
      if (!inR.length) { t.cd = 0.2; return; }
      inR.sort((a, b) => a[0] - b[0]);
      t.cd = 1 / TD.rate;
      const dmg = TD.dmg * D.turretMul(t.lv) * tm, src = -1 - h.idx;
      if (TD.beh === "chain") {
        const ids = [], hitS = new Set(); let cur = inR[0][1];
        for (let j = 0; j <= TD.jumps && cur; j++) { ids.push(cur.id); hitS.add(cur.id); let nb = null, bd = 4.5; for (const e of G.enemies.values()) { if (hitS.has(e.id)) continue; const d = dist(e.x, e.z, cur.x, cur.z); if (d < bd) { bd = d; nb = e; } } cur = nb; }
        emit(["tz", h.idx, s, ...ids]);
        ids.forEach((id, j) => hitEnemy(id, dmg * Math.pow(0.85, j), src, 0, 0));
      } else if (TD.beh === "multi") {
        for (let j = 0; j < Math.min(TD.multi, inR.length); j++) { emit(["t", h.idx, s, inR[j][1].id]); const sh = shots[shots.length - 1]; if (sh && sh.tower === h.idx * 10 + s) { sh.real = true; sh.dmg = dmg; sh.src = src; } }
      } else {
        emit(["t", h.idx, s, inR[0][1].id]);
        const sh = shots[shots.length - 1]; if (sh && sh.tower === h.idx * 10 + s) { sh.real = true; sh.dmg = dmg; sh.src = src; sh.owner2 = h.owner; }
      }
    });
  }
  // монеты: личная добыча — притягивается и подбирается только хозяином
  for (const d of G.drops.values()) {
    const p = G.players[d.o]; if (!p || !p.alive || !p.present) continue;
    const bd = dist(p.x, p.z, d.x, d.z), mag = p.st ? p.st.magnet : 3.4;
    if (bd < mag) {
      const sp = 7 + (mag - Math.min(bd, mag)) * 4; d.x += (p.x - d.x) / bd * Math.min(bd, sp * dt); d.z += (p.z - d.z) / bd * Math.min(bd, sp * dt);
      if (bd < 0.7) { const v = Math.max(1, Math.round(d.v * p.st.coinMul)); p.wallet.c += v; emit(["p", d.id, p.idx, v]); G.drops.delete(d.id); }
    }
  }
  // игроки
  for (const p of G.players) {
    if (!p.present) continue;
    if (p.rageT > 0) p.rageT -= dt;
    if (p.alive) p.hp = Math.min(p.st.maxhp, p.hp + p.st.regen * dt);
    else { p.downT -= dt; if (p.downT <= 0) respawn(p); }
    // ледяная нова (перк)
    if (p.alive && p.st.nova) { p.novaT = (p.novaT || 6) - dt; if (p.novaT <= 0) { p.novaT = 6; emit(["nova", p.idx]); for (const e of [...G.enemies.values()]) if (dist(e.x, e.z, p.x, p.z) < 3.6) hitEnemy(e.id, 10 * (1 + 0.18 * (p.perks.dmg || 0)), p.idx, 0, 1); } }
    // гость молчит слишком долго → считаем, что вышел
    if (room && p.idx !== me && p.present && p.seen && performance.now() - p.seen > 15000) { p.present = false; dirtyFull = true; teamDirty = true; }
  }
  G.nodes.forEach((nd, i) => { if (nd.amt <= 0) { nd.regrow -= dt; if (nd.regrow <= 0) { nd.amt = D.RES[nd.kind].amount; emit(["n", i, nd.amt, 1]); } } });
  if (!G.over && G.houses.every((h) => !h.alive)) gameOver(false);
}
function waveCleared() {
  const L = LOCD();
  G.ph = "build"; G.timer = D.BUILD_TIME + Math.min(10, G.wave);
  const bonus = 8 + G.wave * 3;
  G.players.forEach((p) => { if (p.present) { p.wallet.c += bonus; if (!p.alive) respawn(p); p.hp = Math.min(p.st.maxhp, p.hp + p.st.maxhp * 0.3); } });
  G.houses.forEach((h) => { if (h.alive && h.wall) h.whp = h.wmax; });
  // вся добыча ночи летит к своим хозяевам — ничего не пропадает
  const tot = {};
  for (const d of [...G.drops.values()]) { const p = G.players[d.o]; if (p && p.present) { const v = Math.max(1, Math.round(d.v * p.st.coinMul)); p.wallet.c += v; tot[d.o] = (tot[d.o] || 0) + v; } }
  G.players.forEach((p) => emit(["sw", p.idx, tot[p.idx] || 0]));
  G.drops.clear();
  G.bossId = 0; dirtyFull = true; navDirty = true;
  emit(["clr", G.wave, bonus]);
  if (G.wave >= L.waves) { gameOver(true); return; }
  if (G.wave % 2 === 1) G.merchant = { stock: rollStock() };
  updMerchantView();
  G.houses.forEach(updHouseView);
}
function rollStock() {
  const r = Math.random, pick = (o, k) => { const ks = Object.keys(o).filter((x) => o[x].price); const out = []; while (out.length < k && ks.length) out.push(ks.splice(Math.floor(r() * ks.length), 1)[0]); return out; };
  return [...pick(D.WEAPONS, 3).map((x) => "w:" + x), ...pick(D.ARMOR, 2).map((x) => "r:" + x), ...pick(D.AMULETS, 2).map((x) => "m:" + x), ...Object.keys(D.ITEMS).map((x) => "i:" + x)].join(";");
}
function respawn(p) {
  const own = G.houses[p.house] && G.houses[p.house].alive ? G.houses[p.house] : G.houses.filter((h) => h.alive).sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z))[0];
  if (!own) return;
  if (!G.houses[p.house] || !G.houses[p.house].alive) p.house = own.idx;
  const a = Math.atan2(-own.z, -own.x) || Math.PI / 2;
  p.x = own.x + Math.cos(a) * 3.6; p.z = own.z + Math.sin(a) * 3.6; p.alive = true; p.hp = p.st.maxhp; p.downT = 0; p.seq++;
  emit(["heal", p.idx]);
}
function damagePlayer(p, dmg) {
  if (!p.alive || !p.present) return;
  p.hp -= dmg * (1 - p.st.def);
  if (p.idx === me) onHurt(dmg);
  if (p.hp <= 0) {
    if ((p.st.angel || p.st.phoenix) && !p.angelUsed) { p.angelUsed = true; p.hp = p.st.maxhp * 0.5; emit(["rev", p.idx]); return; }
    p.hp = 0; p.alive = false; p.downT = 6; onPlayerDown(p);
  }
}
let curSrc = "?", curHm = 1;
function damageHouse(h, dmg) {
  if (!h.alive) return;
  dmg *= curHm;
  (G.hlog || (G.hlog = {}))[curSrc] = ((G.hlog || {})[curSrc] || 0) + dmg;
  if (h.whp > 0) { h.whp -= dmg; emit(["hh", h.idx, 1]); if (h.whp <= 0) { h.whp = 0; dirtyFull = true; navDirty = true; updHouseView(h); } }
  else { h.hp -= dmg; emit(["hh", h.idx, 0]); if (h.hp <= 0) { h.hp = 0; h.alive = false; G.lost++; dirtyFull = true; navDirty = true; refundPools(h); onHouseDestroyed(h); updHouseView(h); } }
  if (G.t - dfT > 0.4) { dfT = G.t; dirtyFull = true; }
}
let dfT = 0;
function onHouseDestroyed(h) {
  fx.explosion(h.x, h.z, 3.5); fx.puff(h.x, h.z, 30, COL.smoke, 1.2); AU.play("collapse", { x: h.x, z: h.z });
  const own = G.players[h.owner];
  msg(own && own.idx === me ? "Твой аванпост разрушен!" : `Аванпост ${own ? own.name : ""} разрушен`, G.houses.some((x) => x.alive) ? "Беги к друзьям и защищай их дом!" : "", 2800);
  vib("notify", "error");
  if (isHost()) G.players.forEach((p) => { if (p.house === h.idx) { const o = G.houses.filter((x) => x.alive).sort((a, b) => dist(a.x, a.z, h.x, h.z) - dist(b.x, b.z, h.x, h.z))[0]; if (o) p.house = o.idx; } });
}
function onPlayerDown(p) {
  const v = playerViews[p.idx]; if (v) { playAnim(v, "base", null); playAnim(v, "upper", null); playOnce(v, "Death_A", 1); v.deadShown = true; }
  fx.death(p.x, p.z, COL.red); AU.play("hurt", { x: p.x, z: p.z });
  if (p.idx === me) vib("notify", "error");
}
function nearestHouse(x, z) { let b = null, bd = 1e9; for (const h of G.houses) if (h.alive) { const d = dist(x, z, h.x, h.z); if (d < bd) { bd = d; b = h; } } return b || G.houses[0]; }
function enemyAI(e, dt) {
  const M = D.MON[e.type]; curSrc = e.type; curHm = e.hm || 1;
  if (e.spawnT > 0) { e.spawnT -= dt; return; }
  // статусы
  e.slowT -= dt; e.ghost -= dt; e.ignoreP -= dt;
  if (e.burnT > 0) { e.burnT -= dt; e.hp -= (e.burnD || 0) * dt; if (e.hp <= 0) { killEnemy(e, e.burnBy ?? -1); return; } }
  if (e.poisonT > 0) { e.poisonT -= dt; e.hp -= (e.poisonD || 0) * dt; if (e.hp <= 0) { killEnemy(e, e.poisonBy ?? -1); return; } }
  // ауры элиток
  if (e.el === 3) for (const o of G.enemies.values()) if (o !== e && dist(o.x, o.z, e.x, e.z) < 4) o.hp = Math.min(o.max, o.hp + o.max * 0.03 * dt);
  let spdMul = e.slowT > 0 ? 0.5 : 1;
  for (const o of G.enemies.values()) if (o.el === 1 && o !== e && dist(o.x, o.z, e.x, e.z) < 4) { spdMul *= 1.25; break; }
  if (e.enr) spdMul *= 1.35;
  let h = G.houses[e.h]; if (!h || !h.alive) { h = nearestHouse(e.x, e.z); if (!h || !h.alive) return; e.h = h.idx; }
  // цель: дом или игрок рядом. Боссы не дают себя увести: через 4 с «драки» идут к дому и 7 с игнорируют игроков
  let tp = null, td = M.ranged ? 7 : M.boss ? 3.4 : 4.2;
  if (e.ignoreP <= 0) for (const p of G.players) { if (!p.alive || !p.present) continue; const d = dist(p.x, p.z, e.x, e.z); if (d < td) { td = d; tp = p; } }
  const hd = dist(e.x, e.z, h.x, h.z), houseStop = (h.whp > 0 && !M.fly ? D.WALL_R + 0.25 : D.HOUSE_R + (h.lv >= 4 ? 0.8 : 0.3)) + e.r;
  if (M.boss) { if (tp) { e.aggroT += dt; if (e.aggroT > 4) { e.ignoreP = 7; e.aggroT = 0; tp = null; e.ab.charge = Math.min(e.ab.charge, 0.5); } } else e.aggroT = Math.max(0, e.aggroT - dt * 0.5); }
  let tx, tz, stop;
  if (tp && !(hd < houseStop + 0.5)) { tx = tp.x; tz = tp.z; stop = M.ranged ? M.range * 0.85 : M.range + 0.35; }
  else { tx = h.x; tz = h.z; stop = M.ranged ? Math.max(houseStop, Math.min(M.range, M.boss ? M.range : 6.5)) : houseStop; tp = null; }
  let dx = tx - e.x, dz = tz - e.z; const d = Math.hypot(dx, dz) || 1;
  e.cd -= dt;
  // способности боссов
  if (M.boss) bossAbilities(e, M, h, tp, d, dt);
  if (e.chg > 0) {   // рывок
    e.chg -= dt; const sp = M.spd * 4.2 * dt; e.x += e.cdx * sp; e.z += e.cdz * sp;
    for (const p of G.players) if (p.alive && dist(p.x, p.z, e.x, e.z) < e.r + 0.6 && !e.chHit?.has(p.idx)) { (e.chHit = e.chHit || new Set()).add(p.idx); damagePlayer(p, M.dmg * 0.8); p.x += e.cdx * 2.5; p.z += e.cdz * 2.5; p.seq++; }
    if (dist(e.x, e.z, h.x, h.z) < houseStop + 0.3) { e.chg = 0; damageHouse(h, M.hdmg * 1.5); emit(["B", Math.round(e.x * 10), Math.round(e.z * 10), 30]); }
    collide(e, e.r, true, true); return;
  }
  if (e.breath > 0) { e.breath -= dt; e.btick = (e.btick || 0) - dt; if (e.btick <= 0) { e.btick = 0.2; const a = e.breathA; for (const p of G.players) { if (!p.alive) continue; const ang = Math.atan2(p.x - e.x, p.z - e.z), dd = dist(p.x, p.z, e.x, e.z); let da = Math.abs(((ang - a + Math.PI) % PI2 + PI2) % PI2 - Math.PI); if (dd < 6.5 && da < 0.45) damagePlayer(p, M.dmg * 0.25); } if (dist(h.x, h.z, e.x, e.z) < 7.5) damageHouse(h, M.hdmg * 0.12); } return; }
  if (e.crowd > 0) { e.crowd -= dt; if (!tp) stop += 2.4; }   // толпа у дома не пускает ближе — бьём с того места, где стоим
  if (d > stop) {
    e.atk = false;
    const sp = M.spd * spdMul * dt;
    let mx = dx / d, mz = dz / d;
    // обход препятствий по полю потока (летающие и боссы-громилы идут напрямик)
    if (!M.fly && !tp && hd > 6) { const f = flows[h.idx], k = gi(e.x, e.z); if (f && k >= 0 && f.distF[k] < 1e9 && (f.dirX[k] || f.dirZ[k])) { mx = f.dirX[k]; mz = f.dirZ[k]; } }
    if (M.hop) { e.hopT = (e.hopT || 0) + dt; const k2 = (e.hopT % 0.8) < 0.45 ? 1.9 : 0.15; e.x += mx * sp * k2; e.z += mz * sp * k2; }
    else { e.x += mx * sp; e.z += mz * sp; }
    dx = mx; dz = mz;
  } else {
    e.atk = true;
    if (e.cd <= 0) {
      e.cd = 1 / (M.rate * (e.enr ? 1.4 : 1));
      if (M.boom) { explode(e); return; }
      if (M.ranged && !M.boss) { emit(["a", e.id, Math.round(tx * 10), Math.round(tz * 10), M.ranged]); markEnemyShot(e, tp, h, M); }
      else if (M.boss) { if (tp) damagePlayer(tp, M.dmg); else damageHouse(h, M.hdmg); }
      else if (tp) damagePlayer(tp, M.dmg);
      else damageHouse(h, M.hdmg * (M.fly && h.whp > 0 ? 1 : 1));
    }
  }
  const want = Math.atan2(dx, dz); let dr = want - e.ry; while (dr > Math.PI) dr -= PI2; while (dr < -Math.PI) dr += PI2; e.ry += dr * Math.min(1, dt * 8);
  // расталкивание
  if (!M.fly) {
    const gx = Math.floor(e.x / 2), gz = Math.floor(e.z / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const c = grid.get((gx + i) * 1000 + gz + j); if (!c) continue;
      for (const o of c) { if (o === e || D.MON[o.type].fly) continue; const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), rr = e.r + o.r; if (od < rr && od > 0.001) { const push = (rr - od) * (M.boss ? 0.1 : 0.5); e.x += ox / od * push; e.z += oz / od * push; } }
    }
    if (e.ghost <= 0) collide(e, e.r, true, M.boss);
  }
  // «застрял»: если 1.5 с почти не двигался и не атакует — проходит сквозь мелкие препятствия
  e.stuckT += dt;
  if (e.stuckT > 1.5) { const mv = dist(e.x, e.z, e.lx, e.lz); if (mv < 0.35 && !e.atk) { if (hd < houseStop + 3) e.crowd = 4; e.ghost = 1.4; e.x += (Math.random() - 0.5) * 0.6; e.z += (Math.random() - 0.5) * 0.6; } e.stuckT = 0; e.lx = e.x; e.lz = e.z; }
  // большие боссы ломают деревья на пути
  if (M.boss && !M.fly) G.nodes.forEach((nd, i) => { if (nd.amt > 0 && nd.kind === "tree" && dist(nd.x, nd.z, e.x, e.z) < e.r + 0.6) { nd.amt = 0; nd.regrow = D.RES.tree.regrow; emit(["n", i, 0, 2]); navDirty = true; } });
}
function bossAbilities(e, M, h, tp, d, dt) {
  const ab = e.ab; for (const k in ab) ab[k] -= dt;
  const has = (k) => M.abil.includes(k);
  if (has("enrage") && !e.enr && e.hp < e.max * 0.4) { e.enr = true; fx.text(e.x, 3.5, e.z, "ЯРОСТЬ!", "#ff3b3b", 24, 1.4); emit(["ch", e.id]); }
  const tgt = tp || h, tdist = dist(tgt.x, tgt.z, e.x, e.z);
  if (e.slamT > 0) { e.slamT -= dt; if (e.slamT <= 0) { const R = M.slam || 3.6; emit(["B", Math.round(e.x * 10), Math.round(e.z * 10), Math.round(R * 10)]); for (const p of G.players) if (p.alive && dist(p.x, p.z, e.x, e.z) < R) damagePlayer(p, M.dmg); if (dist(e.x, e.z, h.x, h.z) < R + D.WALL_R) damageHouse(h, M.hdmg); } return; }
  if (has("slam") && ab.slam <= 0 && tdist < 4) { ab.slam = 5.5; e.slamT = 0.9; emit(["b", Math.round(e.x * 10), Math.round(e.z * 10), 36]); return; }
  if (has("charge") && ab.charge <= 0 && tdist > 5 && tdist < 16) { ab.charge = 9; const ddx = tgt.x - e.x, ddz = tgt.z - e.z, l = Math.hypot(ddx, ddz) || 1; e.cdx = ddx / l; e.cdz = ddz / l; e.chg = Math.min(1.5, l / (M.spd * 4.2)); e.chHit = new Set(); emit(["ch", e.id]); return; }
  if (has("summon") && ab.summon <= 0) { ab.summon = 12; for (let i = 0; i < 2 + activePlayers(); i++) { const a = Math.random() * PI2; spawnEnemy(M.minion || "walker", { x: e.x + Math.cos(a) * 2.2, z: e.z + Math.sin(a) * 2.2, h: e.h }, 0); } }
  if (has("web") && ab.web <= 0 && tp) { ab.web = 6; emit(["web", e.id, Math.round(tp.x * 10), Math.round(tp.z * 10)]); const sh = shots[shots.length - 1]; if (sh && sh.from === e.id) { sh.real = true; sh.web = true; sh.tp = tp.idx; sh.dmg = 6; } }
  if (has("breath") && ab.breath <= 0 && tdist < 7.5) { ab.breath = 7; e.breath = 1.3; e.breathA = Math.atan2(tgt.x - e.x, tgt.z - e.z); emit(["br", e.id, Math.round(e.breathA * 100)]); }
  if (has("volley") && ab.volley <= 0 && tdist < 11) { ab.volley = 5; const base = Math.atan2(tgt.x - e.x, tgt.z - e.z); for (let i = -2; i <= 2; i++) { const a = base + i * 0.25, r2 = Math.min(tdist, 9); const tx = e.x + Math.sin(a) * r2, tz = e.z + Math.cos(a) * r2; emit(["a", e.id, Math.round(tx * 10), Math.round(tz * 10), "fire"]); markEnemyShot(e, null, h, { dmg: M.dmg * 0.5, hdmg: M.hdmg * 0.4, ranged: "fire" }, tx, tz); } }
  if (has("shards") && ab.shards <= 0 && tdist < 7) { ab.shards = 6; emit(["sh", e.id]); }
}
function markEnemyShot(e, tp, h, M, tx, tz) { const sh = shots[shots.length - 1]; if (sh && sh.from === e.id) { sh.real = true; sh.tp = tp ? tp.idx : -1; sh.th = h.idx; sh.dmgP = M.dmg; sh.dmgH = M.hdmg * (e.hm || 1) * (D.MON[e.type].boss ? 1 : 0.5); } }
function explode(e) {
  const M = D.MON[e.type];
  emit(["x", Math.round(e.x * 10), Math.round(e.z * 10), Math.round(M.boom * 10)]);
  for (const p of G.players) if (p.alive && dist(p.x, p.z, e.x, e.z) < M.boom) damagePlayer(p, M.dmg);
  for (const h of G.houses) if (h.alive && dist(h.x, h.z, e.x, e.z) < M.boom + (h.whp > 0 ? D.WALL_R : D.HOUSE_R) + 0.3) damageHouse(h, M.hdmg);
  G.enemies.delete(e.id); killEnemyView(e.id, true);
}
// попадание по монстру: src ≥ 0 — игрок, < 0 — башня дома (-1-idx)
function hitEnemy(id, dmg, src, crit, flags) {
  const e = G.enemies.get(id); if (!e || e.spawnT > 0) return;
  // щит элиты рядом
  for (const o of G.enemies.values()) if (o.el === 2 && dist(o.x, o.z, e.x, e.z) < 4) { dmg *= 0.5; break; }
  e.hp -= dmg;
  const who = src >= 0 ? src : (G.houses[-1 - src] ? G.houses[-1 - src].owner : -1);
  if (who >= 0) e.dmgBy[who] = (e.dmgBy[who] || 0) + dmg;
  if (flags & 1) e.slowT = 2.2;
  if (flags & 2) { e.burnT = 3; e.burnD = dmg * 0.25 * (flags & 8 ? 3 : 1); e.burnBy = src; }
  if (flags & 4) { e.poisonT = 4; e.poisonD = Math.max(e.poisonD || 0, dmg * 0.2); e.poisonBy = src; }
  const p = src >= 0 ? G.players[src] : null; if (p) p.dmg += dmg;
  if (e.hp <= 0) killEnemy(e, src);
}
function killEnemy(e, src) {
  const M = D.MON[e.type];
  if (!G.enemies.has(e.id)) return;
  G.enemies.delete(e.id); killEnemyView(e.id);
  if (e.type === "bomber") { emit(["x", Math.round(e.x * 10), Math.round(e.z * 10), 22]); for (const o of [...G.enemies.values()]) if (dist(o.x, o.z, e.x, e.z) < 2.2) hitEnemy(o.id, 30, src, 0, 0); }
  if (M.split) for (let i = 0; i < 2; i++) { const a = Math.random() * PI2; const s2 = spawnEnemy(M.split, { x: e.x + Math.cos(a) * 0.6, z: e.z + Math.sin(a) * 0.6, h: e.h }, 0); if (s2) s2.spawnT = 0.2; }
  if (M.boss) { G.bossId = 0; G.bossKills++; }
  // кто добил: игрок или хозяин башни (если хозяин вышел — ближайший игрок)
  let killer = src >= 0 ? src : (G.houses[-1 - src] ? G.houses[-1 - src].owner : -1);
  if (killer < 0 || !G.players[killer] || !G.players[killer].present) { let bd = 1e9; for (const p of G.players) if (p.present) { const dd = dist(p.x, p.z, e.x, e.z); if (dd < bd) { bd = dd; killer = p.idx; } } }
  const kp = G.players[killer];
  // перки убийцы: цепная реакция, чума, ледяной взрыв
  if (kp && kp.st) {
    kp.killN = (kp.killN || 0) + 1;
    if (kp.st.chain && kp.killN % 4 === 0) { emit(["x", Math.round(e.x * 10), Math.round(e.z * 10), 22]); for (const o of [...G.enemies.values()]) if (dist(o.x, o.z, e.x, e.z) < 2.4) hitEnemy(o.id, 25 * (1 + 0.18 * (kp.perks.dmg || 0)), killer, 0, 0); }
    if (kp.st.plague && e.poisonT > 0) for (const o of G.enemies.values()) if (dist(o.x, o.z, e.x, e.z) < 2.6) { o.poisonT = 4; o.poisonD = Math.max(o.poisonD || 0, e.poisonD || 3); o.poisonBy = killer; }
    if (kp.st.shatter && e.slowT > 0) { emit(["sh", e.id]); }
  }
  // монеты: лично добившему
  const mul = e.el ? 3 : 1;
  let left = M.coin * mul; const k = Math.min(left, M.boss ? 10 : 3);
  for (let i = 0; i < k && kp; i++) { const v = i === k - 1 ? left : Math.max(1, Math.floor(M.coin * mul / k)); left -= v; if (v <= 0) continue; const id = G.did++, a = Math.random() * PI2, r = Math.random() * 0.6; const d = { id, x: e.x + Math.cos(a) * r, z: e.z + Math.sin(a) * r, v, o: killer }; G.drops.set(id, d); emit(["c", id, Math.round(d.x * 10), Math.round(d.z * 10), v, killer]); }
  // опыт: добившему 100%, помощникам (≥15% урона) 60% и монетку, остальным 25%
  let total = 0; for (const k2 in e.dmgBy) total += e.dmgBy[k2];
  for (const p of G.players) {
    if (!p.present) continue;
    const share = total ? (e.dmgBy[p.idx] || 0) / total : 0, assist = p.idx !== killer && share >= 0.15;
    giveXp(p, M.xp * mul * (p.idx === killer ? 1 : assist ? 0.6 : 0.25));
    if (assist) { const c = Math.max(1, Math.round(M.coin * mul * 0.3)); p.wallet.c += c; emit(["as", p.idx, c]); }
  }
  if (kp) { kp.kills++; if (kp.st.vamp && kp.alive) kp.hp = Math.min(kp.st.maxhp, kp.hp + kp.st.vamp); }
  emit(["k", e.id, killer]);
}
function giveXp(p, x) { p.xp += x; while (p.xp >= D.xpNeed(p.lvl)) { p.xp -= D.xpNeed(p.lvl); p.lvl++; emit(["lv", p.idx]); } }
function gameOver(win) {
  if (G.over) return; G.over = true;
  const d = { win, wave: G.wave, loc: G.loc, lost: G.lost, houses: G.houses.length, bossKills: G.bossKills, stats: G.players.map(pStat) };
  send("over", d); onOver(d);
}
const pStat = (p) => [p.name, p.kills, Math.round(p.dmg), p.lvl, p.built];

// ---------- действия игроков: сбор, вклад в стройку, подарки, покупки, перки, предметы ----------
const canPay = (w, c) => (w.c >= (c.c || 0)) && (w.w >= (c.w || 0)) && (w.s >= (c.s || 0));
// что строится по ключу пула: h<lv> дом, w<lv> стена, t<slot>:<type> башня, u<slot>:<lv> улучшение башни
function poolTarget(h, key) {
  if (!h || !h.alive) return null;
  if (key[0] === "h") { const lv = +key.slice(1); return lv === h.lv + 1 && D.HOUSE_LV[lv] ? { cost: D.HOUSE_LV[lv].cost, name: "Дом ур. " + lv } : null; }
  if (key[0] === "w") { const lv = +key.slice(1); return lv === h.wall + 1 && D.WALL_LV[lv] ? { cost: D.WALL_LV[lv].cost, name: D.WALL_LV[lv].name } : null; }
  if (key[0] === "t") { const [s, type] = key.slice(1).split(":"); const TD = D.TURRETS[type]; return TD && h.turrets[+s] === null ? { cost: TD.cost, name: TD.name } : null; }
  if (key[0] === "u") { const [s, lv] = key.slice(1).split(":").map(Number); const t = h.turrets[s]; return t && t.lv + 1 === lv && lv <= D.TURRET_MAX ? { cost: D.upCost(D.TURRETS[t.type].cost, t.lv), name: D.TURRETS[t.type].name + " ур. " + lv } : null; }
  return null;
}
function completePool(h, key, pi) {
  if (key[0] === "h") { const lv = +key.slice(1); h.lv = lv; h.max = D.HOUSE_LV[lv].hp * (h.mh || 1); h.hp = h.max; }
  else if (key[0] === "w") { const lv = +key.slice(1); h.wall = lv; h.wmax = D.WALL_LV[lv].hp * (h.mh || 1); h.whp = h.wmax; }
  else if (key[0] === "t") { const [s, type] = key.slice(1).split(":"); h.turrets[+s] = { type, lv: 1, cd: 0.5 }; navDirty = true; }
  else if (key[0] === "u") { const [s, lv] = key.slice(1).split(":").map(Number); h.turrets[s].lv = lv; }
  delete h.pools[key];
  const t = { h: "улучшил дом", w: "построил стену", t: "поставил башню", u: "улучшил башню" }[key[0]];
  emit(["bu", h.idx, t, pi]);
  refundPools(h, true);
  updHouseView(h);
}
function refundPools(h, onlyInvalid) {
  for (const [key, pool] of Object.entries(h.pools)) {
    if (onlyInvalid && poolTarget(h, key)) continue;
    for (const [i, b] of Object.entries(pool.by)) { const p = G.players[i]; if (p) { p.wallet.c += b.c; p.wallet.w += b.w; p.wallet.s += b.s; } }
    delete h.pools[key];
  }
}
function doAct(pi, a) {
  const p = G.players[pi]; if (!p || !a) return false;
  const h = a.h != null ? G.houses[a.h] : null;
  const near = (hh) => hh && hh.alive && dist(p.x, p.z, hh.x, hh.z) < 10;
  let ok = false;
  switch (a.k) {
    case "g": {
      const nd = G.nodes[a.n]; if (!nd || nd.amt <= 0 || dist(p.x, p.z, nd.x, nd.z) > 3.5) return false;
      nd.amt--; const g = D.RES[nd.kind].give; p.wallet[g] += p.st.gather; if (nd.amt <= 0) { nd.regrow = D.RES[nd.kind].regrow; navDirty = true; }
      emit(["n", a.n, nd.amt, 0]); return true;
    }
    case "con": {   // вклад в стройку (можно в чужой дом)
      if (!near(h)) return false;
      const tg = poolTarget(h, a.key); if (!tg) return false;
      const pool = h.pools[a.key] || (h.pools[a.key] = { paid: { c: 0, w: 0, s: 0 }, by: {} });
      const by = pool.by[pi] || (pool.by[pi] = { c: 0, w: 0, s: 0 });
      let gave = 0;
      for (const r of ["c", "w", "s"]) { const need = (tg.cost[r] || 0) - pool.paid[r], x = Math.max(0, Math.min(need, p.wallet[r])); p.wallet[r] -= x; pool.paid[r] += x; by[r] += x; gave += x; }
      if (["c", "w", "s"].every((r) => pool.paid[r] >= (tg.cost[r] || 0))) { completePool(h, a.key, pi); p.built++; }
      dirtyFull = true; return gave > 0;
    }
    case "rep": { if (!near(h) || h.hp >= h.max || p.wallet.w < D.REPAIR.w) return false; p.wallet.w -= D.REPAIR.w; h.hp = Math.min(h.max, h.hp + h.max * D.REPAIR.part); emit(["heal", pi]); ok = true; break; }
    case "gift": {
      const to = G.players[a.to]; if (!to || to === p) return false;
      const g = {}; let any = 0;
      for (const r of ["c", "w", "s"]) { const x = Math.max(0, Math.min(Math.floor(a[r] || 0), p.wallet[r])); p.wallet[r] -= x; to.wallet[r] += x; g[r] = x; any += x; }
      if (!any) return false;
      emit(["gift", pi, a.to, g.c, g.w, g.s]); dirtyFull = true; return true;
    }
    case "buy": {
      if (!G.merchant || !G.merchant.stock.split(";").includes(a.id)) return false;
      const [cat, key] = a.id.split(":");
      const item = cat === "w" ? D.WEAPONS[key] : cat === "r" ? D.ARMOR[key] : cat === "m" ? D.AMULETS[key] : D.ITEMS[key];
      if (!item || p.wallet.c < item.price) return false;
      if (cat === "w") { if (p.wpn === key) return false; p.wpn = key; }
      else if (cat === "r") { if (p.arm === key) return false; p.arm = key; }
      else if (cat === "m") { if (p.amu === key) return false; p.amu = key; }
      else { if ((p.items[key] || 0) >= item.max) return false; p.items[key] = (p.items[key] || 0) + 1; }
      p.wallet.c -= item.price;
      const oldMax = p.st.maxhp; p.st = D.stats(p); if (p.st.maxhp > oldMax) p.hp += p.st.maxhp - oldMax;
      if (playerViews[pi]) updGear(playerViews[pi]);
      ok = true; break;
    }
    case "use": {
      const it = a.id; if (!p.items[it] || !p.alive) return false;
      if (it === "potion") { if (p.hp >= p.st.maxhp) return false; p.hp = Math.min(p.st.maxhp, p.hp + 70); }
      else if (it === "rage") p.rageT = 10;
      else if (it === "bomb") {
        let best = null, bs = 0;
        for (const e of G.enemies.values()) { if (dist(e.x, e.z, p.x, p.z) > 10) continue; let s = 0; for (const o of G.enemies.values()) if (dist(o.x, o.z, e.x, e.z) < 3) s++; if (s > bs) { bs = s; best = e; } }
        if (!best) return false;
        emit(["x", Math.round(best.x * 10), Math.round(best.z * 10), 34]);
        for (const o of [...G.enemies.values()]) if (dist(o.x, o.z, best.x, best.z) < 3.4) hitEnemy(o.id, 90 + 10 * G.wave, pi, 0, 2);
      }
      else if (it === "scroll") { const own = G.houses[p.house]; if (!own || !own.alive) return false; const ang = Math.atan2(-own.z, -own.x) || Math.PI / 2; p.x = own.x + Math.cos(ang) * 3.6; p.z = own.z + Math.sin(ang) * 3.6; p.seq++; }
      p.items[it]--; emit(["item", pi, it]); dirtyFull = true; return true;
    }
    case "perk": {
      const pk = D.PERKS[a.id]; if (!pk || (p.perks[a.id] || 0) >= pk.max) return false;
      const spent = Object.values(p.perks).reduce((s, x) => s + x, 0); if (spent >= p.lvl - 1) return false;
      p.perks[a.id] = (p.perks[a.id] || 0) + 1; const oldMax = p.st.maxhp; p.st = D.stats(p); if (p.st.maxhp > oldMax) p.hp += p.st.maxhp - oldMax;
      if (playerViews[pi]) updGear(playerViews[pi]); ok = true; break;
    }
    case "rdy": p.ready = !!a.v; dirtyFull = true; return true;
  }
  if (ok) { dirtyFull = true; if (h) updHouseView(h); }
  return ok;
}
function act(a) { if (isHost()) return doAct(me, a); send("a", a); return true; }
function onGift(from, to, c, w, s) {
  const a = G.players[from], b = G.players[to]; if (!a || !b) return;
  const what = [c ? `${c} 🪙` : "", w ? `${w} 🪵` : "", s ? `${s} 🪨` : ""].filter(Boolean).join(" ");
  if (to === me) { const el = $("gift"); el.innerHTML = `🎁 <b style="color:${a.color}">${esc(a.name)}</b> прислал тебе ${what}`; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); AU.play("buy"); fx.sparkle(b.x, 1.5, b.z, COL.gold, 24); vib("notify", "success"); }
  else if (from === me) toast(`Отправлено ${b.name}: ${what}`);
  // монетки летят от дарителя к получателю
  for (let i = 0; i < 10; i++) { const t = i / 10; fx.add.add(lerp(a.x, b.x, t), 1.2 + Math.sin(t * Math.PI) * 1.5, lerp(a.z, b.z, t), 0, 0.5, 0, 0.5 + t * 0.4, 0.3, 0.05, COL.gold, 0, 1); }
}

// ================= ЛОКАЛЬНЫЙ ИГРОК =================
const keys = {}; let joy = null, joyV = { x: 0, y: 0 };
addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "KeyQ" && phase === "play") useItem("potion"); });
addEventListener("keyup", (e) => { keys[e.code] = false; });
const jEl = $("joy"), jKnob = jEl.firstElementChild;
const UI_SEL = "button, #sheet.on, #perks, .screen, #menu, #map, .mate, #houses";
addEventListener("pointerdown", (e) => {
  if (phase !== "play" || e.target.closest(UI_SEL)) return;
  // тап по союзнику — подарок
  if (room) { for (const p of G.players) { if (p.idx === me || !p.present) continue; const v = playerViews[p.idx]; if (!v) continue; const s = scr(v.root.position.x, 1.1, v.root.position.z); if (Math.hypot(s.x - e.clientX, s.y - e.clientY) < 34) { openGift(p.idx); return; } } }
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

let myTarget = null, fireCd = 0, gatherCd = 0, lastLvl = 1, perkQueue = 0, hurtT = 0, sendT = 0, hitsBuf = [], hitT = 0, shotN = 0, coneT = 0;
function collide(o, r, isEnemy, big) {
  for (const h of G.houses) {
    const hr = (h.alive ? (h.lv >= 4 ? 2.3 : h.lv >= 3 ? 1.9 : D.HOUSE_R) : 1.4) + r; push(o, h.x, h.z, hr);
    if (h.alive) { h.turrets.forEach((t, s) => { if (t) { const p = slotPos(h, s); push(o, p.x, p.z, 0.85 + r); } });
      if (isEnemy && h.whp > 0) { const d = dist(o.x, o.z, h.x, h.z); if (d < D.WALL_R + r && d > 0.01) { o.x = h.x + (o.x - h.x) / d * (D.WALL_R + r); o.z = h.z + (o.z - h.z) / d * (D.WALL_R + r); } } }
  }
  if (!big) { for (const ob of obstacles) push(o, ob.x, ob.z, ob.r + r); for (const nd of G.nodes) if (nd.amt > 0) push(o, nd.x, nd.z, (nd.r || 0.5) + r); }
  if (WD && WD.lakes.length && WD.L.water !== "ice") for (const l of WD.lakes) { const ld = WD.lakeD(o.x, o.z); if (ld < r * 0.5) { const d = dist(o.x, o.z, l.x, l.z) || 1; const k = (r * 0.5 - ld); o.x += (o.x - l.x) / d * k; o.z += (o.z - l.z) / d * k; } }
  if (G.merchant) { const m = merchantSpot(G.houses.length); push(o, m.x - 1.6, m.z - 1.2, 1.2 + r); }
  const rr = Math.hypot(o.x, o.z), lim = D.MAP_R - 0.5; if (rr > lim) { o.x *= lim / rr; o.z *= lim / rr; }
}
function push(o, x, z, r) { const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz); if (d < r && d > 0.0001) { o.x = x + dx / d * r; o.z = z + dz / d * r; } }
function localStep(dt) {
  const p = P(); if (!p) return;
  if (!p.st) p.st = D.stats(p);
  let mx = joyV.x, mz = joyV.y;
  if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1; if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const moving = p.alive && ml > 0.12;
  if (p.alive) { p.x += mx * p.st.move * dt; p.z += mz * p.st.move * dt; collide(p, 0.42, false); }
  p.mv = moving ? 1 : 0;
  if (p.rageT > 0) p.rageT -= dt;
  // цель
  myTarget = null;
  if (p.alive && p.st.kind !== "orbit") { let bd = p.st.range; for (const e of G.enemies.values()) { if (e.spawnT > 0) continue; const d = dist(p.x, p.z, e.x, e.z) - e.r * 0.5; if (d < bd) { bd = d; myTarget = e; } } }
  p.tgt = myTarget ? myTarget.id : 0;
  if (myTarget) p.ry = Math.atan2(myTarget.x - p.x, myTarget.z - p.z); else if (moving) p.ry = Math.atan2(mx, mz);
  fireCd -= dt;
  if (myTarget && fireCd <= 0) { fireCd = 1 / p.st.rate; firePlayer(p, myTarget, true); }
  // клинки (оружие и перк) наносят урон сами
  orbitBlades(p, dt, true);
  // сбор ресурсов
  p.gn = -1;
  if (p.alive && !myTarget) {
    let calm = true; for (const e of G.enemies.values()) if (dist(e.x, e.z, p.x, p.z) < 6.5) { calm = false; break; }
    if (calm) { let bi = -1, bd = 1e9; G.nodes.forEach((nd, i) => { if (nd.amt <= 0) return; const d = dist(nd.x, nd.z, p.x, p.z) - (nd.r || 0.5); if (d < 1.1 && d < bd) { bd = d; bi = i; } }); p.gn = bi; }
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
        AU.play(nd.kind === "tree" ? "chop" : "mine", { vol: 0.7 });
        if (!isHost()) { nd.amt = Math.max(0, nd.amt - 1); updNode(WD, nd); }
        vib("impact", "light");
      }
    }
  } else gatherCd = Math.min(gatherCd, 0.35);
  if (p.lvl > lastLvl) { perkQueue += p.lvl - lastLvl; lastLvl = p.lvl; vib("notify", "success"); }
  if (perkQueue > 0 && $("perks").classList.contains("hidden") && p.alive) showPerks();
  if (room && !isHost()) {
    sendT -= dt;
    if (sendT <= 0) { sendT = 1 / 12; sendFast("i", [Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.ry * 100), p.tgt, p.mv, p.gn]); }
    hitT -= dt; if (hitsBuf.length && hitT <= 0) { hitT = 0.1; send("h", hitsBuf); hitsBuf = []; }
  } else if (room && isHost()) { sendT -= dt; if (sendT <= 0) { sendT = 1 / 12; sendFast("i", [Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.ry * 100), p.tgt, p.mv, p.gn]); } }
}
function useItem(id) {
  const p = P(); if (!p || !p.alive) return;
  if (!p.items[id]) { toast(`Нет: ${D.ITEMS[id].name} — купи у торговца`); AU.play("error"); return; }
  if (id === "potion" && p.hp >= p.st.maxhp) { toast("Здоровье и так полное"); return; }
  if (id === "rage") p.rageT = 10;
  act({ k: "use", id }); if (!isHost()) p.items[id]--;
  vib("impact", "medium"); hudDirty = true; itemsKey = "";
}
const dmgMul = (p) => (p.rageT > 0 ? 2 : 1) * (p.st.berserk && p.hp < p.st.maxhp * 0.5 ? 1.45 : 1);
const hitFlags = (st) => (st.frost ? 1 : 0) | (st.burn ? 2 : 0) | (st.poison ? 4 : 0) | (st.pyro ? 8 : 0);

// ---------- выстрелы игроков (все виды оружия) ----------
function firePlayer(p, tgt, real) {
  const st = p.st, v = playerViews[p.idx], Wp = D.WEAPONS[p.wpn] || D.WEAPONS.crossbow;
  const sx = p.x + Math.sin(p.ry) * 0.5, sz = p.z + Math.cos(p.ry) * 0.5, sy = 0.95;
  const base = Math.atan2(tgt.x - p.x, tgt.z - p.z), mul = dmgMul(p);
  const mine = p.idx === me;
  shotN++;
  if (st.kind === "chain") {
    const pts = [new THREE.Vector3(sx, 1.1, sz)], hit = new Set(); let cur = tgt;
    for (let j = 0; j <= st.jumps && cur; j++) {
      hit.add(cur.id); pts.push(new THREE.Vector3(cur.x, 1, cur.z));
      if (mine) { const crit = Math.random() < st.crit; dealDamage(cur, st.dmg * mul * Math.pow(0.85, j) * (crit ? 2 : 1), crit, hitFlags(st)); }
      let nb = null, bd = 4.5; for (const e of G.enemies.values()) { if (hit.has(e.id) || e.spawnT > 0) continue; const d = dist(e.x, e.z, cur.x, cur.z); if (d < bd) { bd = d; nb = e; } } cur = nb;
    }
    fx.lightning(pts, COL.blue);
  } else if (st.kind === "cone") {
    const dx = Math.sin(base), dz = Math.cos(base);
    fx.flame(sx + dx * 0.4, 1.0, sz + dz * 0.4, dx, dz, st.range / 4.8, st.cone);
    if (mine) for (const e of G.enemies.values()) { if (e.spawnT > 0) continue; const ex = e.x - p.x, ez = e.z - p.z, d = Math.hypot(ex, ez); if (d > st.range + e.r) continue; const a = Math.atan2(ex, ez); let da = Math.abs(((a - base + Math.PI) % PI2 + PI2) % PI2 - Math.PI); if (da < st.cone) dealDamage(e, st.dmg * mul, false, hitFlags(st), true); }
  } else if (st.kind === "boomer") {
    for (let i = 0; i < st.n; i++) { const a = base + (st.n > 1 ? (i / (st.n - 1) - 0.5) * st.spread * st.n : 0); shots.push({ kind: "boomer", x: sx, y: 1, z: sz, vx: Math.sin(a) * st.speedP, vy: 0, vz: Math.cos(a) * st.speedP, life: 3, out: st.range, owner: p.idx, real, dmg: st.dmg * mul, hit: new Set(), boom: true, spin: 0 }); }
  } else {
    const n = st.n, spread = n > 1 ? Math.max(st.spread, 0.12 * (n - 1)) : 0;
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0) + (Math.random() - 0.5) * 0.04;
      const crit = Math.random() < st.crit;
      shots.push({ kind: st.proj || "bolt", x: sx, y: sy, z: sz, vx: Math.sin(a) * st.speedP, vy: 0, vz: Math.cos(a) * st.speedP, life: st.range / st.speedP * 1.3, real, owner: p.idx, dmg: st.dmg * mul * (crit ? 2 : 1), crit, pierce: st.pierce, bounce: st.bounce, splash: st.splash, flags: hitFlags(st), hit: new Set(), tgt: st.kind === "rocket" ? tgt.id : n === 1 ? tgt.id : 0, homing: st.kind === "rocket", speed: st.speedP });
    }
  }
  // гроза: каждый N-й выстрел — молния с неба
  if (st.storm && shotN % st.storm === 0) { if (mine) { dealDamage(tgt, st.dmg * mul * 2.2, true, 0); if (isHost()) emit(["strike", Math.round(tgt.x * 10), Math.round(tgt.z * 10)]); else send("a", { k: "fx", f: "strike", x: Math.round(tgt.x * 10), z: Math.round(tgt.z * 10) }); } }
  if (st.kind !== "cone") fx.muzzle(sx + Math.sin(base) * 0.3, sy, sz + Math.cos(base) * 0.3, Math.sin(base), Math.cos(base), PROJ[st.proj || "bolt"] ? PROJ[st.proj || "bolt"].trail : COL.blue);
  if (v) v.recoil = 1;
  if (st.kind !== "cone" || coneT <= 0) { AU.play(Wp.snd || "xbow", { x: p.x, z: p.z, vol: mine ? 0.55 : 0.3, gap: 0.09 }); coneT = 0.35; }
}
const bladeCd = new Map();
function orbitBlades(p, dt, mine) {
  const v = playerViews[p.idx]; if (!v || !v.blades.length) return;
  const n = v.blades.length, R = p.st.kind === "orbit" ? p.st.range : 2.0, t = G.t * 3.2;
  v.blades.forEach((b, i) => {
    const a = t + i / n * PI2, x = v.root.position.x + Math.cos(a) * R, z = v.root.position.z + Math.sin(a) * R;
    b.position.set(x, 0.9, z); b.rotation.set(Math.PI / 2, 0, -a);
    b.visible = p.alive;
    if (!mine || !p.alive || p.idx !== me) return;
    for (const e of G.enemies.values()) {
      if (e.spawnT > 0 || dist(e.x, e.z, x, z) > e.r + 0.45) continue;
      const key = e.id * 16 + i, last = bladeCd.get(key) || 0; if (G.t - last < 0.45) continue; bladeCd.set(key, G.t);
      const dmgB = (p.st.kind === "orbit" ? p.st.dmg : 9 * (1 + 0.18 * (p.perks.dmg || 0))) * dmgMul(p);
      dealDamage(e, dmgB, false, hitFlags(p.st)); fx.hit(x, 0.9, z, COL.spark, false); AU.play("blade", { vol: 0.35, gap: 0.08 });
    }
  });
  if (bladeCd.size > 2000) bladeCd.clear();
}
function turretShot(h, s, t, e, real) {
  const TD = D.TURRETS[t.type], top = towerTop(h, s), y = top.y;
  const sh = { kind: TD.proj, x: top.x, y, z: top.z, life: 4, real: false, tgt: e.id, splash: TD.splash || 0, slow: TD.slow, burn: TD.burn, cloud: TD.cloud, pierce: TD.pierce || 0, tower: h.idx * 10 + s, hit: new Set(), homing: TD.proj !== "stone" && TD.proj !== "spear" };
  if (TD.proj === "stone" || TD.proj === "fire" || TD.proj === "venom") { sh.arc = true; sh.sx = top.x; sh.sz = top.z; sh.sy = y; sh.tx = e.x + (e.vx || 0) * 0.3; sh.tz = e.z + (e.vz || 0) * 0.3; sh.t = 0; sh.dur = Math.max(0.6, dist(top.x, top.z, e.x, e.z) / TD.speed); }
  else { const d = dist(top.x, top.z, e.x, e.z) || 1; sh.vx = (e.x - top.x) / d * TD.speed; sh.vz = (e.z - top.z) / d * TD.speed; sh.vy = (1 - y) / (d / TD.speed); sh.speed = TD.speed; if (TD.proj === "spear") sh.life = TD.range / TD.speed * 1.2; }
  shots.push(sh);
  fx.muzzle(top.x, y, top.z, 0, 0, PROJ[TD.proj] ? PROJ[TD.proj].trail : COL.spark);
  const tv = h.view && h.view.turrets[s]; if (tv) { tv.kick = 1; if (tv.b && tv.b.aim) tv.b.aim.rotation.y = Math.atan2(e.x - top.x, e.z - top.z) - tv.obj.rotation.y; }
  AU.play(TD.snd, { x: top.x, z: top.z, vol: 0.45, gap: 0.12 });
}
function enemyShot(e, tx, tz, kind, real) {
  const d = dist(e.x, e.z, tx, tz), M = D.MON[e.type], fly = M.fly || 0;
  shots.push({ kind: kind === "fire" ? "fire" : kind === "arrow" ? "arrow" : kind === "sting" ? "sting" : kind === "web" ? "web" : kind === "curse" ? "curse" : "acid", arc: true, sx: e.x, sz: e.z, sy: 1.4 + fly, tx, tz, t: 0, dur: Math.max(0.45, d / (kind === "arrow" || kind === "sting" ? 16 : 9)), from: e.id, real: false, hit: new Set(), enemyShot: true });
  const v = enemyViews.get(e.id); if (v && !D.MON[e.type].q) playOnce(v, M.ranged === "arrow" ? "1H_Ranged_Shoot" : "Spellcast_Shoot", 1.6);
}
function updateShots(dt) {
  const counts = {}; for (const k in PROJ) counts[k] = 0;
  const keep = [];
  for (const s of shots) {
    let alive = true;
    if (s.arc) {
      s.t += dt; const k = Math.min(1, s.t / s.dur);
      s.x = lerp(s.sx, s.tx, k); s.z = lerp(s.sz, s.tz, k); s.y = lerp(s.sy, 0.2, k) + Math.sin(k * Math.PI) * (s.kind === "arrow" || s.kind === "sting" ? 0.6 : 2 + s.dur * 2.5);
      if (k >= 1) { alive = false; landArc(s); }
    } else if (s.enemy) {
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt; if (s.life <= 0) alive = false;
      if (alive && s.real) for (const p of G.players) if (p.alive && !s.hit.has(p.idx) && dist(p.x, p.z, s.x, s.z) < 0.6) { s.hit.add(p.idx); damagePlayer(p, s.dmg); }
    } else {
      if (s.boom) {   // бумеранг: туда до дальности, потом обратно к хозяину
        const pv = playerViews[s.owner]; s.spin += dt * 20;
        if (s.out > 0) { s.out -= Math.hypot(s.vx, s.vz) * dt; if (s.out <= 0) s.hit.clear(); }
        else if (pv) { const dx = pv.root.position.x - s.x, dz = pv.root.position.z - s.z, d = Math.hypot(dx, dz) || 1, sp = Math.hypot(s.vx, s.vz); s.vx = dx / d * sp; s.vz = dz / d * sp; if (d < 0.8) alive = false; }
      }
      if (s.homing) { const e = G.enemies.get(s.tgt); if (e) { const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz) || 1; const tvx = dx / d * s.speed, tvz = dz / d * s.speed; const k = s.kind === "rocket" ? Math.min(1, dt * 5) : 1; s.vx = lerp(s.vx, tvx, k); s.vz = lerp(s.vz, tvz, k); s.vy = (0.9 - s.y) * 6; } }
      const ox = s.x, oz = s.z;
      s.x += s.vx * dt; s.y += (s.vy || 0) * dt; s.z += s.vz * dt; s.life -= dt;
      if (s.life <= 0) alive = false;
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
      if (i < 180) {
        const yaw = s.arc ? Math.atan2(s.tx - s.sx, s.tz - s.sz) : Math.atan2(s.vx || 0, s.vz || 0);
        if (s.kind === "stone" || s.kind === "shuriken" || s.kind === "boomer") _q.setFromEuler(_e.set(s.kind === "stone" ? G.t * 9 : 0, (s.spin || G.t * 14), 0)); else _q.setFromEuler(_e.set(0, yaw, 0));
        _m.compose(_v.set(s.x, s.y, s.z), _q, _s.setScalar(s.kind === "fire" || s.kind === "venom" ? 0.8 + Math.random() * 0.4 : 1));
        im.setMatrixAt(i, _m);
      }
      if (Math.random() < (quality === 0 ? 0.35 : 0.8)) fx.trail(s.x, s.y, s.z, PR.trail, PR.size);
      if (s.kind === "rocket" && Math.random() < 0.6) fx.norm.add(s.x, s.y, s.z, 0, 0.3, 0, 0.6, 0.25, 0.7, COL.smoke, 0, 1);
    }
  }
  shots = keep;
  for (const k in PROJ) { PROJ[k].mesh.count = Math.min(180, counts[k]); PROJ[k].mesh.instanceMatrix.needsUpdate = true; }
}
function projHit(s, e) {
  s.hit.add(e.id);
  const PR = PROJ[s.kind];
  fx.hit(s.x, s.y, s.z, PR.hit, s.crit);
  const ev = enemyViews.get(e.id); if (ev) ev.flash = 1;
  AU.play(D.MON[e.type].snd === "bone" ? "bone" : "hit", { x: e.x, z: e.z, vol: 0.3, gap: 0.06 });
  if (s.owner != null) {
    if (s.owner === me || s.real) {
      dealDamage(e, s.dmg, s.crit, s.flags || 0);
      if (s.splash) for (const o of G.enemies.values()) if (o !== e && dist(o.x, o.z, e.x, e.z) < s.splash) dealDamage(o, s.dmg * (s.kind === "fire" || s.kind === "rocket" ? 1 : 0.5), false, s.flags || 0);
    }
    if (s.splash) { fx.ring(e.x, e.z, 0.2, s.splash, 0.3, s.kind === "fire" || s.kind === "rocket" ? 0xff8030 : 0xffd080); if (s.kind === "fire" || s.kind === "rocket") { fx.explosion(e.x, e.z, 1.1); AU.play("boom", { x: e.x, z: e.z, vol: 0.5, gap: 0.1 }); } }
    if (s.boom) return true;
    if (s.pierce > 0) { s.pierce--; return true; }
    if (s.bounce > 0) {
      s.bounce--; let best = null, bd = 6;
      for (const o of G.enemies.values()) { if (s.hit.has(o.id) || o.spawnT > 0) continue; const d = dist(o.x, o.z, e.x, e.z); if (d < bd) { bd = d; best = o; } }
      if (best) { const sp = Math.hypot(s.vx, s.vz), d = bd || 1; s.vx = (best.x - e.x) / d * sp; s.vz = (best.z - e.z) / d * sp; s.x = e.x; s.z = e.z; s.life = 1; return true; }
    }
    return false;
  }
  if (s.tower != null) {
    const dmg = s.dmg || 0, fl = (s.slow ? 1 : 0) | (s.burn ? 2 : 0);
    if (s.real) { hitEnemy(e.id, dmg, s.src, false, fl); if (s.splash) for (const o of [...G.enemies.values()]) if (o !== e && dist(o.x, o.z, e.x, e.z) < s.splash) hitEnemy(o.id, dmg * 0.6, s.src, false, fl); }
    if (s.splash) fx.ring(e.x, e.z, 0.2, s.splash, 0.35, s.slow ? 0x9fe8ff : 0xffd080);
    const TD = Object.values(D.TURRETS).find((x) => x.proj === s.kind);
    if (TD) fx.text(e.x, 1.8, e.z, Math.round(s.dmg || TD.dmg), s.slow ? "#bff3ff" : "#ffe6a8", 13, 0.6);
    if (s.pierce > 0) { s.pierce--; return true; }
  }
  return false;
}
function landArc(s) {
  curSrc = "shot:" + (s.from ? (G.enemies.get(s.from) || {}).type : "?"); curHm = 1;
  const PR = PROJ[s.kind];
  fx.hit(s.x, 0.3, s.z, PR.hit, true);
  if (s.tower != null) {
    const r = s.splash || 2, fl = s.burn ? 2 : 0;
    if (s.kind === "stone") { fx.explosion(s.x, s.z, 1.4); fx.chips(s.x, 0.4, s.z, COL.stone); AU.play("stonehit", { x: s.x, z: s.z, vol: 0.6 }); }
    if (s.kind === "fire") { fx.explosion(s.x, s.z, 1.2); }
    if (s.kind === "venom") { fx.cloud(s.x, s.z, r, COL.venom); }
    if (s.real) {
      for (const o of [...G.enemies.values()]) if (dist(o.x, o.z, s.x, s.z) < r + o.r) hitEnemy(o.id, s.dmg, s.src, false, fl);
      if (s.cloud) { const c = { x: s.x, z: s.z, r, t: s.cloud, dps: s.dmg * 0.6, owner: s.src }; G.clouds.push(c); emit(["cloud", Math.round(s.x * 10), Math.round(s.z * 10), Math.round(r * 10), Math.round(s.cloud * 10)]); }
    }
    fx.text(s.x, 1.6, s.z, Math.round(s.dmg || 0), "#ffe6a8", 15, 0.7);
    return;
  }
  if (s.enemyShot) {
    const col = s.kind === "fire" ? 0xff8030 : s.kind === "web" ? 0xffffff : s.kind === "curse" ? 0xc77dff : 0x9cff3a;
    fx.ring(s.x, s.z, 0.2, 1.2, 0.4, col); fx.puff(s.x, s.z, 6, s.kind === "fire" ? COL.fire : COL.acid, 0.4);
    if (s.real) {
      for (const p of G.players) if (p.alive && dist(p.x, p.z, s.x, s.z) < 1.3) { damagePlayer(p, s.dmgP || 8); if (s.web) { p.webT = 2.5; } }
      const h = G.houses[s.th]; if (h && h.alive && dist(h.x, h.z, s.x, s.z) < (h.whp > 0 ? D.WALL_R : D.HOUSE_R) + 1.5) damageHouse(h, s.dmgH || 8);
    }
  }
}
// мой урон: хозяин применяет сразу, гость шлёт пачкой
function dealDamage(e, dmg, crit, flags, quiet) {
  const d = Math.round(dmg);
  if (!quiet || Math.random() < 0.3) fx.text(e.x, 1.9 + (D.MON[e.type].boss ? 1.5 : 0) + (D.MON[e.type].fly || 0), e.z, crit ? d + "!" : d, crit ? "#ff5a3c" : flags & 2 ? "#ffb070" : flags & 4 ? "#a8ff7a" : flags & 1 ? "#bff3ff" : "#ffffff", crit ? 22 : 15, crit ? 0.9 : 0.7);
  if (isHost()) hitEnemy(e.id, dmg, me, crit, flags);
  else { hitsBuf.push([e.id, Math.round(dmg * 10) / 10, crit ? 1 : 0, flags || 0]); const est = e.max > 1 ? e.max : D.MON[e.type].hp * D.hpMul(G.wave || 1, G.players.length, LOCD().diff) * (e.el ? 2.5 : 1); e.predHp = Math.max(0, (e.predHp != null ? e.predHp : 100) - dmg / est * 100); e.predT = G.t; }
}
function onHurt(d) {
  if (G.t - hurtT > 0.35) { hurtT = G.t; vib("impact", d > 20 ? "heavy" : "light"); AU.play("hurt", { vol: 0.6, gap: 0.3 }); }
  const v = playerViews[me]; if (v) v.hurt = 1;
  fx.shake = Math.min(1, fx.shake + 0.25);
  const p = P(); fx.text(p.x, 2.2, p.z, "-" + Math.round(d * (1 - (p.st ? p.st.def : 0))), "#ff4040", 17, 0.8);
}
const remoteCd = [];
function remoteFire(dt) {
  G.players.forEach((p, i) => {
    if (i === me || !p.alive || !p.present) return;
    if (!p.st) p.st = D.stats(p);
    orbitBlades(p, dt, false);
    if (!p.tgt) return;
    remoteCd[i] = (remoteCd[i] || 0) - dt; if (remoteCd[i] > 0) return;
    const e = G.enemies.get(p.tgt); if (!e) return;
    remoteCd[i] = 1 / p.st.rate;
    firePlayer(p, e, false);
  });
}

// ================= ОТРИСОВКА =================
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let menuAng = 0, dayK = 0;
function updateViews(dt) {
  const t = G.t;
  G.players.forEach((p, i) => {
    const v = playerViews[i]; if (!v) return;
    v.root.visible = p.present;
    if (!p.present) { v.blades.forEach((b) => (b.visible = false)); return; }
    if (i !== me && p.vx == null) {}
    const k = i === me ? 1 : 1 - Math.exp(-dt * 12);
    v.pos.x = lerp(v.pos.x, p.x, k); v.pos.z = lerp(v.pos.z, p.z, k);
    const moved = Math.hypot(v.pos.x - v.root.position.x, v.pos.z - v.root.position.z) / Math.max(dt, 0.001);
    v.root.position.set(v.pos.x, 0, v.pos.z);
    let dr = p.ry - v.c.obj.rotation.y; while (dr > Math.PI) dr -= PI2; while (dr < -Math.PI) dr += PI2; v.c.obj.rotation.y += dr * Math.min(1, dt * 16);
    if (!p.alive) { if (!v.deadShown) onPlayerDown(p); v.c.mixer.update(dt); return; }
    if (v.deadShown) { v.deadShown = false; v.c.mixer.stopAllAction(); v.base = v.upper = null; fx.heal(p.x, p.z); }
    const moving = (i === me ? p.mv : moved > 0.8), aiming = !!p.tgt && !!G.enemies.get(p.tgt), chop = p.gn >= 0 && !aiming;
    v.cheer = (v.cheer || 0) - dt;
    if (!(v.cheer > 0 && !moving && !aiming)) {
      const Wp = D.WEAPONS[p.wpn] || {};
      const upper = aiming ? (Wp.kind === "chain" || Wp.kind === "cone" ? "Cast_U" : Wp.model === "crossbow_2handed" ? "Aim2_U" : "Aim_U") : chop ? "Chop_U" : null;
      playAnim(v, "base", moving ? (upper ? "Run_L" : "Running_A") : (upper ? "Idle_L" : "Idle"));
      playAnim(v, "upper", upper);
      if (v.cheer > -0.5 && v.cheer < 0) { const a = v.c.act("Cheer"); if (a) a.fadeOut(0.2); v.cheer = -1; }
    }
    const runA = v.c.act("Running_A"); if (runA) runA.timeScale = p.st ? p.st.move / 5.2 : 1;
    const ch = v.c.act("Chop_U"); if (ch) ch.timeScale = 1.35;
    v.c.mixer.update(dt);
    v.recoil = Math.max(0, v.recoil - dt * 8); if (v.wpn) v.wpn.position.z = -v.recoil * 0.25;
    v.hurt = Math.max(0, (v.hurt || 0) - dt * 4);
    const rg = p.rageT > 0 ? 0.35 + Math.sin(t * 10) * 0.15 : 0;
    v.allMats.forEach((m) => { if (m.emissive) m.emissive.setRGB(v.hurt * 0.9 + rg, rg * 0.15, 0); });
    if (rg && Math.random() < 0.3) fx.embers(v.pos.x, 1, v.pos.z, 1, COL.red);
    if (v.orb.visible) { const a = t * 2.4; v.orb.position.set(Math.cos(a) * 0.65, 1.1 + Math.sin(t * 3) * 0.12, Math.sin(a) * 0.65); if (Math.random() < 0.3) fx.trail(v.root.position.x + v.orb.position.x, v.orb.position.y, v.root.position.z + v.orb.position.z, new THREE.Color(D.AMULETS[p.amu].color), 0.15); }
    v.ring.material.opacity = 0.55 + Math.sin(t * 4) * 0.2;
    // огнемёт: пламя у гостей тоже видно
    if (aiming && p.st && p.st.kind === "cone" && i !== me) { const e = G.enemies.get(p.tgt); if (e) { const b = Math.atan2(e.x - p.x, e.z - p.z); fx.flame(v.pos.x + Math.sin(b) * 0.8, 1, v.pos.z + Math.cos(b) * 0.8, Math.sin(b), Math.cos(b), 1, 0.5); } }
  });
  // монстры
  const camX = camPos.x, camZ = camPos.z;
  for (const [id, v] of enemyViews) {
    const e = v.e, M = D.MON[e.type];
    if (v.dead) {
      v.dead += dt; v.c.mixer.update(dt);
      if (v.noDie || M.q) { const k = Math.min(1, v.dead / 0.6); if (!M.q) v.root.scale.setScalar(1 - k * 0.9); }
      if (M.fly && v.root.position.y > 0) v.root.position.y = Math.max(0, v.root.position.y - dt * 6);
      if (v.dead > 1.4) { v.root.position.y -= dt * 1.2; v.mats.forEach((m) => { m.transparent = true; m.opacity = Math.max(0, 1 - (v.dead - 1.4)); }); }
      if (v.dead > 2.4) removeEnemyView(id);
      continue;
    }
    if (!isHost()) {
      const k = 1 - Math.exp(-dt * 10);
      const px = (e.tx ?? e.x) + (e.vx || 0) * 0.05, pz = (e.tz ?? e.z) + (e.vz || 0) * 0.05;
      e.x = lerp(e.x, px, k); e.z = lerp(e.z, pz, k);
      let dr = (e.try ?? e.ry) - e.ry; while (dr > Math.PI) dr -= PI2; while (dr < -Math.PI) dr += PI2; e.ry += dr * k;
    }
    const fly = M.fly ? M.fly + Math.sin(G.t * 3 + e.id) * 0.2 : 0;
    v.root.position.set(e.x, fly, e.z); v.root.rotation.y = e.ry;
    v.bl.position.y = 0.03 - fly; v.bl.scale.setScalar(M.r * 2.2 * (fly ? 0.7 : 1));
    if (v.rise > 0) { v.rise -= dt; const k = 1 - Math.max(0, v.rise) / 0.8; v.c.obj.position.y = -(1 - k) * 1.2; }
    const [mv, at] = enemyAnim(e);
    v.spawn -= dt;
    if (v.spawn <= 0) {
      const name = e.atk || e.breath > 0 ? at : mv;
      if (v.base !== name) { const old = v.c.act("Spawn_Ground_Skeletons"); if (old && old.isRunning()) old.fadeOut(0.2); }
      playAnim(v, "base", name, 0.25);
      const a = v.c.act(name);
      if (a) a.timeScale = e.atk ? Math.max(0.6, a.getClip().duration * M.rate * (e.enr ? 1.4 : 1)) : (M.q ? 1 : M.spd / (e.type === "runner" ? 3.2 : /orc|bomber/.test(e.type) ? 3 : 1.6)) * (e.slowT > 0 ? 0.5 : 1) * (e.enr ? 1.35 : 1) * (e.chg ? 2 : 1);
    }
    const far = Math.abs(e.x - camX) > 22 || Math.abs(e.z - camZ) > 26;
    v.skip = far ? (v.skip || 0) + 1 : 0;
    if (!far || v.skip % 3 === 0) v.c.mixer.update(far ? dt * 3 : dt);
    v.flash = Math.max(0, v.flash - dt * 6);
    const pulse = e.type === "bomber" ? (Math.sin(t * 10) * 0.5 + 0.5) * 0.6 : 0, sl = e.slowT > 0 ? 0.35 : 0, bu = e.burnT > 0 ? 0.35 + Math.sin(t * 14) * 0.1 : 0, po = e.poisonT > 0 ? 0.25 : 0, en = e.enr ? 0.4 + Math.sin(t * 8) * 0.2 : 0;
    v.mats.forEach((m) => m.emissive && m.emissive.setRGB(v.flash + pulse + bu + en, v.flash + sl * 0.6 + po + bu * 0.3, v.flash + sl));
    if (e.burnT > 0 && Math.random() < 0.35) fx.embers(e.x, 0.8 + fly, e.z, 1);
    if (e.poisonT > 0 && Math.random() < 0.2) fx.add.add(e.x + (Math.random() - 0.5) * 0.6, 1 + fly, e.z + (Math.random() - 0.5) * 0.6, 0, 0.8, 0, 0.5, 0.2, 0.05, COL.venom, 0, 0.5);
    if (v.aura) { v.aura.rotation.y += dt * 1.5; v.aura.material.opacity = 0.45 + Math.sin(t * 4) * 0.2; }
    if (e.breath > 0) { e.breath -= isHost() ? 0 : dt; const a = e.breathA; fx.flame(e.x + Math.sin(a) * 1.4, 1.2 + fly * 0.6, e.z + Math.cos(a) * 1.4, Math.sin(a), Math.cos(a), 1.7, 0.4); }
    if (e.chg && Math.random() < 0.6) fx.puff(e.x, e.z, 1, COL.dust, 0.6);
  }
  updDrops(dt);
  // дома
  for (const h of G.houses) {
    const v = h.view; if (!v) continue;
    v.shake = Math.max(0, v.shake - dt);
    if (v.model) v.model.position.x = Math.sin(t * 70) * v.shake * 0.12;
    if (v.pop > 0) { v.pop = Math.max(0, v.pop - dt * 2.2); const s = 1 + Math.sin(v.pop * Math.PI) * 0.1; v.model.scale.y = s * (v.model.userData.sy || (v.model.userData.sy = v.model.scale.y)); }
    v.turrets.forEach((tv) => {
      if (!tv || !tv.obj) return;
      const s0 = tv.obj.userData.s0 || (tv.obj.userData.s0 = 1);
      if (tv.pop > 0) { tv.pop = Math.max(0, tv.pop - dt * 2.5); tv.obj.scale.y = 1 + Math.sin(tv.pop * Math.PI) * 0.25; } else tv.obj.scale.y = 1;
      if (tv.kick > 0) { tv.kick = Math.max(0, tv.kick - dt * 6); tv.obj.scale.y *= 1 - tv.kick * 0.05; }
      const b = tv.b; if (!b) return;
      if (b.spin) b.spin.rotation.y += dt * 1.6, b.spin.position.y += Math.sin(t * 2) * 0.002;
      if (b.orbs) b.orbs.forEach((o, i) => { const a = t * 2 + o.userData.orbit.a; o.position.set(Math.cos(a) * 0.55, b.spin.position.y + Math.sin(t * 3 + i) * 0.1, Math.sin(a) * 0.55); });
      if (b.orb) b.orb.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
      b.glow.forEach((m) => { if (!m.userData.e0) m.userData.e0 = m.emissive.clone(); m.emissive.copy(m.userData.e0).multiplyScalar(0.8 + Math.sin(t * 3) * 0.25); });
      for (const f of b.fx) { if (Math.random() > (quality === 0 ? 0.25 : 0.6)) continue; const wp = f.p.clone().applyMatrix4(tv.obj.matrixWorld); if (f.k === "fire") fx.embers(wp.x, wp.y, wp.z, 1); else if (f.k === "poison") fx.add.add(wp.x + (Math.random() - 0.5) * 0.4, wp.y, wp.z + (Math.random() - 0.5) * 0.4, 0, 0.7, 0, 0.8, 0.25, 0.05, COL.venom, 0, 0.5); }
    });
    for (const f of v.fx) { if (!v.model || Math.random() > 0.25) continue; const wp = f.p.clone().applyMatrix4(v.model.matrixWorld); if (f.k === "smoke") fx.norm.add(wp.x, wp.y, wp.z, 0.2, 0.8, 0, 2.2, 0.3, 1.1, COL.smoke, -0.1, 0.2); else if (f.k === "lamp") fx.add.add(wp.x, wp.y, wp.z, 0, 0, 0, 0.3, 0.7, 0.5, COL.fire2); }
    if (v.flag) v.flag.rotation.y = Math.sin(t * 2.5 + h.idx) * 0.25;
    if (!h.alive && Math.random() < dt * 4) fx.norm.add(h.x + (Math.random() - 0.5) * 2, 1, h.z + (Math.random() - 0.5) * 2, 0, 1.2, 0, 2, 0.8, 2.6, COL.smoke, -0.2, 0.3);
    const near = P() && dist(P().x, P().z, h.x, h.z) < 9;
    v.slots.forEach((s) => { s.material.opacity = near ? 0.35 + Math.sin(t * 3) * 0.15 : 0.12; });
  }
  // ресурсы
  for (const nd of G.nodes) {
    if (nd.shake > 0) { nd.shake = Math.max(0, nd.shake - dt); updNode(WD, nd); }
    if (nd.grow != null && nd.amt > 0) { nd.grow = Math.min(1, nd.grow + dt * 1.5); updNode(WD, nd); if (nd.grow >= 1) { nd.grow = null; renderer.shadowMap.needsUpdate = true; } }
  }
  if (merchView) merchView.c.mixer.update(dt);
  // ворота
  gateViews.forEach((g, i) => { g.userData.ring.rotation.y += dt * 0.6; if (Math.random() < 0.15 && G.ph === "wave") fx.add.add(g.position.x + (Math.random() - 0.5) * 2, 0.2, g.position.z + (Math.random() - 0.5) * 2, 0, 1 + Math.random(), 0, 0.8, 0.25, 0.05, COL.purple, 0, 0.5); });
  // облака яда
  G.clouds.forEach((c) => { if (!isHost()) c.t -= dt; if (Math.random() < 0.5) fx.cloud(c.x, c.z, c.r, COL.venom); });
  if (!isHost()) G.clouds = G.clouds.filter((c) => c.t > 0);
  // огонь лавы, костры
  if (WD) for (const f of WD.fxPoints) { if (f.k === "campfire") { if (Math.random() < 0.7) fx.embers(f.x, 0.35, f.z, 1); if (Math.random() < 0.5) fx.add.add(f.x + (Math.random() - 0.5) * 0.3, 0.3, f.z + (Math.random() - 0.5) * 0.3, 0, 1.2, 0, 0.4, 0.55, 0.1, Math.random() < 0.5 ? COL.fire : COL.fire2, 0, 1); } else if (f.k === "lava" && Math.random() < 0.3) { const a = Math.random() * PI2, r = Math.random() * f.R; fx.embers(f.x + Math.cos(a) * r, 0, f.z + Math.sin(a) * r, 1); } }
  A.wind.value += dt; grassT.value += dt;
}
const COIN = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.9, roughness: 0.25, emissive: 0x7a5200, emissiveIntensity: 0.6 }), 300);
COIN.count = 0; COIN.frustumCulled = false; scene.add(COIN);
function updDrops(dt) {
  let i = 0; const p = P();
  for (const d of [...G.drops.values()]) {
    if (d.o !== me) continue;   // чужую добычу не показываем — она личная
    if (d.vy) { d.vy -= 18 * dt; d.y += d.vy * dt; d.x += (d.vx || 0) * dt; d.z += (d.vz || 0) * dt; if (d.y <= 0) { d.y = 0; d.vy = Math.abs(d.vy) > 2 ? -d.vy * 0.35 : 0; } }
    if (d.fly != null && p) { d.fly += dt; const k = Math.min(1, d.fly / 0.6); d.x = lerp(d.x, p.x, k * 0.25); d.z = lerp(d.z, p.z, k * 0.25); d.y = Math.sin(k * Math.PI) * 2; if (k >= 1) { fx.sparkle(p.x, 1, p.z, COL.gold, 2); G.drops.delete(d.id); continue; } }
    else if (!isHost() && p && p.alive) { const bd = dist(p.x, p.z, d.x, d.z), mag = p.st ? p.st.magnet : 3.4; if (bd < mag && bd > 0.3) { const sp = 9 * dt; d.x += (p.x - d.x) / bd * Math.min(bd, sp); d.z += (p.z - d.z) / bd * Math.min(bd, sp); } }
    if (i >= 300) break;
    _m.compose(_v.set(d.x, 0.35 + d.y + Math.sin(G.t * 4 + d.id) * 0.08, d.z), _q.setFromEuler(_e.set(0, G.t * 3 + d.id, 0)), _s.setScalar(d.v >= 5 ? 1.5 : d.v >= 2 ? 1.2 : 1));
    COIN.setMatrixAt(i++, _m);
    if (Math.random() < 0.03) fx.sparkle(d.x, 0.5, d.z, COL.gold, 1);
  }
  COIN.count = i; COIN.instanceMatrix.needsUpdate = true;
}
function updateCamera(dt) {
  const p = P();
  const portrait = H > W;
  const vfov = camera.fov * Math.PI / 180, hfovT = Math.tan(vfov / 2) * camera.aspect;
  let d = clamp((portrait ? 5.8 : 9) / hfovT, 15, 30);
  const pitch = 0.98;
  if (phase === "play" && p) {
    const vv = playerViews[me]; let tx = vv ? vv.root.position.x : p.x, tz = vv ? vv.root.position.z : p.z;
    if (bossCam > 0) { bossCam -= dt; const k = Math.min(1, bossCam / 0.4, (1.8 - bossCam) / 0.4); tx = lerp(tx, bossCamPos.x, k); tz = lerp(tz, bossCamPos.z, k); }
    camPos.x = lerp(camPos.x, tx, 1 - Math.exp(-dt * 6)); camPos.z = lerp(camPos.z, tz + 1.2, 1 - Math.exp(-dt * 6));
  } else { menuAng += dt * 0.05; d = 40; camPos.set(Math.cos(menuAng) * 7, 0, Math.sin(menuAng) * 7); }
  const sh = fx.shake * fx.shake * 0.5;
  camera.position.set(camPos.x + (Math.random() - 0.5) * sh, Math.sin(pitch) * d, camPos.z + Math.cos(pitch) * d + (Math.random() - 0.5) * sh);
  camLook.set(camPos.x, 0, camPos.z); camera.lookAt(camLook);
  AU.setListener(camPos.x, camPos.z);
  const want = phase === "play" && G.ph === "wave" ? 1 : 0;
  dayK = lerp(dayK, want, 1 - Math.exp(-dt * 0.8));
  scene.background.copy(DAY.sky).lerp(NIGHT.sky, dayK); scene.fog.color.copy(DAY.fog).lerp(NIGHT.sky, dayK); scene.fog.near = d + 8; scene.fog.far = d + 60;
  hemi.intensity = lerp(DAY.hemi, NIGHT.hemi, dayK); sun.intensity = lerp(DAY.sun, NIGHT.sun, dayK); sun.color.copy(DAY.sunC).lerp(NIGHT.sunC, dayK);
  renderer.toneMappingExposure = lerp(1.0, 0.9, dayK);
  updateWorld(WD, dt, camPos.x, camPos.z, H * DPR);
}

// ---------- 2D-слой ----------
const _p = new THREE.Vector3();
function scr(x, y, z) { _p.set(x, y, z).project(camera); return { x: (_p.x + 1) / 2 * W, y: (1 - _p.y) / 2 * H, on: _p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1 }; }
function bar(x, y, w, h, k, col, bg) { octx.fillStyle = bg || "rgba(0,0,0,.55)"; octx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2); octx.fillStyle = col; octx.fillRect(x - w / 2, y, w * clamp(k, 0, 1), h); }
function drawOverlay() {
  octx.clearRect(0, 0, W, H);
  if (phase !== "play") return;
  octx.textAlign = "center"; octx.textBaseline = "middle"; octx.lineJoin = "round";
  for (const e of G.enemies.values()) {
    const M = D.MON[e.type]; if (M.boss) continue;
    const k = isHost() ? e.hp / e.max : (e.predHp != null ? Math.min(e.predHp, e.hpPct) : e.hpPct) / 100;
    const s = scr(e.x, (M.q ? M.qs * (e.el ? 1.25 : 1) + 0.3 : 1.75 * monScale(M, e) / 0.7) + (M.fly || 0), e.z); if (!s.on) continue;
    if (e.el) { octx.font = "14px sans-serif"; octx.fillText("👑", s.x, s.y - 10); }
    if (k < 0.999) bar(s.x, s.y, M.r > 0.6 ? 44 : 30, 4, k, e.slowT > 0 ? "#7cc9ff" : e.poisonT > 0 ? "#8cff4a" : "#ff4d4d");
  }
  G.players.forEach((p, i) => {
    if (!p.present) return;
    const v = playerViews[i]; const x = v ? v.root.position.x : p.x, z = v ? v.root.position.z : p.z;
    const s = scr(x, 1.95, z); if (!s.on) return;
    if (i !== me) { octx.font = "800 12px Manrope, sans-serif"; octx.lineWidth = 3; octx.strokeStyle = "rgba(0,0,0,.8)"; octx.strokeText(p.name, s.x, s.y - 10); octx.fillStyle = p.color; octx.fillText(p.name, s.x, s.y - 10); }
    if (p.alive && p.st) bar(s.x, s.y, 36, 4, p.hp / p.st.maxhp, "#5cff7a");
    if (!p.alive) { octx.font = "900 15px sans-serif"; octx.strokeText("💀 " + Math.max(0, Math.ceil(p.downT)), s.x, s.y); octx.fillStyle = "#fff"; octx.fillText("💀 " + Math.max(0, Math.ceil(p.downT)), s.x, s.y); }
  });
  for (const h of G.houses) {
    if (!h.alive) continue;
    const s = scr(h.x, (h.view && h.view.hh || 3) + 0.8, h.z); if (!s.on) continue;
    bar(s.x, s.y, 64, 6, h.hp / h.max, "#5cff7a");
    if (h.wmax > 0) bar(s.x, s.y + 9, 64, 3, h.whp / h.wmax, "#ffd36a");
    const np = Object.keys(h.pools).length; if (np) { octx.font = "12px sans-serif"; octx.fillText("🔨" + np, s.x + 44, s.y + 3); }
  }
  if (merchView) { const mp = merchView.root.position, s = scr(mp.x, 1.9 + Math.sin(G.t * 3) * 0.12, mp.z); if (s.on) { octx.font = "26px sans-serif"; octx.fillText("🛒", s.x, s.y); } else edgeArrow(mp.x, mp.z, "🛒"); }
  const p = P(); const myH = p && G.houses[p.house];
  if (myH && myH.alive && G.ph === "wave" && dist(p.x, p.z, myH.x, myH.z) > 14) edgeArrow(myH.x, myH.z, "🏠");
  const boss = G.bossId && G.enemies.get(G.bossId); if (boss) { const s = scr(boss.x, 0, boss.z); if (!s.on) edgeArrow(boss.x, boss.z, "💀"); }
  for (const t of fx.texts) {
    const k = t.t / t.life, s = scr(t.x, t.y + k * 1.2, t.z); if (!s.on) continue;
    const sc = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
    octx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    octx.font = `900 ${Math.round(t.size * sc)}px Manrope, sans-serif`; octx.lineWidth = 4; octx.strokeStyle = "rgba(25,12,4,.85)";
    octx.strokeText(t.str, s.x + t.dx * k, s.y); octx.fillStyle = t.color; octx.fillText(t.str, s.x + t.dx * k, s.y);
  }
  octx.globalAlpha = 1;
  if (p && p.alive && p.st && p.hp / p.st.maxhp < 0.35) { const g = octx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7); g.addColorStop(0, "rgba(255,0,0,0)"); g.addColorStop(1, `rgba(200,0,0,${0.25 + Math.sin(G.t * 6) * 0.1})`); octx.fillStyle = g; octx.fillRect(0, 0, W, H); }
}
function edgeArrow(x, z, icon) {
  const s = scr(x, 0, z); const cx2 = W / 2, cy2 = H / 2; let dx = s.x - cx2, dy = s.y - cy2; if (_p.z > 1) { dx = -dx; dy = -dy; }
  const k = Math.min((W / 2 - 34) / Math.abs(dx || 1), (H / 2 - 120) / Math.abs(dy || 1)); const ax = cx2 + dx * k, ay = cy2 + dy * k;
  octx.save(); octx.translate(ax, ay); octx.fillStyle = "rgba(15,18,28,.7)"; octx.beginPath(); octx.arc(0, 0, 20, 0, PI2); octx.fill();
  octx.rotate(Math.atan2(dy, dx)); octx.fillStyle = "#ffd36a"; octx.beginPath(); octx.moveTo(26, 0); octx.lineTo(16, -7); octx.lineTo(16, 7); octx.fill(); octx.restore();
  octx.font = "20px sans-serif"; octx.fillText(icon, ax, ay + 1);
}

// ================= ИНТЕРФЕЙС БОЯ =================
let hudDirty = true, hudT = 0, teamDirty = true, itemsKey = "";
const cache = {};
function setTxt(id, s) { if (cache[id] !== s) { cache[id] = s; $(id).innerHTML = s; } }
function setW(el, k) { const s = (clamp(k, 0, 1) * 100).toFixed(1) + "%"; if (el.style.width !== s) el.style.width = s; }
function hud() {
  const p = P(); if (!p) return;
  const L = LOCD(), tm = Math.max(0, Math.ceil(G.timer));
  setTxt("wave", G.ph === "build" ? `${G.wave ? "Волна " + G.wave + " / " + L.waves + " ✔" : L.icon + " Подготовка"}<small>⏳ до волны ${G.wave + 1}: ${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, "0")}</small>` : `Волна ${G.wave} / ${L.waves}<small>💀 врагов: ${G.enemies.size + (isHost() ? G.queue.length : qLeft)}</small>`);
  setTxt("r-c", "🪙 " + p.wallet.c); setTxt("r-w", "🪵 " + p.wallet.w); setTxt("r-s", "🪨 " + p.wallet.s);
  setTxt("lvl", `<b>${p.lvl}</b>`); $("lvl").style.setProperty("--xp", (p.xp / D.xpNeed(p.lvl) * 100).toFixed(0) + "%");
  const mh = p.st ? p.st.maxhp : 100;
  setW($("hpbar").firstElementChild, p.hp / mh); $("hpbar").lastElementChild.textContent = `${Math.ceil(p.hp)} / ${mh}`;
  const hs = G.houses.map((h) => { const o = G.players[h.owner]; return `<div class="hs ${h.alive ? "" : "dead"} ${h.owner === me ? "me" : ""}"><span style="color:${o ? o.color : "#fff"}">🏠</span>${G.houses.length > 1 ? esc((o || {}).name || "").slice(0, 7) : "Дом"}<div class="bar"><i style="width:${(h.hp / h.max * 100).toFixed(0)}%"></i>${h.wmax ? `<u style="width:${(h.whp / h.wmax * 100).toFixed(0)}%"></u>` : ""}</div></div>`; }).join("");
  setTxt("houses", hs);
  const boss = G.bossId && G.enemies.get(G.bossId);
  $("boss").style.display = boss ? "block" : "none";
  if (boss) { setTxt("boss", `<div>💀 ${D.MON[boss.type].name}${boss.enr ? " · ЯРОСТЬ" : ""}</div><div class="bar"><i style="width:${((isHost() ? boss.hp / boss.max : (boss.hpPct || 100) / 100) * 100).toFixed(0)}%"></i></div>`); }
  const nh = nearHouse(), nm = nearMerchant();
  $("b-build").classList.toggle("hidden", !nh || !p.alive);
  $("b-shop").classList.toggle("hidden", !nm || !p.alive); $("b-shop").classList.toggle("hot", !!nm);
  $("b-ready").classList.toggle("hidden", G.ph !== "build"); $("b-ready").classList.toggle("on", p.ready);
  const rd = G.players.filter((q) => q.present && q.ready).length, tot = G.players.filter((q) => q.present).length;
  setTxt("b-ready", p.ready ? (tot > 1 ? `⏳ Ждём ${rd}/${tot}` : "⏳ Скоро…") : (tot > 1 ? `✅ Готов ${rd}/${tot}` : "⚔️ В бой!"));
  // предметы
  const ik = Object.entries(p.items).map(([k, v]) => k + v).join(",");
  if (ik !== itemsKey) { itemsKey = ik; $("items").innerHTML = Object.entries(p.items).filter(([k, v]) => v > 0).map(([k, v]) => `<button class="ab" data-it="${k}">${D.ITEMS[k].icon}<small>${v}</small></button>`).join(""); $("items").querySelectorAll("[data-it]").forEach((b) => (b.onclick = () => useItem(b.dataset.it))); }
  let hint = "";
  if (p.alive) { if (p.gn >= 0) hint = G.nodes[p.gn].kind === "tree" ? "🪓 Рублю дерево…" : "⛏️ Добываю камень…"; else if (G.wave === 0 && G.t < 25) hint = "Подойди к дереву или камню — добыча сама. Стреляю сам!"; }
  setTxt("near", hint);
  const dead = $("dead");
  if (!p.alive) { dead.classList.remove("hidden"); setTxt("dead", `💀 Ты пал<br><small>Возрождение через ${Math.max(0, Math.ceil(p.downT))} с</small>`); } else dead.classList.add("hidden");
  if (teamDirty) drawTeam();
  netStatus();
  if (panelOpen) refreshPanel();
}
function drawTeam() {
  teamDirty = false; if (!room) return;
  $("team").innerHTML = G.players.filter((p) => p.idx !== me).map((p) => `<button class="mate" data-p="${p.idx}" style="${p.present ? "" : "opacity:.4"}"><i style="background:${p.color}">${p.present ? "🎁" : "💤"}</i>${esc(p.name).slice(0, 10)}${p.idx === hostIdx ? " 👑" : ""}</button>`).join("");
  $("team").querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => openGift(+b.dataset.p)));
}
function netStatus() {
  if (!room) return;
  const el = $("net"), now = performance.now();
  let txt, col;
  if (isHost()) { const n = G.players.filter((p) => p.present && p.idx !== me).length; txt = `👑 ты ведёшь · ${n} в игре`; col = "#9fe8ff"; }
  else { const lag = now - lastSnapT; const link = room.link === "p2p" ? "прямая" : "сервер"; if (lag > 3000) { txt = `🔴 связь потеряна… ${Math.ceil(lag / 1000)} с`; col = "#ff8a8a"; } else if (lag > 600 || room.rtt > 400) { txt = `🟡 ${link} · ${room.rtt || "?"} мс`; col = "#ffd36a"; } else { txt = `🟢 ${link} · ${room.rtt || "?"} мс`; col = "#9fffb0"; } }
  if (el.textContent !== txt) { el.textContent = txt; el.style.color = col; }
  // хозяин молчит → новый хозяин
  // хозяин молчит: берём мир на себя, только если сами слышим других (значит, пропал именно хозяин) или тишина уже 25 с
  if (!isHost() && phase === "play" && now - lastSnapT > 10000 && (now - otherRx < 5000 || now - lastSnapT > 25000)) migrate("timeout");
  else if (!isHost() && phase === "play" && hostGoneT && now - hostGoneT > 3000 && now - snapRx > 6000 && now - lastSnapT > 3000) { hostGoneT = 0; migrate("left"); }
}
function nearHouse() { const p = P(); let b = null, bd = 8; for (const h of G.houses) { if (!h.alive) continue; const d = dist(p.x, p.z, h.x, h.z); if (d < bd) { bd = d; b = h; } } return b; }
function nearMerchant() { if (!G.merchant) return false; const p = P(), m = merchantSpot(G.houses.length); return dist(p.x, p.z, m.x, m.z) < 4.5; }
let msgT = 0;
function msg(t, sub, ms, cls) { const el = $("msg"); el.className = "tx " + (cls || ""); el.innerHTML = `<div class="bn"><b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`; void el.offsetWidth; el.classList.add("on"); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove("on"), ms || 1600); }
let toastT = 0;
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 1700); }
UI.setToast(toast);

// ---------- панели: стройка (с общим вкладом), торговец, подарок ----------
let panelOpen = null, panelKey = "", selSlot = -1;
function openPanel(kind, h) { panelOpen = { kind, h: h ? h.idx : -1 }; selSlot = -1; panelKey = ""; UI.sheet("<div></div>", { onClose: () => { panelOpen = null; } }); refreshPanel(); }
function closePanel() { if (panelOpen) UI.closeSheet(); panelOpen = null; }
const costTxt = (c) => D.fmtCost(c);
function poolItem(h, key, icon, title, sub) {
  const tg = poolTarget(h, key); if (!tg) return "";
  const p = P(), pool = h.pools[key], paid = pool ? pool.paid : { c: 0, w: 0, s: 0 };
  const need = {}; let tot = 0, got = 0; for (const r of ["c", "w", "s"]) { need[r] = Math.max(0, (tg.cost[r] || 0) - paid[r]); tot += tg.cost[r] || 0; got += paid[r]; }
  const canAll = canPay(p.wallet, need), canSome = ["c", "w", "s"].some((r) => need[r] > 0 && p.wallet[r] > 0);
  const who = pool ? Object.entries(pool.by).map(([i, b]) => { const pp = G.players[i]; return pp ? `<span style="color:${pp.color}">${esc(pp.name).slice(0, 8)}: ${costTxt(b) || "—"}</span>` : ""; }).join("") : "";
  return `<div class="it"><div class="ic">${icon}</div><div class="tx2"><b>${title}</b><span>${sub} · ${pool ? "осталось " + costTxt(need) : costTxt(tg.cost)}</span>${pool ? `<div class="pbar"><i style="width:${(got / tot * 100).toFixed(0)}%"></i></div><div class="who">${who}</div>` : ""}</div>
    <button ${canAll || canSome ? "" : "disabled"} data-a='${JSON.stringify({ k: "con", h: h.idx, key })}'>${canAll ? (pool ? "✔ Достроить" : "🔨 Построить") : "➕ Вложить"}</button></div>`;
}
function refreshPanel() {
  const p = P(); if (!panelOpen || !p) return;
  let html = "";
  const wal = `<div class="wallet">У тебя: 🪙 ${p.wallet.c} · 🪵 ${p.wallet.w} · 🪨 ${p.wallet.s}</div>`;
  if (panelOpen.kind === "build") {
    const h = G.houses[panelOpen.h];
    if (!h || !h.alive || dist(p.x, p.z, h.x, h.z) > 10.5) { closePanel(); return; }
    const own = G.players[h.owner], mine = h.owner === me;
    html += UI.head(`🏠 ${mine ? "Твой аванпост" : "Аванпост · " + esc(own ? own.name : "")}`) + wal;
    if (room) html += `<p class="hint">Строить можно вместе: каждый вкладывает часть, когда сумма набрана — постройка готова.</p>`;
    const NL = D.HOUSE_LV[h.lv + 1];
    html += NL ? poolItem(h, "h" + (h.lv + 1), ["", "🏠", "🏡", "🏯", "🏰"][h.lv + 1], `Дом → уровень ${h.lv + 1}`, `прочность ${Math.round(NL.hp * (h.mh || 1))}, полный ремонт`) : `<div class="it"><div class="ic">🏰</div><div class="tx2"><b>Дом · максимум</b><span>Прочность ${Math.ceil(h.hp)} / ${Math.round(h.max)}</span></div></div>`;
    if (h.hp < h.max) html += `<div class="it"><div class="ic">🔧</div><div class="tx2"><b>Починить дом</b><span>${Math.ceil(h.hp)} / ${Math.round(h.max)} · +${Math.round(D.REPAIR.part * 100)}%</span></div><button ${p.wallet.w >= D.REPAIR.w ? "" : "disabled"} data-a='${JSON.stringify({ k: "rep", h: h.idx })}'>${D.REPAIR.w}🪵</button></div>`;
    const WL = D.WALL_LV[h.wall + 1];
    if (WL) html += poolItem(h, "w" + (h.wall + 1), "🧱", WL.name, h.wall ? `сейчас: ${D.WALL_LV[h.wall].name}` : "принимает удары первой, чинится после волны");
    html += `<div class="sec">Башни — выбери место</div><div class="slots">`;
    for (let s = 0; s < D.SLOTS; s++) { const t = h.turrets[s], pend = Object.keys(h.pools).some((k) => k.startsWith("t" + s + ":") || k.startsWith("u" + s + ":")); html += `<button class="slot ${s === selSlot ? "sel" : ""}" data-slot="${s}"><span class="ic">${t ? D.TURRETS[t.type].icon : "➕"}</span>${t ? "ур. " + t.lv : "Пусто"}<small>${pend ? "🔨 строится" : "место " + (s + 1)}</small></button>`; }
    html += `</div>`;
    if (selSlot >= 0) {
      const t = h.turrets[selSlot];
      if (!t) for (const [k, TD] of Object.entries(D.TURRETS)) html += poolItem(h, "t" + selSlot + ":" + k, TD.icon, TD.name, `${TD.desc} · урон ${TD.dmg}`);
      else { const TD = D.TURRETS[t.type]; html += t.lv < D.TURRET_MAX ? poolItem(h, "u" + selSlot + ":" + (t.lv + 1), TD.icon, `${TD.name} → ур. ${t.lv + 1}`, `урон ${Math.round(TD.dmg * D.turretMul(t.lv))} → ${Math.round(TD.dmg * D.turretMul(t.lv + 1))}, новый вид`) : `<div class="it"><div class="ic">${TD.icon}</div><div class="tx2"><b>${TD.name} · максимум</b><span>урон ${Math.round(TD.dmg * D.turretMul(t.lv))}</span></div></div>`; }
    } else html += `<p class="hint">Нажми на место, чтобы поставить или улучшить башню.</p>`;
    if (!mine && own && own.present) html += `<div class="sec">Помочь союзнику</div><button class="gbtn" data-gift="${h.owner}" style="text-align:center">🎁 Передать ресурсы · ${esc(own.name)}</button>`;
    html += `<p class="hint">Монеты получает тот, кто добил монстра (башня — её хозяину). За помощь в убийстве — часть опыта и монетка.</p>`;
  } else if (panelOpen.kind === "shop") {
    if (!G.merchant || !nearMerchant()) { closePanel(); return; }
    html += UI.head("🛒 Торговец") + wal;
    const groups = { w: "Оружие", r: "Броня", m: "Амулеты", i: "Расходники" }; let last = "";
    for (const id of G.merchant.stock.split(";")) {
      const [cat, key] = id.split(":");
      const it = cat === "w" ? D.WEAPONS[key] : cat === "r" ? D.ARMOR[key] : cat === "m" ? D.AMULETS[key] : D.ITEMS[key]; if (!it) continue;
      if (cat !== last) { html += `<div class="sec">${groups[cat]}</div>`; last = cat; }
      const owned = (cat === "w" && p.wpn === key) || (cat === "r" && p.arm === key) || (cat === "m" && p.amu === key);
      const full = cat === "i" && (p.items[key] || 0) >= it.max;
      const sub = cat === "w" ? `${it.desc} · урон ${it.dmg}${it.n > 1 ? "×" + it.n : ""}` : it.desc + (cat === "i" ? ` · у тебя ${p.items[key] || 0}/${it.max}` : "");
      html += `<div class="it ${owned ? "own" : ""}"><div class="ic">${it.icon}</div><div class="tx2"><b>${it.name}</b><span>${sub}</span></div><button ${!owned && !full && p.wallet.c >= it.price ? "" : "disabled"} data-a='${JSON.stringify({ k: "buy", id })}'>${owned ? "✔ Твоё" : full ? "Полно" : it.price + "🪙"}</button></div>`;
    }
  } else if (panelOpen.kind === "gift") {
    const to = G.players[panelOpen.to]; if (!to) { closePanel(); return; }
    html += UI.head(`🎁 Передать · <span style="color:${to.color}">${esc(to.name)}</span>`) + wal + `<p class="hint">Отправь союзнику монеты, дерево или камень — например, чтобы он улучшил свою башню. Работает и во время волны.</p>`;
    for (const [r, ic, nm] of [["c", "🪙", "Монеты"], ["w", "🪵", "Дерево"], ["s", "🪨", "Камень"]]) {
      const have = p.wallet[r];
      html += `<div class="it" style="display:block"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:24px">${ic}</span><b style="flex:1">${nm}</b><span class="mut">у тебя ${have}</span></div>
        <div class="qbtns">${[10, 50].map((n) => `<button ${have >= 1 ? "" : "disabled"} data-g='${JSON.stringify({ [r]: Math.min(n, have) })}'>${n}</button>`).join("")}<button ${have >= 1 ? "" : "disabled"} data-g='${JSON.stringify({ [r]: have })}'>Все</button></div></div>`;
    }
  }
  if (html === panelKey) return;
  panelKey = html;
  const el = $("sheet-body"); const sc = el.scrollTop; el.innerHTML = html; el.scrollTop = sc;
  el.querySelector("[data-x]").onclick = closePanel;
  el.querySelectorAll("[data-slot]").forEach((b) => (b.onclick = () => { selSlot = +b.dataset.slot; AU.play("select"); refreshPanel(); }));
  el.querySelectorAll("[data-gift]").forEach((b) => (b.onclick = () => openGift(+b.dataset.gift)));
  el.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => { const g = JSON.parse(b.dataset.g); act(Object.assign({ k: "gift", to: panelOpen.to }, g)); AU.play("buy"); if (!isHost()) for (const r in g) p.wallet[r] -= g[r]; panelKey = ""; setTimeout(refreshPanel, 80); }));
  el.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => {
    const a = JSON.parse(b.dataset.a);
    const ok = act(a);
    if (ok) { vib("impact", "medium"); AU.play(a.k === "buy" ? "buy" : "build"); if (a.k === "buy") { fx.sparkle(p.x, 1.4, p.z, COL.gold, 18); toast("Куплено! ✨"); St.event("buy", { game: GAME, id: a.id }); } else St.event("build", { game: GAME, k: a.k, key: a.key }); }
    else { toast("Не хватает ресурсов"); AU.play("error"); }
    panelKey = ""; setTimeout(refreshPanel, 80);
  }));
}
function openGift(i) { if (!G.players[i] || i === me) return; panelOpen = { kind: "gift", to: i }; panelKey = ""; UI.sheet("<div></div>", { onClose: () => { panelOpen = null; } }); refreshPanel(); }
$("b-build").onclick = () => { const h = nearHouse(); if (h) openPanel("build", h); };
$("b-shop").onclick = () => { if (nearMerchant()) openPanel("shop"); };
$("b-ready").onclick = () => { const p = P(); const v = !p.ready; act({ k: "rdy", v }); p.ready = v; AU.play("confirm"); hudDirty = true; };
$("btn-set").onclick = () => UI.showSettings(readQ, () => { if (room) { room.close(); room = null; } toMenu(); });

// ---------- выбор перка (редкость, синергии) ----------
function showPerks() {
  const p = P();
  const pool = Object.keys(D.PERKS).filter((k) => { const pk = D.PERKS[k]; if ((p.perks[k] || 0) >= pk.max) return false; if (pk.need && !p.perks[pk.need] && !(pk.need === "burn" && p.st.burn) && !(pk.need === "venom" && p.st.poison) && !(pk.need === "frost" && p.st.frost)) return false; if (pk.r === "e" && p.lvl < 3) return false; return true; });
  const pick = [];
  while (pick.length < 3 && pool.length) {
    let tot = 0; pool.forEach((k) => (tot += D.RARITY[D.PERKS[k].r].w * (D.PERKS[k].need ? 2.5 : 1)));
    let x = Math.random() * tot, ch = pool[0]; for (const k of pool) { x -= D.RARITY[D.PERKS[k].r].w * (D.PERKS[k].need ? 2.5 : 1); if (x <= 0) { ch = k; break; } }
    pick.push(ch); pool.splice(pool.indexOf(ch), 1);
  }
  if (!pick.length) { perkQueue = 0; return; }
  const el = $("perks");
  el.innerHTML = `<h2>Уровень ${p.lvl - perkQueue + 1}!</h2><p>Выбери улучшение${room ? "" : " · игра на паузе"}</p>` + pick.map((k) => { const pk = D.PERKS[k], n = p.perks[k] || 0, R = D.RARITY[pk.r]; return `<button class="pk" data-k="${k}" style="--rc:${R.color}"><span class="ic">${pk.icon}</span><div><b>${pk.name}</b><span>${pk.desc}</span>${n ? `<br><span style="color:var(--gold)">уже ${n}/${pk.max}</span>` : ""}</div><em>${R.name}</em></button>`; }).join("");
  el.classList.remove("hidden");
  fx.levelup(p.x, p.z); AU.play("levelup");
  el.querySelectorAll(".pk").forEach((b) => (b.onclick = () => {
    const k = b.dataset.k;
    if (!isHost()) { p.perks[k] = (p.perks[k] || 0) + 1; p.st = D.stats(p); updGear(playerViews[me]); }
    act({ k: "perk", id: k });
    perkQueue--; el.classList.add("hidden"); AU.play("perk"); vib("impact", "medium");
    St.event("perk", { game: GAME, id: k, lvl: p.lvl });
  }));
}
const paused = () => !room && !$("perks").classList.contains("hidden");
const slowMo = () => !room && UI.sheetOpen() && G.ph === "wave";

// ---------- конец матча: звёзды, кристаллы ----------
function onOver(d) {
  if (phase === "over") return;
  phase = "over"; G.over = true;
  const L = D.LOC[d.loc] || LOCD();
  const stars = d.win ? (d.lost === 0 ? 3 : d.lost <= Math.floor((d.houses || 1) / 2) ? 2 : 1) : 0;
  const res = finishRun(d.loc || G.loc, d.wave, !!d.win, stars, d.bossKills || G.bossKills);
  St.gameEnd({ wave: d.wave, win: !!d.win, players: G.players.length, solo: !room, loc: d.loc });
  St.event("game_over", { game: GAME, wave: d.wave, win: !!d.win, players: G.players.length, solo: !room, loc: d.loc });
  closePanel(); UI.closeSheet(); $("perks").classList.add("hidden");
  AU.music(d.win ? "win" : "lose");
  $("end-stars").innerHTML = d.win ? [0, 1, 2].map((i) => `<i class="${i < stars ? "on" : ""}">★</i>`).join("") : "";
  $("end-title").textContent = d.hostLeft ? "Игра окончена — хозяин вышел" : d.win ? `${L.name}: победа!` : "Игра окончена — аванпосты пали";
  $("end-wave").textContent = d.win ? `${d.wave} / ${L.waves} волн` : `Волна ${d.wave}`;
  $("end-gems").innerHTML = `+${res.gems} 💎 кристаллов${res.firstClear ? " · открыта новая локация!" : ""}`;
  $("end-sub").innerHTML = `<div><span>Рекорд локации</span><span>волна ${locState(d.loc || G.loc).best}</span></div>` + (d.stats || []).map((s) => `<div><span>${esc(s[0])} · ур.${s[3]}</span><span>💀 ${s[1]} · ⚔️ ${s[2]}</span></div>`).join("");
  const b = [];
  const next = D.LOCS[D.LOCS.findIndex((l) => l.id === (d.loc || G.loc)) + 1];
  if (isHost()) {
    if (d.win && next) b.push([`➡️ Дальше: ${next.icon} ${next.name}`, "primary", () => restart(next.id)]);
    b.push([d.win ? "🔁 Ещё раз" : "🔁 Попробовать снова", d.win && next ? "" : "primary", () => restart(d.loc || G.loc)]);
  } else if (!d.hostLeft) b.push(["Ждём, пока хозяин начнёт…", "", () => {}]);
  b.push(["🗺️ В меню", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
  const box = $("end-buttons"); box.innerHTML = "";
  b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "gbtn " + c; el.style.textAlign = "center"; el.textContent = l; el.onclick = () => { AU.play("click"); f(); }; box.appendChild(el); });
  setTimeout(() => $("screen-end").classList.remove("hidden"), 1300);
  if (room && isHost()) room.on("start", () => {});
}
function restart(loc) {
  const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9), loc }); delete c2.me;
  c2.players = c2.players.filter((pc, i) => !room || (G.players[i] && G.players[i].present));
  if (room) send("start2", Object.assign({ hi: Math.max(0, c2.players.findIndex((pc) => pc.id === room.me.id)), ep: ep + 1 }, c2));
  const mi = Math.max(0, c2.players.findIndex((pc) => pc.id === (room ? room.me.id : "me")));
  begin({ room, cfg: Object.assign({}, c2, { me: mi }), host: true, hostIdx: mi, ep: ep + 1 });
}
function toMenu() {
  phase = "menu"; ["hud", "acts", "btn-set", "net", "team", "screen-end", "dead", "lobby"].forEach((id) => $(id).classList.add("hidden")); $("near").textContent = "";
  closePanel(); UI.closeSheet();
  buildMenuScene();
  UI.showMenu(menuHandlers); AU.music("menu");
}

// ================= ЛОББИ (своё) =================
let lobbyInfo = {};
function myHello() { return { uid: S.uid, name: T.playerName() === "Друг" ? "Игрок" : T.playerName(), style: S.skin, meta: S.up, wpn: S.wpn }; }
async function hostParty(loc) {
  phase = "lobby"; showLobby({ status: "Создаём комнату…" });
  try { room = await Net.openParty(GAME, null, { name: myHello().name, max: 6, late: true }); }
  catch (e) { showLobby({ error: "Нет связи с сервером 😕 Проверь интернет" }); return; }
  lobbyInfo = { [room.me.id]: myHello() };
  room.on("roster", () => drawLobby(loc));
  room.on("hello", (d, from) => { lobbyInfo[from] = d; drawLobby(loc); if (phase === "play") lateJoin(from, d); });
  room.on("left", () => drawLobby(loc));
  const share = () => T.openLink(`https://t.me/share/url?url=${encodeURIComponent(Net.inviteLink(GAME, room.id))}&text=${encodeURIComponent("Го в «Аванпост» 🏰 Защищаем крепость вместе — заходи!")}`);
  St.event("party_create", { game: GAME });
  share();
  const L = () => loc;
  const drawLobby = (lc) => {
    if (phase !== "lobby") return;
    loc = lc || loc; const Lc = D.LOC[loc];
    const ps = room.players;
    $("lobby-card").innerHTML = `<div style="font-size:40px">🏰</div><h2>Комната друзей</h2><p class="mut">Позови друзей одной ссылкой — до 6 игроков. Вход можно и после старта.</p>
      <button class="lobloc" id="lb-loc"><span class="ic">${Lc.icon}</span><div><b>${Lc.name}</b><small>${Lc.waves} волн · сменить локацию ›</small></div></button>
      ${ps.map((p, i) => { const inf = lobbyInfo[p.id] || {}; return `<div class="lobp"><i style="background:${COLORS[i % 6]}"></i>${esc(p.name)}${p.id === room.me.id ? " (ты)" : ""}<small>${D.SKINS[inf.style || "medieval"].icon}</small></div>`; }).join("")}
      <button class="gbtn" id="lb-inv" style="text-align:center">📨 Пригласить друзей</button>
      <button class="gbtn primary big" id="lb-go">▶ Начать (${ps.length})</button>
      <button class="gbtn ghost" id="lb-x">Выйти</button>`;
    $("lb-inv").onclick = share;
    $("lb-loc").onclick = () => { $("lobby").classList.add("hidden"); UI.showMap({ title: "Выбери локацию", btn: "✔ Выбрать", sel: loc, onPick: (id) => { $("lobby").classList.remove("hidden"); drawLobby(id); }, onBack: () => $("lobby").classList.remove("hidden") }); };
    $("lb-x").onclick = () => { room.close(); room = null; toMenu(); };
    $("lb-go").onclick = () => {
      const players = room.players.map((p, i) => { const inf = lobbyInfo[p.id] || {}; return { id: p.id, name: p.name, color: COLORS[i % 6], uid: inf.uid || p.id, style: inf.style || "medieval", meta: inf.meta || {}, wpn: inf.wpn || "crossbow" }; });
      const used = {}; players.forEach((pp) => { const k = pp.name; used[k] = (used[k] || 0) + 1; if (used[k] > 1) pp.name = `${k} ${used[k]}`; });
      const c = { loc, seed: Math.floor(Math.random() * 1e9), players };
      room.lock(); send("start2", c);
      begin({ room, cfg: Object.assign({}, c, { me: 0 }), host: true, hostIdx: 0, ep: 0 });
    };
    $("lobby").classList.remove("hidden");
  };
  drawLobby(loc);
}
async function joinParty(id) {
  phase = "lobby"; showLobby({ status: "Подключаемся к комнате…" });
  try { room = await Net.openParty(GAME, id, { name: myHello().name }); }
  catch (e) { showLobby({ error: "Нет связи с сервером 😕 Проверь интернет" }); return; }
  St.event("party_join", { game: GAME });
  const hello = () => { if (phase === "lobby" && room) room.send("hello", myHello()); };
  hello(); const hi = setInterval(() => { if (phase !== "lobby") { clearInterval(hi); return; } hello(); }, 2500);
  const draw = () => {
    if (phase !== "lobby") return;
    const ps = room.players;
    $("lobby-card").innerHTML = `<div style="font-size:40px">⚔️</div><h2>Ты в комнате</h2><p class="mut">${ps.length ? "Ждём, пока хозяин начнёт игру." : "Ищем хозяина комнаты… Если игра уже идёт — ты войдёшь в неё."}</p>
      ${ps.map((p, i) => `<div class="lobp"><i style="background:${COLORS[i % 6]}"></i>${esc(p.name)}${p.id === room.me.id ? " (ты)" : ""}${p.host ? "<small>👑</small>" : ""}</div>`).join("")}
      <button class="gbtn ghost" id="lb-x">Выйти</button>`;
    $("lb-x").onclick = () => { room.close(); room = null; clearInterval(hi); toMenu(); };
    $("lobby").classList.remove("hidden");
  };
  room.on("roster", draw);
  room.on("full", (d) => showLobby({ error: d && d.started ? "Игра уже идёт, а мест нет 😕" : "Комната заполнена" }));
  room.on("host-left", () => { if (phase === "lobby") showLobby({ error: "Хозяин комнаты вышел 😕" }); });
  room.on("start2", (c) => { if (phase === "play" || phase === "over") { if (!c) return; } const mi = c.players.findIndex((p) => p.id === room.me.id); if (mi < 0) return; clearInterval(hi); begin({ room, cfg: Object.assign({}, c, { me: mi }), host: false, hostIdx: c.hi || 0, ep: c.ep || 0 }); });
  room.on("welcome", (d) => { if (!d || d.to !== room.me.id || phase === "play") return; clearInterval(hi); const c = Object.assign({}, d.cfg, { me: d.me }); begin({ room, cfg: c, host: false, hostIdx: d.hi, ep: d.ep }, d.snap); toast("Ты вернулся в бой!"); });
  draw();
}
function showLobby(o) {
  $("lobby").classList.remove("hidden");
  $("lobby-card").innerHTML = `<div style="font-size:40px">${o.error ? "📵" : "📡"}</div><h2>${o.error ? "Не получилось" : o.status}</h2>${o.error ? `<p class="mut">${o.error}</p><button class="gbtn primary big" id="lb-back">Назад</button>` : `<div id="load" style="margin:16px 0"><i style="width:60%;animation:pulse 1s infinite"></i></div>`}`;
  const b = $("lb-back"); if (b) b.onclick = () => { if (room) room.close(); room = null; toMenu(); };
}

// ================= ГЛАВНЫЙ ЦИКЛ =================
let last = 0, acc = 0, fpsAcc = 0, fpsN = 0, fpsCheck = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (last && ts - last > 1500) { const n = performance.now(); lastSnapT = n; G.players.forEach((p) => { if (p.seen) p.seen = n; }); }   // вкладка спала — никого не считаем пропавшим
  let dt = Math.min((ts - (last || ts)) / 1000, 0.05); last = ts;
  if (!A.ready) return;
  const realDt = dt;
  if (window.__speed) dt *= window.__speed;
  if (slowMo()) dt *= 0.35;
  if (phase === "play" && !paused()) {
    if (!isHost()) G.t += dt;
    if (isHost()) { acc += dt; let n = 0; while (acc >= 1 / 30 && n < 8) { hostStep(1 / 30); acc -= 1 / 30; n++; } }
    localStep(dt); remoteFire(dt); updateShots(dt);
    coneT -= dt;
    if (isHost() && room) { snapT -= realDt; if (snapT <= 0) { snapT = 1 / 10; sendFast("s", makeSnap()); } }
    hudT -= realDt; if (hudT <= 0 || hudDirty) { hudT = 0.15; hudDirty = false; hud(); }
  } else if (phase === "play" && isHost() && room) { snapT -= realDt; if (snapT <= 0) { snapT = 0.5; sendFast("s", makeSnap()); } }
  if (phase === "over") { updateShots(dt); if (isHost() && room) { snapT -= realDt; if (snapT <= 0) { snapT = 1; } } }
  if (!paused()) { updateViews(phase === "menu" || phase === "lobby" ? dt * 0.5 : dt); fx.update(dt); }
  updateCamera(realDt);
  if (window.__norender) return;   // только для автотестов
  renderer.info.autoReset = false; renderer.info.reset();
  if (composer) composer.render(); else renderer.render(scene, camera);
  drawOverlay();
  if (qAuto && phase === "play") {
    fpsAcc += realDt; fpsN++; fpsCheck += realDt;
    if (fpsCheck > 4) { const fps = fpsN / fpsAcc; fpsAcc = fpsN = fpsCheck = 0; if (fps < 38 && quality > 0) { quality--; applyQuality(); toast(`Графика: ${["низкая", "средняя", "высокая"][quality]} (для плавности)`); } }
  }
}

// ================= МЕНЮ =================
function buildMenuScene() {
  for (const id of [...enemyViews.keys()]) removeEnemyView(id);
  playerViews.forEach((v) => { if (v) { world.remove(v.root); v.blades.forEach((b) => world.remove(b)); } }); playerViews.length = 0;
  if (merchView) { world.remove(merchView.root); merchView = null; }
  G.enemies.clear(); G.drops.clear(); G.players = []; shots = [];
  const cur = D.LOCS.find((l) => !locState(l.id).cleared) || D.LOCS[0];
  cfg = { players: [0, 1, 2].map((i) => ({ color: COLORS[i] })) };
  G.loc = cur.id; buildLocation(cur.id, 777, 3);
  G.houses = houseSpots(3).map((s, i) => ({ idx: i, owner: i, x: s.x, z: s.z, lv: 1 + i, hp: 1, max: 1, wall: i ? i : 0, whp: 1, wmax: 1, alive: true, style: ["medieval", "eastern", "nordic"][i], pools: {}, turrets: [i ? { type: ["pagoda", "minaret", "arrow"][i], lv: 2 + i % 2 } : null, null, { type: ["cannon", "frost", "fire"][i], lv: 2 }, null, i === 2 ? { type: "ballista", lv: 3 } : null, null] }));
  G.houses.forEach(makeHouseView);
  cfg = null;
  renderer.shadowMap.needsUpdate = true;
}
const menuHandlers = {
  onCampaign: () => { UI.hideMenu(); UI.showMap({ onPick: (loc) => startSolo(loc), onBack: () => UI.showMenu(menuHandlers) }); },
  onParty: () => { UI.hideMenu(); UI.showMap({ title: "Локация для друзей", btn: "👥 Создать комнату", onPick: (loc) => hostParty(loc), onBack: () => UI.showMenu(menuHandlers) }); },
  onQuality: readQ
};
function startSolo(loc) {
  room = null;
  const h = myHello();
  begin({ room: null, cfg: { loc, seed: Math.floor(Math.random() * 1e9), players: [{ id: "me", name: h.name === "Игрок" ? "Ты" : h.name, color: COLORS[0], uid: S.uid, style: S.skin, meta: S.up, wpn: S.wpn }], me: 0 }, host: true });
}

T.init({ header: "#1a2230", bg: "#1a2230", back: "../" });
applyQuality();
requestAnimationFrame(frame);
(async () => {
  await loadSave(); readQ(); AU.applyVol();
  $("m-gems").textContent = S.gems || 0;
  const B = window.Boot || { set() {}, done() {}, fail() {} };
  B.set(0.15, "Загружаем героев, монстров и мир…");
  const mb = (b) => (b / 1048576).toFixed(1);
  await loadAll((k, g, t) => { B.set(0.15 + k * 0.8, null, t ? `${mb(g)} из ~${mb(t)} МБ` : ""); $("load").firstElementChild.style.width = (k * 100).toFixed(0) + "%"; });
  B.set(0.96, "Готовим карту…", "");
  $("load").style.display = "none";
  loadEnv(renderer, (env) => { envMap = env; scene.environment = env; });
  const inv = readInvite();
  $("menu").classList.remove("hidden");
  if (inv) { $("menu").classList.add("hidden"); buildMenuScene(); B.done(); joinParty(inv); return; }
  buildMenuScene(); UI.showMenu(menuHandlers); AU.music("menu"); B.done();
})().catch((e) => { console.error(e); window.Boot && Boot.fail(); const l = $("m-camp-sub"); if (l) l.textContent = "Не удалось загрузить игру 😕 Проверь интернет"; });

// отладка и автотесты
window.__game = {
  get G() { return G; }, get phase() { return phase; }, get me() { return me; }, get hosting() { return hosting; }, get ep() { return ep; }, act, doAct, startWave, spawnEnemy, waveCleared, migrate, startSolo, hostParty, joinParty, useItem, openGift,
  give(c, w, s) { const p = P(); p.wallet.c += c || 0; p.wallet.w += w || 0; p.wallet.s += s || 0; dirtyFull = true; },
  killAll() { for (const e of [...G.enemies.values()]) killEnemy(e, me); G.queue = []; },
  setQuality(q) { S.set.q = String(q); readQ(); }, openPanel: (k) => openPanel(k, nearHouse()), tp(x, z) { const p = P(); p.x = x; p.z = z; if (hosting) p.seq++; },
  sim(sec, cb) { const dt = 1 / 30; for (let i = 0; i < sec * 30 && phase === "play"; i++) { if (cb) cb(i); if (isHost()) hostStep(dt); localStep(dt); remoteFire(dt); updateShots(dt); if (i % 6 === 0) { updateViews(dt * 6); fx.update(dt * 6); } } hud(); return { w: G.wave, ph: G.ph, en: G.enemies.size, q: G.queue.length, over: G.over, phase }; },
  D, poolTarget, get renderer() { return renderer; }, get shots() { return shots; }, get room() { return room; }, scene, camera, get flows() { return flows; }, get WD() { return WD; }
};
