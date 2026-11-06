/* «Чёрная дыра» (в духе hole.io). До 6 игроков, боты, онлайн-комнаты, вдвоём на одном телефоне.
   Каждый сам ведёт свою дыру (без задержки на своём телефоне) и сам «глотает» предметы — хозяин комнаты
   проверяет заявки, начисляет рост, ведёт ботов и решает, кто кого проглотил. Город одинаковый у всех (seed). */
import * as THREE from "three";
import { TYPES, TIERS, M, genCity, paintGround, buildGeometries, loopPos, circPos } from "./city.js";

const T = window.TG, $ = (id) => document.getElementById(id);
const St = window.Stats || { event() {}, gameStart() {}, gameEnd() {}, state() {} };
const F = window.Foley || { swallow() {}, land() {}, rattle() {}, gulp() {}, tap() {}, knock() {}, go() {}, win() {}, lose() {}, ambient() {}, toggle() { return false; }, on: false };
const EN = !!(window.I18N && I18N.lang === "en"), MU = EN ? " m" : " м";
const DURATION = 120, R0 = 0.8, A0 = Math.PI * R0 * R0, RESP = 3, SHIELD = 2.5, MAXH = 8;
let GROW = 0.28;
const rad = (A) => Math.sqrt(A / Math.PI);
const speedOf = (R) => 6.0 + R * 0.95;
const depthOf = (R) => 3 + R * 1.7;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const fmt = (R) => (2 * R).toFixed(1) + MU;

// ---------- рендер ----------
const canvas = $("gl"), ov = $("ov"), g2 = ov.getContext("2d");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0xbfe8ff);
let W = 0, H = 0, DPR = 1, ODPR = 1;
// телефоны начинают с разрешения ≤1.5 и тенями 2048; если кадр долгий — ниже (см. frame)
let quality = window.matchMedia && matchMedia("(pointer: coarse)").matches ? 2 : 3;
const SKY = new THREE.Color(0xbfe8ff);
const scene = new THREE.Scene(); scene.background = SKY; scene.fog = new THREE.Fog(SKY, 60, 160);
const hemi = new THREE.HemisphereLight(0xe8f6ff, 0xc9b48f, 1.55); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
sun.castShadow = true; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(-14, 30, -9);
function applyQuality() {
  const dev = Math.min(devicePixelRatio || 1, 2);
  DPR = quality >= 3 ? dev : quality === 2 ? Math.min(dev, 1.5) : quality === 1 ? Math.min(dev, 1.25) : 1;
  if (views.length > 1) DPR = Math.min(DPR, 1.25);
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  const ms = quality >= 2 ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  renderer.shadowMap.enabled = quality >= 1; sun.castShadow = quality >= 1;
}
let SAT = 0, SAB = 0;
function resize() {
  const sa = $("sa"); if (sa) { const cs = getComputedStyle(sa); SAT = parseFloat(cs.paddingTop) || 0; SAB = parseFloat(cs.paddingBottom) || 0; }
  W = innerWidth; H = innerHeight; ODPR = Math.min(devicePixelRatio || 1, 2);
  ov.width = W * ODPR; ov.height = H * ODPR;
  layoutViews(); applyQuality();
}

// ---------- шейдеры: дыры вырезают землю, предметы темнеют в глубине ----------
const holeU = { value: Array.from({ length: MAXH }, () => new THREE.Vector4(0, 0, 0, 0)) };
function patchObj(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float tint;\nvarying float vWY;")
      .replace("#include <color_vertex>", `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor *= mix( vec3( 1.0 ), instanceColor.rgb, tint );
#endif`)
      .replace("#include <project_vertex>", `#include <project_vertex>
#ifdef USE_INSTANCING
  vWY = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).y;
#else
  vWY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;
#endif`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vWY;")
      .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  gl_FragColor.rgb *= clamp( 1.0 + vWY * 0.17, 0.05, 1.0 );");
  };
}
function patchGround(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHoles = holeU;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vWXZ;")
      .replace("#include <project_vertex>", "#include <project_vertex>\n  vWXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec2 vWXZ;
uniform vec4 uHoles[${MAXH}];`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  float hOcc = 1.0;
  for ( int i = 0; i < ${MAXH}; i ++ ) {
    vec4 h = uHoles[ i ];
    if ( h.z <= 0.0 ) continue;
    float d = distance( vWXZ, h.xy );
    if ( d < h.z ) discard;
    hOcc = min( hOcc, mix( 0.42, 1.0, smoothstep( h.z, h.z + 0.22 + h.z * 0.28, d ) ) );
  }`)
      .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  gl_FragColor.rgb *= hOcc;");
  };
}

// ---------- земля ----------
const groundMat = new THREE.MeshLambertMaterial({ color: 0xffffff }); patchGround(groundMat);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(M, M), groundMat);
ground.rotation.x = -Math.PI / 2; ground.position.set(M / 2, 0, M / 2); ground.receiveShadow = true; scene.add(ground);
const outerMat = new THREE.MeshLambertMaterial({ color: 0x8fd06c }); patchGround(outerMat);
for (const [x, z, w, d] of [[M / 2, -100, M + 400, 200], [M / 2, M + 100, M + 400, 200], [-100, M / 2, 200, M], [M + 100, M / 2, 200, M]]) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), outerMat); p.rotation.x = -Math.PI / 2; p.position.set(x, 0, z); p.receiveShadow = true; scene.add(p);
}
let groundTex = null;

// ---------- предметы ----------
const geos = buildGeometries();
TYPES.forEach((t, i) => { geos[i].computeBoundingBox(); geos[i].computeBoundingSphere(); t.h = geos[i].boundingBox.max.y; });
const objMat = new THREE.MeshLambertMaterial({ vertexColors: true }); patchObj(objMat);
let tiles = [], pools = [], dirty = new Set(), O = [], movers = [], falling = [], near = new Map(), blocks = [];
const GC = 6, G0 = -40, GN = Math.ceil((M + 80) / GC);
let grid = [];
const cell = (v) => clamp(Math.floor((v - G0) / GC), 0, GN - 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _pos = { x: 0, z: 0, ry: 0 }, _col = new THREE.Color();
// Предметы разложены по плиткам 40×40 м (у каждой плитки свой InstancedMesh на тип) — то, что вне кадра, не рисуется.
// Падающие предметы переезжают в отдельный небольшой пул на тип (он рисуется всегда): они едут вместе с дырой через границы плиток.
const TS = 40, T0 = -20, TN = 5, POOL = 40;
const tileOf = (x, z) => clamp(Math.floor((x - T0) / TS), 0, TN - 1) + TN * clamp(Math.floor((z - T0) / TS), 0, TN - 1);
function writeObj(o, y, ax, az, ang, yaw) {
  _q.setFromAxisAngle(UP, o.ry + (yaw || 0));
  if (ang) { _ax.set(ax, 0, az).normalize(); _q2.setFromAxisAngle(_ax, ang); _q.premultiply(_q2); }
  _p.set(o.x, y, o.z); _s.setScalar(o.sc);
  _m.compose(_p, _q, _s);
  const m = o.slot >= 0 ? pools[o.t].mesh : o.mesh; m.setMatrixAt(o.slot >= 0 ? o.slot : o.k, _m); dirty.add(m);
}
function hideObj(o) { o.mesh.setMatrixAt(o.k, ZERO); dirty.add(o.mesh); }
function toPool(o) {   // предмет начал падать: прячем в плитке, рисуем из пула
  const p = pools[o.t]; if (!p.free.length) return;
  o.slot = p.free.pop(); hideObj(o); p.used.add(o.slot); poolCount(p);
  p.mesh.setColorAt(o.slot, _col.set(o.col)); p.mesh.instanceColor.needsUpdate = true;
}
function fromPool(o) { if (o.slot < 0) return; const p = pools[o.t]; p.mesh.setMatrixAt(o.slot, ZERO); dirty.add(p.mesh); p.free.push(o.slot); p.free.sort((a, b) => b - a); p.used.delete(o.slot); o.slot = -1; poolCount(p); }
function poolCount(p) { let mx = -1; p.used.forEach((k) => { if (k > mx) mx = k; }); p.mesh.count = mx + 1; p.mesh.visible = mx >= 0; }
function buildWorld(seed) {
  for (const m of tiles) { scene.remove(m); m.dispose(); }
  for (const p of pools) { scene.remove(p.mesh); p.mesh.dispose(); }
  const city = genCity(seed); blocks = city.blocks;
  const byKey = new Map();
  O = city.objs.map((o, id) => {
    const cx = o.mv ? (o.mv.k === "loop" ? (o.mv.r[0] + o.mv.r[2]) / 2 : o.mv.cx) : o.x, cz = o.mv ? (o.mv.k === "loop" ? (o.mv.r[1] + o.mv.r[3]) / 2 : o.mv.cz) : o.z;
    const ext = geos[o.t].boundingSphere.radius * o.sc + (o.mv ? (o.mv.k === "loop" ? Math.hypot(o.mv.r[2] - o.mv.r[0], o.mv.r[3] - o.mv.r[1]) / 2 : o.mv.rr) : 0) + 1;
    const key = o.t + ":" + tileOf(cx, cz);
    let L = byKey.get(key); if (!L) byKey.set(key, (L = { t: o.t, list: [] }));
    L.list.push([id, cx, cz, ext]);
    return Object.assign(o, { id, k: 0, st: 0, f: null, y: 0, slot: -1, mesh: null });
  });
  tiles = [];
  for (const { t, list } of byKey.values()) {
    const m = new THREE.InstancedMesh(geos[t], objMat, list.length);
    m.castShadow = true; m.receiveShadow = true;
    let sx = 0, sz = 0; for (const e of list) { sx += e[1]; sz += e[2]; } sx /= list.length; sz /= list.length;
    let r = 0; for (const e of list) r = Math.max(r, Math.hypot(e[1] - sx, e[2] - sz) + e[3]);
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(sx, TYPES[t].h * 0.5, sz), r + TYPES[t].h * 0.6);
    list.forEach((e, k) => { const o = O[e[0]]; o.mesh = m; o.k = k; m.setColorAt(k, _col.set(o.col)); });
    m.instanceColor.needsUpdate = true;
    scene.add(m); tiles.push(m);
  }
  pools = TYPES.map((t, i) => {
    const m = new THREE.InstancedMesh(geos[i], objMat, POOL); m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
    for (let k = 0; k < POOL; k++) { m.setMatrixAt(k, ZERO); m.setColorAt(k, _col.set(0xffffff)); }
    m.count = 0; m.visible = false;
    scene.add(m); return { mesh: m, used: new Set(), free: Array.from({ length: POOL }, (_, k) => POOL - 1 - k) };
  });
  movers = []; falling = []; near = new Map(); grid = Array.from({ length: GN * GN }, () => []);
  for (const o of O) {
    if (o.mv) { movers.push(o); moverPos(o, 0); } else grid[cell(o.x) + GN * cell(o.z)].push(o);
    writeObj(o, 0);
  }
  if (groundTex) groundTex.dispose();
  const cv = paintGround(blocks, quality >= 2 ? 2048 : 1024);   // слабым устройствам — текстура поменьше
  groundTex = new THREE.CanvasTexture(cv); groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  groundMat.map = groundTex; groundMat.needsUpdate = true;
}
function moverPos(o, t) {
  const p = o.mv.k === "loop" ? loopPos(o.mv, t, _pos) : circPos(o.mv, t, _pos);
  o.x = p.x; o.z = p.z; o.ry = p.ry;
}
function query(x, z, r, fn) {
  const a = cell(x - r), b = cell(x + r), c0 = cell(z - r), c1 = cell(z + r);
  for (let j = c0; j <= c1; j++) for (let i = a; i <= b; i++) { const L = grid[i + GN * j]; for (let k = 0; k < L.length; k++) if (L[k].st === 0) fn(L[k]); }
  for (let k = 0; k < movers.length; k++) { const o = movers[k]; if (o.st === 0 && Math.abs(o.x - x) < r && Math.abs(o.z - z) < r) fn(o); }
}

// ---------- обломки: кубики, которые разлетаются от крупных предметов и сыплются в дыру ----------
const DEB = 180;
const debGeo = (() => { const g = new THREE.BoxGeometry(1, 1, 1); const n = g.attributes.position.count; g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); g.setAttribute("tint", new THREE.BufferAttribute(new Float32Array(n).fill(1), 1)); return g; })();
const debMesh = new THREE.InstancedMesh(debGeo, objMat, DEB); debMesh.frustumCulled = false; debMesh.castShadow = true; debMesh.count = 0;
for (let k = 0; k < DEB; k++) debMesh.setColorAt(k, _col.set(0xffffff));
scene.add(debMesh);
let debris = [];
const DEB_COL = { leaf: [0x4ade80, 0x22c55e, 0x8b5a3c], stone: [0xe8e2d6, 0xc9c1b0, 0xb84a3c], wood: [0xc2703d, 0xfff8ec], metal: [0xd1d5db, 0x9aa3b5, 0xbfe6fa] };
function spawnDebris(o, h, s) {
  const pal = DEB_COL[TYPES[o.t].mat] || DEB_COL.stone, n = Math.min(22, Math.round(3 + s * 4));
  for (let k = 0; k < n && debris.length < DEB; k++) {
    const a = Math.random() * 6.28, sp = 1.5 + Math.random() * 2.5 * Math.min(2, s), up = 3 + Math.random() * 4 + s;
    const c = k % 3 === 0 ? o.col : pal[k % pal.length];
    debris.push({ h, x: o.x + Math.cos(a) * s * 0.4, y: 0.3 + Math.random() * TYPES[o.t].h * o.sc * 0.6, z: o.z + Math.sin(a) * s * 0.4, vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp, rx: Math.random() * 6, ry: Math.random() * 6, rv: (Math.random() - 0.5) * 14, sz: 0.12 + Math.random() * 0.12 * Math.min(3, s), c: _col.set(c).getHex(), life: 2.2 });
  }
}
const _e = new THREE.Euler();
function stepDebris(dt) {
  for (let k = debris.length - 1; k >= 0; k--) {
    const d = debris[k], h = d.h;
    d.life -= dt; d.vy -= 20 * dt;
    // тянет к дыре
    const dx = h.x - d.x, dz = h.z - d.z, dist = Math.hypot(dx, dz) || 1;
    d.vx += dx / dist * 6 * dt; d.vz += dz / dist * 6 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.rv * dt; d.ry += d.rv * 0.7 * dt;
    if (d.y < 0 && dist > h.R * 0.95) { d.y = 0; d.vy = Math.abs(d.vy) * 0.3; d.vx *= 0.6; d.vz *= 0.6; }   // упал мимо — подпрыгнул
    if (d.y < -depthOf(h.R) * 0.8 || d.life <= 0) debris.splice(k, 1);
  }
  for (let k = 0; k < debris.length; k++) {
    const d = debris[k], sc = d.sz * Math.min(1, d.life * 2);
    _q.setFromEuler(_e.set(d.rx, d.ry, 0)); _p.set(d.x, d.y, d.z); _s.setScalar(sc); _m.compose(_p, _q, _s);
    debMesh.setMatrixAt(k, _m); debMesh.setColorAt(k, _col.setHex(d.c));
  }
  debMesh.count = debris.length;
  if (debris.length) { debMesh.instanceMatrix.needsUpdate = true; debMesh.instanceColor.needsUpdate = true; }
}

// ---------- дыры ----------
const holeGeoWall = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 48, 6, true); g.translate(0, -0.5, 0); return g; })();
const holeGeoBottom = (() => { const g = new THREE.CircleGeometry(1, 48); g.rotateX(-Math.PI / 2); return g; })();
const holeGeoRim = (() => { const g = new THREE.RingGeometry(1, 1.09, 64); g.rotateX(-Math.PI / 2); return g; })();
const holeGeoGlow = (() => { const g = new THREE.RingGeometry(1.09, 1.32, 64); g.rotateX(-Math.PI / 2); return g; })();
function makeHoleMesh(color) {
  const c = new THREE.Color(color), grp = new THREE.Group();
  const wg = holeGeoWall.clone(), pos = wg.attributes.position, cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), k = Math.pow(1 + y, 2.2);   // 1 у края → 0 на дне
    const lip = y > -0.05 ? 0.25 : 0;
    cols[i * 3] = c.r * (0.3 * k + lip) + 0.02 * k; cols[i * 3 + 1] = c.g * (0.3 * k + lip) + 0.02 * k; cols[i * 3 + 2] = c.b * (0.3 * k + lip) + 0.03 * k;
  }
  wg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const wall = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  const bottom = new THREE.Mesh(holeGeoBottom, new THREE.MeshBasicMaterial({ color: 0x020205, fog: false }));
  const rim = new THREE.Mesh(holeGeoRim, new THREE.MeshBasicMaterial({ color: c, fog: false }));
  const glow = new THREE.Mesh(holeGeoGlow, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.28, depthWrite: false, fog: false }));
  rim.position.y = 0.03; glow.position.y = 0.025; rim.renderOrder = 2; glow.renderOrder = 1;
  grp.add(wall, bottom, rim, glow);
  scene.add(grp);
  return { grp, wall, bottom, rim, glow };
}
let HL = [];   // дыры
function makeHole(i, x, z) { return { x, z, vx: 0, vz: 0, A: A0, Al: A0, gainT: 0, R: R0, alive: true, resp: 0, sh: SHIELD, n: 0, best: A0, kills: 0, pulse: 0, tx: x, tz: z, die: 0, combo: 0, comboT: 0, tier: 0, mesh: makeHoleMesh(cfg.players[i].color) }; }
function spawnSpots(n, seed) {
  const pts = [], a0 = (seed % 628) / 100;
  for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI * 2, x = M / 2 + Math.cos(a) * M * 0.3, z = M / 2 + Math.sin(a) * M * 0.3; pts.push(snapRoad(x, z)); }
  return pts;
}
function snapRoad(x, z) { const s = (v) => Math.round((v - 4) / 30) * 30 + 4; const sx = s(x), sz = s(z); return Math.abs(sx - x) < Math.abs(sz - z) ? [sx, clamp(z, 4, M - 4)] : [clamp(x, 4, M - 4), sz]; }
function respawnSpot(i) {
  let best = [M / 2, M / 2], bd = -1;
  for (let k = 0; k < 24; k++) {
    const p = snapRoad(10 + Math.random() * (M - 20), 10 + Math.random() * (M - 20));
    let d = 1e9; HL.forEach((h, j) => { if (j !== i && h.alive) d = Math.min(d, Math.hypot(h.x - p[0], h.z - p[1]) - h.R * 2); });
    if (d > bd) { bd = d; best = p; }
  }
  return best;
}

// ---------- состояние партии ----------
let room = null, cfg = null, phase = "boot", ended = false, gt = 0, countT = 0, views = [], local = false, demoT = 0;
let recentEats = [], claims = [], claimT = 0, snapT = 0, meT = 0, fullT = 0, endInfo = null;
const isHost = () => !room || room.isHost;
const send = (t, d) => { if (room) room.send(t, d); };
const col = (i) => cfg.players[i].color;
const pname = (i) => (!local && phase !== "demo" && i === cfg.me ? "Ты" : cfg.players[i].name);
const localHole = (i) => views.some((v) => v.pi === i);
const aiHole = (i) => (phase === "demo") || (isHost() && cfg.players[i].bot) || (window.__autoBot && localHole(i));
const canTrigger = (i) => isHost() ? (!room || cfg.players[i].bot || i === cfg.me) : i === cfg.me;

function startFall(o, hi, fromNet) {
  const h = HL[hi], t = TYPES[o.t];
  o.st = 1; near.delete(o);
  let rx = o.x - h.x, rz = o.z - h.z; const d = Math.hypot(rx, rz) || 0.01;
  o.f = { h: hi, rx, rz, vx: 0, vz: 0, vy: 0, ang: 0, w: 0, ax: -rz / d, az: rx / d, maxAng: 1.2 + Math.random() * 0.9, spin: 0, spinV: (Math.random() - 0.5) * 3 / Math.max(0.5, t.s), t: 0, y: o.y || 0 };
  if (d < 0.05) { const a = Math.random() * 6.28; o.f.ax = Math.cos(a); o.f.az = Math.sin(a); }
  falling.push(o); toPool(o);
  if (isHost()) recentEats.push([o.id, hi, gt]);
  else if (hi === cfg.me && !fromNet) claims.push(o.id);
  // ощущения
  const s = t.s * o.sc, vol = phase === "demo" ? 0 : earVol(h.x, h.z);
  F.swallow(t.mat, s, vol * (0.55 + Math.min(0.45, s * 0.2)));
  h.pulse = Math.min(1.2, h.pulse + 0.15 + s * 0.12);
  if (s >= 0.85 && earVol(h.x, h.z) > 0.05) spawnDebris(o, h, s);
  for (const v of views) if (v.pi === hi) {
    if (s > 1.1) v.shake = Math.min(1.6, v.shake + s * 0.16);
    h.combo++; h.comboT = 1.1;
    if ([8, 15, 25, 40, 60, 80, 100, 150, 200].includes(h.combo)) msg(v, `Комбо ×${h.combo}!`, 1000, "#ffd34d");
  }
  if (localHole(hi) && views.length === 1) hapticFor(s);
}
let hapT = 0;
function hapticFor(s) { const now = performance.now(); if (now - hapT < (s > 1.2 ? 40 : 90)) return; hapT = now; T.haptic("impact", s > 2.2 ? "heavy" : s > 1 ? "medium" : "light"); }
function earVol(x, z) {
  let v = 0;
  for (const w of views) { const d = Math.hypot(w.tx - x, w.tz - z); v = Math.max(v, clamp(1.15 - d / (w.vw * 0.9), 0, 1)); }
  return v;
}
function stepFalls(dt) {
  for (let k = falling.length - 1; k >= 0; k--) {
    const o = falling[k], f = o.f, h = HL[f.h], t = TYPES[o.t], s = t.s * o.sc;
    const R = Math.max(h.R, 0.35);
    f.t += dt;
    const d = Math.hypot(f.rx, f.rz) || 1e-4, ux = -f.rx / d, uz = -f.rz / d;
    const over = d < R - s * 0.15 || f.y < -0.05;
    const pull = over ? 7 : 18;
    f.vx += ux * pull * dt; f.vz += uz * pull * dt;
    const damp = Math.max(0, 1 - dt * (over ? 2.5 : 1.5)); f.vx *= damp; f.vz *= damp;
    if (over) f.vy -= (f.y > -0.3 ? 9 : 17) * dt;   // сначала сползает и кренится, потом летит вниз
    f.rx += f.vx * dt; f.rz += f.vz * dt; f.y += f.vy * dt;
    if (f.y < -0.05) {   // внутри — не дальше стенок
      const d2 = Math.hypot(f.rx, f.rz), lim = Math.max(0.02, R - Math.min(s, R) * 0.55);
      if (d2 > lim) { f.rx *= lim / d2; f.rz *= lim / d2; f.vx *= 0.5; f.vz *= 0.5; }
    }
    f.w = Math.min(f.w + dt * (7 + 2.5 / Math.max(0.4, s)), 7); f.ang = Math.min(f.ang + f.w * dt, f.maxAng);
    f.spin += f.spinV * dt;
    o.x = h.x + f.rx; o.z = h.z + f.rz; o.y = f.y;
    const top = f.y + t.h * o.sc * Math.max(0.25, Math.cos(f.ang));
    if (top < -0.6 || f.y < -depthOf(R) - 1 || f.t > 4.5) { finishFall(o, k); continue; }
    writeObj(o, f.y, f.ax, f.az, f.ang, f.spin);
  }
}
function finishFall(o, k) {
  falling.splice(k, 1); o.st = 2; fromPool(o); hideObj(o);
  const hi = o.f.h, h = HL[hi], t = TYPES[o.t], v = t.v * o.sc * o.sc * GROW;
  if (isHost()) { if (h.alive) { h.A += v; h.n++; } }
  else if (hi === cfg.me && h.alive) { h.Al += v; h.gainT = performance.now(); h.n++; }
  if (phase !== "demo") F.land(t.s * o.sc, earVol(h.x, h.z) * 0.8);
  for (const w of views) if (w.pi === hi) floatText(w, h, Math.max(1, Math.round(v * 30)), t.s * o.sc >= 1.2 ? t.emo : "", t.s * o.sc);
}
function eatHole(vi, by) {   // хозяин
  const d = [vi, by, Math.round(HL[vi].A * 100)];
  send("ko", d); onKo(d);
}
function onKo(d) {
  const [vi, by] = d, v = HL[vi], e = HL[by];
  if (!v.alive) return;
  v.alive = false; v.resp = RESP; v.die = 1;
  const gain = (d[2] / 100) * 0.5;
  if (isHost()) { e.A += gain; e.kills++; v.A = Math.max(A0, v.A * 0.6); }   // проглоченный теряет 40% и возрождается
  if (!isHost() && by === cfg.me) { e.Al += gain; e.gainT = performance.now(); }
  e.pulse = 1.4;
  if (phase !== "demo") F.gulp(Math.max(0.4, earVol(v.x, v.z)));
  for (const w of views) {
    if (w.pi === vi) { msg(w, `😵 Тебя проглотил ${cfg.players[by].name}`, 2200, "#ff6b6b"); w.shake = 1.6; }
    else if (w.pi === by) { msg(w, `🕳️ Проглотил ${cfg.players[vi].name}!`, 1800, "#ffd34d"); w.shake = 1.2; floatText(w, e, Math.round(gain * 30), "😵", 3); }
  }
  if (localHole(vi) && views.length === 1) T.haptic("notify", "error");
  if (localHole(by) && views.length === 1) T.haptic("notify", "success");
}
function respawn(i) {   // хозяин
  const [x, z] = respawnSpot(i), h = HL[i];
  const d = [i, Math.round(x), Math.round(z), Math.round(h.A * 100)]; send("rs", d); onRs(d);
}
function onRs(d) {
  const h = HL[d[0]]; h.x = h.tx = d[1]; h.z = h.tz = d[2]; h.vx = h.vz = 0; h.A = h.Al = d[3] / 100; h.R = 0.2; h.alive = true; h.sh = SHIELD; h.die = 0;
  for (const w of views) if (w.pi === d[0]) { w.tx = h.x; w.tz = h.z; }
}

// ---------- боты (и автопилот для тестов) ----------
const BOT = {};
const _lead = { x: 0, z: 0, ry: 0 };
function botThink(i, dt) {
  const h = HL[i], b = BOT[i] || (BOT[i] = { t: 0, tx: h.x, tz: h.z, obj: null, hole: -1, sight: 12 + (i % 3) * 4, lazy: 0.26 + (i % 4) * 0.08, skill: 0.86 + ((i * 7) % 5) * 0.03, wander: [Math.random() * M, Math.random() * M] });
  b.t -= dt;
  const R = h.R;
  if (b.t <= 0) {
    b.t = b.lazy + Math.random() * 0.15; b.obj = null; b.hole = -1;
    let fx = 0, fz = 0, danger = false;
    HL.forEach((o, j) => {
      if (j === i || !o.alive) return;
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      if (o.R > R * 1.12 && d < o.R + 7 && h.sh <= 0) { fx += (h.x - o.x) / (d + 0.1); fz += (h.z - o.z) / (d + 0.1); danger = true; }
    });
    if (danger) { b.tx = h.x + fx * 20; b.tz = h.z + fz * 20; }
    else {
      let bs = 0;
      HL.forEach((o, j) => { if (j === i || !o.alive || o.sh > 0) return; const d = Math.hypot(o.x - h.x, o.z - h.z); if (R > o.R * (cfg.players[j].bot ? 1.22 : 1.35) && d < 10 + R * 2 && gt > 15) { const sc = (o.A * 0.5) / (d + 4) * 1.4; if (sc > bs) { bs = sc; b.hole = j; } } });
      query(h.x, h.z, b.sight + R, (o) => {
        const t = TYPES[o.t], s = t.s * o.sc; if (s >= R * 0.95) return;
        const ex = Math.max(0, 1 - o.x, o.x - (M - 1)), ez = Math.max(0, 1 - o.z, o.z - (M - 1));
        if ((ex || ez) && Math.hypot(ex, ez) > R - s * 0.25 - 0.2) return;   // за краем карты — не дотянуться
        const d = Math.hypot(o.x - h.x, o.z - h.z), sc = (t.v * o.sc * o.sc + 0.05) / (d + 2.5) * (o.mv && o.mv.car ? 0.8 : 1);
        if (sc > bs) { bs = sc; b.obj = o; b.hole = -1; }
      });
      if (!b.obj && b.hole < 0) { if (Math.hypot(b.wander[0] - h.x, b.wander[1] - h.z) < 6) b.wander = [10 + Math.random() * (M - 20), 10 + Math.random() * (M - 20)]; b.tx = b.wander[0]; b.tz = b.wander[1]; }
    }
  }
  // цель отслеживаем каждый кадр, к движущимся — с упреждением
  let moving = false;
  if (b.obj) {
    const o = b.obj;
    if (o.st !== 0) { b.obj = null; b.t = 0; }
    else if (o.mv) { const d = Math.hypot(o.x - h.x, o.z - h.z), p = o.mv.k === "loop" ? loopPos(o.mv, gt + Math.min(1.2, d / speedOf(R)), _lead) : circPos(o.mv, gt + 0.4, _lead); b.tx = p.x; b.tz = p.z; moving = true; }
    else { b.tx = o.x; b.tz = o.z; }
  } else if (b.hole >= 0) { const o = HL[b.hole]; if (!o.alive) { b.hole = -1; b.t = 0; } else { b.tx = o.x + o.vx * 0.5; b.tz = o.z + o.vz * 0.5; moving = true; } }
  const dx = b.tx - h.x, dz = b.tz - h.z, d = Math.hypot(dx, dz);
  if (d < 0.2) return [0, 0];
  const k = moving ? 1 : Math.min(1, d / 1.5);
  return [dx / d * k, dz / d * k];
}

// ---------- ввод ----------
const joys = {};   // по номеру вида
const keys = {};
function viewAt(x, y) { for (let k = 0; k < views.length; k++) { const v = views[k]; if (x >= v.x && x < v.x + v.w && y >= v.y && y < v.y + v.h) return k; } return 0; }
canvas.addEventListener("pointerdown", (e) => {
  if (!(phase === "play" || phase === "count")) return;
  const vi = viewAt(e.clientX, e.clientY);
  if (joys[vi]) return;
  joys[vi] = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY };
});
addEventListener("pointermove", (e) => {
  for (const k in joys) { const j = joys[k]; if (j.id !== e.pointerId) continue; j.cx = e.clientX; j.cy = e.clientY; const dx = j.cx - j.x, dy = j.cy - j.y, d = Math.hypot(dx, dy), R = 64; if (d > R) { j.x += dx / d * (d - R); j.y += dy / d * (d - R); } }
});
const up = (e) => { for (const k in joys) if (joys[k].id === e.pointerId) delete joys[k]; };
addEventListener("pointerup", up); addEventListener("pointercancel", up);
addEventListener("keydown", (e) => { keys[e.code] = 1; }); addEventListener("keyup", (e) => { keys[e.code] = 0; });
function inputFor(vi) {
  const v = views[vi], j = joys[vi];
  let ix = 0, iz = 0;
  if (j) { const dx = j.cx - j.x, dy = j.cy - j.y, d = Math.hypot(dx, dy); if (d > 6) { const k = Math.min(1, d / 40); ix = dx / d * k; iz = dy / d * k; } }
  if (!ix && !iz) {
    const kk = views.length > 1 ? (vi === 0 ? ["KeyD", "KeyA", "KeyS", "KeyW"] : ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"]) : null;
    const R1 = kk ? keys[kk[0]] : keys.KeyD || keys.ArrowRight, L1 = kk ? keys[kk[1]] : keys.KeyA || keys.ArrowLeft, D1 = kk ? keys[kk[2]] : keys.KeyS || keys.ArrowDown, U1 = kk ? keys[kk[3]] : keys.KeyW || keys.ArrowUp;
    ix = (R1 ? 1 : 0) - (L1 ? 1 : 0); iz = (D1 ? 1 : 0) - (U1 ? 1 : 0);
    const d = Math.hypot(ix, iz); if (d) { ix /= d; iz /= d; }
  }
  if (!ix && !iz && window.__autoAim != null && vi === 0) { ix = Math.cos(window.__autoAim); iz = Math.sin(window.__autoAim); }
  if (v.rot) { ix = -ix; iz = -iz; }
  return [ix, iz];
}

// ---------- виды (экран целиком или пополам) ----------
function layoutViews() {
  if (views.length === 1) Object.assign(views[0], { x: 0, y: 0, w: W, h: H });
  else if (views.length === 2) { Object.assign(views[0], { x: 0, y: 0, w: W, h: Math.floor(H / 2) }); Object.assign(views[1], { x: 0, y: Math.floor(H / 2), w: W, h: H - Math.floor(H / 2) }); }
  for (const v of views) { v.cam.aspect = v.w / v.h; v.cam.updateProjectionMatrix(); }
}
function makeView(pi, rot) { return { pi, rot, cam: new THREE.PerspectiveCamera(42, 1, 0.5, 600), x: 0, y: 0, w: W, h: H, tx: M / 2, tz: M / 2, vw: 20, shake: 0, msgs: [], floats: [], orbit: 0 }; }
const TILT = 58 * Math.PI / 180;
function updateCam(v, dt) {
  let h = HL[v.pi];
  if (phase === "demo") { let bi = 0; HL.forEach((q, i) => { if (q.alive && q.A > HL[bi].A) bi = i; }); if (bi !== v.pi && HL[bi].A > HL[v.pi].A * 1.3) v.pi = bi; h = HL[v.pi]; }
  const R = h ? h.R : 1;
  let want = 6 + R * 6.6;
  if (phase === "end" || phase === "demo") want *= 1.25;
  v.vw += (want - v.vw) * Math.min(1, dt * 1.6);
  if (h && (h.alive || phase !== "play")) { const k = Math.min(1, dt * 7); v.tx += (h.x + h.vx * 0.12 - v.tx) * k; v.tz += (h.z + h.vz * 0.12 - v.tz) * k; }
  const a = v.w / v.h, hh = Math.atan(Math.tan(THREE.MathUtils.degToRad(v.cam.fov / 2)) * a);
  const dist = Math.max(14, (v.vw / 2) / Math.tan(Math.min(hh, THREE.MathUtils.degToRad(v.cam.fov / 2))));   // по узкой стороне экрана
  v.dist = dist;
  v.shake = Math.max(0, v.shake - dt * 2.8);
  const sk = v.shake * v.shake * (0.5 + R * 0.15), sx = (Math.random() - 0.5) * sk, sz = (Math.random() - 0.5) * sk;
  if (phase === "end") v.orbit += dt * 0.12;
  const ox = Math.sin(v.orbit) * Math.cos(TILT) * dist, oz = Math.cos(v.orbit) * Math.cos(TILT) * dist;
  const dz = phase === "demo" ? dist * 0.3 : 0;   // в меню дыра — в верхней части экрана, над карточкой
  v.cam.position.set(v.tx + ox + sx, Math.sin(TILT) * dist, v.tz + oz + sz + dz);
  v.cam.lookAt(v.tx + sx * 0.5, 0, v.tz + sz * 0.5 - dist * 0.04 + dz);
  if (v.rot) v.cam.rotateZ(Math.PI);
  v.cam.far = dist * 3.5; v.cam.updateProjectionMatrix();
}
function aimSun(v) {
  sun.target.position.set(v.tx, 0, v.tz); sun.position.copy(sun.target.position).add(SUN_OFF);
  const S = v.vw * (v.w > v.h ? 1.5 : 1.9) + 6, cam = sun.shadow.camera;
  if (cam.right !== S) { cam.left = -S; cam.right = S; cam.top = S; cam.bottom = -S; cam.near = 1; cam.far = 120; cam.updateProjectionMatrix(); }
  scene.fog.near = v.dist * 1.05; scene.fog.far = v.dist * 2.8;
}

// ---------- сообщения и всплывающие числа (на overlay-канвасе) ----------
function msg(v, text, ms, color) { if (!v) { views.forEach((w) => msg(w, text, ms, color)); return; } v.msgs = [{ text, t: 0, dur: (ms || 1400) / 1000, color: color || "#fff" }]; }
function floatText(v, h, n, emo, s) {
  const L = v.floats[v.floats.length - 1];
  if (!emo && L && !L.emo && L.t < 0.35) { L.n += n; L.text = "+" + L.n; L.t = Math.min(L.t, 0.12); L.s = Math.max(L.s, Math.min(1.2, L.n / 20)); return; }   // мелочь копим в одно число
  if (v.floats.length > 4) v.floats.shift();
  v.floats.push({ h, ox: (Math.random() - 0.5) * h.R * 0.8, n, text: "+" + n, emo, s, t: 0 });
}

// ---------- сеть ----------
function bitmask() {
  const n = O.length, b = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) if (O[i].st) b[i >> 3] |= 1 << (i & 7);
  let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s);
}
function snapshot(full) {
  const s = { t: +gt.toFixed(2), H: HL.map((h) => [Math.round(h.x * 20) / 20, Math.round(h.z * 20) / 20, Math.round(h.A * 100), h.alive ? 1 : 0, h.sh > 0 ? 1 : 0, h.n, Math.round(h.vx * 10) / 10, Math.round(h.vz * 10) / 10]) };
  const now = gt; recentEats = recentEats.filter((e) => now - e[2] < 1.5);
  s.E = recentEats.flatMap((e) => [e[0], e[1]]);
  if (full) s.G = bitmask();
  return s;
}
const lostAt = new Map();
function applySnap(s) {
  if (Math.abs(s.t - gt) > 0.4) gt = s.t; else gt += (s.t - gt) * 0.15;
  s.H.forEach((v, i) => {
    const h = HL[i]; if (!h) return;
    const A = v[2] / 100;
    h.n = i === cfg.me ? Math.max(h.n, v[5]) : v[5]; h.sh = v[4] ? Math.max(h.sh, 0.3) : Math.min(h.sh, 0);
    if (i === cfg.me) { h.A = A; if (A >= h.Al || performance.now() - h.gainT > 1300) h.Al = A; }
    else { h.A = A; h.tx = v[0]; h.tz = v[1]; h.vx = v[6]; h.vz = v[7]; }
    if (!v[3] && h.alive) { h.alive = false; h.die = 1; }
    if (v[3] && !h.alive && i !== cfg.me) { h.alive = true; h.x = v[0]; h.z = v[1]; h.die = 0; }
  });
  for (let k = 0; k < s.E.length; k += 2) {
    const o = O[s.E[k]], by = s.E[k + 1]; if (!o) continue;
    if (o.st === 0) startFall(o, by, true);
    else if (o.st === 1 && o.f.h !== by) { const h0 = HL[o.f.h], h1 = HL[by]; o.f.rx += h0.x - h1.x; o.f.rz += h0.z - h1.z; o.f.h = by; }
  }
  if (s.G) {
    const bin = atob(s.G), now = performance.now();
    for (let i = 0; i < O.length; i++) {
      const bit = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1, o = O[i];
      if (bit && o.st === 0) { o.st = 2; hideObj(o); }
      else if (!bit && o.st === 2) {   // у хозяина предмет на месте — значит, наша заявка не прошла: возвращаем
        if (!lostAt.has(o)) lostAt.set(o, now); else if (now - lostAt.get(o) > 2500) { lostAt.delete(o); o.st = 0; o.y = 0; o.f = null; writeObj(o, 0); }
      } else lostAt.delete(o);
    }
  }
}
function onClaim(ids, from) {
  const i = cfg.players.findIndex((p) => p.id === from); if (i < 0) return;
  const h = HL[i]; if (!h.alive) return;
  for (const id of ids) {
    const o = O[id]; if (!o || o.st !== 0) continue;
    const s = TYPES[o.t].s * o.sc;
    if (s < h.R * 1.08 + 0.05 && Math.hypot(o.x - h.x, o.z - h.z) < h.R + 3) startFall(o, i, true);
  }
}

// ---------- старт / конец ----------
function clearHoles() { for (const h of HL) { scene.remove(h.mesh.grp); h.mesh.wall.geometry.dispose(); h.mesh.grp.children.forEach((c) => c.material.dispose()); } HL = []; }
function begin(c) {
  cfg = c.cfg; room = c.room || null; local = !!c.split; ended = false; gt = 0; recentEats = []; claims = []; endInfo = null;
  for (const k in BOT) delete BOT[k];
  for (const k in joys) delete joys[k];
  buildWorld(cfg.seed); debris = [];
  clearHoles();
  const spots = spawnSpots(cfg.players.length, cfg.seed);
  HL = cfg.players.map((p, i) => makeHole(i, spots[i][0], spots[i][1]));
  views = local ? [makeView(0, true), makeView(1, false)] : c.demo ? [makeView(0, false)] : [makeView(cfg.me, false)];
  views.forEach((v) => { const h = HL[v.pi]; v.tx = h.x; v.tz = h.z; });
  resize();
  if (c.demo) { phase = "demo"; demoT = 0; return; }
  ["screen-menu", "screen-end"].forEach((s) => $(s).classList.add("hidden"));
  phase = "count"; countT = 2.4;
  $("snd").classList.add("hidden");
  if (room) {
    ["snap", "me", "cl", "ko", "rs", "end", "start", "host-left", "left"].forEach((t) => room.off(t));
    room.on("snap", (s) => { if (!isHost()) applySnap(s); });
    room.on("me", (d, from) => { if (!isHost()) return; const i = cfg.players.findIndex((p) => p.id === from); if (i >= 0 && HL[i].alive) { const h = HL[i]; h.tx = d[0]; h.tz = d[1]; h.vx = d[2]; h.vz = d[3]; } });
    room.on("cl", (d, from) => { if (isHost()) onClaim(d, from); });
    room.on("ko", (d) => { if (!isHost()) onKo(d); });
    room.on("rs", (d) => { if (!isHost()) onRs(d); });
    room.on("end", (d) => { if (!isHost()) onEnd(d); });
    room.on("start", (c2) => { if (!isHost()) begin({ room, cfg: Object.assign({}, c2, { me: c2.players.findIndex((p) => p.id === room.me.id) }) }); });
    room.on("host-left", () => { if (phase === "play") msg(null, "Хозяин вышел 😕", 3000); });
    room.on("left", (id) => { const p = cfg.players.find((q) => q.id === id); if (p && !p.bot) { p.bot = true; msg(null, `${p.name} вышел — играет бот`, 2000); } });
  }
  St.gameStart({ players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, mode: local ? "local" : room ? "online" : "bots" });
}
function startDemo() { begin({ demo: true, cfg: { mode: "demo", seed: Math.floor(Math.random() * 1e9), players: Array.from({ length: 5 }, (_, i) => ({ id: "d" + i, name: "🤖 Бот " + (i + 1), bot: true, color: (window.Party ? Party.COLORS : ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7"])[i] })), me: 0 } }); }

function finish() { if (ended || !isHost()) return; const d = { A: HL.map((h) => Math.round((h.alive ? h.A : h.A) * 100)), N: HL.map((h) => h.n), K: HL.map((h) => h.kills) }; send("end", d); onEnd(d); }
function onEnd(d) {
  if (ended) return;
  phase = "end"; ended = true; endInfo = d; F.ambient(false);
  for (const k in joys) delete joys[k];
  const order = cfg.players.map((p, i) => i).sort((a, b) => d.A[b] - d.A[a]);
  views.forEach((v) => { v.pi = order[0]; });
  const me = local ? -1 : cfg.me, win = !local && order[0] === me, R = rad(d.A[Math.max(0, me)] / 100), cm = Math.round(R * 200);
  celebrate = win || local;
  if (celebrate) F.win(); else F.lose();
  if (!local) {
    St.gameEnd({ win, players: cfg.players.length, humans: cfg.players.filter((p) => !p.bot).length, size: +(2 * R).toFixed(2), eaten: d.N[me], kills: d.K[me], place: order.indexOf(me) + 1 });
    T.haptic("notify", win ? "success" : "error");
    if (cm > best) { newBest = best > 0; best = cm; T.saveBest(BEST_KEY, best); } else newBest = false;
  }
  $("end-emoji").textContent = win ? "🏆" : local ? "🏆" : "🕳️";
  $("end-title").textContent = local ? `Победил ${cfg.players[order[0]].name}!` : win ? "Твоя дыра — самая большая!" : `Место: ${order.indexOf(me) + 1} из ${order.length}`;
  $("end-sub").innerHTML = order.map((i, k) => `<div class="row"><span><b style="color:${col(i)}">●</b> ${k + 1}. ${esc(cfg.players[i].name)}${i === me && cfg.players[i].name !== "Ты" ? " (ты)" : ""}</span><b>${fmt(rad(d.A[i] / 100))} · ${d.N[i]} 🧱${d.K[i] ? " · 😵" + d.K[i] : ""}</b></div>`).join("") +
    (!local && newBest ? `<div class="newbest">Новый рекорд: ${fmt(R)}!</div>` : !local && best ? `<div class="bestl">Рекорд: ${fmt(best / 200)}</div>` : "");
  const b = [];
  if (isHost()) b.push(["🔁 Ещё раунд", "primary", () => {
    if (local) { startLocal(); return; }
    const c2 = Object.assign({}, cfg, { seed: Math.floor(Math.random() * 1e9) }); delete c2.me; send("start", c2); begin({ room, cfg: Object.assign({}, c2, { me: cfg.me }) });
  }]);
  else b.push(["Ждём, пока хозяин запустит раунд…", "", () => {}]);
  if (!local && !room) b.push(["📨 Вызов другу", "", () => T.shareChallenge("dyra", cm, `Моя чёрная дыра выросла до ${fmt(R)} и проглотила ${d.N[me]} предметов 🕳️ Сможешь больше?`)]);
  if (!local && room) b.push(["📨 Позвать ещё друзей", "", () => T.openLink(`https://t.me/share/url?url=${encodeURIComponent(Net.inviteLink("dyra", room.id))}&text=${encodeURIComponent(PARTY.text)}`)]);
  b.push(["Выйти", "ghost", () => { if (room) room.close(); room = null; toMenu(); }]);
  const box = $("end-buttons"); box.innerHTML = "";
  b.forEach(([l, c, f]) => { const el = document.createElement("button"); el.className = "btn " + c; el.textContent = l; el.onclick = f; box.appendChild(el); });
  setTimeout(() => { if (phase === "end") $("screen-end").classList.remove("hidden"); }, 1600);
}
function toMenu() { $("screen-end").classList.add("hidden"); $("screen-menu").classList.remove("hidden"); $("snd").classList.remove("hidden"); F.ambient(false); updMenu(); startDemo(); }
function startLocal() {
  const C = window.Party ? Party.COLORS : ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#ec4899"];
  const players = [{ id: "p1", name: "Игрок 1", bot: false }, { id: "p2", name: "Игрок 2", bot: false }];
  for (let i = 0; i < 3; i++) players.push({ id: "bot" + i, name: "🤖 Бот " + (i + 1), bot: true });
  players.forEach((p, i) => { p.team = i; p.color = C[i]; });
  begin({ split: true, cfg: { mode: "local", seed: Math.floor(Math.random() * 1e9), players, me: 0 } });
}

// ---------- кадр ----------
let last = 0, perfAcc = 0, perfN = 0, perfT = 0, fps = 60, tickT = 11;
function update(dt) {
  if (phase === "count") {
    const before = Math.ceil(countT / 0.8); countT -= dt; const now = Math.ceil(countT / 0.8);
    if (now !== before && now > 0) F.knock(false);
    if (countT <= 0) { phase = "play"; F.go(); F.ambient(true); msg(null, "Глотай всё, что меньше тебя!", 1600); tickT = 11; }
  }
  const playing = phase === "play" || phase === "demo";
  if (playing || phase === "end") gt += dt;
  if (phase === "demo") { demoT += dt; if (demoT > 100) { startDemo(); return; } }
  // движущиеся предметы
  for (let k = 0; k < movers.length; k++) {
    const o = movers[k]; if (o.st !== 0) continue;
    moverPos(o, gt);
    if (!near.has(o)) { const bob = TYPES[o.t].s < 0.4 ? Math.abs(Math.sin(gt * 7 + o.mv.bob)) * 0.07 : 0; writeObj(o, bob); }
  }
  // дыры
  HL.forEach((h, i) => {
    h.die = Math.max(0, h.die - dt * 2.5); h.pulse = Math.max(0, h.pulse - dt * 2.2);
    if (h.comboT > 0) { h.comboT -= dt; if (h.comboT <= 0) h.combo = 0; }
    if (!h.alive) { if (isHost() && phase === "play") { h.resp -= dt; if (h.resp <= 0) respawn(i); } return; }
    if (h.sh > 0) h.sh -= dt;
    let ix = 0, iz = 0, drive = false;
    if (phase === "play" || phase === "demo") {
      if (aiHole(i)) { [ix, iz] = botThink(i, dt); drive = true; if (!localHole(i)) { const sk = BOT[i].skill; ix *= sk; iz *= sk; } }
      else { const vi = views.findIndex((v) => v.pi === i); if (vi >= 0) { [ix, iz] = inputFor(vi); drive = true; } }
    }
    if (drive || (phase !== "play" && localHole(i))) {
      const sp = speedOf(h.R), k = Math.min(1, dt * 7);
      h.vx += (ix * sp - h.vx) * k; h.vz += (iz * sp - h.vz) * k;
      h.x = clamp(h.x + h.vx * dt, 1, M - 1); h.z = clamp(h.z + h.vz * dt, 1, M - 1);
    } else if (phase === "play" && !isHost() || (room && isHost() && !cfg.players[i].bot)) {   // чужая дыра: к последней известной точке с упреждением
      const px = h.tx + h.vx * 0.08, pz = h.tz + h.vz * 0.08, k = Math.min(1, dt * 10);
      h.x += (px - h.x) * k; h.z += (pz - h.z) * k;
    }
    const A = !isHost() && i === cfg.me ? Math.max(h.A, h.Al) : h.A;
    h.R += (rad(A) - h.R) * Math.min(1, dt * 3.5);
    if (isHost()) h.best = Math.max(h.best, h.A);
  });
  // кто что глотает
  near.forEach((v, o) => { v.keep = false; });
  if (playing) HL.forEach((h, i) => {
    if (!h.alive || h.R < 0.3) return;
    const trig = canTrigger(i);
    query(h.x, h.z, h.R + 6, (o) => {
      const t = TYPES[o.t], s = t.s * o.sc, d = Math.hypot(o.x - h.x, o.z - h.z);
      if (d > h.R + s * 0.6) return;
      const fits = s < h.R * 0.97;
      if (fits && trig && d < h.R - s * 0.25 + 0.06) { startFall(o, i); return; }
      let n = near.get(o); if (!n) { n = { h: i, keep: true, fits, d, rt: 0 }; near.set(o, n); }
      if (d <= n.d || n.h === i) { n.h = i; n.fits = fits; n.d = d; }
      n.keep = true;
    });
  });
  near.forEach((n, o) => {
    if (!n.keep || o.st !== 0) { near.delete(o); if (o.st === 0) writeObj(o, 0); return; }
    const h = HL[n.h], t = TYPES[o.t], s = t.s * o.sc, dx = h.x - o.x, dz = h.z - o.z, d = Math.hypot(dx, dz) || 1;
    const edge = clamp(1 - (d - h.R) / (s * 0.6 + 0.01), 0, 1);
    let ang;
    if (n.fits) ang = edge * 0.35;    // наклоняется к дыре
    else { ang = edge * (0.05 + 0.04 * Math.sin(gt * 31 + o.id)); n.rt -= 1 / 60; if (n.rt <= 0 && edge > 0.3) { n.rt = 0.35 + Math.random() * 0.3; if (phase !== "demo") F.rattle(s, earVol(o.x, o.z) * 0.6); } }
    writeObj(o, 0, dz / d, -dx / d, ang);
  });
  stepFalls(dt); stepDebris(dt);
  // дыра глотает дыру (хозяин)
  if (isHost() && phase === "play") {
    for (let i = 0; i < HL.length; i++) for (let j = 0; j < HL.length; j++) {
      if (i === j) continue; const a = HL[i], b = HL[j];
      if (!a.alive || !b.alive || b.sh > 0 || a.R < b.R * 1.12) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < a.R - b.R * 0.3) eatHole(j, i);
    }
    if (gt >= DURATION) finish();
  }
  if (phase === "play") {
    const tl = DURATION - gt;
    if (tl < tickT && tl > 0) { tickT = Math.floor(tl); F.knock(tl < 4); if (tickT === 10) msg(null, "10 секунд!", 1000, "#ffd34d"); }
    // ступень роста: «теперь можно …»
    for (const v of views) {
      const h = HL[v.pi]; let tier = 0; while (tier < TIERS.length && h.R * 0.97 > TIERS[tier].s) tier++;
      if (tier > h.tier) { if (h.tier >= 0 && h.alive) msg(v, `Теперь можно: ${TIERS[tier - 1].emo} ${TIERS[tier - 1].name}!`, 1500, "#9ef0a0"); h.tier = tier; }
    }
  }
  // сеть
  if (room && (phase === "play" || phase === "count")) {
    if (isHost()) { snapT -= dt; fullT -= dt; if (snapT <= 0) { snapT = 1 / 12; const full = fullT <= 0; room.sendFast("snap", snapshot(full)); if (full) fullT = 2; } }
    else {
      meT -= dt; const me = HL[cfg.me];
      if (meT <= 0) { meT = 1 / 15; room.sendFast("me", [Math.round(me.x * 20) / 20, Math.round(me.z * 20) / 20, Math.round(me.vx * 10) / 10, Math.round(me.vz * 10) / 10]); }
      claimT -= dt; if (claims.length && claimT <= 0) { claimT = 0.08; room.send("cl", claims); claims = []; }
    }
  } else if (!room) recentEats.length = 0;
  // дыры на сцене
  HL.forEach((h, i) => {
    const show = h.alive || h.die > 0, R = h.alive ? h.R : h.R * h.die;
    h.mesh.grp.visible = show && R > 0.05;
    holeU.value[i].set(h.x, h.z, show ? R : 0, 0);
    if (!show) return;
    const D = depthOf(R), p = 1 + h.pulse * 0.07 * Math.sin(gt * 30) + h.pulse * 0.05;
    h.mesh.grp.position.set(h.x, 0, h.z);
    h.mesh.wall.scale.set(R, D, R); h.mesh.bottom.position.y = -D + 0.01; h.mesh.bottom.scale.set(R, 1, R);
    const rr = R * p + 0.04; h.mesh.rim.scale.set(rr, 1, rr); h.mesh.glow.scale.set(rr, 1, rr);
    h.mesh.rim.visible = !(h.sh > 0 && Math.floor(gt * 8) % 2);
    h.mesh.glow.material.opacity = 0.22 + h.pulse * 0.3;
  });
  for (let i = HL.length; i < MAXH; i++) holeU.value[i].z = 0;
  dirty.forEach((m) => { m.instanceMatrix.needsUpdate = true; }); dirty.clear();
}
function render(dt) {
  if (!views.length) { renderer.setScissorTest(false); renderer.clear(); return; }
  for (const v of views) updateCam(v, dt);
  if (views.length === 1) { aimSun(views[0]); renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.render(scene, views[0].cam); }
  else {
    renderer.setScissorTest(true);
    for (const v of views) { aimSun(v); const y = H - v.y - v.h; renderer.setViewport(v.x, y, v.w, v.h); renderer.setScissor(v.x, y, v.w, v.h); renderer.render(scene, v.cam); }
    renderer.setScissorTest(false);
  }
  drawOverlay(dt);
}

// ---------- HUD ----------
const _v3 = new THREE.Vector3();
function proj(v, x, y, z) { _v3.set(x, y, z).project(v.cam); if (_v3.z > 1) return null; let px = (_v3.x * 0.5 + 0.5) * v.w, py = (-_v3.y * 0.5 + 0.5) * v.h; if (v.rot) { px = v.w - px; py = v.h - py; } return [px, py]; }
function txt(s, x, y, size, color, align, stroke) {
  g2.font = `900 ${size}px "Russo One", -apple-system, "Segoe UI", Roboto, sans-serif`; g2.textAlign = align || "center"; g2.textBaseline = "middle";
  g2.lineJoin = "round"; g2.lineWidth = stroke != null ? stroke : Math.max(3, size * 0.22); g2.strokeStyle = "rgba(15,18,30,.92)";
  if (g2.lineWidth) g2.strokeText(s, x, y); g2.fillStyle = color || "#fff"; g2.fillText(s, x, y);
}
function rrect(x, y, w, h, r) { g2.beginPath(); g2.moveTo(x + r, y); g2.arcTo(x + w, y, x + w, y + h, r); g2.arcTo(x + w, y + h, x, y + h, r); g2.arcTo(x, y + h, x, y, r); g2.arcTo(x, y, x + w, y, r); g2.closePath(); }
const confetti = [];
let celebrate = false;
function drawOverlay(dt) {
  g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, ov.width, ov.height);
  if (!cfg) return;
  const hud = phase === "play" || phase === "count";
  for (let vi = 0; vi < views.length; vi++) {
    const v = views[vi];
    g2.setTransform(ODPR, 0, 0, ODPR, 0, 0);
    if (v.rot) { g2.translate(v.x + v.w, v.y + v.h); g2.rotate(Math.PI); } else g2.translate(v.x, v.y);
    const sc = Math.min(1.15, Math.max(0.78, Math.min(v.w, v.h * 1.2) / 420)), top = v.rot ? 10 : 8 + SAT;
    // имена над дырами
    HL.forEach((h, i) => {
      if (!h.alive || (i === v.pi && hud && views.length === 1)) return;
      const p = proj(v, h.x, 0, h.z - h.R * 1.05); if (!p) return;
      txt(pname(i), p[0], p[1] - 12 * sc, 13 * sc, h.sh > 0 ? "#cfe8ff" : "#fff");
      if (phase !== "demo") txt(fmt(h.R), p[0], p[1] + 3 * sc, 11 * sc, col(i), "center", 3);
    });
    // всплывающие «+N»
    v.floats = v.floats.filter((f) => (f.t += dt) < 1.1);
    let stack = 0;
    for (let q = v.floats.length - 1; q >= 0; q--) {   // свежие внизу, старые выталкиваются вверх
      const f = v.floats[q], p = proj(v, f.h.x, 0.5, f.h.z - f.h.R * 0.3); if (!p) continue;
      const k = f.t / 1.1, a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3, pop = f.t < 0.12 ? 0.6 + f.t / 0.12 * 0.6 : 1.2 - Math.min(0.2, (f.t - 0.12) * 0.6);
      const size = (14 + Math.min(18, f.s * 5)) * sc * pop;
      g2.globalAlpha = a;
      txt((f.emo ? f.emo + " " : "") + f.text, p[0] + f.ox * 4, p[1] - 30 * sc - k * 40 * sc - stack, size, f.s > 2 ? "#ffd34d" : "#fff");
      g2.globalAlpha = 1;
      stack += size * 1.05;
    }
    if (hud) {
      const me = HL[v.pi], tl = Math.max(0, DURATION - gt);
      // таймер
      const urgent = tl < 10.5 && phase === "play";
      txt(`${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, "0")}`, v.w / 2, top + 20 * sc, (urgent ? 30 + 4 * Math.abs(Math.sin(gt * 6)) : 26) * sc, urgent ? "#ff6b6b" : "#fff");
      // размер
      const bx = 10, by = top + 4;
      g2.fillStyle = "rgba(15,18,30,.55)"; rrect(bx, by, 118 * sc, 40 * sc, 20 * sc); g2.fill();
      g2.fillStyle = "#05060a"; g2.beginPath(); g2.arc(bx + 20 * sc, by + 20 * sc, 13 * sc, 0, 7); g2.fill();
      g2.strokeStyle = col(v.pi); g2.lineWidth = 3.5 * sc; g2.beginPath(); g2.arc(bx + 20 * sc, by + 20 * sc, 13 * sc, 0, 7); g2.stroke();
      txt(fmt(me.R), bx + 40 * sc, by + 21 * sc, 20 * sc, "#fff", "left", 0);
      // место и таблица
      const order = HL.map((h, i) => i).sort((a, b) => HL[b].A - HL[a].A);
      txt(`🏅 ${order.indexOf(v.pi) + 1}/${HL.length}`, v.w - 12, top + 20 * sc, 17 * sc, "#fff", "right");
      order.slice(0, 4).forEach((i, k) => {
        const y = top + 46 * sc + k * 17 * sc, mine = i === v.pi;
        g2.fillStyle = col(i); g2.beginPath(); g2.arc(v.w - 14, y, 5 * sc, 0, 7); g2.fill();
        txt(`${pname(i)} ${fmt(HL[i].R)}`, v.w - 24, y, 12.5 * sc, mine ? "#ffe27a" : "#fff", "right", 3);
      });
      // что дальше
      let tier = 0; while (tier < TIERS.length && me.R * 0.97 > TIERS[tier].s) tier++;
      if (tier < TIERS.length && me.alive) {
        const nx = TIERS[tier], ps = tier ? TIERS[tier - 1].s : R0 * 0.9, fr = clamp((me.R * 0.97 - ps) / (nx.s - ps), 0, 1);
        const w = Math.min(230, v.w * 0.62) * sc, x = v.w / 2 - w / 2, y = v.h - (v.rot ? 34 : 40 + SAB) * sc;
        g2.fillStyle = "rgba(15,18,30,.55)"; rrect(x - 4, y - 4, w + 8, 18 * sc, 9 * sc); g2.fill();
        g2.fillStyle = col(v.pi); rrect(x, y, Math.max(10 * sc, w * fr), 10 * sc, 5 * sc); g2.fill();
        txt(`Дальше: ${nx.emo} ${nx.name}`, v.w / 2, y - 12 * sc, 13 * sc, "#fff", "center", 3);
      }
      if (!me.alive && phase === "play") { g2.fillStyle = "rgba(10,12,25,.35)"; g2.fillRect(0, 0, v.w, v.h); txt("Возрождение…", v.w / 2, v.h * 0.58, 24 * sc, "#fff"); }
      if (phase === "count") { const n = Math.ceil(countT / 0.8); txt(String(n), v.w / 2, v.h * 0.4, (70 + (countT % 0.8) * 40) * sc, "#ffd34d"); txt(views.length > 1 ? "Веди пальцем по своей половине" : "Веди пальцем — дыра едет туда", v.w / 2, v.h * 0.4 + 60 * sc, 15 * sc, "#fff"); }
    }
    // сообщения
    v.msgs = v.msgs.filter((m) => (m.t += dt) < m.dur);
    for (const m of v.msgs) { const a = Math.min(1, (m.dur - m.t) / 0.25), pop = Math.min(1, m.t / 0.12); g2.globalAlpha = a; txt(m.text, v.w / 2, v.h * 0.3, (21 + 6 * (1 - pop)) * sc, m.color); g2.globalAlpha = 1; }
    // джойстик
    const j = joys[vi];
    if (j && hud) {
      let jx = j.x - v.x, jy = j.y - v.y, cx = j.cx - v.x, cy = j.cy - v.y;
      if (v.rot) { jx = v.w - jx; jy = v.h - jy; cx = v.w - cx; cy = v.h - cy; }
      g2.strokeStyle = "rgba(255,255,255,.55)"; g2.lineWidth = 3; g2.beginPath(); g2.arc(jx, jy, 64, 0, 7); g2.stroke();
      g2.fillStyle = "rgba(255,255,255,.7)"; g2.beginPath(); g2.arc(cx, cy, 24, 0, 7); g2.fill();
    }
    // конфетти у победителя
    if (phase === "end" && vi === 0 && celebrate) {
      if (confetti.length < 140 && Math.random() < 0.9) for (let k = 0; k < 3; k++) confetti.push({ x: Math.random() * v.w, y: -10, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 120, r: Math.random() * 6, w: 5 + Math.random() * 6, c: ["#ffd34d", "#ff6b9a", "#5ad1ff", "#7cf29a", "#c58bff"][k + Math.floor(Math.random() * 2)] });
      for (let k = confetti.length - 1; k >= 0; k--) { const c = confetti[k]; c.x += c.vx * dt; c.y += c.vy * dt; c.r += dt * 6; if (c.y > v.h + 20) { confetti.splice(k, 1); continue; } g2.save(); g2.translate(c.x, c.y); g2.rotate(c.r); g2.fillStyle = c.c; g2.fillRect(-c.w / 2, -c.w / 4, c.w, c.w / 2); g2.restore(); }
    }
  }
  if (phase !== "end") confetti.length = 0;
  if (views.length > 1) { g2.setTransform(ODPR, 0, 0, ODPR, 0, 0); g2.fillStyle = "#0f121e"; g2.fillRect(0, views[1].y - 2, W, 4); }
}

function frame(ts) {
  const raw = (ts - (last || ts)) / 1000, dt = Math.min(raw, 0.05); last = ts;
  if (phase !== "boot") update(dt);
  render(dt);
  // подстройка качества: если кадр стабильно долгий — снижаем разрешение, потом тени
  if (phase === "play" && raw > 0 && raw < 0.5) {
    perfAcc += raw; perfN++; perfT += raw;
    if (perfT > 2.5) { const avg = perfAcc / perfN; fps = Math.round(1 / avg); if (avg > 1 / 42 && quality > 0) { quality--; applyQuality(); } perfAcc = 0; perfN = 0; perfT = 0; }
  }
  requestAnimationFrame(frame);
}

// ---------- меню ----------
const PARTY = { title: "Чёрная дыра", icon: "🕳️", max: 6, bots: 3, text: "Го в «Чёрную дыру» 🕳️ Чья дыра проглотит больше города? Заходи!", modes: [{ id: "ffa", name: "Каждый сам за себя" }], onCancel: () => toMenu() };
const BEST_KEY = "dyra_best";
let best = 0, newBest = false;
const challenge = T.readChallenge && T.readChallenge();
function updMenu() {
  $("best").textContent = best > 0 ? `🏆 Твой рекорд: ${fmt(best / 200)}` : "";
  if (challenge) { $("challenge").classList.remove("hidden"); $("challenge").textContent = `${challenge.name} вырастил дыру до ${fmt(challenge.score / 200)}. Сможешь больше?`; }
}
const hideMenu = () => { $("screen-menu").classList.add("hidden"); $("snd").classList.add("hidden"); };
$("m-bots").onclick = async () => { hideMenu(); const c = await Party.offline(Object.assign({}, PARTY, { bots: 4 })); begin(c); };
$("m-party").onclick = async () => { hideMenu(); begin(await Party.host("dyra", PARTY)); };
$("m-local").onclick = () => { hideMenu(); startLocal(); };
$("m-menu").onclick = () => { location.href = "../"; };
const sndBtn = $("snd"); const updSnd = () => { sndBtn.textContent = F.on ? "🔊" : "🔇"; };
sndBtn.onclick = (e) => { F.toggle(); updSnd(); }; updSnd();
document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("button, .pt-chip")) F.tap(); }, true);
T.init({ header: "#bfe8ff", bg: "#bfe8ff", back: "../" });
T.loadBest(BEST_KEY, (b) => { best = b; updMenu(); });
addEventListener("resize", resize);
W = innerWidth; H = innerHeight;
const inv = window.Net && Net.readInvite();
if (inv) { hideMenu(); Party.join("dyra", inv, PARTY).then(begin); }   // по приглашению: сразу в комнату, без демо-города в меню
else startDemo();
document.body.classList.add("ready");
updMenu();
requestAnimationFrame(frame);

window.__game = {
  get phase() { return phase; }, get H() { return HL; }, get cfg() { return cfg; }, get O() { return O; }, get falling() { return falling; },
  get gt() { return gt; }, set gt(v) { gt = v; }, BOT, get fps() { return fps; }, get quality() { return quality; }, get views() { return views; }, get room() { return room; },
  finish, setQuality(q) { quality = q; applyQuality(); }, startLocal, setGrow(g) { GROW = g; },
  solo(bots, seed) { const C = Party.COLORS, players = [{ id: "me", name: "Ты", bot: false }]; for (let i = 0; i < (bots == null ? 4 : bots); i++) players.push({ id: "bot" + i, name: "🤖 Бот " + (i + 1), bot: true }); players.forEach((p, i) => { p.team = i; p.color = C[i]; }); hideMenu(); begin({ room: null, cfg: { mode: "ffa", seed: seed || 12345, players, me: 0 } }); },
  sim(sec, step) { step = step || 1 / 30; for (let t = 0; t < sec && (phase === "play" || phase === "count" || phase === "demo"); t += step) update(step); },   // прогон без отрисовки (автотесты)
  stats() { const c = { standing: 0, falling: 0, gone: 0 }; O.forEach((o) => { c[["standing", "falling", "gone"][o.st]]++; }); return c; },
  renderer
};
