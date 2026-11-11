// «Хутор» — частицы (дым, искры, пыль, листья, снег, светлячки, салют) и всплывающие подписи/летящие значки (DOM).
import * as THREE from "three";

class Particles {
  constructor(scene, cap, additive) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.c = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.size = new Float32Array(cap); this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.a0 = new Float32Array(cap); this.grow = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.ap = new THREE.BufferAttribute(new Float32Array(cap * 3), 3); this.ac = new THREE.BufferAttribute(new Float32Array(cap * 4), 4); this.as = new THREE.BufferAttribute(new Float32Array(cap), 1);
    [this.ap, this.ac, this.as].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("position", this.ap); g.setAttribute("aCol", this.ac); g.setAttribute("aSize", this.as);
    this.u = { uScale: { value: 400 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d) * 4.0; if (r > 1.0) discard; float a = vC.a * (1.0 - r) * (1.0 - r); gl_FragColor = vec4(vC.rgb, a); }`,
    });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 9 : 8;
    scene.add(this.pts);
  }
  add(x, y, z, vx, vy, vz, life, size, grav, col, drag, alpha, grow) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.max[i] = life; this.size[i] = size; this.grav[i] = grav || 0; this.drag[i] = drag || 0; this.a0[i] = alpha == null ? 1 : alpha; this.grow[i] = grow || 0;
    this.c[i * 3] = col.r; this.c[i * 3 + 1] = col.g; this.c[i * 3 + 2] = col.b;
  }
  update(dt) {
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) continue;
      if (j !== i) {
        for (let k = 0; k < 3; k++) { this.p[j * 3 + k] = this.p[i * 3 + k]; this.v[j * 3 + k] = this.v[i * 3 + k]; this.c[j * 3 + k] = this.c[i * 3 + k]; }
        this.life[j] = this.life[i]; this.max[j] = this.max[i]; this.size[j] = this.size[i]; this.grav[j] = this.grav[i]; this.drag[j] = this.drag[i]; this.a0[j] = this.a0[i]; this.grow[j] = this.grow[i];
      }
      const dr = Math.max(0, 1 - this.drag[j] * dt);
      this.v[j * 3] *= dr; this.v[j * 3 + 2] *= dr; this.v[j * 3 + 1] = this.v[j * 3 + 1] * dr - this.grav[j] * dt;
      this.p[j * 3] += this.v[j * 3] * dt; this.p[j * 3 + 1] += this.v[j * 3 + 1] * dt; this.p[j * 3 + 2] += this.v[j * 3 + 2] * dt;
      const t = this.life[j] / this.max[j];
      this.ap.array[j * 3] = this.p[j * 3]; this.ap.array[j * 3 + 1] = this.p[j * 3 + 1]; this.ap.array[j * 3 + 2] = this.p[j * 3 + 2];
      this.ac.array[j * 4] = this.c[j * 3]; this.ac.array[j * 4 + 1] = this.c[j * 3 + 1]; this.ac.array[j * 4 + 2] = this.c[j * 3 + 2];
      this.ac.array[j * 4 + 3] = this.a0[j] * (t < 0.15 ? t / 0.15 : 1 - Math.pow((t - 0.15) / 0.85, 1.5));
      this.as.array[j] = this.size[j] * (1 + this.grow[j] * t);
      j++;
    }
    this.n = j;
    this.pts.geometry.setDrawRange(0, j);
    this.ap.needsUpdate = true; this.ac.needsUpdate = true; this.as.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, layer, project) {
    this.norm = new Particles(scene, 1400, false);
    this.add = new Particles(scene, 1400, true);
    this.layer = layer; this.project = project;
    this.floaters = []; this.flyers = [];
    this.q = 1;
    this.C = (h) => new THREE.Color(h);
    this.col = { dust: this.C("#d8c8a8"), smoke: this.C("#c8c4c0"), fire: this.C("#ffa040"), ember: this.C("#ff7a20"), gold: this.C("#ffd34d"), wood: this.C("#a8763f"),
      stone: this.C("#a0a4ac"), leaf: this.C("#e0a040"), snow: this.C("#f4f8ff"), fly: this.C("#d8ff70"), white: this.C("#ffffff"), red: this.C("#ff4a3a"), blue: this.C("#7ee0ee"), green: this.C("#8adc5a"), pink: this.C("#ff9ad0") };
    this.amb = 0;
  }
  setScale(px) { this.norm.u.uScale.value = px; this.add.u.uScale.value = px; }
  r() { return Math.random(); }
  puff(x, y, z, n, col, sp) { col = col || this.col.dust; sp = sp || 0.8; for (let i = 0; i < n * this.q; i++) { const a = this.r() * 6.28; this.norm.add(x, y, z, Math.cos(a) * sp * (0.4 + this.r()), 0.2 + this.r() * 0.5, Math.sin(a) * sp * (0.4 + this.r()), 0.5 + this.r() * 0.4, 0.12 + this.r() * 0.1, 0.3, col, 3, 0.7, 1.5); } }
  burst(x, y, z, n, col, sp, size) { for (let i = 0; i < n * this.q; i++) { const a = this.r() * 6.28, e = this.r() * 1.2; this.add.add(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 0.6, Math.sin(a) * Math.cos(e) * sp, 0.5 + this.r() * 0.5, size || 0.07, 2.2, col, 1.5, 1, -0.5); } }
  chips(x, y, z, col, n) { for (let i = 0; i < (n || 8) * this.q; i++) { const a = this.r() * 6.28; this.norm.add(x, y, z, Math.cos(a) * 1.2, 1.2 + this.r() * 1.4, Math.sin(a) * 1.2, 0.6 + this.r() * 0.3, 0.06, 6, col, 0.5, 1); } }
  smoke(x, y, z, k) { this.norm.add(x + (this.r() - 0.5) * 0.1, y, z + (this.r() - 0.5) * 0.1, 0.12 + this.r() * 0.1, 0.45 + this.r() * 0.25, -0.05, 2.2 + this.r(), 0.16 * (k || 1), -0.02, this.col.smoke, 0.2, 0.45, 2.2); }
  embers(x, y, z) { this.add.add(x + (this.r() - 0.5) * 0.18, y, z + (this.r() - 0.5) * 0.18, (this.r() - 0.5) * 0.3, 0.8 + this.r() * 0.7, (this.r() - 0.5) * 0.3, 0.5 + this.r() * 0.6, 0.05, -0.2, this.r() < 0.5 ? this.col.fire : this.col.ember, 0.5, 1); }
  flame(x, y, z) { this.add.add(x + (this.r() - 0.5) * 0.12, y, z + (this.r() - 0.5) * 0.12, 0, 0.55 + this.r() * 0.3, 0, 0.35 + this.r() * 0.2, 0.2, -0.3, this.col.fire, 1, 0.75, -0.6); }
  ring(x, z, col) { for (let i = 0; i < 18 * this.q; i++) { const a = i / 18 * 6.28; this.add.add(x, 0.08, z, Math.cos(a) * 1.6, 0.1, Math.sin(a) * 1.6, 0.45, 0.07, 0, col, 2.5, 1); } }
  firework(x, y, z) { const cols = [this.col.gold, this.col.pink, this.col.blue, this.col.green, this.col.fire]; const c = cols[(this.r() * cols.length) | 0]; for (let i = 0; i < 60 * this.q; i++) { const a = this.r() * 6.28, e = (this.r() - 0.5) * 3.14; this.add.add(x, y, z, Math.cos(a) * Math.cos(e) * 2.6, Math.sin(e) * 2.6, Math.sin(a) * Math.cos(e) * 2.6, 1.1 + this.r() * 0.5, 0.09, 1.2, c, 1.2, 1); } }
  // погода и ночные светлячки вокруг точки камеры
  ambient(dt, tx, tz, season, night, rain) {
    this.amb += dt;
    const W = 12, D = 10;
    if (season === 3 && this.r() < dt * 40 * this.q) this.norm.add(tx + (this.r() - 0.5) * W * 2, 5 + this.r() * 2, tz + (this.r() - 0.5) * D * 2, 0.25, -0.7, 0, 7, 0.07, 0, this.col.snow, 0, 0.9);
    if (season === 2 && this.r() < dt * 6 * this.q) this.norm.add(tx + (this.r() - 0.5) * W * 2, 4 + this.r() * 2, tz + (this.r() - 0.5) * D * 2, 0.5 + this.r() * 0.3, -0.5, 0.1, 8, 0.08, 0, this.r() < 0.5 ? this.col.leaf : this.col.ember, 0, 0.9);
    if (rain && this.r() < dt * 90 * this.q) this.norm.add(tx + (this.r() - 0.5) * W * 2, 5, tz + (this.r() - 0.5) * D * 2, 0.4, -9, 0, 0.6, 0.035, 0, this.col.blue, 0, 0.55);
    if (night > 0.4 && this.r() < dt * 10 * night * this.q) this.add.add(tx + (this.r() - 0.5) * W * 2, 0.2 + this.r() * 0.6, tz + (this.r() - 0.5) * D * 2, (this.r() - 0.5) * 0.3, 0.05, (this.r() - 0.5) * 0.3, 3 + this.r() * 3, 0.07, -0.01, this.col.fly, 0.1, night * 0.9);
  }
  // DOM: всплывающая подпись в мире
  text(X, Y, Z, txt, cls, life) {
    const el = document.createElement("div"); el.className = "fl " + (cls || ""); el.textContent = txt;
    this.layer.appendChild(el);
    this.floaters.push({ el, X, Y, Z, t: 0, life: life || 1.2 });
    if (this.floaters.length > 30) { const f = this.floaters.shift(); f.el.remove(); }
  }
  // DOM: летящий значок (еда к жителю и т. п.)
  fly(url, a, b, delay, dur, size, onEnd) {
    const el = document.createElement("img"); el.className = "fly"; el.src = url; el.style.width = el.style.height = (size || 34) + "px";
    el.style.opacity = "0"; this.layer.appendChild(el);
    this.flyers.push({ el, a, b, t: -(delay || 0), dur: dur || 0.6, onEnd });
  }
  update(dt) {
    this.norm.update(dt); this.add.update(dt);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.t += dt;
      if (f.t >= f.life) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      const s = this.project(f.X, f.Y + f.t * 0.5, f.Z);
      const k = f.t / f.life;
      f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${k < 0.15 ? 0.6 + k / 0.15 * 0.4 : 1})`;
      f.el.style.opacity = k > 0.7 ? (1 - (k - 0.7) / 0.3).toFixed(2) : "1";
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]; f.t += dt;
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.dur), e = k * k * (3 - 2 * k);
      const X = f.a[0] + (f.b[0] - f.a[0]) * e, Y = f.a[1] + (f.b[1] - f.a[1]) * e + Math.sin(k * Math.PI) * 1.2, Z = f.a[2] + (f.b[2] - f.a[2]) * e;
      const s = this.project(X, Y, Z);
      f.el.style.opacity = k > 0.85 ? ((1 - k) / 0.15).toFixed(2) : "1";
      f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${0.8 + Math.sin(k * Math.PI) * 0.4})`;
      if (k >= 1) { f.el.remove(); this.flyers.splice(i, 1); f.onEnd && f.onEnd(); }
    }
  }
  clear() { this.floaters.forEach((f) => f.el.remove()); this.flyers.forEach((f) => f.el.remove()); this.floaters = []; this.flyers = []; }
}
