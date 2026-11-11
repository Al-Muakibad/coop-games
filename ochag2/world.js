// «Хутор» — мир-диорама: земля плитой, река с водопадами, небо, солнце и ночь, времена года, мост, декор, облака над закрытыми краями.
// Единица мира = ширина карты (78 «пикселей» симуляции). x → X, y → Z (к игроку).
import * as THREE from "three";
import { REGIONS, RIV, WORLD, CW, SITE_POS, DAY_LEN } from "./data.js";
import { KIT, FigPool, figureMaterial } from "./kit.js";

export const U = (v) => v / CW;
const RZ0 = U(RIV[0]), RZ1 = U(RIV[1]);
const SX0 = U(WORLD.x0) - 3.2, SX1 = U(WORLD.x1) + 3.2, SZ0 = U(WORLD.y0) - 3.4, SZ1 = U(WORLD.y1) + 2.6;   // края плиты
const ISL = REGIONS.island.rects[0].map(U);
const BRX = U(SITE_POS[0]);
// детерминированный шум
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy; }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function inRect(X, Z, r, pad) { pad = pad || 0; return X >= r[0] - pad && X <= r[2] + pad && Z >= r[1] - pad && Z <= r[3] + pad; }
function rectDist(X, Z, r) { const dx = Math.max(r[0] - X, 0, X - r[2]), dz = Math.max(r[1] - Z, 0, Z - r[3]); return Math.hypot(dx, dz); }
// вода: полоса реки + протоки вокруг острова
export function waterDepth(X, Z) {
  const inIsl = rectDist(X, Z, ISL);
  let w = 0;
  // основное русло
  const band = Math.min(Z - RZ0, RZ1 - Z);
  if (band > -0.35) w = Math.max(w, sstep(-0.35, 0.45, band));
  // у острова русло расходится в две протоки
  if (X < ISL[2] + 1.2) {
    const ch = Math.abs(inIsl - 0.55);
    if (inIsl > 0.01) w = Math.max(w, 1 - sstep(0.15, 0.75, ch));
    if (inIsl <= 0.05) w = 0;
  }
  return w;
}

export class World {
  constructor(scene, renderer, opt) {
    this.scene = scene; this.renderer = renderer; this.q = opt.quality;
    this.time = 0; this.stage = -1; this.season = 0; this.snow = 0;
    this.u = { uTime: { value: 0 }, uSeason: { value: new THREE.Vector3(1, 1, 1) }, uSnow: { value: 0 }, uNight: { value: 0 } };
    this.buildSky(); this.buildLights(); this.buildTerrain(); this.buildWater(); this.buildDecor(); this.buildBridge(); this.buildClouds();
  }
  /* ---------- небо и туман ---------- */
  buildSky() {
    const g = new THREE.SphereGeometry(140, 24, 12);
    this.skyU = { top: { value: new THREE.Color("#6fb1e8") }, mid: { value: new THREE.Color("#cfe6f2") }, bot: { value: new THREE.Color("#f2e0c0") }, stars: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top, mid, bot; uniform float stars; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y,0.0,1.0), 0.6)) : mix(mid, bot, clamp(-y*3.0,0.0,1.0));
          if (stars > 0.01 && y > 0.05) { vec3 q = floor(vP * 220.0); float s = step(0.996, h(q)); c += vec3(s) * stars * smoothstep(0.05, 0.4, y); }
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(g, m); this.sky.renderOrder = -10; this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog("#cfe6f2", 30, 90);
  }
  buildLights() {
    this.hemi = new THREE.HemisphereLight("#dff1ff", "#6b5a3a", 1.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff3dc", 2.4);
    this.sun.castShadow = this.q > 0;
    const sz = this.q > 1 ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 70;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.fill = new THREE.DirectionalLight("#a8c8ff", 0.35); this.fill.position.set(-10, 8, -6); this.scene.add(this.fill);
    // тёплые огни ночью (фиксированный набор — без пересборки шейдеров)
    this.lamps = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight("#ffb060", 0, 6.5, 1.6); l.position.set(0, -50, 0); this.scene.add(l); this.lamps.push(l); }
  }
  /* ---------- земля ---------- */
  buildTerrain() {
    const W = SX1 - SX0, D = SZ1 - SZ0;
    const nx = Math.round(W * 4.5), nz = Math.round(D * 4.5);
    const g = new THREE.PlaneGeometry(W, D, nx, nz); g.rotateX(-Math.PI / 2); g.translate((SX0 + SX1) / 2, 0, (SZ0 + SZ1) / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), reg = new Float32Array(pos.count);
    const C = (h) => new THREE.Color(h);
    const MEADOW = C("#7fb455"), MEADOW2 = C("#94c060"), SAND = C("#d9c48d"), MUD = C("#8a7350"), ROCK = C("#8f9a7c"), DARK = C("#4f6b55"), PATH = C("#c8ad7a");
    const MR = REGIONS.mountains.rects[0].map(U), HR = REGIONS.haunted.rects[0].map(U);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const X = pos.getX(i), Z = pos.getZ(i);
      const w = waterDepth(X, Z);
      let y = -0.42 * w;
      // мягкие холмы за пределами игрового поля
      const inPlay = inRect(X, Z, [U(WORLD.x0), 0, U(WORLD.x1), U(WORLD.y1)]);
      if (!inPlay && w < 0.05) y += vnoise(X * 0.35, Z * 0.35) * 0.5 * sstep(0, 2, rectDist(X, Z, [U(WORLD.x0), 0, U(WORLD.x1), U(WORLD.y1)]));
      pos.setY(i, y);
      const n = vnoise(X * 0.6, Z * 0.6);
      c.copy(MEADOW).lerp(MEADOW2, n);
      const md = rectDist(X, Z, MR), hd = rectDist(X, Z, HR);
      if (md < 1.5) c.lerp(ROCK, (1 - sstep(0, 1.5, md)) * (0.55 + n * 0.3));
      if (hd < 1.5) c.lerp(DARK, (1 - sstep(0, 1.5, hd)) * 0.75);
      if (inRect(X, Z, ISL, 0.4)) c.lerp(SAND, 0.55 * (1 - sstep(0, 0.4, rectDist(X, Z, ISL))));
      // берега: песок и ил у воды
      if (w > 0.02) c.lerp(w > 0.5 ? MUD : SAND, Math.min(1, w * 1.6));
      // тропинки к мосту
      const pd = Math.abs(X - BRX);
      if (pd < 0.45 && ((Z > RZ0 - 4.2 && Z < RZ0) || (Z > RZ1 && Z < RZ1 + 4.4))) c.lerp(PATH, (1 - sstep(0.18, 0.45, pd)) * 0.75);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      reg[i] = hd < 0.5 ? 1 : 0;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    const U2 = this.u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U2);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vWP; uniform vec3 uSeason; uniform float uSnow, uTime;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),u.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),u.x), u.y); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
float nn = n2(vWP.xz * 2.3) * 0.6 + n2(vWP.xz * 7.0) * 0.4;
float fl = step(0.93, h2(floor(vWP.xz * 14.0)));
vec3 base = diffuseColor.rgb;
float grassy = smoothstep(0.0, -0.05, -vWP.y - 0.02);
diffuseColor.rgb = base * (0.9 + nn * 0.2) * mix(vec3(1.0), uSeason, grassy);
diffuseColor.rgb += fl * vec3(0.06, 0.07, 0.03) * grassy;
float sn = uSnow * smoothstep(0.35, 0.65, nn + uSnow * 0.5) * grassy;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0), sn);`);
    };
    this.ground = new THREE.Mesh(g, m); this.ground.receiveShadow = true; this.scene.add(this.ground);
    // юбка-срез плиты: слои земли
    const sk = [];
    const edge = (x0, z0, x1, z1, n) => { for (let i = 0; i <= n; i++) { const t = i / n; sk.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]); } };
    edge(SX0, SZ1, SX1, SZ1, 120); edge(SX1, SZ1, SX1, SZ0, 90); edge(SX1, SZ0, SX0, SZ0, 120); edge(SX0, SZ0, SX0, SZ1, 90);
    const sp = [], sc = [], si = [];
    const TOP = C("#6b4a2e"), MID = C("#8a5d36"), BOT = C("#4a3424"), STONE = C("#7d7466");
    sk.forEach(([x, z], i) => {
      const w = waterDepth(x, z); const yt = -0.42 * w + (inRect(x, z, [U(WORLD.x0), 0, U(WORLD.x1), U(WORLD.y1)]) ? 0 : 0);
      const layers = [[yt, TOP], [yt - 0.25, MID], [-1.1, STONE], [-2.4 - vnoise(x, z) * 0.6, BOT]];
      for (const [y, cc] of layers) { sp.push(x, y, z); sc.push(cc.r, cc.g, cc.b); }
    });
    for (let i = 0; i < sk.length - 1; i++) for (let l = 0; l < 3; l++) { const a = i * 4 + l, b = (i + 1) * 4 + l; si.push(a, b, a + 1, b, b + 1, a + 1); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3)); sg.setIndex(si);
    sg.computeVertexNormals();
    const skirt = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); this.scene.add(skirt);
    // фикс высот юбки по реальной земле
    const terrH = (x, z) => -0.42 * waterDepth(x, z);
    for (let i = 0; i < sk.length; i++) { const [x, z] = sk[i]; const yt = Math.min(this.heightAt(x, z), terrH(x, z)); sg.attributes.position.setY(i * 4, yt); sg.attributes.position.setY(i * 4 + 1, yt - 0.25); }
    sg.attributes.position.needsUpdate = true; sg.computeVertexNormals();
  }
  heightAt(X, Z) {
    const pos = this.ground.geometry.attributes.position;
    // приблизительно: ближайшая вершина сетки
    const g = this.ground.geometry.parameters, nx = g.widthSegments, nz = g.heightSegments;
    const ix = Math.round((X - SX0) / (SX1 - SX0) * nx), iz = Math.round((Z - SZ0) / (SZ1 - SZ0) * nz);
    if (ix < 0 || iz < 0 || ix > nx || iz > nz) return 0;
    return pos.getY(iz * (nx + 1) + ix);
  }
  /* ---------- вода ---------- */
  buildWater() {
    const g = new THREE.PlaneGeometry(SX1 - SX0 + 0.2, SZ1 - SZ0, 1, 1); g.rotateX(-Math.PI / 2); g.translate((SX0 + SX1) / 2, -0.17, (SZ0 + SZ1) / 2);
    // маска воды в текстуре (по той же функции)
    const tw = 512, th = 256, data = new Uint8Array(tw * th * 4);
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      const X = SX0 + (i + 0.5) / tw * (SX1 - SX0), Z = SZ0 + (j + 0.5) / th * (SZ1 - SZ0);
      const w = waterDepth(X, Z); const k = (j * tw + i) * 4;
      data[k] = Math.round(w * 255); data[k + 1] = 0; data[k + 2] = 0; data[k + 3] = 255;
    }
    const mask = new THREE.DataTexture(data, tw, th); mask.needsUpdate = true; mask.magFilter = THREE.LinearFilter; mask.minFilter = THREE.LinearFilter;
    this.waterU = { uTime: this.u.uTime, uMask: { value: mask }, uDeep: { value: new THREE.Color("#2a8fa8") }, uShal: { value: new THREE.Color("#7fd6d2") }, uSky: { value: new THREE.Color("#cfe6f2") }, uNight: this.u.uNight, uSun: { value: new THREE.Vector3(0.3, 0.8, 0.4) }, uFrost: this.u.uSnow };
    const m = new THREE.ShaderMaterial({
      uniforms: this.waterU, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vUv; varying vec3 vWP; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uTime, uNight, uFrost; uniform sampler2D uMask; uniform vec3 uDeep, uShal, uSky, uSun; varying vec2 vUv; varying vec3 vWP;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),u.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),u.x), u.y); }
        void main(){
          float m = texture2D(uMask, vec2(vUv.x, 1.0 - vUv.y)).r;
          if (m < 0.02) discard;
          vec2 p = vWP.xz; float t = uTime;
          float flow = n2(vec2(p.x * 1.3 - t * 0.6, p.y * 2.6)) * 0.6 + n2(vec2(p.x * 3.1 - t * 1.1, p.y * 5.0 + 3.0)) * 0.4;
          float lines = smoothstep(0.62, 0.7, n2(vec2(p.x * 0.9 - t * 0.9, p.y * 7.0))) * 0.5;
          vec3 c = mix(uShal, uDeep, smoothstep(0.25, 0.95, m));
          c = mix(c, uSky, 0.12 + flow * 0.1);
          c *= 0.92 + flow * 0.16;
          c += vec3(0.9, 0.95, 1.0) * lines * 0.45 * (1.0 - uNight * 0.7) * smoothstep(0.4, 0.9, m);
          float foam = smoothstep(0.42, 0.18, m) * (0.55 + 0.45 * n2(p * 6.0 + t));
          c = mix(c, vec3(0.95, 0.98, 1.0), foam * 0.75);
          float sp = step(0.985, n2(p * 9.0 + vec2(t * 2.0, 0.0))) * (1.0 - uNight);
          c += sp * 0.8;
          c = mix(c, vec3(0.85, 0.92, 0.98), uFrost * 0.5 * smoothstep(0.3, 0.7, n2(p * 1.7)));
          c *= mix(1.0, 0.35, uNight);
          gl_FragColor = vec4(c, mix(0.55, 0.92, smoothstep(0.1, 0.6, m)));
        }`,
    });
    this.water = new THREE.Mesh(g, m); this.water.renderOrder = 2; this.scene.add(this.water);
    // водопады на краях плиты
    const wf = [];
    for (const [x, z0, z1] of [[SX1, RZ0, RZ1], [SX0, ISL[1] - 0.9, ISL[1] - 0.2], [SX0, ISL[3] + 0.2, ISL[3] + 0.9]]) {
      const fg = new THREE.PlaneGeometry(z1 - z0, 2.6, 1, 1); fg.rotateY(Math.PI / 2); fg.translate(x + (x > 0 ? 0.01 : -0.01), -1.45, (z0 + z1) / 2);
      wf.push(fg);
    }
    this.fallU = { uTime: this.u.uTime, uNight: this.u.uNight };
    const fm = new THREE.ShaderMaterial({ uniforms: this.fallU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime, uNight; varying vec2 vUv; float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main(){ float s = h2(floor(vec2(vUv.x * 30.0, vUv.y * 6.0 + uTime * 4.0))); vec3 c = mix(vec3(0.45,0.75,0.85), vec3(0.95,0.98,1.0), s * 0.6 + (1.0 - vUv.y) * 0.3);
          c *= mix(1.0, 0.4, uNight); gl_FragColor = vec4(c, (0.55 + s * 0.35) * smoothstep(0.0, 0.25, vUv.y)); }` });
    for (const fg of wf) { const f = new THREE.Mesh(fg, fm); f.renderOrder = 3; this.scene.add(f); }
  }
  /* ---------- декор: деревья, камни, цветы, овцы, горы ---------- */
  buildDecor() {
    const items = [];
    let seed = 1234; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const play = [U(WORLD.x0), 0, U(WORLD.x1), U(WORLD.y1)];
    const regions = Object.values(REGIONS).flatMap((R) => R.rects.map((q) => q.map(U)));
    const freeAt = (X, Z, pad) => !regions.some((q) => inRect(X, Z, q, pad)) && waterDepth(X, Z) < 0.02 && rectDist(X, Z, [BRX - 0.8, RZ0 - 0.5, BRX + 0.8, RZ1 + 0.5]) > 0.2;
    const MR = REGIONS.mountains.rects[0].map(U), HR = REGIONS.haunted.rects[0].map(U);
    for (let i = 0; i < 1600 && items.length < 360; i++) {
      const X = SX0 + 0.4 + r() * (SX1 - SX0 - 0.8), Z = SZ0 + 0.4 + r() * (SZ1 - SZ0 - 0.8);
      if (!freeAt(X, Z, 0.25)) continue;
      const nearM = rectDist(X, Z, MR) < 3.2, nearH = rectDist(X, Z, HR) < 3;
      let k;
      if (nearH) k = r() < 0.6 ? "deadtree" : r() < 0.5 ? "d_pine" : "d_rock2";
      else if (nearM) k = r() < 0.4 ? "d_pine" : r() < 0.5 ? "d_rock" : "tree";
      else { const q = r(); k = q < 0.3 ? "tree" : q < 0.5 ? "tree2" : q < 0.56 ? "d_tree" : q < 0.66 ? "d_pine" : q < 0.72 ? "forest" : q < 0.8 ? "d_rock2" : "d_flowers"; }
      items.push({ k, X, Z, s: (k === "tree" || k === "tree2" ? 1.3 : k === "forest" ? 1.6 : 0.75) + r() * 0.6, ry: r() * 6.28 });
    }
    for (let i = 0; i < 90; i++) {
      const X = U(WORLD.x0) + r() * (U(WORLD.x1) - U(WORLD.x0)), Z = r() * U(WORLD.y1);
      if (waterDepth(X, Z) > 0.01) continue;
      items.push({ k: "d_flowers", X, Z, s: 0.26 + r() * 0.2, ry: r() * 6.28, low: 1 });
    }
    for (let i = 0; i < 16; i++) items.push({ k: i % 2 ? "d_mount" : "d_mount2", X: SX0 + 2 + i * (SX1 - SX0 - 4) / 15 + (r() - 0.5) * 1.5, Z: SZ0 - 1.6 - r() * 1.5, s: 1.4 + r() * 0.8, ry: r() * 6.28, far: 1 });
    for (let i = 0; i < 14; i++) { const X = SX0 + 1 + r() * (SX1 - SX0 - 2), Z = SZ0 + 1 + r() * (SZ1 - SZ0 - 2); if (!freeAt(X, Z, 0.6) || rectDist(X, Z, HR) < 3) continue; items.push({ k: r() < 0.6 ? "d_sheep" : "d_chick", X, Z, s: 1, ry: r() * 6.28 }); }
    this.decor = items;
    // статичный декор: сливаем по кускам карты (6×4) — один вызов отрисовки на кусок, невидимые куски отсекаются
    const LEAFY = { tree: 1, tree2: 1, d_tree: 1, forest: 1, d_flowers: 1, d_grass: 1, d_bush: 1 };
    const CX = 6, CZ = 4, chunks = [];
    for (let i = 0; i < CX * CZ; i++) chunks.push([]);
    for (const it of items) { const ci = Math.max(0, Math.min(CX - 1, Math.floor((it.X - SX0) / (SX1 - SX0) * CX))) + Math.max(0, Math.min(CZ - 1, Math.floor((it.Z - SZ0 - 3) / (SZ1 - SZ0 + 3) * CZ))) * CX; chunks[ci].push(it); }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const U2 = this.u;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSeason = U2.uSeason; sh.uniforms.uSnow = U2.uSnow;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform vec3 uSeason; uniform float uSnow;")
        .replace("#include <color_vertex>", `vec3 cs = pow(color.rgb, vec3(2.2)); if (color.a > 0.5) { cs *= uSeason; cs = mix(cs, vec3(0.9, 0.93, 0.98), uSnow * 0.55 * step(0.3, normal.y + 0.5)); } vColor = vec4(cs, 1.0);`);
    };
    mat.customProgramCacheKey = () => "decor1";
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
    this.decorTris = 0;
    for (const list of chunks) {
      if (!list.length) continue;
      let nv = 0, ni = 0;
      for (const it of list) { const g = KIT[it.k] && KIT[it.k].geo; if (!g) continue; nv += g.attributes.position.count; ni += g.index.count; }
      const P = new Float32Array(nv * 3), C = new Uint8Array(nv * 4), I = new Uint32Array(ni);
      let vo = 0, io = 0;
      for (const it of list) {
        const g = KIT[it.k] && KIT[it.k].geo; if (!g) continue;
        q.setFromAxisAngle(up, it.ry); sv.setScalar(it.s); pv.set(it.X, this.heightAt(it.X, it.Z) - 0.03, it.Z); m4.compose(pv, q, sv);
        const pa = g.attributes.position, ca = g.attributes.color.array, ia = g.index.array;
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(m4); P[(vo + i) * 3] = v.x; P[(vo + i) * 3 + 1] = v.y; P[(vo + i) * 3 + 2] = v.z; C[(vo + i) * 4] = ca[i * 4]; C[(vo + i) * 4 + 1] = ca[i * 4 + 1]; C[(vo + i) * 4 + 2] = ca[i * 4 + 2]; C[(vo + i) * 4 + 3] = LEAFY[it.k] ? 255 : 0; }
        for (let i = 0; i < ia.length; i++) I[io + i] = ia[i] + vo;
        vo += pa.count; io += ia.length;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("color", new THREE.BufferAttribute(C, 4, true)); geo.setIndex(new THREE.BufferAttribute(I, 1));
      geo.computeBoundingSphere(); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
      this.decorTris += ni / 3;
    }
  }
  tintDecor() {}
  /* ---------- мост ---------- */
  buildBridge() {
    this.bridge = new THREE.Group(); this.scene.add(this.bridge);
    const cv = document.createElement("canvas"); cv.width = cv.height = 64; const x = cv.getContext("2d"); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,220,150,1)"); g.addColorStop(0.35, "rgba(255,170,80,.5)"); g.addColorStop(1, "rgba(255,120,40,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(cv); this.glowSprites = [];
    for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); sp.scale.setScalar(1.2); sp.visible = false; this.scene.add(sp); this.glowSprites.push(sp); }
    this.bridgeParts = [];
    this.bridgeLights = [];
  }
  setStage(s, animate) {
    if (s === this.stage) return;
    const prev = this.stage; this.stage = s;
    while (this.bridge.children.length) this.bridge.remove(this.bridge.children[0]);
    this.bridgeLights = [];
    const parts = [];
    const box = (w, h, d, x, y, z, col, ry, st) => parts.push({ g: new THREE.BoxGeometry(w, h, d), x, y, z, col, ry: ry || 0, st });
    const cyl = (r1, r2, h, x, y, z, col, st, seg) => parts.push({ g: new THREE.CylinderGeometry(r1, r2, h, seg || 7), x, y, z, col, st });
    const z0 = RZ0 - 0.55, z1 = RZ1 + 0.55, L = z1 - z0, cz = (z0 + z1) / 2, X = BRX;
    const WOOD = "#8a5a32", WOOD2 = "#a8723f", STONE = "#a9aeb6", STONE2 = "#8e939b", IRON = "#4a4f57";
    // 0: плот-стройплощадка с колышками
    if (s < 3) { box(1.25, 0.08, 1.55, X, -0.12, cz, WOOD2, 0, 0); for (const dx of [-0.55, 0.55]) for (const dz of [-0.65, 0.65]) cyl(0.04, 0.04, 0.35, X + dx, 0.0, cz + dz, WOOD, 0); }
    // 1: сваи
    if (s >= 1) for (const zz of [z0 + 0.35, z0 + 0.95, z1 - 0.95, z1 - 0.35]) for (const dx of [-0.48, 0.48]) cyl(0.07, 0.08, 0.9, X + dx, -0.2, zz, WOOD, 1);
    // 2: каменные опоры
    if (s >= 2) for (const zz of [z0 + 0.7, z1 - 0.7]) { box(1.25, 0.62, 0.42, X, -0.12, zz, STONE, 0, 2); box(1.35, 0.1, 0.5, X, 0.2, zz, STONE2, 0, 2); }
    // 3: настил
    if (s >= 3) { for (let i = 0; i < 14; i++) box(1.22, 0.06, L / 14 - 0.015, X, 0.29, z0 + (i + 0.5) * L / 14, i % 2 ? WOOD2 : "#b98250", 0, 3); for (const dx of [-0.6, 0.6]) box(0.08, 0.1, L, X + dx, 0.26, cz, WOOD, 0, 3); }
    // 4: перила и фонари
    if (s >= 4) {
      for (const dx of [-0.6, 0.6]) { box(0.05, 0.05, L, X + dx, 0.62, cz, WOOD, 0, 4); for (let i = 0; i <= 6; i++) box(0.06, 0.34, 0.06, X + dx, 0.46, z0 + i * L / 6, WOOD, 0, 4); }
      for (const dx of [-0.6, 0.6]) for (const zz of [z0 + 0.1, z1 - 0.1]) { cyl(0.03, 0.03, 0.5, X + dx, 0.7, zz, IRON, 4, 5); box(0.12, 0.14, 0.12, X + dx, 0.98, zz, "#ffd88a", 0, 4); this.bridgeLights.push(new THREE.Vector3(X + dx, 1.0, zz)); }
    }
    // 5: Арка Очага с огнём
    if (s >= 5) {
      for (const dx of [-0.66, 0.66]) { box(0.22, 1.25, 0.32, X + dx, 0.9, cz, STONE, 0, 5); box(0.28, 0.1, 0.38, X + dx, 1.55, cz, STONE2, 0, 5); }
      for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; box(0.2, 0.18, 0.3, X - Math.cos(a) * 0.66, 1.6 + Math.sin(a) * 0.42, cz, i % 2 ? STONE : STONE2, 0, 5); }
      cyl(0.18, 0.12, 0.16, X, 2.12, cz, IRON, 5, 8);
      box(0.05, 0.5, 0.36, X - 0.55, 1.15, cz + 0.2, "#f08a3c", 0, 5); box(0.05, 0.5, 0.36, X + 0.55, 1.15, cz + 0.2, "#3fb8c8", 0, 5);
      this.bridgeLights.push(new THREE.Vector3(X, 2.35, cz));
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const byStage = {};
    for (const p of parts) { (byStage[p.st] || (byStage[p.st] = [])).push(p); }
    for (const st in byStage) {
      const geos = byStage[st].map((p) => { const g = p.g.toNonIndexed(); g.rotateY(p.ry || 0); g.translate(p.x, p.y, p.z); const c = new THREE.Color(p.col); const n = g.attributes.position.count; const ca = new Float32Array(n * 3); for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; } g.setAttribute("color", new THREE.BufferAttribute(ca, 3)); g.deleteAttribute("uv"); g.deleteAttribute("normal"); return g; });
      const merged = mergeGeos(geos);
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true;
      if (animate && +st === s && s > prev) { mesh.userData.rise = 0; mesh.position.y = -1.2; }
      this.bridge.add(mesh);
    }
  }
  /* ---------- облака над закрытыми краями ---------- */
  buildClouds() {
    this.cloudPool = new FigPool(this.scene, "d_cloud", 90, { shadow: false, material: figureMaterial(true) });
    this.cloudPool2 = new FigPool(this.scene, "d_cloud2", 60, { shadow: false, material: figureMaterial(true) });
    this.clouds = [];
    let seed = 99; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const b of ["island", "mountains", "haunted"]) {
      const q = REGIONS[b].rects[0].map(U);
      const n = Math.round((q[2] - q[0]) * (q[3] - q[1]) / 4.2);
      for (let i = 0; i < n; i++) this.clouds.push({ b, X: q[0] + 0.6 + r() * (q[2] - q[0] - 1.2), Z: q[1] + 0.4 + r() * (q[3] - q[1] - 0.8), y: 0.25 + r() * 0.5, s: 1.0 + r() * 0.8, ry: r() * 6.28, big: r() < 0.6, ph: r() * 6.28, gone: 0 });
    }
    // облака на небе (далеко, над плитой)
    for (let i = 0; i < 0; i++) this.clouds.push({ b: "sky", X: SX0 + r() * (SX1 - SX0), Z: SZ0 + r() * (SZ1 - SZ0), y: 7 + r() * 3, s: 1.6 + r(), ry: r() * 6.28, big: true, ph: r() * 6.28, gone: 0, drift: 0.25 + r() * 0.2 });
  }
  /* ---------- кадр ---------- */
  update(dt, G, cam, opts) {
    this.time += dt; this.u.uTime.value = this.time;
    // время суток: k — доля дня; night 0..1
    let night = 0, warm = 0, elev;
    if (G) {
      const k = G.ph === "day" ? G.t / DAY_LEN : 1;
      if (G.ph !== "day") night = 1;
      else if (k > 0.82) night = sstep(0.82, 1.0, k);
      else if (k < 0.05) night = 0.4 * (1 - sstep(0, 0.05, k));
      warm = G.ph === "day" ? Math.max(1 - sstep(0.0, 0.16, k), sstep(0.68, 0.86, k) * (1 - sstep(0.93, 1, k))) : 0;
      elev = G.ph === "day" ? Math.sin(Math.min(1, k * 1.08) * Math.PI) : -0.2;
      this.dayK = k;
    } else { night = opts && opts.night || 0; warm = opts && opts.warm || 0.25; elev = 0.7; }
    if (this.night == null || this.snap) { this.night = night; this.warm = warm; this.snap = false; const op = (G && G.open) || {}; for (const c of this.clouds) if (c.b !== "sky") c.gone = op[c.b] ? 1 : 0; }
    this.night += (night - this.night) * Math.min(1, dt * 1.8);
    this.warm += (warm - this.warm) * Math.min(1, dt * 1.8);
    const N = this.night, Wm = this.warm;
    this.u.uNight.value = N;
    // небо
    const day = { top: new THREE.Color("#5ea7e6"), mid: new THREE.Color("#cfe8f5"), bot: new THREE.Color("#efe2c4") };
    const dusk = { top: new THREE.Color("#4b5f9e"), mid: new THREE.Color("#f6b27a"), bot: new THREE.Color("#e98a6a") };
    const nite = { top: new THREE.Color("#0b1330"), mid: new THREE.Color("#1d2c55"), bot: new THREE.Color("#2a2a40") };
    for (const kk of ["top", "mid", "bot"]) this.skyU[kk].value.copy(day[kk]).lerp(dusk[kk], Wm).lerp(nite[kk], N);
    this.skyU.stars.value = N;
    this.scene.fog.color.copy(this.skyU.mid.value).lerp(new THREE.Color("#30405a"), N * 0.4);
    this.waterU.uSky.value.copy(this.skyU.mid.value);
    // солнце следует за камерой (тени только вокруг видимой части)
    const az = -0.9 + (this.dayK || 0.4) * 1.8;
    const el = Math.max(0.25, elev);
    const tx = cam.tx, tz = cam.tz;
    this.sun.position.set(tx + Math.sin(az) * 15, 2.5 + el * 17, tz - 5 + Math.cos(az) * 4);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.color.set("#fff3dc").lerp(new THREE.Color("#ff8a3a"), Wm).lerp(new THREE.Color("#6f8cff"), N);
    this.sun.intensity = (2.5 - Wm * 0.5) * (1 - N * 0.85);
    this.hemi.color.set("#dff1ff").lerp(new THREE.Color("#ffb07a"), Wm).lerp(new THREE.Color("#33447a"), N);
    this.hemi.groundColor.set("#6b5a3a").lerp(new THREE.Color("#4a2a3a"), Wm).lerp(new THREE.Color("#141428"), N);
    this.hemi.intensity = 1.15 - Wm * 0.4 - N * 0.45;
    this.fill.intensity = 0.35 + N * 0.45;
    // огни: ближайшие к центру экрана источники (костры, кузня, фонари моста)
    const lights = (opts && opts.lights || []).concat(this.stage >= 4 ? this.bridgeLights.map((v) => ({ X: v.x, Y: v.y, Z: v.z, k: 0.4 })) : []);
    lights.sort((a, b) => ((a.X - tx) ** 2 + (a.Z - tz) ** 2) - ((b.X - tx) ** 2 + (b.Z - tz) ** 2));
    const lampOn = Math.max(N, Wm * 0.5);
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i], s = lights[i];
      if (s && lampOn > 0.05) { l.position.set(s.X, s.Y || 0.7, s.Z); l.intensity = lampOn * 2.6 * (s.k || 1) * (0.9 + Math.sin(this.time * 9 + i * 2) * 0.05 + Math.sin(this.time * 23 + i) * 0.04); }
      else l.intensity = 0;
    }
    this.lampOn = lampOn;
    this.glowSprites.forEach((sp, i) => { const v = this.bridgeLights[i]; if (v && lampOn > 0.05) { sp.visible = true; sp.position.copy(v); const big = i === this.bridgeLights.length - 1 && this.stage >= 5; sp.scale.setScalar(big ? 2.6 : 1.1); sp.material.opacity = Math.min(1, lampOn * 1.2) * (0.85 + Math.sin(this.time * 7 + i) * 0.1); } else sp.visible = false; });
    // время года
    if (G && G.season !== this.season) { this.season = G.season; this.tintDecor(this.season); }
    const SEAS = [[1.0, 1.06, 0.92], [1, 1, 1], [1.28, 0.98, 0.62], [0.98, 1.0, 1.06]];
    const st = SEAS[this.season || 0]; this.u.uSeason.value.lerp(new THREE.Vector3(st[0], st[1], st[2]), Math.min(1, dt));
    this.snow += ((this.season === 3 ? 1 : 0) - this.snow) * Math.min(1, dt * 0.5); this.u.uSnow.value = this.snow;
    // облака
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.cloudPool.begin(); this.cloudPool2.begin();
    const open = (G && G.open) || { home: 1 };
    const cc = new THREE.Color(1, 1, 1).lerp(new THREE.Color("#ffd8b0"), Wm * 0.6).lerp(new THREE.Color("#4a5478"), N * 0.85);
    for (const c of this.clouds) {
      if (c.b !== "sky" && open[c.b]) c.gone = Math.min(1, c.gone + dt * 0.45); else if (c.b !== "sky") c.gone = Math.max(0, c.gone - dt);
      if (c.gone >= 1) continue;
      const g = c.gone, e = g * g;
      if (c.drift) { c.X += c.drift * dt; if (c.X > SX1 + 4) c.X = SX0 - 4; }
      q.setFromAxisAngle(up, c.ry + Math.sin(this.time * 0.1 + c.ph) * 0.1);
      sv.setScalar(c.s * (1 - e * 0.7)); pv.set(c.X + e * (c.X > 9 ? 4 : -4), c.y + Math.sin(this.time * 0.4 + c.ph) * 0.08 + e * 5, c.Z);
      m.compose(pv, q, sv); (c.big ? this.cloudPool : this.cloudPool2).push(m, 0, -1, 0, N * 0.05, cc);
    }
    this.cloudPool.end(); this.cloudPool2.end();
    // мост вырастает
    for (const ch of this.bridge.children) if (ch.userData.rise != null) { ch.userData.rise = Math.min(1, ch.userData.rise + dt * 0.7); const e = 1 - Math.pow(1 - ch.userData.rise, 3); ch.position.y = -1.2 * (1 - e); if (ch.userData.rise >= 1) delete ch.userData.rise; }
  }
}

function mergeGeos(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { p.set(g.attributes.position.array, o * 3); c.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(p, 3)); out.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return out;
}
export { SX0, SX1, SZ0, SZ1, RZ0, RZ1, BRX };
