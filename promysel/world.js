// «Промысел» — мир: небо, свет, снежная земля, море со своим шейдером, лес по краям, заборы рынка, постройки мест.
// Постройки спрятаны, пока место не открыто; при открытии — «выпрыгивают».
import * as THREE from "three";
import { layout, shoreZ } from "./sim.js";
import { ITEMS } from "./data.js";
import { ICON } from "./icons.js";
import { BUILD, PAL, STALL_COL, pineGeo, rockGeo, driftGeo, fenceGeo, lampGeo, Build } from "./art.js";

function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy; }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// темы бухт: цвет неба, воды, тумана, свет
export const THEMES = [
  { sky: "#9fd3f2", sky2: "#cfe6f5", fog: "#cfe4f2", deep: "#1d6a94", mid: "#2b8db3", shal: "#5fc2d8", sun: "#fff0d6", hemi: "#dbeeff", ground: "#6f86a3", sunI: 1.85 },
  { sky: "#86b9e8", sky2: "#d8e8f7", fog: "#cfe0f2", deep: "#1b5684", mid: "#2a78a8", shal: "#5fb5d8", sun: "#eaf2ff", hemi: "#dce9ff", ground: "#8094b0", sunI: 2.1 },
  { sky: "#f2c7a0", sky2: "#fde9d6", fog: "#f1e0d2", deep: "#25607e", mid: "#357f9c", shal: "#71bccc", sun: "#ffdcb0", hemi: "#fff0e2", ground: "#9a8f9e", sunI: 2.2 },
  { sky: "#6f8fd0", sky2: "#c8d6f2", fog: "#bfcde8", deep: "#173f6c", mid: "#245d90", shal: "#4f9cc8", sun: "#e6eeff", hemi: "#cfdcff", ground: "#7686a8", sunI: 1.9 },
];

export const figMat = () => {
  if (figMat.m) return figMat.m;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  figMat.m = m; return m;
};

export class World {
  constructor(scene, renderer, opt) {
    this.scene = scene; this.renderer = renderer; this.q = opt.quality; this.mode = opt.mode; this.L = layout(opt.mode); this.theme = THEMES[opt.theme || 0];
    this.time = 0; this.ents = []; this.pops = [];
    this.root = new THREE.Group(); scene.add(this.root);
    this.buildSky(); this.buildLights(); this.buildGround(); this.buildWater(); this.buildDecor(); this.buildEnts();
  }
  dispose() { this.scene.remove(this.root); this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const l of [this.hemi, this.sun, this.sun.target]) this.scene.remove(l); }
  /* ---------- небо и свет ---------- */
  buildSky() {
    const T = this.theme;
    this.scene.background = new THREE.Color(T.sky2);
    this.scene.fog = new THREE.Fog(T.fog, 38, 80);
  }
  buildLights() {
    const T = this.theme;
    this.hemi = new THREE.HemisphereLight(T.hemi, T.ground, 1.05); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(T.sun, T.sunI);
    this.sun.castShadow = this.q > 0;
    const sz = this.q > 1 ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
  }
  // солнце и тени следуют за камерой
  follow(x, z) { this.sun.position.set(x + 9, 18, z + 11); this.sun.target.position.set(x, 0, z - 2); }
  /* ---------- земля ---------- */
  height(x, z) {
    const L = this.L, sh = shoreZ(L, x);
    let h = (vnoise(x * 0.5, z * 0.5) - 0.5) * 0.12;
    const d = z - sh;     // >0 суша
    if (d < 0.6) h = Math.min(h, -0.85 * sstep(0.6, -1.8, d) + 0.02);
    for (const e of L.E) if (e.k === "spot" && !e.def.auto) { const r = Math.hypot(x - e.zin.x, z - e.zin.z); if (r < e.zin.r + 1.5) h = Math.max(h, -0.32 - 0.5 * sstep(e.zin.r - 0.2, e.zin.r + 1.5, r)); }
    return h;
  }
  buildGround() {
    const L = this.L, X0 = -34, X1 = 34, Z0 = -40, Z1 = 42;
    const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 120, 146); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const SNOW = new THREE.Color("#e9f0f7"), SNOW2 = new THREE.Color("#d2deea"), SAND = new THREE.Color("#cbbba0"), PEB = new THREE.Color("#a99d8c"), BED = new THREE.Color("#5d7f8c"), TRAMP = new THREE.Color("#cdd6df"), ROAD = new THREE.Color("#b3bcc6");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.height(x, z); pos.setY(i, h);
      const sh = shoreZ(L, x), d = z - sh;
      c.copy(SNOW).lerp(SNOW2, vnoise(x * 0.35 + 5, z * 0.35) * 0.8);
      if (d < 1.4) c.lerp(SAND, sstep(1.4, 0.2, d)); if (d < 0.2) c.lerp(PEB, sstep(0.2, -0.6, d)); if (d < -0.6) c.lerp(BED, sstep(-0.6, -2, d));
      // рынок и толпа — утоптанный снег, дорога
      if (z > 4.6 && z < 18.6 && x > -14 && x < 14) c.lerp(TRAMP, 0.55 * sstep(4.6, 6, z) * sstep(18.6, 17.5, z));
      if (Math.abs(z - 20.6) < 1.6) c.lerp(ROAD, sstep(1.6, 0.9, Math.abs(z - 20.6)) * (0.8 + vnoise(x * 2, z * 3) * 0.2));
      // тропинки между цехами
      if (z > -5 && z < 5 && x > -14 && x < 14) c.lerp(TRAMP, 0.35 * vnoise(x * 0.4, z * 0.4));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.ground = new THREE.Mesh(g, m); this.ground.receiveShadow = true; this.root.add(this.ground);
  }
  /* ---------- море ---------- */
  buildWater() {
    const L = this.L, T = this.theme;
    const g = new THREE.PlaneGeometry(90, 56, 90, 56); g.rotateX(-Math.PI / 2); g.translate(0, -0.06, -34);
    const shal = L.E.filter((e) => e.k === "spot" && !e.def.auto).map((e) => new THREE.Vector3(e.zin.x, e.zin.z, e.zin.r));
    while (shal.length < 2) shal.push(new THREE.Vector3(999, 999, 0));
    const cape = L.key === "vs" ? new THREE.Vector4(-4.4, 4.4, -13.4, 2) : new THREE.Vector4(9.8, 99, -13.2, 1);
    this.wu = { uTime: { value: 0 }, uDeep: { value: new THREE.Color(T.deep) }, uMid: { value: new THREE.Color(T.mid) }, uShal: { value: new THREE.Color(T.shal) },
      uShore: { value: -7.2 }, uCape: { value: cape }, uS: { value: shal }, fogColor: { value: new THREE.Color(T.fog) }, fogNear: { value: 38 }, fogFar: { value: 80 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.wu, fog: true, transparent: false,
      vertexShader: `uniform float uTime; varying vec3 vW; varying float vFogDepth;
        void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p,1.0);
          w.y += sin(w.x*0.9 + uTime*1.3)*0.035 + cos(w.z*1.1 + uTime*1.1)*0.035; vW = w.xyz;
          vec4 mv = viewMatrix * w; vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime, uShore; uniform vec3 uDeep, uMid, uShal; uniform vec4 uCape; uniform vec3 uS[2];
        uniform vec3 fogColor; uniform float fogNear, fogFar; varying vec3 vW; varying float vFogDepth;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float nz(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float sx = vW.x; float sh = uShore;
          float k = uCape.w > 1.5 ? 1.0 - smoothstep(3.4, 5.0, abs(sx)) : smoothstep(9.2, 10.6, sx); sh = mix(uShore, uCape.z, k);
          float d = sh - vW.z;              // расстояние от берега в море
          if (d < -0.6) discard;            // под сушей воды нет
          vec3 c = mix(uMid, uDeep, smoothstep(1.5, 9.0, d));
          c = mix(uShal, c, smoothstep(0.0, 2.2, d));
          for (int i = 0; i < 2; i++) { float r = length(vW.xz - uS[i].xy); c = mix(c, uShal * 1.06, (1.0 - smoothstep(uS[i].z - 0.6, uS[i].z + 1.2, r)) * 0.85); }
          float w = nz(vW.xz * vec2(1.6, 2.8) + vec2(uTime * 0.3, uTime * 0.12)) * nz(vW.xz * 2.6 - uTime * 0.22);
          c += vec3(0.1, 0.13, 0.15) * smoothstep(0.3, 0.42, w) * (1.0 - smoothstep(0.42, 0.6, w));
          float lines = smoothstep(0.92, 1.0, sin(vW.z * 2.2 + nz(vW.xz * 0.5) * 6.0 + uTime * 0.9)) * 0.08; c += vec3(lines);
          float f = 1.0 - smoothstep(0.0, 0.42 + 0.12 * sin(vW.x * 1.7 + uTime * 2.0), d);   // пена у берега
          c = mix(c, vec3(0.95, 0.98, 1.0), f * 0.85);
          float fogF = smoothstep(fogNear, fogFar, vFogDepth); c = mix(c, fogColor, fogF);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.water = new THREE.Mesh(g, m); this.root.add(this.water);
  }
  /* ---------- декор: лес, камни, сугробы, фонари, заборы ---------- */
  buildDecor() {
    const L = this.L, M = L.MAP, mat = figMat();
    const add = (geo, list, shadow) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
      list.forEach((t, i) => { e.set(0, t.r || 0, 0); q.setFromEuler(e); s.setScalar(t.s || 1); p.set(t.x, t.y == null ? this.height(t.x, t.z) : t.y, t.z); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
      im.castShadow = !!shadow; im.receiveShadow = true; this.root.add(im); return im;
    };
    const pines = [], pines2 = [], rocks = [], drifts = [], lamps = [];
    const R = (i, k) => hash(i * 3.17 + k, i * 1.31 - k);
    // лес по бокам и позади рынка
    for (let i = 0; i < 330; i++) {
      const x = -34 + R(i, 1) * 68, z = -8 + R(i, 2) * 50;
      const inside = x > M.w[0] - 0.6 && x < M.w[1] + 0.6 && z < 22.3;
      if (inside) continue;
      if (z < shoreZ(L, x) + 1.2) continue;
      if (Math.abs(z - 20.6) < 2.2 && x > -30 && x < 30) continue;   // дорога
      (R(i, 3) > 0.5 ? pines : pines2).push({ x, z, s: 0.8 + R(i, 4) * 0.7, r: R(i, 5) * 6 });
    }
    // мыс (где он есть) — камни и редкие ели
    for (let i = 0; i < 70; i++) {
      const x = -30 + R(i, 7) * 60, z = -14 + R(i, 8) * 8, sh = shoreZ(L, x);
      if (z < sh + 0.2 || z > -7.4) continue;
      if (Math.abs(x) > 15.5 || (L.key === "coop" && x < 10.6) || (L.key === "vs" && Math.abs(x) > 4.2)) { if (R(i, 9) > 0.6) rocks.push({ x, z, s: 0.6 + R(i, 10) * 0.8, r: R(i, 11) * 6 }); continue; }
      if (R(i, 12) > 0.75) rocks.push({ x, z, s: 0.5 + R(i, 10) * 0.6, r: R(i, 11) * 6 });
    }
    // камни вдоль берега
    for (let i = 0; i < 46; i++) {
      const x = -28 + R(i, 13) * 56; const sh = shoreZ(L, x), z = sh + 0.2 + R(i, 14) * 0.8;
      let near = false; for (const e of L.E) { if (e.k === "spot" && Math.abs(x - e.zin.x) < e.zin.r + 1.2) near = true; if (e.k === "pier" && Math.abs(x - e.pier.x) < 1.6) near = true; if (e.k === "dock" && Math.abs(x - e.x) < 3.5) near = true; }
      if (near && Math.abs(x) < 15) continue;
      if (Math.abs(x) < 15 && R(i, 15) > 0.45) continue;
      rocks.push({ x, z, s: 0.4 + R(i, 16) * 0.6, r: R(i, 17) * 6 });
    }
    // скалы за краем карты (море по бокам)
    for (let i = 0; i < 40; i++) { const sx = R(i, 18) > 0.5 ? 1 : -1; const x = sx * (16 + R(i, 19) * 14), z = -24 + R(i, 20) * 18; if (z > shoreZ(L, x) - 1) continue; rocks.push({ x, z, s: 1.2 + R(i, 21) * 2, r: R(i, 22) * 6, y: -0.4 }); }
    // сугробы в игровой зоне по краям
    for (let i = 0; i < 40; i++) { const x = M.w[0] + R(i, 23) * (M.w[1] - M.w[0]), z = -6 + R(i, 24) * 28; if (Math.abs(x) < M.w[1] - 1.2 && z < 19) continue; drifts.push({ x, z, s: 0.6 + R(i, 25) * 0.9, r: R(i, 26) * 6 }); }
    for (let x = -26; x <= 26; x += 6.5) { lamps.push({ x, z: 19.0 }); }
    // мелочи на снегу: сухая трава, камешки, бугорки — чтобы снег не был пустым
    const tufts = [], pebbles = [];
    const busy = (x, z) => { for (const e of L.E) { if (Math.hypot(x - e.x, z - e.z) < Math.max(e.w, e.d, 1.6) * 0.75 + 0.8) return true; for (const k of ["zin", "zout", "zcash", "zpad"]) if (e[k] && Math.hypot(x - e[k].x, z - e[k].z) < e[k].r + 0.4) return true; } return false; };
    for (let i = 0; i < 600 && tufts.length + pebbles.length < 230; i++) {
      const x = M.w[0] + R(i, 30) * (M.w[1] - M.w[0]), z = -6.5 + R(i, 31) * 18;
      if (z < shoreZ(L, x) + 0.6 || busy(x, z) || (z > 4.8 && z < 12.2)) continue;
      (R(i, 32) > 0.45 ? tufts : pebbles).push({ x, z, s: 0.6 + R(i, 33) * 0.7, r: R(i, 34) * 6 });
    }
    const tb = new Build(); for (let k = 0; k < 5; k++) tb.cone(0.035, 0.32 + (k % 2) * 0.1, 3, k % 2 ? "#b59a62" : "#9c8650", { p: [(k - 2) * 0.05, 0.14, (k % 3 - 1) * 0.04], r: [(k - 2) * 0.18, 0, (k % 3 - 1) * 0.2], jit: 0.1 }); tb.sph(0.12, 0, PAL.snow, { p: [0, 0.02, 0], s: [1.4, 0.4, 1.2], jit: 0.03 });
    const pb = new Build(); pb.sph(0.12, 0, PAL.stone, { p: [0, 0.04, 0], s: [1.3, 0.7, 1] }); pb.sph(0.08, 0, PAL.stone2, { p: [0.16, 0.03, 0.06], s: [1.2, 0.7, 1] }); pb.sph(0.1, 0, PAL.snow, { p: [0.02, 0.09, 0], s: [1.2, 0.35, 1], jit: 0.02 });
    add(tb.geo(), tufts, false); add(pb.geo(), pebbles, false);
    add(pineGeo(0), pines, true); add(pineGeo(1), pines2, true); add(rockGeo(), rocks, true); add(driftGeo(), drifts, false); add(lampGeo(), lamps, true);
    // заборы рынка
    for (const f of [...L.fences, ...L.div]) {
      const len = Math.max(f[2] - f[0], f[3] - f[1]), along = f[2] - f[0] >= f[3] - f[1];
      const m = new THREE.Mesh(fenceGeo(len), mat); m.position.set((f[0] + f[2]) / 2, 0, (f[1] + f[3]) / 2); if (!along) m.rotation.y = Math.PI / 2;
      m.castShadow = true; m.receiveShadow = true; this.root.add(m);
    }
    // столбы-указатели у дороги и пара домиков-декораций за рынком
    const hut = BUILD.hut(), crates = BUILD.crates(), barrel = BUILD.barrel(), boat = BUILD.boat();
    const deco = [[hut, -18, 25, 0.2], [hut, 17.5, 25.5, -0.3], [hut, 23, 14, -1.2], [hut, -23, 12, 1.4], [crates, -14.6, -5.5, 0.4], [barrel, 14.4, 5.5, 0], [barrel, 14.6, 6.4, 0], [crates, 14.2, 10.6, -0.5], [boat, -15.6, -8.0, 0.5], [boat, 17, -9, -0.4]];
    for (const d of L.deco) { const m = new THREE.Mesh(BUILD[d.m](), mat); m.position.set(d.x, 0, d.z); m.castShadow = true; m.receiveShadow = true; this.root.add(m); }
    // бочки и ящики у мест — для уюта (вне зон)
    for (const e of L.E) { if (!(e.k === "proc" || e.k === "gen")) continue; const sx = e.x + (e.w / 2 + 0.35) * (e.x > 0 ? 1 : -1) * (hash(e.i, 3) > 0.5 ? 1 : -1), sz = e.z - e.d / 2 + 0.3; const m = new THREE.Mesh(hash(e.i, 9) > 0.5 ? barrel : crates, mat); m.scale.setScalar(0.8); m.position.set(sx, 0, sz); m.rotation.y = hash(e.i, 5) * 6; m.castShadow = true; e.decoM = m; this.root.add(m); m.visible = false; }
    for (const [geo, x, z, r] of deco) { const m = new THREE.Mesh(geo, mat); m.position.set(x, this.height(x, z) < -0.2 ? -0.05 : this.height(x, z), z); m.rotation.y = r; m.castShadow = true; m.receiveShadow = true; this.root.add(m); }
  }
  /* ---------- места ---------- */
  buildEnts() {
    const L = this.L, mat = figMat();
    for (const e of L.E) {
      const grp = new THREE.Group(); grp.visible = false; this.root.add(grp);
      let geo = null, y = 0, ry = 0;
      if (e.k === "proc" || e.k === "gen") geo = (BUILD[e.def.model] || BUILD.table)(e.w, e.d);
      if (e.k === "stall") { geo = BUILD.stall(STALL_COL[ITEMS[e.item].id] || "#4f8fc0"); }
      if (e.k === "board") geo = BUILD.board();
      if (e.k === "goal") geo = BUILD.lighthouse();
      if (e.k === "dock") { geo = BUILD.dock(); if (e.sg < 0) ry = Math.PI; }
      if (e.k === "pier") { const len = e.pier.z0 - e.pier.z1 + 0.8; geo = BUILD.pier(len); grp.position.set(e.pier.x, 0, (e.pier.z0 + e.pier.z1) / 2); }
      else grp.position.set(e.x, y, e.z);
      if (geo) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.rotation.y = ry; grp.add(m); }
      if (e.k === "stall" && ICON[ITEMS[e.item].id]) {
        const t = new THREE.CanvasTexture(ICON[ITEMS[e.item].id]); t.colorSpace = THREE.SRGBColorSpace;
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); sg.position.set(0, 2.95, -0.95); sg.rotation.x = -0.15; sg.scale.setScalar(1.15); grp.add(sg); grp.userData.sign = sg;
      }
      if (e.k === "board") {
        // вывеска «ЗАКАЗЫ» над доской
        const c = document.createElement("canvas"); c.width = 512; c.height = 160; const x = c.getContext("2d");
        x.fillStyle = "#c9433a"; x.beginPath(); x.roundRect ? x.roundRect(8, 8, 496, 144, 40) : x.rect(8, 8, 496, 144); x.fill(); x.lineWidth = 10; x.strokeStyle = "#fff"; x.stroke();
        x.font = "900 86px Rubik, Nunito, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff"; x.fillText((window.I18N ? I18N.t("ЗАКАЗЫ") : "ЗАКАЗЫ"), 256, 84);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.69), new THREE.MeshBasicMaterial({ map: t, transparent: true })); sg.position.set(0, 2.55, 0.1); sg.rotation.x = -0.2; grp.add(sg);
      }
      if (e.k === "dock") {
        const ship = new THREE.Mesh(BUILD.ship(), mat); ship.castShadow = true; ship.position.set(e.berth.x - e.x, 0, e.berth.z - e.z); grp.add(ship); grp.userData.ship = ship;
      }
      // таблички-цвет у входа и выхода цехов: на земле, в view.js
      this.ents[e.i] = { e, grp, open: false, pop: 0 };
    }
  }
  // показать открытые места; anim — с «прыжком»
  sync(G, anim) {
    for (const w of this.ents) {
      const o = !!G.e[w.e.i].o;
      if (o === w.open) continue;
      w.open = o; w.grp.visible = o && w.e.k !== "spot" && w.e.k !== "helper" && w.e.k !== "upg";
      if (w.e.decoM) w.e.decoM.visible = o;
      if (o && anim) { w.pop = 0.001; w.grp.scale.setScalar(0.01); }
      else w.grp.scale.setScalar(1);
    }
  }
  update(dt, G) {
    this.time += dt;
    this.wu.uTime.value = this.time;
    for (const w of this.ents) {
      if (w.grp.userData.sign) w.grp.userData.sign.position.y = 2.85 + Math.sin(this.time * 2 + w.e.i) * 0.06;
      if (w.pop > 0) { w.pop += dt; const t = Math.min(1, w.pop / 0.55); const s = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t) + (1 - Math.pow(1 - t, 3)) - 1 : 1; w.grp.scale.setScalar(Math.max(0.01, t < 1 ? Math.min(1.2, (1 - Math.pow(1 - t, 3)) * (1 + Math.sin(t * Math.PI) * 0.22)) : 1)); if (t >= 1) { w.pop = 0; w.grp.scale.setScalar(1); } void s; }
      // судно у причала
      if (w.e.k === "dock" && w.grp.userData.ship && G) {
        const s = G.e[w.e.i], ship = w.grp.userData.ship, bx = w.e.berth.x - w.e.x, bz = w.e.berth.z - w.e.z;
        let off = 0;
        if (s.ship === 0) off = 40; else if (s.ship === 1) off = Math.max(0, s.st / 4) * 22; else if (s.ship === 3) off = (1 - Math.max(0, s.st / 4)) * 22;
        ship.position.set(bx, Math.sin(this.time * 1.4) * 0.06 - 0.05, bz - off);
        ship.rotation.z = Math.sin(this.time * 1.1) * 0.03; ship.rotation.y = s.ship === 3 ? 0 : Math.PI; ship.visible = off < 30;
      }
    }
  }
}
