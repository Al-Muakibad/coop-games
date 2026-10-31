// Загрузка и подготовка 3D-моделей (KayKit, CC0)
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const CHARS = ["knight", "barbarian", "rogue", "mage", "merchant", "sk_minion", "sk_warrior", "sk_rogue", "sk_mage"];
const UPPER = /^(chest|upperarm|lowerarm|wrist|hand|handslot|head)/;
export const A = { chars: {}, clips: {}, world: {}, weapons: {}, ready: false };

export async function loadAll(onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const files = [...CHARS.map((c) => c), "anims", "world", "weapons"];
  let done = 0;
  const load = (n) => new Promise((res, rej) => loader.load(`assets/${n}.glb?v=1`, (g) => { done++; onProgress && onProgress(done / files.length); res(g); }, undefined, rej));
  const res = await Promise.all(files.map(load));
  const get = (n) => res[files.indexOf(n)];
  // анимации
  for (const c of get("anims").animations) A.clips[c.name] = c;
  const mask = (clip, upper) => { const c = clip.clone(); c.tracks = c.tracks.filter((t) => UPPER.test(t.name) === upper); c.name = clip.name + (upper ? "_U" : "_L"); return c; };
  A.clips.Run_L = mask(A.clips.Running_A, false);
  A.clips.Idle_L = mask(A.clips.Idle, false);
  A.clips.Aim_U = mask(A.clips["1H_Ranged_Aiming"], true);
  A.clips.Shoot_U = mask(A.clips["1H_Ranged_Shoot"], true);
  A.clips.Aim2_U = mask(A.clips["2H_Ranged_Aiming"], true);
  A.clips.Shoot2_U = mask(A.clips["2H_Ranged_Shoot"], true);
  A.clips.Cast_U = mask(A.clips.Spellcast_Shoot, true);
  A.clips.Chop_U = mask(A.clips["1H_Melee_Attack_Chop"], true);
  // персонажи
  for (const c of CHARS) {
    const root = get(c).scene;
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; if (o.material) { o.material.metalness = 0; o.material.roughness = 0.75; } }
    });
    // убираем встроенное оружие/щиты (вешаем своё)
    ["handslotl", "handslotr"].forEach((b) => { const bone = root.getObjectByName(b); if (bone) [...bone.children].forEach((ch) => { if (!ch.isBone) bone.remove(ch); }); });
    if (c.startsWith("sk_")) mergeSkinned(root);
    A.chars[c] = root;
  }
  // мир и оружие: по имени
  for (const [k, n] of [["world", "world"], ["weapons", "weapons"]]) {
    const sc = get(n).scene;
    for (const ch of [...sc.children]) {
      ch.traverse((o) => { if (o.isMesh) { o.material.metalness = 0; o.material.roughness = 0.85; } });
      A[k][ch.name] = ch;
    }
  }
  A.ready = true;
  return A;
}

function toFloat(attr) {
  const n = attr.count, s = attr.itemSize, arr = new Float32Array(n * s);
  for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) arr[i * s + j] = [attr.getX, attr.getY, attr.getZ, attr.getW][j].call(attr, i);
  return new THREE.BufferAttribute(arr, s);
}
// Склеиваем части скелета (руки, ноги, тело…) в одну сетку: один вызов отрисовки на монстра вместо девяти
function mergeSkinned(root) {
  const list = []; root.traverse((o) => { if (o.isSkinnedMesh) list.push(o); });
  if (list.length < 2) return;
  const b = list[0], eq = (m1, m2) => m1.elements.every((v, i) => Math.abs(v - m2.elements[i]) < 1e-4);
  const ok = list.every((m) => m.skeleton.bones.length === b.skeleton.bones.length && m.skeleton.bones.every((x, i) => x.name === b.skeleton.bones[i].name) && eq(m.bindMatrix, b.bindMatrix) && eq(m.matrix, b.matrix));
  if (!ok) { console.warn("mergeSkinned: не склеили", root.name); return; }
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), tmp = new THREE.Matrix4(), acc = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const geos = list.map((m) => {
    const g = new THREE.BufferGeometry();
    const cnt = m.geometry.attributes.position.count;
    for (const [a, s] of [["position", 3], ["normal", 3], ["uv", 2], ["skinIndex", 4], ["skinWeight", 4]]) { const at = m.geometry.getAttribute(a); g.setAttribute(a, at ? toFloat(at) : new THREE.BufferAttribute(new Float32Array(cnt * s).map((_, i) => (a === "normal" && i % 3 === 1) || (a === "skinWeight" && i % 4 === 0) ? 1 : 0), s)); }
    g.setIndex(m.geometry.index ? Array.from(m.geometry.index.array) : null);
    // у каждой части свои обратные матрицы привязки — переводим вершины в «пространство» первой части
    const Dm = m.skeleton.boneInverses.map((ib, i) => new THREE.Matrix4().copy(b.skeleton.boneInverses[i]).invert().multiply(ib));
    if (!Dm.every((x) => eq(x, new THREE.Matrix4()))) {
      const P = g.attributes.position, N = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
      for (let i = 0; i < P.count; i++) {
        acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        for (let k = 0; k < 4; k++) { const w = [SW.getX, SW.getY, SW.getZ, SW.getW][k].call(SW, i); if (!w) continue; const j = [SI.getX, SI.getY, SI.getZ, SI.getW][k].call(SI, i); tmp.copy(Dm[j]); for (let e = 0; e < 16; e++) acc.elements[e] += tmp.elements[e] * w; }
        v.fromBufferAttribute(P, i).applyMatrix4(acc); P.setXYZ(i, v.x, v.y, v.z);
        if (N) { nm.getNormalMatrix(acc); nv.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); N.setXYZ(i, nv.x, nv.y, nv.z); }
      }
    }
    return g;
  });
  const merged = mergeGeometries(geos, false);
  if (!merged) return;
  const mesh = new THREE.SkinnedMesh(merged, b.material);
  mesh.name = "body"; mesh.frustumCulled = false;
  mesh.position.copy(b.position); mesh.quaternion.copy(b.quaternion); mesh.scale.copy(b.scale);
  b.parent.add(mesh);
  mesh.bind(b.skeleton, b.bindMatrix);
  list.forEach((m) => m.parent.remove(m));
}

// Новый персонаж: клон модели + свой микшер анимаций
export function makeChar(kind) {
  const obj = SkeletonUtils.clone(A.chars[kind]);
  const mixer = new THREE.AnimationMixer(obj);
  const actions = {};
  const act = (name) => {
    if (!actions[name]) { const c = A.clips[name]; if (!c) return null; actions[name] = mixer.clipAction(c); }
    return actions[name];
  };
  const meshes = []; obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return { obj, mixer, act, meshes, bone: (n) => obj.getObjectByName(n) };
}
// клон в обёртке: у квантованных моделей на самом узле лежит масштаб распаковки — его нельзя затирать
const wrap = (o) => { const g = new THREE.Group(); if (o) g.add(o.clone()); return g; };
export function cloneWorld(name) { return wrap(A.world[name]); }
export function cloneWeapon(name) { return wrap(A.weapons[name]); }

// Перекраска синих частей зданий KayKit в цвет игрока (сдвиг оттенка прямо в шейдере)
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
export function applyMat(obj, fn) { obj.traverse((o) => { if (o.isMesh) o.material = fn(o.material); }); return obj; }
