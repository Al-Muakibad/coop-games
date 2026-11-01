// Локация: рельеф с PBR-текстурами, вода/лава/лёд, лес по краю, декор, погода, свет и туман по биому.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { A, tex, cloneNature, cloneProp, cloneWorld, pbr } from "./assets.js";
import * as D from "./data.js";

// базовый масштаб моделей Quaternius под рост героя (~1.4)
export const NS = (n) => /TwistedTree/.test(n) ? 0.3 : /DeadTree_3/.test(n) ? 0.34 : /DeadTree/.test(n) ? 0.45 : /Tree|Pine/.test(n) ? 0.6 : /Rock_Medium/.test(n) ? 0.55 : /Bush/.test(n) ? 0.55 : /Fern/.test(n) ? 0.5 : /Flower/.test(n) ? 0.32 : /Grass/.test(n) ? 0.35 : /Clover/.test(n) ? 0.4 : /Mushroom/.test(n) ? 0.7 : /Pebble/.test(n) ? 1.2 : /RockPath/.test(n) ? 1.0 : /Plant_1/.test(n) ? 0.35 : /Plant_7/.test(n) ? 0.7 : 1;
const PI2 = Math.PI * 2, clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, k) => a + (b - a) * k;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function noise2(x, z) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), u), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
}
const fbm = (x, z) => noise2(x, z) * 0.6 + noise2(x * 2.1 + 7, z * 2.1) * 0.3 + noise2(x * 4.3, z * 4.3 + 3) * 0.1;

// ---------- рельеф: 4 слоя текстур смешиваются по весам в вершинах ----------
function terrainMaterial(G) {
  const rep = 0.16;
  const m = new THREE.MeshStandardMaterial({ map: tex(G.base, "d"), normalMap: tex(G.base, "n"), roughness: 0.92, metalness: 0, envMapIntensity: 0.35 });
  m.normalScale.set(1.1, 1.1);
  const U = { t1: { value: tex(G.alt, "d") }, t2: { value: tex(G.path, "d") }, t3: { value: tex(G.plaza, "d") }, n1: { value: tex(G.alt, "n") }, n2: { value: tex(G.path, "n") }, n3: { value: tex(G.plaza, "n") },
    tint0: { value: new THREE.Vector3(...G.tint) }, tint1: { value: new THREE.Vector3(...(G.tintAlt || [1, 1, 1])) }, rep: { value: rep } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec2 vW;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvSplat = splat; vW = (modelMatrix * vec4(position,1.0)).xz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      uniform sampler2D t1, t2, t3, n1, n2, n3; uniform vec3 tint0, tint1; uniform float rep; varying vec4 vSplat; varying vec2 vW;
      vec4 tri(sampler2D t, vec2 uv){ return texture2D(t, uv); }
      vec3 wts(){ float a = vSplat.x, b = vSplat.y, c = vSplat.z; return vec3(a, b, c); }`)
      .replace("#include <map_fragment>", `
      vec2 uvA = vW * rep, uvB = vW * rep * 0.37 + 0.31;
      vec3 c0 = mix(texture2D(map, uvA).rgb, texture2D(map, uvB).rgb, 0.35) * tint0;
      vec3 c1 = texture2D(t1, uvA * 0.8).rgb * tint1, c2 = texture2D(t2, uvA * 1.3).rgb, c3 = texture2D(t3, uvA * 1.1).rgb;
      vec3 w = wts(); float w0 = max(0.0, 1.0 - w.x - w.y - w.z);
      vec3 col = c0 * w0 + c1 * w.x + c2 * w.y + c3 * w.z;
      col *= mix(0.82, 1.12, vSplat.w);
      diffuseColor.rgb *= col;`)
      .replace("vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;", `
      vec3 ww = wts(); float ww0 = max(0.0, 1.0 - ww.x - ww.y - ww.z);
      vec3 mapN = (texture2D(normalMap, uvA).xyz * ww0 + texture2D(n1, uvA * 0.8).xyz * ww.x + texture2D(n2, uvA * 1.3).xyz * ww.y + texture2D(n3, uvA * 1.1).xyz * ww.z) * 2.0 - 1.0;`);
  };
  m.customProgramCacheKey = () => "terrain4";
  return m;
}

// ---------- вода / лава / лёд ----------
const waterU = { time: { value: 0 } };
function waterMaterial(kind, sky) {
  const C = { lake: [0x2c6f86, 0x6fb8c8], swamp: [0x3a4a2a, 0x6a7a4a], oasis: [0x1f8aa0, 0x7fe0e0], ice: [0xa8d8f0, 0xe8f6ff], lava: [0xff5a10, 0xffd040] }[kind] || [0x2c6f86, 0x6fb8c8];
  const lava = kind === "lava", ice = kind === "ice";
  return new THREE.ShaderMaterial({
    transparent: !lava && !ice, depthWrite: lava || ice, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: waterU.time, deep: { value: new THREE.Color(C[0]) }, shallow: { value: new THREE.Color(C[1]) }, sky: { value: new THREE.Color(sky) }, sunDir: { value: new THREE.Vector3(0.5, 0.8, 0.4).normalize() } }]),
    vertexShader: `varying vec3 vW; varying float vEdge; attribute float edge;
#include <fog_pars_vertex>

      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vEdge = edge; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform float time; uniform vec3 deep, shallow, sky, sunDir; varying vec3 vW; varying float vEdge;
#include <fog_pars_fragment>

      float h(vec2 p){ return sin(p.x*1.7+time*1.3)*0.5+sin(p.y*2.3-time*1.1)*0.5+sin((p.x+p.y)*3.1+time*2.0)*0.25+sin((p.x-p.y)*5.3-time*2.6)*0.12; }
      void main(){
        vec2 p = vW.xz; float e = 0.06; vec3 n = normalize(vec3(h(p-vec2(e,0.))-h(p+vec2(e,0.)), 6.0, h(p-vec2(0.,e))-h(p+vec2(0.,e))));
        vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        ${lava ? `float k = 0.5+0.5*sin(p.x*0.9+time*0.7)*sin(p.y*1.1-time*0.5); vec3 col = mix(deep, shallow, k*k) * (1.6 + 1.2*k); float crust = smoothstep(0.55,0.75, sin(p.x*2.7+sin(p.y*1.9+time*0.3)*2.)*0.5+0.5); col = mix(col, vec3(0.08,0.04,0.03), crust*0.7); gl_FragColor = vec4(col, 1.0);`
        : ice ? `float cr = smoothstep(0.96,1.0, abs(sin(p.x*3.1+sin(p.y*2.)*2.))); vec3 col = mix(deep, shallow, 0.5+0.5*h(p*0.3)) + fr*0.35 + cr*0.25; float s = pow(max(dot(reflect(-sunDir, n), V), 0.0), 80.0); gl_FragColor = vec4(col + s, 1.0);`
        : `vec3 col = mix(shallow, deep, smoothstep(0.0, 1.0, vEdge)); col = mix(col, sky, fr*0.6); float s = pow(max(dot(reflect(-sunDir, n), V), 0.0), 120.0); col += s*1.5; float foam = smoothstep(0.25, 0.0, vEdge) * (0.5+0.5*sin(time*2.0+p.x*3.0+p.y*2.0)); col = mix(col, vec3(0.95), foam*0.45); gl_FragColor = vec4(col, 0.9 * smoothstep(0.0, 0.45, vEdge) );`}
        #include <fog_fragment>
      }`
  });
}

// ---------- построение мира ----------
export function buildWorld(world, renderer, locId, seed, spots, msp) {
  const L = D.LOC[locId] || D.LOCS[0], G = L.ground, r = rng(seed);
  const W = { L, obstacles: [], water: [], nodes: [], fxPoints: [], resInst: {}, update: null, lights: [] };
  // озёра: подальше от домов и центра
  const lakes = [];
  const nLakes = L.water === "lava" ? 3 : L.water === "oasis" ? 1 : 2;
  for (let i = 0, tries = 0; i < nLakes && tries < 300; tries++) {
    const a = r() * PI2, rr = 11 + r() * 13, x = Math.cos(a) * rr, z = Math.sin(a) * rr, R = L.water === "oasis" ? 4.5 : 2.6 + r() * 2;
    if (L.water === "oasis" && spots.length === 1) { /* оазис ближе к центру */ }
    if (spots.some((s) => dist(x, z, s.x, s.z) < R + 9) || dist(x, z, msp.x, msp.z) < R + 5 || lakes.some((l) => dist(x, z, l.x, l.z) < l.R + R + 4) || Math.hypot(x, z) + R > D.MAP_R - 2) continue;
    lakes.push({ x, z, R, ph: r() * 10 }); i++;
  }
  const lakeD = (x, z) => { let best = 1e9; for (const l of lakes) { const ang = Math.atan2(z - l.z, x - l.x), rr = l.R * (0.85 + 0.25 * noise2(Math.cos(ang) * 2 + l.ph, Math.sin(ang) * 2)); best = Math.min(best, dist(x, z, l.x, l.z) - rr); } return best; };
  W.lakes = lakes; W.lakeD = lakeD;
  // рельеф
  const GS = 170, seg = 150, geo = new THREE.PlaneGeometry(GS, GS, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, sp = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), rr = Math.hypot(x, z);
    let alt = clamp((fbm(x * 0.05, z * 0.05) - 0.45) * 2.2, 0, 1) * 0.85, path = 0, plaza = 0;
    let d = 1e9; for (const s of spots) d = Math.min(d, dist(x, z, s.x, s.z));
    plaza = clamp(1 - (d - 3.8) / 1.6, 0, 1) * (0.75 + 0.25 * noise2(x * 0.8, z * 0.8));
    path = clamp(1 - (d - 5.5) / 2.5, 0, 1) * 0.6;
    const dm = dist(x, z, msp.x, msp.z); plaza = Math.max(plaza, clamp(1 - (dm - 2.2) / 1.5, 0, 1) * 0.8);
    // тропинки от домов к центру и к краю
    for (const s of spots) {
      const L2 = Math.hypot(s.x, s.z) || 1;
      for (const [ax, az, bx, bz] of [[s.x, s.z, msp.x, msp.z], [s.x, s.z, s.x + s.x / L2 * 30, s.z + s.z / L2 * 30]]) {
        const dx = bx - ax, dz = bz - az, ll = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / ll, 0, 1), px = ax + dx * t, pz = az + dz * t;
        const wob = (noise2(x * 0.3, z * 0.3) - 0.5) * 1.2; const dd = dist(x, z, px, pz) + wob;
        path = Math.max(path, clamp(1 - (dd - 0.7) / 1.0, 0, 1) * (0.8 + 0.2 * noise2(x * 2, z * 2)));
      }
    }
    let y = 0;
    const ld = lakeD(x, z);
    if (lakes.length && ld < 2.5) { path = Math.max(path, clamp(1 - (ld + 0.5) / 3, 0, 1) * 0.8); if (ld < 0) y = Math.max(-1.1, ld * 0.6); }
    if (rr > D.MAP_R + 1) { const e = rr - D.MAP_R - 1; y = Math.min(9, e * e * 0.045) * (0.5 + 0.9 * fbm(x * 0.04, z * 0.04)); alt = Math.max(alt, clamp(e / 12, 0, 0.7)); path *= clamp(1 - e / 6, 0, 1); }
    else y += (fbm(x * 0.12, z * 0.12) - 0.5) * 0.12;
    pos.setY(i, y);
    const sum = alt + path + plaza; if (sum > 1) { alt /= sum; path /= sum; plaza /= sum; }
    sp[i * 4] = alt; sp[i * 4 + 1] = path; sp[i * 4 + 2] = plaza; sp[i * 4 + 3] = fbm(x * 0.09 + 3, z * 0.09);
  }
  geo.setAttribute("splat", new THREE.BufferAttribute(sp, 4)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, terrainMaterial(G)); ground.receiveShadow = true; world.add(ground);
  W.ground = ground;
  // вода
  const wm = waterMaterial(L.water, L.sky.day);
  for (const l of lakes) {
    const g2 = new THREE.RingGeometry(0.01, l.R * 1.35, 64, 14); g2.rotateX(-Math.PI / 2);
    const p2 = g2.attributes.position, edge = new Float32Array(p2.count);
    for (let i = 0; i < p2.count; i++) { const x = p2.getX(i) + l.x, z = p2.getZ(i) + l.z; edge[i] = clamp(-lakeD(x, z) / 1.6, 0, 1); }
    g2.setAttribute("edge", new THREE.BufferAttribute(edge, 1));
    const wmesh = new THREE.Mesh(g2, wm); wmesh.position.set(l.x, L.water === "lava" ? -0.15 : -0.12, l.z); wmesh.renderOrder = 2; world.add(wmesh);
    W.water.push({ x: l.x, z: l.z, R: l.R });
    // препятствие: «запрещённая» зона, проверяется через lakeD
    if (L.water === "swamp" || L.water === "lake" || L.water === "oasis") for (let k = 0; k < 4 + Math.floor(l.R); k++) { const a = r() * PI2, rr = l.R * (0.95 + r() * 0.2); const nm = r() < 0.5 ? "Grass_Common_Tall" : "Fern_1", reed = cloneNature(nm); reed.position.set(l.x + Math.cos(a) * rr, 0, l.z + Math.sin(a) * rr); reed.scale.setScalar(NS(nm) * (1 + r() * 0.5)); reed.rotation.y = r() * PI2; world.add(reed); }
    if (L.water === "lava") W.fxPoints.push({ k: "lava", x: l.x, z: l.z, R: l.R });
  }
  // ---------- растительность и декор (инстансами) ----------
  const inst = {};   // name -> [{x,z,s,ry,tint}]
  const put = (name, x, z, s, ry) => (inst[name] = inst[name] || []).push({ x, z, s: s * NS(name.split("|")[0]), ry: ry == null ? r() * PI2 : ry });
  const freeAt = (x, z, pad) => spots.every((s) => dist(x, z, s.x, s.z) > 7.6 + pad) && dist(x, z, msp.x, msp.z) > 4.5 + pad && (!lakes.length || lakeD(x, z) > 0.8 + pad);
  const treeList = L.trees, totW = treeList.reduce((s, t) => s + t[1], 0);
  const pickTree = () => { let x = r() * totW; for (const [n, w] of treeList) { x -= w; if (x <= 0) return n; } return treeList[0][0]; };
  // лес по краю (не мешает игре) — плотное кольцо
  for (let i = 0; i < 230; i++) {
    const a = r() * PI2, rr = D.MAP_R + 1.2 + Math.pow(r(), 0.8) * 15, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (L.palms && r() < 0.5) { (W.palms = W.palms || []).push({ x, z, s: 0.9 + r() * 0.5 }); continue; }
    put(pickTree() + (rr > D.MAP_R + 6 ? "|far" : ""), x, z, 1.0 + r() * 0.5 + (rr - D.MAP_R) * 0.04);
  }
  for (let i = 0; i < 40; i++) { const a = r() * PI2, rr = D.MAP_R + 1 + r() * 12; put("Rock_Medium_" + (1 + Math.floor(r() * 3)), Math.cos(a) * rr, Math.sin(a) * rr, 1.2 + r() * 1.6); }
  // ресурсы: деревья и камни (интерактивные)
  const okNode = (x, z) => Math.hypot(x, z) < D.MAP_R - 2.5 && freeAt(x, z, 0) && W.nodes.every((q) => dist(x, z, q.x, q.z) > 2.6);
  const want = { tree: 22 + 4 * spots.length, rock: 10 + 3 * spots.length };
  for (const kind of ["tree", "rock"]) {
    let made = 0;
    for (const s of spots) for (let k = 0; k < (kind === "tree" ? 3 : 2); k++) for (let t = 0; t < 80; t++) {
      const a = r() * PI2, rr = 8.5 + r() * 4, x = s.x + Math.cos(a) * rr, z = s.z + Math.sin(a) * rr;
      if (okNode(x, z)) { W.nodes.push(mkNode(kind, x, z)); made++; break; }
    }
    for (let t = 0; made < want[kind] && t < 3000; t++) { const a = r() * PI2, rr = 6 + Math.sqrt(r()) * 21, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (okNode(x, z)) { W.nodes.push(mkNode(kind, x, z)); made++; } }
  }
  function mkNode(kind, x, z) {
    const model = kind === "tree" ? (L.palms && r() < 0.6 ? "palm" : pickTree()) : "Rock_Medium_" + (1 + Math.floor(r() * 3));
    const s = (kind === "tree" ? 0.9 + r() * 0.3 : 0.95 + r() * 0.3) * NS(model); return { kind, model, x, z, s, r: kind === "tree" ? 0.4 : 0.42 * 3.2 * s, ry: r() * PI2, amt: D.RES[kind].amount, regrow: 0 };
  }
  // мелкий декор внутри поля
  const decoN = L.id === "snow" ? 60 : L.id === "desert" ? 50 : 120;
  for (let i = 0; i < decoN; i++) { const a = r() * PI2, rr = Math.sqrt(r()) * (D.MAP_R + 2), x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (!freeAt(x, z, -2.5)) continue; const n = L.deco[Math.floor(r() * L.deco.length)]; put(n, x, z, 0.8 + r() * 0.5); }
  // камни-валуны декоративные
  for (let i = 0; i < 10; i++) { const a = r() * PI2, rr = 8 + r() * 18, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (!freeAt(x, z, 0.5)) continue; put("RockPath_Round_Small_1", x, z, 1.0); }
  // руины
  const ruins = [];
  for (let i = 0; i < 4; i++) for (let t = 0; t < 60; t++) {
    const a = r() * PI2, rr = 12 + r() * 13, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (!freeAt(x, z, 2) || W.nodes.some((q) => dist(x, z, q.x, q.z) < 3.5)) continue;
    const o = cloneWorld(["wall_straight", "building_destroyed", "wall_straight", "building_scaffolding"][i % 4]); o.position.set(x, -0.05, z); o.rotation.y = r() * PI2; o.scale.setScalar(i % 4 === 1 ? 2.2 : 1.7);
    o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.material = c.material.clone(); c.material.color.multiplyScalar(0.8); } }); world.add(o);
    W.obstacles.push({ x, z, r: i % 4 === 1 ? 1.8 : 1.4 }); ruins.push(o); break;
  }
  // костры и фонари у центра
  const camp = { x: msp.x + 3.2, z: msp.z - 1.5 };
  if (freeAt(camp.x, camp.z, -4)) {
    for (let k = 0; k < 7; k++) { const a = k / 7 * PI2; put("Pebble_Round_" + (k % 2 ? 1 : 3), camp.x + Math.cos(a) * 0.6, camp.z + Math.sin(a) * 0.6, 0.6); }
    const logs = cloneWorld("resource_lumber"); logs.scale.setScalar(1.2); logs.position.set(camp.x, 0, camp.z); world.add(logs);
    W.fxPoints.push({ k: "campfire", x: camp.x, z: camp.z }); W.obstacles.push({ x: camp.x, z: camp.z, r: 0.7 });
    const b = cloneProp("Bench"); b.scale.setScalar(1.1); b.position.set(camp.x + 1.4, 0, camp.z + 0.6); b.rotation.y = 1.2; world.add(b);
  }
  // инстансинг всего, что накопилось
  W.inst = [];
  for (const [name, list] of Object.entries(inst)) {
    const src = A.nature[name.split("|")[0]]; if (!src) continue;
    src.updateMatrixWorld(true);
    const big = /Tree|Pine|Rock_Medium/.test(name) && !name.endsWith("|far");   // дальний лес без теней — экономим треугольники
    src.traverse((o) => {
      if (!o.isMesh) return;
      let mat = o.material;
      if (L.snowy && /Leaves|Leaf/.test(mat.name)) { mat = mat.clone(); mat.color.setRGB(0.85, 0.92, 1.0); }
      if (L.charred && /Bark/.test(mat.name)) { mat = mat.clone(); mat.color.setRGB(0.35, 0.3, 0.3); }
      if (L.id === "autumn" && /Leaves_Normal/.test(mat.name)) { mat = mat.clone(); mat.color.setRGB(1.2, 0.7, 0.35); }
      const im = new THREE.InstancedMesh(o.geometry, mat, list.length); im.castShadow = big; im.receiveShadow = true;
      const local = o.matrixWorld.clone(), mm = new THREE.Matrix4();
      list.forEach((it, i) => { mm.compose(new THREE.Vector3(it.x, 0, it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it.ry, 0)), new THREE.Vector3(it.s, it.s, it.s)); im.setMatrixAt(i, mm.multiply(local)); });
      world.add(im); W.inst.push(im);
    });
    if (/Rock_Medium/.test(name)) list.forEach((it) => { if (Math.hypot(it.x, it.z) < D.MAP_R + 1) W.obstacles.push({ x: it.x, z: it.z, r: 1.4 * it.s }); });
    if (/RockPath_Round_Small/.test(name)) list.forEach((it) => W.obstacles.push({ x: it.x, z: it.z, r: 0.6 }));
  }
  // пальмы (оазис): ствол из сегментов + крона из агавы
  if (L.palms) {
    const trunkM = pbr("cedar", 1, { color: 0x9c7a55, roughness: 0.9 });
    const crowns = [];
    const allPalms = (W.palms || []);
    for (const p of allPalms) {
      const h = 3.2 * p.s, pts = []; const lean = (r() - 0.5) * 0.8;
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 1.4) * lean, t * h, 0)); }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.14 * p.s, 6, false); const tm = new THREE.Mesh(tg, trunkM); tm.position.set(p.x, 0, p.z); tm.rotation.y = r() * PI2; tm.castShadow = true; world.add(tm);
      const top = pts[6].clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), tm.rotation.y); crowns.push({ x: p.x + top.x, z: p.z + top.z, y: top.y, s: p.s });
    }
    const crownSrc = A.nature.Plant_7_Big;
    if (crownSrc && crowns.length) crownSrc.traverse((o) => { if (!o.isMesh) return; const im = new THREE.InstancedMesh(o.geometry, o.material, crowns.length); im.castShadow = true; const mm = new THREE.Matrix4(); crowns.forEach((c, i) => { mm.compose(new THREE.Vector3(c.x, c.y - 0.3, c.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * PI2, 0)), new THREE.Vector3(2.6 * c.s, 1.6 * c.s, 2.6 * c.s)); im.setMatrixAt(i, mm); }); world.add(im); });
  }
  // трава-травинки (дёшево, много)
  buildGrass(world, L, spots, lakeD);
  // погода
  W.weather = makeWeather(world, L.weather);
  return W;
}

// ---------- ресурсные узлы: инстансы целого и срубленного ----------
export function buildNodeViews(world, W) {
  const groups = {};
  W.nodes.forEach((nd) => { (groups[nd.model] = groups[nd.model] || []).push(nd); });
  W.resInst = {};
  for (const [model, list] of Object.entries(groups)) {
    const parts = [], stumps = [];
    const mk = (src, n, arr, tintF) => { src.updateMatrixWorld(true); src.traverse((o) => { if (!o.isMesh) return; let mat = o.material; if (tintF) mat = tintF(mat); const im = new THREE.InstancedMesh(o.geometry, mat, n); im.castShadow = true; im.receiveShadow = true; im.userData.local = o.matrixWorld.clone(); world.add(im); arr.push(im); }); };
    if (model === "palm") { /* пальмы-ресурсы рисуем как агаву на стволе — упрощённо куст */ mk(A.nature.Plant_7_Big, list.length, parts); }
    else mk(A.nature[model], list.length, parts, (m) => { if (W.L.snowy && /Leaves|Leaf/.test(m.name)) { m = m.clone(); m.color.setRGB(0.85, 0.92, 1); } if (W.L.charred && /Bark/.test(m.name)) { m = m.clone(); m.color.setRGB(0.35, 0.3, 0.3); } if (W.L.id === "autumn" && /Leaves_Normal/.test(m.name)) { m = m.clone(); m.color.setRGB(1.2, 0.7, 0.35); } return m; });
    // пень: короткий цилиндр с текстурой коры
    if (list[0].kind === "tree") { const sg = new THREE.CylinderGeometry(0.28, 0.36, 0.45, 9); sg.translate(0, 0.22, 0); const im = new THREE.InstancedMesh(sg, pbr("cedar", 1, { color: 0x8a6a4a }), list.length); im.userData.local = new THREE.Matrix4(); im.castShadow = true; world.add(im); stumps.push(im); }
    list.forEach((nd, i) => { nd.slot = i; nd.gk = model; nd.shake = 0; nd.shown = -1; });
    W.resInst[model] = { full: parts, cut: stumps };
  }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export function setInst(parts, i, x, y, z, ry, s, sx, sz) {
  _q.setFromEuler(_e.set(sx || 0, ry, sz || 0)); _m.compose(_v.set(x, y, z), _q, _s.set(s, s, s));
  for (const p of parts) { const mm = new THREE.Matrix4().multiplyMatrices(_m, p.userData.local); p.setMatrixAt(i, mm); p.instanceMatrix.needsUpdate = true; }
}
export function updNode(W, nd) {
  const ri = W.resInst[nd.gk]; if (!ri) return false;
  const up = nd.amt > 0, s = nd.s;
  const sh = nd.shake > 0 ? Math.sin(nd.shake * 40) * 0.08 * nd.shake : 0;
  const grow = nd.kind === "tree" && up && nd.grow != null ? nd.grow : 1;
  const sc = nd.model === "palm" ? 1.8 : s;
  setInst(ri.full, nd.slot, nd.x, 0, nd.z, nd.ry, up ? sc * (nd.kind === "rock" ? 0.55 + 0.45 * nd.amt / D.RES.rock.amount : grow) : 0.0001, sh, sh * 0.6);
  if (ri.cut.length) setInst(ri.cut, nd.slot, nd.x, 0, nd.z, nd.ry, up ? 0.0001 : s * 0.8, 0, 0);
  const changed = nd.shown !== up; nd.shown = up; return changed;
}

// ---------- травинки ----------
export const grassT = { value: 0 };
function buildGrass(world, L, spots, lakeD) {
  const count = L.id === "snow" ? 350 : L.id === "desert" ? 250 : L.id === "volcano" ? 200 : 1100;
  const g = new THREE.BufferGeometry(), P3 = [], C3 = [];
  for (let b = 0; b < 5; b++) {
    const a = b / 5 * Math.PI + 0.3, w = 0.06, h = 0.32 + (b % 3) * 0.12, ox = Math.cos(a) * 0.09, oz = Math.sin(a) * 0.09, lean = 0.1;
    P3.push(ox - Math.sin(a) * w, 0, oz + Math.cos(a) * w, ox + Math.sin(a) * w, 0, oz - Math.cos(a) * w, ox * 3 + lean, h, oz * 3);
    C3.push(0.35, 0.5, 0.3, 0.35, 0.5, 0.3, 1, 1, 1);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(P3, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C3, 3)); g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = grassT;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uT;").replace("#include <begin_vertex>", `#include <begin_vertex>
      vec4 wp = instanceMatrix * vec4(0.,0.,0.,1.); float sw = sin(uT * 1.7 + wp.x * 0.35 + wp.z * 0.25) * 0.5 + sin(uT * 3.1 + wp.x) * 0.15;
      transformed.x += sw * position.y * 0.35; transformed.z += sw * position.y * 0.2;`);
  };
  const im = new THREE.InstancedMesh(g, mat, count); im.receiveShadow = true;
  const col = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let k = 0;
  const [h0, s0, l0] = L.grass;
  for (let i = 0; i < count * 4 && k < count; i++) {
    const a = Math.random() * PI2, rr = Math.sqrt(Math.random()) * (D.MAP_R + 4), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (spots.some((p) => dist(x, z, p.x, p.z) < 5.4)) continue;
    if (lakeD(x, z) < 0.3) continue;
    if (noise2(x * 0.15, z * 0.15) < 0.38 && Math.random() < 0.75) continue;
    m.compose(v.set(x, 0, z), q.setFromEuler(e.set(0, Math.random() * PI2, 0)), s.setScalar(0.8 + Math.random() * 1.2));
    im.setMatrixAt(k, m);
    const f = Math.random();
    if (L.id === "forest" && f < 0.05) col.set([0xffe066, 0xff9ecf, 0xffffff, 0xb08cff][Math.floor(Math.random() * 4)]);
    else col.setHSL(h0 + (Math.random() - 0.5) * 0.05, s0, l0 + Math.random() * 0.15);
    im.setColorAt(k, col); k++;
  }
  im.count = k; world.add(im);
}

// ---------- погода: снег, угли, листья, светлячки, пыль, пыльца ----------
function makeWeather(world, kind) {
  const N = { snow: 700, embers: 260, leaves: 140, fireflies: 90, dust: 160, pollen: 120 }[kind] || 0;
  if (!N) return null;
  const geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - 0.5) * 50; p[i * 3 + 1] = Math.random() * 14; p[i * 3 + 2] = (Math.random() - 0.5) * 50; ph[i] = Math.random() * 100; }
  geo.setAttribute("position", new THREE.BufferAttribute(p, 3)); geo.setAttribute("ph", new THREE.BufferAttribute(ph, 1));
  const C = { snow: [1, 1, 1], embers: [1.6, 0.6, 0.15], leaves: [0.95, 0.5, 0.15], fireflies: [1.0, 1.6, 0.4], dust: [1, 0.9, 0.7], pollen: [1, 1, 0.8] }[kind];
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: kind === "embers" || kind === "fireflies" ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { t: { value: 0 }, c: { value: new THREE.Vector3(...C) }, center: { value: new THREE.Vector3() }, scale: { value: 300 }, kind: { value: ["snow", "embers", "leaves", "fireflies", "dust", "pollen"].indexOf(kind) } },
    vertexShader: `attribute float ph; uniform float t, scale, kind; uniform vec3 center; varying float vA; varying float vPh;
      void main(){ vec3 p = position; float T = t + ph;
        if (kind < 0.5) { p.y = mod(p.y - t*1.4, 14.0); p.x += sin(T*0.9)*0.6; p.z += cos(T*0.7)*0.6; }
        else if (kind < 1.5) { p.y = mod(p.y + t*1.1, 14.0); p.x += sin(T*1.7)*0.5; }
        else if (kind < 2.5) { p.y = mod(p.y - t*0.9, 14.0); p.x += sin(T*1.3)*1.2; p.z += sin(T*0.8)*0.8; }
        else if (kind < 3.5) { p.y = 0.4 + mod(p.y, 2.5) + sin(T*0.9)*0.4; p.x += sin(T*0.5)*1.5; p.z += cos(T*0.6)*1.5; }
        else { p.y = mod(p.y + t*0.15, 6.0); p.x += sin(T*0.3)*2.0 + t*0.3; }
        p.x = center.x + mod(p.x - center.x + 25.0, 50.0) - 25.0; p.z = center.z + mod(p.z - center.z + 25.0, 50.0) - 25.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float sz = kind < 0.5 ? 0.13 : kind < 1.5 ? 0.09 : kind < 2.5 ? 0.18 : kind < 3.5 ? 0.12 : 0.06;
        gl_PointSize = sz * scale / -mv.z; vA = kind > 2.5 && kind < 3.5 ? 0.5 + 0.5*sin(T*3.0) : 1.0; vPh = ph; }`,
    fragmentShader: `uniform vec3 c; uniform float kind; varying float vA; varying float vPh;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.1, r) * vA;
        vec3 col = c; if (kind > 1.5 && kind < 2.5) { col = mix(vec3(0.95,0.45,0.1), vec3(0.85,0.2,0.1), fract(vPh)); a = step(r, 0.42); }
        gl_FragColor = vec4(col, a * (kind < 0.5 ? 0.9 : 0.85)); }`
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 7; world.add(pts);
  return { mat, pts, kind };
}
export function updateWorld(W, dt, cx, cz, H) {
  waterU.time.value += dt;
  if (W && W.weather) { W.weather.mat.uniforms.t.value += dt; W.weather.mat.uniforms.center.value.set(cx, 0, cz); W.weather.mat.uniforms.scale.value = H * 0.7; }
}
