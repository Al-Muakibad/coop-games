// «Хутор» — фигурки: один файл assets/kit.bin (см. assets/LICENSE.txt), все модели — цвета в вершинах, два кадра позы.
// Рисуются InstancedMesh: один вызов отрисовки на вид фигурки. Плоское освещение (нормали из производных).
import * as THREE from "three";

export const KIT = {};            // имя → {geo, ext:[w,h,d], frames}
let figMat = null, cloudMat = null;

export async function loadKit(url, onProgress) {
  const res = await fetch(url);
  const total = +res.headers.get("content-length") || 2300000;
  let buf;
  if (res.body && res.body.getReader && onProgress) {
    const rd = res.body.getReader(); const parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress(Math.min(1, got / total)); }
    buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
    buf = buf.buffer;
  } else buf = await res.arrayBuffer();
  const dv = new DataView(buf);
  const jl = dv.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl)));
  const base = 8 + jl + ((4 - (jl % 4)) % 4);
  for (const m of meta) {
    const g = new THREE.BufferGeometry();
    const deq = (off) => {
      const q = new Int16Array(buf, base + off, m.v * 3); const f = new Float32Array(m.v * 3);
      for (let i = 0; i < f.length; i += 3) for (let k = 0; k < 3; k++) f[i + k] = (q[i + k] + 32767) * m.sc[k] + m.mn[k];
      return f;
    };
    g.setAttribute("position", new THREE.BufferAttribute(deq(m.p), 3));
    g.setAttribute("position2", new THREE.BufferAttribute(m.p2 != null ? deq(m.p2) : g.attributes.position.array, 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(buf, base + m.c, m.v * 4), 4, true));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, base + m.ix, m.ni), 1));
    g.computeBoundingSphere();
    KIT[m.n] = { geo: g, ext: m.e, frames: m.p2 != null ? 2 : 1 };
  }
  return KIT;
}

// материал фигурок: смешивание двух кадров, перекраска «одежды» (альфа цвета = 1) в цвет семьи, вспышка, прозрачность призраков
export function figureMaterial(cloud) {
  if (!cloud && figMat) return figMat;
  if (cloud && cloudMat) return cloudMat;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (cloud) { m.emissive = new THREE.Color(0.55, 0.55, 0.58); m.transparent = true; m.opacity = 0.92; }
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec3 position2; attribute vec4 aAnim; attribute vec3 aTeam;
varying vec3 vFlash;`)
      .replace("#include <begin_vertex>", `vec3 transformed = mix(position, position2, aAnim.x);`)
      .replace("#include <color_vertex>", `
vec3 cs = pow(color.rgb, vec3(2.2));
if (color.a > 0.5 && aAnim.y > 0.5) { float l = dot(cs, vec3(0.3, 0.55, 0.15)); cs = aTeam * (0.55 + l * 1.6); }
else if (aAnim.y < -0.5) cs = cs * aTeam;
vColor = vec4(cs, 1.0);
vFlash = vec3(aAnim.z, aAnim.w, 0.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vFlash;`)
      .replace("#include <opaque_fragment>", `
outgoingLight = mix(outgoingLight, vec3(1.0, 0.35, 0.25), clamp(vFlash.x, 0.0, 1.0) * 0.7);
outgoingLight += vec3(0.25, 0.75, 0.9) * vFlash.y;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => (cloud ? "figc" : "fig1");
  if (cloud) { m.onBeforeCompile2 = m.onBeforeCompile; m.onBeforeCompile = (sh) => { m.onBeforeCompile2(sh); sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;"); }; cloudMat = m; }
  else figMat = m;
  return m;
}

// Пул одного вида фигурок
export class FigPool {
  constructor(scene, name, cap, opt) {
    opt = opt || {};
    const k = KIT[name];
    this.name = name; this.cap = cap; this.n = 0; this.k = k;
    const g = k.geo.clone();
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.anim.setUsage(THREE.DynamicDrawUsage);
    this.team = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); this.team.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aAnim", this.anim); g.setAttribute("aTeam", this.team);
    this.mesh = new THREE.InstancedMesh(g, opt.material || figureMaterial(), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = opt.shadow !== false; this.mesh.receiveShadow = !!opt.receive;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  // m — Matrix4; a — [кадр, перекраска(1 семья, -1 умножение), вспышка, свечение]; t — цвет
  push(m, a0, a1, a2, a3, col) {
    if (this.n >= this.cap) this.grow();
    const i = this.n++;
    this.mesh.setMatrixAt(i, m);
    this.anim.array[i * 4] = a0; this.anim.array[i * 4 + 1] = a1; this.anim.array[i * 4 + 2] = a2; this.anim.array[i * 4 + 3] = a3;
    if (col) { this.team.array[i * 3] = col.r; this.team.array[i * 3 + 1] = col.g; this.team.array[i * 3 + 2] = col.b; }
    return i;
  }
  grow() {
    const cap = this.cap * 2, old = this.mesh;
    const g = old.geometry;
    const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.array.set(this.anim.array); a.setUsage(THREE.DynamicDrawUsage);
    const t = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); t.array.set(this.team.array); t.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aAnim", a); g.setAttribute("aTeam", t); this.anim = a; this.team = t;
    const m = new THREE.InstancedMesh(g, old.material, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = old.castShadow; m.receiveShadow = old.receiveShadow; m.frustumCulled = false;
    for (let i = 0; i < this.n; i++) { const mm = new THREE.Matrix4(); old.getMatrixAt(i, mm); m.setMatrixAt(i, mm); }
    old.parent.add(m); old.parent.remove(old); old.dispose();
    this.mesh = m; this.cap = cap;
  }
  end() {
    this.mesh.count = this.n;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; this.anim.needsUpdate = true; this.team.needsUpdate = true; }
  }
}
