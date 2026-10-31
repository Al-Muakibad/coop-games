// Эффекты: частицы (искры, дым, осколки), ударные волны, летающие цифры урона
import * as THREE from "three";

function dotTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.85)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}
const TEX = dotTexture();

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3); this.s = new Float32Array(max); this.a = new Float32Array(max);
    this.life = new Float32Array(max); this.ml = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.g = new Float32Array(max); this.drag = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.ap = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.ac = new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage);
    this.as = new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage);
    this.aa = new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.ap); geo.setAttribute("color", this.ac); geo.setAttribute("size", this.as); geo.setAttribute("alpha", this.aa);
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TEX }, scale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.pts = new THREE.Points(geo, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 5 : 4;
    scene.add(this.pts);
  }
  add(x, y, z, vx, vy, vz, life, s0, s1, col, grav, drag) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c[i3] = col.r; this.c[i3 + 1] = col.g; this.c[i3 + 2] = col.b;
    this.life[i] = this.ml[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.g[i] = grav || 0; this.drag[i] = drag || 0; this.s[i] = s0; this.a[i] = 1;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.copy(--this.n, i); i--; continue; }
      const i3 = i * 3, k = 1 - this.life[i] / this.ml[i], d = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i3 + 1] -= this.g[i] * dt; this.v[i3] *= d; this.v[i3 + 1] *= d; this.v[i3 + 2] *= d;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.p[i3 + 1] < 0.03 && this.g[i] > 0) { this.p[i3 + 1] = 0.03; this.v[i3 + 1] *= -0.35; this.v[i3] *= 0.6; this.v[i3 + 2] *= 0.6; }
      this.s[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.a[i] = k < 0.15 ? 1 : 1 - (k - 0.15) / 0.85;
    }
    this.pts.geometry.setDrawRange(0, this.n);
    this.ap.needsUpdate = this.ac.needsUpdate = this.as.needsUpdate = this.aa.needsUpdate = true;
  }
  copy(from, to) {
    if (from === to) return;
    for (let k = 0; k < 3; k++) { this.p[to * 3 + k] = this.p[from * 3 + k]; this.v[to * 3 + k] = this.v[from * 3 + k]; this.c[to * 3 + k] = this.c[from * 3 + k]; }
    this.life[to] = this.life[from]; this.ml[to] = this.ml[from]; this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from]; this.g[to] = this.g[from]; this.drag[to] = this.drag[from]; this.s[to] = this.s[from]; this.a[to] = this.a[from];
  }
}

const C = (h) => new THREE.Color(h);
const COL = { spark: C(0xffe9a8), fire: C(0xff8a2a), fire2: C(0xffd25a), smoke: C(0x6b6b6b), dust: C(0xb8a07a), bone: C(0xece3cf), wood: C(0x9b6a3c), stone: C(0x9aa0a6), gold: C(0xffd34d), green: C(0x7dff8a), blue: C(0x7cc9ff), ice: C(0xbff3ff), acid: C(0x9cff3a), red: C(0xff4a4a), white: C(0xffffff), purple: C(0xc77dff) };
export { COL };

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = new Particles(scene, 1400, true);
    this.norm = new Particles(scene, 900, false);
    this.rings = [];
    const rg = new THREE.RingGeometry(0.82, 1, 48); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.visible = false; m.renderOrder = 6; scene.add(m); this.rings.push({ m, t: 0, d: 1, r0: 0, r1: 1 });
    }
    this.texts = []; this.shake = 0; this.quality = 1;
  }
  n(k) { return Math.max(1, Math.round(k * this.quality)); }
  ring(x, z, r0, r1, dur, color, y) {
    const r = this.rings.find((q) => !q.m.visible) || this.rings[0];
    r.m.visible = true; r.t = 0; r.d = dur; r.r0 = r0; r.r1 = r1; r.m.material.color.set(color); r.m.position.set(x, y || 0.06, z);
  }
  muzzle(x, y, z, dx, dz, col) {
    for (let i = 0; i < this.n(5); i++) { const s = 3 + Math.random() * 5, a = (Math.random() - 0.5) * 0.9; const cx = dx * Math.cos(a) - dz * Math.sin(a), cz = dx * Math.sin(a) + dz * Math.cos(a);
      this.add.add(x, y, z, cx * s, Math.random() * 1.5, cz * s, 0.12 + Math.random() * 0.1, 0.22, 0.02, col || COL.spark, 0, 4); }
    this.add.add(x, y, z, 0, 0, 0, 0.08, 0.9, 0.3, col || COL.spark);
  }
  hit(x, y, z, col, big) {
    const k = big ? 14 : 7;
    for (let i = 0; i < this.n(k); i++) { const a = Math.random() * 6.28, s = 2 + Math.random() * (big ? 6 : 4);
      this.add.add(x, y, z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, 0.2 + Math.random() * 0.2, 0.18, 0.02, col || COL.spark, 9, 2); }
    this.add.add(x, y, z, 0, 0, 0, 0.1, big ? 1.4 : 0.7, 0.2, col || COL.white);
  }
  death(x, z, col) {
    for (let i = 0; i < this.n(14); i++) { const a = Math.random() * 6.28, s = 1.5 + Math.random() * 3.5;
      this.norm.add(x, 0.6 + Math.random() * 0.6, z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, 0.7 + Math.random() * 0.5, 0.16, 0.12, col || COL.bone, 14, 0.5); }
    this.puff(x, z, 8, COL.dust);
    for (let i = 0; i < this.n(6); i++) this.add.add(x + (Math.random() - 0.5), 0.5 + Math.random(), z + (Math.random() - 0.5), 0, 1.5 + Math.random(), 0, 0.6, 0.25, 0.05, COL.purple, 0, 1);
  }
  puff(x, z, k, col, size) {
    for (let i = 0; i < this.n(k); i++) { const a = Math.random() * 6.28, s = 0.6 + Math.random() * 1.6;
      this.norm.add(x + Math.cos(a) * 0.3, 0.15, z + Math.sin(a) * 0.3, Math.cos(a) * s, 0.3 + Math.random() * 0.8, Math.sin(a) * s, 0.6 + Math.random() * 0.5, (size || 0.5), (size || 0.5) * 2.4, col || COL.dust, 0, 2.2); }
  }
  explosion(x, z, r) {
    for (let i = 0; i < this.n(26); i++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 6 * r / 2;
      this.add.add(x, 0.4, z, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s, 0.35 + Math.random() * 0.35, 0.5, 0.05, Math.random() < 0.5 ? COL.fire : COL.fire2, 6, 2.5); }
    for (let i = 0; i < this.n(10); i++) { const a = Math.random() * 6.28, s = Math.random() * 2;
      this.norm.add(x + Math.cos(a) * 0.5, 0.5, z + Math.sin(a) * 0.5, Math.cos(a) * s, 1 + Math.random() * 1.5, Math.sin(a) * s, 0.9 + Math.random() * 0.6, 0.9, 2.4, COL.smoke, -0.5, 1.2); }
    this.add.add(x, 0.8, z, 0, 0, 0, 0.18, r * 2.6, r * 3.4, COL.fire2);
    this.ring(x, z, 0.3, r * 1.15, 0.45, 0xffa040);
    this.shake = Math.min(1.2, this.shake + 0.45);
  }
  chips(x, y, z, col) {
    for (let i = 0; i < this.n(6); i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 2.5;
      this.norm.add(x, y, z, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 0.5 + Math.random() * 0.4, 0.13, 0.1, col, 14, 0.4); }
  }
  sparkle(x, y, z, col, k) {
    for (let i = 0; i < this.n(k || 6); i++) { const a = Math.random() * 6.28, s = 0.5 + Math.random() * 1.5;
      this.add.add(x, y, z, Math.cos(a) * s, 1 + Math.random() * 2, Math.sin(a) * s, 0.4 + Math.random() * 0.3, 0.2, 0.02, col || COL.gold, 2, 1.5); }
  }
  trail(x, y, z, col, size) { this.add.add(x, y, z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.22, size || 0.3, 0.02, col); }
  heal(x, z) { for (let i = 0; i < this.n(14); i++) { const a = Math.random() * 6.28; this.add.add(x + Math.cos(a) * 0.6, 0.2 + Math.random(), z + Math.sin(a) * 0.6, 0, 1.5 + Math.random() * 1.5, 0, 0.8, 0.3, 0.05, COL.green, 0, 0.5); } }
  levelup(x, z) {
    for (let i = 0; i < this.n(30); i++) { const a = Math.random() * 6.28, r = 0.4 + Math.random() * 0.5; this.add.add(x + Math.cos(a) * r, Math.random() * 0.4, z + Math.sin(a) * r, Math.cos(a) * 0.4, 2.5 + Math.random() * 3, Math.sin(a) * 0.4, 0.9 + Math.random() * 0.4, 0.3, 0.04, Math.random() < 0.5 ? COL.gold : COL.white, 0, 0.6); }
    this.ring(x, z, 0.2, 2.6, 0.6, 0xffd34d);
  }
  text(x, y, z, str, color, size, life) { if (this.texts.length > 60) this.texts.shift(); this.texts.push({ x, y, z, str, color: color || "#fff", size: size || 18, t: 0, life: life || 0.9, dx: (Math.random() - 0.5) * 18 }); }
  update(dt) {
    this.add.update(dt); this.norm.update(dt);
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt; const k = r.t / r.d;
      if (k >= 1) { r.m.visible = false; continue; }
      const s = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2)); r.m.scale.set(s, 1, s); r.m.material.opacity = (1 - k) * 0.9;
    }
    this.texts = this.texts.filter((t) => (t.t += dt) < t.life);
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
}
