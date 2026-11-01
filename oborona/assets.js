// Загрузка и подготовка 3D-моделей и текстур (KayKit, Quaternius, Poly Haven — всё CC0)
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const V = "?v=4";
// ядро (до меню): герои, анимации, постройки, оружие, природа, реквизит. Монстры и торговец — по требованию локации
const CORE_KK = ["knight", "barbarian", "rogue", "mage"];
const CORE = [...CORE_KK, "anims", "world", "weapons", "nature", "props"];
const LAZY_KK = ["merchant", "sk_minion", "sk_warrior", "sk_rogue", "sk_mage"];
const QM = ["m_spider", "m_rat", "m_frog", "m_slime", "m_bat", "m_wasp", "m_dragon"];
const UPPER = /^(chest|upperarm|lowerarm|wrist|hand|handslot|head)/;
export const A = { chars: {}, clips: {}, world: {}, weapons: {}, nature: {}, props: {}, q: {}, qclips: {}, qh: {}, ready: false, wind: { value: 0 } };
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const GLB_BYTES = 3490632; // размер ядра (для полосы загрузки); обновить при замене .glb
const loadGLB = (n, onp) => new Promise((res, rej) => loader.load(`assets/${n}.glb${V}`, res, onp, rej));
const loaded = new Set(), pending = {};

// грузит список файлов с общей полосой: onProgress(доля 0..1, загружено байт, всего байт)
async function fetchSet(files, estBytes, onProgress) {
  const got = {}, tot = {}; let done = 0;
  const report = () => {
    let g = 0, t = 0, known = 0;
    for (const n of files) { g += got[n] || 0; if (tot[n]) { t += tot[n]; known++; } }
    const est = Math.max(estBytes, known === files.length ? t : 0);
    onProgress && onProgress(Math.max(est ? Math.min(1, g / est) : 0, done / files.length * 0.98), g, est);
  };
  const res = await Promise.all(files.map((n) => loadGLB(n, (e) => { got[n] = e.loaded; if (e.total) tot[n] = e.total; report(); })
    .then((g) => { done++; if (tot[n]) got[n] = tot[n]; report(); return g; })));
  return (n) => res[files.indexOf(n)];
}
function prepChar(c, root) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; if (o.material) { o.material.metalness = 0; o.material.roughness = 0.7; } } });
  ["handslotl", "handslotr"].forEach((b) => { const bone = root.getObjectByName(b); if (bone) [...bone.children].forEach((ch) => { if (!ch.isBone) bone.remove(ch); }); });
  if (c.startsWith("sk_")) mergeSkinned(root);
  A.chars[c] = root;
}
function prepQ(q, g) {
  const root = g.scene;
  root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.roughness = 0.55; o.material.metalness = 0.05; } } });
  A.q[q] = root; A.qclips[q] = {}; g.animations.forEach((c) => (A.qclips[q][c.name] = c));
  // высота модели в позе движения — чтобы масштабировать по нужному росту
  const tmp = SkeletonUtils.clone(root), mx = new THREE.AnimationMixer(tmp), clips = g.animations;
  const mv = clips.find((c) => /Walk|Fly|Run|Idle/.test(c.name)) || clips[0]; if (mv) { mx.clipAction(mv).play(); mx.update(0.1); }
  tmp.updateMatrixWorld(true); tmp.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
  const b = new THREE.Box3().setFromObject(tmp, true); A.qh[q] = { h: Math.max(0.01, b.max.y - b.min.y), y0: b.min.y, w: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) };
}
// догрузка моделей (монстры, торговец): ensure(["m_spider", "sk_minion", …], onProgress)
export async function ensure(names, onProgress) {
  const need = [...new Set(names)].filter((n) => !loaded.has(n) && (LAZY_KK.includes(n) || QM.includes(n) || CORE_KK.includes(n)));
  const wait = need.filter((n) => pending[n]), fresh = need.filter((n) => !pending[n]);
  if (fresh.length) {
    const job = fetchSet(fresh, fresh.length * 140000, onProgress).then((get) => {
      for (const n of fresh) { if (QM.includes(n)) prepQ(n, get(n)); else prepChar(n, get(n).scene); loaded.add(n); delete pending[n]; }
    });
    fresh.forEach((n) => (pending[n] = job));
  } else onProgress && onProgress(1, 0, 0);
  await Promise.all([...new Set([...fresh, ...wait].map((n) => pending[n]).filter(Boolean))]);
}
export const has = (n) => loaded.has(n);

export async function loadAll(onProgress) {
  const get = await fetchSet(CORE, GLB_BYTES, onProgress);
  for (const c of get("anims").animations) A.clips[c.name] = c;
  const mask = (clip, upper) => { const c = clip.clone(); c.tracks = c.tracks.filter((t) => UPPER.test(t.name) === upper); c.name = clip.name + (upper ? "_U" : "_L"); return c; };
  A.clips.Run_L = mask(A.clips.Running_A, false);
  A.clips.Idle_L = mask(A.clips.Idle, false);
  A.clips.Aim_U = mask(A.clips["1H_Ranged_Aiming"], true);
  A.clips.Aim2_U = mask(A.clips["2H_Ranged_Aiming"], true);
  A.clips.Cast_U = mask(A.clips.Spellcasting || A.clips.Spellcast_Shoot, true);
  A.clips.Chop_U = mask(A.clips["1H_Melee_Attack_Chop"], true);
  A.clips.Shoot_U = mask(A.clips["1H_Ranged_Shoot"], true);
  A.clips.Shoot2_U = mask(A.clips["2H_Ranged_Shoot"], true);
  A.clips.CastShot_U = mask(A.clips.Spellcast_Shoot, true);
  A.clips.Idle_U = mask(A.clips.Idle, true);
  for (const c of CORE_KK) { prepChar(c, get(c).scene); loaded.add(c); }
  const byName = (sc, dst, fix) => { for (const ch of [...sc.children]) { ch.traverse((o) => { if (o.isMesh) fix && fix(o); }); dst[ch.name] = ch; } };
  byName(get("world").scene, A.world, (o) => { o.material.metalness = 0; o.material.roughness = 0.85; });
  byName(get("weapons").scene, A.weapons, (o) => { o.material.metalness = 0.1; o.material.roughness = 0.6; });
  byName(get("props").scene, A.props, (o) => { o.material.envMapIntensity = 0.8; });
  byName(get("nature").scene, A.nature, (o) => {
    const m = o.material; m.envMapIntensity = 0.6;
    if (/Leaves|Grass|Flowers|Leaf/i.test(m.name) && !m.userData.wind) { m.userData.wind = 1; m.side = THREE.DoubleSide; m.alphaTest = Math.max(m.alphaTest || 0, 0.4); m.transparent = false; windify(m); }
  });
  A.ready = true;
  return A;
}
// лёгкое покачивание листвы и травы
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
function toFloat(attr) {
  const n = attr.count, s = attr.itemSize, arr = new Float32Array(n * s);
  for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) arr[i * s + j] = [attr.getX, attr.getY, attr.getZ, attr.getW][j].call(attr, i);
  return new THREE.BufferAttribute(arr, s);
}
function mergeSkinned(root) {
  const list = []; root.traverse((o) => { if (o.isSkinnedMesh) list.push(o); });
  if (list.length < 2) return;
  const b = list[0], eq = (m1, m2) => m1.elements.every((v, i) => Math.abs(v - m2.elements[i]) < 1e-4);
  if (!list.every((m) => m.skeleton.bones.length === b.skeleton.bones.length && eq(m.bindMatrix, b.bindMatrix) && eq(m.matrix, b.matrix))) return;
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), acc = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const geos = list.map((m) => {
    const g = new THREE.BufferGeometry(), cnt = m.geometry.attributes.position.count;
    for (const [a, s] of [["position", 3], ["normal", 3], ["uv", 2], ["skinIndex", 4], ["skinWeight", 4]]) { const at = m.geometry.getAttribute(a); g.setAttribute(a, at ? toFloat(at) : new THREE.BufferAttribute(new Float32Array(cnt * s).map((_, i) => (a === "normal" && i % 3 === 1) || (a === "skinWeight" && i % 4 === 0) ? 1 : 0), s)); }
    g.setIndex(m.geometry.index ? Array.from(m.geometry.index.array) : null);
    const Dm = m.skeleton.boneInverses.map((ib, i) => new THREE.Matrix4().copy(b.skeleton.boneInverses[i]).invert().multiply(ib));
    if (!Dm.every((x) => eq(x, new THREE.Matrix4()))) {
      const P = g.attributes.position, N = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
      for (let i = 0; i < P.count; i++) {
        acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        for (let k = 0; k < 4; k++) { const w = [SW.getX, SW.getY, SW.getZ, SW.getW][k].call(SW, i); if (!w) continue; const j = [SI.getX, SI.getY, SI.getZ, SI.getW][k].call(SI, i); for (let e = 0; e < 16; e++) acc.elements[e] += Dm[j].elements[e] * w; }
        v.fromBufferAttribute(P, i).applyMatrix4(acc); P.setXYZ(i, v.x, v.y, v.z);
        nm.getNormalMatrix(acc); nv.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); N.setXYZ(i, nv.x, nv.y, nv.z);
      }
    }
    return g;
  });
  const merged = mergeGeometries(geos, false); if (!merged) return;
  const mesh = new THREE.SkinnedMesh(merged, b.material);
  mesh.name = "body"; mesh.frustumCulled = false;
  mesh.position.copy(b.position); mesh.quaternion.copy(b.quaternion); mesh.scale.copy(b.scale);
  b.parent.add(mesh); mesh.bind(b.skeleton, b.bindMatrix);
  list.forEach((m) => m.parent.remove(m));
}

// Персонаж KayKit: клон + микшер с общими анимациями
export function makeChar(kind) {
  const obj = SkeletonUtils.clone(A.chars[kind]);
  const mixer = new THREE.AnimationMixer(obj), actions = {};
  const act = (name) => { if (!actions[name]) { const c = A.clips[name]; if (!c) return null; actions[name] = mixer.clipAction(c); } return actions[name]; };
  const meshes = []; obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return { obj, mixer, act, meshes, bone: (n) => obj.getObjectByName(n) };
}
// Монстр Quaternius: клон + свои анимации, масштаб по росту
export function makeQ(name, height) {
  const inner = SkeletonUtils.clone(A.q[name]);
  const obj = new THREE.Group(); obj.add(inner);
  const info = A.qh[name], k = height / info.h; inner.scale.multiplyScalar(k); inner.position.y = -info.y0 * k;
  const mixer = new THREE.AnimationMixer(inner), actions = {};
  const act = (n) => { if (!actions[n]) { const c = A.qclips[name][n]; if (!c) return null; actions[n] = mixer.clipAction(c); } return actions[n]; };
  const meshes = []; inner.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return { obj, mixer, act, meshes, bone: (n) => inner.getObjectByName(n) };
}
const wrap = (o) => { const g = new THREE.Group(); if (o) g.add(o.clone()); return g; };
export const cloneWorld = (n) => wrap(A.world[n]);
export const cloneWeapon = (n) => wrap(A.weapons[n] || A.props[n]);
export const cloneNature = (n) => wrap(A.nature[n]);
export const cloneProp = (n) => wrap(A.props[n]);

// Перекраска синих частей зданий KayKit в цвет игрока (сдвиг оттенка в шейдере)
const hueMats = {};
export function hueMaterial(base, shift, sat) {
  const key = base.uuid + ":" + shift.toFixed(3) + ":" + (sat || 1);
  if (hueMats[key]) return hueMats[key];
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHue = { value: shift }; sh.uniforms.uSat = { value: sat || 1 };
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      uniform float uHue; uniform float uSat;
      vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
      vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
      { vec3 h = rgb2hsv(diffuseColor.rgb); if (h.y > 0.3 && h.x > 0.53 && h.x < 0.72) { h.x = fract(h.x + uHue); h.y = min(1.0, h.y * uSat); diffuseColor.rgb = hsv2rgb(h); } }`);
  };
  m.customProgramCacheKey = () => "hue" + shift.toFixed(3) + (sat || 1);
  hueMats[key] = m;
  return m;
}
// Командный цвет героя: ткань и доспехи — в цвет игрока (кожа, волосы, кожаные ремни остаются), мягкий контур-подсветка
const teamMats = {};
export function teamMaterial(base, color, rim) {
  const c = new THREE.Color(color), hsl = {}; c.getHSL(hsl);
  const key = base.uuid + ":" + c.getHexString() + ":" + (rim || 0);
  if (teamMats[key]) return teamMats[key];
  const m = base.clone();
  m.metalness = Math.min(m.metalness, 0.25); m.roughness = Math.max(m.roughness, 0.55);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTeam = { value: c.clone() }; sh.uniforms.uTH = { value: hsl.h }; sh.uniforms.uRim = { value: rim || 0 };
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      uniform vec3 uTeam; uniform float uTH; uniform float uRim;
      vec3 t_rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
      vec3 t_hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }`)
      .replace("#include <map_fragment>", `#include <map_fragment>
      { vec3 sc = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0/2.2)); vec3 h = t_rgb2hsv(sc);
        bool warm = h.x > 0.015 && h.x < 0.13;                 // кожа, волосы, кожа ремней — не трогаем
        if (h.y > 0.28 && !warm) { h.x = uTH; h.y = clamp(h.y * 1.05, 0.45, 0.95); sc = t_hsv2rgb(h); }
        else if (h.y < 0.16 && h.z > 0.45) { sc = mix(sc, sc * normalize(pow(uTeam, vec3(1.0/2.2)) + 0.25) * 1.15, 0.6); }   // серебро доспехов
        diffuseColor.rgb = pow(sc, vec3(2.2)); }`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      { float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0); totalEmissiveRadiance += uTeam * fr * uRim; }`);
  };
  m.customProgramCacheKey = () => "team" + (rim ? 1 : 0);
  teamMats[key] = m;
  return m;
}
export function tintObj(obj, hue) { obj.traverse((o) => { if (o.isMesh) o.material = hueMaterial(o.material, hue); }); return obj; }

// PBR-текстуры (Poly Haven) — по требованию, с кэшем
const texL = new THREE.TextureLoader(), texC = {};
export function tex(name, kind, repeat) {
  const key = name + kind; if (texC[key]) return texC[key];
  const t = texL.load(`assets/tex/${name}_${kind}.webp${V}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (kind === "d") t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.repeat.set(repeat, repeat);
  texC[key] = t; return t;
}
export function pbr(name, repeat, opts) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ map: tex(name, "d", repeat), normalMap: tex(name, "n", repeat), roughness: 0.85, metalness: 0 }, opts || {}));
  m.normalScale.set(0.8, 0.8); return m;
}
export function loadEnv(renderer, cb) {
  new RGBELoader().load(`assets/sky.hdr${V}`, (t) => {
    const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromEquirectangular(t).texture; t.dispose(); pm.dispose(); cb(env);
  }, undefined, () => {});
}
