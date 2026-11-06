/* «Чёрная дыра»: игрушечный город. Геометрия предметов (каждый тип — один InstancedMesh с цветом на экземпляр)
   и детерминированная генерация города по seed: у всех игроков в комнате получается один и тот же город. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const NB = 5, ROAD = 8, BLK = 22, PER = ROAD + BLK, M = NB * PER + ROAD;   // карта M×M метров

export function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- сборка геометрии из простых деталей ----------
const tmpC = new THREE.Color();
function P(geo, col, tint, x, y, z, rx, ry, rz, sx, sy, sz) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  if (sx) g.scale(sx, sy || sx, sz || sx);
  if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
  g.translate(x || 0, y || 0, z || 0);
  const n = g.attributes.position.count, c = new Float32Array(n * 3), t = new Float32Array(n);
  tmpC.set(col);
  for (let i = 0; i < n; i++) { c[i * 3] = tmpC.r; c[i * 3 + 1] = tmpC.g; c[i * 3 + 2] = tmpC.b; t[i] = tint ? 1 : 0; }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.setAttribute("tint", new THREE.BufferAttribute(t, 1));
  return g;
}
const W = 0xffffff;
// коробка: w×h×d, y — низ детали
const box = (w, h, d, col, tint, x, y, z, r, ry) => P(r ? new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)) : new THREE.BoxGeometry(w, h, d), col, tint, x, (y || 0) + h / 2, z, 0, ry || 0);
const cyl = (rt, rb, h, seg, col, tint, x, y, z, rx, rz) => P(new THREE.CylinderGeometry(rt, rb, h, seg), col, tint, x, (y || 0) + (rx || rz ? 0 : h / 2), z, rx, 0, rz);
const ball = (r, col, tint, x, y, z, det, sy) => P(new THREE.IcosahedronGeometry(r, det == null ? 1 : det), col, tint, x, y, z, 0, 0, 0, 1, sy || 1, 1);
const sph = (r, col, tint, x, y, z, sy, seg) => P(new THREE.SphereGeometry(r, seg || 8, seg ? Math.max(4, seg - 2) : 6), col, tint, x, y, z, 0, 0, 0, 1, sy || 1, 1);
function prism(w, h, len, col, tint, y, ry) {      // двускатная крыша: треугольник w×h, длина len вдоль z
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2);
  return P(g, col, tint, 0, y, 0, 0, ry || 0);
}
const merge = (parts) => { const g = mergeGeometries(parts, false); g.computeBoundingSphere(); return g; };

const GLASS = 0xbfe6fa, DARK = 0x2b2f3a, TIRE = 0x262833, SKIN = 0xf3c9a1, WOOD = 0x8b5a3c, POLE = 0x56607a;

function gPerson() {
  return merge([
    box(0.17, 0.42, 0.34, 0x34456e, 0, 0, 0, 0),
    box(0.27, 0.46, 0.40, W, 1, 0, 0.4, 0, 0.09),
    box(0.12, 0.36, 0.1, 0xdddddd, 1, 0, 0.47, 0.25), box(0.12, 0.36, 0.1, 0xdddddd, 1, 0, 0.47, -0.25),
    sph(0.19, SKIN, 0, 0, 1.06, 0), sph(0.2, 0x4a2f1d, 0, -0.03, 1.13, 0, 0.75),
    box(0.04, 0.05, 0.05, 0x222222, 0, 0.18, 1.07, 0.07), box(0.04, 0.05, 0.05, 0x222222, 0, 0.18, 1.07, -0.07)
  ]);
}
function wheels(xs, zs, r, w) { const a = []; for (const x of xs) for (const z of zs) a.push(cyl(r, r, w, 8, TIRE, 0, x, r, z, Math.PI / 2)); return a; }
function gCar() {
  return merge([
    box(2.1, 0.55, 1.08, W, 1, 0, 0.2, 0, 0.18),
    box(1.2, 0.5, 0.94, GLASS, 0, -0.12, 0.7, 0, 0.14), box(1.05, 0.08, 0.96, W, 1, -0.12, 1.17, 0, 0.04),
    box(0.06, 0.12, 0.22, 0xfff4b0, 0, 1.05, 0.48, 0.32), box(0.06, 0.12, 0.22, 0xfff4b0, 0, 1.05, 0.48, -0.32),
    box(0.06, 0.1, 0.2, 0xff4d4d, 0, -1.05, 0.5, 0.33), box(0.06, 0.1, 0.2, 0xff4d4d, 0, -1.05, 0.5, -0.33),
    box(0.1, 0.14, 1.1, DARK, 0, 1.05, 0.22, 0), box(0.1, 0.14, 1.1, DARK, 0, -1.05, 0.22, 0),
    ...wheels([0.66, -0.66], [0.5, -0.5], 0.23, 0.2)
  ]);
}
function gBus() {
  return merge([
    box(5.2, 1.75, 1.75, W, 1, 0, 0.35, 0, 0.22),
    box(4.7, 0.6, 1.78, GLASS, 0, -0.1, 1.2, 0), box(0.1, 0.8, 1.5, GLASS, 0, 2.58, 1.0, 0),
    box(5.0, 0.12, 1.6, 0xf8fafc, 0, 0, 2.1, 0, 0.05),
    box(0.08, 0.16, 0.3, 0xfff4b0, 0, 2.6, 0.55, 0.55), box(0.08, 0.16, 0.3, 0xfff4b0, 0, 2.6, 0.55, -0.55),
    ...wheels([1.7, -1.7], [0.78, -0.78], 0.36, 0.26)
  ]);
}
function gTruck() {   // фургон с мороженым / доставка
  return merge([
    box(1.0, 1.1, 1.4, W, 1, 1.05, 0.3, 0, 0.15), box(0.08, 0.5, 1.2, GLASS, 0, 1.53, 0.8, 0),
    box(2.0, 1.7, 1.5, 0xf8fafc, 0, -0.5, 0.3, 0, 0.12), box(2.02, 0.35, 1.52, W, 1, -0.5, 1.15, 0),
    ...wheels([1.0, -1.0], [0.62, -0.62], 0.28, 0.22)
  ]);
}
function gLamp() {
  return merge([
    cyl(0.16, 0.2, 0.3, 6, 0x3d4558, 0), cyl(0.06, 0.07, 3.3, 6, POLE, 0, 0, 0.2),
    box(0.7, 0.07, 0.07, POLE, 0, 0.32, 3.38, 0), cyl(0.14, 0.24, 0.16, 6, POLE, 0, 0.65, 3.24, 0),
    box(0.26, 0.1, 0.26, 0xfff6c4, 0, 0.65, 3.14, 0)
  ]);
}
function gTree() {
  return merge([
    cyl(0.13, 0.19, 1.8, 6, WOOD, 0),
    ball(1.05, W, 1, 0, 2.35, 0), ball(0.75, 0xe8ffe0, 1, 0.5, 2.95, 0.25), ball(0.7, 0xd8f0d0, 1, -0.5, 2.7, -0.35, 0)
  ]);
}
function gPine() {
  return merge([
    cyl(0.12, 0.16, 0.9, 8, WOOD, 0),
    cyl(0.0, 1.05, 1.7, 9, 0xdddddd, 1, 0, 0.7), cyl(0.0, 0.8, 1.4, 9, W, 1, 0, 1.6), cyl(0.0, 0.52, 1.0, 9, 0xeeeeee, 1, 0, 2.45)
  ]);
}
function gBush() { return merge([ball(0.48, W, 1, 0, 0.38, 0, 1, 0.85), ball(0.38, 0xe0f5d8, 1, 0.38, 0.34, 0.15, 1, 0.85), ball(0.35, 0xf0fff0, 1, -0.32, 0.32, -0.18, 1, 0.85)]); }
function gBench() {
  return merge([
    box(1.6, 0.08, 0.48, W, 1, 0, 0.42, 0), box(1.6, 0.32, 0.07, W, 1, 0, 0.6, -0.24),
    box(0.08, 0.42, 0.42, DARK, 0, 0.68, 0, 0), box(0.08, 0.42, 0.42, DARK, 0, -0.68, 0, 0),
    box(0.07, 0.4, 0.07, DARK, 0, 0.68, 0.45, -0.24), box(0.07, 0.4, 0.07, DARK, 0, -0.68, 0.45, -0.24)
  ]);
}
function gHydrant() {
  return merge([cyl(0.2, 0.22, 0.08, 8, W, 1), cyl(0.14, 0.15, 0.48, 8, W, 1, 0, 0.06), sph(0.15, W, 1, 0, 0.55, 0, 0.8, 6),
    cyl(0.06, 0.06, 0.42, 6, 0xdddddd, 1, 0, 0.34, 0, 0, Math.PI / 2)]);
}
function gBin() { return merge([cyl(0.24, 0.2, 0.68, 10, W, 1), cyl(0.27, 0.27, 0.07, 10, 0x3d4558, 0, 0, 0.68), box(0.22, 0.05, 0.05, 0x3d4558, 0, 0, 0.76, 0)]); }
function gCone() {
  return merge([box(0.46, 0.05, 0.46, 0xff6a1f, 0), cyl(0.03, 0.2, 0.58, 12, 0xff7b2c, 0, 0, 0.05),
    cyl(0.125, 0.15, 0.1, 12, 0xffffff, 0, 0, 0.26)]);
}
function gPlanter() {
  return merge([box(1.0, 0.45, 1.0, 0xc8875a, 0, 0, 0, 0, 0.06), box(0.9, 0.06, 0.9, 0x6b4a2f, 0, 0, 0.42, 0),
    ball(0.32, 0x5cbf4a, 0, 0, 0.6, 0, 0, 0.8), ball(0.15, W, 1, 0.25, 0.72, 0.2, 0), ball(0.14, W, 1, -0.22, 0.7, 0.25, 0), ball(0.15, W, 1, 0.18, 0.74, -0.24, 0), ball(0.14, W, 1, -0.24, 0.72, -0.18, 0), ball(0.13, 0xfff36b, 0, 0, 0.86, 0, 0)]);
}
function gKiosk() {
  const p = [box(2.0, 2.0, 1.6, 0xfff8ec, 0, 0, 0, 0, 0.08), box(1.7, 0.8, 0.05, GLASS, 0, 0, 0.95, 0.8), box(1.8, 0.1, 0.4, 0xd8c2a0, 0, 0, 0.9, 0.98),
    box(2.25, 0.18, 1.85, W, 1, 0, 2.0, 0, 0.06), box(1.2, 0.45, 0.12, W, 1, 0, 2.18, 0.0)];
  for (let i = 0; i < 5; i++) p.push(P(new THREE.BoxGeometry(0.45, 0.08, 1.0), i % 2 ? 0xffffff : W, i % 2 ? 0 : 1, -0.9 + i * 0.45, 1.88, 1.15, 0.45));
  return merge(p);
}
function gFountain() {
  return merge([cyl(2.0, 2.15, 0.55, 20, 0xe2dccf, 0), cyl(1.8, 1.8, 0.06, 20, 0x6cc3ef, 0, 0, 0.48), cyl(0.28, 0.36, 1.5, 8, 0xe2dccf, 0, 0, 0.5),
    cyl(0.85, 0.4, 0.28, 12, 0xe2dccf, 0, 0, 1.75), cyl(0.75, 0.75, 0.04, 12, 0x8ad4f5, 0, 0, 2.0), ball(0.3, 0xb8e6fb, 0, 0, 2.2, 0, 1, 1.3), ball(0.18, 0xd8f3ff, 0, 0, 2.55, 0, 0, 1.4)]);
}
function windowsRow(w, d, y, h, n, skipFront) {   // окна по периметру коробки w×d
  const p = [];
  for (let i = 0; i < n; i++) {
    const u = -w / 2 + (i + 0.5) * (w / n);
    if (!skipFront || Math.abs(u) > 0.7) p.push(box(w / n * 0.5, h, 0.06, GLASS, 0, u, y, d / 2 + 0.01));
    p.push(box(w / n * 0.5, h, 0.06, GLASS, 0, u, y, -d / 2 - 0.01));
    const v = -d / 2 + (i + 0.5) * (d / n);
    p.push(box(0.06, h, d / n * 0.5, GLASS, 0, w / 2 + 0.01, y, v)); p.push(box(0.06, h, d / n * 0.5, GLASS, 0, -w / 2 - 0.01, y, v));
  }
  return p;
}
function gHouse() {
  return merge([box(5, 2.9, 5, W, 1, 0, 0, 0, 0.12), prism(5.8, 2.1, 5.6, 0xe0574c, 0, 2.9), box(0.6, 1.2, 0.6, 0xb84a3c, 0, 1.3, 3.6, -1.2),
    box(1.0, 1.7, 0.08, 0x9a5a35, 0, 0, 0, 2.52), box(1.3, 0.1, 0.5, 0xffffff, 0, 0, 1.75, 2.6), ...windowsRow(5, 5, 1.2, 0.9, 2, true)]);
}
function gHouse2() {
  return merge([box(4.4, 4.6, 4.4, W, 1, 0, 0, 0, 0.12), prism(5.1, 1.9, 4.9, 0x5b6b90, 0, 4.6, Math.PI / 2),
    box(1.0, 1.7, 0.08, 0x7a4a2a, 0, 0, 0, 2.22), ...windowsRow(4.4, 4.4, 1.0, 0.9, 2, true), ...windowsRow(4.4, 4.4, 3.1, 0.9, 2)]);
}
function gShop() {
  const p = [box(6, 3.6, 5, W, 1, 0, 0, 0, 0.1), box(6.2, 0.45, 5.2, 0xf1f1f1, 0, 0, 3.6, 0), box(4.8, 1.6, 0.08, GLASS, 0, 0, 0.5, 2.52),
    box(3.4, 0.7, 0.14, 0xffffff, 0, 0, 4.05, 2.4), box(3.0, 0.35, 0.16, W, 1, 0, 4.22, 2.42), ...windowsRow(6, 5, 2.5, 0.7, 3)];
  for (let i = 0; i < 8; i++) p.push(P(new THREE.BoxGeometry(0.75, 0.08, 1.3), i % 2 ? 0xffffff : W, i % 2 ? 0 : 1, -2.62 + i * 0.75, 2.35, 3.05, 0.42));
  p.push(box(1.0, 0.6, 1.0, 0x9aa3b5, 0, -1.6, 4.05, -1.2), box(0.6, 0.4, 0.6, 0x9aa3b5, 0, 1.8, 4.05, -1.4));
  return merge(p);
}
function gTower() {
  const p = [box(7, 13, 7, W, 1, 0, 0, 0, 0.15), box(7.4, 0.5, 7.4, 0xd0d0d0, 1, 0, 13, 0), box(6.6, 0.06, 6.6, 0x8f99ab, 0, 0, 13.5, 0), box(2.2, 1.4, 2.2, 0xa0a8b8, 0, -1.5, 13.5, -1.2),
    cyl(0.9, 0.9, 1.6, 12, 0xc0855a, 0, 2.0, 13.5, 1.6), box(2.4, 2.2, 0.08, GLASS, 0, 0, 0, 3.52)];
  for (let f = 0; f < 5; f++) p.push(...windowsRow(7, 7, 2.6 + f * 2.05, 1.1, 4));
  return merge(p);
}
function gTrafficLight() {
  return merge([cyl(0.07, 0.08, 2.7, 6, POLE, 0), box(0.32, 0.9, 0.3, 0x2f3542, 0, 0, 2.6, 0),
    box(0.16, 0.16, 0.05, 0xff4d4d, 0, 0, 3.22, 0.16), box(0.16, 0.16, 0.05, 0xffd43b, 0, 0, 2.97, 0.16), box(0.16, 0.16, 0.05, 0x51cf66, 0, 0, 2.72, 0.16)]);
}
function gDog() {
  return merge([box(0.55, 0.26, 0.24, W, 1, 0, 0.2, 0, 0.08), box(0.08, 0.2, 0.08, W, 1, 0.2, 0, 0.08), box(0.08, 0.2, 0.08, W, 1, 0.2, 0, -0.08), box(0.08, 0.2, 0.08, W, 1, -0.2, 0, 0.08), box(0.08, 0.2, 0.08, W, 1, -0.2, 0, -0.08),
    box(0.26, 0.24, 0.22, W, 1, 0.33, 0.36, 0, 0.07), box(0.1, 0.08, 0.1, 0x2b2b2b, 0, 0.48, 0.38, 0), box(0.05, 0.12, 0.06, 0x6b4226, 0, 0.3, 0.58, 0.08), box(0.05, 0.12, 0.06, 0x6b4226, 0, 0.3, 0.58, -0.08), box(0.2, 0.05, 0.05, W, 1, -0.35, 0.4, 0, 0, 0)]);
}

/* Типы предметов. s — «радиус» предмета: дыра глотает его, если её радиус больше s.
   v — сколько площади прибавляет. mat — материал для звука. */
export const TYPES = [
  { id: "person", s: 0.34, mat: "soft", geo: gPerson, emo: "🧍" },
  { id: "dog", s: 0.3, mat: "soft", geo: gDog, emo: "🐕" },
  { id: "cone", s: 0.3, mat: "plastic", geo: gCone, emo: "🚧" },
  { id: "hydrant", s: 0.32, mat: "metal", geo: gHydrant, emo: "🧯" },
  { id: "bin", s: 0.36, mat: "metal", geo: gBin, emo: "🗑️" },
  { id: "bush", s: 0.62, mat: "leaf", geo: gBush, emo: "🌿" },
  { id: "planter", s: 0.66, mat: "wood", geo: gPlanter, emo: "🌷" },
  { id: "lamp", s: 0.6, mat: "metal", geo: gLamp, emo: "💡" },
  { id: "tlight", s: 0.62, mat: "metal", geo: gTrafficLight, emo: "🚦" },
  { id: "bench", s: 0.88, mat: "wood", geo: gBench, emo: "🪑" },
  { id: "tree", s: 1.05, mat: "leaf", geo: gTree, emo: "🌳" },
  { id: "pine", s: 0.95, mat: "leaf", geo: gPine, emo: "🌲" },
  { id: "car", s: 1.45, mat: "metal", geo: gCar, emo: "🚗" },
  { id: "kiosk", s: 1.6, mat: "wood", geo: gKiosk, emo: "🏪" },
  { id: "truck", s: 1.75, mat: "metal", geo: gTruck, emo: "🚚" },
  { id: "fountain", s: 2.3, mat: "stone", geo: gFountain, emo: "⛲" },
  { id: "bus", s: 2.75, mat: "metal", geo: gBus, emo: "🚌" },
  { id: "house2", s: 3.2, mat: "stone", geo: gHouse2, emo: "🏠" },
  { id: "house", s: 3.5, mat: "stone", geo: gHouse, emo: "🏡" },
  { id: "shop", s: 4.1, mat: "stone", geo: gShop, emo: "🏬" },
  { id: "tower", s: 5.4, mat: "stone", geo: gTower, emo: "🏢" }
];
export const TI = {}; TYPES.forEach((t, i) => { TI[t.id] = i; t.v = +(t.s * t.s * 1.25).toFixed(3); });
// ступени роста для подсказки «дальше сможешь»
export const TIERS = [["bench", "скамейки"], ["tree", "деревья"], ["car", "машины"], ["bus", "автобусы"], ["house", "дома"], ["shop", "магазины"], ["tower", "небоскрёбы"]]
  .map(([id, name]) => ({ s: TYPES[TI[id]].s, emo: TYPES[TI[id]].emo, name }));

export function buildGeometries() { return TYPES.map((t) => t.geo()); }

// ---------- движение по кругу вокруг квартала (скруглённый прямоугольник, по часовой) ----------
export function loopPos(p, t, out) {
  const [x0, z0, x1, z1, rc] = p.r, lx = x1 - x0 - 2 * rc, lz = z1 - z0 - 2 * rc, arc = Math.PI / 2 * rc;
  const L = 2 * lx + 2 * lz + 4 * arc;
  let s = (p.s0 + p.sp * t) % L; if (s < 0) s += L;
  if (p.dir < 0) s = L - s;   // против часовой — та же дорожка задом наперёд
  let x, z, a;
  const seg = [lx, arc, lz, arc, lx, arc, lz, arc];
  let k = 0; while (k < 7 && s > seg[k]) { s -= seg[k]; k++; }
  const th = Math.min(s / rc, Math.PI / 2);
  switch (k) {
    case 0: x = x0 + rc + s; z = z0; a = 0; break;
    case 1: x = x1 - rc + Math.sin(th) * rc; z = z0 + rc - Math.cos(th) * rc; a = th; break;
    case 2: x = x1; z = z0 + rc + s; a = Math.PI / 2; break;
    case 3: x = x1 - rc + Math.cos(th) * rc; z = z1 - rc + Math.sin(th) * rc; a = Math.PI / 2 + th; break;
    case 4: x = x1 - rc - s; z = z1; a = Math.PI; break;
    case 5: x = x0 + rc - Math.sin(th) * rc; z = z1 - rc + Math.cos(th) * rc; a = Math.PI + th; break;
    case 6: x = x0; z = z1 - rc - s; a = -Math.PI / 2; break;
    default: x = x0 + rc - Math.cos(th) * rc; z = z0 + rc - Math.sin(th) * rc; a = -Math.PI / 2 + th;
  }
  if (p.dir < 0) a += Math.PI;
  out.x = x; out.z = z; out.ry = -a;   // a — курс в плоскости xz (0 = +x, по часовой), rotation.y = -a
  return out;
}
export function circPos(p, t, out) {
  const th = p.ph + p.w * t;
  out.x = p.cx + Math.cos(th) * p.rr; out.z = p.cz + Math.sin(th) * p.rr;
  const a = th + (p.w > 0 ? Math.PI / 2 : -Math.PI / 2);
  out.ry = -a; return out;
}

// ---------- генерация города ----------
const CAR_COLS = [0xef4444, 0x3b82f6, 0xfacc15, 0xf8fafc, 0x14b8a6, 0xfb923c, 0xf472b6, 0x6ee7b7, 0xa78bfa, 0x475569, 0x22c55e];
const SHIRT = [0xef4444, 0x3b82f6, 0xfacc15, 0x22c55e, 0xf472b6, 0xa855f7, 0xfb923c, 0x06b6d4, 0xffffff, 0x84cc16];
const WALL = [0xfde68a, 0xfbcfe8, 0xbfdbfe, 0xbbf7d0, 0xfed7aa, 0xe9d5ff, 0xfecaca, 0xf5f0e6, 0xa7f3d0];
const TOWER = [0xe2e8f0, 0xcbd5e1, 0xfde68a, 0xc7d2fe, 0xfbcfe8, 0xbae6fd];
const SHOP = [0xfca5a5, 0x93c5fd, 0x86efac, 0xfcd34d, 0xf9a8d4, 0xc4b5fd];
const GREEN = [0x4ade80, 0x22c55e, 0x65c23a, 0x84cc16, 0x34d27a, 0x9be15d];
const PINE = [0x15803d, 0x16a34a, 0x2f9e44];
const BENCH = [0xc2703d, 0xb45309, 0xdc2626, 0x2563eb, 0x0d9488];
const FLOWER = [0xff6fa8, 0xffd43b, 0xff8787, 0xda77f2, 0xffffff];
const BIN = [0x22a35a, 0x2563eb, 0x6b7280];
const DOG = [0xf4d3a1, 0xc08552, 0xffffff, 0x7a5232];

export function genCity(seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
  const objs = [], blocks = [];
  const add = (type, x, z, ry, col, sc, mv) => { objs.push({ t: TI[type], x, z, ry: ry || 0, col, sc: sc || 1, mv: mv || null }); };
  const kinds = ["park", "park", "park", "park", "parking", "parking", "parking", "down", "down", "down", "down", "down", "plaza"];
  while (kinds.length < NB * NB - 1) kinds.push("res");
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  let ki = 0;
  for (let bj = 0; bj < NB; bj++) for (let bi = 0; bi < NB; bi++) {
    const kind = bi === 2 && bj === 2 ? "plaza" : kinds[ki++];
    const x0 = ROAD + bi * PER, z0 = ROAD + bj * PER, x1 = x0 + BLK, z1 = z0 + BLK, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const B = { kind, x0, z0, x1, z1, fountain: false }; blocks.push(B);
    // тротуар: фонари, деревья, гидранты, урны, скамейки
    for (let e = 0; e < 4; e++) {
      const P = (u, d) => e === 0 ? [x0 + u, z0 + d] : e === 1 ? [x1 - d, z0 + u] : e === 2 ? [x1 - u, z1 - d] : [x0 + d, z1 - u];
      const face = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][e];   // скамейка спиной к кварталу
      for (const u of [3.5, 11, 18.5]) { const [x, z] = P(u, 0.45); add("lamp", x, z, face + Math.PI / 2, 0xffffff); }
      for (const u of [7.2, 14.8]) { if (r() < 0.75) { const [x, z] = P(u + (r() - 0.5), 1.1); add("tree", x, z, r() * 6.28, pick(GREEN), 0.8 + r() * 0.25); } }
      if (r() < 0.4) { const [x, z] = P(5.3, 0.5); add("hydrant", x, z, r() * 6, 0xe03131); }
      if (r() < 0.55) { const [x, z] = P(13, 0.5); add("bin", x, z, r() * 6, pick(BIN)); }
      if (r() < 0.45) { const [x, z] = P(9.2, 1.55); add("bench", x, z, face, pick(BENCH)); }
      if (r() < 0.3) { const [x, z] = P(16.6, 0.5); add("cone", x, z, r() * 6, 0xffffff); }
    }
    // светофоры по углам у перекрёстков
    if (r() < 0.6) add("tlight", x0 + 0.5, z0 + 0.5, 0, 0xffffff);
    if (r() < 0.6) add("tlight", x1 - 0.5, z1 - 0.5, Math.PI, 0xffffff);
    // пешеходы гуляют по тротуару
    const walkers = 2 + Math.floor(r() * 3);
    for (let k = 0; k < walkers; k++) {
      const mv = { k: "loop", r: [x0 + 1.25, z0 + 1.25, x1 - 1.25, z1 - 1.25, 1.2], s0: r() * 80, sp: 1.0 + r() * 0.6, dir: r() < 0.5 ? 1 : -1, bob: r() * 6 };
      if (r() < 0.12) add("dog", 0, 0, 0, pick(DOG), 1, Object.assign({}, mv, { sp: mv.sp * 1.15 }));
      else add("person", 0, 0, 0, pick(SHIRT), 0.95 + r() * 0.15, mv);
    }
    // машины по кругу вокруг квартала (своя полоса — пути разных кварталов не пересекаются)
    const nCars = r() < 0.2 ? 0 : r() < 0.6 ? 1 : 2, sp = 5 + r() * 2;
    const loopR = [x0 - 2, z0 - 2, x1 + 2, z1 + 2, 3.5], Lp = 4 * (BLK + 4 - 7) + 4 * Math.PI / 2 * 3.5, s00 = r() * Lp;
    for (let k = 0; k < nCars; k++) {
      const roll = r(), type = roll < 0.13 ? "bus" : roll < 0.25 ? "truck" : "car";
      add(type, 0, 0, 0, type === "bus" ? pick([0xfacc15, 0xef4444, 0x3b82f6, 0x22c55e]) : pick(CAR_COLS), 1, { k: "loop", r: loopR, s0: s00 + k * Lp / nCars, sp, dir: 1, car: 1 });
    }
    const ix0 = x0 + 2.5, iz0 = z0 + 2.5, iw = BLK - 5;
    const scatter = (n, minD, fn, pts) => {
      pts = pts || [];
      for (let k = 0, tries = 0; k < n && tries < n * 25; tries++) {
        const x = ix0 + 0.6 + r() * (iw - 1.2), z = iz0 + 0.6 + r() * (iw - 1.2);
        if (pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < minD + p[2])) continue;
        pts.push([x, z, minD * 0.5]); fn(x, z); k++;
      }
      return pts;
    };
    const wander = (n, cx2, cz2, rad) => {
      for (let k = 0; k < n; k++) {
        const mv = { k: "circ", cx: cx2 + (r() - 0.5) * rad, cz: cz2 + (r() - 0.5) * rad, rr: 0.8 + r() * 2.2, ph: r() * 6.28, w: (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.35), bob: r() * 6 };
        if (r() < 0.15) add("dog", 0, 0, 0, pick(DOG), 1, mv); else add("person", 0, 0, 0, pick(SHIRT), 0.95 + r() * 0.15, mv);
      }
    };
    if (kind === "res") {
      const pts = [];
      for (let q = 0; q < 4; q++) {
        const hx = ix0 + 4.25 + (q % 2) * 8.5, hz = iz0 + 4.25 + Math.floor(q / 2) * 8.5;
        if (r() < 0.82) {
          const tp = r() < 0.5 ? "house" : "house2", face = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(r() * 4)];
          add(tp, hx, hz, face, pick(WALL)); pts.push([hx, hz, 3.4]);
        } else { for (let k = 0; k < 3; k++) { const x = hx + (r() - 0.5) * 5, z = hz + (r() - 0.5) * 5; add(r() < 0.5 ? "tree" : "pine", x, z, r() * 6, pick(r() < 0.5 ? GREEN : PINE), 0.8 + r() * 0.3); pts.push([x, z, 1]); } }
      }
      scatter(6, 1.2, (x, z) => add("bush", x, z, r() * 6, pick(GREEN), 0.8 + r() * 0.4), pts);
      scatter(2, 2.2, (x, z) => add("car", x, z, r() < 0.5 ? 0 : Math.PI / 2, pick(CAR_COLS)), pts);
      scatter(1, 1, (x, z) => add("dog", x, z, r() * 6, pick(DOG)), pts);
      wander(2, cx, cz, 6);
    } else if (kind === "park") {
      const pts = [];
      if (r() < 0.5) { add("fountain", cx, cz, 0, 0xffffff); pts.push([cx, cz, 3]); B.fountain = true; }
      else { add("planter", cx, cz, 0, pick(FLOWER)); pts.push([cx, cz, 1.2]); }
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, x = cx + Math.cos(a) * 4.2, z = cz + Math.sin(a) * 4.2; add("bench", x, z, -a - Math.PI / 2, pick(BENCH)); pts.push([x, z, 1]); }
      scatter(9, 2.6, (x, z) => add(r() < 0.7 ? "tree" : "pine", x, z, r() * 6, r() < 0.7 ? pick(GREEN) : pick(PINE), 0.85 + r() * 0.35), pts);
      scatter(7, 1.0, (x, z) => add("bush", x, z, r() * 6, pick(GREEN), 0.7 + r() * 0.5), pts);
      scatter(2, 1.0, (x, z) => add("planter", x, z, 0, pick(FLOWER)), pts);
      wander(6, cx, cz, 10);
      for (let k = 0; k < 3; k++) add("person", cx + (r() - 0.5) * 12, cz + (r() - 0.5) * 12, r() * 6, pick(SHIRT));
    } else if (kind === "plaza") {
      add("fountain", cx, cz, 0, 0xffffff); B.fountain = true;
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, x = cx + Math.cos(a) * 5.2, z = cz + Math.sin(a) * 5.2; add("bench", x, z, -a - Math.PI / 2, pick(BENCH)); }
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add("planter", cx + dx * 7.3, cz + dz * 7.3, 0, pick(FLOWER));
      add("kiosk", cx - 7, cz, Math.PI / 2, pick(SHOP)); add("kiosk", cx + 7, cz, -Math.PI / 2, pick(SHOP));
      for (const [dx, dz] of [[0, -1], [0, 1]]) add("lamp", cx + dx * 7, cz + dz * 7.5, 0, 0xffffff);
      wander(9, cx, cz, 13);
      for (let k = 0; k < 5; k++) add("person", cx + (r() - 0.5) * 14, cz + (r() - 0.5) * 14, r() * 6, pick(SHIRT));
      add("dog", cx + 3, cz - 6, 1, pick(DOG));
    } else if (kind === "parking") {
      for (const row of [0, 1]) {
        const z = row ? iz0 + iw - 2.6 : iz0 + 2.6;
        for (let k = 0; k < 6; k++) { if (r() < 0.78) { const x = ix0 + 1.4 + k * 2.85; add(r() < 0.12 ? "truck" : "car", x + (r() - 0.5) * 0.2, z, (row ? -1 : 1) * Math.PI / 2 + (r() - 0.5) * 0.08, pick(CAR_COLS)); } }
      }
      for (let k = 0; k < 4; k++) add("cone", ix0 + 2 + r() * (iw - 4), cz + (r() - 0.5) * 3, 0, 0xffffff);
      if (r() < 0.6) add("kiosk", cx, cz, r() < 0.5 ? 0 : Math.PI, pick(SHOP)); else add("bus", cx, cz, 0, pick([0xfacc15, 0xef4444, 0x3b82f6]));
      wander(2, cx, cz, 4);
    } else {   // деловой квартал: небоскрёб + магазины
      const v = r();
      if (v < 0.45) {
        add("tower", cx, cz, Math.floor(r() * 4) * Math.PI / 2, pick(TOWER));
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(r() < 0.5 ? "tree" : "planter", cx + dx * 6.6, cz + dz * 6.6, r() * 6, pick(GREEN));
        for (let k = 0; k < 2; k++) add("bench", cx + (k ? 6.6 : -6.6), cz, k ? -Math.PI / 2 : Math.PI / 2, pick(BENCH));
      } else if (v < 0.8) {
        const sx = r() < 0.5 ? -1 : 1;
        add("tower", cx + sx * 4.2, cz - 3.5, 0, pick(TOWER));
        add("shop", cx - sx * 4.4, cz + 4.4, Math.PI * (r() < 0.5 ? 0 : 1) + (sx > 0 ? Math.PI / 2 : -Math.PI / 2), pick(SHOP));
        add("kiosk", cx + sx * 4.2, cz + 5.2, 0, pick(SHOP)); add("tree", cx - sx * 5.5, cz - 5.5, 0, pick(GREEN));
        add("bench", cx + sx * 1.2, cz + 5.5, 0, pick(BENCH));
      } else {
        add("shop", cx - 4.2, cz - 4.2, 0, pick(SHOP)); add("shop", cx + 4.2, cz + 4.2, Math.PI, pick(SHOP));
        add("kiosk", cx + 4.5, cz - 4.5, 0, pick(SHOP)); add("tree", cx - 5, cz + 5, 0, pick(GREEN)); add("planter", cx, cz, 0, pick(FLOWER));
      }
      wander(3, cx, cz, 10);
    }
  }
  // за краем карты — деревья и кусты (до них можно дотянуться только очень большой дырой)
  for (let k = 0; k < 90; k++) {
    const side = k % 4, u = r() * (M + 20) - 10, d = -3 - r() * 14;
    const x = side === 0 ? u : side === 1 ? M - d : side === 2 ? u : d, z = side === 0 ? d : side === 1 ? u : side === 2 ? M - d : u;
    add(r() < 0.5 ? "pine" : "tree", x, z, r() * 6, r() < 0.5 ? pick(PINE) : pick(GREEN), 0.9 + r() * 0.5);
  }
  return { objs, blocks };
}

// ---------- земля: одна текстура на весь город ----------
export function paintGround(blocks, size) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const g = cv.getContext("2d"), k = size / M;
  const R = (x, z, w, h, c) => { g.fillStyle = c; g.fillRect(x * k, z * k, w * k, h * k); };
  R(0, 0, M, M, "#5d6577");
  // разметка: прерывистая по центру дорог
  g.fillStyle = "#f8f4e6";
  for (let i = 0; i <= NB; i++) {
    const c = i * PER + ROAD / 2;
    for (let j = 0; j < NB; j++) {
      const a = ROAD + j * PER;
      for (let u = a + 1.5; u < a + BLK - 1.5; u += 3) { R(c - 0.09, u, 0.18, 1.6, "#f4efe0"); R(u, c - 0.09, 1.6, 0.18, "#f4efe0"); }
    }
  }
  // зебры у перекрёстков
  for (let i = 0; i <= NB; i++) for (let j = 0; j <= NB; j++) {
    const ix = i * PER, iz = j * PER;
    for (let s = 0; s < 6; s++) {
      const u = 0.9 + s * 1.1;
      if (j < NB) { R(ix + u, iz + ROAD + 0.3, 0.6, 2.2, "#eef0f2"); }
      if (i < NB) { R(ix + ROAD + 0.3, iz + u, 2.2, 0.6, "#eef0f2"); }
    }
  }
  for (const b of blocks) {
    const { x0, z0 } = b;
    // бордюр и тротуар
    R(x0 - 0.18, z0 - 0.18, BLK + 0.36, BLK + 0.36, "#c9c1b0");
    R(x0, z0, BLK, BLK, "#ece5d6");
    g.strokeStyle = "rgba(160,145,120,.25)"; g.lineWidth = Math.max(1, k * 0.05);
    for (let u = 1; u < BLK; u += 1.5) { g.beginPath(); g.moveTo((x0 + u) * k, z0 * k); g.lineTo((x0 + u) * k, (z0 + 2) * k); g.moveTo((x0 + u) * k, (z0 + BLK - 2) * k); g.lineTo((x0 + u) * k, (z0 + BLK) * k); g.moveTo(x0 * k, (z0 + u) * k); g.lineTo((x0 + 2) * k, (z0 + u) * k); g.moveTo((x0 + BLK - 2) * k, (z0 + u) * k); g.lineTo((x0 + BLK) * k, (z0 + u) * k); g.stroke(); }
    const ix = x0 + 2, iz = z0 + 2, iw = BLK - 4, cx = x0 + BLK / 2, cz = z0 + BLK / 2;
    if (b.kind === "park" || b.kind === "res") {
      R(ix, iz, iw, iw, b.kind === "park" ? "#8fd46c" : "#9cdc7c");
      for (let s = 0; s < iw; s += 2) R(ix + s, iz, 1, iw, "rgba(255,255,255,.06)");
      g.strokeStyle = "#f2dfb8"; g.lineWidth = 1.3 * k; g.lineCap = "round";
      if (b.kind === "park") {
        g.beginPath(); g.moveTo(ix * k, iz * k); g.lineTo((ix + iw) * k, (iz + iw) * k); g.moveTo((ix + iw) * k, iz * k); g.lineTo(ix * k, (iz + iw) * k); g.stroke();
        g.beginPath(); g.arc(cx * k, cz * k, 4.2 * k, 0, 7); g.stroke();
        g.fillStyle = "#f2dfb8"; g.beginPath(); g.arc(cx * k, cz * k, 3.1 * k, 0, 7); g.fill();
      } else {
        g.beginPath(); g.moveTo(cx * k, iz * k); g.lineTo(cx * k, (iz + iw) * k); g.moveTo(ix * k, cz * k); g.lineTo((ix + iw) * k, cz * k); g.stroke();
      }
    } else if (b.kind === "plaza") {
      R(ix, iz, iw, iw, "#f3cda6");
      for (let a = 0; a < iw; a += 1.5) for (let c = 0; c < iw; c += 1.5) if (((a + c) / 1.5) % 2 === 0) R(ix + a, iz + c, 1.5, 1.5, "#eebf93");
      g.fillStyle = "#e6dccb"; g.beginPath(); g.arc(cx * k, cz * k, 3.2 * k, 0, 7); g.fill();
      g.strokeStyle = "#d99c6a"; g.lineWidth = 0.35 * k; g.beginPath(); g.arc(cx * k, cz * k, 6.4 * k, 0, 7); g.stroke();
    } else if (b.kind === "parking") {
      R(ix, iz, iw, iw, "#6c7486");
      g.strokeStyle = "#f4f4f4"; g.lineWidth = 0.14 * k;
      for (const row of [0, 1]) { const z = row ? iz + iw - 5.2 : iz; for (let s = 0; s <= 6; s++) { const x = ix + 0.5 + 0.08 + s * 2.85 - 0.08; g.beginPath(); g.moveTo(x * k, z * k); g.lineTo(x * k, (z + 5.2) * k); g.stroke(); } }
      R(ix + 1, cz - 0.08, iw - 2, 0.16, "#ffd43b");
    } else {
      R(ix, iz, iw, iw, "#ddd6cb");
      for (let a = 0; a < iw; a += 2) { R(ix + a, iz, 0.06, iw, "rgba(120,110,95,.18)"); R(ix, iz + a, iw, 0.06, "rgba(120,110,95,.18)"); }
    }
  }
  return cv;
}
