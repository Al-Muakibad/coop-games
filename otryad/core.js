// «Отряд» — общий 3D-движок. Подход как в Аванпосте (oborona/): ACES-тонмаппинг, мягкие тени от солнца,
// небо-окружение (PMREM), bloom; бойцы — модели KayKit с «запечённым» бегом (два кадра в вершинах, смешиваются в шейдере),
// три уровня детализации: подробная модель вблизи, упрощённая подальше, спрайт-импостор вдали.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FX, COL } from "./fx.js";
export { THREE, COL };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const RED = 0xe5393b;

// ---------- биомы ----------
// road/ground/cliff — текстуры Poly Haven; leaf — оттенок листвы; trees — какие деревья растут
export const BIOMES = {
  meadow:  { name: "Луга",    skyTop: "#4f9fe8", skyBot: "#cfeaff", fog: 0xbfe0f5, sun: 0xfff0d2, sunI: 2.4, hemi: [0xe2f3ff, 0x587a3a], exp: 1.0,
    road: "stone", ground: "grass", cliff: "rocks", rockTint: 0xb5aa98, leaf: null, trees: ["CommonTree_3", "Pine_2", "Pine_5"], bush: ["Bush_Common", "Bush_Common_Flowers", "Fern_1", "Flower_3_Group"], fence: "fence_wood_straight", banner: 0x2f6fe0 },
  desert:  { name: "Пустыня", skyTop: "#e98d45", skyBot: "#ffe6bf", fog: 0xf3d6ae, sun: 0xffe0b0, sunI: 2.7, hemi: [0xfff0d8, 0xa87a48], exp: 0.95,
    road: "sandpave", ground: "sand", cliff: "sandblock", rockTint: 0xe0a46a, leaf: null, trees: ["DeadTree_1"], bush: ["cactus", "Rock_Medium_2", "cactus"], fence: "fence_stone_straight", banner: 0xc0392b },
  snow:    { name: "Снега",   skyTop: "#6e9fdc", skyBot: "#eef5ff", fog: 0xdfeaf8, sun: 0xffffff, sunI: 2.2, hemi: [0xeef6ff, 0x8aa0bd], exp: 0.92,
    road: "snowpath", ground: "snow2", cliff: "rocks", rockTint: 0xd8e2ee, leaf: 0xe8f2ff, trees: ["Pine_2", "Pine_5"], bush: ["Rock_Medium_1", "Pine_5"], fence: "fence_wood_straight", banner: 0x2f6fe0 },
  autumn:  { name: "Осень",   skyTop: "#e7875c", skyBot: "#ffe0c6", fog: 0xf1cfb4, sun: 0xffd2a0, sunI: 2.3, hemi: [0xffe6cc, 0x7a4a24], exp: 1.0,
    road: "mudleaf", ground: "leaves", cliff: "rocks", rockTint: 0xa88b74, leaf: 0xf08a2a, trees: ["CommonTree_3", "Pine_5", "Pine_2"], bush: ["Bush_Common", "Mushroom_Common", "Fern_1"], fence: "fence_wood_straight", banner: 0xd35400 },
  volcano: { name: "Вулкан",  skyTop: "#2a0f0c", skyBot: "#c4502a", fog: 0x5a2618, sun: 0xffa070, sunI: 2.0, hemi: [0xff9a70, 0x2a1210], exp: 1.05,
    road: "volctile", ground: "burnt", cliff: "darkrock", rockTint: 0x5a4844, leaf: 0x3a2a24, trees: ["DeadTree_1"], bush: ["Rock_Medium_3", "lava"], fence: "fence_stone_straight", banner: 0x8e2a1a, embers: 1 },
  night:   { name: "Ночь",    skyTop: "#0b0a26", skyBot: "#4c3a9c", fog: 0x231c4c, sun: 0xb0b8ff, sunI: 1.5, hemi: [0x8a8cff, 0x1a1636], exp: 1.1,
    road: "mosaic", ground: "forest", cliff: "darkrock", rockTint: 0x6a6aa0, leaf: 0x3a6a8a, trees: ["Pine_5", "Pine_5", "TwistedTree_1"], bush: ["crystal", "Mushroom_Common", "Fern_1"], fence: "fence_stone_straight", banner: 0x6a3cff, torches: 1 }
};
export const BIOME_ORDER = ["meadow", "desert", "snow", "autumn", "volcano", "night"];

// ---------- ассеты ----------
export const A = { units: {}, tex: {}, env: {}, ready: false, wind: { value: 0 } };
const V = "?v=1";
const texL = new THREE.TextureLoader(), texC = {};
export function tex(name, kind, rep) {
  const key = name + kind + (rep || ""); if (texC[key]) return texC[key];
  const t = texL.load(`assets/tex/${name}_${kind}.webp${V}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (kind === "d") t.colorSpace = THREE.SRGBColorSpace;
  texC[key] = t; return t;
}
const pbrC = {};
export function pbr(name, opts, noNormal) {
  const key = name + JSON.stringify(opts || {}) + (noNormal ? "n" : ""); if (pbrC[key]) return pbrC[key];
  const m = new THREE.MeshStandardMaterial(Object.assign({ map: tex(name, "d"), roughness: 0.88, metalness: 0, envMapIntensity: 0.35 }, opts || {}));
  if (!noNormal) { m.normalMap = tex(name, "n"); m.normalScale.set(0.9, 0.9); }
  m.userData.keep = 1; pbrC[key] = m; return m;
}
// UV куба по реальным размерам граней (текстура не растягивается на длинной дороге)
export function boxUV(g, w, h, d, s) {
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s); }
  return g;
}
function windify(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = A.wind;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWind;").replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec4 wpos = instanceMatrix * vec4(0.,0.,0.,1.);
      #else
        vec4 wpos = modelMatrix * vec4(0.,0.,0.,1.);
      #endif
      float hh = max(0.0, position.y);
      float sw = sin(uWind * 1.6 + wpos.x * 0.37 + wpos.z * 0.23 + position.x * 0.8) * 0.5 + sin(uWind * 2.7 + wpos.z * 0.5) * 0.2;
      transformed.x += sw * hh * 0.035; transformed.z += cos(uWind * 1.3 + wpos.x * 0.3) * hh * 0.02;`);
  };
  m.customProgramCacheKey = () => "wind";
}
function parseUnits(buf) {
  const dv = new DataView(buf), hl = dv.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), base = 4 + hl;
  const F = (o) => new Float32Array(buf, base + o[0], o[1]), I = (o) => new Uint16Array(buf, base + o[0], o[1]);
  for (const [k, u] of Object.entries(head.units)) {
    const out = { heads: u.heads, tex: u.tex, tris: u.tris, lod: {} };
    for (const [l, g] of Object.entries(u.lod)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(F(g.P), 3)); geo.setAttribute("aPosB", new THREE.BufferAttribute(F(g.B), 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(F(g.U), 2)); geo.setIndex(new THREE.BufferAttribute(I(g.I), 1));
      geo.computeVertexNormals(); geo.computeBoundingSphere();
      out.lod[l] = geo;
    }
    A.units[k] = out;
  }
  // v2: строки атласа импосторов по видам бойцов
  A.impRows = head.impRows || ["blue"];
  if (!A.units.red) A.units.red = A.units.blue;
}
export async function loadAssets(onProgress) {
  const p = (x) => { onProgress && onProgress(x); };
  const loadTex = (u, flip) => new Promise((res) => texL.load(u + V, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = flip; res(t); }, null, () => res(null)));
  const [bin, env, kt, bt, it, rt] = await Promise.all([
    fetch("assets/units.bin" + V).then((r) => r.arrayBuffer()),
    new Promise((res, rej) => new GLTFLoader().load("assets/env.glb" + V, res, (e) => e.total && p(0.3 + 0.6 * e.loaded / e.total), rej)),
    loadTex("assets/knight.webp", false), loadTex("assets/barbarian.webp", false), loadTex("assets/impostor.webp", true), loadTex("assets/rogue.webp", false)
  ]);
  parseUnits(bin);
  A.tex.knight = kt; A.tex.barbarian = bt; A.tex.impostor = it; A.tex.rogue = rt;
  for (const ch of [...env.scene.children]) {
    ch.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material; m.metalness = 0; m.roughness = Math.max(0.6, m.roughness); m.envMapIntensity = 0.55; m.userData.keep = 1;
      if (/Leaves|Grass|Flowers|Leaf/i.test(m.name) && !m.userData.wind) { m.userData.wind = 1; m.side = THREE.DoubleSide; m.alphaTest = Math.max(m.alphaTest || 0, 0.4); m.transparent = false; windify(m); }
      if (m.name === "MI_Banner") { m.metalness = 0; m.roughness = 0.8; }
    });
    A.env[ch.name] = ch;
  }
  A.ready = true; p(1);
}

// ---------- движок ----------
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const R = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, 260);
    this.hemi = new THREE.HemisphereLight(0xe2f3ff, 0x587a3a, 1.0);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d2, 2.3);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 22, bottom: -14, near: 1, far: 80 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
    this.scene.add(this.hemi, sun, sun.target);
    this.uTime = { value: 0 };
    this.shakeA = 0; this.shakeOff = new THREE.Vector3();
    this.mobile = matchMedia("(pointer:coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.quality = this.mobile ? 1 : 2;
    this.fps = 60; this._acc = 0; this._n = 0; this._t = 0; this.envs = {};
    this.fxList = [];
    this.applyQuality();
    addEventListener("resize", () => this.resize());
  }
  applyQuality() {
    const q = this.quality, R = this.renderer;
    this.DPR = Math.min(devicePixelRatio || 1, [1, 1.5, 2][q]);
    R.setPixelRatio(this.DPR);
    R.shadowMap.enabled = q > 0;
    const sz = [0, 1024, 2048][q];
    if (sz && this.sun.shadow.mapSize.x !== sz) { this.sun.shadow.mapSize.set(sz, sz); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.scene.traverse((o) => { if (o.isMesh && o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    if (q > 0) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q === 2 ? 4 : 0 });
      this.composer = new EffectComposer(R, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.35, 1.0);
      this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    } else this.composer = null;
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.DPR); this.composer.setSize(w, h); this.bloom.resolution.set(w * this.DPR / 2, h * this.DPR / 2); }
    this.W = w; this.H = h;
    for (const f of this.fxList) f.add.mat.uniforms.scale.value = f.norm.mat.uniforms.scale.value = h * this.DPR * 0.6;
  }
  // небо, свет, туман и отражения окружения по биому
  setBiome(id) {
    const b = BIOMES[id] || BIOMES.meadow; this.biome = b; this.biomeId = id;
    const c = document.createElement("canvas"); c.width = 4; c.height = 256;
    const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, b.skyTop); gr.addColorStop(0.6, b.skyBot); gr.addColorStop(1, b.skyBot);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    if (this.scene.background && this.scene.background.dispose) this.scene.background.dispose();
    this.scene.background = tx;
    this.scene.fog = new THREE.Fog(b.fog, 75, 200);
    this.hemi.color.set(b.hemi[0]); this.hemi.groundColor.set(b.hemi[1]); this.hemi.intensity = 0.8;
    this.sun.color.set(b.sun); this.sun.intensity = b.sunI;
    this.renderer.toneMappingExposure = b.exp * 0.92;
    this.scene.environment = this.envFor(id, b);
  }
  envFor(id, b) {
    if (this.envs[id]) return this.envs[id];
    const sc = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 24, 12), col = [], top = new THREE.Color(b.skyTop), bot = new THREE.Color(b.skyBot), gnd = new THREE.Color(b.hemi[1]);
    for (let i = 0; i < geo.attributes.position.count; i++) { const y = geo.attributes.position.getY(i) / 10; const c = y > 0 ? bot.clone().lerp(top, Math.pow(y, 0.6)) : bot.clone().lerp(gnd, Math.min(1, -y * 3)); col.push(c.r, c.g, c.b); }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const sunM = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(b.sun).multiplyScalar(6) })); sunM.position.set(-4, 6, 4); sc.add(sunM);
    const pm = new THREE.PMREMGenerator(this.renderer), env = pm.fromScene(sc, 0.04).texture; pm.dispose();
    this.envs[id] = env; return env;
  }
  // солнце и тени следуют за местом действия
  focus(x, z) {
    this.sun.position.set(x - 12, 26, z + 14); this.sun.target.position.set(x, 0, z - 4);
  }
  shake(a) { this.shakeA = Math.min(1.2, Math.max(this.shakeA, a)); }
  frame(dt, measure) {
    this.uTime.value += dt; A.wind.value += dt;
    if (this.shakeA > 0.001) {
      this.shakeA *= Math.pow(0.02, dt);
      this.shakeOff.set((Math.random() - 0.5) * this.shakeA, (Math.random() - 0.5) * this.shakeA * 0.7, (Math.random() - 0.5) * this.shakeA * 0.4);
      this.camera.position.add(this.shakeOff);
    }
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    if (measure && dt > 0) {
      this._acc += dt; this._n++; this._t += dt;
      if (this._t > 2.5) {
        this.fps = Math.round(this._n / this._acc);
        if (this.fps < 45 && this.quality > 0 && !this.lockQ) { this.quality--; this.applyQuality(); }
        this._acc = 0; this._n = 0; this._t = 0;
      }
    }
  }
}

// ---------- бойцы ----------
// перекраска ткани в цвет команды (как teamMaterial в Аванпосте): кожа и волосы остаются, ткань — в цвет, железо — с отливом
const TEAM_PARS = `uniform vec3 uTeam; uniform float uRim; uniform float uMetal;
  vec3 t_rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
  vec3 teamify(vec3 lin){ vec3 sc = pow(max(lin, vec3(0.0)), vec3(1.0/2.2)); vec3 h = t_rgb2hsv(sc); vec3 tc = pow(uTeam, vec3(1.0/2.2));
    bool warm = h.x > 0.025 && h.x < 0.13;
    if (h.y > 0.26 && !warm) sc = tc * (0.22 + h.z * 0.85);
    else if (h.y < 0.2 && h.z > 0.22) sc = mix(sc, tc * (0.3 + h.z * 0.6), 0.7 * uMetal);
    return pow(sc, vec3(2.2)); }`;
const unitMats = {};
function unitMaterial(eng, kind, color, direct) {
  const key = kind + ":" + color + ":" + (direct ? 1 : 0);
  if (unitMats[key]) return unitMats[key];
  const m = new THREE.MeshStandardMaterial({ map: A.tex[A.units[kind].tex], roughness: 0.68, metalness: 0.08, envMapIntensity: 0.65 });
  m.userData.uTeam = { value: new THREE.Color(color) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = eng.uTime; sh.uniforms.uTeam = m.userData.uTeam; sh.uniforms.uRim = { value: direct ? 0.15 : 0.35 }; sh.uniforms.uMetal = { value: direct ? 0 : 1 };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aPosB; attribute vec3 aAnim; uniform float uT;")
      .replace("#include <begin_vertex>", direct ? `vec3 transformed = mix(position, aPosB, clamp(aAnim.z, 0.0, 1.0));`
        : `float kk = 0.5 + 0.5 * sin(uT * (10.5 + aAnim.z * 7.0) + aAnim.x) * min(aAnim.y, 1.0);
           vec3 transformed = mix(position, aPosB, aAnim.y > 0.01 ? kk : 0.5);
           transformed.y += abs(sin(uT * (10.5 + aAnim.z * 7.0) + aAnim.x)) * 0.05 * min(aAnim.y, 1.0);`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + TEAM_PARS)
      .replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = teamify(diffuseColor.rgb);")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        { float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0); totalEmissiveRadiance += uTeam * fr * uRim; }`);
  };
  m.customProgramCacheKey = () => "unit" + (direct ? "d" : "c");
  m.userData.keep = 1;
  unitMats[key] = m; return m;
}
function hatMaterial(eng) {
  if (unitMats.hat) return unitMats.hat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.8 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = eng.uTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 aPosB; attribute vec3 aAnim; uniform float uT;")
      .replace("#include <begin_vertex>", `float kk = 0.5 + 0.5 * sin(uT * (10.5 + aAnim.z * 7.0) + aAnim.x) * min(aAnim.y, 1.0);
           vec3 transformed = mix(position, aPosB, aAnim.y > 0.01 ? kk : 0.5);
           transformed.y += abs(sin(uT * (10.5 + aAnim.z * 7.0) + aAnim.x)) * 0.05 * min(aAnim.y, 1.0);`);
  };
  m.customProgramCacheKey = () => "hat"; m.userData.keep = 1;
  unitMats.hat = m; return m;
}
export const HATS = {
  none: { name: "Без шапки", price: 0 }, helmet: { name: "Шлем", price: 150 }, cap: { name: "Кепка", price: 200 }, horns: { name: "Рога", price: 300 },
  party: { name: "Колпак", price: 350 }, tophat: { name: "Цилиндр", price: 500 }, crown: { name: "Корона", price: 900 }
};
export const COLORS = {
  blue: { name: "Синие", hex: 0x2f7bff, price: 0 }, cyan: { name: "Бирюза", hex: 0x18c6d8, price: 120 }, green: { name: "Зелёные", hex: 0x27c45a, price: 160 },
  purple: { name: "Фиолетовые", hex: 0x8a4dff, price: 220 }, orange: { name: "Оранжевые", hex: 0xff9a1f, price: 280 }, pink: { name: "Розовые", hex: 0xff5fc4, price: 320 },
  black: { name: "Ниндзя", hex: 0x30323a, price: 450 }, gold: { name: "Золотые", hex: 0xffc62b, price: 800 }
};
const hexRGB = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
function hatParts(kind) {
  const P = [];
  const add = (g, x, y, z, col) => { g.translate(x, y, z); const n = g.attributes.position.count, c = new Float32Array(n * 3), rgb = hexRGB(col); for (let i = 0; i < n; i++) c.set(rgb, i * 3); g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.deleteAttribute("uv"); if (g.index) g = g.toNonIndexed(); P.push(g); };
  if (kind === "helmet") { add(new THREE.SphereGeometry(0.15, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, 0xa8b0ba); add(new THREE.BoxGeometry(0.035, 0.06, 0.24), 0, 0.14, 0, 0xd23b3b); }
  else if (kind === "cap") { add(new THREE.CylinderGeometry(0.14, 0.15, 0.09, 10), 0, 0.05, 0, 0xff4040); add(new THREE.BoxGeometry(0.2, 0.025, 0.14), 0, 0.02, 0.13, 0xff4040); }
  else if (kind === "horns") { add(new THREE.SphereGeometry(0.15, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, 0x8a6a4a); const a = new THREE.ConeGeometry(0.035, 0.16, 6); a.rotateZ(0.9); add(a, -0.17, 0.1, 0, 0xfff2d6); const b = new THREE.ConeGeometry(0.035, 0.16, 6); b.rotateZ(-0.9); add(b, 0.17, 0.1, 0, 0xfff2d6); }
  else if (kind === "party") { add(new THREE.ConeGeometry(0.1, 0.27, 8), 0, 0.14, 0, 0xff3fb4); add(new THREE.SphereGeometry(0.035, 6, 4), 0, 0.29, 0, 0xffe14d); }
  else if (kind === "tophat") { add(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 10), 0, 0.11, 0, 0x1d1d24); add(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 12), 0, 0.01, 0, 0x1d1d24); add(new THREE.CylinderGeometry(0.102, 0.102, 0.04, 10), 0, 0.04, 0, 0xd03a3a); }
  else if (kind === "crown") { add(new THREE.CylinderGeometry(0.12, 0.11, 0.1, 8, 1, true), 0, 0.05, 0, 0xffcc22); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(new THREE.ConeGeometry(0.03, 0.08, 4), Math.sin(a) * 0.11, 0.13, Math.cos(a) * 0.11, 0xffd84a); } }
  return P;
}
// модель бойца + шапка (шапка едет за головой между кадрами A и B)
const geoC = {};
function unitGeo(kind, lod, hat) {
  const key = kind + lod + hat; if (geoC[key]) return geoC[key];
  const U = A.units[kind], base = U.lod[lod] || U.lod.near;
  if (!hat || hat === "none") { geoC[key] = base; return base; }
  const [hA, hB] = U.heads, top = 0.97, S = 2.05;
  let hg = mergeGeometries(hatParts(hat), false);
  hg.scale(S, S, S);
  const n = hg.attributes.position.count, P = hg.attributes.position.array, B = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    P[i * 3] += hA[0]; P[i * 3 + 1] += top - 0.1; P[i * 3 + 2] += hA[2] - 0.02;
    B[i * 3] = P[i * 3] + hB[0] - hA[0]; B[i * 3 + 1] = P[i * 3 + 1] + hB[1] - hA[1]; B[i * 3 + 2] = P[i * 3 + 2] + hB[2] - hA[2];
  }
  hg.setAttribute("aPosB", new THREE.BufferAttribute(B, 3)); hg.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  hg.setIndex([...Array(n).keys()]);
  const b2 = base.clone(); b2.setAttribute("color", new THREE.BufferAttribute(new Float32Array(base.attributes.position.count * 3).fill(1), 3));
  const g = mergeGeometries([b2, hg], true);
  geoC[key] = g; return g;
}
// импостор: плоский спрайт лицом к камере (кадр бега 0/1, вид сзади для своих и спереди для красных)
function impostorMat(eng, color, front, kind) {
  const rows = A.impRows.length, row = Math.max(0, A.impRows.indexOf(kind === "red" ? "blue" : kind));
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: A.tex.impostor }, uT: { value: 0 }, uCol: { value: front ? 1 : 0 }, uRow: { value: rows - 1 - row }, uRows: { value: rows }, uTeam: { value: new THREE.Color(color) }, uRim: { value: 0 }, uMetal: { value: 1.35 } }]),
    vertexShader: `attribute vec3 aAnim; uniform float uT; uniform float uCol; uniform float uRow; uniform float uRows; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){
        vec4 c = modelViewMatrix * instanceMatrix * vec4(0., 0., 0., 1.);
        float s = length(instanceMatrix[1].xyz);
        vec4 mvPosition = c + vec4(position.x * s, position.y * s, 0., 0.);
        gl_Position = projectionMatrix * mvPosition;
        float fr = step(0.0, sin(uT * (10.5 + aAnim.z * 7.0) + aAnim.x)) * step(0.01, aAnim.y);
        vUv = vec2((uv.x + uCol * 2.0 + fr) / 4.0, (uv.y * 0.995 + 0.0025 + uRow) / uRows);
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv;
      ${TEAM_PARS}
      #include <fog_pars_fragment>
      void main(){ vec4 t = texture2D(map, vUv); if (t.a < 0.5) discard; vec3 lin = pow(t.rgb, vec3(2.2)); gl_FragColor = vec4(pow(teamify(lin) * 0.62, vec3(1.0/2.2)), 1.0);
        #include <fog_fragment>
      }`,
    fog: true
  });
  m.uniforms.uT = eng.uTime; m.userData.uTeam = m.uniforms.uTeam;
  return m;
}
const IMP_GEO = new THREE.PlaneGeometry(1, 1.24).translate(0, 0.5, 0); IMP_GEO.userData.keep = 1;
const BLOB_TEX = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, "rgba(0,0,0,.5)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const BLOB_MAT = new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false }); BLOB_MAT.userData.keep = 1;
const BLOB_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); BLOB_GEO.userData.keep = 1;
export const LOD = { near: 15, far: 26, nearCap: 70,     // до 15 м — подробные, до 26 м — упрощённые, дальше — спрайты-импосторы
  caps: [[20, 110], [40, 200], [70, 320]] };             // по качеству 0/1/2: сколько ближайших бойцов рисовать подробно и упрощённо
function makeIM(geo, mat, n) {
  const g = geo.clone();
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); aA.setUsage(THREE.DynamicDrawUsage); g.setAttribute("aAnim", aA);
  const im = new THREE.InstancedMesh(g, mat, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.count = 0;
  im.userData.aA = aA;
  return im;
}

// Толпа: те же массивы, что раньше (x, y, z, yaw, s, ph, run, atk), commit(n) раскладывает по уровням детализации
export class Units {
  constructor(eng, cap, color, hat, kind, opt) {
    opt = opt || {};
    this.eng = eng; this.cap = cap;
    this.kind = kind || (color === RED ? "red" : "blue");
    const front = opt.front != null ? opt.front : this.kind === "red";
    const direct = this.kind === "boss";
    const mat = unitMaterial(eng, this.kind, color, direct), hm = hatMaterial(eng);
    this.matU = mat;
    const mats = hat && hat !== "none" ? [mat, hm] : mat;
    this.mesh = new THREE.Group();
    this.near = makeIM(unitGeo(this.kind, "near", hat), mats, Math.min(cap, direct ? cap : opt.nearCap || LOD.nearCap));
    this.mesh.add(this.near);
    if (!direct) {
      this.far = makeIM(unitGeo(this.kind, "far", hat), mats, cap); this.mesh.add(this.far);
      if (this.kind !== "cheer") { this.impM = impostorMat(eng, color, front, this.kind); this.imp = makeIM(IMP_GEO, this.impM, cap); this.mesh.add(this.imp); }
    }
    this.blob = new THREE.InstancedMesh(BLOB_GEO, BLOB_MAT, cap); this.blob.frustumCulled = false; this.blob.renderOrder = 1; this.blob.count = 0; this.blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.add(this.blob);
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.z = new Float32Array(cap);
    this.yaw = new Float32Array(cap); this.s = new Float32Array(cap).fill(1);
    this.ph = new Float32Array(cap); this.run = new Float32Array(cap).fill(1); this.atk = new Float32Array(cap);
    for (let i = 0; i < cap; i++) this.ph[i] = Math.random() * 6.28;
    this.lodScale = 1; this.noBlob = false; this.capK = opt.capK || 1;
    this.stats = { near: 0, far: 0, imp: 0 };
  }
  setColor(color) { this.matU.userData.uTeam.value.set(color); if (this.impM) this.impM.uniforms.uTeam.value.set(color); }
  colorAt() {}
  commit(n) {
    n = Math.min(n, this.cap);
    const cam = this.eng.camera.position, cx = cam.x, cy = cam.y, cz = cam.z;
    let nr2 = (LOD.near * this.lodScale) ** 2, fr2 = (LOD.far * this.lodScale) ** 2;
    const N = this.near, F = this.far, I = this.imp, Bm = this.blob.instanceMatrix.array;
    const ncap = N.instanceMatrix.count;
    // бюджет по качеству: если бойцов много, пороги дальности сжимаются (ближайшие — подробно, остальные — спрайтами)
    if (F && I) {
      let [cn, cf] = LOD.caps[this.eng.quality] || LOD.caps[1]; cn = Math.max(4, Math.round(cn * this.capK)); cf = Math.max(8, Math.round(cf * this.capK));
      const d2 = this._d2 || (this._d2 = new Float32Array(this.cap)), srt = this._srt || (this._srt = new Float32Array(this.cap));
      for (let i = 0; i < n; i++) { const dx = this.x[i] - cx, dy = this.y[i] - cy, dz = this.z[i] - cz; d2[i] = dx * dx + dy * dy + dz * dz; }
      if (n > cn) { srt.set(d2.subarray(0, n)); const v = srt.subarray(0, n).sort(); nr2 = Math.min(nr2, v[cn - 1]); if (n > cn + cf) fr2 = Math.min(fr2, v[cn + cf - 1]); }
    }
    let nn = 0, nf = 0, ni = 0, nb = 0;
    for (let i = 0; i < n; i++) {
      const dx = this.x[i] - cx, dy = this.y[i] - cy, dz = this.z[i] - cz, d2 = dx * dx + dy * dy + dz * dz;
      let im, j;
      if (!F || (d2 <= nr2 && nn < ncap)) { im = N; j = nn++; if (j >= ncap) continue; }
      else if (!I || d2 <= fr2) { im = F; j = nf++; }
      else { im = I; j = ni++; }
      const s = this.s[i], c = Math.cos(this.yaw[i]) * s, sn = Math.sin(this.yaw[i]) * s, m = im.instanceMatrix.array, o = j * 16;
      m[o] = c; m[o + 1] = 0; m[o + 2] = -sn; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = sn; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0; m[o + 12] = this.x[i]; m[o + 13] = this.y[i]; m[o + 14] = this.z[i]; m[o + 15] = 1;
      const a = im.userData.aA.array; a[j * 3] = this.ph[i]; a[j * 3 + 1] = this.run[i]; a[j * 3 + 2] = this.atk[i];
      if (!this.noBlob && im !== I && this.y[i] > -0.5) {
        const bo = nb++ * 16, r = 0.85 * s;
        Bm[bo] = r; Bm[bo + 1] = 0; Bm[bo + 2] = 0; Bm[bo + 3] = 0; Bm[bo + 4] = 0; Bm[bo + 5] = 1; Bm[bo + 6] = 0; Bm[bo + 7] = 0; Bm[bo + 8] = 0; Bm[bo + 9] = 0; Bm[bo + 10] = r; Bm[bo + 11] = 0;
        Bm[bo + 12] = this.x[i]; Bm[bo + 13] = this.y[i] + 0.03; Bm[bo + 14] = this.z[i]; Bm[bo + 15] = 1;
      }
    }
    for (const [im, k] of [[N, nn], [F, nf], [I, ni]]) { if (!im) continue; im.count = Math.min(k, im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; im.userData.aA.needsUpdate = true; }
    this.blob.count = nb; this.blob.instanceMatrix.needsUpdate = true;
    this.stats.near = nn; this.stats.far = nf; this.stats.imp = ni;
  }
  move(i, j) { this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j]; this.yaw[i] = this.yaw[j]; this.s[i] = this.s[j]; this.ph[i] = this.ph[j]; this.run[i] = this.run[j]; this.atk[i] = this.atk[j]; }
  dispose() { this.mesh.traverse((o) => { if (o.isInstancedMesh && o.geometry !== IMP_GEO) o.geometry.dispose(); }); if (this.impM) this.impM.dispose(); }
}


// v2. Толпа из бойцов разных видов: логические массивы как у Units + вид ty[i]; commit раскладывает по моделям.
// looks[t] = { kind, hat, color, capK } — какой моделью рисовать вид t (подмодели создаются по требованию)
export class Crowd {
  constructor(eng, cap, color, hat, front, looks) {
    this.eng = eng; this.cap = cap; this.color = color; this.hat = hat || "none"; this.front = !!front;
    this.looks = looks.map((l) => Object.assign({}, l));
    this.mesh = new THREE.Group(); this.subs = {}; this.lodScale = 1;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.z = new Float32Array(cap);
    this.yaw = new Float32Array(cap); this.s = new Float32Array(cap).fill(1);
    this.ph = new Float32Array(cap); this.run = new Float32Array(cap).fill(1); this.atk = new Float32Array(cap); this.ty = new Uint8Array(cap);
    for (let i = 0; i < cap; i++) this.ph[i] = Math.random() * 6.28;
    this.stats = { near: 0, far: 0, imp: 0 }; this.cnt = {};
  }
  sub(t) {
    const L = this.looks[t] || this.looks[0], hat = L.hat != null ? L.hat : this.hat, col = L.color != null ? L.color : this.color;
    const key = L.kind + "|" + hat + "|" + col;
    let u = this.subs[key];
    if (!u) { u = this.subs[key] = new Units(this.eng, L.cap || this.cap, col, hat, L.kind, { front: this.front, capK: L.capK || 1, nearCap: L.nearCap }); this.mesh.add(u.mesh); }
    u.lodScale = this.lodScale * (L.lod || 1);
    return u;
  }
  setLook(t, o) { Object.assign(this.looks[t], o); }
  setColor(c) { this.color = c; }
  move(i, j) { this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.z[i] = this.z[j]; this.yaw[i] = this.yaw[j]; this.s[i] = this.s[j]; this.ph[i] = this.ph[j]; this.run[i] = this.run[j]; this.atk[i] = this.atk[j]; this.ty[i] = this.ty[j]; }
  commit(n) {
    n = Math.min(n, this.cap);
    const used = new Map();
    for (let i = 0; i < n; i++) {
      const u = this.sub(this.ty[i]); let k = used.get(u) || 0; if (k >= u.cap) continue;
      u.x[k] = this.x[i]; u.y[k] = this.y[i]; u.z[k] = this.z[i]; u.yaw[k] = this.yaw[i]; u.s[k] = this.s[i]; u.ph[k] = this.ph[i]; u.run[k] = this.run[i]; u.atk[k] = this.atk[i];
      used.set(u, k + 1);
    }
    let a = 0, b = 0, c = 0;
    for (const key in this.subs) { const u = this.subs[key]; u.commit(used.get(u) || 0); a += u.stats.near; b += u.stats.far; c += u.stats.imp; }
    this.stats.near = a; this.stats.far = b; this.stats.imp = c;
  }
  dispose() { for (const k in this.subs) this.subs[k].dispose(); this.subs = {}; }
}

// Отлетающие и падающие бойцы — настоящие модели (кувыркаются)
export class Debris {
  constructor(eng, cap) {
    this.eng = eng; this.cap = cap; this.group = new THREE.Group();
    this.pools = {};
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.p = new THREE.Vector3(); this.sc = new THREE.Vector3();
  }
  pool(kind, color) {
    const key = kind; if (this.pools[key]) return this.pools[key];
    const im = makeIM(A.units[kind].lod.far, unitMaterial(this.eng, kind, color, false), this.cap);
    this.group.add(im);
    const P = { im, n: 0, d: new Float32Array(this.cap * 12) };   // x y z vx vy vz rx vr life floor yaw s
    this.pools[key] = P; return P;
  }
  setTeam(color) { if (this.pools.blue) this.pools.blue.im.material.userData.uTeam.value.set(color); this.team = color; }
  add(x, y, z, vx, vy, vz, color, yaw, floor, scale) {
    const P = this.pool(color === RED ? "red" : "blue", color === RED ? RED : (this.team || color));
    let i = P.n < this.cap ? P.n++ : Math.floor(Math.random() * this.cap);
    const d = P.d, o = i * 12;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = 0; d[o + 7] = (Math.random() - 0.5) * 10; d[o + 8] = 2.6; d[o + 9] = floor == null ? -40 : floor; d[o + 10] = yaw || 0; d[o + 11] = scale || 1;
  }
  update(dt) {
    for (const k in this.pools) {
      const P = this.pools[k], d = P.d, m = P.im.instanceMatrix.array, a = P.im.userData.aA.array;
      for (let i = 0; i < P.n; i++) {
        const o = i * 12;
        d[o + 8] -= dt;
        if (d[o + 8] <= 0) { const j = --P.n; if (i !== j) for (let q = 0; q < 12; q++) d[o + q] = d[j * 12 + q]; i--; continue; }
        d[o + 4] -= 22 * dt; d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
        if (d[o + 1] < d[o + 9]) { d[o + 1] = d[o + 9]; d[o + 4] *= -0.25; d[o + 3] *= 0.6; d[o + 5] *= 0.6; d[o + 7] *= 0.5; }
        d[o + 6] += d[o + 7] * dt;
        const sc = (d[o + 8] < 0.5 ? Math.max(0.001, d[o + 8] * 2) : 1) * d[o + 11];
        this.e.set(d[o + 6], d[o + 10], d[o + 6] * 0.6); this.q.setFromEuler(this.e);
        this.p.set(d[o], d[o + 1], d[o + 2]); this.sc.set(sc, sc, sc);
        this.m4.compose(this.p, this.q, this.sc); this.m4.toArray(m, i * 16);
        a[i * 3] = i; a[i * 3 + 1] = 1; a[i * 3 + 2] = 1.2;
      }
      P.im.count = P.n; P.im.instanceMatrix.needsUpdate = true; P.im.userData.aA.needsUpdate = true;
    }
  }
  clear() { for (const k in this.pools) { this.pools[k].n = 0; this.pools[k].im.count = 0; } }
}

// Частицы — эффекты Аванпоста (точки со спрайтом): пыль, искры, щепки, взрывы
export class Particles {
  constructor(eng) {
    this.eng = eng; this.fx = new FX(eng.scene); this.fx.quality = eng.quality === 0 ? 0.5 : eng.quality === 1 ? 0.8 : 1;
    eng.fxList.push(this.fx); eng.resize();
    this.mesh = new THREE.Group(); this._c = new THREE.Color();
  }
  // совместимость со старым вызовом: burst(x, y, z, n, цвет, скорость, размер, вверх, гравитация)
  burst(x, y, z, n, color, speed, size, up, grav) {
    const c = this._c.set(color), F = this.fx, sp = speed || 5, sz = Math.max(0.12, (size || 0.14) * 1.6);
    for (let k = 0; k < F.n(n); k++) {
      const a = Math.random() * 6.283, s = (0.3 + Math.random() * 0.7) * sp;
      F.norm.add(x, y, z, Math.cos(a) * s, (up != null ? up : 4) * (0.5 + Math.random()), Math.sin(a) * s, 0.5 + Math.random() * 0.5, sz, sz * 0.5, c, grav == null ? 16 : grav, 0.6);
    }
  }
  sparks(x, y, z, n, color) { const F = this.fx, c = color != null ? this._c.set(color) : COL.spark; for (let k = 0; k < F.n(n); k++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 5; F.add.add(x, y, z, Math.cos(a) * s, 1 + Math.random() * 3.5, Math.sin(a) * s, 0.2 + Math.random() * 0.25, 0.2, 0.02, c, 9, 2); } F.add.add(x, y, z, 0, 0, 0, 0.1, 0.8, 0.2, COL.white); }
  dust(x, z, n, size, y) { this.fx.puff(x, z, n || 6, COL.dust, size || 0.5); }
  explosion(x, z, r) { this.fx.explosion(x, z, r || 1.5); }
  chips(x, y, z, color) { this.fx.chips(x, y, z, this._c.set(color).clone()); }
  ring(x, z, r0, r1, dur, color, y) { this.fx.ring(x, z, r0, r1, dur, color, y); }
  sparkle(x, y, z, color, k) { this.fx.sparkle(x, y, z, color != null ? this._c.set(color).clone() : COL.gold, k); }
  update(dt) { this.fx.update(dt); }
  clear() { this.fx.add.n = 0; this.fx.norm.n = 0; this.fx.add.update(0); this.fx.norm.update(0); }
}

// Подписи над объектами (DOM поверх канваса)
export class Labels {
  constructor(root, cam) { this.root = root; this.cam = cam; this.list = []; this.v = new THREE.Vector3(); }
  add(cls, text) {
    const el = document.createElement("div"); el.className = "lbl " + (cls || ""); el.textContent = text || "";
    this.root.appendChild(el);
    const L = { el, x: 0, y: 0, z: 0, on: true, text: text || "", set(t) { t = String(t); if (t !== this.text) { this.text = t; el.textContent = t; } }, pop() { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); } };
    this.list.push(L); return L;
  }
  remove(L) { const i = this.list.indexOf(L); if (i >= 0) this.list.splice(i, 1); L.el.remove(); }
  clear() { this.list.forEach((L) => L.el.remove()); this.list.length = 0; }
  update(W, H) {
    for (const L of this.list) {
      if (!L.on) { if (L.el.style.display !== "none") L.el.style.display = "none"; continue; }
      this.v.set(L.x, L.y, L.z).project(this.cam);
      if (this.v.z > 1 || this.v.z < -1) { L.el.style.display = "none"; continue; }
      L.el.style.display = "";
      L.el.style.transform = `translate(${((this.v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - this.v.y) / 2 * H).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}

// Надписи на текстуре (числа на воротах). Светятся: материал без тонмаппинга, ярче 1 — их подхватывает bloom
export function textTex(text, fg, bg, w, h) {
  const c = document.createElement("canvas"); c.width = w || 256; c.height = h || 128;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData = { c, g: c.getContext("2d") };
  redrawText(t, text, fg, bg);
  return t;
}
export function redrawText(t, text, fg, bg, sub) {
  const { c, g } = t.userData;
  g.clearRect(0, 0, c.width, c.height);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  // вторая строка (подпись мельче): «+10» / «лучников»
  if (sub === undefined && typeof text === "string" && text.indexOf("\n") > 0) { const k = text.indexOf("\n"); sub = text.slice(k + 1); text = text.slice(0, k); }
  const fit = (str, px, maxW) => { let f = px; g.font = `900 ${f}px "Russo One", Impact, Arial Black, sans-serif`; while (f > 10 && g.measureText(str).width > maxW) { f -= 2; g.font = `900 ${f}px "Russo One", Impact, Arial Black, sans-serif`; } return f; };
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round"; g.strokeStyle = "rgba(10,20,50,.85)";
  const big = fit(text, Math.round(c.height * (sub ? 0.5 : 0.62)), c.width * 0.94), y = sub ? c.height * 0.36 : c.height / 2 + c.height * 0.04;
  g.lineWidth = big * 0.2; g.strokeText(text, c.width / 2, y); g.fillStyle = fg || "#fff"; g.fillText(text, c.width / 2, y);
  if (sub) { const f2 = fit(sub, Math.round(c.height * 0.27), c.width * 0.96); g.lineWidth = f2 * 0.24; g.strokeText(sub, c.width / 2, c.height * 0.8); g.fillText(sub, c.width / 2, c.height * 0.8); }
  t.needsUpdate = true;
}
export function glowLabel(text, w, h, glow) {
  const t = textTex(text, "#fff", null, 256, 128);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
  m.color.setScalar(glow || 1.35);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.renderOrder = 3;
  mesh.userData.tex = t;
  return mesh;
}
export function blobShadow(r) {
  const m = new THREE.Mesh(BLOB_GEO, BLOB_MAT); m.scale.set(r * 2, 1, r * 2); m.renderOrder = 1;
  return m;
}

// ---------- модели окружения: инстансы готовых моделей ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const tintC = {};
function tinted(m, tint) {
  if (!tint) return m;
  const key = m.uuid + tint; if (tintC[key]) return tintC[key];
  const t = m.clone(); t.color = m.color.clone().lerp(new THREE.Color(tint), 0.75); if (m.userData.wind) windify(t); t.userData.keep = 1; tintC[key] = t; return t;
}
// list: [[x, y, z, scale, rotY, rotX, scaleY], …]; режем на куски по 40 м вдоль z — невидимые куски отсекаются камерой
export function placeModels(group, name, list, opt) {
  opt = opt || {};
  const src = A.env[name]; if (!src || !list.length) return [];
  const chunk = opt.chunk || 40, buckets = new Map();
  for (const it of list) { const k = Math.floor(it[2] / chunk); let b = buckets.get(k); if (!b) buckets.set(k, (b = [])); b.push(it); }
  src.updateMatrixWorld(true);
  const out = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    let mat = o.material;
    if (opt.leaf && /Leaves|Leaf/i.test(mat.name)) mat = tinted(mat, opt.leaf);
    else if (opt.tint && !/Leaves|Leaf|Flowers|Grass/i.test(mat.name)) mat = tinted(mat, opt.tint);
    const local = o.matrixWorld.clone();
    for (const part of buckets.values()) {
      const im = new THREE.InstancedMesh(o.geometry, mat, part.length);
      part.forEach((it, i) => { _q.setFromEuler(_e.set(it[5] || 0, it[4] || 0, 0)); _p.set(it[0], it[1], it[2]); const s = it[3]; _s.set(s, s * (it[6] || 1), s); _m4.compose(_p, _q, _s).multiply(local); im.setMatrixAt(i, _m4); });
      im.castShadow = !!opt.shadow; im.receiveShadow = opt.receive !== false;
      im.computeBoundingSphere(); im.frustumCulled = true;
      group.add(im); out.push(im);
    }
  });
  return out;
}
const procGeo = {};
function cactusGeo() {
  if (procGeo.cactus) return procGeo.cactus;
  const P = []; const C = (r, h, x, y, z, rz) => { const g = new THREE.CylinderGeometry(r * 0.85, r, h, 8); if (rz) g.rotateZ(rz); g.translate(x, y, z); P.push(g); const s = new THREE.SphereGeometry(r * 0.85, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); s.translate(x, y + h / 2, z); if (!rz) P.push(s); };
  C(0.32, 2.4, 0, 1.2, 0); C(0.2, 0.9, 0.55, 1.5, 0); C(0.2, 0.5, 0.36, 1.06, 0, Math.PI / 2); C(0.18, 0.7, -0.5, 1.8, 0); C(0.18, 0.4, -0.33, 1.45, 0, Math.PI / 2);
  procGeo.cactus = mergeGeometries(P.map((g) => (g.deleteAttribute("uv"), g.index ? g.toNonIndexed() : g)), false); return procGeo.cactus;
}
const procMat = {};
function pmat(key, o) { if (!procMat[key]) { procMat[key] = new THREE.MeshStandardMaterial(o); procMat[key].userData.keep = 1; } return procMat[key]; }
function placeProc(group, kind, list, shadow) {
  let geo, mat;
  if (kind === "cactus") { geo = cactusGeo(); mat = pmat("cactus", { color: 0x4f9a4a, roughness: 0.8 }); }
  else if (kind === "lava") { geo = procGeo.lava || (procGeo.lava = new THREE.CylinderGeometry(1.6, 1.8, 0.12, 10)); mat = pmat("lava", { color: 0x220000, emissive: 0xff5a14, emissiveIntensity: 2.2, roughness: 0.6 }); }
  else if (kind === "crystal") { geo = procGeo.crystal || (procGeo.crystal = new THREE.OctahedronGeometry(0.7, 0).scale(0.55, 1.7, 0.55).translate(0, 1.1, 0)); mat = pmat("crystal", { color: 0x7ae8ff, emissive: 0x3ab8ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1 }); }
  else return;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((it, i) => { _q.setFromEuler(_e.set(0, it[4] || 0, 0)); _p.set(it[0], it[1], it[2]); _s.setScalar(it[3]); _m4.compose(_p, _q, _s); im.setMatrixAt(i, _m4); });
  im.castShadow = !!shadow; im.receiveShadow = true; im.computeBoundingSphere(); im.frustumCulled = true; group.add(im);
}
export function placeAny(group, name, list, opt) {
  if (name === "cactus" || name === "lava" || name === "crystal") placeProc(group, name, list, opt && opt.shadow);
  else placeModels(group, name, list, opt);
}

// Ущелье вдоль полосы z0..z1 (z0 > z1, вперёд — минус): дно долины, скальные стены, лес наверху, облака
export function buildScenery(group, biomeId, z0, z1, opt) {
  opt = opt || {};
  const B = BIOMES[biomeId], r = rng(opt.seed || 7), inner = opt.inner || 7, floorY = opt.floorY != null ? opt.floorY : -9;
  const len = Math.abs(z1 - z0), zc = (z0 + z1) / 2;
  // дно
  const gt = texL.load(`assets/tex/${B.ground}_d.webp${V}`); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.colorSpace = THREE.SRGBColorSpace; gt.anisotropy = 4; gt.repeat.set(140 / 8, (len + 160) / 8);
  const gm = new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95, envMapIntensity: 0.3 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, len + 160), gm); floor.rotation.x = -Math.PI / 2; floor.position.set(0, floorY, zc); floor.receiveShadow = true; group.add(floor);
  // скальные стены по бокам — большие валуны, два яруса
  const rocks = { Rock_Medium_1: [], Rock_Medium_2: [], Rock_Medium_3: [] }, rn = Object.keys(rocks);
  for (let z = z0 + 10; z > z1 - 40; z -= 4.2 + r() * 2) for (const sd of [-1, 1]) {
    rocks[rn[(r() * 3) | 0]].push([sd * (inner + 9 + r() * 4), floorY - 1, z, 3.2 + r() * 1.8, r() * 6.28, 0, 1.4 + r() * 0.6]);
    if (r() < 0.7) rocks[rn[(r() * 3) | 0]].push([sd * (inner + 15 + r() * 6), floorY + 4 + r() * 3, z + r() * 3, 3.6 + r() * 2.2, r() * 6.28, 0, 1.2 + r() * 0.8]);
  }
  for (const k of rn) placeModels(group, k, rocks[k], { tint: B.rockTint });
  // лес и кусты на дне долины у дороги; поверху — холмы и горы KayKit с рощами (мало треугольников)
  const trees = {}, bush = {}, ridge = { mountain_A_grass_trees: [], hills_A_trees: [], mountain_C_grass: [] }, rk = Object.keys(ridge);
  const T = (name, it) => (trees[name] || (trees[name] = [])).push(it), Bu = (name, it) => (bush[name] || (bush[name] = [])).push(it);
  const small = ["Fern_1", "Grass_Common_Tall", "Flower_3_Group"];
  for (let z = z0 + 6; z > z1 - 40; z -= 5 + r() * 4) for (const sd of [-1, 1]) {
    if (r() < 0.38) T(B.trees[(r() * B.trees.length) | 0], [sd * (inner + 2 + r() * 6), floorY, z + r() * 2, 0.5 + r() * 0.35, r() * 6.28]);
    const bn = r() < 0.3 ? B.bush[(r() * B.bush.length) | 0] : (biomeId === "desert" || biomeId === "volcano" ? B.bush[(r() * B.bush.length) | 0] : small[(r() * 3) | 0]);
    Bu(bn, [sd * (inner + 0.5 + r() * 8), floorY + (bn === "lava" ? 0.02 : 0), z + r() * 2, bn === "lava" ? 1 + r() : 0.7 + r() * 0.6, r() * 6.28]);
  }
  for (let z = z0 + 10; z > z1 - 60; z -= 9 + r() * 6) for (const sd of [-1, 1]) ridge[rk[(r() * 3) | 0]].push([sd * (inner + 26 + r() * 8), floorY + 3 + r() * 2, z, 8 + r() * 4, r() * 6.28]);
  for (const k in trees) placeAny(group, k, trees[k], { leaf: B.leaf, shadow: false });
  for (const k in bush) placeAny(group, k, bush[k], { leaf: B.leaf, tint: /Rock/.test(k) ? B.rockTint : null });
  for (const k of rk) placeModels(group, k, ridge[k], { leaf: B.leaf, tint: biomeId === "snow" ? 0xf2f6ff : biomeId === "desert" ? 0xe0b070 : biomeId === "volcano" ? 0x4a3430 : biomeId === "night" ? 0x4a4a8a : biomeId === "autumn" ? 0xd08a40 : null });
  // облака
  if (A.env.cloud_big && biomeId !== "volcano") { const cl = []; for (let z = z0; z > z1 - 60; z -= 26 + r() * 20) cl.push([(r() - 0.5) * 70, 22 + r() * 10, z, 4 + r() * 3, r() * 6.28]); placeModels(group, "cloud_big", cl, { receive: false }); }
}
// забор вдоль края: x — линия, от z0 до z1
export function fenceLine(group, biomeId, x, z0, z1, y) {
  const B = BIOMES[biomeId], name = B.fence, L = 1.15 * 1.9, list = [];
  for (let z = z0 - L / 2; z > z1; z -= L) list.push([x, y || 0, z, 1.9, 0, 0, 0.85]);
  placeModels(group, name, list, { shadow: true, tint: name === "fence_stone_straight" ? B.rockTint : null });
}
export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry && !o.isInstancedMesh && !o.geometry.userData.keep) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
    if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.userData.keep) return; if (m.map && !m.map.userData.keepTex) m.map.dispose(); m.dispose(); }); }
  });
  if (g.parent) g.parent.remove(g);
}

// ---------- детальная пушка (бронза, лафет из досок, колёса со спицами) ----------
export function makeCannonModel(opt) {
  opt = opt || {};
  const g = new THREE.Group();
  const bronze = opt.gold ? pmat("goldc", { color: 0xffc23a, metalness: 0.95, roughness: 0.22, envMapIntensity: 1.3, emissive: 0x3a2400, emissiveIntensity: 0.3 }) : pmat("bronze", { color: 0xd9a441, metalness: 0.85, roughness: 0.32, envMapIntensity: 1.0 });
  const iron = pmat("iron", { color: 0x3a3d44, metalness: 0.7, roughness: 0.45 });
  const wood = pbr("planks", { roughness: 0.8 });
  // лафет
  const cart = new THREE.Mesh(boxUV(new THREE.BoxGeometry(1.5, 0.55, 2.6), 1.5, 0.55, 2.6, 1.2), wood); cart.position.set(0, 0.75, 0.3); g.add(cart);
  for (const s of [-1, 1]) { const cheek = new THREE.Mesh(boxUV(new THREE.BoxGeometry(0.22, 0.9, 2.2), 0.22, 0.9, 2.2, 1.2), wood); cheek.position.set(s * 0.62, 1.2, 0.1); g.add(cheek); }
  const trail = new THREE.Mesh(boxUV(new THREE.BoxGeometry(0.5, 0.3, 1.6), 0.5, 0.3, 1.6, 1.2), wood); trail.position.set(0, 0.35, 1.8); trail.rotation.x = 0.25; g.add(trail);
  // колёса
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.95, 0.72, -0.05);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.08, 8, 22), iron); rim.rotation.y = Math.PI / 2; w.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.26, 10), iron); hub.rotation.z = Math.PI / 2; w.add(hub);
    for (let k = 0; k < 8; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.07), wood); sp.rotation.x = k * Math.PI / 8; w.add(sp); }
    g.add(w); wheels.push(w);
  }
  // ствол: профиль вращения с кольцами
  const prof = [[0.0, -1.3], [0.42, -1.3], [0.5, -1.2], [0.5, -1.05], [0.44, -0.98], [0.46, -0.6], [0.52, -0.55], [0.52, -0.45], [0.43, -0.4], [0.36, 0.7], [0.42, 0.75], [0.42, 0.86], [0.34, 0.9], [0.32, 1.25], [0.4, 1.3], [0.4, 1.42], [0.24, 1.42], [0.24, 1.2]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20);
  const barrel = new THREE.Mesh(lathe, bronze); barrel.rotation.x = -Math.PI / 2;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), bronze); knob.position.set(0, 0, 1.45);
  const pitch = new THREE.Group(); pitch.position.set(0, 1.45, 0); pitch.add(barrel, knob);
  // многоствольная: дополнительные стволы по бокам (видны по числу barrels)
  const extra = [];
  for (const sx of [-1, 1, -2, 2]) { const b2 = new THREE.Mesh(lathe, bronze); b2.rotation.x = -Math.PI / 2; b2.scale.setScalar(0.62); b2.position.set(sx * 0.55, sx * sx > 1 ? -0.05 : 0.18, -0.1); b2.visible = false; pitch.add(b2); extra.push(b2); }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8), iron); axle.rotation.z = Math.PI / 2; pitch.add(axle);
  g.add(pitch);
  // ядра рядом
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8), iron, 4);
  [[0.95, 0.17, 1.4], [1.28, 0.17, 1.4], [1.11, 0.17, 1.7], [1.11, 0.45, 1.5]].forEach((p, i) => balls.setMatrixAt(i, _m4.makeTranslation(p[0], p[1], p[2])));
  g.add(balls);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { pitch, barrel, wheels, extra };
  g.userData.setBarrels = (n) => extra.forEach((b, i) => (b.visible = i < n - 1));
  return g;
}
// знамя на шесте с колышущимся полотнищем (из Аванпоста)
const bannerGeo = { pole: new THREE.CylinderGeometry(0.05, 0.065, 2.7, 7).translate(0, 1.35, 0), bar: new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6).rotateZ(Math.PI / 2).translate(0, 2.45, 0), tip: new THREE.ConeGeometry(0.09, 0.22, 8).translate(0, 2.8, 0), cloth: new THREE.PlaneGeometry(0.8, 1.25, 4, 6).translate(0, 1.82, 0.02) };
const bannerMats = {};
export function makeBanner(color) {
  const g = new THREE.Group(), key = String(color);
  if (!bannerMats[key]) {
    const cm = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.75, side: THREE.DoubleSide });
    cm.onBeforeCompile = (sh) => { sh.uniforms.uWind = A.wind; sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWind;").replace("#include <begin_vertex>", `#include <begin_vertex>
      float k = clamp((2.45 - position.y) / 1.25, 0.0, 1.0); transformed.z += sin(uWind * 2.6 + position.x * 3.0 + position.y * 2.0) * 0.09 * k; transformed.x += sin(uWind * 1.9 + position.y * 2.5) * 0.04 * k;`); };
    cm.customProgramCacheKey = () => "banner";
    bannerMats[key] = { cloth: cm, wood: new THREE.MeshStandardMaterial({ color: 0x5a3b24, roughness: 0.85 }), gold: new THREE.MeshStandardMaterial({ color: 0xd4a73a, metalness: 0.7, roughness: 0.35 }) };
    for (const m of Object.values(bannerMats[key])) m.userData.keep = 1;
  }
  const M = bannerMats[key];
  g.add(new THREE.Mesh(bannerGeo.pole, M.wood), new THREE.Mesh(bannerGeo.bar, M.wood), new THREE.Mesh(bannerGeo.tip, M.gold), new THREE.Mesh(bannerGeo.cloth, M.cloth));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
for (const k in bannerGeo) bannerGeo[k].userData = { keep: 1 };

// ---------- ворота: каменные столбы, золотые навершия, стеклянная створка, светящееся число ----------
export function makeGate(W, text, kind, H) {
  H = H || 2.6;
  const g = new THREE.Group();
  const col = kind === "bad" ? 0xff3b4a : kind === "plus" ? 0x2bd46e : kind === "gold" ? 0xffb21a : kind === "evo" ? 0xb455ff : kind === "unit" ? 0x19c9c0 : 0x2f9bff;
  const stone = pbr("stone", { roughness: 0.8 }), gold = pmat("gold", { color: 0xffc83a, metalness: 0.85, roughness: 0.3 });
  const beamM = pmat("beam" + col, { color: col, metalness: 0.5, roughness: 0.35, emissive: col, emissiveIntensity: 0.25 });
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.13);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, H + 0.2, 10), stone); p.position.set(x, (H + 0.2) / 2, 0); g.add(p);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.46), stone); b.position.set(x, 0.13, 0); g.add(b);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), gold); c.position.set(x, H + 0.38, 0); g.add(c);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.24, 0.28), beamM); beam.position.y = H + 0.12; beam.userData.role = "beam"; g.add(beam);
  const pm = new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.34, emissive: col, emissiveIntensity: 0.45, roughness: 0.1, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, H - 0.1), pm); pl.position.y = H / 2 + 0.02; pl.renderOrder = 2; g.add(pl);
  const lab = glowLabel(text, Math.min(2.6, W - 0.35), Math.min(1.3, (W - 0.35) / 2)); lab.position.set(0, H * 0.58, 0.04); g.add(lab);
  g.traverse((o) => { if (o.isMesh && o !== pl && o !== lab) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, pm, lab, tex: lab.userData.tex, beamM, col };
}
// перекраска створки (ворота «−», которые отстреляли до «+»)
export function setGateKind(G, kind) {
  const col = kind === "bad" ? 0xff3b4a : kind === "plus" ? 0x2bd46e : kind === "gold" ? 0xffb21a : 0x2f9bff;
  if (G.col === col) return; G.col = col;
  G.pm.color.set(col); G.pm.emissive.set(col); G.beamM = pmat("beam" + col, { color: col, metalness: 0.5, roughness: 0.35, emissive: col, emissiveIntensity: 0.25 });
  G.g.traverse((o) => { if (o.isMesh && o.material && o.material.name !== "x" && /^beam/.test(o.userData.role || "")) o.material = G.beamM; });
}
// синие части моделей KayKit (крыши замка) — в красный: сдвиг оттенка, как hueMaterial в Аванпосте
const hueC = {};
export function hueMaterial(base, shift) {
  const key = base.uuid + shift; if (hueC[key]) return hueC[key];
  const m = base.clone(); m.userData.keep = 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHue = { value: shift };
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      uniform float uHue;
      vec3 h_rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
      vec3 h_hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
      { vec3 h = h_rgb2hsv(diffuseColor.rgb); if (h.y > 0.3 && h.x > 0.5 && h.x < 0.75) { h.x = fract(h.x + uHue); diffuseColor.rgb = h_hsv2rgb(h); } }`);
  };
  m.customProgramCacheKey = () => "hue" + shift;
  hueC[key] = m; return m;
}
export function cloneModel(name, opts) {
  const src = A.env[name]; const g = new THREE.Group(); if (!src) return g;
  const c = src.clone(true); c.position.set(0, 0, 0);
  c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (opts && opts.hue != null) o.material = hueMaterial(o.material, opts.hue); } });
  g.add(c); return g;
}
