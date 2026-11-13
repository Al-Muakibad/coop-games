// «Промысел» — всё, что движется: люди (одна отрисовка на часть тела для всех), стопки на спине, кучи у цехов, косяки рыбы,
// летящие предметы, деньги, площадки покупки с заполнением, пузыри над покупателями, частицы, снег, стрелка-подсказка.
import * as THREE from "three";
import { ITEMS, IT, UPG, PAD_R } from "./data.js";
import { layout, padVisible, padCost, accepts, capOf, itemPrice } from "./sim.js";
import { torsoGeo, legGeo, armGeo, packGeo, ITEM_GEO, ITEM_H, schoolFishGeo, Build, PAL } from "./art.js";
import { ICON, BUB, bubbleAtlas } from "./icons.js";

const M4 = new THREE.Matrix4(), M5 = new THREE.Matrix4(), Q = new THREE.Quaternion(), EU = new THREE.Euler(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), SV = new THREE.Vector3();
const V = new THREE.Vector3(), V2 = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
const tr = (s) => (window.I18N ? window.I18N.t(s) : s);
const angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
export const ITEM_NAMES = ITEMS.map((i) => i.id).concat(["cash"]);
export const CASH = ITEM_NAMES.length - 1;

// цвета людей
export const PCOL = [{ coat: "#e0703a", hat: "#2d4f7c" }, { coat: "#3aa0c8", hat: "#c9433a" }];
const HCOL = { coat: "#5f8f6f", hat: "#f2c14e" };
const CUST = ["#d9667a", "#8a7fd1", "#5bb0a0", "#e39a4c", "#6f9fd8", "#b77fb5", "#9cb35a", "#d4795b", "#c25d5d", "#4f9a8f"];
const CHAT = ["#f4ece0", "#3b4a6b", "#c9433a", "#e6b03c", "#5a7d5a", "#8a5a9a", "#2f6f8f", "#d9d0c0"];

/* ---------- материал людей: перекраска одежды по маске ---------- */
function charMat() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
attribute vec2 aMask; attribute vec3 aCoat; attribute vec3 aHat;`).replace("#include <color_vertex>", `
vColor = vec3(1.0); vColor *= color; vColor *= mix(vec3(1.0), aCoat, aMask.x); vColor *= mix(vec3(1.0), aHat, aMask.y);`);
  };
  m.customProgramCacheKey = () => "pmChar";
  return m;
}
class Pool {
  constructor(parent, geo, mat, cap, opt) {
    opt = opt || {};
    this.geo = geo; this.cap = cap; this.n = 0;
    if (opt.tint) {
      this.coat = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); this.hat = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      this.coat.setUsage(THREE.DynamicDrawUsage); this.hat.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aCoat", this.coat); geo.setAttribute("aHat", this.hat);
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, cap); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = opt.shadow !== false; this.mesh.receiveShadow = !!opt.receive; this.mesh.frustumCulled = false; this.mesh.count = 0;
    parent.add(this.mesh);
  }
  begin() { this.n = 0; }
  push(m, coat, hat) {
    if (this.n >= this.cap) return -1;
    const i = this.n++; this.mesh.setMatrixAt(i, m);
    if (coat && this.coat) { this.coat.setXYZ(i, coat.r, coat.g, coat.b); this.hat.setXYZ(i, hat.r, hat.g, hat.b); }
    return i;
  }
  end() { this.mesh.count = this.n; if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; if (this.coat) { this.coat.needsUpdate = true; this.hat.needsUpdate = true; } } }
}

export class View {
  constructor(scene, world, opt) {
    this.scene = scene; this.world = world; this.mode = opt.mode; this.L = layout(opt.mode); this.q = opt.quality;
    this.root = new THREE.Group(); scene.add(this.root);
    this.t = 0;
    const cm = charMat(), fm = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.torso = new Pool(this.root, torsoGeo(), cm, 120, { tint: 1 });
    this.leg = new Pool(this.root, legGeo(), cm, 240, { tint: 1 });
    this.arm = new Pool(this.root, armGeo(), cm, 240, { tint: 1 });
    this.pack = new Pool(this.root, packGeo(), fm, 40);
    this.items = ITEM_NAMES.map((n) => new Pool(this.root, ITEM_GEO[n](), fm, n === "cash" ? 500 : 420, { receive: true }));
    this.fish = [new Pool(this.root, schoolFishGeo(0), fm, 80, { shadow: false }), new Pool(this.root, schoolFishGeo(1), fm, 60, { shadow: false })];
    this.disp = { p: [], h: [], c: new Map() };
    this.coats = { p: PCOL.map((c) => ({ coat: new THREE.Color(c.coat), hat: new THREE.Color(c.hat) })), h: { coat: new THREE.Color(HCOL.coat), hat: new THREE.Color(HCOL.hat) },
      c: CUST.map((c, i) => ({ coat: new THREE.Color(c), hat: new THREE.Color(CHAT[(i * 3 + 1) % CHAT.length]) })) };
    this.flyers = []; this.pend = new Map();
    this.buildParticles(); this.buildRings(); this.buildBubbles(); this.buildSnow(); this.buildGuide();
    this.pads = new Map();
    this.labels = new Map(); this.usedLabels = new Set();
    this.schools = new Map();
  }
  dispose() { this.scene.remove(this.root); this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); for (const p of this.pads.values()) p.tex.dispose(); }

  /* ---------- частицы ---------- */
  buildParticles() {
    const g = new THREE.BoxGeometry(1, 1, 1);
    this.pm = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), 700);
    this.pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3), 3);
    this.pm.frustumCulled = false; this.pm.count = 0; this.root.add(this.pm);
    this.parts = [];
  }
  burst(x, y, z, kind, n) {
    const C = new THREE.Color();
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 680) this.parts.shift();
      const a = Math.random() * Math.PI * 2, sp = kind === "conf" ? 3 + Math.random() * 4 : kind === "splash" ? 1.2 + Math.random() * 1.8 : kind === "smoke" ? 0.2 : 1 + Math.random() * 2;
      const col = kind === "conf" ? ["#ff5a4a", "#f2c14e", "#3aa0c8", "#7ed957", "#e0703a", "#b77fb5", "#ffffff"][i % 7] : kind === "splash" ? (i % 2 ? "#e6f6ff" : "#9fd9f0") : kind === "snow" ? "#ffffff" : kind === "gold" ? "#ffe07a" : kind === "smoke" ? "#eef1f4" : kind === "cash" ? "#7ed957" : "#ffffff";
      C.set(col);
      this.parts.push({ x, y, z, vx: Math.cos(a) * sp * (kind === "conf" ? 0.5 : 1), vy: kind === "conf" ? 5 + Math.random() * 4 : kind === "smoke" ? 0.9 + Math.random() * 0.4 : kind === "splash" ? 2.5 + Math.random() * 2.5 : 1.5 + Math.random() * 2, vz: Math.sin(a) * sp * (kind === "conf" ? 0.5 : 1),
        life: 0, max: kind === "conf" ? 1.6 + Math.random() : kind === "smoke" ? 1.3 : 0.6 + Math.random() * 0.4, r: C.r, g: C.g, b: C.b,
        s: kind === "conf" ? 0.12 : kind === "smoke" ? 0.09 : kind === "snow" ? 0.12 : 0.08, grav: kind === "smoke" ? -0.1 : kind === "conf" ? 6 : 12, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12, k: kind });
    }
  }
  stepParticles(dt) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life += dt;
      if (p.life > p.max) { this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt; if (p.k === "conf") { p.vx *= 0.98; p.vz *= 0.98; if (p.vy < -1.5) p.vy = -1.5; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt;
      if (p.y < 0.02 && p.k !== "smoke") { p.y = 0.02; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
      const f = 1 - p.life / p.max, s = p.s * (p.k === "smoke" ? (0.6 + p.life * 0.9) * Math.min(1, f * 3) : Math.min(1, f * 2.5));
      EU.set(p.rot, p.rot * 0.7, 0); Q.setFromEuler(EU); SV.set(s, p.k === "conf" ? s * 0.25 : s, s);
      M4.compose(P.set(p.x, p.y, p.z), Q, SV); this.pm.setMatrixAt(n, M4); this.pm.instanceColor.setXYZ(n, p.r, p.g, p.b); n++;
    }
    this.pm.count = n; this.pm.instanceMatrix.needsUpdate = true; this.pm.instanceColor.needsUpdate = true;
  }
  /* ---------- кольца-зоны на земле ---------- */
  buildRings() {
    const g = new THREE.RingGeometry(0.78, 0.95, 40); g.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), 120);
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(120 * 3), 3); this.rings.frustumCulled = false; this.rings.renderOrder = 1; this.root.add(this.rings);
    const d = new THREE.CircleGeometry(0.95, 40); d.rotateX(-Math.PI / 2);
    this.discs = new THREE.InstancedMesh(d, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }), 120);
    this.discs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(120 * 3), 3); this.discs.frustumCulled = false; this.discs.renderOrder = 1; this.root.add(this.discs);
  }
  /* ---------- пузыри (всегда лицом к камере) ---------- */
  buildBubbles() {
    const cap = 200, g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.bPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.bCell = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    this.bPos.setUsage(THREE.DynamicDrawUsage); this.bCell.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iPos", this.bPos); g.setAttribute("iCell", this.bCell); g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: bubbleAtlas() } }, transparent: true, depthWrite: false, depthTest: true,
      vertexShader: `attribute vec3 iPos; attribute vec2 iCell; varying vec2 vUv; varying float vA;
        void main(){ float cell = iCell.x; float sc = iCell.y; vA = clamp(sc * 3.0, 0.0, 1.0);
          vec2 c = vec2(mod(cell, 8.0), floor(cell / 8.0)); vUv = (c + vec2(uv.x, 1.0 - uv.y)) / 8.0; vUv.y = 1.0 - vUv.y;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 p = iPos + right * position.x * sc + up * position.y * sc;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform sampler2D uTex; varying vec2 vUv; varying float vA; void main(){ vec4 c = texture2D(uTex, vUv); if (c.a < 0.03) discard; gl_FragColor = vec4(c.rgb, c.a * vA);
        #include <colorspace_fragment>
      }`,
    });
    this.bub = new THREE.Mesh(g, m); this.bub.frustumCulled = false; this.bub.renderOrder = 5; this.root.add(this.bub); this.bN = 0; this.bCap = cap;
  }
  bubble(x, y, z, cell, sc) { if (this.bN >= this.bCap || cell == null) return; const i = this.bN++; this.bPos.setXYZ(i, x, y, z); this.bCell.setXY(i, cell, sc); }
  /* ---------- снег ---------- */
  buildSnow() {
    const n = this.q > 0 ? 500 : 220, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 30; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
    this.snow.frustumCulled = false; this.root.add(this.snow); this.snowN = n;
  }
  /* ---------- стрелка-подсказка ---------- */
  buildGuide() {
    const b = new Build(); b.cone(0.32, 0.55, 3, "#ffd34d", { p: [0, 0, 0.18], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.3], jit: 0 }); b.box(0.18, 0.06, 0.4, "#ffd34d", { p: [0, 0, -0.2], jit: 0 });
    this.arrow = new THREE.Mesh(b.geo(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })); this.arrow.visible = false; this.arrow.renderOrder = 2; this.root.add(this.arrow);
    const b2 = new Build(); b2.cone(0.35, 0.6, 4, "#ffd34d", { p: [0, 0.3, 0], r: [Math.PI, 0, 0], jit: 0.05 }); b2.box(0.22, 0.45, 0.22, "#ffd34d", { p: [0, 0.8, 0], jit: 0.05 });
    this.marker = new THREE.Mesh(b2.geo(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color("#7a5a00") })); this.marker.visible = false; this.root.add(this.marker);
  }
  guide(from, to) {
    if (!to) { this.arrow.visible = this.marker.visible = false; return; }
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
    this.marker.visible = true; this.marker.position.set(to.x, 1.6 + Math.abs(Math.sin(this.t * 3)) * 0.5 + (to.y || 0), to.z); this.marker.rotation.y = this.t * 2;
    if (d < 1.8) { this.arrow.visible = false; return; }
    this.arrow.visible = true; const a = Math.atan2(dx, dz); const r = 1.35 + Math.sin(this.t * 6) * 0.12;
    this.arrow.position.set(from.x + Math.sin(a) * r, 0.08, from.z + Math.cos(a) * r); this.arrow.rotation.y = a;
  }
  /* ---------- площадки ---------- */
  padMesh(ei) {
    let p = this.pads.get(ei); if (p) return p;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const u = { uTex: { value: tex }, uProg: { value: 0 }, uTime: { value: 0 }, uOk: { value: 0 }, uHot: { value: 0 }, uGold: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uProg, uTime, uOk, uHot, uGold; varying vec2 vUv;
        float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
        void main(){ vec2 p = vUv - 0.5; float d = box(p, vec2(0.47), 0.1);
          if (d > 0.0) discard;
          vec3 base = mix(vec3(0.16,0.25,0.36), vec3(0.42,0.3,0.08), uGold);
          vec3 fill = mix(vec3(0.33,0.78,0.42), vec3(0.98,0.78,0.25), uGold);
          vec3 c = base; float a = 0.72;
          if (vUv.y < uProg) { c = fill; a = 0.9; }
          float edge = smoothstep(-0.035, -0.012, d);
          float dash = step(0.5, fract((atan(p.y, p.x) / 6.2832) * 24.0 - uTime * (0.4 + uHot)));
          vec3 ec = mix(vec3(1.0), mix(vec3(0.62,1.0,0.6), vec3(1.0,0.86,0.4), uGold), uOk);
          c = mix(c, ec, edge * mix(0.55, 1.0, dash)); a = mix(a, 1.0, edge);
          c += vec3(0.12) * uHot * (0.5 + 0.5 * sin(uTime * 10.0));
          vec4 t = texture2D(uTex, vUv); c = mix(c, t.rgb, t.a);
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    });
    const g = new THREE.PlaneGeometry(PAD_R * 2.1, PAD_R * 2.1); g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; this.root.add(mesh);
    p = { mesh, u, tex, c, key: "", pop: 0 }; this.pads.set(ei, p); return p;
  }
  // табличка на земле в зоне: что сюда класть (белая, стрелка вниз) или что отсюда забирать (жёлтая, стрелка вверх)
  label(key, z, icons, kind, txt) {
    this.usedLabels.add(key);
    let l = this.labels.get(key);
    const sig = icons.join(",") + kind + txt;
    if (!l) {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const g = new THREE.PlaneGeometry(1.55, 1.55); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); m.renderOrder = 3; this.root.add(m);
      l = { m, c, tex, sig: "" }; this.labels.set(key, l);
    }
    if (l.sig !== sig) {
      l.sig = sig; const x = l.c.getContext("2d"); x.clearRect(0, 0, 256, 256);
      const col = kind === "out" ? "rgba(255, 211, 77, .92)" : kind === "cash" ? "rgba(126, 217, 87, .9)" : "rgba(255, 255, 255, .9)";
      x.fillStyle = "rgba(15, 33, 51, .55)"; x.beginPath(); x.arc(128, 128, 118, 0, 7); x.fill();
      x.lineWidth = 10; x.strokeStyle = col; x.beginPath(); x.arc(128, 128, 112, 0, 7); x.stroke();
      const n = icons.length, sz = n > 1 ? 92 : 120;
      icons.forEach((ic, i) => { const im = ICON[ic]; if (im) x.drawImage(im, 128 - (n * sz) / 2 + i * sz, n > 1 ? 52 : 34, sz, sz); });
      // стрелка: вниз — положить, вверх — забрать
      x.fillStyle = col; x.beginPath();
      if (kind === "out") { x.moveTo(128, 150); x.lineTo(158, 182); x.lineTo(98, 182); } else { x.moveTo(98, 160); x.lineTo(158, 160); x.lineTo(128, 192); }
      x.closePath(); x.fill();
      x.font = "900 30px Nunito, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff"; x.fillText(txt, 128, 216);
      l.tex.needsUpdate = true;
    }
    l.m.visible = true; l.m.position.set(z.x, this.groundY(z.x, z.z) + 0.06, z.z);
  }
  padIcon(e) {
    if (e.k === "supg") return ICON.speed;
    if (e.k === "upg") return ICON[{ bag: "bag", boots: "boots", net: "net", crew: "crate2", crewspd: "skis" }[e.def.u]];
    if (e.k === "helper") return e.def.role === "cashier" ? ICON.cashier : ICON.helper;
    if (e.k === "stall") return ICON.stall;
    if (e.k === "proc") return ICON[ITEMS[e.rec.out].id];
    if (e.k === "gen") return ICON[ITEMS[e.item].id];
    if (e.k === "pier") return ICON.pier;
    if (e.k === "dock") return ICON.dock;
    if (e.k === "goal") return ICON.light;
    return ICON.star;
  }
  drawPad(p, e, cost, lvl) {
    const x = p.c.getContext("2d"); x.clearRect(0, 0, 256, 256);
    const ic = this.padIcon(e); if (ic) { x.drawImage(ic, 64, 26, 128, 128); }
    if (e.k === "stall" && ICON[ITEMS[e.item].id]) x.drawImage(ICON[ITEMS[e.item].id], 136, 86, 70, 70);
    if (e.k === "supg") { const t = this.L.E[e.tg]; const it = t.k === "gen" ? t.item : t.rec.out; if (ICON[ITEMS[it].id]) x.drawImage(ICON[ITEMS[it].id], 150, 92, 64, 64); }
    if (e.k === "helper") { const src = e.from != null ? this.L.E[e.from] : null; const it = src ? (src.k === "spot" ? src.item : src.k === "gen" ? src.item : src.rec.out) : null; if (it != null && ICON[ITEMS[it].id]) x.drawImage(ICON[ITEMS[it].id], 150, 92, 64, 64); }
    x.font = "900 58px Nunito, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.lineWidth = 12; x.strokeStyle = "rgba(20,30,45,.85)"; x.lineJoin = "round";
    const s = fmt(cost); x.strokeText(s, 128, 200); x.fillStyle = "#ffffff"; x.fillText(s, 128, 200);
    if (lvl) { x.font = "900 34px Nunito, Arial, sans-serif"; x.strokeText(lvl, 206, 36); x.fillStyle = "#ffe08a"; x.fillText(lvl, 206, 36); }
    p.tex.needsUpdate = true;
  }
  /* ---------- летящие предметы ---------- */
  fly(type, from, to, o) {
    o = o || {};
    if (this.flyers.length > 160) { const f = this.flyers.shift(); if (f.key) this.pend.set(f.key, Math.max(0, (this.pend.get(f.key) || 0) - 1)); }
    const f = { type, fx: from.x, fy: from.y, fz: from.z, to, t: 0, dur: o.dur || 0.32, h: o.h == null ? 1.0 : o.h, key: o.key || "", spin: o.spin == null ? 1 : o.spin, done: o.done, delay: o.delay || 0, s: o.s || 1 };
    if (f.key) this.pend.set(f.key, (this.pend.get(f.key) || 0) + 1);
    this.flyers.push(f);
  }
  pendOf(key) { return this.pend.get(key) || 0; }
  stepFlyers(dt) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const to = typeof f.to === "function" ? f.to() : f.to;
      if (k >= 1 || !to) { this.flyers.splice(i, 1); if (f.key) this.pend.set(f.key, Math.max(0, (this.pend.get(f.key) || 0) - 1)); if (f.done) f.done(); continue; }
      const e = k * k * (3 - 2 * k);
      P.set(lerp(f.fx, to.x, e), lerp(f.fy, to.y, e) + Math.sin(k * Math.PI) * f.h, lerp(f.fz, to.z, e));
      EU.set(k * 6 * f.spin, k * 4 * f.spin, 0); Q.setFromEuler(EU); SV.setScalar(f.s * (1 - Math.sin(k * Math.PI) * -0.15));
      M4.compose(P, Q, SV); this.items[f.type].push(M4);
    }
  }
  /* ---------- главный кадр ---------- */
  // ctx: {me, cam:{x,z}, local:{x,z,dir} — предсказанная позиция своего игрока, hot: ei площадки под ногами}
  update(G, dt, ctx) {
    this.t += dt;
    const L = this.L, t = this.t;
    this.torso.begin(); this.leg.begin(); this.arm.begin(); this.pack.begin(); for (const p of this.items) p.begin(); for (const f of this.fish) f.begin();
    this.bN = 0;
    // игроки
    for (let i = 0; i < G.pl.length; i++) {
      const p = G.pl[i]; const d = this.disp.p[i] || (this.disp.p[i] = { x: p.x, z: p.z, dir: p.dir, ph: 0, lean: 0, lv: 0, sp: 0, ox: p.x, oz: p.z });
      if (ctx.local && i === ctx.me) { d.x = ctx.local.x; d.z = ctx.local.z; d.dir = angLerp(d.dir, ctx.local.dir, Math.min(1, dt * 16)); }
      else { const k = Math.min(1, dt * (ctx.remoteK || 14)); d.x = lerp(d.x, p.x, k); d.z = lerp(d.z, p.z, k); if (p.mv) d.dir = angLerp(d.dir, p.dir, Math.min(1, dt * 12)); }
      this.person(d, this.coats.p[G.mode === "vs" ? p.team : i], dt, p.st, "p" + i, true, G, 1.0);
    }
    // помощники
    for (let i = 0; i < G.hp.length; i++) {
      const h = G.hp[i]; const d = this.disp.h[i] || (this.disp.h[i] = { x: h.x, z: h.z, dir: h.dir, ph: 0, lean: 0, lv: 0, sp: 0, ox: h.x, oz: h.z });
      const k = Math.min(1, dt * 10); d.x = lerp(d.x, h.x, k); d.z = lerp(d.z, h.z, k); d.dir = angLerp(d.dir, h.dir, Math.min(1, dt * 10));
      this.person(d, this.coats.h, dt, h.st, "h" + i, true, G, 0.92);
      if (h.s === 2 && h.st.length && t % 2 < 1.2 && h.tm > 1) { /* ждёт места — пузырь */ const tg = h.tg >= 0 ? G.e[h.tg] : null; if (!tg || (L.E[h.tg].k === "stall" && tg.sh >= 24)) this.bubble(d.x, 2.2, d.z, BUB.zzz, 0.55); }
    }
    // покупатели
    const seen = new Set();
    for (const c of G.cu) {
      seen.add(c.id);
      let d = this.disp.c.get(c.id); if (!d) { d = { x: c.x, z: c.z, dir: c.dir, ph: Math.random() * 6, lean: 0, lv: 0, sp: 0, ox: c.x, oz: c.z, pop: 0, mood: 0, got: 0, gt: 0 }; this.disp.c.set(c.id, d); }
      const k = Math.min(1, dt * 9); d.x = lerp(d.x, c.x, k); d.z = lerp(d.z, c.z, k); d.dir = angLerp(d.dir, c.dir, Math.min(1, dt * 8));
      const col = this.coats.c[c.sk % this.coats.c.length] || this.coats.c[(c.id * 7) % this.coats.c.length];
      // в руках — купленное
      const hold = d.hold || (d.hold = []); hold.length = 0; const gotV = Math.max(0, c.g - this.pendOf("c" + c.id)); for (let j = 0; j < gotV; j++) hold.push(c.w);
      this.person(d, col, dt, hold, "c" + c.id, false, G, 0.95);
      // пузырь: что хочет / настроение
      if (c.s !== 4 || d.mood) {
        let cell = null, sc = 0.78;
        if (c.mood === 3 || (c.s === 4 && c.mood === 3)) cell = BUB.angry;
        else if (c.s === 4 && c.mood === 1) cell = BUB.happy;
        else if (c.mood === 2) cell = (t * 2 + c.id) % 2 < 1 ? BUB.angry : BUB["i_" + ITEMS[c.w].id];
        else if (c.s === 2 || c.s === 1) cell = BUB["i_" + ITEMS[c.w].id];
        if (c.s === 4) { d.lt = (d.lt || 0) + dt; if (d.lt > 1.6) cell = null; sc = 0.78 * Math.max(0, 1 - Math.max(0, d.lt - 1.2) / 0.4); }
        if (c.s === 1 && !this.near(d, ctx.cam, 9)) cell = c.id % 3 === 0 ? cell : null;    // в толпе — не у всех, чтобы не рябило
        if (cell != null) {
          const bob = Math.sin(t * 3 + c.id) * 0.05;
          this.bubble(d.x, 1.75 + bob, d.z, cell, sc);
          if (c.s === 2 && c.n - c.g > 1 && cell !== BUB.angry) this.bubble(d.x + 0.36, 1.78 + bob, d.z + 0.02, BUB["x" + Math.min(9, c.n - c.g)], 0.42);
        }
      }
    }
    for (const id of this.disp.c.keys()) if (!seen.has(id)) this.disp.c.delete(id);
    // места: кучи, деньги, косяки, кольца, площадки
    this.drawEnts(G, dt, ctx);
    this.stepFlyers(dt);
    this.stepParticles(dt);
    // снег вокруг камеры
    const sp = this.snow.geometry.attributes.position, cx = ctx.cam.x, cz = ctx.cam.z;
    for (let i = 0; i < this.snowN; i++) {
      let y = sp.getY(i) - dt * (0.9 + (i % 5) * 0.15), x = sp.getX(i) + Math.sin(t * 0.7 + i) * dt * 0.3, z = sp.getZ(i);
      if (y < 0) { y = 12 + Math.random() * 2; x = cx + (Math.random() - 0.5) * 30; z = cz + (Math.random() - 0.5) * 30 - 4; }
      if (x < cx - 16) x += 32; if (x > cx + 16) x -= 32; if (z < cz - 20) z += 32; if (z > cz + 12) z -= 32;
      sp.setXYZ(i, x, y, z);
    }
    sp.needsUpdate = true;
    this.torso.end(); this.leg.end(); this.arm.end(); this.pack.end(); for (const p of this.items) p.end(); for (const f of this.fish) f.end();
    this.bPos.needsUpdate = true; this.bCell.needsUpdate = true; this.bub.geometry.instanceCount = this.bN;
  }
  near(d, c, r) { return Math.abs(d.x - c.x) < r && Math.abs(d.z - c.z) < r * 1.4; }
  groundY(x, z) { return Math.max(this.world.height(x, z), -0.42); }
  // человек: туловище, ноги, руки; стопка — на коробе за спиной (pack) или в руках (покупатель)
  person(d, col, dt, stack, key, pack, G, scale) {
    const mvx = d.x - d.ox, mvz = d.z - d.oz; d.ox = d.x; d.oz = d.z;
    const sp = Math.hypot(mvx, mvz) / Math.max(dt, 1e-3);
    d.sp = lerp(d.sp, Math.min(sp, 6), Math.min(1, dt * 10));
    const moving = d.sp > 0.25;
    d.ph += Math.min(sp, 6) * dt * 3.1;
    // наклон стопки: пружина от разгона
    const acc = (d.sp - (d.psp || 0)) / Math.max(dt, 1e-3); d.psp = d.sp;
    d.lv += (-acc * 0.012 - d.lean * 30) * dt; d.lv *= Math.pow(0.04, dt); d.lean += d.lv * dt * 10; d.lean = Math.max(-0.35, Math.min(0.35, d.lean));
    const y0 = this.groundY(d.x, d.z) + (moving ? Math.abs(Math.sin(d.ph)) * 0.06 : Math.sin(this.t * 2 + d.x) * 0.008);
    const sw = moving ? Math.sin(d.ph) * 0.65 * Math.min(1, d.sp / 3) : 0;
    EU.set(0, d.dir, 0); Q.setFromEuler(EU); SV.setScalar(scale);
    M5.compose(P.set(d.x, y0, d.z), Q, SV);
    this.torso.push(M5, col.coat, col.hat);
    // ноги
    for (const s of [-1, 1]) { EU.set(sw * s, 0, 0); Q.setFromEuler(EU); M4.compose(P.set(0.12 * s, 0.36, 0), Q, S1); M4.premultiply(M5); this.leg.push(M4, col.coat, col.hat); }
    // руки: несущий стопку держит лямки, покупатель — товар перед собой
    const carry = stack && stack.length;
    for (const s of [-1, 1]) {
      const ax = carry && !pack ? -1.25 : -sw * s * 0.8 + (carry ? -0.25 : 0), az = s * (carry && !pack ? 0.25 : 0.12);
      EU.set(ax, 0, az); Q.setFromEuler(EU); M4.compose(P.set(0.3 * s, 0.84, 0), Q, S1); M4.premultiply(M5); this.arm.push(M4, col.coat, col.hat);
    }
    if (pack) { M4.compose(P.set(0, 0.56, -0.36), Q.identity(), S1); M4.premultiply(M5); this.pack.push(M4); }
    if (!carry) return;
    // стопка
    const pend = this.pendOf(key), n = Math.max(0, stack.length - pend);
    let h = pack ? 0.6 : 0.62;
    const bx = 0, bz = pack ? -0.4 : 0.42;
    for (let i = 0; i < n; i++) {
      const it = stack[i], nm = ITEM_NAMES[it], ih = ITEM_H[nm] || 0.2;
      const k = (h - 0.5) / 1.4;
      const wob = Math.sin(this.t * 4 + i * 0.5 + d.x) * 0.01 * i * (moving ? 1 : 0.3);
      EU.set(0, Math.PI / 2 + (i % 2 ? 0.08 : -0.06), 0); Q.setFromEuler(EU);
      M4.compose(P.set(bx + wob, h, bz - d.lean * k * k * 0.6 * (pack ? 1 : -1)), Q, S1); M4.premultiply(M5);
      this.items[it].push(M4);
      h += ih;
    }
    d.top = h;
  }
  // мировая точка «верх стопки» у человека
  topOf(key) {
    const kind = key[0], idx = key.slice(1);
    const d = kind === "p" ? this.disp.p[+idx] : kind === "h" ? this.disp.h[+idx] : this.disp.c.get(+idx);
    if (!d) return null;
    const s = 0.95, back = kind === "c" ? 0.42 : -0.4;
    return V2.set(d.x + Math.sin(d.dir) * back * s, this.groundY(d.x, d.z) + (d.top || 0.7) * s + 0.05, d.z + Math.cos(d.dir) * back * s).clone();
  }
  /* ---------- места ---------- */
  pileSpot(e, kind) {
    // где лежит куча: вход/выход цеха, полка прилавка, причал, деньги
    if (kind === "in") { const z = e.zin; return { x: (z.x + e.x) / 2 + (e.k === "proc" ? 0 : 0), z: z.z + (e.z - z.z) * 0.45, y: 0 }; }
    if (kind === "out") { const z = e.zout; return { x: z.x + (e.x - z.x) * 0.42, z: z.z + (e.z - z.z) * 0.42, y: 0 }; }
    if (kind === "shelf") return { x: e.x - 0.35 * e.sg, z: e.z, y: 0.97 };
    if (kind === "cash") { const z = e.zcash; return { x: z.x, z: z.z + 0.15, y: 0 }; }
    if (kind === "dock") return { x: e.x + 0.3 * e.sg, z: e.z + 0.2, y: 0.21 };
    return { x: e.x, z: e.z, y: 0 };
  }
  // положение i-го предмета в куче (колонки по 5 в высоту)
  pilePos(base, i, it, cols, rows, hmax) {
    cols = cols || 3; rows = rows || 2; hmax = hmax || 5;
    const per = cols * rows, layer = Math.floor(i / per), j = i % per;
    const nm = ITEM_NAMES[it], ih = ITEM_H[nm] || 0.2, w = nm === "crate" ? 0.56 : nm === "salmon" || nm === "herring" || nm === "smoked" ? 0.36 : 0.5;
    const cx = (j % cols - (cols - 1) / 2) * w, cz = (Math.floor(j / cols) - (rows - 1) / 2) * 0.36;
    return { x: base.x + cx, y: base.y + Math.min(layer, hmax * 3) * ih + this.groundY(base.x, base.z) * (base.y ? 0 : 1), z: base.z + cz };
  }
  drawPile(base, it, n, key, cols, rows) {
    const show = Math.max(0, n - this.pendOf(key));
    for (let i = 0; i < Math.min(show, 60); i++) {
      const p = this.pilePos(base, i, it, cols, rows);
      EU.set(0, Math.PI / 2 + ((i * 7) % 5 - 2) * 0.04, 0); Q.setFromEuler(EU); M4.compose(P.set(p.x, p.y, p.z), Q, S1); this.items[it].push(M4);
    }
  }
  // мировая точка следующего места в куче (куда прилетит предмет)
  pileTarget(e, kind, G, it, extra) {
    const s = G.e[e.i];
    let n = 0, base = this.pileSpot(e, kind), cols = 3, rows = 2;
    if (kind === "in") { const k = e.rec.in.indexOf(it); n = s.ib[k] || 0; base = this.inBase(e, k); }
    else if (kind === "out") n = s.ob;
    else if (kind === "shelf") { n = s.sh; cols = 4; }
    else if (kind === "dock") n = s.pile.length;
    const p = this.pilePos(base, Math.max(0, n - 1 + (extra || 0)), it, cols, rows);
    return new THREE.Vector3(p.x, p.y + 0.1, p.z);
  }
  inBase(e, k) { const b = this.pileSpot(e, "in"); const nIn = e.rec.in.length; if (nIn > 1) { const ax = Math.abs(e.zin.z - e.z) > Math.abs(e.zin.x - e.x); return ax ? { x: b.x + (k - 0.5) * 0.9, z: b.z, y: 0 } : { x: b.x, z: b.z + (k - 0.5) * 0.9, y: 0 }; } return b; }
  drawEnts(G, dt, ctx) {
    const L = this.L, t = this.t;
    let rn = 0;
    const me = G.pl[ctx.me] || G.pl[0], myTeam = me.team;
    const ring = (z, col, pulse, big) => {
      if (rn >= 120 || !z) return;
      const s = (z.r / 0.95) * (pulse ? 1 + Math.sin(t * 6) * 0.06 : 1) * (big || 1);
      M4.compose(P.set(z.x, this.groundY(z.x, z.z) + 0.04, z.z), Q.identity(), SV.set(s, 1, s)); this.rings.setMatrixAt(rn, M4); this.discs.setMatrixAt(rn, M4);
      this.rings.instanceColor.setXYZ(rn, col.r, col.g, col.b); this.discs.instanceColor.setXYZ(rn, col.r, col.g, col.b); rn++;
    };
    const WHITE = this._w || (this._w = new THREE.Color("#ffffff")), YEL = this._y || (this._y = new THREE.Color("#ffd34d")), GRN = this._g || (this._g = new THREE.Color("#7ed957")), BLUE = this._b || (this._b = new THREE.Color("#8fd8ff"));
    const usedPads = new Set();
    for (const e of L.E) {
      const s = G.e[e.i];
      // площадка
      if (padVisible(G, e.i)) {
        const p = this.padMesh(e.i); usedPads.add(e.i);
        const cost = padCost(G, e.i), lv = e.k === "upg" ? G.upg[e.team][e.def.u] + 1 : e.k === "supg" ? (G.e[e.tg].lv || 0) + 1 : 0;
        const key = cost + "|" + lv;
        if (p.key !== key) { this.drawPad(p, e, cost, lv ? tr("ур.") + lv : ""); p.key = key; p.pop = 0.001; }
        if (p.pop > 0) { p.pop += dt; if (p.pop > 0.5) p.pop = 0; }
        const sc = p.pop > 0 ? Math.min(1, p.pop / 0.3) * (1 + Math.sin(Math.min(1, p.pop / 0.5) * Math.PI) * 0.15) : 1;
        const mine = G.mode !== "vs" || e.team === myTeam;
        p.mesh.visible = true; p.mesh.position.set(e.zpad.x, this.groundY(e.zpad.x, e.zpad.z) + 0.05, e.zpad.z); p.mesh.scale.setScalar(sc);
        p.u.uProg.value = lerp(p.u.uProg.value, s.p / cost, Math.min(1, dt * 12)); p.u.uTime.value = t;
        p.u.uOk.value = mine && G.money[e.team] + s.p >= cost ? 1 : 0; p.u.uHot.value = ctx.hot === e.i ? 1 : 0; p.u.uGold.value = e.k === "goal" ? 1 : 0;
        p.mesh.material.opacity = mine ? 1 : 0.5;
      }
      if (!s.o) continue;
      const mine = G.mode !== "vs" || e.team === myTeam;
      const carry = me.st;
      if (e.k === "spot") {
        this.drawSchool(e, s.f, dt, G, ctx);
        if (mine) ring(e.zin, BLUE, carry.length < capOf(G, me.team), 1);
      } else if (e.k === "proc") {
        for (let k = 0; k < e.rec.in.length; k++) this.drawPile(this.inBase(e, k), e.rec.in[k], s.ib[k], "e" + e.i + "i" + k, 3, 2);
        this.drawPile(this.pileSpot(e, "out"), e.rec.out, s.ob, "e" + e.i + "o", 3, 2);
        if (mine) { ring(e.zin, WHITE, carry.some((it) => accepts(G, e.i, it))); ring(e.zout, YEL, s.ob > 0 && carry.length < capOf(G, me.team)); this.label("i" + e.i, e.zin, e.rec.in.map((i) => ITEMS[i].id), "in", tr("СЮДА")); this.label("o" + e.i, e.zout, [ITEMS[e.rec.out].id], "out", tr("ЗАБРАТЬ")); }
        // работа: подпрыгивает, дымит
        const w = this.world.ents[e.i];
        if (w && w.grp.children[0]) { const busy = s.tm > 0; w.grp.children[0].scale.y = busy ? 1 + Math.sin(t * 18) * 0.012 : 1; if (busy && e.def.model === "smokehouse" && Math.random() < dt * 6) this.burst(e.x + (e.w / 2 - 0.55) * 1, 3.0, e.z, "smoke", 1); if (busy && e.def.model === "cannery" && Math.random() < dt * 5) this.burst(e.x - e.w / 2 + 0.5, 3.2, e.z - 0.2, "smoke", 1); }
      } else if (e.k === "gen") {
        this.drawPile(this.pileSpot(e, "out"), e.item, s.ob, "e" + e.i + "o", 3, 2);
        if (mine) { ring(e.zout, YEL, s.ob > 0 && carry.length < capOf(G, me.team)); this.label("o" + e.i, e.zout, [ITEMS[e.item].id], "out", tr("ЗАБРАТЬ")); }
      } else if (e.k === "stall") {
        this.drawPile(this.pileSpot(e, "shelf"), e.item, s.sh, "e" + e.i + "s", 4, 2);
        this.drawCash(e, s.cash, G);
        if (mine) { ring(e.zin, WHITE, carry.includes(e.item)); if (s.cash > 0) ring(e.zcash, GRN, true, 0.85); this.label("i" + e.i, e.zin, [ITEMS[e.item].id], "in", tr("СЮДА")); }
      } else if (e.k === "dock") {
        const base = this.pileSpot(e, "dock");
        for (let i = 0; i < Math.min(s.pile.length - this.pendOf("e" + e.i + "d"), 40); i++) { const it = s.pile[i]; const p = this.pilePos(base, i, it, 3, 3); EU.set(0, Math.PI / 2, 0); Q.setFromEuler(EU); M4.compose(P.set(p.x, p.y, p.z), Q, S1); this.items[it].push(M4); }
        this.drawCash(e, s.cash, G);
        // груз на судне
        const sh = this.world.ents[e.i].grp.userData.ship;
        if (sh && sh.visible) { sh.updateMatrixWorld(); for (let i = 0; i < Math.min(s.load.length, 24); i++) { const it = s.load[i]; P.set(((i % 3) - 1) * 0.5, 0.66 + Math.floor(i / 9) * 0.3, -0.3 - (Math.floor(i / 3) % 3) * 0.45); P.applyMatrix4(sh.matrixWorld); EU.set(0, Math.PI / 2, 0); Q.setFromEuler(EU); M4.compose(P, Q, S1); this.items[it].push(M4); } }
        if (mine) { ring(e.zin, WHITE, carry.some((it) => accepts(G, e.i, it))); if (s.cash > 0) ring(e.zcash, GRN, true, 0.85); this.label("i" + e.i, e.zin, e.acc.map((i) => ITEMS[i].id), "in", tr("СЮДА")); }
      } else if (e.k === "board") {
        this.drawCash(e, s.cash, G);
        if (mine && G.con && !G.con.end) { ring(e.zin, WHITE, true, 1.15); this.bubble(e.x, 2.65 + Math.sin(t * 3) * 0.08, e.z, BUB["i_" + ITEMS[G.con.it].id], 1.1); this.label("i" + e.i, e.zin, [ITEMS[G.con.it].id], "in", tr("ЗАКАЗ")); }
        if (s.cash > 0) ring(e.zcash, GRN, true, 0.85);
      }
    }
    for (const [ei, p] of this.pads) if (!usedPads.has(ei)) p.mesh.visible = false;
    for (const [k, l] of this.labels) if (!this.usedLabels.has(k)) l.m.visible = false;
    this.usedLabels.clear();
    this.rings.count = rn; this.discs.count = rn; this.rings.instanceMatrix.needsUpdate = true; this.rings.instanceColor.needsUpdate = true; this.discs.instanceMatrix.needsUpdate = true; this.discs.instanceColor.needsUpdate = true;
  }
  // выручка: пачки стопками (сколько пачек — по сумме)
  cashBundles(G, amt) { const unit = Math.max(1, 3 * (G.mode === "vs" ? 2.5 : 1) * (amt > 400 ? Math.pow(amt / 400, 0.55) : 1)); return Math.min(48, Math.ceil(amt / unit)); }
  drawCash(e, cash, G) {
    if (!(cash > 0)) return;
    const n = this.cashBundles(G, cash), base = this.pileSpot(e, "cash");
    for (let i = 0; i < n; i++) { const col = i % 4, layer = Math.floor(i / 4); EU.set(0, (col % 2 ? 0.1 : -0.08) + Math.PI / 2, 0); Q.setFromEuler(EU); M4.compose(P.set(base.x + ((col % 2) - 0.5) * 0.27, this.groundY(base.x, base.z) + layer * 0.1, base.z + (Math.floor(col / 2) - 0.5) * 0.45), Q, S1); this.items[CASH].push(M4); }
  }
  // косяк: рыбы ходят кругами вокруг центра; рядом с ловцом подплывают к нему
  drawSchool(e, n, dt, G, ctx) {
    let sc = this.schools.get(e.i);
    if (!sc) { sc = { fish: [], jt: 0 }; for (let i = 0; i < 26; i++) sc.fish.push({ a: Math.random() * 6.28, r: 0.4 + Math.random() * 1.6, sp: 0.5 + Math.random() * 0.5, y: Math.random(), ph: Math.random() * 6 }); this.schools.set(e.i, sc); }
    const pool = this.fish[e.item === IT.salmon ? 1 : 0];
    // центр косяка тянется к ловцам в зоне
    let tx = e.school.x, tz = e.school.z, cnt = 0;
    const pull = (a) => { if (Math.hypot(a.x - e.zin.x, a.z - e.zin.z) < e.zin.r + 0.2) { tx += a.x; tz += a.z; cnt++; } };
    for (const p of G.pl) pull(p); for (const h of G.hp) pull(h);
    if (cnt) { tx = (tx + e.school.x * 0) / (cnt + 1); tz = tz / (cnt + 1); tx = (tx * (cnt + 1) - e.school.x) / cnt * 0.75 + e.school.x * 0.25; tz = (tz * (cnt + 1) - e.school.z) / cnt * 0.75 + e.school.z * 0.25; }
    sc.cx = lerp(sc.cx == null ? tx : sc.cx, tx, Math.min(1, dt * 1.2)); sc.cz = lerp(sc.cz == null ? tz : sc.cz, tz, Math.min(1, dt * 1.2));
    const show = Math.min(26, n);
    for (let i = 0; i < show; i++) {
      const f = sc.fish[i]; f.a += f.sp * dt * (i % 2 ? 1 : -1);
      const x = sc.cx + Math.cos(f.a) * f.r * 1.3, z = sc.cz + Math.sin(f.a) * f.r;
      const dir = f.a + (i % 2 ? Math.PI / 2 : -Math.PI / 2);
      EU.set(0, -dir, Math.sin(this.t * 8 + f.ph) * 0.15); Q.setFromEuler(EU); M4.compose(P.set(x, -0.02 + f.y * 0.03 + Math.sin(this.t * 3 + f.ph) * 0.02, z), Q, SV.setScalar(1.9)); pool.push(M4);
    }
    // иногда рыба выпрыгивает
    sc.jt -= dt;
    if (sc.jt <= 0 && show > 3) { sc.jt = 0.8 + Math.random() * 1.6; const a = Math.random() * 6.28, r = Math.random() * 1.5; const x = sc.cx + Math.cos(a) * r, z = sc.cz + Math.sin(a) * r; this.fly(e.item, { x, y: -0.1, z }, { x: x + 0.6, y: -0.1, z: z + 0.2 }, { dur: 0.6, h: 0.9, s: 0.8 }); this.burst(x, 0.02, z, "splash", 5); }
  }
}

export function fmt(v) {
  v = Math.floor(v);
  if (v < 1000) return String(v);
  if (v < 10000) return (v / 1000).toFixed(v % 1000 < 50 ? 0 : 1).replace(".0", "") + "K";
  if (v < 1e6) return Math.round(v / 1000) + "K";
  return (v / 1e6).toFixed(v < 1e7 ? 2 : 1).replace(/\.?0+$/, "") + "M";
}
export { itemPrice };
