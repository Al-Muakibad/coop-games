// «Промысел» — карта архипелага в 3D: море посередине, вокруг острова-бухты, у каждого своя погода и своя рыба в воде.
// Закрытые острова — в тумане со знаком «?». Торговые пути — пунктир по морю, по ним ходят шхуны.
// Всё из простых пухлых фигур с цветами в вершинах (как в игре), повторяющееся — инстансами, текстуры только мелкие (подписи).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Build, BUILD, pineGeo, ITEM_GEO, PAL } from "./art.js";
import { BAYS, ROUTES } from "./data.js";

// где стоят острова (x — вправо, z — к зрителю). Море — в середине. В портрете — повыше и поуже, острова чуть меньше.
// восемь островов по кругу вокруг моря; в портрете — две колонки змейкой (порядок плавания)
const LAND = { pos: [{ x: -21, z: 10 }, { x: -24, z: -5 }, { x: -12, z: -15 }, { x: 4, z: -16 }, { x: 19, z: -11 }, { x: 25, z: 4 }, { x: 14, z: 15 }, { x: -3, z: 16 }], k: 0.78, r: 66 };
const PORT = { pos: [{ x: -7, z: 25 }, { x: -7.5, z: 8.5 }, { x: -7, z: -8.5 }, { x: -7.5, z: -25 }, { x: 7.5, z: -25 }, { x: 7, z: -8.5 }, { x: 7.5, z: 8.5 }, { x: 7, z: 25 }], k: 0.6, r: 92 };
export let ISLE_POS = LAND.pos;
const FISH = ["herring", "salmon", "crab", "cod", "semga", "saika", "redfish", "halibut"];
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), EU = new THREE.Euler(), V = new THREE.Vector3(), S3 = new THREE.Vector3();
const rnd = (i, k) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
// копия геометрии со сдвигом/поворотом/размером — чтобы слить весь остров в одну сетку
function put(list, geo, x, y, z, ry, s) { const g = geo.clone(); EU.set(0, ry || 0, 0); Q.setFromEuler(EU); const sc = typeof s === "number" ? S3.set(s, s, s) : S3.set(...(s || [1, 1, 1])); M4.compose(V.set(x, y, z), Q, sc); g.applyMatrix4(M4); list.push(g); }

export class ArchMap {
  constructor(renderer, opt) {
    this.renderer = renderer; this.q = (opt && opt.quality) || 0; this.t = 0; this.portrait = !!(opt && opt.portrait);
    const LY = this.portrait ? PORT : LAND; ISLE_POS = LY.pos; this.P = LY.pos; this.k = LY.k; this.R0 = LY.r;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color("#bfe0f2");
    this.scene.fog = new THREE.Fog("#bfe0f2", LY.r * 1.15, LY.r * 2.3);      // дальше камеры — чтобы острова не тонули в дымке
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);
    this.cam = { az: 0, el: 0.98, r: LY.r, tx: 0, tz: 0, taz: 0, tel: 0.98, tr: LY.r, ttx: 0, ttz: 0, idle: 0 };
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.state = null; this.sel = -1;
    const hemi = new THREE.HemisphereLight("#eaf4ff", "#6a7f9a", 1.35); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff3dc", 1.6); sun.position.set(-20, 40, 25); this.scene.add(sun);
    this.buildSea(); this.buildIsles(); this.buildFish(); this.buildMist(); this.buildRoutes(); this.buildWeather(); this.buildMarkers();
    // невидимые шары для нажатия по острову
    this.hit = this.P.map((p, b) => { const m = new THREE.Mesh(new THREE.SphereGeometry(6.5 * this.k, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(p.x, 1, p.z); m.userData.b = b; this.scene.add(m); return m; });
    this.ray = new THREE.Raycaster();
  }

  /* ---------- море: круг с мелководьем у островов, волны в шейдере ---------- */
  buildSea() {
    const g = new THREE.CircleGeometry(70, 96, 0, Math.PI * 2); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, sh = new Float32Array(pos.count), tq = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i); let k = 0, t = 0;
      this.P.forEach((p, b) => { const d = Math.hypot(x - p.x, z - p.z); const v = Math.max(0, 1 - (d - 5.5 * this.k) / 5); k = Math.max(k, v); if (b === 2 || b === 6) t = Math.max(t, v); });
      sh[i] = k; tq[i] = t;
    }
    g.setAttribute("aSh", new THREE.BufferAttribute(sh, 1)); g.setAttribute("aTq", new THREE.BufferAttribute(tq, 1));
    this.seaU = { uT: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.seaU, fog: false,
      vertexShader: `attribute float aSh; attribute float aTq; varying float vSh; varying float vTq; varying vec2 vP; uniform float uT;
        void main(){ vSh = aSh; vTq = aTq; vP = position.xz; vec3 p = position; p.y += sin(p.x * 0.35 + uT * 1.1) * 0.06 + cos(p.z * 0.3 + uT * 0.9) * 0.06; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `varying float vSh; varying float vTq; varying vec2 vP; uniform float uT;
        void main(){ vec3 deep = vec3(0.07, 0.27, 0.52), mid = vec3(0.12, 0.40, 0.68), shal = vec3(0.36, 0.70, 0.86), turq = vec3(0.30, 0.84, 0.78);
          float r = length(vP) / 70.0; vec3 c = mix(mid, deep, smoothstep(0.15, 0.9, r));
          c = mix(c, mix(shal, turq, vTq), smoothstep(0.0, 1.0, vSh));
          float w = sin(vP.x * 0.9 + vP.y * 0.4 + uT * 1.6) * sin(vP.y * 0.8 - uT * 1.2);
          c += vec3(0.08) * smoothstep(0.82, 0.98, w) * (1.0 - r);
          float foam = smoothstep(0.72, 0.95, vSh) * (0.5 + 0.5 * sin(uT * 2.0 + vP.x * 2.0 + vP.y * 1.3));
          c = mix(c, vec3(0.95, 0.98, 1.0), foam * 0.35);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sea = new THREE.Mesh(g, m); this.scene.add(this.sea);
  }

  /* ---------- острова: каждый похож на свою бухту ---------- */
  buildIsles() {
    const pines = pineGeo(0, false), pineS = pineGeo(1, true), cliff = BUILD.cliff(), shrub = BUILD.shrub(), boat = BUILD.boat(), light = BUILD.lighthouse();
    const houses = ["#e9dcc4", "#d9e4ea", "#f0d8c0", "#e0e8d0", "#f2e2b0", "#cfe0d0"].map((c) => BUILD.house(c));
    const rock = (() => { const b = new Build(); b.sph(0.6, 0, PAL.stone, { p: [0, 0.2, 0], s: [1.2, 0.7, 1] }); return b.geo(); })();
    const floe = (() => { const b = new Build(); b.cyl(1, 0.9, 0.25, 6, "#f4f9ff", { p: [0, 0.05, 0], jit: 0.05 }); b.cyl(0.8, 0.8, 0.05, 6, "#d8ecf8", { p: [0, 0.18, 0], jit: 0.03 }); return b.geo(); })();
    const pier = (() => { const b = new Build({ round: true }); b.box(1.2, 0.18, 4, PAL.plank, { p: [0, 0.3, 0] }); for (const z of [-1.6, 0, 1.6]) for (const sx of [-1, 1]) b.cyl(0.1, 0.1, 0.9, 6, PAL.wood2, { p: [sx * 0.5, 0, z] }); return b.geo(); })();
    const moss = (() => { const b = new Build(); b.sph(1, 1, "#6f9a4a", { s: [1.4, 0.18, 1.1], jit: 0.1 }); return b.geo(); })();
    this.isles = []; this.lights = []; this.beams = []; this.flagM = [];
    this.P.forEach((p, b) => {
      const parts = [];
      const land = new Build();
      const col = ["#f4f8fc", "#e6eef6", "#93a85e", "#d6c08e", "#7f9a68", "#f8fbfe", "#4f4644", "#8a948e"][b], under = ["#7d8ea3", "#6f7f92", "#6e604a", "#9a7a52", "#5a6a62", "#9fb6c8", "#2e2826", "#5a6466"][b], beach = ["#c4d2e0", "#b9c9d9", "#e6d7a8", "#ecd9a8", "#a8b490", "#e2eef6", "#3a3432", "#9aa4a0"][b], hill = ["#e8eef6", "#d8e2ec", "#7f9a4e", "#c9b07c", "#6a8a5a", "#eef6fc", "#3e3634", "#7a8480"][b];
      land.cyl(6.4, 7.0, 1.2, 14, under, { p: [0, -0.45, 0], jit: 0.06 });
      land.cyl(6.6, 6.6, 0.3, 14, beach, { p: [0, 0.12, 0], jit: 0.05 });
      land.sph(1, 2, col, { p: [0, 0.15, 0], s: [5.6, 1.6, 4.8], jit: 0.05 });
      land.sph(1, 1, hill, { p: [1.8, 0.6, -1.4], s: [2.6, 1.5, 2.2], jit: 0.06 }); land.sph(1, 1, hill, { p: [-2.2, 0.5, -1.8], s: [1.8, 1.1, 1.6], jit: 0.06 });
      for (let i = 0; i < 10; i++) { const a = i * 0.63 + rnd(b, i) * 0.4; land.sph(0.7, 0, under, { p: [Math.cos(a) * 6.5, 0.0, Math.sin(a) * 5.9], s: [1.3, 0.6, 1.0], jit: 0.08 }); }
      parts.push(land.geo());
      const R = (k) => rnd(b * 31 + k, k);
      if (b === 0) {      // Тихая бухта: снежные ели и маленькая гавань
        for (let i = 0; i < 11; i++) { const a = R(i) * 6.28, r = 1.2 + R(i + 40) * 3.2; if (Math.cos(a) > 0.55 && Math.sin(a) > 0) continue; put(parts, pines, Math.cos(a) * r, 0.9 + (1 - r / 4.8) * 0.6, Math.sin(a) * r * 0.85, R(i + 9) * 6, 0.55 + R(i + 3) * 0.35); }
        put(parts, pier, 4.6, -0.05, 3.6, -0.7, 1); put(parts, houses[0], 2.6, 1.0, 2.2, -0.5, 0.42); put(parts, houses[2], 1.0, 1.25, 2.9, -0.2, 0.38); put(parts, boat, 6.2, -0.1, 5.1, -0.7, 0.55);
      } else if (b === 1) {      // Ледяной фьорд: скалы и льдины
        for (let i = 0; i < 7; i++) { const a = -2.6 + i * 0.6 + R(i) * 0.3, r = 3.2 + R(i + 5) * 1.6; put(parts, cliff, Math.cos(a) * r, 0.4, Math.sin(a) * r, R(i + 7) * 6, 0.9 + R(i + 11) * 0.6); }
        for (let i = 0; i < 5; i++) { const a = R(i + 20) * 6.28, r = 1 + R(i + 21) * 2; put(parts, pines, Math.cos(a) * r, 1.2, Math.sin(a) * r * 0.8 + 0.6, 0, 0.5); }
        for (let i = 0; i < 9; i++) { const a = 0.3 + i * 0.55 + R(i + 30) * 0.3, r = 7.6 + R(i + 31) * 2.4; put(parts, floe, Math.cos(a) * r, -0.05, Math.sin(a) * r, R(i + 32) * 6, 0.5 + R(i + 33) * 0.6); }
      } else if (b === 2) {      // Крабовый мыс: летняя тундра, мох, камни, бирюзовое мелководье
        for (let i = 0; i < 8; i++) { const a = R(i) * 6.28, r = 1 + R(i + 40) * 3.4; put(parts, moss, Math.cos(a) * r, 1.0 + (1 - r / 4.5) * 0.5, Math.sin(a) * r * 0.8, R(i) * 6, 0.6 + R(i + 2) * 0.5); }
        for (let i = 0; i < 7; i++) { const a = R(i + 50) * 6.28, r = 1.5 + R(i + 51) * 3; put(parts, shrub, Math.cos(a) * r, 0.95 + (1 - r / 4.5) * 0.5, Math.sin(a) * r * 0.8, R(i) * 6, 0.8); }
        for (let i = 0; i < 9; i++) { const a = R(i + 60) * 6.28, r = 5.2 + R(i + 61) * 1.6; put(parts, rock, Math.cos(a) * r, 0.05, Math.sin(a) * r, R(i) * 6, 0.6 + R(i + 62) * 0.7); }
        put(parts, pineS, -2.2, 1.3, -1.2, 0, 0.5); put(parts, pineS, -1.2, 1.4, -2.2, 1, 0.42);
      } else if (b === 4) {      // Северный фьорд: отвесные скалы с узкими заливами, зелёные склоны, ели, мостки
        for (let i = 0; i < 12; i++) { const a = i * 0.52 + R(i) * 0.2; if (i % 4 === 1) continue; const r = 4.6 + R(i + 5) * 0.8; put(parts, cliff, Math.cos(a) * r, 0.6, Math.sin(a) * r, a, [0.7, 1.3 + R(i + 9) * 0.6, 0.7]); }
        for (let i = 0; i < 7; i++) { const a = R(i + 20) * 6.28, r = 0.8 + R(i + 21) * 2.4; put(parts, pineS, Math.cos(a) * r, 1.3, Math.sin(a) * r * 0.8, 0, 0.5); }
        put(parts, pier, 2.4, -0.05, 5.6, 0.2, 0.9); put(parts, boat, 3.2, -0.1, 7.0, 0.2, 0.5); put(parts, houses[1], 0.6, 1.3, 2.2, 0, 0.36);
      } else if (b === 5) {      // Ледник: ледяной купол, айсберги, тюлени на льдинах, прорубь
        const berg = BUILD.iceberg(); for (let i = 0; i < 7; i++) { const a = i * 0.9 + R(i) * 0.4, r = 7.4 + R(i + 1) * 2.4; put(parts, berg, Math.cos(a) * r, -0.2, Math.sin(a) * r, R(i + 2) * 6, 0.9 + R(i + 3) * 0.8); }
        for (let i = 0; i < 6; i++) { const a = R(i + 30) * 6.28, r = 7.6 + R(i + 31) * 2; put(parts, floe, Math.cos(a) * r, -0.05, Math.sin(a) * r, 0, 0.7); put(parts, this.sealGeo(), Math.cos(a) * r, 0.18, Math.sin(a) * r, R(i + 33) * 6, 0.9); }
        put(parts, BUILD.icehole(2.2, 1.6), 1.6, 1.4, 1.8, 0, 1); put(parts, houses[1], -1.2, 1.5, 1.4, 0.3, 0.34);
      } else if (b === 6) {      // Вулканический остров: вулкан с жерлом, горячие источники, пар
        const vb = new Build(); vb.cone(3.4, 4.2, 9, "#3a3230", { p: [0, 2.1, 0], jit: 0.06 }); vb.cone(1.3, 0.9, 9, "#2a2422", { p: [0, 4.0, 0] }); vb.cyl(0.7, 0.7, 0.15, 9, "#ff7a3a", { p: [0, 4.35, 0], jit: 0.1 }); put(parts, vb.geo(), -0.8, 0.6, -1.2, 0, 1);
        const pool = (() => { const b2 = new Build(); b2.cyl(0.9, 1.0, 0.12, 10, "#3a3432", { p: [0, 0.05, 0] }); b2.cyl(0.75, 0.75, 0.05, 10, "#6ad8cc", { p: [0, 0.12, 0], jit: 0.04 }); return b2.geo(); })();
        for (let i = 0; i < 4; i++) { const a = 0.6 + i * 1.3, r = 3.2 + R(i) * 0.8; put(parts, pool, Math.cos(a) * r, 0.95, Math.sin(a) * r * 0.85, 0, 0.9); }
        put(parts, pier, 4.6, -0.05, 3.6, -0.7, 0.9); put(parts, houses[4], 2.4, 1.05, 2.4, -0.5, 0.36);
      } else if (b === 7) {      // Туманные шхеры: каменные островки, маяк на скале
        for (let i = 0; i < 10; i++) { const a = R(i) * 6.28, r = 6.8 + R(i + 1) * 4; put(parts, cliff, Math.cos(a) * r, -0.4, Math.sin(a) * r, R(i + 2) * 6, 0.45 + R(i + 3) * 0.5); }
        for (let i = 0; i < 6; i++) { const a = R(i + 40) * 6.28, r = 1.2 + R(i + 41) * 3; put(parts, rock, Math.cos(a) * r, 0.9, Math.sin(a) * r * 0.8, R(i) * 6, 0.8 + R(i + 42) * 0.6); }
        put(parts, pier, 4.2, -0.05, 4.0, -0.5, 0.9); put(parts, boat, 5.8, -0.1, 5.4, -0.5, 0.5);
      } else {      // Ярмарочная гавань: городок с флажками
        for (let i = 0; i < 6; i++) { const a = -0.4 + i * 0.75, r = 2.2 + (i % 2) * 1.3; put(parts, houses[i % houses.length], Math.cos(a) * r, 1.0, Math.sin(a) * r * 0.8, -a + Math.PI / 2, 0.42 + R(i) * 0.08); }
        put(parts, pier, -4.8, -0.05, 3.4, 0.6, 1); put(parts, boat, -6.2, -0.1, 4.9, 0.6, 0.55); put(parts, boat, 6.0, -0.1, -3.8, 2.2, 0.5);
      }
      const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
      const K = this.k; const mesh = new THREE.Mesh(geo, this.mat); mesh.position.set(p.x, 0, p.z); mesh.scale.setScalar(K); this.scene.add(mesh); this.isles.push(mesh);
      // флажки гавани — отдельно, чтобы колыхались на ветру
      if (b === 3) for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(BUILD.flags(3.2), this.mat); f.scale.setScalar(0.42 * K); f.position.set(p.x + (-0.6 + i * 1.6) * K, 1.15 * K, p.z + (0.4 - i * 1.6) * K); f.rotation.y = 0.6 + i * 0.9; this.scene.add(f); this.flagM.push(f); }
      // маяк: горит, если маяк этой бухты зажжён
      const lh = new THREE.Mesh(light, this.mat); lh.scale.setScalar(0.32 * K); lh.position.set(p.x + (b % 3 === 0 ? -3.4 : 3.0) * K, 0.9 * K, p.z + (b < 2 ? 2.4 : -2.6) * K); this.scene.add(lh); this.lights.push(lh);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 9, 12, 1, true), new THREE.MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.geometry.translate(0, -4.5, 0); beam.geometry.rotateZ(Math.PI / 2); beam.scale.setScalar(K); beam.position.set(lh.position.x, lh.position.y + 1.65 * K, lh.position.z); this.scene.add(beam); this.beams.push(beam);
    });
  }

  sealGeo() { if (this._seal) return this._seal; const b = new Build(); b.sph(0.5, 1, "#7a828c", { p: [0, 0.22, 0], s: [1.3, 0.55, 0.6] }); b.sph(0.26, 1, "#8a929c", { p: [0.62, 0.38, 0] }); b.cone(0.18, 0.3, 4, "#6a727c", { p: [-0.72, 0.14, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.4] }); return (this._seal = b.geo()); }
  /* ---------- рыба своей бухты в воде вокруг острова ---------- */
  buildFish() {
    const n = this.q > 0 ? 9 : 5;
    this.fish = FISH.map((k, b) => { const im = new THREE.InstancedMesh(ITEM_GEO[k](), this.mat, n); im.frustumCulled = false; this.scene.add(im);
      return { im, b, k, n, f: Array.from({ length: n }, (_, i) => ({ a: rnd(b, i) * 6.28, r: (7.3 + rnd(i, b + 3) * 3.2) * this.k, sp: (0.18 + rnd(i + 7, b) * 0.2) * (i % 2 ? 1 : -1), ph: rnd(i, b + 9) * 6.28 })) }; });
  }
  /* ---------- туман над закрытыми островами ---------- */
  buildMist() {
    const n = this.q > 0 ? 11 : 7, im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: "#f3f7fb" }), n * 4);      // туман непрозрачный: меньше перерисовки на слабых телефонах
    im.frustumCulled = false; im.renderOrder = 3; this.scene.add(im); this.mist = im;
    this.puffs = []; this.P.forEach((p, b) => { for (let i = 0; i < n; i++) this.puffs.push({ b, a: rnd(b + 3, i) * 6.28, r: rnd(i, b + 1) * 5.8 * this.k, y: 1 + rnd(i + 2, b) * 2.6, s: (2.6 + rnd(i + 5, b + 2) * 1.9) * this.k, ph: rnd(i, b + 7) * 6 }); });
    this.qs = this.P.map((p) => { const sp = this.label("?", 64, "#3a5a7a", "rgba(255,255,255,.92)", 128); sp.scale.set(3.2, 3.2, 1); sp.position.set(p.x, 6.2, p.z); this.scene.add(sp); return sp; });
  }
  /* ---------- торговые пути и шхуны ---------- */
  buildRoutes() {
    this.curves = ROUTES.map((R) => { const a = this.P[R.a], c = this.P[R.b]; const mx = (a.x + c.x) / 2 * 0.35, mz = (a.z + c.z) / 2 * 0.35;
      const A = new THREE.Vector3(a.x, 0.12, a.z).lerp(new THREE.Vector3(mx, 0.12, mz), 0.32 * this.k), C = new THREE.Vector3(c.x, 0.12, c.z).lerp(new THREE.Vector3(mx, 0.12, mz), 0.32 * this.k);
      return new THREE.QuadraticBezierCurve3(A, new THREE.Vector3(mx, 0.12, mz), C); });
    let total = 0; this.dotIdx = this.curves.map((cv) => { const n = Math.max(6, Math.round(cv.getLength() / 0.9)); const s = total; total += n; return [s, n]; });
    const dg = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 8); this.dots = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false }), total);
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3); this.dots.frustumCulled = false; this.scene.add(this.dots);
    const sch = (() => { const b = new Build({ round: true }); b.box(0.7, 0.32, 1.9, "#7a4a2a", { p: [0, 0.12, 0] }); b.cone(0.36, 0.5, 4, "#7a4a2a", { p: [0, 0.12, 1.15], r: [Math.PI / 2, Math.PI / 4, 0], s: [1, 1, 0.5] }); b.box(0.74, 0.06, 1.95, "#e9e4d8", { p: [0, 0.3, 0] });
      b.cyl(0.04, 0.05, 2.0, 5, PAL.wood2, { p: [0, 1.2, 0.1] }); b.box(0.06, 1.2, 0.9, "#f7f2e6", { p: [0, 1.35, -0.25], jit: 0.02 }); b.box(0.05, 0.7, 0.5, "#f2ead8", { p: [0, 1.0, 0.65], jit: 0.02 }); b.box(0.1, 0.12, 0.25, "#c9433a", { p: [0, 2.2, 0.1], jit: 0 }); return b.geo(); })();
    // инкассаторские шхуны (перевод денег): золотой парус, мешки на палубе
    const cash = (() => { const b = new Build({ round: true }); b.box(0.7, 0.32, 1.9, "#4a3a2a", { p: [0, 0.12, 0] }); b.box(0.74, 0.06, 1.95, "#e9e4d8", { p: [0, 0.3, 0] }); b.cyl(0.04, 0.05, 2.0, 5, PAL.wood2, { p: [0, 1.2, 0.1] }); b.box(0.06, 1.2, 0.9, "#ffd34d", { p: [0, 1.35, -0.25], jit: 0.02 }); for (let i = 0; i < 3; i++) b.box(0.22, 0.2, 0.22, "#7ed957", { p: [(i - 1) * 0.2, 0.45, 0.4] }); return b.geo(); })();
    this.cashShips = [0, 1, 2, 3, 4, 5].map(() => { const m = new THREE.Mesh(cash, this.mat); m.scale.setScalar(1.5); m.visible = false; this.scene.add(m); return m; });
    this.ships = ROUTES.map(() => { const m = new THREE.Mesh(sch, this.mat); m.scale.setScalar(0.75); m.visible = false; this.scene.add(m); return m; });
  }
  /* ---------- погода у каждого острова ---------- */
  buildWeather() {
    // снег над Тихой бухтой и метель над Ледником (половина частиц там)
    const n = this.q > 0 ? 240 : 90, pos = new Float32Array(n * 3);
    this.snowN = n; for (let i = 0; i < n; i++) { const p0 = this.P[i % 3 === 0 ? 0 : 5]; pos[i * 3] = p0.x + (rnd(i, 1) - 0.5) * 13 * this.k; pos[i * 3 + 1] = rnd(i, 2) * 10; pos[i * 3 + 2] = p0.z + (rnd(i, 3) - 0.5) * 12 * this.k; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 0.22, transparent: true, opacity: 0.95, depthWrite: false })); this.scene.add(this.snow);
    // Ледяной фьорд: низкий туман
    const fog = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: "#eef4fa", transparent: true, opacity: 0.38, depthWrite: false }), 10);
    fog.frustumCulled = false; this.scene.add(fog); this.fjFog = fog;
    // Крабовый мыс: солнце (тёплый блик) и искры на воде
    const glow = this.glowSprite("#fff1b8"); glow.position.set(this.P[2].x + 1, 9, this.P[2].z - 2); glow.scale.set(6, 6, 1); this.scene.add(glow); this.sunG = glow;
    const sp = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, fog: false }), 14); sp.frustumCulled = false; this.scene.add(sp); this.spark = sp;
    if (this.q === 0) { fog.visible = false; sp.visible = false; }
    // Северный фьорд: морось
    { const m = this.q > 0 ? 120 : 50, rp = new Float32Array(m * 3), p4 = this.P[4]; for (let i = 0; i < m; i++) { rp[i * 3] = p4.x + (rnd(i, 11) - 0.5) * 13 * this.k; rp[i * 3 + 1] = rnd(i, 12) * 9; rp[i * 3 + 2] = p4.z + (rnd(i, 13) - 0.5) * 12 * this.k; }
      const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.BufferAttribute(rp, 3)); this.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: "#9fc4dc", size: 0.16, transparent: true, opacity: 0.8, depthWrite: false })); this.rainN = m; this.scene.add(this.rain); }
    // Вулканический остров: пар над источниками и дымок над жерлом; Туманные шхеры: густой туман
    this.steamM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: "#f6f4f2", transparent: true, opacity: 0.55, depthWrite: false }), 12); this.steamM.frustumCulled = false; this.scene.add(this.steamM);
    this.skFog = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: "#e8ecee", transparent: true, opacity: 0.5, depthWrite: false }), 16); this.skFog.frustumCulled = false; this.scene.add(this.skFog);
    // Ярмарочная гавань: облачка плывут по ветру
    const cl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false }), 6); cl.frustumCulled = false; this.scene.add(cl); this.clouds = cl;
  }
  buildMarkers() {
    this.curRing = new THREE.Mesh(new THREE.TorusGeometry(7.3 * this.k, 0.14, 6, 48), new THREE.MeshBasicMaterial({ color: "#ffd34d", transparent: true, opacity: 0.9, fog: false })); this.curRing.rotation.x = Math.PI / 2; this.scene.add(this.curRing);
    this.selRing = new THREE.Mesh(new THREE.TorusGeometry(7.9 * this.k, 0.1, 6, 48), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, fog: false })); this.selRing.rotation.x = Math.PI / 2; this.selRing.visible = false; this.scene.add(this.selRing);
    this.hostRing = new THREE.Mesh(new THREE.TorusGeometry(8.4 * this.k, 0.09, 6, 48), new THREE.MeshBasicMaterial({ color: "#7ed957", transparent: true, opacity: 0.85, fog: false })); this.hostRing.rotation.x = Math.PI / 2; this.hostRing.visible = false; this.scene.add(this.hostRing);
    this.names = this.P.map((p) => { const s = this.label("", 28, "#ffffff", "rgba(20,40,60,.72)", 512, 96); s.position.set(p.x, 5.2 * this.k, p.z + 3.4 * this.k); this.scene.add(s); return s; });
  }
  label(txt, size, col, bg, w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h || w; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false })); sp.renderOrder = 9;
    sp.userData = { c, tex, size, col, bg, txt: null }; this.setLabel(sp, txt); return sp;
  }
  setLabel(sp, txt) {
    const u = sp.userData; if (u.txt === txt) return; u.txt = txt; const c = u.c, x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height); if (!txt) { u.tex.needsUpdate = true; return; }
    x.font = `900 ${u.size * (c.width > 200 ? 1.6 : 1)}px Nunito, Arial, sans-serif`; const tw = Math.min(c.width - 8, x.measureText(txt).width + 36), hh = c.height;
    x.fillStyle = u.bg; x.beginPath(); if (c.width > 200) { const r = hh / 2 - 4; x.roundRect((c.width - tw) / 2, 4, tw, hh - 8, r); } else x.arc(c.width / 2, hh / 2, hh / 2 - 4, 0, 7); x.fill();
    x.fillStyle = u.col; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(txt, c.width / 2, hh / 2 + 2, c.width - 24); u.tex.needsUpdate = true;
    if (c.width > 200) { const k = this.portrait ? 1.45 : 1.1; sp.scale.set(7.2 * k, 7.2 * k * hh / c.width, 1); }
  }
  glowSprite(col) {
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, col); g.addColorStop(0.35, col + "88"); g.addColorStop(1, col + "00"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  }

  /* ---------- состояние: какие острова открыты, где маяки, какие пути ---------- */
  // st = { cur, isl: [{ known, lit, nw }], rt: [номера путей], can: [номера путей, которые можно проложить], sel, host }
  setState(st, names) {
    this.state = st; this.txT = this.t;
    this.P.forEach((p, b) => {
      const I = st.isl[b], open = I.known || b === st.cur;
      this.lights[b].visible = open; this.beams[b].visible = !!I.lit;
      this.qs[b].visible = !open; this.setLabel(this.qs[b], I.nw ? "⛵" : "?");
      this.setLabel(this.names[b], open ? (b === st.cur ? "📍 " : I.lit ? "🗼 " : "") + names[b] : I.nw ? "⛵ " + names[b] : ""); this.names[b].visible = open || !!I.nw;
    });
    for (let k = 0; k < ROUTES.length; k++) {
      const R = ROUTES[k], on = st.rt.includes(k), show = on || (st.isl[R.a].known && st.isl[R.b].known), [s, n] = this.dotIdx[k], col = new THREE.Color(on ? "#ffd34d" : st.can.includes(k) ? "#ffffff" : "#a9c4d8");
      for (let i = 0; i < n; i++) { const pt = this.curves[k].getPoint((i + 0.5) / n); M4.compose(V.set(pt.x, show ? 0.12 : -50, pt.z), Q.identity(), S3.set(on ? 1.15 : 0.8, 1, on ? 1.15 : 0.8)); this.dots.setMatrixAt(s + i, M4); this.dots.setColorAt(s + i, col); }
      this.ships[k].visible = on;
    }
    this.dots.instanceMatrix.needsUpdate = true; this.dots.instanceColor.needsUpdate = true;
    if (this.sel < 0 && this.cam.idle === 0) { const p = this.P[st.cur]; this.cam.ttx = p.x * 0.25; this.cam.ttz = p.z * 0.25; }
  }
  select(b) { this.sel = b; if (b >= 0) { const p = this.P[b]; this.cam.ttx = p.x * 0.55; this.cam.ttz = p.z * 0.55 + this.R0 * 0.2;      // остров — повыше, чтобы карточка внизу его не закрывала
 this.cam.tr = this.R0 * 0.78; } else { this.cam.ttx = 0; this.cam.ttz = 0; this.cam.tr = this.R0; } }
  pick(nx, ny) { this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera); const h = this.ray.intersectObjects(this.hit, false); return h.length ? h[0].object.userData.b : -1; }
  drag(dx, dy) { this.cam.taz -= dx * 0.006; this.cam.tel = Math.max(0.55, Math.min(1.25, this.cam.tel + dy * 0.004)); this.cam.idle = 4; }
  zoom(k) { this.cam.tr = Math.max(this.R0 * 0.5, Math.min(this.R0 * 1.3, this.cam.tr * k)); this.cam.idle = 4; }
  resize(w, h) { this.camera.aspect = w / h; this.camera.fov = w < h ? 50 : 36; this.camera.updateProjectionMatrix(); }

  update(dt) {
    this.t += dt; const t = this.t, c = this.cam, st = this.state;
    // камера: плавно летает вокруг моря, после касания — ждёт
    c.idle = Math.max(0, c.idle - dt); if (c.idle <= 0) c.taz += (Math.sin(t * 0.08) * 0.35 - c.taz) * Math.min(1, dt * 0.4);
    const k = 1 - Math.exp(-dt * 3); c.az += (c.taz - c.az) * k; c.el += (c.tel - c.el) * k; c.r += (c.tr - c.r) * k; c.tx += (c.ttx - c.tx) * k; c.tz += (c.ttz - c.tz) * k;
    const az = c.az + Math.sin(t * 0.13) * 0.04;
    this.camera.position.set(c.tx + Math.sin(az) * Math.cos(c.el) * c.r, Math.sin(c.el) * c.r, c.tz + Math.cos(az) * Math.cos(c.el) * c.r); this.camera.lookAt(c.tx, 0, c.tz);
    this.seaU.uT.value = t;
    if (!st) return;
    // рыба: кружит у своего острова, иногда выпрыгивает; крабы бегают боком по отмели
    for (const F of this.fish) {
      const p = this.P[F.b], open = st.isl[F.b].known || F.b === st.cur;
      for (let i = 0; i < F.n; i++) {
        const f = F.f[i]; f.a += f.sp * dt; const crab = F.k === "crab", r = crab ? (6.3 + Math.sin(t * 0.5 + f.ph) * 0.4) * this.k : f.r, x = p.x + Math.cos(f.a) * r, z = p.z + Math.sin(f.a) * r;
        const jump = crab ? 0 : Math.max(0, Math.sin(t * 0.9 + f.ph * 3)) ** 12 * 1.4, y = crab ? 0.25 : -0.12 + jump + Math.sin(t * 2 + f.ph) * 0.04;
        EU.set(crab ? 0 : -jump * 0.6 * Math.sign(f.sp), -f.a + (f.sp > 0 ? 0 : Math.PI) + (crab ? Math.PI / 2 : 0), 0); Q.setFromEuler(EU);
        M4.compose(V.set(x, open ? y : -40, z), Q, S3.setScalar(crab ? 2.4 : 2.6)); F.im.setMatrixAt(i, M4);
      }
      F.im.instanceMatrix.needsUpdate = true;
    }
    // туман над закрытыми островами
    for (let i = 0; i < this.puffs.length; i++) { const f = this.puffs[i], p = this.P[f.b], open = st.isl[f.b].known || f.b === st.cur; const a = f.a + t * 0.05;
      M4.compose(V.set(p.x + Math.cos(a) * f.r, open ? -40 : f.y + Math.sin(t * 0.4 + f.ph) * 0.25, p.z + Math.sin(a) * f.r * 0.85), Q.identity(), S3.set(f.s, f.s * 0.7, f.s)); this.mist.setMatrixAt(i, M4); }
    this.mist.instanceMatrix.needsUpdate = true;
    for (const q of this.qs) q.position.y = 6.2 + Math.sin(t * 1.5) * 0.25;
    // снег над Тихой бухтой
    const sp = this.snow.geometry.attributes.position; for (let i = 0; i < this.snowN; i++) { let y = sp.getY(i) - dt * (1.2 + (i % 5) * 0.2); if (y < 0) y += 10; sp.setY(i, y); sp.setX(i, sp.getX(i) + Math.sin(t + i) * dt * 0.2); } sp.needsUpdate = true;
    // морось над фьордом
    { const rp = this.rain.geometry.attributes.position; for (let i = 0; i < this.rainN; i++) { let y = rp.getY(i) - dt * 6; if (y < 0) y += 9; rp.setY(i, y); } rp.needsUpdate = true; }
    // пар вулкана: клубы поднимаются из жерла и источников
    { const p6 = this.P[6], K = this.k; for (let i = 0; i < 12; i++) { const u = (t * 0.12 + i / 12) % 1, src = i < 6 ? [-0.8, 4.4] : [Math.cos(0.6 + (i % 4) * 1.3) * 3.4, 1.0], sc = (0.5 + u * 1.4) * K; M4.compose(V.set(p6.x + (src[0] + Math.sin(i * 2 + t * 0.4) * u) * K, (src[1] + u * 3.5) * K, p6.z + (i < 6 ? -1.2 : Math.sin(0.6 + (i % 4) * 1.3) * 2.9) * K), Q.identity(), S3.setScalar(sc * (1 - u * 0.4))); this.steamM.setMatrixAt(i, M4); } this.steamM.instanceMatrix.needsUpdate = true; }
    // туман шхер: стелется над водой вокруг острова
    { const p7 = this.P[7], K = this.k; for (let i = 0; i < 16; i++) { const a = i * 0.39 + t * 0.02, r = (5 + (i % 4) * 1.6) * K; M4.compose(V.set(p7.x + Math.cos(a) * r, 0.5 + (i % 3) * 0.5, p7.z + Math.sin(a) * r * 0.9), Q.identity(), S3.set(3.0 * K, 0.9, 2.4 * K)); this.skFog.setMatrixAt(i, M4); } this.skFog.instanceMatrix.needsUpdate = true; }
    // туман фьорда
    const p1 = this.P[1]; for (let i = 0; i < 10; i++) { const a = i * 0.63 + t * 0.03; M4.compose(V.set(p1.x + Math.cos(a) * (6 + (i % 3)) * this.k, 0.4 + (i % 2) * 0.3, p1.z + Math.sin(a) * (5 + (i % 3)) * this.k), Q.identity(), S3.set(2.6, 0.55, 2.0)); this.fjFog.setMatrixAt(i, M4); } this.fjFog.instanceMatrix.needsUpdate = true;
    // солнце и искры на бирюзовой воде мыса
    this.sunG.material.opacity = 0.75 + Math.sin(t * 0.8) * 0.15; const p2 = this.P[2];
    for (let i = 0; i < 14; i++) { const a = rnd(i, 4) * 6.28, r = (6.6 + rnd(i, 5) * 2.6) * this.k, tw = Math.max(0, Math.sin(t * 2.4 + i * 1.7)); M4.compose(V.set(p2.x + Math.cos(a) * r, 0.15, p2.z + Math.sin(a) * r), Q.identity(), S3.setScalar(tw * 1.4 + 0.01)); this.spark.setMatrixAt(i, M4); } this.spark.instanceMatrix.needsUpdate = true;
    // ветерок над гаванью: облака плывут, флажки колышутся
    const p3 = this.P[3]; for (let i = 0; i < 6; i++) { const u = ((t * 0.05 + i / 6) % 1), x = (u * 14 - 7) * this.k, sc = Math.sin(u * Math.PI) * (0.9 + (i % 3) * 0.25); M4.compose(V.set(p3.x + x, 7.5 + (i % 3) * 0.7, p3.z - 4 + (i % 3) * 3), Q.identity(), S3.set(1.3 * sc, 0.55 * sc, 0.9 * sc)); this.clouds.setMatrixAt(i, M4); } this.clouds.instanceMatrix.needsUpdate = true;
    this.flagM.forEach((f, i) => { f.rotation.x = Math.sin(t * 3 + i) * 0.12; f.rotation.z = Math.sin(t * 2.3 + i) * 0.04; });
    // маяки крутят луч
    this.beams.forEach((bm, i) => { bm.rotation.y = t * 1.2 + i; bm.material.opacity = 0.12 + Math.sin(t * 2 + i) * 0.04; });
    // шхуны ходят по путям туда-обратно
    this.ships.forEach((m, k) => { if (!m.visible) return; const ph = (t * 0.045 + k * 0.27) % 2, u = ph < 1 ? ph : 2 - ph; const cv = this.curves[k], pt = cv.getPoint(Math.min(0.999, Math.max(0.001, u))), tg = cv.getTangent(Math.min(0.999, Math.max(0.001, u)));
      m.position.set(pt.x, 0.05 + Math.sin(t * 2 + k) * 0.05, pt.z); m.rotation.set(Math.sin(t * 1.6 + k) * 0.05, Math.atan2(tg.x, tg.z) + (ph < 1 ? 0 : Math.PI), 0); });
    // шхуны с деньгами: из острова в остров, видно, сколько прошли
    this.cashShips.forEach((m, i) => { const x = st.tx && st.tx[i]; m.visible = !!x; if (!x) return; const a = this.P[x[0]], c = this.P[x[1]]; const u = Math.min(1, x[2] + (t - (this.txT || t)) * (1 / 90)); const mx = (a.x + c.x) * 0.25, mz = (a.z + c.z) * 0.25;
      const q = (1 - u) * (1 - u), w = 2 * u * (1 - u), v = u * u, px = q * a.x + w * mx + v * c.x, pz = q * a.z + w * mz + v * c.z, tx = 2 * (1 - u) * (mx - a.x) + 2 * u * (c.x - mx), tz = 2 * (1 - u) * (mz - a.z) + 2 * u * (c.z - mz);
      m.position.set(px, 0.08 + Math.sin(t * 2 + i) * 0.06, pz); m.rotation.set(Math.sin(t * 1.4 + i) * 0.07, Math.atan2(tx, tz), 0); });
    // кольца: где ты, что выбрано, что выбрал хозяин
    const pc = this.P[st.cur]; this.curRing.position.set(pc.x, 0.2, pc.z); this.curRing.scale.setScalar(1 + Math.sin(t * 2.5) * 0.02);
    if (this.sel >= 0) { const ps = this.P[this.sel]; this.selRing.visible = this.sel !== st.cur; this.selRing.position.set(ps.x, 0.22, ps.z); this.selRing.rotation.z = t * 0.5; } else this.selRing.visible = false;
    if (st.hostSel != null && st.hostSel >= 0) { const ph = this.P[st.hostSel]; this.hostRing.visible = true; this.hostRing.position.set(ph.x, 0.24, ph.z); this.hostRing.scale.setScalar(1 + Math.sin(t * 4) * 0.03); } else this.hostRing.visible = false;
  }
  render() { this.renderer.render(this.scene, this.camera); }
  dispose() { this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
}
