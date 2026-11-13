// «Промысел» — вся графика собрана кодом из простых фигур (свой стиль: пухлый низкополигональный север).
// Каждая модель — одна геометрия с цветами в вершинах. У одежды есть «маска»: её красим цветом конкретного человека.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), EU = new THREE.Euler(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const C = new THREE.Color();
function hash(n) { const s = Math.sin(n * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); }

// построитель: складываем фигуры, потом сливаем в одну геометрию
export class Build {
  constructor() { this.parts = []; this.seed = 1; }
  add(g, col, o) {
    o = o || {};
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
    EU.set((o.r && o.r[0]) || 0, (o.r && o.r[1]) || 0, (o.r && o.r[2]) || 0);
    Q.setFromEuler(EU);
    const s = o.s == null ? [1, 1, 1] : typeof o.s === "number" ? [o.s, o.s, o.s] : o.s;
    M4.compose(V1.set(...(o.p || [0, 0, 0])), Q, V2.set(s[0], s[1], s[2]));
    g.applyMatrix4(M4);
    const n = g.attributes.position.count, cols = new Float32Array(n * 3), mask = new Float32Array(n * 2);
    C.set(col);
    const jit = o.jit == null ? 0.07 : o.jit;
    for (let i = 0; i < n; i += 3) {
      const k = 1 + (hash(this.seed++ * 1.37 + i) - 0.5) * jit * 2;
      for (let j = 0; j < 3; j++) { cols[(i + j) * 3] = C.r * k; cols[(i + j) * 3 + 1] = C.g * k; cols[(i + j) * 3 + 2] = C.b * k; mask[(i + j) * 2] = o.coat ? 1 : 0; mask[(i + j) * 2 + 1] = o.hat ? 1 : 0; }
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.setAttribute("aMask", new THREE.BufferAttribute(mask, 2));
    this.parts.push(g);
    return this;
  }
  box(w, h, d, col, o) { return this.add(new THREE.BoxGeometry(w, h, d), col, o); }
  cyl(rt, rb, h, seg, col, o) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg || 8), col, o); }
  cone(r, h, seg, col, o) { return this.add(new THREE.ConeGeometry(r, h, seg || 7), col, o); }
  sph(r, det, col, o) { return this.add(new THREE.IcosahedronGeometry(r, det || 0), col, o); }
  ball(r, col, o) { return this.add(new THREE.SphereGeometry(r, r < 0.06 ? 5 : 8, r < 0.06 ? 4 : 6), col, o); }
  geo() { const g = mergeGeometries(this.parts, false); g.computeVertexNormals(); g.computeBoundingSphere(); return g; }
}

/* ---------- палитра ---------- */
export const PAL = {
  snow: "#eef4f8", snow2: "#dfe9f1", shade: "#c9d8e6", ice: "#bfe6f5", wood: "#9a6a42", wood2: "#7c5233", woodL: "#c08a58", plank: "#b48256",
  roofR: "#b8473b", roofB: "#3f6f8f", roofG: "#4f7d5a", stone: "#8d96a0", stone2: "#6f7983", dark: "#3b3f46", metal: "#aab4bd", rope: "#d8c49a",
  pine: "#2f6b4f", pine2: "#3d7d5c", trunk: "#6b4a2f", skin: "#f1c7a5", fur: "#f4ece0", boot: "#4a3b33", glove: "#5a4a40",
  cash: "#6fc37a", cash2: "#4ea65c", gold: "#f2c14e",
};

/* ---------- люди ---------- */
// туловище (парка с капюшоном, лицо, шапка); ноги и руки — отдельно (анимируются)
export function torsoGeo() {
  const b = new Build();
  b.cyl(0.25, 0.3, 0.52, 9, "#ffffff", { p: [0, 0.62, 0], coat: 1 });                 // парка
  b.cyl(0.3, 0.31, 0.08, 9, "#ffffff", { p: [0, 0.38, 0], coat: 1, s: [1, 1, 1] });     // низ парки
  b.cyl(0.255, 0.255, 0.05, 9, PAL.fur, { p: [0, 0.35, 0], jit: 0.03 });               // опушка снизу
  b.box(0.06, 0.4, 0.04, "#e8e2d8", { p: [0, 0.6, 0.27], jit: 0.02, coat: 0 });       // молния-планка
  b.ball(0.235, PAL.skin, { p: [0, 1.05, 0.02], s: [1, 0.95, 0.95], jit: 0.02 });       // голова
  b.cyl(0.25, 0.27, 0.1, 10, PAL.fur, { p: [0, 0.9, 0], jit: 0.03 });                  // меховой воротник
  b.ball(0.245, "#ffffff", { p: [0, 1.18, -0.01], s: [1.02, 0.7, 1.0], hat: 1 });       // шапка
  b.cyl(0.25, 0.26, 0.07, 10, "#ffffff", { p: [0, 1.11, 0], hat: 1, s: [1, 1, 1] });   // отворот шапки
  b.ball(0.08, PAL.fur, { p: [0, 1.38, -0.02], jit: 0.04 });                           // помпон
  b.ball(0.03, "#2b2622", { p: [-0.085, 1.07, 0.215], jit: 0 }); b.ball(0.03, "#2b2622", { p: [0.085, 1.07, 0.215], jit: 0 });   // глаза
  b.ball(0.04, "#f39a86", { p: [-0.14, 1.0, 0.19], s: [1, 0.6, 0.4], jit: 0 }); b.ball(0.04, "#f39a86", { p: [0.14, 1.0, 0.19], s: [1, 0.6, 0.4], jit: 0 });   // румянец
  b.ball(0.028, "#e9a184", { p: [0, 1.02, 0.235], jit: 0 });                            // нос
  return b.geo();
}
export function legGeo() { const b = new Build(); b.cyl(0.085, 0.09, 0.26, 7, "#3c4452", { p: [0, -0.13, 0] }); b.box(0.15, 0.12, 0.22, PAL.boot, { p: [0, -0.3, 0.035] }); return b.geo(); }
export function armGeo() { const b = new Build(); b.cyl(0.075, 0.085, 0.36, 7, "#ffffff", { p: [0, -0.16, 0], coat: 1 }); b.ball(0.08, PAL.glove, { p: [0, -0.36, 0] }); return b.geo(); }
// короб за спиной (на нём растёт стопка)
export function packGeo() { const b = new Build(); b.box(0.42, 0.06, 0.34, PAL.wood2, { p: [0, 0, 0] }); b.box(0.05, 0.5, 0.05, PAL.wood, { p: [-0.19, 0.2, -0.15] }); b.box(0.05, 0.5, 0.05, PAL.wood, { p: [0.19, 0.2, -0.15] }); b.box(0.42, 0.05, 0.05, PAL.wood, { p: [0, 0.42, -0.15] }); return b.geo(); }

/* ---------- товары (центр — на дне предмета) ---------- */
function fishB(b, body, belly, fin, len, h, y) {
  b.sph(0.5, 1, body, { p: [0, y, 0], s: [len * 0.42, h, h * 0.62] });
  b.sph(0.5, 1, belly, { p: [0.02, y - h * 0.18, 0], s: [len * 0.34, h * 0.6, h * 0.5] });
  b.cone(h * 0.5, len * 0.3, 4, fin, { p: [-len * 0.42, y, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.35] });
  b.cone(h * 0.25, len * 0.16, 3, fin, { p: [0, y + h * 0.45, 0], r: [0, 0, 0], s: [1.3, 1, 0.3] });
  b.ball(h * 0.09, "#1d2228", { p: [len * 0.3, y + h * 0.08, h * 0.27], jit: 0 }); b.ball(h * 0.09, "#1d2228", { p: [len * 0.3, y + h * 0.08, -h * 0.27], jit: 0 });
}
export const ITEM_GEO = {
  herring: () => { const b = new Build(); fishB(b, "#7fa3bd", "#dfe9ef", "#5d7f99", 0.62, 0.2, 0.1); return b.geo(); },
  fillet: () => { const b = new Build(); b.box(0.46, 0.12, 0.26, "#f5937a", { p: [0, 0.06, 0] }); for (let i = -1; i <= 1; i++) b.box(0.03, 0.125, 0.27, "#ffe1d4", { p: [i * 0.12, 0.062, 0], r: [0, 0.35, 0], jit: 0 }); b.box(0.46, 0.04, 0.26, "#d9785e", { p: [0, 0.01, 0] }); return b.geo(); },
  log: () => { const b = new Build(); b.cyl(0.11, 0.11, 0.56, 7, PAL.wood, { p: [0, 0.11, 0], r: [0, 0, Math.PI / 2] }); b.cyl(0.085, 0.085, 0.565, 7, "#e3c08f", { p: [0, 0.11, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 1] }); b.cyl(0.11, 0.11, 0.5, 7, PAL.wood, { p: [0, 0.11, 0], r: [0, 0, Math.PI / 2] }); return b.geo(); },
  smoked: () => { const b = new Build(); fishB(b, "#c77a35", "#e7b06a", "#8a4f22", 0.6, 0.21, 0.105); b.box(0.02, 0.24, 0.02, PAL.rope, { p: [-0.18, 0.22, 0], jit: 0 }); return b.geo(); },
  salmon: () => { const b = new Build(); fishB(b, "#9aaebb", "#f2b7a2", "#6d8394", 0.78, 0.25, 0.125); b.sph(0.5, 1, "#e8876e", { p: [0.05, 0.08, 0], s: [0.2, 0.06, 0.14] }); return b.geo(); },
  steak: () => { const b = new Build(); b.cyl(0.2, 0.2, 0.13, 9, "#ff8a62", { p: [0, 0.065, 0], s: [1.25, 1, 0.9] }); for (let i = -1; i <= 1; i++) b.box(0.4, 0.135, 0.025, "#ffd2bd", { p: [0, 0.067, i * 0.08], r: [0, 0.4, 0], jit: 0 }); b.cyl(0.07, 0.07, 0.14, 6, "#cfd6db", { p: [0.02, 0.07, 0], jit: 0 }); return b.geo(); },
  caviar: () => { const b = new Build(); b.cyl(0.13, 0.13, 0.2, 10, "#ff6a3d", { p: [0, 0.1, 0] }); b.cyl(0.135, 0.135, 0.06, 10, "#ffffff", { p: [0, 0.12, 0], jit: 0.02 }); b.cyl(0.14, 0.14, 0.05, 10, "#d7b04a", { p: [0, 0.225, 0] }); b.cyl(0.1, 0.1, 0.03, 10, "#f0cf6a", { p: [0, 0.25, 0] }); return b.geo(); },
  can: () => { const b = new Build(); b.cyl(0.13, 0.13, 0.2, 10, "#c9d2da", { p: [0, 0.1, 0] }); b.cyl(0.133, 0.133, 0.12, 10, "#3b78b5", { p: [0, 0.1, 0] }); b.cyl(0.06, 0.06, 0.122, 6, "#f2d36b", { p: [0.08, 0.1, 0.06], s: [1, 1, 1] }); return b.geo(); },
  ice: () => { const b = new Build(); b.box(0.32, 0.28, 0.32, "#c7ecfb", { p: [0, 0.14, 0], jit: 0.12 }); b.box(0.2, 0.06, 0.2, "#ffffff", { p: [0.03, 0.28, 0.02], jit: 0.05 }); return b.geo(); },
  crate: () => { const b = new Build(); b.box(0.5, 0.3, 0.38, PAL.woodL, { p: [0, 0.15, 0] }); for (const y of [0.05, 0.25]) b.box(0.52, 0.04, 0.4, PAL.wood2, { p: [0, y, 0], jit: 0 }); b.box(0.42, 0.06, 0.3, "#cdeffd", { p: [0, 0.32, 0], jit: 0.15 }); fishB(b, "#9aaebb", "#f2b7a2", "#6d8394", 0.42, 0.12, 0.36); return b.geo(); },
  cash: () => { const b = new Build(); b.box(0.42, 0.1, 0.22, PAL.cash, { p: [0, 0.05, 0], jit: 0.04 }); b.box(0.43, 0.02, 0.23, PAL.cash2, { p: [0, 0.1, 0], jit: 0 }); b.box(0.08, 0.104, 0.225, "#f4f0d8", { p: [0, 0.05, 0], jit: 0 }); return b.geo(); },
};
export const ITEM_H = { herring: 0.2, fillet: 0.13, log: 0.22, smoked: 0.21, salmon: 0.25, steak: 0.14, caviar: 0.26, can: 0.2, ice: 0.3, crate: 0.36, cash: 0.1 };

// рыба для косяка в воде (лёгкая)
export function schoolFishGeo(salmon) {
  const b = new Build();
  b.sph(0.5, 1, salmon ? "#e08a6e" : "#7fb0cf", { p: [0, 0, 0], s: [0.36, 0.13, 0.1] });
  b.sph(0.5, 1, salmon ? "#f6c0aa" : "#d9eef8", { p: [0.02, -0.02, 0], s: [0.28, 0.08, 0.09] });
  b.cone(0.07, 0.14, 3, salmon ? "#b8664f" : "#4f80a0", { p: [-0.22, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.4] });
  b.cone(0.04, 0.08, 3, salmon ? "#b8664f" : "#4f80a0", { p: [0.0, 0.07, 0], s: [1.4, 1, 0.3] });
  return b.geo();
}

/* ---------- природа ---------- */
// ель под снегом: пухлые ярусы, сверху почти белые, снизу — сине-зелёная тень
export function pineGeo(v) {
  const b = new Build();
  b.cyl(0.13, 0.17, 0.6, 7, "#8a5a3c", { p: [0, 0.3, 0] });
  const lv = v ? 4 : 3;
  for (let i = 0; i < lv; i++) {
    const r = 1.15 - i * 0.26, y = 0.5 + i * 0.55;
    b.cone(r, 0.9, 8, i % 2 ? "#4f7f86" : "#47757f", { p: [0, y + 0.42, 0], r: [0, i * 0.4, 0], jit: 0.05 });
    b.cone(r * 0.94, 0.62, 8, i % 2 ? "#e8f0f8" : "#dde8f4", { p: [0, y + 0.66, 0], r: [0, i * 0.4, 0], jit: 0.04 });
  }
  b.sph(0.12, 1, "#eef4fa", { p: [0, 0.5 + lv * 0.55 + 0.32, 0], s: [1, 0.8, 1], jit: 0.02 });
  return b.geo();
}
export function rockGeo() { const b = new Build(); b.sph(0.55, 0, PAL.stone, { p: [0, 0.22, 0], s: [1.2, 0.7, 1] }); b.sph(0.45, 0, PAL.snow, { p: [0.05, 0.42, 0], s: [1.05, 0.35, 0.9], jit: 0.03 }); return b.geo(); }
export function driftGeo() { const b = new Build(); b.sph(0.6, 1, PAL.snow, { p: [0, 0, 0], s: [1.3, 0.45, 1], jit: 0.04 }); return b.geo(); }
// частокол: плотные круглые брёвна со скруглёнными верхушками и шапкой снега
export function fenceGeo(len, h) {
  const b = new Build(); h = h || 0.85;
  const n = Math.max(1, Math.round(len / 0.27));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n, hh = h * (0.92 + ((i * 37) % 7) * 0.02), c = i % 2 ? "#c9774a" : "#bb6b42";
    b.cyl(0.13, 0.135, hh, 8, c, { p: [x, hh / 2, 0], jit: 0.04 });
    b.add(new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), "#d98c5c", { p: [x, hh, 0], s: [1, 0.55, 1], jit: 0.03 });
    b.add(new THREE.SphereGeometry(0.11, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), PAL.snow, { p: [x, hh + 0.04, 0], s: [1, 0.45, 1], jit: 0.02 });
  }
  return b.geo();
}
export function lampGeo() { const b = new Build(); b.cyl(0.05, 0.06, 1.7, 6, PAL.dark, { p: [0, 0.85, 0] }); b.box(0.22, 0.24, 0.22, "#ffd98a", { p: [0, 1.8, 0], jit: 0 }); b.cone(0.2, 0.16, 4, PAL.dark, { p: [0, 2.0, 0], r: [0, Math.PI / 4, 0] }); b.cone(0.16, 0.08, 4, PAL.snow, { p: [0, 2.07, 0], r: [0, Math.PI / 4, 0], jit: 0.02 }); return b.geo(); }

/* ---------- постройки ---------- */
function roof(b, w, d, h, col, y, o) {
  o = o || {};
  const g = new THREE.CylinderGeometry(0.0001, 0.70710678, 1, 4, 1); g.rotateY(Math.PI / 4);
  b.add(g, col, { p: [0, y + h / 2, 0], s: [w * 1.0, h, d * 1.0] });
  b.add(new THREE.CylinderGeometry(0.0001, 0.70710678, 1, 4, 1).rotateY(Math.PI / 4), PAL.snow, { p: [0, y + h * 0.62, 0], s: [w * 0.82, h * 0.78, d * 0.82], jit: 0.03 });
  if (o.eave) b.box(w * 0.98, 0.06, d * 0.98, PAL.wood2, { p: [0, y + 0.02, 0] });
}
function gable(b, w, d, h, col, y) {
  // двускатная крыша вдоль x
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI);
  b.add(g, col, { p: [0, y + h * 0.25, 0], s: [w, h, d * 1.15], r: [0, 0, 0] });
  const s = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1); s.rotateZ(Math.PI / 2); s.rotateX(Math.PI);
  b.add(s, PAL.snow, { p: [0, y + h * 0.36, 0], s: [w * 1.02, h * 0.8, d * 1.0], jit: 0.03 });
}
function logWall(b, w, h, d, col) {
  const n = Math.round(h / 0.2);
  for (let i = 0; i < n; i++) {
    const y = 0.1 + i * 0.2;
    b.cyl(0.11, 0.11, w + 0.2, 6, i % 2 ? col : PAL.wood2, { p: [0, y, -d / 2], r: [0, 0, Math.PI / 2] });
    b.cyl(0.11, 0.11, w + 0.2, 6, i % 2 ? col : PAL.wood2, { p: [0, y, d / 2], r: [0, 0, Math.PI / 2] });
    b.cyl(0.11, 0.11, d + 0.2, 6, i % 2 ? PAL.wood2 : col, { p: [-w / 2, y + 0.1, 0], r: [Math.PI / 2, 0, 0] });
    b.cyl(0.11, 0.11, d + 0.2, 6, i % 2 ? PAL.wood2 : col, { p: [w / 2, y + 0.1, 0], r: [Math.PI / 2, 0, 0] });
  }
  b.box(w, h, d, col, { p: [0, h / 2, 0] });
}
// w, d — размер места на карте
export const BUILD = {
  table: (w, d) => { const b = new Build(); b.box(w, 0.12, d, PAL.woodL, { p: [0, 0.78, 0] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, 0.78, 0.12, PAL.wood2, { p: [sx * (w / 2 - 0.15), 0.39, sz * (d / 2 - 0.12)] });
    b.box(w * 0.42, 0.06, d * 0.6, "#e9d6b4", { p: [-w * 0.18, 0.87, 0] }); b.box(0.36, 0.03, 0.07, PAL.metal, { p: [-w * 0.12, 0.915, 0.12], r: [0, 0.4, 0], jit: 0 }); b.box(0.12, 0.04, 0.05, PAL.dark, { p: [-w * 0.26, 0.915, 0.04], r: [0, 0.4, 0] });
    b.box(w * 0.98, 0.04, 0.08, PAL.snow, { p: [0, 0.86, -d / 2 + 0.03], jit: 0.03 }); b.box(0.5, 0.3, 0.4, "#5a7d99", { p: [w / 2 - 0.35, 0.15, d / 2 + 0.3] }); return b.geo(); },
  table2: (w, d) => { const g = BUILD.table(w, d); return g; },
  woodshed: (w, d) => { const b = new Build(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.14, 1.5, 0.14, PAL.wood2, { p: [sx * (w / 2 - 0.12), 0.75, sz * (d / 2 - 0.12)] });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6 - (i % 2); j++) b.cyl(0.12, 0.12, d * 0.8, 6, i % 2 ? PAL.wood : "#8b5d38", { p: [-w / 2 + 0.35 + j * 0.27 + (i % 2) * 0.13, 0.13 + i * 0.22, -0.05], r: [Math.PI / 2, 0, 0] });
    gable(b, w + 0.3, d + 0.2, 0.7, PAL.roofB, 1.5); b.box(0.12, 0.7, 0.12, PAL.dark, { p: [w / 2 - 0.4, 0.35, d / 2 + 0.2] }); b.box(0.5, 0.06, 0.06, PAL.metal, { p: [w / 2 - 0.4, 0.7, d / 2 + 0.2] }); return b.geo(); },
  smokehouse: (w, d) => { const b = new Build(); logWall(b, w - 0.3, 1.5, d - 0.4, PAL.wood); gable(b, w + 0.2, d + 0.1, 0.9, PAL.roofR, 1.5);
    b.box(0.5, 1.4, 0.5, PAL.stone, { p: [w / 2 - 0.55, 2.1, 0] }); b.box(0.56, 0.12, 0.56, PAL.snow, { p: [w / 2 - 0.55, 2.82, 0], jit: 0.02 });
    b.box(0.6, 0.9, 0.05, PAL.wood2, { p: [0, 0.45, d / 2 - 0.17] }); b.box(0.45, 0.35, 0.05, "#ffb35a", { p: [-0.75, 0.9, d / 2 - 0.17], jit: 0 }); b.box(0.45, 0.35, 0.05, "#ffb35a", { p: [-0.75, 0.9, -d / 2 + 0.17], jit: 0 }); return b.geo(); },
  caviar: (w, d) => { const b = new Build(); b.box(w - 0.4, 1.3, d - 0.4, "#e6d8c2", { p: [0, 0.65, 0] }); b.box(w - 0.3, 0.25, d - 0.3, PAL.wood2, { p: [0, 0.12, 0] });
    gable(b, w + 0.1, d, 0.8, "#d65a4a", 1.3); b.box(0.55, 0.85, 0.05, "#7a4d2e", { p: [0.3, 0.42, d / 2 - 0.19] }); b.box(0.4, 0.32, 0.05, "#bfe6f5", { p: [-0.55, 0.85, d / 2 - 0.19], jit: 0 });
    b.cyl(0.18, 0.18, 0.25, 9, "#ff6a3d", { p: [-0.55, 1.75, d / 2 - 0.25] }); b.cyl(0.19, 0.19, 0.07, 9, PAL.gold, { p: [-0.55, 1.9, d / 2 - 0.25] }); return b.geo(); },
  cannery: (w, d) => { const b = new Build(); b.box(w - 0.2, 1.7, d - 0.3, "#a9b6c2", { p: [0, 0.85, 0] }); for (let i = 0; i < 4; i++) b.box(0.05, 1.6, d - 0.25, "#8796a3", { p: [-w / 2 + 0.4 + i * (w - 0.8) / 3, 0.8, 0], jit: 0 });
    b.box(w, 0.15, d, PAL.dark, { p: [0, 1.75, 0] }); b.box(w * 0.9, 0.12, d * 0.85, PAL.snow, { p: [0, 1.88, 0], jit: 0.03 }); b.cyl(0.22, 0.26, 1.4, 8, "#7d4b3a", { p: [-w / 2 + 0.5, 2.4, -0.2] }); b.cyl(0.25, 0.25, 0.1, 8, PAL.snow, { p: [-w / 2 + 0.5, 3.1, -0.2] });
    b.box(0.8, 1.0, 0.05, "#5d6b77", { p: [0.4, 0.5, d / 2 - 0.13] }); b.box(1.2, 0.3, 0.05, "#3b78b5", { p: [0.4, 1.35, d / 2 - 0.13], jit: 0 }); return b.geo(); },
  icehouse: (w, d) => { const b = new Build(); b.box(w - 0.3, 1.2, d - 0.3, "#c7dce8", { p: [0, 0.6, 0] }); for (let i = 0; i < 6; i++) b.box(0.42, 0.3, 0.06, "#e4f3fb", { p: [-w / 2 + 0.5 + (i % 3) * 0.75, 0.3 + Math.floor(i / 3) * 0.55, d / 2 - 0.14] });
    b.sph(1, 1, "#d7ecf6", { p: [0, 1.2, 0], s: [w * 0.55, 0.75, d * 0.55], jit: 0.04 }); b.sph(1, 1, PAL.snow, { p: [0, 1.35, 0], s: [w * 0.48, 0.65, d * 0.48], jit: 0.03 }); b.box(0.6, 0.9, 0.06, PAL.roofB, { p: [0, 0.45, d / 2 - 0.12] }); return b.geo(); },
  icehole: (w, d) => { const b = new Build(); b.cyl(w * 0.45, w * 0.5, 0.08, 12, "#a7d7ec", { p: [0, 0.04, 0], s: [1, 1, d / w] }); b.cyl(w * 0.24, w * 0.24, 0.09, 10, "#2c6f93", { p: [0, 0.05, 0], s: [1, 1, d / w], jit: 0.02 });
    for (let i = 0; i < 5; i++) b.box(0.32, 0.28, 0.32, "#c7ecfb", { p: [-w * 0.42 + i * 0.22, 0.14 + (i % 2) * 0.28, d * 0.38], jit: 0.12 }); b.box(0.06, 1.1, 0.06, PAL.wood2, { p: [w * 0.3, 0.55, -d * 0.3], r: [0, 0, 0.25] }); b.box(0.5, 0.05, 0.14, PAL.metal, { p: [w * 0.42, 1.0, -d * 0.3], r: [0, 0, 0.25] }); return b.geo(); },
  lighthouse: () => { const b = new Build(); b.cyl(1.2, 1.4, 0.5, 10, PAL.stone, { p: [0, 0.25, 0] }); for (let i = 0; i < 5; i++) b.cyl(0.9 - i * 0.1, 0.95 - i * 0.1, 0.9, 10, i % 2 ? "#f4f1ea" : "#c9433a", { p: [0, 0.95 + i * 0.9, 0] });
    b.cyl(0.62, 0.62, 0.1, 10, PAL.dark, { p: [0, 5.0, 0] }); b.cyl(0.45, 0.45, 0.7, 8, "#ffe9a6", { p: [0, 5.4, 0], jit: 0 }); b.cone(0.62, 0.6, 8, "#c9433a", { p: [0, 6.05, 0] }); b.ball(0.12, PAL.gold, { p: [0, 6.4, 0] }); return b.geo(); },
  stall: (col) => { const b = new Build(); const w = 2.6, d = 0.9;
    b.box(w, 0.9, d, PAL.woodL, { p: [0, 0.45, 0] }); b.box(w * 0.92, 0.42, 0.04, col, { p: [0, 0.5, d / 2 + 0.02] }); b.box(w * 0.92, 0.06, 0.05, "#f4efe4", { p: [0, 0.74, d / 2 + 0.03], jit: 0 }); b.box(w + 0.1, 0.08, d + 0.1, PAL.wood2, { p: [0, 0.93, 0] }); for (let i = 0; i < 5; i++) b.box(0.04, 0.85, 0.02, PAL.wood2, { p: [-w / 2 + 0.3 + i * 0.5, 0.45, d / 2 + 0.005], jit: 0 });
    for (const sx of [-1, 1]) b.box(0.1, 2.3, 0.1, PAL.wood2, { p: [sx * (w / 2 - 0.05), 1.15, -0.18] });
    // навес — над продавцом (сзади), чтобы сверху была видна полка с товаром
    for (let i = 0; i < 6; i++) { const x = -w / 2 + w / 12 + i * w / 6; b.box(w / 6, 0.06, 0.95, i % 2 ? "#f4efe4" : col, { p: [x, 2.05, -0.62], r: [-0.42, 0, 0], jit: 0.02 }); b.box(w / 6, 0.2, 0.03, i % 2 ? "#f4efe4" : col, { p: [x, 2.14, -0.18], jit: 0.02 }); }
    b.box(w + 0.05, 0.05, 0.7, PAL.snow, { p: [0, 2.13, -0.7], r: [-0.42, 0, 0], jit: 0.02 }); b.box(1.1, 0.42, 0.06, "#f8f0dc", { p: [0, 2.5, -1.0] }); return b.geo(); },
  board: () => { const b = new Build(); for (const sx of [-1, 1]) b.box(0.12, 1.9, 0.12, PAL.wood2, { p: [sx * 0.95, 0.95, 0] }); b.box(2.0, 1.1, 0.1, PAL.woodL, { p: [0, 1.25, 0] }); b.box(2.15, 0.1, 0.25, PAL.wood2, { p: [0, 1.85, 0] }); b.box(2.1, 0.1, 0.3, PAL.snow, { p: [0, 1.93, 0], jit: 0.02 });
    for (let i = 0; i < 4; i++) b.box(0.42, 0.5, 0.02, "#f7f1e1", { p: [-0.7 + i * 0.47, 1.25 + (i % 2) * 0.08, 0.06], r: [0, 0, (i - 1.5) * 0.06] }); return b.geo(); },
  dock: () => { const b = new Build(); b.box(2.6, 0.2, 2.6, PAL.plank, { p: [0, 0.1, 0] }); for (let i = 0; i < 7; i++) b.box(2.62, 0.02, 0.03, PAL.wood2, { p: [0, 0.205, -1.2 + i * 0.4], jit: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.12, 0.12, 0.6, 6, PAL.wood2, { p: [sx * 1.2, 0.2, sz * 1.2] }); b.box(0.15, 2.2, 0.15, PAL.dark, { p: [-1.0, 1.1, -1.0] }); b.box(1.8, 0.12, 0.12, PAL.dark, { p: [-1.75, 2.15, -1.0] }); b.cyl(0.015, 0.015, 0.9, 4, PAL.rope, { p: [-2.5, 1.7, -1.0], jit: 0 }); return b.geo(); },
  ship: () => { const b = new Build(); b.box(1.7, 0.7, 4.2, "#2f5d7c", { p: [0, 0.2, 0] }); b.cone(0.86, 1.2, 4, "#2f5d7c", { p: [0, 0.2, -2.6], r: [Math.PI / 2, Math.PI / 4, 0], s: [1, 1, 0.58] }); b.box(1.76, 0.12, 4.25, "#e9e4d8", { p: [0, 0.6, 0] });
    b.box(1.2, 1.0, 1.2, "#f2efe6", { p: [0, 1.1, 1.0] }); b.box(1.3, 0.12, 1.3, "#c9433a", { p: [0, 1.66, 1.0] }); b.box(1.0, 0.25, 0.05, "#bfe6f5", { p: [0, 1.25, 0.38], jit: 0 }); b.cyl(0.12, 0.14, 0.8, 7, "#c9433a", { p: [0, 2.0, 1.3] }); b.box(0.08, 2.0, 0.08, PAL.dark, { p: [0, 1.6, -0.9] }); b.box(1.2, 0.06, 0.06, PAL.dark, { p: [0, 2.3, -0.9] }); return b.geo(); },
  pier: (len) => { const b = new Build(); b.box(1.8, 0.16, len, PAL.plank, { p: [0, 0.32, 0] }); const n = Math.round(len / 0.45); for (let i = 0; i < n; i++) b.box(1.82, 0.02, 0.03, PAL.wood2, { p: [0, 0.405, -len / 2 + 0.2 + i * 0.45], jit: 0 });
    for (let i = 0; i <= Math.round(len / 1.8); i++) for (const sx of [-1, 1]) b.cyl(0.1, 0.1, 1.2, 6, PAL.wood2, { p: [sx * 0.85, -0.1, -len / 2 + i * 1.8] }); for (let i = 0; i < 6; i++) b.ball(0.1, PAL.snow, { p: [(hash(i) - 0.5) * 1.4, 0.4, -len / 2 + hash(i + 7) * len], s: [1.4, 0.4, 1.4] }); return b.geo(); },
  sign: () => { const b = new Build(); b.box(0.1, 1.4, 0.1, PAL.wood2, { p: [0, 0.7, 0] }); b.box(1.2, 0.55, 0.08, PAL.woodL, { p: [0, 1.25, 0] }); b.box(1.25, 0.08, 0.15, PAL.snow, { p: [0, 1.56, 0], jit: 0.02 }); return b.geo(); },
  gear: () => { const b = new Build(); logWall(b, 2.6, 1.2, 1.2, PAL.wood); gable(b, 3.0, 1.6, 0.8, PAL.roofB, 1.2);
    b.box(0.08, 1.3, 0.08, PAL.woodL, { p: [-1.1, 0.65, 0.72], r: [0.25, 0, 0.1] }); b.box(0.08, 1.3, 0.08, PAL.woodL, { p: [-0.95, 0.65, 0.72], r: [0.25, 0, 0.05] });
    b.box(1.0, 0.7, 0.04, "#e0c58e", { p: [0.4, 0.75, 0.64], jit: 0.15 }); b.box(0.9, 0.36, 0.06, "#f8f0dc", { p: [0, 1.75, 0.82] }); b.box(0.3, 0.3, 0.3, PAL.woodL, { p: [1.1, 0.15, 0.85] }); return b.geo(); },
  hut: () => { const b = new Build(); logWall(b, 1.6, 1.2, 1.3, PAL.wood); gable(b, 2.0, 1.6, 0.8, PAL.roofG, 1.2); b.box(0.5, 0.8, 0.05, PAL.wood2, { p: [0, 0.4, 0.68] }); return b.geo(); },
  barrel: () => { const b = new Build(); b.cyl(0.24, 0.24, 0.55, 9, PAL.wood, { p: [0, 0.27, 0] }); b.cyl(0.25, 0.25, 0.05, 9, PAL.dark, { p: [0, 0.12, 0] }); b.cyl(0.25, 0.25, 0.05, 9, PAL.dark, { p: [0, 0.42, 0] }); b.cyl(0.2, 0.2, 0.06, 9, PAL.snow, { p: [0, 0.56, 0], jit: 0.02 }); return b.geo(); },
  crates: () => { const b = new Build(); b.box(0.6, 0.5, 0.6, PAL.woodL, { p: [0, 0.25, 0] }); b.box(0.5, 0.42, 0.5, PAL.wood, { p: [0.55, 0.21, 0.1], r: [0, 0.3, 0] }); b.box(0.45, 0.4, 0.45, PAL.woodL, { p: [0.15, 0.7, 0.05], r: [0, -0.2, 0] }); b.box(0.46, 0.08, 0.46, PAL.snow, { p: [0.15, 0.93, 0.05], r: [0, -0.2, 0], jit: 0.02 }); return b.geo(); },
  boat: () => { const b = new Build(); b.box(0.9, 0.35, 2.2, "#b9573f", { p: [0, 0.1, 0] }); b.cone(0.46, 0.6, 4, "#b9573f", { p: [0, 0.1, -1.35], r: [Math.PI / 2, Math.PI / 4, 0], s: [1, 1, 0.55] }); b.box(0.75, 0.05, 2.0, PAL.woodL, { p: [0, 0.28, 0] }); b.box(0.85, 0.06, 0.15, PAL.wood2, { p: [0, 0.32, 0.3] }); return b.geo(); },
};
// цвет навеса прилавка по товару
export const STALL_COL = { herring: "#4f8fc0", fillet: "#e2735c", smoked: "#c98432", steak: "#e65d4f", caviar: "#d4483a" };
