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
// след модели на земле: центр и полуоси габарита при масштабе 1 (кэш по имени) — коллайдеры по реальному размеру, а не «на глаз»
const FP = new Map(), _bx = new THREE.Box3();
export function footprint(key, src) {
  let f = FP.get(key); if (f) return f;
  const g = new THREE.Group(); if (src) g.add(src.clone()); g.updateMatrixWorld(true); _bx.setFromObject(g);
  f = _bx.isEmpty() ? { cx: 0, cz: 0, hx: 0.5, hz: 0.5, h: 1 } : { cx: (_bx.min.x + _bx.max.x) / 2, cz: (_bx.min.z + _bx.max.z) / 2, hx: (_bx.max.x - _bx.min.x) / 2, hz: (_bx.max.z - _bx.min.z) / 2, h: _bx.max.y };
  FP.set(key, f); return f;
}
// круги-препятствия по следу (поворот ry, масштаб s, k — «запас»): вытянутое — цепочкой кругов вдоль длинной оси
export function fpCircles(f, x, z, s, ry, k = 1) {
  const c = Math.cos(ry), sn = Math.sin(ry), ox = (f.cx * c + f.cz * sn) * s, oz = (-f.cx * sn + f.cz * c) * s;
  const a = Math.max(f.hx, f.hz) * s * k, b = Math.min(f.hx, f.hz) * s * k;
  if (a < b * 1.6) return [{ x: x + ox, z: z + oz, r: (a + b) / 2 }];
  const ux = f.hx >= f.hz ? c : sn, uz = f.hx >= f.hz ? -sn : c, n = Math.ceil(a / b), out = [];
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : (i / (n - 1) * 2 - 1) * (a - b); out.push({ x: x + ox + ux * t, z: z + oz + uz * t, r: b }); }
  return out;
}
// ресурс-камень: коллайдер по габариту модели, а сама модель сдвинута так, чтобы её середина была в точке узла
export function fitNode(nd) {
  if (nd.kind !== "rock" || !A.nature[nd.model]) return nd;
  const f = footprint(nd.model, A.nature[nd.model]), c = Math.cos(nd.ry), sn = Math.sin(nd.ry);
  nd.ox = f.cx * c + f.cz * sn; nd.oz = -f.cx * sn + f.cz * c; nd.r = (f.hx + f.hz) / 2 * nd.s * 0.92; nd.vr = Math.max(f.hx, f.hz) * nd.s;
  return nd;
}
const fbm = (x, z) => noise2(x, z) * 0.6 + noise2(x * 2.1 + 7, z * 2.1) * 0.3 + noise2(x * 4.3, z * 4.3 + 3) * 0.1;

// ---------- рельеф: 4 слоя текстур смешиваются по весам в вершинах ----------
export function terrainMaterial(G) {
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
// заснеженная листва: зелень уходит в бело-голубую гамму (кусты зимой)
const snowMats = new Map();
function snowify(base) {
  if (snowMats.has(base)) return snowMats.get(base);
  const m = base.clone(); m.onBeforeCompile = (sh, r) => { if (base.onBeforeCompile) base.onBeforeCompile(sh, r); sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n float sl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(0.6, 0.66, 0.74), vec3(0.95, 0.97, 1.0), clamp(sl * 2.2, 0.0, 1.0));"); };
  m.customProgramCacheKey = () => "snowleaf"; snowMats.set(base, m); return m;
}
export function buildWorld(world, renderer, locId, seed, spots, msp, colors) {
  const L = D.LOC[locId] || D.LOCS[0], G = L.ground, r = rng(seed);
  const W = { L, obstacles: [], water: [], nodes: [], fxPoints: [], resInst: {}, update: null, lights: [], colors };
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
    const edge = 3.0 + (noise2(x * 0.9 + 7, z * 0.9) - 0.5) * 1.6;   // рваный край мощёного двора
    plaza = clamp(1 - (d - edge) / 0.8, 0, 1) * (0.8 + 0.2 * noise2(x * 1.7, z * 1.7));
    path = clamp(1 - (d - 4.4 - (noise2(x * 0.5, z * 0.5) - 0.5) * 2.2) / 1.8, 0, 1) * (0.45 + 0.35 * noise2(x * 1.3 + 3, z * 1.3));   // утоптанная земля вокруг
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
  // маска земли в любой точке (билинейно по сетке): [альт-трава, тропа, двор]
  const splatAt = (x, z) => {
    const fx = (x + GS / 2) / GS * seg, fz = (z + GS / 2) / GS * seg, i = clamp(Math.floor(fx), 0, seg - 1), j = clamp(Math.floor(fz), 0, seg - 1), tx = fx - i, tz = fz - j;
    const k = (a, b) => (a + b * (seg + 1)) * 4, out = [0, 0, 0];
    for (let c = 0; c < 3; c++) out[c] = lerp(lerp(sp[k(i, j) + c], sp[k(i + 1, j) + c], tx), lerp(sp[k(i, j + 1) + c], sp[k(i + 1, j + 1) + c], tx), tz);
    return out;
  };
  W.splatAt = splatAt;
  // высота рельефа за краем поля (та же формула, что у сетки) — деревья и валуны опушки стоят на склоне, а не тонут в нём
  const hAt = (x, z) => { const e = Math.hypot(x, z) - D.MAP_R - 1; return e > 0 ? Math.min(9, e * e * 0.045) * (0.5 + 0.9 * fbm(x * 0.04, z * 0.04)) : 0; };
  W.hAt = hAt;
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
  const gres = []; spots.forEach((s) => D.GATHER_KEYS.forEach((k) => gres.push(D.gatherPos(s.x, s.z, msp.x, msp.z, k)))); W.gres = gres;   // места добытчиков держим свободными
  const freeAt = (x, z, pad) => spots.every((s) => dist(x, z, s.x, s.z) > 7.6 + pad) && gres.every((g) => dist(x, z, g.x, g.z) > 3.6 + pad) && dist(x, z, msp.x, msp.z) > 4.5 + pad && (!lakes.length || lakeD(x, z) > 0.8 + pad);
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
  // декор у аванпостов (знамёна, факелы, бочки) и костёр у торговца ставится позже — места заранее держим свободными от ресурсов
  const deco0 = [{ x: msp.x + 3.2, z: msp.z - 1.5, r: 1.6 }];
  spots.forEach((s0) => { const lay = D.outpostLayout(s0.x, s0.z, msp.x, msp.z); lay.banners.forEach((p) => deco0.push({ x: p.x, z: p.z, r: 0.5 })); lay.torches.forEach((p) => deco0.push({ x: p.x, z: p.z, r: 0.4 })); deco0.push({ x: lay.barrels.x, z: lay.barrels.z, r: 1.2 }); });
  const okNode = (x, z) => Math.hypot(x, z) < D.MAP_R - 2.5 && freeAt(x, z, 0) && W.nodes.every((q) => dist(x, z, q.x, q.z) > 2.6) && deco0.every((d) => dist(x, z, d.x, d.z) > d.r + 1.4);
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
    const s = (kind === "tree" ? 0.9 + r() * 0.3 : 0.95 + r() * 0.3) * NS(model); return fitNode({ kind, model, x, z, s, r: kind === "tree" ? 0.4 : 0.42 * 3.2 * s, vr: kind === "tree" ? 1.1 : 1.5 * s, ry: r() * PI2, amt: D.RES[kind].amount, regrow: 0 });
  }
  // мелкий декор внутри поля
  const clusters = (L.base || L.id) === "snow" ? 14 : (L.base || L.id) === "desert" ? 12 : (L.base || L.id) === "volcano" ? 12 : 26;
  const okDeco = (x, z) => freeAt(x, z, -2.2) && splatAt(x, z)[1] < 0.3 && splatAt(x, z)[2] < 0.1 && Math.hypot(x, z) < D.MAP_R + 3;
  for (let c = 0, t = 0; c < clusters && t < 600; t++) {
    // центр кучки — чаще у деревьев и камней (там «живописнее»)
    let cx, cz; const nd = W.nodes.length && r() < 0.6 ? W.nodes[Math.floor(r() * W.nodes.length)] : null;
    if (nd) { const a = r() * PI2; cx = nd.x + Math.cos(a) * 1.3; cz = nd.z + Math.sin(a) * 1.3; } else { const a = r() * PI2, rr = 5 + Math.sqrt(r()) * (D.MAP_R - 4); cx = Math.cos(a) * rr; cz = Math.sin(a) * rr; }
    if (!okDeco(cx, cz)) continue; c++;
    const kinds = [L.deco[Math.floor(r() * L.deco.length)], L.deco[Math.floor(r() * L.deco.length)]], n = 3 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) { const a = r() * PI2, rr = Math.pow(r(), 0.7) * 1.6, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; if (okDeco(x, z)) put(kinds[k % 2], x, z, (1.0 - rr * 0.18) * (0.75 + r() * 0.45)); }
  }
  // опушка: кусты и папоротники плотнее к краю поля — мягкий переход в лес
  const edgeD = L.deco.filter((n) => /Bush|Fern|Plant/.test(n)); if (edgeD.length) for (let i = 0; i < 70; i++) { const a = r() * PI2, rr = D.MAP_R - 1.5 + Math.pow(r(), 0.6) * 4.5, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (freeAt(x, z, -2) && splatAt(x, z)[1] < 0.4 && W.nodes.every((q) => dist(x, z, q.x, q.z) > (q.r || 0.5) + 0.8)) put(edgeD[Math.floor(r() * edgeD.length)], x, z, 0.9 + r() * 0.6); }
  // камни-валуны декоративные
  for (let i = 0; i < 10; i++) { const a = r() * PI2, rr = 8 + r() * 18, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (!freeAt(x, z, 0.5) || W.nodes.some((q) => dist(x, z, q.x, q.z) < (q.r || 0.5) + 1.6)) continue; put("RockPath_Round_Small_1", x, z, 1.0); }   // не на ресурсный камень
  // руины
  const ruins = [];
  for (let i = 0; i < 4; i++) for (let t = 0; t < 60; t++) {
    const a = r() * PI2, rr = 12 + r() * 13, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (!freeAt(x, z, 2) || W.nodes.some((q) => dist(x, z, q.x, q.z) < 3.5)) continue;
    const rn = ["wall_straight", "building_destroyed", "wall_straight", "building_scaffolding"][i % 4], o = cloneWorld(rn); o.position.set(x, -0.05, z); o.rotation.y = r() * PI2; o.scale.setScalar(i % 4 === 1 ? 2.2 : 1.7);
    o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.material = c.material.clone(); c.material.color.multiplyScalar(0.8); } }); world.add(o);
    W.obstacles.push(...fpCircles(footprint(rn, A.world[rn]), x, z, o.scale.x, o.rotation.y)); ruins.push(o); break;
  }
  // костры и фонари у центра
  const camp = { x: msp.x + 3.2, z: msp.z - 1.5 };
  if (freeAt(camp.x, camp.z, -4)) {
    for (let k = 0; k < 7; k++) { const a = k / 7 * PI2; put("Pebble_Round_" + (k % 2 ? 1 : 3), camp.x + Math.cos(a) * 0.6, camp.z + Math.sin(a) * 0.6, 0.6); }
    const logs = cloneWorld("resource_lumber"); logs.scale.setScalar(1.2); logs.position.set(camp.x, 0, camp.z); world.add(logs);
    W.fxPoints.push({ k: "campfire", x: camp.x, z: camp.z }); W.obstacles.push({ x: camp.x, z: camp.z, r: 0.7 });
    const b = cloneProp("Bench"); b.scale.setScalar(1.1); b.position.set(camp.x + 1.4, 0, camp.z + 0.6); b.rotation.y = 1.2; world.add(b);
  }
  // обжитой вид у каждого аванпоста (только снаружи кольца башен, проходы свободны)
  spots.forEach((sp0, si) => {
    const lay = D.outpostLayout(sp0.x, sp0.z, msp.x, msp.z), toC = lay.toC;
    const place = (obj, p, s, ry, rad) => { obj.position.set(p.x, 0, p.z); obj.scale.setScalar(s); obj.rotation.y = ry; obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); world.add(obj); if (rad) W.obstacles.push({ x: p.x, z: p.z, r: rad }); };
    const team = (W.colors && W.colors[si]) || null;
    for (let si2 = 0; si2 < 2; si2++) {   // знамёна по бокам тропы к центру, факелы — в просветах между башнями
      const p = lay.banners[si2];
      place(makeBanner(team || "#c0392b"), p, 1, -toC + Math.PI / 2, 0.3);
      const tp = lay.torches[si2], t = cloneProp("Torch_Metal"); place(t, tp, 1.3, 0, 0.25);
      W.fxPoints.push({ k: "torch", x: tp.x, z: tp.z, y: 1.55 });
    }
    const cl = lay.barrels;   // бочки и ящики
    [["Barrel", 0, 0, 1.0], ["Crate_Wooden", 0.75, 0.35, 0.95], ["Barrel_Apples", -0.55, 0.6, 0.9], ["Bucket_Wooden_1", 0.3, -0.7, 0.9]].forEach(([n, dx, dz, sc]) => { const o = cloneProp(n); place(o, { x: cl.x + dx, z: cl.z + dz }, sc, r() * PI2, 0); });
    W.obstacles.push({ x: cl.x, z: cl.z, r: 1.0 });
  });
  // инстансинг всего, что накопилось
  W.inst = [];
  for (const [name, list] of Object.entries(inst)) {
    const src = A.nature[name.split("|")[0]]; if (!src) continue;
    src.updateMatrixWorld(true);
    const big = /Tree|Pine|Rock_Medium/.test(name) && !name.endsWith("|far");   // дальний лес без теней — экономим треугольники
    src.traverse((o) => {
      if (!o.isMesh) return;
      let mat = o.material;
      if (L.snowy && /Bush|Fern|Plant/.test(name) && /Leaves|Leaf/.test(mat.name)) mat = snowify(mat); else if (L.snowy && /Leaves|Leaf/.test(mat.name)) { mat = mat.clone(); mat.color.setRGB(0.85, 0.92, 1.0); }
      if (L.charred && /Bark/.test(mat.name)) { mat = mat.clone(); mat.color.setRGB(0.35, 0.3, 0.3); }
      if ((L.base || L.id) === "autumn" && /Leaves_Normal/.test(mat.name)) { mat = mat.clone(); mat.color.setRGB(1.2, 0.7, 0.35); }
      if (L.blossom && /Leaves_NormalTree|Leaves_TwistedTree/.test(mat.name) && /CommonTree_2|CommonTree_3|TwistedTree/.test(name)) { const base = mat; mat = mat.clone(); mat.onBeforeCompile = (sh, r) => { if (base.onBeforeCompile) base.onBeforeCompile(sh, r); sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n float bl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(0.8, 0.36, 0.5), vec3(0.97, 0.72, 0.82), clamp(bl * 1.8, 0.0, 1.0));"); }; mat.customProgramCacheKey = () => "blossom"; }   // весна: цветущие деревья — листва в розовую гамму
      if (L.season === "summer" && /Leaves_NormalTree/.test(mat.name)) { mat = mat.clone(); mat.color.setRGB(1.0, 1.05, 0.7); }   // лето: выгоревшая листва
      if (((L.base || L.id) === "desert" || (L.base || L.id) === "volcano" || L.base === "desert" || L.base === "volcano") && /Grass|Leaves$|^Leaves/.test(mat.name) && !/Pine|Twisted|Normal/.test(mat.name)) { mat = mat.clone(); mat.color.setRGB(1.05, 0.88, 0.55); }   // сухая трава пустыни
      const im = new THREE.InstancedMesh(o.geometry, mat, list.length); im.castShadow = big; im.receiveShadow = true;
      const local = o.matrixWorld.clone(), mm = new THREE.Matrix4();
      list.forEach((it, i) => { mm.compose(new THREE.Vector3(it.x, Math.max(0, hAt(it.x, it.z) - 0.15), it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it.ry, 0)), new THREE.Vector3(it.s, it.s, it.s)); im.setMatrixAt(i, mm.multiply(local)); });
      world.add(im); W.inst.push(im);
    });
    // валуны — по габариту модели (с учётом поворота); плоские камни-тропинки (высота 10 см) не мешают ходить
    if (/Rock_Medium/.test(name)) list.forEach((it) => { if (Math.hypot(it.x, it.z) < D.MAP_R + 1) W.obstacles.push(...fpCircles(footprint(name, src), it.x, it.z, it.s, it.ry, 0.92)); });
  }
  // пальмы (оазис): ствол из сегментов + крона из агавы
  if (L.palms) {
    const trunkM = pbr("cedar", 1, { color: 0x9c7a55, roughness: 0.9 });
    const crowns = [];
    const allPalms = (W.palms || []);
    for (const p of allPalms) {
      const h = 3.2 * p.s, pts = []; const lean = (r() - 0.5) * 0.8;
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 1.4) * lean, t * h, 0)); }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.14 * p.s, 6, false); const tm = new THREE.Mesh(tg, trunkM), y0 = hAt(p.x, p.z) - 0.1; tm.position.set(p.x, y0, p.z); tm.rotation.y = r() * PI2; tm.castShadow = true; world.add(tm);
      const top = pts[6].clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), tm.rotation.y); crowns.push({ x: p.x + top.x, z: p.z + top.z, y: top.y + y0, s: p.s });
    }
    const crownSrc = A.nature.Plant_7_Big;
    if (crownSrc && crowns.length) crownSrc.traverse((o) => { if (!o.isMesh) return; const im = new THREE.InstancedMesh(o.geometry, palmLeaf(o.material), crowns.length); im.castShadow = true; const mm = new THREE.Matrix4(); crowns.forEach((c, i) => { mm.compose(new THREE.Vector3(c.x, c.y - 0.3, c.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * PI2, 0)), new THREE.Vector3(2.6 * c.s, 1.6 * c.s, 2.6 * c.s)); im.setMatrixAt(i, mm); }); world.add(im); });
  }
  // трава-травинки (дёшево, много)
  buildGrass(world, L, spots, lakeD, splatAt, W.gres);
  // погода
  W.weather = makeWeather(world, L.weather, L.heavy);
  return W;
}

// знамя на шесте: древко, перекладина, полотнище цвета команды (колышется на ветру), золотое навершие
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
  }
  const M = bannerMats[key];
  g.add(new THREE.Mesh(bannerGeo.pole, M.wood), new THREE.Mesh(bannerGeo.bar, M.wood), new THREE.Mesh(bannerGeo.tip, M.gold), new THREE.Mesh(bannerGeo.cloth, M.cloth));
  return g;
}

// крона пальмы из агавы Plant_7_Big: у модели лиловые листья — перекрашиваем в зелень пальмы (тон по яркости исходного цвета)
const palmMats = new Map();
export function palmLeaf(m) {
  if (palmMats.has(m)) return palmMats.get(m);
  const p = m.clone(), base = m.onBeforeCompile;
  p.onBeforeCompile = (sh, r) => { if (base) base(sh, r); sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n float pl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(0.07, 0.2, 0.05), vec3(0.42, 0.66, 0.2), clamp(pl * 2.2, 0.0, 1.0));"); };
  p.customProgramCacheKey = () => "palm" + (m.customProgramCacheKey ? m.customProgramCacheKey() : "");
  palmMats.set(m, p); return p;
}
// ---------- ресурсные узлы: инстансы целого и срубленного ----------
export function buildNodeViews(world, W) {
  const groups = {};
  W.nodes.forEach((nd) => { (groups[nd.model] = groups[nd.model] || []).push(nd); });
  W.resInst = {};
  for (const [model, list] of Object.entries(groups)) {
    const parts = [], stumps = [];
    const mk = (src, n, arr, tintF) => { src.updateMatrixWorld(true); src.traverse((o) => { if (!o.isMesh) return; let mat = o.material; if (tintF) mat = tintF(mat); const im = new THREE.InstancedMesh(o.geometry, mat, n); im.castShadow = true; im.receiveShadow = true; im.userData.local = o.matrixWorld.clone(); world.add(im); arr.push(im); }); };
    if (model === "palm") { /* пальмы-ресурсы рисуем как агаву на стволе — упрощённо куст */ mk(A.nature.Plant_7_Big, list.length, parts, palmLeaf); }
    else mk(A.nature[model], list.length, parts, (m) => { if (W.L.snowy && /Leaves|Leaf/.test(m.name)) { m = m.clone(); m.color.setRGB(0.85, 0.92, 1); } if (W.L.charred && /Bark/.test(m.name)) { m = m.clone(); m.color.setRGB(0.35, 0.3, 0.3); } if ((W.L.base || W.L.id) === "autumn" && /Leaves_Normal/.test(m.name)) { m = m.clone(); m.color.setRGB(1.2, 0.7, 0.35); } return m; });
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
  const cs = up ? sc * (nd.kind === "rock" ? 0.55 + 0.45 * nd.amt / D.RES.rock.amount : grow) : 0.0001;
  setInst(ri.full, nd.slot, nd.x - (nd.ox || 0) * cs, 0, nd.z - (nd.oz || 0) * cs, nd.ry, cs, sh, sh * 0.6);
  if (ri.cut.length) setInst(ri.cut, nd.slot, nd.x, 0, nd.z, nd.ry, up ? 0.0001 : s * 0.8, 0, 0);
  const changed = nd.shown !== up; nd.shown = up; return changed;
}

// ---------- травинки ----------
export const grassT = { value: 0 };
function buildGrass(world, L, spots, lakeD, splatAt, gres) {
  const count = (L.base || L.id) === "snow" ? 500 : (L.base || L.id) === "desert" ? 380 : (L.base || L.id) === "volcano" ? 300 : 1700;
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
  // кучки травы: центры там, где земля «дикая» (не тропа и не двор); внутри кучки плотность спадает к краю
  let cx = 0, cz = 0, left = 0, cl = 0, ch = 0;
  for (let i = 0; i < count * 8 && k < count; i++) {
    if (left <= 0) { const a = Math.random() * PI2, rr = Math.sqrt(Math.random()) * (D.MAP_R + 4); cx = Math.cos(a) * rr; cz = Math.sin(a) * rr; left = 6 + Math.floor(Math.random() * 16); cl = (Math.random() - 0.5) * 0.12; ch = (Math.random() - 0.5) * 0.04; }
    const a = Math.random() * PI2, rr = Math.pow(Math.random(), 0.65) * 1.5, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    left--;
    if (spots.some((p) => dist(x, z, p.x, p.z) < 5.0)) { left = 0; continue; }
    if (gres && gres.some((g) => dist(x, z, g.x, g.z) < 2.5)) continue;
    if (lakeD(x, z) < 0.3) continue;
    const sm = splatAt(x, z); if (sm[1] > 0.3 || sm[2] > 0.05) continue;
    m.compose(v.set(x, 0, z), q.setFromEuler(e.set(0, Math.random() * PI2, 0)), s.setScalar((0.7 + Math.random() * 0.8) * (1.15 - rr * 0.3)));
    im.setMatrixAt(k, m);
    if ((L.base || L.id) === "forest" && Math.random() < 0.04) col.set([0xffe066, 0xff9ecf, 0xffffff, 0xb08cff][Math.floor(Math.random() * 4)]);
    else col.setHSL(h0 + ch + (Math.random() - 0.5) * 0.03, s0, l0 + cl + Math.random() * 0.1);
    im.setColorAt(k, col); k++;
  }
  im.count = k; world.add(im);
}

// ---------- погода: снег, угли, листья, светлячки, пыль, пыльца ----------
export function makeWeather(world, kind, heavy) {
  const N = Math.round(({ snow: 700, embers: 260, leaves: 140, fireflies: 90, dust: 160, pollen: 120, rain: 900, petals: 160 }[kind] || 0) * (heavy || 1));
  if (!N) return null;
  const geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - 0.5) * 50; p[i * 3 + 1] = Math.random() * 14; p[i * 3 + 2] = (Math.random() - 0.5) * 50; ph[i] = Math.random() * 100; }
  geo.setAttribute("position", new THREE.BufferAttribute(p, 3)); geo.setAttribute("ph", new THREE.BufferAttribute(ph, 1));
  const C = { snow: [1, 1, 1], embers: [1.6, 0.6, 0.15], leaves: [0.95, 0.5, 0.15], fireflies: [1.0, 1.6, 0.4], dust: [1, 0.9, 0.7], pollen: [1, 1, 0.8], rain: [0.75, 0.85, 1.0], petals: [1.0, 0.72, 0.85] }[kind];
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: kind === "embers" || kind === "fireflies" ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { t: { value: 0 }, c: { value: new THREE.Vector3(...C) }, center: { value: new THREE.Vector3() }, scale: { value: 300 }, kind: { value: ["snow", "embers", "leaves", "fireflies", "dust", "pollen", "rain", "petals"].indexOf(kind) }, heavy: { value: heavy || 1 } },
    vertexShader: `attribute float ph; uniform float t, scale, kind, heavy; uniform vec3 center; varying float vA; varying float vPh;
      void main(){ vec3 p = position; float T = t + ph;
        if (kind < 0.5) { p.y = mod(p.y - t*1.4, 14.0); p.x += sin(T*0.9)*0.6; p.z += cos(T*0.7)*0.6; }
        else if (kind < 1.5) { p.y = mod(p.y + t*1.1, 14.0); p.x += sin(T*1.7)*0.5; }
        else if (kind < 2.5) { p.y = mod(p.y - t*0.9, 14.0); p.x += sin(T*1.3)*1.2; p.z += sin(T*0.8)*0.8; }
        else if (kind < 3.5) { p.y = 0.4 + mod(p.y, 2.5) + sin(T*0.9)*0.4; p.x += sin(T*0.5)*1.5; p.z += cos(T*0.6)*1.5; }
        else if (kind < 5.5) { p.y = mod(p.y + t*0.15, 6.0); p.x += sin(T*0.3)*2.0 + t*0.3 * heavy * heavy; }
        else if (kind < 6.5) { p.y = mod(p.y - t*16.0, 14.0); p.x += t*1.5; }
        else { p.y = mod(p.y - t*0.7, 14.0); p.x += sin(T*1.1)*1.4 + t*0.4; p.z += cos(T*0.9)*0.9; }
        p.x = center.x + mod(p.x - center.x + 25.0, 50.0) - 25.0; p.z = center.z + mod(p.z - center.z + 25.0, 50.0) - 25.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float sz = kind < 0.5 ? 0.13 : kind < 1.5 ? 0.09 : kind < 2.5 ? 0.18 : kind < 3.5 ? 0.12 : kind < 5.5 ? 0.06 * (heavy > 1.5 ? 1.8 : 1.0) : kind < 6.5 ? 0.22 : 0.16;
        gl_PointSize = sz * scale / -mv.z; vA = kind > 2.5 && kind < 3.5 ? 0.5 + 0.5*sin(T*3.0) : 1.0; vPh = ph; }`,
    fragmentShader: `uniform vec3 c; uniform float kind; varying float vA; varying float vPh;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.1, r) * vA;
        vec3 col = c; if (kind > 1.5 && kind < 2.5) { col = mix(vec3(0.95,0.45,0.1), vec3(0.85,0.2,0.1), fract(vPh)); a = step(r, 0.42); }
        if (kind > 5.5 && kind < 6.5) { a = (1.0 - smoothstep(0.02, 0.07, abs(d.x + d.y * 0.12))) * 0.55; }   // капли — тонкие штрихи
        if (kind > 6.5) { vec2 q = d * mat2(0.8, -0.6, 0.6, 0.8); a = step(length(q * vec2(1.0, 1.9)), 0.42); col = mix(vec3(1.0,0.75,0.86), vec3(1.0,0.93,0.97), fract(vPh * 3.0)); }   // лепестки
        gl_FragColor = vec4(col, a * (kind < 0.5 ? 0.9 : 0.85)); }`
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 7; world.add(pts);
  return { mat, pts, kind };
}
export function updateWorld(W, dt, cx, cz, H) {
  waterU.time.value += dt;
  if (W && W.weather) { W.weather.mat.uniforms.t.value += dt; W.weather.mat.uniforms.center.value.set(cx, 0, cz); W.weather.mat.uniforms.scale.value = H * 0.7; }
}
